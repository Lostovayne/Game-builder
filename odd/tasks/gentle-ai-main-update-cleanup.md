# Feature: Update Gentle AI to `main` and retire every SDD leftover

## Objective

Bring the machine-level Gentle AI installation (binary + every managed agent asset) to the
upstream `main` branch of `Gentleman-Programming/gentle-ai`, then delete every orphaned SDD /
OpenSpec artifact that v4.0.0 retired but `sync` deliberately preserves as "user-owned".

## Problem

`gentle-ai update` reports `installed: 4.0.0  latest: 4.0.0`, so the stable channel is already
satisfied — but upstream `main` is ahead of the `v4.0.0` tag (commits through 2026-10-03), and
the user wants the machine on `main`.

Separately, `v4.0.0` retired SDD/OpenSpec as a workflow. The v4 retirement removes *managed*
guidance on `sync`, but the release notes are explicit: *"User-owned installed files and
persisted SDD keys are preserved."* Our machine still carries every retired SDD surface, which
means dead skills, dead slash commands, dead subagents, and a live SDD orchestrator section that
gets injected into agent system prompts.

## Why

- One workflow (ODD) instead of two competing ones; SDD prompts are dead weight in every session.
- Stale `sdd-*` agents/skills can still be dispatched, wasting model calls on a retired path.
- The user wants an installation that is "updated and clean", not merely "not broken".

## Scope

### In scope (machine-global, none of it is in this repo)

- `~/go/bin/gentle-ai` — rebuild from `main`.
- `~/.config/opencode/` — skills, commands, prompts, `_shared`, plugins, `opencode.json`,
  `package.json` (+ `node_modules`).
- `~/.agents/skills/sdd-*`
- `~/.claude/agents/sdd-*.md` and the SDD section of `~/.claude/CLAUDE.md`
- `~/.pi/agent/agents/sdd-*.md`
- `~/.gemini/antigravity-cli/skills/sdd-*`
- `~/AGENTS.md` — the `gentle-ai:sdd-orchestrator` section.
- OpenCode model profiles that still assign `sdd-*` agents (`profiles/first.json`,
  `profiles/Personal.json`) — inspected, cleaned only if they are leftovers.

### Out of scope

- The `game-builder` repository: verified clean of SDD (0 tracked `sdd*` paths, `.atl/` ignored).
- Engram `sdd/{change}/...` topic keys: persisted history, explicitly preserved by upstream.
- Delivery actions (commit/push/PR) on this repository.

## Constraints

- Back up before deleting: nothing is destroyed without a restorable copy.
- Never hand-edit managed files before `sync` has rewritten them — sync owns the byte content.
- `gentle-ai sync` must run *after* the binary swap, otherwise assets render from 4.0.0.
- Engram reported `degraded (transport)` this session: the mirror write may fail; local doc wins.
- Artifact language: English (repo/Odd convention), independent of chat language.

## Checklist

- [x] T1 — Backup binary and snapshot every SDD path to an archive.
- [x] T2 — `go install github.com/gentleman-programming/gentle-ai/v4/cmd/gentle-ai@main`.
- [x] T3 — `gentle-ai sync` so all managed agent assets render from `main`.
- [x] T4 — Re-inventory SDD residue and delete only what sync left behind.
- [x] T5 — Drop `opencode-sdd-engram-manage` from `~/.config/opencode` and prune `node_modules`.
- [x] T6 — Verify: `gentle-ai doctor`, `gentle-ai update`, `opencode` boots, zero `sdd` hits.
- [x] T7 — Refresh the project skill registry; persist findings to Engram.

## Acceptance criteria

1. `gentle-ai version` reports a build derived from `main`.
2. `find` over every configured agent root returns **zero** `sdd*` paths.
3. `~/AGENTS.md` no longer contains `gentle-ai:sdd-orchestrator`.
4. `~/.config/opencode/opencode.json` contains no `sdd-*` agent keys.
5. `gentle-ai doctor` is green (or reports only pre-existing, unrelated findings).
6. OpenCode still loads: plugins, skills, and the review transport all resolve.

## Checks

- `gentle-ai version`
- `gentle-ai doctor`
- `gentle-ai update` (channel comparison)
- `gentle-ai sync --dry-run` (plan sanity)
- `opencode --version`
- `rg -i sdd` across the six agent roots (must be 0 paths)

## Route declaration

| Task | Route | Trigger evidence |
|------|-------|------------------|
| T1–T3 | inline | bounded state commands (`cp`, `tar`, `go install`, `sync`) — no file fan-out |
| T4–T5 | delegated | multi-file destructive write across 6 roots → single writer with an explicit surface |
| T6–T7 | inline | bounded verification batch (≤3 calls) |

## Progress

- 2026-10-03 — T0 exploration complete: inventory captured, repo confirmed clean.
- 2026-10-03 — T1 done. Backups in `~/.gentle-ai/retirement-backup-20261003/` (binary `gentle-ai-4.0.0.exe.bak.exe`, `sdd-full-final.tar.gz` 169 entries, `sdd-leftovers.tar.gz` 182, `sdd-skills.tar.gz` 30, `sdd-path-list.txt` 101 paths, `state.json.bak*`, `pi-codegraph.json.bak`, `openspec-convention-leftovers.tar.gz`).
- 2026-10-03 — T2 done. `gentle-ai 4.0.1-0.20261003190532-0dda8895f664`, `gentle-ai update` → `latest: main@0dda8895f664`.
- 2026-10-03 — T3 done. `gentle-ai sync` green after deselecting `opencode-gentle-logo` in `state.json` (OpenCode V2 has no logo slot; verification still expected the file).
- 2026-10-03 — T4 done. 88 SDD paths removed; SDD sections stripped from `~/AGENTS.md` and `~/.claude/CLAUDE.md`; 11 `sdd-*-fallback` agents dropped from `opencode.json`; profile keys pruned.
- 2026-10-03 — T5 done. `opencode-sdd-engram-manage` removed from `package.json`, `bun.lock`, `package-lock.json`, `node_modules`.
- 2026-10-03 — **Root cause found for SDD regeneration**: `gentle-ai sync` recreated 13 `~/.pi/agent/agents/sdd-*.md` on every run because `~/.gentle-ai/pi-codegraph.json` keeps a `children` journal and `restoreMissingPiChildren` (`internal/components/communitytool/pi_codegraph.go:878`) rewrites `owned.After` for any recorded child whose file is missing. The 13 `sdd-*` entries were removed from the manifest (backed up), files deleted, and a subsequent `gentle-ai sync` left **zero** regeneration (EXIT 0).
- 2026-10-03 — Also removed 3 leftover `skills/_shared/openspec-convention.md` files (retired upstream asset, absent from `main`'s embedded `_shared/`), backed up as `openspec-convention-leftovers.tar.gz`.
- 2026-10-03 — T6 verified: doctor 9/0 healthy, assets match `4.0.1-0.20261003190532-0dda8895f664`, `opencode v2.0.22`, zero `sdd*` in all five agent roots, `gentle-ai:sdd-orchestrator` markers 0 in `~/AGENTS.md` and `~/.claude/CLAUDE.md`, `opencode.json` 0 `sdd` hits.
- 2026-10-03 — T7 done: `gentle-ai skill-registry refresh` → 188 skills, 0 SDD. Residual `sdd-` text hits are historical only (session `.jsonl` transcripts, `profile-versions/*` snapshots, `*.bak` files, upstream `gentle-pi` package tests) — not live configuration.
- 2026-10-03 — Engram session summary persisted.
- 2026-10-03 — User authorized deleting historical junk (no commit needed; local OpenCode installation only). Pass 1: 362 files archived+deleted (`sdd-historical-junk.tar.gz`) — stale `*.bak`/`*.backup` in `~/.config/opencode`, SDD `profile-versions` snapshots, SDD session transcripts (Pi/Gemini), SDD chat logs.
- 2026-10-03 — Pass 2: 299 files archived+deleted (`sdd-historical-junk-pass2.tar.gz`) — Pi agent sessions/task records/history seeds and Antigravity brain transcripts. Plus `~/.pi/agent/subagents.json`: 13 dead `sdd-*` model profiles dropped (backup `subagents.json.bak`); 20 live profiles intact.
- 2026-10-03 — Final state: config/history roots 0 SDD; only remaining mentions are upstream `main` managed content (`skill-registry`/`branch-pr` skip rules, `AGENTS.md` Engram + trigger-rule sections, `odd` skill contrastive text) which sync owns. `gentle-ai sync` EXIT 0, `doctor` 9/0 healthy, `opencode v2.0.22`.
- 2026-10-03 — User demanded zero residue. Final garbage sweep: `~/.pi/gentle-ai/models.json` 13 dead `sdd-*` model profiles dropped (20 live kept, backup `pi-gentle-ai-models.json.bak`); OpenChamber SDD context cache archived+deleted; `~/.gentle-ai/opencode-shim-backup-20260914` archived+deleted; 11 old dated logs + 47 MB `opencode.log` recycled; 306 stale shell captures removed; 298 empty dirs removed; `~/.config/opencode/nul` Windows redirect artifact (289 KB) removed.
- 2026-10-03 — Zero paths named `*sdd*`/`*openspec*` in `.config`, `.agents`, `.claude`, `.pi`, `.gemini`. Content matches reduced to 12 files: 6 upstream managed skill assets, `~/AGENTS.md` managed sections, live registered `odd` skill (anti-SDD text), 4 third-party bundles/adblock lists. Kept deliberately: managed assets (sync rewrites them), live tool data (opencode db, caches), `gentle-ai/backups` (today's sync rollback snapshots), `review-contexts` (35 live RDD contexts).

## Next step

None — feature complete. Delivery (commit of this feature doc) left to the user.
