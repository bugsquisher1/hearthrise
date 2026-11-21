# Balance program 48: the server's cost against 15 cents an account

Platform re-dive, 2026-11-21, on `lane/d-platform-cost` (cut from `set/v0.2.144`), reliability engineer. The question: Tyler ruled a server budget of 15 cents an account a month (rulings of record, 2026-11-21), which is band C2 of `tools/balance-program/standards.mjs`: **60 database-seconds an account-day at 1,000 accounts and 24 at 10,000**, for four heroes that each hunt 12 hours a day. Earlier estimates put today at 605 to 645 and the floor after every planned fix at about 147 (`59-review-features.md` section 0.2). This file measures where the seconds go, lists every change that cuts them, and answers whether the ladder reaches the band.

Labels: **REAL** is production, read-only (`node tools/balance-program/platform-cost.local.mjs`, 2026-11-21 07:00 to 08:00 UTC, SELECT inside `begin read only`, aggregates only; `pg_stat_statements` since 2026-10-31 13:42, 20.74 days, 40,015 database-seconds). **MEASURED** is this lane's replay runs (`node tools/balance-program/platform-cost.mjs profile | window | aged`, PGlite on the replayed chain with the shipped engine). **ESTIMATED** is arithmetic on both, with its method beside it. **CITED** is another file. Production database-seconds are the unit everywhere unless a row says PGlite ms.

---

## One screen for Tyler

**Short answer.** Yes for an idle account. An account whose four heroes hunt 12 hours and work in town 12 hours a day with the browser closed reaches about 10 database-seconds a day after the ladder, well under 60 at 1,000 accounts and under 24 at 10,000. An account that also keeps a hunt on screen for an hour and a half a day reaches about 31, which meets 60 at 1,000 but not 24 at 10,000. Keeping a hunt on screen five hours a day does not fit 60 with anything on the ladder.

**What today costs.** About 330 database-seconds a day for the idle account and about 495 for the one that watches an hour and a half. That is five to eight times the budget. Four things make it up.

1. **Town work is the largest line.** Every town settle reads the whole hero again just to learn what it is doing, 46 times a town hour. That is 4.2 seconds a hero-hour, so 12 hours of town work is 200 seconds a day on its own. The features review counted 0.7 seconds a hero-hour here, so its floor of 147 was low on town and high on the hunt.
2. **A slow read shipped with the last server-cost change.** The "one read a settle" change folded the perk reads into the settle's read, but the way it was written makes the database run the hero read three times or more. The read went from 19 ms to 183 ms on production. One word in the edge's SQL (`materialized`) fixes it. I measured the fix on the replay: the read is three times faster and nothing else moves. This is the first thing to ship.
3. **A watched hunt costs 113 seconds an hour for a four.** Every 18 seconds the database writes the whole party and rebuilds the hero for the screen and for each open seat. Confirming in the edge and committing at the flush (L12) and sending only what changed (L24) take that to about 14.
4. **A hunt with the browser closed costs 10 seconds an hour for a four today,** and most of that is the slow read above. The engine gives exactly the same result whether a closed hunt is saved every 100 seconds or every 20 minutes. I checked that on four fixtures, from a lone Level 10 hero to the Krell Deadly four. So a closed hunt can be saved every 10 minutes and its cost falls by about five.

**The order.** Fix the read, land the staged server-cost lane, give the town tick a small read, then commit at the flush, the hourly journal, the plan fixes, town work in closed form and the 10-minute save for closed hunts. Town work in closed form is the one rung the budget cannot be met without.

**What it costs the game.** Nothing a player can see, with two cautions. A hero whose hunt ends with the browser closed is filed back in town up to 10 minutes after the moment it ended, so its next planned hunt must start from that moment and not from the save, or it idles. And the Krell four's engine is too heavy to simulate 10 minutes inside the edge's 2 second limit, so heavy parties save every 4 to 5 minutes instead.

**What would take it further.** Only one thing reaches 24 at 10,000 for an account that watches: the watched hunt's confirm must stop reading the database. That needs the engine to keep a viewed instance in memory between confirms, which means a small always-on engine server outside Supabase's edge. It is a spend, so it is your call, and it is not needed for the beta. The other way is to confirm every 32 seconds instead of 16, which you ruled out on 11-10.

**What you decide.** Nothing to buy now. Two calls when the ladder is built: whether the 10,000-account target must hold for players who keep a hunt on screen (then the engine server is needed), and whether town work in closed form is approved (59 row 30).

---

## 1. Where the database-seconds go today (measured)

### 1.1 By statement (REAL, 20.74 days, 40,015 s)

| Statement | Calls | Mean ms | Seconds | Share | What it is |
|---|---|---|---|---|---|
| `hr_hunt_apply_instance` | 31,276 | 203 | 6,353 | 15.9% | every hunt commit; frames and the projection for a viewer are inside it |
| `hr_tick_cron_run` | 178,858 | 27.0 | 4,826 | 12.1% | the tick driver, every 10 s, whoever plays |
| `hr_tick_settle` | 184,652 | 18.6 | 3,439 | 8.6% | town work: 2.45 calls a town settle |
| `hr_state_of` | 69,916 | 48.0 | 3,353 | 8.4% | 63,654 of them are the town tick reading the whole hero to learn its activity |
| town tab (`hr_town_view`, `_here`, `_move`) | 539,897 | 1.6 to 7.5 | 2,717 | 6.8% | a tab standing in town |
| `hr_ops.alert_run` | 25,616 | 91.9 | 2,353 | 5.9% | the Discord alarm, every minute |
| our dashboards (read-only user) | | | about 3,000 | 7.5% | scans of the journal (CITED 28) |
| `hr_load` | 15,635 | 111 | 1,739 | 4.3% | loads, and the 60 s off-screen poll (gone in L01) |
| `hr_tick_enrol`, leaderboards, party sweep, the rest of cron | | | about 4,500 | 11% | whoever plays (CITED 28 section 4) |
| the settle read | 39,925 + 1,299 | 19.1 old, **183.4 new** | 1,066 + 238 | 3.3% | every hunt settle; the new form is section 2.1 |
| `hr_apply` | 16,240 | 59.6 | 968 | 2.4% | presses |
| `hr_accrue_read` | 46,831 | 19.6 | 919 | 2.3% | the watched hello |
| `hr_market_mine` | 7,627 | 81.0 | 618 | 1.5% | every load |
| `hr_access_check` | 704,637 | 0.84 | 592 | 1.5% | every REST call while the game is closed |
| `hr_social_poll` | 96,493 | 5.3 | 509 | 1.3% | the online stamp |
| `hr_perks_of` | 176,896 | 1.83 | 324 | 0.8% | every settle member |

By what was played in the same 20.74 days (REAL: 31,192 hunt commits over 990 hunted hero-hours, 75,395 town settles over 1,626 town hero-hours): hunting cost about 8,800 s (8.9 a hunted hero-hour, watched and closed mixed), town work about 6,500 s (4.0 a town hero-hour), open tabs about 6,300 s, presses about 1,000, and cron and our dashboards about 15,000 that no player asked for.

### 1.2 By unit of play (the 12-hour frame's building blocks)

| Unit | Production cost | Label and method |
|---|---|---|
| a closed hunt commit, four (no client open, so no frame and no projection) | **278 ms** (read 183 + apply 95) | REAL: one four hunting, 0 heroes open in a client, `pg_stat_statements` delta (section 2.3) |
| the same, lone | 104 ms | ESTIMATED: the replay's lone/four ratios on read and apply |
| a closed four-hour (36 commits) | **10.0 s**, 2.5 a hero-hour | REAL x REAL: 36.0 commits a hero-hour away at every party size (14 days, 3,102 four commits) |
| a closed lone hero-hour | 3.7 s | ESTIMATED |
| a watched four-hour (201 commits, the tab's reads, frames) | **113 s** (107 to 119) | REAL: the capacity sample's database ms a minute, 305 minutes with a four watched against 99 empty minutes (section 2.4) |
| a tab open on the strip, the four hunting off screen | about 2 s a four-hour above closed | REAL: the four's away commit with its tab open is +206 to +242 ms over an empty minute, against 278 with none (frames: 4 heroes) |
| a town hero-hour | **4.15 s** | REAL: 46 settles x 90 ms (2.45 `hr_tick_settle` x 18.6 + 0.84 whole-hero reads x 48 + perks and seed) |
| a town tab-hour | 4.7 s | CITED 28 (REAL means x MEASURED calls) |
| a press | 107 ms | REAL: `hr_apply` 59.6 + the state its answer carries 48 |
| cron, whoever plays | 1,010 s a day | CITED 28, REAL |

**Watched against closed, lone against four.** A four costs 0.25 of a lone hero's closed commit a head after the read fix (MEASURED: 22.7 against 36.7 PGlite ms a hero-settle). A watched four-hour costs eleven closed four-hours today. 77% of production's hunted hours are fours and 39% of hunted hero-hours were watched over the last 14 days (REAL: 302 of 773).

### 1.3 The account-day today

Four heroes as a party, 12 hunted hours and 12 hours of town work each, 100 presses, at 1,000 accounts. `node tools/balance-program/platform-cost.mjs ladder`.

| Day shape | Closed hunt | Watched | Town work | Town tab | Presses | Cron | **Total** | Against 60 |
|---|---|---|---|---|---|---|---|---|
| Browser closed all day | 120 | 0 | 199 | 0 | 11 | 1 | **331** | x5.5 |
| Real-shaped tab: 1.5 h watched, 2 h in town | 105 | 170 | 199 | 9 | 11 | 1 | **495** | x8.2 |
| Stress: 39% of 12 h watched (4.7 h) | 73 | 531 | 199 | 9 | 11 | 1 | **824** | x13.7 |

The real-shaped tab is REAL-shaped: real accounts watched 39% of 3.3 hunted hours a day, about 1.3 hours, and were online 1.6 to 4 hours (CITED 28). Tab hours do not grow with hunted hours in an idle game, so the 12-hour ruling moves the closed line and the town line, not the watched one. The stress row is the earlier dives' arithmetic (the watched share of real hours applied to 12 hours) and is kept as the upper bound.

**Two corrections to 59's account-day.** It priced every hunted hour at production's mean hero-settle (70 ms, which carries frames and projections that only an open tab causes) and every town hour at 19 ms a settle (`hr_tick_settle` alone, without the whole-hero read the town visit makes first). The first overstates a closed hunt by about two and a half once the read is fixed, the second understates town work by about six. Its floor of 147 was the wrong shape: the hunt was smaller and the town larger.

---

## 2. What is inside a settle

### 2.1 The settle read runs the hero read three times (a regression, live)

`HUNT_READ_SQL` (`supabase/functions/hr-accrue/hunt-settle.js:265`) folds each member's perks into the read (11-19 audit row 10, "one read a settle"). Its CTE `r` is inlined and `r.inst` is referenced three times, so PostgreSQL substitutes the stable call `hr_hunt_instance_read(...)` into each reference:

```sql
r as (select g.allowed, case when g.allowed then public.hr_hunt_instance_read($1::uuid, $2::int) end as inst from g)
```

- REAL: the new statement is 183.4 ms a call (1,299 calls, min 164.4, 10,313 buffer hits); the statement it replaced was 19.1 ms (38,631 calls, 825 hits).
- MEASURED: on the replay `hr_hunt_instance_read` runs 3 times a settle (4.8 on the watched door), `hr_hunt_member_read` 72 times for four members. With `r as materialized (...)` (`platform-cost.mjs profile --read-materialized`, a measurement only) the four's read falls 103.5 to 32.4 PGlite ms, the lone hero's 35.9 to 12.1, and the instance read runs once. The whole closed settle falls 44% on the replay.
- The fix is one word. It changes no result: the same stable function, read once in the same snapshot. Proof for its lane: the settle parity arms of `tests/hunt-sessions-settle.mjs` and `tests/per-player-cost.mjs` (statements a settle unchanged at 4).

### 2.2 The replay profile (MEASURED, PGlite ms, read as shares)

`node tools/balance-program/platform-cost.mjs profile` (with `track_functions = all`, self time by function):

| Fixture (door) | ms a settle | the read | the apply | journal rows a settle | row writes |
|---|---|---|---|---|---|
| lone Level 10, closed | 65.9 (36.7 read fixed) | 55% | 44% | 1.5 | 29 |
| party of four accounts, Level 20, closed | 168 (85 fixed) | 64% | 35% | 5.3 | 98 |
| Krell Deadly four, closed | 190 (91 fixed) | 65% | 34% | 9.1 | 129 |
| Krell Deadly four, watched (16 s, 0.6 early asks) | 305 (143 fixed) | 63% | 35% | 9.3 | 93 |
| supply-heavy four, closed | 181 | 64% | 36% | 9.1 | 117 |
| Tower climb, closed | 181 | 67% | 33% | 12.4 | 99 |
| town hour (bench) | 72.5 (53 fixed) | `hr_tick_settle` 50%, the whole-hero read 46% | | 1 | 12 |

The replay has no open client, so it builds no frame. What it shows inside the settle (Krell four, closed, read fixed): `hr_apply` 17% of function time, `hr_hunt_apply_member` 10%, `hr_hunt_member_read` 8% (24 calls for 4 members), `hr_hunt_setup_live` 7% (176 calls, one a ground density row), `hr_hunt_limit` called hundreds of times a settle, and 15,710 rows of `hr_skill_curve` read a settle.

### 2.3 Index and plan findings (REAL `pg_stat_user_indexes`, `pg_stat_user_tables`)

| Where | Reads | Cause | Fix (rung P1 unless named) |
|---|---|---|---|
| `player_ledger_user_idx` | 1.87 million scans, 4.05 billion index tuples, 2,171 a scan | sums over a hero's whole day of journal rows (`hr_day_budget_used`, the hearthfind count in `hr_state_of`) and the alarm's look-back (`hr_tick_stall_status`). A hero has 1,458 rows today at its average closed commit, 2,317 at a watched one (REAL, 7 days) | L13 makes the day 12 rows. Before it, a running day row per hero. MEASURED: on the replay a commit's cost moves only +4 ms from 0 to 4,500 rows today, so this is CPU in the alarm and the dashboards more than in the settle |
| `hr_skill_curve_pkey` | 8.1 million scans, 3.03 billion tuples, 374 a scan | `max(level) where xp <= x` walks the level key down from the top | an index on `xp`, or the level from the curve by binary search, the way `hr_xp_table` already has `hr_xp_table_xp_idx` |
| `hr_xp_table_pkey` | 14.1 million scans, 0.85 billion tuples | the same shape on the Level table | read through `hr_xp_table_xp_idx` |
| `player_progress_pkey` | 15.9 million scans, 79 rows a scan | a hero's progress rows read whole to find one key | read by the full key |
| `hr_hunt_limits` | 19.4 million whole-table scans, no index scan | `hr_hunt_limit(key)` called hundreds of times a settle | read the limits once a settle into a record |

The ten largest of these together are a few percent of database time, not tens. P1 is worth about a fifth of a closed commit after the read fix, not more (ESTIMATED from the replay's shares).

### 2.4 How the closed and watched costs were read (REAL)

- **Closed.** At 07:32 UTC one four was hunting and no hero was open in a client (`character_presence` within 75 s: 0). A `pg_stat_statements` delta over its next settles gave the closed four's commit: the read 175 to 183 ms and the apply about 95 ms with no frame and no projection. DELTA: section 9 has the full window.
- **Watched.** `hr_ops.capacity_samples` holds the database ms of every minute for the last 27 hours. Bucketed by what committed in each minute (journal rows of one commit share one `at`, the window's ms says watched or away): 99 empty minutes 955 ms, a four's away commit +206 to +242, a minute with 3 or 4 watched commits +1,808 to +2,128. So a watched four-hour is 107 to 119 s. The model in `platform-cost.json` explains 110 of the 113 with production's per-call means.
- **Frames.** A commit builds a frame for every member open in a client (`hr_frame_wanted`) and the asker's projection (`p_project_user`). With nobody open it builds neither. That is why a closed commit is cheap and an open tab is not.

---

## 3. A closed hunt saved less often: the parity proof and its limit

`node tools/balance-program/platform-cost.mjs window`: one fixture built once, then the same 20 simulated minutes committed at each cadence from the same savepoint (the same instance, secret, seeds and clock, as `tests/hunt-sessions-settle.mjs` TICK-1 does). The heroes' end state (character, skills, bag, wallet, stats, session, instance world) and the journal's sums are compared with the 100 s run.

| Fixture | Commit every | Commits | PGlite ms a commit | Commit ms a hero-hour | Journal rows a hero-hour | End state | Journal sums |
|---|---|---|---|---|---|---|---|
| lone Level 10 | 100 s | 12 | 20.0 | 721 | 57 | reference | reference |
| | 120 s / 300 s / 600 s / 1,200 s | 10 / 4 / 2 / 1 | 14 to 16 | 431 / 187 / 95 / n/a | 51 / 24 / 12 / 6 | IDENTICAL | IDENTICAL |
| party of four, Level 20 | 100 s / 300 s / 600 s / 1,200 s | 12 / 4 / 2 / 1 | 54.6 / 53.8 / 47.1 / n/a | 491 / 161 / 70 / n/a | 47 / 20 / 12 / 6 | IDENTICAL | IDENTICAL |
| supply-heavy four | the same | | 48 to 80 | 435 / 239 / 82 | 85 / 29 / 14 / 8 | IDENTICAL | IDENTICAL |
| Krell Deadly four | 100 s / 300 s / 600 s / 1,200 s | 12 / 4 / 2 / 1 | 48.6 / 54.0 / 62.2 / n/a | 437 / 162 / 93 / n/a | 83 / 28 / 14 / 8 | IDENTICAL | IDENTICAL |
| Krell four, read fixed | 100 s / 600 s | 12 / 2 | 53.4 / 58.3 | 480 / 87 | 82 / 14 | IDENTICAL | IDENTICAL |

So the engine is cut-invariant at long windows, not only at the 2-minute slices TICK-1 tests (`HUNT_SETTLE_SPAN_MS`). A commit costs about the same whatever window it carries (x1.09 at 600 s for the Krell four), so database time and journal rows both fall with the number of commits. **The cadence alone does for closed hunts most of what L13 does for the journal: 83 rows a hero-hour become 14.**

The limit is the edge, not the database. A settle simulates its window inside one request, and Supabase's edge allows 2 s of CPU a request (`EDGE_CPU_MS`). The engine costs 0.3 to 1.4 ms a simulated second lightly loaded and 6.2 at the four-hero p95 (CITED `hunt-settle.js:209`). Ten minutes is 0.2 to 0.8 s for a light instance and 3.7 s for a heavy four. So C10 is "commit when the window holds 10 minutes, or when it holds as much as 1.2 s of measured engine time, whichever is less". The tick already has the dial for the database half: a closed hunt is due every `flush_seconds x fold_windows` (the roster's due predicate, `2027-02-04-tick-span.sql:150`, `fold_windows` is 1 today and may be 1 to 8). The edge half is `HUNT_SETTLE_SPAN_MS` sized a instance by its last engine time, the same packing rule 28 section 2 already asks for.

---

## 4. The ladder (the cost table the plan re-issue cites)

Cumulative, in the order below. Database-seconds an account-day, four heroes as a party, 12 hunted and 12 town hours a hero. Columns: browser closed all day / the real-shaped tab (1.5 h watched, 2 h in town) / the stress tab (4.7 h watched). Band C2: 60 at 1,000, 24 at 10,000 (the cron share is 1 s at 1,000 and 0.1 at 10,000).

| # | Rung | Roadmap | Layer | Saves on the real-shaped day (how) | After: closed / real / stress (1,000) | §1 and §6 risk | Release |
|---|---|---|---|---|---|---|---|
| 0 | today | | | | 331 / 495 / 824 | | |
| R0 | the settle read reads the hero once: `r as materialized` | new, a fix of L01's shipped read | edge SQL, one word | 101 (read 183 to 35 ms, every settle: REAL old 19.1 + perks 7, MEASURED x0.31) | 267 / 394 / 645 | none: the same stable call once in one snapshot | **0.2.144, first** |
| L01 | the server-cost lane: no off-screen poll, packing, the 5-minute prune | L01, 28 change 1 | edge + server, staged | 29 (19.6 s a watched four-hour, REAL `hr_load` x the client's cadence) | 267 / 365 / 553 | its own lane's | 0.2.144 (built) |
| T1 | the town tick reads the hero's engine inputs, not the whole hero | new, 28's town card | edge + one read function | 90 (40.7 of a town settle's 90 ms, REAL. MEASURED 45%) | 177 / 275 / 464 | low: S-8's rule holds if the narrow read returns `active_kind` and `version` from the same row the whole read did | 0.2.144 |
| L12 | confirm in the edge, commit at the flush | L12, 28-1 | edge + server | 50 (201 watched commits an hour to 36, each 203 ms of apply: REAL) | 177 / 225 / 306 | high, and written in 30-plan L12: nothing a purchase, a gate or another player reads may come from uncommitted state, and an isolate kill must re-settle the same frames | 0.2.144, before 250 accounts |
| L24 | delta envelopes | L24, 28 change 4 | server + client | 22 (every whole-hero read a watched hour and a press, x0.25 ASSUMED by 28) | 174 / 203 / 245 | medium: a section not sent is a section unchanged at the version the client holds, never a merge (§6) | later |
| L25 | one heartbeat, town alone sends nothing | L25, 28-7 | server + client | 9 | 174 / 193 / 235 | low | 0.2.144 or the first wave after |
| L07 | Carry on and the plans: 20 presses a day | L07, L21 | content + client | 6 | 168 / 188 / 230 | none | built (1024) |
| L13 | the hourly journal | L13, 28-2, 43 E18 | server | 4 (5 to 10% of a commit, MEASURED share) | 164 / 184 / 226 | medium: every day cap and audit sum must read the same on a replayed day, and every value movement stays journalled as an hourly sum (§1) | 0.2.144, before 250 accounts |
| P1 | plan fixes: no function a row in the read, the curves by XP, limits once | new, section 2.3 | server plans | 13 (read x0.6, apply core x0.9, ESTIMATED) | 154 / 170 / 205 | low: plans only, no result moves; the settle parity arms and `schema-drift` prove it | 0.2.144 |
| TCF | town work paid in closed form | 59 row 30 (formula; P05, P-X28, 43 E18) | formula + server | 109 (12 h x 4 heroes of town settles become 2 jobs a hero a day) | **45** / 61 / 96 | medium: a money and XP path. Wages in closed form must equal the settle's on a replayed day. Security review at Early Access | 0.2.144 if ruled, else the first wave after |
| C10 | a closed hunt commits every 10 minutes, or at 1.2 s of engine time | new, section 3 | dial (`fold_windows`) + edge slice | 30 (36 closed commits an hour to 6, x1.1 a commit: MEASURED) | **10.5 / 31 / 75** | medium, section 5 | after L12 (both rewrite the settle path, and the L12-before-L15 rule applies) |

The same ladder at 10,000 accounts: browser closed **9.6** (meets 24), real-shaped tab **30.1** (over 24 by 1.3). Four lone heroes instead of a party: the closed hunt line is 180 s today and 12 after the ladder, against the party's 120 and 7.6 (per-account packing of an account's lone instances into one commit would take about a third more off that line: MEASURED fixed cost of a commit, lone 36.7 against 22.7 a head for a four).

What each rung does NOT need: no rung changes a number a player earns, and no rung moves the 16 s confirm (RULED 11-10). Not on the ladder because something above it already takes the saving: the frame dial `frame_own_s` (built, 0 today: holds frames to an account's own off-screen heroes, about 7 s a watched four-hour until L12 lands, nothing after it) and the fold of `hr_market_mine` into the heartbeat (L25).

---

## 5. Risks against §1 and §6, rung by rung

- **R0.** None. A materialized CTE is evaluated once. It is an edge change, so it ships through an edge deploy with the next release (the edge hash moves).
- **T1.** The town tick reads `hr_state_of` because `hr_engine` holds no grant on `player_state` and S-8 needs the channel before the probe (`tick.js:848`). A narrow SECURITY DEFINER read that returns the engine inputs, `active_kind`, `active_id` and `version` from the same row keeps S-8 and the version CAS. It is the town's twin of `hr_hunt_member_state`.
- **L12.** Its failure case is written in 30-plan. The highest risk on the ladder: it is the only rung where the browser is shown state the database has not committed.
- **L13.** The journal stays the only complete record (§6) as hourly sums. Every day cap that reads it (`hr_day_budget_used`, the market caps, the GM caps) must read the same before and after on a replayed day.
- **TCF.** A value path (wages, XP). It needs the Security review at Early Access and a replayed-day equality with today's settles.
- **C10.**
  1. Nothing a player earns changes: MEASURED identical end states at 100 s to 1,200 s on four fixtures.
  2. A hunt that ends with the browser closed (a death, stamina, supplies, gold) is simulated to its true end but committed up to 10 minutes later. The hero is filed back in town then, and `hr_hunt_after_sweep` must start the next planned hunt from the simulated end instant, or the hero idles up to 10 minutes a hunt end. That is a server rule the C10 lane must build and test with the browser closed (CLAUDE.md §4 both paths).
  3. A player who opens the game mid-window sees the committed state, then the first hello settles the window to now (the settle-first rule): the browser never shows a value the server has not committed.
  4. Never restore or evict on uncertainty: a failed long slice leaves the instance owed on its unmoved `settled_to`, as today.
  5. A window that crosses UTC midnight files up to 10 minutes of day-capped value under the day it lands in (today up to 100 s). BOTH-PATH-MIDNIGHT proves deaths file under their own day. The C10 lane extends that arm to the day budget.
  6. A heavy instance needs more engine time than the edge's 2 s for 10 minutes, so the cadence is per instance by measured engine time. Any balance change that adds monsters to a pull (R19, L15, L17) lowers the window a heavy four can carry and so raises its database cost. Each engine batch states its engine ms a simulated second at Krell (G17).

---

## 6. The answer against 60 and 24

| Day shape | 1,000 accounts (60) | 10,000 accounts (24) |
|---|---|---|
| Browser closed all day | **meets at TCF (45)**, 10.5 after C10 | **meets at C10 (9.6)** |
| Real-shaped tab, 1.5 h watched | **meets at C10 (31)** | **over: 30.1, x1.3** |
| Stress tab, 4.7 h watched | **over: 75, x1.2** | over: about 75, x3.1 |

**In order:** R0, L01, T1, then L12 and L13 before the beta passes 250 accounts (30-plan's gate), P1 with them, TCF as soon as it is ruled, C10 after L12 has baked a nightly. Without TCF no day shape meets 60: town work alone is 110 s a day after T1.

**The lowest honest number** for an account that watches 1.5 hours a day is about 30 database-seconds a day. What is left after the ladder (real-shaped day): the watched hours 21.5 (polls 7.8 s and commits 3.7 s a watched four-hour, 2.8 unattributed), the closed hunt 6.6, presses 1.4, town 0.5.

**To go further, and what each costs the game:**

1. **A stateful engine host for viewed instances** (the Huntera model: the server holds the world). The 16 s confirm is answered from memory, the database sees only the flush. A watched four-hour falls to about 6.5 s, the real-shaped day to about 18 at 10,000 and the stress day to about 38 at 1,000. Cost to the game: none visible. Cost to us: an always-on server outside Supabase's edge (a spend, Tyler's call), a second deploy surface, and L12's failure case on a long-lived process. It also lifts the 2 s edge limit, so C10 could become an hourly commit.
2. **Confirm every 32 s instead of 16.** Halves the polls: the real-shaped day at 10,000 reaches about 24.2, the stress day at 1,000 about 56. Cost to the game: the fight on screen is confirmed half as often, so a live-view correction can be twice as large. RULED out on 11-10 ("keep the 16 s confirm").
3. **Neither is needed for the beta**, and neither loosens C2. Under both, the band holds for every day shape that does not watch for hours.

---

## 7. What to measure next, and the checks this adds

1. **The closed four's commit on production** (section 2.4) rests on a short delta with one party hunting. After R0 ships, the capacity sample's empty-tab minutes give it again, and `hr_hunt_apply_instance`'s mean should fall to about 120 ms for closed commits.
2. **The 2.8 s unattributed in a watched four-hour** is small after R0's correction of the read. A controlled read (the QA four watched for 30 minutes, nothing else on the server, two `pg_stat_statements` reads) attributes it.
3. **Town closed form** needs a town-hour fixture that plays two jobs a hero a day (59 asks it too). The bench fixture already exists in `tests/per-player-cost.mjs`.
4. **Observability added by this lane:** `platform-cost.local.mjs minutes` is the per-minute bucket read (a REAL cost of a watched minute and an away commit, from the capacity sample) and can be re-run after every server release; `platform-cost.mjs window` is the parity and cadence proof for C10's lane; `platform-cost.mjs profile --read-materialized` is R0's before and after.
5. **Alarm:** a settle read over 40 ms mean on production is a regression (it was 19.1 before 11-20 and is 183 now). The capacity sample should carry the settle read's mean beside `db_pct`. That is a one-line addition to `hr_ops.capacity_sample()` for the lane that ships R0.

---

## 8. Verified, measured, estimated, assumed

- **REAL:** every per-call mean and count in 1.1, the commit shape and cadences (36 away, 181 to 201 watched), the rows a hero has today at a commit, the watched-minute and away-commit costs from the capacity sample, the 183 ms read, the closed four's commit from the delta, the town settle's composition.
- **MEASURED (replay):** the read's triple evaluation and its fix, every profile share, the cadence parity (identical end states and journal sums at 100 to 1,200 s on four fixtures), commit cost against window length, commit cost against the day's journal.
- **ESTIMATED:** the lone hero's closed commit (replay ratios x the REAL four), R0's production read after the fix (35 ms: between the old statement plus perks, 26, and the replay's ratio, 57), P1's share, L13's share.
- **ASSUMED and CITED:** L24's x4 (28), TCF's 0.5 s a day and L07's 20 presses (59), the town tab-hour (28), the engine ms a simulated second (`hunt-settle.js`), the tab shapes (real accounts' 1.3 to 1.6 hours watched, CITED 28 and 10).

## 9. Tools

- `tools/balance-program/platform-cost.local.mjs` reads production, SELECT only in a read-only transaction, aggregates only (statements, indexes, whole-table scans, commits by size and door, rows before a commit, minute buckets, frames, the tick's dials).
- `tools/balance-program/platform-cost.mjs` is the replay instrument (`profile`, `aged`, `window`, `--read-materialized`) and the ladder (`ladder`, `--selftest`). The ladder's inputs and their sources are `tools/balance-program/platform-cost.json`.
