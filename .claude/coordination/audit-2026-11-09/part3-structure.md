# Architecture audit 2026-11-09, part 3 of 3: structure, data and content systems

Systems engineer, branch `lane/audit-2026-11-09-part3`, base `origin/main` 0c0196bf0 (v0.2.108). Read-only: no code changed.

**What was run (exit codes seen):** `bash bump-version.sh --check` exit 0. `node tests/core-purity.mjs` exit 0. Everything else is static reading plus throwaway scripts (not committed): an import graph walked from `play.html`, `index.html` and both edge `index.ts` entries (static and dynamic imports), a scan for data keys no consumer names, and the catalogue's own `reachableSources()`, `obtainableItemIds()`, `skillConsumers()` called in Node. No SQL was executed, no mutation proof was run.

Severity: **P1** a player sees something false, or a rule is broken in a way that will bite soon. **P2** structural debt. **P3** style.

## Findings

| ID | Sev | Rule | Where | Finding | Smallest correct fix, lane |
|---|---|---|---|---|---|
| S1 | P1 | Formulas are public, one data source (Tyler 11-08); §7 data in `src/data` | `src/core/combat.js:41`, `src/data/balance-sheet.js:241-244`, `src/core/xp.js:24`, `supabase/functions/hr-accrue/catalogue.js:306,323`, `src/data/shops.js:612-640` | The combat, curve and sale formulas live in four kinds of home (data, core, edge, a doc row) and two are restated with a pin test | One formula module in `src/data` read by core and edge, restatements deleted. Lane B, designer signs the numbers |
| S2 | P2 | One source of truth per fact | `src/data/items.js:17-19,244`, `library2-items.js:269` vs `stonecraft.js:178`, `core/bane.js:84` vs `data/monster-classes.js:61`, `core/artisan-sim.js:642` vs `data/item-authority.js:95`, `data/hunt-tiers.js:51` + 5 tools | 28 item rows written twice (spread order picks the winner, values differ), two `MONSTER_CLASSES`, two copies of one switch, "who a ground is for" derived six times with two defaults | Delete the losing copies, export `fitOf` from `hunt-grounds.js`. Lane B |
| S3 | P2 | Zero debt, no bolt-ons; cut systems leave no engine | `hr-accrue/index.ts:1004-1020`, `accrual.js:1334`, `core/away.js:32,81-86`, `hunt-settle.js:576-579`, `core/index.js`, `world/beat.js` | The crew engine, the collection counter, the away scope table and the bestiary relic seam still run (or read) every settle for systems with no door, no consumer or no server half | One cut lane: delete the dead paths with their tests, edge redeploy. Bestiary relic: designer picks build or remove. Lane B |
| S4 | P2 | §1 no back-compat shims | `data/recipes.js:4-7`, `core/artisan.js:91-101`, `core/farm.js:215-220`, `data/item-authority.js:95,163,250` | Two recipe dialects kept for the deleted `legacy.js`, a save-shape repair for pre-b220 saves, migration-era `*_ARM_ENABLED` switches | Convert 25 `input:` rows, delete both branches, fold the switches. Lane B |
| S5 | P2 | §3.5 every item has a source; §10 no mass generation, no filler names | `data/catalogue-coherence.js:122` (AWAITING_ROSTER), `UNREACHABLE`, `data/monsters.js`, `data/hunts.js:73-90`, `data/bosses.js` | 247 of 582 items no player can reach (31 named Void, Shadow, Dark, Ancient, Abyssal), 102 of 144 monsters on no ground, 3 groundless hunts generated into `hr_hunts` as open | Designer cut lane (§3.3b: old content may be cut freely), then regenerate catalogues. Lane C for the catalogue apply |
| S6 | P2 | No unread data (the `weaponResist` class) | `data/monster-classes.js:65-127,156-158`, `data/bosses.js` resist/mechanic, `data/items.js` foodTier/cookedFrom, `data/gear-tiers.js` lvOff, 700 `icon:` emoji in 16 data files | Fields a designer reads as rules that no engine or screen reads | Delete, or wire through the one damage expression as a percent (designer call for weaponResist). Lane B |
| S7 | P2 | §7 assets through the manifests, §10 one art style | `assets/icons-bundle/{hearthfire,painted,backgrounds,resources,buildings,medieval}`, `data/item-art.js:93-330,339`, `data/monster-art.js:47-183`, `tests/run-smoke.mjs:477`, CLAUDE.md §7 | 636 old-style files (25.8 MB) no client loads, still manifested and guarded, one switch from coming back. CLAUDE.md §7 points new icons at the dead folders | Asset lane deletes the painted set and its manifest halves. Coordinator corrects §7 to `pixel/`. Lane B |
| S8 | P2 | §7 no monolith, data is data | `tests/client-module-size.mjs:22`, `world/render/canvas-backend.js` (649), `hr-accrue/accrual.js` (2,779), `data/hunt-tutorial.js` (1,346) | The size guard skips `src/world` (already over), `src/core` and the edge. The tutorial is an engine plus text living in `src/data` | Add `src/world` to the guard, ratchet core and edge, split the coach out of the tutorial rows. Lane B |
| S9 | P2 | Text home (Tyler 11-07, approved system) | `shell/windows/farm.js:212`, lane/b-text-home 3219d1bb5 (unmerged) | Main has no text home. Sentences are glued from pieces with hand-rolled plurals, 2,112 player strings in code in 119 files by the lane's own count | Merge lane/b-text-home, move the next ten files from its list. Lane B |
| S10 | P2 | Config values, no hardcoded caps (10-17, slot max 4 since 11-08) | 160 `p_slot > 5` in 75 migrations, e.g. `2027-02-20-party-leader-starts.sql:57`, `hr-accrue/frame-self.js:29` | The hero-slot ceiling is typed into every RPC, and still says six | One limits row every body reads (check lane/b-scaled-hunts "four-hero-slots" covers every live body). Lane C |
| S11 | P2 | Each system in one home (feature switches approved 11-07) | `data/hunts.js` staged, `data/outfits.js:50`, `data/world/sandbox.js:24`, `core/trophies.js:79`, `data/item-authority.js` arms | Visibility is decided in at least five modules, each its own way. The switch table (lane/hr-flags-token) is not on main | Land the switch table, move these flags into it. Lane C then B |
| S12 | P2 | §3.6 guards earn their runtime, §4 every guard has a proof | 19 tests on cut or hidden systems, about 25 guards with no `--selftest`/`--mutate` (incl. `tests/core-purity.mjs`) | CI time spent proving code no player reaches, while the purity guard that protects the edge has no mutation proof | Delete those tests with the S3/S7 code, add `--mutate` to core-purity first. QA lane |
| S13 | P3 | Docs tell the truth | 144 references to deleted old-client files in 42 `src` files, e.g. `hr-accrue/catalogue.js:292`, `core/combat.js:3`, `data/items.js:564`, `data/hunt-grounds.js:101` | Comments describe mirrors and guards that no longer exist, and name `prototypes/hunt-sim` as the source of monster stats the formula now writes | Comment sweep inside the S3 cut lane |
| S14 | P3 | One generator per catalogue | `hr_unlock_offers` (4 generators), `hr_unlocks` (5), `data/hero-rename.js` + `2026-12-04-hero-rename.sql`, `2026-09-22-trophy-claim.sql:265` | Partitioned writers pinned by tests, two of them for cut or hidden ladders, and two money rules typed by hand into SQL beside their data twin | Fold the ladder writers into one per table once S3 removes the dead ladders, generate the rename rule. Lane C |
| S15 | P3 | Tools stay lean | `tools/` 100 top-level scripts, 21 named by nothing, 15 Recraft-era `art-*` plus `gen-art.mjs` (paid API) | The retired painted pipeline still sits beside the live `tools/world-art` | Delete the retired art tools. Lane B |

## Evidence by finding

### S1 (P1). The public formulas have no single data home

Tyler 2026-11-08: every formula "must be simple enough to publish, live in ONE data source, and carry no hidden special cases; build so the wiki can render formulas straight from the data."

- Combat constants are in core: `src/core/combat.js:41` `export const COMBAT_BALANCE = {` holds `playerBaseAccuracy: 0.55`, `monsterAccuracyPerPoint: 0.02` (:58), `monsterDamageScaleByTier: Object.freeze({ 3: 4.0, 4: 4.0, 5: 3.0, 6: 2.2 })` (:75), `critMult`, `critCap`. Also `WEAKNESS_BONUS` (:35), `ACC_DEF_MUL` (:89).
- The data copy restates them: `src/data/balance-sheet.js:241-244` `/* combat.js monsterDamageScaleByTier, restated: the formula divides the blow by it (a test pins the two equal). */ export const DAMAGE_SCALE_BY_TIER = ...` and `export const ACC_PER_POINT = 0.02;`.
- The 99-level capped curve is a literal table in core: `src/core/xp.js:24` `export const XP_TABLE = [`, while `LEVEL_CURVE` and `SKILL_CURVE` sit in `src/data/core-model.js`.
- Balance tables in core: `src/core/farm.js:30` `PLOT_TIERS` (deed costs), `:123` `REGROW_LIMITS`, `src/core/artisan.js:36-44` burn chances, `src/core/buffs.js:50` `BUFFS_DEF`.
- The sale formula is edge-only: `supabase/functions/hr-accrue/catalogue.js:306` `export const VENDOR_RAW_RATE = 0.20;` and `:323` `export const SHOP_BUYBACK_RATE = 0.5;`. Its own comment (:292) still says "the authority for it is `VENDOR_RAW_RATE` in src/legacy.js". Gear rates live in `src/data/loot-bands.js:75`. `src/data/shops.js:629-633` restates all of them as literals (`"VENDOR_RAW_RATE": 0.2`) under a `where` that names `src/screens/shop-counter.js`, which no longer exists. `tests/gold-intents.mjs:575` is a fourth statement (`ok(cat.VENDOR_RAW_RATE === 0.20`). Tyler named "sale rates" in the ruling.
- The code argues against the ruling: `src/core/elements.js:32` "Both live in the FORMULA, never in a data row". The same doctrine is in `src/core/bane.js`. This is a semantic conflict for CONFLICTS.md: clamps can stay as validators that fail closed at load, while the numbers move to data.
- Special cases a wiki must print: `balance-sheet.js:236` `GROUND_XP_FIT = { mill_cellar: 1.25, meadowbrook_thicket: 0.9, wickstead: 1.1 }` and `TIER_PULL_OVERRIDES` per-ground `dials` (:325-345, the Sewer's Deadly `xpPm: 1220`). They are named and reasoned, so they are not hidden, but each one is a line of wiki. Designer's call whether they stay.

Why P1: the wiki, and the next balance pass, will read `src/data` and miss or double-read these. Fix: one formula module in `src/data` (or `core-model.js` grown), imported by `combat.js`, `xp.js`, the farm, artisan and buff engines and the edge, with `DAMAGE_SCALE_BY_TIER`, `ACC_PER_POINT`, `DERIVED_PRICES.params` and the test literals deleted.

### S2 (P2). Two statements of one fact

- `src/data/items.js:17-19`: "the generated tier ladder ... is spread FIRST, so any hand-authored entry below with the same id wins and keeps its historical stats/values." Measured: 20 `GEAR_ITEMS` rows are overridden. `iron_sword` is `v:130` from the ladder and `v:200` by hand (`items.js:244`), `bronze_belt` 50 against 110. The spine says "One table drives every piece of tiered gear" (`gear-tiers.js:4`) and it does not.
- 8 ids are defined in both `library2-items.js` and `stonecraft.js`. `iron_whetstone` is `v: 55` at `library2-items.js:269` and `v: 3` at `stonecraft.js:178`. `rune_blank` 5 against 3. Spread order picks the winner.
- `src/core/bane.js:84` `export const MONSTER_CLASSES = Object.freeze([` (11 ids) beside `src/data/monster-classes.js:61` `export const MONSTER_CLASSES = Object.freeze({`.
- `COOKING_SETTLEMENT_ARM_ENABLED = true` is declared at `core/artisan-sim.js:642` and again at `data/item-authority.js:95` ("twin of artisan-sim.js COOKING_SETTLEMENT_ARM_ENABLED").
- "Who a ground is built for" is derived six times: `data/hunt-tiers.js:51` (default `'both'`), `tools/gen-ground-stats.mjs:66`, `tools/balance-sim/grade.mjs:93` (default `'solo'`), `sheet-check.mjs:28`, `plans.mjs:32`, `tools/balance-lab/lab-core.mjs:530`. Today `fit.solo` and `fit.both` hold the same numbers, so it reads equal. The day they differ, the grader and the engine disagree.
- `data/hunts.js:20-21`: "On a walked ground the weight IS the head-count of its packs". The same count is stated in `hunt-grounds.js` pockets and pinned by `tests/hunt-core/forest-cave.mjs`. The weight could be derived.

### S3 (P2). Engines still running for systems that are gone

- **The crew.** `2027-01-18-dead-surfaces-cut.sql` removed `hr_worker_hire` and the `workers` envelope key and says "No edge change." So `hr-accrue/index.ts:1004-1020` still runs `accrueWorkers({ ... crew: Array.isArray(env.workers) ? env.workers : [] ...})` on every accrue, `src/core/workers.js` (144 lines) and `accrual.js:2486+` stay, and `data/gold-ladders.js` still sells a `worker_hire` ladder through `gen-gold-ladders`.
- **The collection counter.** Collection milestones were cut 10-22. `accrual.js:1334` still writes `for (const op of collectionProgressOps(s.collection, events)) progress.push(op);` and no client file reads "collection". `core/goals.js:500-505` warns that overflowing the op bound "would HALVE THE SPAN, paying half the gold and half the XP to protect a collection counter".
- **The away scope.** CLAUDE.md §6: "there is no away mode and no second path". `core/away.js:32` `export const AWAY_RATE_MULT = 1.00;` and `:81-86` `AWAY_SCOPE` with every channel `true` (including `botd`) make `channelApplies` and `rateMult` identities, still called from `artisan-sim.js`, `buffs.js` and the edge.
- **The bestiary relic.** `hunt-settle.js:576-579` reads `env.account_bestiary.relic_mult` and `member.js:321` applies it. No migration of 618 creates `account_bestiary`, so it is always null. Tests plant `relicMults` by hand (`tests/hunt-live.mjs:336`). The 10-14/10-20 ruling (stages with a relic boost up to x1.25, a gold fee) has half an engine and no server.
- **Unreachable modules** (import graph from both entry points): `src/core/index.js` and `botd.js` (no importer), `src/data/skill-authority.js` (no importer), `core/charms.js`, `core/trophies.js`, `core/companion-xp.js`, `data/bestiary.js`, `data/bestiary-charms.js` (tests only), `src/world/beat.js` (tests only, and `beat.js:7`: "moved here from the old client's src/render/combat-observer.js").

### S4 (P2). Back-compat shims

- `data/recipes.js:4-7`: "legacy single-input recipes (`input: id, secondary: {...}`) stay in their original form because the runtime helper `getInputs(recipe)` in legacy.js handles BOTH shapes." `core/artisan.js:91-93`: "Two recipe dialects ship side by side". 25 rows still use `input:`.
- `core/farm.js:215-219`: "Legacy shape: a boolean flag ... kept because pre-b220 saves and old cloud snapshots still carry it." §1: no save migration.
- `data/item-authority.js:163` `INVENTORY_ARM_ENABLED = true; // LIVE since b454`, `:250` `FARM_SERVER_ARM_ENABLED`, `:95` the cooking arm: migration switches from the August cutover whose `false` branches are dead. `core/bane.js:75` `CLASS_ALIAS` (`beast: 'mammal'`) maps retired class names.

### S5 (P2). Dead content weight

- Items: `reachableSources()` reaches 335 of 582 items. `AWAITING_ROSTER` holds 142 ids "DEMOLITION (2026-10-14) ... Each id below has NO source today", `UNREACHABLE` holds 100 more (72 `later`, 18 `cut`: "dead weight, listed for a cut"). All 31 filler-named rows (Void Core, Shadow Pelt, Dark Sigil, Ancient Claw, Abyssal Pearl and others) are among them, so no player gets one. They ship in the client, the edge bundle and `hr_items`.
- Monsters: 102 of 144 rows sit on no open ground or hunt (`dark_wizard`, `void_mote`, `lesser_demon`, `hellhound` and others), the August mass-generated roster (`monsters.js:4` still says "108 monsters").
- Hunts: `bramble_edge`, `goblin_warren`, `ridge_camp` (`hunts.js:73-90`) have no ground and no `staged` flag, so they are in `OPEN_HUNTS` and `gen-hunts` writes them into `hr_hunts`. My reading (not executed): the settle refuses such a session with `no_ground` (`2027-02-10-party-instance-reset.sql:49`), so it fails closed, but the catalogue calls them open.
- `data/bosses.js` registers six dungeon bosses (dungeons are paused), `boss-forge.js` and `champions.js` feed `ITEMS` for the same.
- Drops ahead of their engine: 45 reachable imbuement drops and the two boss trophies have selling as their only use (`catalogue-coherence.js` `VENDOR_TRASH`: "SHRINK these when the imbuement recipes land"). Sanctioned by the designer, but the imbuement half of the 10-14 drop ruling is unbuilt.

### S6 (P2). Fields nobody reads

`weaponResist` (28 rows, `monster-classes.js:65-127` and `monsters.js`) is still data after v0.2.108 removed its false line. `bosses.js` says of its own `resist`: "unread by the engine and shown nowhere". `monster-classes.js:156-158` `gpLo`/`gpHi` (10 rows) were superseded by `STAT_FORMULA.gp`. `items.js` `foodTier` (22) and `cookedFrom` (6), `gear-tiers.js` `lvOff` (11): no reader outside `src/data`. 700 `icon:` fields hold emoji across 16 data files (items 276, monsters 144, recipes 80, gathering 67) and no client, edge or generator reads `icon`. The Professional Standard says "No emoji as art anywhere". Today they are unread, and one renderer would put them on screen.

### S7 (P2). The old art style is still manifested

The client draws items only from `PIXEL_DIR` (`shell/widgets/bits.js:84`). Tracked files no `src` code, CSS or page references: `hearthfire/` 488 files 19.5 MB, `painted/` 102 files 2.6 MB, `backgrounds/` 13 files 2.1 MB, `resources/` 21, `buildings/` 10, `medieval/` 2. The live `pixel/` set is 647 files, 0.4 MB. `item-art.js:93-330` and `monster-art.js:47-183` still manifest the painted set (`SHIPPED`, `REJECTED_WRONG_SUBJECT`, `wiredIconMap`, used by nothing in `src`), `tests/run-smoke.mjs:477` reconciles it against disk, and `item-art.js:339` `export const ITEM_ART_SET = 'pixel';` is guarded by `tests/pixel-icons.mjs:137` to be `'pixel'` or `'painted'`, so the banned style is one edit away (Tyler 10-18: never mix art styles). CLAUDE.md §7 says new icons go in `buildings/ monsters/ resources/ medieval/`: there is no `monsters/` folder, and `pixel/` is the only live one. The CLAUDE.md line is the Coordinator's to fix.

### S8 (P2). Monolith and layer gaps

`tests/client-module-size.mjs:22` `CLIENT_DIRS = ['src/app', 'src/session', 'src/shell', 'src/net', 'src/render', 'src/hunt-view', 'src/social']` leaves out `src/world`, where `render/canvas-backend.js` is 649 lines (cap 600). Nothing measures `src/core` (`artisan-sim.js` 731) or the edge: `accrual.js` 2,779, `index.ts` 1,473, `intents.js` 1,391, `tick.js` 1,384. Three client files sit at 588-595. `src/data/hunt-tutorial.js` is 1,346 lines with about 300 arrow functions and 118 `if`s: the coach engine (`currentCard`, `cardFor`, `nextGoal`, `judge`) and its sentences live in the data layer.

### S9 (P2). Player text still glued in code

`src/shell/windows/farm.js:212` builds one sentence from 14 pieces: `'Tier ' + lv + ' grows ' + grows + '.' + (up ? ' Tier ' + up.level + ' adds ' + adds + ': ' + gold(up.gold) + (up.deeds ? ' (or ' + whole(up.deeds) + ' Farmer\'s Deed' + (up.deeds === 1 ? '' : 's') + ')' ...`. Main has no `src/data/text` and no `src/render/player-text.js`. lane/b-text-home (3219d1bb5) builds both and moves Farm, House, the Hunts list, All characters, the bar and item lore. Its baseline still counts 2,112 player strings in code across 119 files. The ten worst: `game-master-body.js` 67, `market/sell.js` 58, `tally.js` 55, `inventory/actions.js` 51, `market/browse.js` 51, `hunt-go.js` 50, `market-model.js` 47, `town-work.js` 45, `widgets/analyzer.js` 45, `character/sheet.js` 45.

### S10 (P2). The slot ceiling is typed into every RPC

Rulings: "Start/max/prices are config values" and, 11-08, max 4 heroes. The live `hr_hunt_enter` (`2027-02-20-party-leader-starts.sql:57`) has `if p_slot is null or p_slot < 0 or p_slot > 5 then`. The pattern appears 160 times in 75 migrations, and the edge has its own `const MAX_SLOT = 5;` (`hr-accrue/frame-self.js:29`). lane/b-scaled-hunts lists a "four-hero-slots" fix. Confirm it moves every live body to one limits row rather than restating 5 as 3.

### S11 (P2). No home for feature switches on main

Visibility is decided per module: `hunts.js` `staged`, `outfits.js:50` `HERO_DYES_SHOWN = true`, `world/sandbox.js:24` `open: true` (visible by Tyler's 10-24 call, closes at the reopen gate), runes' hidden Air family, `core/trophies.js:79` `TROPHY_DAMAGE_ARM_ENABLED = false`, the `item-authority.js` arms. The approved switch table (systems roadmap 11-07, lane/hr-flags-token) is unmerged.

### S12 (P2). Tests on dead code, guards without proof

19 test files guard cut or hidden systems: the four `clan-*` tests (doors cut by `2027-01-18-dead-surfaces-cut.sql`, `clan-journal-guard` still runs in CI at `smoke.yml:4431`), `worker-accrual`, `bestiary-trophy`, `trophy-call-sites`, `trophy-wire-shape`, `bestiary-ladder` (test-only modules), `goal-counters` (the collection counter), `world-hunt.mjs` (`beat.js`), `gem-daily-budget` (gems were replaced by Crowns), five `companion-*` (hidden by ruling, so these stay until the redesign). About 25 standing guards carry no in-file `--selftest` or `--mutate`, including `tests/core-purity.mjs` (the guard that keeps `src/core` importable by the edge), `cors-preflight`, `jwt-verify`, `items-catalogue`, `eat-intent`, `rpc-gate-bucket-guard`, `leaderboard-lockdown-guard`. `tests/guards-unregistered.json` names the 19 tests no runner calls, with reasons, which is the right shape.

### S13 (P3). Comments that describe a codebase that is gone

144 references to deleted old-client files or APIs (`legacy.js`, `src/features/`, `src/screens/`, `window.getBonus`) in 42 `src` files. Several claim a guard or mirror that no longer exists: `catalogue.js:292-297` ("tests/gold-intents.mjs reads BOTH the rate and the formula out of legacy.js's `vendorPrice()`", the test now says the opposite), `combat.js:3` "AUTHORITATIVE; legacy.js delegates here", `items.js:564` "Keep both this file and legacy.js's NEW_ITEMS aligned until legacy.js's block is deleted". `hunt-grounds.js:101` says monster stats "are the hunt sim's measured rows (prototypes/hunt-sim/BALANCE_RULINGS.md)", but `gen-ground-stats.mjs` writes them from `STAT_FORMULA` now, and §7 says prototypes are never a source.

### S14 (P3). Catalogue writers

Every generator has a `--check` that CI or the `run-smoke` preflight runs. Two tables have several writers partitioned by a `source` column (`hr_unlock_offers`: gen-companion-unlocks, gen-gold-ladders, gen-temper, gen-unlock-offers; `hr_unlocks`: those plus gen-companion-grants and gen-unlocks), pinned by `tests/unlock-offer-ownership.mjs`. Two money rules have no generator and are typed into SQL beside their data twin with a test: the rename price (`data/hero-rename.js`, "tests/hero-rename.mjs holds the two equal") and the trophy stages (`2026-09-22-trophy-claim.sql:265` `c_at constant bigint[] := array[2500, 5000, 10000, 20000];`).

### S15 (P3). Tools

100 top-level scripts in `tools/`. 21 are named by no workflow, test or tool. The `.local` CLIs are entry points by design, but the Recraft-era `art-alpha-map`, `art-bg-probe`, `art-contact-sheet`, `art-wave1-select`, `art-wave2-emit`, `art-wave2-resolve`, `art-wave2-subjects`, `brand-process`, `gen-review-book`, and `gen-art.mjs` (Recraft API, spends on `--confirm`) serve the retired painted style.

## Done well

- §5 holds: `bump-version.sh --check` exit 0 (every page and ESM import at `?v=0.2.108`), and a scan of every `src` import found 0 bare relative specifiers.
- `src/core` is pure: `tests/core-purity.mjs` exit 0 (no DOM, no clock, no randomness, imports in plain Node).
- `src/legacy.js` is gone and nothing under `src` imports `icons3/`, `raw-bundle/`, `.legacy/` or `prototypes/`. No new `.md` landed on main since the 11-03 re-root.
- The difficulty tiers are the model to copy: one table (`balance-sheet.js` `TIER_DIALS`), derived rows (`hunt-tiers.js`: "Never type a tier number here"), one generator (`gen-ground-tiers --check`) into `hr_ground_tiers`. Monster combat stats are generated from `STAT_FORMULA` with `FORMULA_EXCEPTIONS` empty.
- `hr_items` has one authoring path (`gen-catalogues`), and its derivation was moved to `tools/catalogue-rows.mjs` so the drift guard does not restate it.
- The shell registries are one row per surface (`shell-windows.js`, `hud-widgets.js`, `settings.js`), paired with renderers by `tests/shell-renderers.mjs`. Panels are one component as a window or a sheet, with no separate phone components.
- `catalogue-coherence.js` derives sources, uses and consumers instead of listing them: every skill has a consumer and every reachable item has a use, with shrink-only exception lists.
- The client renders one art style for items (`pixel/`), and world art goes through `tools/world-art` with the palette lock. `HUNT_ART_ALIAS` is the one place a kind becomes a sprite.
- The client reads sale prices from the server (`shell/windows/shop.js:155` `st.shop.bids`), so S1's sale formula split does not reach a player's screen.
- In-flight systems each land in one home: `src/data/grounds/` (lane/b-ground-pack), `src/data/text/` with `src/render/player-text.js` (lane/b-text-home), `src/data/live-events.js` with `src/core/live-events.js` and `src/data/scaled-hunts.js` (one stack: lane/c-scaled-hunts inside lane/c-live-events inside lane/b-scaled-hunts, all editing the same nine engine and edge files, so only the top of the stack should merge).

## Systems map (main at 0c0196bf0)

| System | Data | Core | Session | Shell | Server | Flag |
|---|---|---|---|---|---|---|
| Hunts and grounds | `hunts.js`, `hunt-grounds.js`, `hunt-tuning.js`, `hunt-sessions.js` | `combat-sim.js`, `hunt/*`, `hunt-spawn.js` | `hunt-sections`, `hunt-poll`, `hunt-leave` | `hunts`, `hunt-detail`, `hunt-go`, `hunt-list` | `gen-hunts`, `gen-hunt-sessions`, edge `hunt-settle` | spawn weights restate pockets, `fitOf` x6 (S2), 3 groundless hunts (S5) |
| Difficulty tiers | `balance-sheet.js` TIER_DIALS to `hunt-tiers.js` | read in `hunt/damage.js` | | Hunts picker | `gen-ground-tiers` | one home |
| Monster stats | `balance-sheet.js` STAT_FORMULA to `monsters.js` rows | | | | `gen-ground-stats --check` | one home, per-ground fits to rule on (S1) |
| Combat formula | `core-model.js`, `balance-sheet.js` (restated) | `combat.js`, `mitigation.js`, `elements.js`, `bane.js` | | | edge imports core | **two homes** (S1) |
| Level and skill curves | `core-model.js` LEVEL_CURVE, SKILL_CURVE | `xp.js` XP_TABLE | | | `gen-level-curve` | **two homes** (S1) |
| Items | `items.js` plus 11 feeder files | | `item-sections` | `inventory/*`, `item-tip` | `gen-catalogues` to `hr_items` | rows twice (S2), 42% unreachable (S5) |
| Loot and sale | `loot-bands.js`, `imbuements.js`, monster drops | `drops.js`, `shop-buyback.js` | | `shop` (server bids) | edge `catalogue.js` vendorPriceOf | **two homes** (S1) |
| Supplies and store | `supplies.js`, `supply-basics.js`, `consumables.js`, `drinks.js` | `hunt/consumables.js` | | `configure-action`, `shop` | `gen-hunt-sessions` | one home per layer |
| Action bar and conditions | `abilities.js`, `condition-metrics.js`, `rule-subjects.js` | `hunt/conditions.js`, `action-rules.js` | `preset-intents` | `widgets/action-bar`, `configure-action`, `bar-*` | preset RPCs | one home |
| Party | `party.js`, `party-class-xp.js`, `party-words.js` | `party-split.js`, `hunt/xp-share.js` | `party-sections`, `party-intents` | party windows and widgets | `hunt_parties` | one home |
| Crafting | `recipes.js`, `stonecraft.js`, `slot-ladders.js`, `style-gear.js`, `bench-tax.js` | `artisan.js`, `artisan-sim.js`, `bench-tax.js` | `bench-sections` | `work`, `town-work` | edge `tick-artisan`, `gen-bench-tax` | dialect shim (S4), burn rates in core (S1) |
| Gathering | `gathering.js` | `skill-sim.js` | `town-intents` | `skills`, `work` | edge `tick-gather` | one home |
| Farming | `gathering.js` CROPS | `farm.js` PLOT_TIERS, REGROW_LIMITS | `farm-sections`, `farm-intents` | `farm` | shared farm SQL, `gen-farm-catalogues` | data in core (S1), save shim (S4) |
| Tempering | `temper.js` | `temper.js` | `temper-sections` | `temper-pane` | `gen-temper` | one home |
| Jewelry | `jewelry.js` | `artisan.js` | `jewelry-sections`, `hallmark-intents` | `hallmark-pane` | `gen-jewelry` | one home |
| Gold sinks | `gold-sinks.js`, `titles.js`, `town-works.js`, `hero-rename.js`, `stamina-refill.js`, `blessings.js` | | `title-intents`, `town-intents` | `havora/*`, `services`, `sink-words` | `gen-gold-sinks`, `gen-title-catalogue`, `gen-town-works`, `gen-alpha-catalogue` | rename rule hand-typed in SQL (S14) |
| Hearth and Inner Flame | `hearth.js`, `core-model.js` FLAME_* | `vitals.js` | `hearth-intents` | `havora`, `world/hearth-burn` | `gen-hearth-catalogue` | one home |
| Tally tasks | `tally-tasks.js` | `hunt/tally.js` | `tally-*` | `tally`, `widgets/tally-hud` | `gen-tally-tasks` | one home |
| Bestiary | `bestiary.js`, `bestiary-charms.js` (tests only) | `charms.js`, `trophies.js` (tests only), relic seam in `member.js` | none | none | `trophy-claim.sql` stages typed, no `account_bestiary` | **no working home** (S3) |
| Market | none | none | `market-intents`, `market-gesture` | `market/*` | market-v2 SQL | server-owned, one home |
| Premium | `premium.js` | | | | `premium_until` | one home |
| Workers (crew) | `gold-ladders.js` worker_hire | `workers.js` | none | none | doors cut, edge settle still runs | **dead, two halves left** (S3) |
| Goals and collection | | `goals.js` | none | none | edge writes `ev:loot:*` rows | **dead writes** (S3) |
| Away scope | | `away.js` (identity) | | `town-ticker` | edge | retired concept (S3) |
| Companions | `companions.js`, `companion-unlocks.js` | `companion-perk.js`, `companion-xp.js` | none | none | companion SQL, edge catalogue | hidden by Tyler's 10-22 ruling |
| Tutorial | `hunt-tutorial.js` (rows, engine and text) | | `tutorial-sections` | launcher coach | | **logic in data** (S8) |
| Windows, HUD, settings | `shell-windows.js`, `hud-widgets.js`, `settings.js` | | `residue.js` | `renderers.js` | | one home |
| Refusal words | `refusal-words.js` | | `refusal.js` | `intent-words` | | one home |
| Art | `item-art.js` (pixel half live, painted half dead), `monster-art.js`, `world/art-budget.js`, `world/palette.js` | | | `widgets/bits` | `tools/world-art` | **two styles manifested** (S7) |
| Player text | none on main | | | 2,112 strings in code | | **no home on main** (S9), lane/b-text-home |
| Feature switches | scattered flags | | | | `hr_flags` on lane/hr-flags-token | **no home on main** (S11) |
| Ground pack | `src/data/grounds/` on lane/b-ground-pack | | | | | in flight, one home |
| Live events, scaled hunts | `live-events.js`, `scaled-hunts.js` on lane/c-live-events | `live-events.js` | | | | in flight, one home each |
| Coverage bot, economy watch | `tools/qa` (lane/b-coverage-bot), lane/r-economy-watch | | | | `player_ledger` reads | tooling, in flight |

## Limits

Not verified: no SQL ran, so S5's groundless-hunt behaviour is read from the settle's refusal list, not played. No mutation proof ran, so S12's "no proof" means none in the file (a proof driven from outside, such as `tools/mutant-gate.mjs` with anchors, would not show). The unread-field scan is a name search: a field read through a computed key would show as unread, so each S6 row was checked by hand before listing.
