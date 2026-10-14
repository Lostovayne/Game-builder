import { clerkClient } from "@clerk/nextjs/server"

import { creditLedger } from "@/db/schema"
import { db } from "@/lib/db"

// Derived from the client instead of imported from @clerk/backend: that
// package is a transitive dependency (pnpm strict layout keeps it unresolvable
// from here), and the re-exported client already carries the exact types.
type ClerkClient = Awaited<ReturnType<typeof clerkClient>>
type OrganizationBillingSubscription = Awaited<
  ReturnType<ClerkClient["billing"]["getOrganizationBillingSubscription"]>
>

/** +$10.00 of credits per paid month, in billionths of a dollar. */
const MONTHLY_CREDITS = 10_000_000_000n

function isResourceNotFound(error: unknown): boolean {
  const errors = (error as { errors?: { code?: string }[] })?.errors
  return errors?.[0]?.code === "resource_not_found"
}

/** UTC `YYYY-MM` keys for every month from `from` through `through`, inclusive. */
function monthKeys(from: Date, through: Date): string[] {
  const months: string[] = []
  let year = from.getUTCFullYear()
  let month = from.getUTCMonth()

  while (
    year < through.getUTCFullYear() ||
    (year === through.getUTCFullYear() && month <= through.getUTCMonth())
  ) {
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`)
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return months
}

/**
 * Grants the org +$10.00 in credits for every month its subscription has paid
 * for, as one append-only `credit_ledger` row per month. The row's key is
 * deterministic (`subscription:<subId>:<YYYY-MM>`) and the insert yields to
 * the ledger's unique (org, entry_key) constraint, so reconciling twice never
 * grants the same month twice.
 */
export async function reconcileCredits(orgId: string): Promise<void> {
  const client = await clerkClient()

  let subscription: OrganizationBillingSubscription
  try {
    subscription =
      await client.billing.getOrganizationBillingSubscription(orgId)
  } catch (error) {
    // A free org has no subscription at all — nothing to grant.
    if (isResourceNotFound(error)) {
      return
    }
    throw error
  }

  // Only a subscription that has actually billed counts: `upcoming` has not
  // started and `ended` has nothing left to grant.
  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return
  }

  const startedAt = new Date(subscription.activeAt ?? subscription.createdAt)

  // A cancellation at period end keeps `periodEnd` on the item; months past
  // it were never paid for. A future `periodEnd` (auto-renewal) must not push
  // grants past today.
  const periodEnds = subscription.subscriptionItems
    .map((item) => item.periodEnd)
    .filter((end): end is number => end != null)
  const cutoff = new Date(
    periodEnds.length > 0
      ? Math.min(Date.now(), Math.max(...periodEnds))
      : Date.now()
  )

  for (const month of monthKeys(startedAt, cutoff)) {
    await db
      .insert(creditLedger)
      .values({
        orgId,
        entryKey: `subscription:${subscription.id}:${month}`,
        amount: MONTHLY_CREDITS,
      })
      .onConflictDoNothing()
  }
}
