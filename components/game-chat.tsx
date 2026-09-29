"use client"

import type { UIMessage } from "ai"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

type ChatSessions = Record<
  string,
  { publicAccessToken: string; lastEventId: string }
>

/**
 * Client boundary for the game screen: the conversation and the live game
 * preview side by side, split by a resizable separator.
 *
 * Everything below this component is client code. Keep the server-only work
 * (auth, data fetching, token minting) in the page and pass plain props in.
 */
export function GameChat({
  gameId,
  initialTitle,
  initialMessages,
  initialSessions,
}: {
  gameId: string
  initialTitle: string
  initialMessages?: UIMessage[]
  initialSessions?: ChatSessions
}) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel
        id="game-chat-thread"
        defaultSize="62%"
        minSize="40%"
        className="flex min-h-0 flex-col"
      >
        <ChatThread
          gameId={gameId}
          initialTitle={initialTitle}
          initialMessages={initialMessages}
          initialSessions={initialSessions}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="game-chat-preview"
        defaultSize="38%"
        minSize="15%"
        className="flex min-h-0 flex-col"
      >
        <ChatPreview />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
