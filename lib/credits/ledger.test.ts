import { beforeEach, describe, expect, it, vi } from "vitest"

const { auth, select, from, where, state } = vi.hoisted(() => {
  const state = { total: "0" }
  const where = vi.fn(async () => [{ total: state.total }])
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  const auth = vi.fn(
    async (): Promise<{ orgId: string | null }> => ({ orgId: "org_1" })
  )
  return { auth, select, from, where, state }
})

vi.mock("@clerk/nextjs/server", () => ({ auth }))

vi.mock("@/lib/db", () => ({ db: { select } }))

import { getCreditBalance } from "./ledger"

beforeEach(() => {
  vi.clearAllMocks()
  state.total = "0"
  auth.mockResolvedValue({ orgId: "org_1" })
})

describe("getCreditBalance", () => {
  it("reads exactly $1.00 for an org with no ledger rows", async () => {
    await expect(getCreditBalance()).resolves.toBe(1_000_000_000n)
  })

  it("adds the free $1.00 on top of the org's rows", async () => {
    state.total = "25000000000" // $25.00 of ledger entries

    await expect(getCreditBalance()).resolves.toBe(26_000_000_000n)
  })

  it("keeps negative balances negative", async () => {
    state.total = "-5000000000" // $5.00 spent beyond grants

    await expect(getCreditBalance()).resolves.toBe(-4_000_000_000n)
  })

  it("sums only the signed-in org's rows", async () => {
    state.total = "123456789"

    await getCreditBalance()

    expect(select).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledTimes(1)
  })

  it("returns the free $1.00 without touching the database when signed out", async () => {
    auth.mockResolvedValue({ orgId: null })

    await expect(getCreditBalance()).resolves.toBe(1_000_000_000n)
    expect(select).not.toHaveBeenCalled()
  })
})
