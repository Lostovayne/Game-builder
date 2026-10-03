# Game Chat Split (chat + preview panels)

## Objective

Give the game screen a single client boundary (`game-chat`) that renders the chat thread and a placeholder game preview inside resizable panels, and clear the two standing `pnpm run lint` findings surfaced while verifying it.

## Problem and rationale

`app/(app)/games/[id]/page.tsx` rendered `ChatThread` at full width, leaving no place for the future live game preview. Composing the split behind one client boundary keeps auth, data fetching and token minting on the server and confines client code to `GameChat` and below. Verifying the new files surfaced two pre-existing lint findings worth removing in the same change: an untouched Trigger scaffold and a `set-state-in-effect` call in the progressive status hook.

## Scope

- Add `components/game-chat.tsx`, the client boundary composing `ChatThread` + `ChatPreview` in `components/ui/resizable.tsx` panels.
- Add `components/chat-preview.tsx`, a placeholder rendering exactly one paragraph.
- Wire the boundary into the game page in place of `ChatThread`.
- Remove the unused `trigger/example.ts` hello-world scaffold.
- Replace `set-state-in-effect` in `useProgressiveStatus` with state adjusted during render plus pure, tested helpers in `lib/chat/progressive-status.ts`.

Out of scope: the real game preview renderer, persisted panel layout, and any `ChatThread` behavior change.

## Constraints

- Feature branch: `feat/game-chat-split` from `main` at `bc18204`.
- Work-unit commits with Conventional Commit messages.
- TDD enabled; runner `pnpm test` (Vitest). Vitest runs with `environment: "node"` and no DOM test library is installed, so coverage targets extracted pure logic rather than React hooks.
- `react-resizable-panels` is 4.13.3 (v4 API: `id`, `defaultSize`, `minSize`, `orientation`).
- Do not commit anything beyond the work units listed here without asking.

## Tasks

- [x] T1 — Add the `GameChat` client boundary with resizable chat/preview panels and wire it into the game page.
- [x] T2 — Add the `ChatPreview` placeholder rendering exactly one paragraph.
- [x] T3 — Remove the unused `trigger/example.ts` scaffold.
- [x] T4 — Replace `set-state-in-effect` in `useProgressiveStatus` with render-phase state adjustment and pure helpers in `lib/chat/progressive-status.ts` with tests.
- [x] T5 — Run `pnpm test`, `pnpm run lint`, `pnpm run typecheck` and record the commit ids below.

## Acceptance criteria

- The game page renders chat and preview inside resizable panels behind one client boundary.
- `pnpm run lint` reports zero findings.
- `pnpm test` and `pnpm run typecheck` pass.
- Each work unit is a separate Conventional Commit on the feature branch, and their ids are recorded here as evidence.

## Exploration evidence

- `components/ui/resizable.tsx` wraps `react-resizable-panels` v4.13.3. `Panel` renders an outer flex-item `div[data-panel]` and an inner `div` that receives `className` with inline `overflow:auto`, so panels hosting flex-fill content must establish a flex column (`flex min-h-0 flex-col`) or children relying on `flex-1` collapse to content height.
- `trigger/example.ts` is the untouched `hello-world` scaffold (`payload: any`), referenced nowhere in the repo. `trigger/chat.ts` registers the real `game-chat` task through `chat.agent()`, so `dirs: ["trigger"]` stays valid after deletion.
- Vitest is configured with `environment: "node"` and the repo keeps pure logic in `lib/` (see `lib/games/title-refresh.ts` + tests); a hook test would require a DOM test library that is not installed.

## Open decision

None. The preview panel is a placeholder paragraph as requested; its real renderer is a separate change.

## Progress

- Branch `feat/game-chat-split` created from `main` at `bc18204`.
- T1/T2 implemented, typechecked and approved by the native review (lineage `review-35e86849a122930d`, lens `review-reliability`, no findings, authority burned).
- T3/T4 implemented test-first: the failing test landed before `lib/chat/progressive-status.ts`, and `useProgressiveStatus` became a thin timer wrapper over the pure helpers.
- T5 verification after the final implementation: `pnpm test` 72/72 across 7 files (4 new), `pnpm run lint` 0 findings, `pnpm run typecheck` clean.
- The native review for the T3/T4 candidate was declined at consent (candidate-scoped, `lineage_created: false`), so that slice ships without native review. A decline is candidate-scoped and is not the review kill switch.

## Evidence

- `d408fc8` — `feat(game-chat): add resizable chat/preview split to the game screen` (T1, T2). Native review approved.
- `249e5d2` — `chore(trigger): remove unused hello-world example task` (T3).
- `8943fdf` — `fix(chat): derive progressive status state without setState in an effect` (T4 + tests).
- This document closes the tracking as `docs(odd)`.
