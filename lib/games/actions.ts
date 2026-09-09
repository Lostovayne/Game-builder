"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { games } from "@/db/schema"
import { db } from "@/lib/db"

export async function createGame(input: { title: string }) {
  const { orgId } = await auth()

  if (!orgId) {
    throw new Error("Select an organization before creating a game.")
  }

  const title = input.title.trim()
  if (!title) {
    throw new Error("Game title must not be empty.")
  }

  const [game] = await db
    .insert(games)
    .values({ orgId, title: title.slice(0, 120) })
    .returning({ id: games.id, title: games.title })

  revalidatePath("/")

  return game
}
