# Security review: econ-crew-and-sink (2026-10-08)

Reviewer: security-engineer (veto, CLAUDE.md §2). Read-only. Nothing was applied anywhere.
Reviewed: `origin/lane/econ-crew-and-sink`. The FINAL head is **01cc6de082a98a92df9d8195b9444cbc85f66189**. It differs from the first head I reviewed, 07ada6c8, by one change only: c527eafe moves `kill-credit-prune-8d` FIRST among the wave-1 files, which closes wave 1's apply-order note. On 01cc6de0 I re-ran: schema-drift exit 0, throne-room exit 0 and pack-edge exit 0, with the same hash. Only the delta over `origin/lane/c-client-authored-rewards` @c527eafe (wave 1, GO in `SEC_REVIEW_WAVE1_2026-10-08.md`) was reviewed. That ancestor is confirmed.
Edge: `node tools/pack-edge.mjs hr-accrue --hash` on 01cc6de0 (and 07ada6c8) = **8cbd84b0f868e2c502dfc3b6e607d226ce98d689b8b1102e739d3ae5e5079e40** (exit 0). It supersedes wave 1's 7c664322 and covers wave 1, the crew seats and the `throne_room.*` forward.

## Evidence (every value below is an exit code I saw)
- `tests/schema-drift.mjs` exit 0. `tests/throne-room.mjs` exit 0, including T4: a re-apply leaves both catalogues byte-identical. `--selftest` exit 0, 8/8 mutants caught.
- `tests/worker-accrual.mjs` exit 0. W15: attended at 7 s and at 91 s settles == one 24 h away settle, byte-identical with all six seats in use. `--selftest` exit 0, 11/11 mutants caught.
- `gen-throne-room --check` exit 0. `unlock-catalogue-ownership` exit 0.
- My own mutants of the seller (`2026-08-19-companion-unlocks.sql`) turned the throne-room file RED on the replay. With the rung-order check removed, §4(b) failed: rung 2 sold before rung 1. With the castle gate removed, §4(a) failed: rung 1 sold at the camp.
- My own probe on the replayed chain:
  - `authenticated` and `anon` are both refused EXECUTE on `hr_unlock_buy`, and refused writes to `hr_unlock_offers`, `hr_unlocks` and `player_progress`. RLS is on for all four tables, and the policies are SELECT-only.
  - `hr_assert_grant_hygiene()` returns all lists empty. No RPC was added, so `hr_client_rpc_baseline` is unchanged.
  - Buying the whole room makes 30 ledger rows summing −265,153,000. Rung 31 is `unknown_offer`. A stale version is refused with `version_conflict`.

| Item | Verdict | Notes / conditions |
|---|---|---|
| 1 Crew ruling | **GO** | The seat order is `hired_at`. That is a server `default now()`, and `hr_worker_hire` is its only writer. The PK is (user, slot, uid), so a hand cannot be counted twice. No dismiss RPC exists, so a player cannot fire and re-hire, and a re-hire would sit last anyway. The crew data comes from `env.workers`, read in the same transaction as the rest of the engine's state, never from the request body. With 6 seats summing to 3.85, total pay only goes up as more hands work, so parking a hand never pays more. A seventh hand and a hand with no `hired_at` are both paid 0. The carry is stored as full-pace progress, so a change of seat re-prices nothing (W13 ≤ 224,000 ms, under the 900,000 limit). The client's crew screen uses `seatPct` only for display. Condition: the hr-accrue deploy must ship with the client cut (pace shown == pace paid, §6), after the ten wave-1 applies. |
| 2 Throne Room | **GO** | The price is read from `hr_unlock_offers` under the per-character advisory lock plus `FOR UPDATE` plus a mandatory version check. That rules out a double-buy and a skipped rung. The castle gate is the max over the server's own `property` namespace. The edge forwards an offer id and nothing else. The one live clamp is 32/day per namespace plus 240/min, and the ladder itself bounds lifetime spend at 265M. The money only leaves the player who spends it. The hall name is NOT player-authored: it is one of three fixed catalogue strings chosen by the server rung, and `esc()` is applied to it. Today other players never see it. |
| 3 Order / replay / edge | **GO** | `2026-10-08-throne-room.sql` is the last of the ten wave-1 files. It contains no function body and the fingerprint is unchanged. The edge hash is stated above. Applying it before the edge deploy is fail-closed: the old edge rejects the `throne_room.*` ids because they don't match its id format. |

Residual risks, accepted, all self-only:
- (a) A worker assignment applies to the whole unsettled window (`hr_worker_assign` does not settle first). This predates this branch and is the `assigned_at` lane-C item. The seats add no new gain from it.
- (b) Renown's goldLog term drops as gold is spent: 101 → 94 for the full room. The Game Designer should note that the "prestige" sink lowers renown. §4(f) measures xp, items and gems, but not renown or perks.
- (c) When the Art Director's profile/inspect handoff shows the hall name to other players, it must read the other player's rung from a server projection, never from a value their client sends. That surface needs its own review.

## RE-VERIFY: ca0ce896 (`2026-10-08-renown-throne-room.sql`), verdict **GO**

Reviewed: `origin/lane/econ-crew-and-sink` @ **ca0ce8963dc3c01bb58d8e652d1f8c1cae27689b**. The edge hash is unchanged: 8cbd84b0…5079e40 (pack-edge exit 0).

- **Byte-identical apart from the term: CONFIRMED.** I diffed `pg_get_functiondef(hr_renown_of)` on the replay at the chain end before this file and after it. There are exactly two hunks: the `tr`/`gw` CTEs, and the goldLog term reading `gw.g`. The R5 kill discounts, every weight, the declared zeroes and the engine-only ACL are unchanged.
- **Inflation: none found.**
  - The rung comes only from `player_progress` with `period_key=''`. `hr_unlock_buy` is its only writer, and the storage guard is raise-only. The `player_progress_unlock_shape` check refuses a period row; my probe tried one and was refused.
  - Prices are read only from `hr_unlock_offers` where `source='gen-throne-room'`. The table is engine-written, the values 1..30 are distinct, and the throne-room §3 asserts all of that.
  - No refund or sell-back path exists.
  - My mutants: counting the room twice → §4(b) RED ("101 → 104"); scoring held gold only → §4(b) RED ("piece 21 LOWERED 101 → 100").
- **Bound:** the term only puts back renown the spent gold scored while held, so it can never exceed what earning and holding that gold would score. The maximum is a full room with 0 gold held: +43 renown (58 → 101 measured), equal to 8·(log10 265,153,000 − 3).
- **Guards:** `throne-room` exit 0, `--selftest` exit 0 (10/10 mutants caught), `schema-drift` exit 0.

**Conditions:**
- (1) Any future re-price of the Throne Room catalogue now also moves renown retroactively. That makes it a ranked-surface change and needs a Security GO.
- (2) For the Coordinator, after the apply: `hr_renown_of` gets a new last toucher, so re-measure `live-hash-drift`.
- (3) The client twin in `src/features/renown.js` is display-only and reads the server rung, consistent with §6.
