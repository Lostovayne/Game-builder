"use client"

import Image from "next/image"

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

type MockMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: "1",
    role: "user",
    content: "I want to build a top-down racing game with power-ups.",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Nice choice! What kind of vibe are you going for — arcade kart racer or something more realistic?",
  },
  {
    id: "3",
    role: "user",
    content: "Arcade, definitely. With boost pads and oil slicks.",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "Got it. I'll set up 3 laps, 4 racers, and place boost pads on the corners. Want me to add a desert track theme?",
  },
  {
    id: "5",
    role: "user",
    content: "Yes, desert theme with a sunset sky.",
  },
  {
    id: "6",
    role: "assistant",
    content:
      "Done — desert track with sunset sky is ready. Hit play to try it, or tell me what to tweak next.",
  },
]

export function ChatThread() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
              {MOCK_MESSAGES.map((message) =>
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
                          <BubbleContent>{message.content}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ) : (
                  <MessageScrollerItem key={message.id}>
                    <Message align="end">
                      <MessageContent>
                        <Bubble variant="secondary" align="end">
                          <BubbleContent>{message.content}</BubbleContent>
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
        <ChatComposer />
      </div>
    </div>
  )
}
