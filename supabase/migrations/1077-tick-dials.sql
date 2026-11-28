-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1077-tick-dials.sql — THE WORLD TICK'S HUNT BODY CARRIES THREE FOURS, A FIRE CARRIES 54 BODIES, AND THE
--   CAPACITY SAMPLE READS THE TICK'S WALL IN THE HEROES THE ROSTER CUTS BY (lane/tick-dials, backend-architect, 2026-11-28).
--
-- STATUS: supabase/migration-notes/1077-tick-dials.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base. It moves two dial values
--   (hr_tick_config) and RESTATES one body whole, hr_ops.capacity_sample (1046-settle-plans.sql's image, PINNED in §0; 1046's own pin
--   accepts this file's image, so the staged tail re-applies in order). Nothing else on the chain is edited.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §3 self-check.
-- EDGE: none (tick.js reads `hunt_body` 0..63 and hr_hunt_lease_free takes 0..63: body 53 is inside both). CLIENT: none.
--
-- ── WHY (MEASURED) ───────────────────────────────────────────────────────────
-- A hunt body is one edge invocation; its settles share one engine budget (hunt-settle.js HUNT_ENGINE_BUDGET_MS, 800 ms: no
--   engine run STARTS past it, and a run started under it may carry the body past it, under the edge's 2 s CPU limit). At
--   1004's 16 heroes a body, a body of four-hero parties is FOUR fours. Reliability's load test (lane/rel-cost-lt, HANDOFFS
--   2026-11-27 item 4; four green 1,000 x 4 runs, normalised to the reference runner LT_REF) read such a body at p50 761-807,
--   p95 952-1,096 and max 1,127-1,382 reference ms, and the engine spent before a body's fourth four starts reads p95 757
--   (below): at p95 every body is within 6% of deferring a four. And 16 x 32 = 512 heroes a fire is 1,280 fours a 100 s settle window (10 fires of
--   the 10 s cadence over the 90 s flush), while 1,000 fours already met the 32-body cap in their burst fire.
-- THIS FILE'S OWN MEASUREMENT (the real engine on the replayed chain, PGlite, tick.js runTick with no budget so each body runs
--   whole; 60 fours, the load test's grounds and kits (beta-load ltPlan: Hask's Ford, Muster Barrows, the Slake on the own four's
--   Level 50 kit, Krell's Hold and Pyre Field on the heavy four's Level 80), the v0.3.0 switches lit, 12 windows of 100 s, the
--   SAME world and dice at each dial; in reference ms by per-player-cost calibrate, cold, LT_REF's unit):
--                         bodies  body p50  p95    max     spent before its last four starts p95   runs deferred at 800
--     16 heroes (4 fours)    180      744     976   1,188    757                                     3 of 720
--     12 heroes (3 fours)    240      525     708     985    493                                     0 of 720
--      8 heroes (2 fours)    360      356     516     889    255                                     0 of 720
--   The four-four row is the load test's (p50 761-807, p95 952-1,096, max 1,127-1,382). The calibration read 125 ms before and
--   156 after (a shared PC: other lanes' tests ran beside it), so absolute reference ms carry about 12% either way; the pairing
--   holds the ratio, three fours 0.71 (p50), 0.73 (p95) and 0.83 (max) of four.
-- ON THE REFERENCE RUNNER (GitHub pg17-lt, run 46100646685, this file on the chain: tools/beta-load.mjs --shape=lt, 758 fours on a
--   runner x1.32 the reference, normalised): a body of three fours p50 626 / p95 901 / max 1,089 reference ms (0.82, 0.88, 0.88 of
--   the four-four runs: the loaded bench narrows the pairing's 0.73), a four's settle 216 mean; 14 of 9,028 body selectors
--   deferred (0.2%, line 20%); settle lag past the flush max 17.3 s (look-ahead 32); 0 of 31 fires at the 54-body cap (29 bodies a
--   fire p95); per-hero cost inside the fixtures' band; per-player-cost --lit green.
-- SO, READ PLAINLY: a three-four body's TOTAL p95 is still past 800 on the loaded reference bench (901; 708 on the replay). What
--   the budget governs is whether a body's LAST four starts: that needs the spend before it under 800, and at three fours it is
--   two fours' (replay p95 493), so at p95 a body defers only once the engine runs about 1.6x slower (at four fours, 1.06x). The body's
--   max is 54% of the edge's 2 s. A body p95 under 800 on the bench is two fours (8 heroes), and 8 x 64 bodies (the CHECK's
--   ceiling) holds 512 heroes a fire, 1,280 fours, today's: past 64 bodies is the CHECK, the roster's clamp, hr_hunt_lease_free
--   and tick.js together, and +100% invocations (not dials; Reliability's next step if the nightly reads deferral climbing).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 hr_tick_config.hunt_body_heroes 16 -> 12 (CHECK 1..64 unchanged): a body of four-hero parties closes at THREE fours (12
--      heroes); a lone-hunt body at 12 lone hunts (hunt_body_max 16 instances is the second cap, unchanged). An instance is
--      never split, so a body of mixed sizes still carries at most 12 + 3 heroes (1004's rule, unchanged).
--    hr_tick_config.hunt_bodies_max 32 -> 54 (CHECK 1..64 unchanged; body numbers 0..53 fit the holder's two digits, tick.js's
--      `hunt_body` 0..63 and hr_hunt_lease_free's 0..63): a fire leases at most 12 x 54 = 648 heroes, 162 fours, so a 100 s
--      settle window holds 6,480 heroes, 1,620 fours (was 5,120, 1,280).
-- §2 hr_ops.capacity_sample: the TICK WALL IN HEROES. Since 1004 the roster cuts a fire by heroes (hunt_body_heroes x
--      hunt_bodies_max), but the sample still read OPEN INSTANCES over fires x hunt_bodies_max x hunt_body_max (16 since 1004):
--      10 x 32 x 16 = 5,120 "instances", where a population of fours tops out at 1,280. At 1,000 fours (78% of the real
--      ceiling) the wall read 19.5%, and at 1,280 (hunts lagging) 25%: the 70% alarm could not fire for fours. Restated whole
--      from 1046's image with five lines changed (one of them its own comment on the tick lines), every other byte as there:
--        tick_open            the OPEN HUNT SESSIONS (heroes), was open instances
--        tick_capacity        fires x hunt_bodies_max x least(hunt_body_heroes, hunt_body_max) heroes: exact when the heroes
--                             dial is the smaller (here 12 < 16: every fire's pick is bounded by 12 x 54 heroes, whatever the
--                             party sizes), and the lone-hunt floor when it is not (a lone-hunt body closes at hunt_body_max)
--        tick_open_instances  the open instances, the old reading, kept beside it (tools/balance-program/platform-read reads it)
--        tick_unit            'heroes' (tools/vitals.mjs labels the wall by it; a sample before this file has none)
--      capacity_walls, the alarm, its line (70%) and every other wall are unchanged.
-- REFUSAL CODES: none (no client or engine surface is added or changed).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The roster's locks, leases and packing are byte for byte (1004's body); only how many it takes a body and a fire moves. A
--   second apply sets the same two values and restates the same body (it moves nothing): byte-identical
--   (tests/schema-drift.mjs). A fire running while this commits reads the old or the new row, never half of it.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- None. Two operator dials and an owner-only sampler (hr_ops: no client or engine role holds USAGE). No value moves; which body a
--   hunt rides never moves an outcome (the engine is cut-invariant: tests/hunt-sessions-settle.mjs TICK-1, PARITY).
--
-- ── COST (rows, bytes, invocations) ──────────────────────────────────────────
-- Rows and bytes: none. Statements and row writes a settle: unchanged (a settle is one instance either way; per-player-cost's
--   fixtures are one instance a body). The roster fire: the same statement over at most 648 due heroes (was 512).
-- INVOCATIONS: a population of fours needs 4/3 the bodies: +33% tick invocations at the same heroes. At 1,000 fours hunting all
--   day: about 105 fours a fire, 35 bodies (was 27), 8,640 fires a day = 9.1 M a month (was 7.0 M), +2.1 M past Pro's included
--   2 M at $2 a million: about $4.20 a month (Reliability's +2.3 M, $4.50, rounds the same). Nothing at today's load (a few
--   bodies a fire). Peak concurrency at the burst: up to 54 edge invocations a fire (was 32), each 3/4 the engine time; pg_net
--   posts them in one batch (its batch is 200). The engine's DB pool is the transaction pooler (index.ts max 2 an isolate):
--   connection-seconds are about unchanged, peak statements in flight up to +69% at the cap. NOT measured on production's edge.
--
-- ── REVERSIBLE ───────────────────────────────────────────────────────────────
--   `update public.hr_tick_config set hunt_body_heroes = 16, hunt_bodies_max = 32 where id;` (the dials alone; any fire after reads
--   them). The sampler: re-apply 1046-settle-plans.sql's hr_ops.capacity_sample (its §2 restates it whole).
-- GUARDS: tests/hunt-tick-shards.mjs (FANOUT: the chain carries 16 / 12 / 54; DIALS: at the chain's dials a body of fours is three
--   fours and a fire stops at its heroes, the next four waits; --mutate proves this §3's k0, s1 and sp bite), tools/vitals.mjs
--   --selftest (K9: the wall's unit), this §3 (p1: the 648-hero ceiling over 163 fours, in 54 bodies 0..53).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
-- md5 of prosrc with carriage returns removed: 1046-settle-plans.sql's image of the sampler, or this file's own. Read by its schema
-- and name (hr_ops.capacity_sample has one signature: 1002 created it, 1046 restated it).
do $mig$
declare v_md5 text;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr_ops' and p.proname = 'capacity_sample') <> 1 then
    raise exception 'PRECONDITION: hr_ops.capacity_sample is missing or overloaded'; end if;
  if to_regclass('public.hr_tick_config') is null or to_regclass('public.hunt_tick_lease') is null
     or to_regclass('hr_ops.capacity_samples') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'hunt_body_heroes')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'hunt_bodies_max')
     or to_regprocedure('public.hr_hunt_lease_free(integer,uuid[])') is null then
    raise exception 'PRECONDITION: the tick config''s heroes or fan-out dial, the lease, its free (1004) or the capacity sampler (1002) is missing'; end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_hunt_body_heroes_ck')
     or not exists (select 1 from pg_constraint where conname = 'hr_tick_config_hunt_bodies_max_ck') then
    raise exception 'PRECONDITION: a dial lost its CHECK (1..64): the holder''s two digits and hr_hunt_lease_free''s 0..63 rest on it'; end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr_ops' and p.proname = 'capacity_sample';
  if v_md5 is distinct from 'a3d64ccabd14150741c619af824d2cf2' and v_md5 is distinct from 'b0dc4820391387c415c8ca77ba74718e' then
    raise exception 'PIN: hr_ops.capacity_sample is neither 1046-settle-plans.sql''s image nor this file''s own: md5 % - re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE DIALS ─────────────────────────────────────────────────────────────
update public.hr_tick_config set hunt_body_heroes = 12, hunt_bodies_max = 54 where id;

-- ── §2 THE TICK WALL IN HEROES: hr_ops.capacity_sample RESTATED WHOLE ─────────
-- 1046-settle-plans.sql's body (§0 pins it) with five lines changed, every other byte as there: the declare line (v_open_inst),
-- the tick comment, the body's heroes (least of the two dials), the open read (sessions, and instances beside them) and the
-- sample's tick keys (tick_unit, tick_open_instances). Restated rather than spliced: the sampler is not a public function, so the
-- live-hash sweep (tests/live-hash-drift.mjs, public bodies only) neither tracks nor reads it, as for 1002's and 1046's.
create or replace function hr_ops.capacity_sample(p_prefix text default 'capacity-', p_after interval default null)
returns jsonb language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c hr_ops.capacity_config%rowtype;
  v_prev hr_ops.capacity_samples%rowtype;
  v_stmt double precision; v_ins bigint; v_secs numeric;
  v_cadence numeric; v_flush numeric; v_body int; v_bodies int; v_cap bigint;
  v_open int := 0; v_worst numeric; v_open_inst int;
  v_edge_bodies int := 0; v_edge_max numeric; v_edge_def int := 0; v_edge_err text;
  v_db_ms double precision; v_rows_day numeric;
  v_rd_calls bigint; v_rd_total double precision; v_rd_ms numeric;   -- SETTLE-READ
  v_obs jsonb; v_walls jsonb; v_firing text[];
begin
  select * into c from hr_ops.capacity_config where id;
  select * into v_prev from hr_ops.capacity_samples order by at desc, id desc limit 1;
  v_secs := extract(epoch from now() - v_prev.at);

  -- db: the extension may be absent (a replay) or unreadable; either is null, never a failed sample.
  if to_regclass('extensions.pg_stat_statements') is not null then
    begin execute 'select sum(total_exec_time) from extensions.pg_stat_statements' into v_stmt;
    exception when others then v_stmt := null; end;
    -- SETTLE-READ: every statement that calls the party read (hunt-settle.js HUNT_READ_SQL, either spelling), cumulative.
    begin execute 'select sum(calls)::bigint, sum(total_exec_time) from extensions.pg_stat_statements
                    where query like ''%hr_hunt_instance_read(%''' into v_rd_calls, v_rd_total;
    exception when others then v_rd_calls := null; v_rd_total := null; end;
  end if;
  -- A delta needs a previous sample between 30 s and 15 min old, and no stats reset between (a negative delta).
  if v_stmt is not null and v_prev.stmt_ms_total is not null and v_secs between 30 and 900 and v_stmt >= v_prev.stmt_ms_total then
    v_db_ms := v_stmt - v_prev.stmt_ms_total;
  end if;
  -- SETTLE-READ: the mean of the reads made since the previous sample; none made (or a reset) is null, never 0.
  if v_rd_calls is not null and v_prev.settle_read_calls is not null and v_secs between 30 and 900
     and v_rd_calls > v_prev.settle_read_calls and v_rd_total >= v_prev.settle_read_total then
    v_rd_ms := round(((v_rd_total - v_prev.settle_read_total) / (v_rd_calls - v_prev.settle_read_calls))::numeric, 1);
  end if;

  -- ledger: cumulative inserts on the journal and any partition of it; no scan of the table.
  select sum(s.n_tup_ins)::bigint into v_ins from pg_stat_user_tables s
   where s.relid = 'public.player_ledger'::regclass
      or s.relid in (select i.inhrelid from pg_inherits i where i.inhparent = 'public.player_ledger'::regclass);
  if v_ins is not null and v_prev.ledger_ins_total is not null and v_secs between 30 and 900 and v_ins >= v_prev.ledger_ins_total then
    v_rows_day := round((v_ins - v_prev.ledger_ins_total) * 86400 / v_secs);
  end if;

  -- tick (1077-tick-dials.sql): the HEROES the roster can lease in one settle window (a body's heroes are the smaller dial: a lone-hunt body closes at hunt_body_max instances), and the heroes open.
  select coalesce(t.cadence_seconds, 10), coalesce(t.flush_seconds, 90), least(coalesce(t.hunt_body_max, 1), coalesce(t.hunt_body_heroes, 1)), coalesce(t.hunt_bodies_max, 1)
    into v_cadence, v_flush, v_body, v_bodies from public.hr_tick_config t where t.id;
  v_cap := floor((coalesce(v_flush, 90) + coalesce(v_cadence, 10)) / greatest(coalesce(v_cadence, 10), 1))::bigint
           * coalesce(v_bodies, 1) * coalesce(v_body, 1);
  -- From the OPEN sessions (the partial index hunt_sessions_one_open holds exactly them), never a scan of every instance ever.
  select count(*)::int, max(extract(epoch from now() - i.settled_to)), count(distinct s.instance_id)::int into v_open, v_worst, v_open_inst
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
    'tick_open', v_open, 'tick_capacity', v_cap, 'tick_unit', 'heroes', 'tick_open_instances', v_open_inst,
    'edge_bodies', v_edge_bodies, 'edge_max_ms', v_edge_max, 'edge_budget_ms', c.edge_budget_ms,
    'ledger_rows_day', v_rows_day, 'ledger_prune_rows_day', c.ledger_prune_rows_day);
  v_walls := hr_ops.capacity_walls(v_obs);

  insert into hr_ops.capacity_samples (db_pct, tick_pct, edge_pct, ledger_pct, stmt_ms_total, ledger_ins_total,
                                       settle_read_ms, settle_read_calls, settle_read_total, detail)
  values ((v_walls->>'db')::numeric, (v_walls->>'tick')::numeric, (v_walls->>'edge')::numeric, (v_walls->>'ledger')::numeric,
          v_stmt, v_ins, v_rd_ms, v_rd_calls, v_rd_total,
          v_obs || jsonb_build_object('tick_worst_lag_s', round(v_worst), 'edge_deferred', v_edge_def,
                                      'edge_error', v_edge_err, 'active_backends',
                                      (select count(*) from pg_stat_activity where state = 'active' and backend_type = 'client backend')));

  v_firing := hr_ops.capacity_alarm(v_walls, p_prefix, p_after);
  if hr_ops.settle_read_alarm(v_rd_ms, p_prefix, p_after) then v_firing := v_firing || 'settle_read'::text; end if;   -- SETTLE-READ

  -- RETENTION, in the same file as the table (bounded a run).
  delete from hr_ops.capacity_samples d
   where d.id in (select o.id from hr_ops.capacity_samples o where o.at < now() - c.keep order by o.id limit 5000);

  return v_walls || jsonb_build_object('settle_read_ms', v_rd_ms, 'firing', to_jsonb(v_firing));
end $fn$;
-- (CREATE OR REPLACE keeps the function's ACL: 1046's revokes stand; §3 (kg) reads them.)

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe row is this block's own and is rolled back ──
-- k0  the dials are 16 instances / 12 heroes a body, 54 bodies a fire; each CHECK still refuses 0 and 65
-- p1  THE CEILING, AT THE CHAIN'S DIALS: 163 away four-hero parties, all due (the 163rd the least behind): the roster leases 648
--     heroes, 162 parties whole, in 54 bodies numbered 0..53 of exactly three fours each, each leased to its own holder; the
--     163rd waits (no lease)
-- p2  the top body gives back what it deferred: hr_hunt_lease_free(53, ...) frees body 53's 12 and only them, and the next call
--     offers exactly those 12 and the four that waited
-- s1  the sampler at the same moment reads the wall in heroes: tick_unit heroes, tick_capacity 10 x 54 x 12 = 6,480,
--     tick_open the open sessions and tick_open_instances the open instances
-- sp  the sampler is this file's image (md5 of its prosrc), after s1 has read what the image does
-- kg  no client, engine or tick role can execute the sampler or the packer; the engine still holds the free
do $chk$
declare
  v_cfg   public.hr_tick_config%rowtype;
  v_hcfg  boolean;
  v_pfx   text := left('cron:' || coalesce(current_database(), 'db'), 58);
  v_hunt  text;
  v_users uuid[] := '{}';
  v_insts uuid[] := '{}';
  v_a     jsonb;
  v_b     jsonb;
  v_ids   uuid[];
  v_n     int;
  v_s     jsonb;
  v_def   text;
  i       int;
begin
  begin
    -- ── k0
    select * into v_cfg from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    if v_cfg.hunt_body_max <> 16 or v_cfg.hunt_body_heroes <> 12 or v_cfg.hunt_bodies_max <> 54 then
      raise exception 'k0: the dials are % instances, % heroes, % bodies (want 16 / 12 / 54)', v_cfg.hunt_body_max, v_cfg.hunt_body_heroes, v_cfg.hunt_bodies_max; end if;
    begin
      update public.hr_tick_config set hunt_bodies_max = 65 where id;
      raise exception 'k0: hunt_bodies_max = 65 was accepted (body 64 has no holder digit pair and hr_hunt_lease_free refuses it)';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set hunt_bodies_max = 0 where id;
      raise exception 'k0: hunt_bodies_max = 0 was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set hunt_body_heroes = 65 where id;
      raise exception 'k0: hunt_body_heroes = 65 was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.hr_tick_config set hunt_body_heroes = 0 where id;
      raise exception 'k0: hunt_body_heroes = 0 was accepted';
    exception when check_violation then null;
    end;

    -- ── fixture: 163 accounts, nobody watching, each one four-hero party instance on a real ground; 162 settled 20 minutes ago,
    --    the 163rd 19 minutes ago (the least behind): every one is due, and the 163rd is the one past the fire's ceiling.
    select c.enabled into v_hcfg from public.hr_hunt_config c where c.id;
    update public.hr_hunt_config set enabled = true where id;
    update public.hr_tick_config set flush_seconds = 90, cadence_seconds = 10, fold_windows = 1 where id;
    -- No other open session may be due during the check (a live database has hunters): lease every one of them to a name the
    -- check never uses, inside this rolled-back block.
    insert into public.hunt_tick_lease (session_id, holder, lease_until)
    select h.id, 'selfcheck:other', now() + interval '1 hour' from public.hunt_sessions h where h.ended_at is null
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g order by g.hunt_id limit 1;
    if v_hunt is null then raise exception 'k-fixture: no hunting ground on this chain'; end if;
    for i in 1 .. 163 loop
      v_users := v_users || ('00000000-0000-4000-8000-000001077' || lpad(to_hex(i), 3, '0'))::uuid;
      v_insts := v_insts || ('00000000-0000-4000-8000-000001078' || lpad(to_hex(i), 3, '0'))::uuid;
    end loop;
    insert into auth.users (id) select unnest(v_users) on conflict do nothing;
    insert into public.player_state (user_id, slot) select u, s from unnest(v_users) u, generate_series(0, 3) s on conflict do nothing;
    delete from public.character_presence where user_id = any (v_users);
    insert into public.hunt_instances (id, hunt_id, kind) select x, v_hunt, 'party' from unnest(v_insts) x;
    insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at, instance_id)
    select v_users[k], s, v_hunt, now() - interval '30 minutes', now() - interval '25 minutes',
           now() - interval '20 minutes' + case when k = 163 then interval '1 minute' else interval '0 seconds' end,
           now() - interval '20 minutes', v_insts[k]
      from generate_series(1, 163) k, generate_series(0, 3) s;

    -- ── p1
    select jsonb_agg(jsonb_build_object('s', r.session_id, 'b', r.body, 'u', r.user_id) order by r.ord)
      into v_a from public.hr_hunt_roster_sharded(v_pfx, v_cfg.hunt_body_max, 30000) r where r.user_id = any (v_users);
    if jsonb_array_length(coalesce(v_a, '[]')) <> 648 or (select count(distinct e->>'s') from jsonb_array_elements(v_a) e) <> 648 then
      raise exception 'p1: the fire leased % rows for its 648-hero ceiling (each session once)', jsonb_array_length(coalesce(v_a, '[]')); end if;
    if (select count(distinct (e->>'b')::int) from jsonb_array_elements(v_a) e) <> 54
       or (select min((e->>'b')::int) from jsonb_array_elements(v_a) e) <> 0
       or (select max((e->>'b')::int) from jsonb_array_elements(v_a) e) <> 53 then
      raise exception 'p1: the 648 heroes rode bodies %', (select jsonb_agg(distinct (e->>'b')::int) from jsonb_array_elements(v_a) e); end if;
    if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                group by (e->>'b')::int having count(*) <> 12 or count(distinct h.instance_id) <> 3) then
      raise exception 'p1: a body is not three fours: %', (select jsonb_object_agg(b, n) from (select (e->>'b') b, count(*) n
        from jsonb_array_elements(v_a) e group by 1 having count(*) <> 12) x); end if;
    if exists (select 1 from jsonb_array_elements(v_a) e join public.hunt_sessions h on h.id = (e->>'s')::uuid
                group by h.instance_id having count(distinct (e->>'b')::int) <> 1 or count(*) <> 4) then
      raise exception 'p1: a party was split or rode short'; end if;
    if exists (select 1 from jsonb_array_elements(v_a) e where (e->>'u')::uuid = v_users[163])
       or exists (select 1 from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
                   where h.user_id = v_users[163] and l.lease_until > now()) then
      raise exception 'p1: the four past the ceiling (the least behind) was leased'; end if;
    select count(*) into v_n from jsonb_array_elements(v_a) e join public.hunt_tick_lease l on l.session_id = (e->>'s')::uuid
     where l.holder <> v_pfx || ':h' || (e->>'b') or l.lease_until <= now();
    if v_n <> 0 then raise exception 'p1: % session(s) not leased to their body''s holder', v_n; end if;

    -- ── p2
    select array_agg((e->>'s')::uuid) into v_ids from jsonb_array_elements(v_a) e where (e->>'b')::int = 53;
    if coalesce(cardinality(v_ids), 0) <> 12 then raise exception 'p2 CANNOT RUN: body 53 holds % sessions, not 12', coalesce(cardinality(v_ids), 0); end if;
    if public.hr_hunt_lease_free(52, v_ids) <> 0 then raise exception 'p2: body 52 freed body 53''s leases'; end if;
    if public.hr_hunt_lease_free(53, v_ids) <> 12 then raise exception 'p2: body 53 did not free its 12 deferred leases'; end if;
    select coalesce(jsonb_agg(r.session_id order by r.session_id), '[]'::jsonb) into v_b
      from public.hr_hunt_roster_sharded(v_pfx, v_cfg.hunt_body_max, 30000) r where r.user_id = any (v_users);
    if v_b is distinct from (select jsonb_agg(x order by x) from (select unnest(v_ids) x
          union all select h.id from public.hunt_sessions h where h.user_id = v_users[163] and h.ended_at is null) y) then
      raise exception 'p2: after body 53 freed its 12 the next call offered %, not them and the four that waited', jsonb_array_length(v_b); end if;

    -- ── s1
    v_s := hr_ops.capacity_sample('selfcheck-1077-', interval '1 hour');
    select s.detail into v_s from hr_ops.capacity_samples s order by s.id desc limit 1;
    if v_s->>'tick_unit' is distinct from 'heroes' or (v_s->>'tick_capacity')::bigint is distinct from 6480 then
      raise exception 's1: the sample reads the tick wall as % of %, not 6,480 heroes', v_s->>'tick_unit', v_s->>'tick_capacity'; end if;
    if (v_s->>'tick_open')::int is distinct from (select count(*)::int from public.hunt_sessions where ended_at is null)
       or (v_s->>'tick_open_instances')::int is distinct from (select count(distinct instance_id)::int from public.hunt_sessions where ended_at is null)
       or (v_s->>'tick_open')::int < 652 or (v_s->>'tick_open_instances')::int < 163 then
      raise exception 's1: the sample reads % open (% instances), not the open sessions and instances', v_s->>'tick_open', v_s->>'tick_open_instances'; end if;

    -- ── kr
    update public.hr_tick_config set flush_seconds = v_cfg.flush_seconds, cadence_seconds = v_cfg.cadence_seconds,
           fold_windows = v_cfg.fold_windows where id;
    update public.hr_hunt_config set enabled = v_hcfg where id;
    raise exception 'HR1077TD_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1077TD_ROLLBACK_OK' then raise; end if;
  end;

  -- ── sp
  select md5(replace(p.prosrc, chr(13), '')) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr_ops' and p.proname = 'capacity_sample';
  if v_def is distinct from 'b0dc4820391387c415c8ca77ba74718e' then
    raise exception 'sp: hr_ops.capacity_sample is not this file''s image: md5 % - re-pin §0, this line and 1046-settle-plans.sql''s pin', v_def; end if;

  -- ── kg
  if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_engine'), ('hr_tick')) r(role)
              where exists (select 1 from pg_roles where rolname = r.role)
                and (has_function_privilege(r.role, 'hr_ops.capacity_sample(text,interval)', 'execute')
                     or has_function_privilege(r.role, 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute'))) then
    raise exception 'kg: a request, engine or tick role holds EXECUTE on the sampler or the hunt packer'; end if;
  if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role')) r(role)
              where has_function_privilege(r.role, 'public.hr_hunt_lease_free(integer,uuid[])', 'execute'))
     or (exists (select 1 from pg_roles where rolname = 'hr_engine')
         and not has_function_privilege('hr_engine', 'public.hr_hunt_lease_free(integer,uuid[])', 'execute')) then
    raise exception 'kg: hr_hunt_lease_free is reachable by a request role, or not by the engine'; end if;
  if (select (hunt_body_max, hunt_body_heroes, hunt_bodies_max) from public.hr_tick_config where id) is distinct from (16, 12, 54) then
    raise exception 'kr: the dials did not come back to 16 / 12 / 54'; end if;
end $chk$;
