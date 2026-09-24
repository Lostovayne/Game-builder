import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

import { getChatModel } from "@/lib/ai"
import { getGame, saveGameMessages } from "@/lib/games/queries"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = await req.json()
  const messages: UIMessage[] = body.messages
  const gameId: string | undefined = body.gameId

  if (!gameId || typeof gameId !== "string") {
    return new Response("Missing gameId", { status: 400 })
  }

  if (!Array.isArray(messages)) {
    return new Response("Missing messages", { status: 400 })
  }

  const game = await getGame(gameId)
  if (!game) {
    return new Response("Not found", { status: 404 })
  }

  const result = streamText({
    // Gemini via @ai-sdk/google — model id comes from GEMINI_CHAT_MODEL.
    // getChatModel() is the chat-optimized model (e.g. gemini-3.8-flash).
    model: getChatModel(),
    system: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
    // For Gemini 3, reasoning:"none" maps to thinkingLevel: minimal/low
    // (thinking cannot be fully disabled). For Gemini 2.5 it maps to
    // thinkingBudget: 0. Keeps latency minimal; see google-language-model.ts
    // resolveThinkingConfig(). Same setting as title generation.
    reasoning: "none",
  })

  const stream = toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    onFinish: async ({ messages: finishedMessages, isContinuation }) => {
      // Persist full thread (client sent messages + assistant response)
      // finishedMessages already contains the merged thread when originalMessages is provided.
      // Fallback to manual merge if not provided by SDK.
      const toPersist =
        finishedMessages && finishedMessages.length > 0 ? finishedMessages : messages
      // Only persist if at least the new assistant message exists; `isContinuation` means the last
      // assistant message was continued rather than a new one, but finishedMessages is still the full thread.
      void isContinuation
      try {
        await saveGameMessages(gameId, toPersist)
      } catch {
        // Persist failure must not break the stream; log silently.
      }
    },
  })

  return createUIMessageStreamResponse({
    stream,
  })
}
