# ACTIVE_WORK

_What each agent is doing right now. Update when you start, change scope, or finish. Check this before touching a shared surface._

| Agent | Task | Files being modified | Depends on | Possible conflicts | Status | Updated |
|---|---|---|---|---|---|---|
| Coordinator | Backlog triage + Wave 0 dispatch/integration | `.claude/**` | — | none | in progress | 2026-08-08 |
| Systems Engineer | **#3** inventory tab snap-back bug; **diagnose #4** companion stats binding | `src/legacy.js`, `src/features/activities-grid.js`, `src/features/companions.js` (worktree) | — | `legacy.js` overlap w/ Art — Art is CSS/header only | in progress (worktree) | 2026-08-08 |
| Art Director | **#1** global readable text scale; **#2** logo redesign | `src/styles/*.css`, `index.html` header (worktree) | — | keep out of `legacy.js` render logic (Systems owns it this wave) | in progress (worktree) | 2026-08-08 |
| Game Designer | Design specs (no code): **#10** clan overhaul, **#11** leaderboards, **#12** crafting/cooking taxonomy | `docs/design/*.md` only | — | none (docs only) | in progress | 2026-08-08 |
| Asset Director | idle (on deck for #2 wordmark, #5/#6 scene art) | — | Art briefs | — | idle | 2026-08-08 |
| QA Engineer | idle (verifies Wave 0 at integration) | — | Wave 0 output | — | idle | 2026-08-08 |

## Wave plan (see BACKLOG.md)
- **Wave 0 (now):** #3 (unblocker), #1 + #2 (foundational type/identity), design specs for later waves.
- **Wave 1:** #7+#8 (notifications/chat button), #4 (companion stats), #6 (home screen).
- **Wave 2:** #9 (avatar/unique names), #12 (crafting/cooking categories), #5 (bounty/shop scenes).
- **Wave 3:** #11 (leaderboards), #10 (clan overhaul).

## Rules
- Status: `idle` · `in progress` · `blocked` · `ready-for-integration`.
- Wave-0 writers are in **worktree isolation**; Coordinator integrates sequentially (Systems → Art) and resolves any `legacy.js` overlap at merge.
