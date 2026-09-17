# ODD Task — game-messages: Persist full chat thread in games.messages

## Objective
Persist the full chat thread per game in `games.messages` (jsonb) and restore it on load; each turn saves the entire thread with org-scoped ownership checks.

## Feature Name
game-messages

## Problem
Chat history is ephemeral: `POST /api/chat` streams without persistence and `ChatThread` has no history or `gameId` awareness, so refreshing a game loses context.

## Why
Users expect per-game conversation continuity; persistence must be org-scoped without introducing new tables.

## Scope
Allowed files only:
- `db/schema.ts`
- `lib/games/queries.ts` (or `lib/games/messages.ts` if cleaner — prefer `queries.ts`)
- `app/api/chat/route.ts`
- `components/chat-thread.tsx`
- `app/(app)/games/[id]/page.tsx`
- `odd/tasks/game-messages.md` (this doc)

## Constraints
- No new tables.
- `games.messages` is `jsonb` storing `UIMessage[]`, loaded/saved as full thread each turn.
- Org-scoped: all reads/writes filtered by `auth().orgId`; 401 if no user, 404 if game missing/not owned.
- Do not change model (`inclusionai/ling-3.0-flash-fin`) or system prompt.
- Minimal scoped edits; no unrelated refactors.

## Checklist (stable IDs)
- [x] T1 — Schema: add `messages jsonb` to `games` in `db/schema.ts` (`jsonb("messages").notNull().default([]).$type<UIMessage[]>()`, import `jsonb` + `UIMessage` type, keep existing indexes) — observed: file updated, `bun run db:push` applied
- [x] T2 — Queries: extend `getGame` to return `messages` and add `saveGameMessages(gameId, messages)` scoped to `orgId` (server-only, `and(eq(id),eq(orgId))`, update `messages` + `updatedAt`) — observed: queries.ts updated, typecheck passed
- [x] T3 — Chat API: accept `{gameId, messages}`, verify 401/404 ownership, stream via `streamText`/`toUIMessageStream`, persist full thread on finish — observed: route.ts validates 400/401/404 and persists via `toUIMessageStream({originalMessages, onFinish})` → `saveGameMessages`
- [x] T4 — Chat thread: accept `{gameId, initialMessages?, initialMessage?}`, initialize `useChat` with `initialMessages` and include `gameId` in transport/body; preserve creation prompt (`?message=`) once behavior — observed: chat-thread.tsx uses `messages: initialMessages` + `DefaultChatTransport({api:"/api/chat", body:{gameId}})`
- [x] T5 — Game page: pass `game.id` + `game.messages` to `ChatThread` with `initialMessage` from `searchParams` — observed: page.tsx casts `game.messages as UIMessage[]` and renders `<ChatThread gameId initialMessages initialMessage>`
- [x] T6 — Verification: `npx tsc --noEmit` and `bun run db:push` (or `npm run db:push`) — record observed output; any failing required command forces partial status — observed: see Verification Evidence below

## Authorized Scope
`db/schema.ts`, `lib/games/queries.ts`, `app/api/chat/route.ts`, `components/chat-thread.tsx`, `app/(app)/games/[id]/page.tsx`, `odd/tasks/game-messages.md`. No other files. No new tables.

## Acceptance Criteria
- `games.messages` column exists with `jsonb` default `[]` typed as `UIMessage[]`.
- `GET` game loads messages; `POST /api/chat` with `gameId` persists full `UIMessage[]` thread org-scoped.
- `ChatThread` hydrates from `initialMessages` and sends `gameId` on each turn; `?message=` creation prompt still works once.
- `typecheck` passes; `db:push` applied schema change.
- No new tables; ownership checks return 401/404 correctly.

## Applicable Checks
- `npx tsc --noEmit` (or `npm run typecheck`)
- `bun run db:push` (or `npm run db:push`)

## Verification Evidence
- `bun run db:push`: Pulling schema from database ... [✓] Changes applied (injected env from .env.local, pg driver, no diff prompts after T1)
- `npx tsc --noEmit`: (no output) — success
- `npm run typecheck`: `tsc --noEmit` — success (no output)

## Progress Log
- 2026-09-17: Doc created. Engram mirror: created obs-ccfee19435e626ca (#925).
- 2026-09-17: T1 schema added, db:push executed — changes applied.
- 2026-09-17: T2 queries extended (getGame + saveGameMessages org-scoped).
- 2026-09-17: T3 chat API now requires gameId, verifies ownership, persists full thread via toUIMessageStream onFinish.
- 2026-09-17: T4 chat-thread now hydrates from initialMessages and sends gameId in transport body; initialMessage once behavior preserved.
- 2026-09-17: T5 game page passes game.id + game.messages to ChatThread.
- 2026-09-17: T6 verification — tsc --noEmit passed. Doc and Engram mirror updated.

## Engram Mirror
- Mirrored to `game-builder` topic `odd/game-messages/tasks` (initial #925, updated after T6).
