# ODD Task — seed-creation-prompt: Seed first user message at game creation

## Objective
When the landing composer submits the initial prompt, create the game with that prompt already stored as the first `user` `UIMessage` in `games.messages`, redirect to the new game view, and have the thread request the assistant reply for that seeded message — without the fragile `?message=` URL handoff.

## Feature Name
seed-creation-prompt

## Problem
The creation prompt is only carried via `?message=` on the redirect URL and re-sent from a client `useEffect` in `ChatThread`. That path is brittle (StrictMode aborts the send; refresh can replay or drop it) and the prompt is not durable until the first chat turn finishes.

## Why
Seeding the first message in the same `INSERT` as the game makes the prompt durable, keeps the URL clean, and lets the sidebar/layout revalidation in the server action show the new game immediately.

## Scope
Allowed files only:
- `lib/games/actions.ts` — seed `messages` + layout revalidation
- `components/create-game-composer.tsx` — redirect without `?message=`
- `app/(app)/games/[id]/page.tsx` — drop `initialMessage` / `searchParams.message`
- `components/chat-thread.tsx` — drop `initialMessage`; auto-`regenerate()` when the thread is exactly one seeded user message
- `README.md` — update the "How it works" flow diagram only
- `odd/tasks/seed-creation-prompt.md` (this doc)

## Constraints
- No schema changes; no new tables; `games.messages` stays `UIMessage[]` jsonb.
- Seed shape: `{ id: generateId() from "ai", role: "user", parts: [{ type: "text", text: prompt }] }` (installed AI SDK v7 exports `generateId`, not `generateMessageId`).
- Remove the `?message=` / `initialMessage` handoff entirely (do not keep both paths).
- Auto-response only when `messages.length === 1` and that message is `role === "user"` (creation orphan / recovery). Normal user sends keep going through `handleSend` → `sendMessage`.
- StrictMode-safe: bounded retries when `regenerate()` is aborted on remount; never auto-respond once an assistant message exists.
- Keep `createGame` title generation (`generateText`) unchanged.
- Revalidate so the `(app)` layout sidebar picks up the new game: `revalidatePath("/", "layout")` (replace the current `revalidatePath("/")`).
- Do not change model, system prompt, or `/api/chat` persistence behavior.

## Checklist (stable IDs)
- [x] T1 — `createGame`: insert `messages` with the seeded first user `UIMessage`; `revalidatePath("/", "layout")` — route: delegated (writer trigger: part of 2+ non-trivial files) — outcome: done (writer `ses_f3368c1d0ffe8p16cAMvsp473g`)
- [x] T2 — `CreateGameComposer`: `router.push(\`/games/${game.id}\`)` with no query string — route: delegated (same writer) — outcome: done
- [x] T3 — Game page: stop reading `searchParams.message`; stop passing `initialMessage` — route: delegated (same writer) — outcome: done
- [x] T4 — `ChatThread`: remove `initialMessage` prop/`useRouter` URL cleanup; add single-message `regenerate()` effect with StrictMode-safe bounded retries — route: delegated (same writer) — outcome: done
- [x] T5 — README flow diagram reflects seed + clean redirect — route: delegated (same writer) — outcome: done
- [x] T6 — Verification: `npm run typecheck` and `npm run lint` — record observed output; any failing required command forces partial — route: parent (per-action) — outcome: both pass (writer + parent re-run)

## Authorized Scope
Files listed under Scope only. No other source files. No dependency changes. No push/PR unless the user asks.

## Acceptance Criteria
- Creating a game from the landing composer stores the prompt as `messages[0]` (`role: "user"`) in the same insert.
- Redirect is `/games/<id>` with no `?message=`.
- Game view shows the seeded prompt immediately from `initialMessages`.
- Assistant reply is requested automatically exactly for that one-message thread (retries bounded after abort).
- Subsequent loads with an existing assistant reply do not auto-fire.
- Sidebar shows the new game after create (layout revalidated).
- `typecheck` and `lint` pass.

## Applicable Checks
- `npm run typecheck` (`tsc --noEmit`)
- `npm run lint` (`oxlint`)

## TDD
- Mode: **off** (source: no `test` script / no test runner in `package.json`; ordinary functional checks only).
- Test runner: none.
- Focused checks: typecheck + lint + manual create flow if a dev server is available.

## Verification Evidence
- `npm run typecheck` (`tsc --noEmit`): pass, exit 0 (writer + parent re-run)
- `npm run lint` (`oxlint`): pass, exit 0 (writer + parent re-run)
- Parent spot check: full diff reviewed; `prompt` in scope in `createGame`; seed shape, clean redirect, no `?message=` residue, bounded regenerate effect all match acceptance criteria.

## Progress Log
- 2026-09-23: Doc created after codegraph exploration of composer/action/page/thread + AI SDK v7 `regenerate`/`generateId` and Next 16 `revalidatePath`. Branch `feat/seed-creation-prompt`.
- 2026-09-23: T1–T5 implemented by single writer (`ses_f3368c1d0ffe8p16cAMvsp473g`); T6 verified by parent (typecheck + lint pass, diff spot-checked). Ready for work-unit commit.
- 2026-09-23: Bugfix — agent replied twice on create. Root cause: StrictMode's second effect run while `status` still `"ready"` hit the retry branch for the same message id and fired `regenerate()` again. Fix: only retry after observing a non-ready (in-flight) status for that attempt (`sawInFlightRef`). typecheck + lint pass.

## Engram Mirror
- Mirrored to `game-builder` topic `odd/seed-creation-prompt/tasks`.
