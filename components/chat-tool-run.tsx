"use client"

import { CheckIcon, ChevronRightIcon, CircleXIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ToolCallMarker } from "@/components/chat-tool-marker"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type {
  ToolCallLifecycle,
  ToolCallState,
} from "@/lib/chat/tool-call-state"
import { getToolCallState } from "@/lib/chat/tool-call-state"
import type { ToolPart } from "@/lib/chat/tool-runs"

import { cn } from "cn"
import { Spinner } from "@/components/ui/spinner"

/**
 * One expandable block per run of consecutive tool calls. The trigger
 * summarizes the whole run (live label while active, counts when settled)
 * so the thread shows a single row instead of one marker per call; the
 * details stay one click away.
 *
 * Open state: auto-open while a call in the run is active, auto-collapse
 * once it settles — except failures, which stay open so an error is never
 * hidden. A manual toggle always wins over the automatic behavior.
 */
export function ChatToolRun({ parts }: { parts: ToolPart[] }) {
  const calls = parts
    .map((part) => getToolCallState(part))
    .filter((call): call is ToolCallState => call !== null)

  const total = calls.length
  const activeCount = calls.filter((call) => call.state === "active").length
  const failedCount = calls.filter((call) => call.state === "failed").length
  const status: ToolCallLifecycle =
    activeCount > 0 ? "active" : failedCount > 0 ? "failed" : "done"

  const [open, setOpen] = useState(() => activeCount > 0 || failedCount > 0)
  const interacted = useRef(false)
  useEffect(() => {
    if (interacted.current) return
    setOpen(activeCount > 0 || failedCount > 0)
  }, [activeCount, failedCount])

  if (total === 0) return null
  const summary =
    total === 1 ? (
      <code className="font-mono">{calls[0].label}</code>
    ) : (
      <span>{total} tools</span>
    )

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        interacted.current = true
        setOpen(next)
      }}
      className="my-1"
    >
      <CollapsibleTrigger
        data-state={status}
        className="flex w-full min-w-0 items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {status === "active" ? (
          <Spinner className="size-4 shrink-0" />
        ) : status === "failed" ? (
          <CircleXIcon className="size-4 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate">
          {status === "active" ? (
            <>
              <code className="font-mono">
                {calls.find((call) => call.state === "active")?.label}
              </code>
              <span aria-hidden="true"> · </span>
              <span className="animate-pulse">Running</span>
              {total > 1 ? (
                <span className="text-muted-foreground"> +{total - 1}</span>
              ) : null}
            </>
          ) : (
            <>
              {summary}
              <span aria-hidden="true"> · </span>
              {status === "failed" ? (
                <span className="text-destructive">{failedCount} failed</span>
              ) : (
                <span>Done</span>
              )}
            </>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "ml-auto size-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-1">
        {parts.map((part) => (
          <ToolCallMarker key={part.toolCallId} part={part} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
