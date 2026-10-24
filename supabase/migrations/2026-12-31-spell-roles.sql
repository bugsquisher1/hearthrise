-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SHIELD MAKES THE TANK; ROLES READ FROM DATA (lane
-- b-spell-roles, systems-engineer, 2026-10-23). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §4; the role key and the settings view
-- are part of the reopen Security review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-23 (SHIELDS; roadmap p15, audit c02/c03): the SHIELD makes the
-- tank (a one-hand melee weapon and a shield), a sword ALONE plays Melee damage,
-- a crossbow and a shield play a Ranger with guard (never a tank), a bow fills
-- both hands; the club is its own discipline and the discipline lists live in
-- data only. The server keyed the role on the weapon item alone
-- (hr_hunt_weapon_of: a sword was the tank with or without a shield) and the bar's
-- abilities on the ROLE (hr_hunt_roles: one discipline a role, so a club shared
-- the axes' Rend).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_weapon_of        RESTATED: the worn weapon's key, turned into its
--                            SHIELD ARM key (hr_hunt_weapon_roles.with_shield,
--                            hunt-roles.js SHIELD_ARM) when the shield slot holds a
--                            shield (hr_hunt_shields). Every role reader (the role
--                            section, the party seat, the finder, the town walker,
--                            chat and inspect) reads it, so all follow at once.
--   hr_hunt_settings_view    RESTATED WHOLE from 2026-11-17-hunt-density-home.sql
--                            (§0 pins its live md5): the discipline is the role
--                            key's (hr_hunt_weapon_roles.discipline), the role's
--                            default slots are kept to it, and `discipline` is
--                            projected (the Configure window locks by it).
--   hr_hunt_role_rules       ⟦role-rules⟧ full replace from src/data/rule-subjects.js
--                            ROLE_RULES (pinned by tests/hunt-core/conditions.mjs
--                            sql-rows): the Melee damage set gains Flame Strike, so
--                            a sword alone casts its blade's strikes.
-- hr_hunt_roles is no longer read (the catalogue writes it empty: applied history
-- names it). No grant, signature or player row moves.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None to value. The role key decides which abilities a bar may hold and the
-- party seat's role; every ability is still priced and re-proved by the settle.
-- A shield is a catalogue fact (hr_hunt_shields, generated); a client sends no key.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After 2026-12-30-hunt-sessions-catalogue.generated.sql (hr_hunt_shields and the
-- discipline / with_shield columns; §0 refuses without them), applied RIGHT AFTER
-- it: between the two the old settings view finds no role discipline. Then deploy
-- the hr-accrue edge of this lane (it keys the hero on the worn set too).
-- REVERSIBILITY: re-apply hr_hunt_weapon_of from 2026-10-23-hunt-party.sql,
-- hr_hunt_settings_view from 2026-11-17-hunt-density-home.sql and the role rules
-- from 2026-12-30-spell-content.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_def text; v_src text;
begin
  if to_regclass('public.hr_hunt_shields') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_hunt_weapon_roles' and column_name = 'with_shield')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_hunt_weapon_roles' and column_name = 'discipline')
     or exists (select 1 from public.hr_hunt_weapon_roles where discipline is null)
     or not exists (select 1 from public.hr_hunt_weapon_roles where with_shield is not null) then
    raise exception 'PRECONDITION: apply 2026-12-30-hunt-sessions-catalogue.generated.sql first (hr_hunt_shields, the role keys'' disciplines and shield arms)'; end if;
  -- hr_hunt_settings_view: the live image (tests/live-hash-drift.baseline.json, measured 2026-10-23), or this file's own.
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_settings_view(uuid,integer)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_settings_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '0a75868795c3cb662ce2eaa5d17529fa' and strpos(v_src, 'SPELL-ROLES') = 0 then
    raise exception 'PIN: hr_hunt_settings_view is neither the density-home image (0a758687...) nor this file''s (md5 %)', v_def; end if;
  -- hr_hunt_weapon_of: the hunt-party image (the weapon alone) or this file's (the shield arm).
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_weapon_of(uuid,integer)'::regprocedure;
  if strpos(v_src, 'SPELL-ROLES') = 0 and strpos(v_src, 'pe.equip_slot = ''weapon''), ''neutral'')') = 0 then
    raise exception 'PIN: hr_hunt_weapon_of is neither the hunt-party image nor this file''s'; end if;
end $mig$;

-- ── §1 THE ROLE KEY OF THE WORN SET ──────────────────────────────────────────
create or replace function public.hr_hunt_weapon_of(p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  -- SPELL-ROLES (2026-12-31-spell-roles.sql): the weapon's key (hr_hunt_weapons; unarmed = neutral), turned into its
  -- shield arm (hr_hunt_weapon_roles.with_shield) when the shield slot holds a shield (hr_hunt_shields).
  with k as (
    select coalesce((select w.weapon_type from public.player_equipment pe
                       join public.hr_hunt_weapons w on w.item_id = pe.item_id
                      where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon'), 'neutral') as t)
  select coalesce((select r.with_shield from k
                     join public.hr_hunt_weapon_roles r on r.weapon_type = k.t and r.with_shield is not null
                     join public.player_equipment pe on pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'shield'
                     join public.hr_hunt_shields s on s.item_id = pe.item_id), (select k.t from k))
$$;
revoke execute on function public.hr_hunt_weapon_of(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 THE SETTINGS VIEW: THE ROLE KEY'S DISCIPLINE ──────────────────────────
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
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  -- SPELL-ROLES (2026-12-31-spell-roles.sql): the abilities the bar may hold are the worn set's ROLE KEY's discipline
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
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(v_opt->v_o.opt, v_unit->v_o.opt, v_o.dflt);
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
  -- mana and whether it can fire (active, of the discipline, its rune held, or STORE-BY-SLOT: its slot
  -- names the rune's store row and the hero's setting lets the store supply); a food or drink's
  -- count (the open hunt's bag, else the inventory) and why it cannot fire (`why`): a crafted item
  -- with none left is `none_left`, a store item under the hero's "end the hunt" is `store_off`.
  v_on := v_eff->>'supply_source' = 'store' or v_eff->>'on_empty' = 'switch';
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana,
        'usable', coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_ab.rune is null or exists (
          select 1 from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_ab.rune and pi.qty > 0)
          or (v_on and exists (
          select 1 from public.hr_hunt_basic_supplies q where q.basic_id = v_e->'action'->>'store' and q.partner = v_ab.rune)))));
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

-- ── §3 THE ROLE DEFAULT SLOTS ────────────────────────────────────────────────
delete from public.hr_hunt_role_rules;
insert into public.hr_hunt_role_rules (role, ord, slot) values
-- ⟦role-rules⟧
  ('healer', 0, '{"id":"d_greater_mend","action":{"type":"ability","id":"greater_mend","store":"plain_water_rune"},"conditions":[{"metric":"ally_hp_pct","op":"lt","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('healer', 1, '{"id":"d_circle_of_renewal","action":{"type":"ability","id":"circle_of_renewal"},"conditions":[{"metric":"allies_below","op":"gte","value":2,"subject":"under_80"}],"join":"and"}'::jsonb),
  ('healer', 2, '{"id":"d_green_sickness","action":{"type":"ability","id":"green_sickness"},"conditions":[{"metric":"ally_hp_pct","op":"gte","value":70,"subject":"lowest"}],"join":"and"}'::jsonb),
  ('mage', 0, '{"id":"d_fireball","action":{"type":"ability","id":"fireball","store":"plain_fire_rune"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('mage', 1, '{"id":"d_frost_lance","action":{"type":"ability","id":"frost_lance"},"conditions":[{"metric":"self_mana_pct","op":"gte","value":50}],"join":"and"}'::jsonb),
  ('mage', 2, '{"id":"d_arcane_barrier","action":{"type":"ability","id":"arcane_barrier"},"conditions":[{"metric":"self_hp_pct","op":"lt","value":85}],"join":"and"}'::jsonb),
  ('melee_dps', 0, '{"id":"d_flame_strike","action":{"type":"ability","id":"flame_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 1, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 2, '{"id":"d_cleave","action":{"type":"ability","id":"cleave"},"conditions":[],"join":"and"}'::jsonb),
  ('melee_dps', 3, '{"id":"d_rend","action":{"type":"ability","id":"rend"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 0, '{"id":"d_hunters_mark","action":{"type":"ability","id":"hunters_mark"},"conditions":[],"join":"and"}'::jsonb),
  ('ranger', 1, '{"id":"d_flame_volley","action":{"type":"ability","id":"flame_volley"},"conditions":[{"metric":"enemies_in_aoe","op":"gte","value":2}],"join":"and"}'::jsonb),
  ('ranger', 2, '{"id":"d_precision_shot","action":{"type":"ability","id":"precision_shot"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 0, '{"id":"d_challenge","action":{"type":"ability","id":"challenge"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 1, '{"id":"d_flame_strike","action":{"type":"ability","id":"flame_strike"},"conditions":[],"join":"and"}'::jsonb),
  ('tank', 2, '{"id":"d_power_strike","action":{"type":"ability","id":"power_strike"},"conditions":[],"join":"and"}'::jsonb)
-- ⟦/role-rules⟧
;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000005e1b01';
  v_s jsonb; v_ids text;
  v_sword text; v_shield text; v_xbow text; v_bow text; v_wand text; v_book text; v_club text;
begin
  -- the catalogue's facts this file reads
  select min(item_id) into v_sword from public.hr_hunt_weapons where weapon_type = 'sword';
  select min(item_id) into v_shield from public.hr_hunt_shields;
  select min(item_id) into v_club from public.hr_hunt_weapons where weapon_type = 'hammer';
  select min(w.item_id) into v_xbow from public.hr_hunt_weapons w join public.hr_items i on i.item_id = w.item_id
   where w.weapon_type = 'ranged' and not i.two_handed;
  select min(w.item_id) into v_bow from public.hr_hunt_weapons w join public.hr_items i on i.item_id = w.item_id
   where w.weapon_type = 'ranged' and i.two_handed;
  select min(item_id) into v_wand from public.hr_hunt_weapons where weapon_type = 'wand';
  select min(i.item_id) into v_book from public.hr_items i join public.hr_item_slots s on s.item_id = i.item_id and s.equip_slot = 'shield'
   where i.kind = 'offhand' and not exists (select 1 from public.hr_hunt_shields x where x.item_id = i.item_id);
  if v_sword is null or v_shield is null or v_club is null or v_xbow is null or v_bow is null or v_wand is null or v_book is null then
    raise exception 'spell-roles §4: the catalogue lacks a sword, shield, club, crossbow, bow, wand or spellbook (% % % % % % %)', v_sword, v_shield, v_club, v_xbow, v_bow, v_wand, v_book; end if;
  if (select with_shield from public.hr_hunt_weapon_roles where weapon_type = 'sword') is distinct from 'shield'
     or (select with_shield from public.hr_hunt_weapon_roles where weapon_type = 'ranged') is not null
     or (select roles[1] from public.hr_hunt_weapon_roles where weapon_type = 'sword') is distinct from 'melee_dps'
     or (select discipline from public.hr_hunt_weapon_roles where weapon_type = 'hammer')
        is not distinct from (select discipline from public.hr_hunt_weapon_roles where weapon_type = 'axe') then
    raise exception 'spell-roles §4: the role keys are not the data''s (a sword alone a tank, a crossbow arm, or the club on the axes'' list)'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'spell-roles §4 probe') on conflict (user_id) do nothing;
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'spell-roles §4: the probe hero was not made'; end if;
    delete from public.player_equipment where user_id = v_u and slot = 0;
    -- (a) a SWORD ALONE plays Melee damage: no Challenge, the blade's own strikes, no axe or club ability
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'weapon', v_sword);
    v_s := public.hr_hunt_settings_view(v_u, 0);
    select string_agg(e->'action'->>'id', ',' order by n) into v_ids from jsonb_array_elements(v_s->'slots') with ordinality x(e, n)
     where e->'action'->>'type' = 'ability';
    if public.hr_hunt_weapon_of(v_u, 0) <> 'sword' or v_s->>'role' <> 'melee_dps' or v_s->>'discipline' <> 'sword'
       or v_ids is distinct from 'flame_strike,power_strike' then
      raise exception 'spell-roles §4(a): a sword alone reads key %, role %, discipline %, bar %', public.hr_hunt_weapon_of(v_u, 0), v_s->>'role', v_s->>'discipline', v_ids; end if;
    -- (b) THE SHIELD MAKES THE TANK: the same sword with a shield beside it
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'shield', v_shield);
    v_s := public.hr_hunt_settings_view(v_u, 0);
    select string_agg(e->'action'->>'id', ',' order by n) into v_ids from jsonb_array_elements(v_s->'slots') with ordinality x(e, n)
     where e->'action'->>'type' = 'ability';
    if public.hr_hunt_weapon_of(v_u, 0) <> 'shield' or v_s->>'role' <> 'tank' or v_s->>'discipline' <> 'shield'
       or v_ids is distinct from 'challenge,flame_strike,power_strike' or public.hr_role_view(v_u, 0)->>'id' <> 'tank' then
      raise exception 'spell-roles §4(b): sword and shield read key %, role %, bar %', public.hr_hunt_weapon_of(v_u, 0), v_s->>'role', v_ids; end if;
    -- (c) a CROSSBOW and a shield: a Ranger (with guard), never a tank
    update public.player_equipment set item_id = v_xbow where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    if public.hr_hunt_weapon_of(v_u, 0) <> 'ranged' or public.hr_hunt_settings_view(v_u, 0)->>'role' <> 'ranger' then
      raise exception 'spell-roles §4(c): a crossbow and a shield read %', public.hr_hunt_weapon_of(v_u, 0); end if;
    -- (d) a SPELLBOOK is no shield: a sword beside one is still Melee damage; a wand beside one the Mage
    update public.player_equipment set item_id = v_book where user_id = v_u and slot = 0 and equip_slot = 'shield';
    update public.player_equipment set item_id = v_sword where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    if public.hr_hunt_weapon_of(v_u, 0) <> 'sword' then raise exception 'spell-roles §4(d): a spellbook made a shield arm'; end if;
    update public.player_equipment set item_id = v_wand where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    if public.hr_hunt_weapon_of(v_u, 0) <> 'wand' or public.hr_hunt_settings_view(v_u, 0)->>'discipline' <> 'destruction' then
      raise exception 'spell-roles §4(d): a wand and a spellbook read %', public.hr_hunt_weapon_of(v_u, 0); end if;
    -- (e) the CLUB is its own discipline: its default bar holds the sweep, never the axes' bleed
    delete from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'shield';
    update public.player_equipment set item_id = v_club where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    v_s := public.hr_hunt_settings_view(v_u, 0);
    select string_agg(e->'action'->>'id', ',' order by n) into v_ids from jsonb_array_elements(v_s->'slots') with ordinality x(e, n)
     where e->'action'->>'type' = 'ability';
    if v_s->>'discipline' <> 'club' or v_ids is distinct from 'power_strike,cleave' then
      raise exception 'spell-roles §4(e): a club reads discipline %, bar %', v_s->>'discipline', v_ids; end if;
    -- (f) A BOW FILLS BOTH HANDS (the two_handed refusal keeps a shield off it)
    if not (select two_handed from public.hr_items where item_id = v_bow) then raise exception 'spell-roles §4(f): a bow is one-handed'; end if;
    raise exception using errcode = 'HR876', message = 'spell-roles §4 complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_equipment where user_id = v_u) then
    raise exception 'spell-roles §4: a probe row leaked'; end if;
  -- every role default slot still passes the slot validator
  if exists (select 1 from public.hr_hunt_role_rules r where coalesce(public.hr_hunt_slot_check(r.slot)->>'ok', '') <> 'true') then
    raise exception 'spell-roles §4: a role default slot is refused by hr_hunt_slot_check'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'spell-roles: the shield makes the tank, a sword alone hits, the club is its own discipline; all green';
end $chk$;
