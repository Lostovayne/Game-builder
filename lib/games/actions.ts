"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { generateId, generateText } from "ai"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { getTitleModel } from "@/lib/ai"
import { games } from "@/db/schema"
import { db } from "@/lib/db"
import { provisionalTitleFromPrompt } from "@/lib/games/title-refresh"

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
  const provisionalTitle = provisionalTitleFromPrompt(prompt)

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
            thinkingConfig: {
              thinkingLevel: "minimal",
              includeThoughts: false,
            },
          },
        },
      })

      const refined =
        generated
          .trim()
          .replace(/^["'“”]+|["'“”]+$/g, "")
          .slice(0, 120) || provisionalTitle

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

/**
 * Minimal read used by the mounted game page to detect that the
 * asynchronous title refinement (see the `after()` block in `createGame`)
 * has landed.
 *
 * Org-scoped through the current Clerk session, and returns only the title
 * string so the seeded prompt and transcript never cross the client boundary
 * through this polling path. Selects the title column only because this may
 * be called repeatedly while a newly-created title is being generated.
 */
export async function getGameTitle(id: string): Promise<string | null> {
  const { orgId } = await auth()
  if (!orgId) return null

  const rows = await db
    .select({ title: games.title })
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  return rows[0]?.title ?? null
}
