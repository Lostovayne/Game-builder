import { describe, expect, it } from "vitest"

import { parseAskPlayerPart } from "@/lib/games/ask-player"

const validInput = {
  dimension: "world",
  question: "What is the setting?",
  options: [
    { id: "deep-sea", label: "Deep sea", description: "Blue dark water" },
    { id: "orbit", label: "Derelict orbit", description: "A dead station" },
  ],
}

describe("parseAskPlayerPart", () => {
  it("extracts the tool call id and the validated input from a pending part", () => {
    const parsed = parseAskPlayerPart({
      type: "tool-ask_player",
      toolCallId: "call-1",
      input: validInput,
      state: "input-available",
    })

    expect(parsed).toEqual({ toolCallId: "call-1", input: validInput })
  })

  it("rejects anything that is not an ask_player tool part", () => {
    expect(parseAskPlayerPart({ type: "text", text: "hi" })).toBeNull()
    expect(parseAskPlayerPart(null)).toBeNull()
    expect(
      parseAskPlayerPart({
        type: "tool-ask_player",
        toolCallId: "",
        input: validInput,
      })
    ).toBeNull()
  })

  it("rejects input that violates the tool's schema", () => {
    // One option is below the two-option minimum the tool promises.
    expect(
      parseAskPlayerPart({
        type: "tool-ask_player",
        toolCallId: "call-2",
        input: { ...validInput, options: [validInput.options[0]] },
      })
    ).toBeNull()
    // Unknown dimension — outside the seven parts of a game.
    expect(
      parseAskPlayerPart({
        type: "tool-ask_player",
        toolCallId: "call-3",
        input: { ...validInput, dimension: "graphics" },
      })
    ).toBeNull()
  })
})
