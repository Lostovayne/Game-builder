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

runTranscriptStorageTests(
  () => {
    rows.clear()
    return gameTranscriptStorage
  },
  {
    api: { describe, it, expect },
  }
)
