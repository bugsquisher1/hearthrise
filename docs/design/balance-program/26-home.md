# Balance program 26: Home

Dive of `lane/d-balance-home` (game-designer, 2026-11-20). Fifteen systems: house, room-kitchen, room-garden, room-workshop, room-cellar, room-forge, room-library, room-shrine, room-trophy, room-perks, benches, storage, farming, curing, training. Nothing in the game was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED.

Tools added (they read the game's data rows and write nothing): `node tools/balance-program/home.mjs ladder | rooms | benches | storage | farm | training | prices`, and `node tools/balance-program/home-play.mjs` (a brand-new account on a private headless local world: the House, Farm, Storage and Training windows opened from the launcher, their words printed, a farm visit pressed and counted).

Pricing: every price below is given in weeks of free gold from the economy dive's gold model (`24-economy.md` question 1 on `origin/lane/d-balance-economy` d9554e87f), with `measure.mjs price` days beside it where a table shows both. The value of the yard and the dummy is marked **re-measure after 21** (the combat dive owns to-hit). Curing prices are marked **re-price after 23** (linings are not built).

**Inventory:** no system is missing a row. Three rows need a correction, listed in "For other dives": the 30 "bank" rungs are each HERO's bag, not the account's Storage; the Trophy room hangs bestiary trophies, a system the rebuilt game does not have, not Trophy drops; training runs as a full hunt session on the settle path.

## Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 2 | room-garden, benches |
| FIX | 10 | house, room-kitchen, room-workshop, room-forge, room-library, room-trophy, room-perks, storage, farming, training |
| MERGE | 1 | room-cellar (into curing: the Cellar becomes the curing room) |
| CUT | 1 | room-shrine (Tyler approves cuts) |
| BUILD | 1 | curing (as the Cellar's rungs, after linings exist) |
| HOLD | 0 | |

### What the House is today, in one paragraph

The House sells town time to accounts whose heroes are idle 59% of their lives (REAL). Thirty-one of its forty room rungs sell something no real player can feel: 2% of bench speed, a trophy wall that hangs nothing, longer buffs from food nobody eats by hand, a faster fire for a skill with 16 recorded hours. The four rungs that matter are the first rung of each bench room (it ends the 15% bench fee) and the Garden's beds. The property ladder is over inside the first week (52,900 gold for four tiers) and then jumps 62 times to a Castle that changes nothing on screen: every tier shows the same cottage map. Farming is the one town system every real player uses, and it asks two presses a bed a visit, one at a time. The yard charges 230 gold an hour at skill 30, so the "wildly expensive" House dummy (RULED 11-08) pays for itself after 366 to 652 yard hours and no real player has ever paid the yard.

### The five changes that matter most

| # | Change | Why it is first | Size |
|---|---|---|---|
| 1 | **Farm: "Tend the field", one press** (harvest and replant every ready bed, water the rest, after showing the seed bill), and every seed row says what its crop makes ("Tomato Juice, 300 mana") | The one town system all four real people use. 12 beds are 24 serial presses a visit inside a 2 to 5 minute visit, and every House upgrade that adds a bed adds two more. The farm's real product, a four's whole drink bill, is never said | S, one RPC |
| 2 | **Trophy room: off sale now, then rebuilt as the wall for real Trophy drops** | It sells "room for N bestiary trophies" for 2,000 to 600,000 gold and the client passes no trophies to the wall (`src/world/world-boot.js:119`, `trophies: null`). Both far accounts bought it to rung 4. A player is spending on a caption that reads "Trophy wall: empty for now" | S to hide, M to build |
| 3 | **Training: a yard fee that means something (100 gold x skill level an hour), the dummy as the way out of it, and pay training without the combat engine** | RULED 11-08 says the dummy's benefit is no hourly fee. At 50 + 6 a level the fee is nothing, so the dummy is 150,000 gold for nothing. Training also settles like a hunt (ASSUMED 1,800 statements a hero-hour) to pay a constant | S data, M server |
| 4 | **Room rungs stop selling speed; one written stacking rule for a bench** | Speed is worthless to an idle hero and compounds silently with tools (a "10%" room is +11% output alone and +15% on a 25% tool). Materials are what is scarce: 3 gathering hours for every bench hour (REAL) | M |
| 5 | **The property ladder re-spaced with a look for each tier; the Cellar becomes the curing room; Storage grows in the account's depot, not in 30 bag rungs a hero** | A ladder should be a choice at every step and visible when bought. Curing needs a home and the Cellar needs a purpose. Bag rungs 11 to 30 are 38.7M a hero for space nobody will buy while the depot stops at 300 stacks against 733 item ids | M, art for the maps |

### Tyler rules on

1. **What a room rung sells.** Recommend: rung 1 of a bench room stays the bench (no fee); rungs 2 to 5 give a chance to keep the job's materials (2, 4, 6, 8%, the Workshop's own perk today) in all four bench rooms, and the five speed perks are cut. Prices stay as built. Alternative: keep speed and cut each bench room to three rungs (the bench, +5%, +10%), dropping 3.55M of sink.
2. **The bench stacking rule** (question 3). Recommend: one Speed pool a bench (tools + food, added on the job's time, capped at 40% less time) and one Yield pool (saved materials + Good batch, added, capped at 15%); curing slots are capacity and take neither. Alternative: leave today's unwritten rule (everything adds on time under a 70% fuse).
3. **The property ladder.** Recommend: 400 / 25,000 / 150,000 / 600,000 / 2,500,000 (today 400 / 2,500 / 10,000 / 40,000 / 2,500,000), a home map for each tier, and the Castle opens visiting. Alternative: keep the prices and accept that four tiers are bought in week one and the Castle is the only step.
4. **Farm, one press.** Recommend: "Tend the field" as above, watering included. Alternative: only "Harvest all", watering stays a press a bed.
5. **The yard's fee and the dummy.** Recommend: fee 100 gold x the trained skill's level an hour (3,000 at 30, 6,000 at 60, 11,000 at 110), dummy prices unchanged, so a dummy skill pays back in 25 to 50 training hours. Alternative: keep the fee and cut the dummy to 15,000 / 25,000 / 40,000 / 60,000, which drops "wildly expensive".
6. **The Trophy room.** Recommend: take its rungs off sale now (the held-offers list exists for this), then rebuild it as mounts for real Trophy items and boss, Tower and Catacomb firsts. Alternative: leave it on sale with the "empty for now" caption until the Bestiary deep dive.
7. **The Cellar becomes the curing room.** Recommend: curing slots are the Cellar's rungs, "food effects last longer" is cut, slots 250,000 / 750,000 / 2,000,000, a lining cures 4 hours and a salt batch 8, the fee a quarter of the lining's gold cost. Alternative: the itemization plan's 100,000 / 250,000 / 500,000 at bench time with the Cellar left as it is, which the Own four pays in under a week and feels nothing from.
8. **The Shrine.** Recommend: cut its five flame-speed rungs (672,400 gold on a skill with 16 recorded hours) and keep its spot on the map for whatever the combat dive rules on Inner Flame and Prayer. Alternative: keep rungs 1 to 3 (17,400 gold) as furniture.
9. **Storage.** Recommend: stop the bag ladder at 10 rungs a hero (300 stacks, 141,185 gold) and add four depot chests behind the Keep and the Castle (250,000 / 500,000 / 1,000,000 / 2,000,000 for +100 each, the depot ends at 700). Alternative: keep all 30 bag rungs (rung 30 is 9.4M for 20 stacks).
10. **Crowns training items** (a conflict between two of your rulings, laid out in question 9; this dive does not settle it). If asked for a lean: keep them off the Crowns store until the fee and to-hit changes land, because today nobody can say what 12 hours of one is worth. Alternative: sell them now on the 11-14 ruling.
11. **Visiting.** Recommend: a read-only visit to a friend's or party member's home, opened by the Castle tier for the owner. Alternative: a shareable "home card" image, cheaper and not live.

## The ten questions

### 1. The property ladder

`node tools/balance-program/home.mjs ladder` (READ FROM DATA), weeks from `24-economy.md` Q1 free gold a week at the Level the step is met. A new account is one hero until about Level 30 (24's warning), so the first three steps are the New column's.

| Tier | Property | Gold | Materials (Shop bid) | Met at | Weeks: New | Own four (at the 17% it spends) | Heavy four | Four friends, one account | `price` days, Own four | What it changes in what the player DOES |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Wanderer's Camp | 0 | none | 1 | | | | | | 2 beds, the first chest |
| 1 | Hearthside Homestead | 400 | 20 Copper Ore, 30 Normal Log (50) | 10 | 0.02 | 0.00 | 0.00 | 0.00 | 0.0 | +2 beds; may build the Kitchen and Garden; the dummy may be bought; chest 2 |
| 2 | Fieldworth Farmstead | 2,500 | Shrimp, ore, logs, 4 Wolf Pelt (163) | 10 | 0.10 | 0.00 (0.03) | 0.00 | 0.02 | 0.0 | +2 beds; Workshop, Cellar, Forge; chest 3 |
| 3 | Stonecross Manor | 10,000 | fittings, beams, silk, planks (1,022) | 30 | 0.07 | 0.02 (0.10) | 0.01 | 0.07 | 0.1 | +2 beds; Library; rung 4 of six rooms; chest 4 |
| 4 | Ironvale Keep | 40,000 | pelts, bones, fittings, planks, steel (2,733) | 30 | 0.27 | 0.07 (0.39) | 0.03 | 0.26 | 0.5 | +2 beds; Shrine, Trophy room; rung 5 of five rooms |
| 5 | Hearthrise Castle | 2,500,000 | 20 Emberforged Bar, 10 Gatekeeper's Chain, fittings, planks, beams (7,800) | 105 | 8.3 | 2.2 (12.8) | 1.4 | 8.7 | 63 (371) | +2 beds; rung 5 of the Kitchen, Library and Cellar. Nothing else: no capstone (`CAPSTONE_PERKS` is empty) and the same cottage map |

- **The first four tiers cost 52,900 gold together**, under one day of an Own four's free gold at Level 30 (610k a week) and 2.5 days of a lone New hero's. They are errands by 24's rule (under a week nobody chooses). Real players confirm it: Homestead on 4 accounts, Farmstead 3, Manor and Keep 2 (REAL).
- **Then one step of 62 times.** The Castle is 119 lone REF hours at Level 105 (MEASURED, `measure.mjs price 2500000 --at hold`), 2.2 weeks of an Own four's free gold and 12.8 weeks at the share it really spends. What it buys: two beds and the right to spend 2.35M more on three fifth rungs. Castle-gated spend is 4.85M for 2 beds, +2% cooking, +2% rune binding and +20% buff time.
- **No tier changes the picture.** `src/data/world/house-layouts.js` has one template, the cottage, "until a farmstead or manor map is drawn". The deed at Level 1 shows a tent icon labeled Wanderer's Camp while the scene behind it is a walled house with a bed and signposts for rooms (played, `home-play.mjs`). A 2.5M Castle is the cottage.
- **What each step should change** (PROPOSED, ruling 3): prices 400 / 25,000 / 150,000 / 600,000 / 2,500,000, which are 0.3 weeks of a lone hero at Level 15 to 20, 1 week of a lone hero at Level 30 (a real choice against the second hero slot at 300,000), 0.5 weeks of an Own four at Level 50 (3.1 at its 17%), and the Castle as built. One thing to do a tier, all from systems that exist or are ruled: Farmstead the three work rooms, Manor the Library and the Vault, Keep the curing room and the Trophy wall, Castle visitors. A map a tier is an art lane (a map file plus a row).

### 2. Every room and every rung

`node tools/balance-program/home.mjs rooms` and `benches` (READ FROM DATA). Ledger moved: every rung is a gold sink (one-time) and a converter of gold to town hours given back, except the Garden (gold to capacity) and the Trophy room (gold to nothing). Payback for a bench room is in hero bench hours: the rung's price over what it adds an hour at its bench, where an hour's output is the mean of the recipes real players ran, at the Shop's bid, and rung 1 also ends the 15% fee. Lone REF hours at the point named (`measure.mjs price` arithmetic).

| Room | Rung | Gold | Needs | Gives over the rung below | Lone REF h | Adds an hour at its bench | Payback |
|---|---|---|---|---|---|---|---|
| Kitchen | 1 | 40,000 | Homestead | no bench fee, cooking +2%, 13% less burnt | 3.8 @glade | 1,982 (fee 1,739 + speed 243) | 20 bench h |
| | 2 | 70,000 | Homestead | +2% speed, burn relief to 19% | 6.7 @glade | 243 | 288 |
| | 3 | 110,000 | Homestead | +2%, burn relief to 25% (burn-proof at the recipe's level) | 10 @glade | 243 | 452 |
| | 4 | 180,000 | Manor | +2% | 16 @ford | 243 | 740 |
| | 5 | 800,000 | Castle | +2% | 38 @hold | 243 | 3,290 |
| Garden | 1 | 600 | Homestead | +1 bed | 0.1 @thicket | a bed: 131 g a day (carrot) | 5 days |
| | 2 | 2,500 | Homestead | +1 bed | 0.6 @thicket | 131 to 301 a day | 8 to 19 days |
| | 3 | 9,000 | Homestead | +1 bed | 2.1 @thicket | 301 a day (tomato) | 30 days |
| | 4 | 60,000 | Manor | +1 bed | 5.7 @glade | 301 to 412 a day | 146 to 199 days |
| | 5 | 600,000 | Keep | +1 bed | 28 @hold | 412 a day (emberfruit) | 1,456 days |
| Workshop | 1 | 75,000 | Farmstead | no bench fee, crafting +2%, 1% materials saved | 7.1 @glade | 1,456 (fee 1,272 + speed 184) | 52 bench h |
| | 2 | 110,000 | Farmstead | +2%, saved to 2% | 10 @glade | 184 | 599 |
| | 3 | 160,000 | Farmstead | +2%, saved to 4% | 14 @ford | 184 | 871 |
| | 4 | 240,000 | Manor | +2%, saved to 6% | 21 @ford | 184 | 1,306 |
| | 5 | 900,000 | Keep | +2%, saved to 8% | 43 @hold | 184 | 4,899 |
| Cellar | 1 to 3 | 1,200 / 4,000 / 12,000 | Farmstead | hand-eaten food effects last +20% each | 0.3 to 2.8 @thicket | none | never |
| | 4 | 70,000 | Manor | +20% | 6.7 @glade | none | never |
| | 5 | 700,000 | Castle | +20% (twice as long in all) | 33 @hold | none | never |
| Forge | 1 | 75,000 | Farmstead | no bench fee, smithing +2% | 7.1 @glade | 3,306 (fee 2,917 + speed 389) | 23 bench h |
| | 2 | 110,000 | Farmstead | +2% | 10 @glade | 389 | 283 |
| | 3 | 160,000 | Farmstead | +2% | 14 @ford | 389 | 411 |
| | 4 | 240,000 | Manor | +2% | 21 @ford | 389 | 617 |
| | 5 | 900,000 | Keep | +2% | 43 @hold | 389 | 2,314 |
| Library | 1 | 60,000 | Manor | no bench fee, rune binding +2% | 5.7 @glade | 1,639 (fee 1,446 + speed 193) | 37 bench h |
| | 2 | 90,000 | Manor | +2% | 8.6 @glade | 193 | 467 |
| | 3 | 130,000 | Manor | +2% | 12 @glade | 193 | 674 |
| | 4 | 200,000 | Manor | +2% | 18 @ford | 193 | 1,037 |
| | 5 | 850,000 | Castle | +2% | 40 @hold | 193 | 4,407 |
| Shrine | 1 to 3 | 900 / 3,500 / 13,000 | Keep | fueling the Great Hearth +2% each | 0.2 to 3.1 @thicket | none (the Hearth has no fee and no output to sell) | never |
| | 4 | 55,000 | Keep | +2% | 5.2 @glade | none | never |
| | 5 | 600,000 | Keep | +2% | 28 @hold | none | never |
| Trophy | 1 to 3 | 2,000 / 8,000 / 25,000 | Keep | 2, 3, 4 mounts that hang nothing | 0.5 to 5.9 @thicket | none | never |
| | 4 | 60,000 | Keep | 5 mounts | 5.7 @glade | none | never |
| | 5 | 600,000 | Keep | 6 mounts | 28 @hold | none | never |

Totals: 8,326,700 gold for all forty rungs; rungs 1 to 4 are 2,376,700 (2.1 weeks of an Own four's free gold at Level 50, 12 weeks at its 17%, 1.0 week of the Heavy four's); the eight fifth rungs are 5,950,000 (5.2 weeks, 31 at 17%, 3.3 for the Heavy four). Each rung also adds one piece of furniture to the home scene (`house-layouts.js`: a hearth, a counter, an anvil, a statue), which is the one part of a rung a player can see.

- **The only sensible first buy** is the Garden's first rung (600 gold, a bed, back in 5 days), then the Kitchen's first (40,000: it ends the cooking fee and a quarter of burnt fish, back in about 20 cooking hours).
- **Rungs that pay back in a time a player will reach:** the first rung of the four bench rooms (20 to 52 bench hours) and the Garden's rungs 1 to 3.
- **Rungs that never pay back: 31 of 40.** Every bench rung past the first needs 283 to 4,899 bench hours, and all real players together have spent 133 hours cooking, 117 smithing, 187 crafting and 33 binding runes (REAL). The Cellar, Shrine and Trophy room pay back in nothing a player can count. The Garden's rungs 4 and 5 take 146 and 1,456 days as gold, and are kept as capacity for the Farming chase.
- **What the two far accounts got for 2.84M** (REAL: all eight rooms at rung 4): no bench fee (the one real gain, about 15% of what they make), 8% off 516 bench hours of heroes that were idle 59% of the time (41 hero-hours), four beds, a trophy wall with nothing on it, and 8% faster fuelling of a fire they lit three times. The account holding 2.09M has not bought them: the rungs are bought by the player who buys everything and wanted by nobody.
- **Why speed is worth nothing here.** The bench is not the bottleneck, the materials are: 418 fishing hours fed 133 cooking hours, 737 mining hours fed 117 at the forge (REAL). A faster bench finishes the same stack sooner and then waits.

### 3. Room perks against everything else at a bench: add or multiply

**Today's rule, which nobody has written down** (`src/core/pacing.js` `actionSpeedBonus`, `actionIntervalMs`): a room's speed, a tool's speed and a speed buff are ADDED into one number, and a job takes `time x (1 - that number)`, fused at 0.70. Each room key is also capped at 0.20 (`src/core/perks.js` `PERMANENT_CAP`). Because the sum comes off the time, it compounds on output: the Forge's 10% is +11% output alone and +15% on top of a 25% tool (CITED: the tool ladder's size from the comment in `pacing.js`). So a room rung is worth more to the player who already has the best tool, and the label "10% faster" is true of nobody. `craftSave` (the Workshop) and `noBurn` (the Kitchen) are separate rolls on the job and multiply with speed. Good batch (RULED 11-18, not built) would be a third roll. The House bench's fee is gold and touches no rate. Curing slots (RULED, not built) would be a second bench working at once.

**The rule to adopt (PROPOSED, ruling 2).** Three classes at a bench, each with one cap, and a room rung belongs to exactly one:

| Class | Members | Rule | Cap |
|---|---|---|---|
| **Speed** | tools, food that speeds work | Add into one pool, taken off the job's time. The work window shows jobs an hour, never a percent | 40% less time (1.67x jobs an hour). No room is in this pool if ruling 1 passes |
| **Yield** | saved materials (rooms), Good batch (skill), burn relief | Add into one pool: the chance a job costs nothing or makes double | 15% in all. A room gives at most 8 of it, Good batch at most 10, and the pool stops at 15 |
| **Capacity** | curing slots, farm beds, the House dummy | A second place work happens. Never a rate, never Speed or Yield, never skill XP for curing | Slots and beds are counted: 3 slots, 17 beds, 1 dummy seat |

Speed x Yield multiply, so a bench tops out at 1.67 x 1.15 = 1.92 times a bare bench, said once on the wiki. The bench fee stays outside all three. In the model's terms (01 section 2) every one of these is the **Time** class: they change town hours, never a hero's power.

### 4. The Cellar, the Shrine, the Trophy room

- **Cellar: MERGE into curing.** What "food and drink effects last longer" extends is the buff queue a hero gets from eating by hand from the bag (`inventory/actions.js` `eat`, `hr_item_buffs`: 27 foods, 1 to 5% for 2 to 15 minutes; `src/core/member.js` `buffsAt` shows a hunt does read it). After Luck v3.1 cuts the four drop-rate foods, 23 are left: work speed, damage, Defense, all-XP. Meals were made once each and never again (REAL), and a 4-minute buff doubled is 8 minutes of a hunt whose median is 48. The Cellar is 787,200 gold for that. Its barrels and sacks are the right room for curing, which is ruled and has no home: the Cellar's rungs become the curing slots (question 7) and the duration perk is cut.
- **Shrine: CUT** (Tyler approves). It speeds fuelling the Great Hearth, an untaxed public fire, for a skill with 16 bench hours across everyone and no use in 1 to 15 days. 672,400 gold. Whether Inner Flame and Prayer live is the combat dive's verdict (`inner-flame` is its system); if they do, the Shrine's spot on the map is free for what that verdict needs.
- **Trophy room: FIX, in two steps.** It is not short of trophies, it has no wall: the window sells "a trophy wall with room for N bestiary trophies", bestiary trophy claims do not exist in the rebuilt game, and `world-boot.js` passes `trophies: null`, so the room's first piece carries the caption "Trophy wall: empty for now" at every rung. Step one: off sale (`HELD_HOME_OFFERS` is the list for a half-built row, CLAUDE.md §3.5). Step two: mounts hold real things the account has won: the two boss Trophies (four of the six ever dropped were sold, REAL), then a Tower weapon, a Catacomb piece, a unique, a first kill of a called boss. A mounted piece leaves the bag and comes back when taken down. That gives rare drops a reason to be kept and the House something to show a visitor.

### 5. Storage

`node tools/balance-program/home.mjs storage` (READ FROM DATA). Two ladders share the Storage window.

| Ladder | Whose | Steps | Total | Gold a stack | Ends at |
|---|---|---|---|---|---|
| The depot: four chests | the account | 1,500 / 6,000 / 25,000 / 90,000, gated Camp, Homestead, Farmstead, Manor, plus logs, planks and bars | 122,500 | 75 to 900 | 300 stacks, and nothing sells more at any price |
| The bag: 30 "bank" rungs | each hero (`hr_unlock_levels` treats only rooms and properties as the account's) | 3,000 x 1.32^k for +20 stacks | 38,822,575 a hero, 155M for four | 150 at rung 1, 1,825 at rung 10, 29,309 at rung 20, 470,690 at rung 30 | 700 stacks a hero |

- Real use: 7 chests (155,000 gold), 6 bag rungs on one hero (40,217, exactly rungs 1 to 6), 1,713 deposits and 812 withdraws. The depot is finished by about Level 30 to 45: four chests are 0.2 weeks of an Own four's free gold at Level 30.
- **Is running out a decision or a tax? Today a tax, and then a wall.** The game has 733 item ids and items stack by id; rolled jewelry is a separate id a roll. The depot stops at 300 with gold left over and nowhere to spend it, while the ladder that does keep going (the bag) charges 146,270 gold for 20 stacks at rung 15 and 9.4M at rung 30. Bag space is also the wrong thing to sell deep: 4,930 gear pieces sit in bags waiting to be sold (REAL), which loot rules and Salvage fix for free.
- **PROPOSED (ruling 9):** stop the bag at 10 rungs a hero (300 stacks, 141,185 gold, 0.12 weeks of an Own four at Level 50), and put the growth where the account shares it: chests 5 to 8 at 250,000 / 500,000 / 1,000,000 / 2,000,000 for +100 stacks each behind the Keep and the Castle (3.75M, 3.3 weeks of an Own four's free gold, the depot ends at 700). Then space is a choice made a few times, and the 38.7M of rungs 11 to 30 nobody will ever buy leaves the shelf.
- **First principle.** Benches already take inputs from Storage (RULED 10-25) and "Dispatch loot" and "Deposit all materials" exist (played). What is still moved by hand is the other direction: stock one hero made, taken out by each hero that uses it (812 withdraws). The hunt prep's refill words name the store only. Handed to the retention dive as a question: should the one-tap refill take own stock from Storage before it buys.

### 6. Farming

`node tools/balance-program/home.mjs farm` (READ FROM DATA); a visit pressed in `home-play.mjs` (played: plant 2 beds in 2 presses with "Plant 2 empty plots"; five hours on, 2 presses of "Harvest and replant" and 2 of "Water", each waiting for the one before; "Harvested 4 Turnip, +1,344 Farming XP. Planted it again").

| Crop | Farming | Hours | Seed | A harvest: XP | as drinks, at the store's price for the same mana | One bed, two visits a day: gold | XP |
|---|---|---|---|---|---|---|---|
| Turnip | 1 | 4 | 5 | 1,008 | 40 (Turnip Juice) | 70 | 2,016 |
| Carrot | 10 | 6 | 10 | 1,512 | 76 (Carrot Juice) | 131 | 3,024 |
| Wheat | 20 | 8 | 15 | 3,024 | no drink (40 at the Shop bid) | 50 | 6,048 |
| Potato | 30 | 10 | 20 | 3,150 | no drink (39) | 38 | 6,300 |
| Tomato | 40 | 8, regrows 4 times | 30 | 3,675 | 156 (Tomato Juice) | 301 | 7,350 |
| Pumpkin | 50 | 14 | 50 | 3,780 | 160 (Pumpkin Cider) | 220 | 7,560 |
| Goldenroot | 62 | 16 | 150 | 7,140 | 368 (Goldenroot Tea) | 218 | 7,140 |
| Emberfruit | 75 | 18, regrows 4 times | 300 | 7,560 | 472 (Emberfruit Cordial) | 412 | 7,560 |
| Moonbloom | 88 | 22 | 800 | 10,710 | no drink (255) | -545 | 10,710 |

- **What the farm is for, which no screen says:** mana. One crop cooks into one drink that restores a third more than the store's. A full field of 17 beds of emberfruit, cut twice a day, is about 7,000 gold of store drinks a day, and real fours spend about 7,500 a day on store drinks (REAL: drinks are 20% of the store bill; 567 gold a hunted hero-hour x 13.2 hero-hours). Tomato at Farming 40 is 5,100. The seed picker says "Grows in 8 h. Needs Farming 40" and nothing else.
- **Attended minutes against value.** A visit with N ready beds is 2N presses, one at a time: 12 presses at 6 beds, 24 at 12, 34 at 17. At about 1.5 seconds a press that is 35 to 50 seconds of a 2 to 5 minute visit, for a field worth 3 to 4% of an Own four's daily free gold. Real players pressed Water 1,361 times, more than they planted or harvested, and a water press is worth 2 growth hours: half the turnip's time and a ninth of an emberfruit's. For a player who comes twice a day, watering only matters on the 14 hour pumpkin.
- **What a player repeats by hand:** harvest a bed, water a bed. What is already remembered: the crop (Harvest and replant), the seed (bought from the purse if the bag has none, 143 real uses), planting every empty bed in one press.
- **What makes a player open the farm tomorrow:** it is ready when they come back, the XP numbers are large, and it is the only town system all four real people use. It sat at zero for ten days when the plot tier was the gate; today the tier is 500 gold at Farming 5, reached on the first harvest. The risk now is the opposite one: every bed bought makes the visit longer.
- **FIX (ruling 4): "Tend the field".** One press harvests and replants every ready bed and waters every bed that can take it, after showing the seeds it will buy and their price, the way the one-tap refill does. The rules of a bed do not change (8 waterings a planting, growth never over twice real time). And each seed row says what the crop makes. Two more findings go to the items dive: two foods carry a `farm_yield` buff that `hr_farm_harvest` never reads, and the Garden's yield rows in `hr_farm_yield_perk` are all zero.

Walk-through of the first farm loop against real data (every name read from `src/data/*` and the played screens):

| Step | The player holds and can reach | Doable from that |
|---|---|---|
| 1. Open Farm from the Town menu at Level 1 | 8 Turnip Seed (`start-kit.js`), 2 beds (Camp), 500 gold | yes, played |
| 2. Plant 2 empty plots | 8 seeds, Turnip needs Farming 1, plot tier 1 | yes, 2 presses, played |
| 3. Come back after 4 hours and Tend the field (today: Harvest and replant x2) | 6 seeds left; each harvest gives 2 to 4 Turnip and 336 XP a piece | yes, played; Farming passes 10 on the first harvest (1,154 XP) |
| 4. Improve the soil | 500 gold, Farming 5 or more | yes: the button lit after the harvest; it spends all the starting gold if nothing was hunted |
| 5. Press a Turnip into juice | Turnip in the bag; `press_turnip_juice` is Cooking 1, public bench, under the cheap goods line so no fee | yes by the data rows; not played |
| 6. Put Turnip Juice on the bar in place of Thin Turnip Juice | the starter bar's third slot names the store drink (`START_BAR`) | yes by the data rows; nothing tells the player to |

### 7. Curing slots

RULED 11-18: a gold sink, no XP, the skill still required. The plan (`docs/design/itemization-plan.md` section 5) has slots at 100,000 / 250,000 / 500,000, a fee of about a tenth of the item's reference value, and the same time as the bench. Three problems with those numbers:

- **At bench time a slot sells nothing.** A lining is one job of a few seconds and a tier's salts about an hour. The heroes it frees are idle 59% of their lives. What a slot can really sell is that no hero has to leave its node, walk to a bench and be sent back: presses, for the player whose visit is four minutes.
- **850,000 for all three is 0.75 weeks of an Own four's free gold at Level 50**, an errand by 24's rule, and three slots at bench time are the same as one.
- **A fee of a tenth of a lining** is about 1,500 gold a cure and 22,000 a week for an Own four, at the line 24 calls invisible.

PROPOSED (ruling 7, re-price after 23):

| Dial | Value | Why |
|---|---|---|
| Where | The Cellar's rungs: rung 1 the first slot, rung 3 the second, rung 5 the third; rungs 2 and 4 are furniture and a shorter cure | curing gets a room, the Cellar gets a purpose |
| Slot prices | 250,000 / 750,000 / 2,000,000 | 0.2, 0.7 and 1.8 weeks of an Own four's free gold at Level 50 to 80 (1.3, 3.9 and 10 at its 17%). The first is an easy yes, the second a choice, the third the Buyer's and the Heavy four's |
| Cure time | 4 hours a lining, 8 hours a rung's salts, on the server clock | so slots are capacity. An Own four uses about 15 linings a week (60 slot-hours of 168): one slot. The Heavy four about 39 (156 hours): one slot is full and salts need the second. The Ceiling about 112: three slots and it still benches |
| Fee | a quarter of the lining's gold cost, about 3,700 at Level 50 | 55,000 a week for an Own four, 144,000 for the Heavy four: a repeating sink both can see, and the game has almost none (24) |
| XP, skill | none; the recipe's level is required | RULED |
| Stacking | Capacity class: no room speed, no Good batch, no saved materials | question 3 |

So the Buyer gets time back (three slots make every lining and salt with no hero in town) and the Own four still chooses (one slot, and its Crafting hero still benches for XP). The pay-to-win line holds: a slot makes nothing a hero at the bench cannot make.

### 8. Training

`node tools/balance-program/home.mjs training` (READ FROM DATA); `measure.mjs what --at <point> --seat <seat> --patch '{"skillBump":10}'` (MEASURED, 2 seeds x 1 h; **re-measure after 21**).

| Skill level | Yard fee an hour today | XP to the next level | Yard hours a level | Levels in a 12 h session | Dummy's first skill (150,000) pays back after | All four (1,400,000) |
|---|---|---|---|---|---|---|
| 10 | 110 | 2,134 | 0.1 | 21.5 | 1,364 yard hours | 12,727 |
| 30 | 230 | 42,101 | 1.4 | 6.4 | 652 | 6,087 |
| 45 | 320 | 170,601 | 5.7 | 2.0 | 469 | 4,375 |
| 60 | 410 | 546,211 | 18.2 | 0.7 | 366 | 3,415 |
| 80 | 530 | 2,127,673 | 70.9 | 0.2 | 283 | 2,642 |
| 110 | 710 | 13,046,998 | 434.9 | 0.03 | 211 | 1,972 |

| +10 main skill and Defense, MEASURED today | Level XP | Damage taken |
|---|---|---|
| glade 30, lone | x1.042 | x0.640 |
| glade 30, four on Deadly | x1.069 | x0.416 |
| slake 60, lone | x1.035 | x0.761 |
| slake 60, four | x1.076 | x0.592 |
| hold 105, lone | x1.022 | x0.998 |
| hold 105, four | x1.033 | x0.945 |

- **The flat rate caps itself, and that is the good part.** 30,000 XP an hour against a curve that multiplies by 1.06 to 1.10 a level (READ FROM DATA, `skillXpForLevel`) buys 6 levels a night at 30 and a thirtieth of a level at 110. So the yard is a catch-up: it lifts a skill that is behind (a hero that changed weapon, which 4 of 12 real heroes did; a back row with Defense 13 to 30) and does nothing for a skill on its line. That is a purpose worth keeping.
- **The price is the broken part.** +10 skills at 30 is about 25 yard hours and 6,600 gold for +4% XP and a third less damage taken: 0.15 lone REF hours of gold a 1% of XP, against Tempering's 1 to 24 (24's `--offers`). By 24's third rule it is mispriced by ten times. The real brake today is that nobody knows it is there: 0 gold has ever been paid at the yard, and the dummy has 5 sessions from one person.
- **The dummy never pays for itself.** RULED 11-08: "wildly expensive ... the long term benefit is that you don't have to pay per hour". At 230 to 710 gold an hour the fee it saves is nothing, so its 150,000 to 600,000 rungs buy what the yard already gives.
- **What an hour of yard gold should buy (PROPOSED, ruling 5): fee = 100 gold x the trained skill's level.**

| Skill | Fee an hour | In lone REF hours of gold | Gold a level | +10 levels | Dummy's first skill pays back after |
|---|---|---|---|---|---|
| 30 | 3,000 | 0.28 | 4,200 | about 80,000 for +4% XP: 1.8 REF hours a 1%, inside Tempering's band at its cheap end | 50 training hours |
| 60 | 6,000 | 0.48 | 109,000 | about 1.9M: nobody pays it, the dummy is the way | 25 hours |
| 110 | 11,000 | 0.51 | 4.8M | not a purchase | 14 hours |

  A night of 8 hours for one hero is 24,000 to 48,000 gold, 15 to 30% of an Own four's daily free gold: a repeating sink it can see and a choice of which hero trains. The dummy's first skill is then back in a week of nights and all four in about a month on its one seat, which is what the ruling describes. The Defense half of every number here moves with the combat dive's to-hit change (RULED 11-18: +10 Defense for 12 yard hours cutting damage 30 to 59% is "definitely NOT" intended): **re-measure after 21** before the fee is set.
- **Server cost before it gets popular.** A training session is a hunt session on a dummy ground, settled by the combat engine every 10 seconds, to pay hours x 30,000. ASSUMED at a lone hunt's cost (it was not measured): `measure.mjs cost --add statements=5,ledger=48,writes=28 --share 0.25` reads OVER THE ALLOWANCE and the ledger prune OUTRUN at 1,000 online. Idle hero time is 3.7 times hunted time, so a yard worth using could cost more than hunting does. It has no dice: pay it in closed form at start, at each paid hour and at stop. Handed to the platform dive.

### 9. Crowns training items: the conflict, laid out for the Coordinator

| | |
|---|---|
| RULED 2026-11-14 | "we can offer a training weapon option in the crowns store ... a bit pay to win but i dont really care. tibia has gotten away with it forever." Same day: "store bought items other than crowns are non tradable". The design (250,000 / 450,000 gold, 30,000 XP an hour, 60,000 with an item, bound Crowns copies) was accepted as "a good start", with a train-every-spare-hour career run owed before it ships |
| RULED 2026-11-18, newer | Tyler's words: "I don't want to cripple people so that the only way they can progress is by paying to win, however, I do want whales to pay for gold so they can have an 'edge'." The line of record written from it: gold sinks are where bought gold becomes an edge; "never sell power directly for Crowns (it reaches power only through player trade for gold)" |
| The designer's standing directive | no paid XP boosts |
| What is built | Eight gold items (tradable) and eight bound Crowns copies in `src/data/training.js`; `training_gear` is armed for gold. Real use: 0 bought, 0 Crowns in any purse |
| What the item is | +30,000 skill XP an hour for 12 or 24 hours of training: 8 skill levels at 30, 0.7 to 1.3 at 60, 0.03 to 0.06 at 110. Skill XP only, never Level XP |
| Where the two rulings agree | Nobody is crippled: the yard is open to all and the same item sells for gold |
| Where they collide | A Crowns copy is skill XP for money with no player trade in between, which is the one thing the 11-18 line of record forbids by name, and a paid XP boost by the directive. CLAUDE.md §0 says the newer ruling wins, but the forbidding sentence is the record's summary, not Tyler's quoted words |
| Ways out | (a) gold only: Crowns reach it through gold, as 11-18 says; (b) sell the bound Crowns copy as ruled on 11-14 and amend the 11-18 line to name the exception; (c) hold both until the fee and to-hit changes land and the owed career run is done |
| A fact for whoever settles it | For gold the item is 0.63 to 0.69 gold a skill XP against 0.014 at today's yard: fifty times the price of training twelve more hours, for heroes with fourteen idle hours a day. At today's fee it is worth nothing to anyone with time, and its only buyer is someone with money and no hours |

### 10. A home a player shows off, and what a veteran still buys at month 6

Today nobody else can see a House, every tier is the same cottage, the wall is empty, and the Heavy four can pay for all of it (10.88M, about 6 weeks of its free gold) well before month 6. What is already right: each rung puts a real piece of furniture in the room, so a full House looks lived in.

| What | Why a veteran wants it | Built from |
|---|---|---|
| A look for each property (four more maps) | the Castle should read as a castle from a screenshot; "3 of 15 properties (gold, looks only)" was the EA housing ruling (10-14) | art lane; one row a map in `HOUSE_TEMPLATES` |
| The Trophy wall with real things on it | a place for the Rat King's Crown instead of the Shop's 4,000 gold; a reason to keep a unique | question 4 |
| Visiting (ruling 11) | the shared world is towns and parties; a party member walks into your hall and sees the wall | the `home` section read once for another account on request; no poll; inside the allowance |
| Depot chests 5 to 8 and the third curing slot | capacity a hoarder and a heavy crafter feel | questions 5 and 7 |
| The fifth rungs as status pieces | the statue, the swords on the wall: priced above a band's gold on purpose (RULED 11-18), honest about being furniture | as built, with ruling 1 |

Month 6 for a veteran is then: the Castle and its look, a wall to fill from drops that take 60 to 140 hours each, the last chests and slot. For a New player on an old server nothing in the House is contended or ranked, so there is no catch-up to offer and none needed.

## The cards

Each answer carries its label. "24" is the economy dive's gold model. "Played" means `home-play.mjs` on a private local world as a brand-new account, plus the first minutes in the browser pane.

### house — The House: the property ladder — FIX

| # | Answer |
|---|---|
| 1 Purpose | The account's long gold sink and the gate for rooms, beds and chests. The decision it gives is none for four tiers (52,900 gold) and one at the Castle. Hour 100: bought through the Keep. Hour 1,000: the Castle, then nothing. READ FROM DATA, REAL |
| 2 First principle | Bought once, nothing repeated. Materials are taken from the bag, then Storage (RULED 10-24). No presses to flag |
| 3 Ledgers | Gold sink, one-time: 2,552,900. Items sink: logs, ore, planks, bars, fittings, 10 Gatekeeper's Chains (7,800 at the Shop bid for the Castle). Converter: gold to capacity (2 beds a tier). READ FROM DATA |
| 4 Power budget | No power. Time class. No lever at 240 or 400: the ladder ends at Level 105's content. A finding: nothing past Krell |
| 5 Seven players | Question 1's table. Own four: four tiers in a day, the Castle 2.2 weeks of free gold (12.8 at 17%). New: Homestead needs 400 of its 500 starting gold plus 20 ore and 30 logs. Buyer: day one, and it gets nothing the Heavy four cannot earn. Real: 11 buys, 3 people, 10 days since the last |
| 6 Server cost | One `hr_unlock_buy` and one ledger row a purchase. The `home` section rides the state read; its cost a read was not measured. Inside the allowance |
| 7 Population | Works alone at 10. Nothing contended at 1,000 or 10,000: one home an account |
| 8 Server age | Feeds no inflation and takes 2.55M out once. A newcomer meets the same ladder. A veteran has nothing left after the Castle |
| 9 Exploits | Price and gate are the server's offer rows. Rooms and properties are the account's highest over its heroes, filed on the hero who paid (`hr_unlock_levels`): when a single-hero delete is built, those rows must stay with the account. OPEN for the EA list. No other finding |
| 10 Teaching | Level 1, the Town menu's House, or the Home tab. The deed reads "Hearthside Homestead. Opens the Garden, the Kitchen. 400 gp, Copper Ore 20 (none in bag or Storage), Gathered with Mining." Rooms read "Opens with the Hearthside Homestead" and never say what a room does until it is built. The deed never says a tier adds two beds. Dead moment: "why would I buy this" |
| 11 Content throughput | A tier is a map (art) and a row. The Heavy four finishes the ladder in its first month. Four maps would be the first property content since the cottage |
| 12 Monetization | Gold only. The Buyer gets the Castle on day one and saves 119 lone REF hours; it is looks and beds, no power |
| 13 Telemetry | Ledger rows of `property.*` by tier and account age. Target: each tier bought by half the accounts that reach its Level within two weeks. Red: a tier nobody buys for 14 days, or the Castle owned by nobody at month 3 |

Fun: buying the Homestead in the first session is a good moment and the scene gains signposts. After that the ladder is invisible. Rulings: one home an account (10-15) COMPLIES. Housing at EA "3 of 15 properties (gold, looks only)" (10-14) BREAKS: one look. "The House" as a sink above a band's gold (11-18) COMPLIES at the Castle only.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Re-space the ladder to 400 / 25,000 / 150,000 / 600,000 / 2,500,000; a map a tier; the deed says the beds and what each room does before it is built | house | gold +722,500 an account | M (art) | data rows only | first-week and long-chase | question 1; played deed |

### The eight rooms

| # | Kitchen — FIX | Garden — KEEP | Workshop — FIX | Cellar — MERGE | Forge — FIX | Library — FIX | Shrine — CUT | Trophy — FIX |
|---|---|---|---|---|---|---|---|---|
| 1 Purpose | Ends the cooking fee and burnt fish. The first rung is a real buy; the speed rungs solve nothing | More beds for the one town system everyone uses. A decision at every rung | Ends the crafting fee; saved materials is the right idea at 1% | Longer buffs from food eaten by hand. No problem solved | Ends the smithing fee | Ends the rune fee | Faster fuelling of a fire lit 3 times | A wall for trophies that do not exist |
| 2 First principle | none repeated | each bed adds 2 presses a visit (farming card) | none | the buffs it extends are eaten by hand, a hero at a time | none | none | none | none |
| 3 Ledgers | gold sink 1.2M; gold to town hours (243 g an hour a rung); ends 1,739 g an hour of fee | gold sink 672,100; gold to capacity | gold sink 1.485M; 184 g an hour a rung | gold sink 787,200; nothing else | gold sink 1.485M; 389 g an hour a rung | gold sink 1.33M; 193 g an hour a rung | gold sink 672,400 | gold sink 695,000 |
| 4 Power budget | none; Time class; cap 0.20 a key | none; 5 beds | none | hunts read the buff queue, so it doubles minutes of 1 to 5% buffs: an Add lever nobody budgeted, size near zero | none | none | none | none |
| 5 Seven players | rung 1 is 0.07 weeks of an Own four at 30, 0.27 of a lone hero; rungs 2 to 5 never pay back. Real: 3 accounts | rungs 1 to 3 pay back in 5 to 30 days; rung 5 is 0.5 weeks of an Own four, 3 at 17%. Real: 3 accounts | rung 1 0.12 weeks; rest never | every player: never | as the Workshop | rung 1 0.1 weeks; rest never | never | never; two real accounts paid 95,000 each for nothing |
| 6 Server cost | perk read with the bench's accrual, no new statement | `hr_farm_plot_cap` reads the rung | as Kitchen | one read in `hr_apply` when a hero eats | as Kitchen | as Kitchen | as Kitchen | none |
| 7 Population | per account at every size | same | same | same | same | same | same | no visitor can see it at any size |
| 8 Server age | nothing inflates; veteran done at rung 5 | veteran wants rung 5 for Farming 99 | as Kitchen | nothing | as Kitchen | as Kitchen | nothing | a veteran would fill a real wall for months |
| 9 Exploits | perk magnitudes come from the server's table, the client names only a room (`perks.js`) | bed cap is server-side | saved materials is a seeded roll | none | none | none | none | none; when mounts hold items, a mount must not duplicate one: OPEN at build |
| 10 Teaching | the work window says "Free with a Kitchen at home"; the House row does not say the fee ends | signpost opens the Farm; row says "1 more shared farm bed" | as Kitchen | row says "food and drink effects last 20% longer" and nothing says which food | as Kitchen | as Kitchen | row says "fueling the Great Hearth 2% faster" to players who have not met the Hearth | sells mounts; the scene says "Trophy wall: empty for now" |
| 11 Throughput | a rung is a data row and a furniture piece | same | same | same | same | same | same | a mountable thing is any rare row: content already made |
| 12 Monetization | gold; no power | gold | gold | gold | gold | gold | gold | gold; a wall is the best thing bought gold can buy that is not power |
| 13 Telemetry | bench fee rows falling to 0 for cooking after a buy; rung 2+ buys | beds planted over beds owned, target over 80% | as Kitchen | none worth keeping | as Kitchen | as Kitchen | none | mounts filled over mounts owned; red at 0 |

Fun, shared: a rung that drops a hearth or an anvil into the room is a small pleasure; a rung that says "+2%" is not. Rulings: "ONE PURPOSE PER ROOM" (designer 10-22) COMPLIES; "a home never grants XP or a resource advantage" COMPLIES except the Cellar doubling an all-XP food buff, OPEN; bench rooms "WAY more expensive" (11-01) COMPLIES.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Rungs 2 to 5 of the four bench rooms give saved materials (2/4/6/8%), not speed; the House row for rung 1 says "No bench fee" | room-kitchen, room-workshop, room-forge, room-library, room-perks | town hours, items | M | perk rows regenerated; the engine reads `craftSave` at one bench today | long-chase | question 2: 16 speed rungs never pay back; 3 gathering hours a bench hour |
| The Cellar's rungs become the curing slots; `buffDuration` is cut | room-cellar, curing | gold, town hours | M | yes, with curing | long-chase | question 4, 7 |
| Cut the Shrine's rungs | room-shrine | gold -672,400 of shelf | S | offer rows | none lost | 16 recorded hours of the skill |
| Trophy room off sale now; rebuilt as mounts for real items | room-trophy | gold, items | S then M | hide: data; build: a mounts table and the projection | hide: stops a spend on nothing; build: long-chase | `world-boot.js:119`; 4 of 6 Trophies sold |

### room-perks — The room rung engine — FIX

| # | Answer |
|---|---|
| 1 Purpose | The one channel that turns a bought rung into a number the server pays (`perks.js`, `hr_room_perks`, `hr_perks_of`). It is sound engineering selling the wrong thing: 20 of its 40 rows are 2% of speed |
| 2 First principle | nothing repeated |
| 3 Ledgers | Gold sink 8,326,700 in all (5,950,000 in the fifth rungs). Converter: gold to town hours, at 184 to 389 gold an hour of bench for 110,000 to 900,000 gold |
| 4 Power budget | No power. Speed keys capped 0.20 each, the job fused at 0.70 with tools. Question 3: the cap exists, the rule was never said, and it compounds. Nothing grows with Level |
| 5 Seven players | Rungs 1 to 4 are 2.1 weeks of an Own four's free gold at 50 (12 at 17%), 1.0 of the Heavy four's; the fifth rungs 5.2 and 3.3. Real: 65 buys, 2 people, 3 days since the last. The saver with 2.09M has not bought them |
| 6 Server cost | The perk state is read with each bench or gathering accrual; no statement on the hunt settle. Inside the allowance |
| 7 Population | per account |
| 8 Server age | takes gold out once; a veteran is done when the rows run out, and the Heavy four can afford every row by about week 6 |
| 9 Exploits | A forged perk state can name a room and never a number (`normalisePerkState`). No finding |
| 10 Teaching | The House window, per room, once built: "Kitchen, 2 of 5: cooking 4% faster, 19% less burnt food. Next: ...". Before a room is built the row says only which property opens it |
| 11 Throughput | 40 rows hand-written; a new room is a row set, a perk key and five furniture pieces |
| 12 Monetization | gold; no power; the Buyer buys all 40 on day one and gets hours, not strength |
| 13 Telemetry | rungs bought by rung number; target: rung 2 bought by half of those who own rung 1. Red: a room whose rung 2 nobody buys in a month |

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| A rung sells capacity, saved materials or a thing to show, never speed; publish the three-class bench rule | room-perks and the eight rooms | town hours | M | perk rows, `pacing.js` cap | long-chase | questions 2 and 3 |

### benches — House benches and the public bench tax — KEEP

| # | Answer |
|---|---|
| 1 Purpose | A public bench takes 15% of what a job's output sells for at the Shop; the room's first rung ends it (RULED 11-01). It gives the House its one honest first buy. Still true at hour 1,000 for a crafter |
| 2 First principle | charged as the job runs; nothing to press |
| 3 Ledgers | Gold sink, repeating: 0 for cheap goods, 1,272 to 3,375 gold a bench hour on the recipes real players run (READ FROM DATA, `home.mjs benches`). Real: 13,705 gold, 2,044 uses, 3 people. 24 books it at 924 gold a week for an Own four until a room |
| 4 Power budget | none |
| 5 Seven players | New: pays nothing under the cheap goods line (shrimp, planks, copper). Own four: about 1,000 a week until the Kitchen. Heavy four: owns the rooms. Buyer: buys supplies, pays no fee. Nobody is walled |
| 6 Server cost | exact in milligold with a carry on the hero; one ledger row a whole gold. Inside the allowance (not measured here) |
| 7 Population | per hero |
| 8 Server age | a small steady sink for newcomers; veterans are out of it |
| 9 Exploits | fee rows are the server's; rolled jobs pay none (RULED 11-05); the cheap goods line is guarded by `tests/craft-wages.mjs` W-TAX. No finding |
| 10 Teaching | The skill's start screen: "Bench fee: 15% of output at shop prices. Free with a Kitchen at home." Good. The House row does not say it back |
| 11 Throughput | none: a row a skill |
| 12 Monetization | none |
| 13 Telemetry | `bench_tax` ledger gold a week; target: falls to 0 for an account within two weeks of reaching Level 30. Red: an account at Level 50 still paying it |

Rulings: work bench tax and dearer House benches (11-01) COMPLIES. No change row.

### storage — Storage: chests, the depot, bag rungs — FIX

| # | Answer |
|---|---|
| 1 Purpose | The only item path between a player's own heroes (RULED 10-23), and the account's shelf. The decision today is none: buy four chests, then stop |
| 2 First principle | "Dispatch loot" and "Deposit all materials" are one press each and benches read Storage. Repeated by hand: taking stock out for the hero that uses it (812 real withdraws), a press an item, a hero at a time |
| 3 Ledgers | Gold sink: 122,500 for the depot; 38.8M a hero for the bag ladder (real: 40,217). A Storage move is a transfer |
| 4 Power budget | none |
| 5 Seven players | Own four: all four chests in 0.2 weeks at Level 30. New: the first chest is 1,500 gold and 40 logs, three times its purse. Buyer: nothing more to buy at 300 stacks. Real: 1 person bought chests and rungs; deposits by 2 people, 0 days since the last |
| 6 Server cost | a move is one RPC; `hr_bank_move_many` batches. The `depot` section rides the state read. Inside the allowance |
| 7 Population | per account; nothing shared |
| 8 Server age | space pressure grows with item ids (733 today, more with every rolled jewel); Salvage and loot rules relieve it for free |
| 9 Exploits | account-scoped; alt accounts cannot reach it. Bound Crowns items and keys may pass between one account's heroes through it (RULED 11-14). The bag fuse is server-side (`bag_full`). No finding |
| 10 Teaching | Storage window at Level 1: "In storage 0 of 100 stacks. In bag 12 of 100 stacks. More room: build storage chests in the House. Next: Millrace Crate (+20 stacks). Expand (+20) for 3,000 gp." Clear. The bag rung sits inside the Storage window, which is why the inventory read it as Storage's |
| 11 Throughput | a chest is a row |
| 12 Monetization | gold; convenience, no power |
| 13 Telemetry | stacks used over cap, by account; `bag_full` refusals a day. Red: any account at 100% of the depot with the last chest built |

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Bag ladder stops at 10 rungs a hero; depot chests 5 to 8 behind the Keep and Castle | storage, house | gold: -38.7M a hero of unreachable shelf, +3.75M of reachable | S | catalogue rows | long-chase | question 5 |

### farming — Farming — FIX

| # | Answer |
|---|---|
| 1 Purpose | Turns a twice-a-day visit into the account's mana drinks and a 99 skill. The decision: which crop for the hours you will be away, gold or XP (moonbloom loses 545 gold a bed a day for the most XP). Plugs into Cooking (one crop, one drink) and the action bar. Useful at hour 1,000: Farming 99 is 13.0M XP, about 75 to 95 days for a twice-a-day player (CITED `gathering.js`) |
| 2 First principle | Remembered: the crop, the seed purchase, planting all empty beds. Repeated: harvest a bed, water a bed. 2N presses a visit, serial: 24 at 12 beds, 34 at 17. For four heroes it is the same field, so it is not multiplied by four; only one hero gets the XP |
| 3 Ledgers | Items source: 1.5 to 4 crops a harvest. Skill XP source: 2,016 to 10,710 a bed a day. Gold sink: seeds 5 to 800, plot tiers 130,500 in all. Converter: town time and attention to drinks worth 70 to 412 gold a bed a day at the store's price. Real: 599 plants, 1,361 waters, 706 harvests, plot upgrades 293,000 gold, replant seeds 15,995 |
| 4 Power budget | none directly. Drinks are supplies. Past Level 105 the best drink is the Emberfruit Cordial (648 mana); nothing grows after it. A finding for 23: the crop ladder ends at Farming 88 and the drink ladder at 75 |
| 5 Seven players | New: 2 beds, 8 seeds, plays in the first minute; the plot tier takes its last 500 gold. Own four: the system built for it, two visits a day. Heavy four: six visits make 4 to 8 hour crops worth it. Ceiling: no town hours needed, the field is the account's. Buyer: buys drinks, skips it. Four friends: one field each. Real: all 4 people, 0 days since the last |
| 6 Server cost | Wall-clock and derived, no cron, no settle statement. A press is one RPC and one or two ledger rows: about 70 RPCs and 100 ledger rows a day for a 17-bed account. `measure.mjs cost --add statements=0,ledger=1,writes=1` reads inside the allowance. Tend cuts it to 2 RPCs a day |
| 7 Population | per account at every size |
| 8 Server age | a small item source with its own consumer; veterans chase 99; a newcomer loses nothing |
| 9 Exploits | growth can never pass twice real time whatever the waterings hold; 8 waterings a planting; the yield roll is seeded on the plant, so who harvests cannot re-roll it; the day budget covers harvest XP; seeds are bought at the server's price. Four heroes can funnel all Farming XP to one, which is allowed. No open finding |
| 10 Teaching | Level 1, the Town menu or the Garden's signpost. "Room for 2 plots. Shared land: each hero keeps their own crop and Farming XP." The picker says hours and the Farming level, never what a crop is for. After a harvest nothing points at the Kitchen. Dead moment: "I have 4 turnips. Why?" |
| 11 Throughput | a crop is a row, a seed row, a drink recipe and three icons. Nine crops last a twice-a-day player about three months |
| 12 Monetization | none. Premium gives nothing here |
| 13 Telemetry | harvests a day an account with beds; `farm_*` refusals. Target: accounts past Level 10 harvest on 5 days of 7. Red: beds owned and 0 harvests for 2 days (the §3.4 line) |

Fun: the best away-and-return moment in town. Rulings: SHARED FARM (10-23) COMPLIES; Farming in at EA (10-19) COMPLIES.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| "Tend the field": one press for every ready and dry bed, after the seed bill; each seed row names what the crop makes | farming | attention | S | one RPC over the existing per-bed functions | first-week | played: 2N serial presses; 1,361 real waters |

### curing — House curing slots — BUILD (after linings; as the Cellar's rungs)

| # | Answer (not built, so against the design) |
|---|---|
| 1 Purpose | Linings and Tempering salts made without sending a hero to a bench. The problem it can solve is attention, not hours. The decision: how many slots, and which hero still benches for XP |
| 2 First principle | Must remember the last cure a slot ran and offer "Cure again"; "Top up linings" is already one press in the plan |
| 3 Ledgers | Gold sink: slots 3.0M once; fee about 3,700 a cure, 55,000 to 144,000 a week (PROPOSED, re-price after 23). Converter: gold to town hours and presses given back |
| 4 Power budget | Linings are an Add lever of the items dive; curing adds none. Capacity class |
| 5 Seven players | Question 7. Own four one slot, Heavy four two, Buyer three; New never meets it |
| 6 Server cost | A cure is a row with a finish time, read when the House is read: no cron, no settle statement, one ledger row a cure. Inside the allowance |
| 7 Population | per account |
| 8 Server age | a repeating sink that grows with the number of lined heroes |
| 9 Exploits | fee and time from the server clock; a cancelled cure must return materials and never the fee; skill checked on the hero that sets it; one cure a slot. OPEN until built |
| 10 Teaching | first met when the first lining is crafted: the bench's own screen should say "or cure it at home" |
| 11 Throughput | none: it rides the lining and salt recipes |
| 12 Monetization | bought gold buys hours and presses, never an item a bench cannot make |
| 13 Telemetry | cures a week by slot count; slot 2 owners over slot 1 owners. Red: slot 1 owned and 0 cures in a week |

Rulings: HOUSE CURING SLOTS (11-18) COMPLIES in every dial; the prices and times differ from the plan's "Proposed, unmeasured" ones.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Build curing as the Cellar's rungs: 3 slots, 4 h and 8 h cures, fee a quarter of the lining's gold | curing, room-cellar | gold, town hours, attention | M | yes | long-chase; after the items dive's phases 2 and 3 | question 7 |

### training — The yard, the House dummy, training items — FIX

| # | Answer |
|---|---|
| 1 Purpose | Lifts a combat skill that is behind without hunting weak: a changed weapon, a back row's Defense. The decision: which hero gives up a night of gathering for it. Useless at a skill on its line, by the flat rate, which is right |
| 2 First principle | A session ends after 12 hours and the hero idles; real after-hunt plans exist, so a hero's "train when idle" should be one too. Today each night is: open Training, pick skill, Start, per hero |
| 3 Ledgers | Skill XP source: 30,000 an hour, 60,000 with an item. Gold sink: the fee (0 ever paid), the dummy (150,000, once, one person), items (0). Converter: gold and town hours to power |
| 4 Power budget | Add class (`skill-bump` in the model). +10 skills: XP x1.02 to x1.08, damage taken x0.42 to x1.00 (MEASURED above, re-measure after 21). The flat rate makes it zero by Level 110; at 240 and 400 a level costs thousands of hours (FORMULA). No cap needed past the curve itself, once Defense is a fair term |
| 5 Seven players | New: opens at Level 10, fee 110 gold. Own four: 14 idle hours a hero a day and has not used it. Heavy four: the one buyer of a dummy, 13.6 hero-hours. Buyer: the only customer for a 250,000 item. Real: yard 0 uses; dummy 1 buy, 5 sessions, 1 day since the last; items 0 |
| 6 Server cost | A session is a hunt session: ASSUMED 1,800 statements, 10,080 row writes and 48 ledger rows a hero-hour, OVER THE ALLOWANCE (question 8). To the platform dive |
| 7 Population | per hero; the dummy one seat an account |
| 8 Server age | veterans' skills are past its reach; it is a newcomer's and a re-roller's tool, which is the catch-up an old server wants |
| 9 Exploits | no stamina, no deaths (HP floor 50%), so it is a legal AFK loop by design: its price and the curve are the only brakes, and today the price is nothing. Four heroes cannot share the dummy. Items: 10 a day an account. The fee is re-quoted at each hour on the server. Re-check all of it after 21 |
| 10 Teaching | Town menu, Training, visible at Level 1: "Training Yard. Skill XP only, no stamina cost. 56 gold/h. 30,000 Melee XP/h. About 1 hour to Melee 2. Requires Level 10." Two faults: "About 1 hour to Melee 2" is wrong at 30,000 an hour, and a Level 1 player is shown two 250,000 and 450,000 gold items before anything else. Nothing says when training is the right call |
| 11 Throughput | none |
| 12 Monetization | question 9 |
| 13 Telemetry | training hero-hours a day by place; fee gold a week. Target: a tenth of idle hero-hours. Red: 0 yard hours in a week (today's state) |

Rulings: COMBAT TRAINING (11-08) BREAKS on "the long term benefit is that you don't have to pay per hour": the fee is too small to be a benefit. TRAINING flat rate, no stamina (11-14) COMPLIES. Defense training (11-18) BREAKS today, owned by 21. Crowns items: OPEN, question 9.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Fee 100 gold x skill level an hour; dummy prices kept; "train when idle" as a remembered plan; fix the "About 1 hour" line and move the items below the fold | training | gold (a repeating sink of 24,000 to 48,000 a hero-night), skill XP | S | fee rows; plan is M | first-month | question 8 |
| Pay training in closed form, off the combat engine | training | server cost | M | yes | scale | `measure.mjs cost` above |

## For other dives

| To | System | Finding |
|---|---|---|
| 24 economy | storage | The 30 bank rungs are per HERO (the bag), 38.8M each, not "once an account": `hr_unlock_levels` shares only `room` and `property`. The shelf's Storage line is 155M for a four, or 141k a hero if ruling 9 passes |
| 24 economy | training | The yard has never taken a gold piece. With ruling 5 it is the second repeating sink that grows with Level |
| 21 combat | training | Every training value here is on today's to-hit. Re-measure the six `skillBump` rows after the change, the back row's Defense first: hunting pays it 98 to 962 XP an hour and the yard 30,000 |
| 21 combat | inner-flame | The Shrine is cut on the skill's 16 recorded hours. If Inner Flame or Prayer is kept, say what a room for it should do |
| 21 combat, 23 items | food buffs | 27 foods give 1 to 5% for 2 to 15 minutes, only when eaten by hand from the bag, a hero at a time, and a hunt reads them. All-XP food is a town-hours-to-Level-XP converter that no card budgets. The Cellar doubled it |
| 23 items | farming | `roasted_pumpkin` and `carrot_stew` carry a `farm_yield` buff that `hr_farm_harvest` never reads; `hr_farm_yield_perk` garden rows are all 0. Moonbloom has no drink; the drink ladder ends at Farming 75 |
| 23 items | curing | Curing prices and cure times rest on the lining's cost and how many a hero wears. Re-price after linings are sized |
| 23 items | room-perks | If ruling 2 passes, Good batch shares one Yield pool with saved materials, capped at 15% |
| 27 retention | storage | Should the one-tap refill take own stock from Storage before buying? 812 withdraws by hand say yes |
| 27 retention | house, farming | The House never says what a room does before it is built; the farm never says what a crop is for; nothing tells a new player that the turnips in the bag are the juice on the bar |
| 28 platform | training | A training session costs what a hunt costs to pay a constant. Closed form before the yard is made worth using |
| 28 platform | house | Five Home sections (`home`, `depot`, `farm_land`, `bench_tax`, training) ride the state read. Their cost a read was not measured |
| Coordinator | room-trophy | On sale and hangs nothing: a player-visible spend on nothing (CLAUDE.md §3.3 big-bug test: misleads a player into spending). `HELD_HOME_OFFERS` hides it with a data row |
| Coordinator | training | Crowns items: question 9 |
| Inventory | storage, room-trophy, training | Row notes to correct as listed at the top |

## Measured, cited, assumed

| Label | What | Where |
|---|---|---|
| READ FROM DATA | every price, gate, perk, crop, fee and rung; bench output an hour at the Shop bid; payback hours | `node tools/balance-program/home.mjs all` on this branch, from `src/data/homestead-tiers.js`, `shops.js`, `perks.js`, `gold-ladders.js`, `gold-sinks.js`, `training.js`, `bench-tax.js`, `gathering.js`, `supply-basics.js`, `recipes.js`, `src/core/farm.js`, `xp.js`, `pacing.js` |
| MEASURED | +10 skills at glade, slake and hold on both seats; REF hours of every price | `measure.mjs what --at <point> --seat <seat> --patch '{"skillBump":10}'`, 2 seeds x 1 h; `measure.mjs price`, `ref.json` a5e092248 |
| MEASURED | server cost lines | `measure.mjs cost --add statements=5,ledger=48,writes=28 --share 0.25`; `--add statements=0,ledger=1,writes=1` |
| PLAYED | the Level 1 House, Farm, Storage and Training screens word for word; a 2-bed farm visit, 4 presses; the home scene at the Camp | `node tools/balance-program/home-play.mjs` (private headless local world, new account). The upper rungs' screens were not reached: they need materials no new account holds, so their words are read from `src/data/text/house.js` |
| NOT PLAYED | the yard and the dummy in a session (Level 10 gate); a room built; curing (not built); the walk-through's steps 5 and 6 | said beside each |
| REAL | sink totals, uses, people, bench and gathering hours, idle share, visits | `10-real-players.md` sections 4, 6, 7. Past Level 46 it is one person |
| CITED | free gold a week by player and Level, the three price rules, the shelf | `24-economy.md` Q1, `origin/lane/d-balance-economy` d9554e87f |
| CITED | the artisan tool ladder's 25%; Farming 99 in 75 to 95 days | comments in `src/core/pacing.js` and `src/data/gathering.js` |
| RULED | quoted with dates in each card | rulings of record |
| ASSUMED | a training session costs the server what a lone hunt does; linings used a week (two a hero, 12 hunted hours each); the Level at which each tier is met; bench hours split by account | said where used |
| PROPOSED | the eleven rulings, the three-class bench rule, every new price | this file; none is built |
| UNVERIFIED | whether gathering needs a tool for the Homestead's ore and logs; the cost of the Home sections on a state read; whether the hunt prep refill reads Storage (its words name the store only) | to check when built or by the owning dive |
