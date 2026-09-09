import { ChatComposer } from "@/components/chat-composer"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import Image from "next/image"
import { auth } from "@clerk/nextjs/server"

export default async function Page() {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Logo" width={48} height={48} />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            What should we build today?
          </EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-xl">
          <ChatComposer />
        </EmptyContent>
      </Empty>
    </div>
  )
}
