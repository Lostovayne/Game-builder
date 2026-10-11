import { isToolUIPart } from "ai"
import type { UIMessage } from "ai"

import { isPendingAskPlayerPart } from "@/lib/games/ask-player"

export type ToolPart = Extract<
  UIMessage["parts"][number],
  { toolCallId: string }
>

export type ToolRunSegment =
  | { kind: "part"; part: UIMessage["parts"][number]; index: number }
  | { kind: "tool-run"; parts: ToolPart[] }

/**
 * Splits an assistant message into render segments: consecutive tool calls
 * become one run, rendered as a single expandable block in the thread;
 * visible standalone parts (text, the pending question) keep stream order
 * and their original index for stable React keys.
 *
 * Only parts that actually render inline split a run. Everything else is
 * transparent: `step-start` markers the SDK inserts between multi-step tool
 * rounds, reasoning (aggregated in its own block at the top), structural
 * data/source parts, and empty text. Without that rule every single-step
 * tool call would end up in a run of its own.
 *
 * A pending ask_player question is interactive UI and always stands alone —
 * burying it in a collapsed run would hide the question from the player.
 */
export function groupToolRuns(parts: UIMessage["parts"]): ToolRunSegment[] {
  const segments: ToolRunSegment[] = []
  let run: ToolPart[] = []

  const flush = () => {
    if (run.length > 0) {
      segments.push({ kind: "tool-run", parts: run })
      run = []
    }
  }

  parts.forEach((part, index) => {
    if (isPendingAskPlayerPart(part)) {
      flush()
      segments.push({ kind: "part", part, index })
      return
    }
    if (isToolUIPart(part)) {
      run.push(part as ToolPart)
      return
    }
    if (part.type === "text" && part.text) {
      flush()
      segments.push({ kind: "part", part, index })
    }
  })
  flush()

  return segments
}
