import { describe, expect, it } from "vitest"

import { gameInstructions } from "./index"
import { runtimeInstructions } from "./runtime"
import { workflowInstructions } from "./workflow"

describe("gameInstructions", () => {
  it("is non-empty", () => {
    expect(gameInstructions.length).toBeGreaterThan(0)
  })

  it("composes workflow sections first, then runtime sections", () => {
    expect(gameInstructions).toEqual([
      ...workflowInstructions,
      ...runtimeInstructions,
    ])
  })

  it("has every element as a non-empty trimmed string", () => {
    for (const section of gameInstructions) {
      expect(typeof section).toBe("string")
      expect(section.trim().length).toBeGreaterThan(0)
      expect(section).toBe(section.trim())
    }
  })

  it("grounds the runtime in the real Daytona game directory and preview port", () => {
    const text = gameInstructions.join("\n\n")
    expect(text).toContain("/home/daytona/game")
    expect(text).toContain("8000")
  })
})
