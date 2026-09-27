# ODD Task — chat-stop-generation: cancel a running turn from the composer

## Objective

Let the user cancel an in-flight chat turn from the composer: the submit button
toggles into a stop button (icon + behaviour) while a turn is in flight, and
clicking it aborts the turn server-side and in the UI without faking a failed
turn afterwards.

## Feature Name

chat-stop-generation

## Problem

The composer's send button is unconditionally a submit button
(`type="submit"`, `ArrowUp`, `disabled={!canSubmit}`). `canSubmit` is false
while `isSubmitting`, so during a turn the only affordance is a dead button.
There is no way to cancel:

- a turn parked in Trigger's run queue (the measured 16–32 s wait in
  `odd/tasks/chat-latency-investigation.md`), or
- a turn that is already streaming.

The backend already supports it: `gameChat`'s `run` passes `abortSignal: signal`,
and the transport exposes `stopGeneration(chatId)`. Only the UI is missing.

## Why

Two concrete reasons, in order:

1. **Cancellation is impossible today.** `chat-agent-migration` locked the
   requirement "Stop aborts server-side" as a reason to adopt `chat.agent`
   (see its Problem section), but the client never wired a stop control, so the
   capability shipped dark.
2. **The most valuable cancellation window is the queue wait**, which is 85 % of
   perceived latency. Today the user cannot even bail out of that.

## Design decisions (locked)

1. **The stop control is the existing send button, toggled — not a second
   button.** Matches the request and the composer's current one-control layout.
2. **Two explicit props, not hidden coupling.** `ChatComposer` gains
   `isStoppable: boolean` and `onStopAction?: () => void`. Stop mode is
   `isStoppable && onStopAction`. Deriving stop mode from the existing
   `isSubmitting` would be wrong: `chat-thread` passes `status !== "ready"`,
   which is also true in the `error` state, where stopping is meaningless.
   Keeping `isSubmitting` untouched also avoids changing the send-disabled
   behaviour on error — that would be an unrelated refactor.
3. **In stop mode the button is `type="button"`.** A submit-type control would
   route the click through `handleSubmit` (which early-returns) and fire no
   stop. `handleSubmit`'s `isSubmitting` guard still blocks Enter-submits during
   a turn, so the form cannot start a second turn while stopping.
4. **Stop calls both layers, in the SDK's documented order.**
   `transport.stopGeneration(chatId)` sends `{kind:"stop"}` on `.in` so the
   agent aborts `streamText`; `useChat`'s `stop()` aborts the local reader and
   flips status to `ready`. Only the first reaches the server; only the second
   updates the UI. This is required because `resume` is enabled — aborting a
   resumed stream never stops the run by itself.
5. **Stopping must not be mistaken for a lost turn.** This is the subtle part.
   `stopGeneration` aborts the active reader, so no `turn-completed` event
   arrives, while `stop()` flips `status` from `streaming`/`submitted` to
   `ready` with **no error**. That is exactly the shape both recovery detectors
   treat as "the reply never arrived": the `onEvent` `turn-completed` path and
   the status-transition fallback would call `recover()`, whose 53 s polling
   window (`RECOVERY_DELAYS_MS`) ends in `setFailedFor(userId)` — surfacing
   "La respuesta no llegó al stream — reintentar" immediately after a
   deliberate stop, and re-firing a turn the user cancelled. So the stop marks
   the turn as user-stopped, and the recovery policy refuses it.
6. **The suppression lives in `lib/chat/recovery.ts`, as policy.** The module
   already owns "should this turn be recovered?", is pure, and is the repo's
   only unit-tested seam for this flow (`recovery.test.ts`). `shouldRecoverTurn`
   gains a required `stoppedByUser: boolean` input and returns `false` when set.
   Required (not optional) so a future call site cannot silently forget the
   guard. Scattered ref checks in the component would be untestable and would
   duplicate the policy.
7. **`clearSupersedeGate` is deliberately NOT called.** `stopGeneration` arms the
   SDK's local supersede gate (`skipToTurnComplete` + `supersededInputSeq`) and
   aborts the reader. The SDK documents `clearSupersedeGate` for the case where
   the stopped turn "died without ever writing its `trigger:turn-complete`
   boundary". On a normal user stop the agent still finishes the turn and writes
   the boundary (the partial response is "captured and accumulated normally"),
   the gate clears on it, and the next `sendMessages` subscribes with a fresh
   `sinceInSeq` that filters that boundary out. Calling it unconditionally would
   be the wrong remediation and is out of scope.
8. **No backend change.** `run` already forwards `abortSignal: signal`;
   `onTurnComplete` already persists the partial transcript, so a stopped turn
   is durable and visible after reload. `trigger/chat.ts` is untouched.
9. **`create-game-composer.tsx` is untouched.** It passes neither `isStoppable`
   nor `onStopAction`, so stop mode is off and its behaviour is unchanged.

## Scope

Allowed files only:

- `components/chat-composer.tsx`
- `components/chat-thread.tsx`
- `lib/chat/recovery.ts`
- `lib/chat/recovery.test.ts`
- `odd/tasks/chat-stop-generation.md` (this doc)

## Constraints

- No backend, schema, or `trigger/chat.ts` change.
- Do not touch the memoized transport, the StrictMode auto-fire effect, or the
  recovery merge logic beyond the `stoppedByUser` argument.
- No new dependencies. Stop glyph comes from the already-installed
  `lucide-react` (`Square`).
- Generated artifacts, code, and comments stay in English.
- No unrelated refactors.
- Strict TDD is active: the recovery-policy change is written test-first.

## Checklist (stable IDs)

- [x] T1 — Compose: add `isStoppable` + `onStopAction` props; render the stop
      button (`type="button"`, `Square`, `aria-label="Stop generation"`,
      enabled) when `isStoppable && onStopAction`, otherwise the current submit
      button unchanged.
- [x] T2 — Recovery policy (TDD): extend `shouldRecoverTurn` with required
      `stoppedByUser: boolean`; add tests for the stopped case first, then
      update the three existing call sites in `recovery.test.ts`.
- [x] T3 — Thread: destructure `stop` from `useChat`; add `stoppedByUserRef`;
      add `handleStop` (mark stopped → `transport.stopGeneration` → `stop()`);
      pass `isStoppable={isBusy}` and `onStopAction={handleStop}` to
      `ChatComposer`; pass `stoppedByUser` at both `shouldRecoverTurn` call sites
      and guard `recover()`'s entry.
- [x] T4 — Verify: `npm test`, `npm run typecheck`, `npm run lint`; then the
      native review preflight.

## Authorized scope

User-authorized change requested 2026-09-17: "Enable task cancellation from
@components/chat-composer.tsx in @components/chat-thread.tsx by having the submit
button toggle it's icon and behaviour". Read-only exploration authorized
implicitly by the request. Test runner: `npm test` (vitest, already in repo).

## Acceptance criteria

- While a turn is in flight (`submitted` or `streaming`) the composer shows a
  stop affordance in place of the send arrow, and it is clickable.
- Clicking it aborts the turn server-side (`.in` stop signal) and in the UI
  (status returns to `ready`, partial text kept).
- After a stop the thread does **not** show "La respuesta no llegó al stream —
  reintentar" and does not auto-recover the cancelled turn.
- While idle the composer is byte-for-byte the current send button, and
  `create-game-composer` is unaffected.
- `npm test` and `npm run typecheck` pass. `npm run lint` currently reports the two previously documented findings below; it is not fully green.

## Progress

- Exploration done: composer, thread, `TriggerChatTransport.stopGeneration`
  (`dist/esm/v3/chat.js`), the AI SDK `useChat.stop` abort path
  (`ai/src/ui/chat.ts`), and the SDK's stop/supersede-gate docs read.
- Key finding: a stop is indistinguishable from a lost turn to the existing
  recovery detectors — the guard in T2/T3 is load-bearing, not defensive.
- Delivery update: created branch `feat/chat-stop-readme-refresh` from up-to-date `main` after the user explicitly requested commit and push. Chat behavior and tests are included in a dedicated work-unit commit; no unrelated runtime code is staged.
- T1–T3 implemented. T2 was written test-first: the `stoppedByUser` assertions
  failed red (`expected true to be false`) against the old
  `shouldRecoverTurn` before the guard was added.

## Verification evidence

- `npm test` (vitest): **PASS** — 4 files, 26/26 tests, 2026-09-17. Red state
  observed first for the stopped-turn case, then green.
- `npm run typecheck` (`tsc --noEmit`): **PASS**, exit 0, 2026-09-17.
- `npm run lint` (`oxlint`): **exit 1 — 2 PRE-EXISTING errors, 0 from this
  change.** `trigger/example.ts:7 no-explicit-any` (file untouched) and
  `components/chat-thread.tsx:32 react(set-state-in-effect)` in the untouched
  `useProgressiveStatus` helper. Independently confirmed pre-existing by
  re-running `oxlint` with this change stashed: same 2 errors, same exit 1.
  The delegated writer reported exit 0 here; that report was wrong and is
  corrected by this direct measurement.
- Independent read-only verification (separate agent): all structural checks
  PASS — both `shouldRecoverTurn` sites pass `stoppedByUser`, stop button is
  `type="button"`/enabled/not gated on `canSubmit`, send button attributes
  unchanged, `stopGeneration` precedes `stop()`, `clearSupersedeGate` not
  called, `create-game-composer.tsx` untouched and typechecks. Adversarial
  traces (stopped-id suppression not bypassable, assistant-last-message stop
  safe, reload after stop harmless, no stuck-stop-button path) all came back
  clean. No defect attributable to this change.
- NOT verified: live behaviour against a running Trigger.dev backend. Static
  trace, typecheck, and unit tests only — no browser or Trigger run was
  executed.

## Delivery

- User authorized commit and push on 2026-09-27.
- Branch: `feat/chat-stop-readme-refresh`, created from `main` after fetching `origin`.
- Fresh-context review: PASS; no actionable defects found.
- Current delivery plan: include this feature and its task record in a dedicated conventional commit, then push the feature branch.

## Native review status — DECLINED (needs a user decision)

- Preflight ran as required. `gentle_review inspect` selected the candidate
  (5 paths, 308 changed lines, target
  `sha256:add19c38a204c2b9621d8ee570b24c9f5a68b97f71e7810861c01114fb32ff3c`)
  and returned `fresh_target_ready` for lineage `review-e5e1946af6e7118a`.
- `review start` came back **`consent-declined-this-candidate`**. The consent
  envelope was resolved declined before it reached the orchestrator, so no
  prompt was relayed and **no reviewer ran**. `lineage_created: false`,
  `mutation_performed: false`, `mutation_outcome: none` — nothing mutated.
- An earlier `select-intended-untracked` attempt had already hit
  `consent-binding-expired` on a stale binding from the previous session's
  candidate; that also performed no mutation.
- A re-`inspect` after the decline reverted to the base target (nothing was
  frozen), confirming the decline persisted no state.
- `assess` reports `risk: unassessable` (the untracked ODD doc needs an explicit
  declaration) and therefore applies the RDD-off risk-gated plan: writer
  self-verification **and** a separate independent verifier. Both were already
  run — the writer ran the three checks, and a separate read-only verifier
  independently reproduced them and traced the adversarial cases.
- Not yet done: the decline is candidate-scoped. A fresh `review start` for this
  candidate, or leaving it unreviewed, is the user's call.
- Untracked `NUL` (pre-existing Windows junk creating a spurious review-scope
  entry) is outside this change's scope; permanently excluding it via
  `.gitignore` or `.git/info/exclude` is a separate decision.

## Follow-up UI fix — solid stop glyph, TRIED AND REVERTED (same session)

- **Outcome: reverted.** The user saw the solid square in the running app and
  rejected it — "así cuadrado con relleno se ve bien feo, dejalo como estaba
  antes sin relleno". The stop glyph is back to the plain outline `<Square />`.
  The composer blob is again identical to the state that had already been
  accepted (`4eeab15`), and the diff contains no `fill=` anywhere.
- Recorded anyway so the same idea is not re-attempted, and because the
  underlying finding stays reusable even though this application of it did not.
- User feedback that produced it: the stop square should be **solid**, not a
  hollow outline.
- Verified constraint: `lucide-react` ships **outline-only** icons. Its
  `defaultAttributes` set `fill: "none"` on the `<svg>` root, and `0` of the
  ~1500 icons declare their own `fill`. There is no pre-filled square icon to
  import — the fill must be applied to the icon.
- How it was done: `<Square fill="currentColor" />`. Inline `attributes` are
  spread last in `buildLucideIconNode` and win over the `fill: "none"` default,
  and the child `<rect>` inherits the root's `fill` — confirmed by rendering both
  variants and diffing the markup (hollow: `fill="none"`; filled:
  `fill="currentColor"` on the `<svg>` root, inherited by the `<rect>`).
- Why `currentColor` rather than a hardcoded `black`: the button uses
  `variant="default"` → `bg-primary` + `text-primary-foreground`, so the glyph
  colour already resolves to near-black (`oklch(0.1908 …)`) on the dark theme
  and to `oklch(1 0 0)` on light. It also keeps the repo's strict token-only
  convention — `grep` finds **zero** hardcoded colours across `components/` and
  `app/`.
- Re-verified after the revert: `npm test` 26/26 PASS; `npm run typecheck` exit
  0; `npm run lint` unchanged (same 2 pre-existing errors, none in
  `chat-composer.tsx`).
