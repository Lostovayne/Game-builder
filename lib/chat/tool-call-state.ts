import { isToolUIPart } from "ai"
import type { UIMessage } from "ai"

export type ToolCallLifecycle = "active" | "done" | "failed"

export type ToolCallState = {
  state: ToolCallLifecycle
  /** Human-facing label: `part.title` when present, else the tool name. */
  label: string
  /** `errorText`, only for `output-error` failures. */
  detail: string | null
}

/**
 * Pure mapping from an AI SDK v7 tool UI part to its chat display state.
 *
 * Lifecycle (verified against installed `ai` v7 `UIToolInvocation`):
 * - active: `input-streaming`, `input-available`, `approval-requested`,
 *   `approval-responded`, and `output-available` with `preliminary: true`
 *   (the result may still be replaced by a final one).
 * - done: `output-available` (not preliminary).
 * - failed: `output-error`, `output-denied`.
 *
 * Returns `null` for anything that is not a tool invocation part.
 */
export function getToolCallState(part: UIMessage["parts"][number] | null): ToolCallState | null {
  if (part == null || !isToolUIPart(part)) return null

  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length)
  const label = part.title ?? toolName

  switch (part.state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return { state: "active", label, detail: null }
    case "output-available":
      // Preliminary output means execution is still in flight.
      return part.preliminary
        ? { state: "active", label, detail: null }
        : { state: "done", label, detail: null }
    case "output-error":
      return { state: "failed", label, detail: part.errorText }
    case "output-denied":
      return { state: "failed", label, detail: null }
  }
}
