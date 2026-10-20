-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A HUNT NEVER OPENS BEHIND THE STAMINA STAMP  (2026-10-28)
--
-- With no walk (Tyler 2026-10-19: every hr_hunt_travel.travel_s 0,
-- 2026-10-28-hunt-sessions-catalogue.generated.sql) a hunt opens at now(). A
-- session's settle runs to the swing boundary at or past now and stamps
-- player_state.stamina_at = that window's end, so a character who leaves and
-- enters again inside one swing opened its new session BEFORE stamina_at, and
-- hr_hunt_apply_member refused every settle of it (stamina_ahead): a hunt that
-- never moves (measured: tests/core-loop.mjs LOOP-1 step 11, LOOP-2 step 8). The
-- 20-300 s walk used to hide it. hr_hunt_enter_for (body of
-- 2026-10-28-party-flow.sql) and hr_hunt_new_session (the change-hunt swap's door,
-- body of 2026-10-27-core-bodies.sql), each byte-for-byte but for the arrival, now open no earlier than stamina_at; a party member still
-- rounds up onto the instance's boundaries from there.
--
-- Two function bodies; no table, row or grant change. Reversible by re-applying
-- those two bodies. Apply AFTER 2026-10-28-party-flow.sql. MUST apply before (or with) the
-- catalogue's travel_s 0. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- PARTY-FLOW (2026-10-28-party-flow.sql): a ground-less party matches no hunt; a restarted instance takes the new ground.
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
    return jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id); end if;
  if v_st.active_kind <> 'idle' then
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
  -- NEVER BEFORE THE STAMINA STAMP (2026-10-28): the last session's settle may have
  -- run to the swing boundary just past its leave (stamina_at = that window's end),
  -- and with no walk (travel_s 0) a hunt entered within that swing would open BEHIND
  -- it: every settle of it would refuse stamina_ahead, forever.
  v_from := greatest(date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))),
                     v_st.stamina_at);
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

CREATE OR REPLACE FUNCTION public.hr_hunt_new_session(p_user uuid, p_slot integer, p_hunt text, p_prev uuid, p_preset integer, p_hours integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select public.hr_hunt_open_session(p_user, p_slot, p_hunt, p_prev, p_preset, p_hours, null,
    greatest(date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))),
             (select ps.stamina_at from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)), 0)
$function$;
revoke execute on function public.hr_hunt_new_session(uuid, integer, text, uuid, integer, integer) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $$
declare
  v_src text := (select p.prosrc from pg_proc p where p.oid = 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)'::regprocedure);
begin
  -- (a) the arrival is clamped to the stamina stamp.
  if position('v_st.stamina_at);' in v_src) = 0 or position('v_from := greatest(' in v_src) = 0 then
    raise exception 'VERIFY(a): hr_hunt_enter_for does not open at or after stamina_at'; end if;
  -- (b) still server-only: no client or service role may call it.
  if has_function_privilege('anon', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute') then
    raise exception 'VERIFY(b): hr_hunt_enter_for is executable by a client role'; end if;
  -- (c) the change-hunt door opens no earlier than the stamina stamp either.
  if position('ps.stamina_at from public.player_state' in (select p.prosrc from pg_proc p
       where p.oid = 'public.hr_hunt_new_session(uuid,integer,text,uuid,integer,integer)'::regprocedure)) = 0 then
    raise exception 'VERIFY(c): hr_hunt_new_session does not open at or after stamina_at'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_new_session(uuid,integer,text,uuid,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_new_session(uuid,integer,text,uuid,integer,integer)', 'execute') then
    raise exception 'VERIFY(c): hr_hunt_new_session is executable by a client role'; end if;
end $$;
