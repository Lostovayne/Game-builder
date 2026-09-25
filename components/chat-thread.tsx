"use client"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
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
import type { gameChat } from "@/trigger/chat"
import { RECOVERY_DELAYS_MS, shouldRecoverTurn } from "@/lib/chat/recovery"

function useProgressiveStatus(active: boolean): string {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!active) {
      setStep(0)
      return
    }
    const t1 = window.setTimeout(() => setStep(1), 2000)
    const t2 = window.setTimeout(() => setStep(2), 6000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [active])

  if (step === 0) return "Estableciendo la conexión…"
  if (step === 1) return "Esperando al modelo…"
  return "Conectado a Kimi K3…"
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
  initialMessages,
  initialSessions,
}: {
  gameId: string
  initialMessages?: UIMessage[]
  initialSessions?: Record<
    string,
    { publicAccessToken: string; lastEventId: string }
  >
}) {
  const [input, setInput] = useState("")
  const autoFiredForIdRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)
  // Recovery bookkeeping. The transport is memoized once, so its `onEvent`
  // only ever touches refs (+ the stable `gameId`) — never stale state.
  const messagesRef = useRef<UIMessage[]>(initialMessages ?? [])
  const recoveredForRef = useRef<string | null>(null)
  const recoveringForRef = useRef<string | null>(null)
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

  const { messages, sendMessage, status, error, regenerate, setMessages } =
    useChat({
      id: gameId,
      messages: initialMessages,
      transport,
      resume: !!initialSessions,
    })

  // Keep the message mirror fresh for the memoized `onEvent` above.
  useEffect(() => {
    messagesRef.current = messages
  })

  /**
   * Pull the persisted transcript and merge the missing assistant reply.
   * Guarded per user id so StrictMode double-effects and duplicate
   * `turn-completed` deliveries run it exactly once per turn.
   */
  const recover = async (userId: string) => {
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

  function handleSend(value: string) {
    setFailedFor(null)
    void sendMessage({ text: value })
    setInput("")
  }

  async function handleRetry() {
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
                  const textParts = message.parts.filter(
                    (part): part is Extract<typeof part, { type: "text" }> =>
                      part.type === "text"
                  )
                  // Reasoning parts only exist when thinking is enabled
                  // (sendReasoning: true + reasoning != "none"). Rendered
                  // collapsed/live so waiting never looks dead.
                  const reasoningParts = message.parts.filter(
                    (
                      part
                    ): part is Extract<typeof part, { type: "reasoning" }> =>
                      part.type === "reasoning"
                  )
                  const hasVisibleText = textParts.some((part) => part.text)
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
                              {hasVisibleText ? (
                                textParts.map((part, partIndex) => (
                                  <span key={partIndex}>{part.text}</span>
                                ))
                              ) : isStreamingThisMessage ? (
                                <span
                                  className="animate-pulse text-muted-foreground"
                                  aria-live="polite"
                                >
                                  {reasoningParts.length > 0
                                    ? "Escribiendo respuesta…"
                                    : "Pensando…"}
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
          error={error?.message ?? null}
          placeholder="Reply..."
        />
      </div>
    </div>
  )
}
