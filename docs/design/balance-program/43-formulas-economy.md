# Balance program 43: Formula audit, hunting and economy

Lane `lane/d-formulas-economy` (systems engineer, 2026-11-21), on `set/v0.2.144` at e6ea19170. Brief: `40-formula-brief.md`, section 8 items 1 to 4, and this category's half of items 5 and 7. **No game code, data or migration was changed.** The machine-readable registers are `tools/balance-program/formulas/formulas-economy.json`. The numbers in section 7 come from `tools/balance-program/formulas/economy-probe.mjs`, a read-only script.

Labels: CONFIRMED (the code path was read, and measured where it matters), HYPOTHESIS (what would confirm it is stated), FORMULA (the game's own function evaluated), GRID (the cached real-engine grid, PROJECTED past Level 185), DERIVED (arithmetic on those).

## Summary for Tyler

**What was counted.** 52 formulas decide what a hunt pays and what gold buys. 39 exceptions sit around them. 35 are confirmed and 4 are hypotheses.

| Class | Count | What it means |
|---|---|---|
| 1 Foundational | 2 | Belongs in the shared engine |
| 2 Content number | 8 | Should move to a data row or be derived |
| 3 Intentional | 12 | Real design. 8 are already approved by you. 4 need your word |
| 4 Accidental | 17 | A patch on a patch. Should go |

**The five worst.**

1. **Every ground has its own XP number.** 15 grounds carry 15 different multipliers on XP a kill, from 0.76 to 1.22. Each was hand-fitted so the ground lands on the pace line. This is exactly the "fix the ground, not the formula" habit you described. The formula has no term for how fast a ground's monsters die, so every ground needs a correction.
2. **The gold cut is typed 11 times and patched 3 times.** "Cut income instead" became x0.7 on every ground from the Glade up. That broke the sale ladder, so three more rules were added to the shop's price to repair it. It is one number and should be one number.
3. **Gold is a formula and every sink is a list.** What a kill pays grows with Level forever. Tempering stops at tier 7, hero slots stop at 4, the House stops at its last rung. From Level 110 a hero hunting alone banks about a million a day for its account and has nothing left that costs more than three days.
4. **A lone hero and a party live in two different economies.** At Level 100 four heroes hunting alone spend 10% of their gold on supplies and refills. The same four hunting together spend 108%. The gap opens around Level 35 and never closes.
5. **Rules that are written but do nothing, and rules that are live but ruled out.** The Bestiary's boss relic bonus is loaded on every hunt and nothing reads it. The boss-of-the-day drop bonus has no caller. A header in the trophy code describes an "attended players roll more" rule that no longer exists. And the Level-keyed party XP cut you ruled on 11-08 is still live.

**Where things break.**

| Level | What breaks | How |
|---|---|---|
| 10 on | Repeating costs | Lone heroes pay 7 to 27% of income, a four pays 66 to 160%. The standard asks 35 to 50% |
| 40 on | Refills for a party hero | The first refill costs more than the four hours it buys earn |
| 30 on | Blessings | All three cost minutes of gold and save days of XP. Never a choice |
| 110 on | Standing sinks | The last priced upgrade is Dawnsteel Tempering. After it, gold only piles up |
| 110 on | Scaled hunts | The hourly price stops at 4,400 gold while income keeps climbing |
| 125 on | Gear sale prices | The sale table ends at tier 7. A tier 8 piece would sell for about 2.8 times a tier 7 piece |
| 400 to 600 | XP pace | XP a kill grows faster than the pace line. At Level 400 the projected hero is 8% over it, at 5,000 about 30% over if kill speed holds |

**Calls for you.** Six, in section 8. The two that block cleanup: is the Level-keyed party XP cut meant to be gone (C1), and may the x0.7 gold cut become one number in the formula (C3).

**Tyler's "imbuement".** Hearthrise has imbuement parts but no imbuing. 29 monster parts drop today and can only be sold. What fills the role is the **lining** you ruled on 11-18: one monster part plus gold, cured in a House slot, 12 hunted hours, stacking to 48. It is designed and not built. Its nearest built cousins are Tempering (permanent, gold plus salts) and timed food buffs. Audited as E55 and E31 below.

---

## 1. Formula inventory

Full records (every implementation site with its line, parameters and current values, dependencies, consumers, random stream, where it runs) are in `formulas-economy.json` under `formulas`. This is the index.

### 1.1 Monster XP, spawn and kill rate, hunting efficiency

| Id | Computes | Authoritative site | Runs | Random |
|---|---|---|---|---|
| E01 | XP a kill = max(2.534, 1.436 x L^0.4) x HP x role x group fit x ground fit x floor fit | `src/data/balance-sheet.js:359` formulaStats | authoring | no |
| E02 | Monster HP = (4.95 + 1.76 L) x role x fit (combat's, listed because XP and coin are priced per HP) | same | authoring | no |
| E03 | A hero's share of a kill's XP | `src/core/hunt/xp-share.js:65` | each kill | no |
| E04 | Tier dials: pull, damage, HP, XP permilles | `balance-sheet.js:438`, `hunt-tiers.js:126` | authoring | no |
| E05 | Party class XP cell (progression's table) | `src/data/party-class-xp.js` | each kill | no |
| E06 | Under-floor XP share cut | `src/data/hunt-grounds.js:536` | each kill | no |
| E07 | Scaled hunt rows and the hourly price | `src/data/scaled-hunts.js:90-288` | authoring, press | no |
| E08 | Session mode pay (the Tower's 37.5% XP, coin and drops switches) | `src/data/session-modes.js` | each kill | no |
| E09 | Skill XP routes (progression's) | `src/core/hunt-rewards.js:222` | each swing | no |
| E10 | Which monsters a pull spawns | `hunt-grounds.js:551` pullRows | respawn | no |
| E11 | Respawn: cleared + ground.respawnMs | `src/core/hunt/pull-cycle.js:175, 344` | tick | no |
| E12 | Time between pulls (travel, 1.5 s regroup, 6% HP a second out of combat) | `pull-cycle.js:328` | tick | no |
| E13 | Tier pull size (8 from floor 16, with overrides) | `balance-sheet.js:422, 458` | authoring | no |
| E14 | **Hunting efficiency: XP, kills and gold an hour.** No formula. Target 1385 x L^1.274. Only the engine knows the real value | `balance-sheet.js:92` | measured | no |
| E15 | Hearthfind odds = round(actions an hour x authored hours) | `src/core/hearthfind.js:121` | authoring, kill | `r` stream, last draw |

Spawning is fully deterministic. A pack is its pocket's authored rows. The only dice in a hunt's rewards are on kills.

### 1.2 Supplies

| Id | Computes | Authoritative site | Runs |
|---|---|---|---|
| E16 | Stamina: 1 ms a ms hunted, bar 8 h free and 12 h Premium | `hunt-sessions.js:175`, SQL `hr_stamina_of` | settle |
| E17 | Refill price = ceil((1000 + 250 L) x (2 + (n-1)) / 2 x minutes / 240), six a day | SQL `hr_stamina_refill_quote` (2026-10-25-stamina-refill.sql:75). Twin: `src/data/stamina-refill.js` | press |
| E18 | Supplies a hunt buys: own stock, then the store at catalogue price, down to the gold floor | `src/core/hunt/consumables.js:170`, `accrue-hunt.js:329`, SQL `hr_shop_refill` | settle |
| E19 | Ammo a shot, dry shot x0.25 (combat's) | `src/core/ammo.js:188, 227` | swing |
| E20 | When a consumable is used (combat's) | `consumables.js:170`, `src/data/consumables.js:27` | swing |

Store prices are rows: listed gear at 2 x book, basic supplies at 75% of the crafted effect, store runes 1 / 8 / 12 / 28 / 44 gold (`supply-basics.js:62-207`).

### 1.3 Gold

| Id | Computes | Authoritative site | Runs | Random |
|---|---|---|---|---|
| E23 | Coin a kill: mean = 0.30 x line x HP x role x party dial x ground dial, rolled lo to 2 x mean - lo | `balance-sheet.js:359`, roll at `hunt-rewards.js:130` | authoring, kill | `r`, first draw |
| E24 | Gold find = floor(share x (1 + bonus)), monster coin only | `src/core/pacing.js:119` | kill | no |
| E25 | Even split with a moving remainder | `src/core/party-split.js:48` | kill | no |
| E26 | **Shop's bid** = book x gear rate x 0.20 if raw x ground dial, floored at the lower twin, capped at half the cheapest shop price | `supabase/functions/hr-accrue/catalogue.js:340` | press, settle | no |
| E27 | Gear sale share by tier | `src/data/loot-bands.js:89-106` | press | no |
| E28 | Sale dial (highest dial of the grounds that drop it) | `src/data/loot-sale.js:44-73` | press | no |
| E29, E30 | Cheapest shop unit, shop prices | `src/core/shop-buyback.js:28`, `src/data/shops.js` | press | no |
| E32 | Market: 1% listing fee, 1.5% cut, floor = shop bid, ceiling = book x 100 | SQL only: 2027-01-12-market-account.sql:302-336, 657, 1143 | press | no |
| E33 | Bench tax: 15% of the output's bid, in milligold | SQL `hr_bench_tax_settle`. Twin: `src/core/bench-tax.js:20` | craft settle | no |

### 1.4 Loot, chests and keys

| Id | Computes | Authoritative site | Runs | Random |
|---|---|---|---|---|
| E44 | Drop chance = min(0.95, ch x row bonus x (1 + drop-rate buff)) | `src/core/drops.js:41` | kill | no |
| E45 | Table walk: one roll a row a kill. Scaled: k rolls | `drops.js:58`, `hunt-rewards.js:152` | kill | `r`, one a row |
| E46 | Band promises in hours (Scarce 0.75 to 1.5, Rare 10 to 20, Key 1.5 to 3, Trophy 100 to 150). Each row's chance is typed by hand | `loot-bands.js:43` | authoring | no |
| E47 | Party rare roll, 1 to 100, rotation | `party-split.js:74` | kill | `r` |
| E48 | Hall daily prize: one roll over slices, first roll always lands | `drops.js:101-129` | hall boss kill | `r`, one a hero |
| E49 | Chest weapon chance = base x warmth (4% a dry key, cap x3) x stoke | SQL `hr_chest_chance_ppm`. Twin: `src/data/chests.js:266` | press | server |
| E51 | Bestiary drop and relic multipliers | `trophies.js:226`, `member.js:348` | **dead** | |
| E52 | Boss-of-the-day x1.5 / x2.0 drops | `src/core/botd.js:54` | **dead on the hunt path** | |
| E53 | Bounty reward (SQL only) | 2026-08-23-bounty.sql | HYPOTHESIS: retired | |
| E54 | Luck bar: rank n costs 100 x n^2, one Magic Find budget of 104 | ruled 11-20 | **unbuilt** | |

Magic Find and the Luck bar do not exist in code. Today a drop's only multipliers are a 1.15 on seven old rows and timed food buffs, which Luck v3.1 cuts.

### 1.5 Sinks

| Id | Sink | Price rule | Site |
|---|---|---|---|
| E17 | Refills | linear in Level, x1 to x3.5 a day | above |
| E37 | Blessings | free under 30, then (100 / 150 / 200) + (10 / 15 / 20) x (L - 30) | SQL `hr_blessing_price`. Twin: `src/data/blessings.js` |
| E38 | Tempering | first rung by tier 2k / 7k / 8k / 12k / 16k / 40k, doubling 5 times, plus salts. 1% a rung, 0.4% on tier 7 | `src/data/temper.js`, `src/core/temper.js` |
| E39 | Hero slots | 400k / 1.5M / 4M | `shops.js:59`, 1015-hero-slots-dearer.sql |
| E40 | Hallmarks | 25k / 100k / 150k / 250k / 400k / 600k a piece | SQL `hr_hallmark` |
| E34 | Bank | round(3000 x 1.32^k), 10 rungs | `src/data/gold-ladders.js` |
| E43 | House and rooms | typed ladders | `src/data/homestead-tiers.js` |
| E36 | Town sinks (powder, round, crier, setup slots) | a price row a day | `gold-sinks.js`, SQL `hr_sink_price` |
| E41 | Town Works | goal = max(250k, 20k x weekly actives) | 1014-works-goal-sized.sql |
| E07 | Scaled hours | 40 x scaled Level an hour | `scaled-hunts.js:282` |
| E32, E33 | Market and bench taxes | above | |
| E42 | Yard fee (progression's) | ruled 100 x skill level an hour | SQL `hr_training_fee` |

### 1.6 Imbuement and inflation

| Id | What | State |
|---|---|---|
| E31 | Imbuement part value = 2 gold x monster Level, tier steps at Levels 30 and 80 | live, sells only (`src/data/imbuements.js:50-64`) |
| E55 | **Lining.** One part + gold, 4 h cure, 12 hunted hours, 48 h a socket. Element guard 20% or 30% (40% cap shared with gear) or a leech. Cure fee a quarter of the lining's gold, slots 250k / 750k / 2M | unbuilt. Design: `itemization-plan.md` section 5. Effects are combat's |
| E56 | **Inflation: gold in minus gold out an account-day.** No formula in the game | tools only, section 7 |

---

## 2. Exception inventory

All 39 with file and line, origin and fix are in `formulas-economy.json` under `exceptions`. Grouped by Tyler's list.

**Hunting grounds with custom XP or loot math**

| Id | Exception | Class | |
|---|---|---|---|
| X01 | `GROUND_XP_FIT`: 15 per-ground XP multipliers, 0.76 to 1.22 (`balance-sheet.js:309`, 9 packs) | 4 | CONFIRMED |
| X02 | `GROUND_GP_FIT`: x0.7 typed on 11 grounds (`balance-sheet.js:319`) | 4 | CONFIRMED |
| X04 | XP x0.67 on grounds with a floor of 8 or less, rising to x1 at floor 32 (`balance-sheet.js:165`) | 4 | CONFIRMED |
| X08 | Per-ground tier overrides on 5 base grounds and 7 packs (`balance-sheet.js:458`) | 4 | CONFIRMED |
| X09 | Mill Cellar is Normal only | 3, approved 11-05 | CONFIRMED |
| X34 | `respawnMs` typed a ground may cap kills an hour | 2 | HYPOTHESIS: compare BiS kills an hour with pockets x pack / respawn on the grid |

**Level thresholds that change the math**

| Id | Exception | Class | |
|---|---|---|---|
| X03 | Coin line climbs x0.5 to x1.4 between floors 1 and 16, then flat forever | 3 | CONFIRMED |
| X07 | No bigger pull on a tier when the ground's floor is under 16 | 3, conflict C2 | CONFIRMED |
| X10 | `underFloorSharePm`: reads the hero's Level at the kill (`xp-share.js:78`) | 4, conflict C1 | CONFIRMED |
| X23 | Blessings free under Level 30 | 3 | CONFIRMED |
| X32 | Imbuement tiers step at monster Levels 30 and 80, with nothing to feed | 3, BUILD-LATER | CONFIRMED |

**Party math that differs by ground**

| Id | Exception | Class | |
|---|---|---|---|
| X05 | Party ground coin dials x1.17 and x0.53 on top of the line | 4 | CONFIRMED |
| X06 | Party ground XP x0.8, HP x2.5 | 3 | CONFIRMED |
| X11 | Scaled hunts: XP x0.73, party x0.70, coin x0.5 of the rise | 3, approved 11-07 | CONFIRMED |
| X13 | Run grounds use their own party XP row | 3, approved | CONFIRMED |

**Hardcoded multipliers that compensate for earlier problems**

| Id | Exception | Class | |
|---|---|---|---|
| X14 | `dropBonus` 1.15 on seven old rows, a Mill Cellar Slime among them | 4 | CONFIRMED |
| X17 | Gear sale share typed a tier: 0.5, 0.5, 0.14, 0.075, 0.033, 0.015, 0.007 | 4 | CONFIRMED |
| X18 | Tier-2 hourly armor sells at 0.3, not 0.5 | 4 | CONFIRMED |
| X19 | Sale dial's three patches (highest dial wins, crafted exempt, twin floor) | 4 | CONFIRMED |

**Duplicated calculations**

| Id | Exception | Class | |
|---|---|---|---|
| X21 | Six price shapes written in both JS and SQL: refill, Blessing, town sink, bench tax, chest chance, scaled hour. Coefficients are single-sourced through generated rows. Only the shape is doubled | 1 | CONFIRMED |
| X20 | The raw sale rate 0.20 and buy-back cap 0.5 are authored in the edge function and restated in `shops.js` | 2 | CONFIRMED |
| X22 | Market fee, cut and ceiling exist only as SQL column defaults | 2 | CONFIRMED |
| X37 | The gold model approximates the engine (section 6) | 4 | CONFIRMED |
| X38 | Drop odds shown in the browser are computed there, without the hero's buff | 4 | CONFIRMED |

**Unexplained caps, floors, overrides and dead rules**

| Id | Exception | Class | |
|---|---|---|---|
| X15 | Drop chance capped at 0.95, 100% rows never multiplied | 1 | CONFIRMED |
| X16 | Two ways to know a row's band (its field, else its odds) | 2 | CONFIRMED |
| X26 | Relic multiplier projected and copied every settle, read by nothing | 4 | CONFIRMED (grep: `member.js`, `hunt-settle.js:708` only) |
| X27 | `featuredMult` and the boss-of-the-day bonuses have no caller | 4 | CONFIRMED |
| X28 | Hearthfind header describes an attended bonus stream that is gone | 4 | CONFIRMED (`ATTENDED_RNG_SALT` appears only in the comment) |
| X35 | About 114 old-roster monster rows with hand stats beside 72 formula rows | 4 | HYPOTHESIS: confirm none is on an open ground |
| X36 | Unlisted skills fall back to the gathering speed perk (progression's) | 4 | HYPOTHESIS |

**Content numbers that are really formula outputs**

| Id | Exception | Class | |
|---|---|---|---|
| X33 | Every banded drop row's chance is hand-typed until a test measures its hours | 2 | CONFIRMED |
| X39 | Hearthfind's kills an hour is a typed measurement | 2 | CONFIRMED |
| X25 | Tempering's first rung a tier is typed, priced in comments at 40 to 52% of band gold | 2 | CONFIRMED |
| X12 | Grounds left off the scale ladder by name | 2 | HYPOTHESIS: not read |

**Approved special mechanics, kept as they are:** X24 Dawnsteel's 0.4% rung, X29 the sure first hall roll, X30 chest warmth and stokes, X31 called boss drops behind a switch.

---

## 3. Dependency map

Inside the category (formula feeds formula). The edge list is `formulas-economy.json` `edges.inside`.

```
monster HP (E02) ──> XP a kill (E01) ──> XP split (E03) <── tier (E04), party cell (E05), floor cut (E06), scaled (E07), mode (E08)
              └────> coin a kill (E23) ──> split (E25) ──> gold find (E24) ──> purse
pack rows (E10) + respawn (E11) ──> pull cycle (E12) ──> EFFICIENCY (E14) ──> Hearthfind odds (E15), band hours (E46)
band hours (E46) ──> drop chance (E44) <── Luck (E54, unbuilt) ──> table walk (E45) ──> rare roll (E47)
gear rate (E27) + sale dial (E28) + shop unit (E29 <── E30) ──> SHOP BID (E26) ──> market floor (E32), bench tax (E33), scaled loot (E07)
stamina (E16) ──> refill (E17)        ammo (E19) + use rule (E20) + shop price (E30) ──> store bill (E18)
everything that pays or charges ──> ACCOUNT-DAY (E56)
```

Two hubs carry the category. **E14 (efficiency)** is read by every hours-based promise and has no formula. **E26 (the shop's bid)** is read by the market floor, the bench tax, sell-to-cover and the scaled loot rate, and it is the formula with the most patches (X17, X18, X19, X20).

Edges that leave the category:

| Edge | Other lane |
|---|---|
| Hero DPS and kill time into E14 | combat |
| Damage taken and healing into the store bill E18 | combat |
| Monster HP line into E01 and E23 (XP and coin are per HP point) | combat |
| The danger ramp (floors 8 to 16) into a party ground's coin dial | combat |
| Tier dials E04 out to monster blow and HP | combat |
| Tempering E38 and linings E55 out to blows, armor, resist, leech | combat |
| Dry ammo x0.25 out to ranged damage | combat |
| XP a kill E01 and the split E03 out to the Level curve and the pace contract | progression |
| Party class XP table into E03 | progression |
| Death cost (6% of total XP) into what a Blessing is worth (E37) | progression |
| Gear tiers and book values into the sale share, shop prices, Tempering, Hallmarks | progression |
| Skill XP routes, the 0.39 skill dial, the speed-key fallback | progression |
| Yard fee E42 | progression |

---

## 4. Architecture assessment

| Principle | Where this category breaks it | Evidence |
|---|---|---|
| **Centralized** | The reward formula is central (`formulaStats`). The shop's bid is not: its two rates live in the edge function, its tier table and dial live in two data files. Market coefficients live only in SQL. Six prices have a JS shape and a SQL shape | X20, X22, X21 |
| **Deterministic** | Holds. Spawns draw nothing. Every reward die is on the seeded `r` stream in a fixed order. Chest and Hallmark rolls are server-side. No `Math.random` in any formula read | `hunt-rewards.js:30-35`, `drops.js`, `party-split.js` |
| **Data-driven** | Coefficients are in data. But 15 XP fits, 11 gold dials, 12 tier overrides and about 300 hand-typed drop chances are data rows doing a formula's job | X01, X02, X08, X33 |
| **Composable** | The shop's bid is five rules stacked in a fixed order, three of which exist to undo a side effect of another. The drop formula carries an argument nobody passes | X19, X27 |
| **Scalable** | Faucets are formulas of Level. Sinks, the gear sale table, Tempering, slots and the House are lists that end. Nothing past tier 7 has a price | section 7 |
| **Auditable** | A kill's XP can be traced: row, tier, mode, cell, scaled share, floor cut. A sale's price needs four files. Net gold a day has no single trace, and the tool that reports it approximates | E26, X37 |
| **Globally tunable** | `xp.a` and `gp.perHp` are true global knobs. But moving `xp.a` re-opens 15 ground fits, 12 tier overrides and 3 scaled-hunt numbers, each held by a guard at its hand-fitted value | `balance-sheet.js:300-309` records four such cascades in one comment |

The good news is real. Rewards have one engine, one stream and one generator. The Hearthfind already does what the rest should: it authors hours and derives odds from the measured rate. The debt is not scattered code. It is one missing term (how fast a ground dies) answered by hand, many times.

---

## 5. Proposed model for this category

Six mechanics. Nothing here is new math. Each replaces typed corrections with a derivation the code already does somewhere.

**M1. Reward per hit point.** XP a kill = `xpPerHp(L)` x HP x role share x group share. Coin a kill = `coinPerHp(L)` x HP x role share x group share. One line each, a function of monster Level only. The x0.7 gold cut folds into `coinPerHp`. Removes X02, X04, X05, X19.

**M2. Ground pace is derived, never typed.** The generator measures a ground's kill-HP an hour on the grid and writes the one factor that lands it on the pace contract, the way `deriveOneIn` writes Hearthfind odds. A designer authors the target (which is already one global line). Removes X01, and lets X08 and X11 be re-derived instead of re-fitted.

**M3. One tier table.** Three permilles and a pull. A ground may switch tiers off (X09). No per-ground permilles. The ladder rule ("a tier never out-pays the next ground's Normal") becomes a band the grid judges, so the formula is fixed when it fails, not the ground.

**M4. Drops are authored in hours.** A row says its band and its hours. The chance is derived from the ground's measured kills an hour. Luck is the one multiplier, inside one budget, under the 0.95 cap. Removes X14, X16, X27, X33, X39 and gives E54 a single place to land.

**M5. One sale formula.** Bid = book x `saleShare(tier)` x raw rate, capped by the buy-back rule. `saleShare(tier) = share1 x step^(tier-1) / bookClimb^(tier-1)`, which is the rule the comments already state. All rates in `src/data`. Removes X17, X18, X20 and works at tier 8.

**M6. Prices are shares of income.** A standing sink costs a ruled share of its band's net gold (you ruled 1.2 to 1.4 of a band for the whole set). A repeating price is a ruled number of hours of the buyer's own net gold at its Level. Then every sink exists at every Level by construction. Removes X25 and answers section 7's inflation finding.

**The global knobs, and what each moves.**

| Knob | Today | Moves |
|---|---|---|
| K1 `xp.a`, `xp.b` | 1.436, 0.4 | XP a kill everywhere, so hours a Level |
| K2 `coinPerHp`, and its slope by Level | 0.30 x (0.5 to 1.4) x 0.7, flat past floor 16 | gold in, at every Level |
| K3 Tier dials | 1170 / 1100 / 1100 and 1330 / 1150 / 1250, pull 8 | risk and XP of Dangerous and Deadly |
| K4 Band hours | 1 h, 10 to 20 h, 2 h, 100 to 150 h | every drop's pace |
| K5 Luck curve and Magic Find budget | 100 x n^2, 104 | the long chase |
| K6 Sale step and raw rate | 1.3 a tier, 0.20 | sold-loot income, the market floor, the bench tax |
| K7 Store premium and basic share | x2, 0.75 | the supply bill |
| K8 Standing sink share | (typed lists) | how many days a band's upgrades take |
| K9 Refill hours-of-gold by purchase | (1000 + 250 L) x step | whether the 12 hour day costs gold |
| K10 Blessing share of the hours it saves | (10 to 20 gold a Level) | whether a Blessing is a choice |
| K11 Market fee and cut, bench tax | 1%, 1.5%, 15% | gold destroyed by trade and craft |

---

## 6. Where the tools approximate instead of running the engine

| Tool | What it approximates | Line |
|---|---|---|
| `gold-model.mjs` | Six Levels only, the last 118 | `:36` LEVELS |
| `gold-model.mjs` | A four's income to Level 84 is typed in from real-player rows | `:47-52` FOUR |
| `gold-model.mjs` | Past 84: income = harness x 0.92, store bill = harness x 0.26, both ASSUMED | `:53-57` |
| `gold-model.mjs` | Sold loot = 0.366 of coin for every account | `:41` |
| `gold-model.mjs` | The bank a lone hero holds by Level is CITED, not played | BANK, `levelAtBank` |
| `sources.mjs` | Plays nothing. Reads cached ground rates at MID and moves them to LOW and BiS by the grid's ratios | header `:8-12` |
| `sources.mjs` | "The market is a floor and a ceiling, never a price" | header `:22` |
| `progression-grid.mjs` | Real engine. Past Level 185 the grounds and gear are PROJECTED from one template ground | `grid-project.mjs` |

**What the grid already has that section 6 of the brief asks for:** XP, kills, coin, income, store bill by kind, net gold an hour and a day, damage taken, healing, low HP, deaths, three gear states, parties 1 to 4, every tier, gear-step cells. **What it lacks for this category:** a before-and-after diff of two runs, an account-day row with sinks in it, sold loot split by band, a monster-archetype axis, any Level past 400, and samples longer than 2 hours outside the deaths run.

---

## 7. Scalability: Level 1 to 5,000

FORMULA and DERIVED rows: a regular monster of Level L on a ground whose floor is L, a lone hero exactly on the pace contract. `node tools/balance-program/formulas/economy-probe.mjs`.

| Level | Monster HP | XP a kill | Coin a kill | Coin per XP | Kills an hour | Coin an hour | First refill | Refill over 4 h of coin | 3 Blessings | Death, hours |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 23 | 58 | 7 | 0.121 | 449 | 3,141 | 3,500 | 0.28 | 0 | 0.2 |
| 50 | 93 | 639 | 39 | 0.061 | 317 | 12,345 | 13,500 | 0.27 | 1,350 | 5.1 |
| 100 | 181 | 1,640 | 76 | 0.046 | 298 | 22,668 | 26,000 | 0.29 | 3,600 | 21.7 |
| 400 | 709 | 11,185 | 298 | 0.027 | 256 | 76,217 | 101,000 | 0.33 | 17,100 | 147.7 |
| 1,000 | 1,765 | 40,170 | 742 | 0.018 | 229 | 169,691 | 251,000 | 0.37 | 44,100 | 759 |
| 2,000 | 3,525 | 105,858 | 1,481 | 0.014 | 210 | 310,919 | 501,000 | 0.40 | 89,100 | 1,921 |
| 5,000 | 8,805 | 381,480 | 3,698 | 0.010 | 187 | 692,521 | 1,251,000 | 0.45 | 224,100 | 6,246 |

The formulas evaluate without error to Level 5,000. Nothing overflows or goes negative. The shapes are: coin an hour grows as about L^0.87, refills and Blessings as L, the death cost in hours faster than L.

GRID rows (real engine, MID gear, Normal, mean of the ways, PROJECTED past 185), turned into an account-day of four heroes at 12 h with one refill each:

| Level | Four lone heroes: gold in | Store + refills | Share | Own four: gold in | Store + refills | Share |
|---|---|---|---|---|---|---|
| 10 | 244k | 25k | 10% | 222k | 155k | 70% |
| 30 | 483k | 34k | 7% | 180k | 120k | 66% |
| 50 | 562k | 63k | 11% | 282k | 320k | 114% |
| 100 | 1.10M | 113k | 10% | 499k | 538k | 108% |
| 185 | 1.23M | 224k | 18% | 658k | 1.05M | 160% |
| 300 | 1.87M | 398k | 21% | 1.02M | 1.32M | 129% |
| 400 | 2.39M | 485k | 20% | 1.29M | 1.45M | 112% |

The store bill here is at full store price. The grid's own net figure, which credits home-made supplies, is kinder to the four and still goes negative after refills at Levels 40 and 185.

**Where each formula starts to misbehave.**

| Formula | Level | Mechanism | Label |
|---|---|---|---|
| E56 repeating sinks (G-9 asks 35 to 50%) | 10 on | Lone 7 to 21%, four 66 to 160%. **Solo and party diverge** and never meet | GRID, DERIVED |
| E17 refill, party hero | 40 on | Price is linear in Level. A party hero's net gold is a fifth of a lone hero's. The 12 hour day costs a four gold | GRID |
| E17 refill, lone hero | never | 21% of the 4 h at Level 30, 52% at 400. Would pass 100% only far past 5,000 | GRID, FORMULA |
| E37 Blessings | 30 on | At 400: 17,100 gold, about 20 minutes of coin, saves 111 hunted hours. At 1,000: 44,100 gold saves 569 hours. Price is linear, value is not | FORMULA |
| E38, E39, E40, E43 standing sinks | 110 on | **Inflation.** The lists end. Four lone heroes net about 1.0M a day at 110 and 1.9M at 400. All of Dawnsteel Tempering (2.48M) is under three days | GRID, data |
| E07 scaled hour price | 110 on | 40 x Level stops at the ladder's top (4,400). Income at 200 is 28k an hour | FORMULA |
| E27 gear sale share | first tier-8 drop (about 125) | The table "sells at its last rate" above tier 7 while book climbs about 2.8x a tier. Sold loot jumps 2.8x a tier | analysis of `loot-bands.js:104`. HYPOTHESIS until a tier-8 row exists |
| E01 against the contract | 400 to 600 | XP a kill grows as L^1.4, the contract as L^1.274. On pace, kills an hour must fall from 449 to 187 and a kill takes 2.4 times longer. If kill speed holds at the grid's 243, XP is 8% over at 400 and about 30% over at 5,000. **Unsustainable XP or ever-longer kills** | FORMULA, GRID. Progression lane owns the curve |
| E23 coin per XP | steady drift | Falls from 0.12 to 0.01. A Level buys 254k gold at 100 and about 37M at 5,000, so anything priced per Level must scale | DERIVED |
| E46 band hours | content scale | Kills an hour fall from 575 to 243 across the grid, so every new ground needs its odds re-typed. About 300 rows today | GRID |
| E24 gold find | unknown | Additive with no ceiling in the formula. Safe today because sources are few | HYPOTHESIS: sum the sources a BiS hero can stack |
| E11 respawn | unknown | May cap kills an hour for strong parties, making gear upgrades worth nothing on that ground | HYPOTHESIS (X34) |
| E49 chests, E48 halls, E15 Hearthfind, E34 bank, E41 Town Works, E32 market | none found | Bounded or proportional by construction | FORMULA |

---

## 8. Conflicts for Tyler

Each is an approved decision against a clean formula. Neither side is changed here.

| # | Your ruling | What the code does | The call |
|---|---|---|---|
| C1 | 11-08: "XP share rule applies regardless". Recorded as: the Level-keyed cut is CUT | `underFloorSharePm` is live. It cuts a low seat's XP by the square of its Level ratio and reads hero Level at the kill | Cut it, or keep it as the approved guard against a Level 1 leeching behind three Level 37s |
| C2 | 11-07: "Dangerous and Deadly keep the bigger pulls" | On the Thicket, Wickstead and the Sewer the harder tiers bring no more monsters | Approve that exception, or give them their pulls and fix the ladder in the formula |
| C3 | 11-16: "cut income instead" | x0.7 typed on 11 grounds, plus three patches on sale prices | Fold x0.7 into the one gold line. Same gold, one number |
| C4 | 50-4: death costs 6% flat, no cap | Blessings that remove 75% of it cost minutes of gold at every Level | Should a Blessing be a real cost. If yes its price follows the hours it saves |
| C5 | "Every player hunts 12 hours a day". The free bar is 8 | The refill that buys hours 9 to 12 costs a party hero more than those hours earn from Level 40 | Should the first refill always pay for itself for a party hero |
| C6 | 11-18: sinks sit above a band's gold on purpose | Every standing sink is a list that ends at tier 7 | Price standing sinks as a share of band gold, so they exist at every Level |

Also noted, no call needed: the six open spell-rule calls in `CONFLICTS.md` are combat's. None changes a formula in this category except through kill speed (E14).

---

## 9. Server cost: which economy formulas drive it

Ruled budget: 60 database-seconds an account-day. Today about 605. The economy's share is placement, not arithmetic.

| Formula | Where it runs | What it costs | Fix |
|---|---|---|---|
| E18 store supplies | **A journal row a supply kind a settle** | 114 of the 216 journal rows a hunted hero-hour | Sum on the session. Journal hourly and at the hunt's end |
| E23, E24, E25 coin | A journal row a hero a settle | Most of the other 102 rows | The hourly journal (platform's change 3) |
| E44, E45, E47, E15 drops | One draw a row a kill inside the engine. One inventory write a distinct item a settle | Engine time, no extra statement | None needed for the budget |
| E36, E37 and other price views | Rebuilt in every envelope | Part of the 48 ms of `hr_state_of` on every watched poll | Delta envelopes: send a price when its inputs move |
| X26 relic multipliers | Projected and copied every settle, never read | Bytes only | Delete |
| E33 bench tax | A settle a craft window | 36 to 40 rows a town hero-hour | The same hourly journal |
| E16 stamina | A column in the settle's own row | Nothing extra | None |
| E11, E12 spawn and pull | Every 100 ms step of every instance | Engine time only | Platform lane's settle cadence |

No economy formula runs a statement per kill. The cost is that value movements are journalled at the settle cadence, and two of them (supplies bought, supplies used) are journalled per kind.

---

## 10. Overlaps for the dedupe lane

| Topic | Also in | This doc's id |
|---|---|---|
| Monster HP against kill rate | combat | E02, E14 |
| Supplies burned a fight | combat | E18, E19, E20 |
| Tier dials | combat | E04, X07, X08 |
| Tempering and lining effects | combat | E38, E55 |
| XP a kill against the Level curve | progression | E01, section 7 |
| Party XP cell and the under-floor cut | progression | E05, E06, X10 |
| Death cost and Blessings | progression | E37, C4 |
| Gear-step prices and book values | progression | E27, E30, E38, E40 |
| Skill XP routes and the skill dial | progression | E09, X36 |
