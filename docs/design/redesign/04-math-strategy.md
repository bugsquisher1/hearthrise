# 04. The mathematical design strategy

Written 2026-11-21 on `lane/rd-math`, on `set/v0.2.144` at 0ddcd6448. This is deliverable 6 of the reset request of 2026-11-21, and it answers the request's sections 3, 4 and 6. Read `01-identity.md` and `02-architecture.md` first (branch `lane/rd-vision`). Docs, six small probe patches and one script that plays them. No game code or data was changed.

The owner approved the redesign's directions on 2026-11-22 (`08-for-tyler.md`, "His answers"), and section 11 now carries his new rules: the hunting day of 10 hours, 12 with Premium, and one price rule for bought hunting and bought town work. The strategy here is the approved direction. No number is a ruling. Every number is a starting value or a range to search, and section 14 says how each one gets settled.

**Labels.** MEASURED is a run on the real engine, with its run. COMPUTED is arithmetic on named inputs. JUDGMENT is a design opinion of mine. SPECULATIVE is a guess worth a test. SURVEY is a formula family from a public source, quoted as an idea only (`public-formula-survey.md`, 2026-11-21, licences as marked there, none of it copied). EVIDENCE is a reading from an earlier document, with its place.

## 0. One screen

**The thesis.** Today's formulas are sums of straight lines, and straight lines drift apart. Hero health, monster health, gear and skill each grow on their own line, so a share that is right at Level 60 is wrong at Level 400 and broken at Level 2,000. Most of the structural problems on record are that one fact showing up in different places. The fix is not better coefficients. It is a different family of formula.

**The recommendation in five lines.**

1. **One unit, the step.** A Level is one step of power. Gear, skill, a monster's strength, a Danger step, a Trait and a buff are all counted in steps.
2. **One contest.** Every amount in a fight is a base share times a fixed ratio raised to the gap in steps between the two sides. Equal steps give the reference fight at every Level.
3. **Targets are times and shares, never raw numbers.** Seconds to kill, seconds to die, the share of an hour spent fighting, the share of income spent on supplies. Monsters, rewards and prices are derived from those.
4. **Power is paid out as depth.** A company holds the deepest Danger step its plan allows, and pay grows by a fixed ratio for each step. So one step of power is worth the same share of progress at Level 20 and at Level 2,000.
5. **About 40 global levers, no number for one ground.** Section 12 lists them. Content carries roles and mixes, never its own math.

**What it dissolves, not tunes.**

| Problem on record | Why it happens today | What removes it |
|---|---|---|
| A fixed gear step and a fixed Level gap cannot both hold past about Level 150 (K-9) | Gear is a straight line, so a 20 Level gap is a shrinking share | The contest reads the gap in steps. A 20 step gap is the same ratio at every Level |
| A four earns more XP but less gold a head (K-8) | XP has a party table and a tier dial. Coin has neither | One pay rule for XP, coin and loot quality, read off the same step |
| A four's damage barely moves its pace | Kills are capped by the respawn | Pulls come on readiness and the company climbs. Power becomes depth |
| The harder tiers are a cliff | One hero takes it all, damage costs nothing until it kills, and three hand-picked dials sit tens of steps apart (COMPUTED: blows at 1.17 and 1.33 times Normal are about 45 and 80 steps at a 0.35% step) | Small steps, a fall back, monsters that reach the party, and damage that costs time and gold before it costs a life |
| Armor capped at 60% is worthless past Level 30 | A cap on a curve that the gear outgrows | Defense is steps in the same contest. No cap, no wall |
| One multiple cannot fit the Level table at both ends | The reward is a power of Level fitted to a moving kill rate | Hours for a Level are the law. The reward is derived from them |
| Skill fades to 14% of a hit at Level 1,000 | Skill cost is geometric, gear is linear | Skill is steps on the same clock as Level |
| A health-only boss is decided by the clock | Damage is the only thing the fight tests | Threat that grows through the fight tests damage and sustain together |
| Unlock and Talent damage is invisible | A percent of damage reaches pace only through the fight share | The same: power becomes depth, and depth pays a fixed ratio |

**What I measured for this page** (section 9, the real engine, six small runs). The share of a damage gain that reaches pace is close to the share of the hour spent fighting: 0.51 to 0.58 for a lone hero, and 0.00 to 0.25 for a four on Normal. A quarter more incoming damage costs a four nothing and takes a lone hero on a harder tier from no deaths to dying most hours, with the whole edge inside about one gear tier of power. Slowing rest tenfold moved pace by under 2%, which corrected one of my own assumptions.

**The three things I most want reviewed.** The step as the unit (section 1). Progress stored as a Level and a share of it, so no number grows without bound (section 5). Dropping the separate hit chance contest (section 2), which disagrees with one line of `02-architecture.md` and is the designer's call.

## 1. The foundation: the step, the gap and the reference company

**The step.** One step is a fixed ratio of power, `s`. A hero of Level L whose gear and skill are all "at Level" has an offense rating and a defense rating of L. A monster of Danger step N has both at N. Every contest reads the gap: the attacker's rating minus the defender's.

```
amount = base share x s ^ gap
```

At a gap of zero the amount is the base share, at every Level. That is the whole scaling law.

**The reference company.** One written definition: four heroes of Level L, a front, a healer and two damage dealers, each with gear and skill at Level, on the default bar and the Steady stance. The monster of step N is written so that this company at Level N meets the reference times of section 6. Every other hero is described by how many steps ahead or behind the reference it is. That number is the gap, and it is the one quantity the game's math is about.

**Why a ratio raised to a gap and not a ratio of two stats.** They are the same family. If a "power value" is `s ^ rating`, then `s ^ gap` is attacker power over defender power. The difference is where the big numbers live. In the first form ratings are small whole numbers (a sword of Level 240) and the engine applies the ratio. In the second every stat is a geometric number that passes a million by Level 4,000 at any useful step (COMPUTED: 1.0035 ^ 4,000 is 1.2 million). The first form never needs a number squish and never overflows.

**How big is a step.** One lever, `powerStep`. COMPUTED:

| `powerStep` | 20 steps (one gear tier) | 100 steps | Steps to double |
|---|---|---|---|
| 0.25% | +5.1% | 1.28 times | 277 |
| 0.35% | +7.2% | 1.42 times | 198 |
| 0.50% | +10.5% | 1.65 times | 139 |

The search range is 0.25% to 0.5%. The value is settled by two readings that pull against each other: a gear tier must be felt (bigger steps), and a company one tier behind must still be able to hunt its ground (smaller steps).

**What a hero's rating is made of.** A weighted mean of three parts, each counted in Levels: the Level itself, the skill for the style in use, and the item Levels of the gear that feeds that rating. The weights sum to one, so two levers (`weightGear`, `weightSkill`). They answer a design question in plain words: how much of a hero is its Level, its training and its kit. Conditional power (a Trait, a move, a buff, an imbuement) adds steps for as long as its "when" holds.

**The display curve.** Players like numbers that grow. Health is shown through one display curve of Level, shared by heroes and monsters. Every amount is a share of its target's own health, so the curve cancels in every contest. It is presentation. Any curve works, and it is one lever that moves no outcome. JUDGMENT: keep today's straight line (150 plus 10 a Level) so the numbers stay readable forever.

**The open risk in this section.** A constant step makes the first twenty Levels worth only about 7% of power, where today Levels 1 to 10 raise health by 60%. The early game may need more per Level to feel fast. Two ways, both cheap: a short "early bonus" on the rating (two levers, a size and a Level where it fades), or let the first hour's power come from filling empty gear slots and opening bar slots. SPECULATIVE until a played first hour on the model.

## 2. Damage and defense

**1. Behavior needed.** Every point of offense and defense can be felt as depth held (identity principle 2). A stat never reaches a wall and never becomes decoration. Two defenses, armor against physical and ward against magic (`02-architecture.md` package 1). A slightly worse kit gives a slightly worse result (principle 3). The same rule for a hero hitting a monster, a monster hitting a hero and, later, a hero hitting a hero.

**2. Model families.**

| Family | Shape | Behavior | Unlimited Levels | Verdict |
|---|---|---|---|---|
| Subtraction | damage minus armor (SURVEY: the OpenTibia servers' random armor and shield subtraction) | Strong against many small hits, nothing against a big one. Weak hits go to zero | Needs armor to grow with damage forever, by hand | Rejected as the base. It makes fast weapons and ticks useless and is the cause of today's "small hits against big ones" patches |
| Armor against hit size | armor / (armor + k x raw damage) (SURVEY: Path of Building) | The same bias as subtraction, softened. No Level term needed | Holds if armor and damage grow together | Good second choice. But it makes multi-hit and one-hit moves need separate sizing |
| Armor against the attacker's Level, with a cap | armor / (armor + k x Level), capped (SURVEY: TrinityCore. Also today's `mitigation.js`) | A percent off, the same for every hit size | Drifts unless gear is on the same line as k x Level. Today it saturates and the 60% cap becomes the real armor number (EVIDENCE: `12-balance-pass.md` 3.6) | Rejected. It is the family that failed |
| **The step contest** | base share x s ^ (attack rating minus defense rating) | A percent off, the same for every hit size. Each step of armor is the same share less damage at any Level, with no cap | Exact by construction | **Recommended** |

**3. Recommendation.**

- **One contest for every amount.** A hero's blow, a spell, a tick, a monster's blow and a heal all use `base share x s ^ gap`. The base share is a share of the reference health of the target's Level, set per move in the rule table.
- **Two defense ratings.** Armor and ward. An armor piece spends its item Level between them: heavy mostly armor, light mostly ward, medium even. That replaces three different functional forms (dodge, absorb, a flat ward) with one, and the choice of weight stays a real trade.
- **No cap.** The limit on defense is the number of steps a kit can hold, which is a budget, not a clamp. Buff and Trait steps carry one stated ceiling on what can be active at once (`conditionalStepsMax`).
- **One roll shape with one spread.** Today a blow rolls from 1 to its maximum, a spell from half, and a heal not at all. One lever, `rollSpread`, for all of them. JUDGMENT: keep the spread narrow (plus or minus 20%) and put danger in monster wind-ups instead. A bar can answer a wind-up. Nothing answers a dice roll.
- **Drop the separate hit chance contest, or fold it in.** Today a blow first rolls to land (a ratio of two ratings held between 5% and 97%, the common shape, SURVEY: Path of Building's accuracy against evasion) and then rolls damage. Both contests read the same skill and gear, so they double count, and accuracy gear is worth about an eighth of damage gear (EVIDENCE: `44-formula-architecture.md` 5.1). Spells skip it. I recommend a blow always lands, with dodge and block as moves and Traits in the rule table. That removes six levers and the "reference hero" table that monsters' aim is inverted from. `02-architecture.md` keeps accuracy as a thing a skill gives. If the designer wants misses for feel, the clean form is a fixed base miss chance (one lever) that a monster role or a Trait can move, never a second ratings contest.

Levers: `powerStep`, `weightGear`, `weightSkill`, `rollSpread`, `conditionalStepsMax`, and the armor and ward split for each weight (three rows). Eight numbers replace about fourteen.

**4. Coupling.** The gap feeds everything: kill time (section 8), incoming damage and so sustain (section 3), and through depth the pay (section 7). Because offense and defense are the same currency with the same ratio, neither is favored by the formula. Which one a company wants more is decided by what limits its depth, which changes with the ground. That is the build decision.

**5. Validation.** A cell is a company on a Danger step. Sweep the gap from minus 60 to plus 60 in tens.
- Time to kill and damage taken per kill must each change by the same ratio for every ten steps, at Levels 30, 300 and 3,000. This is the scale test of section 14.
- Stat weights by finite difference: add ten steps of offense, then ten of defense, to each seat. Each must move depth held by a readable amount on at least one ground mix.
- **Proves it wrong:** a seat or a stat whose ten steps move depth by less than the noise on every ground. Or a kit that reaches a gap where it stops taking damage that matters on its own ground.

## 3. Healing and mana

**1. Behavior needed.** Sustain is a budget the player can read (package 1). No kit out-heals every pull, and regeneration never carries a hunt alone (candidates SUST-1 and SUST-2). Running low costs time and gold first (principle 3). Nothing reads any of this today: healing and mana have no reader at all (`03-targets.md` section 0).

**2. Model families.**

| Family | Shape | Tradeoff |
|---|---|---|
| Flat heals sized on the caster's blow (today) | heal = share of the caster's largest hit | Heals fall behind health at Level 185 and food stops at 396 health (EVIDENCE: `44` section 1). Needs a ladder of food sizes typed forever |
| Percent of maximum health | heal = share of the target's health | Scale free, but a healer's gear and skill stop mattering |
| **Share of reference health through the contest** | heal = base share x s ^ (healer's rating minus the healer's own Level) | Scale free, and a better healer heals more by the same ratio as a better sword hits. One rule with damage |

**3. Recommendation.** The third family, with sustain stated as a budget at the reference:

- **Three sources, three prices.** Regeneration is paid in time. A healer's spells are paid in mana, which is time or drinks. Supplies are paid in gold. Each covers a designed share of the reference company's incoming damage on Steady: `sustainFree`, `sustainHealer`, and the rest from supplies.
- **Mana in seconds.** A pool is so many seconds of full casting (`manaSeconds`) and comes back at a share a minute (`manaRegen`). A move's cost is a share of reference mana, so it never needs re-sizing with Level.
- **Food and drink restore a share of reference health or mana.** One row for each quality, not a ladder for each tier. Its price is seconds of the wage (section 10).
- **Rest costs time, by a rule and a rate.** The next pull waits until the party is ready, and out of a fight a hero recovers at `restRate`. Both are needed. Today damage taken has no price away from the edge, and slowing the rate alone does not create one, because the engine pulls again without waiting (MEASURED, section 9, probes B and C). The readiness threshold belongs to the stance.

Because deeper monsters hit by `s ^ depth` and take longer to kill, a company one step deeper needs about two steps more sustain each kill. So the supply bill climbs smoothly with depth. That is the slope the cliff lacks: the bill is felt long before a death.

Levers: `sustainFree`, `sustainHealer`, `manaSeconds`, `manaRegen`, `restRate`, and the supply price in wage seconds. Six.

**4. Coupling.** Sustain is the link between combat and the economy. Supplies are the main standing gold sink and the reason the trades have buyers (package 5). Net gold peaks at a shallower depth than XP does, because the bill grows faster than coin. That gives "Levels or gold tonight" from the math, with no rule written for it.

**5. Validation.** Needs three readers that do not exist: healing by source against incoming damage for each seat, why a hunt ended, and the healer's mana floor in a fight.
- At the reference the three shares must read their lever values within noise.
- The gold-best depth must sit below the XP-best depth for the reference company at every checkpoint.
- **Proves it wrong:** a kit whose sustain rises faster with its own steps than incoming damage rises with depth. That kit holds any depth, which is an infinite sustain loop.

## 4. Skill progression

**1. Behavior needed.** A hero is what it uses (package 1). Training a style is a long commitment that costs something to undo (identity question 9). Skill must matter as much at Level 1,000 as at Level 50.

**2. Model families.**

| Family | Shape | Tradeoff |
|---|---|---|
| Geometric tries (today, and SURVEY: the OpenTibia servers) | cost of the next skill level x 1.04, forever | Skill grows like the logarithm of hours. Beside anything linear it fades: 40% of a hit at Level 110, 14% at 1,000 (EVIDENCE: candidate LONG-3) |
| Gain chance by difficulty with a guaranteed-gain timer (SURVEY: the UO servers) | each use has a chance to gain, higher against harder targets | Rewards hunting at the edge, and the timer stops droughts. But progress is noisy, and it needs a total cap to mean anything |
| A capped table to 99 | fixed XP for each level | Right for trades, where a cap is a goal. Wrong for combat with unlimited Levels |
| **Time parity** | a skill level costs a set ratio of the hunted hours a Level costs at the same number | Skill is counted in the same steps as Level, on the same clock. A hero who always uses one style has skill near its Level. A hero who splits is behind in both |

**3. Recommendation.** Time parity for the four combat skills. One lever, `skillPace`: the hours for skill level n over the hours for Level n. At 1.0 a specialist's skill tracks its Level. Skill is then a rating in steps with weight `weightSkill`, and "Sword 240" on a Level 250 hero reads as ten steps behind. A skill trains from its style's use at a rate set in hours, not from damage numbers, so no formula change elsewhere can speed or slow training by accident.

Retraining a hero to a new style costs the hours those skill levels cost the first time. That is the cost to undo. If it reads as too harsh, one more lever makes a skill far below the hero's Level train faster (`skillCatchUp`).

The trades keep the capped table to 99. They are a different game with a different goal.

**4. Coupling.** Skill feeds the rating and nothing else. Today it also feeds hit chance, rune tiers, the yard fee and the death cost, which is why one skill change moves nine formulas (EVIDENCE: `44` section 3.2).

**5. Validation.** A career run (section 14) of a specialist and of a hero that switches style at Levels 50 and 200.
- **Proves it wrong:** the specialist's skill drifts away from its Level in either direction. Or the switcher is more than a stated number of days behind at Level 300.

## 5. Character leveling and the long curve

**1. Behavior needed.** One Level is one fixed unit of power forever (identity question 4). A steady beat. No Level cap. A Level 900 that feels as earned as Level 90.

**2. Model families for the hours a Level takes.**

| Family | Shape | Tradeoff |
|---|---|---|
| A table of ruled points | 600 h at Level 100, 4,580 h at 400, 23,520 h at 1,000 | The old table (HISTORICAL). A Level takes 11 hours at 150 and 40 hours at 900. Its hand brackets jump 4.1 times at Level 5 (EVIDENCE: `44` section 1) |
| A power of Level (SURVEY: cubic total XP, the OpenTibia servers) | hours for a Level grow as Level squared | Simple and unbounded. But every cadence counted in Levels slows without end |
| A doubling table (SURVEY: RuneLite's shape) | cost doubles every few Levels | Only for a capped game |
| **Rise, then level off** | hours for a Level climb to a ceiling and stay there | A steady beat forever. Three levers |

**3. Recommendation.** Rise, then level off. This follows from section 1, not from taste. If gear tiers, Danger steps and prices are all counted in Levels, then the hours a Level takes set the pace of every one of them. A curve that keeps slowing makes the whole game slow in lockstep. A curve that levels off gives a far player one step of everything at a steady rate.

```
hours for Level L = ceiling x L / (L + half)
```

Levers: `levelHoursCeiling`, `levelHoursHalf`, and a floor for the first Levels. The old table becomes a hypothesis to compare. COMPUTED, as one example and not a proposal: a ceiling of 16 hours with a half point of Level 60 puts Level 100 at about 660 hours, Level 400 at about 4,450 and Level 1,000 at about 13,250. The old table reads 600, 4,580 and 23,520, so the two agree to Level 400 and part after it, where the old table keeps slowing. The values come from the designer's answer to "how many hours should a Level take at 50, 200 and 1,000" (package 6, open question 1).

**Store a Level and a share of it, not a total.** A kill pays a share of the killer's own Level:

```
share of a Level = (1 / reference kills for that Level) x payStep ^ (monster step minus hero Level)
```

No XP total grows without bound, nothing overflows at any Level, and the "Level law" stops being a fitted curve. The hours table is the law and the kill's pay is derived from it. That removes the circle `44` section 3.3 found, where the Level curve, the pace target and kill XP were each fitted to the other two.

**Death.** Today a death costs 6% of all Level XP, which is 89 hunted hours at Level 300 and 759 at Level 1,000 (EVIDENCE: `44` section 1). In this model a death costs hours of progress (`deathHours`), cut by Blessings. It is the same weight at every Level, and a fall back comes first.

**4. Coupling.** The hours table times the reference kill rate gives the kills for a Level, which sizes every kill's pay (section 7). The hunted hours in a day turn hours into days, and that is the designer's input (package 9).

**5. Validation.** A career run of the reference company from Level 1 to 400, and the scale test past it.
- **Proves it wrong:** the reference company's hours to a Level leave the table by more than the tolerance at any checkpoint. With the pay derived from the table this can only happen if the reference kill rate drifts with Level, which is the scale test failing.

## 6. Monster power

**1. Behavior needed.** Monsters differ by the question they ask (principle 4). Six roles (package 3). No monster has its own math. A Danger step means the same strength on any ground.

**2. Model families.**

| Family | Shape | Tradeoff |
|---|---|---|
| Hand rows | each monster typed | 118 of 190 are typed today, and a monster's damage depends on its art tier (EVIDENCE: `44` section 1) |
| A formula in Level with fits | health = 4.95 + 1.76 a Level, times a role, times a ground fit | Today's better half. But the line is typed, so it only tracks hero damage by luck, and each ground needed a fit |
| **Derived from the reference company** | a role is a row of times and shares. The step supplies the scale | A monster is content plus a role. Nothing to re-fit when a hero formula moves |

**3. Recommendation.** A monster is a step and a role. A role row holds:

- **Seconds to kill** for the reference company at a gap of zero. Its health is derived from that.
- **Pressure:** the share of the target's reference health it deals a second at a gap of zero.
- **How the pressure arrives.** The share that is steady blows and the share that comes as wind-ups a bar can answer. An unanswered wind-up is the spike that kills. So death risk has its own two levers, how often and how big, apart from the steady pressure that sets the supply bill.
- **Reach:** who it hits. The front, the back row, an area, the weakest hero.

A ground is a mix of roles and at most one rule from the shared table. An encounter is sized to the party, which replaces the "party ground" fit of 2.5 times the health and 0.75 times the blow.

**Threat that grows.** One lever on a role, `rampPerMinute`: its pressure grows through a long fight. A boss with a ramp tests damage and sustain together. Four damage dealers lose to the pressure, and a tank with two healers loses to the ramp. This is the shared mechanic behind "a boss is a bar check", and it replaces the hall number on health that rewarded four damage dealers in 8 of 8 fights (EVIDENCE: `review/10-designer-d9-halls.md` 2.1).

Levers: for each of six roles, seconds to kill, pressure, wind-up share and reach. Those are content rows that the designer owns. The global levers are `encounterPerHero`, `rampPerMinute` by encounter type, and wind-up size and frequency scales. Four.

**4. Coupling.** Role seconds and the fight share (section 8) fix the reference kill rate, which sizes pay (sections 5 and 7). Reach sets the front hero's share of damage, which decides whether the back seats' defense is worth anything.

**5. Validation.**
- The front hero's share of damage is a designed number for each mix, and it is measured. Today it reads 92 to 100% on nine of fourteen grounds (EVIDENCE: `12-balance-pass.md` 4.1).
- On each ground mix a different lineup should hold deepest. No lineup wins every mix (candidate STYLE-3, no reader today).
- **Proves it wrong:** one role mix that every lineup holds equally deep. That mix asks no question.

## 7. Experience and party rewards

**1. Behavior needed.** Depth pays, in everything (package 3). XP and coin use one rule, and a good four earns each hero more than hunting apart, in gold as well as XP (package 4). A lower hero catches up. An outgrown ground fades without a special rule.

**2. Model families for what a kill pays.**

| Family | Shape | Tradeoff |
|---|---|---|
| A power of monster Level times its health (today) | XP = a x Level ^ 0.4 x health, times 15 ground fits | No term for how fast monsters die, so every ground got a hand correction (EVIDENCE: `44` section 1, violation 2). Depth pays a shrinking share at high Level |
| A Level difference table with a gray Level (SURVEY: TrinityCore) | full pay near your Level, a straight fall below, zero at gray | Clear to players. But it has a hard edge at gray and a cap above that is chosen by hand |
| **A ratio for each step of the gap, with a ceiling** | pay = reference pay x payStep ^ gap, the gap held to a ceiling above | One curve does catch-up, outgrown grounds and depth pay. Smooth everywhere |

**3. Recommendation.** One pay rule.

- **A kill's pay is one bundle.** Level XP, coin and loot quality all read the same step through the same chain: step, then encounter type, then event. A currency that needs to differ gets its own ratio (`payStepXp`, `payStepCoin`, `payStepLoot`) and nothing else. Tension K-8 exists because coin had no tier term and no party term at all. Under one rule a party's gold follows its XP by construction.
- **`payStep` must beat the cost of going deeper.** One step deeper makes a kill take about `powerStep` longer and cost more sustain. Pay must grow faster than that, or the best plan is to stay shallow. So `payStep` is `powerStep` times a premium, and the premium is the lever that says how much risk is worth.
- **A ceiling on the gap that pays** (`payGapMax`). Without it a strong hero could carry a new one through monsters 200 steps up. With it, catch-up is fast and bounded. It replaces the under-floor share rule and the Level-keyed party cut.
- **No party table.** The party shares a kill evenly. A good four earns more a head because it holds deeper, and that is the reason to group. A flat bonus by size is a number that says "group up" in place of a reason. Keep one lever, `partyPay`, at 1.0, in case measurement says a four does not hold deep enough to pay for itself.

**What power is worth, in one line.** With pulls on readiness, a company with one more step of all-round power holds one step deeper at the same kill rate, so it earns `payStep` more. COMPUTED: at a `payStep` of 0.7%, a gear tier of 20 steps is worth about 15% of pace, at Level 20 and at Level 2,000. Gear, a Trait, a buff and the paid edge all get the same sentence: how many steps, so how many percent. `12-balance-pass.md` section 4.2 asked for exactly this frame.

Levers: `payStepXp`, `payStepCoin`, `payStepLoot`, `payGapMax`, `partyPay`. Five, replacing the party table, the tier XP dials, 15 XP fits, 11 gold fits and the floor rule.

**4. Coupling.** This is the main feedback loop of the game: power, then depth, then pay and better drops, then power. It is bounded by gear worn by Level (section 9) and by the hours table. The second loop is depth, then supply bill, then net gold, then gear. Both are closed loops, so they are tested on career runs and never on single cells.

**5. Validation.**
- A four against its heroes apart, each on its own best depth: XP a head and net gold a head both at or over 1.0 at every checkpoint (candidates PARTY-1 and PARTY-2. PARTY-2 has no reader).
- A hero carried by a company far above it must not level faster than the fastest fair path.
- **Proves it wrong:** a company whose best pace is not at its deepest holdable step. Then pay does not beat the cost of depth, and power is not being paid out.

## 8. Hunting efficiency

**1. Behavior needed.** Pace is set by the company, not by a respawn timer (package 3). Damage, defense and sustain each move the result.

**2. The model, which is an identity and not a choice.** An hour is kills times the seconds one kill costs:

```
seconds for a kill = fight + move + recover
```

A gain in damage shortens only the fight part. So the share of a damage gain that reaches pace is the fight's share of the time. Today a four on Normal kills in 0.14 to 0.41 seconds and waits about four seconds for the next monster (EVIDENCE: `review/08-designer-d3.md` 1.1), so the fight share is under 10% and damage is worth almost nothing. That is the respawn cap, stated as arithmetic.

**3. Families for how monsters arrive.**

| Family | Tradeoff |
|---|---|
| A fixed respawn for each ground (today) | The cap binds strong parties first. Power is worth least to those who have most |
| A respawn that follows clear speed | Removes the cap but keeps a timer to tune for each ground |
| **Pulls on readiness, with one global ceiling** | The time budget is the same design for every party size. One ceiling on kills an hour, as a ratio over the reference, guards against a degenerate plan |

**4. Recommendation.** Pulls on readiness. The reference time budget is a design target: the fight share on Steady (`fightShare`, a starting value near 0.6), with the rest split between moving and recovering. An encounter grows with the party (`encounterPerHero`), so a lone hero and a four have the same budget. Then the company climbs, so extra damage is spent on deeper monsters at the same kill rate, not on faster kills against a timer.

Levers: `fightShare`, `moveSeconds`, `killRateCeiling`. Three.

**5. Coupling.** The reference kill rate is the hub that `44` section 3.2 found sitting at the center with no formula. Here it is a designed number: 3,600 over the reference seconds for a kill. Drop odds, kills for a Level and the wage all divide by it.

**6. Validation.** A new reader: the fight, move and recover shares of hunted time.
- At a fixed depth, the share of a damage gain that reaches pace must be close to the fight share.
- With the climb on, a gain of ten steps of power must raise pace by about `payStep ^ 10`.
- **Proves it wrong:** the reference company's kill rate at a gap of zero differs between Level 30 and Level 300, or between a lone hero and a four, by more than the tolerance.

## 9. What the probes measured

Four patches under `tools/balance-program/redesign/patches/` and two side runs, each played by the matrix's own diff on a scratch copy. The matrix subset at Levels 30, 60 and 110, two seeds of one hour, the same dice before and after. The summary is `tools/balance-program/redesign/model-probes.json`, written by `model-probes.mjs`. These runs are on the overhaul's starting build and are evidence about model shape, never a baseline to protect. Two seeds of one hour is thin: read directions, not digits.

Cells read: the lone MID hammer and the standard MID four, on each tier. Deaths use the matrix's default rule, where a dead hero stands up again, so a death count here is a rate of dying and not a count of ended hunts. The lone hammer on Deadly at Level 60 already dies in the unpatched tree and is left out.

**Probe A. Hero damage times 1.25: how much reaches pace.** MEASURED.

| Cell | Seconds to kill today | Level XP an hour | Share of the gain that arrived |
|---|---|---|---|
| Lone hammer, Normal, Levels 30 / 60 / 110 | 3.8 / 4.7 / 6.7 | +12.5% / +12.1% / +13.7% | 0.53 / 0.51 / 0.58 |
| Lone hammer, Dangerous and Deadly | 11 to 17 | +13.5% to +20.8% | 0.57 to 0.85 |
| The four, Normal, Levels 30 / 60 / 110 | 0.14 / 5.8 / 0.44 | +0.1% / +5.7% / +1.3% | 0.00 / 0.25 / 0.06 |
| The four, Dangerous and Deadly, Levels 30 / 60 / 110 | 1.0 to 1.8 / 11 to 12 / 1.9 to 2.0 | +4.4 to 6.8% / +18.5 to 18.9% / +3.7% | 0.19 to 0.29 / 0.76 to 0.77 / 0.16 |

The lone hammer on Normal spends 0.58, 0.62 and 0.76 of its hour fighting (kills an hour times seconds to kill), and 0.53, 0.51 and 0.58 of a damage gain arrived. So the identity of section 8 holds on today's engine: the share that arrives is close to the fight share, a little under it. The four shows the other end. Where its kills take under two seconds it gets almost nothing from 25% more damage. Where they take 6 to 12 seconds, on the one ground of the three built for a party, it gets most of it. The time a kill takes is the lever, and today each ground sets it by accident.

**Probe B. Monster blows times 1.25: what incoming damage costs.** MEASURED.

| Cell | Level XP an hour | Store bill | Deaths in 1,000 hours |
|---|---|---|---|
| The four, every tier, every Level | 0.998 to 1.004 | 1.00 to 1.04 | 0, before and after |
| Lone hammer, Normal | 0.998 to 1.003 | none, before and after | 0, before and after |
| Lone hammer, Dangerous, Levels 30 / 110 | 0.998 / 0.994 | 1.79 / 1.69 | 0 to 746 / 0 to 1,695 |
| Lone hammer, Deadly, Levels 30 / 110 | 0.85 / 0.94 | 1.54 / 1.41 | 0 to 28,571 / 885 to 20,000 |

A quarter more incoming damage costs a four nothing it can see: no pace, a few percent of supplies, two to four points of low health. A lone hero on a harder tier goes from never dying to dying most hours. Nothing sits between those two results. Two side runs at times 1.08 and 1.16 (`mon-108.json`, `mon-116.json`, Levels 30 and 110) show how thin the line is. The lone hammer on Dangerous at Level 110 read 0, 735, 562 and 1,695 deaths in 1,000 hours at times 1.00, 1.08, 1.16 and 1.25. At Level 30 it read 0, 0, 0 and 746. So the whole edge fits inside a move of 8 to 9% of the blow, which is about 22 steps at a 0.35% step and close to one gear tier. At the first of those moves its typical low health went from 0.387 to 0.382 while its worst tenth of fights went from 0.291 to 0.244. Typical low health does not see the edge coming and the worst tenth does. The fall back of package 3 should read the tail, and the slope test of section 14 measures this width.

**Probes C and D. Rest at a tenth of today's rate.** MEASURED, and it corrects an assumption of mine.

| Cell | Level XP an hour, C over today | Typical low health, today to C | D over C: pace with blows times 1.25 |
|---|---|---|---|
| Lone hammer, Normal, Levels 30 / 60 / 110 | 1.00 / 0.99 / 0.98 | 0.92 to 0.53 / 0.91 to 0.52 / 0.90 to 0.50 | 1.01 / 1.00 / 1.02 |
| The four, every tier | 0.99 to 1.00 | down 0 to 4 points | 1.00 |
| Lone hammer, Dangerous, Levels 30 / 110 | 1.01 / 1.00 | 0.42 to 0.37 / 0.39 to 0.35 | 1.00 / 1.00, with deaths from 0 to 613 and 0 to 3,636 |

I expected slow rest to turn damage taken into lost time. It does not. The engine starts the next pull after a short regroup whether or not the hero has recovered, so a hero with slow rest hunts at half health at the same pace and begins to buy food (the lone hammer's store bill on Normal goes from nothing to a small one). The rest rate is a survival lever today and a dead lever for pace. By the test of section 13 that is a design finding and not a number: "damage costs time" needs a rule that a pull waits for the party to be ready, which is the pull on readiness of package 3. A slower number alone will not do it.

**The armor step, in pace.** MEASURED on the same runs, the lone hammer's MID kit against the same kit with armor one state back, on Normal. Today: 1.000, 1.003 and 1.004 at Levels 30, 60 and 110. With slow rest: 0.994, 0.998 and 0.985. An armor step is worth nothing in pace in either tree.

**What the probes say about the model.**
1. The fight share predicts what damage is worth. The model sets it by design. Supported.
2. Incoming damage has no price until it kills. The model prices it in supplies and time. The need is confirmed.
3. A slower rest rate does not create that price. The readiness rule does, and it is an engine change, not a lever. This changed section 3.
4. The margin signal must be the tail of low health, not its typical value.

## 10. Equipment

**1. Behavior needed.** A drop can change what a hero does (identity question 5). Plain gear is the floor. Rare gear rolls a Trait, a rule and not a number. Rolls are owned by the server (package 2). The owner's direction of 2026-11-21: randomness is welcome where it adds decisions, "+x percent" alone is dull, and a rare drop must be a moment.

**2. Model families.**

| Family | What varies | Decisions | The must-have risk | Verdict |
|---|---|---|---|---|
| Flat steps | Nothing. A tier is a tier | None. The server can pick the upgrade for you | None | The floor only. This is plain gear |
| Number ranges on every stat | The size of each stat | One: is the number higher | Total. The top of every range is the one best roll | Rejected, as the designer did |
| A pool of stat affixes with groups, weights and Level gates (SURVEY: the Path of Building schema) | Which stats a piece carries | Real at first, then solved once | High, unless every affix spends one budget | Useful as a schema, not as the main shape |
| **Rule Traits with a rank, drawn from a pool that belongs to a source** | Which rule, and a rank of 1 to 3 | Is this rule right for this hero on this ground | Low, if the budget and the dominance check below hold | **Recommended**, with `02-architecture.md` |

**3. Recommendation.** The designer's five parts of a piece stand. The math underneath:

- **A base is an item Level.** It feeds the rating at its slot's weight (a table that sums to one). A tier is a fixed number of steps, so a tier is the same share of depth at every Level. Gear is worn by Level, so a kit can never run far ahead of its hero (`wearAhead`, in steps).
- **Every kind of gear power is counted in steps.** A Trait of rank r is worth a stated number of steps on the ground and seat that suit it best (`traitSteps` for ranks 1 to 3). Temper is steps. An imbuement is steps against one damage type. Then one sentence prices all of it: steps times `payStep`.

**How much variance is good.** State it in steps, as three rules.

1. **No variance in the base.** A plain upgrade is better in every way and is worn without asking. A size roll on the base would bring back the number chase the owner called dull.
2. **Rank is a small range.** The spread from rank 1 to rank 3 is under a third of a tier (about 6 steps on a 20 step tier). So a rank 3 Trait on an old base loses to a rank 1 Trait on the next tier within one tier. Which Trait matters more than how high.
3. **A whole kit's luck is bounded.** A lucky kit against an unlucky one at the same Level and hours: at most one tier of difference at the 10th and 90th percentile (`kitSpreadMax`, about 20 steps, so about 15% of pace). Enough to be a story. Not enough to split the player base.

**How rolls scale with Levels and tiers.** They do not need to. A Trait's size is steps, and a step is the same ratio at every Level. A rank 2 Trait is worth the same share of depth on a Level 30 ring and a Level 900 ring. New regions add new rules to the pool, not bigger numbers. Drop odds are authored in hunted hours and divided by the reference kill rate, so "one Trait piece about every N hours" also holds at every Level.

**How to keep a roll from becoming a must-have.** Five mechanical guards. The first three are the designer's rules stated as math.

1. **Equal budget at best case.** Every Trait of a rank is sized on the cell where it is strongest, to the same steps. The sizing is measured on the engine, never estimated.
2. **Conditional by construction.** A Trait's "when" must be false often enough that its worth averaged over all grounds is well under its best case (`traitAverageShare`, a ceiling near one half). A rule that is always on is a number.
3. **No stacking.** Steps from Traits of the same key take the largest, and party-wide Traits do not stack. All conditional steps on a hero sit under `conditionalStepsMax`.
4. **The dominance check.** For every slot and seat, across every ground mix, the share of cells where one Trait is in the best kit. No Trait over a set share, and every Trait best somewhere. This is a standing reader, and it runs before any Trait ships.
5. **Pity on the rare roll** (SURVEY: pseudo-random distribution). The chance rises with each miss so the long-run rate is the stated one. It narrows the gap between a lucky and an unlucky player without changing the average. One lever, on or off, for each rarity.

**What the simulator needs to play rolled gear.** Today the matrix plays three fixed kits, LOW, MID and BIS. With rolls there is no single best in slot. Four pieces of work:

1. **The roll tables as data, and one pure roller in `src/core`.** Seeded, the same function the server's settle calls. The simulator calls the same code. A second copy of the roller would be a second engine.
2. **A kit sampler.** Given a Level, the hours hunted on a ground and a keep rule, it plays the drops and returns a kit. Run it many times for a spread of kits.
3. **Percentile kits replace the three states.** The 10th, 50th and 90th percentile kit by steps, plus named test kits (every slot one Trait, for the dominance check).
4. **Two kinds of noise, kept apart.** A cell's result now varies by fight seed and by kit sample. The design is kits times seeds, and the report gives both spreads. Otherwise a lucky kit reads as a balance change.

The sampler ranks kits by steps, which is a cheap stand-in. The check on that stand-in is rank agreement with the engine's depth held on a sample of kits. If the two disagree, a Trait's step size is wrong, and that is the calibration signal for guard 1.

Levers: slot weights (a table), `tierSteps`, `wearAhead`, `traitSteps` (three ranks), `traitAverageShare`, `kitSpreadMax`, `conditionalStepsMax`, and hours for each rarity. About nine.

**4. Coupling.** Rarity hours and personal loot set how many Trait pieces exist, which sets market prices (package 5). Carry-over lets a great roll outlive its base, so the supply of top rolls only grows. The economy model must count that stock.

**5. Validation.** The dominance check. The kit spread at each checkpoint. The hours to a first Trait piece, read at the 10th, 50th and 90th percentile (candidates DROP-2 and DROP-6. DROP-2 has no reader).
- **Proves it wrong:** one Trait in the best kit on more than the set share of cells after its size has been cut to the floor. That rule is a design problem, and the fix is its "when", not its number.

## 11. Loot and the economy

**1. Behavior needed.** Gold and goods leave as steadily as they arrive (identity question 6). Every price reads from a wage (package 5). Sinks scale with wealth.

**2. Model families for the faucet.**

| Family | Tradeoff |
|---|---|
| Coin per health point with ground dials (today) | Four stacked dials, and the 0.7 cut typed 11 times (EVIDENCE: `44` section 1). Gold in is a formula and every sink is a list that ends |
| A wage that is a straight line in Level | Easy to read. But "depth pays" fades at high Level, which is K-9 again in gold |
| **A wage on the step** | wage = base x payStepCoin ^ step. Depth pays the same share at every Level. Needs its own ratio so gold does not inflate as fast as XP grows |

**3. Recommendation.**

- **The wage is a formula the server can compute**, never a simulator output: coin a reference hour at a step. Every repeating price is stored as hours of the wage at the buyer's step. Blessings, the supply rows, Temper, carry-over, the market's listing floor.
- **`payStepCoin` is its own lever and likely smaller than the XP ratio.** COMPUTED: at 0.35% a Level 1,000 hero earns 33 times a Level 1 hero. At 0.7% it is 1,070 times, which would let one far player buy a whole early market. The search range is 0.2% to 0.5%.
- **Supplies are the standing sink**, sized as a share of gross coin for the reference company on each stance (`supplyShare`). The big sinks (Temper, carry-over, the hall) are priced in hours of wage, so each tier has its sinks by construction and none is a list that ends.
- **Loot is authored in hours.** A row says "one in about N hunted hours for a hero at this step", and its chance is N times the reference kill rate, inverted. Nobody types a chance. Composable groups (SURVEY: one roll that walks a group, with shared templates) keep the tables small.
- **The health check is a ratio, not a price:** gold destroyed over gold created for a server at day 30 and day 180 (`sinkOverFaucet`, a soft target near 0.85 to 1.0).

**The hunting day.** The owner's ruling of 2026-11-22: "Premium should also buy 2 hours of stamina, so 10 without premium 12 with." So the day is a set number, 10 hunted hours a hero without Premium and 12 with. It is no longer a lever.

**Bought time: hunting and town work, one rule.** The owner's rules of 2026-11-22. The hunting day stays and a hero can buy more of it (RD-Q2). Then: "Let's do the same thing with stamina that we are for labor, it can be bought, but it scales and pretty pricey." So town work past the daily cap can be bought too, the same way. Both are bought in blocks, both are priced in hours of the wage at the hero's Level so they are felt the same at Level 20 and Level 2,000, and both get dearer with each block of that kind bought that day.

```
price of a block (gold) = block hours[kind] x price per hour[kind] x wage(L) x growth[kind] ^ n
kind                    = hunting (stamina) or work (town labor)
wage(L)                 = wageBase x payStepCoin ^ L      the wage above, at the hero's Level
n                       = blocks of THAT kind this hero has bought this server day, 0 for the first
                          refused once n reaches the clamp for that kind, reset at the server's day
```

| Kind | Block hours | Price per hour, in hours of wage | Growth for each block that day | Clamp a day | What one hour earns back at the hero's Level |
|---|---|---|---|---|---|
| **Hunting** | 2 h (band 1 to 3) | 2.0 (band 1.5 to 2.5) | 1.5 (band 1.3 to 1.8) | 2, fixed (the owner's ruling) | About 0.75 hours of wage in coin |
| **Work** | 2 h (band 1 to 3) | 0.5 (band 0.4 to 0.6) | 1.5 (band 1.3 to 1.8) | 4 (band 3 to 6) | 0.25 hours of wage in goods |

**The hunting cap.** The owner's ruling of 2026-11-22: "Actually yeah let's cap it." A hero buys at most 2 hunting blocks a day, 4 hours, so the most any hero hunts is 14 hours a day, or 16 with Premium. The cap is not a lever. Bought town work keeps its clamp of 4.

**What an hour earns back, and why "pretty pricey" means at least the first block loses coin.** A reference hunted hour on Steady pays one hour of wage, and its kit takes 0.2 to 0.3 of that (`09-crafting.md` section 2.5), so it nets about 0.75. A work-hour makes 1 over `kitWork` hunted hours of kit (1.25 at 0.8), and the kit for one hunted hour is worth `kitWork` x `townWageShare` hours of wage (0.2). So a work-hour makes goods worth `townWageShare` x wage(L), 0.25 hours of wage, at reference prices (`09` section 4.3). Both starting prices are twice what their hour earns at reference, so the first block of either kind already costs more coin than it returns. A player buys XP, drops, remains, trade XP or a full stock, and never more gold. (COMPUTED. JUDGMENT for "twice".)

**Why the bands' floors sit where they do.** Hunting's floor of 1.5 sits above the gross coin a hunted hour pays (1.0 at reference), with room for a company that holds deeper than the reference on Bold. If the Lab finds a company whose coin an hour passes 1.5 times the wage at its Level, the floor rises. Work's floor of 0.4 sits above what a work-hour's goods fetch even at the store's ceiling (`storeCeiling` 1.5 x 0.25 = 0.375), so bought labor cannot print gold even when labor is short and prices are at their top. (COMPUTED.)

**At the starting values** (COMPUTED, hours of wage at the hero's own Level. The yardstick for both kinds is a full hunting day's net coin: 10 hours netting 7.5 without Premium, 12 hours netting 9.0 with it):

| Block that day | Hunting: price | Hunting: net cost | Hunting: running net cost | Share of a 10 h day | Share of a 12 h day | Work: price | Work: net cost | Work: running net cost | Share of a 10 h day | Share of a 12 h day |
|---|---|---|---|---|---|---|---|---|---|---|
| 1st | 4.0 | 2.5 | 2.5 | 33% | 28% | 1.0 | 0.5 | 0.5 | 7% | 6% |
| 2nd | 6.0 | 4.5 | 7.0 | 93% | 78% | 1.5 | 1.0 | 1.5 | 20% | 17% |
| 3rd | Refused | | | | | 2.25 | 1.75 | 3.25 | 43% | 36% |
| 4th | Refused | | | | | 3.38 | 2.88 | 6.13 | 82% | 68% |

Net cost is the price less what the block's 2 hours earn back (1.5 for hunting, 0.5 for work). A third or fourth hunting block in a day is refused by the cap. Two hunting blocks cost 10.0 hours of wage in all, 7.0 net (9.2 at growth 1.3, 11.2 at 1.8), and four work blocks 8.1. Both are equally pricey for what they buy, twice its worth at the start. Work only looks cheaper as a share of the day because a work-hour is worth a quarter of a hunted hour. So the first hunting block costs a third of a day's net coin and the second nearly a whole day's, which is where the cap stops it. A free hero who buys one hunting block hunts as long as a Premium hero's own day, for 4.0 hours of wage (2.5 net). That is the gold sink that grows with wealth which `09-crafting.md` section 5.6 says crafting alone cannot supply.

**Bounds both kinds share.** The per-kind clamp and the growth factor. One clock: bought time is real time on the server, a hero cannot hunt and work at once, so a hero's hunted, worked and bought hours never pass the hours in a server day. A Premium hero's own day is already 12 hunted and 10 worked at the starting values, so it has about 2 hours left to buy into. No power: a bought hunting hour gives what any hunted hour gives, and a bought work-hour makes goods at the same yield, quality and speed as any other, inside the kit spread limit. Faster, never higher: bought work trains trades sooner, and the cap at 99 and the three Masteries hold.

**What it moves elsewhere.** Bought hunting raises the coin minted, the kit burned and the labor ratio. Bought work lowers the labor ratio and deepens the band markets. Premium does both and they cancel: 2 more hunted hours ask for 1.6 work-hours of kit (2 x `kitWork`), and 2 more work hours give 1.6 (2 x 0.8 used). As a what-if on `09-crafting.md` section 5.3: the fifth of heroes who hunt the longest buy two hunting blocks, a third of heroes are on Premium and use both its extras, and a tenth buy one work block. The ratio on the mix moves from 0.75 to about 0.84, inside the 0.8 to 1.0 the crafting design wants. Re-checked under the hunting cap of 2: the what-if already bought two blocks, so 0.84 stands (COMPUTED: mean hunted 6.0 + 0.8 + 0.67 = 7.47 hours over a mean work day of 8 + 0.67 + 0.2 = 8.87). Tools that wear out add a twelfth to the labor asked for, which puts it near 0.92 (`09-crafting.md` section 3.7). At these prices fewer will buy than that, so the real moves are smaller. (COMPUTED. SPECULATIVE on who buys.)

**The server shape.** One rule and one call for both, paid in gold. The client sends one intent, "buy a block of hunting (or work) for this hero". The server reads the hero's Level and that kind's count from its own rows, prices the block on its own clock, refuses past the clamp, debits the gold, adds the time and writes a ledger row. A plan may hold a standing limit for each kind, in blocks and in price, and the same call honors it, so nobody buys by hand every day. Crowns reach it only through gold bought from players, the same channel as the flame's bought fuel. It is one money surface, flagged once for the pre-launch Security review.

**Proves it wrong:** any block, the first included, that returns more coin than it costs for any company the Lab finds, at any Level. Or a purchase pattern most players reach that moves the labor ratio on the mix by more than 0.1 either way.

**Talent resets.** The rule of `02-architecture.md` section 1b, in the same units. A hero drafts changes for free and pays once when the draft or a saved build is applied.

```
price of a reset (gold) = resetHours x wage(L) x resetGrowth ^ n
n                       = resets this hero has paid for this server day, 0 for the first
```

| Reset that day | Price, hours of wage | Share of a 10 h day's net coin (7.5) |
|---|---|---|
| 1st | 0.5 | 7% |
| 2nd | 1.0 | 13% |
| 3rd | 2.0 | 27% |
| 4th | 4.0 | 53% |

`resetHours` starts at 0.5 (band 0.25 to 1) and `resetGrowth` at 2 (band 1.5 to 3). It grows with Level through the wage and with each reset that day through the growth, so a plan that switches builds once a day for its ground pays a small steady price and one that thrashes pays a lot. A new hero's first reset is free. With Premium each hero's first reset of the server day is free and is not counted, so the next is priced as a free hero's first. A reset moves points and never adds one, and the gold is burned, so it is a sink that grows with Level. (COMPUTED.)

**The Crowns book as a sink.** The book moves gold between players and mints none. Its fee, 1% to list and 4% of the gold on a sale (band 3 to 10%), is burned, so every Crown sold for gold is a gold sink that grows with the money players bring. A seller at the weekly cap moves about one account-week of wage, 280 hours of wage on a 10 hour day, and burns about 14 of them. It counts in `sinkOverFaucet` like the market tax. The Crown's gold value is anchored by Premium's hours: the same hours bought as first blocks cost 20 hours of wage an account-day, about 600 a month (`10-premium.md` section 4). (COMPUTED.)

Levers: `wageBase`, `payStepCoin`, `supplyShare`, the tax pair, and price rows in hours (content). Five global, the levers of bought time (four for work and three for hunting, whose cap of 2 is ruled, so seven), `resetHours` and `resetGrowth`, and the book's fee pair.

**4. Coupling.** Supplies link combat to gold (section 3). Personal loot multiplies drops by seats, so odds are per hero. Trait pieces and carry-over are the top of demand. The market is players' prices, which no formula sets, so the model treats it as a range.

**5. Validation.** Two tools, and the second does not exist.
- The engine gives rates: coin, supplies and drops an hour at each step and stance.
- An account-day and server-day model turns rates into stocks. It must run on the engine's measured rates and nothing else. For player prices a small agent model with price beliefs (SURVEY: bazaarBot's shape) gives a range. It is a model of people, not a second combat engine, and its output is labelled as such.
- **Proves it wrong:** gold held per account that grows without limit in days of income at any server age. Or a tier where the reference company cannot afford its supplies on Steady.

## 12. The shared architecture

**One pipeline.** Every amount in the game goes through one function with four stages, in a fixed order, and each stage can be traced:

```
1. base share        from the move's row in the rule table
2. x s ^ gap         the two ratings, with every active conditional step added
3. x the roll        one spread
4. x reference scale the display curve of the target's Level
```

Rounded once, at the end. A blow, a spell, a tick, a heal, a shield and a monster's blow are all this. The pay pipeline has the same shape: reference pay, times `payStep ^ gap`, times the encounter type, times the event.

**No exceptions for content.** Content is rows: a monster is a step and a role, a ground is a mix and at most one shared rule, a move or a Trait is a row with a size in steps and a "when". The register of levers refuses a balance number keyed by a ground, a monster or an item id. The 15 XP fits, 11 gold fits and 13 tier rows of today have no place to live.

**The lever set.** About 40 global coefficients, in eight groups.

| Group | Levers | Count |
|---|---|---|
| The step | `powerStep`, `weightGear`, `weightSkill`, early bonus (two) | 5 |
| The contest | `rollSpread`, `conditionalStepsMax`, the armor and ward split by weight (three rows), base miss if kept | 6 |
| Sustain | `sustainFree`, `sustainHealer`, `manaSeconds`, `manaRegen`, `restRate`, supply price | 6 |
| Monsters | `encounterPerHero`, `rampPerMinute`, wind-up size, wind-up frequency | 4 |
| The hunt | `fightShare`, `moveSeconds`, `killRateCeiling`, three stance triggers, climb and fall counts | 8 |
| Pay | `payStepXp`, `payStepCoin`, `payStepLoot`, `payGapMax`, `partyPay` | 5 |
| Progress | `levelHoursCeiling`, `levelHoursHalf`, early floor, `skillPace`, `skillCatchUp`, `deathHours` | 6 |
| Gear and gold | `tierSteps`, `wearAhead`, `traitSteps`, `traitAverageShare`, `kitSpreadMax`, `wageBase`, `supplyShare` | 7 |

Beside them sit content tables the designer owns and the optimizer never moves: six role rows, slot weights, move and Trait rows, price rows in hours, rarity hours.

**The step ledger.** `02-architecture.md` asks the math lane to reserve slices of the power step before any target is written. Because every source of power is counted in steps, the ledger is one table that must add up.

| Where a hero's steps come from | Kind | Lever |
|---|---|---|
| Level, skill and gear | Always on. The rating | The weights. They sum to one |
| Talent points spent on moves (package 1b) | Always on once spent. A share of each Level's step arrives through the point, so a spent point puts a hero on the curve and not above it | `pointShare`, taken out of the Level's weight. The designer's starting guess is a third |
| Traits, one on a Rare piece and two on a Very Rare | Conditional | A slice of `conditionalStepsMax` |
| Move ranks and branches, imbuements, food | Conditional | A slice each |
| Clan buffs | Conditional | A reserved slice |
| Event and arena rewards | Conditional | A reserved slice |

The slices are levers and their sum is the ceiling. The ceiling times `payStep` is the most any company can be ahead of a plain one at the same Level, and the slices a player can buy with gold give the size of the paid edge the same way. A new source of power takes its steps from a slice or is refused. The flame of section 2b moves how often a Rare drops and its rank. It is luck and not steps, so it sits in section 10 under `kitSpreadMax`.

**Premium has no row.** Nothing Premium sells adds a step. Its hours change how many hours a day a hero hunts and works, never what an hour holds, and bought blocks are the same. So they are read in days, not steps. The Lab reads the days the reference company takes to cross a band four ways: free (10 hunted hours a day), Premium (12), free with two bought blocks (14), and Premium with two (16). As plain division that is 1.0, 0.83, 0.71 and 0.63 of the free days (COMPUTED). The Lab replaces it with runs, since a longer day also burns more kit and reaches the flame's room sooner. Ladders read inside Level bands, so these days move a company's band and never its rank inside one (`02-architecture.md` package 7).

**How they become a lever set the optimizer can move.** The registry of `lane/bl-levers` (`tools/balance-program/levers.mjs`) already holds each lever's site, range, class and how the simulator perturbs it. Three additions:

1. Each new coefficient lives in one data module with a named binding, so the registry's check claims it and a second copy is a red.
2. Each row gains `search: true or false` and its range. The optimizer moves only rows that are global, searchable and not derived. Content tables are frozen during a global calibration.
3. Each row names the readings it is expected to move. A lever that moves a reading outside its list is flagged, the way the matrix's diff already flags an untargeted band.

**Engine changes, sized.** S is a data change, M one lane, L an engine batch, XL a new server surface. JUDGMENT on every size. None is started here.

| # | Change | Size | Notes |
|---|---|---|---|
| 1 | The amount pipeline with ratings, the gap and a trace | L | Replaces the body of `hurt`, the hit and armor chains. The trace closes the "a blow cannot be explained" gap. Written with no side named, so heroes against heroes needs no second pass later (sides are fixed in 93 places today) |
| 2 | Monsters derived from role rows | M | A generator, as `formulaStats` is today. Removes the hand rows |
| 3 | Danger steps, pulls on readiness, the climb and the fall back | L | Hunt state in the settle. Must play the same viewed or closed, so it is engine state and never client state |
| 4 | Reach, rows and wind-ups | L | The designer's package 1 and 3 batch. The math needs the wind-up to be a unit state the trace can see |
| 5 | Sustain counters and the reason a hunt ended | M | Counters in the session row. No new statement per kill |
| 6 | One pay chain, and progress stored as a Level and a share | M to L | Touches the Level curve in SQL, the ledger and every reader of total XP. A money and ranking surface |
| 7 | Skills on time parity | M | Data and one SQL curve |
| 8 | Trait pieces as rows, the roller, single listings | XL | The designer's package 2. A trade surface with its security review |
| 9 | The wage and prices in hours | M | SQL computable from generated rows, as the Level curve is today |

Server cost: nothing here adds a database statement per kill or per settle. The contest is one table lookup for `s ^ gap` in whole steps. Trait rows grow with rare drops only.

## 13. Design problem or number problem

A red reading is one of two things, and the response differs. A number problem gets a lever moved. A design problem gets a mechanic changed. Five tests tell them apart, and each can be run.

| Test | How it is run | It is a design problem when |
|---|---|---|
| **No feasible point** | The search finds no lever values inside their ranges that pass every hard constraint | The constraints conflict under this model |
| **Out of reach** | The sensitivity matrix gives how each reading moves with each lever. Project the move the targets need onto what the levers can produce | A large part of the needed move lies outside it. Two readings that every lever moves together cannot be moved apart. K-8 and K-9 are both this |
| **Structured leftovers** | After the best fit, look at what is still off, by Level, ground, party size and style | The misses line up along one of those. Only a number for that content could fix it, and those are not allowed |
| **Knife edge** | Read how wide the range of a lever is in which a target holds | It is narrower than the noise, or than a 5% move. The old Deadly death band was this: one cell in 56 landed inside it |
| **Dead lever** | A lever's row of the sensitivity matrix | Nothing moves. The mechanic behind it is dead, as armor past Level 30 was |

A reading that passes all five is a number problem and goes to the search.

**When one combat style underperforms.** The request lists ten places the cause can sit. Each has one home in this model, and the sensitivity matrix read by style says which one is live before anything is changed.

| Where the cause can sit | Its home here | Layer |
|---|---|---|
| Weapon coefficients | The base shares of the family's move rows | Content row |
| Skill scaling | `weightSkill`, `skillPace` | Global |
| Spell mechanics, cooldowns | The move's row: size, cooldown, cost, "when" | Content row |
| Resource sustainability | `manaSeconds`, `manaRegen`, the move's cost share | Global, then row |
| Equipment progression | Slot weights, the Trait pool the style can roll | Content table |
| Targeting behavior | The reach rules and the style's own targeting rule | Shared rule |
| Monster resistances | The armor and ward split of the roles on the grounds where it trails | Role row |
| Encounter composition | The ground's mix | Content |
| Party synergy | Which party-wide rules it brings, and that they do not stack | Shared rule |

The order of work is fixed. First check whether the style trails everywhere or only on some mixes. Trailing on some mixes is the design working, since a style is meant to be strong where its problem is common. Trailing everywhere is checked against the global levers first, then the family's rows. A number that exists only for that style on one ground is never written.

## 14. Validation and calibration

**One engine.** Every reading comes from `src/core/combat-sim.js` through the settle, the way `tools/balance-sim/cell.mjs` plays it today. Three things sit beside it and none is a second engine: a search method that only chooses lever values, a statistical surface that only proposes where to look next, and the account and market model of section 11 that turns engine rates into stocks. No number is reported or shipped from a surface. It proposes, and the engine decides.

The tool that runs this method is designed in `07-balance-lab.md`, which waits on this page for its formula families. Sections 2 to 11 and 15 name them. This section is the method, and that page is the machine.

**What exists and what is missing.** The measuring program gives a pinned baseline with scenarios and per-seed outcomes (`lane/bl-baseline`), the lever registry (`lane/bl-levers`), a sensitivity lane, and 100 candidate targets (`targets.json`). That baseline describes the starting build. It is evidence and a regression harness. The new model gets its own pinned baseline the day its engine batch lands.

Readers and runners the method needs that do not exist yet:

| Missing | Used by |
|---|---|
| Healing by source against incoming damage, per seat. The healer's mana floor. Why a hunt ended | Section 3. Candidates SUST-1 to SUST-4 |
| Depth held and the margin signal the fall back reads | Sections 7 and 8. Replaces the tier order check (SURV-6) with "deeper is never safer" |
| The fight, move and recover shares of hunted time | Section 8 |
| A blow trace: which stage took what | Section 12. Every explanation of a result |
| The scale test past Level 400 | LONG-1 and LONG-2 |
| A career runner: many hunts in a row with the purse, the kit and the Level carried forward | Sections 4, 5, 7 and 11. Every closed loop |
| The kit sampler and the Trait dominance reader | Section 10. DROP-2, DROP-4, GEAR-15 |
| Lineup dominance across ground mixes | STYLE-3 |
| A four's net gold a head against its heroes apart | PARTY-2 |
| Boss and hall rooms as cells | SURV-15 to SURV-17, STYLE-12 |
| The account-day and server-day model on engine rates | Section 11 |

**The stages.**

| Stage | What happens | Output |
|---|---|---|
| 0. Model acceptance | Before any tuning: the scale test, the slope test and the weights test below, on a thin slice of the new pipeline | The model is fit to tune, or it goes back to design |
| 1. Normalization | Each "scale" lever has one reading it sets and the relation only goes one way. Solve them one at a time by bisection on the engine: role seconds, pressure, the fight share, the sustain shares | The reference company meets its reference times. Nothing is searched |
| 2. Baseline | Pin the scenario set and play it | The new model's baseline |
| 3. Sensitivity | Screen all levers cheaply (SURVEY: Morris), then a fuller reading on the ten or so that matter (SURVEY: Sobol), by Level, party, stance and style | The sensitivity matrix, with dead levers and the tests of section 13 |
| 4. Interactions | A two-level factorial on the levers that matter, and the two feedback loops on career runs | Which levers must move together |
| 5. Search | Hard constraints as a pass or fail. Soft objectives as a set of best trade-offs, not one score (SURVEY: Pareto search). A surface proposes candidates and the engine plays every one | A short list of candidate sets, each with what it gives up |
| 6. Global regression | The chosen set on the whole scenario set, on seeds the search never saw, beside the baseline. An adversarial review | The calibration proposal, before and after |

Screening and a low-discrepancy sample are about a hundred lines each in Node and can live beside the matrix. The search tools are Python. They run on GitHub, which is where heavy runs go anyway, and only ever write lever values into a patch the matrix plays.

**The three acceptance tests of stage 0.** They test the model, not the numbers, so they come first.

1. **Scale.** The reference company at a gap of zero at Levels 30, 300 and 3,000. Seconds to kill, lowest health, the fight share, the supply share and the share of a Level per hour must agree within noise. This one test stands in for "works at unlimited Levels", and it needs no content past Level 185 because nothing in the model is typed by Level.
2. **Slope.** Sweep depth in single steps from safe to wiped. The result must degrade in order: the supply bill rises, then pace falls, then fall backs begin, then deaths. Measure the width of the edge in steps from the first fall back to a certain wipe. It must be wider than the largest single power step a player can take (one gear tier), so no single upgrade moves a company from safe to dead or back.
3. **Weights.** Ten steps of offense, defense and sustain on each seat, by finite difference. Each must move depth held on some ground mix. The ratios between them set the exchange rates that Traits and gear are budgeted with.

**Hard constraints and soft objectives.**

- A **hard constraint** is a rule that must hold: the mission lines, the scale test, "deeper is never safer", "no Trait dominates", "a four out-earns its heroes apart". It is judged with its noise: it passes only when the whole confidence interval is inside the rule. A candidate that fails one is rejected whatever else it gains.
- A **soft objective** is a range the design prefers, such as hours to a Level or the supply share. Each is scored by how far outside its range it sits, in units of the range's width. Objectives are never added into one number, because the weights would be a hidden design decision. The search returns the set of candidates where no objective can improve without another getting worse, and the designer picks.
- A reading whose interval straddles its line is **unresolved**, not passed and not failed. It gets more seeds, up to a stated budget, and is then reported as unresolved.
- A target is never moved to make a candidate pass.

**Noise.**

- **The same dice.** Every comparison plays the same seeds before and after, as the matrix does now. Most seed noise cancels in the difference.
- **Every cell carries its own spread.** Per-seed outcomes, a mean and a standard error, as `lane/bl-baseline` records them.
- **Deaths are counts.** COMPUTED: telling 50 deaths from 100 in 1,000 hero-hours needs about 470 hero-hours in a cell if deaths are independent. They are not, because a four dies together, so it needs about four times that. One baseline cell is 128. So death rates are read on pooled cells, and the model is calibrated on the margin signal instead. Lowest health in a pull is a continuous reading with far more information an hour than a death count. Deaths confirm it on the pooled sample.
- **Two layers once gear rolls.** Kits times seeds, with the two spreads reported apart.
- **Holdout seeds.** The search sees one set of seeds and the final regression plays another. With a hundred targets and thousands of cells some will pass by chance on any one set.

## 15. Source families the Lab can play against each other

The owner's direction of 2026-11-21: build the best combination of formulas from the open versions of the big games. This section names, for each domain, the strongest source model and where two sources joined beat either alone. Each row is a candidate family for the Balance Lab to play on our one engine against the recommendation of this page.

**The hard rules.** A source gives a mechanic or a formula shape as an idea. We rebuild it as our own named function in our engine. We never take a name, text, art or a data table. Code under the GPL is never copied, and data mined from a commercial game is never used. Everything below is SURVEY for the shape and JUDGMENT for the verdict. I did not read the sources.

| Domain | Strongest source model | Why it is strong | Its weak point for us | The better join |
|---|---|---|---|---|
| Defense | The ARPG calculators' armor against hit size | Makes heavy armor good against many small hits and weak against one big one, so "what hits me here" becomes a gear question | Multi-hit and one-hit moves need separate sizing, and it has no Level term | **Step contest for the scale, hit size as a role.** Our contest keeps every Level even. A monster role or a Trait can then carry "strong against small hits" as a rule. That gets the question without the drift |
| Defense, the alternative | The MMO emulators' armor against the attacker's Level | A plain percent the player can read. Fights of the same Level stay even | It is today's family and it needed a cap | Play it uncapped beside the step contest. If the two read the same inside a 60 step gap, keep the simpler text |
| Hit chance | The ARPG accuracy against evasion ratio | Gives a real evasion build | A second contest on the same stats | **One contest, with evasion as a defense style.** Evasion becomes a rule: a share of blows avoided, paid for with fewer armor steps. A build without a second stat race |
| Skill progression | The OpenTibia servers' skill by use | The identity of "a hero is what it uses". Proven over decades | Geometric cost, so skill fades beside anything linear | **Tibia's rule, our clock.** Keep gain by use. Replace the geometric cost with time parity so skill stays worth its weight. From the UO servers take one idea only: the guaranteed-gain timer, so no session goes without a gain |
| Level curve | The OpenTibia servers' cubic total XP | Unbounded, simple, and familiar to this audience | A Level takes ever longer, and so does everything counted in Levels | Play cubic against rise-then-level-off on a career run to Level 1,000. Judge by hours between upgrades, not by the look of the curve |
| Kill XP | The MMO emulators' XP by Level gap with a gray Level | Players understand "gray gives nothing" at a glance | A hard edge and a hand-set cap above | **Our smooth ratio, their words.** Pay follows `payStep ^ gap`. The screen shows it in their plain bands: full, reduced, almost nothing |
| Loot | The OpenTibia servers' chance for each item on each monster | Every drop has a home. The bestiary can show it. It is the "drop is a story" model | No structure for rarity or for rolls | **Tibia homes with ARPG items.** Where a thing drops is Tibia's model: a monster family owns its rows and its Trait pool. What the thing is comes from the ARPG side: rarity tiers and rolled properties. The owner named this join, and it is the one this page recommends in section 10 |
| Item rolls | The ARPG affix schema: groups, weights, item Level gates | The cleanest known way to make a roll table that cannot produce a broken item. One row from each group, weights by item type, gates by Level | Stat affixes get solved once | **Their schema, our content.** Use groups, weights and gates as the data shape for Trait pools. Fill it with rules, not stats. A gate is a step, so a pool grows with depth |
| Items that change skills | The Diablo-style idea of an item property that changes how a move works | The strongest known source of "this drop changes my build" | Needs each one written by hand | This is the Signature of package 2. Join it with the rule table so a Signature is a row with a "when", not custom code |
| Sets and rune combinations | Diablo-style sets and recipes | A long chase made of many small finds | Sets push every hero to the same kit | Candidate only. Play a small set as "two Traits that are stronger together" under `conditionalStepsMax`. If it wins the dominance check it ships. If it flattens kits it does not |
| Magic find | Diablo-style find chance as a stat | A reason to trade power for luck, which is a real decision | Becomes a must-have if it scales the best drops | **Find as steps given up.** A find Trait spends the same budget as a combat Trait. Join it with pity so luck narrows, and with Tibia's homes so find only helps on the ground you chose |
| Imbuements and spell upgrades | The OpenTibia servers' timed imbuements and upgraded spells | A consumable layer of power made from monster parts, which ties hunting to crafting | Flat percent sizes | Keep the mechanic and size it in steps against one damage type for a set number of hunted hours |
| The build layer | The ARPG passive tree, and Diablo-style skill trees | Long-term choices with a cost to undo. Thousands of hours of planning | Stat nodes measured as too small to feel, and a tree on its own screen is a second place for a build to live (`02-architecture.md` section 1b rejects it) | **Their commitment, on our moves.** Package 1b keeps Talents as ranks and branches on the moves a hero slots, a point every Level. The idea worth taking from the trees is that a choice closes others. A branch is a rule row with a step budget from the ledger of section 12. The Lab plays five allocations a way, as 1b says, and the tree shape stays a rejected candidate unless that reads flat |
| Offline play | The idle games' capped-tick catch-up | Cheap server time for long absences | Larger steps change outcomes, which breaks "the same viewed or closed" | Not for combat. Our settle already walks the same swings at any cut. Keep the idea for town work only, which is closed form today |
| The market | The agent market with price beliefs | A way to test whether a price settles before players arrive | A model of people, not of the game | Use it as the range finder of section 11, on engine rates |

**Where the joins matter most.** Three of them carry the design. Tibia's skill by use on our clock (section 4). Tibia's drop homes with ARPG rolled items (section 10). Any source's readable contest on our step, so it holds at every Level (section 2). In each case the source gives the feel and our step gives the scaling.

**How the Lab plays them.** Each family is one patch against the same scenario set and the same dice, read with the acceptance tests of section 14. A family that fails the scale test is out whatever its feel, because it will need a table typed by Level. A family that passes is judged on the slope test, the weights test and the dominance check, and then by play.

## 16. What is settled, what is not, and what I did not check

**JUDGMENT, argued on this page:** the step as the unit. The contest. Targets as times and shares. Pay as a ratio for each step. Hours for a Level that level off. Progress stored as a Level and a share. One hit contest and not two.

**Settled by the owner, 2026-11-22:** the hunting day stays, at 10 hours a hero, 12 with Premium. More hunting and more town work can both be bought with gold, at the one price rule of section 11, hunting at most 2 blocks a day (14 hours at most, 16 with Premium). Careful and Steady do not die, so their death rate target is zero. A lone hero has no earning floor.

**Open, and the designer's to decide:** whether blows can miss. How many hours a Level should take. The seven levers of bought time inside their bands (the hunting cap of 2 is ruled). Whether the early Levels get a bonus. The role rows. Whether `payStepCoin` should be below the XP ratio and by how much.

**SPECULATIVE until played:** every starting value on this page. That a four holds deep enough to out-earn its heroes with no party bonus. That the edge is wider than a gear tier once pulls wait for readiness and monsters reach the party. Today it is about one tier wide for a lone hero (section 9). That a constant step feels good in the first hour.

**Not checked.**
- I ran no part of the new model. The engine does not have it. The probes of section 9 test two of its claims on today's engine and nothing more.
- I did not read the survey's sources. Its formulas are quoted from the survey, and its licence notes are its own.
- I read `02-architecture.md` once in full, and its later additions (move evolutions, two Traits on a Very Rare, the flame, the reserved slices) only as a diff at a80833f64. Where this page and that one differ, the difference is named in sections 2 and 7. I did not read `06-comparison.md` or `07-balance-lab.md`, which landed as this page was finished.
- The lever counts are my grouping. The registry of `lane/bl-levers` will count them properly once the levers have homes.
- The engine sizes are opinion. Nobody has scoped the batches.
