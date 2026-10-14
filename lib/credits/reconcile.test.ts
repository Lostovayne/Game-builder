import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  getOrganizationBillingSubscription,
  insert,
  values,
  onConflictDoNothing,
} = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn(async () => [])
  const values = vi.fn(
    (_row: { orgId: string; entryKey: string; amount: bigint }) => ({
      onConflictDoNothing,
    })
  )
  const insert = vi.fn(() => ({ values }))
  const getOrganizationBillingSubscription = vi.fn(
    async (_organizationId: string): Promise<unknown> => undefined
  )
  return {
    getOrganizationBillingSubscription,
    insert,
    values,
    onConflictDoNothing,
  }
})

vi.mock("@clerk/nextjs/server", () => ({
  // In @clerk/nextjs v7 `clerkClient` is an async factory, not an object.
  clerkClient: vi.fn(async () => ({ billing: { getOrganizationBillingSubscription } })),
}))

vi.mock("@/lib/db", () => ({ db: { insert } }))

import { reconcileCredits } from "./reconcile"

const MONTHLY_CREDITS = 10_000_000_000n

/** A minimal Clerk billing subscription with only what reconcile reads. */
function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    activeAt: Date.UTC(2026, 7, 1), // Aug 1, 2026
    createdAt: Date.UTC(2026, 6, 15),
    subscriptionItems: [{ planPeriod: "month", periodEnd: null }],
    ...overrides,
  }
}

function grantedKeys(): string[] {
  return values.mock.calls.map(([row]) => row.entryKey)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Oct 14, 2026.
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 14)))
  getOrganizationBillingSubscription.mockResolvedValue(subscription())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("reconcileCredits", () => {
  it("grants +$10 for every month paid for since the subscription went active", async () => {
    await reconcileCredits("org_1")

    expect(grantedKeys()).toEqual([
      "subscription:sub_1:2026-08",
      "subscription:sub_1:2026-09",
      "subscription:sub_1:2026-10",
    ])
    for (const [row] of values.mock.calls) {
      expect(row).toMatchObject({ orgId: "org_1", amount: MONTHLY_CREDITS })
    }
  })

  it("never grants the same month twice: every insert yields to the unique key", async () => {
    await reconcileCredits("org_1")

    expect(onConflictDoNothing).toHaveBeenCalledTimes(3)
  })

  it("falls back to createdAt when the subscription never went active", async () => {
    getOrganizationBillingSubscription.mockResolvedValue(
      subscription({ activeAt: null, createdAt: Date.UTC(2026, 8, 2) })
    )

    await reconcileCredits("org_1")

    expect(grantedKeys()).toEqual([
      "subscription:sub_1:2026-09",
      "subscription:sub_1:2026-10",
    ])
  })

  it("grants for past_due subscriptions — they have already been billed", async () => {
    getOrganizationBillingSubscription.mockResolvedValue(
      subscription({ status: "past_due" })
    )

    await reconcileCredits("org_1")

    expect(grantedKeys()).toHaveLength(3)
  })

  it("grants nothing for ended or upcoming subscriptions", async () => {
    getOrganizationBillingSubscription.mockResolvedValue(
      subscription({ status: "ended" })
    )
    await reconcileCredits("org_1")

    getOrganizationBillingSubscription.mockResolvedValue(
      subscription({ status: "upcoming" })
    )
    await reconcileCredits("org_1")

    expect(insert).not.toHaveBeenCalled()
  })

  it("stops at the item's period end after a cancellation", async () => {
    getOrganizationBillingSubscription.mockResolvedValue(
      subscription({
        subscriptionItems: [
          // Cancelled effective Sep 20, 2026.
          { planPeriod: "month", periodEnd: Date.UTC(2026, 8, 20) },
        ],
      })
    )

    await reconcileCredits("org_1")

    expect(grantedKeys()).toEqual([
      "subscription:sub_1:2026-08",
      "subscription:sub_1:2026-09",
    ])
  })

  it("treats a missing subscription as nothing to grant", async () => {
    getOrganizationBillingSubscription.mockRejectedValue({
      errors: [{ code: "resource_not_found" }],
    })

    await expect(reconcileCredits("org_1")).resolves.toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
  })

  it("rethrows unexpected Clerk failures", async () => {
    getOrganizationBillingSubscription.mockRejectedValue(new Error("boom"))

    await expect(reconcileCredits("org_1")).rejects.toThrow("boom")
  })
})
