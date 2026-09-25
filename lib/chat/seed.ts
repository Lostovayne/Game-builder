import type { UIMessage } from "ai"

// Worker-safe: no Clerk import, no `server-only` marker — same constraint
// as `lib/chat/game-rows.ts`.
//
// Pure precondition for the first-turn history seed. A fresh run boots with
// an empty accumulator even when the database already holds the user's
// first prompt (written out-of-band by `createGame`), so `run([])` would
// throw. Returns a copy of `stored` if and only if `history` is empty and
// `stored` is non-empty; otherwise null (no seeding needed).
export function shouldSeedHistory(
  history: readonly UIMessage[],
  stored: readonly UIMessage[]
): UIMessage[] | null {
  if (history.length > 0 || stored.length === 0) return null
  return [...stored]
}
