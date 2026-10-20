-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DEFAULT CONSUME ORDER: EAT BEFORE DRINK  (2026-10-28)
--
-- Tyler 2026-10-19 (tracker answers, 22:04 UTC): food and drink share ONE 2 s
-- cooldown and both ALWAYS fire when their condition matches (no wait on a
-- running over-time half; the new half replaces it). With drink-at before
-- eat-at, a hero low on both would drink every cooldown while mana stays low
-- (a tier-1 drink lands 3 mana) and never eat. The engine's defaults
-- (src/core/hunt/conditions.js DEFAULT_CONSUME) now stand eat-at first; this
-- restates hr_hunt_settings_view (body of 2026-10-25-action-conditions.sql §7,
-- byte-for-byte but for the two default slots' order) so the bar the player
-- sees is the order the engine runs. A player's own bar keeps the player's
-- order. Rule ids (d_food / d_drink) are unchanged.
--
-- No table, no row, no grant change: one function body. Reversible by
-- re-applying the §7 body of 2026-10-25-action-conditions.sql.
-- Apply after 2026-10-27-core-bodies.sql (any order against
-- 2026-10-28-hunt-sessions-catalogue.generated.sql). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE `hunt_settings` SECTION: the running preset's effective settings and
-- its BAR (stored slots, then each empty lane's defaults where the engine places
-- them: the role's hr_hunt_role_rules, then eat at food_pct and drink at drink_pct).
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
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  v_preset := coalesce(s.preset, 0);
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
  select r.discipline into v_disc from public.hr_hunt_roles r where r.role = v_role;
  -- THE BAR: the stored slots (an invalid row reads as an empty tablet), then the defaults.
  for v_e in select value from jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) loop
    v_d := public.hr_hunt_slot_check(v_e);
    v_list := v_list || jsonb_build_array(case when (v_d->>'ok')::boolean then v_d->'slot' else 'null'::jsonb end);
  end loop;
  v_def := '[]'::jsonb;
  if not exists (select 1 from jsonb_array_elements(v_list) e join public.hr_hunt_abilities ab on ab.ability_id = e->'action'->>'id'
                  where e->'action'->>'type' = 'ability' and v_disc = any (ab.disciplines)) then
    select coalesce(jsonb_agg(r.slot order by r.ord), '[]'::jsonb) into v_def from public.hr_hunt_role_rules r where r.role = v_role;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_list) e where e->'action'->>'type' = 'consume') then
    -- EAT-AT BEFORE DRINK-AT (2026-10-28): food and drink always fire under ONE 2 s
    -- cooldown, so a drink first would take every cooldown while mana stays low.
    v_def := v_def || jsonb_build_array(
      jsonb_build_object('id', 'd_food', 'action', jsonb_build_object('type', 'consume', 'id', 'food'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', v_eff->'food_below_pct'))),
      jsonb_build_object('id', 'd_drink', 'action', jsonb_build_object('type', 'consume', 'id', 'drink'), 'join', 'and',
        'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_mana_pct', 'op', 'lt', 'value', v_eff->'drink_below_pct'))));
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- The display fields: an ability's mana and whether it can fire (active, of the discipline,
  -- its rune held); an item's count in the inventory.
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana,
        'usable', coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_ab.rune is null or exists (
          select 1 from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_ab.rune and pi.qty > 0))));
    else
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('usable', true,
        'count', (select coalesce(sum(pi.qty), 0) from public.player_inventory pi
                   where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_e->'action'->>'id')));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('preset', x.preset, 'name', x.name, 'grounds', coalesce(x.options->'grounds', '[]'::jsonb))
           order by x.preset), '[]'::jsonb) into v_presets
    from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot;
  if not exists (select 1 from jsonb_array_elements(v_presets) e where (e->>'preset')::int = v_preset) then
    v_presets := v_presets || jsonb_build_array(jsonb_build_object('preset', v_preset, 'name', 'Preset ' || (v_preset + 1), 'grounds', '[]'::jsonb));
  end if;
  return jsonb_build_object(
    'preset', v_preset, 'presets', v_presets, 'role', v_role,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'food_pct', v_eff->'food_below_pct', 'drink_pct', v_eff->'drink_below_pct',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gold_floor', v_eff->'gold_floor',
    'density', v_eff->'density', 'gather_share', v_eff->'gather_share', 'gather_inert', true,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    'bar', coalesce(a.slots, '[]'::jsonb), 'options', v_opt);
end $$;
revoke execute on function public.hr_hunt_settings_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.hr_hunt_settings_view(uuid,int)'::regprocedure);
  v_food int; v_drink int;
begin
  -- (a) eat-at stands before drink-at in the defaults.
  v_food := position('''d_food''' in v_def);
  v_drink := position('''d_drink''' in v_def);
  if v_food = 0 or v_drink = 0 or v_food > v_drink then
    raise exception 'VERIFY(a): hr_hunt_settings_view does not place d_food before d_drink (% / %)', v_food, v_drink; end if;
  -- (b) still server-only: no client or service role may call it.
  if has_function_privilege('anon', 'public.hr_hunt_settings_view(uuid,int)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_settings_view(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_settings_view(uuid,int)', 'execute') then
    raise exception 'VERIFY(b): hr_hunt_settings_view is executable by a client role'; end if;
  -- (c) still SECURITY DEFINER with a pinned search_path.
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_hunt_settings_view(uuid,int)'::regprocedure
                  and p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%') then
    raise exception 'VERIFY(c): hr_hunt_settings_view lost SECURITY DEFINER or its search_path'; end if;
end $$;
