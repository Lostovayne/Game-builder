/**
 * @vitest-environment happy-dom
 *
 * Behavioral tests for the two branches GameChat owns:
 *
 * 1. `router.refresh()` fires only when `sandboxId === null` — the sandbox is
 *    usually provisioned during the first chat turn, so the page must refresh
 *    once the turn settles for the preview panel to mount on its own. When
 *    the sandbox already exists, a refresh would throw away scroll position
 *    and re-render the thread for nothing.
 *
 * 2. The preview panel (`#game-chat-preview`) renders only when a sandbox is
 *    persisted — with no sandbox there is nothing to preview.
 *
 * Heavy children are mocked: this suite verifies GameChat's wiring, not the
 * chat thread's internals or the resizable panel library.
 */
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }))

// Captures the live `onTurnSettled` prop so tests can invoke the exact
// callback GameChat passed down, the way the chat thread would.
const chatThreadMock = vi.hoisted(() => ({
  onTurnSettled: undefined as undefined | (() => void),
}))
vi.mock("@/components/chat-thread", () => ({
  ChatThread: (props: { onTurnSettled: () => void }) => {
    chatThreadMock.onTurnSettled = props.onTurnSettled
    return <div data-testid="chat-thread" />
  },
}))

// The revision counter is GameChat's state; surfacing it in the DOM lets the
// tests assert the bump that remounts the preview iframe.
vi.mock("@/components/chat-preview", () => ({
  ChatPreview: ({ revision }: { gameId: string; revision: number }) => (
    <div data-testid="chat-preview" data-revision={revision} />
  ),
}))

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({ id, children }: { id?: string; children?: ReactNode }) => (
    <div id={id}>{children}</div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}))

import { GameChat } from "./game-chat"

// React's act() requires this flag outside of a test renderer.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let root: Root | undefined
let container: HTMLDivElement | undefined

function render(sandboxId: string | null) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <GameChat
        gameId="game-1"
        sandboxId={sandboxId}
        initialTitle="My Game"
      />
    )
  })
}

/** Invokes the callback the chat thread received, inside act(). */
function settleTurn() {
  act(() => {
    chatThreadMock.onTurnSettled?.()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  chatThreadMock.onTurnSettled = undefined
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("GameChat", () => {
  it("mounts the preview panel and handle only when a sandbox is persisted", () => {
    render("sandbox-1")

    expect(document.getElementById("game-chat-preview")).not.toBeNull()
    expect(document.querySelector("[data-testid='resizable-handle']")).not.toBeNull()
    expect(document.querySelector("[data-testid='chat-preview']")).not.toBeNull()
  })

  it("omits the preview panel and handle when there is no sandbox yet", () => {
    render(null)

    // No sandbox → nothing to preview; the thread takes the whole width.
    expect(document.getElementById("game-chat-preview")).toBeNull()
    expect(document.querySelector("[data-testid='resizable-handle']")).toBeNull()
    expect(document.querySelector("[data-testid='chat-preview']")).toBeNull()
    // The conversation is always present.
    expect(document.querySelector("[data-testid='chat-thread']")).not.toBeNull()
  })

  it("refreshes the router after a settled turn when the sandbox was null", () => {
    render(null)

    settleTurn()

    // The refresh is what makes the freshly provisioned preview mount.
    expect(routerMock.refresh).toHaveBeenCalledTimes(1)
  })

  it("does not refresh after a settled turn when the sandbox already exists", () => {
    render("sandbox-1")

    settleTurn()

    // The revision bump below is enough — no page refresh needed.
    expect(routerMock.refresh).not.toHaveBeenCalled()
    // ...and the bump still happens, which is what remounts the iframe.
    expect(
      document.querySelector("[data-testid='chat-preview']")
        ?.getAttribute("data-revision")
    ).toBe("1")
  })
})
