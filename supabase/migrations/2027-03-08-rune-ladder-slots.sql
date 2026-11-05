-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2027-03-08-rune-ladder-slots.sql — A SPELL'S SLOT MAY NAME ANY STORE RUNE OF ITS FAMILY
--   (lane/c-rune-ladder, systems-engineer, 2026-11-05; Tyler the same day: "let start with your calls", the designer's rune ladder,
--   lane/d-crafted-jewelry "Runes"; rulings of record: THE PLAYER PICKS EVERY SUPPLY, STORE FALLBACK FOR EVERY SUPPLY, RUNE FAMILIES).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §3; ON THE EA SECURITY LIST (what a slot may buy). The hr-accrue that casts a deeper store rune deploys at once after.
-- APPLY ORDER: 2027-03-08-rune-ladder-items-catalogue.generated.sql, 2027-03-08-rune-ladder-bench-tax-rates.generated.sql,
--   2027-03-08-rune-ladder-hunt-sessions-catalogue.generated.sql, 2027-03-08-rune-ladder-rune-spells.generated.sql, THIS FILE.
--
-- ── WHAT IT SHIPS ──────────────────────────────────────────────────────────────────────────────────────────────────
--   hr_hunt_slot_check            RESTATED: `action.store` is a store row of the spell's family, of any tier, read off hr_hunt_rune_spells()'s new
--                                 `store` map. Until today it had to partner the family's Chalked rune. Nothing else in it moves.
--   hr_hunt_rune_store_state      NEW, server-only: ready | locked | none for one store rune of one spell against the hero's level in the spell's skill.
--   hr_hunt_settings_view         RESTATED: `usable` reads that state, and a store rune above the hero's level says so: `why` store_level. Nothing else moves.
--
-- ── WHO IS TOUCHED ─────────────────────────────────────────────────────────────────────────────────────────────────
-- A bar is never rewritten: no player row moves here. A saved Plain slot validates and reads exactly as it did, and its rule id is unchanged
-- (the id hashes the slot's content). The default bars and the starter bar name Plain or nothing; no bar names a deeper rune unless its player does.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────────────────────────────────────────────
-- A client may now store one more kind of string in `action.store`, refused unless it is a catalogue row of the spell's own family. Every use is
-- re-priced from hr_hunt_basic_supplies by the settle (hr_hunt_apply_member), never a client number: the row a slot names sets what a cast buys, the
-- catalogue what it costs. The new rows are `ammo` to the settle's day bound, which already counts a store rune per cast. FOR THE EA REVIEW: the
-- engine's level gate on a store rune is the same runeFor every hero runs; the server re-prices the buy, it does not re-prove the version.
--
-- ── COST ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A slot naming no store rune: no new work. A slot naming one: one jsonb key read per validation, one PK read of hr_hunt_basic_supplies, and, on a
-- rune above tier 1 with no carried rune, one PK read of player_skills per view. Plain (tier 1) reads no skill.
--
-- REVERSIBILITY: re-apply hr_hunt_slot_check from 2027-01-13-slot-truth.sql and hr_hunt_settings_view from 2027-02-21-hunt-carry-in.sql, and clear any
-- deeper `action.store` first: an old validator reads such a slot as an empty tablet. No value moves either way. No begin/commit. No cron.* write.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_rune_spells()') is null or to_regprocedure('public.hr_hunt_rune_state(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null or to_regclass('public.hr_hunt_basic_supplies') is null then
    raise exception 'PRECONDITION: the rune chain (2027-02-21-hunt-carry-in.sql) is absent'; end if;
  if public.hr_hunt_rune_spells()->'fireball'->'store' is null then
    raise exception 'PRECONDITION: apply 2027-03-08-rune-ladder-rune-spells.generated.sql first (hr_hunt_rune_spells has no store map)'; end if;
  if not exists (select 1 from public.hr_hunt_basic_supplies where basic_id = 'plain_scored_fire_rune') then
    raise exception 'PRECONDITION: apply 2027-03-08-rune-ladder-hunt-sessions-catalogue.generated.sql first (no deeper store rune)'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-05) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_hunt_slot_check(jsonb)', '80eb1a65bdc5bb99977e6d3542989cb2', '3cc75530e89e0caa1a44450e6d479a84'),
    ('public.hr_hunt_settings_view(uuid,integer)', '87677b80058b01bf909a441651b064ea', '6a1c82f1be477f7899f019bd14f462b4')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 ONE STORE RUNE AGAINST THE HERO'S LEVEL ───────────────────────────────────────────────────────────────────────
-- 'none': no such row for this spell. 'ready': the hero's level in the spell's skill has its version. 'locked': not yet. The engine's rule (abilities.js runeFor).
create or replace function public.hr_hunt_rune_store_state(p_user uuid, p_slot int, p_ability text, p_store text)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_row jsonb := public.hr_hunt_rune_spells()->p_ability;
  v_min int := (v_row->'store'->>p_store)::int;
  v_lv  int;
begin
  if v_min is null or not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = p_store) then return 'none'; end if;
  if v_min <= 1 then return 'ready'; end if;
  select public.hr_skill_level(v_row->>'skill', k.xp) into v_lv from public.player_skills k
   where k.user_id = p_user and k.slot = p_slot and k.skill_id = v_row->>'skill';
  return case when coalesce(v_lv, 1) >= v_min then 'ready' else 'locked' end;
end $$;
revoke execute on function public.hr_hunt_rune_store_state(uuid, int, text, text) from public, anon, authenticated, service_role;

-- ── §2 THE VALIDATOR AND THE VIEW, RESTATED ──────────────────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_slot_check(p_s jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  -- STORE-BY-SLOT (2026-11-04): a slot names ONE item; a rune spell may name a store rune of its family (action.store).
  -- SLOT-TRUTH (2027-01-13): a slot may be switched Off (enabled) and may ignore monsters (ignore).
  v_type text; v_id text; v_r jsonb; v_store text; v_ign jsonb; v_max int;
begin
  if p_s is null or jsonb_typeof(p_s) = 'null' then return jsonb_build_object('ok', true, 'slot', 'null'::jsonb); end if;
  if jsonb_typeof(p_s) = 'string' then
    if not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = p_s #>> '{}') then
      return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
    v_r := jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', p_s #>> '{}'), 'conditions', '[]'::jsonb, 'join', 'and');
    return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8)));
  end if;
  if jsonb_typeof(p_s) <> 'object' or jsonb_typeof(p_s->'action') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s) k where k not in ('id', 'action', 'conditions', 'join', 'enabled', 'ignore')) then
    return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  -- SLOT-TRUTH: ON / OFF, a boolean (false = Off: the slot never fires).
  if p_s ? 'enabled' and jsonb_typeof(p_s->'enabled') is distinct from 'boolean' then
    return jsonb_build_object('ok', false, 'error', 'bad_enabled'); end if;
  -- SLOT-TRUTH: the monsters it ignores: unique ids of the catalogue's monsters, at most max_ignored, stored sorted.
  if p_s ? 'ignore' then
    v_max := (select value from public.hr_hunt_condition_limits where key = 'max_ignored');
    if v_max is null then return jsonb_build_object('ok', false, 'error', 'bad_slot', 'why', 'catalogue_missing'); end if;
    if jsonb_typeof(p_s->'ignore') <> 'array' then return jsonb_build_object('ok', false, 'error', 'bad_ignore'); end if;
    if jsonb_array_length(p_s->'ignore') > v_max then
      return jsonb_build_object('ok', false, 'error', 'too_many_ignored', 'max', v_max); end if;
    if exists (select 1 from jsonb_array_elements(p_s->'ignore') e
                where jsonb_typeof(e) <> 'string'
                   or not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = e #>> '{}'))
       or (select count(distinct e #>> '{}') from jsonb_array_elements(p_s->'ignore') e) <> jsonb_array_length(p_s->'ignore') then
      return jsonb_build_object('ok', false, 'error', 'bad_ignore'); end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x), '[]'::jsonb) into v_ign from jsonb_array_elements_text(p_s->'ignore') x;
  end if;
  v_type := p_s->'action'->>'type'; v_id := p_s->'action'->>'id';
  -- THE RETIRED "ANY FOOD" / "ANY DRINK" (Tyler 2026-10-21: the game never picks a supply): refused in words.
  if v_type = 'consume' and v_id in ('food', 'drink') then
    return jsonb_build_object('ok', false, 'error', 'choose_item'); end if;
  if jsonb_typeof(p_s->'action'->'id') is distinct from 'string' or v_type is null
     or not coalesce(case v_type
          when 'ability' then exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_id)
          when 'consume' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'consume' and x.id = v_id)
          when 'attack_with_item' then exists (select 1 from public.hr_hunt_action_ids x where x.type = 'attack_with_item' and x.id = v_id)
          else false end, false) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  if exists (select 1 from jsonb_object_keys(p_s->'action') k where k not in ('type', 'id', 'store')) then
    return jsonb_build_object('ok', false, 'error', 'bad_action'); end if;
  -- THE STORE RUNE (designer 2026-10-21; the rune ladder, Tyler 2026-11-05): only a spell that spends a rune may name a store
  -- row, on sale and of that spell's family, of any tier: a tier above the hero's level keeps its place on the bar and waits
  -- (hr_hunt_settings_view `why` store_level; conditions.js storeFits, the same rule). A food or drink slot names its one item and nothing else.
  if p_s->'action' ? 'store' then
    v_store := case when jsonb_typeof(p_s->'action'->'store') = 'string' then p_s->'action'->>'store' end;
    if v_store is null or v_type <> 'ability' or not coalesce(public.hr_hunt_rune_spells()->v_id->'store' ? v_store, false)
       or not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_store) then
      return jsonb_build_object('ok', false, 'error', 'bad_store'); end if;
  end if;
  v_r := public.hr_hunt_conds_check(p_s->'conditions', p_s->'join', false);
  if v_r is not null then return jsonb_build_object('ok', false) || v_r; end if;
  -- THE STABLE RULE ID is the server's, from the slot's CONTENT (never the client's value,
  -- never its position): a reorder or a copy keeps it, an edit changes it. SLOT-TRUTH: the
  -- ignored monsters are content; Off is not (the id survives an Off and On).
  v_r := jsonb_build_object('action', jsonb_build_object('type', v_type, 'id', v_id)
                                     || case when v_store is null then '{}'::jsonb else jsonb_build_object('store', v_store) end,
    'conditions', coalesce(p_s->'conditions', '[]'::jsonb), 'join', coalesce(p_s->>'join', 'and'))
    || case when v_ign is null or jsonb_array_length(v_ign) = 0 then '{}'::jsonb else jsonb_build_object('ignore', v_ign) end;
  return jsonb_build_object('ok', true, 'slot', v_r || jsonb_build_object('id', 'r' || substr(md5(v_r::text), 1, 8))
    || case when p_s->'enabled' = 'false'::jsonb then jsonb_build_object('enabled', false) else '{}'::jsonb end);
end $$;
revoke execute on function public.hr_hunt_slot_check(jsonb) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_settings_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  s       public.hunt_sessions%rowtype;
  a       public.player_action_sets%rowtype;
  i       public.hunt_instances%rowtype;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_preset int;
  v_opt   jsonb;
  v_wj    jsonb;
  v_uf    jsonb;
  v_me    jsonb;
  v_unit  jsonb := '{}'::jsonb;
  v_role  text;
  v_disc  text;
  v_list  jsonb := '[]'::jsonb;
  v_def   jsonb;
  v_d     jsonb;
  v_pos   int;
  v_slots jsonb := '[]'::jsonb;
  v_e     jsonb;
  v_presets jsonb;
  v_eff   jsonb := '{}'::jsonb;
  v_o     record;
  v_val   jsonb;
  v_ab    public.hr_hunt_abilities%rowtype;
  v_n     bigint;
  v_own   boolean;
  v_on    boolean;
  v_rune  text;
  v_store text;    -- THE RUNE LADDER (2027-03-08-rune-ladder-slots.sql): the state of the store rune the slot names
  v_can   boolean;
  v_rdef  jsonb;   -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): the engine's pick for an option the hero never set
  v_party text[];
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  -- SPELL-ROLES (2027-01-13-spell-roles.sql): the abilities the bar may hold are the worn set's ROLE KEY's discipline
  -- (hr_hunt_weapon_roles.discipline over hr_hunt_weapon_of: the weapon and the shield beside it), never the role's;
  -- the role default slots are kept to that discipline (as the engine's heroSlots keeps them); `discipline` is projected.
  -- DENSITY-HOME (2026-11-17-hunt-density-home.sql): no `density` key; the pick per ground is the hunt_density section.
  -- SETS-MODEL (2026-11-15-preset-names.sql): out of a hunt the bar is the hero's CURRENT setup's, not set 0.
  v_preset := coalesce(s.preset, public.hr_hunt_active_set(p_user, p_slot));
  select * into a from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = v_preset;
  v_opt := coalesce(a.options, '{}'::jsonb);
  -- The hunting hero's unit: its role and the settings the engine runs it on.
  if s.id is not null and s.unit_id is not null then
    select * into i from public.hunt_instances where id = s.instance_id;
    select * into v_shape from public.hr_hunt_world_shape where id;
    begin
      v_wj := i.world::jsonb;
    exception when others then
      v_wj := null;
    end;
    if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id and jsonb_typeof(v_wj->'u') = 'array'
       and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
      v_uf := v_shape.fields->'unit';
      select e into v_me from jsonb_array_elements(v_wj->'u') e
       where e->>((v_uf->>'side')::int) = 'hero' and (e->>((v_uf->>'id')::int))::int = s.unit_id limit 1;
      if v_me is not null then
        v_role := v_me->>((v_uf->>'role')::int);
        v_unit := jsonb_build_object('distance', v_me->((v_uf->>'dist')::int), 'chase', v_me->((v_uf->>'chase')::int),
                                     'target_mode', v_me->((v_uf->>'tmode')::int), 'stance', v_me->((v_uf->>'stance')::int));
      end if;
    end if;
  end if;
  -- Not hunting: the role the worn weapon gives (a staff's pick kept when it allows it).
  if v_role is null or v_role = '' then
    select case when v_opt->>'role' = any (w.roles) then v_opt->>'role' else w.roles[1] end into v_role
      from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot);
  end if;
  -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): an option still unset reads what the ENGINE would play (hunt-spawn.js
  -- heroSetup over roles.js defaultSettings: the role's default for this party, hr_hunt_role_default) and the gold to keep
  -- the store bill keeps (gold_floor_default), so the bar is set in town and the browser never keeps its own copy. The
  -- party: in a hunt its instance's open seats; in town the hero's party's seats; else the hero alone.
  v_party := case when s.id is not null
                  then array(select public.hr_hunt_role_of(h.user_id, h.slot) from public.hunt_sessions h
                              where h.instance_id = s.instance_id and h.ended_at is null order by h.user_id, h.slot)
                  else array(select public.hr_hunt_role_of(m.user_id, m.slot) from public.hunt_party_members m
                              where m.party_id = public.hr_hunt_party_of(p_user, p_slot) order by m.seat) end;
  v_rdef := coalesce(public.hr_hunt_role_default(v_role, v_party), '{}'::jsonb)
            || jsonb_build_object('gold_floor', public.hr_hunt_limit('gold_floor_default'));
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(nullif(v_opt->v_o.opt, 'null'::jsonb), v_unit->v_o.opt, v_o.dflt, v_rdef->v_o.opt);
    v_eff := v_eff || jsonb_build_object(v_o.opt, v_val);
  end loop;
  select w.discipline into v_disc from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot);
  -- THE BAR: the stored slots (an invalid row reads as an empty tablet), then the defaults.
  for v_e in select value from jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) loop
    v_d := public.hr_hunt_slot_check(v_e);
    v_list := v_list || jsonb_build_array(case when (v_d->>'ok')::boolean then v_d->'slot' else 'null'::jsonb end);
  end loop;
  v_def := '[]'::jsonb;
  if not exists (select 1 from jsonb_array_elements(v_list) e join public.hr_hunt_abilities ab on ab.ability_id = e->'action'->>'id'
                  where e->'action'->>'type' = 'ability' and v_disc = any (ab.disciplines)) then
    select coalesce(jsonb_agg(r.slot order by r.ord), '[]'::jsonb) into v_def from public.hr_hunt_role_rules r
     where r.role = v_role
       and exists (select 1 from public.hr_hunt_abilities ab where ab.ability_id = r.slot->'action'->>'id' and v_disc = any (ab.disciplines));
  end if;
  -- STORE-BY-SLOT (2026-11-04): NO default food or drink (Tyler 2026-10-21: the game never picks a
  -- supply). A NEW hero, whose stored bar holds nothing at all, gets the start kit's bar
  -- (src/data/start-kit.js START_BAR, pinned by tests/hunt-core/conditions.mjs): its own Cooked
  -- Shrimp, then the store's Salted Shrimp, then Thin Turnip Juice.
  if not exists (select 1 from jsonb_array_elements(v_list) e where jsonb_typeof(e) = 'object') then
    -- ⟦starter-bar⟧
    v_def := v_def || '[{"id": "d_food", "action": {"type": "consume", "id": "cooked_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_food_store", "action": {"type": "consume", "id": "salted_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_drink", "action": {"type": "consume", "id": "thin_turnip_juice"}, "conditions": [{"metric": "self_mana_pct", "op": "lt", "value": 30}], "join": "and"}]'::jsonb;
    -- ⟦/starter-bar⟧
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- The display fields, THE SERVER'S STRUCK STATE (the browser never counts its own): an ability's
  -- mana and whether it can fire (active, of the discipline, a rune it can cast: RUNE-TRUTH below, or
  -- STORE-BY-SLOT: its slot names the rune's store row and the hero's setting lets the store supply); a food or drink's
  -- count (the open hunt's bag, else the inventory) and why it cannot fire (`why`): a crafted item
  -- with none left is `none_left`, a store item under the hero's "end the hunt" is `store_off`.
  v_on := v_eff->>'supply_source' = 'store' or v_eff->>'on_empty' = 'switch';
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      -- RUNE-TRUTH (2027-02-21-hunt-carry-in.sql): the rune is read where the engine spends it (abilities.js runeFor), a
      -- hunting hero's hunt bag and never its backpack, in town the backpack Enter packs from; any tier of the spell's
      -- family whose version the hero has unlocked. Held but above its level, the slot says so (`why` rune_level).
      v_rune := case when v_ab.rune is null then 'ready' else public.hr_hunt_rune_state(p_user, p_slot, s.id, v_ab.ability_id) end;
      -- THE RUNE LADDER (2027-03-08-rune-ladder-slots.sql): the store rune the slot names, of any tier of the family, asked only when
      -- no carried rune serves (abilities.js runeFor: own first). Named above the hero's level it casts nothing and buys nothing (`why` store_level).
      v_store := case when v_rune <> 'ready' and v_on and v_e->'action' ? 'store'
                      then public.hr_hunt_rune_store_state(p_user, p_slot, v_ab.ability_id, v_e->'action'->>'store') else 'none' end;
      v_can := coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_rune = 'ready' or v_store = 'ready');
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana, 'usable', v_can,
        'why', case when v_can is false and v_store = 'locked' then 'store_level' when v_can is false and v_rune = 'locked' then 'rune_level' end));
    elsif v_e->'action'->>'type' = 'consume'
          and exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_e->'action'->>'id') then
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', v_on, 'count', null,
        'why', case when v_on then null else 'store_off' end));
    else
      v_n := case when s.id is not null
                  then (select coalesce(sum(b.qty_left), 0) from public.hunt_bag b where b.session_id = s.id and b.item_id = v_e->'action'->>'id')
                  else (select coalesce(sum(pi.qty), 0) from public.player_inventory pi
                         where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_e->'action'->>'id') end;
      v_own := v_e->'action'->>'type' = 'consume';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', not v_own or v_n > 0, 'count', v_n,
        'why', case when v_own and v_n = 0 then 'none_left' end));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('preset', x.preset, 'name', coalesce(hp.name, x.name), 'grounds', coalesce(x.options->'grounds', '[]'::jsonb))
           order by x.preset), '[]'::jsonb) into v_presets
    from public.player_action_sets x
    left join public.player_hunt_presets hp on hp.user_id = x.user_id and hp.slot = x.slot and hp.preset = x.preset
   where x.user_id = p_user and x.slot = p_slot;
  if not exists (select 1 from jsonb_array_elements(v_presets) e where (e->>'preset')::int = v_preset) then
    v_presets := v_presets || jsonb_build_array(jsonb_build_object('preset', v_preset, 'name', coalesce((select hp.name from public.player_hunt_presets hp
      where hp.user_id = p_user and hp.slot = p_slot and hp.preset = v_preset), 'Preset ' || (v_preset + 1)), 'grounds', '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'preset', v_preset, 'presets', v_presets, 'role', v_role, 'discipline', v_disc,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'food_pct', v_eff->'food_below_pct', 'drink_pct', v_eff->'drink_below_pct',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gold_floor', v_eff->'gold_floor',
    'gather_share', v_eff->'gather_share', 'gather_inert', true,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    -- THE STORE at the server's price (the Configure action table's numbers: never a client copy).
    'store', coalesce((select jsonb_agg(jsonb_build_object('id', q.basic_id, 'kind', q.kind, 'partner', q.partner,
                                                             'heals', q.heals, 'mana', q.mana, 'price', q.price) order by q.kind, q.price, q.basic_id)
                         from public.hr_hunt_basic_supplies q), '[]'::jsonb),
    'bar', coalesce(a.slots, '[]'::jsonb), 'options', v_opt);
end $$;
revoke execute on function public.hr_hunt_settings_view(uuid, int) from public, anon, authenticated, service_role;

do $grants$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_rune_store_state(uuid, integer, text, text) from %I', v_role);
      execute format('revoke all on function public.hr_hunt_slot_check(jsonb) from %I', v_role);
      execute format('revoke all on function public.hr_hunt_settings_view(uuid, integer) from %I', v_role); end if;
  end loop;
end $grants$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ───────────────────────────────────────────────
do $$
declare
  c_u  constant uuid := '000000d7-0000-4000-a000-0000ca771001';
  v jsonb; v_k text; v_slot jsonb; v_id0 text;
  v_price bigint;
begin
  -- (a) NO CLIENT REACHES THE NEW FUNCTION OR THE RESTATED ONES.
  foreach v_k in array array['public.hr_hunt_rune_store_state(uuid,integer,text,text)', 'public.hr_hunt_slot_check(jsonb)', 'public.hr_hunt_settings_view(uuid,integer)'] loop
    if has_function_privilege('anon', v_k::regprocedure, 'execute') or has_function_privilege('authenticated', v_k::regprocedure, 'execute')
       or has_function_privilege('service_role', v_k::regprocedure, 'execute')
       or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', v_k::regprocedure, 'execute'))
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = v_k::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'rune-ladder-slots §3(a): % is client-reachable', v_k; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);

  -- (b) THE VALIDATOR: a spell takes each tier of its family; a row of another family, an unknown row, a spell with no rune and a food slot do not.
  for v_k in select q.basic_id from public.hr_hunt_basic_supplies q where q.partner like '%_fire_rune' loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'store', v_k), 'conditions', '[]'::jsonb, 'join', 'and'));
    if coalesce(v->>'ok', '') <> 'true' or v->'slot'->'action'->>'store' is distinct from v_k then
      raise exception 'rune-ladder-slots §3(b): fireball refused its family''s %: %', v_k, v; end if;
  end loop;
  if (select count(*) from public.hr_hunt_basic_supplies q where q.partner like '%_fire_rune') <> 5 then
    raise exception 'rune-ladder-slots §3(b): the Fire family holds % store runes, not 5', (select count(*) from public.hr_hunt_basic_supplies q where q.partner like '%_fire_rune'); end if;
  foreach v_k in array array['plain_scored_ice_rune', 'plain_ice_rune', 'plain_nothing_rune', 'salted_shrimp'] loop
    v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'store', v_k), 'conditions', '[]'::jsonb, 'join', 'and'));
    if v->>'error' is distinct from 'bad_store' then raise exception 'rune-ladder-slots §3(b): fireball naming % answered %', v_k, v; end if;
  end loop;
  v := public.hr_hunt_slot_check('{"action":{"type":"ability","id":"challenge","store":"plain_fire_rune"},"conditions":[],"join":"and"}'::jsonb);
  if v->>'error' is distinct from 'bad_store' then raise exception 'rune-ladder-slots §3(b): a spell with no rune naming a store row answered %', v; end if;
  v := public.hr_hunt_slot_check('{"action":{"type":"consume","id":"salted_shrimp","store":"plain_fire_rune"},"conditions":[],"join":"and"}'::jsonb);
  if v->>'error' is distinct from 'bad_store' then raise exception 'rune-ladder-slots §3(b): a food slot naming a store row answered %', v; end if;

  -- (c) A SAVED PLAIN SLOT READS AS IT DID: its rule id is the content's md5, unmoved by this file.
  v_slot := '{"action":{"type":"ability","id":"fireball","store":"plain_fire_rune"},"conditions":[],"join":"and"}'::jsonb;
  v_id0 := 'r' || substr(md5(v_slot::text), 1, 8);
  v := public.hr_hunt_slot_check(v_slot);
  if v->'slot'->>'id' is distinct from v_id0 then raise exception 'rune-ladder-slots §3(c): a Plain slot''s rule id moved: % vs %', v->'slot'->>'id', v_id0; end if;

  -- (d) THE LEVEL, THE VIEW AND THE PRICE on a real hero: Magic 1 (no skill row) casts Plain and waits on Scored; Magic 15 casts Scored, at the catalogue's price.
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'rune-ladder-slots §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'rune-ladder-slots §3-harness: hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    delete from public.player_inventory where user_id = c_u and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, 'practice_wand', 1);
    delete from public.player_equipment where user_id = c_u and slot = 0 and equip_slot in ('weapon', 'shield');
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (c_u, 0, 'weapon', 'practice_wand');
    delete from public.player_action_sets where user_id = c_u and slot = 0;
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values (c_u, 0, 0, 'Probe', jsonb_build_array(
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'store', 'plain_fire_rune'), 'conditions', '[]'::jsonb, 'join', 'and'),
        jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', 'fireball', 'store', 'plain_scored_fire_rune'), 'conditions', '[]'::jsonb, 'join', 'and')),
      '{"on_empty":"switch"}'::jsonb);
    update public.player_skills set xp = 0 where user_id = c_u and slot = 0 and skill_id = 'magic';
    if public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_fire_rune') <> 'ready'
       or public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_scored_fire_rune') <> 'locked'
       or public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_scored_ice_rune') <> 'none'
       or public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_nothing_rune') <> 'none' then
      raise exception 'rune-ladder-slots §3(d): at Magic 1 the states read %, %, %', public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_fire_rune'),
        public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_scored_fire_rune'), public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_scored_ice_rune'); end if;
    v := public.hr_hunt_settings_view(c_u, 0);
    if v->'slots'->0->>'usable' is distinct from 'true' or v->'slots'->0->>'why' is not null then
      raise exception 'rune-ladder-slots §3(d): a Plain slot at Magic 1 reads %', v->'slots'->0; end if;
    if v->'slots'->1->>'usable' is distinct from 'false' or v->'slots'->1->>'why' is distinct from 'store_level' then
      raise exception 'rune-ladder-slots §3(d): a Scored slot at Magic 1 reads %', v->'slots'->1; end if;
    insert into public.player_skills (user_id, slot, skill_id, xp) values (c_u, 0, 'magic', public.hr_skill_xp_for_level('magic', 15))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_hunt_rune_store_state(c_u, 0, 'fireball', 'plain_scored_fire_rune') <> 'ready' then
      raise exception 'rune-ladder-slots §3(d): a Scored rune at Magic 15 is not ready'; end if;
    v := public.hr_hunt_settings_view(c_u, 0);
    if v->'slots'->1->>'usable' is distinct from 'true' or v->'slots'->1->>'why' is not null then
      raise exception 'rune-ladder-slots §3(d): a Scored slot at Magic 15 reads %', v->'slots'->1; end if;
    select q.price into v_price from public.hr_hunt_basic_supplies q where q.basic_id = 'plain_scored_fire_rune';
    if (select (e->>'price')::bigint from jsonb_array_elements(v->'store') e where e->>'id' = 'plain_scored_fire_rune') is distinct from v_price then
      raise exception 'rune-ladder-slots §3(d): the view states another price than the catalogue''s %', v_price; end if;
    raise exception 'rune-ladder-slots §3-rollback';
  exception when others then
    if sqlerrm <> 'rune-ladder-slots §3-rollback' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'rune-ladder-slots §3 OK';
end $$;
