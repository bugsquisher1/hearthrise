/* DECLARED REMOVALS for 2026-12-15-account-gold.sql (lane c-account-gold, Tyler 2026-10-23: "it should just be
   account gold" — one gold purse per account, shared by every hero).

   That file restates hr_state_of WHOLE from the CHAIN-END image (its §0 pins md5 0bda8ab3: the
   2026-11-27-account-depot.sql body plus the anchored splices later files made, last 2026-12-14-shared-farm.sql),
   with ONE structural edit of its own: `gold` reads the account purse (`account_wallet.gold`) and `gold_v` (the
   wallet version) is projected beside it. tests/run-sql-tests.mjs PART 1f-ii diffs it against account-depot's text
   and fails on any removed line not listed here. GENERATED from that same diff (run-sql-tests' applyBody, the
   multiset line walk):

   hr_state_of (vs 2026-11-27-account-depot.sql):
     · the scalar line that read `v_st.gold` (this file: the purse, `coalesce(v_w.gold, 0)`, + `gold_v`);
     · the per-slot `plot_level` and `player_farm` reads, replaced by 2026-12-14-shared-farm.sql's anchored splice
       (the farm land is the account's) and carried here as that file installed them.

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_STATE_OF = Object.freeze([
  "      'slot', v_st.slot, 'gold', v_st.gold, 'gems', coalesce(v_w.gems, 0),",
  "      'plot_level', v_st.plot_level,",
  "        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),",
]);
