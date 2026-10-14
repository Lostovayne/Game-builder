/** The ledger stores billionths of a dollar; one cent is 10 million of them. */
const BILLIONTHS_PER_CENT = 10_000_000n

/**
 * Renders a ledger amount (billionths of a dollar) as dollars, e.g.
 * `8_800_000_000n` → `$8.80`. Rounds half up to the nearest cent.
 */
export function formatCredits(amount: bigint): string {
  // Round in integer space first: passing billionths straight to Number would
  // silently lose precision for large balances.
  const cents =
    amount < 0n
      ? -((-amount + BILLIONTHS_PER_CENT / 2n) / BILLIONTHS_PER_CENT)
      : (amount + BILLIONTHS_PER_CENT / 2n) / BILLIONTHS_PER_CENT

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents) / 100)
}
