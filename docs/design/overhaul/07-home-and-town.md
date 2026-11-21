# 07. Home and the town

Chapter 07 of "Hearthrise: the game we are building". It covers the House, home looks and visiting, farming, curing, training, Storage, the town's heroes at work, how town work is paid, and the Great Hearth.

**How to read the labels.** Every design statement carries one of three.

- **RULED** with a date or a call id. Tyler decided it.
- **DECIDED** with the call id and "Fable 2026-11-21". The game designer decided the call and an adversarial check corrected it. Its row is in `decisions/all.json`.
- **DECIDED (reversal, Tyler may veto)** changes one of Tyler's rulings. The first tag in the chapter names the ruling. It stands unless he vetoes it.
- **TYLER CONFIRMS** is a money call or a grant, with the one recommendation.
- **CUT (Tyler approves)** is a removal that waits for his yes.
- **OPEN**. Nobody has recommended an answer yet. The line says what decides it.

Numbers are **TARGET** (what the design aims at) or **COMPUTED** (arithmetic on data rows or the solver, not played). A measured number appears only as evidence about a design in this chapter, and says what measured it. The measuring harness is not calibrated yet (chapter 09), so every measured number here is direction only unless it is an identity proof.

`48-platform-cost.md` is not on the set. Everything that waits on it is marked **PENDING 48**.

---

## 1. The experience

**Minute 5.** Your four heroes stand in Havora beside the Great Hearth. Your account has a Wanderer's Camp with two beds and a chest. One press plants turnips in both beds. The seed row says what the crop is for: Turnip Juice, a mana drink. You leave to hunt. The field grows on the clock while you are away.

**Hour 20 (day 2 at 12 hunted hours a day).** You own the Hearthside Homestead. It cost 400 gold and a few logs and ore, and it gave you two more beds, a Kitchen and a Garden to build. Each visit you press "Tend the field" once, read the seed bill, and the field is harvested, replanted and watered. Your heroes rest for 12 hours a day and they do not stand idle. One fishes, one cooks what was caught, one trains Defense in the yard for a fee, and each goes back to its job by itself when its hunt ends. When you walk through town you see other accounts' heroes at the pier, the forge and the yard, because they really are working there.

**Hour 2,000 (about day 167).** You hold the Ironvale Keep or the Hearthrise Castle, and your home looks like one. Your benches charge no fee and keep a share of the materials on costly jobs. The Cellar keeps your linings topped up with no hero in town. The wall of the Hall of Firsts holds the Rat King's Crown, a Tower weapon, your first Krell kill and your Level 200 honor, and each cost a fee to hang. A friend visits and sees it. Your field grows a drink from a seed that only a monster drops. The yard and the dummy keep four combat skills climbing in rested hours. On the square, the whole server is feeding one fire and raising one building, and your name is on the plaque.

**What the home is for.** Three jobs and no others. **Make** supplies for the hunt out of rested hours. **Keep** what the account owns and move it between its heroes. **Show** what the account has won. Anything in the House that is none of the three is not built.

---

## 2. The design

### 2.1 Rules that hold for everything in this chapter

| Rule | Status |
|---|---|
| One home for each account, shared by all four heroes. The purse, Storage and the farm are shared too | RULED 10-15, 10-22, 10-23 |
| Items move between an account's heroes only through Storage (or trade) | RULED 10-23 |
| Every bench, node and farm job takes its inputs from the hero's bag first, then from Storage | RULED 10-25 |
| Heroes work in town for all 12 rested hours. Every time number is on the 12 hunted, 12 rested day | RULED 11-21 (50-13), 11-21 |
| Two visits a day is the free game. A visit is a few minutes for four heroes | RULED 11-21 (50-12) |
| A job is one press that sets a count and a "then". No job needs a second visit inside its own run. No decision is repeated by hand | RULED (the first principle, 10-18). Band T8 |
| No hunt starts by itself. One "Carry on" press sends every hero back to what it did last | RULED 11-20 (27-1) |
| The home gives a hunt nothing except through supplies it made and skills it trained. No home buff, no rested XP | DECIDED GR-76 and GR-63, Fable 2026-11-21. Evidence: patch `home-1` is an identity on 207 cells (section 6) |
| House prices are typed content rows (formula `E43`). They are things, not a curve. Repeating prices (the yard fee, the bench fee, the mounting fee) are hours of the wage curve | DECIDED GR-51, Fable 2026-11-21 |
| Gathering and crafting skills stop at 99. A death takes nothing from them | RULED 10-25 |

### 2.2 The property ladder

Six deeds. Each is bought with gold and goods that hunts and benches make, which is the link from the hunt back to the home.

| Tier | Deed | Gold | Also asks for | Beds | What it opens | Look |
|---|---|---|---|---|---|---|
| 0 | Wanderer's Camp | 0 | nothing | 2 | The field, the first chest | Cottage |
| 1 | Hearthside Homestead | 400 | Copper Ore, Normal Log | 4 | Kitchen, Garden. The House dummy may be bought. Chest 2. Visiting | Cottage |
| 2 | Fieldworth Farmstead | 25,000 | Cooked Shrimp, Copper Ore, Oak Log, Wolf Pelt | 6 | Workshop, Forge, Cellar. Chest 3 | Cottage |
| 3 | Stonecross Manor | 150,000 | Iron Fitting, Iron Ore, Silk Thread, Timber Beam, Willow Plank | 8 | Library. Chest 4 | Manor |
| 4 | Ironvale Keep | 600,000 | Bear Pelt, Big Bones, Iron Fitting, Maple Plank, Steel Bar, Timber Beam | 10 | The Hall of Firsts (a wall). Chests 5 and 6 | Manor |
| 5 | Hearthrise Castle | 2,500,000 | Emberforged Bar, Gatekeeper's Chain, Iron Fitting, Runewood Plank, Timber Beam | 12 | The Great Hall. Chests 7 and 8 | Castle |

| Statement | Status |
|---|---|
| The five prices | RULED 11-20 (26-3) |
| Two beds a tier | RULED (as built into 26-3's ladder) |
| Which rooms each deed opens | RULED 11-20 (26-1, 26-7, 26-9) for the rooms, DECIDED GR-73, Fable 2026-11-21 for the Hall and the Great Hall |
| The Castle asks for Gatekeeper's Chain, which drops in Krell's Hold. A plain four reaches Krell on day 31 (GR-6b), so the Castle is a goal for the weeks after Krell | COMPUTED from the data rows |
| Whether these prices are still the right size for an account that has four heroes earning from day 1 | OPEN. Nobody has re-read them (section 5, item 2) |

Formula: `E43` (typed ladders, `src/data/homestead-tiers.js`). No knob. Sinks are judged by the gold bands of chapter 04 (band G-9, standing sinks as a share of band gold).

### 2.3 Rooms and rungs

Six rooms. A room has five rungs. Each rung puts one real piece of furniture in the room, so a full House looks lived in (RULED as built, kept by 26-1).

| Room | Opens with | Rung 1 | Rungs 2 to 5 | Rung gold |
|---|---|---|---|---|
| Kitchen | Homestead | The cooking bench with no fee. Less food burnt (13%) | Keeps 2, 4, 6, 8% of a job's materials. Burn relief rises to 19% and 25% on rungs 2 and 3 | 40,000 / 70,000 / 110,000 / 180,000 / 800,000 |
| Garden | Homestead | +1 bed | +1 bed each | 600 / 2,500 / 9,000 / 60,000 / 600,000 |
| Workshop | Farmstead | The crafting bench with no fee | Keeps 2, 4, 6, 8% | 75,000 / 110,000 / 160,000 / 240,000 / 900,000 |
| Forge | Farmstead | The smithing bench with no fee | Keeps 2, 4, 6, 8% | 75,000 / 110,000 / 160,000 / 240,000 / 900,000 |
| Library | Manor | The rune bench with no fee | Keeps 2, 4, 6, 8% | 60,000 / 90,000 / 130,000 / 200,000 / 850,000 |
| Cellar | Farmstead | The first curing slot | Section 2.7 | Section 2.7 |

| Statement | Status |
|---|---|
| Rung 1 of a bench room is the bench with no fee. Rungs 2 to 5 give a chance to keep the job's materials. No room sells speed | RULED 11-20 (26-1). The sixteen speed rungs are CUT (Tyler approves), cut list 13 |
| The rung prices stay as typed | RULED 11-20 (26-1). The re-read for an account of four is DECIDED (CE-5, Fable 2026-11-21, reversal of the gold numbers of 26-3 and 26-1, Tyler may veto). Its sizes are a HYPOTHESIS |
| The swap is built ahead of the lining work, so no rung is ever on sale that sells something a player cannot feel | DECIDED GR-76, Fable 2026-11-21 |
| The House row says who a rung is for: "Keeps 8% of materials. Worth it on costly recipes." | DECIDED GR-76, Fable 2026-11-21 |
| The Shrine has no rungs. Its spot on the home map is kept | RULED 11-20 (26-8). What stands there is OPEN (section 5, item 9) |
| The Cellar sells no food effect. It is the curing room | RULED 11-20 (26-7) |
| There is no Trophy room with mount rungs. The Hall of Firsts takes its place and its wall comes from the deed | DECIDED GR-73, Fable 2026-11-21 (section 2.4) |

**Who a kept-materials rung is for.** Kept materials is a percent of a job's inputs, so it is worth nothing on cheap jobs and a great deal on costly ones, and it grows with recipe value at every later tier. COMPUTED from the recipe rows, not played: rungs 2 to 5 of a bench room pay back in about 120 bench hours for a hero running the room's best recipes, and in thousands of bench hours for a hero smelting plain bars. That is the right shape for a sink priced above a band's gold on purpose (RULED 11-18), as long as the row says so.

**The one stacking rule at a bench.** RULED 11-20 (26-2).

| Class | Members | Rule | Cap |
|---|---|---|---|
| Speed | Tools, food that speeds work, worn pieces (belts and cloak perks, chapter 03) | Added into one pool, taken off the job's time. The work window shows jobs an hour, never a percent | 40% less time |
| Yield | Kept materials (rooms), Good batch (skill), burn relief | Added into one pool: the chance a job costs nothing or makes double | 15% in all. A room gives at most 8 of it, Good batch at most 10 |
| Capacity | Curing slots, farm beds, the dummy's seat | A second place work happens. Never a rate, never skill XP for curing | 3 slots, 17 beds, 1 seat |

How the Kitchen's burn relief (13 to 25% less food burnt) counts inside the 15% Yield pool is OPEN. It is a cut to a failure chance, not a chance of a free job, so it may need its own line in the rule (section 5, item 9).

Speed and Yield multiply, so the best bench is 1.67 x 1.15 = 1.92 times a bare one (COMPUTED). The wiki says it once.

Formula and knobs: the perk key is `craftSave` in `ROOM_PERKS`, read at all four benches. Under roadmap step R20 the Speed pool and the Yield pool are two rows of the one modifier table (DECIDED GR-86, Fable 2026-11-21). No knob in `knobs.json` moves a room, and none should: rooms are content rows.

**The bench fee.** A public bench takes 15% of what a job's output sells for at the Shop, and nothing on the cheapest goods. A home bench takes nothing. RULED 11-01. Formula `E33`. DECIDED GR-56b, Fable 2026-11-21: the fee stays and is restated in hours of the wage curve (knob `wageShare`, formula `E56`, roadmap step R15). It is the reason the first rung of every bench room is worth buying, so it must not be removed.

### 2.4 The Hall of Firsts

The place where rare finds and firsts live. It is the "Show" job, and it is the reason to keep a rare instead of selling it.

| Rule | Value | Status |
|---|---|---|
| What it replaces | The Trophy room and its five mount rungs. Mounts hold real Trophy drops and boss, Tower and Catacomb firsts | RULED 11-20 (26-6) for what a mount holds. DECIDED GR-73, Fable 2026-11-21 for the rest of this table |
| Where the room comes from | The deed. The Keep gives a wall. The Castle gives the Great Hall. No mount rungs are sold | DECIDED GR-73, Fable 2026-11-21 |
| What can hang | Only rows flagged mountable, one of each. Three feeds: drops (boss Trophies, uniques, Tower weapons, Catacomb pieces), firsts read from the Honors page (a first boss kill, each 99, Level 100, 200, 300 and 400, a Tower floor), and the top stage of a creature on the kill ladder | DECIDED GR-73, Fable 2026-11-21, with GR-62 (Honors) and GR-78 (the kill ladder) in chapter 05 and chapter 08 |
| What cannot hang | Crafted pieces. Anything not flagged. A mount is never a second Storage | DECIDED GR-73, Fable 2026-11-21 |
| Hanging a piece | It leaves the bag and pays a mounting fee. Taking it down returns the piece and not the fee. A mount never copies an item | DECIDED GR-73, Fable 2026-11-21 |
| The mounting fee | Hours of the wage of the piece's own band, so it follows the gear curve and never runs out as content grows. Formula `E56`, knob `wageShare` | DECIDED GR-73, Fable 2026-11-21, on GR-51 |
| How big the fee is | TARGET: the Great Hall, filled, costs about as much as the Castle | OPEN. Sized when the mountable rows are counted (section 5, item 4) |
| How many places | The wall and the Great Hall are sized from the count of mountable rows | OPEN, same count |
| Power | None. No combat formula reads the Hall | DECIDED GR-73, Fable 2026-11-21 |
| The War Crown | It becomes a mountable piece. It has no other House use | DECIDED GR-73, Fable 2026-11-21. Chapter 03 confirms it needs no other use |

**Order of building.** The Honors page first, because the Hall reads its rows. Then the Hall. Then visiting, because a wall nobody can visit is seen by nobody. DECIDED GR-73 and GR-75, Fable 2026-11-21, reversal of 26-3 and 26-11, Tyler may veto.

**Content the Hall needs before it opens.** A Trophy row each on Captain Hask, the Provost and Lord Krell (chapter 03). A mountable flag on Trophy rows, uniques, Tower weapons and Catacomb pieces. A first-kill record for each boss (chapter 05, Honors).

### 2.5 Home looks and visiting

| Rule | Value | Status |
|---|---|---|
| Looks | Three: a cottage for the Camp, Homestead and Farmstead, a manor for the Manor and the Keep, a castle for the Castle. Two new maps | DECIDED GR-75, Fable 2026-11-21, reversal, Tyler may veto. RULED 11-20 (26-3) says a map for each deed, which GR-75 re-opens |
| Why three | Ground art is the critical path for the world (chapter 02). Two maps give both big deeds a face and leave two map slots for grounds | DECIDED GR-75, Fable 2026-11-21, reversal, Tyler may veto |
| Reuse | The manor and castle tiles are drawn so a clan hall can reuse them | DECIDED GR-75, Fable 2026-11-21, reversal, Tyler may veto. Chapter 06 owns the clan hall |
| The Camp | Its name and its picture agree. Either the scene is a camp or the deed is not called one | OPEN. An art and naming choice (section 5, item 10) |
| Visiting | A look-only visit to another account's home. One read of that account's home section, no polling, and a visited home accepts no intent | RULED 11-20 (26-11) |
| Who may visit | Friends and clan members | DECIDED GR-75, Fable 2026-11-21, reversal, Tyler may veto. 26-11 says "a friend or party member". If MM-18 is ruled as recommended, a party is an account's own four, so "party member" has no meaning here |
| When it opens | For the owner, from the Homestead, once the Hall exists | DECIDED GR-75, Fable 2026-11-21, reversal, Tyler may veto. RULED 11-20 (26-11) opens it at the Castle, which GR-75 re-opens |

Formula: none. Content rows in `HOUSE_TEMPLATES`. Nothing here is measurable in the matrix. It is a playtest question (section 6).

### 2.6 Farming

Wall-clock crops on the account's shared land. It is the one town system that needs no hero's rested hours, only a visit.

**Rules.**

| Rule | Value | Status |
|---|---|---|
| Whose land | The account's. Any hero may plant, tend or harvest. The acting hero uses its own seeds and gets the Farming XP and the crop. Gold comes from the account purse | RULED 10-23 |
| Beds | 2 for each deed tier (2 to 12) plus 1 for each Garden rung (up to 5). At most 17 | RULED (26-3 ladder, 26-1 Garden kept) |
| What opens a crop | Its Farming level and nothing else. No soil tier, no second gate | DECIDED GR-74, Fable 2026-11-21 |
| Where seeds come from | The Shop for the standard crops. Monsters for the rare ones | RULED for the Shop. DECIDED GR-77, Fable 2026-11-21 for drops |
| Tend the field | One press. It shows the seed bill first, then harvests and replants every ready bed and waters every bed that can take it | RULED 11-20 (26-4) |
| Watering | Doubles growth for 2 hours, at most 8 times a planting. It lives inside Tend. There is no water button on a bed | DECIDED GR-74, Fable 2026-11-21 |
| Regrowing crops | Tomato and Emberfruit regrow four times from one seed | RULED 10-26 |
| What the screen says | Every seed row and every Tend result says what the harvest is worth to the hunt: "41 Tomato Juice. About 3 hunted hours of your mage's mana." | DECIDED GR-74, Fable 2026-11-21 |
| Paid how | The field is already closed form: a bed is a planted-at time and a crop row. It costs the server nothing between visits | RULED (as designed). Fits GR-1 |

**What the farm is for.** Mana. One crop cooks into one drink at the Kitchen, and a home-made drink restores a third more than its store partner, because store supplies work at 0.75 of a crafted one (RULED, knob `storeSupplyShare`, formula `C-CAST-POWER`). COMPUTED from the crop and drink rows: a full field of 17 beds of Emberfruit cut twice a day makes about 7,000 gold of store drinks a day, which is about the size of a four's daily drink bill (EVIDENCE: real fours spent about 7,500 a day on store drinks). So a full field can carry most of an account's mana.

**The crops.**

| Crop | Farming | Grows in | Feeds | Verdict |
|---|---|---|---|---|
| Turnip | 1 | 4 h | Turnip Juice | The first drink |
| Carrot | 10 | 6 h | Carrot Juice | |
| Wheat | 20 | 8 h | Bread and ration recipes. House rungs ask for them | |
| Potato | 30 | 10 h | No hunt consumer | DECIDED (GR-74, Fable 2026-11-21): it gets a hunt consumer in Wheat's ration recipes. If it finds none it is CUT (Tyler approves), cut list 9 |
| Tomato | 40 | 8 h, regrows | Tomato Juice | The first regrowing drink crop |
| Pumpkin | 50 | 14 h | Pumpkin Cider | |
| Goldenroot | 62 | 16 h | Goldenroot Tea | |
| Emberfruit | 75 | 18 h, regrows | Emberfruit Cordial | The top Shop-seed drink |
| Moonbloom | 88 | 22 h | The top drink, from a dropped seed | DECIDED GR-77, Fable 2026-11-21 |

**Seeds that drop from monsters.** DECIDED GR-77, Fable 2026-11-21.

| Rule | Value |
|---|---|
| Size | A sample of one, with the Morrow Hills grounds. The Moonbloom seed leaves the Shop and becomes a tradable Rare row on one Morrow Hills ground. The seed in the Shop is CUT (Tyler approves), cut list 16. A second seed is written only after the first has been read in play |
| The seed | A tradable Rare row on one ground of the region. It counts inside the limit of six Rare rows for each ground (GR-42, chapter 03) and never pushes out a gear row |
| The drink | Sits on the existing drink ladder at the next step's size. It is never above the ladder |
| Why the limit | Evidence, patch `home-2` on the uncalibrated harness, direction only: a four whose supplies are all home-made levels about 6% faster than one buying from the store, about 10% on Deadly, and takes about a sixth less damage. Home supplies are already worth about one gear step. A drink above the ladder would stack on that |
| What it adds | A Rare line in the loot that is not gear. A reason for Farming past 75. A farm good another player wants to buy, which gives the market a consumable chain (chapter 04) |
| The choice it makes | Plant the rare seed or sell it. Beds for gold drinks or for the rare crop |
| The second seed | OPEN. Not named (section 5, item 6) |

Content rows only: a seed, a crop, a drink recipe, a drop row, three icons. No new formula.

**The first farm loop, walked against the data rows.** Checked against `src/data/start-kit.js`, `gathering.js`, `recipes.js` and `homestead-tiers.js`. Not played under this design.

| Step | The player holds and can reach | Doable from that |
|---|---|---|
| 1. Open the Farm at Level 1 | 8 Turnip Seed and 500 gold in the start kit. The Camp's 2 beds | Yes |
| 2. Plant both beds in one press | 8 seeds. Turnip opens at Farming 1 | Yes. 6 seeds left |
| 3. Come back after 4 hours and press Tend the field | 2 ready beds, 6 seeds | Yes. 2 to 4 Turnip a bed, Farming XP, both beds replanted. Farming passes 10 on the first harvest, so Carrot opens with no purchase |
| 4. Press a Turnip into Turnip Juice at the public cooking bench | Turnip in the bag. The recipe is Cooking 1 and under the cheap-goods line, so no fee | Yes by the rows |
| 5. Buy the Homestead | 500 gold less nothing spent on the field, 400 needed, plus Copper Ore and Normal Log | Gold yes. The ore and logs need a short mining and woodcutting job first, which the Path must say (chapter 08) |
| 6. Put Turnip Juice on the bar in place of the store drink | The starter bar's drink slot names the store's Thin Turnip Juice | Yes by the rows. The Tend result line is what tells the player to do it |

What an account of four holds at step 1 (one start kit or four) is part of the missing first-hour design (section 5, item 3).

### 2.7 Curing

RULED twice: 11-18 ("We can do this, just make it a gold sink") and 11-20 (26-7). It is built last in the lining work and outside the beta gate. DECIDED GR-47, Fable 2026-11-21.

| Rule | Value | Status |
|---|---|---|
| What it is | A Cellar slot where a lining or a batch of Tempering salts cures on the server clock with no hero in town | RULED 11-18 |
| What can cure | Linings and Tempering salts only. Gear, jewelry and food stay at the bench | RULED 11-18 (plan section 5) |
| Slots | Three. They are the Cellar's rungs 1, 3 and 5, at 250,000, 750,000 and 2,000,000 gold. Rungs 2 and 4 are furniture | RULED 11-20 (26-7) for the slots and prices. Rung 2 and 4 prices are OPEN |
| Time | 4 hours a lining. 8 hours a batch of salts | RULED 11-20 (26-7) |
| Fee | A quarter of the lining's own gold cost, on top of its part and gold | RULED 11-20 (26-7) |
| Skill and XP | The recipe's skill level is required. A cure gives no XP. The Crafting hero who wants XP still benches | RULED 11-18 |
| Stacking | Capacity class. No Speed, no Yield, no Good batch | RULED 11-20 (26-2) |
| Cancel | The part comes back. The fee does not | DECIDED GR-47, Fable 2026-11-21 |
| How it is run | A standing order: "Keep these linings up." The player sets it once for a hero's kit. The Cellar takes parts from Storage, cures, and puts linings in Storage. "Top up linings" in town fits them in one press. It is never a weekly chore | DECIDED GR-47, Fable 2026-11-21 |
| Sizing | Slot count, slot prices and cure times are checked against how many rested hours the best path wants a day once linings are live | DECIDED GR-47, Fable 2026-11-21 |

**Honest about what a slot sells.** The solver reads that a party hero's best path uses 2.1 to 4.4 of its 12 rested hours, and a lone mid-geared hero uses all 12 (COMPUTED, `paths.json` band T7). So for a party account a slot is not capacity it is short of. It sells presses: no hero walks to a bench and is sent back. The House row must say that, and the pay line holds: a slot makes nothing a hero at the bench cannot make.

**Where its gold goes.** The lining's own cost is a share of its band's gold (DECIDED GR-8, Fable 2026-11-21, reversal of the typed prices kept on 2026-11-18, Tyler may veto, knob `sinkShare`, formula `E38`, step R16), and the fee is a quarter of that, so the curing fee follows the gear curve with no number of its own. The lining itself is chapter 03's: one monster part and gold, 12 hunted hours, stacking to 48 (RULED 11-18).

### 2.8 Training: the yard and the dummy

Rested hours and gold become combat skill. The yard is where a hero catches up a skill that fell behind: a changed weapon, a back row's Defense. It pays skill XP only, never Level XP, and it spends no stamina.

**The yard.**

| Rule | Value | Status |
|---|---|---|
| Where | The Training Ground in Havora, on the game's own art grid | RULED 11-08 |
| Who | A hero of Level 10 or more. A session lasts at most 12 hours, which is one rest | RULED (as designed, 11-14) |
| Fee | 100 gold for each level of the trained skill, each hour. 3,000 at skill 30, 6,000 at 60, 11,000 at 110. Formula `E42` | RULED 11-20 (24-8, 26-5) |
| Fee on the wage curve | The fee is restated as hours of wage and follows the rate, so a point of skill XP never gets cheaper as the rate rises | DECIDED GR-51 and GR-54, Fable 2026-11-21, reversal of 2026-11-14, 21-7 and A-5, Tyler may veto |
| Rate | It follows a share of the cost of the skill level being trained (skill curve `P03`), and never passes half of what hunting pays that skill at that level | DECIDED GR-54, Fable 2026-11-21, reversal, Tyler may veto. It re-opens 11-14, A-5 and 21-7, which keep one flat rate |
| Why the rate follows the curve | Evidence about the flat rate, COMPUTED from the skill curve: one skill level takes 51 to 243 yard hours from skill 75 to 100. Skills have no cap, so a flat rate means the yard and the dummy stop mattering for most of the game | 44 call 15 |
| The share's value | OPEN. No number is set and `knobs.json` holds no yard knob. It needs one (section 5, item 5) |
| What the screen says | Before the player pays, the yard says what the hours will buy: levels gained and gold spent | RULED 11-20 (21-7) |
| Paid how | Closed form. The server pays at the start, at each paid hour and at the stop. No combat engine runs for a training hour | RULED 11-20 (28-11) |
| After a hunt | "Train" is a choice in "When the hunt ends", set at hunt start, charged when it starts | RULED 11-15 |
| What +10 skills is worth | Evidence, `measure.mjs` on the uncalibrated harness, 2 seeds x 1 hour, direction only: +2 to +7% Level XP, and 8 to 31% less damage taken. At the ruled fee, +10 at skill 30 is about 80,000 gold, which is about the price of Tempering's cheap end | Chapter 01 owns the Defense reading |
| A number we watch, never a gate | What a hero that trains every rested hour gains | RULED 11-21 |

**The House dummy.**

| Rule | Value | Status |
|---|---|---|
| What it is | One dummy for the account, at home, with one seat. It needs the Homestead | RULED 11-08 |
| What it buys | No hourly fee for the skills it has unlocked. It trains at the yard's rate, never faster | RULED 11-08, kept by GR-53 |
| Unlocks | Rungs for each combat skill (Melee, Ranged, Magic, Defense) by skill band. A rung ends the fee for that skill inside that band | DECIDED GR-53, Fable 2026-11-21 |
| Price of a rung | 25 to 50 hours of the yard fee at that band, on the wage curve | RULED 11-20 (26-5) for the payback. DECIDED GR-53, Fable 2026-11-21 for pricing by band |
| Why by band | The fee grows with skill. A price that does not grow is paid back in days and ends the one sink that never ends. Priced by band, both rulings hold and the sink keeps growing | GR-53 |
| Train at home after a hunt | "Train at home" is a row in "When the hunt ends", so a dummy owner sets it once | DECIDED (no call id, Fable 2026-11-21). It follows the first principle and 11-15 |

COMPUTED here from the ruled fee, as a TARGET range, not played. Band edges reuse the training item bands and are OPEN past skill 71.

| Skill band | Fee at the band's top, an hour | A rung, 25 to 50 hours of it |
|---|---|---|
| 1 to 35 | 3,500 | 87,500 to 175,000 |
| 36 to 55 | 5,500 | 137,500 to 275,000 |
| 56 to 70 | 7,000 | 175,000 to 350,000 |
| 71 to 90 | 9,000 | 225,000 to 450,000 |
| Each band after | follows the fee | follows the fee |

**Training items.** A training weapon for each combat skill, in 12 hour and 24 hour sizes and four skill bands, tradable while sealed, bought for gold. It lifts the yard's rate to about three quarters of hunting. RULED 11-14. The Crowns copies stay off the Crowns store until the yard fee and the to-hit change are live (RULED 11-20, 26-10). Premium keeps its daily one hour item (RULED 11-20, 24-4). Prices and the Crowns side are chapter 04's.

**The yard as a sink.** DECIDED GR-8, Fable 2026-11-21, reversal, Tyler may veto: with no slot prices, the yard fee is brought forward as one of the first repeating sinks, sized on an account of four. COMPUTED from the ruled fee and cached lone cells: a lone hero that trains all 12 rested hours pays 36 to 39% of its gold to the yard, which is inside the standing-sink band. A hero in a four earns less a head, so a four trains some hours and works the rest. That choice is what the fee is for.

### 2.9 Storage

| Rule | Value | Status |
|---|---|---|
| Storage | The account's shelf. Every hero reads and writes it. Stacks, not slots | RULED 10-22, 10-23 |
| Size | 100 stacks free. Four chests add 20, 30, 50 and 100 (Millrace Crate, Thicketwood Chest, Ironbanded Strongbox, Stonecross Vault) at 1,500 / 6,000 / 25,000 / 90,000 gold, behind the Camp, Homestead, Farmstead and Manor. Then 300 | RULED (as built, kept by 26-9) |
| Chests 5 to 8 | +100 stacks each at 250,000 / 500,000 / 1,000,000 / 2,000,000, two behind the Keep and two behind the Castle. Storage ends at 700 | RULED 11-20 (26-9) |
| Names for chests 5 to 8 | OPEN (section 5, item 10) |
| The word | Players read "Storage" and "chest". The word "depot" is not used in the game | DECIDED (no call id, Fable 2026-11-21, plan audit row 17) |
| Bag | Each hero's own. Ten rungs of +20 stacks, price `round(3000 x 1.32^k)`. Formula `E34` | RULED 11-20 (26-9) |
| Loot plan | Each item has a destination set once: keep in bag, deposit in Storage, sell. It runs when loot is dispatched in town | RULED 10-25 |
| Refill | The one-tap refill takes the account's own stock from Storage before it buys from the store | RULED 11-20 (plan L07). Formula `E18` |
| Mounts | A mounted piece is not in Storage and the Hall is not extra Storage | DECIDED GR-73, Fable 2026-11-21 |
| More bag and Storage for Crowns | TYLER CONFIRMS (MM-29), recommended no. Bag and Storage room stay gold sinks and are never sold for Crowns, so chests 5 to 8 keep their point |

### 2.10 The town's heroes at work

Havora is a real town. Every activity has its place: the Shop counter, Storage, the forge, the kitchen, the farm, the pier, the mine, Tamsin's board, the Training Ground, the Great Hearth. A hero walks to the place its job is done. The square is spaced for 40 to 60 bodies. RULED 10-25.

| Rule | Value | Status |
|---|---|---|
| Who is drawn | Heroes at work, whether or not their owner is online. A hero stands at the pier because it really is fishing | DECIDED GR-70, Fable 2026-11-21 |
| Why | In an idle game most heroes are working with nobody at the keyboard. The online count already includes them (RULED 11-18). A town that draws only live browsers is empty at 10 accounts, and the town is the game's screenshot | GR-70 |
| How it is stored | One row for each working hero, changed only when its job changes. A standing body needs no position stream | DECIDED GR-70, Fable 2026-11-21 |
| Who is seated first | Friends and clan members, then others. Bodies drawn in one view are capped | DECIDED GR-70, Fable 2026-11-21. The cap's number is OPEN |
| Privacy | Quiet presence hides a hero from the town | DECIDED GR-70, Fable 2026-11-21 (study 57 keeps it) |
| What it gives | Outfits, titles and faction looks get an audience at every hour (chapter 04, chapter 05) | GR-70 |
| Cost | **PENDING 48.** It is the one proposal in this chapter with a real server cost. HYPOTHESIS: it costs less a body than live presence | GR-70 |

### 2.11 Town work, paid in closed form

"Town work" is everything a resting hero does: gathering at a node, a bench job, training, fuelling the Hearth. A hero rests 12 hours a day and an account has four, so an account-day holds 48 rested hero-hours.

**The rule.** DECIDED GR-1, Fable 2026-11-21, third on the decide-first list. RULED already for training (28-11).

| Rule | Value |
|---|---|
| One yield formula | `yield = rate x time`, for training, gathering and benches alike. It sits beside the skill grant `P05` |
| Dice | Every roll a job can make (a kept material, a Good batch, a burnt fish) is seeded when the job starts. Stopping and restarting never re-rolls |
| When the server writes | At the start, when the count runs out, and at a stop. Three statements a job. No tick in between |
| Same result | The mean yield is identical to a job settled tick by tick. Both-paths tests prove it for every town activity, with the page open and with the browser closed |
| What the player sees | The bar, the count and the bag line move on screen as a prediction. Nothing can spend a predicted number, and the next server answer replaces it (CLAUDE.md section 6) |
| Skill levels | Skill XP is credited at the count or the stop, so a level can arrive in a step |
| A job | One press sets a count and a "then" (RULED, plan L08). A hero has a job queue: fish, then cook, then hunt (DECIDED GR-80, Fable 2026-11-21, chapter 08) |

**A ruling this re-reads.** RULED 10-22 says town work updates the bag and skill XP in real time like a hunt, never only when it is done. Under closed form the screen still moves in real time, and the server's copy moves at the three writes. Any press that needs the items (a deposit, a sale, a craft that uses them) settles the job first, so the browser never shows what the server would refuse. This is the recommended reading and Tyler should rule it with GR-1.

**Why it is needed.** COMPUTED from production means stretched to four heroes at 12 and 12, not measured at 12 hours, and built on list prices the standards mark as assumed:

| Line of an account-day | Database-seconds |
|---|---|
| The budget, computed from the ruled $0.15 an account a month | 60 |
| 48 rested hero-hours settled by tick | 34 |
| The same hours in closed form | about 1 |
| The whole account after every planned fix and closed-form town work | 147 |

So closed form is necessary and not sufficient. What is left is how an away hunt is saved, which is chapter 09's and **PENDING 48**. Whether four heroes working all 12 rested hours fit the budget at all is also **PENDING 48**.

**What a rested hour is worth.** Bands from the standards, section 10.2.

| Band | Target | Reading | Status |
|---|---|---|---|
| T1. A town skill from 1 to 99 | 60 to 120 days of one hero's 12 rested hours | Not read | TARGET, PROPOSED band |
| T2. A rested hour's gold beside a hunted hour's | 15 to 35% | 19 to 37% (COMPUTED, solver. The hunted side is not calibrated) | TARGET, PROPOSED band |
| T3. Supplies a hero's rested hours can cover of its own hunted hours | 25 to 50%. Never over 80% on Deadly | Not read. The solver has no supplies goal | TARGET, PROPOSED band |
| T6. A hero that only gathers and crafts | 40 to 70% of a mid-geared hunter's gold a day | Not read | TARGET, PROPOSED band |
| T7. Rested hours the best path wants a day | 6 to 12 | A party hero 2.1 to 4.4. A lone mid-geared hero 12 (COMPUTED, solver) | TARGET. The party reading is under the band (section 5, item 7) |
| X21. Every town hour has a consumer | Yes | Potato and plain Moonbloom fail it | TARGET |

Crafting is a quarter to a half of the step from mid gear to best gear, and a player who never crafts can buy it (RULED 11-21). That band is chapter 03's and this chapter's benches are where it is made.

### 2.12 The Great Hearth

The huge hearth in the center of Havora (RULED 10-25, art approved). DECIDED GR-82, Fable 2026-11-21, reversal of 2026-10-25, Tyler may veto: the three town systems that stand around it become one place with one window. It is a HYPOTHESIS that one is more fun than its parts, and it re-opens 24-10.

**What is ruled about its parts.**

| Part | Ruling |
|---|---|
| Fuelling | A hero fuels the Hearth with bones and family fuels from hunts and trains Inner Flame (RULED 10-25). Inner Flame stays a hero's skill (chapter 05) |
| Named fuels | One very rare fuel for each ground or boss. It burns alone, pays a burst of Inner Flame XP and colors the flame for everyone in the square for a while (RULED 10-25) |
| The Hearthrise | The whole server fills the Hearth with fuel, then everyone gets a Level XP bonus for a time, then it resets. No decay and no upkeep (RULED 10-25). It is fed by fuel only, never by gold (RULED 11-04). No event pays over +25% (RULED) |
| Town Works | A server-wide project paid by gold gifts that changes the town, with a plaque of the biggest givers (RULED 11-04). A new project every month with a goal sized to the server, and the Gold Given board is its plaque (RULED 11-20, 24-10). Goal `max(250,000, 20,000 x weekly active accounts)`, formula `E41`. A gift is 100 gold at least and 25,000 a day an account at most. A project is looks only and no formula reads its total (RULED 11-04) |
| Powders | Gold buys a pinch that colors the flame for 30 seconds: Cinnabar, Quicklime, Borax. The price climbs with each use in a day. The named fuels' colors are never for sale (RULED 11-04) |

**The merged design.** DECIDED GR-82, Fable 2026-11-21, reversal, Tyler may veto.

| Rule | Value |
|---|---|
| One place | The Hearth is one landmark and one window with three parts: the Fire, the Works and the Colors |
| The Fire | Fed by fuel. Every fuel a hero burns pays that hero Inner Flame XP and adds to the server's fire. Fuelling is a town job like any other and is paid in closed form. The window shows how full the fire is and what the server gets when it fills |
| The Works | Fed by gold. One project a month on the same window. The plaque stands at the Hearth |
| The Colors | Powders and named fuels in one list. A powder is bought, a named fuel is found |
| The split that never blurs | Fuel moves the Fire and only the Fire. Gold moves the Works and the Colors and never the Fire. So no gold ever buys XP for the server |
| What a hero gets | Its Inner Flame, which pays in Kindlings if GR-61 is ruled (chapter 05). Kindlings are lit at the Hearth window |
| Rule 0 | Everything here works while both players are asleep (DECIDED MM-1, Fable 2026-11-21). A fire that needs nobody at a set hour, and a project that fills from gifts made on any visit |
| The engine | The staged-gift engine of the Works survives the merge. A clan project can be rows on it later (chapter 06) |

**Where it meets the calendar.** DECIDED (CE-8 and GR-82, Fable 2026-11-21, reversal of 2026-10-25, Tyler may veto). Study 49 (MM-11) writes the event calendar a year ahead with a world bonus weekend of +25% Level XP once in four weekends. The ruled Hearthrise fills from fuel and has no date. The two are the same reward and need one rule. The decision: the world bonus weekend is the Hearthrise. The calendar sets when it lights. The server's fire sets how large it burns, up to the +25% ceiling, and the fire's size is a fixed amount of fuel for each weekly active account so a server of 10 and a server of 10,000 fill it in the same weeks. Then feeding the fire matters, the calendar still runs itself, and nobody has to be anywhere. It is a HYPOTHESIS and it is decided with GR-82 and MM-11 together (chapter 06).

**The first project.** RULED 11-20 (24-7): the first project is the Weighhouse and its goal opens the market. DECIDED GR-55, Fable 2026-11-21, reversal of 24-7, Tyler may veto (chapter 04): the market is open on day one and the first project builds something else. What it builds is OPEN (section 5, item 8).

**Not part of the merge.** The Town Crier and a Round for the Tavern stay as built and stay shut behind the population gate of the Path (DECIDED GR-79, Fable 2026-11-21, chapter 08). There is no Local chat tab (GR-69), so the criers speak in the town itself and in the System tab.

---

## 3. How it connects

| This chapter | Reads from | Feeds |
|---|---|---|
| Deeds and rungs | Chapter 04: band gold, the wage curve, the sink bands. Chapter 02: hunt drops the deeds ask for | Chapter 04: the House's typed sink. Chapter 05: a deed as a milestone |
| Kept materials, the bench fee | Chapter 03: recipes, Good batch, tools and worn Speed pieces. Chapter 01: step R20's modifier table | Chapter 03: more rolled jewelry, salts and linings from the same drops, inside the 15% Yield cap. Chapter 04: less store demand for runes |
| The Hall of Firsts | Chapter 05: the Honors page and the kill ladder. Chapter 03: Trophy rows, uniques, the mountable flag. Chapter 04: the wage curve | Chapter 04: a sink that grows with every rare added. Chapter 03: a third use for a rare (wear, sell, mount). Chapter 08: "a first is waiting to be hung" on the return card |
| Looks and visiting | Chapter 02: the art queue. Chapter 06: friends and clans | Chapter 06: tiles a clan hall can reuse, and the first use of the friends list that is not a party |
| Farming and dropped seeds | Chapter 02: the Morrow Hills grounds. Chapter 03: drink recipes, the six Rare rows a ground | Chapter 01: mana on the bar. Chapter 04: a smaller store drink bill, a farm good worth trading. Chapter 08: "the field is ready" on the return card |
| Curing | Chapter 03: linings and salts, the saved kit for each ground | Chapter 04: a fee that follows the lining's cost |
| The yard and the dummy | Chapter 05: the skill curve `P03`. Chapter 04: the wage curve, training items, Crowns. Chapter 01: to-hit, which sets what a skill level is worth | Chapter 01: combat skill. Chapter 04: the repeating sink that never ends |
| Storage | Chapter 03: the loot plan, the key ring | Chapter 08: the one-tap refill, Carry on |
| Heroes at work | Chapter 09: the cost sizing. Chapter 06: friends, clans, presence | Chapter 04 and chapter 05: an audience for looks and titles |
| Town work in closed form | Chapter 09: the budget and the save of an away hunt | Chapter 09: 34 of the 60 database-seconds. Chapter 08: the job queue and Carry on |
| The Great Hearth | Chapter 05: Inner Flame and Kindlings. Chapter 06: the event calendar, rule 0. Chapter 04: gold sinks, the market's opening | Chapter 06: the project engine for clans. Chapter 05: where Kindlings are lit |
| Clan rooms | Chapter 06: a clan room may give town work +10% as a standing buff (the re-issued study 49, MM-9 and MM-25, not ruled) | This chapter: it must enter the one Speed pool and its 40% cap |

---

## 4. The calls in this chapter, as decided

In decision-book order.

| Id | The call | The decision | Status |
|---|---|---|---|
| GR-1 | How town work is paid | Closed form for training, gathering and benches now. The save of an away hunt waits for study 48 | DECIDED (Fable 2026-11-21) |
| GR-8 | Sinks that follow the gear, and the hole the slots left | Tempering, Hallmarks and linings cost a share of a band's gold, 1.2 to 1.4 of what the band earns. The slot gold follows the order of CE-4 first, then the castle | DECIDED (reversal, Tyler may veto). Changes the typed prices kept on 2026-11-18 (Fable 2026-11-21) |
| GR-47 | Curing | Built last, as a standing order | DECIDED (Fable 2026-11-21) |
| GR-51 | Prices | Every repeating price is hours of one wage curve. The House stays typed | DECIDED (Fable 2026-11-21) |
| GR-54 | The yard's rate | It follows the skill curve and never passes half of hunting. The fee follows the rate | DECIDED (reversal, Tyler may veto). Changes 2026-11-14, 21-7 and A-5 (Fable 2026-11-21) |
| GR-53 | The House dummy | It ends the yard fee. Its unlocks are rungs by skill band, each 25 to 50 hours of the fee | DECIDED (Fable 2026-11-21) |
| GR-56b | The bench fee | It stays and moves onto the wage curve | DECIDED (Fable 2026-11-21) |
| GR-63 | The rested bank | Removed. The Library gives nothing to it (chapter 05 owns the call) | DECIDED (Fable 2026-11-21) |
| GR-70 | The town | It draws heroes at work whether or not their owner is online. PENDING 48 | DECIDED (Fable 2026-11-21) |
| GR-73 | The Trophy room | The Trophy room becomes the Hall of Firsts, with no mount rungs sold and a mounting fee for each piece hung. It builds ruling 26-6 | DECIDED (Fable 2026-11-21) |
| GR-75 | Home looks and visiting | Three looks. Visiting from the Homestead once the Hall exists | DECIDED (reversal, Tyler may veto). Changes 26-3 and 26-11 (Fable 2026-11-21) |
| GR-74 | The farm's gates | A crop opens at its Farming level and nothing else. Watering folds into Tend | DECIDED (Fable 2026-11-21) |
| GR-76 | House rooms | They sell kept materials, not speed, and the swap is built ahead of the lining work | DECIDED (Fable 2026-11-21) |
| GR-77 | Seeds from monsters | A sample of two with the Morrow Hills, each drink on the existing ladder | DECIDED (Fable 2026-11-21) |
| GR-80 | The company as one thing | A job queue for each hero (chapter 08 owns the call) | DECIDED (Fable 2026-11-21) |
| GR-82 | One Great Hearth | Town Works, the Hearthrise and powders become one Hearth. HYPOTHESIS | DECIDED (reversal, Tyler may veto). Changes 2026-10-25 (Fable 2026-11-21) |
| MM-11 | The event calendar | The world bonus weekend is the Hearthrise (this chapter's addition, decided in chapter 06) | DECIDED (Fable 2026-11-21) |

---

**Cuts in this chapter.** CUT (Tyler approves). Cut list 8: the farm's soil tiers and the water button on a bed (GR-74), a built sink of 130,500 gold. Cut list 9: Potato, if it finds no hunt consumer (GR-74). Cut list 11: the Cellar's five food rungs, off sale (GR-47). Cut list 12: the Trophy room's five mount rungs (GR-73, already ruled off sale in 26-6). Cut list 13: the sixteen House speed rungs (GR-76, already ruled in 26-1). Cut list 16: the Moonbloom seed in the Shop (GR-77). None is planned for later.

## 5. Still missing

| # | What is missing | Who decides |
|---|---|---|
| 1 | **Study 48.** Whether four heroes working 12 rested hours fit $0.15 an account. How an away hunt is saved. What a town that draws heroes at work costs | The platform study, then Tyler |
| 2 | **Early prices for an account of four.** The first deeds, the first room rungs, the first chests and the bag rungs were sized on one hero. With four heroes earning from day 1 they may be errands. Nobody has re-read them | The game designer, inside GR-8 |
| 3 | **The first hour with four heroes.** What an account of four holds at minute 1 (seeds, gold), who plants, and when the Homestead is offered. It needs a walked-through sequence | The game designer, inside GR-79 (chapter 08) |
| 4 | **The Hall's numbers.** The count of mountable rows, the size of the wall and the Great Hall, the fee's hours, and whether a visitor sees every mount | The game designer, after the mountable flag exists |
| 5 | **The yard's formula in numbers.** The share of a skill level's cost an hour pays, the hunting reference it is capped by, how the fee follows the rate, and a knob for each in `knobs.json`. The dummy's band edges past skill 71 | The game designer, inside GR-54 and GR-53 |
| 6 | **The second dropped seed,** its ground, its drink and the drink ladder's step size | The game designer, with the Morrow Hills |
| 7 | **A party hero's spare rested hours.** The solver reads 2.1 to 4.4 of 12 wanted, under the 6 to 12 band. Either the yard and market gathering fill them, or the band is wrong. It also sets what a curing slot is worth | The game designer, when the solver has a supplies goal |
| 8 | **The first town project** if the market opens on day one | The game designer, after GR-55 |
| 9 | **Crops and costs with no consumer.** Potato. Room rungs that ask for Wheat Bread and Field Rations if meals are cut. The War Crown. The Moonbloom Elixir, whose Shop price is far above the shop-as-a-floor rule. What stands on the Shrine's spot. How burn relief counts in the Yield pool | Chapter 03 and chapter 04 |
| 10 | **Names and pictures.** Chests 5 to 8. The Camp's name against its scene. Prices for the Cellar's rungs 2 and 4 | The game designer and the art director |
| 11 | **The Hearthrise's size and seam with the calendar** (section 2.12) and how much fuel fills the fire | Tyler, with GR-82 and MM-11 |
| 12 | **Who may visit** once a party is an account's own four | Tyler, with MM-18 and GR-75 |
| 13 | **Clan town work +10% and Crowns storage.** Both come from the re-issued study 49 (MM-9, MM-25 and its Crowns table). Where the clan buff enters the Speed pool, and whether Crowns storage sits beside chests 5 to 8 or replaces them | Tyler, in chapter 06 and chapter 04 |
| 14 | **Premium's daily training item across four heroes:** one for the account or one for each hero | Tyler. It is a money call |
| 15 | **The 10-22 real-time ruling under closed form** (section 2.11) | Tyler, with GR-1 |
| 16 | **A home axis for the matrix.** No cell holds a room, a bed, a bench or a rested hour, so no band in this chapter can gate a change yet (section 6) | The baseline lane |
| 17 | **Security scope.** The mount and unmount verbs, curing, visiting reads and the Hearth's gifts are money or shared surfaces and go into the one review before Early Access | The security engineer |

---

## 6. How we will know it works

**Proven already.**

| Check | Result |
|---|---|
| Patch `home-1` (identity): bench rungs 2 to 5 give kept materials and the Cellar's food effect pays nothing | 207 cells identical on every metric. No room perk reaches a hunt. The identity proof carries a decision without a caveat |
| The rested bank switched off (chapter 05's patch) | 207 cells, no number moved |

**Read, direction only (uncalibrated harness).**

| Check | Result |
|---|---|
| Patch `home-2`: every store supply at home-made strength | A four about 6% faster, about 10% on Deadly, about a sixth less damage. This is the ceiling for any home drink and the reason a seed drink stays on the ladder |
| +10 main skill and Defense | +2 to +7% Level XP, 8 to 31% less damage taken |

**Fixtures to build.** None needs a new formula.

| Fixture | What it settles |
|---|---|
| H1. A supplies axis on a matrix cell: store, home, mixed, with home supplies charged at the rested hours they cost | The true net gold of a home-supplied four. Band T3 |
| H2. The rested day in closed form: 12 rested hours split by the solver across bench, node, farm and yard, with each rung on and off | Payback of every rung in days, by recipe |
| H3. The field against the bar: beds, crop and two visits against drinks used a hero-hour | The share of each weapon way's drink bill a field covers. The right number of beds |
| H4. A yard step on the matrix beside the gear steps | The worth of +10 skills with bands and flags |
| H5. The first hour with the start kit, played | Whether 500 gold reaches the Homestead with no soil gate |
| A town-hour fixture in the per-player cost check (RULED 11-20, 28-10) | That a job is three statements |
| Both-paths tests for every town activity | Closed form pays the same with the page open and the browser closed |

**Bands this chapter is judged by.** T1, T2, T3, T6, T7, T8 and X21 (section 2.11). G-9 for the yard and the House as sinks (chapter 04). X10: a visit for four heroes takes under four minutes and repeats no decision. C2 for the server budget (chapter 09). The instrument reads T2 and T7 and cannot yet read T3. The solver marks farming, training, trophies and linings as unmeasured. That is a gap in the tool, not a clean bill.

**What only players can settle.**

| Question | The playtest | Reads as |
|---|---|---|
| Do resting heroes really work all 12 hours once Carry on and job counts exist | The Discord playtest | Idle share of hero life. Under 25% means the town model holds |
| Is Tend a pleasure or a non-event | Farm visits a day, with 12 and 17 beds | Beds planted over beds owned |
| Do players mount or sell | The first Trophy drop after the Hall opens | Mounted against sold |
| Does anyone buy a rung that says "worth it on costly recipes" | Rung 2 buys among rung 1 owners | By the recipes they run |
| Does a look sell a deed, and does a visit | The two weeks after the manor and castle maps | Deed buys by accounts that visited against those that did not |
| Does a player with gold want skills enough to pay the yard | 30 accounts for two weeks | Hours trained against hours worked. "Train" set in the after-hunt plan |
| Does a town of working heroes read as alive or as statues | The first week with GR-70 on | Asked aloud, and screenshots shared |
| Is one Great Hearth more fun than its parts | A month with the fire, one project and the calendar | Accounts that fuelled, accounts that gave, and whether the fire filled |

---

## 7. Superseded

| Dropped | From | Why |
|---|---|---|
| "Do not build curing" and "defer it behind a measurement" | 58 phase A, 46 | RULED twice (11-18 and 26-7). 47 C11 and GR-47: built last |
| Curing slots at 100,000 / 250,000 / 500,000, bench time, a fee of a tenth | The itemization plan, section 5 | RULED 11-20 (26-7): the Cellar, 250,000 / 750,000 / 2,000,000, 4 and 8 hours, a quarter |
| The dummy halves the yard fee | 55, 58 phase B | The cold audit (61 C3): Tyler approved a 25 to 50 hour payback on 11-20. GR-53 keeps "no fee" and fixes the price formula |
| The dummy as four flat rungs for any skill level | 26, the 11-08 design | GR-53: a flat price against a fee that grows is a formula fault |
| One flat yard rate as the design of record | 26, 58 phase A, 56 | GR-54 is the recommendation. The flat rate stays RULED until Tyler rules GR-54, and the chapter says so |
| A yard fee of a quarter of an hour's free gold | 24 | RULED 11-20 (24-8): 100 gold a skill level |
| Remove the bench fee | 55 | The cold audit (61 C4). GR-56b keeps it: it is what rung 1 of every bench room sells |
| Rooms that sell speed, in any number of rungs | 26's alternative, the data rows | RULED 11-20 (26-1) |
| Five mount rungs for the Trophy room | 26, plan L51 | GR-73, with three reviews behind it |
| A home map for each deed, and visiting at the Castle | 26-3, 26-11 | GR-75 is the recommendation. Both stay RULED until Tyler rules GR-75, and the chapter says so |
| Soil tiers, a water button on each bed | The data rows, 26 | GR-74 |
| The Cellar's food effects, the Shrine's flame rungs, the rested bank and the Library's part in it | The data rows | RULED 26-7, 26-8. GR-63 |
| Inner Flame folded into the Hearth | 46 | 60 and 56: Inner Flame stays a hero's skill and pays in Kindlings |
| Curing made general (any bench job in a slot), home buffs for the hunt, furniture placement, farm animals, weather, seasons, a second home, hired workers | Considered in 58 | Each fails the purpose test or a ruling. Not to be proposed again without new evidence |
| Every payback or price written in weeks at 3.3 hunted hours, and every "own four" reading that assumed heroes arrive over weeks | 26 | RULED 11-21: 12 hunted hours a day, four heroes from day 1 |
| Deed, rung and chest prices weighed against hero slot prices | 26, 24 | RULED 11-21: no slot prices |
| "Party member" as someone who may visit, and any town rule that leans on on-call heroes | 26-11, 57 | MM-18, DECIDED as a reversal that Tyler may veto: a party is an account's own four |
| The claim that the budget "cannot be met otherwise" as the whole case for closed form | 59 phase A | 59 phase B: necessary and not sufficient |

---

## 8. Source map

| Source | Sections this chapter replaces |
|---|---|
| `58-review-home.md` | All of it |
| `26-home.md` | All of it |
| `59-review-features.md` | Section 0.2 (the cost path), row 30 and trace 4 (town work in closed form), the Great Hearth lines |
| `60-game-review.md` | Section 1.6 home rows, section 4.5 as it bears on town work, section 8.8, and GR-82 of section 8.9. GR-1, GR-53, GR-54, GR-56b and GR-70 as they bear on home and town |
| `62-decision-book.md` and `.json` | The Home rows, and GR-1, GR-47, GR-53, GR-54, GR-56b, GR-70, GR-82 |
| `47-itemization-fit.md` | Row 5d, C11 (curing), C19 (the find list in the Hall) |
| `docs/design/itemization-plan.md` | Section 5, House curing. Linings are chapter 03's and are only cited here |
| `57-review-social.md` | A1, heroes at work in town |
| `55-review-economy.md` | Change 4 and section 10.4 (the yard and the dummy) |
| `44-formula-architecture.md` | Call 15 and rows `E33`, `E34`, `E41`, `E42`, `E43`, `P-X28`, `P-X30` as they bear on home |
| `46-from-scratch.md` | Change 3 (the Great Hearth), the House and farming rows |
| `50-standards.md` | Bands T1 to T8 and X21, as used here |
| `48-platform-cost.md` | Not on the set. PENDING |
