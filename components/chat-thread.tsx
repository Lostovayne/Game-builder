"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
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

export function ChatThread({
  gameId,
  initialMessages,
}: {
  gameId: string
  initialMessages?: UIMessage[]
}) {
  const [input, setInput] = useState("")
  const autoFiredForIdRef = useRef<string | null>(null)
  const retryCountRef = useRef(0)
  // True only after we have observed a non-ready status for the current
  // auto-fire attempt (request actually left "ready"). StrictMode's second
  // effect run while still "ready" must NOT count as a retry — that was
  // causing two assistant replies.
  const sawInFlightRef = useRef(false)

  const { messages, sendMessage, status, error, regenerate } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat", body: { gameId } }),
  })

  function handleSend(value: string) {
    void sendMessage({ text: value })
    setInput("")
  }

  // Auto-request assistant reply when the thread is exactly one seeded
  // user message (creation orphan / interrupted first turn).
  // Fire once per message id; retry at most twice, and only after status
  // left "ready" (attempt was in flight) and returned to "ready" still
  // without an assistant message (StrictMode/chat.stop abort).
  useEffect(() => {
    if (status === "streaming" || status === "submitted" || status === "error") {
      if (autoFiredForIdRef.current) {
        sawInFlightRef.current = true
      }
      return
    }
    if (status !== "ready" || error) return
    if (messages.length !== 1) return
    const sole = messages[0]
    if (!sole || sole.role !== "user") return

    if (autoFiredForIdRef.current !== sole.id) {
      autoFiredForIdRef.current = sole.id
      retryCountRef.current = 0
      sawInFlightRef.current = false
      void regenerate()
      return
    }

    // Same message already fired. Only retry if a prior attempt was observed
    // in flight and came back to ready without producing an assistant reply.
    if (!sawInFlightRef.current) return
    if (retryCountRef.current >= 2) return
    sawInFlightRef.current = false
    retryCountRef.current += 1
    void regenerate()
  }, [messages, status, error, regenerate])

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
                  const hasVisibleText = textParts.some((part) => part.text)
                  const isStreamingThisMessage =
                    isLast &&
                    (status === "streaming" || status === "submitted")
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
                              {hasVisibleText ? (
                                textParts.map((part, partIndex) => (
                                  <span key={partIndex}>{part.text}</span>
                                ))
                              ) : isStreamingThisMessage ? (
                                <span
                                  className="text-muted-foreground"
                                  aria-live="polite"
                                >
                                  Thinking…
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
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" behavior="smooth" />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 pb-4">
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
