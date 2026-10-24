-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE OLD RUNE LADDER, CUT FROM EVERY HOLDER (lane b-spell-content,
-- systems-engineer, 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on its
-- passing §3 (CLAUDE.md §2), one file via tools/apply-migration.mjs, never inside
-- begin/commit, never 00:00–00:10 UTC. Security reviews it at the reopen gate.
--
-- THE RULING (Tyler 2026-10-23, RUNE FAMILIES + COMBAT AUDIT ANSWERS): runes are
-- family x tier items, Chalked to Graven (src/data/stonecraft.js, runes.js), bound
-- from the one Blank Rune. The old one-a-family ammo ladder (Air, Earth, Water, Fire,
-- Chaos, Death and Blood Runes) and the Fine and Deep Blank Runes left hr_items with
-- 2027-01-13-items-catalogue.generated.sql. No back-compat and no save migration
-- (CLAUDE.md §1; progress is wiped at Early Access): a held old rune is not converted,
-- it is CUT, the 2026-12-02-old-rewards-cut.sql pattern.
--
-- §1 THE ONE-SHOT HELPER hr_cut_item_holders(item): deletes the item from every place
--    an item can rest (bag, worn, account bank, hunt bag, market listing, clan store,
--    item rules) and journals each deletion (one `admin` / `item_cut` ledger row per
--    character row; `withdraw` in clan_ledger for a clan store). An open market BUY
--    offer would carry escrowed gold, so the helper REFUSES rather than guess a refund
--    (none can exist: the market was wiped at 2026-10-27 and no old rune is on sale).
-- §2 THE CUT of the nine ids. No refund: Air Runes were kit stock and worth nothing,
--    the rest were made from blanks at Runecrafting (wiped at EA).
-- §3 SELF-CHECK, executed, every probe rolled back.
-- §4 The helper leaves with the file (no new function behind it).
--
-- NOT TOUCHED: a character whose active artisan pointer names a removed bind recipe
-- (bind_earth_runes ...) accrues nothing there until it picks a new one; nothing is
-- reset behind the player's back (§2: player state is never fabricated).
--
-- ORDER: after 2027-01-13-items-catalogue.generated.sql (the item rows go first;
-- §0 refuses otherwise). No edge deploy of its own.
-- REVERSIBILITY: none for the deleted holdings (journalled in player_ledger); the
-- helper is dropped in §4.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ──────────────────────────────────────────────────────
do $mig$
begin
  if exists (select 1 from public.hr_items where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune',
                                                            'death_rune', 'blood_rune', 'fine_rune_blank', 'deep_rune_blank')) then
    raise exception 'PRECONDITION: apply 2027-01-13-items-catalogue.generated.sql first (an old rune is still catalogued)'; end if;
  if not exists (select 1 from public.hr_items where item_id = 'chalked_fire_rune') then
    raise exception 'PRECONDITION: the family x tier runes are not catalogued'; end if;
end $mig$;

-- ── 1. THE ONE-SHOT HELPER ────────────────────────────────────────────────
create or replace function public.hr_cut_item_holders(p_item text)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare v_inv int; v_eq int; v_bank int; v_bag int; v_list int; v_clan int; v_rules int;
begin
  if exists (select 1 from public.market_buy_offers where item_id = p_item) then
    raise exception 'rune-ladder-cut §1: an open market buy offer names % (escrowed gold) — refund it by hand first', p_item;
  end if;
  with d as (delete from public.player_inventory where item_id = p_item returning user_id, slot, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select user_id, slot, 'admin', 'item_cut', p_item, -qty, jsonb_build_object('from', 'inventory', 'why', 'rune ladder cut 2026-10-23')
    from d where qty > 0;
  get diagnostics v_inv = row_count;
  with d as (delete from public.player_equipment where item_id = p_item returning user_id, slot, equip_slot)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select user_id, slot, 'admin', 'item_cut', p_item, -1,
         jsonb_build_object('from', 'equipment', 'equip_slot', equip_slot, 'why', 'rune ladder cut 2026-10-23')
    from d;
  get diagnostics v_eq = row_count;
  -- The account bank has no character: journal against the account's first character.
  with d as (delete from public.account_bank where item_id = p_item returning user_id, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select d.user_id, s.slot, 'admin', 'item_cut', p_item, -d.qty, jsonb_build_object('from', 'account_bank', 'why', 'rune ladder cut 2026-10-23')
    from d cross join lateral (select min(ps.slot) as slot from public.player_state ps where ps.user_id = d.user_id) s
   where d.qty > 0 and s.slot is not null;
  get diagnostics v_bank = row_count;
  with d as (delete from public.hunt_bag where item_id = p_item returning user_id, slot, session_id, qty_left)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta, session_id)
  select user_id, slot, 'admin', 'item_cut', p_item, -qty_left, jsonb_build_object('from', 'hunt_bag', 'why', 'rune ladder cut 2026-10-23'), session_id
    from d where qty_left > 0;
  get diagnostics v_bag = row_count;
  with d as (delete from public.market_listings where item_id = p_item returning seller_user_id, seller_slot, qty)
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
  select seller_user_id, seller_slot, 'admin', 'item_cut', p_item, -qty, jsonb_build_object('from', 'market_listing', 'why', 'rune ladder cut 2026-10-23')
    from d where qty > 0;
  get diagnostics v_list = row_count;
  with d as (delete from public.clan_stores where item_id = p_item returning clan_id, qty)
  insert into public.clan_ledger (clan_id, kind, item_id, qty, at)
  select clan_id, 'withdraw', p_item, -qty, now() from d where qty > 0;
  get diagnostics v_clan = row_count;
  delete from public.player_item_rules where item_id = p_item;
  get diagnostics v_rules = row_count;
  return jsonb_build_object('inventory', v_inv, 'equipment', v_eq, 'account_bank', v_bank, 'hunt_bag', v_bag,
                            'market_listings', v_list, 'clan_stores', v_clan, 'item_rules', v_rules);
end $$;
revoke execute on function public.hr_cut_item_holders(text) from public, anon, authenticated, service_role;

-- ── 2. THE CUT ────────────────────────────────────────────────────────────
do $$
declare v jsonb; v_id text;
begin
  foreach v_id in array array['air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune',
                              'fine_rune_blank', 'deep_rune_blank'] loop
    v := public.hr_cut_item_holders(v_id);
    raise notice 'rune-ladder-cut §2: % holders cut and journalled: %', v_id, v;
  end loop;
end $$;

-- ── 3. SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ───────
do $$
declare
  v_uid constant uuid := '00000000-0000-4000-8000-00000c0c1023';
  v jsonb;
begin
  -- (a) NO OLD RUNE IS HELD ANYWHERE (also the reach proof for (b): its call finds only the probe's rows).
  if exists (select 1 from public.player_inventory where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune', 'fine_rune_blank', 'deep_rune_blank'))
     or exists (select 1 from public.player_equipment where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune'))
     or exists (select 1 from public.account_bank where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune', 'fine_rune_blank', 'deep_rune_blank'))
     or exists (select 1 from public.hunt_bag where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune'))
     or exists (select 1 from public.market_listings where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune', 'fine_rune_blank', 'deep_rune_blank'))
     or exists (select 1 from public.clan_stores where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune', 'chaos_rune', 'death_rune', 'blood_rune', 'fine_rune_blank', 'deep_rune_blank')) then
    raise exception 'rune-ladder-cut §3(a): an old rune is still held'; end if;
  -- (b) THE CUT JOURNALS WHAT IT TAKES: a probe holding Air Runes in the bag (50), one worn in the ammo slot and
  --     Earth Runes in the bank (7) loses all three and gains admin ledger rows of -50 and -1 (air) and -7 (earth);
  --     a Chalked Fire Rune beside them is untouched. Rolled back.
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, version) values (v_uid, 0, 1)
      on conflict (user_id, slot) do nothing;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, 'air_rune', 50), (v_uid, 0, 'chalked_fire_rune', 4);
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_uid, 0, 'ammo', 'air_rune');
    insert into public.account_bank (user_id, item_id, qty) values (v_uid, 'earth_rune', 7);
    v := public.hr_cut_item_holders('air_rune');
    if (v->>'inventory')::int <> 1 or (v->>'equipment')::int <> 1 then
      raise exception 'rune-ladder-cut §3(b): the cut did not take the air probe holdings: %', v; end if;
    v := public.hr_cut_item_holders('earth_rune');
    if (v->>'account_bank')::int <> 1 then raise exception 'rune-ladder-cut §3(b): the cut did not take the bank probe: %', v; end if;
    if exists (select 1 from public.player_inventory where user_id = v_uid and item_id = 'air_rune')
       or exists (select 1 from public.player_equipment where user_id = v_uid)
       or exists (select 1 from public.account_bank where user_id = v_uid) then
      raise exception 'rune-ladder-cut §3(b): a probe rune survived the cut'; end if;
    if (select qty from public.player_inventory where user_id = v_uid and item_id = 'chalked_fire_rune') is distinct from 4 then
      raise exception 'rune-ladder-cut §3(b) CONTROL: the cut touched a family rune'; end if;
    if (select coalesce(array_agg(qty order by qty), '{}') from public.player_ledger
         where user_id = v_uid and kind = 'admin' and intent = 'item_cut' and item_id = 'air_rune') <> array[-50, -1]::bigint[]
       or (select coalesce(array_agg(qty order by qty), '{}') from public.player_ledger
         where user_id = v_uid and kind = 'admin' and intent = 'item_cut' and item_id = 'earth_rune') <> array[-7]::bigint[] then
      raise exception 'rune-ladder-cut §3(b): the cut was not journalled as -50, -1 (air) and -7 (earth)'; end if;
    raise exception using errcode = 'HR892', message = 'rune-ladder-cut §3 complete — rolling back';
  exception when sqlstate 'HR892' then null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'rune-ladder-cut §3: LEAKED a probe row'; end if;
  -- (c) THE START KIT GRANTS NO OLD RUNE (a new character would be handed an uncatalogued item).
  if exists (select 1 from public.hr_start_inventory where item_id in ('air_rune', 'earth_rune', 'water_rune', 'fire_rune')) then
    raise exception 'rune-ladder-cut §3(c): the start kit still grants an old rune'; end if;
  raise notice 'rune-ladder-cut: the old rune ladder and the graded blanks cut from every holder and journalled; zero leak';
end $$;

-- ── 4. THE ONE-SHOT HELPER LEAVES WITH THE FILE ───────────────────────────
drop function if exists public.hr_cut_item_holders(text);
