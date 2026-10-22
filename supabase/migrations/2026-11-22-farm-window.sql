-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE FARM WINDOW'S SERVER HALF: what the field looks like and
-- "harvest, then plant the same crop again" (lane/b-farm-window, systems-engineer,
-- 2026-10-22; P1: farming sat at zero because no client called a farm verb).
-- STAGED, NOT APPLIED. Game CLOSED: applies on its passing §4; a MONEY surface
-- (one seed bought at the Shop's own price), so it is on the reopen gate's review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The designer's model (PRIORITY_BOARD 2026-10-22, the seed counter): each plot
-- REMEMBERS its crop. A harvest replants it from the hero's own seeds first, then
-- buys one at the Seeds row's price, so the crop is chosen once, not every 4 h.
-- And the window must show what the SERVER says: how many plots this hero may
-- plant (the property cap, 2 at the Camp), whether a plot is ready or waterable
-- by the server's clock, and the next plot tier's price.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_farm_land_view(user, slot) -> the `farm_land` envelope section (a row of
--    hr_state_sections, no hr_state_of edit):
--      { cap, plot_level, deeds, upgrade: {level, gold, deeds, farming} | null,
--        plots: [{ i, crop, ready, ready_in_s, waterable, regrows_left }] }
--    cap      = (property tier + 1) * 2, the exact rule inside hr_farm_plant;
--    ready    = hr_farm_growth_hours(planted, waterings, now()) >= base_hours,
--               the exact test inside hr_farm_harvest;
--    ready_in_s: the rest of the open watering window at 2x, then 1x (farm.js
--               readyInMs), whole seconds, 0 when ready;
--    waterable: not ready, the last window closed, fewer than 8 waterings — the
--               three refusals of hr_farm_water.
--    The upgrade price is hr_plot_tier's (hr_farm_upgrade_plot charges it).
-- §2 hr_farm_harvest_replant(slot, plot, idem) (authenticated): reads the plot's
--    crop, runs hr_farm_harvest UNCHANGED (its gates, roll, perks, budget,
--    journal), and when the plot is empty afterwards (not a regrow) plants the
--    same crop again through hr_farm_plant UNCHANGED. With no seed of that crop in
--    the bag it first buys ONE at the price of the Shop's listed `seed` row
--    (hr_shop_supply_offers, the row shop_buy sells), debited under the row lock
--    hr_farm_harvest already took, predicated on gold >= price, journalled as one
--    `shop` ledger row (unit price in meta). A refused replant never undoes the
--    harvest: the answer is the harvest plus `replant: {ok:false, error, ...}`
--    (no_seed_for_sale, cannot_afford, or hr_farm_plant's own refusal; a seed
--    bought for a plant that was then refused stays in the bag).
--    Idempotent on p_idem (hr_intent_replay, label farm_replant); the inner
--    calls run on keys derived from it, so a replay is the cached answer and
--    never a second harvest or purchase.
-- §3 the client RPC baseline row.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- +1 client RPC. It names a slot, a plot index and a key: no crop, no price, no
-- count. The crop is the plot's own; the price is the catalogue's; one seed per
-- harvest, so it buys at most one seed per crop cycle per plot (hours apart),
-- under the farm_harvest bucket (the wrapper and the inner harvest each spend one)
-- and hr_farm_plant's own. Buy-then-sell
-- loses half (the vendor bids at most half a seed's price). It mints nothing the
-- two verbs it calls do not already mint.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- §1 runs on every envelope: one hr_unlock_levels read, one player_state PK read,
-- one indexed scan of the hero's own <= 12 player_farm rows joined to hr_crops.
-- §2 is one harvest + one plant + at most one purchase per crop cycle.
--
-- REVERSIBILITY: delete the hr_state_sections row 'farm_land', drop both
-- functions and the baseline row. No table, column or row of player data.
-- ORDER: after 2026-11-21-shop-seeds.sql (needs the listed seed rows). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads; it restates no body) ───────────
do $mig$
begin
  if to_regprocedure('public.hr_farm_harvest(int,int,uuid)') is null
     or to_regprocedure('public.hr_farm_plant(int,int,text,uuid)') is null
     or to_regprocedure('public.hr_farm_growth_hours(timestamptz,timestamptz[],timestamptz)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null
     or to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    raise exception 'PIN: a farm verb, hr_farm_growth_hours, hr_intent_replay, hr_note_rejection or hr_unlock_levels is missing'; end if;
  if to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_plot_tier') is null
     or to_regclass('public.hr_crops') is null or to_regclass('public.hr_shop_supply_offers') is null then
    raise exception 'PIN: hr_state_sections, hr_plot_tier, hr_crops or hr_shop_supply_offers is missing'; end if;
  if not exists (select 1 from public.hr_shop_supply_offers where kind = 'seed') then
    raise exception 'PIN: the Shop lists no seed (apply 2026-11-21-alpha-catalogue.generated.sql first)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_plot_tier'
                  and column_name = 'gold_cost') then
    raise exception 'PIN: hr_plot_tier.gold_cost is missing (2026-09-06-plot-tier-reachable.sql)'; end if;
end $mig$;

-- ── §1 THE FIELD AS THE SERVER SEES IT: the `farm_land` section ─────────────
create or replace function public.hr_farm_land_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  c_window_s constant numeric := 2 * 3600;   -- hr_farm_water's window
  c_max_waterings constant int := 8;          -- hr_farm_water's cap
  v_lv   int;
  v_tier int;
  v_deeds bigint;
  v_up   jsonb;
  v_plots jsonb;
begin
  select plot_level into v_lv from public.player_state where user_id = p_user and slot = p_slot;
  if v_lv is null then return null; end if;
  -- the property cap, the exact rule hr_farm_plant refuses on (plot_cap)
  select coalesce(max(level) filter (where unlock_id like 'property:%'), 0)::int
    into v_tier from public.hr_unlock_levels(p_user, p_slot);
  select coalesce(qty, 0) into v_deeds from public.player_inventory
   where user_id = p_user and slot = p_slot and item_id = 'farm_deed';
  select jsonb_build_object('level', t.plot_level, 'gold', t.gold_cost, 'deeds', t.deed_cost, 'farming', t.req_farm_level)
    into v_up from public.hr_plot_tier t where t.plot_level = v_lv + 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'i', f.plot_idx, 'crop', f.crop_id,
           'ready', g.rem_h <= 0,
           'ready_in_s', case when g.rem_h <= 0 then 0
                              when g.win_s / 3600.0 * 2 >= g.rem_h then ceil(g.rem_h / 2 * 3600)::bigint
                              else ceil(g.win_s + (g.rem_h - g.win_s / 3600.0 * 2) * 3600)::bigint end,
           'waterable', g.rem_h > 0 and g.win_s <= 0 and coalesce(array_length(f.waterings, 1), 0) < c_max_waterings,
           'regrows_left', case when c.regrows and c.regrow_limit > 0 then greatest(0, c.regrow_limit - f.regrow_count) else null end)
         order by f.plot_idx), '[]'::jsonb)
    into v_plots
    from public.player_farm f
    join public.hr_crops c on c.crop_id = f.crop_id
    cross join lateral (select
        c.base_hours - public.hr_farm_growth_hours(f.planted_at, f.waterings, now()) as rem_h,
        greatest(0, extract(epoch from (
          (select max(w) from unnest(f.waterings) w) + make_interval(secs => c_window_s) - now())))::numeric as win_s) g
   where f.user_id = p_user and f.slot = p_slot and f.crop_id is not null;
  return jsonb_build_object('cap', (v_tier + 1) * 2, 'plot_level', v_lv, 'deeds', coalesce(v_deeds, 0),
                            'upgrade', v_up, 'plots', v_plots);
end $$;
revoke execute on function public.hr_farm_land_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('farm_land', 'hr_farm_land_view', '2026-11-22-farm-window.sql: the plot cap, plot tier and next tier price, deeds held, and each planted plot''s crop, readiness, seconds to ready and waterability by the server clock')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 HARVEST, THEN PLANT THE SAME CROP AGAIN ───────────────────────────────
create or replace function public.hr_farm_harvest_replant(p_slot int, p_plot_idx int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_cached jsonb;
  v_crop   text;
  v_seed   text;
  v_have   bigint;
  v_price  bigint;
  v_offer  text;
  v_gold   bigint;
  v_bought bigint := 0;
  v_h      jsonb;
  v_rep    jsonb;
  v_out    jsonb;
begin
  if v_uid is null then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_idem is null or p_slot is null or p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= 64 then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_replant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_replant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;
  -- the harvest's own bucket (closed-mode check first); the inner harvest spends one more
  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_replant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- THE PLOT REMEMBERS ITS CROP: read before the harvest clears the row.
  select crop_id into v_crop from public.player_farm
   where user_id = v_uid and slot = p_slot and plot_idx = p_plot_idx;

  -- The harvest, unchanged: its own gates, roll, perks, budget and journal. It
  -- locks the character row (for update); this transaction keeps that lock.
  v_h := public.hr_farm_harvest(p_slot, p_plot_idx, md5(p_idem::text || ':farm_replant:harvest')::uuid);
  if coalesce(v_h ->> 'ok', '') <> 'true' then return v_h; end if;   -- refused (and noted) by the harvest: nothing moved

  if coalesce(v_h ->> 'regrew', '') = 'true' or v_crop is null then
    v_rep := jsonb_build_object('ok', true, 'kept', true);           -- a regrowing crop is still in the ground
  else
    select seed_item into v_seed from public.hr_crops where crop_id = v_crop;
    select coalesce(qty, 0) into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_seed;
    if coalesce(v_have, 0) < 1 then
      -- ONE SEED AT THE SHOP'S OWN PRICE: the listed `seed` row shop_buy sells.
      select o.price, o.offer_id into v_price, v_offer from public.hr_shop_supply_offers o
       where o.kind = 'seed' and o.item_id = v_seed order by o.price limit 1;
      if v_price is null or v_price <= 0 then
        v_rep := jsonb_build_object('ok', false, 'error', 'no_seed_for_sale', 'seed', v_seed);
      else
        update public.player_state set gold = gold - v_price, version = version + 1, updated_at = now()
         where user_id = v_uid and slot = p_slot and gold >= v_price
        returning gold into v_gold;
        if not found then
          v_rep := jsonb_build_object('ok', false, 'error', 'cannot_afford', 'seed', v_seed, 'price', v_price,
            'have', (select gold from public.player_state where user_id = v_uid and slot = p_slot));
        else
          insert into public.player_inventory as inv (user_id, slot, item_id, qty)
            values (v_uid, p_slot, v_seed, 1)
            on conflict (user_id, slot, item_id) do update set qty = inv.qty + 1;
          insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
            values (v_uid, p_slot, 'shop', 'farm_replant_seed', v_seed, 1, -v_price, 0, 0, 0,
                    jsonb_build_object('offer', v_offer, 'qty', 1, 'unit_gold', v_price, 'plot', p_plot_idx, 'crop', v_crop));
          v_bought := v_price;
        end if;
      end if;
    end if;
    if v_rep is null then
      v_rep := public.hr_farm_plant(p_slot, p_plot_idx, v_crop, md5(p_idem::text || ':farm_replant:plant')::uuid)
               || jsonb_build_object('bought', v_bought);
    end if;
  end if;

  v_out := v_h || jsonb_build_object('replant', v_rep);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_replant', v_out, now())
    on conflict (user_id, intent_id) do nothing;
  return v_out;
end $$;
revoke execute on function public.hr_farm_harvest_replant(int, int, uuid) from public;
revoke execute on function public.hr_farm_harvest_replant(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_farm_harvest_replant(int, int, uuid) to authenticated;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_farm_harvest_replant';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_farm_harvest_replant', 'p_slot integer, p_plot_idx integer, p_idem uuid', 'authenticated',
   'added 2026-11-22: hr_farm_harvest, then the same crop planted again through hr_farm_plant; with no seed held, one bought at the listed Shop seed row''s price (gold >= price, one shop ledger row); names a slot, a plot and a key only');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid constant uuid := '000000c0-0000-4000-a000-00005b0e0f01';
  v jsonb; v_s jsonb; v_g0 bigint; v_g1 bigint; v_price bigint; v_k uuid := gen_random_uuid(); v_n bigint;
begin
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'farm-window §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): probe character not made'; end if;
    delete from public.hr_rate_counters where user_id = v_uid;
    -- (a) THE SECTION: a fresh hero (the Camp) may plant 2 plots, plot level 1, the tier-2 price is the catalogue's.
    v_s := public.hr_farm_land_view(v_uid, 0);
    if (v_s->>'cap')::int <> 2 or (v_s->>'plot_level')::int <> 1 or jsonb_array_length(v_s->'plots') <> 0
       or (v_s->'upgrade'->>'gold')::bigint is distinct from (select gold_cost from public.hr_plot_tier where plot_level = 2) then
      raise exception 'VERIFY(a): a fresh hero''s farm_land reads %', v_s; end if;
    if not (public.hr_state_of(v_uid, 0) ? 'farm_land') then raise exception 'VERIFY(a): the envelope carries no farm_land'; end if;
    -- (b) plant a turnip: growing, not ready, waterable, ready_in_s = the crop's hours.
    v := public.hr_farm_plant(0, 0, 'turnip', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the first turnip was refused: %', v; end if;
    v_s := public.hr_farm_land_view(v_uid, 0)->'plots'->0;
    if (v_s->>'ready')::boolean or not (v_s->>'waterable')::boolean or v_s->>'crop' <> 'turnip'
       or abs((v_s->>'ready_in_s')::bigint - (select base_hours * 3600 from public.hr_crops where crop_id = 'turnip')) > 2 then
      raise exception 'VERIFY(b): a fresh turnip reads %', v_s; end if;
    -- (b2) watered at once: the window runs at 2x, so it is ready in HALF the crop's hours, and not waterable again.
    if coalesce(public.hr_farm_water(0, 0, gen_random_uuid())->>'ok', '') <> 'true' then raise exception 'VERIFY(b2): the first watering was refused'; end if;
    v_s := public.hr_farm_land_view(v_uid, 0)->'plots'->0;
    if (v_s->>'waterable')::boolean
       or abs((v_s->>'ready_in_s')::bigint - (select base_hours * 1800 from public.hr_crops where crop_id = 'turnip')) > 2 then
      raise exception 'VERIFY(b2): a watered turnip reads %', v_s; end if;
    -- (c) not ready: the replant answers the harvest's refusal and moves nothing.
    v := public.hr_farm_harvest_replant(0, 0, gen_random_uuid());
    if v->>'error' is distinct from 'not_ready' then raise exception 'VERIFY(c): an unripe replant answered %', v; end if;
    -- (d) ripe, seeds held: harvested and replanted from the bag; no gold moves.
    update public.player_farm set planted_at = now() - interval '30 hours' where user_id = v_uid and slot = 0 and plot_idx = 0;
    if not (public.hr_farm_land_view(v_uid, 0)->'plots'->0->>'ready')::boolean then raise exception 'VERIFY(d): a ripe plot is not ready'; end if;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = 0;
    select qty into v_n from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'turnip_seed';
    delete from public.hr_rate_counters where user_id = v_uid;
    v := public.hr_farm_harvest_replant(0, 0, v_k);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->'replant'->>'ok', '') <> 'true' or (v->'replant'->>'bought')::bigint <> 0 then
      raise exception 'VERIFY(d): a ripe replant with seeds answered %', v; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_g0
       or (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'turnip_seed') <> v_n - 1
       or (select crop_id from public.player_farm where user_id = v_uid and slot = 0 and plot_idx = 0) is distinct from 'turnip' then
      raise exception 'VERIFY(d): the replant did not take one own seed and replant turnip'; end if;
    -- (e) a replay is the cached answer: no second harvest, no second plant.
    if public.hr_farm_harvest_replant(0, 0, v_k) is distinct from v then raise exception 'VERIFY(e): a replay was not the cached answer'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and intent = 'farm_harvest') <> 1 then
      raise exception 'VERIFY(e): a replay harvested twice'; end if;
    -- (f) ripe, NO seed: one bought at the listed row's price, one shop ledger row, replanted.
    delete from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'turnip_seed';
    update public.player_farm set planted_at = now() - interval '30 hours' where user_id = v_uid and slot = 0 and plot_idx = 0;
    select price into v_price from public.hr_shop_supply_offers where kind = 'seed' and item_id = 'turnip_seed' order by price limit 1;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = 0;
    delete from public.hr_rate_counters where user_id = v_uid;
    v := public.hr_farm_harvest_replant(0, 0, gen_random_uuid());
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if coalesce(v->'replant'->>'ok', '') <> 'true' or (v->'replant'->>'bought')::bigint <> v_price or v_g1 <> v_g0 - v_price
       or exists (select 1 from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'turnip_seed')
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'shop' and intent = 'farm_replant_seed'
            and gold = -v_price and (meta->>'unit_gold')::bigint = v_price) <> 1 then
      raise exception 'VERIFY(f): a seedless replant answered % (gold % -> %, price %)', v, v_g0, v_g1, v_price; end if;
    -- (g) ripe, no seed, gold short: harvested, NOT replanted, nothing spent, refusal named.
    update public.player_farm set planted_at = now() - interval '30 hours' where user_id = v_uid and slot = 0 and plot_idx = 0;
    update public.player_state set gold = v_price - 1 where user_id = v_uid and slot = 0;
    delete from public.hr_rate_counters where user_id = v_uid;
    v := public.hr_farm_harvest_replant(0, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'replant'->>'error' is distinct from 'cannot_afford'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_price - 1
       or exists (select 1 from public.player_farm where user_id = v_uid and slot = 0 and plot_idx = 0 and crop_id is not null) then
      raise exception 'VERIFY(g): a short replant answered %', v; end if;
    -- (h) the cap: plot 2 is refused on the Camp, and an empty plot answers the harvest's refusal.
    if public.hr_farm_plant(0, 2, 'turnip', gen_random_uuid())->>'error' is distinct from 'plot_cap' then
      raise exception 'VERIFY(h): plot 2 was not refused on the Camp'; end if;
    if public.hr_farm_harvest_replant(0, 0, gen_random_uuid())->>'error' is distinct from 'empty_plot' then
      raise exception 'VERIFY(h): an empty plot was not refused'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_farm_harvest_replant(0, 0, gen_random_uuid())->>'error' is distinct from 'not_signed_in' then
      raise exception 'VERIFY(h): a signed-out ask was answered'; end if;
    raise exception using errcode = 'HR893', message = 'farm-window §4 complete - rolling back';
  exception when sqlstate 'HR893' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from public.player_ledger where user_id = v_uid) then
    raise exception 'VERIFY(i): §4 LEAKED a probe row'; end if;
  if has_function_privilege('anon', 'public.hr_farm_harvest_replant(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_farm_harvest_replant(integer,integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_farm_land_view(uuid,integer)', 'execute') then
    raise exception 'VERIFY(i): the farm-window grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'farm-window: farm_land section (cap, readiness, price), harvest-and-replant from own seed then one bought at the Shop price, replay cached, short gold refused by name; all green';
end $$;
