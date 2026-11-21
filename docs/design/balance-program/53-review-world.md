# Balance program 53: design review of the world (monsters, hunting grounds, bosses)

Game designer, 2026-11-21. PHASE A was reading and analysis. PHASE B (section 0) measured the top proposals on the real engine with the balance matrix and changed three verdicts. No game code, data or migration is changed. Briefs of record: `45-design-brief.md` (main) and `40-formula-brief.md` (every change is placed at its layer).

**Labels.** EVIDENCE = read from the data on this set, from a cached run, or from real play, with its source. HYPOTHESIS = my design reasoning, not measured. Sources used:

- DATA: `src/data/*` and `src/core/*` on `set/v0.2.144` (0a97126c3), read by two scratch scripts that load the real modules.
- GRID: `tools/balance-program/ground-rates.json` (commit 8b03c56aa, MID kit, 2 seeds a cell, 422 rows). "x contract" is Level XP a hero-hour over `1385 x L^1.274`.
- SOLVER: `tools/balance-program/paths.json` (the best-path solver on those rates).
- REAL: `10-real-players.md` and `11-krell-hunt-2026-11-20.md`.
- 51-baseline.md had not landed when this was written.

---

## 0. Phase B: what was measured, and what changed

**The instrument.** `node tools/balance-program/balance-matrix.mjs --diff <patch> --blocks grounds --seeds 1 --hours 1 --workers 2`. That is the ground axis: every ground at both ends of its band, every party size and every tier, 422 cells, the same dice before and after. The "before" half is today's tree, so it also replaces phase A's cached grid. Every "x contract" below is the matrix's own `xContract`.

**The calibration caveats, printed on every run.** The matrix's four kills 1,386 an hour on Krell's Deadly against Andy's real 1,251 (+11%). Its tank takes 96% of the damage against 69% real, so the back row is safer than in real play. Its store bill is 1.9 times the real one, so every party gold number is a lower bound on what a real party keeps and every lone harder-tier loss is overstated by up to that much. Cells at Level 185 and above are provisional. 51-baseline.md had not landed when this was written.

**No run flagged a band.** All four diffs read IMPROVED 0, REGRESSED 0, UNINTENDED 0. That is because the ground axis carries no band rows in `standards.mjs` (the report's band list is empty), not because nothing moved. So I read the cells, and "unintended" below means a cell outside the grounds or tiers the patch aimed at. There were none in any run.

### 0.1 The four measurements

| # | Patch | Layer (44 ids) | What it changes | Cells moved | Outside its target |
|---|---|---|---|---|---|
| 1 | `patches/world-1-one-fit.json` | formula, C-MON-STATS, X-PARTY-FIT | the party fit set to the plain fit (health 2.5 to 1, blow 0.75 to 1, XP a point 0.8 to 1, the three inner patches and two coin dials neutral) | 90 of 422, on the Sewer, the Warrens and the Muster Barrows | none |
| 2 | `patches/world-2-dangerous-as-built.json` | coefficient, C-PULL (knob `tierPull`, Dangerous only) | Dangerous brings Normal's pack | 110 of 422, Dangerous cells on 11 grounds | none |
| 2b | `patches/world-2b-dangerous-five.json` | the same | Dangerous brings five on every ground | 110 of 422, the same cells | none |
| 3 | `patches/world-3-slake-signature.json` | content row (one spell row in the Slake's pack) | Cold Bilge from 1.8 to 3.6 times the Bargeman's blow | 24 of 422, all on the Slake | none |

### 0.2 Patch 1: the party fit removed. My phase A cause was wrong.

Before and after, x contract, MID kit:

| Cell | Lone, Normal | Four, Normal | Four, Deadly | Lone kills an hour |
|---|---|---|---|---|
| The Warrens at 32 | 2.03 to 2.10 | 2.15 to 1.28 | 3.49 to 3.24 | 197 to 401 |
| The Warrens at 50 | 1.36 to 1.36 | 1.31 to 0.74 | 2.42 to 1.90 | 231 to 458 |
| The Muster Barrows at 55 | 2.00 to 2.06 | 2.15 to 1.31 | 2.97 to 3.02 | 226 to 469 |
| The Muster Barrows at 75 | 1.78 to 1.73 | 1.63 to 0.93 | 2.79 to 2.60 | 299 to 584 |
| The Sewer at 5 | 4.14 to 4.10 | 4.02 to 2.92 | 4.30 to 3.44 | 177 to 342 |
| The Sewer at 25 | 1.08 to 0.88 | 0.74 to 0.41 | 0.87 to 0.49 | 360 to 577 |

- **REFUTED: "XP a pull grows with health."** A lone hero's kills double and its XP an hour does not move. The fit is not why a lone hero is overpaid on these grounds.
- **What the fit does:** it feeds a four on Normal. Without it a four on Normal falls to 0.74 to 1.31, the same as on every other ground (0.62 to 1.03 from Hask's Ford to the Catacombs, where a four kills a flat 570 to 700 an hour whatever its Level: it is short of monsters, not of damage). With it, a four on Normal reads 1.31 to 2.15.
- **REGRESSED by the patch:** with the tier lift back on, a lone hero on the Muster Barrows' Deadly at 55 dies (low point 24% to 0) and loses 105,000 gold an hour. A lone hero's store bill on Normal at the Muster Barrows' floor goes from 10,300 to 34,700.
- **IMPROVED by the patch:** a four's net gold on the party grounds' harder tiers (the Muster Barrows' Deadly at 75: +4,200 to +16,500), because coin follows kills.
- **Verdict changed.** S2 goes from REMOVE to REDESIGN: keep the fit as one encounter type with three numbers and delete its three inner patches. That is 44's call 5, and I now agree with it. The overpay is a kill reward problem (44 step R12, the kill-rate term). COMPUTED, since XP a kill is linear in the fit: an XP fit about a third lower on the Warrens and the Muster Barrows puts a lone hero at 1.36 and 1.21 at the Muster Barrows' two ends, a four on Normal at 1.46 and 1.11, and a four on Deadly at 2.02 and 1.90. Lone and four read almost the same there today (2.00 and 2.15), so one number fixes both. That is the measured reason to keep the fit: without it they come apart (2.06 and 1.31) and no single reward fits both.

### 0.3 Patches 2 and 2b: what Dangerous should bring

A lone hammer on Dangerous, today (the full box or six), with the pack as built, and on five. x contract, net gold an hour, typical low point:

| Cell | Normal, for scale | Today | As built (patch 2) | Five (patch 2b) |
|---|---|---|---|---|
| The Glade at 16 | 1.94, +9,300, 78% | 2.58, -13,000, 25%, deaths | 1.72, +5,400, 60% | 2.39, -4,900, 36% |
| Hask's Ford at 45 | 1.58, +13,900, 89% | 3.28, -41,600, 32% | 1.61, +13,300, 83% | 2.65, +2,100, 43% |
| The Pyre Field at 70 | 1.56, +26,100, 80% | 2.50, -37,800, 29%, deaths | 1.61, +24,500, 73% | 2.31, -7,900, 39% |
| Krell's Hold at 85 | 1.66, +27,800, 83% | 2.64, -55,700, 27%, deaths | 1.72, +25,600, 75% | 2.33, -13,000, 38% |
| Krell's Hold at 110 | 1.33, +31,800, 90% | 2.22, -3,300, 40% | 1.38, +28,100, 86% | 1.88, +18,000, 45% |
| The Ox Road at 112 | 1.64, +30,200, 82% | 2.34, -67,800, 24%, deaths | 1.68, +26,900, 73% | 2.13, -37,600, 35%, 1 death in 1,000 h |
| The Catacombs at 165 | 1.46, +33,000, 80% | 2.24, -74,000, 10%, deaths | 1.51, +30,500, 71% | 2.20, -39,300, 29%, 1 death in 1,000 h |

A four on Dangerous, x contract: Krell's Hold at 85 reads 2.52 today, 1.04 as built, 2.39 on five. The Ox Road at 112 reads 2.64, 1.07, 2.49. Hask's Ford at 45 reads 3.19, 0.95, 2.12. No deaths in any of them.

- **Phase A's proposal (the pack as built) fails.** It is Normal plus 4% XP for a lone hero and it drops a four under 1.1. It is not a tier.
- **Five works.** For a lone hero it is 35 to 65% more XP than Normal for most or all of the hour's gold, a low point of 35 to 49%, and no deaths in band from the Glade to Krell. With the store bill read at its real size (the 1.9 caveat) the lone loss is about half what the table shows. A four keeps 2.1 to 2.5.
- **REGRESSED on five:** a four on Dangerous at Hask's Ford's floor earns 2.12 where a lone hero on the same tier earns 2.65. That is the 11-16 line ("every Dangerous party stands at or over its heroes alone") failing on one ground. On Krell's Hold and the Ox Road the four is at or over the lone hero.
- **Verdict changed in size, not direction.** Dangerous is the lone hero's hard tier at a pull of five, not the pack as built. The six "both tiers bring six" overrides become "Deadly brings six."

### 0.4 Patch 3: a signature at double dose

The Slake with Cold Bilge doubled:

| Cell | Store bill an hour | Net gold an hour | Low point, worst tenth | Deaths in 1,000 h |
|---|---|---|---|---|
| Lone, Normal, 50 | 0 to 0 | +14,000 to +14,000 | 77% to 73% | 0 |
| Four, Normal, 50 | 4,800 to 4,800 | +2,000 to +2,000 | 94% to 94% | 0 |
| Pair (tank and mage), Dangerous, 50 | 31,700 to 46,500 | +900 to -11,600 | 33% to 19% | 0 to 2 |
| Pair (bow and healer), Deadly, 50 | 24,800 to 33,600 | +2,700 to -4,900 | 44% to 11% | 0 to 7.5 |
| Four, Deadly, 50 | 15,700 to 17,900 | +6,400 to +4,600 | 68% to 33% | 0 to 0.25 |
| Four, Deadly, 65 | 13,200 to 13,900 | +10,200 to +10,400 | 77% to 48% | 0 |

- **On Normal a signature's dose does nothing.** A pull of four is dead before the Bargeman casts. So "turn the dose up" is wrong for Normal. A signature has to be a matter of how often (the spell's cooldown, the caster's weight in the pack), or it has to live on the harder tiers.
- **On the harder tiers it bites, and it bites small parties first.** A pair's bill rises 35 to 47% and its hour turns from a small profit to a loss. A four's bill rises 5 to 14% and its worst moments fall from 68% health to 33%. That is the right shape: a party that answers the frost (a lining) keeps its hour, and the matrix shows the unanswered cost is real.
- **Nothing off the Slake moved.** A signature is a content row that stays on its ground.
- **Verdict stands, with a rule added:** a ground's signature is carried by its harder tiers at full dose, and on Normal it is taught by frequency. Whether a player then changes what they bring is still a playtest (section 7).

### 0.5 What the matrix could not measure

| Proposal | Why | Layer | Stays |
|---|---|---|---|
| Risen grounds (4.1) | the harness has no cell for a ground played above its band | formula: C-SCALED and C-MON-STATS at any Level. Its XP share is an output of R12 (E-X11). R22 is "endless modes read any Level" | HYPOTHESIS on the share. The anchor is `22-endgame.md`: a scaled Warrens reads 1.08 to 1.17 of the at-Level ground for a lone hero today |
| One boss system (4.6) | a hall is not on the ground axis. The engine-reds lane's hall grader is the reading (below) | formula: a hall boss is the `boss` role with one hall coefficient, at R21 when hand rows read the formula. Content rows for the prize | the merge is design. The win rate is measured by lane/c-engine-reds |
| Re-banding (4.8) | a monster's Level is on its row, so a band move is 5 rows a ground plus a re-fit | content rows, then R12 | HYPOTHESIS |
| The named rare as an event (4.4) | needs `phases` read through the row door | formula: R3 (X-ROW-DOOR-BYPASS) | HYPOTHESIS |
| Regions 4 to 7 (4.7) | not built | content | a Director's judgment |

### 0.6 Krell's hall after the spell rule (input from lane/c-engine-reds)

After the spell rule every one of 36 tested parties wins Krell's hall 38 to 40 times in 40. Before the to-hit change one lineup won 2 in 40. The hall's stated fit is 80 to 100% wins. The card's food advice now reads Salted Lobster (180 gold) where it read Swordfish (432), and the new HA-FLOOR rule requires that some named party loses on the next cheaper food.

My verdict. A win rate of 95 to 100% for every lineup is inside the letter of the fit and outside its purpose. If all 36 parties win, the party you bring does not matter, and a hall is the one fight in the game that should ask for preparation. I would not touch Krell's rows to fix it. Krell is a hand-typed row (18,000 health, attack 247), one of the 118 that 44 lists under X-HAND-ROWS. The fix is at the formula layer: a hall boss is the formula's `boss` role at his Level times one hall coefficient, the same for every hall, sized so an in-band MID four on the card's food wins 80 to 90% and the weakest named lineup or the next cheaper food loses. HA-FLOOR is the right guard for that and I would keep it. Until R21 lands, leave the hall as it is: an easy hall with a weak prize is the smaller problem, and the prize is the one to fix first (4.6). The lobster line is right. It matches what Andy's real four ate.

### 0.7 Against 44, 46 and 47

| Source | What it says | Where I stand |
|---|---|---|
| 44 call 5, X-PARTY-FIT | keep "built for a party" as an encounter type with three numbers, delete the three inner patches, judge again after R12 | **Agree.** Patch 1 decided it against my phase A position |
| 44 R12, X-TIER-PER-GROUND | one tier table, per-ground tier dials deleted, the pull a ground's rooms can hold stays as content | **Agree.** Patch 2b turns six "Dangerous and Deadly bring six" rows into one field, Deadly's pull |
| 44 R9, E-X02 | the eleven 0.7 gold fits fold into the coin line | **Agree.** Same finding as my 2.9 |
| 44 R21, X-HAND-ROWS | 118 hand rows read the formula | **Agree.** 103 of them are in no hunt and should be deleted, not converted |
| 44 X-CALLED-ROOM | "a called fight is practice and a keyed hall is the reward": keep both | **Disagree.** One real use. Four reviews (46, 54, 59 and this one) and 47's C15 ask to merge. Recommend the merge |
| 46 change 4 | past a ground's band the tier ladder keeps going, from the one stat formula, free, replacing scaled hunts by the hour | **The same idea as Risen grounds, reached independently.** I take the Director's simpler door: free on every ground, not only past the frontier. My phase A version kept the hourly fee under the frontier. Zero real uses says the fee is the problem |
| 46 change 3 | a Hall Key is a banked boss fight and Call out folds into it | **The same conclusion, reached independently** |
| 47 C9 | keep six grounds as the planning number and open a region as four grounds and its hall, then two | **Agree.** It keeps the 11-18 ruling and gets my point (ship the distinct four first). I withdraw "four for good" until the Morrow Hills are played |
| 47 C15 | merge Call out, with one rule kept: a mid-region boss's pieces stay repeatable ("one key, one roll") | **Agree**, rider included |
| 47 C21 | plain Dawnsteel drops in the Hold. Krell's daily roll keeps the uniques, the Trophy and the tier 7 gem. Krell's five sidegrade weapons replace the Dawnsteel rows | **Agree.** It is my call 5 with the plan's two riders |
| 47 M10 | a risen or scaled ground drops its own rows at its own rarity, and its hourly drop past tier 7 is stock and chips | **Agree.** It is the rule 4.1 needed |
| 57 (social), phase B | "a party buys reach, not rate". The cause of the party table's trouble is the tier, not the table | **Agree, and patch 2b is the tier half.** Dangerous on five gives the lone hero reach of its own, so Deadly is what a party buys |
| 56 (progression) | past about Level 145 a blessed MID four loses more XP to deaths on Deadly than Deadly adds | **No conflict.** It makes a survivable middle tier more valuable, which is patch 2b |

---

## 1. One screen for Tyler

**Verdict.** The world is well built and under-designed. The engine is good. One stat formula makes every monster, and a new ground is mostly data. That part I would build the same way again. What I would not build the same way is what the grounds are for. Today the game has one hunting ground with fifteen skins. From Hask's Ford on, every ground is the same five roles at the same weights, the same pull of four, the same 60 second respawn and the same three tier dials. The XP of every ground is then fitted by hand to the same line. So the answer to "where should I hunt" is a lookup, not a decision. Real players found the lookup. They spent 32% of all hours on one ground and ran Deadly on 79 of 99 recorded party hunts.

**The five changes that matter most.**

1. **Old grounds rise to your Level, for free, once you pass the last open region.** We already built this as scaled hunts. Make it the standing answer to "what do I hunt past the frontier" and the thing that turns fifteen grounds into fifteen choices. Today a four runs out of open grounds on day 27 and you ruled 120.
2. **Party grounds keep their formula, and their XP comes down by about a third.** In phase A I asked to remove the party-ground formula. I measured that and I was wrong about the cause. With it removed a lone hero earns exactly the same on the Warrens and the Muster Barrows, because kills double and XP a kill halves. What the formula really does is feed a party on Normal. It is the only place a four reaches its pace without a harder tier. So it stays, as "a ground where a party can hunt on Normal", and the overpay is fixed where the formula audit already put it, in the kill reward.
3. **Bosses pay what grounds never drop, and there is one boss system.** Krell's daily prize is a 2.86% roll at a weapon the Ox Road drops from an ox about every 45 minutes. Andy held 19 Hall Keys and fought no Hall. Call out is a third way to fight the same two bosses and has been used once.
4. **Every ground asks one question, at a dose you can feel, and says it on the card.** The engine already has shooters, menders, group spells, armor and elements. Shooters are the only one that changed a real hunt. Give each ground one signature and turn it up until it changes what you bring.
5. **Dangerous brings five monsters. Deadly keeps the full box.** Measured. Today both bring the full box, and a lone hero in the right band loses 40,000 to 70,000 gold an hour on either and dies at the floor. On five, a lone hero at Krell's Hold earns 40% more XP than Normal, spends most of the hour's gold, sits near 40% health and does not die. That is "struggle or pay" for one hero. A four on five still earns about what it does today.

**What is actively harming the game.**

- The kill reward on the three party grounds. A lone hero reads 2.0 times the pace contract at the Muster Barrows' floor and 1.78 at its top, against 1.56 at the Pyre Field's floor. The route on the Hunts page is 1.5 to 1.9 times slower than the best route because of it.
- Krell's prize. The climax of the second region pays the next region's everyday drop.
- The harder tiers for a hero alone. Dangerous and Deadly are the same full box, so a lone hero has Normal and nothing else. Phase A said the tiers carried no risk. That was the old grid. On the matrix a lone hero on Deadly at the floor of the Slake dies about once a minute in the harness, which sends it straight back in.

**What I would add.** Nothing that needs a new engine. Risen grounds (change 1), a signature per ground (change 4), and boss mechanics on the one named rare each ground already has, so that rare is an event in the log and not a bigger health bar.

**What I would remove.** 103 monster rows no hunt uses, three hunts with no ground, the three patches inside the party-ground formula, Call out as its own system, and about 35 of the 51 per-ground hand dials.

---

## 2. Systems review

### 2.1 What exists (EVIDENCE: DATA)

| Thing | Count | Notes |
|---|---|---|
| Monster rows | 190 | 87 stand in some hunt. 103 stand in none |
| Monsters on open walked grounds | 52 | plus 3 in Krell's Hall and 4 called copies |
| Monsters on staged grounds | 20 | Carter's Rest, the Ox Road, Wyvern Roost, the Catacombs ground |
| Open walked grounds | 11 | Cellar, Thicket, Sewer, Wickstead, Glade, Warrens, Hask's Ford, the Slake, Muster Barrows, Pyre Field, Krell's Hold |
| Staged grounds | 4 | Levels 110 to 142 and 165 to 185 |
| Hunts with no ground | 3 | Bramble Edge, Goblin Warren, Ridge Camp. Not listed, cannot be entered |
| Roles | 6 | swarm, regular, glass, heavy, elite, boss |
| Monster spell shapes | 6 | group, ring, blast, cone, line, mend |
| Casters on open grounds | 14 of 52 | 1 shooter, 1 mender. Hask's Ford and the Muster Barrows regulars cast nothing |
| Boss rooms | 3 | two called rooms (Rat King, Chief Coppercap), one keyed hall (Krell) |
| Bosses on a ground's route | 5 | Rat King, Grayjaw, Rook, Chief Coppercap, Captain Hask |
| Tiers | 3 | one table for every ground, plus per-ground overrides on 11 grounds |
| Per-ground hand dials | 51 | XP fit on 14, gold fit on 11, tier rule on 11, 2 named monster exceptions (`21-combat.md` B8) |

### 2.2 The monster stat formula and the six roles. KEEP.

**What it is for.** A monster is a Level and a role. `STAT_FORMULA` writes its health, blow, aim, evasion, defense, XP and coin. This is exactly the architecture brief 40 asks for, and it is already the reason a ground costs art and rows and not tuning.

**Does it create real differences under automated combat?** Partly. EVIDENCE (DATA): a heavy has 1.2 times the health, 0.8 of the blow and 3 times the defense. An elite has 1.6 times the health and 4 times the defense. A glass has 0.75 of the health and 1.1 of the blow. Those are real stat differences. HYPOTHESIS: under automation they average out. A pull is always a mix, the hero kills in the engine's target order, and the player never sees a pull where the mix forced a different choice. A role changes how long a pull takes. It does not change what you bring.

**Earns its place:** yes. It is the foundation. The roles need a consumer on the player's side, which is section 4.2.

### 2.3 The party-ground fit. REMOVE (merge into the one formula).

**What it is.** `STAT_FORMULA.fit.party`: on the Sewer, the Warrens and the Muster Barrows a monster has 2.5 times the health, 0.75 of the blow, 0.8 of the XP a health point, its own to-hit shift, its own coin factors and a blow shape, and its harder tiers lift nothing. That is a second stat formula keyed on the ground. Brief 40 section 2 names this case: "Party calculations that differ depending on the hunting ground."

**What it does.** EVIDENCE (GRID, a lone hammer on Normal, x contract):

| Ground | Fit | At its floor | At its top |
|---|---|---|---|
| The Sewer (5 to 25) | party | 6.43 | 1.10 |
| Coppercap Warrens (32 to 50) | party | 1.95 | 1.24 |
| The Muster Barrows (55 to 75) | party | 1.93 | 1.62 |
| Mosslight Glade (16 to 31) | both | 1.91 | 0.93 |
| Hask's Ford (45 to 60) | both | 1.39 | 1.03 |
| The Slake (50 to 65) | both | 1.19 | 0.94 |
| The Pyre Field (70 to 90) | both | 1.29 | 1.12 |
| Krell's Hold (85 to 110) | both | 1.35 | 1.04 |

The Muster Barrows at Level 75 pays a lone hero 1.62. The Pyre Field, the next ground, pays 1.29 at its own floor. EVIDENCE (SOLVER): the fastest lone path is Sewer on Deadly from Level 6, the Warrens on Deadly from 32, the Muster Barrows on Deadly from 55 to 90. For a four the Muster Barrows holds from 55 to 110, which removes the Pyre Field and Krell's Hold from the route. EVIDENCE (REAL): the Warrens is 423 of 1,334 real hero-hours, entered from Level 10, at 2.24 x contract.

**Why.** HYPOTHESIS: 2.5 times the health at 0.8 of the XP a point is 2.0 times the XP a kill. The walk between pulls and the respawn do not grow with it, and area blows clear a pack in about the same swings. So XP an hour rises with health a pull. The XP fits of 0.76 and 0.81 on those two grounds are the hand patches that tried to take it back.

**Earns its place:** no. The idea is right: some grounds should want a party. The layer is wrong. See 4.3.

### 2.4 Monster spells, shooters and mends. KEEP the model, change the dose.

**What they are for.** Tyler, 2026-11-08: "the point of Monsters having aoe spells is so the whole party takes damage", "the tank absorbing the boss hits and the casters dodging it". One spell model, six shapes, bounded by data. This is good architecture.

**Do they create real differences?** EVIDENCE (REAL, Krell): Hask's Lookouts shooting the back row put 28% of all damage on the healer. The simulator put 97% on the tank. That is a monster mechanic changing a real party's hunt, and the only one on record. EVIDENCE (GRID): 0 deaths in all 422 cells, lone Deadly at the floor included. A four's 10th percentile low point is 70 to 94% health on Deadly on every ground. EVIDENCE (DATA): a regular's spell is 1.0 to 1.5 times its own blow on a 14 to 32 second cooldown, held under 35% of a floor hero. HYPOTHESIS: at that dose a spell is noise inside the food bill. The element of a group spell only matters where spells are over a fifth of damage taken (`21-combat.md`), and nobody has printed that share.

**Earns its place:** yes, as the vocabulary for 4.2. Today most rows are flavor.

### 2.5 Boss phases (adds, guard, enrage, hasten). KEEP, and generalize.

**What it is.** A boss row's `phases`: at half health his adds come and he takes only `guardPm` of each blow while one stands. Under a quarter his attack rises. Krell's Hall Fire casts twice as often under his line. Each is "a question the action bar answers" (Challenge, an area slot, the Target setting, the eat lines). This is the best piece of idle-combat design in the area, because the answer is set once before the fight.

**The gap.** EVIDENCE (DATA): it is read only for rows marked `boss`. Five ground bosses and three rooms use it. The named rare on every ground (the Bannerman, the Provost, the Gatekeeper, the Landlord, the Wagonmaster) is an elite: more health and defense, nothing else. HYPOTHESIS: the mechanic is general. A guard, a wave and an enrage are monster properties, not boss properties. See 4.4.

### 2.6 Classes, weapon weakness and elements. KEEP.

EVIDENCE (DATA): 11 classes. A matching weapon does 1.20 times the damage with 1.15 times the accuracy. A weak element is 15% more, a resisted one 25% less. This is the one place where grounds already differ in a way a build answers:

| Ground | Class mix | Best weapon by class |
|---|---|---|
| Greenhaven | vermin, mammal, humanoid, plant, human | mixed |
| Hask's Ford, the Slake, Muster Barrows, Pyre Field | undead, 16 of 17 rows | hammer, with single overrides |
| Krell's Hold | 4 human, 1 undead | ranged |
| Carter's Rest | 5 humanoid | sword |
| The Ox Road | 3 undead, 2 human | hammer and ranged |
| Wyvern Roost | 5 dragon | ranged. Swords are resisted |

HYPOTHESIS: this is a real ground-choice axis for a lone hero and a real seat choice for a party, and it costs nothing more. It also means the Barrow March favors the hammer for 40 Levels. That is acceptable in a game where a hero can train a second weapon. It is not acceptable if the card does not say it.

### 2.7 The old roster and the three ground-less hunts. REMOVE.

EVIDENCE (DATA): 103 of 190 monster rows stand in no hunt. Outside `monsters.js` they are read by `botd.js` (cut by ruling 30-9), the glyph table and the art manifest. Bramble Edge, Goblin Warren and Ridge Camp have no ground, are not listed, and cannot be entered. None is on the roadmap. Their names include fillers the identity rule bans (Dark Wizard, Void Mote, Nightmare). A new ground authors its own rows in a pack, so nothing needs these as stock.

### 2.8 The three tiers. REDESIGN.

**What it is for.** One choice a ground: safe, or more XP for more risk (Tyler, 11-05 to 11-08).

**What it is.** EVIDENCE (DATA): Dangerous is pull 8, blow x1.17, health x1.10, XP x1.10. Deadly is pull 8, blow x1.33, health x1.15, XP x1.25. Six grounds override the pull to 6 for both. So Dangerous and Deadly are the same box with two sets of percents. Dangerous was pull 5 until 11-16 and was raised so a four on it would not earn under its heroes alone.

**Is it a decision?** EVIDENCE (REAL): of 99 tier-recorded party hunts, 79 are Deadly, 20 are Normal (4 hero-hours) and 0 are Dangerous. 2 deaths in 359 hero-hours on Deadly. Andy's four stood 5 to 9 Levels under Krell's floor on Deadly for 39 hero-hours with 0 deaths. EVIDENCE (GRID): for a lone hero Deadly is a real trade. It adds about 10% XP and costs most of the hour's gold (Krell's Hold at 85: +21,300 gold on Normal, +5,300 on Deadly. The Warrens at 32: +1,700 against -20,200). For a four it costs almost nothing.

So today it is a decision for a lone hero (XP against gold), a formality for a four, and Dangerous has no owner. Ruling 21-3 (harder tiers hit harder) is already approved and I build on it in 4.5.

### 2.9 Per-ground hand dials. REMOVE most.

EVIDENCE (DATA): the gold fit is 0.7 on every ground from the Glade on. That is one coefficient written eleven times. Five tier overrides say the same sentence: "Groups of four were killing them too fast for the XP they give." Six say "both harder tiers bring six." HYPOTHESIS: the first belongs in the coin formula, the second goes with the party fit and the party table, the third is a real content row (a pull size) and stays. That leaves an XP fit a ground, which is honest: a map's walking is a content fact. Target: about 1.3 dials a ground, as `21-combat.md` proposed. The formula audit lanes own the moves. I only name the layer.

### 2.10 Ground bosses, keyed halls and Call out. See 4.6.

| System | What it is | Use on record |
|---|---|---|
| Ground boss | stands in the last pocket of a route, pays like a monster with a rare table | every hunt |
| Keyed hall | a key from the ground opens one room, the boss pays, one daily prize roll a hero | REAL: one keyed entry, four daily loots, one person |
| Call out | stamina and gold open a stronger copy that pays nothing but a roll at the table and one call-only piece | REAL: 1 use, 11 days ago |

Three systems answer "fight this boss again." The called copies are hand-typed rows (Rat King 2,000 health and attack 42 where the formula row is 612 and 6) with their own spell copy (`slag_rain_called`) and their own reward door (`calledSwing`). Under brief 40 those are exceptions with no formula behind them.

### 2.11 The Burning Tower and the Catacombs descent. KEEP as ruled.

Rulings 22-1 to 22-7 stand: one Levels-a-floor row, chest weapons as real upgrades, reforging first, the climb inside Carry on, the descent fought on what you carried. I have nothing to add to those and would not reopen them. One Director's note. The Tower is a weekly errand with a chest at the end. It is not the answer to "what do I do past the last region," and section 2.7 of the standards (R4) still has no answer. That is 4.1.

### 2.12 Scaled hunts. REDESIGN into 4.1.

Built, switched off, 0 real uses. Bought by the hour (40 gold x Level), XP at 760 permille. Its ruled job is narrow: a drop from an outgrown ground. I think it is the most important unused system in the game.

### 2.13 The Bestiary as a reason to pick a ground. DEFER (the deep dive is queued, Tyler 11-11).

One number for that dive. EVIDENCE (GRID): a lone hero on Carter's Rest kills 20 Landlords an hour. The Bestiary's stages are 2,500 to 20,000 kills (Tyler 10-20). COMPUTED: stage 1 of the Landlord is 125 hunted hours and stage 4 is 1,000. The lone solver spends about 135 hours in that band. So the first stage of a ground's rare takes the whole band and the last takes seven bands. The stages cannot be finished without a way to hunt an outgrown ground at your Level. That is one more consumer for 4.1.

### 2.14 The regions roadmap. REDESIGN the shape, DEFER the build. See 4.7.

---

## 3. Content rationalization

Verdicts: KEEP, REMOVE, MERGE, REDESIGN, ADD, DEFER. The eight criteria are given in full for every significant row in sections 4 and 5. This table carries the one-line reason.

### 3.1 Hunting grounds and rooms

| # | Ground (band) | What it is for today | Evidence | Verdict |
|---|---|---|---|---|
| G1 | Mill Cellar (1 to 4) | the tutorial room | Normal only, outgrown at 5 | KEEP |
| G2 | Meadowbrook Thicket (5 to 15) | the first solo ground (Tyler 10-21) | lone 2.73 at 5, 0.73 at 15. On no solver path because the Sewer on Deadly beats it from 6 | KEEP. It becomes the route again when G3 is fixed |
| G3 | The Sewer (5 to 25) | the first party ground | lone Deadly at its floor reads 6.69 x contract with 0 deaths. It is the fastest lone path from 6 to 16 | REDESIGN: the one formula (4.3). A ground "balanced for parties" must not be the best lone ground |
| G4 | Wickstead (8 to 18) | a second solo ground for 8 to 18 | three grounds cover 5 to 18, which the lone solver passes in 0.9 days. One ground covers 16 to 31, which takes 3.2 days. On no solver path. Real hours negligible | REDESIGN: re-band to about 20 to 32 (4.8) |
| G5 | Mosslight Glade (16 to 31) | the only ground for 16 to 31 | second most real hours (347) | KEEP. Its two tier health overrides go with 4.3 |
| G6 | Coppercap Warrens (32 to 50) | a party ground with a boss | 32% of all real hours, entered from Level 10. Chief Coppercap is 5 of 22 real deaths | REDESIGN: the one formula (4.3) |
| G7 | Hask's Ford (45 to 60) | the March's entry | four undead, no spell, no boss. Used by the lone solver for 45 to 55 only | KEEP as the plain entry. Give it a signature (4.2) |
| G8 | The Slake (50 to 65) | a second ground beside the Ford | same four roles, same class, 10 Levels of overlap with G7. On no solver path. One real player | REDESIGN: re-band to about 58 to 72 as the lone hero's ground beside the Muster Barrows, with frost as its signature (4.8) |
| G9 | The Muster Barrows (55 to 75) | a party ground with Captain Hask | on the fastest path 15 to 35 Levels past its band for every party size | REDESIGN: the one formula (4.3) |
| G10 | The Pyre Field (70 to 90) | the fire ground | on no fastest path for any party size, only because G9 overpays. Best lone gold of its band (22,700) | KEEP |
| G11 | Krell's Hold (85 to 110) | the castle, the region's end | the longest single-ground stretch in the game: 25 Levels, about 17 lone days. The Lookouts are the one mechanic that changed a real hunt | KEEP |
| G12 | Carter's Rest (110 to 125, staged) | Last Ember's ground of the first Morrow pair | used for 2 Levels: the Ox Road opens at 112 and pays 19% more XP and 39% more gold | REDESIGN: a faction pair must pay alike (4.8) |
| G13 | The Ox Road (112 to 128, staged) | First Flame's ground of the pair | 1.26 at its floor, 1.08 at its top. It is not too strong. It holds to 165 because nothing better is built above it | KEEP. The "37 Levels past its band" finding is a runway gap, not an Ox Road problem |
| G14 | Wyvern Roost (125 to 142, staged) | dragons, ranged-weak | no gear rows at all. Lone gold 9,100 after the Ox Road's 22,500 | ADD its loot before it is judged (items area) |
| G15 | The Catacombs ground (165 to 185, staged) | the room-and-corridor hunt Tyler asked for | no gear rows. Nothing is drafted for 142 to 165 | ADD its loot. DEFER opening until 142 to 165 exists |
| G16 | Bramble Edge, Goblin Warren, Ridge Camp | nothing. No ground, not listed | DATA | REMOVE |
| R1 | The Rat King's Hall, Chief Coppercap's Hall (called) | Call out's two rooms | 1 real use | MERGE into keyed halls (4.6) |
| R2 | Krell's Hall (keyed) | the region's end fight | 19 keys held, 0 fights in the 10 hour hunt | REDESIGN the prize and the key queue (4.6) |
| R3 | The Burning Tower | a weekly run | ruled 22-1 to 22-7 | KEEP |
| R4 | The Catacombs wings | the descent | ruled 22-4 | KEEP as ruled |

### 3.2 Monsters

Every placed monster was read. They fall into groups, so the table is by group. No placed monster is a re-skin by the letter of DESIGN_STANDARDS section 5 (each has a role, a class and a part that feeds a lining). The problem is one level up: the grounds are re-skins of each other.

| # | Group | Rows (about) | Evidence | Verdict |
|---|---|---|---|---|
| M1 | The common majority (swarm or regular) | 15 | the first kill of every pull. Pays the ground's part | KEEP |
| M2 | Heavies with a marked spell (Barn Spider, Grave Guard, Stable Troll, Yoke Ox, Bull Wyvern, Bone Wall) | 6 | a cone, ring or line at 1.0 to 2.0 times a soft blow. A shield braces it | KEEP |
| M3 | Heavies with a group spell (Walking Vine, Goblin Digger, Bargeman, Stoker) | 4 | the Bargeman's Cold Bilge is the strongest dose in the game (1.8 times, every 12 s) | KEEP. These are the signature carriers of 4.2 |
| M4 | Heavies with nothing (Slime, Sump Slime, Briarcoat, Orchard Boar, Brook Bear, Fordsunk) | 6 | health and defense only | KEEP below Level 16. The Fordsunk takes the Ford's signature |
| M5 | Shooters (Hask's Lookout, Slate Thrower, Ledge Wyvern) | 3 | the Lookout moved 28% of real damage onto the healer | KEEP. The best idle mechanic we have. One more ground in the March should have one |
| M6 | Menders (Pyre Priest, Drover) | 2 | the answer is the Target setting, set once | KEEP. No measurement of what a mend is worth exists. Phase B prints it |
| M7 | Glass with no spell (wasps, bats, Skulker, Ledger Wight, Mudlark, Lurcher, Cairn Wight, Vault Leech) | 10 | fast, fragile, hit hard | KEEP |
| M8 | Glass casters (Kobold Tosher, Glade Poacher, Turncoat, Coal Runner) | 4 | a blast or a line a ranged hero steps out of | KEEP |
| M9 | The named rare of a ground (Dire Gray, Cistern Spider, Goblin Sluicer, Hobgoblin Foreman, Bannerman, Color Sergeant, Muster Knight, Provost, Gatekeeper, the Landlord, Wagonmaster, Brood Wyvern, Keeper Dunn) | 13 | an elite: 1.6 times the health, 4 times the defense, the Rare rows. 7 of 13 cast nothing | REDESIGN: each gets one phase trait (4.4) |
| M10 | Ground bosses (Rat King, Grayjaw, Rook, Chief Coppercap, Captain Hask) | 5 | Grayjaw and Rook are elites with a name. They have no phases and no spell | KEEP. Grayjaw stays plain (a first ground teaches the plain fight). Rook gets a phase row |
| M11 | Krell's Hall (Lord Krell, Hall Hask, Hall Grave Guard) | 3 | adds, guard, enrage, a named add, a hastened spell | KEEP. The model for every later hall |
| M12 | Called copies (4 rows) and `slag_rain_called` | 5 | hand-typed stats outside the formula | REMOVE with R1 |
| M13 | The Cistern Spider and the Culvert Bat | 2 | 8 of the 13 real deaths under Level 16 | KEEP the rows. They are a symptom of G3: the Sewer is where new heroes are sent by its XP |
| M14 | Formula exceptions (Rat King's attack, Hask's Lookout's blow) | 2 | each has a written reason | KEEP the Lookout's until 4.2 sizes shooters. The Rat King's goes if the Sewer's floor moves |
| M15 | The old roster | 103 | in no hunt | REMOVE |
| M16 | Yard Dummy | 1 | training | KEEP (the home area's) |

### 3.3 Systems and mechanics

| # | System | Verdict | Section |
|---|---|---|---|
| S1 | The stat formula and six roles | KEEP | 2.2 |
| S2 | The party-ground fit | REDESIGN (was REMOVE: phase B, section 0.2). Keep the type, delete its three inner patches | 4.3 |
| S3 | Monster spells: group, ring, blast, cone, line | KEEP | 2.4 |
| S4 | Shooters | KEEP | 2.4 |
| S5 | Mends | KEEP | 2.4 |
| S6 | Boss phases | REDESIGN (any monster may carry one) | 4.4 |
| S7 | Classes, weapon weakness, elements | KEEP | 2.6 |
| S8 | The three tiers | REDESIGN | 4.5 |
| S9 | Per-ground hand dials (51) | REMOVE about 35 | 2.9 |
| S10 | Ground bosses on the route | KEEP | 2.10 |
| S11 | Keyed halls | REDESIGN | 4.6 |
| S12 | Call out | MERGE into S11 | 4.6 |
| S13 | The Tower | KEEP as ruled | 2.11 |
| S14 | The Catacombs descent | KEEP as ruled | 2.11 |
| S15 | Scaled hunts | REDESIGN into Risen grounds | 4.1 |
| S16 | The old dungeons | REMOVE (ruled 22-10) | |
| S17 | The Bestiary's kill stages | DEFER (deep dive queued) | 2.13 |
| S18 | The gather slider and nodes on a ground | KEEP. It is a real ground axis (the Thicket's 18 trees, the Warrens' 17 rocks). From the Ford on, a ground has 2 to 6 nodes of one kind, so the axis fades. Home area | |
| S19 | Faction standing by ground | KEEP as designed. It forces grounds into pairs, which 4.8 uses | |
| S20 | The regions roadmap | REDESIGN | 4.7 |
| S21 | A ground's signature | ADD | 4.2 |
| S22 | The named rare as an event | ADD (on S6) | 4.4 |
| S23 | The ground card's "what this ground asks and pays" | ADD (words on data that exists). Art Director for the layout | 4.2 |

### 3.4 Counts by verdict

| Verdict | Grounds and rooms | Monster groups | Systems | Total |
|---|---|---|---|---|
| KEEP | 9 | 13 | 10 | 32 |
| REDESIGN | 7 | 1 | 6 | 14 |
| REMOVE | 1 | 2 | 2 | 5 |
| MERGE | 1 | 0 | 1 | 2 |
| ADD | 2 | 0 | 3 | 5 |
| DEFER | 0 | 0 | 1 | 1 |

(G15 is counted once, as ADD. M12 is counted as REMOVE.)

---

## 4. The proposals, with the eight criteria

### 4.1 Risen grounds: an outgrown ground rises to your Level. REDESIGN of scaled hunts. CRITICAL.

**Phase B.** Not measurable on the matrix (section 0.5). The Game Director reached the same idea independently (46 change 4), and I take his door: free on every ground, with the ground's tier ladder simply continuing past its band. Rule 1 below is withdrawn. 47's M10 supplies the drop rule. Layer: formula (C-SCALED, C-MON-STATS), shares derived at R12, any Level at R22.

**The problem.** EVIDENCE (`50-standards.md` 2.7): a four at 12 hours a day leaves today's open grounds on day 27 and everything staged on day 60. Tyler ruled 120 days at Early Access (call 7). A four gains about 69 Levels a month past 110 and a region is 55. Regions 4 to 7 as sketched are 24 more grounds. The team cannot author Levels as fast as players gain them, and no chase past the last region exists (R4). This is the one place where "unlimited Levels" is not yet true: the Levels are unlimited and the world is not.

**The proposal.** Every ground has a Risen form. Its monsters are the same rows put through the same stat formula at the leader's Level, exactly as the Tower already does for any roster (`src/core/hunt/tower.js` towerMonsters: "ITS ROWS ARE THE STAT FORMULA AT LEVEL F"). Rules:

1. Below the top of open content, a Risen ground is what scaled hunts are today: bought by the hour, under the at-Level ground on XP (ruled 11-07, 22-9). No change.
2. At or above the top band of the last open region, Risen grounds are free and are the standing content. They pay under what a real frontier ground would (HYPOTHESIS: 0.85 to 0.9 x contract on Normal), so a new region is always the better place the day it opens.
3. What a Risen ground drops is its own table, at the ground's own rarity, with gear rows read at the hero's band ("loot scales", ruled 11-07). So the choice between fifteen Risen grounds is a choice of drops, parts, Bestiary lines, weapon weakness and signature. Never of XP.

**Why Hearthrise specifically.** Because its identity is uncapped Levels with authored grounds, and those two fight. Tibia has the same fight and answers it with a very steep curve. We ruled a gentler curve (Level 400 on day 382), so we need the other answer. And we already own the machinery: the formula, the Tower's roster-at-Level read, the scaled-hunt tables and the settle path.

| Criterion | Assessment |
|---|---|
| Player value | "What do I hunt today" has fifteen answers at Level 150 where it now has one. Old art, old stories and old drops stay alive. A veteran and a friend 60 Levels lower can share a ground |
| Strategic depth | High. It is what makes ground choice a decision: all grounds are level, so they compete on what they ask and pay |
| Uniqueness | It is scaled hunts with the gate moved. Nothing duplicated |
| System interaction | Bestiary stages become finishable (2.13). Linings get their parts from old grounds (ruled 11-18). Scaled hunts' gold sink shrinks past the frontier. New regions lose their monopoly on XP, which is the point |
| Balance impact | Formula layer. No new formula: the stat formula at Level L. One new coefficient: the Risen XP share by fit |
| Complexity cost | Medium. The server path exists. Needs the card, the XP share guard on every ground at every checkpoint, and loot-at-band rows |
| Long-term value | The highest in this review. It is the only content that is still there at Level 400 |
| Recommendation | REDESIGN scaled hunts into this. Decide now, build with the scaled-hunt switch (22-9) |

### 4.2 Every ground has one signature. ADD (on mechanics that exist). HIGH.

**Phase B.** Measured on the Slake (section 0.4). Dose alone does nothing on Normal and bites on the harder tiers, small parties first. So a signature rides the harder tiers at full dose and is taught on Normal by frequency. Layer: content rows, plus one shared dose coefficient.

**The problem.** EVIDENCE (DATA): from Hask's Ford on, a ground is swarm, heavy, glass, a regular or caster, and an elite, at weights near 10, 5, 4, 4, 1, in six pockets, pull 4, respawn 60 s. EVIDENCE (REAL, Krell section 4): the player "chose once and never touched again." Preparation is the same everywhere, so preparation is not a decision.

**The proposal.** A ground declares one signature from a short shared list. The signature is a composition fact (which roles, which spells, at what weight and dose), so it is a content row under brief 40 section 4, never a rule of its own. The list, all from mechanics the engine already has:

| Signature | Made of | What the player answers it with, once | First home |
|---|---|---|---|
| Volleys | two shooter kinds, a higher shooter weight | a shield wall for the back row, Shelter, a healer rule, armor on the casters | Krell's Hold (it has it already) |
| The cold (or fire, or poison) | a group spell at 1.5 to 2 times on a common monster | the lining for that element | the Slake (frost), the Pyre Field (fire) |
| Menders | a mender in most pulls | the Target setting, a burst slot, later Necrotic's heal cut | the Ox Road |
| Shield wall | heavies as the majority | a hammer or magic, armor-piercing | Hask's Ford (the Fordsunk and the Bannerman) |
| The swarm | pull one or two larger than the tier's, all swarm | an area slot | the Sewer, Carter's Rest |
| Glass and fast | glass as the majority | Defense, a shield, food | Wyvern Roost |

The dose rule: a signature is sized so a hero or party that does not answer it pays for it in food and risk, and one that does keeps the ground's normal bill. HYPOTHESIS for the size: the unanswered bill is 1.5 to 2 times the answered one. The card says the signature in one label ("Archers. Protect your back row").

| Criterion | Assessment |
|---|---|
| Player value | A reason to open the bar builder and the gear window when the ground changes. That is "meaningful preparation" |
| Strategic depth | High. A lone hammer and a lone mage rank the grounds differently |
| Uniqueness | Uses spells, range, mend, roles and elements. Gives linings and the Target setting a consumer |
| System interaction | Linings (items), bar setups remembered a ground (combat), party seats (social), the supply bill (economy) |
| Balance impact | Content rows plus one shared coefficient for "a signature's dose." The 35% spell cap needs to become a curve by the hero's answer, which is a formula-audit question |
| Complexity cost | Low to medium a ground: re-weight five rows and one spell. The measuring is the cost |
| Long-term value | High, and it multiplies with 4.1: a Risen ground keeps its signature |
| Recommendation | ADD. Sample on two grounds (the Slake's frost and Krell's Volleys), play them, then expand |

Only real players can say whether anyone changes a setup for a ground. The playtest: two grounds in one band with opposite signatures and equal XP. Read the share of hunts that enter with a ground-specific setup.

### 4.3 One stat formula. A party ground is a composition. REMOVE the party fit. CRITICAL.

**Phase B: WITHDRAWN as written.** Measured (section 0.2). Removing the fit does not move a lone hero's XP, and it is the only thing that feeds a four on Normal. The fit stays as an encounter type (44 call 5). The fix is the kill reward at R12, about a third off the XP fit of the Warrens and the Muster Barrows. The text below is phase A's and is kept for the record.

**The proposal.** Delete `fit.party` as a second set of stat multipliers. A ground is for a party because of what stands in it: bigger packs as built (the Sewer's pockets are already 4, 3, 2, 4, 3, 3), a boss with phases in the last room, and its signature. Its monsters are formula rows like any other. The four's ruled pace (2.0 to 2.5 on Deadly, ruling 21-4) then comes from the tier's full box on any ground.

| Criterion | Assessment |
|---|---|
| Player value | The route on the screen becomes the route that is best. Wickstead, the Slake and the Pyre Field get played |
| Strategic depth | Restores the choice between two grounds in a band |
| Uniqueness | Removes a duplicate formula |
| System interaction | Level pace for every party size from 5 to 110. The Warrens' gold. Chief Coppercap's deaths. The Tower, which reads a ground's fit |
| Balance impact | Formula layer. Removes about 9 fields and the XP fits and tier overrides that patch them |
| Complexity cost | Medium. One generated stat table, then a full grid diff |
| Long-term value | Every future region is authored on one formula |
| Recommendation | REMOVE. Not before the model four is fixed (see the warning) |

**The warning that gates this.** EVIDENCE: the grid's four on Krell's Hold at 85 kills 558 monsters an hour on Deadly and 562 on Normal, at a 90% low point. Andy's real four killed 1,251 an hour. In the grid a hero in a four on Krell's Deadly earns 464,000 XP an hour and a lone hammer on the same tier earns 601,000, which would break the ruled "a party is never slower a head than alone." In real play the four reads 2.85 x contract. So in the grid the party grounds are the only places a four reaches its ruled pace, and in real play Krell's Hold already does. Removing the party fit is safe if the real number is right and wrong if the grid is right. Phase B settles that first.

### 4.4 The named rare is an event. REDESIGN (boss phases on any monster). MEDIUM.

**The proposal.** `phases` is read for any row that carries it, not only `boss`. Each ground's named rare gets one line: a guard while its packmates stand, or a small wave, or an enrage. The fight with it is then the ground's mini-boss, one pull in 24, answered by the same bar rules a boss asks for.

| Criterion | Assessment |
|---|---|
| Player value | Something in an idle hunt's log worth reading: "The Provost fell, 3 times, 1 Rare." It teaches the boss's questions before the boss |
| Strategic depth | Medium. It makes Challenge, an area slot and the Target setting matter outside the three boss rooms |
| Uniqueness | Reuses boss-phases.js whole |
| System interaction | The Rare band (the rare carries it), the Bestiary's slowest line, the supply bill |
| Balance impact | Formula layer: `boss` stops being the gate for a mechanic. Removes a special case |
| Complexity cost | Low. One guard in boss-phases.js, a `phases` row on 13 monsters, the leash rule for adds on a ground (already built for Captain Hask) |
| Long-term value | High. Every future ground gets its event for one row |
| Recommendation | REDESIGN |

### 4.5 Dangerous is the lone hero's tier. Deadly is the party's. REDESIGN. HIGH.

**Phase B.** Measured twice (section 0.3). The pack as built is Normal plus 4% and fails. A pull of five works: 35 to 65% more XP than Normal for a lone hero, most of the hour's gold, no deaths in band, and a four keeps 2.1 to 2.5. Layer: coefficient, C-PULL (`tierPull`, Dangerous only), with R12's one tier table.

**The proposal.** Normal: the ground as built. Dangerous: the ground as built, hitting harder (no bigger pull), with the ground's signature at full dose. Deadly: the full box, hitting hardest. Each tier then has an owner and its own question. Dangerous asks "is my hero strong enough." Deadly asks "is my party built right." The percents are ruling 21-3's to size.

This reverses the 11-16 change that raised Dangerous to pull 8. That change was made so a four on Dangerous would not earn under its heroes alone. I think that goal is wrong for Dangerous: a four has Deadly. Dangerous serving fours is why it serves nobody (0 of 99 recorded hunts).

| Criterion | Assessment |
|---|---|
| Player value | A lone hero gets a hard tier that is hard because of blows, which armor, Defense and food answer. A four gets a tier that is hard because of the box, which seats answer |
| Strategic depth | Medium to high. Three different questions where today there is one slider |
| Uniqueness | Removes the duplicate (two full boxes) |
| System interaction | The party XP table (a four on Dangerous will read under its heroes alone, by design). Supplies. Deaths |
| Balance impact | Coefficient layer: `TIER_DIALS.dangerous.pull` and the six pull overrides. No code |
| Complexity cost | Low |
| Long-term value | Same three rows on every future ground |
| Recommendation | REDESIGN. If after 21-3 Dangerous is still under 5% of recorded hunts, cut it and keep two tiers |

Only players can say whether a lone hero wants a hard tier at all, or simply moves up a ground. The playtest: after 21-3, the share of lone hunts on each tier and deaths a 100 hours by tier.

### 4.6 One boss system, and prizes a ground never drops. REDESIGN halls, MERGE Call out. HIGH.

**Phase B.** Krell's hall now reads 38 to 40 wins in 40 for all 36 tested parties (section 0.6): no change to his rows, a hall coefficient on the formula's boss role at R21. 46 change 3 and 47 C15 reach the same merge. 47 C21 takes the prize change with two riders, which I accept: Krell's gem stays on the daily roll and his five sidegrade weapons replace the Dawnsteel rows.

**The evidence.**

- EVIDENCE (DATA): Krell's daily prize is one roll a hero a day over 14 Dawnsteel rows at 2.86% and two uniques at 3%. The Yoke Ox on the Ox Road drops the Dawn Warhammer at 3.26% a kill in the Scarce band. A lone hero kills about 40 an hour (GRID). COMPUTED: about 1.3 warhammers an hour from the ox against one in 35 days from Krell, which at 12 hours a day is about 550 times slower alone. The Coordinator's baseline reads about 900 times for a party.
- EVIDENCE (`22-endgame.md`): Krell's two uniques are worth x1.006 XP.
- EVIDENCE (REAL): 19 Hall Keys found in one hunt and no Hall fought. Each key is one fight started by hand.
- EVIDENCE (DATA): the Ox Road's Scarce Dawnsteel is also against the 11-20 ruling "generous to Krell, rare after."

**The proposal.**

1. **Every boss has a keyed hall, and the hall is the one repeatable boss fight.** The Rat King, Chief Coppercap and Captain Hask get halls on Krell's model, each with a key that drops on its ground. Call out's slider moves to the hall's door: "Fight with N keys," one press, the fights run one after another like any hunt. Call out's stamina fee, its called copies and its "pays nothing" reward door are retired. The call-only pieces move to the hall's prize table.
2. **A hall's daily prize holds only things no ground drops:** the boss's uniques (each with a real property, one for each weapon family group, so 5 to 6 a boss and not 2), the region's gem for jewelry (the roadmap already puts a gem on each hall boss), a Trophy, and the first-win piece. The standard tier rows leave the daily roll.
3. **A prize is still worth wearing one band later.** Ruling 31-4 (a unique reforges up a band) is the mechanism. It is open and this needs it.

| Criterion | Assessment |
|---|---|
| Player value | The boss is where the thing you cannot farm comes from. A stack of keys is one press |
| Strategic depth | Which boss to spend today's roll on. Whether to trade keys. Building the party for the room |
| Uniqueness | Three boss systems become one |
| System interaction | Jewelry (the gem), uniques and reforging (items), key trade (economy), the party finder (social), stamina (Call out's sink goes) |
| Balance impact | Removes hand-typed called rows and a reward special case. A hall boss is a formula row at the `boss` role with a hall factor: one coefficient |
| Complexity cost | Medium. Three hall rows on an engine that exists, a queue on the door, a retire of Call out's tables |
| Long-term value | Every region ends in a hall. This sets what they pay for 400 Levels |
| Recommendation | REDESIGN halls, MERGE Call out into them |

### 4.7 Regions 4 to 7: four grounds and one new rule each. REDESIGN the plan, DEFER the build. MEDIUM.

The sketch (`itemization-roadmap.md`) is "six grounds, a call boss, a hall boss" four times. That is the template again, 24 times, at an art cost we cannot pay ahead of a four. With Risen grounds carrying the hours, a region's job changes. It does not have to fill 55 Levels with maps. It has to add something the world did not have.

**The proposal.** A region is four grounds (two faction pairs), one hall, and one new rule: a new signature, a new element or a new monster trait, which the Risen forms of every older ground do not have. Region 3 already does this by accident (factions, Necrotic on the Ox Road, Storm on the Old Guard). Region 4 (the Saltpans) should name its rule before its grounds. HYPOTHESIS: 16 grounds across regions 4 to 7 in place of 24, each one distinct, is a better game than 24 that repeat.

| Criterion | Assessment |
|---|---|
| Player value | A new region feels new for a reason other than its band |
| Strategic depth | Each region adds one question to the game for good |
| Uniqueness | Fewer grounds, none a re-skin |
| System interaction | Depends on 4.1 for the hours and 4.2 for the vocabulary |
| Balance impact | Content rows only |
| Complexity cost | Lower than the sketch by a third |
| Long-term value | It is the content plan |
| Recommendation | REDESIGN the plan now (ruling A-10 asks for the sketches now). Build nothing until the Morrow Hills are live and measured |

### 4.8 Re-band before you build. REDESIGN four grounds. MEDIUM.

Since a monster is a Level and a role, moving a ground's band is a data change. Three places where that beats a new map:

| Move | Evidence | Why |
|---|---|---|
| Wickstead from 8 to 18 to about 20 to 32 | three grounds cover Levels 5 to 18 (0.9 lone days). One covers 16 to 31 (3.2 days) | the Glade gets a neighbor and a choice. Wickstead's tier 2 gloves and belts fit the band |
| The Slake from 50 to 65 to about 58 to 72 | 10 Levels of overlap with Hask's Ford. A lone hero has no ground from 65 to 70 (the Muster Barrows is the party's) | the lone hero gets a ground beside the Muster Barrows |
| Carter's Rest and the Ox Road to one band | bands 110 to 125 and 112 to 128, 19% apart on XP, 39% on gold | a faction pair is one choice. It must pay alike so the choice is the faction, the weapon and the drops |
| Nothing new under Level 45 | the first 45 Levels are 6.6 lone days and hold six grounds. Levels 85 to 110 are 17 days and hold one | new maps go where the days are |

Recommendation: REDESIGN. Complexity low (rows and a re-fit). Risk: Wickstead's story sits on the Thicket road, so a Level 20 farm next to a Level 5 wood needs a line of text.

### 4.9 Remove the dead rows. REMOVE. LOW effort.

103 monster rows, three hunts, the called copies (with 4.6). EVIDENCE in 2.7. Player value: none lost. Complexity: a retire lane and the catalogue guard. It takes roughly half the rows out of `monsters.js`, which every edge bundle carries.

---

## 5. Missing opportunities (brief 45 section 5)

| Opportunity | In this review | Why Hearthrise specifically |
|---|---|---|
| Endgame goals beyond Levels | 4.1 Risen grounds | uncapped Levels need an uncapped world, and we own the formula that makes one |
| Monster mechanics that work with automated combat | 4.2 signatures, 4.4 the named rare | an idle hunt is decided before it starts. A mechanic works when its answer is a setting, a piece of gear or a seat. Shooters, menders, guards, waves and element walls all pass that test and all exist |
| Boss encounters and rewards | 4.6 | the hall is built and good. Its prize is the only weak part |
| Features that make hunting more engaging without attention | 4.4 | the log of a ten hour hunt should have five lines worth reading |
| Hunting ground selection | 4.1, 4.2, 4.5, 4.8 | brief 45 names ground choice as a place decisions should live. Today it is a lookup |

Two ideas I considered and do not recommend:

- **Random affixes on packs** (a "burning" pack, a "hasted" pack, as in action RPGs). It adds variance nobody answers. In an idle game a random modifier is a tax, not a decision. The signature (fixed, on the card) is the idle form of the same idea.
- **A world boss or raid.** The old one is cut (22-10) and I would not bring it back. A hall with a daily prize and a tradable key is the same goal without a schedule, and a schedule is the opposite of idle.

---

## 6. Interaction traces (hypotheses for phase B)

**4.1 Risen grounds.**
- Progression: Level pace past the frontier is set by one coefficient. If it is over 1.0, new regions are skipped. If it is under about 0.8, the frontier player stalls. Phase B: Risen XP share by fit at 110, 150, 185, 240.
- Economy: loot at the hero's band from fifteen tables multiplies sources of every band's gear. The Rare and unique rows must stay at the ground's own rarity or supply floods. Scaled hunts' gold sink (40 x Level an hour) disappears past the frontier: about 4,400 gold an hour at 110. The economy area must say whether that sink is needed.
- Crafting: lining parts from old grounds become reachable at any Level (ruled 11-18). Demand for parts spreads over all grounds.
- Gear: "rare after Krell" (11-20) needs Risen tables to follow the same rule, or the Glade becomes the cheapest source of a band 9 body.
- Parties: a Level 150 and a Level 90 friend can hunt a Risen ground at the leader's Level. The lower hero dies. HYPOTHESIS: the party's lowest Level should set it, not the leader's. That changes ruling 11-07 ("scale to the party LEADER's Level") and is a call.
- Server: no new path (`22-endgame.md` scaled-hunts row 6).

**4.2 Signatures.**
- Combat: the 35% cap on a spell against a floor hero is what holds the dose down. Raising it raises deaths for the unprepared, on purpose. With 6% death cost flat (ruled, call 4), a signature that kills at Level 150 costs days. The dose must be a food bill first and a death only far under Level.
- Economy: a ground whose signature you do not answer costs more supplies, so its net gold falls. Lining demand rises. The store bill of a healer four barely moves (Krell section 7.3: more damage costs about 400 gold a head), so for a four the signature must threaten the back row or the healer's mana to register at all.
- Parties: Volleys and group spells are the mechanics that reach past the tank. They are what make seats matter.
- Risk: six signatures tuned ground by ground is 15 hand dials again. The dose must be one shared coefficient.

**4.3 One formula.**
- Progression: lone XP falls on the Sewer, the Warrens and the Muster Barrows toward their neighbors. The lone pace table (Level 50 in 168 h) was fitted with them in, so the XP curve constant moves. A four's pace: unknown until the model four is fixed.
- Economy: the Warrens' coin a kill has its own factors (0.53). On the one formula its gold rises to the line unless the coin formula takes the 0.7.
- Deaths: the Chief and the Cistern Spider are 10 of 22 real deaths. On normal health and a full blow the Sewer and the Warrens get more dangerous a blow and shorter a fight. Re-measure the first-week bands.
- The Tower reads fit for its rooms. Check it.
- Real players: the ground where 32% of hours live gets less good. It must land with a clear better route on the screen or it reads as a nerf.

**4.5 Tiers.**
- A four on Dangerous earns under its heroes alone (EVIDENCE: 0.91 to 0.95 on pull 5, `balance-sheet.js` TIER_DIALS note). That breaks the 11-16 line "every Dangerous party stands at or over its heroes alone" and needs Tyler's word.
- Lone XP on Dangerous falls a little (fewer monsters) and its food bill falls with it. The lone trade (XP for gold) gets gentler, which is the aim.
- Six pull overrides go.

**4.6 Bosses.**
- Economy: Call out's stamina sink goes. Keys become a tradable good at every band, which the Weighhouse must list. A queue of N keys concentrates daily rolls into one sitting. The daily prize is still one roll a hero a day, so the queue only helps XP and coin from the room. HYPOTHESIS: a hall then pays like a short Deadly hunt. If it pays more, keys are an XP item and their trade price says so.
- Gear: removing Dawnsteel from Krell's daily roll removes the only tier 7 source before 110. Keep the first-win piece, and the items area moves Morrow's Dawnsteel from Scarce toward Rare under the 11-20 ruling.
- Crafting: a gem only a hall drops makes every region's best jewelry wait on its boss. That is the intended interdependency, and it puts a floor under key prices.
- Parties: a hall is built for a four (ruled 11-17). Three more halls at Levels 20, 50 and 75 are three more reasons to form one early. A lone hero at 20 cannot hold the Rat King's hall. The room's size needs a row, which the called rooms already carry.

**4.8 Re-banding.**
- Wickstead at 20 to 32 sits on the first-slot window (a hero is alone to about Level 33). It must be a lone ground.
- Tally tasks, the bag guide, the tutorial and the Hunts page advice name grounds by band. Each needs its row moved. The tutorial names Wickstead nowhere I found, but that is not checked (see section 9).

---

## 7. The priority list

| # | Change | Class | Complexity | Risk | Expected benefit | Depends on |
|---|---|---|---|---|---|---|
| 1 | DONE in phase B: the matrix's four now kills 1,386 an hour against the real 1,251 (+11%). What is left is the back row: the harness tank takes 96% of the damage against 69% real | Critical (measurement) | S | low | shooters and group spells cannot be sized until the back row is hit as in real play | V4 in 44 |
| 2 | Risen grounds (4.1) | Critical | M | medium: loot supply, new regions losing pull | the runway (27 days against 120), the long chase, ground choice | scaled-hunt switch 22-9, the items area for loot at band |
| 3 | The kill reward on the three party grounds, about a third lower (was: remove the party fit. Measured, section 0.2) | Critical | S as a number, M inside R12 | medium: a visible change to the most-played ground | the route on the screen is the best route. 4 grounds return to play | R12 |
| 4 | One boss system and real prizes (4.6) | High | M | low to medium | bosses matter. A repeated press goes. 5 hand rows go | ruling 31-4, the items area for uniques |
| 5 | A signature a ground (4.2) | High | L to M a ground | medium: fun is unproven | preparation becomes a decision | 21-3, the lining build |
| 6 | Dangerous brings five, Deadly the full box (4.5, measured in 0.3) | High | S | low | a lone hero gets a hard tier it can hold | 21-3, Tyler on the 11-16 line |
| 7 | Re-band Wickstead, the Slake, the first Morrow pair (4.8) | Medium | S | low | two thin bands get a second ground with no new art | 3 |
| 8 | The named rare is an event (4.4) | Medium | S | low | a reason to read the log. Bar rules matter outside boss rooms | none |
| 9 | Gold fit into the coin formula, HP overrides out (2.9) | Remove or simplify | S | low | about 35 dials go | 3, the formula audit |
| 10 | Dead rows out (4.9) | Remove or simplify | S | low | smaller bundle, a cleaner roster | 4 for the called rows |
| 11 | Regions 4 to 7 as four grounds and a rule (4.7) | Defer the build, decide the shape | S to plan | low | a third less art, no repeats | 2, 5 |
| 12 | Loot rows for Wyvern Roost and the Catacombs ground | Medium (already planned) | M | low | two staged grounds become judgeable | the items area |
| 13 | The Bestiary's stages against real kill rates | Defer | | | the queued deep dive should start from 2.13's numbers | 2 |
| 14 | A print of spell share of damage taken, and of what a mend is worth, by ground | Low | S | none | turns 2.4's hypothesis into a number | the grid |

**Where only real players can tell.**

| Question | Playtest that answers it |
|---|---|
| Do players enjoy going back to an old ground at their Level, or does it feel like recycled content? | Open two Risen grounds past 110 to the Krell-level accounts for two weeks. Read the share of frontier hours on them and whether hours a day hold |
| Does anyone change a setup for a ground? | Two grounds in one band, opposite signatures, equal XP. Read ground-specific setups a hunt |
| Does a lone hero want a hard tier? | After 21-3: lone hunts by tier, deaths a 100 hours |
| Is a hall worth a key? | After 4.6: halls opened a week by accounts past 85. Red at zero for a week (`22-endgame.md` row 13) |

---

## 8. Tyler decides

Each call is one recommendation and its reason, then the strongest alternative in one line.

1. **Does every ground keep going past its band, for free?** Recommended: yes. A ground's tier ladder continues above its band from the one stat formula, it pays under the at-Level ground, and it replaces scaled hunts by the hour. The Game Director reached the same change on his own. It is the only way to hold 120 days of content ahead of a four, and it is what makes fifteen grounds fifteen choices. Alternative: keep scaled hunts paid by the hour, which have never been used, and plan a new region every 24 days.

2. **Whose Level does a Risen ground take?** Recommended: the lowest hero's in the party, so a veteran can hunt with a friend and nobody dies to a ground 60 Levels over them. This changes your 11-07 "the party leader's Level." Alternative: the leader's, and the lower hero is warned.

3. **Do party grounds keep their own formula?** Recommended: yes, as one kind of ground with three numbers, and their XP a kill comes down by about a third. I asked to remove it and the measurement said no: it is what lets a party hunt on Normal, and it is not why a hero alone is overpaid there. Alternative: remove it, and accept that a four on Normal earns 0.7 to 1.3 on every ground.

4. **Does Call out fold into keyed halls?** Recommended: yes. Every boss gets a hall and a key. The slider becomes "fight with N keys." The stamina fee and the called copies go. Alternative: keep both and give Captain Hask a call, as the endgame dive planned.

5. **What does a hall's daily prize hold?** Recommended: only what no ground drops. The boss's uniques (5 to 6, each with a real property), the region's gem, a Trophy and a first-win piece. Standard tier gear leaves the daily roll. Alternative: keep Dawnsteel on Krell's roll and make the Morrow Hills' Dawnsteel Rare so Krell's is not 550 times slower.

6. **Does Dangerous bring five monsters?** Recommended: yes, on every ground, with Deadly keeping the full box. Measured: a lone hero in band holds it near 40% health with no deaths, for 35 to 65% more XP and most of the hour's gold. A four keeps 2.1 to 2.5. On Hask's Ford a four on Dangerous then earns under a lone hero on Dangerous, which bends your 11-16 line on that ground. Alternative: leave both tiers on the full box, where a hero alone has only Normal.

7. **The Normal party check.** Recommended: judge it on the three party grounds only. Measured: a four on Normal earns 0.62 to 1.03 on every other ground because it runs out of monsters, and 1.31 to 2.15 on the party grounds. That is what a party ground is for, and it agrees with your 11-11 and 11-16 rulings. Alternative: bigger packs on Normal for parties everywhere, which reverses 11-11.

8. **Re-band Wickstead and the Slake?** Recommended: yes. Wickstead to about 20 to 32, the Slake to about 58 to 72. Both are data. Both fill a band that has one ground today. Alternative: leave them and draw two new maps.

9. **A faction pair pays alike.** Recommended: Carter's Rest and the Ox Road share one band and one XP line, and differ by faction, weapon weakness, signature and drops. Every later pair follows. Alternative: let pairs differ in pay and accept that one side's ground is skipped.

10. **Regions 4 to 7.** Recommended: keep six grounds as the planning number and open each region as four grounds and its hall first, then the last two. Each region names one new rule before its grounds. This is the itemization-fit lane's answer and it keeps your 11-18 ruling. Alternative: four grounds a region for good, which I asked for in phase A and now hold until the Morrow Hills are played.

11. **The 103 unused monsters and three ground-less hunts.** Recommended: remove the rows. The art stays in the library. Alternative: keep them as an idea pool.

12. **Krell's hall is won 38 to 40 times in 40 by every tested party.** Recommended: leave his rows alone now. When hand-typed monsters move onto the formula, a hall boss becomes the boss role times one hall number, sized so a party in band on the card's food wins 80 to 90% and the weakest named party loses. Fix the prize first. Alternative: raise Krell's health and blow by hand today, which is the per-boss patch the formula brief asks us to stop making.

**Where I think you are wrong.** Two rulings in this area. "Every Dangerous party stands at or over its heroes alone" (11-16) is what made Dangerous a second Deadly, and I would let it go (call 6). On the party ground I was the one who was wrong. I called its formula the cause of the overpay, measured it, and it is not (section 0.2).

---

## 9. For other areas

| To | What |
|---|---|
| Combat (52) and the baseline (51) | The model four: 558 kills an hour on Krell's Deadly at 85 in the grid against 1,251 real at 77 to 80. Kills on Deadly equal kills on Normal in the grid (558 and 562), so the model four is not using the bigger box. Until this agrees, every "party" cell in my area is unjudged |
| Formula audit (41 to 44) | Exceptions for the register: `fit.party` (a second stat formula by ground), the 11 copies of gold fit 0.7, five "fours were killing too fast" HP overrides, the called copies' hand stats, `slag_rain_called`, `calledSwing`, `phases` gated on `boss`, the 35% spell cap as a flat number, the Tower reading fit |
| Items | Krell's prize table (4.6). Morrow's Dawnsteel at Scarce against "rare after Krell." Loot rows for Wyvern Roost and the Catacombs ground. Loot at the hero's band on a Risen ground, with Rare and unique rows at the ground's own rarity. Ruling 31-4 is needed by halls |
| Economy | Gold by ground is not monotonic for two different reasons: the staged grounds with no gear rows (Roost 9,100 after the Ox Road 22,500), and the party coin factors (the Warrens +1,700 and the Muster Barrows -2,800 at their floors). Call out's stamina sink goes under 4.6. Scaled hunts' gold sink goes past the frontier under 4.1. Key trade at every band |
| Social and parties | Risen at the lowest hero's Level lets mixed-Level friends hunt together. Halls at Levels 20, 50 and 75 are early reasons to form a party. A four on Dangerous earning under solo (call 6) |
| Retention and teaching | The route the screen recommends is 1.5 to 1.94 times slower than the best route (SOLVER, B3, red over 1.3). The screen recommends Normal and stops at Krell's Hold to 185. Tally tasks are the cheapest lever on ground choice and should name signature monsters. The Bestiary deep dive starts from 2.13 |
| Home and gathering | The gather axis fades from Hask's Ford on (2 to 6 nodes of one kind a ground). If "best at gathering" is a ground axis it needs a ground in every region |
| Art Director | The ground card needs one label for the signature and one for the best weapon by class. Words exist in the data. Layout is theirs |
| Systems Engineer | A key queue on the hall door. `phases` read on any monster. Risen forms of open grounds through the Tower's roster-at-Level read. Each hero's lowest health in the tally (Krell section 8) so a signature's dose can be read from real play |

Not checked in phase A, said plainly: I did not play the build (the brief forbids browser runs tonight). I did not read the tutorial, tally-task or bag-guide rows for the grounds 4.8 would re-band. I did not read the Tower's data rows beyond `22-endgame.md` and the engine header.

---

## 10. Evidence and hypotheses

**EVIDENCE**

| Claim | Source |
|---|---|
| 190 monster rows, 87 placed, 103 in no hunt. Three hunts with no ground | DATA (`monsters.js`, `hunts.js`, `hunt-grounds.js`, loaded and counted) |
| Every pack is swarm, heavy, glass, regular or caster, elite. Pull 4, respawn 60 s, 6 pockets on every `both` ground from the Glade on | DATA (`grounds/*/pack.js` rosters, `hunts.js`) |
| Dangerous and Deadly are both pull 8 (6 on six grounds) | DATA (`hunt-tiers.js` GROUND_TIERS as resolved) |
| The party fit: health 2.5, blow 0.75, XP 0.8 and six more fields | DATA (`balance-sheet.js` STAT_FORMULA.fit) |
| Lone and four XP x contract, net gold, deaths and low point by ground, Level and tier | GRID (`ground-rates.json`, 8b03c56aa, MID, 2 seeds) |
| 0 deaths in 422 cells | GRID |
| The fastest paths for 1 to 4 heroes, and the screen's path 1.5 to 1.94 times slower | SOLVER (`paths.json` runs level-1 to level-4, bands B3 and B5) |
| The Ox Road on the fastest path to 165. The Muster Barrows to 110 for 3 and 4 | SOLVER (B5) |
| The Warrens 32% of real hours at 2.24 x. 79 of 99 party hunts Deadly, 0 Dangerous. 2 deaths in 359 Deadly hero-hours. Deaths by killer | REAL (`10-real-players.md` lines 89 to 97, 398 to 399) |
| Andy's four: 1,251 kills an hour, 2.85 x contract, 0 deaths, 28% of damage on the healer from Lookouts, 19 keys and no Hall | REAL (`11-krell-hunt-2026-11-20.md`) |
| Krell's prize rows at 2.86% and 3%. The Yoke Ox drops the Dawn Warhammer at 3.26% Scarce | DATA (drop rows as loaded) |
| Wyvern Roost and the Catacombs ground have no gear rows | DATA |
| A four leaves open content on day 27. 120 days ruled | `50-standards.md` 2.7 and section 11 call 7 |
| The Tower, chest, Catacombs and Call out findings | `22-endgame.md` (not re-measured here) |
| 51 hand dials | `21-combat.md` B8 (not recounted. My load shows XP fit on 14, gold fit on 11, tier overrides on 11, 2 exceptions) |

**COMPUTED from evidence**

| Claim | From |
|---|---|
| Krell's Dawn Warhammer is about 550 times slower than the ox's for a lone hero | 1 / 0.0286 days x 12 h against 40.5 kills an hour x 0.0326. The brief's "about 900 times" is the Coordinator's and I did not reproduce it |
| The Landlord's Bestiary stages take 125 to 1,000 hours | 20 kills an hour (GRID) against 2,500 to 20,000 (ruling 10-20) |
| Levels 5 to 18 are 0.9 lone days and 16 to 31 are 3.2 | SOLVER, level-1 `at` table |

**HYPOTHESIS (phase B or a playtest decides)**

| Claim | How it is tested |
|---|---|
| REFUTED in phase B (section 0.2): the party fit overpays because XP a pull grows with health while the walk and the respawn do not | matrix diff: `fit.party` health 2.5 to 1.0 and XP 0.8 to 1.0 on the three grounds, lone and four, floor and top |
| On one formula the best path visits every ground in band order | solver re-run on that diff |
| The grid's four is spawn-capped or mis-built, and the real four is the truth | 51-baseline. Replay Andy's party (kit, runes, Level 77 to 80, v0.2.142 rules) and match 1,251 kills |
| Monster spells are under a fifth of damage taken on most grounds, so most are flavor | print spell share of damage by ground from the grader |
| A signature sized at 1.5 to 2 times the unanswered food bill changes what players bring | playtest (section 7) |
| Risen grounds at 0.85 to 0.9 x contract hold the frontier player without emptying a new region | matrix diff for the number. A playtest for the feel |
| MEASURED in phase B (section 0.3): the pull as built is too weak, five works. Whether lone heroes pick it is still | after 21-3, tier shares from real play |
| A hall on Krell's model at Levels 20, 50 and 75 is fun for a party that small and that new | playtest. The Rat King's called room is the nearest reading and it has 1 use |
| Four grounds and one new rule make a better region than six grounds | not testable before the Morrow Hills are live. It is a Director's judgment |

**The from-scratch question, for this area.** Would we build the world the same way? The engine, the stat formula, the ground pack, the spell model and the keyed hall: yes, all of it. The content plan: no. I would have built six grounds that each ask a different question and made every one of them rise with the hero, before building a fifteenth ground that asks the same question as the fourth.
