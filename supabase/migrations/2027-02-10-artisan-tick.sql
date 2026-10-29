-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-10-artisan-tick.sql — THE WORLD TICK SETTLES TOWN BENCH RUNS: A HEARTH
--   (OR FORGE, RANGE, LOOM) RUN WHOSE SUPPLY IS SPENT ENDS ON THE SERVER WITHIN A
--   FLUSH, WHETHER OR NOT ITS OWNER'S BROWSER IS OPEN.
--   (lane/c-playtest-open, backend-architect, 2026-10-29; report #68, the server
--   half of lane/a-hearth-refuel-truth.)
--
-- STATUS: STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §4, one file via
-- the Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- On the EA Security review list (it arms a paying tick channel).
-- ⚠ EDGE MOVES: hr-accrue gains its artisan driver (supabase/functions/hr-accrue/
--   tick-artisan.js, tick.js CHANNELS, tick-shadow.js forwards the recipe inputs).
--   DEPLOY ORDER: edge FIRST, then this file. Applied before the deploy the old
--   edge skips every artisan roster row `channel_not_driven` (pays nothing,
--   journals nothing: fail-safe), so the order is a preference, not a hazard.
-- ORDER: after 2027-02-08-unsourced-level-curve.generated.sql (needs only
--   2026-10-10-world-tick-gather-widen.sql's dial and the 2026-09-21 fence).
--
-- ── THE ROOT CAUSE (measured) ────────────────────────────────────────────────
--   The engine ends a bench run only when a SETTLE finds its input gone. The
--   world tick drove `gather` alone: hr_tick_config.channels = {combat,gather},
--   and tick.js declared `artisan` UNDRIVEN ("no artisan settler exists"). So
--   nothing on the server settled an unviewed bench: its player_state pointer
--   stayed `artisan`, and the town (hr_town_view: the body on its fuel stand,
--   `work` true) told every other player it was still "Fueling" until the
--   owner's own client asked (src/session/town-poll.js settleSpentBench; with
--   the browser closed, until the owner came back). The fence, the roster, the
--   lease, the admission, the horizon and hr_apply were ALREADY channel-generic
--   (c_payable = {combat,gather,artisan} in hr_tick_roster and hr_tick_settle;
--   hr_tick_ownership admits `artisan`): the missing pieces were a driver, the
--   channel in the config and a cohort row.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 hr_tick_cohort_channel_ck and hr_tick_enrolment_channel_ck admit
--    {gather, artisan} (were {gather}). Every other cohort CHECK is unchanged
--    (max_owned <= 100 stays the per-channel load fuse: tick-capacity's gather
--    body carries ~80 due a fire, far above a playtest).
-- §2 THE ARTISAN COHORT: ('artisan', permille 1000 = every player, max_owned
--    100, fresh_s 600), on conflict do nothing (a re-apply never moves a dial an
--    operator changed). No percentage rollout (CLAUDE.md §3.3b).
-- §3 THE CONFIG: `artisan` joins hr_tick_config.channels and .armed_channels
--    (armed directly: the same engine call the owner's accrue makes; nothing to
--    shadow-measure against). Idempotent array union; armed stays <@ channels.
-- From then on, per minute hr_tick_enrol enrols every FRESH artisan character
-- (accrued_to inside 600 s: it just started or settled a bench), journalled in
-- hr_tick_enrolment; per fire hr_tick_roster leases the due ones (mark at least
-- one flush old; partied characters excluded); the edge settles one window
-- [mark, mark + flush] as ONE engine call (tick-artisan.js) through
-- hr_tick_settle (lease, version and watermark CAS, armed / 24 h / cap /
-- horizon fences) into hr_apply. When the supply is spent the engine's delta
-- carries `activity: idle`; hr_apply writes it; hr_town_note_move notes it and
-- the town lets the body go.
--
-- ── IDEMPOTENCY / CONCURRENCY ────────────────────────────────────────────────
--   Unchanged in kind from gather. A window's intent key is (user, slot,
--   window, version); the fence locks player_state FOR UPDATE, refuses a stale
--   version and a window starting before the watermark (window_already_settled),
--   so a replayed or overlapping window pays nothing. The owner's own accrue
--   and the tick race only through that CAS: the loser is refused and re-reads.
--   A switch (set_activity) moves active_kind; the fence refuses `channel_moved`.
--
-- ── JOURNAL (CLAUDE.md §6) ───────────────────────────────────────────────────
--   One `craft` player_ledger row per settled window (flush 90 s), an AGGREGATE
--   (ms, ticks, made, burnt, recipe, skill, stopped, out_of, from, to, src:'tick'),
--   never per action. hr_tick_enrolment: one row per enrolment, never per fire.
--
-- ── COST (100x players: ~2,400 heroes) ───────────────────────────────────────
--   Rows: <= 960 craft rows/day (86,400 s / 90 s) per CONTINUOUSLY running bench,
--   viewed or not; bench runs are supply-bound (minutes to hours), so an
--   ESTIMATE of ~10 % of heroes on a 4 h bench a day is ~38k rows/day (8 % of
--   hr_ledger_prune's 480k/day ceiling). Owned rows: at most one per (hero,
--   channel), capped at 100 by the fuse. Edge: one engine call per window over at
--   most one flush of actions (140 bones in tests/artisan-tick.mjs A-RUNNING); the
--   gather body it rides costs what tick-capacity measured (~45-60 ms a visit).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
--   No grant, policy or client RPC changes. The new paying path is the tick's,
--   reachable only behind the tick bearer (hr-accrue tick.js) and only for a
--   character the server's roster leased; every number is the engine's on
--   server state; hr_apply re-validates as for any caller. A player can only
--   make the tick settle a bench by running one, which the accrue path settles
--   anyway: the change is WHO settles, never the price.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
--   Kill (money and load, one statement):
--     update public.hr_tick_config set armed_channels = array_remove(armed_channels, 'artisan'),
--                                      channels       = array_remove(channels, 'artisan') where id;
--     (the roster stops leasing artisan heroes; enrolment stops by itself, it needs the channel
--      armed. Disarming ALONE would leave the fence shadowing every window into hr_tick_shadow.)
--   Kill (cohort): select public.hr_tick_unenrol('artisan');
--   Full undo: both, then delete the cohort row (the widened CHECKs are inert).
--   Nothing pays twice and no owed time is lost either way: the watermark is the handover, and
--   every unsettled bench is paid by its owner's next accrue, as before this file.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_tick_config') is null or to_regclass('public.hr_tick_cohort') is null
     or to_regclass('public.hr_tick_enrolment') is null or to_regclass('public.hr_tick_ownership') is null then
    raise exception 'PRECONDITION: the world tick tables (2026-10-10-world-tick-gather-widen.sql) are absent';
  end if;
  if to_regprocedure('public.hr_tick_enrol(integer)') is null
     or to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)') is null
     or to_regprocedure('public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)') is null then
    raise exception 'PRECONDITION: hr_tick_enrol / hr_tick_roster / hr_tick_settle absent';
  end if;
  -- the fence and the roster must already treat artisan as payable (this file adds no SQL arithmetic)
  foreach v_src in array array[
      (select prosrc from pg_proc where oid = 'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)'::regprocedure),
      (select prosrc from pg_proc where oid = 'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)'::regprocedure)] loop
    if position($q$c_payable$q$ in v_src) = 0 or position($q$'artisan'$q$ in v_src) = 0 then
      raise exception 'PRECONDITION: hr_tick_settle / hr_tick_roster no longer lists artisan as payable — re-measure';
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_ownership_channel_ck'
                    and pg_get_constraintdef(oid) like '%artisan%') then
    raise exception 'PRECONDITION: hr_tick_ownership does not admit the artisan channel';
  end if;
  if not exists (select 1 from public.hr_activities where kind = 'artisan' and activity_id = 'fuel_bones') then
    raise exception 'PRECONDITION: the Hearth fuel bench (hr_activities artisan:fuel_bones) is not in the catalogue';
  end if;
end $mig$;

-- ── §1 THE DIAL AND ITS JOURNAL ADMIT ARTISAN ───────────────────────────────
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_cohort_channel_ck'
                    and conrelid = 'public.hr_tick_cohort'::regclass
                    and pg_get_constraintdef(oid) like '%artisan%') then
    alter table public.hr_tick_cohort drop constraint if exists hr_tick_cohort_channel_ck;
    alter table public.hr_tick_cohort add constraint hr_tick_cohort_channel_ck
      check (channel in ('gather', 'artisan'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_enrolment_channel_ck'
                    and conrelid = 'public.hr_tick_enrolment'::regclass
                    and pg_get_constraintdef(oid) like '%artisan%') then
    alter table public.hr_tick_enrolment drop constraint if exists hr_tick_enrolment_channel_ck;
    alter table public.hr_tick_enrolment add constraint hr_tick_enrolment_channel_ck
      check (channel in ('gather', 'artisan'));
  end if;
end $mig$;

-- ── §2 THE ARTISAN COHORT: EVERY PLAYER ──────────────────────────────────────
insert into public.hr_tick_cohort (channel, permille, max_owned, fresh_s, note)
values ('artisan', 1000, 100, 600,
        '2027-02-10-artisan-tick.sql: every player (1000 per mille), fused at 100 owned artisan characters; '
        'a town bench run is settled by the world tick, browser open or not (report #68)')
on conflict (channel) do nothing;

-- ── §3 THE CHANNEL, DRIVEN AND ARMED ─────────────────────────────────────────
update public.hr_tick_config
   set channels       = case when 'artisan' = any (channels) then channels
                             else array_append(channels, 'artisan') end,
       armed_channels = case when 'artisan' = any (armed_channels) then armed_channels
                             else array_append(armed_channels, 'artisan') end,
       updated_at     = now()
 where id
   and not ('artisan' = any (channels) and 'artisan' = any (armed_channels));

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ──────────────────
do $mig$
declare
  v_u      constant uuid := '000000c1-0000-0000-0000-0000000000e5';   -- a hero fuelling the Hearth, browser closed
  c_holder constant text := 'artisan-tick-selfcheck';
  v_cfg    public.hr_tick_config%rowtype;
  v_enrol  jsonb; v_r jsonb; v_r2 jsonb; v_n int; v_try int; v_ver bigint; v_from timestamptz; v_to timestamptz;
  v_intent uuid := '000000c1-0000-0000-0000-0000000000e6';
  v_kind   text; v_led int; v_led2 int; r text;
begin
  -- k1 the channel is driven and armed, the dial admits everyone.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not ('artisan' = any (v_cfg.channels)) or not ('artisan' = any (v_cfg.armed_channels)) then
    raise exception 'artisan-tick §4 k1: artisan is not in hr_tick_config.channels and armed_channels'; end if;
  if not exists (select 1 from public.hr_tick_cohort where channel = 'artisan' and permille = 1000 and max_owned >= 1) then
    raise exception 'artisan-tick §4 k1: the artisan cohort row is absent or not every player'; end if;

  -- k2 no client or engine role reaches the doors (the primary control is the grant).
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) and (
         has_function_privilege(r, 'public.hr_tick_enrol(integer)', 'execute')
      or has_function_privilege(r, 'public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)', 'execute')
      or has_function_privilege(r, 'public.hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)', 'execute')) then
      raise exception 'artisan-tick §4 k2: % can execute a world-tick door', r; end if;
  end loop;

  -- k3 BEHAVIOUR: a spent Hearth run, owner's browser closed, is enrolled, leased, settled to idle ONCE.
  begin
    if not coalesce(v_cfg.enabled, false) then
      update public.hr_tick_config set enabled = true where id;   -- a disabled tick (a fresh replay) still proves the path
    end if;
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, version, accrued_to, active_kind, active_id, active_since)
    values (v_u, 0, 1, now() - interval '3 minutes', 'artisan', 'fuel_bones', now() - interval '3 minutes')
    on conflict (user_id, slot) do update
      set version = 1, accrued_to = now() - interval '3 minutes', active_kind = 'artisan',
          active_id = 'fuel_bones', active_since = now() - interval '3 minutes';
    if to_regclass('public.hr_return_anchor') is not null then
      insert into public.hr_return_anchor (user_id, slot, real_return_at)
      values (v_u, 0, now() - interval '3 minutes')
      on conflict (user_id, slot) do update set real_return_at = excluded.real_return_at;
    end if;

    -- (the minute cron may hold the enroller's try-lock for a few ms: ask again rather than read 'locked' as a defect)
    for v_try in 1..10 loop
      v_enrol := public.hr_tick_enrol(200);
      exit when v_enrol->>'outcome' is distinct from 'locked';
      perform pg_sleep(0.2);
    end loop;
    if not exists (select 1 from public.hr_tick_ownership where user_id = v_u and slot = 0 and channel = 'artisan' and owned)
       or not exists (select 1 from public.hr_tick_enrolment where user_id = v_u and slot = 0 and channel = 'artisan'
                       and event = 'enrol' and reason = 'cohort') then
      raise exception 'artisan-tick §4 k3: a fresh artisan hero was not enrolled and journalled (%)', v_enrol; end if;
    if exists (select 1 from public.player_ledger where user_id = v_u) then
      raise exception 'artisan-tick §4 k3: enrolment paid something'; end if;

    select count(*) into v_n
      from public.hr_tick_roster(array['artisan'], 0, 200, c_holder, 30000, null, null, null) t
     where t.user_id = v_u and t.slot = 0 and t.active_kind = 'artisan';
    if v_n <> 1 then raise exception 'artisan-tick §4 k3: the roster did not lease the due artisan hero (% rows)', v_n; end if;

    select version, accrued_to into v_ver, v_from from public.player_state where user_id = v_u and slot = 0;
    v_to := v_from + interval '90 seconds';
    -- the spent run's window: no input left, so the engine's delta is the stop alone (the value path is the
    -- engine's and is proven end to end through the real edge by tests/artisan-tick.mjs). As the edge calls
    -- the fence: role hr_engine, no JWT (hr_apply refuses any other caller naming a user).
    set local role hr_engine;
    v_r := public.hr_tick_settle(c_holder, v_u, 0, 'artisan', v_ver, v_from, v_to, v_intent,
      jsonb_build_object(
        'accrued_to', v_to,
        'activity', jsonb_build_object('kind', 'idle', 'id', null),
        'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue',
          'meta', jsonb_build_object('ms', 90000, 'ticks', 0, 'capped', false, 'made', 0, 'burnt', 0,
                                     'recipe', 'fuel_bones', 'skill', 'inner_flame', 'stopped', 'out_of',
                                     'out_of', 'bones', 'from', v_from, 'to', v_to, 'src', 'tick'))),
      null);
    reset role;
    if not coalesce((v_r->>'ok')::boolean, false) or v_r->>'mode' is distinct from 'armed' then
      raise exception 'artisan-tick §4 k3: the fence refused the artisan settle: %', v_r; end if;
    select active_kind into v_kind from public.player_state where user_id = v_u and slot = 0;
    if v_kind is distinct from 'idle' then
      raise exception 'artisan-tick §4 k3: the spent run is still %', v_kind; end if;
    select count(*) into v_led from public.player_ledger where user_id = v_u and slot = 0 and kind = 'craft';
    if v_led <> 1 then raise exception 'artisan-tick §4 k3: % craft ledger rows for one window, expected 1', v_led; end if;

    -- k4 the same window again (a replayed POST, a second driver) pays nothing.
    set local role hr_engine;
    v_r2 := public.hr_tick_settle(c_holder, v_u, 0, 'artisan', v_ver, v_from, v_to, v_intent,
      jsonb_build_object('accrued_to', v_to, 'activity', jsonb_build_object('kind', 'idle', 'id', null),
        'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue', 'meta', jsonb_build_object('src', 'tick'))),
      null);
    reset role;
    select count(*) into v_led2 from public.player_ledger where user_id = v_u and slot = 0 and kind = 'craft';
    if coalesce((v_r2->>'ok')::boolean, false) or v_led2 <> v_led then
      raise exception 'artisan-tick §4 k4: a replayed artisan window was accepted (%; ledger % -> %)', v_r2, v_led, v_led2; end if;

    raise exception using errcode = 'HRA10', message = 'artisan-tick §4 complete — rolling back';
  exception when sqlstate 'HRA10' then
    null;
  end;

  -- k5 the fixtures are gone; the config is what §3 left; grant hygiene green.
  if exists (select 1 from auth.users where id = v_u)
     or exists (select 1 from public.hr_tick_enrolment where user_id = v_u) then
    raise exception 'artisan-tick §4 k5: a fixture survived'; end if;
  if (select enabled from public.hr_tick_config where id) is distinct from v_cfg.enabled then
    raise exception 'artisan-tick §4 k5: the self-check moved hr_tick_config.enabled'; end if;
  perform public.hr_assert_grant_hygiene(true);
end $mig$;
