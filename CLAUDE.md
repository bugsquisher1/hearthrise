# Hearthrise — rules for Claude

Auto-loaded into every session and every subagent in this workspace. Non-negotiable; follow without asking. Incident histories behind these rules live in the Coordinator's `lessons-from-the-logs` memory and `.claude/coordination/`; this file keeps the rule and a one-clause reason. Section numbers are cited across the repo — keep them stable. Every rule here is the CURRENT ruling; an overridden one is deleted, not annotated (last review 2026-11-22).

## 0. Precedence

When two rules conflict, the earlier section wins: **§1 Mission → §2 Safety & authority → §3 Lanes & gates → §4 Testing → the rest.** A newer dated ruling from Tyler beats an older one; a dated ruling beats an undated one. Tyler's game rulings live in memory `rulings-of-record.md` (newest wins).

---

## 1. Mission constraints (Tyler, 2026-08-10)

- **Multiplayer-only, online-only, server-authoritative. The client never authors anything.** It sends INTENTS and renders the state the server returns. XP, levels, combat outcomes, hunt results, drops, gold, stamina, supplies and deaths are computed by the server (Postgres `SECURITY DEFINER` RPCs + the `hr-accrue` Edge engine). Client prediction is display-only and always reconciled to the envelope.
- **No solo progression, ever.** Do not re-propose a client-side solo tier (rejected three times).
- **Hunts keep running on the server after the browser closes** until stamina, supplies, gold or another END_ORDER reason stops them; "online-only" means a server-authorized session is needed to START or CHANGE a hunt (Tyler, 2026-10-18). The client clock and local files are never authority.
- **The hunting day is 10 h, 12 h with Premium (Tyler, 2026-11-22).** Hunting and town work can be bought in 2 h blocks, pricey, each block dearer that day: hunting at most 2 blocks a day, town work at most 4. Server-priced, clamped and journalled; a money surface for the pre-EA Security review.
- **The server owns anything tradeable, rankable or contributable**, written only by RPCs with server-side catalogues, server clock, per-call/per-day clamps and an append-only ledger (pattern: `2026-10-25-stamina-refill.sql`). Never trust a client value that crosses to another player — gold, quantity, price, name or timestamp. A forged client value must not be able to reach another player's economy or ranking; every shared-surface write is journalled.
- **Business model (Tyler, 2026-11-22):** Steam Early Access is a one-time $15 with 30 days of Premium; Premium and Crowns on top (`docs/design/redesign/10-premium.md`). Crowns are bought with real money (Steam in-game purchase) or from players for gold, never earned in play; a server-owned, journalled currency (2026-11-10).
- **No back-compat, no save migration, no progress protection, no client-authored fallbacks (Tyler, 2026-11-07/09).** A change may break or reset a current hero; say so plainly in the release note. Tyler names any wipe date; never plan or propose one (2026-11-07). Design correctly, not compatibly.
- **Steam + mobile from one web core:** desktop/Steam first, built for mobile (landscape, slide-out sheets); every panel is one component shown as a window or a sheet. Grow content by adding data rows (`src/data/*.js`, `docs/SYSTEMS_MAP.md`), not code.
- **North star:** a large-scale multiplayer semi-idle game with a shared live world. Clean code; zero new tech debt.

---

## 2. Safety & authority lines (never crossed, by anyone)

- **Secrets:** anon key only in the repo; the service-role key is never pasted anywhere. The Supabase token is at `~/.supabase-token` (read as file bytes; never printed, never in argv). The Discord webhook is at `~/.hearthrise/changelog-webhook`, never in the repo. The smoke suite's secret guard is the contract.
- **Player state is never fabricated.** No admin SQL that seeds, heals, grants or resets a real character. Test accounts become real by being played.
- **Money and ranked surfaces move only on a Security GO, given in ONE full adversarial review before Steam Early Access (Tyler, 2026-10-17, widened 2026-10-25).** No per-change review before then; that review is a hard gate (§3.7). It covers every new or changed migration or RPC touching gold, Crowns, inventory, XP/level credit, drop tables, prices, purchases (store, refills, stamina, bought hours, blessings) or player trade. GO-WITH-CHANGES means the changes land first; the Coordinator verifies each against the diff and guard exit codes, with no second round unless a fix changed the design (2026-10-14). Briefs protect no current data (§1). Security holds veto.
- **No purchases or paid API spend** without Tyler's fresh approval per spend. Standing exception: PixelLab subscription generations (not bought credits) for art (2026-11-04).
- **Production DB writes only via `node tools/apply-migration.mjs <file>`** — one file per call, never inside `begin/commit`, never by an agent. The Coordinator applies; agents stage and self-check. Read-only production reads for analysis are allowed to any lane: SELECT in a READ ONLY transaction, token as file bytes, results local, anything committed anonymised (2026-11-19).
- **Guards are never loosened, skipped or deleted to get green.** Read a red guard first. If the guard is wrong, fix it with a mutation proof that it still bites.
- **`tests/live-hash-drift.baseline.json` is Coordinator-only** (re-measured with `--live --write` after an apply, whys from `--codediff`). Agents report what it wanted.
- **No `git stash` in any worktree** — the stash is repo-global and a pop can take another lane's work. Commit WIP on the branch.
- **Worktrees are never recursively deleted.** To recover a killed lane, re-dispatch into its existing `.claude/worktrees/agent-<id>` without isolation.

---

## 3. How work moves

### 3.1 Roles
This session is the **Coordinator**: the only writer on `main` and the integration set; owns integration, gates, releases, DB applies, edge deploys, Discord notes and reports. Substantive work goes to the agents in `.claude/agents/` — game-designer (final design authority; don't queue design decisions on Tyler), systems-engineer, backend-architect, security-engineer (veto), reliability-engineer, qa-engineer, art-director, asset-director. Agents work only in worktrees, commit on their branch, never touch `main`, never write to production. Trivial turns don't need a fan-out. Read `.claude/coordination/PROFESSIONAL_STANDARD.md` once per session.

**Briefs are scoped by lane.** A bug brief = root cause + fix + ONE regression test that fails without it, target ≤30 min. Hardening (standing guards, mutation proofs) is a separate parallel branch that never blocks the fix, and only for money, authority and browser-vs-server bugs, judged by cause. Every lane branches from the current integration set (`set/v0.2.144` while §3.3b holds), never a stale worktree. Every brief says "plain tests locally, proofs only for guards you edit, GitHub judges the rest" (§4).

**Lanes and models (Tyler, 2026-11-15, 2026-11-18):** run about 6-7 lanes at once when the PC has room (`node tools/pc-load.local.mjs`), each touching different files and tables from the ones running; keep colliding work serial. All lanes run on opus (agent files pin it); Fable only on a lane Tyler asks for by name (2026-11-19). Effort: security max, backend and reliability xhigh (agent files); pass `effort: "xhigh"` for a systems-engineer lane that changes `src/core`, the edge or combat (2026-10-23). Start a fresh agent per batch with exact paths; resume (SendMessage) only for a quick follow-up, and re-dispatch a lane past ~800k context or 60 min with no commit and no process (2026-10-16/18).

### 3.2 Priority
Player-visible bugs first, in the order a player meets them. No new feature track while a P0/P1 player-visible bug is open. An approved machinery speedup gets a lane the same day, in parallel with bugs and features, never waiting for a quiet moment (2026-11-19). Kill the CLASS, not the bug: sweep every field/surface of a "forgotten on reload" or "residue-ahead" bug and fix the whole list at once.

### 3.3 The three lanes

| Lane | What | Gates, in order |
|---|---|---|
| **A. Bug** | player-visible fix, client and/or edge, no DB body change | merge onto the set → rides the big release (§3.3b). A P0 alone ships as a hotfix branch from `main`: visual pass on touched screens if a rendered surface changed (+combat & inventory if CSS moved) → edge deploy if `supabase/functions/**` moved → bump → push `release/vX.Y.Z` → GitHub run → push `main` → report. |
| **B. Feature / multi-file** | features, refactors, content batches, multi-surface changes | merge onto the set → at release: visual gate on the ASSEMBLED set, touched screens only (DESKTOP first, 922×423 only when usage allows — 2026-10-19; screenshots READ; +combat & inventory if CSS moved; buttons stay off until the server confirms) → bump → push `release/vX.Y.Z` → GitHub green → push `main` → report |
| **C. DB / economy** | any migration or RPC body change | author + §4 self-check + `schema-drift` replay + `apply-order-honesty` + `migration-names` → STAGED on the set (2026-11-21) → at release: pre-EA Security list (§2) → Coordinator applies in the generated order (one file; a rehearsal on a copy of production first) → `live-hash-drift --live --write` + each sidecar flipped by `node tools/migration-note.mjs applied <file> "<evidence>"`, in ONE Coordinator commit (the authoring lane re-pins `restore-census` when it adds a table or changes seeded rows) → edge deploy if the engine moved → THEN the client push. No separate post-apply verification agent: the §4 self-check runs inside the apply and rolls it back on failure. |

Every lane:
- **The record gate is the GitHub matrix on `release/vX.Y.Z` and on `next` (the set), not Tyler's PC (2026-10-14).** `run-ci-local` only reproduces a GitHub red. No local in-page suite unless `supabase/functions/**` changed, then ONE local run precedes the edge deploy. Before pushing, run locally only the guards the diff touches.
- **Stream mode:** while OBS is live (`node ~/Huntera-Stream/obs-status.mjs` → `"streaming":true`), no heavy local work (no run-ci-local, full suites or multi-lane browser fan-outs). Run lanes in the cloud (`start_session`, target "cloud") and rely on GitHub. Applies, edge deploys, Discord posts, the play gate and pushes stay local.
- **The Coordinator resolves merge conflicts itself (Tyler, 2026-11-21).** Source and doc hunks: read both sides. A tool-generated baseline (edge-bundle, live-hash-drift, restore-census, module-preload, dead-exports, ci-shape, levers) is re-run by its own tool on the merged tree with the cause written, never hand-edited. Then run the tests the conflicting files touch, with exit codes, before pushing.
- **One run at a time.** Merge the ready set, push it, let ONE GitHub run judge it, bisect only if red.
- **Green means:** the GitHub run on the release SHA is green. A red is fixed forward within the hour, never called "flaky" until read. A red caused only by a test/guard harness, fixed by a test-only change, may push before the re-run, which judges it after the fact (2026-10-19). A known red that a planned dial fixes is named in the gate table, not used to block a correct change (2026-11-21).
- **Play gate:** before telling Tyler to play, the Coordinator plays what changed on live (reload → act → reload, plus the original bug's repro), read as page text; a boot check is not a play gate (2026-10-19/20). Tyler does the wider play-testing; say "shipped, ready for you to test", never "fixed" (2026-10-19).
- **Visual gate** exists because two individually-verified branches broke combat together (b361); the authoring agent's own look never counts. Screenshots are taken of `play.html` in the browser pane as the allowlisted QA account; the art-director reads them if the Coordinator cannot.
- **Edge deploy before push** when `supabase/functions/**` changed: `node tools/deploy-edge.local.mjs --deploy` (packs, deploys with `--yes`, then checks the live `payload_sha256` equals `pack-edge --hash`). `--yes` is Tyler's standing OK for every deploy (2026-11-03).
- **Push = live** (Pages deploys `main`). The Coordinator runs `git push` itself. Once Pages serves the new `BUILD.cache`, the release's Discord note goes out (no per-day limit, 2026-11-18) via `node tools/post-changelog.mjs <file>` (dry-run first; 2000-char cap).

### 3.3a Release mechanics
- Ready branches assemble on `set/vX.Y.Z` (never local `main`), pushed to `next` as it grows. Local `main` equals `origin/main` between releases; docs-only commits go through a separate main checkout.
- A release: bump → ONE CHANGELOG entry in player-facing words → push `release/vX.Y.Z` → GitHub green → push `main`.
- Server changes stay STAGED until the release that ships them (§3.3b); the apply-order note, live-hash baseline and census re-pin land the same day as the apply.

### 3.3b Cadence: ONE BIG RELEASE for the redesign's first build (Tyler, 2026-11-21: "Yes, one big release"; replaces the 11-14 "big patches" until it ships)
- **Production is frozen on v0.2.143.** Only a P0 ships before the big release, as a hotfix branch from `main` (Lane A).
- **Every lane merges into `set/v0.2.144` as it lands.** The set is pushed to `next` so GitHub judges it (one run at a time, at least nightly); a red on `next` is fixed forward like a release red. Nothing else gets a version bump, CHANGELOG entry, Discord note or `release/*` run until the big release.
- **Server changes are STAGED, not applied** (migrations with STAGED notes, the edge bundle hashed but not deployed). At release: generate and check the full apply order, rehearse it on a copy of production, apply in order, deploy the edge, re-measure live-hash, push `release/v0.2.144`, GitHub green, push `main`, Pages, play gate, one Discord note.
- **The scope is the approved redesign** (`docs/design/redesign/`, all ten directions GO, Tyler 2026-11-22); the lane plan is `11-build-audit.md`.
- **After a big release ships:** a blind playthrough audit of what changed (play as a human, learn only from the screen, the audit standing rules) plus a short Level 1-20 pass; findings go to fix lanes (2026-11-15/16). After this release, big patches resume unless Tyler says otherwise (2026-11-14).
- **No player-protection staging:** no cohort percentages or soaks. Arm channels for everyone after the Security GO; prove scale with synthetic load tests. Old content may be cut freely. Combat-engine changes are batched and spaced by the world-tick parity rule.

### 3.4 Play first, then vitals (2026-09-08)
Every real bug has come from playing, none from an audit. Start each session with the session brief and the nightly (`gh run list --workflow smoke.yml --event schedule --limit 3`; a red, cancelled or stale nightly is P1 before the next release, 2026-11-18), then PLAY what is being built: while production is frozen that is the set, through `node tools/qa/local-world.mjs` (a fresh account's first thirty minutes and the changed loop). On live, `node tools/vitals.mjs` (read-only; `--refusals` by verb): **a feature at zero for two days is a P1.** Then new lanes.

### 3.5 The game must make sense and be fun (Tyler, 2026-10-10)
- **The redesign is the target (Tyler, 2026-11-21/22).** Current-game rulings never constrain it, are never quoted as a baseline ("today X", "was X, now Y") and are never a reason to ask Tyler. State every question as the target design: rule, reason, player experience, with a plain "how it plays" line before the options (2026-11-22). The designer decides new-game design calls and reports them; only money, grants, scope cuts and plan approval go to Tyler.
- **Balance is levers.** A number inside its band is done; no refits to hit a point exactly (2026-11-21). When a change pushes another band out, set the dial that owns that band in the same pass, measured on the current set; never hold the change back (2026-11-21).
- **The game designer re-reads the game after every content/systems batch** (changed systems + the new-player path): walk the new-player path from the first screen, check every skill (purpose, path, consumer, fun to level), the hour/day/week chase and the away-and-return moment; rule keep / fix / merge / cut per system; rank top changes by first-hour value. Result is a dated section on the priority board; Tyler approves cuts.
- **Every designed sequence (tutorial, start flow, hunt chain) gets a walk-through vs real data** before it is reported (see `game-designer.md`).
- **Content ships only if it fits the loop:** every item has a source and a use, every skill has a consumer (the catalogue-coherence guard enforces the data half). Half-built features stay hidden.

### 3.6 Keep the machinery lean (Tyler, 2026-10-10)
- **Guards earn their runtime.** A guard whose every mutant is caught by another is merged or retired, with that proof in the commit; slow guards are pooled or cached. A unique catch is never removed (§2). A release runs every plain guard and the mutation proofs of the guards whose own files moved (tests/, tools/, .github/); the full sweep runs nightly, a job it left red re-proves in full on the next release, and a nightly that cannot be read or never saw the release's base blocks it (Tyler, 2026-11-19; `HR_RELEASE_PROOFS` in smoke.yml).
- **No unneeded work (2026-10-20):** never re-run a lane's own checks as the Coordinator; before any long check, ask whether a rule requires it and whether it already ran. Stop stray or runaway test runs and orphaned watchers yourself after checking their command line, never a DB apply or deploy (2026-11-18).
- **Memory stays pruned:** dated logs retire once their lessons are folded into durable notes or this file; stale facts are deleted when found.

### 3.7 Re-tighten before Steam Early Access (Tyler, 2026-10-14)
Before EA: the one full adversarial Security review (§2) is GO with its changes landed; the full mutation sweep is green on the launch build with no waivers; `node tools/lane-done.mjs` green per lane returns (§4); census re-pins follow every apply; the play gate moves before `main` (a staging origin with the QA account signed in); any combat-engine deploy passes the combat replay; the designer does a full re-read.

---

## 4. Testing discipline

- **Lanes run light (Tyler, 2026-11-21).** A lane is done when the tests ITS change touches pass, one at a time, with exit codes, listed in a `LANE DONE:` commit. Its local check is `node tools/guards-for.local.mjs --run`: the plain tests its diff touches against its own base (the nearest `origin/set/v*`, `next` or `main`), then only the mutation proofs a release would run for that diff (guards whose own side, tests/ tools/ .github/, moved; `HR_RELEASE_PROOFS` through `tools/mutant-gate.mjs` `releaseScope`). It names every touched proof it skipped; the nightly proves those. `--proofs` runs every touched proof, only when a brief asks. Heavy checks go to GitHub with `node tools/guards-for.local.mjs --remote` (about 30 min, off this PC); never a bare `gh workflow run smoke.yml --ref <lane>` (the full 70-90 min sweep). No per-lane `lane-done` until §3.7. A release set runs nothing else locally except ONE `node tests/run-smoke.mjs` when the edge bundle changed.
- **Claims are gated on exit codes.** `( cmd || echo RED )` returns 0; run the guard, branch on `$?`, then write "green".
- **Every fix and feature ships with its test in the same commit.** Bug → a regression test under `tests/` (the owning module's test file) that fails without the fix. Feature → a happy-path test that plays it. Details in `TESTING.md`.
- **Both paths:** anything touching combat, death, hunt sessions, stamina or supplies ships a test with the hunt viewed and one with the browser closed (the hunt keeps running on the server).
- **A guard that has never been red is not a guard:** every standing guard carries `--selftest`/`--mutate` proof. Mutate the caller; one sample is not a verdict.
- **Second breakage = missing test.** Add the test before fixing again.
- **Never disable a failing test to unblock a push.**
- **A red in-page test is a P1.** GitHub's `smoke` job fails on ANY ✗, so one flake blocks every later build. Fix it at its source (pin the clock, tear down state, measure layout); never re-run until green.
- **Migrations name their own place (architecture audit rule 12, 2026-11-19).** A new migration is `node tools/new-migration.mjs <slug>` (a generator: `--new <slug>`): `supabase/migrations/NNNN-<slug>.sql`, one past the highest sequence on the lane's base, with its sidecar `supabase/migration-notes/NNNN-<slug>.sql.json` holding the STAGED note. The name is its replay position: no lane edits a shared order file, and no new file is date-named (`tests/migration-names.mjs`). Two lanes from one base may share a number; if both write one function, the later lane re-derives its body and runs `--renumber`. A superseded catalogue leaves the replay only by `node tools/chain-retire.mjs --retire` (end state proven identical).
- **Server changes carry a §4 self-check block** (properties asserted by executing SQL), and the chain must replay on `node tests/schema-drift.mjs` with a byte-identical second apply (of the staged tail; the replay restores the longest cached prefix, `--full` replays from zero).

---

## 5. Build & ship mechanics

- **Versions are semver (Tyler 2026-10-17; build numbers `bNNN` are retired).** The version string is the cache buster, in three places that must agree: `src/build-info.js` (`BUILD.version` and `BUILD.cache`, both `'X.Y.Z'`), every `?v=X.Y.Z` in the root `*.html` pages, every `?v=X.Y.Z` on ESM imports under `src/**`. **Run `./bump-version.sh X.Y.Z`**, then bump the date in `build-info.js` and add the CHANGELOG entry (`## vX.Y.Z — YYYY-MM-DD (Title)`, above the previous one). Patch per release, minor per milestone, 1.0.0 reserved for full release. Release branches are `release/vX.Y.Z`.
- Never add a bare relative import under `src/**`; never add a `?v=` outside `src/**` (Supabase's bundler treats it as a literal path). `versionQueryGuard()` in `tools/pack-edge.mjs` enforces both.
- The service worker derives its cache name from the `?v=`; the b124 kill-switch in `<head>` purges mismatched caches. Never reintroduce a fixed cache name.
- `run-ci-local.mjs` parses `.github/workflows/smoke.yml`, so new guards are registered THERE: a new or edited guard registers itself with `// ci-step:` / `// ci-run:` header lines and `node tests/ci-shape.mjs --write` generates its step (CI-SHAPE-13 refuses a hand edit). `--all` adds the in-page suite.
- On merge, `?v=` conflicts resolve as branch content at the new version; JSON baselines are regenerated by their own tools, never hand-merged.

---

## 6. Persistence invariants

- **Server tables are the only copy of progression.** `hr_state_of` projects them; the envelope the client applies is truth. `player_ledger` journals every value movement.
- **The residue is an ALLOWLIST** (`RESIDUE_FIELDS` in `src/session/residue.js`) for client-only preferences and display state. Anything a player would miss after a reload lives in a server column and is projected. Anything else the client holds is lost on reload by design.
- **The browser never says one thing while the server says another (Tyler, 2026-09-14).** Every number a player can act on (counts, levels, stamina, charges, cooldowns, buff clocks, bank stacks, prices, gates) renders from the server projection and is REPLACED by each envelope, never merged upward. A prediction may show only if nothing can spend it (no gate, intent or purchase reads it) and the next envelope overwrites it. A new "client shows X, server refuses" report is a P1 class-kill.
- **Residue-ahead is a bug class:** never gate a server capability on a client-held tier/level/flag. Gates read the server-mirrored value, failing safe to "not unlocked".
- **Server writes are versioned, raise-only where needed** (envelope versions, hp floors, bank cap); the client never rolls a server version back. Never restore or evict on uncertainty (network error, missing table, bad timestamp).
- **One account per player; the client is character-session based** (Tyler, 2026-10-17): one login, one `CharacterSession` (`src/session/character-session.js`) per active character, up to 4 at once, with no global state and no "current player". Only the viewed character streams live; the others keep playing on the server.
- **One combat engine:** `src/core/combat-sim.js` runs every hunt, viewed or not, inside the one server instance settle (100 ms combat steps), identical online and offline; there is no away mode and no second path (`AWAY-1`, `AWAY-12`). A leave lands at the server settle, so a death seen coming cannot be dodged (~34 s under the flush, Tyler OK 2026-11-22).
- **Death (redesign, Tyler 2026-11-22, RD-Q3 a):** the party picks a stance; Careful and Steady fall back before a death, only Bold can die. A death costs Level XP and skill progress, can take a Level but never below Level 1, and Blessings cut it (2026-11-09). The numbers are the designer's (`docs/design/redesign/02` package 3, `12-targets.md`).
- **RLS is per-user** on every player table; public tables are read-only to others. The client RPC surface is `hr_client_rpc_baseline`; `hr_assert_grant_hygiene` detects drift.
- **A hero's server cost only goes down (architecture audit rule 10, 2026-11-19).** Statements a settle, ledger rows a hero-hour and row writes a settle are measured on the replay with the shipped engine, and the baseline only shrinks; a raise needs a written reason (`tests/per-player-cost.mjs --write --raise "<why>"`).
- **A client write answers with the state it changed (rule 11).** A client RPC that writes a table the envelope carries returns the envelope (`hr_state_of`), so the client never re-reads with `hr_load`; today's exceptions are an allowlist that only shrinks (`tests/write-answers-state.mjs`).

---

## 7. Code & content rules

- Layout: data in `src/data/*`, pure logic in `src/core/*` (dual-runtime, imported by the edge), per-character state in `src/session/*`, boot/sign-in/world pane in `src/app/*`, windows and HUD in `src/shell/*`, hunt rendering in `src/hunt-view/*`, chat/friends in `src/social/*`, the world renderer in `src/world/*`, render helpers in `src/render/*`. `src/legacy.js` is deleted; no module grows into a monolith (`tests/client-module-size.mjs`).
- **Imports point one way** (arch audit, Tyler 2026-11-18): data ← core ← session ← hunt-view / world / social ← shell ← app; render beside session, net under session; the edge imports only core and data. A new upward import is red (`tests/layering.mjs`, its baseline only shrinks).
- **No hardcoded colours.** Every colour is a token from `src/styles/tokens.css` (the single source); convert as you touch each component.
- Stylesheets are one per surface under `src/styles/` (`tokens.css` + app, shell, windows, hunt, character, world, summary, notice). UI is Charcoal & Gold only; text at least 12 px.
- **Mobile query:** `@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px)` (`tests/breakpoint-guard.mjs` freezes the set). Phones are landscape-only; windows become slide-out sheets, never a bottom-nav.
- **Assets:** new icons go in `assets/icons-bundle/` (`buildings/ monsters/ resources/ medieval/`), wired via the art manifests (`src/data/item-art.js`, `monster-art.js`); world art goes through `tools/world-art`. Never reference `icons3/`, `assets/raw-bundle/` or `.legacy/snapshots/`.
- **Supabase wiring:** `src/net/supabase-bootstrap.js` (anon key only) and `src/net/auth.js`; server reads, intents and the envelope live in `src/session/` (`server.js`, `envelope.js`, `edge-intents.js`, `residue.js`). Bug reports: the `bug-report-bridge` Edge Function.
- **Prototypes are frozen** (`prototypes/**`, including `hunt-sim`): never a source or a reference for new work. New work builds to the redesign and Tyler's rulings (§3.5). The hunt sim is only a quality floor: the live hunt must not look or play worse (Tyler, 2026-10-19).
- **Docs:** no new `.md`/`.docx`/`.pdf` unless Tyler asks. Maintain the CHANGELOG, `docs/planning/PRIORITY_BOARD.md`, `docs/design/redesign/` and the three §10 standards docs.

---

## 8. Reporting to Tyler

- **Brevity is a rule.** A status is one table (item → live / applied / staged / in flight / open → what's needed) plus at most three sentences. A commit message is at most eight lines. The priority board's status section is GENERATED (`node tools/board-from-git.mjs`); narrative goes only in its decisions and backlog sections.
- **Do it, don't hand it over.** Don't ask before what building the game needs: applies, edge deploys, pushes, Discord notes (Tyler, 2026-11-11). Still his: spend, player-state edits, the wipe, PC security settings. Never hand Tyler a command to run. If a harness permission blocks an action, say so once with the settings fix, then continue. Give a bare command only when he explicitly asks for one — a single bash block, nothing else.
- Report faithfully: red is red, unplayed is unplayed, a skipped step is named. Check every text, brief and agent report yourself before it reaches him (2026-11-16).
- Name Tyler as a blocker only after exhausting every path, in one line at the end. Push-notify only for blockers only he can clear and major milestones.
- Never end a turn idle while work is queued; a blocker gets one line, then the next item starts. Busy-work is worse than idle.

## 9. Behaviour notes

- Trust but verify: after a fix lands, check it on the live deploy and report green/red.
- If the bash mount disagrees with `Read`, trust `Read`/`Edit`/`Write`.
- Chrome QA tabs freeze after idle; open a fresh tab and close the old one so it cannot reclaim the single session.
- **Hooks (`.claude/settings.json`, every session and agent):** `tools/hooks/bash-guard.mjs` denies the §2 lines: stashing, force-pushing main, agents pushing main / applying / deploying, deleting worktrees, skipping git hooks, printing secrets (`--selftest` proves each). `tools/hooks/edit-checks.mjs` runs the sub-second guards on an edited `src/` CSS/JS file and reports a red at once. `tools/hooks/session-brief.mjs` opens every session with the live version, main's CI, recent lanes and freezing hunts. A hook's block is a rule, not a glitch: never route around it.
- **Local one-screen tools come first** (every account and session; Tyler 2026-10-20, to save usage). Before ad-hoc git, process, SQL or CI-polling commands: `node tools/lane-watch.local.mjs [--every N] [--all]` (lanes: last push, ahead, working/quiet/done, CI) · `node tools/release-check.local.mjs X.Y.Z [--wait]` (release + main run, failed steps only, Pages version, live engine hash) · `node tools/assemble-release.local.mjs X.Y.Z lane/… [--bump]` (set/vX.Y.Z from main, zero-conflict merges only, tests touched) · on Tyler's PC only: `node tools/pc-load.local.mjs [--stop-lanes]` (CPU/RAM, lane test runs) and `node tools/hunt-health.local.mjs` (open hunts' settle lag > 32 s = freezing, rate counters, refusals; read-only, ~/.supabase-token) · `node tools/guards-for.local.mjs [--run|--remote]` (in a lane worktree: the tests this diff loads, run one at a time, reds only) · `node tools/notes-draft.local.mjs X.Y.Z` (lanes + fix/feat subjects, CHANGELOG/Discord skeleton) · Coordinator, Tyler's PC: `node tools/deploy-edge.local.mjs [--deploy]` (§3.3 edge deploy + live hash check in one), `node tools/live-hash-reseed.local.mjs` (after a staged-SQL merge on the set) and `node tools/char-state.local.mjs <name>` (one character as the server holds it: sheet, hunts + lag, party, refusals, ledger) · `node tools/qa/local-world.mjs smoke|serve|skip N` (any lane, local or cloud, no secrets: the real `play.html` + real engine on the replayed chain, a brand-new account from the sign-in screen, time skip; driver API in its header) · in the browser pane: the contents of `tools/qa/pane-probe.js` as the javascript tool's text (fps, freezes, engine calls). Read a red run with `gh run view <id> --log-failed` (installed on Tyler's PC: `C:\Program Files\GitHub CLI\gh.exe`), not by guessing from step names. Edge/DB logs: the Supabase MCP `query_logs` tool (project `nezapsylztqbbwuwembx`, source `function_edge_logs`) before theorising about server behaviour. The Agent tool's `isolation:"remote"` ran lanes LOCALLY on 10-20: real cloud work is `start_session` with target "cloud"; confirm with pc-load.

## 10. Creative standards (Tyler, 2026-10-14)

Hearthrise must feel handcrafted and be recognisable from a screenshot without its logo. It must never read as a generated dashboard or a pile of easy-to-build systems. Quality over quantity; player experience over feature count. These rules rank below §1–§4.

- **Read the matching doc only when the task needs it.** Never preload all three; briefs name the one that applies.
  - `docs/DESIGN_STANDARDS.md`: designing or changing a system, a creature or hunting ground, an item, progression or economy numbers, or player-facing text and names.
  - `docs/ART_DIRECTION.md`: any sprite, icon, tile, effect, CSS or screen layout. The pixel-world specs it points to (`src/data/world/art-budget.js`, `palette.js`, `tests/world-assets.mjs`) are law.
  - `docs/QUALITY_CHECKLIST.md`: before reporting a feature, content batch or UI change as done.
- **Identity:** Tibia and Huntera inspire mechanics only, never names, sprites, maps, UI or text. No filler names (Shadow, Void, Ancient, Eternal, Dark, Forgotten). Creatures, places, items and lore connect to each other.
- **Player text:** outside actual lore, everything reads as standard genre UI: one glossary word per control, short labels like "Recommended: 4+ players", never sentences (2026-11-14). Sentences (lore, coach cards) are plain English in Tyler's voice: no semicolons, em dashes or colon-joined clauses (2026-11-06); American spelling (2026-10-28).
- **Purpose test:** every system answers which player problem it solves, what decision it adds, and what it plugs into. If it fails, merge, simplify or cut it. More systems is not a better game.
- **No mass generation:** a batch of more than 20 rows starts as a sample of about 5, played and reviewed, then expands in batches of 20 or fewer, audited for repetition.
- **Pixel art:** integer scales only; no smooth scaling or blur; one grid, one palette, one perspective.
- **UI is purpose-built:** no wall of identical cards, no borders on everything, no glow or gradient decoration, no random accents. An inventory looks like an inventory, a bestiary like an encyclopedia, a hunt like a living hunt.
- **Evidence, not self-praise:** no balance number or quality score without evidence; done, verified and assumed are reported separately; a builder never scores their own work.
- **Challenge Tyler:** call generic, redundant or over-complicated ideas what they are, with a better option. There is no approval wait: decide, build, validate, report.
