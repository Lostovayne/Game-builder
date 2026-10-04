import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"

import { getToolCallState } from "@/lib/chat/tool-call-state"

type AnyPart = UIMessage["parts"][number]

// The mapper only reads structural fields, so the narrow per-state unions are
// exercised with minimal literals cast to the broad part type.
const toolPart = (state: string, extra: Record<string, unknown> = {}): AnyPart =>
  ({
    type: "tool-list_files",
    toolCallId: "call_1",
    state,
    ...extra,
  }) as unknown as AnyPart

const dynamicToolPart = (
  state: string,
  extra: Record<string, unknown> = {}
): AnyPart =>
  ({
    type: "dynamic-tool",
    toolName: "write_file",
    toolCallId: "call_d1",
    state,
    ...extra,
  }) as unknown as AnyPart

describe("getToolCallState", () => {
  it("maps input-streaming to active", () => {
    expect(getToolCallState(toolPart("input-streaming"))).toMatchObject({
      state: "active",
    })
  })

  it("maps input-available to active", () => {
    expect(getToolCallState(toolPart("input-available"))).toMatchObject({
      state: "active",
    })
  })

  it("maps approval-requested to active", () => {
    expect(
      getToolCallState(toolPart("approval-requested", { approval: { id: "a" } }))
    ).toMatchObject({ state: "active" })
  })

  it("maps approval-responded to active", () => {
    expect(
      getToolCallState(
        toolPart("approval-responded", { approval: { id: "a", approved: true } })
      )
    ).toMatchObject({ state: "active" })
  })

  it("maps output-available to done", () => {
    expect(getToolCallState(toolPart("output-available", { output: [] })))
      .toMatchObject({
        state: "done",
      })
  })

  it("maps output-error to failed and surfaces errorText", () => {
    expect(
      getToolCallState(toolPart("output-error", { errorText: "boom" }))
    ).toEqual({
      state: "failed",
      label: "list_files",
      detail: "boom",
    })
  })

  it("maps output-denied to failed without error detail", () => {
    expect(
      getToolCallState(
        toolPart("output-denied", { approval: { id: "a", approved: false } })
      )
    ).toEqual({
      state: "failed",
      label: "list_files",
      detail: null,
    })
  })

  it("does not surface error detail on non-failed states", () => {
    expect(
      getToolCallState(toolPart("output-available", { errorText: undefined }))
    ).toMatchObject({ detail: null })
  })

  it("treats preliminary output-available as still active", () => {
    expect(
      getToolCallState(
        toolPart("output-available", { output: [], preliminary: true })
      )
    ).toMatchObject({ state: "active" })
  })

  it("labels a static tool part from its type suffix", () => {
    expect(getToolCallState(toolPart("output-available"))).toMatchObject({
      label: "list_files",
    })
    expect(getToolCallState(toolPart("output-error", {})))
      .toMatchObject({ label: "list_files" })
  })

  it("labels a dynamic tool part from toolName", () => {
    expect(
      getToolCallState(dynamicToolPart("input-available"))
    ).toMatchObject({ label: "write_file" })
  })

  it("prefers part.title over the derived tool name", () => {
    expect(
      getToolCallState(toolPart("input-streaming", { title: "Listing files" }))
    ).toMatchObject({ label: "Listing files" })
    expect(
      getToolCallState(dynamicToolPart("input-streaming", { title: "Writing" }))
    ).toMatchObject({ label: "Writing" })
  })

  it("returns null for non-tool parts", () => {
    expect(
      getToolCallState({ type: "text", text: "hello" } as unknown as AnyPart)
    ).toBeNull()
    expect(
      getToolCallState({
        type: "reasoning",
        text: "hmm",
        state: "done",
      } as unknown as AnyPart)
    ).toBeNull()
    expect(getToolCallState(null as unknown as AnyPart)).toBeNull()
  })
})
