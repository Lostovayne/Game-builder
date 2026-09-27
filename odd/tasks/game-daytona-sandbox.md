# Game Daytona Sandbox

## Objective

Provision and persist one Daytona sandbox per game when its chat starts, and seed each new sandbox with the initial game file.

## Problem and rationale

Games need an isolated Daytona runtime with their starter document in place immediately after provisioning.

## Scope

- Add a nullable `sandboxId` column to `games`.
- In `createGameSandbox(gameId)`, create with Daytona labels `{ gameId }`, create `/home/daytona/game`, upload `/home/daytona/game/index.html` with exact bytes `New Game`, and persist the returned sandbox ID.
- Invoke the helper from `gameChat`'s `onChatStart` hook.
- Reuse an existing sandbox ID without creating another sandbox.

## Constraints

- Preserve the unrelated `.gitignore` working-tree change; include `lib/daytona/client.ts` because it is a runtime dependency of the feature.
- Do not expose Daytona credentials outside server code or call the live Daytona service during tests.
- Technical artifacts and code are in English.
- Branch: `feat/game-daytona-sandbox` (created from `main`).
- TDD: enabled by project instruction; runner `npm test -- --run` (Vitest).
- User authorized `npm run db:push` and a local Conventional Commit; push/PR remain unauthorized.

## Tasks

- [x] T1 — Update `createGameSandbox` to label the sandbox with `gameId` and seed `/home/daytona/game/index.html` with exact contents `New Game`; update tests first and integrate only where needed. TDD RED was observed for the new requirements before implementation; all behavior is covered by tests.
- [x] T2 — Verify focused tests, typecheck, and inspect the scoped diff. Independent verification passed.

## Acceptance criteria and checks

- `games.sandboxId` remains nullable text mapped to `sandbox_id`.
- New sandbox creation receives exactly `{ labels: { gameId } }`.
- The helper creates `/home/daytona/game` (mode `755`) and uploads a buffer containing exactly `New Game` to `/home/daytona/game/index.html` before persisting sandbox ID.
- Existing sandbox ID skips re-provisioning and reseeding.
- `onChatStart` awaits the helper with the game/chat ID.
- Focused tests and `npm run typecheck` pass; apply the schema through the authorized `npm run db:push`; no live Daytona API call is run.

## Progress

- The original per-game sandbox feature is implemented on branch `feat/game-daytona-sandbox` with five helper tests and passed typecheck. Full suite reported 31/31 by its worker.
- User clarified the exact seed text as `New Game` after the earlier prompt/screenshot casing differed.
- Keep the unrelated `.gitignore` modification out of the feature commit; include `lib/daytona/client.ts` as the runtime Daytona client dependency.

## Verification and limits

- Worker TDD: focused tests failed on missing new behavior before edits, then passed 9/9 after implementation.
- Parent and independent verifier ran `npm test -- --run lib/daytona/utils.test.ts`: 9/9 passed; `npm run typecheck`: clean.
- Independent verifier confirmed exact labels, folder mode, no-newline content, operation ordering, failure behavior, and existing-ID short circuit.
- No live Daytona API call was made. `npm run db:push` completed successfully against the configured Neon development database with Drizzle reporting `[✓] Changes applied`.
- Potential operational caveat: a Daytona sandbox may be orphaned if folder creation or upload fails after the sandbox has already been created; its ID is not persisted in that case.

## Verification and commit

- `npm run db:push` succeeded against the configured Neon development database; Drizzle reported `[✓] Changes applied`.
- Fresh independent verification after the schema push: `npm test -- --run lib/daytona/utils.test.ts` passed 9/9; `npm run typecheck` passed clean.
- Runtime harness: N/A — live Daytona provisioning was intentionally not run; sandbox FS behavior is covered with offline mocks.
- Rollback boundary: revert the feature commit to remove the nullable game sandbox column declaration, Daytona helper/client, chat hook, tests, and feature progress record together. Do not revert the unrelated `.gitignore` modification.
- Commit: `0a6093232457b450233414951a9e1594c38ac3d1` (`feat(games): provision Daytona sandbox per game`).
- Post-commit native `gentle_review` assessment was attempted for base `926011c` but rejected by facade validation (`assess` rejected the top-level `intendedUntracked` field); risk tier is unavailable, not low. No push or PR was performed.
