# ODD Task — chat-transcript-storage: Replace deprecated `hydrateMessages` with a transcript storage

## Objective
Move `gameChat` off the deprecated `hydrateMessages` hook onto a `TranscriptStorage` adapter over the existing `games` table, following the version-pinned SDK 4.6.4 migration guide (`node_modules/@trigger.dev/sdk/docs/ai-chat/migrating-from-hydrate-messages.mdx`). Same model, prompt, options, auth, UI, and page reads. Kill the boot deprecation warning.

## Feature Name
chat-transcript-storage

## Problem
`bun run trigger:dev` boots with `[chat.agent] hydrateMessages on "game-chat" is deprecated`. The hook still works (one-time warning), but the runtime now owns transcript, crash recovery, compaction state, and resume cursors — our manual `hydrateMessages` + `onTurnComplete` writes duplicate that and miss `state`/partial handling the new contract provides.

## Why
Stay on the supported contract: `save` receives every change, `load` restores boot context, cursors stay runtime-owned. This is the SDK's prescribed swap, not a redesign.

## Prior evaluation (read first)
- The previous implementation was NOT wrong: it followed the then-current route-handler migration guide. The SDK moved the contract afterwards (deprecation is warning-only; boot succeeds). Evidence: `lifecycle-hooks.mdx:264`, `migrating-from-hydrate-messages.mdx:9`.
- Still valid, untouched by this task: managed `streamText` + `abortSignal: signal`; two server actions with Clerk + `getGame` checks; `chatId === gameId`; `build.conditions: ["react-server"]`; Clerk-free worker module; page direct reads + `initialSessions`/`resume` gating; no tools; no Head Start.
- `loadContext` is NOT needed: our hook only persisted incoming + returned history, which `save` + `load` cover (guide: "most agents need nothing more"). No `clientData` plumbing: tenancy stays at actions + page load, same posture as today.
- `nonFinalIds` is omitted (document store drops `final` flags). Explicitly permitted by `transcriptStorage.d.ts:73-79`, and the conformance suite only asserts it when defined.

## Design decisions (locked)
1. Document-style storage over `games` (guide: "write `changeset.transcript` as-is"). No new tables; two nullable columns added.
2. `messages` column keeps `UIMessage[]` shape → `page.tsx` and existing rows keep working unchanged.
3. Cursors: `changeset.cursors.lastOutEventId` → `games.last_event_id` (page resume unchanged); `lastInEventId` → new `games.last_in_event_id`. Cursors are NEVER cleared: when a save carries no cursors, stored values are preserved (same invariant as the previous `lastEventId` guard).
4. `state` blob → new `games.transcript_state` (`jsonb`, nullable), round-tripped opaquely.
5. `save()` upserts the row in one transaction. Insert-if-missing uses sentinel `orgId: "unknown"` / `title: "Untitled conversation"`: practically unreachable (sessions are only created for games `startGameSession` asserted), mirrors the guide's create-if-missing, keeps every runtime write durable.
6. Row layer split for testability: `lib/chat/game-rows.ts` holds ALL drizzle usage; `lib/chat/store.ts` holds pure mapping + the `TranscriptStorage` object and never imports `@/lib/db`. Tests mock `@/lib/chat/game-rows` (string-keyed Map), so no `server-only` chain, no env, no Neon writes in CI.
7. TDD via the official suite: `runTranscriptStorageTests` from `@trigger.dev/sdk/ai/test` drives `gameTranscriptStorage` (red before `store.ts` exports it, green after). Integration (real SQL) is proven by typecheck + worker boot + a live turn, not by CI touching the dev DB.

## Scope
Allowed files only:
- `db/schema.ts` (+`transcript_state`, +`last_in_event_id`)
- `lib/chat/game-rows.ts` (new)
- `lib/chat/store.ts` (rework → `gameTranscriptStorage`)
- `lib/chat/transcript-storage.test.ts` (new, TDD driver)
- `trigger/chat.ts` (`storage:` set, hooks removed, `run` byte-identical)
- `odd/tasks/chat-transcript-storage.md` (this doc)

Explicitly NOT in scope: `page.tsx`, `chat-thread.tsx`, actions, queries, `ai.ts`, `trigger.config.ts`, `loadContext`, `clientDataSchema`, `useLoadTranscript`, `onAction` (unused), new tables.

## Constraints
- `run()` stays byte-identical (model, system, `reasoning: "none"`, `abortSignal: signal`).
- Setting `hydrateMessages` + `storage` together is a startup error — the swap must be atomic in one commit.
- Generated artifacts, code, and comments stay in English.
- No unrelated refactors; pre-existing `trigger/example.ts` lint error stays out of scope.

## Checklist (stable IDs)
- [x] T1 — Conformance test first (RED): `lib/chat/transcript-storage.test.ts` drives `runTranscriptStorageTests(() => gameTranscriptStorage, { api: { describe, it, expect } })` with a `vi.mock("@/lib/chat/game-rows")` Map fake — observed failing before `store.ts` exports the storage.
- [x] T2 — Schema: add `transcriptState: jsonb("transcript_state")` + `lastInEventId: text("last_in_event_id")` to `games`; apply with `bun run db:push`.
- [x] T3 — Row layer: `lib/chat/game-rows.ts` with `readGameTranscriptRow` / `writeGameTranscriptRow` (single-tx upsert, cursor-preserving merge); worker-safe imports only.
- [x] T4 — Storage (GREEN): `lib/chat/store.ts` exports `gameTranscriptStorage: TranscriptStorage` (`load` with order/paging/`before`, `save` writing transcript + state + cursors, cursors preserved when absent); suite passes.
- [x] T5 — Agent swap: `trigger/chat.ts` sets `storage: gameTranscriptStorage`, deletes `hydrateMessages`/`onTurnComplete`/`upsertIncomingMessage`; worker boots with NO deprecation warning.
- [x] T6 — Verification: commands below, observed outputs recorded; any failing required command forces `partial`.
- [x] T7 — Commit work-unit(s) with tests + docs in the commit, conventional message, no push.

## Authorized Scope
Exactly the files listed in **Scope**. Stay on branch `feat/chat-agent-migration` (same lineage, unpushed).

## Review outcome (RDD)
- Mode: **on** (global). Slice `1cda6b1..HEAD`: `risk: medium`, 14 paths, 594 lines, `review_due: true` (`slice_budget_reached`).
- Followed the returned transition verbatim: preflight STATUS → `collect` (`intended_untracked_selection_required`, satisfied with `untracked-scope=exclude` — the 5 untracked skill files are not part of the candidate) → `execute fresh_target_ready` → exact START → `consent_required`.
- Human decision via lossless native prompt: **declined this candidate** (`declined` / `declined_this_candidate`, target identity verified, re-entered STATUS after). No review record created; future reviews stay enabled.
- Verification of record: writer-equivalent inline runs in the table above + parent spot checks (`typecheck` real exit 0, `lint` only pre-existing `trigger/example.ts`).

## Commits (branch `feat/chat-agent-migration`, not pushed)
- `77806b5` `feat(chat): replace hydrateMessages with transcript storage` — schema, row layer, storage, suite, agent swap
- this doc follows as `docs(odds)`

## Route declaration
Route: **direct inline** (delegation unavailable in this runtime — `default.task` fails with "free tier ... only ... within OpenCode"; mapping + writes done inline, bounded to the files above).

## Delivery forecast
≈ 200–260 authored changed lines. `ask-on-risk`; under budget, no chain. RDD is on: assess the work-unit commit afterwards (`--base-ref 42f1232~` lineage); `under_budget` stays pending, `high` runs the returned transition verbatim.

## Verification
- `bunx vitest run lib/chat/transcript-storage.test.ts` (RED before T4, GREEN after)
- `bun run typecheck`
- `bun run lint` (only acceptable failure: pre-existing `trigger/example.ts`)
- `bun run test` (full suite)
- `bun run db:push`
- Bounded `trigger dev` boot: deprecation warning ABSENT + `Local worker ready` present

## Verification evidence (observed)

| Command | Observed result |
| --- | --- |
| `bunx vitest run lib/chat/transcript-storage.test.ts` (before `store.ts`) | RED: suite file fails — `server-only` throw via old `store.ts → @/lib/db` chain (also proves why the row layer is mocked) |
| Same suite (after `store.ts`) | GREEN: 11 passed — appends, in-place replace, idempotent remove/`truncateAfter`, state round-trip, cursors, changeset replay, paging, isolation |
| `bun run typecheck` | exit 1 first (generic variance on `load`), fixed by making `load` explicitly generic (`<T extends UIMessage>`, cast at return); re-run exit 0 |
| `bun run lint` | only pre-existing `trigger/example.ts` `no-explicit-any` (unmodified vs `main`, out of scope) |
| `bun run test` (full) | 2 files, 14 passed (3 existing + 11 new) |
| `bun run db:push` | `[✓] Changes applied` (`transcript_state`, `last_in_event_id` on Neon dev branch) |
| `timeout 85 bun run trigger:dev` | `Local worker ready`; **0** mentions of `deprecat`; no startup error. The reported symptom is gone. EXIT 124 = the timeout bound after ready, not a failure. |

## Deviations
- Vitest `resolve.conditions`/`server-only` stub NOT needed: mocking `@/lib/chat/game-rows` cuts the `server-only` chain entirely, so no test-infra change was required.
- Real-DB conformance NOT run: `games.id` is `uuid`, the suite uses string ids (`transcript-conformance-…`), so the official suite cannot run against the real table. It runs against a faithful in-memory row layer; real SQL is proven by typecheck + boot + (pending) a live turn.
- `nonFinalIds` omitted (permitted by contract, suite-tolerant); `loadContext`/`clientData` omitted per guide (our hook only did persist + return-history).
