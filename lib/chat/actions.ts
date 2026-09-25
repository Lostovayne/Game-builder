"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"
import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"

import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof gameChat>("game-chat")

export async function startGameSession(
  params: ChatStartSessionParams<typeof gameChat>
) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const game = await getGame(params.chatId)
  if (!game) throw new Error("Not found")

  return start(params)
}

/**
 * Fresh server-side messages for client recovery. When a turn completes
 * server-side (transcript saved) but the client's `.out` stream closed
 * empty, the UI would otherwise show nothing until a manual reload — this
 * lets the thread pull the persisted reply and merge it via `setMessages`.
 * Auth- and tenancy-checked through `getGame` (org-scoped).
 */
export async function getGameMessages(chatId: string): Promise<UIMessage[]> {
  const game = await getGame(chatId)
  if (!game) throw new Error("Not found")
  return (game.messages ?? []) as UIMessage[]
}

export async function mintGameAccessToken(chatId: string): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const game = await getGame(chatId)
  if (!game) throw new Error("Not found")

  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}
