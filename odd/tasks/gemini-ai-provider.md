# Feature: Switch AI provider from Novita to Gemini (dual model)

- Branch: `feat/gemini-provider`
- Created: 2026-09-24
- Route: delegated direct (writer trigger: 2+ non-trivial files)
- TDD: disabled — no test runner in package.json scripts (only `typecheck`, `lint`, `build`)
- Delivery strategy: ask-on-risk (default); forecast ~80–120 authored changed lines (under 400)

## Objective

Replace the Novita OpenAI-compatible provider with Google Gemini via `@ai-sdk/google`, splitting the single shared model into two env-driven models: one ultra-fast/cheap model for sidebar game titles, one fast model for chat.

## Problem / Why

- Current `lib/ai.ts` points at Novita with one shared `getModel()`.
- User wants Gemini and two separate models optimized per task (title = cheapest/fastest lite; chat = fastest flash).

## Scope

In scope:
- `package.json` / lockfile: add `@ai-sdk/google`; remove `@ai-sdk/openai-compatible` if no longer imported anywhere.
- `lib/env.ts`: replace `NOVITA_API_KEY` + `NOVITA_AI_MODEL` with `GEMINI_API_KEY`, `GEMINI_TITLE_MODEL`, `GEMINI_CHAT_MODEL` (all required, with clear fail-fast messages; Gemini keys typically start with `AIza`).
- `lib/ai.ts`: rewrite to export `getTitleModel()` and `getChatModel()` using `createGoogle`/`google` from `@ai-sdk/google`.
- `app/api/chat/route.ts`: use `getChatModel()`.
- `lib/games/actions.ts`: use `getTitleModel()`.
- `README.md`: update env docs.
- `.env.local`: add GEMINI_* placeholders (real API key is user-provided; do not invent one).

Out of scope:
- UI/chat-thread changes, DB schema, Clerk, delivery/PR.

## Constraints / decisions (verified)

- Title model default: `gemini-3.5-flash-lite` ($0.30/$2.50 per 1M, ~350 tok/s) — latest lite text model; there is NO `gemini-3.7-flash-lite` or `gemini-3.8-flash-lite` text model (only TTS variants / non-lite).
- Chat model default: `gemini-3.8-flash` ($0.75/$3.75 intro through 2026-12-31) — newest flash, same intro price as 3.7.
- Models stay env-configurable; code only reads env.
- Provider official package: `@ai-sdk/google` (`createGoogle({ apiKey })` or `google(modelId)` with explicit apiKey).
- Technical artifacts in English; user-facing chat replies in Spanish (Rioplatense).

## Acceptance criteria

- [ ] No remaining references to `NOVITA_*` or `createOpenAICompatible` in source (README/env/lib/call sites).
- [ ] `getTitleModel()` and `getChatModel()` both resolve from env via `lib/ai.ts`.
- [ ] Chat route uses chat model; title generator uses title model.
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes (or only pre-existing failures, reported honestly).
- [ ] `.env.local` documents GEMINI_* vars; missing key fails fast with clear message.
- [ ] Work-unit commit on `feat/gemini-provider` with Conventional Commit.

## Checklist

- [x] T1 — Explore current Novita implementation and verify Gemini model IDs (inline + web) — evidence: this session, ai.google.dev model list
- [x] T2 — Create branch `feat/gemini-provider` + this feature doc — evidence: branch created; doc written
- [x] T3 — Delegate writer: install `@ai-sdk/google`, rewrite `lib/ai.ts` + `lib/env.ts`, update both call sites, README, `.env.local` placeholders — route: delegated — evidence: writer success; files changed as listed below
- [x] T4 — Verify: `typecheck` + `lint`; spot-check no NOVITA leftovers — route: inline (parent spot check) — evidence: `tsc --noEmit` pass, `oxlint` pass, rg NOVITA/getModel → 0 hits in lib/app/README
- [x] T5 — Work-unit commit on `feat/gemini-provider` — route: inline — evidence: `bcf1676` feat(ai): switch provider to Gemini with dual env-driven models
- [x] T7 — Merge to main + push origin — user-authorized delivery — evidence: fast-forward `af64471..bcf1676`, `main -> main` pushed
- [ ] T6 — User provides real `GEMINI_API_KEY` in `.env.local`; smoke-check title + chat if key present

## Progress

- T1–T5, T7 done. Merged and pushed. T6 still waits on user's real API key.

## Verification evidence

- T3 writer: success — `@ai-sdk/google@4.0.79` added; `@ai-sdk/openai-compatible` removed; `reasoning:"none"` kept (maps to thinkingLevel minimal/low on Gemini 3 via provider).
- T4 parent spot check: `bun run typecheck` pass; `bun run lint` pass; no Novita leftovers in source.
- Diff: 7 files, +67/−49 (plus .env.local untracked/ignored).
