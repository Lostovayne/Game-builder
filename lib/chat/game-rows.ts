import { eq } from "drizzle-orm"
import type { UIMessage } from "ai"

import { db } from "@/lib/db"
import { games } from "@/db/schema"

// Worker-safe row access for the game transcript. No Clerk import and no
// `server-only` marker here — the marker lives in `@/lib/db`, which the
// Trigger worker resolves to a stub via `build.conditions`. Tenancy is
// enforced upstream (server actions + page load); the worker only ever sees
// chatIds bound to sessions those actions created.

export type GameTranscriptRow = {
  messages: UIMessage[]
  transcriptState: unknown
  lastOutEventId: string | null
  lastInEventId: string | null
}

export async function readGameTranscriptRow(
  chatId: string
): Promise<GameTranscriptRow | null> {
  const rows = await db
    .select({
      messages: games.messages,
      transcriptState: games.transcriptState,
      lastOutEventId: games.lastEventId,
      lastInEventId: games.lastInEventId,
    })
    .from(games)
    .where(eq(games.id, chatId))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    messages: (row.messages ?? []) as UIMessage[],
    transcriptState: row.transcriptState ?? null,
    lastOutEventId: row.lastOutEventId,
    lastInEventId: row.lastInEventId,
  }
}

export async function writeGameTranscriptRow(
  chatId: string,
  row: GameTranscriptRow
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, chatId))
      .limit(1)

    if (existing.length === 0) {
      // Practically unreachable: sessions are only created for games the
      // start-session action asserted exist. Create-if-missing mirrors the
      // migration guide so a runtime write never silently drops.
      await tx.insert(games).values({
        id: chatId,
        orgId: "unknown",
        title: "Untitled conversation",
        messages: row.messages,
        transcriptState: row.transcriptState,
        lastEventId: row.lastOutEventId,
        lastInEventId: row.lastInEventId,
      })
      return
    }

    await tx
      .update(games)
      .set({
        messages: row.messages,
        transcriptState: row.transcriptState,
        lastEventId: row.lastOutEventId,
        lastInEventId: row.lastInEventId,
        updatedAt: new Date(),
      })
      .where(eq(games.id, chatId))
  })
}
