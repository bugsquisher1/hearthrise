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
- **Shield duration (Long Shelter, Long Ward): re-worded, not built.** A shell stands until a blow spends it, so "+4 s" lengthened nothing and held the talents switch off. A duration on every shell is a balance change to every shield for two nodes; moving the suggested pick dodges the question. So the nodes become built numbers: **Strong Shelter, +20% shield** (still the suggested crossroads II, the id kept) and the waystone **Protective Ward +5% shield**. No rule is held any more (`tests/hunt-core/talent-effects.mjs` every-option-playable now wants none, and the talents switch can turn on).
- **The talent-effects mappings, confirmed:** Echoing Challenge resets the Challenge when a held monster turns from a living challenger, at most once a cooldown; Lasting Ward refunds the unspent shell as mana when recast on an ally still holding this healer's chipped ward; Lifeline is a free out-of-turn heal (no lane, no mana) on the ally the moment it falls near the line, its own cooldown read; Mending Ward's +6% is on the warded ally; a bare rule takes its tooltip's size (Wide Sickness −20%). Each is what the words promise a player, and none adds a hidden condition.
- **"Taunted enemy" means every blow at the hero while it holds a taunt**, as built. The holding tank's blows are its held monsters' in nearly every pull, and a per-attacker step would be a second condition nobody can see. The text now says so.

### 3.9 Does the tank see the benefit at 20% (lane/tank-line-signatures, 2026-11-23)

Tyler: "20% is fine if they are seeing the benefit, otherwise we need to design something that keeps them higher easier, maybe a shield always has a % hp line on it." MEASURED on `set/v0.2.144` c2c70a5f6, Steady, 12 seeds x 10 h a cell (`tuning/tank/tank.sh`). Mixed = hammer, bow, mage, healer (no tank). Tank = tank, bow, mage, healer.

| Cell | Held (depth) | XP a hero-hour | Gold a hero-hour | Store | Falls/h | Front share | Under 10% / deaths |
|---|---|---|---|---|---|---|---|
| Muster, mixed | 608.7 (11) | 280,813 | 16,754 | 4,874 | 0.9 | hammer 0.78, bow 0.18 | 0 / 0 |
| Muster, tank, line 20% | **654.6 (16)** | **+6.8%** | **+8.4%** | +5.2% | 1.3 | tank 0.94, bow 0.06 | 0 / 0 |
| Muster, tank, no line (25%) | 630.7 (13) | −3.6% | −2.4% | −1.9% | 0.4 | tank 0.94 | 0 / 0 |
| Ford, mixed | 593.4 (11) | 211,115 | 15,663 | 2,980 | 3.9 | hammer 1.00 | 1 / 0 |
| Ford, tank, line 20% | **612.7 (13)** | −1.2% | −1.3% | +13.5% | 4.8 | tank 1.00 | 31 / 0 |
| Ford, tank, no line (25%) | 595.5 (11) | −9.4% | −9.0% | +3.3% | 3.8 | tank 1.00 | 0 / 0 |

**Verdict: keep 800 (20%). Nothing built.**

- On a ground with roles (Muster) the tank pays: five depths deeper, +6.8% XP and +8.4% gold an hour over a four with no tank, no death, the bow off the front (0.18 to 0.06 of the damage)
- The line is what pays it. Without it the same four earns 3.6% less than no tank. The line is worth +11% XP on Muster and +9% on the Ford
- The tank falls back more (1.3 an hour against 0.9) because it climbs to its edge, and the depth pays for it
- On the Ford it is even: two depths deeper, 1% less XP. The Ford's hand rows hit the front in every lineup (1.00), so the Challenge has nothing to pull. Its roles fix that (section 5), not a lower line
- The tank's own damage is the price: 11.4 a second against the hammer's 17.8 (Muster), 20% fewer kills an hour. Depth pays it back where roles spread the blows

**Why not a health line on the shield.** It would be always-on power on one slot outside the gear slice (`19`), and a second answer to the same question the holder line already answers. It would not fix the Ford, where the tank's loss is kills, not depth. A low-health shield stays a find: Signature #36 Cairn Belt is in the first sample (`15`, decision).

The line drops to 700 when the Ford's monsters carry roles (section 3.4), one re-read. The Ford's 31 pulls with the tank under 10% (0 deaths in 12 days) are its hand rows' big blows, the reason 600 and 700 died there.

## 4. Tyler's calls

1. **How much a Level is worth against gear.** At the tuned weights three Levels on the same kit move the depth a quarter as much as a gear tier, so a hero who levels without upgrading sees little change on the depth line until the next tier. I recommend keeping it (gear is the choice, Levels come anyway) and reading C-2's Levels half as ten Levels. The other way is gear weight 500: Levels count twice as much and a tier back on the Ford falls under one depth.

No money call came out of this pass.

## 5. Not done, owed

- ~~**The Ford and both wings stay off the formula**~~ Done, section 6.
- ~~**The Ford's damage all lands on its front**~~ Its front now takes 0.68; STYLE-3 still fails (section 6).
- **C-11 (moving on pays more) and F-1 (an outgrown ground pays more)** wait for stage 6.
- **The wings' gold**: their coin rows are hand-typed and pay 1.4 to 1.7 of wage(175) (staged; coin in hours is stage 9).
- **Bold's watched 2 h session** was read from hourly rates, not replayed (V2).
- **C-6, C-7 (party against alone), C-9, C-10, C-12** were not in this matrix.
- **Muster's floor was cut two tiers back** (2026-11-23, lane/depth-budget-audit, `12-targets.md` 3.1a): its LOW cell wears steel and no jewelry, so a company that finished the Ford arrives at depth 9. The re-cut (575) waits for the depth reading's middle point to follow the reference four's hold, not the hand-held `refStep` (Systems, HANDOFFS 2026-11-23). The top is reachable on Muster's own drops: the strong four holds depth 18 on Steady, 20 on Bold.

## 6. Every scale ground on the formula (lane/monster-roles-ford-wings, systems, 2026-11-23)

Section 5's first two rows, done. Measured the way section 2 was: `tuning/matrix.sh` (now with the two other lineups on every ground) and `tuning/line.sh` (the tank four's line), 8 seeds x 10 h a cell, held from hour 4. BEFORE is the set as merged (`tuning/roles/before`); the switch was measured as a Lab candidate (`roles/after`; the Flooded Wing again on the fixed engine, `roles/after-fix`); the pay cells are re-played on the final tree (`roles/final`).

**The roles** (content, one word a row; `src/data/monster-roles.js`'s second batch). Read from each row's own words and the monster-formula lane's candidates (`candidates/mf-hasks.json`, `mf-wing.json`), so 20-v030 C2's Caster and Warder bodies stand on an open ground: Banded Pikeman swarm, Fordsunk brute, Ledger Wight caster (Hex on the whole party), Bannerman warder (Rally); Shrouded Pauper swarm, Vault Leech stalker, Bone Wall brute (its own Bone Slide), Night Carter and Keeper Dunn casters (their own Lime Sack and Snuff the Candles). With the Wight a stalker the Ford held 629 against its anchor 590; as a caster 590.

**What the switch exposed, fixed in the engine.**
- *A formula ground's loot read the as-built pull* (`dangerDial` dropPm), so an hour's loot jumped where the party-sized pull and the as-built one round apart (Muster under step 547, the Ford under 579). It reads the pull it fights now.
- *Coin was a row's roll a kill.* The Ford's kills fell from 232 to 134 a head, and its Steady hour from 0.99 to 0.55 of the wage. `DANGER_GROUNDS rowsKillsHead` (235, the rate its rows were written at) pays each kill on the scale that over its reference kills, of its coin and of its drop table. The rows themselves stay at 235 because a hunt with no stance still plays them on the tier path: drop chances derived at 135 paid a lone tier hero a Scarce piece every 0.53 h and put the Bannerman's shield past its band's odds (`hunt-core/drop-tables`). The server's coin ceiling follows (1061 regenerated, STAGED, a money surface).
- *A full box can close a corridor.* The Flooded Vault's box of 8 fills a three-wide corridor at the plank bridge; the walled leader walked round the whole map for a roomier edge and every Steady hunt there ended `no_fight` within two hours (`roles/after` shows it: 8-second seeds). A roomier edge must be reached inside the pack area (`pull-cycle.js roomierEdge`).
- *An anchor is not a measurement.* `formulaStep` is where a formula ground's reference monsters stand; refStep stays the pay's reference, where the band rule finds the measured company. They are one step on Muster (by hand) and the Ford (590 measured on 590), 60 to 80 apart on the wings: their Level 175 company deals half the formula's reference damage (Muster's company 0.64), so held at one step every stance there paid under the floor and Careful out-earned Steady (C-5 1.02).

**The dials and bands**

| Lever | Before | After | Why |
|---|---|---|---|
| `monsters` (Ford, Bone Wing, Flooded Wing) | rows | formula | every monster carries a role |
| Hask's Ford band | 590 / 565 / 675, 235 kills | 590 / 550 / 660, 135 | band rule on the formula (8 seeds) |
| Bone Wing band | 520 / 475 / 580, 185 | 440 / 385 / 525, 130; anchor 520 (380 / 530 before REF_HERO) | the same |
| Flooded Wing band | 500 / 430 / 565, 205 (STAGED: a Steady death) | 450 / 410 / 465, none (120); anchor 500 (OPEN; top 470 before REF_HERO) | the same |
| `rowsKillsHead` (Ford) | none | 235 | the hour's coin and loot kept through the kill rate on the scale; the tier path plays the rows as written |
| `HOLDER.linePm` | 800 | **700** | the tank four never died at 700: 0 in 12 seed-days on each ground (48; beside 3.4's 32 on Muster) |
| The Ford's drop chances | derived at 220 (stale at 235) | at 235, the rows' rate (`gen-drop-hours --write`, `drop-rate.js rowsKillsHour`) | drops keep their hours on both paths |

**The C-targets, before -> after** (Muster is unchanged by this lane but for the tank's line).

| Target | Muster | Hask's Ford | Bone Wing (staged) | Flooded Wing (staged) |
|---|---|---|---|---|
| C-1 hold settles | se 2.3, drift 0.9 | 0.4 -> 1.0, drift 1.8: PASS | 0.6 -> 0.9: PASS | 0.5 -> 0.7: PASS |
| C-2 gear tier 1 to 3 depths | back -1.5, up +1.5: PASS | -2.4 / +1.4 -> -2.1 / +1.6: PASS | -5.1 -> -4.1: FAIL (no tier up) | -4.6 -> -6.0: FAIL |
| C-3 no Careful or Steady death | 0 | 0 -> 0 | 0 -> 0 | Steady died 3 times (LOW, tank, L185) -> 0 (tank at 700: 0 in 12) |
| C-4 Bold dies 0.3 to 1.5 a day | 0.5: PASS | 1.0 -> 0: FAIL | 1.0 -> 0: FAIL | 0.9 -> 0.13: FAIL (held at the band's top) |
| C-5 Careful over Steady 0.55 to 0.70 | 0.62 | 0.65 -> 0.66 | 0.54 FAIL -> 0.64 | 0.58 -> 0.71 (edge, unresolved) |
| C7 Level XP over the hours, 0.8 to 1.2 | 1.06 | 1.01 -> 0.93 | 1.03 -> 0.98 | 1.00 -> 0.87 |
| EL-PAY Steady 0.95 to 1.05 | 1.02 | 0.99 -> 0.93: FAIL by 0.02 | 1.50 -> 1.27: FAIL (stage 9) | 1.74 -> 1.06 (edge) |
| EL-PAY Careful / Bold 0.75 to 1.33 | 0.80 / 1.24 | 0.73 / 1.14 -> 0.74 / 1.15 | 1.05 / 1.74 -> 0.83 / 1.32 | 1.27 / 2.02 -> 0.83 / 1.18 |
| Kit share 0.2 to 0.3 | 0.29 | 0.19 -> 0.35: FAIL | 0.11 -> 0.19 | 0.11 -> 0.20 |
| Front hero's share of damage | 0.77 | 1.00 -> 0.68 | 0.97 -> 0.67 | 0.84 -> 0.54 |
| STYLE-3 (tank four / mixed / no healer) | 655 -> 663 / 608 / 480 | 612 / 594 / 521 -> 651 / 588 / 426 | 536 / 522 / 429 -> 458 / 440 / 345 | 513 / 502 / 397 -> 451 / 453 / 299 |

STYLE-3 still fails: the tank four is deepest on three grounds and ties the mixed four on the Flooded Wing; the no-healer four is deepest nowhere. The Ford's fresh four reads depth 3.4 on screen where the own-step cut reads 2.7 (was 3.4 against 2): stage 6.

**Read as data, not set here** (CONFLICTS 2026-11-23, to the designer):
1. **STYLE-3.** Roles moved the front's share everywhere, and no mix yet asks a question the tank four loses.
2. **The Ford's economy.** Its Caster's Hex lands on all four (23 permille of max HP a second taken against Muster's 18), so its kit is 0.35 of the hour; its loot comes in 13% under its drops' hours, because fall-backs leave the back-row Caster and Warder alive more often than a full clear (`drop-rate.js killShares` assumes one), and the hour reads 0.93. The dials are the Caster's area pressure, the store, or `killShares`, none a ground's.
3. **C-4 on the formula.** Bold barely dies on the Ford and the wings (`RISKS.bold`).
4. **The wings' kit state.** A tier back moves 4 to 6 depths, the Flooded band is 60 steps wide (its BIS four holds 19 over its MID four), and their coin rows pay over the wage (stage 9). `formulaStep` bridges the pay until bands, monsters and pay share one absolute step (27 stage 6).
5. **Coin at the bottom of a formula ground (a money risk, MEASURED, `tuning/underlevel.mjs`).** A Level 12 hero hunts the Ford and Muster from step 0 on Steady and never dies, and is paid the ground's coin, not its Level's: 10,595 and 10,536 coin an hour against 1,978 on its own ground (a Level 52 hero on the Ford 12,250); its Level XP is its own Level's. Read the coin against the hero's Level as XP is (stage 6's gap, or coin in hours, stage 9), or gate the scale's entry. Before the big release.
6. **V4 on the Bone Wing.** A four of healers holds the top of every ground and on the Bone Wing out-earns the mixed four (1.105). The dial is the healer four's sustain against the ground's pressure, or where the band's top sits against the formula's anchor; the magic dial is not it (below).
**V4 after the roles** (`tests/lineup-v4.mjs`, read with 6 seeds x 2 h, `held-four.mjs`; CONFLICTS ci-reds 2026-11-23). V4-2 passes: two mages is best on Muster (+2.2%), the Ford and the Bone Wing, the mixed four on the Flooded Wing. V4-1 passes on Muster (mage four 0.86 of the mixed, healer four 0.90) and the Ford (0.88, 0.74), and on the Flooded Wing at 6 seeds (healer four 0.998; at the guard's 3 seeds 1.002). It fails on the Bone Wing: the healer four earns 1.105 of the mixed four. The cause, measured: a healer four holds its ground's top step on every ground with no death (Muster 700, Ford 660, Bone 530, Flooded 470), where the mixed four holds 444 to 612. On the Bone Wing that top sits on the formula's anchor (520), so its monsters there are reference monsters and the healer four still kills 0.67 as fast as the mixed four (Muster 0.56). `AMOUNT.blowTopBp.magic` 820 -> 740 is not the dial: the Bone healer four reads 1.096, and the mixed four loses 5 to 9% on every ground. Left at 820. The healer four's sustain against the ground's pressure, or the band's top, is the designer's call (item 6).

**REF_HERO regenerated** (`node tools/gen-ref-hero.mjs`, then `pack.mjs propose <g> --write` on every ground it moved). The lone hammer's worn accuracy moved a point at Levels 1 to 40 and 60 to 85, its skills a point or two past Level 110. 29 formula rows moved a point or two of aim or evasion: Meadowbrook 2, Wickstead 1, the Sewer 1, Mosslight 3, Carter's Rest 5, Muster 2 (hand rows the formula replaces on the scale), Ox Road 5, the Catacombs 5, Wyvern Roost 5. On the scale the Ford and Muster's formula monsters are unchanged (aim and evasion read the same at Levels 45 to 75); the wings' gain 2 aim. engine-parity re-pinned glade-4 (kills 492 -> 489) and glade-1-kite (140 held) with the cause written; the wings' bands re-measured (8 seeds x 10 h): the Bone Wing 440 / 385 / 525 (was 380 / 530), the Flooded Wing 450 / 410 / 465 (was 470); Muster re-pinned on its same reports (its hand rows moved, the rows it plays did not).
