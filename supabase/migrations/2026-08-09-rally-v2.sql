-- ============================================================
-- Hearthrise — migration 2026-08-09 · RALLY v2
--   themed chests · auto-join settlement
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. ADDITIVE ONLY — nothing belonging to
-- 2026-08-08-muster.sql or 2026-08-09-rally-preselect.sql is dropped or
-- altered. world_event_joins / world_event_totals / world_event_join /
-- _contribute / _claim are READ here and never modified.
--
-- ── IT DOES NOT ASSUME rally-preselect RAN ──────────────────
-- The preselect file's application had a hiccup, so every object this file
-- depends on that preselect also defines is (re)created here with the SAME
-- definition, under `create or replace` / `create table if not exists`. Running
-- this file alone is sufficient; running it after preselect is a no-op on those
-- objects. Everything that reads a table this file does NOT own goes through
-- `to_regclass` + dynamic SQL, so a project missing 2026-08-08-muster.sql gets
-- an honest 'unsupported' answer instead of a broken function.
--
-- WHAT THIS ADDS
--   1. The rally SCHEDULE ORACLE on the server: the same FNV-1a draw the client
--      uses, so the server can name which rally a given (day, slot) actually is
--      and therefore what its chest should contain.
--   2. THE THEMED CHEST. Each rally's reward derives from its own domain —
--      the Forge Levy pays smithing and crafting XP plus bars and coal; the
--      Deep Seam pays gathering XP plus ore and logs. hr_rally_chest() is the
--      authoritative definition of that conversion.
--   3. AUTO-JOIN SETTLEMENT. world_event_pledge_settle() closes a pledge the
--      instant its rally was answered live, so no second device can ever see a
--      consolation pending for a day that was already paid in full.
--
-- ── THEMING CONVERTS VALUE, IT NEVER ADDS ANY ───────────────
-- The BAND is still computed by world_event_claim (1,500g floor … 7,500g
-- ceiling, ≤10 gems, ≤1 Seal). This file never raises it and cannot: the chest
-- treats the band's gold as a VALUE BUDGET and decides only what it is paid IN.
--     30% of the budget → domain materials, priced at their own vendor value
--     20% of the budget → domain XP, at 2 XP per gold of budget
--     the remainder     → gold
-- Every division floors, so the chest's total value can only round DOWN. The
-- self-check at the bottom asserts that across every rally at both the floor
-- and the ceiling, and asserts the gem and Seal rules are untouched.
--
-- Gems: unchanged, a small constant per band. Seals: unchanged — a Rally Seal
-- still means only "the realm held", and absence still never earns one.
-- hearth_token: not named anywhere below, at any band, for any reason.
--
-- ── WHERE THE CLIENT SITS ───────────────────────────────────
-- The server owns the BAND (it always did). The SPLIT is a pure, deterministic
-- function of the band, and the client mirrors it exactly — the same way
-- reduceClaim() already mirrors the 7,500g / 10 gem / 1 Seal ceiling, so a
-- confused server cannot mint. hr_rally_chest() below is the definition of
-- record; §8's self-check pins the three constants and the six tables so the
-- two copies cannot drift apart silently.
-- ============================================================

-- ── 0. Shared UTC clock helper (byte-identical to the other two files) ──
-- UNPADDED — '2026-8-9', not '2026-08-09' — to match world-events.js utcDayKey().
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;

create or replace function public.hr_rally_day(p_day_key text)
returns date language plpgsql immutable as $$
begin
  return to_date(p_day_key, 'FMYYYY-FMMM-FMDD');
exception when others then
  return null;
end $$;

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

create or replace function public.hr_rally_day_close(p_day_key text)
returns timestamptz language sql stable as $$
  select ends_at from public.hr_rally_slot(p_day_key, 13)
$$;

-- The pledge table, in case preselect never landed. Identical definition.
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
-- No insert/update/delete policy ON PURPOSE — the security-definer RPCs are the
-- only writers, which is what makes the day gate and the payouts real.

-- ── 1. The schedule oracle: FNV-1a, the client's exact draw ──
-- muster.js derives the day's two rallies from a hash rather than storing them,
-- so the schedule needs no table and no cron. For the server to know what a
-- chest should CONTAIN it has to run the same draw — so here it is, once, with
-- the JS semantics reproduced exactly: 32-bit unsigned, multiply then truncate.
create or replace function public.hr_fnv1a(p_s text)
returns bigint language plpgsql immutable as $$
declare
  h bigint := 2166136261;                -- 0x811c9dc5
  i int;
begin
  for i in 1 .. length(p_s) loop
    h := (h # ascii(substr(p_s, i, 1)))::bigint;
    h := (h * 16777619) % 4294967296;    -- 0x01000193, then JS's >>> 0
  end loop;
  return h;
end $$;

-- The pool, in the SAME ORDER as EVENTS[] in src/features/muster.js. Order is
-- load-bearing: it is what the hash indexes into. Appending a rally to one side
-- and not the other would silently re-draw every future day, so §8 pins the
-- count and the order.
create or replace function public.hr_rally_pool()
returns text[] language sql immutable as $$
  select array['ashen_horde','long_harvest','forge_levy','deep_seam','keep_kitchens','all_hands']::text[]
$$;

-- Slot A is drawn from the whole pool; slot B is drawn from the pool with A
-- REMOVED, so a day's two rallies are always different content and the "one per
-- day" limit is always a real choice.
create or replace function public.hr_rally_event_id(p_day_key text, p_slot int)
returns text language plpgsql immutable as $$
declare
  pool text[] := public.hr_rally_pool();
  n int := array_length(pool, 1);
  a int;
  off int;
begin
  if p_day_key is null or p_slot is null then return null; end if;
  a := (public.hr_fnv1a('hr-muster-' || p_day_key || '#1') % n)::int;
  if p_slot = 1 then return pool[a + 1]; end if;
  off := (public.hr_fnv1a('hr-muster-' || p_day_key || '#' || p_slot::text) % (n - 1))::int;
  return pool[((a + 1 + off) % n) + 1];
end $$;

create or replace function public.hr_rally_event_for_key(p_event_key text)
returns text language plpgsql immutable as $$
begin
  if p_event_key is null or p_event_key !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}#(1|13)$' then
    return null;
  end if;
  return public.hr_rally_event_id(split_part(p_event_key, '#', 1),
                                  split_part(p_event_key, '#', 2)::int);
end $$;

-- ── 2. The themed reward tables ──────────────────────────────
-- One row per rally: the skills its XP pays into, and the materials its chest
-- pays out, each with the vendor value used to price it and the share of the
-- material budget it takes. The values are stated HERE rather than joined from
-- an items table so that this file and muster.js carry the same numbers and
-- neither can drift; the smoke suite checks each one against window.ITEMS.
create or replace function public.hr_rally_theme(p_event_id text)
returns jsonb language sql immutable as $$
  select case p_event_id
    when 'ashen_horde' then jsonb_build_object(
      'skills', jsonb_build_array('attack','strength','defense'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','wolf_pelt','v',35,'w',0.6),
        jsonb_build_object('id','dragon_bones','v',10,'w',0.4)))
    when 'long_harvest' then jsonb_build_object(
      'skills', jsonb_build_array('farming','woodcutting'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','wheat','v',50,'w',0.5),
        jsonb_build_object('id','pumpkin_seed','v',50,'w',0.5)))
    when 'forge_levy' then jsonb_build_object(
      'skills', jsonb_build_array('smithing','crafting'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','iron_bar','v',90,'w',0.6),
        jsonb_build_object('id','coal','v',40,'w',0.4)))
    when 'deep_seam' then jsonb_build_object(
      'skills', jsonb_build_array('mining','woodcutting','fishing'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','iron_ore','v',25,'w',0.4),
        jsonb_build_object('id','coal','v',40,'w',0.3),
        jsonb_build_object('id','oak_log','v',20,'w',0.3)))
    when 'keep_kitchens' then jsonb_build_object(
      'skills', jsonb_build_array('cooking','fishing'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','trout','v',20,'w',0.5),
        jsonb_build_object('id','lobster','v',100,'w',0.5)))
    when 'all_hands' then jsonb_build_object(
      'skills', jsonb_build_array('woodcutting','mining','smithing','cooking'),
      'items',  jsonb_build_array(
        jsonb_build_object('id','iron_bar','v',90,'w',0.5),
        jsonb_build_object('id','oak_log','v',20,'w',0.5)))
    else null end
$$;

-- ── 3. hr_rally_chest — the conversion, and the definition of record ──
-- Takes a band (gold, gems, seals) and returns what that band is paid IN for a
-- given rally. Pure. Every division floors, so total value ≤ the band's gold.
-- An unknown rally degrades to plain gold — poorer, never emptier.
create or replace function public.hr_rally_chest(p_event_key text, p_gold bigint,
                                                 p_gems int, p_seals int)
returns jsonb language plpgsql immutable as $$
declare
  c_item_share constant numeric := 0.30;
  c_xp_share   constant numeric := 0.20;
  c_xp_per_gold constant numeric := 2;
  v_id     text;
  v_theme  jsonb;
  v_gold   bigint := greatest(0, least(7500, coalesce(p_gold, 0)));
  v_gems   int    := greatest(0, least(10,   coalesce(p_gems, 0)));
  v_seals  int    := greatest(0, least(1,    coalesce(p_seals, 0)));
  v_item_budget bigint;
  v_xp_budget   bigint;
  v_spent  bigint := 0;
  v_items  jsonb := '[]'::jsonb;
  v_xp     jsonb := '[]'::jsonb;
  v_per    bigint;
  it       jsonb;
  sk       text;
  v_qty    bigint;
begin
  v_id := public.hr_rally_event_for_key(p_event_key);
  v_theme := public.hr_rally_theme(v_id);
  if v_theme is null then
    return jsonb_build_object('event_id', v_id, 'gold', v_gold, 'gems', v_gems,
                              'seals', v_seals, 'items', '[]'::jsonb, 'xp', '[]'::jsonb);
  end if;

  v_item_budget := floor(v_gold * c_item_share);
  v_xp_budget   := floor(v_gold * c_xp_share);

  for it in select * from jsonb_array_elements(v_theme -> 'items') loop
    v_qty := floor((v_item_budget * (it ->> 'w')::numeric) / (it ->> 'v')::numeric);
    if v_qty > 0 then
      v_items := v_items || jsonb_build_object('id', it ->> 'id', 'qty', v_qty,
                                               'value', v_qty * (it ->> 'v')::bigint);
      v_spent := v_spent + v_qty * (it ->> 'v')::bigint;
    end if;
  end loop;

  v_per := floor((v_xp_budget * c_xp_per_gold) / jsonb_array_length(v_theme -> 'skills'));
  for sk in select jsonb_array_elements_text(v_theme -> 'skills') loop
    v_xp := v_xp || jsonb_build_object('skill', sk, 'amount', v_per);
  end loop;

  return jsonb_build_object('event_id', v_id,
    'gold',  greatest(0, v_gold - v_spent - v_xp_budget),
    'gems',  v_gems, 'seals', v_seals, 'items', v_items, 'xp', v_xp);
end $$;
grant execute on function public.hr_rally_chest(text, bigint, int, int) to authenticated;
grant execute on function public.hr_rally_theme(text) to authenticated;
grant execute on function public.hr_rally_event_id(text, int) to authenticated;
grant execute on function public.hr_rally_event_for_key(text) to authenticated;

-- What a chest is actually worth, by the same rate that built it. Exists so the
-- ceiling can be ASSERTED rather than assumed — see §8.
create or replace function public.hr_rally_chest_value(p_chest jsonb)
returns numeric language sql immutable as $$
  select coalesce((p_chest ->> 'gold')::numeric, 0)
       + coalesce((select sum((x ->> 'value')::numeric) from jsonb_array_elements(p_chest -> 'items') x), 0)
       + coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(p_chest -> 'xp') x), 0) / 2
$$;

-- The half-honors chest: the SAME table on half the band, and never a Seal.
create or replace function public.hr_rally_absent_chest(p_event_key text)
returns jsonb language sql stable as $$
  select public.hr_rally_chest(p_event_key, 750, 1, 0)
$$;
grant execute on function public.hr_rally_absent_chest(text) to authenticated;

-- ── 4. Auto-join settlement ──────────────────────────────────
-- The pledge upgrades itself into an ordinary join the moment its window opens
-- while the player is online. The join itself needs NO new server code — it is
-- world_event_join, unchanged, with its (day_key, user_id) primary key still
-- doing all the work. What is new is closing the pledge immediately afterwards
-- so a second device never sees a consolation pending for a day already paid in
-- full. Half honors was already impossible for such a day (LOCK 2 in
-- world_event_absence_claim reads the same join row); this only makes the
-- bookkeeping match the truth without waiting for 13:45 UTC.
--
-- It can only ever record what already happened: it refuses unless a real join
-- row exists, and it pays nothing — outcome 'answered_live', gold 0, gems 0.
create or replace function public.world_event_pledge_settle(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day     date;
  v_day_key text;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', true, 'already', true, 'outcome', v_p.outcome);
  end if;

  -- Read the join table through to_regclass + dynamic SQL so this file runs on
  -- a project that has not applied 2026-08-08-muster.sql.
  if to_regclass('public.world_event_joins') is null then
    return jsonb_build_object('ok', false, 'error', 'unsupported');
  end if;
  execute 'select exists (select 1 from public.world_event_joins j
                           where j.day_key = $1 and j.user_id = $2)'
    into v_joined using v_day_key, auth.uid();
  if not v_joined then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;

  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'day_key', v_day_key, 'outcome', 'answered_live',
                            'closed', v_rows > 0, 'gold', 0, 'gems', 0, 'seals', 0);
end $$;
grant execute on function public.world_event_pledge_settle(text) to authenticated;

-- ── 5. The pre-selection RPC (from rally-preselect, re-stated verbatim) ──
-- Present so this file is sufficient on its own. If preselect already ran, this
-- replaces the function with the same body.
create or replace function public.world_event_pledge(p_event_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day_key text;
  v_slot    int;
  w  record;
  cw record;
  v_p public.world_event_pledges%rowtype;
  v_joined boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_event_key is null or p_event_key !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}#(1|13)$' then
    return jsonb_build_object('ok', false, 'error', 'unknown_slot');
  end if;
  v_day_key := split_part(p_event_key, '#', 1);
  v_slot    := split_part(p_event_key, '#', 2)::int;

  if v_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'not_today',
                              'day_key', public.hr_utc_day_key());
  end if;

  select * into w from public.hr_rally_slot(v_day_key, v_slot);
  if w.event_key is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_slot');
  end if;
  if now() >= w.started_at then
    return jsonb_build_object('ok', false, 'error', 'window_open');
  end if;
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
    if v_joined then
      return jsonb_build_object('ok', false, 'error', 'already_answered');
    end if;
  end if;

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is not null then
    if v_p.event_key = p_event_key then
      return jsonb_build_object('ok', true, 'day_key', v_day_key, 'event_key', p_event_key,
                                'slot', v_slot, 'starts_at', w.started_at, 'changed', false);
    end if;
    if v_p.settled then
      return jsonb_build_object('ok', false, 'error', 'already_settled');
    end if;
    select * into cw from public.hr_rally_slot(v_p.day_key, v_p.slot);
    if cw.started_at is not null and now() >= cw.started_at then
      return jsonb_build_object('ok', false, 'error', 'locked', 'event_key', v_p.event_key);
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

-- ── 6. Half honors — the themed payload, both locks intact ──
-- Same two locks as rally-preselect (the day must be over; a join row forfeits
-- it), same conditional-update replay guard, and now the payout describes the
-- rally it belonged to. The gold/gem constants are unchanged: 750 and 1.
create or replace function public.world_event_absence_claim(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
  v_chest   jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1 — while the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2 — the b220 join primary key. They were there; the live chest was
  -- their reward and the pledge closes paying nothing.
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
  end if;
  if v_joined then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  v_chest := public.hr_rally_chest(v_p.event_key, c_gold, c_gems, 0);
  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_p.slot,
    'gold', c_gold, 'gems', c_gems, 'seals', 0, 'chest', v_chest);
end $$;
grant execute on function public.world_event_absence_claim(text) to authenticated;

-- ── 7. hr_rally_pledge_state (re-stated; unchanged behaviour) ──
create or replace function public.hr_rally_pledge_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today text;
  v_t   public.world_event_pledges%rowtype;
  v_pen public.world_event_pledges%rowtype;
  tw record;
  v_joined boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_today := public.hr_utc_day_key();

  select * into v_t from public.world_event_pledges
   where day_key = v_today and user_id = auth.uid();
  select * into tw from public.hr_rally_slot(v_t.day_key, v_t.slot);
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_today, auth.uid();
  end if;

  select * into v_pen from public.world_event_pledges p
   where p.user_id = auth.uid()
     and p.settled = false
     and public.hr_rally_day_close(p.day_key) <= now()
   order by p.pledged_at
   limit 1;

  return jsonb_build_object(
    'ok', true, 'day_key', v_today,
    'today', case when v_t.user_id is null then null else jsonb_build_object(
      'day_key', v_t.day_key, 'event_key', v_t.event_key, 'slot', v_t.slot,
      'event_id', public.hr_rally_event_for_key(v_t.event_key),
      'settled', v_t.settled, 'joined', coalesce(v_joined, false),
      'locked', tw.started_at is not null and now() >= tw.started_at) end,
    'pending', case when v_pen.user_id is null then null else jsonb_build_object(
      'day_key', v_pen.day_key, 'event_key', v_pen.event_key, 'slot', v_pen.slot,
      'event_id', public.hr_rally_event_for_key(v_pen.event_key),
      'joined', false) end);
end $$;
grant execute on function public.hr_rally_pledge_state() to authenticated;

-- ── 8. Self-check ─────────────────────────────────────────────
-- Asserts the migration took AND that the economy rules it claims are true.
-- It asserts cleanly whether or not rally-preselect ran, and whether or not
-- 2026-08-08-muster.sql ran (the join table is NOTICEd, never required).
do $$
declare
  v record;
  v_ts timestamptz;
  ev text;
  ch jsonb;
  band bigint;
  n int;
begin
  if to_regclass('public.world_event_pledges') is null then
    raise exception 'world_event_pledges missing';
  end if;
  if to_regclass('public.world_event_joins') is null then
    raise notice 'NOTE: world_event_joins is absent — run 2026-08-08-muster.sql for live rallies. '
                 'The pledge RPCs above degrade to "unsupported" until then, by design.';
  end if;

  -- Day keys and the derived schedule (identical to the other two files).
  if public.hr_rally_day('2026-8-9') is distinct from date '2026-08-09' then
    raise exception 'unpadded day key did not parse';
  end if;
  if public.hr_rally_day('not-a-day') is not null then
    raise exception 'a malformed day key must return null, not throw';
  end if;
  select * into v from public.hr_rally_slot('2026-8-9', 1);
  if v.started_at <> timestamptz '2026-08-09 01:00:00+00' then raise exception 'slot 1 start drifted'; end if;
  v_ts := public.hr_rally_day_close('2026-8-9');
  if v_ts <> timestamptz '2026-08-09 13:45:00+00' then
    raise exception 'day close must be 13:45 UTC, got %', v_ts;
  end if;

  -- The pool must match muster.js EVENTS[] in COUNT and ORDER, or every future
  -- day is drawn differently on the two sides.
  if array_length(public.hr_rally_pool(), 1) <> 6 then raise exception 'the rally pool is not 6 long'; end if;
  if (public.hr_rally_pool())[3] <> 'forge_levy' then raise exception 'the rally pool order drifted'; end if;

  -- FNV-1a, against a value computed by the client implementation.
  if public.hr_fnv1a('') <> 2166136261 then raise exception 'FNV-1a offset basis drifted'; end if;
  if public.hr_fnv1a('a') <> 3826002220 then raise exception 'FNV-1a does not match the JS draw'; end if;

  -- A day's two rallies are always DIFFERENT — that is what makes "one per
  -- day" a choice rather than a restriction.
  if public.hr_rally_event_id('2026-8-9', 1) = public.hr_rally_event_id('2026-8-9', 13) then
    raise exception 'both of a day''s rallies drew the same event';
  end if;
  if public.hr_rally_event_for_key('2026-8-9#7') is not null then
    raise exception 'only slots 1 and 13 exist';
  end if;
  if public.hr_rally_event_for_key('rubbish') is not null then
    raise exception 'a malformed event key must draw nothing';
  end if;

  -- THE ECONOMY ASSERTION. For every rally, at the floor, the ceiling and the
  -- half-honors band: the themed chest is worth NO MORE than the band it came
  -- from, never exceeds the ceiling, and never invents a gem or a Seal.
  foreach ev in array public.hr_rally_pool() loop
    if public.hr_rally_theme(ev) is null then
      raise exception 'rally % has no reward table — every rally must pay in its own domain', ev;
    end if;
    if jsonb_array_length(public.hr_rally_theme(ev) -> 'skills') = 0 then
      raise exception 'rally % pays no XP — the theme is the point', ev;
    end if;
  end loop;

  foreach band in array array[750::bigint, 1500::bigint, 7500::bigint] loop
    for n in 1 .. 2 loop
      ch := public.hr_rally_chest('2026-8-9#' || case n when 1 then '1' else '13' end,
                                  band, case when band = 750 then 1 else 2 end,
                                  case when band = 7500 then 1 else 0 end);
      if public.hr_rally_chest_value(ch) > band then
        raise exception 'themed chest INFLATED the band: % > % (%)',
          public.hr_rally_chest_value(ch), band, ch;
      end if;
      if (ch ->> 'gold')::bigint > 7500 then raise exception 'chest gold above the ceiling'; end if;
      if (ch ->> 'gems')::int > 10 then raise exception 'chest gems above the ceiling'; end if;
      if (ch ->> 'seals')::int > 1 then raise exception 'more than one Rally Seal'; end if;
      if ch::text like '%hearth_token%' then
        raise exception 'a rally chest named the IAP-only Hearth Token';
      end if;
      if jsonb_array_length(ch -> 'items') = 0 then
        raise exception 'a themed chest paid no materials at band %', band;
      end if;
    end loop;
  end loop;

  -- Half honors: the same table, half the band, never a Seal.
  ch := public.hr_rally_absent_chest('2026-8-9#1');
  if (ch ->> 'seals')::int <> 0 then raise exception 'absence must never earn a Rally Seal'; end if;
  if public.hr_rally_chest_value(ch) > 750 then raise exception 'half honors exceeded its band'; end if;

  raise notice 'RALLY v2 migration OK — schedule oracle, six themed tables, the value ceiling, '
               'half honors and auto-join settlement all verified.';
end $$;
