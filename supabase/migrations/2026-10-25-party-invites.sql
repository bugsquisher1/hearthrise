-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — PARTY INVITES, THE SHARED START, HUNT AGAIN (lane S2;
-- CONFLICTS.md 2026-10-18 "PARTY UI" items 4-6, 9; first principle (Tyler
-- 10-18): nobody re-enters a setup they already made). STAGED. Game CLOSED:
-- applies on its passing §5; Security reviews it with every S2 surface in the
-- reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hunt_party_invites: an invite from a party member to ONE character, found by
--   the name players see (hr_character_by_name, 2026-10-25-account-items.sql;
--   no user id crosses from the client: `no_such_name`). It lives while its
--   party is open and for an hour at most (c_invite_ttl).
-- THE VERBS (authenticated, every one through hr_rpc_gate; idempotent):
--   hr_hunt_party_invite(p_slot, p_name, p_idem)   bucket party; a member of an
--     open party with a free seat (no_party / party_full); not one's own seat,
--     not a member (already_member); <= 8 open invites a party (too_many_invites).
--   hr_hunt_party_accept(p_slot, p_invite, p_idem) bucket party; the invite must
--     be to THIS character (no_invite / invite_expired); then exactly
--     hr_hunt_party_join (its own checks: hunt_open, already_in_party,
--     party_full) under a key derived from p_idem; the invite is used up.
--   hr_hunt_party_decline(p_slot, p_invite, p_idem) bucket party; forgets it.
--   hr_hunt_party_start(p_slot, p_idem)  bucket hunt; THE LEADER only
--     (not_leader); enters EVERY member not already on the party's hunt, each
--     with ITS OWN saved setup — the active action set (player_hunt_active), its
--     restock targets as the bag (held units only, essential lines first, up to
--     bag_lines), the falls / hours of its own latest hunt — in ONE transaction:
--     a member that cannot enter makes the whole start `not_ready`, naming every
--     such seat and why (no stamina, a hunt open, an activity running, ...).
--   hr_hunt_restart(p_slot, p_session, p_idem)  bucket hunt; the "Start again"
--     button: the session must be this character's LATEST and ended
--     (not_latest); a party member is refused `party_hunt` (the party restarts
--     through its leader's start); re-enters that session's hunt with its preset,
--     falls, hours and bag (each line at most what is held now).
-- ONE ENTRY BODY: hr_hunt_enter is restated as the client wrapper (identity,
--   replay, rate gate, stored result) over hr_hunt_enter_for(user, ...), the
--   S1 body from "hunts_paused" on, VERBATIM but for the user it is handed and
--   returning its refusal instead of noting it. Party start and restart call the
--   same body, so the three doors cannot disagree about who may enter.
--   §0 pins hr_hunt_enter's pre-image (md5 of prosrc) or this file's own image.
-- THE SECTION `party_invites` [{id, party, hunt, from}] — invites to this
--   character in open parties, newest first, <= 16 (party-sections.js invitesOf).
--
-- ── EXPLOIT SURFACE (Security, reopen review item 9) ────────────────────────
-- hr_hunt_party_start spends EVERY member's supplies on the leader's press.
-- It can only enter characters that are members of the leader's own open party
-- (joined by their own verb, or by their own accept), each with its OWN saved
-- bag taken from its OWN bag rows, through the same entry body every hunt uses.
-- No value moves to anyone: the bag is the member's, in the member's session.
-- An invite carries no value and admits nobody by itself.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the five verbs (+ baseline rows), the section row + view, the table and
-- hr_hunt_enter_for; re-apply hr_hunt_enter from 2026-10-23-hunt-party.sql.
-- ORDER: after 2026-10-25-blessings.sql (last S2 file). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_character_by_name(text)') is null or to_regclass('public.player_hunt_active') is null
     or to_regclass('public.player_item_rules') is null or to_regprocedure('public.hr_hunt_party_join(integer,uuid,uuid)') is null then
    raise exception 'PRECONDITION: apply the S2 files (account-items, hunt-presets, bag-rules) and the S1 party first'; end if;
  -- THE PIN: the installed hr_hunt_enter is S1's (2026-10-23-hunt-party.sql) or this
  -- file's own wrapper; anything else moved meanwhile and is refused, never clobbered.
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)'::regprocedure;
  if v_md5 <> '037c228cb9fbb59521964972ec7d72c6'
     and strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)'::regprocedure),
                'hr_hunt_enter_for(') = 0 then
    raise exception 'PIN: hr_hunt_enter is neither the S1 pre-image (037c228c...) nor this file''s wrapper (md5 %) - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 ONE ENTRY BODY ────────────────────────────────────────────────────────
-- S1's hr_hunt_enter from "hunts_paused" on, VERBATIM but for the user it is
-- handed (p_uid, not auth.uid()) and answering its refusal instead of noting it.
-- Owner-only: callers are the three SECURITY DEFINER doors below, each of which
-- has already proved who p_uid is (the caller, or a member of the caller's party).
create or replace function public.hr_hunt_enter_for(p_uid uuid, p_slot int, p_hunt text, p_bag jsonb, p_preset int,
  p_falls int, p_hours int)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_falls int; v_id uuid;
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
  v_falls := coalesce(p_falls, public.hr_hunt_limit('falls_default'));
  if v_falls < public.hr_hunt_limit('falls_min') or v_falls > public.hr_hunt_limit('falls_max') then
    return jsonb_build_object('ok', false, 'error', 'bad_falls'); end if;
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
    if v_p.hunt_id <> p_hunt then
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
  v_from := date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt)));
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, with no world (the
      -- swing counter keeps counting forward).
      update public.hunt_instances set world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, v_falls, p_hours, v_party, v_from, coalesce(v_seat, 0));
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

  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot));
end $$;
revoke execute on function public.hr_hunt_enter_for(uuid, int, text, jsonb, int, int, int) from public, anon, authenticated, service_role;

-- THE CLIENT DOOR: identity, replay, rate gate, the one body, the stored result.
create or replace function public.hr_hunt_enter(p_slot int, p_hunt text, p_bag jsonb, p_preset int,
  p_falls int, p_hours int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_enter';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_hunt_enter_for(v_uid, p_slot, p_hunt, p_bag, p_preset, p_falls, p_hours);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_r := jsonb_build_object('ok', true, 'session', v_r->'session', 'version', v_r->'version');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from public;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_enter(int, text, jsonb, int, int, int, uuid) to authenticated;

-- ── §2 THE SHARED START AND HUNT AGAIN ───────────────────────────────────────
-- A character's saved bag: its restock targets it holds units of, essential
-- lines first, at most bag_lines lines (each at most what it holds).
create or replace function public.hr_hunt_saved_bag(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item_id, 'qty', x.qty) order by x.essential desc, x.item_id), '[]'::jsonb)
    from (select r.item_id, least(r.restock::bigint, pi.qty) as qty, s.essential
            from public.player_item_rules r
            join public.player_inventory pi on pi.user_id = r.user_id and pi.slot = r.slot and pi.item_id = r.item_id and pi.qty > 0
            join public.hr_hunt_supplies s on s.item_id = r.item_id
           where r.user_id = p_user and r.slot = p_slot and r.restock > 0
           order by s.essential desc, r.item_id
           limit greatest(0, coalesce(public.hr_hunt_limit('bag_lines'), 0))) x
$$;
revoke execute on function public.hr_hunt_saved_bag(uuid, int) from public, anon, authenticated, service_role;

create or replace function public.hr_hunt_party_start(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
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
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  -- EVERY MEMBER OR NONE: one subtransaction, rolled back when any seat cannot enter.
  begin
    for v_m in select m.user_id, m.slot, m.seat from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      continue when exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
                              and h.ended_at is null and h.instance_id = v_pid);
      select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
       order by h.entered_at desc, h.id limit 1;
      v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, v_p.hunt_id, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                      public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.falls_limit, v_last.hours_limit);
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                                  'error', v_r->>'error'));
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

create or replace function public.hr_hunt_restart(p_slot int, p_session uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_s public.hunt_sessions%rowtype; v_bag jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_session is null then return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_session')); end if;
  v_verb := 'hunt_restart:' || p_session;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_restart', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if public.hr_hunt_party_of(v_uid, p_slot) is not null then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt')); end if;
  select * into v_s from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot order by h.entered_at desc, h.id limit 1;
  if v_s.id is distinct from p_session or v_s.ended_at is null then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'not_latest')); end if;
  -- That session's bag, each line at most what is held now.
  select coalesce(jsonb_agg(jsonb_build_object('item', b.item_id, 'qty', least(b.qty_loaded, pi.qty), 'essential', b.essential)
                            order by b.essential desc, b.item_id), '[]'::jsonb)
    into v_bag
    from public.hunt_bag b
    join public.player_inventory pi on pi.user_id = v_uid and pi.slot = p_slot and pi.item_id = b.item_id and pi.qty > 0
   where b.session_id = v_s.id and b.qty_loaded > 0;
  v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_s.hunt_id, v_bag, v_s.preset, v_s.falls_limit, v_s.hours_limit);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_restart', p_slot, v_r); end if;
  v_r := jsonb_build_object('ok', true, 'session', v_r->'session', 'version', v_r->'version');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §3 INVITES ───────────────────────────────────────────────────────────────
create table if not exists public.hunt_party_invites (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.hunt_parties (id) on delete cascade,
  from_user  uuid not null,
  from_slot  int  not null,
  to_user    uuid not null,
  to_slot    int  not null,
  created_at timestamptz not null default now(),
  constraint hunt_party_invites_to_fk foreign key (to_user, to_slot) references public.player_state (user_id, slot) on delete cascade,
  constraint hunt_party_invites_from_fk foreign key (from_user, from_slot) references public.player_state (user_id, slot) on delete cascade
);
create unique index if not exists hunt_party_invites_one on public.hunt_party_invites (party_id, to_user, to_slot);
create index if not exists hunt_party_invites_to on public.hunt_party_invites (to_user, to_slot, created_at desc);
alter table public.hunt_party_invites enable row level security;
revoke all on public.hunt_party_invites from public, anon, authenticated, service_role;
comment on table public.hunt_party_invites is
  '2026-10-25 (lane S2). An invite to one character into an open party; lives while the party is open, an hour at most. '
  'Written by hr_hunt_party_invite; used up by accept / decline; read through the party_invites section.';

-- How long an invite stands (server policy, not game content).
create or replace function public.hr_party_invite_ttl()
returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '1 hour' $$;
revoke execute on function public.hr_party_invite_ttl() from public, anon, authenticated, service_role;

create or replace function public.hr_party_invites_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce((select jsonb_agg(x.j order by x.created_at desc, x.id) from (
    select i.id, i.created_at, jsonb_build_object('id', i.id, 'party', i.party_id, 'hunt', p.hunt_id,
                                                  'from', public.hr_character_name(i.from_user, i.from_slot)) as j
      from public.hunt_party_invites i join public.hunt_parties p on p.id = i.party_id and p.closed_at is null
     where i.to_user = p_user and i.to_slot = p_slot and i.created_at > now() - public.hr_party_invite_ttl()
     order by i.created_at desc, i.id limit 16) x), '[]'::jsonb)
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_party_invites_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('party_invites', 'hr_party_invites_view', '2026-10-25-party-invites.sql: invites to this character into open parties (an hour at most), newest first')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_hunt_party_invite(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_max_open constant int := 8;
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_pid uuid; v_p public.hunt_parties%rowtype; v_t record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_name is null or length(btrim(p_name)) not between 3 and 40 then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'bad_name')); end if;
  v_verb := 'hunt_party_invite:' || left(md5(lower(btrim(p_name))), 16);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_invite', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if (select count(*) from public.hunt_party_members m where m.party_id = v_pid) >= v_p.max_size then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size)); end if;
  select * into v_t from public.hr_character_by_name(p_name);
  if v_t.user_id is null then return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'no_such_name')); end if;
  if exists (select 1 from public.hunt_party_members m where m.party_id = v_pid and m.user_id = v_t.user_id and m.slot = v_t.slot) then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'already_member')); end if;
  -- Expired invites are pruned where they are next touched: this party's, and the invitee's.
  delete from public.hunt_party_invites i where i.created_at <= now() - public.hr_party_invite_ttl()
     and (i.party_id = v_pid or (i.to_user = v_t.user_id and i.to_slot = v_t.slot));
  if (select count(*) from public.hunt_party_invites i where i.party_id = v_pid
        and not (i.to_user = v_t.user_id and i.to_slot = v_t.slot)) >= c_max_open then
    return public.hr_note_rejection('hunt_party_invite', p_slot, jsonb_build_object('ok', false, 'error', 'too_many_invites', 'max', c_max_open)); end if;
  insert into public.hunt_party_invites as i (party_id, from_user, from_slot, to_user, to_slot, created_at)
    values (v_pid, v_uid, p_slot, v_t.user_id, v_t.slot, now())
    on conflict (party_id, to_user, to_slot) do update set from_user = excluded.from_user, from_slot = excluded.from_slot, created_at = now();
  v_r := jsonb_build_object('ok', true, 'invited', public.hr_character_name(v_t.user_id, v_t.slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_accept(p_slot int, p_invite uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_i public.hunt_party_invites%rowtype; v_j jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_invite is null then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  v_verb := 'hunt_party_accept:' || p_invite;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_accept', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select * into v_i from public.hunt_party_invites i where i.id = p_invite and i.to_user = v_uid and i.to_slot = p_slot;
  if not found then return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  if v_i.created_at <= now() - public.hr_party_invite_ttl()
     or not exists (select 1 from public.hunt_parties p where p.id = v_i.party_id and p.closed_at is null) then
    delete from public.hunt_party_invites where id = v_i.id;
    return public.hr_note_rejection('hunt_party_accept', p_slot, jsonb_build_object('ok', false, 'error', 'invite_expired')); end if;
  -- EXACTLY THE JOIN, under a key derived from this one (its own replay namespace).
  v_j := public.hr_hunt_party_join(p_slot, v_i.party_id, md5(p_idem::text || ':hunt_party_accept')::uuid);
  if coalesce(v_j->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_party_accept', p_slot, v_j); end if;
  delete from public.hunt_party_invites where to_user = v_uid and to_slot = p_slot and party_id = v_i.party_id;
  v_r := jsonb_build_object('ok', true, 'party', v_j->'party');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_hunt_party_decline(p_slot int, p_invite uuid, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_invite is null then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  v_verb := 'hunt_party_decline:' || p_invite;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_party_decline', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  delete from public.hunt_party_invites i where i.id = p_invite and i.to_user = v_uid and i.to_slot = p_slot;
  if not found then return public.hr_note_rejection('hunt_party_decline', p_slot, jsonb_build_object('ok', false, 'error', 'no_invite')); end if;
  v_r := jsonb_build_object('ok', true);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §4 GRANTS AND THE BASELINE ───────────────────────────────────────────────
revoke execute on function public.hr_hunt_party_start(int, uuid) from public;
revoke execute on function public.hr_hunt_party_start(int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_start(int, uuid) to authenticated;
revoke execute on function public.hr_hunt_restart(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_restart(int, uuid, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_restart(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from public;
revoke execute on function public.hr_hunt_party_invite(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_invite(int, text, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_accept(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_party_accept(int, uuid, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_accept(int, uuid, uuid) to authenticated;
revoke execute on function public.hr_hunt_party_decline(int, uuid, uuid) from public;
revoke execute on function public.hr_hunt_party_decline(int, uuid, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_party_decline(int, uuid, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
   and proname in ('hr_hunt_party_start', 'hr_hunt_restart', 'hr_hunt_party_invite', 'hr_hunt_party_accept', 'hr_hunt_party_decline');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_party_start', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): the leader enters every member of its own party, each with its own saved setup and bag, all or none (not_ready names the seats)'),
  ('hr_hunt_restart', 'p_slot integer, p_session uuid, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): hunt again - re-enter the latest ended session''s hunt with its own preset, falls, hours and bag (at most what is held)'),
  ('hr_hunt_party_invite', 'p_slot integer, p_name text, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): invite a character found by its name into this character''s open party; no user id crosses; moves no value'),
  ('hr_hunt_party_accept', 'p_slot integer, p_invite uuid, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): accept an invite to this character = hr_hunt_party_join under a derived key'),
  ('hr_hunt_party_decline', 'p_slot integer, p_invite uuid, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): forget an invite to this character');

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid[] := array['000000c0-0000-0000-0000-00005e300001', '000000c0-0000-0000-0000-00005e300002',
                               '000000c0-0000-0000-0000-00005e300003']::uuid[];
  v_hunt text := (select g.hunt_id from public.hr_hunt_grounds g order by g.hunt_id limit 1);
  v_food text := (select o.item_id from public.hr_shop_supply_offers o join public.hr_hunt_supplies s on s.item_id = o.item_id
                   where s.kind = 'heal' order by o.price limit 1);
  v jsonb; v_i int; v_pid uuid; v_sid uuid; v_sid0 uuid; v_inv uuid; v_role text; v_probe boolean := false;
begin
  begin
    if v_hunt is null then
      v_hunt := (select t.hunt_id from public.hr_hunt_travel t where not t.training order by t.hunt_id limit 1);
      insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats)
        values (v_hunt, 'probe_ground', 1, 1, 60000, 5);
      v_probe := true;
    end if;
    update public.hr_hunt_config set enabled = true where id;
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Party ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'party-invites §5 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u[v_i], 0, v_food, 10)
        on conflict (user_id, slot, item_id) do update set qty = 10;
    end loop;
    -- (a) THE CLIENT DOOR still enters (the one body): a solo hunt with a bag, and its refusals by name.
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 99, null, null, '000000c0-0000-4000-a000-00005e300101');
    if v->>'error' is distinct from 'bad_preset' then raise exception 'VERIFY(a): a bad preset answered %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, jsonb_build_array(jsonb_build_object('item', v_food, 'qty', 4)), 0, null, null, '000000c0-0000-4000-a000-00005e300102');
    if coalesce(v->>'ok', '') <> 'true' or (select qty from public.player_inventory where user_id = v_u[1] and item_id = v_food) <> 6 then
      raise exception 'VERIFY(a): the solo enter answered %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, null, '000000c0-0000-4000-a000-00005e300102');
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.hunt_sessions where user_id = v_u[1]) <> 1 then
      raise exception 'VERIFY(a): a replayed enter answered % or opened a second session', v; end if;
    -- (b) HUNT AGAIN: only the latest ended session; its bag at most what is held.
    select id into v_sid0 from public.hunt_sessions where user_id = v_u[1] and ended_at is null;
    v := public.hr_hunt_restart(0, v_sid0, '000000c0-0000-4000-a000-00005e300103');
    if v->>'error' is distinct from 'not_latest' then raise exception 'VERIFY(b): restarting an open hunt answered %', v; end if;
    perform public.hr_hunt_close(v_sid0, 'left', now(), true);
    -- One transaction has one now(): put the first hunt an hour back so "latest" is unambiguous.
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where id = v_sid0;
    update public.player_inventory set qty = 3 where user_id = v_u[1] and slot = 0 and item_id = v_food;
    v := public.hr_hunt_restart(0, v_sid0, '000000c0-0000-4000-a000-00005e300104');
    select id into v_sid from public.hunt_sessions where user_id = v_u[1] and ended_at is null;
    if coalesce(v->>'ok', '') <> 'true' or v_sid is null or v_sid = v_sid0
       or (select qty_loaded from public.hunt_bag where session_id = v_sid and item_id = v_food) <> 3
       or (select hunt_id from public.hunt_sessions where id = v_sid) <> v_hunt then
      raise exception 'VERIFY(b): hunt again answered % (bag %)', v, (select jsonb_agg(b) from public.hunt_bag b where b.session_id = v_sid); end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    v := public.hr_hunt_restart(0, v_sid0, '000000c0-0000-4000-a000-00005e300105');
    if v->>'error' is distinct from 'not_latest' then raise exception 'VERIFY(b): restarting an older session answered %', v; end if;
    -- (c) INVITES: by the name players see; to one character; accept = join; decline forgets.
    update public.player_inventory set qty = 10 where user_id = v_u[1] and slot = 0 and item_id = v_food;
    v := public.hr_hunt_party_create(0, v_hunt, '000000c0-0000-4000-a000-00005e300110');
    v_pid := (v->'party'->>'id')::uuid;
    if v_pid is null then raise exception 'VERIFY(c): create answered %', v; end if;
    v := public.hr_hunt_party_invite(0, 'Nobody Of That Name', '000000c0-0000-4000-a000-00005e300111');
    if v->>'error' is distinct from 'no_such_name' then raise exception 'VERIFY(c): an unknown name answered %', v; end if;
    v := public.hr_hunt_party_invite(0, 'probe party b', '000000c0-0000-4000-a000-00005e300112');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the invite answered %', v; end if;
    v := public.hr_hunt_party_invite(0, 'Probe Party C', '000000c0-0000-4000-a000-00005e300113');
    v := public.hr_state_of(v_u[2], 0)->'party_invites';
    if jsonb_array_length(v) <> 1 or (v->0->>'party')::uuid <> v_pid or v->0->>'from' <> 'Probe Party A' or v->0->>'hunt' <> v_hunt then
      raise exception 'VERIFY(c): the invitee''s section is %', v; end if;
    v_inv := (v->0->>'id')::uuid;
    perform set_config('request.jwt.claim.sub', v_u[3]::text, true);
    v := public.hr_hunt_party_accept(0, v_inv, '000000c0-0000-4000-a000-00005e300114');
    if v->>'error' is distinct from 'no_invite' then raise exception 'VERIFY(c): accepting another''s invite answered %', v; end if;
    v := public.hr_hunt_party_decline(0, (public.hr_state_of(v_u[3], 0)->'party_invites'->0->>'id')::uuid, '000000c0-0000-4000-a000-00005e300115');
    if coalesce(v->>'ok', '') <> 'true' or jsonb_array_length(public.hr_state_of(v_u[3], 0)->'party_invites') <> 0 then
      raise exception 'VERIFY(c): the decline answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u[2]::text, true);
    v := public.hr_hunt_party_accept(0, v_inv, '000000c0-0000-4000-a000-00005e300116');
    if coalesce(v->>'ok', '') <> 'true' or public.hr_hunt_party_of(v_u[2], 0) is distinct from v_pid
       or jsonb_array_length(public.hr_state_of(v_u[2], 0)->'party_invites') <> 0 then
      raise exception 'VERIFY(c): the accept answered %', v; end if;
    v := public.hr_hunt_party_accept(0, v_inv, '000000c0-0000-4000-a000-00005e300116');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): a replayed accept answered %', v; end if;
    -- (d) THE SHARED START: the leader only; all or none; each member's own bag.
    v := public.hr_restock_set(0, jsonb_build_object(v_food, 2), '000000c0-0000-4000-a000-00005e300120');
    v := public.hr_hunt_party_start(0, '000000c0-0000-4000-a000-00005e300121');
    if v->>'error' is distinct from 'not_leader' then raise exception 'VERIFY(d): a member''s start answered %', v; end if;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = v_u[2] and slot = 0;
    perform set_config('request.jwt.claim.sub', v_u[1]::text, true);
    v := public.hr_restock_set(0, jsonb_build_object(v_food, 4), '000000c0-0000-4000-a000-00005e300122');
    v := public.hr_hunt_party_start(0, '000000c0-0000-4000-a000-00005e300123');
    if v->>'error' is distinct from 'not_ready' or (v->'seats'->0->>'seat')::int <> 1 or v->'seats'->0->>'error' <> 'no_stamina'
       or exists (select 1 from public.hunt_sessions where user_id = any (v_u) and ended_at is null) then
      raise exception 'VERIFY(d): a start with an empty seat answered % (or entered someone)', v; end if;
    update public.player_state set stamina_ms = null, stamina_at = null where user_id = v_u[2] and slot = 0;
    v := public.hr_hunt_party_start(0, '000000c0-0000-4000-a000-00005e300124');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 2
       or (select count(*) from public.hunt_sessions where user_id = any (v_u) and ended_at is null and instance_id = v_pid) <> 2
       or (select b.qty_loaded from public.hunt_bag b join public.hunt_sessions h on h.id = b.session_id
            where h.user_id = v_u[1] and h.ended_at is null and b.item_id = v_food) <> 4
       or (select b.qty_loaded from public.hunt_bag b join public.hunt_sessions h on h.id = b.session_id
            where h.user_id = v_u[2] and h.ended_at is null and b.item_id = v_food) <> 2 then
      raise exception 'VERIFY(d): the shared start answered %', v; end if;
    v := public.hr_hunt_party_start(0, '000000c0-0000-4000-a000-00005e300125');
    if v->>'error' is distinct from 'already_hunting' then raise exception 'VERIFY(d): a second start answered %', v; end if;
    v := public.hr_hunt_restart(0, v_sid0, '000000c0-0000-4000-a000-00005e300126');
    if v->>'error' is distinct from 'party_hunt' then raise exception 'VERIFY(d): a member''s restart answered %', v; end if;
    raise exception using errcode = 'HR879', message = 'party-invites §5 complete - rolling back';
  exception when sqlstate 'HR879' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = any (v_u)) or exists (select 1 from public.hunt_party_invites where to_user = any (v_u))
     or exists (select 1 from public.hr_hunt_grounds where ground_id = 'probe_ground') then
    raise exception 'VERIFY(e): §5 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hunt_party_invites', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_saved_bag(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_invites_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_party_invite_ttl()', 'execute') then
      raise exception 'VERIFY(e): % reaches an invite table or internal', v_role; end if;
  end loop;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)'::regprocedure), 'hr_hunt_enter_for(') = 0 then
    raise exception 'VERIFY(e): hr_hunt_enter is not the wrapper over the one body'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'party-invites: invites by name, accept = join, the shared start all-or-none with each member''s own setup, hunt again; all green';
end $$;
