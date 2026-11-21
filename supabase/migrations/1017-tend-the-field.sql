-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1017-tend-the-field.sql — "TEND THE FIELD": ONE PRESS HARVESTS EVERY READY PLOT, PLANTS IT
--   AGAIN AND WATERS THE FIELD, AFTER THE SERVER'S SEED BILL IS ON SCREEN
--   (lane/c-tend-the-field, backend-architect, 2026-11-20; build plan row L09, docs/design/balance-program/30-plan.md §D,
--   call 26-4 RULED yes: 26-home.md §6, "a visit is 2 presses a bed one at a time, 34 presses at 17 beds").
--
-- STATUS: supabase/migration-notes/1017-tend-the-field.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (set/v0.2.144,
--   up to 1016; renumbered from 1009 past lane/c-approved-rows' 1009-1015 and lane/c-levels-7-9's 1016, none of which
--   writes an object this file does). EDGE: none (no engine file moves).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Farming is the one town system all four real players use, and a visit is two presses a plot, each waiting for the
--   one before (Harvest and replant, then Water): 24 presses at 12 plots, 34 at 17, and every House rung that adds a
--   plot adds two more. The fix is ONE intent over the farm verbs that already exist; the rules of a plot do not move
--   (8 waterings a planting, growth never past twice real time, the seeded roll, the day budget, the plot tier and the
--   Farming level gates, seeds from the bag then Storage, a missing seed bought at the Shop's own price).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_farm_tend_plan(p_user uuid, p_slot int, p_crop text) -> jsonb   OWNER-ONLY, STABLE. THE ONE PLAN: what a tend
--    does on the account's field for this hero NOW (server clock), read only. Both the envelope's bill (§2) and the verb
--    (§3) call it, so the bill on screen and what the press does are one code path.
--      p_crop null  each ready plot goes back in with ITS OWN crop (the plot remembers it until the harvest clears it);
--                   an empty plot has nothing to remember and stays empty (why 'unplanted').
--      p_crop set   the player's chosen crop goes into every plot the tend plants: each ready plot that empties AND every
--                   empty plot inside the field. It must be a catalogue crop the hero can plant now, else the plan
--                   refuses whole: unknown_crop · level_too_low {req_lv} · crop_untiered · plot_tier_locked.
--    A ready plot is harvested. Then: past the field's cap (an extra plot) it is gone; a regrowing vine with regrows
--    left stays and is watered (the harvest replanted it dry); any other is planted (below). A growing plot is watered
--    when hr_farm_water would take it (not ready, its 2 h window closed, under 8 waterings). Each plot to plant, in
--    index order, passes the hero's Farming level and the account's plot tier (else it stays empty, why level_too_low /
--    plot_tier_locked {need}), then takes one seed: the hero's bag, then the account's Storage, then ONE bought at the
--    lowest `seed` row of hr_shop_supply_offers while the account purse still covers it (else empty, why
--    no_seed_for_sale {seed} / cannot_afford {seed, price}). A planted plot is watered too.
--      { ok:true, crop, harvest:[i], plant:[{i,crop}], water:[i], empty:[{i,crop,why,need?,seed?,price?}],
--        seeds:[{seed,crop,use,bag,storage,buy,price,gold}], gold }        gold = what the tend will charge, whole.
-- §2 hr_farm_tend_view(p_user, p_slot) -> jsonb   OWNER-ONLY, STABLE; the envelope section `farm_tend` (hr_state_sections):
--    the default plan (p_crop null) without ok/crop, plus `choices`: one compact bill per crop the hero can plant now
--    ({crop, plant, water, bag, storage, buy, gold, price, empty:[i], why}: counts, the plots it leaves empty and the first
--    reason), priced only when the default plants or leaves
--    empty at least one plot. Null for no hero. The Farm window renders only this (src/session/farm-tend.js).
-- §3 hr_farm_tend(p_slot int, p_crop text, p_gold bigint, p_idem uuid) -> jsonb   CLIENT (authenticated). Names a slot,
--    a crop id or null, the bill's gold the player SAW and a key: never a plot, a count or a time.
--      refusals (each journalled by hr_note_rejection, nothing written): not_signed_in · bad_intent (no key/slot, gold
--      null or < 0, a crop id not ^[a-z_]{1,32}$) · intent_mismatch · settle_first (an unpaid hunt window, the
--      harvest's own rule, said once for the field) · rate_limited (the harvest's bucket) · no_character · the plan's
--      unknown_crop / level_too_low / crop_untiered / plot_tier_locked · nothing_to_tend {bill} · quote_changed {gold,
--      bill}: the plan's gold under the locks is not p_gold, so the server never charges a sum the player did not see.
--    Accepted: (1) every planned harvest through hr_farm_harvest (UNCHANGED, called, pinned §0); (2) the seeds re-derived
--    for the plantings whose plot is empty now (never more than the bill: a refused harvest only lowers it), each seed
--    type paid through hr_farm_purse_pay (the account purse) with one ledger row (kind shop, intent farm_tend_seed,
--    gold kind farm); (3) every such planting through hr_farm_plant (UNCHANGED); (4) every planned watering through
--    hr_farm_water (UNCHANGED), skipping a plot a refused step left alone; one summary journal row (kind farm, intent
--    farm_tend, no value: the inner verbs journal every value); the receipt under the key. A step the inner verb refuses
--    (its day budget, its rate bucket) is reported in `failed` and moves nothing; if nothing at all moved the tend
--    answers that refusal and stores no receipt.
--      { ok:true, crop, harvested:[{i,crop,produce,qty,xp,regrew,withered,extra}], planted:[{i,crop}], watered:[i],
--        bought:[{seed,qty,gold}], gold, xp, empty:[...the plan's], failed:[{i,step,error}] }
--    Inner keys are md5(p_idem || ':farm_tend:<step>:<plot>'), so every inner verb is idempotent under the outer key.
--
-- ── CONCURRENCY AND IDEMPOTENCY ──────────────────────────────────────────────
-- ONE LOCK ORDER, taken whole before the plan (the one hr_farm_harvest_replant reaches step by step): the acting HERO's
--   advisory key -> its player_state row (for update) -> the account FARM key (hr_farm_lock) -> the account DEPOT key ->
--   the account PURSE row (hr_purse_lock). The plan is computed under all of them, so nothing it read can move before
--   the act; the inner verbs re-take locks this transaction already holds (no-ops). Two heroes of one account tending
--   at once serialise on the farm key: the second plans the field the first left and answers nothing_to_tend or a new
--   bill. A same-key retry answers the stored receipt (hr_intent_replay, per key, intent and slot); a new key right
--   after a tend finds every plot just planted and watered: nothing_to_tend. now() is the transaction's one clock.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- +1 client RPC. It carries no number the server spends: p_gold is only compared with the server's own sum (quote
--   pattern, 2026-10-25-stamina-refill.sql), so a forged p_gold is quote_changed and moves nothing. It can do only what
--   the player could already do by pressing Harvest / Plant / Water per plot, each through the same verb with the same
--   gates, roll, budget and journal; the seed price is the Shop's row; the purse can only go down by what the plan
--   priced (a debit past it raises and rolls the whole tend back). No plot index crosses the wire, so no forged bed: the
--   plan reads only the caller's own field (auth.uid()), never another account's, and never plants past the field's cap.
--   A seed buy is a sink at the Shop's price, bounded per call by the field's plots (17 at the top today).
--
-- ── COST AT 100x PLAYERS ─────────────────────────────────────────────────────
-- Rows per tend = what the same visit pressed by hand writes (one ledger + one intent row per harvest, plant and water)
--   + one farm_tend summary row + one farm_tend_seed row per seed type bought; no per-tick row. The envelope gains one
--   section: one plan (a scan of the account's plots, at most ~17 rows, a few index reads) per hr_state_of, plus one per
--   plantable crop (at most 9) only when a plot is to be planted or stands empty; under 1 KB of JSON.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop function public.hr_farm_tend(int, text, bigint, uuid), public.hr_farm_tend_view(uuid, int),
--   public.hr_farm_tend_plan(uuid, int, text); delete the hr_state_sections row 'farm_tend' and the hr_client_rpc_baseline
--   row 'hr_farm_tend'. No table or column moves; every value a tend moved is journalled by the verbs it called.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
-- The four verbs this file CALLS are the images it reads the answers of (the replayed chain on set/v0.2.143; md5 of prosrc,
-- carriage returns removed). Any other body is a restatement this file was not written against: refuse, re-read, re-pin.
do $mig$
declare v_sig text; v_pin text; v_md5 text;
begin
  if to_regclass('public.account_farm_plots') is null or to_regclass('public.hr_crops') is null
     or to_regclass('public.hr_crop_plot_tier') is null or to_regclass('public.hr_shop_supply_offers') is null
     or to_regclass('public.account_wallet') is null or to_regclass('public.account_bank') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: a table the tend reads is missing (apply 2026-12-14-shared-farm.sql and 2026-12-15-account-gold.sql first)'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_settle_first_noted(text,uuid,integer)') is null
     or to_regprocedure('public.hr_farm_lock(uuid)') is null or to_regprocedure('public.hr_farm_plot_cap(uuid)') is null
     or to_regprocedure('public.hr_farm_plot_level(uuid)') is null or to_regprocedure('public.hr_purse_lock(uuid)') is null
     or to_regprocedure('public.hr_purse_of(uuid)') is null or to_regprocedure('public.hr_level_from_xp(bigint)') is null
     or to_regprocedure('public.hr_farm_growth_hours(timestamp with time zone,timestamp with time zone[],timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper the tend calls is missing'; end if;
  for v_sig, v_pin in values
    ('public.hr_farm_harvest(integer,integer,uuid)',      '6eecf24a7b44ed6b21b21c24678fce0a'),
    ('public.hr_farm_plant(integer,integer,text,uuid)',   '3afdde2f463aee5da658a819389a22ac'),
    ('public.hr_farm_water(integer,integer,uuid)',        '68c370148c33add05e756ddaa2f45b60'),
    ('public.hr_farm_purse_pay(uuid,integer,bigint)',     'a8d70b18926e10157c873126aab36fdb')
  loop
    if to_regprocedure(v_sig) is null then raise exception 'PRECONDITION: % is missing', v_sig; end if;
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_sig);
    if v_md5 is distinct from v_pin then
      raise exception 'PIN: % is not the image this file reads the answer of (%) - md5 %: another file moved it; re-read and re-pin', v_sig, v_pin, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ONE PLAN ─────────────────────────────────────────────────────────
create or replace function public.hr_farm_tend_plan(p_user uuid, p_slot integer, p_crop text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path = public, pg_catalog
as $fn$
-- hr_farm_tend_plan (1017-tend-the-field.sql): what "Tend the field" does on p_user's field for hero p_slot NOW, by the
-- server clock, read only. Every rule is the farm verbs' own: readiness and watering are hr_farm_harvest's and
-- hr_farm_water's tests, a regrow is the harvest's rule, the gates are hr_farm_plant's, the seed comes from the bag, then
-- Storage, then the Shop's lowest `seed` row while the account purse covers it. See the file header for the answer.
declare
  c_window_s      constant numeric := 2 * 3600;   -- hr_farm_water's window
  c_max_waterings constant int := 8;              -- hr_farm_water's cap
  v_cap     int;
  v_plot_lv int;
  v_farm_lv int;
  v_left    bigint;                 -- the account purse, less what this plan has priced so far
  v_pick    public.hr_crops%rowtype;
  v_c       public.hr_crops%rowtype;
  v_tier    int;
  r         record;
  k         int;
  v_harvest int[] := '{}';
  v_water   int[] := '{}';
  v_sow_i   int[] := '{}';
  v_sow_c   text[] := '{}';
  v_plant   jsonb := '[]'::jsonb;
  v_empty   jsonb := '[]'::jsonb;
  v_lines   jsonb := '{}'::jsonb;   -- seed -> its line, made on first use
  v_l       jsonb;
  v_price   bigint;
begin
  if p_user is null or p_slot is null then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_cap     := public.hr_farm_plot_cap(p_user);
  v_plot_lv := public.hr_farm_plot_level(p_user);
  v_farm_lv := public.hr_level_from_xp(coalesce((select s.xp from public.player_skills s
                 where s.user_id = p_user and s.slot = p_slot and s.skill_id = 'farming'), 0));
  v_left    := public.hr_purse_of(p_user);

  -- THE PLAYER'S CHOSEN CROP: a catalogue crop this hero can plant now, or the plan refuses whole.
  if p_crop is not null then
    select * into v_pick from public.hr_crops where crop_id = p_crop;
    if v_pick.crop_id is null then return jsonb_build_object('ok', false, 'error', 'unknown_crop'); end if;
    if v_farm_lv < v_pick.req_lv then
      return jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_pick.req_lv); end if;
    select t.plot_tier into v_tier from public.hr_crop_plot_tier t where t.crop_id = p_crop;
    if v_tier is null then return jsonb_build_object('ok', false, 'error', 'crop_untiered'); end if;
    if v_tier > v_plot_lv then
      return jsonb_build_object('ok', false, 'error', 'plot_tier_locked', 'need_plot_level', v_tier, 'have_plot_level', v_plot_lv); end if;
  end if;

  -- (1) EVERY PLANTED PLOT, in index order.
  for r in
    select f.plot_idx as i, f.crop_id as crop, f.regrow_count, c.regrows, c.regrow_limit,
           c.base_hours - public.hr_farm_growth_hours(f.planted_at, f.waterings, now()) as rem_h,
           coalesce(array_length(f.waterings, 1), 0) as n_w,
           (select max(w) from unnest(f.waterings) w) as last_w
      from public.account_farm_plots f
      join public.hr_crops c on c.crop_id = f.crop_id
     where f.user_id = p_user
     order by f.plot_idx
  loop
    if r.rem_h <= 0 then
      v_harvest := v_harvest || r.i;
      if r.i >= v_cap then
        null;                                     -- an extra plot is gone after its harvest
      elsif r.regrows and (r.regrow_limit = 0 or r.regrow_count + 1 <= r.regrow_limit) then
        v_water := v_water || r.i;                -- the vine stays: the harvest set it growing again, dry
      else
        v_sow_i := v_sow_i || r.i;                -- emptied by the harvest (a vine on its last harvest withers)
        v_sow_c := v_sow_c || coalesce(p_crop, r.crop);
      end if;
    elsif r.n_w < c_max_waterings and (r.last_w is null or r.last_w + make_interval(secs => c_window_s) <= now()) then
      v_water := v_water || r.i;
    end if;
  end loop;

  -- (2) EVERY EMPTY PLOT INSIDE THE FIELD: the chosen crop goes in; with none chosen there is nothing to remember.
  for k in select g from generate_series(0, v_cap - 1) g
            where not exists (select 1 from public.account_farm_plots f where f.user_id = p_user and f.plot_idx = g)
            order by g
  loop
    if p_crop is not null then
      v_sow_i := v_sow_i || k; v_sow_c := v_sow_c || p_crop;
    else
      v_empty := v_empty || jsonb_build_object('i', k, 'crop', null, 'why', 'unplanted');
    end if;
  end loop;

  -- (3) EACH PLOT TO PLANT, in index order: the hero's gates, then one seed (bag, Storage, then bought while the purse covers it).
  for r in select s.i, s.crop from unnest(v_sow_i, v_sow_c) as s(i, crop) order by s.i loop
    select * into v_c from public.hr_crops where crop_id = r.crop;
    select t.plot_tier into v_tier from public.hr_crop_plot_tier t where t.crop_id = r.crop;
    if v_farm_lv < v_c.req_lv then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'level_too_low', 'need', v_c.req_lv);
      continue; end if;
    if v_tier is null or v_tier > v_plot_lv then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'plot_tier_locked', 'need', v_tier);
      continue; end if;
    v_l := v_lines -> v_c.seed_item;
    if v_l is null then
      v_l := jsonb_build_object('seed', v_c.seed_item, 'crop', r.crop, 'use', 0, 'bag', 0, 'storage', 0, 'buy', 0, 'gold', 0,
        'price', (select o.price from public.hr_shop_supply_offers o
                   where o.kind = 'seed' and o.item_id = v_c.seed_item order by o.price, o.offer_id limit 1),
        'bag_held', coalesce((select i.qty from public.player_inventory i
                               where i.user_id = p_user and i.slot = p_slot and i.item_id = v_c.seed_item), 0),
        'storage_held', coalesce((select b.qty from public.account_bank b
                                   where b.user_id = p_user and b.item_id = v_c.seed_item), 0));
    end if;
    v_price := (v_l ->> 'price')::bigint;
    if (v_l ->> 'bag')::bigint < (v_l ->> 'bag_held')::bigint then
      v_l := v_l || jsonb_build_object('bag', (v_l ->> 'bag')::bigint + 1);
    elsif (v_l ->> 'storage')::bigint < (v_l ->> 'storage_held')::bigint then
      v_l := v_l || jsonb_build_object('storage', (v_l ->> 'storage')::bigint + 1);
    elsif coalesce(v_price, 0) <= 0 then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'no_seed_for_sale', 'seed', v_c.seed_item);
      v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
      continue;
    elsif v_left >= v_price then
      v_l := v_l || jsonb_build_object('buy', (v_l ->> 'buy')::bigint + 1, 'gold', (v_l ->> 'gold')::bigint + v_price);
      v_left := v_left - v_price;
    else
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'cannot_afford', 'seed', v_c.seed_item, 'price', v_price);
      v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
      continue;
    end if;
    v_l := v_l || jsonb_build_object('use', (v_l ->> 'use')::bigint + 1);
    v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
    v_plant := v_plant || jsonb_build_object('i', r.i, 'crop', r.crop);
    v_water := v_water || r.i;                    -- a fresh planting is dry
  end loop;

  return jsonb_build_object('ok', true, 'crop', p_crop,
    'harvest', to_jsonb(v_harvest),
    'plant', v_plant,
    'water', (select coalesce(jsonb_agg(w order by w), '[]'::jsonb) from unnest(v_water) w),
    'empty', (select coalesce(jsonb_agg(e order by (e ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(v_empty) e),
    'seeds', (select coalesce(jsonb_agg(x.l - 'bag_held' - 'storage_held' order by x.k), '[]'::jsonb)
                from jsonb_each(v_lines) as x(k, l) where (x.l ->> 'use')::int > 0),
    'gold', (select coalesce(sum((x.l ->> 'gold')::bigint), 0) from jsonb_each(v_lines) as x(k, l)));
end $fn$;

-- ── §2 THE ENVELOPE'S BILL ─────────────────────────────────────────────────
create or replace function public.hr_farm_tend_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path = public, pg_catalog
as $fn$
-- hr_farm_tend_view (1017-tend-the-field.sql): the `farm_tend` section. The plan with no crop chosen, and one compact
-- bill per crop this hero can plant now, priced only when the default plants a plot or leaves one empty.
declare
  v jsonb;
  p jsonb;
  r record;
  v_choices jsonb := '[]'::jsonb;
  v_farm_lv int;
  v_plot_lv int;
begin
  v := public.hr_farm_tend_plan(p_user, p_slot, null);
  if v is null or coalesce(v ->> 'ok', '') <> 'true' then return null; end if;
  if jsonb_array_length(v -> 'plant') + jsonb_array_length(v -> 'empty') > 0 then
    v_farm_lv := public.hr_level_from_xp(coalesce((select s.xp from public.player_skills s
                   where s.user_id = p_user and s.slot = p_slot and s.skill_id = 'farming'), 0));
    v_plot_lv := public.hr_farm_plot_level(p_user);
    for r in select c.crop_id, c.seed_item from public.hr_crops c join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
              where c.req_lv <= v_farm_lv and t.plot_tier <= v_plot_lv
              order by c.req_lv, c.crop_id
    loop
      p := public.hr_farm_tend_plan(p_user, p_slot, r.crop_id);
      continue when coalesce(p ->> 'ok', '') <> 'true';
      v_choices := v_choices || jsonb_build_object('crop', r.crop_id,
        'plant', jsonb_array_length(p -> 'plant'), 'water', jsonb_array_length(p -> 'water'),
        'bag', (select coalesce(sum((l ->> 'bag')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'storage', (select coalesce(sum((l ->> 'storage')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'buy', (select coalesce(sum((l ->> 'buy')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'gold', (p ->> 'gold')::bigint,
        'price', (select o.price from public.hr_shop_supply_offers o
                   where o.kind = 'seed' and o.item_id = r.seed_item order by o.price, o.offer_id limit 1),
        'empty', (select coalesce(jsonb_agg(e -> 'i' order by (e ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(p -> 'empty') e),
        'why', p -> 'empty' -> 0 ->> 'why');
    end loop;
  end if;
  return (v - 'ok' - 'crop') || jsonb_build_object('choices', v_choices);
end $fn$;

insert into public.hr_state_sections (key, fn, note) values
  ('farm_tend', 'hr_farm_tend_view', '1017-tend-the-field.sql: the Tend the field bill by the server clock: the ready plots it harvests, the plots it plants again (each its own crop) and waters, the seeds it takes from the bag and Storage and buys with their gold, the plots that stay empty and why, and one compact bill per crop the hero can plant now')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE VERB ─────────────────────────────────────────────────────────────
create or replace function public.hr_farm_tend(p_slot integer, p_crop text, p_gold bigint, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_catalog
as $fn$
-- hr_farm_tend (1017-tend-the-field.sql): "Tend the field", one press. The plan under every lock, its gold matched with the
-- bill the player saw, then the farm verbs, UNCHANGED, plot by plot: harvest, the seeds, plant, water. See the file header.
declare
  c_verb constant text := 'farm_tend';
  v_uid    uuid := auth.uid();
  v_cached jsonb;
  v_plan   jsonb;
  v_r      jsonb;
  v_i      int;
  r        record;
  v_need   bigint;
  v_have   bigint;
  v_buy    bigint;
  v_offer  text;
  v_pay    jsonb;
  v_gold   bigint := 0;
  v_xp     bigint := 0;
  v_skip   int[] := '{}';               -- plots a refused step leaves alone
  v_sow    jsonb;                       -- the planned plantings whose plot is empty now
  v_harvested jsonb := '[]'::jsonb;
  v_planted   jsonb := '[]'::jsonb;
  v_watered   jsonb := '[]'::jsonb;
  v_bought    jsonb := '[]'::jsonb;
  v_failed    jsonb := '[]'::jsonb;
  v_out    jsonb;
begin
  if v_uid is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_idem is null or p_slot is null or p_gold is null or p_gold < 0
     or (p_crop is not null and p_crop !~ '^[a-z_]{1,32}$') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT): a stored receipt is the answer, before any gate.
  v_cached := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection(c_verb, p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql): the harvest's own rule, said once for the whole field.
  declare v_settle jsonb := public.hr_settle_first_noted(c_verb, v_uid, p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  -- the harvest's own bucket; every inner verb spends its own as it does when pressed by hand
  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- THE LOCK ORDER, whole, before the plan: HERO key -> HERO row -> account FARM key -> account DEPOT key -> account PURSE row.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));
  perform 1 from public.player_state where user_id = v_uid and slot = p_slot for update;
  if not found then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  perform public.hr_purse_lock(v_uid);

  -- THE PLAN, under every lock; its gold must be the bill the player saw.
  v_plan := public.hr_farm_tend_plan(v_uid, p_slot, p_crop);
  if coalesce(v_plan ->> 'ok', '') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_plan); end if;
  if jsonb_array_length(v_plan -> 'harvest') + jsonb_array_length(v_plan -> 'plant') + jsonb_array_length(v_plan -> 'water') = 0 then
    return public.hr_note_rejection(c_verb, p_slot,
      jsonb_build_object('ok', false, 'error', 'nothing_to_tend', 'bill', v_plan - 'ok')); end if;
  if (v_plan ->> 'gold')::bigint <> p_gold then
    return public.hr_note_rejection(c_verb, p_slot,
      jsonb_build_object('ok', false, 'error', 'quote_changed', 'gold', (v_plan ->> 'gold')::bigint, 'bill', v_plan - 'ok')); end if;

  -- (1) HARVEST every ready plot: hr_farm_harvest, its gates, roll, perks, budget and journal.
  for v_i in select (e #>> '{}')::int from jsonb_array_elements(v_plan -> 'harvest') e loop
    v_r := public.hr_farm_harvest(p_slot, v_i, md5(p_idem::text || ':farm_tend:harvest:' || v_i::text)::uuid);
    if coalesce(v_r ->> 'ok', '') = 'true' then
      v_harvested := v_harvested || jsonb_build_object('i', v_i, 'crop', v_r -> 'crop', 'produce', v_r -> 'produce',
        'qty', v_r -> 'qty', 'xp', v_r -> 'xp', 'regrew', v_r -> 'regrew', 'withered', v_r -> 'withered', 'extra', v_r -> 'extra');
      v_xp := v_xp + coalesce((v_r ->> 'xp')::bigint, 0);
    else
      v_failed := v_failed || jsonb_build_object('i', v_i, 'step', 'harvest', 'error', coalesce(v_r ->> 'error', 'refused'));
      v_skip := v_skip || v_i;
    end if;
  end loop;

  -- (2) THE SEEDS for the plantings whose plot is empty now, re-derived by the plan's rule (never more than the bill).
  select coalesce(jsonb_agg(p order by (p ->> 'i')::int), '[]'::jsonb) into v_sow
    from jsonb_array_elements(v_plan -> 'plant') p
   where not exists (select 1 from public.account_farm_plots f where f.user_id = v_uid and f.plot_idx = (p ->> 'i')::int);
  for r in select l ->> 'seed' as seed, l ->> 'crop' as crop, (l ->> 'price')::bigint as price, (l ->> 'buy')::bigint as buy
             from jsonb_array_elements(v_plan -> 'seeds') l
            where (l ->> 'buy')::bigint > 0
            order by 1
  loop
    select count(*) into v_need from jsonb_array_elements(v_sow) p
      join public.hr_crops c on c.crop_id = p ->> 'crop' where c.seed_item = r.seed;
    v_have := coalesce((select i.qty from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = r.seed), 0)
            + coalesce((select b.qty from public.account_bank b where b.user_id = v_uid and b.item_id = r.seed), 0);
    v_buy := least(r.buy, greatest(0, v_need - v_have));
    continue when v_buy <= 0;
    select o.offer_id into v_offer from public.hr_shop_supply_offers o
     where o.kind = 'seed' and o.item_id = r.seed order by o.price, o.offer_id limit 1;
    v_pay := public.hr_farm_purse_pay(v_uid, p_slot, v_buy * r.price);
    if coalesce(v_pay ->> 'ok', '') <> 'true' then
      -- the purse is locked and the plan priced it: a refusal here is a broken invariant, never a partial charge
      raise exception 'hr_farm_tend: the locked purse refused % gold the plan priced: %', v_buy * r.price, v_pay; end if;
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (v_uid, p_slot, r.seed, v_buy)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
      values (v_uid, p_slot, 'shop', 'farm_tend_seed', r.seed, v_buy, -(v_buy * r.price), 0, 0, 0,
              jsonb_build_object('offer', v_offer, 'qty', v_buy, 'unit_gold', r.price, 'crop', r.crop, 'purse', v_pay ->> 'purse'));
    v_bought := v_bought || jsonb_build_object('seed', r.seed, 'qty', v_buy, 'gold', v_buy * r.price);
    v_gold := v_gold + v_buy * r.price;
  end loop;

  -- (3) PLANT: hr_farm_plant, its gates, the seed (bag, then Storage), its XP and journal.
  for r in select (p ->> 'i')::int as i, p ->> 'crop' as crop from jsonb_array_elements(v_sow) p order by 1 loop
    v_r := public.hr_farm_plant(p_slot, r.i, r.crop, md5(p_idem::text || ':farm_tend:plant:' || r.i::text)::uuid);
    if coalesce(v_r ->> 'ok', '') = 'true' then
      v_planted := v_planted || jsonb_build_object('i', r.i, 'crop', r.crop);
      v_xp := v_xp + coalesce((v_r ->> 'plant_xp')::bigint, 0);
    else
      v_failed := v_failed || jsonb_build_object('i', r.i, 'step', 'plant', 'error', coalesce(v_r ->> 'error', 'refused'));
      v_skip := v_skip || r.i;
    end if;
  end loop;

  -- (4) WATER: hr_farm_water, its window, cap, XP and journal; never a plot a refused step left alone.
  for v_i in select (e #>> '{}')::int from jsonb_array_elements(v_plan -> 'water') e loop
    continue when v_i = any (v_skip);
    v_r := public.hr_farm_water(p_slot, v_i, md5(p_idem::text || ':farm_tend:water:' || v_i::text)::uuid);
    if coalesce(v_r ->> 'ok', '') = 'true' then
      v_watered := v_watered || to_jsonb(v_i);
      v_xp := v_xp + coalesce((v_r ->> 'water_xp')::bigint, 0);
    else
      v_failed := v_failed || jsonb_build_object('i', v_i, 'step', 'water', 'error', coalesce(v_r ->> 'error', 'refused'));
    end if;
  end loop;

  -- NOTHING MOVED (every step refused by its own verb): that refusal is the answer, and no receipt is stored.
  if jsonb_array_length(v_harvested) + jsonb_array_length(v_planted) + jsonb_array_length(v_watered) + jsonb_array_length(v_bought) = 0 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false,
      'error', coalesce(v_failed -> 0 ->> 'error', 'refused'), 'failed', v_failed)); end if;

  v_out := jsonb_build_object('ok', true, 'crop', p_crop, 'harvested', v_harvested, 'planted', v_planted,
    'watered', v_watered, 'bought', v_bought, 'gold', v_gold, 'xp', v_xp, 'empty', v_plan -> 'empty', 'failed', v_failed);
  -- ONE summary row, no value in it (each verb journalled its own): what this press did, for a dispute.
  insert into public.player_ledger (user_id, slot, kind, intent, qty, gold_in, xp_in, qty_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_tend', 0, 0, 0, 0,
            jsonb_build_object('crop', p_crop, 'harvested', jsonb_array_length(v_harvested), 'planted', jsonb_array_length(v_planted),
                               'watered', jsonb_array_length(v_watered), 'gold', v_gold, 'xp', v_xp,
                               'empty', v_plan -> 'empty', 'failed', v_failed, 'field', 'account'));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_out, now())
    on conflict (user_id, intent_id) do nothing;
  return v_out;
end $fn$;

-- ── §3b GRANTS: the plan and the view are the owner's; the verb is the client's alone ──
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_farm_tend_plan(uuid,integer,text)', 'public.hr_farm_tend_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
revoke execute on function public.hr_farm_tend(integer, text, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_tend(integer, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_farm_tend';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_farm_tend', 'p_slot integer, p_crop text, p_gold bigint, p_idem uuid', 'authenticated',
   'added 1017-tend-the-field.sql (lane/c-tend-the-field): Tend the field, one press: every ready plot harvested, planted again (its own crop or the chosen one) and the field watered, through hr_farm_harvest / hr_farm_plant / hr_farm_water unchanged; seeds from the bag, Storage, then bought at the Shop''s price; p_gold is only compared with the server''s bill (quote_changed); names a slot, a crop id, the bill and a key, never a plot; pre-EA Security list');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE BILL: the envelope's farm_tend reads the field exactly (a ready plot, a growing one, an extra one).
-- (b) ONE PRESS harvests, plants again and waters exactly: the rows, the bag, the ledger, the XP.
-- (c) THE SAME KEY answers the same receipt and moves nothing; (d) a NEW KEY right after is nothing_to_tend.
-- (e) THE SEED BILL: a seed bought at the Shop's price, a plot left empty for want of gold; a wrong price is quote_changed.
-- (f) FORGED: an unknown crop, a crop above the hero's Farming, a malformed id, a negative price: refused, nothing moves.
-- (g) THE CHOSEN CROP fills an empty plot; (h) ANOTHER ACCOUNT's tend never touches this field (no forged bed).
-- (i) no probe row leaks; the grants, the section and the client baseline; grant hygiene.
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00001009fe01';
  v_v constant uuid := '000000c0-0000-4000-a000-00001009fe02';
  k   constant text := '000000c0-0000-4000-b000-00001009';
  v jsonb; v2 jsonb; b jsonb; v_who uuid; v_xp0 bigint; v_xp1 bigint; v_led bigint; v_plots text;
begin
  begin
    foreach v_who in array array[v_u, v_v] loop
      perform set_config('request.jwt.claim.sub', v_who::text, true);
      insert into auth.users (id) values (v_who) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_who, '1017-tend-the-field §4 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v ->> 'ok', '') <> 'true' then raise exception 'tend §4: hr_create_character(0) refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if public.hr_farm_plot_cap(v_u) <> 2 then raise exception 'tend §4: a fresh account''s field is % plots, the probe needs 2', public.hr_farm_plot_cap(v_u); end if;
    -- the probe's field: plot 0 ready turnip, plot 1 growing turnip (an hour in, never watered), plot 7 an EXTRA ready turnip
    delete from public.account_farm_plots where user_id = v_u;
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by) values
      (v_u, 0, 'turnip', now() - interval '2000 hours', '{}', 0, 0),
      (v_u, 1, 'turnip', now() - interval '1 hour', '{}', 0, 0),
      (v_u, 7, 'turnip', now() - interval '2000 hours', '{}', 0, 0);
    delete from public.player_inventory where user_id = v_u and item_id in ('turnip_seed', 'turnip');
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'turnip_seed', 3);
    delete from public.account_bank where user_id = v_u and item_id = 'turnip_seed';
    insert into public.account_wallet as w (user_id, gold, version, updated_at) values (v_u, 1000, 1, now())
      on conflict (user_id) do update set gold = excluded.gold;
    select coalesce(sum(xp), 0) into v_xp0 from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'farming';

    -- (a) THE BILL
    b := public.hr_state_of(v_u, 0) -> 'farm_tend';
    if b is null or b -> 'harvest' <> '[0, 7]'::jsonb or b -> 'plant' <> '[{"i": 0, "crop": "turnip"}]'::jsonb
       or b -> 'water' <> '[0, 1]'::jsonb or b -> 'empty' <> '[]'::jsonb or (b ->> 'gold')::bigint <> 0
       or b -> 'seeds' <> '[{"seed": "turnip_seed", "crop": "turnip", "use": 1, "bag": 1, "storage": 0, "buy": 0, "gold": 0, "price": 5}]'::jsonb then
      raise exception 'tend §4(a): the envelope''s bill reads %', b; end if;
    if jsonb_typeof(b -> 'choices') <> 'array' or not exists (select 1 from jsonb_array_elements(b -> 'choices') c
         where c ->> 'crop' = 'turnip' and (c ->> 'plant')::int = 1 and (c ->> 'gold')::bigint = 0) then
      raise exception 'tend §4(a): the chosen-crop bills read %', b -> 'choices'; end if;

    -- (b) ONE PRESS
    select count(*) into v_led from public.player_ledger where user_id = v_u;
    v := public.hr_farm_tend(0, null, (b ->> 'gold')::bigint, (k || '0001')::uuid);
    if coalesce(v ->> 'ok', '') <> 'true' or jsonb_array_length(v -> 'harvested') <> 2 or v -> 'planted' <> '[{"i": 0, "crop": "turnip"}]'::jsonb
       or v -> 'watered' <> '[0, 1]'::jsonb or v -> 'failed' <> '[]'::jsonb or v -> 'bought' <> '[]'::jsonb or (v ->> 'gold')::bigint <> 0 then
      raise exception 'tend §4(b): one press answered %', v; end if;
    select string_agg(plot_idx || ':' || crop_id || ':' || coalesce(array_length(waterings, 1), 0) || ':' || (planted_at = now()), ',' order by plot_idx)
      into v_plots from public.account_farm_plots where user_id = v_u;
    if v_plots is distinct from '0:turnip:1:true,1:turnip:1:false' then
      raise exception 'tend §4(b): the field after one press reads % (want plot 0 planted again now and watered, plot 1 watered, plot 7 gone)', v_plots; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip_seed') is distinct from 2::bigint then
      raise exception 'tend §4(b): one seed was not taken from the bag'; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip')
       is distinct from (select sum((h ->> 'qty')::bigint) from jsonb_array_elements(v -> 'harvested') h) then
      raise exception 'tend §4(b): the bag''s turnips are not the two harvests'' %', v -> 'harvested'; end if;
    select xp into v_xp1 from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'farming';
    if v_xp1 - v_xp0 <> (v ->> 'xp')::bigint then raise exception 'tend §4(b): Farming XP moved % but the answer says %', v_xp1 - v_xp0, v ->> 'xp'; end if;
    if (select count(*) filter (where intent = 'farm_harvest') || '/' || count(*) filter (where intent = 'farm_plant') || '/'
            || count(*) filter (where intent = 'farm_water') || '/' || count(*) filter (where intent = 'farm_tend') || '/'
            || count(*) filter (where intent = 'farm_tend_seed') || '/' || count(*)
          from public.player_ledger where user_id = v_u) <> '2/1/2/1/0/' || (v_led + 6) then
      raise exception 'tend §4(b): the journal after one press is not 2 harvests, 1 plant, 2 waterings and 1 tend'; end if;

    -- (c) THE SAME KEY
    v2 := public.hr_farm_tend(0, null, 0, (k || '0001')::uuid);
    if v2 is distinct from v then raise exception 'tend §4(c): a replay answered % (first %)', v2, v; end if;
    if (select count(*) from public.player_ledger where user_id = v_u) <> v_led + 6 then raise exception 'tend §4(c): a replay journalled'; end if;
    if public.hr_farm_harvest(0, 0, (k || '0001')::uuid) ->> 'error' is distinct from 'intent_mismatch' then
      raise exception 'tend §4(c): the tend''s key was taken by hr_farm_harvest'; end if;

    -- (d) A NEW KEY RIGHT AFTER
    v2 := public.hr_farm_tend(0, null, 0, (k || '0002')::uuid);
    if v2 ->> 'error' is distinct from 'nothing_to_tend' then raise exception 'tend §4(d): a second visit answered %', v2; end if;
    if (select count(*) from public.player_ledger where user_id = v_u) <> v_led + 6 then raise exception 'tend §4(d): nothing_to_tend journalled'; end if;

    -- (e) THE SEED BILL: no seed held, the purse covers one seed (5) and not two
    update public.account_farm_plots set planted_at = now() - interval '2000 hours', waterings = '{}' where user_id = v_u;
    delete from public.player_inventory where user_id = v_u and item_id = 'turnip_seed';
    update public.account_wallet set gold = 7 where user_id = v_u;
    b := public.hr_state_of(v_u, 0) -> 'farm_tend';
    if b -> 'plant' <> '[{"i": 0, "crop": "turnip"}]'::jsonb or (b ->> 'gold')::bigint <> 5
       or b -> 'empty' <> '[{"i": 1, "crop": "turnip", "why": "cannot_afford", "seed": "turnip_seed", "price": 5}]'::jsonb
       or b -> 'seeds' <> '[{"seed": "turnip_seed", "crop": "turnip", "use": 1, "bag": 0, "storage": 0, "buy": 1, "gold": 5, "price": 5}]'::jsonb then
      raise exception 'tend §4(e): the seed bill reads %', b; end if;
    v2 := public.hr_farm_tend(0, null, 0, (k || '0003')::uuid);
    if v2 ->> 'error' is distinct from 'quote_changed' or (v2 ->> 'gold')::bigint <> 5
       or (select gold from public.account_wallet where user_id = v_u) <> 7
       or (select count(*) from public.account_farm_plots where user_id = v_u and planted_at > now() - interval '1 hour') <> 0 then
      raise exception 'tend §4(e): a press at the wrong price answered % or moved something', v2; end if;
    v := public.hr_farm_tend(0, null, 5, (k || '0004')::uuid);
    if coalesce(v ->> 'ok', '') <> 'true' or v -> 'bought' <> '[{"seed": "turnip_seed", "qty": 1, "gold": 5}]'::jsonb
       or v -> 'planted' <> '[{"i": 0, "crop": "turnip"}]'::jsonb or v -> 'empty' -> 0 ->> 'why' is distinct from 'cannot_afford'
       or (select gold from public.account_wallet where user_id = v_u) <> 2
       or exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 1)
       or coalesce((select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'turnip_seed'), 0) <> 0 then
      raise exception 'tend §4(e): the bought-seed press answered %', v; end if;
    if not exists (select 1 from public.player_ledger where user_id = v_u and intent = 'farm_tend_seed' and kind = 'shop'
                    and item_id = 'turnip_seed' and qty = 1 and gold = -5 and gold_kind = 'farm' and purse = 2) then
      raise exception 'tend §4(e): the seed purchase is not journalled (qty 1, gold -5, the purse after)'; end if;

    -- (f) FORGED
    select count(*) into v_led from public.player_ledger where user_id = v_u;
    if public.hr_farm_tend(0, 'mandrake', 0, (k || '0005')::uuid) ->> 'error' is distinct from 'unknown_crop'
       or public.hr_farm_tend(0, 'moonbloom', 0, (k || '0006')::uuid) ->> 'error' is distinct from 'level_too_low'
       or public.hr_farm_tend(0, 'Turnip; x', 0, (k || '0007')::uuid) ->> 'error' is distinct from 'bad_intent'
       or public.hr_farm_tend(0, null, -5, (k || '0008')::uuid) ->> 'error' is distinct from 'bad_intent'
       or public.hr_farm_tend(0, null, null, (k || '0009')::uuid) ->> 'error' is distinct from 'bad_intent'
       or public.hr_farm_tend(3, null, 0, (k || '000a')::uuid) ->> 'error' is distinct from 'no_character' then
      raise exception 'tend §4(f): a forged seed, price or slot was not refused'; end if;
    if (select count(*) from public.player_ledger where user_id = v_u) <> v_led then raise exception 'tend §4(f): a refusal journalled'; end if;

    -- (g) THE CHOSEN CROP: plot 1 stands empty; with turnip chosen one press plants and waters it
    update public.account_wallet set gold = 100 where user_id = v_u;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'turnip_seed', 4);
    b := public.hr_state_of(v_u, 0) -> 'farm_tend';
    if b -> 'empty' <> '[{"i": 1, "crop": null, "why": "unplanted"}]'::jsonb
       or not exists (select 1 from jsonb_array_elements(b -> 'choices') c where c ->> 'crop' = 'turnip' and (c ->> 'plant')::int = 1
                        and (c ->> 'bag')::int = 1 and (c ->> 'gold')::bigint = 0) then
      raise exception 'tend §4(g): the bill for an empty plot reads %', b; end if;
    v := public.hr_farm_tend(0, 'turnip', 0, (k || '000b')::uuid);
    if coalesce(v ->> 'ok', '') <> 'true' or v -> 'planted' <> '[{"i": 1, "crop": "turnip"}]'::jsonb or v -> 'watered' <> '[1]'::jsonb
       or not exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 1 and crop_id = 'turnip' and planted_by = 0) then
      raise exception 'tend §4(g): the chosen crop answered %', v; end if;

    -- (h) ANOTHER ACCOUNT: its tend plants its own field, inside its own cap, and leaves this one byte-identical
    select string_agg(plot_idx || ':' || crop_id || ':' || planted_at || ':' || coalesce(array_length(waterings, 1), 0), ',' order by plot_idx)
      into v_plots from public.account_farm_plots where user_id = v_u;
    select count(*) into v_led from public.player_ledger where user_id = v_u;
    perform set_config('request.jwt.claim.sub', v_v::text, true);
    v2 := public.hr_farm_tend(0, 'turnip', 0, (k || '000c')::uuid);
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if v_plots is distinct from (select string_agg(plot_idx || ':' || crop_id || ':' || planted_at || ':' || coalesce(array_length(waterings, 1), 0), ',' order by plot_idx)
                                  from public.account_farm_plots where user_id = v_u)
       or (select count(*) from public.player_ledger where user_id = v_u) <> v_led then
      raise exception 'tend §4(h): another account''s tend touched this field'; end if;
    if coalesce(v2 ->> 'ok', '') <> 'true' or jsonb_array_length(v2 -> 'planted') <> public.hr_farm_plot_cap(v_v)
       or exists (select 1 from jsonb_array_elements(v2 -> 'planted') p where (p ->> 'i')::int >= public.hr_farm_plot_cap(v_v))
       or (select count(*) from public.account_farm_plots where user_id = v_v) <> public.hr_farm_plot_cap(v_v) then
      raise exception 'tend §4(h): another account''s chosen-crop tend answered % (want its own empty field planted, inside its cap)', v2; end if;

    raise exception using errcode = 'HR9A9', message = '1017-tend-the-field §4 complete - rolling back';
  exception when sqlstate 'HR9A9' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (i) NOTHING LEAKED; THE WALLS
  if exists (select 1 from public.player_state where user_id in (v_u, v_v)) or exists (select 1 from public.account_farm_plots where user_id in (v_u, v_v))
     or exists (select 1 from public.player_ledger where user_id in (v_u, v_v)) or exists (select 1 from public.player_intents where user_id in (v_u, v_v)) then
    raise exception 'tend §4(i): the probe LEAKED a row'; end if;
  if public.hr_farm_tend(0, null, 0, gen_random_uuid()) ->> 'error' is distinct from 'not_signed_in' then
    raise exception 'tend §4(i): a signed-out call was not refused'; end if;
  if has_function_privilege('anon', 'public.hr_farm_tend(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_farm_tend(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_farm_tend(integer,text,bigint,uuid)', 'execute') then
    raise exception 'tend §4(i): hr_farm_tend is not authenticated-only'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid in ('public.hr_farm_tend(integer,text,bigint,uuid)'::regprocedure, 'public.hr_farm_tend_plan(uuid,integer,text)'::regprocedure,
                              'public.hr_farm_tend_view(uuid,integer)'::regprocedure)
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'tend §4(i): PUBLIC can execute a tend function'; end if;
  if has_function_privilege('authenticated', 'public.hr_farm_tend_plan(uuid,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_farm_tend_view(uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_farm_tend_view(uuid,integer)', 'execute') then
    raise exception 'tend §4(i): the plan or the view is client-executable'; end if;
  if (select fn from public.hr_state_sections where key = 'farm_tend') is distinct from 'hr_farm_tend_view' then
    raise exception 'tend §4(i): the farm_tend section is not registered'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_farm_tend' and grantee = 'authenticated'
                   and identity_args = 'p_slot integer, p_crop text, p_gold bigint, p_idem uuid') then
    raise exception 'tend §4(i): hr_farm_tend is not on hr_client_rpc_baseline'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice '1017-tend-the-field: one press harvests, plants again and waters exactly at the bill''s gold; a replay is the receipt; a forged seed, price or slot is refused; another account''s field is untouched; all green';
end $chk$;
