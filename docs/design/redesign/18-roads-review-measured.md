# 18. The Roads review, measured: borrowed moves on the real engine

Measurements for Tyler's review of `17-talent-tree.md` (brief section 4: evaluate the numbers, don't accept them; section 6: can a build preview be backed by the engine). Lab tooling only, nothing in `src/` changed.

**How every number was made.** Muster Barrows, Level 60, the matrix's MID kits and played bars (`progression-grid.mjs buildCell`), Steady, a held start at step 570 (refStep 590 less the 20-step start margin), one 8 h hunt a seed with the real death rule, 8 seeds a cell. Seeds are paired: seed s uses the same dice in every cell, and the base cell reproduced to the digit in two separate runs (held 607.2 both times). Every figure is the mean ± its standard error over the 8 seeds. Paired deltas are against the cell's own base, seed by seed. "Held" is the Danger step the four holds, time-weighted from hour 1 to the end of the pull where the first hero died. Gold is coin plus loot at the store's price per hunted hero-hour. "Store" is the supply bill per hero-hour.

**How borrowing was faked.** It isn't in the engine. `tools/balance-program/redesign/roads/make-lend.mjs` writes a Lab candidate (`roads-lend.json`) that runs on a scratch copy. A borrowed move is a clone of the native row put on the borrower's discipline, with every number it lands times the power (hitPm, healPm, shieldPm, the beginner floor, a mark's bonus, a taunt's hold). Mana, cooldown, lane, rune and area are unchanged. The clone reads the borrower's weapon skill and blow, which is 17's proposal. One slot goes onto one seat's played bar (`cell.mjs addSlotsBySeat`, a one-line harness seam). `check-lend.mjs` proves the plant (exit 0).

**Bases.** M = hammer, bow, mage, healer (the mixed four). N = hammer, bow, mage, sword (no healer). S = sword, bow, mage, healer. NM = no mage (hammer, bow, sword, healer). NB = no bow (hammer, sword, mage, healer).

## 1. Is a borrowed Greater Mend or Shelter at −30% still useful?

Yes, and the Greater Mend is far more useful than the doc intends.

| Cell (M, a borrow added) | Held vs M (steps) | XP / hero-h vs M | Gold / hero-h vs M | Store / hero-h vs M | Drinks / h vs M | Healing / h vs M (all seats) | Borrowed casts / h · mana / h | Deaths |
|---|---|---|---|---|---|---|---|---|
| M, no borrow | 607.2 ± 3.0 (base) | 255,273 ± 5,090 | 4,719 ± 72 | 11,508 ± 63 | 523 ± 3 | 152,104 ± 1,189 | — | 0 |
| Hammer + Greater Mend, 0% | **+49.9 ± 4.2** | +19.4% (+49,602 ± 6,465) | −4 ± 64 | +173 ± 69 | +47 ± 6 | +47,588 ± 2,851 | 791 ± 8 · 19,765 | 0 |
| Hammer + Greater Mend, −30% | **+39.1 ± 3.9** | +16.0% (+40,736 ± 7,350) | −6 ± 72 | +459 ± 78 | +81 ± 6 | +35,197 ± 2,566 | 800 ± 8 · 20,004 | 0 |
| Hammer + Greater Mend, −40% | **+33.2 ± 4.1** | +15.0% (+38,323 ± 9,224) | +13 ± 77 | +396 ± 61 | +79 ± 5 | +25,539 ± 2,549 | 782 ± 8 · 19,560 | 0 |
| Hammer + Greater Mend, −30%, the engine's melee reach (1 tile) | +30.8 ± 3.1 | +12.0% | −23 ± 92 | +245 ± 70 | +50 ± 4 | +25,797 ± 1,630 | 643 ± 6 · 16,063 | 0 |
| Healer + Shelter, 0% | +8.5 ± 4.2 | +3.4% (± 2.8%) | +16 ± 110 | +122 ± 68 | −12 ± 4 | shield +33,964 ± 416 | 117 · 4,194 | 0 |
| Healer + Shelter, −30% | +10.7 ± 4.8 | +4.4% (± 3.2%) | −41 ± 82 | +374 ± 70 | +14 ± 4 | shield +23,704 ± 397 | 117 · 4,196 | 0 |
| Healer + Shelter, −40% | +6.9 ± 4.2 | +3.2% (± 2.9%) | +15 ± 84 | +338 ± 61 | +18 ± 4 | shield +18,076 ± 315 | 117 · 4,201 | 0 |

Read it plainly:

- **A borrowed Greater Mend at −30% is worth +39 held steps.** That's about two gear tiers (r9 measured one tier ahead at +20.8 ± 3.6 steps) for one point. The doc's whole-build ceiling is 7 to 14 steps (17 section 9). The penalty barely bites: 0% to −30% costs 10.8 ± 2.7 steps (paired), 0% to −40% costs 16.7 ± 4.2.
- **Why it's so strong:** the hammer is the front seat, so most of what it casts lands on itself (70,159 self-healing an hour at 0% against 3,297 from Mend alone in the base). Under the spell rule a heal is a share of the caster's own blow, so a hammer's Greater Mend scales on a hammer's blow. The borrower spends about 20,000 mana an hour on it and buys about 120 more drinks an hour to do it.
- **The doc's "3 steps behind native" rule is met and doesn't help.** −30% is 10.8 ± 2.7 steps behind the same move at full power. The problem isn't the gap to native, it's the size of the gain.
- **Shelter is worth about 7 to 11 steps** whatever the penalty, all inside about ±4. Its shield output falls with the penalty (34k, 24k, 18k an hour) and the held step doesn't follow. Shelter's own trigger (a monster's cast warning) never fired on this ground in a 1 h probe, so these cells cast it with no condition (117 casts an hour, the 30 s cooldown).
- **Gold per hero-hour doesn't move with held depth in today's engine.** +50 steps changed gold by −4 ± 64. XP does follow it. So gold an hour can't price a borrow yet. That's an engine fact, not a Roads one.
- **No deaths anywhere.** Steady turns risk into depth: the four falls back before it dies (256 seed runs in this doc, 0 deaths).
- **Reach matters.** Without a reach rule the engine gives a melee borrower's ally heal the hero's own 1-tile range (the condition picks its "lowest ally" inside that range too). That costs 8.3 ± 3.8 steps. The cells above give the borrowed heal the native healer's 7 tiles. The design has to say which.

## 2. Does a hybrid out-earn a specialist?

No, a specialist healer still wins. But a hybrid is close enough to be a real build, and a hybrid beside a specialist adds to it.

| Four | Held | XP / hero-h | Gold / hero-h | Store / hero-h | Deaths |
|---|---|---|---|---|---|
| (a) Pure healer: M | 607.2 ± 3.0 | 255,273 ± 5,090 | 4,719 ± 72 | 11,508 ± 63 | 0 |
| (a) Pure healer, a sword in front: S | 611.2 ± 4.2 | 257,126 ± 7,449 | 4,654 ± 68 | 11,759 ± 48 | 0 |
| No healer, no borrow: N | 380.5 ± 5.6 | 141,656 ± 660 | 4,956 ± 37 | 10,526 ± 181 | 0 |
| (b) No healer, hammer and sword each borrow Greater Mend at −40% (Havora: neither borders Restoration) | 544.7 ± 7.9 | 196,093 ± 9,193 | 4,640 ± 71 | 11,735 ± 165 | 0 |
| No healer, the sword borrows Greater Mend at 0% | 488.0 ± 2.8 | 148,071 ± 1,431 | 4,554 ± 63 | 10,917 ± 76 | 0 |
| (c) S, the sword borrows Greater Mend at −40% | 627.9 ± 3.7 | 270,005 ± 6,406 | 4,600 ± 31 | 12,262 ± 56 | 0 |

- (b) against (a), paired with M: **−62.5 ± 10.2 steps, −59,180 ± 12,985 XP a hero-hour (−23%), gold −79 ± 116, store +227 ± 183.** Two borrowed heals at −40% win back 164.3 ± 8.8 of the 227 steps a four loses without its healer (72%).
- (c) against S: **+16.6 ± 7.4 steps, +5% XP (± 5%), store +504 ± 73.** A hybrid in a party with a specialist adds about one gear tier's worth of depth for about 4% more supplies.
- One caveat on N: it sits at step 380, under the ground's floor step (480), so its XP is held at the floor's pay. That's why N + one 0% borrow gains 108 steps but only +4.5% XP.

## 3. A uniform penalty, or one derived from each move's value?

**What each move adds at 0% to a four that lacks it** (each row's base names what it lacks):

| Move (kind) | Borrower, base | Held vs base | XP / hero-h vs base | Gold / hero-h vs base | Store vs base |
|---|---|---|---|---|---|
| Greater Mend (heal) | sword, N (no healer) | **+107.6 ± 5.0** | +4.5% ± 1.3% (floor-held, see above) | −402 ± 68 | +391 ± 222 |
| Greater Mend (heal), a second healer | hammer, M | +49.9 ± 4.2 | +19.4% ± 2.5% | −4 ± 64 | +173 ± 69 |
| Shelter (shield) | healer, M (no tank) | +8.5 ± 4.2 | +3.4% ± 2.8% | +16 ± 110 | +122 ± 68 |
| Fireball (AoE nuke) | hammer, NM (no mage) | −4.0 ± 4.2 | **+5.7% ± 1.6%** | +6.5% (+248 ± 58) | −21 ± 89 |
| Frost Lance (single-target nuke) | hammer, NM | −1.8 ± 2.2 | +2.7% ± 0.8% | +3.1% (+118 ± 62) | +221 ± 69 |
| Hunter's Mark (debuff) | sword, NB (no bow) | −1.1 ± 3.1 | +1.6% ± 1.1% | +1.3% (+53 ± 56) | −84 ± 92 |
| Challenge (taunt) | hammer, M (no tank) | 0.0 ± 3.7 | −0.6% ± 2.0% | −106 ± 85 | −888 ± 78 |

Two kinds of value show up. Defensive moves buy depth (held steps). Offensive moves buy kill speed (XP and gold an hour) and no depth: r9 already saw this (the offense half of a gear tier back moved held depth only −7.9 ± 4.2). At the doc's 0.7% pace a step, Fireball's +5.7% is about 8 steps of pace and Frost Lance's about 4. The two units aren't fully interchangeable, so the table keeps both.

**A uniform −30% is wrong in both directions.** Greater Mend in a no-healer four is worth about 108 steps, while Fireball, Frost Lance and Hunter's Mark are worth about 8, 4 and 2 steps of pace, and a borrowed Challenge is worth nothing measurable in a no-tank four (the engine needed a seam just to let a non-tank taunt: `targeting.js challengeable` takes only tanks).

**The penalty is a weak lever.** Measured at five powers:

| Power | Greater Mend on the hammer, held vs M | Shelter on the healer, held vs M | Fireball on the hammer, XP vs NM |
|---|---|---|---|
| 100% | +49.9 ± 4.2 | +8.5 ± 4.2 | +5.7% ± 1.6% |
| 70% | +39.1 ± 3.9 | +10.7 ± 4.8 | +4.1% ± 1.0% |
| 60% | +33.2 ± 4.1 | +6.9 ± 4.2 | |
| 50% | | | +3.6% ± 2.1% |
| 40% | +24.4 ± 3.4 | +8.4 ± 3.9 | |
| 20% | +15.7 ± 4.3 | | |

At 20% power, a borrowed Greater Mend still adds 15.7 steps, more than the whole-build ceiling. Its value comes mostly from the casts themselves (about 800 an hour on a 2 s cooldown, most of them on the front seat), not from their size. Shelter's value doesn't follow its power at all within ±4.

**Proposed rule, in steps.** Size every borrowable move by its measured value at full power, V0 in held steps (an offense move: its pace gain ÷ 0.7%), on the ground mix:

| V0 | Penalty |
|---|---|
| 4 steps or less | none |
| 4 to 10 | −30% |
| 10 to 20 | −50% |
| over 20 | no power penalty fixes it. Change what drives the value (below), then measure again |

The cap of 4 steps is one vow "where it fits" (17 section 9: +3 to +4), so a borrow is never worth more than a vow.

**Tested on two moves:**

- **Fireball** (V0 about 8 steps of pace, so −30%): measured +4.1% ± 1.0% XP, about 6 ± 1.4 steps. At −50% it's +3.6% ± 2.1%, about 5 ± 3. The −30% tier lands near the cap but not under it. **In band at −50%**, within its error.
- **Greater Mend** (V0 about 50, over 20): no penalty brings it under 4. Measured at −80%: +15.7 ± 4.3. **The rule's last row is right: a power penalty can't fix it.**

What would fix Greater Mend (not measured here, each one a Lab variant to run next): have a borrowed heal scale on the borrower's Magic instead of its weapon blow, or put it on Mend's 6 s cooldown, or have it share one clock with Mend. Each one cuts the cast count, which is what carries the value.

## 4. Opportunity cost

**What reaching a border town costs (from the doc).** Havora to your country is 3 milestones. The border road is 2 milestones, then the town. So it's at least 6 points from Havora, if the "junction" the border road leaves (17 section 15) is the end of the entry road. The doc doesn't pin the junction down, and its walk-through took the town with point 31. Five of those six points are milestones the same size as any other (17 section 9: 1/3 step each), so they aren't lost. The town itself costs 1 point and carries no milestone share.

| | Steps |
|---|---|
| The town's point spent on your own road instead (one milestone: a rank or a stat) | **1/3 step** (about 0.23% pace, 04 section 1) |
| The 2 border milestones in place of 2 milestones on your own road | 0 by the budget (same size). Their stats may suit the build less |
| The bar slot | measured inside each cell above: the hammer's damage with a borrowed Greater Mend was 26.4 against 26.0 without (it's on the heal lane, so no strike is lost). An offense borrow shares the offense lane |
| What the town buys (section 1) | Greater Mend at −30%: **+39.1 ± 3.9 steps**. Shelter at −30%: +10.7 ± 4.8. Fireball at −30%: about 6 steps of pace |

So the town's cost is 1/3 step against a measured gain of 6 to 39 steps: **18 to 117 times its price**. The Havora crossing's road length isn't given in the doc, so its cost can't be computed yet.

## 5. Build preview feasibility

**Runtime (measured).**

| Run | Time |
|---|---|
| One 1 h seed, one worker | 4 s (8 seeds: 31 s wall) |
| One 8 h seed of a four at Level 60 | 29 to 65 s a seed, on 7 workers while the PC sat at 90%+ CPU from other lanes |
| One cell, 8 seeds × 8 h | about 5 to 9 CPU-minutes. A plan of 5 to 10 cells on 7 workers: 227 to 557 s wall |

**What the engine produces reliably** (spread between seeds on the base cells, 8 seeds × 8 h; for ±5% at 95%, seeds = (1.96 × cv / 0.05)²):

| Metric | Spread seed to seed | Seeds needed | Verdict |
|---|---|---|---|
| Held depth (endurance at a stance) | sd 4 to 9 steps on a 600-step base | ±5 steps needs about 11 | **Reliable at 8 to 12 seeds** |
| Healing done | cv 2 to 4% | 1 to 3 | Reliable |
| Mana (casts and drinks) | cv 1 to 3% | 1 to 2 | Reliable |
| Supplies (store bill) | cv 1 to 5% | 1 to 4 | Reliable |
| Kills an hour (a DPS stand-in) | cv 1.4 to 2.3% | 1 | Reliable |
| XP an hour | cv 1.3 to 8.2% | 1 to 11 | Reliable at 8 to 12 seeds |
| Gold an hour | cv 2 to 4% at 8 h, **11.6% at 1 h** | 3 at 8 h, 21 at 1 h | Needs 8 h hunts. Doesn't follow held depth today (section 1) |
| Death risk | 0 deaths in 256 seed runs at Steady | can't say | **Can't be produced at Steady**: the stance falls back before a death. It needs Bold cells or a "deepest step before a death" reading |

**Could a cached table back a player-facing preview?** Yes, as an offline table, not as a live run per click.

- An entry is (ground, Level band, build archetype, party shape, stance) → held step, XP an hour, kills an hour, healing, mana, supplies, each with its ± from 8 to 12 seeds of 8 h.
- Cost: an entry is about 5 to 9 CPU-minutes. Today there's one scale ground (`DANGER_GROUNDS` holds only Muster Barrows). At 12 grounds × 10 Level bands × 17 archetypes (17's ten builds and seven border hybrids) × 1 shape × 1 stance, that's 2,040 entries, about 170 to 300 CPU-hours: 9 to 15 hours on the 20-thread PC, run nightly or once per balance change. No paid spend.
- Live per click it doesn't fit. One honest cell is 5+ CPU-minutes. A 1 h × 4-seed dummy run is about 16 CPU-seconds and its gold figure is ±12% a seed. 17 section 10's training dummy (damage, healing, mana a minute on a short fight) is the right live tool. The table is the right tool for "what will this build hold and earn here".
- A preview can only show what the table has. A player's exact build is matched to its nearest archetype, so the preview says "builds like yours".

## 6. What the engine can't express yet (said plainly)

| Gap | What I did |
|---|---|
| Borrowing at all | Clone rows on a scratch copy (above). Nothing in `src/` |
| A non-tank's taunt | A scratch seam in `targeting.js` (a `lent` row taunts from any hero, its hold × its power) |
| A borrowed ally heal's reach | A scratch seam: the row's `reach` before the hero's range, in targeting and in the "lowest ally" condition |
| Penalties on things that aren't a number the row lands (a taunt's hold is one global constant; Frost Slam's chill comes from its rune tier) | Taunt hold done by the seam. Chill strength not touched, not measured |
| Crossroads, waystones, vows, hybrid crossroads | Not in the engine, not measured |
| Death risk at Steady | Not producible (section 5) |
| Gold following depth | Today's engine doesn't (section 1) |

## 7. The towns' owed values (2026-11-23, lane/roads-borrow-values)

Six town moves had no V0, so four towns lent nothing while a hero still paid a point on the town to reach its hybrid. Each is measured by section 3's method: the move at full power in a four that lacks it, Muster Barrows, Level 60, Steady, held start 570, 8 seeds × 8 h, paired against its own base. One thing changed since sections 1 to 3: the borrow is the engine's own (`heroSetup` `borrowed`, which reads the native weapon's reference blow, `src/core/borrow-blow.js`), not a clone on the borrower's blow, because 17 ruled the native blow and the engine plays it now. V0 = the larger of the held gain and the pace gain ÷ 0.7%, never under 0.

| Move | Borrower, base | Casts / h | Held vs base | XP / hero-h vs base | V0 | Border / Havora | Opens at |
|---|---|---|---|---|---|---|---|
| Power Strike | axes, Y (axes, bow, mage, healer) | 410 | +1.4 ± 3.3 | +2.9% ± 1.1 | 4.2 | −30% / −50% | 50 / 30 |
| Flame Strike | hammer, M | 404 | +3.4 ± 2.7 | +4.4% ± 1.1 | 6.3 | −30% / −50% | 70 / 50 |
| Rend | hammer, M | 433 | +2.2 ± 2.9 | +5.0% ± 1.1 | 7.1 | −30% / −50% | 80 / 60 |
| Circle of Renewal | sword, N | 249 | +7.1 ± 2.0 | +3.8% ± 1.1 | 7.1 | −30% / −50% | 80 / 60 |
| Turning Cut | tank, T (tank, bow, mage, healer) | 387 | −2.4 ± 2.5 | +7.7% ± 1.0 | 11.0 | −50% / not offered | 80 |
| Raking Shot | sword, NB (its own arrows, Ranged held at 10) | 104 | −3.8 ± 3.9 | −0.6% ± 1.4 | 0 | none / −30% | 20 / 20 |
| Greater Mend | sword, N (7-tile reach) | 1,421 | **+97.4 ± 3.9** | +41.7% ± 4.6 | 97.4 | past the last band: not offered | V4 |

- **Turning Cut** sits at 11.0 ± 1.4, astride the 10 line. It takes the −50% band. In band is enough.
- **Raking Shot adds nothing a melee hero can use.** Its 4-tile line only starts from the monster beside the borrower, so it fires 104 times an hour and moves neither depth nor pace. It's free at a border and opens at 20: a cheap pick that does little.
- **Greater Mend** with the engine's 1-tile reach reads +20.2 ± 3.3; with 17's 7 tiles, +97.4. Either way it is past 20, so it stays unoffered until V4, as 19 says.
- **Two rows needed 17's rules the engine doesn't play yet** (`roads-lend-rules.json`). Raking Shot: a borrowed shot looses its own arrows (the engine only lets a bow loose one, `abilities.js castShotOf`), and its unlock reads Ranged 10, which a sword never trains (held at 10 here). Without both it never fires. Greater Mend: its native 7-tile reach. These gaps, and four town sides that lend nothing at all, are in CONFLICTS 2026-11-23.

### 7a. Every V0 on the one method (2026-11-23, lane/roads-v0-remeasure)

The rows older than section 7 came from sections 1 to 3 (clones on the borrower's blow) and from `23` (Hoarfrost and Ward: what the mage or healer lost without the move, which is not a borrow at all). So the table mixed three methods. Every row of `BORROW_VALUES` is now read the section 7 way: the engine's own borrow, Muster Barrows, Level 60, Steady, held start 570, 8 seeds × 8 h, paired against its own base, on the same tree. Where the engine lacks a 17 rule the move is measured with it (`roads-lend-rules.json`: a taunt from any seat and Ward's native 7 tiles are new here), and an unlock in the move's own skill is held at the unlock (Shelter's Melee 20 on the healer, Hoarfrost's Magic 14 on the hammer). The section 7 rows ran again on this tree and read the same to the decimal.

| Move | Borrower, base | Casts / h | Held vs base | XP / hero-h vs base | Old V0 | New V0 | Border / Havora | Opens at (border / Havora), old → new |
|---|---|---|---|---|---|---|---|---|
| Challenge | hammer, M (taunts from any seat) | 282 | −5.8 ± 2.1 | −1.9% ± 0.7 | 0 | 0 | none / −30% (no change) | 20 / 20 (no change) |
| Hunter's Mark | sword, NB | 284 | −5.3 ± 3.5 | −0.9% ± 1.4 | 2 | 0 | none / −30% (no change) | 30 / 20 → 20 / 20 |
| Frost Lance | hammer, NM | 448 | −12.8 ± 2.7 | −1.9% ± 0.9 | 4 | 0 | none / −30% (no change) | 60 / 40 → 20 / 20 |
| Fireball | hammer, NM | 262 | −5.3 ± 3.4 | +2.7% ± 1.3 | 8 | 3.8 | −30% / −50% → none / −30% | 80 / 60 → 60 / 40 |
| Shelter | healer, M (Melee held at 20; its own trigger) | 28 | +1.4 ± 1.6 | +0.5% ± 0.6 | 8.5 | 1.4 | −30% / −50% → none / −30% | 90 / 70 → 20 / 20 |
| Hoarfrost | hammer, NM (Magic held at 14) | 211 | 0.0 ± 2.6 | +1.9% ± 1.0 | 15.8 | 2.7 | −50% / not offered → none / −30% | 120 / none → 40 / 30 |
| Protective Ward | sword, N (7-tile reach) | 279 | +18.4 ± 1.9 | +4.3% ± 0.7 | 16.1 | 18.4 | −50% / not offered (no change) | 120 → 140 |
| Greater Mend | sword, N (7-tile reach) | 1,421 | +97.4 ± 3.9 | +41.7% ± 4.6 | 97.4 | 97.4 | not offered (no change) | V4 |
| Power Strike, Flame Strike, Rend, Circle, Turning Cut, Raking Shot | as section 7 | | | | as section 7 | the same | no change | no change |

- **Three moves change band**: Fireball, Shelter and Hoarfrost all fall into the free band (V0 4 or less). On a borrower the offense spells read the native mage's blow but cast at the borrower's own Magic (a hammer's Magic is 1, so its rune version is the lowest), and Shelter on its own trigger (two heroes under 80%) fires 28 times an hour in a four with a healer. Hoarfrost is now offered at Havora (−30%), so the crossing lists one more option (182 rows; `1064` regenerated STAGED, the census re-pinned on that one row).
- **Frost Lance and Hunter's Mark read below zero** on a melee borrower (Frost Lance −12.8 held: the hammer spends its global clock on a slower blow). V0 is never under 0, so both are free and open at 20.
- **Protective Ward** at its native 7 tiles moves inside its band (16.1 to 18.4). It opens at 140 now (the formula, V 9.2 after −50%). In band is enough. At the engine's 1 tile it reads 11.7 ± 2.7.
- **What would move these again**: the borrow engine's version rule (a borrowed spell's rune version read from a skill the borrower trains, section 7b) could lift Fireball and Hoarfrost on a high-Magic borrower. The values above are the rule the engine plays today.

### 7b. What the borrow engine needs (2026-11-23, lane/roads-v0-remeasure → the borrow-engine lane)

Of CONFLICTS 2026-11-23's eight town sides that buy nothing, four are the map (every move the town names is the hero's own or past the last band: Shield at Shield · Restoration, Dual Axe at Club · Dual Axe, Sword at Sword · Club, Destruction at Destruction · Restoration), the designer's. The other four are the engine: the move is offered and priced, and today's engine never casts it for that hero. Each was measured with the rule it lacks (`roads-lend-rules.json`, or the unlock held by `roads-run.mjs`), so its V0 holds once the engine plays the rule.

| Town side | Move | Why it never casts today | What the engine needs (17 section 3) |
|---|---|---|---|
| Restoration at Shield · Restoration | Shelter | Its `unlock` (20) and its rune versions read its own skill, Melee (`abilitySkill`), which a healer holds at 1 and never trains: the slot waits `level` (`abilities.js` firstUsable) | A borrowed move's gate is the borrow's own opening Level (`borrowBand` opensAt, the Roads price), not its native skill: its unlock passes once the borrow is granted, and its versions read a skill the borrower trains (17: "Training: trains the skill its row names"; the version skill is the ruling to make). Measured with Melee held at 20 and the store rune bought for that Melee |
| Dual Axe at Dual Axe · Ranged | Raking Shot | A cast looses only what the worn weapon shoots (`abilities.js castShotOf`, `shootsItem` by role): an axe has no arrow. Its unlock reads Ranged 10, which an axe never trains | A borrowed shot looses its own arrows (17: "Supplies: uses its own rune or arrows"; the lab's seam lets a borrower loose a carried Bronze Arrow, ammo free), and the unlock rule above |
| Destruction at Destruction · Shield | Challenge | `targeting.js challengeable` / `inReachOf` take only a tank (`isTank`) | A borrowed Challenge taunts from any seat (17: "Taunts: from any seat, its hold × its power"): `challengeable` and `challengeFrom` read the hero's borrow list (`borrowBlows` names `challenge`), and the hold takes the borrow's penalty. One-holder-a-lap (`holderTank`) has to say whether a non-tank holder counts |
| Sword at Sword · Shield | Challenge | The same `isTank` gate | The same rule |

Beside them, two rules change a V0 but not whether a move casts: a borrowed ally heal or ward reaches as its native move (Greater Mend and Protective Ward 7 tiles; the engine gives the holder's range, `cast-targets.js reachOf`, a melee hero's 1 tile), and no borrowed heal shares Mend's clock (V4, 19's heal rule). Nothing here is built; `src/core/hunt/*` is the borrow-engine lane's.

### 7c. The borrow engine and the heal rule, measured (2026-11-27, lane/e5-borrowing, systems)

**What the engine plays now** (`src/core/hunt/talent-rows.js` lend, one rule set for a build's borrow and a borrow handed whole; `src/data/talents.js BORROW_RULES`): the native weapon's blow (as before), **a borrowed heal on Mend's clock** (one 6 s cooldown, casting either starts it: the lent row stands in for a Mend, `abilities.js clockOf`), **Magic at Mend's rate** (250), **an ally heal or ward at its native reach** (the healer's 7 tiles, in the target rule and in the slot's "lowest ally"), **no native unlock** (the borrow's opening Level is its gate: Shelter casts on a healer), and **a borrowed Challenge from any seat** (a seat that is no tank takes only what is on a hero that is no tank, its hold at its price). Still not played: a borrowed shot's own arrows (Raking Shot off an axe), and which skill a borrowed spell's rune version reads (the ruling 7b names).

**How it was measured.** Signature-depth's cell (`tools/balance-program/redesign/roads/e5/run.sh`, read by `sum.mjs`): v1-climb's `base` cell, Muster Barrows, Level 60, MID kits, Steady, 8 h, paced from hour 4, 12 seeds paired on the same dice, the engine's own borrow (`v1-climb --borrowed`) with the native played slot's conditions, ahead of Mend. Two scales: the held step's paired delta, and pace steps (the held pace's delta over 0.43% a step, `signature-depth/sum.mjs PACE_STEP_PCT`). The value is the larger. Played from `d42bd6295`; the later commits change only the taunt path, which no cell here casts.

| Borrow | Plain four's held | Held delta (se) | Pace steps (se) | Value | Casts / h | Borrower's Mend / h (plain, borrowed) | Store / hero-h | Deaths |
|---|---|---|---|---|---|---|---|---|
| Greater Mend, the hammer beside a healer (M: 19 V4's cell) | 606.0 | +7.5 (3.2) | +7.1 (2.9) | **7.5** | 350 | 39, 0 | +2.4% | 0 / 0 |
| Greater Mend, the sword in a four with no healer (N: 17's V0 cell) | 447.2 | +40.3 (2.6) | +29.0 (2.6) | **40.3** | 464 | 18, 0 | +17.5% | 0 / 0 |
| Greater Mend, the same, at −30% | 447.2 | +31.5 (1.8) | +22.5 (1.4) | 31.5 | 460 | 18, 0 | +17.3% | 0 / 0 |
| Greater Mend, the same, at −50% | 447.2 | +18.0 (1.9) | +7.6 (2.7) | 18.0 | 458 | 18, 0 | +16.1% | 0 / 0 |
| Circle of Renewal, the sword with no healer (N) | 447.2 | +2.0 (2.3) | +1.8 (1.5) | **2.0** | 214 | 18, 5 | +6.4% | 0 / 0 |
| Greater Mend, the sword with no healer, at −75% (lane/designer-greater-mend) | 447.2 | +7.0 (2.4) | +0.4 (1.8) | 7.0 | 450 | 18, 0 | +13.6% | 0 / 0 |
| **Greater Mend, the sword with no healer, at −80% (the fourth band)** | 447.2 | +6.0 (1.6) | −1.4 (1.1) | **6.0** | 448 | 18, 0 | +13.9% | 0 / 0 |
| Greater Mend, the hammer beside a healer, at −80% | GMH_ROW18 |

- **The heal rule works on cast count, as intended.** The sword's Greater Mend fell from 1,421 casts an hour (section 7, no rule) to 464, and its value from +97.4 to +40.3. Beside a healer it is +7.5 (it was +49.9 on the hammer before the rule, section 1). Under the rule the value now moves with power: 70% power reads 31.5 and half power 18.0 of 40.3.
- **19 V4 passes on its own cell** (the hammer beside a healer, 10 steps or less): 7.5 ± 3.2.
- **17's band does not.** Its V0 is "what the move adds to a four that lacks it", a four with no healer, and that reads 40.3: past the last band, so Greater Mend stays unoffered (`BORROW_VALUES` 40.3, the catalogue unchanged). That is the ledger's own fallback (20 "Known risks"). At −50% it is still 18, so no band of today's table lands it at 10 or less. The designer's call, with the measured menu in CONFLICTS 2026-11-27 (E5). **RULED (lane/designer-greater-mend, `19` "Decision: the borrowed heal in a four with no healer"):** a fourth band, V0 20 to 50 at −80% at a border, never at Havora. Greater Mend reads 6.0 ± 1.6 there and opens at 120; `1064` regenerated STAGED, its two town rows open at 120.
- **Circle of Renewal falls into the free band** on Mend's clock (2.0, was 7.1): free at a border and −30% at Havora, opening at 30 and 20 (was 80 and 60). `1064` regenerated STAGED, two option rows.

## Files

`tools/balance-program/redesign/roads/`: `make-lend.mjs` (writes `roads-lend.json`, the candidate, and `roads-lend-rules.json`, the same with 17's borrow rules the engine lacks), `check-lend.mjs` (proves both plant), `roads-run.mjs` (the cells: plans q1, q2, q3, q3f, time, v0, v0rules), `summarize.mjs` → `summary.txt`, `v0.mjs` → `v0-values.txt` (section 7), and each plan's `.json` (per seed) and `.txt`.
