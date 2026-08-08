-- ============================================================
-- Hearthrise — migration 2026-08-08 · RAID HARDENING (Wave 1b)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. Additive only — no table is dropped and no
-- balance number is changed. This migration closes four live exploits in
-- the raid economy by moving the rules the client was trusted with onto
-- the server.
--
--   P1  unlimited strikes  — the 1/UTC-day limit lived only in
--                            G.raids.lastStrikeDay (raids.js). raid_strike
--                            had no day check at all.
--   P2  chest-hopping      — claim() paid the FULL chest to anyone holding a
--                            contribution row, and clan_members join/leave is
--                            open: join a near-dead pool → strike → claim →
--                            leave → repeat across clans.
--   P3  solo claim replay  — the solo claim flag was save-local only.
--   P4  pool forgery       — found while writing this: raid_strike took the
--        (new)              pool size from the CLIENT (p_max_hp). The first
--                           striker of the week could declare a 1-HP boss and
--                           down it instantly for the whole clan.
--
-- The three rules that close them:
--   1. The server derives the UTC day/week keys itself and gates the strike
--      on them. Nothing about the rate limit is client-supplied any more.
--   2. Chests are handed out by public.raid_claim() only, and public.raid_claims
--      is a ONE-ROW-PER-PLAYER-PER-WEEK ledger. Direct client UPDATE of
--      raid_contributions is revoked.
--   3. The clan pool size is a server constant, not a parameter.
--
-- COMPATIBILITY — read before running:
--   • raid_strike keeps its EXACT signature (uuid, text, text, bigint, bigint).
--     p_max_hp is now accepted-and-ignored, p_week is validated rather than
--     trusted. A client built before this migration keeps working; it just
--     starts receiving {"ok":false,"error":"already_struck_today"} where it
--     used to be allowed through, and renders its generic failure toast.
--   • public.raid_claim() is NEW. A client built before this migration never
--     calls it. A client built after it feature-detects it (404 → falls back
--     to the legacy PATCH), so the CLIENT MAY SHIP BEFORE THIS MIGRATION.
--   • The legacy claim path (a client PATCH of raid_contributions.claimed) is
--     revoked here. Per the designer's audit no clan pool has ever been downed
--     in production, so no in-flight claim can be stranded by this.
--     → Ship the b219 client FIRST, then run this file.
-- ============================================================

-- ── 0. Preflight ──────────────────────────────────────────────
do $$ begin
  if to_regclass('public.clan_raids') is null
     or to_regclass('public.raid_contributions') is null then
    raise exception 'clan_raids / raid_contributions are missing — run supabase/schema.sql first, then this migration';
  end if;
end $$;

-- ── 0b. Shared UTC clock helpers ──────────────────────────────
-- These MUST agree byte-for-byte with src/features/world-events.js
-- (HearthriseWorldEvents.utcDayKey / utcWeekKey), because the client compares
-- the keys the server returns against its own:
--   utcDayKey  → getUTCFullYear() + '-' + (getUTCMonth()+1) + '-' + getUTCDate()
--                i.e. UNPADDED: '2026-8-8'
--   utcWeekKey → 'w' + floor(Date.UTC(y,m,d) / 86400000 / 7)
--                i.e. 'w' + floor(days-since-epoch / 7)
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;

create or replace function public.hr_utc_week_key(p_at timestamptz default now())
returns text language sql stable as $$
  select 'w' || ((((p_at at time zone 'utc')::date - date '1970-01-01') / 7))::text
$$;

-- ── 1. Contribution ledger gains a strike counter ─────────────
-- damage alone cannot answer "did you actually turn up?", which is what both
-- the day gate and the claim gate need. Guarded ALTERs: the table may or may
-- not already have these.
alter table public.raid_contributions add column if not exists strikes         int not null default 0;
alter table public.raid_contributions add column if not exists last_strike_day text;
alter table public.raid_contributions add column if not exists first_strike_at timestamptz;
alter table public.raid_contributions add column if not exists claimed_at      timestamptz;

-- Backfill rows written before this migration: a row only exists because the
-- player struck, so damage > 0 implies at least one strike.
update public.raid_contributions set strikes = 1 where strikes = 0 and damage > 0;

-- ── 2. The claim ledger (closes P2 + P3) ──────────────────────
-- ONE row per player per UTC week, across BOTH scopes. The primary key is the
-- anti-chest-hop rule: it does not matter how many clans you join or how many
-- pools you touch — you take exactly one raid chest per week.
-- Deliberately NO foreign keys to clans/clan_raids: schema.sql rebuilds those
-- tables with `drop … cascade`, and this ledger must survive that.
create table if not exists public.raid_claims (
  user_id    uuid not null,
  week_key   text not null,
  scope      text not null check (scope in ('clan','solo')),
  clan_id    uuid,
  boss_id    text,
  scale      numeric not null default 1.0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_key)
);
alter table public.raid_claims enable row level security;
drop policy if exists "own claims readable" on public.raid_claims;
create policy "own claims readable" on public.raid_claims
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy on purpose: public.raid_claim() is security
-- definer and is the only writer.

-- ── 3. Revoke the client's direct write on the contribution ledger ──
-- The old policy let any signed-in player PATCH their own row — which is how
-- the chest was claimed, and which also let a tampered client write any
-- `damage` it liked into the ledger the Wave-3 reward bands will read.
-- Claims now go through public.raid_claim() only.
drop policy if exists "own contribution claim" on public.raid_contributions;

-- clan_raids already has no client INSERT/UPDATE policy — assert that here so a
-- future edit can't quietly reopen it.
drop policy if exists "raids writable" on public.clan_raids;
drop policy if exists "raids readable" on public.clan_raids;
create policy "raids readable" on public.clan_raids for select using (true);

-- ── 4. raid_strike — the server owns the day, the week and the pool ──
-- SIGNATURE UNCHANGED so pre-migration clients keep working.
create or replace function public.raid_strike(
  p_clan_id uuid, p_week text, p_boss text, p_max_hp bigint, p_damage bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- b209 values, carried over verbatim. This is hardening, not balance:
  -- the pool used to be whatever the FIRST striker's client claimed it was.
  c_pool_hp constant bigint := 250000;
  c_clamp   constant bigint := 50000;
  v_week text := public.hr_utc_week_key();
  v_day  text := public.hr_utc_day_key();
  v_dmg  bigint;
  v_hp   bigint;
  v_downed timestamptz;
  v_rows int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_damage is null or p_damage <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_damage');
  end if;
  if not exists (select 1 from public.clan_members
                 where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  -- p_week is REPORTED by the client, never trusted. Without this a tampered
  -- client would simply invent a fresh week key per request and get a fresh
  -- day gate with it — which would defeat the whole fix.
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'error', 'week_mismatch',
                              'week', v_week, 'day', v_day);
  end if;

  v_dmg := least(p_damage, c_clamp);

  -- ── THE DAY GATE (P1) ──────────────────────────────────────
  -- The upsert is itself the lock: on conflict Postgres takes a row lock
  -- before evaluating the WHERE, so two concurrent strikes on the same day
  -- cannot both pass. row_count = 0 means "already struck today".
  insert into public.raid_contributions
      (clan_id, week_key, user_id, damage, strikes, last_strike_day, first_strike_at)
  values (p_clan_id, v_week, auth.uid(), v_dmg, 1, v_day, now())
  on conflict (clan_id, week_key, user_id) do update
     set damage          = public.raid_contributions.damage + excluded.damage,
         strikes         = public.raid_contributions.strikes + 1,
         last_strike_day = excluded.last_strike_day,
         first_strike_at = coalesce(public.raid_contributions.first_strike_at,
                                    excluded.first_strike_at)
   where public.raid_contributions.last_strike_day is distinct from excluded.last_strike_day;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    select hp_remaining, downed_at into v_hp, v_downed
      from public.clan_raids where clan_id = p_clan_id and week_key = v_week;
    return jsonb_build_object('ok', false, 'error', 'already_struck_today',
      'day', v_day, 'week', v_week, 'max_hp', c_pool_hp,
      'hp_remaining', coalesce(v_hp, c_pool_hp), 'downed', v_downed is not null);
  end if;

  -- ── The pool (P4) ──────────────────────────────────────────
  -- p_max_hp is accepted for signature compatibility and DELIBERATELY IGNORED.
  insert into public.clan_raids (clan_id, week_key, boss_id, hp_remaining, max_hp)
    values (p_clan_id, v_week, left(coalesce(p_boss, 'unknown'), 64), c_pool_hp, c_pool_hp)
    on conflict (clan_id, week_key) do nothing;
  update public.clan_raids
    set hp_remaining = greatest(0, hp_remaining - v_dmg),
        downed_at = case when hp_remaining - v_dmg <= 0 and downed_at is null
                         then now() else downed_at end
    where clan_id = p_clan_id and week_key = v_week
    returning hp_remaining, downed_at into v_hp, v_downed;

  return jsonb_build_object('ok', true, 'hp_remaining', v_hp,
    'downed', v_downed is not null, 'damage', v_dmg,
    'day', v_day, 'week', v_week, 'max_hp', c_pool_hp);
end $$;
grant execute on function public.raid_strike(uuid, text, text, bigint, bigint) to authenticated;

-- ── 5. raid_claim — the only way a chest is ever awarded ──────
-- Minimal correct rule (Wave 3 replaces the flat scale with contribution
-- bands; this migration must not depend on any Wave-3 column):
--   clan: the pool for THIS clan and THIS week is at 0, you have ≥1 recorded
--         strike on it, you were a member BEFORE the killing blow, and you
--         have not already claimed a chest this week.
--   solo: you have not already claimed a chest this week.
create or replace function public.raid_claim(
  p_scope text, p_clan_id uuid, p_week text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_week   text := public.hr_utc_week_key();
  v_hp     bigint;
  v_downed timestamptz;
  v_boss   text;
  v_strikes int;
  v_damage bigint;
  v_joined timestamptz;
  v_scale  numeric;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_scope is null or p_scope not in ('clan','solo') then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
  end if;
  -- Same reasoning as raid_strike: an unvalidated week key would let a client
  -- replay last week's chest, or pre-claim next week's.
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
  end if;

  if p_scope = 'clan' then
    if p_clan_id is null then
      return jsonb_build_object('ok', false, 'error', 'bad_clan');
    end if;
    select hp_remaining, downed_at, boss_id into v_hp, v_downed, v_boss
      from public.clan_raids where clan_id = p_clan_id and week_key = v_week;
    if v_hp is null or v_hp > 0 or v_downed is null then
      return jsonb_build_object('ok', false, 'error', 'not_downed');
    end if;
    select joined_at into v_joined from public.clan_members
      where clan_id = p_clan_id and user_id = auth.uid();
    if v_joined is null then
      return jsonb_build_object('ok', false, 'error', 'not_member');
    end if;
    -- P2: turning up after the boss is already dead earns nothing.
    if v_joined > v_downed then
      return jsonb_build_object('ok', false, 'error', 'joined_after_kill');
    end if;
    select strikes, damage into v_strikes, v_damage
      from public.raid_contributions
      where clan_id = p_clan_id and week_key = v_week and user_id = auth.uid();
    -- (damage > 0 keeps rows written before this migration claimable)
    if coalesce(v_strikes, 0) < 1 and coalesce(v_damage, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'no_contribution');
    end if;
    v_scale := 1.0;
  else
    v_scale := 0.4;   -- solo pays less; joining a clan is the social pull
    v_boss  := null;
  end if;

  -- P2 + P3: one chest per player per week, whatever the scope. The primary
  -- key does the work, so this is race-safe without an advisory lock.
  insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
  values (auth.uid(), v_week, p_scope,
          case when p_scope = 'clan' then p_clan_id else null end,
          v_boss, v_scale)
  on conflict (user_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_week);
  end if;

  if p_scope = 'clan' then
    update public.raid_contributions set claimed = true, claimed_at = now()
      where clan_id = p_clan_id and week_key = v_week and user_id = auth.uid();
  end if;

  return jsonb_build_object('ok', true, 'scope', p_scope, 'week', v_week,
    'scale', v_scale, 'boss_id', coalesce(v_boss, ''));
end $$;
grant execute on function public.raid_claim(text, uuid, text) to authenticated;

-- ── 6. Sanity checks (harmless to re-run; they only read) ─────
do $$
declare v_bad int;
begin
  -- the two clock helpers must be callable and produce the shapes the client
  -- parses ('2026-8-8' / 'w2953'); fail loudly here rather than at runtime.
  if public.hr_utc_day_key() !~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    raise exception 'hr_utc_day_key produced an unexpected shape: %', public.hr_utc_day_key();
  end if;
  if public.hr_utc_week_key() !~ '^w\d+$' then
    raise exception 'hr_utc_week_key produced an unexpected shape: %', public.hr_utc_week_key();
  end if;
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'raid_contributions'
     and cmd in ('UPDATE', 'ALL');
  if v_bad > 0 then
    raise exception 'raid_contributions still has a client UPDATE policy — claims can bypass raid_claim()';
  end if;
  raise notice 'raid hardening applied: day=% week=%',
    public.hr_utc_day_key(), public.hr_utc_week_key();
end $$;
