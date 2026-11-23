# CONFLICTS

_Open conflicts — code, design, asset, gameplay, architecture, integration. **Never silently resolve a meaningful conflict.** Log it, route it to the owners, resolve with evidence, then move it to Resolved._

## 2026-11-23 · KRELL'S CARD SAYS "A TANK, A HEALER AND TWO MORE", AND AT 85 THAT IS NOT TRUE (systems-engineer, `lane/hall-formula`) → GAME DESIGNER via COORDINATOR · **OPEN**
- **What:** `tests/boss-hall-advice.mjs` HA-WIN plays every four the card names (a tank, a healer and any pair of the eight kinds) at the hall's floor, 85, and wants 75% each. It is RED ON THE BASE (66ceaadde, the hand lines): 20 of 36 fours read 1 to 29 of 40. With the hall's switch on (Krell and Hask on the formula at the `hall` and `add` boss kinds, fitted at 85) it reads 20 again, the same fours.
- **Why a dial can't fix it:** a bar check is a fight where the lineup matters (02 package 7; 04 section 6). At 85 a tank, healer, hammer and mage win 93%, one gear tier under 25%, other damage pairs 40-63%, a third tank 1-25% (`tools/balance-program/redesign/halls/krell-after.txt`). Dials that lift every pair over 75% also lift the under-geared four over 65% (measured: x24 HP / x2.6 blow 65%, x18 / x2.7 68%).
- **Designer:** the card names what wins (e.g. a tank, a healer, a hammer and a mage, or a Level), and HA-READ learns that line; or the target moves. The guard is not loosened here.

## 2026-11-23 · THE GEAR CATALOGUE ON ONE FORMULA (systems-engineer, `lane/gear-catalogue-steps`) → GAME DESIGNER + the formula-overhaul program lane · **OPEN: three values to own, and the uniques**
- **Built:** every piece's base stats = profile x slot share x budget(item Level), `src/core/gear-stats.js`, levers in `src/data/gear-profiles.js`, written by `tools/gen-gear.mjs`. Dawnsteel lands on its shipped numbers to the point; under it the hand tables are gone, so ladder pieces moved a point or two (Mithril about -10%: its item Level is 40, Hask's Ford's base, not its wear Level 45; leather crit and cloth damage a little lower in tiers 1 to 4). Named pieces keep their exact numbers as `statPlus`.
- **Value 1, `GEAR_SCALE_STAT_PM` 500 (JUDGMENT, measured):** on a scale ground a piece's stats are read halfway from the ground's base item Level to its own. At 1000 (the old catalogue) the stats stack on the power step: a shipped tier read +29 / -38 held steps on Muster. At 0 (pure "a piece is its item Level") a shipped weapon-and-armor tier read +8 / -3, under one depth. At 500, on the merged set and the final curves: Muster L60 +10 / -24, L70 +24 / -26; Hask's L52 +18 / -13, L45 +14 / -10 (6 seeds x 12 h, paired, `tools/balance-program/redesign/gear-steps/summary.txt`); every family's four (sword and shield, hatchets, sword, the standard) in its band with 0 Steady deaths. Muster L60 up reads under 1 depth (se 5.5). Hask's back is smaller because its LOW rung is only 10 item Levels under (Steel 30 vs Mithril 40).
- **Value 2, the power step's own tier move has fallen on this set:** a whole kit one tier ahead reads +10.8 on the set before this lane and +10 to +13 here (was +20.8 at R9). The step and `POWER.weightGearBelowPm` are econ-levers' / R9's, not touched here.
- **Value 3, `GEAR_CURVE_TOP` 88:** the stat curve holds past Dawnsteel (squared it would triple a Catacomb piece at item Level 160). The staged Catacomb wings' bands were measured on the old stats and are owed a re-measure with their fit anyway.
- **Owed to the designer (formula master 27 §2.3, phase A):** the 86 named or unique pieces kept their exact numbers as stated offsets (`statPlus`); moving each to a Signature or a Trait, or cutting it, is a content call this lane did not make. The under-Dawnsteel curves were re-cut so the first-week rungs hold (first-week-bands armor-rungs and weapon-rungs).
- **Pre-existing, not this lane:** the sword-and-shield four (tank, crossbow, mage, healer) holds about 40 steps deeper than the standard four and dies once in 6 Steady days on Hask's Ford, before this lane too (661 / 616 held, 1 death on Hask's, `gear-steps/before-*-swordtank`).
- **LV-PULL's gear pin, investigated (reliability, `lane/live-refresh-bug`, 11-23): not a page bug, the pin stays.** Unpinned, "Take turns" closed fails only after Eddie dies at 1,044 s (the harness's `server()` seats a dead member again). Viewed, Eddie's Melee 42 lands inside its own window, and the server counts it from the next swing. Chief Coppercap reads 975 on the server and 976 in the browser, so the 640 s commit is diverged before any commit names his key. `run()` restarts only on a matched commit, so the rest read off. The real `LiveLink` on the same run: 1 diverged commit, restarted 0.3 s later, every later commit matched (91 of 93; the other is the dead Eddie seated again). The same holds on main v0.2.143. Players can see one eased correction when a peer's level moves a blow before the next commit names it. That follows from the browser never holding a peer's XP (Tyler 10-20). Option for SYSTEMS (not done, unmeasured): name the keys at the window's END, which would cut the stale span from about 1.5 windows to 0.5.
## 2026-11-22 · TOWN WORK ON ONE CURVE: WHAT THE MEASUREMENT FOUND (backend-architect, `lane/trade-formulas`) → GAME DESIGNER, lane/flame-temper-build, the drops lane, via the COORDINATOR · **OPEN: four calls**
- **The store's reference burn is stale.** `STORE_KIT.refRestore` 12,660 and `refCharges` 1,390 define a kit-hour (econ-levers, before ledger L10 and the moves pass). On this tree the Steady four at Level 60 burns 14,436 restore and 1,493 charges a hero-hour (`tools/balance-program/redesign/trades/lab-muster.json`), so every bill priced per kit-hour reads 1.14 kit-hours on the meal line and 1.07 on the charge line of the reference. Re-measure the two rates (`econ.store-kit`) or accept the drift as in band.
- **The live store is not 09's store yet.** A store basic gives three quarters of its crafted partner (`BASIC_EFFECT_SHARE`, about 82 steps behind) and costs the use at the buyer's step with no lag (lane/econ-followups); the formula's store good is one tier behind (93%) and asks 1.5x V there. Both lanes agree it moves as one change, strength and price together, with banded goods (wave 4).
- **Bought work can profit at the top.** 04 section 11 says a work block's 0.5 hours of wage an hour is above what a work-hour's goods fetch even at the store's ceiling. At reference yield and speed that holds (0.25 x 1.5 = 0.375). A company at trade Level 99 with a Mastery and a full bench makes 0.46 hours of wage of goods a work-hour (the arrow chain), which sell to players near the ceiling for about 1.39x V at the same band: above the block's price. It mints no gold (player to player; at the store's floor it fetches 0.4 x V), but "never profitable" fails for a company with a Mastery and a full bench from about Level 50 (0.41 x 1.39 = 0.57) and holds without them (0.32 x 1.39 = 0.44 at Level 99). Masteries ship after v0.3.0 (20 section 1.4), so the edge opens with them. The designer's call: raise the work block's floor, or accept it as the late game's edge.
- **Imbuement inputs, two units.** 21 section 3.2 writes `imbueParts` 5 and `imbueRemains` 4 as counts; 09 section 5.4's cover rule sizes them in hour-units (here 6.67 hour-units of rare parts and 1.0 of remains an imbuement, `econ.stream-cover`). One of them must read the other when the drop formulas fix how many physical parts an hour-unit is. And `IMBUE.workPm` 530 is typed where `tradeCatalogue()` derives 533,333 micro-hours from the imbuement line's share; src/data cannot import src/core, so the job slice should read the catalogue's and the typed one retire. Settled here on merge: the imbuement's life, slots and life rung and the Temper kit's worth are read from 21's rows (`src/data/trades.js BORROWED`), so a Temper kit is 0.4 work-hours (21's 0.1 hours of wage), not this lane's first 1.0.
## 2026-11-23 · THE TOWER ON THE SCALE, BOSSES AS KINDS: THREE CALLS AND ONE SEAM (systems-engineer, `lane/tower-boss-formula`) → GAME DESIGNER + `lane/monster-formula` + COORDINATOR · **OPEN**
- **Built:** a floor is three formulas (`src/data/tower.js`: Level = F, depth = 2.3 F Danger steps on HP and blow, the band's role mix in turn), the heat and the typed top are gone (the top is the scale's own, floor 1730), a kill pays the Level share at the floor's gap x payPm 500 over refKillsHead 300 (`towerShareXp`), no party table; Tower keys' first landing and odds are generated (`chests.js landingForLevel`, `KEY_ODDS`); `src/data/bosses.js` (ground / hall / keeper / add rows, `rampPerMinute` on a unit fight clock `fightMs`).
- **Seam for lane/monster-formula:** a Tower room reads its monsters through ONE function, `src/core/hunt/tower.js rowAt` (today `formulaStats` at the floor's Level and the mix's stat role, x the depth ratio). When role rows land, swap the body of `rowAt` only; the floors, mixes, pay and tests stay. The `boss` stat role is now `bossRole(elite, 'ground')`; a role-row rebuild should keep a boss = base role x `BOSS_KINDS` row.
- **Call 1 (designer), Krell's fit:** Lord Krell and the hall's Captain Hask keep hand-fitted rows (Krell 18,000 HP / atk 247 / aim 290 against the formula boss's 2,482 / 103 / 70 at his Level). Re-deriving them as the formula x the hall kind is a ship-bar re-fit (`tools/balance-sim/boss-call-table.mjs --ship`, 40 tries a row), not done here. The hall ramp (60 permille a minute to x1.6) is live on his row from this lane and was not re-measured on the ship bar.
- **Call 2 (designer), the keys moved:** Bronze 10 -> 40, Silver 40 -> 80, Gold 70 -> 120, Platinum 100 -> 140 (the landing whose Level reaches the weapons' item Level), Gold's odds 45 -> 40 permille (the halving rule). A company holds about Level + 25 to 35 (MEASURED), so its weapons are a tier or more over what it wears. The Cinders, salts and food rows are still typed.
- **Call 3 (designer), the mixes:** six bands in turn (Line, Volley, Swarm, Stalkers, Choir, Wall). The Choir (casters, splash 500 at the back) ends most climbs at a Level 74 four's edge (the typical low falls from about 75% to 34% in one band). Kept: it is the question that band asks; tune the mix row, not the curve.

## 2026-11-22 · THE DANGER BOUND READS THE WORLD ONE WINDOW LATE (backend-architect, lane: `lane/econ-followups`) → BACKEND (1056's owner, lane/v1-climb wave 1) + COORDINATOR + SECURITY (EA) · **OPEN: found while pricing the store, not fixed here**
## 2026-11-22 · THE DANGER BOUND READS THE WORLD ONE WINDOW LATE (backend-architect, lane: `lane/econ-followups`) → BACKEND (1056's owner, lane/v1-climb wave 1) + COORDINATOR + SECURITY (EA) · **RESOLVED by lane/danger-bound-fix (1056 re-derived while staged); was OPEN: found while pricing the store, not fixed here**
- **What:** 1056's contract says the settle re-proves "the step the engine reports ... against the step the server accepted before". It does not: `hr_danger_bound` reads `hunt_instances.world`, and `hr_hunt_apply_instance` calls every `hr_hunt_apply_member` (replayed body line ~175) BEFORE it writes the window's new world (line ~253). So each settle proves the PREVIOUS window's world, against the climb budget of the CURRENT window (`v_win`), and the last window's world is never proved before `hr_danger_end_stamp` copies its step into `hunt_density.danger_held`.
- **Why it matters:** (1) a long window (an offline tick catch-up) that climbed honestly, followed by a short one (a viewed poll), is checked against the short one's budget: a `danger_climb` refusal, and the same refusal on every retry, since the world does not move (not reproduced here: DZ-1..6 never mix window lengths in one instance). (2) A forged final step reaches the next hunt's start unproved. (3) Store prices (1062) read the same pre-window world, which IS proved in the same commit, so the bill is safe; only the budget is wrong.
- **Fix (not made here, it is 1056's semantics and its tests):** prove the world `p_settle` carries, in `hr_hunt_apply_instance` before the member loop (or hand it to `hr_hunt_apply_member`), with this window's budget; keep the end stamp reading a proved world. A regression arm: one instance, a 90 s tick window that climbs past a 10 s window's budget, then a 10 s viewed window, must land.
- **RESOLVED 2026-11-23 (lane/danger-bound-fix, backend-architect):** `hr_hunt_apply_instance` is spliced by 1056 (§0b pins its image): the new internal `hr_danger_prove` proves the world the settle CARRIES against the instance window's climb, once, under the instance lock, before the member loop, and raises `danger_top`; `hr_danger_bound` keeps its signature (so `hr_hunt_apply_member`'s image, and 1053's and 1062's pins on it, do not move) and prices each member from that proof (the settle-local `hr.danger_window`, refused `danger_unproved` without it). Every stored world is now proved by the settle that stored it, so the end stamp and 1062's store step read a proved world. A refusal is the instance's (the world is every seat's). Regression: `tests/danger-db.mjs` DZ-7 (three 120 s windows, then one 2 s swing, browser closed and hunt viewed: measured; a 10 s viewed window cannot show it, the viewed floor is 15 s and a 120 s window climbs at most ~32 here) was red on the old body with `danger_climb` on both doors; its mutant puts the old read back. STILL OPEN beside it (not this fix): a session that ENDS inside a settle (a death, a leave under the flush, stamina) is stamped from the world the PREVIOUS settle stored, because the window's world is written after the member loop and a settle where every seat ends carries none; so `danger_held` lags one window, and a lone hero's death fall is not in it (read from the code: hr_hunt_settle_session closes inside the member loop, accrue-hunt.js sends `world: null` once every seat ended; not measured). Needs the engine to carry the end step when every seat ends.
## 2026-11-22 · WHAT THE SCALE PAST MUSTER FOUND (systems-engineer, `lane/r10-more-grounds`) → game designer, via the COORDINATOR · **OPEN**
- **Krell's Hold and Pyre Field stay off the scale.** Measured (v1-climb, Steady mixed four, 4 seeds x 12 h, `tools/balance-program/redesign/r10`): Krell's Hold died in 4 of 4 seed-days at Levels 85 (LOW kits), 97 (MID) and 110 (BIS); Pyre Field in 1 to 3 of 4. 12-targets C-3 is none. Pyre also drops two ladder tiers (Muster's and Krell's), against the one-base rule (3.3). Owed: their monsters' fit on the scale, then a band each. Until then the open road on the scale is Hask's Ford, then Muster Barrows, and Muster's top names no next ground.
- **The Catacomb wings are staged and still kill a Steady four** (Flooded Wing: LOW at 165 twice, BIS at 185 three times in 4 days; Bone Wing: LOW once). Owed before they open, with the named pieces' reqLv: the 24 rows copy their old key tier's twin (reqLv 15 to 88) and now carry item Level 160, so each must be worn from 150 (gear-steps.js wearAhead) or a low hero wears 160 of gear part.
- **STATED, the designer's to set:** the wings' named-armor rate `ARMOR_PM_KILL` 12 per mille a kill (src/data/catacomb-wings.js: a leaning piece about 12 h a hero, the other slot about 28 h, against the Rare band's 10 to 20); the band rule past Muster (refStep the MID four at the middle Level, topStep the BIS four at the top Level held to refStep + gapMax, the floor mirrored), which read Muster back at 593 / 707 against its 590 / 710; Trait pools on Hask's Ford are empty (the sample of five stays five, section 10).
- **The descent still exists** (hr_catacomb_start, the Hearth Chest's Catacomb keys): 12-targets section 7 retires it; this lane did not, so the named pieces have two sources once both open.

## 2026-11-21 · THE HARNESS PRICES A DEATH ITSELF (systems-engineer, lane: `lane/lab-p3-variants`, Balance Lab phase 3) → the baseline lane (`lane/bl-baseline`, owner of the pinned instrument) + COORDINATOR · **OPEN: the targets cannot see a death-cost family**
- **What:** the death-cost rule slot (`src/core/action-rules.js` deathXpLoss / levelDeathLoss, `tools/balance-program/rule-slots.json`) plays its family in the engine, and the engine side reads it: `death-hours` is ahead of C0 on Level XP after deaths in 12 of 189 cells beyond noise (`tools/balance-program/variant-reports/C0--death-hours.json`). But the band judge moved 0 rows, because the harness types the death price a second time: `tools/balance-program/matrix-metrics.mjs:121` (`deathXp: STD.DEATH_COST.share * charXpForLevel(L)`) and `tools/balance-program/grid-derive.mjs:135` (`deathXp = (L) => STD.DEATH_COST.share * xpAt(L)`) feed S11 and the death-cost rows from `standards.mjs` DEATH_COST, never from the tree.
- **Fix (not made here):** add the tree's `src/core/action-rules.js` to the data view (`progression-grid.mjs loadGridData`, `balance-matrix.mjs dataView`, as `AR`) and read `AR.levelDeathLoss(xpAt(L))` at both sites. On C0 it moves numbers only by the floor (6% of a whole XP total, floored), but it moves the instrument's hash, so it lands where the pinned baseline is cut, not mid-pin. Until then a death-cost family is judged by the engine's own reads only.
- **RESOLVED 2026-11-22 (lane/bl-baseline, 3656bad01):** both readers call `progression-grid.mjs deathXpAt` (the tree's `levelDeathLoss` on its curve) and `blessedShareOf` (`src/data/blessings.js`); `loadGridData` and `dataView` carry `AR`; a view without it is refused. Proof `balance-matrix.mjs --selftest` 9m (a planted rule that doubles a death moves deathXp and the S10 rows); both typed readers as mutants FAILED. Found beside it and fixed for the baseline: the grid's `buildCell` lays the S-5 Blessing ladder (a proposal) on every cell; the baseline's jobs drop it (`baseline.mjs --selftest` 5b). The pinned baseline was cut on this instrument (run 44985081080).
## 2026-11-22 · MONSTER ROLES AND ROWS MOVE WHERE A FOUR HOLDS (systems-engineer, lane: `lane/w2-roles-rows`, wave 2) → GAME DESIGNER + the company-plan lane + R10 · **OPEN: three calls**
- **Built:** six role rows (`src/data/monster-roles.js`: Brute, Shooter, Caster, Swarm, Stalker, Warder; reach, range, splash, heldPm, answer), two rows for the party (front = a role that fights beside its target, else back; a `row` setting overrides), read only on the Danger scale through `shooters.js aimOf` / `rangeOf`, `targeting.js chooseTargets` (re-aim) and `damage.js` (splash). Sample: Muster's Pikeman swarm, Wight stalker, Knight and Hask brute; Krell's Lookout shooter (inert until Krell's Hold is on the scale). Measured: `tools/balance-program/redesign/w2/summary.txt`.
- **Call 1, back-row blows (designer):** at full blows Steady died 4 times in 32 days, every one a Wight on the bow: a Wight's largest blow at step 580 is 386 against a Level 60 back-row hero's 740 HP, written for a heavy front. Shipped: the stalker lands 400 permille of its row's blow (`maxHitPm`), 0 deaths in 32 days, every healer four in Muster's band (568-628). The rule wave 3's role generator must keep: one blow at the back row stays under the Steady line (25% of max HP).
- **Call 2, the plan's row (company-plan lane):** the engine reads `row` ('front' / 'back') from the hunt options (`hunt-spawn.js heroSetup`, `opt.row`) and at every boundary (`combat-sim.js syncUnit`). No server column sends it yet; until the plan does, every hero stands in its role's row.
- **Call 3, lineups (designer):** on Muster the roles spread the damage (front 90-100% -> 43-91%) but keep the lineup order; a second front seat beside a tank still takes 1% because the Challenge holds brutes and the swarm. A real choice of lineup needs a second mix on the scale (R10's grounds; Krell's Lookout is already a shooter).

## 2026-11-22 · THE POWER STEP: A CLIFF UNDER THE GROUND'S GEAR LEVEL (systems-engineer, lane: `lane/r9-power-step`) → GAME DESIGNER + lane/g-gear-steps · **OPEN: up a tier reads +20.8, down a tier -65; offense shows little as depth**
## 2026-11-22 · THE POWER STEP: A CLIFF UNDER THE GROUND'S GEAR LEVEL (systems-engineer, lane: `lane/r9-power-step`) → GAME DESIGNER + lane/g-gear-steps · **RESOLVED by lane/econ-levers (designer, 2026-11-22): a one-sided weight, POWER.weightGearBelowPm 500 under the ground's base: a tier back -13.2, a tier ahead +20.3 (6 seeds x 12 h, paired; tools/balance-program/redesign/econ/gear-*-L60). Was OPEN: up a tier reads +20.8, down a tier -65; offense shows little as depth**
- **Built:** on scale grounds a hero's gear part (lane G's table, `src/data/gear-steps.js`) counts `weightGearPm` 1000 steps a gear step over the ground's `gearLevel`, on blows at monsters and (after the 60% cap) on blows at the hero; heals are not stepped. Measured at Level 60 on Muster, Steady four, 12 seeds x 12 h, kits and dice identical (`tools/balance-program/redesign/r9/summary.txt`).
- **The MID kit sits 10 steps under Muster's gearLevel 60** (its jewelry and cape are item Level 15-30, gear part 50.25): base held 574 (583.8 at gap 0), Steady pay 0.81x the table. refStep was measured on that kit; the reference company (a whole kit at 60) holds about 584. Not re-cut here.
- **One tier (20 steps):** ahead +20.8 +- 3.6 (104%), back -65.2 +- 8.5 (326%). From gap 0 (the earlier run, same mechanics) back -29.7, ahead +21.3. Halves, from gap 0: defense 82% (-16.4), offense 1% (-0.2) as depth (offense shows as kills an hour: -4.7% for -7.2% blow); from gap -10: defense -58.8, offense -7.9. The defense half played UNDER the cap showed 20% from gap 0 (-3.9): the cap eats three quarters of it, so stepping after the cap (built) is the fix for that.
- **What absorbs, and the cliff:** depth is set by the HP trough of a pull (per-blow damage against heals), not by kill time, so offense moves pace, not depth. Below the ground's level damage grows by the step while heals do not, so a company two tiers under falls off a sustain cliff. Design calls: step heals by the healer's gear part (it would make the curve symmetric; 04 prices a heal by the contest too), or accept the cliff as "under-geared for this ground" (with wearAhead it is a gate). Also C-2: the shipped stats still play beside the step (a MID band back: weapon -52.8, armor -59).
- **Heals stepped, tried and reverted (lane/r9b, 12 seeds x 12 h):** stepping a heal spell by its healer's gear made the curve steeper, not flatter: a tier back -86.7 +- 3.0, a tier ahead +34.5 +- 4.3 (unstepped -65.2 / +20.8); base held 566.8 (574.0). The asymmetry is not the heals: depth responds convexly to the whole gap below the ground's level. Remaining levers for the designer: a smaller weightGear under the ground (a one-sided weight), wearAhead as the gate, or accept it (`tools/balance-program/redesign/r9b/summary.txt`).
- **Also:** the Lab shelf family `hero-power/step` now double-counts on this tree; retire the slot. Item Level: until R10 writes `iL` on scale drops, a piece's `reqLv` stands in (`itemLevelOf`), against G's note not to derive item Levels from the old tiers: there is no other item Level on today's rows.

## 2026-11-22 · THE SIDE SEAM vs lane/v1-climb (systems-engineer, lane: `lane/w1-side-seam`, wave 1's first engine batch) → COORDINATOR · **OPEN until v1-climb merges: one rule for every engine line it adds**
- **The rule now in the engine:** friend or foe is asked only through `src/core/hunt/sides.js` (`isEnemy`, `isAlly`, `sideOf`, and unit-index.js's side lists `foesOf` / `engagedFoesOf` / `targetedFoesOf` / `livingOf(inst, side)` / `alliesByIdOf`); what a unit IS through `isHero` / `isMonster` and the kind lists (`engagedMonstersOf`, `livingMonstersOf`, `livingHeroesOf`). `engagedOf` / `targetedOf` are gone; `targeting.engaged(inst, u)` takes the viewer.
- **What bites at merge:** `tests/hunt-core/side-seam.mjs` `no-raw-kind-reads` is red on any `u.side === 'mon'`-style compare in src/core outside sides.js. A v1-climb line written against the old base (pull-cycle.js, damage.js's tier lines, roles targeting) needs the accessor: a monster's row / the pull's packs by kind, a target, area, heal or pay by side.
- **Lines this lane touched in v1-climb's files:** pull-cycle.js packMonsters / heroes / spawnAdds' `standing` / fallen / clearCorpses (one token each), damage.js armourVs and every `target.side` line in hurt / landHit (one token each). Same-line conflicts there are a token swap, both sides kept.
- **Left for the arena batch:** `team` is not persisted (a world-shape move = an hr_hunt_world_shape catalogue); hunt structure (leader, formation, regroup, solidity, tank turns) stays kind by design (sides.js header).

## 2026-11-21 · reds waiting on the overhaul (systems-engineer, lane: `lane/c-engine-reds`) → GAME DESIGNER + COORDINATOR · **OPEN: two balance guards stay red on purpose (Tyler 2026-11-21, fix at the formula layer: no per-ground, per-party or per-weapon patch); L16, the tier sizing and the overhaul's R-steps own the numbers**
- **party-class-xp-line (staging run 44870672285, economy-selftests):** Carter's Rest Dangerous tank+healer+bow+mage reads 0.989 of the same heroes alone (bar 1.00) and the Ox Road Deadly axes+bow+mage+healer four 2.53x the pace contract (cap 2.5). Cause: the spell rule (21-5, 32-x, every cast a share of the caster's blow). Run 44863151394 (the to-hit ratio in, the spell rule not) read the same Carter's Rest four at 1.032 and the guard green; with the spell rule the four went 822k -> 1,013k Level XP an hour a head and the same heroes alone 797k -> 1,024k (the lone heroes gained more), and the Ox Road four crossed 2.5x. No other merge between the two runs touches combat. Not patched: a per-ground fit or tier row would hide a formula's effect.
- **level-curve (MEASURED, the guard's own tool: sim `--plan pace` + `--plan ladder`, `pace.mjs --write`):** C1 is cleared (the fingerprint moved because lane/c-tohit-ratio re-authored 52 monsters' `def`). On today's engine the eight lone careers reach Level 25 in 36.3 h, 50 in 157.3 h and 100 in 538.1 h (were 34.5 / 163.0 / 620.1), and the eight grounds' ladder pays 835 x L^1.435. So C2 (L100 -11.3%), C3 (L100 -10.3%) and C5 (the contract 11.6% under the ladder at L50) are red. The cause is a formula, not any ground: the spell rule (21-5, 32-x, every cast a share of the caster's blow). Bisected on the same tool: before the to-hit ratio the careers read L100 620.1 h, with it 608.8 h (inside the band), with the spell rule 538.1 h. Not patched here: re-fitting LEVEL_CURVE to LEVEL_PACE's lone targets would fit a table the 11-21 standards replace (the Level table timed on a MID four, Level 400 = 4,580 h). The designer (or the standards lane) decides the curve; `pace.mjs --fit` prints the rows.
- **Krell's Hall (MEASURED, `tests/boss-hall-advice.mjs --table`), fixed as advice, not tuned:** the to-hit ratio alone took a tank, a healer and two tanks from 38 to 2 of 40 (out of time); with the spell rule every one of the 36 pairs wins 40 of 40 at Level 85 on Swordfish and 38-40 on Salted Lobster (Trout: 23-31 of 40 in 19 parties). The card now asks for Salted Lobster (`storeFloor`, 180 gold a bite against 432), held by the new HA-FLOOR rule (the card's food is the cheapest every party wins on), which also closes the Lobster mutant that escaped. For the designer: the hall may now be easier than its "a boss may be hard" fit (80-100%); a formula outcome, no hall stat was touched.
- **K1 now reads the real Krell four on today's engine** (`tools/balance-program/model.mjs REAL_KRELL_FOUR_SHIFTS`, measured on K1's own cell; BC-7 pairs each Krell declared shift with it): Level XP 0.83, kills 0.83, net gold 0.74. Raw, it read 1.06 / 1.06 / 1.36, which would have opened the xp gate on an engine change while the harness was as far from real play as before.

## 2026-11-21 · THE SPELL RULE (systems-engineer, lane: `lane/c-spell-rule`, plan L17, engine batch 2) → GAME DESIGNER · **OPEN (built as ruled, with one floor the rulings needed): six calls this lane made that the designer should confirm**
- **Built (21-5, 21-6, 32-2, 32-3, 32-4, 32-5, 32-8):** every cast is a share of its caster's own largest blow (`src/data/abilities.js` hitPm / healPm / shieldPm, `castAmount`, `hitRange`), the five versions are one rune-tier ladder `x1.0 / 1.1 / 1.2 / 1.3 / 1.4` (`runes.js` stepPm; the old per-level `lvPm` is gone), each share fitted to its Level 60 worth (`tools/balance-sim/staged/spell-audit.mjs` prints every row at 10 / 60 / 110 / 185), Mend 11% of max HP, Cleave merged into Turning Cut (starts at 2 in its ring), Power Strike off the two axes, Rend 6 s, Rend's bleed a share of the blow (`statuses.js` blowPm), and the hammer's **Quarry Blow** (club only, Earth rune, 8 s, 140% of the hammer's blow at version I, Flame Strike's share; off the default bar; tile drawn by `tools/world-art/ability-tiles.mjs`). G23 in band for every family.
- **Call 1, THE BEGINNER'S FLOOR (needs the designer's yes):** a share alone cut the first hours. A Level 1 hero's blow is 3 or 4, so Power Strike fell from 7-13 to 1-3 (MEASURED: the start-kit tank reached Level 10 at 7.2 h, G6 RED against the ruled 6; every first ground's kills 21-36% slower; drop-tables 76 red on the Thicket, Sewer and Wickstead; first-week-bands red). 32-8's own words ("heals and first strikes are not cut in half", the rejected alternative "the first ten Levels get slower") rule that out, and no share fitted at Level 60 can hold Level 5 too (today's casts are 2-4 swings there and half a swing at 60). So every number row carries `base`, its old version-I numbers, and lands `max(base, share)` x its step: Level 10 in 5.81 h again, the start-kit tank's first hours exact, and past about Level 15 every cast is its share alone (`spell-audit.mjs` section 3). Alternative: drop the floor and re-cut the early Level curve, the early drop rows and the pace record instead (the audit's C4 item 1 foresaw "the early brackets of the Level curve were split on today's casts").
- **Call 2, Rend on the default melee set:** with Power Strike and Cleave gone, an unedited axes bar had no strike at one target, so `rule-subjects.js` melee_dps is Power Strike, Turning Cut, Rend (on its Plain Rupture Rune, 1 g a cast, own runes first); the sword and the club keep Power Strike and Turning Cut. Migration 1024 restates hr_hunt_role_rules.
- **Call 3, Turning Cut still unlocks at Melee 10:** the merged row keeps the sword's ruled unlock (Tyler 11-19, the sword speeds up once its area strike comes online), so the axes and the hammer have no area move from Level 1 to 9 (Cleave did). MEASURED with the floor: the lone hammer at the Thicket L5 21.1k XP/h (base 27.6k, -24%), axes at Wickstead L8 28.4k (base 34.4k, -17%); the tank, sword and Mage within 4% of base. Alternative: a per-discipline unlock, or Turning Cut from 1 for every shieldless weapon (the sword then speeds up early, against 11-19).
- **Call 4, the version ladder x1.4, not B5's x1.6:** fitted at both ends (32-8) a deeper step cut Level 10 casts further (B5's ladder: a heal at Level 10 at 55% of today's; this one 59%, before the floor); Rend's bleed already stepped +10% a tier. Under the rule a rune tier is worth 10%, which weakens 32-spell-audit.md D reason 2 for nothing (Storm and Bone are ruled at 25 / 40 anyway).
- **Call 5, heals and shells land whole (no roll):** a hit still rolls half to full like a monster's spell; a heal answers a wound and reads as one number on the bar.
- **Call 6, the dark rows (L43, L44) were converted, not sized:** Brand, Reave, Updraft, Blight and the fist strikes are shares at their old Level 60 worth with their old numbers as floors; their clocks and stand-ins (Updraft and Blight name no `replaces`; the Hands' three clocks) are still those lanes'.
- **What moved (balance guard, report mode, 2 seeds x 1 h, before -> after):** G23 RED -> in band (dual_axe 1.25 -> 0.58, club 0.92 -> 0.83). G2 the best way over the median 1.22-1.49 -> 1.14-1.32 (the Mage still leads). G1 the lone hammer x the contract: Thicket 1.13 -> 1.06, Glade 0.96 -> 1.07, Ford 1.22 -> 1.37, Slake 1.03 -> 1.26, Pyre 1.19 -> 1.47, Hold 1.09 -> 1.38. Every melee way +9-37% Level XP from Glade to Hold, the bow +10-17%, the Mage and the Healer +1-11%: Power Strike 0.45 -> 1.2 swings (B5's opening), Turning Cut at 2, heals that hold past 110. K1 0.88 -> 1.06 on XP and kills (into its 0.9-1.1 gate), 1.36 on gold, so G3, G4, G5 and G19 are now judged: G4 Ford 2.93 -> 3.38, Slake 2.61 -> 3.08; G5 the four's low point 68-70% -> 71-73% (Deadly is not a fight); G19 Ford three 3.14 -> 3.59; G8 9.6k / 15.5k / 16.3k a hero-hour. All of it is L16's to size with the tiers and the XP fits (the plan's order: the spell rule first, so each dial is sized once). G6 5.8 h either side. The quick progression grid, re-played on the rule (cb458f0d0, committed; the full grid is left STALE for L16's own run): P12.to300 RED -> ok, P3 RED -> off, P4 off -> RED (5 BiS lone 1.30), P1 RED rows 4 -> 7 and P2 4 -> 9 (faster than the ruled hours), P11.ten 3.25 -> 3.83 h to Level 10 (no Cleave before Turning Cut's 10, call 3).
- **Data this lane re-pinned to hold red guards (each with its measurement in its comment):** the Hearthfind bosses' kill rates 116 / 139 / 93 -> 141 / 168 / 117 a hour (hours as ruled; 1030), `SCALED_HUNTS.xpPm` 740 -> 730 (fee-guard; 1031), four Ox Road drop rows (staged ground: three Scarce under 0.75 h, one Rare under 10 h), engine-parity's warrens-4 (base green on the old pin), and two test scenarios: first-week-bands' weak-hammer mutant 7/10 -> 7/8 (a 7/10 Iron rung pays over +5% once casts scale with the blow) and ECON-1's fresh hammer keeps Cleave's rule on Turning Cut (with the merge it spent half the mana and never drank).
## 2026-11-20 · CARRY ON (systems-engineer, lane: `lane/c-carry-on`, plan L07) → COORDINATOR (rulings of record) · **OPEN (built, staged): the 10-22 "Leave if anyone leaves" default changes for the account's own parties**
- **What:** L07 (Tyler RULED 27-1 on 2026-11-20) says "own heroes end together only if you say so". `1025-own-heroes-apart.sql` makes the box unsaid by default: an unsaid box reads OFF in a party of one account's heroes and ON beside another account's hero (the 10-22 default for friends, unchanged). A ticked or unticked box is that answer everywhere. On its first apply every `true` (the old default) becomes unsaid, so a player who had ticked it on loses that tick: say so in the release note.
- **Ask:** the Coordinator updates the 10-22 line in rulings-of-record to the two defaults above. No designer decision is open.
- **Found, not this lane's (set/v0.2.144 at c52b56f7b, the tend-the-field lane, 1017-tend-the-field.sql):** `tests/refusal-words.mjs` RW1, `nothing_to_tend` from hr_farm_tend has no line; `tests/settle-budget.mjs` SB-3, hr_purse_of is called 8 times a watched settle (the tend plan reads the purse in a projected section) and is a LANGUAGE sql function with a SET clause (tools/gen-plan-cache.mjs). Both red on the set without this lane's diff.
- **Also (1024-carry-on.sql):** Carry on starts nothing a hand press could not, and stops at the account's own heroes: a hero in another account's party joins only a hunt that party is already on (`party_leader` otherwise). The Tower climb (L30) is a later row of the after-hunt plan; the plan's `after` field is that seam, and a hero whose last session was a climb reads `tower_only` and is not started.

## 2026-11-20 · TO-HIT RATIO (systems-engineer, lane: `lane/c-tohit-ratio`, plan L15) → GAME DESIGNER + ART DIRECTOR · **OPEN (built as ruled): what the ratio does off the reference hero, and five dials this lane moved to keep their guards' rules**
- **Built (21-1, 21-2, A-1, A-8):** `src/data/to-hit.js` (the ratio, base 20, rails 5-97%, the generated reference hero `REF_HERO` from `tools/gen-ref-hero.mjs`); every monster row carries `aim` and `evasion` (formula rows from `formulaStats`, the 118 hand rows ported to land their old chances on the reference hero of their Level); `ACC_DEF_MUL`, `STAT_FORMULA.def.past` and `baseAcc` are gone; a tier's dial and a boss's enrage raise the aim as they raise the attack. MEASURED (`tests/balance-sheet.mjs`): 85% / 70% within a point at every Level 10-1,500; +10 Defense -13.7% at 10, -5.0% at 105. Named `evasion`, not B2's "ward": the light-armor line already says ward.
- **A semantic the designer must know before L16 (MEASURED, `tohit-ratio.mjs play --engines today`, 2 seeds x 1 h, before -> after):** B2's words are "a tier's harder blow raises the aim exactly as it raises atk", and that is what is built (`atTier`: aim x dmgPm, as atk). B2's measuring tool did something else: it raised the to-hit by the old 2% a point of the raised attack, which reaches its 95% rail on Deadly from about Level 60, so B2's table showed a four's front seat taking 10-69% MORE on the hardest tier. On the built rule the four's front seat on the hardest tier takes +58% at the Glade (30) and 26-28% LESS from Pyre Field to the Catacombs (Krell's Hold 148,795 -> 107,003 an hour; low point p10 63% -> 68%; 0 deaths either way), Level XP +5% to +18% there. The lone hammer on Normal matches B2: damage taken -16% to -31% from 50 to 175, Level XP within 3% on the live grounds, Carter's Rest net -498 -> +17,940 and the Catacombs -25,788 -> +22,927 an hour. So Deadly is gentler past Level 60 until L16 sizes its dials on this engine (B2's 1750 was read on the tool's rule).
- **What the designer should rule on (MEASURED, real settle):** Defense over a monster's own counts less than on the old line, so outgrowing a ground protects less. The Glade's top (a tank at 31, every skill 31): monsters land 32.5% -> 53.2%, damage taken +62%, typical low 92.5% -> 87.9% (Easy either way); `first-week-bands` read "over 90" from the old engine and now reads the sheet's own Easy line (over 80). A lone tank at 31 under the Glade's Deadly full box: 0 -> 6 deaths an hour (hunt-tiers' XP fixture moved to Level 44, where it lives). A bare Level 30 bow in no armor standing in the Mill Cellar dies about three minutes before its ten-minute no-fight end (the rats' aim against 20 + Defense 30 lands about 17%, where the old line sat on its 5% floor); hunt-live's and ranger-bar's no-fight fixtures now carry Defense 150, since their subject is the end, not the Cellar. In band it goes the other way: the career hammer at Hask's Ford (50) is landed on 81.5% -> 63.4%, damage taken -23%. L16 sizes the harder tiers on this engine and should read the lone hero too (G5 and D1 read only the four).
- **Dials moved to hold their guards (each with its measurement in its own comment):** the Tower's heat 10 -> 12 permille a floor (TC-CURVE's 15-point drop; L18 takes the heat out); `SCALED_HUNTS.xpPm` 760 -> 740 (fee-guard; scaled hunts are dark until L31); the Warrens' Chief and Foreman paces and two Ox Road Scarce rows, one lucky row and one salvage row (drop-tables, lucky-finds, field-salvage bands); three Hearthfind boss kill rates (one_in re-derived, hours as ruled); the Thicket's and Wickstead's harder-tier `dmgPm` (the tier sizing reads the ratio: 2672/3377 -> 2115/2685 and 2614/3295 -> 2115/2685). Staged: 1020 tiers, 1021 sessions (the called Chief at the field rates), 1022 Hearthfind, 1023 scaled hunts.
- **For QA / a hardening lane (found here, not this lane's code):** `tests/hunt-core/hunt-tiers.mjs` plants a copy of `tools/balance-sim` and imports its `cell.mjs`, whose `gear.mjs -> weapon-power.mjs` imports `../../tests/_is-main.mjs`, which the plant never copies: every hunt-tiers mutant "is caught" by `threw Cannot find module ... _is-main.mjs` (`--only normal-is-the-ground --verbose` shows it). Its proofs are vacuous. The fix is first-week-bands' way (the real `loadCellRunner(p.root)`) plus a throw never counting as a catch, as `tests/hunt-core/to-hit-ratio.mjs` does; then each of its 25 mutants must be re-proved, so it belongs on its own branch.
  - **RESOLVED (qa-engineer, lane/c-hollow-proofs, 2026-11-20):** the plant no longer copies `tools/balance-sim` (the real `loadCellRunner(p.root)` and `loadPlay(p.root)`), a throw or a `fixture:` line is HARNESS (`tests/_mutant-verdict.mjs` caseVerdict), and all 26 mutants are caught by a named case, each printing its rule line. Two ("the sheet pulls Dangerous by party size again", "a ground gives a party its own pull again") could not load at all (the sheet's own load-time throw), so they now plant the reader half too (`SHEET_BY_SIZE`) and `rows` catches them. The same shape (`R.ok(!!why, ...)` after `why = 'threw ' + e.message`) sat in h1/h2/h35/h4 `suite()` and 18 more hunt-core runners, tally-window scored the first word of ANY fail line: all judge through the shared verdict now, and `node tests/_mutant-verdict.mjs` fails any runner in tests/ or tools/ that scores a bare truthy answer (21 page runners on the fail-count line are OWED, frozen, see its header). The sweep found 110 more hollow hunt-core mutants (sewer 90); each now runs its rule or was re-aimed / retired with its measurement (DISCOVERIES 2026-11-20).
- **For the art director:** the character sheet's "Hit chance" is now the hero's roll on a regular of its own Level (it was against a foe with no defense; on the ratio that is 97% for everyone). B2's "your rating against theirs" (a monster card showing aim and evasion) is not built; the 11-17 entry below (the formulas name numbers no screen shows) covers it.

## 2026-11-20 · RULING vs DATA (game-designer, lane: `lane/c-levels-7-9`) → COORDINATOR · RESOLVED 2026-11-20 by the designer (the Coordinator handed the call over, CLAUDE.md §3.1): Levels 10-20 take the XP back, not 10-15, and Hunts/the coach are left as they are
- **The problem:** for the new player as played (`life.mjs --policy new`: start kit, Hunt again in the Thicket, within 4% of the retention dive's blind play), holding the total to Level 16 kept Level 10 at 6.5 h or more and pushed Levels 11-15 to 4.7-5.1 h each. Steps 10-15 can't absorb the XP Levels 7-9 give up without passing step 16, or without step 10 taking over twice step 9's hours (C6).
- **Decision: take the XP back over Levels 10-20, total to Level 21 held.** The Glade's Levels 16-20 take most of it (each about 161-163k XP, just under step 21's 162,975), where every hero earns two to three times the Thicket's rate. Measured: the new player reaches Level 10 at 5.98 h (was 10.58) with Levels 7-9 at 1.16 / 1.54 / 1.77 h and Levels 10-15 at 3.20-3.92 h, and Level 16 at 27.4 h (was 35.1). The played tank's Levels 16-20 take 1.9-2.7 h each (were 1.3-1.7), and it reaches Level 21 about two hours sooner. Every step from 21 on is unchanged.
- **Why not Wickstead from Level 8 in Hunts and the coach:** Hunts already recommends Wickstead at 8 (in band 8-18, and the start kit lives there: 0 deaths, 25-28k XP an hour). The calibrated player is the one who doesn't follow it: a hunt runs until stamina ends and Hunt again repeats the ground. A card the model can't prove moves anyone wouldn't move the guard's hero, and L04, L07 and L08 already own those cards (the away card names a ground that opened). A player who does follow it reaches Level 10 at 5.1 h on this curve.
- **Held by:** `tests/start-kit-pace.mjs` (Level 10 inside 5-7 h, aim 6; Levels 1-9 under 2.5 h, aim 2; Levels 10-15 under 4.5 h, aim 4) and the balance guard's G6 in red mode. Board: "2026-11-20 Levels 7-9 re-cut".
## 2026-11-20 · BALANCE GUARD (systems-engineer, lane: `lane/c-balance-guard`, plan L14) → GAME DESIGNER + COORDINATOR · **OPEN (built, report mode): four lever classes are the guard's reading, and the CI budget took the guard without a re-budget**
- **Classes PROPOSED (G14 needs every data lever classed, so these are booked in `tools/balance-program/model.mjs` LEVERS, labelled PROPOSED):** a meal's damage, crit and Defense buffs (and the Cellar's buff length) as `add` (C6 keeps the combat effects); room speed rungs and gather or farm meals as `add` on town hours; the seven `dropBonus: 1.15` monster rows as `cut` (C14, one drop budget); companions as `dark` (held, no lane). `cut` and `dark` rows are pinned by count in `tests/balance-guard.baseline.json`: a new XP food row, charm rank or companion bonus is red until it is classed. Designer: confirm or move each; a move is one LEVERS row.
- **Not the plan's wording:** G8's four buys Carved (Mage) and Etched (Healer) runes through a new `cell.mjs` option `runeTierByRole`; the real Krell Healer healed on Chalked Water, which a per-role cap cannot say. G11 counts training days on the lone pace table (`LEVEL_PACE`, the slowest an Own four hero gets there), so it is an upper bound. G10's armor step is the same hero one armor tier behind; at Krell's Hold it reads 1 to 6%, the to-hit clamp of S6.
- **Coordinator (smoke.yml is yours):** the guard registered itself in `economy-selftests` (measured 25.9 min, timeout 52). It adds about 2.5 min plain on every push, about 3 min of `--selftest` when its side moves, and on the schedule its plain step plays the nightly twin (+6 min measured locally). That is under the timeout and over the x2 rule (about 37 min x2): re-budget the job or move the step when you next touch the file.
- **Added (plan audit follow-up):** G19 to G24 (all report) and K1's gate. G3, G4, G5, G8, G19, D1, D2 and the party rows of G20 and G22 print "uncalibrated" until the harness four reads the real Krell four inside 0.9-1.1 on XP and 0.8-1.2 on gold (today 0.83 and 0.51). Closing that gap is the harness's four (cheap heals, home-made stock), the next L14 step, before L16 can turn any of them red.

## 2026-11-20 · BALANCE GATE (systems-engineer, lane: `lane/c-pack-gate-party-rule`) → GAME DESIGNER + COORDINATOR · **OPEN (built): the pack gate's party lines moved to Dangerous and Deadly; the played four now reads under its heroes alone or over the ceiling on most live grounds**
- **Built (Tyler 2026-11-16, "normal isn't meant for parties anyway"; the FINAL "every Dangerous/Deadly party mix stays >= the same heroes alone", "Deadly mixed four <= ~2.5x pace"):** `four-xp` and `feel-seat-below-solo` grade Dangerous and Deadly only, against the SAME heroes alone (`grade.mjs sameAloneXp`, the reading `tests/party-class-xp-line.mjs` binds; quick plays the Healer alone as a seat twin no other rule reads); a new `four-deadly-pace` holds a mixed Deadly four at <= 2.5x the contract at its top Level (a report under Level 10, Tyler 11-18). `balance-sheet.js party.fourVsSolo` retired for `{ vsAloneMin 1.0, deadlyFourVsContractMax 2.5, paceFromLevel }`, pinned equal to party-class-xp-line's bars. Normal grades no party line. The Q2 20-Level-band exemption is gone with the window it served.
- **Why the live grounds "passed": they never did.** No waiver, exemption list or baseline exists (`grade-baseline.json` is read by nothing); CI runs only the grader's synthetic selftests, never `pack check` on a live ground. On set/v0.2.143 every one of the 15 grounds FAILED the Normal lines (`pack check --mode quick`, 1 seed x 1 h).
- **Measured on the moved lines** (`pack check <g> --mode quick`, 1 seed x 1 h, the played hero; party-class-xp-line plays the plain one at the floor only, so its fours read cooler): PASS Carter's Rest, the Ox Road, the Pyre Field, the Cellar. Party-line FAILs: the Deadly four over 2.5x the contract on the Glade (3.36 at 16), the Warrens (3.31 at 32, 2.66 at 41), Hask's Ford (2.99 at 45), the Slake (2.76 at 50), the Muster (2.59 at 55); a four under its heroes alone on the Glade's Dangerous (0.97 floor, 0.90 middle), Hask's Dangerous (0.98) and the Sewer's middle (0.88-0.90). Krell's, the Roost and the Catacombs fail only non-party lines.
- **For the DESIGNER (not papered over):** the ceiling FAILs are the synthesis plan's S1/L16 (docs/design/balance-program/30-plan.md: the tiers and each ground's XP fit ship together). The Thicket (0.48-0.58) and Wickstead (0.47-0.52) fours sit far under their heroes alone on both harder tiers, which party-class-xp-line PRINTS as STANDS (Tyler 11-16 "all hunts work the same"); the grader binds them, so their pack check stays red until that STANDS is written into the sheet as a ruling or the grounds change. Your call which.

## 2026-11-19 · SECURITY + INTEGRATION (systems-engineer, lane: `lane/c-delivery`) → SECURITY ENGINEER (pre-EA review) + COORDINATOR · OPEN (built): the Pages build job now runs one third-party package
- **What:** `.github/workflows/pages.yml` said "no npm install, so no third-party code runs in the job that decides what players are served". Minifying and bundling the modules (architecture audit items 1 and 5) needs a bundler, so the build job now runs `npm ci --ignore-scripts` and imports **esbuild 0.28.2** (exact, devDependency; it and its platform binary are pinned by sha512 in package-lock.json). Install scripts are off, so no other package in the tree runs; the deploy job still checks out and runs nothing. A compromised esbuild release could rewrite what players are served, which the old job ruled out.
- **For Security (the one EA review):** keep it (pinned, scripts off, read-only token) or ask for a narrower install (a lockfile holding esbuild alone). Revert path: `node tools/build-site.mjs --deliver plain` needs no package and serves the site as written.
- **For the Coordinator:** this, like the stamp above, reaches players only after the Pages flag day. Until then CI's `build-site --check` (client-guards-2, which already runs `npm install`) builds and judges the bundled site on every release, and SITE-10's ceilings (`tests/boot-path.baseline.json`) move only through `--boot-path-raise "<why>"` / `--boot-path-write`.
- **Fonts (same lane):** the pages no longer ask Google for anything; the faces are `assets/fonts/*.woff2` (SIL OFL 1.1, licences beside them) in tokens.css's WEB FONTS block. The guards' font pin (`tests/_test-fonts.mjs`) now swaps that block in the tokens.css they are served, and loads its faces from the page's own origin (the CSP's `font-src` is `'self'` only). A lane that adds a face adds it inside that block (test-fonts TF-5).
## 2026-11-19 · DESIGN (systems-engineer, lane: `lane/d-elements-6b`) → GAME DESIGNER · RESOLVED 2026-11-20 by the designer's rulings (whole-game audit §6), built in `lane/d-elements-6b-rulings`: the sword's Necrotic and Storm pair against the 11-19 tank and sword rulings
- **Resolved:** (1) the tank gets the pair, PARTY ONLY (`party: ['tank']`, abilities.js partyOnly, read by the engine and the bar); a sword alone casts both alone. (2) Brand and Reave STAND IN FOR Flame Strike and Power Strike (`replaces`: a cast takes one of their cooldowns), so they replace a cast. Rows MEASURED to the band (6 seeds x 2 h, paired, neutral monsters): Brand [7, 13], Reave [5, 9], Blight [4, 7], Updraft [5, 9]. Brand +4.2% Level XP/h at Melee 25 on the better of the two bars (after Flame Strike, on Power Strike's turns; -1.3% in place of Flame Strike); the pair at most +8.8% at Melee 40 on any bar; 0 deaths. Power Strike never scales, so a rune strike on its turn gains more with Melee: re-read at a higher band before going live.
- **What:** Appendix B3 (11-18) puts Brand and Reave "on the tank's list as well, the way Flame Strike does". Tyler 11-19 (newer): tank rune spells "hold, protect and control; they never make a lone tank kill faster", and the sword alone is slow early on purpose. Built (dark, behind `NECROTIC_STORM.live`): the pair is the sword ALONE's; the shield's list takes neither.
- **Measured** (tools/balance-sim/elements-6b-table.mjs on the real settle; played profile, skills pinned at the band, every supply bought, 3 seeds x 2 h, paired): a lone sword gains +12.8% Level XP an hour with Brand at Melee 25 (the Glade, Normal) and +29.2% with Brand and Reave at Melee 40 (the Warrens), for +82% and +62% on the store bill, no deaths either way. Brand lands about what Flame Strike lands a cast (B3 gives it Flame Strike's mana and cooldown; its damage, which B3 leaves open, was placed at Flame Strike's [8, 14]).
- **Ask:** (1) does the tank get the pair, and if so party-only like Frost Slam and Shelter; (2) is +13% at 25 and +29% at 40 the "speeds up later" the sword ruling allows, or should Brand and Reave land less (a data edit on two rows).

## 2026-11-19 · INTEGRATION (systems-engineer, lane: `lane/c-version-stamp`) → COORDINATOR + EVERY LANE ON src/ · OPEN until the flag day: the release stamp moves to publish time
- **Until `tools/strip-version-stamps.mjs` runs on main, the source is stamped and every tool takes both states.** A Node test or tool that reaches the engine's own module instance writes `pathToFileURL(…).href + sourceQuery(root)` (tools/lib/version-stamp.mjs), never `'?v=' + BUILD.version`: on a bare source that is a SECOND instance (a what-if on "both instances" then lands twice: balance-sim's worker squared its multipliers, hunt-live's LV-KINDS ran monsters at 100x HP). A mutant anchor stops before a specifier's query (`"from './x.js"`), never on `?v=`. A query added to a module URL is `(q ? q + '&' : '?') + …`.
- **A lane open across the flag day:** run `node tools/strip-version-stamps.mjs` on the lane first (clean tree; idempotent), commit, then merge main: the only conflicts left are import lines the lane itself edited; take the lane's side. tests/cache-buster-guard.mjs names any stamp that comes back (STAMPED).
- **Order:** Tyler flips Pages to GitHub Actions (pages.yml then deploys the built `_site`), THEN the codemod. Never the codemod on a branch deploy: it would serve every module unstamped.
## 2026-11-19 · DESIGN (systems-engineer, lane: `lane/a-camera-framing`) → COORDINATOR + GAME DESIGNER + ART DIRECTOR · OPEN (built): the hunt camera's order changed; three leftovers are not the camera's
- **Supersedes part of Tyler's 2026-10-22 hunt camera (and the 2026-10-22 OPEN "a sliver of void" entry):** the UI audit's N10 (Tyler approved 2026-11-18) ranks NO VOID on the map's art above "the hero at the middle of the uncovered World". Near a room's edge the hero now moves toward that panel, never closer than its ring (its tile and every tile touching it, 1.5 tiles from its middle), instead of the void showing. At the 10-22 spot (the Warrens' Tool Store, 2000x790) the hero stands about 2.8 tiles from the analyzer, as under the old NO VOID; if that reads "ridiculous" again, the answer is art past the edge, not the camera.
- **Residual void (art):** on the tiles a hunt hero fights on (each spawn and 2 tiles round it), the void now shows on 8.4% at 1440x900 and 1280x800 (was 44.9% and 40.1%), 1.3% on the phone (6.7% with the coach card). The Mill Cellar keeps 47% (was 95%), all on its east columns (x 18-21) and bottom rows (10-11): its painting reaches 2 tiles past the floor east and south, 3 west, and the analyzer is 4.7 tiles wide, the bar 2.8. Either a display-only surround (the edge material drawn past the map, the 10-22 entry's option) or a cellar painted 4 tiles wider east, 3 west and 2 south closes it.
- **The Hearth's cupola at 1440x900 (game designer: the first stand):** the art (390 px) is taller than the town's World over the action bar (325). A new hero on hearth_square's first stand (plan 109,47, two rows from the Hearth's foot) now sees the chimney, banner and crest, with the cupola's top 50 art px cut; from (109,45) the same rule shows the whole Hearth (tests/world-core.mjs C10). A phone (139 px over the bar) frames no showpiece: the camera stays on the hero there. Moving the first stand is a stations catalogue migration (lane C) and an ST-12 re-check.
- **The coach card over the chimney (art director):** at 1440x900 a new hero's "Tamsin's rats" card (top right, x 1160-1420, y 75-185) touches the cupola's right edge; the showpiece's width fit moved the banner clear of it.

## 2026-11-19 · DESIGN (systems-engineer, lane: `lane/d-harder-monsters`) → GAME DESIGNER + COORDINATOR · OPEN (FYI, built): what the +10% moved besides the monsters
- **Party advice: a party suits a ground it earns OVER alone on (`> 0`), not even (`>= 0`).** With monsters a tenth harder a hero alone dies more on Wickstead's Deadly, and the re-measured mixed-pair line there read 0 (was -5). At `>= 0` the advice's highest-floor rule then sent a pair at 8-15 to Wickstead, where it breaks even, off the Sewer, where it earns +10 to +15 (tests/hunt-floor-warning.mjs G4/G8, Tyler 2026-11-18 "open at 5"). src/shell/hunt-list.js fitsGroup now asks `> 0`; Tyler 2026-11-16's ">= the same heroes alone" stays the harder tiers' tuning bar. Designer: confirm, or rule break-even as suiting.
- **Pace held by the XP dial, not the curve.** At XP a point unchanged the eight careers levelled 4-6% faster (Level 50 in 146.9 h on the curve, -12.5% of 168, past LEVEL_PACE's 10%): more HP slows a kill, not the walk and rest around it. `STAT_FORMULA.xp` a and min x0.96 holds the pace (155.1 h median, 155.4 before); the Cellar's XP fit 1.28 -> 1.22 keeps level-curve C6's 2x wall closed. So a kill pays about +5% XP for +10% HP, coin +10%.
- **Hand-fitted encounters were NOT stepped:** Lord Krell's Hall (Krell 18,000 HP, atk 247, his adds; fitted to Tyler's 11-05 ship bar, and his swing sits on the hall's written 55% blow cap) and the called rooms (boss-calls.js). Three staged-pack spells were held at the 35% floor-hero rule (the Ox Road's Hot Coal 1500 -> 1350, the Catacombs' Bone Slide 2000 -> 1800 and Snuff the Candles 1500 -> 1350), and the Rat King keeps his attack 6 (FORMULA_EXCEPTIONS). Designer: step Krell's Hall on its own fit, or rule it out.
- **Back-row spells (the audit's fix 2, its own commit):** the Pyre Field's Stoker casts Burning Ash (1.5x every 16 s) and Krell's Hold's GATEKEEPER Hot Pitch (1.0x every 16 s), and the Slake's Cold Bilge is 1800 every 12 s (was 1500 every 16). Hot Pitch sits on the Gatekeeper, not the Farmhands as the audit read: on the swarm a lone tank at the Hold's floor earned less Level XP than at the Pyre Field (tests/hunt-core/forest-cave.mjs harder-pays-more, Tyler 11-04). It is 1.0x, not the seed row's 1.35x+: since the set's seat fix the Lookout shoots the replayed fours' Healer, and with a 1.35x pitch on top that Healer died 0.5-1 times an hour where the record has none (tests/balance-calibration.mjs BC-3). So on the Gatekeeper it adds only 3-4k an hour to each back seat. The Deadly dmgPm 1330 -> 1500 what-if was measured and NOT taken (the Pyre Field's recorded fours netted next to nothing at 1500). Designer: if Deadly fours should struggle more, those two dials are the next ones.
- **OPEN, NEEDS THE DESIGNER: the staged Catacombs' harder tiers are a death loop, and the step tips one party cell under its bar.** tests/party-class-xp-line.mjs reads the Catacombs' Deadly tank + bow pair at 0.968 of the same heroes alone (4 seeds 0.88; set/v0.2.142 1.29). It is not a fit: at the floor (165) the harness tank (Dawnsteel, 2,291 HP, 53% absorb) dies 28-29 times in every half-hour cell on set/v0.2.142 too, alone it earns 0, and the pair's XP is the bow's kills between the tank's deaths, so the ratio moves with the dice and any dial. Pull 5 reads 1.51 and the pair still dies about 250 times an hour, so it was NOT taken. The sample says it opens "only after the full grade": its harder tiers (or its blows at 165, past the last gear tier) need that grade before this cell means anything. Until then the guard is red on this one cell.
- **Sim against real (for lane/d-balance-audit):** the replayed recorded Deadly parties stay at 0 deaths after the step (a head's store bill up 3-115%, net coin after the store down 2-30%; Krell's Hold most); the plain harness four still dies on Deadly where real fours don't (calibration guard's printed plain rows: 20-22 deaths an hour at Krell's).
## 2026-11-19 · DESIGN (systems-engineer, lane: `lane/d-first-day-path`) → GAME DESIGNER + COORDINATOR · OPEN: three consequences of the complete look's changes 1 and 8
- **The lone pace moves (change 8).** Sending a lone hero to the Warrens from 36 (`soloFrom: 36`, measured: 0 deaths for a played hammer, bow and Mage) takes their road to Level 50 from 105-133 h to 80-103 h (the table says 168 h). `tests/level-curve.mjs` C1 is red: `tools/balance-sim/level-pace.json` was measured on the old advice (its fingerprint holds `soloFrom` and the advice's pick by Level). Re-measure ONCE on the assembled set/v0.2.142, after lane/d-harder-monsters (whose +10% monsters move C1 too), then judge C2/C3. If the pace falls out of tolerance the designer chooses: re-fit the curve, a later `soloFrom`, or a lone Warrens fit. Numbers: PRIORITY_BOARD "2026-11-19 First-day path".
- **A scaled Cellar no longer plays on unscaled (change 1 meets scaled hunts).** Scaled hunts' design (tests/scaled-hunts-server.mjs SH-OUT, SH-FEATURE) let a hunt on an outgrown ground play on at the ground's own rows when its hours ran out or the switch went off. On the Cellar, with its exit at Level 5, that window now ends `outgrown` (the hero is back in town, the itinerary picks the job or yard). I judged that right (a Level 20 hero on an unscaled Cellar is the stranded hero change 1 exists for); every other ground still plays on, and SH-OUT / SH-FEATURE moved to the Thicket to keep that covered. The door admits a hero at the exit when its hunt will play scaled (`hr_hunt_scaled_at_door`). Levels 5-8 can't hunt the Cellar at all (the scale opens past its band's top, 8).
- **"No Level is refused" (11-04) vs the Cellar's door.** The 11-04 ruling is about pushing UP into harder content; the Cellar's door refuses a hero who has outgrown the tutorial room (the brief: "a Level 5+ hero can't start a Cellar hunt that runs on"). A warning would have let a hunt in that ends at its first swing. Flagged so a later reader doesn't take one for the other.
## 2026-11-19 · SYSTEMS (systems-engineer, lane: `lane/b-tank-runes`) → GAME DESIGNER + COORDINATOR · OPEN (FYI, built): what the tank rune spells' engine pieces move beyond the two spells
- **Hoarfrost's chill grows with its rune (piece 3, one rule for every Ice spell).** A Mage on a Scored / Etched / Carved / Graven Ice Rune now chills 35 / 40 / 45 / 50% (was 30% on every rune). The played profile casts Hoarfrost on the store rune of its Magic's tier, so Mage parties hold monsters a little longer; tests/balance-calibration.mjs stays green on the merged set with no DECLARED_SHIFTS row (3 recorded hunts, every metric inside TOL).
- **The refund reads who cast the shell (section 6).** A Mage recasting Arcane Barrier over a Healer's Protective Ward got the Ward back as mana today; it no longer does (shieldBy). Small, real, and the reason the world shape moves.
- **The world shape moves** (abilities.js PERSISTED `shieldBy`): 2027-05-25-tank-runes-hunt-sessions-catalogue applies, then the hr-accrue carrying the same src/core deploys AT ONCE; each running hunt's world restarts once. tests/hunt-core/engine-parity.baseline.json is re-pinned on world hashes only (timeline and tally held in all four scenarios): lane/d-harder-monsters re-pins on top whichever lands second.
- **For lane/d-audit-fixes-sim (default bars in rule-subjects.js):** tests/hunt-core/conditions.mjs area-moves-default now names OFF_THE_DEFAULT_BAR (frost_slam, shelter: Tyler 2026-11-19, "Do not add rune spells or XP to the tank's default bar") and goes red if either lands on a default bar; a new mutant there anchors on the tank's ROLE_RULES line (`tank: Object.freeze([slot('challenge'), slot('power_strike')]),`).
- **For lane/d-audit-fixes-sim (found on the set/v0.2.142 merge, NOT this lane's):** tests/hunt-core/party-defense.mjs is red on set/v0.2.142 itself, lone-tank-holds "CONTROL: no peel in 16 seeds" and its Challenge mutant escapes. The set's own tree and this lane's merged tree print the same numbers (14,309 swings, 0 target switches, 708 kills/h). Extending PEEL_SEEDS to 67 seeds still found 0 switches, so with Flame Volley on the bow's default set the peel looks gone from the fixture rather than unlucky: the fixture (the four's bars or its density) needs re-deriving, not more seeds. Not changed here.
  **RESOLVED 2026-11-19, lane/d-party-defense-fixture (systems-engineer):** not Flame Volley (taking it back still reads 0 peels in 16 seeds) and no game bug. Every Sewer peel came from the runner's old role-name entry: the Healer created the world on the entrance's first tile and the tank joined onto the same tile, so the pack queued on him 13 times in 1,766 Healer swings; seated as played (tank first), 1 in 1,688, and a peel needs a queued monster. The fixture moved to the Muster Barrows at Level 60 (a party ground whose barrows queue on the tank): 9 peels on 6 of the 16 seeds, 0 swings reaching a non-tank; both lone-tank mutants caught by a swing on the Healer, not by the CONTROL.
- **Words:** Shelter's version V shell at Melee 60 is 140 (the engine floors 30 x 4690 / 1000), the board's table says 141. The slow line now says "slower attacks and casts" for Hoarfrost too (it slowed both all along).

## 2026-11-19 · SYSTEMS (systems-engineer, lane: `lane/d-rivets-learn`) → BACKEND ARCHITECT + GAME DESIGNER · OPEN: the engine still auto-learns any item carrying `recipe` on drop
- **Found:** supabase/functions/hr-accrue/accrual.js has three b352 arms (the hunt, gather and artisan deltas: `if (items[id] && items[id].recipe)`) that turn a dropped item whose row carries `recipe` into the finder's `recipe:<id>` flag at once, never a bag row. That was the cut cookbooks' auto-unlock. The brief's pattern row (`recipe: 'reforge_steelgrate'`) would have made the Kingsgrate Rivets auto-learn for the rare roll's winner, so no hero could read, store or trade it and hr_recipe_learn would never be pressed (measured on a planted live copy: 6 rare rolls, 0 items credited over 3 x 6 h).
- **Built:** a pattern names its recipe as `teaches` (src/data/patterns.js, whose header forbids `recipe`) and is catalogued through its gate (`gated` on the recipe: gen-unlocks' gate ids, which hr_recipe_learn reads). tests/pattern-learn.mjs PL-2 / PL-3 hold it: switched on, a Rat King kill credits the pattern to a bag. tests/recipe-learn.mjs R1 now counts what gen-unlocks catalogues (gates and `recipe` items), so going live is not a false red.
- **For the backend architect:** the three arms are dead (no `recipe` item in the catalogue) and contrary to the 11-19 ruling (a pattern is an item until a hero reads it). Retiring them is an edge change (accrual.js, the A14 parity census, tests/artisan-progress-model.mjs A10 and its M13 revert) for a lane with an edge deploy. Until then a row authored with `recipe:` auto-learns silently.

## 2026-11-18 · DESIGN (systems-engineer, lane: `lane/c-arm-switches`) → GAME DESIGNER + COORDINATOR · OPEN: Open Halls is weak (scaled loot RULED by the designer and BUILT; the rest fixed on the lane)
- **Scaled loot: RULED (designer 2026-11-18) and BUILT.** At the card's Gold × a lone scaled Cellar out-earned the best free ground (L20 7,702 after the fee vs the Sewer's 6,844). The designer's rule: change the item multiple, not the price, every ground stays scalable; a scaled kill's drops gain as much gold as its coin does and never more than Gold × (`src/data/scaled-hunts.js` lootPmFor, the card's two rows "Gold ×" and "Drops ×"). Measured on the real engine (tests/scaled-hunts.mjs, green): the Cellar L20 lone 3,417 after the fee vs the Sewer's 6,844 (designer's read ~3,780), L50 7,367 vs 11,607 (~7,170); items a kill ×2.41 against the card's Drops ×2.42 at the Cellar L20, ×4.02 against ×4.00 at the Thicket L41. The server bounds items at the rolls (2027-05-17-scaled-loot.sql) and arming waits on the edge deploy (2027-05-18-arm-scaled-hunts.sql, HELD).
- **Open Halls waives 50 gp a fight.** Since the series reshape (Tyler 11-14) a Call out fight costs 50 gp (the Rat King) or 100 gp (Chief Coppercap) plus stamina, and since 11-18 a call needs 10 natural wins of that boss. The board's 2026-11-07 case for the weekly anchor was 10,000 / 30,000 gp fees. Armed as built (2027-05-14-arm-switches.sql); the designer decides whether the weekly 12 h window still earns its plate for a handful of players.
- **Fixed on the lane:** (1) a scaled run sets no personal best (2027-05-17-scaled-best.sql: the settle marks each scaled window on the tally, the fold skips a session with any; kept OUT rather than a second best, since the Hunts row's Best, the hunt-list advice and the summary all read the one number as the ground's own). (2) The analyzer has a "Weekend bonus" row (the session's `xp_event`, named by the event's own words) and the raw line reads "Level XP per hour (no party, solo or event bonus)". (3) A ground's page no longer tells a hero short of Call out's wins "You can call out the Rat King for no gold": it reads "Calling out the Rat King costs no gold until 11:00 PM." (4) The hunt bar reads "Mill Cellar (Scaled: Level 9)" while a scaled hour is being spent.
## 2026-11-18 · DESIGN (systems-engineer, lane: `lane/d-late-items-rescue`) → GAME DESIGNER · **RULED 2026-11-18 (game-designer)**: three places the itemization plan and the rescued hidden samples disagree
## 2026-11-18 · SYSTEMS (systems-engineer, lane: `lane/c-party-leave-stale-tab`) → GAME DESIGNER + ART DIRECTOR + every client lane · OPEN (FYI, built): two behaviour changes from the full-game sweep's A9/A20
- **A party of one with nothing to wait for closes** (2027-05-11-party-alone.sql, staged): Leave, Kick and a lost seat that leave one seat close the party; a declined or expired invite's leftover closes on the next minute's sweep. A live invite, a finder listing or a hunt running in the instance keeps it. A leader who wants to keep a party after its last member left re-invites (the first invite makes a new one, as today). Designer: keep or re-rule.
- **Every refusal of a hero's own ask re-reads it** (character-session.js `_settled`): the engine's refusal envelope is applied (envelope.js E7), any other refusal the server answered costs ONE bounded hr_load. A test pinning "a refusal re-reads nothing" now pins the bug; PI-1 (party-ui) and INT-1 (hunt-view-core) were moved to the new rule.
- **The Hearth Chest keeps a picked key picked when it runs out** (tower-chest.js keyPicked): Use goes off with "no key" instead of quietly moving to another metal; the press pins the key it used. Art director: the dim picked slot is the existing not-held look plus the checked mark.

## 2026-11-18 · DESIGN (systems-engineer, lane: `lane/d-late-items-rescue`) → GAME DESIGNER · OPEN: three places the itemization plan and the rescued hidden samples disagree
- **The template rule.** docs/design/itemization-plan.md §3 "the sidegrade rule" says a boss or ground unique is "the band's plain numbers with no skill bonus, plus one property". The weapon line's guard (tests/weapon-line.mjs WL4, designed 11-16 under Tyler's "the lines are power budgets, never a template") REFUSES a piece whose attack and damage are the line's own numbers, and the armor line's AL4 the same for armor. §3's own first line ("its own stat mix and one property") agrees with the guards. Nothing was changed here; the designer says which reading the plan means past Level 110 (Krell's five sidegrades are tier 7 and are not under these guards).
- **Where the samples drop.** Appendix A Finding 1's Morrow grid puts a bow and a staff at Wyvern Roost and boots plate, legs leather and a helmet cloth there; the rescued samples put a sword (Wagon Guard's Sword) and three plate pieces (helm, body, legs) at the Roost, because the weapon line's last red was a lone sword's Normal low point there (59.5-59.9, bar 60) and the armor line closed it with plate. Both are hidden. Before any row ships the sample is re-gridded or the grid moves; either way the Roost's sword low point is owed an answer.
- **Engine fields.** src/data/special-attributes.js files the `skill` and `defense` attributes under `skillB` with "hook: 'skill'" (owed). The engine already reads worn +skill, as `meleePlus` / `rangedPlus` / `magicPlus` / `defensePlus` (src/core/combat.js SKILL_PLUS_FIELDS, the Tower weapons). So the hook is not owed, the field name is wrong: the Mudlark's Mitts would ship as nothing. The grader's uniques proof (U4) now rests on exactly that gap; it re-aims the day the catalogue moves to the engine's fields.
- **RULED 2026-11-18 (game-designer, lane/d-designer-rulings-1118; board "2026-11-18 Designer rulings" rows 1a-1f):** the guards are right: a unique is its own stat mix inside the band's budget plus one property, never the line's own numbers (Tyler 11-16), plan §3 now says so, and Krell's five tier-7 pieces follow it too. The Appendix A grid wins (the Roost's lone sword already reads 63.9 on the ladder kit against the bar of 60, rescue re-measure), so the four Roost samples move to grid cells, and the catalogue's `skill` and `defense` rows take the engine's `*Plus` fields. The band prices KEEP (Tyler 11-18, sinks above a band on purpose), the lone Mage's Dangerous profit at Carter's Rest and the Ox Road KEEPS (11-08 one difficulty, 11-13 no profit molds), and the floor grade drops the Platinum chest weapon to a printed what-if row.

## 2026-11-18 · DESIGN (game-designer, lane: `lane/d-party-pace`) → COORDINATOR · **RULED by Tyler 2026-11-18 ("Yes, open at 5"), BUILT on the same lane: the Sewer opens at Level 5 (the full-game sweep's A1)**
- **Measured (real settle, matched Levels and gear; board "2026-11-18 Party pace"):** the sweep's -40% to -55% is the engine, not the harness. A four (tank, Healer, bow, wand) earns 0.42 of the same heroes alone in the Mill Cellar, 0.61-0.65 on every tier of the Thicket, 0.57-0.66 on every tier of Wickstead. From Level 8 the Sewer pays it 1.01-1.17 on every tier, from 16 the Glade's Dangerous 1.03-1.09 and Deadly 1.22-1.41. The Hunts window sends a four to the Sewer from 8, so the gap is Levels 1-7 (the Cellar, then the Thicket).
- **Why no dial moved:** on those grounds a four kills a pack in one volley (TTK 0.0-0.1 s against 2-6 s alone) and the walk between pockets sets its pace, so it kills only 1.15x (the Cellar) to 1.76x (the Thicket) what one hero does. The one table needs about 2.7x to stand even. A shorter respawn moves nothing (20 s and 10 s: the Thicket four 0.65 -> 0.67, the four is walk-bound). The bigger pull every ground from 16 brings on Dangerous and Deadly does lift it (Wickstead's Dangerous four 1.03, Deadly 1.48) but at Level 5-8 it kills heroes alone (Wickstead 56 deaths Dangerous, 177 Deadly, Thicket 4 / 144, in 5 hero-hours), a lone mage on the Thicket's Deadly out-earns Wickstead's Normal (1.29x, the ladder) and the Thicket's Deadly four reads 2.95x the pace contract (cap 2.5). More HP on top (1500 / 1600) leaves the Thicket's Dangerous four at 0.94 while a lone tank there earns 0.82x Normal. The Cellar is Normal only (Tyler 11-05).
- **Ruling tension (CLAUDE.md §0, newest wins):** the brief's band (balance ruling 10-25 §5, a four +15-25% a head) is superseded on Normal by Tyler 11-16 ("normal isn't meant for parties"), and on the harder tiers 11-16 asks >= the same heroes alone, which the Thicket and Wickstead miss (the 11-16 STANDS reading, kept). 11-02's "party gold stays below solo" is a profit line NO PROFIT MOLDS (11-13) retired: printed, not graded (a four's gold a head is 0.26-0.98 of alone on Normal).
- **Built instead (the visible claims):** the Hunts window says the Level tag ("Recommended") to a party too, never "Recommended for the party"; the Party window reads the leader's tier and says that tier's measured line ("in Mosslight Glade (Deadly)").
- **The party's real day-one ground is the Sewer from Level 5 (measured, Normal):** a four at 5, 6 and 7 earns 1.62 / 1.60 / 1.59 of the same heroes alone in the Thicket, the two pairs 1.58-1.74, no death, the four's typical lows 82-100%. The advice sends a party there only from the floor (8).
- **Tyler's call (the designer's pick is (a)):** (a) the Sewer's band starts at 5, not 8 (a server catalogue change for a lane C; his 10-21 line names "band 8-25", so it waits on his word). The advice still sends a lone hero to the Thicket; a lone hero at 5-7 in the Sewer lives (no death, typical lows 55-82%) and earns 1.3-2.1x the Thicket, so the Sewer would read In range to it. (b) leave it: Levels 5-7 stay solo-paced and the window says so truthfully. (c) the Thicket's and Wickstead's harder tiers bring a bigger pull like every ground from 16, their danger re-fitted so a hero alone at the floor survives Dangerous (not built: new tier dials measured on the full grade; the costs are in the bullet above).
- **RULED (Tyler 2026-11-18, "Yes, open at 5"), BUILT (lane/d-party-pace):** the Sewer's band is 5-25 (src/data/hunts.js); a party at 5 is advised the Sewer (hunt-list.js: the party ground wins a tie on the floor; a hero alone is still sent to the Thicket) and its coach card "Into the sewer, together" comes before Tamsin's wolves; the tutorial's road order breaks a tie on the floor by the band's top (the Sewer is past the Thicket). The formula re-made the Sewer's six monster rows for floor 5 (tools/gen-ground-stats.mjs --write: about a fifth less coin a kill, three of them 1 less attack; XP and HP unchanged), and the Rat King's attack 7 -> 6 by hand (balance-sheet.js FORMULA_EXCEPTIONS: his Tail Lash 74 -> 64, inside the 35% of the floor-5 hero's 190 HP that hunt-data blow-share holds). Two guard reads moved, each with its reason in tests/party-class-xp-line.mjs: harder-tier cells are half an hour (15-minute cells read a Sewer pair at 0.94 where half an hour reads 1.19), and a Deadly four's pace cap reads at Level 10 on a ground whose floor is under it (the contract starts past the first ten Levels; a four at 5 in the Sewer reads 3.2x on Normal too). A Sewer mutant proves the moved read still bites. Three catalogues STAGED: 2027-05-06-sewer-from-five-hunts-, -hunt-sessions- and -scaled-hunts-catalogue.generated.sql (the hr-accrue carrying the same monsters.js deploys BEFORE the hunt-sessions file: the bounds only fall). The Party window's Sewer lines are re-measured at the new floor.
- **Also seen, not this lane:** the party advice still reads `groupFit` 'solo' on Wickstead and the Glade, so a four at 16-25 is sent to the Sewer (1.01-1.17) rather than the Glade's harder tiers (1.03-1.41); and a lone hammer at the Sewer's floor earns 63k an hour against Wickstead's 39k (the ladder test reads that seam for Deadly only).
- **RESOLVED 2026-11-18 (systems-engineer, lane/a-party-advice-glade), the party half of "Also seen":** a party's fit in the advice is its measured line (src/shell/hunt-list.js fitsGroup reads PARTY_VS_ALONE: a mixed party of its size at or over the same heroes alone on some tier the ground offers), never groupFit, and a tie of floors goes to the higher line. A four is advised the Sewer at 5-15, the Glade at 16-31, Hask's Ford at 45-49 and the Slake at 50-54 (it was the Warrens, with a note past 50). Measured with `tools/balance-sim/party-advice-table.mjs` (real settle, 2 seeds x 0.5 h, a head's Level XP an hour): the four at 16, the Sewer's best tier 52.4k against the Glade's 55.7k / 74.1k / 93.6k; at 25 58.2k against 57.8k / 81.3k / 105.5k; at 13 the Sewer 42.7k against Wickstead's best 23.1k; at 45 the Warrens' best 290.2k against the Ford's 360.0k / 390.4k on Dangerous / Deadly; at 50 the Warrens 315.0k against the Slake's 438.0k. No deaths in any of those cells.
- **For the DESIGNER (seen, not changed):** (1) THE LONE SEAM, numbers (`party-advice-table.mjs --party hammer`): on Normal a lone hammer earns 63.2k at the Sewer's floor (5) against Wickstead's 38.8k at its floor (8), the 63k / 39k above; on the best tier with no death, 64.2k / 65.0k / 68.3k in the Sewer at 5 / 8 / 13 against the advice's Thicket 32.1k (5) and Wickstead 46.6k / 47.5k (8 / 13). From 16 the lone advice (the Glade) is the best ground again. That is not the groupFit cause: the lone advice keeps a hero alone off the Sewer by its Rat King hall (Tyler 10-21) and your B3 ruling above keeps it, so the seam is the Sewer's party-built rows paying a hero alone about 1.4-2x the solo grounds. Yours to rule. (2) At 45-49 the Ford beats the Warrens for a party only on its harder tiers: on Normal the four reads 149.3k against 229.6k, and a tank + Healer pair loses 15k-37k gold an hour on the Ford's Dangerous and Deadly. The advice reads every tier, because Normal is not tuned for parties (Tyler 11-16). (3) The coach's "Find a party for The Sewer" (hunt-tutorial.js goal_party, the forParty ground in band) still names the Sewer to a lone hero at 16-25, while the Hunts window now sends that party to the Glade. (4) groupFit 'solo' now orders nothing in the advice (a hero alone reads only 'party') and is the formula's label for the same stats as 'both'; retiring it is a data edit that moves the edge bundle, so it waits for a data lane.
- **RESOLVED 2026-11-18 (systems-engineer, lane/a-party-coach-card), items (3) and (4) above:** (3) the coach's "Find a party for …" names the ground the Hunts window's party advice picks for a pair at the hero's Level (src/shell/hunt-list.js partyGroundFor, the shell's coach facts -> nextGoal's `partyGround`), and says nothing when no ground a party suits holds the Level (1-4, past 110): the Sewer at 5-15, the Glade at 16-31, the Warrens at 32-44, and on up the advice. (4) `groupFit 'solo'` is retired: GROUP_FITS is 'party' / 'both', the Glade, Wickstead, Hask's Ford, the Slake and the training rooms read 'both', STAT_FORMULA.fit has no 'solo' row (it was the 'both' row's twin), the Tower's fit check, plans.mjs and nextStepUp's party tie (now the measured line, party-class-xp.js partyBestLine) stop reading it. No number moved: every catalogue generator's --check is in sync and the monsters, tier rows and the lone pick are identical, so tools/balance-sim/level-pace.json's fingerprint was re-pinned 5aee7da52db44c16 -> 270846daed1dcf79 (the four groupFit labels are its only changed inputs). Items (1) and (2) stay the designer's.
- **RULED 2026-11-18 (game-designer), a lone Level 5 in the Sewer (the 139 audit's B3): keep the advice and the food.** Measured fresh (real settle, Level 5 alone, 3 seeds x 1 h): in the starter kit, with no armor, a tank's coins fall 1,811 g/h short of its store food and a hammer's 937 (the reported ~1,500), but in the Level's tier-1 armor every way clears its bill by 575 to 2,876 g/h in coins (1.5k to 5.3k with loot sold), for 1.4-2.1x the Thicket's XP and one death in 30 hero-hours (the hammer with no armor). The Sewer reads In range truly, the advice already sends a lone hero to the Thicket, and since v0.2.140 the end card names the coins and the bill, so the cause is a hero with no armor, which the hourly armor drops fix.
## 2026-11-18 · SYSTEMS (lane: `lane/d-gold-sinks`) → GAME DESIGNER + COORDINATOR · **RULED 2026-11-18 (Coordinator): KEEP the 11-16 Dawnsteel prices, 2.48M both tracks**, per Tyler 2026-11-18 ("I actually dont want everyone to be able to easily unlock everything and upgrade everything ... I want people to make choices"; and, relayed the same day, gold buyers get an edge while free players reach every Level, ground and gear tier): a sink exceeds a band on purpose. The 25k-base alternative below is not taken. The Hold food-bill finding: **RULED 2026-11-18 (game-designer), acceptable** (below).
- **Found:** lane/d-temper-dawnsteel priced tier 7 at 2.48M both tracks, 44% of a lone tank's 5.66M at Krell's Hold measured before the 11-16 income dial. Re-measured on v0.2.138 (PRIORITY_BOARD "2026-11-18 Gold by band"): the tank banks 0.91M from 88 to 110 (the Hold's food bill), a hammer 2.63M, a bow 3.23M, a Mage 4.00M, so 2.48M is 273% / 94% / 77% / 62%, and 92% of the mean hero, against 55% to 73% for tiers 2 to 6.
- **Built as designed** (the Coordinator 2026-11-18: keep its numbers unless they no longer fit). It still sits under most heroes' band gold and is never needed to progress, which fits Tyler 11-18 ("choices"). The brief's other rule, the same share as tiers 2 to 6, is a 25k base: 25k / 50k / 100k / 200k / 400k (1.55M both, 58% of the mean). One row in `src/data/temper.js` plus `gen-temper --new` either way.
- **Also for the DESIGNER:** a lone sword-and-shield tank at Krell's Hold pays 13k-26k g/h for food from 85 to 95 (net -13k g/h at 85), so a tank's 75-110 income is a third of a hammer's. That is the Hold's numbers, not a sink.
- **RULED 2026-11-18 (game-designer): acceptable, nothing changes.** Measured fresh at 85 (real settle, 2 seeds x 1 h, the arriving kit: one tier under, skills 75): alone the tank nets -27.0k g/h and a hammer -15.4k, while the same tank beside a Healer nets +12.6k and in a four +9.4k, buying no food. The castle's floor alone in last tier's kit is the weight-class edge, and a tank is a party's function (Tyler 10-16); under no profit molds (11-13) the ground isn't "way under" (the hammer, bow and Mage bank 2.6-4.0M in the band), one way to play it alone is, and the end card and the Hunts card's best gp/h already show it.
## 2026-11-18 · SYSTEMS (lane: `lane/a-hunt-prep-truth`) → GAME DESIGNER · **RULED 2026-11-18 (game-designer): A25 kept, the arriving kit made the measure; the armor-slot reversal undone for A11's rule**
- **Krell's Hold names a store food floor, measured in the kit a hero ARRIVES in** (`src/data/grounds/krells_hold/pack.js` bagGuide: `storeFloor: 'salted_trout'`, `storeFloorFrom: { 88: 'salted_shrimp' }`; the table is in the pack's comment). The March floors were measured in the ground's own tier with every combat skill at the Level, a kit nobody walks in wearing: one tier under (Rune at 85) with skills 10 under, a lone tank on Salted Shrimp died 8 times in 4 h at 85 (Hask's Lookout, the Gatekeeper), 5 at 86, 3 at 87, 0 from 88; the audit's own kit (Rune armor, Emberforged Sword and Tower Shield, Leather Gloves) with Defense 80 died 3 times. Salted Trout: 0 in every way. In the same arriving kit the Ford, the Slake and the Pyre Field still die 0 times on Salted Shrimp, so they name none. **For the designer:** keep Trout, or re-measure the floors in an arriving kit as the rule (`tools/balance-sim/audit-table.mjs storefood` plays the Level's best tier with skills at the Level).
- **Equip upgrades never moves a worn off-weight piece to the hero's weight** (`src/shell/upgrade-plan.js` bestFor; `tests/alpha-windows.mjs` AW-21 "a heavy hero in Leather Boots isn't moved off them"). Next buy no longer sells off-weight armor and now names where the hero's weight comes from (`src/shell/next-buy.js` findPiece), but a bare slot that Equip upgrades fills off-weight ("a bare slot never waits") stays that weight for good, which is how the audit's Level 9 gloves lasted to 85. Not changed here (your AW-21 rule). **Proposed:** a worn piece off the weight the hero chose (preferredWeight) takes a strictly better piece of the chosen weight, never the other way.
- **CHANGED 2026-11-18 (lane/a-prep-truth-2, on the Coordinator's B6 brief from the 139 audit: a heavy hero got a medium Studded Leather Belt from Equip upgrades): "a bare slot never waits" (11-04) is reversed for ARMOR slots.** With the hero's weight known, a bare helmet, body, legs, boots, gloves or belt takes only that weight (bestFor's fits filter; AW-21's tie line now reads `{}/0` for a light hero with no light pieces, and the old fallback's mutant became "a bare armor slot takes another weight"). Cost: a hero whose bag holds none of its weight for a slot stays bare there until it does (a light Mage early on: the Shop sells no light armor); Back in town names where that weight comes from. Jewelry, capes and shields are unchanged. **For the designer:** keep, or re-rule (the worn-piece proposal above is the other way to stop the pin).
- **The weak-food line speaks in the Level band its floor was measured for** (lane/a-prep-truth-2, the 139 audit's B2: at Level 5 the Barrows and the Hold named a food and the Pyre, the Slake and the Ford did not). `src/shell/weak-food.js` groundFloor and hallFloor: under a ground's (or a hall's) band no line, on every ground alike; from the band's first Level the measured floor speaks, and a page names each slot once (the ground's line first; the hall's "Requires ... on every bar" label still states its own floor). No floor value moved.
- **RULED 2026-11-18 (game-designer; board "2026-11-18 Designer rulings" rows 2a-2b):** A25: keep Salted Trout at 85-87, and the arriving kit (one tier under the ground's own, combat skills 10 under the Level) becomes the measure for every store-food floor; the Ford, the Slake and the Pyre still name none in it, so no row moves. The armor-slot reversal is undone in favor of A11's rule: a bare armor slot takes the best piece that beats bare in any weight (a tie goes to the chosen weight, as built), and a worn piece off the chosen weight takes a chosen-weight piece of the same tier or higher, never the reverse and never a lower tier; Next buy follows both. Measured on today's upgrade-plan.js, a Level 1 light Mage holding the Shop's Leather Gloves, Bronze Belt and an Apprentice Hat wears the hat and the gloves without the filter and only the hat with it (the heavy belt costs Magic accuracy, so it stays off either way); no light Shop rung and no new Thicket rows, because the Thicket already drops the light pair as Rares and belts move to crafting in plan phase 7.

## 2026-11-17 · SYSTEMS (lane: `lane/fix135-krell-advice`) → GAME DESIGNER · **RESOLVED 2026-11-17 (the card, and Tyler kept it): Krell's card asks for four**
- **Found:** `lane/d-audit-f22` measured Krell's card ("a tank, a healer and a third hero"; "Two heroes: Level 106 or higher") on 0.4-of-plate cloth damage; `lane/d-mage-110` (0ca341b84, merged via 01b5ff014) cut cloth to a tenth + 1 without re-playing the hall. The healer's staff blow was a third of a three's damage there, so on set/v0.2.135 the card lost: a third tank 0/40, a sword alone 0/40, axes 9/40, a hammer 21/40; two heroes 0/40 at 106, 110, 115 and 120 (8/40 at 130). Overlaying gear-tiers.js alone flips every cell green; abilities.js and src/core do not.
- **Resolved:** the card now says `Party: a tank, a healer and two more` (pack.js), the four his 18,000 HP was fitted on; every one of the 36 pairs wins 32-40 of 40 at 85. The pair line is gone. `tests/boss-hall-advice.mjs` reads the new line (every pair measured) and pins the F22 card as a mutant.
- **For the DESIGNER (keep or re-rule):** a three with a melee or tank third no longer beats Krell at the floor (a third tank 27/40 at 100). If a three should, that is Krell's HP or the time limit (a server catalogue + edge change), not the card.
- **RULED (Tyler 2026-11-17):** "keep the card, threes don't need to beat Krell easily". Krell's HP and time limit stay; a three with a ranged or magic third still wins at 85 (88-100%), a melee three needs more Level or gear.

## 2026-11-17 · DESIGN (game-designer, lane: `lane/d-flat-party-xp` re-landed on set/v0.2.135) → DESIGNER + COORDINATOR · **RESOLVED 2026-11-17 (same lane): Deadly pays more an hour than Dangerous again** (Dangerous XP 1100, Deadly HP 1150, the four cells 1670 / 1700; the board's 2026-11-16 section has the numbers; Dangerous 6 alone did not fix it)
- **Found:** `tools/balance-sim/party-tier-xp.mjs` on the combined data (2 seeds x 0.5 h, 4 on the Glade and the Ford). Where Dangerous and Deadly bring the same pull (8 on the table; 6/6 on Krell's, the Pyre and the staged packs), Deadly's 30-45% more HP outweighs its +4% XP a kill: Andy's four at the floor reads 2.53 vs 2.26x the contract on the Warrens, 2.60 vs 2.34 on the Ford, 2.52 vs 2.05 on the Muster; a lone hero on the Glade's floor 2.11 vs 1.60. Same coin and drops a kill, so Deadly is the worse pick on every count but risk. "Why would I choose this?" is a dead choice.
- **Not changed here** (the re-land's brief: the table, the pins). **The designer's next step:** Dangerous 6 on the table where Deadly brings 8 (Deadly's pull is the only lever that makes the harder tier pay more an hour; its XP a kill is capped at +25%), then re-measure Tyler's two bars (every Dangerous/Deadly mix at or over its heroes alone, a Deadly four at most ~2.5x). The four on Dangerous now reads 1.17-1.46 of its heroes alone at 8, so 6 has room it did not have before cloth's change.

## 2026-11-16 · DESIGN (game-designer, lane: `lane/d-flat-party-xp`) → COORDINATOR + SYSTEMS · **RESOLVED 2026-11-20 (lane/c-pack-gate-party-rule): the grader's Normal-four line moved to Dangerous and Deadly (entry 2026-11-20 above); the hotfix's other two lines RESOLVED**
- **Built (Tyler 2026-11-16, "just balance the hunting grounds xp vs having a unique formula everywhere"):** ONE party table by size (`party-class-xp.js` PARTY_CLASS_XP), no ground or tier read; PARTY_TIER_PM and every per-ground cell retired. The grounds carry the rest (Dangerous pull 8, the Glade 6, Krell's and the Pyre 6; Deadly HP 1300).
- **RESOLVED 2026-11-20 (lane/c-pack-gate-party-rule), was OPEN for the COORDINATOR: `party.fourVsSolo` 1.15-1.25 binds on Normal** (`tools/balance-sim/grade-sheet.mjs` four-xp, `src/data/balance-sheet.js` party.fourVsSolo). Tyler 11-16: "normal isn't meant for parties", the above-solo rule is Dangerous/Deadly only. On Normal a mixed four now reads 0.64-0.81 of its heroes alone on eight grounds (1.17-1.36 on the Sewer, the Warrens, the Muster), so a full grade FAILS four-xp on most grounds by the ruling's design. The designer's call: move four-xp (and the advisory trio/duo lines) to Dangerous/Deadly at >= 1.00 against the same heroes alone, which `tests/party-class-xp-line.mjs` already binds. Not changed in this lane (the brief asked for the note).
- **RESOLVED (the hotfix's two designer lines):** the Glade's Normal four now reads 1.19x the contract at the floor and its Deadly four 2.25x (1.9x Normal, over the 1.25 line). The first grounds' Deadly fours read 1.47x (Thicket), 1.18x (Wickstead), 2.24x (the Sewer, Andy's four) the contract, under the 2.5 cap, which the guard now binds on every ground.
- **RESOLVED (SYSTEMS, same lane): the viewed-prediction drift.** `tests/hunt-live.mjs` LV-PULL (Andy's Warrens three, viewed): the first commit off the server moved 1,024 s -> 752 s with the one table, and the rule's window was cut 800 s -> 736 s. Cause: a peer's Level or skill gained mid-hunt (Eddie's Melee 42 near 600 s; more party XP made it come sooner) never reached the browser, which runs a peer from the frozen row of its start point and never holds its XP (Tyler 10-20), so it kept his Melee 41 rolls until one swing he hit on the server missed in the browser. Fix: each viewed commit names every member's frozen-row key at its window's start (`hunt_check.peers`, `src/core/member.js` frozenKey, `hunt-settle.js` huntPeerKeys); a key the prediction does not run asks for a start point, and `sameSetup` now compares the peers' whole rows, so it restarts eased. LV-PULL viewed is back to the closed half's 1,500 s, 0 of 93 commits off in both modes; the edge bundle moved (deploy needed for the keys; a client without the new edge behaves as before).
- **STANDS, reported (Tyler 2026-11-16, "all hunts work the same for everyone regardless as often as we can, the only difference is the Solo Exp boost"):** the Thicket's and Wickstead's harder-tier mixes read 0.64-1.01 of their heroes alone (fours 0.64-0.80). No solo tag, no line. `party-class-xp-line` prints them every run (STANDS) and still binds their pace cap.
## 2026-11-16 · BACKEND (lane: `lane/c-sweeps-coat-drop`) → BACKEND (factions) + GAME DESIGNER · **RESOLVED 2026-11-18 (lane/c-faction-outfit-path): two homes for an earned outfit**
- **RESOLVED, door (b): `hr_outfit_owned` reads `hr_faction_claims` for rows carrying `hr_outfits.pieces`** (2027-05-19-faction-outfit-path.sql + its outfits catalogue). One reader, three doors, one record a fact: the claim is already the server's standing-gated, journalled record, so a `player_cosmetics` copy would be a second record with nothing tying the two; claims are never deleted, so a swap keeps every look by construction; no claim body moved. Add-ons are part of their outfit: the outfit alone and with one add-on are each a look and sheet, picked on the outfit's one card and worn through `hr_outfit_set` (designer 11-18: both held, one shown). The 6 looks are staged in `src/data/outfits.js STAGED_OUTFITS` (served, not listed) until their sheets land. Guard: `tests/faction-outfit-db.mjs`.
- **What:** the Key Warden (ids sweeps_coat) is owned through `player_cosmetics` kind `outfit` and read by `hr_outfit_owned` (2027-04-30-sweeps-coat.sql), so the Character window, `hr_outfit_set`, the town look and the party views all follow it. The faction looks (2027-04-22-faction-standing.sql) are owned in `hr_faction_claims` (pieces, `hr_faction_outfit_claim`) and no `hr_outfits` row or `hr_outfit_owned` reads them, so a claimed faction piece cannot be worn through the one outfit path.
- **Proposed:** when the faction pieces get their art and become wearable, they own through the same reader: a claim writes the `player_cosmetics` 'outfit' row (or `hr_outfit_owned` reads `hr_faction_claims` for rows marked as faction outfits). One reader, two doors. Not changed here: the faction verbs are another lane's and their pieces have no `hr_outfits` rows yet.
## 2026-11-15 · SYSTEMS (lane: `lane/a-next-steps`) → GAME DESIGNER · **OPEN, two Systems calls in the audit follow-ups for the designer to keep or re-rule (one RESOLVED)**
- **RESOLVED 2026-11-16, the next buy's order** (`src/shell/next-buy.js`, the hunt summary's Back in town line, audit F8/F12/F20): it follows the designer's handoff on the board ("2026-11-15 The audit's balance findings": a Shop piece over a practice one, then "the next room rung ... and then the dummy"): a Shop piece better than what is worn (a bare slot first, then the cheapest), then Tempering's next rung (weapon, then armor), then the cheapest House room rung the purse and materials cover, then the dummy's next skill. One line, label words (Tyler 2026-11-14). hunt-summary T5 holds the order (a mutant per swap).
- **The first Dangerous run's gear gate** (`src/data/hunt-tutorial.js` `DANGER_KIT`): armor on head AND body, Tyler's 11-02 helm-and-body test kit. The board's F5 table measured the Level's full gear (no deaths, 74.5 meals an hour for a tank at 8) and the bare practice kit (22-24 deaths in 2 h at 5); helm and body alone at 8 on Dangerous is NOT measured. The card says "More XP, more food, higher risk." either way, and the food lessons (`SPENDING_FOOD`, lane/d-audit-balance-1) come on that run once the hero eats.
- **Resistance in Equip upgrades counts on grounds only** (`src/shell/upgrade-plan.js` `threatsAt`), the F15 bane rule's band: a keyed hall's boss (Krell's fire) is not an OPEN_HUNTS spawn, so Krell's Tollgate's fire resist is no reason at 88 (its Guard 15 still puts it on over any other shield). If halls should count, both the bane and the resist rule widen together.
## 2026-11-16 · SYSTEMS (lane: `lane/b-prep-defaults`) → GAME DESIGNER · **OPEN: the Basic setup's values are yours to rule**
- **Built (Tyler 2026-11-16, "when i say basic i mean basic"):** src/data/basic-setups.js, one row per ability discipline. The moves are the role rule set the server already plays for an empty bar (rule-subjects.js ROLE_RULES, with its triggers and Plain store runes), only those the hero's skill level has unlocked. Then `heal`, then the food the hero carries most of, `food`, the drink it carries most of, `drink`.
- **Chosen by the engineer, not measured, so yours to keep or change:** (1) `heal: 'mend'` on every non-Healer row. ROLE_RULES carries no Mend, so a Basic setup spends mana the default bar does not (Mend: 15 mana under 50% HP). (2) `food: 'salted_shrimp'` and `drink: 'thin_turnip_juice'` at every Level. On a ground whose bag guide names a stronger store floor, Before you go still says Salted Shrimp heals too little (hunt-go.js weakFoodLine), as it does for the start bar. (3) The Healer row inherits Circle of Renewal's "2+ allies under 80%", which never fires alone, as on its default bar.
- **Copy (Coordinator FYI):** the controls read "Basic setup" and "Add to bar" (the glossary's sentence case, src/data/text/controls.js), and the prompt is a label with the hero as its prefix ("Basil: New spell Turning Cut", Coordinator's form; the copy sweep bans the "·") because up to four heroes play at once and its Add acts on that hero's bar. The builder's state line is the label "Basic setup: unsaved".
- **No guard pins a balance number here:** tests/prep-defaults.mjs PD-2 reads every expectation from the rows, so a changed row needs no test edit.

## 2026-11-16 · SYSTEMS (lane: `lane/a-party-xp-tier`, hotfix) → GAME DESIGNER + COORDINATOR · **OPEN: three grader lines the party-cell cut leaves for the designer**
- **Built (Tyler 2026-11-16, option 1):** `src/data/party-class-xp.js` PARTY_TIER_PM cuts the mixed 3- and 4-hero cells on Dangerous and Deadly for the Glade, Hask's Ford, the Slake, Krell's Hold and the Pyre Field. A big-pull Deadly four now reads ≤ ~2.46x the contract (it read 2.9-4.5x). Every harder-tier mix stays over the same heroes alone. Normal is untouched. Guard: `tests/party-class-xp-line.mjs` harder-tier arm.
- **OPEN, for the DESIGNER: the Glade's Deadly vs its Normal.** The Glade's Normal four reads 1.98x the contract at the floor, so a Deadly four at ≤2.5x reads ~1.15-1.24x its Normal one, under the sheet's `tiers.deadly.xpVsNormalMin` 1.25 for fours. Normal isn't meant for parties (Tyler 11-16): cut the Glade's Normal four, or read that line for lone heroes only?
- **OPEN, for the DESIGNER: the first grounds' Deadly.** The Sewer, Thicket and Wickstead have no bigger pull on Dangerous or Deadly (floors under 16). Their Deadly four reads 2.7-3.1x the contract at Level 5-8, where a hero alone reads 2.2x. Not cut and not capped (a cut would make Deadly pay under Normal there).
- **RESOLVED 2026-11-20 (lane/c-pack-gate-party-rule, entry above): `party.fourVsSolo` 1.15-1.25 on Normal** (grade-sheet four-xp) still binds on Normal. Since Tyler 11-16 Normal isn't meant for parties. Krell's, Pyre's and Muster's Normal fours already read 0.95-1.07x their heroes alone, unchanged by this lane. Move the line to the harder tiers, or retire it?

## 2026-11-10 · DESIGN (game-designer, lane: `lane/d-spell-tuning`) → COORDINATOR + SYSTEMS + BACKEND · **the monsters' spells are ON and the three balance guards are green; four things for other lanes**
- **RESOLVED here (the designer's item in the entry below):** `drop-tables` profit-floor, `forest-cave` glade-between and its mutant, `first-week-bands` weapon-rungs and its mutants are green with `SPELL_SWITCH.live = true`. Numbers: the board, "2026-11-10 Spell tuning".
- **OPEN, for the COORDINATOR (integration):** `2027-03-28-area-spells-hunt-sessions-catalogue.generated.sql` is stale against this branch's data (`node tools/gen-hunt-sessions.mjs --check`): Muck Fling, Poacher's Volley and Lash Sweep on the roster, Spring Tide's cost and rule. Regenerate it at integration. Until then `tests/area-spells-server.mjs` AS-4 is RED on this branch ("the server's spring_tide is not the data's": the file's row says 160 mana, the data 120), and that is its only red. The stagger itself adds no stored field and moves no world shape. Steel Hatchets 14/16 and Kingsgrate 1.6% are item and drop rows: any generated catalogue that carries them regenerates too.
- **OPEN, for SYSTEMS + BACKEND (not built): a tier dial for spell strength.** A four at its floor holds Deadly on every ground with no resistance. Measured with every spell at 3x: a Glade Deadly four dies 0.75 an hour and nets 872, and with 30% resistance 0 and 2,534. The Warrens four nets -5,574, and with 30% +704. So `spellPm` on the tier rows (Dangerous 2000, Deadly 3000 from the Glade on), read once in `monster-spells.js` `land`, shipped with the linings.
- **OPEN, for BACKEND + SYSTEMS + the client lane: damage taken by spell.** `taken.bySpell` joins `byMonster` and `byElement`. The server's `hr_hunt_tally_ok` refuses an unknown map, so the order is server, then engine (`tally.js`), then client. Spec and player lines on the board.
- **OPEN, hardening (a guard that reads one seed's dice, like the hunt-tiers dials below):** `drop-tables` rare-pace reads one played hour of Rat King kills (9.80 h against a 10 h bar after a reroll), and gear-pace one six-hour run (a different slot missed on each of two rerolls: 398 to 403 kills either way). Both are green on this branch's dice. They should read a mean.
- **For TYLER, through the Coordinator:** is the hunt summary's "what hit you" line for everyone, or premium like the Taken tab (10-19)?
- **For TYLER, through the Coordinator (found measuring, not changed):** a group spell goes through the armor chain like any blow, so a hero in medium armor dodges it by a roll. In a Warrens Dangerous four the bow took 38 of 64 Blasting Charges, the others all 64. "Dodging stays positional, not dice" (11-08) can be read against that. If a spell should never be dodged by a roll, it is one line in `damage.js` `landHit` (a spell skips the dodge step), and the medium wearer's bill rises.
- **Tests that turn the switch on and were not run here:** `hunt-scene-live` LV-36 (browser). `hunt-live` LV-SPELL needed a shorter fixture row (a four killed every Cellar caster inside its first-cast wait): if LV-36 reads "no cast started", it is the same cause and the same fix.

## 2026-11-10 · SYSTEMS (lane: `lane/b-area-set`) → GAME DESIGNER + ASSET DIRECTOR + COORDINATOR · **OPEN: area spells are assembled on one difficulty and ship with the monsters' spells OFF; three balance guards are red with them on, and the four new abilities have no bar tile**
- **ROUND 2, same day (main v0.2.114, lane/b-phase0-tier4 and lane/d-spell-tuning merged here).** The switch is ON, the designer's call, with the first cast's stagger; the bar tiles landed; the three balance reds below are green on the tuned rows. The 18 plays: switch off `342a5481` (one difficulty's, the stagger moves nothing while it is off), on `69666c52`. **For the two designers, a value merged by hand:** the hatchets' tier 4 strength was moved apart by two lanes (Phase 0: 19/21 for its own rung; tuning: 18 to stay above the new Steel 14/16). Merged as Steel 14/16 and tier 4 19/21; `first-week-bands` weapon-rungs is green on it. **Two guards whose fixtures leaned on dice or danger the tuning moved, fixed here:** `hunt-sessions-settle` SUPPLY-RULE plays its one-coin-short hero with no monster casting (the Tosher's Muck Fling put it under 40% before its first coin, and it then ended gold_out as ruled); `hunt-tiers` dials reads its loot line on four seeds (it read 1.154 against 1.15 on one, the 11-08 note's own remedy), with a new mutant "more health pays more loot". **A third, edited and NOT yet run to a verdict (the PC-load stop):** `boss-call-db` BD-BOTH "a death" ended `died` for both Level 2 heroes on both doors, because one of the Rat King's casts fells both on one instant (7 of 24 dice in the engine, never with his spells off). That end is right. The arm now takes his spells off its row for the death by blows, and a new arm keeps his real row and takes either end, the same through both doors, two deaths only on one instant. First run when the PC is free: `node tests/boss-call-db.mjs --arm=doors`.
- **The switch (one row), as it stood before round 2.** `src/data/monster-spells.js` `SPELL_SWITCH = { live: false }`. Off, no monster casts and every hunt plays one difficulty's combat (18 plays, one digest, 342a5481, the same number with the rows untouched and the switch off as on `lane/b-one-difficulty`). The rows stay as written. It is data, so turning it on is an edge deploy and a client push, no migration (Postgres reads no spell row). The four hero area abilities, the five conditions, the marks and the Effects sliders are live either way. Tests whose subject is the spells turn it on for themselves (`monster-spells` withSpells, `area-spells-normal`, `hunt-live` LV-SPELL, `hunt-scene-live` LV-36, `area-spells-server`), so the suite reads the same whichever way the row ships. The balance sim takes it as a what-if (`{ spellSwitch: { live: true } }`).
- **OPEN, for the GAME DESIGNER (balance values, nothing re-fit here).** On one difficulty's rows with the switch ON, three hunt-core files go red, and with it OFF all three are green (run both ways on this tree): `drop-tables` profit-floor (the Glade at 16 earns +5% over its store bill, bar +10%); `forest-cave` glade-between (a lone tank in the four plate pieces earns 3 to 9% over its bill on five seeds, bar +10%) and its mutant "the glade's coin doubled and its XP x5" then escapes; `first-week-bands` weapon-rungs' mutant "the Iron Warhammer is back at 7/12" escapes (the rung guard no longer tells that rung). The 11-08 entry below measured the same cost on the older rows; of its list, `first-grounds-net-chain`, `harder-pays-more` and `hunt-tiers` dials are green on one difficulty with the spells on. The lane that tunes flips the switch on and owns these three.
- **OPEN, for the ASSET DIRECTOR.** `tests/pixel-icons.mjs` is red on this set, switch on or off: turning_cut, raking_shot, hoarfrost and spring_tide have no 32x32 tile in `ABILITY_ART`, so Configure action shows a grey glyph beside framed tiles. No lane holds them. The set cannot go green on GitHub until they land.
- **FYI, for the ART DIRECTOR (Configure action, a rough edge the merge makes easier to meet).** A new pick now takes its own starting rule (the client lane's conditionsAfterPick), so the sentence above the list changes height and the list slides under a still pointer (measured in `hunt-screen` HS-8: Salted Trout clicked at 584,614, Salted Lobster then at 584,619). The row that slid under the pointer is passed over by design (pickedAt, art audit 11-04) and cannot be compared until the pointer leaves it and comes back, because a move inside one row fires no second mouseover. HS-8 now moves over another row first; the product rule is unchanged. Listening for a real pointer move would close it.
- **Apply order (Coordinator), after one difficulty's six:** `2027-03-28-area-conditions.sql` (pauses nothing), `2027-03-28-area-spells-hunt-sessions-catalogue.generated.sql` (the shape moves: the old engine answers world_shape_pending and settles nothing until the edge deploys, no hunt is forfeited), `2027-03-28-area-spells-rune-spells.generated.sql`, then hr-accrue AT ONCE, then the client. `tests/area-spells-server.mjs` AS-4 reads every table, constraint and body before and after the three files: only the area rows differ.
## 2026-11-10 · SYSTEMS (lane: `lane/c-brook-bear`) → GAME DESIGNER + COORDINATOR · **OPEN: one pack on Normal (Tyler 11-11) must not ship before the designer's party cells: the Party window would say a mixed four earns +35% on the Thicket while it measures -26%**
- **What.** With partyPull gone a mixed four earns 0.58-0.82 of the median hero alone on Normal at the four grounds (table in the lane's report; was 1.17-1.23). The cells were left as they were on the Coordinator's word. `PARTY_VS_ALONE` (src/data/party-class-xp.js) is what the Party window tells a player, and it is now wrong by about 60 points (first-week-bands vs-alone red), CLAUDE.md §6: the browser never says one thing while the server does another.
- **So:** the designer's cells AND their measured `PARTY_VS_ALONE` line land on this branch (or a lane merged into it) before it ships. Also red until then: the grader's four-xp rows (24 of 24 on Normal), party-class-xp-line --mutate (4 of 9 one-class mutants no longer cross 1.00).
- **ANSWERED 2026-11-11 (designer, lane/d-party-xp-cells, cut from this branch):** mixed cells re-fitted to 10-25 §5 on Normal, PARTY_VS_ALONE and the Party window line re-measured, vs-alone and --mutate green, four-xp 10 of 12 in quick (the Sewer's two a point out, one cell can't hold both its Levels). Open for Tyler on the board: the Glade's harder-tier party at 1.5-2.4x alone, and one-class parties at -25 to -60% on Normal (both need a tier-keyed cell to fix).

## 2026-11-10 · SYSTEMS (lane: `lane/c-brook-bear`) → GAME DESIGNER + COORDINATOR · **OPEN, A BINDING GUARD RED: the bear as built takes the Glade floor's plate hero under Tyler's +10%: `forest-cave` glade-between fails 4 of 6 seeds (-1%, 0%, +9%, +2%); `drop-tables`' one seed reads +10.2%, six seeds mean +9.3%**
- **The binding red.** `tests/hunt-core/forest-cave.mjs` glade-between holds the Glade's floor (a lone Melee at 16 in its four plate pieces) to +10% over its bill on each of six seeds (`GLADE_MARGIN_MIN`, Tyler 2026-11-09). With the bear standing in Vine Hollow it reads -1% / 0% / +9% / +2% on four of them, and its mutant "the glade's coin doubled and its XP x5" escapes behind the red. Not loosened. The ruling's "loot and profit in band" read the grade's eight ladder-kit ways, not this hero. A design call: the bear's coin or bite (its row is the formula's: `gen-ground-stats --check`), its pocket, or Tyler moving his floor.
- **What moved.** `drop-tables` profit-floor reads the Glade on a lone Melee at 16 in the full own-tier set, held to +10% (`MARGIN_MIN_OF`, Tyler 2026-11-09 "fine" on its +19%). Real settle, 1 h a seed, six seeds (scratch, the test's own fixture): before the bear +19.4 / +20.8 / +18.5 / +33.1 / +17.1 / +22.0 (mean +21.8%); with it +10.2 / -0.8 / +20.0 / +11.3 / +7.9 / +7.3 (mean +9.3%). The store bill rises 4,307 -> 4,940 g/h (+15%: 19 bears an hour, the Glade's hardest hitter), coin is flat, commons +161 g/h.
- **What did not.** The grade's eight ladder-kit ways (the board's "loot and profit in band") stay far over: median margin +278% -> +260% at the floor, median net 6,202 -> 6,409 g/h. Loot value +23% against the +25% cap.
- **Why it is open.** `drop-tables` is green on its one seed by 0.2 points, so a later food price or coin roll can turn it red with no Glade change. A balance call, not a bug: accept it and make profit-floor read a mean of seeds (as `ranger-floor` did, "THE BAR READS THE MEAN"), or move the bear's coin or bite. Nothing changed here: the values are the designer's.
## 2026-11-10 · SYSTEMS (lane: `lane/a-hunt-clips`) → ART DIRECTOR · **RULED (Coordinator 2026-11-10): `CLIP_RULES.reach` stays 1, one 45° step. Was OPEN, one constant: how far a combat clip may turn a unit**
- **The two readings.** Brief 13's READY list (line 1): play a clip only on a facing the clip HAS, else the old behaviour (the 1 px recoil, no swing). The Coordinator's lane brief: "fall back to the nearest facing it has, never a blank or a mirrored wrong-perspective frame".
- **Built, bounded.** `src/hunt-view/clip-hook.js` `CLIP_RULES.reach = 1`: a swing or flinch plays on the unit's own facing, else the nearest DRAWN one a single 45° step round (a wolf facing SE flinches in its drawn E or S, the heading picks), else the recoil; never 90° or 180° round, never mirrored. A fall lies in the nearest facing at any distance (`fallReach` 4: a body always lies). `tests/hunt-clips.mjs` HC-1/HC-2 hold it over every shipped clip; `tests/world-assets.mjs` [live] reads the same constant for the swing contract.
- **For the art director.** `reach: 0` is the strict brief-13 reading (the four-facing flinches then play on cardinals only and a diagonal recoils). One line, no art change either way.

## 2026-11-10 · SYSTEMS (lane: `lane/b-one-difficulty`) → COORDINATOR + `lane/b-monster-facts` · **OPEN: the monster facts page imports the party scale this lane deletes; the two merge with no git conflict and the client then fails to load**
- **What breaks.** `lane/b-monster-facts` 9d7953732 `src/shell/monster-facts.js` imports `PARTY_SCALE`, `packHpFor` and `yieldPermille` from `src/data/hunt-grounds.js` and reads `ground.partyScale` and a pocket's `minParty`. This lane removes all five (Tyler 2026-11-08, one difficulty for every group: a monster has its row's HP and pays its whole kill at any party size; the King's hall carries `forParty`, a warning, not a gate). A missing named export is a link error, so every module that imports the page stops loading. Different files, so `git merge` reports nothing.
- **Who fixes.** Whichever of the two lands second merges the other first. The page's change is small and is the ruling: Health is `row.hp` for every size, a kill pays the row's `xp` and `gp`, a drop's chance is `effectiveDropChance(d, { dropMult: weaknessInfo(row, null).dropMult })` with no yield term, and the "for a party of N" rows go. Its mutant "Health is the row's, not what a lone hero meets" becomes the page's truth and needs a new plant; `tests/monster-facts.mjs` lines 38 and 56 read `PARTY_SCALE` too.
- **Same odds on both pages.** The Hunts page (`hunt-ground-facts.js` `rowChance`, fixed here: it left out the monster's own drop bonus) and the facts page now take a row's chance the same way; after the merge the facts page should call one shared function, not keep a second copy.

## 2026-11-08 · SYSTEMS (lane: `lane/a-rune-version-facts`) → `lane/b-area-client` when it merges main · **the bar's facts and the condition registry changed shape**
- **condition-metrics.js:** a metric row has no `label` now. `say` is how its sentence starts in the picker AND the summary ("it would hit", "the party has", a bool's whole statement "my target is a boss"); a pct row has `unit: '%'`, a count row a noun `unit: [one, other]` or `subjectAfter` with its subject read after the number. OPERATORS carry `pct` / `count` / `say` words. `validate()` refuses a count or percent row with no unit, so b-area-client's `party_hp_pct`, `enemy_casting` (and the bools' `label`s, which become `say`) need these fields when it merges.
- **action-facts.js:** `factsOf(a, ctx)` takes the hero's facts ({ bag, store, skills, set, worn }) and prints the version the slot casts (src/shell/cast-facts.js castOf); `supplyLines`, `setupWords` (now private) and `action-table.js sourceLine` are gone (Tyler: "Yes, cost line only"); the bar hover is `hoverLines`. A new spell shape's damage line must take `k.pm` (landed numbers), not the row's.
## 2026-11-08 · SYSTEMS (lane: `lane/b-area-data`) → GAME DESIGNER + COORDINATOR · **the area spells as designed keep Normal safe, but they cost enough gold to break the money ladder and one weapon rung (four guards red)**
- **OPEN, for the GAME DESIGNER: the money ladder (`forest-cave`, Tyler 11-03 "harder pays more", the start flow's net chain).** The design measured risk (deaths, close calls), not the ladder. Each ground at its floor in its guard's reference, the 6-seed median net per hero-hour, with the spells → with every monster's `spells` list cleared: the Thicket 1,897.5 → 1,897.5 (no caster), the Sewer's four 1,894.5 → 1,957 (the Rat King), the Glade's lone tank in its four plate pieces **1,672 → 2,020** (Spore Cloud), the Warrens' four 5,242 → 5,425.5. So `first-grounds-net-chain` reads the Sewer 3 g/h under the Thicket (inside the noise the 11-05 entry below names), and `glade-between` reads the Glade under the Sewer. `harder-pays-more`: a lone tank at 45 on the Warrens bills 2,880 g of food a half hour against 360 with no spell (Blasting Charge and the Chief), so the Glade at 45 out-earns it (7,116 g/h against 5,745). The levers are the designer's: a spell's `hitPm`, or the grounds' coin. Nothing here was re-fit.
- **OPEN, for the GAME DESIGNER (a balance value, not a data-lane call).** Balance ruling 10-25 §8 holds each weapon rung to +5% Level XP an hour on the first ground it is worn for. A lone axes hero at the Warrens at 45, Steel Hatchets against Iron, `weapon-rungs`' own cell: with the area spells on, **+4.2%** (2 seeds, the guard's) and **+4.3%** (6 fresh seeds, 2-7); with every monster's `spells` list cleared, +5.3% and +5.5%. The worn rung kills the same (255 an hour either way); the rung behind gains about 1% with the spells (246 against 243 on 6 seeds). The hammer and the Glade rows still pass.
- **Also measured there:** the same lone axes at 45 nets 2,376 g an hour with the spells against 4,767 without (food 7,650 against 4,320), still +31% over its store bill (the 10-18 rule's +25-35%).
- **The direct lever is the rung itself** (a notch on the Steel Hatchets); which of the Warrens' three spells moves it is not measured. Not changed here: the spell rows are the design's as written, the weapon rows are the designer's, and the guard stays as it stands (red on this branch).
- **OPEN, for the tier-dials owner (a guard that reads one seed's dice): `hunt-tiers` dials, "a dialled kill pays 0.829 times the loot".** The Glade at 31, a lone tank, Normal at the Deadly pull against Deadly at health x1.5, loot per kill on seeds 0-3: with the spells 0.829 / 0.854 / 1.065 / 0.791, with every `spells` list cleared 0.987 / **0.720** / 0.980 / 1.047. The bar is 0.85-1.15 on seed 0 alone; no spell moves a drop table, and seed 1 is red with no spell at all. The spells only reroll the dice. Hardening, not done here: read the loot line as total loot over total kills on several seeds ("THE BAR READS THE MEAN", ranger-floor), keeping the realized loot so a yield mutant still bites.
- **FYI, for the GAME DESIGNER (as ruled, but a player will feel it):** a group spell reaches a low hero carried by high friends. A Level 1 in the practice set behind three Level 37s at the Warrens dies 20 times an hour to Blasting Charge (every cast reaches it), and with the leave box on by default each death sends the whole party home (the 37s fall from 202k to 167k Level XP an hour, one seed). With every `spells` list cleared it dies 0 times. Tyler 11-04 ("dying should come if people take big risks") covers it; the warning on the hunt card does not yet say a group spell reaches everyone.

## 2026-11-06 · DESIGN (game-designer, lane: `lane/b-pace-final`) → COORDINATOR, for TYLER · **the pace is held on Normal, and a lone hero who presses a harder tier once per ground reaches Level 50 in about 102 h, not 168, for little measured risk**
- **RESOLVED 2026-11-06 (Tyler: "Yes, make it risky", then 20:20 UTC: fighting outside your weight class, even in a party, wastes money for more XP and a few deaths; lane/b-tier-risk):** the pace stays on Normal. Wickstead alone plays the ground as it stands at 2x and 2.5x. The Glade pulls 3 alone on Dangerous at 1.4x and keeps the full box on Deadly at 1.6x, the most a four at its floor (16) holds. A pair two Levels under the Glade now nets -1.9k to -7.9k an hour on Dangerous (was +0.4k to -2.8k) and dies there up to 8.8 times in 10 h. The fastest honest lone path reads 110.9 h, was 102.1. Board: "2026-11-06 Fighting above your weight class costs gold and lives".
- **SUPERSEDED 2026-11-06 20:20 UTC (Tyler: more XP above your Level is the intent, and the death penalty stays as it is):** the "dive Deadly and eat the deaths" item. Andy's three replay at 121.0k a head on the written row (1.45x their Normal), with 203 deaths and -4.7k an hour. That is the weight class working, not a bug.
- **WITHDRAWN 2026-11-07 (it broke Tyler's 11-04 NO LEVEL PENALTY; Systems stopped on lane/b-level-gap ac6f167a5):** the level-gap rule for Normal. Re-aimed to the monsters' own stats on lane/b-monster-bite, which measured them and STOPPED (next item).
- **OPEN, for TYLER (lane/b-monster-bite, measured, no rows changed): which hero does Normal at a ground's floor protect?** With no Level term, a pair 2-3 Levels under the Glade in tier-1 gear has about the stats of the median hero at the floor, so no monster stat costs one without the other. Every Wickstead and Glade monster's attack, 2 seeds x 2 h a cell: at x1.1 the Glade's tank in helm and body reads +27% over its bill (Tyler 11-02's own test, +71% today) and the pair still nets +3k. At x1.2 it reads +6%, while the pair still nets +2.6k to +3k a head and a lone hero 5 under still +0.6k to +2.5k. At x2 the pair loses 0.2k to 2.2k a head and a lone hero 5 under dies 2.5-5 times in 10 h, but the median hero at the floor in full gear is at +15% (sword alone -55%) and dips under 25% HP 51 times in 12 h (the bar is 1). Wickstead's fresh hero in the practice set dips 15 times in 12 h at x1.25. Designer's call: Normal stays the safe tier ("in range is safe", 11-04), and the weight class lives on Dangerous and Deadly (lane/b-tier-risk: the same pair loses 1.9k to 7.9k an hour there). If Tyler wants Normal to bite anyway, he drops the 11-02 helm-and-body test and judges the floor on the full kit, and the Glade can then take x1.2 (close calls 0.8 in 12 h on average). That makes supplies real at the floor (21% of income, was 10%) but still leaves the pair 2-3 under in profit. Board: "2026-11-07 Normal can't bite through monster stats".
- **OPEN, for SYSTEMS (engine, not a data row):** A tier's power per party size (`powerPm` as four numbers like `pull`, through `atTier`, `levelAtTier` and `hr_ground_tiers.power_pm`), so a lone hero above the Glade (31-50) stops holding its Deadly at 1.5-1.8x while a four at 16 keeps 1600.
- **Two rulings meet.** `LEVEL_PACE` (Tyler 2026-10-25: Level 50 in 168 h of "reasonably efficient hunting") and the difficulty tiers (Tyler 2026-11-05: Dangerous and Deadly bring bigger pulls, hit harder and pay +5 to +20% XP a kill). The curve is held on Normal where the game sends a lone hero (`tests/level-curve.mjs`), so a tier never moves it; it moves the fastest hour, and the tier is remembered per ground, so one press is the whole cost of the choice (first principle).
- **Measured** (plan `pacefinal`, every way to fight alone, 2 seeds x 2 h a cell; board section "2026-11-06 Final pace re-measure"): alone, Dangerous pays the median way to fight x1.04-1.05 on the Thicket and the Sewer (no bigger pull alone), x1.38-1.48 on Wickstead, x1.26-1.44 on the Glade and x1.11-1.13 on the Warrens from 45, and on Wickstead and on the Glade from 24 **every one of the eight held (no death) and the median way to fight netted more gold than on Normal** (the sword and the tank pay for it in food at Glade 24: +74 and +2.8k against +4.2k and +4.5k). Deadly then holds for all eight on Wickstead at 18 and on the Glade from 31 to 50 (147-153k on the Glade at 40-50, the median, against 86-87k on Normal, net +8.9k to +9.4k, no food bill), so the best tier that held and netted is x1.05-1.10 on the Thicket and the Sewer, x1.47-1.72 on Wickstead, x1.26-1.82 on the Glade and x1.11-1.15 on the Warrens. Applied Level by Level to the reference rate (the median style, the nearest Level of the grid): Level 10 in 4.8 h, 25 in 24.1 h, **50 in 102.1 h**, against 6.2, 34.5 and 169.8 on Normal. An upper bound: no career pressed it, and 4 h with no death bounds a death rate only under about 0.9 an hour.
- **Ruled for now (designer):** the curve stays held on Normal, the tiers stay as ruled, and the board prints the fastest honest hour beside the pace. Not changed here: the Glade's and the Warrens' rows are Tyler's own numbers, and the Glade carries a lone hero from 16 to 50, about 150 of the 170 hours.
- **Tyler decides:** does "reasonably efficient" include pressing the tier? If yes, either a lone hero's Dangerous on Wickstead and the Glade costs real risk (a smaller pull alone: the designer's rows on Wickstead, his on the Glade), or the curve re-fits to the tier path and Normal takes about 1.6x his hours (Level 50 in about 280 h). If no, nothing moves.

## 2026-11-05 · SYSTEMS (lane: `lane/c-caster-starter-bars`) → COORDINATOR + GAME DESIGNER · **built as ruled but for one gate: Green Sickness at mana 78%, not 80%; the Sewer's rung sits inside its own seed noise**
- **The ruling's 80% is red on a guard its author could not see run:** `forest-cave` was not run as a file on lane/d-caster-first-fights. `glade-between` holds the Sewer party under the Glade's 1,855.5, and at 80% the Sewer reads 1,881.5. With `first-grounds-net-chain` (over the Thicket's 1,838) that leaves a window of 17.5 g/h on the pinned six seeds.
- **The window is smaller than the noise.** Six seeds, the Sewer party's median net by Sickness gate at Frost Lance 70: 70 1,881.5 · 71 1,863 · 72 1,849.5 · 73 1,835 · 74 1,899.5 · 75 1,872 · 76 1,842.5 · 77 1,824 · 78 1,847.5 · 79 1,841.5 · 80 1,881.5 · 85 1,872 · 90 1,872.5 · 95 1,871.5 · 100 1,874. No order: a gate doesn't tune this, it rerolls it.
- **What it truly reads, 24 seeds, mean and its error:** Thicket 1,820 ±9 · Sewer on the old bars 1,885 ±9 · Sewer at 80% 1,855 ±10 · at 78% 1,857 ±9 · at 70% 1,867 ±9 · Glade 1,876 ±32. So 78 and 80 are the same bar, and both put the Sewer BETWEEN the Thicket and the Glade, where the old bars stood over the Glade. The ruling's reason for 80 (the Sewer's net rises with the gate) doesn't survive more seeds; its other reason (the Warrens' total-value at 70) stands on the guard as it runs. 78 is the nearest gate that lands, and every number the ruling measured stays about flat. Frost Lance at 60 also lands (1,841) and was declined: it costs a new Mage's Cellar net.
- **What the final pace re-measure should expect:** any later row, coin or engine change rerolls these six seeds. A red on either side of this window is that, not a bug, and one of the six already reads under the Thicket's 1,838 (1,785). **The durable fix is a hardening lane, not a gate:** make `glade-between` and `first-grounds-net-chain` read a mean over enough seeds, as `ranger-floor` did the same day ("THE BAR READS THE MEAN"). The Glade's sd of 156 g/h needs many: its gear drops swing it. Not done here: this lane keeps the guards as they stand.
- **Replaces** the 2026-10-23 "default bars name the store rune only for a role's core spell" and the 2026-10-29 "the class is not fully killed" list below (the designer's ruling on the board, lane/d-caster-first-fights).

## 2026-10-29 · SYSTEMS (lane: `lane/a-party-forfeit`) → COORDINATOR + BACKEND-ARCHITECT (+ SECURITY at EA) · **RESOLVED 2026-10-30 (staged, lane/c-party-instance-reset): #73 party forfeit and #60 "capped at 3" are both DB bodies (lane C)**
- **#73 cause (live, read-only).** Every window_forfeit row on cba835e4, d8a49fd1 and 002974be is `value_over` on raw_bear_meat / bear_claw: the Mosslight spawn-row gap that v0.2.69's 2027-02-10-drop-bounds fixed (applied). A refusal the SHARED world causes is pinned on the first member whose half trips it (hr_hunt_apply_instance `v_cur`) and counted on that seat (2027-01-22-party-settle-isolation §3), so the seats forfeit one at a time, six fires each, and no window in between pays anyone (the commit is all-or-nothing). That file lists this under KNOWN LIMITS. The edge never sees a forfeit (SQL closes the seat; the next span walks the unit out like a kick), so there is no engine-only fix.
- **Semantic conflict.** #73 asks that a forfeited member end the hunt for the whole party. 2027-01-22 deliberately says the opposite: "A FORFEITED SEAT SENDS NOBODY HOME" (Security threat #7: a member's own state must not end its partners' hunts; the Coordinator's 10-23 ruling treats it like a kick). Tyler's 10-22 box rule sends ticked heroes home when a member's hunt ends "for any reason". The griefing argument is weaker than the file says, because a griefer can already press Leave and send ticked partners home, paid.
- **Design (recommended, one body, `hr_hunt_settle_refused` restated):** a WORLD code (`value_over`, `kills_over`, `catalogue_missing`: the bounds that read the ground catalogue and the engine's output) is counted on the INSTANCE even when `member` is named, and the sixth ends every open seat at once through hr_hunt_forfeit (each `server`, or `left` if Leave was pending; same code, same boundary). Own-state codes (cover_over, item_locked, store_off, gold_short, budget) stay per seat. Unknown codes stay per seat, which fails toward isolation. Self-check: a world code planted on member A six times ends A and B at one boundary with one window_forfeit row each, and §6(c)'s own-state case stays as it is. Security to confirm at EA: the `xp` value bound reads the hero's own max mana, so check that no mid-hunt action can steer it. Optional (designer/Coordinator call): an own-state seat forfeit also sends the partners' ticked boxes home (Tyler 10-22). This needs the instance read to say which seat was forfeited.
- **#60 cause (REAL on v0.2.69, live).** `hunt_instances.density` is frozen once (2026-11-17 hr_hunt_density_freeze: `where density is null`, "nothing writes it again"). A party's instance IS the party id, and hr_hunt_enter_for (2027-01-19-play-cap.sql, the "No open session: the instance restarts" UPDATE) resets hunt_id, world and the clocks for every new hunt, but not density. A party therefore plays its FIRST hunt's pick on every later hunt and ground until it disbands. Live: Andy's 10-22 party 82888d29 is frozen at 3 (his "6x and 8x, still 3"); his "working again" in #61 was the new party bc38b5fd; d8a49fd1 played Coppercap at 8 from 14:43 to 19:48 on 10-29 although the leader's pick written at that start was 4; ca19cf1e (3 grounds) stays frozen at 12 from a Sewer pick. The engine is right: density 3/6/8 gives 3/6/8 kills a pull on Coppercap (play-ground, real settle).
- **Design:** the restart UPDATE also sets `density = null, refusals = 0` (the class: every per-hunt column; `refusals` would otherwise carry a dead hunt's strikes). The first session of the new hunt then fires the trigger, which freezes the leader's pick for the new ground. Self-check: a party hunts ground A at pick 3, ends, the leader picks 8, starts again, and the instance holds 8; a member who joins an open instance keeps the frozen value. The value bound reads hunt_instances.density (coalesced to density_max), so the edge is unchanged.
- **RESOLVED (Coordinator ruling 2026-10-30, per Tyler 10-22 "sends home every member with the leave box ticked for any reason"; built by lane/c-party-instance-reset, backend-architect, STAGED `2027-02-10-party-instance-reset.sql`).** An INSTANCE-level forfeit ends the hunt for every seat at once: the world itself is refused, so nobody is left to hunt it. This keeps 2027-01-22's intent: ONE member's OWN failure must not end the others (Security threat #7). A world code cannot come from a member's state (server catalogue, server-frozen density, engine output), so it hands a griefer nothing; own-state codes still end only their seat and still send nobody home. The optional "own-state seat forfeit cascades through ticked boxes" is NOT built (it would hand the griefer that power back). The world list, read from every code hr_hunt_apply_member raises: `catalogue_missing`, `kills_over`, `no_ground`, `value_over`; everything else (own state, the hero's own engine half, every hr_apply code, unknown codes) stays per seat. #60 built as designed, plus a §5(a) tripwire: every hunt_instances column is classified reset-at-restart (hunt_id, world, settled_to, next_swing_at, density, refusals) or kept (id, kind, created_at, version, world_swing), so a new column fails the self-check until someone decides. Guards: tests/party-flow.mjs PF-RESTART (the real Start twice), tests/hunt-sessions-settle.mjs PARTY-WORLD (both doors), each with a mutant. EA SECURITY: value_over's XP bound reads the member's own max mana; confirm nothing mid-hunt can lower it between the read and the commit.
- **#59 / #61 (Challenge) not reproducible on v0.2.69.** Real settle, Coppercap density 8, L42, 20 min, browser closed: tank+ranger+mage, tank+tank+ranger+mage, tank+melee+ranger+mage and tank+healer never had a monster turn on a non-tank, so no Challenge was needed (the slot reads "Holding the pack", hunt-scene-live LV-22). tank+ranger+mage+healer had 1 Healer peel, and Challenge took it back in the same step (0 ms off the tank). party-defense.mjs and targeting.mjs exit 0. Shipped fixes: a-bug61 (holder pulls, LV-PULL) and 4ee6dd781 (Challenge fires through the bar). Today Cheeseburger Eddie wields an axe, so his bar's Challenge is struck "Needs Shield" by design.

## 2026-10-29 · SYSTEMS (lane: `lane/a-pull-freeze`) → COORDINATOR + GAME DESIGNER · **report #69: the pause was the engine standing, not the settle; the fix lifts the Cellar's floor pay past the Thicket's**
- **Cause (measured).** With every pack down, `pull-cycle.js travel()` returned with no goal: the leader stood on the pocket it had cleared until something respawned, then walked. Fremulon + Eddie (L45 duo, Wickstead d8, their bars): up to 6 s still after the bottom-right pull, then a 10 s walk to a pack already back (28 standing swings an hour); a lone Cellar knight stood 18 s a lap. Not the settle: while #69's party was viewed, the browser settled every 16-26 s (ledger), the report's own client stats read starves 0 / diverged 0 / 165 fps, the edge had no CPU-time shutdowns (isolate max 1.11 s) and no 5xx 02:18-04:12, refusals 0 on both parties, engine cost 1.5 ms per simulated second. The "82 s FREEZING" was the account's OTHER party's 100 s tick sawtooth: `watched` was judged per user (tools now per hero).
- **Fix.** The leader walks on to its route's pocket and waits just outside its spawn at its pulling distance (`awaitPack`). Waiting there, a pack is hit in the swing it respawns, which exposed the playback unit book booking a newborn monster at its after-swing HP (its first blows counted twice: a standing monster with an empty bar, hunt-scene-live LV-5/LV-12); combat-sim.js now books it at the HP it was born with. EDGE MOVES (pull-cycle.js and combat-sim.js are in the hr-accrue bundle) and the client's prediction with it: deploy the edge before the push.
- **DESIGNER: the start-flow chain goes red.** tests/hunt-core/forest-cave.mjs `first-grounds-net-chain`: the Cellar's L1 floor no longer wastes its walk after each respawn, so it nets 1,930 g/h (was 1,828.5; kills 495/h, was 460) against the Thicket's 1,853.5 (was 1,844.5; it held by 0.9%). The Cellar's first Levels come ~7% faster for the same reason. Balance-neutral option, measured with the fix: Cellar `respawnMs` 30,000 -> 32,000 nets 1,829.5 g/h (the pre-fix pace exactly; 467 kills/h). It is a hunt-sessions catalogue row (`hr_hunt_grounds.respawn_ms`, the settle's kill bound), so lane C, and the bound TIGHTENS: apply it only after the edge runs 32 s. Or keep the faster Cellar and lift the Thicket's floor. Designer's call; this lane changed no balance value.
- **RULED (Coordinator 2026-10-29): the Cellar goes to 32 s** (the designer may revisit after the playtest). src/data/hunt-grounds.js + STAGED `2027-02-09-cellar-respawn-hunt-sessions-catalogue.generated.sql` (its self-check now asserts every ground's respawn_ms). EDGE FIRST, then the apply. **Open:** tests/level-curve.mjs C1 goes red (the fingerprint holds every open ground's respawnMs): the pace + ladder re-measure (~2-3 h on 4 workers) and `pace.mjs --write` re-pin it; re-fit only if C2/C3 go red.
- **Re-measured (plans pace 314 s + ladder 100 s): C2/C3 red at Level 25** (32.1 h vs 36, -11%): the walk-on lifts Levels 5-15 by 7-12% an hour (Thicket, Wickstead), 16-49 by 1-3%. **RULED (Coordinator): re-fit the curve, Tyler's hours are binding.** `pace.mjs --fit` (minimax 3.3%), the careers re-run on it: L10 6.3 h, L25 35.0 h, L50 172.6 h (curve 6.2 / 34.6 / 173.3). Level 10 costs 177,499 XP (was 157,965), Level 25 1,769,734, Level 50 13,411,459. STAGED `2027-02-09-walk-on-level-curve.generated.sql`. Order: apply it, deploy hr-accrue at once, then apply the Cellar file.

## 2026-10-28 · SYSTEMS (lane: `lane/b-curve-smooth`) → COORDINATOR + GAME DESIGNER · **the first ten Levels paced one by one (the 7x wall at Level 6 is gone)**
- **Done.** LEVEL_CURVE's first ten Levels are one bracket each: XP steps 133, 261, 514, 1,030 | 6,175, 11,231, 19,979, 35,703, 62,892, then 64,967 (Level 10 on, unchanged to the XP: every total from 137,918 is what it was). At the reference rate each Level takes about 2x the minutes of the one before in the Mill Cellar (1, 2, 4, 8) and 1.77x in the Thicket (16, 28, 49, 86, 152), then 156 min at Level 10. Measured on the real engine (8 careers): L5 0.25 h, L6 0.59, L7 1.05, L8 1.87, L10 5.84, L25 36.4, L50 173.2. tests/level-curve.mjs C6: no Level below the ceiling takes more than 2x the hours of the one before (16/16 defects caught).
- **Hours, not XP (designer).** The XP step jumps 6x at Level 5 because the Thicket pays three times the Cellar; an XP-based "2x" rule would force Level 6 to come faster than Level 5 or leave Level 10 at ~4 h. The rule is on minutes at the ground the game recommends.
- **What 1.5-1.8x can't do.** With Level 10's step held (64,967 XP, 2.6 h) and Level 10 near 6 h, the climb from 15 min must reach that step by Level 9: the Thicket's four steps are ~1.77x and Level 9 -> 10 is ~1.03x (the 10-27 plateau from Level 9 to 15). Steeper early steps or a lower L10 are the only other ways.
- **The sim's own lag.** Careers finish their 15-minute chunk in the Cellar after reaching Level 5, so the measured median reads L5 -> 6 at 20 min (2.5x L4 -> 5's 8); a hero who moves to the Thicket at once takes ~16. Slower styles (tank, sword, healer) read 26-29 min there. The tutorial already sends the player to the Thicket at Level 5.
- **Reference rate fixed.** pace.mjs read the Level a ground opens at as a blend of the ground before (L5 at 15.8k, the Cellar's 7.7k in the Thicket's 24k); it now reads the ground each chunk started on (L5 23.8k). skillsAt records every combat skill from src/data/skills.js (inner_flame, not prayer).

## 2026-10-27 · SYSTEMS (lane: `lane/b-level-curve`) → COORDINATOR + GAME DESIGNER (+ TYLER on §13.2) · **balance layer 1: the Level curve meets Tyler's 10-25 pace; what moves around it**
The Level curve is now PACE BRACKETS (src/data/core-model.js LEVEL_CURVE; src/core/xp.js; server rows hr_level_curve from tools/gen-level-curve.mjs), fitted on the real engine to LEVEL_PACE (Tyler's 10-25 targets) and pinned by tests/level-curve.mjs to the simulator's committed measurement (tools/balance-sim/level-pace.json). Only the curve moved: no monster XP, ground, gear, party or danger value.
- **No polynomial could do it.** Tyler's table's log slope dips between L100 and L500 and rises again; a sum of positive powers on any smooth XP/h misses by about 20% somewhere. The sim's earlier proposal (cubic 97 + quadratic 1,800, fitted on the best safe cell anywhere) re-checked on the recommended-ground careers: L5 in 4.5 h (the tutorial says a quarter of an hour), L10 12 h (+107%), L25 +53%, L50 +30%, L100-L1000 -18 to -29%. Five brackets (1 / 5 / 10 / 50 / 300) put every target within 3.5% (careers measured: L10 5.9 h, L25 36.4 h, L50 173.2 h).
- **Past L50 is a contract, not a measurement (designer).** No ground exists past L50, so L100-L1000 hold only if a new ground pays about LEVEL_PACE.contract = 1,086 x Level^1.333 Level XP an hour at its own Level (today's solo grounds in band: Cellar 7.7k at L4.5, Thicket 24.6k at L10, Glade 75.8k at L23.5, Warrens solo from 45: 179k at L47.5). A ground that pays less stretches every Level past it; C5 holds the contract to the measured ladder within 10%.
- **The reference is the recommended ground at the default density.** The full box levels faster (L50: tank 137 h, bow 124 h, hammer 94 h); a party of four was not re-measured on the new curve (a four's career costs about four solo ones; on the 10-19 curve it reached L50 in 74 h against 101-122 h solo). The danger layer (D2) is what should price the full box.
- **L32-L50 is the Glade's (D5).** A lone hero stays in the Glade from L16 to L50 (the Warrens is a party ground): a Level takes 3.5 h at L31 and 9.8 h at L49. Fixing D5 shortens L32-50; C1's fingerprint includes the Hunts window's pick, so that lane's guard goes red and names the re-measure.
- **Skills now run a little ahead of Level (Tyler §13.2, not approved).** Weapon skill 18 at L10, 32 at L25, 50 at L49 (13 / 26 / 45 on the old curve); the skill curve was fitted to keep skill near Level through L25.
- **Inner Flame fuelling (designer).** FLAME_FUEL (lane/b-inner-flame, Prayer's successor) was fitted to Inner Flame 15 by L25 at the 10-19 pace (11.97 h); 12 h is now about Level 11. The rate is unchanged and now names its fitted hours (refHours); tests/hearth-fuel-rate.mjs B1 pins it to them. Re-fit in the skill layer.
- **Gold priced by Level (economy phase §12).** Blessings stay free below L30, now 50 h of hunting (19 h before); blessing, stamina-refill and rename prices scale with Level, so they cost a smaller share of the gold a Level brings.
- **Death cost (unchanged rule, measured).** Unblessed, mid-Level: L10 0.14 h, L50 1.3 h, L100 5.2 h, L200 6.2 h, L500 10.9 h, L1000 21 h. From L86 a mid-Level death's 2% of total XP passes the Level's own progress, so the never-de-level floor decides it (at most one Level's hours: about 42 h at L1000).
- **Ship order (Coordinator).** After lane/b-inner-flame's 2027-01-31 set, apply 2027-02-01-level-curve.generated.sql, then 2027-02-01-hunt-sessions-catalogue.generated.sql (its precondition refuses the other order: without the three level rows the old curve functions never finish), deploy hr-accrue at once, then the client. Between the apply and the deploy a death may be refused once (death_xp_over) and settles on the next tick after it. Live characters keep their Level XP and show the Level it now makes (old L25 is L16, old L40 is L33, old L50 is L43); nothing is written.

## 2026-10-26 · SYSTEMS (lane: `lane/b-balance-sim`) → COORDINATOR + GAME DESIGNER (+ TYLER on ruling §13) · **today's game vs the 10-25 balance ruling, measured on the real engine**
Measured with `tools/balance-sim` (combat-sim.js through the world tick's settle, real src/data; 643 baseline jobs, 3,748 hero-hours of cells + ~1,250 career hours + what-ifs; committed summary `tools/balance-sim/baseline-summary.json`). Nothing in src/data changed: every item is a measurement or a proposal for approval.
- **Level pace (§2).** Careers hunting where the game recommends: L10 1.5-1.8 h (target 6), L25 11.9-14.8 h (36), L50 100-122 h (168); at the full box L50 in 57-86 h; a party of four own heroes from L8, 74 h. No ground past L50. Proposal: LEVEL_CURVE cubic 97 + quadratic 1,800 (a new term: src/core/xp.js, its SQL twin, the generated limits row) gives 7/37/130/477/1,821 h to L10/25/50/100/200 at the measured rate; the curve past L300 waits for grounds past L50 (their XP/h decides it).
- **The level-curve guard encodes the OLD targets.** tests/level-curve.mjs LEVEL_GUARD (2,900 x Level XP/h; L10 0.75-2 h, L200 3,800-4,200 h) contradicts the ruling (L10 6 h, L200 1,680 h) and the measured rate (XP/h is a ground's spawn cap, below). Any curve change toward the ruling turns it red: the curve lane re-bases the guard on measured rates, with its mutation proof.
- **No death risk anywhere (§3).** 0 deaths in every measured hour: in band, 10 Levels under a floor, with no armour, at x1.5 monster damage. Food (one 2 s lane: 36-150 HP/s) plus regeneration (6%/s between pulls) cover 80-100% of the damage taken; danger is a gold sink only (Warrens 10 under: -33k g/h). The Hard (10-30 deaths/1,000 h) and Extreme bands do not exist. Monster damage is NOT the lever (x1.25 / x1.5: more eating, still 0 deaths); a level-gap term on monster atk is (at +8%/Level under a floor deaths appear, steeply and style-dependent). Needs a calibrated sweep (100+ h a cell) before a number is proposed.
- **XP/h is the ground's spawn cap, not the hero.** As built, every style at every Level on a ground earns within ~15-25% (Cellar 7-8k, Thicket 21-25k, Glade 56-85k Level XP/h); a weapon tier adds 0-4% XP/h as built, +5-8% at the full box for single-target styles (meets §8), +1-5% for hammer/axes/casters (still capped).
- **Party XP (§5).** Against each member's own best safe solo at that Level: on the party grounds a four earns 0.86x (as built) / 1.03x (full box), a duo ~1.0x; on solo grounds a four earns 0.29-0.45x / 0.83-0.86x. Target four 1.15-1.25x. Cause: pack HP and yield both scale with party size (PARTY_SCALE) and kill XP splits evenly, so a party only matches a solo when its damage is n solo heroes'. Proposal: a party XP share bonus m(n) = 1 + 0.055 (n - 1) through xp-share's existing per-hero multiplier (xpMultOf); measured post hoc (XP feeds nothing in a fight): a four on a party ground at the full box lands at 1.20x; solo grounds stay solo-first. This re-opens Tyler's 10-22 "split evenly, no party bonus" (the 10-25 ruling's +15-25% asks for it).
- **Mode A/B (§6) is neither.** Today: coin split evenly among heroes present, commons round-robin, rares by the roll, store supplies personal (one purse per account); no Mode B, no consent setting, no join/leave policy. Mode A's "keeps own drops" is not what the engine does. Measured cross-subsidy is small (+-16..1,300 g/h a hero). Tyler/designer: is today's even split Mode A, or must Mode A become kill-owner drops?
- **Rare roll (§7)** holds (Gini 0.015 over 170 rolls). Edges: the rotation lives on the instance world (a new hunt resets it); a hero who leaves and rejoins is eligible at once (can win twice before the others); gold and items split over every hero present including one dying in the same swing.
- **Ground progression.** Above-band and party grounds are strictly better for a solo: L8 Sewer 62k XP/h + 6.7k g/h vs the Thicket's 25k; L11 Glade 48k safe vs 22k. The recommendation keeps a lone hero in the Glade from 32 to 50 (82k) while the Warrens solo at 41-50 measured Easy and profitable for every style (151-236k): groupFit 'party' + soloFrom 45 disagree with the measurement, and recommendedHunt ignores soloFrom.
- **Styles.** Hammer and Mage top 29 of 30 in-band groups; tank, sword and healer finish last in 27; at the full box the spread is 35-72% (hammer ~2x tank). Bow is dominated by crossbow + shield (same XP/h plus guard). Flame Strike never fires on a default bar (own Fire runes only). §13.1 (role parity) is Tyler's.
- **Gear.** Nothing above tier 3 (Level 30) is reachable (tier 4+ has no source; gloves and belts only at tier 1 from the Shop): no upgrade from 30 to 50+. A full armour tier cuts damage per monster swing 17% (plate) / 13-27% (leather) / 22-46% (cloth), one body piece 6% (plate): the 3-5% target is one piece, a tier is ~4. Armour changes neither survival nor profit in band today (no-armour cells: 0 deaths, profit -2..-20%), so tune it only after the danger layer exists (§11: one layer at a time).
- **Harness drift found:** play-ground.mjs's hand kit puts a Ranger in a bow one tier above its Level (willow_longbow at 15-29, maple_bow at 30-44); the simulator builds kits from GEAR_LADDERS + reqLv + reachableSources. Its purse never pays the store bill back between windows (gold_out cannot happen in the harness): the simulator reports net gold/h instead.

## 2026-10-24 · SYSTEMS (lane: `lane/b-gear-by-level`) → GAME DESIGNER + COORDINATOR · **every piece of gear is worn by Level**
Tyler 10-24 ("all gear should just be hero level"; "Supplies/runes stick to skill level") is built: every equipment row names `reqSkill: 'level'` at its unchanged number (gear-tiers.js LEVEL_REQ), hr_apply reads it through hr_item_requirement_unmet (staged `2027-01-14-gear-by-level.sql`, then `2027-01-14-items-catalogue.generated.sql`).
- **lane/d-danger's board section "C. Armour for every role"** still rules plate and shields on Defense and weapons on their style skill; Tyler's later ruling supersedes it (rulings-of-record). Designer: amend that section before it merges, or it re-states a dead rule.
- **Hand-authored Levels kept their old skill numbers** (they were Defense / Melee / Magic / Ranged gates read off the stats): off the tier ladder are Tusker's Charm 8, Woollen Cloak and Grayjaw's Ruff 12, Wolfbone Torc 16, Fang Studs and Banded Signet 18, Packlord's Band 22, the Verdite set 38 / maul 42, the earrings 34/50/66/82, the uniques 35-95. Designer: confirm each as a Level, or re-rung them on 1/15/30/45/60/75/88.
- **Above Level 30 the coach names no gear** (none is reachable until Pebblebrook Bank / the Rootcellar ship). That is the truth, not a bug.

## 2026-10-23 · SYSTEMS (lane: `lane/b-spell-content`, S3) → COORDINATOR + GAME DESIGNER + ASSET DIRECTOR + INTERFACE (p40) · **choices the rulings left open**
Staged, in order: `2026-12-22-rune-catalogue.generated.sql`, `2026-12-22-rune-ladder-cut.sql`, `2026-12-22-hunt-sessions-catalogue.generated.sql`, `2026-12-22-spell-content.sql` (S1a's 12-21 pair applies first). Regenerate the two catalogues ONCE more if loot-bands (12-20) or party-leave (12-18) lands first.
- **Default bars name the store rune only for a role's core spell** (Fireball; Greater Mend). Measured on the real settle: a store rune on every default rune slot took the Sewer floor party's net under the Thicket's (forest-cave `first-grounds-net-chain`) and the Warrens floor tank under +25% (drop-tables). Every other default rune slot casts the hero's own runes only; a NEW slot the player adds starts with the store on (bar-draft storeDefault), so Tyler's "gold per cast" holds for every slot a player builds. Designer: confirm, or retune income (p30/p31).
- **Store runes 1 g a cast; the Chalked rune books at 0** (BASIC_AMMO_PREMIUM x 0): at 2 g the same chain check failed. Values 0/2/4/6/9 by tier, PROVISIONAL.
- **Version ladder:** mana x1.2 a version, outPm 1000/1740/2520/3310/4100, `lvPm` 10 (+1% a level). At +4% a level the Warrens boss fell under its 10 h rare pace; at +1% it sits at **10.1 h**, on the edge of drop-tables `rare-pace`. loot-bands should know.
- **Which carried tier a spell spends** (until p40's `action.rune` picker): the highest tier the hero's level has unlocked, then lower tiers, then the store if the slot names it.
- **Air** is a declared, hidden family with NO items: an item with no source and no use is not authored (catalogue-coherence C1, W0). The haste spell brings its rows.
- **Names to keep or change (designer):** Mend (universal self-heal: heal 20-30, 15 mana, 6 s, Magic x0.25), Protective Ward (Bible name; Earth friend shield 30, 25 mana, 12 s), status "Sickness" (+10% taken, 6 s, one stack). Staves: Demoncaller (now two-handed) and Void Censer heal; Whispering Codex and Voidmaw Scepter strike.
- **Mana train** (ACTION_SET_SKIPS) skips every rune spell, now including the heals and Arcane Barrier.
- **Interface (p40):** an ignore list binds only slots that aim at monsters (Coordinator 10-23) — the Configure window should not offer it on food, drink, heal or shield slots. `src/core/ammo.js` still calls an empty staff slot "dry" (no combat reader; stale since S1a).
- **Asset Director:** the 30 rune icons are derived (`tools/world-art/rune-icons.mjs`: the Chalked tablet + a gold numeral II-V; Ice and Poison tablets recoloured from Chaos/Death; store runes in plain stone). Draw real Ice, Poison and Rupture marks; Mend and Protective Ward have no ability icon (glyph); `green_sickness.png` is the renamed Nature's Wrath tile.

## 2026-10-23 · SYSTEMS (lane: `lane/b-spell-core`, S1a) → COORDINATOR + GAME DESIGNER + ASSET DIRECTOR · **merge order with loot-bands, and what S3 must fill**
Staged: `2026-12-21-hunt-sessions-catalogue.generated.sql`, then `2026-12-21-slot-truth.sql`.
- **Two forward hunt-sessions catalogues:** `lane/b-loot-bands` generates `2026-12-20-hunt-sessions-catalogue.generated.sql` (monsters, drops); this lane `2026-12-21-...` (Plain Iron Arrows, the retired eat-at / drink-at options). Both edit `tools/gen-hunt-sessions.mjs` OUT_NAME, `src/data/supply-basics.js`, `tests/hunt-core/drop-tables.mjs` (here: caster-floor counts casts) and `tests/restore-census.baseline.json`. The lane merged second regenerates ONE forward file from the merged tree (a stale 12-21 must never apply over 12-20's kill bounds) and re-pins the census.
- **Runes have no basic-attack use any more** (Tyler 10-23): Earth, Water, Chaos, Death and Blood Runes, Runecrafting's first products, fuel nothing until S3 maps families to spells; the kit's 50 Air Runes are a hidden family's. S3: family x tier rows, re-point the 14 recipes, one store row per family (each drops out of supply-basics NO_STORE_PARTNER), Rend / Frost Lance on, air_rune out of the kit.
- **Plain Iron Arrows icon** (Asset Director): `assets/icons-bundle/pixel/supplies/plain_iron_arrows.png` is a byte copy of the Iron Arrows item icon (palette-legal, pixel-icons green). Draw its own.
- **A store-fed Ranger at the Thicket floor loses gold** (designer, p30/p31): 50 Iron Arrows then Plain Iron Arrows at 2 g a shot = 2,652 g/h of store against 1,463 coin/h (real settle, L10, 1 h). The price follows the rule (2 x book value); the free Bronze rung is the floor.
- **Stored bars change meaning, by ruling (c21):** a slot saved with no conditions now fires whenever it is ready (a bare Greater Mend heals anyone under 100%), as the Configure window always said; role default bars keep their old triggers, now written on them.
## 2026-10-23 · SYSTEMS (lane: `lane/a-andy-hunt-bugs`, Andy a08) → GAME DESIGNER · **"Follow <party leader>" follows the PULL leader**
- The Target select names the PARTY leader ("Follow Eddie", `src/shell/widgets/settings-intent.js` patchControls), but the engine's "follow" reads `world.leader`, the PULL leader: the lap's holder under "Take turns" (`src/core/hunt/pull-cycle.js` pullLeader, bug #61). With two tanks taking turns, "Follow Eddie" follows the other tank on alternate laps; with a non-tank party leader it never follows them. Not changed in this lane.
- **Designer to rule:** (a) follow the tank holding the pack (the engine as built; the label becomes "Follow the tank holding the pack"), or (b) follow the party leader (the engine reads the leading member's unit: a world-step change and an edge deploy).
- Also found (perf, client): while the live view runs, `CharacterSession._play` skips `timeline.reconcile(pose)`, the only place the timeline forgets a unit, so `tl.units()` keeps every monster of the hunt and the scene's per-frame loop and `revive` walk all of them. Owed to the hunt-view lane.

## 2026-10-22 · SYSTEMS (lane: `lane/a-hunt-camera`) → GAME DESIGNER + ART DIRECTOR · **the hunt camera vs NO VOID (Tyler 10-18)**

1. **OPEN (designer + art director): a sliver of void can show beside a docked hunt panel at a room's edge.** The Coordinator's 10-22 ruling (camera on the viewed hero, clamped only at the room's edges) replaces NO VOID in hunt rooms only (`camera.js frameView`, map kind `hunt`); town and home keep it (world-core C8). NO VOID held the WHOLE view on the room, so a hero within half the uncovered World plus a panel's width of the edge (17 tiles at 2000 px) slid to the analyzer's edge. Now the uncovered part stops at the room's edge, and the strip under the analyzer (shorter than the World) can show the void past column 59 of Coppercap Warrens while the party fights at the Tool Store. Fix in data/art, not the camera: a wider rock/tree ring around each hunt map, or past-edge fill drawn as the edge material.
2. **FYI (art director, hunt-screen owner): on the phone the party panel sits below the screen.** At 922x423 the action bar (a centred widget) pushes the 388 px party panel below it (`clearOfEdges`), top 424 of 423. `hudInsetOf` now ignores a widget outside the World and reads the top-right hunt bar as a top bar, so the camera no longer frames the hero in a 144 px strip there; the panel itself is still unreachable on the phone. The first-hunt coach tip ("Tell your hero when") also sits on the middle of the phone's World, over the hero the camera centres there.

## 2026-10-22 · SYSTEMS (lane: `lane/a-ui-bugs-1022`) → GAME DESIGNER + ART DIRECTOR · **a docked window stops above the action bar, so Gathering and crafting scrolls at 1440x900**

1. **RULED (art director 2026-10-22, lane/b-ui-art-pass): the Gathering list gets shorter, the cap stays.** A skill row puts its XP to go and level on the name line (`src/styles/windows.css .hw-skill`, desktop; the phone's two-up rows unchanged): the body needs 486 px, not 633, and gets 502 above the 178 px bar at 1440x900 (1920: 486 of 633). alpha-windows and window-camera (WC-6 at 1440/1920/922) exit 0 on that branch. Original entry: **OPEN (designer + art): AW-17 (Tyler 10-18, "neither skills window scrolls") is red at 1440x900 by 125 px.** Tyler 10-22: a Settings tab pushed the action bar to the far left. Cause: a docked window sizes to its content, and one tall enough to reach the bar's row made the centred bar (970 x 182 px at 1440x900, 235..1205) jump to the nearest clear spot left of the dock (x 57 at 1440, -98 px at 1920; window-camera WC-6 reproduces it). The fix (`hud.js dockCap`, desktop only) ends a docked window 12 px above the bar when its column crosses it, so the bar never moves. Gathering and crafting needs 636 px of body; above the bar it gets 511. Both rulings cannot hold at 1440x900 with today's bar and list: rule one — make the Gathering list ~125 px shorter (art/designer), or accept a scroll at 1440x900 (AW-17's desktop check then moves to 1920x1080). The guard is left as it is until ruled.

## 2026-10-22 · SYSTEMS (lane: `lane/b-farm-window`) → GAME DESIGNER + COORDINATOR (apply) + SECURITY (reopen review) · **the Farm window: how many plots a new hero has**

1. **OPEN (designer): a new hero can plant 2 plots, not 4.** `start-kit.js` START_CURRENCY `farmPlots: 4` makes `hr_create_character` insert four empty `player_farm` rows, but `hr_farm_plant` refuses any plot at or past the property cap `(property tier + 1) * 2` (`homestead-tiers.js` PROPERTY_TIERS: the Camp has 2 plots, the Homestead 4), so plots 3 and 4 answer `plot_cap`. The designer's 2026-10-22 walk-through ("plant turnip on plots 1-4") assumed 4. The Farm window follows the server (`farm_land.cap`, 2 at the Camp). Rule one: drop the kit to 2 (data), or start heroes at 4 (a cap rule change in `hr_farm_plant`, a Lane C body). No property purchase has a client door yet, so a hero cannot grow past the Camp's 2 today.
2. **Apply: `2026-11-22-farm-window.sql`** (STAGED; game CLOSED: applies on its passing §4), after `2026-11-21-shop-seeds.sql`. The client half (the Farm window) calls `hr_farm_harvest_replant` and reads `farm_land`, so the apply precedes the client push. MONEY: one seed bought at the listed Shop price inside a harvest, so it joins the reopen gate's Security review.

## 2026-10-20 · SYSTEMS (lane: `lane/a-drop-tables`) → GAME DESIGNER + COORDINATOR (apply + edge deploy) + SECURITY (reopen review) · **drop tables: what loot can and cannot fix**

1. **RULED (designer 2026-10-21, docs/planning/PRIORITY_BOARD.md "Designer pass 2026-10-21"). BUILT on lane/c-caster-economy (systems, 2026-10-21): the rows + 2026-11-03-hunt-sessions-catalogue.generated.sql and 2026-11-03-alpha-catalogue.generated.sql STAGED (apply, then the hr-accrue edge); drop-tables `caster-floor` holds it. Open for the designer: supplies.js BAG_GUIDE_BY_HUNT millrace_sewer magic still suggests 1,500 Fire Runes, which no Sewer spell now needs:** drinks ×12 (the food rebuild's grain) and ×5/3 price, Fireball rune-free; the measuring harness's "mage" held a staff (a second Healer): with a real Mage the party WIPES today in 2-13 min. After: 0 deaths in every kit, Healer +26% in the ladder kit. Original entry: a Mage or Healer loses gold on every in-range floor whatever the loot. Measured on the real settle (tests/hunt-core/drop-tables.mjs prints it every run): the Sewer's party of four at 8, full own-tier set, store bill per hero-hour Healer ~9,500 g, Mage ~9,100 g (about 1,500 Thin Turnip Juice each, 1 g a mana point), Ranger ~1,400 g, Melee ~700 g; the party nets -48%. Covering that with coin would take ~4x the Sewer's coin and make a solo Melee +300%. The class is the drink price per mana and the casters' spend, not the drop table; this lane floors the Melee reference (+32%) and leaves the caster bill to the designer.
2. **RULED (designer 2026-10-22, lane/b-armour-weights; PRIORITY_BOARD Decisions "Coppercap Warrens at its floor"):** store tier 4 -> 3 (staged 2026-11-13-hunt-sessions-catalogue.generated.sql), tier-3 damage scale 4.4, the card offers the ground alone from Level 45 (soloFrom); drop-tables warrens-floor guards it. Original: the Warrens' store food is tier 4 (supplies.js BAG_GUIDE_BY_HUNT coppercap_warrens tier 4: 432 g Salted Swordfish) while every goblin row is tier 3; its comment ("goblins are tiers 3-5") is stale. A solo Melee at 32 eats ~9,300 g an hour there. This lane did not move it (the hunt's tier also picks the bag guide); the party reference clears +32% at the tier-4 bill.
3. **PARTLY RULED (designer 2026-10-21):** the Sewer PARTY floor survives the hour in every kit once item 1's rows land; the SOLO Sewer kills a starter-kit Melee in 2.4 min (RULED 2026-10-21 addendum: four bound `practice_cap/jerkin/leggings/boots`, medium, defB 2/3/2/2, no modifiers, worn at creation, one set for every weapon; rows on the board, "Designer pass 2026-10-21" §2; Systems builds). Original entry: **OPEN (designer + systems):** the floors are lethal to the smiths' ladder kit (weapon + helm + body): the Sewer's party of four falls to the Rat King at 8 in ~14 min, the Warrens' at 32 in ~10 min. With the full own-tier set both survive the hour. The equipment rows now supply that set in hours; the floors themselves are combat balance. **BUILT (systems, lane/c-starter-armour, 2026-10-21):** the four rows at 2/3/2/2, START_EQUIPMENT and 2026-11-03-hero-kit-catalogue.generated.sql (STAGED). Tyler's correction: a fresh solo Melee starts in the Thicket (solo first, band 5-15); the Sewer is the first PARTY ground, balanced for parties (Cistern Spider stays atk 13). hunt-core/forest-cave `thicket-solo-starter-kit`: a start-kit Melee at the Thicket floor (L5, real settle) lives the hour on the designer's six seeds at +1,021..+7,713% (minimum +25%). Weapon + shield alone also live all six (+347..+573%), so the armour is not load-bearing there; the case's mutants are lethality (wolves atk 13) and the bill (store heal x100). A solo start kit in the Sewer still dies on 4 of 6 seeds (no assertion: not its ground). **CUT; RESOLVED (systems, lane/c-starter-armour, 2026-10-21):** the designer cut the practice armour (purpose test) and the lane removed it. forest-cave `thicket-solo-starter-kit` (plain start kit, L5, six seeds) lives 6/6. `first-grounds-net-chain` (Coordinator: the reference ladder kit at every floor, six-seed median net g per hero-hour) holds with no coin change: Cellar L1 1,738 -> Thicket L5 1,788.5 -> Sewer L8 party 1,906.5.
4. **OPEN (designer): imbuement items do not exist yet.** The 10-14 ruling's per-monster imbuement drop needs the imbuement system (an item with no use fails catalogue-coherence), so each table keeps gold + junk/material + ONE equipment row; the imbuement slot lands with that system.
5. **Known limit:** each slot is an independent roll, so a hero still sees streaks (one 6 h seed: 11 helmets, 2 legs). The class this lane kills is structural (bodies and legs had NO source anywhere: catalogue-coherence AWAITING_ROSTER; small-slot salvage was the only gear). Smoothing streaks needs a server-side duplicate/pity rule, not data.
6. **Apply: `2026-11-02-hunt-sessions-catalogue.generated.sql`** (STAGED, NOT APPLIED; only hr_hunt_kill_bounds moves), then the hr-accrue edge (monsters.js, drops.js band `gear`). The old edge pays old tables inside the new, wider bounds, so apply first.

## 2026-10-20 · SYSTEMS (lane: `lane/a-pull-density`) → COORDINATOR (apply + edge deploy) + SECURITY (reopen review) · **RESOLVED BY RULING: the party leader chooses the density; a boss never repeats inside a pull**

1. **RESOLVED (Tyler 2026-10-20, "There should be a party leader that chooses the hunt settings"; replaces the smallest-pick rule this entry first built):** in a party the LEADER's pick is the pull for the whole instance, clamped to the ground for the party's size; solo, a hero's own. One code path, server settle and browser live view alike: `hunt-grounds.js partyPick` (the hero flagged `lead`, else the lowest seat when the leader is not on the instance) feeding `densityFor`, called from `combat-sim.js picker`; a peer's `lead` rides the frozen `hero` (member.js FROZEN_KEYS). The leader is the party's own crowned seat (`hunt_parties.leader_*`), read per member as `leads`. A member's hunt picker shows "Set by <leader>: N each", read-only, no step. Tests: conditions `density-pull` (leader 7 + member 0 / 3 spawns 7; the smallest-pick rule is a caught mutant), hunt-live `LV-K` (the browser predicts the peer leader's pull), hunt-screen `HS-14` (member read-only, sends nothing; the leader keeps its step).
2. **RESOLVED (designer ruling, Coordinator 2026-10-20): a boss never repeats inside a pull.** `pull-cycle.js spawnPack` takes `hunt-grounds.js pullRows`: the pocket's authored rows first (a box's designer `pack`, else its `spawns`), then the extra slots cycle its non-boss fill rows; a pocket of bosses only keeps its as-built pack. The den's Old Grayjaw (no `boss` flag) stays single because the fill is the box's `pack` past its base. Test: pull-cycle `boss-once-per-pull` over every ground at every density to its max.
3. **Apply (STAGED, NOT APPLIED): `2026-11-01-party-leader-density.sql`**, after `2026-10-31-live-horizon.sql`: restates `hr_hunt_instance_read` (+ `leads`), `hr_hunt_party_view` (+ `leader_density`) and `hr_action_set_options` (a party member's density refused `not_leader`), §0 md5-pinned, §2 executed and rolled back (refusal, leader save, member's view, the instance read flags the leader alone). Moves no value. Then the hr-accrue edge (hash in the lane report). The apply precedes the client push: until the apply, the old view sends no `leader_density`, so a member's picker shows no density (null = unknown, nothing to press).
4. **RESOLVED (systems, 2026-10-20): a full box no longer walls the leader off.** With item 2 a box pocket at 8 spawns its designer `pack`, a ring on every tile round the pull tile; the leader's goal (the free centre) was unreachable and the duo stood at the first pocket for the whole hunt (0 pulls, 0 laps in 30 min; caught by `density-laps`, which this branch's own first build failed). `pull-cycle.js travel`: a non-kiting leader whose next step is a monster of its pack AND that has no way round to its goal (`movement.js reachable`) pulls from there; a ring with a gap is walked into as before (a first cut without the reachability gate changed lane/a-hunt-motion's LV-T sewer fight; caught on a trial merge). Tests: pull-cycle `full-box-pull` (8 pulls from the edge, 7 walks in; both mutants caught), conditions `density-laps` (3+ laps, every respawn 8), hunt-live `LV-B` (viewed). **Scene bug found on the way:** `scene.js` cleared a monster's death mark whenever it moved, so one killed mid-step was drawn standing at 0 HP for ever; it now stays dead when its HP at the instant is 0 (hunt-scene `SC-11` + mutant). That region is clear of lane/a-hunt-motion's scene.js edits (trial merge: zero conflict hunks).
5. **Known limit:** a party whose leader has left the hunt (still leading the party) runs at the lowest hunting seat's pick until the leader is back on the instance; the member picker still shows the leader's. Copying hunt settings to a partied character (`hr_action_set_copy`) is not refused, but the engine never reads a member's pick.

## 2026-10-20 · SYSTEMS (lane: `lane/b-live-hunt`) → COORDINATOR (apply) + lane/c-bestiary + lane/c-server-cleanup + SECURITY (reopen review) · **live engine: two staged files, one seam name, one overlap**

1. **Apply, in order, after 2026-10-29-party-security.sql:** `2026-10-31-party-create-retire.sql` (drops hr_hunt_party_create + its baseline row; the first invite makes the party) (travel_s = 0 landed on main with 2026-10-28-hunt-enter-after-stamina.sql; this lane stages nothing for it). Then the hr-accrue edge (hunt_live / hunt_check, the stop-at-last-end engine fix). `tests/run-sql-tests.mjs` KEEPS its hr_hunt_party_create row: that static lint grades the historical grant in 2026-10-23-hunt-party.sql (removing it adds a 15th static fail).
2. **lane/c-bestiary:** the member's relic multipliers come from the envelope key `relic_mults` ({ monsterId: mult }, hunt-settle.js memberInput → member.js relicMult, 1 when absent). Project exactly that key, or rename it in hunt-settle.js in your lane.
3. **lane/c-server-cleanup:** this branch already deleted hr-accrue/market.js and the market_* verbs (request.js / intents.js / index.ts, tests/market-intent.mjs retired); a clean merge needs your deletions to be the same lines.
4. **Security (reopen), both calls ruled by Tyler 2026-10-20 and built:** `hunt_live` sends 16 combat seeds (src/data/hunt-tuning.js liveSeeds), never the drop stream or the secret; a peer member is only its frozen numbers (src/core/member.js FROZEN_KEYS, tests/hunt-live.mjs LV-P); leave / hunt change / kick pend until settled_to + 32 s (`2026-10-31-live-horizon.sql`, hss NO-DODGE). Apply it after party-create-retire and with the edge that sends 16 seeds.

## 2026-10-18 · SYSTEMS (lane: `lane/b-condition-builder`) → BACKEND (lane C) + GAME DESIGNER + ASSET · **the bar/Configure-action spec needs server fields the slot does not have**

Client shipped on the branch: centred Configure action (Spells/Runes/Items), 2x10 bar ("+", one count, strike, "!" + tooltip, drag), density on the hunt picker, store words. NOT faked on the client, each needs a DB + engine (edge) change:
1. **A named Shop item paid per use (Tyler: "Cooked Shrimp 19 gp, as used").** Today a slot naming one item (`cooked_shrimp`) uses ONLY the own stack (consumables.js slotWants), and the per-use store is the tier's BASIC row (`salted_shrimp` 14 g, supply-basics.js) reached only through "Any food"/"Any drink" (resolveLine) or an arrow's plain partner (shopShotFor). Needed: the named item falls back to its `hr_shop_supply_offers` price per use (server-priced in the settle, ledgered as `supply_buy`), and the Designer rules whether basics retire.
2. **Slot `enabled` and ignored monsters.** `hr_hunt_slot_check` / conditions.js `slotProblem` refuse any key beyond id/action/conditions/join. Needed: `enabled` (pickSlot skips it; Shift+click toggles) and `ignore: [monster ids]` (never targeted, not counted by `enemies_in_aoe`).
3. **Density per ground.** Stored once per action set (`options.density`); the hunt picker shows that one value. Needed: a per-(character, hunt) value merged into `hr_hunt_member_read` options.
4. **"When I run out of gold: Leave the hunt (default) / Sell loot".** Sell-to-cover is unconditional (action-rules.js buyFromShop); needs an option row + the gate.
5. **Town bar reads action set 0.** `hr_hunt_settings_view` uses the open session's preset else 0, never `player_hunt_active`, so a setup that switches the set is not what the town bar edits.
6. **Not projected:** a slot's live cooldown (for the cooldown number) and active-effect timers (for the strip under the bar). **Asset:** no tile for Cleave / Rend (glyph shown).

## 2026-10-18 · BACKEND (lane: `lane/v021-integrate`) → GAME DESIGNER + SYSTEMS + COORDINATOR (apply) · **integration v0.2.1: what the merge decided**

1. **Density: two sliders (Game Designer, decide one).** The action engine reads `densityMax` (per party size, never under the full box 8; `densityFor`), the forest/cave grounds carry `density: {solo, perHero, max}` (Thicket solo 6, Warrens solo 4; `densityCapFor`, not wired). The integration gave both new grounds `densityMax [8,8,8,8]` + `partyScale: true` (the engine's rule and its guards), so a solo hero may pick 8 there today, above the designer's 6 / 4.
2. **One forward hunt-sessions catalogue.** S2's drinks and the engine's rows share `2026-10-25-hunt-sessions-catalogue.generated.sql`; the separate `action-conditions-catalogue` was folded in before any apply.
3. **The floor is a warning (Tyler).** `2026-10-25-hunt-floor-warning.sql` restates `hr_hunt_gate` for BOTH callers (session doors and hr_apply's named-hunt arm): refused only `SESSION_LIMITS.belowRangeRefuse` (15) or more levels under band[0]; enter answers `below_range`.
4. **Walkers wear outfits.** `hr_town_walkers` joins `player_outfits` once (owned-only); `town-walk.sql` now applies after `character-sheet.sql`.
5. **Hunt again.** The summary card's object-form enter is `CharacterSession.huntAgain` (the Hunts window keeps `enterHunt(hunt, bag, preset)`); its key is `l` (`y` is Party).

## 2026-10-18 · SYSTEMS (lane: `lane/town-presence`) → COORDINATOR (apply) + SECURITY (reopen review) + BACKEND + ART · **town presence: one system, three liveness stamps**

Staged: `supabase/migrations/2026-10-25-town-walk.sql` (after `2026-10-25-social.sql`; game CLOSED: apply on its §6). Client: `src/session/town-presence.js` (one per open character, `AccountSession.townOf(slot)`), `src/data/town-presence.js`, `src/world/town-scene.js` (peers on their own feet), `tests/town-walk.mjs`.

1. **Which presence is the source.** "Who is in town" is the 2026-09-13 town presence (flag `town_presence`, `presence_quiet`, `hr_town_zone`, `hr_town_of`). Its 25 s cron snapshot and id-free 7-key plaza projection cannot carry a walk, so this file EXTENDS it with positions (`hr_town_maps` catalogue + unlogged `town_positions`, one body per account) read through `hr_town_walkers` under the same flag and opt-out. `hr_town_of` (the text plaza + crier) has NO client in the rebuild; fold or retire it when a plaza/crier UI returns (the crier's speech bubble went with the dead legacy feed in this lane).
2. **Three liveness stamps overlap (Backend, decide one):** `player_state.last_seen_at` (hr_heartbeat; the WORLD TICK's online signal, 2026-10-14-world-tick-presence-signal.sql, and nothing in the rebuilt client calls hr_heartbeat today), `social_presence.seen_at` (friends' online dot, hr_social_state's 30 s poll) and `town_positions.at` (town walkers, 10 s keepalive). Walking deliberately does NOT stamp last_seen_at: that would change how the engine ticks a character. Recommended end state: one per-character presence row the three readers share.
3. **Security (reopen review):** walkers carry the account id + slot (as every chat line's from_id/from_slot already does) and the exact combat level (as chat's from_level does), not the old plaza's coarse band. A client authors only its OWN tile/goal/facing, bounded by the catalogue (no collision mask on the server: a forged tile inside a hedge is drawn on the nearest open tile). Blocks are filtered both ways, quiet/hunting/non-admitted are excluded, 250 ms floor + 90/min publish, 45/min read, fresh 30 s, cap 40.
4. **Art:** peers wear `outfitSprite(null, role)` (the role's style-1 hunt outfit). The server holds no outfit choice or colours; when one lands it is a walker key.

## 2026-10-18 · SYSTEMS (lane: `lane/chat`) → S1 server lane + PLAYTEST-FIXES + SETTINGS + NAMES + SECURITY (reopen review) · **chat, whispers, friends, blocks, inspect: what other lanes owe**

Staged: `supabase/migrations/2026-10-25-chat-channels.sql` then `2026-10-25-social.sql` (game CLOSED: apply on §6/§7; reviewed at the reopen gate). Client: `src/social/*`, `src/shell/{context-menu,menu-providers}.js`, `src/shell/windows/{chat,chat-combat,friends,inspect,block-list}.js`. Refusal words joined `src/shell/intent-words.js`.

1. **Blocks must refuse party invites (S1).** `hr_hunt_party_invite` is not on the server yet (the client's "Invite to party" is refused until it is). When it lands it must refuse across a block either way: call `public.hr_social_blocked(inviter_user, invitee_user)` (internal, 2026-10-25-social.sql) and answer the same neutral `unavailable`. Trade, when its lane comes, does the same.
2. **WASD with a window open (playtest-fixes).** The chat field is focus-based and never swallows a key (chat-social CW-3). But `world-boot.js onTop()` treats ANY open `[role="dialog"]` as on top, and every shell window is `role="dialog"`, so today ANY open window (chat included) stops WASD even with the field blurred. That is the general "a panel open blocks WASD" bug your lane owns; nothing in src/world input code was touched here (only `pick` was exposed on the runtime for the player menu).
3. **Everyone is "Adventurer" (names).** The rebuilt client has no name claim (`claim_display_name` is not on CLIENT_RPCS) and the wipe reset every profile name, so chat lines, whispers and the friends list read "Adventurer" and adding a friend BY NAME finds nobody. Every social verb also takes a user id (chat names, friend rows), so the menu works; the name claim screen is owed.
4. **Settings registry (lane/settings-organized).** The block list is a row in `src/data/social-settings.js` (category "Chat & Social", type `panel`, drawn by `src/shell/windows/block-list.js`); nothing was added to Settings markup. Fold the row into `src/data/settings.js`; the Friends window shows the same panel meanwhile.
5. **World right-click on players (DONE in this lane).** Party heroes carry `ref.player` from the server's new `party_people` section (2026-10-25-social.sql, seat -> account id + name); the World emits one `entity` event from its canvas (right-click or long press) and the pane opens the shell's menu. Town peers are stamped the same way from the town view, but the rebuilt client has no town presence poll yet, so no peers are drawn; when it lands its rows need `user` (the account id) for Message/Friend/Block. (Landed in lane/town-presence: walkers carry `id`.)
6. **Whisper names don't follow a moderation rename.** `name-moderation` §10 re-stamps chat_messages/market rows; chat_whispers (participants-only, 30-day trim) keeps the sent name. Decide at the reopen review whether to extend the re-stamp trigger.
7. **Security (reopen review):** eight new client RPCs + `hr_chat_send`/`hr_chat_recent`, all definer, `hr_access_check` first, `hr_rate_ok` budgets; the direct chat_messages INSERT and chat_blocks writes are revoked; party lines carry an `audience` uuid[] that party members can read (they already see each other); chat bodies have no profanity filter (the old client-side ChatFilter retired with the client).
## 2026-10-18 · SYSTEMS (lane: `lane/character-window`) → COORDINATOR + ASSET DIRECTOR + GAME DESIGNER + S2 / hunt-party server + hunt-summary lane + SECURITY (reopen review) · **CHARACTER WINDOW: hotkey C, the engine sheet, outfits, the death log**

1. **Hotkey C (Coordinator).** The Inventory merge freed `c` (Gear's); the Character window takes it. The Combat skills window (`skills-combat`, `k`) is gone: its ledger now lives in the Character tab (`src/shell/windows/skills.js combatLedger`). `k` is free. `tests/alpha-windows.mjs` WINDOWS / AW-17 / the one-window mutant were re-pointed accordingly.
2. **Apply + deploy order (Coordinator).** `supabase/migrations/2026-10-25-outfits-catalogue.generated.sql` (tools/gen-outfits.mjs) then `2026-10-25-character-sheet.sql` (cosmetic + display; no value) then the hr-accrue edge (new `sheet` verb, `character-sheet.js`; `accrual.js` only gains the exported `loadoutOf`/`heroSnapshot`, behaviour byte-identical), then the client. Until both land, the Character tab shows the server-owned lines and "Working out your combat numbers…" and never asks (no section, no ask).
3. **The combat numbers are the engine's, stored compare-and-set and versioned.** No SQL copy of combat.js: the edge computes the sheet with `heroSnapshot` and progression.js `xpMultiplierParts` (the one XP formula grantXp uses) and `hr_character_sheet_put` stores it only while `hr_character_sheet_inputs` (md5 of skill levels, worn set, style, active buffs, hr_perks_of) is unchanged, stamped `md5(inputs:engine payload hash)`; `hr_character_sheet_engine` records the latest engine, and the view projects a sheet only while its inputs and engine are current. Each window opening asks once, so the first opening after a deploy retires every older sheet. Stats the engine does not compute (leech, element protections, a character XP bar, bestiary/premium XP multipliers: `xpMultOf` is 1, XP-07) have no line.
4. **Outfit masks (Asset Director).** Only the witch has region masks, and only in `prototypes/hunt-sim/assets/walk/witch/mask_*` (legend hat=red, robe=green, trim=blue). The dye picker appears for an outfit only when the `hunt` atlas carries a `<sprite>_mask` sprite (`src/render/outfit-sprite.js hasMask`; region i = `MASK_COLOURS[i]` in `src/data/outfits.js`). Port the witch masks as `outfit_witch_mask` (same frames/anchor as `outfit_witch`) to light it up; no code change needed.
5. **Premium outfits (Game Designer, ruling wanted).** Systems' draft: knight, berserker, ranger, sorcerer, druid free; brute, witch, dawnward premium (`PREMIUM_PERKS.outfits`). Names: "Hedge Witch", "Quarry Brute", "Dawnward". Rows live in `src/data/outfits.js` and the migration's `hr_outfits` (CW-D1 keeps them equal).
6. **Other heroes' outfits (S2 / hunt-party server).** Your own hero now wears the saved outfit everywhere (`src/session/hero-look.js` reads the `outfit` section first). Party members are still drawn in their role's look: `hr_hunt_party_view` should project `members[].outfit` from `player_outfits` (owned check: `hr_outfit_view(user, slot)->>'worn'`).
7. **Death explanation (hunt-summary lane).** `src/hunt-view/death-explain.js` is not on this base. Each death row carries its server event id (`.hw-dl-head[data-event]`, `hunt_session_events.id`); wire the explanation to that id when both are on one branch. "Blessed" is not shown: blessings are data only (`src/data/blessings.js`), the server has no blessing column yet.
8. **Security (reopen gate).** New client RPC `hr_outfit_set` (its own rate bucket `outfit`, 20/min, via a whole `hr_rpc_gate` restatement md5-pinned on the 2026-10-21-hunt-sessions.sql body; idempotent; ownership from `premium_until`); two hr_engine grants (`hr_character_sheet_inputs`, `hr_character_sheet_put`, link 20 of the grant-hygiene chain); one edge verb `sheet` (bucket `accrue`, no key, moves no value).

## 2026-10-18 · SYSTEMS (lane: `lane/settings-organized`) → CHAT lane + S2 + PLAYTEST (inventory) lanes · **SETTINGS ARE REGISTRY ROWS: add rows, never edit the window**

`src/data/settings.js` is the one list (categories in Tyler's order: Gameplay, Interface, Combat text, Chat & Social, Controls, Account; an empty category is not drawn). `src/shell/windows/settings.js` holds no setting. To add one, add a row to a section in `src/data/settings.js` (`id, category, label, help, type, default, scope, bind`; contract at the top of that file, checked by `tests/settings-registry.mjs`). Display-only: `scope: 'residue'` + its field in `RESIDUE_FIELDS`. Server-saved: `scope: 'server'` + `intent` (a CharacterSession method; never residue). Chat lane: block list + chat filters; S2: services; playtest lane: inventory advanced view. A `list` type (block list) is not built yet: add it in `settings-model.js`/the window when the first list row lands.
## 2026-10-18 · SYSTEMS (lane: `lane/playtest-fixes-1`, Tyler's first live playtest of v0.2.0) → S2 server lane + ART DIRECTOR + GAME DESIGNER + ACTION-ENGINE lane + COORDINATOR

1. **Storage from anywhere in town (S2, no change required; one optional rule).** `hr_bank_move(p_slot, p_item, p_qty, p_dir, p_idem)` (`2026-08-27-bank-store.sql`, wrapped by `hr_require_settled` in `2026-09-28-settle-before-mutate.sql`) has NO place check: it already works from the blacksmith, the square or anywhere. The client now calls it (new Storage window, `CharacterSession.moveStorage`; `tests/client-intent-surface.mjs` pins it). **Gap:** it does not refuse while a hunt is open either, so a hunter could empty the home chest into the hunt bag from the field. The client keeps Storage off while the server's `hunt` section is open, but the client is not the authority. **Ask (S2, one statement, lane C):** in `hr_bank_move`, after the character lock: `if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null) then return jsonb_build_object('ok', false, 'error', 'hunt_open'); end if;` (`hunt_open` already has player words in `src/shell/intent-words.js`). Value-neutral move; goes in the reopen Security review.
2. **Going hunting solo (S2 + Security FYI).** The Hunts window's Enter calls the live, granted `hr_hunt_enter(p_slot, p_hunt, p_bag, p_preset, null, null, p_idem)` (solo = a party of one; a member of a party enters its party's ground). The bag it sends is names and counts only: the bag's own hunt supplies (`SUPPLIES`), each up to its remembered restock target (`src/shell/hunt-list.js packFor`), at most `SESSION_LIMITS.bagLines`; the server re-checks stock under its lock. `p_preset` is the active action set (`hunt_settings.preset`, else 0). No server change needed. `hr_hunt_party_start` / `hr_hunt_restart` are still staged-only (the party-ui entry below).
3. **Imbuements (S2, PENDING).** The Inventory's Advanced view reads `imbuements: { equip_slot: { slots: 0..3, filled: [{ kind: keen|life_leech|mana_leech|ward|element_ward, ms_left }] } }` (ruling D v2; `item-sections.js imbuementsOf`) and draws NOTHING until the server sends it. Listed in `tests/envelope-contract.mjs` PENDING; when S2 projects it, it moves to CONTRACT in the same commit.
4. **Art Director (ruling needed): item pockets are 32 px at ×1 now.** Tyler 10-18: "the items are far too big". The Inventory and Storage draw the 32 px pixel icon at ×1 in 36 px pockets and the doll slots at the same size (WORLD_SHELL §1 said icons are ×2 = 64 px everywhere, "if that looks small, the window gets smaller"). Whole-number scale, one density inside these windows; the world stays ×2; ledgers (Hunt prep, Shop lines) keep 32 px. The `satchel` object no longer paints the brown `--sc-top-1` + stitch (the iron frame and `--modal-bg` only); `--sc-*` tokens are now unread by the shell windows.
5. **Collision footprints (Asset Director FYI, data fix landed).** Measured with `node tools/world-art/build.mjs --report`: the town's `well` (mass 36 px) and `woodpile` (34 px) blocked 2×1 tiles (64 px). Both are 1×1 now (sidecars `art/world/common/{well,woodpile}.json`, atlas rebuilt, PNG byte-identical; `town_common` maskHash 82526f23 → 6f677c65; `world-core` L-COVER mutant re-aimed at the well's new tile). Every other town/cottage/cellar/sewer prop already blocks 1×1 or its building base. **The rest of "too far apart" is the engine, not data:** collision is whole tiles and a standing unit's feet sit on its tile's bottom row, so a hero can stop no closer than one full tile (32 art px = 64 screen px) south of a prop's base, and a full tile beside a thin post (lamppost mass 16 px). A fix is sub-tile footprints or a half-tile foot offset in `src/world/core/path.js` + compose: not attempted (Tyler: "not worth fixing now if not easy"). The server's hunt grid blocks material tiles only (S1 note above), so hunts are unaffected.
6. **Copy (Game Designer):** the Hunts window, Storage and Advanced view lines are Systems' drafts (`src/shell/windows/hunts.js`, `storage.js`, `inventory/advanced.js`, `src/shell/hunt-list.js`); the first-minute pointer reuses `HUNT_TUTORIAL[0]`'s title and text. The "solo / party" line is derived from each ground's seats ("Alone or with up to 3 more"); no ground row has a designed solo/party flag yet. If one is wanted it is a `hunt-grounds.js` column (the content lane's file).
7. **Action-engine lane (FYI, no file of theirs touched):** the bag sell shortcut moved from `S` to `Delete` so W/A/S/D always reach the World; `hunt-settings` / `bar-editor` were not edited. A bag stack's drag type is now exported from `src/shell/windows/inventory/actions.js` (`action-bar.js` import updated).
## 2026-10-18 · BACKEND (lane: `lane/s2-alpha-server`) → GAME DESIGNER + SYSTEMS (client, action engine) + ART DIRECTOR + SECURITY (reopen review) + COORDINATOR · **S2: the alpha windows' and party UI's server half landed; what each owner now holds**

Eleven forward files (`supabase/migrations/2026-10-25-*.sql`, after `2026-10-24-hunterall-119.sql`), proven by `tests/alpha-server.mjs` (10 arms, 12 mutants), `tests/settle-hooks.mjs` (3 arms, 6 mutants: S1's settle with every S2 hook at once), `tests/envelope-contract.mjs` (24 keys, 0 PENDING) and `tests/services-window.mjs` (5 rules, 5 mutants). The architecture check's fixes are in: no function body is patched at apply time (`2026-10-25-settle-hooks.sql` restates hr_apply, hr_hunt_apply_member, hr_hunt_member_read and three views whole, §0 md5-pinned, calling small named hooks), and the loot sale's gold goes through hr_apply.

1. **DATA (Coordinator ruling, Game Designer to confirm): the shop's stock.** `src/data/supply-basics.js SUPPLY_SHOP_OFFERS`: 5 foods, 6 drinks and 7 ammo at the designer's rate (`ceil(basic price x the item's own heal or mana / the basic's)`, a shot at its basic's per-shot price), plus Bronze Axe and Bronze Pickaxe (kind `tool`, 2 x book = 120 g; better tools stay smithing-only). No row is an assumption any more. **Consequence to rule on:** food and drink on the shop re-cap the vendor's buy-back at half the shop price (b565), so cooked food sells to the NPC for about half what it did (shrimp 18 -> 9, trout 55 -> 28, lobster 240 -> 125, swordfish 560 -> 288, shark 900 -> 462; drinks at half their offer). tests/gold-intents.mjs G1 is re-pinned to those numbers.
2. **DATA: the six drinks are live.** Spread into ITEMS / Cooking recipes / SUPPLY_ROWS (kind `mana`, packable) / ITEM_DESC; forward catalogues `2026-10-25-drinks-catalogue.generated.sql` (hr_items, hr_activities) and `2026-10-25-hunt-sessions-catalogue.generated.sql` (hr_hunt_supplies learns `mana`; own drinks share the one consumable lane with food in the settle). catalogue-coherence counts "drunk for mana on a hunt" as a use.
3. **ART (Art Director to judge):** the six drink icons are `moonbloom_elixir.png` re-poured into each drink's palette colours (`tools/world-art/drink-icons.mjs`), palette-locked and pixel-icons green; replace with bespoke art when ready.
4. **CLIENT (Systems): the Services window** (`src/shell/windows/services.js`, key R) sells stamina and blessings at the server's quoted price and changes the character's name; new readers `staminaRefillOf` / `blessingsOf`; the Shop files tool offers under Tools and keeps them out of restock. The party invite UI already calls the S2 invite verbs.
5. **SELL-TO-COVER honours locks:** the cover read never offers a locked item and the member settle refuses a cover line naming one (`item_locked`). Death XP: the edge's live timeline carries no XP (falls are member events), so nothing shows an unblessed number; the settle answer now carries the debited `death_xp`.
6. **RESTATEMENT (any later lane):** restate hr_apply / hr_hunt_apply_member / hr_hunt_member_read / hr_hunt_party_view / hr_hunt_party_finder / hr_hunt_section_view from `2026-10-25-settle-hooks.sql` (via `tools/build-settle-hooks.mjs`), and hr_hunt_enter as the wrapper over `hr_hunt_enter_for` (`2026-10-25-party-invites.sql`).
7. **RATE BUCKETS reused, not added:** settings and buys `hunt` (30/min), names and invites `party` (12/min; accept spends two), the item search `hunt_read`.
8. **MONEY SURFACES for the reopen Security review:** `hr_shop_refill`, `hr_stamina_refill`, `hr_blessing_buy` + `hr_blessing_take` (the death debit), the loot filter's `loot_sell` (one hr_apply in the settle; the daily gold budget; over it the items stay), `item_locked` in hr_apply and at sell-to-cover, the `supply.*` offers (foods, drinks, ammo, the two bronze tools) through edge `shop_buy`, the vendor bids they move, and `hr_hunt_party_start` (spends every member's own bag; item 9 of the party-UI entry below).
## 2026-10-18 · SYSTEMS (lane: `lane/action-engine`) → COORDINATOR + S1/S2 (backend) + GAME DESIGNER + SECURITY (reopen review) · **the conditional action engine: what it changed outside its own files, and what it measured**

1. **Regenerated in place (STAGED S1 files):** `2026-10-23-hunt-sessions-catalogue.generated.sql` (END_ORDER gains `rule`; options `density` 1..4 and `gather_share` 0..100; the world shape gains `ruleHold` + `density`) and `2026-10-23-hearthfind-catalogue.generated.sql` (boss kill rates re-measured, see 4). Both are pure functions of `src/data` (`--check` would be red otherwise). **If S1's copies are applied before this lane merges**, the generator must be re-targeted to a new dated file instead (the demolition → hunt-sessions precedent); `2026-10-25-action-conditions.sql` §0 refuses to apply without the regenerated rows, so the order cannot silently go wrong.
2. **S2 overlap:** `2026-10-25-action-conditions.sql` restates `hr_hunt_open_session` (a preset per ground) and `hr_hunt_settle_session` (the `rule` end arm). If S2 restates either, the later file must carry both changes.
3. **Engine behaviour moved (balance values unchanged, rulings wired):** packs spawn at `scaledHp` (550/700/850/1000 permille) on the grounds whose row says `partyScale: true` (mill_cellar, millrace_sewer), and a solo Healer's blows are floored at 500 permille everywhere. Measured on the real core (`tests/hunt-core/sewer.mjs --report`, 3 seeds): solo Healer now loops the whole sewer with 0 falls (was stuck at pocket 0-1); solo Ranger 0-1 falls; solo Mage 0. **A solo Melee (the sim's tank) still wipes 9x in 20 min at the Rat King** — HP scaling alone does not make him fair, because his damage is not scaled. Designer call: scale boss damage for the party too, or keep the King a party boss (DM-10, the monster swing model, is still owed and untouched here).
4. **RESOLVED (designer, lane/design-scale-king @cadee1b8a):** party scale is on every shipped ground and is PAID IN REWARD: a monster at s/1000 HP pays s/1000 of its kill XP, coin, every drop chance (a sure drop too) and the Hearthfind roll (engine: spawnPack stamps `yieldPm`, damage.landHit + hunt-rewards apply it), so yield per hour holds and no pinned odds moved. The King's pocket is minParty 2 (pull-cycle walks `routeFor`); the party finder shows MIN_PARTY_NOTE.
5. **Element ids (sewer gap 4) still disagree** (`nature`/`fire` vs `poison`/`ember`), and the settle sends every hero with element `''`, so in the live engine no hero blow meets an immunity yet. The solo-healer acceptance therefore runs BOTH today's neutral blow and the sim's `poison`; the floor is what lets the poison healer clear the cellar.
6. **Client not built (owner: client/art lane):** a "copy settings to another character" control (the verb `hr_action_set_copy` and `CharacterSession.copyHuntSettingsTo` exist); a stop-rule editor and the per-ground preset picker (the server takes `stop_rules` / `grounds` through `hr_action_set_options`). The density and gathering sliders ARE built (hunt settings window); gathering is stored and marked inert until the gathering engine lands.
7. **Density (Tyler 10-18):** the pick is the number of monsters a pull brings (0 = the pocket as built, stored 0..16), clamped by the settle to the ground's `densityMax` per party size; every ground allows at least the full box of 8 (cellar 8/8/8/8, sewer 8/8/10/12; the values above 8 are ASSUMED). Proven: 8 monsters fill the 8 tiles round a holding tank (`full-box`). The forest/cave lane sets its own rows (validateGround refuses a row under 8).
8. **Proposals, not rulings (designer):** the 3x3 / 5x5 attack items are fixtures over real arrows; an ammo row's footprint is an optional `area` field on `items.js` (none ships yet). The 4x4 alignment is fixed: the aim on cell n/2-1 from the north-west corner.
9. **Fixed on the way:** the settings window sent `food_pct` / `drink_pct`, which the server has no option row for (every eat-at edit was refused `bad_option`); it now sends `food_below_pct` / `drink_below_pct`.

## 2026-10-18 · GAME DESIGNER (lane: `lane/sewer-content`) → SYSTEMS (hunt core) + S1 + COORDINATOR · **the Millrace Sewer is data-complete; six engine/economy gaps it measured**

Evidence: `node tests/hunt-core/sewer.mjs --report` plays the real core (`stepSwing`) on the real map, 7 compositions x 3 seeds.

1. **ECONOMY BLOCKER: the store drink and heal are sized for the idle tick, not the hunt.** Tier-1 `thin_turnip_juice` restores 6 mana for 90 g and `salted_shrimp` 6 HP for 90 g (`supply-basics.js`); hunt heroes carry 120-320 mana and 120-200 HP. Measured: a full party burns **~84k g/h** in store drinks against ~6.5k g/h of income; at the RULED prices (BALANCE_RULINGS r2: mana 0.06 g a point, runes 6 g, bolts 1 g) the same consumption costs **~5.1k g/h**. **Ruling (designer):** the hunt's store rows are re-sized to the ruled price per point (a 60-mana tea for about 4 g, a 70-HP meal for about 3 g at tier 1). Owner: the consumables/supply data lane + S1 (generated catalogue). The sewer's coin and drops are already balanced against the ruled bill (coin + commons +6%, rares +19%).
2. **Party scale and the solo Healer floor are data, not yet read.** `hunt-grounds.js` `scaledHp(row, partySize)` (550/700/850/1000 permille) and `elementWithFloor(permille, role, partySize)`. Owed: `pull-cycle.spawnPack` spawns at `scaledHp`, `damage.hurt` applies the floor. Measured without them: a solo Melee hero wipes at the Rat King 8 times in 20 min; a solo Healer never kills pocket 0 (every rat is poison-immune) and spends ~50k g/h on drinks doing it.
3. **DM-10 monster swing.** The sewer rows carry the sim's `atk` (a blow is 1..atk at 0.60); the core prices it `floor(atk x 0.45)` at `0.5 + 0.02 x (atk - def)`, so the sewer hits far softer than it was tuned (full party: 0 falls). Parity owed in `damage.js`; no data change until it lands.
4. **Element ids disagree.** Abilities say `fire` / `nature`; monster profiles say `ember` / `poison`, so `elementPermille` never matches and the sewer's lesson (fire resisted, frost the answer, poison nothing) does not exist in the engine yet. The one resist table (contract §1.5) also has no resist number. The tutorial's last card states the lesson the data holds.
5. **A crossbow basic shot spends no bolt** in the core (only abilities do): about 700 bolts/h against the sim's 1,600 under the per-shot ruling (Tyler). Owed by the ammo seam.
6. **The start kit has no hunt role.** `bronze_sword` is weaponType `sword`; `hunt-roles.js WEAPON_ROLES` has no `sword`, so a fresh character cannot be a hunt hero and tutorial step 1 cannot run in the world engine. **Ruling:** `sword` plays `tank` until a starter shield exists (a lone hero leads and holds anyway). Owner: hunt-roles.js (systems).
7. **Tutorial done-kinds:** `enter`, `kills`, `level`, `unlock`, `ended` read the live C2 envelope; `pull` needs the world settle (S1 `hunt_instances.world`).

**Catalogue regen S1 must run (supabase/** is S1's):** `node tools/gen-hunts.mjs` (hr_hunts row `millrace_sewer`), `node tools/gen-hunt-sessions.mjs` (kill bounds for the six monsters, the travel row, the new bag guide, the store shot `plain_iron_bolts`), the item/activity catalogue `node tools/catalogue-rows.mjs` (hr_items `crown_shard`, `iron_bolts`; hr_monsters x6; activities `fletch_iron_bolts`, `offer_crown_shard`), and a restated `hunterAll` CASE arm (`MONSTER_TOTAL` 113 -> 119). Until then these stay red: `hunts-c1` G1, `hunt-sessions-settle` VALUE, `collection-renown-claim-drift` (SQL arm), `vendor-sell-many` V4 (`unknown_item iron_bolts`).
## 2026-10-18 · SYSTEMS (lane: `lane/party-ui`) → S1 server lane + HUNT HUD + SECURITY (reopen review) + COORDINATOR · **PARTY UI: what the strip, the Party window and the alerts need from the server**

Built against S1's real `party` section (`2026-10-23-hunt-party.sql` `hr_hunt_party_view` on `lane/s1-hunt-server`) and its five verbs (create / join / leave / kick by seat / finder). Everything else below is built against `tests/fixtures/party-envelope.json`; until it lands each control **fails safe** (a refusal shown in words, never a client fallback). Readers: `src/session/party-sections.js`; intents: `src/session/character-session.js`; RPC list: `tests/client-intent-surface.mjs`.

1. **SHAPE CONFLICT (S1 vs the hunt HUD) — player-visible once S1 lands.** S1 projects `party: { id, hunt, max, leader: seat, me: seat, seats: [{ seat, weapon, role, name, hunting, hp, max_hp, dealt, healed }] }`; the HUD's `partyOf` (`src/session/hunt-sections.js`, fixture `hunt-envelope.json`) reads `members: [{ unit, level, mana, mana_max, stamina_ms, dps, hps, down, eating, drinking, aggro, hp_max }]`, `self`, `leader` as a UNIT id. Against the real server the in-hunt Party panel reads "Not in a hunt." and the combat log cannot name peers. **Need (S1):** each hunting seat also carries `unit` (its instance unit id), `level`, `mana`, `mana_max`, `stamina_ms`, `dps`, `hps`, `down`/`eating`/`drinking`/`aggro`; then ONE reader reads `seats` (the HUD lane switches `partyOf` in the same change; the party-ui lane already reads `seats`).
2. **Display names are per ACCOUNT, not per character.** `hr_hunt_party_view` / `_finder` take `profiles.display_name` by `user_id`, so two characters of one account show the same name in a party. **Need (S1):** the character's own name (the envelope's `name`).
3. **Section `account: { max_concurrent }`** in every envelope (hr_load included) — the account's concurrent-play limit as a server config value (Tyler 10-17: 4, free). `AccountSession.limit()` reads it and, until it is stated, allows ONE character (CLAUDE.md §6: a client number never unlocks a second connection; `SESSION_CONFIG.maxConcurrentCharacters` stays as the tab's connection ceiling only). **Until S1 projects it, a second character cannot open on live** — ship this lane after the section, or with it. The 4-per-hashed-IP cap stays server-side.
4. **Invites (missing verbs):** `hr_hunt_party_invite(p_slot, p_name text, p_idem)` — the server resolves a character by its display name (no user id from the client; `no_such_name`), invites only from a member with a free seat; `hr_hunt_party_accept(p_slot, p_invite uuid, p_idem)` (= join under the invite) and `hr_hunt_party_decline(p_slot, p_invite, p_idem)`; section `party_invites: [{ id, party, hunt, from }]` on the invitee. Expire with the party. Rate-gated (`party`). A player's own other characters need no invite: the Party window's "Bring" sends that character's own `hr_hunt_party_join`.
5. **Shared start (missing verb):** `hr_hunt_party_start(p_slot, p_idem)` — the leader only (`not_leader`); enters EVERY member on the party's hunt with that member's own saved setup (active preset, restock targets as the bag, its falls/hours settings), in one transaction or not at all; refuses `not_ready` naming the seats that cannot (no stamina, a hunt open, an activity running). First principle: nobody re-enters a setup they already made.
6. **Hunt again (missing verb):** `hr_hunt_restart(p_slot, p_session uuid, p_idem)` — the "Start again" button on a hunt-ended alert: re-enters the hunt that session ran with that session's own preset, falls, hours and bag; refuses if the session is not this character's latest ended one. A party member restarts as the party (`party_hunt`).
7. **Residue:** `alerts` added to `RESIDUE_FIELDS` — `{ off: [kind], seen: [event id ≤ 64] }`, display only: which alert kinds show and which events were already shown (so a reload never repeats one). Gates and spends nothing.
8. **Copy (Game Designer):** the alert lines and the Party window's words are Systems' drafts; `LOW_SUPPLY_PCT` (20%) in `src/data/alerts.js` is ASSUMED — rule on it once the Sewer's burn rates are measured.
9. **Security (reopen review):** the new verbs in 4–6 enter hunts and seat characters on other players' parties; none moves value by itself, but `hr_hunt_party_start` spends every member's supplies on the leader's press — review that the leader cannot start a member who has not joined, and that the per-member bag is the member's own saved one.

## 2026-10-18 · SYSTEMS (lane: `lane/alpha-windows`) → BACKEND (server lane) + GAME DESIGNER + SECURITY (reopen review) + COORDINATOR · **ALPHA WINDOWS: the server shapes the Bag, Shop and Hunt prep are built against**

The client (Bag, Gear, Skills, Shop, Hunt prep, Find) uses what hr_state_of projects today (`inventory`, `equipment`, `skills`, `state.gold`) and the engine's existing verbs (`equip`, `vendor_sell_many`, `shop_buy`, `eat`). Everything below is built against `tests/fixtures/alpha-envelope.json`; until it lands each control **fails safe** (off, with a line saying so), never a client fallback. Readers: `src/session/item-sections.js`; intents: `src/session/character-session.js`.

1. **Section `bag_rules`** (per character): `{ locked: [item_id], loot: { item_id: 'keep'|'sell'|'ignore' }, restock: { item_id: 1..1000 } }`. Table suggestion: `player_item_rules(user_id, slot, item_id, locked bool, loot_rule text check (keep|sell|ignore), restock int check 0..1000)`, RLS self-only, no client write policy.
2. **RPCs** (each `{ok}` / `{ok:false, error}`, idempotent on `p_idem`, journalled):
   - `hr_item_lock(p_slot int, p_item text, p_locked bool, p_idem uuid)`.
   - `hr_loot_rule_set(p_slot, p_item, p_rule text, p_idem)`; **the hunt settle applies it on pickup**: `sell` credits the vendor bid instead of the item (same `vendorPriceOf`, same day budget as `vendor_sell`), `ignore` leaves it, `keep` (default) bags it.
   - `hr_restock_set(p_slot, p_targets jsonb {item: 0..1000}, p_idem)` (0 deletes; ≤ 32 rows; only items a supply offer sells).
   - `hr_shop_refill(p_slot, p_quote_total int, p_idem)` — **the one-tap refill (Tyler 10-18, never automatic)**: buys `max(0, target − have)` of each target at the server's offer price in ONE `hr_apply`; refuses `quote_changed` when its own total ≠ `p_quote_total`, `insufficient_gold` under the lock. **Money surface → in the reopen Security review.**
   - `hr_hunt_preset_save(p_slot, p_preset 0..7, p_name text ≤ 24, p_idem)` — snapshots, server-side, the active action set index, `player_equipment` and the restock targets. `hr_hunt_preset_apply(p_slot, p_preset, p_idem)` — wears the gear from the bag (the equip verb's collect-first rule applies), switches the set and the targets; refuses by name what it cannot do.
   - `hr_account_items(p_query text 2..40) → {ok, rows:[{slot, name, item, qty, where: 'bag'|'bank'|'worn'}]}` — a read over the caller's own characters, matching catalogue names server-side.
3. **Section `shop`**: `{ offers: [{offer, item, kind: 'food'|'drink'|'ammo', price}], bids: { item: gold each, for every bag item }, refill: { lines: [{item, offer, have, target, buy, gold}], total } | null }`. **Catalogue gap (Designer + Backend):** `shop_buy` sells no food or drink today (SHOP_OFFERS has `seed.*`/`equip.*` only); supply offers (`supply.<item>`, the basic supplies' prices) must become catalogue rows so `shop_buy` accepts them.
4. **`hunt.loot`**: `[{item, count}]`, this session's pickups, for EVERY character (the analyzer's loot list is premium-only; the bag's "This hunt" tab falls back to it).
5. **Section `hunt_presets`**: `[{preset, name, action_set, gear: {slot: item}, restock: {item: n}}]`.
6. **Section `role`**: `{id, weapon}` — the hunt role the worn weapon gives. **Data conflict (Game Designer):** `items.js` weaponType is `sword|hammer|ranged|magic` while `hunt-roles.js` WEAPON_ROLES keys are `shield|dual_axe|club|bow|crossbow|staff`, and no item has the `shield` slot, so no catalogue weapon maps to a role. The Gear window shows the server's `role`, else the party row's, else says the server has not named one.
7. **Server must enforce locks:** `vendor_sell` / `vendor_sell_many` refuse a locked item (`item_locked`). The client never names one (tests/alpha-windows.mjs AW-5), but the client is not the authority.
8. **Guard change (Coordinator/Security FYI):** `tests/client-intent-surface.mjs` IS-2 now also allows the ONE `accrue(body)` in `CharacterSession.edgeIntent`, whose body `src/session/edge-intents.js` builds; new IS-5 pins its table to 4 verbs with names/counts only (no price/gold/total field), and refuses an unpinned or unused verb. Selftest: 13/13 cases, 5 new.
9. **Copy (Game Designer):** `src/data/skill-guide.js` (what each skill is for / where trained) is Systems' plain-words draft; rule on the wording.
10. **Residue:** `bagSeen` (the "new" marks) and `bagView` (category + sort) added to `RESIDUE_FIELDS`; display only, gate and spend nothing.

## 2026-10-14 · SYSTEMS (lane: `lane/demo-shell`, D1) → C2 (net/accrue) + D2 (data) + COORDINATOR · **INTEGRATION: the inventory-authority arm gate asks for the deleted dungeon registry**

**The conflict.** D1 deleted `src/dungeons.js`, the only publisher of `window.DUNGEONS`. `src/net/accrue.js` (C2's file) refuses to arm inventory authority without it — `markInventoryAuthorityLive` throws and `maybeAutoArm` returns false (accrue.js ~2336/2439/2639) — so the production auto-arm would silently stop making the bag absolute (BANK-1, SERVER-OWNED-1/2, INV-STAGE-*, B568-3..6 went red in-page).

**Also (§6, transient): the Fight screen's drop multiplier no longer counts Bestiary charms.** D1 deleted the client charm mirror (render/bestiary-charms.js) and core-bridge passes `charms: null`, while the engine (`hr-accrue/accrual.js`, C2) still pays the charm drop bonus: `tests/trophy-call-sites.mjs` C1/C2 read 1.1845 vs 1.2200 for the same stage-4 kill. **C2:** drop the charm layer from `weaknessInfo`'s engine callers in the same set, and the guard is green again.

**Interim (D1, `src/main.js`).** `window.DUNGEONS = Object.freeze({})`: with no dungeons there is no dungeon loot and no overlap id, so the empty table is the complete answer the gate asks for, and the absolute bag keeps arming. b214 asserts it stays empty. **C2:** delete the DUNGEONS clause from the arm gate and `rebuildItemAuthority({dungeons})`, and remove the main.js line in the same commit. **D2:** `item-authority.js` still classifies through `dungeonRewardIds`; `bone_key` (ruling §2: strip from drops) and `oak_rod` are granted but unclassified (SERVER-OWNED-4), and ~30 gear items kept their rows with no recipe (b243/b247/LUCKY-7/WAVE4 `gold_ring`).

## 2026-10-17 · SYSTEMS (lane: `lane/h4-consumables`) → S1 server lane + H1/H2/H3/H5 + GAME DESIGNER + COORDINATOR · **H4: the C2 action bar cannot be deleted from a core lane**

1. **`runActionBar` / `pickHeal` / `spendFromBag` NOT deleted (spec §1.1 one-path table).** They are live C2 server semantics, not just engine code: `hr_hunt_slots_check` (slot conditions), `hr_hunt_use` (presses), `hr_hunt_apply` §5b (`not_on_bar`, `kind_not_sold` for drinks, the buy caps from `hr_hunt_lanes` consumable = 2000 ms) and S1-owned `tests/hunt-sessions-settle.mjs`, whose ~20 mutants pin their exact text (and whose DB arms expect a Feast fired by a slot rule). Deleting them in H4 turns S1's guard red. **Route:** S1 retires them in ONE lane C change — slots-as-rules, presses, buff feasts on the bar, `not_on_bar` vs the per-hero supply setting, drink buys, the lane ms — and switches the single-foe swing to `src/core/hunt/consumables.js` (or H2 deletes the single-foe swing first). The pieces are ready: `resolveLine`/`takeLine`/`lineAmount` in `src/core/action-rules.js` are the one resolver (own first, then store under `storeAllowed` + a bar line that shows the price), and both new modules spend only through it.
2. **Lane ms, two sources.** `src/data/consumables.js` `laneMs` 1000 (spec §3.4 #3) vs `rule-subjects.js COOLDOWN_LANES.consumable` 2000 (C2, generated into `hr_hunt_lanes`, the server's buy cap). H2 (owner of rule-subjects) makes COOLDOWN_LANES read the data files' lane ms; S1 regenerates the catalogue. Until then a world hero can use two consumables per 2 s window, which the live cap refuses.
3. **World path persistence.** Over-time halves, the lane, cooldowns and mana are world-unit fields (`PERSISTED` in consumables.js / abilities.js); they survive a settle only once S1 lands `hunt_instances.world`. The settle must inject `swingCtx.heroes[unitId] = { hs, bar, actionSet, range, ammo, foodBelowPct, drinkBelowPct }` (one line added to H1's `world-step.js` passes it to `inst.heroes`).
4. **Seams to H2/H3/H5.** abilities.js calls `damage.hurt(inst, t, amount, source, element, abilityId)` and `status.applyStatus(inst, t, { id: 'bleed' }, source, sc)`; sets `markBy`/`markUntil`, `vulnUntil`, `shield` for damage.js to read; `payBasic(inst, hero, { mana, ammo }, sc)` is the basic attack's cost for H2. Each `cast` event carries `mana` + `magicXpMult` (permille) for H5's Magic XP; `eat`/`drink`/`cast` carry `source` own/store + `gold` for the tally (§3.8; h35 wiring contract).
5. **Ham and Moonbloom tea NOT added (designer, §10 purpose test).** The sim's two placeholders map onto ladders that already exist: own food = the 19 cooked heal lines in `supplies.js`, own drink = the 6 staged drinks in `drinks.js`; `src/data/consumables.js` derives its rows from them instead of a second copy. A new ham item needs a source (recipe) and items.js — neither is H4's file. The staged drinks join ITEMS / recipes / SUPPLY_ROWS in the items owner's one commit (drinks.js header) now that a mana-drinking engine exists.

## 2026-10-17 · SYSTEMS (review of `lane/w1-hunt-spec`) → GAME DESIGNER + S1 server lane · **HUNT SPEC vs C2: three data rulings that change live C2 semantics**

1. **ON_EMPTY default.** Tyler 10-16 ("a hunt never stops for lack of stock") supersedes the 10-14/10-15 "store is never used silently" text in `src/data/hunt-sessions.js:45-55`. Resolution: data only, `ON_EMPTY.default = 'switch'` (C2's `mine`+`switch` IS own-first-then-store), regenerated in a NEW dated catalogue file; `end` stays as an explicit opt-in, so `heals_out`/`ammo_out` stay in END_ORDER. `gold_out` unchanged. Owner: S1.
2. **Stamina cap.** C2 has one `STAMINA_MAX_MS` = 12 h for everyone; Tyler 10-17 makes it free 8 h / premium 12 h per character. Resolution: `{free, premium}` in `hunt-sessions.js` (one source, not `premium.js`), two limit rows, `hr_stamina_of` reads `premium_until`; a lapse keeps banked stamina and only stops resting above 8 h. Owner: S1.
3. **Stances.** `src/core/hunt.js` STANCES + `assertNoStanceMultiplier` forbid a stance multiplier; the spec's Offensive/Balanced/Defensive deal/take multipliers need one. Resolution: the old stance table and the Vigour exports are retired with the envelope keys `hunt_stance`/`hunt_stop`/`vigour` (S1 owns the deletion and its importers); the new stance rows live in `rule-subjects.js` and only `damage.js` applies them (H2). The stance numbers stay ASSUMED for the designer.

## 2026-10-14 · SYSTEMS (lane: `lane/a-record-claims-hold`) → SECURITY (FYI, client authority accessor) · **RULE: an answer that does not mention a record field keeps its last server claim**

**The rule.** `src/net/record.js applyRecord` no longer rebuilds `known`/`stamp` from each fresh answer alone. A field the answer does not mention (value absent/null — pushed frames carry no `equipment`/`progress`; intent envelopes carry no `progress`) KEEPS its last server claim: the carried stamp is the fingerprint of what the SERVER sent, never a re-stamp of `G`. Only a restatement replaces a claim; an unreadable restatement drops it (fail-closed); a disarmed field, an answer naming another slot, and `forgetServerOfRecord` (reload / sign-out / slot change) carry nothing. Per-field `statedAt` lets an older answer that is still newer than a held claim fill it (b422's gap rule), and never rewinds a field a newer answer stated.

**Why a stale-but-server-stated value cannot be spent.** (1) It is still the server's own last statement for this character, and `recordValue` still checks the stamp, so any client write to `G[f]` reads `client-overwrote` → fail-closed (RECORD-HOLD-4: a forged weapon stays unvouched across two frames; a never-stated field never becomes a claim). (2) Gates READ it; they never author with it — every equip / build / buy / cook is an intent that `hr_apply`/`hr-accrue` re-validates against `player_equipment` / `player_progress` / `player_state` under the character lock, so the worst case is a refused intent whose envelope restates the field. Before this, the same window read fail-closed (frozen empty worn set → the live tick fought naked; every room rung 0 → the House offered builds the player already owned).

## 2026-10-14 · BACKEND (lane: `lane/c1-hunt-sessions-db`) → SECURITY + C2 + B1/R1 + GAME DESIGNER · **HUNT SESSIONS DB: the seed choice, and what C2 must do**

**Seed (for Security).** The ruling's §4 text says `hr_seed(user, slot, 'hunt:'||session_id||':'||swing_index)` per swing. The engine lane chose, and C1 keeps: ONE secret seed per session, `hr_seed(user, slot, 'hunt:' || session_id)`, fetched once per settle by the settler, mixed per swing in `src/core/action-rules.js huntSwingSeed` with the label `'hunt:<session>:<swing_index>'`. Same unpredictability (the secret is in the session seed; the client never sees it and cannot call `hr_seed`), same split-independence (the swing index is mixed in, never the window), ~1,500 fewer round trips per character-hour. No column stores the seed. Security to confirm.

**Security GO-WITH-CHANGES on e482cc54, landed:** `hr_hunt_config` is seeded `enabled = false` (no hunt opens between the C1 apply and C2, so the old accrue/tick path and C2's first settle cannot both pay one window), and every refusal in `hr_hunt_settle_session` RAISES `hr_reject(code)` (SQLSTATE HR000) so an `hr_apply` earlier in the same transaction rolls back with it; the applier is SECURITY DEFINER with a pinned search_path. Item 3 (per-swing seed strength) is C2's.

**C2 must:** (0) flip `hr_hunt_config.enabled` to true in its own reviewed file, at deploy; (1) set `hr.hunt_session` to the session id before `hr_apply` so its ledger rows are stamped (the trigger stamps only the row's own character), then call `hr_hunt_settle_session(user, slot, session, delta)` in the SAME transaction (a refusal is an HR000 exception, never `{ok:false}`; catch it outside the savepoint that holds `hr_apply`), and grant it to `hr_engine` (an `hr_assert_grant_hygiene` engine-allowlist edit); (2) stop the old accrue / tick combat path from paying a character with an open session (C1 points `player_state` at `combat:<hunt>` and a guard trigger refuses any other pointer move while it is open — `hr_reject('hunt_open')`); (3) settle on `hr_hunt_leave` / `hr_hunt_change` / `hr_hunt_use` when they answer `pending` / `settle_first` (mid-hunt verbs need the settle within 20 s; leave/change close at once past 15 min of stall, forfeiting the unsettled window); (4) presses are stored as `{slot, at}` — the engine must not fire one before its `at`; (5) then place `2026-10-22-hunt-sessions-drop-away.sql` in `order` after its own files: it refuses while any body still reads the away objects.

**B1/R1.** The drop file's `hr_vigour_of` no longer returns `dry_mult` (no Vigour tail). Action-bar values out of range are REFUSED (`bad_slots` + `why`), never clamped, as `src/data/rule-subjects.js` says (the lane brief said "clamped"). Bag lines' `essential` is set at pack/restock only; there is no mid-hunt toggle in v1.

**Game Designer.** `VIGOUR_LOW_MIN = 144` in `src/data/hunt-sessions.js` is a TBD-designer placeholder (20% of the 720-min grant). `SESSIONS_KEPT = 20` restates the ruling's "last 20 sessions" as a data row.

## 2026-10-11 · BACKEND (lane: `lane/c-account-wallet`) → COORDINATOR + b567 discord-join + w0c login + SECURITY · **INTEGRATION: two staged gem grants write a column the wallet drops**

**The change.** `supabase/migrations/2026-10-19-account-wallet.sql` (staged) moves gems + Hearth Tokens to `public.account_wallet` (one per account; Game Designer ruling 2026-10-11) and DROPS `player_state.gems` / `hearth_tokens`. Every gem credit goes through `hr_wallet_credit(uid, slot, gems, grant_key, expires_at)` — once per account per key, account-wide day cap, one `kind='wallet'` ledger row.

**The conflict.** Neither interlock merges cleanly into `origin/main` (git conflicts, not hand-resolved): `lane/b567-discord-join` conflicts in 8 files (incl. `2026-08-11-catalogue.generated.sql`, `schema-apply-order.json`, `restore-census.baseline.json`); `lane/w0c-daily-and-login` in 10 (incl. `schema-drift.baseline.json`, `schema-apply-order.json`, smoke files). Semantically, once the wallet is applied: `2026-10-18-discord-gift.sql` credits `player_state.gems` and its §8 inserts that column → it FAILS TO APPLY; `2026-10-16-login-reward.sql`'s `hr_login_bonus_ready` reads `gems_in` per `(user, slot)` → it must read the account (`kind='wallet'` rows, any slot), and its hr_apply anchor (`progress_claim`) is untouched by the wallet's five edits.

**Order.** Wallet first (it is the last file on main), then each lane merges main into itself and converts: discord → `hr_wallet_credit(v_uid, p_slot, c_gift_gems, 'discord_gift', null)` (the once-row stays; the key makes it structural); login → gems via the engine already pass through the wallet under `apply:<journal.intent>`.

**Also found (not fixed — owners: Game Designer + Systems).** `world_event_absence_claim__ungated` returns `gems: 1` for an absent pledge, but no server body credits that gem (verified by a census of every function naming gems, replay and production); under the armed record the client does not credit it either, so the receipt promises a gem that never lands (§6 class). Its gold (750) is said to be owned by "the gold arm" — not traced here.

**F1 (Security GO-WITH-CHANGES on 59c3852e) — BLOCKED, not authored, 2026-10-11.** On `origin/main`, `world_event_pledges.slot` is the rally **window** (1 | 13), not a hero (2026-08-09-rally-v2.sql). Crediting the absence gold to `v_p.slot` as specified would pay hero 1 for a window-1 pledge and nobody for window 13 (main's chest items already land on that wrong slot — a live bug). The correct target is `world_event_pledges.char_slot` (muster rev.2), which exists only on `lane/b567-quest-xp-absence-pay` (via b567-muster-xp-server). That lane already credits the absence gold + gems to `char_slot` and budget-checks them — but into `player_state.gems`, and it conflicts with `origin/main` in 9 files (it carries w0a), so it cannot be merged into the wallet lane without hand-resolving another lane's SQL. **Route:** b567 merges main + `lane/c-account-wallet`, applies AFTER the wallet, and changes exactly: gems via `hr_wallet_credit(auth.uid(), v_cs, v_gems_out, 'world_event_absence:' || v_day_key, now() + interval '3 days')`, the response/journal echo `gems_paid`, no `gems_in` on its own row (the wallet row carries it), its §8 fixtures without `player_state.gems`; plus the attended test Security asked for (wallet and gold actually move).

## 2026-09-28 · SYSTEMS (lane: `lane/blessings-promise-honesty`) → GAME DESIGNER + COORDINATOR · **HONESTY: Blessings promised speed, yield, gold find and XP the realm never pays — WITHDRAWN**

**The claim.** Home ("The realm"), the Events blessing card, the login toast and the note beside the running activity printed each day's and week's blessing as a magnitude — "+4% gather speed", "+2 farm yield", "+3% gold find", "+4% all XP", "−25% burn chance" — "while online". `src/features/world-events.js` backed it by wrapping `window.getBonus` with a blessing layer, so the browser predicted rates and yields from it.

**The server truth.** `bonusFor` in `supabase/functions/hr-accrue/accrual.js` sums three layers — rooms/perks (fused), the equipped companion, the buff queue — and has NO blessing layer; no migration or RPC reads a world event. The engine pays a blessed player exactly what it pays an unblessed one. §6: the browser said one thing and the server another.

**Withdrawn.** The getBonus layer, every pool `bonus` table, `bonusFor`/`liveBonusFor`/`summaryFor`/`KEY_LABEL`, the power budget's blessing part, the activity-note effect, and the sentences "blessings … pay while you play" (Home away card, activity-bar tooltip). The pools keep their ids, names, order and glyphs (the day's pick is unchanged); each `desc` now says what the day is FOR in the realm's words, no number. The card still says a blessing is active while online.

**→ Game Designer.** If blessings should pay again, it is a lane-C engine layer (`AWAY_SCOPE.blessing` already exists and is `false`), a Security GO, then copy that quotes the server's number — never a client magnitude first. `tests/blessing-promise-honesty.mjs` is RED on any blessing magnitude, getBonus layer, calendar-amount reader or "blessing pays/speeds/yields" sentence in shipped client code until then.

## 2026-09-14 · SYSTEMS (lane: gem-unlock + recipe-learn client half) → COORDINATOR · **TWO LANES ARE WRITING `src/features/gem-unlocks.js`**

Branch `lane/b547-gem-recipe-client` (worktree `agent-aade13cac01003e53`) created `src/features/gem-unlocks.js` and `src/features/recipe-scrolls.js` as ESM side-effect modules imported by `src/main.js`, publishing `ownsGemUnlock` / `gemUnlocksKnown` / `activeHouseTheme` / `buyGemUnlock` and `unlockedRecipesMap` / `knowsRecipe` / `readRecipeScroll` on `window`.

A SECOND lane (`agent-afc3a91d534c61393`) is extracting the SAME file with a DIFFERENT shape — a classic-script IIFE relying on the global lookup, and a different API: `gemUnlockIsFree()` and `noteGemUnlockOptimistic()` (an OPTIMISTIC local grant of an unlock). Both cannot land.

**Two real disagreements, not just a file collision.**
1. **Optimistic ownership.** `noteGemUnlockOptimistic` writes the bought id into `G._gemUnlocks` before the realm answers. This lane deliberately does NOT: ownership is adopted only from `gem_unlocks` on the verdict or the next envelope, because a locally-granted entitlement that a refusal never retracts is the b371 sticking half in a new store (the scratch key rather than the residue bag). If instant feedback is wanted, it belongs in a render-only flag the purchase path cannot read.
2. **`gemUnlockIsFree()` as a fallback for ownership.** Deciding "free ⇒ owned" from the CLIENT's `HOUSE_THEMES` literal re-derives an entitlement the realm already states: `hr_gem_unlocks_of` unions `where g.free`, so `theme:default` is in EVERY projection. A client-side free-list is a second answer to the one question, and it answers before the first envelope in a direction ("owned") this lane deliberately refuses.

**Recommendation:** take one lane's file whole; do not merge the two by hand (§3.3). This lane's is green by exit code: `tools/lane-done.mjs` all green, suite 1293/1306 / 0 failed, `no-client-copy-of-projection` exit 0 with the OWED pin 3 -> 1 and the three raw-read pins at zero, and six planted defects turn its arms red.

## 2026-09-13 · SYSTEMS (lane: Bestiary Charms phase 1) → ART DIRECTOR + GAME DESIGNER

**Art Director.** The Bestiary modal (`src/render/bestiary.js`) grew a charm strip above the roster and an element line inside each discovered row, with a new `.charm-*` block in `src/styles/legacy.css`. Atlas glyphs only (`uiMedal` / `uiTarget` / `uiSpark`) and tokens only — the four rank tints are `color-mix(in srgb, var(--gold-2) N%, transparent)`, no colour literal was added (`css-literal-ratchet` exit 0), no emoji. Measured at 1440×900 and 852×393: no horizontal spill, chips wrap to two columns, zero console errors. If the strip wants a different home (its own header, or folded into the row) that is the Art Director's call — the markup is one function, `paintCharmStrip`.

**Game Designer.** Two notes in `src/data/item-effects.js` were corrected, NEITHER flipped. `reveal_hidden_weak` STAYS `live:false`: both of its stated dependencies now exist (the element axis shipped with Elements v1; the bestiary reveal shipped here), but the KIND means the *item* half — jewelry that reveals without the kills — and its only carrier `unlit_earrings` has no recipe, no drop and no shop offer, so flipping it would correctly turn the reachability guard RED. `bestiary_rate` stays false as phase 2. The one player-facing information change: a class at rank ≥1 now prints its ELEMENT weakness in the Bestiary. The WEAPON weakness was already public (fight screen, monster cards, bounty notice); the element axis was printed NOWHERE before this (grepped). That reveal is the 2026-09-13 ruling, restated here so it lives on the record and not only in a lane brief.

**Not a conflict, but a near-miss worth writing down.** `src/core/charms.js` folds kills into classes through `classOfMonster` and never reads `monster.cls`. `normalizeClass('extradimensional')` — the spelling every roster row and `MONSTER_CLASS_ORDER` use — returns **null**; the right answer only arrives because `classOfMonster` falls back to `family: 'Extra Dimensional'` with the space. Verified over the whole roster (108/108 resolve, 6 to `extra_dimensional`). Anyone who "simplifies" a class fold to the `cls` field silently loses Extra Dimensional — the one class whose hidden weakness this feature exists to reveal.

## 2026-09-12 · SYSTEMS (lane: Depot client half) → the INVENTORY-RENDERER lane · **b327 is RED on `next`**

```
✗ b327: the bag survives a 423px-tall viewport — paione bug #24 (922x423 Android landscape)
      the bag must own MORE than half the panel; chrome had 55%
```

Reproduced in `agent-a50e80b5a0c025fcb` after merging `origin/next` (7b45f2f8). **Proved it is not
mine**: re-ran `--only "b327"` with the Depot toolbar button deleted from `renderInvFancy` — still
red, same number. The inventory chrome grew in the renderer-deletion lane; that lane owns the fix.
(b521 below is the same situation for the prayer-ladder lane and is already logged.)

**A naming trap this lane had to navigate, for whoever touches the bank next.** `bankCap()` /
`bankUsed()` / `G._bankCap` / `player_state.bank_cap` are the **BAG's** stack ceiling, not the
Depot's — they are what `hr_bank_move` checks on a WITHDRAW (`bag_full`). The Depot's own ceiling is
`c_max_bank_stacks = 1000` in `2026-08-27-bank-store.sql`, a server constant that `hr_state_of` does
**not** project. The panel prints the bag cap from the mirror, prints the Depot's stacks stored, and
shows a Depot ceiling only after the server names one in a `bank_full` refusal. "Fixing" the panel to
print `/ 1000` would put a client-held number in front of a server capability (§6 residue-ahead).

## 2026-09-12 · SYSTEMS (lane: sell-lock + loot filter) → the PRAYER-LADDER lane · **b521 is RED on `next`**

```
✗ b521: Bury starts the SERVER-SETTLED altar bench — no client XP, no client debit
      the refusal must say why, got: "Need Lv 40 prayer"
```

Reproduced in `worktree-agent-a327111f17afbc40c` immediately after merging `origin/next`
(`node tests/run-smoke.mjs --only "lock"` → **302/303**, and it is green without the merge).
The ladder moved `bury_bone_chips` to req 40, so the bench's refusal sentence changed and
b521's assertion on that sentence no longer matches. My commit touches no prayer / recipe /
bury file. §4: a red in-page test is a P1 and the GitHub `smoke` job fails on ANY ✗, so this
has to be fixed at its source before the cut — not carried.

## 2026-09-12 · SYSTEMS → whoever owns the BOUNTY BOARD · **`window.BOUNTY_BOARD_TIER_BY_LEVEL` is a COPY of the core value** (found in `lane/b544-prayer-ladder-item-gates`, NOT fixed there)

Not a git conflict — a defect found while paying down the test-file ratchet, in a lane that had
no business fixing it.

**What.** The "Phase 0: the balance constants are ONE object" test pins core exports by IDENTITY
from a hand-written LIST. Deriving that list from `Object.keys(HearthriseCore.bounty)` instead —
which is strictly what the test claims to check — turns it RED on one row:

    window.BOUNTY_BOARD_TIER_BY_LEVEL is a COPY of the core value, not the core value

Every other `C.bounty.*` export shares identity with its `window.*` twin. This one does not, which
is the data double-copy class CLAUDE.md §7 exists to stop: a retune in `src/core` would not reach
the board, silently.

**Why it was not fixed here.** This lane is Prayer rows + item gates. Widening the pin would have
put an unrelated red in the in-page suite, and a red in-page test is a P1 that blocks every later
build's CI gate. The list therefore STAYS a list, with the finding written above it in
`src/features/smoke-test.js` so the next reader cannot mistake it for laziness.

**What is needed.** Publish the core object rather than a copy (one line, wherever
`BOUNTY_BOARD_TIER_BY_LEVEL` reaches `window`), then replace the list with the derivation so the
pin covers every future export the day it is added. Exit-code proof: with the derivation in place
`node tests/run-smoke.mjs --only "COPY of the core"` reports 1/2 and names the row.

---

## 2026-09-12 · SYSTEMS → GAME DESIGNER + ART DIRECTOR · **SEMANTIC: the Manual and Scavenger dungeon buttons now REST** (`lane/b540-dungeon-cooldown-client`)

Not a git conflict — a change of MODEL on a surface two other roles reason about.

**What changed semantically.** The dungeon card used to say, in code and in a comment, "Manual runs
ignore the auto-run cooldown". With the server lane applied that is false: `hr_dungeon_cooldown_modes()`
is `{auto:1, manual:1, scavenger:4}` — nothing is exempt — so the Manual/Scavenger button is now gated
on ITS OWN window (a quarter of the dungeon's for scavenger, the full one for a phase run). A player who
could previously grind a scavenger run back-to-back forever now waits 1h on the Crypt.

**The Designer's to confirm or narrow.** The divisor table is the server's and is one line to retune
(`2026-09-12-dungeon-cooldown.sql` §2). The client only READS it — I authored no number. What is the
Designer's is whether a quarter window is the right price for a mini-game whose loot is mostly TRADEABLE.

**The Art Director's.** A card can now render TWO disabled run buttons ("On cooldown — 4.0h remaining"
plus "Scavenger · 1.0h remaining") where it used to render one. The manual label deliberately REPLACES
the "On cooldown — " prefix rather than adding to it, so neither button is wider than the one that
already ships, and a non-cooldown refusal (level, key) is still printed once. Not verified visually by
me — the headless gate is the Coordinator's.

**My brief and the staged migration DISAGREED, and the migration won.** The brief described a FLAT
`dungeon_cooldowns = {id: ISO}` and "scavenger gets cooldown_s/4"; `96b60287` projects NESTED
`{id: {mode: ISO}}` and refuses `bad_mode` off a new `hr_dungeons.scavenger_ok` catalogue column. I read
the SQL and built to the SQL. If the server lane changes shape again, `reconcileDungeonCooldowns` in
`src/net/accrue.js` is the ONE place the shape is parsed.

**Not blocking.** Forward-compatible: with no `dungeon_cooldowns` in the envelope every dungeon surface
behaves exactly as it does today (mirror absent → ready).

---

## 2026-09-07 · SYSTEMS → GAME DESIGNER + ART DIRECTOR + COORDINATOR · **SEMANTIC: "Next up" is no longer the only place Home says what to do next** (`worktree-agent-a5ec5d462bc708b2b`)

Not a git conflict — a change of MODEL on a surface two other roles reason about.

**What changed semantically.** Home used to answer "what now?" in exactly one place: "Next up", one
hero row chosen by closeness plus up to three dailies. There are now TWO answers while a first-day
quest is open — a pinned "Your first day" chain above it — and they are explicitly de-duplicated:
when the leading milestone is a row the card (or the daily list) already draws, the hero row is
**suppressed**, and if that empties the section the section is **removed**. Anything that reasoned
about Home as "milestone + dailies" is now wrong for a day-one account.

**Why it needs the designer's eye, not just mine.** The launchpad ruling ("an open chain quest beats
a zero-progress skill milestone") and the card together mean a brand-new player is **never** shown a
skill milestone on Home while the chain is open — the ruling makes the chain quest win, and the card
then suppresses it as a duplicate. That is a stronger outcome than the ruling asked for and I believe
it is the right one (day one is the chain), but it is a design consequence and it is the designer's
to confirm or narrow. Narrowing it is one line: drop the `inChain` clause and let the hero row repeat
the card's current step.

**Why the Art Director.** The card is a new top-level section on the game's first screen, and at
922×423 I chose a density FLOOR (44px rows, gauge dropped on non-current rows) rather than a phone
rhythm. See HANDOFFS.

**Not blocking.** The lane is green and self-consistent either way; this is a ruling to record, not a
gate to pass.

## 2026-09-07 · SYSTEMS → COORDINATOR · **RESOLVED IN THE MERGE: b519's away-card holder and the restored receipt disagreed, and together they reopened b519's own bug** (`worktree-agent-aa4a6316109da010b` ← `main bdf4429f`)

Not a git conflict — git merged both files clean. A **semantic** one, of exactly the b361 shape the
visual gate exists for: two individually-correct branches, broken by their interaction.

**The two models.** b519 (main) moved the Home "While you were away" card off
`G.lastOfflineSummary` — every 90-second settle overwrites it — onto a module-scope holder in
`accrue.js`, written in `applyEnvelope` when the receipt classifies away. Its header reasons the
holder need not survive a reload because *"on reload the very next envelope re-states the absence
anyway"*. **That premise is precisely what this branch measured false**: once a night has been
paid, the next boot's hr-accrue answers `{accrued:false, reason:'idle'}`, `applyEnvelope` never
runs, and nothing re-states anything. It is why `player_state.last_away_receipt` exists at all.

**What the clean merge produced (measured on the assembled tree, not reasoned):** the restore
seeded `G.lastOfflineSummary` only, the card drew at boot, and the FIRST 90-second sync evicted it
— `card=DRAWS` at boot, `card=NONE` one sync later. b519's bug wearing this feature's clothes, for
the one case the feature exists to serve.

**Resolved here, in my own function, in one line** (`reconcileAwayReceipt`, `src/net/accrue.js`):
the restore also seeds b519's holder, routed through `classifyReceipt` (one classifier — b361's
property, never a local re-decision) and **hole-filling only** (a holder already populated belongs
to an absence THIS session applied, which is the fresher statement). Nothing is credited by either
write. Pinned by `F1b` in the in-page suite, driven through the real path and graded on the
RENDERED band; mutation-proved (delete the line → red on the holder assert, then on "the restored
night was evicted").

**Nothing is left open.** Recorded because a one-line change that reconciles two agents' models
should never land silently, and because the b519 comment's premise is still written in the file
next to my correction — a future reader must find the correction, not just the premise.

## 2026-09-04 · SYSTEMS → ART DIRECTOR (copy/DOM) + COORDINATOR · **SEMANTIC: the front door's success state is no longer a sentence** (`fix/signup-door`)

Not a git conflict — a change of MODEL, on a surface the Art Director owns the presentation of.

**What changed semantically.** "A successful sign-up" used to be a *message* (`ui.say(...)`) on a
form that stayed exactly as it was. It is now a **STAGE**: `buildGate()` has three
(`form` / `sent` / `arriving`), the form's own nodes hide, and a panel with two controls takes
their place. Anything that reasoned about the wall as "one form plus a note" is now wrong —
including any future selector that assumes the first `.hr-gate-go` is the submit button (it was
briefly the "I've confirmed" button; DOM order fixed and pinned by DOOR-3).

**The copy I wrote is provisional and I am flagging it rather than defending it.** It is
player-facing text on the highest-traffic screen in the product, written by the systems engineer
who was fixing the plumbing. It lives in ONE pure place (`src/net/signup-door.js` —
`signupSentCopy`, `arrivalErrorMessage`, `INVITE_REFUSAL`) precisely so it can be rewritten
without touching the wall. Two constraints any rewrite must keep, both guarded:
- it must NOT say "then sign in" or "sign in again" (that sentence IS the measured funnel bug);
- it must NOT promise "you will land back here signed in" — that is only true if config gate 1 in
  `docs/design/signup-door-config-gates.md` is closed, which this client cannot verify.

**One vocabulary, two surfaces — resolved, not left open.** `src/settings-page.js`'s auth modal was
rendering the server's raw prose for a refused invite while the front door rendered a classified
sentence. Both now go through `classifyInviteRefusal()`. If you reword one, you reword both, which
is the point.

**Open question for the Art Director (mine to raise, not to decide):** the wall does not fit
922x423 and did not before this build (CTA bottom y=524 pre-change, 553 post). Reachable by
scrolling. Numbers and reasoning in HANDOFFS today.


## 2026-08-31 · SYSTEMS → SECURITY · **REVIEW HEADER: the auto-eat completion build** (`fix/autoeat-fallback-and-arm`)

Two behaviour changes ship together, both self-only, both under Designer rulings 2 and 2b
(DECISIONS 2026-08-31). This is written FOR the reviewer: what moves, what cannot, and where to
point a mutant.

**⚠ EDGE REDEPLOY REQUIRED, AND FIRST.** Repo payload moves
`c17cd6bd…` → **`00df251e…`** (it passed through `2efae5aa…` before ruling 2c landed on the same
branch; ONE deploy, at ship). The suite's deployed-payload guard is RED until it lands (that is
the guard working). Ordering is not cosmetic: with a NEW client against an OLD edge the two sides
choose *different* foods for the same eat — the exact b499 NULL-food split, pointed the other
way. Deploy the edge first, exactly as b499 did.

**1 · WHAT THE CHOOSER CAN MOVE.** `src/core/auto-eat.js chooseFood` now picks, for an eat with
no nominated food, the cheapest Provision that heals to full (processed before raw, then lowest
`v`, then id) instead of the biggest healer. The ONLY thing it changes is **which item id gets
`-1`** out of the player's own bag.
- It does not change the QUANTITY (always exactly 1, unchanged).
- It does not change the HP: every candidate in the covering set lands the player on `maxHp`, so
  the post-eat value `min(maxHp, hp + heals)` is byte-identical. Proved over a full seeded night,
  not argued: `cheapestSufficientGuard` in `tests/accrual-engine.mjs` runs 12 h twice, pre-ruling
  chooser vs shipped, and asserts identical ticks / kills / crits / death / survivedMs / XP /
  gold / loot / resulting HP while the bag bill drops 4.0x and 47.2x.
- It does not touch gold, XP, drops, market, clan, leaderboard or any cross-player surface.
- **Direction of the value change is DOWNWARD, always**: the server consumes strictly less book
  value out of the player's own inventory. There is no input that makes it consume more.

**2 · WHY A FORGED CLIENT VALUE CANNOT STEER IT.** The server runs the same chooser **on its own
bag, with its own catalogue, against its own columns**:
- the bag is `player_inventory` via `hr_state_of`, mutated only by the engine's own `addItem` /
  `removeItem` during the span;
- `items` (which carries `raw` and `v` — the two fields the new order reads) is a NAMED INPUT to
  `computeAccrual` supplied by `supabase/functions/hr-accrue/catalogue.js`, which imports
  `src/data/items.js` **at pack time**. It is not a request field and cannot be one — `requestGuard`
  and `computeAccrualInputParity` already pin that, and `hostileGuard` proves unnamed request keys
  are inert;
- the only client-expressible auto-eat inputs remain the three `hr_set_auto_eat` columns, which are
  entitlement-gated, clamped, journalled and rate-limited (30/h, rejections billed).
- A forged `raw` or `v` therefore has nowhere to enter. There is no new client input in this build.

**3 · THE ARMED TOGGLE (`SYNC_ENABLED_TOGGLE = true`).** No new RPC, no new column, **no SQL at
all**: `hr_set_auto_eat` already refuses the entitlement gate only *on the way ON*
(2026-08-29-auto-eat-tiers.sql: *"a player must always be able to switch it off"*), so the arm is
a client line reaching an existing, already-reviewed verb.
- The value direction is **strictly downward for the actor**: auto-eat only heals, so disabling it
  can only shorten `survivedMs` and therefore the span that pays. It cannot raise any grant.
- The counterpart is that the food stays in the bag — items the player already owned. Nothing is
  minted and nothing crosses to another player.
- The 0-heal outcome was ALREADY reachable before this build through the threshold dial's 0%,
  which b499 shipped armed. This closes the gap between two equivalent controls; it does not open
  a new one.

**4 · THE RECEIPT'S NEW FIELDS.** `away.diedTo` (a monster id from the server's own catalogue) and
`away.autoEat = {enabled, pct}` (stated by the engine off `eatCfg`, the object `fx.autoEat` was
actually gated on). Both are **response-only**: they are not `delta` keys, so there is no
unknown-delta-key surface (`shapeGuard` green), nothing reads them back into a grant, and they
carry no other player's data. On the client they are **self-configuring**: absent → the receipt
says nothing, never a guess.

**6 · THE ZERO-DEFICIT REFUSAL (ruling 2c, E2).** `resolveAutoEat` refuses when `maxHp - hp <= 0`.
It can only ever REMOVE a consumption of the actor's own item — it grants nothing, heals nothing
(the eat it replaces restored 0 HP by definition), draws no RNG, and shortens no span. There is
no input through which it can be made to fire on a real deficit: it reads `hp`/`maxHp`, which on
the server are `player_state` columns the engine itself advances during the span.

**7 · WHERE TO POINT A MUTANT** (all six already run and land on exactly their target):
restore `bestHealingFood` as `chooseFood`'s default → `cheapestSufficientGuard` A+B go red;
delete the processed-before-raw clause → the named raw expect goes red alone; disarm
`SYNC_ENABLED_TOGGLE` → `AUTOEAT-SYNC-3` goes red; make `receiptDeathCause` read the LIVE toggle
instead of the receipt → `RECEIPT-DEATHCAUSE-1`'s "different instant" assertion goes red alone;
delete the zero-deficit guard → the full-bar expect goes red; write that guard on the SETTING
(`threshold < 1`) instead of the STATE → the 1-HP-deficit CONTROL goes red, which is the pair
that proves the class was killed and not the instance.

---

### ✅ RESOLVED 2026-08-31 (same day, same branch) — a 100% auto-eat dial ate one Provision per swing at FULL health

**RULED as DECISIONS §2c, option (a): refuse. BUILT on `fix/autoeat-fallback-and-arm`.** Security
conditioned this lane's ship on it (E2), and the ruling is right about why: landing the chooser
alone would have made this bug **50x cheaper and therefore 50x harder to notice**, while it
drained the bag all night just the same.

`resolveAutoEat` now refuses on `deficit > 0` — beside the existing `hp <= 0` early return and
**before `chooseFood`**, so a call that will not eat does not also pick a food. The guard is on
the STATE, not the setting: `threshold < 1` would fix the 100% instance and leave the class, and
any future regen, heal-over-time or maxHp change walks back into the same `<=` boundary. The
dial's top end reads *"100% — eat the moment I take any damage"* through the single
`_autoEatHint`, riding with the fix rather than instead of it.

**HP-identity re-verified and BYTE-IDENTICAL to the pre-2c run** — 1429 meals · 1,286,100 g →
322,634 g · 2415 kills · 18556 ticks, and 48 meals · 40,800 g → 864 g · 16005 kills. No fixture
had a full-bar eat baked into its meal count, so nothing needed re-pinning. Two mutants, each
landing on its own target: delete the guard → the full-bar case eats again; guard the SETTING
(`threshold < 1`) instead of the STATE → the 1-HP-deficit CONTROL goes red.

Payload moves again: `2efae5aa…` → **`00df251e…`**. One deploy, at ship, edge-first.

_The original filing is kept below for its reasoning._

---

### _(superseded by the ruling above)_ OPEN 2026-08-31 — SYSTEMS → DESIGNER: a 100% auto-eat dial eats one Provision per swing at FULL health

Found while building ruling 2; **not fixed, because it is not mine to rule**, and it is not made
worse by this build.

`resolveAutoEat` eats when `hp / maxHp <= threshold`. At the Auto-Eat II ceiling the effective
threshold is **1.0**, so a character sitting at full health satisfies `1 <= 1` and eats — a whole
Provision for **0 HP**, on every swing, for as long as the dial is at 100%. It is reachable today
by any tier-II owner, live, through a synced key.

The ruling **reduces the damage without removing it**: with a 0 deficit every food "covers", so
cheapest-sufficient now burns the cheapest Provision in the bag rather than the biggest healer.
Measured on the late-game fisher bag that is 18 g a swing instead of 900 g.

The design question is whether an eat that restores nothing should happen at all — i.e. should
`resolveAutoEat` refuse on a zero deficit? Refusing is one line and would be HP-identical (it
heals nothing either way), but it silently redefines what the top of the dial means, and "the
dial's ends belong to the player" is the position ruling 2b just took. **Designer's call.**

---

### ⚠ OPEN 2026-08-31 — SEMANTIC: two incompatible models of what armour sells (Designer ↔ Systems)

Not a merge conflict. Two live parts of the codebase hold different beliefs about whether
DEFENCE is a scarce stat, and they are both acting on it.

**Model A — `src/data/gear-tiers.js` (b497 cloth header, shipped yesterday).** Prices armour on
defence: *"at full weight cloth would cost MORE than leather for an item of identical book value
while carrying 45% less defence, which would kill the line."* The half-weight plank exists
because of that sentence.

**Model B — measured 2026-08-31 (DISCOVERIES, same date).** Monster accuracy floors at
`monsterMinAccuracy = 0.10`, reached by a plate wearer from **Steel** and by a leather wearer
from **Mithril**. At **Dawnsteel all three lines take identical damage (4.4/swing)**. Above
tier 3, "45% less defence" costs the player nothing against tier-matched content, so Model A's
premise — and therefore its 0.5x discount — does not hold in the half of the ladder it was
written for.

**Why it matters beyond cloth:** the same premise is load-bearing for the whole triangle
(gear-tiers.js `ARMOUR_LINES` header: "plate buys survival"), for the two standing Tyler
rulings recorded there, and for any future defensive item — including the offhand.

**RESOLUTION PATH (not resolved here, deliberately):** Model B is a measurement and Model A is
a design intent; the correct outcome is to make the intent TRUE rather than to delete it —
i.e. the monster-attack tier scale (the Wave 5b `ACC_DEF_MUL` mirror, routed to Systems). Until
that lands, **neither model should be acted on again**: b497's cloth line stays exactly as
shipped (Designer ruling, DECISIONS 2026-08-31 §4) and no new defence-selling item ships
(§3). Re-open the cloth cost expression only in the same build as the combat fix, so the two
are re-measured together.

**Owners:** Systems Engineer (the combat scale), Game Designer (the armour identities that
depend on it). **Evidence:** the saturation + triangle tables in DISCOVERIES 2026-08-31.

### ⚠ OPEN 2026-09-04 — b497 goal-gold retune MOVES the recorded forgery bound (Systems → Security)

Branch `data/goal-gold-retune`. The Designer's gold-per-effort-minute ruling re-prices two of the
**four kill-graded terms** the b493 bound is arithmetic over: `daily_kill` 500 → **600** and
`daily_kill_big` 900 → **1,400**. `kill_any` (200) and `kill_more` (600 + 1 gem) are untouched, and
**no XP, gem or item value moves anywhere in this change**.

| | recorded (b493) | after b497 |
|---|---|---|
| gold · character-day | 2,200 | **2,800** |
| gold · account-day (6 slots) | 13,200 | **16,800** |
| gems / bones / hitpoints XP | 1 / 5 / 400 | unchanged |
| ISO week | 2,500 g + 3 gems + 1,000 XP | unchanged |

**The SHAPE that earned the b493 acceptance is unchanged** — the amount is read from
`hr_goal_rewards` / the RPC's own CASE catalogue, neither of which any client role may write, and the
forgeable `v_have` still appears only in the journal and the receipt. A forged counter remains a
**gate**, never a multiplier. What moved is the amount, by +600 g/character-day = **0.06%** of one
character's measured honest ~1.05M g/day from the live accrual path, against a 25,000,000 g/day
server-wide inflow budget.

Not silently absorbed: K10(2) in `tests/kill-daily-credit.mjs` still pins both numbers **by value**
(the pin moved with the review rather than being loosened), `docs/design/combat-authority.md`'s
ceiling table is updated with the derivation, and `2026-09-04-goal-gold-retune.sql` carries the
arithmetic in its own SECURITY header. **Security: ratify or re-rule the new figure before the
migration is applied.** Owner: Systems Engineer + Security.

### ⚠ OPEN 2026-09-04 — cloth armour has no tiered material, and the ruled fix borrows one (Systems → Game Designer)

The Designer ruled: *"scale cloth inputs with tier consistent with how plate/leather recipe lines
scale."* Measured, the reason cloth did not scale is **structural, not a bad number**: plate and
leather cost `[a TIER-INDEXED material] × [the slot's weight]`, and **cloth has neither term** —
`silk_thread 2+i` + `magic_essence 1..2`, both untiered and both blind to the slot. There is no
seven-rung textile ladder in `ITEMS` to scale against, and no arrangement of the two untiered
reagents can carry a 600× output curve (parity would need ~250 units at tier 7).

**What I shipped, and the choice it embeds:** cloth now draws the tier's **plank** at
`ceil(slot.bars / 2)`, keeping thread + essence on top. Half-weight, not full, so cloth stays the
cheapest of the three archetypes to make (its design identity) rather than costing *more* than
leather for an item of identical book value with 45% less defence. Tier 1 moves 160 g → 178-214 g;
the tier-7 vendor faucet ratio falls **700× → 11.2×** (plate tops out at 6.9×, leather 7.5×).

**The semantic flag:** a robe costing enchanted *planks* is a fiction borrowed from the magic-staff
line (yew/runewood/duskwood are already the magic woods, and staves are planks + magic essence). It
is defensible, not ideal. **The ideal fix is a bespoke cloth-bolt ladder** — seven items, seven
sources, art, drop tables — which is a content program, crosses Designer + Asset, and would strand
every player who can craft cloth today. Recorded here rather than silently chosen. Designer: if the
bolt ladder is wanted, this line becomes a one-row change to `MATERIAL_TIERS` (a `cloth:` column) plus
the content behind it. Owner: Game Designer (call), Systems (mechanism).

### ✅ 2026-08-29 — b493 SHIP BLOCKER: kill-goal XP vs K10's forgery bound — **RESOLVED by SECURITY, 2026-08-29. Option 2, in the reviewer's own guard.**

**RULING (Security, the owner of the recorded verdict).** The new bound is **ACCEPTED**; the
designer's ruling stands; kill goals keep paying `xp:{hitpoints:100/300/1000}`. Option 1 (re-gate on
`hr_kill_credit_log`) and Option 3 (revert to gold-only) are both **rejected as disproportionate** —
they would spend real complexity to defend 400 XP/day against a lane that already, by my own GO,
accepts 5,000,000 client-submitted combat XP/character-day into the *same seven skills*.

The decisive property is not the magnitude, it is the SHAPE: **a forged kill counter is a GATE, never
a MULTIPLIER.** `hr_claim_goal` pays `v_cat.gold`/`v_cat.gems`/`v_cat.xp` read from `hr_goal_rewards`
(RLS on, no policy, every client grant revoked), and the forgeable number `v_have` appears only in the
journal and the receipt — never in an arithmetic that scales a payout. Ten thousand fabricated kills
pay exactly what thirty honest ones pay. The client's influence is on *whether* the gate opens, once
per period; never on *how much* comes through it.

**CORRECTED RECORDED BOUND** (replaces "gold only"), per CHARACTER:
| | per UTC day | per ISO week |
|---|---|---|
| gold | 2,200 | 2,500 |
| gems | 1 | 3 |
| bones | 5 (transitive via `gold_500`) | — |
| **hitpoints XP** | **400** | **1,000** |

Currency multiplies by the account's 6 slots (13,200 g + 12 gems + 30 bones/account-day). **The XP
line does not reach a ranking off slot 0** — `leaderboard_ranked` reads `player_skills where slot = 0`.

**THE NEW K10(3) INVARIANT** — "a kill-goal claim mints no XP" was never a control, it was a *defect*
(the phantom `combat` skill meant players had never received the XP half of any kill goal). It is
replaced by the property that actually bounds the surface, pinning all three catalogue terms:

> A kill-goal claim moves `player_skills` by **exactly the catalogued amount, on exactly the
> catalogued skill, and nothing else** — `hitpoints`, 100 / 300 / 1,000, **once per period**, with the
> once-guard row consumed before any credit and a second claim moving zero XP, zero gold, zero gems.
> The catalogue is pinned by value; a re-price, a re-point to another skill, or a lost once-guard
> fails the build **by name** and re-opens this verdict.

Landed in `tests/kill-daily-credit.mjs` and proven non-decorative by four new mutations —
`goal_xp_repriced` (300 → 300,000), `goal_xp_repointed` (hitpoints → prayer),
`goal_claim_reclaimable` and its `_gate_blind` twin. **All 17 mutations caught; the guard is green.**
Note `tests/modal-goal-claim.mjs` BIND-PAY catches only a *one-sided* client↔server drift — a
coordinated retune of both sides passes it, and K10(3) is the only thing that catches that. Do not
delete it as duplicate coverage.

Prose corrected in the same pass, in all four places the bound was recorded: the guard header,
`tests/schema-apply-order.json`, the `2026-09-01-kill-daily-credit.sql` header, and
`docs/design/combat-authority.md`.

**RESIDUAL RISKS ACCEPTED, STATED:** (a) this XP is deliberately outside the shared 40M/day inflow
budget (`gold_in`/`xp_in` = 0 — the muster/raid-chest and b414 rule), so the catalogue and the
once-guard are its *only* bound, which is exactly why K10(3) now pins both; (b) a forger can still
self-inflate ≤3,800 hitpoints XP/ranked-character-week — bounded, journalled by name
(`goal_claim:<period>:<goal_id>`, `meta.xp`) and reversible.

_Original report below, kept because its diagnosis was correct and its two failing assertions are
what forced the verdict to be re-taken inside one release rather than a year later._

**P1. Semantic conflict between two branches that were each green in isolation. This is not the `?v=` bug, and fixing that did not fix this.**

Two integrated branches hold incompatible models of the same surface:

- **`2026-09-01-kill-goal-xp-hitpoints.sql`** (integrate `aca6088f`, designer-ruled) re-prices every
  kill goal from `xp:{combat:N}` to `xp:{hitpoints:N}` — 100/300/1000.
- **`2026-09-01-kill-daily-credit.sql` + `tests/kill-daily-credit.mjs` K10** (integrate `4fac7beb`,
  security-reviewed) concluded the change was safe *because* a forged/inflated kill counter reached
  **gold only**. That held only because `combat` is not a row in `hr_skills`, so `hr_claim_goal`
  routed the reward to `skipped_xp` and no `player_skills` row moved.

`hitpoints` **is** a row in `hr_skills`. So the reward is no longer skipped — it is minted:

```
✗ K10: a kill-goal claim moved player_skills by 300 XP.
      The review concluded a forged kill counter reaches gold only; an XP path changes that.
✗ K10: the kill-goal reward no longer reports combat XP in skipped_xp — either the reward was
      re-priced or it is being minted somewhere: {}
```

Why it matters: hitpoints feeds **combat level and the leaderboards**, so an inflated kill counter
now converts into a RANKED value instead of gold. The XP branch's own header anticipated the
neighbouring risk ("folding an existing `G.skills.combat` into `player_skills.hitpoints` would mint
RANKED XP") and correctly refused a backfill — but the *claim* path was not re-examined, and K10's
first assertion (`'combat' is now a row in hr_skills`) does not fire because the reward moved to a
different key rather than the key becoming a skill. K10's 2nd/3rd assertions caught it.

**Not resolvable in the QA lane** — it is a design-vs-security decision, and both positions are
defensible. Options for the owners, in the order I'd rank them:
1. Gate the kill-goal XP on the SERVER's own kill evidence (`hr_kill_credit_log`) rather than the
   client-influenced daily counter — keeps the designer's ruling and closes the bound.
2. Clamp + journal the XP so the reachable amount is bounded and reversible, and re-take the verdict.
3. Revert kill goals to gold-only (loses the designer's ruling; last resort).

Whatever is chosen, K10's prose must be updated in the same commit — it currently describes a world
where kill goals pay `xp:{combat:N}`.

**Repro:** `node tests/run-smoke.mjs` on `main` @ b493 → "Kill → daily-goal credit guard — FAILED",
two ✗ under K10. Present in the pre-fix baseline log too, so it is independent of the cache-buster fix.

---

### 2026-08-23 — OPEN BETA: the CLIENT is codeless-optional BEFORE the SERVER is (Systems → Coordinator)
Branch `agent-a4b1b5fffc2a6ed2a`. **Semantic conflict, not a git one.**

This branch makes the invite code OPTIONAL on both signup surfaces. The server's gate — the
AFTER INSERT trigger + auth hook in `supabase/migrations/2026-08-23-beta-invite-gate.sql` — is
UNCHANGED and still refuses a codeless signup. I did not touch `supabase/**` (out of my lane, and
out of scope for the task as given).

So between deploying this build and switching that gate off, **every codeless signup is refused.**
That window is handled rather than ignored: `humaniseAuthError(err, creating, hadCode)` now says
_"Sign-ups are still switching over to open beta. Try again in a minute — or add an invite code if
you have one."_ instead of blaming a code the player never typed. Transitional copy, but correct
either way, so nothing has to be un-shipped once the gate comes off.

**Ordering that avoids the window entirely: switch the SERVER gate off FIRST, then ship this build.**
The old client always sends a code, so it keeps working against a gate that no longer requires one.
The reverse order is the one that costs signups.

**What the server must accept** — exact shapes, read off the real submit handler under test:
- with a code → `POST /auth/v1/signup {email, password, data:{invite_code:"ABC-123"}}`
- without → `POST /auth/v1/signup {email, password}` — **no `data` key at all**, so
  `raw_user_meta_data->>'invite_code'` is SQL **NULL**, never `''`. A gate that only special-cases
  `''` will refuse the normal case.

**`tests/beta-invite-gate.mjs` was AMENDED, not gutted.** Its server half is untouched and still
asserts the gate is AFTER INSERT, exactly-once, and fails closed. Its client half now asserts
"a code travels when given, and NOTHING travels when not" — the old "a code always travels"
assertions had become the opposite of the product. **Do not delete the server half when the gate is
switched off:** a dormant gate that can be switched back on is worth more than one nobody can prove
still works.

### 2026-08-17 - CROSS-VERB COUPLING - `equip` (changes weapon) must clear `enchant.weapon` on BOTH sides (Systems -> Server agent)
**ELEMENTS v1.** `G.enchant.weapon` is bound to the WEAPON, not the player: whenever the item in the
weapon slot changes, the enchant is void. The client already reflects this — `clearEnchantOnWeaponChange`
is called from every path that writes `G.equipment.weapon` (`equipItem`, `unequip`, `unequipSlotInv`),
and `equipmentStats` belt-and-braces refuses to stamp `eq.element` unless the weapon slot actually holds
a `type:'weapon'` item. **The SERVER must do the same:** the `equip` verb, when it changes the weapon
slot's item, must clear its own `state.enchant.weapon`, and the envelope it returns must carry the
cleared `enchant` so the client applier (`applyEnvelopeState`, which now authors `G.enchant` from
`state.enchant`) reflects it. A same-item re-equip is a no-op and must NOT clear the enchant.
If the server does not clear on weapon-change, a player keeps a +15% element on a weapon that no longer
carries the rune until the next real enchant — a small but real over-credit. Client guard makes it
inert locally; the durable fix is server-side. **Owner: the Edge `enchant`/`equip` agent.**

### 2026-08-17 - HANDOFF - the vendored core changed; hr-accrue must repack + redeploy (Systems -> Server agent)
`src/core/combat.js` (the `weaknessInfo` element factor + `equipmentStats` 3rd arg) and the new
`src/core/elements.js` are vendored into `supabase/functions/hr-accrue`. The smoke preflight
`deployedPayloadGuard` now reports a payload-digest drift (informational, non-fatal — the suite is
still 0 failures). When the server builds the `enchant` verb it must: (1) call
`equipmentStats(equipment, items, enchant)` with the player's authored enchant at its two accrual
sites (`accrual.js` weakness + rolls) so away combat pays the element — the signature is
backward-compatible (a missing 3rd arg stamps no element); (2) author `state.enchant.weapon` from
`runeElement(rune, ITEMS)` (element name only, never a magnitude); (3) repack with
`node tools/pack-edge.mjs hr-accrue --out <dir>` and redeploy. Contract for the client intent is in
`src/net/enchant.js`'s header (verb body `{verb:'enchant',slot,intentId,enchant:{slot:'weapon',rune}}`;
refusal codes `insufficient_item`/`wrong_slot`/`unknown_item`/`rate_limited`; collectsFirst).

### 2026-08-17 - SEMANTIC - The accrual envelope writes `playerHp`, which `events.js` declares NO_SYNC (Designer -> Systems)
**This is a real disagreement between two modules about who owns HP, and it produced a shipped
player-facing bug.** `src/net/events.js` has said since it was written that `playerHp` /
`playerMaxHp` are `NO_SYNC` - *"in-flight combat - belongs to the device you are fighting on"*. The
snapshot honours that. `applyEnvelopeState` in `src/net/accrue.js` never did: it wrote the server's
hp unconditionally.

**Measured consequence (LIVE-AUDIT-2026-08-17, FTUE run 2):** a brand-new player died to the first
slime and respawned at **2/10 HP**, then re-entered combat and died again. Nothing in the combat
rules produces a 2 - `resolveDeath` full-heals and always has. The client resolved the death and
healed to 10/10; an envelope for a window that ended *before* that death then landed and wrote the
server's mid-fight hp over the respawn.

**What I did (b373, client-side floor only):** an envelope may RAISE hp freely, and may lower it
only while a fight is actually in flight (`G.activeMonster`). With no active monster there is
nothing hitting the player, and the server itself agrees - `accrual.js` sets the activity pointer to
idle in the same delta as a death. No economy exposure: hp is not tradeable, rankable or
contributable, away combat runs with `activeMonster` set (full server authority preserved), and the
refusal is recorded as `written.hpRefused` so the drift counter still sees it.

**What SYSTEMS owns, and why the floor is not the fix.** The envelope already computes
`summary.died`. The correct end state is that it says so, and reports POST-RESPAWN hp, so the two
sides never disagree in the first place. Please do not let the client guard become the reason that
never happens - and if you would rather delete the guard once the envelope is honest, do; the b373
test "an idle player cannot be wounded by a server envelope" documents the property either way.

### 2026-08-17 - DEPLOY COUPLING - A UI feature cannot cheaply touch `src/core/combat-sim.js` (Designer -> Systems, FYI)
While building the death sheet I added a single field (`monsterId`) to the info object
`resolveDeath` hands `fx.onDeath`. It turned the suite's **Edge payload guard** red: that file is
packed into hr-accrue, so one changed byte - including a comment - demands a coordinated Edge
redeploy before the client can ship. I reverted it and read `state.activeMonster` from the client
instead (legal: `onDeath` fires before the caller stops the fight; asserted by a b373 test).
**Not a complaint about the guard - it is doing its job.** Flagging it because it is a
non-obvious cost that will bite the next person who adds a "harmless" field to a core sim, and it is
worth knowing that a purely presentational need can force a server deploy.


### 2026-08-16 · CSS · The `#panel-market` theme sweep owns every colour on the market screen (Systems → Art Director)
**Found while building the b361 trade-ledger panel, by measurement in a real browser rather than by
reading the sheets.** `src/styles/art-direction.css` carries

    body[data-theme="hearthlight"] #panel-market :not(.shops-tabs, .bb-board, .sc-scene, .sc-counter,
      .iap-card, .hr-cs, .hr-room, …) { color: var(--ink); … }

with **no escape hatch**. Its sibling rule (`body[data-theme="hearthlight"] .panel.active span:not(…)`)
does ship four — `[class*="gold"|"pill"|"chip"|"badge"]` — but the `#panel-market` form does not, and
an id beats anything `audit-overrides.css` can reasonably write. Measured consequence:

- `.mk-qty` asks for `color: var(--gold-2)` and renders `var(--ink)` in Hearthlight. **Every gold badge
  on the market screen has silently lost its gold** — the `×10` quantity pills, the ledger amounts, all
  of them. This is pre-existing and predates b361.
- I tried three ways to distinguish "money in" from "money out" on the ledger (colour, then background,
  then border). **All three were overridden.** Verified by computed style, not assumed.

**What I did, deliberately:** nothing. I did NOT win the specificity war. Escalating a component rule to
out-rank a theme sweep is exactly how the cozy-light override stack got built and what the b214 audit is
still paying down, and it would have left a rule that breaks the day the sweep is narrowed. The ledger
carries direction in WORDS instead — an explicit `+`/`−` on the amount and "Sold"/"Bought" leading the
meta line — which is legible in both themes, under the sweep, and to a player who cannot distinguish the
two colours at all. The block therefore added **zero theme-fragile CSS**.

**Art Director owns the ruling.** The cheap fix is to give the `#panel-market` form the same four
`:not([class*=…])` opt-outs its `.panel.active span` sibling already has; that restores gold to every
market badge in one line and I would then re-add the two-tone ledger amount. Not doing it unilaterally:
it repaints a whole screen in one theme, which is your call and not mine.

## Conflict types to watch
- **Code:** two agents editing overlapping lines/files.
- **Semantic (the dangerous kind — no git conflict):** two agents holding incompatible models of how a system should behave. Example: Game Designer says "cooking should improve combat effectiveness"; Systems says "cooking currently only modifies XP." No merge conflict, but a real design/system conflict. Flag it.
- **Design:** competing player-experience goals.
- **Asset:** style/consistency disagreements.
- **Architecture:** competing structural approaches.
- **Integration:** a change that breaks another verified change on merge.

## Open

### 2026-08-16 · events-donations spec · THREE ROUTED FLAGS (Game Designer → Systems/Backend), pre-build
From `docs/design/events-donations-and-voting.md` (The Kindling/The Beacon — AWAITING TYLER'S REVIEW-BOOK APPROVAL; nothing builds until then). Whoever implements must honour:
1. **Fuse re-split.** The `getBonus('allXP') ≤ 0.60` assertion was written against PERMANENT power; donation-boosted blessings can put 0.17 on one key and break it. Ruling: `BLESSING_KEY_CAP = 0.12` (UI-visible, never a silent clamp) and the assertion splits into `permanent ≤ 0.60` / `calendar ≤ 0.12`. First-99 floor holds (~55.7d vs ≥54 gate) even at ceiling.
2. **Do NOT move `utcWeekKey`.** It is Thursday-aligned and consumed by raids/quests. The Beacon gets its own `beaconWeekKey` (Monday 03:00 UTC reset = Sunday night in all four US zones year-round).
3. **Away rule.** The donation boost mutates the blessing's own bonus map — it must NEVER get its own channel, or it silently starts paying away (`AWAY_SCOPE.blessing=false` is the rule). Spec test #7 is the tripwire.
Also: retiring the muster chest removes ~7,500g + 10 gems/player/day of faucet while adding a sink — Systems must check the gem side (cosmetic access rate) before launch; designer ruled measure-a-week-then-adjust rather than pre-compensate.

### 2026-08-15 · b343 · SEMANTIC — away combat now pays a new character's first night (Systems → Game Designer)
Tyler removed the away-combat gate ("get rid of the license shit it's way too confusing"). Design should hold the real numbers, not read them off a changelog. **Measured, 400 seeds, live engine**, a fresh character (10 HP, bronze sword, no Auto-Eat, empty food slot) left on Slime for eight hours:

| | before b343 | after b343 |
|---|---|---|
| outcome | span not simulated | **dies 100% of the time**, after **59.4s** (median 57.6s) |
| kills | 0 | **4.49** (median 4, range 1–9) |
| XP | 0 | **84.1** total (style + Hitpoints) |
| gold | 0 | **~10** (median) |

84 XP against `pacing-overhaul.md`'s 13,034,431-XP first-99 is **0.00065%** — the pacing floor does not move. **Auto-Eat is still the real gate on AFK combat**: without the trait nobody eats while you are away, so the night is over in a minute. That was always true and the licence was a second lock on it.

**Two authored payouts are now reachable during an absence** and were not before, because a declined span was never simulated: `first_blood` (Defeat 5 monsters → 150g + 5 turnip seeds) completes at ~46% of first nights, and `hundred_kills` (1,500 combat XP) can complete for a player parked at 95+ kills. Both are **one-time per character** and both are minutes of attended play away, so neither is a faucet — but they are new value entering during the server-authority rebuild and Design should say yes rather than have it assumed.

### ✅ 2026-08-15 · BLOCKER — RESOLVED IN b347 (Systems). The gather/artisan replay has a timeline; the held branch is unblocked. Full record under Resolved. Original text kept below because the measurement in it is the before-half of the fix.

### 2026-08-15 · BLOCKER (code + semantic) — the away buff rule is landed in CORE only; the gather/artisan replay in `legacy.js` must land before this ships (Systems → whoever holds `src/legacy.js`)

Branch `agent-a06ecbcee310aa2c7`. `AWAY_SCOPE.buff` is now `true` (Tyler, 2026-08-14: personal buffs pay away, server-wide blessings do not). That flag is a property of the SCOPE TABLE, so it opens for every away caller at once — but only one of them can honour the other half of the rule.

- **away COMBAT** — `src/core/combat-sim.js simulateSpan` owns a timeline (it already segments by UTC day for the Boss of the Day). It drives the buff clock per tick, so a buff expires at the right instant. **Correct, measured, tested (AWAY-5 / AWAY-15).**
- **away GATHER / ARTISAN** — `legacy.js processOffline` computes `ticks = floor(spanMs / offlineIntervalMs())` and runs that many identical actions. A flat single-rate loop: the interval is derived ONCE before the first action and nothing advances a clock inside it. It therefore **pays a buff for the whole absence and drains none of it.**

**Measured exposure** (shipped food catalogue — magnitudes 1–5, durations 2–20 min): a `gather_speed` buff eaten immediately before logging off applies its speed term to the entire night (max **+4%**, via the one-shot `activityIntervalMs()` read); an `all_xp` buff applies to every action of the night (max **+5%**). Bounded, deliberate to trigger, and still the b326 exploit in miniature.

**Second, player-facing half of the same defect:** `legacy.js` line ~1399 computes `buffsPaused` for the non-combat branch as "did they hold a buff", and `src/features/home-dashboard.js:565` prints "your buffs were paused" off it. On a gather night that copy is now a lie in both directions — nothing was paused, and it paid all night.

**The fix is in `legacy.js`, not in core:** split the gather/artisan replay at the buff-expiry boundary — run `min(buffRemainingMs, spanMs)` of ticks with the buff live, call `advanceBuffClock` for that slice, re-derive `offlineIntervalMs()`, then run the remainder. Same shape `simulateSpan` uses, one level up. Then drop `buffsPaused` from the non-combat summary. **Do NOT "fix" it by closing `AWAY_SCOPE.buff` again** — that reverts a stated design rule to work around a loop that should have had a timeline all along. The full note is at the foot of `src/core/away.js`.

Also stale and now wrong in `legacy.js` (comments + one player-facing string, all untouched because another agent holds the file): the `getBuffBonuses` header (~14220), `advanceBuffClock`'s drain-rules comment (~14328), `buffFrozen()` and its copy *"freezes entirely while you are away"* (~14454–14490), and the `buffsPaused` doc block (~1390).

### 2026-08-15 · FINDING (no change made) — the offline cap does NOT stop the character; it caps the payout and shifts the window to the END of the absence (Systems → Coordinator / whoever owns the cap)

Tyler's rule: *"after that player's 'max offline time' is reached, their character stops all activity."* **Measured behaviour today is the other one.** Driving the real `processOffline()` with a stubbed cap and `document.hidden` forced false:

| scenario | absence | cap | PAID | `capped` | activity still running on return | sim window |
|---|---|---|---|---|---|---|
| gathering | 3h | 1h | 1h | true | **yes** (`activeSkill: woodcutting`) | n/a |
| combat | 3h | 1h | 1h | true | **yes** (`activeMonster: slime`) | now−1h → now |
| combat | 18h | 12h | 12h | true | **yes** | now−12h → now |

So today: **(a)** the payout is capped and the activity is still running when the player returns — not **(b)** the character stops at the cap and returns idle.

There is a second, less obvious half nobody has stated: `simulateAwayCombat` sets `fromMs = now − paidMs`, so the credited window is the **LAST** `cap` hours before returning, not the **FIRST** `cap` hours after leaving. An 18-hour absence is simulated as "idle for 6 hours, then fought for 12". Under Tyler's rule it should be "fought for 12, then stopped". The amount paid is identical either way; **which UTC day's Boss of the Day is credited is not** — a long absence is currently credited against the wrong day's boss. It also decides which instant a held buff's remaining time maps onto.

Reported, not changed — the cap is Tyler's call and it interacts with in-flight work elsewhere.

### 2026-08-14 · b342 · SEMANTIC — every proc pet just got HALVED to its declared rate (Systems → Game Designer)
Companion procs were applying **twice per trigger** — measured, in the real client: 2 applications, 2 toasts and 1.0 pet XP (a utility pet earns 0.5) on each of kill / combatHit / gather / cook. Two identical hook sets, one in `src/legacy.js` block 31 and one in `src/features/companions.js`, both wrapping `killMonster` / `combatTick` / `addItem`. The legacy copy is deleted (b228's fix, one layer up).

**This is a correctness fix that lands as a live NERF**, and Design should know the numbers rather than read them off a changelog:
- A Raccoon's advertised "20% on kill" was really **36%** (1 − 0.8²). Every proc pet was ~2× its declared rate. The power budget was never told, so the census figures for companions have been understating real pet value since the hooks were written.
- Companion **XP** was also double: every pet levelled at 2× the intended rate, so live beta pets are roughly twice the level their playtime earns.
- Companion **drop** rolls were double: Wolf Pup's 1% was really 1.99% per kill (2 independent rolls; the unlock itself was self-limiting).
- `G.stats.cropsHarvested` moved **+2 per harvest**, so the Bunny quest ("harvest 100 crops") completed at **50** and the weekly `wk_harvest` ("Harvest 120 crops") at **60**. Both now cost what they say.
- The pet-impact panel (`HearthrisePetSession`) only ever heard from the ESM copy, so it was reporting **exactly half** of what pets really paid. It is now accurate — which will read to players as pets "getting better at reporting" in the same build they get worse at paying.

**No balance VALUE was changed** — `src/data/companions.js` is untouched. If Design wants the effective rates restored, that is a data edit to `proc.chance` and it should be made deliberately, with the budget re-run. **→ Game Designer to rule on whether the declared rates are the intended rates.**

### 2026-08-11 · b330 · SERVER GAP — leadership has no read for its own outstanding invitations (Systems → whoever next owns the membership SQL)
`2026-08-11-clan-membership-authority.sql` shipped `clan_invites_list()` for the **invitee** only, and `clan_invites` deliberately has **no client SELECT policy**. So a leader can send an invitation and revoke one, but the server offers no way to ask *"who have we invited?"* — which the panel needs before it can draw a Withdraw button beside a name.

I did **not** invent a client-side list and I did **not** add a policy to `clan_invites` (a readable invite table is a readable list of who is being courted, and the migration is explicit that the RPCs are the only door). The panel derives the answer from **`clan_ledger`**, which is `for select using (true)` and which every membership RPC journals to (`invite` / `invite_revoke` / `join_invite` / `join` / `kick`): the newest row per user decides, and an `invite` row older than the server's 7-day TTL has lapsed. That is complete rather than a guess — but it is a **derivation of server state on the client**, which is the shape this project has decided against everywhere else.

**The honest fix is a `clan_invites_outstanding()` RPC** (leadership-only, `hr_clan_may_admit`, rate bucket `clan_invites_list`, returning `{user_id, display_name, invited_by, created_at, expires_at}`). When it lands, delete `outstandingInvites()` in `src/features/clans.js` and call it instead — the panel consumes an array of the same shape, so it is a one-function swap. A stale derived entry costs nothing today: revoking it answers `revoked: 0`, which the transport already reports as *"There was no invitation left to withdraw."*

**Also noted, not acted on:** the migration has no **decline** path. An invitee can accept or let it lapse. The inbox therefore draws Accept only and says what happens if you do nothing — a Decline button would be a control that cannot do what it says. If Design wants decline, it needs `clan_invite_decline(p_clan_id)` (sets `revoked_at`, journals `invite_decline`). **→ Game Designer to rule, Systems/SQL to build.**

### 2026-08-09 · b228 rebase applied — three of the batch below are RESOLVED, two new items open (Systems)
**Resolved by `agent-rebase` (b228):** items 1, 3, 4, 5 and most of 6 of the batch below. The fuse moved to `src/features/power-budget.js` as the final wrapper; `smoke-test.js`'s offline-latch test already asserted through `bonusFor` (pre-clamp) so it did NOT break structurally — it gained an explicit second assertion that the clamp is not what makes the two nights equal, so the latch keeps doing the latch's job; the `farmYield` flooring fix, the companion key-name fix and the ranged/magic `combatXP` fix all landed inside the rebase commit; `CASTLE_TOTAL_CAP` is deleted rather than enforced (a cap that a later wrapper escapes cannot be given a real job — the real job moved to power-budget.js). Item 7 was already shipped: Workshop and Shrine were at +2/4/6/8/10 when this branch read them.

**Still open from that batch, unchanged: item 2** (Designer must point `homestead-deepening.md` §H2/H3/H4, `clan-overhaul.md` §8.1/8.2/8.4 and `pacing-overhaul.md` A.4 at `bonus-rebase.md`), and the **`hearthScale()` inertness** half of item 6 — `registerBuffScaler` still has no live caller, so the Tavern's +40% duration / +10% magnitude has still never applied. It is rebased and correct; it is not wired. **→ Systems, next pass.**

**NEW · 1 · SUPERSEDED SPEC LINE (Designer ↔ Tyler).** `bonus-rebase.md` §4.3 lists the renown weights (`14 / 900 / 0.5`) as **unchanged — "pacing, not bonuses"**. Tyler's directive of the same day overrides it: *"It also seems to be going way too fast."* Every `W` weight came down (`totalLevel` 14→2, `kill` .5→.05, …); the twelve **thresholds are frozen** and now pinned by a test, because `min` is compared against the `renownHigh` ratchet — lowering a weight can never demote anyone, but raising a threshold demotes everybody at once. **→ Designer:** the pacing appendix and §4.3 need the amendment.

**NEW · 2 · DEFERRED BY SYSTEMS, DELIBERATELY — the L5 batch-capacity rungs.** §5.3 converts the three Keystone L5 benches to "one action produces five". Systems did **not** build it, and the reason is not effort: batching converts an artisan skill's bottleneck from TIME to MATERIALS, which is roughly a **5× move on artisan XP/hour** and directly reverses §5.2's own stated consequence ("the artisan block collapses onto its no-perks column, ≈18–19 months"). That is a pacing decision with the product owner's name on it, not a magnitude Systems may pick while applying a magnitude spec — and §5.5 already schedules it for b229. The rungs are not dead in the meantime (they pay +10% speed and an 8% proc, honestly stated), but the Keystone price is still thin. **→ Game Designer:** name the batch size, and say whether the Shrine's specced bulk-bury of 10 is the same mechanic or a different one. Systems builds it once that number exists.

### 2026-08-09 · Bonus-rebase batch (Game Designer — full detail in `docs/design/bonus-rebase.md` §6)
1. **ARCHITECTURE · the fuse cannot police a chain it sits in the middle of.** `getBonus` is a base function plus **six additive wrappers**; the fuse lives at layer 4 (`clan-seat-ui.js:297`) and reduces only the castle's own contribution, so companions, food buffs, the muster aura and the whole blessing calendar are unpoliced. **Ruling: move the budget to a final `src/features/power-budget.js` wrapper installed last**, applying `permanent ≤ 0.20` / `temporary ≤ 0.15` / `total ≤ 0.30` per key. Needs permanent and temporary to be separately accumulable. **→ Systems, ruling required before b228 builds.**
2. **SUPERSEDES · `homestead-deepening.md` §H2/§H3/§H4 and `clan-overhaul.md` §8.1/§8.2/§8.4 are replaced** by `bonus-rebase.md` §2.2/§3. The `allXP ≤ 0.60` fuse, the artisan `≤ 0.85` clamp, the `restedXp ≤ 0.50` clamp (item 2 of the homestead batch below) and the +52%/+25% ceilings are all retired. `pacing-overhaul.md` A.4's boost columns (+20/+33/+52%) no longer describe anything. **→ Designer, next touch of each doc.**
3. **TEST BREAKS STRUCTURALLY:** `smoke-test.js:8746` forces a synthetic all-keys blessing of 0.50 and asserts `bonusFor('allXP') === 1.0`. A final clamp caps that at 0.30. The offline-replay latch it guards is load-bearing and must keep being guarded — assert pre-clamp, or bring the synthetic magnitudes into legal range. **→ Systems + QA.**
4. **UNBUDGETED INCREASES that must land INSIDE the rebase commit, not after it:** (a) the `farmYield` flooring fix (`legacy.js:2390` floors the total, so Scarecrow 0.1, Bunny 0.10, Squirrel 0.15, Carrot Stew 0.15 and Roasted Pumpkin 0.05 have all paid **zero** since launch); (b) the companion key-name fix — `xpB`, `goldBonus`, `prayerXp` are misspellings of `allXP`, `goldFind`, `prayerSpeed`, so Fox, Lichling, Raccoon, Owl and Grave Wisp pay nothing. **→ Systems.**
5. **P1 · LIVE:** `combatXP` is applied only to attack/strength/defense/hitpoints (`legacy.js:1508`) — the Trophy Room, the Watchtower, War Drums and Hunter's Moon pay **nothing** to ranged and magic. Pre-existing, orthogonal to the rebase. **→ Systems.**
6. **INERT:** `hearthScale()` (`clan-seat.js:256`) advertises +40% buff duration / +20% magnitude at Tavern 10 but `registerBuffScaler` has no live caller — it has never applied. Also `CASTLE_TOTAL_CAP` (`clan-seat-ui.js:126`) is declared and enforced against nothing, and Frostfin Supper's `defense` buff is a silent no-op (`items.js:159` vs `BUFFS_DEF`). **→ Systems.**
7. **P1 · IN FLIGHT:** the `agent-homestead` provisional retuned six rooms and missed two — **Workshop and Shrine are still at +10/25/50/50/60** while the Forge is at +2/4/6/8/10. Must land in the same commit. **→ homestead agent.**

### 2026-08-08 · QA attack-pass routed findings (full repros in agents/qa-engineer.md — read them there)
- **P2 → Systems:** welcome-back modal reports HALF the offline yield actually granted (display recomputes a stale 0.5x model; render `G.lastOfflineSummary` instead).
- **P2 → Systems:** multi-tab = silent last-writer-wins save destruction (no lock, no storage listener).
- **P3 → Systems:** `processOffline()` not idempotent (latent); naive lastSeen fix blanks the welcome-back modal — see the rested-XP watermark pattern.
- **P3 → Systems:** one unknown `cropId` kills the whole Farm page (renderers unguarded; `isReady()` already defends it).
- **P3 → Designer:** renaming leaves open market listings under the old seller name (re-render from identity vs immutable-ledger — a ruling).

### 2026-08-08 · Homestead-deepening batch (Game Designer — details in `docs/design/homestead-deepening.md` §9)
1. **P1 · LIVE DEAD CONTENT (independent of any spec):** `farm-progression.js TIERS` stops unlocking crops at Pumpkin, *including at MAX plot level*, but b215 added **Goldenroot (farming 62), Emberfruit (75), Moonbloom (88)** to `CROPS`. `canPlantCrop()` is a hard gate in `plantCrop`, the seed picker and auto-replant → **three crops, three seed items and two cooking recipes (Goldenroot Roast, Moonbloom Elixir) are unreachable at every plot level.** Farming's last 37 levels have nothing to plant. Five-line data fix; blocks the Garden ladder but should ship regardless. **Owner: whoever holds `farm-progression.js` next.**
2. **SEMANTIC · `restedXp` is now claimed by BOTH pillars.** Homestead Library L4/L5 and castle Tavern Common Room both grant potency, and `getBonus` **sums**. Unclamped, a clanned player with a maxed Library reaches 100% potency = double XP on 80 banked charges. **Ruling: clamp `restedXp ≤ 0.50` aggregate — two roads, one ceiling.** Whichever pillar ships first lands the clamp.
3. **CORRECTION · `clan-overhaul.md` §8.3's allXP arithmetic is four points low.** Stated post-re-scope ceiling +47%; actual is **+52%** (it omits the homestead property capstone, `getBonus` `isCastle() → +0.05`). The `≤0.60` fuse still holds but the headroom is 8 points, not 13. **No system in either pillar may add a new `allXP` source.**
4. **DESIGN LAW (applies to the castle too):** extra-output perks (`yield_*`, `craftSave`) must fire only when `!ITEMS[recipe.output].type` — materials, never equipment. The vendor pays full item `v`, so a 20% extra-output roll on endgame armour prints six figures per craft.
5. **BROKEN PERK:** the Scarecrow plot-building grants `farmYield: 0.1` and `harvestPlot` **floors** the total — it has contributed nothing since launch whenever the Garden's bonus is an integer. Same class as the Cellar's dead storage perk.
6. **DEAD UI:** six ghost keys in the House bonus display (`legacy.js:5092`) — `noBurn`, `craftSave`, `kitDrop`, `farmYieldPct`, `hearthXP`, `storage`. The spec revives `craftSave` and deletes `storage`; the other four should be **removed from the display list**, not invented into mechanics.
7. **ASSET DEPENDENCY:** 8 room illustrations (lit / ghosted / locked) + 3 Phase-3 rooms, in the same "Forge & Stone" language as the castle view. The two pillars' art must be produced together or the twins will not look like twins.

### 2026-08-08 · Hunt ratification batch (Game Designer — rulings recorded in the specs)
1. **SYSTEMIC ECONOMY (flagged, not fixed):** vendoring pays the full item `v` (`invSellOne`), so every high-tier craft is a gold faucet — Dawnsteel Platebody turns 21,000g of bars into 108,000g; the Hunt-forged one turns 34,800g into 270,000g. The Hunt is not the marginal offender (weekly-rate-limited inputs), but the craft-to-vendor margin should be priced deliberately rather than inherited from `tier.value`'s 2.77× step. **Owner: Systems.**
2. **ECONOMY INTEGRITY (one question, not three patches):** a signed-out session derives its muster/raid windows from the **local clock**, so a clock-rolled guest can re-claim the solo floor band; the solo-raid claim flag has the same shape (P3). The real question is whether a locally-earned save is trusted when it first syncs on sign-in. **Owner: Systems.**
3. **CADENCE:** the Hunt week rolls **Thursday 00:00 UTC** (epoch weekday) while castle upkeep rolls **Sunday 00:00 UTC**. Two reset clocks in one clan pillar. Target state is one clan week boundary; changing it now truncates a live raid week, so it is a follow-up, not a Wave-3b reversal.

### 2026-08-08 · Clan-castle v2 batch (Game Designer, filed by Coordinator — details in clan-overhaul.md §15)
1. **SEMANTIC:** clan `level` cannot gate the castle — `clan_contribute` is `10000 × 4^(level−1)` → level 10 = 655,360,000 gold. Progression moved to **Standing**; `level` demoted to cosmetic. `clans.js` L17-19 comment documents a third, also-wrong ladder.
2. **SEMANTIC → taxonomy:** four new castle goods need a **"Castle Stores"** artisan lane (`ITEMS[out].tag === 'castle'`) or the uncategorized-is-empty regression test breaks on the commit that adds them. Land the lane WITH the items.
3. **DEPENDENCY:** `goldFind` getBonus key is declared but never read — Treasury perk is a broken promise until Systems wires it (Wave 3).
4. **DEPENDENCY:** Tavern Hearth needs a buff duration/magnitude multiplier seam in the engine.
5. **DEPENDENCY:** Rested XP is a new engine seam — touches `processOffline`, the XP grant path, and the fragile `snapshotG` allowlist. Handle with care (offline double-pay history).
6. **INTEGRATION:** Muster and castle Labour BOTH wrap `updateDaily` — each wrapper needs its own idempotency flag or double-count/double-wrap bugs follow.
7. **DESIGN (recorded, deliberate):** Tavern-10 Feast at Last Call ≈ +65% allXP for 4h — the ceremony peak, inside the stated power budget.
8. **LIMITATION (wording discipline):** `clan_deposit` cannot verify item possession. Castle economy is server-authoritative for currency/gates/rewards/rate, CLIENT-TRUSTED for possession (clamped + audited). Never describe it as fully server-authoritative.

### 2026-08-08 · SEQUENCING · #14/#15 and #16 must ship together (Game Designer)
`world-event-cadence.md` §7.2 moves the raid card out of `#panel-dungeons` into the new Events panel — if the Hunt (#16) lands in a different wave, its card sits in a panel with no nav entry (the exact bug #14 fixes). Wave planning constraint.

### 2026-08-08 · DEPENDENCY · perk-stacking re-scope must land WITH Hunt chests (Game Designer)
A simultaneous +57% allXP stack would invalidate Hunt reward tuning — land clan-perk re-scope + Hunt in the same wave.

### 2026-08-08 · DEPENDENCY · six new boss signature materials need recipes at ship (Game Designer)
Else they join the recipe-less vendor-trash list (items 26–31). Route into b215 armour tiers when #16 ships.

### 2026-08-08 · DEPENDENCY · `serverSkewMs` (server-time offset) needed for topbar countdown (Game Designer → Systems)
No current equivalent exists; without it a wrong device clock makes Join appear broken. Build with #15.

### 2026-08-08 · SEMANTIC · Perk stacking power budget (Game Designer → Systems Engineer)
Homestead + renown + clan-level + proposed clan-wings all funnel `getBonus`; `allXP` could stack to ~+57%. Designer recommends re-scoping clan auto-level `PERKS` to baseline-only + a per-key soft cap, landed **with** the wings (clan-overhaul §7). Systems must rule on the cap mechanism before Wave 3 builds the wings.

### 2026-08-08 · DEPENDENCY · `raidPower` getBonus key (Game Designer → Systems Engineer)
Clan-overhaul spec introduces a new `getBonus('raidPower')` that `src/features/raids.js simulateStrike` must consume (clan-overhaul §4.3). Wave 3.

### 2026-08-08 · DEPENDENCY · `snapshot.renown` for leaderboards (Game Designer → Systems Engineer)
Flagship Throne board needs `renown` written into the client save snapshot on save (leaderboards §3.2). Touches the fragile `snapshotG` allowlist — Systems change. Wave 3.


### 2026-08-16 · DEPENDENCY · bane gear needs the monster `family` re-point (Systems → Monster workstream)
`src/core/bane.js` normalises `monster.class || monster.family` against the eleven Library-1 classes and
carries a `CLASS_ALIAS` for the legacy six (Beast→Mammal, Goblinoid→Humanoid, Arcane→Human).
**`Mythic` is deliberately unmapped** — it covers both `lesser_demon` (→Demon) and `dragon` (→Dragon) in the
live table, so any guess makes one of the two bane weapons fire at the wrong thing. Consequence today:
**Dragonrib Bow (ITEM-NEW-03) is inert** until `dragon.family` becomes `'Dragon'`. The other four bane
weapons work now. Nothing breaks either way — an unmapped family yields NO bane, which is the strict
direction. Verified: `weaknessInfo(dragon@Mythic)` → 1.00; `weaknessInfo(dragon@Dragon)` → 1.68.
Monster workstream: an explicit `class:` field wins over `family:` if you would rather not overload it.

### 2026-08-16 · DEPENDENCY · the `pendingSkill` handshake (Systems → Skills workstream)
34 ITEM-PLAN rows (7 bound runes · 7 whetstones · 3 stone raws + 3 blocks + 3 rune blanks · ashlar ·
vaultstone · 9 phase-two elementals · 6 artisan tools) landed as ITEM ROWS ONLY, each carrying
`pendingSkill: 'stonemason' | 'runecrafting' | 'fletching'`. **No recipe produces any of them** — those
are yours. The b243 reachability guard exempts an item only while its `pendingSkill` is absent from
`SKILLS_DEF`, and **B356-4 fails the build the moment you add the skill row** unless the item has a real
faucet. That is the handshake: add the skill and the recipes in one commit and both guards go quiet.
Ids/stats/values/levels are taken verbatim from `consumable-economy.md` §6.2/§6.3/§8.2/§9.5/§11.3 — do not
re-derive them. One rename applied per the review book: `rune_of_blight` → `rune_of_poison`.

### 2026-08-16 · SEMANTIC · two approved items shipped WITHOUT their signature mechanic (Systems → Designer)
Everything whose effect has no engine landed unobtainable (see `src/data/item-effects.js`). **Two did not**,
and the Designer should re-read the call at integration:
- **Watchknight Shell** (ITEM-NEW-33) — ships as honest plate T5 with the derived set bonus; its
  "damage taken while away" identity is declared `away_mitigation` and dormant. Held back it would strand
  `deathsteel_bar`, which is the only thing closing the `death_steel` orphan (ITEM-NEW-43's whole purpose).
- **Quiet Coat** (ITEM-NEW-34) — ships as honest cloth T6; `first_strike_deny` is dormant (there is no
  first-strike model at all). Held back it strands `voidchitin_weave`, which is the only thing closing
  `void_chitin` + `hell_ember` + `war_crown` (ITEM-NEW-44).
Neither description promises the unshipped effect. If the Designer would rather they wait for their
mechanic, remove the two recipes and the guard will re-classify them automatically.

### 2026-08-16 · DEPENDENCY · hr-accrue REDEPLOY required (Systems → Coordinator)
`src/core/combat.js` + `src/core/bane.js` + `src/data/*` are vendored into the Edge payload, so the payload
guard is correctly RED: `the deployed hr-accrue reports payload 122e57cf… but this repo packs to 886e8268…`.
Bane reads through `equipmentStats` → `weaknessInfo`, which accrual.js already calls at every site
(accrual.js:686/1203/1479, :950), so away accrual gets it for free — **but only after the redeploy.**

## Resolved

### 2026-08-15 · BLOCKER · the away buff rule reached only one of three away callers — RESOLVED in b347 (Systems)
**Was:** `AWAY_SCOPE.buff` opened for every away caller at once, but only `simulateSpan` owned a timeline. `processOffline`'s gather and artisan branches ran `ticks = floor(spanMs / offlineIntervalMs())` with the interval derived once — so a buff paid the whole absence and drained none of it.

**Measured, real engine, 8h away on woodcutting Normal Tree, one 10-minute consumable eaten on the way out:**

| | control (no buff) | `gather_speed +4%` | `all_xp +5%` |
|---|---|---|---|
| BEFORE — actions | 6,000 | **6,250 (+250)** | 6,000 |
| BEFORE — woodcutting XP | 30,000 | 31,250 | **36,000 (+20.0%)** |
| BEFORE — buff drained | — | **0 of 600,000 ms** | **0 of 600,000 ms** |
| AFTER — actions | 6,000 | **6,005 (+5)** | 6,000 |
| AFTER — woodcutting XP | 30,000 | 30,025 | **30,125 (+0.417%)** |
| AFTER — buff drained | — | **600,000 ms, expired + pruned** | **600,000 ms, expired + pruned** |

So the consumable bought **50× the actions** and **48× the XP** it had earned, and came back reading a full 10:00 — repeatable every night, forever. It now buys exactly the slice it was alive for and is spent.

**Fix:** `replayAwaySpan` in `legacy.js` (beside `offlineIntervalMs`) — the span is split at buff-expiry boundaries, the interval is re-derived per slice, the sub-tick remainder carries across, and `advanceBuffClock` (the ONE clock) is called per slice. The boundary function is `nextBuffExpiryMs` in `src/core/buffs.js`, beside `activeBuffs` so it applies the same liveness rule. Same shape as `utcDaySegments`; NO second mechanism. `AWAY_SCOPE.buff` stayed `true`.
**Also fixed:** the non-combat `buffsPaused` expression (was "did they hold a buff", a lie in both directions on a gather night) and four stale comment blocks + one player-facing string that described the freeze that no longer exists.
**Guards:** `AWAY-16` (drives the real `processOffline`; 4 mutations RED) and `AWAY-17` (the boundary oracle; 3 mutations RED). In all seven, `AWAY-1 PARITY` and `AWAY-5` stayed GREEN — which is precisely why a combat test could never have caught this.

### 2026-08-08 · SEMANTIC · Auto-eat vs foodClass split — RESOLVED in b220 (Game Designer)
**Was:** cooking taxonomy adds `foodClass: 'healing' | 'buff'` and auto-eat must draw from `'healing'` only, but fish-line Provisions carry incidental combat buffs, so the line was unclear.
**Ruling (taxonomy §5.4):** the fish line KEEPS its buffs — `foodClass` governs what the *engine* may spend, not what stats an item has. Stripping +12% damage from Cooked Shark would be a combat-balance change smuggled in under a UI task, and it isn't needed: `maybeAutoEat()` heals and decrements, it never calls `applyBuff()`, so auto-eating a Provision grants no hidden power. Buffs are applied only by the deliberate Eat action.
**Evidence that settled it:** the real defect was auto-eat's *selection*, which preferred items with no `buff` field — and since every cooked food has one, that meant raw ingredients: it picked Raw Shrimp (3 HP) over Cooked Shark (42 HP), then fell through to a Void Banquet once raws ran out. Now the pool is exactly Provisions and the pick is the best heal. Verified in-browser: with only Feasts in the bag at 8/100 HP `maybeAutoEat()` returns false and consumes nothing; with Provisions present it eats Cooked Shark (HP 8→50) and leaves the Void Banquet stack at 3. Regression tests: `b168/b220: auto-eat draws from Provisions, preserves Feasts` and `b220: auto-eat never consumes buff food`.



### 2026-08-16 - SEMANTIC - Monster portrait folder: `painted/` vs `hearthfire/` (Systems -> Art/Asset)
**The disagreement, surfaced rather than silently resolved.** `docs/design/monster-art-prompts.md` §0
states new portraits land in `assets/icons-bundle/painted/monsters/` and says "no new subfolders".
The shipped art pilot (branch `worktree-agent-a4e0fed55ec269eca`, commit `04ba415`) put them in
`assets/icons-bundle/hearthfire/`. Both are shipped folders, so neither is wrong - but the
81-portrait batch cannot be generated against two answers.
**What I did:** followed the pilot (`hearthfire/`), because that is what exists on disk and it keeps
the retired-direction `painted/` set visibly separate while batch M0 regenerates it. The choice is
ONE constant - `HEARTHFIRE_DIR` in `src/data/monster-art.js`. Changing it re-points all 81 and the
preflight re-verifies. **Art Director owns the ruling; say the word and it is a one-line change.**

### 2026-08-16 - CODE - Pilot art wiring overlaps branch `worktree-agent-a4e0fed55ec269eca`
That branch adds `assets/icons-bundle/hearthfire/monsters/{barn_rat,elk_king,grim_reaper,hellhound,winter_wolf}.png`
(processed to 256x256) and parks three of them on borrowed live ids - `hellhound -> lesser_demon`,
`grim_reaper -> wraith`, `elk_king -> bear` - marked PILOT PREVIEW ONLY.
**Those three ids now EXIST.** `src/data/monster-art.js` binds each portrait to the monster it
actually depicts and gives `lesser_demon` / `wraith` / `bear` their own files back, so **the parks are
gone by construction**. On merge: take that branch's PNG bytes (this branch carries only the
unprocessed 1024px sources under `assets/art-pilot/`, which I deliberately did NOT ship - 1.2 MB
each), then add those five ids to `SHIPPED` in `monster-art.js`. `monsterArtPreflight` in
`tests/run-smoke.mjs` fails the build if that second step is forgotten, so the merge cannot half-land.

---

## [Systems Engineer → Art Director] companions.js proc/panel text below the 14.5px font floor (worker-settlement branch)

While wiring the hired-worker client to the server RPCs I surfaced a latent font-floor
violation in `src/features/companions.js` (Art-domain visual surface):

- `showProc()` (~L280) rendered the proc toast at `font-size:13.5px` — below the project's
  14.5px HARD floor. It slipped past the b227 document scan only because the toast is
  short-lived; once my new async worker test shifted suite timing, b227 caught the toast
  mid-life (`div @ 13.5px "🦊 __b420proc__"`) **deterministically**. I fixed THIS one line to
  `calc(14.5px * var(--ui-scale, 1))` (the form the rest of the UI + workers.js use) to
  unblock the suite — a clear floor violation, minimal + safe. Please confirm the visual is fine.
- Still unfixed (I did NOT touch your panel markup): the Companion panel at L589–L590 also
  uses `font-size:13.5px` (the XP line and the proc-description line). Same floor violation;
  b227 doesn't catch them today only because the panel isn't open at scan time. Recommend the
  same `calc(14.5px * var(--ui-scale,1))` conversion.
- Also noted, NOT changed: the proc toast bg/ink are hardcoded colours (`rgba(127,154,79,.95)`
  / `#0f1320`), not theme tokens — the color HARD RULE. Yours to convert when you next touch it.

Separately: the toast relies on `setTimeout(()=>el.remove(),1700)`, which the headless page
throttles so the toast can outlive its intended 1.7s. Not fixed here; a cheap hardening would
be to also drive removal off the `animationend` event. Flagging, not acting.

---

## 2026-08-29 — SYSTEMS → BACKEND (combat-XP credit lane) · a SECOND faucet now writes `player_skills.hitpoints`

Not a code conflict (no shared file — my touch is `hr_goal_rewards` rows + the goal RPC's gate), but a
**semantic** one your faucet audit should know about, filed rather than assumed.

b492 re-points the kill goals' XP from the phantom skill `'combat'` (never paid — not an `hr_skills`
row, so `hr_claim_goal` dropped it into `skipped_xp`) to **`hitpoints`**, at the Designer's retune:
kill_any **100**, kill_more **300**, wk_kills **1000**.

**What that means for your lane:** `player_skills.hitpoints` now has two server-side writers —
`hr_credit_combat_xp` (yours, elapsed-time-clamped by `hr_combat_xp_cap`) and `hr_claim_goal` (the
period-reward path). They are independent and **additive by design**: a goal reward is a bonus on top
of the XP the kills themselves already paid, and neither consumes the other's budget.

- Your `hr_combat_xp_cap` is an **elapsed-time physical-max** on the credit you accept, so a goal
  claim does not eat into it and it does not restrict the goal. I read it that way; **correct me if
  the clamp is ever re-expressed as a cap on the skill TOTAL** — at that point the two channels would
  start fighting and a legitimate goal claim could be clamped away as forged combat XP.
- The new ceiling to carry in the faucet total: **400 hitpoints XP/day + 1,000/week**, structural
  (server catalogue + `player_progress` once-guard), not budgeted.
- **`hitpoints` is ranked** (it feeds combat level and the leaderboards), which is why I did NOT
  migrate any legacy `G.skills.combat` value into it. That number was never server-authored;
  converting it would have minted ranked XP from a client artefact. `2026-08-17-cutover-import.sql`
  drops the key by name and `tests/cutover-import.mjs` C7/C8 assert it — **please keep it dropped.**

Nothing of yours needs to change today. Flagging so the number appears in your audit rather than
surprising it.

---

## 2026-08-30 · GAME DESIGNER → SYSTEMS · b495 balance audit — three semantic conflicts

**1. `workers.js` / `accrual.js`: "efficiency" does not mean what both copies say it means.**
`perTickMs = node.ms / eff(w)` uses the RAW node ms. The player runs the same node at
`actionIntervalMs()` = `pacedActionMs(ms)` = `ms × PACE.actionMs` = **ms × 1.60**. So a worker
described everywhere as "10% of your rate" produces **16%**, and a Lv10 crew of six is **1.65**
active-equivalents against the number b389's own header states it nerfed them to (1.03). Both
engines agree with each other and both disagree with the design. Ruling: anchor to
`pacedActionMs(node.ms) / eff`, on both sides in one change, and say in the header that the anchor
is the UNPERKED player (a perk-tracking anchor would make workers scale with investment, which is a
different and larger design question I am not opening before the wave). Bound by
`tests/worker-accrual.mjs`, which currently re-implements the defect faithfully — it will need the
same edit, which is the point of it existing.

**2. `hr_bounty_kill_range(p_tier)` cannot express the ruled difficulty.**
`hr_accept_bounty` CLAMPS the client's `p_required` into a tier-only range. The ruling that
difficulty must move the COUNT (`easy .90 / normal 1.00 / hard 1.20 / elite 1.50` on
`BOUNTY_KILL_COUNTS`) therefore CANNOT be shipped client-side alone: an easy tier-1 cull would ask
for 72 and be silently clamped up to 80, so the board would show a number the turn-in does not
honour — which is the exact failure the first-contract bracket's own header warns about. The two
halves ship together or not at all. `tests/bounty-drift.mjs` is the binding.

**3. "The artisan skills are the gold path" (b226 / pacing-overhaul §6.1) is true in a way nobody
priced.** The rule is right; the magnitude is not. `vendorPrice` pays FULL book value for anything
not flagged `raw`, and no bench output is flagged: `smelt_mithril` is 112,500 gold/hr full-cycle
against 23,412 for tier-matched tier-5 combat, and the generated gear ladders top out at
`craft_voidweave_body` — 108 gold of inputs, 75,600 gold at the vendor. This is not a vendor-rate
question (a uniform rate cannot fix a 700× input:output ratio); it is that generated gear values
are `slot.vmul × mat.value × line.vmul` while cloth's recipe inputs are `silk_thread: 2+i,
magic_essence: 1..2` at every tier. **The acute half is mine and is a data fix** (scale the cloth
line's inputs with the material tier); **the structural half is a joint call** on whether item `v`
for generated gear should be derived from recipe cost. Flagged now, not smuggled into the wave
build. The 25M/day `hr_day_budget_check` ceiling is the only thing currently bounding it, and it is
a security fuse, not a balance number.

**4. `hr_start_kit.farm_plots = 4` against a Wanderer's Camp that has 2 plots.**
`hr_create_character` (2026-08-14-character-bootstrap.sql §334) inserts
`generate_series(0, farm_plots - 1)` = FOUR `player_farm_plots` rows, and its §477 self-check
asserts exactly four. The client caps planting at `farmPlotCap()` → `HearthriseHomestead.maxPlots()`
→ `TIERS[0].plots` = **2**, and `plantCrop` refuses `plotIdx >= farmPlotCap()`. So a new character is
created with two plot rows they can never plant in, and `src/data/goal-catalogue.js`'s own comment
("the starting Wanderer's Camp has 2 plots") already reads the client's number.

**The client is right, and that is a design ruling rather than a preference:** 2 plots at the camp
is what makes the Homestead (400 gold + 20 copper + 30 logs) a legible, cheap, wanted first upgrade
— it doubles your farm. Creating 4 at the camp deletes the reason to buy the first rung of the
property ladder.

It is INERT today (the extra rows are invisible and unplantable), which is why I did not widen the
b495 migration to touch a second table on a wave build. It stops being inert the moment any surface
renders from the server's plot rows rather than from the cap. Ruling for whoever picks it up:
`START_CURRENCY.farm_plots 4 → 2`, regenerate, and a forward migration on `hr_start_kit` alone —
NEW characters only, no backfill (an existing character's rows are theirs).

## 2026-08-30 · SYSTEMS → GAME DESIGNER + ECONOMY · worker output drops 37.5% live (b497 anchor fix)

**Not a conflict — a NOTICE, filed because it moves a live economy number and another agent tuning
gold faucets should not discover it by measurement.**

`b389` ruled workers down to "6 x 0.172 = 1.03 active-player-equivalents", and
`docs/design/bonus-rebase.md` §244 states the model outright: worker efficiency is "a *fraction* of
[your rate], paid by a parallel producer. **It inherits `PACE` automatically** and cannot inflate."

It did not inherit `PACE`. Both engines computed `perTickMs = node.ms / eff` while a player gathers
at `pacedActionMs(node.ms)` (`PACE.actionMs` = 1.60), so the shipped crew was
**6 x 0.172 x 1.60 = 1.65 equivalents** — b389 landed 60% short of its own stated target, in the
direction of the faucet it was written to close. The guard that existed to prevent this
(`smoke-test.js` "b389: worker rebalance") asserted `6 * eff <= 1.1` — one HALF of a ratio — and was
green the whole time.

**Consequence of the fix: every crew's output falls by 1/1.60 = 37.5%** the moment `hr-accrue` is
redeployed. Hire costs, the efficiency curve and the 24h cap are UNCHANGED; no design value moved.
Anyone modelling passive gold income should use the 1.03 figure from here on, not measured b496
output.

Two follow-ups that are NOT mine to rule:
- **Is 1.03 still the intended crew size** now that it is actually 1.03? b389 chose it while
  measuring 1.65, so the ruling was made against a number the game was not paying. Designer's call.
- **`docs/design/bonus-rebase.md` §138** still describes worker efficiency as "25% → 52% of player
  rate"; b389 replaced that with 10% → 17.2%. Stale design doc, Designer's file.
---

## 2026-08-30 · SYSTEMS → LANE A / SECURITY · b497 auto-eat: the staged premise is false, and acting on it is a DOUBLE DEBIT

**Branch:** `fix/attended-eat-intent-gate` (off `cb97ae17`). **No behavioural change shipped — deliberately.**

`supabase/migrations/2026-09-04-auto-eat-at-creation.sql` (header, §"WHAT THIS DOES **NOT** DO")
states:

> the server's sim only eats during AWAY accrual. An ATTENDED auto-eat would therefore be held for
> `ENTRY_TTL_MS` (10 minutes) and then RESTOCKED by the next envelope. Free food, self-only, but real.

…and proposes a one-line client fix: re-shape `noteItemConsumed`'s gate so an attended consumption
always sends the `eat` intent, with `inOfflineReplay()` excluding away.

**The premise is false and the proposed fix is item LOSS.** Three independent proofs:

1. **Structural.** `computeAccrual` has no away input and no presence input. It prices
   `[max(accrued_to, active_since), +grantMs]` — whatever elapsed — and `fx.autoEat()` is gated on
   `autoEatEnabled` **alone**.
2. **The settle loop is ATTENDED-ONLY.** `src/net/accrue.js decideSettle`:
   `if (!st.visible) return { settle: false, reason: 'hidden' }`. The 90 s cadence
   (`SETTLE_INTERVAL_MS`) runs *only while the tab is visible* and stops when it is hidden. So every
   periodic settle prices an attended window; away time is settled on return, by a different trigger.
3. **Measured.** New guard `attendedSettleAutoEatGuard` (`tests/accrual-engine.mjs`): a fresh
   10-HP character fighting a goblin with `autoEatEnabled: true` eats **2 meals over 60 s and 3 over
   90 s**, each with the matching negative `delta.items` figure. The same window with the flag false
   pays **0 kills and dies** — which is the death loop the ruling exists to close, and is why the
   server eating attended is the *mechanism* by which an attended window is paid at all.

So with `auto_eat_enabled = true` universal, the settle already debits the attended meal. A client
`eat` intent for the same meal debits it twice. The existing gate — "send only on a definite NO from
the server" — is correct on **both** sides of the b497 flip, and retires itself with no flag to flip,
exactly as `clientOwnsAutoEatDebit`'s own RETIREMENT note anticipated.

Guarded on both ends now, so the premise cannot be re-asserted from either: `EAT-RESTOCK-6` block 2
(client — the proposed fix turns it red) and `attendedSettleAutoEatGuard` (server engine — an
"away-only" mutant turns it red while the pre-existing 12-hour parity fixtures stay green).

### ⚠ THE REAL DEFECT b497 INTRODUCES, and it is a different one — SETTINGS ARE NEVER SYNCED

Nothing on this client has ever called `hr_set_auto_eat` (grep: zero call sites in `src/`). It is the
only writer of `auto_eat_enabled` / `auto_eat_pct` / `auto_eat_food`. After b497 every new character
has the switch **on** server-side and:

- **`auto_eat_food` is NULL**, so the engine falls back to `bestHealingFood` — the **biggest healer in
  the bag** — while the client honours the player's `G.foodSlot` nomination. Unit *counts* still
  converge (pending-consume drains on the server's own movement, so nothing is lost or duplicated),
  but the two sides can drain **different stacks**, and the server's pick is the more valuable one.
  Invisible on a fresh account (the start kit holds one food); it bites the first time a player banks
  a Shark/Moonbloom stack and fights attended.
- **The Settings toggle and threshold slider are client-only.** Turning Auto-Eat off does not stop
  the server eating — and it *should not*, because with it off the server's sim dies and pays 0 kills
  (measured above). So this is a genuine design question, not just a wiring gap.

Recommendation: wire the client's auto-eat settings to `hr_set_auto_eat`, debounced — it bumps
`version` and journals a `set_auto_eat` row, so a per-slider-drag call would invalidate in-flight
accruals. **Not fixed by touching the debit gate**, and out of scope for a wave build. Systems owns
the wiring; Designer owns "may a player turn off a mechanic their payout depends on?".

---

## 2026-08-31 · SYSTEMS → DESIGNER / ART · b499 auto-eat sync: the toggle is BUILT, DORMANT, and waiting on a ruling

**Branch:** `fix/refused-hatch-and-autoeat-sync`. Resolves the wiring half of the 2026-08-30 entry
above ("THE REAL DEFECT b497 INTRODUCES — SETTINGS ARE NEVER SYNCED"), and deliberately does NOT
resolve the design half it names.

**SHIPPED ARMED — food + threshold.** `src/features/auto-actions.js` now debounces the player's
food nomination and HP threshold out to `hr_set_auto_eat`. Both only ever make the server honour a
choice the UI already claims it honours: `auto_eat_food` stops being NULL, so the engine stops
falling back to `bestHealingFood` (the biggest healer in the bag) while the client honours
`autoActions.eat.foodId`. The threshold sent is the EFFECTIVE (tier-clamped) one, so both sides land
on the same number.

**SHIPPED DORMANT — the ON/OFF toggle.** `SYNC_ENABLED_TOGGLE = false`, one line, tested in both
positions (AUTOEAT-SYNC-3 asserts the shipped position AND drives the armed one). Reason: with
`auto_eat_enabled` false the accrual engine's `fx.autoEat()` never fires and a measured night pays
**0 kills and dies at the first fight**. Pushing a client preference up therefore converts a toggle
into a total loss of overnight progress. That is the question the entry above assigns to the
Designer — *"may a player switch off a mechanic their payout depends on, and what should the game
say when they do?"* — and Systems does not get to answer it by shipping.

> ⚠ **THE RULING HAS TO COVER THE DIAL, NOT JUST THE SWITCH.** The threshold slider's minimum is 0%
> ("never auto-eat"), step 0.05, and `pct` IS synced — so a player who drags to zero already
> reproduces the same 0-kill night through a key that is live today. Arming the toggle without a
> rule for the dial is half a decision; ruling on the dial may make the toggle moot.

**ALSO FOR DESIGN — a live behaviour change lands with this build even at the dormant setting.**
Once players start syncing a food, the server's overnight accrual stops eating the most valuable
healer in the bag and starts eating what they nominated. Overnight *survival* can go DOWN for anyone
who nominates a weak Provision while holding Sharks — the server used to quietly eat the Shark. That
is correct (it is their choice, and the counts always converged), but it is a real change to what a
night pays and it is not covered by any balance pass.

**FOR ART / COPY — three player-facing strings are new or changed, all in the honest-refusal voice
established by the renown rank claim (b494):**
- `src/features/companions.js grantRefusalMessage()` — five sentences, one per refusal class, e.g.
  *"The realm has no record of your Dragon Egg, so Whelp could not hatch. Nothing was consumed —
  your Dragon Egg is still in your bag."*
- `src/legacy.js onItemTap` — tapping a Provision in the bag now routes through `setAutoEatFood`, so
  it says *"Auto-eat set to X."* (and an honest *"Auto-eat is locked — unlock it in the Store."* for
  a non-owner) instead of the old `"Auto-eat: X"` toast, which wrote a field the engine does not
  read and therefore promised something that never happened.
- `src/features/pets.js tryUnlock` — the raw `d.icon` emoji is gone from the *"A wild friend!"* line
  (Final Directive no-emoji-as-art, the same fix companions.js took in b465).

---

## 2026-08-31 · Systems Engineer — E1, the ammo spend (branch `fix/ammo-consumption`)

Three things surfaced that are **not** the Systems Engineer's to rule on. All three are wired,
measured and pinned by named tests; none of them is shipped as a behaviour change.

### 1. SEMANTIC (Systems → Designer): `AMMO_STYLES` answered two questions with one table

`src/core/ammo.js` shipped one frozen table, `AMMO_STYLES = {ranged:true, magic:true, sword:false,
hammer:false, neutral:false}`, and `spendForSwings` gated the SPEND on it. That is R5's first half
("melee's floor is free") applied to the wrong question, and the cost is measurable: a melee player
could equip a Dawnsteel Whetstone (+18 strB, `v` 990, `ammoPerShot: 0.02`) and **wear it forever for
nothing**, while §6.3 prices that stone at 240 a night / 15,840 g of input. The design's own words
are "melee's FLOOR is free; melee's CEILING is paid" — two questions.

**Resolved in the engine as two tables** (`AMMO_SPEND_STYLES` = who pays, `AMMO_STYLES` = who suffers).
`styleNeedsAmmo` keeps its exact published meaning, so no existing consumer moves. This implements
the ruling as written; it does not change a value. Flagged because if the Designer intended melee to
be exempt from *spending* too, the whetstone ladder needs a different sink and §6.3's parity
arithmetic is void.

### 2. DESIGN + LEGIBILITY (Systems → Designer + Art Director): the mechanic is OPT-OUT today

An ammo-hungry style with a **completely empty** ammo slot fights at **full strength**. `ammoDamageMult`
cannot tell a loaded free tier-1 rung from an empty slot, so `perShot === 0` reads as "supplied".
Measured on the real catalogue (`playerCombatRolls`, Ranged 99, Duskwood Bow):

| loadout | maxHit |
|---|---|
| `dawnpoint_arrows`, supplied | 69 |
| `dawnpoint_arrows`, run dry | **17** (x0.25, floored) |
| **no ammo equipped at all** | **58** |

**Not equipping is 3.4x better than running dry.** The dominant play is an empty quiver, which is the
whole mechanic opted out of — and R2's own wording is the other way ("you can still train ranged or
magic with NO arrows/runes, it is just very very weak").

**NOT flipped in this commit, on purpose.** §14 hands the Art Director "the empty-quiver state must
read on the equip doll and in the combat panel — a player fighting at x0.25 who cannot see why is a
support ticket", and that indicator does not exist. Shipping the cliff before the sign turns a
correct mechanic into a bug report. The engine is one frozen boolean from closing it:
`AMMO_EMPTY_SLOT_IS_DRY` in `src/core/ammo.js`, pinned in both directions by `AMMO-E4`.

**Owners:** Designer rules the position; Art Director owns the indicator; Systems flips the constant.
They should land together — and now they MUST. Security (A1, 2026-08-31) made the coupling a build
condition rather than an intention: `AMMO-E4` asserts `AMMO_EMPTY_SLOT_IS_DRY === true` implies the
literal token **`hr-ammo-dry`** appears in a rendered surface under `src/` (outside `src/core`). The
name is Systems' so the guard has an anchor; the MECHANISM is the Art Director's — a CSS class, a
`data-` attribute, a glyph key, a render helper, anything that carries the token. It is an
IMPLICATION, so the indicator may ship FIRST and alone; only penalty-without-sign goes red.

### 3. DESIGN (Systems → Designer): an EMPTIED slot keeps its stats

`equipmentStats` sums the ammo item's bonuses off the **equipment map**, and §2.2's slot is a POINTER
that survives its stack reaching zero. So a burnt-out whetstone still pays +18 strB forever. For
ranged/magic the x0.25 makes it irrelevant; for **melee**, which by R5 takes no depletion penalty,
one stone buys a permanent bonus and the consumption is a rounding error on the way there.

Not a regression (before E1 the stone was never consumed either), but it is the half of "melee's
ceiling is paid" that consumption alone cannot close. Closing it means teaching the STAT layer about
stock — threading inventory into `equipmentStats` / `playerCombatRolls`, the one function both
engines share and every loadout's numbers run through. A deliberate change with a ruling attached,
not a drive-by. `AMMO-E5` pins today's behaviour in both directions, so the fix arrives as two
expected, named failures.

---

## SEMANTIC (Systems ↔ Systems): two lanes are fixing ONE class on two surfaces — `fix/gem-spend-server-backed` (2026-09-04)

**The class:** *residue asserting ownership of a server-sold capability.* A sibling lane is fixing it
in `src/net/property-record.js` (the residue-ahead property tier that refuses the Forge's
`prereq_property_tier` and hides Farmstead). This lane fixes the SAME class for gem-bought unlocks —
`ownedThemes` / `ownedCosmetics` / `G.bank.gemBuys` — and the resolution shape is deliberately the
same one `multi-character.js ownsSlot()` established: **the server's projected set wins when there is
one; the residue answers only while the server has not spoken.**

**No code conflict.** This lane touches `src/legacy.js`, `src/render/shop.js`,
`src/features/smoke-test.js`, `src/net/gem-sites.js` (new), `tests/gem-site-census.mjs` (new),
`tests/gold-site-census.mjs` (one exclusion row) and `tests/run-smoke.mjs` (one guard registration).
It does **not** touch `src/net/property-record.js` and, per the dispatch, it does **not** touch
`tests/property-gate-census.mjs`.

**The semantic question for the Coordinator to rule on:** the property lane and this one now each own
a *"is this capability really mine?"* seam (`property-record.js` vs `ownsGemUnlock`). They should
eventually be **one** rule — "a residue entry never confers a server-sold capability" — with one
census behind it. Merging them now would couple two in-flight lanes; merging them never leaves the
next surface (companions, traits, recipes) to rediscover it. Recommend: land both, then a follow-up
that folds `ownsGemUnlock` into whatever `tests/property-gate-census.mjs` becomes. Flagged rather
than resolved unilaterally.

**HAZARD THE MIGRATION LANE MUST NOT MISS.** `ownsGemUnlock` prefers the server the *moment* a
projection exists. The day an `hr_state_of` projection of gem unlocks ships, every theme and cosmetic
not in the server's rows stops being owned — for everybody, instantly. The migration MUST seed the
unlock rows from existing `client_state.ownedThemes` / `ownedCosmetics` before it starts projecting.
Written up in full at the head of `src/net/gem-sites.js` (`GEM_GRANDFATHER_PRECONDITION`). The same
hazard applies to the property lane's projection and is worth checking there too.

---

## 2026-09-06 — Systems Engineer · attended-death P0 (`worktree agent-a2d6d4904531de04a`)

**What this lane changed.** An attended death no longer calls `stopCombat()` (which declares
`idle`, and hr_apply stamps `accrued_to = now()` on any `activity` delta — so the window the death
happened in was closed before anything simulated it). The client now PAUSES the swing, keeps the
pointer, notes a settle event, and renders the server's answer. Files: `src/legacy.js` (death
branch + tick gate + `hrKnockOut`/`hrCombatDown`/`hrStandUp`), `src/net/accrue.js` (fall-state
machine + `accrued_to`/`deaths_today`/`deaths_lifetime` observers), `src/features/death-sheet.js`
(renders the envelope, never a client guess), `src/features/smoke-test.js` (RECOVER-10),
`tests/attended-fall.mjs` (new), `.github/workflows/smoke.yml` (one step).
**No `supabase/**` change. No `src/core/**` change. The edge does NOT need redeploying for this lane.**

**SEMANTIC OVERLAP with the `agent-a9c422306456b86bd` lane (cadence recovery floor /
not-in-combat cap).** That lane's live evidence — `11:41:38 xp_credit, credit 40, elapsed_ms 52742,
meta.active_kind "idle", kind_mismatch true` — is the DOWNSTREAM SYMPTOM of the bug this lane fixes:
the death declared `idle` at 11:40:45, and the attended cadence RPC then billed 52 s of wall time
against a pointer that said idle. The two changes are complementary and must both land:

  * this lane removes the CAUSE (the pointer no longer moves on a death);
  * that lane caps the EFFECT (a cadence RPC may not bill past the switch instant), which is still
    needed for every other way a pointer can go idle, and for a forged client.

**Check when integrating:** with this lane in, a knocked-out character's pointer stays `combat`, so
the not-in-combat cap will NOT fire during a recovery — the RECOVERY FLOOR is what must refuse that
window, and it does. If that lane ever makes `recovering_until` also idle the pointer, the two
disagree and the run would stop again; it must not.

**Standing P2 raised, not fixed here (needs Security, not me).** `collectCurrentWindow`
(set-activity.js) refuses a window under `ACCRUE_MIN_MS` (60 s) with `below_min_span` and writes
nothing — but the switch that follows stamps `accrued_to = now()` regardless (hr_apply S5). So ANY
activity switch inside 60 s of the last watermark silently FORFEITS up to a minute of earnings, with
no ledger row and no `forfeited` receipt (that receipt exists only on the C3 force-close path).
Measured on the live gate: 19 s window, hp untouched, `accrued_to` advanced to the death instant.
Off the death path now, but still true of every fast stop/start. Cheapest honest fix: journal it, by
extending `forceCloseWindow`'s ledger row to the `below_min_span` case. Lowering the floor is
Security's call and has been refused before (see `ACCRUE_MIN_SPAN_MS`'s comment in src/net/accrue.js).

---

## 2026-09-07 · SYSTEMS → GAME DESIGNER · b521 · **BURY IS NOW A SERVER BENCH — and it inherits a tier-4 gate** (`worktree-agent-a4bd50bfbdabbad36`)

**What changed.** `buryBones()` (src/legacy.js) was `removeItem(id,n)` + `addXp('prayer', it.buryXp*n)`
with no intent, no RPC and no settle — a client-authored XP grant AND a client-authored inventory
debit (CLAUDE.md §1). paione, 2026-09-07: *"I got like 2k bones which I can bury a gazillion times
and get the exp and keep the bones."* Server facts confirm it: prayer XP 47,802, bones 2,027, and
**zero** bury intents or ledger rows in 7 days. The gesture now starts the existing server-settled
`bury_bones` artisan run (`ARTISAN_SETTLEMENT.prayer === 'payable'`; the engine prices it —
`tests/artisan-accrual.mjs` reports `bury_bones (prayer) · 22500 actions · {bones:-22500} ·
{prayer:22500}`). Two inline client-authored fallbacks (inv-context-menu.js, item-ux.js) were
deleted with it, and the dead `applyRichCatchup()` was collected.

### ⚠ FOR THE GAME DESIGNER — a design consequence I did NOT decide (P1)

Routing Bury onto the bench necessarily adopts **every gate the Prayer screen already enforces**,
and one of them is expensive:

| gate | source | effect |
|---|---|---|
| **Shrine workbench** | `WORKBENCH.prayer = 'shrine'` (src/features/homestead.js:84); the Shrine is in the **tier-4 `Ironvale Keep`** room list (40,000g + 50 maple planks + 35 steel bars + 20 big bones + 5 bear pelts + 12 ashlar) | a player below tier 4 **cannot bury at all** |
| prayer level | catalogue rows: `bury_bones` req 1, `bury_big` req 15, `bury_dragon` req 35 | dragon bones now need Prayer 35; they needed nothing before |

**This is not a capability I removed — it is a capability that was never real.** Below tier 4 the old
button granted XP that evaporated on the next reload; the Prayer *skill screen* has always refused
the same players with "Build the Shrine at your homestead first". The fix makes the two surfaces
agree, and states the requirement on a **disabled** button before the click (the same shape as
b224's "Already at full health") instead of a live button that refuses after it.

**The open question is yours, not mine:** *should burying bones require a tier-4 property at all?*
The measured argument that it should not: **the server does not enforce it.** The catalogue row is
`('artisan','bury_bones','prayer',1,null,false)` — level only, no room — and `benchPayable('prayer')`
is true, so a declared bury is settled whether or not a Shrine exists. The Shrine gate is a
**client-only rule the realm does not share**: the mirror image of the residue-ahead class
(CLAUDE.md §6). Cooking already has the precedent for relaxing exactly this (b225, the campfire
ruling: `UNGATED = { cooking: true }` — "they can cook with the fire in the first tier camp").

If you rule prayer ungated it is a one-word change — `var UNGATED = { cooking: true, prayer: true };`
— **plus** the smoke assertion that currently pins it (src/features/smoke-test.js ~L2186:
`['smithing','crafting','prayer'].forEach(s => assert(H.hasWorkbench(s).ok === false))` and
`assert(!H.UNGATED.prayer)`). I did **not** touch either: that assertion says the gate is a decision
somebody made on purpose, and a balance ruling is not a systems fix. Prayer XP rate and the Shrine's
value proposition are yours.

### Smaller flags

* **Two numbers for one thing.** `ITEMS[id].buryXp` (4.5 / 15 / 72) and the recipe's `xp`
  (4.5 / 15 / 72) agree today and nothing binds them. Every surface I touched now reads the
  **recipe**, because that is what the server prices; `buryXp` survives only as the "is this a bone"
  predicate (bag filters, glyph routing, the `bones` category). A guard binding the two is cheap if
  you want it.
* **`G.stats.buried` is deleted.** One writer (the mint), one reader (`wk_bury`, which carries
  `blocked:` and is therefore never dealt). `BENCH_COUNTERS` (src/core/artisan.js) has no `prayer`
  row and `tests/artisan-accrual.mjs` asserts the counter loop must not invent one, so nothing
  stamps a burial count client- OR server-side. `wk_bury` stays blocked; unblocking it is lane C
  (add the BENCH_COUNTERS row + catalogue the goal + delete `blocked`, one build).
* **The gesture is a RUN, not a stack burn.** 2,027 bones is ~40 minutes of bench at 1.2 s/bone
  (and it accrues while away). If you want burying to be faster than a smelt, the `ms` on the three
  prayer rows is the dial — it is data, and it is yours.
* **Not a rank exploit, and never was.** Leaderboards read server XP, which never moved.

## 2026-09-07 — MERGE DEFECT found on the assembled tree (`21f3b5bf`): a bare `setActivityIcon`

**Two individually-correct lanes, one broken screen.** The icon-extraction lane (slice 8b step 1)
moved `setActivityIcon` out of `src/legacy.js` into `src/render/icons.js` and rewrote every call site
it could see to `HearthriseIcons.setActivityIcon(...)`. The knocked-out P1 lane added a SIXTH call
site — the `Knocked out — back on your feet in Nm` branch of the activity bar — after that census was
taken, as a bare `setActivityIcon(...)`.

On the merged tree that line throws `ReferenceError: setActivityIcon is not defined` on **every
repaint of a knocked-out player's activity bar**: the countdown never renders and
`refreshPanelProgress()` below it never runs. It is the exact surface the recovery lanes were built
to give the player. `RECOVER-17` was RED on the assembled tree because of it.

Fixed here (`src/legacy.js:12487`). Swept the whole namespace — `actIconHtml`, `paintSkillIcons`,
`paintMonsterIcons`, `installIconLayer`, `setActivityIcon` — and this was the only survivor.

**The class is open and belongs to whoever owns the next extraction slice.** A bare call to a name
that has left `legacy.js` is invisible to every guard we have: `dead-exports` reads exports,
`window-globals-exist` reads `window.Hearthrise*`, and a `ReferenceError` only fires on the code path
a test happens to drive. Every remaining slice-8 extraction (inventory, combat, progress, refreshAll)
can reintroduce it. **Wanted: a bare-identifier census over `src/legacy.js`** — every free identifier
that is neither declared in its own top-level segment, nor a `window.*` publication, nor a browser
global. Not built here; it is its own lane, not a line in a ratchet fix.

## 2026-09-07 — CR-1 (comment-ratio ratchet) fought the cleanup program; re-specified

Recorded because it is a DECISION about a standing guard, taken without the guard's author present.
CR-1 shipped as a whole-file ratio ceiling (`comment/code <= comment/code at baseline`). That
predicate goes red when CODE IS DELETED, which is what most of the CLEANUP_PROGRAM does. Two
measurements on the tree it first gated:

  * `src/settings-page.js` — a lane replaced 11 lines of rendering with 7 better ones. Comments
    UNCHANGED at 371; code 986 -> 982; ratio 0.376268 -> 0.377800. **RED with nobody having written a
    word of prose.**
  * `src/legacy.js` — the icon extraction moved 1,044 lines out, which MONO-1/4/5 in the sibling
    ratchet reward. The extracted unit was code-denser than the file average, so the remainder got
    proportionally wordier: 0.703794 -> 0.710681. The extraction moved CR-1 the wrong way (+0.006887)
    by MORE than the build's new prose did (+0.005269). **Two guards authored in one commit,
    disagreeing about the same commit.**

Re-specified to the marginal form — `comment_now <= comment_base + rate * max(0, dCode)` — which is
arithmetically IDENTICAL to the old rule wherever code grew (asserted in `--selftest`) and differs
only in the shrink case. Adding prose to a file you are shrinking is still red; so is leaving prose
behind when its code is extracted. `--write` pins the rate only DOWNWARD so the change cannot
compound. Nothing was re-baselined upward to get green: the actual prose debt in `accrue.js`,
`record.js`, `home-dashboard.js`, `smoke-test.js` and `settings-page.js` was paid, not waived.

## 2026-09-07 — TF-1/TF-2 (test-file ratchet): a corpus AVERAGE is not a ceiling

Same species, stated for the record. A ceiling on the mean is unsatisfiable by any honest test above
the mean: add one and the mean rises, so the only compliant test is a leaner-than-average one, and
each such test drags the mean down so the next must be leaner still. It went red on its first real
build — ten tests carrying the ATTENDED **and** AWAY arms CLAUDE.md §4 requires. Re-specified to CODE
lines per test (comments stripped by the sibling ratchet's own `classify()`, imported so the two
cannot disagree), an absolute +1% band, and `--write` pinning only downward so the band is spent once
rather than renewed. TF-3 ("may not be satisfied by deleting tests") is unchanged and is now proven
at the band's edge as well as at one test.

## 2026-09-07 — the daily-task OFFER gate now diverges from the PERMISSION gate (semantic, deliberate)

The game-designer ruled that smithing and crafting are not gated on the Forge/Workshop: a level
grants permission, a room grants speed and quality. The client gate is gone — `UNGATED` covers all
four benches, `hasWorkbench` answers ok for every skill, and the refusal branch, the tile lock chip,
the "Gates: <Skill>" room fact and the "Required for Smithing/Crafting" copy are deleted rather than
disabled.

`DAILY_TASK_REQUIREMENTS` in `src/data/goal-catalogue.js` was left EXACTLY as it is by the same
ruling, so `daily_smith` and `daily_craft` are still only OFFERED to an account that owns the room.
That is an offer gate standing next to no permission gate, and the two now say different things
about the same room. It is defensible — a 40-item daily with no speed rungs is a bad deal, not a
padlock, and the recipes themselves are open either way — and it is NOT free to change: the twin
lives in `2026-08-29-daily-task-eligibility.sql` and `tests/goal-catalogue-drift.mjs` binds all four
copies, so relaxing it is a lane-C migration plus the client half. Recorded here so the next reader
does not "fix" one side alone; the divergence is written into that table's own comment too.

Also recorded, because it is not mine and it blocks the gate: `monolith-ratchet`,
`comment-ratio-ratchet` and `test-file-ratchet` are ALREADY RED on `main` at `0d9f12ab` — measured on
a pristine `git archive HEAD` tree, before this branch exists (legacy.js 21299 against a 21132
ceiling; smoke-test.js 64 comment lines over allowance; corpus b-lines 4201 against 4174; seeds/test
2.072 against a 2.060 band). The baselines were pinned at tree `762a1672` and `main` has moved past
them twice since. This branch improves every one of those numbers and clears none of them.

## 2026-09-07 · SYSTEMS → GAME DESIGNER (copy/ruling) + ART DIRECTOR (bar/sheet) · **SEMANTIC: after a reload, a RETREATED player is shown an ordinary knockout** (`worktree-agent-a4fe88a314834df6b`, RETREAT-A4)

Not a git conflict. Two rendered surfaces now genuinely reach a state the ruling has not worded,
and I have deliberately NOT decided it.

**Background (mine, and it is fixed).** Measured 2026-09-07 against the real `hr_load` boot path:
a retreated character reloading came up `fallState().phase 'up'`, `recoveringUntilMs() 0`,
`G.consecFalls undefined`, bar reading "Idle — pick an activity", no sheet. Cause:
`applyEnvelopeState` runs only on `accrued:true`, and a retreat ALWAYS leaves the pointer idle, so
the boot is answered `{accrued:false, reason:'idle'}` and the whole fall observation was skipped —
b510 through the idle-boot door, plus a durable retreat counter that a reload erased. Fixed by the
shared-reconcile pattern (`reconcileFall` in `src/net/accrue.js`, called from `record.js` settle as
`hydrationStep('fall')`), which is the fifth instance of the class record.js already names.

**What is now OPEN, and it is the Designer's to rule on.** With the fix in, the reload raises the
sheet — and the sheet says **"Knocked out / Back on your feet in 31:47"** with a row reading
**"Your run picks up the moment you are up · automatic"**. On a RETREAT that row is false: the
server idled the pointer and the run does not pick up. It is the same defect RETREAT-A6 exists for
("the countdown must not un-say the retreat"), reached through the boot door instead of the tick.

`src/features/death-sheet.js` `readMoment()` records a deliberate decision NOT to claim a retreat
on a boot-raised sheet — "re-deriving it here from a count and a bag would be a second copy of the
rule, and the second copy is the one that is wrong" — and I agree with the reasoning and did not
overrule it. But there IS a server-stated way to tell the two apart without re-deriving anything:
after a retreat the envelope carries `active_kind: 'idle'` **and** a running `recovering_until`,
where an ordinary knockout still carries `active_kind: 'combat'`. That is an observation, not a
second copy of the rule. Whether the boot-raised sheet should then read "You pulled back" is copy,
and copy is the Designer's.

**What I did do, and why it is the smaller half.** The activity bar's knocked-out readout lived
inside `if(G.activeMonster)`, so a retreat (idle pointer) fell through to "Idle — pick an activity"
— inviting a player who cannot act for 32 minutes to start something. I gave it its idle twin in
`refreshActivityBar` (`src/legacy.js`) with a meta line that deliberately does NOT reuse the combat
branch's "<foe> resumes automatically": **"Nothing earns while you recover · your run does not
restart itself"**, which is the ruled retreat lead's own fact. That sentence is provisional and is
flagged here rather than defended — it is one string in one branch and is free to be rewritten.

**Second, smaller open item (Designer/Coordinator, not blocking).** `bootAccruedToAt` — the
welcome-back card's statement of how long the player was away — is written by the FIRST
`state.accrued_to` the session observes. I deliberately left `accrued_to` OUT of the shared
`reconcileFall` so the boot `hr_load` body does not become that first observation, because it would
change a player-visible number on a surface this change has no business touching. Arguably the boot
body is the MORE correct source ("the last instant the server had priced before this boot" is
literally what `player_state.accrued_to` is at boot). Someone should decide that on purpose; today
it is unchanged by design.

## 2026-09-08 · SYSTEMS → GAME DESIGNER (copy only) · **RESOLVED, one string left provisional** (`worktree-agent-a66d4bb2c074fad34`, RETREAT-A4b/c/d)

The open item above ("after a reload, a RETREATED player is shown an ordinary knockout") is CLOSED.
The Coordinator's 2026-09-08 brief ruled it: the boot-raised sheet reads exactly what the server
says. `bootRetreat` in `src/features/death-sheet.js` takes the server's own `consec_falls`
(hydrated by `reconcileFall`) to `src/core/away.js` `retreatAtFall` — the one definition both
runtimes import — and asks which rung it is at; fed (6) is tested first because it is the weaker
condition, so only a count that misses it can be the foodless rung's. No bag is read, nothing is
counted, an absent key claims nothing (RETREAT-A4d), and a character still pointed at a fight is
never a retreat whatever the count reads.

**The one thing that is copy, and it is provisional.** The sheet's `resume` row read "Your run
picks up against the <foe> the moment you are up · automatic" unconditionally — false on a retreat
for the same reason RETREAT-A6 removed the promise from the lead. It now reads, on a retreat only,
**"You pulled back — your run does not restart itself · ended"**. That is one string in one branch,
written to state the ruled lead's own fact rather than to leave the slot silent (a sheet that goes
quiet about the pointer lets the player assume the reassuring answer). Rewrite it freely; the row
key `resume` and the suppression are the load-bearing parts.

RETREAT-A4's own assertion moved with it: the boot sheet counts the same server instant down in the
ruled sentence ("Still recovering — 32m to go") instead of "Back on your feet in 31:47".

## 2026-09-12 · SYSTEMS → GAME DESIGNER + BACKEND (catalogue lane) · **DATA: 31 equippables are gated by the client and by nothing on the server** (`worktree-agent-a5150572edeb72e85`, lane/b538-wield-grandfather-server-truth)

Found while deleting `G.wieldGrandfather` (the client-held wield exemption). Not a git conflict and
not blocking that fix — the divergence is in the FAIL-SAFE direction — but it is one rule living in
two places with two different answers, and only one of them is authority.

**Measured.** 237 equippable items in `src/data/items.js`: 191 carry both `tier` and `reqLv`, 5 carry
`reqLv` only, 10 carry neither, and **31 carry `tier` and no `reqLv`/`reqSkill`** (the classic
hand-authored plate — `iron_helm`, `steel_helm`, `iron_platebody`, `steel_platebody`, `bronze_belt`,
`leather_boots`, …). `gearWieldReq` (src/legacy.js) derives a requirement for those from the tier
ladder `_TIER_WIELD_LV` (Bronze 1 → Dawnsteel 88) and a skill from the item type, while
`tools/gen-catalogues.mjs` copies `it.reqLv` **verbatim** — so `hr_items.req_lv` is NULL for all 31
and hr_apply §EQUIPMENT accepts them at any level. The client refuses what the realm permits.

**Why it is not urgent, and not mine to close.** Nothing is minted and nothing is lit that the server
refuses, so this is not the residue-ahead class — it is its mirror image, and it costs a player a
piece of gear they could legally wear rather than a bounced press. Closing it means authoring
`reqSkill`/`reqLv` on those 31 rows (the designer's values) plus a catalogue regeneration and apply
(lane C, with a `live-hash-drift` re-measure). Two ways to land it: author the rows to match the tier
ladder (the design as ruled at b246, and what the client does today), or drop the ladder fallback and
let the catalogue be the whole answer — which makes those 31 wearable at level 1.

**What the client does now, for the record.** `canWield` reads the requirement against the
server-mirrored skill level and nothing else; the rationale, the refusal code and this divergence are
documented at `src/net/equip.js` §THE GATE.

### RESOLVED 2026-09-12 (`worktree-agent-a0f093d217a6b3589`, b542) — option 1, by game-designer ruling

The designer took the **first** of the two ways: author the rows to the tier ladder. `reqLv` = the
shipped rungs, tier 1..8 → **1/15/30/45/60/75/88/88** (tier 8 *shares* 88 — two live tier-8 rows
already sit at 82/88 and opening a rung above would nerf gear somebody wears). `reqSkill` = the skill
the item's power serves: armour and jewelry `defense`, a weapon its own style, an item whose only
effect feeds one non-combat skill that skill (`bone_earrings` → `prayer`), and an item with no combat
stat and no faucet `reqLv: 1` (`tally_ring`, `pathfinder_studs` — they sell *information*).
Landed as **34 rows**, not 31: the census missed three riders with no `tier` at all (`iron_arrows` →
ranged 1, `chief_blade` → attack 15, `captains_ribblade` → attack 30).

**The census also under-stated the severity, and that correction matters.** It reads "not urgent,
fail-safe direction". True for 25 of them. Not true for the six **tier-8** rows: `_TIER_WIELD_LV` is
indexed 1..7, so `_TIER_WIELD_LV[8]` is `undefined`, `|| 0` makes it 0 and `gearWieldReq` returns
`null` — `regent_helm`, `slagheart_platebody`, `abyssal_greaves`, `warden_girdle`,
`choirbone_gauntlets`, `wyrmgilt_mantle` were ungated on **both** sides, and all six are **tradeable**.
A level-1 account with gold could buy 120 defence off the market. That is a live P1 on a shared
surface, not a tidy-up.

**Root cause, fixed at the root.** The b215 backfill in `src/data/items.js` copies `tier`/`rarity`
from the generated twin in `gear-tiers.js` and stopped there; 17 of the 34 have a twin whose fields
already ARE the ladder, so the backfill now copies `reqSkill`/`reqLv` too (`== null` only — a
hand-authored gate always wins). The remaining 17 are hand-authored beside their stats.

**Landed:** data + the b215 backfill extension, the regenerated catalogue, `EQUIP-REQLV-1` in
`src/features/smoke-test.js`, and `supabase/migrations/2026-09-12-equippable-req-lv.sql` (STAGED, NOT
APPLIED — **needs a Security GO**; it changes what the realm refuses on a tradeable surface). No
`canWield` edit and no `_TIER_WIELD_LV` change: the client already read an explicit `reqLv` in
preference to the array, so the data alone converges both readers. The `src/net/equip.js` §THE GATE
"ONE KNOWN DIVERGENCE" note is updated in the same commit — it was the record of this entry and would
otherwise have outlived it.

---

## 2026-09-13 — consumable buffs step 2: three semantic notes, one of them a live gap

**systems-engineer, branch `worktree-agent-a26409ea8bdf37b34`.** The eat path now emits
`buff_apply` and the pill is the envelope. Three things cross another owner's line and are
recorded rather than decided here.

**1. AUTO-EAT DOES NOT BUFF, and that is a ruling I had to make to ship safely.** The brief said
"when the eaten food has a buff, emit `buff_apply`". Taken literally that is a P0: fifteen
`foodClass:'healing'` rows in `src/data/items.js` carry an incidental buff (Cooked Herring's +1%
gather speed, Goldgill Steak's +2% drop rate) and the auto-eater eats *exactly that pool*, up to
20 sends/min through legacy.js's paced FIFO. Every heal would buff, the 60-minute queue would cap
inside ~90 s of a hard fight, and every auto-eat after that is refused `buff_at_max` — **a refusal
that rolls the whole apply back, so the food is never debited and returns on the next envelope**:
the b467-b479 "food I eat gets restocked" P0, reintroduced by a feature. So the `eat` intent now
carries a boolean `auto` (`request.js readAuto`) and the server suppresses the buff for it, which
is also exactly what the client paints either way — `maybeAutoEat` heals and never calls
`applyBuff`. The flag can only make the answer *smaller*; a forged `auto:false` grants a buff the
player could have had by clicking Eat on food they already own. **Game designer:** the live
consequence is that a manual eat of those fifteen healing foods now pays a real (small) buff that
has always been on the tooltip and has never been paid. If that is unwanted, the change is one
line in `eatDelta` (gate on `foodClass === 'buff'`), not a sweep.

**2. THE HOMESTEAD CELLAR'S `buffDuration` BONUS IS NOW INERT, and it was always inert where it
counted.** `src/features/homestead.js` registers `homestead.cellar` with `registerBuffScaler`, which
lengthens a buff at *application* time — on the client. The server stamps `until` from
`hr_item_buffs` x `c_buff_scale` (= 1), so the envelope shortens the buff the Cellar lengthened,
within the eat's own round trip. Nothing real was lost (every yield is server-computed; the longer
client duration only ever moved a prediction), but a room the player paid for now visibly does
nothing. **Backend + designer:** the fix is server-side — `c_buff_scale` is named in
`2026-09-13-consumable-buffs.sql` as "the ONE place a future perk would lengthen a duration", and it
needs the perk to reach `hr_apply`. Not attempted here (a migration + Security GO).

**3. I fixed another lane's file.** `supabase/migrations/2026-09-13-consumable-buffs.sql` ended on a
prose comment, which `tests/run-smoke.mjs migrationGuard` reads as a truncated file — **the whole
suite was red on it** ("last line is not a SQL terminator"). The §5 note is moved into the header
verbatim; the file now ends on `end $mig$;`. No SQL changed.

---

## 2026-09-13 — bestiary charms phase 2: the DROP half is armed, the DAMAGE half is not

**systems-engineer, branch `worktree-agent-abe88c834e52d3cf6`.** `charmDropMultFor` is now read
inside `weaknessInfo` — one expression, two callers (the live tick and the Edge replay) — so a
studied class pays 1.01/1.02/1.03 on its drop ROLLS at 100/500/2000 class kills, awake and asleep
alike. Two things cross another owner's line and are recorded rather than decided here.

**1. I DID NOT ARM THE `dmg` COLUMN, and the reason is arithmetic, not caution.** The ladder authors
`dmg` 1.01 at rank 3 and 1.03 at rank 4, but `playerCombatRolls` applies `weak.damageMult` through
`Math.floor` on an ALREADY-INTEGER `maxHit`: `floor(25 x 1.01)` is 25. Arming it today would ship a
stated effect that does nothing for most loadouts — the "no placeholders or fakes" line — and the
data module's own header calls it phase 3 with its own review. **Game designer:** if the damage half
is wanted, it needs either a bigger magnitude or a maxHit expression that does not truncate
(carrying the fraction into the roll rather than the cap). The wiring is done: it is one factor in
the `damageMult` product, under `MAX_TOTAL_DAMAGE_MULT`, and nothing else moves.

**2. A DROP-RATE CHANGE IS AN ECONOMY CHANGE, at +3% on non-guaranteed rows at the ceiling.**
`effectiveDropChance` still caps at 0.95 after every multiplier and still returns `ch >= 1`
untouched, so a charm cannot turn one certain drop into two (asserted: A11 in
tests/attended-loot-credit.mjs). The magnitudes are the Designer's own authored table and can be
re-priced in `src/data/bestiary-charms.js` alone — no engine change, because the ceiling lives in
the formula. **Security:** the rank is never a wire value. There is no request field for a rank or a
kill count (`INTENT_KEYS`), the Edge folds `hr_bestiary_of`'s own rows inside the engine, and
tests/accrual-engine.mjs CHARM-W4 byte-compares 32 forged input shapes against the clean delta.

---

## 2026-09-14 — SEMANTIC CONFLICT: the START-KIT hint discard vs the deleted factory literal
**Lanes:** `worktree-agent-a6a742b766b7e073e` (START-KIT sweep) and the inventory-flip staged-arm lane. Both are already merged into `next`; nothing is broken today, and this is a note for whoever owns the bag next, not a request.

`reconcileInventory` gained a once-per-load rule that, on a COMPLETE envelope, discards a `START_INVENTORY` id whose local figure is still EXACTLY the hint. It was written against the fresh-`G` factory literal `inventory:{turnip_seed:5,carrot_seed:3,shrimp:10,cooked_shrimp:20}` — which the flip lane DELETED in the same day's set (`src/legacy.js`; the bag now starts `{}`). Its own tests stage `G.inventory` explicitly, so they still pass, and they do.

**What changed underneath it.** With the literal gone, an exact-hint local figure can no longer be client-authored — it can only have come from the server (a new character whose `hr_start_kit` rows say exactly 5/3/10/20) or from real play landing on the same number. So the rule's remaining reachable effect is to DELETE-on-omission a stack that may be real, for four ids, once per load. It is bounded and small; it is also the never-delete rule being broken for a phantom that no longer exists.

**Recommendation (not taken unilaterally, because the code is the other lane's):** retire the `START_INVENTORY` block in `reconcileInventory` and let the classification carry it — `turnip_seed`/`carrot_seed` are now OWNED (so a complete envelope's omission means zero once the flip arms), `shrimp` is owned and `cooked_shrimp` is server-consumed. Until then it is harmless-but-unsound, and it is the second rule in one function that may remove a key.

**RESOLVED 2026-09-14 (Security condition 8), narrowly:** the block now opens with `if (!serverOwnedItem(id)) continue;`, so it can no longer reach an EXCLUDED id — `cooked_shrimp` was the live case, and deleting a dish on an omission is the loss the exclusion exists for. The block is kept, not retired: its owned half (the seeds, `shrimp`) is still the narrowest fix for a server row that is DELETED at zero. `INV-STAGE-10` measures the block's own receipt (`written.startKitHintDropped`) rather than the bag, because a dish also leaves the bag by the phantom-food rule and that would have made the test pass for the wrong reason.

**Also recorded:** `INVENTORY_ARM_STAGE` ships `'off'`, so none of the above changes behaviour for a live player today.

---

## 2026-10-11 — SEMANTIC CONFLICT: the bag goes ABSOLUTE (b568, lane/b568-absolute-bag) — Security must see it before the cut
**Lane:** systems-engineer, `lane/b568-absolute-bag` (on `lane/b568-intent-conflict-phantom`). CLAUDE.md §6 class-kill of the merge-upward bag.

**What moved.** `INVENTORY_ARM_STAGE = 'on'`; `isInventoryAbsolute()` no longer reads the per-session equip ack; the ARMED branch of `reconcileInventory` is now "the bag IS the projection" (no completeness gate, no not-owned omitted-keep carve-out); the MERGE branch assigns every key it names (no `Math.max(have, q)`); named skill XP is assigned (no `Math.max(have, xp)` carve-out). Guard: `tests/no-upward-merge.mjs` (+ `--selftest`, five mutants).

**Why it crosses Security's line.** The C2/C3 carve-outs and the completeness gate were reviewed as "never delete" rules. They are retired on the argument that `G.inventory` is never saved (no local blob, not residue) and hr_state_of projects the whole of `player_inventory` — so the replace can only correct a DISPLAY. The soak query (SELECT-only, 2026-10-11) read 72/102 `inv_flip_drift` sessions with destructive owned omissions; the lane reads those as the phantom being counted, not a hazard. The START-KIT hint block above is now reachable only on the merge path. **Security: confirm or veto before this rides a cut.** Fastest way back is unchanged: `hr_flags.inventory_absolute = false`.

**CORRECTION + RESOLUTION (Security GO-WITH-CHANGES, same day).** The first version of this note said "no intent reads it". That was false. These size an intent or an action from the display bag: sell-one (`shop-counter.js:281` invSellOne), the context menu (`inv-context-menu.js:178` buildOptions), the quick-sell slider (`item-ux.js:487/620/636`), the seam-off market list (`market.js:377`) and `legacy.js hasItem` (vendor sell guard, loadout equip, food slot). **Closed:** `market.js` now reads `gateItemCount`, and falls back to the display bag only when no server market exists. **Left display-bounded, deliberately:** I routed sell-one, the context menu and the slider through `gateItemCount`, and the suite went red on design rulings — SELL-SRV-1 and SELL-SRV-5 ("vendor_sell collects first: a freshly gathered log the last bag does not show is real on the server and sells"), plus B354-6/b140 (`selectJunk` must quote *pending* on an unstated bag; it already prices from `serverQty`). So I reverted them. The worst case for each is a request the server refuses under its row lock (insufficient_item), and the receipt shows the server's answer. Reopening this is the Game Designer's call, not this lane's. **Follow-ups (not this lane):** the stale `hr_flags.note` wording on `inventory_absolute` (DB lane); widening `no-upward-merge` beyond `Math.max` in src/net (ternary and `if (q > have)` forms, legacy.js and features).

**Designer, display-only ratchet left in place:** `src/core/goal-display.js` keeps the goal bar at its high-water (`Math.max(prevShown, confirmed, predicted)`); `canClaim` reads `confirmed` only, so nothing spends it, but the bar can sit above the server after a prediction overshoot until the period rolls. Not changed here — it is R5's stated "never a decrement" rule.
---

## 2026-10-10 — FLAG: the Discord gift's operator rotation writes production outside apply-migration
**Lane:** `lane/b567-discord-join` (systems-engineer). Nothing is applied; this is a decision for the Coordinator, not a request to loosen §2.

The brief asks for `tools/discord-gift-code.mjs`, an operator one-liner that rotates the active gift code through the management API. That is a production DATA write (`select public.hr_discord_code_rotate('<code>')`: one row retired, one inserted in `hr_discord_codes`) that does not go through `tools/apply-migration.mjs`, which CLAUDE.md §2 names as the only production write path. It moves no player value (the amount is a server constant; the table is operator config, RLS-forced, no client grant), the token is read as file bytes and never printed, and no agent has run it. **Ruling needed:** bless it as an operator verb (run after the migration applies; until a code exists the gift is OFF), or route each rotation through a one-statement migration file. **For the Game Designer:** the gift is proposed at 50 gems (one bank expansion on day one, a quarter of the first hero slot); a retune is one constant in §5 of `2026-10-18-discord-gift.sql`.

**RESOLVED 2026-10-11 (Coordinator + Security GO-WITH-CHANGES; Game Designer):** no rotation writes at all. The repo is public, so neither a code nor its sha256 may ever be committed (31^6 cracks offline). The code is DERIVED server-side (HMAC of the Vault secret `hr_discord_gift_secret` over the ISO week; last week's honoured as grace); the code table and rotate function are deleted; `hr_discord_code_current()` is owner-only and `tools/discord-gift-code.mjs` only READS it. Amount: **25 gems** (Baron parity).

---

## 2026-10-10 — W0a vs w0e/w0f (Systems Engineer)

**Semantic overlap, not a git conflict.** tests/catalogue-coherence.mjs holds a shrink-only PENDING list: w0f (boss materials void_essence/riftmaw_husk/elderscale_heart; trophies warboss_standard/lexarch_seal/voidwoven_sigil/dragon_relic) and w0e (Prayer has no consumer). When those lanes give each a use, they must delete the row in the same commit, or C2/C4 fails as stale. w0a also cut the six elemental arrows/whetstones and the fletching/mason tool ladders from library2-items.js SUPPLY_CHAINS — w0e (ammo/Runecrafting) should merge on top of that, not re-add them.

---

## 2026-10-11 — SEMANTIC CONFLICT RESOLVED: W0a's seal cut vs the account wallet's restatement of world_event_claim__ungated
**Lanes:** `lane/w0a-cuts-and-copy` (2026-10-10-w0a-catalogue-cuts.sql §1c) and `lane/c-account-wallet` (2026-10-19-account-wallet.sql §4), met in `lane/b567-discord-join`. No git hunk; the chain stopped replaying.

Both files restate `world_event_claim__ungated`. W0a removes the Rally Seal; the wallet routes its gems through `hr_wallet_credit` and pinned its pre-image to the chain WITHOUT W0a, so with both present the wallet refused at §0 (md5 b2a71614). Neither order works alone: wallet-then-W0a would put a `player_state.gems` write back after the column is dropped. **Resolution (in the wallet file, flagged for Security re-review):** the wallet's restatement is rebased onto W0a's seal-less body (the seal declare, `v_seal := 1`, `hr_rally_chest(…, v_seal)` → `0`, and the `seals` ledger/answer keys removed — exactly W0a's diff), and its §0 pin is now pre = b2a71614 (W0a's body), post = dba6d501. Apply order: w0a-catalogue-cuts → name-moderation → account-wallet → discord-gift. Verified on the merged chain: tests/account-wallet.mjs + --mutate, tests/discord-gift.mjs + --mutate, schema-drift, catalogue-coherence.

---

## 2026-10-14 — SEMANTIC (open): two homes for the world art budget (W1 runtime vs W2 art)
**Lanes:** `lane/w1-world-runtime` (systems-engineer) and `lane/w2-world-art` (asset/art). No git hunk.

The plan gives `src/data/world/art-budget.js` to W2. W1 had to size its stub boxes before that file exists, so `src/world/stub-atlas.js` carries one box per class taken from the plan's scale table (hero 38 in 64x64, door 48, wall 48 + 10 cap, tree 112, crown 80), and `tests/world-core.mjs` G2 pins them to the budget. W1 did NOT create `art-budget.js`, to avoid an add/add conflict. **Owed by whichever lane lands second:** stub-atlas reads its sizes from W2's `art-budget.js`, and G2 checks the stubs against that file instead of literals.

**RESOLVED 2026-10-14 (W1 merged W2 @8bb3f239):** the stub class table is deleted. The manifests are the one source of frame, anchor, footprint, class and shadow (`src/world/core/book.js`); a sprite no atlas carries draws as one STUB_SPRITE box. `art-budget.js` stays W2's.

---

## 2026-10-14 — SEMANTIC (open): hunt sessions C2's drop in the replay order vs the away client (R1) and full-chain guards
**Lanes:** `lane/c2-hunt-sessions-edge` (backend) vs `R1, delete the away client` (systems) and every guard that boots the whole chain. No git hunk.

**DEPLOY ORDER IS PLAYER-VISIBLE (B1):** the C2 edge answers a `combat` set_activity `hunt_required` (a fight is a hunt session), and no client calls `hr_hunt_enter` yet. The C2 edge deploy + the arm file must ride WITH lane B1's hunt screen; shipped alone, the current Fight button is refused. C2 places `2026-10-22-hunt-sessions-away-readers.sql` + `-drop-away.sql` in `order`, so the replayed chain no longer has `hr_set_auto_eat`, `hr_credit_kills(__ungated)`, `hr_attended_kills` or the four `player_state.auto_eat_*` columns. C2 re-scopes or retires the guards that drove them, in its own branch. **SWAP THEN DELETE (designer loop check 2026-10-14):** `last_away_receipt` (column, hr_apply key/validation/write, hr_state_of projection), `away-receipt.js` and `tests/away-receipt-journal.mjs` STAY for gathering/benches until lane G; the builder refuses a combat settle. **VIGOUR ENDS NO HUNT:** C2 ships the forward generated catalogue `2026-10-22-hunt-sessions-catalogue.generated.sql` (no `vigour` end reason, `death_xp_permille` row, end_reason CHECK regenerated); the C1 catalogue is history and `tools/gen-hunt-sessions.mjs` now writes the new file. **Owed by the designer:** the C1 `vigour_low` timeline event (Vigour no longer touches a hunt), and the per-use prices of the NPC basic supplies (`src/data/supplies.js NPC_BASIC_PRICES`, empty: the buy path is inert until priced). **Owed by B1 (client, same deploy):** `stamina` envelope (`G._stamina`, reconcileStamina) and the end card copy for `stamina` / `gold_out` / `resumed`; `hr_hunt_enter` answers `no_stamina` (was `no_vigour`); a bar of 20 slots with optional `kind` (`spell` refused `kind_reserved`) and `self_mana_pct`; new RPC `hr_action_set_mode(slot, preset, target, pull, idem)`; hunt view tally `bought` / `supply_gold`; Analyzer Waste includes NPC gold. **Merge with lane D:** C2 edits `src/data/rule-subjects.js` (20 slots, self_mana_pct, SLOT_KINDS, TARGET_MODES, PULL_COUNT), `supplies.js` (NPC_BASIC_PRICES) and `hunt-sessions.js` (STAMINA_MAX_MS, END_ORDER, RESUME_AFTER_END, RESUMABLE_KINDS, copy). **Owed by R1:** the client still calls `hr_set_auto_eat` / `hr_credit_kills` and reads `auto_eat_*` (src/net, src/core/auto-eat.js, legacy.js); those two files must not be applied before R1 ships. **Owed by the Coordinator:** `tests/apply-order-honesty.mjs` reads the drop file as stale-staged until `live-hash-drift` is re-measured (the baseline's `touched_by` for `hr_vigour_of` already lists the drop file, at the pre-C2 replay md5). C1's applied `2026-10-21-hunt-sessions.sql` is not in `tests/run-sql-tests.mjs` ALSO_LINTED (its format() revokes are invisible to the regex lints).

---

## 2026-10-14 — SEMANTIC (decided; Game Designer to confirm): the home template keys on the PROPERTY rung, not `state.plot_level`
**Lane:** `lane/w4-world-town-home` (systems-engineer). No git hunk.

The world plan (§2 Home) and the W4 brief say "the template follows `state.plot_level`". Here `player_state.plot_level` is the FARM SOIL rung (written only by `hr_farm_upgrade_plot`, shown as "Soil Lv N", gates crop tiers). The house a player owns is the property rung (camp → homestead → farmstead → manor → castle, `HearthriseProperty.serverPropertyTier()`), and the plan's own "farmstead and manor templates" are property names. Keying the house on soil would show a manor owner a cottage until they bought richer soil. **Decision:** `src/data/world/house-layouts.js` HOUSE_TEMPLATES is keyed by `fromTier` on the server's property rung (unknown → the first template). Every rung shows the cottage today, so nothing a player sees differs; it matters the day a second template ships. **Game Designer:** whether the camp rung (tier 0, "a bedroll and a fire") gets its own camp map is your call for that day.

**Also:** the plan's "12 px" south stub — the approved W2 art (`plank_stub`, 24 px, as in the signed-off house still) is drawn unchanged; it never covers the hero (row 9 stays clear by lint L-NORTH).

---

## 2026-10-17 — SEMANTIC (open): the client reset (`lane/w1-client-reset`) retires client guards that CLAUDE.md and the realtime publication still name
**Lane:** `lane/w1-client-reset` (systems-engineer). No git hunk.

1. **`chat_messages` stays in the realtime publication with no client subscriber.** The old chat UI was deleted with `src/legacy.js`. `tests/realtime-cost.mjs` carries a dated `PENDING_CONSUMERS` entry (`chat_messages` until 2026-10-31, owner: the chat window, week plan item 13); R3 goes red on its own after that date. The alternative is a lane-C migration that drops the table from the publication. **Coordinator to pick** (the dated exemption is a sunset, not a loosening; nothing else in the guard changed).
2. **CLAUDE.md §4 lists `property-gate-census` and `no-duplicate-toplevel-fns` among lane-done's guards.** Both are retired (they read the old client: property gates in legacy.js, duplicate top-level functions across classic scripts that no longer exist). `tools/lane-done.mjs` gained `client-module-size`, `session-core` (+`--mutate`) and `client-intent-surface`. **Coordinator:** update the §4 list.
3. **The visual gate's tool is gone.** `tests/visual-qa.mjs` and its gate drove old-client screens. The new client has `tests/client-boot.mjs` (real Chromium, stubbed SDK) but no screenshot set; the §3.3 visual gate needs a new visual pass over play.html before the next UI release.
4. **Known limitation:** `src/world/world-boot.js` still probes optional `window.*` hooks of the old client (combat observer, tab switch); they are absent and inert. Removed when the hunt view is rebuilt.

## 2026-10-17 — SEMANTIC (open): lane H2 targeting + role AI vs H1 / H4 / S1 (hunt core)
**Lane:** `lane/h2-targeting` (systems-engineer), on `lane/h1-movement` @b262e1f29. No git hunk expected.

- **H1 files touched (minimum, flagged):** `src/core/hunt/world-step.js` now hands `makeUnit` to every hook on `inst` (one import, one property). pull-cycle.js must spawn packs with every persisted field, and no module whose `PERSISTED` world-state composes may import world-state (a TDZ cycle). H1's tests that planted into the old stub bodies are re-anchored (`leash.mjs`, `seam.mjs`, `world-state.mjs`); each mutant still bites.
- **Hero settings and the combat snapshot are UNIT fields, not swingCtx.** `role, dist, chase, tmode` (roles.js) and `stance, acc (permille), maxHit, def, element` (damage.js) persist on the hero unit; **S1's settle writes them** from the character's hunt settings and `playerCombatRolls` when a hero joins or a setting changes. `hunt-spawn.newHuntWorld(ground, grid, party)` builds a fresh instance.
- **Owed by H4 (abilities):** `shield` (hurt spends it when it is an integer) and mark / vulnerability as `ability.mult` permille passed to `damage.landHit`; abilities land hits through `landHit` so kill events and the fall hand-off stay in one place.
- **Owed by S1 (settings + catalogue):** "Highest % life" is not in `rule-subjects.js TARGET_MODES` (adding it regenerates the hunt-sessions catalogue, a lane-C file). The new `HUNT_STANCES`, `HERO_DISTANCE`, `ROLE_DEFAULTS` are not generated yet.
- **NOT deleted, and why (one-path table, spec §1.1):** the `hs.pull` spawn cycle in `combat-sim.simulateHuntSpan`, `pickSpawn` and the single-foe `swingFoe` hit math in `world-step.js` are still the LIVE hunt (no production world exists until S1 writes `hunt_instances.world`). They go in the lane that switches the settle to the world. H2 made combat.js the one source of the pieces (`defenceReduction`, `monsterAccuracy`, `monsterMaxHit`, `elementPermille`), so both paths price a blow alike until then.
- **A wipe "returns to the entrance" by walking:** a teleport would be a tile write outside movement.js (guard `leash-called-only-from-movement`). Downed heroes stand where they fell at `resumeHpFor`. A `movement.place` seam is H1's call if the walk reads badly.

## 2026-10-17 — SEMANTIC (open): lane S1 hunt server — one path landed; what the designer and the content lane now own
**Lane:** `lane/s1-hunt-server` (backend-architect), merged with `release/b592`. Staged migrations: the nine `2026-10-23-*` S1 files (apply order in `tests/schema-apply-order.json`).

- **One path (spec §1.1):** the single-foe span, `hs.pull`, `pickSpawn`, `runActionBar` / `pickHeal` / `spendFromBag`, `src/core/hunt.js`, `hunt_use`, `hr_hunt_apply` and `applyBuffSegment` are deleted. Every fight is a hunt INSTANCE (solo = party of one) settled by `hr_hunt_apply_instance`. H2's owed items are done: `highest_pct` is a target mode; stances, distance and role defaults are generated (`hr_hunt_set_options`).
- **Designer (balance, ASSUMED values):**
  1. RESOLVED in-lane 2026-10-18 (core-loop was red on it): a drink the purse cannot buy now only goes without (only an unaffordable FOOD ends `gold_out`); the designer's store price cut (design-s1-calls, ECON-1) makes a fresh melee hero's drinks pay for themselves. Sword = tank per the sewer-lane ruling (`hunt-roles.js`). DM-16 checked: the engine applies only the gold-find perk to a kill's `gp`, never a coin multiplier.
  2. `WEAPON_ROLES` interim map: sword / hammer / neutral → melee_dps, ranged → ranger, magic → mage or healer.
  3. A hunt READS the timed buff queue (re-measured at every swing boundary) but fires none: buff foods stay parked (spec §3.4 #1). A damage / drop / XP elixir eaten outside the hunt pays inside it.
  4. A caster's basic burns the rune loaded in its ammo slot (the W0 rule kept so Runecrafting has a hunt consumer); a staff basic's mana cost (AB-12) is not wired. The free rung (`ammoPerShot 0`) never depletes. Fractional whetstones are not consumed in a hunt.
  5. The Prayer ward is on the hero unit (a monster's accuracy x (1 - ward)), so Prayer keeps its consumer.
  5b. Parity restored from the single-foe span: a basic swing is priced against its monster (accuracy over its defence, the weapon / bane / element weakness the Fight screen quotes), crits land from gear and buffs and journal the lifetime `crits` stat. Abilities still price their hits on the neutral max hit (no weakness, no crit).
  6. Four balance-measurement guards are red under the instance engine and need a re-measure and re-pin: `field-salvage` (d), `lucky-finds` (d), `w0f-fun-content` (champ), `hearthfind-boss-rate` (elk_king 111/h vs pin 106, grim_reaper 139 vs 128, dragon 100 vs 95). Cause: abilities, one food per 6 s, eat under 50%.
  7. `PREMIUM_LOGIN_REWARD.item` is null: no training weapon row has both a source and a use, so `hr_login_claim` refuses until the row exists.
- **Content lane (week plan 17):** `HUNT_GROUNDS` is empty, so every `hr_hunt_enter` answers `no_ground` and `core-loop` LOOP-1 step 5 / LOOP-5 are red. S1 must not reach a player before at least the loop's grounds ship. The server grid (`hunt-ground.js gridOfMap`) blocks material tiles only, not object footprints.
- **Client (Systems Engineer / the client rebuild):** `src/legacy.js` still runs the deleted world-less client tick (`combatSim.stepSwing(null, …)`, ~line 4472) and `tests/world-hunt.mjs` drives the pixel hunt scene off it; both are red with S1 and go with the client rebuild, which renders the settle's track and events instead. The client must also stop sending `hunt_use` and read the new state sections (`hunt`, `hunt_settings`, `hunt_analyzer`, `party`, `premium`, `login`; mapped `meta` in no-client-copy-of-projection until a reader exists).
- **Coordinator:** the M8 party engine (`hr_party_*`) is still installed; S1's verbs are `hr_hunt_party_*`. Now dead and left for the wipe: `player_state.fight` / `ammo_carry`, `hunts.js` `pull` / `respawnMs` / `spawns[].w`. A party member entering another hunt with no ground hears `no_ground` before `party_hunt_mismatch`.

## 2026-10-18 — SEMANTIC (open, Art Director to rule): the live hunt's hit flash and corpse tone vs "no per-sprite tint"
**Lane:** `lane/hunt-scene` (systems-engineer), on `lane/hunt-screen` @7c7605ce0. No git hunk expected.

- `src/data/world/palette.js` says runtime lighting is the only colour change after the lock. The brief (Tyler 10-18) and parity VW-05 want a hit flash and a fade to a grey corpse. Built so the art never leaves the palette: the flash is the frame's silhouette in `--world-flash` (bone `#e6dcbc`) at 0.7 over the frame; the corpse lays each pixel's lightness onto `--world-corpse-0..4` (the shadow and stone ramps). Both are cached per atlas in `canvas-backend.js variant()`. If the Art Director wants them baked in the pipeline instead, that one function is the seam.
- **Camera vs the bottom bar (shell):** the hunt's bottom action bar is a screen widget, not a docked-window inset, so the camera can frame units under it (the cellar's bottom row at 1440x900 and 922x423). The camera already honours `setInset`; the shell lane decides whether that bar reports one.
- **The old swing staging stays** (`src/world/{hunt-scene,choreo,beat}.js`, guard `world-hunt`) for a fight with no `hunt` section. It retires with the combat observer, in the lane that removes the last old-client hook from `world-boot.js`.

## 2026-10-19 — SEMANTIC (open): the one-way party flow vs the live-client lane's party files
**Lane:** `lane/b-party-system` (systems-engineer). Staged: `2026-10-28-party-flow.sql` (apply before the client half). Did NOT touch `src/session/party-sections.js`, `src/session/town-presence.js`, `src/shell/widgets/party-panel.js`, `src/hunt-view/*`, `src/session/character-session.js` (the other lane owns them).

- **party-panel.js must wire (the panel is the only roster, PARTY_SPEC §2):** read membership with `partyMembershipOf(cs)` (party-sections; works in town), overlay hunt stats from `partyOf` by seat; per member show `away` / `seat_ms` from the `party` section ("Away, seat kept N min"); footer Leave = `afterLeave(ctx.account, cs, () => cs.leaveParty())`, Disband (leader) = `disbandParty(ctx.account, cs)`, row Kick (leader, town) = `afterLeave(ctx.account, cs, () => cs.kickSeat(seat))`, all from `src/session/party-intents.js`, buttons off via `runIntent` (src/shell/intent-words.js, which now words `not_ready` seat by seat). Hide "DPS and HPS" while nobody hunts.
- **character-session.js follow-up:** `createParty`, `startPartyHunt()` (its 2-arg RPC is dropped by the migration) and the sibling `joinParty` path have no caller left; delete them, then retire `hr_hunt_party_create` (server, CLIENT_RPCS, party-ui PI-1 rows). CharacterSession party verbs re-read only their own character; `afterLeave` re-reads the account's other seats.
- **Security reopen must-fixes (2026-10-29-party-security.sql):** a party is PRIVATE until its leader lists it (`listed` in the `party` section; the switch lives in the Party window's Find tab); the finder's Join needs a listing, an accept needs only the invite; a block with any member refuses invite / accept / join; kicking a hunter ends or schedules its leave (the panel's Kick may stay on for hunting rows); the M8 `hr_party_*` verbs are dropped. Ordered after `2026-10-28-reopen-rpc-sweep.sql` if that lands (no shared object).
- **Presence:** "away" is the account's `social_presence` stamp (30 s social poll), per ACCOUNT, not per character: a closed character of an open account keeps its seat.

## 2026-10-21 — SEMANTIC (open, Game Designer / Asset Director to rule): store-by-slot side effects
**Lane:** `lane/b-supplies-bury` (systems-engineer). Staged: `2026-11-07-store-by-slot.sql`, then `2026-11-07-hunt-sessions-catalogue.generated.sql`; edge hr-accrue deploys FIRST.

- **Gray Wolf coin [2,5] -> [3,5] (designer to confirm or re-tune):** the starter bar eats at 60% (Tyler 10-21), so a fresh Thicket hero buys ~11 Salted Shrimp an hour, not 5; `forest-cave` first-grounds-net-chain had the Thicket (1707 g/h) under the Cellar (1738). With [3,5] the Thicket nets 1765 (6-seed median). Max coin is unchanged, so no kill-bound catalogue row moves.
- **Plain Fire Rune icon (Asset Director to review):** `assets/icons-bundle/pixel/supplies/plain_fire_rune.png` is the Fire Rune tile with its glyph remapped to the earth ramp by script (palette-legal, pixel-icons green). Replace freely.
- **Rend (`life_rune`) and Frost Lance (`frost_rune`) name runes that are not items** (`src/data/supplies.js` has no such rows), so no store rune can back them; the brief's "every rune spell" covers Flame Strike / Flame Volley only until the designer adds those runes (or re-points the spells).
- **Live heroes whose stored bar holds an "Any food" / "Any drink" slot** read it as an empty tablet after the apply (no back-compat, §1); a bar with other slots then has no food until the player picks one. A fully empty bar shows the starter bar.
## 2026-10-22 — SEMANTIC (RULED 2026-10-22, Game Designer: option (a), one concept): ruling C4 "presets" are two things, and saved setups share ONE bar
**RULED (a): a setup OWNS its bar; there is one concept, the setup.** The player problem is "my Sewer tank loadout vs my Thicket solo loadout", and the bar is useless apart from the gear (the role comes from the weapon, so a tank bar on a bow hero is wrong), so the two always swap together; two named lists that must be paired by hand (b) is a repeated decision and a second concept for no new choice. Setup N owns action set N (one number, one name; 5 per hero, the sets table's 0..4); the hero is always on one (`player_hunt_active`), the bar shows it in and out of a hunt (`hr_hunt_settings_view` reads `hr_hunt_active_set`), and a bar edit IS an edit to that setup, so nothing is re-saved by hand. Save = what the hero has on (gear + the current bar, copied when it is another set's) becomes setup N and the hero is on it; Use = wear its gear + switch to its bar; both town-only (`hunt_open`), because a hunt runs on the set it entered with. Delete removes the setup AND its bar, never the one in use (`setup_in_use`: put another on first), so the bar never changes under the player. Rename on either screen renames both. Density stays a hunt-picker choice (rulings: NOT a set setting) but is still STORED in the set's `options`, so switching setups can change it: owed to Systems, a per-hero-per-ground density row. Built in `2026-11-15-preset-names.sql` (still STAGED); `hr_action_set_delete` / `hr_action_set_put` stay client-callable with no caller (retire at the reopen review).

**Lane:** `lane/b-presets-c4` (systems-engineer). Staged: `2026-11-15-preset-names.sql`.

- The player sees two named lists: the **action set** on the bar (`player_action_sets`, 5 per hero: the bar + its fight options; plaque "Action set Hunt") and the **saved setups** in Hunt prep (`player_hunt_presets`, 8 per hero: gear + restock + an action-set index). This lane gives saved setups rename + delete and the action set a rename.
- **No client path creates or switches to action set 1..4** (`setHuntOptions` always writes the shown set; out of a hunt `hr_hunt_settings_view` shows set 0, not `player_hunt_active`). So every saved setup snapshots `action_set = 0`: "Use" swaps gear and restock, but the bar is one shared bar. C4's "switch" is only half real. The brief's "delete refuses the last preset; deleting the active one falls back" is an action-set rule, and with one reachable set an action-set Delete would be a control the server always refuses, so it was NOT built (`hr_action_set_delete` still has no caller). Saved setups have no active one; deleting the last is allowed (the window already says "No saved setups yet.").
- **Designer to rule:** (a) a saved setup OWNS its bar (save copies the shown set into the setup's own set; Use switches `player_hunt_active`), or (b) action sets get their own New / Switch / Delete on the plaque. Either needs `hr_hunt_settings_view` to read `hr_hunt_active_set` out of a hunt.

## 2026-10-23 — SEMANTIC (RESOLVED 2026-10-24 in the lane/b-spell-balance merge of v0.2.38): a shot is ammo the worn weapon can loose; shot spells loose the bar's arrows (vs lane/b-spell-balance)
**Lane:** `lane/a-ranger-abilities` (systems-engineer, hotfix after v0.2.36). Edge only, no DB change. Andy 10-23 (Fremulon).

- **The rule:** `src/data/hunt-roles.js shootsItem(role, item)`: an ammo item whose `reqSkill` is the role's shot skill (Ranger ranged; Mage/Healer magic). `damage.js pickShot` passes over any other attack item (a whetstone, a rune on a bow, an arrow on a staff) and over loaded ammo the weapon can't shoot; `abilities.js castShotOf`: Precision Shot / Flame Volley loose the item the attack lane would (the first attack slot that can shoot, else the loaded ammo), never only `h.ammo`.
- **lane/b-spell-balance rewrites abilities.js and damage.js and keeps both live bugs** (`suppliesFor` still `if (!h.ammo) return { why: 'no_ammo' }`; pickShot still shoots any non-rune ammo, whetstones included). Its re-merge must keep `castShotOf` and both `shootsItem` gates; with runes retired as shots there, SHOT_SKILL's mage/healer rows become moot (`row.basic` returns first) and may go.
- **Server half still open (lane C):** `hr_hunt_action_ids` (2026-11-07-store-by-slot.sql §1, mirrored from `conditions.js actionKnown`) accepts `attack_with_item` whetstones, so a bar can still SAVE one; the engine now passes it over and the bar strikes it in words. Fold "no whetstone" into spell-balance's `attackItem` and its `2026-12-21-slot-truth.sql` rows (it reseeds that table already).
- **Designer to know:** with the fix Fremulon's exact bar fires slot 7 (Barbed Arrows, none carried) ahead of his free Bronze, buying Plain Barbed Arrows at 2 g a shot, plus Flame Volley's named store Fire Rune at 8 g: ~3,290 g/h of store supplies against ~2,610 g/h coin per hero (Bronze ahead of Barbed: ~910 g/h). The engine follows his slot order (Tyler 10-21 / 10-23); spell-balance's 1 g store prices cut it.
- **Resolution (lane/b-spell-balance, v0.2.38 merge):** both behaviours kept: castShotOf and both shootsItem gates stand beside the mana basic and the rune versions. SHOT_SKILL is the Ranger's alone (a caster's basic spends mana and a rune fuels spells only, so a staff or wand shoots nothing). The server half is folded into 2026-12-29-slot-truth.sql: hr_hunt_action_ids holds no whetstone (conditions.js attackItem = an ammo some weapon can shoot), so neither the bar nor the server stores a whetstone or rune attack slot; §3(d) and tests/hunt-core/conditions.mjs prove it.
## 2026-10-23 — SEMANTIC (open, Game Designer to confirm): the loot bands' Thicket sample (lane/b-loot-bands, phase A)
**Lane:** `lane/b-loot-bands` (systems-engineer). Staged: `2026-12-20-loot-catalogue.generated.sql`, then `2026-12-20-hunt-sessions-catalogue.generated.sql`, then the hr-accrue deploy AT ONCE (the settle refuses an item no kill bound names).

- **The sample's odds were right; the Coordinator note's math left out the solo yield.** A solo hero kills for 0.55 of a row's yield (hunt-grounds.js yieldPermille), so 165 kills x 0.55% x 0.55 = 0.5 pieces/h (2 h), as the designer claimed. Tyler's 10-23 ruling (about ONE Scarce piece an hour per slot per weight) doubled every Scarce row; Rare kept 0.3% (14.8 h per item).
- **The outfitter rule vs Grayjaw's Ruff (designer to confirm):** "the Shop never sells a slot a walked ground drops" (10-22) met a Rare cape beside the Shop's Traveler Cape. Narrowed to a ground's REGULAR gear (old-model slot rows and the Scarce band); a Rare or Trophy named piece may share a slot with a Shop basic, the shield pattern Tyler ruled 10-23 (basic at the Shop, better ones made and dropped). Guard: forest-cave shop-outfits-defense; its leather-helmet mutant still bites.
- **Worn gear sells at half book** (`src/data/loot-bands.js` VENDOR_GEAR_RATE 0.5, in vendorPriceOf under the b565 cap), replacing the design's "book value for gear", per Tyler 10-23 (meet the caps through what gear sells for). Measured on the Thicket: both caps hold up to 0.58. Every gear sale in the game halves (the outfitter's resale too). PROVISIONAL with every loot number.
- **No bound gear reaches two free grants:** the practice kit (9 pieces) and the premium daily Oak Practice Blade turn tradeable at value 0 (a trader pays nothing). hero-creation H-D3 now asserts value 0 and no sale gold. For the reopen Security review: a daily tradeable item for every premium hero (beta premium is on for all).
- **The Shortbow lost its one source** (Old Grayjaw's row, the design's cut): it joins PENDING_SOURCE (tests/catalogue-coherence.mjs) as a practice-kit copy to cut, beside the Stone Maul and the apprentice staff, wand and primer.
- **One hunt-sessions forward file:** if lane/b-party-leave-together's 2026-12-18 catalogue merges first, this lane regenerates its 2026-12-20 file on top of it.
- **Phase B (all five grounds banded):** worn gear sells BY TIER (`VENDOR_GEAR_RATES` 0.5 / 0.5 / 0.12): the pace is the same everywhere (~1 piece an hour per slot per weight) while book value climbs 2-4x a tier and coin barely moves, so tier 3 at 0.5 would put the Warrens' gear at 164% of its coin (measured: caps hold there up to 0.15). Higher tiers sell at the last rate until their grounds exist.
- **Scarce slots per monster (designer to confirm):** "each monster keeps one learnable slot" holds on the Thicket, Sewer and Glade; at the Warrens the swarm (scavengers) carries two slots (boots, legs) and the three slow monsters (skulkers, foremen, the Chief) share the bodies, because no row may exceed 5% and the hourly pace for a party of four at 32 needs it. loot-structure now asks for full weight triples per slot carried.
- **Kingsgrate (designer to re-rule its band):** the Rat King's approved 4% would land about every 5 h per hero at the party floor: neither Scarce (~1 h) nor Rare (10-20 h). Its row is left for the spell-roles lane, after the Crown Shard.
- **Party Rares re-seeded the live view (fixed here, an edge + client change):** with Rares on most party monsters, the party rare roll's rotation (`world.rareWon`, drawn on the loot stream the browser runs on a constant) diverged the reconcile hash on every Rare, real or the prediction's own: hunt-live LV-T read 8 of 30 commits off and the second tank's drawn blows fell from 340 to 136. `worldHash` now hashes the world with its server-only fields blanked (world-state.js `reconcileText`, party-split.js `SERVER_ONLY`); a world with no rotation hashes exactly as before, so an old client mismatches only a party that has had a Rare. Supersedes my 10-21 note "never hash-exclude rareWon" (written when a party Rare came every 10-20 h). LV-RR now asserts every commit matches over 17 server rolls, with a mutant.
- **Hunts detail (Art Director to look):** the ground page named ONE rare carrier; several creatures carry Rares now. `rareOf` names the boss's Rares, else the creature with the most (Grayjaw's five, Rook's four, the Chief's four), and a Scarce piece never reads as the ground's Rare. A list of every Rare and its carrier would read better than "A and B and C and D and E".
- **Not in this lane:** boss Trophy rows (the Rat King's Crown etc.: a new item, the Global chat event and the Trophy Room wiring); the Cellar's and the Warrens' imbuement items (IMBUE_PENDING, so their monsters keep 3-4 Commons); the tutorial Slime's Sticky Core still reveals as a Rare about hourly (its seeded table is kept).

## 2026-10-23 — SEMANTIC (open, Game Designer to re-tune): the shields and the support lane move the party economy (lane/b-spell-roles)
**Lane:** `lane/b-spell-roles` (systems-engineer). Staged: `2026-12-24-shields-catalogue`, `2026-12-24-alpha-catalogue`, `2026-12-24-hunt-sessions-catalogue` (generated), then `2026-12-24-spell-roles.sql` RIGHT AFTER, then the hr-accrue deploy.

- **Guard is strong at the floor (designer, p30/p31):** each guard point is -2% monster hit chance (provisional numbers). At the Warrens floor (L32 party, real settle, 1 h) the tank's landed blows fall from 34% to 21% between the Practice Shield (guard 2) and the Steelgrate (9); with the Healer topping up between pulls the floor tank's store bill is 180 g/h against a share of ~2,900 (+1340%; the Healer +2025%), and the lone Melee at the card's alone-from 45 buys nothing. Tyler's working target is +25-35% over the bill. The +25% floors (drop-tables profit-floor, warrens-floor) still hold; their cost-side mutants were strengthened to bite (measured, in the drop-tables comment).
- **The Rat King's Crown odds .0014 -> .0015** (lane/b-loot-bands' value): the spell lanes merged with the loot bands kill the Rat King ~5% slower, which put the Trophy at 150.4 h, just over the 125-150 h band; now ~140 h (the designer's "~140 h base"). Designer to confirm.
- **A crossbow shoots store bolts** (no free bolt rung): the crossbow + shield Ranger's bill is 2,700-4,300 g/h at the Sewer L20 / Warrens L50 against the bow's free Bronze Arrows. Ammo ladder owner to look.
- **The heavy shields' attack penalty applies to every style** (atkB, rangeAtkB, magicAtkB): "-4 attack" read as the attack roll whatever the weapon, so a crossbow or a wand behind a Kingsgrate pays it too. Designer to confirm or narrow it to Melee.
- **Arcane Barrier's refund** (Andy, Tyler 10-23): a self-shield recasts only to land MORE than its standing shell (a full shell of the same version waits; a chipped shell, or a stronger version, recasts) and the shell left comes back as mana at the new cast's price per point, capped at its cost; the cast event carries the net mana (no Magic XP on refunded mana). Protective Ward (ally) keeps "no shield standing".
- **Bare hands play the club's list** (Power Strike, Cleave; no rune spell, no bleed), and bare hands with a shield the tank. Designer to confirm.
- **hr_hunt_settings_view `usable` for a rune spell still checks only the Chalked rune** (`pi.item_id = v_ab.rune`): a hero carrying only higher-tier runes of the family reads struck on the server. Pre-existing (lane/b-spell-content); not changed here (the server holds no rune family column).
- **An open hunt across the deploy keeps its spawn role** (a unit's role is set at spawn): a sword-only "tank" plays the Melee damage bar on a tank's unit until that hunt ends. Closed game; the next hunt is right.
- **Phase C (designer's rulings, numbers provisional), what I decided and the designer may overturn:**
  - *Sale ladder:* Leather Boots fell to its ladder value (35). The guard also caught the outfitter's Bronze Belt (110) and Leather Gloves (80) outselling their tier-2 twins: their book is the Shop sink's half-price, so I lifted the undropped twins (Iron Belt 110, Studded Vambraces 80, Boarhide Vambraces 290) rather than cut two Shop prices.
  - *Commons over two (COMMONS_PENDING, shrink-only):* the Giant Rat (tail, wheat, bones, and Small Fang kept as a 16% Common so it keeps a reachable source) and the Warrens' five (ore, ears, coal, bones). Trim them and they leave the list.
  - *Picks the ruling left open:* Sticky Core feeds Element Ward; the bodies' group is named "the Chief's crew"; Trophy values 4,000 (Rat King's Crown) and 7,500 (Coppercap's Cauldron); the Cauldron at 0.13% (0.12% gave a party 159 h, over the 150 h ceiling).
  - *Trophy Global chat line, missing:* the rare broadcast (2026-11-24) posts every rare_drop to System. A Global line for a Trophy needs the server to know an item is a Trophy (an hr_items kind or a catalogue list), a `trophy` notice rule on the Global channel and the trigger routing it: a lane C migration. The share card already works (any rare-drop alert has one).
  - *Trophy Room wall, missing:* the rebuilt client's wall hangs Bestiary mounts only; boss trophies have no slot there (boss-forge.js BOSS_TROPHIES is old data no screen reads). Until a wall slot exists the two Trophies are collector's pieces (VENDOR_TRASH).
- **Done in phase C (was "not in this lane"):** the two boss Trophy rows, the Cellar's and the Warrens' imbuement items, and the tutorial Slime's Sticky Core (an 8% Uncommon now, so no hourly "Rare drop").

## 2026-10-23 — SEMANTIC (open, Game Designer to look): the 1 g store shot (lane/b-spell-balance)
**Lane:** `lane/b-spell-balance` (systems-engineer), the designer's spell-release values (PROVISIONAL): BASIC_AMMO_PREMIUM 2 -> 1, store shots 1 g at tiers 1-3 (mithril 4, rune 6, emberhead 9, dawnpoint 12), Steel Arrows book 2 -> 1, Iron Arrows rangeAtkB 2 / rangeStrB 3. Regenerated into the staged `2026-12-24-shields-catalogue`, `2026-12-24-alpha-catalogue` and `2026-12-24-hunt-sessions-catalogue` (no new file). Answers the "A crossbow shoots store bolts" item above: the crossbow + shield Ranger on store Iron Bolts reads +32% (Sewer 8) / +39% (Warrens 32) at the floors, +125% / +107% in range (Sewer 20 / Warrens 50); at 2 g it read -30% / -30% and +13% / +4% (tests/hunt-core/drop-tables.mjs ranger-floor, with that mutant).

- **The vendor's bid on a crafted arrow halves from mithril up.** The ammo price rows are the store shot, and the vendor pays at most half the price list (SHOP_BUYBACK_RATE, floored at 1), so Mithril / Rune / Emberhead / Dawnpoint Arrows now sell for 2 / 3 / 4 / 6 g (were their book 4 / 6 / 9 / 12; hr_hunt_vendor_value follows); tiers 1-3 stay 1 g (the floor). Fletching for the vendor earns less; no buy-sell loop (the Shop sells no ammo). Designer to confirm, or to decouple the price list from the store shot.
- **In range the Warrens shot bill is a little over the target:** a store-fed Ranger spends 46-48% of its coin share on shots at the Sewer L20 party and 57-59% at the Warrens L50 party (target ~45-55%); at the floors 71% (Sewer 8) and 90% (Warrens 32).
- **Iron Bolts need Ranged 15:** the brief's Sewer-floor case (Level 8) loads store Iron Bolts, which a real Level-8 hero cannot wear; it shoots Plain Iron Arrows instead (also 1 g; a bow on them measured +29% at the Sewer floor). The fixture does not gate worn levels (it never has: the kit's bows do not either).

## 2026-10-24 — SEMANTIC (designer to confirm): which arrows a bow looses (Andy #63) and two guard changes in the v0.2.41 merge of lane/b-spell-balance
**Lane:** `lane/b-spell-balance` (systems-engineer).
- **The shot order (src/core/hunt/conditions.js attackOrder; the swing and shot spells alike):** carried stock first, the store last. Within each pass: a bar ammo slot WITH conditions where it stands, then the WORN ammo, then the bar's other ammo in bar order; the store sells in that same order (the worn ammo's partner first). The brief said "worn ammo first, then bar ammo"; a slot with conditions stays ahead of the worn ammo because otherwise a rule like "area arrows at 3+ in reach" could never fire while the free Bronze is worn (it never runs out). Configure says it in the slot sentence. Designer: confirm, or rule that conditions do not jump the worn ammo.
- **drop-tables trophy-pace** now judges a boss Trophy on the boss's kills MEANED over three seeds of the same hour (TROPHY_SEEDS). One seed lost the Warrens' 21st Chief at the hour mark after main's Follow fix (154 h vs 146.5 h on every other seed); with the alone-at-45 hour at 127.15 h no single chance satisfied both ends of 125-150 h. Mutants at 0.17% and 0.10% are caught. Designer: the band is 20% wide and the two Warrens groups sit 21% apart at one chance; widen it or give the Cauldron its own target.
- **alpha-server A-DATA:** a price-only supply row (never sold by the Shop) is bounded by the vendor's cap (half its price, floored at 1), not by strict half: at the 1 g store shot a crafted Barbed / Iron Bolt / Steel Arrow sells for 1 g, the shot's own price. No buy-sell loop exists (a store shot is spent, never held). Mutation proof: vendorPriceOf without its cap is caught on sold and supply rows.

## 2026-10-25 — SEMANTIC (art-director / designer to confirm): moved HUD widgets (lane/b-widget-move-fold)
**Lane:** `lane/b-widget-move-fold` (systems-engineer). Tyler 10-25: the Hunt analyzer and the Tally move and minimize.
- **A widget the player moved may overlap another** (Tyler 10-19 "widgets never overlap" holds for the default layout): the bars neither slide for it nor push it, and it stacks under nothing. Put back (HUD layout) or Reset layout returns it. Art/design: confirm, or ask for snapping clear of the bars.
- **The phone folds but never drags** (src/shell/widget-move.js header): the right-hand column is one computed stack (hunt bar, analyzer, bar; HS-22) and the phone analyzer has no title band to grab. The phone tab strip pans sideways (four premium tabs no longer fit beside the fold and the close).
- **The analyzer's This hero / Party switch moved under the clocks on desktop** (beside the new fold it wrapped the title).
- **Pre-existing, for the action-bar lane:** tests/fixtures/alpha-envelope.json's phone action bar is 104 px at 844x390 (HS-22's cap is 100), which puts a shown analyzer in the bar's row, and clearOfEdges pushes it off the screen. Not changed here.
## 2026-10-25 — SEMANTIC (designer to confirm): where tutorial lane 1 departs from the 2026-10-25 board table
**Lane:** `lane/b-tutorial-cards` (systems-engineer).
- **No Level gates on B4 and B6.** Gated at Level 3 and 4, the chain skipped forward to "Out to the brook" and came BACK when the Level arrived (the old class of #2). The bar cards now follow each other at the player's pace (each waits for its own press).
- **Eat on time stops at 50%, not "− twice".** At Level 3 (170 HP) 50% still wastes 11 of a shrimp's 96; the card steps down in Configure action's 5% until nothing is wasted, never under 50%, and says what is left.
- **Order matters covers a store slot AHEAD of the own food** (same HP, the first slot fires): it asks to move it Later, since lowering it would not do.
- **"Taking a beating?"** triggers on 3 meals in one hunt (a fact that stays for the hunt), not "HP under 40%" (a moment the card would flash past), and names the bar's stance, not the sliders popup (Tyler 10-25: stance back on the bar).
- **Hook names:** `data-coach-hook="level|stamina|stance|sell-confirm|setup-save"` instead of the board's `data-coach="…"`: `data-coach` is already the coach box's own key (launcher.js placeCoach redraws on it).
- **Day-one cards (juice, house, own runes) cap at Level 15** like the chain; death, stamina, storage and paid Blessings are uncapped. "Out to the brook" keeps "about a quarter of an hour" (the live play, 14:57), not the harness's 25 minutes.

## 2026-10-25 — SERVER GAP (backend to route) + SEMANTIC: the bar in town (lane/a-v0246-followups)
**Lane:** `lane/a-v0246-followups` (systems-engineer). Tyler 10-25: every bar control configurable in town.
- **The server omits five options out of a hunt.** `hr_hunt_set_options` has `dflt` null for target_mode, stance, distance, chase and gold_floor (2027-01-13-hunt-sessions-catalogue.generated.sql), and `hr_hunt_settings_view` fills them only from the hunting unit, so a hero that never set them reads null in town. `hr_action_set_options` does NOT refuse out of a hunt. Client fix shipped: an unset option shows the ONE engine's own pick (src/core/hunt/roles.js defaultSettings by role + party seats; GOLD_FLOOR.default as action-rules floorOf) and a press sends an absolute value. Proper fix (server lane): project the role default in `hr_hunt_settings_view` out of a hunt; the client fallback can then go. **RESOLVED (lane/i-v0248, 2026-10-25):** 2027-01-25-town-defaults.sql projects it; `townDefaultOf` and the GOLD_FLOOR.default fallback are removed from settings-intent.js (an unset option is now off; HS-27 re-aimed). The client half needs 01-25 applied first.
- **A new hunt's mana before its first settle.** `hr_hunt_state` sends `mana_max` but `mana` null until the world exists (party members neither); the hero's own hub/row now reads full (hunt-spawn.js starts a hero at maxMana). Other members still read "–" for those seconds: coalescing like `hp` is a server fix.

## 2026-10-25 — ARCH + ART (art-director; L2 lane/c-town-stands; L3): Havora's map and stations (lane/b-town-map, L1)
**Lane:** `lane/b-town-map` (systems-engineer).
- **A ground with no art draws in placeholder tones.** `town_common` has `ground: null` (map-compile L-KIND allows it on a town only); each cell is its material's flat `--world-ground-<material>-a/-b` token (tokens.css), building footprints (`site`) darkest. The `common_ground` painted fill would have tiled the smithy-corner picture over 192 x 116 tiles, so it is no longer drawn (still in atlas-common). No single painted fill can cover this map (6144 x 3712 px > the 2048 px atlas cap): the art lane's grounds must be per-district or wang terrains, and the renderer needs more than one ground terrain per map for that.
- **L-TREES asks for a tree only in a 12 x 12 window at least half `green` ground** (grass, tilled): the sea, the cliffs, Hearth Square's paving and the footprints are not meadows. Every shipped outdoor map still passes; a treeless meadow is still red (world-core mutants). Art director: confirm.
- **For L2 (server stands):** station ids and stand order are `src/data/world/stations.js` STATIONS (20 stations, 590 stands). A stand is `(station id, 0-based index in stands[])`; the `primary` stands come first, overflow after, then `fallback` (a station id; no loops, ST-5). Tiles are map tiles (x 0..191, y 0..115; plan x + 24). Arrival is `gatehouse`; `arrivalStand(userId, slot)` is the client's placeholder until the server assigns.
- **Plan deviations (designer):** the gatehouse yard is x74-78 y20-29 (the plan's x70-96 y22-27 overlaps P07 and the mill); the sewer grate is at (46,67) (the plan's (50,68) is inside P06); the fuel row y50 starts at x111 (the plan's own count needs it); Hearth Square holds 24 fuel + 115 field/flank/corner + 12 bench seats = 151 stands (plan 130).
- **The Hearth art is placed (lane/b-hearth-art merged):** the Great Hearth (11 x 4 object) with hearth_fire as a map `ambient` loop (lift 86 px) and an 8-tile point light; square_plaza as a map `patch` (a painted fill laid into the tones over x106-129 y36-59); the four halls, four stalls, six benches, decals; mine_mouth, the ore rocks, rune blocks, westwood ash/yew (2 x 2, the two west columns), a fishing pier. **Not placed:** the square_grass_flag / square_dirt_flag kerbs (a wang ring needs a per-cell second terrain the renderer does not draw yet: next renderer step).
- **Layout fixes (art lane's two findings):** every hall faces south, so the depot SOUTH of the square showed its back: the Storage (square_depot) now stands beside the Shop on the square's NORTH edge (x118-128 y30-35, counters y36 at x123/125/127, stands x123-128 y37-41 + x129-131 y36-39), and the barracks takes the south lot (x108-118 y66-70, the kill-task hunter's yard y71-73 south of it). The store (x106-117) and the barracks no longer overlap. Shop counters moved to x106-113 and its stands to x104-111: the hearth's 11-tile-tall art stands over x112-122 y38-47, where a hero would be hidden (ST-1). Designer: the plan's "straight across the apron" becomes "side by side across the top".
- **Measured (tools/qa/town-crowd.html, desktop Chrome, CPU per frame p50, real art):** 40 / 120 / 240 bodies = 2.0 / 3.5 / 6.3 ms at 1440x900, 1.7 / 2.9 / 4.6 ms at 844x390@3; without nameplates 1.6 / 2.3 / 3.5 and 1.4 / 2.0 / 3.4; one body 0.9-1.0. Plates are about half the cost at 240 and are drawn for off-screen bodies too (240 plates where the phone shows ~78 tiles). L3: cull plates and units to the view and cache plates as bitmaps; the plan's fallback rule (3) is still needed at 240 on a mid phone.

## 2026-10-26 — ARCH (systems-engineer, lane/i-havora): L1 + L2 integrated; the server stands Havora
- **L1's interim arrival is gone:** `arrivalStand` / `TownPresence.arrivalOn` removed; L2's server stand (`hr_town_view` / `hr_town_here` `me`) is the only placement. `TOWN_INSTANCE` lives on L1's `stations.js`; the generator reads L1's STATIONS directly.
- **The catalogue is regenerated as `2027-01-29-havora-stations.generated.sql`** (20 stations, 636 stands = 60 players x 4 per instance); the applied 01-26 seed stays as history. It FOLDS L1's misdated `2027-01-23-havora-town-size.sql` (deleted, never applied): the generated `hr_town_maps` row is the map's size (192 x 116) and its self-check carries the old file's two checks. Bodies left on removed stands are released and re-noted; town-stands TS-4 proves it on production's shape.
- **Live old client (v0.2.48/49, 24 x 14) after the apply:** its tiles stay inside the wider bound; it never reads stands; `hr_town_walkers` is unchanged; a walker past 24 x 14 (only once the Havora client ships) is drawn on its nearest reachable tile. Nothing refuses, no value moves.
- **Designer/art:** the arrival yard moved IN FRONT of the gate (x78-89 y16-19 primary, nearest the doors first; the old x74-78 y20-27 block is the overflow) so a phone sees the gate on arrival (town-stations ST-8); the yard got existing style-1 props (lamps flanking the gate, crates/barrels/sacks/wheel by the tavern, trough, hay, a well, a signpost south). No new art.
- **Known:** town-stands TS-0 replays only up to 2027-01-28 (its §6 is written against the seed catalogue); a re-apply of 01-28 over Havora would refuse at §6(a), and production never re-applies it.

## 2026-10-29 — DESIGN (systems-engineer, lane/a-first-hour-leftovers): the starter bar's rune lesson moved
- **Flame Strike is off the sword's default sets** (playtest 2026-10-29 #9: struck "no Fire runes left" from minute one). Two doors were measured on the real settle: (a) drop it: no measured hunt moves (a struck slot never fires), drop-tables and forest-cave green; (b) a store rune on the default slot: nets fall Cellar 1,828 -> 1,425, Thicket 1,844 -> 1,472, Sewer party 2,024 -> 1,911 g/h for +15% Thicket Level XP, and drop-tables goes red on 18 pace/value bands. (a) shipped; (b) is a balance call.
- **Semantic conflict for the game-designer:** the sword-and-shield starter no longer meets "Spells need runes" or "Make your own runes" in its first hour (Tyler 10-25: the tutorial teaches spells and their runes). Both cards stay reactive: they come the moment the player puts a rune spell on the bar (sewer.mjs pins it with a hatchet hero and a player-added Flame Strike). Designer: decide whether the first hour should hand the player a spell (a card that asks them to add Flame Strike, store rune on) or re-tune for door (b).
- **The class is not fully killed:** a fresh hero who switches weapon still sees struck defaults (Rend, Flame Volley, Frost Lance, Arcane Barrier, Circle of Renewal, Green Sickness), each with designed own-rune behaviour (the Healer's attack-when-safe, the Barrier trigger). Designer owns that list.

## 2026-10-29 — RULED (game-designer, lane/a-starter-bars): the starter bars' rune spells
- **Rule:** no struck rune spell on a default bar unless the hero is told why and how to fix it the moment it can see it. A style's default bar is what a hero sees until its first Save (then the bar is the player's).
- **Sword and shield / sword alone** (the kit, minute one): Flame Strike stays OFF (cb6847e89). The rune lesson returns as a choice: "A spell costs runes" (Cellar, after the food cards) offers Flame Strike in an empty slot with its price per cast and the measured trade (about +15% Level XP, a fifth less gold on the first grounds); taking it brings "Make your own runes" on day one; Got it declines. No store rune on the default (door (b) is a balance change nobody chose).
- **Hammer:** no rune spell exists for it; nothing struck, nothing offered.
- **Axes (Rend), bow/crossbow (Flame Volley), wand (Frost Lance, Arcane Barrier), staff (Circle of Renewal, Green Sickness):** KEPT, each its style's identity (bleed; the area shot; the Mage's lance and shield; the party heal and the Healer's attack-when-safe). Explained in minute one by Hunts' Before you go (each spell and its family's store rune at the server's price) and in the Cellar by "Spells need runes", one struck slot after another (tests/hunt-core/sewer.mjs starter-bars). No role default moved, so no migration.
- **Rejected:** a starter rune stack (Tyler 2026-10-23: the kit carries no rune); a store rune on every default (measured -20% floor gold, drop-tables red).
- **Open, unverified:** a hero who has SAVED a bar and then switches weapon keeps the old style's moves on its bar; whether those show struck without a word was not checked here.

## 2026-10-29 — ARCH (systems-engineer, lane/a-perf-basics): the town's sheets load at sign-in; two handoffs
- **Loading <-> assets (FYI, no conflict found):** `src/world/prewarm.js` fetches and decodes the town's scene sets (the World's own `sceneSets`: six sheets, 2.5 MB, 39 MB decoded) once an account is known, so a cold Play after a release shows the town in 262 ms instead of 1,512 ms (40 ms RTT, 20 Mbps). atlas.js's rule "an image only when a scene drawing from it shows" keeps one exception, the town; client-boot B-3/B-12/B-13 hold, B-14 pins it. A hero who logs in mid-hunt also gets the town's sheets early.
- **Asset Director (proposal, not done):** the town's PNGs are 2.5 MB of a 4.06 MB cold load (atlas-havora.png alone 1.26 MB). A lossless re-encode (oxipng/zopfli: same pixels) is the next cold-load win; no PNG optimiser is installed here and the files are yours.
- **Lane C (design only):** one 4-hero settle (fire door, Mosslight, 90 s window, PGlite) is 189.6 ms of DB: apply 139 ms, read 27, perks 4 x 5. It calls hr_hunt_limit 239 times (281 index reads of hr_hunt_limits), hr_level_from_xp 150 (178 of hr_xp_table), hr_char_level 44 and hr_renown_of 11.5, and sends hr_perks_of as 4 separate statements: read the limits and each member's level and renown once per settle, and fold perks into the read.

## 2026-11-07 — RESOLVED by lane/b-ground-formula-2 (fd852dcc7): the Thicket's named pull 0 and own dials (XP 1050/1080, no HP dial), Deadly XP x1.25 / HP x1.1; the ladder reads green on lane/b-tier-dials. Was OPEN (systems-engineer, lane/b-tier-dials -> game-designer, lane/b-ground-formula): the sheet's Thicket tiers break the ladder rule
- **What:** with hunt-tiers.js reading balance-sheet.js tierRowFor (Coordinator 2026-11-07), tests/hunt-core/hunt-tiers.mjs `ladder` is RED on the Thicket: its Deadly (pull 8, dmg 2912, HP x1.2, XP x1.4, on its old monster rows) out-earns Wickstead's Normal at L8 for every way to fight (tank 27.3k vs 25.3k, hammer 63.0k vs 33.9k, mage 61.4k vs 33.4k, four 45.2k vs 34.7k XP/h) and the Sewer's for a hammer and a mage.
- **Measured, a pull exception is not enough:** the Thicket at pull 0 (the old named exception) still reads 26.2k / 36.9k / 37.0k / 37.0k against Wickstead's 25.3k / 33.9k / 33.4k / 34.7k: the x1.4 XP over x1.2 HP is the lever (the old Thicket row paid x1.08).
- **Not decided here (numbers are the designer's):** a named Thicket exception on the sheet, the Thicket's formula rows, or Wickstead's Normal. The guard stays red until then; no number was typed into hunt-tiers.js.
- **RULED (Coordinator 2026-11-07):** the rows case's "+25% XP at most" is RESTORED as it was (Tyler 11-05 tier words: "pay slightly more Level XP", +10% / +20%; §2: no guard loosened to fit numbers). The formula designer (lane/b-ground-formula-2) fits Deadly XP at x1.25 or less and closes the ladder, the gen-catalogues digest and the comment-ratio reds; this lane merges it when it lands.

## 2026-11-07 — RESOLVED by lane/b-scaled-hunts (cf5259e0d): scaled-hunts.js derives the scalable grounds and topLevel from the ground data (scaleLadderOf(OPEN_GROUNDS, HUNT_INDEX)); its `derived` check opens a test-only 50-65 ground. Was OPEN (systems-engineer, lane/b-ground-pack -> lane/b-scaled-hunts, via the Coordinator): a new TOP ground turns tests/scaled-hunts.mjs red outside its lane
- **What:** scaled-hunts.js restates each scalable ground (SCALABLE_GROUNDS: floor, top, fit) and its test holds `topLevel` to the top open ground's band end and requires every open ground under the top to be listed. A pack that opens above the Warrens (The Slake, 50-65) moves the top: "topLevel 50, the top open ground's band ends at 65" and "coppercap_warrens cannot be scaled", in a file the pack lane must not touch.
- **Proposed (scaled-hunts' call, not done here):** derive SCALABLE_GROUNDS and topLevel from the data (hunts.js / hunt-grounds.js already fold every ground pack, src/data/grounds), or read the next ground's floor at run time, so opening a ground needs no row there. A pack below the top plugs in today only once its row is typed.
- **Measured on:** origin/lane/b-scaled-hunts fc07182fe (tests/scaled-hunts.mjs rules()). The pack system itself needs nothing from scaled hunts: a pack's GROUND_ROSTER row and formula rows are what scaledRow reads.

## 2026-11-13 — RESOLVED 2026-11-14 by lane/b-barrow-integrate (the hall folded as paying rows, staged with its pack; tier 7 renamed so his prize names real items). Was OPEN (systems-engineer, lane/b-barrow-boss-room): the Krell's Hold pack's `hall` block vs the keyed-hall room kind
- **What:** this lane builds engine piece 5 as its own room kind (src/data/boss-halls.js BOSS_HALLS, hunts.js HALL_HUNTS, hunt-grounds.js HALL_GROUNDS; server hr_boss_halls + hr_boss_hall_enter). A hall PAYS: its boss and adds are plain paying rows (never `called`, no id ending `_called`), the boss's prize is his own `drops` / `xp` / `gp`, and a named add is a row `boss` and `add` both (piece 6). The pack on lane/d-barrow-data (src/data/grounds/krells_hold/pack.js `hall`, shape.js hallWhy) was written in the called-room shape: rows `lord_krell_called` etc. with `called: true`, xp 0, drops [], a separate `prize` list, and its shape.js REFUSES a hall row that is not `_called`.
- **Incompatible:** that block folded as written puts called rows in a paying room; the generator refuses it (tools/gen-hunt-sessions.mjs hallRows "a called row in the hall", and the kill bounds' CHECK).
- **Proposed fold (the pack lane's, the numbers the designer's):** hall.monsters become plain rows (`lord_krell`, `hall_hask`, `hall_grave_guard`); `prize` moves onto Krell's row as `drops` + `xp` + `gp`; Captain Hask's hall row gains `boss: true`, his own spells and an enrage-only `phases`; Krell's `phases` gains `hasten: { spell: <the Hall Fire's spell id>, cdPm: 500 }` (a group spell row in monster-spells.js at cd 20000); the fold writes BOSS_HALLS.krells_hold = { id: 'krells_hold', hunt: 'krells_hold_hall', key: 'hall_key', boss, Boss }, a HALL_HUNTS row (`hall: true`) and a HALL_GROUNDS row (`hall: 'krells_hold'`); shape.js hallWhy flips its `_called` rule. Then the catalogues regenerate and tests/boss-hall.mjs HL-ROW holds the real row.
- **Not done here:** no Krell content on this branch (the packs are not on release/v0.2.129, and the design's sample rule writes Krell after the five are played). Every hall table is empty, so nothing is served until that fold lands.

## 2026-11-16 — RESOLVED the same day (lane/b-tower-window merged origin/lane/c-key-ring 7818e6818 and reads the server's own names: chest.families [{ family, name, max, held_max, opened, held }], week_ends, key rows' family, held { bag, storage, ring }, refusal week_limit { family, used, limit }). Was OPEN (systems-engineer, lane/b-tower-window → lane/c-tower-chest): the KEY FAMILIES projection names
- **What:** Tyler 2026-11-16 put the weekly cap on chests OPENED per hero per key family (6) with a held limit per family (~30). The window shows "Chests opened this week: N / 6" and "Keys held: N / 30" and holds Use off at the cap, but origin/lane/c-tower-chest (50b37bc0b) has no field names yet.
- **Proposed shape (the window reads it in one place, src/session/tower-sections.js familyOf, TODO KEY-FAMILIES):** `chest.families [{ family, opened_week, max_week, held, max_held }]`, `family` on each `chest.keys` row, and a refusal `week_limit { opened, max }` (src/shell/tower-words.js towerRefusal). Until the server sends them the window draws no cap line and gates nothing on them.
- **Ask:** the chest lane either projects these names or renames them in those two readers + tests/tower-window.mjs section(); the daily `today`/`max_day` stays read while the server sends it.

## 2026-11-16 — OPEN (systems-engineer, lane/b-tower-window → the Tower's server lanes): the 28 tower weapons are not in the hunt-sessions catalogue
- **What:** since lane/d-tower-weapons merged into the Tower stack, `node tools/gen-hunt-sessions.mjs --check` (and tests/hunt-sessions-db G1) is RED on this branch (already at 9d20d04f5): the data puts the 28 weapons in hr_hunt_weapons (weapon type) and hr_hunt_vendor_value (+28), but the generator's OUT is 2027-04-24-tower-climb-hunt-sessions-catalogue, which runs BEFORE 2027-04-27-tower-chest-items-catalogue creates their hr_items rows. Regenerating in place fails the replay ("a vendor-value row names an item hr_items does not have"), so it was reverted here.
- **Fix (a lane-C change, not done here):** move gen-hunt-sessions' OUT_NAME to a new chain-end catalogue after the chest items catalogue (2027-04-24 becomes history), regenerate, re-pin schema-drift / restore-census, apply-order note. Natural owner: lane/c-tower-chest (in flight on the chest's server half). Without it a hero wearing a tower weapon has no server weapon type in a hunt.

## 2026-11-16 — OPEN (systems-engineer, lane/b-tower-window → lane/c-key-ring): say-why is RED on the Key Ring tab
- **What:** tests/say-why.mjs SW-1 / SW-2 on src/shell/windows/inventory/key-ring.js (resync() answers a refusal nobody shows; the tab's Unlock is off for `!!st.sc.pending || !ring.offer` with no REASONS row). Red on origin/lane/c-key-ring itself (its say-why has no key-ring row); carried here by the merge, untouched (the Key Ring is that lane's window code).
- **Fix (lane/c-key-ring):** show the resync refusal (runIntent / refusalText) and register the Unlock off-state's visible reason in say-why REASONS.
## 2026-11-15 — RULED (Coordinator, relayed to lane/a-audit-ui-1): Equip upgrades may change a WORN off-hand for a better one of its kind
- **What:** the designer's 2026-10-22 call "Equip upgrades never touches the off-hand" (src/shell/upgrade-plan.js, tests/alpha-windows.mjs AW-21) against audit 2026-11-15 F8 (a tank still wore the Practice Shield at Level 31; the audit's later evidence has it at 87).
- **Ruling:** the audit's evidence outranks the 10-22 call. A worn off-hand takes a strictly better one of its own kind (a shield for a shield, a spellbook for a spellbook of its discipline, the role unmoved). Still never: a piece into an EMPTY off-hand, a shield for a spellbook, the ammo.
- **Where:** lane/a-audit-ui-1 (upgrade-plan.js sameOffhand; AW-21 rules and mutants). Same lane, accepted with it: a bane counts only where it wins (F15, the Level-band scope).
## 2026-11-15 — RESOLVED IN THE BUILD, for the Coordinator and the designer to confirm (systems-engineer, lane/c-krell-uniques): physical resistance is capped at 10%, not 40%
The lane's brief and the board's 2026-11-14 item 4 say `resistPm.physical` sits "under HERO_RESIST_PM's 40% cap" and name `damage.js landHit` as the hook. The designer's 2026-11-15 special-attribute section (the newer text, measured on the real settle) says a cap of its own, `HERO_RESIST_PM.physicalMax: 100` (10%), at the `elements.js` seam, and its guard (tests/special-attributes.mjs SA3) holds every row inside that cap. Built to the 11-15 design: a tank's damage is mostly physical, so 40% physical would be worth far more than 40% of one element. One piece exists (3%), so no hero is near either number today. Raising it is one data value (`src/data/elements.js`) and one mutant line.

## 2026-11-15 — RESOLVED 2026-11-16 (game-designer, lane/d-audit-f22: advice changed, Krell untouched; PRIORITY_BOARD 3a): Krell's card asked for "a tank and a healer", and that pair cannot win under Level 88
Measured on the real settle (tools/balance-sim/boss-call-table.mjs --hall krells_hold, rows "Size:", the door's bar, 40 tries a row): two heroes 0% at 85 (33 of 40 run out of the ten minutes), 78% at 88, 88% at 98; three heroes 65 to 90% at 85, 85 to 90% at 88, 90 to 95% at 98. I changed the card's words, not his numbers: "Party: a tank, a healer and a third hero" and "Two heroes: Level 88 or higher" (src/data/grounds/krells_hold/pack.js `hall.words.bars`). Yours to rule: keep the lines, or re-fit (his HP or the ten minutes) so a pair on the card's bar wins at the floor. No line advises Challenge on or off.
## 2026-11-16 — OPEN (systems-engineer, lane/a-audit-leftovers; for the game designer): Rares in a bulk sale, and the scaled-hunt switch
- **Rares (audit F18):** "Sell spare gear" (Shop) still leaves Rare-only pieces out, per the 10-14 "never sold unasked" reading. Replayed on the local world 11-16 at Level 60 with 145 outgrown stacks: 41 of the 54 it left were outgrown Rares (Bronze Sword, Adept Sash, Boarhide Belt...), a press each. The bag's new "Select outgrown" selects them WITH the Rares: the player sees the selection, and the confirm says "Rares: N" before the sale. If "unasked" covers a selection too, pass `isRare` to the bag's outgrownIds call (src/shell/windows/inventory/state.js); if not, Sell spare gear could name them the same way.
- **Scaled hunts (audit F26):** the client half is built (the Hunts list tag and the ground page's section). It shows only once the server switch `scaled_hunts` is on (seeded off by 2027-03-21-scaled-hunts.sql); turning it on is the Coordinator's one-line migration (testers first, per that file's header). The dials read as multiples ("Level XP ×47 · Gold ×22 · Monster damage ×9.3 · Monster HP ×17" for a Level 60 on the Cellar): Tyler's 11-07 words were "+x%", which reads +4,627% there. Designer: confirm the multiples.

## 2026-11-16 — OPEN (systems-engineer, lane/a-training-no-blow; for the game designer): training end words are labels now
- **What:** Tyler (live, 11-16) got a hunt's no-fight sentence for a yard session ("You went 10 minutes without landing a blow, so you headed home..."). The engine no longer ends training for no blows, and every training end reads as a short label (src/data/text/training.js ended_*): "Training ended (out of gold)", "Training ended (12 h reached)", "Training stopped", "Training ended" (the end card's own label form, src/data/text/summary.js end_*). They replace the 11-15 coherence pass's sentences ("Wren finished Defense training. That was the longest one session can run.") on the end card and in the Training window too, per the 11-14 genre-label ruling.
- **Also:** the away line says "Wren trained Ranged at the Training Yard" / "Still training." (no stamina), and a hero off screen gets a `trained` alert ("Wren: Training ended (out of gold)", button Open Training) instead of the hunt's "has ended · Start again". Designer: confirm or reword the rows; no code needs to move.

## 2026-11-17 — OPEN (systems-engineer, lane/a-next-steps re-landed on set/v0.2.135; for the game designer): the March tally gold predates the income dial
- **What:** lane/d-audit-balance-2's five March tally rows (F28: Ford 2,560 gp, Slake 3,040, Barrows 3,400 party, Pyre 3,880, Hold 4,290) were measured against kill coin before lane/d-supply-prices' income dial (x0.7 from the Glade up). Both now ride set/v0.2.135; the rows are unchanged in 2027-04-25-tally-krell-uniques.generated.sql (amended in place). Re-read them against the dialed coin, or rule they stand.
- **Also, set-level:** `node tests/ground-pack.mjs` (and `--fold`) is red on origin/set/v0.2.135 itself (5e2bffbb6): the income dial moves hr_hunt_vendor_value rows the applied March pack files restate ("not additive"). Not from this lane; same 20 findings before and after the merge.

## 2026-11-17 — RULED (Coordinator, same day; built on set/v0.2.135): the income dial makes a dialed ground's pack a world move
- **What:** an item sells at the highest dial of the grounds that drop it (src/data/loot-sale.js), so opening or folding a ground with `gpFit` under 1 lowers hr_hunt_vendor_value for base items it drops (Krell's Hold: 32 archmage/dawn/dragonhide rows). `tools/pack.mjs ship` refuses that as "not additive". On the set only the partly folded krells_hold-2 met it (GP-3); its vendor rows are carried by the v0135/Tower hunt-sessions files, so GP-3 now leaves carried tables to them. A STAGED dialed ground (Ox Road, Pauper Vaults, Wyvern Roost, Carter's Rest) will hit the same refusal at its ship: the designer rules whether a pack may carry its own dial's vendor moves (an upsert) or every dialed ship goes through a whole hunt-sessions file.
- **Ruling and build:** a pack carries its dial's sale prices and the flat tiers. tools/pack/sql.mjs PACK_MOVABLE lets hr_hunt_vendor_value rows move with a pack (upserted, never lost; every other table still refuses a move); krells_hold-2 regenerated in place (`tools/pack.mjs ship krells_hold --in-place`, staged files only). GP-5 reads a hunt-keyed row as its hunt's alone, so the Tower's rat spawn row is the Tower file's, not the Cellar's.

## 2026-11-17 — OPEN (systems-engineer, lane/fix137-wiki-formulas; for the game designer and art director): the combat formulas name monster numbers no screen shows
- **What:** the Coordinator's "cut any line a player can't use" (kill the class, from Tyler's read of the Formulas tab) meets Tyler's 11-08 FORMULAS ARE PUBLIC ("no hidden special cases"). Hit chance, Max Hit, Monster hit chance and Monster Max Hit work on a monster's attack, defense, own base hit chance and internal tier (1-6); the monster page (src/shell/monster-facts.js) shows none of them, only Health and Max Hit. The pages said "15% more on tier 4" and "4 from tier 3": a tier no screen shows, and one the monster page's own "Tier" row (Normal, Dangerous, Deadly) reads as something else.
- **Built (this lane):** every math term stays (Tyler's ruling outranks); the tier lists became labels by value with no tier number ("Tougher monsters: +15%, +30% or +50% defense", "Tougher monsters: attack × 2.2, 3 or 4"). Nothing else on those four pages was cut.
- **Ask:** decide whether the monster page shows Defense (def × its class factor, so the tier line goes), Attack and its own hit chance, or the four pages stop naming numbers a player can't see. Either changes the monster page's approved 11-11 labels, so it is not built here.

## 2026-11-18 — RESOLVED (lane/d-jewelry-2b): the guarantee jobs are on each piece's own bench (the Banded Signet's on Smithing), a plain-shipping piece or a perk the piece can't roll throws at load, and the bench reads the switch from `features`. Re-staged as three 2027-05-16 files; the branch's three 2027-04-24 files are retired unapplied (the `jewel_jobs` section and its two tables were not rebuilt). The lucky-finds note below stays the designer's.
## 2026-11-18 — (was OPEN) (systems-engineer, lane/d-jewelry-sample; for whoever rescues lane/c-crafted-jewelry): the jewel guarantees predate the per-piece bench
## 2026-11-18 — OPEN (systems-engineer, lane/d-jewelry-sample; for whoever rescues lane/c-crafted-jewelry): the jewel guarantees predate the per-piece bench (its lucky-find item RULED 2026-11-18, game-designer)
- **What:** lane/c-crafted-jewelry (fa3b3b93b, never merged, behind `jewel_guarantees`) builds its boss-gem jobs, its `jewel_jobs` section and its odds words on JEWEL_SKILL = 'crafting' and on JEWELRY_RECIPES as one Crafting list. lane/d-jewelry-sample (Tyler 2026-11-18: all jewelry is Smithing) removed JEWEL_SKILL: each JEWEL_PIECES row names its bench (`skill`), JEWELRY_RECIPES_BY_SKILL joins each bench, the Banded Signet's jobs and Hallmarks moved to Smithing, a piece whose slot has no played perk ships plain (no gem job), and the earrings' pool is Steady and Focus.
- **Also (for the game designer):** every lucky-find row (tests/lucky-finds.mjs, content pack 1: 24 rows, T1 to T6) stands on a monster no open ground spawns, so the system reaches no player. Removing the Wolf Cub's and Giant Bat's crafted jewels (JS2) put tiers 1 and 2 under the guard's 4-a-tier floor; LEFT_BY_RULING counts each toward its tier only while the item drops nowhere. Keep the system (move rows onto walked grounds) or cut it with its guard.
  - **RULED 2026-11-18 (game-designer; board "2026-11-18 Designer rulings" row 4): CUT the system, keep the items.** All 24 rows sit on 24 monsters no open ground spawns, and its twin, field salvage, is the same (45 rows, none on a walked ground), both read from the data: 11 of the 24 lucky items and all 45 salvage items already drop on a walked ground since the drop homes, so the hidden rows only duplicate them, and moving the rest would keep a hidden drop against FORMULAS ARE PUBLIC (11-08) and put 7 jewelry and cloak pieces back on monsters after Tyler made those crafted. The `lucky` and `salvage` flags and their guards go and every item stays; the 13 with no home wait as rows (7 jewelry and cloaks for the crafting phases, 6 weapons and armor for a later ground's Rare table, Wraithsilk Shroud and Panther's Eye Pendant keeping their names, 11-14), and no player loses anything, since no player could reach a row.
- **For the rescue:** put each guarantee job on its piece's own bench (`JEWEL_PIECES[plain].skill`), skip pieces with no gem job, read the bench level per skill (jewelry-sections.js jewelLevelOf(cs, skill)), regenerate gen-jewel-jobs on top of 2027-05-09-jewelry-sample-catalogue. Nothing of it was brought onto lane/d-jewelry-sample.
## 2026-11-18 — RULED 2026-11-18 (game-designer; raised by systems-engineer, lane/d-fists-phase1): "best lone gold" and "within 15% XP" pull apart under Level 40
- **What:** measured on the real settle (tools/balance-sim/fist-table.mjs solo --proxies, plate, alone on Normal, 3 seeds x 3 h), the fist sample is comfortable everywhere (lowest typical HP at or above the hammer's, 0 to 21 foods an hour where the hammer eats 0 to 70, no deaths), and holds best lone-melee gold from the Warrens (42) up, where food bills decide gold. Under 40 the bills are a few hundred gold an hour, so net gold is kill rate: the fist sits 4 to 9% under the best melee at the Thicket, Wickstead and the Glade, and 27% at the Sewer (the hammer's sweeps on its packs). Its XP is -8 to -13% there (inside 15%), -27% at the Sewer, -15 to -19% at 42 to 57 (tier 3 and 4 stand-ins).
- **Why the brief's dials can't close it:** the strikes' mana is not what limits them (8, 6 or 4 mana: casts within 1%, XP within 1%; only the drink bill falls), and the own heal moves food, not kills. A what-if only (not built): Charged Hands on a 4 s cooldown is +3 to +8% XP (Sewer still -22%) and still under the best melee's gold under 40.
- **Ask:** rule whether the gold promise starts where supply bills bite (about Level 40), or give the fist more single-target damage (the wraps' strength, or the strike's numbers or cooldown: design numbers this lane may not tune). The Sewer gap is the no-area identity on a pack ground.
- **RULED 2026-11-18 (game-designer; board "2026-11-18 Designer rulings" row 3): the promise's gold leg is scoped, the tier 1-2 numbers stand.** Under 40 gold is kill speed, so "best lone gold" there means out-killing the hammer and axes, which would make the fist the best lone melee outright, against Tyler's "good at everything, great at nothing"; so under 40 the gold leg reads within 15% like XP (re-measured fresh: -7.3 to -8.7% at the Thicket, Wickstead and the Glade), from 40 it is best lone-melee gold (held at the Warrens, the Ford and the Slake), and the Sewer is not graded (every one-target way reads 27-33% under the hammer's sweeps there, and the advice sends a hero alone to the Thicket). The tier 3+ wraps are sized in phase 12 to read inside 15% XP on the lone path (the stand-ins read -15.2 to -18.7%), and Charged Hands keeps 6 s; plan §7 is updated.
## 2026-11-18 — OPEN (systems-engineer, lane/a-first-hours; for lane/a-hunt-prep-truth and lane/b-ui-wave2): two audit rows that are another lane's cause
- **A21 carried line = A26.** On main a food put on a bar slot through the bar's own Configure action leaves the Hunts card at once (local world: Cooked Lobster on slot 3, the card then names the Cooked Shrimp it replaced, which is true). The audit's "Carried: 15 Cooked Lobster" after the lobster "was on the bar" matches A26 (a setup edited in Hunt prep while the card reads the live bar). Not changed here; A21's "Pick Salted Lobster is text, not a button" is the weak-food line (A25's), also left to lane/a-hunt-prep-truth.
- **window-fit rule 3 leaves a heading alone over a sticky foot.** A scroll region that trims to a whole repeated box can end with that box's heading as its last line (the hunt summary's "Back in town" at 1280x720 on main; the Tower's Climb box once its column grew, fixed here by giving the Tower row `rise`). A heading should go with its first row. Shared code (src/shell/window-fit.js, AW-90): for the UI lane.
## 2026-11-16 — OPEN (game-designer, lane/d-catacomb-mode -> the special-attributes owner, via the Coordinator): two field names for "+N skill while worn"
- **What:** the built engine reads `meleePlus` / `rangedPlus` / `magicPlus` / `defensePlus` (`src/core/combat.js SKILL_PLUS_FIELDS`, lane/d-tower-weapons, guarded by `tests/hunt-core/tower-weapons-play.mjs`). The hidden special-attribute catalogue (`src/data/special-attributes.js SPECIAL_ATTRIBUTES`, lane/d-special-attributes, read on lane/d-armor-line-v2) names the same thing `skillB: { ranged: 2 }` with `hook: 'skill'` (owed). Two fields for one rule means a piece written to the catalogue does nothing in the engine.
- **Proposed:** the catalogue's `defense` and `skill` rows point at SKILL_PLUS_FIELDS (hook null, built), and its sample's Mudlark's Mitts takes `rangedPlus: 2`. The Catacomb armor (board "2026-11-16 The Unmarked Catacombs descent") uses the built fields.
- **Also for that owner:** the catalogue sizes "less from every blow" only from tier 5 (it was `resistPm.physical`, now `steadyPm`, lane/c-physical-to-steady). The Catacomb plate boots propose `steadyPm` 10 / 15 / 20 / 30 at tiers 2 / 4 / 6 / 7 (Bronze's 10 is under the Level 1 Traveler Cape's 15). One table should hold the sizes. Not measured.
- **Added 2026-11-16 (lane/d-catacomb-armor, MEASURED):** the catalogue's "+1 Defense on a helmet at every tier" is worth more than a tier of helm armor. A lone tank, the twin with Defense one level up (the built +skill rule), against the NEXT tier's helm on that tier's ground: damage taken an hour 0.951 at 30 (Glade), 0.920 at 60 (the Slake), 0.955 at 88 (Krell's Hold), and 0.926-0.952 over its own twin (`node tools/balance-sim/catacomb-armor.mjs`, first run, 3 seeds x 1 h). So a +Defense helm out-guards the next tier's helm everywhere. The Catacomb plate helm carries +Melee instead. The catalogue owner should re-size `defense` (or keep it off helmets below a tier the line can't pass).
## 2026-11-21 — OPEN (systems-engineer, lane/bl-baseline -> BL-3 lane/bl-targets and the matrix lane, via the Coordinator): two judges for one change
- **What:** `tools/balance-program/balance-matrix.mjs --diff` judges a patch against `standards.mjs` bands (INTO / OUT / UNTARGETED). Tyler 2026-11-21: the game is being redone, so rulings about the current game are neither constraints nor targets. The baseline regression (`tools/balance-program/baseline.mjs --compare`) therefore reads no band: it judges only against BL-3's new-game targets, from a `hearthrise.balance-targets/1` file (schema: `docs/design/balance-baseline/08-regression.md` section 4), and reports plain movement against measured noise where no target exists.
- **Proposed:** BL-3 writes its machine-readable targets in that schema, or names the fields it needs (a change to `baseline/compare.mjs` alone). Once it exists, `balance-matrix.mjs --diff` reads the same file, so the quick patch loop and the full regression judge by one rule.
- **Update 2026-11-22 (half resolved):** BL-3's `tools/balance-program/targets.json` landed (same schema name, its own row shape). The regression reads it natively and by default: a row's band readers are judged on reader VALUES stored at join, against BL-3's range, never the band's old one (`baseline.mjs --selftest` 3b). STILL OPEN for the matrix lane: `balance-matrix.mjs --diff` still flags INTO / OUT against `standards.mjs` ranges. The proposal stands: read `targets.json` there too (`baseline/compare.mjs` `loadTargets`, `fromInventory`).
## 2026-11-22 — OPEN (systems-engineer, lane/gold-per-hour -> R10 and the designer, via the Coordinator): the gold estimate reads the scale's grounds and a Risk ratio
- **What:** the Hunts window's "About N gold an hour, before supplies" is `hr_gold_estimate` (1060, generated by `tools/gen-gold-estimate.mjs` from `src/core/gold-estimate.js`): wage(min(Level, band top)) x a Risk ratio (`src/data/gold-estimate.js`, Careful 630 / Steady 1000 / Bold 1270 permille, from r9/summary.txt), none under the band floor. It reads the hero's LEVEL, not the held Danger step: the wage cannot read a wave-1 step (`src/data/wage.js`), and `danger_held` is written by whichever Risk last played (Careful holds ~170 steps under Steady).
- **R10:** a ground added to `DANGER_GROUNDS` turns `node tools/gen-gold-estimate.mjs --check` red until the generator is re-run (while 1060 is STAGED it regenerates in place). Intended: no scale ground goes without its line.
- **Designer:** Bold's 1270 is a watched-session ratio (2.7-4.9 h with deaths); over a 10 h day Bold earns under Steady (C-4). Lever row `econ.gold-estimate-risk`. Wave 2 swaps the Level for the held absolute step.
## 2026-11-22 — OPEN (systems-engineer, lane/ledger-l7-l10 -> the designer and the econ-levers owner, via the Coordinator): gold follows depth an hour, and a wave-1 step is not a Level
- **Cause (L10):** a pull a step deeper paid `payStepCoin` more coin but carried `powerStep` more health, so it took that much longer: coin an hour rose 0.05% a step, and loot (a kill's rows, no depth term) fell with kills an hour. Measured (`roads-run.mjs --plan l10`, Muster L60 Steady, 6 seeds x 8 h, a borrowed Greater Mend buys +38 held steps): gold a hero-hour +59 +- 63 before, +2,284 +- 117 after (coin +16.9%; `1.004^38` is +16.4%).
- **Fix:** `src/core/hunt/danger.js COIN_STEP = (1 + payStepCoin)(1 + powerStep) - 1` a pull, so an HOUR a step deeper pays `payStepCoin` (V13). Nothing moves at the reference step. `PAY.coinPm` 7000 -> 6400 keeps the anchor: Steady L60 reads 1.014 of wage(60), L63 1.022 (v1-climb base/levels/high from the econ starts, 6 seeds x 8 h, before and after).
- **Still out of band (designer):** a Level 70 four holds ~35 steps deeper than Level 60 on the same ground (one wave-1 step is not one Level), so its hour pays ~1.14 of wage(70), and Careful at L70 ~0.73 (EL-PAY bands 0.95-1.05 and 0.75-1.33). Levers: wave 2's absolute steps (the clean fix), or refStep / the floor. The kept reading `econ/after-muster-L60.json` is not re-cut here; re-measured on today's set it was already off before this lane (EL-KIT 0.305, EL-STANCE 0.528). The gold estimate's Risk ratios (1060, `src/data/gold-estimate.js`) were measured before this and now read Careful/Steady ~0.76, Bold/Steady ~1.06.
## 2026-11-22 — OPEN (systems-engineer, lane/moves-pass-1 -> the designer, Tyler via the Coordinator): the tank's line is 20%, not the ruled 15%, because 15% kills on Steady
- **What:** the holder's line (`src/data/danger.js HOLDER.linePm`, lever `danger.holder-line`, read in `src/core/hunt/danger.js marginPm`): the lap's holding tank reads each stance's two thresholds times linePm / 1000. Tyler approved 15% on Steady (600) on the premise "Steady still never dies" (23-spell-audit.md section 10.2; RD-Q3 a: "a death there is a bug in the triggers").
- **Measured** (`spell-run.mjs --plan PT`, Muster L60 Steady, the tank's four with the Challenge on its new "my HP is at least 60%", 18 paired seeds x 8 h): 600 held 632 with 4 tank deaths, 700 held 623 with 5 (4 by a Muster Knight, 1 by Captain Hask), 800 held 613 with 0. With the Challenge unconditioned all three had 0. A line is safe only over the largest single blow, and a Knight's lands between 17.5% and 20% of a Level 60 MID tank's HP.
- **Shipped:** 800 (Steady 20% and 36%). One number to change: 600 is the ruling with deaths; or keep 800; or a line that reads the largest blow the ground can land (a bigger change). The margin at 800 is thin on Muster, so a ground with harder Brutes needs it re-read.
## 2026-11-23 — OPEN (systems-engineer, lane/foundations-block -> the designer, lane/monster-formula, lane/drop-formula, via the Coordinator): what the foundations moved
- **Depth is cut in absolute steps** (`src/core/bands.js depthAt`, the one home the browser's `danger-sections.js depthOf` and the edge's `drop-rate.js depthOf` now read). Same floor and top; the reference reads depth 8 / 10 / 11 (Muster / Ford / wings) where the own-step cut read 14 / 10 / 13. drop-formula's Rare odds by depth (x1..x3, `depthRarePm`) keep their shape against the reference's own depth, so nothing moves at the reference; other depths are now even slices of strength.
- **monster-formula:** both lanes add `refLevel` to every `DANGER_GROUNDS` row with the same values (60 / 52 / 175 / 175): a textual conflict only. Its `dangerDial` returns `formulaPull(...)`; this lane sets `dial.dropPm` after the literal (keep it on the formula path: it reads the pull's size over the reference pull's). On a formula ground the bridge's refStep is a free anchor: put it where `bandAbs` puts the reference and re-measure floor and top with `tools/new-ground.mjs` (MID now defaults to the row's refLevel).
- **Loot follows depth** (`PAY.payStepLoot` 0.4%, the coin's): Muster L60 loot a hero-hour Careful 3,627 -> 2,282, Steady 2,859 -> 3,273, Bold 2,876 -> 3,449 (paired against candidate loot-depth-off, 6 seeds x 10 h). Careful's income falls to 0.70 of Steady's (was 0.80). Designer: `PAY.floor` is the lever if Careful's gold reads low. `tests/econ-levers.mjs` still judges the kept econ reading (26 F-3), so its EL-KIT is not this tree's.
- **Muster's bridge:** the MID four at refLevel 60 holds 622 on this tree against the hand refStep 590 (pay 1.08x the hours table); new-ground would cut 620. Left at 590 (the econ anchors were set on it); re-cut with the economy after rank 1.
- **Bold on Hask's Ford at Level 52 dies 10 to 12 times in 6 seeds x 10 h** with or without the skill weight (candidate skill-weight-off), past V1.1's 0.4 to 1.1 a day. Not this lane's change; a reading for the designer.
## 2026-11-22 — OPEN (systems-engineer, lane/e2-e3-statuses -> the designer and the monster-formula lane, via the Coordinator): Armor Break reads a defence monsters barely have
- **What:** 22-fists-support.md section 6 asks Armor Break to be "monster defense -N%, read where `defenceReduction` comes off a blow". Built that way (`src/data/statuses.js armor_break` armorPm -250, read in `src/core/hunt/damage.js defenceKept`). But a monster's defence takes `floor(def x 0.03)` off a blow (`src/core/combat.js defenceReduction`): 0 for every monster in `src/data/monsters.js` but Lord Krell (def 80: 2 points). So Armor Break as written moves no blow on any open ground, and Coal Hands, Coal Palm, Hard Coal, Deep Cracks and Nest Heat would read dead in the Lab.
- **Proposed (the designer's pick, a data change either way):** (a) Armor Break as `takenPm` on its own key `armor_break` (it then adds to Sickness and the Mark, like "Fire damage taken"), e.g. +6% for "-25% armor"; or (b) the monster-formula lane gives monsters a defence that matters and the row keeps `armorPm`. The engine reads both today; the row is hidden.

## 2026-11-22 — OPEN (systems-engineer, lane/flame-temper-build -> the designer and lane/drop-formula, via the Coordinator): four seams in 21's build
- **Mana Leech has no ledger channel.** `src/core/power-ledger.js` clamps offense, defense and heal; a mana leech raises mana, so it takes no room in the consumable slice of 6 and D-1 ("three imbuements fill it") does not hold for a mage's helmet. Designer: count sustain as `heal` in the ledger, or give the slice a mana channel. Until then no imbuement writes ledger rows (21 section 3.9 owes the conditions anyway).
- **The old 1% rungs still apply on the scale.** Temper on steps adds through the gear part (`gearPartPm` reads `temperSteps`), but the shipped rungs (`blowsPm`/`armorPm` from `hr_perks_of.temper`) still fold into `powerPm` and `mitigate` on Muster Barrows. 21 says the new Temper replaces them on scale grounds. The cut is one line in each of `danger.js powerPm` and `mitigation.js` on `dangerOn`; it moves Lab baselines (world-tick-parity, V1), so it waits for the switch `temper_steps` to flip with the Temper Kit.
- **`hero_pity.misses` is not a kill count.** 21 section 4.3 names `misses`; a count of missed kills cannot keep one long-run rate across rows of different odds and depths. It holds millionths of x, the sum of p0 over the hero's misses since its last find (`src/core/personal-loot.js`; `PERSONAL_LOOT.pityGrowPm` 4000 and `pityBasePm` 438 from the integral, p90 1.94x the mean). drops lane: roll Rares as `pityChance(heroChance(ch, n, luck) x depth, misses)` and write `pityAfter` per roll in the settle's own write; the SQL twins are `hr_hero_chance`, `hr_pity_chance`, `hr_pity_after`.
- **Measured T2 under its pass.** `v1-climb --candidate temper-5` held 624.6 against the tree's 620.2 (+4.4, T1 passes +5 +- 2); `power-tier-ahead` held 632.7 (+12.5 on this run, r9 measured +20.8), so tier minus Temper 5 is 8.1, under T2's 12 (8 seeds, unpaired, se about 5). Re-run paired before ruling; the tier's own move is R9's question, not Temper's.

## 2026-11-23 — OPEN (systems-engineer, lane/stage3-pipeline -> lane/monster-formula, the designer, lane/foundations-block, via the Coordinator): the amount pipeline on the scale
- **What landed:** on the Danger scale every amount is one step contest (`src/core/hunt/amount.js`, levers `src/data/amount.js`): a hero blow = move share x `blowTopBp[weapon]` / 10000 x refHealth(ground refLevel) x s^(offense - R) x one roll; a monster blow = its row blow at the step x `pressurePm` / 1000 x refHealth(hero L) / refHealth(refLevel) x s^(R - armor or ward); heals and shells by the caster's rating over its own Level. R = `bands.js bandAbs refPm`. The armor chain, monster `def`, crit dice, the after-the-chain `powerPm` are gone on the scale; weakness, bane, element, crit (its mean), marks, dealt/taken statuses, slows and Tempering are conditional steps (`stepsOf`, held to `conditionalStepsMax` or their slice). Off the scale (tier grounds, the Tower, halls) nothing changed: engine-parity's four tier pins held to the byte.
- **monster-formula (stage 4) must read the pipeline, not `REF.dps`:** the reference output is `AMOUNT.blowTopBp[w] / 10000 x refHealth(L) / 2` HP a basic blow's mean at a gap of 0, every move a share of it; a monster's blow is read against `pressurePm` and the hero's armor/ward rating. Its derived rows still type `aim`, `evasion` and `def` (the old chain): on the scale `def` is no longer read, `aim`/`evasion` only while `AMOUNT.hitRoll` holds. Its `monsterArmorPm` (role armor) has no reader on the scale yet: Armor Break reads it there or nothing (today it reads `defenceReduction`, which the pipeline does not).
- **The bridge on hand-typed rows:** old monster rows were sized against the old hero blow, whose share of a reference health FELL with Level (Level 60 hammer 55/740 = 7.4%, Level 175 33/1890 = 1.7%). The pipeline holds the share, so the Catacomb wings' four outclassed its old band (Steady 1.77x the hours formula at the top). Re-cut with `tools/new-ground.mjs --write` (both OPEN, staged, no catalogue moved): Bone Wing ref 480 -> 540, floor 380 -> 500, top 540 -> 605, kills 160 -> 185; Flooded ref 440 -> 530, floor 350 -> 480, top 505 -> 595, kills 150 -> 200. level-curve C7 green on all four grounds. Muster and the Ford held their reference (618 / 593 against 590), not re-cut.
- **Designer, the gear weights (C-2):** under the pipeline a gear tier counts only its rating steps: a weapon a tier back moves Muster's Steady hold -1.7 +- 5.1 steps and armor -7.8 +- 2.4 (before the pipeline -15.5 and -22.2, the old chain amplified a tier through stats). C-2 asks 1 to 3 depths (about 20 to 60 steps). The levers are `POWER.weightGearPm` / `weightGearBelowPm` (1000 / 500) and `weightSkillPm`; with `weightGearPm` 1000 a Level with the same kit adds nothing (+3 Levels: +4.8 steps).
- **Designer and foundations, the band rule (NG-3 red on the Bone Wing):** with a tier worth about 10 to 20 steps the fresh LOW four holds 30 steps under the MID four (515 vs 545), so the cut band is 105 steps wide and the fresh four reads depth 4 (NG-3 wants 3 at most). This is 27 K-6's prediction (a band about one tier wide); `BAND_RULE.floorUnder` 10 and the NG-3 depth were sized on the old chain's 160-step bands. Not loosened here.
- **K-2, the roll to hit:** `AMOUNT.hitRoll` true (0.3.0). Off, every monster blow lands and Muster's Steady four holds 370 instead of 618 at `pressurePm` 450; the end state needs `pressurePm` re-solved (stage 1): at 200 with the roll off the Steady four holds 642 (XP 1.16x, no death in 18 seed-days), so about 230 puts it back on 590 (one lever: the monsters landed about half their blows under today's to-hit).
- **foundations-block (merged here, WIP):** `tests/bands.mjs` BD-1 is red after formula-overhaul's hours formula (the career skill lines moved 2 points at Level 175+; `SKILL_LINE` needs its re-read): inherited, not this lane's numbers.
