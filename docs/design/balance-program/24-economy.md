# Balance program 24: Economy

Dive of `lane/d-balance-economy` (game-designer, 2026-11-20). Fourteen systems: purse-ledger, income, store-supplies, shop, market, player-trade, gold-sinks, hero-slots, tally, town-works, stamina-refill, premium, crowns, outfits. Nothing in the game was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED.

**STATUS: question 1 (the gold model) is solid and pushed first so the home, social, endgame and combat dives can price against it. The summary, the fourteen cards and questions 2 to 10 follow in later commits on this branch.**

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
