# Balance program 28: platform, cost and scale

Phase-2 dive, 2026-11-20, on `lane/d-balance-platform` (cut from `set/v0.2.143`). Eight systems: `settle-engine`, `envelope`, `accounts`, `access`, `operations`, `moderation`, `account-deletion`, `content-tooling`. This file answers Tyler's "It needs to meet all of my requirements including being optimized and scalable" with one cost table a reference player, and names every system whose cost does not scale.

Labels as in 01: **REAL** (production, read-only, `node tools/balance-program/platform-read.local.mjs`, 2026-11-20 16:10 UTC: `pg_stat_statements` since 2026-10-31, 20.1 days; the journal since 2026-10-19), **MEASURED** (a tool on this branch, command beside it), **CITED**, **RULED**, **ASSUMED**, **PROPOSED**.

**The inventory needs no new system.** Three costs it does not list sit inside systems it has: our own dashboards and audits reading production (7.5% of all database time, in `operations`), the residue write `hr_put_client_state` (21 KB of WAL a call, in `envelope`), and town presence (`hr_town_view`, `hr_town_here`, `hr_town_move`, `hr_town_refresh`: 8% of all database time, owned by 25's `town`).

**Played:** a brand-new account on the local world, headless (`node tools/balance-program/platform-play.mjs`: sign-up, a hero, two minutes in town pressing nothing, a hunt watched for two minutes, a reload, an hour away), counting every call the page sent. 0 page errors. Sign-up, naming a hero and the first hunt worked as a player would do them. The play cap popup, a ban, a bug report, the GM window and account deletion were NOT played: they are judged from their tables and functions.

---

## One screen

**Verdicts:** KEEP 2 (`accounts`, `access`) · FIX 5 (`settle-engine`, `envelope`, `operations`, `moderation`, `content-tooling`) · BUILD 1 (`account-deletion`: staged, apply before Early Access).

**The answer to "optimized and scalable": not yet, and it is four changes away, not a rewrite.**

1. **The model's cost line was wrong by ten in one direction and five in the other, and both are fixed here.** `measure.mjs cost` assumed 360 settles a hero-hour. Nothing settles at the 10 s cadence: an away hero commits 36 times an hour, a watched one 198 (CITED, and REAL: away days journal 36 to 52 rows a hero-hour). And the journal is not 44 to 48 rows a hunted hero-hour: REAL it is **216** over the last five days (accrue 96, store supplies 61, own supplies 53, pack and return 6). The guard's two fixtures are a Level 10 lone hero and a Level 20 four that use almost no supplies.
2. **The cost of a player is the cost of an open tab, not of a press.** REAL: real accounts journalled 114 settles a hunted hero-hour, so about 48% of every hunted hour ran at the watched cadence, on accounts that press for 10 to 35 minutes a day. A tab left open on a hunting four commits all four seats every 16 s. One such tab-hour costs 91 database-seconds; the same four with the tab closed cost 10. **Watched is nine times away.**
3. **Today's ceiling, from production's own numbers:** 100 accounts with every tab open and every hero hunting use 1.56 of Small's 2 cores (REAL means x the client's cadences), against the load rig's 1.45 (CITED, 11-02). The audit's "110 to 130 accounts online" stands for that worst hour. For the real shape it is about **340 Own-four accounts or 140 Heavy-four accounts a day** before Small passes 70% at the busy hour.
4. **1,000 accounts fit today for money. 10,000 do not fit at any price.** 1,000 Own fours need 5.8 cores (a 2XL, about $410 a month); 10,000 need 58 of the 64 cores the largest plan has, and 10,000 Heavy fours need 142. The journal is outrun at 130 Own-four accounts on the live prune, and at 1,550 on the staged one.
5. **Four changes take a real-shaped account from 177 to about 60 database-seconds a day and its journal from 3,709 rows a day to about 60.** After them 10,000 Own fours fit a 32-core plan (about $1,870 a month, 19 cents an account) with room, and only a server where everyone hunts 24 hours with the tab open needs a second world.

**The cost table** (one account a day; `node tools/balance-program/measure.mjs cost`, REAL production means x the reference players of 01; "journalled" = 48% of hunted hours at the watched cadence, as real accounts did; "attended" = the tab is open only for the attended minutes; cores = mean x 2 for the busy hour (ASSUMED) at 70% busy; plans and prices ASSUMED from Supabase's published list, to be checked before any spend):

| Reference player | Hunted + town hero-hours a day | DB-seconds a day, attended / journalled | Journal rows a day, journalled | 10 accounts | 1,000 accounts: cores, plan | 10,000 accounts: cores, plan | After the four changes: DB-s a day, 1,000 / 10,000 |
|---|---|---|---|---|---|---|---|
| New | 2 + 2 | 11 / 33 | 523 | Small | 1.1, Small ($15) | 11, 4XL ($960) | 14: Small / 2XL ($410) |
| **Own four** | 13.2 + 20 | 61 / **177** | 3,709 | Small | **5.8, 2XL ($410)** | **58, 16XL ($3,730), no room left** | **60: XL ($210) / 8XL ($1,870)** |
| Heavy four | 33.6 + 24 | 149 / 430 | 8,418 | Small | 14, 4XL ($960) | 142, **no single database** | 134: 2XL ($410) / 12XL ($2,800) |
| Premium own four | 13.2 + 20 | 61 / 177 | 3,709 | Small | as Own four | as Own four | as Own four (stamina does not bind, REAL) |
| Ceiling | 96 + 0 | 405 / 1,181 | 21,445 | Small | 39, 12XL ($2,800) | 391, **no single database** | 334: 4XL ($960) / **no single database (110 cores)** |
| Buyer | 33.6 + 0 | 132 / 414 | 7,506 | Small | 14, 4XL ($960) | 137, **no single database** | 121: 2XL / 12XL |
| Four friends (an account of one hero) | 3.3 + 3 | 24 / 55 | 851 | Small | 1.8, Large ($110) | 18, 8XL ($1,870) | 23: Small / 2XL. Per HERO it is the dearest seat: four people's tabs keep one instance at the watched cadence |
| A mixed server (ASSUMED: 25% New, 55% Own, 15% Heavy, 5% Ceiling) | | 229 journalled | 4,506 | Small, about $30 a month all in | 7.6, 2XL: about **$515 a month all in, 52 cents an account** | 76 cores: **does not fit** | 73: XL, about **$270 a month** / 8XL, about **$2,400 a month, 24 cents an account** |

"All in" adds, at 1,000 mixed accounts today: the Pro plan $25 less its $10 compute credit, the journal's 253 GB kept for 90 days ($31), edge calls ($20), Realtime frames ($15) and egress ($25). All ASSUMED from list prices; none of it is the wall. The wall is database CPU and the journal.

**Every system whose cost does not scale** (detail in section 4 and 5):

| System | Why it does not scale | Cost today (REAL) | The fix |
|---|---|---|---|
| The watched settle (`settle-engine`) | commits the whole character of every seat every 16 s for as long as a tab is open | 9 times an away hero; half of real hunted hours | Confirm in the edge, commit at the 90 s flush (change 2) |
| The journal (`purse-ledger`, 24) | a row a settle a hero, plus a row a supply kind a settle: rows follow the cadence, not the value | 216 rows a hunted hero-hour, 38 a town hero-hour; 309 MB of a 460 MB database | One row an hour a hero an activity (change 3) |
| The whole-state read (`envelope`) | `hr_state_of` rebuilds 51 sections at 48 ms, `hr_load` 109 ms, on every watched poll, press and off-screen poll | 15% of all database time | Delta envelopes (change 4); the 60 s poll goes (staged) |
| Town presence (`town`, 25) | every town tab reads `hr_town_view` and `hr_town_here` every 2 to 6 s; a refresh every 25 s whoever is there | 8% of all database time, to draw other players in a town that held none; one parked town tab costs as much as half a four to three fours hunting away | Push a town instance's changes on its Realtime topic; fall to the 20 s keepalive when nobody else is in the instance |
| Global chat (`chat`, 25) | one topic for everyone: lines x listeners, billed a delivery | nothing at 10 | Chat worlds of at most 250 listeners (section 5) |
| The leaderboards refresh (`operations`) | rebuilds every board every 5 minutes: 185 ms and 110 KB of WAL with 22 heroes | 2.8% of database time, 5% of WAL | Refresh a board when it is read and older than 5 minutes; UNMEASURED at 4,000 heroes, a phase-4 load row |
| The market read on every load (`hr_market_mine`) | 76 ms on every load and reload of every hero, for a market with three sales ever (MEASURED: on load, not on a timer) | 1.4% of database time; it grows with visits | A version in the heartbeat; read when the Market opens |
| Our dashboards on production (`operations`) | ten statements of 150 to 1,040 ms that scan the journal, run about 1,150 times | 7.5% of database time; they grow with the journal, not with players | Read the roll-up tables; the second-monitor board polls no faster than 5 minutes |
| The tick's fan-out (`settle-engine`) | 128 instances a fire: 1,400 due hunts took 110 s of a 100 s window (CITED) | fine at 10 | Packing by heroes: 3 fires (staged, MEASURED by lane/c-server-cost). Then shards and the pool, section 2 |
| Edge CPU against content (`settle-engine`) | engine time a simulated hour grows about 1.9 times from the Thicket to Krell's Hold and the Catacombs; the guard measures Level 10 and 20 only | one Level 70 four alone has read 99.3% of the 800 ms body budget (REAL, 7 minutes of 643) | A Krell Deadly four and a Tower climb as fixtures; pack bodies by measured engine time, not by head count |

**The five changes that matter most** (change rows in section 10):

1. **Land lane/c-server-cost** (staged, built, measured): the 60 s off-screen `hr_load` is gone (it is 22% of an open tab's cost), one read a settle (statements 5 and 8 to 4 and 4), the tick packs by heroes (1,400 hunts in 3 fires, was 11), the prune runs every 5 minutes (480,000 to 5,760,000 rows a day), three dead client-writable tables closed, mid-hunt levers wait out the seed horizon.
2. **Confirm in the edge, commit at the flush.** A watched hunt keeps its 16 s confirm (RULED 11-10: no frozen fight, no slower Leave) and stops writing the character 198 times an hour. The edge already holds the engine and the last committed state; it answers the viewer from them and the database commits on the 90 s flush, and at once on anything that matters (a death, a Level, a Leave, the hunt's end, a rare drop). Watched cost falls to away cost: the single largest cut: about 2 times on a real account on top of the staged lane, 5 times on the worst hour.
3. **The hourly journal.** One `player_ledger` row a hero an hour an activity (hunting, supplies bought, supplies used, gathering, a bench), closed at the hunt's end. 216 rows a hunted hero-hour become about 3; the journal at 1,000 mixed accounts goes from 253 GB kept to about 4. Every audit and day cap that reads the journal keeps its sums. This is the audit's row 7, second half, and 24's "one scale debt".
4. **Delta envelopes and frames** (audit row 9): a poll that changed nothing returns a version, a settle returns the sections it moved. `hr_state_of` at 48 ms and frames of 20 to 50 KB are the cost of every watched poll; frames are also 15% of all WAL through their prune alone.
5. **Town presence and the polls nobody uses.** Town positions by push, the friends poll and the market read folded into one heartbeat version, the leaderboards refreshed on read. Together 12% of today's database time, and the part of it that grows with open tabs.

**Tyler rules on** is the last section of this summary's file: section 11.

---

## 1. The cost model (question 1)

### What production spent (REAL)

38,171 seconds of statement time in 20.1 days: 2.2% of one core on average, 13.2% of the two at the busiest minute, with at most two fours hunting. 9.09 million statements, 12.66 GB of WAL (0.63 GB a day). The database is 460 MB, of which `player_ledger` is 309 MB.

| Where the database time went | Seconds | Share | Scales with |
|---|---|---|---|
| Hunt and town settles: `hr_hunt_apply_instance` (197 ms a call, 111 KB of WAL), `hr_tick_settle` (19 ms), the instance read (19 ms), `hr_perks_of` (1.8 ms x 175,837) | 10,330 | 27% | settles: hunting heroes x cadence |
| Cron, whoever plays: the tick driver 4,673, alert relay 2,258, enrol 1,518, leaderboards 1,070, party sweep 766, live events 473, town refresh 466, slot health 350, market expire 297, frame prune 177, capacity 119, the rest | 12,350 | 32% | nothing (614 s a day; the leaderboards and the frame prune grow) |
| State for open tabs: `hr_state_of` 3,272 (48 ms), `hr_load` 1,695 (109 ms), `hr_accrue_read` 893 (20 ms) | 5,860 | 15% | open tabs |
| Town presence: `hr_town_view` 1,261 (168,406 calls), `hr_town_here` 1,249 (268,800 calls), `hr_town_move` 145 | 2,655 | 7% | open tabs in town |
| Our own dashboards, vitals and audits | 2,880 | 7.5% | the journal's size |
| Presses (`hr_apply` 59 ms x 16,008) | 943 | 2.5% | presses |
| `hr_access_check` (677,853 calls, 0.85 ms), social poll and chat 672, `hr_market_mine` 528 | 1,780 | 4.7% | open tabs |

Half of today's database time is spent on things no player asked for: cron, our dashboards, town presence and the market poll. At 1,000 accounts the cron and dashboard share vanishes and the per-tab polls do not.

### What a hero-hour costs

| A hero-hour of | Settles | Statements (today / staged) | Row writes | WAL | Journal rows | Database time | Edge engine time | Label |
|---|---|---|---|---|---|---|---|---|
| hunting away, lone | 36 | 180 / 144 | 1,008 | 0.47 MB on the replay; about 3 times that on production | 48 fixture, 216 REAL | 2.5 s | 24 ms a settle, p95 104 | MEASURED (`tests/per-player-cost.baseline.json`, the audit's probe); time REAL |
| hunting away, in a four | 36 for the four | 72 / 36 | 927 | 0.32 MB replay | 44 fixture, 216 REAL | 2.5 s | 43 ms a settle for the four, p95 120 | as above |
| hunting watched (its own tab, or any seat of its four viewed) | 198 | 396 to 990 / 198 to 792 | 5,100 to 5,500 | 1.7 to 2.6 MB replay | about 390 (rows follow settles) | 13.9 s | as above, 5.5 times as often | CITED cadence x MEASURED settle; time REAL |
| gathering or a bench | 37 | not measured: no town fixture | not measured | 6 KB a settle (REAL: `hr_tick_settle` 1.05 GB / 169,679) | 36 to 40 REAL | 0.7 s | not measured | REAL |
| idle in town, tab closed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | READ |

And a tab, whatever its heroes do (REAL means x the client's cadences in `src/session/config.js`, `src/data/town-presence.js`):

| An open tab, an hour | Calls | Database time | Label |
|---|---|---|---|
| Watching a hunt: 225 settle asks, each answered with the state | 225 | 15.1 s (state 10.7, accrue read 4.4) | REAL x READ |
| Its three off-screen heroes: `hr_load` every 60 s each | 180 | 19.6 s (gone in lane/c-server-cost) | REAL x READ |
| Standing in town: `hr_town_view` every 2 to 6 s, `hr_town_here` while it moves | 540 standing still alone (MEASURED) to about 4,500 in a busy instance | 4 to 27 s | REAL x READ |
| Social poll every 30 s, online stamp, the market read on load | about 130 | 1.5 s | REAL |
| MEASURED on the local world, a new lone hero: in town pressing nothing | 660 (`hr_town_view` 540, `hr_social_poll` 120) | not timed locally | `platform-play.mjs` |
| MEASURED: watching a hunt | 390 (270 settle asks of 25.6 KB each, 120 social polls): 6.9 MB an hour down the wire, 150 journal rows an hour | not timed locally | `platform-play.mjs` |
| MEASURED: a first load / a reload | 12 calls and 28 KB / 8 calls and 43 KB (`hr_load` is 26 to 32 KB for a hero that owns nothing) | | `platform-play.mjs` |

So: **a four hunting with the tab closed costs 10 database-seconds an hour. The same four with the tab open costs 91** (55.6 of settles, 15.1 of reads, 19.6 of off-screen polls, 1.5 of polls). **A hero parked in town with the tab open costs 4 to 27 without doing anything.** The reference players' attended minutes (10 to 35 a day) are counted from presses; the journal says the tabs stay open far longer. Both columns are in the table at the top, and the journalled one is the one to budget.

### The bill

Compute is the bill. Named plans (ASSUMED: Supabase's published compute add-ons as last read; Small and Medium are shared, burstable cores, so a database that is busy all day needs Large or more):

| Plan | Cores | USD a month | Holds today, journalled shape (Own four / Heavy four / mixed) | Holds after the four changes |
|---|---|---|---|---|
| Small (today) | 2 shared | 15 | 340 / 140 / 260 accounts | 1,000 / 450 / 830 |
| Large | 2 dedicated | 110 | as Small, sustained | as Small, sustained |
| XL | 4 | 210 | 680 / 280 / 530 | 2,000 / 900 / 1,650 |
| 2XL | 8 | 410 | 1,370 / 560 / 1,060 | 4,000 / 1,800 / 3,300 |
| 4XL | 16 | 960 | 2,700 / 1,100 / 2,100 | 8,000 / 3,600 / 6,600 |
| 8XL | 32 | 1,870 | 5,500 / 2,250 / 4,200 | 16,000 / 7,200 / 13,000 |
| 16XL | 64 | 3,730 | 10,900 / 4,500 / 8,400 | 32,000 / 14,000 / 26,000 |

(accounts = cores x 0.7 x 86,400 / 2 / DB-seconds a day; the 2 is the ASSUMED busy hour.) The other lines at 1,000 and 10,000 mixed accounts: edge calls about $20 and $240, Realtime frames $15 and $260, egress $25 and $450, journal disk $31 and $315 today (under $5 after change 3). PITR is $100 a month and RULED no (11-19); see section 11.

**"Online" in the brief.** 01 defines 1,000 online as 4,000 hunting heroes. That is the worst hour, every tab open and every hero hunting: 15.6 busy cores at 1,000 today (an 8XL), 156 at 10,000 (nothing holds it); after the changes 5 and 50. Real accounts are online, by the journal, 1.6 to 4 hours a day, so 1,000 real accounts are 70 to 170 open tabs at a time.

---

## 2. From 130 to 1,000 to 10,000 (question 2)

The ten audit rows, in the order they buy capacity, with what this dive adds:

| Step | Change | State | Buys | Evidence |
|---|---|---|---|---|
| 1 | Drop the 60 s off-screen `hr_load` (audit 5) | staged, lane/c-server-cost | x1.22 on a real account (177 to 145 DB-s a day); x1.27 on the worst hour | REAL: `hr_load` 109 ms x 180 an hour a tab |
| 2 | Pack tick bodies by heroes, free deferred leases (audit 6) | staged | tick ceiling 1,280 to 5,120 away heroes a window; lone hunts 4 times | MEASURED by the lane: 1,400 due hunts in 3 fires, was 11 |
| 3 | One read a settle (audit 10, first half) | staged | round trips 20 and 32 to 16; the pool, not the CPU | MEASURED: 5 and 8 statements to 4 and 4 |
| 4 | Prune every 5 minutes (audit 7, first half) | staged | the journal holds to 1,550 Own-four accounts, was 130 | REAL rows x the lane's 5.76M a day |
| 5 | **Confirm in the edge, commit at the flush** (new; the strong form of audit 10) | PROPOSED | x2 on a real account (145 to about 73); x5 on the worst hour | REAL: 48% of hunted hours at 198 commits against 36 |
| 6 | **The hourly journal** (audit 7, second half) | PROPOSED; `player_ledger_rollup` exists and is off | journal rows x60 down; WAL of a settle down by its largest insert | REAL: 216 rows a hunted hero-hour, 645 B the accrue row |
| 7 | Delta envelopes and frames (audit 9) | PROPOSED | the 15.1 s of reads a watched tab-hour to about 4 (ASSUMED 4x); frames out of the WAL | REAL: `hr_state_of` 48 ms; the frame prune alone wrote 1.89 GB of WAL, 15% of all |
| 8 | Town presence by push; polls folded into one heartbeat (new) | PROPOSED | the 4 to 27 s a town tab-hour to under 1 | REAL: 2,655 s, 437,206 calls |
| 9 | Capacity sample and alarms (audit 4) | LIVE since today (753 samples) | nothing; it is how we see the walls | REAL: it already read edge 99.3% and journal 32% of the prune with one four hunting |
| 10 | Nightly real-concurrency gate (audit 8) | open | nothing; it is how step 5 is proved safe | CITED: the rig last ran 11-02 |
| 11 | Close three dead client-writable tables; defer mid-hunt levers (audit 1, 3) | staged | nothing; exploit surface | section 7 |
| 12 | PITR and the restore drill (audit 2) | RULED no (11-19); the drill is scripted, not run | nothing; data safety | section 11 |

**130 to 1,000:** steps 1 to 4 are built and waiting to land. With them and nothing else, 1,000 real-shaped accounts need about 5 cores (a 2XL, $410 a month). With step 5 an XL ($210) holds them. So 1,000 is reachable two ways: pay about $400 a month, or build step 5 and pay about $200. Step 6 is needed either way before 1,550 accounts.

**1,000 to 10,000:** steps 5, 6 and 7 are required, not optional. Without them 10,000 mixed accounts need 76 cores and write 45 million journal rows a day (2.5 TB kept). With them it is one 32-core database with half its room free.

**The shard story.** One database is one writer; Supabase has no bigger box than 64 cores. Three levels, in order:

1. **Tick shards (built, dial at 1).** `hr_tick_shard_of` and `hr_tick_shard_cursor` exist; `shards: 1`. After packing, one fire leases 32 bodies of up to 16 heroes: 5,120 away heroes in fours a 100 s window. 1,000 accounts with every hero hunting is 4,000: 78% of the dial. Raise `hunt_bodies_max` to 64 and the ceiling is 10,240, if the engine's pool (15 connections, ASSUMED) is raised with the plan. At 10,000 accounts in the real shape (5,500 to 14,000 heroes hunting at once) run 4 shards, each its own cron fire. This is dials and a pool size, proved by step 10's gate, not new code.
2. **Bodies sized by engine time.** A body is cut at 16 heroes because a Level 10 hunt uses 33 to 65 ms of the 800 ms budget (CITED). Engine time a simulated hour is about 1.9 times that at Krell's Hold and the Catacombs (MEASURED, wall time of `measure.mjs ref --at thicket` 4.9 s against `--at hold` 8.6 s and `--at catacombs` 9.2 s, three seats, two seeds, this PC), and production has already seen one four fill a body (REAL: edge 99.3%, seven minutes over half; most likely a catch-up window after the day's deploy, UNVERIFIED). A deferred hunt is safe (its lease is freed and re-offered), but at the top of the game a body holds 4 to 8 heroes, not 16. Pack by the last measured engine time of each instance. **Every balance change that puts more monsters in a pull or more seats in a fight raises this cost**: the combat dive's density and pull-size changes carry an edge price, and `tests/per-player-cost.mjs` cannot see it until it has a Krell Deadly four and a Tower climb as fixtures.
3. **Worlds.** Past one 64-core database the answer is a second database: a world of about 10,000 to 25,000 accounts with its own hunts, town, market and boards, and one account, wallet and Crowns layer above them. Nothing in the game needs it before roughly 25,000 real-shaped accounts after the four changes. It is a product decision as much as a platform one (section 11).

---

## 3. The budget every system is held to (question 3)

01 section 7 proposed: no new statement on the settle path, at most 1 ledger row and 1 row write a hero-hour, no poll, nothing players x players. **Confirmed, with the units corrected and three lines added.** `measure.mjs cost` printed the row-write allowance "a settle" (360 times looser than 01's words) and multiplied by a cadence that does not exist; both are fixed, and it now prints the table at the top of this file.

| Line | Allowance, a hero that uses the system | Why this size (evidence) |
|---|---|---|
| Statements on the settle path | 0 | A settle is 4 statements after the staged lane; one more is +25% round trips for every hunting hero, paid 36 to 198 times an hour |
| Journal rows | 1 a hero-hour, never one a settle or a kill | Today's 216 is the debt; +1 is +0.5% now and +33% after change 3, so after change 3 a new row an hour needs a reason |
| Row writes | 1 a hero-hour outside the settle's own tables | A settle writes 28 rows a lone hero, 25 a seat of a four (MEASURED) |
| Polls | 0. Nothing asks on a timer; a version rides the existing heartbeat and the list is read when it moves | `hr_town_view`, `hr_town_here`, `hr_social_poll`, and `hr_market_mine` on every load: 3,700 s REAL for features with no second player |
| **New:** state sections | A new section of `hr_state_of` is read on open, or versioned. It never rides every watched poll unhashed | 51 sections, 48 ms a read, 225 reads a watched hour |
| **New:** cron | No job under a minute, and none whose work grows with accounts (a refresh of everything, a sweep of everyone) | 27 jobs, 614 s a day; the leaderboards rebuild is the one that grows |
| **New:** engine time | A change to what a settle simulates states its engine-ms a window at Krell on Deadly; a body's 800 ms is shared by 16 heroes | section 2, level 2 |
| Players x players | Nothing. A board, a town, a roster or a chat room is cut into rooms of a fixed size | the town's instance cap of 60 players is the pattern; Global chat has none |

`node tools/balance-program/measure.mjs cost --add statements=0,ledger=1,writes=1,polls=0 --share 0.5` prints a system's addition against these lines and against each reference account; `--after` prices it on the staged lane.

**How the finished dives' answers land on it** (their requirement 6, collected):

| Dive | System | Its answer | Verdict here |
|---|---|---|---|
| 22 | `tower`, `catacombs` | settles as a hunt; UNMEASURED, no fixture; the end card reads a Rank that may count rows | Add a Tower fixture (it is the longest window and the largest pull). The Rank: one row a hero on a board, never a count a read |
| 22 | `hearth-chest`, `boss-halls`, `scaled-hunts` | a row an open, a row a hero a day, a row a hero a ground | Inside. `chest_opens` is append-only: 2.5M rows a year at 4,000 heroes, add it to the prune list (section 6) |
| 22 | old dungeons | carried by every replay and in the edge bundle for nothing | CUT is RULED (11-20); the bundle shrinks |
| 24 | `purse-ledger` | 44 to 48 rows a hero-hour, outrun at 560 daily heroes | Worse: 216 REAL, outrun at 130 Own-four accounts. Change 3 |
| 24 | `market` | `hr_market_browse` a page, two crons; the browse is the hot read at 10,000 | Inside on writes. `hr_market_mine` is read on every load at 76 ms: over the allowance today. `hr_market_expire(200)` every 5 minutes clears 57,600 listings a day: outrun at 10,000 accounts with 50 listings each unless a listing lasts 9 days or more |
| 24 | `hero-slots` | each hero is a full hunting hero | Correct, and the slot price is the one economic brake on server cost. Tyler's "hero slots should cost even more" (11-20) is also the cheapest capacity decision in this file |
| 24 | `stamina-refill`, Premium's bar | what they cost is the hunted hours they buy | A refill's four hours cost 10 DB-seconds away and 56 watched: under a tenth of a cent. Sell them freely |
| 25 | `party` | a four is cheaper a head than four lone heroes | Confirmed: 36 statements a hero-hour against 144. But four PEOPLE in one party are four tabs holding one instance at the watched cadence: after change 2 that stops mattering |
| 25 | `chat` | lines x listeners on Global | The first social thing that breaks, on the bill and not the CPU (section 5) |
| 25 | `friends` | `hr_social_state` every 30 s for everyone | REAL: the poll is `hr_social_poll`, 93,982 calls, and it WRITES (72 MB of WAL: the online stamp). Over the allowance. One heartbeat, one version |
| 25 | `town` | 600 to 1,800 reads a viewed hour, a refresh every 25 s | REAL: 8% of all database time. Over the allowance. And 25's open question: unanswered here too, UNVERIFIED whether heroes of signed-out accounts are drawn at their stations |
| 25 | clans, castle, works | a row a deposit, read on open, no cron | Inside. `clan_ledger` has no prune: section 6 |
| 25 | `factions` | `hr_faction_credit` runs in the settle: is it a new statement? | It runs inside `hr_hunt_apply_instance` (no new round trip, READ FROM DATA: the settle is 4 statements on the staged lane with factions armed in the chain). Its rows are in the 28 a settle. Inside |
| 26 | `training` | a session is a hunt session: 48 journal rows and 1,008 row writes an hour to pay a constant | Over the allowance, and idle hero time is 3.7 times hunted time. **Closed form**: pay at start, at each paid hour and at stop; no settle. Before the yard is made worth using |
| 26 | `house`, `storage`, `farm`, `curing` | sections ride the state read; a press is a row | Inside on writes. The five Home sections are part of the 48 ms: change 4 versions them |

---

## 4. What everyone pays, whether or not they use it (question 4)

| Thing | Runs | Cost (REAL unless said) | What it buys | Verdict |
|---|---|---|---|---|
| The tick driver `hr-tick-run` | every 10 s | 27 ms a fire, 233 s a day, 349 MB of WAL in 20 days | every browser-closed hunt | KEEP. 20 ms with nothing due (MEASURED on the replay): let it return before it writes its log row when nothing is due |
| `hr-alert-relay` | every minute | 91 ms a run, 112 s a day | the Discord alarm | FIX: 91 ms to look for nothing. Read only what changed since the last run |
| `hr-ops-capacity` | every minute | 158 ms a run (its own header estimated under 20 ms) | the four walls | KEEP, and fix the 8x: it sums `pg_stat_statements` every minute |
| `hr-tick-enrol` | every minute | 52 ms, 76 s a day | town work on the tick | KEEP |
| `hearthrise-leaderboards` | every 5 minutes | 185 ms and 110 KB of WAL a run with 22 heroes | boards nobody opened 1,235 times in 20 days | FIX: refresh on read when older than 5 minutes |
| `hr-hunt-party-sweep`, `hr-hunt-after`, `hr-live-events-announce`, `hr-slot-health`, `hr-market-expire`, `hr-party-reap` | 1 to 10 minutes | 16 to 60 ms each, 95 s a day together | ends, plans, events, health | KEEP |
| `hr-town-refresh` | every 25 s | 6.7 ms, 23 s a day | the town snapshot | FIX with town presence: skip when no instance holds two accounts |
| `hr-realtime-frame-prune` | every 10 minutes | 61 ms, and 652 KB of WAL a run: 1.89 GB, **15% of all WAL** | deleting frames already delivered | FIX: frames should not be rows that are written and then deleted (change 4) |
| Fourteen prune and health jobs | hourly or daily | under 10 s a day together | bounded tables | KEEP |
| The off-screen `hr_load` | every 60 s a hero not viewed | 109 ms: 19.6 s a tab-hour, 22% of an open tab | the strip learns a hunt ended within a minute | CUT (staged): its frames are its feed |
| The watched settle ask | every 16 s a viewed hunt | 225 an hour, each a commit of every seat and a 48 ms state read | the fight on screen is the server's | FIX: change 2 |
| `hr_town_view`, `hr_town_here`, `hr_town_move` | 2 to 6 s, 20 s, on a step | 4 to 27 s a town tab-hour | other players' bodies | FIX: push, and nothing when alone |
| `hr_social_poll` | every 30 s (55 s hidden) | 5.3 ms and a write each: 0.6 s a tab-hour, 72 MB of WAL | the online dot, with one friend link in the game | FIX: one heartbeat |
| `hr_market_mine` | on every load and reload (`src/shell/market-watch.js`; MEASURED, not on a timer) | 76 ms a call, 528 s | "your listing sold", three sales ever | FIX: a version in the heartbeat |
| `hr_access_check` | every REST call | 0.85 ms x 677,853 | the closed game's door | KEEP while closed; at Early Access the door is open and the check goes |
| `hr_put_client_state` | 1.5 s after a display change | 5.4 ms, **21 KB of WAL a call**, 274 MB | window positions and preferences | FIX: it rewrites the whole residue blob; write the changed key |
| The 51 sections of `hr_state_of` | every state read | 48 ms | one truth | FIX: change 4 |
| A tab that does nothing at all | always | MEASURED: 660 calls an hour from a new hero standing in town alone (540 `hr_town_view`, 120 `hr_social_poll`), about 4.7 database-seconds an hour at production means, half of what a four costs hunting away | nothing: there is nobody to see and no friend to hear from | the two fixes above take it to about 180 heartbeats an hour |

---

## 5. The dark systems when they turn on (question 5)

No real load exists for any of these (10-real-players section 6). In the order they break:

1. **Global chat, on the bill.** One Realtime topic for everyone. Supabase bills a broadcast a delivery (ASSUMED from its published terms: $2.50 a million past the first 5 million, and $10 a 1,000 peak connections past 500). 1,000 listeners and 10 lines a minute is 14.4 million deliveries a day: about $1,080 a month. 10,000 listeners at 30 lines a minute is over $30,000 a month. And nobody can read 30 lines a minute. **Chat worlds:** Global is cut into rooms of at most 250 listeners (by language, then by fill), exactly as the town is cut into instances of 60. A room of 250 at 10 lines a minute is $270 a month a room that is always full. Trade and system lines go to their own tab, and a system line (a rare drop, a Level 200) is batched to one a minute a room.
2. **The town at 1,000 in one place, on CPU.** The town already has the right shape: instances of 60 players, 120 bodies drawn (`TOWN_INSTANCE`, READ). What does not scale is the read: every viewer polls every 2 s while anything moves, and in a full instance something always moves. 1,000 viewers x 1,800 reads an hour x 7.5 ms (it will be more with 120 bodies in the answer) is 3.75 cores for the view alone, more than their hunts. Push each instance's moves on its own topic at 1 to 2 a second, 60 listeners a room.
3. **The leaderboards**, if the refresh is a full rebuild at 40,000 heroes (UNMEASURED: 185 ms at 22 heroes).
4. **The market at depth.** Browse is server-paged and fine. The expire job clears 200 listings every 5 minutes; `hr_market_mine` is read on every load. Both are small fixes that must precede the opening, not follow it.
5. **Clans.** 60 members read a roster of 60 on open: bounded, as 25 designed it. The clan chat tab takes the fifth and last Realtime topic a client holds: the next social tab has nowhere to go. Raise the cap or multiplex one topic.
6. **Town Works with every account donating.** One totals row a project is written by every donation: a hot row. At 10,000 accounts donating in the same minute the updates queue on one lock; each is under a millisecond, so it holds, but the row should be a bucket a day a project, summed on read. Low risk; do it with the build.
7. **Clan castle siege, a boss everyone hits, a world event.** Not designed. Anything where N players write one row a second is refused by the allowance until it is cut into rooms.

Nothing here breaks at 10. At 10 the cost is the opposite: polls and refreshes for rooms with nobody in them.

---

## 6. Tables that only grow (question 6)

Growth a month at 1,000 mixed accounts (4,506 journal rows an account a day, REAL rates x the mix), today and after change 3.

| Table | Grows by | A month at 1,000 accounts | Prune today | Verdict |
|---|---|---|---|---|
| `player_ledger` | a row a settle a hero, a row a supply kind a settle, a row a press | 135 million rows, 84 GB; 405 million and 253 GB kept | 90 days kept; 480,000 rows a day live (outrun at 130 Own-four accounts), 5.76 million staged | Change 3: about 2 million rows a month. Until then the staged prune, and the dashboards stop scanning it |
| `realtime.messages` (frames) | a frame a watched settle, 20 to 50 KB | 10 million rows written and deleted | daily partitions and `hr-realtime-frame-prune` | Change 4. Today it is 15% of all WAL to delete what was already sent |
| `hr_tick_cron_log` | a row a fire | 259,200 rows whatever the players; 29 MB now | 7 days | KEEP; write no row when nothing was due |
| `cron.job_run_details` | a row a job run | 1.9 million rows; 22 MB and 62,158 rows now | none found | **BUILD: a daily prune to 7 days.** It grows whoever plays |
| `player_intents` | a row a press and a settle | 38 to 40 a hero-hour (MEASURED): 60 million a month | hourly | KEEP; it follows the settle count, so change 2 cuts it five times |
| `hunt_sessions`, `hunt_session_tally`, `hunt_session_events`, `hunt_instances` | a row a hunt | 339 sessions kept today | pruned | KEEP. 10-real-players lost the tier on 71% of hunt hours to this prune: keep a one-row summary a session for 90 days |
| `game_events` | old client | 1.6 million rows in four days once (CITED) | 7 days | The table has no caller in `src/` and is still client-writable: closed by the staged 1003 |
| `chat_messages`, `chat_whispers` | a row a line | 10 lines a minute a room: 432,000 a month a room | 60 and 30 days | KEEP |
| `market_sales`, `market_item_daily` | a row a sale; a row an item a day | bounded by the day caps | `hr-market-sales-prune` daily | KEEP |
| Run boards (`tower_runs`, the mode boards) | a row a run | 1 to 3 a hero a day: 300,000 a month | none found | Keep a hero's best and last 20; fold the rest weekly |
| `chest_opens` | a row an open, immutable | 12 a hero a week: 190,000 a month | none, by design | Fold past 90 days into a count a hero a tier |
| `clan_ledger`, `hr_faction_ledger` | a row a deposit, a credit | dark | none | 25's fold: weekly totals past 90 days; a row a hero a day for factions |
| `hr_gm_log`, `beta_signup_log`, `bug_reports`, `hr_wipe_log` | by hand | small | none, by design (immutable) | KEEP |
| `hr_world_notices`, `maintenance_log`, `hr_db_samples`, `capacity_samples` | a row a notice, a sample | bounded | pruned or 14 days | KEEP |

---

## 7. The exploit surface, for the one pre-Early-Access Security review (question 7)

Every OPEN item of requirement 9 in the four finished dives, the audit's two, and this dive's, by the function a reviewer opens. Combat, items and retention add theirs when they land.

| # | RPC or surface | The hole | From | State |
|---|---|---|---|---|
| 1 | `game_events`, `clan_members`, `session_claims` (table grants) | client-writable shared tables with no caller | audit row 1 | staged: 1003 |
| 2 | `hr_action_set_options`, `hr_hunt_preset_apply`, `hr_blessing_buy` | the client holds 32 s of combat seeds: buy a Blessing or swap a bar only when a death is coming | audit row 3 | staged: 1005 |
| 3 | the Hearth Chest open (`2027-04-27-tower-chest.sql`) | a hero that never climbed opens keys passed through Storage: 18 more opens a week from three bought slots | 22 | OPEN, ruled direction in 22 #5 |
| 4 | Tower start and settle | die and retry on the top landing for XP at Levels 10 to 30; a real climb ended by `value_over` refusals, unexplained | 22 | OPEN, Systems |
| 5 | `scaled_hunt_buy` | gold for faster Levels through the Warrens until the fit lands; an hour whose rare rows fall faster sits beside "buying more rare drops" | 22 | OPEN, legal list |
| 6 | `hr_market_list`, `hr_market_buy` | the day caps (50 listings, 2M spent) sit under item prices: a piece over 2M can never be bought; gold moved to an alt through junk at the price floor is held by day caps only | 24 | OPEN |
| 7 | the Crowns book | a second escrow and a second set of caps: reviewed as its own surface | 24 | not built |
| 8 | `hr_chat_send` | gold sellers at 1,000: needs report-from-menu and a new-account rate | 25 | OPEN |
| 9 | `clan_work_labour` | labour ticks are client-sent | 25 | OPEN until the server counts hunted minutes |
| 10 | the castle's contributor gate | three alts with one Rat Tail each pass tier 2 | 25 | OPEN: a contributor counts with 5% of the bundle and a Level 20 hero |
| 11 | clan leadership | no succession; a leader can kick everyone when the castle is done | 25 | OPEN |
| 12 | `hr_unlock_buy` (rooms, properties) | owned as the account's highest over its heroes, filed on the hero that paid: a single-hero delete must leave the rows with the account | 26 | OPEN at account deletion |
| 13 | mounts (Trophy room rebuild), curing | a mount must not duplicate an item; a cancelled cure returns materials, never the fee | 26 | OPEN at build |
| 14 | the play cap (`hr_play_claim`, `hr_play_net_hash`) | four heroes an account and four a hashed network. One account a player is RULED (10-17) and enforced only by the network count: a second account on a second network (a phone's data) is free. Every alt-fed item above leans on it | this dive | OPEN: decide whether the rule is enforced or only declared (section 11) |
| 15 | change 2, if built | the edge answers a viewer from uncommitted state: nothing a purchase, a gate or another player can read may come from it, and a commit must replay the same seeds | this dive | a design condition, and the reason step 10's concurrency gate comes first |
| 16 | `hr_put_client_state` | 21 KB of WAL a call at a 1.5 s debounce: a script can write 40 a minute. Bounded by `hr_rate_gate`? UNVERIFIED | this dive | check the rate line |
| 17 | `hr_gm_grant_gold`, `_item`, `_level` | faucets, walled to GM accounts | inventory | review the wall; `hr_gm_log` is immutable |
| 18 | `bug_report_submit` and the bridge | an unauthenticated-adjacent write with free text | this dive | bounds exist (`bounds.js`); in the review's list |
| 19 | account deletion (`2027-05-08-account-delete.sql`) | deletes from `auth.users`; a held name, a clan it leads, a market escrow, rooms filed on a hero | this dive, 26 | staged; on the list by its own note |

---

## 8. Content tooling as throughput (question 8)

One ground has been timed: Hask's Ford, 9 h 13 on the clock, of which 4 h 13 was work and 5 h a pause; two hours to a working ground, the rest loot, coin and curve re-fits, catalogue re-issues and guards that named grounds by id (CITED, memory `scalable-grounds`). The ground pack (lane/b-ground-pack) was built against that list with a target of three working hours. **No ground has been timed since the pack landed**, so every number below is ASSUMED from that one sample and labelled so.

| Unit | Hours to make (ASSUMED) | What it is made of | Where the tooling is missing |
|---|---|---|---|
| A ground with the pack | 3 to 4 | map, four creature rows, drops, pockets, tiers, art signature pieces | A timed run. The Slake and the grounds after it were built; nobody wrote the hours down |
| A region of six grounds | 25 to 35, plus one art kit (8 to 12) | six grounds, a shared kit, names and lore that connect | The region kit as a tool: today each ground brings its art by hand. A region grade: `pack.mjs check` grades one ground, nothing grades six for a smooth curve between them |
| A Tower band (25 floors) | 4 to 6 | a row of the floor curve, a landing, key odds | The curve itself: RULED 11-20 to one Levels-per-floor row sized after the combat dive, so a band is a data row once that lands. Today UNMEASURED (01 section 5) |
| A boss hall | 8 to 12 | phases (RULED 11-05), a bar, loot, a call table | `boss-call-table.mjs` exists; a phase editor does not, each boss is hand-built |
| A recipe family (a tier of one bench) | 3 to 5 | recipes, materials, wages, the Shop's prices | `tests/craft-wages.mjs` holds the arithmetic; nothing proposes a family from a tier and a target wage |
| A region, whole | **about 60 to 80 working hours** | six grounds, a kit, a band, a boss, two families, a re-read | The coverage bot plays it; nothing totals what a region costs before it is started |

Against what players use up (REAL pace: the Heavy four reached Level 75 in about 110 hunted hours a hero, 14 days; the Own four Level 50 in 72 hours, 22 days): a region of six grounds is about 30 Levels. Under Level 75 the Heavy four clears 30 Levels in about a week. So below Krell **a region lasts the fastest player a week and costs us two**; past Krell the pace is the combat dive's to state, and until Levels there take three to five times as long, content loses the race. The platform answer is not more tooling alone: the repeatable ends (the Tower, the Catacombs, scaled hunts, tiers on old grounds) are what absorb the Heavy four, and each of those is a data row, not a region. That is for 21 and 27; the tooling gaps above are this dive's.

**Server cost of content:** a ground is rows in catalogues the engine already reads: no new statement, no new section. The one price is engine time (section 2): a ground with eight in a pull costs about twice a ground with four, for every hero that hunts it, forever.

---

## 9. The cards

Thirteen answers each (02). These are requirements more than balance; the cards are short where the answer is "none".

### `settle-engine` [live]: FIX

| # | Answer |
|---|---|
| 1 Purpose | Every hunt outcome, viewed or not, on one engine (RULED 10-18). The player's problem: "my heroes play while I am away, and nobody can cheat." No decision of its own. Plugs into everything |
| 2 First principle | None repeated here. It is what makes away play possible: 116 hunted hero-hours for each hour at the screen (REAL) |
| 3 Ledgers | Server cost: source. Section 1 |
| 4 Budget | Not a lever. Its cost grows with Level through engine time (x1.9 from Level 10 to 105 and 175, MEASURED wall); FORMULA past 175: engine time follows units in a fight x steps, so a Level 400 hunt of the same pull costs what a Level 175 one does |
| 5 Seven players | Top table. The Own four: 177 DB-seconds a day, a hundredth of a cent. The Ceiling with a tab always open is 12 times that. The Four friends are the dearest hero: four tabs on one instance |
| 6 Server cost | 4 statements a settle (staged), 28 row writes a lone hero and 99 a four, 9 to 35 KB of WAL on the replay and 111 KB a call on production, 197 ms REAL for `hr_hunt_apply_instance`. Over its own allowance on the journal (216 rows) and on the watched cadence |
| 7 Population | 10: fine, and half of what it spends is cron for nobody. 1,000: 2XL today, XL after change 2. 10,000: does not fit without changes 2, 3 and 4; then one 32-core database and 4 tick shards |
| 8 Server age | The journal and the frames (section 6). A hero's own rows do not grow with age |
| 9 Exploits | Section 7 rows 2, 4, 15. The seed horizon is the standing one |
| 10 Teaching | Invisible when it works. The one screen that shows it: "still being processed" on a late Leave |
| 11 Throughput | Not content. Its own throughput is the tick: 5,120 away heroes a window after packing |
| 12 Monetization | None. Hero slots, refills and Premium's bar buy more of it; each is priced far above its cost |
| 13 Telemetry | `hr_ops.capacity_samples`: db under 50% at the busy hour (red 70), tick under 60, edge under 60 (red: any deferral for 5 minutes), journal under 50% of the prune. `hunt-health`: settle lag under 32 s. NEW: journal rows a hunted hero-hour, weekly (target 3 after change 3; red over 60) |

Unique and fun: nobody describes a settle to a friend; they describe coming back to four heroes eleven hours richer. Dead moment: none found in this dive's play. Rulings: one engine (10-18) COMPLIES; hunts run with the browser closed (10-18) COMPLIES; 16 seeds ahead and Leave at the next settle (10-20) COMPLIES; "keep the 16 s confirm, make the watched settle cheaper" (11-10) COMPLIES, and change 2 is how the second half is finished.

### `envelope` [live]: FIX

| # | Answer |
|---|---|
| 1 Purpose | One truth the client renders (RULED 09-14). Solves "the browser says X, the server refuses". No decision. Plugs into every window |
| 2 First principle | None. `player_item_rules`, presets and after-hunt plans live in it and are what remember a decision |
| 3 Ledgers | Server cost: source |
| 4 Budget | Not a lever. Its size grows with what a hero owns: `hr_load` is 109 ms on real heroes against 27 to 35 on the rig's (CITED), so it grows with server age |
| 5 Seven players | A reload of four heroes is four `hr_load`. The Heavy four's six visits a day: 24 reads, 2.6 s. The cost is the watched poll, not the visit |
| 6 Server cost | `hr_state_of` 48 ms x 69,029 calls, `hr_load` 109 ms x 15,489, frames 20 to 50 KB, residue writes 21 KB of WAL each. Over the allowance (a section rides every poll) |
| 7 Population | Per account; nothing shared. Survives a crowd; costs in proportion to open tabs |
| 8 Server age | A veteran's envelope is larger (bag, Storage, bestiary, rules): 3 times a new hero's today. Delta envelopes make that free |
| 9 Exploits | Section 7 row 16. Idempotent intents and the replay table are the defence against a retried press; `player_intents` is pruned hourly |
| 10 Teaching | Invisible |
| 11 Throughput | A new feature is a section: the 51 are the count of features that chose to ride the whole read |
| 12 Monetization | None |
| 13 Telemetry | `hr_state_of` mean ms (target under 15 after change 4, red over 60); bytes a frame; refused intents by verb (`vitals --refusals`) |

Rulings: "every actionable number is replaced by each envelope" (09-14) COMPLIES, and a delta envelope must keep it: a section not sent is a section unchanged at a version the client holds, never a merge.

### `accounts` [live]: KEEP

| # | Answer |
|---|---|
| 1 Purpose | One login, up to four heroes at once. The decision it gives is the game's largest: how many heroes to run (24's `hero-slots`) |
| 2 First principle | A reload reopens the heroes the tab had open (`openKey`). Naming a hero is once. None repeated |
| 3 Ledgers | Hunt hours and town hours: a time lever (x4). Server cost: x4 |
| 4 Budget | Time class, capped at four heroes (RULED) |
| 5 Seven players | REAL: 65 profiles, 58 never made a hero. 7 accounts hold all 22 heroes. That is a funnel number for 27, and the loudest one in the database |
| 6 Server cost | `hr_play_claim` on open; a name is a row. Inside |
| 7 Population | Names are first come: at 10,000 the good names are gone in a week. `hr_name_holds` exists; a hold that expires for an account that never made a hero is the fix |
| 8 Server age | 58 dead profiles of 65 already. At a year, dead accounts hold names and rows: account deletion and a purge of never-played profiles |
| 9 Exploits | Section 7 row 14 |
| 10 Teaching | The play cap refusal is a centred popup (RULED 11-01). First contact is the sign-up screen |
| 11 Throughput | None |
| 12 Monetization | Hero slots for gold (RULED more than 300k / 750k / 1.5M, 11-20). Premium is account-wide (RULED 11-20) |
| 13 Telemetry | Profiles that made a hero / profiles (today 11%); heroes an account; play cap refusals a day |

### `access` [live]: KEEP

| # | Answer |
|---|---|
| 1 Purpose | Who may play: closed mode, the allowlist, beta invites, the wipe. The balance program gates the beta (RULED 11-20) |
| 2 to 4 | None |
| 5 Seven players | A New player's first screen. REAL: 58 of 65 profiles never got past it or past hero creation; which of the two is for 27 to read from `beta_signup_log` |
| 6 Server cost | `hr_access_check` on every REST call: 677,853 calls, 576 s. Inside while closed; remove the check when the door opens |
| 7 Population | A beta invite wave is a spike of first loads: 4 `hr_load` an account. 1,000 invites in an hour is 0.1 of a core |
| 8 Server age | The wipe is one-time and staged in order (`hr_wipe_log`) |
| 9 Exploits | Invite codes: `beta_invite_check` is callable before sign-in; rate-limited? UNVERIFIED, on the review list |
| 10 Teaching | The closed page's words are an OPEN CONFLICT in the rulings (10-17), not this dive's to settle |
| 11 to 12 | None |
| 13 Telemetry | Invites claimed / sent; sign-ups that reach a hero |

### `operations` [live]: FIX

| # | Answer |
|---|---|
| 1 Purpose | A server that tells us it is sick. No player decision |
| 2 First principle | Ours, not the player's: the capacity sample replaced a question we asked by hand |
| 3 Ledgers | Server cost: 614 s a day of cron and 144 s a day of our dashboards, whoever plays |
| 4 Budget | None |
| 5 Seven players | None directly. A restore is the only thing here a player would ever feel |
| 6 Server cost | Section 4. Over its own allowance in three places: the leaderboards rebuild, the capacity sample at 158 ms, dashboards that scan the journal at 150 to 1,040 ms |
| 7 Population | Fixed, except the three above |
| 8 Server age | `cron.job_run_details` has no prune (62,158 rows). The dashboards slow with the journal |
| 9 Exploits | `hr_assert_grant_hygiene` nightly is the standing guard. Backups: daily, never restored on production's copy (CITED audit row 2); PITR RULED no |
| 10 to 12 | None |
| 13 Telemetry | The four walls; cron failures (0 in the last day, REAL); time since the last restore drill (never) |

### `moderation` [live]: FIX

| # | Answer |
|---|---|
| 1 Purpose | A world that can be policed: GM tools (RULED 11-05), bans, mutes, bug reports |
| 2 First principle | A player who reports a gold seller types the name by hand: report from the chat line's menu (25) |
| 3 Ledgers | `hr_gm_grant_gold`, `_item`, `_level` are faucets, walled; the gold model lists them |
| 4 Budget | None; a walled account's grants never reach another player |
| 5 Seven players | None until 1,000. Then the New player meets spam before the game |
| 6 Server cost | A row an action. Inside |
| 7 Population | 10: Tyler is the only GM and that is enough. 1,000: one person cannot read Global; mutes need a report queue and an automatic new-account rate. 10,000: volunteers or staff, and tools that do not need SQL |
| 8 Server age | `hr_gm_log` is immutable and small |
| 9 Exploits | Section 7 rows 8, 17, 18 |
| 10 Teaching | A player has no visible way to report another player today |
| 11 to 12 | None |
| 13 Telemetry | Reports a day, time to first action, mutes and bans a week; bug reports a day (72 so far) |

### `account-deletion` [staged]: BUILD (apply before Early Access)

| # | Answer |
|---|---|
| 1 Purpose | A store requirement and a right. LANE DONE, held for three defaults (CITED, master backlog) |
| 2 to 4 | None |
| 5 Seven players | The 58 profiles that never made a hero are the first users |
| 6 Server cost | One cascade a deletion, a purge cron (`hr-account-purge`). Inside |
| 7 Population | A deleted leader of a clan, a seller with goods in escrow, a hero in a party: each needs its rule before 1,000 |
| 8 Server age | It is the only thing that shrinks the per-account tables |
| 9 Exploits | Section 7 rows 12, 19: delete to dodge a ban (the ban must outlive the account: hold the network hash and the name), delete to free a name for a sale |
| 10 Teaching | A button in Settings, a fresh password, a waiting period |
| 11 to 12 | None |
| 13 Telemetry | Deletions a week; deletions inside a day of sign-up |

### `content-tooling` [live]: FIX

| # | Answer |
|---|---|
| 1 Purpose | A new ground in hours, not days (Tyler 11-04). Solves "content ends before players do" |
| 2 First principle | Ours: the pack remembers a ground's decisions as a folder. The by-id guards that broke on every ground now loop |
| 3 Ledgers | Designer and artist hours in; Levels of content out |
| 4 Budget | None |
| 5 Seven players | The Heavy four clears 30 Levels under Krell in about a week (REAL pace) |
| 6 Server cost | A ground is rows; its price is engine time a pull (section 2) |
| 7 Population | None |
| 8 Server age | Month 6: old grounds are empty. Tiers and scaled hunts refill them without a new ground |
| 9 Exploits | A mis-sized row is a faucet: `pack.mjs check` and the coverage bot are the gate |
| 10 Teaching | None |
| 11 Throughput | Section 8: a region about 60 to 80 hours ASSUMED; one ground timed, none since the pack |
| 12 Monetization | None |
| 13 Telemetry | Working hours a ground, written in its LANE DONE line; reds caused by a ground in the week after it ships (the Ford caused 6) |

---

## 10. Change rows

| Change | Systems | Ledgers moved | Size | Needs server work | Value | Evidence |
|---|---|---|---|---|---|---|
| Land lane/c-server-cost (poll, one read, packing, prune, dead tables, lever horizon) | settle-engine, envelope, operations | server cost | built | yes: 4 staged files and the edge | long chase (capacity x1.2 to x4 by wall) | the lane's `scale-probe.after.json`; REAL `hr_load` 109 ms |
| Confirm in the edge, commit at the flush | settle-engine | server cost | L | yes: the edge's settle and `hr_hunt_apply_instance`'s caller; the nightly concurrency gate first | long chase (x2 a real account, x5 the worst hour) | REAL 114 settles a hunted hero-hour against 36 away |
| The hourly journal | settle-engine, purse-ledger (24) | server cost, gold's audit trail | L | yes | long chase (journal x60 down) | REAL 216 rows a hunted hero-hour; 309 MB of 460 |
| Delta envelopes and frames | envelope | server cost | L | yes | first week (a faster watched hunt on a slow line) and long chase | REAL 48 ms, 15% of WAL in the frame prune |
| Town presence by push; nothing when alone | town (25), envelope | server cost | M | yes | long chase | REAL 2,655 s, 437,206 calls |
| One heartbeat: friends, market and online as versions | friends, market, envelope | server cost | S | yes, small | long chase | REAL `hr_social_poll` writes 72 MB of WAL; `hr_market_mine` 76 ms |
| Leaderboards refreshed on read | operations | server cost | S | yes | long chase | REAL 185 ms and 110 KB every 5 minutes |
| Training paid in closed form | training (26) | server cost | M | yes | long chase | 26's card; idle time is 3.7 times hunted |
| Fixtures: a town hour, a Krell Deadly four, a Tower climb, a supply-heavy four; journal rows asserted against the REAL mix | settle-engine | none | S | no (a test) | long chase | the fixture reads 44 to 48 where production reads 216 |
| Bodies packed by measured engine time | settle-engine | server cost | S | yes, one dial and the roster | long chase | REAL edge 99.3% with one four |
| Dashboards read roll-ups; `cron.job_run_details` pruned; the capacity sample under 20 ms | operations | server cost | S | yes, small | none for players | REAL 2,880 s; 62,158 rows |
| `hr_put_client_state` writes the changed key | envelope | server cost | S | yes | none for players | REAL 21 KB of WAL a call |
| Chat worlds of 250 | chat (25) | server cost, money | M | yes | first week at 1,000 | ASSUMED list price x listeners |
| Report from the chat menu, a new-account chat rate | moderation, chat | attention | S | yes | first week at 1,000 | 25's OPEN |
| Apply account deletion with its three defaults | account-deletion | none | S (built) | yes: 1 staged file | launch requirement | master backlog |
| Time every ground: working hours in the LANE DONE line | content-tooling | designer hours | S | no | long chase | one sample since 10-29 |

---

## 11. Tyler rules on

1. **Budget the game on open tabs, not on presses.** Real accounts ran half their hunted hours at the watched cadence. RECOMMENDED: the cost table's "journalled" column is the plan of record, and change 2 (confirm in the edge, commit at the 90 s flush; the fight on screen and the Leave stay as they are) is built before the beta opens to more than about 250 accounts. ALTERNATIVE: leave the watched settle as it is and pay for it: about $410 a month at 1,000 accounts instead of $210, and no path to 10,000.
2. **The journal becomes one row an hour.** RECOMMENDED: build the hourly journal (change 3) with the first balance patch, since every dive's new sinks add rows to it. ALTERNATIVE: keep a row a settle, land the 5-minute prune, and cut retention from 90 days to 30: holds to about 1,500 accounts and loses 60 days of audit trail.
3. **Compute, when the beta opens.** Today's Small holds about 260 mixed accounts a day at the busy hour, and its cores are shared. RECOMMENDED: stay on Small until the capacity sample reads 50% at a busy hour, then move to Large (2 dedicated cores, about $110 a month, ASSUMED list price) as a spend you approve that day, with the numbers in front of you. ALTERNATIVE: move to Large before the beta opens so the first wave cannot stall hunts (about $95 a month more, from day one). No spend is assumed here.
4. **Backups before real money.** PITR is RULED no (11-19) and that stands for the betas, which are wiped. RECOMMENDED: decide it again at Early Access, when a lost day is lost Crowns people paid for: either PITR (about $100 a month) or a restore drill run for real each month on the staging project you approved (no new spend, up to 24 hours lost). ALTERNATIVE: keep daily backups untested, which is today.
5. **Worlds.** One database tops out near 25,000 real-shaped accounts after the four changes. RECOMMENDED: one world until then, and every shared thing built in rooms now (chat rooms of 250, town instances of 60, boards a world) so a second world is a new database and not a redesign. ALTERNATIVE: design for several worlds from Early Access (a world picker, transfers, a market each): more work now, and it splits a small population.
6. **Global chat in rooms of 250.** RECOMMENDED: yes, before chat meets a crowd; a rare drop or a Level 200 is announced once a minute a room. ALTERNATIVE: one Global for everyone, which is unreadable past a few hundred and costs about $1,000 a month a thousand listeners (ASSUMED list price).
7. **The town, alone.** Town presence is 8% of today's database time to draw players who are not there. RECOMMENDED: push positions and send nothing to a player alone in an instance; and draw the account's own working heroes at their stations so the town is never empty (25's open question; needs the designer's and art director's yes). ALTERNATIVE: keep the 2 s poll and slow it to 6 s always: a third of the cost, and other players move in jumps.
8. **One account a player: enforced or declared?** The cap is four heroes a network; a second account on a phone's data is free, and every alt-fed exploit in section 7 leans on that. RECOMMENDED: declare it, enforce it by the economy (day caps, the contributor gate, account-bound Luck and keys) and by GM action on report, and stop treating the network count as the guard. ALTERNATIVE: device and payment fingerprinting at Early Access, which costs work, false bans on shared households, and a Steam account is already a stronger identity than anything we would build.
9. **Hero slots are the server's brake too.** Each slot is a full hero of cost. You ruled the prices up today; RECOMMENDED: nothing more. A fourth hero costs about a hundredth of a cent a day; never limit heroes for cost. ALTERNATIVE: none worth taking.
10. **The engine's price goes on the balance sheet.** Bigger pulls and longer fights cost edge time for every hero forever. RECOMMENDED: the combat dive's density and pull changes state engine-ms a window at Krell on Deadly, and the guard gains a Krell four, a Tower climb and a town hour as fixtures before those changes merge. ALTERNATIVE: measure after, and find it on the capacity sample.
11. **Training in closed form.** A yard session is settled like a hunt to pay a constant. RECOMMENDED: pay it at start, each paid hour and stop, before 26's changes make the yard worth using. ALTERNATIVE: leave it and accept that idle heroes, 3.7 times the hunted hours, each cost a hunt.
12. **Time the content.** One ground has ever been timed. RECOMMENDED: every ground, band, boss and recipe family ends its lane with its working hours, so by the next region we know whether a region is 60 hours or 120. ALTERNATIVE: keep estimating from the Ford.

---

## For other dives

| To | System | Finding |
|---|---|---|
| 21 combat | grounds, density, tiers | Engine time a simulated hour is about 1.9 times higher at Krell's Hold and the Catacombs than at the Thicket. Any change that raises units in a fight states its engine-ms a 100 s window; a body's 800 ms is shared |
| 21 combat | the watched hunt | Change 2 keeps the 16 s confirm. If the combat dive wants a faster or slower confirm, it is free after change 2 and costs a commit a seat before it |
| 22 endgame | `tower`, the boards | A Tower climb needs a cost fixture. A Rank is a row a hero a board, never a count a read. Run boards have no prune: keep best and last 20 |
| 23 items | salvage, Luck, Hallmarks | A salvage or a craft is a press: one journal row is fine. A batch (salvage 200 pieces) must be one call and one row, like `vendor_sell_many` (1,106 B a row, REAL) |
| 24 economy | `purse-ledger` | 216 rows a hunted hero-hour REAL, not 44 to 48. `supply_buy` and `supply_own` are a row a settle each: 114 of the 216. Any audit that reads the journal must survive change 3's hourly rows |
| 24 economy | `market` | `hr_market_mine` is read on every load at 76 ms. `hr_market_expire(200)` clears 57,600 listings a day |
| 25 social | `town` | REAL: 437,206 presence calls, 8% of database time. Your open question (are signed-out accounts' working heroes drawn) is not answered here either: UNVERIFIED |
| 25 social | `friends`, `chat` | The poll is `hr_social_poll` and it writes. Global needs rooms. The fifth Realtime topic is the last |
| 26 home | `training` | Closed form, rule 11. The five Home sections cost part of 48 ms a read: version them |
| 27 retention | `accounts`, `access` | 58 of 65 profiles never made a hero. Real accounts keep a tab open for about half their hunted hours: "attended minutes" from presses undercounts time at the screen by five to ten times, or the tab is on a second monitor. Either way it is what they do |
| 27 retention | telemetry | Every dive's requirement 13 that scans `player_ledger` on production costs 150 to 1,040 ms a read today. Weekly numbers come from roll-ups |
| Inventory | `operations` | Three costs filed inside existing systems (top of this file). No new row |

---

## Measured, cited, assumed

| Label | What | Command or file |
|---|---|---|
| REAL | Database time, calls, WAL by statement and by REST function; cron runs; table sizes; journal rows by kind, by day and an hour of work; capacity samples; settings (Small: 512 MB shared buffers, 90 connections) | `node tools/balance-program/platform-read.local.mjs` (SELECT only, each read inside `begin read only`; aggregates, no account id; 2026-11-20 16:10 UTC) |
| REAL, derived | 70 ms of database time a hero-settle (27% of 38,171 s over the settles journalled since 10-31); 48% of hunted hours at the watched cadence ((114 - 36) / (198 - 36)); 216 journal rows a hunted hero-hour (last five days / 370 hunted hours) | the same read; arithmetic in `tools/balance-program/model.mjs` COST |
| MEASURED | The cost table, the plans that hold N accounts, the journal against the prune | `node tools/balance-program/measure.mjs cost` (and `--after`, `--add`) |
| MEASURED | Engine wall time by reference point | `node tools/balance-program/measure.mjs ref --at thicket` 4.9 s, `ford` 9.3 s, `hold` 8.6 s, `catacombs` 9.2 s (three seats x two seeds x one hour, this PC, about 1 s of start-up in each) |
| MEASURED | What one tab asks: 12 calls a first load, 660 an hour idle in town, 390 an hour watching (6.9 MB), 8 a reload; 150 journal rows a watched hour for a new lone hero | `node tools/balance-program/platform-play.mjs` (local world, headless, a new account; 0 page errors) |
| CITED | 5 and 8 statements, 28 and 103 row writes a settle, 48 and 44.3 journal rows (fixtures) | `tests/per-player-cost.baseline.json` |
| CITED | The four walls, the ten rows, 198 against 36 commits, 1,400 hunts in 11 fires | `tools/qa/audit-2026-11-19-server/findings.md`, `scale-probe.result.json` |
| CITED | After the staged lane: 4 and 4 statements, 3 fires, the prune at 5.76M a day | `origin/lane/c-server-cost`: `scale-probe.after.json`, `1004`, `1006` notes. Not re-run here |
| CITED | 100 accounts x 4 heroes = 1.45 of Small's cores | `tools/beta-load.mjs` header (11-02) |
| CITED | Hask's Ford: 4 h 13 of work | memory `scalable-grounds-2026-11-04` |
| ASSUMED | Supabase's prices and core counts (compute add-ons, $2.50 a million Realtime deliveries, $2 a million edge calls, $0.125 a GB of disk, $0.09 a GB of egress, PITR $100); that Small and Medium cores are shared | the published list as last read; **check the page before any spend** |
| ASSUMED | The busy hour is twice the day's mean; the mixed server's shares; a frame is 20 to 50 KB; delta envelopes cut a read four times; the engine's pool is 15 connections | said beside each use |
| ASSUMED | Every content hour in section 8 except the Ford's | one sample |
| UNVERIFIED | Why the edge wall read 99.3% (a catch-up window after a deploy is the likely cause); whether `hr_put_client_state` and `beta_invite_check` are rate-limited; whether signed-out accounts' heroes are drawn in town; the leaderboards refresh at 4,000 heroes | named where used |
| NOT DONE | Combat (21), items (23) and retention (27) had not pushed a requirement-6 answer when this was written (`origin/lane/d-balance-combat` holds a 21-combat.md with no server-cost line; the other two branches do not exist yet). Their rows join section 3 and section 7 when they land. No synthetic load was run: social, market and town numbers at 1,000 are arithmetic on REAL means, to be proved in phase 4 |
