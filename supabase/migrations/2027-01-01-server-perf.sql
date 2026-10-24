-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-01-server-perf.sql — THREE MEASURED SERVER COSTS, CUT:
--   THE ACCRUE BUDGET PER HERO, THE HUNT ROSTER ON THE LIVE PRESENCE STAMP,
--   AND A CRON DETECTOR THAT NO LONGER SCANS EVERY RUN SINCE MAY.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-server-perf, backend-architect,
-- 2026-10-24). Game CLOSED: applies on its passing §4 (tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00–00:10 UTC). Moves no value.
-- DB-ONLY: no hr-accrue change (pack-edge --hash unmoved). In the reopen Security
-- review as an ABUSE-CONTROL change (the accrue rate gate; see EXPLOIT SURFACE).
--
-- ── MEASURED BEFORE (production, read-only, 2026-10-24 02:30 UTC;
--    pg_stat_statements since 2026-08-17, track = top) ───────────────────────
--  (1) THE RATE GATE. hr_rate_counters is keyed (user_id, bucket), so every hero
--      an account plays at once (up to 4, Tyler 2026-10-17) spends ONE `accrue`
--      counter (30/min) and queues on ONE row: hr_rate_ok's upsert takes that
--      row's lock and holds it to the end of the caller's read transaction (the
--      accrue read, the hunt read: hr_state_of and the instance read run under
--      it). The bare gate statement does 8 buffers of work (min 0.1 ms) yet
--      averages 11.9 ms with a 60.9 s max over 256,623 calls: ~3,000 s of
--      waiting on that row, each wait holding a pooled connection (max 60).
--      The shared budget refused 2,029 accrue calls on 2026-10-23 (371 on
--      10-22; hr_rejections, sampled weights), the four-hero party Andy plays.
--  (2) THE HUNT ROSTER reads "is this hunter watched?" from
--      player_state.last_seen_at, written only by hr_heartbeat, which only the
--      scrapped client called: it is NULL on every character on production.
--      The rebuilt client stamps character_presence (hr_players_online, every
--      social poll) and hr_frame_wanted reads that since 2026-12-25. The live
--      tick calls hr_hunt_roster_sharded (hr_tick_cron_run), which copies the
--      same predicate byte for byte; hr_hunt_roster carries it too. So every
--      hunter reads as UNWATCHED. Harmless today only because
--      hr_tick_config.fold_windows = 1 (watched and unwatched are both due at
--      90 s); it makes fold_windows — the one lever that cuts tick settles for
--      closed-browser hunts — unusable: raised, it would slow WATCHED hunts too.
--  (3) hr_cron_health: 940 ms mean over its life, but the hourly run's own
--      wall time (cron.job_run_details, end - start) is 4.5–4.8 s every hour
--      this week, from 14 ms in August, roughly doubling weekly. The one input
--      that grows with time is pg_cron's run history: 494,460 rows / 79 MB
--      (19% of a 419 MB database that is already past this detector's own
--      400 MB fuse), oldest 2026-05-04, NOTHING prunes it, its only index is
--      the runid PK (owned by supabase_admin: no index can be added). (a) and
--      (b) seq-scan all of it every hour: EXPLAIN ANALYZE 57 ms + 272 ms;
--      hr_db_sample 90 ms. The remaining ~4 s could not be located read-only
--      (no disk reads, no JIT, no RLS cost, same plan as a cursor, not the
--      :07 ledger prune — 20–30 ms); §3 makes the detector log its own phase
--      times so its first run after the apply names it.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- §1 hr_rate_gate RESTATED from the live image (closed-mode's body, md5
--    250f4223): the `accrue` bucket (accrue, hunt_settle, sheet: one hero's own
--    engine reads) is keyed 'accrue:<slot>' for a hero that EXISTS (a
--    player_state row), so each hero has its own 30/min and its own row, and
--    no hero's read holds a lock another hero's gate waits on. A slot with no
--    hero spends the account's own 'accrue' row: the counter namespace stays
--    bounded by the account's heroes (slot CHECK 0–5), never minted per call.
--    `activity`, `shop`, `claim` stay per ACCOUNT, unchanged: shop moves the
--    account's one purse (2026-12-15), claim is a once-a-day gesture, activity
--    is a cheap town verb with no refusal in the last 3 days. Every limit,
--    window, the fail-closed unknown bucket, the closed-mode refusal and the
--    sampled rejection record (journalled under the hero's slot) are kept.
-- §2 hr_hunt_roster AND hr_hunt_roster_sharded RESTATED from the live images:
--    WATCHED = a fresh character_presence row (seen within 75 s, never from the
--    future: hr_frame_wanted's window). Nothing else in either body moves.
-- §3 hr_cron_health_ex RESTATED from the live image: (h) the scheduler's run
--    history is kept 7 days (pg_cron's and Supabase's documented practice;
--    every check here reads at most 48 h of it), pruned by runid range — the
--    PK — at most 100,000 rows a run, so the 380k backlog clears in four hourly
--    runs and the steady state deletes ~700 rows an hour; a privilege failure
--    raises a `cron-retention:<day>` warn alert instead of failing the
--    detector; and every run logs `phase_ms` and `cron_pruned` in its
--    maintenance_log row. (a)–(g) are unchanged, line for line.
-- §4 SELF-CHECK, executed, every probe rolled back by a sentinel.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- §1: two heroes of one account now upsert two different rows; a hero's own
-- concurrent calls still serialise on its own row (they read the same
-- character, so nothing is lost). The player_state probe takes no lock.
-- §2: unchanged locking (for update skip locked on hunt_sessions); the
-- presence read is a PK probe per due candidate.
-- §3: the delete is a PK range strictly below the oldest run that started in
-- the last 7 days; pg_cron inserts every new run above max(runid), so a
-- running or new run is never in range. A concurrent pg_cron update of an old
-- row does not exist (it updates only its own current runs).
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- §0 accepts each body's live image (pre) or this file's own (post); the four
-- restatements are create-or-replace of identical text; revokes and the one
-- grant are idempotent; §4 re-runs and rolls back. A second apply is
-- byte-identical. The retention is idempotent by construction (a range below
-- a moving floor).
--
-- ── EXPLOIT SURFACE DELTA (for the reopen Security review) ──────────────────
-- No new function, table, grant or client RPC (hr_client_rpc_baseline
-- unchanged). §1 is an ABUSE CONTROL: an account's accrue budget becomes
-- 30/min PER HERO, so its ceiling is 30 x its heroes (at most 6 slots by the
-- player_state CHECK, 5 buyable by ruling) instead of 30 shared. The bound
-- is real, not a counter (a shared account counter would re-create the
-- cross-hero lock this file removes). A caller cannot mint keys: the slot is
-- the engine's verified intent slot, and only an EXISTING hero gets its own
-- key. Per-call/per-day clamps inside hr_apply / hr_hunt_apply_instance are
-- untouched. §2 reads a server-stamped fact (character_presence: the caller's
-- own rows, server clock, 20 s floor); a forged presence can only make the
-- forger's own hunt settle at the normal cadence. §3 deletes pg_cron's run
-- history only (no player row), inside a SECURITY DEFINER function no client
-- can execute.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- §1: +1 PK probe on player_state per gated call (~0.02 ms); hr_rate_counters
-- gains at most one row per hero (100x = ~800 rows, unlogged, ~100 KB).
-- §2: +1 PK probe per due candidate per fire. §3: cron.job_run_details holds
-- ~7 days (~16k runs/day = ~113k rows, ~18 MB) instead of growing ~2.6 MB/day
-- forever; it does not grow with players (cron runs are per job).
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Re-apply each body's live image: hr_rate_gate from 2026-10-21-closed-mode.sql
-- §6, hr_hunt_roster from 2026-10-22-hunt-sessions-settle.sql,
-- hr_hunt_roster_sharded from 2026-11-04-hunt-tick-shards.sql,
-- hr_cron_health_ex from 2026-09-03-cron-health-generalized.sql. The pruned run
-- history is operational telemetry (failures already raised as alerts) and is
-- not restored. Old per-account 'accrue' counter rows are harmless either way.
-- ORDER: after 2026-12-27-chat-unpublish.sql; touches no object any 12-xx file
-- touches. No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): tests/live-hash-drift.mjs moves hr_rate_gate and
-- hr_hunt_roster (the two tracked bodies; hr_hunt_roster_sharded and
-- hr_cron_health_ex are untracked); re-seed with --live --write and flip this
-- note to APPLIED. MEASURE AFTER: pg_stat_statements_reset() is not needed —
-- compare cron.job_run_details durations for jobid 18 (the detector) and the
-- maintenance_log 'cron-health' detail.phase_ms, hr_rejections rate_limited
-- 'accrue' per day, and the bare gate statement's mean/max deltas.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.character_presence') is null then
    raise exception 'PRECONDITION: apply 2026-11-07-players-online.sql first (character_presence is the presence the rosters read)'; end if;
  if to_regclass('public.hr_rate_counters') is null or to_regclass('public.hunt_tick_lease') is null
     or to_regclass('public.hr_db_samples') is null or to_regclass('public.maintenance_log') is null then
    raise exception 'PRECONDITION: hr_rate_counters / hunt_tick_lease / hr_db_samples / maintenance_log missing'; end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_db_sample(integer)') is null then
    raise exception 'PRECONDITION: hr_rate_ok / hr_rate_over / hr_admitted / hr_db_sample missing'; end if;
  -- Each body is its live image (pre, measured on production 2026-10-24 and equal on the replay) or this
  -- file's own (post: a second apply). Anything else means another file moved it: re-pin before applying.
  for r in select * from (values
    ('public.hr_rate_gate(uuid,integer,text)', '250f4223465ba99c365cf6b6826d7685', 'f4184f70ac28bfa2469398d841f2a876', '2026-10-21-closed-mode.sql'),
    ('public.hr_hunt_roster(text,integer,integer)', '75f90c7b6263672120724417b53421f2', '0a125d0d36bda0eb46e4bc8d6652a59a', '2026-10-22-hunt-sessions-settle.sql'),
    ('public.hr_hunt_roster_sharded(text,integer,integer)', 'd2b0187e856e25e21d51acf677964382', '23af29bf177e191f8a6e365533ae45e0', '2026-11-04-hunt-tick-shards.sql'),
    ('public.hr_cron_health_ex(interval,numeric)', '7a6d398cadb22ba039dafe8c6f2c6eee', 'a217db065aa65cf71aea1186f50f82f0', '2026-09-03-cron-health-generalized.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 hr_rate_gate: THE ACCRUE BUDGET IS THE HERO'S ─────────────────────────
create or replace function public.hr_rate_gate(p_user uuid, p_slot int, p_bucket text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_limit  int;
  v_window interval;
  v_weight bigint;
  v_key    text;
begin
  if p_user is null then return false; end if;
  -- CLOSED MODE (2026-10-21-closed-mode.sql): the hr-accrue engine never passes
  -- PostgREST's pre-request hook, so a character whose account is not admitted
  -- is refused here, before any budget is spent or any state is read.
  if not public.hr_admitted(p_user) then return false; end if;

  -- THE ALLOWLIST AND THE LIMITS. Server-owned, all of them. An unknown bucket
  -- is refused rather than defaulted: a typo in a caller must not silently
  -- create a brand-new, unlimited counter namespace.
  case p_bucket
    when 'accrue'   then v_limit := 30; v_window := interval '1 minute';
    -- b345. Matches `accrue` deliberately: set_activity runs a COLLECT apply
    -- and a SWITCH apply, so it is strictly more expensive per call and must
    -- not be the looser budget of the two.
    when 'activity' then v_limit := 30; v_window := interval '1 minute';
    -- b351. shop_buy AND vendor_sell, sharing one counter: they are one
    -- surface. Matches the other two rather than being looser, even though a
    -- spend is one apply — a shop verb moves VALUE, and the conservative
    -- number is the one that does not have to be argued down later.
    when 'shop'     then v_limit := 30; v_window := interval '1 minute';
    -- b349. 20/min, TIGHTER than the three above. A claim is a once-per-UTC-day
    -- gesture; the budget exists only to bound a retry storm, and 20 leaves ample
    -- room for the client's single automatic retry on `version_conflict` plus a
    -- player hammering a button. Choosing 30 "for consistency" would have been a
    -- number nobody decided.
    when 'claim'    then v_limit := 20; v_window := interval '1 minute';
    else return false;
  end case;

  -- SERVER-PERF (2027-01-01-server-perf.sql): THE ACCRUE BUDGET IS THE HERO'S.
  -- `accrue` prices one hero's own engine reads (accrue, hunt_settle, sheet).
  -- Keyed per account, every hero the login plays at once shared 30 a minute
  -- and queued on ONE counter row, whose lock the upsert below holds to the end
  -- of the caller's read transaction. So the key is 'accrue:<slot>' — but only
  -- for a hero that EXISTS, so the namespace stays bounded by the account's
  -- heroes; any other slot spends the account's own 'accrue' row. The other
  -- buckets stay per account (the purse and claims are the account's).
  v_key := p_bucket;
  if p_bucket = 'accrue' and p_slot is not null
     and exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then
    v_key := 'accrue:' || p_slot::text;
  end if;

  if public.hr_rate_ok(p_user, v_key, v_limit, v_window) then
    return true;
  end if;

  -- Sampled record. Same policy as hr_load and hr_apply: detection does not need
  -- every event, it needs to know the event is happening and roughly how much.
  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, v_key) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', true), v_weight);
  end if;
  return false;
end $$;
revoke execute on function public.hr_rate_gate(uuid, int, text) from public;
revoke execute on function public.hr_rate_gate(uuid, int, text) from anon, authenticated, service_role;
grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;

-- ── §2 THE HUNT ROSTERS: WATCHED = OPEN IN A CLIENT ──────────────────────────
create or replace function public.hr_hunt_roster(p_holder text, p_limit integer default 200, p_lease_ms integer default 30000)
returns table(user_id uuid, slot integer, session_id uuid)
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
#variable_conflict use_column
declare
  c_max_rows constant int := 500;
  v_role    text;
  v_limit   int;
  v_lease   interval;
  v_holder  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine') then
    raise exception 'hr_hunt_roster: not callable by %', v_role using errcode = '42501';
  end if;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), c_max_rows);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);
  select make_interval(secs => c.flush_seconds), c.fold_windows into v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due as (
    select h.id, h.user_id as uid, h.slot as sl, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now() or l.holder = v_holder)
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 -- SERVER-PERF (2027-01-01-server-perf.sql): WATCHED = OPEN IN A CLIENT, the stamp the rebuilt
                 -- client writes (character_presence; hr_frame_wanted's 75 s window, never the future).
                 case when exists (select 1 from public.character_presence cp
                                    where cp.user_id = h.user_id and cp.slot = h.slot
                                      and cp.seen_at >  now() - interval '75 seconds'
                                      and cp.seen_at <= now() + interval '60 seconds')
                      then 1 else v_fold end))
     order by h.settled_to, h.id
     limit v_limit
     for update of h skip locked
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until)
    select d.id, v_holder, now() + v_lease from due d
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
    returning t.session_id
  )
  select d.uid, d.sl, d.id from due d join leased x on x.session_id = d.id
   order by d.settled_to, d.id;
end $function$;
revoke execute on function public.hr_hunt_roster(text, integer, integer) from public;
revoke execute on function public.hr_hunt_roster(text, integer, integer) from anon, authenticated, service_role, hr_engine;

create or replace function public.hr_hunt_roster_sharded(p_prefix text, p_body_max integer, p_lease_ms integer default 30000)
returns table(user_id uuid, slot integer, session_id uuid, body integer, ord integer)
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
#variable_conflict use_column
declare
  -- THE FAN-OUT CEILING: hunt bodies a fire (tick.js MAX_SHARDS; pg_net batch 200).
  c_bodies  constant int := 16;
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
  select make_interval(secs => c.flush_seconds), c.fold_windows into v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
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
    -- THE INSTANCES THIS FIRE TAKES: the most behind first, as many as 16 bodies hold.
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
revoke execute on function public.hr_hunt_roster_sharded(text, integer, integer) from public;
revoke execute on function public.hr_hunt_roster_sharded(text, integer, integer) from anon, authenticated, service_role, hr_engine;

-- ── §3 hr_cron_health_ex: THE RUN HISTORY KEPT 7 DAYS, EVERY PHASE TIMED ─────
create or replace function public.hr_cron_health_ex(p_window interval default '25:00:00'::interval, p_scale numeric default 1.0)
returns integer
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  -- ── THE SENSITIVITY SEAM. Clamped to (0, 1] so it can only ever make an
  --    alarm fire SOONER. `least(1.0, …)` is the half that matters: without it
  --    this parameter would be an off switch.
  c_scale constant numeric := least(1.0, greatest(0.000000001, coalesce(p_scale, 1.0)));

  -- ── THE FUSES. See the file header for what each one was measured against.
  c_db_warn        constant bigint := (400 * 1024 * 1024 * c_scale)::bigint;
  c_db_crit        constant bigint := (800 * 1024 * 1024 * c_scale)::bigint;
  c_db_growth_warn constant bigint := ( 50 * 1024 * 1024 * c_scale)::bigint;   -- per 24h
  c_db_growth_crit constant bigint := (150 * 1024 * 1024 * c_scale)::bigint;
  c_tbl_warn       constant bigint := ( 50 * 1024 * 1024 * c_scale)::bigint;
  c_tbl_crit       constant bigint := (100 * 1024 * 1024 * c_scale)::bigint;   -- the old game_events threshold
  c_tbl_growth     constant bigint := ( 25 * 1024 * 1024 * c_scale)::bigint;   -- per 24h
  c_rows_warn      constant bigint := (    250000 * c_scale)::bigint;          -- per 24h
  c_rows_crit      constant bigint := (   1000000 * c_scale)::bigint;
  c_conn_warn      constant numeric := 0.70 * c_scale;
  c_conn_crit      constant numeric := 0.85 * c_scale;
  c_never_ran_grace constant interval := interval '48 hours';
  -- SERVER-PERF (2027-01-01-server-perf.sql): pg_cron's run history is kept this long (every check above
  -- reads at most 48 h of it) and pruned at most this many rows a run, by runid range (its only index).
  c_cron_keep      constant interval := interval '7 days';
  c_cron_prune_max constant bigint := 100000;

  v_alerts int := 0;
  r record;
  v_sev text; v_msg text;
  v_now  public.hr_db_samples%rowtype;
  v_prev public.hr_db_samples%rowtype;
  v_day  text := to_char(now(), 'YYYY-MM-DD');
  v_bytes bigint; v_rows bigint; v_delta bigint;
  v_first timestamptz;
  -- SERVER-PERF: every phase's wall time (ms) and the retention's count land in this run's maintenance_log row.
  v_t0 timestamptz := clock_timestamp();
  v_t  timestamptz := clock_timestamp();
  v_ph jsonb := '{}'::jsonb;
  v_lo bigint; v_hi bigint;
  v_pruned bigint := 0;
  v_prune_err text;
begin
  -- ── (a) FAILED RUNS. Unchanged. ────────────────────────────────────────
  if to_regclass('cron.job_run_details') is not null then
    for r in
      select d.runid, d.jobid, j.jobname, d.status, d.return_message, d.start_time
        from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
       where d.status = 'failed' and d.start_time > now() - p_window
    loop
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-run:' || r.runid, 'critical',
              format('cron job %s FAILED: %s', coalesce(r.jobname, 'jobid ' || r.jobid), left(coalesce(r.return_message,''), 300)),
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname, 'runid', r.runid,
                                 'status', r.status, 'start_time', r.start_time))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        raise warning '[cron-health] % FAILED: %', coalesce(r.jobname, r.jobid::text), left(coalesce(r.return_message,''), 300);
      end if;
    end loop;
    v_ph := v_ph || jsonb_build_object('a_failed', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();

    -- ── (b) STOPPED vs NEVER STARTED, with (g) THE NEVER-RAN ESCALATION ──
    -- `any_run` is still the discriminator between the two. What is new is that
    -- "never ran" stops being a permanent excuse: once this database has SEEN
    -- the job for longer than the grace window (hr_db_samples.jobs is the only
    -- record of when — cron.job has no created_at), a job with no run history
    -- is not new, it is broken, and it escalates to 'warn' like any other.
    for r in
      select j.jobid, j.jobname,
             max(d.start_time) filter (where d.status = 'succeeded') as last_success,
             count(d.runid)                                          as any_run
        from cron.job j
        left join cron.job_run_details d on d.jobid = j.jobid
       where j.active group by j.jobid, j.jobname
      having coalesce(max(d.start_time) filter (where d.status = 'succeeded'),
                      'epoch'::timestamptz) < now() - interval '48 hours'
    loop
      if r.any_run = 0 then
        select min(s.at) into v_first from public.hr_db_samples s where s.jobs ? r.jobname;
        if v_first is not null and v_first < now() - c_never_ran_grace then
          v_sev := 'warn';
          v_msg := format('cron job %s has NEVER run, and has been scheduled since %s — '
                          'it is not new, it is not firing', r.jobname, v_first);
        else
          v_sev := 'info';
          v_msg := format('cron job %s has no run history yet (new, or it has never fired)', r.jobname);
        end if;
      else
        v_sev := 'warn';
        v_msg := format('cron job %s has not succeeded since %s', r.jobname,
                        coalesce(r.last_success::text, 'never'));
      end if;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-stale:' || r.jobname || ':' || v_day, v_sev, v_msg,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname,
                                 'last_success', r.last_success, 'runs_seen', r.any_run,
                                 'first_seen', v_first))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        if v_sev = 'warn' then raise warning '[cron-health] %', v_msg; else raise notice '[cron-health] %', v_msg; end if;
      end if;
    end loop;
    v_ph := v_ph || jsonb_build_object('b_stale', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();
  else
    raise notice 'hr_cron_health: cron.job_run_details not readable — failure detection is INERT here';
  end if;

  -- ── THE SAMPLE. Taken BEFORE the size checks so this run's own numbers are
  --    the ones compared, and so a growth rate exists from the second run on.
  v_now := public.hr_db_sample(10);
  -- The nearest sample at least 24h old. `order by at desc limit 1` over an
  -- indexed primary key; NULL on a database younger than a day, which simply
  -- means no rate is reported yet (never a rate of "everything is new").
  select * into v_prev from public.hr_db_samples
   where at <= now() - interval '24 hours' order by at desc limit 1;
  v_ph := v_ph || jsonb_build_object('sample', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

  -- ── (d) DATABASE SIZE AND GROWTH ───────────────────────────────────────
  if v_now.db_bytes > c_db_warn then
    v_sev := case when v_now.db_bytes > c_db_crit then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'db-size:' || v_day, v_sev,
            format('database is %s (fuse %s) — see the threshold table in 2026-09-03-cron-health-generalized.sql',
                   pg_size_pretty(v_now.db_bytes), pg_size_pretty(c_db_warn)),
            jsonb_build_object('bytes', v_now.db_bytes, 'warn', c_db_warn, 'crit', c_db_crit))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] database is %', pg_size_pretty(v_now.db_bytes); end if;
  end if;

  if v_prev.at is not null then
    v_delta := v_now.db_bytes - v_prev.db_bytes;
    if v_delta > c_db_growth_warn then
      v_sev := case when v_delta > c_db_growth_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'db-growth:' || v_day, v_sev,
              format('database grew %s in 24h (now %s) — b319 ran at ~57 MB/day from six players',
                     pg_size_pretty(v_delta), pg_size_pretty(v_now.db_bytes)),
              jsonb_build_object('delta', v_delta, 'bytes', v_now.db_bytes,
                                 'since', v_prev.at, 'warn', c_db_growth_warn))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] database grew % in 24h', pg_size_pretty(v_delta); end if;
    end if;
  end if;

  -- ── (e) PER TABLE: SIZE, GROWTH, ROW DELTA ─────────────────────────────
  -- (c) — the old hardcoded game_events check — is exactly this loop's
  -- `c_tbl_crit` arm, at exactly the same 100 MB, for every table rather than
  -- for the one that already burned us.
  for r in select key as relname, value as v from jsonb_each(v_now.tables)
  loop
    v_bytes := coalesce((r.v ->> 'b')::bigint, 0);
    v_rows  := coalesce((r.v ->> 'r')::bigint, 0);

    if v_bytes > c_tbl_warn then
      v_sev := case when v_bytes > c_tbl_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'table-size:' || r.relname || ':' || v_day, v_sev,
              format('public.%s is %s (%s rows) — retention is not keeping up (see b319)',
                     r.relname, pg_size_pretty(v_bytes), v_rows),
              jsonb_build_object('table', r.relname, 'bytes', v_bytes, 'rows', v_rows,
                                 'warn', c_tbl_warn, 'crit', c_tbl_crit))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] public.% is %', r.relname, pg_size_pretty(v_bytes); end if;
    end if;

    if v_prev.at is not null and v_prev.tables ? r.relname then
      v_delta := v_bytes - coalesce((v_prev.tables -> r.relname ->> 'b')::bigint, 0);
      if v_delta > c_tbl_growth then
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-growth:' || r.relname || ':' || v_day, 'warn',
                format('public.%s grew %s in 24h (now %s)', r.relname,
                       pg_size_pretty(v_delta), pg_size_pretty(v_bytes)),
                jsonb_build_object('table', r.relname, 'delta', v_delta, 'bytes', v_bytes,
                                   'since', v_prev.at, 'warn', c_tbl_growth))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% grew % in 24h', r.relname, pg_size_pretty(v_delta); end if;
      end if;

      v_delta := v_rows - coalesce((v_prev.tables -> r.relname ->> 'r')::bigint, 0);
      if v_delta > c_rows_warn then
        v_sev := case when v_delta > c_rows_crit then 'critical' else 'warn' end;
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-rows:' || r.relname || ':' || v_day, v_sev,
                format('public.%s gained %s rows in 24h (now ~%s) — b319 wrote ~460k/day',
                       r.relname, v_delta, v_rows),
                jsonb_build_object('table', r.relname, 'row_delta', v_delta, 'rows', v_rows,
                                   'since', v_prev.at, 'warn', c_rows_warn))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% gained % rows in 24h', r.relname, v_delta; end if;
      end if;
    end if;
  end loop;

  -- ── (f) CONNECTION HEADROOM ────────────────────────────────────────────
  -- The failure this watches for is TOTAL and takes the dashboard with it, so
  -- it alarms on the ratio rather than on a count: max_connections is a plan
  -- property and can change under us.
  if v_now.max_conns > 0
     and v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_warn then
    v_sev := case when v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_crit
                  then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'connections:' || v_day, v_sev,
            format('%s of %s connections in use (%s%%) — every Edge Function call must go '
                   'through the transaction pooler on 6543 (server-authority.md 2a-ii)',
                   v_now.used_conns, v_now.max_conns,
                   round(100.0 * v_now.used_conns / v_now.max_conns)),
            jsonb_build_object('used', v_now.used_conns, 'max', v_now.max_conns))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] % of % connections in use', v_now.used_conns, v_now.max_conns; end if;
  end if;
  v_ph := v_ph || jsonb_build_object('checks', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

  -- ── RETENTION FOR THE DETECTOR'S OWN TABLES ────────────────────────────
  -- Nothing pruned these. 471 maintenance_log rows since 2026-08-11 is small,
  -- but "small and unbounded" is precisely what game_events was on day one, and
  -- a monitoring table that outgrows the thing it monitors is a bad joke.
  --
  -- 180 DAYS, AND THE NUMBER IS NOT MINE: docs/design/restore-runbook.md's
  -- retention audit already ruled on this gap — "one hr_maintenance_prune()
  -- retaining 180 days of maintenance_log and acked maintenance_alerts" — and a
  -- second author quietly picking 90 is how two policies for one table start.
  -- What DOES differ from that recommendation is the location: it lands inside
  -- the hourly detector rather than as a new function on a new cron slot,
  -- because it is two DELETEs against tables holding hundreds of rows and a
  -- scheduled job is a thing that can silently stop (which is check (b) of this
  -- very function). Same policy, one fewer moving part.
  --
  -- ⚠ ACKED ALERTS ONLY. An OPEN alert is never deleted by a timer — ageing out
  --   an alarm nobody has acknowledged is deleting the evidence of the thing you
  --   are watching for. bug_reports is deliberately untouched (player-reported
  --   evidence: curated, never aged out — the runbook's call, and it is right).
  delete from public.maintenance_log where ran_at < now() - interval '180 days';
  delete from public.maintenance_alerts
   where acked_at is not null and created_at < now() - interval '180 days';

  -- ── (h) THE SCHEDULER'S OWN RUN HISTORY (SERVER-PERF, 2027-01-01-server-perf.sql) ──
  -- pg_cron writes a row per run and prunes none: 494,460 rows / 79 MB since May (2026-10-24), every one
  -- of them seq-scanned by (a) and (b) every hour. Kept 7 days; deleted by runid range strictly below the
  -- oldest run that STARTED inside the window (runid is pg_cron's insert order and its only index), at most
  -- c_cron_prune_max a run. A new or running job's row is always above that floor. No run inside the window
  -- (the scheduler dead a week) = nothing pruned: the evidence stays. A failure here is an alert, never a
  -- failed detector.
  if to_regclass('cron.job_run_details') is not null then
    begin
      select min(d.runid) into v_lo from cron.job_run_details d;
      select d.runid into v_hi from cron.job_run_details d
       where d.start_time >= now() - c_cron_keep order by d.runid limit 1;
      if v_lo is not null and v_hi is not null and v_hi > v_lo then
        delete from cron.job_run_details d
         where d.runid >= v_lo and d.runid < least(v_hi, v_lo + c_cron_prune_max);
        get diagnostics v_pruned = row_count;
      end if;
    exception when insufficient_privilege then
      v_prune_err := left(sqlerrm, 300);
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-retention:' || v_day, 'warn',
              format('cron.job_run_details retention could not run (%s): the run history grows without '
                     'bound and this detector''s scans with it', v_prune_err),
              jsonb_build_object('error', v_prune_err, 'keep', c_cron_keep::text))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] cron.job_run_details retention could not run: %', v_prune_err; end if;
    end;
  end if;
  v_ph := v_ph || jsonb_build_object('retention', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int,
                                     'total', round(extract(epoch from clock_timestamp() - v_t0) * 1000)::int);

  insert into public.maintenance_log (job, detail)
  values ('cron-health', jsonb_build_object(
    'alerts_raised', v_alerts, 'window', p_window::text,
    'db_bytes', v_now.db_bytes, 'conns', v_now.used_conns, 'max_conns', v_now.max_conns,
    'rate_window', v_prev.at,
    -- Recorded so a scaled PROBE run is never mistaken for a real one in the log.
    'scale', case when c_scale = 1.0 then null else c_scale end,
    -- SERVER-PERF: where this run's time went, and what (h) pruned.
    'phase_ms', v_ph, 'cron_pruned', v_pruned, 'cron_prune_error', v_prune_err));
  return v_alerts;
end;
$function$;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- PROBE ROWS ONLY: every player row is keyed on the v_u uuids (gen_random_uuid() does not mint them). Where
-- pg_cron's run history is ABSENT (the PGlite replay) a probe table with pg_cron's real column shape is
-- installed; on production the real one is pruned (up to the cap) and the sentinel rolls it back.
--   s0  grants: no client role can execute the gate, the rosters or the detector; the engine keeps the gate,
--       the tick keeps hr_hunt_roster; hygiene STRICT
--   s1  ★ THE GATE: two heroes of ONE account each get their own 30/min; a third, absent slot spends the
--       account's key (never a minted 'accrue:<n>'); `activity` stays shared; a non-admitted account is
--       refused; the refusal is journalled under the hero's slot
--   s2  ★ THE ROSTERS (both): with fold_windows 4, a session open in a client (presence 10 s old) is due at
--       one flush; one with a fresh last_seen_at but no presence, one with presence 76 s old and one with
--       presence from the future are NOT; the control (fold 1) makes all four due
--   s3  ★ THE DETECTOR: every run older than 7 days below the floor is pruned (up to the cap), every run
--       from the window is kept, and the run's maintenance_log row carries phase_ms and cron_pruned
--   s4  every body landed as its post pin
do $$
declare
  v_u  uuid[] := array['000000c0-0000-4000-a000-00005e2f0001', '000000c0-0000-4000-a000-00005e2f0002',
                       '000000c0-0000-4000-a000-00005e2f0003', '000000c0-0000-4000-a000-00005e2f0004',
                       '000000c0-0000-4000-a000-00005e2f0005', '000000c0-0000-4000-a000-00005e2f0006']::uuid[];
  v_a  uuid; v_out uuid;
  v    jsonb; v_g text; v_i int; v_n int; v_txt text; v_ok boolean; v_at timestamptz;
  v_sid uuid[] := array[]::uuid[];
  v_got uuid[]; v_sh uuid[];
  v_cron text := 'absent';
  v_lo bigint; v_hi bigint; v_expect bigint; v_fresh bigint; v_fresh2 bigint; v_log jsonb;
begin
  begin
    -- ── s0: THE GRANTS ──────────────────────────────────────────────────────
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_txt, 'public.hr_rate_gate(uuid,integer,text)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_hunt_roster(text,integer,integer)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_hunt_roster_sharded(text,integer,integer)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_cron_health_ex(interval,numeric)', 'EXECUTE') then
        raise exception 's0a: % can EXECUTE the gate, a roster or the detector', v_txt; end if;
    end loop;
    if not has_function_privilege('hr_engine', 'public.hr_rate_gate(uuid,integer,text)', 'EXECUTE') then
      raise exception 's0b: the engine lost EXECUTE on hr_rate_gate (every player verb would 500)'; end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick')
       and not has_function_privilege('hr_tick', 'public.hr_hunt_roster(text,integer,integer)', 'EXECUTE') then
      raise exception 's0c: hr_tick lost EXECUTE on hr_hunt_roster'; end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── the probe accounts: v_u[1] has heroes 0 and 1; v_u[2..5] one hero each; v_u[6] is NOT admitted.
    update public.hr_hunt_config set enabled = true where id;
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'server-perf §4 probe')
      on conflict (key) do update set enabled = true;
    for v_i in 1 .. 6 loop
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      if v_i < 6 then
        insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'server-perf §4 probe') on conflict (user_id) do nothing;
      end if;
    end loop;
    for v_i in 1 .. 5 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 's-fixture: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_create_character(1);
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 's-fixture: the second hero was refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    delete from public.hr_rate_counters where user_id = any (v_u);
    v_a := v_u[1]; v_out := v_u[6];

    -- ── s1: ★ THE ACCRUE BUDGET IS THE HERO'S ───────────────────────────────
    for v_i in 1 .. 30 loop
      if not public.hr_rate_gate(v_a, 0, 'accrue') then raise exception 's1-control: hero 0''s call % of 30 was refused', v_i; end if;
    end loop;
    if public.hr_rate_gate(v_a, 0, 'accrue') then raise exception 's1a: hero 0''s 31st accrue call in a minute was allowed (the limit is gone)'; end if;
    v_n := 0;
    for v_i in 1 .. 30 loop
      if public.hr_rate_gate(v_a, 1, 'accrue') then v_n := v_n + 1; end if;
    end loop;
    if v_n <> 30 then
      raise exception 's1b: hero 1 of the same account got % of its 30 accrue calls after hero 0 spent its own: the budget is shared', v_n; end if;
    if public.hr_rate_gate(v_a, 1, 'accrue') then raise exception 's1c: hero 1''s 31st accrue call was allowed'; end if;
    if not exists (select 1 from public.hr_rejections j where j.user_id = v_a and j.slot = 1 and j.code = 'rate_limited' and j.intent = 'accrue') then
      raise exception 's1d: hero 1''s refusal was not journalled under its own slot'; end if;
    -- a slot with no hero spends the ACCOUNT's key: bounded namespace, never 'accrue:5'
    if not public.hr_rate_gate(v_a, 5, 'accrue') then raise exception 's1e-control: an absent slot''s first call was refused'; end if;
    select string_agg(bucket, ',' order by bucket) into v_txt from public.hr_rate_counters where user_id = v_a and bucket like 'accrue%';
    if v_txt is distinct from 'accrue,accrue:0,accrue:1' then
      raise exception 's1e: the account''s accrue counters are [%], expected exactly accrue,accrue:0,accrue:1 (one per existing hero + the account''s)', v_txt; end if;
    -- `activity` stays the ACCOUNT's (unchanged): hero 0 spends it all, hero 1 is refused
    for v_i in 1 .. 30 loop
      if not public.hr_rate_gate(v_a, 0, 'activity') then raise exception 's1f-control: activity call % was refused', v_i; end if;
    end loop;
    if public.hr_rate_gate(v_a, 1, 'activity') then raise exception 's1f: hero 1 got an activity call after hero 0 spent the account''s 30 (activity must stay per account)'; end if;
    if public.hr_rate_gate(v_a, 0, 'no_such_bucket') then raise exception 's1g: an unknown bucket was allowed'; end if;
    if public.hr_rate_gate(v_out, 0, 'accrue') then raise exception 's1h: a NON-ADMITTED account passed the gate while closed'; end if;

    -- ── s2: ★ THE ROSTERS READ character_presence ───────────────────────────
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    if v_g is null then raise exception 's-fixture: no hunting ground in the catalogue'; end if;
    for v_i in 2 .. 5 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' then raise exception 's-fixture: hr_hunt_enter refused: %', v; end if;
      v_sid := v_sid || (v->'session'->>'id')::uuid;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    v_at := date_trunc('second', now() - interval '100 seconds');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at
     where id = any (v_sid);
    update public.hunt_instances i set settled_to = v_at, next_swing_at = v_at
      from public.hunt_sessions h where h.instance_id = i.id and h.id = any (v_sid);
    delete from public.hunt_tick_lease where session_id = any (v_sid);
    delete from public.character_presence where user_id = any (v_u);
    -- v_u[2]: open in a client 10 s ago (WATCHED); v_u[3]: no presence, but the dead column fresh;
    -- v_u[4]: presence 76 s old; v_u[5]: presence from the future.
    insert into public.character_presence (user_id, slot, seen_at) values
      (v_u[2], 0, now() - interval '10 seconds'), (v_u[4], 0, now() - interval '76 seconds'), (v_u[5], 0, now() + interval '5 minutes');
    update public.player_state set last_seen_at = now() where user_id = v_u[3] and slot = 0;
    update public.hr_tick_config set flush_seconds = 90, catchup_windows = greatest(catchup_windows, 4), fold_windows = 4 where id;
    -- hr_hunt_roster: due at 100 s only when watched (1 x 90 s); unwatched needs 4 x 90 s
    select coalesce(array_agg(r.session_id), array[]::uuid[]) into v_got
      from public.hr_hunt_roster('hr-server-perf-probe', 500, 30000) r where r.session_id = any (v_sid);
    if not (v_sid[1] = any (v_got)) then
      raise exception 's2a: hr_hunt_roster did not take a hunt OPEN IN A CLIENT at one flush (presence is not read)'; end if;
    if v_sid[2] = any (v_got) then
      raise exception 's2b: hr_hunt_roster took a hunt with no presence as watched (it still reads player_state.last_seen_at)'; end if;
    if v_sid[3] = any (v_got) then raise exception 's2c: hr_hunt_roster counted presence 76 s old as watched (the window is 75 s)'; end if;
    if v_sid[4] = any (v_got) then raise exception 's2d: hr_hunt_roster counted a presence stamp from the future as watched'; end if;
    delete from public.hunt_tick_lease where session_id = any (v_sid);
    select coalesce(array_agg(r.session_id), array[]::uuid[]) into v_sh
      from public.hr_hunt_roster_sharded('hr-server-perf-probe', 12, 30000) r where r.session_id = any (v_sid);
    if not (v_sid[1] = any (v_sh)) then
      raise exception 's2e: hr_hunt_roster_sharded (the live tick''s roster) did not take a hunt OPEN IN A CLIENT at one flush'; end if;
    if v_sid[2] = any (v_sh) or v_sid[3] = any (v_sh) or v_sid[4] = any (v_sh) then
      raise exception 's2f: hr_hunt_roster_sharded took an unwatched hunt at one flush (no presence / stale / future)'; end if;
    -- control: at fold 1 every one of the four is due, so the arms above measured the presence term, not a fixture
    delete from public.hunt_tick_lease where session_id = any (v_sid);
    update public.hr_tick_config set fold_windows = 1 where id;
    select count(*) into v_n from public.hr_hunt_roster_sharded('hr-server-perf-probe', 12, 30000) r where r.session_id = any (v_sid);
    if v_n <> 4 then raise exception 's2-control: at fold 1 the sharded roster took % of the 4 probe hunts', v_n; end if;

    -- ── s3: ★ THE DETECTOR PRUNES THE RUN HISTORY AND TIMES ITS PHASES ──────
    if to_regclass('cron.job_run_details') is null then
      create table cron.job_run_details (
        jobid bigint, runid bigserial primary key, job_pid integer, database text, username text, command text,
        status text, return_message text, start_time timestamptz, end_time timestamptz);
      insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
      select 1, 'succeeded', '1 row', now() - interval '10 days' + g * interval '1 hour', now() - interval '10 days' + g * interval '1 hour'
        from generate_series(0, 23) g;                                   -- 24 runs, 9-10 days old
      insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
      select 1, 'succeeded', '1 row', now() - g * interval '1 hour', now() - g * interval '1 hour'
        from generate_series(1, 6) g;                                    -- 6 runs inside the window
      v_cron := 'probe';
    else
      v_cron := 'live';
    end if;
    select min(runid) into v_lo from cron.job_run_details;
    select runid into v_hi from cron.job_run_details where start_time >= now() - interval '7 days' order by runid limit 1;
    select count(*) into v_expect from cron.job_run_details where runid >= v_lo and runid < least(v_hi, v_lo + 100000);
    select count(*) into v_fresh from cron.job_run_details where start_time >= now() - interval '7 days';
    if v_cron = 'probe' and v_expect <> 24 then raise exception 's3-fixture: the probe history holds % old runs below the floor, expected 24', v_expect; end if;
    perform public.hr_cron_health_ex(interval '25 hours', 1.0);
    if exists (select 1 from cron.job_run_details where runid >= v_lo and runid < least(v_hi, v_lo + 100000)) then
      raise exception 's3a: runs older than 7 days below the floor survived the detector (the history is not pruned)'; end if;
    select count(*) into v_fresh2 from cron.job_run_details where start_time >= now() - interval '7 days';
    if v_fresh2 < v_fresh then raise exception 's3b: the detector deleted % run(s) from inside the 7-day window', v_fresh - v_fresh2; end if;
    select detail into v_log from public.maintenance_log where job = 'cron-health' order by id desc limit 1;
    if v_log is null or jsonb_typeof(v_log->'phase_ms') is distinct from 'object'
       or not (v_log->'phase_ms' ?& array['a_failed', 'b_stale', 'sample', 'checks', 'retention', 'total']) then
      raise exception 's3c: the run''s maintenance_log row carries no complete phase_ms (got %)', v_log->'phase_ms'; end if;
    if (v_log->>'cron_pruned')::bigint is distinct from v_expect then
      raise exception 's3d: the run logged cron_pruned %, but % runs were below the floor', v_log->>'cron_pruned', v_expect; end if;

    -- ── s4: EVERY BODY LANDED AS ITS POST PIN ──────────────────────────────────
    select string_agg(p.sig || ' landed as ' || coalesce(md5(replace(x.prosrc, chr(13), '')), 'nothing') || ', pinned ' || p.post, '; ')
      into v_txt
      from (values
        ('public.hr_rate_gate(uuid,integer,text)', 'f4184f70ac28bfa2469398d841f2a876'),
        ('public.hr_hunt_roster(text,integer,integer)', '0a125d0d36bda0eb46e4bc8d6652a59a'),
        ('public.hr_hunt_roster_sharded(text,integer,integer)', '23af29bf177e191f8a6e365533ae45e0'),
        ('public.hr_cron_health_ex(interval,numeric)', 'a217db065aa65cf71aea1186f50f82f0')) p(sig, post)
      left join pg_proc x on x.oid = to_regprocedure(p.sig)
     where md5(replace(x.prosrc, chr(13), '')) is distinct from p.post;
    if v_txt is not null then raise exception 's4: a body is not §0''s post pin: %', v_txt; end if;

    raise exception 'hr0101-selfcheck-ok';
  exception when others then
    if sqlerrm <> 'hr0101-selfcheck-ok' then raise; end if;
  end;
  raise notice 'server-perf: self-check passed (cron history %), every probe rolled back', v_cron;
end $$;
