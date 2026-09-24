import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"

import { getChatModel } from "@/lib/ai"
import {
  loadGameMessages,
  persistGameTurn,
  writeGameMessages,
} from "@/lib/chat/store"

export const gameChat = chat.agent({
  id: "game-chat",
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const stored = await loadGameMessages(chatId)

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await writeGameMessages(chatId, stored)
    }

    return stored
  },
  onTurnComplete: async ({ chatId, uiMessages, lastEventId }) => {
    await persistGameTurn(chatId, uiMessages, lastEventId)
  },
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: getChatModel(),
      system: "You are a helpful assistant.",
      messages,
      reasoning: "none",
      abortSignal: signal,
    }),
})
