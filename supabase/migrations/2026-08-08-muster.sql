-- ============================================================
-- Hearthrise — migration 2026-08-08 · THE MUSTER (backlog #15, Wave 2)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing table, policy or
-- function belonging to another system is dropped or altered.
--
-- WHAT THIS IS
--   World events gain a live, joinable layer on top of the existing passive
--   "Blessing" modifier (src/features/world-events.js, unchanged). Twice a UTC
--   day — 01:00 and 13:00 UTC — a 45-minute MUSTER opens. A player may join
--   exactly ONE muster per UTC day; ordinary play then feeds a shared community
--   bar, and a chest is claimed once at the end.
--
-- WHY ANY OF IT IS ON THE SERVER
--   Three things cannot be trusted to a client and are therefore the only
--   three things stored here:
--     1. WHAT TIME IT IS.  The whole feature is a clock. A tampered (or merely
--        wrong) device clock must not be able to open a window that is closed.
--        Every RPC re-derives the live slot from now(); p_event_key is
--        VALIDATED, never trusted. This is the same lesson the raid hardening
--        migration learned the hard way with p_week.
--     2. ONCE PER UTC DAY.  The rule IS the primary key (day_key, user_id).
--        Application logic can drift; a primary key cannot.
--     3. WHAT THE CHEST IS WORTH.  The reward band is computed here, from the
--        median of real contributors, and handed back. A client that computes
--        its own band computes its own payday.
--
-- ECONOMY GUARANTEE
--   The chest pays gold, gems and AT MOST ONE muster_seal per day. It never
--   pays a hearth_token — the IAP bond is not mintable in PvE, at any band,
--   for any reason (Final Directive). There is no code path here that names it.
--
-- COMPATIBILITY — read before running:
--   • Every object created here is NEW. Nothing pre-existing changes, so a
--     client built before this migration is completely unaffected by it.
--   • The b220 client FEATURE-DETECTS all four RPCs (404 / PGRST202 → it falls
--     back to a local-only "solo muster": the player still joins, still plays,
--     still takes the Answered-the-call band — but there is no shared bar and
--     no Muster Seal, because neither can be honest without the server).
--     → THE CLIENT MAY SHIP FIRST. Ship b220, then run this file.
--   • The only shared object referenced is public.hr_utc_day_key(), created by
--     2026-08-08-raid-hardening.sql. It is re-created here (create or replace,
--     byte-identical) so this migration can be run in either order.
-- ============================================================

-- ── 0. Shared UTC clock helper ────────────────────────────────
-- MUST agree byte-for-byte with src/features/world-events.js utcDayKey():
--   getUTCFullYear() + '-' + (getUTCMonth()+1) + '-' + getUTCDate()
-- i.e. UNPADDED — '2026-8-8', not '2026-08-08'. Identical to the definition in
-- 2026-08-08-raid-hardening.sql; `create or replace` makes the order irrelevant.
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;

-- ── 1. The schedule, derived — never stored ───────────────────
-- Two slots, twelve hours apart, 45 minutes each. Storing a schedule table
-- would mean a row to forget to insert; deriving it means the schedule is the
-- same forever, on every server and every client, with nothing to maintain.
-- The slot is identified by its UTC HOUR (1 or 13), so an event_key is
-- self-describing: '2026-8-8#13'.
create or replace function public.hr_muster_window(p_at timestamptz default now())
returns table (day_key text, slot int, event_key text, started_at timestamptz, ends_at timestamptz)
language sql stable as $$
  with slots as (
    select h, (date_trunc('day', p_at at time zone 'utc') + make_interval(hours => h)) at time zone 'utc' as st
    from unnest(array[1, 13]) as h
  )
  select public.hr_utc_day_key(p_at), h::int,
         public.hr_utc_day_key(p_at) || '#' || h::text,
         st, st + interval '45 minutes'
  from slots
  where p_at >= st and p_at < st + interval '45 minutes'
  limit 1
$$;

-- ── 2. Participation (the once-per-UTC-day rule IS the primary key) ──
create table if not exists public.world_event_joins (
  day_key    text not null,
  user_id    uuid not null,
  event_key  text not null,
  slot       int  not null,
  joined_at  timestamptz not null default now(),
  window_end timestamptz not null,
  points     bigint  not null default 0,
  claimed    boolean not null default false,
  claimed_at timestamptz,
  primary key (day_key, user_id)
);
create index if not exists world_event_joins_event_idx on public.world_event_joins (event_key);

alter table public.world_event_joins enable row level security;
drop policy if exists "own muster join readable" on public.world_event_joins;
create policy "own muster join readable" on public.world_event_joins
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy ON PURPOSE. The three security-definer RPCs
-- below are the only writers, which is what makes the day gate real.

-- ── 3. The shared community bar ───────────────────────────────
create table if not exists public.world_event_totals (
  event_key      text primary key,
  participants   int    not null default 0,
  goal           bigint not null default 6000,
  goal_frozen_at timestamptz,
  progress       bigint not null default 0,
  met_at         timestamptz
);
alter table public.world_event_totals enable row level security;
drop policy if exists "muster totals readable" on public.world_event_totals;
-- The community bar is public by design — "the world is in it with you" only
-- works if you can see the world. Nothing here is per-player.
create policy "muster totals readable" on public.world_event_totals
  for select using (true);

-- ── 4. Server time (this is the serverSkewMs source) ──────────
-- The countdown must be driven by the server's clock, not the device's. A
-- player whose laptop is nine minutes fast otherwise watches the timer hit
-- zero, presses Join, and is refused — which reads as a broken feature rather
-- than a wrong clock. One call per session is enough.
create or replace function public.hr_server_now()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'epoch_ms', (extract(epoch from now()) * 1000)::bigint,
    'day_key', public.hr_utc_day_key(),
    'live_event_key', (select event_key from public.hr_muster_window())
  )
$$;
grant execute on function public.hr_server_now() to anon, authenticated;

-- ── 5. world_event_join ───────────────────────────────────────
-- Joining is the commitment. It is what consumes your once-per-day, and it is
-- deliberately impossible to undo: there is no leave, so there is no way to
-- shop around the two slots.
create or replace function public.world_event_join(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_goal_per_player constant bigint := 2000;
  c_min_goal        constant bigint := 6000;
  c_freeze_min      constant int    := 10;
  w record;
  v_rows int;
  v_tot  public.world_event_totals%rowtype;
  v_existing public.world_event_joins%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into w from public.hr_muster_window();
  if w.event_key is null then
    return jsonb_build_object('ok', false, 'error', 'not_live',
                              'day_key', public.hr_utc_day_key());
  end if;
  -- The client REPORTS which muster it thinks it is joining. If it disagrees
  -- with the server the answer is no, and the server's key comes back so an
  -- honest client with a skewed clock can re-sync instead of guessing.
  if p_event_key is distinct from w.event_key then
    return jsonb_build_object('ok', false, 'error', 'stale_event',
                              'event_key', w.event_key, 'day_key', w.day_key);
  end if;

  insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end)
  values (w.day_key, auth.uid(), w.event_key, w.slot, w.ends_at)
  on conflict (day_key, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select * into v_existing from public.world_event_joins
      where day_key = w.day_key and user_id = auth.uid();
    return jsonb_build_object('ok', false, 'error', 'already_joined',
      'day_key', w.day_key, 'event_key', v_existing.event_key,
      'slot', v_existing.slot, 'points', v_existing.points,
      'claimed', v_existing.claimed);
  end if;

  -- The goal scales with turnout and then FREEZES ten minutes in, so late
  -- joiners raise progress but not the bar. That single rule is what lets the
  -- same content work for a five-player beta and a five-thousand-player launch
  -- without anyone re-tuning it.
  insert into public.world_event_totals (event_key, participants, goal, goal_frozen_at)
    values (w.event_key, 0, c_min_goal, w.started_at + make_interval(mins => c_freeze_min))
    on conflict (event_key) do nothing;
  update public.world_event_totals
     set participants = participants + 1,
         goal = case when now() < goal_frozen_at
                     then greatest(c_min_goal, c_goal_per_player * (participants + 1))
                     else goal end
   where event_key = w.event_key
   returning * into v_tot;

  return jsonb_build_object('ok', true, 'day_key', w.day_key, 'event_key', w.event_key,
    'slot', w.slot, 'ends_at', w.ends_at, 'participants', v_tot.participants,
    'goal', v_tot.goal, 'progress', v_tot.progress);
end $$;
grant execute on function public.world_event_join(text) to authenticated;

-- ── 6. world_event_contribute ─────────────────────────────────
-- Ordinary play, batched by the client every 30s. Two clamps, same philosophy
-- as raid_strike's hard 50k: a per-call ceiling so one forged request cannot
-- carry a muster, and a per-muster ceiling so a script cannot grind one.
create or replace function public.world_event_contribute(p_event_key text, p_points int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_call_clamp constant int    := 400;
  c_total_cap  constant bigint := 6000;
  v_join public.world_event_joins%rowtype;
  v_add  bigint;
  v_tot  public.world_event_totals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_points is null or p_points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_points');
  end if;

  select * into v_join from public.world_event_joins
    where user_id = auth.uid() and event_key = p_event_key;
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  -- now() decides whether the window is open. Not the client, and not the row.
  if now() >= v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'window_closed');
  end if;

  v_add := least(p_points::bigint, c_call_clamp);
  v_add := least(v_add, greatest(0, c_total_cap - v_join.points));
  if v_add <= 0 then
    return jsonb_build_object('ok', true, 'added', 0, 'points', v_join.points, 'capped', true);
  end if;

  update public.world_event_joins set points = points + v_add
    where day_key = v_join.day_key and user_id = auth.uid()
    returning * into v_join;

  update public.world_event_totals
     set progress = progress + v_add,
         met_at = case when met_at is null and progress + v_add >= goal then now() else met_at end
   where event_key = p_event_key
   returning * into v_tot;

  return jsonb_build_object('ok', true, 'added', v_add, 'points', v_join.points,
    'progress', coalesce(v_tot.progress, 0), 'goal', coalesce(v_tot.goal, 0),
    'met', v_tot.met_at is not null);
end $$;
grant execute on function public.world_event_contribute(text, int) to authenticated;

-- ── 7. world_event_claim ──────────────────────────────────────
-- The band is computed HERE, from the median of contributors who actually
-- turned up (>= 200 points), so a swarm of near-zero alts cannot depress the
-- median to farm the Gold band. The claimed flag is flipped by a CONDITIONAL
-- update — row_count = 0 means someone (or some replay) already took it.
create or replace function public.world_event_claim(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join   public.world_event_joins%rowtype;
  v_tot    public.world_event_totals%rowtype;
  v_median numeric;
  v_rows   int;
  v_gold   bigint := 0;
  v_gems   int    := 0;
  v_seal   int    := 0;
  v_band   text   := 'none';
  v_held   boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  -- An unclaimed chest expires at the next UTC day roll: one outstanding
  -- chest, maximum. This is a reward, not a savings account.
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Three ADDITIVE bands, then the community multiplier. Ceiling per §5.2:
  -- 7,500 gold · 10 gems · 1 Muster Seal.  No hearth_token. Ever.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2; v_seal := 1;
  end if;

  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold, 'gems', v_gems, 'seals', v_seal,
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key);
end $$;
grant execute on function public.world_event_claim(text) to authenticated;

-- ── 8. Self-check ─────────────────────────────────────────────
-- Asserts the migration actually took, and that the derived schedule agrees
-- with the client's. Raises loudly rather than leaving a half-applied economy.
do $$
declare v record; v_key text;
begin
  if to_regclass('public.world_event_joins')  is null then raise exception 'world_event_joins missing';  end if;
  if to_regclass('public.world_event_totals') is null then raise exception 'world_event_totals missing'; end if;

  -- 01:00 UTC exactly → live, slot 1.
  select * into v from public.hr_muster_window(timestamptz '2026-08-08 01:00:00+00');
  if v.slot is distinct from 1 then raise exception '01:00 UTC should open slot 1'; end if;
  if v.event_key <> '2026-8-8#1' then raise exception 'event_key shape drifted: %', v.event_key; end if;

  -- 01:44:59 → still live. 01:45:00 → closed. 13:30 → slot 13.
  select * into v from public.hr_muster_window(timestamptz '2026-08-08 01:44:59+00');
  if v.slot is distinct from 1 then raise exception '01:44:59 should still be live'; end if;
  select * into v from public.hr_muster_window(timestamptz '2026-08-08 01:45:00+00');
  if v.slot is not null then raise exception '01:45:00 must be closed (45-minute window)'; end if;
  select * into v from public.hr_muster_window(timestamptz '2026-08-08 13:30:00+00');
  if v.slot is distinct from 13 then raise exception '13:30 should open slot 13'; end if;

  select public.hr_utc_day_key(timestamptz '2026-08-08 12:00:00+00') into v_key;
  if v_key <> '2026-8-8' then raise exception 'day key must be UNPADDED to match the client, got %', v_key; end if;

  raise notice 'MUSTER migration OK — schedule, tables and RPCs verified.';
end $$;
