# Server and scale audit — 2026-11-19 (backend-architect, read-only)

Base: claude/nice-einstein-6h7s9n (= set/v0.2.142 + the settle fix). Probe: `scale-probe.mjs`, result `scale-probe.result.json`.

## Capacity

**About 110-130 accounts online at once (roughly 450-500 hunting heroes) before the database passes 70% CPU; it saturates near 170.** Derived, not re-measured: the 2026-11-02 load rig (real PostgreSQL 17) put 100 accounts x 4 heroes at 1.45 of Small's 2 cores; lanes since cut their parts 16-28%.

What breaks, in order:
1. **Database CPU**, spent by watching: a watched hero commits 198 times an hour against 36, and every commit rebuilds the whole character.
2. **The tick's fan-out dial**, 128 instances a fire. Measured: 1,400 due hunts took 11 fires (110 s), over the 100 s window. Ceiling 1,280 browser-closed instances.
3. **Edge CPU**, soft: a fourth heavy party in a body waits 30 s.
4. **The ledger**: 43-49 rows a hero-hour measured; the prune's 480,000 rows a day is outrun near 560 daily heroes.

Thousands online on this design means a 16-64 core database, or cutting per-account cost 3-4x (rows 5, 9, 10).

## Top 10

| # | Change | Why | Evidence | Effort | Files |
|---|---|---|---|---|---|
| 1 | Close three dead client-writable tables | Client-authored writes on shared tables | Replay grants: `game_events`, `clan_members`, `session_claims`; no caller in `src/` | S | new migration; `hr_assert_grant_hygiene` |
| 2 | Turn PITR on, run the restore drill | Up to 24 h lost, on a backup never opened | `last_executed: null` in the census baseline | S + spend | `docs/design/restore-runbook.md` |
| 3 | Defer mid-hunt levers past the seed horizon | The client holds 32 s of combat seeds, so it could buy a Blessing only when a death is coming | Code read, not executed: only leave, change, kick are deferred | M | `hr_action_set_options`, `hr_hunt_preset_apply`, `hr_blessing_buy` |
| 4 | Capacity sample each minute, with alarms | No alarm on any wall above | No request id or lag series found | S-M | new `hr_ops` function |
| 5 | Drop the 60 s off-screen `hr_load` poll | About 30% of production DB load (the rig's estimate) | Load rig, 11-02 | S | `src/session/config.js` |
| 6 | Pack tick bodies by heroes; free deferred leases | 2-3x tick throughput for lone hunts | Measured: 4 lone hunts use 33-65 ms of 800 | S | `hr_hunt_roster_sharded`; `supabase/functions/hr-accrue/tick.js` |
| 7 | Uncap the ledger prune; later hourly journal rows | Silent unbounded growth | Measured rows; prune cap read | S, then L | `hr_ledger_prune` |
| 8 | Nightly real-concurrency gate | Lock orders never ran on two backends | Rig last run 11-02 | M | `tools/beta-load.mjs` |
| 9 | Delta envelopes and frames | Biggest cut to wall 1 | 11-10 baseline, part 4 | L | `hr_state_of`, `hr_frame_send` |
| 10 | One read, one commit a settle | 20-32 round trips today | Measured: 5 and 8 statements | M | `supabase/functions/hr-accrue/hunt-settle.js` |

## Measured vs assumed
- **Measured** (PGlite replay, shipped edge): the dial, statements and round trips, rows and WAL a settle, ledger rows, the grants.
- **Cited, not re-run**: the load rig and every live figure (no Supabase token in the cloud session; no live read).
- **Assumed**: Small compute, pool size 15, plan quotas, frames being WAL-logged.
- **Not assessed**: the market, `jwt.js`, chat and town at scale.
