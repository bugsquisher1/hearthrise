# Balance program 47: the itemization plan, fitted into the overhaul

Game designer, 2026-11-21, `lane/d-itemization-fit`, cut from `set/v0.2.144` at 44ad70d83. Reading and analysis only. No game code, data row or migration was changed. Nothing was played or measured in this lane.

Tyler, 2026-11-21: "So far i love it, but lets not forget about the HUGE itemization plan, and make sure we are fitting that into all of this."

**What was read.** `docs/design/itemization-plan.md` in full (1,375 lines), `itemization-canary-adjustments.md`, `itemization-system-review.md`, the rulings of record, `30-decisions.json` (all 113 calls), `30-plan.md` section D (the lanes), `46-from-scratch.md` and `54-review-items.md` in full, and the item, gear, drop, craft and Luck parts of 41, 42, 43, 50, 52, 53, 55, 56, 57, 58 and 59 by search. `44-formula-architecture.md` had not landed. The two superseded docs (`itemization-system.md`, `itemization-roadmap.md`) were not used as sources.

**Labels.** Status is one of **built** (in `src/data` today, checked by search in this lane), **staged** (written, hidden or under `tools/balance-sim/staged`), **ruled** (Tyler said so, with the date or the decision id) and **proposed** (a design number nobody has ruled or measured). A verdict is one of **FITS**, **CHANGED** (by the overhaul, and how), **CONFLICTS** (both sides given in section 3) and **MISSED** (the overhaul never addressed it, placed in section 4). RE-OPEN marks a recommendation that needs Tyler's yes because it moves something he ruled.

---

## 1. Summary

**How much of the plan survives.** Most of it. I split the plan into 78 rows. 30 fit the overhaul as written. 16 are changed by it, nearly all by rulings you already made on 11-20 and 11-21. 20 are in conflict with a review or with a newer ruling. 12 were never addressed by any review. One row (Appendix B4) does not exist in the plan. Nothing in the plan needs to be cut.

**Why the reviews looked like they ignored it.** The plan of record (`30-plan.md`) already carries the item plan as lanes L20, L29, L32 to L39, L43, L44, L47, L48 and L52. The phase A reviews were written on top of that plan and its rulings, so they cite decision ids and not the item plan. The Game Director (46) was written blind on purpose and read neither. That is where most of the real conflicts come from. Several of its objections are answered by pages of the plan it did not read.

**The five that matter most.**

1. **Early build pieces. The ruling stands, and the plan already has the answer.** The Game Director wants pieces that change a build from the Sewer on. You ruled generous to Krell and rare after. The items review first agreed with the Director, then withdrew it on the 12 hour clock, because a band before Krell lasts one to seven days. What the Director wants is already ruled and unbuilt in two places. Your 11-14 ruling ordered special pieces at every tier and three of the five samples are designed and not live (Widow's Fang in the Sewer, Mudlark's Mitts, Demoncaller). Your 30-3 ruling made a Very Rare every 60 to 90 hours through Krell, and no ground has one. Ship those three pieces and fill the Very Rare with a stone a smith sets in jewelry, which a hero keeps. No ruling moves.

2. **Tempering that pays only the difference removes about half of the plan's "costs more than you earn".** You ruled both. On 11-18 you said gear sinks should cost more than a band earns so heroes differ. On 11-20 (23-2) you said Tempering carries up a tier and costs only the difference. Worked from the plan's own table, a hero who tempers every tier then pays 0.5 to 0.9 times a band's gold from tier 4 to tier 6, where the plan had 1.0 to 1.4. I recommend keeping 23-2 and pricing each tier's ladder as a share of that band's gold (your 24-11 price index), so the difference is still worth more than the band earns. RE-OPEN, because your 11-18 answer said Tempering stays as built.

3. **Salvage stays a choice. The Shop keeps its ruled price.** The economy review and the Game Director want gear salvaged by default and the Shop paying a token. That removes the one decision Luck was built on (gold now or Luck for ever), and it breaks three numbers you approved: the one sale rule (23-10), the first hero slot at Level 32, and the size of the step at the Morrow door. Build salvage as ruled, read what real players pick, and revisit only with that reading.

4. **Necrotic and Storm stay at sixteen spells. The combat review's seven are the first batch, not the whole list.** Your ruling is a spell of each for every weapon, and you confirmed sixteen on 11-21 (32-6). The plan already says sample first, then the rest. So the seven ship as the sample and the other nine are redesigned after they are played, so no two weapons share one trick. Fists become two rows as the combat review asks, with one rule kept from the plan: the Palm works on mana, and a rune is the stronger cast. The fist prototype failed its gold test on rune cost.

5. **Six crafted slots must not stop at tier 7.** The items review runs jewelry to tier 7 and defers patterns until a market exists. The plan makes every worn recipe past tier 7 a pattern. Put together, the six crafted slots would freeze at Level 110 for 290 Levels, which is the same hole the review found at Level 30. Patterns ship with the Morrow Hills, and a pattern teaches the account and not one hero.

**Three smaller things you should know.** The plan's measured numbers all predate the to-hit change, the spell rule and the harder monsters, so every one is re-measured on the new harness before its lane ships. Three band tables exist (the plan's, the code's, the standards'), and one must win. The worn in system is gone by your 23-4 ruling, and the job it did (two heroes, two different swords) has no owner unless Kindlings take it.

---

## 2. The plan, section by section

Citations are to the review or audit and its section. Decision ids are from `30-decisions.json`. C numbers point to section 3, M numbers to section 4.

### Sections 0 to 2

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 0a | The six rules | ruled 11-18 | 54 section 4.1 builds on rule 6. 46 section 2, systems 5 and 6, describes the same split. No review argues with a rule | **FITS** |
| 0b | The 14 slots, 7 dropped, 6 crafted, ammo | built | 54 section 2.1 confirms the count and finds the six crafted slots stop at tier 3 | **FITS** |
| 0c | The numbers that hold it together | measured and proposed | 23-5 replaces "accessory set at most one weapon step" with about 9% XP in five budgets, perks 4%, plain accessories as a tier. 50 section 2 puts Level 400 at 4,580 hunted hours for a MID four, where the plan estimated 4,200 for 110 to 400 | **CHANGED** by 23-5 and 50-2 |
| 1 | Each system and its purpose (17 systems) | mixed | Every purpose is used somewhere in 54, 55 or 53. Worn in is gone (23-4). Weekly orders and stirred grounds have no reviewer (M3). Commissions are deferred (C17) | **FITS** |
| 2a | Tiers 1 to 7, a tier every 15 Levels | built | 54 section 2.1: keep, seven is right. 42 X31: the steps are uneven and should come from one curve | **FITS** |
| 2b | Bands past 110 on a budget line, no tier 8 | ruled 11-16, staged | 41 section 6.1 and model item 7, 42 M3: the line moves into `src/data` as the gear curve, and a unique's budget becomes arithmetic at published exchange rates. 42 section 7.6: bands of fixed width fade past Level 400. Three band tables disagree (C20) | **CHANGED**. The line becomes a formula. Fits the plan's intent |
| 2c | A region is about 55 Levels, six grounds, two bosses | ruled 11-18 (section 13, answer 8) | 53 section 4.7 and call 10: four grounds, one hall and one new rule a region | **CONFLICTS** (C9) |
| 2d | Region rules: equal faction grounds, no bound gear, worn by Level only | ruled | 53 call 9 keeps faction pairs and makes a pair pay alike. 46 section 7 agrees with no bound gear | **FITS** |

### Section 3, dropped gear

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 3a | Drops for tiers 1 to 7. Gloves slow on purpose. Belts move to crafting | built, belts ruled "maybe" | 54 section 2.1: gloves become hourly, belts move to the bench now. 50 band E2 asks every slot inside the first 15% of a band | **CHANGED** (C14). Belts fit |
| 3b | Tier 7 comes from Krell, and the Morrow Hills finish it | built and staged | 54 call 6 and 53 call 5: plain Dawnsteel drops in the Hold like every tier, and Krell's daily roll holds only what is won | **CHANGED** (C21) |
| 3c | Past tier 7: named uniques, the hourly drop is stock and chips | ruled 11-14, 11-16, 11-18 | A-3 and 31-4: a unique reforges up a band and keeps its property, so a region needs 15 to 20 new ones and not 46. 54 section 2.2 keeps the design | **CHANGED** by A-3 and 31-4 |
| 3d | The property catalogue, twelve kinds | six built, five new hooks proposed | 54 call 4: seven kinds that change a decision. Guards and plus skill leave the list | **CONFLICTS** (C7) |
| 3e | Quivers as a bow's off-hand unique | ruled (answer 12) | 52 defer row D3 files it with late off-hands. 54 section 2.4 lists quivers as a workbench product | **FITS** as a drop. See C7 note |
| 3f | The sidegrade rule and Krell's five weapons | ruled 11-18, five proposed | 54 priority list, Critical: build Krell's five first as the measured sample for every later unique | **FITS**. Moved earlier |
| 3g | Worn in | proposed | 23-4: not built as its own system. A duplicate unique feeds that unique's Tempering past tier 7 | **CHANGED** by 23-4. See M12 |
| 3h | The ground template past tier 7 | proposed | 54 call 7: at most six Rare rows a ground. With A-3 the template's seven uniques become two or three, which fits six | **CHANGED** (C22) |
| 3i | Region tables as an authoring shape | proposed | No review or lane names it | **MISSED** (M8) |
| 3j | Boss template: a call-out boss and a keyed final boss | ruled 11-14 | 53 section 4.6, 46 change 3, 54 section 2.2: one boss door. Call out folds into keyed halls | **CONFLICTS** (C15) |

### Section 4, crafted gear

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 4a | Who makes what: Smithing all jewelry, Crafting cloaks and belts | ruled 11-18 | 54 section 2.4: the workbench is the outfitter. 56 call 6: Crafting keeps its place and gets linings | **FITS** |
| 4b | Grades, the bench roll, the Hallmark step, no paid re-rolls | built | 54 section 2.3: the mechanism is right, keep | **FITS** |
| 4c | The power budget and perk sizes (about 1% ordinary, 3% in its case) | built at tiers 2 and 3 | 23-5: perks on twelve seats have a 4% budget. 54 call 2: 5 to 8% in the case, near nothing outside | **CONFLICTS** (C8) |
| 4d | The perk pool, 22 perks for 12 seats | ruled 11-18, five hooked | 54 row 29 keeps it. L37 hooks three more | **FITS** |
| 4e | The ladders for tiers 4 to 7, with gems and ruled fees | ruled in principle | 54 call 1: build to tier 7, tier 4 as the played sample (L37). 54 leaves open whether tiers 5 and 6 stay separate steps | **FITS**. Moved earlier |
| 4f | Gems and chips, ten chips to a gem, old Rare prizes cut into gems | proposed, Carnelian built | 54 trace 5.1 names the risk (six gems at 11 hours each against a 66 to 87 hour band) and no lane builds chips | **MISSED** (M1) |
| 4g | Stirred grounds and weekly orders | proposed | 46 section 3c defers weekly orders. 59 and 57 read your 11-18 answer as a rejection of weekly orders, which it was not (C23) | **MISSED** (M3) |
| 4h | Jewel reforging, with the new tier's metal, gem and skill | ruled yes, tier 2 to 3 built | 54 row 32: keep, build for every tier with jewelry | **FITS** |
| 4i | The Fine chase as one standing order | proposed | No review names it. It is a first principle fix | **MISSED** (M2) |
| 4j | Commissions, single jobs and bulk orders | proposed, not objected 11-18 | 46 section 3c and 54 row 50 defer both. 55 section 4.6 keeps craft orders for later | **CONFLICTS** (C17) |
| 4k | Samples for the first build | built | 54 section 2.1 reads all four as the solver's best kit from Level 30 on | **FITS** |
| 4l | Old rows, placed or cut | proposed | L36 checks each orphan against the roadmap before cutting (ruled 11-21). The plan's table is that roadmap for 22 accessory rows | **FITS**. L36 must read it (M11) |

### Section 5, making gear better

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 5a | Tempering, the Dawnsteel ladder, one ladder a band after | built to tier 7, bands staged | 23-2 (L35): pay only the difference going up a tier. 23-4: duplicates feed it past tier 7. 54 section 2.1: the one plain place gold buys percent | **CHANGED** by 23-2 and 23-4. See C2 |
| 5b | Salts, one a tier, at either bench | built | 54 call 8 and 56 section 2.2: remove the three workbench salt recipes | **CONFLICTS** (C13) |
| 5c | Linings: one part and gold, 12 hours, stack to 48, guards and leech | ruled 11-18, not built | L32. 46 section 3c, 55 priority 4, 53 section 4.2 and 54 row 34 all say build it. 54 adds a saved kit a ground | **FITS** |
| 5d | House curing | ruled 11-18 | 26-7 moves it to the Cellar at 250k, 750k and 2M, 4 hours a lining. 58 call and row 50: do not build it | **CONFLICTS** (C11) |
| 5e | Salvage, a fourth loot destination, fixed yields | ruled (answer 11) | 23-1 and L34 build it. 55 call 5 and 46 change 2: default, with a token Shop price, and Luck only | **CONFLICTS** (C3) |
| 5f | Patterns, read by one hero | ruled, one built | 54 row 25: defer, and teach the account if built | **CONFLICTS** (C6) |
| 5g | Good batch | ruled yes | L38. 54 and 56 both call it the cheapest repair. 26-2 caps all yield at 15% | **FITS** |
| 5h | Named reforging, Klappa's Klub | built, protected | 54 keeps both. 50 section 10.4 names Klappa's Klub as never cut | **FITS** |

### Sections 6 to 12

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 6a | The Tower line, four keys, weapons at the next tier plus skill | built | 22-2 confirms the power. 46 section 3a and 54 section 2.2 keep it. 42 conflict 4 asks whether plus skill still means anything at high Level | **FITS** |
| 6b | The Catacombs as a second chest line with its own mode | ruled 11-16, staged | 46 disagreement 4: merge it into one climb mode. 54 row 19: one wing and one key as the sample. 22-4 gives it its own rule | **CONFLICTS** (C16) |
| 6c | A third wing that leans gloves | proposed | Not in L48 or any review | **MISSED** (M6) |
| 6d | The late shape: 2% for ever, two-attribute pieces from Level 200, fusing | ruled (answer 4) and proposed | 50 section 1.4 lists two-attribute pieces as a projected source. No review or lane sizes them | **MISSED** (M5) |
| 6e | Chest reforging: six keys, one open | ruled (answer 6) | 22-3: built first. L29 | **FITS** |
| 6f | What weapon drops are still for. The Bronze and Silver problem | ruled | 50-6: the weekly limits stay and fast players skip early chest pieces. Reforging is the answer in both | **FITS** |
| 7 | The fist line | ruled identity, tiers 1 and 2 staged | 21-10 and L43: after the spell rule. 52 call 3: two rows, not six. 46 section 3c: defer | **CONFLICTS** (C5) |
| 8a | The skills from 1 to 99, band by band | mixed | 54 section 4.4: rune tiers at 75 and 90. 56 call 5: rune tiers at 1, 20, 40, 60, 80. The plan's Sealing Rune is in neither | **CONFLICTS** (C12) |
| 8b | After 99: patterns, staples by material, the maker's mark, reforging into bands | ruled (answer 3) and proposed | 56 section 2.2 calls the mark and good batch the right repairs. 54 defers the mark. Staples at 99 have no lane | **MISSED** (M7) |
| 9 | A hero's day | measured on the old engine | 50-13: heroes work all 12 rested hours. 54 section 2.4: the best path asks only 2 to 7 of them. Every hunting number is re-measured | **CHANGED** by the 12 hour frame |
| 10a | Gear costs more than a hero earns, on purpose | ruled 11-18 | 55 row 27 keeps it. 50 band E4 sets 100 to 140%. 24-11 prices past Krell by index. 23-2 lowers what a careful hero pays | **CONFLICTS** (C2) |
| 10b | How the game makes money | ruled 11-18 | 50-11, 55 section 2.4. No review argues | **FITS** |
| 10c | Gold in, gold out, and what trades | proposed | 55 section 2.1 has the same picture. 24-6 replaces the trade window with "list for a friend" | **FITS** |
| 10d | Reference values and the guard that no craft chain mints gold | proposed | No lane. L34 and L38 would ship salvage and good batch without it | **MISSED** (M4) |
| 10e | The Weighhouse shows one book a piece, with perks as filters | proposed | 55 change 1 designs standing buy orders and does not mention it. 54 section 8 flags about 400 jewelry rows | **MISSED** (M9) |
| 11 | The build order | proposed | Section D of `30-plan.md` re-ordered it around the engine batches | **CHANGED**. Section 5 below |
| 12 | Every audit finding and its resolution | record | Nothing re-opens a finding except 23-2 against the P0 fee row | **FITS** |

### Section 13, your twelve answers

| # | Your answer | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 13-1 | No budget. Sinks exceed a band on purpose. Tempering as built | ruled 11-18 | 55 keeps it. 23-2 changes what Tempering costs a hero who buys every tier | **CONFLICTS** (C2) |
| 13-2 | Past tier 7 the hourly drop is stock and chips | ruled | 53 section 4.1 has Risen grounds read gear rows at the hero's band, and flags the risk itself | **FITS**. One rule to add (M10) |
| 13-3 | The maker's mark after 99 | ruled | 56 section 2.2 agrees. It cannot ship before a region past tier 7 exists | **FITS** |
| 13-4 | Two-attribute chest pieces from the Level 200 key | ruled | Only 50 section 1.4 mentions them | **MISSED** (M5) |
| 13-5 | Necrotic and Storm, a spell of each for every weapon | ruled 11-18, confirmed 32-6 | 52 call 1: seven spells. 46 section 3c: defer | **CONFLICTS** (C4) |
| 13-6 | A chest reforge burns 6 keys and one open | ruled | L29 names the open and not the six keys | **FITS**. L29 should say six |
| 13-7 | The fist promise: best lone gold, comfortable, within 15% on XP | ruled | 52 trace T6 says the pace must be re-read against it | **FITS**. The promise is unchanged |
| 13-8 | About 55 Levels and six grounds a region, to 400 | ruled | 53 call 10 | **CONFLICTS** (C9) |
| 13-9 | Linings last 12 hours and stack to 48 | ruled | L32 as written | **FITS** |
| 13-10 | No Tempering carryover ("Sure") | ruled 11-18 | 23-2 overturns it and says so | **CHANGED** by 23-2 |
| 13-11 | Salvage | ruled | 23-1, L34. 55 wants it as the default | **CONFLICTS** (C3) |
| 13-12 | Quivers | ruled | 52 D3 | **FITS** |

### Sections 14 and 15

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| 14 | What is measured and what is not | record | Every measured number predates the to-hit ratio (L15), the spell rule (L17), the harder monsters (11-19) and the three gear states (50 section 1.4) | **CHANGED**. Re-measure on the new harness |
| 15a | The Luck bar, Lucky Rivets, the formula, the Bestiary stages | ruled 11-20 | L20 and L34. 56 section 2.7: the best designed long chase in the game. A-9, 27-3, 30-9 | **FITS** |
| 15b | The Lucky ring | ruled 11-20 | 30-4 puts it last, with the Morrow Hills. 54 row 37 agrees | **FITS** |
| 15c | Harder past Krell, and the Very Rare band | ruled 11-20 | 30-3 adds a Very Rare through Krell (a hero's hours) and moves the one past Krell to a four's hours. 54 call 5 fills the early one with stones | **CHANGED** by 30-3 |
| 15d | The cuts: the charm ladder, four food drop buffs | ruled | L20 and L39. 56 priority 4 | **FITS** |
| 15e | The safeguard: rivets only on what your own hunts dropped | ruled | L34's test line reads "200 pieces is one call". It does not name the allowance. 54 and 46 add new Luck feeds (C19) | **FITS**. L34's gate must name it (M4) |

### Findings 1 to 5 and Appendix B

| # | Plan item | Status | What the overhaul says | Verdict |
|---|---|---|---|---|
| F1 | Morrow coverage: 16 weapons, 30 armor pieces, 46 uniques | staged (`morrow-grid.js`) | A-3 and 31-4 cut a region to 15 to 20 new uniques. 53 section 4.6 moves boss pieces onto hall rolls | **CHANGED**. The grid is re-cut in L52 |
| F2 | Late chest odds, fusing | counted | Nobody | **MISSED** (M5) |
| F3 | The accessory power target, and the belt | measured, ruled | 23-5 re-states the target. 54 row 5 moves belts now | **CHANGED** by 23-5 |
| F4 | Recipes after 99 against pattern drops | counted | 54 defers patterns and does not say what jewelry does past tier 7 | **CONFLICTS** (C6) |
| F5 | The fist benchmark | measured on the old engine | 32-4 makes Mend about 11% of max HP. The prototype failed mostly because Mend was too small | **CHANGED**. Re-run before L43 sizes a heal |
| B1 | What Necrotic and Storm are | ruled, engine staged (`necrotic-storm.js`, `heal-cut.js`) | 32-7: only people are weak to Necrotic. 46 section 3b wants elements held until one does more than +15%, which B1 already does | **CHANGED** by 32-7 |
| B2 | Where each arrives: the Ox Road, the Old Guard | ruled, proposed | 53 section 4.2 gives the Ox Road its menders and names Necrotic's heal cut as the answer. 53 section 4.7 uses both as the region's new rule | **FITS** |
| B3 | The spells, 2 x 8 | ruled, sample staged | 52 call 1. 21-6 sizes them inside the bar budget at +5% and +10%. 32-1 puts the runes at 25 and 40. 32-6 gives the crossbow its own list | **CONFLICTS** (C4) |
| B4 | Does not exist. The plan's numbering goes from B3 to B5 | | | none |
| B5 | Rune names. Spell leech and lining leech measured together | names ruled 11-18 | The names are settled. No lane measures the two leeches together | **MISSED** (M13) |

**Counts.** 78 rows. FITS 30. CHANGED 16. CONFLICTS 20. MISSED 12. (B4 is not counted.)

---

## 3. Every conflict, with one recommendation each

Evidence labels: **RULED** with the date or id, **COMPUTED** in this lane from numbers on the page, **CITED** from the named doc.

### C1. Build pieces from the Sewer, against "generous to Krell, rare after"

- **Side A.** 46 change 2 and disagreement 2: named pieces with a property from the Sewer on. "Generous drops are not what hooks a player."
- **Side B.** RULED 11-20: generous through Krell, really rare and strong after. Plan section 15 changes nothing on the eleven open grounds. 54 call 3 withdrew its own early-piece call on the 12 hour frame: a property piece before Krell is worn one to seven days.
- **What both missed.** RULED 11-14: special pieces "sprinkled throughout the game" at every tier, sample of five. Two are live on Krell. Three are designed on existing hooks and not live (Widow's Fang in the Sewer, Mudlark's Mitts on the Slake, Demoncaller on the Pyre Field). RULED 30-3: a Very Rare every 60 to 90 hero hours through Krell, and no ground has a row.
- **Recommendation.** No re-open. Ship the three designed pieces as rows, and fill the early Very Rare with the items review's signature stones (a named stone set in jewelry, kept and reforged up, 54 section 4.1), starting with its sample of three grounds. That is the Director's "something to want on the hunt card" inside both rulings. The stone's bench job already exists behind the `jewel_guarantees` switch (CITED 54).

### C2. Tempering pays the difference, against sinks that exceed a band. RE-OPEN

- **Side A.** RULED 11-18 (answer 1): no budget, sinks above a band on purpose, "Tempering stays as built". Plan section 10: everything costs 1.0 to 1.4 times a band's gold. 50 band E4: 100 to 140%.
- **Side B.** RULED 11-20 (23-2, L35): going up a tier costs only the difference. It overturns answer 10 and says so. It does not mention answer 1.
- **Evidence.** COMPUTED from the plan's section 10 table (both Tempering tracks, six pieces carried by reforge, income after the x0.7 cut, all of it the plan's own estimate):

| Band | Tempering as built | Tempering at the difference | Reforges | Everything, as planned | Everything, with 23-2 | Band gold | Was | Becomes |
|---|---|---|---|---|---|---|---|---|
| 15 to 30 | 124k | 124k | 150k | 274k | 274k | 217k | 1.3x | 1.3x |
| 30 to 45 | 434k | 310k | 450k | 884k | 760k | 675k | 1.3x | 1.1x |
| 45 to 60 | 496k | 62k | 300k | 796k | 362k | 770k | 1.0x | 0.5x |
| 60 to 75 | 744k | 248k | 600k | 1.34M | 848k | 1.24M | 1.1x | 0.7x |
| 75 to 90 | 992k | 248k | 900k | 1.89M | 1.15M | 1.32M | 1.4x | 0.9x |

- **Recommendation.** Keep 23-2. No purchase wasted is right for players. Restore the over-ask at the formula layer: each tier's Tempering ladder is priced as a share of that band's gold on the 24-11 price index, sized so gear upgrades land in band E4. The difference between two index-priced ladders is then still a real bill. 43 conflict C6 asks for the same thing from the other side (every standing sink ends at tier 7 today). This re-opens "Tempering stays as built", so it needs your yes. Lane: L35 with L22.

### C3. Salvage by default and a token Shop price, against salvage as a choice

- **Side A.** 55 call 5 and 46 change 2: 86% of gear is sold and 0.9% worn (CITED 10), sold loot is 26% of gold in, so gear is "a coin with extra presses". Salvage by default, Shop price for gear past tier 2 cut to a token, and salvage pays Luck only.
- **Side B.** RULED 11-20 (Luck v3.1): per item, gold now or Luck for ever, set once. The measured price is about a fifth of hunting gold, which you approved as "a real choice and a real sink". RULED 23-10: gear sells for a quarter of a tier's coin. RULED 31-6: the first slot at 400k reads a played hero at Level 30 to 32. Plan section 15: the 15% step at the Morrow door is sized on a player who salvaged half. 50-9: the Luck bar keeps its hours. 55 section 9 lists its own risk: default salvage cuts gold in by 15 to 25% and breaks the first-slot guard.
- **Recommendation.** No re-open. Build L21 and L34 as ruled: Salvage is a line on the loot plan beside Sell, with both numbers shown. Ask the question again only with a real reading of what players pick. One part of the economy review is right and costs nothing: the starting loot plan (59 section 4.4) should exist, so nobody meets 24 dropdowns. On materials, keep the plan's split in two steps. L34 pays rivets on dropped gear and half the metal on a plain crafted piece, which the Fine order needs. Stock from dropped gear waits for the bands past tier 7.

### C4. Seven Necrotic and Storm spells, against 2 x 8

- **Side A.** 52 call 1: one spell a weapon, picked to fit it. Sixteen mirrored spells give every weapon the same leech and the same mana return (Reave, Leech Bolt and Draw are one mechanic). 46 section 3c: defer the whole thing.
- **Side B.** RULED 11-18: "each weapon type to have a spell for both". RULED 32-6 on 11-21: the crossbow gets its own list, "16 spells". Plan section 11, phases 6b and 6c: a measured sample of four first, then the other ten in one batch. 46 section 3b objects that an element is only +15%, and plan B1 already makes Necrotic a healing cut and Storm a mana burn.
- **Recommendation.** No re-open. The combat review's seven replace the plan's sample of four as the first batch of L44. The ruled end state stays sixteen. The other nine are not built from Appendix B3 as written. Each is redesigned after the seven are played, under one rule: no two weapons share a mechanic. The first seven must also carry the two rules the plan set: sized inside the bar budget (21-6), and measured together with leech linings (M13).

### C5. Fists as two rows, against plan section 7

- **Side A.** 52 call 3: the Hands on mana with no element, and the Palm taking its element from the rune it spends. Live Hand and Draw go. 46 section 3c: defer, "I expect it will not be missed".
- **Side B.** RULED 11-18: the identity statement and the promise (best lone gold from Level 40, within 15% on XP). Plan section 7: elemental strikes cost mana, and a rune is the optional stronger cast. Finding 5 measured why: with every strike on a rune the proxy's store bill was 2 to 10 times the hammer's and it lost gold from Level 42.
- **Recommendation.** Take the two rows. Keep the plan's cost rule inside the Palm: it strikes on mana in the element the player last chose, and feeding it a rune is the stronger cast. That keeps the gold promise, makes the fists a consumer of every rune family as 52 wants, and covers Storm and Bone through the Palm, which satisfies "a spell for both" for this family with no new rows. Do not defer past L43. Before L43 sizes the fist's own heal, re-run Finding 5 on the L17 engine, because Mend is now about 11% of max HP (RULED 32-4) and the fist may not need a second heal at all.

### C6. Jewelry to tier 7, against the plan past tier 7

- **Side A.** 54 call 1: jewelry and cloaks to tier 7 as the build layer. 54 rows 25 and 50: patterns and the maker's mark deferred until a market has real trades. A pattern, if built, teaches the account.
- **Side B.** Plan sections 4 and 8 and Finding 4: past tier 7 perk sizes stop, every worn recipe is a pattern (eight a region, ten recipes), reforging carries Hallmarked work into the next band, and a pattern is read by one hero (designer 11-18, the built `hr_recipe_learn`).
- **The gap.** With patterns deferred, nothing can be made for six slots past Level 110. The review's own finding ("the best kit is the same five accessories from Level 30 to 185") would repeat from tier 7 for 290 Levels.
- **Recommendation.** The two fit if patterns are not deferred. Tiers 4 to 7 are built as 54 asks. Patterns ship with the Morrow Hills in L47, on the plan's Finding 4 table, because patterns do not need a market. They need a region. A pattern teaches the account, as 54 says and against the plan's per-hero call, because four heroes learning one recipe four times is a repeated decision. Jewel reforging into band 8 is in L47's scope so a tier 7 piece carries on.

### C7. The unique property list cut to seven kinds, against the 11-14 ruling

- **Side A.** 54 call 4: bane, crit, spell change, element edge, second socket, thorns, sweet spot. Element guards belong to linings. Plus skill belongs to chest weapons. "Plus 10% fire guard is a lining, not a unique."
- **Side B.** RULED 11-14: special-attribute items are "normal stats + one attribute: % physical resist, +skill, etc.", and Krell's legs carry physical resist. Plan section 3 keeps all twelve kinds. `special-attributes.js` has six, four of them plain numbers (CITED 54).
- **Recommendation.** Split by tier, and nothing re-opens. At tier 7 and below, a special piece is the standard piece plus one attribute from the full list, exactly as you ruled. They are cheap, farmable and short lived. Past tier 7, a unique's one property comes from the seven decision kinds. A guard or plus skill may still be part of a unique's stat mix, bought out of its budget at the exchange rates of 41 section 6.1, but it is never the property. Status ward stays on the later list. Quivers stay dropped uniques (answer 12), and the workbench makes what goes in them.

### C8. Perks sized by their case, against the 4% budget. RE-OPEN (a reading of 23-5)

- **Side A.** 54 call 2: a perk is worth 5 to 8% in the hunt it is built for and near nothing outside. A matched hero earns up to about +10% on that ground. The 4% of 23-5 is read on a hero whose perks do not match the ground.
- **Side B.** RULED 23-5: all perks on twelve seats add up to 4%. Plan section 4: about 1% ordinary and about 3% in the case, and a whole set one tier up is at most one weapon step. Measured (plan, `jewelry.js`): Steady in its case reads 1.4 to 1.7 times its ordinary size, not 3 times.
- **Recommendation.** Take case sizing for perks with a narrow case (Opener, Finisher, Giantsbane, Windbreak, Thick, Brace, Slip). Hold "always" perks (Keen, Follow-through, Surge) at their built sizes. Add one guard line beside G10: a hero whose twelve seats all match the ground gains at most one weapon step, 9% XP. That is the plan's old rule doing a new job, and it stops 5 to 8% a perk from stacking past the gear ladder. Start at 5% in the case, measure three perks in and out of their case at Level 88, then size the rest. You ruled 4% as a total, so reading it on the mismatched hero needs your yes.

### C9. Four grounds a region, against six. No re-open yet

- **Side A.** 53 call 10: a region is four grounds, one hall and one new rule, with Risen grounds carrying the hours. Six grounds four more times is 24 copies of the template at an art cost the team cannot pay ahead of a four.
- **Side B.** RULED 11-18 (answer 8): about 55 Levels and six grounds a region to 400. RULED A-10: sketch regions 4 to 7 now (L56). Finding 1's grid needs the last two grounds to carry three weapons each. 50 band R1 to R3: a four gains 69 Levels a month past 110.
- **What changed since the ruling.** A-3 and 31-4 cut a region from 46 new uniques to 15 to 20. The coverage reason for six grounds is mostly gone.
- **Recommendation.** Keep six as the planning number in the L56 sketches, and open every region in two steps: four grounds and its hall first, then the last two grounds as the region's second patch. That meets the runway bands sooner, keeps your ruling, and keeps the plan's grid (the three-weapon grounds are the late pair). Whether a region stays at four for good is decided after the Morrow Hills have been played with Risen grounds live. 53 cites `itemization-roadmap.md` for the region sketch. That file is superseded, and L56 should read the plan's section 2.

### C10. Kindlings, marks and the skill tree, against the 11-05 hold. RE-OPEN, for a spec only

- **Side A.** Three reviews ask for a permanent build choice. 56 call 3: every ten Inner Flame levels a hero lights one of three Kindlings. 46 change 5: a mark every five Levels into six tracks, one of them luck. 52 section 4.4: a written sample of one family.
- **Side B.** RULED 11-05: the skill tree is on hold until you raise it. Plan section 8 has no tree, and the Canary pass skipped it for that reason. RULED 23-5: the Add pool is about 9% in five budgets. RULED 11-20: one Magic Find budget of 104, two feeds, nothing else.
- **Recommendation.** One system, not three, and Kindlings are the one to bring to you, because they use a skill and drops that already exist. Lift the hold for a spec and a paper sample of five rungs, built only after L15 and L17. Three fences from the item plan go into that spec. It spends the 2% budget that 23-5 gave to worn in and plus skill, and no more. No Kindling touches drops or Magic Find. No Kindling copies a jewelry perk or a unique's property kind. Its job is the one worn in was designed for, a choice of direction, so two tanks differ.

### C11. Do not build curing, against two rulings

- **Side A.** 58 call and row 50: curing puts a slot, a timer, a fee and a second visit on what one bench press does. Real heroes are idle 59% of their lives. The best path asks 2 to 7 of 12 rested hours (CITED 54, T7). Curing's fee is about an eighth of the lining's own gold cost.
- **Side B.** RULED 11-18, overruling the designer's cut: "We can do this, just make it a gold sink." RULED 26-7: the Cellar is the curing room at 250k, 750k and 2M, which replaces the plan's 100k, 250k and 500k.
- **Recommendation.** Do not ask a third time. You have ruled it twice, the second time with prices. Sequence it last in the lining work (L33 after L32), keep it out of the beta gate, and size its slots on the T7 reading when linings are live. Take the part of 58 that conflicts with nothing: the Cellar's five food rungs come off sale now, because the effect they sell is being cut (23-6).

### C12. What Runecrafting makes from 61 to 99

- **Side A.** 54 section 4.4: two new rune tiers at 75 and 90. 56 call 5: respace the five tiers to 1, 20, 40, 60 and 80.
- **Side B.** Plan section 8: a Sealing Rune at 75 to 87, used up by tier 6 and tier 7 Hallmarks, and good batch topping out at 99. RULED 10-23: five tiers, one every 15 levels, cast at Magic 1, 15, 30, 45, 60. RULED 21-5: every spell scales with the caster's own hit, chosen over adding spell ranks.
- **Recommendation.** The plan's Sealing Rune, in two grades: one at Runecrafting 75 for tier 6 Hallmarks and one at 88 for tier 7. It fills the gap, ties the fourth trade to jewelry, and adds a material to the two dearest Hallmarks. It touches no ruling. New rune tiers bring ten new spell versions the week after the spell rule removed the need for them. Respacing moves a number you ruled. Neither review saw the Sealing Rune, and it rides the jewelry lane for tiers 5 to 7.

### C13. The workbench salt recipes

- **Side A.** 54 call 8 and 56 section 2.2: three workbench recipes duplicate Smithing's salts, give no decision and have 0 real hours. Remove them.
- **Side B.** Plan sections 4 and 5: salts at either bench, so Crafting has a product at 45, 60 and 75. RULED 11-05 says only that Tempering needs crafting. The shape is the designer's.
- **Recommendation.** Remove them in the lane that ships linings (L32), and not before. Until linings and belts exist they are the only thing Crafting makes at those levels.

### C14. Gloves hourly, against slow on purpose

- **Side A.** 54 row 4: gloves drop hourly like the other four armor slots. Gloves (43) and belts (41) are the two largest gaps in the MID kit (CITED 54, atlas A4). 50 band E2 asks every slot early in a band through Krell.
- **Side B.** Plan section 3: gloves are Rares on purpose, with a glove wing in the Catacombs. RULED 11-18: "a GLOVES path goes in the Catacombs".
- **Recommendation.** Take the review's change through tier 7. It is what "generous to Krell" means for a slot. The ruling is untouched, because the glove wing is the won pair (the next tier's numbers plus skill) and still worth opening.

### C15. One boss door, against call series. RE-OPEN

- **Side A.** 53 call 4, 46 change 3, 54 row 16, 59 section 8: Call out folds into keyed halls. One real use of Call out, 19 Hall Keys found and no Hall fought (CITED 11). A key is one prize roll and the only clock.
- **Side B.** RULED 11-14: the boss call with a slider, stamina, drops only on a win. RULED 22-8: Call out costs stamina only. Plan section 2: "Earlier bosses are call series". Finding 1 counts the Roost Mother's five pieces as repeatable because she is a call series.
- **Recommendation.** Merge, with one rule from the item plan kept: a mid-region boss's pieces stay repeatable. Under "one key, one roll" that holds, since a hero can spend every key it finds. If the daily limit stayed on those halls, the Roost Mother's pieces would stop counting as a family's first unique and Finding 1's grid would fail. Four reviews agree and the evidence is real, so I recommend you re-open it.

### C16. The Catacombs as a wing of the Tower, against their own mode

- **Side A.** 46 disagreement 4: it is the Tower again with armor in the chest.
- **Side B.** RULED 11-16: their own mode, their own board, wings, key families. RULED 22-4: below, the store does not reach you and you fight on what you carried. 56 section 2.6 calls that the best new decision in the endgame. 46 was written without 22-4.
- **Recommendation.** No re-open. Keep the mode. Build one wing and one key as the played sample before the other 36 pieces (54 row 19). The item side is the same either way: one chest, two key families, six opens a family.

### C17. Commissions deferred, against the tier 7 skill gate

- **Side A.** 46 section 3c and 54 row 50: defer commissions until the market moves goods.
- **Side B.** Plan section 4: a tier 7 reforge needs Smithing 99 and Krell's gem, "and a hunter without the skill uses a commission". RULED 50-15: a non-crafter can buy crafted power. A carried Hallmarked piece cannot be bought. It can only be worked on.
- **Recommendation.** Split the plan's phase 5. Single jobs (one Hallmark or one reforge on a piece the owner keeps) ship with jewelry tiers 5 to 7, on the Weighhouse's escrow, as 55 section 4.6 sketches. Bulk orders wait for the idle market. Without single jobs the only way to carry a ring to tier 7 is to raise your own smith to 99.

### C18. "Fold chest reforging into Tempering", against 22-3

- **Side A.** 46 section 3c and change 3: Tempering is the one way to improve a piece. Worn in, chest reforging and curing fold in.
- **Side B.** RULED 22-3 and answer 6: chest reforging is built first. It is not a percent on a piece. It carries a won piece up a key tier and is the plan's answer to early chest pieces being outgrown.
- **Recommendation.** No change. Worn in is already folded in (23-4). Chest reforging stays its own verb in L29. The Director's real point, one place that sells percent for gold, is already true once worn in is gone: Tempering is the only one.

### C19. New Luck feeds, against two feeds and one budget

- **Side A.** 54 section 4.2: a find list a ground that pays Luck. 46 change 5: a luck track for Level marks. 59 row 7: one kill ladder where stage 1 pays Tamsin's gear and later stages pay Luck.
- **Side B.** RULED 11-20: Luck is rivets used plus Bestiary stages. "Anything else: none." The curve's hours are kept (50-9).
- **Recommendation.** Keep two feeds. The find list is a good goal and belongs on the Honors page (56 section 4.2) and the Hall of Firsts (58 change 1), paying a line and a mount. No luck track in any build system. The kill ladder merge is fine for Luck as long as all six of the plan's stage payments survive.

### C20. Three band tables

- **Side A.** Plan section 2: bands 8 to 18, two a region, about 27 Levels each. Luck's rivet table, the rarer-Rare step and the price index all count those bands.
- **Side B.** `temper.js` `TEMPER_UNIQUE_BANDS` has four bands at 110, 125, 145 and 165. 50 section 1.4 projects a band every 20 Levels past 185. 42 section 7.6: on the ruled line a fixed-width band is +18% at Level 110 and +1% at Level 2,000.
- **Recommendation.** One band table in `src/data`, beside the gear curve (41 model item 7, 42 M3), and every consumer reads it. To Level 400 it is the plan's table, because three ruled systems count on bands 8 to 18. COMPUTED on the ruled line, a 27 Level band is +25% at 110 and about +8% at 377, which still sits inside the weapon step. Past 400 a band is a fixed percent of the line and not a fixed number of Levels. The four bands in `temper.js` are re-keyed when the table lands.

### C21. Krell's daily prize

- **Side A.** 54 call 6 and 53 call 5: plain Dawnsteel drops in the Hold as Rares. The daily roll keeps the uniques, the Trophy and the tier 7 gem. A lone hero waits 33.5 days for his weapon in a band of 17.5 (CITED 54).
- **Side B.** Plan section 2: tier 7 from Krell, finished in the Morrow Hills. RULED 11-14: Krell is a daily kill with two uniques. The contents of the roll were the designer's.
- **Recommendation.** Take it. It moves no ruling. Two riders from the plan. Krell's gem stays on the daily roll, because the tier 7 Hallmark is built on it. Krell's five sidegrade weapons (L52) are what replace the Dawnsteel rows, so the roll does not read empty.

### C22. Six Rare rows a ground

- **Side A.** 54 call 7: at most six. You ruled the reveal stays on every Rare (27-6), and a four sees one every 7 minutes on the Warrens.
- **Side B.** Plan section 3: the template past tier 7 has seven uniques, a pattern, a gem on every second ground and a named fuel.
- **Recommendation.** Take the cap. After A-3 a ground carries two or three new uniques, one Very Rare, a pattern and a gem or a fuel, which is six. Through Krell the rows that leave are next-tier ladder pieces. Named pieces, gems and the three sample pieces of C1 stay.

### C23. Weekly orders were not rejected

- 59 section 4.8 and 57 section 4 both say you turned down weekly orders on 11-18. RULED 11-18: you rejected "wanted and unwanted lists on weekly orders" and three other ideas. Orders themselves were not objected to (plan section 12).
- **Recommendation.** They stay in the plan as BUILD-LATER (ruled 11-21), behind chips and the market. See M3.

---

## 4. What the overhaul is missing from the plan

Each row is something the plan designed that no review, audit or lane picked up. None is cut. Each gets a home.

| # | From the plan | Why it matters | Where it goes |
|---|---|---|---|
| M1 | **Gem chips** (section 4): every monster on a tier's grounds drops chips, ten make a gem, paced to a gem every band-hours over 8 | Jewelry tier 4 needs six gems a hero. At 11 hours a whole gem that is 66 hunted hours in a band of 66 to 87 (CITED 54 trace 5.1). Without chips a tier is finished the day it is outgrown | **L37**. Chips ship with the tier 4 sample, sized on the 12 hour frame |
| M2 | **The Fine order** (section 4): "make until Fine with one of these perks, salvage the rest, stop after this many bars" | The Fine chase is 8 to 20 presses a piece today. It is a first principle bug the plan already fixed on paper | The second jewelry lane (J2 in section 5), with the salvage arm from L34 |
| M3 | **Weekly orders and stirred grounds** (section 4) | Extra chip sources and a reason to pick a ground. Both overlap newer ideas: the ground weekend (27-5) and "The Week" card (59) | BUILD-LATER, judged against 27-5 once chips exist. Not before the market opens |
| M4 | **Reference values and the no-mint guard** (section 10), and the rivet allowance (section 15) | They are what makes salvage, good batch and commissions safe. L34 and L38 are written without them | A gate on **L34** and **L38**: neither ships until the guard proves no craft, salvage or good batch chain ends in more Shop gold than went in, and that rivets never exceed what the account's own hunts dropped |
| M5 | **The late chest shape** (section 6, Finding 2, answer 4): 2% base for ever, two-attribute pieces from the Level 200 key, fusing | Ruled, and counted over 20,000 trials. The standards list it as a projected source and nothing sizes it. 42 section 7.7 also finds the Tower stops at floor 300 | **L56** carries it in each region's key row. Built with region 4 |
| M6 | **The Catacombs glove wing** (section 6) | The ruled home for won gloves | **L48**, after its one wing and one key sample |
| M7 | **After 99**: staples open by region material, the maker's mark, reforging into a band (section 8) | It is the whole crafting game past Level 110 | **L47**, with patterns (C6) |
| M8 | **Region tables as an authoring shape** (section 3): stock and chips written once a region | A ground drops from about 19 new rows to 15. It also fits brief 40: content as data, not copies | **L47**, in the ground pack |
| M9 | **One market book a piece, with grade and perks as filters** (section 10) | Tiers 4 to 7 with a pool of 22 is about 400 jewelry rows (CITED 54 section 8). The idle market in 55 has no answer for it | The idle market lane (55 change 1), and 44 when it lands, since a perk as an attribute of a held piece is a schema call |
| M10 | **A drop rule for a ground played above its band** (answer 2, section 15) | 53 section 4.1 flags it: "the Glade becomes the cheapest source of a band 9 body" | **L31**, and Risen grounds if you approve them. One rule: a risen or scaled ground drops its own rows at its own rarity. Its hourly drop past tier 7 is stock and chips. The rarer-Rare step is read at the band the loot is paid at |
| M11 | **The placed-or-cut table for old rows** (section 4) | L36 must check every orphan against the roadmap. For 22 accessory rows the plan is that roadmap: Gold Ring is the tier 4 plain ring, the Trollhide Cape moves to tier 7, and so on | **L36** reads it. The old rows pay melee only (Finding 3), so placed rows are re-cut to help all three styles |
| M12 | **The job worn in did**: two heroes with the same sword end up with different swords (section 3, your 11-18 ask) | 23-4 removed the system and nothing owns the purpose | The Kindlings spec (C10), if you lift the hold. Otherwise it is knowingly dropped |
| M13 | **Spell leech and lining leech measured together** (B5) | Reave, Leech Bolt and Tithe heal from damage, and so does a leech lining. They stack | A test line on **L44** and **L32**: the two together stay under the fist's own heal budget, and Withered cuts both |

Two smaller notes. The 30-plan stack table and 50 section 1.4 still list worn in as a budgeted source, which 23-4 retired, so both rows should be corrected at the plan re-issue. And the plan's own build order never placed the 11-14 special pieces below tier 7, which is why three designed samples are still not live (C1).

---

## 5. The plan's build order, re-sequenced into the overhaul

The plan's thirteen phases against the lanes of `30-plan.md` section D. Existing lane ids are used where they exist. Four pieces of the plan have no lane, and they are named J2, J3, J4 and K1 here so the plan re-issue can number them.

### Where each phase lands

| Plan phase | What it was | Lane | Note |
|---|---|---|---|
| 0 | Drop homes, recipe cuts, bench stats, the Defense fix, the Tower raise | done, **L15**, **L29**, **L36** | Drop homes shipped. The Defense fix is replaced by to-hit as a ratio (A-8). The Tower raise is 22-2, inside L29. Recipe cuts are L36 |
| 1 | Fist engine pieces, wraps at tiers 1 and 2, two spells | **L43** | Two rows (C5). Finding 5 is re-run on the L17 engine first |
| 2 | The jewelry sample, one reforge, one pattern | built | Live since v0.2.99 and the 11-18 lanes |
| 2b | The Bestiary half of Luck | **L20** | As ruled (27-3, 30-4 step 1) |
| 3 | Gem chips, fee rows, salvage, reference values and the no-mint guard | **L37** (chips, tier 4 fees), **L21** and **L34** (salvage), gate M4 | The guard has no lane today |
| 4 | The other seven first-wave perk hooks, the Fine order | **L37** (three hooks), **J2** (the rest) | |
| 5 | Commissions | **J4** (single jobs), bulk orders BUILD-LATER | C17 |
| 6 | Linings | **L32**, then **L33** | The workbench salts leave in L32 (C13). The saved kit a ground (54 section 4.3) lands with it |
| 6b, 6c | Necrotic and Storm in the engine, the sample, then the rest | **L44** | Seven first, sixteen in the end (C4). L57, the spell audit, is done (32) |
| 7 | Belts to crafting | **J2** | 54 moves it earlier than the plan did |
| 8 | Ladders for tiers 4 to 7 | **L37** (tier 4), **J3** (tiers 5 to 7) | J3 carries the Sealing Rune (C12) |
| 9 | Good batch, patterns, weekly orders, stirred grounds, curing | **L38**, **L47**, later, later, **L33** | |
| 10 | Chest reforging, fusing, the glove wing | **L29**, **L56** then region 4, **L48** | L29 should name the six keys (answer 6) |
| 11 | Property hooks, Krell's five, worn in, the Morrow grounds, the Ox Road and Old Guard walls | **L52**, **K1**, **L47** | Worn in is not built (23-4). The spell change hook is the first one built |
| 12 | Fist tiers 3 to 7, its Tower rows, its two spells | **L43**, second half | The spells are the Palm on Storm and Bone runes |
| Section 15 | Luck: bar, salvage, ring and rarer Rares | **L20**, **L34**, **L47** | 30-4 |
| Section 5 | Tempering carries up | **L35**, with **L22** | C2 |

### The order

Every item lane that changes a hero's power waits for L15 and L17, as the plan of record already says (stack rule S6). Inside that, this is the order I recommend.

| Step | Lane | What it holds from the item plan | Waits on | Gate from this doc |
|---|---|---|---|---|
| 1 | **L36** | Catalogue truth and the cut list, read against the plan's placed-or-cut table | nothing | M11 |
| 2 | **L35** | Tempering pays the difference | nothing to build. Your call on C2 to price | C2 |
| 3 | **L20** | Luck step 1: the bar, the Bestiary stages, the charm cut | nothing | Two feeds only (C19) |
| 4 | **L21** | The loot plan by kind, with a starting plan | L03, L07 | Salvage is a line, never the default (C3) |
| 5 | **L38**, **L39** | Good batch, room rungs, the food drop buffs off | nothing | The no-mint guard reads good batch (M4) |
| 6 | **L37** | Jewelry tier 4, three perk hooks, the five budget lines, **gem chips**, the gloves row change | L15 | M1. The matched-hero line of C8. C14 |
| 7 | **K1** (new) | Krell's Hold rows: plain Dawnsteel onto the loot bands, the three designed special pieces live, the Very Rare band and three signature stones | L16, L37 | C1, C21, C22 |
| 8 | **L34** | Luck step 2: salvage, rivets, half metal from plain crafted pieces | L20, L21 | M4: reference values, the no-mint guard, the allowance |
| 9 | **J2** (new) | The remaining perk hooks, belts to the workbench, the Fine order, case sizing after three perks are measured | L37, L34 | M2, C8 |
| 10 | **L29** | Chest reforging (six keys, one open) and chest weapons at the next tier | L17, L18 | Answer 6 |
| 11 | **L52** | Krell's five as the unique sample, the spell change hook, duplicates feed Tempering, reforge up a band | L17, L29, K1 | C7: the property comes from the seven kinds |
| 12 | **L32** | Linings, the saved kit a ground, "keep these linings up". The workbench salts leave | L17, L16, L22, L31 | C13, M13 |
| 13 | **L44** | Necrotic and Storm: the elements, Withered, Storm and Bone runes at 25 and 40, seven spells, the two guard linings | L17, L32 | C4, M13 |
| 14 | **L43** | Fists: two rows, wraps to tier 7, Tower rows, weak side "blunt" | L17, L44 | C5. Finding 5 re-run first |
| 15 | **J3** (new) | Jewelry tiers 5 to 7, the Sealing Rune in two grades, jewel reforging for every tier | J2 | C12. Tier 7 must exist before a four leaves Krell's band |
| 16 | **J4** (new) | Commissions, single jobs only | J3, the market open, L41 | C17 |
| 17 | **L33** | The Cellar as the curing room | L32 | Sized on the rested-hours reading (C11) |
| 18 | **L56** | The four region sketches: six grounds opened four then two, the band table, the late chest shape in each key row | nothing. Design only | C9, C20, M5 |
| 19 | **L47** | The Morrow Hills: the weapon and armor line as the gear curve, the re-cut grid at 15 to 20 uniques, region tables, patterns for the account, staples at 99, the maker's mark, Luck step 3, Very Rares on the party's clock, the Ox Road's Necrotic wall and the Old Guard's Storm | L15, L16, L17, L22, L34, L37, L44, L52 | C6, C20, M7, M8, M10 |
| 20 | **L48** | The Catacombs descent, one wing and one key first, then the rest, then the glove wing | L16, L29 | C16, M6 |
| 21 | **L53** | Factions. The item plan's only stake is that every region has equal First Flame and Last Ember grounds, which C9's four-then-two opening keeps (two pairs, then a third) | L17 | none |
| later | | Weekly orders, stirred grounds, bulk orders, the one-book market view, quivers, status wards, two-attribute chest pieces and fusing | their regions, the market | M3, M5, M9 |

**Against the waves of the plan of record.** Steps 1 to 5 can ride wave 2, since none of them moves combat power. Steps 6 to 17 are the long chase of wave 3, built during the beta as 30-7 ruled. Steps 18 to 21 are wave 4. The one item I would pull forward is K1 and L52 together, because a four is at Krell's Hold on day 18 and out of open content on day 27 (50 section 2.7) with two uniques in the game.

---

## 6. What needs your yes

Only these move something you ruled. Everything else in this document is a sequencing or reading call inside the rulings.

| # | Ruling it touches | Recommendation | The evidence |
|---|---|---|---|
| C2 | 11-18, "Tempering stays as built" | Price each tier's ladder as a share of band gold, so 23-2 does not erase the over-ask | The table in C2: 1.0 to 1.4 times becomes 0.5 to 0.9 times at tiers 4 to 6 |
| C8 | 23-5, perks add up to 4% | Read the 4% on a hero whose perks do not match the ground, and cap a fully matched hero at one weapon step | Perks measure about 1% each and nobody has paid a Hallmark fee (CITED 54, 10) |
| C10 | 11-05, the skill tree on hold | Lift it for a Kindlings spec only, with the three fences | Three reviews found the same hole. Worn in's purpose has no owner |
| C15 | 11-14 and 22-8, Call out | One boss door, a key is a roll, mid-region pieces stay repeatable | One real use of Call out. 19 keys and no Hall fought |

Four re-opens that reviews asked for and I do not recommend: salvage by default (C3), seven spells in place of sixteen (C4), dropping curing (C11), and the Catacombs as a Tower wing (C16).

---

## 7. Evidence and what was not done

| Label | Claim | Source |
|---|---|---|
| RULED | Every ruling quoted | `rulings-of-record.md`, `30-decisions.json` |
| COMPUTED | The Tempering table in C2 | Plan section 10's own columns. Its income column is the plan's estimate and predates the re-measure |
| COMPUTED | A 27 Level band is +25% at 110 and about +8% at 377 on the ruled line | Dawnsteel x Level / 110, plan section 2 |
| CITED | Real-player and solver numbers | 10, 11, 54, 55 as named beside each |
| CHECKED | Status labels built and staged | A search of `src/data`, `src/core` and `tools/balance-sim/staged` in this lane: `fists.js`, `necrotic-storm.js`, `jewelry.js`, `special-attributes.js`, `patterns.js`, `catacomb-armor.js`, `temper.js` are present. No file holds salvage, chips, commissions, good batch, rivets, Magic Find, thorns, sweet spot or spell change |
| NOT DONE | Nothing was played or measured. 52, 53 and 55 to 59 were read by search for item topics and not in full. 21 to 28 (the old dives) were not re-read. `44-formula-architecture.md` and `51-baseline.md` had not landed. Ruling 31-4 has an empty ruling field in `30-decisions.json` and is taken as ruled from the rulings of record |
