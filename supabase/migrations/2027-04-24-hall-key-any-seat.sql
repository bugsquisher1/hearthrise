-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-hall-key-any-seat.sql — ANY SEAT'S HALL KEY OPENS THE HALL (lane/c-krell-daily, backend-architect, 2026-11-15; the designer's
--   ruling 5 of PRIORITY_BOARD "2026-11-14 The Barrow March hand play, ruled": "a key dropping to seat 2 means a hand move every key").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §3. MONEY SURFACE (an item spent, now possibly ANOTHER PLAYER'S): ON THE EA SECURITY LIST (§3.7).
-- ORDER: after 2027-04-23-open-march-scaled-hunts-catalogue.generated.sql (the chain's tip); independent of 2027-04-25-boss-daily.sql (either order).
-- EDGE: none (no engine body reads the key). CLIENT: src/shell/windows/boss-hall-pane.js reads whose key the open takes from the `boss_halls`
-- section (2027-04-25-boss-daily.sql); until that ships the page still asks the leader to hold the key, which this verb still honours first.
--
-- ── WHY ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- hr_boss_hall_enter took the LEADER's key only. A Hall Key drops to whoever the split hands it to, so a party's key sat in seat 2's bag and
-- had to be walked to the leader through Storage (own heroes) or a trade (a friend's) before every fight.
--
-- ── THE CONTRACT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- hr_boss_hall_key_of(p_party uuid, p_user uuid, p_slot int, p_item text) -> jsonb   (internal; no client role executes it)
--   WHOSE KEY AN OPEN TAKES, the one rule the verb and the page's section both read, so the page can never name a key the press won't take:
--   a hero in no party (p_party null): its own, if it holds one. A party: the LEADER's own first (as before), else the first seat's, in seat
--   order, that holds one NOT UNDER ITS OWN LOCK (the bag's lock, player_item_rules.locked: "nothing spends a locked item" is that hero's own word, and it
--   is the only say a member has over a press it does not make). The leader's own key is taken locked or not: the press is the leader's own.
--   -> { user, slot, seat } (seat null alone), or null when no seat holds a key the open may take.
-- hr_boss_hall_enter(p_slot int, p_hall text, p_idem uuid) -> jsonb   authenticated, MONEY. RESTATED WHOLE (signature, grants and every refusal
--   unchanged). Still the leader's press only (`hall_leader`): the leader starts a party's hunts, here too. What moved:
--   · THE KEY is hr_boss_hall_key_of's seat. `no_key` now means no seat holds one the open may take.
--   · EXACTLY ONE KEY leaves exactly that seat's bag, journalled in the HOLDER's ledger (kind `shop`, intent boss_hall:<hall>, meta { reason
--     boss_hall, hall, key, party, hunt, key_seat, opened_by_seat }). The caller's OWN key goes through hr_apply as before ({ items: { key: -1 } }),
--     under a key derived from the press (md5('boss_hall:key:' || p_idem)). ANOTHER SEAT's key cannot: hr_apply acts for the signed-in caller
--     only (forbidden_impersonation, its own guard, kept). So this verb writes that one unit itself, the way hr_market_buy writes a seller's
--     side: under that hero's character lock, one unit, never below zero, its ledger row (item_id, qty -1), its version forward.
--   · THE RECEIPT is the caller's own player_intents row (user, p_idem), written by this verb with its full answer: a replay answers exactly
--     what the first press answered (before, a replay answered hr_apply's receipt, which had no `alone`).
--   ok: { ok, version (the caller's), entered, party, alone, hall, key, key_seat (the seat whose key was spent; null alone) }.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────────────────────────────────────────────────────
-- Locks, in the house order: the party row FOR UPDATE (every party verb's first), hr:hall:<uid>:<slot> (this verb's own), then EVERY SEAT THE
-- START MAY ENTER, its character, in seat order: the same seats in the same order as hr_hunt_party_start's own first loop (which this verb
-- calls next, so they are re-taken, never crossed). THE KEY IS READ UNDER THOSE LOCKS: no seat that can walk in can move its key (Storage,
-- the market, a sale: each takes the character lock) between the read and the spend. A seat already hunting is not locked (a settle may hold
-- it; waiting on it under the party row is the order the settle's trigger forbids), and needs no lock: the start refuses the whole open for
-- it (`party_hunting` / `not_ready`), so nothing is spent.
-- ONE KEY TOTAL, whatever races: two presses of the leader (two tabs, two keys) queue on the party row; the second finds every seat in the
-- room and the start refuses it, every seat rolled back out, no key spent. Two presses of ONE key: the second waits on the locks, reads the
-- first's receipt under them (2027-04-19-key-under-lock.sql) and answers it. A member's press is `hall_leader` before any lock but the party
-- row. If the spend is refused after all (the key gone since the read: a writer that takes no character lock), the block raises and every
-- seat rolls back out. A derived key hr_apply says was already decided opens nothing (rolled back): never a free fight.
--
-- ── EXPLOIT SURFACE DELTA ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- NEW: a leader's press can spend an item in ANOTHER ACCOUNT's bag. Bounded: only the hall's own key (the catalogue's hr_boss_halls.key_item,
-- never a client value), only one, only from a seat of the caller's own party that this same press marches into the fight the key buys (the
-- start is every seat or none), never from a seat that locked it, journalled in the holder's own ledger. Nothing crosses to the caller: no
-- item or gold moves between accounts. What a leader CAN do: spend a present member's unlocked key on a fight that member did not ask for
-- (the party model already lets a leader spend a present member's stamina and supplies the same way). The lock is the member's refusal; the
-- page says whose key it is before the press. Named for the EA Security review.
-- No client value names the holder: the server picks it. A forged hall is hall_unknown; a member cannot open; the hall has no other door.
--
-- ── COST (100x players) ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Per open: at most four primary-key probes of player_inventory and of player_item_rules, and one more player_intents row (the receipt).
-- No new table, no new column, nothing per tick.
--
-- REVERSIBILITY: re-apply hr_boss_hall_enter from 2027-04-20-boss-hall.sql §4 (§0 pins that image); drop hr_boss_hall_key_of. No player row to
-- restore: a spent key is a played fight. IDEMPOTENT: a second apply restates both bodies byte for byte and §3 rolls back its probes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_boss_halls') is null or to_regclass('public.player_item_rules') is null or to_regclass('public.hunt_party_members') is null then
    raise exception 'PRECONDITION: hr_boss_halls (2027-04-20-boss-hall-hunt-sessions-catalogue.generated.sql), player_item_rules and hunt_party_members first'; end if;
  if to_regprocedure('public.hr_boss_hall_enter(integer,text,uuid)') is null or to_regclass('public.player_inventory') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_hunt_party_start(integer,text,uuid)') is null
     or to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (2027-04-20-boss-hall.sql first)'; end if;
  -- THE PIN: hr_boss_hall_enter is restated below from 2027-04-20-boss-hall.sql's image (production's, tests/live-hash-drift.baseline.json
  -- measured 2026-11-14, equal to the replay's), or is this file's own (a second apply). A body moved since must be re-read first.
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_boss_hall_enter(integer,text,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('e372397f32ca0f051259cb1af5dd6a32', '0d1b1cd92450ca924a9653be67af13e4') then
    raise exception 'PIN: hr_boss_hall_enter is neither the image this file restates (e372397f32ca0f051259cb1af5dd6a32) nor its own (0d1b1cd92450ca924a9653be67af13e4): md5 % - another file moved it', v_md5;
  end if;
end $mig$;

-- ── §1 WHOSE KEY ─────────────────────────────────────────────────────────────
create or replace function public.hr_boss_hall_key_of(p_party uuid, p_user uuid, p_slot int, p_item text)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_r record;
begin
  -- HALL-KEY-ANY-SEAT (2027-04-24-hall-key-any-seat.sql): whose key an open takes. Read by hr_boss_hall_enter under the seats' locks and by
  -- the page's section, so the two can never disagree.
  if p_item is null then return null; end if;
  if p_party is null then
    if exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = p_item and i.qty >= 1) then
      return jsonb_build_object('user', p_user, 'slot', p_slot, 'seat', null); end if;
    return null;
  end if;
  -- A PARTY: the leader's own first, locked or not (the press is the leader's own); else the first seat's, in seat order, not under its own lock.
  select m.user_id, m.slot, m.seat into v_r
    from public.hunt_party_members m
    join public.hunt_parties p on p.id = m.party_id
    join public.player_inventory i on i.user_id = m.user_id and i.slot = m.slot and i.item_id = p_item and i.qty >= 1
   where m.party_id = p_party
     and ((m.user_id = p.leader_user and m.slot = p.leader_slot)
          -- the bag's lock, read as hr_item_locked reads it, inline: planned once with this query, never a call a row
          or not exists (select 1 from public.player_item_rules r
                          where r.user_id = m.user_id and r.slot = m.slot and r.item_id = p_item and r.locked))
   order by (m.user_id = p.leader_user and m.slot = p.leader_slot) desc, m.seat
   limit 1;
  if not found then return null; end if;
  return jsonb_build_object('user', v_r.user_id, 'slot', v_r.slot, 'seat', v_r.seat);
end $$;
revoke execute on function public.hr_boss_hall_key_of(uuid, uuid, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE VERB (restated whole: 2027-04-20-boss-hall.sql §4 with the seat's key; every refusal's code and order kept) ─
create or replace function public.hr_boss_hall_enter(p_slot int, p_hall text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'boss_hall';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_h public.hr_boss_halls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype;
  v_ver bigint; v_a jsonb; v_no jsonb; v_m record; v_key jsonb; v_ku uuid; v_ks int; v_out jsonb; v_meta jsonb; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_hall is null or p_hall !~ '^[a-z0-9_]{1,59}$' then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hall_unknown')); end if;
  select * into v_h from public.hr_boss_halls where hall_id = p_hall;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hall_unknown')); end if;
  v_verb := 'boss_hall:' || p_hall;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCKS: the party row (every party verb's first), then this hero's own hall key, which only this verb takes.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then select * into v_p from public.hunt_parties p where p.id = v_party for update; end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:hall:' || v_uid::text || ':' || p_slot::text, 0));
  -- A SECOND PRESS OF ONE KEY that waited on those locks answers the first one's decision (2027-04-19-key-under-lock.sql): the read above ran
  -- before the first press committed.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if v_party is not null and not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hall_leader', 'hall', p_hall)); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- HALL-KEY-ANY-SEAT (2027-04-24-hall-key-any-seat.sql): EVERY SEAT THE START MAY ENTER, its character, in seat order (hr_hunt_party_start's
  -- own first loop: the same seats, the same order, re-taken there), so the key is read UNDER the lock of every seat that can hold it and walk
  -- in. A seat already hunting is left to the start, which refuses the whole open for it.
  if v_party is not null then
    for v_m in select m.user_id, m.slot from public.hunt_party_members m
                where m.party_id = v_party
                  and not exists (select 1 from public.hunt_sessions h
                                   where h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null)
                order by m.seat loop
      perform public.hr_hunt_lock(v_m.user_id, v_m.slot);
    end loop;
  end if;
  -- THE KEY: the leader's own first, else the first seat's that holds one it has not locked (hr_boss_hall_key_of); alone, the hero's own.
  v_key := public.hr_boss_hall_key_of(v_party, v_uid, p_slot, v_h.key_item);
  if v_key is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_key', 'hall', p_hall, 'key', v_h.key_item)); end if;
  v_ku := (v_key->>'user')::uuid; v_ks := (v_key->>'slot')::int;
  -- EVERY SEAT OR NONE, AND THE KEY WITH THEM: a start that can't spend the key rolls every seat back out.
  begin
    perform set_config('hr.boss_hall', v_h.hunt_id, true);
    if v_party is null then
      -- A hero in no party opens the room for ONE seat, through its own enter (the locks, the one predicate, the play cap), on what a party
      -- Start gives a seat: its saved bag, its set, its last hours limit (hr_boss_call's alone path, 2027-04-05-call-out-alone.sql).
      v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_h.hunt_id, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot),
                                      (select s.hours_limit from public.hunt_sessions s where s.user_id = v_uid and s.slot = p_slot order by s.entered_at desc, s.id limit 1));
      if coalesce(v_r->>'ok', 'false') = 'true' then v_r := jsonb_build_object('ok', true, 'entered', 1, 'party', null); end if;
    else
      -- Its own key: this one is the press's, and a replay of the press must replay the start (hr_hunt_party_start journals what it was asked under).
      v_r := public.hr_hunt_party_start(p_slot, v_h.hunt_id, md5('boss_hall:start:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.boss_hall', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      v_no := v_r; raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
    -- ONE KEY, FROM THE SEAT THAT HOLDS IT, journalled in that hero's own ledger.
    v_meta := jsonb_build_object('reason', 'boss_hall', 'hall', p_hall, 'key', v_h.key_item, 'party', v_party, 'hunt', v_h.hunt_id,
                                 'key_seat', v_key->'seat',
                                 'opened_by_seat', (select m.seat from public.hunt_party_members m
                                                     where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot));
    if v_ku = v_uid and v_ks = p_slot then
      -- THE CALLER'S OWN: hr_apply, as before, under a key derived from the press.
      select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
      v_a := public.hr_apply(v_uid, p_slot, v_ver, md5('boss_hall:key:' || p_idem::text)::uuid, jsonb_build_object('items', jsonb_build_object(v_h.key_item, -1),
               'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb, 'meta', v_meta)));
      if coalesce(v_a->>'ok', 'false') <> 'true' then
        v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
      -- A KEY THIS CALL DID NOT DECIDE (never reached while the read under the locks holds) opens nothing: its seats roll back out.
      if coalesce(v_a->>'replayed', 'false') = 'true' then
        v_no := v_a; raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
    else
      -- ANOTHER SEAT'S: hr_apply acts for the signed-in caller only (forbidden_impersonation), so the one unit is written here, the way
      -- hr_market_buy writes a seller's side: under that hero's character lock (taken above, in seat order), exactly one, never below zero.
      delete from public.player_inventory where user_id = v_ku and slot = v_ks and item_id = v_h.key_item and qty = 1;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        update public.player_inventory set qty = qty - 1 where user_id = v_ku and slot = v_ks and item_id = v_h.key_item and qty > 1;
        get diagnostics v_n = row_count;
      end if;
      if v_n <> 1 then
        v_no := jsonb_build_object('ok', false, 'error', 'no_key', 'hall', p_hall, 'key', v_h.key_item);
        raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
      insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, meta)
        values (v_ku, v_ks, 'shop', v_verb, v_h.key_item, -1, 0, 0, 0, 0, 0, v_meta);
      update public.player_state set version = version + 1, updated_at = now() where user_id = v_ku and slot = v_ks;
    end if;
    -- THE RECEIPT, the caller's own: a replay of this press answers exactly this.
    v_out := jsonb_build_object('ok', true, 'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                                'entered', v_r->'entered', 'party', v_r->'party', 'alone', v_party is null,
                                'hall', p_hall, 'key', v_h.key_item, 'key_seat', v_key->'seat');
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_out, now()) on conflict (user_id, intent_id) do nothing;
  exception when sqlstate 'HR879' then
    perform set_config('hr.boss_hall', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return v_out;
end $$;
revoke execute on function public.hr_boss_hall_enter(int, text, uuid) from public;
revoke execute on function public.hr_boss_hall_enter(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_boss_hall_enter(int, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_boss_hall_enter';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_boss_hall_enter', 'p_slot integer, p_hall text, p_idem uuid', 'authenticated',
   'added 2027-04-20 (lane/b-barrow-boss-room), restated 2027-04-24 (lane/c-krell-daily): MONEY (an item spent) - a hero alone, or a party''s leader with every member, spends ONE of the hall''s keys (the leader''s own first, else the first seat''s that holds one it has not locked) and enters its room; the key read under every seat''s lock');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The probe hall is 2027-04-20-boss-hall.sql §6's: the Mill Cellar's ground catalogue rows copied to mill_cellar_hall, opened by a Goblin Totem.
do $$
declare
  c_a constant uuid := '000000d9-0000-4000-a000-00007f0c0b01';   -- a hero in no party
  c_b constant uuid := '000000d9-0000-4000-a000-00007f0c0b02';   -- a party's leader
  c_c constant uuid := '000000d9-0000-4000-a000-00007f0c0b03';   -- a seated member
  c_room constant text := 'mill_cellar_hall';
  c_key constant text := 'goblin_totem';
  k   constant text := '000000d9-0000-4000-b000-0000';
  v jsonb; v2 jsonb; v_pid uuid; v_s text; v_boss text;
  keys_b bigint; keys_c bigint;
begin
  -- (a) the shape: a signed-in client opens a hall, nobody else; whose-key is nobody's to call; hygiene STRICT is green.
  if has_function_privilege('anon', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute') then
    raise exception 'hall-key §3(a): the grants on hr_boss_hall_enter are wrong'; end if;
  if has_function_privilege('authenticated', 'public.hr_boss_hall_key_of(uuid,uuid,integer,text)', 'execute')
     or has_function_privilege('anon', 'public.hr_boss_hall_key_of(uuid,uuid,integer,text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_boss_hall_key_of(uuid,uuid,integer,text)', 'execute') then
    raise exception 'hall-key §3(a): a client can execute hr_boss_hall_key_of'; end if;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_boss_hall_enter(integer,text,uuid)'::regprocedure), 'hr_boss_hall_key_of') = 0 then
    raise exception 'hall-key §3(a): the verb does not read hr_boss_hall_key_of'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    update public.hr_hunt_config set enabled = true where id;
    foreach v_s in array array['hr_hunts', 'hr_hunt_travel', 'hr_hunt_grounds', 'hr_hunt_ground_spawns', 'hr_ground_tiers'] loop
      continue when to_regclass('public.' || v_s) is null;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(r) || jsonb_build_object(''hunt_id'', %2$L)'
                     || ' || case when to_jsonb(r) ? ''ground_id'' then jsonb_build_object(''ground_id'', %2$L) else ''{}''::jsonb end)).* from public.%1$I r where r.hunt_id = ''mill_cellar''',
                     v_s, c_room);
    end loop;
    if not exists (select 1 from public.hr_hunt_grounds where hunt_id = c_room) or not exists (select 1 from public.hr_hunt_ground_spawns where hunt_id = c_room) then
      raise exception 'hall-key §3-harness: the probe hall was not copied'; end if;
    select s.monster_id into v_boss from public.hr_hunt_ground_spawns s where s.hunt_id = c_room order by s.monster_id limit 1;
    insert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values ('mill_cellar', c_room, v_boss, c_key, 600000);
    foreach v_s in array array[c_a::text, c_b::text, c_c::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'hall-key §3 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'hall-key §3-harness: hr_create_character refused: %', v; end if;
      delete from public.hr_rate_counters where user_id = v_s::uuid;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) ALONE, as before: no key is no_key; with two, ONE is spent, journalled in the hero's own ledger; a replay answers the SAME receipt
    --     (its `alone` and `key_seat` with it) and spends nothing.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d01')::uuid);
    if v->>'error' is distinct from 'no_key' then raise exception 'hall-key §3(b): no key answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_a, 0, c_key, 2) on conflict (user_id, slot, item_id) do update set qty = 2;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d02')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 1 or v->>'alone' <> 'true' or jsonb_typeof(v->'key_seat') <> 'null' then
      raise exception 'hall-key §3(b): the enter answered %', v; end if;
    if (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_hall:mill_cellar' and (meta->>'reason') = 'boss_hall') <> 1 then
      raise exception 'hall-key §3(b): not one key spent and one ledger row'; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v2 := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d02')::uuid);
    if v2 is distinct from v or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and intent like 'boss\_hall:%') <> 1 then
      raise exception 'hall-key §3(b): a replay answered % (the first: %) or spent again', v2, v; end if;

    -- (c) ★ A PARTY WHOSE ONLY KEY IS THE MEMBER'S: the member's press is still hall_leader; the LEADER's press takes the MEMBER's key, one,
    --     journalled in the member's ledger and not the leader's, and both heroes walk in.
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_b, 0);
    perform public.hr_party_seat_into(v_pid, c_c, 0);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_c, 0, c_key, 2) on conflict (user_id, slot, item_id) do update set qty = 2;
    if public.hr_boss_hall_key_of(v_pid, c_b, 0, c_key)->>'user' is distinct from c_c::text then
      raise exception 'hall-key §3(c): whose-key reads %', public.hr_boss_hall_key_of(v_pid, c_b, 0, c_key); end if;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d03')::uuid);
    if v->>'error' is distinct from 'hall_leader' then raise exception 'hall-key §3(c): a member answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'alone' <> 'false'
       or (v->>'key_seat')::int is distinct from (select m.seat from public.hunt_party_members m where m.party_id = v_pid and m.user_id = c_c and m.slot = 0)::int then
      raise exception 'hall-key §3(c): the leader answered %', v; end if;
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and hunt_id = c_room and ended_at is null) <> 2 then raise exception 'hall-key §3(c): the room does not hold two heroes'; end if;
    if (select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key) <> 1
       or (select count(*) from public.player_ledger where user_id = c_c and kind = 'shop' and intent = 'boss_hall:mill_cellar' and (meta->>'reason') = 'boss_hall') <> 1
       or exists (select 1 from public.player_ledger where user_id = c_b and intent like 'boss\_hall:%') then
      raise exception 'hall-key §3(c): the member''s key was not the one spent, once, in the member''s ledger'; end if;
    -- (c2) ★ ONE KEY TOTAL: a second press under another key finds the party in the room: refused, no second key from anyone; and a replay of
    --      the first press answers its receipt and spends nothing.
    delete from public.hr_rate_counters where user_id = c_b;
    v2 := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d05')::uuid);
    if coalesce(v2->>'ok', '') = 'true' or (select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key) <> 1 then
      raise exception 'hall-key §3(c2): a second press answered % and spent a key', v2; end if;
    delete from public.hr_rate_counters where user_id = c_b;
    v2 := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d04')::uuid);
    if v2 is distinct from v or (select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key) <> 1 then
      raise exception 'hall-key §3(c2): a replay answered % (the first: %) or spent again', v2, v; end if;
    if current_setting('hr.boss_hall', true) <> '' then raise exception 'hall-key §3(c2): the door stayed open'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;

    -- (d) ★ BOTH HOLD ONE: the LEADER's own goes first; the member's stays.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_b, 0, c_key, 1) on conflict (user_id, slot, item_id) do update set qty = 1;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    delete from public.hr_rate_counters where user_id = c_b;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d06')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hall-key §3(d): the leader answered %', v; end if;
    select coalesce((select qty from public.player_inventory where user_id = c_b and slot = 0 and item_id = c_key), 0),
           coalesce((select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key), 0) into keys_b, keys_c;
    if keys_b <> 0 or keys_c <> 1 then raise exception 'hall-key §3(d): the leader holds % and the member % (want 0 and 1)', keys_b, keys_c; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;

    -- (e) ★ A MEMBER'S LOCKED KEY IS NEVER TAKEN: the leader holds none, the member's one is under its lock: no_key, nobody walks in, nothing moves.
    insert into public.player_item_rules (user_id, slot, item_id, locked) values (c_c, 0, c_key, true)
      on conflict (user_id, slot, item_id) do update set locked = true;
    if public.hr_boss_hall_key_of(v_pid, c_b, 0, c_key) is not null then raise exception 'hall-key §3(e): whose-key names a locked key'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    delete from public.hr_rate_counters where user_id = c_b;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d07')::uuid);
    if v->>'error' is distinct from 'no_key' then raise exception 'hall-key §3(e): a locked key answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where instance_id = v_pid and ended_at is null)
       or (select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key) <> 1 then
      raise exception 'hall-key §3(e): a refused open moved something'; end if;
    -- ...and the leader's OWN locked key still opens it: the press is the leader's own.
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_b, 0, c_key, 1) on conflict (user_id, slot, item_id) do update set qty = 1;
    insert into public.player_item_rules (user_id, slot, item_id, locked) values (c_b, 0, c_key, true)
      on conflict (user_id, slot, item_id) do update set locked = true;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    delete from public.hr_rate_counters where user_id = c_b;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000d08')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.player_inventory where user_id = c_b and slot = 0 and item_id = c_key and qty > 0) then
      raise exception 'hall-key §3(e): the leader''s own locked key answered %', v; end if;
    raise exception using errcode = 'HRL23', message = 'hall-key §3 complete - rolling back';
  exception when sqlstate 'HRL23' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) or exists (select 1 from public.hr_boss_halls where hunt_id = c_room)
     or exists (select 1 from public.player_intents where user_id in (c_a, c_b, c_c)) then raise exception 'hall-key §3: LEAKED a probe row'; end if;
  raise notice 'hall-key: any seat''s key opens it, the leader''s first, a locked one never, one key a press; all green';
end $$;
