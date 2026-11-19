-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ANALYZER'S COINS COUNT THE LOOT SOLD TO PAY THE STORE.
-- STAGED, NOT APPLIED (lane/a-analyzer-coins, systems-engineer, 2026-11-18).
-- Game CLOSED: applies on its passing §2; Security reviews it in the reopen gate.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- CLAUDE.md §6 (the browser never says one thing while the server says another).
-- A hunt's gold reaches the account purse three ways inside its session: kill coins
-- (the accrue rows, tally `coins`), loot SOLD TO COVER a store charge (the settle's
-- §5b, ledger intent vendor_cover, tally `cover_gold` and `covered`), and the store's
-- bill (supply_buy, tally `supply_gold`). The analyzer (hr_hunt_stats_of) read only
-- the first: its `coins` left the cover sale out, and its `loot_value` still priced
-- the sold units as if they sat in the bag. So after a cover sale:
--   · the analyzer's Coins row under-read the gold the hunt put in the purse, and its
--     "Unsold loot value" counted loot that had been sold;
--   · the end card's Gold and the away card's Gold (coins less the store's supplies,
--     src/hunt-view/summary-model.js goldKeptOf, src/shell/away-recap.js goldOf: the
--     v0.2.140 "Gold = purse" reading) under-read the purse by exactly cover_gold.
-- Sell-to-cover sells only rows flagged junk (src/data/hunt-sessions.js coverSellable)
-- and none is flagged today, so hr_hunt_cover_items is empty and live cover_gold is 0:
-- the gap is latent until the first junk row ships, and is closed here, at the read
-- every card shares, before it can show.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 hr_hunt_stats_of RESTATED WHOLE from 2026-11-10-hunt-xp-split.sql (§0 md5-pinned
--    to that landed image a2937abe16ef2593c4bb4b29f3736e40; new image
--    beba4fc33172b66a67b4a5cc9ef7d2de, see §0). TWO changes, hero and party blocks alike:
--      coins       = kill coins + the gold the session's loot sold for to pay the store
--                    (sum of tally cover_gold): every coin the hunt put in the purse, so
--                    coins - waste is the purse's own move (the cards' Gold).
--      loot_value  = the vendor value of the loot STILL HELD: each item's looted units
--                    less the units sold to cover (tally `covered`), never below 0.
--    gold (= coins + loot_value), balance (= gold - waste) and every per-hour figure keep
--    their definitions; with the cover price the vendor's own (tools/gen-hunt-sessions.mjs:
--    both vendorPriceOf) they read the same numbers as before, and the hunt bests do not
--    move. The `loot` map stays what dropped (the Loot list, Top loot, Best find).
--    The basic subset (hr_hunt_analyzer_basic) passes `coins` and `loot_value` through,
--    so a free character reads the same figures. No tally write, no ledger row, no edge
--    change: the engine's own tally (src/core/action-rules.js covered) is untouched.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Read-only display figures of the caller's own server tallies: no value moves; no
-- grant, table, signature or client RPC changes.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_stats_of §1 from 2026-11-10-hunt-xp-split.sql (its own §0 accepts
-- only its pre-image or its image, so restate the body by hand from that file).
-- ORDER: after 2027-05-11-party-alone.sql (last in the chain).
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_session_tally' and column_name = 'cover_gold')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_session_tally' and column_name = 'covered') then
    raise exception 'PRECONDITION: hunt_session_tally carries no cover_gold / covered (apply 2026-10-22-hunt-sessions-settle.sql)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)');
  if v_md5 is null then raise exception 'PRECONDITION: hr_hunt_stats_of is absent (apply 2026-10-23-hunt-analyzer-v2.sql)'; end if;
  -- the 11-10 landed pre-image, or this file's own image (a second apply is a no-op restate)
  if v_md5 <> 'a2937abe16ef2593c4bb4b29f3736e40' and v_md5 <> 'beba4fc33172b66a67b4a5cc9ef7d2de' then
    raise exception 'PIN: hr_hunt_stats_of is neither the 11-10 pre-image (a2937abe...) nor this file''s (beba4fc33172b66a67b4a5cc9ef7d2de) - md5 %: another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_stats_of(p_sessions uuid[], p_wall_h numeric, p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_kills bigint; v_coins bigint; v_loot_v bigint; v_store bigint; v_gold bigint; v_cover bigint;
  v_xp jsonb; v_raw jsonb; v_loot jsonb; v_own jsonb; v_bought jsonb; v_covered jsonb;
  v_dealt jsonb := '{}'::jsonb; v_taken jsonb := '{}'::jsonb; v_healed jsonb := '{}'::jsonb;
  v_t record; v_eta jsonb;
  v_lgain numeric; v_lcur bigint; v_lvl jsonb;
  -- THE RATE WINDOW: no rate (per_hour, eta_h) until 10 minutes of wall time.
  v_rated boolean := p_wall_h * 60 >= 10;
begin
  select coalesce(sum(t.kills), 0), coalesce(sum(t.coins), 0), coalesce(sum(t.supply_gold), 0), coalesce(sum(t.cover_gold), 0)
    into v_kills, v_coins, v_store, v_cover
    from public.hunt_session_tally t where t.session_id = any (p_sessions);
  v_xp := '{}'::jsonb; v_raw := '{}'::jsonb; v_loot := '{}'::jsonb; v_own := '{}'::jsonb; v_bought := '{}'::jsonb; v_covered := '{}'::jsonb;
  for v_t in select * from public.hunt_session_tally t where t.session_id = any (p_sessions) order by t.session_id loop
    v_xp := public.hr_jsonb_add(v_xp, v_t.xp); v_raw := public.hr_jsonb_add(v_raw, v_t.raw_xp);
    v_loot := public.hr_jsonb_add(v_loot, v_t.loot); v_own := public.hr_jsonb_add(v_own, v_t.supplies);
    v_bought := public.hr_jsonb_add(v_bought, v_t.bought); v_covered := public.hr_jsonb_add(v_covered, v_t.covered);
    v_dealt := public.hr_hunt_tally_add(v_dealt, v_t.dealt); v_taken := public.hr_hunt_tally_add(v_taken, v_t.taken);
    v_healed := public.hr_hunt_tally_add(v_healed, v_t.healed);
  end loop;
  -- THE LOOT STILL HELD (2027-05-15-analyzer-cover-coins.sql): a unit sold to pay the store is gold in `coins`, never loot too.
  select coalesce(sum(greatest(0, floor(l.value::numeric) - floor(coalesce((v_covered->>l.key)::numeric, 0))) * v.unit), 0)::bigint into v_loot_v
    from jsonb_each_text(v_loot) l join public.hr_hunt_vendor_value v on v.item_id = l.key;
  -- EVERY COIN THE HUNT PUT IN THE PURSE: kill coins and the loot sold to pay the store, so coins - waste is the purse's move.
  v_coins := v_coins + v_cover;
  v_gold := v_coins + v_loot_v;
  -- Next-level ETA for the hero's own skills (the party has no level).
  if p_user is not null then
    select coalesce(jsonb_object_agg(x.key, jsonb_build_object('xp', x.gain, 'per_hour',
             case when v_rated then round(x.gain / p_wall_h) end,
             'level', public.hr_level_from_xp(coalesce(ps.xp, 0)),
             'eta_h', case when v_rated and x.gain > 0 then round(greatest(0,
                 coalesce((select xt.xp from public.hr_xp_table xt
                            where xt.level = public.hr_level_from_xp(coalesce(ps.xp, 0)) + 1), 0) - coalesce(ps.xp, 0))
                 / (x.gain / p_wall_h), 2) end)), '{}'::jsonb)
      into v_eta
      from (select key, value::numeric as gain from jsonb_each_text(v_xp) where key <> 'level') x
      left join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key;
    -- THE CHARACTER LEVEL's own read (Level is not a skill: the tally carries its XP under `level`).
    -- eta_h = the XP to the next Level / this session's Level XP an hour; NULL (never 0) with no gain
    -- or no wall time. The need is the server's level curve at the server's own level_xp.
    v_lgain := coalesce((v_xp->>'level')::numeric, 0);
    select ps.level_xp into v_lcur from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    v_lvl := jsonb_build_object('xp', v_lgain,
             'per_hour', case when v_rated then round(v_lgain / p_wall_h) end,
             'eta_h', case when v_rated and v_lgain > 0 and v_lcur is not null then greatest(0.0001, round(
                 (public.hr_char_xp_for_level(public.hr_char_level(v_lcur) + 1) - v_lcur)::numeric / (v_lgain / p_wall_h), 4)) end);
  end if;
  return jsonb_build_object(
    'kills', v_kills, 'xp', v_xp, 'raw_xp', v_raw,
    'gold', v_gold, 'gold_basis', 'vendor_value', 'coins', v_coins, 'loot_value', v_loot_v, 'loot', v_loot,
    -- WASTE IS THE STORE'S GOLD: an own stack is already owned (spec §3.6 #4).
    'waste', v_store, 'balance', v_gold - v_store,
    'supplies', jsonb_build_object('own', v_own, 'store', v_bought, 'store_gold', v_store),
    'dealt', v_dealt, 'taken', v_taken, 'healed', v_healed,
    'per_hour', case when v_rated then jsonb_build_object(
        'gold', round(v_gold / p_wall_h), 'waste', round(v_store / p_wall_h), 'balance', round((v_gold - v_store) / p_wall_h),
        'kills', round(v_kills / p_wall_h, 1),
        -- LEVEL XP AND TRAINING XP APART (2026-11-10-hunt-xp-split.sql): xp and raw_xp are the Level's
        -- (the tally key level), training_xp the combat skills' together (every other key).
        'xp', round(coalesce((v_xp->>'level')::numeric, 0) / p_wall_h),
        'raw_xp', round(coalesce((v_raw->>'level')::numeric, 0) / p_wall_h),
        'training_xp', round(coalesce((select sum(value::numeric) from jsonb_each_text(v_xp) where key <> 'level'), 0) / p_wall_h)) end)
    || case when p_user is not null then jsonb_build_object('skills', coalesce(v_eta, '{}'::jsonb), 'level', v_lvl) else '{}'::jsonb end;
end $$;
revoke execute on function public.hr_hunt_stats_of(uuid[], numeric, uuid, int) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid   constant uuid := '000000c0-0000-0000-0000-00005e1a0515';
  v       jsonb;
  v_b     jsonb;
  v_sid   uuid;
  v_item  text;
  v_unit  bigint;
  v_role  text;
begin
  -- A looted item the vendor buys, read off the catalogue (the cover price is the vendor's own).
  select x.item_id, x.unit into v_item, v_unit from public.hr_hunt_vendor_value x where x.unit >= 1 order by x.item_id limit 1;
  if v_item is null then raise exception 'VERIFY(0): hr_hunt_vendor_value holds no priced row'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'analyzer-cover-coins §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- Two wall hours: 100 kill coins, 10 of the item looted and 4 of them sold to pay the store (4 x unit gold),
    -- 150 gold of store supplies. The purse moved 100 + 4u - 150.
    v_sid := public.hr_hunt_new_session(v_uid, 0, 'mill_cellar', null, 0, null);
    update public.hunt_sessions set entered_at = now() - interval '2 hours' where id = v_sid;
    update public.hunt_session_tally set kills = 5, coins = 100, loot = jsonb_build_object(v_item, 10),
      covered = jsonb_build_object(v_item, 4), cover_gold = 4 * v_unit, supply_gold = 150 where session_id = v_sid;
    v := public.hr_hunt_analyzer_of(v_uid, 0, v_sid);
    -- (a) coins are every coin the hunt put in the purse; the loot value is the loot still held; coins - waste is the purse's move
    if (v->'hero'->>'coins')::bigint <> 100 + 4 * v_unit or (v->'hero'->>'loot_value')::bigint <> 6 * v_unit
       or (v->'hero'->>'waste')::bigint <> 150
       or (v->'hero'->>'coins')::bigint - (v->'hero'->>'waste')::bigint <> 100 + 4 * v_unit - 150 then
      raise exception 'VERIFY(a): after a cover sale the hero reads coins %, loot value %, waste % (unit %)',
        v->'hero'->'coins', v->'hero'->'loot_value', v->'hero'->'waste', v_unit; end if;
    -- (b) gold and balance keep their definitions and their numbers (coins + loot value; less the store); the Loot list is what dropped
    if (v->'hero'->>'gold')::bigint <> 100 + 10 * v_unit or (v->'hero'->>'balance')::bigint <> 100 + 10 * v_unit - 150
       or v->'hero'->'loot' <> jsonb_build_object(v_item, 10)
       or (v->'hero'->'per_hour'->>'gold')::numeric <> round((100 + 10 * v_unit) / 2.0)
       or (v->'hero'->'per_hour'->>'balance')::numeric <> round((100 + 10 * v_unit - 150) / 2.0) then
      raise exception 'VERIFY(b): gold %, balance %, loot %, per hour %', v->'hero'->'gold', v->'hero'->'balance', v->'hero'->'loot', v->'hero'->'per_hour'; end if;
    -- (c) the party block (a solo hunt's party is itself) reads the same
    if v->'party'->'coins' <> v->'hero'->'coins' or v->'party'->'loot_value' <> v->'hero'->'loot_value' or v->'party'->'balance' <> v->'hero'->'balance' then
      raise exception 'VERIFY(c): the party block reads coins %, loot value %, balance %', v->'party'->'coins', v->'party'->'loot_value', v->'party'->'balance'; end if;
    -- (d) a free character's basic subset passes the same coins and loot value
    v_b := public.hr_hunt_analyzer_basic(v);
    if v_b->'hero'->'coins' <> v->'hero'->'coins' or v_b->'hero'->'loot_value' <> v->'hero'->'loot_value' or v_b->'hero'->'balance' <> v->'hero'->'balance' then
      raise exception 'VERIFY(d): the basic subset reads %', v_b->'hero'; end if;
    -- (e) a tally that says more sold than looted never prices loot below nothing
    update public.hunt_session_tally set covered = jsonb_build_object(v_item, 12) where session_id = v_sid;
    if (public.hr_hunt_analyzer_of(v_uid, 0, v_sid)->'hero'->>'loot_value')::bigint <> 0 then
      raise exception 'VERIFY(e): 12 sold of 10 looted priced the loot at %', public.hr_hunt_analyzer_of(v_uid, 0, v_sid)->'hero'->'loot_value'; end if;
    -- (f) THE CONTROL: no cover sale reads as before (the kill coins; every looted unit at its vendor value)
    update public.hunt_session_tally set covered = '{}'::jsonb, cover_gold = 0 where session_id = v_sid;
    v := public.hr_hunt_analyzer_of(v_uid, 0, v_sid);
    if (v->'hero'->>'coins')::bigint <> 100 or (v->'hero'->>'loot_value')::bigint <> 10 * v_unit or (v->'hero'->>'balance')::bigint <> 100 + 10 * v_unit - 150 then
      raise exception 'VERIFY(f): with no cover sale the hero reads coins %, loot value %, balance %', v->'hero'->'coins', v->'hero'->'loot_value', v->'hero'->'balance'; end if;
    raise exception using errcode = 'HR877', message = 'analyzer-cover-coins §2 complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(g): §2 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_stats_of(uuid[],numeric,uuid,integer)', 'execute') then
      raise exception 'VERIFY(g): % reaches hr_hunt_stats_of', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'analyzer-cover-coins: coins count the loot sold to pay the store, the loot value is the loot still held; all green';
end $$;
