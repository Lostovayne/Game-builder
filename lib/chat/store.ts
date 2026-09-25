import type {
  TranscriptLoadOptions,
  TranscriptLoadResult,
  TranscriptScope,
  TranscriptStorage,
} from "@trigger.dev/sdk/ai"
import type { UIMessage } from "ai"

import {
  readGameTranscriptRow,
  writeGameTranscriptRow,
} from "@/lib/chat/game-rows"

// Document-style transcript storage over the `games` table, following the
// version-pinned migration guide
// (`node_modules/@trigger.dev/sdk/docs/ai-chat/migrating-from-hydrate-messages.mdx`).
// The runtime owns the transcript and calls `load` once per boot and `save`
// after every change; this module only maps between the changeset and the row.
//
// Deliberately no `loadContext`: the previous hook only persisted incoming
// messages and returned DB history, which `save` + `load` cover. No
// `nonFinalIds` either: this store keeps messages, not per-message final
// flags, which the contract explicitly permits. Cursors are persisted
// opaquely and never cleared: a save without cursors keeps the stored ones.
//
// `load` is generic over the caller's message subtype so it unifies with the
// `TranscriptStorage` contract; stored rows are base `UIMessage`s.
export const gameTranscriptStorage: TranscriptStorage = {
  async load<T extends UIMessage>(
    { chatId }: TranscriptScope,
    opts?: TranscriptLoadOptions
  ): Promise<TranscriptLoadResult<T>> {
    const row = await readGameTranscriptRow(chatId)
    if (!row) return { messages: [], state: null }

    let messages = row.messages
    if (opts?.before !== undefined) {
      const anchor = messages.findIndex((m) => m.id === opts.before)
      messages = anchor < 0 ? [] : messages.slice(0, anchor)
    }

    let nextCursor: string | undefined
    const limit = opts?.limit
    if (limit !== undefined && messages.length > limit) {
      nextCursor = messages[messages.length - limit]?.id
      messages = limit === 0 ? [] : messages.slice(-limit)
    }

    return {
      messages: messages as T[],
      state: row.transcriptState,
      cursors: {
        lastOutEventId: row.lastOutEventId ?? undefined,
        lastInEventId: row.lastInEventId ?? undefined,
      },
      nextCursor,
    }
  },

  async save({ chatId }, changeset) {
    const existing = await readGameTranscriptRow(chatId)
    const cursors = changeset.cursors
    await writeGameTranscriptRow(chatId, {
      messages: changeset.transcript.entries.map((entry) => entry.message),
      transcriptState: changeset.transcript.state,
      lastOutEventId:
        cursors?.lastOutEventId ?? existing?.lastOutEventId ?? null,
      lastInEventId: cursors?.lastInEventId ?? existing?.lastInEventId ?? null,
    })
  },
}
