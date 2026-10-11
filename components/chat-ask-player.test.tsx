/**
 * @vitest-environment happy-dom
 *
 * The ask_player question is a one-item questionnaire: the player picks one
 * of 2-4 options and the answer ({ id, label }) goes back to the agent via
 * addToolOutput. These tests drive the real Questionnaire primitive — the
 * wiring to the chat thread is covered in chat-thread.test.tsx.
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AskPlayerInput } from "@/lib/games/ask-player"

import { ChatAskPlayer } from "./chat-ask-player"

// React's act() requires this flag outside of a test renderer.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const input: AskPlayerInput = {
  dimension: "world",
  question: "What is the setting of the game?",
  options: [
    {
      id: "deep-sea",
      label: "Deep sea",
      description: "Slow drift through blue dark water",
    },
    {
      id: "orbit",
      label: "Derelict orbit",
      description: "Low-g floating through a dead station",
    },
  ],
}

let root: Root | undefined
let container: HTMLDivElement | undefined

function render(busy: boolean) {
  const onAnswer = vi.fn()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ChatAskPlayer input={input} busy={busy} onAnswer={onAnswer} />
    )
  })
  return onAnswer
}

function form(): HTMLFormElement {
  const element = container?.querySelector("form")
  if (!element) throw new Error("no questionnaire form rendered")
  return element
}

function submit() {
  act(() => {
    form().dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    )
  })
}

function pickOption(index: number) {
  const radios = [
    ...container!.querySelectorAll<HTMLInputElement>("input[type=radio]"),
  ]
  const radio = radios[index]
  if (!radio) throw new Error(`no radio at index ${index}`)
  act(() => {
    radio.click()
  })
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("ChatAskPlayer", () => {
  it("renders the question and every option with its description", () => {
    render(false)

    expect(form().textContent).toContain("What is the setting of the game?")
    expect(form().textContent).toContain("Deep sea")
    expect(form().textContent).toContain("Slow drift through blue dark water")
    expect(form().textContent).toContain("Derelict orbit")
  })

  it("answers with the chosen option's id and label on submit", () => {
    const onAnswer = render(false)

    pickOption(1)
    submit()

    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer).toHaveBeenCalledWith({
      id: "orbit",
      label: "Derelict orbit",
    })
  })

  it("answers nothing when submitted without a choice", () => {
    const onAnswer = render(false)

    submit()

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it("freezes the question while a turn is busy", () => {
    render(true)

    const fieldset = container!.querySelector("fieldset")
    expect(fieldset).not.toBeNull()
    expect(fieldset!.hasAttribute("disabled")).toBe(true)
  })
})
