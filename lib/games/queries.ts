import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, desc, eq } from "drizzle-orm"
import { cache } from "react"

import type { UIMessage } from "ai"

import { games } from "@/db/schema"
import { db } from "@/lib/db"

export const listGames = cache(async () => {
  const { orgId } = await auth()

  if (!orgId) {
    return []
  }

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
})

export const getGame = cache(async (id: string) => {
  const { orgId } = await auth()

  if (!orgId) {
    return null
  }

  const rows = await db
    .select({ id: games.id, title: games.title, messages: games.messages })
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  return rows[0] ?? null
})

export async function saveGameMessages(gameId: string, messages: UIMessage[]) {
  const { orgId } = await auth()

  if (!orgId) {
    return null
  }

  const rows = await db
    .update(games)
    .set({ messages, updatedAt: new Date() })
    .where(and(eq(games.id, gameId), eq(games.orgId, orgId)))
    .returning({ id: games.id })

  return rows[0] ?? null
}
