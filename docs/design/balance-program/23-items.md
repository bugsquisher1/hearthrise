# Balance program 23: Items and crafting

Dive of `lane/d-balance-items` (game-designer, 2026-11-20), cut from `set/v0.2.143` and merged with it again after the endgame, economy, social and home dives landed and Tyler approved their recommended options (2026-11-20, about 16:15 UTC). Where one of those rulings touches a card here it is named as RULED 11-20. Twenty-two systems. Nothing in the game was changed: no code, no data row, no migration. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED. Gold is priced on the economy dive's model (`24-economy.md`, Q1): a hero in an own Deadly four frees 6.6k gold a hunted hour at Level 30, 12.3k at 50, 11.9k at 80, 12.4k at 105; an Own four frees about 1.1M a week and really spends about 190k.

**The tools this dive added** (all under `tools/balance-program/items/`, none writes under `src/`):

| Tool | What it prints | Label of its numbers |
|---|---|---|
| `recipes-table.mjs recipes / families / nodes / to99 / to99chain / crops` | Every one of the 160 bench recipes, 44 gathering nodes and 9 crops: inputs, paced bench seconds, the whole chain's hero-hours a unit, the Shop's bid, the store row it replaces, gold a chain hour both ways, hours to 99 | READ FROM DATA |
| `drops-table.mjs inputs / grounds / orphans / sinks` | Where every dropped recipe input comes from on an open ground, each ground's rows by band and tier, drops that sit only on monsters no open ground places, and what uses each dropped item | READ FROM DATA |
| `pool.mjs` | The Add pool at four points on two seats, one patch file a point, through `measure.mjs what` | MEASURED |
| `play-items.mjs --out <dir>` | A new account on a private headless world: the Cellar, the Thicket, back to town, every window's words | PLAYED |

**What I played** (`node tools/balance-program/items/play-items.mjs`, a fresh account, 2 h 15 min of hunting skipped on the real engine, read as page text): the Mill Cellar to Level 5, the Thicket to Level 7. Back in town the bag read "40 of 100 spaces", "Worth: 2,557 gp", "Gold: 2,460 gp", and beside the Dispatch button "No loot plans set". A piece's menu is Equip / Sell now / List on market / Lock: selling never offers "always sell these". The bag did offer "Upgrade: Bronze Helm (+3 Defense), Bronze Platebody (+6 Defense) and 2 more pieces" with one Equip upgrades button, which is good. The Cooking bench listed "Cook Wolf Meat ... Makes up to 141" with "Bench fee: about 1.8 gold a craft · 253 gold for all 141 (10% of your gold)". Not played: a jewelry roll, a Hallmark, a Tempering rung, anything past Level 7. Those are judged from their tables.

**The inventory needs these rows changed** (the shared block asks for this at the top):

1. `patterns` is **dark**, not live: `src/data/patterns.js` `PATTERN_LINE.live` is false and one pattern exists.
2. **Food buffs are a lever in no class.** 27 foods carry a timed buff (`src/data/items.js`): All XP +2 to +5% on six of them, Combat XP +4%, damage +2 to +5%, Defense +3 to +5%, drop rate on four. They are not in `model.mjs` LEVERS. CITED `26-home.md`: a hunt reads them, and only when the food is eaten by hand from the bag, a hero at a time. So an All XP food is a multiply lever bought with town hours, and four heroes eating by hand every few minutes is the first principle broken. It needs a registry row or a line in `cooking`.
3. **Inner Flame's 17 fuels are a recipe family on the bench engine** (`ARTISAN_RECIPES.inner_flame`). `domain.mjs items` prints 18 families; with fuels and with the rolled jewelry jobs split from `smithing/plain` my sheet has 20. I cover all 20 below.

---

## Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 5 | gathering, smithing, runecrafting, artisan-engine, bag-equipment |
| FIX | 8 | items-catalogue, gear-tiers, loot, tempering, jewelry, trophies, cooking, crafting |
| MERGE | 2 | worn-in (into Tempering past tier 7), linings (the old imbuement rows become its parts) |
| BUILD | 3 | salvage, luck, crafting-chase (good batch first) |
| HOLD | 3 | uniques (sample of five first), commissions, patterns |
| CUT | 1 | lucky-finds (the 24 orphan rows; the four Hearthfinds wait) |

### The five changes that matter most

| # | Change | Why (evidence) | Size |
|---|---|---|---|
| 1 | **The loot plan is set by KIND, once an account, and runs by itself.** Four lines cover everything: gear I'm not wearing, junk, materials, supplies. Each is Keep / Deposit / Sell / Salvage. Per-item lines stay as overrides. Dispatch runs when a hero comes back to town if the after-hunt plan says so. The first Sell now a player ever presses asks once: "Always sell gear you can't use?" (The end card's "Sell junk for N gp" and its "always sell these" were approved today with the economy dive, RULED 11-20. This is the shape of the rule behind that button, so it is set once and not once an item a hero.) | REAL: 14,792 pieces sold by hand, loot rules on 2 of 5 accounts, 1,406 rule rows on those two (one row an item, so every new tier is new decisions), 4,930 pieces sitting in bags against 139 worn. PLAYED: "No loot plans set", and Sell now offers no rule. For the Own four this is paid four times a visit | M, server (one rule table keyed by kind and account) and client |
| 2 | **Gear stops being shop gold by a hand dial.** Standard gear's Shop price comes from ONE rule (a tier's gear is worth a fixed share of that tier's coin), and Salvage is built as the fourth destination so the 99% a hero never wears is stock and Luck by choice | READ FROM DATA: `VENDOR_GEAR_RATES` is seven hand-set numbers, 0.5 / 0.5 / 0.14 / 0.075 / 0.033 / 0.015 / 0.007 of book, one fitted a tier by re-measuring each new ground. That is the "difficulty re-balancing" sign Tyler named: every new tier needs a new fit. REAL: gear is 26 to 29 pieces a hero-hour, 86% sold, 0.9% worn, 16 to 34% of income | M, data and the Luck build already in flight |
| 3 | **Tempering pays the difference when a hero moves up a tier**, the way jewel reforging already does (RULED 11-18), instead of starting from nothing | READ FROM DATA: both tracks cost 124k / 434k / 496k / 744k / 992k / 2.48M a hero at tiers 2 to 7, 5.27M a hero and 21M an account. MEASURED: they give +1.2 to +2.9% XP. REAL pace: tier 3 lasts about 33 hunted hours and its ladder costs 66 hours of that hero's free gold, so every ladder under tier 6 is outgrown before it is paid for. One real person has ever bought it. This overturns Tyler's 11-18 "Sure" to leaving carry-over out, so it is his to rule | S, data and one RPC |
| 4 | **Catalogue truth.** 11 recipe inputs have no source on any open ground, so 10 recipes cannot be made (the Keystone, Void Banquet, Cook Panther Meat and seven Inner Flame fuels). 114 items drop only from monsters no open ground places. 69 of the 97 non-gear drops on open grounds have no use but the Shop. 12 feast recipes were made once each | READ FROM DATA: `drops-table.mjs inputs / orphans / sinks`. REAL: meals made once, 19 to 27 days ago. The coherence guard passes because it counts a monster row as a source whether or not a ground places it | M, data only |
| 5 | **Jewelry past Level 30, as a sample of one tier.** Tier 4 ring, earrings and necklace with their gem on Hask's Ford or the Slake, the three unhooked perks (Thrift, Deflect, Second Wind), reforging at the fee difference. Then cloak and belt perks so Crafting has a worn product | READ FROM DATA: 5 of 8 written perks are played, 22 are planned, tiers 2 and 3 only, the Hallmark levels are Smithing 30 and 45. REAL: 89 pieces made by one account, 4 set, 0 fees. MEASURED: plain accessories and spent ammo are already worth +5.3 to +6.6% XP, a whole weapon step, with no perk on them | M, data plus three engine hooks |

### The ten questions

**1. The Add pool.** MEASURED, `node tools/balance-program/items/pool.mjs` (2 seeds x 2 h a row, paired dice, commit of this branch). The first column takes off what the played kit wears beyond the seven dropped slots: two rings, earrings, a necklace, a cloak and the spent ammo (a whetstone or tier arrows), all PLAIN pieces with no perk. A weapon tier is +5 to +9% XP; an armor tier is 13 to 26% less damage early and 5 to 10% late (CITED).

| Point | Seat | Plain accessories and ammo | Tempering 5 of 5, both tracks | +10 main skill and Defense | Accessories + Tempering, over the bare kit | All three, over the bare kit |
|---|---|---|---|---|---|---|
| glade 30 | lone | +6.4% XP, 11% less taken | +1.6%, 0 | +3.1%, 33% less | **+8.1% XP, 9% less** | **+11.5% XP, 44% less** |
| | four | +5.3%, 10% less | +2.0%, 6% less | +7.0%, 58% less | +7.4%, 15% less | +13.8%, 65% less |
| slake 60 | lone | +5.3%, 6% less | +2.6%, 0 | +2.5%, 24% less | +8.0%, 6% less | +9.6%, 29% less |
| | four | +5.3%, 15% less | +2.9%, 9% less | +7.5%, 39% less | +8.3%, 23% less | +16.5%, 54% less |
| pyre 80 | lone | +6.0%, 4% less | +2.8%, 1% less | +1.8%, 7% less | +9.0%, 5% less | +12.2%, 12% less |
| | four | +5.6%, 11% less | +2.6%, 4% less | +2.4%, 17% less | +8.3%, 15% less | +11.5%, 30% less |
| hold 105 | lone | +6.6%, 4% less | +1.2%, 0 | +3.3%, 2% less | +7.9%, 4% less | +12.9%, 8% less |
| | four | +6.0%, 12% less | +1.7%, 2% less | +3.3%, 5% less | +7.8%, 14% less | +11.1%, 17% less |

- **"The pool is worth at most one tier step" cannot hold.** Plain accessories and a whetstone spend the whole step by themselves (+5.3 to +6.6%), before one perk is rolled. With Tempering the gear side sits at +7.4 to +9.0%, exactly the top of one weapon step. Still to come and unbuilt: perks on 12 seats (about 1% each for the five measured), worn in (under half a step), linings. The pool the plan describes is about +20 to +25% XP, three weapon steps (summed from the plan's own sizes, not measured: nothing past these three rows is built).
- **XP adds; damage taken does not.** The three steps together cut more than their sum at every point (Glade four: 65% measured against 53% added). Defense is a to-hit term (audit change 1). +10 skills alone is 58% less damage for a Level 30 four and 5% for a Level 105 one. That lever is not a gear lever at all until the combat dive's to-hit change lands: I take it out of the pool and hand it over.
- **The cap that can hold, PROPOSED:** everything optional a hero wears is worth at most **two weapon steps of XP (+15%) and one armor step of damage taken in an ordinary hunt**, over the bare seven dropped slots of the same tier, split by source so no dive has to re-measure the whole pool for one row:

| Source | XP budget | Today | Rule that keeps it there |
|---|---|---|---|
| Plain accessories and spent ammo (really a Replace lever: a tier of them is one step) | 6% | 5.3 to 6.6% MEASURED | Re-classed from Add to Replace. A new tier of accessories replaces the old, never sums |
| Perks, all 12 seats | 4% | about 1% a perk, five played | A perk counts once a hero (built). A way to fight may have at most five XP-side perks it can use; a new perk at tiers 4 and 6 is a new KIND for another way, or the same kind half again larger, never a sixth for the same hero |
| Tempering | 3% | 1.2 to 2.9% MEASURED | As built. Past tier 7 it is 2 to 2.5% a band (built, shut) |
| Worn in and + skill on gear | 2% | not built | Worn in merges into Tempering past tier 7 (below). + skill on gear waits for the to-hit change |
| Linings | 0 XP. Damage side only: 20 to 30% of ONE element | not built | The shared 40% cap an element (CITED). It is the answer to a ground, not a number that follows the hero |

The reference hero every ground is tuned against wears the first row and nothing else, which is what `played.mjs` already does. Then a fully invested hero is +9% over the hero the game was tuned for, about one weapon step, which is what the one-step rule was reaching for.

**2. Every recipe family.** READ FROM DATA, `node tools/balance-program/items/recipes-table.mjs families` and `recipes`. A chain hour is one hero doing every step from the node, no tool (a tool is up to 35% faster on the gathering half). "Replaced" is the store row the output takes the place of. The model's yardstick: own stock is worth 15k to 46k gold an hour a head (01 section 5), and a hunted hour frees 6.6k to 12.4k.

| # | Family | Recipes | Level range | Source of inputs | Use | Shop gold a chain hour | Store gold replaced a chain hour | Real bench hours | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | cooking/provisions (plain fish, meat, bread, potato) | 19 | 1 to 88 | Fishing, hunts, the farm | Food on the bar | 1.1k to 6.1k for fish | 7k (shrimp), 16k (trout), 48k (lobster), 91k (swordfish), 116k (shark) | 127 of Cooking's 133 | KEEP. This is what crafting is for today |
| 2 | cooking/plain (the six drinks) | 6 | 1 to 72 | The farm only | Mana on the bar | plot-bound | 13 to 315 gold a drink, 3 a crop | counted in Cooking | KEEP. Plot-bound, so it is the home dive's dial |
| 3 | cooking/feasts (12 buff meals) | 12 | 5 to 99 | The farm, two drops | A timed buff and a heal | plot-bound | none: no store partner | 1 of each, once | FIX: cut to four with one job each, or cut the family. See 3 |
| 4 | cooking/castle (Field Rations) | 1 | 22 | Wheat, carrot, cooked wolf meat | The clan castle (dark) | 360 gold a job from 78 gold of inputs | none | 0 | FIX: its Shop bid is 4.6 times its inputs. Bid 25 |
| 5 | smithing/smelting | 10 | 1 to 88 | Mining, coal | Every forge row | 1.3k to 8.3k | none | 90 of Smithing's 117 | KEEP |
| 6 | smithing/tools | 14 | 3 to 92 | Bars, planks | Faster gathering | 1.6k to 8.4k | the Shop sells bronze only | 34 axes, 34 picks | KEEP. The one gear players craft |
| 7 | smithing/whetstones | 7 | 1 to 90 | Bars, ore, coal | Melee's spent ammo | 1k to 21k | none, on purpose (`NO_STORE_PARTNER`: "a whetstone raises melee's ceiling, never its swing") | 14 | KEEP. The one supply only a crafter makes, so the one supply a market would carry first |
| 8 | smithing/tempering (salts) | 5 | 15 to 75 | Ore, bars, one drop each | A Tempering rung | 1.5k to 5.8k | none | under 5 | KEEP |
| 9 | smithing/jewelry (rolled rings and studs, gem jobs) | 9, 3 of them dark | 15 to 30 | 14 bars, a Rare gem | Worn perks | 1.2k to 2.4k | the Shop sells the plain piece at 3,000 and 12,000 | 89 pieces | FIX: nothing past 30 |
| 10 | smithing/plain (the necklace) | 1 | 15 | Bars, fangs, silk | Worn, no perk | 5.3k | 3,000 | 0 | FIX with 9: it ships plain until Deflect has a hook |
| 11 | smithing/weapons (two named reforges) | 2 | 1, 30 | A named drop and bars | Klappa's Klub, the Steelgrate | 2k to 4k | none | under 1 | KEEP. Klappa's Klub is never cut (RULED) |
| 12 | smithing/castle (Iron Fitting) | 1 | 25 | Bars, Bone Chips | The castle (dark) | 2.3k | none | 0 | KEEP the recipe, re-price (below) |
| 13 | crafting/sawmill | 7 | 1 to 88 | Woodcutting | Every Crafting row, House rooms | 1.3k to 7.7k | none | 161 of Crafting's 187 | KEEP |
| 14 | crafting/ammunition | 9 | 5 to 91 | Bars and planks | The bow's spent ammo | 2k to 14k | 2.0k to 2.6k at tiers 1 to 3, 7k / 12k / 32k / 15k at mithril, rune, emberhead, dawnpoint | 7.5 | FIX: tiers 1 to 3 pay a third of a hunted hour. See 3 |
| 15 | crafting/armour (three cloaks) | 3 | 1 to 30 | Pelts, bars | Worn, no perk | drop-bound | none | under 1 | FIX with jewelry: cloaks roll (RULED 11-18) and stop at 30 |
| 16 | crafting/plain (salts packed from planks) | 3 | 45 to 75 | Planks, Grave Dust | A Tempering rung | 3.2k to 3.9k | none | 0 | KEEP: the workbench's road to the same salt |
| 17 | crafting/castle (Timber Beam, Keystone) | 2 | 25, 60 | Planks, Slime Gel; two parts with no source | The castle (dark) | 2.3k, 5.3k | none | 0 | FIX: the Keystone cannot be made |
| 18 | runecrafting/essence (blanks) | 2 | 1, 12 | Mining | Every rune | 0.6k to 1.3k | none | 18.5 | KEEP. Split Blank Runes makes half the blanks of the level 1 row for five times the XP: a real choice (stock or XP) that the row does not say out loud |
| 19 | runecrafting/staff (30 runes, six families x five tiers) | 30 | 1 to 60 | Blanks | A spell's rune | 0 (Chalked), 2.1k to 2.7k | 7.3k (Chalked), 6.7k, 8.5k, 12.0k, 11.9k | 14 | KEEP. The best-balanced family: a chain hour is worth about a hunted hour |
| 20 | inner_flame/fuels | 17 | 1 to 99 | Drops only | Inner Flame XP | none | none | 16, and Prayer 30 with no use in 25 days | Combat's to rule. 7 of 17 fuels have no open source |

**Which recipes nobody has a reason to make** (READ FROM DATA, and REAL where a count exists):
- The 12 feasts: made once each. A meal takes two to five crops and a plain fish heals more for nothing but a fishing hour.
- Bronze Arrows, Coarse Whetstones and Chalked runes are made for your own use and sell for nothing. That is on purpose (the craft-wages guard, W-USE) and fine.
- Iron, Barbed and Steel arrows and Iron Bolts: 2.0k to 2.6k of store gold a chain hour, a third of a hunted hour. A bow hero should buy them and mine something else.
- Cook Herring, Pikeperch, Copper Crab, Silverfin, Goldgill, Frostfin, Moonfish: seven fish with no store row. They are worth making only because the next store rung is dear, and the bench cannot say what they save. Not a cut: a label ("Heals 456. The store's best heals 396 for 693 gp").
- Ten recipes that cannot be made at all (change 4).
- Every gear recipe under tier 4 as an item to sell: the cloaks, studs and signets sell to the Shop for 65 to 168 gold against 3,000 to 12,000 in its window.

**3. Food and drink.** RULED: crafted is cheaper and better. READ FROM DATA: it is, by a margin that grows with tier until the store row is a penalty, not a price.

| Tier | Store row | Store gold a point | Crafted partner | Chain seconds a unit | What a chain hour replaces | Against a hunted hour (free gold) |
|---|---|---|---|---|---|---|
| Food 1 | Salted Shrimp, 72 HP, 14 g | 0.19 | Cooked Shrimp, 96 HP | 9.4 | 7k | 1.3 times at Level 10 |
| Food 2 | Salted Trout, 120 HP, 40 g | 0.33 | Cooked Trout, 168 HP | 12.8 | 16k | 2.4 times at 30 |
| Food 3 | Salted Lobster, 216 HP, 180 g | 0.83 | Cooked Lobster, 300 HP | 18.6 | 48k | 4 times at 50 |
| Food 4 | Salted Swordfish, 288 HP, 432 g | 1.50 | Swordfish Steak, 384 HP | 22.8 | 91k | 7 times at 60 |
| Food 5 | Salted Shark, 396 HP, 693 g | 1.75 | Cooked Shark, 528 HP | 28.8 | 116k | 10 times at 80 |
| Drink 1 to 6 | 10 / 18 / 45 / 80 / 138 / 233 g | 0.14 to 0.49 a mana | Three drinks a crop | bench only | a plot-day is 54 turnip juices down to 6 emberfruit cordials | plot-bound |
| Runes 2 to 5 | 8 / 12 / 28 / 44 g a cast | | 13 / 12 / 10 / 8 a job | 4.3 to 13.3 a rune | 6.7k to 12.0k | 0.6 to 1.0 times |
| Arrows 4 to 7 | 4 / 6 / 9 / 12 g a shot | | 50 a job | 1 to 2.8 a shot | 7k to 32k | 0.6 to 2.6 times |

- **Yes, it pays the attended minutes, everywhere a store row exists.** A job is queued once with a count and resumes after a hunt (RULED 11-15). One hour of shark work is 125 sharks, 66,000 HP of food: three hunted hours of everything a hero in a Deadly four is hit for (REAL: 22,536 damage a hero-hour), before a Healer heals any of it.
- **Food is over-priced at the store past tier 2 and that makes the decision for the player.** The store's gold a point climbs 9 times from shrimp to shark while the crafted chain gets cheaper a point. Nobody with Fishing 76 chooses the store. So at Level 60 and up the food bill is paid only by accounts that have not levelled Fishing, and the "real gold dial" is really a tax on skipping a skill. REAL: food is 12% of the store bill. That is fine as a rule if it is on purpose. If the store bill is meant to be a dial for everyone (the economy dive's question), it has to be runes and drinks, which a chain hour replaces at about par.
- **Runes are the bill** (REAL: 55% of store gold), and they are balanced: a town hour of rune work saves about what a hunted hour frees. A lone Mage on Graven at Level 60 pays 29.6k an hour at the store (MEASURED, ref.json), which is 2.5 chain hours of binding for every hunted hour. REAL players do 1.57 town hours a hunted hour. So a caster's four can supply about two thirds of its runes from its own idle heroes, and that matches the real third-of-supplies figure once food and drink are in.
- **Drinks are plot-bound, not hour-bound.** A crop is three drinks. The farm decides how much mana an account owns. The home dive sizes plots; I only note that drinks are 20% of the store bill and no hero-hour can replace them.
- **The feasts.** 27 foods carry a buff and none says so at the bench. The four drop-rate buffs are cut (RULED, Luck v3.1). I recommend the same for the six All XP and one Combat XP buffs: an XP buff on a food is gold turned into Level XP, which nothing may sell (RULED 11-04). Keep damage, Defense and gathering buffs, sized inside the perk budget (a food's buff is a perk you eat). The farm-yield buff on two foods is read by nothing (CITED 26). Then the feast family is four meals, one a role, each with one job: a meal is a buff a party shares at the start of a hunt, named once in the hunt's prep like any supply, never eaten by hand. That is a decision. Twelve near-identical stews are not. Every late crop keeps a use: Goldenroot and Emberfruit have their drinks, and Moonbloom, which today makes only the All XP Elixir, becomes the seventh drink (the drink ladder stops at Farming 75 today, CITED 26).

**4. The skills to 99.** READ FROM DATA, `recipes-table.mjs to99` (bench hours with stock in hand) and `to99chain` (one account gathering every input, no drop-fed or farmed row).

| Skill | Hours 1 to 30 | to 60 | to 80 | to 99 | What 99 opens | Longest gap between new rows | After 99 today |
|---|---|---|---|---|---|---|---|
| Woodcutting | 3 | 36 | 203 | 1,060 | Duskwood at 90 is the last | 14 levels | Nothing |
| Mining | 2 | 28 | 179 | 1,045 | Dawnstone at 90 | 15 | Nothing |
| Fishing | 3 | 30 | 175 | 1,028 | Moonlit Pool at 90 | 10 | Nothing |
| Cooking | 2 chain (1 bench) | 31 (7) | 171 (38) | 819 (155) | Void Banquet at 99: cannot be made | 10 | Nothing |
| Smithing | 3 (0.3) | 27 (1) | 134 (6) | 534 (29) | Dawnsteel tools at 92 | 10 | Nothing |
| Crafting | 5 (0.4) | 37 (2) | 175 (14) | 853 (86) | Dawnpoint arrows at 91 | 12 | Nothing |
| Runecrafting | 9 (1) | 46 (4) | 184 (13) | 1,073 (66) | **Nothing after 60** | **39 levels** | Nothing |
| Farming (home's) | wall clock | | | 75 to 95 days (the data's own note) | Moonbloom at 88 | 13 | Nothing |
| Inner Flame (combat's) | 3 | 71 | 225 | 451 bench | Void Chitin at 99: no source | 20 | Uncapped by ruling |

- **Every 99 is about 1,000 hero-hours of one job, and they are even.** An Own four has about 140 town hero-hours a week (REAL), so one 99 is seven weeks. All seven are about 3,400 hero-hours, not 7,000, because the mining inside a smith's chain also trains Mining: about six months for an Own four and five for a Heavy four (170 a week). That is a long chase that needs no content from us, and I would not shorten it.
- **Bench skills are input-bound, not time-bound.** Smithing is 29 bench hours and 534 chain hours: 95% of a smith's 99 is mining. That is why REAL bench hours are bars and planks. It is right: it makes ore the currency of Smithing. It also means a market for bars is the fastest road to 99, which is a real use for the market the game does not have yet.
- **Runecrafting stops at 60.** The last rune tier is Graven at 60 and levels 61 to 99 open nothing: 1,027 of its 1,073 chain hours are the same recipe. The data says it is waiting ("Runecrafting above 60 waits on later content", Tyler 10-23, `stonecraft.js`). It is the one skill ladder with nothing new for 39 levels. The Sealing Rune at 75 is the only row planned (CITED, audit). PROPOSED: the Storm and Bone families (RULED 11-18) enter at 65 and 80 instead of at 1, and a sixth rune tier at 90 waits for a spell tier (combat's).
- **After 99: nothing, on every skill.** The maker's mark is RULED (11-18, "The mark") and unbuilt. Good batch (2% at level 1 to 10% at 99) is RULED and unbuilt and is the cheapest thing on this page: it makes every level between two unlocks worth something. BUILD good batch first, the mark with the first region past Krell.

**5. The build order that makes a crafter matter.**

| Order | Build | A Level 60 hero gets | A Level 110 hero gets | Why here |
|---|---|---|---|---|
| 1 | Loot plan by kind + Salvage as Luck only (lane/d-luck-build, dark) | Its unworn gear is rivets or gold by one standing choice | The same | It is in flight, and it fixes the largest real finding |
| 2 | Tempering pays the difference (if ruled) | A ladder bought at tier 4 is not lost at tier 5 | Tier 7's 2.48M is 1.49M for a hero that kept up | One RPC. Turns the largest sink from one person's habit into something a careful player buys |
| 3 | Jewelry tier 4: one ring, earrings, necklace, the gem on the Slake or the Ford, Thrift / Deflect / Second Wind hooked, reforge at the fee difference (150k Hallmark, RULED) | **A Fine or Hallmarked tier 4 set a smith made.** This is the first thing a crafter makes that a Level 60 hero cannot get any other way | Carries up | Sample of one tier (§10). Measured before tier 5 |
| 4 | Good batch | More supplies from the same hour | The same | S, pure data and one roll on the bench stream |
| 5 | Cloak and belt perks (Slip, Stride and the belt's pair) | Crafting's first worn product past 30 | Carries up | Crafting has three cloaks and nothing else worn |
| 6 | Linings for the March's fire, parts from the old imbuement rows | A 12 h fire guard for Pyre Field and Krell | Linings for each Morrow ground's wall | The first RECURRING crafted good. Needs the group-spell damage the combat dive is sizing |
| 7 | Jewelry tiers 5 to 7 and the Lucky ring | | **A tier 7 Hallmarked set and a Lucky ring: 600k fees a piece, real money for the smith who has Smithing 90** | After tier 4 has been played |
| 8 | Worn in, as Tempering's rungs past tier 7 fed by duplicate uniques | | The sink that gives a second unique a use | With the first region past Krell |
| 9 | Maker's mark, weekly orders, commissions | | A named crafter | After a market has had real trades |

**6. Luck v3.1, judged as ruled.** BUILD. The curve, the bound rivet, the one bar and the +104 budget are sound, and I checked the two things a ruling could not: who is the real player, and what else touches a drop.

Hours a hero for one named row, from the plan's measured lives (CITED, plan section 15: the four-in-one-hunt life for both players, since both are own fours). Month 1 and month 6 are hunted hours a hero at each player's REAL hours a day: Own four 100 h and 600 h, Heavy four 250 h and 1,500 h. Magic Find is read off the plan's Luck totals by hours (selling everything / salvaging everything). Past Krell the Rare row is 15% rarer at the Morrow door.

| Player, age | Hours a hero | Magic Find (sell all / salvage all) | A Rare row through Krell, 10 to 20 h base | A Rare row past Krell at the door | A Very Rare row, 60 to 90 h base | The ACCOUNT sees one of that Very Rare row every |
|---|---|---|---|---|---|---|
| Own four, month 1 | 100 | 6 / 14 | 9.4 to 18.9 h / 8.8 to 17.5 h | not there yet (about Level 50) | not there yet | |
| Own four, month 6 | 600 | 11 / 29 | 9.0 to 18.0 / 7.8 to 15.5 | 10.6 to 21.2 / 9.1 to 18.2 | 54 to 81 h / 47 to 70 h | 12 to 20 party hours: 3.5 to 6 days |
| Heavy four, month 1 | 250 | 9 / 20 | 9.2 to 18.3 / 8.3 to 16.7 | 10.8 to 21.6 / 9.8 to 19.6 | 55 to 83 / 50 to 75 | 12.5 to 21 party hours: 1.5 to 2.5 days |
| Heavy four, month 6 | 1,500 | 14 / 41 | 8.8 to 17.5 / 7.1 to 14.2 | 10.3 to 20.6 / 8.3 to 16.7 | 53 to 79 / 43 to 64 | 11 to 20 party hours: 1.3 to 2.4 days |

- **The promise is written a hero and the real player is four heroes.** A Very Rare "every 60 to 90 hours" is one every day and a half for the Heavy four and every four to six days for the Own four, per ground, because an own four puts four hero-hours into every clock hour and a row's pace is counted a hero-hour (REAL: Rare rows land at 1.5 to 2 a HERO-hour on the grounds fours play). That is not "really rare" (Tyler 11-20). It is the same reading that turned "a Rare every 10 to 20 h" into a reveal every 7 minutes on the Warrens (REAL: 1,568 reveals). The ruling's number is fine; the seat it is sized on is the question. See "Tyler rules on" 3.
- **The price that follows** (ASSUMED: there is no market; the Shop's bid is the floor and hours times free gold the ceiling). A Rare through Krell: floor its rivets, 10 to 70, about 150 to 1,000 gold of gear not sold; ceiling 10 to 20 h at 12k, 120k to 250k, and a quarter of that for a four. It will trade near the floor: every account makes them faster than it can wear them. A Very Rare past Krell: at month 1 only Heavy fours make them and one is about 15 party hours x 4 heroes x 12.4k, **0.75M**. By month 6 each account has made 30 to 100 of each and wears four. With nothing that binds and nothing that wears out (RULED), no rivets from it (v3.1) and a Shop bid of 0.7% of book, a Very Rare has **no floor at all**. Its price falls toward nothing as the server ages. Question 9 is the fix.
- **Luck must stay the only drop lever. Everything else that touches a drop rate today** (READ FROM DATA):

| Thing | Where | State | Do |
|---|---|---|---|
| `dropMult` from the Bestiary ladder: `trophyDropMultFor` (up to 1.03), `charmDropMultFor`, `memoryDropMult` (up to 1.07), `relicMult` | `src/core/trophies.js`, `charms.js`, `member.js` | No caller in the server engine | CUT (ruled with v3.1) |
| The Trophy band's `boostMax 1.25` | `src/data/loot-bands.js` | A data promise | Becomes the Trophy ceiling of v3.1 |
| Four foods' `drop_rate` buffs, 1 to 3% | `src/data/items.js` | In the catalogue | CUT (ruled with v3.1) |
| Beast of the day: `dropMult 1.5` daily, `2.0` weekly | `src/core/botd.js` | In the tree. Not checked whether anything calls it | CUT or prove dead. A 2x drop day is the largest drop lever in the repository |
| `featuredMult` | `src/core/drops.js` `effectiveDropChance` | A parameter nobody passes | Remove with the Luck build so the one function has one lever |
| Scaled hunts' `lootPm` | `src/core/drops.js`, `scaled-hunts.js` | Live, paid by the hour | Not a rarity lever: more low-tier rows for a fee. The plan already asks for it to be measured against Luck an hour. Keep the note |
| The Tower's warmth and Stoke | the Hearth Chest | Live | Its own roll, ignores Luck (plan). Keep apart |
| Jewel guarantees (a boss gem fixes a perk or a grade) | `src/data/jewelry.js` | Dark | A bench roll, not a drop. Keep apart |
| Kill speed, tier, party size | the engine | Live | The honest one: every power lever is a drops-an-hour lever. A Deadly four finds 4 times a lone hero's rows a clock hour. This is why the unit in the table above matters |

**7. Linings and the old imbuement rows: one system.** MERGE. The imbuement slot (RULED 10-14: every monster drops one, unique to it, at Uncommon odds) and the lining's "one monster part and gold" (RULED 11-18) are the same item. `src/data/imbuements.js` says so itself: "IMBUING IS NOT BUILT ... its only use TODAY is the vendor". The rows are the lining parts; `kind` on each row becomes the lining it makes. One ground, one wall element, one part; the other imbuement rows on that ground stay Uncommon junk or are cut (`IMBUE_ITEMS` holds 30, all among the 69 Shop-only drops).

A 48 hour socket, priced: the plan sizes 12 hours of one lining at a tenth of what 12 hours of hunting earns there (PROPOSED, unmeasured). So 48 hours is **4.8 REF hours of gold**: about 32k at Level 30, 59k at 50 and at 105 for a hero in a four, 100k for a lone hammer at 105. A hero wants two (a guard in armor, a leech in the weapon; each kind counts once), so linings are a standing 20% of free gold: about 230k a week for an Own four at Krell, more than everything it really spends today (190k). That is the largest repeating sink in the plan after supplies and it is the right kind: it buys an answer to one ground and runs out. Two cautions. It is four heroes x two sockets x a top-up twice a week: the "Top up linings" press must be one press an ACCOUNT, and it should run from the after-hunt plan. And 20 to 30% less of an element only matters if a ground's wall is a real wall: today a Deadly four takes no deaths past Level 65 (REAL). Linings wait for the combat dive's group damage.

**8. Salvage against sell.** Salvaging everything gives up 16 to 38% of income (CITED audit; REAL sold share 16 to 34%). A rivet costs 13 to 15 gold of gear not sold at every tier (CITED plan), so percent n of Magic Find costs about 1,400 x n x n gold.

| When | Right call | Why |
|---|---|---|
| The first five percent, any account | Salvage | 5,500 rivets, about 77k gold, for +5% on every hero for ever. Under a week of an Own four's free gold |
| The account that holds gold it does not want (REAL: 2.09M, spends 17%) | Salvage everything | Its gold buys nothing it values. This is the sink that reaches the player no other sink reaches |
| An account buying Tempering and rooms as fast as it earns (REAL: spends 97%) | Sell | A Deadly four that salvages everything keeps about 5% of its income (CITED plan) |
| Through Krell, for gold | Never worth it | Rares are 0.4% of sold value (CITED). Magic Find 39 adds 0.15% of income |
| Past Krell | Depends on what a unique trades for | Unknown until a market exists |

Does the game say so? The designed screen shows "12 Lucky Rivets" beside "173 gp" and the bar's next cost. It does not show the exchange. PROPOSED, one label on the bar's tooltip: "Next percent: 28,900 rivets, about 415,000 gp of gear." Then the trade is on screen in the unit the player thinks in. And "Salvage all standard gear" has to be a line of the loot plan by kind (change 1), not a switch beside per-item rows.

**9. Item sinks on a 6-month server.** Nothing binds and nothing wears out (RULED). Where a tier 3 piece goes:

| Road | Today | With the plan | Floor it puts under the price |
|---|---|---|---|
| The Shop | 86% of all gear (REAL). A Steel Platebody is 210 gold. It mints gold: 26% of all gold in | Unchanged | Its bid. This is the floor |
| Salvage | not built | 6 rivets, about 85 gold of Luck, plus stock worth less than the bid (plan's guard) | Below the Shop's |
| Worn | 0.9% | Unchanged | none |
| Storage and bags | 4,930 pieces held (REAL) | Emptied by a plan by kind | none |
| The market | 1 listing (REAL) | A tier 3 standard piece will never trade above the Shop's bid: every account drops 27 an hour | none |

So a standard piece has a floor (the Shop) and no player economy, and that is correct: it is the hourly drop, and past tier 7 the plan already turns it into stock and chips (RULED 11-18). **The problem is the pieces meant to be valuable.** A Rare's floor is 10 to 70 rivets. A unique past Krell's floor is 400 to 900 rivets, about 6k to 13k gold. A Very Rare has none. Supply grows with every hunted hour and demand is one a hero slot, for ever.

PROPOSED, and it is the MERGE of `worn-in`: **a duplicate unique is what deepens the one you wear.** Tempering past tier 7 is already built as bands (`TEMPER_UNIQUE_BANDS`, shut): five rungs, gold and salts. Make each rung past tier 7 also take one unique of that band (any piece; a Very Rare counts as three). Then every unique has a use for the account that found it and a buyer on the market, the sink scales with the hours a server has lived, and worn in stops being a fourth system that sells the same percent. It does not touch Luck (no rivets from a Very Rare, as ruled) and it binds nothing.

**10. Verdicts on the six.**

| System | Verdict | In one line |
|---|---|---|
| Uniques | HOLD, then sample | The sample is five: two are live on Krell's daily kill, three are hidden. Do not write 46 a region. Play the three on the first Morrow ground, with the Very Rare's seat ruled first |
| Worn in | MERGE | Into Tempering past tier 7, fed by duplicates (question 9) |
| Trophies | FIX | Two Trophy rows in the game (the Rat King's Crown, Coppercap's Cauldron), none past Level 50, six ever dropped. Give Hask, the Provost and Krell one each. Three rows |
| Patterns | HOLD | Dark, one pattern. A recipe gate per hero is a decision made four times by the real player. If built, a pattern teaches the ACCOUNT |
| Lucky finds | CUT the 24 rows on monsters no open ground places. HOLD the four Hearthfinds: 0 real finds, a 100 to 400 hour trophy with no market and no gold is a fine long chase, and it costs nothing to leave dark |
| Commissions | HOLD | Needs escrow, the Security list and a market that has had a real buyer. 0 real market buys so far |

### Tyler rules on

1. **The loot plan by kind, account-wide, run on return (change 1).** Recommend YES. Alternative: keep per-item rules and only add the "always sell these?" prompt on the first Sell now, which fixes discovery but not the four-heroes-times-every-new-tier repetition.
2. **Tempering pays the difference going up a tier.** Recommend YES: a hero that tempers every tier pays 1.24M a track by tier 7 instead of 2.63M, and no purchase is ever wasted. It halves the largest sink on paper and should grow it in practice (one real buyer today). Alternative: keep the reset (your 11-18 "Sure"), and accept that Tempering under tier 6 is bought only by players who sit on a ground.
3. **The seat the Very Rare is sized on.** Recommend: set its chance a kill so that **an own four on the ground's hardest tier** finds one every 60 to 90 hours of hunting (18 to 27 days for the Own four, 7 to 11 for the Heavy four). The chance a kill stays the same for everyone (RULED 11-09), so a lone hero waits about four times as long a hero, and four heroes hunting apart find it no faster than together. Alternative: keep it 60 to 90 hours a hero, which is one every 1.5 to 6 days an account and a price that falls to nothing by month 6.
4. **Duplicate uniques feed Tempering past tier 7, and worn in is not built as its own system.** Recommend YES. Alternative: build worn in as designed (hours worn) and leave uniques with no sink but Luck.
5. **The pool cap.** Recommend two weapon steps of XP and one armor step of ordinary damage over the bare kit, by the five budgets in question 1, with plain accessories re-classed as Replace. Alternative: hold one step, which means cutting every perk to a third of its measured size or cutting Tempering's blows track.
6. **XP buffs on food are cut with the drop buffs; feasts become four party meals.** Recommend YES. Alternative: keep All XP foods as a gold sink and book them as a multiply lever with a named cap (the combat dive would have to give up something else).
7. **Cut list (data only):** the 24 lucky-find rows and the rest of the 114 orphan drop items that no staged ground needs; the `boss-forge.js` signature pieces, which lose their source now that the old dungeons are cut whole (RULED 11-20, CITED 22); Void Banquet and Cook Panther Meat until their inputs drop somewhere; the Beast of the day multipliers; the dead Bestiary drop ladder (already ruled). Recommend YES to all. Alternative: give each a source, which is new monsters on open grounds.
8. **The castle's goods.** Recommend: re-price at recipe value (table in "For other dives"), swap Slime Gel out of the Timber Beam, and make the Keystone from things that exist. Alternative: leave them until clans are built.
9. **Runecrafting 61 to 99.** Recommend Storm and Bone enter at Runecrafting 65 and 80 rather than at 1. Alternative: all eight families from level 1, and Runecrafting stays the skill with nothing new for 39 levels.
10. **Gear's Shop price from one rule (change 2).** Recommend: a tier's hourly gear sells for a fixed share of that tier's coin (25%), computed from each ground's own measured pieces and coin, replacing the seven hand-set rates. The economy dive sets the share. Alternative: keep fitting a rate a tier, and fit an eighth for the first ground past Krell.

---

## The cards, in registry order

Each card answers the thirteen of `02-requirements.md` in order. "Allowance" is 01 section 7: no new statement on the settle path, at most 1 ledger row and 1 row write a hero-hour.

### 1. `items-catalogue` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | Every item has a source and a use (§3.5). It gives no decision itself: it is the promise the other 21 systems keep. Still the promise at hour 1,000 |
| 2 First principle | Nothing repeated. The item card says where a piece drops ("Dropped by Hive Wasp at Mill Cellar, and at Meadowbrook Thicket and Wickstead", PLAYED), so a player never looks it up twice |
| 3 Ledgers | Items: 733 rows (CITED registry). No rate of its own |
| 4 Budget | None |
| 5 Players | The New player meets 40 bag items in 2 h 15 min (PLAYED). Cost: reading. Nobody is priced out |
| 6 Server cost | `hr_items` is a catalogue read once. Inside the allowance |
| 7 Population | Same at any size |
| 8 Server age | Dead rows cost a newcomer nothing they can see, except on the market's item list |
| 9 Exploits | A recipe whose input has no source is not an exploit. A recipe whose Shop bid beats its inputs is: Field Rations x4 turn 78 gold of inputs into 360 (READ FROM DATA). Bounded by the farm; fix the bid |
| 10 Teaching | Good: source lines on cards. Missing: "what is this for" on the 69 Shop-only drops, which the bag files under Junk (RULED 11-08) and that is the answer |
| 11 Throughput | A ground adds about 20 item rows. The cost is not rows, it is rows left behind: 190 monster rows exist and 55 are placed on an open ground (READ FROM DATA) |
| 12 Monetization | None |
| 13 Telemetry | `node tools/balance-program/items/drops-table.mjs inputs` in CI: target 0 inputs with no open source (today 11). Red line: any |

Fun: not a thing a player describes. Rulings: §3.5 "every item has a source and a use" BREAKS for 11 inputs and 114 orphans; JUNK vs MATERIALS (11-08) COMPLIES.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The coherence guard counts a source only if an OPEN ground places the monster (or a staged ground the registry names) | items-catalogue | Items | S | No | Long chase | 11 inputs, 114 orphans: `drops-table.mjs` |
| Cut or re-home the orphans; fix Field Ration's bid to 25 | items-catalogue, cooking | Items, gold | M | Data | First week | same; 360 gold from 78 |

### 2. `gear-tiers` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | "What do I get for hunting here?" The decision is which ground for which slot, and which of three weights. Past tier 7 standard tiers stop (RULED 11-14) |
| 2 First principle | "Equip upgrades" is one press for every better piece (PLAYED). Good. Repeated: the same press on each of four heroes; the outfit bundle should be copyable like the loot plan |
| 3 Ledgers | Items source: 26 to 29 pieces a hero-hour from Level 10 (REAL), 49 on the Slake. Power: a weapon tier +5 to +9% XP, an armor tier 13 to 26% less damage early and 5 to 10% late (CITED). Gold: 16 to 34% of income through the Shop (REAL) |
| 4 Budget | Replace class. Seven tiers to Level 88; the step holds (CITED audit 3a). At 240 and 400 there is no tier: uniques carry it (FORMULA: the armor line past Dawnsteel starts 11% over it, CITED `temper.js`) |
| 5 Players | Own four: about 2,500 pieces a week (92 hero-hours x 27), wears a handful. Cost: selling them (change 1). Nobody is walled: gear needs Level only (RULED 10-24) |
| 6 Server cost | `player_equipment`, the `equip` verb. No settle statement of its own. Inside |
| 7 Population | Works alone. At 1,000 the Shop absorbs everything; no gear market forms under tier 7 |
| 8 Server age | A newcomer at month 6 finds tiers 1 to 6 worthless to buy and free to drop. Good for them. The veteran wants nothing here: tier 7 is done in a day of Krell |
| 9 Exploits | Multi-hero funnelling of gear through Storage is allowed (RULED 10-23). The Shop faucet is clamped by the sale rate, a hand number a tier: OPEN in the sense that a wrong rate on a new tier is a faucet nobody sees until measured |
| 10 Teaching | Level 1, the bag's upgrade line. Clear. The dead moment: 39 of 40 bag items at hour 2 are not for this hero and nothing says what to do with them but "Sell now" |
| 11 Throughput | A tier is about 60 item rows and its art. Players pass a tier in 15 to 35 hunted hours (REAL pace). We cannot out-write that, which is why the ladder ends at 7 |
| 12 Monetization | Gear trades, so bought gold buys any tier. Nothing here is power the Heavy four cannot drop in a day |
| 13 Telemetry | Share of dropped gear worn (0.9%), sold by hand (43%). Target: by hand under 5% a week after change 1. Red line: over 20% |

Fun: the first Bronze set is a real moment (PLAYED: four upgrades at once). After Level 30 a drop is a number in a sell list. Rulings: LOOT REDESIGN 10-23 COMPLIES; "lower-level gear WAY more common" 10-20 COMPLIES, and is the flood; GEAR = HERO LEVEL ONLY COMPLIES.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Standard gear's Shop bid from one rule: a tier's hourly gear sells for a fixed share of that tier's coin an hour (PROPOSED 25%), computed from the ground's own measured pieces and coin, not a rate typed a tier | gear-tiers, loot | Gold, items | M | Catalogue regen | Long chase | `VENDOR_GEAR_RATES`, seven hand fits |

### 3. `loot` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | The reason to pick a ground and the moment in a hunt. Decision: where to hunt, and what to do with each thing (the plan) |
| 2 First principle | **The largest breach in the game.** Rules are one row an item a hero; 1,406 rows on two accounts and none on three (REAL). 14,792 hand sales. Dispatch is a press a hero a visit. A new tier means new rows. The plan can be copied hero to hero (`hr_loot_plan_copy`), which helps and is not found |
| 3 Ledgers | Items source by band: common over 15% a kill, uncommon 5 to 15%, scarce a piece an hour a slot a weight, rare 10 to 20 h a row, trophy 100 to 150 h (READ FROM DATA `loot-bands.js`). REAL: rows drop at their odds (0.28 against the commons' 0.28 for partied accounts) |
| 4 Budget | A Rare row is sized in hours a hero. On the Warrens 15 Rare rows make 2.05 Rare drops a hero-hour (REAL), one every 7 minutes for a four |
| 5 Players | Own four: 1,568 reveals so far and 14,792 sales pressed by hand across the real accounts, on visits of 2 to 5 minutes |
| 6 Server cost | `player_item_rules` one row an item a hero; `hr_loot_dispatch` one RPC a press. `hr_kill_credit_log` and its prune. A plan by kind is fewer rows: about 6 an account instead of hundreds |
| 7 Population | Alone it works. At 1,000 the reveal line to chat at 2 a hero-hour is spam: reveals must be Very Rare and Trophy only on any shared channel |
| 8 Server age | Nothing ages: rows are per kill |
| 9 Exploits | One drop chance a kill for everyone (RULED 11-09) closes last-hit games. Four heroes in one hunt roll once. Scaled hunts raise low rows for a fee (bounded by `hr_scaled_kill_bounds`) |
| 10 Teaching | Level 1: the loot line and "This hunt" tab. The plan: "No loot plans set" beside Dispatch (PLAYED), and the rules live under "Advanced view". A new player's first act with loot is Sell now, which teaches the wrong habit |
| 11 Throughput | A ground is 60 to 80 drop rows (READ FROM DATA `drops-table.mjs grounds`: 31 to 60 a ground). Fine |
| 12 Monetization | None directly |
| 13 Telemetry | Pieces sold by hand a hero-hour; accounts with a plan. Target 100% of accounts with a plan by their third town visit |

Fun: the Rare reveal was built as the moment and fires 1,568 times. A moment every 7 minutes is a notification. Rulings: LOOT DESTINATION PLAN 10-25 COMPLIES in mechanism, and the first principle (10-18) BREAKS; "Rare 1 per 10 to 20 h" COMPLIES a row and not a ground (audit contradiction 2).

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The plan by kind, account-wide, with per-item overrides; Dispatch from the after-hunt plan; the first Sell now offers the rule | loot, bag-equipment | Attention, items, gold | M | Yes: one table, `hr_loot_rule_set` takes a kind | **First hour** | 14,792 by hand; PLAYED |
| The reveal: Rare rows get the plain loot line; the card and any shared line are for Very Rare and Trophy | loot | Attention | S | No | First week | 1,568 reveals |

The plan by kind, walked against what exists (each step uses only the steps before it and the real start kit):

| Step | What the player holds and can reach | Exists today | New |
|---|---|---|---|
| 1. The first hunts end; the hero is in town | 40 bag items, 2,460 gold, the Inventory window with a Dispatch loot button and "No loot plans set" (PLAYED) | Yes | |
| 2. Presses a piece, then Sell now | The piece's menu: Equip / Sell now / List on market / Lock (PLAYED) | Yes | After the sale, one question: "Always sell gear you can't use?" |
| 3. Answers yes | A plan line "Gear I'm not wearing: Sell" | `hr_loot_rule_set` and `player_item_rules` exist, keyed by item | The kind key, and the row belonging to the account |
| 4. Hunts again and comes back | The bag's own "Upgrade: ..." line and Equip upgrades button (PLAYED) decide what counts as wearable | Yes | Dispatch reads the same test, so an upgrade is never sold |
| 5. Presses Dispatch loot once | `hr_loot_dispatch` applies the plan (110 real uses) | Yes | Nothing |
| 6. Later, sets "After the hunt: Dispatch loot" | The after-hunt plan (RULED 11-15, `src/data/hunt-after.js`) | The plan exists | The Dispatch step in it |
| 7. Makes a second hero | The plan is already that hero's | `hr_loot_plan_copy` exists as a press | Account scope makes the press unnecessary |

### 4. `uniques` (dark). Verdict: HOLD, then sample

| # | Answer |
|---|---|
| 1 Purpose | Past tier 7 standard upgrades stop and gear becomes a property a build is made of (RULED 11-14). Decision: which piece for which ground. Useful at hour 1,000 by design: it is the whole item game from Level 110 |
| 2 First principle | Not built, so: a unique swapped per ground is a decision repeated every time a party moves. It needs saved outfits a ground (the outfit bundle exists) |
| 3 Ledgers | Items source: 6 Rares and 1 Very Rare a ground (v3.1). Power: one attribute a piece (`special-attributes.js`): 10% of an element, 2 to 3% physical, +1 Defense, +2 to +3 skill, 6 to 10% crit, a 1.1 bane |
| 4 Budget | Replace class, inside the armor and weapon lines past Dawnsteel. Each attribute has a named cap in data (element 40%, physical 10%, crit 60%, bane 1.4). + skill on armor is capped at +6 and is a to-hit term: not before the combat dive's change |
| 5 Players | Not reachable. The Heavy four would be first, about day 30. A Very Rare at 0.75M is 9 days of an Own four's free gold |
| 6 Server cost | Item rows only. Inside |
| 7 Population | A unique needs a market to be worth finding twice. At 10 online a duplicate is worth its rivets |
| 8 Server age | The system most exposed to age: supply never stops, nothing leaves (question 9) |
| 9 Exploits | Four heroes are four times the rows a clock hour. A paid boss call can drop one (RULED 11-14, flagged for the Steam review as a paid roll) |
| 10 Teaching | Krell's two pieces teach it today: a card with one extra line. Enough |
| 11 Throughput | 46 a region against a region every 55 Levels. At the REAL pace a Heavy four crosses 55 Levels in about three weeks. 46 rows, 46 icons, 46 measured attributes a region is the heaviest content line in the plan. Seven a ground is right only if most are the same attribute on a different slot, which is repetition (§10) |
| 12 Monetization | Trades. The Buyer buys any unique. That is accepted (RULED 11-10) so long as each is also dropped |
| 13 Telemetry | Uniques held, worn, listed, salvaged a week. Red line: under 20% of found uniques worn or sold within a week of dropping |

Fun: yes, if a piece changes how a hunt plays. A 10% fire resist does not; a second lining socket does. Rulings: UNIQUE ITEMS AFTER TIER 7 COMPLIES in design; Krell's two (11-14) BUILT; "keep Demoncaller" noted: the 13 wave-3 rows in `wave3-uniques.js` are old stat sticks on monsters no ground places and carry a `tier: 8` the rulings forbid. Keep the names, cut the rows.

No change row beyond the cut (card 1). Build after: the Very Rare's seat is ruled, the duplicate sink is ruled, and the three hidden sample pieces are played on the first Morrow ground.

### 5. `worn-in` (designed). Verdict: MERGE into Tempering

| # | Answer |
|---|---|
| 1 Purpose | "A unique is worn for hundreds of hours and never changes." The same problem Tempering past tier 7 already answers with gold. Two systems, one decision: Tempering keeps it |
| 2 First principle | As designed (hours worn) it asks nothing, which is good, and decides nothing, which is why it is not a system |
| 3 Ledgers | Power: under half a weapon step (PROPOSED in the plan). As merged: an items SINK, one duplicate unique a rung |
| 4 Budget | Inside Tempering's 3% (question 1). At 240 and 400: one ladder a band, 2.5% (built, shut) |
| 5 Players | Merged: an Own four finds a ground's uniques at about 0.45 a hero-hour (CITED plan), about 40 a week, wears 4 to 8, feeds 20 rungs across four heroes a band |
| 6 Server cost | None new: the rung's purchase already takes an item (`hr_unlock_buy` takes salts) |
| 7 Population | Works alone. With a market it is what gives a duplicate a buyer |
| 8 Server age | This is the catch: it removes pieces at the rate veterans find them |
| 9 Exploits | A fed piece must be one the server holds in that hero's bag or Storage: built that way for salts |
| 10 Teaching | The Tempering pane's rung line: "1 unique from the Morrow Hills" |
| 11 Throughput | No content of its own |
| 12 Monetization | The Buyer can buy duplicates. It buys at most 2.5% a band: inside the accepted gold-for-power line |
| 13 Telemetry | Uniques fed a week against uniques found |

Rulings: none names worn in but the plan (11-18, "sample first"). COMPLIES by not building a second system.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| A Tempering rung past tier 7 takes one unique of its band; worn in is not built | worn-in, tempering, uniques | Items, power | S | Data when the bands open | Long chase | question 9 |

### 6. `tempering` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | "Gold piles up." Decision: Blows or Armor first, and whether this tier is worth it. The second half is the trouble |
| 2 First principle | Bought again at every tier for every hero: six tiers x two tracks x five rungs x four heroes is 240 purchases for the real player, each the same decision |
| 3 Ledgers | Gold sink: 62k / 217k / 248k / 372k / 496k / 1.24M a track at tiers 2 to 7 (READ FROM DATA). REAL: 2.5M paid, 22% of all gold out, one person, 59 uses. Items sink: 310 salts a track. Power: +1.2 to +2.9% XP and 0 to 9% less damage for both tracks (MEASURED, question 1) |
| 4 Budget | Add class, 3%. Holds at every point. Tier 7 is 0.4% a rung on purpose (CITED) |
| 5 Players | Both tracks at tier 3 for one hero: 434k, 66 hours of that hero's free gold at Level 30, and the tier lasts about 33 hunted hours at the REAL pace. Own four, all four heroes: 1.74M, 2.8 weeks of all its free gold, 16 weeks at what it spends. Heavy four: 10 days. Tier 7: 9.9M for four heroes, 8.6 weeks of an Own four's free gold. `measure.mjs price 434000 --at glade`: 5.0 days for an Own four's one hero, 29.6 at its spending share |
| 6 Server cost | `hr_temper_view`, one unlock row a rung. No settle statement. Inside |
| 7 Population | Works alone |
| 8 Server age | A newcomer loses nothing. A veteran's bought ladders below tier 7 are dead gold: nothing to show |
| 9 Exploits | A purchase is an unlock on the hero: nothing to trade or refund. Salts move through Storage (fine). A week of Platinum Tower keys pays 240 Ember salts a hero with no bench work (CITED 22) against 310 a track: the chest should not be the cheaper road to the one thing Tempering asks a crafter for |
| 10 Teaching | The smith's crier names it (RULED 11-11). One of four real people found it |
| 11 Throughput | A band is one data row |
| 12 Monetization | The accepted gold-for-power line (RULED 11-04), capped under a tier step. Rungs 1 to 3 cost 1.1 to 4.7 REF hours of gold a 1% and rungs 4 and 5 cost 5.5 to 24; tier 7's top two are 19 and 100 (CITED 24). The Buyer saves those hours and nothing else |
| 13 Telemetry | Ledger reason `temper`: accounts buying a week. Target: a third of accounts past Level 45 own a rung. Red line: one account is over half the gold (today 100%) |

Fun: a rung is a number going up. The good part is the choice of track. Rulings: TEMPERING NEEDS CRAFTING 11-05 COMPLIES; "no carry-over: Sure" 11-18 is what change 3 asks Tyler to reverse; "a SMALL cap past Dawnsteel" COMPLIES.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Moving up a tier costs the difference between the two ladders at the rungs already held | tempering | Gold | S | One RPC body | First week | 66 REF hours on a 33-hour tier; one buyer |

### 7. `jewelry` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | Six thin slots and a reason to be a crafter (RULED 11-04, 11-14). Decision: which perks, wear or sell. The only place a crafter makes power |
| 2 First principle | A roll is one job a piece: rolling for a perk is repetition by design (the chase). The Hallmark step CHOOSES the second perk, which is right. Four heroes x six pieces x a new set every tier is the repetition; reforging at the fee difference is the remembered version and only tier 2 to 3 exists |
| 3 Ledgers | Power: plain accessories and ammo +5.3 to +6.6% XP (MEASURED). Perks about 1% each, five played (CITED `jewelry.js`). Gold sink: Hallmark 25k and 100k built, 150k / 250k / 400k / 600k RULED. Items sink: 14 bars and a Rare gem a piece |
| 4 Budget | Question 1: accessories are a Replace lever at 6%; perks 4% |
| 5 Players | REAL: one account, 89 pieces, 4 set, 0 fees. A gem is a Rare at 0.23 to 0.24% from ONE monster each (`drops-table.mjs inputs`): about 11 hours a gem (CITED). Six Hallmarked pieces at tier 3 are 600k a hero and 2.4M a four: two weeks of an Own four's free gold. `price 150000 --at ford`: 1.5 days for an Own four, 8.9 at its share |
| 6 Server cost | `hr_hallmark` one RPC a step, 10 a day an account. Rolled rows are item rows (a grade is its own id): each new piece adds 1 + perks + pairs rows to `hr_items`. At 22 perks and 12 pieces a tier that is thousands of item rows a tier. Flag for the platform dive |
| 7 Population | Alone: one account is both smith and wearer (it has four heroes). With a market: Fine pieces are the first real trade good in the game |
| 8 Server age | Pieces never leave. Fine tier 3 rings will be worth their bars within weeks. Reforging up consumes the old piece, which is the sink: build it for every tier |
| 9 Exploits | No paid re-roll (RULED). Odds shown. The roll is the bench's seeded stream: a script cannot peek because the server draws. Rolled pieces sell at the plain bid, so rolling is no faucet. Steam: an unpaid roll from gathered bars is not a paid roll; the boss-call route to a guarantee gem is |
| 10 Teaching | Smithing 15. The Shop sells the plain ring at 3,000 beside a bench that makes it from 14 bars: the price is the lesson. Nothing tells a Level 30 hero that a ring exists at all unless they open Smithing |
| 11 Throughput | A tier is 3 to 6 pieces, a gem and its drop home, and perk sizes to measure. A hero passes a tier in 15 to 35 hours. Jewelry must carry up or it is content written to be skipped |
| 12 Monetization | Fees are gold. The Buyer buys a Hallmarked set: accepted, capped by the perk budget |
| 13 Telemetry | Hallmark fees paid a week (0). Pieces set against made (4 of 89). Red line: fees at zero two weeks after tier 4 ships |

Fun: yes. "I rolled Keen and Follow-through" is a sentence a player says. Rulings: CRAFTED JEWELRY 11-04, ALL JEWELRY IS SMITHING 11-18, GROW the pool, fees 150k to 600k, cloaks roll, guarantees 11-14: COMPLIES where built; BUILT for 2 of 7 tiers.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Tier 4 sample: three pieces, one gem, three perk hooks, reforge at the difference | jewelry, smithing | Power, gold, items | M | Catalogue + offers | First week past 45 | nothing past 30; 0 fees |

### 8. `linings` (designed). Verdict: MERGE the imbuement rows in, BUILD after combat

Card answered against the design; question 7 has the price.

| # | Answer |
|---|---|
| 1 Purpose | Group spells cannot be dodged and a lone hero has no sustain but food. Decision: which element, or which leech, for this ground |
| 2 First principle | Four heroes x two sockets x a top-up twice a week. "Top up linings" must be one press an account and a line of the after-hunt plan |
| 3 Ledgers | Gold sink: about a tenth of hunting gold a lining, 20% with two. Items sink: one part a 12 h. Power: 20 / 25 / 30% of one element, cap 40% |
| 4 Budget | Damage side only. The same at every Level: strengths never grow (plan). Good: no curve to re-balance |
| 5 Players | 4.8 REF hours a 48 h socket. Own four at Krell: about 230k a week for eight sockets, more than it spends on everything today. It will buy them only if a ground kills it without one |
| 6 Server cost | Hours counted "only while in a hunt with the piece worn": that is a decrement in the settle. It must ride the existing equipment read, as a timestamp and hours-left pair settled at hunt end, never a write a settle. Flag for the platform dive |
| 7 Population | Works alone: the account's crafter hero makes them |
| 8 Server age | The right kind of item: it is used up |
| 9 Exploits | A fitted piece cannot trade until the hours run out or a fee is paid (RULED 10-15): closes lending a lined piece around four heroes. "Each kind counts once a hero" closes stacking |
| 10 Teaching | The hunt's end card: "Fire guard runs out in 1 h 40 m". And the monster card's element (RULED 11-08: stats visible) |
| 11 Throughput | One part a ground, which already drops. No new art but the lining icon |
| 12 Monetization | Gold only |
| 13 Telemetry | Hero-hours hunted with a lining over hero-hours on grounds with a wall element |

Rulings: LINING COST 11-18, 12 h stacking to 48 h, HOUSE CURING 11-18 (home's), imbuement slot 10-14: all COMPLY with the merge. "Imbuements per gear piece, untradable until expiry or paid removal" 10-15 COMPLIES.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The imbuement rows are the lining parts; one a ground is kept | linings, loot | Items | S | Data | First week past 60 | `imbuements.js` header |

### 9. `salvage` (designed). Verdict: BUILD

| # | Answer |
|---|---|
| 1 Purpose | A hero picks up 26 to 29 pieces an hour and can only sell them. Decision: gold now or Luck and stock, set once |
| 2 First principle | Right only as a line of the plan by kind. As a fifth choice on per-item rows it multiplies the breach |
| 3 Ledgers | Items sink: up to 86% of gear. Gold: un-mints up to 26% of gold in. Luck source: 2 to 14 rivets a standard piece, 10 to 70 a Rare (RULED) |
| 4 Budget | No power. Its reward is Luck (card 10) |
| 5 Players | Question 8. It is the first sink that reaches the account sitting on 2.09M |
| 6 Server cost | Dispatch already journals. One ledger row a Dispatch, not a piece. The `account_found` count is the cost: see card 10 |
| 7 Population | Works alone |
| 8 Server age | Slows the gold supply as the server ages, by choice |
| 9 Exploits | The found allowance (plan): rivets only on pieces the account's own hunts dropped. Bought, crafted and chest pieces give stock only. Sound |
| 10 Teaching | The plan line: "Salvage: 12 Lucky Rivets" beside "Sell: 173 gp". Add the exchange on the bar (question 8) |
| 11 Throughput | None |
| 12 Monetization | Nothing sells Luck (RULED) |
| 13 Telemetry | Share of gear salvaged; gold not minted a week |

Rulings: Salvage lowers banked gold: Yes (11-18); LUCK FROM SALVAGE 11-20: COMPLIES.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Build as Luck only first, as a kind line in the plan | salvage, loot, luck | Items, gold | M | In flight (lane/d-luck-build) | First week | 86% sold |

### 10. `luck` (designed, ruled 11-20). Verdict: BUILD as ruled

| # | Answer |
|---|---|
| 1 Purpose | Hour 2,000 on a ground plays like hour 2 and the Bestiary pays nothing. Decision: gold or Luck, the bar or a ring. Useful at hour 5,000: the next percent is always there |
| 2 First principle | "Use" on the rivet's plan line puts them on the bar at Dispatch. Nothing clicked twice |
| 3 Ledgers | Luck source: salvage and Bestiary stages. Converter: Luck to Magic Find at 100 x n x n a percent, far stop 100. Items: Rare rows x (1 + MF / 100) |
| 4 Budget | Its own budget of 104 a hero (RULED). Lone +16% at 500 h and +39% at 5,000 h; four heroes +27% and +62% (CITED). Formula: 8 times the Luck is twice the Magic Find, so it cannot run away at 240 or 400 |
| 5 Players | Question 6. New: nothing for 20 hours, by ruling. Buyer: a Lucky ring, +4% at most |
| 6 Server cost | **Over the allowance as specified.** "The settle writes one count a kill per account" and "adds to found when it pays a gear piece" are two row writes a settle: `measure.mjs cost --add statements=0,ledger=0,writes=180` prints OVER THE ALLOWANCE (180 row writes a hero-hour against 1). The counts must accumulate in the instance's own state and flush once at the hunt's end or once an hour: `--add ledger=1,writes=2` |
| 7 Population | Works alone. At 10,000 the Lucky ring is a market good |
| 8 Server age | A veteran has +30 to +60%, a newcomer 0. The newcomer still finds the same rows; Rares through Krell are not a race. Past Krell the cut takes back what a veteran brings. Sound |
| 9 Exploits | The allowance closes buying gear to salvage. Open question the plan names: scaled hunts' Luck an hour. Add: Bestiary stages on trivial monsters by a high hero (cheap stages); the plan lists it as not played |
| 10 Teaching | The sheet line "Magic Find +16%" and the plan's Salvage line. The first rivet is the lesson |
| 11 Throughput | None: it feeds on hours |
| 12 Monetization | Premium's longer bar is more hours, so more Luck a day. No Crowns item sells Luck (RULED) |
| 13 Telemetry | Median Magic Find by account age; share of accounts over 20 |

Rulings: LUCK v3.1 NUMBERS 11-20, ACCOUNT-BOUND 11-20, LIKE GW2 11-20, DROPS GENEROUS TO KRELL 11-20: the build COMPLIES; the seat the Very Rare band is sized on is OPEN (Tyler rules on 3).

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Counters flush at hunt end, not a settle | luck | Server cost | S | In the build lane | Scale | `measure.mjs cost` |
| The Very Rare's chance a kill sized on an own four on the hardest tier | luck, uniques | Items | S | Data | Long chase | question 6 |

### 11. `lucky-finds` (dark). Verdict: CUT the orphan rows, HOLD the Hearthfinds

| # | Answer |
|---|---|
| 1 Purpose | "The realm stops to look at what you found." A collection chase with no power and no gold. It solves no problem the Very Rare reveal does not solve |
| 2 First principle | Nothing to repeat |
| 3 Ledgers | Items source: 100 to 400 hours a find a source (READ FROM DATA `hearthfind.js`). Mints no gold (bound, value 0) |
| 4 Budget | None |
| 5 Players | 0 real finds. At 400 hours a source the Own four sees one in about two months |
| 6 Server cost | Five tables and a prune for a thing that has never fired. `hr_world_finds_of` is an RPC. Inside, but it is carried weight |
| 7 Population | A world notice needs a world |
| 8 Server age | Fine |
| 9 Exploits | Bound and worthless by design: the mint guard proves it |
| 10 Teaching | None needed |
| 11 Throughput | Four items |
| 12 Monetization | None. Bound trophies are the one bound thing allowed (10-23) |
| 13 Telemetry | Finds a month |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Cut the 24 lucky-find drop rows on monsters no open ground places | lucky-finds, items-catalogue | Items | S | Data | None lost | CITED registry (24); `drops-table.mjs orphans` prints every orphan row |

### 12. `trophies` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | A named prize a boss, a mount in the House, a title. Collection. The decision is whether to farm a boss |
| 2 First principle | A claim is one press a stage a creature a hero: 55 creatures, four stages (2,500 to 20,000 kills), four heroes. Stages should claim themselves; Luck v3.1 pays stage Luck with no press, do the same for the row |
| 3 Ledgers | Items source: 2 Trophy rows (READ FROM DATA: the Rat King's Crown 0.14%, Coppercap's Cauldron 0.143%). REAL: 6 dropped, 2 held |
| 4 Budget | No power: the damage arm is off (`TROPHY_DAMAGE_ARM_ENABLED = false`) and the drop arm is cut with Luck |
| 5 Players | Nothing past Level 50. A Heavy four has had no Trophy to chase since week 2. The Trophy room is off sale and will be rebuilt as mounts for real Trophy drops (RULED 11-20): today that is two items |
| 6 Server cost | `hr_trophy_claim`, derived stages. Inside |
| 7 Population | Works alone. The Rat King's Crown is also a jewel guarantee (dark): the one Trophy with a use |
| 8 Server age | Fine |
| 9 Exploits | Never faster than 100 h at any Luck (RULED) |
| 10 Teaching | The Bestiary page. Not played by this dive |
| 11 Throughput | One row and one icon a boss |
| 12 Monetization | None |
| 13 Telemetry | Trophy drops a month |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| One Trophy row each on Captain Hask, the Provost and Lord Krell; stages claim themselves | trophies | Items, attention | S | Data | Long chase | 2 rows, none past 50 |

### 13. `patterns` (dark; the registry says live). Verdict: HOLD

| # | Answer |
|---|---|
| 1 Purpose | "Crafting has no chase." Decision: which ground for which recipe. Real, and the crafter's chase (card 14) is the same problem |
| 2 First principle | A pattern teaches ONE hero (`hr_recipe_learn`). The real player has four. A recipe learned is a decision made; learning it four times is the breach. If built: the account learns it |
| 3 Ledgers | Items source: a Rare, 1.4% on the Rat King. Sink: read once |
| 4 Budget | None |
| 5 Players | Unreachable (`PATTERN_LINE.live` false) |
| 6 Server cost | One unlock row. Inside |
| 7 Population | A pattern is a trade good only if it is not bound: it is not |
| 8 Server age | Every account learns each once: demand ends |
| 9 Exploits | None found |
| 10 Teaching | The item card |
| 11 Throughput | Eight a region planned |
| 12 Monetization | None |
| 13 Telemetry | Patterns read against dropped |

Rulings: Patterns per hero (designer 11-18): I disagree with my own earlier call on the first principle; it should be the account's. No change row: nothing is live.

### 14. `crafting-chase` (designed). Verdict: BUILD good batch now, the rest later

| # | Answer |
|---|---|
| 1 Purpose | Levels between unlocks do nothing, and 99 ends every skill. Good batch answers the first, the maker's mark the second |
| 2 First principle | Good batch asks nothing. Weekly orders as designed are a board to visit every week: they must be a standing order that fills from stock |
| 3 Ledgers | Good batch: items source, +2% at level 1 to +10% at 99 on consumable jobs (RULED). About a tenth more supplies from the same town hour at 99. It shares one Yield pool with a bench room's saved materials, added and capped at 15% (RULED 11-20, home's ruling 2) |
| 4 Budget | No power |
| 5 Players | Everyone who cooks or binds runes: all four real people |
| 6 Server cost | One draw on the bench stream. Inside |
| 7 Population | Works alone |
| 8 Server age | Fine |
| 9 Exploits | Only on jobs whose output sells under its inputs' store value: the craft-wages guard already holds that line. Good batch on Field Rations at today's bid would be a faucet: fix the bid first |
| 10 Teaching | "Good batch: 2 more" on the bench line |
| 11 Throughput | None |
| 12 Monetization | None |
| 13 Telemetry | Good batches a bench hour |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Good batch on consumable jobs | crafting-chase, artisan-engine | Items | S | Edge (the bench tick) | First week | question 4: nothing between unlocks |

### 15. `commissions` (designed). Verdict: HOLD

| # | Answer |
|---|---|
| 1 Purpose | A hunter cannot use a crafter without giving the piece away. Real once two people play together. REAL: 0 hours with another person, 0 market buys |
| 2 First principle | A bulk order is a remembered job: good |
| 3 Ledgers | Gold transfer in escrow; skill XP to the crafter |
| 4 Budget | None |
| 5 Players | The Own four is its own crafter: it has four heroes and Storage. It never needs this |
| 6 Server cost | Escrow rows, a board to read: a shared surface. Unknown |
| 7 Population | Needs strangers. At 10 online it is empty |
| 8 Server age | Fine |
| 9 Exploits | Escrow is a money surface; XP for gold between two accounts is a way to buy skill XP. Both OPEN |
| 10 Teaching | Not designed |
| 11 Throughput | None |
| 12 Monetization | Bought gold buys a crafter's time: accepted in principle |
| 13 Telemetry | Not before a market has trades |

### 16. `bag-equipment` (live). Verdict: KEEP

| # | Answer |
|---|---|
| 1 Purpose | What a hero carries into a hunt. Decision: what to pack. 100 spaces |
| 2 First principle | Locks, sort and filters are remembered. The breach is the plan, which is card 3's |
| 3 Ledgers | Items: holds them. Gold sink: the Key Ring at 25k (CITED 24) |
| 4 Budget | None |
| 5 Players | PLAYED: 40 of 100 spaces after 2 h 15 min. REAL: 4,930 gear pieces in bags. A full bag is what makes a player sell by hand |
| 6 Server cost | `player_inventory` rows; writes come from the settle. Inside |
| 7 Population | Same |
| 8 Server age | Same |
| 9 Exploits | Counts are the server's (RULED 10-18) |
| 10 Teaching | PLAYED: tabs All / Gear / Food / Drinks / Ammo & runes / Junk / Materials / Rare / Other, "Worth: 2,557 gp", the upgrade line. Clear. It looks like an inventory |
| 11 Throughput | None |
| 12 Monetization | Bag space is not sold. Keep it so |
| 13 Telemetry | Share of heroes that end a hunt with a full bag |

### 17. `gathering` (live). Verdict: KEEP

| # | Answer |
|---|---|
| 1 Purpose | What a hero does when it is not hunting, and where every bench input comes from. Decision: which node for which chain |
| 2 First principle | A gathering job resumes after a hunt (RULED 11-15). Tools are bought once. Good |
| 3 Ledgers | Town hours to items: 161 to 750 pieces an hour by node; skill XP 2.8k to 13.4k an hour; Shop gold 0.6k to 3.6k an hour raw (READ FROM DATA `recipes-table.mjs nodes`). REAL: 1,582 hero-hours, more than hunting |
| 4 Budget | None. Raw sells at a fifth of book so it is under a hunted hour everywhere (the craft-wages guard) |
| 5 Players | All four real people. It is free: a hero rests its stamina while it works |
| 6 Server cost | `tick-gather`, `accrue-gather`: per working hero, not on the hunt settle. The platform dive has the number |
| 7 Population | Nodes are not contended |
| 8 Server age | Raw stock piles up; the Shop is the floor |
| 9 Exploits | 24 hours a day a hero for free: bounded by the Shop's raw bid and the day's XP budget (`hr_day_budget`, CITED) |
| 10 Teaching | PLAYED: "Press a skill to gather or make", each skill with its next unlock ("Lv 15: Oak Tree"). Clear |
| 11 Throughput | A node is one row. Each skill has 12 to 16 rungs, a new one every 7 to 15 levels |
| 12 Monetization | None |
| 13 Telemetry | Gathering hero-hours a hunted hour (1.19 today) |

### 18. `cooking` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | Hunts burn food and drink; make better or pay the store (RULED). The decision is real at tiers 1 to 2 and made for the player after |
| 2 First principle | "Makes up to 141 · 1 / 5 / All" (PLAYED). A job is remembered and resumes. The chain fish, cook, carry is three hand-offs a hero; supplies should restock from Storage when a hunt starts |
| 3 Ledgers | Town hours to items: 113 to 381 fish a chain hour. Replaces 7k to 116k of store gold a chain hour (question 3). REAL: 133 bench hours, a third of all supplies used are home-made |
| 4 Budget | Food buffs are an unbooked lever (inventory note 2) |
| 5 Players | The New player's first craft: 141 wolf meat after 90 minutes on the Thicket (PLAYED), 9 minutes to cook, 253 gold of bench fee which is 10% of its purse. That fee on the first food a player ever makes is a bad first impression: the cheap-goods line should cover level 1 rows |
| 6 Server cost | The bench tick. Inside |
| 7 Population | Works alone |
| 8 Server age | Cooked fish will be the first thing a newcomer can buy cheaply on an old server: good |
| 9 Exploits | Field Rations' bid (card 1). Burn chance up to 25% at the level: fine |
| 10 Teaching | PLAYED: "Food that heals and drinks that restore mana on a hunt." and each row's line. Missing: what a row saves against the store |
| 11 Throughput | A fish is one node, one recipe, one item, maybe one store row |
| 12 Monetization | None |
| 13 Telemetry | Home-made share of supplies used (33%). Feast jobs a week |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Feasts to four party meals; XP and drop buffs off food | cooking | Level XP, items | S | Data | First week | made once each |
| Level 1 rows free of the bench fee; each row says what it saves | cooking, artisan-engine | Gold, attention | S | Data | **First hour** | PLAYED: 10% of the purse |

### 19. `smithing` (live). Verdict: KEEP

| # | Answer |
|---|---|
| 1 Purpose | Tools, whetstones, salts, jewelry, the two named reforges. No armor or weapon (RULED 11-18). Decision: which metal to mine for |
| 2 First principle | Bars then the piece is two queued jobs; a job should pull its own intermediate ("Make 10 Steel Axes" smelts what it needs) |
| 3 Ledgers | 46 rows. 1.2k to 8.4k Shop gold a chain hour. 534 chain hours to 99, 29 at the bench (question 4). REAL: 117 bench hours, 77% smelting |
| 4 Budget | Whetstones are spent ammo: inside accessories' 6% |
| 5 Players | REAL: 34 axes and 34 picks on two accounts. Tools are the proof that players craft gear when it does something |
| 6 Server cost | The bench tick |
| 7 Population | Works alone |
| 8 Server age | Bars are a market good once a market exists |
| 9 Exploits | Forged pieces sell above their bars (W-FORGE holds it) |
| 10 Teaching | "Lv 3: Bronze Axe" (PLAYED) |
| 11 Throughput | A metal is a bar, two tools, a whetstone, a salt: five rows |
| 12 Monetization | None |
| 13 Telemetry | Smithing hours that are not smelting (23%) |

No change of its own: its jewelry rows are card 7's, and whetstones have no store row on purpose (`NO_STORE_PARTNER`), which makes them the one supply only a crafter makes.

### 20. `crafting` (live). Verdict: FIX

| # | Answer |
|---|---|
| 1 Purpose | Planks, ammunition, cloaks, salts, the castle's beams. It has the thinnest identity of the four benches: 86% of its hours are sawing |
| 2 First principle | As Smithing |
| 3 Ledgers | 24 rows. 853 chain hours to 99. Arrows replace 2k to 32k of store gold a chain hour |
| 4 Budget | Tier arrows are spent ammo |
| 5 Players | REAL: 187 bench hours, 7.5 of them arrows. A bow hero buys at 1 gold a shot through tier 3 and should |
| 6 Server cost | The bench tick |
| 7 Population | Works alone |
| 8 Server age | Planks feed House rooms: demand ends when rooms do |
| 9 Exploits | None found |
| 10 Teaching | "Lv 5: Bronze Arrows" |
| 11 Throughput | A wood is a plank and an arrow |
| 12 Monetization | None |
| 13 Telemetry | Crafting hours that are not sawing |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Cloak and belt perks; linings at this bench | crafting, jewelry, linings | Power, items | M | Catalogue | First week past 45 | 3 worn rows, none past 30 |

### 21. `runecrafting` (live). Verdict: KEEP, with one ladder fix

| # | Answer |
|---|---|
| 1 Purpose | A caster's supply. Decision: bind or buy, and which tier a spell slot names (RULED 10-21) |
| 2 First principle | A slot names its rune once (RULED 11-08). Good |
| 3 Ledgers | 32 rows. A chain hour replaces 6.7k to 12.0k of store gold. REAL: runes are 55% of the store bill; 33 bench hours |
| 4 Budget | A deeper rune is a multiply-side choice the combat dive prices (28 and 44 gold, CITED) |
| 5 Players | A lone Graven Mage at 60 pays 29.6k an hour at the store: 2.5 chain hours of binding a hunted hour |
| 6 Server cost | The bench tick |
| 7 Population | Works alone. Runes are the obvious first market good |
| 8 Server age | Fine: used up |
| 9 Exploits | A job's runes sell under their blanks' value (W-RUNE) |
| 10 Teaching | A lone Mage on store runes nets about zero from Level 50 and its own runes are its whole wage, with 33 real hero-hours of Runecrafting (CITED 24): the link is not being found. "Lv 12: Split Blank Runes" is the first unlock a new player is shown (PLAYED). It reads as an upgrade and is a trade: half the blanks for five times the XP. The row should say so |
| 11 Throughput | A family is five rows. Two more are ruled |
| 12 Monetization | None |
| 13 Telemetry | Home-bound share of runes cast |

Change: Storm at 65 and Bone at 80 (Tyler rules on 9); Split Blank Runes says what it trades.

### 22. `artisan-engine` (live). Verdict: KEEP

| # | Answer |
|---|---|
| 1 Purpose | One bench engine for every town job, live while it runs (RULED 10-22), resumed after a hunt (RULED 11-15) |
| 2 First principle | The best-behaved system in the domain: a job has a count, resumes, and reads from bag then Storage (RULED 10-25). Left: chained jobs, and a standing "keep 500 Graven Fire in Storage" order so the 59% idle hero-hours work without a visit |
| 3 Ledgers | Town hours to items and skill XP. REAL: 516 bench hero-hours. Gold sink: bench fee 15% of output at shop prices until a room (13,705 gold in all, REAL) |
| 4 Budget | The 99 curve: 15 x 1.04^level (`SKILL_CURVE`). Capped by ruling |
| 5 Players | Everyone. Free but for the fee |
| 6 Server cost | `tick-artisan`, `accrue-artisan`: per working hero. The platform dive's |
| 7 Population | Not contended |
| 8 Server age | Fine |
| 9 Exploits | The day's XP budget; the fee line cannot be the way to work (W-TAX) |
| 10 Teaching | PLAYED: "Uses materials from bag and Storage until they run out", "Bench fee: 15% of output at shop prices", "Free with a kitchen at home". Clear and honest |
| 11 Throughput | None |
| 12 Monetization | None. Speed is never sold |
| 13 Telemetry | Idle share of hero life (59%) |

---

## For other dives

| To | System | Finding |
|---|---|---|
| 21 combat | (lever) | +10 main skill and Defense is 58% less damage taken for a Level 30 four and 5% for a Level 105 one (MEASURED, `pool.mjs`). It is not an Add lever while Defense is a to-hit term. I have taken + skill out of the item pool until the change lands |
| 21 combat | food buffs | 27 foods carry timed buffs, six of them All XP +2 to +5%. In no lever class. A hunt reads them when eaten by hand (CITED 26). Recommended here: XP buffs off food |
| 21 combat | prayer / Inner Flame | 7 of 17 fuels have no source on an open ground (Dragon Bones 35, Vampire Dust 58, Demon Shard 65, Dragon Scale 79, Lich Soul 86, Ancient Claw 92, Void Chitin 99; Hearth Cinders are the Tower's). From Inner Flame 52 up only Razor Claw (52) and Wraith Veil (72) drop. REAL: no use in 25 days |
| 21 combat | `botd.js` | Beast of the day carries a 1.5x and 2x drop multiplier. Not checked for a caller. Luck must be the only drop lever |
| 24 economy | store-supplies | Store food costs 0.19 gold a point at tier 1 and 1.75 at tier 5 while the crafted chain gets cheaper. Past tier 2 the food bill is paid only by accounts without Fishing. Runes are the dial; a chain hour of them is worth a hunted hour |
| 24 economy | shop | Gear's sale rate is seven hand numbers. Proposed: one rule, a fixed share of a tier's coin. And Field Rations bid 4.6 times their inputs |
| 24 economy | gold-sinks | Tempering at the difference: 1.24M a track to tier 7 instead of 2.63M. Linings: about 20% of free gold standing, 230k a week for an Own four at Krell |
| 25 social | clan-castle | **Recipe values, replacing Shop book.** Timber Beam 46 gold (its bid; 72 hero-seconds of chain, book 230). Iron Fitting 38 (60 seconds, book 190). Field Ration 25 PROPOSED (bid today 90, which is the fault). Keystone: cannot be made (Ancient Fragment and Cracked Spellstone have no source); as 3 beams and 3 fittings plus two parts it is about 600. **The whole castle's goods are about 3.1M at recipe value against 15.2M at book, and about 1,190 hero-hours of town work**: 8.5 weeks of one Own four's town hours, 6 days for a clan of ten. Bone Chips are fine (seven monsters from the Sewer to the Pyre Field). Slime Gel is the Cellar and the Sewer only: take it out of the beam (PROPOSED: 5 Normal Planks, 2 Oak Planks, 1 Iron Bar). Bench hours are not what limits a castle, so price it in gold and labour days. The ruling of 11-20 keeps the built ladder "about 15M of goods" as the start with one work order a week a slot: at recipe value the same goods are 3.1M, and the synthesis sets which number the board shows |
| 26 home | farming | Taken from 26: the farm-yield buff on Roasted Pumpkin and Carrot Stew is read by nothing, and Moonbloom has no drink (answered in question 3). Drinks are plot-bound: a crop is three drinks and drinks are 20% of the store bill. The farm decides an account's mana supply. Crop-fed meals sell for 5 to 15 times their crops at the Shop (Baked Potato 150 from 26 gold of potato; Moonbloom Elixir 2,600): a plot-day is worth up to 2,100 gold cooked against 280 raw. Small, but it is the best gold a plot makes |
| 26 home | curing | The Cellar is the curing room: 4 h a lining, 8 h a salt batch, fee a quarter of the lining's gold (RULED 11-20). The size it rests on, from here: a lining is about 15k for 12 hours at Levels 80 to 105 (the same figure as 24's), a hero keeps two, so a cure fee is about 3.7k and an Own four cures about 16 linings a week. Salts are 3 to 5 hero-hours a tier, so a slot is for linings |
| 27 retention | teaching | The first Sell now should offer the rule. "No loot plans set" is the only hint. The first craft a player makes costs 10% of its gold in bench fee |
| 27 retention | bestiary | Stage rewards become Luck with no press (v3.1). Trophy claims should follow |
| 28 platform | luck | The Luck build's per-kill account counters are 180 row writes a hero-hour as specified. Flush at hunt end |
| 28 platform | jewelry | Each perk pair is its own item row. 22 perks on 12 pieces a tier is thousands of rows in `hr_items` and in the market's ceilings table |
| 28 platform | linings | "Hours count only while hunting with the piece worn" must not be a write a settle |

## Measured, cited, assumed

| Label | What | Where |
|---|---|---|
| MEASURED | The Add pool, 8 cells x 5 rows, 2 seeds x 2 h, paired dice | `node tools/balance-program/items/pool.mjs` |
| MEASURED | Server cost of the Luck counters, two ways | `node tools/balance-program/measure.mjs cost --add statements=0,ledger=0,writes=180` and `--add statements=0,ledger=1,writes=2` |
| MEASURED | Days to earn 434k, 744k, 2.48M, 100k, 150k, 600k, 59.5k | `node tools/balance-program/measure.mjs price <gold> --at <point>` |
| PLAYED | A new account, 2 h 15 min, town windows, the Cooking bench | `node tools/balance-program/items/play-items.mjs --out <dir>` |
| READ FROM DATA | 160 recipes in 20 families, 44 nodes, 9 crops, hours to 99, chain hours, store rows replaced | `recipes-table.mjs` |
| READ FROM DATA | 11 inputs with no open source (13 printed; the Practice Club is the start kit's and Hearth Cinders the Tower's), 114 orphan drop items, 69 of 97 non-gear drops Shop-only, 190 monster rows of which 55 placed, rows a ground | `drops-table.mjs` |
| READ FROM DATA | Tempering prices, Hallmark fees, perk sizes, sale rates, band targets, the drop function's parameters | `src/data/temper.js`, `jewelry.js`, `loot-bands.js`, `src/core/drops.js` |
| REAL | Everything from `10-real-players.md`: 86% sold, 0.9% worn, 14,792 by hand, bench and gathering hours, 2.5M of Tempering by one person, 0 fees | sections 4 to 6 |
| CITED | Free gold a hero-hour and a week; the shelf | `24-economy.md` Q1 on `origin/lane/d-balance-economy` d9554e87f |
| CITED | Luck's lives, Magic Find by hours, rivet prices, the cut past Krell | `docs/design/itemization-plan.md` section 15 |
| CITED | Weapon and armor tier steps, perk sizes | `01-model.md`, `jewelry.js` comments, the audit |
| ASSUMED | Magic Find at 100, 250, 600 and 1,500 hours, read off the plan's Luck totals between its measured columns | question 6 |
| ASSUMED | Every market price. There are no trades to check against | questions 6 and 9 |
| ASSUMED | A town hour valued at what the same hour sells for at the Shop, for the castle's labour | For other dives |
| PROPOSED | The pool's five budgets, the Tempering difference, duplicates as rungs, the plan by kind, the Very Rare's unit, feasts as four meals, the gear sale rule, the castle goods' prices | this file |
| NOT DONE | A jewelry roll, a Hallmark and a Tempering rung were not played by hand. Linings, worn in, salvage and Luck were not played: nothing is built to play. The Beast of the day's caller was not traced. Nothing past Level 7 was played by this dive; the pool rows are the harness |
