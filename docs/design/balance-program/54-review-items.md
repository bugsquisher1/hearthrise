# Balance program 54: Design review of equipment, rare items and crafting

Review of `lane/d-review-items` (game-designer, 2026-11-21), cut from `set/v0.2.144` at 0a97126c3. PHASE A: reading and analysis only. No game code, data row or migration was changed. No grid, matrix or browser run was made. Every number is read from the cached files (`tools/balance-program/atlas.json` a0d9a042d, `paths.json` 8b03c56aa), from `src/data/*` and `src/core/*`, from `10-real-players.md` and `11-krell-hunt-2026-11-20.md`, or from the old dive `23-items.md`.

Briefs of record: `45-design-brief.md` (the main brief) and `40-formula-brief.md` (every change is placed at its layer). Labels: **EVIDENCE** (with its source) and **HYPOTHESIS** (to be measured in phase B or played by real people). RULED means Tyler already decided it, with the decision id from `30-decisions.json`.

What this review does not repeat. The old dive (23) answered thirteen questions for each of 22 systems, and Tyler ruled its ten calls on 2026-11-20 (23-1 to 23-10). Those rulings stand and are only named here. This review asks the Game Director question the old dive did not: are these the right systems, and do they make one item game.

---

**Corrected 2026-11-21 (Tyler: "unless you're counting massive changes, krell will not take 4 months").** The first cut of this review said a normal player reaches Krell in about month four. That number came from the retired 3.3 hours a day frame. On the ruled 12 hour frame (`50-standards.md` 2.7) a lone MID hero reaches Krell's Hold at Level 88 on day 39, a four on Deadly on day 18, and the ceiling on day 8. Open content ends at Level 110 on day 60, day 27 and day 11. The measured grid is faster again: a MID four reaches Level 100 in 257 hunted hours against the ruled 600. Every time horizon below is now on that frame. One call changed because of it: call 3 is withdrawn. Calls 1, 5 and 6 were re-read on the same frame and stand, each with a new caution written into it.

## 1. One screen for Tyler

**The verdict.** The pieces are well made and they do not yet add up to "deep gear and rare drops". Between Level 30 and Level 110 the item game is a ladder that equips itself. Everything that would make gear interesting is either a Level 30 sample that never grows or is parked past Level 110. If we were starting today I would build the same seven tiers and the same benches. I would not build the same order. I would build what a hero keeps before what a hero outgrows: jewelry run to the top of the game as the layer a build is made of, Krell's uniques ready the day the ladder ends, and one system that sells percent for gold and not four. On the 12 hour clock the ladder is over fast. A four reaches Krell's Hold on day 18 and the end of open content on day 27, and a lone hero on day 39 and day 60 (`50-standards.md` 2.7). So the weak spot is not the wait before Krell. It is that the item game meant to last thousands of hours has two pieces in it when a player arrives.

**The five changes that matter most.**

| # | Change | Why |
|---|---|---|
| 1 | **Jewelry and cloaks run to tier 7 now, as the build layer.** Two rings, earrings, necklace and cloak are six of fourteen slots. Nothing with a source exists for them past Level 30 | The solver's best kit wears the same five accessories from Level 30 to Level 185. Real players made 89 pieces, set 4 and paid no Hallmark fee, ever |
| 2 | **Perks are sized for the hunt they are built for, not 1% everywhere.** A perk is worth 5 to 8% in its case and close to nothing outside it. Then which jewelry you wear is a choice you make for a ground | Twenty two perks at about 1% each are twenty two names for the same number. No player can feel 1% |
| 3 | **Krell's five weapons built first, with the unique list cut to kinds that change a decision.** No ground by ground property pieces before Krell | A four is at Krell's Hold on day 18 and out of open content on day 27. Two uniques are live. A property piece on an early ground would be worn for one to seven days, so that work belongs where players stay |
| 4 | **Every ground's Very Rare is a signature stone a smith sets in jewelry.** It carries one perk that cannot be rolled. The piece reforges up, so the find lasts | The Very Rare band is ruled at 60 to 90 hours a hero through Krell and no ground has one. The guarantee jobs that would set it are already written and switched off |
| 5 | **Standard Dawnsteel comes off Krell's daily lottery.** The 14 plain tier 7 pieces drop in Krell's Hold as Rares like every other tier. His daily roll keeps the uniques, his Trophy and his gem | A lone hero waits 33.5 days for his own weapon in a band that lasts 17.5. When the Ox Road opens the same sword drops there about 700 times faster |

**What is actively harming the game.**

- Six of fourteen slots stop at Level 30. A lone hero passes Level 30 on about day 4 (`paths.json` B1 band lengths) and has nothing to want in them from then on, at any Level.
- Tier 7 is a once a day roll on one boss. Four of its armor slots (legs, boots, gloves, belt) have no open source at all at Levels 88 to 110.
- The Rare reveal fires for a party of four about every 7 minutes on the Warrens. You ruled the reveal stays on every Rare. So the fix is fewer Rare rows a ground, not a quieter reveal.
- Hall Keys drop every two hours and the prize is once a day. The four on Krell's Hold found 19 keys and fought no Hall.
- Four systems ask gold for one or two percent (Tempering, the Hallmark fee, linings, worn in). Two of them were already merged or ruled. Players have bought almost none of it.

**What I would add.** Signature stones (change 4). A find list for each ground that pays Luck the first time an account finds each named piece, which gives the 99% of drops nobody wears one moment of worth. A saved kit for each ground, so a hero changes rings, linings and a unique when the party moves without anyone doing it by hand.

**What I would take out.** The second recipe for every Tempering salt at the workbench. The five tier 1 ladder weapons nothing gives out. The Lucky ring until uniques trade. Pure number properties from the unique list (plus 10% fire guard is a lining, not a unique).

---

## 2. Systems review

### 2.1 Equipment

**The seven tier ladder** (`gear-tiers.js`: Levels 1, 15, 30, 45, 60, 75, 88; six armor slots in three weights; seven weapon families; shields and spellbooks).

- What it is for. It is the pacing spine: a Level gate turns into a stat step. A weapon tier is +5 to +9% Level XP an hour and an armor tier is 13 to 26% less damage early, 5 to 10% late (EVIDENCE, CITED in 23 from the measured tables).
- How it plugs in. It is generated from one table, so it already sits at the curve layer of brief 40. Tempering, the Shop's bid, the solver's MID kit and the chest weapons all key on the tier.
- Does it earn its place. Yes as pacing. No as loot. EVIDENCE: 26 to 29 gear pieces drop a hero-hour from Level 10, 86% is sold, 0.9% is ever worn (`10-real-players.md` section 5). Each slot's current piece arrives inside the first hours of a band, and one "Equip upgrades" press wears it (PLAYED, 23). A band lasts 0.67 to 7.25 days at 12 hours (EVIDENCE, `paths.json` B1 `bandDays`). So the ladder makes no decision and no moment after the first set.
- Too many or too few tiers. Seven is right. Each step is inside the ruled +5 to 8% and the bands are already short. More tiers would be more rows to sell. Fewer would open a gap over 25 Levels (band E1).
- Verdict. KEEP the ladder as it is. Stop asking it to be the loot game.

**The three armor weights** (`armour-weights.js`: heavy adds max HP and absorbs, medium dodges, light adds mana and wards, and mixed pieces blend with no penalty).

- This is the one standing gear decision the ladder holds, and it is a good one: it is classless, it is set once, and it changes how a hero survives.
- HYPOTHESIS: mixing is not a live choice today. Every style has an obvious weight and the "Equip upgrades" press follows defense. Phase B measures heavy, medium and light on a tank, a bow and a Mage at three checkpoints. If one weight wins everywhere for a style, the fix is at the coefficient layer (the three guard numbers), never a per-style rule.
- Verdict. KEEP. Measure in phase B.

**The fourteen slots.**

| Group | Slots | Where the pieces stop | Evidence |
|---|---|---|---|
| Dropped hourly | helmet, body, legs, boots, weapon, shield or book | Tier 6 hourly on Krell's Hold. Tier 7 is the Hall's daily roll | `atlas.json` items and sources |
| Dropped as Rares | gloves, belt | Tier 6 on Krell's Hold at 0.12 to 0.18% a kill. No open tier 7 source | `grounds/krells_hold/pack.js` |
| Crafted | ring, ring, earrings, necklace, cloak | **Tier 3, Level 30.** Twenty two accessory rows from tier 3 to tier 8 exist with no source (Spider-Eye Studs to the Dawnforged Signet) | `atlas.json` `lists.noSource` |
| Used up | ammo | Tier 7 arrows at Crafting 91, whetstones at Smithing 90 | `recipes-table.mjs` in 23 |

- EVIDENCE: on every solver run the best kit's accessory targets are the same from the 30 to 45 band through the 110 to 185 band: two Hallmarked Seam Jasper Bands (Keen, Surge), Hallmarked Fang Studs (Steady, Focus), a plain Wolfbone Necklace and a plain Warband Bulwark (`paths.json`, every `bis-*` run, `targets`).
- The Fang Studs are a tier 2 piece and the necklace and cloak carry no perk at all, because their perks have no engine hook (`jewelry.js` `PERKS_PLAYED` holds five of eight).
- This is the largest hole in the area. It is not a balance problem. It is six slots with no content for 80 Levels of a live game and 370 Levels of the planned one.
- Verdict. REDESIGN the role of the accessory slots (section 2.3).

**Gloves and belts as Rares.** Helm, body, legs and boots are hourly. Gloves and belts are Rares at the same tier. So two armor slots lag a tier behind for most heroes and read as random gaps (EVIDENCE: 261 MID slots have no source inside the band's own grounds, `atlas.json` A4. Gloves with 43 and belts with 41 are the two largest slots on it, with body, legs and boots close behind). The plan already moves belts to the Crafting bench (RULED 11-18, "maybe") and gives gloves a path in the Catacombs. Verdict: MERGE belts into the crafted accessory layer now, so the bench has a second worn product. Gloves become an hourly row like the other four armor slots.

**Named Rares and special attribute gear, tiers 2 to 7** (`special-attributes.js`: a standard piece of its tier plus one attribute, sample of five, two shipped on Krell).

- What it is for. A drop that is not the ladder. The sample has Widow's Fang (the Sewer, a sword that crits 6% more), Mudlark's Mitts (the Slake, Ranged counts 2 higher), Demoncaller (the Pyre Field, 10% harder on the Undead), Krell's Tollgate and the Banded Legguards.
- It is the right system and it is three rows from being real. CORRECTED: the first cut asked for one of these on every ground before Krell, on the premise that Krell was four months away. He is 18 to 39 days away. The bands before him last 0.67 to 7.25 days for a lone hero and under half that for a four, and a Rare row lands every 10 to 20 hunted hours a hero. So an early property piece is found once or twice and worn for one to seven days before the next tier's ladder piece beats it. That is about eight rows, their icons and their measures for a few days of wear each. It is not worth it, and Tyler's order (generous to Krell, rare and strong after) is right on the 12 hour frame.
- Its weakness is the attribute list. Four of six kinds are plain numbers (element guard 10%, physical guard 2 to 3%, +1 Defense, +2 or +3 of a skill). A number is a small tier step, not a property. Bane and crit are closer. The plan's own better kinds are unbuilt: a spell change, an element edge, a second lining socket, thorns, a bow's sweet spot (`itemization-plan.md` section 3).
- Verdict. KEEP the sample of five as the template. No rollout a ground before Krell. The work goes to Krell's five and to the list of kinds (section 2.2, uniques). The three designed sample pieces that are not live (Widow's Fang, Mudlark's Mitts, Demoncaller) use hooks that already exist and may ship as a Low item if a pack is being touched anyway.

**Tempering** (`temper.js`: two tracks, five rungs, one ladder a tier, gold and salts). RULED 23-2: moving up a tier costs only the difference. RULED 23-4: past tier 7 a rung takes a duplicate unique and "worn in" is not built. With both, Tempering is the one place gold buys percent and the one sink for spare uniques. Verdict: KEEP as ruled. It is the whale's edge by your 11-18 ruling and it should be the only plain "pay gold, get percent" system in the game.

**What dropped gear is worth** (RULED 23-10 one sale rule, RULED 23-1 the loot plan by kind, salvage as Luck). All three stand. Together they turn the flood from a chore into a standing choice. Verdict: KEEP as ruled.

### 2.2 Rare and aspirational items

**Uniques past tier 7** (planned: about 46 a region, cut to 15 to 20 by RULED A-3 and 31-4, each reforges up a band and keeps its property).

- EVIDENCE: the solver's kit builder never picks one, so they are unmeasured (`paths.json` verdict "uniques: UNMEASURED"). Two exist in the live game.
- The design is right: past tier 7 a piece is a property a build is made of. The risk is in the list. If a region's uniques are "fire guard 10% on a helmet, fire guard 10% on boots", it is the ladder again with longer names. Section 10 of CLAUDE.md calls that repetition.
- One recommendation. A unique carries a property from a short list of kinds that change a decision. Guards against one element leave the unique list and belong to linings, which are sized for exactly that job. Plus skill leaves the list and stays the chest weapon's mark (RULED 11-18: chest weapons keep their skill bonus). That leaves bane, crit, a spell change, an element edge, a second socket, thorns and the bow's sweet spot. Seven kinds, each wins somewhere and gives something up.
- Krell's five weapons are designed and unbuilt (his sword with bane on the Undead, his hammer with bane on Humanoids, his bow's sweet spot, his wand's Fireball change, his staff's cheaper Greater Mend). They are the whole endgame item list of the live game. Build them before any other late item work.
- Verdict. REDESIGN the property list. BUILD Krell's five as the measured sample.

**Krell's Hall and its daily prize** (`boss-halls.js`, `drops.js` `rollPrize`: one roll a hero a day over 14 plain Dawnsteel pieces at 2.86% each and two uniques at 3% each, a hero's first roll always lands a plain piece).

- EVIDENCE: a lone hero waits 33.5 days for one named piece and a four waits 7.8 (`atlas.json`, source `hall:krells_hold:dawn_sword`). The 88 to 110 band lasts 17.5 days. The solver's full kit in that band takes 99 to 122 days (`paths.json` B1, ratio 6.98 against a target of 0.7 to 1.0).
- EVIDENCE: the staged Ox Road drops the same Dawnsteel weapons at 0.63 days. That is the atlas's worst pair of routes in the game, a ratio of 700 to 780 (`atlas.json` A6). The Hall route becomes a trap the day the next region opens.
- At the formula layer this is an exception. Tiers 1 to 6 arrive by one rule (the loot bands). Tier 7 arrives by a second rule (exclusive slices of one daily roll) that exists for a boss prize and is carrying a whole gear tier.
- One recommendation. Plain Dawnsteel follows the loot bands like every tier: the Hold's elites carry it as Rares. The Hall's roll holds what is won: the uniques, Krell's Toll Box (his Trophy, waiting on its row), and the tier 7 gem. The "first roll always lands" promise moves to the uniques' side as a slow sure thing (see the interaction trace).
- Verdict. REDESIGN at the content layer. No engine change.

**Hall Keys.** EVIDENCE: a key drops about every two hunted hours a hero, and the four found 19 in 9.7 hours and fought no Hall (`11-krell-hunt` sections 5 and 9). The prize is one roll a hero a day. So most keys buy a fight that pays XP and coin only, started by hand. The key's pace and the prize's pace are two clocks for one reward. Verdict: REDESIGN, handed to the endgame review (section 8): one key is one prize roll, the key is the only clock, and its band moves to about a hunted day.

**The Hearth Chest and Tower weapons** (`chests.js`: four keys at Levels 10, 40, 70, 100, a weapon of tiers 2, 4, 6, 7 with +1 to +4 skill, six opens a hero a week, warmth and stokes).

- It is the best designed chase in the area: transparent odds, a pity that builds, a real choice to stoke or save, and 28 weapons with a line of lore each.
- EVIDENCE: at 12 hours a day the Bronze weapon lands on day 8 to 10 in a band that lasts 2.66 days, and the Silver on day 14 in a band of 5.5 (`paths.json` fills). You ruled the weekly limits stay and fast players skip early chest pieces (50-6). RULED 22-3 builds chest reforging first, which is what makes a Bronze piece worth opening.
- The won layer covers tiers 2, 4, 6 and 7 only. Bands 30 to 45 and 60 to 75 have no won piece at all (EVIDENCE: `atlas.json` A5 lists 19 kits missing one). That is by design of four keys and I would not add keys to fix it. Those two bands last 3.5 and 6.25 days, so I would leave them without one.
- Verdict. KEEP. Chest reforging before any new key or wing.

**Catacomb armor** (staged: two wings, four keys each, helmets and boots in three weights, 48 named pieces). It doubles the chest's item count for two slots before the first chest has been played by more than one person (EVIDENCE: 49 opens, one player). Verdict: DEFER behind chest reforging and a played sample of one wing and one key (CLAUDE.md section 10). It is planned, so it is not cut.

**Trophies** (two live: the Rat King's Crown and Coppercap's Cauldron. None past Level 50. Six ever dropped). The Trophy room is off sale and will be rebuilt as mounts for real Trophy drops (RULED 11-20). That rebuild has two items to show. Verdict: ADD one Trophy row each on Captain Hask, the Provost and Lord Krell before the room returns. Three data rows.

**The Very Rare band.** RULED: through Krell every 60 to 90 hours of a hero, past Krell every 60 to 90 hours of a four (23-3, 30-3). EVIDENCE: no open ground has a Very Rare row (`11-krell-hunt` section 5). So the "really rare drop" moment that the reveal, the broadcast and the shareable card were built for does not happen in the live game outside two bosses. Verdict: ADD (section 4, signature stones).

**The Rare reveal.** RULED 27-6: the big reveal stays on every Rare. EVIDENCE: 1,568 reveals so far, 2.05 Rare drops a hero-hour on the Warrens, one about every 7 minutes for a four (`10-real-players.md`). The cause is the count of Rare rows a ground. The band promises each row every 10 to 20 hours and a ground has 8 to 15 of them. One recommendation at the content layer: a ground has at most six Rare rows. Next tier ladder pieces that fill the band today move to the Scarce band of the next ground, where they already drop. Then a hero sees a reveal every two to three hours and a four about every 40 minutes, with no change to the reveal you ruled. Verdict: REDESIGN the band's row count.

**Lucky finds and the four Hearthfinds.** RULED to stay. No finding.

**Patterns** (dark, one pattern, learned per hero). A recipe learned is a decision made, and four heroes learning it four times breaks the first principle (23 already said so). Verdict: DEFER. If built, a pattern teaches the account.

### 2.3 The jewelry line

**Jewelry as built** (`jewelry.js`: plain, Fine with one perk, Hallmarked with two. A bench roll makes Fine 5 to 12% of the time. A gem roll is always Fine or better. The Hallmark step lets the player choose the second perk for 25,000 or 100,000 gold. A piece reforges up a tier for the fee difference.)

- What is right. The player chooses the second perk, nothing fails, the odds are shown, no gold is paid on a roll, the gem comes from a hunt and the work from a bench. It is the cleanest link between hunters and crafters in the game.
- What is wrong is where it sits and how big it is. It is a tier 2 and tier 3 sample. Its perks are about 1% of XP each (EVIDENCE: measured in `jewelry.js` comments: Keen 1.0, Follow-through 1.1, Surge 0.9, Focus 0.3 across all ways). RULED 23-5 gives all perks on twelve seats a budget of 4%.
- EVIDENCE that it has not landed: 89 pieces made by one account, 4 set, 0 Hallmark fees paid by anyone (`10-real-players.md` section 6).
- EVIDENCE of the wall for the real player: an own four needs 8 Hallmarked rings, each 100,000 gold, a Seam Jasper (about 8 to 11 hours of the Warrens) and a Fine roll. On the four hero solver runs those rings are the last piece to arrive in four of eight bands, at day 31 in a band of 5.5 days and day 71 in a band of 17.5 (`paths.json`, `bis-4-free-12`).
- So the line is both a wall and a dead end: slow to finish once, then finished for ever.

**The perk pool.** RULED 11-18: grow it to about 22 ("why not?! it's fun"). I agree it should grow. I challenge the size rule that comes with it. If every perk must be about 1% in an ordinary hunt and the whole pool about 4%, then Opener, Finisher, Giantsbane and Windbreak are four words for the same third of a percent. The plan's own target is "about 3% in the case it is built for" and the one perk measured against it missed (Steady reads 1.4 to 1.7 times, not 3 times).

One recommendation, at the coefficient layer: **a perk is sized by its case.** Each perk names the hunt it is for (a boss, a big pull, a ground with ranged monsters, a caster out of mana, a hero under its Level) and is worth 5 to 8% there. The budget of 23-5 is then read on the reference hero wearing perks that do not match the ground, which is where the 4% holds. A hero who matches jewelry to the ground earns up to about +10% there. That is the preparation the game's identity promises, bought with town work and gold, and it is the only place in the item game where knowing the grounds pays. HYPOTHESIS until the matrix measures three perks this way.

**The Hallmark fee.** Keep the mechanism and the ruled prices. With perks sized by case the fee buys a real second choice and not a second 1%.

**The guarantee layer** (`JEWEL_GUARANTEES`, behind its switch: a boss drop set in place of the gem fixes one perk or the Hallmarked grade). It is built, tested and dark. It is the natural home of the Very Rare (section 4).

**Linings** (designed: one monster part and gold, 12 hours of hunting, stacking to 48, 20 to 30% of one element, a 40% cap). The right recurring crafted good and the right answer to a ground. Two notes from this review. First, element guards on uniques and on perks should leave so that linings own "guard against this ground's element" alone. Second, the 30 imbuement items are its parts (23's merge). Verdict: KEEP the design, BUILD after the combat review sizes group damage.

**Luck: the bar, the rivets and the Lucky ring.** RULED 11-20 and 30-4 (three steps, the ring last with the Morrow Hills). The bar and rivets are sound. The Lucky ring is a seventh ring perk worth +1 to +4% Magic Find. Rares are 0.4% of sold value through Krell (CITED in 23), so until a unique trades for something the ring is worse than any combat perk and nobody should craft it. Verdict: BUILD the bar and salvage as ruled. DEFER the ring to the first region past Krell, as 30-4 already orders.

**Plain jewelry in the Shop** at 3,000 and 12,000. The solver flags "crafted jewelry beats the Shop by a median of 12.7 times" and "Smithing is 2.81 times" as DOMINANT. Both are the ruling working: the Shop is a ten times dearer fallback so it never undercuts a crafter (`JEWEL_SHOP_PREMIUM`). They are not problems. The threshold misfires on a designed fallback, and the standards lane should exempt a route marked as one. Verdict: KEEP.

### 2.4 Crafting professions

EVIDENCE that frames all of it: over 95% of real bench hours are bars, planks, cooked fish and runes. Every gear recipe together is under 2 hero-hours against 34,756 dropped pieces. Tools are the one gear players craft (34 axes, 34 picks). A third of supplies used were home made (`10-real-players.md` section 6).

So crafting in Hearthrise is a supply chain. That is the right shape for an idle game: it is what the rested twelve hours are for, and supplies are the one thing every hunt uses up. I would build it the same way from scratch. The question for each bench is whether it has a product a hunter wants and a reason to keep levelling.

| Bench | Its product a hunter wants | Reason to level past 60 | Earns its place |
|---|---|---|---|
| **Woodcutting, Mining, Fishing** | Every input. 85 to 88 days each to 99 at 12 rested hours (`atlas.json` T1) | A new node every 7 to 15 levels to 90 | Yes. KEEP |
| **Cooking** | Food that beats the store by 1.3 to 10 times a point (23, question 3). Drinks from the farm | Shark at 88 | Yes. KEEP. Feasts become four party meals (RULED 23-6) |
| **Smithing** | Bars, tools, whetstones, salts, **all jewelry**, two named reforges | Jewelry tiers 4 to 7 once they exist. Today nothing a hero wears past Smithing 30 | Yes, and it is the bench with the power product. KEEP. Its ladder is fixed by change 1 |
| **Crafting** | Planks, arrows, three cloaks, the same salts a second way, the castle's beams | Arrows at 91. No worn product past Crafting 30 | Weakest. 86% of its hours are sawing. REDESIGN its identity below |
| **Runecrafting** | Runes, which are 55% of the store bill. A chain hour is worth about a hunted hour | **Nothing new from 61 to 99** (23, question 4). Storm and Bone enter at 25 and 40 (RULED 32-1), so they do not fill it | Yes. KEEP. ADD rune tiers at 75 and 90 with the combat review |
| **Farming** | Drinks and meals | Home's review | Not mine |
| **Inner Flame** | Regeneration | Combat's review | Not mine |

**Crafting's identity.** One recommendation: the workbench is the outfitter. It owns what a hero wears over the armor and what a hero spends from a distance: cloaks and belts with their perks, quivers when they come, linings, and all ammunition. That gives it a worn product at every tier and the game's first recurring crafted good. Three things leave it:

- The three workbench recipes for Tempering salts (`pack_mithril_temper_salts` and its two sisters). They are a second road to an item Smithing already makes, they give no decision, and no real player has used one (EVIDENCE: 0 hours, 23). REMOVE.
- Iron, Barbed and Steel arrows and Iron Bolts as things worth making. They save 2,000 to 2,600 gold a chain hour, a third of a hunted hour (23). Keep the rows for skill XP and say on the row what a job saves. No cut.
- The castle's two goods stay as RULED 31-3.

**Is every recipe worth making.** By family, from 23's table with this review's verdicts:

| Family | Recipes | Verdict | Reason |
|---|---|---|---|
| Plain food and drinks | 25 | KEEP | The reason the bench exists |
| Feasts | 12 | MERGE to four party meals (RULED 23-6) | Made once each |
| Smelting, sawmill, blanks | 19 | KEEP | Intermediates. The currency of the benches |
| Tools | 14 | KEEP | The one gear players craft |
| Whetstones | 7 | KEEP | The one supply only a crafter makes |
| Salts at the forge | 5 | KEEP | Tempering needs a crafter (RULED 11-05) |
| Salts at the workbench | 3 | REMOVE | A duplicate road with no choice in it |
| Rolled jewelry and gem jobs | 9 | REDESIGN | Extend to tier 7. Change 1 |
| Plain necklace, three cloaks | 4 | REDESIGN | They ship plain because their perks have no hook |
| Arrows and bolts | 9 | KEEP | Tiers 4 to 7 pay. Tiers 1 to 3 need the "what this saves" line |
| Runes | 30 | KEEP | The best balanced family |
| Named reforges (Klappa's Klub, the Steelgrate) | 2 | KEEP | Klappa's Klub is never cut (RULED) |
| Castle goods | 4 | KEEP as RULED 31-3 | Fix the Keystone and the Timber Beam only |
| Cook Panther Meat, Void Banquet | 2 | DEFER | No input has a source. Hidden until one does. Checked against the roadmap by plan lane L36 |
| Burnt food | 1 | KEEP | A by-product. The atlas flags it only because its chance is in code. Move the chance to a data row (brief 40) |
| Inner Flame fuels | 17 | Combat's | 7 of 17 have no open source |

**How much crafting matters.** RULED 50-15: a quarter to a half of the step from MID to best in slot comes off a bench. EVIDENCE: by the solver's piece count the share is 80 to 100% in every band (`paths.json` T4), because the whole step today is jewelry, a cloak and Tempering's salts. And a hero who never touches a bench needs 1.6 times as long (T5, target 1.5). And the best path asks for only 2 to 7 of the 12 rested hours (T7, target 6 to 12). Read together: crafting already carries the optional power, it carries it all at Level 30, and the town has spare hours. The answer is not more crafted power. It is the same budget spread over seven tiers, and more of the won and dropped kind (property Rares, uniques) beside it.

**After 99.** Good batch is RULED and unbuilt. It is the cheapest thing in this area and it makes every level between two unlocks worth something. The maker's mark is RULED for later. Commissions wait for a market with real trades. No new call.

### 2.5 The catalogue

EVIDENCE (`atlas.json`): 815 items, 224 with no open source, 240 with one way to get them, 4 recipes that cannot be made, 2 items made with no use.

| Group | Count | What it is | Verdict |
|---|---|---|---|
| Staged content behind a switch or a staged ground | 80 | Catacomb armor, the Ox Road's tier 7, staged uniques | DEFER. Planned, hidden, judged on projected numbers |
| "Awaiting roster" | 80 | Items whose monster no ground places (chitin armor, the wave 3 pieces) | RULED 23-7 with the 11-21 limit: each is checked against the roadmap (plan lane L36). The ones the roadmap does not use are cut |
| "Unreachable, later" | 26 | Fuels and named pieces for later regions | DEFER |
| "Unreachable, cut" and Greenhaven leftovers | 25 | Already ruled to go | REMOVE (RULED) |
| Planned training items | 8 | Bound training weapons | Not mine |
| **No declaration at all** | 5 | Apprentice Staff, Apprentice Wand, Shortbow, Stone Maul, Apprentice Primer: tier 1 ladder rungs the practice kit replaced | REMOVE. The generator should skip a rung the start kit holds, at the curve layer |
| One way only | 240 | 120 are recipes, 28 chest, 24 drops, 16 Hall, 16 Shop | Fine. One way is normal for a made good. The 16 Hall rows are change 5 |
| Made, no use | 2 | Keystone (castle, dark), Troll Hide (the plan's belt material) | Keystone RULED. Troll Hide gets its use when belts move to the bench |

---

## 3. Content rationalization

One row a thing. KEEP, REMOVE, MERGE, REDESIGN, ADD or DEFER. "Ruled" names a decision that already covers it. The eight criteria for the significant ones follow the table.

| # | Thing | Verdict | One line |
|---|---|---|---|
| 1 | Seven tier ladder, six armor slots, three weights | KEEP | The pacing spine, generated from one table |
| 2 | Three armor weights and their guards | KEEP | The one standing gear decision. Measure that mixing is live |
| 3 | Shields and spellbooks at every tier | KEEP | Ruled 11-18. Each has a home |
| 4 | Gloves as Rares | REDESIGN | Hourly, like the other four armor slots |
| 5 | Belts as dropped Rares | MERGE | Into the crafted accessory layer at the workbench |
| 6 | Five undeclared tier 1 ladder rungs | REMOVE | The practice kit replaced them |
| 7 | Special attribute gear, tiers 2 to 7 | KEEP | The sample of five is the template. No rollout a ground before Krell (corrected, section 2.1) |
| 8 | Unique property list | REDESIGN | Seven kinds that change a decision. Guards and plus skill leave it |
| 9 | Krell's five weapons | ADD | The measured sample for every later unique |
| 10 | Uniques past tier 7, 15 to 20 a region | KEEP | Ruled A-3, 31-4. Built after the sample is played |
| 11 | Wave 3 uniques and the boss forge pieces | REMOVE | Ruled 23-7. Keep the name Demoncaller on its new row |
| 12 | Tempering | KEEP | Ruled 23-2 carries it up |
| 13 | Worn in | MERGE | Ruled 23-4, into Tempering past tier 7 |
| 14 | Krell's daily prize: 14 plain Dawnsteel pieces | REDESIGN | Onto the Hold's loot bands |
| 15 | Krell's daily prize: uniques, Trophy, gem | KEEP | What a Hall is for |
| 16 | Hall Keys every two hours | REDESIGN | One key, one prize roll. Endgame's |
| 17 | The Hearth Chest, keys, warmth, stokes | KEEP | The best chase in the area |
| 18 | 28 Tower weapons | KEEP | Chest reforging first (ruled 22-3) |
| 19 | 48 Catacomb helmets and boots | DEFER | One wing, one key as the sample |
| 20 | Trophies | ADD | Three rows: Hask, the Provost, Krell |
| 21 | Very Rare band | ADD | A signature stone on each ground from the Glade |
| 22 | Rare band's row count | REDESIGN | At most six a ground |
| 23 | Rare reveal | KEEP | Ruled 27-6 |
| 24 | Lucky finds, Hearthfinds | KEEP | Ruled |
| 25 | Patterns | DEFER | If built, the account learns it |
| 26 | Jewelry grades and the bench roll | KEEP | The mechanism is right |
| 27 | Jewelry tiers 4 to 7, six pieces a tier | ADD | Change 1. Ruled in principle 11-18 |
| 28 | Perk sizes | REDESIGN | By the case each is built for |
| 29 | Perk pool growing to 22 | KEEP | Ruled 11-18. Each new perk names its case |
| 30 | Necklace, cloak and belt perk hooks (Deflect, Second Wind, Thrift, Slip, Stride) | ADD | Three slots ship plain today |
| 31 | Hallmark step and fees | KEEP | Ruled prices |
| 32 | Jewel reforging up a tier | KEEP | Build it for every tier with change 1 |
| 33 | Guarantee jobs | ADD | Turn on as the signature stone's bench job |
| 34 | Linings | KEEP | Build after combat sizes group damage |
| 35 | 30 imbuement items | MERGE | They are the lining parts. One a ground |
| 36 | Luck bar, rivets, salvage | KEEP | Ruled 11-20, 30-4 |
| 37 | Lucky ring | DEFER | With the first region past Krell, as 30-4 orders |
| 38 | Plain jewelry in the Shop at ten times | KEEP | A designed fallback |
| 39 | Loot plan by kind, one gear sale rule | KEEP | Ruled 23-1, 23-10 |
| 40 | Woodcutting, Mining, Fishing | KEEP | The rested half of the day |
| 41 | Cooking: food and drinks | KEEP | |
| 42 | Twelve feasts | MERGE | Ruled 23-6, four party meals |
| 43 | Smithing | KEEP | The jeweler and toolmaker |
| 44 | Crafting bench | REDESIGN | The outfitter: cloaks, belts, linings, ammunition |
| 45 | Three workbench salt recipes | REMOVE | A duplicate road |
| 46 | Runecrafting | KEEP | |
| 47 | Rune tiers at Runecrafting 75 and 90 | ADD | With the combat review's spell tiers |
| 48 | Tools, whetstones | KEEP | |
| 49 | Good batch | ADD | Ruled, unbuilt, cheapest thing here |
| 50 | Maker's mark, commissions | DEFER | Ruled for later. Needs a market with trades |
| 51 | Cook Panther Meat, Void Banquet | DEFER | Hidden until an input has a source |
| 52 | Burnt food's chance in code | REDESIGN | A data row (brief 40) |
| 53 | A find list a ground that pays Luck | ADD | Section 4 |
| 54 | A saved kit a ground | ADD | Section 4. The first principle for every situational item |

**Counts.** 54 rows. KEEP 24. ADD 10. REDESIGN 8. DEFER 5. MERGE 4. REMOVE 3. (Rows 6, 11 and 45 are the removals. Row 11 is already ruled. Row 7 moved from ADD to KEEP in the 2026-11-21 correction.)

### The eight criteria, for the significant ones

**A. Jewelry and cloaks to tier 7 as the build layer (rows 27, 30, 32, 5).**

| Criterion | Answer |
|---|---|
| Player value | Six slots have something to want at every tier. A crafter makes something a Level 60 hero cannot get another way |
| Strategic depth | Which perks for which hunt, carry a piece up or chase a new pair, wear or sell |
| Uniqueness | The only layer where a hero's build differs from another hero of the same style and Level |
| System interaction | Smithing and the workbench gain a ladder. Gems give six grounds a Rare that matters. Hallmark fees become a live sink. The market gets its first good with a real maker |
| Balance impact | Inside the ruled budgets (23-5): plain accessories are a Replace lever at 6%, perks 4% on the mismatched hero. Sizes are one coefficient table |
| Complexity cost | Medium. About 6 pieces, 1 gem and its drop home a tier. Five perk hooks first. Every perk pair is its own item row today, which is the platform cost named in section 8 |
| Long term value | High. Past tier 7 sizes stop and new regions bring new perks (the plan). The piece a hero wears at Level 300 can be one it has carried since Level 45 |
| Recommendation | ADD. Tier 4 as the played sample, then tiers 5 to 7 |

**B. Perks sized by their case (row 28).**

| Criterion | Answer |
|---|---|
| Player value | A perk you can feel. "My boss ring" is a sentence a player says. "My 1% ring" is not |
| Strategic depth | The preparation decision the identity promises: read the ground, pick the kit |
| Uniqueness | Nothing else in the game rewards knowing a ground's makeup with gear |
| System interaction | Raises the worth of the saved kit, of a second set of jewelry (more gems, more fees, more smith work), and of grounds that differ from each other |
| Balance impact | One coefficient per perk and a stated case. The budget is read on the mismatched reference hero. Risk: a perk whose case is "always" (Keen) must stay small. Listed for phase B |
| Complexity cost | Low in code (sizes are data). Medium in measurement: each perk is measured in its case and out of it |
| Long term value | High. It scales with the number of distinct grounds, which grows for ever |
| Recommendation | REDESIGN |

**C. Krell's five and the unique property list (rows 8, 9).** The first cut also asked for a property Rare on every ground before Krell. That half is withdrawn (section 2.1).

| Criterion | Answer |
|---|---|
| Player value | Something to chase on the day the ladder ends, which is day 18 for a four and day 39 for a lone hero |
| Strategic depth | Which piece for which ground. A bane, a sweet spot or a spell change each wins somewhere and gives something up |
| Uniqueness | The first gear in the game that is not a step on the ladder |
| System interaction | The Hall's daily roll gets prizes worth the key. Tempering's duplicate sink (ruled 23-4) gets its first duplicates. The market gets its first scarce gear |
| Balance impact | The rule exists (SA2: the tier's standard piece plus one attribute, each kind capped in data). A new kind is one engine hook, shared by every later unique |
| Complexity cost | Medium. Five rows. One new hook (spell change) is the first to build |
| Long term value | High. Every unique past tier 7 is cut from this sample, and a unique reforges up a band (ruled 31-4) |
| Recommendation | ADD Krell's five. REDESIGN the list |

**D. Signature stones as each ground's Very Rare (rows 21, 33).** See section 4.

**E. Plain Dawnsteel off the daily lottery (row 14).**

| Criterion | Answer |
|---|---|
| Player value | A hero at Level 88 can finish a tier 7 set by playing, as at every earlier tier |
| Strategic depth | Neutral. It removes a wait, not a choice |
| Uniqueness | It removes a second loot rule that only one tier uses |
| System interaction | Tempering tier 7 (2.48M both tracks) gets buyers sooner. The Ox Road no longer makes the Hall a trap. The Hall's roll means something every day |
| Balance impact | One loot rule for seven tiers. Rows on the Hold's elites at the Rare band's 10 to 20 hours |
| Complexity cost | Low. Data rows on one pack and its prize table. A server catalogue regen |
| Long term value | Medium. It matters most between now and the Morrow Hills |
| Recommendation | REDESIGN |

**F. Crafting bench as the outfitter (rows 44, 45, 5, 34).**

| Criterion | Answer |
|---|---|
| Player value | The fourth bench has a product you wear and a product you run out of |
| Strategic depth | Which lining for which ground. Cloak and belt perks |
| Uniqueness | Today it shares salts with Smithing and has three cloaks. After, nothing it makes is made elsewhere |
| System interaction | Linings are a standing sink of about 20% of free gold (23, question 7). Belts give Troll Hide and the other hides a use |
| Balance impact | None new: linings and perks keep their ruled budgets |
| Complexity cost | Low for the moves (data). Linings themselves are the plan's phase 9 |
| Long term value | High: a consumable for every ground for ever |
| Recommendation | REDESIGN |

**G. Rare rows capped at six a ground (row 22).**

| Criterion | Answer |
|---|---|
| Player value | The reveal you ruled to keep becomes a moment again |
| Strategic depth | A shorter Rare list is one a player can learn |
| Uniqueness | Not a new thing. A limit on an existing band, like `SLOT_LIMITS` |
| System interaction | Luck's Magic Find multiplies fewer, better rows. Fewer rivets from Rares. Gem and pattern rows compete for six places, which forces each ground's list to be chosen |
| Balance impact | One limit in `loot-bands.js`. Gold moves by under half a percent (Rares are 0.4% of sold value) |
| Complexity cost | Low. Data, and the drop-tables guard reads the limit |
| Long term value | High as the server ages and Magic Find rises |
| Recommendation | REDESIGN |

---

## 4. Missing opportunities

### 4.1 Signature stones: each ground's Very Rare is set in jewelry

**What.** Each ground from the Glade up has one Very Rare row: a named stone. A smith sets it in a plain or Fine piece in place of the tier's gem. The piece then always carries the stone's perk, and that perk is one the bench cannot roll. The stone is used up. The piece reforges up a tier and keeps the perk.

**Why Hearthrise specifically.**

- The band is ruled and empty. Nothing in the live game drops at 60 to 90 hours on a normal ground.
- The bench job is built. `JEWEL_GUARANTEES` already sets a boss drop in place of a gem to fix one perk, behind a switch, with tests. The Crown Shard is the working example.
- Bands last days. A Very Rare weapon found at Level 50 is outgrown in a week. A perk on a ring that reforges up is kept for the life of the hero. This is the only kind of rare find that fits both "unlimited Levels" and "generous to Krell".
- It makes a hunter need a smith for the best thing the hunter will ever find, which is rule 6 of the item plan.
- It gives the frozen accessory slots a drop chase without breaking "what you finish it with is made".

**The eight criteria.**

| Criterion | Answer |
|---|---|
| Player value | The first really rare drop, before Krell, and the one early find that is still worn after him |
| Strategic depth | Which piece to set it in. Use it or sell it. Which ground to farm for which perk |
| Uniqueness | The only perk source that is found and not rolled |
| System interaction | Luck's Magic Find finally multiplies something a player wants. The market gets a scarce good that is consumed. Smiths get a job only they can do |
| Balance impact | A stone's perk is a perk: it sits in the same budget and the same once a hero rule. No new formula |
| Complexity cost | Low. One item row, one drop row and one guarantee row a ground. One engine hook a new perk |
| Long term value | High. Every new ground adds one. Demand is 12 seats a hero and the stone is used up when set |
| Recommendation | ADD. Sample: the Glade, the Warrens and the Slake, three stones, played before more |

**Walk-through against what exists.**

| Step | The player holds and can reach | Exists today | New |
|---|---|---|---|
| 1. A hero hunts the Glade | The ground's drop rows through the settle | Yes | A `very_rare` band in `loot-bands.js` (the band is ruled, and the file has no row for it yet) and one row on the ground's named carrier |
| 2. The stone drops | The reveal the server sends for the bands in `REVEAL_BANDS` | Rare and Trophy are on it | The new band joins that list |
| 3. The hero is in town with the stone and a plain Banded Signet | The bench reads bag then Storage (ruled 10-25). The Shop sells the plain signet. Smithing 15 makes it | Yes | Nothing |
| 4. The Smithing bench shows "Set a (stone) in a Banded Signet" | `guaranteeJobs` builds this job for the Crown Shard today | Yes, behind `jewel_guarantees` | The switch on, the stone's row in `JEWEL_GUARANTEES` |
| 5. The job runs | The piece comes out Fine or Hallmarked with the stone's perk fixed | Yes (`roll: 'gem'`, `perk`) | The perk's hook, if it is a new perk |
| 6. At Level 30 the hero reforges the ring up | `REFORGE_OFFERS` carries a Hallmarked Banded Signet into a Seam Jasper Band | Yes for tier 2 to 3 | The same for each later tier (change 1) |

### 4.2 A find list for each ground

**What.** Each ground's page lists its named pieces: ladder pieces in three weights, its Rares, its Very Rare, its Trophy. The first time an account finds each one it is ticked, with no press, and pays a little Luck. A finished list pays more and shows on the ground's page.

**Why Hearthrise specifically.** A hero finds 26 to 29 pieces an hour and 99% mean nothing. One moment of worth for each piece, once an account, is the cheapest meaning the flood can be given. It plugs into Luck, which is ruled as the long chase and already pays Bestiary stages without a press. It serves "collections" from the identity list with no new currency. The old collection log tables are dark leftovers and are not reused.

| Criterion | Answer |
|---|---|
| Player value | A reason to care what dropped, and a reason to go back to an old ground |
| Strategic depth | Low. It is a goal, not a decision |
| Uniqueness | The Bestiary counts kills. Nothing counts finds |
| System interaction | Luck only. No gold, no power. It is account wide, so four heroes do not repeat it |
| Balance impact | Inside the Magic Find budget of 104 a hero (ruled). The retention review sizes its share |
| Complexity cost | Medium. One account table of found item ids, written at hunt end with the Luck flush. A page section |
| Long term value | High. Every ground adds a list |
| Recommendation | ADD, handed to the retention review to own. Fun is a playtest question |

### 4.3 A saved kit for each ground

**What.** A hero's worn set can be saved against a ground. Starting a hunt there wears it. The loot plan never sells a piece that is in any saved kit.

**Why Hearthrise specifically.** Perks sized by case, linings, uniques that win somewhere, and the Lucky ring all ask a hero to change gear when the party moves. Without a saved kit each of them breaks the first principle four heroes at a time. With it, they are decisions made once. This is the enabling piece for every situational item in the plan and it should land before any of them.

| Criterion | Answer |
|---|---|
| Player value | Prepare once, and the hunt remembers |
| Strategic depth | It is what lets the other choices exist without becoming a chore |
| Uniqueness | Saved hunt presets exist and are used (9 on two accounts). Whether a preset holds worn gear is not checked in this phase |
| System interaction | The `equip` verb, the hunt start, the loot plan's "gear I am not wearing" line |
| Balance impact | None |
| Complexity cost | Medium. Server: a kit row a hero a ground and an equip at hunt start. The systems lane sizes it |
| Long term value | High |
| Recommendation | ADD, before perks by case or linings ship |

### 4.4 Rune tiers at 75 and 90

Runecrafting has one recipe from 61 to 99 (1,027 of its 1,073 chain hours, 23). The spell review is re-sizing every cast. A deeper rune at 75 and 90 is the natural product, and it is the combat review's to size. Named here so the skill ladder is not forgotten when spells are re-cut.

---

## 5. Interaction traces

Each trace is a hypothesis to be measured in phase B with `progression-grid --diff`. "Watch" names the unintended result to look for.

### 5.1 Jewelry to tier 7 with perks sized by case

| On | Expected | Watch |
|---|---|---|
| Combat | A matched hero is up to about +10% XP on that ground. A mismatched hero stays inside the ruled 4% | A perk whose case is nearly every hunt (Keen on a basic attacker, Follow-through on any pull over two). It must be sized as an "always" perk. The 2.5 and 2.75 party caps of 30-2 are already broken on Hask's Ford and Krell's Hold |
| Progression | Band E6 (something worn changes every 24 hunted hours) is met by accessories between weapon tiers | Days to full best in slot rise in every band. B1 is already red in five of seven |
| Economy | Hallmark fees of 150k to 600k become a real sink. A second set of jewelry for a second ground doubles it | A four needs 24 pieces a tier. At tier 7 that is 14.4M in fees. The fee difference on reforge (ruled) is what keeps it sane |
| Crafting | Smithing has a product at 45, 60, 75 and 88. The workbench the same for cloaks and belts | Gem supply on the 12 hour frame. Six gems a hero a band at about 11 hours a gem is 66 hunted hours, and the bands from 45 to 88 last 66 to 87 for a lone hero. Chips and the gem pace have to be fitted to that, or a tier is finished the day it is outgrown |
| Gear | Plain accessory tiers are a Replace lever at 6% (ruled 23-5). They replace, never sum | Tier 4 to 7 plain stats must come from the old unsourced rows' shape or be re-cut. The old rows pay melee only |
| Parties | A healer's and a tank's cases differ from a Mage's. Party kits diverge | One perk that is best for all four seats |

### 5.2 Krell's five and the cut property list

| On | Expected | Watch |
|---|---|---|
| Combat | A bane weapon is +10% on one monster class and a little behind elsewhere. A spell change moves one ability | A spell change stacked with Surge and Tempering on the one ability a way already leans on. Krell's Hold already reads over the party cap of 30-2 |
| Progression | A reason to stay on Krell's Hold through its band (day 39 to 60 lone, day 18 to 27 for a four) and a kit that is still worn in the Morrow Hills | Five uniques at 3% a day each is one a hero every 6.7 days. A four passes the band in 9 days. The slices must be sized on that |
| Economy | The first scarce tradeable gear | With nothing that wears out, price falls as the server ages. The duplicate sink of 23-4 has to be open when they are |
| Crafting | None directly. A second socket property raises lining demand | |
| Gear | A weapon slot has three candidates at Level 88: Dawnsteel, the Gold or Platinum Tower weapon, Krell's piece | The sidegrade rule (ruled 11-18): each must be best somewhere |
| Parties | Bane by class makes ground choice matter to the party's kit | The party rare roll: a piece for one style lands on another hero. Trade inside the account already covers it |

### 5.3 Signature stones

| On | Expected | Watch |
|---|---|---|
| Combat | One more perk kind in the pool, in the same budget | A stone perk that is simply better than every rolled perk. Each should be a sidegrade with a narrow case |
| Progression | A 60 to 90 hour goal a ground through Krell. COMPUTED on the 12 hour frame: a lone hero hunts about 468 hours before Level 88 and a four about 216 hours each, so a lone hero finds about 6 stones before Krell and a four's account about 11 | A lone hero spends 8 to 87 hunted hours in a band, so most heroes leave a ground before its stone drops. That is right for a rare, and it only works because the stone is kept. An own four finds one every 1.3 to 1.9 days a ground (band D1), which may be too common for "really rare". The ruling sizes it on one hero through Krell on purpose |
| Economy | A consumed rare. The first item with both a sink and lasting worth | Stones as the Crowns buyer's first purchase. Allowed by 50-11 (what, not how soon) since each also drops |
| Crafting | A job only a smith can do, on the hunter's best find | The smith's level gate: the job uses the gem job's level, so a Level 15 smith can set any stone |
| Gear | The first carried forward rare | Reforge must keep the stone's perk at each tier's size table |
| Parties | The party rare roll decides who gets it (ruled 10-14) | None found |

### 5.4 Plain Dawnsteel off the daily lottery

| On | Expected | Watch |
|---|---|---|
| Combat | A MID hero at 88 to 110 wears tier 7 weapon, helm and body within the first 15 to 35% of the band, not on day 33 | Krell's Hold already reads over the party cap. A tier 7 weapon a few days sooner is +5 to 8% there. Size with the Deadly change (ruled 31-9 order) |
| Progression | B1 for the 88 to 110 band falls from 6.98 toward the target | The Level curve past 50 is being re-fit to a MID four (ruled 50-1). MID at 88 now includes tier 7, which moves that fit |
| Economy | Tier 7 pieces sell at 0.7% of book. More of them is a small faucet. Tempering tier 7 gets buyers | The one sale rule of 23-10 must cover tier 7 Rares |
| Crafting | Ember salts demand rises with tier 7 Tempering | A week of Platinum keys already pays 240 Ember salts a hero (23). The chest should not out-supply the bench |
| Gear | The Hall's daily roll holds only won pieces: two uniques at 3% each today | A roll that lands nothing 94% of days. Raise the uniques' slices or give the roll a slow sure thing. Either is a row change |
| Parties | A four no longer pools four daily rolls to dress one hero | None found |

### 5.5 The Crafting bench as the outfitter, and belts to the bench

| On | Expected | Watch |
|---|---|---|
| Combat | None until linings and belt perks have sizes | |
| Progression | Crafting 1 to 99 has a worn product at each tier | |
| Economy | Three salt recipes leave. Smithing is the one road to salts. Workbench hours move to cloaks, belts, linings | An account that levelled Crafting for salts loses a road. Nobody has used it |
| Crafting | The two benches stop overlapping | Belt rows dropping as Rares today become crafted. Each ground's Rare list loses three rows, which helps the cap of six |
| Gear | Belt joins the perk seats (the plan's 12) | |
| Parties | None | |

### 5.6 Rare rows capped at six a ground

| On | Expected | Watch |
|---|---|---|
| Combat | None | |
| Progression | Next tier pieces stop arriving early as Rares on the ground below. The step into a new band is a little sharper | Band E2: every slot's current piece inside the first 15% of the band. It should still hold, since the hourly rows carry it |
| Economy | Rares are 0.4% of sold value. Rivets from Rares fall | |
| Crafting | Gem rows keep their place in the six | |
| Gear | The Warrens goes from 15 Rare rows to 6 | Which nine leave. Named pieces stay. Ladder pieces go |
| Parties | A four sees a reveal about every 40 minutes, not every 7 | Whether 40 minutes is right is a playtest question |

---

## 6. The priority list

| Priority | Recommendation | Complexity | Risk | Expected benefit | Depends on | Claim |
|---|---|---|---|---|---|---|
| **Critical** | Accessory slots have content past Level 30: jewelry tier 4 as the sample (ring, earrings, necklace, cloak, belt), the missing perk hooks, reforge at the difference | M: data, five engine hooks, catalogue regen | Medium: pushes B1 further over in every band until fees and gem pace are fitted | Six of fourteen slots come alive. Smithing and the workbench get a product | The saved kit. The combat review's to-hit change for any plus skill | EVIDENCE for the hole (`paths.json` targets, `atlas.json` noSource). HYPOTHESIS for the fix |
| **Critical** | Krell's five weapons built and measured, and the unique property list cut to kinds that change a decision | M: one new hook (spell change), five rows | Medium: a spell change stacking on a way's main ability | The endgame of the live game exists. Every later unique has a measured template | The spell review's re-sizing (ruled 31-9) | EVIDENCE: two uniques live, kit builder never picks them |
| **High** | Perks sized by their case | S in code, M in measurement | Medium: "always" perks | Jewelry becomes preparation, not a 1% tax | Jewelry tier 4. The saved kit | HYPOTHESIS. Fun needs a playtest |
| **High** | Plain Dawnsteel onto Krell's Hold's loot bands | S: data and regen | Low | B1 at 88 to 110 off 6.98. One loot rule for seven tiers | The Deadly re-size (ruled) | EVIDENCE (`atlas.json` hall cost, A6) |
| **Low** | The three designed sample pieces that are not live (Widow's Fang, Mudlark's Mitts, Demoncaller). WAS High as "one property Rare a ground before Krell": withdrawn in the 2026-11-21 correction | S: three rows on existing hooks | Low | A taste of a property piece, worn one to seven days. Small | Krell's five as the sample | EVIDENCE for the wear time (`paths.json` band lengths, `50-standards.md` 2.7) |
| **High** | Signature stones on three grounds as the Very Rare sample | S to M: three rows each, the switch, one or two hooks | Low | The super rare moment exists before Krell and lasts | Jewelry reforge for every tier | HYPOTHESIS |
| **High** | A saved kit for each ground | M: server and client | Low | Unblocks every situational item without a chore | Systems lane | HYPOTHESIS |
| **Medium** | Rare rows capped at six a ground | S: data and a guard | Low | The reveal means something again | Belts to the bench frees rows | EVIDENCE for the rate (1,568 reveals). HYPOTHESIS for 40 minutes |
| **Medium** | The Crafting bench as the outfitter. Belts to the bench. Gloves hourly | S for the moves | Low | The fourth bench has an identity | Linings for the full effect | EVIDENCE: 86% sawing, 0 workbench salt hours |
| **Medium** | Trophies on Hask, the Provost and Krell | S: three rows | Low | The Trophy room has something to mount | None | EVIDENCE: two rows, none past 50 |
| **Medium** | A find list for each ground that pays Luck | M | Low | One moment for the 99% | The Luck build (ruled 30-4 step 1) | HYPOTHESIS. Playtest |
| **Medium** | Rune tiers at Runecrafting 75 and 90 | S once spells are sized | Low | Fills a 39 level gap | Combat review | EVIDENCE for the gap |
| **Low** | Good batch (ruled, unbuilt) | S | Low | Every level worth something | None | RULED |
| **Low** | Each recipe row says what a job saves against the store | S: client text from data | Low | Seven fish and four arrow rows explain themselves | None | EVIDENCE (23) |
| **Low** | Burnt food's chance as a data row. The generator skips ladder rungs the start kit holds | S | Low | Two fewer exceptions for the formula audit | Formula lanes | EVIDENCE (`atlas.json` noCost, noSource undeclared) |
| **Remove or simplify** | Three workbench salt recipes | S | Low | One road to salts | None | EVIDENCE: 0 uses |
| **Remove or simplify** | Element guards, physical guard and plus skill leave the unique property list | S: design rule and three sample rows re-cut | Low: Krell's Tollgate and the Banded Legguards are live and carry guards. They keep them as the two named exceptions or are re-cut. Tyler's call 4 | Uniques, linings and chest weapons each own one job | Linings design | HYPOTHESIS |
| **Remove or simplify** | Five undeclared tier 1 rungs. The ruled cut list (23-7) | S | Low | A2 and A1 fall | Plan lane L36 | EVIDENCE |
| **Defer** | Catacomb armor's 48 pieces beyond one wing and one key | | | | Chest reforging (ruled 22-3) | |
| **Defer** | The Lucky ring | | | | Uniques that trade (ruled 30-4) | |
| **Defer** | Patterns, the maker's mark, commissions | | | | A market with real trades | |
| **Defer** | Cook Panther Meat, Void Banquet | | | | An input with a source | |

**Where only real players can tell.**

| Question | The playtest |
|---|---|
| Is a perk sized by case fun, or is it homework | Three testers at Level 30 to 45 with two sets of rings and the ground pages. Do they change kit when they move without being told. Do they say a perk's name |
| Is one Rare reveal every 40 minutes a moment | The same four hero account on the Warrens for three hours before and after the cap. Count how many reveals they look at |
| Does a signature stone feel like a find | Seed nothing. Watch the first real drop: does the player set it, sell it, or sit on it |
| Do players find and use the saved kit | Share of hunts started with a kit saved for that ground, two weeks after it ships |
| Do Krell's five change where a party hunts | Share of hero-hours by ground for heroes holding one, against heroes of the same Level without |

---

## 7. Tyler decides

Each call is one recommendation and its reason, then the strongest alternative in one line.

1. **Jewelry and cloaks are built to tier 7 before the beta's long chase, starting with tier 4.** Recommend YES. Six slots have nothing past Level 30 and it is the only crafted power in the game. Re-read on the 12 hour frame: tiers 4 to 6 each last 5.5 to 7.25 days for a lone hero and about half that for a four, so the case rests on tier 7 and after, where a hero lives from day 18 to 39 on, and on reforging at the fee difference so nothing bought on the way is lost. Tier 4 is the played sample. Whether tiers 5 and 6 stay separate steps is decided from that sample, not now. Alternative: leave it a sample until the Morrow Hills, and accept that the best kit is the same five accessories from Level 30 to the end of the game.

2. **Perks are sized by the hunt they are built for.** Recommend YES: 5 to 8% in the case, close to nothing outside it, with the ruled 4% budget read on a hero whose perks do not match the ground. It turns your ruling to grow the pool into 22 choices and not 22 names for 1%. Re-read on the 12 hour frame: before Krell a hero changes ground every one to seven days, so matching a kit to a ground pays most from Krell on, where a party stays for weeks. It stands, and phase B measures it at Level 88 and past first. Alternative: keep every perk at about 1% everywhere, which is safe and which no player will notice.

3. **WITHDRAWN. No property piece on every ground before Krell.** The first cut recommended it and told you your timing was wrong. It rested on Krell being about four months away, which was the old 3.3 hours a day frame. On the 12 hour frame he is 18 to 39 days away and each band before him lasts under a week, so an early property piece is worn for days. Your order stands: generous to Krell, rare and strong after. What I still recommend from this call is its other half, which is in the Critical list: Krell's five built and measured first, because a four is out of open content on day 27 with two uniques in the game. Alternative, if you want an early taste anyway: ship the three sample pieces that are already designed on existing hooks, and nothing more.

4. **The unique property list is seven kinds that change a decision.** Recommend YES: bane, crit, a spell change, an element edge, a second socket, thorns, the bow's sweet spot. Element guards belong to linings and plus skill belongs to chest weapons. Krell's Tollgate and the Banded Legguards are live with guards on them and stay as they are. Alternative: keep guards and plus skill on the list, which makes it cheap to write 20 uniques a region and makes most of them a small tier step.

5. **Each ground's Very Rare through Krell is a signature stone a smith sets in jewelry.** Recommend YES. The band is ruled and empty, the bench job is built, and a perk on a ring that reforges up is the one rare find a hero does not outgrow in a week. Alternative: Very Rares through Krell are named weapons and armor, which are outgrown inside the band they drop in.

6. **Plain Dawnsteel drops in Krell's Hold like every other tier, and the Hall's daily roll keeps only what is won.** Recommend YES. A lone hero waits 33.5 days for his weapon in a band of 17.5 to 21 days (`paths.json`, and day 39 to 60 in `50-standards.md` 2.7). A four waits 7.8 days a named piece in a band of 9, and it needs one for each hero. The Ox Road will drop the same sword 700 times faster. This call was already on the 12 hour frame and stands. Alternative: keep tier 7 on the Hall as the wall before the Morrow Hills, and accept that most heroes leave the band without it.

7. **A ground has at most six Rare rows.** Recommend YES. You ruled the big reveal stays on every Rare. At 8 to 15 rows a ground a four sees one every 7 minutes, so the only way to keep both your ruling and the moment is fewer rows. Alternative: leave the rows and the reveal, and it stays a notification.

8. **The Crafting bench is the outfitter, and its three salt recipes go.** Recommend YES: cloaks, belts, linings and ammunition. Smithing is the one road to salts. Alternative: leave salts on both benches so Crafting has something to make at 45, 60 and 75 until belts and linings exist.

---

## 8. For other areas

| To | What |
|---|---|
| **Combat review** | Perks sized by case need a list of cases the engine can tell apart (a boss, a pull over N, a ranged attacker, a hero under its Level, out of mana). The spell change property is the first unique hook and must be sized with the spell re-cut (31-9). Rune tiers at 75 and 90. Armor weights: is mixing a live choice. Linings wait on group damage |
| **Endgame review** | Hall Keys: one key, one prize roll, the key as the only clock. 19 keys were found and no Hall fought. If Dawnsteel leaves the roll (call 6), the roll lands nothing 94% of days and needs a slow sure thing. Catacomb armor: one wing and one key as the sample. Chest salts against the bench: a week of Platinum keys pays 240 Ember salts a hero |
| **Economy review** | Jewelry to tier 7 is up to 3.6M in Hallmark fees a hero at tier 7 (six pieces at 600k) and the reforge difference is what a careful hero pays. A second kit for a second ground doubles gem and fee demand. Tier 7 Rares on the Hold need the one sale rule of 23-10 |
| **Retention review** | The find list for each ground, paying Luck with no press. The five playtests in section 6. The Rare reveal's rate after the cap |
| **Home review** | Curing slots are for linings. Belts and cloak perks give the Workshop room's speed a worn product |
| **Social review** | Signature stones and Krell's uniques are the first scarce tradeables. The market's ceilings table has a row for every perk pair today |
| **Platform and formula lanes** | Every perk pair is its own item row because items are stacks by id. Tiers 4 to 7 with a pool of 22 is about 400 jewelry rows plus their Hallmark, reforge and ceiling rows. A perk as an attribute of a held piece would be the formula brief's answer and is a schema change: flagged, not proposed here. Two loot rules exist (`rollDropTable` and `rollPrize`). After call 6 the second one carries only won prizes. Burnt food's chance is in code. `VENDOR_GEAR_RATES` is seven hand numbers (ruled 23-10) |
| **Standards lane** | The DOMINANT threshold fires on jewelry (12.7 times) and Smithing (2.81 times) against the Shop, which is a designed ten times fallback. Exempt a route marked as a fallback. T4 counts pieces, not power: by count the bench is 80 to 100% of the step. A5 misses 19 kits only because keys exist for tiers 2, 4, 6 and 7. The lone 88 to 110 run prints 122 days and its listed fills end at day 19: the cache does not say what the last piece is |
| **Systems lane** | A saved kit a hero a ground: a kit row, an equip at hunt start, and the loot plan reading it |
| **Game Director lane** | From scratch answer for this area: same ladder, same benches, different order. Build what a hero keeps before what a hero outgrows: accessories as the build layer to the top, Krell's uniques ready the day the ladder ends (day 18 for a four), one system that sells percent. An early call for property pieces on every ground was withdrawn on the 12 hour frame |

---

## 9. Evidence and hypotheses

| Label | Claim | Source |
|---|---|---|
| EVIDENCE | 815 items, 224 with no open source, 240 one way only, 4 recipes that cannot be made, 2 made with no use | `tools/balance-program/atlas.json` `counts`, `lists`, `bands` |
| EVIDENCE | No ring, earrings, necklace or cloak with a source exists past tier 3. Twenty two such rows from tier 3 to 8 have none | `atlas.json` items by slot, `lists.noSource` |
| EVIDENCE | The best kit's accessory targets are the same five pieces from the 30 to 45 band to the 110 to 185 band | `paths.json` runs `bis-1-free-12`, `bis-4-free-12`, `targets` |
| EVIDENCE | Days to full best in slot against the band's length, lone: 0.87, 4.17, 1.45, 3.47, 0.65, 4.15, 6.98 for the seven bands to 110, and 0.76 for 110 to 185 | `paths.json` `bands.B1`, `B2`. Bands 2, 4 and 6 are gated by chest pieces, which 50-6 accepts |
| EVIDENCE | For an own four the Hallmarked Seam Jasper Band is the last piece in four of eight bands (day 31, 32, 21, 47) and second last at 88 to 110 (day 71) | `paths.json` `bis-4-free-12` fills |
| EVIDENCE | A named Dawnsteel piece from the Hall: 33.5 days lone, 7.8 for a four. The Ox Road route is 700 to 780 times faster | `atlas.json` source `hall:krells_hold:dawn_sword`, `lists.a6` |
| EVIDENCE | Krell's daily prize is 14 plain pieces at 0.4/14 each and two uniques at 3% | `src/data/grounds/krells_hold/pack.js`, `special-attributes.js` |
| EVIDENCE | Loot is the best route for 86 to 100% of slots at 60 to 75. The Shop is 67% of a lone hero's slots at 1 to 15 | `paths.json` `shares.slots`, `verdicts` |
| EVIDENCE | Bench share of the MID to best step by piece count is 80 to 100%. A hero with no bench takes 1.6 times as long. The best path asks 2 to 7 of 12 rested hours | `paths.json` `bands.T4`, `T5`, `T7` |
| EVIDENCE | 86% of dropped gear sold, 0.9% worn, 26 to 29 pieces a hero-hour, 1,568 Rare reveals, 89 jewels made, 4 set, 0 Hallmark fees, one Tempering buyer, one Tower climber | `10-real-players.md` sections 5 and 6 |
| EVIDENCE | 19 Hall Keys in 9.7 hours and no Hall fought. No Very Rare, unique or Trophy row on the open ground | `11-krell-hunt-2026-11-20.md` sections 5 and 9 |
| EVIDENCE | Perks measure about 1% XP each across all ways. Steady in its case is 1.4 to 1.7 times its ordinary size | `src/data/jewelry.js` comments (measured 2026-11-18) |
| EVIDENCE | Five of eight written perks have an engine hook. The necklace and cloak ship plain | `jewelry.js` `PERKS_PLAYED`, `JEWEL_POOLS` |
| EVIDENCE | The guarantee jobs exist behind the `jewel_guarantees` switch | `jewelry.js` `JEWEL_GUARANTEES`, `guaranteeJobs` |
| EVIDENCE | Four of six special attribute kinds are plain numbers | `special-attributes.js` `SPECIAL_ATTRIBUTES` |
| CITED | Weapon and armor tier steps. Recipe families, chain hours, store gold replaced. Runecrafting's 39 empty levels. Rares at 0.4% of sold value | `23-items.md` |
| HYPOTHESIS | A perk sized 5 to 8% in its case keeps the mismatched hero inside the 4% budget | Phase B: three perks in and out of their case on the matrix |
| HYPOTHESIS | Mixing armor weights is not a live choice today | Phase B: three weights on three styles at three checkpoints |
| HYPOTHESIS | Six Rare rows a ground gives a four a reveal about every 40 minutes | Phase B: computed from the grid's kills an hour. Whether it feels right is a playtest |
| HYPOTHESIS | Plain Dawnsteel on the loot bands brings B1 at 88 to 110 near the target | Phase B: solver re-run with the rows staged |
| HYPOTHESIS | Signature stones hold value on an aging server because they are used up when set | Cannot be measured. No market trades exist |
| CORRECTED | "Krell is about month four" was the retired 3.3 hours a day frame. On the ruled frame he is day 39 lone, day 18 for a four, day 8 at the ceiling, and open content ends on day 60, 27 and 11. The grid has a MID four at Level 100 in 257 hunted hours against the ruled 600 | `50-standards.md` 2.7. The grid figure is the Coordinator's, not re-read by this lane |
| COMPUTED | About 6 signature stones for a lone hero and about 11 for a four's account before Level 88, at one every 75 hunted hours a hero | 468 and 216 hunted hours from 2.7's days at 12 hours |
| NOT DONE | Nothing was played in this phase. No grid or matrix run. `51-baseline.md` had not landed on the set. Whether a saved hunt preset already holds worn gear was not checked. The lone 88 to 110 solver run's last piece is not in the cache. The Rare row count a ground was taken from 23 and the Krell hunt (15 on the Warrens, 8 on Krell's Hold), not recounted from the packs |
