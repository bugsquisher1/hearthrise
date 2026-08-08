-- ============================================================
-- Hearthrise — Supabase schema (b205, the multiplayer backbone)
--
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run. Covers everything the client code
-- already speaks to:
--   • profiles                       (identity + clan membership)
--   • chat_messages + RLS + realtime (src/chat.js + net/supabase-chat-backend.js)
--   • market_listings / market_buy_offers / buy_listing RPC
--                                    (src/market.js + net/supabase-market-backend.js)
--   • clans + clan_members + RLS     (src/features/clans.js)
--   • leaderboard view               (over game_saves.total_level)
--
-- game_saves / game_events are assumed to exist already (cloud save
-- has been live since b14x) — included here as IF NOT EXISTS so a
-- fresh project bootstraps completely from this one file.
-- ============================================================

-- ── 0. Cloud save (already live — bootstrap safety only) ──────
create table if not exists public.game_saves (
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot        int  not null default 0,
  snapshot    jsonb not null,
  saved_at    timestamptz not null default now(),
  total_level int generated always as ((snapshot->>'totalLevel')::int) stored,
  primary key (user_id, slot)
);
-- same in-place guard if game_saves pre-existed without the generated column
alter table public.game_saves add column if not exists
  total_level int generated always as ((snapshot->>'totalLevel')::int) stored;
alter table public.game_saves enable row level security;
drop policy if exists "own saves" on public.game_saves;
create policy "own saves" on public.game_saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.game_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text not null,
  payload    jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.game_events enable row level security;
drop policy if exists "own events insert" on public.game_events;
create policy "own events insert" on public.game_events
  for insert with check (auth.uid() = user_id);

-- ── 1. Profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Adventurer'
               check (length(display_name) between 2 and 24),
  clan_id      uuid,
  created_at   timestamptz not null default now()
);
-- If profiles pre-existed (older project), CREATE IF NOT EXISTS skipped the
-- new columns — add them in place.
alter table public.profiles add column if not exists display_name text not null default 'Adventurer';
alter table public.profiles add column if not exists clan_id uuid;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile write" on public.profiles;
create policy "own profile write" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ── 1b. Rebuild empty feature tables ─────────────────────────
-- Chat / market / clans / raids were never live before this schema (the
-- client backends were unwired), so any pre-existing versions of these
-- tables are empty shells from old experiments with older shapes — column
-- guards can't reconcile them all, so we rebuild them cleanly.
-- ⚠ NEVER dropped: game_saves, game_events, profiles (real player data).
drop table if exists public.chat_messages cascade;
drop table if exists public.market_listings cascade;
drop table if exists public.market_buy_offers cascade;
drop table if exists public.market_sales cascade;
drop table if exists public.clan_raids cascade;
drop table if exists public.raid_contributions cascade;
drop table if exists public.clan_members cascade;
drop table if exists public.clans cascade;

-- ── 2. Chat ───────────────────────────────────────────────────
-- Wire channels: 'global' | 'trade' | 'clan:<clanId>' | 'whisper:<a>:<b>'
-- (whisper ids are the two participant UUIDs, sorted — chat.js b205)
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null,
  from_id    uuid not null,
  from_name  text not null check (length(from_name) between 1 and 24),
  body       text not null check (length(body) between 1 and 240),
  mentions   text[] default '{}',
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx
  on public.chat_messages (channel, created_at desc);
alter table public.chat_messages enable row level security;

drop policy if exists "public channels readable" on public.chat_messages;
create policy "public channels readable" on public.chat_messages
  for select using (channel in ('global','trade'));

drop policy if exists "clan channel readable by members" on public.chat_messages;
create policy "clan channel readable by members" on public.chat_messages
  for select using (
    channel like 'clan:%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and 'clan:' || p.clan_id::text = channel
    )
  );

drop policy if exists "whispers readable by participants" on public.chat_messages;
create policy "whispers readable by participants" on public.chat_messages
  for select using (
    channel like 'whisper:%'
    and auth.uid()::text in (
      split_part(substring(channel from 9), ':', 1),
      split_part(substring(channel from 9), ':', 2)
    )
  );

drop policy if exists "signed-in users send as themselves" on public.chat_messages;
create policy "signed-in users send as themselves" on public.chat_messages
  for insert with check (
    auth.uid() = from_id
    and (
      channel in ('global','trade')
      or (channel like 'clan:%' and exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and 'clan:' || p.clan_id::text = channel))
      or (channel like 'whisper:%' and auth.uid()::text in (
            split_part(substring(channel from 9), ':', 1),
            split_part(substring(channel from 9), ':', 2)))
    )
  );

-- realtime pushes for chat
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;

-- ── 3. Market ─────────────────────────────────────────────────
create table if not exists public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    int  not null default 0,
  seller_name    text not null,
  item_id        text not null,
  qty            int  not null check (qty > 0),
  ask_each       int  not null check (ask_each > 0),
  posted_at      timestamptz not null default now()
);
create index if not exists market_listings_item_idx on public.market_listings (item_id, ask_each);
alter table public.market_listings enable row level security;
drop policy if exists "listings readable" on public.market_listings;
create policy "listings readable" on public.market_listings for select using (true);
drop policy if exists "own listings write" on public.market_listings;
create policy "own listings write" on public.market_listings
  for all using (auth.uid() = seller_user_id) with check (auth.uid() = seller_user_id);

create table if not exists public.market_buy_offers (
  id            uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  buyer_slot    int  not null default 0,
  buyer_name    text not null,
  item_id       text not null,
  qty           int  not null check (qty > 0),
  max_each      int  not null check (max_each > 0),
  escrowed      int  not null default 0,
  posted_at     timestamptz not null default now()
);
alter table public.market_buy_offers enable row level security;
drop policy if exists "offers readable" on public.market_buy_offers;
create policy "offers readable" on public.market_buy_offers for select using (true);
drop policy if exists "own offers write" on public.market_buy_offers;
create policy "own offers write" on public.market_buy_offers
  for all using (auth.uid() = buyer_user_id) with check (auth.uid() = buyer_user_id);

-- Sales ledger: every fill writes a row; the SELLER collects proceeds on
-- their next login (atomic collect via conditional update — no double-pay).
create table if not exists public.market_sales (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null,
  seller_user_id uuid not null,
  seller_name    text not null,
  buyer_user_id  uuid not null,
  buyer_name     text not null default '',
  item_id        text not null,
  qty            int  not null,
  gold_total     bigint not null,
  collected      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists market_sales_seller_idx
  on public.market_sales (seller_user_id, collected);
alter table public.market_sales enable row level security;
drop policy if exists "own sales readable" on public.market_sales;
create policy "own sales readable" on public.market_sales
  for select using (auth.uid() = seller_user_id or auth.uid() = buyer_user_id);
drop policy if exists "seller collects own sales" on public.market_sales;
create policy "seller collects own sales" on public.market_sales
  for update using (auth.uid() = seller_user_id) with check (auth.uid() = seller_user_id);

-- Atomic buy: decrement/consume the listing under row lock (two buyers can't
-- both take the last unit) AND write the sale to the ledger so the seller is
-- paid on next login. Buyer-side gold/inventory applies client-side after the
-- ok (soft-beta limitation; full server inventory authority is the next pass).
drop function if exists public.buy_listing(uuid, int);
create or replace function public.buy_listing(p_listing_id uuid, p_qty int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.market_listings;
begin
  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_qty');
  end if;
  select * into v_row from public.market_listings
    where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.seller_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;
  if v_row.qty < p_qty then return jsonb_build_object('ok', false, 'error', 'not_enough'); end if;
  if v_row.qty = p_qty then
    delete from public.market_listings where id = p_listing_id;
  else
    update public.market_listings set qty = qty - p_qty where id = p_listing_id;
  end if;
  insert into public.market_sales
    (listing_id, seller_user_id, seller_name, buyer_user_id, item_id, qty, gold_total)
  values
    (p_listing_id, v_row.seller_user_id, v_row.seller_name, auth.uid(),
     v_row.item_id, p_qty, (p_qty::bigint * v_row.ask_each));
  return jsonb_build_object('ok', true, 'item_id', v_row.item_id,
    'qty', p_qty, 'ask_each', v_row.ask_each,
    'seller_user_id', v_row.seller_user_id, 'seller_name', v_row.seller_name);
end $$;
grant execute on function public.buy_listing(uuid, int) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.market_listings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.market_buy_offers;
exception when duplicate_object then null; end $$;

-- ── 4. Clans ──────────────────────────────────────────────────
create table if not exists public.clans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(name) between 3 and 24),
  created_by  uuid not null references auth.users(id),
  level       int  not null default 1,
  treasury    bigint not null default 0,
  upgrades    jsonb not null default '{}'::jsonb,
  castle_tier int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.clans enable row level security;
drop policy if exists "clans readable" on public.clans;
create policy "clans readable" on public.clans for select using (true);
drop policy if exists "clans creatable" on public.clans;
create policy "clans creatable" on public.clans
  for insert with check (auth.uid() = created_by);

create table if not exists public.clan_members (
  clan_id     uuid not null references public.clans(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('leader','officer','member')),
  contributed bigint not null default 0,
  joined_at   timestamptz not null default now(),
  primary key (clan_id, user_id)
);
create index if not exists clan_members_user_idx on public.clan_members (user_id);
alter table public.clan_members enable row level security;
drop policy if exists "memberships readable" on public.clan_members;
create policy "memberships readable" on public.clan_members for select using (true);
drop policy if exists "join as self" on public.clan_members;
create policy "join as self" on public.clan_members
  for insert with check (auth.uid() = user_id);
drop policy if exists "leave as self" on public.clan_members;
create policy "leave as self" on public.clan_members
  for delete using (auth.uid() = user_id);

-- Contribute gold to the clan treasury + auto-level the clan.
-- Clan level thresholds: 10k, 50k, 200k, 800k, 3M … (×4 per level)
drop function if exists public.clan_contribute(uuid, bigint);
create or replace function public.clan_contribute(p_clan_id uuid, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_treasury bigint; v_level int; v_next bigint;
begin
  if p_amount <= 0 or p_amount > 10000000 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if not exists (select 1 from public.clan_members
                 where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  update public.clans set treasury = treasury + p_amount
    where id = p_clan_id returning treasury, level into v_treasury, v_level;
  update public.clan_members set contributed = contributed + p_amount
    where clan_id = p_clan_id and user_id = auth.uid();
  v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  while v_treasury >= v_next and v_level < 10 loop
    v_level := v_level + 1;
    update public.clans set level = v_level where id = p_clan_id;
    v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  end loop;
  return jsonb_build_object('ok', true, 'treasury', v_treasury, 'level', v_level);
end $$;
grant execute on function public.clan_contribute(uuid, bigint) to authenticated;

-- keep profiles.clan_id in sync with membership
create or replace function public.sync_profile_clan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set clan_id = new.clan_id where id = new.user_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.profiles set clan_id = null where id = old.user_id;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists clan_membership_sync on public.clan_members;
create trigger clan_membership_sync
  after insert or delete on public.clan_members
  for each row execute function public.sync_profile_clan();

-- ── 4b. Clan raids (b209, SYS-6 · hardened 2026-08-08, Wave 1b) ──
-- Asynchronous cooperative raids: one shared boss HP pool per clan per
-- week; every member's strikes decrement it atomically; when it hits 0,
-- every contributor may claim the reward chest exactly once.
--
-- Everything below §4b mirrors supabase/migrations/2026-08-08-raid-hardening.sql
-- — the two files MUST agree. Read that file's header for the four exploits
-- this shape exists to close (unlimited strikes, chest-hopping, solo claim
-- replay, client-declared pool size).

-- Shared UTC clock helpers. These MUST agree byte-for-byte with
-- src/features/world-events.js (HearthriseWorldEvents.utcDayKey/utcWeekKey),
-- because the client compares the keys the server returns against its own:
--   utcDayKey  → UNPADDED 'YYYY-M-D'   (e.g. '2026-8-8')
--   utcWeekKey → 'w' + floor(days-since-epoch / 7)
create or replace function public.hr_utc_day_key(p_at timestamptz default now())
returns text language sql stable as $$
  select to_char((p_at at time zone 'utc')::date, 'FMYYYY-FMMM-FMDD')
$$;

create or replace function public.hr_utc_week_key(p_at timestamptz default now())
returns text language sql stable as $$
  select 'w' || ((((p_at at time zone 'utc')::date - date '1970-01-01') / 7))::text
$$;

create table if not exists public.clan_raids (
  clan_id      uuid not null references public.clans(id) on delete cascade,
  week_key     text not null,
  boss_id      text not null,
  hp_remaining bigint not null,
  max_hp       bigint not null,
  downed_at    timestamptz,
  primary key (clan_id, week_key)
);
alter table public.clan_raids enable row level security;
drop policy if exists "raids readable" on public.clan_raids;
create policy "raids readable" on public.clan_raids for select using (true);

create table if not exists public.raid_contributions (
  clan_id         uuid not null,
  week_key        text not null,
  user_id         uuid not null,
  damage          bigint not null default 0,
  strikes         int not null default 0,
  last_strike_day text,
  first_strike_at timestamptz,
  claimed         boolean not null default false,
  claimed_at      timestamptz,
  primary key (clan_id, week_key, user_id)
);
-- guarded ALTERs for a database created before the 2026-08-08 hardening
alter table public.raid_contributions add column if not exists strikes         int not null default 0;
alter table public.raid_contributions add column if not exists last_strike_day text;
alter table public.raid_contributions add column if not exists first_strike_at timestamptz;
alter table public.raid_contributions add column if not exists claimed_at      timestamptz;
update public.raid_contributions set strikes = 1 where strikes = 0 and damage > 0;
alter table public.raid_contributions enable row level security;
drop policy if exists "contributions readable" on public.raid_contributions;
create policy "contributions readable" on public.raid_contributions for select using (true);
-- NO client UPDATE policy, deliberately. The old "own contribution claim"
-- policy was how the chest was claimed — which let a tampered client both
-- award itself a chest it hadn't earned and forge the `damage` figure the
-- Wave-3 reward bands will read. Claims go through public.raid_claim() only.
drop policy if exists "own contribution claim" on public.raid_contributions;

-- The claim ledger: ONE row per player per UTC week, across BOTH scopes.
-- The primary key IS the anti-chest-hop rule — it does not matter how many
-- clans you join or how many pools you touch, you take one chest per week.
-- Deliberately NO foreign keys to clans/clan_raids: §1b rebuilds those with
-- `drop … cascade` and this ledger must survive that. NEVER drop this table.
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
-- No insert/update/delete policy on purpose: raid_claim() is the only writer.

-- One strike: gates on the SERVER's UTC day, creates the week's raid row if
-- absent at the SERVER's pool size, clamps damage, decrements the shared pool,
-- records the contribution. Nothing about the rate limit, the week or the pool
-- size is client-supplied — p_week is validated rather than trusted and
-- p_max_hp is accepted for signature compatibility and ignored.
create or replace function public.raid_strike(
  p_clan_id uuid, p_week text, p_boss text, p_max_hp bigint, p_damage bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_pool_hp constant bigint := 250000;   -- b209 value, unchanged (hardening, not balance)
  c_clamp   constant bigint := 50000;    -- b209 per-strike clamp, unchanged
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
  -- Without this a tampered client would invent a fresh week key per request
  -- and get a fresh day gate with it, defeating the whole fix.
  if p_week is distinct from v_week then
    return jsonb_build_object('ok', false, 'error', 'week_mismatch',
                              'week', v_week, 'day', v_day);
  end if;

  v_dmg := least(p_damage, c_clamp);

  -- THE DAY GATE. The upsert is itself the lock: on conflict Postgres takes a
  -- row lock before evaluating the WHERE, so two concurrent same-day strikes
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

-- The only way a raid chest is ever awarded. Minimal rule (Wave 3 replaces the
-- flat scale with contribution bands):
--   clan: this clan's pool for this week is at 0, you have ≥1 recorded strike
--         on it, you were a member BEFORE the killing blow, and you have not
--         already claimed a chest this week.
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
  -- An unvalidated week key would let a client replay last week's chest.
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
    if v_joined > v_downed then                       -- turning up after the kill earns nothing
      return jsonb_build_object('ok', false, 'error', 'joined_after_kill');
    end if;
    select strikes, damage into v_strikes, v_damage
      from public.raid_contributions
      where clan_id = p_clan_id and week_key = v_week and user_id = auth.uid();
    if coalesce(v_strikes, 0) < 1 and coalesce(v_damage, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'no_contribution');
    end if;
    v_scale := 1.0;
  else
    v_scale := 0.4;   -- solo pays less; joining a clan is the social pull
    v_boss  := null;
  end if;

  -- One chest per player per week, whatever the scope. The primary key does
  -- the work, so this is race-safe without an advisory lock.
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

-- ── 5. Leaderboards ───────────────────────────────────────────
-- game_saves.total_level is a generated column the client already uploads.
create or replace view public.leaderboard as
  select gs.user_id,
         coalesce(p.display_name, gs.snapshot->>'playerName', 'Adventurer') as name,
         gs.total_level,
         (gs.snapshot->>'combatLevel')::int as combat_level,
         coalesce((gs.snapshot->>'gold')::bigint, 0) as gold,
         p.clan_id,
         c.name as clan_name,
         gs.saved_at
  from public.game_saves gs
  left join public.profiles p on p.id = gs.user_id
  left join public.clans c on c.id = p.clan_id
  where gs.slot = 0
  order by gs.total_level desc nulls last;
grant select on public.leaderboard to anon, authenticated;

create or replace view public.clan_leaderboard as
  select c.id, c.name, c.level, c.treasury, c.castle_tier,
         count(m.user_id) as members
  from public.clans c
  left join public.clan_members m on m.clan_id = c.id
  group by c.id
  order by c.level desc, c.treasury desc;
grant select on public.clan_leaderboard to anon, authenticated;
