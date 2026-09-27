export const RECOVERY_DELAYS_MS = [
  0, 1000, 2000, 3000, 5000, 8000, 13000, 21000,
] as const

export const RECOVERY_WINDOW_MS = RECOVERY_DELAYS_MS.reduce<number>(
  (total, delay) => total + delay,
  0
)

export function shouldRecoverTurn(input: {
  currentLastMessageId: string | undefined
  userId: string
  hasAssistantReply: boolean
  /**
   * The user deliberately cancelled this turn. A stop aborts the `.out`
   * reader (so no `turn-completed` arrives) while `useChat`'s `stop()` flips
   * status back to `ready` with no error — indistinguishable from a lost
   * turn. Recovery must refuse it, otherwise a cancelled turn ends in a
   * false "the reply never arrived" prompt. Required, not optional, so a new
   * call site cannot silently forget the guard.
   */
  stoppedByUser: boolean
}): boolean {
  if (input.stoppedByUser) return false
  return input.currentLastMessageId === input.userId && !input.hasAssistantReply
}
