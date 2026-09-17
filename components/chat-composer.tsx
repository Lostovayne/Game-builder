"use client"

import { ArrowUp, ChevronDown, Grip } from "lucide-react"
import { useLayoutEffect, useRef, type SubmitEvent } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

type ChatComposerProps = {
  value: string
  onValueChangeAction: (value: string) => void
  onSubmitAction: (value: string) => void
  isSubmitting?: boolean
  error?: string | null
  placeholder?: string
}

export function ChatComposer({
  value,
  onValueChangeAction,
  onSubmitAction,
  isSubmitting = false,
  error = null,
  placeholder = "Describe the game you want to build...",
}: ChatComposerProps) {
  const canSubmit = value.trim().length > 0 && !isSubmitting
  const pendingSelectionRef = useRef<{
    element: HTMLTextAreaElement
    position: number
  } | null>(null)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = value.trim()
    if (!text || isSubmitting) return
    onSubmitAction(text)
  }

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current
    if (pending === null) return
    const { element, position } = pending
    pendingSelectionRef.current = null
    // Don't move focus if textarea is no longer active
    if (document.activeElement !== element) return
    element.setSelectionRange(position, position)
  }, [value])

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== "Enter") return

    // Guard held Enter repeat so exactly one submit fires
    if (event.repeat) {
      event.preventDefault()
      return
    }

    const isNewlineModifier = event.ctrlKey || event.metaKey

    if (isNewlineModifier) {
      event.preventDefault()
      const target = event.currentTarget
      const start = target.selectionStart ?? value.length
      const end = target.selectionEnd ?? value.length
      const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`
      const nextPosition = start + 1
      pendingSelectionRef.current = { element: target, position: nextPosition }
      onValueChangeAction(nextValue)
      return
    }

    // Preserve other modifiers (Shift+Enter, Alt+Enter) as native newline
    if (event.shiftKey || event.altKey) return

    // Plain Enter submits via the form so empty/isSubmitting guards are retained
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <form onSubmit={handleSubmit}>
        <InputGroup>
          <InputGroupTextarea
            rows={1}
            value={value}
            onChange={(event) => onValueChangeAction(event.target.value)}
            onKeyDown={handleKeyDown}
            className="field-sizing-content max-h-48 min-h-10"
            placeholder={placeholder}
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton size="xs" type="button">
                    <Grip />
                    Kimi K3
                    <ChevronDown />
                  </InputGroupButton>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuItem>Kimi K3</DropdownMenuItem>
                <DropdownMenuItem>Kimi K2</DropdownMenuItem>
                <DropdownMenuItem>GPT-5</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              size="icon-sm"
              variant="default"
              className="rounded-full"
              type="submit"
              disabled={!canSubmit}
              aria-label="Send message"
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
