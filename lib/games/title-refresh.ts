/**
 * Bounded polling policy for propagating an asynchronously refined game
 * title into an already-mounted sidebar.
 *
 * `createGame` writes a provisional title synchronously, then replaces it
 * inside Next.js `after()` and calls `revalidatePath("/", "layout")`. The
 * server cache is invalidated, but a client that mounted before the update
 * keeps rendering its original RSC payload until it asks for fresh data.
 * These helpers own the "ask once, then stop" decision so the component
 * stays a thin renderer and the policy is testable without a DOM.
 *
 * Deliberately framework-free: no React, no `next/*`. The caller supplies
 * the fetch function, the clock (`sleep`), and the cancellation check.
 */

/** Delay between polls. */
export const TITLE_POLL_INTERVAL_MS = 1500

/** Total time budget for polling before giving up. */
export const TITLE_POLL_WINDOW_MS = 24_000

export type TitlePollOutcome = "refined" | "exhausted" | "cancelled"

/**
 * Instant, zero-LLM provisional title for a game prompt. Lives here so
 * `createGame` and the client-side "is this still provisional?" guard share
 * one exact rule instead of two copies that can drift. Behaviour is
 * unchanged: collapse whitespace to single spaces and trim, keep <=60 chars
 * as-is (empty -> "Untitled game"), otherwise truncate the first 57 trimmed
 * chars and append an ellipsis.
 */
export function toProvisionalTitle(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim()
  if (singleLine.length <= 60) return singleLine || "Untitled game"
  return `${singleLine.slice(0, 57).trimEnd()}…`
}

/**
 * The exact title `createGame` stores before background refinement:
 * `toProvisionalTitle(prompt).slice(0, 120)`. The final slice is a no-op for
 * the current rule but is kept so this matches the persisted value byte for
 * byte.
 */
export function provisionalTitleFromPrompt(prompt: string): string {
  return toProvisionalTitle(prompt).slice(0, 120)
}

/**
 * Whether the game still carries its provisional title, and so is worth
 * polling for the asynchronous refinement.
 *
 * `seedPrompt` is the text of the seeded first user message (the same
 * trimmed prompt passed to `createGame`). When the stored `initialTitle`
 * already equals the derived provisional title, the only outcomes left are
 * a completed refinement or a user rename — neither can be turned into a
 * "refined" title, so polling would be pure waste (up to 16 server calls
 * per game). A missing seed cannot be matched, so it also declines.
 */
export function isProvisionalTitle(input: {
  initialTitle: string
  seedPrompt: string | null | undefined
}): boolean {
  if (input.seedPrompt == null) return false
  return input.initialTitle === provisionalTitleFromPrompt(input.seedPrompt)
}

/**
 * Text of the seeded first user message — the same trimmed prompt
 * `createGame` received. Returns `null` when there is no user message or no
 * non-empty text, in which case the provisional match cannot be made.
 *
 * Structural (not `UIMessage`) so this module stays free of the `ai` types.
 */
export function seedPromptFromMessages(
  messages: ReadonlyArray<{
    role?: string
    parts?: ReadonlyArray<{ type?: string; text?: string }>
  }>
): string | null {
  const first = messages.find((message) => message.role === "user")
  const text = (first?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : undefined))
    .filter((part): part is string => typeof part === "string")
    .join("")
    .trim()
  return text || null
}

/**
 * Whether the initial chat should call `transport.preload(gameId)` on mount.
 *
 * Preload is worth it only in the one narrow flow where a run is guaranteed
 * to be requested within a few milliseconds: a brand-new game whose thread
 * was opened with exactly one seeded user message, so the auto-send effect
 * fires immediately. Preloading there overlaps agent boot with the send
 * instead of doing real speculative work.
 *
 * Deliberately conservative — every other case declines, because preload
 * spends idle compute for a run the user may never trigger:
 * - `hasSession`: a hydrated session already exists (existing conversation,
 *   or a resumed turn), and the SDK's `preload` would no-op anyway.
 * - Any message count other than exactly one: a user chat with no seed, a
 *   transcript with prior turns, or a pending assistant bubble has no
 *   immediate auto-send to overlap.
 * - A sole non-user message: nothing will auto-send from it.
 *
 * Structural message shape (not `UIMessage`) so this module keeps no `ai`
 * dependency.
 */
export function shouldPreloadInitialChat(input: {
  hasSession: boolean
  messages: ReadonlyArray<{ role?: string }>
}): boolean {
  if (input.hasSession) return false
  if (input.messages.length !== 1) return false
  return input.messages[0]?.role === "user"
}

/**
 * Whether `currentTitle` is a genuine refinement of `initialTitle`.
 * Blank/missing titles never count — a failed read must not be mistaken
 * for the completed generation.
 */
export function isTitleRefined(input: {
  initialTitle: string
  currentTitle: string | null | undefined
}): boolean {
  const current = input.currentTitle?.trim()
  if (!current) return false
  return current !== input.initialTitle.trim()
}

/**
 * Delay before the next poll, or `null` when the bounded window is spent.
 * `attempt` is 1-based: attempt 1 is the first fetch. With the default
 * 24s window and 1.5s interval that is 16 polls.
 */
export function nextTitlePollDelay(input: {
  attempt: number
  intervalMs?: number
  windowMs?: number
}): number | null {
  const interval = input.intervalMs ?? TITLE_POLL_INTERVAL_MS
  const window = input.windowMs ?? TITLE_POLL_WINDOW_MS
  if (input.attempt * interval >= window) return null
  return interval
}

/**
 * Poll `fetchTitle` until it reports a title different from
 * `initialTitle`, the window is spent, or `isCancelled` returns true.
 * On refinement `onRefined` runs exactly once, so callers can safely
 * trigger a single `router.refresh()` from it.
 *
 * A rejected `fetchTitle` is swallowed and retried on the next tick:
 * a transient network error is not evidence the generation finished.
 */
export async function pollForRefinedTitle(input: {
  initialTitle: string
  fetchTitle: () => Promise<string | null>
  onRefined: (title: string) => void
  isCancelled?: () => boolean
  intervalMs?: number
  windowMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<TitlePollOutcome> {
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  for (let attempt = 1; ; attempt++) {
    if (input.isCancelled?.()) return "cancelled"

    let currentTitle: string | null
    try {
      currentTitle = await input.fetchTitle()
    } catch {
      // Transient read failure — retry on the next tick.
      currentTitle = null
    }

    if (input.isCancelled?.()) return "cancelled"

    if (isTitleRefined({ initialTitle: input.initialTitle, currentTitle })) {
      input.onRefined(currentTitle as string)
      return "refined"
    }

    const delay = nextTitlePollDelay({
      attempt,
      intervalMs: input.intervalMs,
      windowMs: input.windowMs,
    })
    if (delay === null) return "exhausted"

    await sleep(delay)
  }
}
