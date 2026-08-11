-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-12-market-offers-authority.sql
--
-- M1 was the assignment. THIS FILE DOES NOT FIX M1, AND SAYS SO FIRST.
--
-- ── M1: WHY NO POSSESSION CHECK SHIPS HERE ──────────────────────────────
-- The finding is real and was re-confirmed against production on 2026-08-12 by
-- a rolled-back probe run as the `authenticated` role: a listing for
-- 5x abyssal_greaves was ACCEPTED for a player whose `game_saves.snapshot`
-- inventory has no such key and who has no `player_inventory` row at all. The
-- paired CONTROL (a bind-on-pickup item) was refused 22023 in the same probe,
-- so the probe could see failure.
--
-- A possession check needs a source of truth for possession. In v1 there are
-- exactly three candidates and all three are disqualified:
--
--   1. `player_inventory` — server-owned, and holds ZERO rows, because no
--      client path populates it (the accrual Edge Function is not deployed).
--      A strict check refuses 100% of legitimate listings: the market goes
--      offline to buy nothing. That is the trade 2026-08-11-live-market-rls.sql
--      deliberately refused, for the same reason.
--   2. `player_inventory`, FAILING OPEN for unknown items — with 0 rows this
--      checks nothing at all today, while creating the belief that possession
--      is enforced. That is defect S3 from this program's own history (a
--      catalogue check that passed when the catalogue was absent) reproduced
--      on purpose. It is strictly worse than no check.
--   3. `game_saves.snapshot->'inventory'` — the CLIENT-AUTHORED blob. Asking
--      it whether the seller owns the item is asking the attacker whether the
--      attacker is lying. It also has a real false-refusal rate against honest
--      players, because the snapshot is periodic: mine 5 ore, list them before
--      the next autosave, get refused.
--
-- THE DECISIVE FACT, stated plainly so nobody re-opens this as a quick win:
-- in v1 M1 grants an attacker NO CAPABILITY THEY DO NOT ALREADY HAVE. Gold and
-- inventory both live in the client-authored snapshot, so `G.inventory.x = 5`
-- followed by an honest listing produces a byte-identical outcome. Any v1
-- possession check therefore has exactly zero security value and a non-zero
-- chance of being mistaken for one. M1 closes with market-v2 and with nothing
-- else. Precondition: the client stops writing market_listings directly
-- (src/net/supabase-market-backend.js:73,93,107,120) and player_inventory is
-- actually populated. Until then M1 STAYS OPEN AND IS NOT MITIGATED.
--
-- ── WHAT THIS FILE ACTUALLY DOES ────────────────────────────────────────
-- While proving M1, two things turned up that ARE closeable today with no
-- client change, both re-confirmed by rolled-back production probes:
--
--   O1  `market_buy_offers` never got the 2026-08-11 treatment its sibling
--       table got. It still carries schema.sql's `for all` policy. Measured on
--       production as the `authenticated` role, inside begin/rollback:
--         • an offer was inserted with buyer_name = 'Tyler-IMPERSONATED',
--           item_id = 'not_a_real_item_id', posted_at = 1999-01-01, and
--           escrowed = 0 while max_each = 999999 — every one of those is a
--           client-authored value on a world-readable table;
--         • the offer's `max_each` and `item_id` were then PATCHed after
--           posting. That is finding A6 verbatim, on the table A6's fix
--           missed.
--       CONTROL in the same probe: an offer inserted under ANOTHER user's
--       buyer_user_id was refused 42501, so the probe could see failure.
--       market-v2 does not touch this table either — it recreates
--       market_listings and market_sales only — so this is not throwaway work.
--
--   O2  Neither market table has ANY server-side volume bound. The client caps
--       a character at 12 listings (13 with the Count renown perk;
--       src/market.js listingLimit()), and that cap is client-side only. Both
--       of production's market cron jobs are gone (verified 2026-08-12:
--       cron.job holds 9 jobs and neither trim-expired-listings nor
--       trim-market-sales is among them), so market_listings has NO retention
--       either. An authenticated caller can insert rows into a public table
--       without limit and nothing removes them. That is the failure mode that
--       took `game_events` to 1.6M rows / 229 MB from six players in four days.
--
--       ⚠ THE CAP IS A BOUND, NOT A FIX. It bounds how much fabricated stock
--         can exist per character; it does not make any of it real, and an
--         attacker with N accounts gets N times the bound. It is here for
--         growth control and blast radius, and it is not part of any claim
--         about M1.
--
-- SAFE TO RE-RUN. Additive and idempotent: no table dropped, no column added,
-- no row written outside the self-check fixture, which cleans up by id and
-- re-asserts the row counts. Reversal is §5.
--
-- CEDED OWNERSHIP: `market_buy_offers."own offers write"` is defined in
-- supabase/schema.sql:188. This file DROPS it and defines two new,
-- differently-named policies, exactly as 2026-08-11-live-market-rls.sql §1c
-- did for `market_listings."own listings write"`. No policy name is defined in
-- two files (the one-owner lint in tests/run-sql-tests.mjs).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0. Preconditions — FAIL CLOSED ─────────────────────────────────────
do $$
begin
  if to_regclass('public.market_buy_offers') is null then
    raise exception 'market_buy_offers is missing — this file hardens the v1 table';
  end if;
  if to_regclass('public.market_listings') is null then
    raise exception 'market_listings is missing';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is missing — apply 2026-08-11-catalogue.generated.sql first; '
                    'without it the tradeable check would fail OPEN, which is the S3 defect';
  end if;
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is EMPTY — every item id would be refused';
  end if;
  if (select count(*) from public.hr_items where not tradeable) = 0 then
    raise exception 'no untradeable items in the catalogue — the bop allowlist would be vacuous';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'profiles is missing — buyer_name has nothing to derive from';
  end if;
end $$;

-- ── §1. THE VOLUME BOUND (O2) ───────────────────────────────────────────
-- 25 open rows per (account, slot), per table. The client's own ceiling is 13
-- (12 base + 1 from the Count renown rank), so this refuses nothing a player
-- can reach through the UI while turning "unbounded" into "at most 25 × 6
-- slots = 150 rows per account per table".
--
-- ⚠ THE OWNER IS auth.uid(), NOT new.seller_user_id — AND THAT IS THE WHOLE
--   POINT. There are now two BEFORE INSERT triggers on market_listings, and
--   PostgreSQL fires them in NAME order: `trg_market_listing_cap` sorts before
--   `trg_market_listing_stamp`, so this one runs BEFORE the stamp pins
--   seller_user_id to auth.uid(). If it counted `new.seller_user_id` a caller
--   could name a victim's UUID, be counted against the victim's zero listings,
--   pass, and then have the stamp rewrite the row to themselves — the cap
--   bypassed completely and silently. Reading auth.uid() directly makes the
--   check ORDER-INDEPENDENT rather than order-dependent-and-documented, which
--   is the lesson market-v2 §0c records about ordering dependencies. The slot
--   is clamped here with the same expression the stamp uses, for the same
--   reason. §6(h) asserts the property behaviourally by inserting 26 rows under
--   a FORGED seller_user_id.
create or replace function public.hr_market_listing_cap()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_slot int; v_n int; v_cap int := 25;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_slot := least(5, greatest(0, coalesce(new.seller_slot, 0)));
  -- Bounded count: the question is "at the cap?", never "how many exactly?".
  select count(*) into v_n from (
    select 1 from public.market_listings
     where seller_user_id = v_uid and seller_slot = v_slot
     limit v_cap) s;
  if v_n >= v_cap then
    raise exception 'too_many_listings: % open listings on this character (cap %)', v_n, v_cap
      using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_cap() from public;
revoke execute on function public.hr_market_listing_cap() from anon, authenticated, service_role;

create or replace function public.hr_market_offer_cap()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_slot int; v_n int; v_cap int := 25;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  v_slot := least(5, greatest(0, coalesce(new.buyer_slot, 0)));
  select count(*) into v_n from (
    select 1 from public.market_buy_offers
     where buyer_user_id = v_uid and buyer_slot = v_slot
     limit v_cap) s;
  if v_n >= v_cap then
    raise exception 'too_many_offers: % open offers on this character (cap %)', v_n, v_cap
      using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_offer_cap() from public;
revoke execute on function public.hr_market_offer_cap() from anon, authenticated, service_role;

drop trigger if exists trg_market_listing_cap on public.market_listings;
create trigger trg_market_listing_cap
  before insert on public.market_listings
  for each row execute function public.hr_market_listing_cap();

drop trigger if exists trg_market_offer_cap on public.market_buy_offers;
create trigger trg_market_offer_cap
  before insert on public.market_buy_offers
  for each row execute function public.hr_market_offer_cap();

-- ── §2. O1 — the offer stamp ────────────────────────────────────────────
-- The same shape as hr_market_listing_stamp() in
-- 2026-08-11-live-market-rls.sql §1a, because it is the same defect.
--
-- ⚠ A server-derived name is only as trustworthy as the write privileges on
--   the column it derives from. `profiles` has had its write grants and both
--   write policies revoked (2026-08-11-chat-name-authority.sql), and
--   claim_display_name() is its only writer. §6(a) re-asserts that here — if it
--   ever stops holding, this trigger LAUNDERS a forged name instead of blocking
--   one, which is the exact mistake chat_messages.from_name made first.
create or replace function public.hr_market_offer_stamp()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_escrow bigint;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- Identity: PINNED, never accepted. The INSERT policy checks this too; a
  -- policy is one `alter policy` away and a trigger is the value itself.
  new.buyer_user_id := v_uid;
  new.buyer_name    := coalesce(
    (select nullif(btrim(p.display_name), '') from public.profiles p where p.id = v_uid),
    'Adventurer');
  new.posted_at     := now();                     -- never the client's clock
  new.buyer_slot    := least(5, greatest(0, coalesce(new.buyer_slot, 0)));

  -- Catalogue: FAIL CLOSED (S3). An offer to buy an item that does not exist,
  -- or that cannot be traded, is a lie published on a world-readable table.
  if not exists (select 1 from public.hr_items i
                  where i.item_id = new.item_id and i.tradeable) then
    raise exception 'not_tradeable: %', new.item_id using errcode = '22023';
  end if;

  -- Sanity bounds. NOT balance — these are the int4 columns and the UI that
  -- renders totals. Same numbers as the listing stamp so the two sides of the
  -- book cannot disagree about what a legal order looks like.
  if new.qty is null or new.qty < 1 or new.qty > 1000000 then
    raise exception 'bad_qty' using errcode = '22023';
  end if;
  if new.max_each is null or new.max_each < 1 or new.max_each > 100000000 then
    raise exception 'bad_price' using errcode = '22023';
  end if;

  -- `escrowed` is DERIVED, not accepted. The client sends qty * maxEach
  -- (supabase-market-backend.js:177); a client that sends 0 while bidding
  -- 999999 was accepted before this line, which is a shared-surface number
  -- that lies. Computed in bigint first: qty and max_each are both int4 and
  -- their product (up to 1e6 × 1e8 = 1e14) overflows int4, so the product is
  -- range-checked and REFUSED rather than silently truncated into the column.
  v_escrow := new.qty::bigint * new.max_each::bigint;
  if v_escrow > 2147483647 then
    raise exception 'offer_too_large: qty * max_each = % exceeds the escrow column', v_escrow
      using errcode = '22003';
  end if;
  new.escrowed := v_escrow::int;

  return new;
end $$;
revoke execute on function public.hr_market_offer_stamp() from public;
revoke execute on function public.hr_market_offer_stamp() from anon, authenticated, service_role;

-- ── §3. O1 — a posted offer is immutable ────────────────────────────────
-- market_listings needed a *selective* freeze because buy_listing() legitimately
-- decrements qty. NOTHING updates market_buy_offers — not the client
-- (supabase-market-backend.js has placeOffer/POST and cancelOffer/DELETE and no
-- PATCH), not any RPC (grepped: no function under supabase/ writes this table).
-- So the correct rule is not "freeze some columns", it is "there is no UPDATE",
-- and it is enforced three times: no UPDATE policy, no UPDATE privilege, and
-- this trigger, so that re-granting either one by accident still does not
-- reopen A6 here.
create or replace function public.hr_market_offer_immutable()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  raise exception 'offer_immutable: a posted buy offer cannot be changed — cancel and repost'
    using errcode = '42501';
end $$;
revoke execute on function public.hr_market_offer_immutable() from public;
revoke execute on function public.hr_market_offer_immutable() from anon, authenticated, service_role;

drop trigger if exists trg_market_offer_stamp on public.market_buy_offers;
create trigger trg_market_offer_stamp
  before insert on public.market_buy_offers
  for each row execute function public.hr_market_offer_stamp();

drop trigger if exists trg_market_offer_immutable on public.market_buy_offers;
create trigger trg_market_offer_immutable
  before update on public.market_buy_offers
  for each row execute function public.hr_market_offer_immutable();

-- ── §4. O1 — the policy split and the grants ────────────────────────────
alter table public.market_buy_offers enable row level security;
drop policy if exists "own offers write"  on public.market_buy_offers;
drop policy if exists "own offers insert" on public.market_buy_offers;
drop policy if exists "own offers delete" on public.market_buy_offers;
create policy "own offers insert" on public.market_buy_offers
  for insert to authenticated with check (auth.uid() = buyer_user_id);
create policy "own offers delete" on public.market_buy_offers
  for delete to authenticated using (auth.uid() = buyer_user_id);
-- `offers readable` (schema.sql:186, `using (true)`) is LEFT ALONE ON PURPOSE.
-- It publishes buyer_user_id — an auth UUID — to anyone with the anon key,
-- which is the S17 concern market-v2 raised about market_sales. It is not
-- narrowed here because market_listings already publishes seller_user_id the
-- same way and narrowing one of the pair is inconsistent, cosmetic, and would
-- pre-break a buy-offer board that has not been wired yet. Recorded as an open
-- finding rather than half-closed silently.
revoke update, truncate, references, trigger on public.market_buy_offers from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.market_buy_offers from anon;

-- ── §5. REVERSIBILITY ───────────────────────────────────────────────────
--   §1  drop trigger trg_market_listing_cap on public.market_listings;
--       drop trigger trg_market_offer_cap   on public.market_buy_offers;
--       drop function public.hr_market_listing_cap();
--       drop function public.hr_market_offer_cap();
--   §2/3 drop trigger trg_market_offer_stamp     on public.market_buy_offers;
--       drop trigger trg_market_offer_immutable on public.market_buy_offers;
--       drop function public.hr_market_offer_stamp();
--       drop function public.hr_market_offer_immutable();
--   §4  drop policy "own offers insert" on public.market_buy_offers;
--       drop policy "own offers delete" on public.market_buy_offers;
--       create policy "own offers write" on public.market_buy_offers
--         for all using (auth.uid() = buyer_user_id) with check (auth.uid() = buyer_user_id);
--       grant insert, update, delete on public.market_buy_offers to authenticated;
--
-- No table dropped, no column added, no row written. Nothing here needs a data
-- migration in either direction. market-v2 supersedes none of it — that file
-- does not touch market_buy_offers at all.

-- ════════════════════════════════════════════════════════════════════════
-- §6  SELF-VERIFICATION — BEHAVIOURAL, not "the trigger exists"
-- A trigger that is attached but does nothing passes every catalogue check ever
-- written. Every refusal below is PAIRED with a control proving the legitimate
-- path still works, so a guard that refuses everything cannot pass this block.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_bad  text;
  v_uid  uuid;
  v_name text;
  v_oid  uuid;
  v_ids  uuid[] := '{}';
  v_o0   bigint;
  v_l0   bigint;
  v_n    bigint;
  v_i    int;
  v_caught boolean;
begin
  -- (a) The derivation SOURCE must still be server-owned, or §2 launders a
  --     forged name instead of blocking one.
  select string_agg(policyname || '/' || cmd, ', ') into v_bad
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'profiles has a client write policy (%) — deriving buyer_name from it '
                    'would LAUNDER a forged name, not block one', v_bad;
  end if;
  select string_agg(privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema='public' and table_name='profiles'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE');
  if v_bad is not null then
    raise exception 'profiles is client-writable (%) — see 2026-08-11-chat-name-authority.sql', v_bad;
  end if;

  -- (b) No UPDATE policy and no UPDATE privilege on market_buy_offers.
  if exists (select 1 from pg_policies where schemaname='public'
              and tablename='market_buy_offers' and cmd in ('UPDATE','ALL')) then
    raise exception 'O1 OPEN: market_buy_offers still carries an UPDATE/ALL policy';
  end if;
  select string_agg(grantee || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema='public' and table_name='market_buy_offers'
     and grantee in ('anon','authenticated','PUBLIC') and privilege_type='UPDATE';
  if v_bad is not null then
    raise exception 'O1 OPEN: market_buy_offers UPDATE still granted (%)', v_bad;
  end if;
  select string_agg(privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema='public' and table_name='market_buy_offers'
     and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE');
  if v_bad is not null then
    raise exception 'O1 OPEN: anon still holds % on market_buy_offers', v_bad;
  end if;
  -- …and the client MUST keep insert + delete, or placeOffer/cancelOffer break.
  if not has_table_privilege('authenticated', 'public.market_buy_offers', 'insert')
     or not has_table_privilege('authenticated', 'public.market_buy_offers', 'delete') then
    raise exception 'BROKE THE FEATURE: authenticated can no longer post or cancel a buy offer';
  end if;

  -- (c) The triggers are attached, all four of them.
  foreach v_bad in array array['trg_market_offer_stamp','trg_market_offer_immutable','trg_market_offer_cap'] loop
    if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                    where c.relname = 'market_buy_offers' and t.tgname = v_bad and not t.tgisinternal) then
      raise exception 'trigger % is not attached to market_buy_offers', v_bad;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'market_listings' and t.tgname = 'trg_market_listing_cap'
                    and not t.tgisinternal) then
    raise exception 'trigger trg_market_listing_cap is not attached to market_listings';
  end if;
  -- The listing stamp from 2026-08-11-live-market-rls.sql must still be there:
  -- this file adds a SECOND before-insert trigger to that table and the pair is
  -- only safe together.
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'market_listings' and t.tgname = 'trg_market_listing_stamp'
                    and not t.tgisinternal) then
    raise exception 'trg_market_listing_stamp is GONE — apply 2026-08-11-live-market-rls.sql';
  end if;

  -- ── BEHAVIOURAL. Fixture built from a REAL profile so the derived name is a
  --    real name; every row is removed at the end and the counts re-asserted.
  select p.id, p.display_name into v_uid, v_name from public.profiles p
   where p.display_name is not null order by p.id limit 1;
  if v_uid is null then
    raise warning 'no profile with a display_name — SKIPPING the behavioural half of §6';
  else
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    select count(*) into v_o0 from public.market_buy_offers;
    select count(*) into v_l0 from public.market_listings;

    -- (d) O1 — every client-authored field on an offer is overwritten.
    v_oid := gen_random_uuid();
    insert into public.market_buy_offers
      (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each, escrowed, posted_at)
    values (v_oid, '00000000-0000-4000-8000-0000000000ff', 99, 'Tyler-IMPERSONATED',
            'normal_log', 5, 10, 0, timestamptz '1999-01-01');
    if (select buyer_name from public.market_buy_offers where id=v_oid)
       <> coalesce(nullif(btrim(v_name),''),'Adventurer') then
      raise exception 'O1: the stamp did NOT overwrite a forged buyer_name';
    end if;
    if (select buyer_user_id from public.market_buy_offers where id=v_oid) <> v_uid then
      raise exception 'O1: the stamp did NOT pin buyer_user_id to auth.uid()';
    end if;
    if (select posted_at from public.market_buy_offers where id=v_oid) < now() - interval '1 minute' then
      raise exception 'O1: the stamp accepted a client posted_at';
    end if;
    if (select buyer_slot from public.market_buy_offers where id=v_oid) <> 5 then
      raise exception 'O1: buyer_slot was not clamped';
    end if;
    -- escrowed is DERIVED: 5 × 10 = 50, not the 0 the fixture supplied.
    if (select escrowed from public.market_buy_offers where id=v_oid) <> 50 then
      raise exception 'O1: escrowed was accepted from the client instead of derived (got %)',
        (select escrowed from public.market_buy_offers where id=v_oid);
    end if;

    -- (e) O1 — a posted offer is immutable, and the TRIGGER (not just the
    --     policy) is what refuses it. Asserted as the migration role, where RLS
    --     is bypassed (relforcerowsecurity is false and the apply role has
    --     rolbypassrls), so this really is the trigger firing and not a policy
    --     making the row invisible — the failure mode 2026-08-11-live-market-rls
    --     §5 recorded when its "un-collect" probe passed by absence of an
    --     exception. The VALUE is asserted afterwards either way.
    v_caught := false;
    begin
      update public.market_buy_offers set max_each = 1 where id = v_oid;
    exception when sqlstate '42501' then v_caught := true;
    end;
    if not v_caught then
      raise exception 'O1: max_each was mutable AFTER posting — the immutable trigger did not fire';
    end if;
    if (select max_each from public.market_buy_offers where id=v_oid) <> 10 then
      raise exception 'O1: max_each changed despite the refusal';
    end if;

    -- (f) O1 — the catalogue check, both halves, plus the overflow guard.
    v_caught := false;
    begin
      insert into public.market_buy_offers (buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
      values (v_uid, 0, 'x', 'not_a_real_item_id', 1, 1);
    exception when sqlstate '22023' then v_caught := true;
    end;
    if not v_caught then raise exception 'O1: an unknown item id was offerable — the catalogue check failed OPEN'; end if;
    v_caught := false;
    begin
      insert into public.market_buy_offers (buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
      values (v_uid, 0, 'x', 'muster_seal', 1, 1);
    exception when sqlstate '22023' then v_caught := true;
    end;
    if not v_caught then raise exception 'O1: a bind-on-pickup item was offerable'; end if;
    v_caught := false;
    begin
      insert into public.market_buy_offers (buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
      values (v_uid, 0, 'x', 'normal_log', 1000000, 100000000);
    exception when sqlstate '22003' then v_caught := true;
    end;
    if not v_caught then raise exception 'O1: qty * max_each was allowed to overflow the escrow column'; end if;

    -- (g) CONTROL for (d)-(f): a LEGITIMATE offer still posts and still
    --     cancels. Without this, a trigger that raised on every insert would
    --     pass everything above.
    delete from public.market_buy_offers where id = v_oid;
    v_oid := gen_random_uuid();
    insert into public.market_buy_offers (id, buyer_user_id, buyer_slot, buyer_name, item_id, qty, max_each)
    values (v_oid, v_uid, 0, 'x', 'normal_log', 3, 7);
    if (select escrowed from public.market_buy_offers where id=v_oid) <> 21 then
      raise exception 'CONTROL FAILED: a legitimate offer did not post correctly';
    end if;
    delete from public.market_buy_offers where id = v_oid;
    if exists (select 1 from public.market_buy_offers where id = v_oid) then
      raise exception 'CONTROL FAILED: a legitimate offer could not be cancelled';
    end if;

    -- (h) O2 — the cap bites, AND it counts against auth.uid() rather than the
    --     client-supplied owner. The listing rows below all name a FORGED
    --     seller_user_id; if the cap read that column instead of auth.uid() it
    --     would count zero every time and the 26th insert would succeed. This
    --     is the assertion that makes the trigger-order note in §1 load-bearing
    --     instead of decorative. The successful inserts are simultaneously the
    --     CONTROL: a cap that refused everything would fail here first.
    --
    --     ⚠ IT FILLS TO THE CAP, IT DOES NOT ASSUME AN EMPTY SLOT. The first
    --       revision looped 1..25 unconditionally, which meant the migration
    --       ABORTED if the probe character already held listings on that slot —
    --       a self-check that refuses to install over live data is a self-check
    --       that will one day be deleted rather than understood. Caught by the
    --       re-runnability case in tests/market-offers-guard.mjs, where the
    --       second apply hit exactly that. Slot 5 is used because it is the
    --       last character slot and the least likely to be occupied, and the
    --       fill is measured either way.
    --
    --     ⚠ AND IT CLEANS UP BY ID. The first revision deleted by
    --       (user, slot, item, qty, price, 5-minute window), which is a
    --       predicate that CAN match a real player's real listing. Ids are
    --       collected as they are created; nothing else is ever deleted.
    select count(*) into v_n from public.market_listings
     where seller_user_id = v_uid and seller_slot = 5;
    if v_n >= 25 then
      raise warning 'the probe character already holds % listings on slot 5 — SKIPPING the O2 cap probe', v_n;
    else
      for v_i in 1..(25 - v_n) loop
        insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
        values ('00000000-0000-4000-8000-0000000000ff', 5, 'x', 'normal_log', 1, 1)
        returning id into v_oid;
        v_ids := v_ids || v_oid;
      end loop;
      select count(*) into v_n from public.market_listings
       where seller_user_id = v_uid and seller_slot = 5;
      if v_n <> 25 then
        raise exception 'CONTROL FAILED: slot 5 holds % listings, expected exactly 25 — the cap refuses too early', v_n;
      end if;
      v_caught := false;
      begin
        insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
        values ('00000000-0000-4000-8000-0000000000ff', 5, 'x', 'normal_log', 1, 1)
        returning id into v_oid;
        v_ids := v_ids || v_oid;                      -- so a slip is still cleaned up
      exception when sqlstate '54000' then v_caught := true;
      end;
      if not v_caught then
        raise exception 'O2: the 26th listing was accepted — the cap either did not fire or counted '
                        'the CLIENT-SUPPLIED seller_user_id instead of auth.uid()';
      end if;
    end if;

    -- Clean the fixture, BY ID ONLY.
    delete from public.market_listings where id = any(v_ids);
    perform set_config('request.jwt.claim.sub', '', true);

    select count(*) into v_n from public.market_buy_offers;
    if v_n <> v_o0 then raise exception 'the §6 fixture leaked % market_buy_offers row(s)', v_n - v_o0; end if;
    select count(*) into v_n from public.market_listings;
    if v_n <> v_l0 then raise exception 'the §6 fixture leaked % market_listings row(s)', v_n - v_l0; end if;
  end if;

  raise warning 'M1 REMAINS OPEN AND UNMITIGATED: a seller can still list an item they do not own. '
                'There is no server-side source of truth for possession in v1 (player_inventory has '
                'no populating client path) and every candidate source is client-authored. It closes '
                'with 2026-08-11-market-v2.sql and with nothing else.';
  raise notice 'market offers authority OK — O1 closed (offer identity/name/clock/escrow derived, '
               'terms immutable, catalogue fail-closed), O2 bounded at 25 open rows per character '
               'per table. M1 untouched, by design.';
end $$;
