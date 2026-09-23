"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { createGame } from "@/lib/games/actions"

/**
 * Controlled-composer wrapper for the landing page: submitting the prompt
 * creates a new game.
 */
export function CreateGameComposer() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(title: string) {
    setError(null)
    startTransition(async () => {
      try {
        const game = await createGame({ title })
        if (!game) {
          throw new Error("Could not create game.")
        }
        setPrompt("")
        // Prompt is seeded server-side in createGame; redirect clean.
        router.push(`/games/${game.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create game.")
      }
    })
  }

  return (
    <ChatComposer
      value={prompt}
      onValueChangeAction={setPrompt}
      onSubmitAction={handleSubmit}
      isSubmitting={isPending}
      error={error}
    />
  )
}
