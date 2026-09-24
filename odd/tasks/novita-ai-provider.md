# Feature: Switch AI provider to Novita (OpenAI-compatible) + centralized model

Branch: `feat/novita-ai-provider`
Created: before first source write (ODD tracking).

## Goal

Replace the AI Gateway default provider with Novita's OpenAI-compatible endpoint
(`https://api.novita.ai/openai`), centralize model creation so sidebar title
generation and chat responses share one implementation, and validate the API
key + model name in `lib/env.ts`.

## Tasks

- [x] T1 — `lib/env.ts`: add required `NOVITA_API_KEY` and `NOVITA_AI_MODEL` server vars
- [x] T2 — `lib/ai.ts`: new module exporting a single `getModel()` built with `createOpenAICompatible` (baseURL = Novita, apiKey from env)
- [x] T3 — `app/api/chat/route.ts`: use centralized `getModel()` instead of gateway model string
- [x] T4 — `lib/games/actions.ts` (sidebar title generation): use centralized `getModel()`
- [x] T5 — deps: add `@ai-sdk/openai-compatible`; update `.env.local` + README env docs (drop `AI_GATEWAY_API_KEY`)
- [x] T6 — verify: `bun run typecheck` + `bun run lint` — both exit 0

## Non-goals

- No changes to chat UI, streaming contract, or DB schema.
- No provider fallback logic.

## Evidence

- Branch: `feat/novita-ai-provider`
- Commit: `8dbf5cf` feat(ai): switch provider to Novita with centralized env-driven model
- Checks: `bun run typecheck` → exit 0; `bun run lint` (oxlint) → exit 0
- `.env.local`: `NOVITA_API_KEY=PASTE_YOUR_NOVITA_API_KEY` (placeholder — real key required before running), `NOVITA_AI_MODEL=deepseek/deepseek-v3.1`
- Native review lineage `review-522ec869fc7a0d68` (medium tier, lens review-reliability): reviewer run BLOCKED twice by deterministic provider error — `opencode-zen-free API error (403): OpenCode's free tier can only be used from within OpenCode`. No verdict produced, no acknowledgement issued, no mutation. Blocked on reviewer model profile config, not on the candidate diff.
