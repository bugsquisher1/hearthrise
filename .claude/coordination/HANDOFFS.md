# Handoffs

### 2026-11-10 · SYSTEMS (lane/b-slake-and-ford, resumed for the Ford) → COORDINATOR, DESIGNER, ART, lane/a-import-slake-art · the Ford opens with the Slake
The board, "Resumed for the Ford alone", under "2026-11-10 Hask's Ford and the Slake on one difficulty", has the numbers.
1. **Coordinator, the ship plan changes:** open the Ford WITH the Slake (or after it). Opened alone a sword alone at 45 nets +5% over its bill (its sword is tier 3: the tier-4 swords drop only at the Slake); with the Slake it's +45%. Check it with `node tools/pack.mjs check hasks_ford --mode full --with the_slake`. The curve re-fit from 45 (the designer's item 2 below) still goes with the opening.
2. **Every pack lane:** `pack check` now grades a staged pack as it ships (its own drops on the gear ladder), `--with <ground>` adds a pack that ships with it, and a re-run after a data change sets the old cells aside instead of grading them. A lane that measured "as opened" by flipping `status` by hand no longer needs to.
3. **Art, still owed for the Ford (no generation made here):** the `toll_token` icon (`tests/pixel-icons.mjs`), and a March tree for the six gather oaks (`[kit] hasks_ford places oak` once open). A no-art way out for the designer: a gather node kind on `westwood_ash`, which is in the March kit, with a spent sprite from the kit.
4. **Coordinator, copy:** `tools/player-read.local.mjs` now lists ground pack lines (`pack.<id>.*`). The Ford's were rewritten to the 11-11 voice rule and need a fresh reader. The board's living-world table still says "The foot were too many" and "the rite" on the Pyre Field row (lane/b-pyre-field's).
5. **lane/a-import-slake-art:** the Slake's pack files are untouched except the `?v=` on its two imports (main's 0.2.116, needed for `bump-version --check`).
6. **Every lane carrying a staged pack:** eight guards compared src/data (which folds staged packs) with the chain or the served world and went red on any branch with a pack: catalogue-literal-drift, catalogue-regrow-limit, core-curves, core-loop, gold-intents G16, hunt-tiers-db, live-settlement SETTLE-1c, and run-smoke's S5 (items-catalogue). Each now reads the chain end's view (`tools/pack/whole.mjs`, a script) or leaves a staged pack's own rows out (a module run-smoke imports). A new guard of that kind does the same.
7. **Coordinator, reds on this branch that are not this lane's:** char-wipe-world (expects two starter slots; slot 1 stopped being one in v0.2.113), lifetime-facts-reapply and live-hash-drift (the merged lanes' staged files), run-smoke's edge payload line (deploy pending), instant-press (`ERR_NO_BUFFER_SPACE` under load), hunt-carry-race and town-shows-race (no PostgreSQL 17 on this PC). `run-ci-local` was stopped and never run (16 Chromes).

### 2026-11-10 · ASSET DIRECTOR (lane/a-import-ford-art) → DESIGNER, COORDINATOR, ART DIRECTOR, SYSTEMS · Hask's Ford art is in, the pack is still staged

Imported: sets `march` (14 hf_ kit props, 4 bodies with the approved breathing idles) and `ford` (the painted ground, hf_toll_stone, hf_ford_marker), the icons `pike_band`, `ford_weed`, `ledger_leaf`, the alias `ledger_wight` > `wight`. The hf_ props stand on the designer's tiles and the mask hash is 0ebf56a5. Screens: `art/review/ford-import-2026-11-10/`.

1. **Designer, one blocker to opening:** the six gather oaks. With the pack opened in a working tree, `tests/world-assets.mjs` reads ONE red: `kit: [place] hasks_ford places oak`. A gather node draws its node kind's sprite (`oak_tree` > `oak`, `tests/hunt-core/forest-cave.mjs` gather-nodes), so I cannot swap the object alone. It needs a March tree node kind (a `src/data/gathering.js` row and a `hunt-grounds.js` kind on `westwood_ash` or a March tree), or the Ford's gather list re-aimed. The Slake's four oaks are the same case.
2. **Designer, a prop swap I made in your map row:** `crates` at 24,9 (not in the March kit, a [kit] red on open) is now `hf_stores_heap`, the kit's own stores wreck. Same tile, same blocking, hash unchanged.
3. **Designer / Art, the second blocker:** `toll_token` has no icon. Played open on the local world it is the one 404 of the session (`assets/icons-bundle/pixel/items/toll_token.png`), and `tests/pixel-icons.mjs` stays red on it and on the Slake's four. The three imported icons came off the palette (401, 490 and 701 pixels) and were locked to it here with the build's own snap, no pixel moved.
   - **Art Director, two reads, neither blocks:** `pike_band` reads as a red cloth armband where the text says an iron band off a pike shaft. `banded_pikeman`'s corpse facing n reads as kneeling, not lying (`bodies-corpses.png`, row 1, third).
   - **Designer:** the Hunts window calls the Ledger Wight "rare" where the pack row says uncommon (`01-hunts-window-ford.png`). Not art, yours to read.
   - **Coordinator:** `tests/module-preload.mjs` is red on this base before my change (the four `src/data/grounds/**` files are not in the preload block). Left alone.
4. **Art Director + Systems, hit clips:** the approved hit batches (`origin/lane/a-gen-2026-11-08b`, `art/world-src/gen-2026-11-08b/<id>-hit`, the Ford's four among them, and from the M4 sample the wight's death se and the fordsunk's hit ne) are not imported. No live creature carries a hit clip, `port-pixellab.mjs` has no step for one, and the sidecar's fall is four cardinals. That is one lane for every ground, not the Ford's.

### 2026-11-10 · GAME DESIGNER (lane/b-slake-and-ford) → COORDINATOR, ART LANES, SYSTEMS · Hask's Ford and the Slake, two staged packs

The numbers and rulings are on the board, "2026-11-10 Hask's Ford and the Slake on one difficulty". Both packs are STAGED: nothing is listed, served or generated.

1. **Coordinator, to open a ground** (in this order, one ground at a time): the art import below, then `node tools/pack.mjs ship <id>`. It runs the four covered generators with the pack folded in (`gen-hunts`, `gen-hunt-sessions`, `gen-catalogues`, `gen-ground-tiers`), writes the pack's ONE additive file and its apply-order line, and opens the pack. Then each of those four with `--check` (current with the pack unfolded), `node tests/ground-pack.mjs`, `node tests/schema-drift.mjs`, `node tests/restore-census.mjs` (re-pin its counts). NOT covered by ship and not run here: `gen-tally-tasks` (Tamsin's Tally row for the ground) and `gen-scaled-hunts`. No forward file of any kind was written in this lane.
2. **Coordinator, the Ford only, a world move:** opening it sends a lone hero at 45-49 to the Ford at about 250k Level XP an hour, where the pace of record reads 105-107k. Re-measure the pace (`node tools/balance-sim/sim.mjs --plan pace` and `--plan ladder`), re-fit the curve from 45 up (`node tools/balance-sim/pace.mjs --fit --fit-from 45 --write`, which re-pins `tools/balance-sim/level-pace.json`) and write the curve's forward file (`node tools/gen-level-curve.mjs`). Computed, not played: Level 50 falls from 170 h to about 145 h without it. The Slake moves no Level.
3. **Art, the March merge first** (yours since 11-07, item 2 of the region kits handoff): both grounds need it. Then per ground:
   - **Hask's Ford.** Drawn, not imported (`origin/lane/b-hasks-ford-art`, `art/world/march`): `hasks_ford_ground`, the four bodies (`banded_pikeman`, `fordsunk`, `wight`, `bannerman`), 16 `hf_` props, and the icons `pike_band`, `ford_weed`, `ledger_leaf`. Generated and approved, not imported (`origin/lane/a-gen-2026-11-09`, briefs 10 and 13): the four bodies' idles in 8 facings, their hit clips, the wight's death se, the fordsunk's hit ne, the bannerman's island pass. Not drawn: the `toll_token` icon. At import: put the `hf_` props back on the tiles listed in `src/data/grounds/hasks_ford/map.js`, re-pin its `maskHash`, swap the six oaks for a March tree, and add one alias in `src/data/monster-art.js` `HUNT_ART_ALIAS`: `ledger_wight` > `wight`.
   - **The Slake.** Generated and approved, not imported (the same lane, briefs 09, 10, 13): the `mudlark` (rotations and all clips), `sl_grounded_barge` (footprint 10x5) and its spill (`sl_grounded_barge_coal`, `_spar`, `_pitch`, `_plank`), the stake nets (`sl_stake_nets`, `_torn`, `_snag`, `_end`), the river props (`mr_mooring_post`, `mr_eel_trap`, `mr_silt_stain`, `mr_silt_stain_small`, `mr_silt_ripples`, `mr_greened_shield`), the copper silt terrain and its three pairs. Not drawn: the three re-pours (`greened_pikeman`, `bargeman`, `color_sergeant`, scripted from the Ford's bodies), the painted ground `the_slake_ground`, and the icons `green_rivet`, `barge_nail`, `mudlark_hook`, `color_cord`.
   - `tests/pixel-icons.mjs` is RED on this lane until those 8 icons land (an item row needs its icon the day it lands).
4. **Systems, three small asks.** (a) A pack field for a named Hearth fuel (`src/data/hearth.js` `NAMED_FUELS`): the Ford's Company Colors, the Slake's Barge Pitch and the Muster's fuel all wait on it. (b) `weaponResist` is still read by no engine: every "a blade skates off" line is the bestiary's words only. (c) When these grounds open, `tests/hunt-core/hunt-tiers.mjs` ladder gets their pairs read tier for tier (the board says why the old rule can't hold five Levels apart).
5. **lane/b-area-set:** the Bargeman's Cold Bilge is the only spell row these two grounds wait for. When it lands the Slake's harder tiers are measured again. No Ford body has a spell designed.
6. **How these were measured, for the next ground:** a foreground run is fast and a background one is throttled to about a tenth, and so is any cell longer than a few seconds. The grader's full grid played as 1-hour cells (the job's `seedBase` gives each its own seed) took about 10 minutes a ground in the foreground. `--mode full` did not finish.

### 2026-11-07 · ART DIRECTOR (lane/a-region-kit) → GROUND PACK (lane/b-ground-pack), GENERATOR, IMPORT LANES · the region kits

1. **Kits are data now:** `src/data/world/region-kits.js` (greenhaven: 3 tile families, 65 props, 27 bodies, 5 signatures; barrow_march: 8 terrains in 13 pro tilesets, 41 props, 5 bodies, 5 signatures, 14 pending). `tests/world-assets.mjs` rule [kit] (`tools/world-art/region-kit.mjs`) holds every hunting map to its kit: a new ground is claimed by one kit, places its props plus at most 2 signature pieces (a signature covers its `<id>_*` variants), never another ground's. `pack new --region` and `pack-distinct`'s "signature" check should read this file, not a second list.
2. **Phase 0's March merge:** rebuild both sets (they are RGBA: [sheet-encoding]); split so a kit ground never downloads another's floor: `march` = the kit (hf_ + mu_ shared props, the 5 bodies), `ford` (hasks_ford_ground, hf_toll_stone, hf_ford_marker), `muster` (its ground, mu_barrow_door, captain_hask), `slake`. The six bodies need idles first ([live]): brief 02.
3. **The Ford's import:** its brief places 4 `oak`; the kit leaves oak out (read 11-07, trees.png): swap to westwood_ash or mu_dead_hawthorn.
4. **Generator:** `art/briefs/gen-2026-11-07/00-plan.txt` (2,100 gens ranked) and briefs 01-05. Raw output to `art/world-src/gen-2026-11-07/<asset>/`; I read every result before import.
5. **Read a kit with the real renderer:** `tools/qa/region-kit.html` (map= or ground=, extra= unshipped sets from a folder, props=, units=, board=<kit>), served from the worktree root.
6. **Correction to my handback ("lane-done still running, 0 red"):** it finished after the handback, cut by my 900 s timeout (exit 124). Its fixed guards were all ok; its scoped proofs (base set/v0.2.105, so 287 arms over the whole v0.2.106 diff, none on this lane's files) went RED on `catalogue-regrow-limit --mutate` (0.2 s), `buff-queue --selftest` (clean baseline not green) and `auth-lock --mutate` (575 s) while four lanes shared the PC. Re-run alone: `catalogue-regrow-limit --mutate` exit 0 (2/2 caught); `buff-queue --selftest` printed "CLEAN baseline GREEN" and every mutant it reached CAUGHT before my 300 s cap cut it (no exit code, so not claimed green); `auth-lock --mutate` not re-run. Read them as load reds until a quiet run says otherwise; none touches this lane's files.

### 2026-10-31 · ART DIRECTOR (lane/a-phone-reach) → lane/b-first-hour-styles (owner of src/data/hunt-tutorial.js) · tutorial words a phone cannot follow

Left alone as briefed. On a phone: "Hunt together" (hunt-tutorial.js lines 220 and 802) says "Right-click (long-press on a phone) X's tab", and at 667 px there are no tabs: the route is Heroes, then Invite on the hero's row. Coach lines also name keys a phone lacks ("open the Farm (J)"). Semantic overlap to check on merge: your "cards that stand aside" against this lane's phone placement (town card at the left, `--coach-room` capped by the alert, `.is-short-room`, one alert at a time).

### 2026-10-25 · ART (lane/b-hearth-art) → MAP/BUILD LANE (L1, L4) and DESIGNER · Hearth Square art staged, on no map

44 sprites and terrains in `art/world/common` (built into atlas-common), each sidecar's notes say where it sits. `great_hearth` (class landmark, footprint 11x4, anchor bottom-centre); `hearth_fire` (8@8 loop) over it at hearth px (146,238); a fuel landing plays `hearth_flare` (6@10, at 151,228) and `hearth_burn_sparks` (8@12, at 136,232); a `fuel_<family>` chunk flies from the hero's hand to hearth px (176,262) in ~300 ms on a ~26 px arc; `*_verdigris` = the named-fuel colour sample (swap fire, flare and sparks, and the point light tint); the glow = a map point light (tint `hearth`) at the firebox, r ~16 tiles plus ~8. Paving: `square_plaza` (painted 24x24, rings centred on local tile 11.5,12.5 = the hearth front) inside a kerb course of `square_grass_flag` / `square_dirt_flag` (wang16). Ring: `square_general_store`, `square_depot`, `square_bank`, `square_barracks` (class hall), `square_market_stall`, benches, 11 wear decals. Samples: `mine_mouth`, `ore_copper_rock`, `ore_coal_rock`, `rune_block`, `westwood_ash`, `westwood_yew`, `fishing_pier`. Designer: DISCOVERIES 2026-10-25 (the depot faces away from the square; store and barracks lots overlap).

### 2026-10-25 · SYSTEMS (lane/b-tutorial-rings, tutorial lane 2) → COORDINATOR / DESIGNER / ART · what shipped and what is left

1. **Interface live:** `coachFactsOf(cs, account)` (src/shell/launcher.js) passes read / roster / slotsOwned / playLimit (`AccountSession.statedLimit()`, never a fallback) / sellable (`bag-model.js lootSale`, the button's own plan) / upgrades into `pointerCardOf`; the residue `coach.read` holds Got it presses and read-on-sight cards (`noteCoachSight`, the display tick). `ringPlan` rings `card.hooks` deepest first for every other anchor; the characters screen rings Create hero itself (boot.js `ringCharacters`).
2. **Services is the Shop's third tab** (Tyler 10-25): window row gone, `tabKeys: { r: 'services' }` on the Shop (window-manager.js `openTab`/`takeTab`), services.js is now the tab's pane; Blessing cards ring Shop icon -> Services tab -> next Bless; the death popup has a Blessings button there. The stamina-low card rings the bar lane's new `+` (`data-coach-hook="stamina-buy"`).
3. **Designer, decide:** "Sell all loot" now keeps a material a recipe the hero can make NOW spends (Silk Thread at Crafting 1, Copper Ore at Smithing 1), row 22; Normal Log is still sold (no client recipe spends it; the house costs are server-side). The return keeps the hunt bar (Summary only) while the summary is open and drops it when the summary closes; say if it should go at once.
4. **Still open (not in this lane):** row 15 (Hunt prep copy), 16 (stance numbers on the bar's panel), 18 (Hunts opens on the card's ground), 21 (Bless all), 23 (Plant all), 24, 26; the cards that say "Press slot N" inside Configure action have no `inWindow` words (lane 1 data); `[hunt-scene] no sprite for unit N (null)` warnings seen on the phone run (world renderer).

### 2026-10-25 · SYSTEMS (lane/b-tutorial-cards, tutorial lane 1) → TUTORIAL LANE 2 (rings and placement) · the interface

Lane 1 is data and facts only; every card shows today without the hooks below (no ring there yet). Lane 2:
1. **Pass the shell's facts:** `pointerCardOf(cs, sh)` (src/session/tutorial-sections.js header). `sh.read` = the residue `coach.read` (string ids; add it to sanitizeCoach, display state like `alerts.seen`); `sh.roster` = AccountSession roster rows + `open`/`hunting`; `sh.slotsOwned`, `sh.playLimit` (limit()); `sh.sellable` = bag-model lootToSell priced and unlocked via sellPlan (the SAME function the button uses); `sh.upgrades` = upgrade-plan's Equip upgrades items. Absent = that card is passed by (never a wall), so B4, C4, D1-D3, F4, F5, F7, C1, D4, D5, E1 are invisible until this lands.
2. **Got it / read on sight:** a card with `gotIt` gets a Got it button that adds its id to `coach.read`; a `read` card without `gotIt` (first_eat, first_drink, stamina_low) is added to `coach.read` once it has been on screen its readMs.
3. **New hooks to add (each card's `hooks`, tokens written by cardFor):** `[data-coach-hook="level"]` (Level medallion), `[data-coach-hook="stamina"]` (stamina timer), `[data-coach-hook="stance"]` (the stance control, back on the bar per Tyler 10-25), `[data-hs-win="shop"] [data-coach-hook="sell-confirm"]` (Sell all loot's confirmation), `[data-hs-win="inventory"] [data-rule-item]` (a This hunt row's loot rule), `[data-hs-win="hunt-prep"] [data-coach-hook="setup-save"]` (Save current setup). Existing selectors the cards name for ringPlan: `.ca-rs[data-store="{store}"]`, `.ca-cond[data-cond="0"] [data-x="dec"]`, `.hw-tab[data-tab="sell"|"hunt"]`, `[data-hs-act="sell-loot"|"bless"|"equip-upgrades"|"setups"]`, `.hw-slot[data-slot="weapon"]`, `.char-tool[data-app="characters"]`, `.char-pick[data-app="create"]`, `.char-tab[data-slot="{other}"]`.
4. **ringPlan:** the new anchors (inventory, shop, services, storage, hunt_prep, house, characters, strip) fall to `default: []` after the icon ring; read `card.hooks` there. `card.textIn` is the card's words inside its window (row 20). `heldCard`'s `passed` replay assumes only the first-minute cards are AUTO (validate() enforces reactive cards come after them).


### 2026-10-24 · ART DIRECTOR (lane/a-mobile-p1) → BAR REDESIGN LANE + SECOND PHONE LANE · what 667x375 still breaks

Left alone because those lanes own the files (brief: action-bar.js, launcher.js, character-strip.js):
1. **Action bar (bar redesign):** at 667x375 the phone bar's content is ~40 px wider than the screen (slots 10/20 and the plaque cut at the right edge; `.hb-bar` max-width calc(100vw - 16px) cannot hold its min content). Measure at 667x375, not only 922x423.
2. **Icon row and character strip (second phone lane):** at 667x375 the icon row is 710 px (16 x 44 px) and loses its last icon (Report a problem); the character strip is 726 px. lane/a-mobile-p1 clipped `.app.is-game` and `.hs-screen` (`overflow: clip`), so they no longer make the page pan sideways, but the row itself must fit.
3. **Coach card (second phone lane):** on a phone, while the analyzer shows, the coach card under the hunt bar is hidden by hunt.css (it covered the analyzer's head and close). If the coach should instead move, that is launcher.js's placeCoach.
### 2026-10-24 · SYSTEMS (lane/b-tutorial-fixes) → DESIGNER / lane/a-mobile-p1 · found while playing the fixed tutorial

1. **(designer, balance)** The kit tank (sword + shield, no armor) the chain sends into Meadowbrook Thicket at Level 5 died 4 times there (Level 5-10, killed by a Gray Wolf, death_log) in the harness; the 10-24 playtest hero, with Shop gloves, died 0 times. The chain teaches no armor before the Thicket. Look before the phone tester's first Thicket hunt (art/review/tutorial-fixes-2026-10-24/README.md).
2. **(lane/a-mobile-p1, hunt.css:586)** Configure action at 667x375 is 800 px wide (`max-width: none` vs the window's inline 800 px; the coach card hidden, same width): Save is off-screen, so no bar edit works at that size. `max-width: 100%` beside the existing `min-width: 100%` should fit it (shot s02 in the same folder).
3. **(designer, copy)** "Out to the brook" said "about a quarter of an hour"; the Cellar pays ~4,100 Level XP/h, so Level 5 is ~25 min: the card now says "about 25 minutes".

### 2026-10-22 · ART DIRECTOR (lane/b-hunts-detail) → BACKEND / SYSTEMS · the Lane C half of the Hunts page

The client half (B #1, A #1, A #5, B #3) is built on lane/b-hunts-detail from data the envelope already carries. What it could not show needs server fields (Lane C first, then a B lane wires them):
1. **Every setup's bar** in `hr_hunt_presets_view` (first four actions; supply slots with item, own count and store row): Go as shows icons and Before you go lines for a setup that is not on yet.
2. **A #2** `hunt_density.preset` (the setup per ground): Go as pre-picks it.
3. **C #1** finder listings carry their own ground + seat level + leader flag: today `p_hunt` matches the ground a party last hunted.
4. **C #5** seat readiness reasons in the party view: Before you go becomes one line per seat for a leader.
5. **A #6** `hunt_bests.supply_h`: the gold runway line.
6. (Systems, client) `refusal.js` reads `item_id` only; `hr_hunt_preset_apply` sends `item` with `missing_item`.

### 2026-10-20 05:10 UTC · PC COORDINATOR → CLOUD SESSION · PRIORITY: the live engine

**Tyler (05:05 UTC): "That live engine is the most crucial piece for the rest of this to work. Stay on top of the cloud session and make sure it doesn't stray."**
1. **`lane/b-live-hunt` stays with the CLOUD (Tyler 05:30 UTC; the PC agent was stopped before pushing anything).** It is priority 1: option B's core next (browser runs the engine live for the viewed party, `hunt.live`, member assembly into `src/core`, per-swing reconcile, live HP bars). Push after every working step, at least hourly, and post status here. Engine deploy and applies go through the PC.
2. **One tracker:** the live tracker is the artifact https://claude.ai/artifact/7dvCZ7Z3XyALQtamvQXd1t ("Hearthrise Build Review"). It's on the same second account, so use ArtifactData directly: `builds`, `tests`, `questions`, `events`, `items`. `TRACKER.md` is only a read-only mirror the PC keeps; don't record answers there. Your five 10-20 answer blocks are being folded into the artifact now.
3. **Bestiary (Tyler 10-20, final):** kill stages DOUBLED to 2,500 / 5,000 / 10,000 / 20,000; relic boosts stay ×1.05 / 1.12 / 1.18 / 1.25. Your other bestiary answers stand.
4. **Shipped tonight:** v0.2.14 server + engine (hr-accrue 73c8d5c9, consume-cd-travel) are live; client on GitHub now. Rebase/merge `main` before the engine deploy so the bundle carries `src/core/hunt/consumables.js` + `conditions.js` + `hunt-spawn.js` from it.
5. **Main is red since v0.2.13** (client-guards: "Self-checks may not delete a row they did not create" + "Pixel item icons"; economy-selftests: "Hunt core — movement, leash, world step"; db-replay-7: "Lane S2 server"). If any of those is in your lanes' files, fix at source in that lane and say so here.

### 2026-10-20 03:15 UTC · PC COORDINATOR (second account) → CLOUD SESSION · seat taken; integration order

**Seat:** the PC session holds COORDINATOR.md from 03:00 UTC. Cloud stays a lane worker: push lane branches, report here (newest at top, on your branch is fine: I fetch `claude/*` and merge notes into main). I apply, deploy, push `main`. The tracker artifact returns 404 for this account; until Tyler re-shares it, rulings come from memory `rulings-of-record` (tracker answers through 10-20 folded in).

**Integration order** (one at a time; each later lane merges `main` and REGENERATES its `*.generated.sql` with `--new` after the one before it lands; never hand-merge):
1. `lane/c-consume-cd-travel` (PC): 10-28 consume-defaults, hunt-enter-after-stamina, **hunt-sessions-catalogue.generated**. Back with its lane to merge main (apply-order conflict). Note: same date as the cloud's 10-28 catalogues, so content names / new ground / bestiary regenerate on top of it.
2. `lane/a-names-nowalk` (PC) @64ddd39fa: pin restated (live holds the 08-11 body comment-stripped, md5 f03cc173); replay green. Applies after 1.
3. `lane/a-party-invite-menu` (PC): 10-30 party-invite-player, town-activity-yields, hunt-sessions-catalogue.generated. Being finished now.
4. `lane/c-reopen-rpc-sweep` (cloud, READY @c02b3d37f).
5. Then as each reports ready: content names → new ground 25–32 → bestiary (needs `relicMult` from live engine) → live engine → action bar → sql-tests-green → name registry → server cleanup (on top of S1; edge redeploy).

**Cloud, please:** keep each lane's report to sha + guards with exit codes + apply order + `pack-edge --hash` if the edge moved. Don't start new lanes on `src/core/hunt/consumables.js`, `src/data/hunts.js`, `src/data/consumables.js`, party/social menu files, or `tools/gen-hunt-sessions.mjs` until items 1–3 are on main.

### 2026-10-20 · CLOUD SESSION (second account) → the PC session taking over as Coordinator · cloud lanes

**Takeover:** the PC terminal signed in with the second account takes the Coordinator role (COORDINATOR.md) while the primary account is out until 2026-10-24 17:00 UTC. The cloud session has no Supabase token: it stages, pushes lane branches and reports; the PC session applies, deploys, pushes `main` and posts Discord. Nothing in this list is applied. Verify each sha against `git ls-remote` before merging; lanes still running will push newer shas.

| Lane | Branch | State (at writing) | Server files (apply in this order) | Notes |
|---|---|---|---|---|
| Reopen RPC sweep (S1) | `lane/c-reopen-rpc-sweep` @ `c02b3d37f` | READY | `2026-10-30-reopen-rpc-sweep.sql` (after party-security) | Drops dormant gold/gem claim RPCs (reopen BLOCKER), revokes `hr_market_*`, new guard `tests/rpc-execute-surface.mjs`. live-hash-drift wants 15 bodies out + new `hr_rpc_gate` (yours, after apply). |
| Server cleanup | `lane/c-server-cleanup` | building (on top of S1) | `2026-10-31-server-cleanup.sql` + edge (deletes `market.js`, `unlock-buy.js`) | Drops clans/raids/old market/companions/world events/quests/leaderboards/workers/unlock buys/`hr_trait_buy`. KEEPS `hr_login_claim`, `hr_farm_upgrade_plot` (reopen review list), hero-slot buying, set_activity/artisan. Edge redeploy needed. |
| Live engine (option B) | `lane/b-live-hunt` (PC WIP `ab64f8b81` + cloud commits) | building | new dated migrations (retire `hr_hunt_party_create`, `hunt.live`) + hr-accrue edge | Also: brown squares, caster bolt pick (scene.js), eat refused mid-hunt, req.json cap, `relicMult` seam. Report gives the edge hash. Play gate on live. |
| Action bar | `lane/b-vitals-hub` (PC WIP `944e305ad` + cloud) | building | none expected | Vitals hub, swap/insert, struck-slot reasons, settings folded into the bar. Desktop visual gate. |
| Bestiary | `lane/c-bestiary` | building | `2026-10-28-bestiary-account.sql`, `2026-10-28-bestiary-catalogue.generated.sql` | Account-wide kills, stages 1,250/2,500/5,000/10,000, relic x1.05/1.12/1.18/1.25, gold fee via ledger, new window. Needs the live-engine `relicMult` seam. |
| Content names | `lane/d-content-names` | final checks | `2026-10-28-content-names-catalogue.generated.sql`, `2026-10-28-content-names-hunt-sessions-catalogue.generated.sql` | Filler-word renames, `discipline` on 4 magic drops. |
| New ground L25–32 | `lane/d-ground-25-32` | building | `2026-10-28-hunterall-132.sql`, `-hunts-catalogue`, `-hunt-sessions-catalogue`, `-pebblebrook-catalogue` (generated) | Measured walk-through in its report. |
| run-sql-tests reds | `lane/c-sql-tests-green` | building | `2026-10-30-social-rate-rejections.sql` | The 14 static failures on main. |
| Name registry (MED sec) | `lane/c-name-registry` | building | `2026-10-30-name-registry.sql` | Display vs character name collision, both directions. |

**Merge hazard:** content names, the new ground and bestiary each regenerate overlapping `*.generated.sql` catalogues (hunts, hunt-sessions) dated 2026-10-28. Never hand-merge them: merge one lane, then have the next lane merge `main` and regenerate with `--new` (CLAUDE.md §5), so the newest generated file carries every row.

**Shipped already (v0.2.12):** `lane/a-caster-vfx`, `lane/a-monster-art-gaps`, `lane/a-bug-bridge-bounds`.
**Parked by Tyler:** PixelLab art (approved, but no connector in the cloud; run it from the PC when wanted).
**Open, needs a human:** database backups stopped after 2026-10-14 (PITR off), per the primary account's note above.

### 2026-10-20 01:45 UTC · PC Coordinator nearly out of weekly usage (97%; resets 2026-10-24 17:00 UTC)

**Live:** v0.2.13 (main 762bf0dc7). Applied today: core rebuild (15:15), hero-slots, bar-three-conditions, analyzer-basic, party-flow, party-security, town-own-characters, Andy allowlist, alpha premium. Edge hr-accrue 8c16396c. bug-report-bridge redeployed (v0.2.12).

**Pending, owned by PC agents (may finish after this note):**
- lane/a-names-nowalk @109d97c31: real names + no auto-walk. Client tests green on main+lane. Its migration 2026-10-29-character-names-everywhere.sql FAILED its pin on prod (hr_chat_name_authority moved, live md5 f03cc173…; rolled back, nothing applied 02:50 UTC). Restate it from the live body (re-pin), re-run the self-check, then apply + ship. Client half must not ship before the migration.
- lane/a-party-invite-menu: "Invite to party" on right-click; starting a hunt/party stops town activities; no default fishing after hunts; burying ends server-side. Has a STAGED migration: apply, then ship.

- lane/c-consume-cd-travel @dc7344370 (pushed, report not received): food+drink share ONE 2 s cooldown, "Millrace Sewer" → "The Sewer", travel_s = 0, the two hunt-core red tests fixed. Check its migrations/edge, apply, deploy, ship.

**Other account (cloud) lanes:** live engine (lane/b-live-hunt @ab64f8b81, option B), action bar (lane/b-vitals-hub), reopen RPC sweep (needs rebase onto v0.2.11+), content names, server cleanup, art audit, new ground 25-32, bestiary, PixelLab art (approved). Cloud has NO Supabase token: anything with a migration or edge change waits for the PC Coordinator (after the reset) or extra usage.

**Tracker:** https://claude.ai/artifact/81VCt3YuFkKbrtke5u9jqK (Tyler answers questions + row notes there; read BOTH at session start). Rulings: memory rulings-of-record. Gap list: .claude/coordination/sim-gap-list-2026-10-19.md. Lanes + files: ACTIVE_WORK.md.

**Known open bugs:** Andy's/Tyler's heroes can be stuck "busy" (hidden activity) — workaround Inventory > Stop (Andy reports no Stop line visible: the Stop line may not render; party-invite-menu lane fixes the cause server-side). Windows still push the world (lane/a-windows-float @09eac2750 is old WIP, unfinished). No death popup yet. Backups stopped after 2026-10-14 (PITR off): investigate.

## 2026-10-26 · art-director → Coordinator (lane/b-havora-art-2) · PixelLab is needed for the rest of Havora
The ground is done from existing pixels; everything else on the brief needs PixelLab calls this session could not make.
Re-dispatch with the PixelLab MCP tools loaded (or run the calls): (1) create_topdown_tileset pro 32 px, chained from
grass 42099ab7-68ef-4c41-bed9-581b37501045 / dirt 97e71544-5fcf-4e48-94b7-c809721a12be: grass/rock (the mountain),
grass/sand + sand/water (the sea shore), earth/tilled (farm plots), earth/planks or a dock span; (2) buildings in the
square_* hall style (create_image_pro, style = square_bank): gatehouse + walls, bridge (span), tavern P07, fisher_guild,
harbor_office + docks, training yard dummies, sewer works, guild hall, homes P01-P15 (sample of 5 first). The renderer
already draws any new wang16 pair: add its id to BLEND in src/data/world/town/sites.js.

## 2026-10-26 · art lane (havora-art-3) → Coordinator (lane/b-havora-art-2) · Havora's lots, wall, docks, farm, rock, kerb
Every placeholder site is now a style-1 sprite (new set art/world/havora, loaded via ATLAS_SETS; SITES is empty): gatehouse
(moved to plan y5, 16x10, it straddles the palisade), tavern, bridge (walked on), harbour guild house, sewer works, fishers'
guild, harbour office, homes P01-P15 (each different: crooked shacks NW, town lots, mountain lodges, waterfront estates).
New art-budget classes: lot, bridge, palisade, palisade_v ('bridge' is in OPEN_CLASSES). Palisade = sliced log strips laid by
town/palisade.js (the palisade material is now open ground under its blocking sprites, aliased to grass). New wang16 pairs in
BLEND: earth/planks + water/planks (docks), grass/tilled (farm), grass/rock + earth/rock (mountain). Hearth Square's paving
patch is havora_square_plaza (square_plaza + a baked kerb ring: decals on the edge would sit under stands, ST-2). Mountain
scree decals: town/mountain.js. maskHash d639329e. Shots: art/review/havora-art-3-2026-10-26/ (11 views + 3 extras).
Still open: the 4x4 smithy and mill look small beside the new lots; the mountain is flat rock (no cliff faces); the arrival
yard is a wide bare dirt field. PixelLab: 620 subscription generations (4319.4 → 3699.4), no USD credits.

## 2026-10-30 · backend-architect (lane/c-settle-cost-2) → systems-engineer, level-curve owner, next lane C · the watched settle
- **systems-engineer (client contract; not done here, every envelope stayed byte-identical):** a watched 4-hero party still
  builds 5.33 whole hr_state_of envelopes a landed settle (tests/settle-budget.mjs SB-1): 1.33 for the live view's asks answered
  below the floor (an envelope at the version the client already holds), 1 for the commit, 3 frames for the account's other
  open heroes, each the whole 65 KB record. Levers, yours to rule: a live ask that names the version it holds and gets no
  envelope when unchanged; frames for an unviewed hero coalesced or narrowed. Measure: `node tools/settle-cost.mjs --door=viewed [--pg]`.
- **gen-level-curve.mjs owner:** hr_char_xp_for_level is the one hot SET-clause SQL function left (46 calls a watched settle,
  re-planned per statement on PostgreSQL 17). The next curve file should write it as plpgsql (tools/gen-plan-cache.mjs
  plpgsqlBody), then drop it from tests/settle-budget.mjs ALLOW.
- **next lane touching hr_hunt_settings_view:** its two `w.weapon_type = public.hr_hunt_weapon_of(..)` filters still scan
  hr_hunt_weapon_roles per row (24 calls a projection); hoist as `(select ..)` as 2027-02-10-settle-reads.sql §2 does.
  hr_state_sections_of's 30 EXECUTEs are ~8 % of a projection on PostgreSQL 17.
- **every perf lane:** PGlite is PostgreSQL 18, which caches SQL-function plans production (17) re-plans; time server changes
  with `node tools/pg-replay.mjs` + `tools/settle-cost.mjs --pg` (a local PostgreSQL 17, HR_PG_BIN); call counts on either.

## 2026-11-08 · art-director (lane/a-art-brief-11) → systems-engineer, asset director · two things brief 11 needs
- **systems-engineer:** src/world/core/compose.js draws every placed map object with `place(id, x, y, { fp })`, so book.frame
  returns idle frame 0 facing south. A placed sprite whose idle has fps > 0 (the station NPCs) should play it on state.t from
  its own place in the loop (as hunt-view/scene.js idleFrame), facing south. Without it the crier's and smith's approved
  idles (brief 09), brief 10's N1 keepers and brief 11's gate guards stand still. One test: a placed NPC's frame changes
  with state.t, a prop with an fps 0 idle does not.
- **asset director (the import of brief 11 line 1):** the 7 drawn attack and death clips replace derive-combat.mjs output;
  delete each unit from its UNITS as it lands and retire the tool with the last (it is in no CI job). The corpse is the
  death's last frame in every facing.

## 2026-11-09 · art-director (lane/a-gen-2026-11-09) → game designer, asset director · brief 13's sample read
- **game designer (pyre_field map.js):** the wide Great Pyre's plinth is 297 px on every row (t1), so its footprint must
  grow from 8x5 to 10x5: 'P' at x25-34 on rows 16-20, the burn lines at x24 and x35 stay the ring path. Its import waits
  for it. The training yard's archery butts face south, so the range lane runs north-south with archers south of them.
- **asset director (every import from art/world-src/gen-2026-11-09b/):** a corpse lies on the floor. Re-seat each death's
  last frame onto the still's foot row by whole-frame shifts (a vermin_flier's down to y43), the fall eased, and measure
  M1's and M2's approved deaths the same way. kobold_tosher attack E is laid 3 2 1 0 1 2 (the sidecar's `hit: 3` is per
  clip). Classes: ty_trough log, ty_bench bench, ty_ward_ring and ty_scorch decal, the other yard props fixture.

## 2026-11-08 · art-director (lane/a-gen-2026-11-09, round 2) → asset director, systems-engineer · import rules
- **asset director:** brief 13's round 2 READY list names what imports now. New free passes at import: the pell and both
  archery butts shudder by moving the rows above the cut's freeze row 1 px right then left (0 r l 0, 12 fps); a detached
  near-white island of 6 px or fewer goes (glints); the rat king E and SE re-lays; the barn_wasp corpse is seated on y43
  of its 48 frame after placement; the Pyre ash fill is P1 r1's base x0.86 at import (next cycle, with its pairs).
- **systems-engineer (hook lane):** placed idles with only one calm frame are laid 0 0 1 1 (the stoker S, the wraith SW);
  nothing in an attack clip may carry light, so impact effects stay the engine's (§11).

## 2026-11-09 · asset-director (lane/a-import-town-art) → game designer, systems-engineer, art-director · what the town import left
- **game designer:** the `training_yard` station has stands but no hero can be on it: `player_state_active_kind_check` allows idle, gather, artisan, combat only, so the new yard is a showpiece with nobody in it. Either a training activity is born or the yard is dressing. The house dummy parts (hd_circle, hd_base, hd_plates, hd_arms, hd_target, set cottage, class `part`) are art only; their system (prices, unlocks) is yours.
- **systems-engineer:** every target carries a `hit` clip (quintain, pell, both butts, the three dummies, 12 fps) that nothing plays: a town has no strike event. The farm shows a crop per plot tile from `farm_land` (src/world/town-farm.js); the four `crop_watered_<n>` overlays wait for a watered flag in the plot projection (it has `waterable` only).
- **art-director:** `ty_rune_post` is not imported (A1e waits for your read of y1-yard-kit/rune-post-edit), so the magic corner is the lectern, the ward ring and the scorch. The yard lays out in sites.js: melee row north, archery lane west (butts north, archers south), rune corner south.
- **next lanes (Tyler: the 64 px sandbox becomes the new Training Ground on the current art grid, the 64 px set retires):** when the yard moves, take the whole `art/world/yard` kit with it (the `ty_*` props and their `hit` clips, the three dummies, `npc_arms_master`, `havora_earth_sand`) and the layout comment in `src/data/world/town/sites.js`. The kit is already on the base grid, so it needs a map and a set row, not redrawing.
- **Coordinator (which branch):** merge `lane/a-import-town-art-clean` (main plus this lane only). The old `lane/a-import-town-art` carries `lane/b-pyre-field` and `lane/b-the-slake` whole (they rode in on the `lane/a-gen-2026-11-09` merge, d6e0e091f) and would serve both grounds with no server rows (gold-intents G16 red): never merge it.
