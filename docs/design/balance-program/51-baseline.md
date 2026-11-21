# Balance program 51: is the measuring instrument true

Steps 2 and 3 of the overhaul (`50-standards.md` section 7), on `lane/d-baseline`, by a reader who did not build the harness. No game code, game data or migration was changed. Harness code was changed, and section 3 says where.

**What this page is.** One question: can the harness, the judge, the atlas and the solver be trusted to measure a game. It holds the harness against real play (section 2), lists every fault found in the instrument and what was fixed (section 3), and says for every band what reads it and how far that reading can be trusted (sections 4 to 7). It carries no findings about any game's balance. The values for any tree come from the tools and the dashboard, read against the bands of `50-standards.md`.

**Labels.** MEASURED means played on the real engine by the grid (`tools/balance-program/progression-grid.mjs`). RE-RUN means I played the same cell again on three fresh seeds outside the cache. REAL means production, read-only, aggregated. COMPUTED means the solver or a model worked it out from measured rates. A band is **judged** (something reads it on a sample that can see it), **thin** (the sample cannot see it) or **unjudged** (no reader, or the number is a stand-in, with the reason).

**The tree the instrument was run on.** `set/v0.2.144` at 2ed91c29a, with this lane's harness fixes on top (the grid's own stamp is 4bebce3eb). The full grid is 1,363 cells at 2 seeds of 2 hours, 768 seconds on 12 workers, no errors. The death sample is Levels 10, 20 and 88, 90 cells at 4 seeds of 8 hours, 433 seconds on 12 workers. The ground-rate table under the solver is 422 cells at 2 seeds of 1 hour, written by the balance matrix on this branch (235 seconds). The stamina day as played is 12.02 hunted hours.

**Caveats that hold for the whole page.**

1. **The spell rule is in these numbers and no real player has played it.** The spell rule (plan lane L17) landed on the set while this page was being written. It changes what every cast is worth. The real hunts used for calibration ran on v0.2.142, before it. Section 2 gives both readings.
2. **A sibling lane may move closed-browser XP slightly.** `lane/c-engine-reds` is fixing the world-tick perk parity and a settle control. This page did not wait for it.
3. **The grid was played five times for this page.** Once by the lane that built it, once after the spell rule, once after the harness faults of section 3 were fixed, and twice more as the set moved under it (the balance matrix, then the engine lane). The last three runs agree to the digit, and only the last is quoted as the baseline. Where a fault moved a number, section 3 gives it before and after.

---

## 1. The short version

1. **The instrument can be checked against one real party only.** Since the current rules shipped, the only real hunting is one player's four. No lone hero, pair or three has a single real hour on them. Seated the way that four really sits, the harness reads its pace 10% slow, which is the edge of the tolerance. Its gold fails on the kit rule's rune tiers and passes on the real ones. Its damage split matches in the real seats, and its damage total reads a third low. Survival cannot be checked at all, because the tally records no low point.
2. **Six faults in the instrument are fixed on this branch**, each with a check proven to bite. The solver's table played every harder tier at Normal's pull (a four at 558 kills an hour where real play is 1,251). Heroes past Level 100 had skills the game cannot give (Melee 198 at Level 400, where the game's own curve allows 129). The calibration party sat in the wrong seats. Two death bands could never be judged. One band divided by a dead hero. One judged a price that does not exist.
3. **Three bands were changed and two are new**: the death rules now have a band of their own, the Level-a-day band no longer contradicts the ruled table, and the best-over-low band is read where both kits are meant to stand.
4. **Two faults need a ruling before they can be fixed**: what a death does to an unattended hunt (F4), and which rune tier the standard kit buys (F5). Eight more are written down for the lanes that own the files.
5. **Of 108 bands, 89 have a reader and 19 do not.** Of the 85 the grid reads, every party band rests on that one four, and every lone, pair and three band is uncalibrated. Sections 5 to 7 say which is which.
6. **So every band stays in report mode.** Section 8 lists what the instrument still needs, in order.

---

## 2. Calibration: the grid against real play (X27)

The rule is that the harness reads within 10% of real play on XP and 20% on gold, on at least three real parties, including a lone hero and a pair.

**The read.** A fresh read-only read of production (the journal, 505,200 rows, with the tool of `10-real-players.md`), cut into cells of ground, party size, tier and Level band. Four people, 1,367 hunted hero-hours. Then the same cells played on the harness with the same ground, Level, seats and tier, three fresh seeds of two hours each.

**The finding that decides everything: only one real party has hunted on the current rules.** Since v0.2.142 shipped on 2026-11-20, the only real hunting is the heavy four (one person, four heroes): about 60 hero-hours on Krell's Hold on Deadly and 8 on Coppercap Warrens on Deadly. Every real lone hour (120) and every real pair hour (129) is two to four weeks old. Between then and now the Sewer was rebuilt, drops and XP a kill were changed three times and monsters gained 10% health and damage. A real Sewer kill paid 140 Level XP then. The harness pays 255 for the same monster mix now. So an old cell cannot say whether the harness is wrong or the rules moved.

### 2.1 The four (the heavy four, Deadly): at the edge on pace, fails on gold and on damage

Harness on the set before the spell rule (16a533a02), MID kit, in the grid's own seats (a shield tank, Healer, bow, Mage). **That tree is not quite the hunt's own rules.** It already held the to-hit change (to-hit as a ratio), which the engine lane measured at +6.5% Level XP and kills on this very cell, and the real four hunted before it. So take about six points off every pace gap in this table: the -5.5% below is about -11% on the hunt's own rules.

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

**Verdict for the four.** Pace calibrates at the edge of its tolerance, and from the slow side. The balance guard's K1 line is the cleanest reading. It plays the real seats with the real skills and rune tiers on today's tree, and restates the real hunt on today's engine by the two formula changes since (the to-hit ratio and the spell rule, each measured harness over harness by the engine lane). It reads **Level XP 0.90 and kills 0.90** of the real hunt. In the grid's own seats the same line read 0.83 before either change. The XP a kill is exact. Gold does not calibrate. The harness four pays 1.7 to 2.2 times the real store bill, for two reasons found in `11-krell-hunt-2026-11-20.md` and confirmed here: the kit rule buys the Level's own rune tier (Graven, 44 gold) where the real player buys Carved and Etched (28 and 12), and the real Healer heals on a 1 gold water rune. Damage does not calibrate on Krell's Hold: the split does in the real seats, the total does not. Survival cannot be calibrated anywhere, because the tally does not record a hero's lowest health.

Net gold on today's tree reads inside 20%. That is two errors meeting, a faster party and a bill that is still nearly twice the real one. It is not a pass. On that same K1 line net gold reads 0.92, the last seat's share of the damage 1.16 and the four's damage 0.75. So with the real rune tiers and the hunt restated, gold comes inside its tolerance on this one party, where the kit rule's rune tiers put the bill at 1.7 to 2.2 times real. That points at the rune rule of fault F5 as the gold fault. It is one cell.

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

- The harness reaches Level 10 in 3.9 (MID) to 4.2 (LOW) hours. Real heroes took a median of 5.6 hours on the 11-20 read (12 heroes, fastest 2.5) and 3.5 on today's read with the same tool (13 heroes, 1.6 to 12.5). The ruled target is 6. So the harness hero sits inside the real spread, near its fast end, and the spread between real players (eight times, fastest to slowest) is far wider than any band's tolerance. The harness plays one well set up hero. It does not measure setup quality (standard X20).
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
| Four, pace (P1, P7.4, P8, P12, R2) | XP at the edge (0.90 of real, the slow side), on one person | the seat's tier is picked by "holds", and "holds" reads net gold, which fails (F5). The grid's four is also not the real four (F16) |
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

Sixteen, and one open question. Six are fixed on this branch at their source. Each carries a check that was proven to bite by mutating the fix (six mutants, six caught). The rest are written down for the lane that owns the file. Three of the six came in as questions from the social, world and formula reviews while this page was being written.

**The four calibration faults the reviews named, by their ids** (`44-formula-architecture.md`), and the store bill:

| Id | The fault | Here | State |
|---|---|---|---|
| V1 | skills in a straight line past the measured Levels | F15 | fixed. The matrix reaches it through the grid's builder: its subset now plays Melee 129 at Level 400 |
| V2 | two builders, and a four that killed 558 an hour against the real 1,251 | F14 | fixed. One builder (`buildCell`) feeds the grid, the matrix and the solver's table. The four reads 1,383 to 1,386 kills an hour on today's engine, and 0.90 of the real hunt once the hunt is restated on today's engine and the seats are the real ones |
| V3 | two death counts for one cell, and a dead hero that stands up at once | F14 and F4 | half fixed. The two files now hold the same cells and agree (the median cell is 0.6% apart). The instant retry is open, and F4 says what rule it needs |
| V4 | three seats taking 1% of the damage against a real 28% on the Healer | F16 | fixed for calibration. It is the lineup, not the engine. The grid's own four keeps the standard's shield tank. The real lineup is K1's and the matrix's |
| | the store bill at 1.9 times real | F5 | open, with the measurement that says where it comes from |

### 3.1 Fixed, with before and after

| # | Fault | Before | After | Where |
|---|---|---|---|---|
| F1 | **P5 was judged on tiers where LOW is ruled to die.** The band is "BiS over LOW, at most 1.5". On Deadly at Level 20 the lone LOW hero earns 584 XP an hour between deaths | the grid lane's fourth red: 277 | P5 reads Normal only. Worst cell Its largest reading is 1.89, where it read 277 | `grid-derive.mjs`, `standards.mjs`, the P5 row of `50-standards.md` |
| F2 | **S2 and S7 could never be judged.** They are Normal's death bands. The death run plays the harder tiers only, and a rate of 1 in 1,000 hours cannot be seen in one cell anyway | five bands thin for good | both are judged on the pool of every in-band Normal cell of the gear state, from 1,000 hero-hours: 0 deaths in 1,120 pooled hero-hours for each gear state | `grid-derive.mjs` |
| F3 | **Gear cost was judged past Level 185, where the projected gear has no price** | MID to BiS read 2,130 gold for every band from 200 to 400: 9 false red rows each on G-10 and E4 | those rows are unjudged, with the reason | `grid-derive.mjs` |
| F14 | **The solver's ground-rate table played every harder tier at Normal's pull.** A tier's monster rows come from the tier. Its pull has to be passed in, and `measureJobs` did not pass it. So "Deadly" there was Deadly's monsters four at a time | a four on Krell's Hold at Level 85: 558 kills an hour on Deadly, 562 on Normal. A lone MID hero "held" Deadly with 0 deaths on every one of 28 cells | the same four: 1,383 kills an hour on Deadly and 566 on Normal (the real four: 1,251 on the older rules). A lone MID hero dies on Deadly at 19 of 28 cells and holds it at 9. The solver's four now reaches Level 110 on day 23.3 where it read 40.6, beside the grid's 22.9, so the two tools agree for the first time. My own re-play of the table and the matrix's agree: the median cell differs by 0.6% on kills, and 14 of 422 cells differ by over 10%, each a cell where a lone hero dies or a Level 5 cell | Found on this lane and, the same day, by the matrix lane. The table now has ONE writer, `balance-matrix.mjs --rates`, which builds every cell through the grid's own `buildCell`. This lane keeps the guard: `sources.mjs --selftest` fails if a harder-tier job loses its pull, or if the cached table reads a four no faster on Deadly than on Normal |
| F15 | **Skills past Level 100 were a straight line in skill levels.** The measured skill lines stop at Level 100. Past it the harness added the last ten Levels' slope for ever. The game's own reference hero, which every monster's aim and evasion are written against, is projected on the skill curve's cost | Melee 198 and Defense 184 at Level 400 for the lone hammer, where the reference hero has 129 and 113. Every cell from 110 to 400 played a hero the game cannot make | one projection, shared with `tools/gen-ref-hero.mjs`: the lone hammer is the reference hero at every Level, 129 and 113 at 400. Levels 110 to 400 were played again. Where the hero was already safe the move is small: the pace seat's hours to Level 400 rose 4%, and a four's lowest health on Deadly at Level 400 fell from 73% to 69%. Where the hero was at the edge it is large: the matrix's lone hammer on Deadly at Level 400 fell from 2.01 to 0.77 times the contract | `tools/balance-sim/skill-lines.mjs`, `tools/gen-ref-hero.mjs`, a check in the grid's selftest |
| F16 | **The calibration party sat in the wrong seats** (section 2.1) | front hero 95%, Healer 1% of the damage | front hero 67%, Healer 31%, against a real 69 to 75% and 25 to 28% | `model.mjs` REAL_KRELL_FOUR, two new rows on the guard's K1 line (the last seat's share of the damage, and the four's damage a clock hour). With the real seats K1 reads Level XP 0.90, which is inside its own gate, so the guard now judges its party lines (in report mode). The gate's negative control assumed K1 would be outside it. It now shuts the gate itself, and a mutant that forces the gate open is caught |

**On the two questions that named the grid.** "The grid's four kills 558 an hour on Krell's Deadly" was the solver's table (F14), not the grid. The grid's four killed 1,183 an hour on the set before the spell rule against the real 1,251, and 1,463 on today's. "The two caches disagree on lone Deadly deaths" was the same fault from the other side: the grid was right that a lone MID hero dies on Deadly, and the solver's table was wrong that he holds it. No "holds a tier" rule was involved. Every solver number that leaned on a harder tier was wrong until the re-play, B9 among them.

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
| F4 | **A dead hero stands up at once and hunts on.** In the game a death ends the hunt | a death count on a cell that fails is the rate of an endless retry, not a rate a player can have. The direction is right | **Not fixed here, because the fix is a rule nobody has ruled.** The game's rule is that a death ends the hunt. What the harness needs to know is what happens next: an idle player is not there to start again. The rule I would write: a death ends that seat's hunt until the next visit, and the frame's day has two visits, so a death costs the rest of that visit's hours (4 to 6 of the day's 12) plus the 6%. Under that rule a failing cell reads as hours lost, never as 36,000 deaths. Until it is ruled, a cell that dies more than once in its sample should be read as "does not hold", not as a rate (section 4) |
| F5 | **The party's store bill is 1.7 to 2.2 times real** (section 2.1), and "holds a tier" needs net gold over zero | every party gold band, and any place where the pace seat's tier turns on a bill | **Not fixed here, and the cause is now measured.** The guard's K1 plays the same four with the real rune tiers (the Mage on Carved, the Healer on Etched) in the real seats, and reads net gold at 0.92 of the real hunt, inside tolerance. The grid's kit rule buys the tier each caster's Magic allows, and its party skill line gives a Level 79 caster Magic 64 where the real ones hold 59 to 63, which is the step from Carved to Graven. So the bill has two causes: a skill line a little over real play, and a Healer who buys two tiers down by choice. The rule I would write into standard 1.4: MID casts one rune tier under what its Magic allows, a Healer's heals are on the cheapest water rune, and BiS casts the tier its Magic allows. It changes kill speed as well as gold, so it needs a ruling and one more play of the grid. The cell runner already takes a rune tier by role (K1 uses it), so it is one rule in `grid-kit.mjs` and one row in `standards.mjs` |
| F6 | **The kit builder never wears the staged unique lines** (Levels 110 to 185). LOW and MID wear the same tier 7 pieces there, and the weapon step reads 0 | every LOW against MID reading from 110 to 185, E1 there, and the solver's "uniques: UNMEASURED" | `grid-kit.mjs` |
| F7 | **S6 judges a lone hero on Deadly against the party's death count.** Standard 2.3 says MID holds Deadly as a four | the lone rows of S6 are red by design of the band | a standards question: say which party sizes each S6 row judges |
| F8 | **P6 compares a party and a lone hero on different grounds at Levels 35 and 40.** The game advises a lone hero the Glade there and a party the Warrens | the 2.1 to 2.5 readings there are the advice gap, not a party advantage | read the two checkpoints apart, or give P6 one ground for both seats |
| F9 | **The cost bands are a model on real means read on 11-20**, with the tab's reads at the value from before the server-cost lane landed. Its journal figure (216 rows a hunted hero-hour) is under the heavy four's real 426 | C1 and C2 read about 110 seconds a day high. C3 reads low | `model.mjs`, after the server-cost lane has a day of data |
| F10 | **`--only` and the death run replay the same seeds** | a re-run of a cell through the tool is a replay, not a second opinion. Every re-check on this page used fresh seeds outside the cache | small |
| F11 | **The grid's four is the standard's four, not the four players field.** On the calibration cell a hammer in the front seat reads 9% faster than a shield tank | the pace seat is read on the slower lineup | the real four as a second named party (2.4) |
| F12 | **The solver's chance runs barely vary.** B8 reads the 90th percentile equal to the median in most bands | B8 is not judged on real spread | `paths/` |
| F13 | **D2 has no row to read from Level 125** | D2 prints "undefined" there | small |
| OQ | **The total damage a four takes on Krell's Hold reads a third low** even in the real seats | S3, S4 and S5 at 88 to 110 lean on it | one watched hour of the real four with the tally recording damage by source |

---

## 4. What the death sample can and cannot see

The grid's own cells are 2 seeds of 2 hours. That cannot see a death rate. The death run plays 4 seeds of 8 hours, 32 hunted hours a seat. This lane played it in full at three checkpoints (Levels 10, 20 and 88: 90 cells, 433 seconds on 12 workers). What that says about the instrument:

1. **A 32 hour seat resolves a death rate from about 30 in 1,000 hours upward.** One death in the sample reads as 31. So it can tell "inside the Deadly band of 50 to 100" from "outside it". It cannot tell the Dangerous band of 10 to 30 from zero, and it cannot see Normal's 1 in 1,000 at all. Normal is judged on the pool instead (fault F2): every in-band Normal cell of a gear state together, 1,120 hero-hours. That resolves about 1 in 1,000 and no finer, so the BiS row of S2 (0.1 in 1,000) is only judged as "under about 1".
2. **On a cell that fails, the count is not a rate** (fault F4). In the sample a seat either did not die at all or died again and again, because the harness stands the hero back up. Read any count over about 1,000 as "does not hold", and read the minutes between deaths, never the count.
3. **The three checkpoints are all the judge has for S6.** The other 28 are thin until the nightly death run has gone round. A third of the harder cells is about 11 worker-hours, so the whole grid takes three nights.
4. **The after-deaths band S11 does not need the sample.** It is derived from the ruled death count and the ruled cost, so it reads at every checkpoint and moves the moment a death rule moves. That was its purpose: before it, a change to the death rules moved no band.

---

## 5. Every band the grid reads: what reads it and how far to trust it

85 bands. This table carries no measured value. The values for any tree are printed by `node tools/balance-program/progression-grid.mjs --report` and by the dashboard. What does not change with the tree is on this page: what reads each band, on what sample, and how far the reading can be trusted today.

| Band | Target | What reads it | State | How far to trust it |
|---|---|---|---|---|
| P1 | 0.9 to 1.1 (RULED) | 7 rows, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P2 | 0.95 to 1.1 (RULED) | 31 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P3 | 0.8 to 0.9 (PROPOSED) | 31 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P4 | 1.1 to 1.2 (RULED) | 31 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P5 | at most 1.5 (PROPOSED) | 118 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P6.2 | 1.05 to 1.15 (RULED) | 87 rows, each cell 2 seeds of 2 hours | judged | pair: not calibrated. Real pairs sit two melee heroes, which the grid does not seat |
| P6.3 | 1.1 to 1.2 (RULED) | 87 rows, each cell 2 seeds of 2 hours | judged | three: not calibrated |
| P6.4 | 1.15 to 1.25 (RULED) | 81 rows, each cell 2 seeds of 2 hours | judged | four side 10% slow against real, lone side not calibrated. Compares different grounds at two checkpoints (F8) |
| P7.2 | 1.2 to 1.5 (RULED) | 29 rows, each cell 2 seeds of 2 hours | judged | pair: not calibrated. Real pairs sit two melee heroes, which the grid does not seat |
| P7.3 | 1.5 to 2 (RULED) | 29 rows, each cell 2 seeds of 2 hours | judged | three: not calibrated |
| P7.4 | 1.8 to 2.5 (RULED) | 14 rows, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P8 | at most 2.75 (RULED) | 29 rows, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P9.dangerous | 1.1 to 1.25 (PROPOSED) | 223 rows, each cell 2 seeds of 2 hours | judged | reads "holds", which reads gold: not calibrated until F5 closes |
| P9.deadly | 1.3 to 1.6 (PROPOSED) | 180 rows, each cell 2 seeds of 2 hours | judged | reads "holds", which reads gold: not calibrated until F5 closes |
| P10 | at most 1 (RULED) | 212 rows, each cell 2 seeds of 2 hours | judged | reads "holds", which reads gold: not calibrated until F5 closes |
| P11.early | at most 2 (RULED) | 9 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P11.ten | 5 to 7 (RULED) | 1 row, each cell 2 seeds of 2 hours | judged | lone: not calibrated (no real lone hour on current rules) |
| P11.smooth | at most 2 (RULED) | 1 row, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P12.to300 | at most 15 (PROPOSED) | 22 rows, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P12.to400 | at most 24 (PROPOSED) | 4 rows, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| P13 | at most 0.05 (RULED) | - | unjudged: events: the grid plays no event calendar |  |
| S1.low | 0.45 to 0.7 (PROPOSED) | 112 rows, each cell 2 seeds of 2 hours | judged | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S1.mid | 0.6 to 0.8 (RULED) | 112 rows, each cell 2 seeds of 2 hours | judged | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S1.bis | 0.75 to 0.95 (PROPOSED) | 112 rows, each cell 2 seeds of 2 hours | judged | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S2.low | at most 5 (PROPOSED) | the pool of 112 Normal cells, 1120 hero-hours | judged, and thin at 112 more cells | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S2.mid | at most 1 (RULED) | the pool of 112 Normal cells, 1120 hero-hours | judged, and thin at 112 more cells | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S2.bis | at most 0.1 (PROPOSED) | the pool of 112 Normal cells, 1120 hero-hours | judged, and thin at 112 more cells | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S3.mid | 0.35 to 0.6 (RULED) | 110 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S3.bis | 0.55 to 0.75 (PROPOSED) | 110 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S4.mid | 0.15 to 0.4 (RULED) | 110 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S4.bis | 0.35 to 0.5 (RULED) | 110 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S5.low | 1.15 to 1.35 (PROPOSED) | 350 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S5.bis | 0.8 to 0.9 (RULED) | 350 rows, each cell 2 seeds of 2 hours | judged | cannot be calibrated: the tally records no low point. On the shooter grounds the four's damage reads a third low (OQ) |
| S6.dangerous.low | 60 to 150 (PROPOSED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 98 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S6.dangerous.mid | 10 to 30 (RULED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 98 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S6.dangerous.bis | 2 to 10 (PROPOSED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 98 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S6.deadly.low | at least 200 (PROPOSED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 104 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S6.deadly.mid | 50 to 100 (RULED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 98 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S6.deadly.bis | 10 to 30 (PROPOSED) | 12 cells at 4 seeds of 8 hours | judged, and thin at 98 more cells | cannot be calibrated, and on a cell that fails the count is a retry count (F4). Played at 3 of 31 checkpoints |
| S7.mid | at least 0.99 (RULED) | the pool of 112 Normal cells, 1120 hero-hours | judged, and thin at 112 more cells | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S7.low | at least 0.9 (PROPOSED) | the pool of 112 Normal cells, 1120 hero-hours | judged, and thin at 112 more cells | not calibrated, and real new players died on Normal where the harness hero did not (2.2) |
| S11.blessed | at least 1 (PROPOSED) | 29 rows, each cell 2 seeds of 2 hours | judged | derived from the ruled death count and cost on measured XP. Sound as arithmetic. Its XP side is the four's (10% slow against real) over the lone hero's (not calibrated) |
| S11.unblessed | at least 1 (PROPOSED) | 29 rows, each cell 2 seeds of 2 hours | judged | derived from the ruled death count and cost on measured XP. Sound as arithmetic. Its XP side is the four's (10% slow against real) over the lone hero's (not calibrated) |
| S10 | at most 0.2 (PROPOSED) | 23 rows, each cell 2 seeds of 2 hours | judged | computed from price rows and lone cells |
| G-1 | at least 1 (RULED) | 30 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated |
| G-2.normal | at most 0.15 (PROPOSED) | 112 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-2.dangerous | 0.25 to 0.4 (PROPOSED) | 110 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-2.deadly | 0.45 to 0.65 (PROPOSED) | 110 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-3 | 0.6 to 0.85 (PROPOSED) | 117 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated |
| G-4 | 3000 to 8000 (RULED) | 6 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-5 | at most 0 (RULED) | 116 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-6 | at least 1 (PROPOSED) | 82 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-8 | at most 60 (PROPOSED) | 31 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated |
| G-9 | 0.35 to 0.5 (PROPOSED) | 276 rows, each cell 2 seeds of 2 hours | judged | gold: fails calibration on the kit rule's rune tiers, passes on the real ones (F5) |
| G-10 | 1.2 to 1.4 (RULED) | 22 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated |
| G-11 | 0.85 to 1 (PROPOSED) | - | unjudged: server gold: needs the server gold model (X14), not a cell |  |
| E1.levels | 15 to 25 (RULED) | 21 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E1.weapon | 0.05 to 0.08 (RULED) | 26 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E1.armor | 0.03 to 0.05 (RULED) | 26 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E2.toKrell | at most 0.15 (PROPOSED) | 17 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E2.after | at most 0.35 (PROPOSED) | 1 row, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E3 | at most 0.1 (PROPOSED) | 22 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E4 | 1 to 1.4 (RULED) | 22 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E5.toKrell | at most 0.5 (RULED) | - | unjudged: no reader in grid-derive.mjs yet |  |
| E5.after | at most 1 (RULED) | - | unjudged: no reader in grid-derive.mjs yet |  |
| E6.toKrell | at most 24 (PROPOSED) | 11 rows, each cell 2 seeds of 2 hours | judged | lone: not calibrated. Levels 110 to 185 wear no unique line (F6). Past 185 the gear has no price |
| E6.after | at most 60 (PROPOSED) | 14 rows | unjudged: an upper bound: band starts only. rungs and jewelry change in between (a played life judges it) |  |
| E7 | at most 0.09 (PROPOSED) | - | unjudged: the Add pool: balance guard G10 plays it |  |
| E8 | at least 1 (PROPOSED) | - | unjudged: gold-for-power offers: balance guard G12 |  |
| D1 | 60 to 90 (RULED) | 18 rows | unjudged: the Very Rare is not built (L20). the rarest reveal row by formula on measured kills, never judged |  |
| D2 | 60 to 90 (RULED) | 14 rows | unjudged: the Very Rare is not built (L20). the rarest reveal row, the party's hours |  |
| D4 | at most 104 (RULED) | - | unjudged: Magic Find: balance guard G13 (Luck not built) |  |
| R1 | at least 14 (RULED) | - | unjudged: region open dates: a schedule, not a cell |  |
| R2 | at least 120 (RULED) | 1 row, each cell 2 seeds of 2 hours | judged | four: reads 10% slow against the one real four. The seat's tier leans on "holds", which reads gold (F5) |
| R3 | at least 1 (PROPOSED) | - | unjudged: Levels authored a month: the pack log |  |
| C1.1k | at most 1.25 (COMPUTED) | the cost model, one row | judged | not a cell: a model on real means of 11-20 (F9) |
| C1.10k | at most 0.5 (COMPUTED) | the cost model, one row | judged | not a cell: a model on real means of 11-20 (F9) |
| C2.1k | at most 60 (COMPUTED) | the cost model, one row | judged | not a cell: a model on real means of 11-20 (F9) |
| C2.10k | at most 24 (COMPUTED) | the cost model, one row | judged | not a cell: a model on real means of 11-20 (F9) |
| C3 | at most 1 (RULED) | the cost model, one row | judged | not a cell: a model on real means of 11-20 (F9) |
| C4.1k | at most 0.15 (RULED) | - | unjudged: money: measure.mjs cost |  |
| C4.10k | at most 0.15 (RULED) | - | unjudged: money: measure.mjs cost |  |
| C4b.1k | at most 80 (PROPOSED) | - | unjudged: the other lines of the bill: 28-platform's price list |  |
| C4b.10k | at most 1015 (PROPOSED) | - | unjudged: the other lines of the bill: 28-platform's price list |  |
| C5 | at most 0.7 (PROPOSED) | - | unjudged: capacity: measure.mjs cost and the load rig |  |

**The count.** 68 of the 85 are judged and 17 are not. Of the 68, the 6 rows of S6 are judged at 3 checkpoints only.

---

## 6. The 23 bands of the atlas and the solver: what reads them

COMPUTED on MEASURED rates, never played by a person. Both tools were re-run on this branch on the final grid and on the ground-rate table as the matrix now writes it.

| Band | Target | What reads it | State | How far to trust it |
|---|---|---|---|---|
| A1 items with no source a player can reach | 0 | the atlas, every item row | judged | counts staged and planned items as having no source. Only the undeclared ones are a real count (RULED 11-21: nothing planned for later is cut) |
| A2 sources nothing uses | 0 | the atlas | judged | sound |
| A3 sources with no time cost | 0 | the atlas | judged | sound |
| A4 MID slots with no source in their own band | every slot | the atlas and the grid's kits, Levels 1 to 185 | judged | leans on the kit rule. Wrong from 110 to 185 until F6 closes |
| A5 BiS kits with a dropped, a crafted and a won piece | all three | the atlas and the grid's kits | judged | the same |
| A6 slowest way over fastest way to one piece | at most 3 | the atlas, on the ground-rate table | judged | sound since F14 |
| A7 skill stretches with no product on a best path | 0 | the solver | judged, overstated | the solver has no supplies goal, so every skill that only makes supplies is counted (cooking, fishing, runecrafting, Inner Flame) |
| T1 a town skill from 1 to 99 | 60 to 120 days | the atlas, recipe and node rows | judged | read from data. It is printed two ways (gathering its own inputs, and buying them) and the band does not say which it judges |
| T2 a rested hour's gold beside a hunted hour's | 15 to 35% | the solver, 8 Levels | judged | the hunted side is a lone hero's gold: not calibrated |
| T3 supplies a hero's rested hours can cover | 25 to 50% | nothing | unjudged | no supplies goal in the solver |
| T4 share of the MID to BiS gap through a bench | 25 to 45% | the solver, by band | judged | counts pieces, not power. A piece worth 1% counts the same as one worth 10% |
| T5 a player who never touches a bench | inside 1.5 times the best path | the solver, one scenario | judged | sound as far as its prices: the market is the maker's own time |
| T6 a player who only crafts and gathers | 40 to 70% of a hunter's gold | the solver | judged | the same lone gold as T2 |
| T7 rested hours the best path wants a day | 6 to 12 | the solver, 9 scenarios | judged | sound |
| B1 days to full BiS in a band, to Krell | 0.7 to 1.0 | the solver, lone, free | judged | counts the weekly-limited chest pieces that call 6 says to leave out under Level 88. The reading is part rule, part solver |
| B2 days to full BiS in a region, past Krell | 1.0 to 2.0 | the solver, one staged region | judged | one region, on staged rows |
| B3 the path the screen recommends against the best | within 15% | the solver against the game's advice | judged, not calibrated | the blind play that calibrates it has not been done (50-standards 10.5) |
| B4 open grounds on no best path | 0 | the solver | judged | sound since F14 |
| B5 a ground on the fastest path past its own band | at most 10 Levels | the solver | judged | sound since F14. Before it the harder tiers were mispriced and the paths were wrong |
| B6 free against Premium, hunted hours | the same | the solver | judged | sound |
| B7 things only bought gold can reach | none | the solver prints how much sooner, not what | unjudged | an upper bound: it assumes a market with no limit at the maker's price. The band needs a list of pieces, which is not printed |
| B8 the unlucky route against the median | at most 2 | 200 seeded runs a band | judged, weak | in 14 of 32 rows the 90th percentile equals the median, so chance is not varying where it should (F12) |
| B9 a party path against the lone path, a head | never slower | the solver | judged | sound since F14. Before it every party read 1.29 to 1.43 slower, on the mispriced tiers |

**The count.** 21 of the 23 have a reader. T3 and B7 do not. Three of the 21 are weak (A7, B3, B8).

The solver also gives each system a verdict under rule 10.4. Seven of the 28 systems it judges come back UNMEASURED (cooking, farming, runecrafting, training, trophies, linings, uniques), and 86 systems have no source row for it to judge. That is a gap in the instrument, not a clean bill: a verdict list with a quarter of its rows blank cannot be the cut list of call 17 yet.

---

## 7. What stays thin or unjudged, and what closes it

| Bands | State | Why | What closes it |
|---|---|---|---|
| S6, all six rows, at 28 of 31 checkpoints | thin | section 4 | the nightly death run, three nights |
| S6 on any cell that fails | judged, and the number is not a rate | fault F4 | the death rule of F4, ruled and built into the cell runner |
| D1, D2 | unjudged, a stand-in | the Very Rare is not built (plan lane L20) | L20 |
| E6 past Level 30 | unjudged, an upper bound | it reads band starts only. Rungs and jewelry change in between | a played life |
| E5 | unjudged | no reader. The atlas has the chest rows now | a reader in `grid-derive.mjs` |
| E7, E8, D4 | unjudged here | the balance guard's own lines G10, G12 and G13 play them | nothing, by design |
| P13, G-11, R1, R3, C4, C4b, C5 | unjudged | events, server-wide gold, schedules and money are not cells | their own models (X14, X16, X17) |
| T3, B7 | unjudged | section 6 | a supplies goal in the solver, and a list for B7 |
| A7, B8 | judged, weak | section 6 | the same supplies goal, and chance that varies |
| Every lone, pair and three band | judged, in report | section 2 | real hours on current rules |
| Every party gold band, P9, P10 | judged, in report | fault F5 | the rune rule of F5, ruled, then one play of the grid |
| Every LOW against MID reading from 110 to 185 | judged, and wrong | fault F6 | the unique lines in `grid-kit.mjs` |
| Everything past Level 185 | PROJECTED | placeholder grounds and a projected gear line with no prices | the regions being designed |

---

## 8. What the instrument still needs, in order

1. **A ruling on what a death does to an unattended hunt** (F4). Until then every death count on a failing cell is a retry count.
2. **A ruling on the rune rule** (F5), then one play of the grid. That is what stands between the instrument and any gold band for a party.
3. **One real lone hour and one real pair hour on current rules**, with the kit written down (2.4). Without them four fifths of the bands rest on one party's calibration.
4. **Lowest health, tier and gear tier in the hunt tally** (2.4). No survival band can be calibrated without the first.
5. **The unique lines in the kit builder** (F6).
6. **The real four as a second named party in the grid** (F11), so the pace seat can be read on a four as players seat it.
7. **A fresh read of the cost means** (F9).
8. **A supplies goal in the solver** (A7, T3), and chance that varies (F12).
