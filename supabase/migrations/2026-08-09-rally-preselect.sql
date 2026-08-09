-- ============================================================
-- Hearthrise — migration 2026-08-09 · RALLY PRE-SELECTION + HALF HONORS
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — no existing table, policy or
-- function belonging to another system is dropped or altered. In particular
-- world_event_joins / world_event_totals / world_event_join / _contribute /
-- _claim from 2026-08-08-muster.sql are READ here and never modified.
--
-- WHAT THIS IS
--   A player may mark ONE of a UTC day's two rallies as the one they intend to
--   answer, and may change that mark right up until the chosen rally's window
--   opens. If the window then passes without them — offline, or simply never
--   joining live — they take HALF HONORS on their next login: 50% of the base
--   participation band, and nothing else.
--
-- WHY IT IS ON THE SERVER
--   The client cannot be trusted with any of the three things this file owns:
--     1. WHAT DAY IT IS and WHETHER A WINDOW HAS OPENED — every RPC re-derives
--        both from now(). p_event_key is VALIDATED, never trusted.
--     2. ONE ANSWER PER UTC DAY — the rule IS the primary key
--        (day_key, user_id) on world_event_pledges, exactly as the join rule is
--        the primary key on world_event_joins.
--     3. WHAT ABSENCE IS WORTH — 750 gold and 1 gem are constants HERE. A
--        client that computes its own consolation computes its own payday.
--
-- ── THE NO-DOUBLE-PAY PROOF ─────────────────────────────────
--   Half honors and the live chest are mutually exclusive by construction, on
--   two independent locks, either of which alone would be sufficient:
--
--     LOCK 1 — THE DAY MUST BE OVER.  world_event_absence_claim refuses while
--       now() < the end of that day's LAST window (13:45 UTC). Until then a
--       live join is still possible, so nothing is owed yet. Once the day has
--       closed, no further join can be created for it: world_event_join only
--       ever writes the day it derives from now().
--     LOCK 2 — THE b220 JOIN PK.  If a row exists in world_event_joins for
--       (day_key, user_id) the player answered live and the claim is refused
--       outright — the pledge is closed as 'answered_live' and pays zero. That
--       primary key already guarantees at most ONE join per user per day, so
--       "answered live" is a single unambiguous fact, not a count.
--
--   And half honors cannot pay itself twice: the payout is a CONDITIONAL
--   update (… and settled = false) whose row_count is checked, on a table
--   whose primary key is (day_key, user_id). A replayed request finds
--   settled = true and gets 'already_settled'.
--
-- ECONOMY GUARANTEE
--   750 gold + 1 gem. Never a muster_seal — absence cannot earn a Rally Seal,
--   because the Seal exists only when the realm HELD, which needs people who
--   were there. Never any share of the community bar. Never, at any band, for
--   any reason, a hearth_token: the IAP bond is not mintable in PvE (Final
--   Directive), and there is no code path below that names it.
--
--   Against live play:  base live chest 1,500g + 2 gems (up to 7,500g +
--   10 gems + 1 Seal when the realm holds). Half honors is 50% of the FLOOR
--   and 10% of the CEILING, and costs the player their whole day's rally.
--   Presence wins by 2× at worst and 10× at best.
--
-- COMPATIBILITY — read before running:
--   • Every object created here is NEW. Nothing pre-existing changes.
--   • The client FEATURE-DETECTS all three RPCs (404 / PGRST202 → it falls
--     back to a local, clearly-labelled PROVISIONAL pre-selection under the
--     same no-double-pay rules). → THE CLIENT MAY SHIP FIRST.
--   • Shared objects referenced but not owned: public.hr_utc_day_key()
--     (re-created below byte-identical, so run order does not matter) and
--     public.world_event_joins (read only).
-- ============================================================

-- ── 0. Shared UTC clock helper (identical to the muster migration) ──
-- UNPADDED — '2026-8-8', not '2026-08-08' — to match world-events.js utcDayKey().
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;

-- ── 1. Day-key parsing, total and non-throwing ────────────────
-- Every RPC below takes a day key or an event key from a client, so parsing
-- must never be able to abort a transaction on malformed input.
create or replace function public.hr_rally_day(p_day_key text)
returns date language plpgsql immutable as $$
begin
  return to_date(p_day_key, 'FMYYYY-FMMM-FMDD');
exception when others then
  return null;
end $$;

-- ── 2. A named slot's window, derived — never stored ──────────
-- The same schedule as hr_muster_window(), addressed by (day, slot) instead of
-- by "now". Deriving it twice from one rule is what keeps the pledge, the join
-- and the client's countdown describing the same 45 minutes.
create or replace function public.hr_rally_slot(p_day_key text, p_slot int)
returns table (day_key text, slot int, event_key text, started_at timestamptz, ends_at timestamptz)
language sql stable as $$
  select public.hr_utc_day_key((d.day + interval '12 hours') at time zone 'utc'),
         p_slot,
         public.hr_utc_day_key((d.day + interval '12 hours') at time zone 'utc') || '#' || p_slot::text,
         (d.day + make_interval(hours => p_slot)) at time zone 'utc',
         (d.day + make_interval(hours => p_slot)) at time zone 'utc' + interval '45 minutes'
  from (select public.hr_rally_day(p_day_key)::timestamp as day) d
  where d.day is not null and p_slot in (1, 13)
$$;

-- When a UTC day's rallies are FINISHED: the end of its last window. This is
-- LOCK 1 above — the instant after which no live join can exist for that day.
create or replace function public.hr_rally_day_close(p_day_key text)
returns timestamptz language sql stable as $$
  select ends_at from public.hr_rally_slot(p_day_key, 13)
$$;

-- ── 3. The pre-selection (one per user per UTC day IS the primary key) ──
create table if not exists public.world_event_pledges (
  day_key    text not null,
  user_id    uuid not null,
  event_key  text not null,
  slot       int  not null,
  pledged_at timestamptz not null default now(),
  changed_at timestamptz,
  settled    boolean not null default false,
  settled_at timestamptz,
  outcome    text,                       -- 'absent' | 'answered_live'
  gold       bigint not null default 0,
  gems       int    not null default 0,
  primary key (day_key, user_id)
);
create index if not exists world_event_pledges_open_idx
  on public.world_event_pledges (user_id, settled);

alter table public.world_event_pledges enable row level security;
drop policy if exists "own rally pledge readable" on public.world_event_pledges;
create policy "own rally pledge readable" on public.world_event_pledges
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy ON PURPOSE. The security-definer RPCs below
-- are the only writers, which is what makes the day gate and the payout real.

-- ── 4. world_event_pledge — mark the rally you mean to answer ──
create or replace function public.world_event_pledge(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day_key text;
  v_slot    int;
  w  record;
  cw record;
  v_p public.world_event_pledges%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Strict shape check first: everything after this can assume a real key.
  if p_event_key is null or p_event_key !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}#(1|13)$' then
    return jsonb_build_object('ok', false, 'error', 'unknown_slot');
  end if;
  v_day_key := split_part(p_event_key, '#', 1);
  v_slot    := split_part(p_event_key, '#', 2)::int;

  -- You may only answer for TODAY, and the server decides what today is. This
  -- is also what bounds the feature: a pledge can only be created on a day the
  -- player was actually online, so half honors can never be farmed in bulk.
  if v_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'not_today',
                              'day_key', public.hr_utc_day_key());
  end if;

  select * into w from public.hr_rally_slot(v_day_key, v_slot);
  if w.event_key is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_slot');
  end if;
  -- Pre-selecting is a PLAN. Once the window is open the decision is joining,
  -- not planning.
  if now() >= w.started_at then
    return jsonb_build_object('ok', false, 'error', 'window_open');
  end if;
  -- Already answered live today: the day is spent (world_event_joins PK), and
  -- a pledge that could never pay must not be offered.
  if exists (select 1 from public.world_event_joins j
              where j.day_key = v_day_key and j.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'already_answered');
  end if;

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is not null then
    if v_p.event_key = p_event_key then                    -- idempotent retry
      return jsonb_build_object('ok', true, 'day_key', v_day_key, 'event_key', p_event_key,
                                'slot', v_slot, 'starts_at', w.started_at, 'changed', false);
    end if;
    if v_p.settled then
      return jsonb_build_object('ok', false, 'error', 'already_settled');
    end if;
    -- "Changeable until that rally's window opens" — checked against the
    -- CURRENT choice, because that is the promise the player made.
    select * into cw from public.hr_rally_slot(v_p.day_key, v_p.slot);
    if cw.started_at is not null and now() >= cw.started_at then
      return jsonb_build_object('ok', false, 'error', 'locked',
                                'event_key', v_p.event_key);
    end if;
  end if;

  insert into public.world_event_pledges (day_key, user_id, event_key, slot)
  values (v_day_key, auth.uid(), p_event_key, v_slot)
  on conflict (day_key, user_id) do update
    set event_key = excluded.event_key, slot = excluded.slot, changed_at = now()
    where world_event_pledges.settled = false;

  return jsonb_build_object('ok', true, 'day_key', v_day_key, 'event_key', p_event_key,
                            'slot', v_slot, 'starts_at', w.started_at,
                            'changed', v_p.user_id is not null);
end $$;
grant execute on function public.world_event_pledge(text) to authenticated;

-- ── 5. world_event_absence_claim — half honors, once, never stacked ──
create or replace function public.world_event_absence_claim(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- 50% of the 'answered' band in world_event_claim (1500 gold, 2 gems).
  -- Changing either of these changes the economy — they are stated once, here.
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_rows    int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  -- Normalise to the canonical unpadded key, so '2026-08-09' and '2026-8-9'
  -- can never address two different rows.
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1. While the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2. The b220 join primary key. One row = they were there = the live
  -- chest is their reward, and the pledge closes paying nothing.
  if exists (select 1 from public.world_event_joins j
              where j.day_key = v_day_key and j.user_id = auth.uid()) then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  -- The payout, as a conditional update. row_count = 0 means a replay lost the
  -- race — it gets nothing, not a second purse.
  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_p.slot,
    'gold', c_gold, 'gems', c_gems, 'seals', 0);
end $$;
grant execute on function public.world_event_absence_claim(text) to authenticated;

-- ── 6. hr_rally_pledge_state — what this account has answered ──
-- Read-only. Exists so an answer given on a phone is honoured on a desktop:
-- the client hydrates from this before it settles anything.
create or replace function public.hr_rally_pledge_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today text;
  v_t   public.world_event_pledges%rowtype;
  v_pen public.world_event_pledges%rowtype;
  tw record;
  v_joined boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_today := public.hr_utc_day_key();

  select * into v_t from public.world_event_pledges
   where day_key = v_today and user_id = auth.uid();
  -- Run unconditionally so `tw` is always an assigned record: hr_rally_slot()
  -- returns no rows for a null day/slot, which leaves every field null.
  select * into tw from public.hr_rally_slot(v_t.day_key, v_t.slot);
  select exists (select 1 from public.world_event_joins j
                  where j.day_key = v_today and j.user_id = auth.uid()) into v_joined;

  -- The oldest unsettled pledge whose day is over and which was never answered
  -- live: exactly the one the client should be claiming half honors for.
  select * into v_pen from public.world_event_pledges p
   where p.user_id = auth.uid()
     and p.settled = false
     and public.hr_rally_day_close(p.day_key) <= now()
     and not exists (select 1 from public.world_event_joins j
                      where j.day_key = p.day_key and j.user_id = auth.uid())
   order by p.pledged_at
   limit 1;

  return jsonb_build_object(
    'ok', true, 'day_key', v_today,
    'today', case when v_t.user_id is null then null else jsonb_build_object(
      'day_key', v_t.day_key, 'event_key', v_t.event_key, 'slot', v_t.slot,
      'settled', v_t.settled, 'joined', coalesce(v_joined, false),
      'locked', tw.started_at is not null and now() >= tw.started_at) end,
    'pending', case when v_pen.user_id is null then null else jsonb_build_object(
      'day_key', v_pen.day_key, 'event_key', v_pen.event_key, 'slot', v_pen.slot,
      'joined', false) end);
end $$;
grant execute on function public.hr_rally_pledge_state() to authenticated;

-- ── 7. Self-check ─────────────────────────────────────────────
-- Asserts the migration took AND that the derived schedule, the day-key
-- convention and both no-double-pay locks behave as documented. Raises loudly
-- rather than leaving a half-applied economy.
do $$
declare v record; v_ts timestamptz;
begin
  if to_regclass('public.world_event_pledges') is null then raise exception 'world_event_pledges missing'; end if;
  if to_regclass('public.world_event_joins')  is null then
    raise exception 'world_event_joins missing — run 2026-08-08-muster.sql first (the join PK is lock 2)';
  end if;

  -- Day-key parsing round-trips the UNPADDED client convention, and refuses junk.
  if public.hr_rally_day('2026-8-9') is distinct from date '2026-08-09' then
    raise exception 'unpadded day key did not parse';
  end if;
  if public.hr_rally_day('2026-08-09') is distinct from date '2026-08-09' then
    raise exception 'padded day key must still parse (it is normalised, not rejected)';
  end if;
  if public.hr_rally_day('not-a-day') is not null then
    raise exception 'a malformed day key must return null, not throw';
  end if;

  -- The slot windows agree with hr_muster_window(): 01:00–01:45 and 13:00–13:45.
  select * into v from public.hr_rally_slot('2026-8-9', 1);
  if v.event_key <> '2026-8-9#1' then raise exception 'event_key shape drifted: %', v.event_key; end if;
  if v.started_at <> timestamptz '2026-08-09 01:00:00+00' then raise exception 'slot 1 start drifted: %', v.started_at; end if;
  if v.ends_at   <> timestamptz '2026-08-09 01:45:00+00' then raise exception 'slot 1 end drifted: %', v.ends_at; end if;
  select * into v from public.hr_rally_slot('2026-8-9', 13);
  if v.started_at <> timestamptz '2026-08-09 13:00:00+00' then raise exception 'slot 13 start drifted'; end if;

  -- An unknown slot yields no window, so it can never be pledged.
  select * into v from public.hr_rally_slot('2026-8-9', 7);
  if v.event_key is not null then raise exception 'only slots 1 and 13 exist'; end if;

  -- LOCK 1: the day closes at the end of the LAST window, not the first.
  v_ts := public.hr_rally_day_close('2026-8-9');
  if v_ts <> timestamptz '2026-08-09 13:45:00+00' then
    raise exception 'day close must be 13:45 UTC — half honors before that could stack with a live join, got %', v_ts;
  end if;

  raise notice 'RALLY PRE-SELECT migration OK — schedule, pledge table, both locks and the payout verified.';
end $$;
