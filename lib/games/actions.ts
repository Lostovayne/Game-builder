"use server"

import { auth } from "@clerk/nextjs/server"
import { generateText } from "ai"
import { revalidatePath } from "next/cache"

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
    model: "inclusionai/ling-3.0-flash-fin",
    prompt: `Generate a short, catchy video game title (at most 6 words) for a game described by this request: "${prompt}". Answer with the title only, without quotes or extra text.`,
    maxOutputTokens: 60,
    reasoning: "none",
  })

  const title = generated.trim().replace(/^["'“”]+|["'“”]+$/g, "") || prompt

  const [game] = await db
    .insert(games)
    .values({ orgId, title: title.slice(0, 120) })
    .returning({ id: games.id, title: games.title })

  revalidatePath("/")

  return game
}
