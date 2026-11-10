# Hunt path baseline, 2026-11-10

Reliability Engineer, lane `lane/a-hunt-path-baseline`, branched from `ee5896a1a` (v0.2.112).
Read and measure only. No game code changed. Nothing was written to production.
Local numbers come from `tools/qa/local-world.mjs` (the real `play.html`, the real `hr-accrue` handler, the replayed chain).
Live numbers are SELECT-only reads of project `nezapsylztqbbwuwembx`, taken 2026-11-10 05:10 to 05:35 UTC.

## Rerun it

```
node tools/qa/hunt-path-baseline.local.mjs --party 1 --minutes 10  --json p1-m10.json
node tools/qa/hunt-path-baseline.local.mjs --party 4 --minutes 10  --json p4-m10.json
node tools/qa/hunt-path-baseline.local.mjs --party 1 --minutes 720 --json p1-m720.json
node tools/qa/hunt-path-baseline.local.mjs --party 4 --minutes 720 --json p4-m720.json
node tools/qa/hunt-path-table.local.mjs p1-m10.json p4-m10.json p1-m720.json p4-m720.json
node tools/qa/residue-weight.local.mjs --json residue.json
```

Run them one at a time. Each is one process and one world. On this PC, unthrottled, a run took 2 to 4 minutes.
The first run on a machine replays the migration chain once (203 s here) and caches it under `tests/.pglite-cache`.
Options: `--hunt`, `--level`, `--step` (seconds a closed-browser settle window, default 95), `--viewed` (real seconds watched, default 70), `--seed`, `--enter rpc`.

What a run does: a new account from the real sign-in screens, hero 0 from the real creation step, the hunt started by the real Hunts window press (the party leader's press for four), 70 real seconds watched, the page closed, the hunt run on the world tick alone in 95 s windows, a new tab opened, the same tab reloaded, then Leave and the summary.

How each number is taken:

- Database calls: every transaction and statement is counted at PGlite's own door.
- Row writes: Postgres tuple counters by table, read inside each transaction before it commits. A control at the start of every run inserts 7, updates 3 and deletes 2 rows and must read back 7, 3, 2. It did in every run.
- Engine time on the tick: the engine's own figure, `hunts.engine_ms` in the tick answer (`hunt-settle.js` `engineBudget`).
- Engine time on a watched ask: the answer carries none. The table shows the gap between the last read and the commit, marked DERIVED.
- Envelope bytes: the edge's own JSON for `hr-accrue`, the browser's copy for `hr_load`.
- Reopen: marks taken inside the page with `performance.now()`.

Limits to keep in mind. Wall clock is this PC's, with headless Chromium on localhost and PGlite in WASM. Compare counts, bytes and ratios. Levels, gear, stamina and the purse are LOCAL fixtures in the in-memory database, as `tools/qa/party-soak.mjs` does. The dice secret is pinned by `--seed`, but the instance id and the clock are not, so a rerun gives the same shape and not the same rolls. A skip compresses hunt time and not the wall clock, so the script ages the closed page's presence stamp and drops the 30 s tick lease between windows, as real time would.

## Part 1. The path

Lone hero. File and function at each step.

| # | Step | Browser | Server |
|---|---|---|---|
| 1 | Page load | `play.html:502` loads `src/app/boot.js` (`startApp`, :89). 473 to 477 files are requested before the first screen. Sign-in comes back from the stored session (`src/net/auth.js`). | static files only |
| 2 | Roster | `showCharacters` (`boot.js:215`) calls `AccountSession.roster()` (`src/session/account-session.js:308`): `hr_load` for slot 0, then every other owned slot at once. | `hr_load` (`2027-01-20-tutorial-facts.sql:97`) builds `hr_state_of` (`2027-01-18-dead-surfaces-cut.sql:112`). One whole envelope a hero. |
| 3 | Play | `play(slot)` (`boot.js:314`) calls `_open` (`account-session.js:379`): a new `CharacterSession`, the roster's answer as its first read if it is under 10 s old, `connect()` joins the hero's push topic, `setViewed()` (`src/session/character-session.js:170`). `openOthers` (`account-session.js:437`) then opens the account's other heroes. | nothing new |
| 4 | Start the hunt | Enter press (`src/shell/windows/hunts.js:438`) calls `enterHunt` (`character-session.js:270`). The answer is not applied. `_settled` (:461) re-reads with `hr_load` and `_take` (:129) replaces the record through `applyEnvelope` (`src/session/envelope.js:58`). | `hr_hunt_enter` (`2027-02-20-party-leader-starts.sql:43`) calls `hr_hunt_enter_for` (`2027-02-10-party-instance-reset.sql:130`): the instance, the session and the hunt bag. |
| 5 | First picture | `_armHuntPoll` (:160) asks after 300 ms. `hello()` (:491) posts `{slot}` to `hr-accrue` (`src/session/server.js:156`). `LiveLink.from` (`src/session/live-link.js:131`) seeds the browser's copy of the same engine (`src/hunt-view/live-engine.js:37` imports `simulateHuntInstance`). Display only. | `index.ts:240`. Read transaction (:628): `hr_rate_gate`, `hr_accrue_read`, `hr_accrue_cap_ms`, `hr_bestiary_of`, `hr_trophy_of`, `hr_hunt_open_of`, `hr_collection_of`. Seed transaction (:875): `hr_seed` twice and `hr_perks_of`. `computeAccrual` answers `hunt_open` (:1002), `accrueWorkers` (:1014) and `accrueRested` (:1081) run, then `settleHunt` in mode `settle` (:1120). Inside the 15 s floor it answers `below_min_span` with the envelope and `hunt_live` (`hunt-settle.js:524`). Nothing is written. |
| 6 | Watched | `_huntPoll` (:190) sends the same ask every 16 s (`src/session/config.js:41`). The record is replaced by each answer. The live view compares world hashes. A hero that is open but not on screen asks the engine nothing. It reads `hr_load` every 60 s (`config.js:59`). | Past the floor the ask settles. `readHuntSettle` (`hunt-settle.js:467`) reads `hr_hunt_instance_read` (`2027-02-27-hunt-tiers.sql:179`) with each member's `hr_hunt_member_state` (`2027-02-02-settle-cost.sql:123`). `memberInput` (:594) reads `hr_perks_of` once a member. `proposeHuntSettle` (:561) runs `accrueHunt` (`accrual.js:1217`), which runs `simulateHuntInstance` (`src/core/combat-sim.js:243`). `commitHuntSettle` (:647) calls `hr_hunt_apply_instance`, which calls `hr_hunt_apply_member` and `hr_apply` once a member. The answer is the commit's own projection of the caller plus the timeline and `hunt_check`. |
| 7 | Browser closed | `stampAway` (`src/shell/away-recap.js:179`) writes `awaySeen` into the residue with one `hr_put_client_state` on a keepalive fetch (`character-session.js:570`). After that no client exists. | pg_cron `hr-tick-run` fires every 10 s. `hr_tick_cron_run` (`2027-02-21-tick-gateway-apikey.sql:80`) leases every session owed 90 s or more (`hr_hunt_roster`, `2027-01-01-server-perf.sql:232`) and pg_net posts a signed body. `index.ts:270` verifies it and calls `runTick` (`tick.js:1226`), which calls `settleHunt` in mode `tick` (`tick.js:1363`). The same read, the same engine and the same commit as step 6. No envelope is built. No frame is pushed once the presence stamp is 75 s old (`hr_frame_wanted`, `2026-12-25-frame-push-revive.sql:200`). A settle simulates at most 2 minutes (`hunt-settle.js:167`). |
| 8 | The hunt ends | nobody is there | The engine names the reason from `END_ORDER` (`src/data/hunt-sessions.js:197`). In both 12 h runs it was `stamina` at minute 720. `hr_hunt_close` (`2027-02-11-forfeit-home-whole.sql:49`) closes the session and returns the hunt bag. The numbers stay in `hunt_session_tally`. |
| 9 | Reopen | Steps 1 to 3 again. Hunt still open: the scene is drawn at once from the pose in `hr_load` (`liveLink.join`, `character-session.js:175`) and the first ask brings a start point. Hunt ended: `endedSessionOf` (`src/hunt-view/summary-model.js:96`) sees it, the recorder builds the card from the server's analyzer and tally (`src/hunt-view/summary-recorder.js:76`, `summary-model.js:134`) and stores it in residue `huntSummaries`. `src/shell/alerts.js:255` compares the `awaySeen` stamp with the first envelope and speaks the away line (`away-recap.js:92`). | Hunt still open: the first ask may settle up to 8 slices of 2 minutes (`hunt-settle.js:336`). Hunt ended: an idle answer, then a second `hr_load`. |
| 10 | Leave | Leave on the hunt bar calls `leaveHunt` (`character-session.js:300`). | `hr_hunt_leave` (`2027-03-13-gm-tools.sql:455`) is always pending. The next settle closes the session at `leave_at`. |

A party of four heroes of one account differs in these ways. The leader's same button reads "Start with party" (`hunts.js:422`) and sends `hr_hunt_party_start` (`src/session/party-intents.js:90`, `2027-01-19-play-cap.sql:554`). There is one instance and one session a hero. One settle settles all four (`tick.js:1346`), in one commit that locks the instance and then each member. The four share one purse row. A settle costs 8 transactions instead of 5, the three extra being `hr_perks_of`. Only the viewed hero asks the engine. On return there are four `hr_load` at the roster and four more after each hero's first ask.

`src/session/edge-intents.js` is not on the bare hunt path. It shapes the item intents (eat, shop_buy, equip). Mid hunt each of those settles the hunt first and then acts.

Expected and not found:

- A separate offline or away engine path: does not exist. A closed browser is step 7, the same settle.
- A table `account_bestiary`: does not exist, on the replay or on live.
- An RPC `hr_bestiary_activate`: does not exist on the server. The client still has the intent (`character-session.js:422`).
- An RPC `hr_claim_rank`: does not exist. It is the reward the renown journal was written to audit.
- A service worker: does not exist. `src/platform/sw-killswitch.js` only removes old ones.
- `.claude/coordination/audit-2026-11-09/` on main: does not exist. The three notes are on branches `audit/2026-11-09-part2-server`, `lane/audit-part1-client` and `lane/audit-2026-11-09-part3`, and were read from there.

## Part 2. The numbers

Local baseline, one column a run.

| | p1-m10 | p4-m10 | p1-m720 | p4-m720 |
|---|---|---|---|---|
| scenario | lone hero, 10 min, meadowbrook_thicket L10 | party of 4, 10 min, meadowbrook_thicket L10 | lone hero, 12 h, meadowbrook_thicket L10 | party of 4, 12 h, meadowbrook_thicket L10 |
| seed (dice secret pinned, instance id and clock are not) | hunt-path-baseline:1 | hunt-path-baseline:1 | hunt-path-baseline:1 | hunt-path-baseline:1 |
| hunt ended (reason, minutes in) | still open at reopen | still open at reopen | stamina @720 | stamina @720, stamina @720, stamina @720, stamina @720 |
| **browser closed, world tick** settles | 6 | 6 | 454 | 453 |
| simulated seconds a settle (med / p95) | 96 / 102 | 96 / 116 | 96 / 96 | 96 / 96 |
| kills a settle (med) | 15 | 164 | 15 | 168 |
| ENGINE ms a settle, the engine's own (med / p95) | 41 / 52 | 111 / 157 | 20 / 32 | 69 / 114 |
| engine ms per simulated second (med / p95) | 0.4 / 0.5 | 1.2 / 1.6 | 0.2 / 0.3 | 0.7 / 1.2 |
| engine ms, whole hunt | 244 | 723 | 9641 | 33432 |
| transactions a settle | 5 | 8 | 5 | 8 |
| statements a settle (+ role/marker overhead) | 5 (+5) | 8 (+8) | 5 (+5) | 8 (+8) |
| ROW WRITES a settle, the commit (med / p95) | 37 / 39 | 133 / 138 | 33 / 38 | 132 / 142 |
|   of them inserts / updates (mean) | 5.8 / 29.7 | 22.3 / 109.0 | 4.0 / 29.4 | 15.9 / 116.5 |
|   player_ledger rows a settle (mean) | 2.00 | 10.17 | 1.79 | 10.23 |
|   player_progress writes a settle (mean) | 11.33 | 43.00 | 10.61 | 42.95 |
|   of them the collection counter, ev:loot ops (mean) | 4.33 | 14.67 | 3.61 | 14.70 |
| row writes a fire by the cron body | 5 | 8 | 5 | 8 |
| frames pushed a settle (browser closed) | 0 | 0 | 0 | 0 |
| commit payload the edge sends (med) | 4.2 KB | 13.0 KB | 4.1 KB | 12.6 KB |
| commit ms, PGlite, first 3 settles -> last 3 | UNMEASURED | UNMEASURED | 57,63,72 -> 23,23,29 | 121,141,103 -> 81,109,140 |
| row writes, whole hunt (commits + cron) | 243 | 836 | 17414 | 63613 |
| **hunt watched** paid asks in the watch | 4 in 70 s | 3 in 70 s | 4 in 70 s | 4 in 70 s |
| transactions / statements a paid ask | 5 / 10 | 8 / 13 | 5 / 10 | 8 / 13 |
| row writes a paid ask (med) | 27 | 102 | 26 | 100 |
| engine gap a paid ask, DERIVED: wall / process CPU ms (med) | 35 / 47 | 71 / 125 | 35 / 62 | 51 / 140 |
| frames pushed in the watch (count, med bytes) | 0 | 0 | 0 | 0 |
| **envelope** hr-accrue paid answer (med) | 28.8 KB | 47.6 KB | 28.2 KB | 47.4 KB |
| hr_load answer at reopen (largest) | 22.9 KB | 27.2 KB | 30.2 KB | 31.7 KB |
| server residue in it (bytes, share) | 109 B, 0.5% | 109 B, 0.4% | 108 B, 0.3% | 109 B, 0.3% |
| residue stored at the end, hero 0 | 904 B | 902 B | 921 B | 924 B |
| **reopen** page load -> characters screen (ms) | 1210 | 1252 | 868 | 1281 |
|   requests / bytes by then (local: no cache, no compression) | 475 / 6.6 MB | 473 / 6.0 MB | 473 / 6.0 MB | 477 / 6.7 MB |
| Play press -> hunt (or summary) on screen (ms) | 342 | 617 | 371 | 581 |
| Play press -> the fight moving (ms) | 703 | 1409 | no fight: the hunt had ended | no fight: the hunt had ended |
| page load -> on screen, whole (ms) | 1982 | 1934 | 1344 | 2094 |
| reload, same tab -> on screen (ms) | 1770 | 1802 | 997 | 1822 |
| server calls in the first seconds back (hr_load / hr-accrue) | 2 / 3, 88.8 KB | 4 / 3, 229.2 KB | 3 / 2, 61.1 KB | 8 / 5, 250.4 KB |
| run: real seconds | 123 | 128 | 179 | 244 |

On return the game said, in the two 12 h runs:

- Lone hero: "While you were away (12 h 1 min), Basel hunted Meadowbrook Thicket: Level 10 to 13, +258,332 Level XP, +18,686 gold, 6,651 kills. The hunt has ended. Out of stamina, so Basel came home. Stamina now: 2 min."
- Party of four: "While you were away (12 h 2 min), Basel hunted Meadowbrook Thicket: Level 10 to 14, +341,648 Level XP, +22,148 gold, 19,342 kills. The hunt has ended. Out of stamina, so Basel came home. Stamina now: 3 min."

The summary card equalled the server's `hunt_session_tally` in all four runs. Lone 12 h: card 6,659 monsters, 258,625 Level XP, 18,703 gold, 12:00:00, and the tally holds the same four figures. Party 12 h: 19,378, 341,984, 22,167, 12:00:00, the same. No forfeit, no refusal and no console error in any run.

Live, read-only.

| What | Figure | Read from |
|---|---|---|
| Settles in 14 to 30 s windows (a watched hunt), 7 days | 22,166 member settles, 71.7% of all, over 112.0 hero-hours (33.5%) | `player_ledger`, kind combat |
| Settles in 80 to 125 s windows (the tick), 7 days | 7,887, 25.5% of all, over 219.1 hero-hours (65.4%) | same |
| Settles a hero-hour, watched and unwatched | 198 and 36. Watching costs 5.5 times the commits. | same |
| Engine ms a tick settle, party of four, 100 s window | 375 mean, 452 p95, 487 max (coppercap_warrens, 31 settles). 320 mean (mosslight_glade, 5). | tick answers in `net._http_response`, last 6 h, joined to the ledger |
| Engine ms a tick settle, lone hero | 62 (one settle in the window) | same |
| Engine ms a simulated second | 3.2 to 3.7 for four, 0.67 for one | same |
| Whole tick request with a party settle | 565 to 651 ms mean | same |
| `hr_hunt_apply_instance` | 12,919 calls since 10-31, 197.7 ms mean, 735 max, 116 KB of WAL a call, 36,330 buffer touches a call. First statement in the database by total time, 17.3% of all of it. | `pg_stat_statements` |
| `hr_state_of` on its own | 42 to 44 ms mean, about 7,500 buffer touches a call | same |
| The watched ask's reads | `hr_accrue_read` 20.0 ms, hunt read 15.4 ms, `hr_perks_of` 2.4 ms, seeds 2.8 ms, `hr_bestiary_of` 0.3, `hr_collection_of` 0.3, `hr_trophy_of` 0.1 | same |
| `hr_tick_cron_run` | 83,232 calls, 26.0 ms mean, 14.6% of all statement time. It runs 8,640 times a day whether or not anyone hunts. | same |
| Other cron bodies | `hr_ops.alert_run()` 94.2 ms mean each minute (6.1%), `hr_tick_enrol` 49.9 ms each minute (4.7%) | same |
| Server residue a hero | median 9,927 B, p95 18,804, max 18,811, over 21 heroes. All 13 keys are on the allowlist. `huntSummaries` 43%, `bagSeen` 24%, `alerts` 19%, `storeSeen` 11%. | `player_state.client_state` |
| Ledger | 338,593 rows, 208 MB of a 330 MB database (63%). 113,023 rows in 7 days. 10,979 in 24 h. 615 B a row with indexes. Retention is 90 days (`hr_ledger_prune`). | `player_ledger` |
| Hunt ledger rows a hero-hunt-hour | 242 (80,897 rows over 334.5 hours) | same |
| `renown_ratchet` rows | 50,176, which is 14.8% of the ledger | same |
| `player_progress` | 2,471 rows, 1,635 of them `ev:loot` (66%) | `player_progress` |
| Ledger rows a hero-day | median 1,008, p95 6,236, max 10,197 | `player_ledger` |
| The day-budget sum, busiest hero yesterday | 4,106 rows and 1,013 buffers read, 1.6 ms | `explain (analyze, buffers)` of the SELECT in `hr_day_budget_used` |
| Rested bank | 19 of 21 heroes at the 80 cap. 501 ledger rows ever. | `player_state`, `player_ledger` |
| Crew | 0 rows in `player_workers`, 0 ledger rows of kind worker | both tables |
| Health at 05:19 UTC | 3 instances open, worst lag 46 s, 60 of 60 fires, 0 5xx, database 27 ms/s of 2,000, 26 of 90 connections, disk 954 MB of 8,417 MB, database +13 MB in 24 h | `node tools/hunt-health.local.mjs` |
| Static hosting | `Cache-Control: max-age=600`, gzip | response headers of hearthrise.net |

UNMEASURED:

- Page load to hunt on screen on a real network. PostHog `boot_timing` holds it (`src/net/boot-timing.js`), and this lane has no PostHog read. The table's times are localhost.
- Transfer bytes in production. The local world serves uncompressed with no cache.
- Time per SQL function inside the commit. On live `track_functions` is `none`. Here PGlite's per-function counters failed their check (they read 0.1 calls of `hr_hunt_apply_instance` a settle, where there is exactly one), so they were removed from the script. `tools/settle-cost.mjs` is the instrument for that split.
- The engine's own time for a watched ask. Only the tick answer reports one.
- Edge CPU per request from `function_edge_logs`. This lane's tools had no logs read. hunt-health's count is what was read: 51 edge calls in 10 minutes, 0 5xx.
- Frames to a party's other open heroes. Every local watch pushed 0, because only the viewed hero held a presence stamp.
- The return after a death while away. A Level 10 tank sent to Mosslight Glade (16 to 31) lived the whole 30 minutes, so no run reached it. From the code only: `summary-recorder.js:84` explains a death from events the page itself saw, so a death nobody watched should show its reason line without the explanation.

## Part 3. Findings

### The 11-09 audit's claims

| Claim | Verdict | The number |
|---|---|---|
| The server residue is a deny list, capped at 256 KiB, sent in every envelope | CONFIRMED as a mechanism. Small today. | The server took a key on no allowlist at 4, 32, 128 and 250 KiB and refused 300 (`patch_too_large`, cap 262,144). With the 250 KiB key `hr_load` was 272,945 B, 93.8% of it residue, and the browser's `residueOf` kept none of it. The allowlist's own ceiling is 130,924 B before summaries. On live the residue is 9.9 KB median and 18.8 KB max, every key allowlisted. It rides `hr_load`, every hunter's ask and every frame. |
| The crew runs in every settle | REFUTED as a cost. Dead code confirmed. | `accrueWorkers` runs only on a watched ask (`index.ts:1014`). It is pure JS and sends 0 statements. `player_workers` holds 0 rows. |
| Rested writes in every settle | REFUTED. | Watched ask only. At most 80 writes a hero, one each 6 minutes, then never again. 19 of 21 live heroes are at the cap. 501 ledger rows ever. Nothing spends the bank. |
| Collection writes in every settle | CONFIRMED. | `ev:loot` progress ops are 3.6 of 33 row writes a lone settle and 14.7 of 132 a party settle (11%). They are 66% of `player_progress` on live. No file under `src/` reads them. `accrual.js:1344`, `src/core/goals.js:553`. |
| A bestiary read on a missing table | REFUTED as worded. | No query runs. `hunt-settle.js:619` reads a key, `account_bestiary`, that `hr_hunt_member_state` never emits. What does run is `hr_bestiary_of` and `hr_trophy_of` on every watched ask, 0.4 ms together on live, for an answer key nothing reads. |
| `hr_apply` is 158k chars | CONFIRMED exactly. | 158,014 chars and 2,576 lines, on the replay and on live. It runs once a member inside every commit. |
| Not in the audit | NEW. | `renown_ratchet` writes a ledger row on nearly every member settle (1,823 of 1,828 in the party 12 h run). It is 14.8% of the live ledger. Its comment calls it the audit trail for `hr_claim_rank`, which no longer exists. |

### 1. A watched hunt is committed 5.5 times as often as an unwatched one

Kind: server work per hero-hour.

Where: `src/session/config.js:41` (`huntPollMs` 16000), `src/session/character-session.js:190` and `:500`, `supabase/functions/hr-accrue/index.ts:1120`, `supabase/functions/hr-accrue/hunt-settle.js:145` (`HUNT_SETTLE_MIN_MS` 15000).

Evidence. On live, one third of hero-hours (the watched ones) made 71.7% of all settles in 7 days: 198 commits a watched hero-hour against 36. Each watched commit is a full one. Locally a lone hero's paid ask is 5 transactions, 10 statements, 26 row writes and a 28 KB answer. A party of four's is 8 transactions, 13 statements, 100 row writes and a 47 KB answer, every 16 s. On live the commit is the heaviest statement in the database: 197.7 ms mean, 116 KB of WAL and 36,330 buffer touches a call. The ledger, 63% of the database, takes 242 rows a hero-hunt-hour, and most of them come from watched hours.

Smallest fix. `settleHunt` already takes a floor (`o.minWindowMs`, `hunt-settle.js:504`), and inside the floor an ask already answers the live start point and writes nothing (`hunt-settle.js:524`). Pass a longer floor from the bare watched ask only (`index.ts:1120`). Leave the verbs' collect at 15 s, because bag and settings verbs refuse `settle_first` past 20 s (`hunt-settle.js:139`). The tick then commits every 90 s and its frame refreshes the numbers on screen. At a 45 s floor watched commits fall about 2.8 times. At 90 s they fall 5.5 times, which removes about 59% of all commits at today's mix.

What it costs the player: confirmed loot, gold and XP on a watched hunt would refresh every 45 or 90 s and not every 16 s. The fight itself keeps moving, since it is the browser's prediction.

Lane: backend-architect for the edge, with the systems-engineer for the hunt view. It rides the next engine batch.

### 2. The journal and the counters carry rows nothing reads

Kind: server work per hero-hour, and capacity.

Where: the `renown_ratchet` insert in `hr_apply` (`supabase/migrations/2026-10-27-core-bodies.sql:2537`, live body lines 2408 to 2434). The collection counter (`supabase/functions/hr-accrue/accrual.js:1344`, `src/core/goals.js:553`). The three reads on the watched ask (`index.ts:690`, `:709`, `:742`).

Evidence. 50,176 `renown_ratchet` rows, 14.8% of the ledger, journal a display high-water mark for a claim that no longer exists. In the party 12 h run they were 1,823 of 4,693 ledger rows (39%). The collection counter is 11% of a settle's row writes and two thirds of `player_progress`. Neither has a reader. The crew, the rested bank and the bestiary reads are dead too, but they cost under 1 ms an ask, so they are cleanup and not savings.

One thing that looked worse than it is: `hr_day_budget_used` (`2026-10-19-account-wallet.sql:2472`) and the supply day sum (`2027-03-22-live-events.sql:596`) re-read the hero's whole UTC day of ledger rows on every commit. `player_ledger_user_idx` has served 670,106 scans at 2,458 rows a scan. Measured on live it is 1.6 ms at 4,106 rows, and commit time did not rise across either 12 h run. It grows with the day's rows, so it is worth a counter row one day. It is not a top cost today.

Smallest fix. Remove the five-line ledger insert (keep the `renown_high` update if the honor roll reads it). Remove `collectionProgressOps` from `memberDelta`. Take the three dead reads and their answer keys out of the watched ask. Fold in the audit's crew and rested cut.

Lane: backend-architect, lane C for the `hr_apply` body, plus one edge deploy for `accrual.js` and `index.ts` in the engine batch.

### 3. Coming back loads 475 files, then reads every hero twice, and half of each envelope has not changed

Kind: coming back, and bytes per ask.

Where: `play.html:502` and the `?v=` module graph under `src/`. `src/session/character-session.js:511` and `:512`. `src/session/envelope.js:67`. `hr_state_of`'s `client_state` line.

Evidence. 473 to 477 requests and 6.0 to 6.7 MB uncompressed arrive before the characters screen, 454 of them script modules. Production serves them with `max-age=600` and no service worker, so a return after ten minutes revalidates every file. After Play the hunt is on screen in 342 to 617 ms locally and the fight is moving in 0.7 to 1.4 s, so the wait is the load, not the game. Then each idle hero is read twice: the roster's `hr_load`, and a second `hr_load` because an idle answer always re-reads (`:512`). The version check on the line above applies only to a hunter. Four heroes home from a hunt cost 8 `hr_load` and 250 KB in the first seconds, one hero 3 and 61 KB. On every ask the whole character is sent again: of a 28 KB lone answer, `hunt_settings` (6.2 KB), `home` (2.5 KB) and `shop` (1.6 KB) do not change during a hunt, and on live the residue adds another 10 to 19 KB.

What the player is told on return is right. The away line and the card were correct in every run. Nothing here gives a wrong number.

Smallest fix. One line: let `:511` skip the re-read for an idle hero at a version it already holds whole. Then stop sending `client_state` in ask answers and frames, and have `envelope.js:67` keep the residue it holds when the key is absent. That also closes most of the audit's 256 KiB exposure, since only `hr_load` would carry the bag. Whether to bundle the modules is a larger call. Read `boot_timing` in PostHog for a week first.

Lane: systems-engineer for the client lines, backend-architect for the projection.

### Smaller facts

- Engine headroom on live. A party of four's 100 s settle is 375 ms mean and 487 max, against the 800 ms body budget (`hunt-settle.js:176`) and the edge's 2 s. Two party settles fit a body and a third starts at 750 ms spent. The comment at `hunt-settle.js:174` still says about 0.19 s a party settle.
- The clock costs more than the players today. Three cron bodies (`hr_tick_cron_run`, `hr_ops.alert_run`, `hr_tick_enrol`) take about 433 s of database time a day with nobody online, a quarter of all statement time. Every hunt commit together takes 265 s a day. Not a hunt-path fix, so it is listed and not ranked.
- One commit updates the same rows several times: `player_state` 4 times a member, `hunt_sessions` and `hunt_session_tally` twice, the account's one purse row 6 times for a party of four.
- A hunt started from outside the page is not seen by a hero idle in town until its next read. It only arose because this script can start a hunt by RPC. One account, one session is the rule, so it is a note and not a finding.

### Capacity

Today about 15 heroes play a day for 48 hunt hours. The ledger takes 16,146 rows and 9.9 MB a day. The database grows 13 MB a day.

| | Today | 10 times | 100 times |
|---|---|---|---|
| Ledger rows a day | 16,146 | 161,000 | 1.6 million |
| Ledger at the 90-day line | 0.9 GB | 8.9 GB | 89 GB |
| Commit time a day (`hr_hunt_apply_instance`, 1,339 calls at 197.7 ms) | 265 s | 2,650 s | 26,500 s, which is 307 ms of every second |

The disk is 8.4 GB. At 10 times today's play the ledger alone passes it at the 90-day line. Findings 1 and 2 together remove about 48% of ledger rows at today's mix. That moves the line and does not remove it. No spend is needed now and none is asked for.

## The next decision

How old may the confirmed numbers on a watched hunt be: 16 s as today, 45 s or 90 s? That one answer sets the size of finding 1, which is the largest saving here. It is a feel question, so it is Tyler's or the designer's. Everything else above can be briefed without him.

Suggested order: finding 2 (pure removal, no player sees it), finding 3's one-line re-read fix, then finding 1 once the number is chosen.

## Verified and assumed

Verified by running it: every local figure in the table, the row counter control in each run, the card against the tally in four runs, the residue probe.
Verified on live by SELECT: every row of the live table, the `hr_apply` length, the missing table and functions.
Assumed: that the fixture heroes (Level 10, bronze kit, Meadowbrook Thicket) stand for a typical hunt. The live party figures are from harder grounds and are 3 to 5 times the local engine time.
Derived, not measured: commits removed by a longer floor (from the live window mix), the capacity table (a straight multiple of today), the residue's share of a live envelope.
Not assessed in this lane: backups, restore tests, PITR. No migration, no destructive step.
