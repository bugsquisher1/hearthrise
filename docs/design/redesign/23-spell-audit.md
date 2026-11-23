# 23. The move audit: every move a hero can have, measured

2026-11-22, `lane/spell-audit`, game designer. Docs and Lab tooling only, nothing in `src/` changed. Tyler, 2026-11-22: "Let's have a designer do a spell audit before we get even further into the road and have to rebalance."

**Tags.** MEASURED (real engine, the run named), COMPUTED (arithmetic on named inputs), CODE (read from `src/`), JUDGMENT (a design call). No number here is invented. Where a move wasn't measured, the row says so.

---

## 0. The verdict on one screen

| # | Finding | Tag | What it costs if we build the Roads first |
|---|---|---|---|
| 1 | **The Challenge makes a four hold 63 steps shallower.** Taking it off the tank's bar: held +62.7 ± 3.6, XP a hero-hour +25.3% ± 1.6%. The fall back reads the lowest HP any hero reached in a pull (`danger.js breaksOff`), so a move whose job is to pull every blow onto one hero is punished by the scale. | MEASURED, CODE | Shield's whole country (17 section 5), 7 Shield vows and hybrids, Signatures #1 and #3, the Lone Wall and Frost Warden builds all sit on a move that's worth less than nothing today |
| 2 | **Greater Mend is half the game.** Without it a four holds 207 steps shallower and earns 48% less XP. The next most valuable move is worth 14%. Every borrow, heal rule and healer node is sized around this one move | MEASURED | 17 section 3's heal rule and V4 |
| 3 | **Three moves are worth nothing measurable on the bars players run:** Quarry Blow (added to the hammer: −0.1% XP, it just takes Power Strike's turns), Frost Slam (+1.0% ± 2.1%), Circle of Renewal (−1.7% ± 5.1%, Greater Mend covers for it) | MEASURED | Club's only own road, Frost Slam's road and Circle's road all get 9 nodes each |
| 4 | **Shelter never casts on its own suggested condition.** No monster on Muster Barrows or Hask's Ford casts a spell (their packs carry no `spells`), so "a monster is casting" is never true. 0 casts in 6 × 8 h. Cast with no condition it's worth +6.3 ± 3.9 steps | MEASURED, CODE | Every "enemy winding up / casting" node, vow and Trait (Watchful Healing, Fire Watch, Wind-up Shot, #18, #22, #31) is dead on both scale grounds |
| 5 | **Quarry Blow is Flame Strike with the element removed.** Same share (1400), same floor, cooldown, mana and versions. Club has no move that is its own | CODE | Club's country is a copy of Sword's |
| 6 | **Sword has no move of its own.** Flame Strike and Power Strike are the tank's too, Turning Cut is the club's and the axes'. Its 4 vows are its only identity | CODE | The Sword country owns two roads it shares |
| 7 | **Undertow is dead in a party-first game.** It casts only alone, and the company joins at Level 5. Alone it's worth 7.5% XP to a lone healer | MEASURED, CODE | Undertow's road (9 nodes), Battle Healer vow, Signature #22 |
| 8 | **Too many sources of one effect.** Chill: Frost Slam, Hoarfrost, Cold Hands, Cold Palm, plus 9 branches. Sickness: Green Sickness, Breaking Blow, Lye Hands. One stack a monster, so the second source is dead | CODE | 22's Cold Hands and Lye Hands, 16's Breaking Blow and Chilling Lance |
| 9 | **No move answers the jobs 02 promised.** No interrupt, no move that picks a back-row caster, no guard against a heavy blow, nothing that breaks a monster's shield. 02 gives those jobs to the hammer, the bow and the sword | CODE | Wave 3 adds wind-ups. Every road built before the answering moves gets rebuilt |
| 10 | **Hoarfrost and Protective Ward are the quiet heavyweights.** Hoarfrost: −15.8 held, −10.8% XP. Ward: −16.1 held. Both are worth more depth than Fireball, which 17 prices as the big borrow | MEASURED | 17 section 3's borrow table is missing both |

**The plan in one line:** give the Challenge "my HP is at least 60%" now (measured +39 steps, +15.7% XP) and the tank a lower fall-back line next, rework Quarry Blow into the hammer's interrupt, give the sword a guard and the axes a crowd move, cut Undertow into a shared "alone" rule, trim 22's kit from 9 to 7, and re-run this table before any road is written past the Shield and Restoration sample.

---

## 1. How it was measured

The method is `18-roads-review-measured.md`'s, with one change. Muster Barrows, Level 60, the matrix's MID kits and played bars (`progression-grid.mjs buildCell`), Steady, held start at step 570, one 8 h hunt a seed with the real death rule, **6 seeds a cell, paired** (seed s is the same dice in every cell). Every figure is a mean ± its standard error. "Held" is the Danger step the four holds, time-weighted from hour 1.

**The change: knockouts.** 18 cloned a move onto a party that lacked it. Here a move is valued in the seat and bar it is really played on: the party **without** it against the party with it. A one-line harness seam (`cell.dropSlotsBySeat` in `tools/balance-sim/cell.mjs`) takes the move off that seat's played bar. A move no played bar holds (Frost Slam, Shelter, Quarry Blow) is **added** to its native seat on its own row (`addSlotsBySeat`). No candidate, no clone: the real tree.

**Parties.** M = hammer, bow, mage, healer (the matrix's four). T = tank, axes, bow, healer (22's F1 base). S = sword, bow, mage, healer. H1 = a lone healer.

**What a number means.** A knockout's XP change already includes what depth pays (a shallower hold pays less a kill). Defensive moves show up mostly in held steps, offensive ones mostly in kills. 18's conversion holds: about 0.7% pace a step.

**Runs:** `tools/balance-program/redesign/spells/spell-run.mjs`, plans M, T, T2, S, H1 (`*.txt` and `*.json` beside it). Wall time: 604 + 354 + 123 + 42 s on 8 workers, plus T2 (4 cells, 24 seed runs). 0 deaths in all 222 seed runs except one in the lone healer without Undertow.

---

## 2. Every move, measured

Lane fill is the offense (or support, or heal) lockout over the cooldown, summed over the weapon's moves on that lane (COMPUTED from `ABILITY_LANES` and each row's `cdMs`). Casts an hour are the base cell's. "Party lacks it" is the paired knockout (or the add, marked +).

### 2.1 The 23 live moves, ranked by what the party loses without them

| Rank | Move | Weapon | Lane · cd · cost | Casts/h (max) | Held steps without it | XP/hero-h without it | Other | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Greater Mend | Restoration | Heal · 2 s · 25 mana, Water | 791 (1,800) | **−206.9 ± 4.5** | **−48.3% ± 2.6** | Drinks −254/h | Keep. Re-size (section 6) |
| 2 | Fireball | Destruction | Offense · 8 s · 25, Fire | 320 (450) | −10.1 ± 2.8 | −14.3% ± 1.8 | Drinks −75/h | Keep |
| 3 | Turning Cut | Sword, Axes, Club | Offense · 8 s · 8 | 363 (450) | hammer −9.7 ± 6.0 · sword −8.5 ± 3.5 · axes −1.3 ± 4.8 | hammer −13.4% · sword −12.0% · axes −6.4% | | Keep |
| 4 | Hoarfrost | Destruction | Offense · 10 s · 22, Ice | 230 (360) | **−15.8 ± 2.4** | −10.8% ± 2.6 | Party takes +7,486/h | Keep. It's the mage's real defense |
| 5 | Frost Lance | Destruction | Offense · 6 s · 20, Ice | 456 (600) | −9.7 ± 2.9 | −10.7% ± 2.6 | Drinks −111/h | Keep |
| 6 | Flame Volley | Ranged | Offense · 10 s · 15 + 3 arrows, Fire | 282 (360) | −7.2 ± 5.2 | −10.7% ± 3.1 | Store −431/h | Keep |
| 7 | Power Strike | Shield, Sword, Club | Offense · 6 s · 6 | 437 (600) | hammer −11.5 ± 3.1 · sword −5.4 ± 2.6 · tank +2.7 ± 3.0 | hammer −10.1% · sword −4.1% · tank −2.2% ± 1.6 | | Keep |
| 8 | Rend | Dual Axe | Offense · 6 s · 8, Rupture | 472 (600) | −6.9 ± 4.9 | −9.7% ± 2.3 | | Keep |
| 9 | Raking Shot | Ranged | Offense · 8 s · 10 + 2 arrows | 291 (450) | −6.6 ± 3.8 | −9.4% ± 2.7 | | Keep |
| 10 | Green Sickness | Restoration | Offense · 10 s · 20, Poison | 280 (360) | −8.9 ± 2.2 | −8.6% ± 1.4 | Store −460/h | Keep |
| 11 | Protective Ward | Restoration | Support · 12 s · 25, Earth | 277 (300) | **−16.1 ± 3.9** | −7.0% ± 3.7 | Party takes +20,066/h | Keep |
| 12 | Precision Shot | Ranged | Offense · 6 s · 6 + 1 arrow | 438 (600) | −6.0 ± 5.3 | −6.9% ± 3.9 | | Fix (its target, section 4) |
| 13 | Hunter's Mark | Ranged | Support · 12 s · 8 | 285 (300) | −5.2 ± 1.8 | −6.8% ± 1.7 | | Fix (its target) |
| 14 | Flame Strike | Shield, Sword | Offense · 8 s · 10, Fire | 423 (450) | tank −5.5 ± 5.0 · sword −3.9 ± 3.5 | tank −6.3% ± 2.2 · sword −5.6% ± 2.9 | | Keep |
| 15 | Mend | Every weapon | Heal · 6 s · 15 | 18 to 33 a seat | M −12.6 ± 6.0 · T −3.9 ± 3.0 | M −5.8% ± 4.8 · T −2.4% ± 1.4 | Measured off every seat at once | Keep |
| 16 | Spring Tide | Restoration | Heal · 60 s · 120, Water | 36 (60) | −11.3 ± 5.3 | −5.6% ± 4.3 | | Keep |
| 17 | Arcane Barrier | Destruction | Support · 20 s · 30, Earth | 12 (180) | −6.7 ± 4.1 | −3.6% ± 3.9 | | Keep. Small |
| 18 | Shelter (+, no condition) | Shield | Support · 30 s · 25, Earth | 111 (120) | +6.3 ± 3.9 | +2.2% ± 1.8 | Party takes −10,870/h | Fix the trigger |
| 18b | Shelter (+, its suggested condition) | | | **0** | 0 | 0 | | Dead today |
| 19 | Circle of Renewal | Restoration | Heal · 12 s · 50, Water | 172 (300) | −8.2 ± 6.8 | −1.7% ± 5.1 | Store −287/h | Merge into a branch, or re-size |
| 20 | Frost Slam (+) | Shield | Support · 6 s · 6, Ice | 401 (600) | +4.3 ± 4.7 | +1.0% ± 2.1 | Party takes −14,431/h, and the healer heals 13% less | Fix or merge |
| 21 | Quarry Blow (+) | Club | Offense · 8 s · 10, Earth | 407 (450) | −6.4 ± 3.3 | −0.1% ± 3.3 | Takes 46 Power Strikes an hour | Rework |
| 22 | Undertow | Restoration | Offense · 20 s · 15, Water, alone only | party **0** · alone 177 | alone +4.1 ± 16 | alone −7.5% ± 2.5 | | Cut into a rule |
| 23 | Challenge | Shield | Support · 8 s · free | 325 (450) | **+62.7 ± 3.6** | **+25.3% ± 1.6** | Store +1,003/h, drinks +187/h, party takes +83,054/h | Fix (section 3) |

What the casts say (MEASURED):
- **Almost every move fires near its cap** where the fight lets it. The offense lanes aren't the limit. The fight is: casts happen only while a monster is engaged.
- **Arcane Barrier fires 12 times an hour** on a 20 s cooldown. The mage in the back row is rarely hit on Muster. Its value is real but small, as the table shows.
- **Spring Tide fires 36 an hour in the matrix four and 13 in the tank's four**, on a 60 s cooldown. Its rule (party under 85%, the fight on, mana 30%+ on the played bar) works.
- **Precision Shot loses half its casts to the area shots** and picks them back up when one is taken off (438 → 494 to 511). Same for Power Strike under Turning Cut (437 → 557). The bars are full enough that a cut move is partly replaced by the move after it.

### 2.2 The switched-off moves

Not re-measured here. What exists:

| Move | What it is (CODE) | Measured before | Verdict |
|---|---|---|---|
| **Brand** | Sword and Shield (party only on the tank), Storm, a hit, 4 mana back on a kill. Stands in for Flame Strike or Power Strike (`replaces`) | `elements-6b-table.mjs`, 6 seeds × 2 h, a lone sword: −1.3 to −1.5% in Flame Strike's place, +4.2 to +8.8% after it (cited in `abilities.js`) | Hold. When it goes live, make it **Sword only** so the sword has a move of its own |
| **Reave** | Same seats, Necrotic, a hit, 30% of damage back as health | With Brand, +1.0 to +8.8% by bar order (same source) | Hold. Sword only. It's the only melee lifesteal, a real gap (section 5) |
| **Updraft** | Wand, Storm, Fireball's 3×3 under its damage, 3 mana back a monster | Not measured | **Cut.** A fourth 3×3 area on the wand. Its mana-back is Banked Fire's job in 22 |
| **Blight** | Wand, Necrotic, a 3×3, Withered (a monster heals half) | Not measured | **Hold until a Warder exists.** Withered is the only answer to a monster that heals. With no Warder body it does nothing |
| **The old fist strikes** (Fire, Ice, Poison Hands and Palm) | Six rows, a hit with an element of choice | Lone only, `fist-table.mjs` | **Replaced** by 22's kit. Retire the rows when 22 lands |

### 2.3 The Wraps kit (22), judged on the code and this table

Not measurable yet (the rows aren't planted). JUDGMENT on CODE and the measured neighbours:

| Move | Job | Overlap | Verdict |
|---|---|---|---|
| Coal Hands | Armor Break on the target | New key. Nothing else breaks armor | **Keep** |
| Coal Palm | Armor Break round the target | Same key, area | **Keep** |
| Cold Hands | Chill | Chill is one stack a monster. The tank's Frost Slam and the mage's Hoarfrost already hold it. 22 itself says "skips a target the tank's Frost Slam already holds" | **Cut.** Fold its Chill into Cold Palm |
| Cold Palm | Silenced 3 s, Chill, and it ends a wind-up | The only interrupt in the game, which 02 gives to the hammer | **Fix:** keep Silenced and Chill, give the interrupt to Quarry Blow (section 4). Cold Palm stops a caster *starting*. Quarry Blow stops one *finishing*. Two answers, two moments |
| Lye Hands | Sickness, +10% damage taken | Green Sickness holds it on every pull a healer is in (280 casts an hour, an area). One Sickness a monster | **Cut.** In every party with a healer it waits |
| Lye Palm | Weakened, −8% damage dealt | New key | **Keep, rename "Lye"** (one Lye move now) |
| Open Fire | Party aura +4% damage | New key | **Keep** |
| Banked Fire | Party aura +25% mana regeneration | New key | **Keep** |
| Warm Stone | A shell on the lowest ally | Protective Ward does exactly this (lowest wounded ally, skips a shielded one), and the shield rule keeps only the bigger | **Fix:** shell the hero a monster's wind-up is marked on (the "guard" answer). Ward stays "lowest" |

Four strikes then fill the offense lane 0.95 (Coal Hands 6 s, Lye 8 s, Coal Palm 10 s, Cold Palm 12 s: COMPUTED). All four fit, so no strike sits unused and nobody swaps strikes per ground. The choice moves to the fire and the roads.

### 2.4 Mend

Measured off every seat at once: −12.6 ± 6.0 held, −5.8% ± 4.8 XP in the matrix four, −3.9 ± 3.0 and −2.4% ± 1.4 in the tank's four. It casts 18 to 33 an hour a seat. **Keep.** It's the floor that makes the 25% fall-back line rarely a surprise. Its suggested "my HP under 50%" sits 5 points over Careful's fall line (45%, `RISKS.careful.fallPm`) and 25 over Steady's, so it fires before the fall back on both (CODE).

---

## 3. The Challenge problem

**What happens (MEASURED, plans T and T2).** In the tank's four the tank takes every blow the Challenge pulls. The fall back reads the lowest HP **any** hero reached in the pull (CODE, `src/core/hunt/danger.js` `breaksOff`, `world.low`), and a climb needs a clean pull (Steady: no hero under 45%). So the tank dipping is what stops the four. Without the Challenge, the Pikeman swarm spreads over the two front heroes (`spread` reach), nobody dips as far, and the four climbs.

| Cell (T = tank, axes, bow, healer) | Held | XP / hero-h | Party takes / h | Store / hero-h |
|---|---|---|---|---|
| T, Challenge first on the bar | 553.8 ± 3.7 | 157,470 | base | 3,463 |
| T, no Challenge | **616.4 ± 1.7** (+62.7) | +25.3% | +83,054 | +1,003 |
| T, Challenge only while the tank is at 60%+ (322 casts/h) | **592.9 ± 2.7** (+39.1 ± 4.3) | +15.7% ± 1.8 | +21,677 | **+168** |
| T, Challenge only while the healer is hit | 615.7 ± 1.7 (+61.9). It cast 0.2 times an hour: the healer is almost never hit, so this is "no Challenge" | +24.8% | +82,710 | +1,001 |
| M (no tank at all, a hammer in front) | 621.3 ± 3.4 | 280,176 | | 5,060 |

The cost is real too: without the Challenge the four takes 83,000 more damage an hour and buys 1,003 more gold of supplies a head. It goes deeper because it spreads the hurt, and pays for it in drinks.

**Why it matters for the Roads.** Shield is the first country in the sample (17 section 12). Its first road is the Challenge's. Hard Challenge, Wide Challenge, Guarding Challenge, Mended, Drawing and Echoing Challenge, Hold Fast, Bodyguard, the Shield · Restoration and Sword · Shield hybrids, Signatures #1 Bannerman's Pavise and #3 Grave Guard's Mail, and 22's Hearth Guard all make the Challenge stronger. Today that makes the four shallower.

**The fix (JUDGMENT, my call, for the Lab to measure next):**

1. **The fall back reads the tank against a lower line.** A hero holding a Challenge counts against `fallPm × 0.6` (Steady 15%, Careful 27%) and a climb against `cleanPm × 0.6`. A tank is meant to sit low and be healed. One lever row in `danger.js` `RISKS` (`holderLinePm` 600), read in `breaksOff` and the clean check. Steady still never dies (the line is a fall back, not a death), which V1 checks.
2. **The Challenge's suggested condition becomes "my HP is at least 60%"** (`trigger` on the row), now, before (1). MEASURED in T2: it keeps 62% of the no-Challenge depth (+39.1 of +62.7 steps) and 62% of its XP (+15.7% of +25.3%) for a sixth of its supply bill (+168 gold a head an hour against +1,003). The tank still taunts 322 times an hour, it just stops when it's the one about to break the pull. It's also the better play to teach: "taunt while you can take it".
3. **Wide Challenge is a downgrade of the base move.** The Challenge already takes every monster within 6 tiles that isn't on the tank (`CHALLENGE.radius` 6, `targeting.js challengeable`). "Taunts up to 3 nearby enemies" caps it lower. Rewrite it as **Long Hold**: taunt holds 12 s (from 8 s) · +4 s cooldown.

---

## 4. Weapon identity

02 promised a job for each weapon: hold the front (sword and shield), break a wind-up or a shield (hammer), cut a crowd (axe), pick a target in the back row (bow), burst an area (wand), mend and shield (staff). 22 adds the support.

| Weapon | Own moves today (CODE) | Shared | Offense lane fill | Job 02 gave it | Has a move for it? | Recommendation |
|---|---|---|---|---|---|---|
| **Shield** | Challenge, Frost Slam, Shelter | Flame Strike, Power Strike | 0.58 offense, 0.65 support | Hold the front | Yes, and it's punished (section 3) | Fix the Challenge. Shelter's trigger to "2+ allies under 80%" until Casters exist. Frost Slam: see below |
| **Sword** | **None** | Flame Strike, Power Strike, Turning Cut | 0.83 | (unnamed: the duelist, by its vows) | No | **Add Parry** (wave 3): support lane, 10 s, your target's next blow in 2 s lands 0. Suggested condition: "my target is winding up a blow". It's the "guard" answer 02 names, and the block 17 holds Riposte and Answering for. Brand and Reave become Sword only when live |
| **Club** | Quarry Blow (a copy of Flame Strike) | Power Strike, Turning Cut | 0.83 with Quarry Blow | Break a wind-up or a shield | No | **Rework Quarry Blow into Stagger**: a hit at 60% of today's share that ends the target's wind-up (spell or blow) and pushes its next swing back 1 s. 10 s cooldown. Suggested condition: "my target is winding up". Keeps its Earth rune. Lane 0.78 |
| **Dual Axe** | Rend | Turning Cut | 0.58 | Cut a crowd | Only through Turning Cut, which two others share | **Add Gash** (wave 3): offense, 8 s, 10 mana, Rupture rune, every monster beside you takes a light hit (40% share) and 1 Bleed stack. Lane 0.83. Then Bleeding Turn (16, 17) is redundant: cut it |
| **Ranged** | Hunter's Mark, Flame Volley, Precision Shot, Raking Shot | none | 0.78 | Pick a target in the back row | No. Precision Shot shoots the bow's own target | **Fix Precision Shot's target:** a Shooter, Caster or Stalker in range first, else your target (a new target rule `back_threat`). **Fix Hunter's Mark's target:** your own target, not the healthiest monster in reach (`abilities.js targetFor` `mark` sorts by HP today, so it often marks a monster nobody is hitting yet) |
| **Destruction** | Fireball, Frost Lance, Hoarfrost, Arcane Barrier | none | 0.78 | Burst an area | Yes | Keep all four. Cut Updraft. Hold Blight for Warders |
| **Restoration** | Greater Mend, Circle of Renewal, Spring Tide, Green Sickness, Protective Ward, Undertow | none | heal 0.77 | Mend and shield | Yes | Cut Undertow into the shared alone rule (below). Re-size Greater Mend (section 6). Circle: see below |
| **Wraps** (22) | 9 moves | Mend | 1.08 with four strikes as written | Make the other three better | Yes | Trim to 7 (section 2.3) |

**Frost Slam (+1.0% ± 2.1%).** Its Chill lands, the party takes 14,431 less an hour, and the healer heals 13% less as a result. That's real safety bought with nothing held, because the tank's dip, not the damage total, sets the fall back (section 3). Keep it. Re-measure after the holder line lands. If it's still under +4 steps, merge it into the Challenge as a crossroads option ("Cold Challenge: taunted enemies are Chilled 4 s") and give the Shield road slot to Parry's support-lane cousin.

**Circle of Renewal (−1.7% ± 5.1%, −8.2 ± 6.8 held).** Greater Mend takes up its casts (790 → 870 an hour). It isn't dead, but it's small next to Spring Tide (−11.3 held) for a third of the casts. Keep it as the healer's cheap steady top-up. Its value should be read again in a party with two hurt heroes (Casters' splash, `monster-roles.js` caster `splash`), which Muster doesn't have.

**The alone rule.** Undertow casts only alone (`alone: true`) and every hero has a company from Level 5 (`recruits.js atLevel`). 22 already invents "strikes deal double damage while you hunt alone" for the wraps. Make that **one row field on any weapon's strikes** (`aloneHitPm` 2000) and give it to Green Sickness. Undertow's 7.5% for a lone healer comes back through Green Sickness. One rule, read the same everywhere, and the healer's road loses a move nobody in a party ever sees.

---

## 5. Gaps

| Gap | Today (CODE) | Who should own it | Wave |
|---|---|---|---|
| **No interrupt** | None live. 22's Cold Palm is the first | Club (Stagger), with Cold Palm's Silenced as the "before" answer | 3 |
| **No move picks the back row** | Every strike shoots the hero's own target | Ranged (Precision Shot's target) | 3 |
| **No guard against one heavy blow** | Shields only absorb, none is timed to a blow | Sword (Parry), Wraps (Warm Stone on the marked hero) | 3 |
| **Nothing breaks a monster's shield, nothing stops a monster heal** | Warder has a role row and no body (`monster-roles.js` warder) | Wraps' Armor Break covers armor. Blight covers heals when Warders arrive | 3, with the Warder body |
| **No lifesteal for melee damage** | Mend only. Reave is switched off | Sword (Reave) | when Necrotic goes live |
| **No single-target damage for the healer in a party** | By design (Undertow is alone only) | Keep it so. The healer's offense is Green Sickness | |
| **No AoE for the tank** | Frost Slam is a status ring, no damage | Keep it so. The tank's job is holding | |
| **Monsters that cast on the scale grounds** | Muster Barrows and Hask's Ford carry no `spells` | C2 (Caster and Warder bodies). Until then every "casting" node is dead there | 3 |

**Lane fill.** No lane is over 1.0 on a live weapon (COMPUTED above). Sword and Club sit at 0.83, so 17's "no cooldown cut over 75%" rule stands. 22's four-strike wraps at 1.08 is the only overfull bar, which the trim fixes (0.95). Axes at 0.58 is the emptiest, which Gash fills.

---

## 6. The rune spell rule

**Families (CODE, `runes.js`, `abilities.js`).**

| Family | Live spells | 22 adds | Planned |
|---|---|---|---|
| Fire | Flame Strike, Flame Volley, Fireball | Coal Palm | |
| Ice | Frost Slam, Frost Lance, Hoarfrost | Cold Palm | |
| Earth | Shelter, Quarry Blow, Arcane Barrier, Protective Ward | | |
| Water | Greater Mend, Circle of Renewal, Spring Tide, Undertow | | |
| Poison | Green Sickness | Lye Palm | |
| Rupture | Rend | | Gash |
| Storm (hidden) | none | | Brand, Updraft |
| Bone (absent) | none | | Reave, Blight |

- **The rule itself holds up.** Every cast is a share of the caster's own blow, so nothing stops growing at skill 60 and a rune's tier is a flat +10% a step. That's simple enough to read on a tooltip.
- **Earth does two unrelated jobs.** Three shells and one hammer hit. With Quarry Blow as Stagger it stays Earth (the stone the hammer drives), and "Earth = shells and stone" reads fine. No change.
- **Poison and Rupture have one spell each.** A Runecrafter's Poison rune has one buyer (the healer) until 22 ships. Gash gives Rupture a second. Fine as is, watch the market.
- **Greater Mend is too good for any rule to price.** 207 steps from one move. Its share is fitted so it lands "today's Level 60 worth" (`abilities.js` header). Two things follow. (a) The borrow table can't treat it like other moves (17 already doesn't). (b) Every healer node that adds healing multiplies the biggest number in the game. Re-size: Greater Mend heals 20% less (`healPm` 3170 → 2540) and Circle of Renewal 30% more (1600 → 2080), so the healer's output moves from one button toward two. This is a Lab variant, not a ruling: measure it on M and T before the Restoration roads are written.
- **Statuses don't follow the rule, on purpose.** Chill grows with the rune tier, Sickness and the Mark are fixed (Bible §17). Keep.

---

## 7. Recommendations, every move

| Move | Call | Exact change |
|---|---|---|
| Challenge | **Fix** | Now: `trigger` "my HP is at least 60%" (T2: +39.1 held, +15.7% XP, +168 store). Then the holder line `fallPm × 0.6` in `danger.js` (Systems). Wide Challenge → Long Hold. `party: true` so the bar says "Party only" (solo it never fires: `challengeable` needs a monster off the tank) |
| Frost Slam | **Keep, re-measure** | After the holder line. Under +4 steps: merge into Challenge as "Cold Challenge" |
| Shelter | **Fix** | Suggested condition: "the party has at least 2 heroes under 80%" until a Caster body exists, then the cast warning |
| Flame Strike | Keep | |
| Power Strike | Keep | Worth 2.2% on the tank, 10% on the hammer. Fine as the free strike |
| Turning Cut | Keep | |
| Rend | Keep | |
| Quarry Blow | **Rework** | Becomes Stagger: `hitPm` 840, `cdMs` 10000, ends the target's wind-up, +1 s on its next swing. Suggested condition: target winding up |
| Hunter's Mark | **Fix** | Target: the hero's own target if unmarked, else the healthiest in reach |
| Flame Volley | Keep | |
| Precision Shot | **Fix** | Target: a Shooter, Caster or Stalker in range first |
| Raking Shot | Keep | Worth 9.4%. Not a duplicate of Flame Volley: no element, a line |
| Fireball | Keep | |
| Frost Lance | Keep | |
| Hoarfrost | Keep | Add it to 17's borrow table: measured −15.8 held, a borrow over 10 steps |
| Arcane Barrier | Keep | |
| Greater Mend | **Fix (Lab)** | `healPm` 2540, Circle 2080, measured on M and T |
| Circle of Renewal | **Fix (Lab)** | As above |
| Spring Tide | Keep | |
| Green Sickness | Keep | Gains the alone rule |
| Protective Ward | Keep | Add to 17's borrow table: −16.1 held |
| Undertow | **Cut** | Into `aloneHitPm` on Green Sickness |
| Mend | Keep | |
| Brand | Hold | Sword only when live |
| Reave | Hold | Sword only when live |
| Updraft | **Cut** | |
| Blight | Hold | Until a Warder body |
| Fist strikes (6 rows) | Retire | When 22 lands |
| Coal Hands, Coal Palm | Keep | |
| Cold Hands | **Cut** | Chill folds into Cold Palm |
| Cold Palm | **Fix** | Silenced + Chill, no interrupt |
| Lye Hands | **Cut** | |
| Lye Palm | Keep | Rename **Lye** |
| Open Fire, Banked Fire | Keep | |
| Warm Stone | **Fix** | Shells the hero a wind-up is marked on |
| **Parry** (new) | **Add** | Sword, support, 10 s, 10 mana, your target's next blow within 2 s lands 0. Needs blow wind-ups |
| **Gash** (new) | **Add** | Dual Axe, offense, 8 s, 10 mana, Rupture rune, ring, `hitPm` 400, 1 Bleed each |

**What wave 3 must add (engine, Systems):** wind-ups on monster blows (02), the `winding_up` target condition, an "end the wind-up" effect (Stagger), Silenced (22's E2), the `back_threat` and `marked` target rules, the holder fall line, `aloneHitPm`. Names checked against `src/data` and `docs/design/redesign`: Parry, Gash and Long Hold are unused. Stagger is unused as a move (CO-10's "no stagger" was a current-game rule, and 02 asks for one). "Hew" was rejected: it's a recruit's name (`recruits.js`).

---

## 8. Knock-ons to 14 to 17, 19 and 22

| Change | 14 Traits | 15 Signatures | 16 / 17 Roads | 19 Ledger | 22 Support |
|---|---|---|---|---|---|
| Challenge fixed, holder line | None | #1, #3 re-measured after | Shield roads re-measured. Wide Challenge → Long Hold (16, 17 section 5). Hold Fast, Bodyguard, Last Stand unchanged in words | New lever row `holderLinePm`, Lab V1 re-run on T | Hearth Guard vow re-measured |
| Shelter's trigger | Crag Shelter (#29 Trait) unchanged | #3 unchanged | Ready Shelter fine. 17 section 13's walk-through unchanged | | |
| Quarry Blow → Stagger | Club Traits none | **#5 Pikeman's Gauntlets** ("Flame Strike or Quarry Blow: Power Strike ready") → Flame Strike only. **#8 Stable Troll's Maul** ("shield of 50% of its damage") → "Stagger: a shield of 10% of your max health for each wind-up it ends" | Quarry road rewritten: Breaking Blow, Rockfall, Cold Stone, Heavy Quarry, Long Sickness, Cold Quarry go. New crossroads keyed to wind-ups ended. Aftershock vow → "Stagger also hits monsters beside the target". **Smith's Arm, Tempered Strikes, Heavy Bleed, Butcher, Crush and Bleed build** rewritten. Armor Breaker build loses Breaking Blow (Sickness from Green Sickness or the Lye move instead) | | Coal Hands keeps Armor Break. The club's "−5% enemy armor" waystone stays on the Armor Break key |
| Sword gets Parry | none | none | Sword country gets a third road. **Riposte** and **Answering** (17, held "until a block exists") come back as Parry's crossroads | Parry's node sizes on the build slice | |
| Axes get Gash | **#4 Worrier** (bleeding targets) fires more | #29 Fledgling Claw (Bleed cap) applies to Gash too | Axe country gets a second road. **Bleeding Turn** (Turning Cut, 16 and 17) cut. Spread, Clean Cuts unchanged | Axe country 15 → 24 points | Coal Palm's Open Cracks branch (+20% Bleed) gains |
| Undertow cut | none | **#22 Slake Waders** (Undertow vs Sick) → "Green Sickness alone: +40% damage to a Sick target" or swap the Signature | Undertow's road (6 options, 2 waystones) cut. **Battle Healer** vow → "Green Sickness +20% damage · −3% healing". Restoration country 58 → 49 points | | |
| Precision Shot and Mark targets | none | **#9 Lurcher's Collar** fine. #11 fine | **Aimed Shot** (16) now works with `target_marked`, since the Mark sits on the bow's own target. **Wind-up Shot** dead until Casters | | |
| Greater Mend re-size | none | #17 Bargeman's Pole re-measured | Every Greater Mend node's numbers follow | Borrowed Greater Mend's V0 re-measured (V4) | Wound Dresser vow re-measured |
| Updraft cut | none | **#30 Raft Builder's Earrings** (Storm mana back) has only Brand left: re-home or cut | | | Banked Fire is the mana job |
| Wraps trimmed to 7 | #25 Numbed, #5 Snuffed lose Cold Hands as a source (Frost Slam and Hoarfrost remain) | Lye Pouch → "Lye: a Weakened enemy dies: every ally gets 3% mana back" | Hearth: Cold road holds Cold Palm only, Lye road Lye only. 50 → 48 points | Sickness key loses Lye Hands | Section 2.2's table: 7 rows. 4.2's stacking table: Lye Hands out of Sickness. Walk-through step 4 (Cold Hands at Melee 5) moves to step 8 |
| Hoarfrost, Ward on the borrow table | | | 17 section 3: Hoarfrost V0 15.8, Ward V0 16.1, both "−50% at a border, not offered at Havora" | Opens at `max(20, 200 × V ÷ 14)` | |
| Every "casting" condition | **#18 Floodmark, #22 Slate Hand, #31 Dunn's Warning** and the two "casting" Traits: dead on Muster and Hask's Ford until C2 | | Watchful Healing, Fire Watch, Wind-up Shot, Slowing Frost: same | | Cold Palm: same |

---

## 9. Order (by player impact and rework avoided)

| # | Lane | Why first |
|---|---|---|
| 1 | **Holder fall line + Challenge condition** (Systems, data + engine) | Shield is in the Roads sample. Building Shield's country on a move worth −63 steps is the biggest rework risk in the plan |
| 2 | **Greater Mend and Circle re-size** (Lab variant, then data) | Restoration is the other half of the sample, and V4 hangs on it |
| 3 | **Shelter's suggested condition** (data, one row) | Free, and Shelter is in the sample |
| 4 | **Undertow → alone rule** (data + small engine) | Shared with 22's wraps, one field. Cuts a road before it's written |
| 5 | **Mark and Precision Shot targets** (engine, small) | Fixes two Ranged moves the bow plays all day |
| 6 | **22 trimmed to 7** (doc) | Before L13 and R-X3 start |
| 7 | **Wave 3 answers: Stagger, Parry, Gash, Silenced, blow wind-ups** (Systems, then data) | They need wind-ups. Sword, Club and Axe countries (R-X1) wait on them, so write those last |
| 8 | **Re-run this table** (`spell-run.mjs --plan M`, `T`, `S`) after 1 to 3 | The ranking moves when the Challenge does |

---

## 10. Decisions for Tyler

Only two calls change direction. Everything else in this doc is the designer's and goes ahead.

1. **Necrotic and Storm, "a spell for both on each weapon type" (2026-11-18).** This audit cuts Updraft (a fourth wand area that does what Banked Fire does) and holds Blight until a Warder exists. The wand would then have no Storm spell. **Recommend: yes, cut it.** One fewer move with no job beats a full grid.
2. **The tank sits lower than everyone else.** The fix in section 3 lets the hero holding the Challenge drop to 15% on Steady before the four falls back, where everyone else falls back at 25%. Steady still never dies. It changes what "Steady" means for one seat. **Recommend: yes.** The other way out is a game where nobody taunts on the scale, and the Shield country loses its first road.

---

## 11. Walk-through check (every name grepped)

Not a play sequence, so no step table. Every move, status, metric and file named above was read on `origin/set/v0.2.144` in this lane: `abilities.js` (all 23 rows and the switched-off four), `runes.js`, `necrotic-storm.js`, `fists.js`, `statuses.js`, `condition-metrics.js` (the 4 Roads tests), `danger.js` (`RISKS`, `breaksOff`), `hunt-roles.js` (`CHALLENGE` radius 6, hold 8 s), `targeting.js` (`challengeable`), `src/core/hunt/abilities.js` (`targetFor`, `firstUsable`), `monster-roles.js`, `recruits.js`, `rule-subjects.js` (`ROLE_RULES`), `played.mjs` (the bars measured), the Muster Barrows and Hask's Ford packs (no `spells`). New names checked unused: Parry, Gash, Long Hold, Stagger (as a move), Lye (only in 22).

## 12. Files

`tools/balance-program/redesign/spells/spell-run.mjs` (the cells: plans M, T, T2, S, H1), each plan's `.txt` and `.json`. `tools/balance-sim/cell.mjs`: the `dropSlotsBySeat` seam (an optional cell field, no default changes).
