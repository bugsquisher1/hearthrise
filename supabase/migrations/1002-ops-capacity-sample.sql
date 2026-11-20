-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1002-ops-capacity-sample.sql — A CAPACITY SAMPLE EVERY MINUTE, AND AN ALARM AT 70% OF ANY WALL.
--   (lane/c-ops-gates, reliability-engineer, 2026-11-19; server audit tools/qa/audit-2026-11-19-server/findings.md row 4)
--
-- STATUS: supabase/migration-notes/1002-ops-capacity-sample.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. CLIENT: none (tools/vitals.mjs prints the latest sample). No player row is read for value or written.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The audit names four walls the game meets as it grows, in order, and found "no alarm on any wall above; no request id
-- or lag series found". The watch (2027-02-22-alert-relay.sql) pages when something is BROKEN; nothing said when the game
-- is FILLING. Every minute this samples each wall as a percentage of its ceiling, keeps the series 14 days, and files ONE
-- critical alarm episode (hr_ops.alert_note: the relay posts it, it clears itself) when a wall stays at 70% or more for
-- 10 minutes: time to buy compute or cut per-hero cost (CLAUDE.md §6 rule 10) before players feel it.
--
-- ── THE FOUR WALLS (each a % of its ceiling; null = not measurable here, never 0) ──────────────────────────────────────
--   db      DATABASE LOAD PROXY. Statement execution time per wall-clock second (pg_stat_statements' total_exec_time, the
--           delta since the previous sample) over db_cores x 1000 ms. 100% = every core busy executing statements all
--           minute. ASSUMED: db_cores = 2 (Small compute; the audit's assumption). Lock and I/O waits count as busy,
--           so it reads high rather than low. Null on the first sample, after a stats reset, or without the extension.
--   tick    THE TICK'S FAN-OUT. Open hunt instances over the instances the roster can lease in one settle window:
--           floor((flush + cadence) / cadence) fires x hunt_bodies_max x hunt_body_max (hr_tick_config; 10 x 32 x 4 =
--           1,280 at today's dials, the audit's measured "ceiling 1,280 browser-closed instances"). The worst settle lag
--           is kept beside it (detail.tick_worst_lag_s); hunts-stalled in the watch pages on lag itself.
--   edge    EDGE CPU. The largest engine time of any tick body answered in the last minute (pg_net's held answers,
--           hunts.engine_ms) over the engine budget (edge_budget_ms = hunt-settle.js HUNT_ENGINE_BUDGET_MS = 800).
--           Past 100% a body defers hunts (cpu_budget) and they wait a fire; detail.edge_deferred counts them.
--   ledger  THE JOURNAL VS ITS PRUNE. player_ledger inserts per day (pg_stat_user_tables' n_tup_ins delta, so no scan
--           of the table: player_ledger has NO index on `at`, and a count(*) by time every minute would be a sequential
--           scan) over the prune's daily capacity (ledger_prune_rows_day = hr_ledger_prune(20000) x 24 hourly fires =
--           480,000, the audit's figure). Past 100% the 90-day journal outgrows its retention.
--           ⚠ COORDINATION: lane/c-server-cost changes hr_ledger_prune. A file that changes the prune's cap or schedule
--           updates hr_ops.capacity_config.ledger_prune_rows_day in the same file, or this wall reads the old ceiling.
--
-- ── WHAT IT COSTS ────────────────────────────────────────────────────────────
--   One cron job a minute: a sum over pg_stat_statements (bounded by pg_stat_statements.max, 5,000), one stats-view
--   row, the open-instance read the watch already makes each minute, and pg_net's last minute of answers (about 6
--   rows). Estimated under 20 ms a run, NOT measured on production. Rows: 1,440 a day, kept 14 days (~20,000 rows,
--   ~8 MB), pruned by the sampler itself, 5,000 at most a run. The same at 10x and 100x players: one row a minute.
--   RETENTION IS IN THIS FILE (the rule since game_events): hr_ops.capacity_config.keep.
--
-- ── WHO CAN SEE IT ───────────────────────────────────────────────────────────
--   hr_ops is not in PostgREST's schemas and no client or engine role holds USAGE on it, so a client can neither read
--   nor write the samples; EXECUTE is revoked from every role but the owner. tools/vitals.mjs reads the latest row
--   through the management endpoint (read-only), as it reads the relay's tables.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
--   Stop it:  select public.hr_cron_drop('hr-ops-capacity');   (no new samples, no new alarms; the series stays)
--   Remove:   drop function hr_ops.capacity_sample(text, interval), hr_ops.capacity_alarm(jsonb, text, interval),
--             hr_ops.capacity_walls(jsonb); drop table hr_ops.capacity_samples, hr_ops.capacity_config;
--             delete from hr_ops.watch_state where code like 'capacity-%';
--   Tune:     update hr_ops.capacity_config set db_cores = 4 where id;   (a compute change; the same for the other dials)
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regnamespace('hr_ops') is null
     or to_regprocedure('hr_ops.alert_note(text,boolean,interval,text,jsonb)') is null
     or to_regclass('public.maintenance_alerts') is null or to_regclass('public.hr_tick_config') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_instances') is null
     or to_regclass('public.player_ledger') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: an object this file reads is missing'; end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_tick_config'
         and column_name in ('cadence_seconds', 'flush_seconds', 'hunt_body_max', 'hunt_bodies_max')) <> 4 then
    raise exception 'PRECONDITION: hr_tick_config lacks a dial this file reads'; end if;
end $mig$;

-- ── §1 THE DIALS AND THE SERIES ──────────────────────────────────────────────
create table if not exists hr_ops.capacity_config (
  id                    boolean primary key default true check (id),
  db_cores              int      not null default 2      check (db_cores between 1 and 256),
  edge_budget_ms        int      not null default 800    check (edge_budget_ms between 100 and 10000),
  ledger_prune_rows_day bigint   not null default 480000 check (ledger_prune_rows_day > 0),
  alarm_pct             numeric  not null default 70     check (alarm_pct > 0 and alarm_pct <= 100),
  alarm_after           interval not null default interval '10 minutes',
  keep                  interval not null default interval '14 days' check (keep >= interval '1 day')
);
-- An operator's tuning survives a second apply.
insert into hr_ops.capacity_config (id) values (true) on conflict (id) do nothing;

create table if not exists hr_ops.capacity_samples (
  id               bigserial   primary key,
  at               timestamptz not null default now(),
  db_pct           numeric,
  tick_pct         numeric,
  edge_pct         numeric,
  ledger_pct       numeric,
  stmt_ms_total    double precision,   -- pg_stat_statements' cumulative execution ms: the next sample's delta
  ledger_ins_total bigint,             -- player_ledger's cumulative inserts (pg_stat_user_tables): the next sample's delta
  detail           jsonb       not null default '{}'::jsonb
);
create index if not exists capacity_samples_at on hr_ops.capacity_samples (at desc);
alter table hr_ops.capacity_config  enable row level security;
alter table hr_ops.capacity_samples enable row level security;
revoke all on table hr_ops.capacity_config, hr_ops.capacity_samples from public;
revoke all on sequence hr_ops.capacity_samples_id_seq from public;

-- ── §2 THE WALLS, FROM ONE OBSERVATION (pure: §4 judges it on planted numbers) ──
create or replace function hr_ops.capacity_walls(p jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $fn$
  select jsonb_build_object(
    'db', case when (p->>'db_exec_ms') is null or coalesce((p->>'db_secs')::numeric, 0) <= 0
                    or coalesce((p->>'db_cores')::numeric, 0) <= 0 then null
               else round(100 * (p->>'db_exec_ms')::numeric / ((p->>'db_secs')::numeric * 1000 * (p->>'db_cores')::numeric), 1) end,
    'tick', case when coalesce((p->>'tick_capacity')::numeric, 0) <= 0 then null
                 else round(100 * coalesce((p->>'tick_open')::numeric, 0) / (p->>'tick_capacity')::numeric, 1) end,
    'edge', case when coalesce((p->>'edge_budget_ms')::numeric, 0) <= 0 or (p->>'edge_bodies') is null then null
                 when (p->>'edge_bodies')::int = 0 then 0
                 else round(100 * coalesce((p->>'edge_max_ms')::numeric, 0) / (p->>'edge_budget_ms')::numeric, 1) end,
    'ledger', case when (p->>'ledger_rows_day') is null or coalesce((p->>'ledger_prune_rows_day')::numeric, 0) <= 0 then null
                   else round(100 * (p->>'ledger_rows_day')::numeric / (p->>'ledger_prune_rows_day')::numeric, 1) end)
$fn$;

-- ── §3 THE ALARM: ONE EPISODE A WALL (hr_ops.alert_note files it, the relay posts it, a clear acks it) ──
create or replace function hr_ops.capacity_alarm(p_walls jsonb, p_prefix text default 'capacity-', p_after interval default null)
returns text[] language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c hr_ops.capacity_config%rowtype;
  w record; v_pct numeric; v_on boolean; v_firing text[] := '{}';
begin
  select * into c from hr_ops.capacity_config where id;
  for w in select * from (values
    ('db',     'Database load', 'the statements keep the database cores busy: buy compute, or cut per-hero cost (rule 10)'),
    ('tick',   'Tick fan-out',  'open hunts near what the roster can lease a window: raise hunt_bodies_max or shards before hunts lag'),
    ('edge',   'Edge CPU',      'a tick body nears its engine budget: hunts start deferring a fire; smaller bodies or a lighter settle'),
    ('ledger', 'Ledger prune',  'the journal grows faster than the hourly prune deletes: raise the prune before the 90 days outgrow it')
  ) x(code, label, act) loop
    v_pct := (p_walls->>w.code)::numeric;
    v_on := v_pct is not null and v_pct >= c.alarm_pct;
    if v_on then v_firing := v_firing || w.code; end if;
    perform hr_ops.alert_note(coalesce(p_prefix, 'capacity-') || w.code, v_on, coalesce(p_after, c.alarm_after),
      format('Capacity: %s at %s%% of its ceiling (alarm at %s%% for %s): %s.', w.label, v_pct, c.alarm_pct,
             coalesce(p_after, c.alarm_after), w.act),
      jsonb_build_object('wall', w.code, 'pct', v_pct, 'alarm_pct', c.alarm_pct));
  end loop;
  return v_firing;
end $fn$;

-- ── §4 THE SAMPLE ────────────────────────────────────────────────────────────
create or replace function hr_ops.capacity_sample(p_prefix text default 'capacity-', p_after interval default null)
returns jsonb language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c hr_ops.capacity_config%rowtype;
  v_prev hr_ops.capacity_samples%rowtype;
  v_stmt double precision; v_ins bigint; v_secs numeric;
  v_cadence numeric; v_flush numeric; v_body int; v_bodies int; v_cap bigint;
  v_open int := 0; v_worst numeric;
  v_edge_bodies int := 0; v_edge_max numeric; v_edge_def int := 0; v_edge_err text;
  v_db_ms double precision; v_rows_day numeric;
  v_obs jsonb; v_walls jsonb; v_firing text[];
begin
  select * into c from hr_ops.capacity_config where id;
  select * into v_prev from hr_ops.capacity_samples order by at desc, id desc limit 1;
  v_secs := extract(epoch from now() - v_prev.at);

  -- db: the extension may be absent (a replay) or unreadable; either is null, never a failed sample.
  if to_regclass('extensions.pg_stat_statements') is not null then
    begin execute 'select sum(total_exec_time) from extensions.pg_stat_statements' into v_stmt;
    exception when others then v_stmt := null; end;
  end if;
  -- A delta needs a previous sample between 30 s and 15 min old, and no stats reset between (a negative delta).
  if v_stmt is not null and v_prev.stmt_ms_total is not null and v_secs between 30 and 900 and v_stmt >= v_prev.stmt_ms_total then
    v_db_ms := v_stmt - v_prev.stmt_ms_total;
  end if;

  -- ledger: cumulative inserts on the journal and any partition of it; no scan of the table.
  select sum(s.n_tup_ins)::bigint into v_ins from pg_stat_user_tables s
   where s.relid = 'public.player_ledger'::regclass
      or s.relid in (select i.inhrelid from pg_inherits i where i.inhparent = 'public.player_ledger'::regclass);
  if v_ins is not null and v_prev.ledger_ins_total is not null and v_secs between 30 and 900 and v_ins >= v_prev.ledger_ins_total then
    v_rows_day := round((v_ins - v_prev.ledger_ins_total) * 86400 / v_secs);
  end if;

  -- tick: what the roster can lease in one settle window, and what is open.
  select coalesce(t.cadence_seconds, 10), coalesce(t.flush_seconds, 90), coalesce(t.hunt_body_max, 1), coalesce(t.hunt_bodies_max, 1)
    into v_cadence, v_flush, v_body, v_bodies from public.hr_tick_config t where t.id;
  v_cap := floor((coalesce(v_flush, 90) + coalesce(v_cadence, 10)) / greatest(coalesce(v_cadence, 10), 1))::bigint
           * coalesce(v_bodies, 1) * coalesce(v_body, 1);
  -- From the OPEN sessions (the partial index hunt_sessions_one_open holds exactly them), never a scan of every instance ever.
  select count(distinct s.instance_id)::int, max(extract(epoch from now() - i.settled_to)) into v_open, v_worst
    from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
   where s.ended_at is null;

  -- edge: the tick answers pg_net holds from the last minute (an unreadable answer is skipped, never a failed sample).
  if to_regclass('net._http_response') is not null then
    begin
      execute $q$
        select count(*)::int, max(e.ms), coalesce(sum(e.def), 0)::int
          from (select case when (b#>>'{hunts,engine_ms}') ~ '^[0-9]{1,9}$' then (b#>>'{hunts,engine_ms}')::numeric end as ms,
                       case when (b#>>'{hunts,deferred}') ~ '^[0-9]{1,9}$' then (b#>>'{hunts,deferred}')::int else 0 end as def
                  from (select r.content::jsonb as b from net._http_response r
                         where r.created > now() - interval '1 minute' and length(r.content) < 65536
                           and r.content like '{%' and r.content like '%"op":"tick"%') x
                 where b ? 'hunts') e $q$
        into v_edge_bodies, v_edge_max, v_edge_def;
    exception when others then v_edge_err := sqlstate; v_edge_bodies := null;   -- unreadable: null, never a false 0%
    end;
  end if;

  v_obs := jsonb_build_object(
    'db_exec_ms', v_db_ms, 'db_secs', case when v_db_ms is not null then v_secs end, 'db_cores', c.db_cores,
    'tick_open', v_open, 'tick_capacity', v_cap,
    'edge_bodies', v_edge_bodies, 'edge_max_ms', v_edge_max, 'edge_budget_ms', c.edge_budget_ms,
    'ledger_rows_day', v_rows_day, 'ledger_prune_rows_day', c.ledger_prune_rows_day);
  v_walls := hr_ops.capacity_walls(v_obs);

  insert into hr_ops.capacity_samples (db_pct, tick_pct, edge_pct, ledger_pct, stmt_ms_total, ledger_ins_total, detail)
  values ((v_walls->>'db')::numeric, (v_walls->>'tick')::numeric, (v_walls->>'edge')::numeric, (v_walls->>'ledger')::numeric,
          v_stmt, v_ins,
          v_obs || jsonb_build_object('tick_worst_lag_s', round(v_worst), 'edge_deferred', v_edge_def,
                                      'edge_error', v_edge_err, 'active_backends',
                                      (select count(*) from pg_stat_activity where state = 'active' and backend_type = 'client backend')));

  v_firing := hr_ops.capacity_alarm(v_walls, p_prefix, p_after);

  -- RETENTION, in the same file as the table (bounded a run).
  delete from hr_ops.capacity_samples d
   where d.id in (select o.id from hr_ops.capacity_samples o where o.at < now() - c.keep order by o.id limit 5000);

  return v_walls || jsonb_build_object('firing', to_jsonb(v_firing));
end $fn$;

do $mig$
declare r text;
begin
  foreach r in array array['hr_ops.capacity_walls(jsonb)', 'hr_ops.capacity_alarm(jsonb,text,interval)',
                           'hr_ops.capacity_sample(text,interval)'] loop
    execute format('revoke execute on function %s from public', r);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated, service_role', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      execute format('revoke execute on function %s from hr_engine', r); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then
      execute format('revoke execute on function %s from hr_tick', r); end if;
  end loop;
end $mig$;

-- ── §5 THE JOB ───────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent: schedule by hand: select cron.schedule(''hr-ops-capacity'', ''* * * * *'', ''select hr_ops.capacity_sample()'')';
  else
    perform public.hr_cron_ensure('hr-ops-capacity', '* * * * *', 'select hr_ops.capacity_sample()');
  end if;
end $mig$;

-- ── §4 SELF-CHECK (properties asserted by executing them; every probe row is this block's own and is removed) ──
do $chk$
declare
  v jsonb; v_n0 bigint; v_n1 bigint; v_ref text; r record;
begin
  -- (a) operator-only: RLS on, no client privilege on either table, no client EXECUTE.
  if not (select relrowsecurity from pg_class where oid = 'hr_ops.capacity_samples'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'hr_ops.capacity_config'::regclass) then
    raise exception 'ops-capacity §4(a): RLS is off on a capacity table'; end if;
  for r in select x.role from (values ('anon'), ('authenticated'), ('service_role')) x(role)
             where exists (select 1 from pg_roles where rolname = x.role) loop
    if has_table_privilege(r.role, 'hr_ops.capacity_samples', 'select,insert,update,delete')
       or has_table_privilege(r.role, 'hr_ops.capacity_config', 'select,insert,update,delete')
       or has_function_privilege(r.role, 'hr_ops.capacity_sample(text,interval)', 'execute')
       or has_function_privilege(r.role, 'hr_ops.capacity_alarm(jsonb,text,interval)', 'execute') then
      raise exception 'ops-capacity §4(a): % holds a privilege on the capacity sampler', r.role; end if;
  end loop;

  -- (b) the walls, on planted numbers: each ratio, and null where a wall cannot be read (never a false 0).
  v := hr_ops.capacity_walls(jsonb_build_object('db_exec_ms', 84000, 'db_secs', 60, 'db_cores', 2,
         'tick_open', 900, 'tick_capacity', 1280, 'edge_bodies', 3, 'edge_max_ms', 640, 'edge_budget_ms', 800,
         'ledger_rows_day', 400000, 'ledger_prune_rows_day', 480000));
  if (v->>'db')::numeric <> 70 or (v->>'tick')::numeric <> 70.3 or (v->>'edge')::numeric <> 80
     or (v->>'ledger')::numeric <> 83.3 then
    raise exception 'ops-capacity §4(b): the walls read % (want db 70, tick 70.3, edge 80, ledger 83.3)', v; end if;
  v := hr_ops.capacity_walls(jsonb_build_object('db_cores', 2, 'tick_open', 0, 'tick_capacity', 0, 'edge_bodies', 0,
         'edge_budget_ms', 800, 'ledger_prune_rows_day', 480000));
  if v->'db' <> 'null'::jsonb or v->'tick' <> 'null'::jsonb or (v->>'edge')::numeric <> 0 or v->'ledger' <> 'null'::jsonb then
    raise exception 'ops-capacity §4(b): an unreadable wall did not read null (or no tick answer did not read 0): %', v; end if;
  if hr_ops.capacity_walls(jsonb_build_object('edge_budget_ms', 800))->'edge' <> 'null'::jsonb then
    raise exception 'ops-capacity §4(b): pg_net''s answers unreadable read as an idle edge (0%%), not null'; end if;

  -- (c) the alarm: a wall at 75% files ONE critical episode; a wall at 10% files nothing; back under, it clears.
  perform hr_ops.capacity_alarm('{"db": 10, "tick": 75, "edge": null, "ledger": 69.9}'::jsonb, 'capacity-selfcheck-', interval '0 seconds');
  select a.ref into v_ref from public.maintenance_alerts a
   where a.ref like 'watch:capacity-selfcheck-tick:%' and a.severity = 'critical' and a.acked_at is null;
  if v_ref is null then raise exception 'ops-capacity §4(c): a wall past 70%% filed no critical alarm'; end if;
  if exists (select 1 from public.maintenance_alerts a where a.ref like 'watch:capacity-selfcheck-db:%'
                or a.ref like 'watch:capacity-selfcheck-ledger:%' or a.ref like 'watch:capacity-selfcheck-edge:%') then
    raise exception 'ops-capacity §4(c): a wall under 70%% (or unreadable) filed an alarm'; end if;
  perform hr_ops.capacity_alarm('{"db": 10, "tick": 75, "edge": null, "ledger": 69.9}'::jsonb, 'capacity-selfcheck-', interval '0 seconds');
  if (select count(*) from public.maintenance_alerts a where a.ref like 'watch:capacity-selfcheck-tick:%') <> 1 then
    raise exception 'ops-capacity §4(c): a sustained wall filed a second row in one episode'; end if;
  perform hr_ops.capacity_alarm('{"db": 10, "tick": 12, "edge": null, "ledger": 1}'::jsonb, 'capacity-selfcheck-', interval '0 seconds');
  if exists (select 1 from public.maintenance_alerts a where a.ref = v_ref and a.acked_at is null)
     or not exists (select 1 from public.maintenance_alerts a where a.ref like 'watch-clear:capacity-selfcheck-tick:%') then
    raise exception 'ops-capacity §4(c): the cleared wall was not acked with one clear row'; end if;
  delete from public.maintenance_alerts a where a.ref like 'watch:capacity-selfcheck-%' or a.ref like 'watch-clear:capacity-selfcheck-%';
  delete from hr_ops.watch_state w where w.code like 'capacity-selfcheck-%';

  -- (d) a real sample lands with its dials read; it is a real measurement and stays (the series starts here).
  select count(*) into v_n0 from hr_ops.capacity_samples;
  v := hr_ops.capacity_sample();
  select count(*) into v_n1 from hr_ops.capacity_samples;
  if v_n1 <> v_n0 + 1 then raise exception 'ops-capacity §4(d): a sample did not land (% -> %)', v_n0, v_n1; end if;
  if (select (detail->>'tick_capacity')::bigint from hr_ops.capacity_samples order by id desc limit 1) is distinct from
     (select floor((flush_seconds + cadence_seconds) / cadence_seconds)::bigint * hunt_bodies_max * hunt_body_max
        from public.hr_tick_config where id) then
    raise exception 'ops-capacity §4(d): the sample''s tick capacity is not the dials'' %', v; end if;
  if (select tick_pct from hr_ops.capacity_samples order by id desc limit 1) is null
     or (select ledger_ins_total from hr_ops.capacity_samples order by id desc limit 1) is null then
    raise exception 'ops-capacity §4(d): the sample read no tick or no ledger counter: %', v; end if;

  -- (e) the job, where pg_cron is: every minute, the one command.
  if to_regclass('cron.job') is not null
     and not exists (select 1 from cron.job where jobname = 'hr-ops-capacity' and schedule = '* * * * *'
                       and command = 'select hr_ops.capacity_sample()') then
    raise exception 'ops-capacity §4(e): hr-ops-capacity is not scheduled every minute'; end if;

  -- (f) no probe residue, and the grant contract still holds.
  if exists (select 1 from hr_ops.watch_state where code like 'capacity-selfcheck-%')
     or exists (select 1 from public.maintenance_alerts where ref like '%capacity-selfcheck-%') then
    raise exception 'ops-capacity §4(f): the self-check left a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'ops-capacity: four walls sampled (%), alarm at 70%% files one episode and clears, operator-only; all green', v;
end $chk$;
