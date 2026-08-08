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

-- ── 4b. Clan raids (b209, SYS-6) ──────────────────────────────
-- Asynchronous cooperative raids: one shared boss HP pool per clan per
-- week; every member's strikes decrement it atomically; when it hits 0,
-- every contributor may claim the reward chest exactly once.
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
  clan_id  uuid not null,
  week_key text not null,
  user_id  uuid not null,
  damage   bigint not null default 0,
  claimed  boolean not null default false,
  primary key (clan_id, week_key, user_id)
);
alter table public.raid_contributions enable row level security;
drop policy if exists "contributions readable" on public.raid_contributions;
create policy "contributions readable" on public.raid_contributions for select using (true);
drop policy if exists "own contribution claim" on public.raid_contributions;
create policy "own contribution claim" on public.raid_contributions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One strike: creates the week's raid row if absent, clamps damage,
-- decrements the shared pool, records the contribution. Server clamps
-- p_damage hard so a tampered client can't one-shot the boss.
create or replace function public.raid_strike(
  p_clan_id uuid, p_week text, p_boss text, p_max_hp bigint, p_damage bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hp bigint; v_downed timestamptz;
begin
  if p_damage is null or p_damage <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_damage');
  end if;
  if not exists (select 1 from public.clan_members
                 where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  p_damage := least(p_damage, 50000);                    -- hard server clamp per strike
  insert into public.clan_raids (clan_id, week_key, boss_id, hp_remaining, max_hp)
    values (p_clan_id, p_week, p_boss, p_max_hp, p_max_hp)
    on conflict (clan_id, week_key) do nothing;
  update public.clan_raids
    set hp_remaining = greatest(0, hp_remaining - p_damage),
        downed_at = case when hp_remaining - p_damage <= 0 and downed_at is null
                         then now() else downed_at end
    where clan_id = p_clan_id and week_key = p_week
    returning hp_remaining, downed_at into v_hp, v_downed;
  insert into public.raid_contributions (clan_id, week_key, user_id, damage)
    values (p_clan_id, p_week, auth.uid(), p_damage)
    on conflict (clan_id, week_key, user_id)
    do update set damage = public.raid_contributions.damage + excluded.damage;
  return jsonb_build_object('ok', true, 'hp_remaining', v_hp, 'downed', v_downed is not null);
end $$;
grant execute on function public.raid_strike(uuid, text, text, bigint, bigint) to authenticated;

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
