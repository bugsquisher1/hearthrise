-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-world-tick-gather-widen.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: the Coordinator applies after a
-- Security GO, via tools/apply-migration.mjs, one file. DB-ONLY: no edge half,
-- no client half. Applies after 2026-10-09-frame-self-echo.sql in the chain
-- (it touches none of that file's objects); against prod it needs only the
-- bodies §0 pins, which are the live ones measured 2026-10-08 02:30 UTC.
--
-- WHAT IT IS: STAGE 1 OF WIDENING ARMED GATHER from the operator-owned M2
-- cohort (QA slot 2) to every player, per the design note appended to
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md ("Gather widen").
-- Stage 1 = 10 % of gatherers by a stable hash of user_id, hard-fused at 20
-- owned gather characters in total.
--
-- THE THREE QUESTIONS IT ANSWERS
--   1. WHO BECOMES OWNED, AND WHEN. A character is ENROLLED (an
--      hr_tick_ownership row, owned = true) by the server, never by an
--      operator INSERT and never by a client, when ALL of these hold at the
--      same instant: gather is ARMED and the tick ENABLED; its active_kind is
--      gather; hr_tick_cohort_bucket(user_id) < the channel's permille; it has
--      NO ownership row for gather at all (so an operator's owned = false row
--      is an exclusion this file never overrides); it is not partied; the
--      channel is under its max_owned fuse; and its RAW accrued_to is inside
--      fresh_s (600 s) of now().
--   2. P3b AT SCALE. That last clause IS the per-character fresh watermark.
--      For a character nobody owns, accrued_to moves only on its own real
--      return (a client accrue settle or a set-activity switch, server-clamped
--      to now() inside hr_apply). So "accrued_to within 10 min" means "this
--      player just came back", and the enrolment cron (every minute) enrols
--      them within a minute of it. The tick's first window then starts at most
--      ~11 min back: no multi-hour boundary catch-up, at any cohort size. 8c
--      (armed settle needs accrued_to >= max(now, window_to) - offline cap)
--      stays the money bound for every catch-up that happens anyway (tick
--      downtime); freshness is the load and V2-legibility bound.
--   3. ONE STALLED GATHERER UNDER THE AGGREGATE FLOOR. hr_tick_stall_status
--      gains a per-character LAG judge per armed channel (§5): stuck = raw
--      lag > 15 min AND no tick payment for that character in 15 min. New
--      keys lag_judged / lag_stalled / armed[].lag; every existing key keeps
--      its meaning byte-for-byte (the arm file reads them).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_tick_cohort (channel pk CHECK = 'gather', permille 0..1000,
--      max_owned 0..100, fresh_s 60..3600). The ROLLOUT DIAL. Seeded ONCE
--      (on conflict do nothing) at stage 1: gather 100 ‰, 20, 600 s.
--      max_owned <= 100 is a CHECK on purpose: it is the measured edge
--      capacity of today's serial, every-fire roster (design note §Load), and
--      moving past it is a migration with its own GO, never an UPDATE.
--    hr_tick_enrolment — APPEND-ONLY journal: one row per enrol / unenrol
--      (user, slot, channel, server time, permille, bucket, the accrued_to
--      that qualified it, reason). It is also the ROLLBACK KEY: unenrol
--      removes exactly the rows whose latest journal event is 'enrol', so an
--      operator-owned row (QA slot 2) is never touched.
--    Both: RLS enabled AND forced, no policy, every privilege revoked from
--      anon/authenticated/service_role/hr_engine/hr_tick.
-- §2 hr_tick_cohort_bucket(uuid) -> int 0..999: the first 28 bits of
--      md5(user_id::text) mod 1000. IMMUTABLE and stable across Postgres
--      versions (hashtext is not), per USER so a player's slots move together,
--      and monotone in permille: widening only ever ADDS characters.
-- §3 hr_tick_enrol(p_limit int default 200) -> jsonb   owner-only, pg_cron
--      {ok, outcome, channels:[{channel, permille, max_owned, owned_before,
--       enrolled, state: off|disarmed|full|open}]}
-- §4 hr_tick_unenrol(p_channel text) -> jsonb   owner-only (the KILL's second
--      half; 2026-10-10-world-tick-gather-unwiden.sql is its one-line caller)
--      sets permille = 0, deletes the journal-enrolled ownership rows of the
--      channel, journals one 'unenrol' row each. {ok, channel, unenrolled}
-- §5 hr_tick_stall_status restated: live (5bad87a1) + the lag judge.
-- §6 grants (revoke first; no role is granted anything new).
-- §7 pg_cron 'hr-tick-enrol', every minute.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   · Enrol vs enrol: pg_try_advisory_xact_lock(hashtext('hr_tick_enrol'));
--     a second concurrent run answers outcome 'locked' and writes nothing.
--     Unenrol takes the SAME lock, waiting (a kill must land), so enrol and
--     unenrol serialise and the max_owned count is read under it.
--   · Enrol vs roster/settle: enrol only INSERTs ownership rows for keys that
--     have none, `on conflict do nothing`; the roster claims existing rows
--     `for update skip locked`. A new row is rostered on the next fire. No
--     money moves at enrolment: player_state is not read for update, not
--     written, and no ledger row is written (self-check e1).
--   · Enrol vs a player's own settle: none needed. The watermark is the
--     handover (WORLD_TICK_DESIGN §15b.1): whoever settles next starts at
--     accrued_to, inside hr_apply's per-character lock, and the version CAS
--     refuses the loser. Enrolment cannot pay twice however it races.
--   · Unenrol vs an in-flight settle: the DELETE waits on the roster's short
--     row lock; a settle that lost its row is refused (no lease) — the safe
--     direction; the time stays owed and the player's next accrue pays it.
--   · Idempotency: enrol is a no-op on a second run (the key exists); unenrol
--     is a no-op on a second run (no row's latest event is 'enrol').
--
-- ── SECURITY SURFACE ────────────────────────────────────────────────────────
--   No client or engine grant, policy, RPC or edge change. Three new
--   functions, executable by NO role (revoke-first, asserted in §8); two new
--   tables no role can touch. Nothing a client sends is read: the cohort is
--   the server's hash of user_id, the clock is now(), freshness is the
--   server-clamped accrued_to. A player can opt INTO the cohort only by being
--   in the hash bucket and playing — the same act that makes them fresh; they
--   cannot choose their bucket. What enrolment changes for a player is WHO
--   settles their away time (tick vs accrue-on-return), never the price: the
--   tick prices with the same engine, seed ladder and 8c cap. The one
--   economic delta is the accepted residual from the armed-cap review — a
--   tick-owned character has no per-absence cap — and it is now population-
--   relevant: Game Designer ruling B1 in the design note is a stage-1 gate.
--
-- ── COST (measured 2026-10-08 on prod; projections in the design note) ──────
--   Enrol: one scan of player_state filtered on active_kind per minute, with
--   an md5 per gather row: ~25 rows today, ~2.5k at 100x; sub-millisecond to
--   a few ms. Journal: one row per enrolment (bounded by characters), never
--   per tick. Lag judge: one pass over the armed channel's owned rows plus one
--   index probe each, only when hr_tick_stall_status is called (by hand / V6).
--
-- REVERSIBILITY
--   Kill (money): 2026-10-07-world-tick-disarm.sql, unchanged — and enrolment
--   stops by itself, because it requires the channel ARMED.
--   Kill (cohort/load): 2026-10-10-world-tick-gather-unwiden.sql =
--   `select public.hr_tick_unenrol('gather')`: back to exactly the operator
--   cohort; every unenrolled character is ACCRUE-OWNED from wherever the tick
--   left accrued_to (no money moves).
--   Full undo: unwiden, then `select cron.unschedule('hr-tick-enrol')`, drop
--   the three functions and both tables, and re-apply
--   2026-10-08-world-tick-party-fences.sql §1 (the stall body without §5's
--   lag judge). Re-applying this file is a no-op (§0 accepts its own body,
--   the seed row is on conflict do nothing).
--
-- KNOWN LIMITATIONS
--   · The cohort is re-evaluated only on a real return: a gatherer in the
--     bucket who never comes back is never enrolled (and keeps
--     accrue-on-return, capped, exactly as today).
--   · A character that leaves gather keeps its ownership row; the roster
--     ignores it (channel <> active_kind) until it gathers again.
--   · max_owned counts every owned gather row, operator rows included.
--   · c_lag (15 min) is a constant. Above ~1,800 owned characters the
--     current roster cannot keep up at all (one flush per visit) and the lag
--     judge will say so; that is a design limit, named in the note.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE LIVE BODIES THIS FILE REASONS ABOUT ───────────────
-- The stall body is RESTATED (live or this file's own). The roster, hr_partied
-- and hr_tick_admit are NOT restated; they are pinned because enrolment's
-- correctness is an argument about them: the roster serves exactly
-- (owned, channel = active_kind, admitted, unpartied), and enrolment must not
-- create a row the roster would serve to a partied character.
do $$
declare
  v_stall   text;
  v_roster  text;
  v_partied text;
  v_admit   text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_stall from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_stall_status(timestamp with time zone,integer,integer)');
  select md5(replace(p.prosrc, chr(13), '')) into v_roster from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_roster(text[],integer,integer,text,integer,timestamp with time zone,uuid,integer)');
  select md5(replace(p.prosrc, chr(13), '')) into v_partied from pg_proc p
   where p.oid = to_regprocedure('public.hr_partied(uuid,integer)');
  select md5(replace(p.prosrc, chr(13), '')) into v_admit from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_admit(boolean,timestamp with time zone,timestamp with time zone)');
  if v_stall is null or v_stall not in ('5bad87a19c5b14b1a5f39e559d251435', '6d9141779f2dc9988784491e2d1f1033') then
    raise exception 'PRECONDITION: hr_tick_stall_status prosrc md5 is %, expected the live 5bad87a1 '
                    '(party-fences) or this file''s 6d9141779f2dc9988784491e2d1f1033. Re-cut this file against the live body.', v_stall;
  end if;
  if v_roster is distinct from 'a7cf559ec53b6a840dcd8bbbb9f1095f'
     or v_partied is distinct from '3ae4b07cb060fcf0815eeaecca6dad98'
     or v_admit is distinct from '32691c54cdfe837c155f7b333e0ca085' then
    raise exception 'PRECONDITION: the roster / hr_partied / hr_tick_admit bodies are not the live ones (roster %, partied %, admit %). '
                    'Enrolment''s argument is about those bodies; re-derive it.', v_roster, v_partied, v_admit;
  end if;
  if to_regclass('public.hr_tick_ownership') is null
     or to_regclass('public.hr_tick_config') is null
     or to_regclass('public.player_ledger') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_tick_ownership, hr_tick_config, player_ledger, hr_cron_ensure or hr_assert_grant_hygiene is absent.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_tick_ownership'::regclass
                    and contype = 'p') then
    raise exception 'PRECONDITION: hr_tick_ownership has no primary key — enrolment''s on conflict needs (user_id, slot, channel)';
  end if;
end $$;

-- ── §1 THE DIAL AND THE JOURNAL ─────────────────────────────────────────────
create table if not exists public.hr_tick_cohort (
  channel    text        primary key,
  permille   int         not null default 0,
  max_owned  int         not null default 0,
  fresh_s    int         not null default 600,
  note       text,
  updated_at timestamptz not null default now(),
  -- GATHER ONLY. Combat (M4) and artisan widen under their own GO; a row for
  -- them here would enrol characters into a channel nobody reviewed for it.
  constraint hr_tick_cohort_channel_ck   check (channel in ('gather')),
  constraint hr_tick_cohort_permille_ck  check (permille between 0 and 1000),
  -- THE LOAD FUSE: today's measured ceiling (design note §Load). Raising it is
  -- a migration with its own GO, after the due-only roster and shards land.
  constraint hr_tick_cohort_max_owned_ck check (max_owned between 0 and 100),
  constraint hr_tick_cohort_fresh_ck     check (fresh_s between 60 and 3600)
);
alter table public.hr_tick_cohort enable row level security;
alter table public.hr_tick_cohort force row level security;
comment on table public.hr_tick_cohort is
  '2026-10-10 (world-tick gather widen, STAGE 1). THE ROLLOUT DIAL for automatic '
  'tick ownership, per channel (gather only, CHECK). hr_tick_enrol (owner-only, '
  'pg_cron hr-tick-enrol, every minute) enrols a character whose user_id hashes '
  'below permille, whose raw accrued_to is inside fresh_s (a real return), while '
  'the channel is armed and fewer than max_owned rows are owned. RLS forced, no '
  'policy, no privilege for any client or engine role; changed only by migration.';

insert into public.hr_tick_cohort (channel, permille, max_owned, fresh_s, note)
values ('gather', 100, 20, 600,
        'stage 1 (2026-10-10 gather widen): 10 % by user hash, fused at 20 owned gather characters')
on conflict (channel) do nothing;

create table if not exists public.hr_tick_enrolment (
  id         bigint      generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid        not null,
  slot       int         not null,
  channel    text        not null,
  event      text        not null,
  permille   int,
  bucket     int,
  accrued_to timestamptz,
  reason     text        not null,
  constraint hr_tick_enrolment_channel_ck check (channel in ('gather')),
  constraint hr_tick_enrolment_event_ck   check (event in ('enrol', 'unenrol')),
  constraint hr_tick_enrolment_bucket_ck  check (bucket is null or bucket between 0 and 999),
  constraint hr_tick_enrolment_shape_ck   check (
       (event = 'enrol'   and reason = 'cohort'   and permille is not null and bucket is not null and accrued_to is not null)
    or (event = 'unenrol' and reason = 'rollback'))
);
create index if not exists hr_tick_enrolment_key_idx
  on public.hr_tick_enrolment (user_id, slot, channel, id desc);
alter table public.hr_tick_enrolment enable row level security;
alter table public.hr_tick_enrolment force row level security;
comment on table public.hr_tick_enrolment is
  '2026-10-10 (world-tick gather widen). APPEND-ONLY journal of every automatic '
  'tick enrolment and every rollback unenrolment: user, slot, channel, server '
  'time, the permille and hash bucket that admitted it and the accrued_to that '
  'made it fresh. Also the ROLLBACK KEY: hr_tick_unenrol removes exactly the '
  'ownership rows whose latest event here is enrol, so operator rows survive. '
  'Written only by hr_tick_enrol / hr_tick_unenrol (SECURITY DEFINER, owner-only); '
  'RLS forced, no policy, no privilege for any client or engine role; never '
  'updated or deleted. One row per enrolment, never per tick.';

-- ── §2 THE BUCKET ───────────────────────────────────────────────────────────
create or replace function public.hr_tick_cohort_bucket(p_user uuid)
 returns int
 language sql
 immutable strict
 set search_path to 'pg_catalog'
as $$
  -- 28 bits (7 hex digits) so the cast is always non-negative; md5 because it
  -- is stable across Postgres versions, which hashtext is not.
  select (('x' || substr(md5(p_user::text), 1, 7))::bit(28)::int % 1000)
$$;
comment on function public.hr_tick_cohort_bucket(uuid) is
  '2026-10-10 (world-tick gather widen). The tick cohort hash bucket 0..999 of a '
  'user: first 28 bits of md5(user_id::text) mod 1000. Per user, immutable, and '
  'monotone under widening (bucket < permille). Executable by no role.';

-- ── §3 hr_tick_enrol — THE SERVER ENROLS A RETURNING GATHERER ───────────────
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
  -- (0) IDENTITY. The PRIMARY control is that no role holds EXECUTE (§6); this
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
    select count(*)::int into v_have from public.hr_tick_ownership o
     where o.channel = v_c.channel and o.owned;
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
  '2026-10-10 (world-tick gather widen, stage 1). Enrols into tick ownership every '
  'character on an ARMED cohort channel whose user hashes below permille, whose raw '
  'accrued_to is inside fresh_s of now() (it just returned), that has no ownership '
  'row for the channel and is not partied, up to max_owned owned rows; journals each '
  'in hr_tick_enrolment. Moves no value. One enroller (advisory lock). Executable by '
  'NO role; pg_cron runs it as the owner every minute (hr-tick-enrol).';

-- ── §4 hr_tick_unenrol — THE COHORT HALF OF THE KILL ────────────────────────
create or replace function public.hr_tick_unenrol(p_channel text)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_catalog'
as $$
declare
  v_role text;
  v_n    int;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick') then
    raise exception 'hr_tick_unenrol: not callable by %', v_role using errcode = '42501';
  end if;
  if not exists (select 1 from public.hr_tick_cohort where channel = p_channel) then
    raise exception 'hr_tick_unenrol: "%" is not a cohort channel', p_channel using errcode = '22023';
  end if;
  -- A KILL MUST LAND: wait for an enroller in flight rather than skip.
  perform pg_advisory_xact_lock(hashtext('hr_tick_enrol'));

  -- (1) THE DIAL TO ZERO FIRST, so nothing re-enrols behind the delete.
  update public.hr_tick_cohort set permille = 0, updated_at = now()
   where channel = p_channel;

  -- (2) EXACTLY THE JOURNAL-ENROLLED ROWS: latest event for the key = enrol.
  --     An operator row has no journal row and is never touched.
  with gone as (
    delete from public.hr_tick_ownership o
     where o.channel = p_channel
       and (select e.event from public.hr_tick_enrolment e
             where e.user_id = o.user_id and e.slot = o.slot and e.channel = o.channel
             order by e.id desc limit 1) = 'enrol'
    returning o.user_id, o.slot
  )
  insert into public.hr_tick_enrolment (user_id, slot, channel, event, reason)
  select g.user_id, g.slot, p_channel, 'unenrol', 'rollback' from gone g;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'channel', p_channel, 'unenrolled', v_n);
end $$;

comment on function public.hr_tick_unenrol(text) is
  '2026-10-10 (world-tick gather widen). The cohort half of the kill: permille -> 0, '
  'then deletes every ownership row of the channel whose latest hr_tick_enrolment '
  'event is enrol (operator rows survive) and journals one unenrol row each. Each '
  'such character is ACCRUE-OWNED again from its own accrued_to; no value moves. '
  'Waits on the enroller lock. Executable by NO role.';

-- ── §5 hr_tick_stall_status — live (party-fences) + the per-character LAG judge
create or replace function public.hr_tick_stall_status(p_now timestamp with time zone DEFAULT now(), p_hours integer DEFAULT 2, p_min_rows_per_hour integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_cfg      public.hr_tick_config%rowtype;
  v_hours    int := least(greatest(coalesce(p_hours, 2), 1), 48);
  v_min      int := greatest(coalesce(p_min_rows_per_hour, 30), 1);
  v_buckets  jsonb;
  v_stalled  boolean;
  -- THE CHANNELS UNDER WATCH (2026-10-06, SEC_WORLD_TICK_CHANNEL_ARM_2026-10-05
  -- C2): every channel the tick owns that is NOT armed. Its windows land in
  -- hr_tick_shadow; an armed channel's land in player_ledger and are not
  -- counted here.
  v_armed    text[];
  v_unarmed  text[];
  v_sentinel boolean;
  v_judged   boolean;
  -- THE ARMED CHANNELS, JUDGED TOO (2026-10-07, SEC_GATHER_ARM_RUNBOOK F2).
  v_ch       text;
  v_kind     text;
  v_asent    boolean;
  v_ajudged  boolean;
  v_astall   boolean;
  v_abuckets jsonb;
  v_arm      jsonb   := '[]'::jsonb;
  v_any_aj   boolean := false;
  v_any_as   boolean := false;
  -- THE PER-CHARACTER LAG JUDGE (2026-10-10, gather widen; the residual
  -- "the aggregate floor hides one stalled gatherer once the cohort is above
  -- 1", SEC_GATHER_ARM_RUNBOOK armed-cap review).
  c_lag      constant interval := interval '15 minutes';
  v_lag      jsonb;
  v_lj       boolean;
  v_ls       boolean;
  v_any_lj   boolean := false;
  v_any_ls   boolean := false;
begin
  select * into v_cfg from public.hr_tick_config where id;
  v_armed   := coalesce(v_cfg.armed_channels, '{}'::text[]);
  v_unarmed := coalesce(array(select ch from unnest(v_cfg.channels) ch
                               where not (ch = any (v_armed)) order by ch), '{}'::text[]);

  -- WHO SHOULD HAVE BEEN WRITING SHADOW ROWS. With NOTHING armed every
  -- rostered fire rostered a shadow channel, so `rostered_fires` is that
  -- evidence by itself (the rule exactly as 2026-09-28 stated it). Once a
  -- channel is armed, a rostered fire may have rostered ONLY armed
  -- characters, and the fire log does not say which: an empty combat channel
  -- would read as a combat stall while gather pays. The evidence is then a
  -- SENTINEL — a character the roster admits in shadow on an unarmed channel
  -- (owned, on that channel, not partied, shadow-admitted by hr_tick_admit),
  -- whose activity has been unchanged since before the judged window opened
  -- (`active_since`, stamped only on a restart). No sentinel = no verdict,
  -- never a stall. Read only while something is armed; the scan is the
  -- cron admission counter's own cohort, bounded by `owned`.
  v_sentinel := cardinality(v_armed) = 0 or exists (
    select 1
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
     where o.owned
       and o.channel = ps.active_kind
       and o.channel = any (v_unarmed)
       and ps.active_since <= p_now - make_interval(hours => v_hours)
       and not public.hr_partied(o.user_id, o.slot)
       and public.hr_tick_admit(false, ps.accrued_to,
             greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))) = 'admit');

  v_judged := coalesce(v_cfg.enabled, false) and cardinality(v_unarmed) > 0 and v_sentinel;

  with b as (
    select g as i,
           p_now - make_interval(hours => g + 1) as lo,
           p_now - make_interval(hours => g)     as hi
      from generate_series(0, v_hours - 1) g
  )
  select jsonb_agg(jsonb_build_object(
           'from', b.lo, 'to', b.hi,
           'rostered_fires', (select count(*) from public.hr_tick_cron_log l
                               where l.at >= b.lo and l.at < b.hi
                                 and l.outcome = 'posted' and l.rostered >= 1),
           -- UNARMED channels' rows only. With nothing armed that is every row,
           -- as before; with gather armed it is combat's (and any other
           -- unarmed channel's), so the combat shadow is still watched.
           'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                               where s.at >= b.lo and s.at < b.hi
                                 and not (s.channel = any (v_armed))),
           'edge', (select jsonb_build_object(
                             'refused', coalesce(sum((l.detail#>>'{edge,refused}')::int), 0),
                             'shadowed', coalesce(sum((l.detail#>>'{edge,shadowed}')::int), 0),
                             'top_reason', (select l2.detail#>>'{edge,top_reason}'
                                              from public.hr_tick_cron_log l2
                                             where l2.at >= b.lo and l2.at < b.hi
                                               and l2.detail#>>'{edge,top_reason}' is not null
                                             group by 1 order by count(*) desc, 1 limit 1))
                      from public.hr_tick_cron_log l
                     where l.at >= b.lo and l.at < b.hi and l.detail ? 'edge'))
           order by b.i)
    into v_buckets
    from b;

  -- JUDGED PER UNARMED CHANNEL SET (2026-10-06, C2). The 2026-10-06
  -- channel-arm file stopped judging the moment ANY channel armed, so the
  -- combat shadow M3/M4 measure would go unwatched while gather pays.
  v_stalled := v_judged
    and not exists (select 1 from jsonb_array_elements(v_buckets) e
                     where (e->>'rostered_fires')::int < 1
                        or (e->>'shadow_rows')::int >= v_min);

  -- ── THE ARMED CHANNELS (2026-10-07, SEC_GATHER_ARM_RUNBOOK_2026-10-06 F2).
  --    Everything above judges UNARMED channels only, so the moment gather
  --    arms, a gather stall is silent. The same two-hour invariant, per ARMED
  --    channel: STALLED when EVERY bucket had >= 1 rostered fire AND fewer
  --    than v_min windows of that channel, a window being EITHER an armed
  --    tick payment (player_ledger, meta.src = 'tick', the channel's ledger
  --    kind) OR a shadow row of that channel. Counting both keeps the arm
  --    boundary honest: the hours before an arm are shadow rows, the hours
  --    after are ledger rows, and a disarm reads the same way back; either
  --    table alone would call a healthy transition a stall.
  --    THE SENTINEL is the unarmed rule's, on the ARMED fence: owned, on this
  --    channel, unpartied, its activity unchanged since before the judged
  --    window opened, raw `accrued_to` inside 24 h. A stalled tick leaves
  --    `accrued_to` aging, so a 2 h stall keeps its sentinel. No sentinel =
  --    no verdict, never a stall. A character with a CLIENT settle of this
  --    kind in the window is not a sentinel (F2b, 2026-10-08: online).
  --    LEDGER KIND: an artisan window journals as 'craft'
  --    (player_ledger_kind_check); every other channel journals as itself.
  --    COST: player_ledger's primary key is (at, id), so each bucket is a
  --    one-hour index range; at 100x (200 armed gatherers at 40 windows/h)
  --    that is ~16k rows read per call.
  --    NOT FOLDED INTO `judged`: that key keeps meaning "the unarmed shadow
  --    is watched" (the arm file's S2 reads it). `stalled`/`ok` are the
  --    union of both verdicts; `shadow_stalled` is the old verdict, verbatim.
  foreach v_ch in array coalesce(array(select distinct a from unnest(v_armed) a
                                        where a = any (coalesce(v_cfg.channels, '{}'::text[]))
                                        order by a), '{}'::text[]) loop
    v_kind := case v_ch when 'artisan' then 'craft' else v_ch end;
    v_asent := exists (
      select 1
        from public.hr_tick_ownership o
        join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
       where o.owned
         and o.channel = v_ch
         and ps.active_kind = v_ch
         and ps.active_since <= p_now - make_interval(hours => v_hours)
         and not public.hr_partied(o.user_id, o.slot)
         and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit'
         -- ★ F2b (2026-10-08): NOT A SENTINEL WHILE ONLINE. A non-tick ledger
         --   row of this channel's kind inside the judged window is a client
         --   accrue settle: the player was online, and an online client
         --   settles before the tick's 90 s build-up, so zero tick windows is
         --   the tick working, not a stall (10-05: 250 such rows, 0 windows,
         --   ~2 h of false armed_stalled). A real stall leaves no client row
         --   either, so its sentinel stays. player_ledger_user_idx range.
         and not exists (
               select 1 from public.player_ledger pl
                where pl.user_id = o.user_id and pl.slot = o.slot
                  and pl.at >= p_now - make_interval(hours => v_hours)
                  and pl.at < p_now
                  and pl.kind = v_kind
                  and pl.meta->>'src' is distinct from 'tick'));
    v_ajudged := coalesce(v_cfg.enabled, false) and v_asent;
    with b as (
      select g as i,
             p_now - make_interval(hours => g + 1) as lo,
             p_now - make_interval(hours => g)     as hi
        from generate_series(0, v_hours - 1) g
    )
    select jsonb_agg(jsonb_build_object(
             'from', b.lo, 'to', b.hi,
             'rostered_fires', (select count(*) from public.hr_tick_cron_log l
                                 where l.at >= b.lo and l.at < b.hi
                                   and l.outcome = 'posted' and l.rostered >= 1),
             'tick_rows',      (select count(*) from public.player_ledger pl
                                 where pl.at >= b.lo and pl.at < b.hi
                                   and pl.kind = v_kind and pl.meta->>'src' = 'tick'),
             'shadow_rows',    (select count(*) from public.hr_tick_shadow s
                                 where s.at >= b.lo and s.at < b.hi and s.channel = v_ch))
             order by b.i)
      into v_abuckets
      from b;
    v_astall := v_ajudged
      and not exists (select 1 from jsonb_array_elements(v_abuckets) e
                       where (e->>'rostered_fires')::int < 1
                          or (e->>'tick_rows')::int + (e->>'shadow_rows')::int >= v_min);
    -- ── ★ PER-CHARACTER LAG (2026-10-10, gather widen). The bucket verdict
    --    above is an AGGREGATE floor: with two or more armed characters, one
    --    of them can stop being paid while the others keep the hour above
    --    v_min, and nothing says so. This judges every armed character on its
    --    own: owned, on this channel, unpartied (the roster's own cohort,
    --    minus admission, so a character the tick has stopped admitting is
    --    COUNTED rather than hidden). LAG = p_now - raw accrued_to, which is
    --    where that character's next window starts in armed mode. STUCK =
    --    lag > c_lag AND no tick payment of this channel's ledger kind for it
    --    inside the last c_lag. The second half is what keeps a legitimate
    --    catch-up (after an arm, or after tick downtime, at one flush per
    --    fire) from reading as a stall: a catching-up character is far behind
    --    but MOVING. An online character settles itself (client accrue moves
    --    accrued_to), so its lag stays small and F2b needs no special case
    --    here. c_lag is 10 flush windows at the 90 s flush.
    --    NOT FOLDED INTO ok / stalled / armed_stalled: the arm file's S2 reads
    --    those at the arm instant, when every boundary character is far behind
    --    and not yet moving (the same reasoning that kept armed_judged out of
    --    judged). Read lag_stalled (runbook V6).
    --    COST: one pass over the channel's owned rows plus one
    --    player_ledger_user_idx probe each.
    with j as (
      select o.user_id, o.slot,
             greatest(0::numeric, extract(epoch from (p_now - ps.accrued_to))) as lag_s,
             exists (select 1 from public.player_ledger pl
                      where pl.user_id = o.user_id and pl.slot = o.slot
                        and pl.at > p_now - c_lag and pl.at <= p_now
                        and pl.kind = v_kind
                        and pl.meta->>'src' = 'tick') as moving
        from public.hr_tick_ownership o
        join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
       where o.owned
         and o.channel = v_ch
         and ps.active_kind = v_ch
         and not public.hr_partied(o.user_id, o.slot))
    select jsonb_build_object(
             'threshold_s', extract(epoch from c_lag)::int,
             'characters',  count(*),
             'stuck',       count(*) filter (where j.lag_s > extract(epoch from c_lag) and not j.moving),
             'worst_s',     coalesce(floor(max(j.lag_s)), 0)::bigint,
             'p50_s',       coalesce(floor(percentile_cont(0.5) within group (order by j.lag_s)), 0)::bigint,
             'p95_s',       coalesce(floor(percentile_cont(0.95) within group (order by j.lag_s)), 0)::bigint,
             'stuck_sample', coalesce((select jsonb_agg(jsonb_build_object(
                                         'user_id', x.user_id, 'slot', x.slot, 'lag_s', floor(x.lag_s)::bigint)
                                         order by x.lag_s desc, x.user_id, x.slot)
                                        from (select * from j j2
                                               where j2.lag_s > extract(epoch from c_lag) and not j2.moving
                                               order by j2.lag_s desc, j2.user_id, j2.slot
                                               limit 10) x), '[]'::jsonb))
      into v_lag
      from j;
    v_lj := coalesce(v_cfg.enabled, false) and (v_lag->>'characters')::int > 0;
    v_ls := v_lj and (v_lag->>'stuck')::int > 0;
    v_lag := v_lag || jsonb_build_object('judged', v_lj, 'stalled', v_ls);
    v_arm := v_arm || jsonb_build_array(jsonb_build_object(
      'channel', v_ch, 'ledger_kind', v_kind, 'sentinel', v_asent,
      'judged', v_ajudged, 'stalled', v_astall, 'buckets', v_abuckets,
      'lag', v_lag));
    v_any_aj := v_any_aj or v_ajudged;
    v_any_as := v_any_as or v_astall;
    v_any_lj := v_any_lj or v_lj;
    v_any_ls := v_any_ls or v_ls;
  end loop;

  return jsonb_build_object(
    'ok', not (v_stalled or v_any_as),
    'stalled', v_stalled or v_any_as,
    'judged', v_judged,
    'shadow_stalled', v_stalled,
    'armed_judged', v_any_aj,
    'armed_stalled', v_any_as,
    'armed', v_arm,
    'lag_judged', v_any_lj,
    'lag_stalled', v_any_ls,
    'mode', case when not coalesce(v_cfg.enabled, false) then 'off'
                 when cardinality(v_armed) = 0 then 'shadow'
                 when cardinality(v_unarmed) = 0 then 'armed' else 'partial' end,
    'armed_channels', to_jsonb(v_armed),
    'watched_channels', to_jsonb(v_unarmed),
    'sentinel', v_sentinel,
    'hours', v_hours, 'min_rows_per_hour', v_min, 'at', p_now,
    'buckets', v_buckets);
end $$;


-- ── §6 GRANTS — revoke from PUBLIC first; NO role is granted anything new ────
revoke all on table public.hr_tick_cohort from public;
revoke all on table public.hr_tick_cohort from anon, authenticated, service_role, hr_engine, hr_tick;
revoke all on table public.hr_tick_enrolment from public;
revoke all on table public.hr_tick_enrolment from anon, authenticated, service_role, hr_engine, hr_tick;

revoke execute on function public.hr_tick_cohort_bucket(uuid) from public;
revoke execute on function public.hr_tick_cohort_bucket(uuid)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_enrol(int) from public;
revoke execute on function public.hr_tick_enrol(int)
  from anon, authenticated, service_role, hr_engine, hr_tick;
revoke execute on function public.hr_tick_unenrol(text) from public;
revoke execute on function public.hr_tick_unenrol(text)
  from anon, authenticated, service_role, hr_engine, hr_tick;
-- Restated EXACTLY as the chain left it (owner only).
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int) from public;
revoke execute on function public.hr_tick_stall_status(timestamptz, int, int)
  from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §7 THE SCHEDULE ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent — schedule by hand: '
                 'select cron.schedule(''hr-tick-enrol'', ''* * * * *'', '
                 '''select public.hr_tick_enrol(200)'')';
  else
    perform public.hr_cron_ensure('hr-tick-enrol', '* * * * *',
      'select public.hr_tick_enrol(200)');
  end if;
end $$;

-- ── §8 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- Gather ARMED unless stated; the cohort dial set to 500 ‰ for the fixtures
-- (their buckets are fixed by their uuids: A 229, O 849, S 212, C 422, X 373,
-- B1 175, B2 380, D 115, Y 110, Z 243, P 139). Every function is called as the
-- owner, exactly as pg_cron calls it.
--   k0  the installed bodies are this file's (md5); nothing in the schema
--       UPDATEs or DELETEs hr_tick_enrolment; the bucket is 0..999 and stable
--   e1  ★ a fresh in-bucket gatherer (A) is enrolled — owned, journalled with
--       its bucket, permille and accrued_to — and NOTHING is paid: no ledger
--       row, no player_state field moved for any fixture
--   e2  ★ NOT enrolled: out of bucket (O), stale return (S, 20 min > 600 s),
--       not gathering (C), an operator owned = false row (X: not flipped),
--       partied (P)
--   e3  idempotent: a second run enrols no fixture and journals nothing new
--   e4  ★ the max_owned fuse: room for one, two fresh candidates -> exactly
--       the freshest-then-lowest key (B1), never B2; owned count == max_owned
--   e5  ★ disarmed -> state 'disarmed', D not enrolled; tick disabled ->
--       outcome 'disabled'; permille 0 -> 'off'
--   l1  ★ the LAG judge: operator-owned Y 30 min behind with no tick row is
--       STUCK (lag_stalled, in stuck_sample); Z 30 min behind but paid by the
--       tick a moment ago is MOVING (not stuck); A (fresh) is not stuck; the
--       pre-existing keys are all still present; a disarmed channel is not
--       lag-judged
--   u1  ★ unenrol: A and B1 (journal-enrolled) are removed and journalled
--       'unenrol'; X, Y, Z (operator rows) survive untouched; permille -> 0;
--       a following enrol enrols nothing ('off'); a second unenrol removes 0
--   s1  identity: hr_engine and hr_tick are refused by name (42501) on enrol
--       and unenrol
--   kg  EXECUTE held by no role on the three functions; both tables: no
--       privilege for any role, RLS enabled AND forced, no policy;
--       stall_status still owner-only; hygiene STRICT
--   kc  the cron job is scheduled every minute with its command (if pg_cron)
--   kr  the config switches this block flipped are restored and read back
-- Every probe row is rolled back by the sentinel exception.
do $$
declare
  v_a   uuid := '00000000-0000-4000-8000-0000000e6001';
  v_o   uuid := '00000000-0000-4000-8000-0000000e6002';
  v_s   uuid := '00000000-0000-4000-8000-0000000e6005';
  v_c   uuid := '00000000-0000-4000-8000-0000000e6008';
  v_x   uuid := '00000000-0000-4000-8000-0000000e6009';
  v_b1  uuid := '00000000-0000-4000-8000-0000000e600a';
  v_b2  uuid := '00000000-0000-4000-8000-0000000e600b';
  v_d   uuid := '00000000-0000-4000-8000-0000000e600f';
  v_y   uuid := '00000000-0000-4000-8000-0000000e6014';
  v_z   uuid := '00000000-0000-4000-8000-0000000e6016';
  v_p   uuid := '00000000-0000-4000-8000-0000000e601c';
  v_all uuid[];
  v_gact  text;
  v_cact  text;
  v_party uuid;
  v_r     jsonb;
  v_l0    bigint;
  v_j0    bigint;
  v_have  int;
  v_snap  jsonb;
  v_ch    jsonb;
  v_lag   jsonb;
  v_cfg_en boolean; v_cfg_ch text[]; v_cfg_ar text[];
  v_en     boolean; v_chs    text[]; v_ar     text[];
  v_coh   public.hr_tick_cohort%rowtype;
  v_caught boolean;
  r       record;
begin
  begin
    -- ── k0
    if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_stall_status(timestamptz,int,int)'::regprocedure)
         <> '6d9141779f2dc9988784491e2d1f1033'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_enrol(int)'::regprocedure)
         <> '869059c824160b990dc9813be53bea0f'
       or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
         where p.oid = 'public.hr_tick_unenrol(text)'::regprocedure)
         <> '25fdc06a2871925d51bd4d4ad8d761bd' then
      raise exception 'k0: the installed bodies are not the ones this file states';
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and (p.prosrc ~* 'update\s+public\.hr_tick_enrolment'
                    or p.prosrc ~* 'delete\s+from\s+public\.hr_tick_enrolment')) then
      raise exception 'k0b: a function body UPDATEs or DELETEs hr_tick_enrolment — it is append-only';
    end if;
    if public.hr_tick_cohort_bucket(v_a) <> 229 or public.hr_tick_cohort_bucket(v_o) <> 849
       or public.hr_tick_cohort_bucket('ffffffff-ffff-4fff-bfff-ffffffffffff') not between 0 and 999 then
      raise exception 'k0c: hr_tick_cohort_bucket is not the md5-28-bit mod 1000 this file states';
    end if;

    -- ── fixture
    select enabled, channels, armed_channels into v_cfg_en, v_cfg_ch, v_cfg_ar
      from public.hr_tick_config where id;
    if not found then raise exception 'k-fixture: hr_tick_config has no row'; end if;
    select * into v_coh from public.hr_tick_cohort where channel = 'gather';
    if not found then raise exception 'k-fixture: hr_tick_cohort has no gather row'; end if;
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather'] where id;
    select count(*)::int into v_have from public.hr_tick_ownership where channel = 'gather' and owned;
    update public.hr_tick_cohort set permille = 500, max_owned = least(100, v_have + 50), fresh_s = 600
     where channel = 'gather';
    select activity_id into v_gact from public.hr_activities where kind = 'gather' order by activity_id limit 1;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_gact is null or v_cact is null then raise exception 'k-fixture: hr_activities lacks a gather or combat row'; end if;
    v_all := array[v_a, v_o, v_s, v_c, v_x, v_b1, v_b2, v_d, v_y, v_z, v_p];
    insert into auth.users (id) select unnest(v_all) on conflict do nothing;
    -- now() is the transaction's clock: the fixtures are the freshest
    -- returns in the database, so they sort first under any fuse.
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    select u, 0, 0, 0, 10, 10, 1, m, k, case k when 'combat' then v_cact else v_gact end,
           now() - interval '3 hours'
      from (values (v_a, now(), 'gather'), (v_o, now(), 'gather'),
                   (v_s, now() - interval '20 minutes', 'gather'), (v_c, now(), 'combat'),
                   (v_x, now(), 'gather'), (v_p, now(), 'gather'),
                   (v_y, now() - interval '30 minutes', 'gather'),
                   (v_z, now() - interval '30 minutes', 'gather')) t(u, m, k);
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    values (v_x, 0, 'gather', false), (v_y, 0, 'gather', true), (v_z, 0, 'gather', true);
    -- P is partied: a party with a live hunt.
    insert into public.party (leader_user, leader_slot) values (v_p, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
      values (v_party, v_p, 0, 'leader', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, now());
    if not public.hr_partied(v_p, 0) then raise exception 'k-fixture: P is not partied'; end if;

    select count(*) into v_l0 from public.player_ledger where user_id = any (v_all);
    select jsonb_agg(to_jsonb(ps) order by ps.user_id) into v_snap
      from public.player_state ps where ps.user_id = any (v_all);

    -- ── e1 / e2
    v_r := public.hr_tick_enrol(200);
    select e into v_ch from jsonb_array_elements(v_r->'channels') e where e->>'channel' = 'gather';
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_ch->>'state' <> 'open'
       or not exists (select 1 from public.hr_tick_ownership
                       where user_id = v_a and slot = 0 and channel = 'gather' and owned)
       or not exists (select 1 from public.hr_tick_enrolment
                       where user_id = v_a and slot = 0 and channel = 'gather' and event = 'enrol'
                         and reason = 'cohort' and permille = 500 and bucket = 229
                         and accrued_to = now() and at = now()) then
      raise exception 'e1: the fresh in-bucket gatherer A was not enrolled and journalled: %', v_r;
    end if;
    if (select count(*) from public.player_ledger where user_id = any (v_all)) <> v_l0
       or (select jsonb_agg(to_jsonb(ps) order by ps.user_id) from public.player_state ps
            where ps.user_id = any (v_all)) is distinct from v_snap then
      raise exception 'e1b: enrolment wrote a ledger row or moved a player_state field — it pays nothing';
    end if;
    if exists (select 1 from public.hr_tick_ownership
                where channel = 'gather' and user_id in (v_o, v_s, v_c, v_p))
       or exists (select 1 from public.hr_tick_enrolment where user_id in (v_o, v_s, v_c, v_p, v_x))
       or (select owned from public.hr_tick_ownership where user_id = v_x and slot = 0 and channel = 'gather')
          is distinct from false then
      raise exception 'e2: a character outside the cohort (out of bucket, stale, combat, partied) was enrolled, '
                      'or the operator''s owned = false row was flipped';
    end if;

    -- ── e3 idempotent (fixtures)
    select count(*) into v_j0 from public.hr_tick_enrolment where user_id = any (v_all);
    v_r := public.hr_tick_enrol(200);
    if (select count(*) from public.hr_tick_enrolment where user_id = any (v_all)) <> v_j0 then
      raise exception 'e3: a second run journalled a fixture again: %', v_r;
    end if;

    -- ── e4 the fuse: room for exactly one
    insert into auth.users (id) values (v_b1), (v_b2) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_b1, 0, 0, 0, 10, 10, 1, now(), 'gather', v_gact, now() - interval '3 hours'),
           (v_b2, 0, 0, 0, 10, 10, 1, now(), 'gather', v_gact, now() - interval '3 hours');
    select count(*)::int into v_have from public.hr_tick_ownership where channel = 'gather' and owned;
    update public.hr_tick_cohort set max_owned = v_have + 1 where channel = 'gather';
    v_r := public.hr_tick_enrol(200);
    if not exists (select 1 from public.hr_tick_ownership where user_id = v_b1 and channel = 'gather' and owned)
       or exists (select 1 from public.hr_tick_ownership where user_id = v_b2)
       or (select count(*) from public.hr_tick_ownership where channel = 'gather' and owned) <> v_have + 1 then
      raise exception 'e4: the max_owned fuse did not admit exactly the freshest-then-lowest key (B1): %', v_r;
    end if;
    v_r := public.hr_tick_enrol(200);
    select e into v_ch from jsonb_array_elements(v_r->'channels') e where e->>'channel' = 'gather';
    if v_ch->>'state' <> 'full' or exists (select 1 from public.hr_tick_ownership where user_id = v_b2) then
      raise exception 'e4b: a full channel enrolled again: %', v_r;
    end if;
    update public.hr_tick_cohort set max_owned = least(100, v_have + 50) where channel = 'gather';

    -- ── e5 disarmed / disabled / off
    insert into auth.users (id) values (v_d) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (v_d, 0, 0, 0, 10, 10, 1, now(), 'gather', v_gact, now() - interval '3 hours');
    update public.hr_tick_config set armed_channels = '{}' where id;
    v_r := public.hr_tick_enrol(200);
    select e into v_ch from jsonb_array_elements(v_r->'channels') e where e->>'channel' = 'gather';
    if v_ch->>'state' <> 'disarmed' or exists (select 1 from public.hr_tick_ownership where user_id = v_d) then
      raise exception 'e5a: a DISARMED channel enrolled: %', v_r;
    end if;
    -- l1's last arm: a disarmed channel is not lag-judged.
    v_r := public.hr_tick_stall_status(now(), 2, 30);
    if coalesce((v_r->>'lag_judged')::boolean, true) is not false then
      raise exception 'l1e: a DISARMED gather channel was lag-judged: %', v_r;
    end if;
    update public.hr_tick_config set enabled = false, armed_channels = array['gather'] where id;
    v_r := public.hr_tick_enrol(200);
    if v_r->>'outcome' <> 'disabled' or exists (select 1 from public.hr_tick_ownership where user_id = v_d) then
      raise exception 'e5b: a DISABLED tick enrolled: %', v_r;
    end if;
    update public.hr_tick_config set enabled = true where id;
    update public.hr_tick_cohort set permille = 0 where channel = 'gather';
    v_r := public.hr_tick_enrol(200);
    select e into v_ch from jsonb_array_elements(v_r->'channels') e where e->>'channel' = 'gather';
    if v_ch->>'state' <> 'off' or exists (select 1 from public.hr_tick_ownership where user_id = v_d) then
      raise exception 'e5c: permille 0 enrolled: %', v_r;
    end if;
    update public.hr_tick_cohort set permille = 500 where channel = 'gather';
    -- D stays out of the cohort for the rest of the block (it is fresh and in
    -- bucket; the next enrol would take it, and u1 counts by name anyway).

    -- ── l1 the LAG judge
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_z, 0, 'gather', 'accrue', jsonb_build_object('src', 'tick'));
    v_r := public.hr_tick_stall_status(now(), 2, 30);
    select e->'lag' into v_lag from jsonb_array_elements(v_r->'armed') e where e->>'channel' = 'gather';
    if v_lag is null
       or coalesce((v_r->>'lag_judged')::boolean, false) is not true
       or coalesce((v_r->>'lag_stalled')::boolean, false) is not true
       or coalesce((v_lag->>'stalled')::boolean, false) is not true
       or (v_lag->>'stuck')::int < 1
       or (v_lag->>'threshold_s')::int <> 900
       or (v_lag->>'worst_s')::bigint < 1800
       or not ((v_lag->>'stuck')::int > 10
               or exists (select 1 from jsonb_array_elements(v_lag->'stuck_sample') x
                           where (x->>'user_id')::uuid = v_y and (x->>'lag_s')::bigint >= 1800)) then
      raise exception 'l1a: operator-owned Y, 30 min behind with no tick row, is not STUCK: %', v_lag;
    end if;
    if exists (select 1 from jsonb_array_elements(v_lag->'stuck_sample') x
                where (x->>'user_id')::uuid in (v_z, v_a)) then
      raise exception 'l1b: a MOVING (Z) or fresh (A) character was called stuck: %', v_lag;
    end if;
    if not (v_r ?& array['ok', 'stalled', 'judged', 'shadow_stalled', 'armed_judged', 'armed_stalled',
                         'armed', 'mode', 'armed_channels', 'watched_channels', 'sentinel', 'hours',
                         'min_rows_per_hour', 'at', 'buckets'])
       or not exists (select 1 from jsonb_array_elements(v_r->'armed') e
                       where e ?& array['channel', 'ledger_kind', 'sentinel', 'judged', 'stalled', 'buckets']) then
      raise exception 'l1c: a pre-existing hr_tick_stall_status key is gone: %', v_r;
    end if;

    -- ── u1 unenrol
    v_r := public.hr_tick_unenrol('gather');
    if coalesce((v_r->>'ok')::boolean, false) is not true or (v_r->>'unenrolled')::int < 2
       or exists (select 1 from public.hr_tick_ownership where user_id in (v_a, v_b1))
       or (select count(*) from public.hr_tick_enrolment
            where user_id in (v_a, v_b1) and event = 'unenrol' and reason = 'rollback' and at = now()) <> 2
       or (select count(*) from public.hr_tick_ownership where user_id in (v_x, v_y, v_z) and channel = 'gather') <> 3
       or (select owned from public.hr_tick_ownership where user_id = v_y and channel = 'gather') is not true
       or (select permille from public.hr_tick_cohort where channel = 'gather') <> 0 then
      raise exception 'u1a: unenrol did not remove exactly the journal-enrolled rows (A, B1) and keep the operator rows: %', v_r;
    end if;
    v_r := public.hr_tick_enrol(200);
    select e into v_ch from jsonb_array_elements(v_r->'channels') e where e->>'channel' = 'gather';
    if v_ch->>'state' <> 'off' or exists (select 1 from public.hr_tick_ownership where user_id in (v_a, v_b1, v_d)) then
      raise exception 'u1b: an enrol after the unenrol re-enrolled: %', v_r;
    end if;
    v_r := public.hr_tick_unenrol('gather');
    if (v_r->>'unenrolled')::int <> 0 then
      raise exception 'u1c: a second unenrol removed rows again: %', v_r;
    end if;
    v_caught := false;
    begin perform public.hr_tick_unenrol('combat');
    exception when invalid_parameter_value then v_caught := true; end;
    if not v_caught then raise exception 'u1d: unenrol accepted a channel with no cohort row'; end if;

    -- ── s1 identity, by name
    for r in select rolname from pg_roles where rolname in ('hr_engine', 'hr_tick') loop
      v_caught := false;
      begin
        execute format('set local role %I', r.rolname);
        perform public.hr_tick_enrol(1);
      exception when insufficient_privilege then v_caught := true;
      end;
      reset role;
      if not v_caught then raise exception 's1: % could run hr_tick_enrol', r.rolname; end if;
      v_caught := false;
      begin
        execute format('set local role %I', r.rolname);
        perform public.hr_tick_unenrol('gather');
      exception when insufficient_privilege then v_caught := true;
      end;
      reset role;
      if not v_caught then raise exception 's1: % could run hr_tick_unenrol', r.rolname; end if;
    end loop;

    -- ── kg
    for r in select c.role, f.fn
               from (values ('public'), ('anon'), ('authenticated'), ('service_role'),
                            ('hr_engine'), ('hr_tick')) c(role)
              cross join (values ('public.hr_tick_cohort_bucket(uuid)'), ('public.hr_tick_enrol(int)'),
                                 ('public.hr_tick_unenrol(text)'),
                                 ('public.hr_tick_stall_status(timestamptz,int,int)')) f(fn) loop
      if r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role) then
        if has_function_privilege(r.role, r.fn, 'execute') then
          raise exception 'kg: % holds EXECUTE on %', r.role, r.fn;
        end if;
      end if;
    end loop;
    if not (select prosecdef from pg_proc where oid = 'public.hr_tick_enrol(int)'::regprocedure)
       or not (select prosecdef from pg_proc where oid = 'public.hr_tick_unenrol(text)'::regprocedure) then
      raise exception 'kg: enrol / unenrol must be SECURITY DEFINER';
    end if;
    for r in select t.rel, x.rolname
               from (values ('public.hr_tick_cohort'), ('public.hr_tick_enrolment')) t(rel)
              cross join (select rolname from pg_roles
                           where rolname in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick')) x loop
      if has_table_privilege(r.rolname, r.rel, 'select,insert,update,delete,truncate') then
        raise exception 'kg: % holds a privilege on %', r.rolname, r.rel;
      end if;
    end loop;
    if exists (select 1 from pg_class c
                where c.oid in ('public.hr_tick_cohort'::regclass, 'public.hr_tick_enrolment'::regclass)
                  and not (c.relrowsecurity and c.relforcerowsecurity))
       or exists (select 1 from pg_policy
                   where polrelid in ('public.hr_tick_cohort'::regclass, 'public.hr_tick_enrolment'::regclass)) then
      raise exception 'kg: hr_tick_cohort / hr_tick_enrolment must have RLS enabled AND forced, and no policy';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── kc
    if to_regclass('cron.job') is not null
       and not exists (select 1 from cron.job where jobname = 'hr-tick-enrol'
                        and schedule = '* * * * *'
                        and command = 'select public.hr_tick_enrol(200)') then
      raise exception 'kc: cron job hr-tick-enrol is not scheduled every minute with its command';
    end if;

    -- ── kr
    update public.hr_tick_config
       set armed_channels = v_cfg_ar, enabled = v_cfg_en, channels = v_cfg_ch where id;
    update public.hr_tick_cohort
       set permille = v_coh.permille, max_owned = v_coh.max_owned, fresh_s = v_coh.fresh_s
     where channel = 'gather';
    select armed_channels, enabled, channels into v_ar, v_en, v_chs from public.hr_tick_config where id;
    if v_ar is distinct from v_cfg_ar or v_en is distinct from v_cfg_en or v_chs is distinct from v_cfg_ch then
      raise exception 'kr: hr_tick_config was not restored';
    end if;

    raise exception 'HR1010W_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1010W_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'world-tick-gather-widen: EXECUTED — a fresh in-bucket gatherer is enrolled and journalled, '
               'nothing paid; out-of-bucket, stale, non-gather, partied and operator-excluded characters are not; '
               'idempotent; the max_owned fuse holds; disarmed/disabled/off enrol nothing; one stuck gatherer is '
               'named by the lag judge while a moving one is not; unenrol restores the operator cohort exactly; '
               'executable by no role; hygiene strict — all green';
end $$;
