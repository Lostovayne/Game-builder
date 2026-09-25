import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { notFound } from "next/navigation"
import type { UIMessage } from "ai"

import { ChatThread } from "@/components/chat-thread"
import { getGame } from "@/lib/games/queries"

export default async function GamePage(props: {
  params: Promise<{ id: string }>
}) {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  const { id } = await props.params

  const game = await getGame(id)

  if (!game) {
    notFound()
  }

  const initialMessages = (game.messages ?? []) as UIMessage[]

  const initialSessions = game.lastEventId
    ? {
        [game.id]: {
          publicAccessToken: await triggerAuth.createPublicToken({
            scopes: {
              read: { sessions: game.id },
              write: { sessions: game.id },
            },
            expirationTime: "1h",
          }),
          lastEventId: game.lastEventId,
        },
      }
    : undefined

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <ChatThread
        gameId={game.id}
        initialMessages={initialMessages}
        initialSessions={initialSessions}
      />
    </div>
  )
}
