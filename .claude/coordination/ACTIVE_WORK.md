# ACTIVE_WORK

_What each agent is doing right now. Update when you start, change scope, or finish. Check this before touching a shared surface._

| Agent | Task | Files being modified | Depends on | Possible conflicts | Status | Updated |
|---|---|---|---|---|---|---|
| Coordinator | Castle+Hunt merged (270/270); awaiting Designer/Asset/QA for b223 ship | `.claude/**` | — | none | in progress | 2026-08-08 |
| Systems Engineer | **#7** toasts + **#8** chat pill + beta-card emoji | `src/features/toasts.js` (new), `src/legacy.js`, `src/chat.js`, `src/beta-banner.js`, `src/features/daily-reward.js`, CSS | — | — | **done** — merged `8ae0680`, 185/185 (+8 tests) | 2026-08-08 |
| Art Director | **#6** home hearth band | `home-dashboard.js`, `backdrop.js`, `theme-cozy.css` | — | — | **done** — merged, shipped b219 | 2026-08-08 |
| Game Designer | Design specs (no code): **#13** watering/auto-replant, **#15** world-event cadence, **#16** clan boss events | `docs/design/*.md` only | — | none (docs only) | **done** — `8b764a1`; found 3 LIVE raid exploits (P1/P2/P3) + 7 cross-spec deps | 2026-08-08 |
| Asset Director | idle (on deck for #2 wordmark, #5/#6 scene art) | — | Art briefs | — | idle | 2026-08-08 |
| Systems Engineer (1b) | Raid exploit hardening (P1-P4) | `supabase/migrations/*`, `schema.sql`, `raids.js` | — | — | **done** — merged, shipped b219; ⚠️ migration pending in Supabase | 2026-08-08 |
| Art Director (typescale) | **b227** type floor 13.5→14.5 + the UI-scale dial (audit #2) | `styles/{legacy,art-direction,audit-overrides,theme-cozy,board-and-shop}.css`, `settings-page.js`, `smoke-test.js`, 25 JS style-string modules, 2 lines of `legacy.js` (dead `settings.scale` key) | — | `legacy.css` also touched by quest-nav; `legacy.js`/`smoke-test.js` also touched by presence — all type-only, mechanical merges | **ready-for-integration** — 333/333 | 2026-08-08 |
| QA Engineer | idle (verifies at integration) | — | Wave 1 output | — | idle | 2026-08-08 |
| Systems Engineer (b227) | **Presence rework** — blessings presence-gated, flat ×1.12 removed, pool families widened | `src/legacy.js`, `src/features/world-events.js`, `src/features/home-dashboard.js`, `src/features/smoke-test.js`, `docs/design/pacing-overhaul.md`, `CHANGELOG.md` | DECISIONS 2026-08-09 | `legacy.js` (addXp / processOffline / startSkill / startArtisan) — serialize against any other legacy.js writer | **ready-for-integration** — worktree `manual-presence`, branch `agent-presence`, 337/337 | 2026-08-09 |
| Systems Engineer (b228) | **The Chronicle** — wire the dead bell (audit #3); two-tier event memory (session toast ring + permanent `G.chronicle` milestones), badge that earns its existence | `src/features/chronicle.js` (new), `src/features/toasts.js` (1 hook), `src/save-migrations.js` (v8→v9), `src/net/events.js` (cloud allowlist), `src/features/smoke-test.js`, `index.html` | — | `smoke-test.js` + `index.html` script list (append-only, trivial merge). Milestone sources reached by WRAPPERS from chronicle.js — no edits inside renown/homestead/clan-seat/raids/identity/legacy regions held by other agents | **ready-for-integration** — worktree `manual-chronicle`, branch `agent-chronicle`, 363/363 (+17) | 2026-08-08 |

## ⚠️ LIVE COORDINATION — b269 shared dirty tree (2026-08-09)
Two sessions have uncommitted work interleaved in ONE working tree on `main` (base `f69dbbe` b268). `bump-version.sh 269` already ran (all `?v=269`, build-info 269, CHANGELOG b269 header). **This is ONE combined b269 commit — the two features CANNOT be split** because both touch `src/legacy.js` and `src/features/smoke-test.js`.

| Session | Feature | Exclusive files | Shared files | Status |
|---|---|---|---|---|
| A | progress-bar fix + Stable→Homestead | `combat-render.js`, `activities-grid.js`, `character-page.js`, `companions.js`, `item-index.js`, `recipe-book.js`, **new** `pet-session.js` | `legacy.js`, `smoke-test.js`, `index.html`, CHANGELOG | ? (owner to confirm done) |
| B | **purchasable bank space** | `save-migrations.js` (v10→v11), `styles/art-direction.css` | `legacy.js`, `smoke-test.js`, CHANGELOG (bank bullet added) | **ready** — my 3 tests green |

**Smoke: 479/480.** The one red is **NOT bank space** — it's `.hr-pet-chip @ 12.5px` (inline style in Session A's `pet-session.js`) tripping the 14.5px type-floor guard. **Session A must bump that font to ≥14.5px before we commit** (I did not touch their file to avoid a write-collision).

**Push plan:** whichever session commits does it ONCE, covering both features, as b269 → `git add -A && git commit` → push `main` (auto-deploys). Do NOT have both sessions commit. Do NOT bump to 270 (269 not shipped yet).

## Wave plan (see BACKLOG.md)
- **Wave 0 — SHIPPED b218:** #1, #2, #3, #4 + specs #10/#11/#12.
- **Wave 1 (now):** #7+#8 (notifications/chat button) + emoji-modal fix, #6 (home screen), specs #13/#15/#16.
- **Wave 2:** #9 (avatar/unique names), #12 (crafting/cooking categories), #5 (bounty/shop scenes), #13 (watering), #14+#15 (event discoverability + topbar timer).
- **Wave 3:** #10 (clan castle), #11 (leaderboards), #16 (clan boss events).

## Rules
- Status: `idle` · `in progress` · `blocked` · `ready-for-integration`.
- Wave-0 writers are in **worktree isolation**; Coordinator integrates sequentially (Systems → Art) and resolves any `legacy.js` overlap at merge.
