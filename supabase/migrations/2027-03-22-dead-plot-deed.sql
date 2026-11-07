-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEAD PLOT BUILDINGS AND THE FARMER'S DEED LEAVE THE SERVER
-- (lane/c-dead-plot-deed, backend-architect, 2026-11-07).
-- STAGED. Pre-EA: applies on its passing §2 (CLAUDE.md §2), one file via
-- tools/apply-migration.mjs, never inside begin/commit. It touches a gold sink
-- (hr_farm_upgrade_plot) and a harvest (hr_farm_harvest), so it is on the EA
-- Security list; it only REMOVES paths.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Two pieces of dead content, found by the coverage bot and lane/a-shown-but-refused:
--   · THE FOUR PLOT BUILDINGS (plot.farm_plot / scarecrow / toolshed / watchtower in
--     src/data/shops.js). Every verb refused them (unlock_buy: namespace_unsupported:plot;
--     shop_buy: offer_unsupported), no window listed them, and nothing could grant a
--     `plot:` building unlock. Their readers were dead with them: hr_perks_of's `plots`
--     key (the Tool Shed's +2% gatherSpeed in src/core/perks.js) and hr_farm_harvest's
--     Scarecrow term (x hr_farm_yield_perk 'scarecrow', 0 since 2026-10-14).
--   · THE FARMER'S DEED (farm_deed). It left src/data/items.js with every source it had at
--     the 2026-10-23 demolition, but hr_farm_upgrade_plot still took it as the fallback
--     payment and hr_farm_land_view still counted it and quoted the tier's deed price. The
--     client half was cut on lane/a-shown-but-refused; tests/catalogue-coherence.mjs C13
--     listed it as its one server item debt, and that list is now EMPTY.
-- Old content may be cut while nobody plays (CLAUDE.md §3.3b); no back-compat (§1).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §0 preconditions and pins: the four bodies are the replayed pre-images (or this file's
--    own, a re-apply); no player_progress row holds a plot building (none can: nothing
--    grants one) — a held row would be stranded by the catalogue cut, so the apply refuses
--    rather than evicts.
-- §1 four bodies RESTATED WHOLE from the replay chain's images (pg_get_functiondef),
--    each changed only where named:
--      hr_farm_upgrade_plot  GOLD ONLY: the deed fallback, its debit, its refusal fields
--                            (need_deeds / have_deeds) and its journal arm go; the price is
--                            read as gold_cost + req_farm_level; `max_plot_level` is `not
--                            found`; `tier_unpriced` is a tier above 1 with no gold. The
--                            answer loses `deeds_spent`; `paid_with` is always 'gold'.
--      hr_farm_land_view     the `deeds` key and `upgrade.deeds` go.
--      hr_farm_harvest       the Scarecrow term leaves the flat farmYield perk.
--      hr_perks_of           the `plots` key and `sources.plots` go.
--    Signatures, grants, locks, gates, refusals and idempotency are unchanged.
-- §2 SELF-CHECK, executed and rolled back: the four landed bodies are this file's; a hero
--    holding 99 Farmer's Deeds and no gold is refused cannot_afford and keeps every deed; the
--    same hero with the tier's gold + 7 buys it, keeps 7 and journals one gold row; the land
--    view and the perk answer carry no deed or plot key; a harvest with two Scarecrows on
--    the books and the Scarecrow's catalogue row raised to 1 pays no perk; no function body
--    names farm_deed, the deed price column or a plot building; grants unchanged; nothing leaked.
-- RIDES WITH three GENERATED files, in this order after it:
--    2027-03-22-dead-plot-deed-unlocks.generated.sql        hr_unlocks: the 4 plot rows retired
--    2027-03-22-dead-plot-deed-unlock-offers.generated.sql  hr_unlock_offers: the 4 refused rows go
--    2027-03-22-dead-plot-deed-farm-catalogues.generated.sql hr_plot_tier loses deed_cost
--      (its drop REFUSES while any body still reads the column, so it cannot land before this
--      file), hr_farm_yield_perk loses 'scarecrow'.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- Unchanged. hr_farm_upgrade_plot keeps its LOCK ORDER (the acting hero's player_state FOR
-- UPDATE -> the ACCOUNT FARM advisory lock -> account_farm -> the purse), its stale_level
-- check under the farm lock and its predicated tier write. The purse debit is
-- hr_farm_purse_pay's atomic, balance-predicated update; a refusal moves nothing. With one
-- payment there is no second branch to race. hr_farm_harvest's locks are untouched.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Only shrinks. One fewer payment path into a sink (an item debit with its own predicate
-- logic), one fewer perk term in a harvest's mint, one fewer key in the engine's perk
-- read. No client RPC is added or re-granted; no price, clamp or ledger rule moves. A
-- forged plot unlock row (impossible: no verb writes one) now pays nothing anywhere.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- Fewer reads: one player_inventory probe per farm envelope and per upgrade, and one
-- jsonb_object_agg filter per hr_perks_of call (every settle) fewer. No row is written.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the §0 pre-images: hr_farm_upgrade_plot / hr_farm_land_view / hr_farm_harvest
-- from 2026-12-14-shared-farm.sql, hr_perks_of from 2027-02-27-tempering.sql, after
-- re-adding hr_plot_tier.deed_cost (2026-10-23-demolition-farm-catalogues.generated.sql).
-- No player row is touched, so nothing is lost either way.
-- ORDER: after 2027-03-21-sewer-deadly-xp.generated.sql (the chain end at staging), before
-- the three generated files above. EDGE: hr-accrue moves (src/core/perks.js, src/core/farm.js,
-- src/data/shops.js): deploy it right after the apply. The old engine reads `plots` behind a
-- default (absent = zero), so either order is safe. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_sig text; v_pre text; v_own text; v_md5 text; v_n int;
begin
  if to_regclass('public.account_farm') is null or to_regclass('public.account_farm_plots') is null
     or to_regclass('public.hr_plot_tier') is null or to_regclass('public.hr_farm_yield_perk') is null
     or to_regprocedure('public.hr_farm_purse_pay(uuid,integer,bigint)') is null
     or to_regprocedure('public.hr_unlock_levels(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-12-14-shared-farm.sql and 2026-12-15-account-gold.sql first'; end if;
  -- Each body is the replayed pre-image (measured 2026-11-07 on the replay chain; live agrees, tests/live-hash-drift.baseline.json)
  -- or this file's own image (a re-apply). Any other body is a concurrent restatement: refuse, never silently revert it.
  for v_sig, v_pre, v_own in values
    ('public.hr_farm_upgrade_plot(integer,uuid,integer)', '43ceb8d319c2108e00f5024e10106313', '48880707ce62e4983addb9c2860063d9'),
    ('public.hr_farm_land_view(uuid,integer)',            '1a0c792b75cadfb4fc648e604f0c2a1e', '59e7bbfdec11e041b536943116c9bc40'),
    ('public.hr_farm_harvest(integer,integer,uuid)',      'e9541e054ed5dd2a79f51f3b1d7919d5', '6eecf24a7b44ed6b21b21c24678fce0a'),
    ('public.hr_perks_of(uuid,integer)',                  '83d5953ec2046b4375a86cbdacafd155', '9a53d68354e8373b61981995ad6ebc8f')
  loop
    if to_regprocedure(v_sig) is null then raise exception 'PRECONDITION: % is missing', v_sig; end if;
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_sig);
    if v_md5 is distinct from v_pre and v_md5 is distinct from v_own then
      raise exception 'PIN: % is neither the replayed pre-image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        v_sig, v_pre, v_own, v_md5; end if;
  end loop;
  -- A plot building nothing could grant: measured none possible. One that exists would be stranded by the
  -- catalogue cut that follows this file. Never evict on uncertainty: refuse and let a human decide.
  select count(*) into v_n from public.player_progress
   where key in ('plot:farm_plot', 'plot:scarecrow', 'plot:toolshed', 'plot:watchtower') and value > 0;
  if v_n <> 0 then raise exception 'PRECONDITION: % player_progress row(s) hold a plot building the cut would strand', v_n; end if;
end $mig$;

-- ── §1 THE FOUR BODIES ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_farm_upgrade_plot(p_slot integer, p_idem uuid, p_expect_level integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_upgrade_plot restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from
-- the 2026-10-04-expected-level-idempotency.sql image: the tier is the ACCOUNT's
-- (account_farm, under the account farm lock); the Farming gate and the deeds are the
-- acting hero's; the gold is hr_farm_purse_pay's.
-- restated WHOLE again by 2027-03-22-dead-plot-deed.sql: GOLD ONLY. The Farmer's Deed left
-- the catalogue with every source it had (2026-10-23), so its fallback payment, its debit,
-- its refusal fields and its journal arm are cut, and the tier's price is read without the
-- deed column the farm catalogue drops. Every gate, lock, refusal and the idempotency are
-- unchanged.
declare
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_level int;
  v_next  int;
  v_gold  bigint;
  v_reqlv int;
  v_farmlv int;
  v_xp    bigint;
  v_purse jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY — and it is checked
  -- BEFORE the expected level: a retry of a gesture that already landed must
  -- get its own cached answer back, not a stale_level for the rung it bought.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_upgrade_plot') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_upgrade_plot', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE EXPECTED RUNG IS REQUIRED. Before the lock: a call that cannot be
  -- judged must not first serialise the character behind it.
  if p_expect_level is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'missing_expect'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- A SECOND INTENT FOR THE SAME RUNG IS STALE (2026-10-04), from ANY hero of the
  -- account: read under the farm lock, so the first of two concurrent intents lands
  -- and the second sees its write. `plot_level` is the account's CURRENT tier.
  v_level := public.hr_farm_plot_level(v_uid);
  if p_expect_level <> v_level + 1 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'stale_level',
      'plot_level', v_level, 'expect_level', p_expect_level));
  end if;

  v_next := v_level + 1;
  select gold_cost, req_farm_level into v_gold, v_reqlv
    from public.hr_plot_tier where plot_level = v_next;
  if not found then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_level));
  end if;
  -- FAIL CLOSED ON AN UNPRICED RUNG (a rung above the first that costs no gold is a
  -- mistake, never an offer).
  if v_next > 1 and coalesce(v_gold, 0) = 0 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'tier_unpriced', 'plot_level', v_next));
  end if;

  -- THE PACING GATE. The acting hero's Farming level, from the server's own XP.
  select coalesce(xp, 0) into v_xp from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farmlv := public.hr_level_from_xp(coalesce(v_xp, 0));
  if v_farmlv < coalesce(v_reqlv, 1) then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'farm_level_too_low',
      'need', v_reqlv, 'have', v_farmlv, 'plot_level', v_next));
  end if;

  -- THE PAYMENT: the tier's gold, through the farm's one purse, which debits it
  -- atomically or refuses and moves nothing.
  v_purse := public.hr_farm_purse_pay(v_uid, p_slot, coalesce(v_gold, 0));
  if coalesce(v_purse ->> 'ok', '') <> 'true' then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
      'need_gold', coalesce(v_gold, 0), 'have_gold', (v_purse ->> 'gold')::bigint, 'plot_level', v_next));
  end if;

  -- THE ACCOUNT'S TIER moves one rung, predicated on the rung read under the lock.
  insert into public.account_farm as a (user_id, plot_level, updated_at)
    values (v_uid, v_next, now())
    on conflict (user_id) do update set plot_level = excluded.plot_level, updated_at = now()
      where a.plot_level = v_level;
  if not found then
    raise exception 'hr_farm_upgrade_plot: the account tier moved under the farm lock (expected %)', v_level; end if;

  update public.player_state set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = p_slot;

  -- THE JOURNAL. One row per upgrade on the acting hero; the gold spent, negative.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot', null, 0, -coalesce(v_gold, 0),
            jsonb_build_object('plot_level', v_next, 'paid_with', 'gold',
                               'farm_level', v_farmlv, 'purse', v_purse ->> 'purse', 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next,
    'paid_with', 'gold',
    'gold_spent', coalesce(v_gold, 0),
    'gold', (v_purse ->> 'gold')::bigint);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_land_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- hr_farm_land_view restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-11-26-farm-window.sql image: the ACCOUNT's field, the same on every hero; the
-- cap is hr_farm_plot_cap (the Garden's beds included); deeds are the viewing hero's.
-- restated WHOLE again by 2027-03-22-dead-plot-deed.sql: the hero's Farmer's Deed count and
-- the next tier's deed price leave the section (the Deed left the catalogue 2026-10-23 and
-- hr_farm_upgrade_plot takes gold only). Every other key is unchanged.
declare
  c_window_s constant numeric := 2 * 3600;   -- hr_farm_water's window
  c_max_waterings constant int := 8;          -- hr_farm_water's cap
  v_lv    int;
  v_cap   int;
  v_up    jsonb;
  v_plots jsonb;
begin
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_slot) then return null; end if;
  v_lv  := public.hr_farm_plot_level(p_user);
  v_cap := public.hr_farm_plot_cap(p_user);
  select jsonb_build_object('level', t.plot_level, 'gold', t.gold_cost, 'farming', t.req_farm_level)
    into v_up from public.hr_plot_tier t where t.plot_level = v_lv + 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'i', f.plot_idx, 'crop', f.crop_id,
           'ready', g.rem_h <= 0,
           'ready_in_s', case when g.rem_h <= 0 then 0
                              when g.win_s / 3600.0 * 2 >= g.rem_h then ceil(g.rem_h / 2 * 3600)::bigint
                              else ceil(g.win_s + (g.rem_h - g.win_s / 3600.0 * 2) * 3600)::bigint end,
           'waterable', g.rem_h > 0 and g.win_s <= 0 and coalesce(array_length(f.waterings, 1), 0) < c_max_waterings,
           'regrows_left', case when c.regrows and c.regrow_limit > 0 then greatest(0, c.regrow_limit - f.regrow_count) else null end,
           'by', f.planted_by,
           'by_name', (select cn.name from public.character_names cn where cn.user_id = p_user and cn.slot = f.planted_by),
           'extra', f.plot_idx >= v_cap)
         order by f.plot_idx), '[]'::jsonb)
    into v_plots
    from public.account_farm_plots f
    join public.hr_crops c on c.crop_id = f.crop_id
    cross join lateral (select
        c.base_hours - public.hr_farm_growth_hours(f.planted_at, f.waterings, now()) as rem_h,
        greatest(0, extract(epoch from (
          (select max(w) from unnest(f.waterings) w) + make_interval(secs => c_window_s) - now())))::numeric as win_s) g
   where f.user_id = p_user;
  return jsonb_build_object('cap', v_cap, 'plot_level', v_lv,
                            'upgrade', v_up, 'plots', v_plots);
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_harvest(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_harvest restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's; the crop, the XP
-- and the day budget are the acting hero's; the roll is the PLANT's; an extra plot
-- (index >= the account's cap) is gone after its harvest.
-- restated WHOLE again by 2027-03-22-dead-plot-deed.sql: the Scarecrow's term leaves the
-- farmYield perk (the plot buildings are cut: nothing could ever grant one, and its
-- catalogue row is gone). The Garden and the companion terms are unchanged.
declare
  v_uid    uuid := auth.uid();
  v_plot   public.account_farm_plots%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_grown_h numeric;
  v_seed   bigint;
  v_span   int;
  v_base   bigint;
  v_bonus  bigint;
  v_qty    bigint;
  v_xp     bigint;
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_extra    boolean;
  v_new_count int;
  v_garden_lv int;
  v_cached jsonb;
  v_budget jsonb;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('farm_harvest', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay).
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_harvest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_harvest', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK: two heroes harvesting one
  -- plot serialise here, and the second reads the plot after the first emptied it.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  select * into v_plot from public.account_farm_plots
    where user_id = v_uid and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600)));
  end if;

  -- SEEDED base yield roll, tied to this PLANT (its planter, its plot, its plant
  -- instant): which hero harvests cannot re-roll it, a regrow is a fresh roll, a
  -- harvest replay is identical. NOT Math.random.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, v_plot.planted_by,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_base := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;

  -- FLAT farmYield PERK from the SERVER-owned stack: Garden rung (the account's) +
  -- the acting hero's equipped companion, priced from hr_farm_yield_perk. Whole
  -- crops; under-pay only.
  select coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int
    into v_garden_lv from public.hr_unlock_levels(v_uid, p_slot);
  v_bonus :=
      coalesce((select farm_yield from public.hr_farm_yield_perk
                 where perk_key = 'garden:' || greatest(0, v_garden_lv)::text), 0)
    + coalesce((select farm_yield from public.hr_farm_yield_perk
                 where v_state.companion_equipped is not null
                   and perk_key = 'companion:' || v_state.companion_equipped), 0);

  v_qty := v_base + greatest(0, v_bonus);
  v_xp  := v_crop.xp::bigint * v_qty;

  -- Daily economy ceiling (NULL = within budget), the acting hero's. Perk is inside the clamp.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_xp, v_qty, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  insert into public.player_skills as sk (user_id, slot, skill_id, xp)
    values (v_uid, p_slot, 'farming', v_xp)
    on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;

  -- AN EXTRA PLOT (past the account's cap: the 2026-12-14 fold kept every crop) is
  -- gone after its harvest. Otherwise the FINITE-PERENNIAL rule: regrow_limit =
  -- regrows one seed buys, regrow_limit+1 total harvests, 0 = no limit.
  v_extra := p_plot_idx >= public.hr_farm_plot_cap(v_uid);
  if v_extra then
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  elsif v_crop.regrows then
    v_new_count := v_plot.regrow_count + 1;
    if v_crop.regrow_limit > 0 and v_new_count > v_crop.regrow_limit then
      delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
      v_withered := true;
    else
      update public.account_farm_plots
        set planted_at = now(), waterings = '{}', regrow_count = v_new_count
        where user_id = v_uid and plot_idx = p_plot_idx;
      v_regrew := true;
    end if;
  else
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  end if;

  -- THE LIFETIME HARVEST COUNT, the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:harvest', v_qty, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, 'farming', v_xp,
            v_qty, v_xp, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx,
                                            'base', v_base, 'perk', v_bonus,
                                            'regrew', v_regrew, 'withered', v_withered,
                                            'regrow_count', v_plot.regrow_count,
                                            'planted_by', v_plot.planted_by, 'extra', v_extra,
                                            'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'base', v_base, 'perk', v_bonus, 'xp', v_xp,
    'regrew', v_regrew, 'withered', v_withered, 'planted_by', v_plot.planted_by, 'extra', v_extra,
    'regrows_left', case when v_crop.regrows and v_crop.regrow_limit > 0 and not v_extra
                         then greatest(0, v_crop.regrow_limit - (v_plot.regrow_count + 1))
                         else null end);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_perks_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- restated WHOLE by 2027-03-22-dead-plot-deed.sql from the 2027-02-27-tempering.sql image:
-- the `plots` key (and its `sources` entry) leaves the answer. The four plot buildings it
-- carried are cut (no verb sold one, nothing granted one), and src/core/perks.js no longer
-- reads the field. Every other key is unchanged.
declare
  v_temper jsonb;
  v_rooms jsonb;
  v_tier  int;
  v_recipes jsonb;
  v_renown bigint;
  v_renown_allxp float8;
  v_comp_id text;
  v_comp_xp bigint;
begin
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  -- A character that does not exist gets a refusal, not an empty stack. The
  -- two are different facts and the engine treats them differently: `ok:false`
  -- means "do not price a perk stack for this row at all", while an empty
  -- stack means "priced, and this player has bought nothing".
  if not exists (
    select 1 from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  select
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'room:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_tier
    from public.hr_unlock_levels(p_user, p_slot) u;

  -- ── THE ARTISAN GATE ──────────────────────────────────────────────────
  -- Recipe scrolls are kind='flag' rows (see hr_unlocks) rather than levels,
  -- because the ACCRUAL ENGINE has to be able to grant one it rolled itself and
  -- 'flag' is in hr_apply's progress allowlist while 'unlock' is deliberately
  -- not. The JOIN to the catalogue is what makes a mis-filed row invisible as
  -- well as refused: hr_unlock_guard rejects a recipe row stored under the wrong
  -- kind, and this read would not see it either.
  --
  -- The wire shape is the CLIENT'S OWN — { "<scroll_id>": true } — so
  -- src/core/artisan.js gateOk consumes the server's answer and G.unlockedRecipes
  -- with the same expression. An absent row is an absent key is a LOCKED recipe:
  -- the fail-closed default is the shape's default, not a branch somebody wrote.
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    into v_recipes
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'recipe'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;

  -- TEMPERING (2027-02-27-tempering.sql): this hero's rungs, by ladder. Only ids and rungs cross; what a rung does is
  -- src/core/temper.js, clamped to the ladder there. The catalogue join makes a mis-filed row invisible, as the recipes' does.
  select coalesce(jsonb_object_agg(pp.key, pp.value), '{}'::jsonb)
    into v_temper
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'temper'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;

  -- THE RENOWN CHANNEL — server-derived, never from the client.
  v_renown := public.hr_renown_of(p_user, p_slot);
  v_renown_allxp :=
      case when v_renown >= 900    then 0.01::float8 else 0::float8 end   -- squire
    + case when v_renown >= 4500   then 0.01::float8 else 0::float8 end   -- baron
    + case when v_renown >= 32000  then 0.01::float8 else 0::float8 end   -- duke
    + case when v_renown >= 120000 then 0.01::float8 else 0::float8 end;  -- highking

  -- ── THE EQUIPPED COMPANION (layer-1 passive bonus) ────────────────────
  -- The id is SERVER-OWNED (player_state.companion_equipped, written only by
  -- hr_companion_equip after an ownership check). The xp is a server aggregate
  -- row keyed 'companion_xp:<id>' under kind='stat' — the SAME channel the
  -- bestiary/collection aggregates use, and already in hr_apply's progress
  -- allowlist, so the XP-accrual follow-up writes it with NO schema change (the
  -- 'companion_xp:' prefix is disjoint from 'ev:%', no collision). Read
  -- self-configuringly: no writer yet → 0 → level 1 → base magnitude, the same
  -- self-configuring switch as hr_unlock_levels. src/core/companion-perk.js
  -- prices {id,xp} from the COMPANIONS catalogue, so no pet data is in SQL.
  select ps.companion_equipped into v_comp_id
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  select coalesce(sum(pp.value), 0) into v_comp_xp
    from public.player_progress pp
   where pp.user_id = p_user and pp.slot = p_slot
     and pp.kind = 'stat' and pp.period_key = ''
     and v_comp_id is not null and pp.key = 'companion_xp:' || v_comp_id;

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    -- The property TIER, not the property id: 'property:castle' grants 5 and
    -- the capstone fires at >= CASTLE_TIER. `max` because a player who bought
    -- the Manor and then the Castle holds both rows.
    'propertyTier', coalesce(v_tier, 0),
    -- ⚠ THE JS FIELD NAME, camelCase, deliberately: this envelope is consumed
    --   by the accrual engine untranslated, and a mapping layer is where a field
    --   gets silently dropped and reads as "the player has unlocked nothing".
    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),
    -- Named zeroes, not omissions. An absent key and a key that is honestly
    -- zero are indistinguishable to the reader, and one of them is a bug.
    'renownAllXp', v_renown_allxp,
    'temper', coalesce(v_temper, '{}'::jsonb),
    'clanPerks', '{}'::jsonb,
    'castle', null,
    -- ⚠ THE COMPANION CHANNEL — bookkeeping only ({id, xp}); the magnitudes are
    --   src/core/companion-perk.js's, off the COMPANIONS catalogue. null when
    --   nothing is equipped, so "no companion" and "an equipped one paying its
    --   base" are distinct wire shapes.
    'companion', case when v_comp_id is null then null
                      else jsonb_build_object('id', v_comp_id, 'xp', coalesce(v_comp_xp, 0)) end,
    -- ⚠ THE HONESTY FIELD. Which channels this answer actually covers. The
    --   Edge Function forwards it into the away card (`away.perkChannel`), so
    --   "the night was priced at zero perks because nothing is unlocked" can
    --   be told apart from "because the channel is not wired" — from the
    --   outside, without reading the source. Every historical away bug in this
    --   codebase was a reward that silently vanished.
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'recipes',    'player_progress:flag:recipe:*',
      'renown',     'derived:hr_renown_of',
      'temper',     'player_progress:unlock:temper:*',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'derived:player_state.companion_equipped')
  );
end $function$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000dead0d01';   -- the probe account (one hero)
  v jsonb; v_land jsonb; v_perks jsonb; v_price bigint; v_lvl int; v_n int; v_t text; v_role text; v_md5 text;
begin
  -- (a) THE LANDED BODIES ARE THIS FILE'S (the md5s the review reads).
  for v_t, v_md5 in values
    ('public.hr_farm_upgrade_plot(integer,uuid,integer)', '48880707ce62e4983addb9c2860063d9'),
    ('public.hr_farm_land_view(uuid,integer)',            '59e7bbfdec11e041b536943116c9bc40'),
    ('public.hr_farm_harvest(integer,integer,uuid)',      '6eecf24a7b44ed6b21b21c24678fce0a'),
    ('public.hr_perks_of(uuid,integer)',                  '9a53d68354e8373b61981995ad6ebc8f')
  loop
    if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure(v_t)) is distinct from v_md5 then
      raise exception 'VERIFY(a): % did not land as this file''s body (%)', v_t, v_md5; end if;
  end loop;

  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'dead-plot-deed §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the probe hero was not made'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    select gold_cost, req_farm_level into v_price, v_lvl from public.hr_plot_tier where plot_level = 2;
    if coalesce(v_price, 0) <= 0 then raise exception 'VERIFY(b): tier 2 has no gold price, the probe would prove nothing'; end if;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_u, 0, 'farming', (select xp from public.hr_xp_table where level = v_lvl))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    -- (b) A FARMER'S DEED IS NO PAYMENT: 99 in the bag and no gold is refused, and every deed stays.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'farm_deed', 99)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 0)
      on conflict (user_id) do update set gold = 0, version = w.version + 1, updated_at = now();
    v := public.hr_farm_upgrade_plot(0, gen_random_uuid(), 2);
    if v->>'error' is distinct from 'cannot_afford' or v ? 'need_deeds' or v ? 'have_deeds'
       or (v->>'need_gold')::bigint is distinct from v_price then
      raise exception 'VERIFY(b): a hero with 99 deeds and no gold was answered %', v; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'farm_deed') <> 99
       or public.hr_farm_plot_level(v_u) <> 1
       or exists (select 1 from public.player_ledger where user_id = v_u and intent = 'farm_upgrade_plot') then
      raise exception 'VERIFY(b): the refused upgrade moved a deed, the tier or the journal'; end if;
    -- (c) GOLD PAYS: the tier's price + 7 buys it, leaves 7, takes no deed, journals one gold row.
    update public.account_wallet set gold = v_price + 7, version = version + 1, updated_at = now() where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_farm_upgrade_plot(0, gen_random_uuid(), 2);
    if coalesce(v->>'ok', '') <> 'true' or v->>'paid_with' is distinct from 'gold' or (v->>'gold')::bigint <> 7
       or (v->>'gold_spent')::bigint is distinct from v_price or v ? 'deeds_spent' then
      raise exception 'VERIFY(c): the tier-2 purchase answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 7 or public.hr_farm_plot_level(v_u) <> 2
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'farm_deed') <> 99 then
      raise exception 'VERIFY(c): the purchase did not move exactly the gold and the tier'; end if;
    if (select count(*) from public.player_ledger where user_id = v_u and slot = 0 and intent = 'farm_upgrade_plot'
          and gold = -v_price and item_id is null and qty = 0 and meta->>'paid_with' = 'gold') <> 1 then
      raise exception 'VERIFY(c): the upgrade is not journalled as one gold row'; end if;
    -- (d) THE FARM SECTION AND THE PERK READ CARRY NO DEED AND NO PLOT BUILDING.
    v_land := public.hr_farm_land_view(v_u, 0);
    if v_land ? 'deeds' or (v_land->>'plot_level')::int <> 2 or jsonb_typeof(v_land->'upgrade') is distinct from 'object'
       or v_land->'upgrade' ? 'deeds' or (v_land->'upgrade'->>'level')::int <> 3
       or (v_land->'upgrade'->>'gold')::bigint is distinct from (select gold_cost from public.hr_plot_tier where plot_level = 3)
       or (v_land->'upgrade'->>'farming')::int is distinct from (select req_farm_level from public.hr_plot_tier where plot_level = 3) then
      raise exception 'VERIFY(d): the land view reads %', v_land; end if;
    v_perks := public.hr_perks_of(v_u, 0);
    if coalesce(v_perks->>'ok', '') <> 'true' or v_perks ? 'plots' or v_perks->'sources' ? 'plots'
       or jsonb_typeof(v_perks->'rooms') is distinct from 'object' then
      raise exception 'VERIFY(d): the perk read answers %', v_perks; end if;
    -- (e) A SCARECROW PAYS NO HARVEST: two on the books and its catalogue row raised to 1 (the old body
    --     paid +2 here) leave the perk at the Garden's and the companion's, which this hero has neither of.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value) values (v_u, 0, 'stat', 'plot:scarecrow', '', 2)
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
    insert into public.hr_farm_yield_perk (perk_key, farm_yield) values ('scarecrow', 1)
      on conflict (perk_key) do update set farm_yield = excluded.farm_yield;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'turnip_seed', 1)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_farm_plant(0, 0, 'turnip', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): the probe plant was refused: %', v; end if;
    update public.account_farm_plots set planted_at = now() - interval '30 hours' where user_id = v_u and plot_idx = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_farm_harvest(0, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (v->>'perk')::bigint <> 0 or (v->>'qty')::bigint <> (v->>'base')::bigint then
      raise exception 'VERIFY(e): a harvest with two Scarecrows on the books answered %', v; end if;
    raise exception using errcode = 'HR917', message = 'dead-plot-deed §2 complete - rolling back';
  exception when sqlstate 'HR917' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (f) NOTHING LEAKED.
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_ledger where user_id = v_u)
     or exists (select 1 from public.account_farm where user_id = v_u) or exists (select 1 from public.account_farm_plots where user_id = v_u)
     or exists (select 1 from public.player_progress where user_id = v_u) then
    raise exception 'VERIFY(f): §2 LEAKED a probe row'; end if;
  -- (g) NO BODY NAMES THE DEED, ITS PRICE COLUMN OR A PLOT BUILDING (code; the column also in comments,
  --     as the farm catalogue's drop reads it).
  select string_agg(p.oid::regprocedure::text, ', ') into v_t from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (strpos(p.prosrc, 'deed_cost') > 0
          or regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
             ~ '''farm_deed''|plot:(farm_plot|scarecrow|toolshed|watchtower)|''plot:%''|''scarecrow''');
  if v_t is not null then raise exception 'VERIFY(g): % still name the Farmer''s Deed or a plot building', v_t; end if;
  -- (h) THE ACL: the two client verbs are still the client's alone; the section and the perk read are no client's.
  foreach v_t in array array['public.hr_farm_upgrade_plot(integer,uuid,integer)', 'public.hr_farm_harvest(integer,integer,uuid)'] loop
    if not has_function_privilege('authenticated', v_t, 'execute') or has_function_privilege('anon', v_t, 'execute') then
      raise exception 'VERIFY(h): %''s grant moved', v_t; end if;
  end loop;
  foreach v_t in array array['public.hr_farm_land_view(uuid,integer)', 'public.hr_perks_of(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_t, 'execute') then raise exception 'VERIFY(h): % reaches %', v_role, v_t; end if;
    end loop;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_perks_of(uuid,integer)', 'execute') then
    raise exception 'VERIFY(h): the engine lost hr_perks_of'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'dead-plot-deed: the plot tier is bought with gold only (a Farmer''s Deed is no payment and is never taken); the farm '
               'section and the perk read carry no deed and no plot building; a Scarecrow pays no harvest; no body names either; '
               'grants unchanged; all green';
end $$;
