import { describe, expect, it } from "vitest"

import { formatCredits } from "./format"

describe("formatCredits", () => {
  it("renders whole dollars with two decimals", () => {
    expect(formatCredits(1_000_000_000n)).toBe("$1.00")
    expect(formatCredits(10_000_000_000n)).toBe("$10.00")
  })

  it("renders the free starting balance exactly", () => {
    expect(formatCredits(1_000_000_000n)).toBe("$1.00")
  })

  it("renders fractional dollars", () => {
    expect(formatCredits(8_800_000_000n)).toBe("$8.80")
    expect(formatCredits(8_808_808_808n)).toBe("$8.81")
  })

  it("renders zero", () => {
    expect(formatCredits(0n)).toBe("$0.00")
  })

  it("renders negative balances with the sign before the dollar", () => {
    expect(formatCredits(-500_000_000n)).toBe("-$0.50")
  })

  it("rounds half up to the nearest cent", () => {
    expect(formatCredits(1_005_000_000n)).toBe("$1.01")
    expect(formatCredits(1_004_999_999n)).toBe("$1.00")
    // A hair below zero rounds to exactly zero, not to negative zero.
    expect(formatCredits(-4_999_999n)).toBe("$0.00")
  })

  it("groups thousands", () => {
    expect(formatCredits(10_000_000_000_000n)).toBe("$10,000.00")
  })
})
