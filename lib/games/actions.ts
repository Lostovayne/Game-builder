"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { generateId, generateText } from "ai"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { getTitleModel } from "@/lib/ai"
import { games } from "@/db/schema"
import { db } from "@/lib/db"

function toProvisionalTitle(prompt: string): string {
  // Instant, zero-LLM fallback so the redirect never waits on generation.
  const singleLine = prompt.replace(/\s+/g, " ").trim()
  if (singleLine.length <= 60) return singleLine || "Untitled game"
  return `${singleLine.slice(0, 57).trimEnd()}…`
}

export async function createGame(input: { title: string }) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("Select an organization before creating a game.")
  }

  const prompt = input.title.trim()
  if (!prompt) {
    throw new Error("Game title must not be empty.")
  }

  // Fast path: insert immediately with a provisional title so
  // `router.push(/games/id)` fires without waiting on the LLM.
  // The catchy title is refined in `after()` without blocking the response.
  const provisionalTitle = toProvisionalTitle(prompt).slice(0, 120)

  const [game] = await db
    .insert(games)
    .values({
      orgId,
      title: provisionalTitle,
      messages: [
        {
          id: generateId(),
          role: "user",
          parts: [{ type: "text", text: prompt }],
        },
      ],
    })
    .returning({ id: games.id, title: games.title })

  if (!game) {
    throw new Error("Could not create game.")
  }

  // Background refinement: never blocks the redirect. Failures keep the
  // provisional title — the sidebar stays correct, just less catchy.
  after(async () => {
    try {
      const { text: generated } = await generateText({
        // Gemini via @ai-sdk/google — title-optimized model (e.g. gemini-3.5-flash-lite).
        model: getTitleModel(),
        prompt: `Generate a short, catchy video game title (at most 6 words) for a game described by this request: "${prompt}". Answer with the title only, without quotes or extra text.`,
        maxOutputTokens: 60,
        // Correct way to kill thinking on Gemini 3 in AI SDK v5+:
        // `reasoning: "none"` + explicit minimal thinkingLevel.
        reasoning: "none",
        providerOptions: {
          google: {
            thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
          },
        },
      })

      const refined =
        generated.trim().replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 120) ||
        provisionalTitle

      if (refined !== provisionalTitle) {
        await db
          .update(games)
          .set({ title: refined })
          .where(eq(games.id, game.id))
        revalidatePath("/", "layout")
      }
    } catch (err) {
      console.error("[createGame] background title refinement failed", err)
    }
  })

  revalidatePath("/", "layout")

  return game
}
