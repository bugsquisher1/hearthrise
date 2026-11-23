# 29. The tuning pass: the dials set together on the rebuilt model

2026-11-23, `lane/tuning-pass`, game designer, on `set/v0.2.144` (8a95ae015: the amount pipeline, the monster formula, foundations, gear phase A, statuses, drops, flame and Temper, the Tower, halls, level costs, trades and talents). This is `27-formula-overhaul.md` section 5's combined measurement, reduced to what the open decisions need, and the end of "no decisions until the formulas are done". Every number below is MEASURED on the real engine (`tools/balance-program/redesign/v1-climb.mjs`: the settle the world tick runs, each seed a full hunting day, the real death rule) unless it says otherwise.

**How it was measured.** `tools/balance-program/redesign/tuning/matrix.sh` plays every scale ground (Muster Barrows, Hask's Ford, both Catacomb wings) with the Steady mixed four (hammer, bow, mage, healer) at three companies: fresh (LOW kits at the entry Level), reference (MID kits at refLevel) and strong (BIS kits at the top Level). The reference company plays Careful, Steady and Bold, one gear tier back and up (C-2), +3 and +10 Levels. Two other lineups (tank, bow, mage, healer; hammer, axes, bow, mage) play Steady. Seeds 1000 to 1007, 10 hunted hours a seed from step 0, held step read from hour 4. Three rounds: the tree as merged (`runs/c0-*`), every switch on (`runs/mf-*`), then candidates for the dials (`r2/`, `runs/line-*`), then the tree with every dial applied (`final/`, `final12/`). `sum.mjs` prints every table here from the JSON.

## 1. The lever table

| Lever | Before | After | Why (evidence) |
|---|---|---|---|
| Muster Barrows `monsters` (`danger.js`) | rows | **formula** | Its four rows carry roles. On the formula the Steady four held 609 with no Careful or Steady death in 8 days, kit share 0.29, the front seat 0.77 of the damage, a gear tier 1.6 / 1.4 depths each way (`final/c0-muster-ref`) |
| Hask's Ford, both wings `monsters` | rows | **rows** (kept) | None of their monsters has a role, so the switch only sized their pulls on hand rows: the Ford's Steady four held 498 against its reference 590, the wings' Careful out-earned Steady (1.11x) (`runs/mf-*`). They switch on when their rows carry roles |
| `POWER.weightGearBelowPm` | 500 | **750** | C-2. The old chain's cliff is gone under the pipeline (a tier back -7 own steps at 500, a tier up +15 at 1000, both linear). At 500 a tier back moved the Ford 0.8 of a depth; at 750 1.5 (Ford) and 1.6 (Muster); at 1000 Muster -26 steps, 2.8 depths, the band's edge (`r2/`) |
| `PAY.floor` | 0.5 | **0.575** | C-5. Careful's XP over Steady's read 0.54 on Muster's formula (`runs/mf-muster-ref`); at 0.575 0.63 (`final/`) |
| `PAY.coinPm` | 6400 | **6100** | EL-PAY. The Steady hour read 1.07 to 1.08 of wage(60) on the formula; at 6100 1.04, Level 63 1.01, Level 70 1.03, the Ford 0.99 (`final/`) |
| `STORE_KIT.refRestore`, `refCharges` | 12,660, 1,390 | **16,950, 1,500** | The owed re-read (CONFLICTS 11-22, trades). The Steady four now restores 1,728 HP and 15,228 mana and spends 1,503 charges a hero-hour. With coinPm 6100 the kit read 0.307 of the hour on the old rates, 0.29 on these (EL-KIT) |
| `HOLDER.linePm` | 800 (20%) | **800 (kept)** | The tank's line, section 3.4: 700 is safe on the formula, not on the Ford's rows |
| `RISKS.bold.fallPm` | 120 | **80** | C-4. On the formula Bold at 120 died 0 to 0.17 times a day on Muster and won every day; at 80 0.25 (Muster) and 1.0 (Ford); at 60 0.88 on Muster (`r2/r2-750-b*`) |
| `BAND_RULE` floor margin (`tools/lib/danger-band.mjs`) | `floorUnder` 10 steps | **min(10, one depth of the band)** | NG-3, section 3.5 |
| Bands (`DANGER_GROUNDS`, `new-ground.mjs --write`) | old chain's cuts | **re-cut on this tree** | Section 3.5 |
| `GOLD_ESTIMATE.riskPm` | 630 / 1000 / 1270 | **760 / 1000 / 1190** | Careful and Bold over Steady in gold a hunted hour, Muster and the Ford averaged (0.77 and 0.74; 1.23 and 1.14) |
| Krell's card (`krells_hold/pack.js`) | "a tank, a healer and two more" | **"a tank, a healer, a hammer and a mage"** | Section 3.6 |
| `AMOUNT.hitRoll`, `pressurePm` | true, 450 | **true, 450** (confirmed) | Section 3.7 |
| Hard Challenge's text | "Taunted enemy: −6% damage to you" | **"−6% damage taken while you hold a taunt"** | Section 3.8 |

`weightGearPm` (1000), `weightSkillPm` (250), `refStep`s, `pressurePm` and the wage did not move.

## 2. The C-targets on the tuned tree

FINAL, the tree with every dial in section 1 (`final/`, 8 seeds x 10 h; the lineups `final12/`, 12 seeds). Depths are `src/core/bands.js depthAt` on the re-cut bands.

| Target | Line | Muster Barrows (formula, L60) | Hask's Ford (rows, L52) | Verdict |
|---|---|---|---|---|
| C-1 the hold settles | under 1 depth over the last 8 h | se 1.2 steps, drift under 3 steps | se 0.9 | PASS |
| C-2 gear tier moves 1 to 3 depths | each way | back 1.6, up 1.4 | back 1.5, up 1.6 | PASS |
| C-2 +3 Levels moves 1 to 3 depths | | -0.2 (+10 Levels 0.8) | 0.1 (+10 Levels 2.5) | FAIL, section 3.1 |
| C-3 no Careful or Steady death | 0 | 0 in 16 seed-days (mixed four) | 0 in 16 | PASS |
| C-4 Bold dies 0.3 to 1.5 a day, wins 2 h, loses the day | | 0.25 a day; Bold XP 1.23x Steady's an hour; a day loses (section 3.3) | 1.0 a day; loses | PASS (Muster at the band's low edge) |
| C-5 Careful over Steady | 0.55 to 0.70 (XP) | 0.63 | 0.66 | PASS |
| EL-PAY Steady hour over wage | 0.95 to 1.05 | 1.04 (L63 1.01, L70 1.03) | 0.99 | PASS |
| EL-PAY Careful, Bold | 0.75 to 1.33 | 0.80, 1.27 | 0.73, 1.13 | PASS (Ford Careful 0.02 under, not a guarded cell) |
| Kit share of gross, Steady | 0.2 to 0.3 | 0.29 | 0.19 | PASS (Ford at the edge) |
| C7 Level XP over the hours formula | 0.8 to 1.2 at the middle | 1.06 | 1.07 (1.00 at the re-cut kill rate) | PASS |
| Front hero's share of damage taken | the role mix's, never 92 to 100% everywhere | mixed 0.77, tank four 0.94, no healer 0.47 | 1.00 in every lineup | Muster PASS, Ford FAIL (no roles) |
| STYLE-3 lineups: none deepest everywhere | | tank four 659, mixed 609, no healer 478 | tank four 623, mixed 592, no healer 520 | FAIL: the tank four is deepest on both |
| C-11 next ground pays 1.1x from depth 1 | | Muster's fresh four 0.74 of wage(55) | Ford's top 1.64 of wage(60) | FAIL (27 F-1, stage 6) |
| NG-3 fresh four at depth 3 or less | | depth 2 | depth 2 (game depth 4, section 3.5) | PASS on the rule |
| Krell's card wins 75% | | | | PASS, 93% at 85 (section 3.6) |

The wings are staged and were re-cut on this tree; their readings are in section 3.5.

## 3. The calls, one by one

### 3.1 C-2: a gear tier, and a Level

Under the amount pipeline a gear step is a rating step: the old chain amplified a tier through stats, the pipeline does not, so C-2 failed at the old weights because the bands were cut on the old chain (one depth was 20 own steps on Muster) and a tier back was half-weighted. Re-cut on this tree a depth is 6 to 9 own steps, and at `weightGearBelowPm` 750 a whole tier moves 1.4 to 1.6 depths either way on both open grounds. In band.

The Levels half fails, and no weight fixes both halves. A rating is a weighted mean: with the gear part at 750 under the hero's Level, three Levels on the same kit are 0.75 of a rating step, under a depth. At 500 the Levels half reads twice as much and the Ford's tier back reads 0.8 of a depth. I chose 750 because a company changes kit once a tier and Levels every few hours, and on the scale's grounds a company always carries its ground's tier: the tier is the decision a player makes, the Levels arrive anyway. Ten Levels at the same kit move 0.8 (Muster) to 2.5 (Ford) depths. C-2's Levels half should read "+10 Levels at the same kit"; section 4 names this as Tyler's one direction call.

### 3.2 Pay: the wage is coin and loot

The brief read coin over wage at 0.81 to 0.82. That is right and is not the target. `src/data/wage.js` defines the wage as coin plus the loot an hour drops at the store's price, `tests/econ-levers.mjs` EL-PAY reads exactly that, and the store's prices (in hours of wage) are sized on it. Raising coin to the wage alone would make the hour pay 1.2x the wage and every price in wage-hours 20% cheap. 27 section 5's table says "Coin" for that reading; it means the wage's gross. The gross read 1.01 on the merged tree and 1.07 to 1.08 once Muster ran on the formula, so coinPm went down to 6100, not up.

**Level 70 pay** closes: a Level 70 four on Muster earns 1.03 of wage(70). It held only 7 steps deeper than the Level 60 four on the formula (a Level at the same kit is a quarter step), where the old rows read 35.

**Ground kill rates** (`refKillsHead`): Muster 120 (the formula's own: 116 measured), the Ford 235, the wings re-cut below. In the end state one reference rate holds (stage 6).

### 3.3 Bold's line and its gold estimate

On the formula Bold stopped dying on Muster (0 in 6 days at fall 120), so Bold won every day: C-4 broken. Bold's fall line moved, not a pay factor (27 section 4). At 80 Bold dies 0.25 times a day on Muster and 1.0 on the Ford. Over a 10 h day a Bold death costs 6% of total Level XP (6.7 table-hours at Level 60, 5.5 at 52) and ends that hero's day (about 5 more hours of pay), so Bold's 0.17 to 0.23 extra table-hours an hour loses the day on both grounds and wins a watched 2 h session. Bold's watched-session win was read from the hourly rates, not re-played (V2).

The Hunts window's estimate is an hour hunted, so its factors are the hourly gold ratios: Careful 760, Bold 1190 (were 630 and 1270, a watched session's). The Bold line under the pick already says it costs over a day.

### 3.4 The tank's fall-back line

Now that Muster's monster blows come from the formula (its blow cap), Steady, the tank four, 12 seeds x 10 h a cell:

| Line | Muster (formula), deaths in seed-days | Hask's Ford (rows), deaths in seed-days |
|---|---|---|
| 600 (15%) | 0 in 12 | 3 in 12 |
| 700 (17.5%) | 0 in 32 | 1 in 32 |
| 800 (20%) | 0 in 6 | 0 in 18 |

On the tuned tree (Muster on the formula, the re-cut bands, 12 seeds) 700 read 0 deaths on both grounds, but the Ford's tank four died once in 8 days at 700 in the same tree's 8-seed run: 1 in 32 Ford seed-days over all three runs, against C-3's "under 1 in 50". 800 never died (18 Ford seed-days). **800 stays**; on the formula 600 and 700 never died, so the line drops to 700 when the Ford's monsters carry roles and play the formula (one re-read).

### 3.5 The bands, and NG-3

The band rule put the floor 10 steps under the fresh four's lowest seed. Under the pipeline a band is about one tier wide (27 K-6 predicted it), so a depth is 5 to 9 own steps and 10 steps put the Bone Wing's fresh four at depth 4. The rule is now: the margin is 10 steps or one depth of the band, whichever is less, so the lowest fresh seed sits at depth 2 (`tools/lib/danger-band.mjs floorOf`, NG-3 restated the same way and still red without it).

Every band re-cut on this tree (`new-ground.mjs --write` from `final/`):

| Ground | refStep | floorStep | topStep | refKillsHead | Fresh four | Verdict |
|---|---|---|---|---|---|---|
| Muster Barrows | 590 (hand, was 590) | 525 (was 320) | 700 (was 710) | 120 (116 measured) | 551 (lowest 537), depth 2 | OPEN |
| Hask's Ford | 590 (was 590) | 565 (was 470) | 675 (was 700) | 235 (was 220) | 577 (lowest 573), depth 2 | OPEN |
| Bone Wing (staged) | 520 (was 540) | 475 (was 500) | 580 (was 605) | 185 | 484 (lowest 482), depth 2 | OPEN |
| Flooded Wing (staged) | 500 (was 530) | 430 (was 480) | 565 (was 595) | 205 (was 200) | 443 (lowest 439), depth 2 | STAGED: the fresh four died once in 8 days |

The wings' reference fell 20 to 30 steps because their MID kits sit under item Level 160 and the weight under the base rose to 750. Their gear tier back moves 4.4 to 4.7 depths (over C-2's 3): the Lab's LOW kit at 175 is more than one tier back there, a kit-state question for the wings' fit, not a weight. The Ford's Level XP read 1.07 of the hours formula at refKillsHead 220, so about 1.00 at the re-cut 235.

Muster's `refStep` stays 590 by hand: on the formula it is the monsters' anchor as well as the pay's, so moving it moves the monsters with it and the four holds the same distance over it.

Known limitation: the game reads depth through the bridge's absolute points, so on the Ford the fresh four reads depth 4 on screen though the own-step cut reads 2 (its floor segment is 25 own steps for 17 Levels of rating). Stage 6 makes own steps absolute and the two readings one.

### 3.6 Krell's card

From the hall harness (`halls/krell-after.txt`, 40 tries a cell at 85, the hall's floor): a tank, a healer, a hammer and a mage win 93%, the only four over 75%; other damage pairs 40 to 63%, a third tank 5%. "Two more" is true from about Level 98. The card now reads **"Party: a tank, a healer, a hammer and a mage"**. `tests/boss-hall-advice.mjs` learned the line (a named four, read against `STYLES`), plays it green (HA-WIN, HA-FLOOR on Salted Lobster), and its 12 mutants are caught, including the old card.

### 3.7 Pressure 450 and the roll to hit

0.3.0 ships `AMOUNT.hitRoll` true with `pressurePm` 450: the Steady four holds 609 on Muster against its reference 590 and earns 1.06 of the hours formula. The roll off with 450 holds 370; the end state turns the roll off and re-solves pressure near 230 (stage3: 200 held 642). Confirmed, not moved.

### 3.8 Signatures, and the talent calls

- **Signature size: 10 steps, kept.** On the pipeline a conditional step is a rating step, and a whole gear tier on Muster moves about 12 to 16 own steps (1.4 to 1.6 depths), so a Signature is about one depth, under a tier, inside the gear slice of 20.
- **Signature count: a first sample of 5,** one a home ground on the scale, measured on the dominance check before the next batch (the no-mass-generation rule). The 46 candidates are the pool, not the count.
- **Mend crossroads II: kept as built** (Deep Mend, Light Mend suggested, Bright Mend). Mend is every hero's heal, so its second fork is mana against power, plus one pick for a hero healing itself near fall-back.
- **Shelter's borrow Level: 90** at a border town (70 at Havora), the formula's (V 8.5 less 30% is 5.95; 200 x 5.95 / 14 = 85, up to 90). The 120 in `17` was a hand reading; corrected there.
- **"Taunted enemy" means every blow at the hero while it holds a taunt**, as built. The holding tank's blows are its held monsters' in nearly every pull, and a per-attacker step would be a second condition nobody can see. The text now says so.

## 4. Tyler's calls

1. **How much a Level is worth against gear.** At the tuned weights three Levels on the same kit move the depth a quarter as much as a gear tier, so a hero who levels without upgrading sees little change on the depth line until the next tier. I recommend keeping it (gear is the choice, Levels come anyway) and reading C-2's Levels half as ten Levels. The other way is gear weight 500: Levels count twice as much and a tier back on the Ford falls under one depth.

No money call came out of this pass.

## 5. Not done, owed

- **The Ford and both wings stay off the formula** until each of their monsters carries a role (a content lane: 4 Ford rows, 5 wing rows), then one `new-ground.mjs` run each.
- **The Ford's damage all lands on its front** (1.00 in every lineup) and the tank four is deepest on both grounds: STYLE-3 waits for the Ford's roles.
- **C-11 (moving on pays more) and F-1 (an outgrown ground pays more)** wait for stage 6.
- **The wings' gold**: their coin rows are hand-typed and pay 1.4 to 1.7 of wage(175) (staged; coin in hours is stage 9).
- **Bold's watched 2 h session** was read from hourly rates, not replayed (V2).
- **C-6, C-7 (party against alone), C-9, C-10, C-12** were not in this matrix.
