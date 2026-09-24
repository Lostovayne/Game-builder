import { describe, expect, it } from "vitest"

import { suggestionRows } from "@/lib/games/suggestions"

describe("suggestionRows", () => {
  it("is a non-empty array of rows", () => {
    expect(Array.isArray(suggestionRows)).toBe(true)
    expect(suggestionRows.length).toBeGreaterThan(0)
    for (const row of suggestionRows) {
      expect(Array.isArray(row)).toBe(true)
      expect(row.length).toBeGreaterThan(0)
    }
  })

  it("contains suggestions with non-empty labels and icons", () => {
    const all = suggestionRows.flat()
    expect(all.length).toBeGreaterThan(0)
    for (const suggestion of all) {
      expect(typeof suggestion.label).toBe("string")
      expect(suggestion.label.trim().length).toBeGreaterThan(0)
      expect(suggestion.icon).toBeDefined()
      // lucide icons are React components (function or object with $$typeof)
      expect(
        typeof suggestion.icon === "function" ||
          typeof suggestion.icon === "object",
      ).toBe(true)
    }
  })

  it("has unique labels", () => {
    const labels = suggestionRows.flat().map((s) => s.label)
    const unique = new Set(labels)
    expect(unique.size).toBe(labels.length)
  })
})
