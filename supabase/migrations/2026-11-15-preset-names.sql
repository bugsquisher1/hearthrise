-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — ONE SETUP = ITS OWN BAR + ITS GEAR; RENAME, DELETE, SWITCH (lane
-- b-presets-c4, systems-engineer + game designer, 2026-10-22; ruling C4, Tyler
-- 2026-10-18: "action sets (presets) need real save/name/rename/delete/switch UI").
-- STAGED, NOT APPLIED. Game CLOSED: applies on its passing §4; part of the
-- reopen Security review.
--
-- ── THE MODEL (designer ruling 2026-10-22, CONFLICTS.md "presets are two things") ──
-- A SETUP is one named loadout: its own action bar (slots, conditions, target,
-- stance, chase, distance, gold rule) and the gear it wears. Setup N OWNS action
-- set N (same number, same name), at most hr_hunt_limit('presets') = 5 per hero
-- (player_action_sets' own 0..4). The hero is always ON one setup
-- (player_hunt_active); the bar shows it in town and in a hunt, and an edit to
-- the bar is an edit to that setup (remembered, nothing to re-save).
--   hr_hunt_preset_save(slot, N, name, idem)  RESTATED: what the hero has on now
--     becomes setup N and the hero is on N: the worn gear and restock targets are
--     snapshotted; the CURRENT bar is copied into set N when N is not already
--     the current one (its `grounds` claim is not copied); refused while a hunt
--     is open (hunt_open), as Use already is: setups change in town.
--   hr_hunt_preset_apply  UNCHANGED (wears the gear, switches player_hunt_active).
--   hr_hunt_settings_view RESTATED (2026-10-28-consume-defaults.sql body, two
--     lines): out of a hunt it reads the CURRENT set (hr_hunt_active_set), not
--     set 0; a set's name is its setup's name when it has one.
--   hr_hunt_preset_rename(slot, N, name, idem)  renames setup N and set N.
--   hr_hunt_preset_delete(slot, N, idem)  removes setup N and its bar (set N).
--     The setup the hero is on is refused (setup_in_use: switch first), and so
--     is the set an open hunt runs on (hunt_open). None left is valid.
--   hr_action_set_rename(slot, N, name, idem)  the bar plaque: renames set N
--     (a set with no row gets one that reads as no row) and setup N if it exists.
-- THE NAME RULE is the server's, in ONE place (hr_setup_name): whitespace runs
-- collapse, 1 to 24 characters, no control characters, nothing hr_name_blocked
-- refuses (the hero-name moderation list). Refused: `bad_preset_name`.
-- A setup or set name is only ever read by its owner (hr_hunt_presets_view and
-- hr_hunt_settings_view are owner sections; no party or social view reads it).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Moves no value: no gold, item, XP or count changes (the copy moves
-- configuration rows between the caller's own sets). Rate bucket `hunt`
-- (hr_rpc_gate), idempotency key per verb and preset (player_intents), the
-- character lock (hr_hunt_lock). RLS unchanged (owner read, no client write).
--
-- REVERSIBILITY: drop the four new functions and the three baseline rows;
-- re-apply hr_hunt_preset_save from 2026-10-25-hunt-presets.sql §3 and
-- hr_hunt_settings_view from 2026-10-28-consume-defaults.sql §1.
-- ORDER: after 2026-11-10-hunt-xp-split.sql (no object in common). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS (the live shapes this file reads) ────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_hunt_presets') is null or to_regclass('public.player_action_sets') is null
     or to_regclass('public.player_hunt_active') is null then
    raise exception 'PIN: player_hunt_presets / player_action_sets / player_hunt_active are missing'; end if;
  if to_regprocedure('public.hr_name_blocked(text)') is null or to_regprocedure('public.hr_hunt_presets_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_settings_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_preset_save(integer,integer,text,uuid)') is null then
    raise exception 'PIN: hr_name_blocked / hr_hunt_presets_view / hr_hunt_lock / hr_hunt_limit / hr_intent_replay / hr_hunt_active_set / hr_hunt_settings_view / hr_hunt_preset_save are missing'; end if;
  -- A setup owns the set of its own number: the two ranges must agree.
  if public.hr_hunt_limit('presets') <> 5 then raise exception 'PIN: hr_hunt_limit(presets) is %, the sets table holds 0..4', public.hr_hunt_limit('presets'); end if;
end $mig$;

-- ── §1 THE NAME RULE (internal) ──────────────────────────────────────────────
create or replace function public.hr_setup_name(p_name text)
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  -- PRESET-NAMES (2026-11-15-preset-names.sql): null = refused.
  if char_length(v) not between 1 and 24 or v ~ '[[:cntrl:]]' or public.hr_name_blocked(v) then return null; end if;
  return v;
end $$;
revoke execute on function public.hr_setup_name(text) from public, anon, authenticated, service_role;

-- ── §2 THE BAR IS THE CURRENT SETUP'S (hr_hunt_settings_view, restated) ──────
-- 2026-10-28-consume-defaults.sql §1 byte-for-byte but for v_preset (the current
-- set out of a hunt) and the set names (the setup's name when it has one).
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

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
-- SAVE (restated from 2026-10-25-hunt-presets.sql §3): what the hero has on now becomes setup N.
create or replace function public.hr_hunt_preset_save(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text; v_from int;
  v_s public.hunt_sessions%rowtype; v_set public.player_action_sets%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- A setup owns the set of its number, so setups and sets share one range.
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'hunt_preset_save:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_save', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- Setups change in town (as Use does): a hunt runs on the set it entered with.
  if v_s.id is not null then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  -- THE BAR: set N becomes the current bar (a copy when the hero is on another set; its grounds claim stays behind).
  v_from := public.hr_hunt_active_set(v_uid, p_slot);
  if v_from <> p_preset then
    select * into v_set from public.player_action_sets x where x.user_id = v_uid and x.slot = p_slot and x.preset = v_from;
    insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
      values (v_uid, p_slot, p_preset, v_name, coalesce(v_set.slots, '[]'::jsonb), coalesce(v_set.options, '{}'::jsonb) - 'grounds', now())
      on conflict (user_id, slot, preset) do update set name = excluded.name, slots = excluded.slots, options = excluded.options, updated_at = now();
  else
    insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
      values (v_uid, p_slot, p_preset, v_name, '[]'::jsonb, '{}'::jsonb, now())
      on conflict (user_id, slot, preset) do update set name = excluded.name, updated_at = now();
  end if;
  insert into public.player_hunt_presets as p (user_id, slot, preset, name, action_set, gear, restock, updated_at)
  values (v_uid, p_slot, p_preset, v_name, p_preset,
          coalesce((select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e
                     where e.user_id = v_uid and e.slot = p_slot), '{}'::jsonb),
          coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                     where r.user_id = v_uid and r.slot = p_slot and r.restock > 0), '{}'::jsonb),
          now())
  on conflict (user_id, slot, preset) do update
    set name = excluded.name, action_set = excluded.action_set, gear = excluded.gear, restock = excluded.restock, updated_at = now();
  insert into public.player_hunt_active as h (user_id, slot, action_set, updated_at) values (v_uid, p_slot, p_preset, now())
    on conflict (user_id, slot) do update set action_set = excluded.action_set, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_preset_rename(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'hunt_preset_rename:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_rename', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  update public.player_hunt_presets set name = v_name, updated_at = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  if not found then
    return public.hr_note_rejection('hunt_preset_rename', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  -- One name: the setup's bar carries it too.
  update public.player_action_sets set name = v_name, updated_at = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  v_r := jsonb_build_object('ok', true, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_preset_delete(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_s public.hunt_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_verb := 'hunt_preset_delete:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_delete', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_hunt_presets where user_id = v_uid and slot = p_slot and preset = p_preset) then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  -- The bar the hero is on never vanishes under it: switch to another setup first.
  if p_preset = public.hr_hunt_active_set(v_uid, p_slot) then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'setup_in_use')); end if;
  if v_s.id is not null and v_s.preset = p_preset then
    return public.hr_note_rejection('hunt_preset_delete', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  delete from public.player_hunt_presets where user_id = v_uid and slot = p_slot and preset = p_preset;
  -- The setup's bar goes with it.
  delete from public.player_action_sets where user_id = v_uid and slot = p_slot and preset = p_preset;
  v_r := jsonb_build_object('ok', true, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_action_set_rename(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := public.hr_setup_name(p_name);
  if v_name is null then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset_name')); end if;
  v_verb := 'action_set_rename:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('action_set_rename', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('action_set_rename', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- A name only: the bar, its options and a running hunt's presses are untouched.
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, v_name, '[]'::jsonb, '{}'::jsonb, now())
    on conflict (user_id, slot, preset) do update set name = excluded.name, updated_at = now();
  -- One name: the setup that owns this bar carries it too.
  update public.player_hunt_presets set name = v_name, updated_at = now()
   where user_id = v_uid and slot = p_slot and preset = p_preset;
  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'name', v_name);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

revoke execute on function public.hr_hunt_preset_save(int, int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_hunt_preset_rename(int, int, text, uuid) from public, anon, service_role;
revoke execute on function public.hr_hunt_preset_delete(int, int, uuid) from public, anon, service_role;
revoke execute on function public.hr_action_set_rename(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_hunt_preset_save(int, int, text, uuid) to authenticated;
grant  execute on function public.hr_hunt_preset_rename(int, int, text, uuid) to authenticated;
grant  execute on function public.hr_hunt_preset_delete(int, int, uuid) to authenticated;
grant  execute on function public.hr_action_set_rename(int, int, text, uuid) to authenticated;

-- ── §4 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_hunt_preset_save', 'hr_hunt_preset_rename', 'hr_hunt_preset_delete', 'hr_action_set_rename');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_preset_save', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2), restated 2026-11-15: what the hero has on (worn gear, restock targets, the current bar copied into set N) becomes setup N and the hero is on it; town only; the snapshot is the server''s'),
  ('hr_hunt_preset_rename', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-11-15: renames one of the caller''s own setups and its bar; the name rule is the server''s (hr_setup_name); moves no value'),
  ('hr_hunt_preset_delete', 'p_slot integer, p_preset integer, p_idem uuid', 'authenticated',
   'added 2026-11-15: removes one of the caller''s own setups and its bar; never the one the hero is on; moves no value'),
  ('hr_action_set_rename', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-11-15: names one of the caller''s own action sets (the bar''s plaque) and the setup that owns it; the bar and options untouched; moves no value');

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00000c4a0001', '000000c0-0000-0000-0000-00000c4a0002']::uuid[];
  v_hunt text := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
  v_inst constant uuid := '000000c0-0000-4000-a000-00000c4a01ff';
  v jsonb; v_i int; v_bar jsonb; v_t text;
  set_of constant text := 'select a.options->>''target_mode'' from public.player_action_sets a where a.user_id = $1 and a.slot = 0 and a.preset = $2';
begin
  begin
    for v_i in 1 .. 2 loop
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'preset-names §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(a): probe character % was not made', v_i; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
    end loop;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    -- (a) THE FIRST SETUP NAMES THE BAR THE HERO HAS: a fresh hero is on set 0; saving setup 0 keeps its bar and names it.
    if (public.hr_state_of(v_u[1], 0)->'hunt_settings'->>'preset')::int is distinct from 0 then raise exception 'VERIFY(a): a fresh hero is not on set 0'; end if;
    v := public.hr_action_set_options(0, 0, '{"target_mode":"weakest"}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the bar edit answered %', v; end if;
    v := public.hr_hunt_preset_save(0, 0, 'Cellar', '000000c0-0000-4000-a000-00000c4a0101');
    v_t := public.hr_state_of(v_u[1], 0)->'hunt_settings'->>'target_mode';
    if coalesce(v->>'ok', '') <> 'true' or v_t is distinct from 'weakest'
       or public.hr_state_of(v_u[1], 0)->'hunt_settings'->'presets'->0->>'name' is distinct from 'Cellar' then
      raise exception 'VERIFY(a): the first save answered % (target %)', v, v_t; end if;
    -- (b) A NEW SETUP COPIES THE CURRENT BAR AND THE HERO IS ON IT: out of a hunt the bar shows set 2 (the C4 gap).
    v := public.hr_hunt_preset_save(0, 2, 'Mill', '000000c0-0000-4000-a000-00000c4a0102');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'hunt_presets') <> 2 or (v->'hunt_presets'->1->>'action_set')::int <> 2 then
      raise exception 'VERIFY(b): the second save answered %', v; end if;
    v := public.hr_state_of(v_u[1], 0)->'hunt_settings';
    if (v->>'preset')::int is distinct from 2 or v->>'target_mode' is distinct from 'weakest' then
      raise exception 'VERIFY(b): after saving setup 2 the bar reads set % (target %)', v->>'preset', v->>'target_mode'; end if;
    if public.hr_hunt_active_set(v_u[1], 0) <> 2 then raise exception 'VERIFY(b): the hero is not on setup 2'; end if;
    -- (c) THE BAR EDITS THE CURRENT SETUP ONLY; Use switches back to the other bar.
    v := public.hr_action_set_options(0, 2, '{"target_mode":"nearest"}'::jsonb, gen_random_uuid());
    execute set_of into v_t using v_u[1], 0;
    if coalesce(v->>'ok', '') <> 'true' or v_t is distinct from 'weakest' then raise exception 'VERIFY(c): editing setup 2''s bar moved setup 0 (%)', v_t; end if;
    v := public.hr_hunt_preset_apply(0, 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): Use answered %', v; end if;
    v := public.hr_state_of(v_u[1], 0)->'hunt_settings';
    if (v->>'preset')::int is distinct from 0 or v->>'target_mode' is distinct from 'weakest' then
      raise exception 'VERIFY(c): after Use the bar reads set % (target %)', v->>'preset', v->>'target_mode'; end if;
    execute set_of into v_t using v_u[1], 2;
    if v_t is distinct from 'nearest' then raise exception 'VERIFY(c): setup 2 lost its own bar (%)', v_t; end if;
    -- (d) ONE NAME: a setup rename names its bar; the plaque's rename names its setup; the bar never moves.
    v := public.hr_hunt_preset_rename(0, 2, '  Rat   cellar ', '000000c0-0000-4000-a000-00000c4a0103');
    if coalesce(v->>'ok', '') <> 'true' or v->'hunt_presets'->1->>'name' is distinct from 'Rat cellar'
       or (select name from public.player_action_sets where user_id = v_u[1] and slot = 0 and preset = 2) is distinct from 'Rat cellar' then
      raise exception 'VERIFY(d): rename answered %', v; end if;
    if public.hr_state_of(v_u[1], 0)->'hunt_presets'->1->>'name' is distinct from 'Rat cellar' then
      raise exception 'VERIFY(d): the re-read envelope does not carry the rename'; end if;
    v_bar := public.hr_state_of(v_u[1], 0)->'hunt_settings'->'slots';
    v := public.hr_action_set_rename(0, 0, 'Tank  bar', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->>'name' is distinct from 'Tank bar' then raise exception 'VERIFY(d): set rename answered %', v; end if;
    v := public.hr_state_of(v_u[1], 0);
    if v->'hunt_settings'->'presets'->0->>'name' is distinct from 'Tank bar' or v->'hunt_presets'->0->>'name' is distinct from 'Tank bar'
       or v->'hunt_settings'->'slots' is distinct from v_bar then
      raise exception 'VERIFY(d): the plaque rename reads % / % / bar moved', v->'hunt_settings'->'presets', v->'hunt_presets'; end if;
    -- (e) THE NAME RULE: empty, too long, a control character and a blocked word are refused; nothing changes.
    foreach v_t in array array['', repeat('a', 25), 'Rat' || chr(7), 'Sh1thead']::text[] loop
      v := public.hr_hunt_preset_rename(0, 2, v_t, gen_random_uuid());
      if v->>'error' is distinct from 'bad_preset_name' then raise exception 'VERIFY(e): name % answered %', quote_literal(v_t), v; end if;
    end loop;
    if public.hr_hunt_preset_save(0, 1, '', gen_random_uuid())->>'error' is distinct from 'bad_preset_name'
       or public.hr_action_set_rename(0, 0, '', gen_random_uuid())->>'error' is distinct from 'bad_preset_name' then
      raise exception 'VERIFY(e): an empty save or plaque name was taken'; end if;
    if (select name from public.player_hunt_presets where user_id = v_u[1] and slot = 0 and preset = 2) <> 'Rat cellar' then
      raise exception 'VERIFY(e): a refused name changed the row'; end if;
    -- (f) OUT OF RANGE / UNKNOWN: a sixth setup has no bar to own; a setup that does not exist is refused.
    if public.hr_hunt_preset_save(0, public.hr_hunt_limit('presets'), 'Sixth', gen_random_uuid())->>'error' is distinct from 'bad_preset'
       or public.hr_hunt_preset_rename(0, 4, 'Ghost', gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 4, gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 8, gen_random_uuid())->>'error' is distinct from 'bad_preset'
       or public.hr_action_set_rename(0, public.hr_hunt_limit('presets'), 'X', gen_random_uuid())->>'error' is distinct from 'bad_preset' then
      raise exception 'VERIFY(f): an unknown / out-of-range setup was taken'; end if;
    -- (g) A FOREIGN USER: the second account names the same slot and presets; the first account's rows never move.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    if public.hr_hunt_preset_rename(0, 2, 'Mine now', gen_random_uuid())->>'error' is distinct from 'unknown_preset'
       or public.hr_hunt_preset_delete(0, 2, gen_random_uuid())->>'error' is distinct from 'unknown_preset' then
      raise exception 'VERIFY(g): another account reached a setup it does not own'; end if;
    if (select count(*) from public.player_hunt_presets where user_id = v_u[1]) <> 2
       or (select count(*) from public.player_action_sets where user_id = v_u[1] and name = 'Rat cellar') <> 1 then
      raise exception 'VERIFY(g): another account''s call changed the first account''s setups'; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    -- (h) DELETE: never the setup the hero is on; another one goes WITH its bar; the same key replays the same answer.
    if public.hr_hunt_preset_delete(0, 0, gen_random_uuid())->>'error' is distinct from 'setup_in_use'
       or not exists (select 1 from public.player_hunt_presets where user_id = v_u[1] and slot = 0 and preset = 0) then
      raise exception 'VERIFY(h): the setup in use was deleted'; end if;
    v := public.hr_hunt_preset_delete(0, 2, '000000c0-0000-4000-a000-00000c4a0104');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(v->'hunt_presets') <> 1
       or jsonb_array_length(public.hr_state_of(v_u[1], 0)->'hunt_presets') <> 1
       or exists (select 1 from public.player_action_sets where user_id = v_u[1] and slot = 0 and preset = 2) then
      raise exception 'VERIFY(h): delete answered % (or its bar stayed)', v; end if;
    if public.hr_hunt_preset_delete(0, 2, '000000c0-0000-4000-a000-00000c4a0104') is distinct from v then
      raise exception 'VERIFY(h): the same key did not replay the answer'; end if;
    -- (i) SETUPS CHANGE IN TOWN: with a hunt open, Save is refused and the bar is the hunt's set.
    insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at) values (v_inst, v_hunt, 'solo', now(), now());
    perform public.hr_hunt_open_session(v_u[1], 0, v_hunt, null, 0, null, v_inst, now(), 0);
    if public.hr_hunt_preset_save(0, 3, 'Mid hunt', gen_random_uuid())->>'error' is distinct from 'hunt_open'
       or exists (select 1 from public.player_hunt_presets where user_id = v_u[1] and slot = 0 and preset = 3)
       or public.hr_hunt_active_set(v_u[1], 0) <> 0 then
      raise exception 'VERIFY(i): a save went through with a hunt open'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_hunt_preset_rename(0, 0, 'X', gen_random_uuid())->>'error' is distinct from 'not_signed_in'
       or public.hr_hunt_preset_save(0, 0, 'X', gen_random_uuid())->>'error' is distinct from 'not_signed_in' then
      raise exception 'VERIFY(i): a signed-out call was answered'; end if;
    raise exception using errcode = 'HR915', message = 'preset-names §5 complete - rolling back';
  exception when sqlstate 'HR915' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) then raise exception 'VERIFY(j): §5 LEAKED a probe row'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_preset_rename(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_preset_delete(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_action_set_rename(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_hunt_preset_save(integer,integer,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_setup_name(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_settings_view(uuid,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_preset_rename(integer,integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_preset_save(integer,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(j): the grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'preset-names: a setup owns its bar, the bar is the current setup''s, Use switches, one name, delete never the one in use, setups change in town; all green';
end $$;
