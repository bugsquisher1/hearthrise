# ACTIVE_WORK

_What each agent is doing right now. Update when you start, change scope, or finish. Check this before touching a shared surface._

| Agent | Task | Files being modified | Depends on | Possible conflicts | Status | Updated |
|---|---|---|---|---|---|---|
| Coordinator | Wave 1 running (autonomous mode) | `.claude/**` | — | none | in progress | 2026-08-08 |
| Systems Engineer | **#7** toasts + **#8** chat pill + beta-card emoji | `src/features/toasts.js` (new), `src/legacy.js`, `src/chat.js`, `src/beta-banner.js`, `src/features/daily-reward.js`, CSS | — | — | **done** — merged `8ae0680`, 185/185 (+8 tests) | 2026-08-08 |
| Art Director | **#6** home screen — background, fill the empty space | `src/features/home-dashboard.js`, `src/features/backdrop.js`, CSS (worktree) | — | CSS overlap w/ Systems (different sections); NOT legacy.js | in progress (worktree) | 2026-08-08 |
| Game Designer | Design specs (no code): **#13** watering/auto-replant, **#15** world-event cadence, **#16** clan boss events | `docs/design/*.md` only | — | none (docs only) | **done** — `8b764a1`; found 3 LIVE raid exploits (P1/P2/P3) + 7 cross-spec deps | 2026-08-08 |
| Asset Director | idle (on deck for #2 wordmark, #5/#6 scene art) | — | Art briefs | — | idle | 2026-08-08 |
| Systems Engineer (1b) | **Raid exploit hardening** (P1 unlimited strikes, P2 chest-hop, P3 claim replay) | `supabase/schema.sql` (new migration file), `src/features/raids.js` (worktree) | — | none — raids.js untouched by others this wave | in progress (worktree) | 2026-08-08 |
| QA Engineer | idle (verifies at integration) | — | Wave 1 output | — | idle | 2026-08-08 |

## Wave plan (see BACKLOG.md)
- **Wave 0 — SHIPPED b218:** #1, #2, #3, #4 + specs #10/#11/#12.
- **Wave 1 (now):** #7+#8 (notifications/chat button) + emoji-modal fix, #6 (home screen), specs #13/#15/#16.
- **Wave 2:** #9 (avatar/unique names), #12 (crafting/cooking categories), #5 (bounty/shop scenes), #13 (watering), #14+#15 (event discoverability + topbar timer).
- **Wave 3:** #10 (clan castle), #11 (leaderboards), #16 (clan boss events).

## Rules
- Status: `idle` · `in progress` · `blocked` · `ready-for-integration`.
- Wave-0 writers are in **worktree isolation**; Coordinator integrates sequentially (Systems → Art) and resolves any `legacy.js` overlap at merge.
