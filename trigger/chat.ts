import { chat } from "@trigger.dev/sdk/ai"

import { getChatModel } from "@/lib/ai"
import { gameTranscriptStorage } from "@/lib/chat/store"

export const gameChat = chat.agent({
  id: "game-chat",
  storage: gameTranscriptStorage,
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: getChatModel(),
      system: "You are a helpful assistant.",
      messages,
      reasoning: "none",
      abortSignal: signal,
    }),
})
