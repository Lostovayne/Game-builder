import { auth } from "@clerk/nextjs/server"

import { ChatThread } from "@/components/chat-thread"

export default async function GamePage(props: PageProps<"/games/[id]">) {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  await props.params

  return (
    <div className="flex h-full min-h-svh flex-col">
      <ChatThread />
    </div>
  )
}
