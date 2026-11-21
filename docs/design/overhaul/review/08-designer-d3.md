# The designer's ruling D-3, and the kill reward under Level 5

**RULED by the game designer** 2026-11-21 on `lane/d-designer-d3`, from `set/v0.2.144` at 3464fb7f2. Docs only. No game code, data, migration or tool is touched. Chapters 00 to 14, `decisions/` and `review/06-designer-rulings-w1.md` are not edited. Each ruling ends with the rows a build lane takes, and section 6 lists the edits for the integrator.

**Evidence words.** MEASURED carries its run. **Run A** is GitHub run 44950722457, the coupled arrival-kit run on set 3464fb7f2 (`tools/balance-program/arrival-kit.mjs`, 48 pairings, 4 seeds of 8 hours). **Local** is the same tool, the same seeds and the same 8 hours, replayed on the dev PC for configurations Run A's table did not print, plus two configurations the tool does not have (a scratch copy of its job, not committed, named in section 5). Where Local and Run A played the same configuration they read the same to two places. **C1 local** is `tools/balance-program/start-cards.mjs`, 4 lives a way. COMPUTED is arithmetic on named rows. PLAYED is `review/02-four-hero-hour.md`. JUDGMENT is a design call. UNKNOWN names what would settle it. Nothing here is compared with the game that runs today.

---

## 0. One screen

| Ruling | In one or two sentences |
|---|---|
| **D-3 The armor curve** | ×2.4. It is the only setting played where an armor step is worth what the 2026-10-25 ruling asks past Level 45. At ×1 armor is decoration from Level 45 to 400. It makes the mid kit take 18 to 32% more damage, so CB-2 sizes the tier dial with it in. If ×1.6 holds the same steps on the confirm run, the curve is ×1.6 |
| **D-3 What the arrival kit is** | The mid kit one band back, in gear only. Skills sit on the career line, and the hero carries the Shop's basic whetstone as it carries the Shop's basic arrow |
| **D-3 What S5.low measures** | It becomes a report, never a grade. An arrival is graded by what a player feels: it never dies on Normal (S2.low), its low point (S1.low), its pace (P3), and for a party the tier it can hold (S6) |
| **D-3 Level 10** | Not an arrival. It is a hero in no armor beside one in Bronze, and for a lone hero Bronze plate alone explains the whole gap. Survival grades it, and the "Wear upgrades" line of D-2 ends it |
| **D-3 Jewelry** | In the game, no number moves in the first build. In the matrix, GR-38's stand-in leaves every cell under Level 110, as its own registry note says, and plays at 0.5 to Level 185 and 1.0 after, where it reads the decided 6% |
| **D-3 The early tiers** | Tiers 1 to 7 keep their built armor. A ladder tier is worth about 9 to 18% less damage, far over 3 to 5%, and that is the early hook. On the veto list |
| **D-3 Carter's Rest, the Ox Road, factions** | They stay staged and factions stay held. They open in their own patch, started when the first live hero reaches Level 95 |
| **D-3 The heavy trade** | A heavy piece pays for armor with lighter blows (`strB`), never with to-hit. The hidden sample is re-cut on ×2.4 |
| **GR-5 Under Level 5** | Fix (a), the curve, at exponent 1.1. Every starting card reaches Level 5 in 16.2 to 19.2 minutes with no death. The Mill Cellar carries no ground number |
| **The wand card** | "About 100 gold", with a clause that its loot sells for more |

**What Tyler can veto, one line each.**

1. **D3-1, early armor tiers.** The ruling of 2026-10-25 asks 3 to 5% less damage an armor upgrade. A ladder tier gives about 9 to 18% at ×2.4 (COMPUTED, section 1.3 ruling 5) and 13 to 26% early in an older measurement (itemization plan section 0). This ruling keeps the ladder as built, and grades 3 to 5% on the band step past Level 110, where it holds. "Veto D3-1" resamples tiers 1 to 7 on the curve, which leaves Bronze with about 3 points of plate a set and makes the Bronze to Iron step about fifteen times (COMPUTED, section 1.6).
2. **D3-2, factions not in the first build.** On 2026-11-14 the faction war was ruled to switch on once the beta has players. With the Morrow pair staged, no ground pays standing, so factions cannot open. "Veto D3-2" opens the pair and arms factions in the first build. That adds art for two grounds and the faction skills sized on the engine to combat batch CB-2.

**One thing the plan owner must know.** GR-38's stand-in (`patches/items-2.json`) has inflated the mid kit under Level 110 in every matrix run since it was registered. Its own note says to read it at Level 110 and past only. It gives a Level 15 necklace and studs, and a Level 30 ring and cloak, their tier 7 numbers. Dropping it under 110 lowers the mid four's pace there, so the Level law's seat (1.263, S-11) is re-read on the confirm run before FB-8 stage 3 fits the law (section 1.5).

---

## 1. D-3, before FB-8 stage 1's armor half

### 1.1 What Run A shows, taken apart

Run A found no setting that holds S5.low at every Level, and R5 read 492 red rows on it. Five separate things sit inside them. Two are the definition of the arrival kit, one is a measurement leak, and two are the design.

| # | What it is | Evidence | Kind |
|---|---|---|---|
| 1 | **Level 10 is a hero in no armor against one in Bronze.** Under Level 15 the arrival kit is the start kit, which holds no armor (`start-kit.js` START_EQUIPMENT: a practice sword and shield). Bronze plate, 18 points a set, takes 56% off a Level 10 blow, so the hero in no armor takes 2.26 times as much. At ×2.4 Bronze takes 41% and the gap is 1.69. A four reads higher (2.6 to 3.1 at ×1), because its slower kills keep the front hero in the fight longer, as in row 5 | COMPUTED from `mitigation.js` and `gear-tiers.js`. Run A read 2.1 to 2.4 lone at ×1 and 1.6 at ×2.4. Local read 1.68 lone at ×2.4 | Definition |
| 2 | **The eight skill points are not gear.** The arrival kit was eight Melee and Defense points under the career line. Skills come from hunting, and a hero that reaches a band has hunted to it. The risk line of D-1 sorts a party by the gear it wears, so a low kit that is also low on skills describes a weaker hero than the one reading it | `standards.mjs` GEAR_STATES.low. D-1 section 1.4 rule 4 | Definition |
| 3 | **The mid kit wore tier 7 jewelry from Level 15.** GR-38's stand-in gives Fang Studs and the Wolfbone Necklace (Level 15) and the Seam Jasper Band and Warband Bulwark (Level 30) tier 7 numbers: 7 on every attack and strength field, and 255 steady on the cloak, which is a 25.5% cut off every hit. The arrival kit wears no jewelry, so the gap carried it. At 25% of the stand-in the four rows sit just under what they hold today | `patches/items-2.json` and its registry note: "Read it at Level 110 and past only". COMPUTED: 7 × 0.25 is 2 against today's 2, 2 and 3, and 255 × 0.25 is 64 steady against today's 110 | Measurement |
| 4 | **Armor is decoration past Level 45 at ×1.** A full mid set holds more armor than the 60% cap can use, and one tier back is at the cap too. So an armor step is worth nothing, and the arrival gap past 45 is all offense | MEASURED in chapter 12 section 3.6 (R0 and L): an armor step reads −0.8 to +1% past 45 at ×1, and 3.6% at Level 60 and 4.1% at Level 400 at ×2.4 | Design |
| 5 | **A four's gap is its kill speed, not its armor.** On Normal the four kills as fast as the ground respawns in either kit, so its kills an hour match. But the low four takes 2.5 to 3.7 times as long on each kill, so the front hero is hit for longer. The healer covers it | Local, ×2.4, offset 0, Level 20 to 45: kills an hour 732 against 742, a kill 1.13 s against 0.46 s, the front seat takes 99% of the damage | Design |

### 1.2 What the arrival costs a player, on Normal

Local, ×2.4, the arrival kit with skills on the line, against the mid kit with jewelry at 25% of the stand-in. 4 seeds of 8 hours, Normal.

| Level | 10 | 20 | 30 | 45 | 60 | 88 | 110 | 145 | 185 | 300 | 400 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lone: damage taken, low over mid | 1.68 | 1.45 | 1.56 | 1.40 | 1.41 | 1.31 | 1.17 | 1.19 | 1.21 | 1.18 | 1.19 |
| Lone: Level XP an hour, low over mid | 1.00 | 0.74 | 0.80 | 0.89 | 0.84 | 0.86 | 0.95 | 0.89 | 0.91 | 0.91 | 0.91 |
| Lone: the low kit's typical low point | 92% | 55% | 83% | 79% | 82% | 75% | 87% | 73% | 76% | 68% | 68% |
| Four: damage taken, low over mid | 1.99 | 1.96 | 1.83 | 1.80 | 1.72 | 1.49 | 1.16 | 1.41 | 1.28 | 1.33 | 1.33 |
| Four: Level XP an hour, low over mid | 0.95 | 0.99 | 0.98 | 0.93 | 0.86 | 0.99 | 0.99 | 0.99 | 0.96 | 0.97 | 0.97 |
| Four: the low kit's typical low point | 88% | 91% | 95% | 93% | 89% | 95% | 97% | 94% | 94% | 92% | 91% |
| Four: store bill, low kit / mid kit, gold an hour | 1,124 / 1,290 | 1,868 / 1,210 | 1,000 / 835 | 1,581 / 2,143 | 4,353 / 5,639 | 3,485 / 4,075 | 3,043 / 4,590 | 5,108 / 7,117 | 5,326 / 8,299 | 6,795 / 10,184 | 8,121 / 11,597 |

No death in any cell, here or in Run A's 308.

**What this says.** A lone hero who arrives a band behind feels it: up to a quarter slower and a fuller food bill, never near death. A four on Normal barely feels it in pace or gold. Its healer absorbs the extra damage, and its store bill is often smaller, because the mid kit buys better ammo and whetstones. For a four the arrival shows up where the four's pace lives: the tier it can hold. That is what the low rows of S6 grade (an arrival four should step down from Dangerous).

So the damage ratio was never the thing a player feels. It is a proxy that multiplies every offense step through the ground's respawn. The rulings below grade the arrival by what a player feels, and fix the two real design misses at their own layer.

### 1.3 The rulings

**Ruling 1. The armor curve is ×2.4.** `armorCurve` 2.4, layer: coefficient. It is the only setting played where an armor step lands inside the ruled 3 to 5% past Level 45 (MEASURED, chapter 12 section 3.6). At ×1 a mid set past Level 45 sits at the 60% cap, so every armor system there does nothing: the armor half of Tempering, the armor line past Dawnsteel, heavy and light uniques, the Catacomb armor chase. At ×2.4 the best kit's extra armor also counts, which S5.bis (ruled, 0.80 to 0.90) needs past Level 110, where it read only 7 to 9% less damage at ×1.

What it costs, and a correction. Chapter 12 section 3.6 says the mid hero's damage "did not move" at ×2.4. On 4 seeds of 8 hours it does. The mid kit takes 18 to 32% more damage on Normal at every Level, lone and four, and its pace does not move (Local, `mid-a24-j25` against `mid-a10-j25`). Normal stays safe: the mid kit's typical low point reads 76 to 97% lone and 93 to 98% for a four, still at or over the ruled 60 to 80%. On the harder tiers the same 18 to 32% lands, so the tier dial of CB-2 is sized with ×2.4 in. If the ruled death counts need it, the tier dial moves, never the armor curve.

**The switch rule, decided now.** A smaller curve could buy the same step for less of that cost. COMPUTED for a plate set on the line, absorb only: a +17% band step is worth about 5% less damage at any curve from ×1.3 up, and ×1.6 raises the mid kit's damage by about 15% where ×2.4 raises it by about 31%. So the confirm run plays ×1.6 beside ×2.4. If ×1.6 holds E1.armor inside 3 to 5% at Levels 60, 185 and 400, and S5.bis inside 0.80 to 0.90 past Level 110, the curve is ×1.6. Otherwise it is ×2.4.

**Ruling 2. The arrival kit is the mid kit one band back, in gear only.** Skills on the career line. Every way carries the Shop's basic consumable: Bronze Arrows for the bow, as today, and Coarse Whetstones for the melee ways. The Shop sells ten for 60 gold (`shops.js` seed.coarse_whetstone, strB 2). The kit builder's line "the store sells none" is wrong. Nothing crafted, no Tempering rung, one tier or band back on every dropped slot.

**Ruling 3. S5.low is a report.** It prints at every Level and grades nothing. An arrival is graded by four bands that say what a player feels:

| Band | What it asks of the arrival kit | Status |
|---|---|---|
| S2.low | It never dies on Normal: at most 5 deaths in 1,000 hunted hours, red over 10 | PROPOSED, kept. MEASURED 0 everywhere (Run A, Local) |
| S1.low | Its typical low point on Normal sits from 45 to 70%, red under 35% | PROPOSED, kept. MEASURED 55 to 92% lone, 88 to 97% for a four (Local) |
| P3 | A lone hero's pace on Normal is 0.80 to 0.90 of the mid kit's, red under 0.70 | PROPOSED, kept. It already reads the lone hero only. MEASURED 0.74 to 0.95 (Local), so no red. A four's pace is held by the respawn (0.86 to 0.99) and prints beside it |
| S6.dangerous.low, S6.deadly.low | A four in the arrival kit should step down from the harder tiers | PROPOSED, kept. Read on the death sample in CB-2, with these rulings in |

S5.low's band of 1.15 to 1.35 was set by the standards auditor from the armor step alone. Its note in `standards.mjs` cites the ruled 3 to 5% and an early tier measured at 13 to 26%. It is PROPOSED and was never ruled by Tyler. It asks for one number that would hold a lone hero and a four held by the respawn at once, and nothing a player can see reads it.

**Ruling 4. Under Level 15 there is no arrival.** The first band has no band behind it. The start kit is graded by S1.low and S2.low on Normal only (MEASURED: no death at Level 10, lone or four, at either armor curve), and by checks C1 and C3. D-2's "Wear upgrades" line and Tamsin's Bronze Helm at about minute 10 keep a real hero out of it. The first armor piece is meant to halve the damage a hero takes. That is the first thing the game teaches about gear.

**Ruling 5. The ladder keeps its built armor.** Today's plate sets per tier are 18, 36, 66, 104, 153, 210 and 281 points (`gear-tiers.js`, COUNTED one piece a slot). Tiers 2 to 6 already sit at 0.86 to 1.09 of the gear line at their Levels, and tier 7 is Dawnsteel, the line's own anchor. Bronze sits far over the line, because the line at Level 1 holds about 3 points. So FB-8's generator writes the armor line from Level 110 and does not rewrite tiers 1 to 7. On the ladder a tier step is worth far more than 3 to 5%: COMPUTED for plate at ×2.4, about 18% less damage at Level 20, 17% at 30, 13% at 45, 12% at 60 and 9% at 88, an upper bound because spells skip armor. That is the early hook ruled on 2026-11-20, and it is on the veto list as D3-1. E1.armor is graded on the band step (+17%) and prints the ladder's tier steps as a report.

**Ruling 6. Jewelry.** Two halves.

- **The game.** No jewelry or cloak number moves in the first build. GR-38's derivation (the six crafted slots as 6% of the kit, written from the curve) waits where the plan has it. Measured on what the first build ships, the rows read PENDING-REAL of a lone mid hero's Level pace from Level 45 to 88 (Local, proposed without GR-38).
- **The matrix.** GR-38's stand-in is played only where its own note allows it, from Level 110, scaled so the crafted class reads its decided 6%: 0.5 of the stand-in from Level 110 to 185, and 1.0 from 186. Under 110 the mid kit wears the rows the first build ships. MEASURED for the scale: PENDING-SCALE.

**Ruling 7. The four's damage ratio is a report too.** It reads kill speed through the respawn (section 1.1, row 5). Where a four's arrival should hurt is on the harder tiers, and S6 grades that.

### 1.4 The rows a build lane takes

**FB-8 stage 1, the armor half.** Game data.

| File | Row | Value | Was | Layer |
|---|---|---|---|---|
| `src/data/core-model.js` | ARMOUR_MITIGATION `absorb.k` | 1.488 | 0.62 | Coefficient, `armorCurve` 2.4 |
| `src/data/core-model.js` | ARMOUR_MITIGATION `dodge.k` | 0.96 | 0.4 | Coefficient, `armorCurve` 2.4 |
| `src/data/core-model.js` | ARMOUR_MITIGATION `ward`, `maxPm`, `capPm` | Unchanged | | |
| `src/data/gear-tiers.js` | Armor `defB` of tiers 1 to 7 | As built. The curve's generator writes armor from Level 110 only | Resampled on the line | Content data, ruling 5 |
| Jewelry and cloak rows (`slot-ladders.js`, `items.js`) | Plain numbers | Unchanged | | Ruling 6 |
| `src/data/hunts.js` | `staged` on `carters_rest`, `ox_road` | Unchanged | | Section 3 |

**FB-3, the measuring tool.** Tool data. FB-3 alone writes `standards.mjs`.

| File | Row | Value | Was |
|---|---|---|---|
| `tools/balance-program/standards.mjs` | GEAR_STATES.low.skills.vsCareerLine | 0 (drop `fullFromLevel` and `zeroAtLevel`) | −8, sliding in from Level 10 to 30 |
| `tools/balance-program/standards.mjs` | GEAR_STATES.low.ammo | `store-basic`: the Shop's basic arrow and the Shop's Coarse Whetstone | The basic arrow only |
| `tools/balance-program/grid-kit.mjs` | LOW's ammo line | Melee ways carry `coarse_whetstone` | "none (the store sells no whetstone)" |
| `tools/balance-program/standards.mjs` | S5.low | `mode: 'report'`, no red | Graded, 1.15 to 1.35, red over 1.50 |
| `tools/balance-program/standards.mjs` | E1.armor | Graded on the band step (+17%). The ladder's tier steps under Level 110 print as a report (D3-1) | Graded on every step |
| `tools/balance-program/standards.mjs` | The mid kit's jewelry stand-in | GR-38's patch applies to cells at Level 110 and up only, its plain numbers × 0.5 to Level 185 and × 1.0 from 186 (`jewelRows` by the cell's Level) | Applied at every Level, × 1.0 |

### 1.5 What FB-3 plays to confirm

One run, the arrival-kit shape: the lone hammer and the standard four, Normal, Levels 10, 20, 30, 45, 60, 88, 110, 145, 185, 300 and 400, **4 seeds of 8 hours**, on the proposed base with every row of section 1.4 in.

| Config | What it is |
|---|---|
| LOW | `armorCurve` 2.4 (`patches/bp-armor-curve-240.json`), skills on the line, the Shop's basic ammo for every way |
| MID | `armorCurve` 2.4, GR-38's stand-in only from Level 110 at 0.5 and 1.0 |
| MID, no jewelry | The same with every jewelry and cloak number × 0, for the crafted class's share |
| BIS | `armorCurve` 2.4, as the standards define it, for S5.bis |
| LOW, MID and BIS at ×1.6 | The same three at `armorCurve` 1.6, for the switch rule of ruling 1 |

It reads S1.low, S2.low, P3 on the lone hero, S5.low and the four's pace as reports, E1.armor on the band step at Levels 60, 185 and 400, S5.bis (RULED 0.80 to 0.90), and the crafted class's share of a lone mid hero's Level pace. Then the death sample of CB-2 plays the low and mid fours on Dangerous and Deadly with the chosen curve in, for S6, and sizes the tier dial with it.

**What would change this ruling.** A death on Normal in the arrival kit at any Level. A lone arrival's pace under 0.70 of the mid kit's at two Levels or more. E1.armor outside 3 to 5% past Level 45. Then the step that is out of its band is fixed at its own layer: the armor coefficient, the tier rows, or the jewelry share. Never the arrival kit's definition, and never a number on one ground.

**The seat.** With the stand-in gone under 110, the mid four earns a little less there. On Normal the crafted class is worth 0.1 to 3% of a four's pace (Local), because the respawn holds a four. FB-3 re-reads the seat's multiple of the pace contract (1.263 on R5) on the same base before FB-8 stage 3 fits the Level law to it. The ruled hours do not move. The XP a Level costs may, by about that much.

### 1.6 Why not the other settings

| Setting | Why not |
|---|---|
| Keep ×1 and cut jewelry to 25% ("closest" in Run A) | It is closest because nothing about armor is tested past Level 45. Every armor step past 45 stays at zero, which breaks the 2026-10-25 ruling for 355 Levels and empties the armor half of Tempering, the armor line, and the Catacomb armor chase |
| A Level-dependent offset or jewelry share for the arrival kit | It would tune a measuring state until a proxy band reads green. The player never wears it |
| Resample tiers 1 to 7 on the line through Level 0 | The line holds about 3 points of plate a set at Level 1 against Bronze's 18, and 38 at Level 15. The Bronze to Iron step becomes about fifteen times, and the Bronze Helm Tamsin pays at minute 10 rounds to no armor. COMPUTED from LINE_BASE (281 points a Dawnsteel plate set) × L / 110 |
| Hold S5.low and widen it to fit | It would grade a number nobody feels, with a band fitted to the data |

### 1.7 Evidence

| Claim | Label |
|---|---|
| The 2.26 and 1.69 gap at Level 10 is Bronze plate's absorb | COMPUTED from `mitigation.js` (750 × P / (P + k × L), cap 600) and 18 points a Bronze plate set. Run A read 2.1 to 2.4 and 1.6 |
| GR-38's stand-in leaks under 110 | Read from `proposals.json` (GR-38 note) and `patches/items-2.json`. The 25% equivalence is COMPUTED from those rows and `slot-ladders.js` |
| Section 1.2's table | MEASURED, Local, 4 seeds of 8 hours a cell, on set 3464fb7f2. The tool's own jobs `low-a24-s0`, `mid-a24-j25`, `mid-a24-j0` |
| The four's kills an hour match and its kills take longer | MEASURED, Local, the cells' `killsPerH` and `ttkS` |
| An armor step at ×2.4 | MEASURED in chapter 12 (R0 and L, 2 seeds of 1 hour). Not re-measured here. The confirm run reads E1.armor |
| The mid kit's damage at ×2.4 against ×1 | MEASURED, Local, `mid-a24-j25` against `mid-a10-j25`: 1.18 to 1.32 lone and 1.07 to 1.35 for a four, Level XP an hour 0.996 to 1.002 |
| ×1.6 gives the same band step for about half the extra damage | COMPUTED for a plate set on the line, absorb only. Not played. The confirm run decides it |
| The jewelry rows the first build ships, and the stand-in's scale | PENDING-JEWEL-EVIDENCE |
| Tier armor against the line | COMPUTED from `gear-tiers.js` rows and LINE_BASE |
| A Coarse Whetstone is sold | Read from `shops.js` seed.coarse_whetstone (10 for 60 gold) and `items.js` (strB 2) |
| What an arrival costs a four in Dangerous and Deadly | UNKNOWN until CB-2's death sample with these rows in |

---

## 2. The kill reward under Level 5 (GR-5, check C1), before FB-8 stage 2

### 2.1 The ruling

**Fix (a), the curve. Not (b), a number on the Mill Cellar.** Under Level 5 the XP a health point is multiplied by (5 / the monster's Level) ^ 1.1. It reads the monster's Level, a content number, and never the hero's. From Level 5 up nothing moves.

Why (a). The reference line of GR-5 was fitted from Level 10, and under Level 5 it is an extrapolation that pays a Level 2 rat 7 XP. Fixing the line's low end is a fix at the formula layer, and it holds for any monster under Level 5 wherever it is put. A number on the Cellar is the per-ground special rule GR-5 removed, and it breaks the day a Level 3 monster lives anywhere else.

Why 1.1 and not the measured 0.85. At 0.85 five of the seven cards miss C1's 15 to 20 minutes and the Club, the "Good first hero", would read "Slow alone" at 20.4. At 1.1 every card lands inside with room at both ends.

| Exponent | Sword and shield | Hatchets | Club | Bow | Crossbow | Wand and spellbook | Staff | Cards inside 15 to 20 minutes |
|---|---|---|---|---|---|---|---|---|
| 0.85 (the patch) | 21.6 | 22.2 | 20.4 | 19.8 | 19.8 | 20.4 | 23.4 | 2 of 7 |
| 1.0 | 19.2 | 19.8 | 18.6 | 17.4 | 17.4 | 18.0 | 20.7 | 6 of 7 |
| **1.1** | **18.0** | **18.6** | **17.1** | **16.2** | **16.2** | **16.8** | **19.2** | **7 of 7** |
| 1.15 | 16.8 | 17.4 | 15.6 | 15.0 | 15.0 | 15.6 | 17.4 | 7 of 7, two on the floor |
| 1.3 | 15.0 | 15.6 | 14.4 | 13.8 | 13.8 | 14.1 | 15.9 | 3 of 7 |

MEASURED, C1 local, 4 lives a way, median hunted minutes to Level 5. No death in any life at any exponent. The 0.85 row matches what the matrix lane reported (19.8 to 23.4).

At 1.1 a Giant Rat (Level 2, 7 health) pays about 2.7 times the line, a Hive Wasp (Level 4) about 1.3 times. Level 10 moves by a few minutes at most: Levels 1 to 4 are about 20 minutes of the 6.31 hours the matrix lane read at 0.85, so Level 10 stays inside the ruled 5 to 7 hours (COMPUTED). The confirm run reads it.

### 2.2 The ground number under Level 10

The derived number a ground carries (GR-5, written by FB-8's generator) would undo this. Chapter 12 section 3.4 computes the Cellar's number at 0.69, from a floor reading of 3.48 at Level 1. With the steeper line the floor reads higher, so the generator would cut the Cellar harder still. And the Sewer's 0.54 would cut the first party ground's pay nearly in half.

**The rule.** The generator reads a ground only at Levels the Level law clocks, Level 10 and up: its two ends are max(floor, 10) and its top. A ground whose whole band is under Level 10 carries no number (1.0). Today that is only the Mill Cellar (band 1 to 8, COUNTED from `hunts.js`). The Thicket (5 to 15), Wickstead (8 to 18) and the Sewer (5 to 25) are read from Level 10. It is a rule on the band, so a later ground under Level 10 follows it with no edit. Levels 1 to 10 are timed by check C1 and by P11 (Level 10 in 5 to 7 hours, ruled), not by the pace contract (27-2 keeps their steps).

### 2.3 The rows

**FB-8 stage 2.**

| File | Row | Value | Layer |
|---|---|---|---|
| `src/data/balance-sheet.js` (or the kill reward's data home) | The line's low end, as a named row: `{ under: 5, exponent: 1.1 }`. XP a health point × max(1, under / monster Level) ^ exponent | 5, 1.1 | Curve |
| The ground-number generator | Reads a ground at max(floor, 10) to its top. A band wholly under 10 writes 1.0 | Rule | Derivation |
| `monsters.js` `yard_dummy` | Stays `xp: 0`. The generator must not write it from the line | Unchanged | Content data |

**What FB-3 plays to confirm.** `patches/bp-kill-reward-under-5.json` with the exponent 0.85 changed to 1.1. Then `start-cards.mjs --patch <it> --seeds 4` (C1: every card 15 to 20 minutes, no death), the new-player seat to Level 10 (P11.ten, 5 to 7 hours, and P11.early, no Level of 1 to 9 over 2 hours), and check C3 (the default four in the Sewer at Level 5), each with the generated ground numbers in. The matrix past Level 5 should read identical, since no monster at Level 5 or over moves.

### 2.4 Exploit read

No item or gold moves. Only three monsters are under Level 5: the Giant Rat, the Slime and the Hive Wasp, all in the Mill Cellar (COUNTED from `monsters.js`), plus the yard dummy, which pays no XP and never falls. A hero over Level 5 cannot farm them: the Cellar ends itself at Level 5 (`endsAtLevel`), and its pull is one monster a minute. A scaled hunt raises a monster's Level, so the factor falls to 1. XP is still minted only in the settle from the server's catalogue.

### 2.5 The wand card's cost line

**The value is 100.** C1 local at 1.1 reads the wand's coin less its store bill at −110 at Level 5, with its loot unsold. Rounded to 25, that is 100. That is the number the hunt's end card shows the player (PLAYED: Mab's summary read −105), so it is the one the card names. With its loot sold the same hunt nets +809 (C1 local), so the card says that too. FB-5 fills the number from FB-3's confirm run by D-1's rule.

The words, replacing D-1 section 1.2's wand row:

> "Casting costs gold. Each Fireball uses 1 rune and some mana. The store sells both as you go. Your first hunt spends about 100 gold more than it picks up in coins, and its loot sells for more than that. You start with 500."

### 2.6 Walk-through of the first twenty minutes, on real data

What the player holds after each step, from the steps before it and the real kit. Every name was looked up on this branch.

| # | Minute | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|---|
| 1 | 0:00 | Create a hero and pick the Club | Nothing | `start-kit.js` STARTER_SETS `club`: `practice_club` (atkB 3, strB 7, `items.js`) | Yes. The pick is FB-5's |
| 2 | 0:01 | Land in town | 500 gold, 20 Cooked Shrimp, 10 Raw Shrimp, 50 Bronze Arrows, 10 Coarse Whetstones, the practice set | `start-kit.js` START_CURRENCY, START_INVENTORY | Yes |
| 3 | 0:02 | Enter the Mill Cellar on Normal | 8 hours of stamina | `hunts.js` `mill_cellar` band 1 to 8, Normal only | Yes |
| 4 | 0:02 to 0:10 | Kill Giant Rats (Level 2), Slimes (Level 2), Hive Wasps (Level 4) | The club, the start bar eats Cooked Shrimp under 60% | `monsters.js` rat, slime, hive_wasp. `start-kit.js` START_BAR | Yes. MEASURED no death in 28 lives |
| 5 | about 0:10 | Tamsin's 25 Giant Rats are done. Leave, wear the Bronze Helm | 25 rats | `tally-tasks.js` cellar_giant_rats (25, 25 gold). `items.js` bronze_helm (reqLv 1, defB 3) | Yes |
| 6 | about 0:17 | Level 5. The Cellar ends itself | Level 5 | `hunt-grounds.js` mill_cellar `endsAtLevel` 5. MEASURED 17.1 minutes for the Club at 1.1 | Yes |
| 7 | 0:17 on | Build the party, as D-1 steps 9 to 12 | One Level 5 hero, three new heroes | D-1 section 1.6 | Yes. The three recruits reach Level 5 in 16.2 to 19.2 minutes each |

---

## 3. Carter's Rest, the Ox Road and factions

**The ruling. They do not open in the first build.** Both grounds keep `staged: true` (`src/data/hunts.js`). The held file `2027-05-27-arm-factions.sql` stays out of the release window, as chapter 13 section 3.3 already lists. The Level 110 band's gear is measured in the matrix only, which plays the staged grounds as open (`gear.mjs` `openAlso`).

**Why.**

1. **No hero reaches the band during the first build's first weeks.** On the Level law at the Dangerous seat, Level 110 costs about 278 million Level XP and 691 hunted hours, day 58 at 12 hours a day (COMPUTED from R13's points and 1.263). The live hero with the most Level XP holds about 102 million (COUNTED, chapter 13 L-04), which is about Level 79 on the new law. A four on the seat would need about 300 more hunted hours, about 25 days (COMPUTED). A new account invited to the playtest arrives about day 58.
2. **Factions cannot open honestly without them.** Standing is paid only on the three Morrow grounds (`src/data/hunts.js` `standingFor`, and `factions.js` FACTION_RULES.standingAfter), and the faction skills, ruled on 2026-11-21 to be sized so they matter, are not built in the engine. Opening factions now means a side that pays nothing and a skill that does not exist.
3. **Opening them costs work the first build does not have room for.** Each ground needs its style-1 art before the flag can go (`hunts.js` header, `staged`). The faction skills must be sized on the engine, which is combat batch CB-2's single sizing pass.

**The trigger.** When the first live hero reaches **Level 95**, the Coordinator starts the Morrow lane: the art for both grounds, the two flags off, the faction skills sized on the engine, and the faction files applied (2027-05-28 swap cancel, then 2027-05-27 arm). Level 95 is about 145 hunted hours, about 12 days at 12 hours, before Level 110 on the seat (COMPUTED). The Coordinator reads it in `tools/vitals.mjs` or `tools/char-state.local.mjs`. Until then a hero past 110 still hunts Krell's Hold (no ground past the Mill Cellar ends itself, COUNTED from `hunt-grounds.js`), the Burning Tower to floor 300, and the Catacomb descent.

**Rows.** None move. FB-8 does not take `src/data/hunts.js`.

---

## 4. The heavy trade in the armor line

**What broke.** Since to-hit became a ratio (2398754cb), a point of to-hit buys almost no armor. At atkB −8 the Wagon Guard's Breastplate holds only 4 armor more, so the re-cut left it, and the Outrider's Visor, at the line's armor with a Melee cost and nothing for it (`.claude/coordination/DISCOVERIES.md`, row 1, and the header of `armor-line.js`). And at ×1 a heavy plate piece at Levels 111 to 125 sits at the 60% cap, where more armor buys nothing anyway.

**The ruling.** A heavy piece pays for armor above the line with lighter blows: its own style's strength (`strB` for plate, `rangeStrB` for leather, `magicStrB` for cloth). Never with to-hit. A light piece is the mirror: less armor, a stronger blow. This is the exchange rate step R11 (`gearExchange`) publishes for every unique. The off-style penalties a weight carries today (plate's −23 Ranged and −45 Magic attack) stay. They are the weight's identity, not the trade.

**Why strength.** It still buys armor on the ratio, where to-hit does not (the re-cut's own reading, DISCOVERIES row 1: "strB buys it"). And it reads right to a player: heavy armor makes your swing heavier, not your eyes worse.

**The rows, FB-8 stage 1 with the uniques at exchange rates.** In `tools/balance-sim/staged/armor-line.js`, on the ×2.4 curve:

| Piece | Today | Ruled |
|---|---|---|
| Wagon Guard's Breastplate (122, The Night Shift, planned) | defB 100, atkB −1 | Its cost moves to `strB`. Its armor is re-sized by the file's own rule (AL3, the most armor that keeps its trade under the line on every late ground) |
| Outrider's Visor (138, The Old Guard, planned) | defB 55, atkB −2 | The same |
| Burnt Crag Leg Plates (125, Wyvern Roost) | defB 81, strB −2 | Already on strength. Re-sized on ×2.4 by the same rule |
| The other five | | Re-sized on ×2.4 by the same rule |

`LINE_FIRST_LEVEL` and the "plate can't beat tempered Dawnsteel on Carter's Rest or the Ox Road" note were measured at the cap, so `tests/armor-line.mjs` re-measures both on ×2.4. The Roost's healerless deaths are re-read with the new Leg Plates (DISCOVERIES row 1).

**The words**, for the item cards when they ship (Tyler's voice, natural RPG words):

| Piece | Card line |
|---|---|
| Wagon Guard's Breastplate | "It carries more armor than any other breastplate at Level 122, and your blows land {n} lighter in it." Then its lore line as written |
| Outrider's Visor | "It carries more armor than any other helm at Level 138, and your blows land {n} lighter in it." Then its lore line as written |

These pieces are hidden and drop nowhere in the first build. Nothing here reaches a player before the Morrow lane.

---

## 5. What I did not check

- I did not download Run A's artifacts. Section 1.2 comes from Local replays of the same tool, seeds and hours. Where they overlap they match: Local reads Run A's "closest" setting (×1, offset 0, jewelry 25%) lone at 1.38 to 2.20, 1.06 to 1.25, 1.11 to 1.12 and 1.11 to 1.13 by stretch, the same four ranges Run A printed.
- Three configurations were played with a scratch copy of the tool's job (`proposed` without GR-38, at ×2.4, with and without jewelry). It is the tool's own `playRun` with one base changed, and it is not committed.
- No harder tier was played here. What an arrival four costs on Dangerous and Deadly waits on CB-2's death sample.
- The Coarse Whetstone in the arrival kit was not played. Its strB 2 against the mid kit's tier whetstone (3 to 18) closes part of the lone gap. The confirm run reads it.
- The first real weapon. Under Level 30 the arrival kit wields the practice weapon, because the start kit holds tier 1's weapon rung (GR-85). It is the largest single step in the early game (Practice Club strB 7, Iron Warhammer strB 16). How soon an Iron weapon drops in band 2 is band E2's and FB-8's, not D-3's.
- Light armor's ward is a flat number a point and does not fade with the attacker's Level. A cloth step is large early and small late. The armor curve does not touch it. It is a formula-layer item for chapter 01, owned by the game designer, and not ruled here.
- I did not open the game. Nothing in this ruling changes a screen.

---

## 6. For the integrator

- **00 section 5.5 (open items), row 12.** Closed by this ruling: "`review/08-designer-d3.md`. The armor curve is ×2.4. The arrival kit is the mid kit a band back in gear only. S5.low is a report, and the arrival is graded by S1.low, S2.low, P3 and S6."
- **00 section 5.3 (the reversal list).** Add D3-1 and D3-2 as written in section 0.
- **01 section 2 (mitigation) and the knob table.** `armorCurve` reads 0.96 and 1.488 (×2.4), DECIDED D-3. Add one line: light armor's ward does not fade with Level (section 5).
- **03 section 2.2.** Replace "The armor curve probe and the arrival kit are one open item and cannot ship apart" with "The armor curve is ×2.4 (D-3). An armor step reads 3.6 to 4.1% past Level 45". In "The formula", add: "Tiers 1 to 7 keep their built armor. Tier 1 is held over the line, because the line at Level 1 is no armor (D-3, on the veto list as D3-1)".
- **03 section 2.2, slot classes, and GR-38's row in section 4.** Add: "The matrix plays GR-38's stand-in only from Level 110, at 0.5 to 185 and 1.0 after. The first build moves no jewelry number."
- **05 section 2.16, the gear-state table.** LOW's combat skills: "On the career line." LOW's ammo: "The Shop's basic arrow and whetstone." The band rows: "Low under mid" reads "0.80 to 0.90 of mid's pace for a lone hero on Normal (P3). Damage taken is reported (S5.low)". The paragraph under it: "LOW is ruled to fail the harder tiers" stays.
- **08 section 2 "Measured since".** Replace the arrival paragraph with: "The arrival kit never dies on Normal (MEASURED, run 44950722457 and local replays). A lone arrival is up to a quarter slower and eats more. A four barely feels it on Normal and feels it as the tier it can hold (D-3)."
- **08 section 6, check C1.** The fix is the curve's low end at exponent 1.1 (D-3 section 2). The wand's cost line reads 100.
- **12 section 3.4.** The ground-number generator reads a ground from Level 10, and the Mill Cellar carries none (section 2.2).
- **12 section 3.6.** The armor curve and the arrival kit are ruled in `review/08-designer-d3.md`.
- **13 section 1.1, row 8.** "Still OPEN" loses the arrival kit and the two grounds: "Ruled in D-3: ×2.4, the arrival graded by survival, pace and tier held, the two grounds stay staged."
- **13 section 1.3, item 11.** "They do not open in the first build (D-3). The Morrow lane starts when the first live hero reaches Level 95."
- **13 section 2.4, D-3's row.** Mark it ruled, and point here.
- **13 FB-3.** Add the confirm run of section 1.5 and the C1 confirm of section 2.3. Add: GR-38's stand-in leaves cells under Level 110, and the seat is re-read on that base before FB-8 stage 3.
- **13 FB-8.** Stage 1: the armor rows of section 1.4, tiers 1 to 7 as built with the generator's check, the heavy trade of section 4. Stage 2: the kill reward's low end and the ground-number rule of section 2. FB-8 does not take `hunts.js`.
- **13 section 4, the arrival kit risk.** "Ruled in D-3. Confirmed by FB-3's run of section 1.5."
- **D-1 (`review/05-designer-rulings.md`) section 1.2.** The wand row's words are replaced by section 2.5's, and the default {N} is 100.
- **`.claude/coordination/DISCOVERIES.md` row 1.** Owner's answer: section 4.
