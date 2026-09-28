import { describe, expect, it, vi } from "vitest"

import {
  TITLE_POLL_INTERVAL_MS,
  TITLE_POLL_WINDOW_MS,
  isProvisionalTitle,
  isTitleRefined,
  nextTitlePollDelay,
  pollForRefinedTitle,
  provisionalTitleFromPrompt,
  seedPromptFromMessages,
  shouldPreloadInitialChat,
  toProvisionalTitle,
} from "@/lib/games/title-refresh"

describe("seedPromptFromMessages", () => {
  it("returns the text of the first user message", () => {
    expect(
      seedPromptFromMessages([
        { role: "user", parts: [{ type: "text", text: "Voxel survival" }] },
        { role: "assistant", parts: [{ type: "text", text: "Sure" }] },
      ])
    ).toBe("Voxel survival")
  })

  it("joins multiple text parts and trims surrounding whitespace", () => {
    expect(
      seedPromptFromMessages([
        {
          role: "user",
          parts: [
            { type: "text", text: "  Voxel " },
            { type: "text", text: "survival  " },
          ],
        },
      ])
    ).toBe("Voxel survival")
  })

  it("ignores non-text parts", () => {
    expect(
      seedPromptFromMessages([
        {
          role: "user",
          parts: [
            { type: "file", text: "ignored" },
            { type: "text", text: "Voxel survival" },
          ],
        },
      ])
    ).toBe("Voxel survival")
  })

  it("returns null without a user message or with blank text", () => {
    expect(seedPromptFromMessages([])).toBeNull()
    expect(
      seedPromptFromMessages([
        { role: "assistant", parts: [{ type: "text", text: "hi" }] },
      ])
    ).toBeNull()
    expect(
      seedPromptFromMessages([
        { role: "user", parts: [{ type: "text", text: "   " }] },
      ])
    ).toBeNull()
  })
})

describe("shouldPreloadInitialChat", () => {
  it("is true for one seeded user message with no hydrated session", () => {
    expect(
      shouldPreloadInitialChat({
        hasSession: false,
        messages: [{ role: "user" }],
      })
    ).toBe(true)
  })

  it("is false when the session is already hydrated", () => {
    expect(
      shouldPreloadInitialChat({
        hasSession: true,
        messages: [{ role: "user" }],
      })
    ).toBe(false)
  })

  it("is false without exactly one message", () => {
    expect(shouldPreloadInitialChat({ hasSession: false, messages: [] })).toBe(
      false
    )
    expect(
      shouldPreloadInitialChat({
        hasSession: false,
        messages: [{ role: "user" }, { role: "assistant" }],
      })
    ).toBe(false)
  })

  it("is false when the sole message is not a user message", () => {
    expect(
      shouldPreloadInitialChat({
        hasSession: false,
        messages: [{ role: "assistant" }],
      })
    ).toBe(false)
  })
})

describe("toProvisionalTitle", () => {
  it("collapses whitespace and trims, keeping short prompts intact", () => {
    expect(toProvisionalTitle("  A   game\tabout\n voxels  ")).toBe(
      "A game about voxels"
    )
  })

  it("falls back to Untitled game for whitespace-only input", () => {
    expect(toProvisionalTitle("   \n\t  ")).toBe("Untitled game")
  })

  it("truncates longer prompts to the first 57 trimmed chars plus an ellipsis", () => {
    const prompt =
      "A very long prompt that comfortably exceeds the sixty character limit"
    const title = toProvisionalTitle(prompt)
    expect(title).toBe(`${prompt.slice(0, 57).trimEnd()}…`)
    expect(title.endsWith("…")).toBe(true)
  })

  it("does not truncate a 60-character prompt", () => {
    const prompt = "x".repeat(60)
    expect(toProvisionalTitle(prompt)).toBe(prompt)
  })
})

describe("provisionalTitleFromPrompt", () => {
  it("applies the same rule as the persisted provisional title", () => {
    const prompt = "Make a fast voxel survival game"
    expect(provisionalTitleFromPrompt(prompt)).toBe(prompt)
  })

  it("keeps a truncated long prompt within the 120-character cap", () => {
    const long = "a".repeat(200)
    expect(provisionalTitleFromPrompt(long)).toBe(`${long.slice(0, 57)}…`)
    expect(provisionalTitleFromPrompt(long).length).toBeLessThanOrEqual(120)
  })
})

describe("isProvisionalTitle", () => {
  it("is true when the stored title is the exact derived provisional title", () => {
    expect(
      isProvisionalTitle({
        initialTitle: provisionalTitleFromPrompt("Voxel survival"),
        seedPrompt: "Voxel survival",
      })
    ).toBe(true)
  })

  it("is true after whitespace-only differences in the seed prompt", () => {
    expect(
      isProvisionalTitle({
        initialTitle: "Voxel survival",
        seedPrompt: "  Voxel   survival  ",
      })
    ).toBe(true)
  })

  it("is true for a long prompt truncated the same way as the provisional title", () => {
    const prompt =
      "A very long prompt that comfortably exceeds the sixty character limit"
    expect(
      isProvisionalTitle({
        initialTitle: provisionalTitleFromPrompt(prompt),
        seedPrompt: prompt,
      })
    ).toBe(true)
  })

  it("is false once the title is final, so a finished game is never polled", () => {
    expect(
      isProvisionalTitle({
        initialTitle: "Voxel Kingdom",
        seedPrompt: "Voxel survival",
      })
    ).toBe(false)
  })

  it("is false without a seed prompt to match against", () => {
    expect(
      isProvisionalTitle({ initialTitle: "Voxel survival", seedPrompt: null })
    ).toBe(false)
    expect(
      isProvisionalTitle({
        initialTitle: "Voxel survival",
        seedPrompt: undefined,
      })
    ).toBe(false)
  })

  it("is false for a user-renamed title that differs from the provisional one", () => {
    expect(
      isProvisionalTitle({
        initialTitle: "My own title",
        seedPrompt: "Voxel survival",
      })
    ).toBe(false)
  })
})

describe("isTitleRefined", () => {
  it("is false while the server still reports the initial title", () => {
    expect(
      isTitleRefined({
        initialTitle: "A game about voxels",
        currentTitle: "A game about voxels",
      })
    ).toBe(false)
  })

  it("is false for empty, whitespace, or missing titles", () => {
    expect(isTitleRefined({ initialTitle: "Seed", currentTitle: "" })).toBe(
      false
    )
    expect(isTitleRefined({ initialTitle: "Seed", currentTitle: "   " })).toBe(
      false
    )
    expect(isTitleRefined({ initialTitle: "Seed", currentTitle: null })).toBe(
      false
    )
    expect(
      isTitleRefined({ initialTitle: "Seed", currentTitle: undefined })
    ).toBe(false)
  })

  it("ignores surrounding whitespace when comparing", () => {
    expect(
      isTitleRefined({
        initialTitle: "Voxel Kingdom",
        currentTitle: "  Voxel Kingdom  ",
      })
    ).toBe(false)
  })

  it("is true once the server reports a different title", () => {
    expect(
      isTitleRefined({
        initialTitle: "A game about voxels",
        currentTitle: "Voxel Kingdom",
      })
    ).toBe(true)
  })
})

describe("nextTitlePollDelay", () => {
  it("keeps polling inside the bounded window", () => {
    expect(TITLE_POLL_INTERVAL_MS).toBe(1500)
    expect(TITLE_POLL_WINDOW_MS).toBe(24_000)
    expect(nextTitlePollDelay({ attempt: 1 })).toBe(TITLE_POLL_INTERVAL_MS)
    expect(nextTitlePollDelay({ attempt: 15 })).toBe(TITLE_POLL_INTERVAL_MS)
  })

  it("stops at the window boundary", () => {
    expect(nextTitlePollDelay({ attempt: 16 })).toBeNull()
    expect(nextTitlePollDelay({ attempt: 99 })).toBeNull()
  })

  it("honors a custom interval and window", () => {
    expect(
      nextTitlePollDelay({ attempt: 1, intervalMs: 100, windowMs: 300 })
    ).toBe(100)
    expect(
      nextTitlePollDelay({ attempt: 2, intervalMs: 100, windowMs: 300 })
    ).toBe(100)
    expect(
      nextTitlePollDelay({ attempt: 3, intervalMs: 100, windowMs: 300 })
    ).toBeNull()
  })
})

describe("pollForRefinedTitle", () => {
  it("stops and reports exactly once as soon as the title refines", async () => {
    const onRefined = vi.fn()
    const sleeps: number[] = []
    const fetchTitle = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("Provisional seed")
      .mockResolvedValueOnce("Provisional seed")
      .mockResolvedValueOnce("Voxel Kingdom")

    const outcome = await pollForRefinedTitle({
      initialTitle: "Provisional seed",
      fetchTitle,
      onRefined,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })

    expect(outcome).toBe("refined")
    expect(fetchTitle).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([TITLE_POLL_INTERVAL_MS, TITLE_POLL_INTERVAL_MS])
    expect(onRefined).toHaveBeenCalledTimes(1)
    expect(onRefined).toHaveBeenCalledWith("Voxel Kingdom")
  })

  it("stops as exhausted after the bounded number of polls", async () => {
    const onRefined = vi.fn()
    const sleeps: number[] = []
    const fetchTitle = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("Provisional seed")

    const outcome = await pollForRefinedTitle({
      initialTitle: "Provisional seed",
      fetchTitle,
      onRefined,
      intervalMs: 100,
      windowMs: 300,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })

    expect(outcome).toBe("exhausted")
    expect(fetchTitle).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([100, 100])
    expect(onRefined).not.toHaveBeenCalled()
  })

  it("stops immediately when cancelled before the first poll", async () => {
    const onRefined = vi.fn()
    const fetchTitle = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("Voxel Kingdom")

    const outcome = await pollForRefinedTitle({
      initialTitle: "Provisional seed",
      fetchTitle,
      onRefined,
      isCancelled: () => true,
      sleep: async () => {},
    })

    expect(outcome).toBe("cancelled")
    expect(fetchTitle).not.toHaveBeenCalled()
    expect(onRefined).not.toHaveBeenCalled()
  })

  it("stops as cancelled when cancellation happens after a poll", async () => {
    const onRefined = vi.fn()
    const fetchTitle = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("Provisional seed")
    let checks = 0

    const outcome = await pollForRefinedTitle({
      initialTitle: "Provisional seed",
      fetchTitle,
      onRefined,
      isCancelled: () => {
        checks += 1
        return checks > 1
      },
      sleep: async () => {},
    })

    expect(outcome).toBe("cancelled")
    expect(fetchTitle).toHaveBeenCalledTimes(1)
    expect(onRefined).not.toHaveBeenCalled()
  })

  it("keeps polling through a failed fetch instead of giving up", async () => {
    const onRefined = vi.fn()
    const fetchTitle = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce("Voxel Kingdom")

    const outcome = await pollForRefinedTitle({
      initialTitle: "Provisional seed",
      fetchTitle,
      onRefined,
      sleep: async () => {},
    })

    expect(outcome).toBe("refined")
    expect(fetchTitle).toHaveBeenCalledTimes(2)
    expect(onRefined).toHaveBeenCalledWith("Voxel Kingdom")
  })
})
