# Commit cost and idle clock, 2026-11-11

Reliability Engineer, lane `lane/r-commit-cost`, branched from `origin/main` 3554ebc67 (v0.2.118).
Read and staged only. Nothing was written to production. No live SQL was run (the Supabase MCP was not authenticated; the brief allowed live reads only through `node tools/hunt-health.local.mjs`, which has no per-statement view).
Follows `.claude/coordination/hunt-path-baseline-2026-11-10.md` Parts 2 and 3. Builds on `origin/lane/c-watched-settle-cost` (2027-03-30-dead-writes.sql, 2027-03-31-watched-settle-cost.sql) without redoing it: none of the files below touches a line that lane edits.

**Pre-EA Security list:** `2027-04-08-member-write-once.sql` (hr_hunt_apply_member, the gold/XP settle path) and `2027-04-08-idle-clock.sql` (hr_tick_cron_run, the world tick's driver). `2027-04-08-progress-hot.sql` moves no value, body or grant. No Security round now (CLAUDE.md §2: the betas are wiped).

## Rerun it

```
node tools/commit-cost.mjs --upto=2027-03-26-signout-presence.sql --windows=6 --json=B.json   # before (main's chain)
node tools/commit-cost.mjs --windows=6 --json=A.json                                          # after (this branch)
node tools/commit-cost.mjs --windows=6 --checkpoint                                           # the first commit after a checkpoint
node tools/commit-cost.mjs --door=player --windows=6 --state                                  # watched door + hr_state_of breakdown
node tools/commit-cost.mjs --windows=3 --audit                                                # every row written, with the line that wrote it
node tools/commit-cost.mjs --ab=2027-04-08-member-write-once.sql --windows=8 [--door=player]  # same commit, two bodies, rows compared
node tools/commit-cost.mjs --idle [--upto=...] --n=40                                         # the clock with nothing owed
```

One process at a time. Each run replays the chain from `tests/.pglite-cache`, reopens the data directory with PGlite's `pg_stat_statements` (track = all) and `pg_walinspect`, runs `VACUUM` and `CHECKPOINT`, then measures. The fixture is production's party shape: ONE account, four heroes (tank, healer, ranger, mage, party-soak's kit), one party started by the leader's own verb on Coppercap Warrens at Level 40, windows of 90 s settled by the shipped edge (`tick.js runTick` for the fire door, `settleHunt` mode settle for the player door). Every statement runs in its own transaction as hr_engine; its counters (rows by table, HOT, blocks) are the transaction's own pending statistics read before commit, its WAL is the insert position before and after, broken down by relation with `pg_get_wal_block_info`.

How far to trust it: PGlite is PostgreSQL 18 in WASM, one long-lived backend, data checksums on. Rows, blocks and WAL bytes are the same SQL's; milliseconds are not production's (compare ratios). Live figures below are the 2026-11-10 baseline's (pg_stat_statements), not re-measured.

## 1. The commit (hr_hunt_apply_instance), party of four, Warrens, Level 40

Per commit, steady state (no checkpoint inside the window), 6 windows, fire door. MEASURED.

| | main (before) | this branch (after) | change |
|---|---|---|---|
| WAL bytes | 41,023 | 36,859 | −4,164 (−10.2%) |
| WAL bytes, first commit after a CHECKPOINT (`--checkpoint`) | 98,577 | 91,088 | −7,489 (−7.6%) |
| full-page images a commit after a checkpoint | 20.6 | 20.3 | −0.3 |
| blocks touched, public relations | 3,384 | 3,239 | −145 (−4.3%) |
| rows inserted | 26.3 | 26.3 | 0 |
| rows updated | 102.2 | 96.2 | −6 |
| of them NOT HOT (a new index entry each) | 35.9 | 3.4 | −32.5 (−90%) |
| ledger rows a window | 10 | 10 | 0 (and §3(b) / the A/B below: identical rows) |
| ms (PGlite, one backend) | 55.9 | 50.0 | noisy, not a claim |
| watched door (`--door=player`): WAL / blocks | 41,032 / 5,634 | 36,875 / 5,483 | −10.1% / −2.7% |

Live for scale: 197.7 ms, 116 KB WAL and 36,330 buffers a call (2026-11-10). The checkpoint row is the closer model of live WAL: production's figure is mostly page images.

With the other lane layered in (its two files copied in for the run only, then removed; same fixture, fire door, 6 windows). MEASURED:

| per commit | main | + lane/c-watched-settle-cost (03-30, 03-31) | + this branch alone | both |
|---|---|---|---|---|
| WAL bytes | 41,023 | 32,537 | 36,859 | **29,320** (−28.5%) |
| blocks | 3,384 | 2,598 | 3,239 | **2,469** (−27.0%) |
| rows inserted / updated / not HOT | 26.3 / 102.2 / 35.9 | 17.5 / 86.7 / 24.4 | 26.3 / 96.2 / 3.4 | 17.5 / 80.7 / **0.9** |
| ledger rows a window | 10 | 6 (the renown rows stop) | 10 | 6 |

The A/B of this branch's member file on that combined chain: 7 commits, 0 differences. The two lanes compose: no anchor of one touches a line of the other.

### Where the commit's WAL goes (after, steady state, bytes a commit, `pg_walinspect`)

| relation | bytes | what writes it | stays? |
|---|---|---|---|
| player_progress | 7,996 | 40.5 upserts a commit (`insert ... on conflict do update`: a lock record and an update record each) | the collection counter's share is switched off by 2027-03-30-dead-writes.sql (combined run: 8.8 fewer inserts and 15.5 fewer updates a commit) |
| hunt_session_tally | 5,076 | the session half's fold + the analyzer write, 2 a member | the session half's write is the ledger fold; folding the analyzer into it needs hr_hunt_settle_session's contract (below) |
| player_ledger + 4 indexes | 7,910 | 10 rows: 4 combat, 4 renown_ratchet, 2 supply_buy | the 4 renown rows (1,867 B) go with 2027-03-30-dead-writes.sql; the rest is the journal |
| hunt_instances | 2,846 | the world (about 1.4 KB) written once a commit | stays: it is the state |
| player_inventory (+ 2 indexes) | 2,228 (+ ~900) | 15.7 upserts | stays |
| player_state | 2,197 | 16 updates: 4 a member | see the repeats table |
| player_progress_pkey | 969 (was 4,499) | new keys only (6.5 a commit) | — |

### Rows written more than once in one commit (`--audit`; the line that wrote each)

| table | rows | writes, main | writes, this branch | the writes |
|---|---|---|---|---|
| player_state | 4 | 16 | 16 | hr_apply level_xp (4), hr_apply renown_high (4, gone with 03-30), hr_hunt_apply_member stamina (4), hr_apply's main update version/updated_at/hp (4) |
| hunt_session_tally | 4 | 10 | **8** | hr_hunt_settle_session's fold (4), then ONE write a member for the analyzer and the store bill (was the bill's 2 and the analyzer's 4) |
| account_wallet (the one purse) | 1 | 6 | 6 | hr_purse_move: 4 members' gold, 2 store bills |
| player_intents | 4 | 8 | 8 | hr_apply's insert and its result update |
| hunt_sessions | 4 | 8 | **4** | hr_hunt_settle_session's clock (4); hr_hunt_apply_member's unit_id (4, **changing no column**) is gone |
| hr_rate_counters | 1 | 4 | 4 | unlogged: no WAL |

What each repeat costs, measured per statement (pg_stat_statements, WAL bytes a commit): player_state 2,922 in all (level_xp 482, stamina 608, renown 565, main update 1,272, plus 680 for re-taking its row lock 12 times); the purse 826; the unit_id no-op 636; the store bill's tally write 421.

### What this branch changes, and what it leaves

1. **`2027-04-08-progress-hot.sql`: drop `player_progress_period_idx`.** The index keys `updated_at`, every progress write sets `updated_at = now()`, and PostgreSQL keeps an update HOT only when no indexed column moves (a partial index's key counts for every row). So all 35 progress updates a commit were non-HOT: a new heap tuple and a new primary-key entry each. Its one reader is the daily `hr_progress_prune` (04:25 UTC), which now reads the table once a day (2,477 live rows; at most 280,000 at 1,500 daily players, under a second). Result: 32.5 of 35 updates HOT, the primary key's WAL 4,499 → 969 bytes a commit, and the index no longer collects ~33 dead entries a commit for vacuum to find.
2. **`2027-04-08-member-write-once.sql`: two writes of hr_hunt_apply_member.** The unit write happens only when it moves (it rewrote the same value every member, every window), and the store bill's tally increments ride the analyzer's tally write. hunt_sessions 8 → 4 writes a commit, hunt_session_tally 10 → 8. Proved value-neutral two ways: its §3(b) runs a pinned window (a store bill and an analyzer line) through hr_hunt_apply_instance under the pre-image body and the landed body and requires every row and the ledger count identical; and `tools/commit-cost.mjs --ab` ran 18 real engine commits (9 fire, 9 player door, 4 members each, 10 ledger rows each) under both bodies from the same state: **0 differences**, sequence ids aside.
3. **Not changed, with the number:** player_state's four writes a member (2.9 KB, 7% of the commit) and the purse's six (826 B, 2%). Each carries a value the next statement reads (the level for the kill bound, the running purse balance journalled on each ledger row). Coalescing them is a restructure of hr_apply's write order on the money path for at most ~1.5 KB a commit: not worth the risk. The renown write (565 B + its ledger row 1,867 B + 652 blocks of hr_renown_of) goes with 2027-03-30-dead-writes.sql.
4. **Next, for the backend-architect (not staged):** (a) the session half's tally fold and the analyzer write could be one write if hr_hunt_settle_session took the analyzer increments (about 1.2 KB a commit at Level 40, more on a 12 h hunt where the tally row is larger); (b) hr_apply's progress upsert could `update ... ; if not found then insert` and drop the lock record per existing counter (about 1.8 KB a commit); (c) hr_vitals_of runs 12 times a commit (3 a member, 1,110 blocks) and hr_hunt_limit 239 times (478 blocks).

### hr_state_of (`--door=player --state`, MEASURED on the replay)

16 to 18 ms a call in PGlite, 25.8 KB, 2,332 blocks (explain). Live: 42 to 44 ms, about 7,500 buffers. Inside it, by blocks (inclusive of what each calls):

| blocks | calls | what |
|---|---|---|
| 2,489 | 1 | hr_state_sections_of (all of the sections below) |
| 2,171 | 1 | the sections' one jsonb_build_object of the *_view functions |
| 570 | 1 | the home's priced offers (2026-11-29-house-home.sql) |
| 389 | 1 | the premium / sink prices |
| 384 | 1 | the open hunt's view (hr_hunt_view) |
| 356 + 356 | 2 + 2 | unlock progress: player_progress joined to hr_unlocks, twice |
| 332 | 2 | the bag's loot valued against the vendor table |
| 228 | 32 | hr_skill_level lookups |
| 218 | 3 | hr_vitals_of |
| 184 / 180 | 1 / 1 | storage chests / property tier |

No sequential scan on a player table in the plan; the cost is breadth (one envelope reads every system), not a missing index. It runs on every watched ask and inside every watched commit's projection. The lever is the 2026-11-10 baseline's finding 3 (do not rebuild unchanged sections on every ask), the backend-architect's.

## 2. The clock (`--idle`, 24 idle heroes each owning a gather and an artisan row, 40 calls a body)

MEASURED on the replay, warm (one backend):

| body | before: ms / statements run / blocks / WAL / rows written | after |
|---|---|---|
| hr_tick_cron_run, nothing owed | 1.77 ms / 18.6 / 30 / 474 B / 3 (log row, shard cursor, config cursor) | 1.17 ms / 9 / 10 / 260 B / 1 (the log row) |
| hr_tick_enrol(200), nobody on a channel | 1.07 ms / 5 / 155 / 153 B / 0 | 0.73 ms / 3 / 10 / 152 B / 0 |
| hr_ops.alert_run() (not edited: the control) | 2.71 ms / 31 / 4 / 104 B | 2.38 ms / 31 / 4 / 104 B |

The control row moved 12% with no change at all: the milliseconds here are within that noise; the statement, block, WAL and row counts are exact.

Live (2026-11-10): hr_tick_cron_run 26.0 ms × 8,640 a day, hr_tick_enrol 49.9 ms × 1,440, hr_ops.alert_run 94.2 ms × 1,440: about 433 s a day. The live time is mostly the cost of a fresh backend (pg_cron opens a connection a run): the cron's own log read 28 ms + 17 ms a rostered row on 2026-10-08, against 1.77 ms for the same idle body warm here. That fixed cost scales with the statements a fire plans and the relations it opens, and an idle fire now runs 9 statements instead of 18.6 and opens about half the relations.

DERIVED, not measured: if live time falls in proportion to the statements an idle fire runs, hr_tick_cron_run drops to about 12 ms and hr_tick_enrol to about 30 ms: roughly 150 s a day of the clock's 433. The real figure is owed after the apply (below).

What changed (`2027-04-08-idle-clock.sql`): hr_tick_owed answers two supersets (a hero the gather roster or the admission counter could see; a session the hunt roster could lease), each the EXISTS of a row test (hr_tick_hero_owed, hr_tick_session_owed; plpgsql, so PostgreSQL 17 keeps their plans, the SB-3 rule); hr_tick_cron_run skips a half whose answer is no; the retired config cursor is cleared only when set; hr_tick_enrol skips its owned count and candidate insert when no hero is on any cohort channel and answers the same rows. With work owed every byte the fire stamps, posts and logs is unchanged, and the 10 s cadence and the 90 s flush are untouched. A session owed 90 s is leased within one fire: proved by `tests/hunt-tick-shards.mjs` IDLE (91 s behind: leased and posted in one fire; 60 s: not), by the migration's §5(d) against the fire's own roster call, and by four mutants that each turn IDLE red.

hr_ops.alert_run stays every minute and is not edited: it is the watchdog that sees the tick go silent and the dead-man ping that sees the database go away; a watchdog that sleeps when nothing looks open cannot see the clock die. Its 94 ms on live is not reproducible here (no Vault on the replay; it reads two Vault secrets, pg_settings, pg_stat_activity and cron.job_run_details every run).

## 3. Capacity

| | today | 10× | 100× |
|---|---|---|---|
| hunt commits a day (live 1,339) | 1,339 | 13,390 | 133,900 |
| commit WAL a day at the live 116 KB (before) | 155 MB | 1.55 GB | 15.5 GB |
| saved by this branch at −7.6% (the after-checkpoint ratio; −10% steady) | 12 MB | 118 MB | 1.2 GB |
| dead primary-key entries on player_progress a day (before; after: ~3 a commit) | 47,000 | 470,000 | 4.7 M |
| idle-clock WAL a day (cron only): 474 → 259 B a fire | 4.1 → 2.2 MB | same (the clock does not scale with players) | same |

The ledger, not WAL, is still the disk risk the 2026-11-10 baseline named (89 GB at the 90-day line at 100×). Nothing here changes a row a player owns, so nothing here changes that line.

## 4. Durability and cost

Backups: Supabase Pro daily, 7-day retention, per the brief; PITR not enabled. Restore-tested: **no**, not by this lane. Nothing here needs a spend. The drop index is the one lock-taking statement: ACCESS EXCLUSIVE on player_progress for the length of a file of one statement and a millisecond probe, under the apply tool's 5 s lock_timeout.

## Apply order (after everything already staged; none of these depends on another)

1. `2027-04-08-progress-hot.sql`
2. `2027-04-08-member-write-once.sql`
3. `2027-04-08-idle-clock.sql`

No edge move (`supabase/functions/**` untouched), no client move.

## Tests (one at a time, exit codes)

On the final files: replay of the whole chain with the three self-checks, and a second apply of the three over it, byte-identical (1,091 bodies and indexes, fingerprint unchanged) 0 · `tests/schema-drift.mjs` 0 (after `--write`: +3 functions, −1 index) · `tests/apply-order-honesty.mjs` 0 · `tests/selfcheck-no-global-dml.mjs` 0 · `tests/hunt-tick-shards.mjs` 0 (10 arms, IDLE new) · `--mutate --only=IDLE` 0 (4 of 4 killed) · `tests/guard-hygiene.mjs` 0 · `tests/parse-check.mjs` 0 · `tests/mutant-anchors.mjs` 0 · `tools/commit-cost.mjs --ab` 0 on both doors and on the combined chain.
On the files before the three row tests moved from LANGUAGE sql to plpgsql (the cron, enrol and member bodies byte-identical to the final ones; the full hunt-tick-shards and IDLE mutants re-ran on the final files): `tests/hunt-sessions-settle.mjs` 0 (81 arms) · `tests/world-tick-token-leak.mjs` 0 · `tests/world-tick-scale.mjs` 0 · `tests/world-tick-gather-widen.mjs` 0 · `tests/artisan-tick.mjs` 0 · `tests/legacy-keys.mjs` 0 · `tests/world-tick-token-failclosed.mjs` 0 · `tests/pg-net-queue-unreachable.mjs` 0 · `tests/edge-tick-gate.mjs` 0 · `tests/world-tick-channel-arm.mjs` 0 · `tests/world-tick-shadow-chain.mjs` 0.
`tests/live-hash-drift.mjs` 1, as staged files make it: it wants hr_tick_owed, hr_tick_hero_owed and hr_tick_session_owed tracked, and the replay of hr_hunt_apply_member (5186f2e9…), hr_tick_cron_run (49c044e9…) and hr_tick_enrol (e7d36b74…) re-pinned. Coordinator-only; not written.

## Owed

- After the apply: `pg_stat_statements` mean_exec_time for `select public.hr_tick_cron_run()` and `select public.hr_tick_enrol(200)` over a quiet hour, against 26.0 and 49.9 ms: the measured replacement for the derived 150 s a day.
- After the apply: `hr_hunt_apply_instance`'s wal_bytes and shared_blks_hit a call against 116 KB and 36,330.
- live-hash-drift re-pin (Coordinator): hr_hunt_apply_member, hr_tick_cron_run, hr_tick_enrol move; hr_tick_owed, hr_tick_hero_owed, hr_tick_session_owed are new.
- A restore test of the daily backup: still never done.

## Verified and assumed

Verified by running it: every replay number above, the A/B (18 commits, 0 differences), each migration's self-check on the replay, IDLE and its four mutants.
Assumed: that pg_cron runs each job in a fresh backend on Supabase (its default), which is what makes the derived clock saving plausible.
Derived, not measured: the live clock saving, the capacity rows (straight multiples of the 2026-11-10 live figures).
