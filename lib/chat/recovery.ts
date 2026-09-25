export const RECOVERY_DELAYS_MS = [0, 1000, 2000, 3000, 5000, 8000, 13000, 21000] as const

export const RECOVERY_WINDOW_MS = RECOVERY_DELAYS_MS.reduce<number>(
  (total, delay) => total + delay,
  0
)

export function shouldRecoverTurn(input: {
  currentLastMessageId: string | undefined
  userId: string
  hasAssistantReply: boolean
}): boolean {
  return (
    input.currentLastMessageId === input.userId && !input.hasAssistantReply
  )
}
