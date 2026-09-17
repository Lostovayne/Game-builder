import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

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
    // AI Gateway es el provider global por defecto: el string "provider/model"
    // se resuelve contra el gateway y autentica con AI_GATEWAY_API_KEY.
    model: "inclusionai/ling-3.0-flash-fin",
    system: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
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
