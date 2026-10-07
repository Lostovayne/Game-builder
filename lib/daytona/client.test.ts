import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The Trigger deploy indexer imports every built module — including this one —
// before any runtime secret exists (no .env.local in the index container).
// The module must therefore be import-safe without DAYTONA_API_KEY and must
// fail only when the client is actually resolved for use.
const sdk = vi.hoisted(() => ({ daytonaConstructor: vi.fn() }))

vi.mock("@daytona/sdk", () => ({ Daytona: sdk.daytonaConstructor }))

const originalApiKey = process.env.DAYTONA_API_KEY

async function importClient() {
  vi.resetModules()
  return await import("@/lib/daytona/client")
}

describe("daytona client", () => {
  beforeEach(() => {
    sdk.daytonaConstructor.mockClear()
    delete process.env.DAYTONA_API_KEY
  })

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.DAYTONA_API_KEY
    } else {
      process.env.DAYTONA_API_KEY = originalApiKey
    }
  })

  it("is import-safe when DAYTONA_API_KEY is absent", async () => {
    await expect(importClient()).resolves.toBeDefined()
  })

  it("throws the env error when the client is resolved without a key", async () => {
    const { getDaytona } = await importClient()
    expect(() => getDaytona()).toThrow("DAYTONA_API_KEY is not set")
    expect(sdk.daytonaConstructor).not.toHaveBeenCalled()
  })

  it("constructs a Daytona instance when the key is present", async () => {
    process.env.DAYTONA_API_KEY = "daytona-test-key"
    const { getDaytona } = await importClient()

    expect(getDaytona()).toBeDefined()
    expect(sdk.daytonaConstructor).toHaveBeenCalledTimes(1)
  })

  it("caches the instance across calls", async () => {
    process.env.DAYTONA_API_KEY = "daytona-test-key"
    const { getDaytona } = await importClient()

    const first = getDaytona()
    const second = getDaytona()

    expect(second).toBe(first)
    expect(sdk.daytonaConstructor).toHaveBeenCalledTimes(1)
  })
})
