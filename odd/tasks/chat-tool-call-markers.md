# Feature: chat tool call state markers

## Objective
Display tool calls in the chat thread with an explicit lifecycle state —
active, done, failed — rendered with the existing `Marker` primitives from
`components/ui/marker.tsx`.

## Problem
`components/chat-thread.tsx` only renders `text` and `reasoning` parts.
Tool invocation parts (`tool-*` / `dynamic-tool`) are silently dropped, so
while the agent is working (list_files, write_file, replace_text…) the UI
looks idle, and a failed tool call leaves no visible trace.

## Why
The agent routinely runs 5–30 steps per turn (`MAX_TURN_STEPS` in
`trigger/chat.ts`). Without tool state feedback the user cannot tell
"thinking" from "stuck" from "failed", which is the main perceived-latency
complaint on this flow.

## Scope
- `lib/chat/tool-call-state.ts` (new) — pure mapping from an AI SDK v7
  `UIMessage` tool part to `{ state, label, detail? }`.
- `lib/chat/tool-call-state.test.ts` (new) — vitest coverage (RED first).
- `components/chat-tool-marker.tsx` (new) — `ToolCallMarker` UI built on
  `Marker`/`MarkerIcon`/`MarkerContent` + lucide icons + `Spinner`.
- `components/chat-thread.tsx` — render tool parts inline, in part order,
  interleaved with text parts (assistant branch only).
- No changes to `marker.tsx`, no new dependencies, no backend changes.

## Constraints
- AI SDK v7 state machine (verified against installed `node_modules/ai`):
  - **active**: `input-streaming`, `input-available`, `approval-requested`,
    `approval-responded`
  - **done**: `output-available`
  - **failed**: `output-error`, `output-denied`
- Use `isToolUIPart` from `ai` for narrowing; tool name from
  `part.toolName` (dynamic) or `part.type.slice("tool-".length)` (static);
  prefer `part.title` when present.
- Error detail (`errorText`) shown only on `output-error`.
- No synthetic SDD artifacts; delivery = work-unit commits only.

## Tasks
- [x] T1 — RED: `lib/chat/tool-call-state.test.ts` covering all 7 states,
  name/title fallback, non-tool part → null.
- [x] T2 — GREEN: `lib/chat/tool-call-state.ts` pure mapper.
- [x] T3 — `components/chat-tool-marker.tsx` (`ToolCallMarker`) rendered
  from `Marker` (spinner + pulse while active, check when done, X +
  destructive color when failed).
- [x] T4 — Integrate in `components/chat-thread.tsx`: iterate
  `message.parts` in order for assistant messages, rendering text spans
  and `ToolCallMarker`s interleaved; keep reasoning `<details>` behavior.
- [x] T5 — Verify: `pnpm test`, `pnpm typecheck`, `pnpm lint` on touched
  files; next-devtools compile check if available.

## Authorized scope
User request 2026-10-03: "/ai-sdk @sandbox/components/chat-thread.tsx to
display tool call states (active, done, failed) using
@sandbox/components/ui/marker.tsx". Strict TDD mode: on (AGENTS.md).

## Acceptance criteria
- Every tool part renders exactly one marker, in stream order.
- active = spinner + pulsing text; done = check; failed = X +
  `text-destructive` + errorText.
- Non-tool parts and user messages unaffected.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Progress
- Exploration done: AI SDK v7 `UIToolInvocation` states read from installed
  types; `Marker`/`MarkerIcon`/`MarkerContent` API read; vitest (node env)
  confirmed as runner; `isToolUIPart` exported by installed `ai`.
- Branch: `feat/chat-tool-call-markers` (from `main`).

## Evidence
- Work-unit commit: 22d5ed5 `feat(chat): render tool call states with marker UI` (branch `feat/chat-tool-call-markers`).
- Checks: `pnpm vitest run` 137/137 pass (13 new, RED observed first), `pnpm typecheck` clean, `pnpm lint` clean — independently re-run by gentle-ai-verify.
- Native review: lineage `review-8074bac26ddeaa13`, medium tier, lens `review-reliability` → **approved**, acknowledged (`authority: burned`).
