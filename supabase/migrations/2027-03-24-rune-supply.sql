-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2027-03-24-rune-supply.sql — A SPELL'S SLOT SPENDS THE RUNES ITS PLAYER TICKED, THEN BUYS OR LEAVES
--   (lane/b-rune-supply, systems-engineer, 2026-11-08; Tyler the same night, rulings of record RUNE SUPPLY PER SLOT and DECIDE IN
--   CONFIGURE ACTION: "If the player has 'use carried runes' checked, it opens a section of carried runes that fit that spell type, and
--   they check the box. Then condition - 'when rune supply runs out' 'Pay rune shop' or 'leave hunt'").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §5; ON THE EA SECURITY LIST (what a slot may buy, and an end the engine claims).
-- APPLY ORDER: 2027-03-24-rune-supply-hunt-sessions-catalogue.generated.sql (END_ORDER's runes_out), THIS FILE, then the hr-accrue that
--   reads the ticked runes at once, then the client.
--
-- ── WHAT IT SHIPS ──────────────────────────────────────────────────────────────────────────────────────────────────
--   hr_hunt_rune_supply          NEW, server-only: a spell slot's rune supply { runes, own, store, onEmpty } (src/core/hunt/conditions.js
--                                runeSupplyOf, the same rule): `own` the runes of the spell's family it ticked, lowest tier first; `onEmpty`
--                                'store' (buy the store rune it names) or 'leave' (end the hunt runes_out). A slot that says nothing ticks every
--                                rune of its family and buys from the shop (Tyler 2026-11-08), its named rune, else the family's tier-1 one.
--   hr_hunt_slot_check           SPLICED (marker RUNE-SUPPLY): a rune spell's slot may carry `own` and `onEmpty`, refused bad_own / bad_on_empty /
--                                bad_store unless they read back as said (a rune of another family, a repeat, an unknown word; "buy" with no
--                                store rune, "leave" with one, "leave" with nothing ticked); the stored slot always carries both.
--   hr_hunt_rune_state           5 ARGUMENTS (the ticked runes); the 4-argument form, which counted every rune of the family, is dropped (the
--                                view was its one reader).
--   hr_hunt_settings_view        SPLICED: `usable` reads only the ticked runes and the store only when the slot buys; a slot that leaves with
--                                none of its ticked runes left says `why` runes_out; every rune spell's slot projects its supply whole.
--   hr_hunt_settle_session       SPLICED: proves runes_out (the session's bar holds that spell leaving on empty, and no rune it ticks is left).
--   THE SAVED BARS               every stored rune spell slot is re-stored through the new door: own = every rune of the family, onEmpty =
--                                'store', the shop rune it names, else the family's tier-1 one (Tyler 2026-11-08: "Yes make the default to buy from the shop").
--
-- ── WHO IS TOUCHED ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Every saved bar holding a rune spell slot is rewritten once, here (no back-compat, CLAUDE.md §1; Tyler 2026-11-07, no progress protection).
-- What such a slot spends first does not move: it ticks every rune of its family, which is what the engine spent before. What moves: a slot
-- that named no store rune now BUYS the family's tier-1 shop rune when its runes run out (it used to stop casting). Its rule id moves with it.
-- No other slot, row, grant or signature moves; no value moves.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────────────────────────────────────────────
-- A client may store two more keys on a rune spell's slot, read back through hr_hunt_rune_supply and refused unless they say what it reads:
-- rune ids of the spell's own family (hr_hunt_rune_spells), and one of two words. Neither prices anything: a buy is re-priced from
-- hr_hunt_basic_supplies by the settle, as before. A new end, runes_out, is proved from the server's bar and hunt bag; like `rule` it can only
-- stop value, never mint it. FOR THE EA REVIEW: the proof reads the bar as it stands at the settle, so a player who switches the slot to "buy"
-- mid-window has that window refused once and re-settled on the new bar.
--
-- ── COST ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- hr_hunt_rune_supply reads one immutable jsonb (hr_hunt_rune_spells) and sorts at most five keys; it runs once a rune slot per validation
-- and per view. The settle's arm runs only on a runes_out end. The bar rewrite is one pass over player_action_sets, once.
--
-- REVERSIBILITY: re-apply hr_hunt_slot_check and hr_hunt_settings_view from 2027-03-08-rune-ladder-slots.sql, hr_hunt_settle_session from
-- 2027-03-12-boss-call.sql and the 4-argument hr_hunt_rune_state from 2027-02-21-hunt-carry-in.sql; the stored `own` / `onEmpty` keys then
-- read as an empty tablet, so strip them first. No value moves either way. No begin/commit. No cron.* write.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
begin
  if not exists (select 1 from public.hr_hunt_end_reasons where reason = 'runes_out') then
    raise exception 'PRECONDITION: apply 2027-03-24-rune-supply-hunt-sessions-catalogue.generated.sql first (END_ORDER''s runes_out)'; end if;
  if to_regprocedure('public.hr_hunt_rune_spells()') is null or public.hr_hunt_rune_spells()->'fireball'->'store' is null
     or to_regprocedure('public.hr_hunt_rune_store_state(uuid,integer,text,text)') is null then
    raise exception 'PRECONDITION: the rune ladder (2027-03-08-rune-ladder-slots.sql) is absent'; end if;
  if to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null or to_regprocedure('public.hr_hunt_settings_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: a body this file splices is absent'; end if;
end $mig$;

-- ── §1 A SLOT'S RUNE SUPPLY, AND THE RUNES IT TICKED AGAINST THE HERO ───────────────────────────────────────────────────
-- The engine's runeSupplyOf (src/core/hunt/conditions.js), the same rule. Null for an action that spends no rune.
create or replace function public.hr_hunt_rune_supply(p_action jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_row   jsonb := case when jsonb_typeof(p_action) = 'object' and p_action->>'type' = 'ability' then public.hr_hunt_rune_spells()->(p_action->>'id') end;
  v_all   jsonb;
  v_own   jsonb;
  v_store text;
  v_on    text;
begin
  if v_row is null then return null; end if;
  -- every rune of the family, lowest tier first (a tier's level rises with it), a tie to the lower id
  select coalesce(jsonb_agg(to_jsonb(r.key) order by r.value::int, r.key), '[]'::jsonb) into v_all from jsonb_each_text(v_row->'runes') r;
  v_own := case when jsonb_typeof(p_action->'own') = 'array'
                then (select coalesce(jsonb_agg(x.e order by x.n), '[]'::jsonb) from jsonb_array_elements(v_all) with ordinality x(e, n)
                       where p_action->'own' @> jsonb_build_array(x.e))
                else v_all end;
  v_store := case when jsonb_typeof(p_action->'store') = 'string' then p_action->>'store' end;
  -- ⟦rune-on-empty⟧ src/data/runes.js RUNE_ON_EMPTY, pinned by tests/hunt-core/abilities.mjs
  v_on := case when jsonb_typeof(p_action->'onEmpty') = 'string' and p_action->>'onEmpty' = any (array['store', 'leave']) then p_action->>'onEmpty' else 'store' end;
  -- ⟦/rune-on-empty⟧
  -- BUY FROM THE SHOP BY DEFAULT (Tyler 2026-11-08, "Yes make the default to buy from the shop"): naming no shop rune, the family's tier-1 one.
  if v_on = 'store' and v_store is null then
    select r.key into v_store from jsonb_each_text(v_row->'store') r where r.value::int = 1 order by r.key limit 1; end if;
  return jsonb_build_object('runes', v_all, 'own', v_own, 'store', v_store, 'onEmpty', v_on);
end $$;
revoke execute on function public.hr_hunt_rune_supply(jsonb) from public, anon, authenticated, service_role;

-- 'none': none of the runes `p_own` ticks is carried (a hunting hero's hunt bag, in town the backpack Enter packs from). 'ready': the
-- hero's level in the spell's skill casts one of them. 'locked': not yet. The engine's runeFor over the ticked runes only.
create or replace function public.hr_hunt_rune_state(p_user uuid, p_slot int, p_session uuid, p_ability text, p_own jsonb)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_row jsonb := public.hr_hunt_rune_spells()->p_ability;
  v_own jsonb := case when jsonb_typeof(p_own) = 'array' then p_own else '[]'::jsonb end;
  v_min int;
  v_lv  int;
begin
  if v_row is null then return 'none'; end if;
  if p_session is not null then
    select min((v_row->'runes'->>b.item_id)::int) into v_min from public.hunt_bag b
     where b.session_id = p_session and b.qty_left > 0 and v_row->'runes' ? b.item_id and v_own @> jsonb_build_array(b.item_id);
  else
    select min((v_row->'runes'->>pi.item_id)::int) into v_min from public.player_inventory pi
     where pi.user_id = p_user and pi.slot = p_slot and pi.qty > 0 and v_row->'runes' ? pi.item_id and v_own @> jsonb_build_array(pi.item_id);
  end if;
  if v_min is null then return 'none'; end if;
  select public.hr_skill_level(v_row->>'skill', k.xp) into v_lv from public.player_skills k
   where k.user_id = p_user and k.slot = p_slot and k.skill_id = v_row->>'skill';
  return case when coalesce(v_lv, 1) >= v_min then 'ready' else 'locked' end;
end $$;
revoke execute on function public.hr_hunt_rune_state(uuid, int, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- ── §2 THE DOOR (hr_hunt_slot_check, four splices; a second apply finds the marker) ───────────────────────────────────
do $mig$
declare v_def text; v_pair text[]; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_slot_check(jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'RUNE-SUPPLY') = 0 then
    foreach v_pair slice 1 in array array[
      array[$a$  v_type text; v_id text; v_r jsonb; v_store text; v_ign jsonb; v_max int;$a$,
            $a$  v_type text; v_id text; v_r jsonb; v_store text; v_ign jsonb; v_max int;
  v_rs jsonb;   -- RUNE-SUPPLY (2027-03-24-rune-supply.sql): a rune spell's supply (hr_hunt_rune_supply)$a$],
      array[$a$    v_r := jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'), 'conditions', '[]'::jsonb, 'join', 'and');$a$,
            $a$    v_rs := public.hr_hunt_rune_supply(jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'));
    v_r := jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}')
                                        || case when v_rs is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('own', v_rs->'own', 'onEmpty', v_rs->'onEmpty', 'store', v_rs->'store')) end,
                              'conditions', '[]'::jsonb, 'join', 'and');$a$],
      array[$a$where k not in ('type', 'id', 'store')) then$a$, $a$where k not in ('type', 'id', 'store', 'own', 'onEmpty')) then$a$],
      array[$a$  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);$a$,
            $a$  -- RUNE-SUPPLY (2027-03-24-rune-supply.sql, Tyler 2026-11-08): a rune spell's slot names the carried runes it may spend (`own`)
  -- and what it does when they run out (`onEmpty`: buy the store rune it names, or leave the hunt). Each must read back through
  -- hr_hunt_rune_supply as it was said: runes of the spell's family, each once, a known word; "buy" names a store rune, "leave"
  -- names none and has a ticked rune to run out of. A slot that spends no rune carries neither (conditions.js runeSupplyProblem).
  v_rs := case when v_type = 'ability' then public.hr_hunt_rune_supply(p_s->'action') end;
  if v_rs is null then
    if p_s->'action' ? 'own' then return jsonb_build_object('ok', false, 'error', 'bad_own'); end if;
    if p_s->'action' ? 'onEmpty' then return jsonb_build_object('ok', false, 'error', 'bad_on_empty'); end if;
  else
    if p_s->'action' ? 'own' and (jsonb_typeof(p_s->'action'->'own') is distinct from 'array'
                                  or jsonb_array_length(p_s->'action'->'own') <> jsonb_array_length(v_rs->'own')) then
      return jsonb_build_object('ok', false, 'error', 'bad_own'); end if;
    if p_s->'action' ? 'onEmpty' and (p_s->'action'->'onEmpty') is distinct from (v_rs->'onEmpty') then
      return jsonb_build_object('ok', false, 'error', 'bad_on_empty'); end if;
    if (v_rs->>'onEmpty' = 'store') <> (v_rs->>'store' is not null) or (v_rs->>'onEmpty' = 'leave' and v_store is not null) then
      return jsonb_build_object('ok', false, 'error', 'bad_store'); end if;
    if v_rs->>'onEmpty' = 'leave' and jsonb_array_length(v_rs->'own') = 0 then
      return jsonb_build_object('ok', false, 'error', 'bad_on_empty'); end if;
  end if;
  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);$a$],
      array[$a$                                     || case when v_store is null then '{}'::jsonb else jsonb_build_object('store', v_store) end,$a$,
            $a$                                     || case when v_store is null then '{}'::jsonb else jsonb_build_object('store', v_store) end
                                     || case when v_rs is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('own', v_rs->'own', 'onEmpty', v_rs->'onEmpty', 'store', v_rs->'store')) end,$a$]
    ] loop
      v_n := (length(v_def) - length(replace(v_def, v_pair[1], ''))) / length(v_pair[1]);
      if v_n <> 1 then raise exception 'hr_hunt_slot_check: RUNE-SUPPLY anchor matched % times (need 1): the body moved: %', v_n, left(v_pair[1], 80); end if;
      v_def := replace(v_def, v_pair[1], v_pair[2]);
    end loop;
    execute v_def;
  end if;
end $mig$;

-- ── §3 THE VIEW (hr_hunt_settings_view, four splices), THEN THE OLD STATE GOES ─────────────────────────────────────────
do $mig$
declare v_def text; v_pair text[]; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settings_view(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'RUNE-SUPPLY') = 0 then
    foreach v_pair slice 1 in array array[
      array[$a$  v_can   boolean;$a$, $a$  v_can   boolean;
  v_rs    jsonb;   -- RUNE-SUPPLY (2027-03-24-rune-supply.sql): the slot's rune supply (hr_hunt_rune_supply)$a$],
      array[$a$      v_rune := case when v_ab.rune is null then 'ready' else public.hr_hunt_rune_state(p_user, p_slot, s.id, v_ab.ability_id) end;$a$,
            $a$      -- RUNE-SUPPLY (2027-03-24-rune-supply.sql, Tyler 2026-11-08): only the runes the slot ticked count, and the store only when the
      -- slot buys on empty (abilities.js runeFor). The slot projects its supply whole, a default slot's too, so the bar reads what the engine runs.
      v_rs := public.hr_hunt_rune_supply(v_e->'action');
      if v_rs is not null then v_e := jsonb_set(v_e, '{action}', (v_e->'action') || jsonb_strip_nulls(jsonb_build_object('own', v_rs->'own', 'onEmpty', v_rs->'onEmpty', 'store', v_rs->'store'))); end if;
      v_rune := case when v_ab.rune is null then 'ready' else public.hr_hunt_rune_state(p_user, p_slot, s.id, v_ab.ability_id, v_rs->'own') end;$a$],
      array[$a$      v_store := case when v_rune <> 'ready' and v_on and v_e->'action' ? 'store'$a$,
            $a$      v_store := case when v_rune <> 'ready' and v_on and v_rs->>'onEmpty' = 'store' and v_e->'action' ? 'store'$a$],
      array[$a$        'why', case when v_can is false and v_store = 'locked' then 'store_level'$a$,
            $a$        'why', case when v_can is false and v_rune = 'none' and v_rs->>'onEmpty' = 'leave' then 'runes_out'
                    when v_can is false and v_store = 'locked' then 'store_level'$a$]
    ] loop
      v_n := (length(v_def) - length(replace(v_def, v_pair[1], ''))) / length(v_pair[1]);
      if v_n <> 1 then raise exception 'hr_hunt_settings_view: RUNE-SUPPLY anchor matched % times (need 1): the body moved: %', v_n, left(v_pair[1], 80); end if;
      v_def := replace(v_def, v_pair[1], v_pair[2]);
    end loop;
    execute v_def;
  end if;
end $mig$;
drop function if exists public.hr_hunt_rune_state(uuid, int, uuid, text);

-- ── §4 THE SETTLE PROVES THE NEW END (hr_hunt_settle_session, one splice) ───────────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'RUNE-SUPPLY') = 0 then
    v_old := $a$      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);$a$;
    v_new := $a$      -- RUNE-SUPPLY (2027-03-24-rune-supply.sql, Tyler 2026-11-08): a spell's slot set to "Leave the hunt" came to cast with none of
      -- the runes it ticks left (src/core/hunt/abilities.js runeFor). Provable as: the session's bar holds that spell (`ended.ability`,
      -- the engine's) switched on and leaving on empty, and no rune it ticks is left in the hunt bag after this window's uses. It can
      -- only stop value, never mint it.
      when 'runes_out' then exists (select 1 from public.player_action_sets a
                                     cross join lateral jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) e
                                     cross join lateral (select public.hr_hunt_rune_supply(e->'action') as rs) x
                                    where a.user_id = p_user and a.slot = p_slot and a.preset = v_s.preset
                                      and jsonb_typeof(e) = 'object' and e->'action'->>'id' = p_delta->'ended'->>'ability'
                                      and e->'enabled' is distinct from 'false'::jsonb and x.rs->>'onEmpty' = 'leave'
                                      and not exists (select 1 from public.hunt_bag b
                                                       where b.session_id = p_session and x.rs->'own' @> jsonb_build_array(b.item_id)
                                                         and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0))
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: RUNE-SUPPLY anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

do $grants$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_rune_supply(jsonb) from %I', v_role);
      execute format('revoke all on function public.hr_hunt_rune_state(uuid, integer, uuid, text, jsonb) from %I', v_role); end if;
  end loop;
end $grants$;

-- ── §5 THE SAVED BARS, ONCE (the migration's work, not a self-check) ─────────────────────────────────────────────────────
-- Every stored rune spell slot goes back through the new door (hr_hunt_slot_check), which writes its supply out whole: own = every rune of
-- the family, onEmpty = 'store', the shop rune it names, else the family's tier-1 one. The bar keeps every other slot as stored (an invalid one still
-- reads as an empty tablet) and its repeats' _2, _3 ids as hr_hunt_bar_check gives them. A second apply finds nothing to rewrite.
create or replace function pg_temp.hr_rune_supply_bar(p_slots jsonb)
returns jsonb language plpgsql as $$
declare v_out jsonb := '[]'::jsonb; v_e jsonb; v_r jsonb; v_id text; v_n int;
begin
  for v_e in select value from jsonb_array_elements(p_slots) loop
    v_r := public.hr_hunt_slot_check(v_e);
    if coalesce((v_r->>'ok')::boolean, false) and jsonb_typeof(v_r->'slot') = 'object' then
      v_id := v_r->'slot'->>'id';
      select count(*)::int into v_n from jsonb_array_elements(v_out) e
       where jsonb_typeof(e) = 'object' and (e->>'id' = v_id or e->>'id' like v_id || '\_%');
      if v_n > 0 then v_r := jsonb_set(v_r, '{slot,id}', to_jsonb(v_id || '_' || (v_n + 1))); end if;
      v_out := v_out || jsonb_build_array(v_r->'slot');
    else
      v_out := v_out || jsonb_build_array(v_e);
    end if;
  end loop;
  return v_out;
end $$;
update public.player_action_sets a
   set slots = pg_temp.hr_rune_supply_bar(a.slots), updated_at = now()
 where jsonb_typeof(a.slots) = 'array'
   and exists (select 1 from jsonb_array_elements(a.slots) e
                where public.hr_hunt_rune_supply(case when jsonb_typeof(e) = 'string' then jsonb_build_object('type', 'ability', 'id', e #>> '{}') else e->'action' end) is not null
                  and not (jsonb_typeof(e) = 'object' and e->'action' ? 'own' and e->'action' ? 'onEmpty'
                           and (e->'action'->>'onEmpty' = 'leave' or e->'action' ? 'store')));

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────────────────────────────────────────────
do $$
declare
  c_u  constant uuid := '000000d7-0000-4000-a000-0000ca771024';
  v jsonb; v_k text; v_case record; v_slot jsonb;
begin
  -- (a) NO CLIENT REACHES THE NEW FUNCTIONS OR THE SPLICED ONES; THE OLD STATE IS GONE.
  foreach v_k in array array['public.hr_hunt_rune_supply(jsonb)', 'public.hr_hunt_rune_state(uuid,integer,uuid,text,jsonb)', 'public.hr_hunt_slot_check(jsonb)',
                             'public.hr_hunt_settings_view(uuid,integer)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'] loop
    if has_function_privilege('anon', v_k::regprocedure, 'execute') or has_function_privilege('authenticated', v_k::regprocedure, 'execute')
       or has_function_privilege('service_role', v_k::regprocedure, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = v_k::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'rune-supply §6(a): % is client-reachable', v_k; end if;
  end loop;
  foreach v_k in array array['public.hr_hunt_rune_supply(jsonb)', 'public.hr_hunt_rune_state(uuid,integer,uuid,text,jsonb)'] loop
    if exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', v_k::regprocedure, 'execute') then
      raise exception 'rune-supply §6(a): % is reachable by hr_engine', v_k; end if;
  end loop;
  if to_regprocedure('public.hr_hunt_rune_state(uuid,integer,uuid,text)') is not null then
    raise exception 'rune-supply §6(a): the 4-argument hr_hunt_rune_state (every rune of the family) still stands'; end if;
  perform public.hr_assert_grant_hygiene(true);

  -- (b) THE SUPPLY: a slot that says nothing ticks the five Fire runes, lowest tier first, and buys the shop's tier-1 Fire rune.
  v := public.hr_hunt_rune_supply('{"type":"ability","id":"fireball"}'::jsonb);
  if v->'own' is distinct from '["chalked_fire_rune","scored_fire_rune","etched_fire_rune","carved_fire_rune","graven_fire_rune"]'::jsonb
     or v->'runes' is distinct from v->'own' or v->>'onEmpty' <> 'store' or v->>'store' is distinct from 'plain_fire_rune' then
    raise exception 'rune-supply §6(b): a bare Fireball reads %', v; end if;
  v := public.hr_hunt_rune_supply('{"type":"ability","id":"fireball","store":"plain_fire_rune","own":["graven_fire_rune","chalked_fire_rune","chalked_ice_rune"]}'::jsonb);
  if v->'own' is distinct from '["chalked_fire_rune","graven_fire_rune"]'::jsonb or v->>'onEmpty' <> 'store' then
    raise exception 'rune-supply §6(b): a ticked Fireball reads %', v; end if;
  if public.hr_hunt_rune_supply('{"type":"ability","id":"power_strike"}'::jsonb) is not null
     or public.hr_hunt_rune_supply('{"type":"consume","id":"salted_shrimp"}'::jsonb) is not null then
    raise exception 'rune-supply §6(b): a slot that spends no rune has a rune supply'; end if;

  -- (c) THE DOOR: each refusal the engine's conditions.js runeSupplyProblem gives (tests/hunt-core/abilities.mjs, the same table), and the
  --     stored slot carries the supply whole, its rule id the md5 of what it stores.
  for v_case in select * from (values
      ('{"own":["chalked_ice_rune"],"store":"plain_fire_rune"}', 'bad_own'),
      ('{"own":["chalked_fire_rune","chalked_fire_rune"],"store":"plain_fire_rune"}', 'bad_own'),
      ('{"own":"chalked_fire_rune","store":"plain_fire_rune"}', 'bad_own'),
      ('{"own":[7],"store":"plain_fire_rune"}', 'bad_own'),
      ('{"onEmpty":"end","store":"plain_fire_rune"}', 'bad_on_empty'),
      ('{"onEmpty":1,"store":"plain_fire_rune"}', 'bad_on_empty'),
      ('{"onEmpty":"leave","store":"plain_fire_rune"}', 'bad_store'),
      ('{"own":[],"onEmpty":"leave"}', 'bad_on_empty'),
      ('{"own":[],"store":"plain_ice_rune"}', 'bad_store')) t(extra, want) loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'flame_strike') || v_case.extra::jsonb, 'conditions', '[]'::jsonb, 'join', 'and'));
    if v->>'error' is distinct from v_case.want then raise exception 'rune-supply §6(c): % answered %, want %', v_case.extra, v, v_case.want; end if;
  end loop;
  foreach v_k in array array['{"type":"ability","id":"power_strike","onEmpty":"leave"}', '{"type":"ability","id":"power_strike","own":[]}', '{"type":"consume","id":"salted_shrimp","own":[]}'] loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', v_k::jsonb, 'conditions', '[]'::jsonb, 'join', 'and'));
    if v->>'error' not in ('bad_own', 'bad_on_empty') then raise exception 'rune-supply §6(c): a slot that spends no rune took a rune supply: % answered %', v_k, v; end if;
  end loop;
  foreach v_k in array array['{"own":[],"store":"plain_fire_rune","onEmpty":"store"}', '{"own":["scored_fire_rune"],"onEmpty":"leave"}',
                             '{"own":["graven_fire_rune","chalked_fire_rune"],"store":"plain_etched_fire_rune","onEmpty":"store"}', '{}', '{"store":"plain_fire_rune"}', '{"onEmpty":"store"}'] loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'flame_strike') || v_k::jsonb, 'conditions', '[]'::jsonb, 'join', 'and'));
    v_slot := v->'slot';
    if coalesce(v->>'ok', '') <> 'true' or not (v_slot->'action' ? 'own' and v_slot->'action' ? 'onEmpty')
       or (v_slot->'action'->>'onEmpty' = 'store' and not (v_slot->'action' ? 'store'))
       or v_slot->>'id' is distinct from 'r' || substr(md5((v_slot - 'id')::text), 1, 8) then
      raise exception 'rune-supply §6(c): % was refused or stored without its supply: %', v_k, v; end if;
  end loop;
  v := public.hr_hunt_slot_check('"fireball"'::jsonb);
  if v->'slot'->'action'->'own' is distinct from (public.hr_hunt_rune_supply('{"type":"ability","id":"fireball"}'::jsonb)->'own') or v->'slot'->'action'->>'onEmpty' <> 'store' or v->'slot'->'action'->>'store' is distinct from 'plain_fire_rune' then
    raise exception 'rune-supply §6(c): a bare Fireball id is stored as %', v; end if;

  -- (d) THE SETTLE PROVES runes_out, and no saved rune spell slot is left without its supply.
  if strpos(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), $q$when 'runes_out' then exists$q$) = 0 then
    raise exception 'rune-supply §6(d): the settle has no runes_out proof'; end if;
  if exists (select 1 from public.player_action_sets a, jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) e
              where public.hr_hunt_rune_supply(case when jsonb_typeof(e) = 'string' then jsonb_build_object('type', 'ability', 'id', e #>> '{}') else e->'action' end) is not null
                and not (jsonb_typeof(e) = 'object' and e->'action' ? 'own' and e->'action' ? 'onEmpty'
                         and (e->'action'->>'onEmpty' = 'leave' or e->'action' ? 'store'))) then
    raise exception 'rune-supply §6(d): a saved rune spell slot still has no supply'; end if;

  -- (e) THE VIEW on a real hero (a wand, Magic 1, the store open): only the ticked runes count, the store only when the slot buys, and a
  --     slot that leaves with none of its ticked runes left says runes_out.
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'rune-supply §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'rune-supply §6-harness: hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    delete from public.player_inventory where user_id = c_u and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, 'practice_wand', 1), (c_u, 0, 'scored_fire_rune', 5);
    delete from public.player_equipment where user_id = c_u and slot = 0 and equip_slot in ('weapon', 'shield');
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_u, 0, 'weapon', 'practice_wand');
    update public.player_skills set xp = 0 where user_id = c_u and slot = 0 and skill_id = 'magic';
    delete from public.player_action_sets where user_id = c_u and slot = 0;
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values (c_u, 0, 0, 'Probe', jsonb_build_array(
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'own', jsonb_build_array('chalked_fire_rune'), 'onEmpty', 'leave'), 'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'own', jsonb_build_array('chalked_fire_rune'), 'store', 'plain_fire_rune', 'onEmpty', 'store'), 'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'own', jsonb_build_array('scored_fire_rune'), 'onEmpty', 'leave'), 'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'own', jsonb_build_array('chalked_fire_rune')), 'conditions', '[]'::jsonb, 'join', 'and')),
      '{"on_empty":"switch"}'::jsonb);
    v := public.hr_hunt_settings_view(c_u, 0);
    if v->'slots'->0->>'usable' is distinct from 'false' or v->'slots'->0->>'why' is distinct from 'runes_out' then
      raise exception 'rune-supply §6(e): a leaving slot whose ticked rune is not carried (an unticked one is) reads %', v->'slots'->0; end if;
    if v->'slots'->1->>'usable' is distinct from 'true' or v->'slots'->1->>'why' is not null then
      raise exception 'rune-supply §6(e): a buying slot whose ticked rune is not carried reads %', v->'slots'->1; end if;
    if v->'slots'->2->>'usable' is distinct from 'false' or v->'slots'->2->>'why' is distinct from 'rune_level' then
      raise exception 'rune-supply §6(e): a slot ticking a rune above Magic 1 reads %', v->'slots'->2; end if;
    if v->'slots'->3->>'usable' is distinct from 'true' or v->'slots'->3->'action'->>'onEmpty' <> 'store' or v->'slots'->3->'action'->>'store' is distinct from 'plain_fire_rune' then
      raise exception 'rune-supply §6(e): a slot naming no shop rune does not buy the tier-1 one: %', v->'slots'->3; end if;
    if v->'slots'->0->'action'->'own' is distinct from '["chalked_fire_rune"]'::jsonb or v->'slots'->0->'action'->>'onEmpty' <> 'leave' then
      raise exception 'rune-supply §6(e): the view does not project the slot''s supply: %', v->'slots'->0; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, 'chalked_fire_rune', 3);
    v := public.hr_hunt_settings_view(c_u, 0);
    if v->'slots'->0->>'usable' is distinct from 'true' or v->'slots'->0->>'why' is not null then
      raise exception 'rune-supply §6(e): a leaving slot with its ticked rune carried reads %', v->'slots'->0; end if;
    raise exception 'rune-supply §6-rollback';
  exception when others then
    if sqlerrm <> 'rune-supply §6-rollback' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'rune-supply §6 OK';
end $$;
