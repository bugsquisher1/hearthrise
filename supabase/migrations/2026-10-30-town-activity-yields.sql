-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A TOWN ACTIVITY NEVER BLOCKS A HUNT (lane a-party-invite-menu,
-- systems-engineer, 2026-10-20; live v0.2.11: "Nobody went in: tyler is busy in
-- town", and Andy's hero stuck "burying" refused hunt_enter activity_running).
-- STAGED. Game CLOSED: applies on its passing §3.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_hunt_enter_for (restated from 2026-10-28-party-flow.sql, VERBATIM but two
-- spots): a character gathering, on an artisan run or training is no longer
-- refused `activity_running`; the activity yields (the hunt pointer replaces it,
-- hr_hunt_point) and the stop is journalled (player_ledger kind hunt, intent
-- activity_yield, with the instant it was last settled to). Every door uses this
-- body: solo Enter, Hunt again and the party start. Only a hunt already open
-- (`hunt_open`, now naming its hunt) or a non-town pointer still refuses.
-- hr_hunt_party_start (restated from the same file): a not-ready seat carries the
-- hunt it is in, so the client can say "Mira is still hunting in the Sewer".
--
-- ── KNOWN LIMIT (named, not hidden) ─────────────────────────────────────────
-- SQL cannot run the engine, so the stretch since the activity's last settle
-- (the world tick / the client's collect) is not paid here. The client settles
-- its OWN characters through the engine first (set_activity idle, which collects
-- before it switches) before Enter or Start; a stranger in the party is online
-- by rule (an away member is not ready), so its gap is at most one tick window.
-- Paying that window server-side, and ending an artisan run whose inputs ran out
-- at settle, is engine work (hr-accrue accrual.js) for an edge lane.
--
-- REVERSIBILITY: re-apply both bodies from 2026-10-28-party-flow.sql.
-- ORDER: after 2026-10-30-party-invite-player.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure;
  if strpos(v_src, 'PARTY-FLOW') = 0 then raise exception 'PIN: hr_hunt_enter_for is not the party-flow image or this file''s'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_party_start(integer,text,uuid)'::regprocedure;
  if strpos(v_src, 'hr_party_away(') = 0 then raise exception 'PIN: hr_hunt_party_start is not the party-flow image or this file''s'; end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a town activity yields to the hunt instead of refusing it.
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return jsonb_build_object('ok', false, 'error', 'hunts_paused'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt'); end if;
  -- A HUNT IS FOUGHT ON A GROUND: no ground, no world, no hunt (spec §1.1).
  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'no_ground'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return jsonb_build_object('ok', false, 'error', 'bad_preset'); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  -- THE BAG, shape only (stock is checked under the lock).
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64)); end if;
    if v_item = any (v_items) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item); end if;
  end loop;

  -- THE PARTY ROW FIRST (lock order: party, then character), then the character.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    if v_p.hunt_id is distinct from p_hunt then
      return jsonb_build_object('ok', false, 'error', 'party_hunt_mismatch', 'hunt', v_p.hunt_id); end if;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then
    return jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id, 'hunt', v_s.hunt_id); end if;
  -- A TOWN ACTIVITY YIELDS TO THE HUNT (live v0.2.11): gathering, an artisan run or training stops here and the
  -- hunt pointer replaces it (hr_hunt_point below); it is journalled with the instant it was last settled to.
  if v_st.active_kind in ('gather', 'artisan', 'training') then
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (v_uid, p_slot, 'hunt', 'activity_yield',
              jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id, 'settled_to', v_st.accrued_to, 'hunt', p_hunt));
  elsif v_st.active_kind <> 'idle' then
    return jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    return jsonb_build_object('ok', false, 'error', 'unknown_preset'); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return v_r; end if;
  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_stamina'); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_line->>'item' for update;
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint); end if;
  end loop;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  v_from := date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt)));
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, on the party's ground of this start, with
      -- no world (the swing counter keeps counting forward).
      update public.hunt_instances set hunt_id = p_hunt, world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;
revoke execute on function public.hr_hunt_enter_for(uuid, integer, text, jsonb, integer, integer) from public, anon, authenticated, service_role;


create or replace function public.hr_hunt_party_start(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- TOWN-YIELDS (2026-10-30-town-activity-yields.sql): a not-ready seat names the hunt it is in.
  c_verb constant text := 'hunt_party_start';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_m record; v_last public.hunt_sessions%rowtype; v_not jsonb := '[]'::jsonb; v_n int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  -- A party already hunting keeps its ground until every member is out.
  if v_p.hunt_id is distinct from p_hunt
     and exists (select 1 from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_p.hunt_id)); end if;
  -- EVERY MEMBER OR NONE: one subtransaction (the ground included), rolled back when any seat cannot enter.
  begin
    update public.hunt_parties set hunt_id = p_hunt where id = v_pid and hunt_id is distinct from p_hunt;
    for v_m in select m.user_id, m.slot, m.seat, m.joined_at from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      continue when exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
                              and h.ended_at is null and h.instance_id = v_pid);
      -- AWAY: a member whose account has not had the game open lately is not marched in unseen.
      if v_m.user_id <> v_uid and public.hr_party_away(v_m.user_id, v_m.slot, v_m.joined_at) then
        v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                               'error', 'away'));
        continue;
      end if;
      select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
       order by h.entered_at desc, h.id limit 1;
      v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, p_hunt, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                      public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.hours_limit);
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                                  'error', v_r->>'error', 'hunt', v_r->'hunt'));
      end if;
    end loop;
    if jsonb_array_length(v_not) > 0 then raise exception using errcode = 'HR878', message = 'not_ready'; end if;
  exception when sqlstate 'HR878' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_ready', 'seats', v_not));
  end;
  if v_n = 0 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_hunting')); end if;
  v_r := jsonb_build_object('ok', true, 'entered', v_n, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

revoke execute on function public.hr_hunt_enter_for(uuid, integer, text, jsonb, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_start(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_start(int, text, uuid) to authenticated;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e340001', '000000c0-0000-0000-0000-00005e340002']::uuid[];
  v_hunt text := (select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
                   order by coalesce(h.band_min, 0), g.hunt_id limit 1);
  v_gather text := (select a.activity_id from public.hr_activities a where a.kind = 'gather' and a.req_lv is null or a.kind = 'gather' and a.req_lv <= 1 order by a.activity_id limit 1);
  v jsonb; v_i int; v_pid uuid;
  k text := '000000c0-0000-4000-a000-0000';
begin
  begin
    if v_hunt is null then
      v_hunt := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
      insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats) values (v_hunt, 'probe_ground', 1, 1, 60000, 5);
    end if;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 2 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Town ' || chr(64 + v_i)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'town-activity-yields §3 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now()) on conflict (user_id) do update set seen_at = now();
    end loop;
    -- (a) a new character has no resume target: a hunt end leaves it idle, never fishing.
    if (select last_activity_kind from public.player_state where user_id = v_u[1] and slot = 0) is not null then
      raise exception 'VERIFY(a): a new character would resume %', (select last_activity_kind from public.player_state where user_id = v_u[1] and slot = 0); end if;
    -- (b) A gathers; B is in a hunt of its own: the party start names B and its hunt, nobody enters.
    update public.player_state set active_kind = 'gather', active_id = v_gather, active_since = now(), accrued_to = now()
     where user_id = v_u[1] and slot = 0;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (k || '5e340101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): B''s own hunt answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_party_invite(0, 'Probe Town B', (k || '5e340102')::uuid);
    v_pid := public.hr_hunt_party_of(v_u[1], 0);
    insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type) values (v_pid, v_u[2], 0, 1, 'neutral');
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e340103')::uuid);
    if v->>'error' is distinct from 'not_ready' or v->'seats'->0->>'error' <> 'hunt_open' or v->'seats'->0->>'hunt' is distinct from v_hunt
       or exists (select 1 from public.hunt_sessions where user_id = v_u[1] and ended_at is null) then
      raise exception 'VERIFY(b): a start with a member in another hunt answered %', v; end if;
    -- (c) B out of its hunt: the start enters both; A's gathering yields, journalled.
    perform public.hr_hunt_close(h.id, 'left', now(), true) from public.hunt_sessions h where h.user_id = v_u[2] and h.ended_at is null;
    update public.player_state set active_kind = 'gather', active_id = v_gather, active_since = now() where user_id = v_u[1] and slot = 0;
    v := public.hr_hunt_party_start(0, v_hunt, (k || '5e340104')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 2
       or (select active_kind from public.player_state where user_id = v_u[1] and slot = 0) = 'gather'
       or not exists (select 1 from public.player_ledger l where l.user_id = v_u[1] and l.intent = 'activity_yield' and l.meta->>'kind' = 'gather') then
      raise exception 'VERIFY(c): a start with a gathering member answered %', v; end if;
    raise exception using errcode = 'HR885', message = 'town-activity-yields §3 complete - rolling back';
  exception when sqlstate 'HR885' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) then raise exception 'VERIFY(d): §3 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'town-activity-yields: a town activity yields to a hunt, another hunt is named, a new character resumes nothing; all green';
end $$;
