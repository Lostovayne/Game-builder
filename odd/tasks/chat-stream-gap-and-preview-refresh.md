# Feature: chat stream gap indicator and first-turn preview refresh

## Objective
Remove the two "looks broken" moments on the first chat turn:
1. Dead air between stream parts — the model is thinking but the UI is frozen.
2. The preview panel not opening after the first turn provisions the sandbox.

## Problem
`components/chat-thread.tsx` only renders a pending bubble when the assistant
message has **no** parts yet. Once a text or tool part settles and the next one
has not arrived, `BubbleContent` renders an empty tail: the transcript is
non-empty, nothing is animating, and the turn looks stuck.

Separately, `components/game-chat.tsx` bumps `previewRevision` on turn settle
but the sandbox is usually provisioned *during* the first turn. The server had
already rendered the page with `sandboxId === null`, so `ChatPreview` is not in
the tree and the panel stays hidden until a manual reload.

## Why
Perceived latency on the first turn is the main complaint on this flow: the
agent runs 5–30 steps per turn (`MAX_TURN_STEPS` in `trigger/chat.ts`), so gaps
between parts are common and are exactly when the user decides the app hung.

## Scope
- `lib/chat/stream-gap.ts` (new) — pure `isAwaitingNextChunk(parts, isStreaming)`
  predicate: true only when streaming and the last part has settled.
- `lib/chat/stream-gap.test.ts` (new) — vitest coverage (RED first).
- `components/chat-thread.tsx` — render a pulsing `Pensando…` span when the
  predicate holds for the streaming assistant message.
- `components/game-chat.tsx` — call `router.refresh()` on turn settle when
  `sandboxId === null`, so the server re-renders with a live sandbox and the
  preview mounts on its own.
- No new dependencies, no backend changes, no schema changes.

## Constraints
- AI SDK v7 part state machine, read from installed `node_modules/ai`:
  `text`/`reasoning` use `state: "streaming" | "done"`; tool parts are narrowed
  with `isToolUIPart` and resolved through the existing
  `getToolCallState` in `lib/chat/tool-call-state.ts`.
- The predicate must not fire while the first chunk is still missing (the
  existing pending bubble owns that case) nor while any part is producing
  output.
- `router.refresh()` only when `sandboxId === null`; when the sandbox already
  exists the revision bump alone re-mounts the preview and a refresh would
  discard nothing but cost a needless server round trip.

## Tasks
- [x] T1 — RED: `lib/chat/stream-gap.test.ts` covering not-streaming, no parts,
      streaming text, settled text, settled tool call, active tool call,
      settled reasoning.
- [x] T2 — GREEN: `lib/chat/stream-gap.ts` pure predicate.
- [x] T3 — Wire the indicator into `components/chat-thread.tsx` (assistant
      branch, after the part list, `aria-live="polite"`).
- [x] T4 — `components/game-chat.tsx`: `useRouter` + conditional
      `router.refresh()` inside `handleTurnSettled`, with `sandboxId` and
      `router` in the dependency array.
- [x] T5 — Verify: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

## Authorized scope
User request: two uncommitted fixes in
`C:/Users/Deus/Documents/dev/game-builder-saas/sandbox` (stream gap indicator;
first-turn preview auto-open). Strict TDD mode: on (AGENTS.md).

## Acceptance criteria
- No indicator while not streaming, while the first chunk is missing, or while
  text/reasoning is still streaming.
- Indicator shown when the last part has settled and streaming continues.
- The preview panel mounts after the first turn without a manual reload, and
  `router.refresh()` is not called once `sandboxId` exists.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Progress
- Exploration done: `chat-thread.tsx` pending-bubble logic read; AI SDK v7 part
  states read from installed types; existing `getToolCallState` reused.
- Branch: `fix/chat-stream-gap-and-preview-refresh` (from `main`).

## Evidence
- Work-unit commit: `fd6ed9d` `fix(chat): show a thinking indicator between stream parts`.
- Work-unit commit: `74ddcad` `fix(chat): refresh the page so the preview opens after the first turn`.
- Checks (independently re-run by `gentle-ai-verify`): `pnpm test` 147/147 pass
  (14 files, 0 failed, 0 skipped), `pnpm typecheck` clean, `pnpm lint` clean.
- Native review: lineage `review-29d652ec6f834475`, medium tier, lens
  `review-reliability` → **approved**, acknowledged (`authority: burned`).
