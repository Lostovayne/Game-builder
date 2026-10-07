import { chat } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"

// System prompt composed in lib/games/instructions: product workflow
// guidance first, Daytona runtime facts second, joined per section.
import { gameInstructions } from "@/lib/games/instructions"
import { getChatModel } from "@/lib/ai"
import { readGameTranscriptRow } from "@/lib/chat/game-rows"
import { shouldSeedHistory } from "@/lib/chat/seed"
import { gameTranscriptStorage } from "@/lib/chat/store"
import { gameTools } from "@/lib/games/tools"

// Steps one turn may take once tools are in play. The default stops after a
// single step, which would execute one tool call and never let the model see
// the result. 30 covers a real authoring turn — list, read a few files, write,
// verify by reading back, patch with replace_text — while still bounding a
// model that gets stuck re-reading. `maxTurns` on the agent stays the outer
// ceiling.
export const MAX_TURN_STEPS = 30

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
  // Declared on the agent, not only on `streamText`, so each tool's
  // `toModelOutput` is re-applied when prior-turn history is re-converted on
  // later turns. The per-turn function binds the set to this conversation's
  // game: `chatId` is the game id, and the tools resolve its sandbox from it.
  tools: ({ chatId }) => gameTools(chatId),
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
  // First message of a chat's lifetime. Provision the game's Daytona
  // sandbox here, before the run loop. `chatId` is the game id: the
  // transcript storage maps chats onto `games.id`. The helper is
  // idempotent — a game that already owns a sandbox is never re-provisioned
  // or reseeded, only resolved into its existing instance (the return value
  // is unused here; tools call `getGameSandbox` when they need a running one).
  onChatStart: async ({ chatId }) => {
    // Loaded dynamically: the helper drags the whole Daytona SDK and its DB
    // chain into every consumer of this module if imported statically. The
    // env check itself is lazy (`getDaytona()` validates on call), but the
    // hook only runs server-side in the worker, which resolves the
    // `react-server` condition and has DAYTONA_API_KEY available.
    const { createGameSandbox } = await import("@/lib/daytona/utils")
    await createGameSandbox(chatId)
  },
  run: async ({ messages, tools, signal, streamText }) => {
    assertTranscriptNotEmpty(messages)
    return streamText({
      model: getChatModel(),
      system: gameInstructions.join("\n\n"),
      messages,
      // The same set declared on the config, handed back typed — this is what
      // the model actually calls. Without `stopWhen` the loop stops after one
      // step, so a tool result would never reach the model.
      tools,
      stopWhen: stepCountIs(MAX_TURN_STEPS),
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
