# Feature: Add Vitest for TDD

- Branch: `feat/add-vitest`
- Created: 2026-09-24
- Route: delegated direct (writer trigger: 2+ non-trivial files)
- TDD for THIS feature: n/a (the feature installs the runner; verify with a green smoke test)
- Delivery strategy: ask-on-risk (default); forecast ~40–80 authored changed lines

## Objective

Install and configure Vitest so future feature/fix work can run TDD (`bun run test` / `bun run test:watch`) without setup friction.

## Problem / Why

- Project has no test runner (`package.json` scripts: only typecheck/lint/build).
- User wants TDD available for upcoming features and fixes.

## Scope

In scope:
- devDeps: `vitest` (and only what is required to run unit tests).
- `vitest.config.ts`: environment `node`, path alias `@/*` → project root (match tsconfig), sensible include/exclude.
- `package.json` scripts: `test` (CI/single run), `test:watch`.
- One real smoke test that imports via `@/` alias and passes (proves config end-to-end).
- README: short Testing section.
- `.gitignore`: add `.vitest/` if Vitest 5 writes artifact dir there.

Out of scope:
- jsdom/component testing, Playwright/E2E, coverage thresholds, CI pipeline changes, enabling strict-TDD as a forced global policy.

## Constraints / decisions

- Package manager: Bun (`bun.lock`).
- Next.js 16 + TS path alias `@/*` → `./*`.
- Do NOT import `lib/env.ts`, `lib/ai.ts`, `lib/db.ts` in tests (fail-fast env / server-only).
- Smoke test target: pure module (e.g. `lib/games/suggestions.ts` shape or a trivial pure assert via `@/` import).
- Technical artifacts in English; user chat replies Spanish (Rioplatense).

## Acceptance criteria

- [x] `bun run test` passes (at least one real test file).
- [x] `bun run test:watch` script exists.
- [x] Alias `@/` resolves inside tests.
- [x] `bun run typecheck` and `bun run lint` still pass.
- [ ] Work-unit commit on `feat/add-vitest`.

## Checklist

- [x] T1 — Explore setup (package.json, tsconfig, no existing tests) — evidence: this session
- [x] T2 — Branch + this feature doc
- [x] T3 — Writer: install vitest, config, scripts, smoke test, README, gitignore — route: delegated — evidence: vitest@5.0.1; 3 tests pass
- [x] T4 — Parent spot-check: `bun run test`, typecheck, lint — evidence: test 3/3 pass, tsc exit 0, oxlint exit 0
- [x] T5 — Work-unit commit — evidence: `b7d101d` test: add Vitest with node env, @ alias, and smoke test

## Progress

- All tasks complete (T1–T5).

## Verification evidence

- T3 writer: success — vitest@5.0.1, scripts test/test:watch, vitest.config.ts with @ alias, lib/games/suggestions.test.ts (3 tests).
- T4 parent: `bun run test` 3/3 pass; `typecheck` pass; `lint` pass.
