import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { pinThreeImportmap, THREE_PIN } from "./three-pin"

describe("THREE_PIN", () => {
  it("matches every three reference in the kit's index.html", () => {
    // Drift guard: the constant the file tools pin to must equal the import
    // map the kit actually ships. Bumping one without the other fails here
    // instead of blanking every game's preview.
    const html = readFileSync(
      new URL("./runtime/index.html", import.meta.url),
      "utf8"
    )
    const pins = html.match(/three@[\w.-]+/g) ?? []
    expect(pins.length).toBeGreaterThan(0)
    for (const pin of pins) {
      expect(pin).toBe(`three@${THREE_PIN}`)
    }
  })
})

describe("pinThreeImportmap", () => {
  it("rewrites a stale three version to the pin", () => {
    const html =
      '{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}'

    const result = pinThreeImportmap(html)

    expect(result).toContain(`three@${THREE_PIN}/build/three.module.js`)
    expect(result).toContain(`three@${THREE_PIN}/examples/jsm/`)
    expect(result).not.toContain("0.160.0")
  })

  it("rewrites a floating tag like latest", () => {
    expect(
      pinThreeImportmap("https://cdn.jsdelivr.net/npm/three@latest/x")
    ).toBe(`https://cdn.jsdelivr.net/npm/three@${THREE_PIN}/x`)
  })

  it("leaves an already-pinned file byte-identical", () => {
    const html = `https://cdn.jsdelivr.net/npm/three@${THREE_PIN}/build/three.module.js`

    expect(pinThreeImportmap(html)).toBe(html)
  })

  it("leaves content without three references untouched", () => {
    const html = '<canvas id="game"></canvas>\nimport * as THREE from "three"'

    expect(pinThreeImportmap(html)).toBe(html)
  })
})
