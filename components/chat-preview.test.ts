import { describe, expect, it } from "vitest"

import { resolvePreviewResponse } from "./chat-preview"

describe("resolvePreviewResponse", () => {
  it("resolves a 200 response with a url body to a ready state", () => {
    const result = resolvePreviewResponse(200, {
      url: "https://sandbox.example.daytona.io:8000/?signed=1",
    })

    expect(result).toEqual({
      status: "ready",
      url: "https://sandbox.example.daytona.io:8000/?signed=1",
    })
  })

  it("resolves a 404 response to a no-preview state", () => {
    const result = resolvePreviewResponse(404, {
      error: "No preview available for this game",
    })

    expect(result).toEqual({ status: "no-preview" })
  })

  it("resolves any other non-200 response to a recoverable error state", () => {
    const result = resolvePreviewResponse(502, {
      error: "Failed to generate preview URL",
    })

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it("resolves a 200 response without a string url to an error state, not a ready state", () => {
    const result = resolvePreviewResponse(200, { something: "else" })

    expect(result.status).toBe("error")
  })

  it("resolves a 200 response with a non-object body to an error state", () => {
    const result = resolvePreviewResponse(200, "not json object at all")

    expect(result.status).toBe("error")
  })
})
