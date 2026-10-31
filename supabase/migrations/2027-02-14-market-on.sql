-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-14-market-on.sql — THE WEIGHHOUSE OPENS: hr_market_config.enabled = true.
--
-- STATUS: STAGED, NOT APPLIED (lane/b-market-window, systems-engineer, 2026-10-31). Apply
-- ONLY on the Coordinator's go for the release that carries the market window, AFTER
-- 2027-02-13-market-premium-bond.sql and 2027-02-13-market-eligibility.sql, and BEFORE the
-- client push. tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00-00:10 UTC. EDGE: none (hr-accrue already carries market.js). It is in
-- tests/schema-apply-order.json `excluded`, NOT `order`: a rebuilt database ships the market
-- OFF, and tests/market-v2.mjs M0 keeps it so.
--
-- WHAT IT REFUSES: every condition the Security market review set for the switch. §0 stops
-- the file before the flip if any is missing; no other file sets this flag.
-- REVERSE: tools/apply-migration.mjs 2027-02-14-market-off.sql (the same flag, self-checked;
-- list and buy answer market_closed, cancel, the sweep and My listings keep working).
-- AFTER APPLYING (Coordinator): restore-census --live-sql re-measures hr_market_config's
-- live_value; flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE REVIEW'S CONDITIONS ───────────────────────────────────────────────
do $mig$
begin
  -- Change 1: the premium bond is refused by the one listable rule.
  if to_regclass('public.hr_market_premium_items') is null
     or (select listable from public.hr_market_items where item_id = 'hearth_token') is distinct from false then
    raise exception 'PRECONDITION: apply 2027-02-13-market-premium-bond.sql first'; end if;
  -- Change 2: a member's own refusal ends that member only (threat model #7).
  if to_regprocedure('public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-01-22-party-settle-isolation.sql first'; end if;
  -- Threat model #8: a sale between two accounts on one network stays out of the price history.
  if not exists (select 1 from pg_trigger where tgname = 'trg_market_sale_network' and tgenabled = 'O') then
    raise exception 'PRECONDITION: apply 2027-01-21-market-same-network.sql first'; end if;
  -- Change 6 / threat model #9: a fresh account cannot trade.
  if not exists (select 1 from pg_trigger where tgname = 'trg_market_listing_gate' and tgenabled = 'O')
     or not exists (select 1 from pg_trigger where tgname = 'trg_market_sale_gate' and tgenabled = 'O') then
    raise exception 'PRECONDITION: apply 2027-02-13-market-eligibility.sql first'; end if;
  -- The sweep that returns unsold goods is scheduled.
  if not exists (select 1 from cron.job where jobname = 'hr-market-expire' and active) then
    raise exception 'PRECONDITION: the hr-market-expire sweep is not scheduled'; end if;
end $mig$;

-- ── §1 THE SWITCH ───────────────────────────────────────────────────────────
update public.hr_market_config set enabled = true where only_row and not enabled;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, the probe rolled back by a sentinel ──
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000ac0e2151';
  v_b  constant uuid := '000000c0-0000-4000-a000-0000ac0e2152';
  k    constant text := '000000c0-0000-4000-b000-0000';
  v jsonb; v_txt text; v_item text; v_floor bigint; v_lid uuid; v_ga bigint; v_gb bigint;
begin
  if (select enabled from public.hr_market_config) is distinct from true then
    raise exception 'VERIFY(a): the switch did not turn on'; end if;
  if (public.hr_market_rules()->>'enabled') is distinct from 'true' then
    raise exception 'VERIFY(a): the rules the window reads do not say on'; end if;
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_market_config' and column_name = 'enabled') is distinct from 'false' then
    raise exception 'VERIFY(a): the switch no longer defaults OFF for a rebuilt database'; end if;
  select m.item_id, m.floor_each into v_item, v_floor from public.hr_market_items m
   where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
     and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1;
  if v_item is null then raise exception 'VERIFY(b): no listable stackable good to probe with'; end if;
  -- (b) THE LOOP WORKS WITH THE SWITCH ON: list, browse, buy, cancel. Rolled back.
  begin
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'market-on probe'), (v_b, 'market-on probe') on conflict (user_id) do nothing;
    foreach v_txt in array array[v_a::text, v_b::text] loop
      perform set_config('request.jwt.claim.sub', v_txt, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', left(v::text, 300); end if;
      update public.account_wallet set gold = 1000000 where user_id = v_txt::uuid;
      update public.player_state set level_xp = public.hr_char_xp_for_level((select min_level from public.hr_market_config))
       where user_id = v_txt::uuid and slot = 0;
    end loop;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_list(v_a, 0, (select version from public.player_state where user_id = v_a and slot = 0),
           (k || '00002151')::uuid, 'bag', v_item, 3, v_floor);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the list refused: %', left(v::text, 300); end if;
    v_lid := (v->'listed'->>'listing_id')::uuid;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_market_browse(v_b, 0, array[v_item], null, null);
    if coalesce(v->>'ok', '') <> 'true' or (v#>>'{items,0,for_sale}')::bigint <> 3 then
      raise exception 'VERIFY(b): browse does not show the listing: %', left(v::text, 300); end if;
    v_ga := public.hr_purse_of(v_a); v_gb := public.hr_purse_of(v_b);
    v := public.hr_market_buy(v_b, 0, null, (k || '00002152')::uuid, v_lid, 1, v_floor, 'storage');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the buy refused: %', left(v::text, 300); end if;
    if public.hr_purse_of(v_b) <> v_gb - v_floor or public.hr_purse_of(v_a) <= v_ga then
      raise exception 'VERIFY(b): the purses did not move as a sale says'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_market_cancel(v_a, 0, (k || '00002153')::uuid, v_lid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the cancel refused: %', left(v::text, 300); end if;
    raise exception using errcode = 'HR921', message = 'market-on self-check complete - rolling back';
  exception when sqlstate 'HR921' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) then raise exception 'VERIFY(c): the probe leaked'; end if;
  raise notice 'market-on: the Weighhouse is open; list, browse, buy and cancel ran and rolled back; all green';
end $$;
