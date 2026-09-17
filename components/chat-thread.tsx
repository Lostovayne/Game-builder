"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import Image from "next/image"
import { useRouter } from "next/navigation"
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
  initialMessage = null,
}: {
  gameId: string
  initialMessages?: UIMessage[]
  initialMessage?: string | null
}) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const consumedInitialRef = useRef(false)

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat", body: { gameId } }),
  })

  function handleSend(value: string) {
    void sendMessage({ text: value })
    setInput("")
  }

  // Creation prompt carried over from the landing page (?message=...).
  // Sent once through useChat, then removed from the URL so a refresh
  // doesn't replay it.
  useEffect(() => {
    if (!initialMessage || consumedInitialRef.current) return
    consumedInitialRef.current = true
    void sendMessage({ text: initialMessage })
    router.replace(window.location.pathname)
  }, [initialMessage, router, sendMessage])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
              {messages.length === 0 && status === "ready" ? (
                <p className="text-center text-sm text-muted-foreground">
                  Describe what to build or tweak, and I’ll take it from there.
                </p>
              ) : null}
              {messages.map((message) =>
                message.role === "assistant" ? (
                  <MessageScrollerItem key={message.id}>
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
                ) : (
                  <MessageScrollerItem key={message.id}>
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
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl px-4 pt-2 pb-4">
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
