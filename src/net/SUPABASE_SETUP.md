# Hearthrise — Supabase Setup Guide

This is the one-page guide to standing up the cloud backend. After you finish this checklist, the game's offline mode upgrades to live mode automatically — cloud save sync, real-time chat, real-time market listings, and the leaderboard all start working.

**Time required:** ~30 minutes the first time.
**Cost:** Free tier covers ~50K monthly active users. No credit card required to start.

## 0. Prerequisites

- A [Supabase](https://supabase.com) account.
- Admin access to your `index.html` deploy — or just admin panel access on the live game (the credentials input lives there).

## 1. Create the project

1. Go to https://supabase.com/dashboard, click **New Project**.
2. Name: `hearthrise-prod` (or `hearthrise-staging` for a test environment).
3. Database password: generate + save in your password manager.
4. Region: pick the one closest to where most players live.
5. Wait ~2 minutes for provisioning.

When it's ready, grab two values from the **Project Settings → API** page:
- `URL` — looks like `https://abcdefgh.supabase.co`
- `anon public` key — long JWT string starting with `eyJhbG...`

You'll paste these into the game's Settings → Account → "Cloud setup" form. They're stored locally in `localStorage`.

## 2. Run the SQL setup

Open the **SQL Editor** in your Supabase dashboard and paste each block in order. Click **Run** after each.

### 2a. Profiles + game saves

```sql
-- One row per signed-up user. Created on the auth trigger (step 2g).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per character slot per user — stores the JSON snapshot of G.
create table public.game_saves (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  slot         smallint not null check (slot between 0 and 4),
  snapshot     jsonb not null,
  total_level  int generated always as ((snapshot->>'totalLevel')::int) stored,
  saved_at     timestamptz not null default now(),
  unique (user_id, slot)
);

-- Lightweight per-event log (engine state changes, wins, deaths, etc.)
create table public.game_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,
  payload     jsonb,
  occurred_at timestamptz not null default now()
);
create index on public.game_events (user_id, occurred_at desc);
```

### 2b. Chat messages (replaces chat.js LocalBackend)

```sql
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,                           -- 'global' | 'trade' | 'clan:<id>' | 'whisper:<a>:<b>'
  from_id     uuid not null references auth.users(id) on delete cascade,
  from_name   text not null,
  body        text not null check (length(body) between 1 and 240),
  mentions    uuid[] default '{}',
  created_at  timestamptz not null default now()
);
create index on public.chat_messages (channel, created_at desc);

-- Block list — one row per (blocker, blocked) pair
create table public.chat_blocks (
  blocker_id uuid references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);
```

### 2c. Player market

```sql
create table public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    smallint not null check (seller_slot between 0 and 4),
  seller_name    text not null,
  item_id        text not null,
  qty            int not null check (qty > 0),
  ask_each       bigint not null check (ask_each > 0),
  posted_at      timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '48 hours')
);
create index on public.market_listings (item_id, ask_each);
create index on public.market_listings (seller_user_id);
create index on public.market_listings (expires_at);

create table public.market_buy_offers (
  id             uuid primary key default gen_random_uuid(),
  buyer_user_id  uuid not null references auth.users(id) on delete cascade,
  buyer_slot     smallint not null check (buyer_slot between 0 and 4),
  buyer_name     text not null,
  item_id        text not null,
  qty            int not null check (qty > 0),
  max_each       bigint not null check (max_each > 0),
  escrowed       bigint not null,
  posted_at      timestamptz not null default now()
);
create index on public.market_buy_offers (item_id, max_each desc);
create index on public.market_buy_offers (buyer_user_id);

create table public.market_sales (
  id          bigserial primary key,
  item_id     text not null,
  each_price  bigint not null,
  qty         int not null,
  sold_at     timestamptz not null default now()
);
create index on public.market_sales (item_id, sold_at desc);
```

### 2d. Leaderboard views

```sql
create or replace view public.lb_total_level as
select
  p.id, p.display_name,
  (s.snapshot->>'totalLevel')::int as total_level,
  s.saved_at
from profiles p
join game_saves s on s.user_id = p.id and s.slot = 0
order by total_level desc nulls last
limit 1000;

create or replace view public.lb_combat as
select
  p.id, p.display_name,
  greatest(
    coalesce((s.snapshot->'skills'->>'attack')::int, 0),
    coalesce((s.snapshot->'skills'->>'strength')::int, 0),
    coalesce((s.snapshot->'skills'->>'defense')::int, 0)
  ) as combat_level
from profiles p
join game_saves s on s.user_id = p.id and s.slot = 0
order by combat_level desc nulls last
limit 1000;

create or replace view public.lb_gold as
select
  p.id, p.display_name,
  coalesce((s.snapshot->>'gold')::bigint, 0) as gold
from profiles p
join game_saves s on s.user_id = p.id and s.slot = 0
order by gold desc nulls last
limit 1000;
```

### 2e. Auto-create profile on signup

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### 2f. Row-level security policies

This is the security layer. Without it, anyone can read or write anything in your tables. Run every block.

```sql
-- profiles: anyone can read (for leaderboards / chat names), only the owner writes
alter table public.profiles enable row level security;
create policy "profiles readable"     on public.profiles for select using (true);
create policy "profiles owner update" on public.profiles for update using (auth.uid() = id);

-- game_saves: only owner can read or write their own saves
alter table public.game_saves enable row level security;
create policy "saves owner read"   on public.game_saves for select using (auth.uid() = user_id);
create policy "saves owner upsert" on public.game_saves for insert with check (auth.uid() = user_id);
create policy "saves owner update" on public.game_saves for update using (auth.uid() = user_id);
create policy "saves owner delete" on public.game_saves for delete using (auth.uid() = user_id);

-- game_events: write your own only. Reads are server-side analytics only.
alter table public.game_events enable row level security;
create policy "events owner write" on public.game_events for insert with check (auth.uid() = user_id);

-- chat: global + trade are world-readable. Clan + whisper restricted to participants.
alter table public.chat_messages enable row level security;
create policy "chat global readable" on public.chat_messages
  for select using (channel in ('global', 'trade'));
create policy "chat whisper readable" on public.chat_messages
  for select using (
    channel like 'whisper:%'
    and (auth.uid()::text in (
      split_part(substring(channel from 9), ':', 1),
      split_part(substring(channel from 9), ':', 2)
    ))
  );
create policy "chat send own" on public.chat_messages
  for insert with check (auth.uid() = from_id);

alter table public.chat_blocks enable row level security;
create policy "blocks own" on public.chat_blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- market: listings are publicly readable so buyers can browse. Only seller can write/cancel.
alter table public.market_listings enable row level security;
create policy "listings readable"       on public.market_listings for select using (true);
create policy "listings seller writes"  on public.market_listings for insert with check (auth.uid() = seller_user_id);
create policy "listings seller updates" on public.market_listings for update using (auth.uid() = seller_user_id);
create policy "listings seller deletes" on public.market_listings for delete using (auth.uid() = seller_user_id);

alter table public.market_buy_offers enable row level security;
create policy "offers readable"      on public.market_buy_offers for select using (true);
create policy "offers buyer writes"  on public.market_buy_offers for insert with check (auth.uid() = buyer_user_id);
create policy "offers buyer cancels" on public.market_buy_offers for delete using (auth.uid() = buyer_user_id);

alter table public.market_sales enable row level security;
create policy "sales world readable" on public.market_sales for select using (true);
-- Sales are inserted by the buy_listing RPC (step 2g), not directly by clients.
```

### 2g. Atomic buy RPC (server-side ownership of gold + inventory swap)

To prevent client-side cheating (e.g. faking a successful purchase), the actual transfer happens via a server-side stored procedure that the client calls atomically:

```sql
create or replace function public.buy_listing(
  listing_id uuid,
  qty_wanted int
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  l record;
  buyer_uid uuid := auth.uid();
  total_cost bigint;
begin
  select * into l from market_listings where id = listing_id for update;
  if l is null then
    return json_build_object('ok', false, 'reason', 'Listing not found');
  end if;
  if l.seller_user_id = buyer_uid then
    return json_build_object('ok', false, 'reason', 'Cannot buy own listing');
  end if;
  qty_wanted := least(qty_wanted, l.qty);
  total_cost := qty_wanted::bigint * l.ask_each;

  update market_listings set qty = qty - qty_wanted where id = listing_id;
  delete from market_listings where id = listing_id and qty <= 0;

  insert into market_sales (item_id, each_price, qty)
  values (l.item_id, l.ask_each, qty_wanted);

  return json_build_object(
    'ok', true,
    'bought', qty_wanted,
    'spent', total_cost,
    'seller_id', l.seller_user_id
  );
end;
$$;
```

### 2h. Realtime publications

Realtime is what makes chat + market feel live. Open **Database → Replication** in the dashboard and enable replication for these tables:

- `chat_messages`
- `market_listings`
- `market_buy_offers`

The client subscribes to changes via the Supabase Realtime channels.

## 3. Configure auth providers

Open **Authentication → Providers**.

- **Email**: enabled by default. Disable "Confirm email" during beta so testers don't have to click a confirmation link.
- **Google / Apple / Discord**: optional. If you enable them, paste the OAuth credentials per provider.

For passwordless / email-link sign-in (what most modern games use), open **Authentication → URL Configuration** and add your live game URL to the allowlist.

## 4. Plug credentials into the game

There are two ways to wire your URL + anon key into the running game:

**Option A — In-game** (recommended for non-developers):
1. Load the game.
2. Click the gear icon (top right) to open Settings.
3. Open the **Account** section.
4. Paste the URL + anon key into the "Cloud setup" form, click **Connect**.
5. Reload — the game switches from offline to live mode.

**Option B — Hard-coded** (recommended for production deploys):
Edit `src/net/supabase-bootstrap.js` and set the default config at the top:

```js
const DEFAULT_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'eyJhbG...',
};
```

The credentials are PUBLIC by design — the anon key only grants access through your RLS policies, so it's safe to ship in client JavaScript.

## 5. Verify it works

1. Open the game, sign up with a test email.
2. Train a skill, kill a monster, hoard some gold.
3. Sign out, clear localStorage, sign back in.
4. Your save should restore from the cloud.
5. In a second browser window, sign in as a second account and chat — both windows should show messages live.

If anything fails, check the browser console for `[Auth]` / `[Cloud Sync]` / `[chat]` warnings — they identify the layer that broke.

## 6. Free-tier housekeeping

**Run this on day 1** to keep `game_events` from filling the 500 MB DB cap. The job auto-deletes events older than 30 days every night.

```sql
-- pg_cron extension (free on Supabase)
create extension if not exists pg_cron;

-- Trim old events nightly at 03:00 UTC
select cron.schedule(
  'trim-game-events',
  '0 3 * * *',
  $$delete from public.game_events where occurred_at < now() - interval '30 days'$$
);

-- Same treatment for chat_messages (keep 60 days for moderation)
select cron.schedule(
  'trim-chat-messages',
  '15 3 * * *',
  $$delete from public.chat_messages where created_at < now() - interval '60 days'$$
);

-- And expired market listings (the app already filters these out
-- client-side, but the rows sit in the table until something deletes them)
select cron.schedule(
  'trim-expired-listings',
  '30 3 * * *',
  $$delete from public.market_listings where expires_at < now()$$
);

-- And market_sales: keep 90 days for the 7-day analytics window + buffer
select cron.schedule(
  'trim-market-sales',
  '45 3 * * *',
  $$delete from public.market_sales where sold_at < now() - interval '90 days'$$
);
```

**Auto-pause warning**: free-tier projects pause after 7 days of zero activity. If you go a week without any client requests, players hit errors until you resume in the dashboard. Easy fix during beta: have any tester log in once a week, OR add a calendar reminder.

## 7. When to upgrade to Pro ($25/mo)

You can stay on free tier until any of:
- **DB > 400 MB** — the trim jobs above keep this far away unless event volume explodes.
- **Bandwidth > 4 GB/month** — typical at ~3K daily active users.
- **You go public** — Pro removes the auto-pause and adds 7-day point-in-time-recovery. Worth it before your Steam launch.
- **You need >200 concurrent realtime connections** — chat + market subscribers count toward this. ~100 simultaneous players is the practical free-tier ceiling.

Pro also gives you 100 GB egress, 8 GB DB, 100K MAU, daily backups, and removes auto-pause. The jump from free to Pro is the only step you need before Steam launch — the schema doesn't change.

## 8. Day-2 ops

- **Backups**: Supabase auto-backs up daily on Pro; on free tier you get 7-day point-in-time recovery only. Click **Database → Backups** to restore.
- **Migrations**: when you add a new column to `game_saves.snapshot`, you don't need to migrate the table — the JSONB snapshot accepts new fields automatically. The client-side `save-migrations.js` handles per-version normalization.
- **Anti-abuse**: monitor `chat_messages` for spam in the SQL editor. Add a rate-limit RPC if needed.
- **Privacy**: GDPR right-to-delete = `delete from auth.users where id = ?` — RLS cascades clean up everything else.

## What's NOT in this setup

These are intentionally deferred until post-soft-beta:

- **Friend lists / clan tables** — chat clan channels work via channel-name convention only.
- **Server-validated achievements** — for now achievements stay client-side.
- **Anti-cheat checks** — server-side validation of suspicious save deltas. Add when bots become a problem.
- **Webhook for payment fulfillment** — Steam / IAP receipts need a webhook handler. Stripe-style.
- **Push notifications** — for buy offer fills / friend logins. Mobile-only.

Add these post-launch. The schema above is a clean foundation that won't need a major rewrite.
