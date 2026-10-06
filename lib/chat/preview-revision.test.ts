import { describe, expect, it } from "vitest"

import { previewFrameKey } from "./preview-revision"

describe("previewFrameKey", () => {
  const url = "https://sandbox.example.daytona.io:8000/?signed=1"

  it("keeps the same key while the revision is unchanged", () => {
    expect(previewFrameKey(url, 0)).toBe(previewFrameKey(url, 0))
  })

  it("changes the key when the revision advances", () => {
    expect(previewFrameKey(url, 1)).not.toBe(previewFrameKey(url, 0))
  })

  it("embeds the preview url so the frame source stays identical across revisions", () => {
    expect(previewFrameKey(url, 0)).toContain(url)
    expect(previewFrameKey(url, 1)).toContain(url)
  })
})
