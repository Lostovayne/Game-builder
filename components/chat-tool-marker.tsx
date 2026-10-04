"use client"

import { CheckIcon, CircleXIcon } from "lucide-react"
import type { ToolCallLifecycle } from "@/lib/chat/tool-call-state"
import { getToolCallState } from "@/lib/chat/tool-call-state"
import type { UIMessage } from "ai"

import { cn } from "cn"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Spinner } from "@/components/ui/spinner"

const STATUS_LABELS: Record<ToolCallLifecycle, string> = {
  active: "Running",
  done: "Done",
  failed: "Failed",
}

/**
 * One marker per tool invocation part, rendered in stream order inside the
 * assistant bubble. Icon: spinner while active, check when done, X + red
 * when failed. `errorText` is shown only for `output-error` parts.
 */
export function ToolCallMarker({
  part,
}: {
  part: Extract<
    UIMessage["parts"][number],
    { toolCallId: string }
  >
}) {
  const call = getToolCallState(part)
  if (!call) return null

  return (
    <Marker
      className="text-xs"
      data-state={call.state}
      aria-live={call.state === "active" ? "polite" : undefined}
    >
      <MarkerIcon>
        {call.state === "active" ? (
          <Spinner className="size-4" />
        ) : call.state === "done" ? (
          <CheckIcon className="size-4 text-muted-foreground" />
        ) : (
          <CircleXIcon className="size-4 text-destructive" />
        )}
      </MarkerIcon>
      <MarkerContent className={cn(call.state === "failed" && "text-destructive")}>
        <code className="font-mono">{call.label}</code>
        <span aria-hidden="true"> · </span>
        <span
          className={cn(
            call.state === "active" && "animate-pulse",
            call.state === "failed" && "text-destructive"
          )}
        >
          {STATUS_LABELS[call.state]}
        </span>
        {call.detail ? (
          <span className="text-destructive">{call.detail}</span>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}
