import { auth } from "@clerk/nextjs/server"

import { ChatThread } from "@/components/chat-thread"

export default async function GamePage(props: PageProps<"/games/[id]">) {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  await props.params

  // Creation prompt forwarded by the landing page (?message=...).
  // Plain string => serializable, safe to pass to the client thread.
  const searchParams = await props.searchParams
  const rawMessage = searchParams.message
  const initialMessage =
    typeof rawMessage === "string" && rawMessage.length > 0 ? rawMessage : null

  return (
    <div className="flex h-full min-h-svh flex-col">
      <ChatThread initialMessage={initialMessage} />
    </div>
  )
}
