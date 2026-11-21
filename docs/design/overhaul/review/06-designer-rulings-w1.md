# The designer's rulings for waves 3 and 4: D-7, D-6, D-8, D-5, then D-4 and D-10

**RULED by the game designer** 2026-11-21 on `lane/d-designer-w1`, from `set/v0.2.144` at a94dd6e25. Docs only. No game code, data, migration or tool is touched. Chapters 00 to 13 and `decisions/` are not edited. Each ruling ends with the edits the integrator makes. D-4 and D-10 were added on the Coordinator's word after Tyler answered S-11, S-12 and S-14 the same day.

**Evidence words.** MEASURED carries a run id. COMPUTED is arithmetic from data rows on this branch or from a named run. JUDGMENT is a design call. UNKNOWN names what would settle it. The replay on the fixed engine is run 44948522187. Every number read on an earlier run is marked "before the fix" and is used only as a reason, never as a size. No rule below types a number a lane can read from data or the replay instead.

**Player words.** Lines in quotes are the exact words. Labels are genre labels. Sentences are kept for lore and for the one line a system truly needs to explain itself (2026-11-14). American spelling. No semicolons, no dashes, no colon-joined clauses.

**Tyler's answers this file builds on**, all 2026-11-21: S-11 c (the Level table is timed on the four on Dangerous), S-12 a (the ruled death counts describe a four that has just arrived in a band), S-14 a (an account's own heroes hunt on when one falls), S-15 a, S-17 a, S-18 c (the accounts in now play first, then about 30 invited, so every shared room must work with 7 accounts), and reversals 27 and 27b stand.

---

## 0. One screen

| Ruling | In one or two sentences |
|---|---|
| **D-7 The calendar** | A 28 day cycle with two beats in the first build: the Hearthrise on week 1 and the world boss on week 3, two weeks apart. Weeks 2 and 4 stay quiet until the ground weekend and the arena season are built. The weekly Open Halls row is retired, because Call out has cost no gold since 2026-11-20 and the event waives nothing. |
| **D-7 The Hearthrise's size** | The fire has five marks over its floor. Each mark is +3%, so it lights at +10, 13, 16, 19, 22 or 25% Level XP. A full fire is a quarter of the fuel the server's weekly active accounts find, counted per account, so 7 accounts fill it as easily as 7,000. When the server drives the world boss off, the fire gains one mark. |
| **D-6 The world boss** | **Mossback**, a huge old brook bear from Mosslight Glade who comes down the Meadowbrook for the honey under the mill. He is fought at **the Mill Pond**, in each party's own room, on the one monster formula. Rook's poachers come out of the trees at half his health. He never dies in the room. |
| **D-6 The chest** | It pays both, by the account's own points. Mark 1, about 2 Normal party-hours: +5% damage for 7 days and, the first time, the trophy. Mark 2, about 6: one **Mossback Cloak** cut for the hero's way to fight. Mark 3, about 12: the buff runs 14 days. |
| **D-8 On call** | It opens at hero Level 10, once the account has a friend or a clan. The default tier limit is Dangerous. `onCallXpShare` stays 0.10. |
| **D-5 Prices** | Refills, Blessings, the talent reset and rename are rows of hours at the hero's Level. The first refill of the day costs 2 hours of the wage. Deeds are set once at CE-5's sizes in account-days, and rooms and chests keep their share of their deed. Everything Tyler typed stays typed. |
| **D-5 The Weighhouse** | It stays the town's first project, as a building only. The market trades from day one while it goes up. Staged 1013 and 1014 stand. Only words move. |
| **D-4 The Blessing ladder** | The threshold stays at Tyler's 5 hunted hours, now with evidence. Under S-12 a, Deadly should not pay on the day a four arrives and should pay once it grows past the edge, and 5 hours puts that line at about 50 deaths in 1,000 hours. Rungs halve what is left, as ruled, and their Levels come from the law. |
| **D-10 Party-wide damage** | It stays in the data, the `group` rows, and gets no tier row. Group spells already scale with the tier's blow dial. Two open grounds have no group caster and get one each. A tier row is a named fallback with a measured trigger. |

**What Tyler can veto, one line.**

1. **The refill's shape (24-1, 2026-11-20).** At 2 hours of wage, the first two refills of a day pay for themselves at every Level, the third breaks even and the fourth to sixth are gold for XP at every Level. The typed price made the late ones gold for XP only from Level 80. "Veto R-1" sets the base at 1.33 hours, so only the sixth is gold for XP (section 4.2).

Nothing else here bends a ruling of his. Where a ruling of mine moves an earlier Fable call (MM-6's marks, MM-11's order, the 2 hour ladder of chapters 05 and 12, GR-55's "builds something else"), it is named in its section and in "For the integrator".

**One thing the plan owner must know.** The Mossback Cloak is the best cape at its rung for its way to fight until crafted cloaks roll perks (their hooks are unbuilt). That is a small tension with CE-1 rule 3 and is accepted for the first build (section 2.4).

---

## 1. D-7, before FB-12

### 1.1 The calendar's shape

**The cycle.** 28 days, four weekends. Each weekend is a window from Friday 12:00 UTC to Monday 12:00 UTC, 72 hours. Only one thing runs on a weekend. The order is fixed so later systems take an empty slot and never move a row that is live.

| Slot | The full rotation (MM-11, re-ordered here) | The first build |
|---|---|---|
| Weekend 1 | The Hearthrise | **The Hearthrise** |
| Weekend 2 | One ground's weekend (MM-42) | Quiet |
| Weekend 3 | A world boss stands | **Mossback at the Mill Pond** |
| Weekend 4 | Arena season end and clan honors | Quiet |

**Why the boss moves from weekend 2 to weekend 3.** With two beats a month, two weeks apart is the even spacing. It also puts the boss's fall two weeks before the next Hearthrise, which is the order section 1.3's mark needs. The ground weekend then sits "in between" the world weekends, which is where 27-5 put it. MM-11's order was Fable's and PROVISIONAL.

**Why weekends 2 and 4 stay quiet.** JUDGMENT.

- The ground weekend in its decided form (MM-42, a featured row on a ground's named pieces) needs a drop term nobody has built, and it waits on a buff played in a cell (13 section 1.2).
- The ground XP weekend of 27-5 can be run today on the existing `xp_bonus` type. On a server of 7 accounts it would land on a band where most weeks nobody stands, because old grounds at your Level (GR-9) are not built. A weekend that lights for nobody is the dead room S-18 asks us to avoid.
- Arenas and clan honors are not built.
- Two beats that work at any population are better than four where two cannot. The town banner and the Week card always say what comes next.

**Open Halls is retired.** The row `open_halls` waives the Call out fee for 12 hours every Wednesday (`src/data/live-events.js`). Call out has charged no gold since Tyler's call 22-8 on 2026-11-20 (`src/data/boss-calls.js`, "NO GOLD", `fee` is 0). So the event moves nothing, and its words promise something that is always true. FB-12 removes the row and its words. The `open_halls` type goes with them unless a row still uses it.

### 1.2 The rows for the first months

**The anchor.** One instant, `CALENDAR_ANCHOR`, set by the Coordinator in the release commit: the first Friday 12:00 UTC at least 7 days after the release window applies. Every row is an offset in days from it, and the generator writes each row's `first` from the anchor. Moving the calendar is one new generated file, never a hand edit (as `live-events.js` already rules).

**Why the boss comes first.** The boss works from the first day, because its pool is sized by weekly active accounts with a floor. The fire needs time to fill. So the first Hearthrise comes two weeks after the anchor, with about three weeks of fuel behind it and possibly a mark from the boss.

| Week from the anchor | Weekend | What runs |
|---|---|---|
| 0 | Fri to Mon | Mossback at the Mill Pond |
| 1 | | Quiet |
| 2 | | The Hearthrise, its size read from the fire at 12:00 UTC Friday |
| 3 | | Quiet |
| 4 | | Mossback |
| 5 | | Quiet |
| 6 | | The Hearthrise |
| 7 | | Quiet |
| 8 | | Mossback |
| 9 | | Quiet |
| 10 | | The Hearthrise |
| 11 | | Quiet |

It repeats every 28 days with no end date. A year holds 13 of each.

**The rows.** In `src/data/live-events.js`, FB-12's file.

| Row | type | scope | Offset from the anchor | hours | everyDays | Dial |
|---|---|---|---|---|---|---|
| `hearthrise` (replaces `bonus_weekend`) | `xp_bonus` | `world` | 14 days | 72 | 28 | Read from the fire at the instant it lights (section 1.3). Never typed |
| `mossback` (new) | `world_boss` (new type, FB-12 adds it, FB-13 reads it) | `world` | 0 days | 72 | 28 | None. It opens the boss room and moves no number |
| `open_halls` | Removed | | | | | |

**The `xp_bonus` type's range** narrows from `[1000, 1500]` to `[1100, 1250]`. The ruled ceiling is +25% (27-5) and the Hearthrise's floor is +10% (CE-8). The `world_boss` type has no dial, so its `range` and `stack` are empty and the validator accepts a type with no dial only when it names a boss row.

### 1.3 The Hearthrise's size

**The fire.** One server row: the fuel burned since the last lighting, the boss marks earned since then, and when the count last reset.

| Rule | Value | Label |
|---|---|---|
| What counts as fuel | Every fuel item burned at the Great Hearth adds 1. That is every row of `HEARTH_FUELS` in `src/data/hearth.js`: Bones, the three family fuels, Tower Cinders and the higher rungs | JUDGMENT. Kills set fuel, and a four's kills an hour barely move with Level, so a Level 20 account and a Level 300 account feed the fire alike |
| A named fuel | Adds `namedFuelFire`, one hour of bones: `FLAME_FUEL.bonesPerHour` from `src/data/core-model.js`, 121 today | JUDGMENT. A super-rare burn should be seen on the fire. Read from data, never typed |
| The fire's goal | `fuelPerActiveDay` x weekly active accounts x `fireDays` | CE-8 asks for a fixed amount for each weekly active account |
| Weekly active accounts | `hr_weekly_actives_count`, the count staged 1014 builds for the Works, sized once a UTC day | Reused. 1014 stands (D-5) |
| `fireDays` | The days since the count last reset, at most 28 | So the first fire after the release, which has had about 21 days, needs 21 days of fuel and not 28 |
| `fuelPerActiveDay` | `fireShare` x the fuel a reference account finds in a day | A data row filled from the matrix, never typed |
| `fireShare` | 0.25 | JUDGMENT. The fire fills if every active account burns a quarter of what it finds, or half of them burn half. Feeding it is a choice and not a chore |
| The fuel a reference account finds in a day | A mid four on Normal, 12 hunted hours, fuel items dropped, the median over open grounds | FB-3 adds the reader. Until it reads, the stand-in is one hero's measured rate: 121 x 12 = 1,452 a day (COMPUTED from `FLAME_FUEL`, a lone hero in the cellar on 2026-10-19, before the fix and before four heroes) |
| One account's day | At most `fireDayCapShares` x `fuelPerActiveDay` of the fire comes from one account in one UTC day | JUDGMENT. `fireDayCapShares` = 4. One keen account can carry four accounts' share, which a small server needs, and gold buying fuel on the market cannot fill a big server's fire alone |
| Marks | `fuelMarks` = floor(5 x the fuel over the goal), at most 5. `marks` = the smaller of 5 and `fuelMarks` plus `bossMarks` | |
| The size | +10% Level XP, plus 3% a mark: 10, 13, 16, 19, 22, 25 | The floor and the ceiling are CE-8 and 27-5. The step of 3 is JUDGMENT: five marks a player can count |
| When the size is read | Once, at the instant it lights. It holds for the whole 72 hours | |
| The reset | At the lighting, fuel and boss marks go to zero. Fuel burned during the weekend counts toward the next fire | |
| The boss mark | When the server empties the world boss's pool, `bossMarks` rises by 1 | Section 2.4. It is fuel-only in spirit (what Havora burns of him), never gold |
| How the fire is counted | Folded from the journal's fuel rows at most once an hour, by one server statement under a try-lock, the way 1014 sizes the Works once a day. Never on the settle path | JUDGMENT, FB-12 confirms the journal holds every fuel burn. If it does not, the artisan pay point adds to the account's day count after FB-10 lands |

**COMPUTED with the stand-in, for scale only.** `fuelPerActiveDay` is 0.25 x 1,452 = 363. A full 28 day fire is about 10,200 fuel an active account. With 7 weekly active accounts that is about 71,000 fuel. One account may add at most 1,452 a day. Burning 1,452 Bones takes one hero under ten minutes at the Hearth's 400 ms a bone, so time is never the limit. Fuel is.

**What stays ruled.** Fuel moves the fire and gold never does (RULED 2026-11-04). No event over +25% and never two at once (27-5). The calendar says when it lights and the fire says how big (CE-8, let stand). No bought XP boost exists (MM-29-XP).

**Known limit.** Bones trade on the market, so gold can buy fuel from players and burn it. The day cap bounds what one account adds. The result is still the same +X% for everyone, so a payer buys the server a bigger weekend and gets no edge of his own. JUDGMENT that this is acceptable. Security reads it with the rest of FB-12.

### 1.4 What FB-12 builds, as data

| File | Row | Value |
|---|---|---|
| `src/data/live-events.js` | `LIVE_EVENT_TYPES.xp_bonus.range` | `[1100, 1250]` |
| | `LIVE_EVENT_TYPES.world_boss` | New. No dial, no switch of its own beyond FB-13's |
| | `LIVE_EVENTS.hearthrise` | `{ type: 'xp_bonus', pm: 'fire', scope: 'world', offsetDays: 14, hours: 72, everyDays: 28 }` |
| | `LIVE_EVENTS.mossback` | `{ type: 'world_boss', boss: 'mossback', scope: 'world', offsetDays: 0, hours: 72, everyDays: 28 }` |
| | `LIVE_EVENTS.bonus_weekend`, `LIVE_EVENTS.open_halls` | Removed |
| | `CALENDAR_ANCHOR` | Set by the Coordinator at the release |
| `src/data/hearth.js` | `HEARTHRISE_FIRE` | `{ fireShare: 250 (permille), fireDayCapShares: 4, marks: 5, floorPm: 1100, stepPm: 30, maxDays: 28, namedFuelFire: 'FLAME_FUEL.bonesPerHour' }` |
| | `fuelPerActiveDay` | Generated from the matrix reader. The stand-in is written with its source in the row's comment |

### 1.5 The words

| Where | Words |
|---|---|
| Event name | "Hearthrise" |
| The plate, before | "Hearthrise starts {start}" |
| The plate, during | "+{pct}% Level XP on every hunt until {end}" |
| The chip | "+{pct}% Level XP" |
| System line, start | "Hearthrise: +{pct}% Level XP until {end}" |
| System line, end | "Hearthrise over. Next: {next}" |
| Hunts and a ground's page | "+{pct}% Level XP this weekend" |
| The analyzer | "Hearthrise" |
| The Hearth window, the fire | "Fire: {marks} / 5" |
| | "Lights {start}: +{pct}% Level XP" |
| | "Next mark: {need} more fuel" |
| | At five marks: "Full. +25% Level XP when it lights" |
| The Hearth window, the one line that explains it | "Every bit of fuel burned here grows the fire. The bigger it is when the Hearthrise lights, the more Level XP everyone earns." |
| The town banner on the Friday | "The Hearthrise is lit. +{pct}% Level XP until {end}." |
| A quiet weekend, the Week card's next line | "Next: {event} in {days} days" |
| The release note | "The XP weekend is now the Hearthrise. It comes every four weeks, and the more fuel the town burns at the Great Hearth, the bigger it is." |

### 1.6 A small server

S-18 c puts the first build on 7 accounts. Each piece is checked against that.

| Piece | With 7 accounts | Why it does not feel dead |
|---|---|---|
| The fire | Its goal is about 71,000 fuel on the stand-in | It is sized per active account, so the share each account carries is the same at 7 and at 7,000. The floor means the weekend is never nothing |
| The calendar | Two beats a month | Each works with one account playing. The plate always says what is next |
| The boss | Section 2.5 | One account that goes all the way drives him off |

### 1.7 Walk-through against real data

| # | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|
| 1 | The release applies and the Coordinator sets the anchor | Nothing | `live-events.js` rows have `first`, `hours`, `everyDays`, `until`. The generator `tools/gen-live-events.mjs` writes the server's two tables from them | Yes. `offsetDays` and the anchor are new |
| 2 | A Level 3 hero carries Bones home from the Mill Cellar | Bones | `monsters.js` `rat`: Bones, 21% a kill | Yes |
| 3 | Its rest plan burns 20 Bones at the Great Hearth | 20 Bones, Inner Flame 1 | `hearth.js` HEARTH_FUELS: Bones need Inner Flame 1, 400 ms each. `recipes.js` builds `inner_flame` from those rows | Yes |
| 4 | The fold adds 20 to the fire within the hour | Step 3's journal rows | FB-12's fold | New |
| 5 | Week 0: Mossback stands, and the server drives him off | D-6 | Section 2 | New |
| 6 | `bossMarks` is 1 | Step 5 | FB-13's fall writes it | New |
| 7 | Week 2, Friday 12:00 UTC: the Hearthrise lights at 10% plus 3% a mark | The fire | The server reads the fire once | New |
| 8 | A hunt with the browser closed earns the bonus on every kill | The lit row | `hr_live_xp_windows` in `2027-03-22-live-events.sql` hands the settle the dial. `xp-share.js` multiplies by `xpMultOf` at the kill's own combat time | Yes. Only the dial's source is new |
| 9 | Monday 12:00 UTC: it goes out, the fire resets, the next lights in 28 days | | The row's `everyDays` | Yes |

### 1.8 Evidence

| Claim | Label |
|---|---|
| Call out costs no gold, so Open Halls moves nothing | Read from `src/data/boss-calls.js` header and `fee` 0 (Tyler 2026-11-20, 22-8) |
| The bonus weekend runs every 14 days at +25% with a range to +50% today | Read from `src/data/live-events.js` |
| A four's fuel an hour barely moves with Level | JUDGMENT, on the measured fact that a four's kills are set by how fast monsters come (chapter 06 section 2.2, run 44920906999, before the fix). FB-3's reader settles it |
| 121 bones an hour | Read from `FLAME_FUEL`, measured 2026-10-19 on a lone hero. A stand-in only |
| `fireShare` 0.25 and the cap of 4 shares | JUDGMENT. The playtest reads fuel burned in the week before a lighting against the week after (GR-82's own read) and whether the fire fills every time (CE-8's own overturn) |
| Two beats beat four on 7 accounts | JUDGMENT |

### 1.9 For the integrator

- **06 section 2.5, the table.** Weekend 2 is one ground's weekend and weekend 3 a world boss. Add "In the first build weekends 2 and 4 are quiet, and the boss stands on weekend 3." Add the fire's marks: "+10% on an empty fire, then +3% a mark to +25% at five marks."
- **06 section 2.11, MM-11's row.** "In the first build: the calendar, with the Hearthrise and the world boss two weeks apart."
- **07 section 2.12, "Where it meets the calendar", and section 5 item 11.** The fuel that fills the fire is ruled here: a quarter of the fuel weekly active accounts find, one per fuel item, a named fuel worth an hour of bones, at most four shares an account a day, a mark from the boss's fall. Item 11 closes.
- **08 section 2.7, the weekend row.** The first build runs the Hearthrise and the world boss. **08 section 2.5, the Path.** Row 11's calendar banner reads the next event.
- **13 FB-12.** Builds the `world_boss` type, the anchor, the fire row, its hourly fold and the boss mark's column, and removes `open_halls`. Add to its tests: the fire's size read once at the lighting, the day cap, the reset, the boss mark, the range refused past 1250.
- **13 section 3.3, the release note table.** Add "The XP weekend is now the Hearthrise, every four weeks" (FB-12).
- **`decisions/`.** MM-11 and CE-8 gain the sizes. MM-42's row notes that its slot is weekend 2.

---

## 2. D-6, before FB-13

### 2.1 Who he is

**Mossback.** A huge old brook bear from Mosslight Glade. Moss grows thick on his back from years of lying in the glade's springs, and the copper water makes it glow a little after dark. Every few weeks he smells the honey in the hive under the mill and follows the Meadowbrook down to the Mill Pond. The whole town turns out to drive him back. Nobody has ever killed him. Rook's poachers have wanted his hide for years, and when he starts to tire they come out of the trees to take him themselves.

**Why this boss, and the name.** JUDGMENT, every link checked against the data.

| Link | Where it already is |
|---|---|
| The hive under the mill | The Chronicle's "Rats Under the Mill" (`src/data/text/chronicle.js`). The Hive Wasp and its comb in the Mill Cellar (`hearth.js` NAMED_FUELS `queens_comb`) |
| The brook from the glade past town | The Chronicle's Thicket and Glade pages. The Meadowbrook starts in the glade |
| Bears in the glade, and the poachers who came for them | The Glade page: "Poachers moved in for the bears". The Brook Bear (`monsters.js` `brook_bear`, Level 24, the Glade) and the Glade Poacher (`glade_poacher`, Level 19) |
| The glowing moss | The Glade page: copper water makes the moss glow blue green |
| The mill | Havora's mill stands at tile 89, 28 with the cellar hatch beside it (`src/data/world/town/sites.js`) |

The name is a plain description, the way Grayjaw is (`grayjaws_ruff`, the Thicket's den mother). It names two real things, moss and a back, and leans on no mood word (2026-10-25). Nothing in `src/` or the book uses it yet (searched).

A beast and not a villain, on purpose. The villains are shared and end their regions (RULED 2026-11-14). The world boss returns every four weeks, so it must be something the town drives off, not something it kills. A Level 13 hero meets him the week it reaches the Thicket's top, and he points it toward the Glade.

**The Chronicle page.** Sample first, as ruled for lore (2026-11-11). FB-13 adds it to `src/data/text/chronicle.js` and Tyler reads it before a second boss page is written.

| Row | Words |
|---|---|
| `title_mossback` | "Mossback" |
| `teaser_mossback` | "Something big comes down the brook for the honey." |
| `opens_mossback` | "Opens when you fight Mossback" |
| `page_mossback` | "Every few weeks a bear comes down the Meadowbrook from Mosslight Glade, and he's bigger than anything else that lives up there. He's old enough that moss grows on his back, and the copper water up in the glade makes it glow a little after dark. That's how he got the name Mossback.\n\nHe comes for the honey. The wasps under the mill have kept a hive down there longer than anybody can remember, and he can smell it from the glade. He wades across the mill pond, tears up whatever is in his way and starts digging at the mill wall.\n\nThe miller won't go near him, so the whole town goes out instead. Nobody has ever killed him. Hunters keep at him until he gives up and goes back up the brook, and then everybody waits for him to come back.\n\nRook's poachers have wanted his hide for years. You can still see their old arrows broken off in the moss on his back. When he starts to slow down they come out of the trees to finish him off themselves, and they don't care who else is standing there." |

### 2.2 The monster, on the one formula

| Field | Value | Why |
|---|---|---|
| `id`, `name` | `mossback`, "Mossback" | |
| Class, family | `mammal`, Mammal | A bear |
| Role | The formula's boss role (`C-MON-STATS`, chapter 02 section 2.5): health 5, blow 1.1, the blow held to a third of the health of a hero at the room's Level | One formula. The blow cap is GR-25 rule 2, approved (S-15 a) |
| Level | The room's Level: the party's Level by the scaled-hunt rule (the leader's, MM-19 and chapter 02 section 2.6) | MM-5 |
| Health of one bar | The boss role at that Level times the hall number every hall shares (GR-30). The hall number acts on health only | MM-5, GR-30 |
| Elements | Weak to fire, resists frost: `{ ember: -15, frost: 25 }`, the Brook Bear's row | His wet coat, the same rule as the bear he is |
| Weapons | An explicit override: no weakness and no resistance, so the mammal class's bow weakness and magic resistance do not apply | JUDGMENT. The shared bar is the one fight where every way to fight must count the same. With the class default, a party of bows would break bars about 20% faster every boss weekend for as long as he is the only boss |
| Spells | `mossback_swipe`, then `mossback_slam` (below) | A boss lists his marked hit first, then his pulse (`monster-spells.js`) |
| Phases, on every bar | `{ addsPm: 500, enragePm: 250, enrageAtkPm: 1400, guardPm: 800, hasten: { spell: 'mossback_slam', cdPm: 500 } }` | The ruled boss phases (2026-11-05), in the fields `boss-phases.js` reads today. Chief Coppercap's room carries the same guard (`chief_coppercap_called`) |
| Adds | Two `mossback_poacher` at half of each bar: a called copy of `glade_poacher` at the room's Level, the regular role, no spell, paying nothing, `add: true` | The precedent is `drain_rat_called` and `goblin_digger_called`. They ask the guard's questions: Challenge, an area slot, Target on Lowest HP |
| Drops | None. The chest pays | MM-6 |
| He never dies | When a bar empties it refills and the phases run again (MM-5). FB-13 builds the refill in `src/core/hunt/boss-room.js` | |

**The two spell rows**, in `src/data/monster-spells.js`. Both copy rows that are already played.

| Row | n | shape | Size | range | windupMs | cdMs | hitPm | element | Copied from |
|---|---|---|---|---|---|---|---|---|---|
| `mossback_swipe` | "Swipe" | `cone` | `len` 2 | 1 | 1600 | 12000 | 2000 | null | `tail_lash`, the Rat King's marked hit |
| `mossback_slam` | "Slam" | `group` | | 6 | 2000 | 20000 | 400 | null | `squeal`, the Rat King's pulse, 0.4 times a boss's hit for a party built for his room |

Under a quarter of each bar the Slam comes twice as often, every 10 seconds. The tank holds the Swipe, the casters step off it, and the Slam reaches everyone, which is what the healer and a heal rule are for.

### 2.3 The room

| Rule | Value | Label |
|---|---|---|
| Who may enter | A party whose heroes are each Level 13 or more | DECIDED GR-79 (Path row 15) |
| The tier | The one tier table. The first send defaults to Normal | MM-7 |
| **What a tier pays in the room** | Points and Level XP are multiplied by `bossTierPm`: the mid four's median Level XP an hour on that tier over Normal on the open grounds, read on the replayed matrix and written by FB-3's generator beside the tier-risk file | JUDGMENT. It refines MM-5, which multiplied by the tier table's `tierXp` alone (Dangerous 1.10, Deadly 1.25). On a ground most of a harder tier's pay comes from the bigger pull, and the room has no pull. At 1.10 nobody would send on Dangerous into blows 2.5 times as hard, which is MM-7's own overturn. With this row a tier in the room pays what it pays on a ground, so the choice is the same choice. Until FB-3 reads it, `tierXp` |
| Level XP | A broken bar pays the Level law's XP for one Normal party-hour at the room's Level, over `barsPerNormalHour`, times `bossTierPm` | MM-6: about what the same stamina earns on a hunt of that tier. The two-thirds rule applies (MM-19) |
| Coin and drops | None | MM-6 |
| Supplies | As a hunt: the store charges what is used, inside the hunt budget (GR-57) | |
| Death | A normal death: 6% with no cap, cut by Blessings and the ladder. It ends that hero's fight and the rest fight on (S-14 a) | MM-7, with its RULED pieces |
| Carry on | Never sends a hero into the room | MM-7 |
| On-call guests | Not in the room in the first build | Chapter 11 section 1.4 |
| The kit | Saved for the boss and offered again the next time he stands (GR-48) | |

### 2.4 Points, the chest, the trophy and the fall

**Points.** `points = bars broken x bossTierPm`, counted in the settle for the account and summed over its heroes' parties. Never by rank. The marks are written in Normal party-hours and turned into points by `barsPerNormalHour`, the bars a mid four breaks in a Normal hour on FB-3's boss room cells at Levels 25, 52 and 75. MM-5 asks those three to sit within 10% of each other, so one number serves every Level. If they do not, the fault is in the boss formula and is fixed there, as MM-5 says.

**The chest.** One chest an account a boss weekend. Each mark pays once, the moment the settle crosses it, with no press.

| Mark | Normal party-hours | Share of a four's 36 stamina hours in the window | What it pays |
|---|---|---|---|
| 1 | 2 | 6% | **+5% damage dealt for 7 days** for every hero on the account. The first time an account ever reaches it, **Mossback's Claw** |
| 2 | 6 | 17% | **One Mossback Cloak**, for one hero (below) |
| 3 | 12 | 33% | **The buff runs 14 days** from mark 1 instead of 7 |

**Why these sizes.** COMPUTED: a 72 hour window at 12 hunted hours a day holds 36 party-hours of stamina. Chapter 06 sets the healthy share of weekend stamina on the boss at 10 to 35%, with "near all of it" as the bad sign (section 6). MM-6's marks of 2, 8 and 20 put the last at 56%, which is a duty. These put it at 33%. On a harder tier `bossTierPm` brings every mark sooner. JUDGMENT, checked by playtest E.

**Why both a buff and gear.** The ruling of 2026-11-21 is buffs and gear, and the audit asked D-6 to choose (A-7). Each mark pays what fits its effort. Showing up for an evening pays a buff every hero feels. A real share of the weekend pays a piece you keep. The buff is one row on the modifier table (`playerAttack`, timed), inside the timed damage cap of +10% (MM-25), earned only. It is also the "one buff played in a cell" the review asks for.

**The Mossback Cloak.** One line of four cuts, one a way to fight (MM-6, CE-1 rule 5).

| Cut | The hero it goes to | Its one attribute | Read from |
|---|---|---|---|
| Defense | A tank | +1 Defense | `special-attributes.js` `defense`, the cape's own attribute |
| Melee | A melee hero | + Melee, 2 at tiers 1 to 4 and 3 at 5 to 7 | `special-attributes.js` `skill` |
| Ranged | A ranger | + Ranged, the same sizes | The same |
| Magic | A mage or a healer | Focus: 2% of max mana back on each kill at tiers 1 to 3, 3% from tier 4 | `jewelry.js` `JEWEL_PERKS.focus`, in `PERKS_PLAYED`. + Magic is not used, because it measured as nothing (`special-attributes.js` `unproven`) |

| Rule | Value |
|---|---|
| The base | The cape ladder's rung the hero can wear now: the highest rung in `slot-ladders.js` whose `reqLv` is at or under the hero's Level. Its numbers and its `reqLv` |
| The attribute's size | The rung's tier in `special-attributes.js`. Tier 1 reads tier 2's size, because that table starts at 2 |
| Past the last rung | The Dawnlit Mantle's rung (Level 88), until the gear curve writes cape rows for later bands (FB-8) |
| Who gets it | The account's standing rule "Cloak goes to". The default is Auto: the hero whose worn cape is furthest under its own Mossback Cloak, the front hero first on a tie (`ROLE_ORDER`, `hunt-roles.js`). The player may pin a hero once |
| The cut | The hero's way to fight when the chest pays: tank, melee, ranger, mage or healer, by `ROLE_ORDER` |
| Where it goes | Storage, never a bag, so a full bag never loses it. "Wear upgrades" puts it on at the next Start when it is strictly better (D-2) |
| Rows | Four line rows, written once. The item rows, one for each rung and cut, are generated with `--check` and carry no hand-typed number. Book value follows the gear exchange rates for its attribute (R11) |
| Trade | Like any gear (MM-27, and no bound gear, RULED 2026-10-23) |
| Rarity | Unique |
| Reforge | Up a band, keeping its attribute (31-4) |

**Known tension.** Crafted cloaks have no perk hook yet (`jewelry.js`: a cloak ships plain until Slip and Stride land). So for now the Mossback Cloak is the best cape at its rung for its way to fight, and a player who skips the boss buys it on the market. CE-1 rule 3 wants the layer to be a second road to a best piece. It becomes that the day cloak perks land. JUDGMENT: accepted for the first build, because the cape is the one slot every way to fight wears and the attribute is small.

**Mossback's Claw.** The account trophy (MM-6). Given once to each account, bound to the account and never on the market, because it says the account was there. It is a collector's piece until the Hall of Firsts hangs boss trophies (GR-73). FB-13 adds it to the catalogue-coherence allowlist beside the Rat King's Crown and Coppercap's Cauldron with that promise, and its Shop bid is zero so "Sell all junk" never takes it.

**The fall.** When the pool is empty:

- A System line and the town banner say so.
- The plaque on the boss window records the first blow (the account whose party broke the first bar), the last blow (the account whose points emptied the pool) and the top clan by points, hidden while no clan exists.
- **The Great Hearth's fire gains one mark** (D-7, section 1.3). This is what makes the shared bar matter in the first build, because MM-6's fall bonus waits until the boss has stood twice (13 section 1.2). Everyone who hunts on the next Hearthrise gains from it, at no cost to anyone.
- The room stays open to the end of the window, and marks still pay (MM-4).

If he is not driven off by Monday 12:00 UTC, he goes back up the brook. No fire mark. The server re-sizes the pool for next time (MM-4).

### 2.5 The pool on a small server

| Row | Value | Label |
|---|---|---|
| `bossPoolPerAccount` | Half of mark 2: 3 Normal party-hours of points for each weekly active account | JUDGMENT. Then a rule a player can say out loud holds: he is driven off when about half the active accounts reach their second mark |
| `bossPoolFloor` | Mark 3: 12 Normal party-hours | JUDGMENT. One account that goes all the way drives him off alone |
| The pool | The larger of the two, read when he stands, from `hr_weekly_actives_count` | MM-4 |
| Re-sizing | After each stand, aimed at hour 48 and moved at most a quarter | MM-4 |

COMPUTED. With 7 weekly active accounts the pool is 21 Normal party-hours, so four accounts at mark 2 drive him off. With one account it is 12. With 30 it is 90, about 15 accounts at mark 2.

### 2.6 Art, for the asset director

| Piece | Spec | Where it goes |
|---|---|---|
| **Portrait** | The hearthfire painted direction. A three-quarter bust of a huge old brown bear, his coat wet and dark, a thick mat of moss over his shoulders and back with a faint blue-green glow, the stubs of three or four old arrows broken off in the moss, a torn ear, gray around the muzzle. Mouth closed. No honey and no snarl. He is old and tired of being shot at | `assets/icons-bundle/hearthfire/monsters/mossback.png`. Add `mossback` to `SHIPPED` in `src/data/monster-art.js` |
| **32 px head** | The same face, front view, in the world palette | `assets/icons-bundle/pixel/heads/mossback.png`, on the `HEAD_ART` list |
| **World sprite** | PixelLab style-1, eight facings. About one and a half times the Brook Bear's body, so no beast class holds him. The art director adds one row to `CLASSES` in `src/data/world/art-budget.js`, proposed `beast_huge`: frame 128 by 96, anchor 64, 90, body 64 to 76 measured by width, a unit with an ellipse shadow. The moss uses the Glade's mosslight ramp | Through `tools/world-art` and `tests/world-assets.mjs` |
| **Clips** | Idle. Walk. Swipe: one forepaw sweeps the two tiles in front of him. Slam: he rears on his hind legs and comes down on both forepaws. Roar: when a bar breaks and when he crosses his enrage line. Hurt. **No death clip**, because he never dies in the room | |
| **The adds** | The Glade Poacher's sprite, through `HUNT_ART_ALIAS` (`mossback_poacher` to `glade_poacher`) | No new art |
| **The room, "The Mill Pond"** | About 24 by 16 tiles in the Greenhaven kit, no new tileset. The Meadowbrook comes in at the north over a low weir into the pond, which fills the north-west third. The mill's back wall and wheel run along the south-east, with torn grain sacks and a broken comb frame by the wall. A split-rail fence on the east with pine and bramble behind it, where the poachers come out. Reeds and mud round the pond. Mossback starts at the water's edge, north of center. The party starts in the south-west on the mill path | `src/data/world/maps/mill_pond.js`, region `greenhaven` |
| **Two item icons** | The Mossback Cloak, one icon for all four cuts. Mossback's Claw | `assets/icons-bundle/`, wired in `src/data/item-art.js` |

Integer scales only, one palette, one perspective (`docs/ART_DIRECTION.md`).

### 2.7 The words

| Where | Words |
|---|---|
| Window title | "Mossback" |
| Place | "The Mill Pond" |
| Status while he stands | "Here until {end}" |
| Status while he is away | "Next: {start}" |
| The shared bar | "Mossback: {pct}% left" |
| The account's points | "Your points: {points}" |
| Mark 1 | "+5% damage, 7 days" |
| Mark 2 | "Mossback Cloak" |
| Mark 3 | "+5% damage, 14 days" |
| The standing rule | "Cloak goes to: {name}", with the control "Change" |
| The card's one lore line | "He comes down the brook for the honey under the mill. The whole town turns out to drive him back." |
| The calendar plate | "Mossback comes to the Mill Pond {start}" |
| System line, start | "Mossback is at the Mill Pond until {end}" |
| System line, the fall | "Havora drove Mossback off. The Great Hearth's fire grew one mark." |
| System line, the window ends with no fall | "Mossback went back up the brook. Next: {next}" |
| Return card, mark 1 | "Mossback: +5% damage for 7 days" |
| Return card, mark 2 | "Mossback: {name} got a Mossback Cloak ({cut})" |
| Return card, mark 3 | "Mossback: your damage buff lasts 14 days" |
| Return card, the trophy | "Mossback's Claw added to your trophies" |
| The hero sheet's buff | "Mossback: +5% damage ({left})" |
| The Path, row 15 | "Level 13. Mossback" |
| The plaque | "First blow: {account}", "Last blow: {account}", "Top clan: {clan}" |
| Mossback Cloak, item line | "Made from the fur and moss Mossback leaves on the fence posts at the Mill Pond. It still glows a little after dark." |
| Mossback's Claw, item line | "One of Mossback's claws. It snapped off on somebody's shield." |
| The four cuts | "Defense", "Melee", "Ranged", "Magic" |
| Spells in the combat log | "Swipe", "Slam" |

### 2.8 Walk-through against real data: a Level 13 four's first Mossback weekend

| # | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|
| 1 | Four heroes at Level 13 or more | Day one's 12 hunted hours. Level 10 by 6 hunted hours (RULED 2026-11-20) | D-1's walk-through, `hunts.js` bands | Yes |
| 2 | Friday 12:00 UTC: the `mossback` row opens the window | The calendar (D-7) | `live-events.js` rows | A new type |
| 3 | The window shows him, the bar and the marks | | FB-13's window | New |
| 4 | Enter on Normal | Stamina, supplies | The one tier table (`hunt-tiers.js`). The hunt budget (GR-57) | Yes. The room is new |
| 5 | The room is built at the leader's Level 13 | | The boss role on `C-MON-STATS`. The hall number (GR-30) | New, FB-13 |
| 6 | He swipes the tank and slams the party | | `cone` and `group` are in `SPELL_SHAPES`. The rows copy `tail_lash` and `squeal` | Yes. Two new rows of played shapes |
| 7 | At half his bar two poachers come out of the trees | | `glade_poacher` (`monsters.js`, Level 19, human). Called adds as `drain_rat_called`. `boss-phases.js` reads `addsPm` and `guardPm` | Yes. The copy at the room's Level is new |
| 8 | The bar empties and refills | | `boss-room.js` | New, FB-13 |
| 9 | Two Normal party-hours: +5% damage for 7 days, and Mossback's Claw | Points | The modifier table (step R20, FB-11, wave 3) | New. **FB-13 needs FB-11's table** |
| 10 | Six: a Mossback Cloak for the tank, the Defense cut | The tank wears a Woolen Cloak | `slot-ladders.js`: `woolen_cloak` `reqLv` 12 is the highest rung at Level 13. `special-attributes.js` `defense` is +1, read at tier 2 | Yes |
| 11 | The next Start wears it | The cloak in Storage | D-2's "Wear upgrades". The ladder rung plus one attribute is strictly better than the plain rung | Yes, once D-2 is built |
| 12 | Twelve: the buff runs 14 days | | | New |
| 13 | A hero dies | Blessings | `blessings.js` `freeUntilLevel` 30, so they are free at 13 | Yes |
| 14 | By Saturday night four accounts have passed mark 2 and the pool empties | 7 weekly active accounts | The pool is 21 Normal party-hours (section 2.5) | New |
| 15 | The fire gains a mark | | D-7 | New |

**Where it breaks on real data.** One place, step 10. The rung's name: `woolen_cloak` is named "Woollen Cloak" in `slot-ladders.js`, British spelling, against the ruling of 2026-10-28. It is not Mossback's, but FB-13 shows it beside his cloak. Raised for the integrator.

### 2.9 Evidence and the exploit read

| Claim | Label |
|---|---|
| Every name and Level above | Read from `src/data` on this branch |
| The sizes of the Swipe and the Slam | Copied from played rows. Their effect in this room is UNKNOWN until FB-3 plays the room at Levels 25, 52 and 75 |
| Marks at 2, 6 and 12 | JUDGMENT, COMPUTED against chapter 06's 10 to 35% |
| `bossTierPm` | JUDGMENT. Its number is FB-3's |
| The pool rows | JUDGMENT, COMPUTED for 1, 7 and 30 accounts |
| Without the override a party of bows breaks bars about 20% faster | COMPUTED from the weakness bonus, 1.20 damage and 1.15 accuracy (chapter 02 section 2.5) |

**Exploit read.** Points are counted only in the settle, and the chest is granted by the server against them (13 FB-13). One cloak an account a weekend is 13 a year at most (CE-1). A second account must spend 6 party-hours of its own stamina for its cloak, as it would for any drop. The buff touches damage, never coin. The fire mark is one server event a stand. The room pays no coin and charges supplies, so it is a small sink.

### 2.10 For the integrator

- **06 section 2.3.** The boss is Mossback at the Mill Pond. The marks are 2, 6 and 12 Normal party-hours, paying the buff, the cloak and the buff's second week. The fall adds a fire mark. The fall bonus waits, as the plan says. MM-5's points rule gains `bossTierPm`. The pool rows of section 2.5.
- **06 section 5, items 1 and 8.** One sample boss is written. The pool and chest numbers are set here.
- **03 section 2.16.** The first line is the Mossback Cloak in four cuts, on the cape ladder's rungs. Note the tension with rule 3 until cloak perks land.
- **02 section 2.5.** Mossback is no unplaced row. The pool (GR-34) has no bear boss whose name passes the naming rule (`ancient_bear` is named "Ancient Bear").
- **13 FB-13.** It depends on FB-11 (the modifier table) for the buff. It adds two spell rows, the boss row, the add row, the cape generator, the trophy and its allowlist line, the Chronicle page, the window's words, the plaque and the fire mark. The asset director's list is section 2.6.
- **13 section 3.6, Security.** The chest grants items and a buff by points. The fall writes the fire.
- **`slot-ladders.js` `woolen_cloak`.** "Woollen Cloak" reads "Woolen Cloak" (2026-10-28). For whichever lane next holds the file.
- **`decisions/`.** MM-2 to MM-7 gain "one sample: Mossback". MM-6's thresholds become 2, 6 and 12.

---

## 3. D-8, before FB-14

### 3.1 The three numbers

| Number | Ruling | Why |
|---|---|---|
| **The opening Level** | **10, for each hero.** A hero under Level 10 cannot be switched On call. The Path row opens for the account once it has a friend or a clan and a hero at Level 10 | Tyler's words are that the hero "trades their crafting/training time". The Training Yard opens at Level 10 (`training.js` `minLevel` 10), so from 10 the trade is real. Under 10 a hero is in its first hours, its rest plan is the starting queue, and nobody wants a Level 5 guest. JUDGMENT |
| **The default tier limit** | **Dangerous.** The owner may raise it to Deadly or lower it to Normal, once, and "Apply to all four" sets it for the account | S-6 a: Deadly is a tier you watch or gamble on and idle players mostly use Dangerous, so a Dangerous limit covers the calls that will happen. A guest risks nothing on Deadly, so the owner gives up nothing by opting in. But a no-loss guest in front on Deadly is the death-shield case band OC3 watches (chapter 11 section 1.7), and a default should not hand it out. JUDGMENT |
| **`onCallXpShare`** | **0.10**, as chapter 11 opened it | Unchanged. "A small cut" (RULED S-1). At 0.10 a full window is worth at most +10% Level pace for that hero (band OC2), and an hour on call is a different currency from an hour at the yard, which pays skill XP at up to half of hunting for gold (GR-54). Under about 0.05 nobody gives a rested hour for it. JUDGMENT, read by OC1 to OC3 |

**What stays as chapter 11 wrote it.** Hire stamina is its own pool of 12 hours, full when a window opens, drained only by a guest settle, never sold and never touched by the refill (RULED 2026-11-21, two pools). One guest a party. Friends and clan mates only. No boss room, Tower, Catacombs or arena. No loss on death. The caller's purse stocks the guest. These are not re-ruled here.

**The default "who may seat"** is friends and clan mates both. It is the widest the ruling allows and the owner narrows it once.

**One thing the seat card must say plainly.** A guest is read by the two-thirds rule like any hero (MM-19), and a high guest lowers the low heroes' shares. COMPUTED on MM-19's line: a Level 50 guest in a party of Level 20 heroes leaves each of them 20 / (2/3 x 50), 60% of its XP share. So lending a veteran to a newcomer trades the newcomer's XP for safety. That is a fair trade and a visible one, and the card shows it before Start (chapter 11 section 1.10 already asks for the line). The other way round, a Level 10 guest in a Level 60 party keeps 25% of 10% of its share, which is nearly nothing and harms nobody.

### 3.2 Data

A new file `src/data/on-call.js`, FB-14's.

| Row | Value | Label |
|---|---|---|
| `ON_CALL_RULES.minLevel` | 10 | This ruling |
| `ON_CALL_RULES.xpSharePm` | 100 | This ruling. Permille, so the server reads an integer |
| `ON_CALL_RULES.windowHours` | 12 | RULED 2026-11-21 |
| `ON_CALL_RULES.everyHours` | 24 | RULED 2026-11-21 |
| `ON_CALL_RULES.hireStaminaHours` | 12 | Chapter 11, inside the two-pools ruling |
| `ON_CALL_RULES.seatsPerParty` | 1 | Chapter 11 |
| `ON_CALL_DEFAULTS` | `{ who: 'friends_and_clan', tierLimit: 'dangerous', on: false }` | This ruling. Off by default (chapter 11 section 3.3) |

**The Path row (D-1 row 24).** `{ id: 'on_call', opener: { kind: 'event', event: 'on_call_open', expectLevel: null }, opens: ['friends'], flag: 'src/data/on-call.js ON_CALL_RULES', scope: 'account' }`. The event fires when the account first has a friend or a clan and a hero at `minLevel`. A lone account may never meet it, so it carries no `expectLevel` and the Path guard does not count it toward coverage. That is the one reading of D-1's rule 2 this needs.

### 3.3 The words

| Where | Words |
|---|---|
| The rest plan's switch | "On call" |
| Its settings | "Who can seat", with "Friends", "Clan" and "Friends and clan". "Highest tier", with "Normal", "Dangerous" and "Deadly". "Apply to all four" |
| The one line under the switch | "Friends and clan mates can bring this hero on their hunts while it rests. It earns 10% of its XP share and loses nothing if it dies." |
| Under Level 10 | "Requires Level 10" |
| The hero strip | The badge "On call", or "Out on a call". The second bar's label "Hire stamina" |
| Friends and the clan roster | The control "Seat" |
| The seat card | "Hire stamina: {h}h {m}m". "XP: 10% of its share". When the window closes first: "Window closes in {h}h {m}m". For each hero under the line: "{Name} keeps {pct}% of its XP share". "Supplies: {gold} gp from your purse" |
| Refusals | "Not on call", "Window closed", "No hire stamina left", "Above this hero's tier limit", "Party already has a guest", "Requires Level 10" |
| The Path line | "On call is open. Friends and clan can bring your heroes on their hunts." |
| The return card | "{Name} hunted with {caller} for {h}h {m}m and earned {xp} Level XP" |
| The return card, a death | "{Name} died on {caller}'s hunt. Nothing was lost." |

### 3.4 Walk-through against real data

| # | Who | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|---|
| 1 | Owner | Adds a friend | An account | The `friends` window (`shell-windows.js`) and MM-47's one request, FB-12 | Yes, once FB-12 lands |
| 2 | Owner | Switches a Level 12 hero On call, friends and clan, up to Dangerous | A hero at Level 10 or more | `training.js` `minLevel` 10. The rest plan (FB-6) | New |
| 3 | Owner | Sends the party hunting and closes the game | One Start | FB-6 | Yes |
| 4 | Server | The hero's hunt ends on stamina, its town job starts, its window opens and hire stamina fills to 12 hours | Step 2. 24 hours since the last window | `hunt-sessions.js` END_ORDER `stamina`. FB-14's window | New |
| 5 | Caller | Opens the Party window and sees the hero under Friends, "Hire stamina: 12h 0m" | Step 4 | The `hunt-party` window (`shell-windows.js`) | New |
| 6 | Caller | Seats the guest beside three own heroes and presses Start on Dangerous | An empty seat, gold for the guest's supplies, a tier inside the limit | The tier is `dangerous`, inside the default | New |
| 7 | Server | Stops and pays the guest's job, seats it, and settles the hunt. The guest earns 10% of its share | Closed-form town work (FB-10) | Chapter 11 section 1.8 | New, on FB-10 |
| 8 | Server | The guest dies. Nothing is taken from it | | Chapter 11 section 1.7 | New |
| 9 | Server | The window is still open, so the guest is free to be seated again until it closes | | | New |
| 10 | Owner | Reads one line on the return card | The seat's ledger row | FB-6's return card provider | New |

Step 6 with Deadly picked instead is refused with "Above this hero's tier limit", and the card says so before the press.

### 3.5 Evidence

| Claim | Label |
|---|---|
| Training opens at Level 10 | Read from `src/data/training.js` |
| Idle players mostly use Dangerous | RULED S-6 a |
| A Level 50 guest leaves Level 20 heroes 60% of their share | COMPUTED on MM-19 |
| 0.10 is small and still chosen | JUDGMENT. Bands OC1 to OC3 read it once two clans play (chapter 11 section 8). With 7 accounts they cannot read it (S-18), so it stays PROVISIONAL into the invited group |

### 3.6 For the integrator

- **11 sections 1.4, 1.6 and 4.** The opening Level is 10, the default tier limit Dangerous, the default "who" friends and clan, `onCallXpShare` 0.10. The knobs table gains the defaults. Section 1.10's Path row reads the event of section 3.2 here.
- **08 section 2.5, the Path.** Row 24 reads `on_call_open` with no `expectLevel`, not counted toward coverage.
- **13 FB-14.** It owns `src/data/on-call.js`. Its tests add the refusal for a tier over the limit and for a hero under Level 10.
- **`decisions/` CH11-1.** The three numbers are set, PROVISIONAL.

---

## 4. D-5, before FB-9

### 4.1 Which prices are rows of hours

Three kinds. A price is in exactly one. The wage is `wage(L)`, one hero-hour of a mid four on Normal (GR-51), computed by the server from FB-9's generated table.

**Rows of hours, read live at the buyer's Level.** The row holds hours. The gold is hours x `wage(L)` at the instant of the purchase.

| Price | Hours | Read at | Status |
|---|---|---|---|
| Stamina refill, the first of the day, a full 4 hours | **2**, then x1, 1.5, 2, 2.5, 3, 3.5 (RULED 24-1). A part refill is pro rata, as today | The hero's Level | Base: this ruling |
| Blessings 1, 2 and 3 | **0.4, 0.6 and 1.0**: the set is 2 hours, the first cheap (RULED 21-8). Free under Level 30 (`blessings.js` `freeUntilLevel`) | The hero's Level | This ruling sizes 21-8 in the wage's unit |
| Each Blessing past the third | **A fifth of the hours that rung saves on one death**: 0.2 x its added cut x the hours an unblessed death costs at that Level | The hero's Level | Chapter 04's "under a fifth", set at a fifth. The ladder is D-4 |
| The talent reset | **3**, free under Level 30, ten a day | The hero's Level | Chapter 10, `talentResetHours`, unchanged |
| Rename | **8** | The hero's Level | Tyler: a name change "should cost a lot of gold" (2026-10-22). Today's 20,000 + 500 a Level was sized at about 8 hours (`hero-rename.js`), so the hours keep its intent at every Level |
| Hero colors | **1** | The hero's Level | Waits for its art (`HERO_DYES_SHOWN` is false). The row exists for when it ships |

**Set once from the wage curve.** The generator writes typed gold from a row of account-days and a reference Level, with `--check`. The gold does not follow the buyer's Level, because the House is typed content (GR-51), and it moves only when a release re-runs the generator on purpose.

| Price | Row | Status |
|---|---|---|
| The Hearthside Homestead | **400 gold, unchanged.** It is the first return's errand (D-1 walk-through step 16) | CE-5 |
| The Fieldworth Farmstead | **1 account-day at Level 20** | CE-5's size. The Level is chapter 12 section 3.7's |
| The Stonecross Manor | **3 account-days at Level 60** | The same |
| The Ironvale Keep | **6 account-days at Level 90** | The same |
| The Hearthrise Castle | **20 account-days at Level 110** | The same |
| Every sellable room rung and every Storage chest | **Its gold today x F**, rounded to two figures, where F is the geometric mean of the four deeds' new gold over their gold today | CE-5's "the same factor". One factor, so a Homestead room and a Farmstead room move together. The deeds' materials are unchanged |

An account-day is 48 x `wage(L)`. FB-9 adds the held rooms to `HELD_HOME_ROOMS` before it prices anything (Part C X-01), so only sellable rungs are re-priced.

**Typed as ruled, no wage row in the first build.**

| Price | Why it stays |
|---|---|
| The yard fee, 100 x skill level an hour | RULED 24-8. GR-54's rate change waits (13 section 1.2) |
| Tempering, Hallmarks, linings | Kept typed by Tyler on 2026-11-18. Sinks as a share of band gold wait (13 section 1.3 point 2) |
| Setup slots 15,000 and 40,000 | RULED S-3 a |
| The bench tax, 15% of the Shop bid | DECIDED GR-56b |
| The market's 1% and 4% | GR-50 |
| The Town Crier, a Round, flame powders | RULED 2026-11-04, prices that climb in a day |
| Works gifts | RULED 24-10 |
| Bag rungs and the Key Ring | A hero's own room. CE-5: a price one hero pays needs no change for four |
| Founding a clan, 100,000 | Cheap on purpose on a server with no clans yet (S-18, audit A-20) |

### 4.2 The refill's base hours

**2 hours of the hero's wage for the first full refill of the day.** COMPUTED at every Level, because both sides are hours. A full refill gives 4 hunted hours, which earn about 4 hours of wage on Normal and more on a harder tier.

| Refill of the day | Costs, in hours of wage | Earns back, on Normal | |
|---|---|---|---|
| 1 | 2 | 4 | Pays for itself |
| 2 | 3 | 4 | Pays for itself |
| 3 | 4 | 4 | Breaks even |
| 4 | 5 | 4 | Gold for XP |
| 5 | 6 | 4 | Gold for XP |
| 6 | 7 | 4 | Gold for XP |

**Why 2.** 24-1 ruled that the first two refills always pay for themselves, so the base must stay under 2.67 hours. Every hero hunts 12 hours a day (2026-11-21) and the free bar is 8, so a free hero buys one refill a day. At 2 hours that refill leaves it 2 hours of gold ahead, and the 12 hour Premium bar saves an account 8 hero-hours of gold a day, a sixth of an account-day. That is Premium's gold value, and it is real without making the free day poor. JUDGMENT.

**The veto (R-1).** The typed price made refills 4 to 6 gold for XP only from Level 80. In hours the shape is the same at every Level. "Veto R-1" sets the base at 1.33 hours: then the first five pay for themselves and only the sixth is gold for XP.

S-17 a puts every hero on the 12 hour bar in the playtest, so refills are bought only past 12 hours there. Nothing sells hire stamina, and the refill never touches it (D-8).

### 4.3 The wage until the playtest

`wage(L)` reads the coin line and the kill-rate reference, which are the tool's. The tool over-reads the one real four: its coin 1.24 times (R0, before the fix) and its kills 1.26 times (run 44948522187). So **`wageShare` opens at 0.80**, about one over 1.25, and every price above reads the wage through it.

When the playtest has at least 200 hunted hero-hours in a Level band, FB-3's reader compares the formula with played net gold from the ledger and re-fits `wageShare` so they agree within 10% (GR-51). Rows of hours follow at once. Set-once prices move only at the next release that re-runs the generator. JUDGMENT for 0.80 and the 200 hours.

### 4.4 The account prices, for scale

COMPUTED on chapter 12's measured account-days (R0, the mid four on Dangerous, before the fix and an upper bound). The real numbers come from the generator. These say only how far the typed ladder moves.

| Deed | Typed today (26-3) | Account-days at its Level | For scale |
|---|---|---|---|
| Farmstead | 25,000 | 1 at Level 20 | About 300,000 |
| Manor | 150,000 | 3 at Level 60 | About 1.7 million |
| Keep | 600,000 | 6 at Level 90 | About 5.6 million |
| Castle | 2,500,000 | 20 at Level 110 | About 20 million |

On these F is about 10, so the first Storage chest moves from 1,500 to about 15,000 and the last from 90,000 to about 900,000. The wage's Normal seat and `wageShare` both bring every number down from these. Tyler's typed deeds of 26-3 were already reversed by CE-5, which he let stand (reversal row 15), so this is no new veto.

**Live state.** Everything owned stays owned at the price paid (13 FB-9, L-06).

### 4.5 The Weighhouse

**Ruling.** The Weighhouse stays the town's first Works project, **as a building only**. The market trades from the first loot while it goes up. When it is finished, the square shows it and its plaque, and nothing else changes. Staged 1013 and 1014 stand as written.

| Why | |
|---|---|
| The market is named for it and its five stages and its plaque are drawn | `art/world/havora/havora_weighhouse_staked` to `finished`, and `_plaque` |
| A building the market works out of while the town finishes it is a story a player believes. A new first project would need a new idea, five new stages of art and a new row, for nothing the player gains | JUDGMENT |
| It gives a server of 7 a shared win in its first days | COMPUTED. Its goal is the larger of 250,000 and 20,000 for each weekly active account (24-7, 1014), so 250,000 at 7 accounts. 57,000 is already given (1013's note). Seven accounts at the 25,000 a day cap finish it in about two days |
| It opens nothing | It never gated a buff (RULED 2026-11-04: no formula reads a project's total). Under GR-55 it no longer opens the market either |

This keeps half of 24-7 (the first project is the Weighhouse) and GR-55's other half (the market opens on day one). GR-55's "the first project builds something else" is read as "opens nothing else". The project a month after it (24-10) needs its next row and art. That is not in the first build, and the Works says "Finished" with the plaque until it comes.

**What moves, and only words move.**

| Where | Today | After |
|---|---|---|
| `src/data/text/shop.js` `market_unbuilt_head`, `market_unbuilt_body`, `market_fund` | The market's closed state while the Works builds it | Removed. The market is never closed for the Works |
| The open market's one line while the Works raises it | None | "Weighhouse: {total} / {goal} gp given", the existing `market_fund_given`, with the existing "Go to Works" (`market_to_works`). Hidden once it is finished |
| `src/data/hunt-tutorial.js` step `weighhouse` | Title "The Weighhouse is open", fired when the market opens | Title "The Weighhouse", body "Buy and sell items with other players", fired on the first return (D-1 Path row 11's `first_stamina_end`) |
| `src/shell/windows/market/state.js` `buildingWorks` | Read to close the window | Read only to show the line above |
| The release note | | "The market is open from day one. The town is still raising the Weighhouse, and you can give toward it at Works." |

The market's Level door stays Security's to set (GR-55). Today it is `hr_market_config.min_level`, 10.

### 4.6 Walk-through against real data

| # | Step | Holds before it | Checked in | Doable |
|---|---|---|---|---|
| 1 | A Level 20 hero buys its first refill of the day | Gold, an empty bar | `stamina-refill.js` `maxMinPerBuy` 240, steps 1 over 2 (staged 1009) | Yes. `base` and `perLevel` become `baseHours` |
| 2 | A Level 31 hero buys Blessing 1 | Gold | `blessings.js` `BLESSING_TIERS` rows hold `base` and `perLevel` today | Yes. They become hours |
| 3 | The account buys the Farmstead at Level 22 | Gold and 10 Cooked Shrimp, 25 Copper Ore, 40 Oak Logs, 4 Wolf Pelts | `shops.js` `property.farmstead` | Yes. Only the gold moves |
| 4 | It buys the Workshop's first rung | Gold, 5 Iron Fittings, 200 Oak Planks, 10 Timber Beams | `shops.js` `room.workshop.1`, opened by the Farmstead (`homestead-tiers.js`) | Yes. Gold x F |
| 5 | A hero lists a Wolf Pelt on the market on day one | A pelt, Level past the door | `hr_market_config.min_level` (`2027-02-13-market-eligibility.sql`) | Yes, behind Security's door |
| 6 | The account gives 5,000 at Works | Gold | `town-works.js` gifts 1,000 and 5,000, 25,000 a day | Yes |
| 7 | The Weighhouse is finished | Gifts reach the goal | The last stage's line "is finished." after "The Weighhouse" | Yes |

### 4.7 Evidence

| Claim | Label |
|---|---|
| The typed deeds sit 7 to 12 times under CE-5's sizes | MEASURED, R0, before the fix, chapter 12 section 3.7 |
| Rename was sized at about 8 hours | Read from `src/data/hero-rename.js` |
| The tool over-reads coin and kills by about 1.25 | MEASURED, R0 and run 44948522187 |
| Base 2 hours, `wageShare` 0.80, F | JUDGMENT and COMPUTED. Every gold number is PROVISIONAL until the playtest re-fits the wage |
| The Weighhouse finishes in about two days on 7 accounts | COMPUTED from the 1013 and 1014 notes and the gift cap |

### 4.8 For the integrator

- **04 section 2.3, the price table.** The refill's base hours are 2. Blessings 1 to 3 are 0.4, 0.6 and 1.0 hours. Rungs past the third are a fifth of the hours they save. Rename is 8 hours, colors 1. The talent reset 3. Add the three kinds of section 4.1.
- **04 section 2.7 and 07 section 2.12, "The first project".** The Weighhouse stays the first project as a building only. Item 8 of chapter 07 section 5 closes.
- **04 section 2.10.** The deed sizes of CE-5 become rows of account-days at Levels 20, 60, 90 and 110. Rooms and chests move by one factor.
- **13 section 1.3, the staged table.** 1013 and 1014 stand. **13 FB-9.** It owns the hours rows, the deed generator, the factor, `wageShare` at 0.80, the Weighhouse's words and the tutorial step. Its tests add: the refill's six prices at Levels 20 and 200 in hours, a set-once deed equal to its generated row, and the market open with the Works unfinished.
- **13 section 3.3, the release note table.** "The market is open from day one" (FB-9).
- **`decisions/`.** GR-51, GR-58, CE-5 and GR-55 gain the sizes. Reversal row 15's text notes the deeds' rows.

---
