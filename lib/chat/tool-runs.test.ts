/**
 * Grouping of assistant tool parts into runs for the collapsible tool
 * history in the chat thread:
 *
 * 1. Consecutive tool calls merge into one run (one expandable block).
 * 2. Text parts split runs, and part order + original indices survive so
 *    the thread keeps stream order and stable React keys.
 * 3. A pending ask_player question is interactive UI — it stands alone,
 *    never hidden inside a collapsed group.
 * 4. A resolved ask_player call is history like any other tool and joins
 *    the run.
 */
import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { groupToolRuns } from "./tool-runs"

type Part = UIMessage["parts"][number]

function toolPart(id: string, state = "output-available"): Part {
  return {
    type: "tool-write_file",
    toolCallId: id,
    input: { path: "game.js", content: "// game" },
    ...(state === "output-available"
      ? { output: { ok: true, path: "game.js", bytes: 8 } }
      : state === "output-error"
        ? { errorText: "An error occurred." }
        : {}),
    state,
  } as unknown as Part
}

function textPart(text: string): Part {
  return { type: "text", text, state: "done" } as unknown as Part
}

const askPlayerQuestion = {
  type: "tool-ask_player",
  toolCallId: "ask-1",
  input: {
    dimension: "world",
    question: "What is the setting?",
    options: [
      { id: "deep-sea", label: "Deep sea", description: "Blue dark water" },
      { id: "orbit", label: "Derelict orbit", description: "A dead station" },
    ],
  },
  state: "input-available",
} as unknown as Part

describe("groupToolRuns", () => {
  it("merges consecutive tool parts into a single run", () => {
    const segments = groupToolRuns([
      toolPart("call-1"),
      toolPart("call-2"),
      toolPart("call-3", "output-error"),
    ])

    expect(segments).toHaveLength(1)
    const [run] = segments
    if (run?.kind !== "tool-run") throw new Error("expected one tool run")
    expect(run.parts.map((part) => part.toolCallId)).toEqual([
      "call-1",
      "call-2",
      "call-3",
    ])
  })

  it("splits runs around text and preserves order and indices", () => {
    const segments = groupToolRuns([
      textPart("Starting."),
      toolPart("call-1"),
      toolPart("call-2"),
      textPart("All done."),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual([
      "part",
      "tool-run",
      "part",
    ])
    const [intro, run, outro] = segments
    if (intro?.kind !== "part" || outro?.kind !== "part")
      throw new Error("expected standalone text parts")
    if (run?.kind !== "tool-run") throw new Error("expected one tool run")
    expect(intro.index).toBe(0)
    expect(outro.index).toBe(3)
    expect(run.parts.map((part) => part.toolCallId)).toEqual([
      "call-1",
      "call-2",
    ])
  })

  it("keeps a pending ask_player question out of any run", () => {
    const segments = groupToolRuns([
      toolPart("call-1"),
      askPlayerQuestion,
      toolPart("call-2"),
    ])

    expect(segments.map((segment) => segment.kind)).toEqual([
      "tool-run",
      "part",
      "tool-run",
    ])
    const [, question] = segments
    if (question?.kind !== "part")
      throw new Error("expected the question alone")
    expect(question.index).toBe(1)
  })

  it("folds a resolved ask_player call back into the run", () => {
    const answered = {
      ...(askPlayerQuestion as Record<string, unknown>),
      output: { id: "orbit", label: "Derelict orbit" },
      state: "output-available",
    } as unknown as Part

    const segments = groupToolRuns([toolPart("call-1"), answered])

    expect(segments).toHaveLength(1)
    const [run] = segments
    if (run?.kind !== "tool-run") throw new Error("expected one tool run")
    expect(run.parts.map((part) => part.toolCallId)).toEqual([
      "call-1",
      "ask-1",
    ])
  })

  it("keeps step markers, reasoning and empty text transparent", () => {
    const segments = groupToolRuns([
      toolPart("call-1"),
      { type: "step-start" } as unknown as Part,
      { type: "reasoning", text: "hmm", state: "done" } as unknown as Part,
      toolPart("call-2"),
      textPart(""),
      toolPart("call-3"),
    ])

    expect(segments).toHaveLength(1)
    const [run] = segments
    if (run?.kind !== "tool-run") throw new Error("expected one tool run")
    expect(run.parts.map((part) => part.toolCallId)).toEqual([
      "call-1",
      "call-2",
      "call-3",
    ])
  })

  it("returns nothing for an empty part list", () => {
    expect(groupToolRuns([])).toEqual([])
  })
})
