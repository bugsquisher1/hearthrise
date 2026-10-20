# COORDINATOR

_Who holds the Coordinator role right now. Exactly one holder at a time (CLAUDE.md §3.1). Only the holder merges to `main`/`set/*`/`release/*`, pushes `main`, applies migrations, deploys edge functions, posts Discord notes, or edits `tests/live-hash-drift.baseline.json`._

## Current holder

| Field | Value |
|---|---|
| Holder | **PC session (second account, Opus 5.5)** |
| Since | 2026-10-20 03:00 UTC |
| Handoff | HANDOFFS.md 2026-10-20 01:45 UTC (previous account out of weekly usage until 2026-10-24 17:00 UTC) |

## Rules

1. **If this file does not name you, you are a lane worker.** Work on your own branch only. No merge to `main`, no apply, no deploy, no Discord, no baseline edits.
2. **A handoff is two commits, one from each side.** The outgoing holder commits its handoff entry (template: `HANDOFF_TEMPLATE.md`) and pushes. Only after that push does the incoming holder set itself as holder here and push. Tyler can override either step.
3. **The incoming holder verifies before acting:** `git fetch origin`, compare `origin/main` and the open `release/*` / `set/*` branches against the handoff, and check what is APPLIED against the apply-order notes. Anything the handoff and git disagree on is reported to Tyler, not guessed.
4. **No re-apply, no re-deploy on uncertainty.** If the handoff does not say a migration or edge deploy landed, treat it as unknown and check live read-only first.
5. **The outgoing holder stops writing when the incoming holder is set.** Giving the role back is the same two-step.
6. **Cloud holder limits (as of 2026-10-19):** no `~/.supabase-token`, no `~/.hearthrise/changelog-webhook`, no QA-signed-in browser. Until those exist here: applies, the Discord note and the live play gate are reported as "not done: needs the PC session", never faked.

## Handoff log

_Newest first. One line per transfer: date · from → to · reason · handoff entry link._

- 2026-10-20 · PC primary account → PC second account · weekly usage exhausted (Tyler's instruction) · HANDOFFS.md 2026-10-20 01:45 UTC
- 2026-10-19 · (initial) · PC session holds the role.
