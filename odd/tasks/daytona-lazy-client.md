# Feature: Lazy Daytona client (fix `trigger:deploy` TaskIndexingImportError)

## Problem

`pnpm run trigger:deploy` fails at the deployment index stage:

```text
TaskIndexingImportError: There was an error importing task files
file: "lib/daytona/utils.ts" → Error: DAYTONA_API_KEY is not set
```

Root cause chain (confirmed 2026-10-07):

1. Trigger's indexer (`registerResources.js`) imports **every** file in the
   build manifest, including the chunk emitted for the dynamic
   `import("@/lib/daytona/utils")` in `trigger/chat.ts` / `lib/games/tools.ts`.
2. `lib/daytona/utils.ts:12` statically imports `@/lib/daytona/client`.
3. `lib/daytona/client.ts` throws at **module scope** when `DAYTONA_API_KEY`
   is absent — and the deploy index container has no `.env.local`.

The dynamic-import deferral assumed in `trigger/chat.ts:71-75` does not hold
at index time: the indexer imports the lazy chunk itself.

## Solution (option A — user-authorized)

Make `lib/daytona/client.ts` side-effect-free at module scope: resolve the
`Daytona` client lazily via `getDaytona()`, which validates
`DAYTONA_API_KEY` at **call** time. Index/build/test imports become safe
regardless of env; runtime still fails fast with the same message on first
real use.

Out of scope: Trigger dashboard env vars (runtime worker still needs
`DAYTONA_API_KEY` configured — noted for the user, not part of this change).

## Non-goals

- No proxy/magic export: explicit `getDaytona()` over keeping the `daytona`
  value export.
- No changes to `trigger.config.ts` or deploy configuration.

## Tasks

- [x] T1 — RED: new `lib/daytona/client.test.ts` covering: importing the
      module without `DAYTONA_API_KEY` does not throw; `getDaytona()` throws the
      env error when the key is absent; returns a `Daytona` instance and caches
      it when the key is present. Route: inline (single-file test, parent had
      full context). Evidence: RED observed — `pnpm test --run
lib/daytona/client.test.ts` 4 failed / 4 (missing `getDaytona` export).
- [x] T2 — GREEN: implemented `getDaytona()` in `lib/daytona/client.ts`
      (env check at call time, instance cached with `??=`); updated the 3 call
      sites in `lib/daytona/utils.ts`; updated module mocks in
      `lib/daytona/utils.test.ts` and `app/api/games/[id]/preview/route.test.ts`;
      refreshed the stale "module-scope env" comments in `trigger/chat.ts` and
      `lib/games/tools.ts`. Evidence: GREEN observed — focused suites 3 files /
      37 tests passed; LSP diagnostics on changed files 0; Prettier clean.
- [x] T3 — Verify: delegated to `gentle-ai-verify` (independent, read-only):
      `pnpm test` 15 files / 154 tests pass; `pnpm run typecheck` clean;
      `pnpm run lint` clean. Prettier initially flagged this document; fixed with
      `prettier --write` and re-checked clean. Work-unit commit pending explicit
      user authorization.

## Evidence

- 2026-10-07: Doc created after exploring `client.ts`, `utils.ts`,
  `trigger/chat.ts`, `tools.ts`, Trigger's `registerResources.js`, and the
  deploy log. Branch `fix/daytona-lazy-client` cut from `main`.
- 2026-10-07: RED observed (4/4 failed), then GREEN (focused 37/37).
  Independent verification: full suite 154/154, typecheck clean, lint clean.
- 2026-10-07: Deploy verified — `pnpm run trigger:deploy` completed,
  version `20261007.2` promoted to prod, indexer wrote `index.json`
  without the TaskIndexingImportError; `trigger report health --env prod`
  reports flow healthy.
- 2026-10-07: **Committed:** branch `fix/daytona-lazy-client`, commit
  `d2aec25` `fix(daytona): resolve client lazily so deploy indexing stays
import-safe` — 7 files, 92 insertions / 16 deletions (code + tests +
  comments). Merge to `main`, push, and branch cleanup authorized by the
  user in the same session.
