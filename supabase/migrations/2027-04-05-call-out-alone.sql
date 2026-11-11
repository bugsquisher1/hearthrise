-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-05-call-out-alone.sql — A HERO ALONE MAY CALL OUT A BOSS: A WARNING, NOT A LOCK (lane/c-call-out-and-bear,
--   backend-architect, 2026-11-10; the designer's ruling 2, PRIORITY_BOARD "2026-11-10 Rulings"; Tyler 2026-11-04 "big risks
--   should include warnings but should allow the player to take them", 2026-11-08 the Rat King "is a warning not a gate").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (one file, never inside begin/commit). Pre-EA: applies on its passing §5.
-- MONEY (a gold sink, the same fee): ON THE EA SECURITY LIST with the rest of the call (§3.7).
-- ORDER: after 2027-03-31-watched-settle-cost.sql, and BEFORE 2027-04-05-call-out-and-bear-hunt-sessions-catalogue.generated.sql:
--   that catalogue drops hr_boss_calls.party_min, which the live quote reads until this file restates it. No edge order (the engine
--   never reads the quote). CLIENT: the pane's lone warning line reads the quote's new `alone`; an old client shows no extra line,
--   and its press works alone too (the server is the only judge of who may call).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_boss_call_quote(user, slot, call) RESTATED. No party size: a hero in no party is quoted. Refusals, in order: call_leader (in a
--   party and not its leader), call_limit (3 a UTC day an account, unchanged). `call_party` is never answered again. New keys:
--   `seats` the heroes the call takes into the room (1 for a hero in no party, else the party's members), `alone` (seats = 1: the
--   pane's one extra warning line). `party_min` is gone. The price, the dial and the event are the live-events body's, unchanged.
-- hr_boss_call(slot, call, price, key) RESTATED WHOLE (2027-03-12-boss-call.sql with 2027-03-22-live-events.sql's two splices; the
--   patch chain collapses here). In a party: unchanged (hr_hunt_party_start under the room's GUC, every member or none). In NO party:
--   ONE seat, through hr_hunt_enter_for, the start a lone hero's own enter runs (its locks, the one predicate, the play cap), with the
--   inputs a party Start gives a seat (its saved bag, its active set, its last hours limit), so the two doors differ only in the
--   seat count. Then the same ONE hr_apply on the caller's key: the same fee, the same shop row, the same 3 a day. Answer: entered 1,
--   party null. A start that is refused (already hunting, no stamina, the play cap) charges nothing and opens nothing.
-- hr_boss_call_felled RESTATED: a fight whose room held one hero posts "called out {boss} alone and brought him down."; a party's
--   line is unchanged. Still once a fight, still the Hearth's shape (the name stamped, the body the server's).
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- The lone path's lock order is the account key hr:boss:<uid>, then (inside hr_hunt_enter_for) the character, its bag's stock rows,
--   the account's and network's play locks. Only this verb takes hr:boss, and every other path takes the character before the play
--   locks, so no new cycle: a concurrent enter on the same hero holds the character, the call waits, then the predicate refuses it
--   (already hunting) and nothing is charged. Two presses on two heroes of one account serialise on hr:boss and the second counts
--   the first. A hero who joins a party between the two reads is judged by hr_hunt_enter_for as a seat (party_hunt_mismatch): refused,
--   uncharged. The key: hr_intent_replay first, the charge's hr_apply journals it, so a replay answers once and charges once.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- A called room pays no XP, coin or drops on any route (hr_boss_call_pays, the kill bounds, hunt-rewards.js), so a lone call can only
-- cost its caller gold. No grant moves: the verb stays authenticated-only, the quote and the trigger owner-only. No client value is
-- trusted that was not before: the price is still only compared with the server's quote.
--
-- COST: none added (one count the quote already did). REVERSIBLE: restate the three bodies from their pre-images (§0's md5s:
-- 2027-03-22-live-events.sql's quote, 2027-03-12-boss-call.sql's verb with live-events' two splices, 2027-03-12's trigger) after
-- re-adding hr_boss_calls.party_min. No table, no row, no grant.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is exactly the image this file was written against, or this file's own (a second apply), by the md5 of its source
-- with carriage returns removed: anything else means another file moved it, and this one refuses rather than undo that.
do $mig$
declare v_r record; v_m text;
begin
  if to_regclass('public.hr_boss_calls') is null or to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)') is null or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_live_fee_of(uuid,text,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: Call out (2027-03-12), live events (2027-03-22) and the per-seat start (hr_hunt_enter_for) first'; end if;
  for v_r in select * from (values
    ('public.hr_boss_call_quote(uuid,integer,text)', '65e568c0350948374dd12907510d0190', 'ecde8394ba99405baed5ac983c997c34'),
    ('public.hr_boss_call(integer,text,bigint,uuid)', '3eaad4b9c40d1cd6cbc7d8dfdf3797f8', 'd5fc3843302fdc73c1b1295d9f99223b'),
    ('public.hr_boss_call_felled()', '5a4618c0cae7d4b44df2924607e169fd', '9686c071c4f085e2e57cc61de754adad')) t(fn, pre, own) loop
    select md5(replace(p.prosrc, chr(13), '')) into v_m from pg_proc p where p.oid = v_r.fn::regprocedure;
    if v_m is distinct from v_r.pre and v_m is distinct from v_r.own then
      raise exception 'PIN: % is neither its expected image (%) nor this file''s (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.own, v_m; end if;
  end loop;
end $mig$;

-- ── §1 THE QUOTE ─────────────────────────────────────────────────────────────
create or replace function public.hr_boss_call_quote(p_user uuid, p_slot int, p_call text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r public.hr_boss_calls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype; v_seats int := 1; v_used int; v_why text; v_fee jsonb; v_price bigint;
begin
  -- LIVE-EVENTS (2027-03-22-live-events.sql): the price is the row's fee x the live fee dial (Open Halls: 0) at the server's instant, rounded up.
  -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): no party size. A hero in no party is quoted and calls alone (seats 1);
  -- in a party only its leader calls. `alone` is what the pane's warning reads.
  select * into r from public.hr_boss_calls where call_id = p_call;
  if not found then return null; end if;
  v_used := (select count(*) from public.player_ledger l
              where l.user_id = p_user and l.kind = 'shop' and l.intent like 'boss\_call:%' and l.at >= public.hr_utc_day_start(now()))::int;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party;
    v_seats := greatest(1, (select count(*) from public.hunt_party_members m where m.party_id = v_party)::int);
  end if;
  v_why := case when v_party is not null and not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader'
                when v_used >= r.per_day then 'call_limit' end;
  v_fee := public.hr_live_fee_of(p_user, r.call_id, now());
  v_price := (r.fee::bigint * (v_fee->>'pm')::int + 999) / 1000;
  return jsonb_build_object('call', r.call_id, 'available', v_why is null, 'why', v_why, 'price', v_price,
                            'used', v_used, 'per_day', r.per_day, 'left', greatest(0, r.per_day - v_used), 'seats', v_seats, 'alone', v_seats = 1,
                            'fee', r.fee, 'fee_pm', (v_fee->>'pm')::int, 'event', v_fee->'event');
end $$;
revoke execute on function public.hr_boss_call_quote(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_boss_call(p_slot int, p_call text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'boss_call';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_c public.hr_boss_calls%rowtype; v_party uuid; v_ver bigint; v_a jsonb; v_no jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- LIVE-EVENTS (2027-03-22-live-events.sql): an Open Halls call is free (price 0); the quote below still decides every price.
  if p_price is null or p_price < 0 or p_price > 1000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  select * into v_c from public.hr_boss_calls where call_id = p_call;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'call_unknown')); end if;
  v_verb := 'boss_call:' || p_call || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCKS: the party row (every party verb's first), then this account's key, so a second press on any of its heroes waits and counts this one. No other path takes this key.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then perform 1 from public.hunt_parties p where p.id = v_party for update; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:boss:' || v_uid::text, 0));
  v_q := public.hr_boss_call_quote(v_uid, p_slot, p_call);
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'boss_call', v_q)); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'boss_call', v_q)); end if;
  -- EVERY MEMBER OR NONE, AND THE CHARGE WITH THEM: a start that can't pay rolls every seat back out.
  begin
    perform set_config('hr.boss_call', v_c.hunt_id, true);
    if v_party is null then
      -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): a hero in no party opens the room for ONE seat, through the start its own enter
      -- runs (the locks, the one predicate, the play cap), on what a party Start gives a seat: its saved bag, its set, its last hours limit.
      v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_c.hunt_id, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot),
                                      (select h.hours_limit from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot order by h.entered_at desc, h.id limit 1));
      if coalesce(v_r->>'ok', 'false') = 'true' then v_r := jsonb_build_object('ok', true, 'entered', 1, 'party', null); end if;
    else
      -- Its own key: this one is the charge's, and a replay of it must answer the charge (hr_hunt_party_start journals what it was asked under).
      v_r := public.hr_hunt_party_start(p_slot, v_c.hunt_id, md5('boss_call:start:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.boss_call', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      v_no := v_r; raise exception using errcode = 'HR879', message = 'call_refused'; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    -- LIVE-EVENTS: a free call moves no gold and still journals its row (the day's 3 count it), with the dial and the event that freed it.
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, (case when p_price > 0 then jsonb_build_object('gold', -p_price) else '{}'::jsonb end) || jsonb_build_object(
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_call', 'call', p_call, 'n', (v_q->>'used')::int + 1, 'party', v_party, 'hunt', v_c.hunt_id,
                                                                      'fee_pm', (v_q->>'fee_pm')::int, 'event', v_q->'event'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'call_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.boss_call', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'entered', v_r->'entered', 'party', v_r->'party',
                            'boss_call', public.hr_boss_call_quote(v_uid, p_slot, p_call));
end $$;
revoke execute on function public.hr_boss_call(int, text, bigint, uuid) from public;
revoke execute on function public.hr_boss_call(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_boss_call(int, text, bigint, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'added 2027-03-12 (lane/c-boss-call): MONEY (a gold sink) - the caller pays the server''s fee and enters the called room, a hero in no party alone or a party''s leader with every member (2027-04-05-call-out-alone.sql); refuses quote_changed; 3 a UTC day an account'
 where proname = 'hr_boss_call' and grantee = 'authenticated';

-- ── §3 THE SYSTEM LINE ───────────────────────────────────────────────────────
create or replace function public.hr_boss_call_felled()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_call public.hr_boss_calls%rowtype; v_boss text;
begin
  select * into v_call from public.hr_boss_calls c where c.hunt_id = new.hunt_id;
  if not found or coalesce((select ps.presence_quiet from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot), false)
     or exists (select 1 from public.hunt_sessions h where h.instance_id = new.instance_id and h.id <> new.id and h.end_reason = 'boss_felled' and h.ended_at = new.ended_at) then return null; end if;
  v_boss := case v_call.call_id when 'rat_king' then 'the Rat King' when 'chief_coppercap' then 'Chief Coppercap' else 'a boss' end;
  -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): a room that held one hero says so; a party's line is unchanged.
  insert into public.chat_messages (channel, from_id, from_name, from_slot, body)
    values ('system', new.user_id, 'Adventurer', new.slot,
            case when exists (select 1 from public.hunt_sessions h where h.instance_id = new.instance_id and h.id <> new.id)
                 then 'and party called out ' || v_boss || ' and brought him down.'
                 else 'called out ' || v_boss || ' alone and brought him down.' end);
  return null;
end $$;
revoke execute on function public.hr_boss_call_felled() from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_a constant uuid := '000000d7-0000-4000-a000-00007f0c0a01';   -- a hero in no party
  c_b constant uuid := '000000d7-0000-4000-a000-00007f0c0a02';   -- a party's leader
  c_c constant uuid := '000000d7-0000-4000-a000-00007f0c0a03';   -- a seated member
  k   constant text := '000000d7-0000-4000-b000-0000';
  v jsonb; v_q jsonb; v_pid uuid; v_s text; v_fee bigint; v_hunt text; v_inst uuid;
begin
  -- (a) the shape: a signed-in client calls, nobody else; the quote and the trigger are owner-only; hygiene STRICT is green;
  --     no body reads party_min, and the three carry this file's marker.
  if has_function_privilege('anon', 'public.hr_boss_call(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_boss_call(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_boss_call(integer,text,bigint,uuid)', 'execute') then
    raise exception 'call-out-alone §4(a): the grants on hr_boss_call are wrong'; end if;
  foreach v_s in array array['public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_call_felled()'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then raise exception 'call-out-alone §4(a): a client can execute %', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_call(integer,text,bigint,uuid)', 'public.hr_boss_call_felled()'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'CALL-OUT-ALONE') = 0 then raise exception 'call-out-alone §4(a): % has no marker', v_s; end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%party\_min%' and p.proname like 'hr\_boss\_%') then
    raise exception 'call-out-alone §4(a): a boss-call body still reads party_min'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    update public.hr_hunt_config set enabled = true where id;
    select c.fee, c.hunt_id into v_fee, v_hunt from public.hr_boss_calls c where c.call_id = 'rat_king';
    foreach v_s in array array[c_a::text, c_b::text, c_c::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'call-out-alone §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'call-out-alone §4-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id in (c_a, c_b, c_c);
    -- (b) ★ A HERO IN NO PARTY IS QUOTED, alone, at the fee, with no party size in the answer.
    v_q := public.hr_boss_call_quote(c_a, 0, 'rat_king');
    if coalesce((v_q->>'available')::boolean, false) is not true or (v_q->>'alone')::boolean is not true or (v_q->>'seats')::int <> 1
       or (v_q->>'price')::bigint <> v_fee or v_q ? 'party_min' or v_q->>'why' is not null then
      raise exception 'call-out-alone §4(b): a hero alone is quoted %', v_q; end if;
    -- (c) a stale price is quote_changed, charges nothing and opens nothing.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee + 1, (k || '00000c01')::uuid);
    if v->>'error' is distinct from 'quote_changed' or (select gold from public.account_wallet where user_id = c_a) <> 100000
       or exists (select 1 from public.hunt_sessions where user_id = c_a) then raise exception 'call-out-alone §4(c): a stale price answered %', v; end if;
    -- (d) ★ THE LONE CALL: the fee, one shop row, ONE seat in the room on an instance of its own and no party; a replay charges nothing.
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c02')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 1 or v->'party' <> 'null'::jsonb then raise exception 'call-out-alone §4(d): the lone call answered %', v; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee then raise exception 'call-out-alone §4(d): the purse reads %', (select gold from public.account_wallet where user_id = c_a); end if;
    select h.instance_id into v_inst from public.hunt_sessions h where h.user_id = c_a and h.slot = 0 and h.hunt_id = v_hunt and h.ended_at is null;
    if v_inst is null or (select count(*) from public.hunt_sessions h where h.instance_id = v_inst) <> 1 or exists (select 1 from public.hunt_parties p where p.id = v_inst) then
      raise exception 'call-out-alone §4(d): the room is not one hero''s'; end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_call:rat_king:' || v_fee) <> 1 then raise exception 'call-out-alone §4(d): not one ledger row'; end if;
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c02')::uuid);
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent like 'boss\_call:%') <> 1 then raise exception 'call-out-alone §4(d): a replay charged again: %', v; end if;
    -- (e) a second call from inside the room is refused by the start, uncharged.
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c03')::uuid);
    if coalesce(v->>'ok', '') = 'true' or (select gold from public.account_wallet where user_id = c_a) <> 100000 - v_fee then raise exception 'call-out-alone §4(e): a hero in the room called again: %', v; end if;
    -- (f) ★ HE FALLS TO ONE HERO: one System line, and it says alone.
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.instance_id = v_inst and h.ended_at is null;
    if (select count(*) from public.chat_messages m where m.channel = 'system' and m.from_id = c_a and m.body = 'called out the Rat King alone and brought him down.') <> 1 then
      raise exception 'call-out-alone §4(f): the lone fight posted %', (select jsonb_agg(m.body) from public.chat_messages m where m.channel = 'system' and m.from_id = c_a); end if;
    -- (g) A SHORT PURSE ALONE: refused, charged nothing, nobody in the room, the door shut behind it.
    update public.account_wallet set gold = v_fee - 1 where user_id = c_a;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c04')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.account_wallet where user_id = c_a) <> v_fee - 1
       or exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null) or current_setting('hr.boss_call', true) <> '' then
      raise exception 'call-out-alone §4(g): a short purse alone answered %', v; end if;
    -- (h) IN A PARTY ONLY THE LEADER CALLS; a party of one is a lone room.
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_b, 0);
    v_q := public.hr_boss_call_quote(c_b, 0, 'rat_king');
    if coalesce((v_q->>'available')::boolean, false) is not true or (v_q->>'alone')::boolean is not true then raise exception 'call-out-alone §4(h): a party of one is quoted %', v_q; end if;
    perform public.hr_party_seat_into(v_pid, c_c, 0);
    v_q := public.hr_boss_call_quote(c_b, 0, 'rat_king');
    if (v_q->>'alone')::boolean is not false or (v_q->>'seats')::int <> 2 then raise exception 'call-out-alone §4(h): a party of two is quoted %', v_q; end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c05')::uuid);
    if v->>'error' is distinct from 'call_leader' or (select gold from public.account_wallet where user_id = c_c) <> 100000 then raise exception 'call-out-alone §4(h): a member answered %', v; end if;
    -- (i) THE LIMIT IS THE SAME ALONE: today's rows on any of this account's heroes count.
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id = c_a;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      select c_a, 1, 'shop', 'boss_call:rat_king:' || v_fee, 0, '{"reason":"§4 probe"}'::jsonb from generate_series(1, 2);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, 'rat_king', v_fee, (k || '00000c06')::uuid);
    if v->>'error' is distinct from 'call_limit' then raise exception 'call-out-alone §4(i): the fourth call alone answered %', v; end if;
    raise exception using errcode = 'HRL22', message = 'call-out-alone §4 complete - rolling back';
  exception when sqlstate 'HRL22' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) then raise exception 'call-out-alone §4: LEAKED a probe row'; end if;
  raise notice 'call-out-alone: a hero alone is quoted and calls one seat, a member is refused, the fee and the limit unchanged; all green';
end $$;
