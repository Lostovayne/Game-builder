# Game Daytona Preview

## Objective

Serve the per-game Daytona `/home/daytona/game/index.html` in an iframe through a short-lived signed preview URL, reusing the existing sandbox and preview server.

## Problem and rationale

The game chat currently displays a placeholder. A persisted `sandboxId` exists for games after chat startup, but there is no HTTP server for the seeded HTML file and no safe browser-facing preview URL.

## Scope

- Start or reuse a static HTTP server in the existing per-game Daytona sandbox, serving `/home/daytona/game/index.html`.
- Health-check the server before starting it; never create another sandbox as part of preview loading.
- Add an authenticated, org-scoped API endpoint that returns a short-lived signed Daytona preview URL.
- Render the preview iframe only when the game record has a `sandboxId`.

## Constraints

- Preserve unrelated pre-existing modification `lib/chat/progressive-status.test.ts`.
- Keep Daytona credentials and standard preview tokens server-side; use a signed URL bound to the game preview port for the iframe.
- Do not run live Daytona API calls; `DAYTONA_API_KEY` is not configured in this environment.
- Technical artifacts and code remain in English.
- Branch: `feat/game-chat-split` (not the default branch).
- TDD: enabled; source: project instruction and established feature task; runner: `npm test` (Vitest).
- No commit, push, or PR was explicitly authorized; commits remain pending user authorization.

## Tasks

- [x] T1 — Add `startGameServer(sandboxId)` that retrieves the existing sandbox, starts it only when necessary, health-checks the preview server, and starts a static server serving the existing game directory only when the health check fails. Add offline tests for reuse, launch, lifecycle, and failures. Route: delegated writer (multi-file implementation and test preparation). Trigger: touches helper and tests. Evidence: RED→GREEN observed; `npm test -- --run lib/daytona/utils.test.ts` 17/17, `npm run typecheck` clean, plus fresh-context verification 17/17.
  - Risk: sequential calls reuse correctly; concurrent cold-starts may race and launch into the same session. Per-probe timeouts can also make aggregate health polling exceed the nominal startup bound.
- [x] T2 — Add an authenticated org-scoped preview API route that uses the persisted sandbox ID, starts/reuses the game server, and returns a short-lived signed preview URL. Add focused offline route tests. Route: delegated writer (multi-file implementation). Trigger: route plus server integration. Evidence: RED→GREEN observed; `npm test -- --run 'app/api/games/[id]/preview/route.test.ts'` 6/6, `npm run typecheck` clean; fresh-context verification 6/6.
  - Coverage note: current tests do not assert the returned URL body or exact org/game DB predicates; source uses the safe org-scoped predicates but tests could strengthen these assertions.
- [x] T3 — Thread `sandboxId` from the org-scoped game record into `GameChat`, render the preview panel only when present, and load the signed URL into an iframe with loading/error/empty states. Verify changed files and run the applicable suite. Route: delegated writer (multi-file implementation). Trigger: page, client boundary, and component integration. Evidence: pure response-resolution tests 5/5; full suite 91/91, typecheck clean, lint clean; fresh-context independent verification passed all three commands.

## Acceptance criteria and checks

- Preview loading never calls `daytona.create` and always retrieves the persisted sandbox.
- The health check is attempted before launching a static server; a healthy server is reused.
- The server serves `/home/daytona/game/index.html` on one fixed preview port.
- The API authorizes the current user and enforces organization ownership before Daytona access.
- The API returns a signed preview URL with an explicit useful TTL; no Daytona standard preview token is exposed.
- No preview iframe/panel is rendered if `sandboxId` is absent.
- Offline mocked behavior is covered by Vitest; run `npm test`, `npm run typecheck`, and `npm run lint` as checks. No live Daytona calls.

## Progress

- Planning created before source changes. Product choice confirmed: API returns a signed URL bound to the preview port; iframe loads that URL.
- T1, T2, and T3 implementation tasks are complete. The pre-existing unrelated formatting-only change in `lib/chat/progressive-status.test.ts` is preserved and remains outside this feature.
- The T3 writer also added `components/chat-preview.test.ts`; that test file was not enumerated in the T3 allowed surfaces, but it is directly scoped to the requested preview response behavior and was reviewed/tested as part of this feature. Record this as a narrow delegation-surface exception.

## Verification and limits

- Daytona SDK package is installed (`@daytona/sdk` ^0.218.0); `DAYTONA_API_KEY` is absent, so runtime integration against Daytona is unavailable.
- Next.js route handler docs were read from the installed Next.js 16.3.4 package.
- Daytona signed-preview docs were checked; signed preview URL supports iframe navigation without a separate token header and must be given an explicit expiry.
- T1 offline suite: `npm test -- --run lib/daytona/utils.test.ts` passed 17/17; `npm run typecheck` clean; fresh verifier independently ran the focused suite (17/17).
- T2 offline suite: `npm test -- --run 'app/api/games/[id]/preview/route.test.ts'` passed 6/6; typecheck clean; fresh verifier independently ran the route suite (6/6).
- T3 focused pure behavior suite passed 5/5; complete `npm test` passed 9 files / 91 tests, `npm run typecheck` passed, and `npm run lint` passed; fresh-context verifier independently confirmed all three.
- No live Daytona calls were made. Runtime integration remains unverified because `DAYTONA_API_KEY` is absent.
- Review limitations: concurrent cold starts can race; health probes can make aggregate startup polling exceed the nominal timeout; health-check accepts any HTTP 200 on the port. Route tests do not assert the response URL/predicates, and component rendering/iframe behavior is not DOM-tested because the configured Vitest environment is node-only.

## Verification and commit

- No commit is authorized yet. Record commit identity here only after the user explicitly authorizes delivery.
- T1 commit: pending explicit user authorization.
