-- 2026-10-19-alpha-premium-grant.sql
-- Operator one-off (Tyler 2026-10-19, "this is for alpha"): premium for the closed-alpha
-- testers' heroes until the Early Access wipe. An explicit exception to CLAUDE.md §2
-- (no admin grants) for alpha testers only. Goes through the game's own hr_premium_grant,
-- which journals a player_ledger 'premium_grant' row per hero. No-op on a database
-- without these heroes (replay), so it is in 'excluded'.
do $g$
declare r record; v jsonb; n int := 0;
begin
  for r in select user_id, slot from public.player_state
            where user_id in ('0a47ba77-3a6d-495d-8a95-07480a9d90cf'::uuid,   -- Tyler (QA account)
                              '39e28e92-b519-4d11-a918-feab730c0ca2'::uuid,   -- Tyler
                              '0d959747-be5b-4ae3-9f5b-7c6de0bf1fbc'::uuid)   -- Andy
  loop
    v := public.hr_premium_grant(r.user_id, r.slot, timestamptz '2026-12-31 23:59:59+00', 'closed alpha tester (Tyler 2026-10-19)');
    if coalesce(v->>'ok','') <> 'true' then raise exception 'premium grant refused for % slot %: %', r.user_id, r.slot, v; end if;
    n := n + 1;
  end loop;
  raise notice 'alpha premium granted to % heroes', n;
end $g$;
