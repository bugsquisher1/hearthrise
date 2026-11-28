/* DECLARED REMOVALS for 1079-one-town-work-cut.sql (lane/bench-cut-server, 2026-11-28: the bench leaves the server, 09-crafting.md 4.17).

   HR_APPLY: that file restates hr_apply WHOLE from the CHAIN END (pg_get_functiondef after every file in the apply order before it:
   1075-work-blocks-midnight.sql's image, md5 10bfc07d) and run-sql-tests PART 1f-ii diffs it against 1075, the link before it. What
   it removes is the bench tax and the bench's Storage take, nothing else:
     · BENCH_TAX: the `bench_tax` delta key, the v_tax / v_tax_keep declarations, the whole BENCH-TAX block (hr_bench_tax_settle and
       its bench_tax_bad refusal), the purse floor it set and its bench_tax_purse code, the two state columns it wrote, its `bt`
       journal key and its bench_tax_% release code (the line before that release clause now closes the condition).
     · TAKE: the Storage take's rule (hr_bench_inputs() -> the bench) and the comments that described a bench; the take now reads
       hr_hearth_fuel_of, the Great Hearth's fuel run, the one artisan run the cut keeps.
   GENERATED from run-sql-tests' own applyBody and multiset walk (1075 -> this file), the lane's scratch removals.mjs.

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_APPLY = Object.freeze([
  "    -- BENCH-TAX: the engine's count of a taxed window's crafts (hr_bench_tax_settle re-derives the fee from it).",
  "    'bench_tax',",
  "  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the bench inputs an artisan settle takes (bag, then",
  "  -- the account's Storage) before the item loop, and what hr_materials_take answered for them.",
  "  -- BENCH-TAX (2027-02-19-bench-tax.sql): hr_bench_tax_settle's answer for this window, and the gold the fee may not go under.",
  "  v_tax jsonb;",
  "  v_tax_keep bigint;",
  "    -- A BENCH'S INPUTS COME FROM THE HERO'S BAG FIRST, THEN THE ACCOUNT'S STORAGE. On an artisan settle (journal",
  "    -- kind 'craft', a window: accrued_to) of a hero whose SERVER pointer is a bench, every spent line that bench's",
  "    -- catalogue row consumes (hr_bench_inputs(), generated from src/data/recipes.js) is taken HERE, whole, by",
  "         and coalesce(public.hr_bench_inputs() -> v_st.active_id, '{}'::jsonb) ? t.k;",
  "    -- ── BENCH-TAX (2027-02-19-bench-tax.sql; Tyler 2026-11-01) ──────────────",
  "    -- A `craft` window of a hero whose SERVER pointer is a bench: the fee is re-derived here, whole, before the purse (the",
  "    -- one lock order holds: the take above, then the purse, last). What it answers moves at the GOLD block and the state update.",
  "    v_tax := null;",
  "    v_tax_keep := null;",
  "    if p_delta ? 'accrued_to' and p_delta #>> '{journal,kind}' = 'craft'",
  "       and v_st.active_kind = 'artisan' and v_st.active_id is not null then",
  "      v_tax := public.hr_bench_tax_settle(v_uid, v_slot, v_st, p_delta, v_skill_cost);",
  "      v_tax_keep := (v_tax->>'keep')::bigint;",
  "    elsif p_delta ? 'bench_tax' then",
  "      perform public.hr_reject('bench_tax_bad', jsonb_build_object('why', 'a count on a window that is not a bench''s'));",
  "        -- BENCH-TAX: the fee stops at what the hero keeps; a shortfall is a statement about the engine's read (released below).",
  "        v_new_gold := public.hr_purse_move(v_uid, v_n, coalesce(v_tax_keep, 0));",
  "          perform public.hr_reject(case when v_tax_keep is not null then 'bench_tax_purse' else 'insufficient_gold' end,",
  "        -- SKILLS-FROM-STORAGE: a bench input the block above already took (the bag first, then Storage).",
  "           -- BENCH-TAX: the carried remainder and this hero's latest run, from the LOCKED row and the server's own fee.",
  "           bench_tax_carry_mg = coalesce((v_tax->>'carry')::int, bench_tax_carry_mg),",
  "           bench_tax_run = coalesce(v_tax->'run', bench_tax_run),",
  "    -- BENCH-TAX: the window's crafts, the fee, the gold and the carry after, as the server derived them (one row a window).",
  "    if v_tax ? 'bt' then",
  "      v_meta := v_meta || jsonb_build_object('bt', v_tax->'bt');",
  "    -- SKILLS-FROM-STORAGE: what the account's Storage paid of this settle's bench inputs (the rest left the bag).",
  "    end if;",
  "    end if;",
  "          or (v_out->>'error' = 'insufficient_item' and v_out ? 'storage')",
  "          -- BENCH-TAX: every refusal is about the engine's read (the shared purse, the room, a price, an older edge); stored, the",
  "          -- re-derived key would replay it for a day, because the hero's version did not move.",
  "          or v_out->>'error' like 'bench\\_tax\\_%') then",
  "",
]);
