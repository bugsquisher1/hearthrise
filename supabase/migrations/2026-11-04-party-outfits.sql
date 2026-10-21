-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY PARTY MEMBER IS DRAWN IN THE OUTFIT THEY WEAR (lane
-- a-hero-switching, systems-engineer, 2026-10-21). STAGED, NOT APPLIED.
-- Game CLOSED: applies on its passing §4; part of the reopen review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Andy, live v0.2.22: "my outfit shows fine, but the other character in
-- party/hunt shows the standard knight." The `party` section named no outfit, so
-- the browser drew every other member in its role's default (src/data/hunt-
-- outfits.js outfitSprite: a tank is the knight). The client reads the member's
-- `outfit` already (src/session/hunt-sections.js memberOf) and the hunt scene
-- draws it (src/hunt-view/scene.js spriteOf).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_hunt_party_view RESTATED WHOLE from 2026-11-01-party-leader-density.sql (its
-- live body, §0 pins it), byte-for-byte but the HERO-LOOKS marker, one member key
-- and one join: each member row gains `outfit` = { id, colors } of its
-- player_outfits row when that outfit is still owned (hr_outfit_owned), else null,
-- exactly the walker's `outfit` in hr_town_walkers (2026-10-28-town-own-characters.sql).
-- No grant, signature, table or value change.
--
-- ── EXPOSURE (Tyler 2026-10-20: peers get the numbers and sprite keys needed to
-- draw each other, never skills, gear, perks, premium or Bestiary) ───────────
-- An outfit is a sprite key, already public in town. A premium outfit shows only
-- while owned, which says no more than wearing it does. §4 pins the member keys
-- exactly: nothing else is added.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_party_view from 2026-11-01-party-leader-density.sql.
-- ORDER: after 2026-11-04-town-walker-names.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITION AND THE PIN ──────────────────────────────────────────────
-- The live body, measured 2026-10-21 (tests/live-hash-drift.baseline.json: the
-- whitespace-normalised pg_get_functiondef md5), or this file's own (a re-apply).
do $mig$
declare v_def text; v_src text;
begin
  if to_regclass('public.player_outfits') is null or to_regprocedure('public.hr_outfit_owned(uuid,integer)') is null then
    raise exception 'PIN: player_outfits / hr_outfit_owned are missing (2026-10-25-character-sheet.sql first)'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  v_def := md5(regexp_replace(pg_get_functiondef('public.hr_hunt_party_view(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_def <> '1b6d6ca8dffcfe484da40d83f6f22237' and strpos(v_src, 'HERO-LOOKS') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither the party-leader image (1b6d6ca8...) nor this file''s (md5 %)', v_def; end if;
end $mig$;

-- ── §1 THE BODY ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): `leader_density`, the leader's pick every seat's picker shows.
  -- HERO-LOOKS (2026-11-04-party-outfits.sql): each member row carries the outfit its character wears (public, as in town).
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
  v_away  boolean;
  v_ldens int;
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, m.weapon_type as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to, m.joined_at
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to, null::timestamptz
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    v_away := v_pid is not null and public.hr_party_away(v_r.user_id, v_r.slot, v_r.joined_at);
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', to_jsonb(public.hr_vitals_of(v_r.user_id, v_r.slot)->'max_hp')) end,
        'mana', v_v->'mana', 'mana_max', v_v->'mana_max',
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false),
        'away', v_away,
        -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set), null when none or no
        -- longer owned (a lapsed premium outfit): the same look hr_town_walkers shows of it in town.
        'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(v_r.user_id, v_r.slot))
                       then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
      left join public.player_outfits po on po.user_id = v_r.user_id and po.slot = v_r.slot
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then
      v_lseat := v_r.seat;
      -- the preset the settle reads (the open session's, else 0), as role_pick and hr_hunt_settings_view
      v_ldens := (select (a.options->>'density')::int from public.player_action_sets a
                   where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0));
    end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem,
    'listed', coalesce(v_p.listed, false), 'leader_density', coalesce(v_ldens, 0));
end $function$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u    uuid[] := array['000000c0-0000-4000-a000-00000a100f01', '000000c0-0000-4000-a000-00000a100f02']::uuid[];
  v_hunt text := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
  v_pid  uuid := '000000c0-0000-4000-a000-00000a100fff';
  v_look text := (select o.outfit_id from public.hr_outfits o where not o.premium order by o.sort desc limit 1);
  v_prem text := (select o.outfit_id from public.hr_outfits o where o.premium order by o.sort limit 1);
  v      jsonb;
  v_m    jsonb;
  v_keys text;
  v_i    int;
  v_role text;
begin
  if v_hunt is null or v_look is null then raise exception 'party-outfits §4: no hunt or no free outfit to probe with'; end if;
  begin
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-outfits §4 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'party-outfits §4: hr_create_character refused: %', v; end if;
    end loop;
    -- probe 2 wears v_look (as hr_outfit_set stores it); probe 1 wears none.
    insert into public.player_outfits (user_id, slot, outfit_id, colors) values (v_u[2], 0, v_look, '{"body": 3}'::jsonb)
      on conflict (user_id, slot) do update set outfit_id = excluded.outfit_id, colors = excluded.colors;
    delete from public.player_outfits where user_id = v_u[1] and slot = 0;
    -- A party of two players: probe 1 leads (seat 0), probe 2 sits in seat 1.
    insert into public.hunt_parties (id, hunt_id, leader_user, leader_slot, max_size) values (v_pid, v_hunt, v_u[1], 0, 4);
    for v_i in 1 .. 2 loop
      insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
        values (v_pid, v_u[v_i], 0, v_i - 1, public.hr_hunt_weapon_of(v_u[v_i], 0));
    end loop;
    -- (a) THE OTHER PLAYER'S OUTFIT: probe 1's party section names probe 2's stored outfit and colours.
    v := public.hr_hunt_party_view(v_u[1], 0);
    select m into v_m from jsonb_array_elements(v->'members') m where (m->>'seat')::int = 1;
    if v_m->'outfit' is distinct from jsonb_build_object('id', v_look, 'colors', '{"body": 3}'::jsonb) then
      raise exception 'party-outfits §4(a): seat 1''s outfit reads % (stored %)', v_m->'outfit', v_look; end if;
    -- (b) NONE STORED IS NULL (the role's default is the browser's): probe 2 sees probe 1 with none.
    v := public.hr_hunt_party_view(v_u[2], 0);
    select m into v_m from jsonb_array_elements(v->'members') m where (m->>'seat')::int = 0;
    if v_m is null or not (v_m ? 'outfit') or jsonb_typeof(v_m->'outfit') <> 'null' then
      raise exception 'party-outfits §4(b): a member with no outfit reads %', v_m; end if;
    -- (c) NOTHING ELSE LEAVES: every member row carries exactly these keys (no skills, gear, gold, premium,
    --     Bestiary), and the outfit exactly { id, colors }.
    select string_agg(k, ',' order by k) into v_keys
      from (select distinct jsonb_object_keys(m) k from jsonb_array_elements(v->'members') m) x;
    if v_keys is distinct from 'aggro,away,dealt,dps,drinking,eating,healed,hp,hp_max,hps,hunting,level,mana,mana_max,name,outfit,role_pick,seat,seat_ms,unit,weapon' then
      raise exception 'party-outfits §4(c): a member row carries %', v_keys; end if;
    v := public.hr_hunt_party_view(v_u[1], 0);
    select string_agg(k, ',' order by k) into v_keys
      from (select distinct jsonb_object_keys(m->'outfit') k from jsonb_array_elements(v->'members') m
             where jsonb_typeof(m->'outfit') = 'object') x;
    if v_keys is distinct from 'colors,id' then raise exception 'party-outfits §4(c): an outfit carries %', v_keys; end if;
    -- (d) A STORED OUTFIT NO LONGER OWNED (a premium one on a hero without premium) reads null: the walker's rule.
    if v_prem is null then raise exception 'party-outfits §4(d): the catalogue has no premium outfit to probe with'; end if;
    if public.hr_premium_active(v_u[2], 0, now()) then raise exception 'party-outfits §4(d): CONTROL: the probe hero is premium'; end if;
    update public.player_outfits set outfit_id = v_prem where user_id = v_u[2] and slot = 0;
    v := public.hr_hunt_party_view(v_u[1], 0);
    select m into v_m from jsonb_array_elements(v->'members') m where (m->>'seat')::int = 1;
    if jsonb_typeof(v_m->'outfit') <> 'null' then raise exception 'party-outfits §4(d): an outfit the hero no longer owns reads %', v_m->'outfit'; end if;
    raise exception using errcode = 'HR875', message = 'party-outfits §4 complete - rolling back';
  exception when sqlstate 'HR875' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.hunt_parties where id = v_pid)
     or exists (select 1 from public.player_outfits where user_id = any (v_u)) then
    raise exception 'party-outfits §4: a probe row leaked'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_party_view(uuid,integer)', 'execute') then
      raise exception 'party-outfits §4: % reaches hr_hunt_party_view', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-outfits: every member row carries its stored outfit, nothing else new; all green';
end $chk$;
