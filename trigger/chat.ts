import { chat } from "@trigger.dev/sdk/ai"

import { getChatModel } from "@/lib/ai"
import { readGameTranscriptRow } from "@/lib/chat/game-rows"
import { shouldSeedHistory } from "@/lib/chat/seed"
import { gameTranscriptStorage } from "@/lib/chat/store"

// Pure, dependency-free precondition for the run loop: a turn can reach
// `run` with zero messages (e.g. a `regenerate-message` trigger with no
// incoming message after tail-trimming). Passing `[]` to the model throws
// `AI_InvalidPromptError` and the failed turn's `save()` would then persist
// the empty transcript over history, so fail fast with a user-safe message.
export function assertTranscriptNotEmpty<TMessage>(
  messages: readonly TMessage[]
): readonly TMessage[] {
  if (messages.length === 0) {
    throw new Error(
      "This conversation has no messages yet. Send a new message to start."
    )
  }
  return messages
}

export const gameChat = chat.agent({
  id: "game-chat",
  storage: gameTranscriptStorage,
  // Forward reasoning parts when the model emits them so the UI can render
  // live "thinking" instead of a dead empty view. With `reasoning: "none"`
  // below this is a no-op (no reasoning chunks exist) — it only activates
  // if thinking is ever re-enabled.
  uiMessageStreamOptions: {
    sendReasoning: true,
  },
  // Fresh runs skip the boot snapshot read (the runtime only restores
  // prior state on continuations/retries), so history seeded out-of-band
  // in our database is invisible to the accumulator on the first turn.
  // Inject it here via `chat.history.set`, which is documented to apply
  // from `onTurnStart`. The empty-check makes this a no-op for all later
  // turns, where the accumulator already holds the conversation.
  onTurnStart: async ({ chatId }) => {
    if (chat.history.all().length > 0) return
    const row = await readGameTranscriptRow(chatId)
    const seed = shouldSeedHistory([], row?.messages ?? [])
    if (seed) chat.history.set(seed)
  },
  run: async ({ messages, signal, streamText }) => {
    assertTranscriptNotEmpty(messages)
    return streamText({
      model: getChatModel(),
      system: "You are a helpful assistant.",
      messages,
      // Correct way to minimize thinking on Gemini 3 in AI SDK v5+:
      // `reasoning: "none"` disables the reasoning effort, and the explicit
      // minimal thinkingLevel + includeThoughts: false guarantees the
      // provider doesn't spend seconds on hidden thought before the first
      // text token (the TTFT gap the user perceives as "tarda muchísimo").
      // NOTE: with thinking off there is no chain-of-thought to display —
      // the "thinking" UI is status/stream feedback, not model reasoning.
      // To show real reasoning, switch to `reasoning: "low"` +
      // `includeThoughts: true` (slower first token, streamed thought).
      reasoning: "none",
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
        },
      },
      abortSignal: signal,
    })
  },
})
