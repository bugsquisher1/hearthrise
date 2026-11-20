# Balance program 24: Economy

Dive of `lane/d-balance-economy` (game-designer, 2026-11-20). Fourteen systems: purse-ledger, income, store-supplies, shop, market, player-trade, gold-sinks, hero-slots, tally, town-works, stamina-refill, premium, crowns, outfits. Nothing in the game was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED, and PLAYED for what was pressed on the local world as a new account.

**The inventory is missing nothing in this domain.** Two rows need a note: the Weighhouse market is closed on a new server until Town Works reaches 1,000,000 gold (PLAYED), so `market` depends on `town-works`; and the old premium bond item `hearth_token` (worth 25,000, bid on by the Shop) belongs with the `crowns` leftovers.

## Summary

**Verdicts (14):** KEEP 6 (purse-ledger, store-supplies, gold-sinks, hero-slots, tally, outfits). FIX 6 (income, shop, market, town-works, stamina-refill, premium). MERGE 1 (player-trade, into the market). BUILD 1 (crowns).

**What the economy is today, in four lines.**
- Gold in is one formula (0.30 gold a monster hit point, x0.7 from the Glade up), so a hero's wage is its damage an hour. Gear stops at tier 7, so the wage stops growing at Level 50 to 80. It is flat by construction.
- Gold out that repeats is store supplies and refills, and nothing else. Supplies are paid by Deadly parties and Mages (48 to 56% of coin) and not at all by a lone hero on Normal (under 1%).
- Everything else is a shelf of one-time buys: 50.6M for a four-hero account by Krell, of which real players have bought the House to rung 4, one person's Tempering and seven hero slots. Past Krell the shelf is empty.
- The player who matters (the Own four) frees 0.5M to 1.1M a week and spends 17% of it. It is not short of gold. It is short of something to want that fits in two four-minute visits a day.

**The five changes that matter most**

| # | Change | Why | Size |
|---|---|---|---|
| 1 | **The hunt's end card sells the loot.** "Sell junk for N gp" on the card, and the first sale offers "always sell these" (the loot rule, set once). | PLAYED: hunt one paid 130 gold in coin and left 501 unsold, and the card's only path to it is "Open bag". REAL: one new player sold nothing in 12 hours; 14,792 pieces were sold by hand; loot rules are on 2 of 5 accounts. | S |
| 2 | **"Next buy" on the end card walks the whole shelf** (Tempering rung, room rung, hero slot, the yard), with how many hunts of gold it is. | The card already names a next buy (PLAYED: "Next buy: Copper Studs (120 gp)"). Tempering is 22% of real gold out and one person found it, in Shop > Services. The 2.09M purse has nothing it wants because nothing told it what there is. | S |
| 3 | **Refills climb by half a refill each (x1, 1.5, 2, 2.5, 3, 3.5), not by 13%.** One data row. | Today every one of the six returns more gold than it costs at every Level to 105, with the XP free on top. With the steeper step the first two are still a yes at every Level, and from Level 80 the later ones cost more than they earn: a day of six is gold-neutral at Level 80 and gold for XP past it. | S |
| 4 | **Premium is account-wide and says what it is for; then Crowns are built as a wallet number with five clamps; the gem rows, the gem RPC and the bond item are cut first.** | Premium per hero costs the real player four times for a 12 hour bar that gives a twice-a-day player nothing (question 7). Crowns only sell if somebody with idle gold wants what Crowns buy, and that somebody is the Own four. | M to L |
| 5 | **Gold a hit point rises with monster Level past the last gear tier, with the dial folded in; every price past Krell is a share of one band index.** | The lone hammer earns 24.0k, 22.0k, 17.2k, 19.4k an hour at 80, 105, 118, 175: a new ground pays less than the one before. Nine rows of x0.7 are one number. | S |

**Tyler rules on** (the full list with both options is at the end of this file).

## Q1. THE gold model

Printed by `node tools/balance-program/gold-model.mjs` (weekly table), `--shelf` (one-time buys), `--offers` (gold for power and time), `--refills`. No play and no production read: it joins `tools/balance-program/ref.json` (MEASURED harness, commit a5e092248), the REAL rows of `10-real-players.md` sections 2 and 4, and the price rows under `src/data/`.

### How another dive uses it

1. **The unit is free gold a hunted hero-hour**: gold in (coin, sold loot, the tally) less the sinks that repeat with every hour (store supplies, refills, Blessings, bench tax). A price divided by it is REF hours of gold. Use the four's line unless your system is met alone.

| Level | Lone hero, Normal | A hero in an own Deadly four | Trust |
|---|---|---|---|
| 10 | 1.8k | 5.4k | REAL, thin |
| 30 | 10.7k | 6.6k | lone MEASURED, four REAL |
| 50 | 11.5k | 12.3k (10.0k to 13.8k) | lone MEASURED, four REAL coin, store share ASSUMED inside a REAL range |
| 80 | 23.9k | 11.9k | lone MEASURED, four REAL, thin |
| 105 | 21.4k | 12.4k (3.0k if the harness is right) | lone MEASURED, four ASSUMED |
| 118 (staged) | -2.7k | 10.3k (-0.9k if the harness is right) | lone MEASURED, four ASSUMED |

2. **A week of free gold, by player** (the budget every sink competes for), and beside it what the account really puts into sinks at its spending share:

| Level | New (1 hero, 2 h) | Own four (3.3 h) | really spends | Heavy four (8.4 h, refills) | really spends | Ceiling (24 h) | Four friends, one account |
|---|---|---|---|---|---|---|---|
| 10 | 25k | 501k | 85k | 1.11M | 1.08M | 3.03M | 125k |
| 30 | 150k | 610k | 104k | 1.19M | 1.15M | 2.94M | 152k |
| 50 | 162k | 1.14M | 194k | 2.33M | 2.26M | 7.49M | 285k |
| 80 | 334k | 1.10M | 188k | 1.94M | 1.88M | 7.53M | 276k |
| 105 | 300k | 1.15M | 195k | 1.79M | 1.74M | 6.77M | 287k |
| 118 | -38k | 951k | 162k | 1.16M | 1.13M | 5.36M | 238k |

3. **Three rules for a price, PROPOSED** (they are how this dive judges every sink below, and what the other dives should hold a new price to):
   - **A one-time buy** is sized in weeks of the Own four's free gold at the Level it opens, and it says its weeks. Under 1 week is an errand (nobody chooses), 1 to 4 weeks is a choice, over 8 weeks is a wall for the Own four and a 4 week goal for the Heavy four. Remember the Own four spends 17%: a 4 week price is 24 weeks at the share it really spends, unless the thing is something it WANTS (question 5).
   - **A repeating buy** is sized as a share of the week: the Own four spends about 100k to 200k a week in all today and the Heavy four 1.1M to 2.3M. A weekly sink under 20k is invisible to both; one over 300k is the Heavy four's alone.
   - **A gold-for-power buy** names REF hours of gold for +1% (the `--offers` table). Tempering's rungs run 1 to 24 hours a 1% through tier 6. A new offer under the cheapest rung at its Level is mispriced.

4. **Read these four warnings before quoting a cell.**
   - **`measure.mjs price` is slower than this table at Levels 50 and 80.** It uses each real account's life average (6,530, 7,495, 9,078 a hero-hour); this model uses the real coin of the Level band (section 2 of `10-real-players.md`), which is 12.3k at 50 and 11.9k at 80. Days from `price` at Level 50 are about 1.6 times too long. Past Level 84 `price` falls to 3,004 and then under zero; that is the harness four buying two thirds of its supplies at the store, and no real four has been there. This model carries both ends.
   - **The four-hero columns at Levels 10 and 30 describe an account that already owns its slots.** The slots cost 300k, 750k and 1.5M (RULED 11-09). The real fours bought seven slots for 330,000 in all, under the old prices. On today's prices a new account is ONE hero until about Level 30 (the lone column: 300k is 28 lone REF hours at Level 30) and a four near Level 50. So at Level 10 every real new account is the New column, and "the real player is an own four from Level 10" is a fact about the old slot prices, not about the game a beta player will meet. This is the largest correction to the shared model this dive has; see the hero-slots card.
   - **The Buyer is charged the Heavy four's 1.4 refills a day**, not the 6 `model.mjs` gives it (6 refills is 24 hunted hours, and the Buyer hunts 8.4). It buys every supply at the store, so its free gold is the lowest of the fours: what it sells Crowns for is the gap.
   - **The Ceiling makes all its own supplies and has no town hours** in `model.mjs`. Both cannot be true. Its column is an upper bound on gold made, which is what a guard needs.

### Gold a week, by player and Level (gold; a week = heroes x hunt hours a day x 7)

**Level 10 (meadowbrook thicket).** Four: REAL, thin (29 h). Lone: REAL, thin (78 h alone at 1 to 15).

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 26.5k | 382k | 973k | 382k | 2.78M | 973k | 95.5k |
| IN: loot sold to the Shop | 0 | 140k | 356k | 140k | 1.02M | 356k | 35.0k |
| IN: the tally (2% as really claimed) | 530 | 10.4k | 26.6k | 10.4k | 75.9k | 26.6k | 2.6k |
| **Gold in** | **27.0k** | **532k** | **1.35M** | **532k** | **3.87M** | **1.35M** | **133k** |
| OUT: store supplies | 1.7k | 30.6k | 77.9k | 30.6k | 0 | 117k | 7.6k |
| OUT: stamina refills | 0 | 0 | 142k | 0 | 784k | 142k | 0 |
| OUT: Blessings | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| OUT: bench tax (until a room) | 140 | 924 | 2.4k | 924 | 6.7k | 2.4k | 231 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **1.8k** | **31.5k** | **241k** | **31.5k** | **843k** | **280k** | **7.9k** |
| **Free gold a week** (in less repeating out) | **25.2k** | **501k** | **1.11M** | **501k** | **3.03M** | **1.08M** + bought | **125k** |
| Free gold a hunted hero-hour | 1.8k | 5.4k | 4.7k | 5.4k | 4.5k | 4.6k | 5.4k |
| What it really puts into sinks (its spending share) | 2.5k (10%) | 85.1k (17%) | 1.08M (97%) | 85.1k (17%) | 3.03M (100%) | no limit | 62.6k (50%) |

**Level 30 (mosslight glade).** Four: REAL (one account, 349 h). Lone: MEASURED harness, lone hammer Normal.

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 108k | 552k | 1.41M | 552k | 4.02M | 1.41M | 138k |
| IN: loot sold to the Shop | 39.4k | 110k | 279k | 110k | 797k | 279k | 27.4k |
| IN: the tally (2% as really claimed) | 2.9k | 13.2k | 33.7k | 13.2k | 96.3k | 33.7k | 3.3k |
| **Gold in** | **150k** | **675k** | **1.72M** | **675k** | **4.91M** | **1.72M** | **169k** |
| OUT: store supplies | 0 | 63.8k | 162k | 63.8k | 0 | 243k | 15.9k |
| OUT: stamina refills | 0 | 0 | 346k | 0 | 1.90M | 346k | 0 |
| OUT: Blessings | 202 | 832 | 2.1k | 832 | 6.0k | 2.1k | 208 |
| OUT: bench tax (until a room) | 140 | 924 | 2.4k | 924 | 6.7k | 2.4k | 231 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **342** | **65.5k** | **531k** | **65.5k** | **1.97M** | **612k** | **16.4k** |
| **Free gold a week** (in less repeating out) | **150k** | **610k** | **1.19M** | **610k** | **2.94M** | **1.11M** + bought | **152k** |
| Free gold a hunted hero-hour | 10.7k | 6.6k | 5.0k | 6.6k | 4.4k | 4.7k | 6.6k |
| What it really puts into sinks (its spending share) | 15.0k (10%) | 104k (17%) | 1.15M (97%) | 104k (17%) | 2.94M (100%) | no limit | 76.2k (50%) |

**Level 50 (hasks ford).** Four: REAL coin (266 h); store 14 to 48% of coin, the middle ASSUMED. Lone: MEASURED harness, lone hammer Normal.

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 119k | 1.04M | 2.66M | 1.04M | 7.59M | 2.66M | 261k |
| IN: loot sold to the Shop | 43.6k | 382k | 972k | 382k | 2.78M | 972k | 95.5k |
| IN: the tally (2% as really claimed) | 3.3k | 28.5k | 72.6k | 28.5k | 207k | 72.6k | 7.1k |
| **Gold in** | **166k** | **1.45M** | **3.70M** | **1.45M** | **10.57M** | **3.70M** | **363k** |
| OUT: store supplies | 3.8k | 313k | 797k | 313k | 0 | 1.19M | 78.2k |
| OUT: stamina refills | 0 | 0 | 549k | 0 | 3.02M | 549k | 0 |
| OUT: Blessings | 378 | 499 | 1.3k | 499 | 3.6k | 1.3k | 125 |
| OUT: bench tax (until a room) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **4.2k** | **313k** | **1.37M** | **313k** | **3.08M** | **1.76M** | **78.4k** |
| **Free gold a week** (in less repeating out) | **162k** | **1.14M** | **2.33M** | **1.14M** | **7.49M** | **1.94M** + bought | **285k** |
| Free gold a hunted hero-hour | 11.5k | 12.3k | 9.9k | 12.3k | 11.1k | 8.2k | 12.3k |
| What it really puts into sinks (its spending share) | 16.2k (10%) | 194k (17%) | 2.26M (97%) | 194k (17%) | 7.49M (100%) | no limit | 143k (50%) |

Range at this Level: the store bill is 1.6k to 5.4k a hero-hour, so a four is free 10.0k to 13.8k a hero-hour.

**Level 80 (pyre field).** Four: REAL, thin (183 h, one person). Lone: MEASURED harness, lone hammer Normal.

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 246k | 1.22M | 3.11M | 1.22M | 8.88M | 3.11M | 305k |
| IN: loot sold to the Shop | 89.9k | 436k | 1.11M | 436k | 3.17M | 1.11M | 109k |
| IN: the tally (2% as really claimed) | 6.7k | 33.1k | 84.3k | 33.1k | 241k | 84.3k | 8.3k |
| **Gold in** | **342k** | **1.69M** | **4.30M** | **1.69M** | **12.29M** | **4.30M** | **422k** |
| OUT: store supplies | 7.6k | 586k | 1.49M | 586k | 0 | 2.24M | 146k |
| OUT: stamina refills | 0 | 0 | 855k | 0 | 4.70M | 855k | 0 |
| OUT: Blessings | 756 | 249 | 635 | 249 | 1.8k | 635 | 62 |
| OUT: bench tax (until a room) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **8.3k** | **586k** | **2.36M** | **586k** | **4.76M** | **3.11M** | **147k** |
| **Free gold a week** (in less repeating out) | **334k** | **1.10M** | **1.94M** | **1.10M** | **7.53M** | **1.19M** + bought | **276k** |
| Free gold a hunted hero-hour | 23.9k | 11.9k | 8.2k | 11.9k | 11.2k | 5.1k | 11.9k |
| What it really puts into sinks (its spending share) | 33.4k (10%) | 188k (17%) | 1.88M (97%) | 188k (17%) | 7.53M (100%) | no limit | 138k (50%) |

**Level 105 (krells hold).** Four: ASSUMED (harness x real ratios at Pyre Field); the harness alone says 3004. Lone: MEASURED harness, lone hammer Normal.

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 225k | 1.28M | 3.25M | 1.28M | 9.28M | 3.25M | 319k |
| IN: loot sold to the Shop | 82.5k | 467k | 1.19M | 467k | 3.39M | 1.19M | 117k |
| IN: the tally (2% as really claimed) | 6.2k | 34.8k | 88.7k | 34.8k | 253k | 88.7k | 8.7k |
| **Gold in** | **314k** | **1.78M** | **4.52M** | **1.78M** | **12.93M** | **4.52M** | **444k** |
| OUT: store supplies | 12.6k | 630k | 1.60M | 630k | 0 | 2.41M | 158k |
| OUT: stamina refills | 0 | 0 | 1.11M | 0 | 6.10M | 1.11M | 0 |
| OUT: Blessings | 1.1k | 353 | 900 | 353 | 2.6k | 900 | 88 |
| OUT: bench tax (until a room) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **13.7k** | **631k** | **2.73M** | **631k** | **6.16M** | **3.53M** | **158k** |
| **Free gold a week** (in less repeating out) | **300k** | **1.15M** | **1.79M** | **1.15M** | **6.77M** | **989k** + bought | **287k** |
| Free gold a hunted hero-hour | 21.4k | 12.4k | 7.6k | 12.4k | 10.1k | 4.2k | 12.4k |
| What it really puts into sinks (its spending share) | 30.0k (10%) | 195k (17%) | 1.74M (97%) | 195k (17%) | 6.77M (100%) | no limit | 143k (50%) |

Low end for every four at this Level, if the harness is right and the real ratios do not hold: 3.0k free gold a hero-hour.

**Level 118 (carters rest).** Four: ASSUMED (harness x real ratios at Pyre Field); the harness alone says -900. Lone: MEASURED harness, lone hammer Normal.

| Row | New | Own four | Heavy four | Premium own four | Ceiling | Buyer | Four friends |
|---|---|---|---|---|---|---|---|
| Hunted hero-hours a week | 14 | 92 | 235 | 92 | 672 | 235 | 23 |
| IN: coin | 176k | 1.21M | 3.08M | 1.21M | 8.79M | 3.08M | 302k |
| IN: loot sold to the Shop | 64.4k | 442k | 1.13M | 442k | 3.22M | 1.13M | 111k |
| IN: the tally (2% as really claimed) | 4.8k | 33.0k | 84.0k | 33.0k | 240k | 84.0k | 8.3k |
| **Gold in** | **245k** | **1.68M** | **4.29M** | **1.68M** | **12.25M** | **4.29M** | **421k** |
| OUT: store supplies | 282k | 732k | 1.86M | 732k | 0 | 2.80M | 183k |
| OUT: stamina refills | 0 | 0 | 1.24M | 0 | 6.83M | 1.24M | 0 |
| OUT: Blessings | 1.2k | 407 | 1.0k | 407 | 3.0k | 1.0k | 102 |
| OUT: bench tax (until a room) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| OUT: powders, rounds, the Works | 0 | 0 | 18.3k | 0 | 52.4k | 18.3k | 0 |
| **Repeating gold out** | **283k** | **733k** | **3.12M** | **733k** | **6.89M** | **4.06M** | **183k** |
| **Free gold a week** (in less repeating out) | **-38.3k** | **951k** | **1.16M** | **951k** | **5.36M** | **230k** + bought | **238k** |
| Free gold a hunted hero-hour | -2.7k | 10.3k | 4.9k | 10.3k | 8.0k | 977 | 10.3k |
| What it really puts into sinks (its spending share) | -3.8k (10%) | 162k (17%) | 1.13M (97%) | 162k (17%) | 5.36M (100%) | no limit | 119k (50%) |

Low end for every four at this Level, if the harness is right and the real ratios do not hold: -900 free gold a hero-hour.

### The one-time shelf: what has opened by each Level, list price (READ FROM DATA)

| Opens by Level | What | Price | Bought | A four-hero account |
|---|---|---|---|---|
| 10 | Homestead and Farmstead | 2.9k | once an account | 2.9k |
| 10 | Cellar, Garden, Shrine, Trophy room, rungs 1 to 3 | 81.7k | once an account | 81.7k |
| 10 | Setup slots 4 and 5 | 55.0k | a hero | 220k |
| 10 | Key Ring | 25.0k | once an account | 25.0k |
| 30 | Hero slot 2 | 300k | once an account | 300k |
| 30 | Hero slot 3 | 750k | once an account | 750k |
| 30 | Manor | 10.0k | once an account | 10.0k |
| 30 | Forge, Kitchen, Library, Workshop, rungs 1 to 2 (each ends its bench tax) | 630k | once an account | 630k |
| 30 | Tempering tier 2, both tracks | 124k | a hero | 496k |
| 30 | Six crafted pieces Hallmarked, tier 2 | 150k | a hero | 600k |
| 50 | Hero slot 4 | 1.50M | once an account | 1.50M |
| 50 | Keep | 40.0k | once an account | 40.0k |
| 50 | The bench rooms to rung 4, the other four rooms rung 4 | 1.67M | once an account | 1.67M |
| 50 | House dummy, four skills | 1.40M | once an account | 1.40M |
| 50 | Tempering tiers 3 and 4, both tracks | 930k | a hero | 3.72M |
| 50 | Six pieces carried to tiers 3 and 4 (tier 4 fee RULED, not built) | 750k | a hero | 3.00M |
| 80 | Rooms, rung 5 | 5.95M | once an account | 5.95M |
| 80 | Castle | 2.50M | once an account | 2.50M |
| 80 | Tempering tiers 5 and 6, both tracks | 1.74M | a hero | 6.94M |
| 80 | Six pieces carried to tiers 5 and 6 (RULED, not built) | 1.50M | a hero | 6.00M |
| 105 | Tempering tier 7, both tracks | 2.48M | a hero | 9.92M |
| 105 | Six pieces carried to tier 7 (RULED, not built) | 1.20M | a hero | 4.80M |
| 118 | Nothing new is built past Krell (linings, worn in and unique reforges are designed) | 0 | once an account | 0 |
| any | Storage rungs, all 30 (3,000 x 1.32^n) | 38.82M | once an account | 38.82M |

Running total of the shelf (Storage rungs left out): Level 10 330k, Level 30 3.12M, Level 50 14.44M, Level 80 35.83M, Level 105 50.55M, Level 118 50.55M.
Of that, Hallmark fees (never paid by a real player; tiers 4 to 7 not built): Level 10 0, Level 30 600k, Level 50 3.60M, Level 80 9.60M, Level 105 14.40M, Level 118 14.40M.

### Weeks of free gold the NEW shelf of each band is, by player (free gold a week at that Level; in brackets at its real spending share)

| Level | New on the shelf (four heroes) | New | Own four | Heavy four | Premium own four | Ceiling | Four friends | Buyer |
|---|---|---|---|---|---|---|---|---|
| 10 | 330k | 6.5 (65) | 0.7 (4) | 0.3 (0) | 0.7 (4) | 0.1 (0) | 1.3 (3) | 0 |
| 30 | 2.79M | 13.1 (131) | 4.6 (27) | 2.3 (2) | 4.6 (27) | 0.9 (1) | 12.9 (26) | 0 |
| 50 | 11.32M | 38.9 (389) | 9.9 (58) | 4.9 (5) | 9.9 (58) | 1.5 (2) | 22.0 (44) | 0 |
| 80 | 21.39M | 35.0 (350) | 19.4 (114) | 11.1 (11) | 19.4 (114) | 2.8 (3) | 42.4 (85) | 0 |
| 105 | 14.72M | 12.3 (123) | 12.8 (76) | 8.2 (8) | 12.8 (76) | 2.2 (2) | 12.8 (26) | 0 |
| 118 | 0 | never | 0.0 (0) | 0.0 (0) | 0.0 (0) | 0.0 (0) | 0.0 (0) | 0 |

A one-hero account (New, Four friends) is charged the per-hero rows once.

### What the model says (each line is argued in the questions below)

- **Gold in is flat from Level 50 for the four** (15.4k, 17.9k, 18.9k, 17.9k a hero-hour at 50, 80, 105, 118) while the shelf of new one-time buys grows from 2.8M at Level 30 to 21.4M at Level 80. The shelf is what scales, not the wage.
- **Nothing repeats except supplies and refills.** For the Own four, repeating gold out is 6% of gold in at Level 10 and 35 to 44% from Level 80, and all of it is the store. Every other sink on the list is bought once.
- **The Heavy four pays 0.9M to 1.2M a week for refills from Level 80**, more than its whole store bill at Level 50. Refills are the only repeating sink that grows with Level, and one real person has ever bought one.
- **The whole shelf to Krell is 50.6M for a four-hero account** (36.2M without the Hallmark fees nobody has paid), plus 38.8M of Storage rungs. At the Heavy four's free gold that is 26 weeks; at the Own four's it is 46 weeks, and 5 years at the 17% it really spends. Month 6 for the Heavy four is the shelf running out.
- **Past Krell nothing new is on the shelf** while the four still frees about 1M a week. That is the 2.09M purse with nothing to want, arriving for everyone.

## Q2. Income past Level 110, and who is meant to be broke

**Why gold in is flat (READ FROM DATA, `src/data/balance-sheet.js` STAT_FORMULA.gp and GROUND_GP_FIT).** Coin a kill is 0.30 gold a monster hit point, times 0.7 on nine grounds. So gold an hour is the hit points a hero removes an hour times 0.21, plus what the drops sell for. A hero's damage an hour grows with gear tier, and gear ends at tier 7. From there a harder ground has more hit points a monster and the same gold an hour, less whatever to-hit takes away. MEASURED (`ref.json`): the lone hammer takes in 24.0k, 22.0k, 17.2k, 19.4k an hour at Levels 80, 105, 118, 175; the four 19.5k, 20.5k, 19.4k, 18.4k a head. Past Level 128 the hourly gear drop is gone too (RULED 11-18, crafting stock and gem chips instead), which is a third of income (REAL: sold loot is 26% of gold in).

**The formula, PROPOSED (three lines of data, no engine change):**
1. Fold the dial in. Gold a hit point is 0.30 to monster Level 15 and 0.21 from 16 up. Delete the nine `gpFit` rows.
2. Past the Level the last gear tier is worn at (88 today), gold a hit point rises 0.5% a monster Level: 0.24 at 118, 0.30 at 175, 0.37 at 240, 0.54 at 400 (FORMULA). On today's measurements that makes the lone hammer 19.8k at 118 and 27.8k at 175. The slope is a first fit: the staged grounds lose kills to the to-hit curve, so **re-measure after dive 21** and set the slope so the line below holds.
3. One reported line, not a gate: **a ground never pays a lone in-range hero on Normal less gold in an hour than the ground before it.** This is a rule about the faucet (what the monsters carry), not about profit after supplies, so it does not bring back a profit mold (RULED 11-13). Tyler should say whether he reads it that way: item 2 of the rulings list.
4. Past 128, region stock sells at the Shop for what the gear it replaced did (audit change 7), held by the items dive's reference-value guard.

**Who is meant to be broke.** By the rulings nobody is owed a profit (11-13), tiers never move gold (11-07), and a party on Deadly "should likely be wasting money" (11-19). Read against the model:

| Player | Today | Meant |
|---|---|---|
| Lone hero, in range, Normal, melee | Paid at every open ground: 1.8k an hour at 10 (REAL), 10.5k to 23.4k from 30 to 105 (MEASURED). Buys almost nothing at the store (0 to 900 an hour) | Paid. This is the floor of the game and the New player's seat. It goes under zero only on the staged grounds (118: -3k, 175: -26k), from food, and that is dive 21's to-hit fix, not an income problem |
| Lone Mage, Normal, runes from the store | About zero from Level 50 (-0.3k, -10k, -1.4k, -1.9k at 50, 60, 80, 105, MEASURED) for 1.3 to 1.6 times the hammer's XP | Break-even at best. Its rune bill is the price of its pace, and Runecrafting is the wage: a Mage who binds its own runes keeps its coin. That is the one clean reason Runecrafting exists, and real players gave it 33 hero-hours, so it is not being found (for dive 23) |
| Own four on Deadly, a third of supplies home-made | +10k to +12k a hero-hour (REAL); the store takes 48 to 56% of coin from Level 60 | Paying about half its coin for three times the pace is "struggle or pay" already working. Do not cut it further |
| A four on Deadly buying everything at the store (the Buyer) | +4k to +8k a hero-hour on real ratios, under zero on the harness from Level 80 | The one who is meant to be short. It buys speed with gold, and that gap is what Crowns fill |
| A hero hunting under its Level on Deadly with nothing home-made | Unmeasured | Broke, by Tyler's own line |

So the answer to "who is broke": **whoever turns gold into pace** (Deadly on store runes), and nobody else. The model's risk is the opposite one: from Level 50 the Own four is rich and bored.

## Q3. Every gold-for-power and gold-for-time offer on one line

`node tools/balance-program/gold-model.mjs --offers`. A REF hour is the free gold of one hero-hour in an own four at that Level (Q1). Sizes are CITED where a dive measured them and PROPOSED where the system is not built.

| Offer | Level | Price | What it gives | REF hours of gold | REF hours for +1% Level XP, or for one hunt hour | Label |
|---|---|---|---|---|---|---|
| Tempering Blows, tier 2, rungs 1 to 3 | 30 | 14.0k | +2.0% XP | 2.2 | 1.1 h a 1% | CITED size |
| Tempering Blows, tier 2, rungs 4 and 5 | 30 | 48.0k | +1.4% XP | 7.4 | 5.5 h a 1% | CITED size |
| Tempering Blows, tier 4, rungs 1 to 3 | 50 | 56.0k | +1.8% XP | 4.7 | 2.6 h a 1% | CITED size |
| Tempering Blows, tier 4, rungs 4 and 5 | 50 | 192k | +1.2% XP | 16.0 | 13.3 h a 1% | CITED size |
| Tempering Blows, tier 6, rungs 1 to 3 | 80 | 112k | +2.0% XP | 9.7 | 4.7 h a 1% | CITED size |
| Tempering Blows, tier 6, rungs 4 and 5 | 80 | 384k | +1.4% XP | 33.1 | 24.4 h a 1% | CITED size |
| Tempering Blows, tier 7, rungs 1 to 3 | 105 | 280k | +1.2% XP | 23.3 | 19.4 h a 1% | CITED size |
| Tempering Blows, tier 7, rungs 4 and 5 | 105 | 960k | +0.8% XP | 79.8 | 99.7 h a 1% | CITED size |
| Stamina refill, first of the day | 30 | 8.5k | 4 hunt hours | 1.3 | 0.33 h a hunt hour | READ FROM DATA |
| Stamina refill, sixth of the day | 30 | 14.2k | 4 hunt hours | 2.2 | 0.55 h a hunt hour | READ FROM DATA |
| Stamina refill, first of the day | 50 | 13.5k | 4 hunt hours | 1.1 | 0.28 h a hunt hour | READ FROM DATA |
| Stamina refill, sixth of the day | 50 | 22.5k | 4 hunt hours | 1.9 | 0.47 h a hunt hour | READ FROM DATA |
| Stamina refill, first of the day | 80 | 21.0k | 4 hunt hours | 1.8 | 0.45 h a hunt hour | READ FROM DATA |
| Stamina refill, sixth of the day | 80 | 35.0k | 4 hunt hours | 3.0 | 0.76 h a hunt hour | READ FROM DATA |
| Stamina refill, first of the day | 105 | 27.3k | 4 hunt hours | 2.3 | 0.57 h a hunt hour | READ FROM DATA |
| Stamina refill, sixth of the day | 105 | 45.4k | 4 hunt hours | 3.8 | 0.94 h a hunt hour | READ FROM DATA |
| Hero slot 2 | 30 | 300k | one more hero for good | 46.3 | pays itself back in 46 of its own hunt hours | READ FROM DATA |
| Hero slot 3 | 30 | 750k | one more hero for good | 115.8 | pays itself back in 116 of its own hunt hours | READ FROM DATA |
| Hero slot 4 | 50 | 1.50M | one more hero for good | 124.6 | pays itself back in 125 of its own hunt hours | READ FROM DATA |
| The yard, an hour (skill 27) | 30 | 212 | 30,000 skill XP, no stamina | 0.0 | 0.03 h an hour trained | READ FROM DATA |
| The yard, an hour (skill 45) | 50 | 320 | 30,000 skill XP, no stamina | 0.0 | 0.03 h an hour trained | READ FROM DATA |
| The yard, an hour (skill 72) | 80 | 482 | 30,000 skill XP, no stamina | 0.0 | 0.04 h an hour trained | READ FROM DATA |
| Training item, 12 h | 50 | 250k | +30,000 skill XP an hour for 12 h | 20.8 | 1.7 h an hour doubled | READ FROM DATA |
| House dummy, first skill | 50 | 150k | the yard with no fee | 12.5 | saves 320 an hour: 469 trained hours to pay back | READ FROM DATA |
| Blessings, all three | 50 | 1.4k | keeps 75% of a death (6% of Level XP) | 0.1 | a death is about 7 hunt hours of XP at the REAL pace; the set is 0.11 h of gold | READ FROM DATA; hours ASSUMED from LEVEL_PACE x 0.35 |
| Blessings, all three | 80 | 2.7k | keeps 75% of a death (6% of Level XP) | 0.2 | a death is about 17 hunt hours of XP at the REAL pace; the set is 0.23 h of gold | READ FROM DATA; hours ASSUMED from LEVEL_PACE x 0.35 |
| Blessings, all three | 105 | 3.8k | keeps 75% of a death (6% of Level XP) | 0.3 | a death is about 27 hunt hours of XP at the REAL pace; the set is 0.32 h of gold | READ FROM DATA; hours ASSUMED from LEVEL_PACE x 0.35 |
| Hallmark fee, tier 3, one piece | 50 | 100k | two perks kept at this tier (about +1% a perk, PROPOSED) | 8.3 | 4.2 h a 1% | RULED price, PROPOSED size |
| Hallmark fee, tier 5, one piece | 80 | 250k | two perks kept at this tier (about +1% a perk, PROPOSED) | 21.6 | 10.8 h a 1% | RULED price, PROPOSED size |
| Hallmark fee, tier 7, one piece | 105 | 600k | two perks kept at this tier (about +1% a perk, PROPOSED) | 49.9 | 24.9 h a 1% | RULED price, PROPOSED size |

Town Works takes at most 25.0k a day an account and the whole project is 1.00M.

**The ranking, cheapest first, and whether that is the order we want.**

| Rank | Offer | Price for what it gives | Is this the order we want? |
|---|---|---|---|
| 1 | The yard, an hour of training | 0.03 REF hours for 30,000 skill XP. About 0.4 REF hours for +1% XP at skill 45 (ten skills are about +4%, CITED `01-model` levers; a skill level near 46 is about 190k XP, FORMULA from the audit's two points) | **No.** It is three to ten times cheaper than the cheapest Tempering rung, costs no stamina, and no real player has used it. By rule 1 of `01-model` it is mispriced. Its rate is dive 21's; its fee is a sink this dive wants (Q5) |
| 2 | Blessings, all three | 0.1 to 0.3 REF hours to keep 75% of a death worth 7 to 27 hunted hours | No decision at all: always yes. The fix is owned (11-19 fix 5); this dive's size for it is 2 REF hours a set |
| 3 | Stamina refill | 0.28 to 0.57 REF hours of gold for one hunt hour (first of the day), 0.47 to 0.94 (sixth) | Every refill pays itself back in gold and the XP is free. Right place in the order (after the slots), wrong slope (Q4) |
| 4 | Hero slots 2, 3, 4 | 46, 116 and 125 of the new hero's own hunt hours, then its whole output for good | **Yes, first.** It is the best buy in the game and it should be: it is what makes the party. See the card for what it does to the first 30 hours |
| 5 | Tempering, rungs 1 to 3 | 1.1 to 4.7 REF hours for +1% through tier 6 | Yes. This is the "choose what matters" rung |
| 6 | Hallmark fee | 4 to 25 REF hours for +1% (size PROPOSED, never paid) | Between the two halves of a Tempering track, as it should be, if the perks measure about 1% each |
| 7 | Tempering, rungs 4 and 5 | 5.5 to 24 REF hours for +1% through tier 6; 19 and 100 at tier 7 | Yes: the last rung is half the track and is where a hero stops short. Tier 7's top rung at 100 hours a 1% is the Buyer's rung and nobody else's |
| 8 | Training item, 12 hours | 1.7 REF hours for each hour doubled, 65 times the yard's own price for the same XP | Only worth it once yard hours are the limit (12 a session). Fine as the Buyer's item; pointless while the yard is nearly free |
| 9 | House dummy | 150k to save 320 gold an hour: 469 trained hours to pay back | Never pays back. It is a trophy, which is what Tyler asked for ("wildly expensive") |

The cheapest is the yard, and it is the one offer whose price was never sized against the others. Everything from rank 3 down is in a sensible order.

## Q4. The six refills, priced to be a decision at every Level

`node tools/balance-program/gold-model.mjs --refills` (price READ FROM DATA; the 4 hours' free gold from Q1).

| Level | Refill 1 | 2 | 3 | 4 | 5 | 6 | All six | 4 h of a four, free gold | Refill 1 / those 4 h | Refill 6 / those 4 h | 4 h of a lone hero | Refill 1 / lone 4 h |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 3.5k | 4.0k | 4.4k | 4.9k | 5.4k | 5.8k | 28.0k | 21.3k | 0.16 | 0.27 | 7.1k | 0.49 |
| 30 | 8.5k | 9.6k | 10.8k | 11.9k | 13.0k | 14.2k | 68.0k | 25.9k | 0.33 | 0.55 | 42.0k | 0.20 |
| 50 | 13.5k | 15.3k | 17.1k | 18.9k | 20.7k | 22.5k | 108k | 48.1k | 0.28 | 0.47 | 45.4k | 0.30 |
| 80 | 21.0k | 23.8k | 26.6k | 29.4k | 32.2k | 35.0k | 168k | 46.3k | 0.45 | 0.76 | 93.7k | 0.22 |
| 105 | 27.3k | 30.9k | 34.5k | 38.1k | 41.8k | 45.4k | 218k | 48.1k | 0.57 | 0.94 | 84.3k | 0.32 |
| 118 | 30.5k | 34.6k | 38.6k | 42.7k | 46.8k | 50.8k | 244k | 39.8k | 0.77 | 1.28 | -12.0k | n/a |

- **Today:** the first refill costs 0.16 to 0.57 of the free gold its four hours earn in a four, and the sixth 0.27 to 0.94. Under Level 105 no refill of the six ever costs more than it earns. The audit's "returns about 3x" is 1.8x to 6x on real numbers. The step between refills is 13% (2/15).
- **PROPOSED, one row:** `stepNum: 1, stepDen: 2` in `src/data/stamina-refill.js`. Refills cost x1, 1.5, 2, 2.5, 3, 3.5 of the first. The base (1,000 + 250 a Level) stays.

| Level | Refill 1 | 2 | 3 | 4 | 5 | 6 | All six | Against 24 h of a four's free gold |
|---|---|---|---|---|---|---|---|---|
| 10 | 3.5k | 5.3k | 7.0k | 8.8k | 10.5k | 12.3k | 47k | 0.37 |
| 30 | 8.5k | 12.8k | 17.0k | 21.3k | 25.5k | 29.8k | 115k | 0.74 |
| 50 | 13.5k | 20.3k | 27.0k | 33.8k | 40.5k | 47.3k | 182k | 0.63 |
| 80 | 21.0k | 31.5k | 42.0k | 52.5k | 63.0k | 73.5k | 284k | 1.02 |
| 105 | 27.3k | 41.0k | 54.6k | 68.3k | 81.9k | 95.6k | 369k | 1.28 |

- **What the player decides then.** Refills 1 and 2 pay for themselves at every Level: buy them if you will be back to use them. The refill where the gold comes out even is the third for a lone hero at Level 10, the fifth or sixth at Levels 30 to 50, the fourth at Level 80 and the third at Level 105. Past that one a refill is gold for Level XP, on purpose, and it is the only place a free player can make that trade by the hour. Levels 30 to 50 stay the soft spot (the sixth costs 0.98 to 1.15 of what it earns) because income jumps there; a steeper step (2/3) would move the line to the fifth refill and is the alternative.
- **Who it moves.** The Heavy four at 1.4 refills a day pays 10% more (REAL use). The Ceiling at six a day pays 1.7 times today's: 7.9M a week at Level 80 against 12.3M in, so "every hour the rules allow" stays affordable from play and stops being free. The Own four buys none either way: stamina does not bind for it, so no refill price sells it anything.
- **Kept:** up to 4 hours, six a day a hero, pro rata, never Crowns (RULED 10-18, 10-19).

## Q5. One-time sinks against repeating sinks

**The Heavy four at month 6.** At its free gold the whole built shelf to Krell is 26 weeks (Q1), so month 6 is the week the shelf runs out. It then frees 1.2M to 1.8M a week at Levels 105 to 118 with these places to put it:

| Repeating sink | Status | Gold a week from the Heavy four | Why it would pay it |
|---|---|---|---|
| Store supplies | live | 1.6M to 1.9M (already in the free-gold figure) | Deadly's bill |
| Refills at the Q4 step | live, one row | 1.2M to 1.3M (already counted at today's price: +0.1M) | Hours |
| Linings, two kept up on each hero (12 hunted hours each, one part and gold, RULED 11-18) | designed (dive 23) | about 590k at 15k a lining (0.1 of 12 hours' free gold, the audit's index) | 20 to 30% less of one element: power that wears off. **The only designed sink that repeats and buys power. Build it before any other sink** |
| The yard at a real fee (below) | live, fee is one row | about 520k at 6 hours a hero a day | Skills, while it is not hunting |
| Town Works on a rotation (card) | live, one project | 175k (the 25k a day cap) | Its name on the plaque of this month's building |
| Market fee and cut | live, closed | 5% of what it trades | |

That is about 1.3M a week of wanted, repeating spend against 1.2M to 1.8M free, with no new system: two rows changed and one designed system built. Past Krell every new band also needs its own shelf rows from the audit's index (change 5), or month 12 is month 6 again.

**The Own four (2.09M held, 17% spent).** What it does, REAL: two visits a day under four minutes, away eleven hours, 5 town hours a hero a day, farms. What it has not bought with 2.09M in hand: six of eight rooms (2.3M), any Tempering, a dummy. It is not saving for anything; it does not know the shelf exists, and nothing on it works while the player is away. So it wants two things:

1. **To be told.** The end card's "Next buy" line (change 2 of the summary). Cheap, and it is the whole reason one person's Tempering is 22% of all gold out while three people have never opened it.
2. **Something that spends gold while it is away, set once.** The after-hunt plan already offers "Train Melee at the yard" (PLAYED, on the Hunt prep page from Level 1). A real hero's main skill is 7 to 10 under the career line by Level 60 and its back row's Defense is 13 to 30 (REAL), and 59% of every hero's life is idle. **PROPOSED: the yard's hourly fee becomes a quarter of a free-gold hour at the hero's Level** (about 1.4k an hour at Level 10, 3k from Level 50; today 50 + 6 a skill level, 212 to 482). At 8 trained hours a hero a day that is about 690k a week at Level 50: more than the Own four spends on everything today, bought by one choice made once, for the thing its heroes are measurably short of. It puts the yard at about 4 REF hours a 1%, beside Tempering's first rungs instead of ten times under them. The rate (30,000 an hour) and whether skill from the yard needs its own cap are dive 21's; Tyler ruled the rate flat (11-14), and this changes only the fee.

What does not work for the Own four: refills (stamina does not bind), the crier, rounds and powders (nobody is in town to see them at 10 online), and anything that needs a visit to renew.

## Q6. The Buyer on day 30

Gold without limit, the Heavy four's 35 attended minutes a day. What it holds on day 30 that the Heavy four does not:

| What | The Heavy four gets it | The Buyer's edge | Kind |
|---|---|---|---|
| Hero slots 2 to 4 (2.55M) | about day 18 (ASSUMED: lone at 8.4 h a day frees about 470k a week, then two and three heroes) | A four from day 1: about 18 days of party pace (2 to 3 times a lone hero's XP a head, REAL) on four heroes instead of one | Time. The largest single edge |
| Six refills a hero a day | 1.4 a day (REAL) | Up to 24 hunted hours a hero a day against 8.4: 2.9 times the hours, if it visits two or three times a day to buy them | Time |
| Tempering, both tracks, every tier from the hour the gear is worn (21M for four heroes to Krell) | Rungs 1 to 3 of most tiers; the top rungs late or never | +1 to +1.5% XP and 2 to 3% less damage over the Heavy four at any moment | Rate, inside the Add pool |
| Training items on every hero every day (250k a 12 hours) | The yard | Up to ten skills over the line: +1 to +7% XP, and much less damage under Level 60 (CITED `01-model` levers) | Rate. **The largest gold-bought power today**; dive 21 owns its cap |
| Hallmarks kept current on six pieces a hero | Some | A few percent (PROPOSED sizes) | Rate |
| House rung 5 and the Castle | Later | None from gold alone: both need bars, planks and drops, and the market that would sell them is closed until 1,000,000 is given | Blocked by items, which is correct |
| The plaque, the Gold Given board, rounds every day | Sometimes | Being seen | Status |

- **In rate** the Buyer is about +10% over the Heavy four at the same Level: inside one weapon tier step, which is the Add pool's cap. **In time** it has about 4.6 times the hunted hero-hours by day 30 (2,880 against about 620, ASSUMED from the rows above), which on the real pace is past Krell by about day 12.
- **Nothing here is power a free player cannot reach.** The Ceiling column of Q1 funds six refills a day from play at every Level (it frees 3M to 7.5M a week after paying for them). Bought gold makes it sooner. That is the ruling's line (11-18) and it holds.
- **Is the edge big enough that Crowns sell?** Yes in a server's first three weeks: the slot ladder is 2.55M when a lone hero frees 25k to 150k a week, and it is the difference between playing the lone game and playing the party game. After that the Heavy four out-earns the shelf and bought gold buys only the top rungs and the refills. So Crowns sell at the start of every server and to newcomers on an old one, which is when a player decides whether to pay. What limits the trade is the other side: **somebody has to want Crowns enough to give gold for them** (Q7).
- **Flag for Tyler:** with gold-bought refills the Buyer turns money into Level XP hours at 2.9 times the Heavy four. It is indirect and reachable free, so it is inside the rulings (11-04, 11-18). It is also the thing a Steam review will call pay-to-win first. The Q4 step makes those hours cost real gold at least.

## Q7. Premium

**What a four-hero account pays:** four Premiums, one a hero (RULED 10-17), for one purse, one House, one Storage and one Luck bar (audit contradiction 8).

**What it gets today (READ FROM DATA `src/data/premium.js`):** a 12 hour stamina bar, the full analyzer, Premium outfits, a daily Oak Practice Blade (worth 0 at the Shop, weaker than the free starting sword) and the login count.

**What the 12 hour bar is worth.** Stamina refills 1:1 only while a hero is not hunting, so no bar can give more than 12 hunted hours a day without refills. A player who visits twice a day gets those 12 on the free 8 hour bar. The 12 hour bar gives 12 to the player who visits **once** a day, who gets 8 on the free bar. So the bar is worth one visit a day to the once-a-day player and nothing to anyone else. Real heroes hunt 3.1 to 3.5 hours a day: to them it is worth nothing, four times over.

**What Premium is for, PROPOSED.** It cannot sell power (Tyler 10-19: "What power?"), and it must not sell back a repeated decision, because remembering a choice is free for everyone (the first principle). What is left is honest and small: hours for the once-a-day player, information, looks, a daily gift, and room. So:

1. **Account-wide.** One Premium covers every hero. The purse, the House, Storage and Luck already are; the real player runs four; and the perks below are mostly the account's.
2. **The list:** the 12 hour bar on every hero; the full analyzer; Premium outfits and one free color change a day; the daily gift for each hero (and make it the 1 hour training item Tyler ruled on 10-17, not a blade worth nothing); 100 market listings and 14 day listings instead of 50 and 7; a second saved Storage tab layout or similar room, never a remembered decision.
3. **Who buys it.** Not the Own four with money: nothing above changes its two visits. It buys it **with gold**, through Crowns, because its gold is idle (2.09M, and 0.5M to 1.1M more every week). That is the trade the whole money model rests on: the saver's idle gold for the whale's Crowns. Premium does not have to be strong. It has to be clearly nice and cost the saver nothing it misses, and per-hero times four fails the second half.

Money options for Tyler (no prices here): (A) account-wide, one price, recommended; (B) per hero as ruled, at about a quarter of the account price each; (C) account-wide with the stamina bar per hero as an add-on. B keeps the ruling and makes the four-hero player's bill four times a one-hero player's for the same account perks.

## Q8. The Crowns surface, for the Security list

RULED: Crowns are bought with real money or from players for gold, never earned in play (10-13); they buy Premium time (10-14); everything bought with Crowns is account-bound and only Crowns themselves trade (11-14); a weekly exchange cap and safety caps (10-13/15); Luck is never sold (11-20); stamina never (10-18); training items yes, bound (11-14). Nothing is built.

**Cut first (all old-client residue, live in the database today):** `hr_gem_unlocks` (ten rows: four cosmetics and six house themes priced in gems), the client RPC `hr_buy_gem_unlock`, `hr_gem_unlocks_of`, `account_gem_grants`, the gem prices on hero slots, and the item `hearth_token` ("the IAP bond": tradeable, worth 25,000, **bid on by the Shop**). A premium item the Shop buys for gold is the house printing gold for money, which the rulings forbid. A granted RPC on a dead currency is attack surface with no player.

**The shape, PROPOSED:**

| Part | Design | Why |
|---|---|---|
| What a Crown is | A number on the account (`account_crowns`), never an item. Its own append-only ledger with reason codes, raise and spend only through RPCs, on the server clock | CLAUDE.md §1; an item can be duped, stacked, mailed and sold to a Shop |
| Where Crowns come from | The payment provider's signed webhook, and a walled GM grant. Nothing in play | RULED |
| What Crowns buy directly | Premium time; outfits, dye sets and other looks; bound training items (RULED); a hero rename; nothing else. Every bought thing is account-bound | RULED 11-14 |
| What Crowns never buy | Gold from the house, Level XP, drops, gear, Luck, stamina or refills, hero slots, Tempering or any other sink, a roll of any kind | RULED 11-04, 11-18, 11-20; Steam |
| Crowns for gold | One book on the Weighhouse, Crowns only, in fixed lots. The seller escrows Crowns, the buyer pays gold, the listing fee and the 4% cut are charged on the gold and burned | One reviewed surface (the market's escrow, caps and network guard already exist); the cut makes every whale's purchase a gold sink |
| Clamp 1: a weekly cap | Crowns sold and Crowns bought a week an account (the number is Tyler's; size it so a week's cap buys about one Premium month and a few looks) | RULED |
| Clamp 2: a price band | A lot's gold price must sit between half and twice the 7 day median of real sales; before there is a median, a band from a row | Without it one Crown sold for 50M is a gold transfer between two accounts: the laundering route |
| Clamp 3: one trade | A Crown bought with gold is bound to that account: it can be spent, never listed again | No speculation, no wash loop, and the weekly cap means what it says |
| Clamp 4: a hold | Crowns bought with money cannot be listed for N days (the provider's chargeback window decides N), and an account in arrears is shut out of the market | Chargeback fraud lands on the house, not on the player who paid gold in good faith |
| Clamp 5: who | The market's Level 10 door, the same-network guard (`hr_market_same_network`), and the per-day spend and proceeds caps apply to this book too | They exist |

Open for Security, not ruled here: whether gold paid for Crowns counts against the 2M a day market caps (it should), what a refund does to Premium time already used, and Steam's wallet rules for a currency players can trade.

## Q9. The market

**Today (READ FROM DATA, `2027-01-12-market-account.sql`):** listing fee 1% with a floor, 4% cut, both burned; listings last 168 hours; 50 open listings, 200 a day; 2,000,000 gold a day spent and 2,000,000 received, an account; a price ceiling of 100 times an item's book value and never under 1,000 a unit; Level 10 or a skill at 30 to list; a same-network guard. REAL: 7 listings, 3 sales, all to a test account.

**PLAYED:** on a new server the Weighhouse says "Not open yet" until Town Works reaches 1,000,000 gold, at most 25,000 a day an account. Real players have given 57,000 in all.

**At 10 online.** The market cannot open: ten accounts giving the cap every day need four days, and real giving is one person. If it were open it would have no depth, so nothing in it sets a price. What sets a price then is the Shop on both sides: its bid is the floor (nobody lists under what the Shop pays, plus the 5%) and its sell price is the ceiling for anything it sells (supplies, tools, plain jewelry). For gear the Shop sells nothing, so the only anchor is the reference value the items dive's tool computes, shown as the suggested price. **PROPOSED:** the Works goal reads from a row sized to the server (about 20,000 a weekly active account, 250,000 at the least), so a playtest of ten opens its market in a week and a server of 1,000 in a day. A standing buy order ("I pay X each for mithril bars") would let two players who are never on together trade, which is the real fix for a thin market, and it doubles the money surface: HOLD until there are players to need it.

**At 10,000.**

| Question | Answer |
|---|---|
| Listings a page | One book an item, grade and perks as filters (the plan's rule), server-paged by `hr_market_browse`. About 530 graded rows is 530 thin books: the suggested price has to carry them |
| The fee and cut as sinks | 5% of traded gold. If a tenth of gold in is traded that is 0.5% of gold in: a real sink only for traders. The Crowns book is where it becomes large |
| Wash trades | The same-network guard, and every pass costs 5%. Worth nothing unless a board ever ranks by trade volume: never build one |
| Price walls and cornering | 50 listings and 2M a day spent bound one account; a clan of ten is ten times that. Watch `market_item_daily` for one buyer taking over half a book |
| Gold transfer for real money | A stack of 1 gold junk may list at 1,000 a unit (the ceiling's floor), so two unrelated accounts can pass 2M a day through rat tails. The day caps are the only clamp. **For Security: drop the ceiling's floor to about 20 times book for stackables** |
| The day caps against prices | A Hallmarked piece may list at 1M and a tier 7 one higher; anything over 2M can never be bought at all. Either the caps rise with the buyer's Level or no ceiling may pass the cap: OPEN, Security |
| Repeated decisions | A listing that runs out is re-listed by hand at the same price. "List again" on the expired row, and "always list these at the suggested price" as a loot rule, belong with the loot rules |

## Q10. The small sinks, the tally, Town Works

| System | Real use | Earns its screen? | Verdict |
|---|---|---|---|
| Town Crier (1k to 16k a line, 5 a day) | 0 | No screen of its own; it is a line in chat. Worth nothing at 10 online, a real price at 1,000 | Keep as built |
| A Round for the Tavern (5k, 10k, 20k) | 2, one person | One tab of the Havora window. The art is done | Keep |
| Flame powders (2k to 10k, 5 a day) | 8, one person | One tab of the same window | Keep |
| Setup slots 4 and 5 (15k, 40k a hero) | 0 paid, 18 free setups saved | A line in the bar's menu. Selling a remembered choice sits badly with the first principle; three free covers everyone so far | Keep (RULED 11-05); never raise the free count's price |
| Hero colors (1,500 + 50 a Level), rename (20k + 500 a Level) | 0 | Lines in the Character window | Keep |
| Titles (five for gold after the kills, two prizes) | 0 real | A tab. A title has to be seen by other people to be worth gold: check where one shows | Keep; throughput is a row a title |
| Gold Given board | one giver | It is the Works plaque under another name | **Merge into Town Works** |
| Tamsin's tally | all 4 people, 176 pays, 2% of gold in | **Yes.** It is the first thing the game tells a new player to do (PLAYED), it pays by itself at the hunt's end, "Keep this task" re-takes it, and her piece fills the next gear tier. Its gold is small on purpose | Keep |
| Town Works | 6 gifts, one person | Yes, and it now gates the market. But it is one project: when the Weighhouse stands the system is at zero for good | **Fix** (card) |

None of the small sinks moves a ledger (together 0.5% of real gold out). They are what a rich player does to be seen, they are built, and the right amount of further work on them is none until there is a town with people in it.

## The cards

Thirteen answers each, in the order of `02-requirements.md`. "Q1" means the gold model above; prices in weeks are weeks of free gold from it. What was played is said under answer 10; what was not played is listed in the last section.

### purse-ledger (live): the account purse, the ledger and gold history. **KEEP**

1. **Purpose.** One purse an account so four heroes are one economy (RULED 10-23), and one journal so every gold number can be audited. The decision it gives is which hero gets the gold. Useful at every hour.
2. **First principle.** Nothing repeated. Gold history is by hunt and by purchase (RULED 10-23), so nothing is added up by hand.
3. **Ledgers.** Neither source nor sink: every gold movement passes through `hr_purse_move` and lands in `player_ledger`. REAL: 14.27M in, 11.36M out, purses equal the journal.
4. **Budget.** No lever. At Level 400 the purse holds what the faucet gives: see income.
5. **Players.** All seven use it every hour. PLAYED: the purse is not on the town screen. A new player first sees "Gold: 500 gp" on the Hunt prep page and in the Shop.
6. **Server cost.** CITED `tests/per-player-cost.baseline.json`: 44 to 48 ledger rows a hero-hour today; the prune (480,000 rows a day) is outrun near 560 daily heroes (`measure.mjs cost`: 2.3M rows a day at 1,000 online). `player_ledger_rollup` and lane/c-ledger-fold exist and are off. This is the economy's one scale debt: for dive 28.
7. **Population.** Per account; no contention.
8. **Server age.** Purses only grow where sinks are one-time (Q5). The journal is the tool that will show it.
9. **Exploits.** A client never names an amount: every verb re-quotes on the server (`quote_changed`). Four heroes spending one purse at once: `hr_purse_lock`. Day budgets: `hr_day_budget_check`. OPEN: none found by reading; the full review is the pre-EA Security gate.
10. **Teaching.** PLAYED: no purse on the HUD in town; it is inside windows. The hunt's end card shows "Gold +130 gp, 140 gp in coins, 10 gp on supplies" and "Balance 631 gp", which is clear. A purse line on the town HUD is an Art Director handoff.
11. **Throughput.** None: no content.
12. **Monetization.** Crowns must be a second wallet with its own ledger, never a column on this one (Q8).
13. **Telemetry.** Gold in and gold out a day by reason code (`tools/economy-watch.local.mjs`). Target: repeating sinks at 35 to 50% of gold in server-wide. Red line: gold in purses growing over 5% a week for four weeks.

Uniqueness: none needed; it is plumbing. Rulings: ACCOUNT GOLD 10-23 COMPLIES; GOLD HISTORY 10-23 COMPLIES.

### income (live): coin a kill, the income dial, what loot sells for. **FIX**

1. **Purpose.** The wage. The decision: which ground and way pays (players "should figure out which hunts are good", RULED 11-13), and what to sell or keep.
2. **First principle. Flagged twice.** REAL: 14,792 gear pieces sold by hand, each a decision already made; loot rules sit on 2 of 5 accounts. PLAYED: "Sell all junk" keeps eight material stacks "sell them by hand" every time. The rule should be offered at the first sale and remembered.
3. **Ledgers.** Gold source: 0.30 a monster hit point, x0.7 on nine grounds, plus the Shop's bid on drops. A hero-hour: Q1's first table. REAL split: coin 72%, sold loot 26%, tally 2%. Items sink: 86% of dropped gear is sold.
4. **Budget.** Flat from Level 50 to 80 on, because it follows damage an hour and gear ends at tier 7 (Q2). At 240 and 400 nothing changes it (FORMULA). A wage that falls on a new ground is the finding.
5. **Players.** New: 1.8k an hour and it sold nothing (REAL). Own four: 0.5M to 1.1M free a week. Heavy: 1.1M to 2.3M. Tiers never change gold (RULED 11-07), so Deadly's pay is its faster kills only.
6. **Server cost.** On the settle path already; `vendor_sell_many` is one call for a whole sale. No change proposed that adds a statement.
7. **Population.** Per hero. The Shop buys without limit at a fixed bid, so 10 or 10,000 online earn the same: the Shop is the economy's floor at any size.
8. **Server age.** The faucet has no cap an account: total gold grows with hours hunted. Month 6 inflation is whatever the sinks do not take (Q5).
9. **Exploits.** Four heroes are four wages (the design). Shop arbitrage (buy, craft, sell back for more) is held by `tests/craft-wages.mjs` and the reference-value guard (dive 23). A party kill pays coin split evenly. OPEN: none read.
10. **Teaching.** PLAYED: after hunt one the card says "Unsold loot value 501 gp" beside "Gold +130 gp" and offers Equip, Bless, Next ground, Next buy, Open bag. Selling is Town > Shop > Sell, three presses nobody is told about. That is where one of two real new players stopped earning.
11. **Throughput.** A ground's gold is its formula; nothing to hand-tune once the dial is one line.
12. **Monetization.** None directly. Salvage (RULED) will let a player give up sold-loot gold for Luck: a choice, and it shrinks the faucet for those who take it.
13. **Telemetry.** Share of accounts with a loot rule by hour 2 (target over 80%); gear pieces sold by hand a week (target under 10% of sold); sold loot as a share of gold in (26% now).

Rulings: NO PROFIT MOLDS 11-13 COMPLIES (the proposed line is about the faucet; Tyler to confirm). GOLD FIX = CUT INCOME 11-16 COMPLIES (the dial is kept, as one number). TIERS NEVER GOLD 11-07 COMPLIES.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| End card: "Sell junk for N gp" and the loot rule offered at the first sale | income, shop | gold in (new players), attention | S | no (verbs exist) | first-hour | PLAYED; REAL 14,792 hand sales, one player sold nothing |
| Fold x0.7 into the formula from monster Level 16; +0.5% gold a hit point a Level past 88; report "never less than the last ground" | income | gold in past Level 88 | S | catalogue regenerate | long-chase | MEASURED 24.0k, 22.0k, 17.2k, 19.4k; re-measure after dive 21 |

### store-supplies (live): store supplies paid per use, the one-tap refill, own stock first. **KEEP**

1. **Purpose.** The cost of fighting hard: food, drinks, runes, ammunition, bought as they are used. The decision is the tier and the way (Deadly and runes cost gold for pace) and whether to make your own. This is the only sink that scales with how hard a player pushes, at hour 1 and hour 1,000.
2. **First principle.** Good: own stock first, the store fills the rest, the bar is saved. The gold reserve ("Below this, stops buying supplies and ends the hunt", PLAYED) is set once.
3. **Ledgers.** Gold sink: REAL 2,835 a hunted hour over everyone, 33% of gold out, runes 55% of it. By seat (Q1): a lone Normal hero 0 to 900 an hour; a Deadly four 48 to 56% of coin. Converter: town hours to gold saved (a third of all supplies used are home-made).
4. **Budget.** Rises with damage taken and mana spent, so it follows the Multiply levers, not Level. On the staged grounds the lone hammer's food is 20k to 45k an hour: dive 21's to-hit.
5. **Players.** New: 120 an hour. Own four: 31k to 730k a week. Buyer: half again as much, all store. REAL: no kept hunt has ever ended on supplies or on gold.
6. **Server cost.** Inside the settle already. No addition.
7. **Population.** The store never runs out, so it works at 10. At 10,000 it is the ceiling on every crafted supply's market price.
8. **Server age.** Does not inflate. On an old server, market supplies under the store's price make Deadly cheaper for newcomers: good.
9. **Exploits.** Buying from the store to sell to the Shop loses gold by construction. Home-made stock sold above the store's price: nobody buys. OPEN: none.
10. **Teaching.** PLAYED: the Hunt prep page says "Food: 20 Cooked Shrimp, then Salted Shrimp (14 gp)". The end card lists "Supplies used ... from the store". Clear.
11. **Throughput.** A supply row a tier; done to tier 7.
12. **Monetization.** The Buyer's largest repeating bill, which is correct. Never Crowns.
13. **Telemetry.** Store bill as a share of coin by tier and Level band (Deadly 48% now; a red line under 30% means Deadly got cheap). Hunts ended on supplies or gold (0 now; a rise among new players is a P1).

Uniqueness: paying as you use, with your own cooking going first, is this game's own and reads well on the card. Rulings: STRUGGLE OR PAY 11-19 COMPLIES for Deadly from Level 60; GOLD FIX 11-16 (prices kept) COMPLIES.

### shop (live): the Shop, buy, sell, services, buyback. **FIX**

1. **Purpose.** The first tools and gear, the price floor under every item, and the counter for Blessings, Tempering and stamina. Decision: sell or keep.
2. **First principle.** Buying is fine. Selling is the income card's flag.
3. **Ledgers.** Gold source (its bids) and sink (its prices: REAL 140,895 on supplies, seeds and jewelry, 1% of gold out). Items source for tools, seeds, plain jewelry.
4. **Budget.** Its gear is tier 1 and plain jewelry at a premium (3,000 and 12,000, RULED 11-05). No lever.
5. **Players.** Everyone, first hour. PLAYED: 500 gold on arrival buys one or two pieces of the 100 to 360 gear row.
6. **Server cost.** One call a purchase or a sale. Inside the allowance.
7. **Population.** Works alone. It is the whole economy at 10 online.
8. **Server age.** The floor never moves, so it is what a newcomer can always rely on.
9. **Exploits.** A mis-sale has no undo: "Sell all junk" asks once ("Sell 2 stacks?", PLAYED), a loot rule never asks. Buyback is ruled and not built; `src/core/shop-buyback.js` exists.
10. **Teaching.** PLAYED: Town > Shop, tabs Buy, Sell, Services. **Services is where Blessings, Tempering and stamina live, and nothing points to it**: Tempering reads "Not temperable, requires gear from Level 15" and is never mentioned again. One real person found it.
11. **Throughput.** Rows.
12. **Monetization.** None.
13. **Telemetry.** Accounts that opened Services by Level 20; Tempering buyers as a share of accounts past Level 30 (1 of 3 now; target over half).

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| "Next buy" on the end card walks the shelf (Tempering rung, room, slot, the yard) with its cost in hunts | shop, hero-slots, and dives 23 and 26 | gold out for the 17% spender | S | no | first-week | PLAYED the line exists; REAL Tempering 1 person, 2.09M idle |
| Build buyback (the last sales, at the price paid, for a day) | shop | none (a safety net) | S | yes, small | first-week | RULED, not built; loot rules sell 15,157 pieces unseen |

### market (live): the Weighhouse. **FIX**

1. **Purpose.** Gold between players and a price for everything; later the road Crowns take. Decision: sell to the Shop now or to a player for more.
2. **First principle.** Flagged: an expired listing is re-listed by hand (Q9).
3. **Ledgers.** A transfer, with two sinks on it: 1% to list and 4% of the sale, burned. REAL: 2,150 gold of fees in all.
4. **Budget.** No lever. It moves gear across accounts, so every item's drop rate is also market supply (dive 23).
5. **Players.** New: closed until Level 10. Own four: never used. Buyer: this is where bought gold becomes gear. Four friends: the natural way to pass a drop to a friend, at 5%.
6. **Server cost.** `hr_market_browse` a page; two crons (expire, prune). Nothing on the settle path. At 10,000 the browse is the hot read: one book an item, server-paged.
7. **Population.** Q9. Closed at 10 by the Works gate (PLAYED), thin if open.
8. **Server age.** Month 6: tier 1 to 5 gear floods and prices fall to the Shop's bid, which is the floor. A newcomer buys a tier for little: good catch-up, and the reason gear tiers are worn by Level.
9. **Exploits.** Q9's table: wash (network guard, 5% a pass), gold transfer through junk at the 1,000 ceiling floor (day caps only: for Security), caps under item prices (OPEN), the Crowns book (Q8's five clamps).
10. **Teaching.** PLAYED: "Not open yet. Once it's built, players list items here and buy each other's for gold. Everyone in town builds it together at Havora > Works. 0 / 1,000,000 gp given. Go to Works." Clear, and on a small server permanent.
11. **Throughput.** None.
12. **Monetization.** The Crowns book rides it. The cut on gold paid for Crowns is the sink that grows with whale spending.
13. **Telemetry.** Sales a day to real accounts (0 now: a P1 by CLAUDE.md §3.4 once it is open); share of listings sold before they expire; one buyer over half of a book.

Rulings: MARKETPLACE 10-24 ("as convenient as a modern trading application") OPEN: it is closed on a new server.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| The Works goal that opens the market is sized to the server (20,000 a weekly active account, 250,000 least) | market, town-works | none | S | one row and a read | first-week | PLAYED the gate; REAL 57,000 given |
| "List again" on an expired row; a loot rule that lists | market | attention | S | no | long-chase | first principle |
| Ceiling floor for stackables down from 1,000 a unit; day caps against item ceilings | market | none | S | config rows, Security | long-chase | READ FROM DATA |

### player-trade (ruled, not built): player-to-player trade. **MERGE into the market**

Not built, so the card is against the ruling (10-18: a separate server lane after the market, a money surface with a full Security review).

1. **Purpose.** Giving an item or gold to a named person: a friend, a party member, a clan mate. The market cannot do that today; Storage does it only between your own heroes (RULED 10-23).
2. **First principle.** A trade window is two people online pressing in turn. A listing is made once.
3. **Ledgers.** A transfer with no fee: it would be the one road around the market's 5% and around every clamp Q8 puts on Crowns.
4. **Budget.** None.
5. **Players.** Four friends are who it is for. The Own four has nobody to trade with. The Buyer would use it to hand gold to anyone, which is the real-money trade's favorite tool.
6. **Server cost.** A second escrow, a second set of caps, a second review.
7. **Population.** Needs both people online: at 10 online that is rare. A listing does not.
8. **Server age.** Feeds twinking: a veteran hands a newcomer a full set. Gear is worn by Level, so the cap is natural.
9. **Exploits.** Everything the market's clamps exist to stop, with none of them: gold for real money, alt feeding, scams ("swap at the last second").
10. **Teaching.** Not built.
11. **Throughput.** A whole surface to build and review.
12. **Monetization.** It would let Crowns-bought gold move with no cut: against the model.
13. **Telemetry.** Not built.

**PROPOSED instead: a listing for one named player on the Weighhouse.** Same escrow, same fee and cut, same day caps and network guard, the price inside the item's band, visible only to the friend. It solves the friend's problem, works when one of them is offline, and adds no second money surface. Tyler ruled trade as its own lane, so this is his to rule: item 6.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Player trade becomes "list for a friend" on the market; no direct trade window | player-trade, market | none | M | yes, on the market's functions | long-chase | no real two-person play exists; one surface to review |

### gold-sinks (live): the Town Crier, a Round, flame powders, setup slots, hero colors, rename, titles, the Gold Given board. **KEEP**

1. **Purpose.** Being seen: what a rich player does with gold that buys no power (RULED 11-04). Decision: none that matters, on purpose.
2. **First principle.** Each is a single press with a climbing price a day. Nothing repeated.
3. **Ledgers.** Gold sinks. READ FROM DATA `src/data/gold-sinks.js`: powders 2k to 10k (5 a day), a round 5k, 10k, 20k (3 a day), the crier 1k to 16k (5 a day), setup slots 15k and 40k a hero, colors 1,500 + 50 a Level, rename 20,000 + 500 a Level, titles 1,500 to 40,000 after the kills. An account that buys every daily one spends 96,000 a day. REAL: 48,000 in all, one person.
4. **Budget.** No power, by rule (`tests/town-works.mjs` TW-NO-BUFF and the file's header).
5. **Players.** New: cannot afford one (a powder is 2,000 against 655 gold after hunt one, PLAYED). Own four: zero use. Heavy: 78 gold a hunted hour. Buyer: the plaque and the fireworks every day, which is 672k a week it is glad to burn.
6. **Server cost.** A purchase is one call and one ledger row. A round is a 45 second show pushed to everyone in town and booked at most 180 seconds ahead (`bookS`, READ FROM DATA), so the queue, not the population, bounds how many play.
7. **Population.** At 10 online nobody sees them. At 1,000 the crier's 30 second server-wide gap is the contended thing: 2,880 lines a day for everyone, and the climbing price rations it.
8. **Server age.** Titles are the long part: kills first, then gold. A newcomer can earn every one.
9. **Exploits.** Crier lines are chat: they need the chat filter and a report path (dive 25). Rename once a day stops name passing. Nothing rolled, so nothing for Steam.
10. **Teaching.** PLAYED: Town > Havora has Hearth, Round and Works tabs with the price, what it does and "Today: 0/3". Clear. Not played: the crier, titles, colors, rename, setup slots.
11. **Throughput.** A title is a row; a powder color or a round is art.
12. **Monetization.** Looks belong in the Crowns store too; these stay gold.
13. **Telemetry.** Uses a week of each (all near zero; do not act until the town has 50 people in it).

Rulings: NEW GOLD SINKS 11-04 COMPLIES; SINK CALLS 11-05 (3 free setups, the board stays) COMPLIES. No change row: the Gold Given board's merge is on the town-works card.

### hero-slots (live): hero slots at 300k, 750k and 1.5M, four heroes at once. **KEEP, with a warning**

1. **Purpose.** Your own party. Decision: the first big save of the game, against Tempering and the House. RULED 11-09: "like a week to afford the first alt", for main-hero identity and so people invite friends.
2. **First principle.** Bought once. But four heroes are four of every press: the party's start, stop and supply are for dives 21 and 27.
3. **Ledgers.** Gold sink, 2.55M once (REAL: 330,000 for seven slots, all at the old prices). Time lever: account output x4. Power, in effect: a four on Deadly earns 2 to 3 times a lone hero's XP a head and dies a fifth as often (REAL).
4. **Budget.** Time class, capped at four (RULED).
5. **Players.** The first slot is 28 lone REF hours at Level 30 (Q1) and about what a lone hero banks by Level 30 (CITED: 226k in the 15 to 30 band). **In days, at about 40 lone hunted hours (ASSUMED: between the real median of 32 hours to Level 30 and the pace table's 52): 5 at 8 hunted hours a day, 12 at 3.3, 20 at 2.** Slots 3 and 4 follow in about 2.5 and 2 weeks each at 3.3 hours a day. So the Own four has its four near week 8 if it buys nothing else, the Heavy four near day 18, the Buyer on day 1.
6. **Server cost.** Each hero is a full hunting hero: 4x everything in `measure.mjs cost`. The slot price is also what holds the server's hero count down early.
7. **Population.** Works alone, which is the point and the problem: at 10 online the lone phase has no party to join (party finder: 0 uses).
8. **Server age.** Month 6: a newcomer is alone for 30 hours beside veterans' fours. Scaled hunts (RULED) are the bridge and are unused.
9. **Exploits.** Four free accounts are four heroes for nothing, with four purses that cannot share except through the market's guarded doors. That is "four friends", and it is cheaper than slots: the same-network guard is what keeps one person from doing it.
10. **Teaching.** PLAYED: the character list says "Second hero slot: 300,000 gold (max 4 heroes). Group with other players: Party > Find a party. Need 299,345 more gold." Honest and a long way off.
11. **Throughput.** None.
12. **Monetization.** The first thing bought gold buys, and the best (Q6). Never Crowns directly (the gem prices on slots are residue to cut).
13. **Telemetry.** Hunted hours to the first slot (target 30 to 50); share of accounts that quit before it (the number that says whether the ruling's bet paid).

**The warning.** The real "own four from Level 10" was bought at the old prices. On today's a new account plays one hero through Levels 1 to 30, which is where real lone heroes die 6.7 to 8.9 times in 100 hours and where both light players stopped. The slot price did not cause that (they quit at Level 7 to 9), and it will not fix it either: the lone game from 1 to 30 has to be good on its own, because under this ruling it is the first two to three weeks of every account. Item 9 for Tyler.

### tally (live): Tamsin's tally. **KEEP**

1. **Purpose.** It tells a hero where to go next and pays the gear piece the next ground wants. Decision: which task, and which armor weight she pays in.
2. **First principle.** Good: "Keep this task" takes it again, and she pays at the hunt's end without a visit (PLAYED: "Tamsin paid Hobb 25 gp and a Bronze Helm for Giant Rats").
3. **Ledgers.** Gold source: 25 to 4,290 a task, three paid a day a hero. REAL: 187 a hunted hour, 2% of gold in. Items source: one piece a task, once.
4. **Budget.** Her piece is the next tier's, never above it (Replace class). Gold is a third of an hour's coin by design.
5. **Players.** All four real people use it. A four's kills count for each hero, so the cap is 12 pays a day an account: 51,000 a day at Krell if every hero claims, which is the Ceiling's and nobody's so far.
6. **Server cost.** A count on the kill path that exists; one ledger row a pay.
7. **Population.** Alone. Three of eleven tasks say "party".
8. **Server age.** Same for a newcomer. The pieces are one-time, so a veteran takes only gold.
9. **Exploits.** Three a day a hero, on the server's day. Kills are the server's. A wait in the local world does not cross a day, so the reset was not played.
10. **Teaching.** PLAYED: it is the game's first tip ("Open Tamsin's tally > Take Giant Rats"), and the board lists all eleven tasks with their ground and Level. It is the best-taught system in this domain.
11. **Throughput.** One row a ground.
12. **Monetization.** None.
13. **Telemetry.** Pays a hero a day (about 0.4 now of 3, REAL 176 pays). A drop to zero for a ground means its task count is wrong.

### town-works (live): the whole server builds one project. **FIX**

1. **Purpose.** A shared goal that changes the town, and a place for surplus gold. Decision: how much to give.
2. **First principle.** A gift is a press; there is no standing gift, and there should not be one for a donation.
3. **Ledgers.** Gold sink: at most 25,000 a day an account, 1,000,000 in all. REAL: 57,000.
4. **Budget.** No power (TW-NO-BUFF). It does gate the market (PLAYED).
5. **Players.** New: PLAYED, the window offers "Give all 655 gp" to a Level 5 hero who has just earned its first gold. Own four: nothing. Heavy: six gifts. Buyer: the plaque.
6. **Server cost.** `town_works_totals` is one row a project; a view a window open. Inside the allowance.
7. **Population.** At 10 it never finishes (Q9). At 1,000 it finishes in a day and is then empty forever.
8. **Server age.** Month 6: built long ago, plaque full, nothing for a newcomer to join.
9. **Exploits.** The day cap stops buying the plaque in one night. Alt accounts each have a cap: rank is by account, so ten alts are ten small names, not one big one.
10. **Teaching.** PLAYED: "Staked out: 0 of 1,000,000 gp. 100,000 gp more and it has its footings. Left today: 25,000 gp." Clear.
11. **Throughput.** A project is one row and five stage sprites. A server of 1,000 eats one in a day at a fixed goal.
12. **Monetization.** The place bought gold goes to be seen. The indirect Crowns link was accepted (RULED 11-05).
13. **Telemetry.** Share of weekly active accounts that gave (4 to 10% is healthy for a donation); days a project took.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| A project a month, its goal from the weekly active count; the Gold Given board becomes the plaque's all-time page; "Give all" goes | town-works, gold-sinks, market | gold out, repeating: up to 175k a week an account | M (art a project) | rows and one read | long-chase | PLAYED; one project, 57,000 given |

### stamina-refill (live): stamina for gold. **FIX**

1. **Purpose.** Hours for the player who has more time than stamina. Decision: is the next four hours worth this price.
2. **First principle.** A press every time, by design: it is a price, and an automatic one would be a tax. Six a day a hero is 24 presses for a four that maxes it: the Ceiling's problem only.
3. **Ledgers.** Gold to hunt hours: Q3 and Q4. REAL: 81 uses, one person, 840,534 gold, 7% of gold out.
4. **Budget.** Time class: up to 24 hunted hours a hero a day. With Deadly and four heroes this is the audit's "five to six times the table".
5. **Players.** Q4. Own four: never (stamina does not bind). Heavy: 1.4 a day. Ceiling and Buyer: six.
6. **Server cost.** One call and one ledger row a refill: `measure.mjs cost --add ledger=1,writes=1 --share 0.25` is inside the allowance. What it really costs is the extra hunted hours it buys: up to 3 times the settles a hero a day.
7. **Population.** Per hero.
8. **Server age.** It is how a newcomer catches up on hours, at a price that is small early (0.16 to 0.5 of what the hours earn).
9. **Exploits.** Count and price on the server's day and clock; the client shows a quote. A refill is not a roll, so the 32 second horizon gives nothing.
10. **Teaching.** PLAYED: a gold "+" beside the stamina clock opens "Bought today: 0 of 6. Each refill costs more." With the bar full it shows no price, so a player cannot learn what a refill costs until the bar is down.
11. **Throughput.** None.
12. **Monetization.** Never Crowns (RULED). The Buyer's biggest lever all the same (Q6).
13. **Telemetry.** Refills a hero a day by Level band; the share of accounts that ever bought one (1 of 5 now). Red line: refills 5 and 6 over a quarter of all refills (they are meant to be the expensive ones).

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Step 2/15 becomes 1/2 (x1 to x3.5); show the price while the bar is full | stamina-refill | gold out for heavy players (+10% at 1.4 a day, x1.7 at six) | S | one row, regenerate | first-week | `gold-model.mjs --refills` |

### premium (live, on for everyone in beta): Premium. **FIX**

1. **Purpose.** Tyler's first income (11-18). For the player it must be: more room, more information, more looks, an extra visit saved. Today it is a 12 hour bar that helps only the once-a-day player (Q7).
2. **First principle.** The daily login claim is one press a hero a day, four for the real player, for a blade worth nothing. Pay it with the first press of the day, to every hero.
3. **Ledgers.** Time: +4 hunted hours a day for a once-a-day hero, 0 for anyone visiting twice. Items: a v:0 practice blade a day.
4. **Budget.** Time class. No power, and it must stay that way.
5. **Players.** Everyone has it in beta, so nobody has ever chosen it. Premium own four: gains nothing measurable over the Own four.
6. **Server cost.** A column read; no cost. A 12 hour bar is more hunted hours for once-a-day players.
7. **Population.** Per account.
8. **Server age.** None.
9. **Exploits.** `hr_premium_grant` is owner-only. The beta switch must be off at the wipe (RULED 10-23). Premium time bought with Crowns bought with gold is the intended loop.
10. **Teaching.** PLAYED only by its absence: in the first hour nothing says Premium exists or that the 12:00h on the clock is its doing. Not played: a Premium screen.
11. **Throughput.** Outfits are the content: art an outfit.
12. **Monetization.** Q7's three options. The price is Tyler's.
13. **Telemetry.** After the switch is off: Premium accounts as a share of weekly actives, and how many of them paid with gold through Crowns.

Rulings: PER CHARACTER 10-17: this dive recommends account-wide; BREAKS until Tyler rules (audit contradiction 8). Daily training weapon 10-17: BREAKS as built (the reward is an Oak Practice Blade, not the 1 hour training item).

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Premium account-wide, with the Q7 list; the daily gift paid to every hero on the first press | premium, outfits, market | hunt hours (once-a-day players), attention | M | yes (`premium_until` to the account) | first-week | Q7; REAL 3.1 to 3.5 hours a day against an 8 hour bar |

### crowns (ruled, not built): Crowns, and the old gem rows. **BUILD, after Premium is settled and the market is open**

1. **Purpose.** Tyler's second income, and the way a saver's idle gold becomes something. Decision for a payer: Premium, looks, or gold. Decision for a saver: is Premium worth this much of my gold.
2. **First principle.** A purchase. Nothing repeated.
3. **Ledgers.** A new ledger. Converter: Crowns to gold between players at a floating rate, capped a week. It adds no gold to the game; it moves gold from savers to spenders, and the 4% cut burns some on the way.
4. **Budget.** No direct power. Indirect: Q6, about +10% rate and up to 2.9 times the hours, all reachable free.
5. **Players.** New: can buy a hero slot's worth of gold in week one, if a saver is selling. Own four: the seller of gold. Buyer: the buyer. Four friends: one of them funds the others' looks.
6. **Server cost.** A wallet row, a ledger row a movement, one more book on the market.
7. **Population.** At 10 there is no rate: one seller and no buyer. It needs the market open and a few hundred accounts. Do not open it on a playtest.
8. **Server age.** Early, gold is scarce and a Crown buys little gold but that gold buys slots: strong demand. Late, gold is cheap and a Crown buys a lot of it: the rate drifts with the shelf, which is one more reason the shelf needs repeating sinks.
9. **Exploits.** Q8's five clamps, the cut list, and the three open questions.
10. **Teaching.** Not built.
11. **Throughput.** Looks to sell: art.
12. **Monetization.** This is it. Real prices are Tyler's.
13. **Telemetry.** Gold paid for a Crown (the rate), Crowns traded a week against the cap, the share of Premium time paid in gold-bought Crowns.

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Cut `hr_gem_unlocks`, `hr_buy_gem_unlock`, `account_gem_grants`, gem prices on slots, `hearth_token` | crowns | none | S | yes (chain retire) | none for players; Security surface | READ FROM DATA |
| Build Crowns as an account wallet with its own ledger, the store's bound goods, one Weighhouse book and five clamps | crowns, market, premium, outfits | Crowns (new); gold between players | L | yes, Security gate | long-chase | RULED 10-13 to 11-18 |

### outfits (live): outfits, dyes and the hero's look. **KEEP**

1. **Purpose.** A look other players see, and the thing a collector chases. Decision: which.
2. **First principle.** A look is set once and kept; colors are saved a hero.
3. **Ledgers.** Gold sink (colors 1,500 + 50 a Level, ten a day). Sources of looks: Premium, the Hearth Chest's bundle, faction pieces.
4. **Budget.** No power, by the file's own rule.
5. **Players.** Everyone picks a starting outfit and four colors at creation (PLAYED). REAL: zero dye changes since.
6. **Server cost.** One row a hero; drawn from the envelope.
7. **Population.** A look is worth what the town's crowd makes it worth: nothing at 10.
8. **Server age.** Chest and faction looks are the veteran's mark; a newcomer earns the same ones.
9. **Exploits.** Ownership is the server's (`hr_outfit_owned`); a Premium look lapses with Premium.
10. **Teaching.** PLAYED: "Starting outfit: Plate Harness" and four color pickers on the hero's first screen. Not played: the Outfit tab.
11. **Throughput.** Art an outfit, and the mask art dyes wait on. This is the Crowns store's main shelf, so the art pipeline sets how much there is to sell.
12. **Monetization.** The honest direct product: bound looks for Crowns.
13. **Telemetry.** Heroes not in a starting look; color changes a week.

## For other dives

| To | System id | Finding |
|---|---|---|
| 21 combat | `training` | The yard sells 30,000 skill XP an hour for 212 to 482 gold with no stamina: about 0.4 REF hours for +1% XP, three to ten times under the cheapest Tempering rung. No real player has used it. This dive wants its fee as the Own four's repeating sink (Q5: a quarter of a free-gold hour). Dive 21 owns the rate and whether yard skill needs a cap; ten skills over the line is the largest gold-bought power the Buyer has (Q6) |
| 21 combat | `blessings` | The set is 0.1 to 0.3 REF hours of gold against a death worth 7 to 27 hunted hours: always bought, 0.06% of gold out. This dive's size for the owned fix: about 2 REF hours a set (25k to 30k from Level 50), and "bless again after a death" as a standing choice, since 18 of 22 deaths used one |
| 21 combat | `hero-slots`, the lone game | On today's slot prices every account is one hero from Level 1 to about 30 (30 to 50 hunted hours). The real fours were bought for 330,000 in all at the old prices. Weight the lone seat accordingly for Levels 1 to 30, and re-read "the real player is an own four from Level 10" |
| 21 combat | `income` | Past Level 88 the proposed gold slope (+0.5% a hit point a Level) is fitted to today's kill speed. Re-fit after the to-hit change so "a ground never pays less than the last" holds for the lone hammer on Normal |
| 23 items | `linings` | The only designed sink that repeats and buys power. Sized here at about 15k a lining at Level 80 to 105 (0.1 of 12 hours' free gold), two kept up a hero: 590k a week for the Heavy four. Build it first among the sinks |
| 23 items | `tempering`, `hallmarks` | Use Q1's free gold, not `measure.mjs price`, at Levels 50 and 80. Tempering rungs 1 to 3 are 1.1 to 4.7 REF hours a 1% and rungs 4 and 5 are 5.5 to 24; tier 7's top rungs are 19 and 100. A Hallmark fee is 4 to 25 if a perk is about 1%. Found by one real player of three past Level 30: it needs the "Next buy" line more than a new price |
| 23 items | `runecrafting` | A lone Mage on store runes nets about zero from Level 50. Its own runes are its whole wage, and Runecrafting has 33 real hero-hours. That link is not being found |
| 23 items | `salvage` | Sold gear is 26% of gold in. Salvage gives that up for Luck: fine as a choice, and it moves every price in REF hours for a player who salvages everything |
| 25 social | `clan-castle`, `clan-treasury` | Price against Q1's week of free gold a member, at the 17% the Own four really spends, not at its free gold. A clan of ten Own fours frees 10M a week and spends under 2M |
| 25 social | `party-finder`, chat | The slot ruling bets on new players partying with other people in their first 30 hours. Party finder has 0 uses. The Town Crier is paid chat and needs the filter and a report path |
| 26 home | `house-rooms`, `castle`, `storage` | One-time shelf, Q1: rooms to rung 4 are 2.4M, rung 5 is 5.95M, the Castle 2.5M, Storage's 30 rungs 38.8M (the last rung alone is 9.4M). Rung 5 and the Castle are blocked by materials, not gold, which is right. The House is bought once: it needs a repeating part (curing slots, RULED) or it stops taking gold at week 3 for the Heavy four |
| 26 home | `house-dummy` | 150k to 600k a skill to save 320 gold an hour: it never pays back. Fine as a trophy; if the yard's fee rises as proposed it pays back in about 50 trained hours and becomes a real choice |
| 22 endgame | `tower`, `catacombs`, `boss-calls` | Nothing past Krell is on the gold shelf, and the four still frees about 1M a week. Any endgame fee is welcome; size it with Q1's three rules. A paid boss call (30,000, used once) is 2.5 REF hours at Level 80 |
| 27 retention | the end card | Two changes land on it: "Sell junk for N gp" with the loot rule, and "Next buy" walking the shelf. Both are first-hour and first-week teaching |
| 28 platform | `purse-ledger` | 44 to 48 ledger rows a hero-hour against a prune of 480,000 a day: outrun at 560 daily heroes. The fold exists and is off |
| model | `model.mjs` | REAL_OWN_FOUR_NET uses account-life averages (7,495 at Level 55, 9,078 at 84); the Level bands of `10-real-players.md` section 2 give 12.3k and 11.9k. The Buyer's 6 refills a day do not fit its 8.4 hunted hours. The Ceiling has own stock and no town hours |

## Measured, cited, assumed

**Played** (local world, port 8791, a new account, 2026-11-20, learning from the screen): sign-up, hero creation (five ways to fight, starting outfit and colors, "Hero slots: 1"), the town HUD (no purse on it), the stamina "+" dialog (bar full, no price shown), Town > Shop Buy, Sell and Services (Blessings, Tempering), Tamsin's tally (took Giant Rats), the Hunts page and Hunt prep (store prices, gold, the after-hunt plan with the yard), one hunt in the Mill Cellar skipped 90 minutes (Level 1 to 5, +130 gold, 501 unsold, Tamsin paid by herself), "Sell all junk" up to its confirm, the Weighhouse (closed, "0 / 1,000,000 gp given"), Havora's Hearth, Round and Works tabs, the character list's slot price (300,000). **Not played:** buying a refill, a Blessing with a price, any Tempering rung, the Town Crier, titles, the Outfit tab, colors, a rename, setup slots, a market listing or sale, anything past Level 5, anything with a second hero. Those cards rest on the data rows and the real-player counts.

**Measured** (commands, this branch): `node tools/balance-program/gold-model.mjs` and its `--shelf`, `--offers`, `--refills` (each exit 0; they join `ref.json`, MEASURED on a5e092248, with typed REAL rows and the price data); `node tools/balance-program/measure.mjs price 100000 --level 10|30|50|80|105|118`; `node tools/balance-program/measure.mjs cost --add statements=0,ledger=1,writes=1 --share 0.25`; `node tools/balance-program/domain.mjs economy --docs`.

**Real** (`10-real-players.md`, four people, 1,334 hunted hours, every figure past Level 46 one person): coin by Level band and party size, sold loot 0.366 of coin, the store's share of coin (8%, 12 to 14%, 48 to 56%), every sink's share of gold out, uses and people a system, deaths a 100 hours, hours a day, the two spenders.

**Read from data:** `src/data/shops.js` (slots, rooms, properties), `temper.js`, `gold-sinks.js`, `stamina-refill.js`, `blessings.js`, `training.js`, `town-works.js`, `tally-tasks.js`, `gold-ladders.js`, `premium.js`, `hero-rename.js`, `titles.js`, `balance-sheet.js` (gold a hit point, the dial), `2027-01-12-market-account.sql` (fee, cut, caps, ceiling), `2026-09-14-gem-unlocks-catalogue.generated.sql`, `2027-02-13-market-premium-bond.sql`.

**Cited:** the audit (`docs/design/whole-game-audit-2026-11-20.md` sections 3c, 3e, changes 5 and 7), `itemization-plan.md` section 10 (Tempering sizes, the fee table), the board's "2026-11-18 Gold by band" (gold banked a band), `01-model.md` (lever sizes, the cost baseline).

**Assumed, and said so where used:** a four's gold at Levels 105 and 118 (harness times the real ratios at Pyre Field; the harness alone is the low end); the store's share at Level 50 (the middle of a real range); sold loot for a four at Level 10; deaths past the real data; the days to each hero slot; the Buyer's hunted hours by day 30; a skill level's XP near skill 46; a perk at about 1%; the lining's price. **Unverified:** every number about the market, Crowns, Premium as a purchase and trade between two people. No real player has done any of them.

**Proposed** (nothing built, nothing changed): every change row above, the three price rules, the refill step, the gold slope, the yard's fee, the Premium list, the Crowns clamps, the Works goal.

## Tyler rules on

1. **Refills climb x1, 1.5, 2, 2.5, 3, 3.5 instead of 13% a step.** Recommend yes: the first two still pay for themselves at every Level, and from Level 80 the later ones are gold for XP. Alternative: keep 2/15, where all six pay for themselves to Level 105 and the heaviest lever in the game is close to free; or the steeper 2/3 if Levels 30 to 50 should bite too.
2. **Income past the last gear tier: gold a hit point rises 0.5% a monster Level from 88, the x0.7 dial becomes one formula line, and "a ground never pays a lone in-range hero on Normal less than the ground before" is a reported line.** Recommend yes, and that you confirm this is a rule about the faucet and not a profit mold. Alternative: leave the wage flat and let longer bands and an indexed shelf carry it; the cost is that Carter's Rest pays less than Pyre Field, which reads as a bug to a player.
3. **Premium covers the account, not the hero.** Recommend account-wide. Alternative: per hero as ruled 10-17, at about a quarter of the account price each. Real prices are yours.
4. **What Premium is for:** the 12 hour bar on every hero, the full analyzer, Premium looks and a free color change a day, the daily gift for every hero as the 1 hour training item, 100 listings for 14 days. Recommend this list and nothing that adds power or sells back a repeated choice. Alternative: add a stamina perk that matters to twice-a-day players (faster rest), which is selling hours.
5. **Crowns are a number on the account with five clamps (weekly cap, price band, one trade then bound, a hold on new Crowns, the market's own guards), and the gem rows, the gem RPC and the tradeable bond item are cut now.** Recommend yes. Alternative: Crowns as a tradeable item like the old bond, which is simpler to list and far easier to launder and dupe. The weekly cap's size and every real price are yours.
6. **Player trade becomes "list for a friend" on the Weighhouse, with the fee, the cut and the caps; no direct trade window.** Recommend yes: one money surface to review, and it works with one player offline. Alternative: the separate trade lane as ruled 10-18, untaxed, with its own caps and review.
7. **The market's opening goal is sized to the server** (20,000 gold a weekly active account, 250,000 least) instead of a fixed 1,000,000. Recommend yes, or the Discord playtest never sees a market. Alternative: keep 1,000,000 and accept the market opens only on a server of hundreds.
8. **The yard's hourly fee rises to a quarter of an hour's free gold at the hero's Level** (about 1.4k at Level 10, 3k from Level 50; today 212 to 482), the rate staying yours at 30,000. Recommend yes, together with dive 21's answer on a cap: it is the repeating sink the real player can use while away. Alternative: leave it nearly free, and it stays the cheapest power in the game by ten times.
9. **Hero slots stay 300,000, 750,000 and 1,500,000.** Recommend keep, knowing it means one hero for 30 to 50 hunted hours (5 days at 8 hours a day, 12 at 3.3, 20 at 2) and that the lone game from Level 1 to 30 then has to carry every new account. Alternative: 150,000 for the first slot (alone to about Level 22), keeping the other two.
10. **Town Works runs a project a month with a goal from the server's size, and the Gold Given board becomes its plaque's all-time page.** Recommend yes: it is the cheapest repeating sink for surplus gold and it is built. Alternative: leave it at the one Weighhouse, and the system is at zero for good a day after a big server opens. Each project costs five stage sprites.
11. **Every price past Krell is a share of one band index** (the audit's change 5), with the shares together at 1.2 to 1.4 of what a band banks, so "more than a hero can afford, choose what matters" (your 11-18 ruling) holds by a guard instead of by hand. Recommend yes. Alternative: hand-price each of 11 bands, and re-price them whenever income moves.
12. **Build order for sinks:** the end card's two lines (sell, next buy) first, the refill row, then linings, then the yard's fee, then Crowns after Premium and the market. Recommend this order. Alternative: Crowns first, which opens a currency onto a market that is closed and a Premium nobody has chosen.
