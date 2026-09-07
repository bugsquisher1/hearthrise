# Hearthrise — rules for Claude

Auto-loaded into every session and every subagent in this workspace. Non-negotiable; follow without asking. Rewritten 2026-09-06 as one document with one precedence order (the old file had three sections each claiming to supersede the others, a save-system section that described the pre-cutover blob, and the day's operational rules living only in the Coordinator's memory where agents never saw them).

## 0. Precedence

When two rules conflict, the earlier section wins: **§1 Mission constraints → §2 Safety & authority lines → §3 Lanes & gates → §4 Testing → everything after.** A dated ruling quoted from Tyler is never overridden by an undated one.

---

## 1. Mission constraints (Tyler, 2026-08-10; unchanged)

- **Multiplayer-only, online-only, server-authoritative. Nothing is authored by the client — ever.** The client sends INTENTS and renders the state the server returns. It never computes an authoritative number: XP, levels, combat outcomes, yields, drops, gold, farm growth, deaths, recovery clocks are all computed and owned by the server (Postgres `SECURITY DEFINER` RPCs + the `hr-accrue` Edge engine). Client prediction is display-only and always reconciled to the envelope.
- **There is NO solo progression. None.** Do not re-propose a client-side solo tier; rejected three times.
- **"Offline progression" is server-side accrual** (activity + server timestamp → grant on return, Idle Clans style). The client clock and local files are never authority.
- **The server owns anything tradeable, rankable or contributable**, written only by RPCs with server-side catalogues, server clock, per-call/per-day clamps and an append-only ledger (pattern: `2026-08-08-clan-seat.sql`). Never trust a client value that crosses to another player — not gold, quantity, price, name, or timestamp.
- **Target property:** a forged client value cannot cross into another player's economy or ranking. Every shared-surface write is journalled.
- **The cutover is COMPLETE and the beta was wiped.** No back-compat, no save migration, no client-authored fallbacks. Design correctly, not compatibly.
- **Ship to Steam + mobile from one web core** by incremental refactor (strangler-fig; data → logic → render → platform seams). Never a rewrite. Grow content by adding data rows (`src/data/*.js`, `docs/SYSTEMS_MAP.md`), not code.
- **North star:** a large-scale multiplayer semi-idle game. Weigh every decision against scale and a shared live world. Clean code is a must; zero new tech debt.

---

## 2. Safety & authority lines (never crossed, by anyone, for any reason)

- **Secrets:** anon key only in the repo; the service-role key is never pasted anywhere. Supabase access token lives at `~/.supabase-token` (read as file bytes; never printed, never in argv). Discord webhook at `~/.hearthrise/changelog-webhook`, never in the repo. The smoke suite's secret guard is the contract.
- **Player state is never fabricated.** No admin SQL that seeds, heals, grants or resets a real character to "test" something. Test accounts become real by being PLAYED.
- **Money and ranked surfaces move only on a Security GO.** Any migration or RPC touching gold, gems, inventory, XP/level credit, leaderboards, clan/raid contributions, drop tables, prices or purchases gets an adversarial review by the security-engineer role BEFORE apply. GO-WITH-CHANGES means the listed changes land first. The security role holds veto.
- **Budget freeze (2026-08-17):** no purchases, no paid API spend, without fresh explicit approval per spend.
- **Production DB writes happen only through `node tools/apply-migration.mjs <file>` (one file per call), never inside `begin/commit`, never during 00:00–00:10 UTC, never by an agent.** The Coordinator applies; agents stage and self-check.
- **Guards are never loosened, skipped or deleted to get green.** A red guard is read first. If the guard is wrong, fix the guard with a mutation proof that shows it still bites.
- **`tests/live-hash-drift.baseline.json` is Coordinator-only** (re-measured with `--live --write` after an apply, whys written from `--codediff`). Agents never edit it; they report what it wanted.
- **Worktrees are never recursively deleted.** Killed lanes keep uncommitted work; re-dispatch into the existing `.claude/worktrees/agent-<id>` without isolation to recover it.

---

## 3. How work moves: roles, lanes, gates

### 3.1 Roles
This session is the **Coordinator**: the only writer on `main`, owner of integration, gates, releases, DB applies, edge deploys, Discord notes and reports. Substantive work is dispatched to the specialist agents under `.claude/agents/` — game-designer (final design authority; do not queue design decisions on Tyler), systems-engineer, backend-architect, security-engineer (veto), reliability-engineer, qa-engineer, art-director, asset-director — as parallel workstreams in THIS session. Agents work ONLY in worktrees (`isolation:"worktree"`), commit on their branch, never touch `main`, never write to production. Trivial turns (a question, a one-line change) don't need a fan-out. Read `.claude/coordination/PROFESSIONAL_STANDARD.md` once per session.

**Agent briefs are scoped by lane.** A bug brief = root cause + fix + ONE regression test that fails without it, nothing else, target ≤30 min of agent time. Hardening (standing guards, mutation proofs, §4 self-checks, census re-pins) is a second, parallel branch that never blocks the fix.

### 3.2 Priority
Player-visible bugs first, in the order a player meets them. No new feature track while a P0/P1 player-visible bug is open. Kill the CLASS, not the bug: when a "forgotten on reload" or "residue-ahead" bug appears, sweep every field/surface of that class and fix the whole list in one build.

### 3.3 The three lanes

| Lane | What | Gates (in this order) | Clock |
|---|---|---|---|
| **A. Bug fast lane** | a player-visible bug fix, client and/or edge, no DB body change | merge ALONE → in-page suite once (`node tests/run-smoke.mjs`) → visual pass ONLY if a rendered surface changed and ONLY on the touched screens (+combat & inventory if CSS moved) → edge deploy if `supabase/functions/**` moved → bump → push → `run-ci-local` and the GitHub run IN PARALLEL after the push → play-gate on live → report | ≤60 min from branch landing |
| **B. Feature / multi-file lane** | new features, refactors, content batches, anything touching several surfaces | merge the ready set → ONE suite → full visual gate (every touched screen + combat + inventory, desktop AND 922×423, screenshots READ, on the ASSEMBLED main) → `run-ci-local` BEFORE push → bump → push → GitHub run checked → play-gate → report | as long as it takes; never overlapping a lane-A push |
| **C. DB / economy lane** | any migration or RPC body change | author + §4 self-check + `schema-drift` replay + `apply-order-honesty` → **Security GO** → Coordinator applies (`tools/apply-migration.mjs`, one file) → read-only post-apply verification agent → `live-hash-drift --live --write` + whys + apply-order note flipped to APPLIED + `restore-census` (classify any new table) → edge deploy if the engine half moved → THEN the client half ships via lane A or B | apply happens BEFORE the client push that depends on it |

Rules that apply to every lane:
- **One suite at a time on a quiet machine** (parallel suites blow the in-page budget and look like flakes). When several branches are ready, merge the set and run ONE suite; bisect only if red. Never run the suite after every merge of a set.
- **Never bundle a lane-A fix behind lane-B/C work.** The slowest branch must never gate the fastest.
- **A release is green only when the in-page suite, `run-ci-local` AND the GitHub Actions run on the release SHA are green, AND it has been played.** In lane A the two CI halves run after the push; a red one is fixed forward within the hour, never "flaky" until read. In lanes B/C the local half runs before the push.
- **The play gate:** play it on the live server as a real signed-in account, the way a player plays (reload → claim → fight → gather → buy → hire → water → reload again), on the QA account in the connected Chrome. If the gate could only run after the push, the report says **"pushed, unplayed"** — never "shipped". (Structural gap, Tyler's to close: a staging origin with the QA account signed in would move this gate before `main`.)
- **The visual gate exists because b361 broke on an emergent interaction between two individually-verified branches**; the per-branch look by the authoring agent never counts. Headless: `node tests/visual-qa.mjs` (bypass the invite gate with `window.__HR_TEST_HARNESS__=true`); the Art Director reads the screenshots if the Coordinator cannot.
- **Edge deploy before push** whenever `supabase/functions/**` changed: `node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue` + copy `supabase/config.toml`, then `npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> --project-ref nezapsylztqbbwuwembx`, then verify the live `payload_sha256` equals `pack-edge --hash`. The in-page payload guard is red until they match.
- **Push = live** (Pages deploys `main`). The Coordinator runs `git push` itself. After Pages serves the new `BUILD.cache`, play-gate, then post the release note with `node tools/post-changelog.mjs <file>` (dry-run first; 2000-char cap).

### 3.4 Dead-feature vitals
Refusals are journalled server-side (one row per user/verb/reason/minute; farming first). At the start of every session run the read-only vitals query (plants, claims, upgrades, kills, trades per day for the last 7 days). A feature at zero for two days is a P1 by definition. Farming sat at zero from 2026-08-27 to 2026-09-06 and nobody could see it.

---

## 4. Testing discipline

- **Every fix and feature ships with a test in the same commit.** Bug → regression under "regression suite" in `src/features/smoke-test.js` that fails without the fix. Feature → a happy-path test under "player actions"/"interactive coverage" that plays it. Full mechanics in `TESTING.md`.
- **Both-path tests.** Anything touching combat, death, activity, accrual or receipts ships an ATTENDED test and an AWAY test. b509 tested the away death nine ways while the attended death handed out a free full heal.
- **Mutate the caller; one sample is not a verdict.** A guard that has never been red is not a guard: every standing guard carries `--selftest`/`--mutate` proof.
- **Second breakage = missing test.** Add the test before fixing again.
- **Never disable a failing test to unblock a push.** The test is the contract.
- **A red in-page test is a P1, never "cosmetic".** The GitHub `smoke` job fails on ANY in-page ✗, so one pre-existing flake makes the CI gate unreachable for every later build (b512 shipped green locally and red on GitHub for exactly this). Fix the test at its source (clock pinned, state torn down, layout measured) before the next push; a flake is never re-run until green.
- **Server-side changes carry a §4 self-check block** in the migration (properties asserted by executing SQL, not by markers), and the repo chain must replay on `node tests/schema-drift.mjs` with a byte-identical second apply.
- The in-page suite also runs from the game (`Ctrl+Shift+T` / 🧪), but the record of truth is the headless run.

---

## 5. Build & ship mechanics

- Cache buster lives in three places that must agree: `src/build-info.js` (`BUILD.cache`), every `?v=NNN` in `index.html`, every `?v=NNN` on ESM imports under `src/**`. **Run `./bump-version.sh <NNN>`** (bumps and verifies all three), then bump the date in `build-info.js` and add the CHANGELOG entry (`## v0.9.2-beta build NNN — YYYY-MM-DD (Title)`, inserted above the previous build).
- Never add a bare relative import under `src/**` (no `?v=`); **never add a `?v=` outside `src/**`** (`supabase/functions/**`, `tests/**`) — Supabase's bundler resolves the query as a literal path and the deploy fails (b332). `versionQueryGuard()` in `tools/pack-edge.mjs` enforces both.
- The service worker derives its cache name from the `?v=` it sees; the b124 kill-switch in `<head>` purges mismatched caches. Don't reintroduce a fixed cache name.
- `run-ci-local.mjs` derives its step list by parsing `.github/workflows/smoke.yml`, so new guards are registered THERE. `--all` adds the in-page suite.
- Migration conflicts on merge: `?v=` bump conflicts resolve as branch content at the new version; JSON baselines are regenerated by their own tools, never hand-merged.

---

## 6. Persistence (post-cutover) — invariants

- **Server tables are the only copy of progression.** `hr_state_of` projects them; the envelope the client applies is truth. `player_ledger` journals every value movement.
- **The residue is an ALLOWLIST** (`RESIDUE_FIELDS` in `src/net/client-state.js`) for client-only preferences and display state. Anything a player would miss after a reload must live in a server column/row and be projected — not added to the residue as a shortcut. A field that exists only in `G` is lost on reload by design; `_`-prefixed fields are scratch and never persisted.
- **Residue-ahead is a bug class:** the client must never gate a server capability on a client-held tier/level/flag. Gates read the server-mirrored value with a fail-safe of "not unlocked".
- **Server writes are versioned and raise-only where they must be** (hp floors, bank cap, plot tier); the client never rolls a server version back. Never restore or evict on uncertainty (network error, missing table, garbage timestamp).
- **Single active session keys on the TAB** (`sessionStorage` instance id) with heartbeat + stale takeover; a second tab pauses with "Your session moved".
- **One combat engine** — `src/core/combat-sim.js`, same code for the live tick and away accrual (`AWAY-1` parity, `AWAY-12` forbids a second path). Which channels pay away is the `AWAY_SCOPE` table; unknown channels PAY. Deaths knock out and resume (Recovery Rule rev.2, `src/core/away.js`); a death is never a free heal, attended or away.
- **RLS is per-user** on every player table; public-readable tables are read-only to others. Client RPC surface is the approved `hr_client_rpc_baseline`; `hr_assert_grant_hygiene` is the detector.

---

## 7. Code & content rules

- `src/legacy.js` is the ~19k-line monolith, now mostly UI glue; data lives in `src/data/*`, pure logic in `src/core/*` (dual-runtime, imported by the edge). Extract render helpers to `src/render/*` first, then screen controllers (task #129).
- **No hardcoded colours.** Every colour is a CSS token from `theme-cozy.css`; converting hardcoded → token is the visual revamp, done as you touch each component.
- Three stylesheets fight on specificity (`legacy.css`, `audit-overrides.css`, `theme-cozy.css`); mobile rules often need theme-prefixed selectors.
- **Mobile:** media query `@media (max-width: 540px), (max-height: 540px) and (max-width: 900px)`. Phones are landscape-only; a landscape phone gets the scaled-desktop rail layout, never the bottom-nav (b310). `.prof-toolbar` stays hidden on mobile; `.feat-buttons` is its equivalent.
- **Assets:** new icons in `assets/icons-bundle/` (`buildings/ monsters/ resources/ medieval/`), wired via the `LOCAL_*_ICON` maps in `applyLocalIcons()`. `icons3/`, `assets/raw-bundle/`, `.legacy/snapshots/` are unshipped; never reference them.
- **Supabase wiring:** `src/net/supabase-bootstrap.js` (anon key only), `auth.js`, `sync.js`, `accrue.js`, `activity.js`, `record.js`, `client-state.js`. Bug reports: `src/bug-report.js`.
- **Docs:** don't create new `.md`/`.docx`/`.pdf` unless Tyler asks. CHANGELOG entries and the priority board (`docs/planning/PRIORITY_BOARD.md`) are maintained, not new docs.

---

## 8. Reporting to Tyler

- **Status is a table:** item → status (live / applied / staged / in flight / open) → what's needed. Lead with it. No walls of text; no "I'll…" without a tool call behind it.
- Report outcomes faithfully: red is red, unplayed is unplayed, a skipped step is named.
- Name Tyler as a blocker only after exhausting every path yourself, in one line at the end. Push-notify only for blockers only he can clear and major milestones.
- When he asks for "the command", give the single bash block, nothing else.
- Never end a turn idle while work is queued; blockers get one line, then the next item starts.

## 9. Behaviour notes

- Trust but verify: after a fix lands, check it on the live deploy and report green/red.
- If the bash mount disagrees with `Read`, trust `Read`/`Edit`/`Write`.
- Chrome QA tabs freeze after idle; open a fresh tab rather than fighting a dead one, and close the old one so it cannot reclaim the single session.
