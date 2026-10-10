// Unit tests for the pure, dependency-free core of the seeded game runtime.
//
// `lib/games/runtime/engine/*` is plain browser ESM shipped into every sandbox,
// so it cannot be unit tested with a DOM or a WebGL context — those get the
// browser smoke test instead (see odd/tasks/game-engine-kit.md, S7). This file
// covers the one module that is genuinely pure: math.js imports nothing.

import { describe, expect, it } from "vitest"

import {
  clamp,
  createRng,
  degToRad,
  damp,
  ease,
  easings,
  invLerp,
  lerp,
  mapLinear,
  moveTowards,
  radToDeg,
  smoothstep,
  angleDelta,
  angleLerp,
  wrap,
} from "./runtime/engine/math.js"

describe("clamp", () => {
  it("bounds a value on both sides and passes the middle through", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe("lerp / invLerp / mapLinear", () => {
  it("interpolates and inverts over the same range", () => {
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
    expect(lerp(0, 10, 0.25)).toBe(2.5)
    expect(invLerp(0, 10, 2.5)).toBeCloseTo(0.25)
  })

  it("round-trips lerp through invLerp", () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.77, 1]) {
      expect(invLerp(0, 10, lerp(0, 10, t))).toBeCloseTo(t)
    }
  })

  it("maps between unrelated ranges", () => {
    expect(mapLinear(5, 0, 10, 100, 200)).toBe(150)
    expect(mapLinear(10, 0, 10, 100, 200)).toBe(200)
    expect(mapLinear(0, 0, 10, 100, 200)).toBe(100)
  })
})

describe("damp", () => {
  // Frame-rate independence: taking two half-steps must land where one full
  // step lands, or movement speed changes with the display refresh rate.
  it("reaches the same value in two half-steps as in one full step", () => {
    const a = 100
    const b = 0
    const lambda = 4
    const dt = 0.1

    const half = damp(damp(a, b, lambda, dt / 2), b, lambda, dt / 2)
    const full = damp(a, b, lambda, dt)

    expect(half).toBeCloseTo(full, 9)
  })

  it("approaches the target without overshooting it", () => {
    let value = 0
    for (let i = 0; i < 200; i++) value = damp(value, 10, 6, 1 / 60)

    expect(value).toBeLessThanOrEqual(10)
    expect(value).toBeGreaterThan(9.99)
  })
})

describe("moveTowards", () => {
  it("steps at most maxDelta and never overshoots", () => {
    expect(moveTowards(0, 10, 3)).toBe(3)
    expect(moveTowards(0, 10, 30)).toBe(10)
    expect(moveTowards(10, 0, 4)).toBe(6)
  })
})

describe("wrap", () => {
  it("wraps above the range back to the start", () => {
    expect(wrap(7, 0, 6)).toBe(1)
    expect(wrap(6, 0, 6)).toBe(0)
  })

  it("wraps below the range up to the end", () => {
    expect(wrap(-1, 0, 6)).toBe(5)
    expect(wrap(-7, 0, 6)).toBe(5)
  })
})

describe("smoothstep", () => {
  it("is 0 at the low edge, 1 at the high edge, 0.5 in the middle", () => {
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
  })

  it("saturates outside the range", () => {
    expect(smoothstep(0, 1, -5)).toBe(0)
    expect(smoothstep(0, 1, 5)).toBe(1)
  })
})

describe("angle helpers", () => {
  it("converts degrees and radians both ways", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI)
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90)
    expect(radToDeg(degToRad(37))).toBeCloseTo(37)
  })

  it("angleDelta always takes the shortest signed path", () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2)
    expect(Math.abs(angleDelta(0, Math.PI))).toBeCloseTo(Math.PI)
    // Across the -PI/PI seam the naive difference is ~6.08; the short way is ~0.2.
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 3)
    expect(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1))).toBeLessThan(
      Math.PI
    )
  })

  it("angleLerp stays on the short arc", () => {
    expect(angleLerp(0, Math.PI, 0)).toBeCloseTo(0)
    expect(angleLerp(0, Math.PI, 1)).toBeCloseTo(Math.PI)
    expect(angleLerp(Math.PI - 0.1, -Math.PI + 0.1, 1)).toBeCloseTo(
      -Math.PI + 0.1
    )
  })
})

describe("easings", () => {
  // The frozen catalogue the feature contract publishes to the game agent.
  const names = [
    "linear",
    "quadIn",
    "quadOut",
    "quadInOut",
    "cubicIn",
    "cubicOut",
    "cubicInOut",
    "sineInOut",
    "expoOut",
    "circOut",
    "backOut",
    "elasticOut",
    "bounceOut",
  ]

  it("publishes every documented easing", () => {
    for (const name of names) {
      expect(typeof easings[name], name).toBe("function")
    }
  })

  it("maps 0 to 0 and 1 to 1 for the eased set that starts and ends settled", () => {
    // backOut/elasticOut/bounceOut do not sit at 0 in the middle, but every
    // easing still has to begin at 0 and finish at 1 or tweens visibly jump.
    const startsAtZero = names.filter((n) => n !== "linear")
    expect(easings.linear(0)).toBe(0)
    expect(easings.linear(1)).toBe(1)
    for (const name of startsAtZero) {
      expect(easings[name](0), `${name}(0)`).toBeCloseTo(0, 5)
      expect(easings[name](1), `${name}(1)`).toBeCloseTo(1, 5)
    }
  })

  it("is monotonic for the monotonic easings", () => {
    const monotonic = [
      "linear",
      "quadIn",
      "quadOut",
      "quadInOut",
      "cubicIn",
      "cubicOut",
      "cubicInOut",
      "sineInOut",
      "expoOut",
      "circOut",
    ]
    for (const name of monotonic) {
      let previous = -Infinity
      for (let i = 0; i <= 40; i++) {
        const value = easings[name](i / 40)
        expect(value, `${name} at ${i / 40}`).toBeGreaterThanOrEqual(previous)
        previous = value
      }
    }
  })
})

describe("ease", () => {
  it("clamps t into [0, 1] so an over-running tween cannot extrapolate", () => {
    expect(ease("quadOut", -3)).toBe(easings.quadOut(0))
    expect(ease("quadOut", 7)).toBe(easings.quadOut(1))
  })

  it("resolves a documented easing by name", () => {
    expect(ease("linear", 0.5)).toBe(0.5)
    expect(ease("bounceOut", 1)).toBeCloseTo(1, 5)
  })

  it("throws on an unknown easing instead of silently animating wrong", () => {
    expect(() => ease("quadraticOut", 0.5)).toThrow(/quadraticOut/)
  })
})

describe("createRng", () => {
  it("produces the same sequence for the same numeric seed", () => {
    const a = createRng(1234)
    const b = createRng(1234)
    const first = Array.from({ length: 12 }, () => a.float(0, 1))
    const second = Array.from({ length: 12 }, () => b.float(0, 1))

    expect(first).toEqual(second)
  })

  it("accepts a string seed and still reproduces", () => {
    const a = createRng("level-3")
    const b = createRng("level-3")
    expect(Array.from({ length: 8 }, () => a.int(0, 100))).toEqual(
      Array.from({ length: 8 }, () => b.int(0, 100))
    )
  })

  it("keeps int and float inside their bounds", () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const value = rng.int(3, 9)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(9)

      const real = rng.float(-2, 5)
      expect(real).toBeGreaterThanOrEqual(-2)
      expect(real).toBeLessThan(5)
    }
  })

  it("picks from an array without inventing members", () => {
    const rng = createRng(11)
    const options = ["a", "b", "c"]
    for (let i = 0; i < 50; i++) {
      expect(options).toContain(rng.pick(options))
    }
  })

  it("returns a boolean from bool", () => {
    const rng = createRng(2)
    for (let i = 0; i < 20; i++) {
      expect(typeof rng.bool()).toBe("boolean")
    }
  })

  it("shuffles a copy and leaves the input untouched", () => {
    const rng = createRng(3)
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const output = rng.shuffle(input)

    expect(output).not.toBe(input)
    expect([...output].sort((x, y) => x - y)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
