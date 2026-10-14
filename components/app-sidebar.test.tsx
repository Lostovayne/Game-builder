import { beforeEach, describe, expect, it, vi } from "vitest"

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}))

vi.mock("@clerk/nextjs", () => ({
  OrganizationSwitcher: () => null,
  UserButton: () => null,
}))

import { AppSidebar } from "./app-sidebar"

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

/** The sidebar button whose `render` prop is the `/billing` link. */
function billingEntry(tree: unknown): AnyElement | undefined {
  return collect(
    tree,
    (element) =>
      (element.props?.render as AnyElement | undefined)?.props?.href ===
      "/billing"
  )[0]
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

describe("AppSidebar billing link", () => {
  beforeEach(() => {
    pathname.current = "/"
  })

  it("routes the credits entry to /billing", () => {
    const tree = AppSidebar({ games: [], credits: "$21.00" })

    const entry = billingEntry(tree)

    expect(entry).toBeDefined()
    expect(entry?.props?.isActive).toBe(false)
  })

  it("highlights the credits entry while on /billing", () => {
    pathname.current = "/billing"

    const entry = billingEntry(AppSidebar({ games: [], credits: "$21.00" }))

    expect(entry?.props?.isActive).toBe(true)
  })

  it("shows the balance passed by the layout, not a hardcoded amount", () => {
    const tree = AppSidebar({ games: [], credits: "$21.00" })

    expect(text(tree)).toContain("$21.00")
  })
})
