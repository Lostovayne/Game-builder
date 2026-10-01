# Game Preview Sandbox Return

## Objective

Make `startGameServer(sandboxId)` return `{ sandbox }` and have the preview route mint the signed preview URL from that returned sandbox, removing the route's redundant second `daytona.get`.

## Problem and rationale

The preview route resolves the same sandbox twice: once inside `startGameServer`, then again via `daytona.get(sandboxId)` purely to call `getSignedPreviewUrl`. The helper already holds the sandbox it just started, so returning it removes a duplicate Daytona round-trip and keeps URL minting where the caller-facing contract lives (the route).

## Scope

- `startGameServer(sandboxId)` returns `{ sandbox }` on every success path: healthy-port reuse, fresh launch, and stopped-sandbox restart.
- The preview route mints `getSignedPreviewUrl(GAME_PREVIEW_PORT, PREVIEW_URL_TTL_SECONDS)` from the returned sandbox and no longer calls `daytona.get` itself.
- The route drops its now-unused `@/lib/daytona/client` import.
- Offline tests cover both the helper's return contract and the route's URL minting from the returned sandbox.

## Constraints

- Strict TDD (red → green); runner `npm test` (Vitest, node environment, no DOM).
- Offline suites must never hit the network: `@/lib/daytona/client` stays mocked. Live checks run in a separate opt-in config, never from `npm test`.
- Never create a sandbox in this path; health-check, idempotency, and session-recovery behavior stay unchanged.
- Only the signed `url` is exposed to clients; the preview token and internal Daytona errors never leave the server.
- Technical artifacts and code in English.
- Branch context: currently on `main` (default); no commit is authorized yet.

## Allowed edit surfaces

- `lib/daytona/utils.ts`
- `lib/daytona/utils.test.ts`
- `app/api/games/[id]/preview/route.ts`
- `app/api/games/[id]/preview/route.test.ts`

## Tasks

- [x] T1 — Change `startGameServer` to return `{ sandbox }` on all success paths, with a typed return of the Daytona `Sandbox`, and cover the contract offline (returned object exposes the same sandbox `daytona.get` produced, across reuse, launch, and restart paths). Route: delegated writer, strict TDD.
  - RED: `expect(result.sandbox).toBe(previewMock.state.sandbox)` failed in 3 tests with `TypeError: Cannot read properties of undefined (reading 'sandbox')` — `npm test -- --run lib/daytona/utils.test.ts`: 3 failed / 14 passed (17). GREEN: 17/17.
  - WARNING from fresh verification (resolved): identity assertions compared against a cached mock sandbox, so a second `daytona.get` returning that same cached object would have passed. Fixed by asserting `previewMock.get` `toHaveBeenCalledTimes(1)` on all three success paths. Proven by temporary mutation (re-fetch on the reuse path): the call-count assertions failed in 2 tests while the identity assertion did not — i.e. the new assertion is the one that catches the defect. Mutation reverted; no residue.
- [x] T2 — Mint the signed preview URL in `app/api/games/[id]/preview/route.ts` from the sandbox returned by `startGameServer`, drop the redundant `daytona.get` and the unused client import, and update the route tests so the URL-minting assertion targets the returned sandbox. Route: delegated writer, strict TDD.
  - RED: success test received 502 instead of 200 (`daytona.get` not provided by the mock) — route suite: 1 failed / 5 passed (6). GREEN: 6/6.

## Acceptance criteria and checks

- `startGameServer` resolves to `{ sandbox }` on every success path and still throws on failure paths.
- The route never calls `daytona.get`; the signed URL is minted from the sandbox `startGameServer` returned.
- API contract unchanged: `GET /api/games/[id]/preview` → 200 `{ url }` | 401 | 404 | 502.
- Checks: `npm test`, `npm run typecheck`, `npm run lint`.

## Progress

- Planning created before source changes.
- T1 and T2 implemented by a delegated writer under strict TDD; both reached green with recorded RED evidence.
- Fresh-context verification (`gentle-ai-verify`) initially returned **fail** on one WARNING (weak identity assertion, above). The warning was addressed and re-proven by mutation testing.
- Verification rerun after the fix: `npm test` 9 files / 91 tests passed, `npm run typecheck` clean, `npm run lint` clean.
- Diff scope confirmed: only the four in-scope files changed, plus this document (untracked). 64 insertions / 18 deletions across the four tracked files.

## Verification and limits

- Full offline verification after the warning fix: `npm test -- --run lib/daytona/utils.test.ts` 17/17; `npm test -- --run 'app/api/games/[id]/preview/route.test.ts'` 6/6; `npm test` 9 files / 91 tests; `npm run typecheck` clean; `npm run lint` clean.
- The second `daytona.get` removal is guarded by call-count assertions, not just object identity (mutation-verified).
- Runtime integration against live Daytona was verified once on 2026-10-01 (see "Live verification" below); it is not part of the automated suite.
- Known pre-existing limits (concurrent cold-start race, aggregate health-polling timeout, health check accepts any HTTP 200) are out of scope for this refactor.

## Live verification

Run once against the real Daytona API with a throwaway sandbox labelled `live-verify-<ts>`; the sandbox is deleted in `afterAll` and the account is re-checked for leaks. **3 tests passed** (~7 s). The table below lists every assertion, which is more rows than tests — teardown is an `afterAll` check, not a test:

| Check                                                                      | Result                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------- |
| `startGameServer` resolves `{ sandbox }` with the retrieved id             | pass                                              |
| In-sandbox `curl` to `127.0.0.1:8000`                                      | HTTP **200**                                      |
| `getSignedPreviewUrl(8000, 3600)` on the _returned_ sandbox → real `fetch` | HTTP **200**, body matched the seeded marker      |
| Second `startGameServer` call provisions nothing                           | 0 new sandboxes                                   |
| Teardown                                                                   | account back to its 3 original sandboxes, 0 leaks |

The suite lives in a separate config (`include: ["**/*.live.ts"]`) so `npm test` never reaches the network.

### Correction: where the credentials and the URL actually live

- `DAYTONA_API_KEY` **is** present in `.env.local` (68 chars, gitignored). Earlier notes claiming it was "absent" were wrong: it was absent from the _shell_ environment, not from the project. Next.js loads `.env.local` automatically; ad-hoc scripts need `node --env-file=.env.local`.
- The signed preview URL shape is `https://{port}-{token}.{daytonaProxyDomain}` per the installed skill guide (`skills/daytona/references/typescript-sdk/preview.md`), and `SignedPortPreviewUrl` only types `url` as a bare `string` — the SDK constrains nothing. Observed live on 2026-10-01: `https://8000-<token>.daytonaproxy01.net/`, i.e. the **token sits in the hostname**, not in a `?signed=` query. That is **not** `*.daytona.io`, so an allowlist written from a test mock will not match production.
- The specific domain is an empirical observation, not something derivable from the SDK types or the guide — re-check it if Daytona ever changes the proxy host. It is why returning only `.url` to clients is correct: the credential is already inside the URL, and `.token` never needs to leave the server.

## Tooling limitation: `gentle-ai review assess` cannot score committed work

Tracked in #5.

`assess` is read-only and is supposed to risk-score a candidate. On this change it was unusable for the committed range:

- **No `baseRef`** → `non-zero`: _"the review assess candidate has no pending changes; already-committed work can be assessed by rerunning `gentle-ai review assess --base-ref <commit>`"_.
- **With `baseRef`** → `schema-incompatible`, **no sanitized stderr**. Reproduced with three different values: the full 40-char parent commit `69dd356…`, the ref `main`, and the `base_tree` `f649cd2…` that this lineage's own `review.status` transition had just used. (`HEAD` is _not_ in this group — see the last bullet.)
- **`baseRef` without `committedOnly: true`** → rejected up front: `Review assess baseRef requires committedOnly: true`.
- `baseRef: "HEAD"` **validates the schema** but compares an empty range (working tree is clean), so it falls through to the same `non-zero` as the no-`baseRef` case.

So every documented path into the committed-range branch fails, and the failure carries no diagnostic to act on.

**Workaround used:** omit `baseRef` and pass only `{writerModelId, writerEffort, nativeReviewOutcome: "closed"}`. That returns `outcome_source: explicit`, `writerProfile: large`, `risk: unassessable`. The contract then requires `unassessable` be verified exactly like `high`, so **each cycle needs a fresh independent verifier**. The first such verifier passed; the one raised after the documentation commit returned `fail` on three doc-accuracy findings, which are corrected above.

**Net effect:** no code defect, but `assess` silently degrades to `unassessable` for any already-committed work, which pushes every committed candidate onto the more expensive independent-verification path.

## Verification and commit

- **Committed:** branch `refactor/preview-sandbox-return`, commit `bfbec34` `refactor(daytona): return sandbox from startGameServer`.
- Not pushed, no PR: neither was authorized.

- RDD review executed on this candidate: lineage `review-1ea7a59a39c8741e`, target `sha256:362ac31a…`, tier `medium` (trigger: `executable_change` in `app/api/games/[id]/preview/route.test.ts`), lens `review-reliability` (1 model run via pi host relay).
- Outcome: **approved** → acknowledged (`native-approved-acknowledgement-completed`, authority `burned`, burn evidence `gentle-ai.review-acknowledged/v1`). Delivery remains ordinary repository policy.
- Read-only `assess` after the acknowledgement returned `risk: unassessable` with `nativeReviewOutcome: closed` (`outcome_source: explicit`), `writerProfile: large` — the failure was a bookkeeping error about untracked files (only this document is untracked), not a code finding. Per contract, `unassessable` is verified exactly like `high`, so an independent fresh-context verifier was run as the separate check.
- Fresh-context independent verification (final, post-RDD): `npm test` 9 files / 91 tests passed, `npm run typecheck` clean, `npm run lint` clean, scope confirmed (4 tracked files, 64 insertions / 18 deletions, plus the untracked doc).
  - Verifier confirmed independently: two explicit success returns both yielding `{ sandbox }`, no throw path changed, `daytona.create` never called, `get` `toHaveBeenCalledTimes(1)` on all three success paths (a duplicate retrieval fails even against the cached mock), route pins `(8000, 3600)` on the returned sandbox, 401/404 precede any Daytona access, no `MUTATION` residue, 502 body carries no internal error text.
  - Sole WARNING (non-blocking): `route.ts:58` logs `error instanceof Error ? error.message : error`, so a thrown non-`Error` value is logged raw rather than its `.message`. This line is byte-identical to `HEAD` — it is pre-existing, outside this refactor's diff, and the response body still returns only the generic 502 text. Recorded as a pre-existing nit, not a defect of this change.
- The verifier could not write its Engram save: Engram reported multiple active runtime sessions for this project and directory (same known ambiguity as before; `mem_doctor` reports 0 warnings at parent level). The finding was recorded by the orchestrator instead.
- **Commit authorized and created.** Branch `refactor/preview-sandbox-return` (cut from `main`), commit `bfbec34` `refactor(daytona): return sandbox from startGameServer` — 5 files, 137 insertions / 18 deletions (4 in-scope files plus this document). Pre-commit verification on the committed tree: `npm test` 9 files / 91 tests, `npm run typecheck` clean, `npm run lint` clean. No push and no PR were authorized; delivery remains local.
