# Balance program 51: the baseline

Steps 2 and 3 of the overhaul (`50-standards.md` section 7): the grid held against real play, then every band on one page. Written on `lane/d-baseline` by a reader who did not build the harness. No game code, game data or migration was changed. Harness code was changed, and section 3 says where.

**What this page is for.** Tyler reads sections 1 and 4. The eight domain re-dives read all of it and start from the rows that carry their domain (section 8). Nothing here proposes a fix. It says what is out of band, how sure we are, and where the measuring tool itself was wrong.

**Labels.** MEASURED means played on the real engine by the grid (`tools/balance-program/progression-grid.mjs`). RE-RUN means I played the same cell again on three fresh seeds outside the cache. REAL means production, read-only, aggregated. COMPUTED means the solver or a model worked it out from measured rates. A verdict is one of: **green** (inside the target), **off target** (outside the target, inside the red line), **red** (past the red line), **thin** (the sample cannot see it), **unjudged** (no reader, or the number is a stand-in, with the reason).

**The tree it was measured on.** `set/v0.2.144` at 358417cb0, with this lane's harness fixes on top (the grid's own stamp is c7c81a93b). The full grid is 1,363 cells at 2 seeds of 2 hours, 996 seconds on 12 workers, no errors. The death sample is Levels 10, 20 and 88, 90 cells at 4 seeds of 8 hours, 534 seconds on 12 workers. The ground-rate table under the solver is 422 cells at 2 seeds of 1 hour, written by the balance matrix on this branch (470 seconds). The stamina day as played is 12.02 hunted hours.

**Caveats that hold for the whole page.**

1. **The spell rule is in these numbers and no real player has played it.** The spell rule (plan lane L17) landed on the set while this page was being written. It makes every cast a share of the caster's blow, and a melee hero now levels 9 to 37% faster from the Glade to the Hold. The real hunts used for calibration ran on v0.2.142, before it. Section 2 gives both readings.
2. **A sibling lane may move closed-browser XP slightly.** `lane/c-engine-reds` is fixing the world-tick perk parity and a settle control. This page did not wait for it.
3. **The grid was played four times for this page.** Once by the lane that built it, once after the spell rule, once after the harness faults of section 3 were fixed, and once more after the balance matrix landed and changed the cell runner's bookkeeping. Only the last run is quoted as the baseline. Where a fault moved a number, section 3 gives it before and after.

---

## 1. The short version

1. **Only one real party has played the current rules**, the heavy four. On the rules its hunt ran on, the harness read its pace within 6%, and within about 3% once the harness is seated the way that four really sits. Its gold and its damage do not match. No lone hero, pair or three has a single real hour on the current rules. So every band on this page is still in report mode, and section 2 says what would change that.
2. **The measuring tool had six real faults. All six are fixed on this branch.** The two worst: the solver played every Dangerous and Deadly hunt at Normal's pull, so it had parties killing at under half their real speed. And every hero past Level 100 was given skills the game cannot give (Melee 198 at Level 400, where the game's own curve allows 129). Ten more faults are written down and not fixed (section 3).
3. **Of 108 bands: 58 red, 13 off target, 18 green, 19 unjudged.** Sections 5 and 6 list every one. Two of the 108 are new on this page, and two more were changed (section 3).
4. **The clock is more than twice too fast on the seat you ruled.** A mid-geared four on Deadly reaches Level 100 in 226 hunted hours against the ruled 600, and Level 400 on day 176 against day 382. It leaves today's open content on day 23. The ruling asks for 120 days.
5. **The tiers do not work as tiers.** In the death sample no hunt lands inside a ruled death count. Three or four heroes with a Healer never die on Deadly, at any Level, even in LOW gear. A lone hero from Level 20 dies every 1 to 50 minutes on Dangerous and Deadly, even in best in slot. Under Level 16 both tiers are free XP for anyone.
6. **Your two death rulings cannot both hold past Level 145.** If a mid-geared four really died on Deadly as often as the ruled count says (100 times in 1,000 hours) at the ruled cost (6% of all Level XP), it would earn less a head than a lone hero on Normal from Level 145 with every Blessing, and from Level 75 with none. Today it does not die at all, so nobody pays.
7. **A party on Normal earns about half of what its heroes earn alone**, at 22 of 27 checkpoints. That is why every real party sits on Deadly.
8. **The first hour has no danger and no upgrade.** The harness hero never drops under 85% health for the first 12 hours, while real new players died 7 times in 78 lone hours. The first gear a hero puts on is worth 2 to 8% of XP.
9. **Gear is too strong once and then almost nothing.** The first tier step is two to four times the ruled size. From Level 60 an armor step reads as nothing, and a full best-in-slot kit is under 10% faster than mid gear at 24 of 31 checkpoints, against a ruled 15%. Best in slot costs a third to a half of what a band earns, and 80 to 100% of it comes off a bench.
10. **Server cost is ten times the budget**: 605 database-seconds an account-day against 60, and 239 journal rows a hero-hour against 1. The real heavy four wrote about 400.
11. **What I would do next**, before any tuning: play one lone hour and one pair hour on live with the kit written down, record lowest health in the tally, and settle the rune rule of fault F5. Without those three the re-dives will be tuning to a harness that only one party has checked.

---

## 2. Calibration: the grid against real play (X27)

The rule is that the harness reads within 10% of real play on XP and 20% on gold, on at least three real parties, including a lone hero and a pair.

**The read.** A fresh read-only read of production (the journal, 505,200 rows, with the tool of `10-real-players.md`), cut into cells of ground, party size, tier and Level band. Four people, 1,367 hunted hero-hours. Then the same cells played on the harness with the same ground, Level, seats and tier, three fresh seeds of two hours each.

**The finding that decides everything: only one real party has hunted on the current rules.** Since v0.2.142 shipped on 2026-11-20, the only real hunting is the heavy four (one person, four heroes): about 60 hero-hours on Krell's Hold on Deadly and 8 on Coppercap Warrens on Deadly. Every real lone hour (120) and every real pair hour (129) is two to four weeks old. Between then and now the Sewer was rebuilt, drops and XP a kill were changed three times and monsters gained 10% health and damage. A real Sewer kill paid 140 Level XP then. The harness pays 255 for the same monster mix now. So an old cell cannot say whether the harness is wrong or the rules moved.

### 2.1 The four (the heavy four, Deadly): passes on pace, fails on gold and on damage

Harness on the rules the hunt was played on (the set before the spell rule, 16a533a02), MID kit, in the grid's own seats (a shield tank, Healer, bow, Mage):

| | Real | Harness | Gap | Tolerance | Verdict |
|---|---|---|---|---|---|
| Krell's Hold, Level 79. Level XP a hero-hour, no event (17.8 real hero-hours) | 1,001,000 | 945,934 | -5.5% | 10% | **in** |
| The same, with the heroes' real skills typed in | 1,001,000 | 907,661 | -9.3% | 10% | in, at the edge |
| Kills a clock hour (39 real hero-hours) | 1,251 | 1,183 | -5.4% | | in |
| Level XP a hero a kill | 800 | 800 | 0% | | exact |
| Coin a hero-hour | 15,100 | 14,233 | -5.7% | 20% | **in** |
| Store bill a hero-hour | 10,600 | 23,481 | +122% | 20% | **out** |
| Store bill after the frame's quarter home-made | 10,600 | 17,611 | +66% | 20% | **out** |
| Net gold a hero-hour | +9,700 | +2,684 | -72% | 20% | **out** |
| Damage taken, the four, a clock hour | 171,700 | 124,188 | -28% | | **out** |
| Share of that damage on the front hero | 69% | 95% | | | **out** |
| Deaths | 0 in 39 h | 0 in 24 h | | | agrees |
| Coppercap Warrens, Level 77 (8.1 real hero-hours, thin). Level XP | 630,000 | 552,870 | -12.2% | 10% | out by two points |
| Kills a clock hour | 1,419 | 1,245 | -12.3% | | |
| Coin a hero-hour | 11,048 | 9,667 | -12.5% | 20% | in |
| Store bill a hero-hour | 8,628 | 18,716 | +117% | 20% | **out** |

**The seats were wrong, and that is most of the damage gap** (fault F16, found after a question from the social review). The real front hero wields a two-handed hammer. He has no shield, and Challenge needs one (`src/data/abilities.js`), so he cannot turn Hask's Lookouts onto himself. The real Healer sits in the last seat. An unchallenged Lookout shoots the last-seated hero, whatever its role: with the bow moved to the last seat the bow took the bolts. The harness seated a shield tank who Challenged every Lookout, with the Mage last. Played again in the real seats, on today's tree:

| Krell's Hold, Deadly, Level 79, the real skills | Real, five hunts, 30 clock hours | Harness, the grid's seats | Harness, the real seats |
|---|---|---|---|
| Front hero's share of the damage | 69 to 75% | 94 to 97% | **67%** |
| Healer's share | 25 to 28% | 1 to 4% | **31%** |
| Bow and Mage, each | 0 to 1% | 1 to 3% | 1% |
| The four's damage a clock hour | 167,000 to 188,000 | 98,000 to 111,000 | 119,137 |
| Kills a clock hour | 1,251 (old rules) | 1,340 | 1,465 |
| Level XP a hero-hour | 1,001,000 (old rules) | 1,071,297 | 1,171,262 |
| Store bill a hero-hour | 10,600 | 18,556 | 18,453 |
| Net gold a hero-hour, a quarter home-made | +9,700 | +9,622 | +11,680 |

The balance matrix (`tools/balance-program/balance-matrix.mjs`), which landed the same day, prints the same comparison on every run and agrees: its harness four kills 1,386 an hour against the real 1,251, its tank takes 96% of the damage against a real 69%, with the real party's ways the split is 72% and 26%, and its store bill is 1.9 times the real one. Two tools, built apart, read the same thing.

Three things follow. The split now matches. The total is still a third low (119,000 against 167,000 to 188,000), and I could not find why: the real front hero alone takes 119,000 to 127,000 where the harness front hero takes 79,000. And the hammer four is 9% faster than the grid's shield-tank four, so the grid's four is not the fastest four a player can field. On the grounds with no shooter the harness split is close to real without any change: Coppercap reads 78 / 7 / 7 / 7 against a real 70 / 8 / 11 / 11, and Pyre Field puts 84 to 86% on the tank against a real 100%. Shooters stand on Krell's Hold, Carter's Rest and the Wyvern Roost only.

**Verdict for the four.** Pace calibrates. On the rules the hunt ran on, the harness read 5 to 12% slow on XP and kills in the grid's seats and paid exactly the real XP a kill. The real seats are about 9% faster than the grid's seats, so in the real seats the harness would have read within about 3% (an estimate: I did not play the old tree again). Gold does not calibrate. The harness four pays 1.7 to 2.2 times the real store bill, for two reasons found in `11-krell-hunt-2026-11-20.md` and confirmed here: the kit rule buys the Level's own rune tier (Graven, 44 gold) where the real player buys Carved and Etched (28 and 12), and the real Healer heals on a 1 gold water rune. Damage does not calibrate on Krell's Hold: the split does in the real seats, the total does not. Survival cannot be calibrated anywhere, because the tally does not record a hero's lowest health.

Net gold on today's tree reads inside 20%. That is two errors meeting, a faster party and a bill that is still nearly twice the real one. It is not a pass. The balance guard's K1 line now plays the real seats with the real rune tiers on today's tree, and reads, each over the real hunt: Level XP 1.15, kills 1.15, net gold 1.68, the last seat's share of the damage 1.16, the four's damage 0.75. So with the real rune tiers the harness four nets two thirds more gold than the real four, where with the kit rule's tiers it netted far less. Gold fails in both directions, which says the bill is not understood yet.

### 2.2 The lone hero: fails, because no real lone hero has played the current rules

| Real cell (all on older rules) | Real | Harness MID | Harness LOW | What it says |
|---|---|---|---|---|
| Millrace Sewer, Level 22, 19.3 h, one person. Level XP a hero-hour | 71,788 | 91,468 (+27%) | 69,456 (-3%) | XP a kill was 140 then and is 255 now |
| Kills an hour | 512 | 359 | 273 | the ground was rebuilt in between |
| Coin a hero-hour | 6,116 | 8,340 (+36%) | 6,523 (+7%) | |
| Millrace Sewer, Level 12, 12.3 h, two people. Level XP | 48,458 | 69,641 (+44%) | 64,515 (+33%) | |
| Coin a hero-hour | 2,622 | 6,639 (+153%) | 5,906 (+125%) | |
| Meadowbrook Thicket on Normal, Level 7, 6.2 h, two people. Level XP | 20,616 | 28,473 (+38%) | 27,878 (+35%) | new players kill 19% slower than the harness LOW kit |
| Coppercap Warrens on Normal, Level 37, 11.9 h, **the QA account**, rules of 11-14 to 11-19 | 214,552 | 229,308 (+7%) | 165,709 (-23%) | the nearest thing to a pass, and it is not a player |

**Verdict for the lone hero: not calibrated. Every lone band stays in report mode.** The direction is still worth reading. Under Level 25 a real lone hero earned about 0.7 of what the harness MID hero earns, and sat near the harness LOW kit or under it. That fits what `10-real-players.md` found: 0.9% of dropped gear is ever worn, and main skills run under the career line. Two things follow for the first hours.

- The harness reaches Level 10 in 3.9 (MID) to 4.2 (LOW) hours. Real heroes took a median of 5.6 hours on the 11-20 read (12 heroes, fastest 2.5) and 3.5 on today's read with the same tool (13 heroes, 1.6 to 12.5). The ruled target is 6. So the first-hours pace that the grid reads as a little fast sits inside what real players do, and the spread between real players (eight times, fastest to slowest) is far wider than any band. The gap is setup quality (standard X20), not the curve.
- The harness reads no death at all on Normal (0 deaths in 1,120 pooled hero-hours for each gear state). Real lone heroes under Level 16 died 7 times in 78 hours. Most of those were in the Sewer, where a real new player walks in alone and under-geared. A green on S2 or S7 says the kit rule survives. It does not say new players do.

### 2.3 The pair: fails, for the same reason and one more

| Real cell (older rules) | Real | Harness, the same two seats | Gap |
|---|---|---|---|
| Millrace Sewer, Level 17, two melee heroes, 29.9 h, two people. Level XP a hero-hour | 56,130 | 40,281 (tank and hammer) | -28% |
| | | 48,706 (two hammers) | -13% |
| Coin a hero-hour | 3,136 | 4,900 | +56% |
| Wickstead, Level 12, two melee heroes, 17.3 h, one person. Level XP | 36,234 | 17,426 | -52% |
| Kills an hour | 1,232 | 675 | -45% |

**Verdict for the pair: not calibrated. P6.2, P7.2 and the pair's rows of every other band stay in report mode.** Wickstead reads 675 kills an hour on the harness with any two seats, so its kill rate is set by the ground's respawn now and the ground has changed since the real hours. The second reason is seats. Every real pair was two melee heroes. The grid seats a pair as tank and Mage or bow and Healer and takes the better. A tank and a Mage on the same Sewer cell read 86,147, twice what two melee heroes read. Until a real pair is played on current rules with known seats, the pair is a harness number.

There is no real three on current rules either (76 hours, all old). The three stays in report mode.

### 2.4 What stays in report mode, and what would move it

| Band family | Calibration | Stays in report because |
|---|---|---|
| Four, pace (P1, P7.4, P8, P12, R2) | XP in, on one person, on the rules before the spell rule | the seat's tier is picked by "holds", and "holds" reads net gold, which fails (F5). The grid's four is also not the real four (F16) |
| Four, gold (G-2, G-4, G-5, G-6, G-9 party rows) | fails | the store bill reads 1.7 to 2.2 times real |
| Four, survival (S3, S4, S5, S6 party rows) | cannot be checked | the tally records no low point, and the four's damage total reads a third low on the one ground we can compare |
| Lone, everything | not calibrated | no real lone hour on the current rules |
| Pair and three, everything | not calibrated | no real hours on the current rules, and real pairs sit two melee heroes |

Three things would close it, in order of cost:

1. **Play it on live.** The daily play gate already plays the QA account. One lone hour at Level 7 on the Thicket, one lone hour at Level 20 on the Glade and one pair hour on the Sewer, each on Normal with the worn kit written down, gives the first lone and pair cells on current rules. The QA account's 11.9 lone hours on Coppercap are the proof this works: they are the closest cell on this page.
2. **Record what calibration needs in the tally.** The hero's lowest health, the tier, and the gear tier worn. The first was asked for in `11-krell-hunt-2026-11-20.md` and goes to Systems.
3. **Give the grid the real four as a named party**, beside the standard's four: hammer, bow, Mage, Healer, with the real rune tiers. The balance guard's K1 line now plays exactly that party (F16).

---

## 3. Harness faults found

Sixteen, and one open question. Six are fixed on this branch at their source. Five of the six carry a check that was proven to bite by mutating the fix (five mutants, five caught), and the sixth is a data row the guard now reads. The rest are written down for the lane that owns the file. Three of the six came in as questions from the social, world and formula reviews while this page was being written.

### 3.1 Fixed, with before and after

| # | Fault | Before | After | Where |
|---|---|---|---|---|
| F1 | **P5 was judged on tiers where LOW is ruled to die.** The band is "BiS over LOW, at most 1.5". On Deadly at Level 20 the lone LOW hero earns 584 XP an hour between deaths | the grid lane's fourth red: 277 | P5 reads Normal only. Worst cell 1.89 (the pair at Level 35), 7 red rows of 118 | `grid-derive.mjs`, `standards.mjs`, the P5 row of `50-standards.md` |
| F2 | **S2 and S7 could never be judged.** They are Normal's death bands. The death run plays the harder tiers only, and a rate of 1 in 1,000 hours cannot be seen in one cell anyway | five bands thin for good | both are judged on the pool of every in-band Normal cell of the gear state, from 1,000 hero-hours: 0 deaths in 1,120 pooled hero-hours for each gear state | `grid-derive.mjs` |
| F3 | **Gear cost was judged past Level 185, where the projected gear has no price** | MID to BiS read 2,130 gold for every band from 200 to 400: 9 false red rows each on G-10 and E4 | those rows are unjudged, with the reason | `grid-derive.mjs` |
| F14 | **The solver's ground-rate table played every harder tier at Normal's pull.** A tier's monster rows come from the tier. Its pull has to be passed in, and `measureJobs` did not pass it. So "Deadly" there was Deadly's monsters four at a time | a four on Krell's Hold at Level 85: 558 kills an hour on Deadly, 562 on Normal. A lone MID hero "held" Deadly with 0 deaths on every one of 28 cells | the same four: 1,383 kills an hour on Deadly and 566 on Normal (the real four: 1,251 on the older rules). A lone MID hero dies on Deadly at 19 of 28 cells and holds it at 9, each of them the top of a band or a ground under Level 20. The solver's four now reaches Level 110 on day 23.3 where it read 40.6, beside the grid's 22.9. B9 moved from 1.29 to 1.43 for every party down to 1.0 for the pair, 1.11 for the three and 1.32 for the four. My own re-play of the table and the matrix's agree: the median cell differs by 0.6% on kills, and 14 of 422 cells differ by over 10%, each a cell where a lone hero dies or a Level 5 cell | Found on this lane and, the same day, by the matrix lane. The table now has ONE writer, `balance-matrix.mjs --rates`, which builds every cell through the grid's own `buildCell`. This lane keeps the guard: `sources.mjs --selftest` fails if a harder-tier job loses its pull, or if the cached table reads a four no faster on Deadly than on Normal |
| F15 | **Skills past Level 100 were a straight line in skill levels.** The measured skill lines stop at Level 100. Past it the harness added the last ten Levels' slope for ever. The game's own reference hero, which every monster's aim and evasion are written against, is projected on the skill curve's cost | Melee 198 and Defense 184 at Level 400 for the lone hammer, where the reference hero has 129 and 113. Every cell from 110 to 400 played a hero the game cannot make | one projection, shared with `tools/gen-ref-hero.mjs`: the lone hammer is the reference hero at every Level, 129 and 113 at 400. Levels 110 to 400 were played again. Where the hero was already safe the move is small: the pace seat's Level 400 went from 2,031 to 2,119 hours (day 169 to day 176), the lone MID hero's from day 269 to day 279, the lone hero on Normal at Level 400 from 1.46 to 1.37 times the contract, and a four's lowest health on Deadly at Level 400 from 73% to 69%. Where the hero was at the edge it is large: the matrix's lone hammer on Deadly at Level 400 fell from 2.01 to 0.77 times the contract | `tools/balance-sim/skill-lines.mjs`, `tools/gen-ref-hero.mjs`, a check in the grid's selftest |
| F16 | **The calibration party sat in the wrong seats** (section 2.1) | front hero 95%, Healer 1% of the damage | front hero 67%, Healer 31%, against a real 69 to 75% and 25 to 28% | `model.mjs` REAL_KRELL_FOUR, two new rows on the guard's K1 line (the last seat's share of the damage, and the four's damage a clock hour) |

**On the two questions that named the grid.** "The grid's four kills 558 an hour on Krell's Deadly" was the solver's table (F14), not the grid. The grid's four killed 1,183 an hour on the hunt's rules against the real 1,251, and 1,463 on today's. "The two caches disagree on lone Deadly deaths" was the same fault from the other side: the grid was right that a lone MID hero dies on Deadly, and the solver's table was wrong that he holds it. No "holds a tier" rule was involved. Every solver number that leaned on a harder tier was wrong until the re-play, B9 among them.

**Two guards were already red on the set and are not this lane's.** I ran every test this diff touches. `tests/balance-calibration.mjs` replays recorded hunts and reads the harness 21 to 30% fast on Krell's Hold. `tests/party-class-xp-line.mjs` reads two staged cells off their bars (Carter's Rest on Dangerous at 0.989 of the heroes alone, and the Ox Road on Deadly at 2.53 times the contract against a cap of 2.5). I ran both again on the set's own skill lines, without fault F15's fix, and they are red in exactly the same rows. Both went red when the spell rule made melee faster. They need the spell-rule lane or a data lane, and they will fail a release run until then.

**The matrix's subset and the full grid disagreed by up to 30% at Level 400, and F15 is the whole reason.** The subset's cache had been played before the fix, with Melee 198. Played again on this branch it carries Melee 129 and agrees with the full grid: the lone hammer on Normal at Level 400 reads 1.36 times the contract on the subset and 1.37 on the grid, and the MID four on Deadly reads 2.02 on both.

**Three bands were changed on this page**, in `standards.mjs` and in `50-standards.md`, each PROPOSED:

| Band | Change | Why |
|---|---|---|
| P5 | read on Normal only | fault F1 |
| P12 to Level 300 | read at 15 hours a Level, not 12 | the progression review found it contradicted the ruling above it: the ruled table itself needs 10.8 hours a Level from 100 to 200 and 14.4 from 200 to 300 |
| S11, new, two rows | on the hardest tier the MID four holds, Level XP a head after deaths at the top of the ruled death count is at least what the lone MID hero earns on Normal. Read with every Blessing and with none | the progression review found that a patch halving the death loss moved no band at all. A two hour cell records almost no death, so the band is derived from the ruled count (Dangerous 30, Deadly 100 in 1,000 hours) and the ruled cost (6% of all Level XP) on measured XP |

**One place the skill fix does not reach.** Past Level 1,000 the game's reference table is itself a straight line (`src/data/to-hit.js`, the formula review's X42). The grid stops at 400, so nothing on this page touches it. The matrix plays to 5,000 and will see it. The matrix's cached subset was played before this fix and still prints the old skills until it is played again.

### 3.2 Open, for the lane that owns the file

| # | Fault | What it does to the baseline | What closes it |
|---|---|---|---|
| F4 | **A dead hero stands up at once and hunts on.** In the game a death ends the hunt | a death count on a cell that fails is the rate of an endless retry, not a rate a player can have. The direction is right | the honest unit for a cell that fails is minutes to the first death. Needs a change to the cell runner and a re-play |
| F5 | **The party's store bill is 1.7 to 2.2 times real** (section 2.1), and "holds a tier" needs net gold over zero | every party gold band, and any place where the pace seat's tier turns on a bill | the kit rule in `50-standards.md` 1.4 buys the Level's rune tier and the real player does not. The cell runner already takes a rune tier by role (the guard's K1 uses it). This is a rule to change in the standard, then a re-play |
| F6 | **The kit builder never wears the staged unique lines** (Levels 110 to 185). LOW and MID wear the same tier 7 pieces there, and the weapon step reads 0 | every LOW against MID reading from 110 to 185, E1 there, and the solver's "uniques: UNMEASURED" | `grid-kit.mjs` |
| F7 | **S6 judges a lone hero on Deadly against the party's death count.** Standard 2.3 says MID holds Deadly as a four | the lone rows of S6 are red by design of the band | a standards question: say which party sizes each S6 row judges |
| F8 | **P6 compares a party and a lone hero on different grounds at Levels 35 and 40.** The game advises a lone hero the Glade there and a party the Warrens | the 2.1 to 2.5 readings there are the advice gap, not a party advantage | the gap itself is a real finding (red 25) |
| F9 | **The cost bands are a model on real means read on 11-20**, with the tab's reads at the value from before the server-cost lane landed. Its journal figure (216 rows a hunted hero-hour) is under the heavy four's real 426 | C1 and C2 read about 110 seconds a day high. C3 reads low | `model.mjs`, after the server-cost lane has a day of data |
| F10 | **`--only` and the death run replay the same seeds** | a re-run of a cell through the tool is a replay, not a second opinion. Every re-check on this page used fresh seeds outside the cache | small |
| F11 | **The grid's four is the standard's four, not the four players field.** A hammer in the front seat is 9% faster than a shield tank, with a third of the damage on the Healer and still no death | P7.4 and P8 read the slower four | the real four as a second named party (2.4) |
| F12 | **The solver's chance runs barely vary.** B8 reads the 90th percentile equal to the median in most bands | B8 is not judged on real spread | `paths/` |
| F13 | **D2 has no row to read from Level 125** | D2 prints "undefined" there | small |
| OQ | **The total damage a four takes on Krell's Hold reads a third low** even in the real seats | S3, S4 and S5 at 88 to 110 lean on it | one watched hour of the real four with the tally recording damage by source |

---

## 4. The red list

Ranked by when a player meets it: the first hour, then hours 1 to 20 (Tyler: the core loop is the first 20 hours), then the long chase. Inside a group the order is how many players it touches. "Re-run" is my own play of the cell on three fresh seeds of two hours. Every re-run landed within 1.5% of the grid on XP, so the grid's numbers are stable. What they mean is the question, and the Trust column answers it from section 2.

Where a clock helps: a lone MID hero is Level 6 after the first hunted hour, Level 10 after 5 hours, Level 14 after 12 and Level 17 after 20. A four of friends is Level 7, 12, 17 and 23 at the same hours.

### 4.1 The first hour (Levels 1 to 7)

| # | Band | Target | Measured | Cells | Re-run | Trust | What it means for the player |
|---|---|---|---|---|---|---|---|
| 1 | S1: lowest health on Normal | MID 60 to 80%, LOW 45 to 70% | MID 96 to 99%, LOW 85 to 97%, at every checkpoint from 1 to 15 | 1, 3, 5, 7, 10, 15, lone, Normal, all three kits | Level 1 MID 97%, Level 5 MID 96% | **not calibrated, and real play disagrees**: real lone heroes under Level 16 died 7 times in 78 hours | The harness hero is never in danger for the first 12 hours. Real new players die, mostly in the Sewer. The kit rule and the starting bar are better than what a new player actually sets up. Off target on the band, and the first thing to check by playing |
| 2 | P3: LOW over MID, Level XP | 0.80 to 0.90 | 0.98 at Levels 1 and 3. 0.92 to 0.94 at 5, 7 and 10 | 1 to 10, lone, Normal | | lone: not calibrated | The first gear a new hero puts on is worth 2 to 8% of XP. It does cut damage taken by more than half (8,828 an hour to 3,741 at Level 7), and with no danger on Normal nobody can feel that. The first upgrade of the game does nothing a player can see |
| 3 | E2: hours until the MID set has dropped, over the band's hours | at most 0.15 | 0.61 at Level 5 and 0.59 at Level 7: 7.5 to 7.8 hours of a 13 hour band, and one piece does not drop on the Thicket at all | 5 and 7, lone MID, Normal | | lone: not calibrated | The set a player is meant to be wearing arrives when the band is more than half over |
| 4 | P7 and P8: a party on its hardest tier, times the contract | pair 1.2 to 1.5, three 1.5 to 2.0, four 1.8 to 2.5. BiS four at most 2.75 | Level 5: pair 5.07, three 4.78, four 4.50, BiS four 4.87. Level 7: 3.42, 3.18, 3.02, 3.34 | 5 and 7, parties, Deadly, Millrace Sewer | Level 5 four: 4.50 | four: XP calibrated on one party at Level 79, not here | A new player with three friends, or a second account, hunts Deadly from Level 5 at four and a half times the pace and never drops under 90% health. Deadly in the Sewer is not a tier, it is a faster Normal |
| 5 | P2 and P11: the lone pace under Level 10 | Level 10 in 5 to 7 hours | 3.9 hours MID, 4.15 LOW. Level 1 pays 6.5 times the contract | 1 to 10, lone, Normal | Level 1: 6.52, Level 5: 2.26 | **real play brackets it**: real median 3.5 to 5.6 hours, range 1.6 to 12.5 | Not a red to act on. The curve is about right for real players. The gap between players is setup quality (X20) |

### 4.2 Hours 1 to 20 (Levels 7 to 17 alone, to 23 as a four)

| # | Band | Target | Measured | Cells | Re-run | Trust | What it means for the player |
|---|---|---|---|---|---|---|---|
| 6 | P6.4: a four a head over a lone hero, same tier | 1.15 to 1.25, red under 1.0 | **0.58, 0.56 and 0.50** on Normal at Levels 20, 25 and 30. The solver agrees from the other side: the four's best path is 1.32 times slower a head than the lone path at Level 10, and the three's 1.11 at Level 15 (B9) | 20, 25, 30, MID, four against lone, Normal, Mosslight Glade | 0.58 at 20, 0.49 at 30 | four side calibrated | A player who puts their second, third and fourth hero into a party on Normal makes every hero level at half speed. The only party that pays is one on a harder tier. RULED 11-16 says a party stands at or over its heroes alone |
| 7 | S3 and S4: a party's lowest health on Dangerous and Deadly | Dangerous 35 to 60%, Deadly 15 to 40% | Deadly, MID four: 90 to 98% at Levels 5 to 15, 76 to 90% at 20 to 30. In the death sample a MID party of two, three or four did not die once at Level 10 on either tier, and a MID three or four did not die at Level 20 (section 4.4) | 5 to 30, four, Deadly and Dangerous | Level 5: 90% | cannot be calibrated. The real four agrees in kind: 0 deaths in 60 hours on Deadly | For a party with a tank and a Healer the harder tiers carry no risk |
| 8 | S3, S4, S6 and G-2: a lone hero on a harder tier, in band | MID holds Dangerous from Level 16 (standard 2.3). Dangerous: 10 to 30 deaths in 1,000 hours, bill 25 to 40% of income | Level 20, Dangerous: lowest health 28%, a death every 21 minutes of hunting in the death sample, store bill 1.8 times income, net -9,766 gold an hour. On Deadly the hero dies at once. Under Level 16 the reverse: a lone MID hero holds Deadly at 5, 7, 10 and 15 at 71 to 90% health | 20 and 25, lone MID, Dangerous and Deadly, Mosslight Glade. 5 to 15, lone, Deadly | Level 20 Dangerous: 18 deaths in 6 hours, bill 22,527 against income 12,168 | lone: not calibrated | The tiers flip at Level 16. Before it they are free XP for anyone (2.4 times the contract alone on Deadly at Level 5). After it a lone hero has no harder tier at the floor of a band. A lone player's first try at Dangerous in the Glade is a death every 20 minutes and a bill twice the income |
| 9 | P3: LOW over MID at the first tier step | 0.80 to 0.90, red under 0.70 | **0.69 at Level 20, 0.67 at Level 25** | 20 and 25, lone, Normal | Level 20: 66,593 against 95,234, 0.70 | lone: not calibrated. Real lone heroes sat at the LOW reading | The arrival in the Glade is a wall for a hero still in tier 1. It earns two thirds of the XP and takes 67% more damage. From 30 on LOW is 0.73 to 0.83 |
| 10 | E1: what one tier step is worth | weapon +5 to 8% XP. Armor 3 to 5% less damage | weapon **+16% and +15%** at 20 and 25. Armor **12%, 22% and 20%** at 15, 20 and 25 | the lone MID hero with one group a tier back, Normal | | lone: not calibrated | The first tier step is two to four times the ruled size. The same steps read nothing for armor from Level 60 (red 21) |
| 11 | P7.2 and P8: parties on the hardest tier they hold, Levels 10 to 30 | pair 1.2 to 1.5. BiS four at most 2.75 | pair 2.37, 1.95, 2.02, 1.57 and 2.03 at 10 to 30. BiS four 2.94 at 20 | 10 to 30, MID pair, BiS four | | pair: not calibrated | The pair runs 30 to 60% over its ruled band through the first two days. The three is at or under its band from 15 to 30 |
| 12 | E4 and G-10: what BiS costs over what the band earns | 1.0 to 1.4 | 0.57 at Level 15, 0.35 and 0.32 at 20 and 25, 0.54 at 30. Under Level 15 BiS costs 100 gold | 15 to 30, lone MID net gold on Normal | | lone: not calibrated | A lone hero can buy every gold-priced part of BiS with a third to a half of what the band pays. RULED 11-18 wants the band to cost a bit more than it earns, so the player must choose |
| 13 | B1: days to full BiS over the band's length | 0.7 to 1.0, red over 1.5 | **4.4** for Levels 15 to 30: 11.1 days against a 2.5 day band. The slow pieces are one Catacomb piece and one Hearth Chest piece | the solver, lone, free, 12 rested hours | | COMPUTED | Everything else in the band's BiS is owned inside 1.3 days. Two chest pieces set the whole number |

### 4.3 The long chase

| # | Band | Target | Measured | Cells | Re-run | Trust | What it means |
|---|---|---|---|---|---|---|---|
| 14 | **P1: the pace seat on the ruled Level table** | within 10% | Level 25 in 21 h (ruled 36). Level 50 in 59 (168). **Level 100 in 226 (600)**. Level 200 in 768 (1,680). Level 300 in 1,307 (3,120). **Level 400 in 2,119 (4,580), day 176 against day 382** | the MID four on the hardest tier it holds, which is Deadly at every checkpoint from 5 | 2.43 to 3.42 times the contract at 35 to 100, matching the grid to 0.2% | four: XP calibrated, and the real four's seats are faster still (F11) | The seat Tyler ruled as the clock runs 1.7 times ahead of the table at Level 25 and 2.2 to 2.9 times from Level 50. The lone MID hero is also ahead now: Level 100 in 427 hours and Level 400 on day 279. Before the spell rule the lone hero sat on the table (Level 25 in 35 hours against 36) |
| 15 | **R2: days of open content** | at least 120 | **22.9** for four friends. The solver's own four, which buys its slots and levels four heroes, reaches Level 110 on day 23.3. The lone MID hero on Normal on day 42.3, and on the solver's best lone path on day 28.6 | the pace seat to Level 110 | | as red 14 | Every reading is under half the red line of 90 days. Everything staged is gone by day 57 |
| 16 | **C2, C1, C3: server cost** | 60 database-seconds an account-day. 1.25 a hero-hour. 1 journal row a hero-hour an activity | **605**, **12.6**, **239** | the cost model on the own four at 12 h | not a cell. Cross-checked on the journal: about 390 rows a hunted hero-hour between two reads a day apart, and 426 on the Krell hunt | a model (F9). Real is worse on rows | Ten times the budget on database time. The model's 239 rows is the optimistic number |
| 17 | P7.4 and P8: the four on Deadly | 1.8 to 2.5. BiS at most 2.75 | MID 3.14, 2.82, 3.42, 3.20 and 3.13 at Levels 35 to 60, and 2.81 at 88. BiS 3.78, 3.22, 3.84, 3.72, 3.60 and 2.99 | 35 to 60 and 88, four, Deadly | 3.14, 3.42, 3.20, 3.11, 2.81 | four: XP calibrated. The real four read 2.85 before the spell rule | Coppercap, Hask's Ford, the Slake and Muster Barrows all pay a four over 3 times the contract. From 100 up the four is inside its band |
| 18 | S4, S6 and S11: Deadly against a four, at every Level | lowest health 15 to 40%. 50 to 100 deaths in 1,000 hours | **69 to 86% from Level 35 to Level 400**, 28 of 28 checkpoints red. In the death sample the MID four and the MID three died 0 times in 128 and 96 hero-hours at Level 88, and so did the LOW four and the LOW three | every checkpoint, MID four, Deadly | 80% at 88, 0 deaths in 24 hours | cannot be calibrated. Real: 0 deaths in 60 hours. On Krell's Hold the harness four also takes a third less damage than the real one (2.1) | Deadly never threatens a four, so the 6% death cost never comes due and "struggle or pay" is only "pay". The new band S11 says what would happen if the ruled count were met: at 100 deaths in 1,000 hours and 6% of all Level XP a death, a MID four on Deadly would earn less a head than the lone hero on Normal from Level 145 with every Blessing (12 of 29 checkpoints red) and from Level 75 with none (17 of 29). By Level 300 with every Blessing it would be losing XP outright. The two rulings of 11-21 (a flat death count, and a flat 6% with no cap) cannot both be met by a MID party past Level 145 |
| 19 | P6.4: the four on Normal, past the first days | 1.15 to 1.25 a head over lone | 0.57 to 0.60 at 45 and 50. **0.52 to 0.58 from 75 to 110.** 0.69 to 0.75 from 125 to 400 | 22 of 27 checkpoints, MID, Normal | 0.52 at 88 | four side calibrated | Normal is not a party tier anywhere in the game. This is the same fault as red 6, and it is why every real party sits on Deadly |
| 20 | P2: the lone MID hero on Normal | 0.95 to 1.10 times the contract | **1.15 to 1.73 from Level 45 to 400**, 25 of 31 checkpoints red. 0.79 at Level 40 | lone MID, Normal | 1.73 at 88, 1.33 at 110 | lone: not calibrated | The spell rule moved the lone melee hero from on the line to 15 to 70% over it. This is the hammer, the grid's lone seat. Other ways were not played alone |
| 21 | P4 and E1: what gear is worth past the early tiers | BiS 1.10 to 1.20 times MID. A weapon step +5 to 8%. An armor step 3 to 5% | BiS **under 1.10 at 24 of 31 checkpoints, and 1.03 to 1.06 from 165 up**. The armor step reads between -4% and +2% at all 18 checkpoints from Level 60, which is nothing. Weapon step 2 to 3% from 200 | lone, Normal, all checkpoints | | lone: not calibrated. 110 to 185 is the kit gap (F6). Past 185 is PROJECTED | A full BiS kit is worth less than one ruled weapon step. Armor past tier 5 changes nothing on Normal, because the hero is already at 86% health or more |
| 22 | T4, A4, A5: where gear comes from | a quarter to 45% of the MID to BiS gap through a bench. Every MID slot has a source in its own band | **80 to 100% through a bench** in every band. **261 MID slots** with no source inside the band's own grounds or the town. 19 BiS kits miss a dropped, a crafted or a won piece | the solver and the atlas | | COMPUTED | The step from MID to BiS is almost all jewelry, Hallmarks and Tempering. Drops fill MID and then stop mattering |
| 23 | B1 and A6: how long full BiS takes | 0.7 to 1.0 of the band. Two ways to a piece within 3 times of each other | Levels 88 to 110: **123 days against a 14 day band (8.8)**. 45 to 60: 3.8. 75 to 88: 4.6. 52 of 302 pieces have a way over 5 times slower than their best | the solver, lone, free | | COMPUTED | The weekly-limited chest pieces are meant to be left out under Level 88 (call 6). The solver still counts them, so part of this is the rule and part is the solver. The re-dive has to split it |
| 24 | G-5: LOW on Deadly should lose gold | at most 0 | a LOW four **earns** on Deadly at 22 of 29 checkpoints: +6,273 at Level 88, +25,279 at 400 | LOW four, Deadly | +4,616 at Level 79 on Krell | gold fails calibration, and the real bill is half the harness bill, so real LOW earns more | A LOW four also holds Deadly outright from Level 75 (0 deaths, 71% health at 88). The standard says LOW holds Normal and nothing else |
| 25 | The lone hero has no ground from Level 32 to 44 | P2 0.95 to 1.10 | 0.91 at Level 35, **0.79 at Level 40** | lone MID, Normal, Mosslight Glade (band 16 to 31) | Coppercap at Level 37, lone MID, Normal: 1.69 times the contract, 69% lowest health, +9,418 gold | lone: not calibrated. The QA account's real hours on that cell read 1.56 | The game advises a lone hero the Glade until 45, because Coppercap is marked for parties with `soloFrom: 45` (`src/data/hunt-grounds.js`). A MID hero holds Coppercap on Normal from at least 37 and earns twice as much there. A LOW hero does not (44% health, -2,011 gold) |
| 26 | P5: BiS over LOW on Normal | at most 1.5 | 1.68 and 1.73 alone at 20 and 25. 1.79 to 1.89 for the pair and the three at 35 and 40 | 7 red rows of 118 | 1.67 at Level 20 | not calibrated | After fault F1 this band is nearly green. Its reds are the same tier 1 to tier 2 wall as red 9 |

**Not on the list on purpose.** G-2 on Normal for a four reads 30 to 83% of income against a target of 15%. The real untiered party paid 8%. That is the harness bill (F5), not the game. P9 and P10 read "holds", which leans on that same bill. S5 mixes cells where the kit dies. All three stay in section 5 as red with the reason beside them.

### 4.4 The death sample

Levels 10, 20 and 88, every harder-tier cell: 90 cells at 4 seeds of 8 hours. Read it with fault F4 in mind. On a cell that fails, the count is how often an endless retry dies, so the table also gives the minutes between deaths. Each entry is deaths in 1,000 hunted hours, then the lowest health in a typical fight. The ruled MID counts are 10 to 30 on Dangerous and 50 to 100 on Deadly.

| Level, ground | Tier | Party | LOW | MID | BiS |
|---|---|---|---|---|---|
| 10, wickstead | dangerous | lone | 2.2k (a death every 28 min), 50% low | 0, 83% low | 0, 89% low |
| 10, millrace sewer | dangerous | 2 | 0, 58% low | 0, 87% low | 0, 90% low |
| 10, millrace sewer | dangerous | 3 | 0, 79% low | 0, 94% low | 0, 96% low |
| 10, millrace sewer | dangerous | 4 | 0, 84% low | 0, 95% low | 0, 97% low |
| 10, wickstead | deadly | lone | 19.1k (a death every 3.1 min), 35% low | 0, 73% low | 0, 83% low |
| 10, millrace sewer | deadly | 2 | 125, 45% low | 0, 82% low | 0, 87% low |
| 10, millrace sewer | deadly | 3 | 0, 74% low | 0, 92% low | 0, 94% low |
| 10, millrace sewer | deadly | 4 | 0, 78% low | 0, 93% low | 0, 95% low |
| 20, mosslight glade | dangerous | lone | 56.4k (a death every 1.1 min), 2% low | 2.9k (a death every 21 min), 28% low | 313, 35% low |
| 20, mosslight glade | dangerous | 2 | 2.8k (a death every 22 min), 24% low | 0, 44% low | 0, 56% low |
| 20, mosslight glade | dangerous | 3 | 0, 52% low | 0, 74% low | 0, 79% low |
| 20, mosslight glade | dangerous | 4 | 0, 57% low | 0, 78% low | 0, 86% low |
| 20, mosslight glade | deadly | lone | 317.7k (a death every 0.2 min), 0% low | 95.5k (a death every 0.6 min), 0% low | 32.9k (a death every 1.8 min), 15% low |
| 20, mosslight glade | deadly | 2 | 1.3k (a death every 47 min), 43% low | 1.3k (a death every 46 min), 33% low | 31, 43% low |
| 20, mosslight glade | deadly | 3 | 2.5k (a death every 24 min), 33% low | 0, 72% low | 0, 76% low |
| 20, mosslight glade | deadly | 4 | 406, 41% low | 0, 76% low | 0, 83% low |
| 88, krells hold | dangerous | lone | 24.7k (a death every 2.4 min), 16% low | 1.1k (a death every 53 min), 32% low | 125, 36% low |
| 88, krells hold | dangerous | 2 | 47, 40% low | 0, 56% low | 0, 66% low |
| 88, krells hold | dangerous | 3 | 0, 74% low | 0, 80% low | 0, 86% low |
| 88, krells hold | dangerous | 4 | 0, 76% low | 0, 86% low | 0, 90% low |
| 88, krells hold | deadly | lone | 72.6k (a death every 0.8 min), 0% low | 13.0k (a death every 4.6 min), 22% low | 2.8k (a death every 22 min), 29% low |
| 88, krells hold | deadly | 2 | 2.5k (a death every 24 min), 30% low | 0, 48% low | 0, 56% low |
| 88, krells hold | deadly | 3 | 0, 68% low | 0, 77% low | 0, 80% low |
| 88, krells hold | deadly | 4 | 0, 72% low | 0, 80% low | 0, 86% low |

What it says:

1. **No cell sits inside a ruled death count.** Of the 24 MID cells, 19 read 0 and 5 read 1,100 to 95,000. A tier either cannot kill the party or kills it inside the hour. Nothing in between exists to tune toward.
2. **Party size decides it, not gear.** A three or a four did not die on 34 of 36 cells, in LOW, MID and BiS alike. The two that died are the LOW three and the LOW four on Deadly at Level 20. A lone hero at Level 20 and at Level 88 died on every cell, on both tiers, in every kit: best in slot alone on Deadly dies every 2 minutes at Level 20 and every 22 minutes at Level 88.
3. **Level 10 is free.** MID and BiS never died, at any party size, on either tier. A lone MID hero on Deadly on Wickstead sits at 73% health.
4. **The pair is the only seat near a band.** A MID pair on Deadly at Level 88 did not die and sat at 48% health. At Level 20 it died every 46 minutes.
5. **S6 is now judged at 3 of 31 checkpoints** and all six rows are red there. The other 28 checkpoints are thin until the nightly death run has played them.

---

## 5. Every band the grid judges

85 bands. "Rows" are checkpoint cells, or one row a Level for a table. The sample is the cell's own. A row marked red here is red on the harness. Read the Trust column before acting on it.

| Band | Target | Measured, lowest to highest | Worst cell | In band / off / red | Sample | Verdict | Trust |
|---|---|---|---|---|---|---|---|
| P1 | 0.9 to 1.1 (RULED) | 0.35 to 0.59 | Level 50 (mid:4:hardest): 59 h / 168 h | 0 / 0 / 7 | 7 rows, 2 seeds x 2 h a cell | red | four: XP calibrated, the tier it holds is not |
| P2 | 0.95 to 1.1 (RULED) | 0.79 to 6.53 | 1 mid x1 normal: 6.53 | 2 / 4 / 25 | 31 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| P3 | 0.8 to 0.9 (PROPOSED) | 0.67 to 0.98 | 25 low x1 normal: 0.67 | 8 / 18 / 5 | 31 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| P4 | 1.1 to 1.2 (RULED) | 1.02 to 1.25 | 15 bis x1 normal: 1.02 | 7 / 24 / 0 | 31 rows, 2 seeds x 2 h a cell | off target | lone: not calibrated |
| P5 | at most 1.5 (PROPOSED) | 1.01 to 1.89 | 35 bis x2 normal: 1.89 | 106 / 5 / 7 | 118 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| P6.2 | 1.05 to 1.15 (RULED) | 0.85 to 2.53 | 40 mid x2 normal: 2.53 | 12 / 75 / 0 | 87 rows, 2 seeds x 2 h a cell | off target | pair: not calibrated |
| P6.3 | 1.1 to 1.2 (RULED) | 0.66 to 2.38 | 40 mid x3 normal: 2.38 | 6 / 81 / 0 | 87 rows, 2 seeds x 2 h a cell | off target | three: not calibrated |
| P6.4 | 1.15 to 1.25 (RULED) | 0.50 to 2.39 | 375 mid x4 deadly: 2.39 | 7 / 34 / 40 | 81 rows, 2 seeds x 2 h a cell | red | four side calibrated, lone side not |
| P7.2 | 1.2 to 1.5 (RULED) | 1.25 to 5.07 | 5 mid x2 deadly: 5.07 | 9 / 2 / 18 | 29 rows, 2 seeds x 2 h a cell | red | pair: not calibrated |
| P7.3 | 1.5 to 2 (RULED) | 1.16 to 4.78 | 5 mid x3 deadly: 4.78 | 4 / 13 / 12 | 29 rows, 2 seeds x 2 h a cell | red | three: not calibrated |
| P7.4 | 1.8 to 2.5 (RULED) | 1.84 to 3.42 | 45 mid x4 deadly: 3.42 | 8 / 0 / 6 | 14 rows, 2 seeds x 2 h a cell | red | four: XP calibrated, the tier it holds is not |
| P8 | at most 2.75 (RULED) | 1.73 to 4.87 | 5 bis x4 deadly: 4.87 | 20 / 0 / 9 | 29 rows, 2 seeds x 2 h a cell | red | four: XP calibrated, the tier it holds is not |
| P9.dangerous | 1.1 to 1.25 (PROPOSED) | 0.99 to 3.89 | 50 bis x4 dangerous: 3.89 | 3 / 216 / 4 | 223 rows, 2 seeds x 2 h a cell | red | reads "holds", which leans on gold: not calibrated |
| P9.deadly | 1.3 to 1.6 (PROPOSED) | 0.84 to 4.31 | 50 bis x4 deadly: 4.31 | 4 / 149 / 27 | 180 rows, 2 seeds x 2 h a cell | red | reads "holds", which leans on gold: not calibrated |
| P10 | at most 1 (RULED) | -23.5k to 2.25 | 50 mid x2 dangerous: 2.25 | 137 / 0 / 75 | 212 rows, 2 seeds x 2 h a cell | red | reads "holds", which leans on gold: not calibrated |
| P11.early | at most 2 (RULED) | 0.02 to 1.09 | none out | 9 / 0 / 0 | 9 rows, 2 seeds x 2 h a cell | green | lone: not calibrated |
| P11.ten | 5 to 7 (RULED) | 4.15 to 4.15 | hours to Level 10 (LOW lone Normal. G6 is the played life): 4.15 | 0 / 1 / 0 | 1 row, 2 seeds x 2 h a cell | off target | lone: not calibrated |
| P11.smooth | at most 2 (RULED) | 1.96 to 1.96 | none out | 1 / 0 / 0 | 1 row, 2 seeds x 2 h a cell | green | four: XP calibrated, the tier it holds is not |
| P12.to300 | at most 15 (PROPOSED) | 1.01 to 6.06 | none out | 22 / 0 / 0 | 22 rows, 2 seeds x 2 h a cell | green | four: XP calibrated, the tier it holds is not |
| P12.to400 | at most 24 (PROPOSED) | 5.71 to 9.23 | none out | 4 / 0 / 0 | 4 rows, 2 seeds x 2 h a cell | green | four: XP calibrated, the tier it holds is not |
| P13 | at most 0.05 (RULED) | - | - | - | - | unjudged: events: the grid plays no event calendar |  |
| S1.low | 0.45 to 0.7 (PROPOSED) | 0.58 to 0.98 | 110 low x4 normal: 0.98 | 7 / 105 / 0 | 112 rows, 2 seeds x 2 h a cell | off target | not calibrated. Real new players die on Normal (2.2) |
| S1.mid | 0.6 to 0.8 (RULED) | 0.76 to 1.00 | 15 mid x4 normal: 1.00 | 11 / 101 / 0 | 112 rows, 2 seeds x 2 h a cell | off target | not calibrated. Real new players die on Normal (2.2) |
| S1.bis | 0.75 to 0.95 (PROPOSED) | 0.79 to 1.00 | 15 bis x3 normal: 1.00 | 51 / 61 / 0 | 112 rows, 2 seeds x 2 h a cell | off target | not calibrated. Real new players die on Normal (2.2) |
| S2.low | at most 5 (PROPOSED) | 0.00 to 0.00 | none out | 1 / 0 / 0 | 0 deaths in 1120 hero-hours | green | not calibrated. Real new players die on Normal (2.2) |
| S2.mid | at most 1 (RULED) | 0.00 to 0.00 | none out | 1 / 0 / 0 | 0 deaths in 1120 hero-hours | green | not calibrated. Real new players die on Normal (2.2) |
| S2.bis | at most 0.1 (PROPOSED) | 0.00 to 0.00 | none out | 1 / 0 / 0 | 0 deaths in 1120 hero-hours | green | not calibrated. Real new players die on Normal (2.2) |
| S3.mid | 0.35 to 0.6 (RULED) | 0.00 to 0.99 | 250 mid x1 dangerous: 0.00 | 18 / 17 / 75 | 110 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S3.bis | 0.55 to 0.75 (PROPOSED) | 0.00 to 1.00 | 325 bis x1 dangerous: 0.00 | 18 / 61 / 31 | 110 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S4.mid | 0.15 to 0.4 (RULED) | 0.00 to 0.98 | 15 mid x4 deadly: 0.98 | 21 / 6 / 83 | 110 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S4.bis | 0.35 to 0.5 (RULED) | 0.00 to 1.00 | 15 bis x4 deadly: 1.00 | 12 / 6 / 92 | 110 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S5.low | 1.15 to 1.35 (PROPOSED) | 0.63 to 3.21 | 45 low x4 dangerous: 3.21 | 125 / 65 / 160 | 350 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S5.bis | 0.8 to 0.9 (RULED) | 0.56 to 1.76 | 375 bis x2 deadly: 1.76 | 111 / 183 / 56 | 350 rows, 2 seeds x 2 h a cell | red | cannot be calibrated: no real low point |
| S6.dangerous.low | 60 to 150 (PROPOSED) | 0.00 to 56.4k | 20 low x1 dangerous: 56.4k | 0 / 5 / 7 | 12 cells at 4 seeds x 8 h, 98 cells not played | red | cannot be calibrated: no real low point |
| S6.dangerous.mid | 10 to 30 (RULED) | 0.00 to 2875 | 20 mid x1 dangerous: 2875 | 0 / 0 / 12 | 12 cells at 4 seeds x 8 h, 98 cells not played | red | cannot be calibrated: no real low point |
| S6.dangerous.bis | 2 to 10 (PROPOSED) | 0.00 to 313 | 20 bis x1 dangerous: 313 | 0 / 10 / 2 | 12 cells at 4 seeds x 8 h, 98 cells not played | red | cannot be calibrated: no real low point |
| S6.deadly.low | at least 200 (PROPOSED) | 0.00 to 317.7k | 10 low x3 deadly: 0.00 | 7 / 0 / 5 | 12 cells at 4 seeds x 8 h, 104 cells not played | red | cannot be calibrated: no real low point |
| S6.deadly.mid | 50 to 100 (RULED) | 0.00 to 95.5k | 20 mid x1 deadly: 95.5k | 0 / 0 / 12 | 12 cells at 4 seeds x 8 h, 98 cells not played | red | cannot be calibrated: no real low point |
| S6.deadly.bis | 10 to 30 (PROPOSED) | 0.00 to 32.9k | 20 bis x1 deadly: 32.9k | 0 / 10 / 2 | 12 cells at 4 seeds x 8 h, 98 cells not played | red | cannot be calibrated: no real low point |
| S7.mid | at least 0.99 (RULED) | 1.00 to 1.00 | none out | 1 / 0 / 0 | 0 deaths in 1120 hero-hours | green | not calibrated. Real new players die on Normal (2.2) |
| S7.low | at least 0.9 (PROPOSED) | 1.00 to 1.00 | none out | 1 / 0 / 0 | 0 deaths in 1120 hero-hours | green | not calibrated. Real new players die on Normal (2.2) |
| S11.blessed | at least 1 (PROPOSED) | -1.23 to 3.48 | Level 400 (the MID four, hardest tier held): -4794.9k on deadly at 100 deaths in 1,000 h / 3911.3k alone | 17 / 0 / 12 | 29 rows, 2 seeds x 2 h a cell | red | derived: the ruled death count and cost on measured XP |
| S11.unblessed | at least 1 (PROPOSED) | -9.33 to 3.16 | Level 400 (the MID four, hardest tier held): -36489.1k on deadly at 100 deaths in 1,000 h / 3911.3k alone | 12 / 0 / 17 | 29 rows, 2 seeds x 2 h a cell | red | derived: the ruled death count and cost on measured XP |
| S10 | at most 0.2 (PROPOSED) | 0.00 to 0.04 | none out | 23 / 0 / 0 | 23 rows, 2 seeds x 2 h a cell | green | computed from price rows and lone cells |
| G-1 | at least 1 (RULED) | 0.87 to 1.78 | 125 mid x1 normal: 0.87 | 27 / 0 / 3 | 30 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| G-2.normal | at most 0.15 (PROPOSED) | 0.00 to 1.01 | 40 mid x2 normal: 1.01 | 28 / 0 / 84 | 112 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-2.dangerous | 0.25 to 0.4 (PROPOSED) | 0.02 to 3.96 | 50 mid x1 dangerous: 3.96 | 4 / 31 / 75 | 110 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-2.deadly | 0.45 to 0.65 (PROPOSED) | 0.02 to 5.99 | 50 mid x1 deadly: 5.99 | 32 / 22 / 56 | 110 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-3 | 0.6 to 0.85 (PROPOSED) | -0.36 to 1.48 | 10 low x3 normal: -0.36 | 28 / 82 / 7 | 117 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| G-4 | 3000 to 8000 (RULED) | 5388 to 12.0k | 100 mid x4 deadly: 12.0k | 2 / 4 / 0 | 6 rows, 2 seeds x 2 h a cell | off target | gold: fails calibration (party store bill about twice real) |
| G-5 | at most 0 (RULED) | -125.9k to 25.3k | 5 low x2 deadly: 538 | 68 / 0 / 48 | 116 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-6 | at least 1 (PROPOSED) | -11.8 to 4.41 | 225 bis x2 deadly: -11.8 | 48 / 0 / 34 | 82 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-8 | at most 60 (PROPOSED) | 0.01 to 2.09 | none out | 31 / 0 / 0 | 31 rows, 2 seeds x 2 h a cell | green | lone: not calibrated |
| G-9 | 0.35 to 0.5 (PROPOSED) | 0.00 to 5.99 | 50 mid x1 deadly: 5.99 | 52 / 73 / 151 | 276 rows, 2 seeds x 2 h a cell | red | gold: fails calibration (party store bill about twice real) |
| G-10 | 1.2 to 1.4 (RULED) | 0.00 to 0.74 | Level 1 (band 1): 0 / 25529 | 0 / 0 / 22 | 22 rows, 2 seeds x 2 h a cell | red | lone: not calibrated |
| G-11 | 0.85 to 1 (PROPOSED) | - | - | - | - | unjudged: server gold: needs the server gold model (X14), not a cell |  |
| E1.levels | 15 to 25 (RULED) | 13.0 to 22.0 | 75->88: 13.0 | 19 / 2 / 0 | 21 rows, 2 seeds x 2 h a cell | off target | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E1.weapon | 0.05 to 0.08 (RULED) | 0.00 to 0.16 | Level 20: 0.16 | 6 / 6 / 14 | 26 rows, 2 seeds x 2 h a cell | red | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E1.armor | 0.03 to 0.05 (RULED) | -0.03 to 0.22 | Level 20: 0.22 | 0 / 6 / 20 | 26 rows, 2 seeds x 2 h a cell | red | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E2.toKrell | at most 0.15 (PROPOSED) | 0.03 to 0.61 | Level 5: 7.8 h, 1 piece(s) not on this ground | 13 / 1 / 3 | 17 rows, 2 seeds x 2 h a cell | red | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E2.after | at most 0.35 (PROPOSED) | 0.07 to 0.07 | none out | 1 / 0 / 0 | 1 row, 2 seeds x 2 h a cell | green | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E3 | at most 0.1 (PROPOSED) | 0.03 to 0.13 | Level 15 (band 15): 25595 / 197450 | 10 / 12 / 0 | 22 rows, 2 seeds x 2 h a cell | off target | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E4 | 1 to 1.4 (RULED) | 0.00 to 0.74 | Level 1 (band 1): 0 / 25529 | 0 / 0 / 22 | 22 rows, 2 seeds x 2 h a cell | red | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E5.toKrell | at most 0.5 (RULED) | - | - | - | - | unjudged: no reader in grid-derive.mjs yet |  |
| E5.after | at most 1 (RULED) | - | - | - | - | unjudged: no reader in grid-derive.mjs yet |  |
| E6.toKrell | at most 24 (PROPOSED) | 8.34 to 22.2 | none out | 11 / 0 / 0 | 11 rows, 2 seeds x 2 h a cell | green | lone: not calibrated. Levels 110 to 185: kit gap (F6) |
| E6.after | at most 60 (PROPOSED) | - | - | - | 14 rows | unjudged (an upper bound): an upper bound: band starts only. rungs and jewelry change in between (a played life judges it) |  |
| E7 | at most 0.09 (PROPOSED) | - | - | - | - | unjudged: the Add pool: balance guard G10 plays it |  |
| E8 | at least 1 (PROPOSED) | - | - | - | - | unjudged: gold-for-power offers: balance guard G12 |  |
| D1 | 60 to 90 (RULED) | - | - | - | 18 rows | unjudged (a stand-in): the Very Rare is not built (L20). the rarest reveal row by formula on measured kills, never judged |  |
| D2 | 60 to 90 (RULED) | - | - | - | 14 rows | unjudged (a stand-in): the Very Rare is not built (L20). the rarest reveal row, the party's hours |  |
| D4 | at most 104 (RULED) | - | - | - | - | unjudged: Magic Find: balance guard G13 (Luck not built) |  |
| R1 | at least 14 (RULED) | - | - | - | - | unjudged: region open dates: a schedule, not a cell |  |
| R2 | at least 120 (RULED) | 22.9 to 22.9 | the pace seat (mid:4:hardest) reaches Level 110: 22.9 | 0 / 0 / 1 | 1 row, 2 seeds x 2 h a cell | red | four: XP calibrated, the tier it holds is not |
| R3 | at least 1 (PROPOSED) | - | - | - | - | unjudged: Levels authored a month: the pack log |  |
| C1.1k | at most 1.25 (COMPUTED) | 12.6 to 12.6 | the Own four, 12 h, today's engine: 12.6 | 0 / 0 / 1 | model | red | a model on real means of 11-20 (F9) |
| C1.10k | at most 0.5 (COMPUTED) | 12.6 to 12.6 | the Own four, 12 h, today's engine: 12.6 | 0 / 0 / 1 | model | red | a model on real means of 11-20 (F9) |
| C2.1k | at most 60 (COMPUTED) | 605 to 605 | the Own four, 12 h, today's engine: 605 | 0 / 0 / 1 | model | red | a model on real means of 11-20 (F9) |
| C2.10k | at most 24 (COMPUTED) | 605 to 605 | the Own four, 12 h, today's engine: 605 | 0 / 0 / 1 | model | red | a model on real means of 11-20 (F9) |
| C3 | at most 1 (RULED) | 239 to 239 | the Own four, 12 h (every activity): 239 | 0 / 0 / 1 | model | red | a model on real means of 11-20 (F9) |
| C4.1k | at most 0.15 (RULED) | - | - | - | model | unjudged: money: measure.mjs cost |  |
| C4.10k | at most 0.15 (RULED) | - | - | - | model | unjudged: money: measure.mjs cost |  |
| C4b.1k | at most 80 (PROPOSED) | - | - | - | model | unjudged: the other lines of the bill: 28-platform's price list |  |
| C4b.10k | at most 1015 (PROPOSED) | - | - | - | model | unjudged: the other lines of the bill: 28-platform's price list |  |
| C5 | at most 0.7 (PROPOSED) | - | - | - | model | unjudged: capacity: measure.mjs cost and the load rig |  |

---

## 6. The 23 bands of the atlas and the solver

Read from `atlas.json` and `paths.json`, both re-run on this branch on the final grid and on the ground-rate table as the matrix now writes it (fault F14). COMPUTED on MEASURED rates, never played by a person.

| Band | Target | Measured | Verdict | Note |
|---|---|---|---|---|
| A1 items with no source a player can reach | 0 | 220, of which 5 are undeclared | red | 76 wait for their ground, 44 are staged, 36 and 26 are marked for later, 18 are marked cut, 8 are planned. RULED 11-21: nothing planned for later is cut. The 5 undeclared are the real count |
| A2 sources nothing uses | 0 | 2 | red | |
| A3 sources with no time cost | 0 | 4 of 1,913 | red | three recipes whose input has no priced route, and burnt food |
| A4 MID slots with no source in their own band | every slot has one | 261 slots without | red | checkpoint by way by slot, Levels 1 to 185 |
| A5 BiS kits with a dropped, a crafted and a won piece | all three, from Level 30 | 19 kits miss one | red | |
| A6 slowest way over fastest way to one piece | at most 3, red over 5 | 52 of 302 over 5 | red | the worst are tier 7 pieces that drop on the Ox Road and also come from Krell's Hall, over 900 times apart |
| A7 skill stretches with no product on a best path | 0 | 44 stretches | red, overstated | all of cooking, fishing, runecrafting and Inner Flame are on it because the solver has no supplies goal yet (T3) |
| T1 a town skill from 1 to 99 | 60 to 120 days, red under 30 | 68 to 89 days for six skills. Smithing 44.5. Inner Flame 37.6 | off target | with inputs bought and not gathered: Smithing 2.4 days, Runecrafting 5.5, Crafting 7.2, Cooking 12.9. That reading is red |
| T2 a rested hour's gold beside a hunted hour's | 15 to 35% | 25 to 32% | green | |
| T3 supplies a hero's rested hours can cover | 25 to 50% | no reader | unjudged | the solver has no supplies goal |
| T4 share of the MID to BiS gap through a bench | 25 to 45%, red over 60% | 80 to 100% in every band | red | red 22 |
| T5 a player who never touches a bench | full BiS inside 1.5 times the best path | 1.35 | green | 337 days against 249 |
| T6 a player who only crafts and gathers | 40 to 70% of a hunter's gold | 40 to 48% | green | at the bottom of the band at every checkpoint |
| T7 rested hours the best path wants a day | 6 to 12 | 12 for a lone hero chasing MID, 10.3 for a four. 3.5 to 4.0 for a three or a four chasing BiS | off target | the parties chasing BiS leave most of their rested hours unused |
| B1 days to full BiS in a band, to Krell | 0.7 to 1.0, red over 1.5 | 0.70, 4.43, 1.26, 3.82, 1.06, 4.63, 8.79 | red | reds 13 and 23 |
| B2 days to full BiS in a region, past Krell | 1.0 to 2.0 | 0.99 | off target, by a hair | 55 days in a 56 day region |
| B3 the path the screen recommends against the best | within 15%, red over 30% | 1.76 alone, 2.36 to 3.81 for parties, at the worst checkpoint | red | the blind play that calibrates B3 has not been done. The party readings doubled when F14 was fixed, because the best path now uses the harder tiers and the screen's advice does not |
| B4 open grounds on no best path | 0 | 0 | green | |
| B5 a ground on the fastest path past its own band | at most 10 Levels, red over 20 | Krell's Hold on Dangerous for a lone hero 55 past. Ox Road 37. Wyvern Roost 23 | red | |
| B6 free against Premium, hunted hours | the same | the same | green | |
| B7 things only bought gold can reach | none | no list is printed. Bought gold is 389 times sooner alone and 106 times for a four | unjudged | an upper bound: it assumes a market with no limit at the maker's price. The band is about what, and the solver prints how much sooner |
| B8 the unlucky route against the median | at most 2, red over 3 | up to 4.6 (lone, Levels 1 to 15) | red | 13 of 32 rows read the 90th percentile equal to the median (F12) |
| B9 a party path against the lone path, a head | never slower | the four 1.32 slower at Level 10, the three 1.11 at Level 15, the pair level | red | red 6. It read 1.29 to 1.43 for all three before F14 |

**The solver's verdicts under rule 10.4.** DOMINANT: loot (every gear slot at Levels 60 to 75 for a three), jewelry (the next way to its pieces is 12 times slower), the Shop (16 of 24 slots at Levels 1 to 15 alone), smithing (2.4 times). UNMEASURED: cooking, farming, runecrafting, training, trophies, linings and uniques. HEALTHY: 17. FAILS ITS PURPOSE and NEGLECTED: none. The solver does not judge 86 systems that have no source row.

A cold read of that list: loot DOMINANT is the ruled design (drops fill MID to Krell), so it should not be nerfed on this evidence. Jewelry at 12 times is the finding worth a re-dive, and it is the same thing as T4. Seven UNMEASURED systems out of 28 judged is a harness gap, not a clean bill.

---

## 7. What stays thin or unjudged, and why

| Bands | State | Why | What closes it |
|---|---|---|---|
| S6, all six rows, at 28 of 31 checkpoints | thin | the grid's 2 seeds of 2 hours cannot see a death rate. The death run plays 4 seeds of 8 hours, and a third of the harder cells is about 11 worker-hours. This lane played Levels 10, 20 and 88 in full (90 cells) | the nightly death run, three nights |
| S6 on any cell that fails | judged, and the number is not a rate | fault F4 | minutes to the first death |
| D1, D2 | unjudged, a stand-in | the Very Rare is not built (plan lane L20). The rarest reveal row reads one every 8 to 14 lone hours, which is a different thing | L20 |
| E6 past Level 30 | unjudged, an upper bound | it reads band starts only. Rungs and jewelry change in between | a played life |
| E5 | unjudged | no reader. The atlas has the chest rows now | a reader in `grid-derive.mjs` |
| E7, E8, D4 | unjudged here | the balance guard's own lines G10, G12 and G13 play them | nothing, by design |
| P13, G-11, R1, R3, C4, C4b, C5 | unjudged | events, server-wide gold, schedules and money are not cells | their own models (X14, X16, X17) |
| T3, B7 | unjudged | section 6 | a supplies goal, and a list for B7 |
| A7, B8 | red, overstated | section 6 | the same supplies goal, and chance that varies |
| Every lone, pair and three band | judged, in report | section 2 | real hours on current rules |
| Every party gold band, P9, P10 | judged, in report | fault F5 | the real four's supply rule in the kit, then a re-play |
| Every LOW against MID reading from 110 to 185 | judged, and wrong | fault F6 | the unique lines in `grid-kit.mjs` |
| Everything past Level 185 | PROJECTED | placeholder grounds and a projected gear line | regions 4 to 7 being designed |

**The count.** The grid's 85 bands: 45 red, 10 off target, 13 green, 17 unjudged. The atlas and the solver's 23: 13 red, 3 off target, 5 green, 2 unjudged. Together, of 108: **58 red, 13 off target, 18 green, 19 unjudged**. No band is thin as a whole any more. S6 is judged at 3 checkpoints and thin at 28.

---

## 8. For the eight re-dives

Where each domain starts on this page. The judging rule is `50-standards.md` 10.4, and a CUT applies only to a thing with no place in the plan or roadmap (RULED 11-21).

| Domain | Start at | The question the baseline leaves it |
|---|---|---|
| Combat (21) | reds 4, 6, 7, 8, 18, 19, 20 | The tiers scale with nothing a player controls. They are free under Level 16, lethal to a lone hero at a band's floor after it and harmless to a four at every Level. Normal pays a party half. Is a tier a party-size thing, and if so what is the lone hero's harder content. Also: an unchallenged shooter aims at the last seat of the party, not at the hero standing farthest back as its row says (2.1) |
| Endgame (22) | reds 14, 15, 18, 23 | The clock is 2.2 to 2.9 times fast on the ruled seat. The Level curve re-fit of call 1 is now the largest single number in the program. And S11: the flat death count and the flat 6% cannot both be met by a MID party past Level 145 |
| Items (23) | reds 2, 9, 10, 12, 21, 22, 26 | Gear is too strong at the first tier step and worth almost nothing after Level 60. BiS costs half a band and is almost all bench |
| Economy (24) | reds 12, 24, section 2.1 | No party gold band can be trusted until F5 is closed. Start there, not at a price |
| Social (25) | reds 6, 19, fault F11 | A party on Normal is a penalty. The four players field has a hammer in front, not a shield |
| Home (26) | T1, T4, T7 | Benches level in days if inputs are bought, and parties chasing BiS use 3 to 4 of their 12 rested hours |
| Retention (27) | reds 1, 2, 3, 5, 25 | The first hour has no danger on the harness and real deaths in play. Setup quality (X20) is the gap between the two, and nothing measures it yet |
| Platform (28) | red 16, fault F9 | Re-read the cost means after the server-cost lane has a day of data |
