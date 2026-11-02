-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-20-tick-fuse-load.sql — THE WORLD TICK'S COHORT FUSE MEASURES LOAD, NOT HISTORY:
--   ABSENT BENCHES AND GATHERERS KEEP BEING SETTLED PAST 100 HEROES.
--   (lane/c-beta-server, backend-architect, 2026-11-01; the soft beta: 20 accounts x 5 heroes.)
--
-- STATUS: STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §4, one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC. On the EA
-- Security list (it widens a paying tick channel to every player). EDGE: none. CLIENT: none.
-- ORDER: after 2027-02-10-artisan-tick.sql (the artisan cohort row and CHECKs this reads).
--
-- ── WHAT IS TRUE (measured on production, read-only, 2026-11-01 22:20 UTC) ───
--   hr_tick_enrol counts `hr_tick_ownership where channel = c and owned` against max_owned,
--   and nothing ever deletes such a row: a hero who worked a bench once holds a slot for good
--   (live: 8 owned artisan rows, 1 hero on a bench; 4 owned gather rows, 3 gathering, all 3
--   parked at their horizon). So:
--     artisan   100 distinct heroes EVER -> every later hero is never enrolled, whoever left.
--     gather    far lower: the dial is still its 2026-10-10 STAGE 1, permille 100 (only ~10 %
--               of accounts by user hash) and max_owned 20. Live, the one account in the cohort
--               holds all 4 rows; 0d959747:1 was gathering unowned (lag 44 min) as this was read.
--   A hero outside the cohort is not robbed: its time stays owed and its own accrue pays it on
--   return, capped alike. What it loses is the rule "the server keeps it working": the bag and
--   XP stand still, the town shows it working a spent bench (report #68) until its owner returns.
--   Beta, 20 accounts x 5 heroes = 100 heroes (+ the 15 live ones): artisan fills as the last
--   invitee benches; gather serves ~2 accounts of 20 and at most 20 heroes.
--   100 x 4 = 400 heroes: 100 benched heroes ever, then no new one; gather as above.
--   The 100 CHECK was the capacity of the serial, every-fire roster of 2026-10-10 ("raising it
--   is a migration, after the due-only roster and shards land"). Both landed 2026-10-11.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 hr_tick_enrol RESTATED: `v_have` counts the rows the ROSTER COULD SERVE: owned, the hero on
--    this channel NOW, and inside the armed admission (hr_tick_admit, the raw 24 h fence the
--    roster itself reads). A hero who left the channel, or who quit while on it, costs no load
--    and holds no slot. No row is deleted: enrolment stays one journal row per (hero, channel),
--    so hr_tick_enrolment stays bounded by characters and hr_tick_unenrol's rollback key is
--    untouched. That is why rows are not released: release + re-enrol would journal twice per
--    activity switch into a table nothing prunes.
--    Every other term of the body is unchanged (lock, freshness, bucket, operator owned = false
--    exclusion, invariant 7, freshest first, the shape of the answer).
-- §2 hr_tick_cohort_max_owned_ck widens 0..100 -> 0..1000.
-- §3 THE DIAL: gather permille 100 -> 1000 (CLAUDE.md §3.3b: no cohort percentages; every player,
--    as artisan since 10-29), gather max_owned 20 -> 500, artisan max_owned 100 -> 500. Each moves
--    ONLY from the exact value the chain seeded: a dial an operator moved (a kill sets permille 0)
--    is left alone, and a second apply writes nothing.
--
-- ── WHY 500, AND WHAT IT COSTS ───────────────────────────────────────────────
--   2027-02-03-tick-capacity.sql measured an unviewed town visit at ~45-60 ms: one shard's body
--   reaches 4.5 s at ~80 due a fire (~700 unviewed town workers; each is due once a flush, 1/9 a
--   fire) and pg_net's 9 s at ~160 (~1,400). A hero is on one channel at a time, so the worst
--   tick load at the two fuses is 1,000 heroes = ~111 due a fire = ~6 s, inside 9 s. 500 a channel
--   covers 100 accounts x 5 heroes all on one channel. Re-read 2026-11-01 through the shipped runTick
--   on PGlite (fresh heroes, small bags): 44 due, bench or gather: ~65 ms of JS (1.5 ms a visit, far
--   under the edge's 2 s CPU limit) and ~44 ms a visit inside the database (6 statements). NOT measured
--   on production at this load, and not with 100-stack bags. Shards stay 1 (past ~700 unviewed town
--   workers is its own lane, per that file). Past any of it the batch cap (200) and the 30 s lease
--   hold: overload is LAG, visible on vitals' armed lag lines, never a window paid twice or lost.
--     20 x 5 = 100 heroes, all on town work:  ~11 due a fire, ~0.6 s a body.
--     100 x 4 = 400 heroes, all on town work: ~44 due a fire, ~2.5 s a body.
--   THE FUSE IS SOFT FOR A HERO WHO ALREADY HOLDS A ROW: they need no enrolment, so they are served
--   on their return even at the fuse. It stops NEW enrolment, and the load bound is the batch cap.
--   Rows: one gather or craft ledger row a flush per ticked hero, at most 480 per absence (the 12 h
--   horizon). Worst case, all absent heroes at town work 12 h a day: 100 heroes 48k rows/day,
--   400 heroes 192k rows/day (hr_ledger_prune's ceiling is 480k/day; ledger retention 90 days;
--   ~600 bytes a row measured live). Realistically a fraction: heroes hunt.
--   hr_tick_enrol: one more primary-key join over the channel's owned rows a minute.
--
-- ── IDEMPOTENCY / CONCURRENCY ────────────────────────────────────────────────
--   Enrol's advisory lock and `on conflict do nothing` are unchanged. The count reads player_state
--   without a lock: a hero switching activity in that instant moves the count by one for one minute,
--   and the fuse is a load dial, not a money bound. Nothing here can pay: the fence, the version CAS,
--   the window key and the presence horizon are untouched, and gather pays at the engine's price on
--   the same path 0a47ba77's heroes and every bench already use. Re-applying this file is a no-op.
--
-- ── OUTCOMES ─────────────────────────────────────────────────────────────────
--   No rule moves. WHO settles an absent gatherer changes (the tick, one flush at a time, from a
--   fresh enrolment), never the price: the same engine, the same seed ladder, the same 12 h horizon
--   the owner's accrue caps at. tests/world-tick-parity.mjs and tests/artisan-tick.mjs A-PARITY.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
--   No grant, policy or client RPC. Nothing a client sends is read. A player can enter the cohort
--   only by starting town work, which the accrue path pays anyway.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
--   Kill (cohort): select public.hr_tick_unenrol('gather'); (permille 0, journal-enrolled rows gone).
--   Undo the dial: update public.hr_tick_cohort set permille = 100, max_owned = 20 where channel = 'gather';
--     (and max_owned = 100 for artisan). Undo the body: re-apply 2026-10-10-world-tick-gather-widen.sql §3.
--   No value moves either way: the watermark is the handover.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE BODY RESTATED IS THE ONE LIVE ─────────────────────
do $mig$
declare v_enrol text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_enrol from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_enrol(integer)');
  if v_enrol is null or v_enrol not in ('869059c824160b990dc9813be53bea0f', '7cd2e9f8f1635fbb08e536714a77aa38') then
    raise exception 'PRECONDITION: hr_tick_enrol prosrc md5 is %, expected the live 869059c8 (2026-10-10) or this file''s. Re-cut this file.', v_enrol;
  end if;
  if to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)') is null
     or not exists (select 1 from public.hr_tick_cohort where channel = 'gather')
     or not exists (select 1 from public.hr_tick_cohort where channel = 'artisan') then
    raise exception 'PRECONDITION: hr_tick_admit or a cohort row (gather, artisan) is absent';
  end if;
end $mig$;

-- ── §1 hr_tick_enrol: THE FUSE COUNTS WHAT THE ROSTER COULD SERVE ───────────
create or replace function public.hr_tick_enrol(p_limit int default 200)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  v_role   text;
  v_limit  int;
  v_cfg    public.hr_tick_config%rowtype;
  v_c      record;
  v_have   int;
  v_room   int;
  v_n      int;
  v_total  int   := 0;
  v_out    jsonb := '[]'::jsonb;
  v_state  text;
begin
  -- (0) IDENTITY. The PRIMARY control is that no role holds EXECUTE; this
  --     is the secondary one, by name, for every role a request can arrive as.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_tick_enrol: not callable by %', v_role using errcode = '42501';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  -- (1) ONE ENROLLER. A second concurrent run writes nothing; unenrol waits on
  --     the same key, so the max_owned count below is read under it.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_enrol')) then
    return jsonb_build_object('ok', true, 'outcome', 'locked', 'enrolled', 0, 'channels', '[]'::jsonb);
  end if;

  -- (2) THE TICK MUST BE ON. A missing config row reads as off (fail-safe).
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not coalesce(v_cfg.enabled, false) then
    return jsonb_build_object('ok', true, 'outcome', 'disabled', 'enrolled', 0, 'channels', '[]'::jsonb);
  end if;

  for v_c in select * from public.hr_tick_cohort order by channel for update loop
    v_n := 0;
    -- THE FUSE IS LOAD (2027-02-20-tick-fuse-load.sql): owned rows the roster could serve now.
    -- A row outlives its hero's time on the channel (no row is ever released), so counting
    -- rows counted every hero who ever worked here, and quitters forever.
    select count(*)::int into v_have
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
     where o.channel = v_c.channel and o.owned
       and ps.active_kind = o.channel
       and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit';
    if v_c.permille <= 0 or v_c.max_owned <= 0 then
      v_state := 'off';
    -- (3) ARMED ONLY. Enrolment widens a PAYING cohort; it never grows a
    --     shadow cohort, and a disarm (the money kill) stops it by itself.
    elsif not (v_c.channel = any (coalesce(v_cfg.armed_channels, '{}'::text[])))
          or not (v_c.channel = any (coalesce(v_cfg.channels, '{}'::text[]))) then
      v_state := 'disarmed';
    else
      v_room := least(v_c.max_owned - v_have, v_limit);
      if v_room <= 0 then
        v_state := 'full';
      else
        v_state := 'open';
        -- (4) THE COHORT, judged on server state only. Freshest first, so a
        --     fuse that admits k characters admits the k most recent returns.
        with cand as (
          select ps.user_id, ps.slot, ps.accrued_to,
                 public.hr_tick_cohort_bucket(ps.user_id) as bucket
            from public.player_state ps
           where ps.active_kind = v_c.channel
             and ps.accrued_to >  now() - make_interval(secs => v_c.fresh_s)
             and ps.accrued_to <= now()
             and public.hr_tick_cohort_bucket(ps.user_id) < v_c.permille
             -- ANY row, owned or not: an operator's owned = false is an
             -- exclusion, and an existing owned row needs nothing.
             and not exists (select 1 from public.hr_tick_ownership o
                              where o.user_id = ps.user_id and o.slot = ps.slot
                                and o.channel = v_c.channel)
             -- INVARIANT 7: a partied character is the party roster's.
             and not public.hr_partied(ps.user_id, ps.slot)
           order by ps.accrued_to desc, ps.user_id, ps.slot
           limit v_room
        ), ins as (
          insert into public.hr_tick_ownership (user_id, slot, channel, owned, updated_at)
          select c.user_id, c.slot, v_c.channel, true, now() from cand c
          on conflict (user_id, slot, channel) do nothing
          returning user_id, slot
        )
        insert into public.hr_tick_enrolment
          (user_id, slot, channel, event, permille, bucket, accrued_to, reason)
        select c.user_id, c.slot, v_c.channel, 'enrol', v_c.permille, c.bucket, c.accrued_to, 'cohort'
          from cand c join ins i on i.user_id = c.user_id and i.slot = c.slot;
        get diagnostics v_n = row_count;
      end if;
    end if;
    v_total := v_total + v_n;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'channel', v_c.channel, 'permille', v_c.permille, 'max_owned', v_c.max_owned,
      'owned_before', v_have, 'enrolled', v_n, 'state', v_state));
  end loop;

  return jsonb_build_object('ok', true, 'outcome', 'ran', 'enrolled', v_total, 'channels', v_out);
end $$;

comment on function public.hr_tick_enrol(int) is
  '2027-02-20 (tick-fuse-load; 2026-10-10 gather widen). Enrols into tick ownership every '
  'character on an ARMED cohort channel whose user hashes below permille, whose raw '
  'accrued_to is inside fresh_s of now() (it just returned), that has no ownership row for '
  'the channel and is not partied, while fewer than max_owned owned heroes are on the channel '
  'and admitted (the fuse is load: a row of a hero who left, or quit, holds no slot); journals '
  'each in hr_tick_enrolment. Moves no value. One enroller (advisory lock). Executable by NO '
  'role; pg_cron runs it as the owner every minute (hr-tick-enrol).';

revoke execute on function public.hr_tick_enrol(int) from public;
revoke execute on function public.hr_tick_enrol(int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §2 THE CHECK ────────────────────────────────────────────────────────────
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_cohort_max_owned_ck'
                    and conrelid = 'public.hr_tick_cohort'::regclass
                    and pg_get_constraintdef(oid) like '%1000%') then
    alter table public.hr_tick_cohort drop constraint if exists hr_tick_cohort_max_owned_ck;
    alter table public.hr_tick_cohort add constraint hr_tick_cohort_max_owned_ck
      check (max_owned between 0 and 1000);
  end if;
end $mig$;

-- ── §3 THE DIAL: ONLY FROM THE SEEDED VALUES ────────────────────────────────
update public.hr_tick_cohort
   set permille = 1000, max_owned = 500, updated_at = now(),
       note = '2027-02-20-tick-fuse-load.sql: every player (was stage 1, 100 per mille, fused at 20); '
              'fused at 500 heroes on the channel and admitted'
 where channel = 'gather' and permille = 100 and max_owned = 20;
update public.hr_tick_cohort
   set max_owned = 500, updated_at = now(),
       note = '2027-02-20-tick-fuse-load.sql: every player, fused at 500 heroes on the channel and admitted '
              '(was 100 owned rows, which nothing released)'
 where channel = 'artisan' and max_owned = 100;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ──────────────────
do $mig$
declare
  c_gone  constant uuid := '000000c1-0000-4000-8000-0000000fe001';   -- worked the channel once, now idle
  c_quit  constant uuid := '000000c1-0000-4000-8000-0000000fe002';   -- on the channel, 3 days unsettled (quit)
  c_new   constant uuid := '000000c1-0000-4000-8000-0000000fe003';   -- just started: fresh
  c_next  constant uuid := '000000c1-0000-4000-8000-0000000fe004';   -- just started, once the fuse is full
  c_ch    constant text[] := array['gather', 'artisan'];
  v_cfg   public.hr_tick_config%rowtype;
  v_ch    text;
  v_id    text;
  v_coh   public.hr_tick_cohort%rowtype;
  v_have  int;
  v_r     jsonb;
  v_try   int;
  v_led   bigint;
begin
  -- k1 the body and the CHECK are this file's; the dial is every player unless an operator moved it.
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_tick_enrol(integer)'::regprocedure)
     <> '7cd2e9f8f1635fbb08e536714a77aa38' then
    raise exception 'tick-fuse-load §4 k1: the installed body is not this file''s'; end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_cohort_max_owned_ck'
                  and pg_get_constraintdef(oid) like '%1000%') then
    raise exception 'tick-fuse-load §4 k1: the CHECK did not widen'; end if;
  if exists (select 1 from public.hr_tick_cohort where channel = 'gather' and permille = 100 and max_owned = 20)
     or exists (select 1 from public.hr_tick_cohort where channel = 'artisan' and max_owned = 100) then
    raise exception 'tick-fuse-load §4 k1: a seeded dial did not move'; end if;

  -- k2 no client or engine role reaches the door.
  foreach v_id in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_id)
       and has_function_privilege(v_id, 'public.hr_tick_enrol(integer)', 'execute') then
      raise exception 'tick-fuse-load §4 k2: % can execute hr_tick_enrol', v_id; end if;
  end loop;

  select * into v_cfg from public.hr_tick_config where id;
  select count(*) into v_led from public.player_ledger where user_id in (c_gone, c_quit, c_new, c_next);

  foreach v_ch in array c_ch loop
    begin
      -- The channel armed and the tick on for the probe (a fresh replay has gather disarmed).
      update public.hr_tick_config
         set enabled = true,
             channels = (select array_agg(distinct x) from unnest(channels || v_ch) x),
             armed_channels = (select array_agg(distinct x) from unnest(armed_channels || v_ch) x)
       where id;
      select activity_id into v_id from public.hr_activities where kind = v_ch order by activity_id limit 1;
      if v_id is null then raise exception 'tick-fuse-load §4 harness: no % activity', v_ch; end if;
      insert into auth.users (id) values (c_gone), (c_quit), (c_new), (c_next) on conflict (id) do nothing;
      insert into public.player_state (user_id, slot, version, accrued_to, active_kind, active_id, active_since)
      values (c_gone, 0, 1, now() - interval '1 hour',  'idle', null, now() - interval '1 hour'),
             (c_quit, 0, 1, now() - interval '3 days',  v_ch,   v_id, now() - interval '3 days'),
             (c_new,  0, 1, now(),                      v_ch,   v_id, now()),
             (c_next, 0, 1, now(),                      'idle', null, now())
      on conflict (user_id, slot) do update
        set version = 1, accrued_to = excluded.accrued_to, active_kind = excluded.active_kind,
            active_id = excluded.active_id, active_since = excluded.active_since;
      insert into public.hr_tick_ownership (user_id, slot, channel, owned)
      values (c_gone, 0, v_ch, true), (c_quit, 0, v_ch, true)
      on conflict (user_id, slot, channel) do update set owned = true;

      -- The load the roster could serve right now, without the two rows above.
      select count(*)::int into v_have
        from public.hr_tick_ownership o join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
       where o.channel = v_ch and o.owned and ps.active_kind = v_ch and ps.accrued_to > now() - interval '24 hours';

      -- k3 ★ THE TWO ROWS THAT HOLD NO LOAD HOLD NO SLOT: room for exactly the load + one, and the fresh hero
      --    gets it (counted as rows, the two would have left no room). Freshest first: nobody is fresher than now().
      update public.hr_tick_cohort set permille = 1000, max_owned = v_have + 1 where channel = v_ch;
      for v_try in 1..10 loop
        v_r := public.hr_tick_enrol(200);
        exit when v_r->>'outcome' is distinct from 'locked';
        perform pg_sleep(0.2);
      end loop;
      if not exists (select 1 from public.hr_tick_ownership where user_id = c_new and slot = 0 and channel = v_ch and owned)
         or not exists (select 1 from public.hr_tick_enrolment where user_id = c_new and slot = 0 and channel = v_ch and event = 'enrol') then
        raise exception 'tick-fuse-load §4 k3 (%): a fresh hero was refused by rows that hold no load: %', v_ch, v_r; end if;

      -- k4 ★ THE FUSE STILL BITES ON REAL LOAD: the hero just enrolled fills it; the next fresh hero waits.
      update public.player_state set active_kind = v_ch, active_id = v_id, active_since = now(), accrued_to = now()
       where user_id = c_next and slot = 0;
      for v_try in 1..10 loop
        v_r := public.hr_tick_enrol(200);
        exit when v_r->>'outcome' is distinct from 'locked';
        perform pg_sleep(0.2);
      end loop;
      if exists (select 1 from public.hr_tick_ownership where user_id = c_next and slot = 0 and channel = v_ch)
         or (select c->>'state' from jsonb_array_elements(v_r->'channels') c where c->>'channel' = v_ch) is distinct from 'full' then
        raise exception 'tick-fuse-load §4 k4 (%): the fuse did not hold at real load: %', v_ch, v_r; end if;

      -- k5 enrolment paid nothing.
      if (select count(*) from public.player_ledger where user_id in (c_gone, c_quit, c_new, c_next)) <> v_led then
        raise exception 'tick-fuse-load §4 k5 (%): enrolment wrote a ledger row', v_ch; end if;

      raise exception using errcode = 'HRF20', message = 'tick-fuse-load §4 channel done, rolling back';
    exception when sqlstate 'HRF20' then
      null;
    end;
  end loop;

  -- k6 the fixtures are gone; the config and the dial are what §3 left; grant hygiene green.
  if exists (select 1 from auth.users where id in (c_gone, c_quit, c_new, c_next))
     or exists (select 1 from public.hr_tick_enrolment where user_id in (c_gone, c_quit, c_new, c_next)) then
    raise exception 'tick-fuse-load §4 k6: a fixture survived'; end if;
  if (select enabled from public.hr_tick_config where id) is distinct from v_cfg.enabled
     or (select armed_channels from public.hr_tick_config where id) is distinct from v_cfg.armed_channels then
    raise exception 'tick-fuse-load §4 k6: the self-check moved hr_tick_config'; end if;
  perform public.hr_assert_grant_hygiene(true);
end $mig$;
