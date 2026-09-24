"use server"

import { auth } from "@clerk/nextjs/server"
import { generateId, generateText } from "ai"
import { revalidatePath } from "next/cache"

import { getTitleModel } from "@/lib/ai"
import { games } from "@/db/schema"
import { db } from "@/lib/db"

export async function createGame(input: { title: string }) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("Select an organization before creating a game.")
  }

  const prompt = input.title.trim()
  if (!prompt) {
    throw new Error("Game title must not be empty.")
  }

  const { text: generated } = await generateText({
    // Gemini via @ai-sdk/google — title-optimized model (e.g. gemini-3.5-flash-lite).
    model: getTitleModel(),
    prompt: `Generate a short, catchy video game title (at most 6 words) for a game described by this request: "${prompt}". Answer with the title only, without quotes or extra text.`,
    maxOutputTokens: 60,
    // For Gemini 3 → thinkingLevel minimal/low; for Gemini 2.5 → thinkingBudget 0.
    // Minimizes latency for this short generation; see resolveThinkingConfig().
    reasoning: "none",
  })

  const title = generated.trim().replace(/^["'“”]+|["'“”]+$/g, "") || prompt

  const [game] = await db
    .insert(games)
    .values({
      orgId,
      title: title.slice(0, 120),
      messages: [
        {
          id: generateId(),
          role: "user",
          parts: [{ type: "text", text: prompt }],
        },
      ],
    })
    .returning({ id: games.id, title: games.title })

  revalidatePath("/", "layout")

  return game
}
