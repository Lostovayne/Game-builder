import { ChatComposer } from "@/components/chat-composer"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { suggestionRows } from "@/lib/games/suggestions"
import { auth } from "@clerk/nextjs/server"
import Image from "next/image"

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
        <EmptyContent className="max-w-xl gap-6">
          <ChatComposer />
          <div className="flex flex-col items-center gap-1.5">
            {suggestionRows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center justify-center gap-1.5"
              >
                {row.map((suggestion) => (
                  <Button
                    key={suggestion.label}
                    variant="outline"
                    size="sm"
                    type="button"
                    className="rounded-full font-normal text-muted-foreground"
                  >
                    <suggestion.icon />
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
