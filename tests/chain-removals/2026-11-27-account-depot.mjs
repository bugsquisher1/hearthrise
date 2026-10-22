/* DECLARED REMOVALS for 2026-11-27-account-depot.sql (lane c-account-shared, Tyler 2026-10-22: Storage is
   one depot per account, shared by every hero).

   That file restates hr_state_of WHOLE from the 2026-10-27-core-bodies.sql image (its §0 pins md5 acfce7c8)
   with ONE structural edit: `bank` reads the account's depot instead of the per-slot player_bank row.
   tests/run-sql-tests.mjs PART 1f-ii diffs it against core-bodies and fails on any removed line not listed
   here. GENERATED from that same diff (run-sql-tests' applyBody, the multiset line walk):

   hr_state_of (vs 2026-10-27-core-bodies.sql):
     · the b438 bank-store comment block and its section header (the depot's own comment replaces them);
     · the per-slot `from public.player_bank where user_id = p_user and slot = v_st.slot` read.

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_STATE_OF = Object.freeze([
  '    -- bank-store (b438): the BANK item container, server-owned',
  '    -- (player_bank, no client write policy), projected as a flat {item_id:qty}',
  '    -- map beside `inventory`. The client folds it through the SAME',
  '    -- serverOwnedItem carve-out and the SAME inventory arm as the bag. Absent',
  '    -- row = real zero (qty>0 invariant + delete-on-zero in hr_bank_move).',
  '    -- ── bank — the server-owned bank container, beside `inventory` ──',
  '    --    introduced by 2026-08-27-bank-store.sql',
  "        from public.player_bank where user_id = p_user and slot = v_st.slot), '{}'::jsonb),",
]);
