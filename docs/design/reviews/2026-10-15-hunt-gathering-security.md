# Security design review: hunt gathering (2026-10-14). Verdict: GO-WITH-CHANGES
Items 1–9 must be in the M-G2/M-G3 spec before any SQL is written. Items 10–13 must land before the feature is switched on.

1. **Make the kill and qty caps STATEFUL.**
   - Allow kills ≤ `pull_left_old + P × respawns in (respawn_at_old, to]`, and check that the stored `pull_left`/`respawn_at` only move forward.
   - Drop every "+1".
   - Why: per-settle caps with 10 s ticks allow about 3,600 kills/h.
2. **Settle which P wins.** C2 already has a player `pull_count` 1..8 (`hr_action_set_options`).
   - Either clamp `pull_count ≤ ground pull_size`, or scale `respawn_ms` by the P actually used.
   - The cap must use the P the engine actually used, read on the server.
3. **The DB asserts the time budget.**
   - `fight + gather + idle + down = window`, with `gather ≤ break` and no gathering during down time.
   - Carry identity: `gather_ms + carry_old = actions × interval + carry_new`, with `0 ≤ carry_new < interval`.
   - `interval ≥ ceil(node.ms × PACE × 0.70)`, read from the catalogue.
4. **Persist `hunt_sessions.gather_tool_carry numeric [0,1)`.**
   - Qty becomes exact: base × actions + doubles.
   - XP = actions × the floored per-action XP, for the node's own skill only.
5. **Gather rolls use the keyed HMAC seeder** (`swingSeederFor`) under a separate `g:` domain label. Add a SEED mutant that goes red on an unkeyed label.
6. **Hearthfind:** at most one find per action, only catalogue `(node, id)` pairs, each one journalled.
7. **`hr_hunt_set_gather` is deferred:**
   - It stores `gather_change_at = now()` / `gather_change_to` (the C2 `change_at` pattern), and the engine applies it at the first break after that.
   - Refuse with `settle_first` when the gap is over 20 s.
8. **No CAS on `version`** (player verbs could starve the tick's settle).
   - Use `hr_hunt_lock`, then `gather_from = stored gather_index` (else `session_moved`), plus `p_version` and the intent idempotency key.
   - The ledger's unique index is `(session_id, gather_index_from)`, partial `where to > from`.
9. **Re-validate on every settle:**
   - the node is in `hr_hunt_nodes(hunt_id)`
   - the level comes from `player_skills` at window start
   - the items are among the node's products
   - New and swapped sessions start `gather_node` as null. On a rebase, clamp the carry.
10. **The `standalone` check goes in `hr_worker_assign`, in the worker accrual re-read, and in `hr_apply set_activity`.**
11. **Extend `hr_hunt_accrue_fence` to the gather accrue rows.**
12. **Tool and level are read as they stood at window start**, OR item-moving verbs need `settle_first` on an open hunt with a gap over 20 s.
13. **Party:**
    - one pull/respawn state per party encounter, with members sharing the cap
    - `respawn_at` persists across re-entry to the same hunt
