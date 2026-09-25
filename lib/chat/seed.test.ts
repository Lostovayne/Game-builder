import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"

import { shouldSeedHistory } from "@/lib/chat/seed"

function makeMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  } as UIMessage
}

describe("shouldSeedHistory", () => {
  it("returns an equal copy of stored when history is empty and stored is non-empty", () => {
    const stored = [makeMessage("m1", "hello")]
    const result = shouldSeedHistory([], stored)
    expect(result).not.toBeNull()
    expect(result).toEqual(stored)
  })

  it("returns null when history is non-empty even with stored present", () => {
    const history = [makeMessage("m1", "hello")]
    const stored = [makeMessage("m1", "hello"), makeMessage("m2", "world")]
    expect(shouldSeedHistory(history, stored)).toBeNull()
  })

  it("returns null when history is empty and stored is empty", () => {
    expect(shouldSeedHistory([], [])).toBeNull()
  })

  it("does not mutate its inputs", () => {
    const history: UIMessage[] = []
    const stored = [makeMessage("m1", "hello")]
    const historySnapshot = [...history]
    const storedSnapshot = structuredClone(stored)
    shouldSeedHistory(history, stored)
    expect(history).toEqual(historySnapshot)
    expect(stored).toEqual(storedSnapshot)
  })
})
