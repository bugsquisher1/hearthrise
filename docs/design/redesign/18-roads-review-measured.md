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

## Files

`tools/balance-program/redesign/roads/`: `make-lend.mjs` (writes `roads-lend.json`, the candidate), `check-lend.mjs` (proves the plant), `roads-run.mjs` (the cells: plans q1, q2, q3, q3f, time), `summarize.mjs` → `summary.txt`, and each plan's `.json` (per seed) and `.txt`.
