"use client"

import { useCallback, useState } from "react"
import type { UIMessage } from "ai"
import { useRouter } from "next/navigation"

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
 *
 * This component owns the preview revision: a counter bumped every time the
 * chat thread reports a settled turn. Daytona reuses the same signed preview
 * URL across updates, so the revision — not the URL — is what remounts the
 * iframe and makes the browser re-fetch the regenerated game files.
 */
export function GameChat({
  gameId,
  sandboxId,
  initialTitle,
  initialMessages,
  initialSessions,
}: {
  gameId: string
  /** Present only when the game has a persisted Daytona sandbox. */
  sandboxId: string | null
  initialTitle: string
  initialMessages?: UIMessage[]
  initialSessions?: ChatSessions
}) {
  const router = useRouter()
  const [previewRevision, setPreviewRevision] = useState(0)
  const handleTurnSettled = useCallback(() => {
    setPreviewRevision((revision) => revision + 1)
    // The sandbox is usually provisioned during the first chat turn, which
    // means `sandboxId` was still null when the server last rendered this
    // page. Refresh once the turn settles so the preview panel mounts on its
    // own instead of waiting for a manual reload. When the sandbox already
    // exists, the revision bump above is enough and no refresh is needed.
    if (sandboxId === null) router.refresh()
  }, [sandboxId, router])

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
          onTurnSettled={handleTurnSettled}
        />
      </ResizablePanel>
      {/* The preview panel (and its resizable handle) only makes sense when
          the game actually has a sandbox to preview. */}
      {sandboxId !== null ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="game-chat-preview"
            defaultSize="38%"
            minSize="15%"
            className="flex min-h-0 flex-col"
          >
            <ChatPreview gameId={gameId} revision={previewRevision} />
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}
