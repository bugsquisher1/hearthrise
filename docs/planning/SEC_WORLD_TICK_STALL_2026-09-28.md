# Security review — lane/world-tick-stall-after-repoint (bacfc1f5)

Reviewer: security-engineer. 2026-09-28. Read-only, no DB access (sandbox cannot reach Supabase).
Base `origin/set/b559`; lane commits e2a1374b (RED), 62af4c82 (fix), d923c041 (observability, STAGED), bacfc1f5 (perks + guards).

## Verdicts

| Half | Verdict |
|---|---|
| MIGRATION `2026-09-28-world-tick-stall-observability.sql` | **GO** |
| EDGE DEPLOY hr-accrue `a92068c1…4fc4f7` | **GO** |
| SHADOW ARM | **stays as is (shadow)** — nothing in this lane is an arming decision |

No changes required; the Coordinator merges `lane/world-tick-stall-after-repoint` itself (this branch adds only this doc).

## Deploy order

Either order is safe; **recommended: edge first, then migration.**
- `hr_tick_cron_note`'s signature is UNCHANGED (`text,int,int,int,jsonb`, 2026-09-21-world-tick-cron.sql:250 vs 09-28 §3). The edge never calls it; only `hr_tick_cron_run` (SQL) does. There is no edge→migration dependency.
- The edge fix needs no migration (fence body untouched) and ends the stall; deploying it first restores shadow rows soonest.
- The migration's harvest reads the edge's response body (`op:"tick"`, `processed/skipped/shadowed/refused/reasons`, tick.js:1018/1040), a shape both the old and the new edge emit. Apply it any time outside 00:00–00:10 UTC; it moves no value.
- After deploy: verify live `payload_sha256` == `pack-edge --hash` = `a92068c101dcb94638b9054da8e888692b444dd0999776c218fd4269a74fc4f7` (measured here).

## Evidence

| Question | Finding | Evidence |
|---|---|---|
| (1) Fix correct and minimal | Yes. `fenceWindowFrom` substitutes the fence's own mark text only when the planned start equals the mark to the ms; otherwise passes through. The CAS `p_window_from < v_mark` / `p_window_to <= v_mark` (shadow-state-chain.sql:415/420), `window_in_future` skew, lease/holder (step 4), channel (step 5), version (step 7) and `on conflict (user_id,slot,intent_id)` are all untouched, so: never before the mark, never past now+skew, never twice, never without the lease. | tick-contract.js:473-477; tick.js:980; tick-party.js:412 |
| (1) Source of the spelling | `markText` is `String(res.accrued_to)` from the fence's refusal, read under the fence's `for update` in the edge's own transaction — never from the body. The accrue intent body and tick body are unchanged (index.ts not in the diff). | tick.js:607-652; tick-party.js:440-466 |
| (1) All drivers | tick.js serves gather + combat (single call site :980); party via :412. Gather/combat driver files change comments + `perks` only. | diff stat; `world-tick-stall-after-repoint` green, `--mutate` red on R-G-a/R-C-a only; `party-settle` green |
| (1) Nit | The `Date.parse(markText) !== markMs` re-check is tautological (markMs is derived from markText, tick.js:616) — harmless defence, comment overstates it. Not blocking. | tick-contract.js:471-475 |
| (2) Perks pay in shadow? | No. Perks only price the delta; the shadow branch journals `hr_tick_shadow` and never calls `hr_apply` (shadow-state-chain.sql §8). Armed, it raises tick pay to accrue parity (the intended direction; bounded by accrue's own price). | `world-tick-perks-parity` 108==108, `--mutate` 90 vs 108 red; `edge-tick-gate` "pays nothing in shadow" |
| (2) Grant + degrade | `hr_perks_of(uuid,int)` is revoked from public/clients, granted to `hr_engine` only (2026-08-20-renown.sql:312-315). Degrade on 42883 only, everything else throws — same rule as index.ts:887-893. Selectors are from the roster row (`sel.userId`, `sel.slot`), bound as params. | tick.js:782-790 |
| (2) AWAY-1 parity | Unmoved: P-G9 lines byte-identical on base and lane (792/801, 425/450, 550/576 gold; xp identical). | `world-tick-parity` run on both checkouts; `--mutate` red |
| (3) Migration scope | Restates `hr_tick_cron_note` (09-21 body + one `edge` key, harvest wrapped in `exception when others`), adds three functions; no table, no column, no GRANT (revokes only, from public + 5 roles). `hr_tick_cron_log` stays owner-only with forced RLS (09-21:211-216). | migration §1-§5; schema-drift baseline +3 functions, relations 136 unchanged |
| (3) Secrets in detail | None: the harvest copies counts, status, `timed_out`, response id, and one reason key (≤64 chars, 32+ hex runs masked). Never the request, headers, token or HMAC (those live in `net.http_request_queue`, not read). | migration §1/§2, self-check o3 |
| (3) Replay / self-check | Self-check o1-o9 executes (planted year-2000 history, sentinel rollback, o9 checks execute privilege for all five roles). Second apply byte-identical (guard P-IDEM). | `schema-drift` exit 0 (36cf7b08…); `apply-order-honesty` exit 0; note marks it STAGED/REVIEW ONLY |
| (4) Guard non-vacuous | `world-tick-stall-guard` green; `--selftest` 4/4 mutants caught. Runs on a fresh PGlite replay each time, planted at 2001-2004 instants — no cache to go stale. Registered in smoke.yml + ci-shape baseline. | test output |
| (5) Touched files | smoke.yml; hr-accrue/{tick-combat,tick-contract,tick-gather,tick-party,tick-shadow,tick}.js; the migration; tests/{ci-shape.baseline,schema-apply-order,schema-drift.baseline}.json; tests/{edge-tick-gate,party-settle}.mjs; new tests/{world-tick-perks-parity,world-tick-stall-after-repoint,world-tick-stall-guard}.mjs. All in brief. `live-hash-drift.baseline.json` untouched. | `git diff origin/set/b559...HEAD --stat` |

## Commands run (exit codes)

All 0: stall-after-repoint (+`--mutate`), perks-parity (+`--mutate`), stall-guard (+`--selftest`), edge-tick-gate (+`--selftest`), world-tick-parity (+`--mutate`), world-tick-combat-parity, party-settle, schema-drift, apply-order-honesty, live-hash-drift (repo mode), `tools/lane-done.mjs` ("all green"), `pack-edge --hash`.
**`tests/rpc-resolution.mjs` exit 1 — environmental, not the lane:** its control probe got HTTP 403 from this sandbox's egress proxy (no Supabase reach), so it refused to certify. Coordinator must run it from a host that reaches the project.

## Non-blocking notes (follow-ups, not conditions)

- N1 A `error:<message>` reason could carry a UUID fragment (dashes defeat the 32-hex mask). The log is owner-only, so no exposure; mask UUIDs next time the file is restated.
- N2 The harvest counts ANY pg_net caller's non-200 response as `non_tick`; fine today (tick is the only caller), misleading once another pg_net caller exists.
- N3 `hr_tick_stall_status()` is a query nobody runs yet: wire it into `tools/vitals.mjs`, otherwise the next stall is still only visible to whoever asks.
- N4 `hr_bestiary_of` is still not read by the tick (under-pays; named in tick-combat.js:294). Must be closed, with perks, before any ARM review.
