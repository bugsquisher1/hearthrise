# Security: 2026-10-07-frame-emit-online-only.sql (lane/m5-frame-budget @cd852ce5): APPLY GO

| # | Refutation attempted (prod read SELECT-only, 2026-10-06) | Result |
|---|---|---|
| 1 | Splice vs LIVE: hr_tick_settle prosrc md5 612582fc (matches arm-guards), party c71f69c2; no CR in either; each anchor hits exactly 1x, right after the role check and before the kill switch; §3 rebuilds from live `pg_get_functiondef`, so only the marker differs and ACL/secdef/search_path carry over. The hr_frame_send restatement is the live body plus the gate block only. | REFUTED |
| 1b | Marker leak: `set_config(...,true)` is transaction-local; the edge's execTick runs one statement per `sql.begin`; no live/edge/src code sets `hr.frame_origin` at session level; PostgREST cannot set arbitrary GUCs. A forged marker could only SUPPRESS frames (it cannot mark HTTP as tick to gain anything). | REFUTED |
| 2 | Forging last_seen_at: the only writer is hr_heartbeat__ungated (auth.uid() row, `now()`, 20 s floor, behind hr_rpc_gate, no version bump). authenticated has SELECT only, policy is own-read. The only other reader is hr_town_refresh (presence, already live). Heartbeat buys frames on your own topic, nothing else. | REFUTED |
| 3 | Value/version/ledger: the gate is read inside hr_frame_send's exception block after hr_apply has written. Self-check v4/v5/v7 executes online == offline (+1 version, same gold, same ledger rows). | REFUTED |
| 4 | Grants/cron: all 5 new fns revoked from PUBLIC/anon/authenticated/service_role/hr_engine/hr_tick; hygiene STRICT runs in-file. supabase_read_only_user already holds pg_monitor+pg_read_all_data, so the 2 read grants add no reach. The alert writer is ungranted; maintenance_alerts ref/severity constraints fit. Prod slots are healthy today (pgoutput reserved, 512 MB safe), so it will not page on apply. | REFUTED |
| 5 | Probes: parity eligibility keys on the EDGE payload_sha256 (unchanged, no edge half). Shadow/probe branches are untouched, and the marker moves no version. Probe spans are not invalidated. | REFUTED |

Residual (accepted): a tick entry point outside `%tick%` naming that skips the marker sends ungated frames (quota, not value; frame-origin-marker --mutate 7/7 green here); a hidden tab relies on the 90 s poll. After apply: live-hash-drift has 3 deliberate entries (Coordinator re-seed).
