# Game Title Refresh and Worker Latency

## Objective

Update the active sidebar when asynchronous title generation completes and reduce the perceived delay before the first game-chat response.

## Problem and rationale

The new game is inserted with a provisional title and navigated to immediately. The server later replaces that title inside `after()`, but an already-mounted client layout may continue showing its original RSC payload. Separately, prior Trigger measurements attributed most first-token delay to run queue/worker startup rather than model generation.

## Scope

- Propagate the completed generated title into the already-open game UI/sidebar without a full page reload.
- Measure the current submit-to-worker and worker-to-first-chunk stages before claiming a Trigger latency fix.
- Consider Trigger.dev's documented chat preload path only if it meaningfully overlaps startup in this auto-send flow and does not create duplicate runs or unacceptable idle compute.
- Keep `chat.headStart` excluded unless the user explicitly requests it.

## Constraints

- Feature branch: `fix/game-title-refresh-and-chat-preload` from `main`.
- TDD: enabled; test runner `pnpm test` (Vitest).
- User authorized a local commit, merge to `main`, push to `origin/main`, and deletion of the temporary branch after testing.
- Prior baseline is historical (2026-09-25): queue wait 16.4–22.5s in two samples, model-to-first-token 3.5–5s, other queue samples 0.6–32.1s. Re-measure before claiming a current root cause or improvement.
- Trigger.dev SDK is 4.6.4; Next.js is 16.3.4.

## Tasks

- [x] T1 — Implement live propagation of the generated title to the mounted sidebar without a full reload; add focused coverage. Added org-scoped title-only action, exact provisional-title guard, bounded 24s poll, and one `router.refresh()`; polling skips titles that are already final.
- [x] T2 — Collect fresh read-only Trigger run timings. Observed run-created→started waits of 19.219s (2026-09-27 23:06:58Z), 0.742s (23:06:01Z), and 113.913s (23:03:35Z). First-chunk timing was not available in the API listing, so model-stage breakdown remains unknown; three samples establish variability, not a representative average.
- [x] T3 — Add low-cost on-demand preload only for new games with exactly one seeded user message and no hydrated session; SDK implementation deduplicates same-chat starts. Persistent warm capacity stays disabled. Before/after impact remains unmeasured.
- [x] T4 — User tested the feature: title now renders correctly and initial wait feels somewhat improved. No exact timing values were recorded, so this is a qualitative observation rather than a measured before/after claim. Independent pre-commit review passed 32/32 focused tests and typecheck; no live API/browser calls were made in that review.

## Acceptance criteria

- Generated title becomes visible in the currently mounted sidebar as soon as it is available, without manual reload.
- Worker startup improvement is evidenced by before/after measurements, or documented as blocked pending an explicit warm-capacity/cost decision.
- No duplicate first-turn messages, Trigger sessions, or runs.
- Focused tests and typecheck pass.

## Exploration evidence

- `lib/games/actions.ts` writes a provisional title, refines it inside Next.js `after()`, and calls `revalidatePath("/", "layout")` after the update.
- `app/(app)/layout.tsx` fetches games once into server-rendered props for `AppSidebar`; the client sidebar is already mounted after navigation.
- Next 16.3.4 bundled docs: `revalidatePath` invalidates server data, while `router.refresh()` requests and merges a fresh RSC payload; server-side cache invalidation alone does not guarantee an immediate active client refresh from an `after()` callback.
- Trigger SDK 4.6.4 bundled docs: `transport.preload(chatId)` starts a run early and has an idle-compute window controlled by `preloadIdleTimeoutInSeconds`; SDK notes repeated session starts are deduplicated/idempotent, but no local runtime evidence proves material benefit in this app's immediate auto-send flow.
- Prior latency task: `odd/tasks/chat-latency-investigation.md` contains the historical timing baseline and API observations. Reuse it; do not repeat claims as current without measurements.
- `chat.headStart` was previously explicitly out of scope and remains excluded.

## Open decision

User chose low-cost on-demand preload/measurement only. Do not enable persistent warm-worker capacity or recurring Trigger compute. Preload may overlap only the short mount-to-send interval for this immediate auto-send flow; measure its actual effect before claiming improvement.

## Progress

- Created branch `fix/game-title-refresh-and-chat-preload` from clean `main` at `4ede982`.
- User authorized measurement/on-demand preload only and declined persistent warm capacity.
- T1 implemented: org-scoped title-only action querying only `games.title`, exact shared provisional-title derivation/guard, bounded and cancellable poll, and one `router.refresh()` when the refined title is observed. Poll is skipped for already-final titles and after it refreshes once.
- Title and preload policy tests pass 32/32; `pnpm run typecheck` passed clean after final implementation. Independent T1 verification passed 28/28 before preload was added.
- Fresh read-only Trigger API sample for three recent runs shows highly variable queue waits: 19.219s, 0.742s, and 113.913s. The latest run remained EXECUTING in the listing. These data confirm severe queue variability but do not establish a representative average or model-to-first-token duration.
- `transport.preload(gameId)` is wired before auto-send only for exactly one seeded user message with no hydrated session. Trigger SDK 4.6.4 client source deduplicates per-chat in-flight session starts. Runtime duplicate-send/latency effect remains unverified.
- No persistent worker/warm capacity enabled; no commit yet.

## Runtime / commit limits

- User performed live testing and confirmed the title renders correctly and startup wait feels somewhat improved; no exact before/after values were captured.
- Automated verification: 32 pure Vitest tests pass, `pnpm run typecheck` passes, `git diff --check` passes; independent read-only review confirmed title polling authorization, guard, bounds, and SDK preload dedup semantics.
- Fresh API queue samples: run-created→started of 19.219s, 0.742s, 113.913s. Only three observations; no first-chunk timestamps were available, so no numeric preload improvement is claimed.
- Native RDD inspect was previously attempted and returned blocked `committed-only-invalid`, mutation_performed=false. No review lineage was started. RDD assessment remains unavailable, not low.
- User authorized committing, merging to `main`, pushing `main`, and deleting the provisional branch.
- Native RDD assessment/inspect remains unavailable: prior facade attempts returned `committed-only-invalid`/input-validation errors with `mutation_performed=false`; no review lineage exists. This is not an approval or low-risk assessment.

## Next step

- Commit the tested change, merge it into `main`, push `main`, and delete the local and remote provisional branch if present. Preserve the timing result as qualitative/unmeasured.
