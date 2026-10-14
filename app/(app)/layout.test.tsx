import { describe, expect, it, vi } from "vitest"

const { auth, listGames, getCreditBalance, AppSidebar } = vi.hoisted(() => {
  const auth = vi.fn(async () => ({ orgId: "org_1" }))
  const listGames = vi.fn(async () => [{ id: "game_1", title: "Pong" }])
  const getCreditBalance = vi.fn(async () => 21_000_000_000n)
  const AppSidebar = vi.fn(() => null)
  return { auth, listGames, getCreditBalance, AppSidebar }
})

vi.mock("@clerk/nextjs/server", () => ({ auth }))
vi.mock("@/lib/games/queries", () => ({ listGames }))
vi.mock("@/lib/credits/ledger", () => ({ getCreditBalance }))
vi.mock("@/components/app-sidebar", () => ({ AppSidebar }))
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  SidebarInset: ({ children }: { children: React.ReactNode }) => children,
}))

import AppLayout from "./layout"

type AnyElement = {
  type?: unknown
  props?: Record<string, unknown>
}

/** Walks an element tree through children AND props. */
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

describe("AppLayout", () => {
  it("loads the org's credit balance and passes it to the sidebar", async () => {
    const tree = await AppLayout({ children: null })

    expect(getCreditBalance).toHaveBeenCalledTimes(1)

    const sidebars = collect(tree, (element) => element.type === AppSidebar)
    expect(sidebars).toHaveLength(1)
    expect(sidebars[0].props?.credits).toBe("$21.00")
    expect(sidebars[0].props?.games).toEqual([
      { id: "game_1", title: "Pong" },
    ])
  })
})
