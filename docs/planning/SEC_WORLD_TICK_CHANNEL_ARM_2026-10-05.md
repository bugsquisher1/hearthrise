# Security review — 2026-10-06-world-tick-channel-arm.sql @4f587c45 (2026-10-05)

**APPLY: GO.** **ARM (any channel): GO-WITH-CHANGES (C1, C2 land first).** **EDGE DEPLOY: NO-GO from 4f587c45 (6ed1b40a); GO from this branch merged onto combat-parity/`next` (measured a8e084d4 = live 620b4dc6 + only tick.js/tick-party.js deltas).**

| # | Question / finding | Result |
|---|---|---|
| 1 | Gather armed pays combat (solo or party)? | **REFUTED.** Pay needs `p_channel ∈ armed_channels` AND `active_kind = p_channel` AND owned row for that channel AND version CAS; party fence/mark hard-code `'combat'`. A1/A2/A7 + mutants `combatTreatedAsArmed`, `partySettleFollowsGather`, `partyMarkFollowsGather` RED (8/8, exit 0). |
| 2 | NULL / odd array arms something? | **REFUTED.** NOT NULL; CHECK refuses NULL element, 2-D, unowned, `''`, wrong case; every reader coalesces NULL to "not armed". `artisan` is armable if in `channels` but has no driver (`channel_not_driven`). |
| 3 | Kill stops pay within one window? | **CONFIRMED.** Edge runs each fence call as its own READ COMMITTED txn; step 4b re-reads `enabled` + mode after both locks. ≤1 in-flight window per character/party after the kill commits. Plain read accepted. |
| 4 | Shadow/7-day admission pays an armed channel past 24 h? | **PLAUSIBLE, bounded.** Roster admits a raw-25h character on its shadow chain, operator arms, probe returns the raw mark, edge settles `[mark, mark+flush]` armed. One flush (≤900 s by CHECK) per character per arm transition, operator-timed, not player-triggerable; accrue still pays its full cap afterward, so it is a real overpay. **C1:** in `hr_tick_settle` armed branch, refuse `fenced_24h` when `hr_tick_admit(false, v_st.accrued_to, null) <> 'admit'`, + self-check arm + mutant. |
| 5 | Restated bodies = prod? | **CONFIRMED.** Live `pg_get_functiondef` of all 7, comment-stripped diff: only the `shadow`→`armed_channels` swap, step-4b move, `channel` in answers, cron `detail.admission`/`armed`, stall `armed_channels`. Headers, secdef, search_path, ACLs match. No other live routine reads `hr_tick_config.shadow`. |
| 6 | Deploy order either way? | **CONFIRMED** (live edge never reads body `shadow`; new edge reads a channel-less answer as-is). |
| 7 | Negative space | **C2:** `hr_tick_stall_status` stops judging the moment ANY channel arms, so the combat shadow goes unmonitored while gather pays; judge shadow rows per unarmed channel before gather arms. Follow-ups (no gate): cron admission count is an unbounded scan per fire (2 rows today); edge `mode_channel_mismatch` not mutation-proved; party admission stays raw-24h (in scope of ruling 1). |

Residual accepted: one window per character after a kill; engine (`hr_engine`) trusted to price the delta for its channel; PGlite-only verification (prod apply runs the self-check and rolls back by sentinel).
