/* DECLARED REMOVALS for 2027-01-18-dead-surfaces-cut.sql (lane c-dead-surfaces, 2026-10-24: cut what has no
   screen and no player).

   That file restates hr_state_of WHOLE from the LIVE image (its §0 pins md5 05067547, the 2026-12-15-account-gold.sql
   body: replay chain = production, measured 2026-10-24) and removes exactly four blocks, nothing else:
     · state.workers_accrued_to (the crew watermark) and its comment block;
     · `workers` (the crew array) and `farm` (the per-plot array with waterings: the Farm window reads the
       `farm_land` section) with their comment blocks;
     · inventory_complete's third (crew) arm and its header line.
   tests/run-sql-tests.mjs PART 1f-ii diffs it against account-gold's text and fails on any removed line not listed
   here. GENERATED from that same diff (run-sql-tests' applyBody, the multiset line walk).

   FROZEN: regenerate only together with the migration, and re-read every line. */
export const HR_STATE_OF = Object.freeze([
  "      -- worker-settlement slice: the hired crew's own accrual watermark. The",
  "      -- accrual shell reads it as `st.workers_accrued_to` and settles",
  "      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other",
  "      -- watermarks, so a nested bag cannot hide a missing column behind a default.",
  "      -- ── state.workers_accrued_to — the hired crew's own watermark ──",
  "      --    introduced by 2026-08-25-workers.sql",
  "      'workers_accrued_to', v_st.workers_accrued_to,",
  "    -- worker-settlement slice: the hired crew, server-owned (player_workers, no",
  "    -- client write policy). The accrual shell reads this as `env.workers` and",
  "    -- settles each assigned worker; the client renders it and computes no yield.",
  "    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──",
  "    --    introduced by 2026-08-25-workers.sql",
  "    'workers', coalesce((",
  "      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,",
  "                                          'skill', skill, 'target_id', target_id,",
  "                                          'xp', xp, 'acc_ms', acc_ms,",
  "                                          -- worker hire floor (2026-09-09 P0): the engine pays a",
  "                                          -- worker only for time it has EXISTED. The shared",
  "                                          -- workers_accrued_to watermark is stale by construction",
  "                                          -- for a character who never had a crew, so without this",
  "                                          -- the first hire collects a 24h backlog.",
  "                                          'hired_at', hired_at)",
  "                       order by uid)",
  "        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),",
  "    -- ── farm — the plots, with the FULL waterings array (Q-5) ──",
  "    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql",
  "    'farm', coalesce((",
  "      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,",
  "                                          'planted_at', planted_at, 'watered_at', watered_at,",
  "                                          -- farm-projection (Q-5): the FULL watering history, the",
  "                                          -- exact array hr_farm_growth_hours() reads. Projected",
  "                                          -- whole because growth is the clipped 2h-window OVERLAP",
  "                                          -- sum, which no count/last pair can reproduce — a lossy",
  "                                          -- shape makes the client's isReady disagree with the",
  "                                          -- server's and strands a ready crop behind a Water",
  "                                          -- button. NOT NULL in the table; coalesce is belt-and-",
  "                                          -- braces so a future nullable column can never emit a",
  "                                          -- json null the client would have to special-case.",
  "                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))",
  "                       order by plot_idx)",
  "        -- SHARED-FARM (2026-12-14-shared-farm.sql): the ACCOUNT's planted plots, the same on every",
  "        -- hero; watered_at is the last watering (the array is the record).",
  "        from (select af.*, (select max(w) from unnest(af.waterings) w) as watered_at",
  "                from public.account_farm_plots af where af.user_id = p_user) f), '[]'::jsonb),",
  "    --    introduced by 2026-08-11-apply-engine.sql",
  "    --    the third (worker) arm was added by 2026-08-25-workers.sql",
  "      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────",
  "      -- Also INCOMPLETE when the crew is non-empty AND its window is open",
  "      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —",
  "      -- a lagging read would be a false-positive that lets the flip delete a",
  "      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.",
  "      and (not exists (select 1 from public.player_workers pw",
  "                        where pw.user_id = p_user and pw.slot = v_st.slot)",
  "           or now() - v_st.workers_accrued_to < interval '60 seconds')",
]);
