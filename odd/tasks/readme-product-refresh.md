# README Product Refresh

## Objective

Refresh the README so the product chat screenshot leads the page, presentation feels polished, implemented capabilities are accurately marked, and setup/architecture details reflect the current repository.

## Problem and why

The README currently opens with a screenshot presented as a logo, describes an obsolete `/api/chat` route/streaming implementation, identifies ESLint despite `oxlint` being configured, and lists persisted messages as unfinished although message storage exists. The user requested a professional, centered screenshot near the top and a full accuracy/status cleanup.

## Scope

- `README.md` only for product documentation edits.
- Preserve the user's existing screenshot asset and all unrelated working-tree changes.
- Keep technical artifacts in English, following current README convention.

## Constraints

- Do not edit the screenshot asset or unrelated source files.
- Preserve the unrelated existing worktree changes. The user later explicitly authorized commits and push for the current changes; deliver the coherent README and chat work units on a feature branch.
- TDD mode: not applicable to documentation-only edits. Exact functional test runner is `npm run test` (Vitest), but it is not applicable to this README-only task.

## Tasks

### RDR-1 — Audit README claims against current implementation

- **Status:** complete
- **Route:** delegated read-only mapping (`gentle-ai-explore`), because accuracy depends on the current architecture beyond a one-file README read.
- **Evidence:** `trigger/chat.ts`, `lib/chat/store.ts`, `db/schema.ts`, `lib/games/actions.ts`, `lib/env.ts`, `package.json`, and `drizzle.config.ts` were compared with README claims. Durable Trigger.dev chat agent and transcript persistence are implemented; `npm run lint` uses oxlint; stale roadmap entries need correction.
- **Checks:** Independent source-to-document audit returned exact repository references.

### RDR-2 — Reorganize and polish README

- **Status:** complete
- **Route:** inline direct, one documentation file, with audited factual corrections.
- **Work:** Centered the product screenshot at the top with responsive sizing, rounded corners, a subtle border, and descriptive alt text; clarified the product status; reorganized features into implemented/roadmap checklists; corrected the chat runtime to Trigger.dev and described transcript recovery; updated the existing game library as implemented; aligned setup, scripts, prerequisites, and structure with the current repository.
- **Acceptance:** README opens with the product screenshot and concise product explanation; obsolete `/api/chat`, ESLint, and unfinished-persistence claims removed; completed features visibly checked; remaining roadmap items source-audited; setup and scripts match current files; screenshot asset and unrelated changes untouched.
- **Checks:** `git diff --check -- README.md odd/tasks/readme-product-refresh.md` passed. README was read back and source claims checked against the Trigger.dev agent/storage, game query/sidebar, env, and package script implementations. A fresh-context audit confirmed the screenshot reference and key stack versions. Unit/build tests were not run because this work unit is documentation-only. `README.md` points to `public/capture.png` (1717×916); historical notes about `capture.webp` are obsolete.

## Progress and evidence

- At audit time, the workspace had pre-existing chat source/tests, package files, and untracked files. The current README references the actual screenshot asset `public/capture.png` (1717×916); `public/capture.webp` is absent.
- The user subsequently authorized commit and push. The README/assets work is committed on the feature branch. The unintegrated `@daytona/sdk` change is isolated in its own dependency commit; the unrelated `NUL` artifact is excluded.
- Engram mirror save was attempted but could not be completed because multiple active runtime sessions match the project/worktree. The task document remains the local progress record.

## Next step

README refresh is complete. `README.md` and `public/capture.png` are in commit `90ac633` (`docs: refresh product README`) on `feat/chat-stop-readme-refresh`. The screenshot is the actual product chat capture and is 1717×916.
