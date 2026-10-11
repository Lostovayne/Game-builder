/**
 * @vitest-environment happy-dom
 *
 * Wiring tests for the ask_player human-in-the-loop state in ChatThread:
 *
 * 1. A pending `tool-ask_player` call renders the questionnaire (not an
 *    endlessly-running tool marker) with the question and its options.
 * 2. Answering calls `addToolOutput` with the exact tool name, call id and
 *    `{ id, label }` payload the agent's outputSchema validates.
 * 3. `sendAutomaticallyWhen` stays disarmed while the question waits for the
 *    player and fires the continuation turn the moment the answer resolves
 *    the pending call.
 *
 * SDK boundaries are mocked; the Questionnaire primitive runs for real.
 */
import type { UIMessage } from "ai"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const chatMock = vi.hoisted(() => ({
  addToolOutput: vi.fn(),
  useChatOptions: undefined as undefined | Record<string, unknown>,
  status: "ready" as string,
}))

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: Record<string, unknown>) => {
    chatMock.useChatOptions = options
    return {
      messages: options.messages,
      sendMessage: vi.fn(),
      stop: vi.fn(),
      status: chatMock.status,
      error: null,
      regenerate: vi.fn(),
      setMessages: vi.fn(),
      addToolOutput: chatMock.addToolOutput,
    }
  },
}))

vi.mock("@trigger.dev/sdk/chat/react", () => ({
  useTriggerChatTransport: () => ({
    stopGeneration: vi.fn(),
    preload: vi.fn(),
    clearSupersedeGate: vi.fn(),
  }),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}))

vi.mock("@/lib/chat/actions", () => ({
  mintGameAccessToken: vi.fn(),
  startGameSession: vi.fn(),
  getGameMessages: vi.fn(async () => []),
}))

vi.mock("@/lib/games/actions", () => ({
  getGameTitle: vi.fn(async () => "My Game"),
}))

vi.mock("@/components/chat-composer", () => ({
  ChatComposer: () => <div data-testid="composer" />,
}))

import { ChatThread } from "./chat-thread"

// React's act() requires this flag outside of a test renderer.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// happy-dom has no ResizeObserver; the scroller primitive observes its
// viewport with one on mount.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??=
  ObserverStub

const QUESTION = {
  dimension: "world",
  question: "What is the setting?",
  options: [
    { id: "deep-sea", label: "Deep sea", description: "Blue dark water" },
    { id: "orbit", label: "Derelict orbit", description: "A dead station" },
  ],
}

const pendingMessages = [
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: "One thing first." },
      {
        type: "tool-ask_player",
        toolCallId: "call-1",
        input: QUESTION,
        state: "input-available",
      },
    ],
  },
] as unknown as UIMessage[]

let root: Root | undefined
let container: HTMLDivElement | undefined

function render(messages: UIMessage[] = pendingMessages) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ChatThread
        gameId="game-1"
        initialTitle="My Game"
        initialMessages={messages}
      />
    )
  })
}

function submitQuestionnaire() {
  const element = container!.querySelector("form")
  if (!element) throw new Error("no questionnaire form rendered")
  act(() => {
    element.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    )
  })
}

beforeEach(() => {
  chatMock.useChatOptions = undefined
  chatMock.status = "ready"
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.clearAllMocks()
})

describe("ChatThread ask_player human-in-the-loop", () => {
  it("renders the questionnaire for a pending call, not a running marker", () => {
    render()

    expect(
      container!.querySelector("form[data-slot='questionnaire']")
    ).not.toBeNull()
    expect(container!.textContent).toContain("What is the setting?")
    // The pending call must not render as an endlessly running tool marker
    // (the marker would show a code label + "Running").
    expect(container!.querySelector("code")).toBeNull()
  })

  it("submits the player's answer through addToolOutput", () => {
    render()

    const radios = [
      ...container!.querySelectorAll<HTMLInputElement>("input[type=radio]"),
    ]
    act(() => {
      radios[1].click()
    })
    submitQuestionnaire()

    expect(chatMock.addToolOutput).toHaveBeenCalledTimes(1)
    expect(chatMock.addToolOutput).toHaveBeenCalledWith({
      tool: "ask_player",
      toolCallId: "call-1",
      output: { id: "orbit", label: "Derelict orbit" },
    })
  })

  it("fires the continuation only once the answer resolves the call", () => {
    render()

    const sendAutomaticallyWhen = chatMock.useChatOptions?.sendAutomaticallyWhen
    expect(typeof sendAutomaticallyWhen).toBe("function")

    const armed = sendAutomaticallyWhen as (args: {
      messages: UIMessage[]
    }) => boolean
    // Still waiting for the player: nothing may auto-send yet.
    expect(armed({ messages: pendingMessages })).toBe(false)

    const resolved = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "One thing first." },
          {
            type: "tool-ask_player",
            toolCallId: "call-1",
            input: QUESTION,
            output: { id: "orbit", label: "Derelict orbit" },
            state: "output-available",
          },
        ],
      },
    ] as unknown as UIMessage[]
    // The answer landed: the SDK sends the continuation turn by itself.
    expect(armed({ messages: resolved })).toBe(true)
  })
})

function doneTool(id: string) {
  return {
    type: "tool-write_file",
    toolCallId: id,
    input: { path: `${id}.js`, content: "// game" },
    output: { ok: true, path: `${id}.js`, bytes: 8 },
    state: "output-available",
  }
}

describe("ChatThread tool history", () => {
  it("collapses a run of tool calls behind one expandable trigger", () => {
    render([
      {
        id: "b1",
        role: "assistant",
        parts: [
          { type: "text", text: "Writing the files." },
          doneTool("call-1"),
          doneTool("call-2"),
          doneTool("call-3"),
        ],
      },
    ] as unknown as UIMessage[])

    const triggers = container!.querySelectorAll(
      "[data-slot='collapsible-trigger']"
    )
    expect(triggers).toHaveLength(1)
    expect(triggers[0].textContent).toContain("3 tools")
    // Collapsed by default: no marker rows leak into the DOM.
    expect(container!.querySelectorAll("[data-slot='marker']").length).toBe(0)

    act(() => {
      triggers[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(container!.querySelectorAll("[data-slot='marker']").length).toBe(3)
  })

  it("keeps the thinking indicator at the top, not inline at the end", () => {
    chatMock.status = "streaming"
    render([
      {
        id: "b1",
        role: "assistant",
        parts: [
          { type: "text", text: "Built the battle chess.", state: "done" },
        ],
      },
    ] as unknown as UIMessage[])

    const html = container!.innerHTML
    const indicator = html.indexOf("Pensando")
    expect(indicator).toBeGreaterThan(-1)
    // Above the settled text, never appended after it.
    expect(indicator).toBeLessThan(html.indexOf("Built the battle chess."))
  })
})
