# Feature: chat scroll stick-to-bottom

## Objective
Fix chat thread scrolling so long content scrolls inside the message list, input stays fixed visible, with scroll-to-bottom indicator and smooth auto-follow of the latest message.

## Problem
When messages exceed viewport height, the whole page grows instead of the message list scrolling internally. Input is pushed out of view (Image 1). Expected: bounded scroll area + button to go down + smooth follow (Image 2).

## Why
`MessageScroller` primitives are already installed (`@shadcn/react/message-scroller`) and wired in `components/chat-thread.tsx`, but misconfigured; plus the height chain from `SidebarProvider` -> `SidebarInset` -> game page -> thread is unbounded (`min-h-svh` everywhere, no `overflow-hidden`), so the viewport never gets a bounded height.

## Scope
- `app/(app)/games/[id]/page.tsx` — bound page container height.
- `components/chat-thread.tsx` — correct `MessageScrollerProvider`/`Item`/`Button` usage + keep composer fixed.
- No changes to `components/ui/message-scroller.tsx` wrapper, no new deps.

## Constraints
- Keep input outside the scroll viewport, always visible.
- Respect user scroll-up: auto-follow only when at/near bottom; button appears otherwise.
- No synthetic SDD artifacts; ordinary repo policy owns delivery (no push/PR without user).

## Tasks
- [x] T1 — Bound height chain: page container `h-dvh/min-h-0/overflow-hidden`, thread root `min-h-0/overflow-hidden`, composer `shrink-0`.
- [x] T2 — Wire scroller correctly: `Provider autoScroll defaultScrollPosition="end"`, every `Item messageId={message.id}` with last item `scrollAnchor`, `Button behavior="smooth" direction="end"`.
- [x] T3 — Verify: `tsc --noEmit` + `oxlint` pass; manual scroll check confirmed by user ("quedó muy bien"); next-devtools `get_errors` + `get_compilation_issues` clean.
- [x] T4 — Fix duplicate React keys (`key=""` from stored messages without ids): fallback `itemId = message.id || message-${index}` for `key` + `messageId`; verified via next-devtools `get_errors` = 0, `get_compilation_issues` = 0.

## Authorized scope
User-authorized fix for chat scroll behavior described 2026-09-17. TDD: off (no test runner in repo; ordinary functional checks only). Test runner: none.

## Acceptance criteria
- Long thread: message list scrolls internally, input never leaves view.
- Scrolled up: bottom button visible, click smoothly goes to latest.
- Streaming new tokens while at bottom: view follows latest smoothly.
- `tsc --noEmit` and `oxlint` pass for touched files.

## Progress
- Exploration done via codegraph: root causes confirmed (unbounded height chain + `autoScroll=false` default + missing `messageId`/`scrollAnchor`).
- Branch: `fix/chat-scroll-stick-to-bottom` (from `main`).

## Verification evidence
- `npm run typecheck` (tsc --noEmit): pass, 2026-09-17.
- `npm run lint` (oxlint): pass, 2026-09-17.
- Manual browser check: pending.
- next-devtools (port 3000, 2026-09-17): `get_errors` → `configErrors: []`, `sessionErrors: []`; `get_compilation_issues` → `[]`.

## Next step
- Implement T1+T2, run T3 checks, one work-unit commit.
