# 21. The Inner Flame, Temper and carry-over, imbuements, personal loot: buildable detail

2026-11-22, `lane/detail-flame-temper`, from `set/v0.2.144`. Game designer. Docs only, nothing built. It takes four systems that `02-architecture.md` (packages 2, 2b, 4) and `09-crafting.md` (sections 2.4, 3.2, 4.3) designed at rule level down to rows, verbs, screens and Lab runs. Read with `04-math-strategy.md` sections 10 to 12, `12-targets.md` sections 3 and 8, `13-market.md` section 2.3, `19-power-ledger.md`, `20-v030-the-roads.md` and the built data: `src/data/danger.js`, `gear-steps.js`, `traits.js`, `wage.js`, `store-kit.js`. Every call here is mine and final. Every number is a starting value the Lab moves inside its band.

**Tags.** CODE (read from `src/`), COMPUTED (arithmetic on named inputs), JUDGMENT (a design call to test), ASSUMED (a guess a number rests on), OWED (needs a piece that does not exist yet).

**Units.** A step is one Level of rating, 0.35% power (`DANGER.powerStep`), about 0.7% pace. A tier is 20 steps (`GEAR_STEPS.tierSteps`). `wage(s)` is gold for one reference hunted hero-hour at step s (`src/data/wage.js`): 16,365 at 60, 17,726 at 80, 19,199 at 100, 20,795 at 120, 28,619 at 200 (COMPUTED from `wageBase` 12,880 and `payStepCoin` 0.4%). Which step a price reads is Tyler's 2026-11-22 rule: per-hero costs read the hero's Level, goods and gear read their band or item step. `ramp(L) = min(1, L / 200)` is `19` section 2's early ramp.

**Voice.** Every UI line below is a tooltip label, not a sentence. "·" separates parts of one line.

---

## 0. One screen

| System | The design in one line | Power ledger (`19`) | Server size |
|---|---|---|---|
| **Inner Flame** | One flame a company. Remains burn into height, height is Rare luck, height burns down only while heroes hunt, and what burns down is Flame Level, which is room | 0 steps. Luck, under `kitSpreadMax` | M. One company row, one burn verb, the drop roll reads one number |
| **Temper** | Five ranks a gear slot, owned by the hero's slot. Each rank is +1 item Level on whatever that slot wears. Ranks open every 40 Levels. A new tier re-seats them for a share of their price | Temper slice, 5 steps on a whole kit | M. One table, two verbs |
| **Carry-over** | An Artificing job moves a piece's Traits onto a plain base of the same slot and the same or a higher tier. The old piece is destroyed | 0 new steps. Moves Traits inside the gear slice | M. One verb on the piece table (wave 4) |
| **Imbuements** | Three a hero: an Edge on the weapon, a Ward on the body, a Leech on the helmet. Made by Artificing from a rare part of another ground and Remains. Each lasts 20 hunted hours while worn | Consumable slice, 2 steps each | M. Piece columns, one apply verb, new conditions |
| **Personal loot** | Each hero rolls its own drops on every kill it was at, at 1 / (heroes at the kill) of the row's chance. No rare roll, no turns. Coin stays an even split | 0 steps. Per-hero pity narrows the luck spread | M. Replaces the party split's item half |

### 0.1 Rulings made here (each amends the file named)

| # | Ruling | Amends | Why |
|---|---|---|---|
| D-1 | The consumable slice stays **6 steps** (`19` row 10, `20` section 2). Three imbuements fill it on their own ground, so a draught or a camp pot is a choice **in place of** an imbuement, never on top. The hero card shows `Consumables 6 / 6`, and no stock or keep rule ever buys or applies a line that would add 0 on the plan's ground | Adds the no-dead-buy rule to `19` and `20` | A paid line that does nothing on its best ground fails the purpose test. A visible cap plus a plan that refuses the dead buy turns the overlap into a choice. I weighed a slice of 10 and kept 6: `20` already sizes v0.3.0 on it, and a bigger slice only moves the overlap |
| D-2 | Temper ranks open every 40 Levels (rank r at Level 40r) in place of "numbers x ramp" | `19` section 2, rule 1, for Temper only | Same budget under the ramp curve, and a whole number on every card: "Temper 2 / 5 · next rank at Level 120" beats "+1.2 item Levels" |
| D-3 | Temper costs a share again at each new tier (`temperCarry` 0.35) | Answers `09` section 7.3 question 5 | It is what keeps Temper a sink for life. The rank still carries, so the choice is remembered (first principle) |
| D-4 | The flame lifts the chance of the top rank open at a depth, and nothing else about rank. Depth still sets which ranks are open (`rankDepths` 1 / 8 / 15) | Reconciles `02` 2b ("raises the chance ... rank 2 or 3") with `12-targets` 3.3 (rank by depth) | Depth sets the ceiling, luck sets how often you reach it. Under depth 8 the flame does nothing for rank, which is true and readable |
| D-5 | Signatures do not read the flame | `02` 2b's "floor on how often the rarest piece can come" | One clear rail in place of a vague one. A Signature is authored in hunted hours (`15`) and stays there |
| D-6 | Carry-over moves **every** Trait on the old piece: one on a Rare, both on a Very Rare at twice the price. The target must be plain | `02` package 2 ("one Trait") | A Very Rare is the best moment in the game. Splitting it at the first tier change throws it away. A plain target means carry-over never makes a Very Rare, so the drop stays the only way to get one |
| D-7 | Imbuement quality sets life, not strength (Plain 20 h, Fine 25 h, Master 30 h) | `09` 4.2's item step by quality, for imbuements only | The tool rule (`09` 3.7): every imbuement of a band works the same, a master's lasts longer and is cheaper by the hour |
| D-8 | No imbuement keys on a monster family | The brief's example shape ("vs Undead") | Muster Barrows is five Undead of five (CODE, its pack), so "vs Undead" there is always on: a flat number, which `04` guard 2 refuses. Imbuements key on a role, an element or a status, which come and go inside a pull |
| D-9 | A hired hero's personal loot goes to its owner and reads its owner's flame | `02` package 4 and 2b open questions | The hirer pays for depth, the owner keeps what its hero finds. No loot crosses accounts outside the market |
| D-10 | The flame's height holds in town and never fades by the clock | `02` 2b open question | Decay by the clock punishes being away, in a game built on being away (`09` 5.7) |

---

## 1. The Inner Flame

### 1.1 How it plays

- Your company has one flame at the Great Hearth. Every hero's Rare rolls read it.
- Remains from your hunts go on the fire by your plan's rule. Remains bought at the Weighhouse burn the same way.
- The taller the flame, the better your Rare odds, but each bit of fuel adds less than the last, and the fire only holds so much.
- The flame burns down only while your heroes hunt. Everything it burns down raises Flame Level, and a higher Level holds a taller fire that burns slower.
- Set the stoke rule once: keep it full, keep it at two thirds, or leave it out and sell the Remains. "Tonight we chase drops" is a plan, not a chore.

### 1.2 Rules and numbers

**The fuel point.** One point is the Remains one reference hero drops in one hunted hour at its own band (ASSUMED shape, MEASURED value owed: `fuelRef`, Remains units a hero-hour on Steady at the reference). Remains are one good a band (`13-market` 2.4). A unit of band b is worth `1 / fuelRef x min(1, (1 + powerStep) ^ (b - top))` points, where `top` is the company's highest hero Level. So a far company gets almost nothing from a new player's bones, and the fuel market follows the wage by band.

**The four formulas.**

```
decay(FL)   = decayPm1 - (decayPm1 - decayPm99) x (FL - 1) / 98        permille of height lost a hunted hero-hour
room(FL)    = flameCover / decay(FL)                                     the most height the fire holds, in points
luck(H)     = luckMax x H / (H + luckHalf)                               added to 1 on the Rare and Very Rare chance
burned      = decay(FL) x H, per hunted hero-hour                        Flame XP, in points
```

Burns down by hunted hero-hours only: one hero hunting burns one share, four burn four. Each hero also drops four times as fast in that case, so the height a company holds on its own drops does not depend on its size. Height is held in whole milli-points and decays once a settled minute, multiplications only, so the browser, the edge and Postgres reach the same last bit.

**What it reads, at the starting values** (COMPUTED. Own drops only means every point a company drops goes on the fire and none is bought):

| Flame Level | Burns a hunted hero-hour | Room | Height on own drops | Rare chance, own drops | Rare chance, kept full | What the bought top third adds |
|---|---|---|---|---|---|---|
| 1 | 8% of height | 19 | 12.5 | +20% | +26% | +6 points of chance |
| 50 | 6% | 25 | 16.7 | +24% | +30% | +6 |
| 99 | 4% | 38 | 25 | +30% | +36% | +6 |

The steady height on own drops is 1 / decay, always two thirds of the room (`flameCover` 1.5, the cover rule of `09` 5.4). A full flame always burns 1.5 points a hero-hour, so buying moves Flame Level at most 1.5 times as fast as burning your own. Gold buys the last 6 points of chance, the smallest part, as `02` 2b requires.

**Rank.** A Trait rolls the top rank open at its depth (`GEAR_STEPS.rankDepths`) with chance `topRankPm x (1 + luck)`, at most `topRankMax`, else one rank below. Under depth 8 only rank 1 is open, so the flame does nothing for rank there (D-4).

**Flame Level.** Points burned down, on the trade curve shape of `09` 4.5: `flameCurve` 1.045 a Level, summing to `flamePointsTo99`. A company of four hunting 8 hours a day burns about 32 points a day on own drops, so 99 takes about 190 days. Kept full and on a 16 hour day with Premium and two bought blocks, about 96 points a day, about 63 days (COMPUTED). Level 99 adds a fire color for the hall, nothing else.

**Named fuel.** A named fuel adds a burst of `burstPm` of the room and may stand over the room by that much. It burns down like any height and colors the square's fire for everyone, as built today (CODE: `src/data/hearth.js` NAMED_FUELS, `hr_hearth_burn`). It trades, so gold can buy a burst. The burst is bounded by the room.

**Guard rails (from `02` 2b).** Luck multiplies the Rare and Very Rare chance after depth and before pity. It never moves which Trait rolls, coin, keys, chest prizes, hall prizes, world boss prizes or Signatures (D-5). A death takes nothing from the flame.

**Levers.**

| Lever | Start | Band | Sets |
|---|---|---|---|
| `decayPm1` | 80 | 50 to 120 | Burn a hunted hero-hour at Flame Level 1. With the room, how much fuel a full flame eats |
| `decayPm99` | 40 | 30 to 60 | Burn at 99. The Level's reward: the same bones go further |
| `flameCover` | 1.5 | 1.25 to 2.0 | Room over the own-drops height. `09`'s cover for Remains |
| `luckMax` | 0.6 | 0.4 to 0.8 | The ceiling of the Rare multiplier, never reached |
| `luckHalf` | 25 points | 15 to 40 | The height that gives half of `luckMax`. Sets how fast luck falls off |
| `topRankPm`, `topRankMax` | 500, 800 | 400 to 600, 650 to 900 | The chance of the top open rank, and its cap under any flame |
| `flamePointsTo99` | 6,000 | 4,000 to 10,000 | The long chase |
| `burstPm` | 250 | 150 to 400 | A named fuel's burst, as a share of the room |
| `fuelRef` | MEASURED, owed | | Remains units in one point |

**What it costs, in hours of wage** (COMPUTED on `13-market` 2.6's ASSUMED Remains worth, 0.05 hours of wage an hour-unit). Burning all your own Remains gives up 0.05 hours of wage a hunted hero-hour, about 5% of gross coin, for +20 to +30% Rares. Keeping it full buys 0.5 points a hero-hour more, another 0.025 (2.5%), for the last +6. Against a Rare worth 4 hours of wage found once in 40 hunted hours (`13-market` 3.2), +30% Rares is worth 0.03 an hour in gold. So for gold alone the flame loses, as `02` 2b requires for a leveling company. It pays for a company that wants a Trait to wear, which is the choice.

### 1.3 Data shape

| Where | Shape |
|---|---|
| `src/data/inner-flame.js` (new, replaces `hearth.js`'s regeneration role) | `FLAME` levers above. Fuel rows: Remains a band (one good, `13-market` 2.4), named fuel rows keep `hearth.js` NAMED_FUELS's shape plus `burstPm`. Pure functions `decayPm(fl)`, `roomOf(fl)`, `luckPm(h)` in `src/core/inner-flame.js` |
| `company_flame` (new table, one row an account) | `user_id`, `flame_level`, `flame_points` (burned down, total), `height_mpts` (milli-points), `stoke` (jsonb: target share of room, burn own first, buy limit a day, max price as guide share and an absolute cap in hours of wage, sell the rest), `updated_at` (server clock) |
| Hunt session | The settle reads `height_mpts` and `flame_level` once at its window's start and writes the decayed height and the points burned in its own write. No statement per kill |
| Server catalogue | `hr_flame_rules` (generated from `FLAME`, as `hr_wage` is), fuel worth by band from the wage |

### 1.4 Server verbs and journals

| Verb | Who calls | Does | Journals (`player_ledger`) |
|---|---|---|---|
| `hr_flame_burn(intent, kind, band, count)` | Client (the "Burn" press) and the plan reconcile | Burns Remains from the bag, then Storage, up to the room. Fuel past the room stays where it was. Refuses an unknown kind or band | `flame_burn`: items out, points in, height before and after |
| `hr_flame_stoke_set(intent, rule)` | Client | Writes the stoke rule. Clamps every limit against the catalogue (price cap in hours of wage, buy count a day under `buyLimitDrop`) | Plan row only, no value moves |
| Settle (engine) | `hr-accrue` | Decays height by hunted hero-hours, adds points burned to Flame Level, burns dropped Remains by the stoke rule, reads `luckPm` into each hero's drop roll | `flame_settle` folded into the hourly journal (`1047-hourly-journal.sql`) |
| `hr_hearth_burn` (built, restated) | Client | A named fuel: burst points, colored fire | `flame_named` |
| Market fills (`13-market` 3.3) | Plan reconcile | The stoke rule's standing buy and sell orders for Remains | `market_*` |

Money surface: yes. Remains bought for gold or Crowns-for-gold move drop odds. Rows N-5 and N-3 on `13-security-list.md`.

### 1.5 UI

The Hearth window, one panel. The return card, one line. The hall, the fire.

| Place | Lines |
|---|---|
| Hearth panel | `Inner Flame · Level 34` · `Height 20 / 23` · `Rare chance +27%` · `Burns 1.3 an hour while hunting` · button `Burn Remains` |
| Stoke rule (plan) | `Stoke: Keep full` / `Keep 2/3` / `Off` · `Burn own Remains first` · `Buy up to 40 a day · max 320 each` · `Sell the rest` |
| Rare chance tooltip | `+27% from Inner Flame · x2.4 from depth 14` |
| Return card | `Flame: burned 41 Remains · Rare chance +26%` |
| Burn refused past room | `Flame is full · 0 burned` |
| Hall | The fire's height drawn, Level 99 color |

### 1.6 The power ledger

0 steps (`19` row 11). Luck sits under `kitSpreadMax`, one tier, as the 10th against the 90th percentile kit at the same Level and hours. The flame widens that spread by making Rares more common for a fed company, so the check is the kit sampler with the flame on: a company on own drops at Flame Level 99 against an unfed one, and a full bought flame against own drops, at 10, 12, 14 and 16 hunted hours a day. If either gap passes one tier, the fix is `luckHalf` or the room curve, never a rule on where fuel came from (`02` 2b).

### 1.7 Lab runs

| # | Proves | Pass | Command | Today |
|---|---|---|---|---|
| F1 | `fuelRef`: Remains a hero-hour at the reference | Read, then written into `FLAME` | `node tools/balance-program/redesign/v1-climb.mjs --risks steady --seeds 8 --hours 12 --json f1.json` (Remains column) | Runs today. OWED: a Remains column in the report |
| F2 | The flame under `kitSpreadMax` | Fed against unfed at FL 99, and full against own drops, each under 20 steps at p10 / p90 | `node tools/balance-program/redesign/kit-sampler.mjs --levels 60,120,200 --hours 40,200,1000 --flame 0,own,full --flame-level 1,50,99 --hours-day 10,12,14,16` | OWED: the kit sampler (`19` V10) and its `--flame` flags |
| F3 | A leveling company loses gold by burning | Coin plus Rare value at the market guide, flame off over on, above 1.0 at FL 1, 50, 99 | The account-day model (`09` 5.8 item 6) with `--flame own,full` | OWED: the account-day model |
| F4 | Flame Level pace | 99 in 120 to 250 days on own drops at 8 hunted hours, payer at most 1.6x faster | Same model, `--report flame-level` | OWED |

### 1.8 Engine pieces

1. `company_flame` row and its read in the settle, once a window. 2. Integer height decay a settled minute in `src/core/inner-flame.js`, called by the edge and the Lab. 3. The drop roller (`04` section 10, wave 4) takes a `luckPm` and a `topRankPm` per hero. 4. The stoke rule's burn inside the settle, and its market orders through `hr_market_plan_reconcile`. 5. Retire the regeneration link and the old Inner Flame skill XP.

### 1.9 Walk-through: a new company's first flame

| Step | Holds or can reach, from earlier steps only | Doable |
|---|---|---|
| 1. Hunt Muster Barrows on the scale | A company and a plan; Muster is the one scale ground (`DANGER_GROUNDS`) | Yes, once R1's client half ships |
| 2. Remains drop | Bones, Big Bones, Bone Chips, Grave Dust on its rows (CODE, its pack) | Yes |
| 3. The default stoke rule burns them | Remains from step 2; the rule is the plan's default (`Keep full`, burn own) | OWED: `company_flame`, the settle burn |
| 4. The return card shows `Rare chance +20%` | The height from step 3 | OWED |
| 5. A Rare drops a little more often | The roller reading `luckPm` | OWED: the roller, wave 4 |

---

## 2. Temper and carry-over

### 2.1 How it plays

- The smith tempers a gear slot, not a piece: Temper 3 on your weapon slot is +3 item Levels on whatever weapon you wear.
- Each slot has five ranks. One more opens every 40 Levels, so Temper grows with your hero for life.
- When you wear a new tier, your ranks come with you and are re-seated for about a third of their price. Your plan does it by itself up to a price you set.
- Sell or swap a piece and its Temper stays with your hero. A piece is priced as itself.
- Outgrown a great Rare? An artificer carries its Traits onto a plain base of the new tier and the old piece is gone.

### 2.2 Temper: rules and numbers

- **A rank is +1 item Level on the slot** (`temperIlPerRank` 1, fixed by `19`'s 5-step budget). It adds to the piece's item Level inside the gear part, at the slot's weight. A whole kit at rank 5 is +5 steps (`19` row 4). It never counts for the wear check (`wearAhead`).
- **Ranks open by hero Level:** rank r at Level `temperRankEvery` x r: 40, 80, 120, 160, 200 (D-2).
- **Price, in hours of wage at the worn piece's item step.** A full Temper is `temperHours` 3 hours of wage a piece on average, 39 for a whole kit of 13 slots, weighted by slot (`GEAR_STEPS.slotPm`) so a ring rank costs what it is worth: a slot's full Temper is `39 x slotPm / 1000` (weapon 7.8, ring 1.95). Ranks 1 to 5 take 1, 2, 3, 4 and 5 fifteenths of it. Half is Temper kits (Smithing goods at the piece's band, `09` chain 3), half is a fee, burned (`temperKitShare` 0.5).
- **Re-seat at a new tier.** A slot's ranks are seated on a tier. A piece of a higher tier in that slot leaves the ranks unseated, and they count 0, until re-seated for `temperCarry` x the ranks' full price at the new item step. The plan's rule `Re-seat Temper · up to N hours of wage` (default on, N = the price at reference) does it at the next town stop, so nobody presses it (first principle). A piece of the same or a lower tier keeps them seated.
- **Never lost.** Not on a death, a sale, a swap or a listing.

| Example, item step 60 (wage 16,365) | Hours of wage | Gold |
|---|---|---|
| Weapon, rank 1 | 0.52 | 8,510 |
| Whole kit, rank 1 (Level 40 to 79) | 2.6 | 42,550 |
| Whole kit, ranks 1 to 2, at item step 80 (Level 80 to 119) | 7.8 | 138,260 |
| Re-seat a whole kit at rank 2 onto item step 100 | 0.35 x 7.8 = 2.73 | 52,410 |
| Whole kit, all five, at item step 200 | 39 | 1,116,140 |

(COMPUTED.) At the reference a hunted hour nets about 0.73 hours of wage (`04` 11, MEASURED), so a whole kit's first rank is about 3.5 hunted hours of coin for +1 step, about 0.7% pace for the rest of the hero's life. Small, steady and never needed: the sink `09` 2.4 sized at about 4.6% of coin.

| Lever | Start | Band |
|---|---|---|
| `temperRankEvery` | 40 Levels | 30 to 50 (`rampLevel` / 5) |
| `temperHours` | 3 hours of wage a piece | 2 to 4 |
| `temperKitShare` | 0.5 | 0.3 to 0.7 |
| `temperCarry` | 0.35 | 0.25 to 0.5 |

### 2.3 Carry-over: rules and numbers

- **What moves.** Every Trait on the old piece, with its rank: one on a Rare, two on a Very Rare (D-6). Rarity moves with them.
- **Where to.** A plain base (no Trait) of the same slot and the same or a higher tier (`19` L3). A ring Trait fits either ring (`GEAR_STEPS.traitSlots`).
- **What it takes.** The old piece, destroyed. `carryParts` rare parts from the Trait's home ground for each Trait: 2 + rank (Muster Barrows: Coffin Nail, Urn Shard, Sergeant's Spur, Hask's Coin, any mix). A fee of `carryHoursPerStep` x the Traits' steps (`traitSteps` 4 / 7 / 10) hours of wage at the new base's item step, burned. `carryWork` work-hours of an Artificing hero, at the trade Level the new base's band opens.
- **Nothing rolls.** No failure, no reroll (`02` package 2). The job's two writes escrow both pieces, then write the new piece.
- **Refused** while either piece is escrowed on the market (`13-market` 2.3), and for a Signature piece (a Signature is the piece).
- **The price rule.** A carry must stay under the catalogue value of the same piece bought new at the new tier (`13-market` 3.2), or the market beats the bench. At `carryHoursPerStep` 0.5 a rank 3 carry is 5 hours of wage against a Rare's V of 4 x (1 + rank value): just under, as it should be.

| Example, onto item step 80 (wage 17,726) | Parts | Hours of wage | Gold |
|---|---|---|---|
| File Breaker rank 1 | 3 | 2.0 | 35,450 |
| Captain's Due rank 2 | 4 | 3.5 | 62,040 |
| Very Rare, two rank 3 Traits | 10 | 10.0 | 177,260 |

| Lever | Start | Band |
|---|---|---|
| `carryHoursPerStep` | 0.5 | 0.3 to 1.0 |
| `carryParts` | 2 + rank, a Trait | 1 + rank to 4 + rank |
| `carryWork` | 1 work-hour | 0.5 to 2 |

### 2.4 Data shape

| Where | Shape |
|---|---|
| `src/data/temper.js` (rebuilt, `19` L11) | `TEMPER` levers above. Replaces the old rung table and its 1% rungs on scale grounds |
| `hero_temper` (new) | `user_id`, `slot` (hero), `equip_slot`, `rank` 0 to 5, `seated_tier`. Primary key the first three |
| `src/data/gear-steps.js` | `CARRY` levers beside `traitSteps`. Carry reads the parts list from the Trait's `source` ground's pack (its uncommon rows) |
| `trait_pieces` (wave 4, `12-targets` 8) | Carry-over rewrites `traits` and `rarity` on the target row, deletes the source row, keeps the source's find line on the target as `carried_from` |

### 2.5 Server verbs and journals

| Verb | Does | Journals |
|---|---|---|
| `hr_temper_rank(intent, hero_slot, equip_slot, price)` | Next rank. Checks the rank opens at the hero's Level, re-quotes under the hero lock, refuses `quote_changed`, takes kits from bag then Storage, burns the fee | `temper`: gold burned, kits out, rank before and after |
| `hr_temper_seat(intent, hero_slot, equip_slot, price)` | Re-seats on the worn tier at `temperCarry` | `temper_seat` |
| Plan reconcile at a town stop | The `Re-seat Temper` rule calls the same body under its price cap | Same kinds |
| `hr_carry_over(intent, from_piece, to_piece, artificer_slot, price)` | Starts the job: checks slot, tier, plain target, ownership, no escrow, the artificer's Level. Escrows both pieces, takes parts and fee. The job's end writes the target and deletes the source | `carry_start` (parts out, gold burned), `carry_done` (piece destroyed, piece changed) |

Money surfaces: all three. Rows N-6 and N-7 on `13-security-list.md`.

### 2.6 UI

| Place | Lines |
|---|---|
| Gear slot tooltip | `Rune Sword · Item Level 60 (+2)` · `Temper 2 / 5` · `Next rank at Level 120` |
| Smith, Temper tab | `Weapon slot · Temper 2 → 3` · `Needs: 6 Temper Kits · 12,400 gold` · button `Temper` |
| Unseated | `Temper 2 / 5 · not seated` · `Re-seat: 4,300 gold` · button `Re-seat` |
| Plan | `Re-seat Temper · up to 50,000 gold` |
| Artificing, Carry over | `From: Barrow Pike · File Breaker II` · `To: [plain base]` · `Destroys: Barrow Pike` · `Needs: 4 Muster parts · 62,040 gold · 1 work-hour` · button `Carry over` |
| Return card | `Re-seated Temper on 3 slots · 18,200 gold` |

(Barrow Pike is a placeholder base name for the example. Base names come from R10's scale drop tables.)

### 2.7 The power ledger

Temper is its own slice, 5 steps on a whole kit at Level 200, opened in whole ranks under the ramp: 1 at Level 40, 2 at 80, 5 at 200 (`19` section 2's table: 0.25 / 0.75 / 1.5 at 10 / 30 / 60 is the curve; ranks sit on or under it). Carry-over adds no steps: Traits stay inside `conditionalStepsMax` 20. What carry-over changes is time. A great roll lives several tiers, so the p90 kit at Level 200 holds better Traits than without it. The kit sampler checks that the p90 against p10 gap stays under one tier with carry-over on.

### 2.8 Lab runs

| # | Proves | Pass | Command | Today |
|---|---|---|---|---|
| T1 | A whole kit at Temper 5 is 5 steps | Held step +5 +- 2 on Muster, Steady | `node tools/balance-program/redesign/v1-climb.mjs --candidate temper-5 --risks steady --seeds 8 --hours 12` | OWED: `tools/balance-program/candidates/temper-5.json` (+5 item Levels on every slot) |
| T2 | Temper never outweighs a tier | `power-tier-ahead` minus `temper-5` at least 12 held steps | T1 against `--candidate power-tier-ahead` | Runs today for the tier half |
| T3 | Carry-over keeps the luck spread | p90 against p10 under 20 steps at Levels 120 and 200, carry on | `node tools/balance-program/redesign/kit-sampler.mjs --levels 120,200 --hours 200,1000 --carry on,off` | OWED: kit sampler |
| T4 | Temper and carry-over as sinks | Their share of gold destroyed 5 to 12% at day 30 and 180 | The account-day model, `--report sinks` | OWED |

### 2.9 Engine pieces

1. The gear part reads `hero_temper` as +rank item Levels on seated slots (`src/core/hunt/danger.js` powerPm). 2. The wear path (`company_wear`) unseats on a tier change and the reconcile re-seats under the plan cap. 3. Carry-over as an Artificing job row on the closed-form job model (`09` section 6). 4. `trait_pieces` with escrow (wave 4).

### 2.10 Walk-through: a Muster Rare outgrown

| Step | Holds or can reach, from earlier steps only | Doable |
|---|---|---|
| 1. A Rare weapon with File Breaker drops at Muster depth 9 | Muster's pool has File Breaker (`traitPool('muster_barrows')`); depth 9 opens rank 2 | OWED: roller, wave 4 |
| 2. The hero tempers its weapon slot to rank 1 at Level 60 | Gold from hunting; Temper Kits from Smithing | OWED: Temper Kit recipe, `hr_temper_rank` |
| 3. The company moves to Krell's Hold, a plain weapon of the next tier drops | Krell's Hold pack exists (CODE) | OWED: R10 opens it on the scale |
| 4. Wearing it unseats rank 1; the plan re-seats it | Gold, the rule from the plan | OWED |
| 5. Carry File Breaker II onto the new weapon | The old Rare (step 1), the plain base (step 3), 4 Muster parts from Muster hunts, an Artificing hero | OWED: `hr_carry_over` |

---

## 3. Imbuements

### 3.1 How it plays

- A hero carries three imbuements: an Edge on the weapon, a Ward on the body, a Leech on the helmet.
- Each one answers something a ground does: its brutes, its fire, its long fights. You pick them for where you hunt.
- An artificer makes them from a rare part found on another ground, plus Remains. So a part from one ground is wanted on another, and Remains go to the bench as well as the fire.
- Each lasts 20 hunted hours while worn. Time in town or away costs nothing.
- Your plan keeps them up: "on Krell's Hold, keep Fire Ward on the body". It applies a new one from Storage when the last runs out.

### 3.2 Rules and numbers

- **Three kinds, one slot each, one of each a hero.** Edge (offense) on the weapon, Ward (defense) on the body, Leech (sustain) on the helmet. A new one on a slot replaces the old one, which is lost (with a warning that names the hours left).
- **On the slot** (D-20). It stays on the hero's slot, as Temper does, and a new piece there keeps it. Its hours run only while a piece is worn in the slot. A piece never carries one.
- **Size** (D-16, D-17). Each imbuement is rated `imbueSteps` 2 steps averaged on the ground and seat it suits best (`best`, as Traits are, `04` guard 1), whole at every Level. On a blow its condition holds it fires at its `fire` size, 2 steps over the measured share of that cell its condition touches, and the card shows that number.
- **Conditional by construction.** Its "when" is a role, an element or a status, never a monster family (D-8), and never `in_fight`. Its average over every ground is at most half its best case (`traitAverageSharePm` 500).
- **No stacking.** One of each kind counts, and an imbuement never stacks with a Trait of the same key (the rule table's keys).
- **Band.** An imbuement carries the band of its rare part. On a hero above it, it is weaker by the contest curve (`09` 4.2). Held to at most `wearAhead` above.
- **Life.** Plain 20 hunted hours, Fine 25, Master 30 (`imbueLifeRung` 0.25, D-7). The timer counts hunted time while worn, in the settle.
- **Recipe.** `imbueParts` of its one named rare part, plus `imbueRemains` Remains of the part's band, plus `imbueWork` work-hours at the Artificing bench (`09` 4.3: the imbuement line is 0.1 of a kit-hour, so 0.08 work-hours a hunted hour for three, 0.53 work-hours each for 20 hours). The made imbuement is a stack keyed by kind, band and quality, and trades on the book.
- **Apply fee** (D-19). `imbueFeeHours` of wage at the imbuement's band, burned when applied, the same at every Level.

**What a hero pays** (COMPUTED at full ramp): goods worth about 0.13 hours of wage plus a 0.4 fee, 0.53 an imbuement for 20 hours, 0.08 hours of wage a hunted hour for all three, about 8% of gross coin. For that, up to 6 steps on the right ground, about 4% pace (MEASURED about 3% on Krell's Hold, 11.6), and about 2.4% more coin from depth. So imbuements are an XP choice that costs gold: "levels or gold tonight" (`02` package 5).

| Lever | Start | Band |
|---|---|---|
| `imbueHours` | 20 hunted hours | 12 to 30 (`09`) |
| `imbueSteps` | 2 | 1.5 to 3 |
| `imbueLifeRung` | 0.25 | 0.15 to 0.35 |
| `imbueParts` | 5 | 3 to 10 |
| `imbueRemains` | 4 | 2 to 8 |
| `imbueFeeHours` | 0.4 | 0.2 to 0.6 |
| `consumableStepsMax` | 6 (`19`, D-1) | 5 to 8 |

### 3.3 The sample of five

Each is sized on its `best` cell. Shown at full ramp (Level 200 and up). The part, its ground and the spells named are real rows (CODE: the packs named, `src/data/monster-classes.js` undead `elements`, `src/data/monster-roles.js`).

| Name | Tooltip | Slot | Made from | Best on | Why there |
|---|---|---|---|---|---|
| Fire Ward | `−4% Fire damage taken · 20 hunted hours` | Body | Ford Weed (Hask's Ford) | Krell's Hold, back row (D-17a) | Hot Pitch, Rake the Coals and Hall Fire are Fire. Worth nothing on Muster, where nothing casts |
| Fire Edge | `5% of damage dealt as Fire · 20 hunted hours` | Weapon | Rake Tine (Pyre Field) | Muster Barrows, any damage seat | Undead take 15% more Fire. Against a target that resists Fire it costs damage, so the bestiary page decides |
| Brute Edge | `+2% damage vs Brutes · 20 hunted hours` | Weapon | Pike Ferrule (Pyre Field) | Muster Barrows, melee | Barrow Knight and Captain Hask are brutes. Off against the Pikeman swarm, most of a pull |
| Life Leech | `Life Leech 2% · 20 hunted hours` | Helmet | Mudlark Hook (the Slake) | Krell's Hold, melee front | Long fights against big bodies. Fewer meals between pulls |
| Mana Leech | `Mana Leech 1% · 20 hunted hours` | Helmet | Urn Shard (Muster Barrows) | Pyre Field, mage | A caster's drinks bill. Useless to a healer, who deals little damage |

(Re-homed 2026-11-26 by D-12: every part and best ground is one v0.3.0 opens. Coal Tongs, Fire Gland and Leech Jaw bring their higher-band rows when Carter's Rest, Wyvern Roost and the Catacombs open.) Every part comes from a different ground than its best one, so every imbuement makes a trade between two grounds (`02` package 5). Fire Edge and Brute Edge share the Edge slot, so a melee hero on Muster chooses between them by the pull. The shares behind the sizes (Fire as a tenth of a front hero's damage taken on Krell's Hold, brutes as a quarter of a pull's health on Muster) are ASSUMED until I1.

### 3.4 Data shape

| Where | Shape |
|---|---|
| `src/data/imbue-rules.js` (new, replaces `imbuements.js`) | One row an imbuement: `id`, `name`, `kind` (`edge`, `ward`, `leech`), `slot` (from `kind`), `raises` (offense, defense, heal, mana), `when` (a condition row, `condition-metrics.js` shape), `element` or `convert` where it applies, `key` (the rule table's stacking key), `part` (an item id), `best` (seat, ground), `tip` with `{pct}`. Levers `IMBUE` above |
| Items | The made imbuement: a stack keyed (kind, band, quality), one item row an imbuement id. The rare parts keep their pack rows; their old `imbue.kind` field retires |
| Slot | `hero_worn_imbue (user_id, slot, equip_slot, imbue_id, band, quality, ms_left)`, on the hero's slot, never on the piece row (D-20) |

### 3.5 Server verbs and journals

| Verb | Does | Journals |
|---|---|---|
| Artificing job (`09` section 6) | Makes imbuement stacks from parts and Remains. Seeded quality roll at the job's start | `craft` (the job's two rows) |
| `hr_imbue_apply(intent, hero_slot, equip_slot, imbue_id, band, quality, price)` | Checks the kind fits the slot, takes one from bag then Storage, re-quotes and burns the fee, writes the timer. Replaces any old one | `imbue_apply`: item out, gold burned, the replaced one's hours lost |
| Plan reconcile | The `Keep imbued` rule applies from Storage at hunt start or when one runs out | Same kind |
| Settle (engine) | Counts hunted ms on worn imbuements and clears a spent one | Folded into the hourly journal |

Money surface: yes (items consumed, gold burned, a power source). Row N-8 on `13-security-list.md`.

### 3.6 UI

| Place | Lines |
|---|---|
| Gear slot | A small mark on the slot. Tooltip `Fire Ward · −4% Fire damage taken · 14 h left` |
| Artificing, Imbue tab | `Fire Ward · Band 120` · `Needs: 5 Fire Gland · 4 Remains · 0.5 work-hours` · button `Make` |
| Apply | `Body: Fire Ward · 20 h` · `Replaces: Fire Ward · 3 h left` · `Fee: 6,200 gold` · button `Imbue` |
| Plan | `Krell's Hold · Body: Fire Ward · Keep imbued` |
| Return card | `Imbued 2 pieces · 1 ran out (no stock)` |
| Hunt card | `Fire on this ground` beside the bestiary's spells, so the reason to pick a Ward is on the screen |

### 3.7 The power ledger

Consumable slice, 6 (`19` row 10, D-1): three imbuements at a rated 2 each fill it, whole at every Level (D-16). A draught (3) or a camp pot (2) is chosen in place of an imbuement. The choice ceiling of `19` (best saved build against the suggested path, 5 to 10%) compares builds at the same kit, so imbuements sit outside it by construction. They sit inside the gold ceiling (Temper + consumables + bought Traits, under two tiers).

### 3.8 Lab runs

| # | Proves | Pass | Command | Today |
|---|---|---|---|---|
| I1 | Each sample imbuement is 2 steps on its best cell | Held step +2 +- 1 with the ramp off (full size), Steady | `node tools/balance-program/redesign/v1-climb.mjs --candidate imbue-<id> --ground <best> --styles <best seat's four> --risks steady --seeds 8 --hours 12` | OWED: five candidate files; Krell's Hold, Ox Road, Pyre Field and Wyvern Roost on the scale (R10). Brute Edge on Muster runs once its candidate exists |
| I2 | Average at most half the best case | Each one on every scale ground, mean gain under 1 step | I1 over `--ground` each | OWED with I1 |
| I3 | Felt | A full set of three moves held depth by 0.4 or more on its ground. If not at 3 steps, cut the line before adding anything (`09` 5.8 item 2) | I1 with `--candidate imbue-set-<ground>` | OWED |
| I4 | No dead buy | With three imbuements on their best ground a draught adds 0 and the keep rule does not buy it. Swapping the Ward for a draught moves the held step by the draught's size less the Ward's | I1 with the set plus a draught, and with the swap | OWED: draughts (later patch, `20`) |

### 3.9 Engine pieces

1. Conditions `target_role` (the role row of `monster-roles.js`) and `hit_element` (the element of the blow taken, for Wards). 2. A conversion rule for Edges like Fire Edge: a share of a blow resolved against the target's element percent in place of its weapon percent. 3. Leech: heal and mana on damage dealt (shared with `15`'s mana on hit, #20). 4. The worn-imbue row and its timer in the settle. 5. Slice clamping by key (`19` L1).

### 3.10 Walk-through: a melee hero's first Edge at Muster

| Step | Holds or can reach, from earlier steps only | Doable |
|---|---|---|
| 1. Hunt Pyre Field | Pyre Field pack exists, Levels 70 to 80 (CODE) | OWED: R10 on the scale |
| 2. Pike Ferrule drops | Its row is in the Pyre Field pack (CODE) | Yes off the scale today |
| 3. Remains drop | Bones on Pyre Field rows (CODE) | Yes |
| 4. Make Brute Edge at the Artificing bench | 5 Pike Ferrule (step 2), 4 Remains (step 3), a resting hero | OWED: Artificing, `imbue-rules.js` |
| 5. Apply to the weapon, hunt Muster | Brute Edge (step 4), gold | OWED: `hr_imbue_apply` |
| 6. It counts on Barrow Knight and Captain Hask | Their `role: 'brute'` (CODE) | OWED: `target_role` |

Step 1 is above Muster's band (70 to 80 against 57 to 75), so a Muster company usually buys Pike Ferrule from a Pyre Field company. That is the trade between grounds the design wants.

---

## 4. Personal loot

### 4.1 How it plays

- Every hero rolls its own drops on every kill it was at. What it finds is its own.
- There is no rare roll and no waiting a turn. A Rare goes to the hero who rolled it, and the party feed says so.
- A party never drops more than its heroes would apart: each hero rolls at its share of the kill, so the market is not flooded.
- Each hero's Rare rolls read its own company's flame, so a mixed party of two accounts each chases on its own fire.
- Coin is still split evenly. Your loot rules decide, per company, what is kept, sold or burned.

### 4.2 Rules and numbers

- **At the kill.** A hero is at a kill when it stands in the instance alive at that kill, the same rule as the XP share (CODE: `src/core/hunt/xp-share.js`, heroes alive at the kill). A hero who left or died rolls nothing on it.
- **The roll.** For each drop row, each hero at the kill rolls once at `ch / n`, n the heroes at the kill. Expected drops a kill are the row's, so rates authored "one in about N hunted hours for a hero" (`04` 11) hold in any party size.
- **Amended (12-targets 8.11, 2026-11-27).** A hero rolls a kill it is alive at AND took part in (struck, healed or shielded in its pull; every living hero when none did). A guaranteed row is dealt, one unit a kill to one roller by turns, never rolled at 1 / n. The flame reads only the Trait roll, never a drop row. The rule is frozen per hunt instance.
- **Rares.** The same roll. The roller adds per hero: depth (x1 to x3, `12-targets` 3.3), the hero's company flame (`luckPm`), then pity.
- **Pity, per hero.** `pityStepPm` added to a hero's Rare chance after each kill it rolled and missed, reset on a hit, so the long-run rate is the stated one (`04` guard 5, `GEAR_STEPS.pity.rare`). Per hero, so a seat that never finds anything catches up and nobody's luck is shared.
- **The Trait.** Rolled per hero from the ground's pool (`traitPool`), rank by depth and the hero's flame (D-4).
- **Coin.** Even split, remainder rotating (CODE: `party-split.js` `splitEven`, kept).
- **Hired heroes.** Their loot goes to the owner, on the owner's flame (D-9).
- **Retired.** The round-robin commons, the rare roll (`PARTY.rareRoll`) and its rotation (`rareWon`).

| Lever | Start | Band |
|---|---|---|
| `pityStepPm` | Set so the 90th percentile hours to a first Rare is under 2x the mean | Read by the Lab (L2) |
| `ch / n` | A rule, not a lever | |

### 4.3 Data shape

| Where | Shape |
|---|---|
| `src/data/party.js` | `PARTY.loot: 'personal'` in place of `lootSplit`, `rareRoll` retired |
| `src/core/party-split.js` | Gold half kept. The item half replaced by `rollFor(hero, kill, n, luckPm, pity)` on the server-only loot stream, seeded per hero, so viewed and closed hunts hand the same drops to the same heroes |
| `hero_pity` (new) | `user_id`, `slot`, `rarity`, `misses` |
| Drop rows | Unchanged shape. Values re-authored in hunted hours by the roller lane (`04` 11) |

### 4.4 Server verbs and journals

No new client verb. The settle credits each hero's bag with its own drops (`hr_hunt_apply_member`, journalled `loot` per hero as today) and writes Trait pieces as rows (`trait_drop`, with the kill, the depth and the hero). Drop tables and the roller are a money surface: row N-9 on `13-security-list.md`.

### 4.5 UI

| Place | Lines |
|---|---|
| Party feed | `Rook: Rare cape · Raised Colors II` |
| Loot window | One column a hero, its own bag. No roll window |
| Return card | `Rares: Rook 2 · Ada 0 · Wren 1` |
| Rare tooltip | `Found by Rook · Krell's Hold · depth 14` |

### 4.6 The power ledger

0 steps. Personal loot does not change how much drops, only to whom. With per-hero pity it narrows the spread between heroes, so it helps the luck ceiling (`kitSpreadMax`).

### 4.7 Lab runs

| # | Proves | Pass | Command | Today |
|---|---|---|---|---|
| L1 | No flood | Drops an hour a head within 5% between a party of 4 and the same heroes apart, at the same held depth | `node tools/balance-program/redesign/v1-climb.mjs --risks steady --seeds 8 --hours 12 --loot personal` and a lone-hero cell | OWED: `--loot personal` and a per-hero drop column |
| L2 | Pity | p90 hours to a first Rare under 2x the mean, per hero | Same, 40 seeds, `--report first-rare` | OWED |
| L3 | Viewed equals closed | The same drops to the same heroes over one span and N windows | `tests/hunt-core/` party loot parity (the existing rare-roll rotation test, re-aimed) | OWED: the test |

### 4.8 Engine pieces

1. Per-hero roll on the server-only stream (replaces `rareWon`). 2. `hero_pity` read and written in the settle's own write. 3. The roller (`04` 10, wave 4) takes luck and pity per hero. 4. The per-hero loot rules and the owner routing for hired heroes. Both paths ship with a test: hunt viewed and browser closed (`CLAUDE.md` section 4).

---

## 5. Repeated decisions (the first principle)

| Where a player could repeat a choice | What remembers it |
|---|---|
| Burning Remains after every hunt | The stoke rule, set once |
| Buying fuel every day | The stoke rule's standing buy order and price cap |
| Re-seating Temper at each new tier | `Re-seat Temper · up to N`, default on |
| Re-applying imbuements every 20 hours | `Keep imbued` per ground and slot, applied from Storage |
| Re-picking imbuements when changing ground | The rule is per ground: a plan copied to Krell's Hold brings its Fire Ward line |
| Restocking imbuements | A stock rule at the bench (`09` 3.4), like meals |
| Carry-over | Not automated on purpose: it destroys a piece, so it is one press each time. It happens about once a tier a slot |
| Rolling for party loot | Gone |

---

## 6. What this file did not check

- No engine run. Every size above is COMPUTED or ASSUMED, and each has its Lab run.
- `fuelRef`, the share of Fire in a front hero's damage taken on Krell's Hold, and the share of a Muster pull's health in brutes are guesses until F1 and I1.
- `19-power-ledger.md` and `20-v030-the-roads.md` arrived on the base mid-lane. D-1 and D-2 are written here; the one-line edits to `19` rows 4 and 10 and lane L11 are owed by the next lane that touches `19`.
- The base name in the Temper and carry-over examples ("Barrow Pike") is a placeholder. Scale drop tables come with R10.
- Hired heroes are not designed elsewhere yet. D-9 is the rule they must follow.

---

## 7. Built on steps (2026-11-26, game designer, `lane/tp-im-steps`; `20` lanes TP and IM, the design and data half)

### 7.1 How it plays

- **Temper.** From Level 40 the smith tempers each gear slot, one rank every 40 Levels. A rank is one item Level on whatever that slot wears, so a whole kit at rank 5 is 5 Levels of power and never more. Each rank takes gold and that piece's band of Tempering Salts, which your company's Smithing mixes from three bars of the same metal. Iron's salts temper Iron, Steel's temper Steel, and so on to Dawnsteel.
- **Imbuements.** From about Level 45 an Artificing hero makes an imbuement from five of one body's part and four Remains. You get one Edge, one Ward and one Leech a hero. Each one works on its own ground's problem (a Brute Edge on Muster's knights, a Fire Ward on Krell's Hold) and lasts 20 hunted hours. Three imbuements fill your hero's consumable room, so a damage meal on top of them adds nothing, and the hero card says so.

### 7.2 Rulings made here

| # | Ruling | Amends | Why |
|---|---|---|---|
| D-11 | **The room rule.** A worn imbuement takes its steps of the consumable slice's room on every blow, firing or not. On a blow its condition holds, it counts its steps. A draught or a damage meal gets only what is left, so three imbuements leave a meal nothing. Built as one clamp rule: a ledger row with `holds: false` reserves room in a gains-only slice (`src/core/power-ledger.js`) | D-1 (states the rule the clamp needed) | Per-channel caps alone let an Edge (offense), a Ward (defense) and a meal (offense) stack past 6 between them. Room by what is worn is what "in place of, never on top" means |
| D-12 | **The sample is re-homed onto the grounds v0.3.0 opens.** Fire Ward from Ford Weed (Hask's Ford), Fire Edge from Rake Tine (Pyre Field) with its best on Muster, Life Leech from Mudlark Hook (the Slake) with its best on Krell's Hold. Brute Edge and Mana Leech keep their parts. The element word is the data's (`ember`, shown as Fire) | Section 3.3's table | Three of the five rows were made from staged grounds' parts, so v0.3.0 could make no Ward and no Life Leech, and a hero could never fill three slots. `validateImbues` now refuses a row whose part or best ground is not open and a condition that names no role or element, and `tests/imbue.mjs` refuses a key a Trait uses (the Traits stay hidden data) |
| D-13 | **A part is a Material only when an imbuement row names it.** The old `imbue: { kind, tier }` field on every body's part is gone (`part: true` marks the drop rule's row). The five sample parts are Materials and never bulk-sold. Every other part, the first grounds' included, is Junk and sells | Section 3.4 (the old field retires) | A bag full of parts that feed nothing is a dead reward. Under Level 35 no imbuement can be worn (the lowest band is 45, worn from 35, D-16), so a new player's parts are gold. A new imbuement row files its part as a Material by itself |
| D-14 | **The Temper kit is the Tempering Salts, one a band** (`src/data/temper.js TEMPER_KITS`): Iron to Emberforged are the live salts, Dawnsteel's is a new good. A rank on a piece takes the kits of that piece's band, never another band's. Bronze has none (rank 1 opens at Level 40, where Steel is worn). The kit is a K1 kit trade: Smithing's `temper_kit` kind, three bars of its band, named `Mix Fine Tempering Salts` and its sisters (`src/data/trades.js KIT_RECIPES`, batch 2) | Section 2.2 ("half is Temper kits") | One kit for every band would let a cheap band's kit pay for a dear band's rank. Reusing the salts keeps the item players already know, the Tower keys' prize stays the same item, and no new art is owed until Dawnsteel |
| D-15 | **The old Tempering rungs are retired whole**: the tier ladders, Dawnsteel's small rungs, the unique bands, the Blows and Armor numbers in the fight, the smith's pane, the coach and next-buy lines, and their guards. The steady cut (a cape's `steadyPm` and a steady meal) shared their hook, so it keeps the hook and its old cap of 5 steps in the temper slice until its own slice is ruled (CONFLICTS 2026-11-26) | `19` row 4, `20` TP ("the old rungs are gone") | Two Tempers would be two rules for one sink. The cape's cut is a separate stat, and moving it to another slice is a balance change of its own, so it is named and left in place |

### 7.3 What is built (data and pure core, each with its test)

| Piece | Where | Test |
|---|---|---|
| Temper on steps: ranks by Level, the price, the seat, the gear and defense parts, the cap on a full kit | `src/data/temper.js`, `src/core/temper-steps.js`, `src/core/hunt/danger.js`, `amount.js` | `tests/temper-steps.mjs` TS-1 to TS-7 (15 mutants) |
| The Temper kit a band, and its named recipes | `src/data/temper.js TEMPER_KITS`, `src/data/trades.js`, `src/core/trades.js temperKitAt` | TS-6, `tests/kit-recipes.mjs` (14 mutants) |
| Imbuements: rows, recipe, worn set, steps by band, ledger rows, the room rule | `src/data/imbue-rules.js`, `src/core/imbue.js`, `src/core/power-ledger.js` | `tests/imbue.mjs` IM-1 to IM-7 (16 mutants) |
| The engine reads them on the scale: a worn set rides the hero (`wornImbues`), Temper the perks (`temperSteps`) | `src/core/member.js`, `hunt-spawn.js`, `combat-sim.js`, `amount.js`, `damage.js` | `tests/hunt-core/amount.mjs` imbue, temper-paths, imbue-paths (both paths: 10-minute and 100-second windows play one hunt) |
| The client reads the two dark sections | `src/session/item-sections.js temperStepsOf, imbuesOf`, the Advanced view, the smith crier | `tests/envelope-contract.mjs`, `tests/town-criers.mjs` |

Still owed elsewhere: the leech rule and the Fire Edge conversion in the engine (3.9 items 2 and 3: today they only take room), the Artificing and Smithing jobs (K1's job slice), the server's worn-imbue projection (HANDOFFS 2026-11-26 lane/tp-server-1; the kit by band and the band lock are staged in 1071-tp-im-server.sql, section 7.7), and the Temper tab and imbue apply in the client.

### 7.4 Readings

| Reading | Value | Kind |
|---|---|---|
| Whole kit at rank 5 on the gear part, the armor part and the ward part | +5.000 steps each, a forged rank 9 the same | COMPUTED on the engine's own functions (TS-4, TS-7) |
| Three imbuements at Level 200, own band, on a brute: offense | 2.0 steps (Brute Edge), a 6-step meal on top adds 0 | COMPUTED through the clamp (IM-7) |
| The same at Level 60 | 0.6 of a 1.8 cap | COMPUTED (IM-7) |
| One blow on Muster's knight, Level 200 hero, three worn | +2 conditional steps on the knight, 0 on a pikeman; a Fire Ward takes 2 off an ember blow only | ENGINE (amount.mjs imbue) |
| Muster's four at Level 60, Steady, 4 seeds x 8 h, the held step from hour 4: C0 (the MID kit, which holds Temper rank 1 on every slot at Level 60) against Temper 5 on every slot plus Brute Edge, Fire Ward and Mana Leech at Muster's band (`node tools/balance-program/redesign/v1-climb.mjs --candidate tp-im-full --only base --risks steady --seeds 4 --hours 8`) | 622.4 +- 3.8 against 626.2 +- 5.0: +3.8 steps, inside the +4 Temper adds over rank 1 plus at most 1.8 of consumables (6 x ramp at 60), and inside T1's +5 +- 2. No death either way | MEASURED |

### 7.5 Walk-through: a hero's first Temper rank (real data, grepped on the set)

| # | Step | Holds and can reach, from earlier steps only | Real source | Doable |
|---|---|---|---|---|
| 1 | Reach Level 40 wearing Steel | Hunting from the first hour | `steel_sword` (item Level 40, worn from 30) | Yes |
| 2 | Smithing 21 | Town work | `temper_kit` opens at rung 3 (`bandRung`: band 2 at rung 3, Level 21) | Job slice (K1) |
| 3 | Three Steel Bars | Ore and the refine at band 2 | `KIT_FACES.bar[2]` `steel_bar` (an item) | Job slice (K1) |
| 4 | Mix Fine Tempering Salts | Three bars from step 3 | `temper_kit_b2`, makes `fine_temper_salts` (an item) | Job slice (K1) |
| 5 | Temper the weapon slot to rank 1 | 3 salts from step 4, 3,929 gold (`rankQuote('weapon', 1, 40)`) | `hr_temper_rank` | Staged (1071: the band's salts, bag then Storage; TP-RANK in tests/tp-im-server.mjs plays this row). Owed: the Temper tab |

### 7.6 Walk-through: a hero's first imbuement (real data)

| # | Step | Holds and can reach, from earlier steps only | Real source | Doable |
|---|---|---|---|---|
| 1 | Hunt Pyre Field (Levels 70 to 90) | A company at about Level 60 or more | Pyre Field pack, open | Yes |
| 2 | Five Pike Ferrules drop | Step 1 | Charred Pikeman's row, one every 0.22 hunted hours | Yes |
| 3 | Four Remains | Bones and Big Bones from any ground | Pack rows (the Remains good a band is `13-market` 2.4's, its face owed) | Yes |
| 4 | Make Brute Edge at the Artificing bench | Steps 2 and 3, 0.53 work-hours | `imbueRecipe('brute_edge')`: 5 `pike_ferrule`, 4 Remains, band 70 | Job slice (K1), `imbue_brute_edge` is not an item yet |
| 5 | Apply it to the weapon | Step 4, 1,964 gold at Level 60 (`applyFee(60, 60)`) | `hr_imbue_apply` | Staged (1071: the band lock, bag then Storage). Owed: the item (today `imbue_owed`), the switch |
| 6 | It counts on Muster's knights | Step 5, a hero of Level 60 or more (band 70 within wearAhead) | `muster_knight`, `captain_hask` role `brute`; the engine reads `wornImbues` | Owed: the server's projection of `hero_worn_imbue` onto the hero |

### 7.7 The server half, part 1 (2026-11-26, backend architect, `lane/tp-server-1`; STAGED in `1071-tp-im-server.sql`)

| Verb or read | Contract |
|---|---|
| The old rungs | Gone: the 60 `gen-temper` offers, the 12 `temper:*` ladders, every hero's rung of them (not converted, not refunded), the `temper` section and `hr_temper_view`, `hr_perks_of`'s `temper` key, and `temper` in `hr_unlock_buy`'s Storage list. A rung id answers `unknown_offer` |
| `hr_temper_rank(p_slot, p_equip_slot, p_price, p_idem)` | The kit is `hr_temper_kits` at the worn piece's band (`hr_temper_kit_at`, the twin of `temperKitAt`), never another band's. Kits from the bag, then the account's Storage, all or nothing, then one `hr_apply` of the fee, journalled `shop`, intent `temper:<slot>:<fee>`, `meta.kit` and `meta.took`. Refusals in order: `not_open`, `bad_slot`, `bad_equip_slot`, `bad_idem`, `bad_quote`, `intent_mismatch`, `rate_limited`, `no_character`, `no_piece`, `not_seated`, `rank_max`, `rank_locked`, `kits_owed` (no row for the band, or its kit is no item yet), `quote_changed`, `insufficient_item` (bag plus Storage short), `insufficient_gold`. A success answers the envelope |
| `temper_steps` section | The next rank's quote is `{ rank, fee, kits, kit, kits_owed }` |
| `hr_imbue_apply(p_slot, p_equip_slot, p_imbue, p_price, p_idem)` | `band_locked { band, level }` when the band stands more than `wearAhead` over the server's Level (`hr_imbue_wearable`, the twin of `imbueStepsAt`), after `no_piece` and before `quote_changed`. The item from the bag, then Storage |
| `imbues` section | Gains `wearable { <imbue>: bool }` at the hero's Level |
| Owed next | The settle's `wornImbues` projection (HANDOFFS 2026-11-26 lane/tp-server-1 has the field contract), the bench's quality roll, the K1 job slice that makes `dawn_temper_salts` and `imbue_<id>` |

---

## 8. The Inner Flame in the settle (2026-11-27, backend architect, `lane/f1-inner-flame`; `20` lane F1; STAGED in `1074-inner-flame-luck.sql`, dark)

### 8.1 How it plays

- Every Remains a hero picks up on a hunt goes on the company's fire by the stoke rule, the moment it drops. The default rule is Keep full, so a company that never touches it burns its own bones up to the room, and what does not fit stays in the bag.
- The fire burns down only while heroes hunt, minute by minute, and fills again as they kill.
- Each hunt rolls its Rares at the Rare chance the fire gave when that hunt began, and the return card says so: `Flame: burned 41 Remains · Rare chance +26%`. Stoke the fire before you set off. A Burn press mid-hunt raises the next hunt's chance.
- Keep 2/3 stops at two thirds of the room. Off burns nothing.

### 8.2 What is built

| Piece | Where | Test |
|---|---|---|
| The walk: decay by hunted hero-minutes on the window's clock, each drop burned at its instant up to the stoke target, the rest left in the bag | `src/core/inner-flame.js walk`, its SQL twin `hr_flame_walk` generated by `tools/gen-flame-temper.mjs` (VERIFY(t)) | `tests/flame-rules.mjs` FR-7 (any cut of one span stores one fire; 14 mutants) |
| Luck frozen per hunt, and the fuel's top Level | `hunt_flame`, trigger `hr_flame_session_freeze`, `hr_trait_drops_of` | `tests/flame-settle-db.mjs` FS-2, FS-5 (Rare hours planted short: a full fire froze +25.7%, both doors stored the same 35 pieces and pity, an empty fire 24) |
| The engine names each Remains and when, from the server's own fuel list | `src/core/hunt-rewards.js giveDrop`, `hunt-settle.js flameDropsOf` / `flameFor` | FS-2, FS-3 (a 45 s cut and a 90 s cut store one fire, the same bags and burns) |
| The settle re-proves every claim and lands each member net | `hr_flame_settle`, `hr_flame_net`, three splices of `hr_hunt_apply_instance` | FS-4 (`flame_over`, `flame_when`, `flame_order`, `bad_flame`), FS-1 (`flame_dark`); 12 mutants |
| The return card's line | `src/session/flame-sections.js`, `src/shell/windows/away.js` | `tests/flame-client.mjs` FC-1, FC-2 |

The calls the spec left open (luck frozen per hunt, the hunt's own drops only, the top Level frozen per hunt, a called room's Remains, the one accepted coupling) are CONFLICTS 2026-11-27 F1, the designer's to re-rule.

### 8.3 Readings

MEASURED: `node tools/balance-program/redesign/drops/hero-week.mjs --ground <g> --only flame --samples 2000` (the real roller with the ruled pity and base, solo at the reference held step; kit cells 500 heroes at 40 and 200 h, 200 at 1000 h). Luck 0 is unfed, +20% and +30% the own-drops fire at Flame Level 1 and 99, +36% a full fire at 99, the most luck the room allows.

| Read | Muster Barrows | Hask's Ford | Pyre Field | Krell's Hold |
|---|---|---|---|---|
| Pieces in a hero-week, unfed (base rates) | 1.58 | 1.56 | 1.59 | 1.54 |
| ...at +36% | 2.26 | 2.28 | 2.24 | 2.19 |
| V10, fed p90 against unfed p10 in steps (raw / held to the gear slice), worst of 40, 200 and 1000 h and three seats | 12 / 12 | 8 / 8 | 17 / 14 | 17 / 14 |
| V10, full p90 against own-drops p10, worst | 8 / 8 | 8 / 8 | 14 / 14 | 14 / 14 |
| The flame against the bank: 10 h unfed then 10 h full, x20, finds against the stated (reversed) | 0.96 (0.94) | 0.96 (0.96) | 0.95 (0.96) | 0.97 (0.94) |

- **Unfed drops stay at base rates:** an empty fire or a dark switch hands the roller luck 0, which multiplies the chance by exactly 1; the unfed week is the ruled pity's 1.54 to 1.59 (12-targets 8.6.1).
- **A full fire stays inside `kitSpreadMax` (20) on every cell**, raw and held. The widest gap is two Rank II Traits on Pyre Field and Krell's Hold at 200 h, where luck also lifts the top rank (D-4).
- **No bank through the flame:** alternating an unfed and a full fire finds under the stated finds (0.94 to 0.97), never over; a fire full the whole time reads 0.95 to 0.98. Pity counts the finds owed at the luck each roll had.
- **The first week runs a little over the luck:** +36% luck is +42 to +46% pieces in 70 hours, because pity starts low and a luckier roll fills it faster. Over the long run it is the luck.
- Not measured: the account-day model (F3, F4: a leveling company losing gold by burning, Flame Level pace) is owed with its model; `fuelRef` is still ASSUMED (F1).


## 9. Personal loot in the settle (2026-11-27, backend architect, `lane/p1-personal-loot`; `20` lane P1; STAGED in `1076-personal-loot.sql`, dark)

### 9.1 How it plays

- Every hero that fought a kill rolls its drops itself: it struck at the monster's pull or healed someone in it, and it was alive when the monster fell. What it finds is its own, in its own bag.
- A party drops what its heroes would apart. Each hero rolls each row at its share of the kill, so four heroes find what one would, split four ways by luck instead of by turns.
- There is no rare roll and no waiting a turn. A Rare goes to the hero who rolled it, and the drop moment names that hero.
- A watched hunt and a closed one hand the same finds to the same heroes.

### 9.2 What is built

| Piece | Where | Test |
|---|---|---|
| Who takes part: a mark on each hero, set by a blow struck at a monster (landed or missed, or a tick it set) or a heal or shield given a hero, cleared at each pull. A kill's rollers are the living heroes holding a mark, or every living hero when none does | `src/core/hunt/took-part.js` (persisted on the hero unit as `took`), read in order by the rewards walk | `tests/personal-loot-play.mjs` PLP-1, PLP-2 |
| The roll: each roller rolls the kill's whole table on its own odds (its weakness and drop buff), each row at 1 / (the rollers) of its chance after every multiplier and the cap, a guarantee's too, on its own loot stream (seed domain `l:<unit>`, one a swing, made only when it rolls) | `src/core/hunt-rewards.js` payPersonal, `src/core/drops.js` effectiveDropChance `share`, `src/core/combat-sim.js` lootStreams, `src/core/action-rules.js` SEED_DOMAIN | PLP-2, PLP-3 (13 mutants) |
| The Trait roll follows the same rollers, one in (how many of them) | `src/core/hunt-rewards.js` payKill | PLP-2 |
| The rule, frozen per instance when its hunt is made or moves ground, never a caller's value; the read hands it; the edge hands the engine `personalLoot` only when it is true | `hunt_instances.personal_loot`, trigger `hr_hunt_loot_freeze`, `hr_hunt_instance_read` restated whole, `hunt-settle.js`, `accrue-hunt.js` | `tests/personal-loot-db.mjs` PLD-1, the file's §5 |
| Each seat's bag and journal, both doors | `hr_hunt_apply_member` unchanged: its own delta, its own ledger row, its own item bound | PLD-2 (a closed and a viewed four store one bag and one journal a seat), PLD-3 (a seat past its bound refused `value_over`; 5 mutants) |

Off (the switch as applied), every hunt plays its party roll byte for byte: `tests/hunt-core/engine-parity.mjs` holds every timeline and tally pin, and only the stored world's field list grew (the mark).

### 9.3 Readings

MEASURED, one seed, `tests/personal-loot-play.mjs` PLP-4: a Level 60 four in steel on Muster Barrows on Steady, 10 minutes, 87 kills. Personal loot hands the seats 26 / 42 / 41 / 31 units (140), the party roll 42 / 34 / 35 / 39 (150). Every seat finds something, and the watched cut (twenty 30 s windows) and the closed one (one 10-minute window) store the same bags. The "no flood" verdict is Lab run L1 (section 4.7), still owed: this is one sample, not a rate. The calls the spec left open are CONFLICTS 2026-11-27 personal loot, the designer's to re-rule.


## 10. The worn imbuements in the settle (2026-11-27, backend architect, `lane/worn-imbues`; STAGED in `1077-worn-imbues.sql`, dark)

### 10.1 How it plays

- The imbuements a hero wears fight with it on every hunt, viewed or not. An Edge counts on its target's role, a Ward on the blow's element, and a Leech takes its room in the consumable slice.
- Each one runs out at its hour, to the second, whether the hunt is on screen or not. A Brute Edge with 2 hours left plays exactly 2 more hunted hours, then stops mid-pull.
- Imbuements are put on in town. Pressing Imbue while the hero hunts answers `hunt_open`.

### 10.2 What is built

| Piece | Where | Test |
|---|---|---|
| The projection: the hero's own `hero_worn_imbue` rows on a worn piece, in their kind's slot, with time left, `[{ id, band, msLeft }]`, null while the switch is off | `hr_worn_imbues_of`, `hr_hunt_instance_read` member `worn_imbues` (restated whole) | `tests/worn-imbues-db.mjs` WI-1, WI-3; the file's §5 (b), (c) |
| The run-out instant: msLeft counts from the session's settled_to, and the timer (1074) takes every settled millisecond off it, so settled_to + msLeft is one instant for the whole hunt. The engine drops the imbuement at its first boundary at or after it | `hunt-settle.js` memberInput, `src/core/imbue.js` wornImbuesOf (untilMs) and imbuesAt, `hunt-spawn.js` heroSetup readAtMs, `combat-sim.js` syncUnit | `tests/imbue.mjs` IM-8 (23 mutants); WI-2 (a closed hunt in 90 s windows and a viewed one in 30 s windows, the Edges running out inside a window on both, store one world, one tally a hero and one set of worn rows; 8 mutants); the file's §5 (d) |
| In town only: an open hunt refuses the apply | `hr_imbue_apply` restated whole, `hunt_open` after `no_character` | WI-4; the file's §5 (e) |

Found and fixed on the way: before this lane, an imbuement handed through heroSetup never reached a blow. heroSetup kept `{ id, band, kind }`, and the engine's re-read at every boundary dropped each one for having no msLeft. The tests had handed the engine the server's raw list directly, past heroSetup. IM-8 now plays the settle's own door.

### 10.3 Readings

| Reading | Value | Kind |
|---|---|---|
| Four Brute Edges on a Level 60 four for 120 s, the damage each hero dealt with and without (Hask's Ford, the play-ground kit, step 570) | 738 / 1712 / 1610 / 1586 against 737 / 1709 / 1611 / 1585; kills 10 each both ways | MEASURED, one seed (`proposeHuntSettle` on the replay) |
| The same on Muster in steel | the first blow it changes is the 132nd; the stored world after 270 s is the same | MEASURED, one seed |

At Level 60 an imbuement is 0.6 of a step (2 x ramp 0.3), and a blow's steps are rounded whole (`amount.js blowAmount`), so on these fixtures a full set moves a hunt by a few hit points. That is I3's question (section 3.8, "felt"), still owed and the designer's: CONFLICTS 2026-11-27 worn imbuements. The Leech and Fire Edge's conversion still only take room (section 3.9 items 2 and 3), and Mana Leech's `mana` is no ledger channel, so it takes none. (Ruled in section 11.)

---

## 11. Imbuement calls: the size, the leech, the conversion, where it sits (2026-11-27, game designer, `lane/designer-imbue-calls`; CONFLICTS 2026-11-27 worn imbuements (2) to (4))

### 11.1 How it plays

- An imbuement works the same at every Level. A Level 60 hero gets all of it, the way a piece of gear counts in full.
- Each one is strong on the blows it is for. A Brute Edge adds 2% to every blow at a brute and nothing to the rest, and the card says 2%.
- A Fire Ward is for your back row on Krell's Hold, where the casters take their fire. It cuts that fire by 4%.
- A Life Leech gives you back 2% of the damage you deal as health. A Fire Edge turns 5% of every blow into Fire, which is good against the Undead and costs you against anything that resists fire. The bestiary page says which.
- The imbuement stays on your hero's slot, like Temper. Put on a better sword and the Edge is still there. Its hours only run while a piece is worn in that slot.

### 11.2 Rulings made here

| # | Ruling | Amends | Why |
|---|---|---|---|
| D-16 | **The consumable slice takes no ramp.** Imbuements, the draught and the camp pot count whole at every Level, cap 6. An imbuement's Level gate is its band: worn from band minus `wearAhead`, weaker past it by the contest curve | `19` row 10, 3.2 Size, 3.7 | They are goods bought with a band, not something a hero grows into, so the ramp counted the Level twice. It made a Level 60 imbuement 0.6 of a step, and the engine's whole-step rounding then gave that 0.6 to one hero as a full step and to the next as nothing (10.3: 1 to 3 HP in 1,700). A whole number of steps passes the rounding exactly, so **the rounding is not the lever and no engine change is needed for it** |
| D-17 | **An imbuement is rated 2 steps and fires at its measured size.** It takes its rated 2 steps of the slice's room on every blow, firing or not (D-11 holds: three fill the slice, a meal on top adds nothing). On a blow its condition holds, it counts `fire` steps: 2 over the share of its best cell that its condition touches, measured, whole, at most `fireMax` 20 (one tier). The card shows the fire size. Brute Edge **5** (+2% vs Brutes), Fire Ward **11** (−4% Fire damage taken) | 3.2 Size, 3.3's tooltips | Built as 2 a firing blow, an imbuement averaged 2 x its share: Brute Edge 0.9 on Muster, Fire Ward 0.03 on Krell's front. That is the dead reward. Sized on the share, each is worth its 2 steps where it belongs, and the card's number is what the blow does |
| D-17a | **The Fire Ward's best seat is the back row of Krell's Hold**, not the front | 3.3, D-12 | MEASURED: the front takes 1.5% of its damage as Fire there (its blows are the brutes' swings), the mage and the healer 17.4% and 17.7% (the group spells). A Ward sized on the front would fire at 133 steps |
| D-18 | **The Leech and the conversion, in the fight.** A **Leech** heals its wearer `leech.pm` of the HP each of its own blows takes (a swing, a shot, a spell's hit; never a status tick), HP for Life and mana for Mana, through the heal cut and never past max, the fraction carried to the next blow so a 30 HP hit still pays. Life Leech **20** permille (2%), Mana Leech **10** (1%). A **conversion** (Fire Edge, `sharePm` 50) resolves 5% of each blow against the target's percent for Fire in place of the blow's own: one offense row of `stepsOf(1 + 0.05 x (Fire% / blow% - 1))` steps, a gain held by the clamp on a target weak to Fire, a whole cost on one that resists it. Both take their rated room | 3.9 items 2 and 3 | The leech reuses the spell leech's rule (`abilities.js leechBack`) with a carried fraction, since a floor on a 1 to 2% share of a 30 HP blow pays nothing. Life Leech's 20 is 2 steps of the front's damage taken on Krell's Hold (it takes 272,800 HP an hour and deals 101,300). The conversion is in steps so the browser and the edge agree, and on Muster's Undead (+15% Fire) it is +2 steps on every blow, its rated size. Mana Leech is sized in coin, not pace (`15`: mana does not bind on the held step): its bar is the Pyre Field mage's drink bill falling by at least twice the imbuement's price an hour (0.53 h of wage over 20 h), measured when the rule lands, `pm` 5 to 30 |
| D-19 | **The apply fee reads the imbuement's band, with no ramp:** `feeHoursPm` (0.4) hours of wage at the band, 6,813 gold for a band 70 Edge at any Level | 3.2 Apply fee | A good reads its band (Tyler 2026-11-22). With D-20 the worn piece no longer prices it: a fee at the piece's item Level would let a hero imbue a cheap piece and swap. With D-16 the effect is whole, so the price is too, and "levels or gold tonight" is the same choice at Level 60 and 200 |
| D-20 | **The imbuement sits on the hero's slot, not the piece** (as built: `hero_worn_imbue` is keyed by hero and equip slot). A new piece in the slot keeps it. It plays and its hours run only while a piece is worn there. A piece never carries one, so listing removes nothing | 3.2 "On the piece", 3.4 Piece row, `13-market` 2.3, `12-targets` section 6 | Temper already sits on the slot. One rule for both means an upgrade never costs an imbuement or a choice already made (the first principle), the market never prices one, and nothing moves between heroes or accounts. On the piece it would need a column on every piece row and an unlist rule for a power source that lasts 20 hours |

### 11.3 What is set here and what is owed

| Piece | Where | State |
|---|---|---|
| The slice whole at every Level | `src/data/power-ledger.js` `consumable.ramps` false | SET. `tests/imbue.mjs` IM-7, `tests/hunt-core/danger.mjs` ledger |
| The fire sizes, the Fire Ward's seat, Life Leech 20 | `src/data/imbue-rules.js` (`fire`, `fireMax`, `best`, `leech.pm`); `validateImbues` refuses a condition with no whole fire size from 2 to 20 (IM-1) | SET (data), played by the engine (lane/imbue-engine, 2026-11-27) |
| The fire size and the rated room in the clamp | `src/core/imbue.js imbueRows`, `src/core/power-ledger.js clampLedger` | BUILT (lane/imbue-engine, 2026-11-27): a firing row is `fire` x c over a room of 2 x c, counted outside the cap; rooms past the cap scale the firing rows. `tests/imbue.mjs` IM-7, IM-9; `tests/hunt-core/amount.mjs` imbue |
| The leech rule and the conversion | `src/core/hunt/imbue-leech.js` (through `damage.js landHit`), `src/core/imbue.js` `leechPay` and `convertMult`, `amount.js`, `tally.js` | BUILT (lane/imbue-engine, 2026-11-27). The carry is a persisted unit int (`leechMilli`), so the world shape moves (1069 hunt-sessions regenerated, the edge deploys with it). Both read the contest curve and the conversion waits on a blow it does not change (11.6, D-21 and D-22: BUILT, lane/imbue-d21-d22, 2026-11-28). `tests/imbue.mjs` IM-10, `amount.mjs` imbue and leech, `necrotic-storm.mjs` withered-cuts, `tests/worn-imbues-db.mjs` WI-7 (both doors) |
| The fee at the band, no ramp | `src/core/imbue.js applyFee(band)`; `hr_imbue_fee(band)` (1069, generated, VERIFY(n) by band); `hr_imbue_apply` and the section `imbues` restated in `1078-imbue-fee-timer.sql`; the piece-and-ramp `hr_imbue_fee(int, int)` dropped. `hr_imbue_levers.ramp_level` stays written and unread while 1063's STAGED catalogue is in the replay (its insert names it) | STAGED (lane/imbue-fee-timer, S-32). `tests/imbue.mjs` IM-3, `tests/worn-imbues-db.mjs` WI-6 |
| The timer only while worn | `hr_flame_temper_settle` restated in `1078-imbue-fee-timer.sql`: only a row `hr_worn_imbues_of` plays runs (its kind's slot, a worn piece) | STAGED (lane/imbue-fee-timer). `tests/worn-imbues-db.mjs` WI-2 (both doors), WI-5 |
| No staged catalogue moved | `hr_imbue_rules` holds no size or seat (`node tools/gen-flame-temper.mjs --check`) | |

### 11.4 Readings

| Reading | Value | Kind |
|---|---|---|
| What the conditions touch, Muster Barrows at Level 60 (the mixed four, MID kit, Steady, 12 seeds x 8 h, `v1-climb` base cell, its new condition-share line) | brutes take 43.8% of the hammer's damage, 29.1% of the bow's, 35.7% of the mage's; no blow at a hero is Fire | MEASURED |
| The same on Krell's Hold at Level 97 | brutes take 45.2% of the hammer's damage; Fire is 1.5% of the hammer's damage taken, 17.4% of the mage's, 17.7% of the healer's (the hammer takes 86% of the four's) | MEASURED |
| Brute Edge, Fire Ward and Mana Leech on all four, Muster, Level 60, paired against none (`--candidate im-muster-built`: as built, x ramp) | held −4.3 ± 2.5, pace −3.6 ± 2.2 pace steps: nothing | MEASURED |
| The same with the slice whole (`im-muster-whole`, the tree) | held −0.3 ± 2.6, pace +0.6 ± 2.2 pace steps: nothing (only the Edge fires on Muster, 2 steps on 44% of the hammer's blows) | MEASURED |
| The same with D-17's fire sizes (`im-muster-fire`) | held −3.8 ± 2.2, pace −1.4 ± 2.0 pace steps: inside the noise. Damage dealt a second over the hunt: as built +0.1%, whole +0.4%, with the fire sizes +0.9% on the three damage seats (hammer 17.10 to 17.27, bow 18.56 to 18.71, mage 21.02 to 21.22), the order and size the shares predict | MEASURED |
| What 12 seeds can read | One imbuement's rated 2 steps is about 0.9% pace (`15`: 0.43% a pace step), under the cell's se of 2 pace steps. A single imbuement is checked by its damage line and its share, a set of three by I3 | COMPUTED |
| I3 in full (a set of three that all fire) | On the tree with items 1 and 2 built (lane/imbue-engine, `tools/balance-program/redesign/imbue/run.sh` + `sum.mjs`, the mixed four, MID, Steady, 12 seeds x 8 h, paired against none). Krell's Hold at Level 97 (`im-krell-fire`: Brute Edge 70, Fire Ward 45, Life Leech 50): held +7.8 (se 2.7) steps, pace **+17.8 (se 5.7) pace steps**, Level XP an hour +4.9%, no deaths: I3 passes (held 0.4 or more) and reads past the bar of 6 ± 2 pace steps (CONFLICTS 2026-11-27, imbuements in the fight). Muster at Level 60 (`im-muster-fire`, the Mana Leech now returning mana): held −3.9 (2.0), pace −1.1 (1.9), inside the noise as before (only the Edge fires there). Re-read 2026-11-28 on each ground's own pace step (`15` "Decision: the pace step, ground by ground": Krell's Hold 0.610, Muster 0.398): Krell's **+12.6 (4.0)**, still past the bar, Muster −1.2 (2.0). (Re-read on 36 seeds in 11.6: +6.1 (1.9) at Level 97 and +5.2 (1.5) over the ground's span, inside the bar. The 12-seed plain drew four trapped seeds.) | MEASURED |
| Rated sizes on their best cells | Brute Edge 5 x 0.438 = 2.2 steps on the hammer; Fire Ward 11 x 0.175 = 1.9 steps of the back row's defense; Life Leech 20 permille = 2.1 steps of the front's damage taken; Fire Edge +2 on Undead | COMPUTED |

### 11.5 Walk-through: a melee hero's first Brute Edge at Level 60 (real data, grepped on the set)

| # | Step | Holds and can reach, from earlier steps only | Real source | Doable |
|---|---|---|---|---|
| 1 | Hunt Pyre Field | A company at about Level 60 (band 70 to 90) | `pyre_field` pack, open | Yes |
| 2 | Five Pike Ferrules drop | Step 1 | `pike_ferrule` on the Charred Pikeman's row, every 0.22 hunted hours | Yes |
| 3 | Four Grave Dust | Step 1, or Muster Barrows (Cairn Wight, Captain Hask) | `grave_dust` rows on both packs; band 3's Remains face (`STREAM_FACES`) | Yes |
| 4 | Make Brute Edge | Steps 2 and 3, an Artificing hero at rung 1 | `jobRecipes()` `imbuement_brute_edge`: 5 `pike_ferrule`, 4 `grave_dust`, band 3, makes `imbue_brute_edge` | Staged (S-27, dark) |
| 5 | Apply it to the weapon in town | Step 4 and 6,813 gold (D-19) | `hr_imbue_apply`; `hunt_open` while hunting | Staged (S-32, dark); the band fee staged in 1078 |
| 6 | Hunt Muster Barrows | Step 5 | `muster_knight` and `captain_hask` are `role: 'brute'`; `imbueStepsAt(70, 60)` is 2, so the Edge fires at 5 | Yes (lane/imbue-engine) |
| 7 | A better sword drops and goes on | Step 6 | `hero_worn_imbue` is keyed by the slot, so the Edge stays (D-20) | Yes, as built |

## 11.6 I3 read again, and the two rule-row calls (2026-11-28, game designer, `lane/designer-imbue-i3`; CONFLICTS 2026-11-27 imbuements in the fight)

### 11.6.1 How it plays

- A full set of three on the ground it is for makes the four level about 3% faster there (6 pace steps of 0.61%). That is a real reason to pay for them, and a little less than one lucky Signature.
- Every imbuement fades the same way once you outgrow its band. A band 50 Life Leech heals 2% up to Level 50, 1.7% at Level 97 and 1.2% at Level 200. A Fire Edge's 5% fades the same way. The card shows your own number.
- A Fire Edge takes its place in your consumables on every blow, like every other imbuement. Against a monster that is neither weak to Fire nor resists it, it does nothing, and a meal does not fill the gap.

### 11.6.2 Rulings made here

| # | Ruling | Amends | Why |
|---|---|---|---|
| D-21 | **Every imbuement reads its band by the contest curve, the Leech and the conversion too.** With c = `imbueStepsAt(band, Level)` / `imbueSteps`: a Leech heals `leech.pm` x c permille (rounded whole, at least 1), and a conversion's row is its whole steps x c, a gain and a cost alike | D-18 (as built: "neither reads the contest curve"), 11.3 | D-16 already says an imbuement is weaker past its band. Reading the Leech's share as "already reading the hero" made a band 50 Leech a good for life: a Level 200 hero healed the full 2%, so no higher band's Leech would ever be worth its part. A Brute Edge's +2% is a share of the blow too, and it fades. One rule for all five keeps the higher grounds' parts wanted. At Level 97 the band 50 Leech heals 17 permille, and I3 moves 0.1 pace steps (11.6.4) |
| D-22 | **A conversion waits on a blow it does not change.** When the target's Fire percent equals the blow's own, Fire Edge writes the waiting row every conditional row writes (its rated 2 x c of room, `holds: false`) | D-18's "room 2 in the other channels", D-11 | D-11 says "firing or not". With no room taken there, a meal beside a Fire Edge counts on every neutral monster, so the Edge and a meal together beat any other Edge on a mixed ground, and D-1's "three fill the slice" leaks. On a target that resists Fire the Edge already costs. The bestiary page still decides |
| D-23 | **I3 is in band and no number moves.** Brute Edge 5, Fire Ward 11, Life Leech 20 and Fire Edge's 50 stay. I3 is read on 36 seeds at the ground's Level (`run.sh` `KSEEDS`), its se at most 3, and confirmed over the ground's span (Level -3 and +3, 12 seeds each, pooled) | 11.4's I3 row | The 12-seed read was the plain four's draw. Four of its first 12 seeds fell once too often and held 28 to 32 against 44 to 47. Against those 12, each imbuement alone read nearly the whole set (Brute Edge 11.8, Life Leech 11.1, Fire Ward 5.8 pace steps against the set's 12.6), which three sizes adding to one cannot do. Seeds 13 to 36 read 2.8 and 2.9. Cutting the sizes to fit the 12-seed read would have left each imbuement about half its rated 2 steps on every other cell |

Kit-bands-2-3's recipes stay: `imbuement_brute_edge` is 5 `pike_ferrule` and 4 `grave_dust`, `imbuement_fire_edge` 5 `rake_tine` and 4 `grave_dust` (`jobRecipes()`, read on this set). D-16, D-17, D-19 and D-20 are unchanged. D-21 is D-16 applied to the two rules D-18 left out, and D-22 is D-11 applied to the conversion.

### 11.6.3 What is set here and what is owed

| Piece | Where | State |
|---|---|---|
| I3's reading | `tools/balance-program/redesign/imbue/run.sh` (`KSEEDS` 36, the `k-curve` step), `sum.mjs` (the ruled row), the reports `k-plain`, `k-fire`, `k-curve` at 36 seeds | SET, MEASURED |
| The ruled set as a candidate | `tools/balance-program/candidates/im-krell-curve.json`: `im-krell-fire` plus D-21's Leech line, the exact line the engine owes | SET |
| D-21, the Leech on the curve | `src/core/imbue.js leechOf`: `pm` x c, whole, at least 1 | BUILT (lane/imbue-d21-d22, 2026-11-28; tests/imbue.mjs IM-10, amount.mjs leech) |
| D-21, the conversion on the curve, and D-22, its waiting row | `src/core/imbue.js imbueRows`, the convert branch | BUILT (lane/imbue-d21-d22; tests/imbue.mjs IM-9, amount.mjs imbue; a conversion takes no condition, validateImbues) |
| The cards | `{pct}`: a Leech `pm` x c / 10, Fire Edge 5 x c | OWED (the card lane, HANDOFFS item 3). No text moves: every tip already reads `{pct}`, and no card draws an imbuement yet. The numbers are `leechOf(...).pm / 10` and `sharePm / 10` x c |
| No data row, no catalogue | `src/data/imbue-rules.js` unchanged; `node tools/gen-flame-temper.mjs --check` exit 0 | |

### 11.6.4 Readings

All on the tree at `set/v0.2.144` cfbad20fd: v1-climb's `base` cell, the mixed four (hammer, bow, mage, healer), MID kits, Steady, 8 h, paced from hour 4, paired against the same four wearing nothing on the same seeds. A pace step on Krell's Hold is 0.610% of held pace (`15` "Decision: the pace step, ground by ground", `signature-depth/pace-step.mjs`; lane/pace-step-per-ground landed on the set while this lane ran, and every number here is read on it).

| Reading | Held delta (se) | Pace steps (se) | Level XP an hour | Kind |
|---|---|---|---|---|
| Krell's Hold L97, the set as built (`im-krell-fire`), 36 seeds | +2.8 (1.5) | **+6.1 (1.9)** | +2.6% | MEASURED |
| The same as ruled (`im-krell-curve`, the Leech at 17 permille), 36 seeds | +2.4 (1.6) | **+6.0 (2.1)** | +2.1% | MEASURED |
| The 36 in thirds, as built | | seeds 1 to 12 +12.6 (4.0), 13 to 24 +2.8 (2.6), 25 to 36 +2.9 (2.3) | | MEASURED |
| L94 and L100 as ruled, 12 seeds each | | +4.8 (2.1), +3.9 (2.3) | | MEASURED |
| **Pooled over the span (L94, L97, L100: 60 pairs)** | as built +2.4 (1.1), as ruled +2.3 (1.1) | **as built +5.2 (1.5), as ruled +5.3 (1.4): inside 6 ± 2** | | MEASURED |
| Each alone against the first 12 plain seeds (scratch candidates, not kept) | Brute Edge +6.8 (2.3), Fire Ward +3.8 (2.7), Life Leech +7.1 (2.6) | +11.8 (3.6), +5.8 (4.2), +11.1 (3.8) | | MEASURED |
| The plain four's own spread at 12 seeds | L94 41.2, L97 38.6, L100 45.2 held | L97 to L100 +10.5 (4.2), L94 to L97 -3.6 (4.0): three Levels up read as a loss, so 12 seeds cannot place this cell | | MEASURED |
| Muster L60 (`im-muster-fire`), unchanged, on Muster's 0.398 | -3.9 (2.0) | -1.2 (2.0) | +0.7% | MEASURED (lane/imbue-engine) |
| I3's held bar (3.8: 0.4 or more) | passes on every read | | | MEASURED |

What is left: each imbuement's own I1 read (2 ± 1 held on its best cell) wants the same 36 seeds. Against the first 12 the Fire Ward read least, which fits a back-row Ward on a ground where the hammer takes 86% of the damage. Mana Leech's coin bar on the Pyre Field mage (D-18) is still owed.

### 11.6.5 Walk-through: one Life Leech kept from Level 97 to Level 200 (real data, grepped on the set)

| # | Step | Holds and can reach, from earlier steps only | Real source | Doable |
|---|---|---|---|---|
| 1 | Hunt the Slake | A company of about Level 50 (band 50 to 65) | `the_slake` pack, `status: "open"`, band [50, 65] | Yes |
| 2 | Five Mudlark Hooks drop | Step 1 | `mudlark_hook` on the Mudlark's row (Level 52), every 0.45 hunted hours | Yes |
| 3 | Four Bones | Step 1 | `bones` on the Slake's rows; band 2's Remains face is Bones (`STREAM_FACES.remains[2]`) | Yes |
| 4 | Make Life Leech | Steps 2 and 3, an Artificing hero at rung 1 | `jobRecipes()` `imbuement_life_leech`: 5 `mudlark_hook`, 4 `bones`, band 2, makes `imbue_life_leech` (band 50) | Staged (dark) |
| 5 | Apply it to the helmet in town | Step 4 and 6,290 gold | `applyFee(50)` is 6,290 (D-19); `hr_imbue_apply`, `hunt_open` while hunting | Staged (dark) |
| 6 | Hunt Krell's Hold at Level 97 | Step 5 | `imbueStepsAt(50, 97)` / 2 is 0.849, so it heals 17 permille (D-21) and the card reads 1.7% | Yes (lane/imbue-d21-d22) |
| 7 | Reach Level 200 | Step 6 | c is 0.592, so 12 permille, 1.2%. A higher band Leech comes from the Catacombs' Leech Jaw when that ground opens | Yes for the 12 (lane/imbue-d21-d22); `unmarked_catacombs` is `status: 'staged'` |
