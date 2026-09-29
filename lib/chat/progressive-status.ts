/**
 * Copy and timing for the progressive connection status shown while a chat
 * turn is being established.
 *
 * Kept free of React so the schedule and its labels can be tested in the
 * node-based Vitest environment this repo runs.
 */
export const PROGRESSIVE_STATUS_STEP_DELAYS_MS = [2000, 6000] as const

/** Label for a step: 0 = connecting, 1 = waiting for the model, 2 = connected. */
export function progressiveStatusText(step: number): string {
  if (step <= 0) return "Estableciendo la conexión…"
  if (step === 1) return "Esperando al modelo…"
  return "Conectado a Kimi K3…"
}

/**
 * Fire one step per scheduled delay (1-based) and return a cancel function that
 * clears every pending timer. Returning that function from a React effect makes
 * it the effect cleanup, so an activation that ends early never advances.
 */
export function scheduleProgressiveStatusSteps(
  onStep: (step: number) => void
): () => void {
  const handles = PROGRESSIVE_STATUS_STEP_DELAYS_MS.map((delayMs, index) =>
    setTimeout(() => onStep(index + 1), delayMs)
  )
  return () => {
    for (const handle of handles) {
      clearTimeout(handle)
    }
  }
}
