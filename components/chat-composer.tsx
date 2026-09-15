"use client"

import { ArrowUp, ChevronDown, Grip } from "lucide-react"
import { type SubmitEvent } from "react"

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

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = value.trim()
    if (!text || isSubmitting) return
    onSubmitAction(text)
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <form onSubmit={handleSubmit}>
        <InputGroup>
          <InputGroupTextarea
            rows={1}
            value={value}
            onChange={(event) => onValueChangeAction(event.target.value)}
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
