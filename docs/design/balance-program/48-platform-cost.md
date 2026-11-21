# Balance program 48: the server cost design of the target game

Platform dive, 2026-11-21, `lane/d-platform-cost` (cut from `set/v0.2.144`), reliability engineer.

**The target.** Every account has four heroes from its first evening, with one Premium an account. Each hero hunts 12 hours a day and works in town the other 12. The game has an MMO layer: clans, world bosses, events. **The budget** is Tyler's 15 cents an account a month, band C2 of `tools/balance-program/standards.mjs`: **60 database-seconds an account-day at 1,000 accounts and 24 at 10,000.** The band is not loosened anywhere in this file.

**The method.** Each mechanism the target needs (a settle's read, its commit, a frame, a confirm, a town settle, a press, a journal row) was measured on production and on the replayed chain. Those costs are the inputs. Each architecture choice is priced by what the target account-day costs with it and without it. The account-day is built bottom-up from the chosen design.

Labels: **REAL** is production, read-only (`node tools/balance-program/platform-cost.local.mjs`, 2026-11-21 07:00 to 08:00 UTC, SELECT inside `begin read only`, aggregates only, `pg_stat_statements` over 20.74 days). **MEASURED** is the replayed chain with the shipped engine (`node tools/balance-program/platform-cost.mjs profile | window | aged`, PGlite). **ESTIMATED** is arithmetic on both, its method beside it. **ASSUMED** and **CITED** as named. Database-seconds are production's unless a row says PGlite ms.

---

## One screen for Tyler

**The answer.** The recommended design costs about 11 database-seconds an account-day when nobody watches a hunt, and about 31 when an account watches one for an hour and a half a day. Both meet 60 at 1,000 accounts. At 10,000 accounts (24) the idle account meets and the watching account misses by about a third. Running the engine on an always-on server of our own, instead of Supabase's edge, meets every case, from 4 to 22 a day.

**The choices that decide it, by what each is worth in the target design:**

1. **Town work paid in closed form** (start, each paid hour, stop) is worth 109 seconds a day. Paid on the tick, every town settle reads the whole hero again, 46 times a town hour. No design meets 60 without this choice.
2. **A closed hunt saved every 10 minutes** is worth 32 to 36 seconds a day. The engine gives exactly the same result whether a hunt is saved every 100 seconds or every 20 minutes. I proved that on four fixtures, from a lone Level 10 hero to the Krell Deadly four.
3. **An open tab that sends only its confirm and its heartbeat** is worth 50 seconds a day to an account that watches. About a third of a watched hour's cost is tab traffic that the hunt does not need. One controlled read names it.
4. **The settle read reading the party once** is worth 7 to 49 seconds a day. The statement live now reads it three times or more. One word (`materialized`) fixes it, and it should ship first.
5. **Confirming in the edge and saving at the flush** is worth 26 seconds a day to a watching account, **changed sections only** another 19, **no off-screen poll** 29, **one heartbeat** 9, **few presses** 6, **plan fixes** 2 to 9, **the hourly journal** about 1 (its real worth is disk: one journal row a hero an hour).

**Four heroes from the first evening.** With the browser closed an account's cost is per hero, so four heroes cost four times one. With a tab open the fourth hero adds much less than the first. A party of its own four is the cheapest idle shape. In the target a one-hero account is 5 to 16 seconds a day and a four-hero account 11 to 31.

**The MMO layer.** A world boss must be one shared fight that sends one broadcast per save to everyone watching, cut into rooms. Then a 100-hero fight costs each account about 3 seconds, or 0.2 on our own engine server. If each viewer reads the whole fight every 16 seconds, as a hunt does, the cost grows with the square of the crowd and one 100-hero fight costs each account more than its whole day.

**My recommendation.** Build the edge design now, in this order: read once, no off-screen poll, confirm at the flush, the hourly journal, plan fixes, town work in closed form, the tab's missing third, the 10-minute save. It fits the beta and 1,000 accounts. Before 10,000 accounts, decide the engine server. It is the only way an account that watches fits 24, and it is also what makes world bosses cheap.

**What you decide.** Town work in closed form (59 row 30). Later, the engine server, which is a spend. Nothing to buy now.

---

## 1. The target account-day

Four heroes as one party unless a row says otherwise, 12 hunted hours and 12 hours of town work a hero, 20 presses a day. `node tools/balance-program/platform-cost.mjs design`.

| Day shape | The recommended design (engine on the edge) | The same design on a stateful engine host | C2 |
|---|---|---|---|
| Browser closed all day, 1,000 accounts | **10.9** meets | 4.4 meets | 60 |
| A tab open 3.5 h: a hunt watched 1.5 h, 2 h in town, 1,000 accounts | **31.2** meets | 10.0 meets | 60 |
| A hunt watched 4.7 h (39% of 12 h), 1,000 accounts | **74.5** over x1.2 | 21.9 meets | 60 |
| Browser closed all day, 10,000 accounts | **10.0** meets | 3.5 meets | 24 |
| A tab open 3.5 h, 10,000 accounts | **30.3** over x1.3 | 9.1 meets | 24 |

The tab shapes come from real accounts: they watched 39% of 3.3 hunted hours a day, about 1.3 hours, and were online 1.6 to 4 hours (REAL, CITED 28). Tab hours do not grow with hunted hours in an idle game, so the 3.5-hour tab is the reference and the 4.7-hour one is the upper bound.

The recommended design's account-day, by line (the 3.5-hour tab, 1,000 accounts): closed hunting 6.9, watched hunting 21.3 (a watched four-hour of 14.2: the confirms' reads 10.3, 36 saves 3.8), town work 0.5, presses 1.4, the cron share 1.0.

---

## 2. Mechanism costs: the measured inputs

| Mechanism | Cost | Label and how |
|---|---|---|
| a hunt save (commit) of a four, no client open: the read and the apply | read 35 ms read once (185 as the live statement reads it), apply 100 ms | REAL: one four hunting, no hero open in a client for 9 of 10 minutes, a `pg_stat_statements` delta over 607 s and 6 saves (read 187.2, apply 112.2 a call). Read once: REAL 19.1 for the statement before perks were folded in, plus perks 7, against MEASURED x0.31 on the replay |
| the same, a lone hero | read 12 ms, apply 49 ms | ESTIMATED: the replay's lone/four ratios on each part |
| a frame, a member open in a client | 18 ms (the member's projection) | REAL: production's 203 ms watched apply less the core and the asker's projection, over three frames |
| the asker's projection on a watched save | 48 ms | REAL `hr_state_of` mean |
| a confirm of a watched hunt (every 16 s, 201 an hour for a four, 181 lone) | the settle read 1.6 times (the landed confirm and 0.6 early asks), the hello's six reads 33.6 ms, the early asks' state 28.8 ms, seeds 2.2 ms | REAL means x REAL commit counts (14 days) |
| tab traffic beyond the confirm | 33.5 s a watched four-hour | REAL minus the model: a watched four-hour was 107 to 119 s (the capacity sample, 305 minutes, against 99 empty minutes), 79.5 explained. UNATTRIBUTED |
| a town settle on the tick | 90 ms (46 a town hero-hour: 4.15 s) | REAL: 2.45 `hr_tick_settle` x 18.6 ms + a whole-hero read 0.84 x 48 ms + perks and seeds |
| a press | 107 ms, 71 with changed sections only | REAL `hr_apply` 59.6 + the state its answer carries 48 |
| a town tab-hour, polling | 4.7 s | CITED 28 |
| the cron, whoever plays | 1,010 s a day | CITED 28, REAL |
| a save's cost against its window | flat: x1.09 at 600 s against 100 s (Krell four) | MEASURED, section 7 |
| a save's cost against the day's journal | +4 ms from 0 to 4,500 rows today a hero | MEASURED, `platform-cost.mjs aged` |
| a hero in a four against a lone hero | 0.62 of a lone hero's save | MEASURED: 22.7 against 36.7 PGlite ms a hero |
| the engine | 0.3 to 1.4 ms a simulated second lightly loaded, 6.2 at the four-hero p95, inside a 2 s CPU limit a request on the edge | CITED `hunt-settle.js` |
| journal rows | 83 a hero-hour for a Krell four saved every 100 s, 14 every 600 s | MEASURED, section 7 |

---

## 3. The choices, what each costs, the recommendation

"Worth" is what the target account-day costs more if that one choice is not taken and every other is (browser closed / the 3.5-hour tab, 1,000 accounts). `node tools/balance-program/platform-cost.mjs design`.

| Choice | Options | Worth | §1 and §6 risk | Layer, roadmap | Recommendation and release |
|---|---|---|---|---|---|
| **Town work** | settled on the tick every 90 s / **paid in closed form**: at start, at each paid hour, at stop | **109 / 109** | medium: a money and XP path. Closed form must pay what the settles pay on a replayed day. Security review at Early Access | formula + server, 59 row 30 (P05, P-X28, 43 E18) | **Closed form.** The beta, once ruled. Until then a narrow town read (the hero's engine inputs, not the whole hero) saves 40% of a town settle |
| **A closed hunt's save cadence** | every 100 s / **every 10 minutes, or at 1.2 s of engine time** / hourly on an engine host | **36 / 32** | medium: no result changes (MEASURED). A hunt that ends unwatched is filed back in town up to 10 minutes after its true end, so the next planned hunt must start from that end | `fold_windows` dial + the edge slice sized by engine time, new (section 7) | **10 minutes**, after the watched save lands |
| **An open tab's traffic** | whatever it sends / **only the confirm and the heartbeat** | 0 / **50** | unknown until the 33.5 s is named | client + server, new (section 10) | **Confirm and heartbeat only.** One controlled read names it |
| **The settle read** | reads the party at each reference (live) / **reads it once** (`r as materialized`) | **6.5 / 49** | none: one stable call, once, in one snapshot | edge SQL, one word, new (section 8) | **Read once. Ship first** |
| **A watched hunt's save** | at every 16 s confirm / **confirm in the edge, save at the 90 s flush** / confirm from an engine host's memory | 0 / **26** | high: nothing a purchase, a gate or another player reads may come from unsaved state, and an isolate kill must re-settle the same frames (30-plan L12) | edge + server, L12 (28-1) | **Flush.** Before the beta passes 250 accounts |
| **The off-screen heroes** | a 60 s whole-hero poll each / **their frames are their feed** | 0 / **29** | its own lane's | edge + server, L01 (staged) | **Frames.** Built, staged |
| **What a read sends** | the whole hero / **changed sections only** | 0.7 / **19** | medium: a section not sent is unchanged at the version the client holds, never merged (§6) | server + client, L24 | **Changed sections.** After the flush |
| **Town presence** | polls / **one heartbeat, nothing when alone** | 0 / 9 | low | server + client, L25 | **Heartbeat** |
| **Presses** | 100 a day / **20 (Carry on, the plans)** | 5.7 / 5.7 | none | content + client, L07, L21 | **20.** Built |
| **The settle's plans** | a function a row in the read, the curves walked by Level, limits read hundreds of times a save / **once each** | 1.7 / 8.8 | low: plans only, proven by the settle parity arms and `schema-drift` | server, new (section 8) | **Once each.** The beta |
| **The journal** | a row a supply kind a save / **one row a hero an hour an activity** | 0.7 / 1.1 | medium: every day cap and audit sum reads the same on a replayed day, every value movement stays journalled (§1) | server, L13 (28-2) | **Hourly.** Before 250 accounts. Its worth is disk: 216 rows a hunted hero-hour become about 3 |
| **An account's four heroes** | four lone hunts / **one party, or the tick packing an account's lone hunts into one save** | 6.7 / none (closed day: 17.6 lone, 10.9 party) | none | tick packing, 28 change 1 | **Pack by account** |
| **Where the engine runs** | **Supabase's edge**: stateless, 2 s of CPU a request / an always-on engine host: a viewed hunt stays in memory | the host saves 6.5 / 21.2, and makes a world boss cheap | the host carries L12's failure case on a long-lived process, and is a second deploy surface | platform, a spend | **The edge for the beta and 1,000 accounts. Decide the host before 10,000** |

---

## 4. Four heroes from the first evening

The target account-day for 1 to 4 heroes, each hunting 12 hours and working in town 12, under the recommended design (`platform-cost.mjs ladder`, the heroes table). Lone heroes each hunt alone.

| Account | Browser closed: the account | a hero | The 3.5-hour tab: the account | a hero |
|---|---|---|---|---|
| 1 hero | 5.2 | 5.2 | 15.5 | 15.5 |
| 2 lone heroes | 9.3 | 4.7 | 19.7 | 9.8 |
| 3 lone heroes | 13.5 | 4.5 | 23.9 | 8.0 |
| 4 lone heroes | 17.6 | 4.4 | 28.1 | 7.0 |
| 4 heroes as one party | 10.9 | 2.7 | 31.2 | 7.8 |

1. With the browser closed the cost is per hero: four cost four times one. The tab is per account, so with it the fourth hero adds far less than the first (x1.8 for four).
2. A party of its own four is the cheapest idle shape, because one save carries all four. Packing an account's lone hunts into one save closes most of the gap.
3. Every row meets 60 at 1,000. At 10,000 the closed day meets in every shape, and the 3.5-hour tab meets for one to three lone heroes (14.6, 18.8, 23.0) and misses for four (27.2 lone, 30.3 party).
4. Because every account has four heroes from day one, every account pays the four-hero row from its first evening. A first-evening hero's read and save are small, but the cadence and the town work are the same, so the row is the upper side, not a veteran's.
5. One Premium an account changes no line: stamina does not bind the hunted hours here (CITED 28).

---

## 5. The MMO layer: a world boss

No fixture exists, so this is ESTIMATED from the replay's per-member cost of a save (read once: the apply 11.4 PGlite ms a member and 12.4 fixed, the read 6.8 a member and 5.3 fixed), production's factor against the replay (1.49: a closed four's save is 135 production ms against 90.9 PGlite), a frame for every member open in a client (18 ms), and engine time linear in heroes (1.55 ms a hero a simulated second, ASSUMED). One 10-minute fight, one hero an account, every member watching. Inputs in `platform-cost.json` `boss`, the table in `platform-cost.mjs ladder`.

| Heroes in the fight | Design | Saves every | Saves | ms a save | Database-s the fight | An account, the fight | Share of a day's C2, 1,000 / 10,000 |
|---|---|---|---|---|---|---|---|
| 20 | each viewer reads the whole fight every 16 s, the edge engine | 39 s | 16 | 724 | 264 | 13.2 | 22% / 55% |
| 20 | **one broadcast a save, no viewer reads, the edge engine** | 39 s | 16 | 724 | 11 | **0.6** | 1% / 2% |
| 20 | one broadcast a save, an engine host | 100 s | 6 | 724 | 4.3 | 0.2 | 0% / 1% |
| 40 | each viewer reads the whole fight | 19 s | 31 | 1,430 | 1,036 | 25.9 | 43% / 108% |
| 40 | **one broadcast, the edge** | 19 s | 31 | 1,430 | 44 | **1.1** | 2% / 5% |
| 40 | one broadcast, a host | 100 s | 6 | 1,430 | 8.6 | 0.2 | 0% / 1% |
| 100 | each viewer reads the whole fight | 8 s | 78 | 3,547 | 6,402 | 64 | 107% / 267% |
| 100 | **one broadcast, the edge** | 8 s | 78 | 3,547 | 275 | **2.7** | 5% / 11% |
| 100 | one broadcast, a host | 100 s | 6 | 3,547 | 21 | 0.2 | 0% / 1% |

The design rules this sets for the MMO-layer study:

1. **A shared fight is never read per viewer.** Per-viewer reads of the whole fight grow with the square of the crowd. The fight's state goes out as one broadcast a save on the boss's own topic, and a member's own value (its XP, its loot) lands in its own envelope at the save.
2. **Rooms, as 28 section 3 rules.** Nothing scales players x players. A boss of 1,000 is ten rooms of 100 with one shared health bar summed once a save.
3. **On the edge the window shrinks as the fight grows** (100 heroes: 8 s of fight a save, under the 2 s CPU limit), and a 100-member save holds 100 heroes' locks for about 3.5 s, so any press of those accounts waits behind it. On an engine host the window stays at 100 s. A daily boss fits C2 either way with the broadcast design.
4. **The hunt door as built caps a fight at `party_max` (4)** in `hr_hunt_apply_instance`. A boss is its own door, not a big party.
5. **Before a boss is built:** a 20-hero, 20-account fixture in `tests/per-player-cost.mjs`, watched, and the engine's ms a simulated second measured at 20 and 100 heroes.

---

## 6. Build order and what each step needs

1. **Read once** (one word in `HUNT_READ_SQL`). Proof: the settle parity arms and `per-player-cost` (statements a save stay 4).
2. **No off-screen poll, tick packing, the 5-minute prune** (L01, staged).
3. **A narrow town read**, the interim for town work until closed form is ruled.
4. **Confirm in the edge, save at the flush** (L12) and **the hourly journal** (L13), before the beta passes 250 accounts (30-plan).
5. **Plan fixes** beside them.
6. **Town work in closed form** once ruled.
7. **The tab's confirm and heartbeat only**, once the controlled read names the 33.5 s.
8. **The 10-minute save for closed hunts** after the flush has baked a nightly (both rewrite the settle path, and the flush's place against the engine batches L15 and L17 holds).
9. **Changed sections only** (L24) and **one heartbeat** (L25).
10. **The engine host decision** before 10,000 accounts, with the MMO layer's broadcast design.

---

## 7. The cadence proof: a closed hunt saved less often

`node tools/balance-program/platform-cost.mjs window`: one fixture built once, then the same 20 simulated minutes saved at each cadence from the same savepoint (the same instance, secret, seeds and clock, as `tests/hunt-sessions-settle.mjs` TICK-1 does). The heroes' end state (character, skills, bag, wallet, stats, session, instance world) and the journal's sums are compared with the 100 s run.

| Fixture | Save every | Saves | PGlite ms a save | Save ms a hero-hour | Journal rows a hero-hour | End state | Journal sums |
|---|---|---|---|---|---|---|---|
| lone Level 10 | 100 s / 120 s / 300 s / 600 s / 1,200 s | 12 / 10 / 4 / 2 / 1 | 14 to 20 | 721 / 431 / 187 / 95 / n/a | 57 / 51 / 24 / 12 / 6 | IDENTICAL | IDENTICAL |
| party of four, Level 20 | 100 s / 300 s / 600 s / 1,200 s | 12 / 4 / 2 / 1 | 54.6 / 53.8 / 47.1 / n/a | 491 / 161 / 70 / n/a | 47 / 20 / 12 / 6 | IDENTICAL | IDENTICAL |
| supply-heavy four | the same | | 48 to 80 | 435 / 239 / 82 | 85 / 29 / 14 / 8 | IDENTICAL | IDENTICAL |
| Krell Deadly four | 100 s / 300 s / 600 s / 1,200 s | 12 / 4 / 2 / 1 | 48.6 / 54.0 / 62.2 / n/a | 437 / 162 / 93 / n/a | 83 / 28 / 14 / 8 | IDENTICAL | IDENTICAL |
| Krell four, read once | 100 s / 600 s | 12 / 2 | 53.4 / 58.3 | 480 / 87 | 82 / 14 | IDENTICAL | IDENTICAL |

The engine is cut-invariant at long windows, not only at the 2-minute slices TICK-1 tests. A save costs about the same whatever window it carries, so database time and journal rows both fall with the number of saves.

The limit is the edge. A save simulates its window inside one request with 2 s of CPU (`EDGE_CPU_MS`). Ten minutes is 0.2 to 0.8 s of engine for a light hunt and 3.7 s for a heavy four at the p95. So the rule is "save when the window holds 10 minutes, or 1.2 s of measured engine time, whichever is less": heavy parties save every 4 to 5 minutes. The database half is a dial already built (a closed hunt is due every `flush_seconds x fold_windows`, `2027-02-04-tick-span.sql:150`). The edge half sizes `HUNT_SETTLE_SPAN_MS` for each hunt by its last engine time. Until that lands, `fold_windows` alone saves nothing: the 2-minute slice cuts a long window into slices the next fires save one by one. Any balance change that adds monsters to a pull (R19, L15, L17) raises engine time, shortens a heavy party's window and so raises its database cost: each engine batch states its engine ms a simulated second at Krell (G17).

---

## 8. Inside a save, and one defect found while measuring

**The live settle read reads the party three times or more.** `HUNT_READ_SQL` (`supabase/functions/hr-accrue/hunt-settle.js:265`) folds each member's perks into the read. Its CTE `r` is inlined and `r.inst` is referenced three times, so PostgreSQL substitutes the stable call into each reference:

```sql
r as (select g.allowed, case when g.allowed then public.hr_hunt_instance_read($1::uuid, $2::int) end as inst from g)
```

REAL: 183.4 ms a call (1,299 calls, min 164.4) against 19.1 for the statement before the fold. MEASURED: `hr_hunt_instance_read` runs 3 times a save on the replay (4.8 on a watched one) and `hr_hunt_member_read` 72 times for four members. `r as materialized (...)` (`platform-cost.mjs profile --read-materialized`, a measurement only) cuts the four's read from 103.5 to 32.4 PGlite ms and runs the party read once. No result moves. It is an edge change for the lane that owns the settle path.

**The replay profile** (`platform-cost.mjs profile`, `track_functions = all`, read once): a closed four's save is 36% read and 64% apply. Inside: `hr_apply` 17% of function time, `hr_hunt_apply_member` 10%, `hr_hunt_member_read` 8% (24 calls for four members), `hr_hunt_setup_live` 7% (176 calls, one a ground density row), `hr_hunt_limit` hundreds of calls, 15,710 `hr_skill_curve` rows read a save. A town settle is half `hr_tick_settle` and half the whole-hero read the tick makes to learn the hero's activity.

**Production's indexes** (REAL, `pg_stat_user_indexes` and `pg_stat_user_tables`): `player_ledger_user_idx` read 4.05 billion tuples (2,171 a scan: reads over a hero's whole day of journal rows by `hr_day_budget_used`, the hearthfind count in `hr_state_of` and the alarm's `hr_tick_stall_status`, READ from `pg_proc`), `hr_skill_curve_pkey` 3.03 billion (`max(level) where xp <= x` walks the Level key, where an index on XP reads one row), `hr_xp_table_pkey` 0.85 billion (the same shape, with `hr_xp_table_xp_idx` unused), `player_progress_pkey` 79 rows a scan to find one key, and `hr_hunt_limits` 19.4 million whole-table scans. These are the plan fixes of section 3. A hero has 1,458 journal rows already that day at an average closed save and 2,317 at a watched one (REAL, 7 days): the hourly journal makes that about 12.

---

## 9. Risks against §1 and §6 for the choices that carry them

- **Read once.** None. A materialized CTE is evaluated once in the statement's snapshot.
- **The narrow town read.** The tick reads the whole hero today because `hr_engine` holds no grant on `player_state` and S-8 needs the channel before the probe (`tick.js:848`). A narrow SECURITY DEFINER read returning the engine inputs, `active_kind`, `active_id` and `version` from the same row keeps S-8 and the version check. It is the town's twin of `hr_hunt_member_state`.
- **The flush.** Its failure case is written in 30-plan L12. The only choice where the browser is shown state the database has not saved.
- **The hourly journal.** The journal stays the only complete record (§6) as hourly sums. Every day cap that reads it (`hr_day_budget_used`, the market caps, the GM caps) reads the same on a replayed day.
- **Town work in closed form.** A value path. It needs a replayed-day equality with tick settles and the Security review at Early Access.
- **The 10-minute save.**
  1. Nothing a player earns changes (MEASURED, section 7).
  2. A hunt that ends unwatched (a death, stamina, supplies, gold) is simulated to its true end and saved up to 10 minutes later. `hr_hunt_after_sweep` must start the next planned hunt from that true end, or the hero idles. Tested with the browser closed (CLAUDE.md §4 both paths).
  3. A player who opens the game mid-window sees the saved state, then the first hello settles the window to now. The browser never shows a value the server has not saved.
  4. A failed long save leaves the hunt owed on its unmoved `settled_to`: never restored or evicted on uncertainty.
  5. A window across UTC midnight files up to 10 minutes of day-capped value under the day it lands in. BOTH-PATH-MIDNIGHT proves deaths file under their own day. The lane extends that arm to the day budget.
- **The engine host.** L12's failure case on a long-lived process: a crash loses nothing (the engine is deterministic from the last save), but the host must never answer from state older than the database's.

---

## 10. What to measure next, and the checks this adds

1. **The save's cost after read-once ships.** It rests on one 10-minute delta with one party hunting. Expected: the read about 35 ms and the apply about 100 ms for a closed four.
2. **The tab's 33.5 s.** A controlled read: the QA four watched in the browser pane for 30 minutes with nothing else hunting, `pg_stat_statements` before and after, by statement. Candidates: the town view polling behind the hunt window (up to 13.5 s an hour at a 2 s poll), the hello's reads, `hr_access_check` on every REST call, chat, the residue writes.
3. **A town-hour fixture that plays two closed-form jobs a hero a day** (59 asks it too) and **a 20-hero boss fixture** (section 5).
4. **Observability added:** `platform-cost.local.mjs minutes` is the per-minute read of what a watched minute and an away save cost, re-runnable after every server release. `platform-cost.mjs window` is the parity and cadence proof for the 10-minute save. `platform-cost.mjs profile --read-materialized` is read-once's before and after.
5. **An alarm for the read-once lane:** the settle read's mean beside `db_pct` in `hr_ops.capacity_sample()`, red over 40 ms. It rose from 19 to 185 and nothing told us.

---

## 11. Evidence

- **REAL:** every per-call mean and count, the save cadences (36 an hour away, 181 to 201 watched), the rows a hero has that day at a save, the watched-minute cost from the capacity sample, the read's 183 ms against 19.1, the closed four's save from the delta, the town settle's composition, the index and scan counts.
- **MEASURED (replay):** the read's triple evaluation and its fix, the profile shares, the cadence parity (identical end states and journal sums at 100 to 1,200 s on four fixtures), a save's cost against its window and against the day's journal, the lone and four per-member costs.
- **ESTIMATED:** the lone hero's save, read-once's production read (35 ms, between 26 and 57), the plan fixes' and the hourly journal's shares, the engine host's results, every world-boss row.
- **ASSUMED and CITED:** changed sections at x0.25 (28), closed-form town work at 0.5 s a day and 20 presses (59), the town tab-hour (28), the engine's ms a simulated second (`hunt-settle.js`) and its linearity in heroes, an hourly save at 1.3 times a 100 s one, the tab shapes (CITED 28 and 10).
- **UNATTRIBUTED:** 33.5 s of a watched four-hour (section 2).

## 12. Tools

- `tools/balance-program/platform-cost.local.mjs` reads production, SELECT only in a read-only transaction, aggregates only: statements, indexes, whole-table scans, saves by size and door, rows before a save, minute buckets, frames, the tick's dials.
- `tools/balance-program/platform-cost.mjs`: `design` prints the target account-day and what each choice is worth, `ladder` the build-order view and the heroes and world-boss tables, `profile`, `aged`, `window` and `--read-materialized` the replay measurements, `--selftest` the arithmetic. Its inputs, each with its source, are `tools/balance-program/platform-cost.json`.
