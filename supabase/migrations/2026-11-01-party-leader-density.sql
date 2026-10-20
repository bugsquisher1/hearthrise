-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE PARTY LEADER CHOOSES THE HUNT SETTINGS (lane a-pull-density,
-- systems-engineer, 2026-10-20; Tyler 2026-10-20: "There should be a party leader
-- that chooses the hunt settings."). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §2; part of the reopen review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- In a party the LEADER's density pick is the pull size for the whole instance
-- (clamped to the ground for the party's size); the members' picks have no say.
-- Solo, a hero's own pick. The leader is the one the party already has
-- (hunt_parties.leader_user / leader_slot, the crowned seat), never a second source.
--   hr_hunt_instance_read   each member gains `leads` (it is its instance's party
--                           leader; a party instance's id is its party's id). The
--                           engine (src/core/combat-sim.js, hunt-grounds.js partyPick)
--                           takes the leading member's pick, and so does the browser's
--                           live view (the hero rides FROZEN_KEYS `hero`).
--   hr_hunt_party_view      gains `leader_density`: the leader's pick (the preset the
--                           settle reads), so a member's picker shows it read-only.
--   hr_action_set_options   refuses `density` from a member of a party it does not
--                           lead (`not_leader`); every other option is unchanged.
-- RESTATED WHOLE (no body patching) from the replayed pre-images:
-- hr_hunt_instance_read (2026-10-23-hunt-world-state.sql), hr_hunt_party_view
-- (2026-10-28-party-flow.sql), hr_action_set_options (2026-10-25-action-conditions.sql),
-- each byte-for-byte but its PARTY-LEADER lines. §0 md5-pins each pre-image (or this
-- file's own image, by its PARTY-LEADER marker).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Moves no value. A member cannot set the party's pull: the engine never reads a
-- member's pick, and the door refuses it. `leader_density` is one int of the
-- leader's own setup, shown to the seats of its own party only (the view's caller
-- is in that party, as role_pick already is). No table, row or grant change.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the three bodies from their source files.
-- ORDER: after 2026-10-31-live-horizon.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if md5(v_src) <> '3123a95b038a8753134e4e7b34fe8dd9' and strpos(v_src, 'PARTY-LEADER') = 0 then
    raise exception 'PIN: hr_hunt_instance_read is neither the hunt-world-state image (3123a95b...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'c3711d44c7f6babed0a8a013b5cdd64f' and strpos(v_src, 'PARTY-LEADER') = 0 then
    raise exception 'PIN: hr_hunt_party_view is neither the party-flow image (c3711d44...) nor this file''s (md5 %)', md5(v_src); end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_action_set_options(integer,integer,jsonb,uuid)'::regprocedure;
  if md5(v_src) <> '522be9b8a1e15383ff8c18875dca3e8c' and strpos(v_src, 'PARTY-LEADER') = 0 then
    raise exception 'PIN: hr_action_set_options is neither the action-conditions image (522be9b8...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE THREE BODIES ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', public.hr_hunt_member_read(h), 'state', public.hr_state_of(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;

CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): each member row says whether it is away and how long its seat is kept.
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): `leader_density`, the leader's pick every seat's picker shows.
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
        'seat_ms', case when v_away then greatest(0, floor(extract(epoch from (public.hr_party_last_seen(v_r.user_id, v_r.joined_at)
                                                                        + public.hr_party_seat_keep() - now())) * 1000))::bigint end)
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
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

CREATE OR REPLACE FUNCTION public.hr_action_set_options(p_slot integer, p_preset integer, p_opts jsonb, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_verb constant text := 'action_set_options';
  c_slack_ms constant bigint := 20000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_k    text;
  v_v    jsonb;
  v_o    public.hr_hunt_set_options%rowtype;
  v_set  jsonb := '{}'::jsonb;
  v_del  text[] := '{}';
  v_bar  jsonb := null;
  v_pid  uuid;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): in a party only the leader sets the density.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  if p_opts is null or jsonb_typeof(p_opts) <> 'object' or p_opts = '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options')); end if;
  for v_k in select jsonb_object_keys(p_opts) loop
    v_v := p_opts->v_k;
    -- THE THREE KEYS THAT ARE NOT OPTION ROWS, each through its own check.
    if v_k = 'slots' then
      v_r := public.hr_hunt_bar_check(case when jsonb_typeof(v_v) = 'null' then '[]'::jsonb else v_v end);
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_bar := v_r->'slots';
      continue;
    elsif v_k = 'stop_rules' or v_k = 'grounds' then
      if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
      v_r := case v_k when 'stop_rules' then public.hr_hunt_stop_rules_check(v_v) else public.hr_hunt_grounds_check(v_v) end;
      if not (v_r->>'ok')::boolean then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
      v_set := v_set || jsonb_build_object(v_k, case v_k when 'stop_rules' then v_r->'rules' else v_r->'grounds' end);
      continue;
    end if;
    select * into v_o from public.hr_hunt_set_options o where o.opt = v_k;
    if not found then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_option',
        'option', left(v_k, 64))); end if;
    if jsonb_typeof(v_v) = 'null' then v_del := v_del || v_k; continue; end if;
    if v_o.kind = 'target' then
      if jsonb_typeof(v_v) <> 'string' or not exists (select 1 from public.hr_hunt_target_modes m where m.mode = v_v #>> '{}') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_target_mode')); end if;
    elsif v_o.kind = 'limit' then
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}')::numeric <> trunc((v_v #>> '{}')::numeric)
         or (v_v #>> '{}')::numeric < public.hr_hunt_limit(v_o.limit_key || '_min')
         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'min', public.hr_hunt_limit(v_o.limit_key || '_min'), 'max', public.hr_hunt_limit(v_o.limit_key || '_max'))); end if;
      v_v := to_jsonb((v_v #>> '{}')::numeric::bigint);
    elsif v_o.kind = 'bool' then
      if jsonb_typeof(v_v) <> 'boolean' then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k)); end if;
    else
      if jsonb_typeof(v_v) <> 'string' or not ((v_v #>> '{}') = any (v_o.vals)) then
        return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_' || v_k,
          'allowed', to_jsonb(v_o.vals))); end if;
    end if;
    v_set := v_set || jsonb_build_object(v_k, v_v);
  end loop;
  if octet_length(v_set::text) > 2048 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_options', 'why', 'too_large')); end if;

  -- THE LEADER CHOOSES THE HUNT SETTINGS (Tyler 2026-10-20): in a party the leader's density is the pull for
  -- every member (the settle reads only the leader's, hunt-grounds.js partyPick); a member's is refused.
  if p_opts ? 'density' then
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is not null and not exists (select 1 from public.hunt_parties p where p.id = v_pid
                                          and p.leader_user = v_uid and p.leader_slot = p_slot) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader', 'option', 'density')); end if;
  end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if v_s.id is not null and v_s.preset = p_preset and public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options, updated_at)
    values (v_uid, p_slot, p_preset, 'Preset ' || (p_preset + 1), coalesce(v_bar, '[]'::jsonb), (v_set - v_del), now())
    on conflict (user_id, slot, preset) do update
      set options = (a.options - v_del) || v_set, slots = coalesce(v_bar, a.slots), updated_at = now();
  select jsonb_build_object('ok', true, 'preset', p_preset, 'options', a.options, 'slots', a.slots) into v_r
    from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, ROLLED BACK ──────────────────────
do $$
declare
  v_u    uuid[] := array['000000c0-0000-4000-a000-0000001ead01', '000000c0-0000-4000-a000-0000001ead02']::uuid[];
  v_hunt text := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
  v_pid  uuid := '000000c0-0000-4000-a000-0000001eadff';
  v      jsonb;
  v_i    int;
  v_role text;
begin
  begin
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-leader §2 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    end loop;
    -- (a) solo: a hero sets its own density.
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_action_set_options(0, 0, '{"density": 3}'::jsonb, '000000c0-0000-4000-a000-0000001ead21');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): a solo density save answered %', v; end if;
    -- A party of two: probe 1 leads (seat 0), probe 2 sits in seat 1.
    insert into public.hunt_parties (id, hunt_id, leader_user, leader_slot, max_size) values (v_pid, v_hunt, v_u[1], 0, 4);
    for v_i in 1 .. 2 loop
      insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type)
        values (v_pid, v_u[v_i], 0, v_i - 1, public.hr_hunt_weapon_of(v_u[v_i], 0));
    end loop;
    -- (b) the member's density is refused (not_leader) and stays 3; the leader's lands.
    v := public.hr_action_set_options(0, 0, '{"density": 5}'::jsonb, '000000c0-0000-4000-a000-0000001ead22');
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(b): a member''s density answered %', v; end if;
    if (select (a.options->>'density')::int from public.player_action_sets a where a.user_id = v_u[2] and a.slot = 0 and a.preset = 0) is distinct from 3 then
      raise exception 'VERIFY(b): a refused member density still moved the stored pick'; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_action_set_options(0, 0, '{"density": 7}'::jsonb, '000000c0-0000-4000-a000-0000001ead23');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the leader''s density answered %', v; end if;
    -- (c) every seat's party section carries the leader's pick.
    v := public.hr_hunt_party_view(v_u[2], 0);
    if (v->>'leader_density')::int is distinct from 7 or (v->>'leader_seat')::int is distinct from 0 then
      raise exception 'VERIFY(c): the member''s party section is %', v; end if;
    -- (d) on the party's instance, the engine read flags the leader and only the leader.
    insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at) values (v_pid, v_hunt, 'party', now(), now());
    for v_i in 1 .. 2 loop
      perform public.hr_hunt_open_session(v_u[v_i], 0, v_hunt, null, 0, null, v_pid, now(), v_i - 1);
    end loop;
    v := public.hr_hunt_instance_read(v_u[2], 0);
    if jsonb_array_length(v->'members') <> 2
       or (select count(*) from jsonb_array_elements(v->'members') m where (m->>'leads')::boolean) <> 1
       or not exists (select 1 from jsonb_array_elements(v->'members') m where (m->>'leads')::boolean and (m->>'user')::uuid = v_u[1]) then
      raise exception 'VERIFY(d): the instance read does not flag the leader alone: %', v->'members'; end if;
    raise exception using errcode = 'HR890', message = 'party-leader §2 complete - rolling back';
  exception when sqlstate 'HR890' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.hunt_parties where id = v_pid) then
    raise exception 'VERIFY(e): §2 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_party_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(e): % reaches an engine read', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_action_set_options(integer,integer,jsonb,uuid)', 'execute') then
    raise exception 'VERIFY(e): hr_action_set_options lost its client grant'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-leader: the leader''s density is the party''s; a member''s is refused; every seat sees the leader''s pick';
end $$;
