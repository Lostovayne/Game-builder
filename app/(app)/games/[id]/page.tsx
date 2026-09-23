import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import type { UIMessage } from "ai"

import { ChatThread } from "@/components/chat-thread"
import { getGame } from "@/lib/games/queries"

export default async function GamePage(props: PageProps<"/games/[id]">) {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  const { id } = await props.params

  const game = await getGame(id)

  if (!game) {
    notFound()
  }

  const initialMessages = (game.messages ?? []) as UIMessage[]

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <ChatThread gameId={game.id} initialMessages={initialMessages} />
    </div>
  )
}
