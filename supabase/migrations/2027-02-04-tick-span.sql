-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A BEHIND HUNT CATCHES UP AT THE NEXT FIRE, MOST-BEHIND FIRST
-- (lane/c-tick-span, backend-architect, 2026-10-28; P1 before the 2026-10-30 Discord playtest).
-- STAGED. Game CLOSED: applies on its passing §5 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- Applies AFTER 2027-02-03-tick-capacity.sql (§0 pins its roster image). Moves no value.
--
-- ── THE BUG (found by lane/c-settle-cost) ──────────────────────────────────
--   Engine CPU per settle grows with the simulated window, and the window was capped at
--   15 min. After any tick outage past ~4 min every 4-instance body ran past the edge's
--   2 s CPU limit (WORKER_RESOURCE_LIMIT), took every settle in it down, and did so again
--   on every retry: the backlog NEVER drained. The edge half (hr-accrue, this lane) caps a
--   settle at 2 min of hunt and gives every request a measured engine budget (hunt-settle.js
--   HUNT_SETTLE_SPAN_MS / HUNT_ENGINE_BUDGET_MS): a body's engine CPU is at most 1 s plus
--   one slice, whatever the backlog. That makes a behind instance catch up in SLICES, and
--   two things in this roster decided how fast and how fairly:
--
--   (1) THE LEASE OUTLIVED THE SETTLE. A session is leased to its body for lease_ms (30 s)
--       and nothing ended the lease when the body's settle landed, so a behind instance was
--       re-offered only every third fire: one 2-min slice per 30 s = 4x real time, a 30-min
--       outage drained in ~10 min (and the old "90x at a 10 s tick" comment was 30x). The
--       lease now RECORDS the session clock it was taken at (hunt_tick_lease.settled_to), and
--       a lease whose session clock has moved past it is spent: its body's settle LANDED (or
--       a player's own settle did), so the next fire may take the next slice. 12x real time:
--       a 30-min outage drains in ~17 fires (tests/hunt-tick-shards.mjs OUTAGE).
--   (2) THE BODY'S ORDER WAS md5. The edge stops starting settles when the body's engine
--       budget is spent and the rest are deferred; in md5 order the same instance would sit
--       last in its body every fire and be deferred every fire (starved). The roster now
--       orders a body's selectors by its instances' clocks, most behind first (the packing —
--       which instance rides which body — is unchanged: md5 rank / hunt_body_max).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hunt_tick_lease.settled_to timestamptz NULL: the session's settled_to when the roster
--    leased it. NULL (a lease another writer took, e.g. the retired hr_hunt_roster) = unknown:
--    the lease is waited out, as before.
-- §2 hr_hunt_roster_sharded RESTATED WHOLE from 2027-02-03-tick-capacity.sql's image
--    (478508dc). Three edits, every other line the same (the due predicate, the fan-out
--    dial, the most-behind PICK, the lock, the md5 packing, the holder names):
--      a. due0's lease term: `or (l.settled_to is not null and h.settled_to > l.settled_to)`;
--      b. the lease insert / upsert writes settled_to = the locked row's clock;
--      c. `ord`: (body, the instance's min(settled_to), md5(instance), instance, session).
-- §3 grants (owner-only, unchanged); §4 nothing else; §5 the executed self-check.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   One roster statement a fire (the cron's advisory lock). A re-offered session is one whose
--   clock already moved under its lease, i.e. a commit that holds the instance lock has
--   COMMITTED. The body that held it settles each instance once a fire (tick.js `covered`),
--   so it is done with it. The one overlap left: a player's own settle moves the clock while
--   the body has not reached the instance yet AND that body is still running at the next
--   fire (> 10 s; bodies run ~1.5 s). Then two bodies may propose the same window:
--   hr_hunt_apply_instance's instance lock, world-swing CAS and derived intent keys refuse
--   the loser (session_moved -> re-read -> the remainder or not_due). Duplicate engine work
--   in a rare case, never a second payment: the lease was never the money fence.
--   `for update skip locked` still skips a row a commit is writing at the roster's instant.
--
-- ── SECURITY SURFACE (for the EA review) ────────────────────────────────────
--   NOTHING HERE MOVES VALUE OR WIDENS A ROLE: when a due session is re-offered, and in
--   which order a body carries its selectors. The restated function stays reachable by no
--   role; the new column is in a table with RLS on, zero policies, zero grants.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows: none new (one 8-byte column on hunt_tick_lease, one row per open session at most).
--   Per fire: the roster's lease join reads one more column; one more window function over
--   the fire's due set (<= hunt_body_max x hunt_bodies_max instances). In steady state no
--   session is re-offered sooner (a caught-up one is not DUE for a flush). During a catch-up,
--   a behind instance commits once a fire instead of once a lease: the DB work of a catch-up
--   is the same total (one commit per 2-min slice), delivered 3x sooner. At 100x players a
--   full outage's catch-up is bounded by the fan-out (hunt_bodies_max x hunt_body_max
--   instances a fire, most behind first), never by a body's CPU.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Re-run 2027-02-03-tick-capacity.sql §2 (its image); the column may stay (nothing else
--   reads it) or be dropped with `alter table public.hunt_tick_lease drop column settled_to`.
--   Leases taken by this body lapse in lease_ms either way.
--
-- ORDER: after 2027-02-03-tick-capacity.sql. EDGE: hr-accrue (this lane) moves the span cap and
-- the budget; either order is safe (the edge reads no lease; this roster reads no edge).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hunt_tick_lease') is null or to_regclass('public.hunt_sessions') is null then
    raise exception 'PRECONDITION: hunt_tick_lease / hunt_sessions missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'hunt_bodies_max') then
    raise exception 'PRECONDITION: apply 2027-02-03-tick-capacity.sql first (hr_tick_config.hunt_bodies_max)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure;
  if v_md5 is distinct from '478508dcfb8abd7adfffe649d899a0c7' and v_md5 is distinct from 'ec0cd7aa30f0b00e678504775894c3bc' then
    raise exception 'PIN: hr_hunt_roster_sharded is neither 2027-02-03-tick-capacity.sql''s image (478508dc) nor this file''s: md5 % - another file moved it', v_md5; end if;
  -- the cron still posts one body per roster body, in the roster's ord (this file's model of the body's order)
  if strpos((select prosrc from pg_proc where oid = 'public.hr_tick_cron_run()'::regprocedure),
            'order by r.ord) as sel') = 0 then
    raise exception 'PRECONDITION: hr_tick_cron_run no longer posts a hunt body''s selectors in the roster''s ord'; end if;
end $mig$;

-- ── §1 THE LEASE REMEMBERS THE CLOCK IT WAS TAKEN AT ─────────────────────────
alter table public.hunt_tick_lease add column if not exists settled_to timestamptz;
comment on column public.hunt_tick_lease.settled_to is
  '2027-02-04 (tick span). The session''s settled_to when hr_hunt_roster_sharded leased it. A lease whose session clock has moved past it is spent (its settle landed): the next fire may re-offer the session. NULL = unknown: the lease is waited out.';

-- ── §2 THE ROSTER: A LANDED SETTLE ENDS ITS LEASE; A BODY RUNS MOST-BEHIND FIRST ─
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
    -- lease is never re-claimed (§0 of the header, concurrency (b)) — unless it is SPENT
    -- (2027-02-04-tick-span.sql): the session's clock moved past the one it was leased at, so the
    -- settle it was leased for has LANDED and the next slice of a behind hunt is this fire's.
    select h.id, h.instance_id as inst, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now()
            or (l.settled_to is not null and h.settled_to > l.settled_to))
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
    select h.id, h.instance_id as inst, h.user_id as uid, h.slot as sl, h.settled_to as st
      from public.hunt_sessions h
     where h.id in (select d.id from due0 d join pick p on p.inst = d.inst)
       and h.ended_at is null
       and h.settled_to <= now()
     for update skip locked
  ), packed as (
    -- THE PACKING: a pure function of the due set. Every member of an instance
    -- shares the instance's rank, so its body. `inst_from`: the instance's clock, the
    -- body's order (most behind first: the edge's engine budget defers the tail, never
    -- the same instance every fire).
    select d.id, d.inst, d.uid, d.sl, d.st,
           min(d.st) over (partition by d.inst) as inst_from,
           ((dense_rank() over (order by md5(d.inst::text), d.inst)) - 1)::int / v_per as b
      from due d
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until, settled_to)
    select p.id, v_prefix || ':h' || p.b, now() + v_lease, p.st from packed p
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until,
                                           settled_to = excluded.settled_to
    returning t.session_id
  )
  select p.uid, p.sl, p.id, p.b,
         (row_number() over (order by p.b, p.inst_from, md5(p.inst::text), p.inst, p.id))::int
    from packed p join leased x on x.session_id = p.id
   order by 5;
end $function$;

-- ── §3 GRANTS: the restated roster stays owner-only ──────────────────────────
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
-- Fails on the pre-image: the column does not exist; a landed settle's session waits out its lease;
-- a body's order is md5's (the probes are aged against it, so md5 order is the reverse of age).
do $$
declare
  c_u    constant uuid[] := array['000000d6-0000-4000-a000-00007a5e0001', '000000d6-0000-4000-a000-00007a5e0002',
                                  '000000d6-0000-4000-a000-00007a5e0003']::uuid[];
  v      jsonb;
  v_sid  uuid[] := '{}';
  v_by   uuid[];
  v_s    uuid;
  v_n    int;
  v_got  uuid[];
  i      int;
begin
  -- (a) THE SHAPE: the column (timestamptz, nullable); the body is this file's image; owner-only.
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'hunt_tick_lease'
        and column_name = 'settled_to') is distinct from 'timestamp with time zone'
     or (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'hunt_tick_lease'
        and column_name = 'settled_to') <> 'YES' then
    raise exception 'tick-span §5(a): hunt_tick_lease.settled_to is not a nullable timestamptz'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure)
       <> 'ec0cd7aa30f0b00e678504775894c3bc' then
    raise exception 'tick-span §5(a): hr_hunt_roster_sharded is not this file''s image'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute'))
     or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', 'public.hr_hunt_roster_sharded(text,integer,integer)', 'execute')) then
    raise exception 'tick-span §5(a): the roster is reachable by a role that must not run it'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_tick_lease')
     or has_table_privilege('anon', 'public.hunt_tick_lease', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.hunt_tick_lease', 'select,insert,update,delete') then
    raise exception 'tick-span §5(a): hunt_tick_lease gained a policy or a client grant'; end if;

  begin
    -- THE FIXTURE: three due solo hunts, the most behind in the database (a year owed), aged AGAINST md5:
    -- the instance first in md5 order is the LEAST behind, so a body in md5 order is the reverse of age.
    for i in 1 .. 3 loop
      insert into auth.users (id) values (c_u[i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (c_u[i], 'tick-span §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', c_u[i]::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'tick-span §5-harness: hr_create_character refused: %', v; end if;
      v_s := public.hr_hunt_new_session(c_u[i], 0, 'mill_cellar', null, 0, null);
      v_sid := v_sid || v_s;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    select array_agg(h.id order by md5(h.instance_id::text), h.instance_id) into v_by
      from public.hunt_sessions h where h.id = any (v_sid);
    for i in 1 .. 3 loop
      -- v_by[1] (md5-first) one year + 1 min behind ... v_by[3] (md5-last) one year + 3 min: most behind
      update public.hunt_sessions set entered_at = now() - interval '366 days' - make_interval(mins => i),
             hunt_from = now() - interval '365 days' - make_interval(mins => i), settled_to = now() - interval '365 days' - make_interval(mins => i),
             next_swing_at = now() - interval '365 days' - make_interval(mins => i)
       where id = v_by[i];
    end loop;
    delete from public.hunt_tick_lease where session_id = any (v_sid);
    update public.hr_tick_config set hunt_bodies_max = 1 where id;

    -- (b) ORDER: one body of four takes the three probes (the most behind in the database) MOST BEHIND FIRST.
    select array_agg(r.session_id order by r.ord) into v_got
      from public.hr_hunt_roster_sharded('tick-span-probe', 4, 30000) r where r.session_id = any (v_sid);
    if v_got is distinct from array[v_by[3], v_by[2], v_by[1]] then
      raise exception 'tick-span §5(b): the body carries the probes in the order % (want most behind first: %)', v_got, array[v_by[3], v_by[2], v_by[1]]; end if;
    -- (c) THE LEASE RECORDS THE CLOCK IT WAS TAKEN AT.
    select count(*) into v_n from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
     where l.session_id = any (v_sid) and l.settled_to = h.settled_to and l.lease_until > now();
    if v_n <> 3 then raise exception 'tick-span §5(c): % of 3 probe leases record their session''s clock', v_n; end if;
    -- (d) A LIVE LEASE OVER AN UNMOVED CLOCK IS NOT RE-OFFERED (control: the 2026-11-04 rule stands).
    select count(*) into v_n from public.hr_hunt_roster_sharded('tick-span-probe', 4, 30000) r where r.session_id = any (v_sid);
    if v_n <> 0 then raise exception 'tick-span §5(d): % leased probe(s) with unmoved clocks were re-offered', v_n; end if;
    -- (e) A LANDED SETTLE ENDS ITS LEASE: v_by[3]'s clock moves two minutes (its settle landed); v_by[2]'s too, but its
    --     lease records no clock (another writer's lease): only v_by[3] is re-offered at the next fire.
    update public.hunt_sessions set settled_to = settled_to + interval '2 minutes', next_swing_at = next_swing_at + interval '2 minutes'
     where id = any (array[v_by[3], v_by[2]]);
    update public.hunt_tick_lease set settled_to = null where session_id = v_by[2];
    select array_agg(r.session_id) into v_got
      from public.hr_hunt_roster_sharded('tick-span-probe', 4, 30000) r where r.session_id = any (v_sid);
    if v_got is distinct from array[v_by[3]] then
      raise exception 'tick-span §5(e): after v_by[3]''s settle landed the next fire re-offered % (want exactly %)', v_got, array[v_by[3]]; end if;
    if not exists (select 1 from public.hunt_tick_lease l join public.hunt_sessions h on h.id = l.session_id
                    where l.session_id = v_by[3] and l.settled_to = h.settled_to and l.holder = 'tick-span-probe:h0') then
      raise exception 'tick-span §5(e): the re-offered lease does not record the moved clock under the body''s holder'; end if;

    raise exception 'tick-span §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'tick-span §5: ok' then raise; end if;
  end;
end $$;
