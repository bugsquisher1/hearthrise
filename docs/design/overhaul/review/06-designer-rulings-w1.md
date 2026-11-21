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
