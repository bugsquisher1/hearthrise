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
- **On the piece.** It travels with the piece between own heroes. Listing the piece removes it (`13-market` 2.3).
- **Size.** Each imbuement is sized to `imbueSteps` 2 steps on the ground and seat it suits best (`best`, as Traits are, `04` guard 1), times `ramp` of the hero's Level. The card shows the hero's own number. So the shown percent is 2 steps divided by the share of the fight its condition touches on that cell: a Ward against an element that is a tenth of the damage taken shows about 8%.
- **Conditional by construction.** Its "when" is a role, an element or a status, never a monster family (D-8), and never `in_fight`. Its average over every ground is at most half its best case (`traitAverageSharePm` 500).
- **No stacking.** One of each kind counts, and an imbuement never stacks with a Trait of the same key (the rule table's keys).
- **Band.** An imbuement carries the band of its rare part. On a hero above it, it is weaker by the contest curve (`09` 4.2). Held to at most `wearAhead` above.
- **Life.** Plain 20 hunted hours, Fine 25, Master 30 (`imbueLifeRung` 0.25, D-7). The timer counts hunted time while worn, in the settle.
- **Recipe.** `imbueParts` of its one named rare part, plus `imbueRemains` Remains of the part's band, plus `imbueWork` work-hours at the Artificing bench (`09` 4.3: the imbuement line is 0.1 of a kit-hour, so 0.08 work-hours a hunted hour for three, 0.53 work-hours each for 20 hours). The made imbuement is a stack keyed by kind, band and quality, and trades on the book.
- **Apply fee.** `imbueFeeHours` of wage at the piece's item step, times `ramp`, burned when applied (the price falls with the effect early on, so a Level 60 hero pays 30% of it).

**What a hero pays** (COMPUTED at full ramp): goods worth about 0.13 hours of wage plus a 0.4 fee, 0.53 an imbuement for 20 hours, 0.08 hours of wage a hunted hour for all three, about 8% of gross coin. For that, up to 6 steps on the right ground, about 4% pace, and about 2.4% more coin from depth. So imbuements are an XP choice that costs gold: "levels or gold tonight" (`02` package 5).

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
| Fire Ward | `−8% Fire damage taken · 20 hunted hours` | Body | Fire Gland (Wyvern Roost) | Krell's Hold, front hero | Hot Pitch, Rake the Coals and Hall Fire are Fire. Worth nothing on Muster, where nothing casts |
| Fire Edge | `5% of damage dealt as Fire · 20 hunted hours` | Weapon | Coal Tongs (Carter's Rest) | Ox Road, any damage seat | Undead take 15% more Fire. Against a target that resists Fire it costs damage, so the bestiary page decides |
| Brute Edge | `+3% damage vs Brutes · 20 hunted hours` | Weapon | Pike Ferrule (Pyre Field) | Muster Barrows, melee | Barrow Knight and Captain Hask are brutes. Off against the Pikeman swarm, most of a pull |
| Life Leech | `Life Leech 1% · 20 hunted hours` | Helmet | Leech Jaw (Unmarked Catacombs) | Wyvern Roost, melee front | Long fights against big bodies. Fewer meals between pulls |
| Mana Leech | `Mana Leech 1% · 20 hunted hours` | Helmet | Urn Shard (Muster Barrows) | Pyre Field, mage | A caster's drinks bill. Useless to a healer, who deals little damage |

Every part comes from a different ground than its best one, so every imbuement makes a trade between two grounds (`02` package 5). Fire Edge and Brute Edge share the Edge slot, so a melee hero on Muster chooses between them by the pull. The shares behind the sizes (Fire as a tenth of a front hero's damage taken on Krell's Hold, brutes as a quarter of a pull's health on Muster) are ASSUMED until I1.

### 3.4 Data shape

| Where | Shape |
|---|---|
| `src/data/imbue-rules.js` (new, replaces `imbuements.js`) | One row an imbuement: `id`, `name`, `kind` (`edge`, `ward`, `leech`), `slot` (from `kind`), `raises` (offense, defense, heal, mana), `when` (a condition row, `condition-metrics.js` shape), `element` or `convert` where it applies, `key` (the rule table's stacking key), `part` (an item id), `best` (seat, ground), `tip` with `{pct}`. Levers `IMBUE` above |
| Items | The made imbuement: a stack keyed (kind, band, quality), one item row an imbuement id. The rare parts keep their pack rows; their old `imbue.kind` field retires |
| Piece | `imbue_id`, `imbue_band`, `imbue_ms_left` on the piece row (a plain piece is a stack today, so a plain worn piece needs a worn-slot row: `hero_worn_imbue (user_id, slot, equip_slot, imbue_id, band, ms_left)`, moved with the piece) |

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
| Gear slot | A small mark on the slot. Tooltip `Fire Ward · −8% Fire damage taken · 14 h left` |
| Artificing, Imbue tab | `Fire Ward · Band 120` · `Needs: 5 Fire Gland · 4 Remains · 0.5 work-hours` · button `Make` |
| Apply | `Body: Fire Ward · 20 h` · `Replaces: Fire Ward · 3 h left` · `Fee: 6,200 gold` · button `Imbue` |
| Plan | `Krell's Hold · Body: Fire Ward · Keep imbued` |
| Return card | `Imbued 2 pieces · 1 ran out (no stock)` |
| Hunt card | `Fire on this ground` beside the bestiary's spells, so the reason to pick a Ward is on the screen |

### 3.7 The power ledger

Consumable slice, 6 (`19` row 10, D-1): three imbuements at 2 each fill it, all times `ramp`, the slice cap times `ramp`. A draught (3) or a camp pot (2) is chosen in place of an imbuement. At Level 60 the whole slice is 1.8 steps. The choice ceiling of `19` (best saved build against the suggested path, 5 to 10%) compares builds at the same kit, so imbuements sit outside it by construction. They sit inside the gold ceiling (Temper + consumables + bought Traits, under two tiers).

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
