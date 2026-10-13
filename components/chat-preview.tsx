"use client"

import { useCallback, useEffect, useState } from "react"

import * as Sentry from "@sentry/nextjs"

import { previewFrameKey } from "@/lib/chat/preview-revision"

/**
 * Pure classification of the preview API response. Extracted from the
 * component so the status-mapping behavior can be unit-tested in the
 * node-only Vitest environment (no DOM runner is configured).
 *
 * - 200 with a string `url` → ready
 * - 404 → the game has no sandbox, so there is nothing to preview
 * - anything else (401, 404 on missing game, 502, malformed body) → a
 *   recoverable error the user can retry
 *
 * The error `reason` is a stable code for querying in Sentry logs; the
 * `message` stays user-facing prose.
 */
export type PreviewResolution =
  | { status: "ready"; url: string }
  | { status: "no-preview" }
  | {
      status: "error"
      message: string
      reason: "unexpected_body" | "unauthorized" | "upstream"
    }

export function resolvePreviewResponse(
  responseStatus: number,
  body: unknown
): PreviewResolution {
  if (responseStatus === 200) {
    const url =
      typeof body === "object" && body !== null && "url" in body
        ? (body as { url: unknown }).url
        : undefined

    if (typeof url === "string" && url.length > 0) {
      return { status: "ready", url }
    }

    return {
      status: "error",
      message: "The preview service returned an unexpected response.",
      reason: "unexpected_body",
    }
  }

  if (responseStatus === 404) {
    return { status: "no-preview" }
  }

  return responseStatus === 401
    ? {
        status: "error",
        message: "Your session expired. Sign in again to load the preview.",
        reason: "unauthorized",
      }
    : {
        status: "error",
        message: "The preview could not be loaded. Try again in a moment.",
        reason: "upstream",
      }
}

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "no-preview" }
  | { kind: "error"; message: string }

/**
 * Live game preview: fetches a short-lived signed Daytona preview URL from
 * the org-scoped API and renders it in an iframe. No Daytona credentials,
 * tokens, or SDK calls ever reach this client code — only the signed URL
 * returned by the server.
 */
export function ChatPreview({
  gameId,
  revision = 0,
}: {
  gameId: string
  /**
   * Bumped by the parent each time a chat turn settles. Because Daytona keeps
   * the same signed preview URL across updates, remounting the iframe on a new
   * revision is what makes the browser re-fetch the regenerated game files
   * from that unchanged URL.
   */
  revision?: number
}) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => {
    Sentry.logger.info("Game preview retry requested", {
      game_id: gameId,
      retry_attempt: attempt + 1,
    })
    setState({ kind: "loading" })
    setAttempt((current) => current + 1)
  }, [gameId, attempt])

  useEffect(() => {
    const controller = new AbortController()

    async function loadPreview() {
      try {
        const response = await fetch(`/api/games/${gameId}/preview`, {
          signal: controller.signal,
        })
        const body: unknown = await response.json().catch(() => undefined)

        if (controller.signal.aborted) {
          return
        }

        const resolution = resolvePreviewResponse(response.status, body)
        switch (resolution.status) {
          case "ready":
            Sentry.logger.info("Game preview loaded", {
              game_id: gameId,
              retry_attempt: attempt,
            })
            setState({ kind: "ready", url: resolution.url })
            break
          case "no-preview":
            Sentry.logger.info("Game preview has no sandbox to render", {
              game_id: gameId,
              retry_attempt: attempt,
            })
            setState({ kind: "no-preview" })
            break
          case "error":
            Sentry.logger.error("Game preview failed to load", {
              game_id: gameId,
              response_status: response.status,
              reason: resolution.reason,
              retry_attempt: attempt,
            })
            setState({ kind: "error", message: resolution.message })
            break
        }
      } catch (error) {
        // Abort on unmount is expected, not a failure worth surfacing.
        if (controller.signal.aborted || isAbortError(error)) {
          return
        }
        Sentry.logger.error("Game preview request threw", {
          game_id: gameId,
          retry_attempt: attempt,
          error_name: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : String(error),
        })
        setState({
          kind: "error",
          message: "The preview could not be loaded. Try again in a moment.",
        })
      }
    }

    void loadPreview()

    return () => {
      controller.abort()
    }
  }, [gameId, attempt])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-hidden">
        {state.kind === "ready" ? (
          <iframe
            key={previewFrameKey(state.url, revision)}
            src={state.url}
            title="Live game preview"
            className="h-full w-full border-0 bg-background"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : state.kind === "loading" ? (
          <output className="p-4 text-sm text-muted-foreground">
            Loading game preview…
          </output>
        ) : state.kind === "no-preview" ? (
          <p className="p-4 text-sm text-muted-foreground">
            There is no preview available for this game yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <p role="alert" className="text-sm text-muted-foreground">
              {state.message}
            </p>
            <button
              type="button"
              onClick={retry}
              className="w-fit rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
