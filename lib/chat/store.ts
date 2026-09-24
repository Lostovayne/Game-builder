import { eq } from "drizzle-orm"
import type { UIMessage } from "ai"

import { db } from "@/lib/db"
import { games } from "@/db/schema"

export async function loadGameMessages(gameId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({ messages: games.messages })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  return (rows[0]?.messages ?? []) as UIMessage[]
}

export async function writeGameMessages(
  gameId: string,
  messages: UIMessage[]
): Promise<void> {
  await db
    .update(games)
    .set({ messages, updatedAt: new Date() })
    .where(eq(games.id, gameId))
}

export async function persistGameTurn(
  gameId: string,
  uiMessages: UIMessage[],
  lastEventId: string | undefined
): Promise<void> {
  await db
    .update(games)
    .set({
      messages: uiMessages,
      lastEventId: lastEventId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId))
}

// Re-export for worker tests/mocks if needed
export { db }
