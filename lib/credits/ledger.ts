import { auth } from "@clerk/nextjs/server"
import { eq, sql } from "drizzle-orm"
import { cache } from "react"

import { creditLedger } from "@/db/schema"
import { db } from "@/lib/db"

/** The $1.00 every org starts with, in billionths of a dollar. Not a row. */
const FREE_CREDITS = 1_000_000_000n

/**
 * The org's credit balance in billionths of a dollar: the sum of its
 * `credit_ledger` rows plus the free $1.00 that is deliberately not a row.
 * An org with no rows reads exactly $1.00.
 */
export const getCreditBalance = cache(async (): Promise<bigint> => {
  const { orgId } = await auth()

  if (!orgId) {
    return FREE_CREDITS
  }

  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${creditLedger.amount}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.orgId, orgId))

  // `sum()` over bigint returns a numeric string; BigInt() keeps full
  // precision where Number() would drift.
  return BigInt(rows[0].total) + FREE_CREDITS
})
