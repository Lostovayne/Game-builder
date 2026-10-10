import { describe, expect, it } from "vitest"

import { gameTools } from "@/lib/games/tools"

import { gameInstructions } from "./index"
import { engine } from "./engine"
import { runtime } from "./runtime"
import { workflow } from "./workflow"

describe("gameInstructions", () => {
  it("is non-empty", () => {
    expect(gameInstructions.length).toBeGreaterThan(0)
  })

  it("composes the workflow first, then the runtime, then the kit", () => {
    expect(gameInstructions).toEqual([workflow, runtime, engine])
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

describe("engine catalogue", () => {
  // The catalogue is what tells the game agent the kit exists. Every system
  // module it promises must actually ship in `lib/games/runtime/engine/`, and
  // the two statements the kit made false in `runtime` must be gone.
  const systemModules = [
    "engine.js",
    "controls.js",
    "hud.js",
    "audio.js",
    "models.js",
    "textures.js",
    "materials.js",
    "lighting.js",
    "particles.js",
    "animation.js",
    "physics.js",
    "camera.js",
    "math.js",
  ]

  it("names every module the runtime ships", () => {
    for (const name of systemModules) {
      expect(engine, `catalogue mentions ${name}`).toContain(name)
    }
  })

  it("leads with the barrel, the only import path we document", () => {
    expect(engine).toContain("engine/index.js")
    expect(engine).toContain("createGame")
  })

  it("no longer claims the sandbox starts empty", () => {
    const text = gameInstructions.join("\n\n")
    expect(text).not.toContain("A new sandbox starts with one file")
    expect(text).not.toContain("There is no starter code")
    expect(text).not.toContain("Nothing is preloaded")
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
