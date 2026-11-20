-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1006-ledger-prune-uncap.sql — THE LEDGER PRUNE KEEPS UP WITH A THOUSAND DAILY HEROES AND MORE
--   (lane/c-server-cost, backend-architect, 2026-11-19; the 11-19 server audit, row 7, first half).
--
-- STATUS: supabase/migration-notes/1006-ledger-prune-uncap.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE ARITHMETIC ──────────────────────────────────────────────────────────
-- INFLOW, measured (tools/qa/audit-2026-11-19-server/scale-probe.result.json; tests/per-player-cost.mjs): 49 player_ledger rows
--   a hunting hero-hour (a lone hero; 43 in a party of four). Hunts run on the server with the browser closed, so a hero can hunt
--   around the clock: the worst case is 24 hero-hours a day.
--     1,000 daily heroes x 24 h x 49 rows = 1,176,000 rows a day   (the audit's 17.5 h a day: 857,500)
-- OUTFLOW before this file: hr-ledger-prune hourly ('7 * * * *') x hr_ledger_prune(20000) = 20,000 x 24 = 480,000 rows a day,
--   outrun at 480,000 / (24 x 49) = 408 heroes hunting around the clock (the audit: ~560 at 17.5 h). Past that the ledger
--   grows without bound after its 90 retained days.
-- OUTFLOW after: every 5 minutes ('2-57/5 * * * *', :02, :07, ... :57, so :07 still runs) x the same 20,000-row batch
--     = 20,000 x 12 x 24 = 5,760,000 rows a day = 4.9x the 1,000-hero worst case; outrun near 4,898 heroes hunting around the
--   clock. A backlog of 1,000,000 rows drains in 50 runs (~4 h 10 min) on top of the inflow.
-- COST of a run, measured on the replay (PGlite, 60,000 rows 100 days old): a full 20,000-row batch (roll up, then delete) 89-112 ms;
--   a run with nothing due 3 ms. The batch is an INDEX RANGE SCAN on player_ledger_pkey (at, id), which leads with `at` and is the
--   prune's own `order by at, id`: no sort, no full scan, so NO new index (a second btree on `at` would only double the index
--   writes on the busiest insert table). §4 proves the plan exists. Each run stays one bounded transaction (20,000 rows), so the
--   WAL comes in even slices instead of one hourly burst.
-- hr_ops.capacity_config.ledger_prune_rows_day (1002-ops-capacity-sample.sql's wall 4, which assumed 480,000) follows: 5,760,000,
--   its default too, so a rebuild reads the same ceiling.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The prune's body is unchanged (`for update skip locked`, rollup then delete, the wallet journal exempt): two runs never take
--   one row. cron.schedule by name replaces the job. A second apply schedules and updates the same values: byte-identical.
-- EXPLOIT SURFACE: none (an operator schedule and an operator-only dial). COST: above.
-- EDGE: none. CLIENT: none.
-- REVERSIBLE: hr_cron_ensure('hr-ledger-prune', '7 * * * *', 'select public.hr_ledger_prune(20000)') and the dial back to 480,000.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_ledger_prune(integer)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regclass('hr_ops.capacity_config') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'hr_ops' and table_name = 'capacity_config' and column_name = 'ledger_prune_rows_day') then
    raise exception 'PRECONDITION: the prune, the cron helper or 1002-ops-capacity-sample.sql''s dial is missing'; end if;
end $mig$;

-- ── §1 THE SCHEDULE AND THE WALL ─────────────────────────────────────────────
do $mig$ begin perform public.hr_cron_ensure('hr-ledger-prune', '2-57/5 * * * *', 'select public.hr_ledger_prune(20000)'); end $mig$;
alter table hr_ops.capacity_config alter column ledger_prune_rows_day set default 5760000;
update hr_ops.capacity_config set ledger_prune_rows_day = 5760000 where id;

-- ── §4 THE SELF-CHECK, BY EXECUTING IT ───────────────────────────────────────
-- (a) one active job, every 5 minutes, the same batch; (b) the wall reads its capacity (12 runs an hour x 24 x 20,000);
-- (c) the prune's batch has an index range scan on the primary key (at, id) to take, in its own order (sequential and bitmap
--     scans off: an empty replay has no statistics; measured with 60,000 rows the planner takes it unprompted), rolled back.
do $$
declare v_plan text; v_r record;
begin
  if (select count(*) from cron.job where jobname = 'hr-ledger-prune' and active) <> 1
     or (select schedule from cron.job where jobname = 'hr-ledger-prune') is distinct from '2-57/5 * * * *'
     or (select command from cron.job where jobname = 'hr-ledger-prune') is distinct from 'select public.hr_ledger_prune(20000)' then
    raise exception 'VERIFY(a): hr-ledger-prune is %', (select jsonb_agg(jsonb_build_object('s', schedule, 'c', command, 'on', active)) from cron.job where jobname = 'hr-ledger-prune'); end if;
  if (select ledger_prune_rows_day from hr_ops.capacity_config where id) <> 12 * 24 * 20000
     or (select column_default from information_schema.columns where table_schema = 'hr_ops' and table_name = 'capacity_config'
          and column_name = 'ledger_prune_rows_day') is distinct from '5760000' then
    raise exception 'VERIFY(b): the wall reads % rows a day, not 12 x 24 x 20,000', (select ledger_prune_rows_day from hr_ops.capacity_config where id); end if;
  begin
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_bitmapscan', 'off', true);   -- (an empty replay has no statistics: the table's own size picks the scan)
    v_plan := '';
    for v_r in execute 'explain select id, at from public.player_ledger where at < now() - interval ''90 days'' and kind <> ''wallet''
                         order by at, id limit 20000 for update skip locked' loop
      v_plan := v_plan || v_r."QUERY PLAN" || ' / ';
    end loop;
    if v_plan !~ 'Index Scan using player_ledger_pkey' or v_plan ~ 'Sort' then
      raise exception 'VERIFY(c): the prune''s batch plan is %', v_plan; end if;
    raise exception using errcode = 'HRLP1', message = 'plan read - rolling back';
  exception when sqlstate 'HRLP1' then null;
  end;
  raise notice 'ledger-prune-uncap: 20,000 rows every 5 minutes = 5,760,000 a day, by the primary key''s index';
end $$;
