import { isToolUIPart } from "ai"
import type { UIMessage } from "ai"

import { getToolCallState } from "./tool-call-state"

/**
 * True when the assistant message is streaming but the model is between
 * chunks: the last received part already settled (text finished, a tool
 * output landed, reasoning ended) and the next part has not arrived yet.
 *
 * That gap is dead air in the UI — the model is thinking — and without an
 * indicator the view looks frozen between reading and writing. The pending
 * bubble covers the case with no assistant parts at all; this covers the
 * case where parts exist but none is currently producing output.
 */
export function isAwaitingNextChunk(
  parts: UIMessage["parts"],
  isStreaming: boolean
): boolean {
  if (!isStreaming || parts.length === 0) return false

  const last = parts[parts.length - 1]

  if (last.type === "text") return last.state === "done"
  if (last.type === "reasoning") return last.state === "done"
  if (isToolUIPart(last)) {
    const call = getToolCallState(last)
    return call !== null && call.state !== "active"
  }

  return false
}
