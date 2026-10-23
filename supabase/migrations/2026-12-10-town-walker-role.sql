-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A BODY IN TOWN WEARS ITS OWN LOOK (lane a-other-outfits,
-- systems-engineer, 2026-10-22). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler, live v0.2.31: "I can't see other players' skin choice. Just defaults to
-- the paladin." A hero that never picked an outfit wears its WEAPON's outfit
-- (src/data/hunt-outfits.js ROLE_OUTFIT): on its own screen from its `role`
-- section (hr_role_view, the worn weapon's role; src/session/hero-look.js), in a
-- party hunt from the member's weapon (hr_hunt_party_view `weapon`). In town
-- every OTHER player read it from hr_town_walkers' `role`, and that was
-- hr_chat_role_pick: the action set's retired role pick (src/data/hunt-sessions.js
-- ACTION_SET_OPTIONS.role, "a cut still owed"), null for nearly every hero. The
-- client then fell back to the plate knight for all of them (live 2026-10-22: the
-- QA account's Wrenna, a staff healer drawn as a druid on her own screen, walked
-- the Common in plate for everyone else).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_town_walkers RESTATED WHOLE from 2026-11-04-town-walker-names.sql (its live
-- body, §0 pins it), byte-for-byte but two lines: the WALKER-ROLE marker and the
-- walker's `role`, now hr_role_view(user, slot)->>'id': the function behind the
-- character's own `role` section, so another player draws a hero in town with
-- the look its own screen shows. No grant, signature, table, filter or key change.
--
-- ── EXPOSURE ─────────────────────────────────────────────────────────────────
-- A role (tank / melee_dps / ranger / mage / healer) is what the hero's sprite
-- already shows; chat rows (from_weapon) and the party view (weapon) send the
-- weapon it comes from. The walker keys are unchanged: name, level, role,
-- outfit, tiles. No skill, gear, gold or premium leaves the server.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Per walker, hr_role_view is primary-key probes (the worn weapon, its catalogue
-- row, the active set and its options) where hr_chat_role_pick probed the open
-- hunt and the set: a few index reads more, at most 40 walkers a read.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_town_walkers from 2026-11-04-town-walker-names.sql.
-- ORDER: after 2026-12-09-hunt-sessions-catalogue.generated.sql (last in the
-- chain; it reseeds hr_hunt_weapons / hr_hunt_weapon_roles, which hr_role_view
-- and §4 read). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITION AND THE PIN ──────────────────────────────────────────────
-- The live body, measured 2026-10-22 (tests/live-hash-drift.baseline.json: the
-- whitespace-normalised pg_get_functiondef md5), or this file's own (a re-apply).
do $mig$
declare v_def text; v_src text;
begin
  if to_regprocedure('public.hr_role_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_role_view (2026-10-25-hunt-presets.sql) is missing'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_town_walkers(text)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_town_walkers(text)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '73cf2840f18f2b102c3c386fa9e4fbac' and strpos(v_src, 'WALKER-ROLE') = 0 then
    raise exception 'PIN: hr_town_walkers is neither the walker-names image (73cf2840...) nor this file''s (md5 %)', v_def; end if;
end $mig$;

-- ── §1 THE BODY ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_town_walkers(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- Fresh: the client re-publishes a standing body every 10 s, so three missed
  -- keepalives is gone (a closed tab leaves within this without a goodbye).
  c_fresh   constant interval := interval '30 seconds';
  c_cap     constant int := 40;
  c_scan    constant int := 80;    -- the index rows one read may visit (2 × cap)
  c_per_min constant int := 45;
  v_uid uuid := auth.uid();
begin
  -- WALKER-NAMES (2026-11-04-town-walker-names.sql): each walker is named as its CHARACTER (user and slot).
  -- WALKER-ROLE (2026-12-10-town-walker-role.sql): its role is its worn weapon's, as its own `role` section says.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_walk', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', left(public.hr_character_name(w.user_id, w.slot), 24),
             'level', public.hr_level_of(w.user_id, w.slot),
             'role', public.hr_role_view(w.user_id, w.slot)->>'id',
             -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set),
             -- null when none or no longer owned (a lapsed premium outfit), as hr_outfit_view reads it.
             'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                            then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
             'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
             'age_ms', greatest(0, floor(extract(epoch from (now() - w.at)) * 1000))::int
           ) order by w.at desc)
      from (select c.*
              from (select tp.* from public.town_positions tp
                     where tp.map_id = p_map and tp.at > now() - c_fresh
                     order by tp.at desc limit c_scan) c
              join public.player_state ps on ps.user_id = c.user_id and ps.slot = c.slot
             where not coalesce(ps.presence_quiet, false)
               and not exists (select 1 from public.hunt_sessions h
                                where h.user_id = c.user_id and h.slot = c.slot and h.ended_at is null)
               and not public.hr_social_blocked(v_uid, c.user_id)
               and public.hr_admitted(c.user_id)
             order by c.at desc limit c_cap) w
      left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot), '[]'::jsonb));
end $function$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-00000a1e5b01';   -- one account: a staff hero, a wand hero in Fur Wraps
  v_b constant uuid := '000000c0-0000-4000-a000-00000a1e5b02';   -- another player, looking at them
  v_staff text; v_wand text;
  v_w jsonb; v_e jsonb; v_keys text;
begin
  select min(item_id) into v_staff from public.hr_hunt_weapons where weapon_type = 'staff';
  select min(item_id) into v_wand from public.hr_hunt_weapons where weapon_type = 'wand';
  if v_staff is null or v_wand is null then raise exception 'walker-role §4: no staff or wand in hr_hunt_weapons'; end if;
  if (select prosecdef from pg_proc where oid = 'public.hr_town_walkers(text)'::regprocedure) is not true
     or has_function_privilege('anon', 'public.hr_town_walkers(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_walkers(text)', 'execute') then
    raise exception 'walker-role §4: hr_town_walkers''s definer or grants moved'; end if;
  begin
    insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'walker-role §4')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_a, 'Role A'), (v_b, 'Role B')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'walker-role §4 probe'), (v_b, 'walker-role §4 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' or coalesce(public.hr_create_character(1)->>'ok', '') <> 'true' then
      raise exception 'walker-role §4: the probe heroes were not made'; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'walker-role §4: the observer was not made'; end if;
    -- slot 0 holds a staff and wears nothing chosen; slot 1 holds a wand and wears the (free) Fur Wraps
    insert into public.player_equipment (user_id, slot, equip_slot, item_id)
      values (v_a, 0, 'weapon', v_staff), (v_a, 1, 'weapon', v_wand)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    insert into public.player_outfits (user_id, slot, outfit_id, colors, updated_at) values (v_a, 1, 'berserker', '{}'::jsonb, now())
      on conflict (user_id, slot) do update set outfit_id = excluded.outfit_id, colors = excluded.colors;
    if public.hr_role_view(v_a, 0)->>'id' is distinct from 'healer' or public.hr_role_view(v_a, 1)->>'id' is distinct from 'mage' then
      raise exception 'walker-role §4: CONTROL: the role sections read % and %', public.hr_role_view(v_a, 0), public.hr_role_view(v_a, 1); end if;
    -- CONTROL: the line this file replaces names neither hero's role (the retired action-set pick)
    if public.hr_chat_role_pick(v_a, 0) is not distinct from 'healer' and public.hr_chat_role_pick(v_a, 1) is not distinct from 'mage' then
      raise exception 'walker-role §4: CONTROL: the action-set pick already names both roles, the probe proves nothing'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    if public.hr_town_move(0, 'town_common', 5, 8, 5, 8, 's')->>'stamped' is distinct from 'true'
       or public.hr_town_move(1, 'town_common', 9, 8, 9, 8, 'e')->>'stamped' is distinct from 'true' then
      raise exception 'walker-role §4: the probe bodies did not stand in town'; end if;
    -- (a) ANOTHER PLAYER sees each hero with its own weapon's role, and the chosen outfit where there is one.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v_w := public.hr_town_walkers('town_common')->'walkers';
    if not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 0, 'role', 'healer'))
       or not v_w @> jsonb_build_array(jsonb_build_object('id', v_a, 'slot', 1, 'role', 'mage', 'outfit', jsonb_build_object('id', 'berserker'))) then
      raise exception 'walker-role §4(a): the observer sees %', v_w; end if;
    if exists (select 1 from jsonb_array_elements(v_w) e
                where (e->>'id')::uuid = v_a and (e->>'slot')::int = 0 and jsonb_typeof(e->'outfit') <> 'null') then
      raise exception 'walker-role §4(a): a hero that chose no outfit carries one: %', v_w; end if;
    -- (b) EVERY walker's role is its own `role` section's (real bodies standing in town included).
    for v_e in select e from jsonb_array_elements(v_w) e loop
      if (v_e->>'role') is distinct from (public.hr_role_view((v_e->>'id')::uuid, (v_e->>'slot')::int)->>'id') then
        raise exception 'walker-role §4(b): a walker''s role % is not its role section''s', v_e; end if;
    end loop;
    -- (c) NOTHING ELSE LEAVES: every walker carries exactly the walker keys, no skill, gear, gold or premium.
    select string_agg(k, ',' order by k) into v_keys
      from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(v_w) e) x;
    if v_keys is distinct from 'age_ms,dir,gx,gy,id,level,name,outfit,role,slot,x,y' then
      raise exception 'walker-role §4(c): a walker carries %', v_keys; end if;
    raise exception using errcode = 'HR875', message = 'walker-role §4 complete - rolling back';
  exception when sqlstate 'HR875' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_positions where user_id in (v_a, v_b))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b))
     or exists (select 1 from public.player_outfits where user_id in (v_a, v_b)) then
    raise exception 'walker-role §4: a probe row leaked'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'walker-role: every body in town wears its own weapon''s look unless it chose one; the walker keys are unchanged; all green';
end $chk$;
