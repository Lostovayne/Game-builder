import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PROGRESSIVE_STATUS_STEP_DELAYS_MS,
  progressiveStatusText,
  scheduleProgressiveStatusSteps,
} from "@/lib/chat/progressive-status"

describe("progressiveStatusText", () => {
  it("maps each step to its label", () => {
    expect(progressiveStatusText(0)).toBe("Estableciendo la conexión…")
    expect(progressiveStatusText(1)).toBe("Esperando al modelo…")
    expect(progressiveStatusText(2)).toBe("Conectado a Kimi K3…")
  })

  it("clamps out-of-range steps to the nearest known label", () => {
    expect(progressiveStatusText(-1)).toBe("Estableciendo la conexión…")
    expect(progressiveStatusText(9)).toBe("Conectado a Kimi K3…")
  })
})

describe("scheduleProgressiveStatusSteps", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("advances one step per scheduled delay and never earlier", () => {
    vi.useFakeTimers()
    const steps: number[] = []
    scheduleProgressiveStatusSteps((step) => steps.push(step))

    vi.advanceTimersByTime(PROGRESSIVE_STATUS_STEP_DELAYS_MS[0] - 1)
    expect(steps).toEqual([])

    vi.advanceTimersByTime(1)
    expect(steps).toEqual([1])

    vi.advanceTimersByTime(
      PROGRESSIVE_STATUS_STEP_DELAYS_MS[1] - PROGRESSIVE_STATUS_STEP_DELAYS_MS[0]
    )
    expect(steps).toEqual([1, 2])
  })

  it("cancels every pending step when the activation ends", () => {
    vi.useFakeTimers()
    const steps: number[] = []
    const cancel = scheduleProgressiveStatusSteps((step) => steps.push(step))

    cancel()
    vi.advanceTimersByTime(PROGRESSIVE_STATUS_STEP_DELAYS_MS[1])
    expect(steps).toEqual([])
  })

  it("keeps the documented 2s/6s schedule", () => {
    expect(PROGRESSIVE_STATUS_STEP_DELAYS_MS).toEqual([2000, 6000])
  })
})
