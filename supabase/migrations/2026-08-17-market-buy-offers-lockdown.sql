-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — MARKET BUY-OFFERS: the client write door is CLOSED.
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion: supabase/migrations/2026-08-17-market-v2.sql (the SELL side)
--   Client half: src/market.js (placeBuyOffer / cancelBuyOffer / autoMatch are
--                inert under serverMarketActive(); the offer UI is hidden)
--   Behavioural evidence: tests/market-offers-lockdown.mjs (before/after + control)
--
-- ── THE FINDING (Security M5/M6 on market-v2) ───────────────────────────
-- market_buy_offers is the CLIENT-AUTHORED buy-offer sub-market: a browser
-- INSERTs an offer (escrowing gold) and DELETEs it (refunding gold), both
-- guarded only by the v1 RLS policies 2026-08-12-market-offers-authority.sql
-- left in place ("own offers insert" / "own offers delete"). market-v2
-- implements SELL listings only — there is NO server buy-offer model, no RPC,
-- no escrow shape for "I will pay up to N each for M of these" — so under the
-- server-authority switch the client's own escrow/refund moves gold the server
-- never heard of. src/market.js gates every one of those gestures off behind
-- serverMarketActive(); this file removes the DATABASE door they used, so a
-- forged client that ignored the switch still cannot write the table.
--
-- ── WHY BOTH THE POLICY AND THE GRANT GO ────────────────────────────────
-- With RLS on, the POLICY is what lets a row through — dropping it is the fix.
-- But hr_assert_grant_hygiene check (4) (widened by
-- 2026-08-16-client-write-grant-sweep.sql) flags a table that has RLS on, a
-- client WRITE GRANT, and NO write policy — a door with no handle somebody will
-- refit. So leaving the now-dead INSERT/DELETE grant behind would trade a live
-- door for a detector failure. Both go, and the table joins market_listings /
-- market_sales as write-only-through-nobody. SELECT is untouched: the table is
-- still readable while any pre-flip local mirror drains, and it holds nothing
-- another player may not see.
--
-- REVERSIBILITY (should not be needed — the buy-offer model is a server rebuild):
--   re-apply 2026-08-12-market-offers-authority.sql §4
--     (recreates "own offers insert"/"own offers delete" and the grants)
-- Nothing else is touched: no function, no other table, no row. The cap/stamp/
-- immutability TRIGGERS from that file are deliberately left attached — they are
-- harmless with no writes reaching them and are the reversal's other half.
--
-- ⚠ ADDITIVE + IDEMPOTENT. `drop policy if exists` and `revoke` are no-ops on a
--   database that has already run this. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.market_buy_offers') is null then
    raise exception 'market_buy_offers is missing — this file locks down the v1 buy-offer table; '
                    'apply the schema and 2026-08-12-market-offers-authority.sql first';
  end if;
end $$;

-- ── 1. THE CLIENT WRITE DOOR — POLICIES FIRST ────────────────────────────
-- These are 2026-08-12-market-offers-authority.sql §4's split policies. With
-- them gone and RLS on, no client role can INSERT or DELETE a row regardless of
-- any grant that remains.
alter table public.market_buy_offers enable row level security;
drop policy if exists "own offers insert" on public.market_buy_offers;
drop policy if exists "own offers delete" on public.market_buy_offers;
-- The superseded v1 blanket policy name, dropped too so a re-applied older file
-- cannot leave it standing.
drop policy if exists "own offers write"  on public.market_buy_offers;

-- ── 2. …AND THE NOW-DEAD GRANT (so the detector stays green) ──────────────
revoke insert, update, delete, truncate, references, trigger
  on public.market_buy_offers from anon, authenticated, public;

-- ── 3. SELF-VERIFICATION ─────────────────────────────────────────────────
do $$
declare v_bad int;
begin
  -- (a) NO client write POLICY on the table.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public' and tablename = 'market_buy_offers'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policy(ies) survive on market_buy_offers — the buy-offer '
                    'sub-market is client-authored and has no server model; nobody may write it', v_bad;
  end if;

  -- (b) NO client write GRANT either (anon/authenticated/PUBLIC), TRUNCATE
  --     included — otherwise the detector's widened check (4) flags a
  --     grant-with-no-policy the very night this applies.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'market_buy_offers'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then
    raise exception '% client write grant(s) survive on market_buy_offers — dropping the policy '
                    'without the grant leaves the exact grant-with-no-write-policy state check (4) '
                    'of hr_assert_grant_hygiene fails on', v_bad;
  end if;

  raise notice 'market_buy_offers locked down — no client INSERT/DELETE policy and no client write '
               'grant; the buy-offer sub-market is inert until a server model exists.';
end $$;
