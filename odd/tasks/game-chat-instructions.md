# ODD Task — game-chat-instructions: Composed system prompt for the game chat agent

## Objective

Replace the placeholder `system: "You are a helpful assistant."` in `trigger/chat.ts` with a composed system prompt built from a new `lib/games/instructions` module that exports a combined array of game instructions (workflow + runtime).

## Feature Name

game-chat-instructions

## Problem

The Trigger.dev `chat.agent` runs with a generic placeholder system prompt, so the model has no idea it is inside a game-building product, how the create → chat → preview workflow works, or what the Daytona game directory environment looks like.

## Why

A product-specific system prompt is the foundation for consistent game-building replies and is a prerequisite for the roadmap item "Add per-game model and system-prompt settings".

## Scope

Allowed files only:

- `lib/games/instructions/workflow.ts` (new) — instructions explaining the product workflow
- `lib/games/instructions/runtime.ts` (new) — instructions explaining the Daytona game directory environment
- `lib/games/instructions/index.ts` (new) — combined export of the game instruction arrays
- `lib/games/instructions/index.test.ts` (new) — composition test (test-first)
- `trigger/chat.ts` — replace the placeholder `system` string with the composed instructions
- `odd/tasks/game-chat-instructions.md` (this doc)

## Constraints

- No schema, API, or UI changes. No dependency changes.
- Module shape: each module exports a `string[]`; `index.ts` exports one combined `string[]`
  (`workflow` first, then `runtime`) — e.g. `gameInstructions`.
- `trigger/chat.ts` joins the combined array into the `system` string of `streamText`.
- Prompt text is a generated technical artifact → English.
- Facts in `runtime.ts` must match the actual code in `lib/daytona/utils.ts`:
  - one Daytona sandbox per game, created once on chat start, id persisted on the game row
  - game directory `/home/daytona/game`, entrypoint `index.html`, seeded with `New Game`
  - static server `python3 -m http.server 8000 --bind 0.0.0.0` on fixed port `8000`, health-checked
  - preview is a short-lived signed URL rendered in an iframe; the sandbox starts on demand
  - static site only: no build step, no package manager, self-contained HTML
- No claims about agent capabilities that do not exist (there are no sandbox-write tools yet);
  describe the environment and the authoring intent, not a tool surface.

## Checklist (stable IDs)

- [x] T1 — Feature doc + Engram mirror + visible todo (parent) — before the first source write — route: parent — outcome: done
- [x] T2 — `lib/games/instructions/{workflow,runtime,index}.ts` with test-first `index.test.ts` (RED → GREEN) — route: delegated writer (`gentle-ai-worker`, `muqczyml-1-52ij`) — outcome: RED observed (`Cannot find module './index'`), GREEN 4/4
- [x] T3 — Wire `gameInstructions` into `trigger/chat.ts` `system` (same writer) — outcome: `system: gameInstructions.join("\n\n")`, other streamText options untouched (parent diff spot check)
- [x] T4 — Verification: `npm test`, `npm run typecheck`, `npm run lint` — route: delegated verifier (`muqd6mij-2-3ca0`, delta re-run `muqd972d-3-97q9`) — outcome: all pass; one factuality finding fixed (sandbox "exactly one" wording overstated the non-atomic check-create-update sequence)
- [x] T5 — Work-unit commit on feature branch (branch first; user decides push/PR) — outcome: `fe35522 feat(chat): compose game system prompt from lib/games/instructions` (6 files, 168+/1−; `package-lock.json` deliberately left out of the commit)

## Authorized Scope

Files listed under Scope only. No other source files. No push/PR unless the user asks.

## Acceptance Criteria

- `lib/games/instructions/index.ts` exports a combined non-empty `string[]` of game instructions.
- The combined array contains both the workflow section and the runtime section, workflow first.
- `trigger/chat.ts` passes `system: <composed instructions>` to `streamText` (no placeholder text remains).
- Prompt text states only facts that exist in the codebase.
- `npm test`, `npm run typecheck`, `npm run lint` pass.

## Applicable Checks

- `npm test` (`vitest run`)
- `npm run typecheck` (`tsc --noEmit`)
- `npm run lint` (`oxlint`)

## TDD

- Mode: **strict** (project AGENTS.md: `Strict TDD Mode: enabled`; vitest present).
- Test runner: `npm test` (vitest).
- Focused checks: `npm test -- --run lib/games/instructions/index.test.ts`.

## Verification Evidence

- RED: `npm test -- --run lib/games/instructions/index.test.ts` failed with `Cannot find module './index'` (1 failed suite, 0 tests) before `index.ts` existed.
- GREEN: same focused run → 1 file, 4 tests passed after `index.ts`.
- Fresh verifier (`muqd6mij-2-3ca0`): `npm test` → 10 files / 95 tests pass; `npm run typecheck` clean; `npm run lint` clean. Acceptances 1, 2, 4 PASS; acceptance 3 flagged one overstatement.
- Fix: `runtime.ts` SANDBOX LIFECYCLE reworded to "bound to one sandbox … persisted id reused, never re-provisioned" (matches `createGameSandbox` at `lib/daytona/utils.ts:131-159`).
- Delta verifier (`muqd972d-3-97q9`): `npm test` 10 files / 95 tests pass, typecheck clean, lint clean; wording confirmed accurate.
- Parent spot check: full diff reviewed — placeholder gone, `reasoning`/`providerOptions`/`abortSignal`/hooks untouched, only allowed surfaces changed (`package-lock.json` dirty pre-existing, this doc expected).
- Native RDD review (user chose commit-then-review to keep the 10.4k-line lockfile diff out of the candidate): lineage `review-b5201599cda35005`, committed range `b50a27c..fe35522` (6 paths, 169 lines, tier medium, lens `review-reliability`), forecast `transport pi_host_relay / model_runs 1 / lenses [review-reliability]`, result **approved**, acknowledgement burned (`gentle-ai.review-acknowledged/v1`). Delivery remains ordinary repo policy (push/PR = user decision).

## Progress Log

- 2026-09-24: Doc created after exploring `trigger/chat.ts`, `lib/daytona/utils.ts`, `lib/ai.ts`, README and prior Daytona feature docs. Classified substantial (5 files, test-first). Branch `feat/game-chat-instructions` created from `main`.
- 2026-09-24: T1–T3 implemented by delegated writer (`muqczyml-1-52ij`); prompt prose in English, no tool capabilities claimed (agent has no tools yet).
- 2026-09-24: T4 verified by fresh verifier; sole factuality finding (sandbox count wording) fixed and re-verified green.
- 2026-09-24: User authorized commit + range review. T5 committed as `fe35522`; native review approved and acknowledged (lineage `review-b5201599cda35005`). All tasks closed; push/PR still user-owned.

## Engram Mirror

- Mirrored to `game-builder` topic `odd/game-chat-instructions/tasks`.
