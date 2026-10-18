-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT PRESETS (gear + action set + restock, remembered) AND THE
-- `role` SECTION (lane S2; CONFLICTS.md 2026-10-18 "ALPHA WINDOWS" items 2, 5,
-- 6; first principle (Tyler 10-18): a setup made once is remembered and
-- reusable). STAGED. Game CLOSED: applies on its passing §4; Security reviews
-- it with every S2 surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- player_hunt_presets (user, slot, preset 0..7): a name (1..24) and a SERVER
--   snapshot of the character's active action set index, its worn set
--   (player_equipment) and its restock targets. Nothing in it comes from the
--   client but the slot, the preset number and the name.
-- player_hunt_active (user, slot): the action set the character's saved setup
--   hunts with (hr_hunt_preset_apply sets it; hr_hunt_party_start reads it).
-- THE VERBS (authenticated; rate bucket `hunt`; idempotent; intent names the preset):
--   hr_hunt_preset_save(p_slot, p_preset, p_name, p_idem)  snapshot, upsert;
--   hr_hunt_preset_apply(p_slot, p_preset, p_idem)  refused while hunting
--     (hunt_open) or while an activity runs (activity_running: changing gear
--     then would confiscate the open window — the equip verb collects first,
--     SQL cannot); wears the preset's gear FROM THE BAG through ONE hr_apply
--     {equip} (ownership, slot fit and requirements are hr_apply's, under its
--     lock; a missing item is refused by name first), switches the active set,
--     replaces the restock targets (only items a supply offer still sells).
-- SECTIONS: `hunt_presets` [{preset, name, action_set, gear, restock}];
--   `role` {id, weapon}: the hunt role the worn weapon gives (hr_hunt_weapon_roles,
--   generated from src/data/hunt-roles.js WEAPON_ROLES), the active set's role
--   pick kept when the weapon allows it — the same rule hr_hunt_settings_view uses.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Moves no value: equipping is hr_apply's conserving transfer (one unit out of
-- the bag per slot, the old one back). A preset cannot name an item the player
-- does not hold (hr_apply's insufficient_item) or wear one it may not
-- (requirement_not_met / wrong_slot).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the two verbs (+ baseline rows), the two section rows + views, the two
-- tables. ORDER: after 2026-10-25-shop-supplies.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_item_rules') is null or to_regclass('public.player_action_sets') is null
     or to_regclass('public.hr_hunt_weapon_roles') is null or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-bag-rules.sql and the S1 hunt files first'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.player_hunt_presets (
  user_id    uuid not null,
  slot       int  not null,
  preset     smallint not null check (preset between 0 and 7),
  name       text not null check (length(name) between 1 and 24),
  action_set smallint not null check (action_set between 0 and 15),
  gear       jsonb not null default '{}'::jsonb check (jsonb_typeof(gear) = 'object'),
  restock    jsonb not null default '{}'::jsonb check (jsonb_typeof(restock) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, preset),
  constraint player_hunt_presets_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create table if not exists public.player_hunt_active (
  user_id    uuid not null,
  slot       int  not null,
  action_set smallint not null default 0 check (action_set between 0 and 15),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint player_hunt_active_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
alter table public.player_hunt_presets enable row level security;
alter table public.player_hunt_active enable row level security;
revoke all on public.player_hunt_presets, public.player_hunt_active from public, anon, authenticated, service_role;
comment on table public.player_hunt_presets is
  '2026-10-25 (lane S2). A saved hunt setup: the server''s snapshot of the active action set, the worn set and the restock targets. '
  'Written only by hr_hunt_preset_save; worn back by hr_hunt_preset_apply.';

-- The active action set (0 until a preset is applied).
create or replace function public.hr_hunt_active_set(p_user uuid, p_slot int)
returns int language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select a.action_set::int from public.player_hunt_active a where a.user_id = p_user and a.slot = p_slot), 0)
$$;
revoke execute on function public.hr_hunt_active_set(uuid, int) from public, anon, authenticated, service_role;

-- ── §2 THE SECTIONS ──────────────────────────────────────────────────────────
create or replace function public.hr_hunt_presets_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce((select jsonb_agg(jsonb_build_object('preset', p.preset, 'name', p.name, 'action_set', p.action_set,
                                                       'gear', p.gear, 'restock', p.restock) order by p.preset)
                     from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_hunt_presets_view(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_role_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
           'id', case when (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot)) = any (w.roles)
                      then (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot))
                      else w.roles[1] end,
           'weapon', w.weapon_type)
    from public.hr_hunt_weapon_roles w
   where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot)
     and exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_role_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_presets', 'hr_hunt_presets_view', '2026-10-25-hunt-presets.sql: the saved hunt setups (action set, worn set, restock targets)'),
  ('role', 'hr_role_view', '2026-10-25-hunt-presets.sql: the hunt role the worn weapon gives, the active set''s pick kept when allowed')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_preset_save(p_slot int, p_preset int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_name) not between 1 and 24 or v_name ~ '[[:cntrl:]]' or public.hr_name_blocked(v_name) then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  v_verb := 'hunt_preset_save:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_save', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('hunt_preset_save', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.player_hunt_presets as p (user_id, slot, preset, name, action_set, gear, restock, updated_at)
  values (v_uid, p_slot, p_preset, v_name, public.hr_hunt_active_set(v_uid, p_slot),
          coalesce((select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e
                     where e.user_id = v_uid and e.slot = p_slot), '{}'::jsonb),
          coalesce((select jsonb_object_agg(r.item_id, r.restock) from public.player_item_rules r
                     where r.user_id = v_uid and r.slot = p_slot and r.restock > 0), '{}'::jsonb),
          now())
  on conflict (user_id, slot, preset) do update
    set name = excluded.name, action_set = excluded.action_set, gear = excluded.gear, restock = excluded.restock, updated_at = now();
  v_r := jsonb_build_object('ok', true, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_preset_apply(p_slot int, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_p public.player_hunt_presets%rowtype;
  v_s public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_delta jsonb := '{}'::jsonb; v_miss record; v_a jsonb; v_k text; v_row record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_verb := 'hunt_preset_apply:' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_preset_apply', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_p from public.player_hunt_presets where user_id = v_uid and slot = p_slot and preset = p_preset;
  if not found then return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  if v_s.id is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  if v_st.active_kind <> 'idle' then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind)); end if;
  if v_p.action_set <> 0 and not exists (select 1 from public.player_action_sets a
                                          where a.user_id = v_uid and a.slot = p_slot and a.preset = v_p.action_set) then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_action_set', 'action_set', v_p.action_set)); end if;
  -- THE GEAR: every slot the preset names that is not already worn so.
  select coalesce(jsonb_object_agg(g.key, g.value), '{}'::jsonb) into v_delta
    from jsonb_each(v_p.gear) g
   where jsonb_typeof(g.value) = 'string'
     and (g.value #>> '{}') is distinct from (select e.item_id from public.player_equipment e
                                                where e.user_id = v_uid and e.slot = p_slot and e.equip_slot = g.key);
  -- A missing item is refused BY NAME before anything moves (hr_apply re-proves it).
  select n.item, n.need, coalesce(pi.qty, 0) as have into v_miss
    from (select d.value #>> '{}' as item, count(*) as need from jsonb_each(v_delta) d group by 1) n
    left join public.player_inventory pi on pi.user_id = v_uid and pi.slot = p_slot and pi.item_id = n.item
   where coalesce(pi.qty, 0) < n.need order by n.item limit 1;
  if v_miss.item is not null then
    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'missing_item',
      'item', v_miss.item, 'have', v_miss.have, 'need', v_miss.need)); end if;
  if v_delta <> '{}'::jsonb then
    v_a := public.hr_apply(v_uid, p_slot, v_st.version, p_idem,
             jsonb_build_object('equip', v_delta, 'journal', jsonb_build_object('kind', 'equip', 'intent', v_verb)));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('hunt_preset_apply', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  end if;
  -- THE ACTION SET and THE RESTOCK TARGETS (only items a supply offer still sells).
  insert into public.player_hunt_active as a (user_id, slot, action_set, updated_at) values (v_uid, p_slot, v_p.action_set, now())
    on conflict (user_id, slot) do update set action_set = excluded.action_set, updated_at = now();
  for v_row in select r.item_id, r.locked, r.loot_rule from public.player_item_rules r
                where r.user_id = v_uid and r.slot = p_slot and r.restock > 0 and not (v_p.restock ? r.item_id) for update loop
    perform public.hr_item_rule_put(v_uid, p_slot, v_row.item_id, v_row.locked, v_row.loot_rule, 0);
  end loop;
  for v_k in select x.key from jsonb_each(v_p.restock) x
              where jsonb_typeof(x.value) = 'number' and (x.value #>> '{}')::numeric between 1 and 1000
                and exists (select 1 from public.hr_shop_supply_offers o where o.item_id = x.key) order by x.key loop
    select r.locked, r.loot_rule into v_row from public.player_item_rules r where r.user_id = v_uid and r.slot = p_slot and r.item_id = v_k;
    perform public.hr_item_rule_put(v_uid, p_slot, v_k, v_row.locked, v_row.loot_rule, (v_p.restock->>v_k)::numeric::int);
  end loop;
  v_r := jsonb_build_object('ok', true, 'worn', v_delta, 'action_set', v_p.action_set,
                            'bag_rules', public.hr_bag_rules_view(v_uid, p_slot));
  if v_delta = '{}'::jsonb then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $$;

revoke execute on function public.hr_hunt_preset_save(int, int, text, uuid) from public;
revoke execute on function public.hr_hunt_preset_save(int, int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_preset_save(int, int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_preset_apply(int, int, uuid) from public;
revoke execute on function public.hr_hunt_preset_apply(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_preset_apply(int, int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_hunt_preset_save', 'hr_hunt_preset_apply');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_preset_save', 'p_slot integer, p_preset integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): snapshot the active action set, the worn set and the restock targets as hunt preset 0..7; the snapshot is the server''s'),
  ('hr_hunt_preset_apply', 'p_slot integer, p_preset integer, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): wear a preset''s gear from the bag (one hr_apply equip, a conserving transfer), switch the action set and the restock targets; refused while hunting or busy');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e2c0001';
  v jsonb; v_role text; v_weap text; v_slotname text; v_offer text; v_worn text;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hunt-presets §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- A weapon with no requirement that plays a role, held in the bag.
    select w.item_id, s.equip_slot into v_weap, v_slotname from public.hr_hunt_weapons w
      join public.hr_items i on i.item_id = w.item_id and (i.req_lv is null or i.req_lv <= 1)
      join public.hr_item_slots s on s.item_id = w.item_id
     where w.item_id is distinct from (select e.item_id from public.player_equipment e where e.user_id = v_u and e.slot = 0 and e.equip_slot = s.equip_slot)
     order by w.item_id limit 1;
    if v_weap is null then raise exception 'VERIFY(a): no unrequired weapon in the catalogue'; end if;
    v_worn := (select e.item_id from public.player_equipment e where e.user_id = v_u and e.slot = 0 and e.equip_slot = v_slotname);
    v_offer := (select o.item_id from public.hr_shop_supply_offers o order by o.item_id limit 1);
    -- (a) empty presets; the role section names the worn weapon's role.
    v := public.hr_state_of(v_u, 0);
    if v->'hunt_presets' <> '[]'::jsonb or (v->'role'->>'weapon') is distinct from public.hr_hunt_weapon_of(v_u, 0) then
      raise exception 'VERIFY(a): presets % role %', v->'hunt_presets', v->'role'; end if;
    -- (b) save: the server's snapshot of the worn set and the targets.
    v := public.hr_restock_set(0, jsonb_build_object(v_offer, 15), '000000c0-0000-4000-a000-00005e2c0101');
    v := public.hr_hunt_preset_save(0, 3, '  Cellar   rats ', '000000c0-0000-4000-a000-00005e2c0102');
    if coalesce(v->>'ok', '') <> 'true' or (v->'hunt_presets'->0->>'name') <> 'Cellar rats'
       or (v->'hunt_presets'->0->'restock'->>v_offer)::int is distinct from 15
       or (v->'hunt_presets'->0->'gear'->>v_slotname) is distinct from v_worn then
      raise exception 'VERIFY(b): save answered %', v; end if;
    -- (c) apply with a missing item is refused by name; with the item held it is worn from the bag.
    update public.player_hunt_presets set gear = gear || jsonb_build_object(v_slotname, v_weap) where user_id = v_u and preset = 3;
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_weap;
    v := public.hr_restock_set(0, jsonb_build_object(v_offer, 0), '000000c0-0000-4000-a000-00005e2c0103');
    v := public.hr_hunt_preset_apply(0, 3, '000000c0-0000-4000-a000-00005e2c0104');
    if v->>'error' is distinct from 'missing_item' or v->>'item' is distinct from v_weap then raise exception 'VERIFY(c): apply without the item answered %', v; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_weap, 1);
    v := public.hr_hunt_preset_apply(0, 3, '000000c0-0000-4000-a000-00005e2c0105');
    if coalesce(v->>'ok', '') <> 'true'
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = v_slotname) <> v_weap
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_weap)
       or (public.hr_bag_rules_view(v_u, 0)->'restock'->>v_offer)::int is distinct from 15 then
      raise exception 'VERIFY(c): apply answered % and the gear / targets did not follow', v; end if;
    if v_worn is not null and coalesce((select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_worn), 0) < 1 then
      raise exception 'VERIFY(c): the swapped-out item did not come back to the bag'; end if;
    -- (d) busy: refused.
    update public.player_state ps set active_kind = a.kind, active_id = a.activity_id
      from (select x.kind, x.activity_id from public.hr_activities x where x.kind <> 'combat' order by 1, 2 limit 1) a
     where ps.user_id = v_u and ps.slot = 0;
    v := public.hr_hunt_preset_apply(0, 3, '000000c0-0000-4000-a000-00005e2c0106');
    if v->>'error' is distinct from 'activity_running' then raise exception 'VERIFY(d): a busy apply answered %', v; end if;
    v := public.hr_hunt_preset_apply(0, 6, '000000c0-0000-4000-a000-00005e2c0107');
    if v->>'error' is distinct from 'unknown_preset' then raise exception 'VERIFY(d): an unknown preset answered %', v; end if;
    raise exception using errcode = 'HR873', message = 'hunt-presets §4 complete - rolling back';
  exception when sqlstate 'HR873' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_hunt_presets', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.player_hunt_active', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_hunt_presets_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_role_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_active_set(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches a preset table or internal', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunt-presets: snapshots are the server''s, apply wears from the bag through hr_apply, role from the worn weapon; all green';
end $$;
