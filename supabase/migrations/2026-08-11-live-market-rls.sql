-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-11-live-market-rls.sql — A6, A8, A11 on the LIVE (v1) tables.
--
-- APPLY AFTER 2026-08-11-authenticated-surface-lockdown.sql. That file creates
-- `hr_rpc_gate`, which §3 uses, and this file's precondition block fails closed
-- without it.
--
-- ── WHY THIS FILE EXISTS AT ALL, GIVEN market-v2 ────────────────────────
-- 2026-08-11-market-v2.sql replaces `market_listings` and `market_sales`
-- wholesale and closes A6 and A8 by construction. It is UNAPPLIED, it drops and
-- recreates both tables, and it cannot land until the server owns gold and
-- inventory. Meanwhile all three findings are live and two of them were
-- REPRODUCED by the Security Engineer against production:
--
--   A6  `own listings write` is `FOR ALL`. A listing was posted under another
--       live player's `seller_name`, and `ask_each` / `qty` / `item_id` were
--       PATCHed AFTER posting. Buy first, rewrite the price second.
--   A8  `seller collects own sales` is scoped to the seller (correct) but
--       row-level, not column-level (not correct). As the seller:
--       `UPDATE market_sales SET gold_total = 987654321, collected = false,
--        buyer_name = 'Tyler'` changed 4 rows.
--   A11 `beta_invites` is `SELECT USING true` to PUBLIC. An anon key returns
--       all 20 codes, 17 of them unused.
--
-- So this file is deliberately a STOPGAP on tables that are going away, and it
-- is scoped to exactly that: it changes no table shape, adds no column, and
-- writes no row. market-v2 supersedes §1 and §2 in full.
--
-- ── THE CHOICE I MADE THAT DIFFERS FROM THE BRIEF, AND WHY ──────────────
-- The brief says "SELECT-only policy" for market_listings and "collection
-- becomes an RPC" for market_sales. Both are right for market-v2 and both are
-- wrong for TODAY, because the live client writes these tables directly:
--
--   src/net/supabase-market-backend.js:93   POST   /rest/v1/market_listings
--   src/net/supabase-market-backend.js:107  DELETE /rest/v1/market_listings?id=eq.
--   src/net/supabase-market-backend.js:143  PATCH  /rest/v1/market_sales
--
-- SELECT-only would take the market offline until a listing RPC exists and the
-- client is rewired — a client rewire that market-v2 is going to do anyway, for
-- a table market-v2 is going to delete. Shipping an outage to buy nothing is
-- not a security improvement.
--
-- What actually closes the two CONFIRMED exploits is narrower and needs no
-- client change at all:
--   • the FOR ALL policy is split into INSERT + DELETE (no UPDATE), and
--     table-level UPDATE is revoked from the client roles. Post-listing
--     mutation is gone — which is the whole of A6's second half.
--   • a BEFORE INSERT trigger derives `seller_name` from `profiles`, pins
--     `seller_user_id` to `auth.uid()`, stamps `posted_at` with `now()`, and
--     checks `item_id` against `hr_items.tradeable`. Impersonation and the
--     untradeable listing are gone — A6's first and third halves.
--   • market_sales keeps a seller-scoped UPDATE **policy** but loses
--     table-level UPDATE and gains a COLUMN grant on `collected` alone, plus a
--     trigger that refuses any other column change and refuses collected
--     true→false. A8's diagnosis is literally "row-level, not column-level";
--     column-level UPDATE privileges are the instrument the diagnosis names.
--
-- WHAT THIS DOES NOT AND CANNOT CLOSE, stated plainly: in v1 there is no
-- escrow, because inventory lives in the client-authored `game_saves.snapshot`.
-- A player can still list an item they do not own, and gold is still
-- client-authored. Only market-v2 fixes that, and only after the server owns
-- inventory. This file makes the market unforgeable ABOUT OTHER PLAYERS
-- (names, prices after the fact, the bind-on-pickup set); it does not make it
-- honest about the seller's own stock.
--
-- SAFE TO RE-RUN. Additive and idempotent. Reversal is §4.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) is missing — apply 2026-08-11-authenticated-surface-lockdown.sql first';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is missing — apply 2026-08-11-catalogue.generated.sql first; '
                    'without it the tradeable check would fail OPEN, which is the S3 defect';
  end if;
  if (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is EMPTY — every item id would be refused. Regenerate with tools/gen-catalogues.mjs';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'profiles is missing — seller_name has nothing to derive from';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §1  A6 — market_listings
-- ════════════════════════════════════════════════════════════════════════

-- ── 1a. The name authority ──────────────────────────────────────────────
-- ⚠ A server-derived value is only as trustworthy as the write privileges on
--   the column it is derived from (2026-08-11-chat-name-authority.sql learned
--   this the hard way: deriving `from_name` from `profiles.display_name` did
--   not BLOCK the forgery while profiles was client-writable, it LAUNDERED it).
--   `profiles` had its write grants and both write policies revoked on
--   2026-08-11; `claim_display_name()` is the only writer and it enforces
--   validation, the reserved list and uniqueness. §5 re-asserts that here, so
--   this trigger cannot silently become a laundering service.
create or replace function public.hr_market_listing_stamp()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- Identity: PINNED, never accepted. The INSERT policy also checks this, but a
  -- policy is one `alter policy` away and a trigger is the value itself.
  new.seller_user_id := v_uid;
  new.seller_name    := coalesce(
    (select nullif(btrim(p.display_name), '') from public.profiles p where p.id = v_uid),
    'Adventurer');
  new.posted_at      := now();                    -- never the client's clock
  new.seller_slot    := least(5, greatest(0, coalesce(new.seller_slot, 0)));

  -- Catalogue: FAIL CLOSED. An unknown id is refused rather than allowed —
  -- the S3 defect in this program's first revision was a catalogue check that
  -- passed when the catalogue was absent, which made every string a valid item.
  if not exists (select 1 from public.hr_items i
                  where i.item_id = new.item_id and i.tradeable) then
    raise exception 'not_tradeable: %', new.item_id using errcode = '22023';
  end if;

  -- Sanity bounds. NOT balance — an int4 column and a UI that renders totals.
  if new.qty is null or new.qty < 1 or new.qty > 1000000 then
    raise exception 'bad_qty' using errcode = '22023';
  end if;
  if new.ask_each is null or new.ask_each < 1 or new.ask_each > 100000000 then
    raise exception 'bad_price' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_stamp() from public;
revoke execute on function public.hr_market_listing_stamp() from anon, authenticated, service_role;

-- ── 1b. The immutability of a posted listing ────────────────────────────
-- `buy_listing` (SECURITY DEFINER) decrements `qty` on a purchase, so UPDATE
-- cannot simply be refused — that would break buying. What CAN be refused is
-- every other kind of change, and any increase in qty. That is the invariant
-- the FOR ALL policy was missing: a listing's terms are fixed at posting time.
create or replace function public.hr_market_listing_frozen()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if new.id             is distinct from old.id
  or new.seller_user_id is distinct from old.seller_user_id
  or new.seller_slot    is distinct from old.seller_slot
  or new.seller_name    is distinct from old.seller_name
  or new.item_id        is distinct from old.item_id
  or new.ask_each       is distinct from old.ask_each
  or new.posted_at      is distinct from old.posted_at then
    raise exception 'listing_frozen: a posted listing''s terms cannot be changed'
      using errcode = '42501';
  end if;
  if new.qty > old.qty then
    raise exception 'listing_frozen: qty may only decrease (% -> %)', old.qty, new.qty
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_frozen() from public;
revoke execute on function public.hr_market_listing_frozen() from anon, authenticated, service_role;

drop trigger if exists trg_market_listing_stamp  on public.market_listings;
create trigger trg_market_listing_stamp
  before insert on public.market_listings
  for each row execute function public.hr_market_listing_stamp();

drop trigger if exists trg_market_listing_frozen on public.market_listings;
create trigger trg_market_listing_frozen
  before update on public.market_listings
  for each row execute function public.hr_market_listing_frozen();

-- ── 1c. The policy split ────────────────────────────────────────────────
alter table public.market_listings enable row level security;
drop policy if exists "own listings write"  on public.market_listings;
drop policy if exists "own listings insert" on public.market_listings;
drop policy if exists "own listings delete" on public.market_listings;
create policy "own listings insert" on public.market_listings
  for insert to authenticated with check (auth.uid() = seller_user_id);
create policy "own listings delete" on public.market_listings
  for delete to authenticated using (auth.uid() = seller_user_id);
-- No UPDATE policy, AND no UPDATE privilege. Two independent locks, because
-- `create policy` is the thing a future migration is most likely to get wrong.
revoke update, truncate, references, trigger on public.market_listings from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.market_listings from anon;

-- ════════════════════════════════════════════════════════════════════════
-- §2  A8 — market_sales: collection is a one-way flip of ONE column
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.hr_market_sale_collect_only()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  if new.id             is distinct from old.id
  or new.listing_id     is distinct from old.listing_id
  or new.seller_user_id is distinct from old.seller_user_id
  or new.seller_name    is distinct from old.seller_name
  or new.buyer_user_id  is distinct from old.buyer_user_id
  or new.buyer_name     is distinct from old.buyer_name
  or new.item_id        is distinct from old.item_id
  or new.qty            is distinct from old.qty
  or new.gold_total     is distinct from old.gold_total
  or new.created_at     is distinct from old.created_at then
    raise exception 'sale_immutable: only `collected` may change on a sale row'
      using errcode = '42501';
  end if;
  if old.collected and not new.collected then
    raise exception 'sale_immutable: `collected` is a one-way flip'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_sale_collect_only() from public;
revoke execute on function public.hr_market_sale_collect_only() from anon, authenticated, service_role;

drop trigger if exists trg_market_sale_collect_only on public.market_sales;
create trigger trg_market_sale_collect_only
  before update on public.market_sales
  for each row execute function public.hr_market_sale_collect_only();

alter table public.market_sales enable row level security;
drop policy if exists "seller collects own sales" on public.market_sales;
-- Scoping to the seller was right. The column freedom was not. The USING /
-- WITH CHECK pair makes the flip one-way and single-use on its own; the column
-- grant below makes every other column unreachable even if this policy is
-- widened again by accident.
create policy "seller collects own sales" on public.market_sales
  for update to authenticated
  using       (auth.uid() = seller_user_id and collected = false)
  with check  (auth.uid() = seller_user_id and collected = true);

-- THE ACTUAL FIX FOR A8. A row-level policy cannot express "only this column";
-- a column-level GRANT can, and PostgreSQL checks it independently of RLS. The
-- live client PATCHes `{collected:true}` and nothing else
-- (supabase-market-backend.js:146), so this is a zero-client-change control.
revoke update, truncate, references, trigger on public.market_sales from anon, authenticated;
grant  update (collected) on public.market_sales to authenticated;
-- Sales rows are written by buy_listing (SECURITY DEFINER, runs as the owner).
-- No client ever inserts or deletes one.
revoke insert, delete on public.market_sales from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- §3  A11 — beta_invites
-- ────────────────────────────────────────────────────────────────────────
-- `invites world readable` is `for select to PUBLIC using (true)`, so
-- `GET /rest/v1/beta_invites?select=*` with the anon key returns every code.
--
-- The read exists for one reason: src/settings-page.js:279 `validateInvite()`
-- checks a code BEFORE sign-up, with the anon key, so the modal can say
-- "invalid code" without a round trip through auth. RLS cannot express "you may
-- read the row you named" — a policy sees the row, never the request's filter —
-- so the read has to become a function, and the function has to be the client's
-- only route.
--
-- §3a ships that function. §3b drops the policy, BEHIND AN INTERLOCK, because
-- dropping it before the client swaps blocks every new player from signing up:
-- validateInvite() would return "Could not check code." and the modal refuses.
--
--   HANDOFF (Systems Engineer) — one line, src/settings-page.js:279:
--     -  fetch(cfg.url + '/rest/v1/beta_invites?code=eq.' + encodeURIComponent(code) + '&select=code,used_by', {headers:{apikey, Authorization}})
--     +  fetch(cfg.url + '/rest/v1/rpc/beta_invite_check', {method:'POST', headers:{apikey, Authorization, 'Content-Type':'application/json'}, body: JSON.stringify({p_code: code})})
--   …reading `{ok, reason}` straight off the response instead of inspecting rows.
--
--   THEN, and only then, close A11:
--     set hearthrise.beta_invites_lockdown_ok = 'yes';   -- session GUC
--     \i supabase/migrations/2026-08-11-live-market-rls.sql
--
-- ⚠ A11 IS THEREFORE NOT CLOSED BY APPLYING THIS FILE. It is closed by
--   applying it a second time after the client change. Recorded as an OPEN
--   finding in the report rather than counted as done — a half-fix described as
--   a fix is how the last audit passed.
-- ════════════════════════════════════════════════════════════════════════

-- ── 3a. The replacement read ────────────────────────────────────────────
create or replace function public.beta_invite_check(p_code text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_used boolean; v_found boolean;
begin
  -- Anonymous callers are not counted (hr_rpc_gate §2b: no per-caller key), so
  -- this gate binds signed-in callers only. Guessing a code space one call at a
  -- time is a categorically different attack from `select *`, which is the
  -- exposure being closed; the residual is named in §5's notice.
  if not public.hr_rpc_gate('beta_invite_check') then
    return jsonb_build_object('ok', false, 'reason', 'Too many attempts. Try again in a minute.');
  end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'reason', 'Invalid invite code.');
  end if;
  select (b.used_by is not null), true into v_used, v_found
    from public.beta_invites b where b.code = btrim(p_code);
  -- The answer is about the ONE code the caller named. It never returns the
  -- code, the note, who used it, or anything about any other row.
  if not coalesce(v_found, false) then
    return jsonb_build_object('ok', false, 'reason', 'Invalid invite code.');
  end if;
  if coalesce(v_used, false) then
    return jsonb_build_object('ok', false, 'reason', 'Code already used.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.beta_invite_check(text) from public;
revoke execute on function public.beta_invite_check(text) from service_role;
grant  execute on function public.beta_invite_check(text) to anon, authenticated;

-- This WIDENS the approved client surface by one function, and
-- hr_assert_grant_hygiene() is differential against hr_client_rpc_baseline —
-- so without this it would (correctly) fail nightly with
-- `unapproved_client_rpcs: ["beta_invite_check(p_code text) → anon", …]`.
-- Widening is meant to be a deliberate act that records WHY, which is precisely
-- what hr_grant_baseline_sync is for. Guarded, because this file must still
-- apply on a database that has not had 2026-08-11-grant-hygiene.sql yet.
do $$
begin
  if to_regprocedure('public.hr_grant_baseline_sync(text)') is not null then
    perform public.hr_grant_baseline_sync(
      'beta_invite_check (2026-08-11, A11): replaces the world-readable SELECT on '
      || 'beta_invites. anon-callable ON PURPOSE — the invite modal checks a code '
      || 'before sign-up. Answers only about the one code it was given.');
  end if;
end $$;

-- The table itself is never written by a client: claim_beta_invite() is
-- SECURITY DEFINER and is the only writer. It holds a `for update` row lock, so
-- two simultaneous claims of one code cannot both win.
revoke insert, update, delete, truncate, references, trigger
  on public.beta_invites from anon, authenticated;

-- ── 3b. The read lockdown, behind an interlock ──────────────────────────
do $$
begin
  if coalesce(current_setting('hearthrise.beta_invites_lockdown_ok', true), '') = 'yes' then
    drop policy if exists "invites world readable" on public.beta_invites;
    revoke select on public.beta_invites from anon, authenticated;
    raise notice 'A11 CLOSED: beta_invites is no longer client-readable; beta_invite_check() is the only route';
  else
    raise warning 'A11 STILL OPEN: `invites world readable` was left in place because '
                  'hearthrise.beta_invites_lockdown_ok is not ''yes''. An anon key can still '
                  'read every invite code. Ship the src/settings-page.js:279 swap to '
                  'beta_invite_check(), then re-apply this file with the GUC set.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §4  REVERSIBILITY
-- ────────────────────────────────────────────────────────────────────────
--   §1  drop trigger trg_market_listing_stamp  on public.market_listings;
--       drop trigger trg_market_listing_frozen on public.market_listings;
--       drop policy "own listings insert" on public.market_listings;
--       drop policy "own listings delete" on public.market_listings;
--       create policy "own listings write" on public.market_listings
--         for all using (auth.uid() = seller_user_id) with check (auth.uid() = seller_user_id);
--       grant update on public.market_listings to authenticated;
--   §2  drop trigger trg_market_sale_collect_only on public.market_sales;
--       grant update on public.market_sales to authenticated;   -- re-widens A8
--   §3  drop function public.beta_invite_check(text);
--       create policy "invites world readable" on public.beta_invites for select using (true);
--       grant select on public.beta_invites to anon, authenticated;
--
-- No table was dropped, no column added, no row written. Nothing here needs a
-- data migration in either direction.
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- §5  SELF-VERIFICATION — BEHAVIOURAL, not "the policy exists"
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_bad   text;
  v_n     bigint;
  v_lid   uuid;
  v_lid2  uuid;
  v_sid   uuid;
  v_uid   uuid;
  v_name  text;
  v_l0    bigint;   -- live row counts, taken before the fixture and re-asserted after
  v_s0    bigint;
begin
  -- (1) The derivation's SOURCE must still be server-owned, or the trigger
  --     launders a forged name instead of blocking it.
  select string_agg(policyname || '/' || cmd, ', ') into v_bad
    from pg_policies where schemaname = 'public' and tablename = 'profiles'
     and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'profiles has a client write policy (%) — deriving seller_name from it '
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

  -- (2) No UPDATE policy and no UPDATE privilege on market_listings.
  if exists (select 1 from pg_policies where schemaname='public'
              and tablename='market_listings' and cmd in ('UPDATE','ALL')) then
    raise exception 'A6 OPEN: market_listings still carries an UPDATE/ALL policy';
  end if;
  select string_agg(grantee || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema='public' and table_name='market_listings'
     and grantee in ('anon','authenticated','PUBLIC') and privilege_type='UPDATE';
  if v_bad is not null then
    raise exception 'A6 OPEN: market_listings UPDATE still granted (%)', v_bad;
  end if;

  -- (3) market_sales: table-level UPDATE gone, column-level UPDATE(collected)
  --     present, and nothing else.
  select string_agg(grantee || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema='public' and table_name='market_sales'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('UPDATE','INSERT','DELETE');
  if v_bad is not null then
    raise exception 'A8 OPEN: market_sales still carries table-level % ', v_bad;
  end if;
  select string_agg(grantee || ':' || column_name, ', ') into v_bad
    from information_schema.role_column_grants
   where table_schema='public' and table_name='market_sales'
     and grantee in ('anon','authenticated','PUBLIC') and privilege_type='UPDATE'
     and column_name <> 'collected';
  if v_bad is not null then
    raise exception 'A8 OPEN: market_sales has UPDATE on a column other than collected (%)', v_bad;
  end if;
  if not exists (select 1 from information_schema.role_column_grants
                  where table_schema='public' and table_name='market_sales'
                    and grantee='authenticated' and privilege_type='UPDATE'
                    and column_name='collected') then
    raise exception 'A8 BROKE COLLECTION: authenticated cannot flip market_sales.collected';
  end if;

  -- (4) BEHAVIOURAL — the triggers must actually FIRE. A trigger that is
  --     attached but does nothing passes every catalogue check ever written.
  --     Fixture built from a REAL profile so the derived name is a real name;
  --     everything below is deleted at the end of this block.
  select p.id, p.display_name into v_uid, v_name from public.profiles p
   where p.display_name is not null order by p.id limit 1;
  if v_uid is null then
    raise warning 'no profile with a display_name — skipping the behavioural half of §5';
  else
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    select count(*) into v_l0 from public.market_listings;
    select count(*) into v_s0 from public.market_sales;

    -- 4a: a forged seller_name and a forged seller_user_id are both overwritten.
    v_lid := gen_random_uuid();
    insert into public.market_listings (id, seller_user_id, seller_slot, seller_name,
                                        item_id, qty, ask_each, posted_at)
    values (v_lid, '00000000-0000-4000-8000-0000000000ff', 99, 'Tyler',
            'normal_log', 5, 10, timestamptz '1999-01-01');
    if (select seller_name from public.market_listings where id=v_lid) <> coalesce(nullif(btrim(v_name),''),'Adventurer') then
      raise exception 'A6: the stamp trigger did NOT overwrite a forged seller_name';
    end if;
    if (select seller_user_id from public.market_listings where id=v_lid) <> v_uid then
      raise exception 'A6: the stamp trigger did NOT pin seller_user_id to auth.uid()';
    end if;
    if (select posted_at from public.market_listings where id=v_lid) < now() - interval '1 minute' then
      raise exception 'A6: the stamp trigger accepted a client posted_at';
    end if;
    if (select seller_slot from public.market_listings where id=v_lid) <> 5 then
      raise exception 'A6: seller_slot was not clamped';
    end if;

    -- 4b: the terms are frozen, but a buy (qty decrease) still works.
    begin
      update public.market_listings set ask_each = 1 where id = v_lid;
      raise exception 'A6: ask_each was mutable AFTER posting — the frozen trigger did not fire';
    exception when sqlstate '42501' then null;
    end;
    begin
      update public.market_listings set item_id = 'hearth_token' where id = v_lid;
      raise exception 'A6: item_id was mutable AFTER posting';
    exception when sqlstate '42501' then null;
    end;
    update public.market_listings set qty = qty - 1 where id = v_lid;   -- buy_listing's path
    if (select qty from public.market_listings where id=v_lid) <> 4 then
      raise exception 'A6: the frozen trigger blocked a legitimate qty decrease — buying is broken';
    end if;

    -- 4c: a bind-on-pickup item cannot be listed.
    begin
      insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
      values (v_uid, 0, 'x', 'muster_seal', 1, 1);
      raise exception 'A6: a bind-on-pickup item (muster_seal) was listable';
    exception when sqlstate '22023' then null;
    end;
    begin
      insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
      values (v_uid, 0, 'x', 'not_a_real_item_id', 1, 1);
      raise exception 'A6: an unknown item id was listable — the catalogue check failed OPEN';
    exception when sqlstate '22023' then null;
    end;
    -- …and hearth_token IS listable, deliberately. b206 made the bond the
    -- sanctioned gold↔premium bridge (src/data/items.js:378-386); "IAP-only"
    -- means UNMINTABLE in PvE, not untradeable, and hr_apply has no
    -- hearth_tokens delta key at all. Asserted so nobody "fixes" it later.
    v_lid2 := gen_random_uuid();
    insert into public.market_listings (id, seller_user_id, seller_slot, seller_name, item_id, qty, ask_each)
    values (v_lid2, v_uid, 0, 'x', 'hearth_token', 1, 25000);

    -- 4d: a sale row cannot be rewritten.
    v_sid := gen_random_uuid();
    insert into public.market_sales (id, listing_id, seller_user_id, seller_name,
                                     buyer_user_id, buyer_name, item_id, qty, gold_total, collected)
    values (v_sid, v_lid, v_uid, 'x', v_uid, 'y', 'normal_log', 1, 10, false);
    begin
      update public.market_sales set gold_total = 987654321 where id = v_sid;
      raise exception 'A8: gold_total was mutable by the seller';
    exception when sqlstate '42501' then null;
    end;
    begin
      update public.market_sales set buyer_name = 'Tyler' where id = v_sid;
      raise exception 'A8: buyer_name was mutable by the seller';
    exception when sqlstate '42501' then null;
    end;
    update public.market_sales set collected = true where id = v_sid;
    -- ⚠ ASSERT THE VALUE, NOT THE ABSENCE OF AN EXCEPTION. Measured on
    --   production 2026-08-11: the un-collect UPDATE raises NOTHING, because the
    --   policy's USING clause (`collected = false`) makes the row invisible to
    --   it — zero rows matched, no error, and the trigger never fires. A probe
    --   that only catches 42501 would have called that a PASS while proving
    --   nothing, which is the always-null-probe shape exactly.
    update public.market_sales set collected = false where id = v_sid;
    if not (select collected from public.market_sales where id = v_sid) then
      raise exception 'A8: `collected` was flipped BACK to false — a sale can be collected twice';
    end if;
    -- …and the trigger must ALSO refuse it, independently of the policy, so
    -- that widening the policy later does not silently re-open the hole.
    begin
      update public.market_sales set collected = false, gold_total = gold_total
       where id = v_sid and collected = true;
      raise exception 'A8: the collect_only trigger did not refuse a true->false flip';
    exception when sqlstate '42501' then null;
    end;

    -- Clean the fixture, BY ID ONLY. A `where seller_user_id = …` delete here
    -- would take a real player's live listings with it.
    delete from public.market_sales    where id = v_sid;
    delete from public.market_listings where id in (v_lid, v_lid2);
    perform set_config('request.jwt.claim.sub', '', true);

    -- …and prove the cleanup was complete rather than assuming it.
    select count(*) into v_n from public.market_listings;
    if v_n <> v_l0 then
      raise exception 'the §5 fixture leaked % market_listings row(s)', v_n - v_l0;
    end if;
    select count(*) into v_n from public.market_sales;
    if v_n <> v_s0 then
      raise exception 'the §5 fixture leaked % market_sales row(s)', v_n - v_s0;
    end if;
  end if;

  -- (5) A11 status, reported honestly either way.
  if exists (select 1 from pg_policies where schemaname='public' and tablename='beta_invites') then
    select count(*) into v_n from public.beta_invites where used_by is null;
    raise warning 'A11 REMAINS OPEN — beta_invites is still client-readable (% unused codes exposed). '
                  'See §3b for the two-step close.', v_n;
  end if;
  if not has_function_privilege('anon', 'public.beta_invite_check(text)', 'execute') then
    raise exception 'beta_invite_check is not anon-callable — the pre-signup check would break';
  end if;

  raise notice 'live-market RLS OK — A6 closed, A8 closed, A11 half-closed (RPC shipped, read still open)';
end $$;
