"use client"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { ToolCallMarker } from "@/components/chat-tool-marker"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import {
  getGameMessages,
  mintGameAccessToken,
  startGameSession,
} from "@/lib/chat/actions"
import {
  progressiveStatusText,
  scheduleProgressiveStatusSteps,
} from "@/lib/chat/progressive-status"
import { getGameTitle } from "@/lib/games/actions"
import { isAwaitingNextChunk } from "@/lib/chat/stream-gap"
import {
  isProvisionalTitle,
  pollForRefinedTitle,
  seedPromptFromMessages,
  shouldPreloadInitialChat,
} from "@/lib/games/title-refresh"
import type { gameChat } from "@/trigger/chat"
import { RECOVERY_DELAYS_MS, shouldRecoverTurn } from "@/lib/chat/recovery"

function useProgressiveStatus(active: boolean): string {
  // The step sequence restarts on every activation. The reset is done by
  // adjusting state during render (React's "derive state from props" pattern)
  // so no synchronous setState runs inside an effect, which would cascade a
  // second render. Timer callbacks are the only other writer.
  const [{ wasActive, step }, setProgress] = useState({
    wasActive: active,
    step: 0,
  })

  if (wasActive !== active) {
    setProgress({ wasActive: active, step: 0 })
  }

  useEffect(() => {
    if (!active) return
    return scheduleProgressiveStatusSteps((nextStep) =>
      setProgress((prev) => ({ ...prev, step: nextStep }))
    )
  }, [active])

  return progressiveStatusText(step)
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

function hasAssistantReply(list: UIMessage[], userId: string): boolean {
  const idx = list.findIndex((m) => m.id === userId)
  return (
    idx >= 0 &&
    list
      .slice(idx + 1)
      .some(
        (m) =>
          m.role === "assistant" &&
          m.parts.some((p) => p.type === "text" && p.text.trim().length > 0)
      )
  )
}

export function ChatThread({
  gameId,
  initialTitle,
  initialMessages,
  initialSessions,
  onTurnSettled,
}: {
  gameId: string
  initialTitle: string
  initialMessages?: UIMessage[]
  initialSessions?: Record<
    string,
    { publicAccessToken: string; lastEventId: string }
  >
  /**
   * Fired whenever a turn settles (busy → idle). The parent uses it to remount
   * the preview iframe so the user sees the files the turn just wrote, without
   * needing a URL that changes (Daytona reuse the same preview URL).
   */
  onTurnSettled?: () => void
}) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const autoFiredForIdRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)
  // Recovery bookkeeping. The transport is memoized once, so its `onEvent`
  // only ever touches refs (+ the stable `gameId`) — never stale state.
  const messagesRef = useRef<UIMessage[]>(initialMessages ?? [])
  const recoveredForRef = useRef<string | null>(null)
  const recoveringForRef = useRef<string | null>(null)
  // Id of the user message the user deliberately stopped. A ref (not
  // state) because the memoized transport and closure-based recovery
  // helpers must observe it without re-creating. Cleared on new user
  // activity so recovery for the next turn stays fully enabled.
  const stoppedByUserRef = useRef<string | null>(null)
  const recoverRef = useRef<(userId: string) => void>(() => {})
  const [recovering, setRecovering] = useState(false)
  // User id whose turn definitively has nothing to pull → offer retry.
  const [failedFor, setFailedFor] = useState<string | null>(null)

  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintGameAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startGameSession({ chatId, clientData }),
    sessions: initialSessions,
    onEvent: (event) => {
      if (event.chatId !== gameId) return
      switch (event.type) {
        case "first-chunk":
          console.debug(
            `[chat] first-chunk (${event.chunkType ?? "?"}) after ${event.sinceSendMs ?? "?"}ms`
          )
          break
        case "turn-completed":
          console.debug(
            `[chat] turn-completed after ${event.sinceSendMs ?? "?"}ms`
          )
          // Precise empty-stream detector: the run finished server-side
          // (transcript saved) but this client has no assistant reply yet.
          // Happens when `.out` closes past a stale cursor or drops chunks.
          {
            const last = messagesRef.current[messagesRef.current.length - 1]
            if (last && last.role === "user" && last.id) {
              recoverRef.current(last.id)
            }
          }
          break
        case "stream-error":
        case "message-send-failed":
          console.error(`[chat] ${event.type}`, event)
          break
        case "run-pending-version":
          // Deployment skew: the run is parked, nothing answers until the
          // new version lands. Indicator correctly stays on "contacting".
          console.warn(
            `[chat] run parked waiting for deployment (source: ${event.source})`
          )
          break
        default:
          break
      }
    },
  })

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
    regenerate,
    setMessages,
  } = useChat({
    id: gameId,
    messages: initialMessages,
    transport,
    resume: !!initialSessions,
  })

  // Pull the asynchronously refined title into the mounted sidebar. The
  // server already ran `revalidatePath("/", "layout")` after the DB update,
  // so a single `router.refresh()` merges a fresh RSC payload into the
  // layout. Bounded, cancel-on-unmount, and fires at most once per game —
  // never on a repeating interval. `router.refresh()` preserves client
  // state (the `useChat` transcript and this component's local state), so
  // the active conversation is never disrupted.
  //
  // Guard: only poll when the stored title is still the provisional title
  // derived from the seeded first prompt. A game whose title is already
  // final (refined earlier, or renamed) can never match, so it would burn
  // its whole 24s/16-request budget for nothing. The prompt is read from
  // `initialMessages` on the client and is never sent anywhere.
  const seedPrompt = seedPromptFromMessages(initialMessages ?? [])
  const refinedForGameRef = useRef<string | null>(null)
  useEffect(() => {
    // A refresh already delivered the refined title for this game; the
    // changed `initialTitle` prop must not start another poll cycle.
    if (refinedForGameRef.current === gameId) return
    if (!isProvisionalTitle({ initialTitle, seedPrompt })) return
    let cancelled = false
    void pollForRefinedTitle({
      initialTitle,
      fetchTitle: () => getGameTitle(gameId),
      onRefined: () => {
        if (cancelled) return
        refinedForGameRef.current = gameId
        router.refresh()
      },
      isCancelled: () => cancelled,
    })
    return () => {
      cancelled = true
    }
  }, [gameId, initialTitle, seedPrompt, router])

  // Keep the message mirror fresh for the memoized `onEvent` above.
  useEffect(() => {
    messagesRef.current = messages
  })

  // Notify the parent when a turn settles so it can remount the preview.
  // Ref-based so the callback identity never re-creates anything, and
  // transition-based (busy → idle) so it covers every settle path:
  // `turn-completed`, a user stop, and a stream error alike.
  const onTurnSettledRef = useRef(onTurnSettled)
  useEffect(() => {
    onTurnSettledRef.current = onTurnSettled
  })
  const settledPrevStatusRef = useRef<string>(status)
  useEffect(() => {
    const prev = settledPrevStatusRef.current
    settledPrevStatusRef.current = status
    const wasBusy = prev === "streaming" || prev === "submitted"
    const isBusy = status === "streaming" || status === "submitted"
    if (wasBusy && !isBusy) onTurnSettledRef.current?.()
  }, [status])

  /**
   * Pull the persisted transcript and merge the missing assistant reply.
   * Guarded per user id so StrictMode double-effects and duplicate
   * `turn-completed` deliveries run it exactly once per turn.
   */
  const recover = async (userId: string) => {
    // A deliberately stopped turn never begins polling.
    if (stoppedByUserRef.current === userId) return
    if (
      recoveringForRef.current === userId ||
      recoveredForRef.current === userId
    )
      return
    recoveredForRef.current = userId
    recoveringForRef.current = userId
    setRecovering(true)
    try {
      for (let attempt = 0; attempt < RECOVERY_DELAYS_MS.length; attempt++) {
        const delay = RECOVERY_DELAYS_MS[attempt] ?? 0
        if (delay > 0) await sleep(delay)
        // Stop if the conversation moved on (new user message) — the new
        // turn owns the UI now and replays anything missed.
        const cur = messagesRef.current
        const curLast = cur[cur.length - 1]
        if (
          !shouldRecoverTurn({
            currentLastMessageId: curLast?.id,
            userId,
            hasAssistantReply: hasAssistantReply(cur, userId),
            stoppedByUser: stoppedByUserRef.current === userId,
          })
        ) {
          setFailedFor(null)
          return
        }
        let server: UIMessage[]
        try {
          server = await getGameMessages(gameId)
        } catch (err) {
          console.error("[chat] recovery fetch failed", err)
          continue // network blip — next poll retries
        }
        const fresh = messagesRef.current
        const freshLast = fresh[fresh.length - 1]
        if (
          !shouldRecoverTurn({
            currentLastMessageId: freshLast?.id,
            userId,
            hasAssistantReply: hasAssistantReply(fresh, userId),
            stoppedByUser: stoppedByUserRef.current === userId,
          })
        ) {
          setFailedFor(null)
          return
        }
        if (hasAssistantReply(server, userId)) {
          setMessages(server)
          setFailedFor(null)
          return
        }
        // else: the run is likely still generating server-side — next poll.
      }
      // Window exhausted and still nothing anywhere → manual retry.
      const cur = messagesRef.current
      const curLast = cur[cur.length - 1]
      if (curLast && curLast.id === userId && !hasAssistantReply(cur, userId)) {
        setFailedFor(userId)
      }
    } finally {
      if (recoveringForRef.current === userId) recoveringForRef.current = null
      setRecovering(false)
    }
  }
  useEffect(() => {
    recoverRef.current = recover
  })

  // Fallback detector: turn settled (busy → ready/error) with no assistant
  // message and no error. Covers paths where `turn-completed` never fires
  // (aborted/resumed-away streams). The per-id guard makes it a no-op when
  // the `onEvent` path already recovered this turn.
  const prevStatusRef = useRef<string>(status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (prev !== "streaming" && prev !== "submitted") return
    if (status === "streaming" || status === "submitted") return
    if (error) return // error UI + retry button own this case
    const last = messagesRef.current[messagesRef.current.length - 1]
    if (!last || last.role !== "user" || !last.id) return
    void recoverRef.current(last.id)
  }, [status, error])

  function handleStop() {
    const last = messagesRef.current[messagesRef.current.length - 1]
    if (last && last.role === "user" && last.id) {
      stoppedByUserRef.current = last.id
    }
    // Order matters: stopGeneration sends the `{kind:"stop"}` input-stream
    // signal so the agent aborts its `streamText` call server-side (this app
    // passes `resume`, so aborting alone would never reach the server),
    // while `stop()` aborts the local reader and flips status back to ready.
    // Do NOT call `transport.clearSupersedeGate` here: the agent still
    // writes its `turn-complete` boundary on a normal stop and the SDK's
    // local supersede gate self-clears on it; `clearSupersedeGate` exists
    // for the different case where the boundary was never written.
    void transport.stopGeneration(gameId).catch(() => {})
    stop()
  }

  function handleSend(value: string) {
    setFailedFor(null)
    stoppedByUserRef.current = null
    void sendMessage({ text: value })
    setInput("")
  }

  async function handleRetry() {
    stoppedByUserRef.current = null
    const last = messagesRef.current[messagesRef.current.length - 1]
    if (!last || last.role !== "user" || !last.id) {
      // Nothing concrete to verify against — just try the turn again.
      recoveredForRef.current = null
      setFailedFor(null)
      void regenerate()
      return
    }
    const userId = last.id
    // Fetch-first: the late original reply may have landed since the button
    // appeared. Showing it avoids firing a second turn while the first is
    // still alive (the double-answer just reported).
    recoveredForRef.current = null
    setFailedFor(null)
    recoveringForRef.current = userId
    setRecovering(true)
    try {
      const server = await getGameMessages(gameId)
      const cur = messagesRef.current
      if (hasAssistantReply(cur, userId)) return
      const curLast = cur[cur.length - 1]
      if (!curLast || curLast.id !== userId) return
      if (hasAssistantReply(server, userId)) {
        setMessages(server)
        recoveredForRef.current = userId
        return
      }
    } catch (err) {
      console.error("[chat] pre-retry fetch failed", err)
    } finally {
      if (recoveringForRef.current === userId) recoveringForRef.current = null
      setRecovering(false)
    }
    // Truly nothing anywhere — fire the turn again (re-guarded so a reply
    // that landed during the fetch doesn't get duplicated).
    const cur = messagesRef.current
    const curLast = cur[cur.length - 1]
    if (curLast && curLast.role === "assistant") return
    if (!curLast || curLast.id !== userId) return
    void regenerate()
  }

  // Low-cost, on-demand preload for the immediate auto-send flow.
  //
  // A brand-new game lands here with exactly one seeded user message, and
  // the auto-send effect below fires its first turn within a few ms. In that
  // one case we can overlap Trigger run/worker startup with the send by
  // eagerly creating the session now, shaving part of the cold-start wait
  // that previously all happened after the message was posted.
  //
  // Registered BEFORE the auto-send effect so it starts as early as possible
  // in the same commit. It deliberately does NOT gate or postpone the send:
  // the SDK shares one in-flight start per chatId (`pendingStarts`), so
  // `preload` and the send's own lazy start converge on the same session —
  // no duplicate run, no dropped first message. StrictMode's repeated effect
  // is deduped the same way, and an already-hydrated session short-circuits.
  //
  // Persistent warm capacity stays disabled: this is on-demand only, and
  // `shouldPreloadInitialChat` declines every flow without that immediate
  // send, so we never pay idle compute speculatively. A failed preload is
  // logged and nothing more — the send path still lazy-starts the session.
  useEffect(() => {
    if (
      !shouldPreloadInitialChat({
        hasSession: !!initialSessions,
        messages: initialMessages ?? [],
      })
    )
      return
    void transport.preload(gameId).catch((err) => {
      console.error("[chat] preload failed", err)
    })
  }, [gameId, transport, initialMessages, initialSessions])

  // Auto-request assistant reply when the thread is exactly one seeded
  // user message (creation orphan / interrupted first turn).
  // Fire once per message id. Retry (bounded) only on genuine failure
  // (`error` set): a clean return to "ready" with the seed still sole can
  // be a render where `status` flipped before `messages` updated — retrying
  // there fires a second turn and the model answers twice.
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return
    if (messages.length !== 1) return
    const sole = messages[0]
    if (!sole || sole.role !== "user") return

    if (autoFiredForIdRef.current !== sole.id) {
      const text = sole.parts
        .filter(
          (part): part is Extract<typeof part, { type: "text" }> =>
            part.type === "text"
        )
        .map((part) => part.text)
        .join("")
      // Defer past the mount commit. Firing synchronously here loses a race
      // against `useChat`'s own cleanup: React StrictMode runs
      // mount -> cleanup -> mount, that cleanup calls `chat.stop()`, and
      // `stop()` aborts the in-flight `sendMessage` preparation — which makes
      // it resolve without mutating state, without a request and without an
      // error. Scheduling with setTimeout and clearing it on cleanup means
      // StrictMode discards the first timer and the second effect pass arms
      // the one that survives, after the abort window has closed.
      const timer = window.setTimeout(() => {
        if (autoFiredForIdRef.current === sole.id) return
        autoFiredForIdRef.current = sole.id
        retryCountRef.current = 0
        void sendMessage({ text, messageId: sole.id })
      }, 0)
      return () => window.clearTimeout(timer)
    }

    // Same seed already fired: only a surfaced error justifies another
    // attempt, at most twice. StrictMode's second pass never reaches this
    // branch — the ref is only set once the deferred timer runs — so it
    // simply re-arms the timer instead of double-sending.
    if (!error) return
    if (retryCountRef.current >= 2) return
    retryCountRef.current += 1
    void regenerate()
  }, [messages, status, error, regenerate, sendMessage])

  const isBusy = status === "streaming" || status === "submitted"
  const progressiveStatus = useProgressiveStatus(isBusy || recovering)
  const isSubmitting = status === "submitted"
  // Gap before the first assistant chunk: `useChat` has no assistant message
  // yet while `submitted`, so without this the view looks dead/empty.
  // `recovering` keeps the bubble up while we pull the persisted reply
  // after an empty stream close — instead of melting into nothing.
  const lastMessage = messages[messages.length - 1]
  const awaitingReply = !lastMessage || lastMessage.role === "user"
  const showPendingBubble = (isBusy || recovering) && awaitingReply
  // Definitive failure for THIS user message: recovery found nothing to
  // pull (or fetch failed), or the turn errored. Offer retry, not reload.
  const lastUserId =
    lastMessage && lastMessage.role === "user" ? (lastMessage.id ?? null) : null
  const showRetry =
    !isBusy &&
    !recovering &&
    lastUserId !== null &&
    (failedFor === lastUserId ||
      (error != null && lastMessage?.role === "user"))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
              {messages.length === 0 && status === "ready" ? (
                <p className="text-center text-sm text-muted-foreground">
                  Describe what to build or tweak, and I’ll take it from there.
                </p>
              ) : null}
              {messages.map((message, index) => {
                // Stored messages can lack ids (persisted before ids existed),
                // and React + the scroller both require unique non-empty ids.
                const itemId = message.id || `message-${index}`
                const isLast = index === messages.length - 1
                if (message.role === "assistant") {
                  // Reasoning parts only exist when thinking is enabled
                  // (sendReasoning: true + reasoning != "none"). They are
                  // aggregated into one collapsed <details> block, while
                  // text and tool-call parts render inline in stream order.
                  const reasoningParts = message.parts.filter(
                    (
                      part
                    ): part is Extract<typeof part, { type: "reasoning" }> =>
                      part.type === "reasoning"
                  )
                  const textParts = message.parts.filter(
                    (part): part is Extract<typeof part, { type: "text" }> =>
                      part.type === "text"
                  )
                  const hasVisibleText = textParts.some((part) => part.text)
                  const hasToolParts = message.parts.some(
                    (part) =>
                      part.type.startsWith("tool-") ||
                      part.type === "dynamic-tool"
                  )
                  const isStreamingThisMessage = isLast && isBusy
                  const streamingReasoning = reasoningParts.find(
                    (part) => part.state === "streaming" || !part.state
                  )
                  return (
                    <MessageScrollerItem
                      key={itemId}
                      messageId={itemId}
                      scrollAnchor={isLast}
                    >
                      <Message align="start">
                        <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                          <Image
                            src="/logo.svg"
                            alt="Assistant"
                            width={32}
                            height={32}
                            className="size-8"
                          />
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble variant="ghost" align="start">
                            <BubbleContent>
                              {reasoningParts.length > 0 ? (
                                <details
                                  className="mb-1 text-xs text-muted-foreground"
                                  open={isStreamingThisMessage}
                                >
                                  <summary className="cursor-pointer select-none">
                                    {streamingReasoning
                                      ? "Pensando…"
                                      : "Thought process"}
                                  </summary>
                                  {reasoningParts.map((part, partIndex) => (
                                    <p
                                      key={partIndex}
                                      className="mt-1 whitespace-pre-wrap italic"
                                    >
                                      {part.text}
                                    </p>
                                  ))}
                                </details>
                              ) : null}
                              {/* Reasoning is aggregated above; text spans and
                                  tool markers render interleaved, in stream
                                  order, exactly as the agent produced them. */}
                              {isStreamingThisMessage &&
                              !hasVisibleText &&
                              !hasToolParts ? (
                                <span
                                  className="animate-pulse text-muted-foreground"
                                  aria-live="polite"
                                >
                                  {reasoningParts.length > 0
                                    ? "Escribiendo respuesta…"
                                    : "Pensando…"}
                                </span>
                              ) : null}
                              {message.parts.map((part, partIndex) => {
                                if (part.type === "text") {
                                  // Once tool markers exist, the opening
                                  // sentence of the reply reads naturally as
                                  // narrative between them.
                                  if (!part.text) return null
                                  return (
                                    <span key={partIndex}>{part.text}</span>
                                  )
                                }
                                if (
                                  part.type.startsWith("tool-") ||
                                  part.type === "dynamic-tool"
                                ) {
                                  return (
                                    <ToolCallMarker
                                      key={
                                        "toolCallId" in part
                                          ? part.toolCallId
                                          : partIndex
                                      }
                                      part={
                                        part as Extract<
                                          UIMessage["parts"][number],
                                          { toolCallId: string }
                                        >
                                      }
                                    />
                                  )
                                }
                                return null
                              })}
                              {/* Gap detector: the last part settled but the
                                  next chunk has not arrived — the model is
                                  thinking, say so instead of looking frozen. */}
                              {isAwaitingNextChunk(
                                message.parts,
                                isStreamingThisMessage
                              ) ? (
                                <span
                                  className="animate-pulse text-muted-foreground"
                                  aria-live="polite"
                                >
                                  Pensando…
                                </span>
                              ) : null}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                }
                return (
                  <MessageScrollerItem
                    key={itemId}
                    messageId={itemId}
                    scrollAnchor={isLast}
                  >
                    <Message align="end">
                      <MessageContent>
                        <Bubble variant="secondary" align="end">
                          <BubbleContent>
                            {message.parts.map((part, index) =>
                              part.type === "text" ? (
                                <span key={index}>{part.text}</span>
                              ) : null
                            )}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}
              {showPendingBubble ? (
                <MessageScrollerItem
                  key="pending-assistant"
                  messageId="pending-assistant"
                  scrollAnchor
                >
                  <Message align="start">
                    <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                      <Image
                        src="/logo.svg"
                        alt="Assistant"
                        width={32}
                        height={32}
                        className="size-8"
                      />
                    </MessageAvatar>
                    <MessageContent>
                      <Bubble variant="ghost" align="start">
                        <BubbleContent>
                          <span
                            className="animate-pulse text-muted-foreground"
                            aria-live="polite"
                          >
                            {recovering
                              ? "Sincronizando respuesta…"
                              : isSubmitting
                                ? progressiveStatus
                                : "Pensando…"}
                          </span>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" behavior="smooth" />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 pb-4">
        {showRetry ? (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-full border border-border bg-background px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              La respuesta no llegó al stream — reintentar
            </button>
          </div>
        ) : null}
        <ChatComposer
          value={input}
          onValueChangeAction={setInput}
          onSubmitAction={handleSend}
          isSubmitting={status !== "ready"}
          isStoppable={isBusy}
          onStopAction={handleStop}
          error={error?.message ?? null}
          placeholder="Reply..."
        />
      </div>
    </div>
  )
}
