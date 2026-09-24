"use server"

import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"
import { auth } from "@clerk/nextjs/server"

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
