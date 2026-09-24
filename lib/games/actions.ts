"use server"

import { auth } from "@clerk/nextjs/server"
import { generateId, generateText } from "ai"
import { revalidatePath } from "next/cache"

import { getModel } from "@/lib/ai"
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
    // Same provider/model source as the chat responder (lib/ai.ts).
    model: getModel(),
    prompt: `Generate a short, catchy video game title (at most 6 words) for a game described by this request: "${prompt}". Answer with the title only, without quotes or extra text.`,
    maxOutputTokens: 60,
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
