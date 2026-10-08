# Security review — lane/daily-board (2026-10-09)

Reviewed: `origin/lane/daily-board` @ `8fca093fd4a52d3ddacac416ca699c4d2dfdcd63`, diff over `origin/set/wave1` @ `c3803f8c`.
Files: `supabase/migrations/2026-10-11-daily-board.sql`, `supabase/migrations/2026-10-12-retire-daily-tasks.sql`, client fold, test rewrites.
Method: read every grant and body; replayed the chain in PGlite; ran exploit calls as role `authenticated`; planted 9 mutations into the two staged files.

**Verdict: GO-WITH-CHANGES.** Both migrations are apply-safe as written. The branch merges only after C1 lands, because C1 restores coverage a standing guard lost. C2 is a comment fix.

## Per-item verdicts

| # | Question | Verdict | Evidence |
|---|---|---|---|
| 1 | Claim a goal not on the board (seed, day, clock, timezone) | **GO** — CONFIRMED closed | As `authenticated`, all 6 unoffered dailies were refused `not_offered`, including with `p_weekly` null and with a foreign `p_slot`. Gold moved 0. A mixed-case id answers `unknown_goal`. Direct calls to `hr_goal_board`, `hr_claim_goal__ungated` and `hr_claim_daily` return 42501. The board reads only `now() at time zone 'utc'`. It is the same board under session TimeZone UTC+14 and UTC−11. The board, the period key and the counters all read one transaction `now()`, so no claim can straddle midnight. |
| 2 | Board deterministic, server inputs only | **GO** | A pure function of (UTC date, `hr_goal_rewards` membership). No client argument reaches it. It is global per day, not per user. That is fine, because no player can reroll it. §4(b) checks 730 days for 3 distinct, catalogued, period-matching goals. |
| 3 | Idempotent under concurrency | **GO** | The claim body is unchanged apart from the gate. The once-guard is a unique insert, and the `player_state` row is locked `FOR UPDATE`. A replay with the same idempotency key credited 0. Concurrency was reasoned from the code, not executed (PGlite has one connection). `tests/modal-goal-claim.mjs` passed (exit 0). |
| 4 | Daily/weekly ceilings only fall | **GO** — CONFIRMED | No reward, target or counter changes. Daily drops from 9 payable goals to 3, weekly from 10 to 3, and the `hr_claim_daily` faucet closes once the retire migration applies. |
| 5 | Journalled | **GO** | Each credit writes one `player_ledger` row (`daily`, `goal_claim:<period>:<id>`), checked by running a claim. Each refusal writes an `hr_rejections` row (`goal_claim`/`not_offered`; 7 refusals were counted as n=7). |
| 6 | Revoke of `hr_claim_daily` | **GO, ordered** | No edge function calls it. The earlier self-checks that call it run as the owner, earlier in the chain. The baseline row is deleted, the hygiene gate is clean, restore-census moves from 89 to 88, and the `hr_rpc_gate` bucket is kept (town-presence GATE(c) needs it). Apply only after the client half is live. |
| 7 | §4 self-checks bite | **GO** | 9 of 9 mutations went red: gate removed → GATE(d); LCG constant → GATE(a); week seed +1 → GATE(a); helper granted → GATE(c); `offered` inverted → GATE(d); state reads lifetime counters → GATE(d); catalogue filter bypassed → GATE(a); retire revoke removed → GATE(a); baseline row kept → GATE(b). |
| 8 | `schema-drift` replay | **GO** | exit 0, fingerprint `e7f7b026…`. |
| 9 | `daily-board --selftest` | **GO** (scope note) | 9 of 9 plants caught. It is a structural/text guard. The economic binding (pools, pinned vectors, a sweep of every one of the 233280 seeds) lives in `goal-catalogue-drift.mjs` (`--selftest` 10/10 red), not in this guard, even though the headers say it does (C2). |
| 10 | Deleted or weakened tests | **GO-WITH-CHANGES** | The smoke deletions (b220 harvest daily, RETUNE-1, the daily half of Tier-1) target code that is really gone (`DAILY_TASK_POOL`, `generateDailyTasks`). The rewrites of rejections-journal P1b (switched to `hr_claim_quest`), intent-mismatch (now board-aware) and the modal-goal-claim week bind are equivalent. **C1 is a weakening.** |
| 11 | `goal-counter-kinds` re-point | **GO** (anchors) | The GATE_BLIND anchors match `2026-10-10-quest-combat-xp.sql:383-384` exactly once, and `--selftest` passes all 9 arms (exit 0). The plain-run `upTo` is C1. |
| 12 | Apply order | **GO** | Order: wave 1 → (throne-room, renown-throne-room: no shared objects, either order) → `2026-10-11-daily-board` → client cut → `2026-10-12-retire-daily-tasks`. There is a text conflict with the econ set in `schema-apply-order.json` and the schema-drift baseline. The second branch to land must merge and regenerate them; they are never hand-merged. |

## Conditions

- **C1** (CONFIRMED weakening of a standing guard). `tests/goal-counter-kinds.mjs:205` and `tests/goal-gold-retune.mjs:71,243,366` now stop their plain runs at `2026-10-08-content-holes.sql`. They no longer check the chain-end `hr_goal_state__ungated` / `hr_claim_goal__ungated`. A later restatement that reads lifetime counters, or pays a different amount, would pass both guards. §4 GATE(d) runs once, at apply time. **Fix:** run the full chain. Pick the claim probe from `hr_goal_board(false, now())`, as `tests/intent-mismatch.mjs:376` already does. For `plant`, accept `not_offered` or `not_complete` on the refusal half. The state-half checks are unaffected, because every row is still projected.
- **C2** (doc). `2026-10-11-daily-board.sql:22,218` and `src/data/goal-catalogue.js` credit `tests/daily-board.mjs` with the seed sweep and the pinned vectors. Both actually live in `tests/goal-catalogue-drift.mjs:208-229`. Correct the headers.

## Residual risks accepted
- Low, pre-existing: `not_offered`, like `unknown_goal`, is recorded before the slot ownership check, so a client-chosen `p_slot` keys `hr_rejections` rows. The rate gate (12/min) bounds this. `wrong_period` is still not recorded at all.
- Display only, fails closed: `goalClaimable` ignores the per-row `offered` field. For up to 120 s after UTC midnight a cached board can show a Claim button the server refuses with `not_offered`, which is recorded.
- The drift test binds pool membership only to the 2026-08-23 catalogue seed. A later delete of a catalogue row would show a goal the server refuses (fails closed). §4(b) catches a short board at apply time.
- `hr_claim_daily` stays client-callable until the retire migration applies. This is unchanged from today and bounded by its own once-guard.
