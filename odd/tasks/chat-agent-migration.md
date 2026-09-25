# ODD Task — chat-agent-migration: Move AI chat from the Next route handler to a Trigger.dev `chat.agent`

## Objective
Replace `app/api/chat/route.ts` (Vercel AI SDK route handler) with a Trigger.dev `chat.agent` task, keeping behavior identical: same model, same system prompt, same persistence shape, same UI. Auth moves into two server actions; `lastEventId` persistence replaces stream-resumption plumbing (none exists today).

## Feature Name
chat-agent-migration

## Problem
Chat runs inside `POST /api/chat`, a Next.js route handler: no durability across deploys, no resume on mid-stream refresh, Stop never reaches the server, and a cold function invocation sits in front of every turn. The app already has Trigger.dev v4 installed (`trigger/example.ts`, `trigger.config.ts`, project `proj_lgkwxiczjplqdfgdsdpf`, runtime `node-24`) but does not use it for chat.

## Why
Move the conversation onto Trigger's durable session/stream model so a refresh mid-response resumes from `lastEventId`, Stop aborts server-side, and turns survive process churn — without changing the model, prompt, persistence table, or UI.

## Design decisions (locked)

1. **`chatId === gameId`.** The transport has no `chatId` option; `useChat({ id: gameId })` flows the id into `transport.sendMessages`. This binds auth (`getGame(chatId)` ownership at token mint/start) and lets `hydrateMessages({ chatId })` read `games.messages`.
2. **Task id `"game-chat"`, export `gameChat`** from `trigger/chat.ts`. Client imports it with `import type` only (never a value import).
3. **DB stays the source of truth** → `hydrateMessages` (not the `storage` adapter). `hydrateMessages` is deprecated in SDK 4.6.4 (one-time warning, still supported; cannot be combined with `storage`). Flagged for a later follow-up, not changed here.
4. **Persistence lives in `hydrateMessages` (user message, upsert) + `onTurnComplete` (full `uiMessages` + `lastEventId`, one statement = one transaction).** Mirrors the version-pinned migration doc. Do NOT clear `lastEventId` on turn end — it is session-keyed.
5. **Persist only `lastEventId`, never the access token.** A fresh PAT is minted server-side at page load via `auth.createPublicToken` from `@trigger.dev/sdk` (not Clerk), so no credential rests in the DB. `initialSessions` is passed only when `game.lastEventId` is set; `resume` is gated on that same condition, so a brand-new or legacy (route-era) conversation never subscribes with no cursor.
6. **`server-only` fix: `build: { conditions: ["react-server"] }` in `trigger.config.ts`.** `lib/db.ts` and `lib/ai.ts` both do `import "server-only"`, which **throws** on the worker because Trigger's default esbuild conditions are `["trigger.dev","module","node"]` — no `react-server`. The config option is documented for exactly this (`docs/config/config-file.mdx`). Verified safe: only React-ecosystem packages in this tree declare a `react-server` export (`react`, `react-dom`, `react-redux`, `swr`, `client-only`, `server-only`, `@clerk/ui`), none of which the worker imports.
7. **Worker-side persistence is a new, Clerk-free module** (`lib/chat/store.ts`). `lib/games/queries.ts` imports `@clerk/nextjs/server` and `react`'s `cache()` — neither is usable on the Trigger worker (`auth()` has no request store there). Authorization stays at the two server actions + page load, exactly as the migration doc prescribes.
8. **No tools exist** in this app (no `tool(`, no `ToolSet`, no `toModelOutput` anywhere) → nothing moves onto `chat.agent({ tools })`. Do not invent any.
9. **No `resumable-stream` / Redis / `GET /api/chat/[id]/stream` exists** → nothing to delete there. The only deletion is `app/api/chat/route.ts`.
10. **Head Start (`chat.headStart`) is out of scope** — explicitly deferred to a later session.
11. **`streamText` must come from the `run` payload**, never `import { streamText } from "ai"` (silent no-op of compaction/steering/injection), and `abortSignal: signal` is mandatory or Stop keeps generating server-side.

## Scope
Allowed files only:

- `db/schema.ts`
- `trigger/config` → `trigger.config.ts`
- `trigger/chat.ts` (new)
- `lib/chat/store.ts` (new)
- `lib/chat/actions.ts` (new)
- `lib/games/queries.ts`
- `lib/ai.ts` (stale comment references to `app/api/chat/route.ts` only)
- `app/(app)/games/[id]/page.tsx`
- `components/chat-thread.tsx`
- `app/api/chat/route.ts` (delete)
- `odd/tasks/chat-agent-migration.md` (this doc)

## Constraints
- Do not change the model (`getChatModel()` → `GEMINI_CHAT_MODEL`), the system prompt (`"You are a helpful assistant."`), or `reasoning: "none"`.
- Do not touch the StrictMode/auto-fire `regenerate()` effect in `chat-thread.tsx` (lines ~50-78) — only the transport, `id`, `resume`, and props.
- Do not expose `TRIGGER_SECRET_KEY` client-side; no token minting outside the server.
- No new tables — one nullable `text` column on `games`.
- Generated artifacts, code, and comments stay in English.
- No unrelated refactors.

## Checklist (stable IDs)
- [x] T1 — Schema: add `lastEventId: text("last_event_id")` to `games` in `db/schema.ts`; apply with `bun run db:push`.
- [x] T2 — Config: add `build: { conditions: ["react-server"] }` to `trigger.config.ts` so `server-only` resolves to its empty stub on the worker.
- [x] T3 — Store: create `lib/chat/store.ts` (worker-safe, **no** `server-only` marker, **no** Clerk import): `loadGameMessages(gameId)`, `writeGameMessages(gameId, messages)` (used by `hydrateMessages`), `persistGameTurn(gameId, uiMessages, lastEventId)` (single `UPDATE` → one transaction).
- [x] T4 — Agent: create `trigger/chat.ts` exporting `gameChat = chat.agent({ id: "game-chat", hydrateMessages, onTurnComplete, run })`. `hydrateMessages` loads + `upsertIncomingMessage` + writes back when it returns true. `onTurnComplete` calls `persistGameTurn({ uiMessages, lastEventId })`. `run: async ({ messages, signal, streamText }) => streamText({ model: getChatModel(), system: "You are a helpful assistant.", messages, reasoning: "none", abortSignal: signal })`.
- [x] T5 — Actions: create `lib/chat/actions.ts` (`"use server"`) with `startGameSession(params)` wrapping `chat.createStartSessionAction<typeof gameChat>("game-chat")`, and `mintGameAccessToken(chatId)` returning `auth.createPublicToken` scoped to `read/write { sessions: chatId }` (`expirationTime: "1h"`). Both: Clerk `auth()` → no user → throw; `getGame(chatId)` → null → throw (ownership). Token mint imported from `@trigger.dev/sdk`, aliased to avoid clashing with Clerk's `auth`.
- [x] T6 — Queries: add `lastEventId` to `getGame`'s select list; delete `saveGameMessages` (its only caller is the route being deleted).
- [x] T7 — Page: build `initialSessions` when `game.lastEventId` exists (mint fresh PAT server-side, `{ [game.id]: { publicAccessToken, lastEventId } }`) and pass it to `ChatThread`.
- [x] T8 — Client: swap `DefaultChatTransport` → `useTriggerChatTransport<typeof gameChat>({ task: "game-chat", accessToken, startSession, sessions })`; add `id: gameId` and `resume` to `useChat`; add the `initialSessions` prop. Everything else in the component unchanged.
- [x] T9 — Delete `app/api/chat/route.ts`.
- [x] T10 — Stale comment: `lib/ai.ts` doc comment still points at `app/api/chat/route.ts` for the chat model — repoint at `trigger/chat.ts`.
- [x] T11 — Verification: run the Verification commands below and record observed output. Any required command failing forces `partial`.

## Authorized Scope
Exactly the files listed in **Scope**. No new tables, no Head Start, no tools, no `storage` adapter, no changes to `lib/games/actions.ts` (title generation) or `lib/env.ts`.

## Route declaration
Route: **delegated direct** (one writer). Triggers: mapping (4+ files) + write rule (2+ non-trivial files). No SDD artifacts.

## Delivery forecast
≈ 300–350 authored changed lines (additions + deletions) → under the ~400-line budget. Delivery strategy `ask-on-risk`; no chain question triggered. Candidate for review is the work-unit commit on the feature branch (RDD is on for this clone).

## Verification
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run db:push` (schema; documented dev workflow — mutates the Neon dev branch)
- Worker compile/boot: `npx trigger.dev@latest dev` (bounded attempt) — proves `server-only` resolves, env loads, and the agent registers. If it needs interactive login or fails for environmental reasons, report it honestly as blocked, never as success.

## Verification evidence (observed)

| Command | Observed result |
| --- | --- |
| `bun run typecheck` | `tsc --noEmit` → clean, exit 0 (re-run after the cursor fix too) |
| `bun run lint` | `oxlint` → one error, `trigger/example.ts:7:24 no-explicit-any`, exit 1. **Pre-existing**: that file is unmodified vs `main` (confirmed via `git diff --name-only main -- trigger/example.ts` → empty) and the project forbids editing it. |
| `bun run test` | `vitest run` → 1 test file, 3 tests passed, 334ms |
| `bun run db:push` | `drizzle-kit push` → `[✓] Changes applied` (added `games.last_event_id` to the Neon dev branch) |
| `npx trigger.dev@latest dev` (90s bound) | Worker built and reached `Local worker ready on branch: default [node-24]` → proves `server-only` resolves via `build.conditions: ["react-server"]`, the agent registers, and env loads. Printed `[chat.agent] hydrateMessages on "game-chat" is deprecated` — the expected one-time warning from design decision 3. Exit 124 = the timeout bound, not a failure. |

## Deviations
- `app/(app)/games/[id]/page.tsx` now declares `params: Promise<{ id: string }>` instead of `PageProps<"/games/[id]">`. Deleting `app/api/chat/route.ts` left a stale `.next/types` reference (`Cannot find module '../../app/api/chat/route.js'`); the generated `PageProps` global only exists once `.next/types` regenerates, so an explicit, type-safe form removes the dependency on build cache. Behavior unchanged; this was the app's only `PageProps` usage.
- `persistGameTurn` was tightened after review: it writes `lastEventId` only when the turn produced one, instead of `lastEventId ?? null`. Nulling a valid session-keyed cursor would force the next resume to start at `seq 0` and hit the previous turn's stale completion marker.

## Review outcome (RDD)
- Mode: **on** (global). Assessed with `gentle-ai review assess --agent opencode --base-ref 1cda6b1 --committed-only`.
- First attempt returned `unassessable` (`changed_paths: 0`) because untracked files needed an explicit declaration; re-ran with `--untracked-scope=exclude --expected-untracked-inventory=sha256:f4257f210fe51fc39780a77f3aaa6d90f3f6703505dd2ab6dfcf7cee3eddd68c` (the `eligible_untracked_inventory` issued by selectorless STATUS). The untracked files are the installed `.agents/skills/trigger-*` dirs — outside this candidate.
- Result: `risk: medium`, `changed_paths: 11`, `changed_lines: 365`, `review_due: false`, `review_due_reason: under_budget` → **under budget**; stays pending in the slice until a later commit reaches ~400 authored lines. No review transaction opened.
- Verification of record: the writer's command results in the table above, plus parent spot checks (`bun run typecheck` → exit 0, `bun run lint` → only the pre-existing `trigger/example.ts` error).

## Commits
- `42f1232` `feat(chat): migrate route handler to Trigger.dev chat.agent`
- `9d886b8` `fix(chat): preserve lastEventId cursor when a turn produces none`
- this doc

Branch: `feat/chat-agent-migration` (not pushed — delivery is a human decision).
