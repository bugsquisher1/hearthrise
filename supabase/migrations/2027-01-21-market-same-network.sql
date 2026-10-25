-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-21-market-same-network.sql — THE SAME-NETWORK FLAG ON A MARKET SALE
--   (threat model #8), and the price history that leaves a flagged sale out.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-market-edge, backend-architect, 2026-10-25;
-- market build lane 2 of 5). Game CLOSED: applies on its passing §6 (tools/apply-
-- migration.mjs, one file, never inside begin/commit, never 00:00-00:10 UTC). MONEY
-- SURFACE adjacent: it moves no gold and no item, but it decides which sales feed the
-- price everyone sees. The market stays OFF (hr_market_config.enabled = false; nothing
-- here reads or writes the switch) until the ONE Security review (lane 3) signs off
-- lanes 1-2. Threat model: docs/planning/PRIORITY_BOARD.md "Security: marketplace
-- threat model (2026-10-24)" #8 (lane/s-market-threat). Contract:
-- docs/design/ARCHITECTURE_CONTRACTS.md §22 (d).
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- #8: "Two accounts on one network trade" — a wash pair prints a price (the floor, or a
-- ceiling) into the history an honest seller prices from, and a household moving gold
-- between its own accounts looks like a market. When the threat model was written no
-- network was stored anywhere. 2027-01-19-play-cap.sql (APPLIED 2026-10-24) now keeps
-- one: account_play_net (the salted SHA-256 network each ACCOUNT last showed on its own
-- PostgREST call, hr_load) and hero_play_net (the network each HERO last started
-- playing from). Never an address: 32 salted bytes, readable by no client or engine.
-- So the flag needs no new data source and no edge header: it is computed in SQL, at
-- the sale, from what play-cap already stores.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_market_same_network(a, b) -> boolean   (owner-only)
--   TRUE when two DIFFERENT accounts share any known network: {a's account_play_net,
--   every hero_play_net of a} ∩ {the same for b} is not empty. Unknown (never seen)
--   is FALSE: a flag is evidence, never a refusal, so it fails toward "not flagged".
-- market_sales.same_network boolean not null default false
--   STAMPED by a BEFORE INSERT trigger (hr_market_sale_network) on the receipt table,
--   the no-grant table that already names both accounts (threat model #1). Nothing
--   refuses on it: a sale between two players behind one router is legal; it is only
--   kept out of the price history and left for Security to read.
-- THE HISTORY LEAVES IT OUT. hr_market_buy (lane 1, untouched) writes market_item_daily
--   at its step (7) and market_sales at (13). On a FLAGGED sale the trigger rebuilds that
--   (item, UTC day) row from the day's UNFLAGGED sales (deleted when there are none), so
--   the 30-day line, the 7-day typical price and its volume never count it. The two
--   reads that look at market_sales directly are RESTATED with `not x.same_network`:
--   hr_market_item_summary (the "last sold" price) and hr_market_item (the last 10).
--   hr_market_mine is untouched: an account's own history and its listing's `received`
--   are its own trades and stay whole.
--
-- ── CONCURRENCY (lane 1's lock order, unchanged) ─────────────────────────────
-- The trigger runs inside hr_market_buy's transaction at step (13), after the purses.
-- It writes ONE row the buy already holds — market_item_daily (item, day), locked by the
-- buy's own upsert at step (7) — and reads account_play_net / hero_play_net / today's
-- market_sales without a lock. The rebuild is exact: any other buy of that item that day
-- either committed before this one took the row (its sale row is visible, READ COMMITTED)
-- or waits on the row until this commits. No new lock, no new edge in the order.
-- IDEMPOTENCY: nothing new; a replayed buy returns its stored answer before step (13).
--
-- ── EXPLOIT SURFACE DELTA (lane 2: this file AND the hr-accrue market verbs) ─────
-- Read with lane 1's own delta (2027-01-12-market-account.sql header). Lane 2 adds NO
-- client RPC, NO grant, NO engine allowlist entry and NO table privilege. This file adds
-- two owner-only functions (no EXECUTE for anon, authenticated, service_role or
-- hr_engine), one column and one trigger on a table no client can read.
-- THE EDGE (supabase/functions/hr-accrue/market.js, request.js readMarket, intents.js):
--   verb           inputs (request.js readMarket, each bounded)        forwards to            edge gate
--   market_list    market.source bag|storage, .item (id), .qty 1..1e8, hr_market_list(user,  1 'shop' token; +settle
--                  .ask_each 1..1e9                                     slot, version|null,    first on source=bag
--                                                                      key, source, item,
--                                                                      qty, ask_each)
--   market_cancel  market.listing (canonical uuid)                     hr_market_cancel(user, 1 'shop' token
--                                                                      slot, key, listing)
--   market_buy     market.listing, .qty 1..1e8, .max_each 1..1e9,      hr_market_buy(user,    1 'shop' token; +settle
--                  .deliver storage|bag                                 slot, version|null,    first on deliver=bag
--                                                                      key, listing, qty,
--                                                                      max_each, deliver)
--   market_browse  market.items (<= 50 ids), .after (id), .limit 1..50 hr_market_browse        none (RPC: market_read)
--   market_item    market.item (id)                                    hr_market_item         none (RPC: market_read)
--   market_mine    nothing                                             hr_market_mine         none (RPC: market_read)
--   `user` is ALWAYS the verified JWT subject; `slot` selects a row the caller owns; the
--   key is the client's uuid (writes only); `version` is the one the edge's own settle left
--   (bag path) or null (Storage path: lane 1 checks it on the bag verbs only). Every other
--   key on the body or on `market` is never read. Shape refusals use lane 1's own codes
--   (missing_intent_id, bad_source, bad_deliver, bad_qty, bad_price, bad_request) and
--   cost no database work; every other refusal is the RPC's code, verbatim, with a fresh
--   envelope ONLY for version_conflict / insufficient_item / insufficient_gold / bag_full
--   / storage_full / storage_no_room (all answered after the RPC's `market` counter).
--   Rate: writes 30/min per account at the edge (`shop`, shared with the NPC shop) and
--   60/min in SQL (`market`); reads 120/min in SQL (`market_read`).
--   The client (src/session/edge-intents.js MARKET_FIELDS, market-intents.js) names the
--   same fields; tests/client-intent-surface.mjs pins them, `ask_each` on market_list as
--   the ONE price field a client may send.
-- RESIDUAL RISKS (for lane 3):
--   · The flag is a heuristic: a VPN or mobile data on one side defeats it; a carrier NAT
--     or a shared café flags strangers (their sale only leaves the price history). The
--     account network is the one its LAST hr_load showed (account_play_net is written only
--     when it changes), so an account that switched networks since its last load is judged
--     by the old one; a hero's start network persists after it stops playing.
--   · An engine-only client (never calls hr_load) has no stored account network; its
--     heroes' start networks (hero_play_net) still count once they have played.
--   · The edge forwards the seller's ask (bounded floor..ceiling in SQL) and the buyer's
--     ceiling (refuse-only). A compromised hr-accrue can name any user on these verbs, as
--     on every engine verb: bounded by lane 1's per-account caps, every move journalled.
--   · Writes share the `shop` 30/min edge budget: a burst of listings can rate-limit the
--     same account's NPC shop for the rest of that minute (availability, own account only).
--   · NOT verified here: true concurrency (PGlite is one backend). The threat model's race
--     legs (#2: four parallel lists at 49 open, exactly one lands; #3: a party settle and a
--     buy into the same hero's bag, no deadlock) need a multi-connection database.
--   · #7 (party forfeit griefing via list-from-bag between a party settle's read and its
--     commit) is the hunt-settle lane's, and MUST land before the switch turns on.
--
-- ── COST AT 100x (today: 0 sales) ────────────────────────────────────────────
-- Per sale: two PK-ranged reads (account_play_net, hero_play_net by user) and, only on a
-- FLAGGED sale, one indexed range over that item's sales that UTC day (market_sales_item_
-- idx) plus a delete + insert of one market_item_daily row. One boolean (1 byte) per sale
-- row; no new table, no per-tick write.
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- drop trigger trg_market_sale_network on public.market_sales; drop the two functions;
-- re-apply lane 1's two read bodies (2027-01-12-market-account.sql §5); the column may
-- stay (default false) or be dropped. The daily rows rebuilt without a flagged sale are
-- not restored (they would re-add a wash price).
-- ORDER: after 2027-01-12-market-account.sql (APPLIED) and 2027-01-19-play-cap.sql
-- (APPLIED); after 2027-01-20-tutorial-facts.sql. Touches no body those touch except the
-- two lane-1 reads, pinned in §0. No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): live-hash-drift --live --write (hr_market_item_summary,
-- hr_market_item re-measured; hr_market_same_network, hr_market_sale_network tracked);
-- flip this note to APPLIED. The hr-accrue deploy carrying market.js may precede or follow
-- the apply (the verbs answer market_closed either way while the switch is off).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.market_sales') is null or to_regclass('public.market_item_daily') is null
     or to_regclass('public.market_listings') is null or to_regclass('public.hr_market_config') is null then
    raise exception 'PRECONDITION: apply 2027-01-12-market-account.sql first'; end if;
  if to_regclass('public.account_play_net') is null or to_regclass('public.hero_play_net') is null then
    raise exception 'PRECONDITION: apply 2027-01-19-play-cap.sql first (the stored networks)'; end if;
  if to_regprocedure('public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)') is null
     or to_regprocedure('public.hr_market_read_gate(uuid,integer,text)') is null
     or to_regprocedure('public.hr_market_rules()') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: lane 1''s market verbs / read gate / rules / the grant detector are missing'; end if;
  -- Each restated body is lane 1's image (pre; measured on the replay = production, live-hash-drift
  -- agree, 2026-10-25) or this file's own (post). Anything else: another file moved it; re-pin.
  for r in select * from (values
    ('public.hr_market_item_summary(text)', 'a376b3b43edcb65a20cb96f338e129eb', '7f8817a67124f9b2392745f89a0fafb5', '2027-01-12-market-account.sql'),
    ('public.hr_market_item(uuid,integer,text)', '9e2ee7a1bfeafaaad7d76f05d3d28114', 'd8413b6d99f8cd7a4c3a9a029a39e2d2', '2027-01-12-market-account.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE FLAG ON THE RECEIPT ──────────────────────────────────────────────
alter table public.market_sales add column if not exists same_network boolean not null default false;
comment on column public.market_sales.same_network is
  '2027-01-21 (market-same-network, threat model #8): the buyer and seller accounts shared a stored network '
  '(play-cap''s salted hashes) at the sale. Stamped by trg_market_sale_network; such a sale is kept out of the '
  'price history (market_item_daily, last sold, recent sales). Evidence for Security, never a refusal.';

-- ── §2 THE TEST: do two accounts share a network play-cap has seen? ─────────
create or replace function public.hr_market_same_network(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  -- MARKET-SAME-NETWORK (2027-01-21). Two DIFFERENT accounts, any shared network: each account's
  -- last own-call network (account_play_net) and every hero's start network (hero_play_net). An
  -- account never seen on a network shares none (a flag fails toward "not flagged").
  select p_a is not null and p_b is not null and p_a <> p_b and exists (
    select 1
      from (select n.net from public.account_play_net n where n.user_id = p_a
            union
            select h.net from public.hero_play_net h where h.user_id = p_a) a
      join (select n.net from public.account_play_net n where n.user_id = p_b
            union
            select h.net from public.hero_play_net h where h.user_id = p_b) b on b.net = a.net)
$$;
revoke execute on function public.hr_market_same_network(uuid, uuid) from public, anon, authenticated, service_role, hr_engine;

-- ── §3 THE STAMP, AND THE HISTORY THAT LEAVES A FLAGGED SALE OUT ────────────
create or replace function public.hr_market_sale_network()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
-- MARKET-SAME-NETWORK (2027-01-21). BEFORE INSERT on market_sales (hr_market_buy step 13). Stamps
-- same_network; on a flagged sale rebuilds today's (item, UTC day) market_item_daily row — which
-- the buy itself locked and wrote at its step (7) — from the day's UNFLAGGED sales, so no read of
-- the price history ever counts it. The new row is not in the table yet, so it is left out by
-- construction. Writes nothing on an unflagged sale.
declare v_day date; v_t0 timestamptz;
begin
  new.same_network := public.hr_market_same_network(new.seller_user_id, new.buyer_user_id);
  if new.same_network then
    v_day := (now() at time zone 'UTC')::date;
    v_t0  := v_day::timestamp at time zone 'UTC';
    delete from public.market_item_daily where item_id = new.item_id and day = v_day;
    insert into public.market_item_daily (item_id, day, trades, qty, gross, low_each, high_each)
      select new.item_id, v_day, count(*)::int, sum(s.qty), sum(s.gold_gross),
             min(s.gold_gross / s.qty), max(s.gold_gross / s.qty)
        from public.market_sales s
       where s.item_id = new.item_id and s.at >= v_t0 and s.at < v_t0 + interval '1 day' and not s.same_network
      having count(*) > 0;
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_sale_network() from public, anon, authenticated, service_role, hr_engine;
drop trigger if exists trg_market_sale_network on public.market_sales;
create trigger trg_market_sale_network
  before insert on public.market_sales
  for each row execute function public.hr_market_sale_network();

-- ── §4 THE TWO READS THAT LOOK AT market_sales, RESTATED (one change each) ───
-- hr_market_item_summary RESTATED WHOLE from 2027-01-12-market-account.sql §5 (pin a376b3b4):
-- the "last sold" price skips a flagged sale. Everything else is that body, line for line.
create or replace function public.hr_market_item_summary(p_item text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('item_id', m.item_id, 'listable', m.listable, 'why', m.why,
           'floor', m.floor_each, 'ceiling', m.ceiling_each,
           'lowest', a.lowest, 'for_sale', coalesce(a.qty, 0), 'listings', coalesce(a.n, 0),
           'last_each', s.each, 'last_at', s.at,
           'typical_7d', d.typical, 'volume_7d', coalesce(d.qty, 0))
    from public.hr_market_items m
    left join lateral (select min(l.ask_each) as lowest, sum(l.qty) as qty, count(*) as n
                         from public.market_listings l where l.item_id = m.item_id and l.expires_at > now()) a on true
    left join lateral (select x.gold_gross / x.qty as each, x.at
                         from public.market_sales x where x.item_id = m.item_id and not x.same_network
                        order by x.at desc limit 1) s on true
    left join lateral (select percentile_disc(0.5) within group (order by y.gross / y.qty) as typical, sum(y.qty) as qty
                         from public.market_item_daily y
                        where y.item_id = m.item_id and y.day >= (now() at time zone 'UTC')::date - 6) d on true
   where m.item_id = p_item
$$;
revoke execute on function public.hr_market_item_summary(text) from public, anon, authenticated, service_role, hr_engine;

-- hr_market_item RESTATED WHOLE from 2027-01-12-market-account.sql §5 (pin 9e2ee7a1): the last
-- ten sales skip a flagged sale (the 30-day line reads market_item_daily, already clean).
create or replace function public.hr_market_item(p_user uuid, p_slot int, p_item_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_g jsonb; v_uid uuid; v_sum jsonb; v_asks jsonb; v_hist jsonb; v_recent jsonb;
begin
  v_g := public.hr_market_read_gate(p_user, p_slot, 'market_item');
  if v_g is not null then return v_g; end if;
  if not (select enabled from public.hr_market_config) then return jsonb_build_object('ok', false, 'error', 'market_closed'); end if;
  v_uid := case when coalesce(nullif(current_setting('role', true), 'none'), session_user) = 'hr_engine'
                then coalesce(p_user, auth.uid()) else auth.uid() end;
  v_sum := public.hr_market_item_summary(p_item_id);
  if v_sum is null then return jsonb_build_object('ok', false, 'error', 'unknown_item'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('each', g.ask_each, 'qty', g.qty, 'listings', g.ls) order by g.ask_each), '[]'::jsonb)
    into v_asks
    from (select c.ask_each, sum(c.qty) as qty,
                 jsonb_agg(jsonb_build_object('id', c.id, 'qty', c.qty, 'mine', c.user_id = v_uid) order by c.posted_at) as ls
            from (select l.id, l.user_id, l.qty, l.ask_each, l.posted_at from public.market_listings l
                   where l.item_id = p_item_id and l.expires_at > now()
                   order by l.ask_each, l.posted_at limit 50) c
           group by c.ask_each) g;
  select coalesce(jsonb_agg(jsonb_build_object('day', y.day, 'trades', y.trades, 'qty', y.qty,
                            'avg_each', round(y.gross::numeric / y.qty), 'low', y.low_each, 'high', y.high_each) order by y.day), '[]'::jsonb)
    into v_hist
    from public.market_item_daily y
   where y.item_id = p_item_id and y.day >= (now() at time zone 'UTC')::date - 29;
  select coalesce(jsonb_agg(jsonb_build_object('qty', s.qty, 'each', s.gold_gross / s.qty, 'at', s.at) order by s.at desc), '[]'::jsonb)
    into v_recent
    from (select x.qty, x.gold_gross, x.at from public.market_sales x
           where x.item_id = p_item_id and not x.same_network order by x.at desc limit 10) s;
  return jsonb_build_object('ok', true, 'item', v_sum, 'asks', v_asks, 'history', v_hist, 'recent', v_recent,
                            'rules', public.hr_market_rules());
end $$;
revoke execute on function public.hr_market_item(uuid, int, text) from public, anon, authenticated, service_role;
grant execute on function public.hr_market_item(uuid, int, text) to hr_engine;

-- ── §5 GRANTS: nothing new is reachable by anyone but the owner (stated above, asserted below) ──

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back by a sentinel ──
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000ac0e2101';   -- seller
  v_b  constant uuid := '000000c0-0000-4000-a000-0000ac0e2102';   -- buyer on the SELLER's network
  v_c  constant uuid := '000000c0-0000-4000-a000-0000ac0e2103';   -- buyer on another network
  k    constant text := '000000c0-0000-4000-b000-0000';
  v jsonb; v_txt text; v_role text; v_n int; v_item text; v_floor bigint; v_lid uuid; v_was boolean;
begin
  -- (a) THE COLUMN AND THE TRIGGER.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'market_sales'
                  and column_name = 'same_network' and data_type = 'boolean' and is_nullable = 'NO'
                  and column_default = 'false') then
    raise exception 'VERIFY(a): market_sales.same_network is not boolean not null default false'; end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.market_sales'::regclass and not t.tgisinternal
                  and t.tgname = 'trg_market_sale_network' and t.tgenabled = 'O'
                  and t.tgfoid = 'public.hr_market_sale_network()'::regprocedure
                  and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 1) = 1) then
    raise exception 'VERIFY(a): trg_market_sale_network is not an enabled BEFORE INSERT FOR EACH ROW trigger'; end if;

  -- (b) THE SURFACE: the two new functions are owner-only; market_sales stays unreadable; the
  --     restated reads keep lane 1's grants (item: engine only; summary: nobody).
  foreach v_txt in array array['public.hr_market_same_network(uuid,uuid)', 'public.hr_market_sale_network()',
                               'public.hr_market_item_summary(text)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
      if has_function_privilege(v_role, v_txt, 'execute') then raise exception 'VERIFY(b): % can execute %', v_role, v_txt; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_market_item(uuid,integer,text)', 'execute') then
      raise exception 'VERIFY(b): % can execute hr_market_item', v_role; end if;
    if has_table_privilege(v_role, 'public.market_sales', 'select,insert,update,delete') then
      raise exception 'VERIFY(b): % holds a privilege on market_sales', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_market_item(uuid,integer,text)', 'execute') then
    raise exception 'VERIFY(b): the engine lost hr_market_item'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'market_sales') then
    raise exception 'VERIFY(b): market_sales carries a policy'; end if;
  -- …and both reads that look at market_sales skip a flagged sale.
  foreach v_txt in array array['public.hr_market_item_summary(text)', 'public.hr_market_item(uuid,integer,text)'] loop
    if strpos((select prosrc from pg_proc where oid = v_txt::regprocedure), 'and not x.same_network') = 0 then
      raise exception 'VERIFY(b): % reads market_sales without skipping a flagged sale', v_txt; end if;
  end loop;

  -- (c) THE PROBE: A lists; B (A's network) buys one, C (another network) buys one. B's sale is
  --     flagged and absent from every history; C's is counted. All rolled back.
  select m.item_id, m.floor_each into v_item, v_floor from public.hr_market_items m
   where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
     and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  if v_item is null then raise exception 'VERIFY(c): no listable stackable good to probe with'; end if;
  select enabled into v_was from public.hr_market_config;
  begin
    insert into auth.users (id) values (v_a), (v_b), (v_c) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'market-same-network §6 probe'),
      (v_b, 'market-same-network §6 probe'), (v_c, 'market-same-network §6 probe') on conflict (user_id) do nothing;
    foreach v_txt in array array[v_a::text, v_b::text, v_c::text] loop
      perform set_config('request.jwt.claim.sub', v_txt, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): hr_create_character refused: %', left(v::text, 300); end if;
      update public.account_wallet set gold = 1000000 where user_id = v_txt::uuid;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.account_play_net (user_id, net, seen_at) values
      (v_a, sha256('\x01'::bytea), now()), (v_b, sha256('\x01'::bytea), now()), (v_c, sha256('\x02'::bytea), now())
      on conflict (user_id) do update set net = excluded.net, seen_at = excluded.seen_at;
    if not public.hr_market_same_network(v_a, v_b) or public.hr_market_same_network(v_a, v_c)
       or public.hr_market_same_network(v_a, v_a) or public.hr_market_same_network(v_a, null) then
      raise exception 'VERIFY(c): hr_market_same_network answered wrong (A~B %, A~C %, A~A %)',
        public.hr_market_same_network(v_a, v_b), public.hr_market_same_network(v_a, v_c), public.hr_market_same_network(v_a, v_a); end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    update public.hr_market_config set enabled = true where only_row;
    -- the probe item's own history starts empty INSIDE the rolled-back block, so every count below is absolute
    delete from public.market_item_daily where item_id = v_item;
    delete from public.market_sales where item_id = v_item;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00002101')::uuid, 'bag', v_item, 3, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the probe list refused: %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_buy(v_b, 0, null, (k || '00002102')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the same-network buy refused: %', left(v::text, 300); end if;
    if not (select same_network from public.market_sales where listing_id = v_lid and buyer_user_id = v_b) then
      raise exception 'VERIFY(c): the same-network sale is not flagged'; end if;
    if exists (select 1 from public.market_item_daily where item_id = v_item and day = (now() at time zone 'UTC')::date) then
      raise exception 'VERIFY(c): a flagged sale is in the price history (market_item_daily)'; end if;
    v := public.hr_market_item_summary(v_item);
    if v->'last_each' is distinct from 'null'::jsonb or (v->>'volume_7d')::bigint <> 0 then
      raise exception 'VERIFY(c): a flagged sale is the last price / the 7-day volume: %', left(v::text, 300); end if;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    v := public.hr_market_buy(v_c, 0, null, (k || '00002103')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the other-network buy refused: %', left(v::text, 300); end if;
    if (select same_network from public.market_sales where listing_id = v_lid and buyer_user_id = v_c) then
      raise exception 'VERIFY(c): a sale between two networks is flagged'; end if;
    select trades into v_n from public.market_item_daily where item_id = v_item and day = (now() at time zone 'UTC')::date;
    if v_n is distinct from 1 then raise exception 'VERIFY(c): the history counts % trades, not the one unflagged', v_n; end if;
    v := public.hr_market_item(v_c, 0, v_item);
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'recent') <> 1 or jsonb_array_length(v->'history') <> 1
       or (v->'history'->0->>'trades')::int <> 1 or (v->'item'->>'last_each')::bigint <> v_floor
       or (v->'item'->>'volume_7d')::bigint <> 1 then
      raise exception 'VERIFY(c): hr_market_item does not show exactly the unflagged sale: %', left(v::text, 500); end if;
    -- a FLAGGED sale on top of a clean row leaves the clean one whole (the rebuild is exact)
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_buy(v_b, 0, null, (k || '00002104')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the second same-network buy refused: %', left(v::text, 300); end if;
    select trades into v_n from public.market_item_daily where item_id = v_item and day = (now() at time zone 'UTC')::date
       and qty = 1 and gross = v_floor and low_each = v_floor and high_each = v_floor;
    if v_n is distinct from 1 then raise exception 'VERIFY(c): a flagged sale moved a clean history row (trades %)', v_n; end if;
    raise exception using errcode = 'HR921', message = 'market-same-network §6 complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.market_sales where seller_user_id in (v_a, v_b, v_c) or buyer_user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.account_play_net where user_id in (v_a, v_b, v_c)) then
    raise exception 'VERIFY(d): §6 LEAKED a probe row'; end if;
  if (select enabled from public.hr_market_config) is distinct from v_was then
    raise exception 'VERIFY(d): §6 moved the market switch'; end if;

  -- (e) THE DETECTOR.
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'market-same-network: a sale between two accounts on one stored network is flagged and left out of '
               'every price history; nothing new is reachable by a client or the engine; all green';
end $$;
