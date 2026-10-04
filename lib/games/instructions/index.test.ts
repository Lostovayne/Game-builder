import { describe, expect, it } from "vitest"

import { gameTools } from "@/lib/games/tools"

import { gameInstructions } from "./index"
import { runtime } from "./runtime"
import { workflow } from "./workflow"

describe("gameInstructions", () => {
  it("is non-empty", () => {
    expect(gameInstructions.length).toBeGreaterThan(0)
  })

  it("composes the workflow first, then the runtime", () => {
    expect(gameInstructions).toEqual([workflow, runtime])
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

describe("workflow tool references", () => {
  // Tool names are the bullets in "# Your tools" ("- list_files — ..."), and
  // only those: the parts-of-a-game bullets use the same shape but are not
  // tools. A bullet for a tool that does not exist sends the model into a call
  // that fails, and a tool nobody documents is a tool nobody calls.
  const [, afterHeading = ""] = workflow.split("# Your tools")
  const [toolsSection = ""] = afterHeading.split("\n# ")
  const bulletTools = [...toolsSection.matchAll(/^- ([a-z_]+) —/gm)].map(
    (match) => match[1]
  )

  it("documents only tools that gameTools actually defines", () => {
    const defined = new Set(Object.keys(gameTools("game-1")))

    expect(bulletTools.length).toBeGreaterThan(0)
    for (const name of bulletTools) {
      expect(defined.has(name), `workflow documents ${name}`).toBe(true)
    }
  })

  it("documents every tool gameTools defines", () => {
    for (const name of Object.keys(gameTools("game-1"))) {
      expect(bulletTools, `gameTools defines ${name}`).toContain(name)
    }
  })
})
