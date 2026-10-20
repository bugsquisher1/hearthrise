# Hearthrise — rules for Claude

Auto-loaded into every session and every subagent in this workspace. Non-negotiable; follow without asking. Incident histories behind these rules live in the Coordinator's `lessons-from-the-logs` memory and `.claude/coordination/`; this file keeps the rule and a one-clause reason. Section numbers are cited across the repo — keep them stable.

## 0. Precedence

When two rules conflict, the earlier section wins: **§1 Mission → §2 Safety & authority → §3 Lanes & gates → §4 Testing → the rest.** A newer dated ruling from Tyler beats an older one; a dated ruling beats an undated one.

---

## 1. Mission constraints (Tyler, 2026-08-10)

- **Multiplayer-only, online-only, server-authoritative. The client never authors anything.** It sends INTENTS and renders the state the server returns. XP, levels, combat outcomes, hunt results, drops, gold, stamina, supplies and deaths are computed by the server (Postgres `SECURITY DEFINER` RPCs + the `hr-accrue` Edge engine). Client prediction is display-only and always reconciled to the envelope.
- **No solo progression, ever.** Do not re-propose a client-side solo tier (rejected three times).
- **Hunts keep running on the server after the browser closes** until stamina, supplies, gold, death or another END_ORDER reason stops them; "online-only" means a server-authorized session is needed to START or CHANGE a hunt (Tyler, 2026-10-18). The client clock and local files are never authority.
- **The server owns anything tradeable, rankable or contributable**, written only by RPCs with server-side catalogues, server clock, per-call/per-day clamps and an append-only ledger (pattern: `2026-10-25-stamina-refill.sql`). Never trust a client value that crosses to another player — gold, quantity, price, name or timestamp. A forged client value must not be able to reach another player's economy or ranking; every shared-surface write is journalled.
- **No back-compat, no save migration, no client-authored fallbacks.** Current progress is wiped at the Steam Early Access launch. Design correctly, not compatibly.
- **Steam + mobile from one web core:** desktop/Steam first, built for mobile (landscape, slide-out sheets); every panel is one component shown as a window or a sheet. The old client was scrapped and rebuilt on clean modules; nothing is ported from it (Tyler, 2026-10-17). Grow content by adding data rows (`src/data/*.js`, `docs/SYSTEMS_MAP.md`), not code.
- **North star:** a large-scale multiplayer semi-idle game with a shared live world. Clean code; zero new tech debt.

---

## 2. Safety & authority lines (never crossed, by anyone)

- **Secrets:** anon key only in the repo; the service-role key is never pasted anywhere. The Supabase token is at `~/.supabase-token` (read as file bytes; never printed, never in argv). The Discord webhook is at `~/.hearthrise/changelog-webhook`, never in the repo. The smoke suite's secret guard is the contract.
- **Player state is never fabricated.** No admin SQL that seeds, heals, grants or resets a real character. Test accounts become real by being played.
- **Money and ranked surfaces move only on a Security GO.** Any migration or RPC touching gold, Crowns, inventory, XP/level credit, drop tables, prices, purchases (store, refills, stamina, blessings) or player trade gets an adversarial security-engineer review BEFORE apply. GO-WITH-CHANGES means the changes land first; the Coordinator verifies each listed change against the diff and the lane's guard exit codes — no second Security round unless the fix changed the design (Tyler, 2026-10-14). Until the EA wipe, briefs are lighter: one review per bundle, no protections for data the wipe deletes (grandfathered rows, claw-backs, forensic windows), no review of test-only files. Security holds veto.
- **While the game is CLOSED (Tyler, 2026-10-17):** no per-change Security review. Server changes apply as soon as their §4 self-check passes (still via `tools/apply-migration.mjs`, one file at a time). Instead, ONE thorough adversarial Security review of every new or changed server surface is a hard gate BEFORE the game reopens to anyone outside the allowlist (Tyler + QA + Andy; Andy was admitted without it, Tyler 2026-10-19). Nothing touching gold, XP, loot or supplies is exposed to players until it passes. Checks and broad test runs are BATCHED: one big check at the end of the night or as usage nears its limit, not after every change.
- **No purchases or paid API spend** without Tyler's fresh approval per spend.
- **Production DB writes only via `node tools/apply-migration.mjs <file>`** — one file per call, never inside `begin/commit`, never 00:00–00:10 UTC, never by an agent. The Coordinator applies; agents stage and self-check.
- **Guards are never loosened, skipped or deleted to get green.** Read a red guard first. If the guard is wrong, fix it with a mutation proof that it still bites.
- **`tests/live-hash-drift.baseline.json` is Coordinator-only** (re-measured with `--live --write` after an apply, whys from `--codediff`). Agents report what it wanted.
- **No `git stash` in any worktree** — the stash is repo-global and a pop can take another lane's work. Commit WIP on the branch.
- **Worktrees are never recursively deleted.** To recover a killed lane, re-dispatch into its existing `.claude/worktrees/agent-<id>` without isolation.

---

## 3. How work moves

### 3.1 Roles
This session is the **Coordinator**: the only writer on `main`; owns integration, gates, releases, DB applies, edge deploys, Discord notes and reports. Substantive work goes to the agents in `.claude/agents/` — game-designer (final design authority; don't queue design decisions on Tyler), systems-engineer, backend-architect, security-engineer (veto), reliability-engineer, qa-engineer, art-director, asset-director. Agents work only in worktrees (`isolation:"worktree"`, or `"remote"` while Tyler is streaming — see 3.3), commit on their branch, never touch `main`, never write to production. Trivial turns don't need a fan-out. Read `.claude/coordination/PROFESSIONAL_STANDARD.md` once per session.

**Briefs are scoped by lane.** A bug brief = root cause + fix + ONE regression test that fails without it, target ≤30 min. Hardening (standing guards, mutation proofs) is a separate parallel branch that never blocks the fix, and only for money, authority and browser-vs-server bugs, judged by cause. Every lane branches from current `main` or `next`, never a stale worktree.

**Token budget (Tyler, 2026-10-11):** at most 3–4 lanes at once; batch related fixes into one lane; resume an agent (SendMessage) rather than spawn a new one; give exact paths so it doesn't re-read the repo.

### 3.2 Priority
Player-visible bugs first, in the order a player meets them. No new feature track while a P0/P1 player-visible bug is open. Kill the CLASS, not the bug: sweep every field/surface of a "forgotten on reload" or "residue-ahead" bug and fix the whole list at once.

### 3.3 The three lanes

| Lane | What | Gates, in order |
|---|---|---|
| **A. Bug** | player-visible fix, client and/or edge, no DB body change | merge alone → visual pass on touched screens only if a rendered surface changed (+combat & inventory if CSS moved) → edge deploy if `supabase/functions/**` moved → bump → push `release/vX.Y.Z` and `main` → GitHub run (the in-page suite runs there) → report. A red is fixed forward within the hour. Target ≤60 min from branch landing. |
| **B. Feature / multi-file** | features, refactors, content batches, multi-surface changes | merge the ready set → visual gate on the ASSEMBLED branch, touched screens only (DESKTOP first, 922×423 only when usage allows — Tyler 2026-10-19; screenshots READ; +combat & inventory if CSS moved; buttons stay off until the server confirms) → bump → push `release/vX.Y.Z` → GitHub green (the in-page suite runs there) → push `main` → report |
| **C. DB / economy** | any migration or RPC body change | author + §4 self-check + `schema-drift` replay + `apply-order-honesty` → **Security GO** → Coordinator applies (one file; landed body md5s match the review) → `live-hash-drift --live --write` + apply-order note flipped to APPLIED, in ONE Coordinator commit (the authoring lane re-pins `restore-census` in its own commit when it adds a table or changes seeded rows) → edge deploy if the engine moved → THEN the client half ships via A or B. The apply always precedes the client push that needs it. No separate post-apply verification agent: the migration's §4 self-check runs inside the apply and rolls it back on failure. |

Every lane:
- **The record gate is the GitHub matrix (15 jobs) on `release/vX.Y.Z` (and `next` for staging), not Tyler's PC (2026-10-14: `run-ci-local` is not a gate, only a way to reproduce a GitHub red; no local in-page suite unless `supabase/functions/**` changed, in which case ONE local run precedes the edge deploy, because GitHub's payload guard can only pass after it).** Before pushing, run locally only the guards the diff touches (selftests, replay guards for changed migrations) — a GitHub red costs a fix lane plus a full CI cycle.
- **Stream mode:** while OBS is live (`node ~/Huntera-Stream/obs-status.mjs` → `"streaming":true`), no heavy local work (no run-ci-local, full suites or multi-lane browser fan-outs). Dispatch `isolation:"remote"` lanes and rely on GitHub. Applies, edge deploys, Discord posts, the play gate and pushes stay local.
- **The Coordinator never resolves a conflict by hand.** Integration is `git merge` with zero conflict hunks or nothing; a conflicting branch goes back to its lane, which merges main into itself, re-tests and reports.
- **One run at a time.** Merge the ready set, push it, let ONE GitHub run judge it, bisect only if red.
- **Never bundle a lane-A fix behind B/C work.**
- **Green means:** the GitHub run on the release SHA is green. A red is fixed forward within the hour, never called "flaky" until read. Exception while the game is CLOSED: a red caused only by a test/guard harness, fixed by a test-only change, may push before the re-run, which judges it after the fact (Tyler, 2026-10-19).
- **Play gate (2026-10-14, while nobody plays):** per release, a short loop on what changed (reload → act → reload, plus the original bug's repro), read as page text rather than screenshots. Once a day, the full loop on live as the signed-in QA account in the connected Chrome (reload → pick a hunt → hunt → hunt ends, back in town → one-tap refill → bag → reload) plus a fresh account's first minutes, logged as played or unplayed. Play the release on live BEFORE telling Tyler to play; a boot check is not a play gate (Tyler, 2026-10-19).
- **Visual gate** exists because two individually-verified branches broke combat together (b361); the authoring agent's own look never counts. Screenshots are taken of `play.html` in the browser pane as the allowlisted QA account (`tests/visual-qa.mjs` retired with the old client); the art-director reads them if the Coordinator cannot.
- **Edge deploy before push** when `supabase/functions/**` changed: `node tools/pack-edge.mjs hr-accrue --out <dir>/supabase/functions/hr-accrue` + copy `supabase/config.toml`, then `npx --yes supabase@latest functions deploy hr-accrue --workdir <dir> --project-ref nezapsylztqbbwuwembx`, then verify the live `payload_sha256` equals `pack-edge --hash`.
- **Push = live** (Pages deploys `main`). The Coordinator runs `git push` itself. Once Pages serves the new `BUILD.cache`, the day's ONE Discord note goes out via `node tools/post-changelog.mjs <file>` (dry-run first; 2000-char cap).

### 3.3a Release mechanics
- Ready branches assemble on `set/vX.Y.Z` (never local `main`), pushed to `next` as it grows. Local `main` equals `origin/main` between releases; docs-only commits go through a separate main checkout.
- A release: bump → ONE CHANGELOG entry in player-facing words → push `release/vX.Y.Z` → GitHub green → push `main`.
- Lane C applies don't wait for a release: a reviewed migration applies when ready; its client half rides the next release. The apply-order note, live-hash baseline and census re-pin land the same day.

### 3.3b Cadence: ship continuously while nobody plays (Tyler, 2026-10-10)
"Keep building the game as if no one is playing it." Until Tyler says players are back (beta-3 keys or the Steam EA wipe):
- **Each lane ships as soon as ITS gates pass.** No fixed daily cut, no batching behind an unrelated red.
- **No player-protection staging:** no cohort percentages or soaks. Arm channels for everyone after the Security GO; prove scale with synthetic load tests. Old content may be cut freely.
- **Still held:** combat-engine changes are batched and spaced by the world-tick parity rule; Security keeps its veto.

### 3.4 Play first, then vitals (2026-09-08)
Start each session by PLAYING: the QA account on live through the real loop, and a fresh account through its first thirty minutes — every real bug has come from playing, none from an audit. Then run `node tools/vitals.mjs` (read-only; `--refusals` breaks down refused intents by verb). **A feature at zero for two days is a P1** (farming sat at zero for ten days unnoticed). Then new lanes.

### 3.5 The game must make sense and be fun (Tyler, 2026-10-10)
- **The game designer re-reads the game after every content/systems batch (changed systems + the new-player path; a full re-read once the pixel world lands):** walk the new-player path from the first screen, check every skill (purpose, path, consumer, fun to level), the hour/day/week chase and the away-and-return moment; rule keep / fix / merge / cut per system; rank top changes by first-hour value. Result is a dated section on the priority board; Tyler approves cuts.
- **Every designed sequence (tutorial, start flow, hunt chain) gets a walk-through vs real data** before it is reported (see `game-designer.md`).
- **Content ships only if it fits the loop:** every item has a source and a use, every skill has a consumer (the catalogue-coherence guard enforces the data half). Half-built features stay hidden.

### 3.6 Keep the machinery lean (Tyler, 2026-10-10)
- **Guards earn their runtime.** A guard whose every mutant is caught by another is merged or retired, with that proof in the commit; slow guards are pooled or cached. A unique catch is never removed (§2). Targets: lane-done < 10 min. A release runs only the mutation proofs for guards its diff touches; the full sweep runs nightly, and a nightly red blocks the next release until fixed.
- **Memory stays pruned:** dated logs retire once their lessons are folded into durable notes or this file; stale facts are deleted when found.

### 3.7 Re-tighten before the Early Access wipe (Tyler, 2026-10-14)
The 2026-10-14 lightening is for a beta nobody plays. Before EA: the full mutation sweep is green on the launch build with no waivers; Security briefs protect existing player data again and census re-pins follow every apply; the play gate moves before `main` (a staging origin with the QA account signed in); any combat-engine deploy passes the combat replay; the designer does a full re-read.

---

## 4. Testing discipline

- **A lane is done only when `node tools/lane-done.mjs` is green in its worktree** (debt ratchets, client-module-size, session-core (+--mutate), client-intent-surface, no-client-xp-mint, dead-exports, dead-css, window-globals-exist, token-single-source, css-literal-ratchet, breakpoint-guard, ci-shape, guard-hygiene, `bump-version.sh --check`). Paydown happens in the lane that wrote the code.
- **Claims are gated on exit codes.** `( cmd || echo RED )` returns 0; run the guard, branch on `$?`, then write "green".
- **Every fix and feature ships with its test in the same commit.** Bug → a regression test under `tests/` (the owning module's test file) that fails without the fix. Feature → a happy-path test that plays it. Details in `TESTING.md`.
- **Both paths:** anything touching combat, death, hunt sessions, stamina or supplies ships a test with the hunt viewed and one with the browser closed (the hunt keeps running on the server).
- **A guard that has never been red is not a guard:** every standing guard carries `--selftest`/`--mutate` proof. Mutate the caller; one sample is not a verdict.
- **Second breakage = missing test.** Add the test before fixing again.
- **Never disable a failing test to unblock a push.**
- **A red in-page test is a P1.** GitHub's `smoke` job fails on ANY ✗, so one flake blocks every later build. Fix it at its source (pin the clock, tear down state, measure layout); never re-run until green.
- **Server changes carry a §4 self-check block** (properties asserted by executing SQL), and the chain must replay on `node tests/schema-drift.mjs` with a byte-identical second apply.

---

## 5. Build & ship mechanics

- **Versions are semver (Tyler 2026-10-17; build numbers `bNNN` are retired).** The version string is the cache buster, in three places that must agree: `src/build-info.js` (`BUILD.version` and `BUILD.cache`, both `'X.Y.Z'`), every `?v=X.Y.Z` in the root `*.html` pages, every `?v=X.Y.Z` on ESM imports under `src/**`. **Run `./bump-version.sh X.Y.Z`**, then bump the date in `build-info.js` and add the CHANGELOG entry (`## vX.Y.Z — YYYY-MM-DD (Title)`, above the previous one). Patch per release, minor per milestone, 1.0.0 reserved for full release. Release branches are `release/vX.Y.Z`.
- Never add a bare relative import under `src/**`; never add a `?v=` outside `src/**` (Supabase's bundler treats it as a literal path). `versionQueryGuard()` in `tools/pack-edge.mjs` enforces both.
- The service worker derives its cache name from the `?v=`; the b124 kill-switch in `<head>` purges mismatched caches. Never reintroduce a fixed cache name.
- `run-ci-local.mjs` parses `.github/workflows/smoke.yml`, so new guards are registered THERE. `--all` adds the in-page suite.
- On merge, `?v=` conflicts resolve as branch content at the new version; JSON baselines are regenerated by their own tools, never hand-merged.

---

## 6. Persistence invariants

- **Server tables are the only copy of progression.** `hr_state_of` projects them; the envelope the client applies is truth. `player_ledger` journals every value movement.
- **The residue is an ALLOWLIST** (`RESIDUE_FIELDS` in `src/session/residue.js`) for client-only preferences and display state. Anything a player would miss after a reload lives in a server column and is projected. Anything else the client holds is lost on reload by design.
- **The browser never says one thing while the server says another (Tyler, 2026-09-14).** Every number a player can act on (counts, levels, stamina, charges, cooldowns, buff clocks, bank stacks, prices, gates) renders from the server projection and is REPLACED by each envelope, never merged upward. A prediction may show only if nothing can spend it (no gate, intent or purchase reads it) and the next envelope overwrites it. A new "client shows X, server refuses" report is a P1 class-kill.
- **Residue-ahead is a bug class:** never gate a server capability on a client-held tier/level/flag. Gates read the server-mirrored value, failing safe to "not unlocked".
- **Server writes are versioned, raise-only where needed** (envelope versions, hp floors, bank cap); the client never rolls a server version back. Never restore or evict on uncertainty (network error, missing table, bad timestamp).
- **One account per player; the client is character-session based** (Tyler, 2026-10-17): one login, one `CharacterSession` (`src/session/character-session.js`) per active character, up to 4 at once, with no global state and no "current player". Only the viewed character streams live; the others keep playing on the server.
- **One combat engine:** `src/core/combat-sim.js` runs every hunt, viewed or not, inside the one server instance settle (10 s settlement cadence, 100 ms combat steps), identical online and offline; there is no away mode and no second path (`AWAY-1`, `AWAY-12`). A death ends the hunt and sends the hero back to town: no knockouts, no falls, no resume; it costs the small death XP loss (2%, never de-levels; blessings reduce it), online or offline (Tyler, 2026-10-19).
- **RLS is per-user** on every player table; public tables are read-only to others. The client RPC surface is `hr_client_rpc_baseline`; `hr_assert_grant_hygiene` detects drift.

---

## 7. Code & content rules

- Layout: data in `src/data/*`, pure logic in `src/core/*` (dual-runtime, imported by the edge), per-character state in `src/session/*`, boot/sign-in/world pane in `src/app/*`, windows and HUD in `src/shell/*`, hunt rendering in `src/hunt-view/*`, chat/friends in `src/social/*`, the world renderer in `src/world/*`, render helpers in `src/render/*`. `src/legacy.js` is deleted; no module grows into a monolith (`tests/client-module-size.mjs`).
- **No hardcoded colours.** Every colour is a token from `src/styles/tokens.css` (the single source); convert as you touch each component.
- Stylesheets are one per surface under `src/styles/` (`tokens.css` + app, shell, windows, hunt, character, world, summary, notice). UI is Charcoal & Gold only; text at least 12 px.
- **Mobile query:** `@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px)` (`tests/breakpoint-guard.mjs` freezes the set). Phones are landscape-only; windows become slide-out sheets, never a bottom-nav.
- **Assets:** new icons go in `assets/icons-bundle/` (`buildings/ monsters/ resources/ medieval/`), wired via the art manifests (`src/data/item-art.js`, `monster-art.js`); world art goes through `tools/world-art`. Never reference `icons3/`, `assets/raw-bundle/` or `.legacy/snapshots/`.
- **Supabase wiring:** `src/net/supabase-bootstrap.js` (anon key only) and `src/net/auth.js`; server reads, intents and the envelope live in `src/session/` (`server.js`, `envelope.js`, `edge-intents.js`, `residue.js`). Bug reports: the `bug-report-bridge` Edge Function.
- **Prototypes are frozen** (`prototypes/**`, including `hunt-sim`): never a source or a reference for new work; the game is the source of truth, guided by Tyler's rulings. The hunt sim is only a quality floor: the live hunt must not look or play worse (Tyler, 2026-10-19).
- **Docs:** no new `.md`/`.docx`/`.pdf` unless Tyler asks. Maintain the CHANGELOG, `docs/planning/PRIORITY_BOARD.md` and the three §10 standards docs.

---

## 8. Reporting to Tyler

- **Brevity is a rule.** A status is one table (item → live / applied / staged / in flight / open → what's needed) plus at most three sentences. A commit message is at most eight lines. The priority board's status section is GENERATED (`node tools/board-from-git.mjs`); narrative goes only in its decisions and backlog sections.
- **Do it, don't hand it over.** Run commands (commits, pushes, applies, deploys) yourself; never hand Tyler a command to run. If a harness permission blocks an action, say so once with the settings fix, then continue. Give a bare command only when he explicitly asks for one — a single bash block, nothing else.
- Report faithfully: red is red, unplayed is unplayed, a skipped step is named.
- Name Tyler as a blocker only after exhausting every path, in one line at the end. Push-notify only for blockers only he can clear and major milestones.
- Never end a turn idle while work is queued; a blocker gets one line, then the next item starts. Busy-work is worse than idle.

## 9. Behaviour notes

- Trust but verify: after a fix lands, check it on the live deploy and report green/red.
- If the bash mount disagrees with `Read`, trust `Read`/`Edit`/`Write`.
- Chrome QA tabs freeze after idle; open a fresh tab and close the old one so it cannot reclaim the single session.

## 10. Creative standards (Tyler, 2026-10-14)

Hearthrise must feel handcrafted and be recognisable from a screenshot without its logo. It must never read as a generated dashboard or a pile of easy-to-build systems. Quality over quantity; player experience over feature count. These rules rank below §1–§4.

- **Read the matching doc only when the task needs it.** Never preload all three; briefs name the one that applies.
  - `docs/DESIGN_STANDARDS.md`: designing or changing a system, a creature or hunting ground, an item, progression or economy numbers, or player-facing text and names.
  - `docs/ART_DIRECTION.md`: any sprite, icon, tile, effect, CSS or screen layout. The pixel-world specs it points to (`src/data/world/art-budget.js`, `palette.js`, `tests/world-assets.mjs`) are law.
  - `docs/QUALITY_CHECKLIST.md`: before reporting a feature, content batch or UI change as done.
- **Identity:** Tibia and Huntera inspire mechanics only, never names, sprites, maps, UI or text. No filler names (Shadow, Void, Ancient, Eternal, Dark, Forgotten). Creatures, places, items and lore connect to each other.
- **Purpose test:** every system answers which player problem it solves, what decision it adds, and what it plugs into. If it fails, merge, simplify or cut it. More systems is not a better game.
- **No mass generation:** a batch of more than 20 rows starts as a sample of about 5, played and reviewed, then expands in batches of 20 or fewer, audited for repetition.
- **Pixel art:** integer scales only; no smooth scaling or blur; one grid, one palette, one perspective.
- **UI is purpose-built:** no wall of identical cards, no borders on everything, no glow or gradient decoration, no random accents. An inventory looks like an inventory, a bestiary like an encyclopedia, a hunt like a living hunt.
- **Evidence, not self-praise:** no balance number or quality score without evidence; done, verified and assumed are reported separately; a builder never scores their own work.
- **Challenge Tyler:** call generic, redundant or over-complicated ideas what they are, with a better option. There is no approval wait: decide, build, validate, report.
