-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — MARKET v2, REAL VALUE MOVEMENT  (foundation, file 3 of 3)
-- Companion design doc: docs/design/server-authority.md §5
-- Depends on: 2026-08-11-player-state.sql
--
-- ⚠ REVIEW ONLY — DO NOT APPLY YET. Apply on a Supabase BRANCH first.
--
-- WHY THE OLD MARKET COULD NOT BE PATCHED
--   supabase/schema.sql's market is structurally, not incidentally, broken:
--     • :169  `market_listings` policy is `for all` → the seller can PATCH qty
--             and ask_each after the listing is live.
--     • :155  INSERT has ownership only — no item allowlist, no possession
--             check, no price or quantity ceiling.
--     • :221  buy_listing arbitrates the RACE correctly (row lock, qty,
--             self-purchase, atomic sale row) but MOVES NO VALUE. The buyer's
--             gold and the seller's items are debited by the browser
--             (src/market.js :485-487). A client that skips that step buys for
--             free.
--     • :212  `market_sales` has a ROW-level UPDATE policy, so the seller can
--             PATCH `gold_total` upward before collecting.
--     • :159  `seller_name` is client free text → impersonation.
--   Every one of those is a symptom of the same root cause: the server did not
--   own the inventory or the gold, so it had nothing to move.
--
-- WHAT CHANGES NOW THAT IT DOES
--   Value moves inside the same transaction as the row lock. Three consequences
--   fall out for free, and they are the reason this file is SHORTER than the
--   hardening patch would have been:
--     1. No possession check is needed — the escrow is a real DELETE from
--        player_inventory. You cannot list what you do not have.
--     2. No `collect_sales` dance, no `collected` flag, no PATCH policy: the
--        seller is PAID DIRECTLY into player_state.gold, whether or not they
--        are online. market_sales becomes an append-only receipt.
--     3. No price cap is needed as an anti-exploit device. Gold can no longer
--        be conjured, so an absurd listing can only move gold that someone
--        actually earned. A cap may still be wanted as an anti-scam UX rail —
--        that is the Game Designer's call, not a security control, and it is
--        left out here deliberately rather than smuggled in as one.
--
-- ⚠ This file DROPS AND RECREATES market_listings / market_sales. That is only
--   safe because the beta is wiped at cutover (CLAUDE.md, "Server authority").
--   Do NOT apply it to a database whose market you intend to keep.
--   It does NOT touch game_saves, profiles, clans or any other live table.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── 1. Tables ────────────────────────────────────────────────────────────
drop table if exists public.market_listings cascade;
drop table if exists public.market_sales    cascade;

create table public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    int  not null default 0,
  -- Denormalised for the listing grid, but written by the SERVER from
  -- profiles.display_name (kept in step with the unique-name registry by
  -- 2026-08-08-unique-names.sql claim_display_name). Never accepted from a
  -- client — that was the impersonation hole.
  seller_name    text not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  ask_each       bigint not null check (ask_each > 0 and ask_each <= 1000000000),
  posted_at      timestamptz not null default now(),
  expires_at     timestamptz not null
);
create index market_listings_item_idx on public.market_listings (item_id, ask_each);
create index market_listings_seller_idx on public.market_listings (seller_user_id, seller_slot);
create index market_listings_expiry_idx on public.market_listings (expires_at);

-- Append-only receipt. No `collected` column — the seller was already paid.
create table public.market_sales (
  id             bigserial primary key,
  listing_id     uuid not null,
  seller_user_id uuid not null,
  seller_slot    int  not null,
  buyer_user_id  uuid not null,
  buyer_slot     int  not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  gold_gross     bigint not null check (gold_gross >= 0),
  tax            bigint not null check (tax >= 0),
  gold_net       bigint not null check (gold_net >= 0),
  at             timestamptz not null default now()
);
create index market_sales_item_idx   on public.market_sales (item_id, at desc);
create index market_sales_seller_idx on public.market_sales (seller_user_id, at desc);

-- ── 2. RLS: read-only to everyone, writable by nobody ────────────────────
-- Listings are public (it is a market). Sales are public too — the 7-day price
-- history in src/market.js getStats7d() is real market data and should come
-- from the real ledger rather than from each client's private localStorage,
-- which today means every player sees a different price chart.
alter table public.market_listings enable row level security;
alter table public.market_sales    enable row level security;
create policy "listings readable" on public.market_listings for select using (true);
create policy "sales readable"    on public.market_sales    for select using (true);
revoke insert, update, delete on public.market_listings from authenticated, anon;
revoke insert, update, delete on public.market_sales    from authenticated, anon;

-- ── 3. Config, tunable without a code deploy ─────────────────────────────
-- One row. `on conflict do nothing` so a re-run never clobbers a tuned value —
-- which is the difference between a migration you can re-run and one you dread.
create table if not exists public.hr_market_config (
  only_row      boolean primary key default true check (only_row),
  house_tax_bp  int    not null default 150   check (house_tax_bp between 0 and 2000), -- 1.50%, matches src/market.js HOUSE_TAX
  listing_ttl_h int    not null default 48    check (listing_ttl_h between 1 and 720),
  max_listings  int    not null default 12    check (max_listings between 1 and 500),
  max_qty       bigint not null default 1000000 check (max_qty > 0)
);
insert into public.hr_market_config (only_row) values (true) on conflict do nothing;
alter table public.hr_market_config enable row level security;
-- drop-then-create, because unlike the two tables above this one is NOT
-- recreated on a re-run and `create policy` is not idempotent.
drop policy if exists "market config readable" on public.hr_market_config;
create policy "market config readable" on public.hr_market_config for select using (true);
revoke insert, update, delete on public.hr_market_config from authenticated, anon;

-- ── 4. Helper: the display name, derived ─────────────────────────────────
create or replace function public.hr_display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Adventurer')
$$;

-- ── 5. market_list — escrow out of the REAL inventory ────────────────────
create or replace function public.market_list(
  p_slot int, p_item_id text, p_qty bigint, p_ask_each bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_slot int  := coalesce(p_slot, 0);
  v_cfg  public.hr_market_config%rowtype;
  v_have bigint;
  v_open int;
  v_id   uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_cfg from public.hr_market_config;

  if p_qty is null or p_qty <= 0 or p_qty > v_cfg.max_qty then
    return jsonb_build_object('ok', false, 'error', 'bad_qty');
  end if;
  if p_ask_each is null or p_ask_each <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_price');
  end if;

  -- The tradeable allowlist. hr_items is GENERATED from src/data/items.js, so
  -- `bop` is authored in one place and enforced here — see design doc §3.4.
  if to_regclass('public.hr_items') is not null then
    if not exists (select 1 from public.hr_items
                    where item_id = p_item_id and tradeable) then
      return jsonb_build_object('ok', false, 'error', 'not_tradeable', 'item_id', p_item_id);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  select count(*) into v_open from public.market_listings
   where seller_user_id = v_uid and seller_slot = v_slot;
  if v_open >= v_cfg.max_listings then
    return jsonb_build_object('ok', false, 'error', 'too_many_listings',
                              'limit', v_cfg.max_listings);
  end if;

  -- ESCROW. This is the possession check — there is nothing else to check.
  select qty into v_have from public.player_inventory
   where user_id = v_uid and slot = v_slot and item_id = p_item_id for update;
  if coalesce(v_have, 0) < p_qty then
    return jsonb_build_object('ok', false, 'error', 'insufficient_item',
                              'have', coalesce(v_have, 0));
  end if;
  if v_have = p_qty then
    delete from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item_id;
  else
    update public.player_inventory set qty = qty - p_qty
     where user_id = v_uid and slot = v_slot and item_id = p_item_id;
  end if;

  insert into public.market_listings
    (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each, expires_at)
  values
    (v_uid, v_slot, public.hr_display_name_of(v_uid), p_item_id, p_qty, p_ask_each,
     now() + make_interval(hours => v_cfg.listing_ttl_h))
  returning id into v_id;

  update public.player_state set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, v_slot, 'trade', 'market_list', p_item_id, p_qty,
            jsonb_build_object('ask_each', p_ask_each, 'listing', v_id));

  return jsonb_build_object('ok', true, 'listing_id', v_id);
end $$;
grant execute on function public.market_list(int, text, bigint, bigint) to authenticated;

-- ── 6. market_cancel — escrow returns ────────────────────────────────────
create or replace function public.market_cancel(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.market_listings;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.seller_user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  delete from public.market_listings where id = p_listing_id;
  insert into public.player_inventory as pi (user_id, slot, item_id, qty)
    values (v_uid, v_row.seller_slot, v_row.item_id, v_row.qty)
    on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, v_row.seller_slot, 'trade', 'market_cancel', v_row.item_id, v_row.qty,
            jsonb_build_object('listing', p_listing_id));

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.market_cancel(uuid) to authenticated;

-- ── 7. market_buy — the whole trade, in one transaction ──────────────────
-- Lock ordering matters: the LISTING is locked first, always, by every caller.
-- Two buyers racing the same listing therefore queue on the listing rather than
-- deadlocking on each other's player rows.
--
-- No advisory lock here, deliberately: this function takes `for update` on both
-- players' player_state rows, and hr_apply takes the same row lock, so a buy and
-- a concurrent collect for the same character are already serialised by Postgres.
-- Adding an advisory lock on top would introduce a second ordering to get wrong.
create or replace function public.market_buy(
  p_slot int, p_listing_id uuid, p_qty bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_row   public.market_listings;
  v_cfg   public.hr_market_config%rowtype;
  v_gross bigint; v_tax bigint; v_net bigint;
  v_gold  bigint;
  v_stacks int; v_cap int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;
  select * into v_cfg from public.hr_market_config;

  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_row.seller_user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;
  if v_row.qty < p_qty then
    return jsonb_build_object('ok', false, 'error', 'not_enough', 'available', v_row.qty);
  end if;

  v_gross := p_qty * v_row.ask_each;
  v_tax   := (v_gross * v_cfg.house_tax_bp) / 10000;     -- the gold sink
  v_net   := v_gross - v_tax;

  -- BUYER: funds. The check the old buy_listing never made, because it had
  -- nothing authoritative to check against.
  select gold, bank_cap into v_gold, v_cap from public.player_state
   where user_id = v_uid and slot = v_slot for update;
  if v_gold is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_gold < v_gross then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
                              'have', v_gold, 'need', v_gross);
  end if;

  -- BUYER: debit + deliver.
  update public.player_state set gold = gold - v_gross, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  insert into public.player_inventory as pi (user_id, slot, item_id, qty)
    values (v_uid, v_slot, v_row.item_id, p_qty)
    on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

  select count(*) into v_stacks from public.player_inventory where user_id = v_uid and slot = v_slot;
  if v_stacks > v_cap then
    -- Raise rather than return: this must roll back the debit and the delivery
    -- together, and a returned jsonb would leave both applied.
    -- errcode is a private signal to this function's own handler; nothing else
    -- in the body can raise 'HR001', so the handler cannot swallow an unrelated
    -- constraint violation and mislabel it "bank_full".
    raise exception 'bank_full' using errcode = 'HR001';
  end if;

  -- SELLER: paid now, online or not. No collect step, so no collect exploit.
  update public.player_state set gold = gold + v_net, version = version + 1, updated_at = now()
   where user_id = v_row.seller_user_id and slot = v_row.seller_slot;

  -- LISTING: consume under the lock we already hold.
  if v_row.qty = p_qty then
    delete from public.market_listings where id = p_listing_id;
  else
    update public.market_listings set qty = qty - p_qty where id = p_listing_id;
  end if;

  insert into public.market_sales
    (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot,
     item_id, qty, gold_gross, tax, gold_net)
  values
    (p_listing_id, v_row.seller_user_id, v_row.seller_slot, v_uid, v_slot,
     v_row.item_id, p_qty, v_gross, v_tax, v_net);

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, v_slot, 'trade', 'market_buy', v_row.item_id, p_qty, -v_gross,
            jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each)),
           (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_sold',
            v_row.item_id, -p_qty, v_net,
            jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax));

  return jsonb_build_object('ok', true, 'item_id', v_row.item_id, 'qty', p_qty,
                            'each', v_row.ask_each, 'gold_spent', v_gross);
exception when sqlstate 'HR001' then
  return jsonb_build_object('ok', false, 'error', 'bank_full');
end $$;
grant execute on function public.market_buy(int, uuid, bigint) to authenticated;

-- ── 8. market_expire — return escrow on expired listings ─────────────────
-- Called by pg_cron (or by any client hit, cheaply — the partial index makes
-- the no-op case an index probe). Deliberately idempotent and batched.
create or replace function public.market_expire(p_limit int default 500)
returns int language plpgsql security definer set search_path = public as $$
declare v_row public.market_listings; v_n int := 0;
begin
  for v_row in
    select * from public.market_listings where expires_at <= now()
     order by expires_at limit greatest(1, least(5000, coalesce(p_limit, 500)))
     for update skip locked
  loop
    delete from public.market_listings where id = v_row.id;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
      values (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_expire',
              v_row.item_id, v_row.qty, jsonb_build_object('listing', v_row.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.market_expire(int) to authenticated;

-- ── 9. Self-verification ─────────────────────────────────────────────────
do $$
declare v_bad int;
begin
  if to_regclass('public.market_listings') is null then raise exception 'market_listings missing'; end if;
  if to_regclass('public.market_sales')    is null then raise exception 'market_sales missing';    end if;

  -- The four structural holes from schema.sql must all be gone.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('market_listings','market_sales','hr_market_config')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policies on market tables — the RPCs must be the only writers', v_bad;
  end if;

  -- market_sales must have no `collected` column: its existence would mean the
  -- collect-and-PATCH model came back.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='market_sales' and column_name='collected') then
    raise exception 'market_sales.collected is back — the seller is paid at sale time now';
  end if;

  -- The old value-free RPC must not survive alongside the new one.
  if to_regproc('public.buy_listing(uuid,int)') is not null then
    raise warning 'legacy public.buy_listing still exists — drop it at cutover (it moves no value)';
  end if;

  raise notice 'MARKET v2 OK — escrow is real, the seller is paid at sale time, no client writes.';
end $$;
