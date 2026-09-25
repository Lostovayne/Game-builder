import { describe, expect, it, vi } from "vitest"

import { runTranscriptStorageTests } from "@trigger.dev/sdk/ai/test"

import type { GameTranscriptRow } from "@/lib/chat/game-rows"

// In-memory stand-in for the games table. The row layer is mocked so this
// suite runs offline: no `server-only` chain, no env validation, no Neon
// writes. Real SQL is proven by typecheck + worker boot + a live turn.
const rows = vi.hoisted(() => new Map<string, GameTranscriptRow>())

vi.mock("@/lib/chat/game-rows", () => ({
  readGameTranscriptRow: async (chatId: string) => rows.get(chatId) ?? null,
  writeGameTranscriptRow: async (chatId: string, row: GameTranscriptRow) => {
    rows.set(chatId, row)
  },
}))

import { gameTranscriptStorage } from "@/lib/chat/store"

// The run guard in `@/trigger/chat` is a pure helper with zero SDK imports
// of its own, but its module also defines the agent (managed SDK + server-only
// `@/lib/ai` chain). Mock the model factory so importing just the helper
// binding stays offline like the rest of this suite.
vi.mock("@/lib/ai", () => ({
  getChatModel: () => ({ modelId: "mock-chat-model" }),
}))

import type {
  TranscriptChangeset,
  TranscriptStorageContext,
} from "@trigger.dev/sdk/ai"
import type { UIMessage } from "ai"

import { assertTranscriptNotEmpty } from "@/trigger/chat"

runTranscriptStorageTests(
  () => {
    rows.clear()
    return gameTranscriptStorage
  },
  {
    api: { describe, it, expect },
  }
)

function userMessage(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] } as UIMessage
}

function changesetWith(
  messages: UIMessage[],
  cursors?: TranscriptChangeset["cursors"]
): TranscriptChangeset {
  return {
    reason: "turn-complete",
    changes: [],
    transcript: {
      entries: messages.map((message) => ({
        id: message.id,
        final: true,
        message,
      })),
      state: null,
    },
    cursors,
  }
}

function saveContext(chatId: string): TranscriptStorageContext {
  return { chatId } as TranscriptStorageContext
}

describe("empty-transcript data-loss guards", () => {
  it("save with an empty transcript over a seeded non-empty row preserves messages and updates cursors", async () => {
    rows.clear()
    const chatId = "guard-preserves-history"
    const seeded = [userMessage("m1", "hello")]
    await gameTranscriptStorage.save(
      saveContext(chatId),
      changesetWith(seeded, { lastOutEventId: "out-1" })
    )

    await gameTranscriptStorage.save(
      saveContext(chatId),
      changesetWith([], { lastOutEventId: "out-2", lastInEventId: "in-2" })
    )

    const loaded = await gameTranscriptStorage.load({ chatId, clientData: null })
    expect(loaded.messages).toEqual(seeded)
    expect(loaded.cursors?.lastOutEventId).toBe("out-2")
    expect(loaded.cursors?.lastInEventId).toBe("in-2")
  })

  it("save with an empty transcript and no existing row writes empty without throwing", async () => {
    rows.clear()
    const chatId = "guard-first-save-empty"
    await gameTranscriptStorage.save(saveContext(chatId), changesetWith([]))

    const loaded = await gameTranscriptStorage.load({ chatId, clientData: null })
    expect(loaded.messages).toEqual([])
  })

  it("assertTranscriptNotEmpty throws on [] and passes non-empty through unchanged", () => {
    expect(() => assertTranscriptNotEmpty([])).toThrow(
      "This conversation has no messages yet. Send a new message to start."
    )
    const messages = [userMessage("m1", "hello")]
    expect(assertTranscriptNotEmpty(messages)).toBe(messages)
  })
})
