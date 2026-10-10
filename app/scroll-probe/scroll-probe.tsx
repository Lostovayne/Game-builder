"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"

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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

type Scenario = "short" | "shrink" | "long-stream"

type Snapshot = {
  t: number
  spacer: string
  hidden: boolean
  ch: number
  overflow: number
  scrollTop: number
  followsBottom: boolean
  lastItemBottom: number
}

const USER_TEXT = "do not modify any code , do not use any tools , just respond"
const ASSISTANT_TEXT =
  "Understood! No code will be modified and no tools will be used. What kind of game are we making today?\nGive me your premise to start!"

function readSnapshot(t: number): Snapshot {
  const viewport = document.querySelector<HTMLElement>(
    '[data-slot="message-scroller-viewport"]'
  )
  const spacer = document.querySelector<HTMLElement>(
    "[data-message-scroller-spacer]"
  )
  const content = document.querySelector<HTMLElement>(
    '[data-slot="message-scroller-content"]'
  )
  const ch = viewport?.clientHeight ?? -1
  const scrollTop = viewport?.scrollTop ?? -1
  const scrollHeight = viewport?.scrollHeight ?? -1
  const vRect = viewport?.getBoundingClientRect()
  let lastItemBottom = -1
  if (content && vRect) {
    for (const child of Array.from(content.children)) {
      if (!child.hasAttribute("data-message-id")) continue
      lastItemBottom = child.getBoundingClientRect().bottom - vRect.top
    }
  }
  return {
    t,
    spacer: spacer?.style.height || "(empty)",
    hidden: Boolean(spacer?.hidden ?? true),
    ch,
    overflow: scrollHeight - ch,
    scrollTop,
    followsBottom: scrollTop >= scrollHeight - ch - 1,
    lastItemBottom: Math.round(lastItemBottom * 100) / 100,
  }
}

export function ScrollProbe() {
  const [scenario, setScenario] = useState<Scenario>("short")
  const [useAnchors, setUseAnchors] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [step, setStep] = useState(0)
  const [count, setCount] = useState(0)
  const [stream, setStream] = useState("")
  const [log, setLog] = useState<Snapshot[]>([])
  const t0 = useRef(0)

  // step 0: mount (seeded user message), 1: pending bubble, 2: reply settled.
  // `shrink` additionally mounts the preview panel at step 3, which narrows
  // the chat panel the way GameChat does after the first turn settles.
  useEffect(() => {
    t0.current = performance.now()
    // Diagnostic probe: the timeline state is intentionally reset whenever the
    // scenario changes — it is not derived from an external system, but the
    // reset must happen together with the timers this effect schedules below.
    // oxlint-disable-next-line react/set-state-in-effect
    setLog([])
    setStream("")
    setStep(0)
    setShowPreview(scenario === "long-stream")
    if (scenario === "short" || scenario === "shrink") {
      setCount(1)
      const pending = window.setTimeout(() => setStep(1), 400)
      const reply = window.setTimeout(() => setStep(2), 1200)
      const shrink = window.setTimeout(() => {
        if (scenario === "shrink") {
          setStep(3)
          setShowPreview(true)
        }
      }, 1800)
      return () => {
        window.clearTimeout(pending)
        window.clearTimeout(reply)
        window.clearTimeout(shrink)
      }
    }
    // long-stream: a conversation already taller than the viewport, then one
    // appended message that keeps growing (streaming).
    setCount(14)
    const append = window.setTimeout(() => {
      setStep(1)
      setCount((value) => value + 1)
    }, 500)
    const streamer = window.setInterval(() => {
      setStream((value) => (value.length > 1400 ? value : value + "…"))
    }, 120)
    const stop = window.setTimeout(() => window.clearInterval(streamer), 3500)
    return () => {
      window.clearTimeout(append)
      window.clearTimeout(stop)
      window.clearInterval(streamer)
    }
  }, [scenario, useAnchors])

  useEffect(() => {
    const push = () =>
      setLog(
        (entries) =>
          [...entries, readSnapshot(Math.round(performance.now() - t0.current))].slice(-26)
      )
    push()
    const poll = window.setInterval(push, 200)
    return () => window.clearInterval(poll)
  }, [scenario, useAnchors])

  const anchorFor = (isLast: boolean) => (useAnchors ? isLast : false)
  const messages = Array.from({ length: count }, (_, index) => index)
  const isLast = (index: number) => index === count - 1
  const streamingLast = scenario === "long-stream" && step >= 1

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          id="probe-chat"
          defaultSize="62%"
          minSize="40%"
          className="flex min-h-0 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <MessageScrollerProvider autoScroll defaultScrollPosition="end">
              <MessageScroller className="min-h-0 flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
                    {messages.map((index) => {
                      const user = index % 2 === 0
                      const last = isLast(index)
                      const text = user
                        ? `${index}: ${USER_TEXT}`
                        : `${index}: ${ASSISTANT_TEXT}${
                            last && streamingLast ? stream : ""
                          }`
                      return (
                        <MessageScrollerItem
                          key={`probe-${index}`}
                          messageId={`probe-${index}`}
                          scrollAnchor={anchorFor(last)}
                        >
                          {user ? (
                            <Message align="end">
                              <MessageContent>
                                <Bubble variant="secondary" align="end">
                                  <BubbleContent>
                                    <span>{text}</span>
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          ) : (
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
                                      className={
                                        last && streamingLast
                                          ? "animate-pulse text-muted-foreground"
                                          : undefined
                                      }
                                    >
                                      {text}
                                    </span>
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          )}
                        </MessageScrollerItem>
                      )
                    })}
                    {step >= 1 && scenario !== "long-stream" ? (
                      <MessageScrollerItem
                        key="probe-pending"
                        messageId="probe-pending"
                        scrollAnchor={useAnchors}
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
                                <span className="animate-pulse text-muted-foreground">
                                  {step === 1 ? "Pensando…" : ASSISTANT_TEXT}
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
              <div className="flex min-h-10 items-center rounded-md border px-3 text-sm text-muted-foreground">
                Reply…
              </div>
            </div>
          </div>
        </ResizablePanel>
        {showPreview ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="probe-preview"
              defaultSize="38%"
              minSize="15%"
              className="flex min-h-0 flex-col"
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-hidden">
                  <div className="h-full w-full bg-muted" />
                </div>
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>

      <div className="absolute top-2 left-2 z-50 w-[560px] rounded-md border bg-background p-3 font-mono text-[11px] leading-4 shadow">
        <div className="mb-1 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setScenario("short")}
          >
            short
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setScenario("shrink")}
          >
            shrink
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setScenario("long-stream")}
          >
            long-stream
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => setUseAnchors((value) => !value)}
          >
            anchors: {String(useAnchors)}
          </button>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
          {log
            .map(
              (s) =>
                `${String(s.t).padStart(5)} spacer=${s.spacer.padEnd(9)} ` +
                `hidden=${String(s.hidden).padEnd(5)} ch=${s.ch} ` +
                `ovf=${s.overflow} top=${s.scrollTop} ` +
                `follows=${String(s.followsBottom).padEnd(5)} ` +
                `lastBottom=${s.lastItemBottom}`
            )
            .join("\n")}
        </pre>
      </div>
    </div>
  )
}
