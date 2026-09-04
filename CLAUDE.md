# Hearthrise — rules for Claude

This file is auto-loaded into every Claude session in this workspace. The rules below are non-negotiable — follow them without asking.

---

## Session operating mode (locked 2026-08-09)

**Every session on this project runs as the full autonomous dev team, with THIS session acting as the Coordinator.** Tyler should never have to open separate sessions to get parallel work done — the Coordinator dispatches the specialists here.

- The team is the 5-specialist system under `.claude/` (art-director, asset-director, game-designer, qa-engineer, systems-engineer), dispatched as subagents via the Agent tool / Workflow, coordinated through `.claude/coordination/`. Read `.claude/coordination/PROFESSIONAL_STANDARD.md` first.
- **Default to dispatching the team** for substantive work (features, audits, content, multi-file changes) and to running multiple asks as **parallel workstreams in THIS session** rather than spawning separate sessions or background task-chips. Use `isolation:"worktree"` when agents write in parallel; integrate one logical change at a time, verifying (`node tests/run-smoke.mjs`) after each.
- Apply judgment only for trivial conversational turns (a quick question, a one-line fix) — those don't need a full fan-out.
- The Coordinator still owns integration, testing discipline, and the ship flow below.

---

## Session criteria (locked 2026-08-23 — after the beta-morning failures; Tyler: "how do we get back organized and doing this correctly?")

These supersede anything above or below where they conflict.

1. **THE PLAY GATE.** No release touching a player-facing loop ships until it has been PLAYED on the live server as a real signed-in account, the way a player plays: reload → claim → fight → gather → buy → hire → water → reload again. Tests + screenshots are necessary, not sufficient. Every beta-morning bug (dead quest claims, daily-reward re-popup, water-all, swing timer, unbuyable Auto-Eat) was "a flag/payout that used to live in the save blob, forgotten on reload" — only reload-and-redo finds that class. The Coordinator needs a logged-in tab it can drive (Tyler's QA account in the connected Chrome); without it the gate cannot be run and the release waits.
2. **ONE TRACK, ONE TREE.** Agents work ONLY in worktrees (`isolation:"worktree"`). The Coordinator is the only writer on `main`. One integration at a time; the suite runs on a quiet machine (parallel suites blow the in-page budget and look like flakes). No new design/feature tracks while a player-visible bug is open — bugs first, in the order a player meets them.
3. **KILL THE CLASS, NOT THE BUG.** The cutover inverted persistence: the blob was a DENYLIST (everything persisted unless excluded); the residue + records are an ALLOWLIST (only listed fields survive a reload). When a "forgotten on reload" bug appears, run the sweep (every `G.<field>` the game writes vs. record ∪ residue ∪ NO_SYNC) and fix the whole list in one build — never one field per player report.
4. **STATUS IS A TABLE.** Every report to Tyler leads with a table: bug → status (fixed-live / fixed-staged / open) → what's needed. No walls of text; no "I'll…" without a tool call behind it.

## Testing discipline

**Every bug fix and every new feature ships with a test in the same commit.** Full reasoning + mechanics are in [`TESTING.md`](./TESTING.md). The short version:

- **Bug fix** → add a regression test under "regression suite" in `src/features/smoke-test.js` that fails without the fix.
- **New feature** → add at least one happy-path E2E test under "player actions" or "interactive coverage" that exercises the feature the way a player would.
- Budget ~10–20% of feature build time for tests. Skipping it always costs more later.
- Don't disable a failing test to "unblock" a push — fix the test or fix the underlying behaviour. The test is the contract.

Run the suite with `Ctrl+Shift+T` or the floating 🧪 button.

---

## Build + ship workflow

- Cache buster lives in **three** places that must agree: `src/build-info.js` (`BUILD.cache`), every `?v=NNN` in `index.html`, and every `?v=NNN` on ESM import specifiers in `src/**/*.js` (added in b148 — static imports like `import './net/sync.js?v=NNN'` are fetched WITHOUT inheriting index.html's version, so a stale one runs old code for ~10 min after deploy). **Just run `./bump-version.sh <NNN>`** — it bumps all three in lockstep and verifies. Then bump the date in build-info.js + add a CHANGELOG entry by hand.
- Don't add a bare relative ESM import (`from './x.js'` with no `?v=`) — the bump script + smoke test expect every module import to carry a version. `bump-version.sh` fails loudly if it finds an unversioned one.
- **That rule is scoped to what the BROWSER loads: `index.html` + `src/**`. Outside it — `supabase/functions/**`, `tests/**` — a relative import must carry NO `?v=` at all** (b332). `bump-version.sh` walks `src/` only, so a version there can never be bumped: the Edge Function's imports sat frozen at `?v=326` for five builds while their targets moved to `?v=331`, and Supabase's hosted bundler then rejected the deploy outright because it resolves a specifier as a literal file path, query included. `versionQueryGuard()` in `tools/pack-edge.mjs` (run by `tests/run-smoke.mjs`) fails the build on one. Do NOT "fix" the drift by widening the bump script's `find`.
- Service worker derives its cache name from the `?v=` it sees on script tags (`hearthrise-<NNN>`). The b124 universal kill-switch in `<head>` purges any cache whose name doesn't match the current build — don't reintroduce a fixed cache name.
- **THE RELEASE VISUAL GATE (Tyler, 2026-08-17, after the b361 combat-screen break — NON-NEGOTIABLE).**
  No release that touches UI, CSS, icons, or any rendered surface ships until the ASSEMBLED
  release (merged main, not the feature branch) has been LOOKED AT: boot the real game, open
  every screen the diff touches plus the combat screen and inventory (the two densest), at
  desktop AND mobile-landscape (922×423), and READ the screenshots — measurements alone do not
  count, and per-branch verification by the authoring agent does not count, because the b361
  break was an emergent interaction between two individually-verified branches (256px portraits
  meeting an unsized icon slot). The smoke suite cannot see layout. If the Coordinator cannot
  do the pass, the Art Director does; either way the screenshots exist before the push.
  Tyler's words: "THIS SHOULD HAVE NEVER GONE LIVE WITHOUT SOMEONE FROM THE UX/UI/DESIGN TEAM
  APPROVING IT."
- **THE CI GATE (locked 2026-09-04, after the P0 process failure below — NON-NEGOTIABLE).**
  **A release is green only when BOTH the local `node tests/run-ci-local.mjs` run AND the
  GitHub Actions run on the release commit are green.** Neither alone is a gate: the local
  run cannot see a CI-environment problem, and the GitHub run cannot be waited on while a
  release is being assembled — so both, every time, and the GitHub run is CHECKED, not assumed.
  `node tests/run-smoke.mjs` is ONE step of the workflow; `.github/workflows/smoke.yml` runs
  thirteen more that it does not (schema-drift, live-hash-drift, renown-kill-faucet,
  restore-census, conservation-fuzz, activity-intent, claim-intent, clan-journal-guard,
  anon-rate-gate, raid-band-denial, raid-card-copy, rpc-resolution, edge-jwt-gate — most with
  their `--mutate` / `--selftest` proofs). `run-ci-local.mjs` DERIVES its list by parsing
  smoke.yml, so the two cannot drift; `--all` adds the in-page suite and runs the whole workflow.
  Why: on 2026-09-04 the Actions history for `main` showed **40 completed runs since 2026-08-29
  and ZERO green**, while the in-page step passed in every one of them. Every release from b488
  was gated on the weaker local command, and the guards that were red were the ones that watch
  the DATABASE — can the repo rebuild it, does production carry the bodies the repo believes it
  carries, which rows only a backup gives back, is value conserved. After cutover the database
  is the only copy of every player's progression, so those are the guards that matter most.
  A red CI run is never "flaky" until someone has read it, and a guard is never fixed by
  loosening, deleting, or skipping it.
- After bumping, give Tyler the literal git push command. He runs git himself.

---

## Server authority (locked 2026-08-10 — Tyler, supersedes where it conflicts)

**Hearthrise is a MULTIPLAYER-ONLY, ONLINE-ONLY game. Nothing is authored by the client — ever.** (Tyler, explicit, 2026-08-10.)

A live connection is required to play. There is no offline-capable client and no local simulation to reconcile. Progress still accrues while the player is away — the SERVER computes it (activity + server timestamp → grant on return), exactly like Idle Clans. "Offline progression" means server-side accrual, NOT playing without a connection. This constraint SIMPLIFIES the architecture: no dual client/server simulation, no offline reconciliation, no trust in any local value.

Trigger: a live audit found the economy fully exploitable from browser devtools (`G.gold = 1e12` → autosave → buy out the real market). Gold, inventory, all skill levels and every leaderboard score live in the client-authored `game_saves.snapshot` blob, and `buy_listing` moves no value server-side — the client does. Clan seat / raids / world events were already properly server-authoritative; **the market and the save blob are the two surfaces that never got that treatment.**

The rule going forward:

- **The server owns anything tradeable, rankable, or contributable** — gold, tradeable item quantities, market transactions, leaderboard scores, clan/raid contributions. These live in real tables written ONLY by `SECURITY DEFINER` RPCs, never by a client PATCH/POST. Copy the established pattern in `2026-08-08-clan-seat.sql` (`clan_deposit`: server-side item catalogue, server clock, per-call + per-day clamps read from an append-only ledger, no client UPDATE policy).
- **Never trust a client-supplied value that crosses to another player** — not gold, not quantity, not price, not a display name (derive names server-side), not a timestamp (use `now()`).
- **There is NO solo progression. None.** (Tyler, explicit, 2026-08-10 — do not re-propose a client-side "solo tier"; it has been rejected three times.) Every progression value — XP, skill levels, combat outcomes, gathering/crafting yields, farm growth, drops, gold — is computed and owned by the SERVER. The client sends INTENTS ("start mining coal", "craft X", "equip Y") and renders the state the server returns. It never computes an authoritative number.
- **Offline progression is server-computed**, the Idle Clans way: the server stores the active activity plus a SERVER timestamp; on return the SERVER computes elapsed time against server-known level/gear/caps and grants the result. The client clock and local files are never read for authority. Client-side prediction is allowed for responsiveness but is display-only and always reconciled to server truth.
- **Every shared-surface write is journalled** so abuse is detectable and reversible.

The target property is not "unhackable" (unachievable in a browser) — it is: **a forged client value cannot cross into another player's economy or ranking.**

**The beta WILL BE WIPED at cutover** (Tyler, 2026-08-10: "I do not care if anything has been exploited because this beta version is gonna be wiped anyway. I care about doing it correctly from this point forward."). So: no back-compat, no save migration, no amnesty, no forensic audit of existing abuse, and no need to harden an economy that is going away. Design the server-authoritative model **correctly rather than compatibly** — this is effectively greenfield on the server side, which removes the hardest constraint in the whole program.

## Architecture direction (locked 2026-08-07; amended 2026-08-10)

Goal: scale in content **and ship to Steam + mobile from one web core.** Approach: **incremental refactor-in-place — never a rewrite.**

> **Amendment (2026-08-10, authorized by Tyler):** the no-rewrite rule does NOT block the server-authority program above. That work is still strangler-fig — one domain at a time (market/gold/inventory first), live beta green throughout — but it DOES move authority off the client, which is a deliberate architectural change rather than a refactor. Where the two conflict, **server authority wins.** A full server-side *simulation* rewrite remains rejected (4–8 months, and it would make progression require a live connection). Keep the live beta green. Proof-of-model: Melvor Idle (a web idle-RPG) shipped to Steam (desktop wrapper) and iOS/Android (mobile wrapper) from one web codebase. Steam = Electron/Tauri wrapper; mobile = Capacitor wrapper. The web stack is not the blocker — the monolith + CSS debt are.

Migrate toward four layers, strangler-fig, one domain at a time (combat, skills, farm, world/map, dungeon — this is roadmap task #129):
1. **Data** — content as data (`src/data/*.js`). Grow by adding data, not code.
2. **Logic** — idle ticks, combat, economy as pure, DOM-free, testable functions. Reusable across platforms.
3. **Render/UI** — a component layer that reads design **tokens only**.
4. **Platform seams** — storage / cloud save / notifications / purchases / achievements behind interfaces, so Steam & mobile swap implementations without touching game logic.

**HARD RULE — no hardcoded colors.** Every color comes from a CSS token (defined per theme in `theme-cozy.css`). The old cozy theme baked ~58 cream gradients straight into components; that debt is exactly why the Hearthlight theme (b150) only partially applied. Converting hardcoded → token IS the visual revamp, done screen-by-screen — cozy-light must look unchanged, Hearthlight must go dark. When you touch any component, convert its colors to tokens as you go.

---

## Adding content? Read the systems map first

Before building any item / recipe / drop / gathering node / progression change, read
[`docs/SYSTEMS_MAP.md`](./docs/SYSTEMS_MAP.md). Most content is a **data row** in
`src/data/*.js` that an existing engine consumes — not new code. The map shows each
system, its data shape, where to add, and which guard verifies it. Golden rule: grow
by adding data, not code.

## What lives where

- `src/legacy.js` — the monolith, now **~18.8k lines** (the old "~9k" was 2× stale; corrected 2026-08-18 by the code-health audit). It is now mostly UI wiring + presentation glue (146 `innerHTML`, 199 `getElementById`) — the data/logic have already strangler-figged out into `src/core/*` (pure, dual-runtime) and `src/data/*`. Phase 3.5 (the render-layer extraction) is the remaining split — task #129. **Extract order (audit ruling): UI-render helpers → `src/render/*` FIRST, then the tab/screen controllers, leaving data/logic (already out) last.**
- `src/styles/legacy.css` + `audit-overrides.css` + `theme-cozy.css` — three sheets that fight each other on specificity. When adding mobile rules, expect to need theme-prefixed selectors (`html:not([data-theme]) ...`) to outrank existing desktop rules.
- `src/features/smoke-test.js` — the test suite. Add tests here.
- `src/net/auth.js`, `src/net/sync.js`, `src/net/supabase-bootstrap.js` — Supabase wiring. Default cloud config is hard-coded in supabase-bootstrap.js (anon key only — never paste service role).
- `src/bug-report.js` — Discord webhook + screenshot capture. Has both direct-Discord and Cloudflare Worker bridge paths.
- `.legacy/snapshots/` — old monolith HTMLs, kept out of deploy root since b125. Don't restore them to root — they ship old service workers.
- `assets/icons-bundle/` — the only icon folder shipped on the deploy. `icons3/`, `assets/raw-bundle/`, etc. are NOT shipped (gitignored or never committed). The smoke test asserts `_itemPath` and `_monsterIcon` never reference unshipped folders.

---

## Save system — invariants (DO NOT BREAK)

The cloud save is the backbone. These rules are enforced by the **b305 stress battery** in `smoke-test.js` — any change to `src/net/{sync,auth,events}.js` or the save/offline path in `legacy.js` (`saveLocal`, `loadLocal`, `processOffline`, `simulateAwayCombat`, `claimOfflineMs`) MUST keep that battery green and ship its own test.

> **b325:** `processOfflineCombat` is GONE. There is now ONE combat loop — `src/core/combat-sim.js`, called with `ctx = {away, atMs}` for both the live tick and away accrual (see [`docs/design/away-time-ruling.md`](./docs/design/away-time-ruling.md)). Do not reintroduce a second away path; the `AWAY-1` parity test asserts that a seeded fight is byte-identical either way, and `AWAY-12` asserts the old loop cannot come back. Which bonus channels pay away is a **table** (`src/core/away.js` `AWAY_SCOPE`), not a code path, and an unknown channel defaults to PAYING — every historical away bug was a base reward silently vanishing.

1. **Cloud is authoritative; local is a cache + offline journal.** Local must NEVER overwrite a newer cloud. `decideRestore` resolves by **freshness (newest wins by timestamp)**, not level. A strictly-newer LOCAL is never rolled back (anti-rollback invariant). Ties keep local (no needless reload).
2. **Restore/evict only on CERTAINTY.** Never restore on a garbage/NaN/negative/timeless cloud timestamp. Never evict a device on a network error, missing table, or offline — only on a *definitive* different-owner-with-fresh-heartbeat row. A flaky connection must never lock a player out or discard their save.
3. **The snapshot is a DENYLIST, not an allowlist.** `snapshot()` uploads every G field EXCEPT `NO_SYNC` (in-flight combat/activity, `combatLog`, `lastOfflineSummary`, derived `totalLevel`/`combatLevel`) and `_`-prefixed scratch. **Adding a persistent-progress field to `NO_SYNC` = silent cloud data loss — forbidden.** New features persist by default; that is the safe direction.
4. **Single active session keys on the TAB (`sessionStorage` instance id), not the device** (`localStorage` is shared across a browser's tabs). Heartbeat + stale-takeover so closing a tab never false-locks the other.
5. **Offline is capped at the daily budget** (`offlineCapHours`) via the `offlineBudget.at` watermark — a forward clock jump or long absence can never mint unbounded progress; a future/garbage watermark grants nothing. The watermark only advances while `document.hidden` is false.
6. **RLS is per-user** (`auth.uid() = user_id`) on every table holding player data — no cross-player read/write. Public-readable tables (profiles/clans/market/display_names) are read-only to others by design. NOTE: the client snapshot is self-authoritative, so leaderboard values are self-forgeable — true prevention needs server-side simulation (out of scope; documented limitation, not a quick fix).

Before touching saves, read [`memory: cloud-save-program`] and confirm the b305 battery still passes.

## Asset rules

- New icons go in `assets/icons-bundle/` (subfolders: `buildings/`, `monsters/`, `resources/`, `medieval/`).
- Wire them in via the `LOCAL_*_ICON` maps inside `applyLocalIcons()` at the bottom of `src/legacy.js`. That IIFE is the single source of truth for icon paths.
- Don't add `BUNDLE_*_ICON` entries pointing at `assets/raw-bundle/...` — that folder is unshipped.

---

## Mobile rules

- Mobile media query is `@media (max-width: 540px), (max-height: 540px) and (max-width: 900px)` — covers portrait phones AND landscape phones. **b310: phones are LANDSCAPE-ONLY (portrait gated), and a landscape phone should get the SCALED-DESKTOP layout (left rail + two columns), NOT the phone bottom-nav.** A wide landscape phone (e.g. 922×423, paione's Ulefone — wider than 900) therefore correctly falls into the desktop/rail layout; b309 briefly forced those into the bottom-nav and was reverted. The rail is made scrollable so it fits short screens. Don't push wide landscape phones into the bottom-nav layout.
- Bottom-nav: 6 tabs (Home/Character/Combat/Skills/Farm/More). Sidebar hidden on mobile.
- The desktop-only `.prof-toolbar` must stay `display:none` on mobile. The mobile-equivalent is `.feat-buttons`.

---

## File creation

- Don't create new docs (.md, .docx, .pdf, etc.) unless Tyler explicitly asks.
- When Tyler asks for "the command," give him the single bash block to run, no more no less.

---

## Behavior

- Trust but verify: when a fix lands, run the smoke test against the live deploy and report green/red.
- When something breaks for the second time, that's a sign there's no test guarding it. Add the test before fixing again.
- If the bash mount looks stale (file size disagrees with what `Read` sees), trust `Read`/`Edit`/`Write` — that's the live filesystem. Bash mount is sometimes cached.
