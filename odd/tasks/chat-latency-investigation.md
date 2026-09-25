# Investigate chat first-response latency (22s queue + ~4s model)

## Objective

Explain and reduce the ~26 s a user waits between creating a game and seeing the
first streamed assistant token. Currently ~85 % of that wait is time the
`game-chat` run sits queued before a Trigger.dev worker picks it up, not model
generation time.

## Problem

A user watching the screen perceives "the model is slow". Evidence says it is not.

Measured on 2026-09-25 (UTC), from the Trigger.dev API:

| game        | run createdAt         | run startedAt         | queue wait | model → first token | total perceived |
| ----------- | --------------------- | --------------------- | ---------- | ------------------- | --------------- |
| `d4af694c`  | 06:00:51.543          | 06:01:14.001          | **22.5 s** | ~3.5 s              | ~26 s           |
| `db777426`  | 05:54:58.035          | 05:55:14.411          | **16.4 s** | ~5 s                | ~21 s           |

Older runs on the same day show queue waits from 2 s to 32 s:

```
04:05:15.915 -> 04:05:23.631   7.7s
04:16:23.087 -> 04:16:25.191   2.1s
04:17:09.183 -> 04:17:41.185  32.1s
04:30:38.380 -> 04:30:58.027  19.6s
04:36:45.568 -> 04:36:46.196   0.6s
04:42:04.492 -> 04:42:19.844  15.4s
```

## Why

Unknown yet — that is what this task is for. Candidate hypotheses, none
verified:

1. `trigger dev` boots/cold-starts a worker between runs (scale-to-zero in dev).
2. A code change forces a redeploy of the worker version before the run is
   eligible (the client already logs `run parked waiting for deployment`).
3. Dev-mode queue depth / concurrency limits in the Trigger project.
4. Session creation (`startGameSession` server action) adds its own latency
   before the run row exists.

## Scope

- Read-only investigation first; no optimization until the cause is measured.
- Delivery strategy: this is investigation. Any resulting fix is a separate
  task and must respect the ~400 authored-line PR budget.

## Tasks

- [ ] T1 — Attribute the wait precisely: split `createdAt → startedAt` (queue)
      from `startedAt → first chunk` (model) across ~10 runs, including runs
      created with no code change in between, to separate cold start from
      redeploy.
- [ ] T2 — Reproduce a cold vs warm run: two consecutive runs with no edit in
      between; compare queue waits.
- [ ] T3 — Check whether `trigger dev` logs show a deploy between runs; the
      worker logs and `trigger dev` stdout are the source of truth here.
- [ ] T4 — Measure `startGameSession` server-action duration separately (it
      runs before the run row exists, so it is invisible to the Trigger API).
- [ ] T5 — Only after T1–T4: decide whether the fix is worker warm-up,
      `chat.headStart` (NOT to be attempted unless explicitly requested), or
      accepting dev-only latency and labelling it in the UI.
- [ ] T6 — If a fix is chosen, implement it as its own work-unit with
      verification, then re-measure and record before/after.

## Acceptance criteria

- [ ] A written breakdown of the 26 s into named stages with measured numbers.
- [ ] A single identified dominant cause (not a list of guesses).
- [ ] Either an implemented fix with before/after numbers, or an explicit
      decision that dev-only latency is acceptable.

## Evidence already collected

- Trigger API is reachable read-only with `TRIGGER_SECRET_KEY` from
  `.env.local` (prefix `tr_de`, len 34):
  `GET /api/v1/runs?taskId=game-chat&limit=N` and `GET /api/v1/sessions?limit=N`.
- `GET /api/v1/runs/{id}` and `/api/v1/logs` return 404 — do not use them.
- `durationMs` reads `0` and `finishedAt` stays `null` for runs parked in
  `wait.forToken()`; do not use `durationMs` for timing.
- `components/chat-thread.tsx` `onEvent` already logs
  `first-chunk after <N>ms` and `run parked waiting for deployment` — the
  cheapest source for the model-side split.
- Console logs from Playwright land in `.playwright-mcp/console-*.log`.

## Route declaration

- Investigation so far: **direct inline** (read 1–3 files at a time, API calls
  via bash). No delegation trigger fired.
