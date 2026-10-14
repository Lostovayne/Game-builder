import { describe, expect, it, vi } from "vitest"

const { protect, auth, reconcileCredits, getCreditBalance } = vi.hoisted(
  () => {
    const protect = vi.fn(async () => {})
    const auth = vi.fn(async () => ({ orgId: "org_123" }))
    const reconcileCredits = vi.fn(async () => {})
    const getCreditBalance = vi.fn(async () => 4_200_000_000n)
    return { protect, auth, reconcileCredits, getCreditBalance }
  }
)

vi.mock("@clerk/nextjs/server", () => ({
  // Clerk's `auth` is callable AND carries `.protect` as a property.
  auth: Object.assign(auth, { protect }),
}))

vi.mock("@clerk/nextjs", () => ({
  PricingTable: function PricingTable() {
    return null
  },
}))

vi.mock("@/lib/credits/reconcile", () => ({ reconcileCredits }))
vi.mock("@/lib/credits/ledger", () => ({ getCreditBalance }))

import { PricingTable } from "@clerk/nextjs"

import BillingPage from "./page"

type AnyElement = {
  type?: unknown
  props?: Record<string, unknown>
}

/** Walks an element tree through children AND props (e.g. `render={<Link/>}`). */
function collect(
  node: unknown,
  match: (element: AnyElement) => boolean,
  acc: AnyElement[] = []
): AnyElement[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return acc
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, match, acc)
    return acc
  }
  if (typeof node !== "object") return acc

  const element = node as AnyElement
  if (match(element)) acc.push(element)

  for (const value of Object.values(element.props ?? {})) {
    collect(value, match, acc)
  }
  return acc
}

/** Concatenates every string a tree renders, so copy can be asserted verbatim. */
function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return ""
  }
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(text).join("")
  if (typeof node !== "object") return ""
  return text((node as AnyElement).props?.children)
}

describe("BillingPage", () => {
  it("requires an authenticated session", async () => {
    await BillingPage()

    expect(protect).toHaveBeenCalledWith({ unauthenticatedUrl: "/sign-in" })
  })

  it("reconciles the org's subscription before showing the balance", async () => {
    await BillingPage()

    expect(reconcileCredits).toHaveBeenCalledWith("org_123")
  })

  it("shows the org's reconciled credit balance", async () => {
    const tree = await BillingPage()

    expect(getCreditBalance).toHaveBeenCalledTimes(1)
    expect(text(tree)).toContain("$4.20")
  })

  it("renders exactly one PricingTable bound to organizations", async () => {
    const tree = await BillingPage()

    const tables = collect(tree, (element) => element.type === PricingTable)

    expect(tables).toHaveLength(1)
    expect(tables[0].props?.for).toBe("organization")
  })

  it("exposes Billing as the page's only h1, keeping the bar's type scale", async () => {
    const tree = await BillingPage()

    const headings = collect(tree, (element) => element.type === "h1")

    expect(headings).toHaveLength(1)
    expect(text(headings[0])).toBe("Billing")

    // Tailwind preflight resets `h1` to `font-size: inherit; font-weight:
    // inherit`, so the bar's 14px/medium label must live on the heading
    // itself — otherwise the title silently grows to the inherited size.
    expect(headings[0].props?.className).toContain("text-sm")
    expect(headings[0].props?.className).toContain("font-medium")
  })

  it("shows the credits copy and plan section heading verbatim", async () => {
    const tree = await BillingPage()

    const content = text(tree)

    expect(content).toContain("Available credits")
    expect(content).toContain("Keep the studio running")
    expect(content).toContain(
      "Builder adds $10.00 every month, and unused credits roll over."
    )
    expect(content).toContain(
      "Credits cover the models that build and revise your games. A scene already in progress can finish below zero; the next build waits for more credits."
    )
  })
})
