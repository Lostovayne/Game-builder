"use client"

import { ArrowUp, ChevronDown, Grip } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"

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
import { createGame } from "@/lib/games/actions"

export function ChatComposer() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSubmit = prompt.trim().length > 0 && !isPending

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = prompt.trim()
    if (!title || isPending) return

    setError(null)
    startTransition(async () => {
      try {
        await createGame({ title })
        setPrompt("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create game.")
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <form onSubmit={handleSubmit}>
        <InputGroup>
          <InputGroupTextarea
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="field-sizing-content max-h-48 min-h-10"
            placeholder="Describe the game you want to build..."
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
