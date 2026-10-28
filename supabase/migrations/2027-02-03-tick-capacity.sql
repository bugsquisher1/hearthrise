-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE WORLD TICK SIZED TO WHAT A SETTLE NOW COSTS
-- (lane/c-settle-cost, backend-architect, 2026-10-28; the 2026-10-28 optimization review).
-- STAGED. Game CLOSED: applies on its passing §5 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- Applies AFTER 2027-02-02-settle-cost.sql (§0: the sizing below is that file's cost).
-- DB-ONLY: no hr-accrue change of its own. Moves no value.
--
-- ── WHAT THE DIALS ARE (read from hr_tick_cron_run / hr_hunt_roster_sharded) ─
--   hunt_body_max  the most hunt INSTANCES one body carries; one body = one POST = one
--                  edge invocation, settled SERIALLY by tick.js (its CPU and wall add up).
--   the fan-out    how many hunt bodies one fire may post: hr_hunt_roster_sharded's
--                  constant c_bodies = 16 until this file. Bodies are CONCURRENT edge
--                  invocations, so a fire's wall is its slowest body's.
--   shards         the GATHER roster's partition (hr_tick_roster: town work, the armed
--                  `gather` channel); one body per shard per fire, up to batch_limit (200)
--                  characters each. It does NOT touch hunt bodies (they ride shard 0).
--   So the hunt ceiling is fan-out x hunt_body_max instances a fire (16 x 12 = 192 today),
--   not shards x hunt_body_max. Shrinking the body alone (the review's 4-5) would cut that
--   ceiling to 64 a fire; this file makes the fan-out a dial and raises it with the cut.
--
-- ── THE ARITHMETIC (per-instance costs MEASURED after 2027-02-02-settle-cost.sql) ─
--   tools/settle-cost.mjs --compare (PGlite, the real chain, one fire over every member's
--   selector through the shipped tick.js, interleaved with the pre-fix tree on one machine):
--     one 4-hero party instance, 90 s window:  DB 170 ms (was 1,407: 24 envelopes, 4 reads,
--     1 commit -> 0 envelopes, 1 read, 1 commit), wall 359 ms (was 1,566).
--     one solo instance, 90 s window:          DB ~66 ms, wall ~148 ms (0.39 / 0.41 of the 4-hero
--     instance, measured side by side under one machine load; scaled to the 4-hero figure above).
--   Engine CPU (the review's engine-bench, Node, shipped accrueHunt): party-of-4 90 s 172 ms
--   mean / 562 ms p95; solo 90 s 78 ms. The edge's CPU limit is 2 s a request (DOCS);
--   pg_net's timeout 9 s (the fire's cadence 10 s - 1 s).
--   A BODY of B four-hero instances (the worst content a body can hold):
--     edge CPU  ~ B x 180 ms (engine + JSON)   B = 4: 0.72 s mean (2.8x under 2 s);
--                                             one p95 window among four: 1.1 s (1.8x).
--     wall      ~ 30 ms + B x 360 ms           B = 4: 1.47 s (6.1x under 9 s);
--                                             a p95 body (DB x2, engine p95): ~3.7 s (2.4x).
--     (B = 12, today: 2.2 s CPU mean — over the limit on the first slow window — and 4.3 s
--      wall at the post-fix cost; 17.8 s at the pre-fix one, the review's measurement.)
--   THE CEILING: fan-out 32 x B 4 = 128 instances a fire; each is due once a flush (90 s =
--   9 fires), so 1,152 open instances before a due one waits a fire (192 x 9 = 1,728 today
--   only on paper: those bodies run past the CPU limit first).
--   THE DATABASE at that ceiling (Micro: 2 shared cores, ~1.4 usable): 128 four-hero
--   instances a fire = 21.8 s DB per 10 s = 2.2 cores — the DB binds first, at ~82 such
--   instances a fire (~740 open, ~2,950 heroes, browser closed); solo ones at ~212
--   a fire, past the tick ceiling: for solo hunts the fan-out binds first, at 1,152 open.
--   Past either, the most-behind instance still goes first (the roster's order), so an
--   overload is lag, never a skipped or doubled settle.
--   SHARDS STAY 1 (the review asked 4-8 on the reading that they fan out hunts; they do not).
--   They split only the GATHER roster: an UNVIEWED hero's town work (a viewed one is settled by
--   its own client's accrue). A visit is ~45-60 ms (hr_tick_settle 27.3 ms mean live 2026-10-28
--   + ~5 reads and their RTT), so one shard's body reaches 4.5 s at ~80 due a fire (~700
--   unviewed town workers, 1/9 due a fire) and pg_net's 9 s at ~160 (~1,400); past that the
--   batch cap (200) and the 30 s lease hold, and town work lags, it is never paid twice. No
--   measurement shows that load. Raising the dial is ONE UPDATE in a later file, but six
--   world-tick guards (writer-authz S-4, double-pay, edge-contract EC-3b, ...) build their
--   fixture on "shard 0 rosters everyone" and must state that premise first: its own lane,
--   when vitals show unviewed town work past ~500 heroes.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_config.hunt_bodies_max int NOT NULL DEFAULT 16, CHECK 1..64: the most hunt
--    bodies (POSTs) one fire queues. 16 = the constant it replaces (the default changes
--    nothing until §3 sets it). 64: pg_net's batch is 200 a worker loop, the gather shards
--    take at most 16, and every body is two pooler connections at most.
-- §2 hr_hunt_roster_sharded RESTATED WHOLE from its live image (23af29bf,
--    2027-01-01-server-perf.sql): `c_bodies` is the config's hunt_bodies_max (clamped
--    1..64, a missing row reads 16) instead of the literal. Every other line is the same:
--    the due predicate, the most-behind-first pick, the lock, the packing, the leases.
-- §3 THE DIALS: hunt_body_max 12 -> 4, hunt_bodies_max 16 -> 32 (shards unchanged: above).
-- §4 grants (the restated function stays owner-only); §5 the executed self-check.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   Unchanged in kind. One roster statement a fire (the cron's advisory lock serialises
--   fires) partitions the due set into bodies; each session is leased to ONE body's holder
--   `<prefix>:h<k>` (k < 64: 58 + ':h' + 2 digits fits hunt_tick_lease's 64), never
--   re-claimed while the lease lives; hr_hunt_apply_instance's instance lock, world CAS and
--   derived intent keys refuse a second payment whatever the packing does. The edge reads
--   no body count.
--
-- ── SECURITY SURFACE (for the EA review) ────────────────────────────────────
--   NOTHING HERE MOVES VALUE OR WIDENS A ROLE: how many sessions ride which POST. The
--   restated function stays reachable by no role. Listed for the pre-EA review.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows: one column. Per fire: up to 32 hunt POSTs instead of 16, only when more than 64
--   instances are due (16 x 4); pg_net response rows are pruned by pg_net's own TTL. Each POST
--   holds at most two pooler connections for ~1.5 s.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   `update public.hr_tick_config set hunt_body_max = 12, hunt_bodies_max = 16 where id;`
--   restores today's packing exactly (the column's default is today's constant). Leases held
--   by `:h16`..`:h31` holders lapse in 30 s.
--
-- ORDER: after 2027-02-02-settle-cost.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_member_state(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-02-02-settle-cost.sql first (this file sizes the tick on its per-settle cost)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'hunt_body_max')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'shards')
     or to_regprocedure('public.hr_tick_cron_run()') is null then
    raise exception 'PRECONDITION: hr_tick_config.shards / hunt_body_max and hr_tick_cron_run (2026-11-04-hunt-tick-shards.sql)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure;
  if v_md5 is distinct from '23af29bf177e191f8a6e365533ae45e0' and v_md5 is distinct from '478508dcfb8abd7adfffe649d899a0c7' then
    raise exception 'PIN: hr_hunt_roster_sharded is neither its live image (23af29bf) nor this file''s: md5 % - another file moved it', v_md5; end if;
  -- the cron still hands the roster the config's body size, one POST a body (this file's model of the fan-out)
  if strpos((select prosrc from pg_proc where oid = 'public.hr_tick_cron_run()'::regprocedure),
            'from public.hr_hunt_roster_sharded(v_hprefix, v_cfg.hunt_body_max, v_cfg.lease_ms) r') = 0 then
    raise exception 'PRECONDITION: hr_tick_cron_run no longer packs hunt bodies by hr_tick_config.hunt_body_max'; end if;
end $mig$;

-- ── §1 THE FAN-OUT, A DIAL ───────────────────────────────────────────────────
alter table public.hr_tick_config add column if not exists hunt_bodies_max int not null default 16;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_hunt_bodies_max_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_hunt_bodies_max_ck check (hunt_bodies_max between 1 and 64);
  end if;
end $mig$;
comment on column public.hr_tick_config.hunt_bodies_max is
  '2027-02-03 (tick capacity). The most hunt BODIES (POSTs, concurrent edge invocations) one world-tick fire queues; x hunt_body_max = the instances a fire can settle. Read by hr_hunt_roster_sharded. Default 16 = the old constant.';

-- ── §2 THE ROSTER READS IT ───────────────────────────────────────────────────
create or replace function public.hr_hunt_roster_sharded(p_prefix text, p_body_max integer, p_lease_ms integer default 30000)
returns table(user_id uuid, slot integer, session_id uuid, body integer, ord integer)
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
#variable_conflict use_column
declare
  -- THE FAN-OUT CEILING: hunt bodies a fire — hr_tick_config.hunt_bodies_max (2027-02-03-tick-capacity.sql; was the
  -- literal 16), clamped 1..64 (pg_net batch 200; the 58 + ':h' + two digits holder name).
  c_bodies  int;
  v_role    text;
  v_per     int;
  v_lease   interval;
  v_prefix  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_hunt_roster_sharded: not callable by %', v_role using errcode = '42501';
  end if;
  v_per    := least(greatest(coalesce(p_body_max, 12), 1), 50);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  -- 58 + ':h' + two digits <= 62: a body's holder always fits, never truncates into another's.
  v_prefix := left(coalesce(nullif(p_prefix, ''), 'unnamed'), 58);
  select make_interval(secs => c.flush_seconds), c.fold_windows, c.hunt_bodies_max into v_flush, v_fold, c_bodies
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  c_bodies := least(greatest(coalesce(c_bodies, 16), 1), 64);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due0 as (
    -- hr_hunt_roster's due predicate, byte for byte, except the lease: a live
    -- lease is never re-claimed (§0 of the header, concurrency (b)).
    select h.id, h.instance_id as inst, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now())
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 -- SERVER-PERF (2027-01-01-server-perf.sql): WATCHED = OPEN IN A CLIENT, the stamp the rebuilt
                 -- client writes (character_presence; hr_frame_wanted's 75 s window, never the future).
                 case when exists (select 1 from public.character_presence cp
                                    where cp.user_id = h.user_id and cp.slot = h.slot
                                      and cp.seen_at >  now() - interval '75 seconds'
                                      and cp.seen_at <= now() + interval '60 seconds')
                      then 1 else v_fold end))
  ), pick as (
    -- THE INSTANCES THIS FIRE TAKES: the most behind first, as many as the fan-out's bodies hold.
    select d.inst
      from due0 d
     group by d.inst
     order by min(d.settled_to), d.inst
     limit v_per * c_bodies
  ), due as (
    -- Locked; re-checked open and not ahead under the lock (READ COMMITTED
    -- re-evaluates these on a row another transaction moved).
    select h.id, h.instance_id as inst, h.user_id as uid, h.slot as sl
      from public.hunt_sessions h
     where h.id in (select d.id from due0 d join pick p on p.inst = d.inst)
       and h.ended_at is null
       and h.settled_to <= now()
     for update skip locked
  ), packed as (
    -- THE PACKING: a pure function of the due set. Every member of an instance
    -- shares the instance's rank, so its body.
    select d.id, d.inst, d.uid, d.sl,
           ((dense_rank() over (order by md5(d.inst::text), d.inst)) - 1)::int / v_per as b
      from due d
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until)
    select p.id, v_prefix || ':h' || p.b, now() + v_lease from packed p
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
    returning t.session_id
  )
  select p.uid, p.sl, p.id, p.b,
         (row_number() over (order by p.b, md5(p.inst::text), p.inst, p.id))::int
    from packed p join leased x on x.session_id = p.id
   order by 5;
end $function$;

-- ── §3 THE DIALS (the arithmetic is the header's) ────────────────────────────
update public.hr_tick_config set hunt_body_max = 4, hunt_bodies_max = 32 where id;

-- ── §4 GRANTS: the restated roster stays owner-only ──────────────────────────
do $grants$
declare v_role text;
begin
  revoke all on function public.hr_hunt_roster_sharded(text, integer, integer) from public, anon, authenticated, service_role;
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_roster_sharded(text, integer, integer) from %I', v_role); end if;
  end loop;
end $grants$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image: the column does not exist, the roster takes 16 x body whatever the config says.
do $$
declare
  c_u    constant uuid[] := array['000000d6-0000-4000-a000-0000f1a70001', '000000d6-0000-4000-a000-0000f1a70002',
                                  '000000d6-0000-4000-a000-0000f1a70003']::uuid[];
  v      jsonb;
  v_sid  uuid[] := '{}';
  v_s    uuid;
  v_n    int;
  v_b    int;
  i      int;
begin
  -- (a) THE SHAPE: the column, its default and CHECK; the body is this file's image; the dials; owner-only.
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
        and column_name = 'hunt_bodies_max') is distinct from '16'
     or (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
        and column_name = 'hunt_bodies_max') <> 'NO' then
    raise exception 'tick-capacity §5(a): hr_tick_config.hunt_bodies_max is not NOT NULL DEFAULT 16'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure)
       <> '478508dcfb8abd7adfffe649d899a0c7' then
    raise exception 'tick-capacity §5(a): hr_hunt_roster_sharded is not this file''s image'; end if;
  if (select (c.hunt_body_max, c.hunt_bodies_max) <> (4, 32) from public.hr_tick_config c where c.id) then
    raise exception 'tick-capacity §5(a): the dials are not hunt_body_max 4, hunt_bodies_max 32'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute'))
     or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')) then
    raise exception 'tick-capacity §5(a): the roster is reachable by a role that must not run it'; end if;

  begin
    -- (b) THE BOUNDS: 0 and 65 are refused.
    begin
      update public.hr_tick_config set hunt_bodies_max = 0 where id;
      raise exception 'tick-capacity §5(b): hunt_bodies_max = 0 was accepted';
    exception when check_violation then null; end;
    begin
      update public.hr_tick_config set hunt_bodies_max = 65 where id;
      raise exception 'tick-capacity §5(b): hunt_bodies_max = 65 was accepted';
    exception when check_violation then null; end;

    -- (c) THE FAN-OUT IS THE CONFIG'S: three due solo hunts, the most behind in the database (a year owed), at one
    --     instance a body and TWO bodies a fire: the roster takes exactly the two most behind, one a body.
    for i in 1 .. 3 loop
      insert into auth.users (id) values (c_u[i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (c_u[i], 'tick-capacity §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', c_u[i]::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'tick-capacity §5-harness: hr_create_character refused: %', v; end if;
      v_s := public.hr_hunt_new_session(c_u[i], 0, 'mill_cellar', null, 0, null);
      update public.hunt_sessions set entered_at = now() - interval '366 days' - make_interval(mins => i),
             hunt_from = now() - interval '365 days' - make_interval(mins => i), settled_to = now() - interval '365 days' - make_interval(mins => i),
             next_swing_at = now() - interval '365 days' - make_interval(mins => i)
       where id = v_s;
      v_sid := v_sid || v_s;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.hr_tick_config set hunt_bodies_max = 2 where id;
    select count(*), count(distinct r.body) into v_n, v_b
      from public.hr_hunt_roster_sharded('tick-capacity-probe', 1, 30000) r where r.session_id = any (v_sid);
    if v_n <> 2 or v_b <> 2
       or exists (select 1 from public.hunt_tick_lease l where l.session_id = v_sid[1] and l.lease_until > now()) then
      raise exception 'tick-capacity §5(c): at 1 a body and 2 bodies a fire the roster took % probe hunt(s) in % body(ies) (expected 2 in 2, the most behind)', v_n, v_b; end if;

    raise exception 'tick-capacity §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'tick-capacity §5: ok' then raise; end if;
  end;
end $$;
