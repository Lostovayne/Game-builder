import { describe, expect, it } from "vitest"

import {
  RECOVERY_DELAYS_MS,
  RECOVERY_WINDOW_MS,
  shouldRecoverTurn,
} from "@/lib/chat/recovery"

describe("chat recovery policy", () => {
  it("keeps polling through delayed persistence", () => {
    expect(RECOVERY_DELAYS_MS).toEqual([0, 1000, 2000, 3000, 5000, 8000, 13000, 21000])
    expect(RECOVERY_WINDOW_MS).toBe(53000)
    expect(
      shouldRecoverTurn({
        currentLastMessageId: "user-1",
        userId: "user-1",
        hasAssistantReply: false,
      })
    ).toBe(true)
  })

  it("stops when the assistant reply has already arrived", () => {
    expect(
      shouldRecoverTurn({
        currentLastMessageId: "user-1",
        userId: "user-1",
        hasAssistantReply: true,
      })
    ).toBe(false)
  })

  it("stops when a newer turn owns the conversation", () => {
    expect(
      shouldRecoverTurn({
        currentLastMessageId: "user-2",
        userId: "user-1",
        hasAssistantReply: false,
      })
    ).toBe(false)
  })
})
