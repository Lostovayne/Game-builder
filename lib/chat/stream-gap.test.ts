import { describe, expect, it } from "vitest"

import { isAwaitingNextChunk } from "./stream-gap"

describe("isAwaitingNextChunk", () => {
  it("is false when the message is not streaming", () => {
    expect(
      isAwaitingNextChunk(
        [{ type: "text", text: "hola", state: "done" }] as never,
        false
      )
    ).toBe(false)
  })

  it("is false while the first chunk has not arrived (no parts yet)", () => {
    expect(isAwaitingNextChunk([], true)).toBe(false)
  })

  it("is false while text is still streaming in", () => {
    expect(
      isAwaitingNextChunk(
        [{ type: "text", text: "hola", state: "streaming" }] as never,
        true
      )
    ).toBe(false)
  })

  it("is true when text finished and the model is between chunks", () => {
    expect(
      isAwaitingNextChunk(
        [{ type: "text", text: "hola", state: "done" }] as never,
        true
      )
    ).toBe(true)
  })

  it("is true after a tool call finished and no next part arrived", () => {
    expect(
      isAwaitingNextChunk(
        [
          {
            type: "tool-read_file",
            toolCallId: "1",
            state: "output-available",
            input: {},
            output: {},
          },
        ] as never,
        true
      )
    ).toBe(true)
  })

  it("is false while a tool call is still running", () => {
    expect(
      isAwaitingNextChunk(
        [
          {
            type: "tool-read_file",
            toolCallId: "1",
            state: "input-available",
            input: {},
          },
        ] as never,
        true
      )
    ).toBe(false)
  })

  it("is true when reasoning finished and nothing new streamed since", () => {
    expect(
      isAwaitingNextChunk(
        [{ type: "reasoning", text: "hmm", state: "done" }] as never,
        true
      )
    ).toBe(true)
  })
})
