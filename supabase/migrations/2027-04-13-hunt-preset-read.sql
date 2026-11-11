-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-13-hunt-preset-read.sql — READ ONE SAVED SETUP WHOLE, IN USE OR NOT (the Hunt prep builder)
--   (lane/c-hunt-preset-read, backend-architect, 2026-11-11; Tyler 2026-11-11 approved the Hunt prep builder:
--   .claude/coordination/mocks/2026-11-11-hunt-prep-builder/SPEC.md "Show a setup that is not in use: MISSING").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. READS ONLY: no table, no row, no value, no ranking; the caller's own hero, never another's.
-- EDGE: none (hr-accrue is not touched; pack-edge --hash unmoved). CLIENT: the builder (lane B) calls the verb when a setup is
-- picked; until it ships nothing calls it. ORDER: after the v0.2.122 chain (2027-04-12-small-calls-items-catalogue.generated.sql
-- is its tip); it creates two NEW functions and restates nothing, so it shares no body with any staged file and is order-free
-- against every one of them. §0 pins the HUD view it mirrors.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- The builder shows and edits ONE setup at a time, picked from the hero's list, and the picked one is usually NOT the one in
-- use. hr_hunt_settings_view (the envelope's hunt_settings section) projects the bar of the setup in use only; hunt_presets
-- carries a setup's name, gear and action-set number, never its bar or its options. So the builder had nothing to draw for
-- the other setups. Putting every setup's bar in the envelope would cost 5 x 20 slots on every frame for a window that is
-- open a minute a day: a read on demand is the right shape (CLAUDE.md §6: journal and project what a player acts on; never
-- per-tick what nobody is looking at).
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_hunt_preset_read(p_slot integer, p_preset integer) -> jsonb   (authenticated; VOLATILE; the caller's own hero)
--   REFUSED: not_signed_in · bad_slot (0..5) · bad_preset (null, < 0, >= hr_hunt_limit('presets') = ACTION_SET_LIMITS.presets)
--            · rate_limited (hr_rate_ok 'preset_read', 60 a minute an account) · no_character.
--   ANSWER: {ok: true} plus the picked setup AS hr_hunt_settings_view SHAPES THE ONE IN USE, from its SAVED rows:
--     preset        the number asked for
--     saved         true when a setup row (player_hunt_presets) or a bar row (player_action_sets) stands on the number
--     name          the setup's name (the setup row's, else the bar row's); NULL when unset
--     in_use        the hero is on this number (hr_hunt_active_set)
--     hunt_open     the hero's open hunt runs on this number (Save and use is town-only; the client reads this to say so)
--     locked        the number is new and past the hero's setup count (hr_setup_locked: the Buy line, as every write verb refuses)
--     role, discipline, weapon_type, role_from
--                   THE SETUP'S OWN ROLE: hr_hunt_weapon_roles over the weapon and shield its gear snapshot names, falling back
--                   PER SLOT to what the hero wears now (hr_hunt_preset_apply wears only the slots the snapshot names and leaves
--                   the rest on, so this is exactly what the hero fights as after Use); the set's `role` pick kept when the key
--                   allows it (the view's rule). role_from: 'gear' (the snapshot named a weapon) | 'worn'.
--     gear          the setup row's gear snapshot {equip_slot: item_id}; NULL when there is no setup row
--     target_mode, stance, distance, chase, gold_floor, supply_source, on_empty, action_set, gather_share
--                   EFFECTIVE values: the saved option, else the catalogue default (hr_hunt_set_options.dflt), else the ROLE
--                   DEFAULT the engine would play (hr_hunt_role_default for the hero's party: in a hunt its instance's open
--                   seats, in a party its seats, else alone) and gold_floor_default — 2027-01-25-town-defaults.sql's rule, so
--                   an unset setup reads what the engine plays and the browser never invents a default
--     defaults      that role default itself {target_mode, stance, distance, chase, gold_floor}, so the builder can tell
--                   "set" from "the role's default" without a second rule
--     stop_rules, grounds   the saved lists ([] when unset)
--     slots         THE BAR AS THE ENGINE PLAYS IT: the stored tablets (an invalid row reads as an empty tablet), the role's
--                   default moves when none of the discipline is on it, the start kit's bar when it holds nothing at all; each
--                   tablet with the view's display fields (an ability's mana / usable / why; a food's count / usable / why,
--                   the open hunt's bag else the backpack)
--     bar           EXACTLY the stored array (player_action_sets.slots, with the gaps); NULL when unset — the builder's draft
--     options       EXACTLY the stored options object; NULL when unset
--   LEFT OUT on purpose (identical for every setup and already in the envelope's hunt_settings): `presets`, `store`,
--   `gather_inert`, `food_pct`, `drink_pct` (the last two have no option row and read null in the view).
--   In a hunt the view overlays the LIVE unit's stance / target / distance / chase for the setup it runs; this read answers
--   the SAVED values for every number, which is what the builder edits.
--
-- hr_hunt_preset_project(p_user uuid, p_slot integer, p_preset integer) -> jsonb   (owner-only; STABLE)
--   The projection above without the ok key; NULL when the hero does not exist. hr_hunt_preset_read is its only client door.
--   It MIRRORS hr_hunt_settings_view's slot and option rules for an arbitrary number instead of the active one. The view is
--   not restated here (a lane sized small; the view is the HUD's truth on every frame and is pinned by three guards). The
--   mirror is held honest two ways: §0 refuses to apply unless the view is the exact image it mirrors, and §4(c) asserts,
--   executed, that for the setup in use the read and the view answer the same seventeen keys. OWED: the next lane that
--   restates hr_hunt_settings_view should make it call this projector for its own number and delete the duplicate.
--
-- SAVING (unchanged, documented for the client lane): ONE hr_action_set_options(p_slot, p_preset, p_opts, p_idem) with
--   {slots, stance, target_mode, distance, chase, gold_floor, ...} saves ANY number's bar and options in one call (a null
--   value clears a key; `slots` is re-validated whole by hr_hunt_bar_check). The NAME is not an option row (`name` is refused
--   bad_option): it already has its own journalled verb, hr_action_set_rename(p_slot, p_preset, p_name, p_idem), clamped by
--   hr_setup_name (whitespace collapsed, 1..24 characters, no control characters, hr_name_blocked), which names the setup row
--   too. So "Save" = one options call, plus one rename call only when the name changed. Save and use = that, then ONE
--   hr_hunt_preset_apply. No name column is added: the server stores one already.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- A signed-in account can now read ITS OWN five setups' bars and options off the envelope path. The signature carries no
-- uuid (nothing can name another player; §4(e) proves another account reads only its own number), every row is keyed on
-- auth.uid(), no argument is stored or echoed but the two small integers, nothing is written but the rate counter. The GM
-- wall lists it (its own setup). Nothing crosses to another player; no money, no ranking, no drop table.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- A read: no lock, no intent key, no journal. VOLATILE on purpose (hr_rate_ok writes its counter; PostgREST would run a
-- STABLE function in a READ ONLY transaction and refuse it, tests/readonly-rpc.mjs's class) and §4(a) pins that. Racing a
-- save: the read answers the committed row, the next read the next one; the builder reloads on pick (the SPEC's rule).
--
-- ── COST ───────────────────────────────────────────────────────────────────
-- Per read: the two setup rows by PK, the open hunt by index, the weapon and shield rows, the ten option rows, and per
-- tablet the same catalogue and count reads the view does on every frame today. Never in the envelope; 60 a minute an
-- account. No table: nothing grows at 100x players.
--
-- REVERSIBILITY: drop the two functions, the hr_client_rpc_baseline row and the hr_gm_wall_allow row. No row, no value.
-- IDEMPOTENT: a second apply restates both bodies byte-identical, re-inserts the same two rows, and §4 rolls back its probes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.player_action_sets') is null or to_regclass('public.player_hunt_presets') is null
     or to_regclass('public.player_hunt_active') is null or to_regclass('public.hr_hunt_set_options') is null
     or to_regclass('public.hr_hunt_role_rules') is null or to_regclass('public.hr_hunt_basic_supplies') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: the setup tables and catalogues are missing (apply the hunt chain through 2027-03-08-rune-ladder-slots.sql first)'; end if;
  if to_regprocedure('public.hr_hunt_settings_view(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_slot_check(jsonb)') is null
     or to_regprocedure('public.hr_hunt_role_default(text,text[])') is null
     or to_regprocedure('public.hr_hunt_role_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_rune_state(uuid,integer,uuid,text,jsonb)') is null
     or to_regprocedure('public.hr_hunt_rune_supply(jsonb)') is null
     or to_regprocedure('public.hr_hunt_rune_store_state(uuid,integer,text,text)') is null
     or to_regprocedure('public.hr_setup_locked(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_limit(text)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null
     or to_regprocedure('public.hr_access_check()') is null
     or to_regprocedure('public.hr_setup_name(text)') is null
     or to_regprocedure('public.hr_action_set_rename(integer,integer,text,uuid)') is null
     or to_regprocedure('public.hr_action_set_options(integer,integer,jsonb,uuid)') is null then
    raise exception 'PRECONDITION: a helper this file reads is missing (2027-01-25-town-defaults.sql, 2027-02-28-setup-slots.sql, 2027-03-08-rune-ladder-slots.sql, 2027-03-13-gm-tools.sql, 2027-03-24-rune-supply.sql)'; end if;
  -- THE PIN: the projector mirrors hr_hunt_settings_view's slot and option rules. It applies only on the image it mirrors
  -- (2027-03-08-rune-ladder-slots.sql's body with 2027-03-24-rune-supply.sql's four RUNE-SUPPLY splices: the live body
  -- tests/live-hash-drift.baseline.json measured 2026-11-11, replay and live agreeing). A moved view means the mirror must be
  -- re-read before this file lands: refuse, never guess.
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_settings_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 <> '44178b8fc575c6501e63297228f17c52' then
    raise exception 'PIN: hr_hunt_settings_view is not the image hr_hunt_preset_project mirrors (md5 %, want 44178b8fc575c6501e63297228f17c52): re-read the mirror against the moved view before applying', v_md5;
  end if;
end $mig$;

-- ── §1 THE PROJECTOR (owner-only) ────────────────────────────────────────────
-- hr_hunt_settings_view's bar and option rules for ONE NUMBER, from the saved rows; no live-unit overlay, no catalogue tails.
create or replace function public.hr_hunt_preset_project(p_user uuid, p_slot int, p_preset int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  s        public.hunt_sessions%rowtype;
  a        public.player_action_sets%rowtype;
  hp       public.player_hunt_presets%rowtype;
  v_opt    jsonb;
  v_wpn    text;     -- the item the setup fights with: its snapshot's, else the worn one
  v_shd    text;
  v_wtype  text;
  v_from   text;
  v_role   text;
  v_disc   text;
  v_party  text[];
  v_rdef   jsonb;
  v_eff    jsonb := '{}'::jsonb;
  v_o      record;
  v_val    jsonb;
  v_list   jsonb := '[]'::jsonb;
  v_def    jsonb;
  v_d      jsonb;
  v_pos    int;
  v_slots  jsonb := '[]'::jsonb;
  v_e      jsonb;
  v_ab     public.hr_hunt_abilities%rowtype;
  v_n      bigint;
  v_own    boolean;
  v_on     boolean;
  v_rune   text;
  v_store  text;
  v_can    boolean;
  v_rs     jsonb;    -- RUNE-SUPPLY (2027-03-24-rune-supply.sql): the slot's rune supply (hr_hunt_rune_supply), as the view projects it
begin
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
   order by h.entered_at desc limit 1;
  select * into a from public.player_action_sets x where x.user_id = p_user and x.slot = p_slot and x.preset = p_preset;
  select * into hp from public.player_hunt_presets x where x.user_id = p_user and x.slot = p_slot and x.preset = p_preset;
  v_opt := coalesce(a.options, '{}'::jsonb);
  -- THE SETUP'S WEAPON KEY (hr_hunt_weapon_of's rule over the setup's own gear): the snapshot's weapon and shield where it
  -- names them, the worn ones where it does not (hr_hunt_preset_apply wears only the named slots and leaves the rest on).
  v_wpn := coalesce(case when hp.user_id is not null and jsonb_typeof(hp.gear->'weapon') = 'string' then hp.gear->>'weapon' end,
                    (select pe.item_id from public.player_equipment pe where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'weapon'));
  v_shd := coalesce(case when hp.user_id is not null and jsonb_typeof(hp.gear->'shield') = 'string' then hp.gear->>'shield' end,
                    (select pe.item_id from public.player_equipment pe where pe.user_id = p_user and pe.slot = p_slot and pe.equip_slot = 'shield'));
  v_from := case when hp.user_id is not null and jsonb_typeof(hp.gear->'weapon') = 'string' then 'gear' else 'worn' end;
  v_wtype := coalesce((select w.weapon_type from public.hr_hunt_weapons w where w.item_id = v_wpn), 'neutral');
  v_wtype := coalesce((select r.with_shield from public.hr_hunt_weapon_roles r
                        where r.weapon_type = v_wtype and r.with_shield is not null
                          and exists (select 1 from public.hr_hunt_shields sh where sh.item_id = v_shd)), v_wtype);
  select case when v_opt->>'role' = any (w.roles) then v_opt->>'role' else w.roles[1] end, w.discipline
    into v_role, v_disc
    from public.hr_hunt_weapon_roles w where w.weapon_type = v_wtype;
  -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): the role default for the hero's party, the view's own rule.
  v_party := case when s.id is not null
                  then array(select public.hr_hunt_role_of(h.user_id, h.slot) from public.hunt_sessions h
                              where h.instance_id = s.instance_id and h.ended_at is null order by h.user_id, h.slot)
                  else array(select public.hr_hunt_role_of(m.user_id, m.slot) from public.hunt_party_members m
                              where m.party_id = public.hr_hunt_party_of(p_user, p_slot) order by m.seat) end;
  v_rdef := coalesce(public.hr_hunt_role_default(v_role, v_party), '{}'::jsonb)
            || jsonb_build_object('gold_floor', public.hr_hunt_limit('gold_floor_default'));
  for v_o in select o.opt, o.dflt from public.hr_hunt_set_options o order by o.opt loop
    v_val := coalesce(nullif(v_opt->v_o.opt, 'null'::jsonb), v_o.dflt, v_rdef->v_o.opt);
    v_eff := v_eff || jsonb_build_object(v_o.opt, v_val);
  end loop;
  -- THE BAR: the stored tablets (an invalid row reads as an empty tablet), then the defaults, as the view fills them.
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
  if not exists (select 1 from jsonb_array_elements(v_list) e where jsonb_typeof(e) = 'object') then
    -- the start kit's bar (src/data/start-kit.js START_BAR), the view's own literal
    v_def := v_def || '[{"id": "d_food", "action": {"type": "consume", "id": "cooked_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_food_store", "action": {"type": "consume", "id": "salted_shrimp"}, "conditions": [{"metric": "self_hp_pct", "op": "lt", "value": 60}], "join": "and"}, {"id": "d_drink", "action": {"type": "consume", "id": "thin_turnip_juice"}, "conditions": [{"metric": "self_mana_pct", "op": "lt", "value": 30}], "join": "and"}]'::jsonb;
  end if;
  for v_d in select value from jsonb_array_elements(v_def) loop
    select min(n - 1) into v_pos from jsonb_array_elements(v_list) with ordinality x(e, n) where jsonb_typeof(x.e) = 'null';
    if v_pos is null then v_list := v_list || jsonb_build_array(v_d);
    else v_list := jsonb_set(v_list, array[v_pos::text], v_d); end if;
  end loop;
  -- THE DISPLAY FIELDS, the server's struck state (the view's rules, verbatim).
  v_on := v_eff->>'supply_source' = 'store' or v_eff->>'on_empty' = 'switch';
  for v_e in select value from jsonb_array_elements(v_list) loop
    if jsonb_typeof(v_e) = 'null' then v_slots := v_slots || jsonb_build_array(v_e); continue; end if;
    if v_e->'action'->>'type' = 'ability' then
      select * into v_ab from public.hr_hunt_abilities ab where ab.ability_id = v_e->'action'->>'id';
      -- RUNE-SUPPLY (the view's four splices, verbatim): only the runes the slot ticked count, the store only when the slot buys on
      -- empty, and a rune spell's slot projects its supply whole (own, onEmpty, store), a default slot's too.
      v_rs := public.hr_hunt_rune_supply(v_e->'action');
      if v_rs is not null then v_e := jsonb_set(v_e, '{action}', (v_e->'action') || jsonb_strip_nulls(jsonb_build_object('own', v_rs->'own', 'onEmpty', v_rs->'onEmpty', 'store', v_rs->'store'))); end if;
      v_rune := case when v_ab.rune is null then 'ready' else public.hr_hunt_rune_state(p_user, p_slot, s.id, v_ab.ability_id, v_rs->'own') end;
      v_store := case when v_rune <> 'ready' and v_on and v_rs->>'onEmpty' = 'store' and v_e->'action' ? 'store'
                      then public.hr_hunt_rune_store_state(p_user, p_slot, v_ab.ability_id, v_e->'action'->>'store') else 'none' end;
      v_can := coalesce(v_ab.active, false) and v_disc = any (v_ab.disciplines) and (v_rune = 'ready' or v_store = 'ready');
      v_slots := v_slots || jsonb_build_array(v_e || jsonb_build_object('mana', v_ab.mana, 'usable', v_can,
        'why', case when v_can is false and v_rune = 'none' and v_rs->>'onEmpty' = 'leave' then 'runes_out'
                    when v_can is false and v_store = 'locked' then 'store_level' when v_can is false and v_rune = 'locked' then 'rune_level' end));
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
  return jsonb_build_object(
    'preset', p_preset,
    'saved', (a.user_id is not null or hp.user_id is not null),
    'name', coalesce(hp.name, a.name),
    'in_use', p_preset = public.hr_hunt_active_set(p_user, p_slot),
    'hunt_open', (s.id is not null and s.preset = p_preset),
    'locked', public.hr_setup_locked(p_user, p_slot, p_preset) is not null,
    'role', v_role, 'discipline', v_disc, 'weapon_type', v_wtype, 'role_from', v_from,
    'gear', case when hp.user_id is null then null else hp.gear end,
    'target_mode', v_eff->'target_mode', 'stance', v_eff->'stance', 'distance', v_eff->'distance', 'chase', v_eff->'chase',
    'gold_floor', v_eff->'gold_floor',
    'supply_source', v_eff->'supply_source', 'on_empty', v_eff->'on_empty', 'action_set', v_eff->'action_set',
    'gather_share', v_eff->'gather_share',
    'defaults', v_rdef,
    'stop_rules', coalesce(v_opt->'stop_rules', '[]'::jsonb), 'grounds', coalesce(v_opt->'grounds', '[]'::jsonb),
    'slots', v_slots,
    'bar', a.slots, 'options', a.options);
end $$;
revoke execute on function public.hr_hunt_preset_project(uuid, int, int) from public, anon, authenticated, service_role;

-- ── §2 THE CLIENT DOOR ───────────────────────────────────────────────────────
create or replace function public.hr_hunt_preset_read(p_slot int, p_preset int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v jsonb;
begin
  -- HUNT-PRESET-READ (2027-04-13-hunt-preset-read.sql): the caller's own hero, one number, read on demand; writes nothing but its rate counter.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return jsonb_build_object('ok', false, 'error', 'bad_preset', 'max', public.hr_hunt_limit('presets') - 1); end if;
  if not public.hr_rate_ok(v_uid, 'preset_read', 60, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v := public.hr_hunt_preset_project(v_uid, p_slot, p_preset);
  if v is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true) || v;
end $$;
revoke execute on function public.hr_hunt_preset_read(int, int) from public;
revoke execute on function public.hr_hunt_preset_read(int, int) from anon, service_role;
grant  execute on function public.hr_hunt_preset_read(int, int) to authenticated;

do $grants$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_preset_project(uuid, integer, integer) from %I', v_role);
      execute format('revoke all on function public.hr_hunt_preset_read(integer, integer) from %I', v_role); end if;
  end loop;
end $grants$;

-- ── §3 THE CLIENT SURFACE, AND THE GAME MASTER'S DOOR ────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_preset_read';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_preset_read', 'p_slot integer, p_preset integer', 'authenticated',
   'added 2027-04-13 (the Hunt prep builder): reads ONE of the caller''s own setups whole, in use or not, as hunt_settings shapes the one in use (bar, conditions, stance, target, chase, distance, gold floor, name, the role default for what is unset); no uuid in the signature; 60 a minute; writes nothing; moves no value');

-- It reaches no other player: the walled account's own setup rows.
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_hunt_preset_read', 'its own setup')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $chk$
declare
  c_a   constant uuid := '000000c0-0000-4000-a000-0000b1d3a001';   -- the hero's owner
  c_b   constant uuid := '000000c0-0000-4000-a000-0000b1d3b001';   -- another player
  c_fn  constant text := 'public.hr_hunt_preset_read(integer,integer)';
  c_pj  constant text := 'public.hr_hunt_preset_project(uuid,integer,integer)';
  v jsonb; v0 jsonb; v1 jsonb; v2 jsonb; vv jsonb; r text; k text; i int;
  v_lim int; v_disc text; v_ab text; v_spell text; v_eat text; v_mode0 text; v_mode1 text; v_dmin int; v_dmax int; v_gmin int;
  v_rdef jsonb; v_have bigint; v_upd timestamptz; v_intents bigint;
begin
  -- §4-NEUTER-ANCHOR
  v_lim := public.hr_hunt_limit('presets');
  -- (a) THE SHAPE AND THE GRANTS: a signed-in client may ask, nobody else; no argument can name a player; the projector is internal;
  --     the door is VOLATILE (PostgREST would run a STABLE one READ ONLY and the rate counter would refuse it); the baseline and the wall list it.
  foreach r in array array['anon', 'service_role'] loop
    if has_function_privilege(r, c_fn, 'execute') then raise exception 'hunt-preset-read §4(a): % can execute hr_hunt_preset_read', r; end if;
  end loop;
  if not has_function_privilege('authenticated', c_fn, 'execute') then raise exception 'hunt-preset-read §4(a): authenticated cannot ask'; end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(r, c_pj, 'execute') then raise exception 'hunt-preset-read §4(a): % reaches the projector', r; end if;
  end loop;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'hr_hunt_preset_read') <> 1 then
    raise exception 'hunt-preset-read §4(a): an overload exists (one that takes a uuid could name another player)'; end if;
  if not exists (select 1 from pg_proc p where p.oid = c_fn::regprocedure and p.prosecdef and p.provolatile = 'v'
                  and p.proconfig @> array['search_path=public, pg_catalog']
                  and pg_get_function_identity_arguments(p.oid) = 'p_slot integer, p_preset integer') then
    raise exception 'hunt-preset-read §4(a): hr_hunt_preset_read is not a volatile security definer (p_slot integer, p_preset integer) with a pinned search_path'; end if;
  if not exists (select 1 from pg_proc p where p.oid = c_pj::regprocedure and p.prosecdef and p.provolatile = 's'
                  and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'hunt-preset-read §4(a): the projector is not a stable security definer with a pinned search_path'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline b where b.proname = 'hr_hunt_preset_read' and b.grantee = 'authenticated'
                  and b.identity_args = pg_get_function_identity_arguments(c_fn::regprocedure)) then
    raise exception 'hunt-preset-read §4(a): the baseline row is missing or names another shape'; end if;
  if to_regclass('public.hr_gm_wall_allow') is not null and not exists (select 1 from public.hr_gm_wall_allow where rpc = 'hr_hunt_preset_read') then
    raise exception 'hunt-preset-read §4(a): the Game Master''s door does not list the verb'; end if;
  -- The two setup tables stay as the hunt chain left them: RLS on, an own-row SELECT at most, no client write privilege, no write policy.
  foreach k in array array['player_action_sets', 'player_hunt_presets'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, 'public.' || k, 'insert,update,delete,truncate,references,trigger') then
        raise exception 'hunt-preset-read §4(a): % holds a write privilege on %', r, k; end if;
    end loop;
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || k)::regclass) then
      raise exception 'hunt-preset-read §4(a): RLS is off on %', k; end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = k and p.cmd <> 'SELECT') then
      raise exception 'hunt-preset-read §4(a): a write policy exists on %', k; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- Signed out: refused before anything is read.
    perform set_config('request.jwt.claim.sub', '', true);
    if public.hr_hunt_preset_read(0, 0)->>'error' is distinct from 'not_signed_in' then raise exception 'hunt-preset-read §4(b): a signed-out read answered %', public.hr_hunt_preset_read(0, 0); end if;

    perform set_config('request.jwt.claim.sub', c_a::text, true);
    insert into auth.users (id) values (c_a) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'hunt-preset-read §4 probe') on conflict (user_id) do nothing;
    if public.hr_hunt_preset_read(0, 0)->>'error' is distinct from 'no_character' then raise exception 'hunt-preset-read §4(b): a read with no hero answered %', public.hr_hunt_preset_read(0, 0); end if;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(b): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_a and slot = 0;
    -- The hero's discipline, one move of it, one food of its own (not a store row), the catalogue's modes and bounds.
    select w.discipline into v_disc from public.hr_hunt_weapon_roles w where w.weapon_type = public.hr_hunt_weapon_of(c_a, 0);
    select ab.ability_id into v_ab from public.hr_hunt_abilities ab where ab.active and ab.rune is null and v_disc = any (ab.disciplines) order by ab.ability_id limit 1;
    -- A rune spell (any discipline: the bar may hold it, the view shows it unusable off-discipline) so the RUNE-SUPPLY branch is walked in (c).
    select ab.ability_id into v_spell from public.hr_hunt_abilities ab where ab.active and ab.rune is not null order by ab.ability_id limit 1;
    select x.id into v_eat from public.hr_hunt_action_ids x
     where x.type = 'consume' and not exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = x.id) order by x.id limit 1;
    select m.mode into v_mode0 from public.hr_hunt_target_modes m order by m.mode limit 1;
    select m.mode into v_mode1 from public.hr_hunt_target_modes m order by m.mode offset 1 limit 1;
    v_dmin := public.hr_hunt_limit('distance_min'); v_dmax := public.hr_hunt_limit('distance_max'); v_gmin := public.hr_hunt_limit('gold_floor_min');
    if v_disc is null or v_ab is null or v_spell is null or v_eat is null or v_mode0 is null or v_mode1 is null or v_dmin is null or v_dmax is null or v_gmin is null then
      raise exception 'hunt-preset-read §4(b): catalogue missing (discipline %, move %, rune spell %, food %, modes % %, bounds % % %)', v_disc, v_ab, v_spell, v_eat, v_mode0, v_mode1, v_dmin, v_dmax, v_gmin; end if;
    -- (b) TWO SETUPS, each its own bar and options; the hero ends on number 1 (a save puts the hero on it).
    v := public.hr_hunt_preset_save(0, 0, 'Boss nights', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(b): save 0 answered %', v; end if;
    v := public.hr_hunt_preset_save(0, 1, 'Cellar rats', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(b): save 1 answered %', v; end if;
    v := public.hr_action_set_options(0, 0, jsonb_build_object(
           'slots', jsonb_build_array(
             jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', v_ab),
                                'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', 45)), 'join', 'and'),
             'null'::jsonb,
             jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', v_eat), 'conditions', '[]'::jsonb, 'join', 'and', 'enabled', false)),
           'stance', 'offensive', 'target_mode', v_mode0, 'distance', v_dmin, 'chase', true, 'gold_floor', v_gmin), gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(b): options 0 answered %', v; end if;
    v := public.hr_action_set_options(0, 1, jsonb_build_object(
           'slots', jsonb_build_array(
             jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', v_eat),
                                'conditions', jsonb_build_array(jsonb_build_object('metric', 'self_hp_pct', 'op', 'lt', 'value', 70),
                                                                jsonb_build_object('metric', 'self_mana_pct', 'op', 'gte', 'value', 10)), 'join', 'and'),
             jsonb_build_object('action', jsonb_build_object('type', 'ability', 'id', v_spell), 'conditions', '[]'::jsonb, 'join', 'and')),
           'stance', 'defensive', 'target_mode', v_mode1, 'distance', v_dmax, 'chase', false, 'gold_floor', v_gmin + 1), gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(b): options 1 answered %', v; end if;
    select coalesce(sum(pi.qty), 0) into v_have from public.player_inventory pi where pi.user_id = c_a and pi.slot = 0 and pi.item_id = v_eat;
    select greatest(max(x.updated_at), max(p.updated_at)) into v_upd
      from public.player_action_sets x join public.player_hunt_presets p on p.user_id = x.user_id and p.slot = x.slot and p.preset = x.preset
     where x.user_id = c_a and x.slot = 0;
    select count(*) into v_intents from public.player_intents where user_id = c_a;

    v0 := public.hr_hunt_preset_read(0, 0);
    v1 := public.hr_hunt_preset_read(0, 1);
    -- Number 0, whole: its name, its options, its three tablets (the move with its one condition, a gap, the food switched Off), its display fields.
    if coalesce(v0->>'ok', '') <> 'true' or v0->>'name' is distinct from 'Boss nights' or (v0->>'saved')::boolean is not true
       or (v0->>'in_use')::boolean is not false or (v0->>'hunt_open')::boolean is not false or (v0->>'locked')::boolean is not false
       or v0->>'stance' is distinct from 'offensive' or v0->>'target_mode' is distinct from v_mode0 or (v0->>'distance')::int is distinct from v_dmin
       or (v0->>'chase')::boolean is not true or (v0->>'gold_floor')::bigint is distinct from v_gmin::bigint
       or v0->>'role' is null or v0->>'discipline' is distinct from v_disc or jsonb_typeof(v0->'gear') <> 'object' or v0->>'role_from' not in ('gear', 'worn')
       or jsonb_typeof(v0->'options') <> 'object' or v0->'options'->>'stance' is distinct from 'offensive' then
      raise exception 'hunt-preset-read §4(b): number 0 reads %', v0; end if;
    if jsonb_typeof(v0->'bar') <> 'array' or jsonb_array_length(v0->'bar') <> 3
       or v0->'bar'->0->'action'->>'id' is distinct from v_ab or v0->'bar'->0->'conditions'->0->>'metric' is distinct from 'self_hp_pct'
       or (v0->'bar'->0->'conditions'->0->>'value')::int is distinct from 45 or v0->'bar'->0->>'id' is null
       or jsonb_typeof(v0->'bar'->1) <> 'null'
       or v0->'bar'->2->'action'->>'id' is distinct from v_eat or v0->'bar'->2->'enabled' is distinct from 'false'::jsonb then
      raise exception 'hunt-preset-read §4(b): number 0''s bar reads %', v0->'bar'; end if;
    if v0->'bar' is distinct from (select x.slots from public.player_action_sets x where x.user_id = c_a and x.slot = 0 and x.preset = 0) then
      raise exception 'hunt-preset-read §4(b): `bar` is not the stored array'; end if;
    if jsonb_typeof(v0->'slots') <> 'array' or jsonb_array_length(v0->'slots') < 3
       or v0->'slots'->0->'action'->>'id' is distinct from v_ab or jsonb_typeof(v0->'slots'->0->'usable') <> 'boolean' or jsonb_typeof(v0->'slots'->0->'mana') <> 'number'
       or v0->'slots'->2->'action'->>'id' is distinct from v_eat or (v0->'slots'->2->>'count')::bigint is distinct from v_have
       or ((v0->'slots'->2->>'usable')::boolean) is distinct from (v_have > 0) then
      raise exception 'hunt-preset-read §4(b): number 0''s slots read %', v0->'slots'; end if;
    -- Number 1, whole, and the hero is on it.
    if coalesce(v1->>'ok', '') <> 'true' or v1->>'name' is distinct from 'Cellar rats' or (v1->>'in_use')::boolean is not true
       or v1->>'stance' is distinct from 'defensive' or v1->>'target_mode' is distinct from v_mode1 or (v1->>'distance')::int is distinct from v_dmax
       or (v1->>'chase')::boolean is not false or (v1->>'gold_floor')::bigint is distinct from (v_gmin + 1)::bigint
       or jsonb_array_length(v1->'bar') <> 2 or jsonb_array_length(v1->'bar'->0->'conditions') <> 2
       or v1->'bar'->0->'conditions'->1->>'metric' is distinct from 'self_mana_pct' or v1->'bar'->0->'conditions'->1->>'op' is distinct from 'gte'
       -- the rune spell's tablet carries its supply (RUNE-SUPPLY: own, onEmpty) both as stored and as projected
       or v1->'bar'->1->'action'->>'id' is distinct from v_spell or jsonb_typeof(v1->'bar'->1->'action'->'own') <> 'array' or v1->'bar'->1->'action'->>'onEmpty' is null
       or v1->'slots'->1->'action'->>'id' is distinct from v_spell or jsonb_typeof(v1->'slots'->1->'action'->'own') <> 'array' or jsonb_typeof(v1->'slots'->1->'usable') <> 'boolean' then
      raise exception 'hunt-preset-read §4(b): number 1 reads %', v1; end if;
    -- (c) PARITY: for the setup in use the read and the HUD's view answer the same keys; the name is the view's presets entry.
    vv := public.hr_hunt_settings_view(c_a, 0);
    if (vv->>'preset')::int <> 1 then raise exception 'hunt-preset-read §4(c): the view is on %, want 1', vv->'preset'; end if;
    foreach k in array array['preset', 'role', 'discipline', 'target_mode', 'stance', 'distance', 'chase', 'gold_floor', 'supply_source', 'on_empty',
                             'action_set', 'gather_share', 'stop_rules', 'grounds', 'slots', 'bar', 'options'] loop
      if v1->k is distinct from vv->k then
        raise exception 'hunt-preset-read §4(c): `%` reads % through the read and % through the view', k, v1->k, vv->k; end if;
    end loop;
    if v1->>'name' is distinct from (select e->>'name' from jsonb_array_elements(vv->'presets') e where (e->>'preset')::int = 1) then
      raise exception 'hunt-preset-read §4(c): the name differs from the view''s presets entry'; end if;
    -- (d) AN UNSET NUMBER: null fields, and the role default the engine would play (town-defaults' rule), named in `defaults` too.
    v2 := public.hr_hunt_preset_read(0, 2);
    v_rdef := coalesce(public.hr_hunt_role_default(v2->>'role', '{}'::text[]), '{}'::jsonb)
              || jsonb_build_object('gold_floor', public.hr_hunt_limit('gold_floor_default'));
    if coalesce(v2->>'ok', '') <> 'true' or (v2->>'saved')::boolean is not false or (v2->>'in_use')::boolean is not false or (v2->>'locked')::boolean is not false
       or v2->'name' is distinct from 'null'::jsonb or v2->'bar' is distinct from 'null'::jsonb or v2->'options' is distinct from 'null'::jsonb
       or v2->'gear' is distinct from 'null'::jsonb or v2->>'role_from' is distinct from 'worn' or v2->>'role' is distinct from vv->>'role' then
      raise exception 'hunt-preset-read §4(d): an unset number reads %', v2; end if;
    foreach k in array array['target_mode', 'stance', 'distance', 'chase', 'gold_floor'] loop
      if v2->k is null or jsonb_typeof(v2->k) = 'null' or v2->k is distinct from v_rdef->k then
        raise exception 'hunt-preset-read §4(d): unset `%` reads %, the role default is %', k, v2->k, v_rdef->k; end if;
    end loop;
    if v2->'defaults' is distinct from v_rdef then raise exception 'hunt-preset-read §4(d): `defaults` reads %, want %', v2->'defaults', v_rdef; end if;
    if v2->'stop_rules' <> '[]'::jsonb or v2->'grounds' <> '[]'::jsonb or jsonb_typeof(v2->'slots') <> 'array' or jsonb_array_length(v2->'slots') = 0
       or exists (select 1 from jsonb_array_elements(v2->'slots') e where jsonb_typeof(e) = 'object' and e->>'id' is null) then
      raise exception 'hunt-preset-read §4(d): an unset number''s bar is not the role''s default tablets: %', v2->'slots'; end if;
    -- (e) ANOTHER PLAYER reads only its own number: keyed on auth.uid(), never an argument.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    insert into auth.users (id) values (c_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_b, 'hunt-preset-read §4 probe B') on conflict (user_id) do nothing;
    if public.hr_hunt_preset_read(0, 0)->>'error' is distinct from 'no_character' then raise exception 'hunt-preset-read §4(e): B with no hero answered %', public.hr_hunt_preset_read(0, 0); end if;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-preset-read §4(e): B''s hero refused: %', v; end if;
    v := public.hr_hunt_preset_read(0, 0);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'saved')::boolean is not false or v->'name' is distinct from 'null'::jsonb or v->'bar' is distinct from 'null'::jsonb then
      raise exception 'hunt-preset-read §4(e): another account read A''s setup: %', v; end if;
    -- (f) THE RANGE: every number the server allows answers; the limit, a negative, a null, a bad slot are refused in words.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    for i in 0 .. v_lim - 1 loop
      v := public.hr_hunt_preset_read(0, i);
      if coalesce(v->>'ok', '') <> 'true' or (v->>'preset')::int <> i then raise exception 'hunt-preset-read §4(f): number % answered %', i, v; end if;
    end loop;
    if (public.hr_hunt_preset_read(0, v_lim - 1)->>'locked')::boolean is not true then raise exception 'hunt-preset-read §4(f): the last number past the free count does not read locked'; end if;
    if public.hr_hunt_preset_read(0, v_lim)->>'error' is distinct from 'bad_preset' or public.hr_hunt_preset_read(0, -1)->>'error' is distinct from 'bad_preset'
       or public.hr_hunt_preset_read(0, null)->>'error' is distinct from 'bad_preset' then
      raise exception 'hunt-preset-read §4(f): a number out of range was not refused bad_preset'; end if;
    if public.hr_hunt_preset_read(6, 0)->>'error' is distinct from 'bad_slot' or public.hr_hunt_preset_read(null, 0)->>'error' is distinct from 'bad_slot' then
      raise exception 'hunt-preset-read §4(f): a bad slot was not refused bad_slot'; end if;
    -- (g) A READ WRITES NOTHING: the setup rows' clocks and the intent journal are as before the reads.
    if (select greatest(max(x.updated_at), max(p.updated_at))
          from public.player_action_sets x join public.player_hunt_presets p on p.user_id = x.user_id and p.slot = x.slot and p.preset = x.preset
         where x.user_id = c_a and x.slot = 0) is distinct from v_upd
       or (select count(*) from public.player_intents where user_id = c_a) <> v_intents then
      raise exception 'hunt-preset-read §4(g): a read moved a setup row or journalled an intent'; end if;
    -- (h) THE NAME CLAMP the builder renames through (hr_setup_name, live on this chain): 25 characters refused, 24 kept, a control character refused.
    v := public.hr_action_set_rename(0, 0, repeat('a', 25), gen_random_uuid());
    if v->>'error' is distinct from 'bad_preset_name' then raise exception 'hunt-preset-read §4(h): a 25-character name answered %', v; end if;
    v := public.hr_hunt_preset_rename(0, 0, repeat('a', 25), gen_random_uuid());
    if v->>'error' is distinct from 'bad_preset_name' then raise exception 'hunt-preset-read §4(h): a 25-character name through the setup verb answered %', v; end if;
    -- (a newline is whitespace and collapses to a space by the server's rule; a BEL is the control character the clamp refuses)
    v := public.hr_action_set_rename(0, 0, 'Boss' || chr(7) || 'nights', gen_random_uuid());
    if v->>'error' is distinct from 'bad_preset_name' then raise exception 'hunt-preset-read §4(h): a control character answered %', v; end if;
    v := public.hr_action_set_rename(0, 0, repeat('a', 24), gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_preset_read(0, 0)->>'name' is distinct from repeat('a', 24) then
      raise exception 'hunt-preset-read §4(h): a 24-character name answered % and reads back %', v, public.hr_hunt_preset_read(0, 0)->>'name'; end if;
    raise exception using errcode = 'HR913', message = 'hunt-preset-read §4 complete - rolling back';
  exception when sqlstate 'HR913' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (c_a, c_b)) or exists (select 1 from auth.users where id in (c_a, c_b)) then
    raise exception 'hunt-preset-read §4: LEAKED a probe row'; end if;
  raise notice 'hunt-preset-read: two setups read back whole, parity with the view on the one in use, an unset number reads the role default, another account reads only its own, the name clamp holds; all green';
end $chk$;
