-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-20-boss-hall.sql — A KEYED HALL: A HALL KEY OPENS A BOSS ROOM THAT PAYS (lane/b-barrow-boss-room, systems-engineer, 2026-11-13;
--   the Krell's Hold design's engine piece 5, PRIORITY_BOARD "2026-11-10 Krell's Hold" §3; src/data/boss-halls.js).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §6. MONEY SURFACE (an item spent to open a fight that pays XP and drops): ON THE EA SECURITY LIST (§3.7).
-- ORDER: right after 2027-04-20-boss-hall-hunt-sessions-catalogue.generated.sql (hr_boss_halls; §0 refuses without it), after 2027-04-19-key-under-lock.sql.
-- EDGE: the hr-accrue that plays a hall (src/core/hunt/boss-room.js, boss-phases.js, accrual.js) may land on either side: the data holds no hall, so no
-- room exists to open until a ground pack carries one. CLIENT: src/session/boss-intents.js openHall, src/shell/windows/boss-hall-pane.js, after this applies.
--
-- ── WHAT A HALL IS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A called room's fight (2027-03-12-boss-call.sql: one door, one fight, a limit, the boss's kill ends it) behind a KEY instead of a fee, and it PAYS
-- like any ground. The called room's money line (hr_boss_call_pays, `called_pays`) is untouched: it reads hr_boss_calls only, and a hall is never in it
-- (the catalogue refuses a called row in a hall, and the kill bounds' CHECK tells a called row by its id).
--
-- ── THE CONTRACT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- hr_boss_hall_enter(p_slot int, p_hall text, p_idem uuid) -> jsonb. authenticated. MONEY.
--   Refusals, each moving nothing: not_signed_in, bad_slot, bad_idem, hall_unknown (no such hall), rate_limited, hall_leader (a party's member:
--   only its leader opens it), no_character, no_key (the hero holds none of the hall's key), and whatever the start answers (hunting, not_ready,
--   party_hunting, no_stamina ...): every seat rolled back out, the key kept.
--   ok: { ok, version, entered (seats in the room), party (its id, or null alone), alone, hall, key }. The leader's ONE key (hr_boss_halls.key_item)
--   leaves its bag through ONE hr_apply { items: { key: -1 } } journalled kind `shop`, intent boss_hall:<hall>, meta { reason boss_hall, hall, key,
--   party, hunt }, on the caller's key. Win or lose, the key is spent (the design: "the key is used up either way").
-- hr_hunt_admit (one splice): a hall has ONE door. Every other way in (hr_hunt_enter, hr_hunt_party_start, hr_hunt_restart, hr_hunt_change, a
--   member's join, the ready line) answers `hall_only`. The GUC hr.boss_hall is set only by hr_boss_hall_enter for its own transaction; no client
--   role can set a GUC.
-- hr_hunt_settle_session (three splices): a hall's ends are a called room's: `boss_felled` (like `rule`, an end that can only stop value) and
--   `boss_time` on the hall's limit, and a window past the limit with no end is owed (`end_missing`).
-- hr_boss_fight_ok (restated): a hall's windows carry the same record of the fight (hunt_session_tally.fight), read by the same losing line.
-- hr_boss_hall_closed (trigger): when the room empties, the party stands on the hall's ground again (hr_boss_halls.hall_id).
--
-- ── CONCURRENCY AND IDEMPOTENCY (the key read under the lock: 2027-04-19-key-under-lock.sql) ──────────────────────────────────────
-- Locks, in the house order: the party row FOR UPDATE (every party verb's first), then hr:hall:<uid>:<slot> (only this verb takes it). The key is
-- read before the locks AND again right after them, so a second press of one key that waited answers the first's receipt and moves nothing. A
-- second press under ANOTHER key finds the hero's session open and is refused by the start (hunting / busy), rolled back, the key kept. The start
-- runs before hr_apply, so a refused hr_apply (the key gone since the read: insufficient_item) raises and rolls every seat back out. A party's
-- start uses its own derived key (md5('boss_hall:start:' || key)), so a replay of the press replays the start.
--
-- ── EXPLOIT SURFACE DELTA ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Opens: one client verb that spends one item the caller holds to open a fight. What the fight pays is the settle's, bounded like any ground's (kill
-- bounds, the value bound, the drop bound): the hall's rows are catalogue rows. Nothing here credits a thing. A forged hall id is hall_unknown; a
-- hall the caller holds no key for is no_key; a member can't spend the leader's key; a hall can't be entered free through any other door.
-- A HALL KEY'S TRADE (the designer's ruling 6, 2026-11-10: it trades) moves through Storage and the market's own rails, not here.
--
-- ── COST (100x players) ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- Per enter and per settle of ANY hunt: one primary-key probe of hr_boss_halls (empty today) in hr_hunt_admit, the settle's end proof and the owed
-- check. One trigger whose WHEN reads only the row. No new player table, no new column: the ledger row is the record of the key.
--
-- REVERSIBILITY: re-apply hr_hunt_admit from 2027-04-16-combat-training.sql §4, hr_hunt_settle_session's three splices out (2027-03-12-boss-call.sql §2
-- with 2027-03-24-rune-supply.sql §4's splice), hr_boss_fight_ok from 2027-03-12-boss-call.sql §3; drop hr_boss_hall_enter, its baseline row, the
-- trigger and its function. No player row to restore (no hall exists). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body this file moves is exactly the image it was written against (production's, tests/live-hash-drift.baseline.json measured 2026-11-13,
-- equal to the replay's), or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.hr_boss_halls') is null then
    raise exception 'PRECONDITION: apply 2027-04-20-boss-hall-hunt-sessions-catalogue.generated.sql first (hr_boss_halls)'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null or to_regprocedure('public.hr_hunt_party_start(integer,text,uuid)') is null
     or to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_saved_bag(uuid,integer)') is null or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_boss_fight_ok(jsonb,text)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  for v_r in select * from (values
    ('public.hr_hunt_admit(uuid,integer,text)', 'c6cff5f013d8a549567fd65413339052', 'a35133547b1022f0eb1811728268f6e2'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'f48c47d0e3806822c53fae9f805c4fc0', 'ddb5c049e8eeec6788f63561ca08a664'),
    ('public.hr_boss_fight_ok(jsonb,text)', 'a373985d3863b900b4e1ad4e39cbbef9', '90433466d661163d490b16749d322792')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE ONE DOOR (hr_hunt_admit, one splice after the called room's; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_admit(uuid,integer,text)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BOSS-HALL') = 0 then
    v_old := $a$  -- TRAINING (2027-04-16-combat-training.sql): a training ground has one door, hr_training_start, which names the ground for its own$a$;
    v_new := $a$  -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall has one door, hr_boss_hall_enter, which spends its key and names the room for its own
  -- transaction. Past it the hall is entered like any ground (the gate below).
  if exists (select 1 from public.hr_boss_halls h where h.hunt_id = p_hunt)
     and current_setting('hr.boss_hall', true) is distinct from p_hunt then
    return jsonb_build_object('ok', false, 'error', 'hall_only', 'hunt', p_hunt); end if;
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_admit: BOSS-HALL anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §2 THE ROOM'S ENDS (hr_hunt_settle_session, three splices beside the called room's; a second apply finds the post image) ─
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BOSS-HALL') = 0 then
    -- (a) boss_felled: a hall's too. Its kill pays and journals like any ground's, and like `rule` this end can only stop value.
    v_old := $a$      when 'boss_felled' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id)
$a$;
    v_new := $a$      when 'boss_felled' then exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id)
                              -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall ends the same way.
                              or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id)
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the felled anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- (b) boss_time: on the hall's own limit.
    v_old := $a$                                      and v_end_at >= v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) - c_skew)
$a$;
    v_new := v_old || $a$                            or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id
                                      and v_end_at >= v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) - c_skew)
$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the limit anchor matched % times (need 1): the body moved', v_n; end if;
    v_def := replace(v_def, v_old, v_new);
    -- (c) the limit is owed in a hall too: no window runs a hall past it.
    v_old := $a$       or exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => c.limit_ms / 1000.0) + c_skew) then$a$;
    v_new := $a$       or exists (select 1 from public.hr_boss_halls h where h.hunt_id = v_s.hunt_id and v_to > v_s.hunt_from + make_interval(secs => h.limit_ms / 1000.0) + c_skew)
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_settle_session: the owed anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §3 THE RECORD OF A HALL'S FIGHT (hr_boss_fight_ok, RESTATED: 2027-03-12-boss-call.sql §3 with the hall's room, every other line verbatim) ─
-- Is `p` what accrual.js fightOf says, on a room that has fights (a called room, or a keyed hall)? { boss_pm: 0..1000, fired: { ability|eat|drink: n } }, and nothing else.
create or replace function public.hr_boss_fight_ok(p jsonb, p_hunt text)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $$
begin
  -- BOSS-HALL (2027-04-20-boss-hall.sql): a keyed hall keeps the same record; any other hunt must be a called room.
  if not exists (select 1 from public.hr_boss_halls h where h.hunt_id = p_hunt) then
    if not exists (select 1 from public.hr_boss_calls c where c.hunt_id = p_hunt) then return false; end if;
  end if;
  if jsonb_typeof(p) <> 'object' or exists (select 1 from jsonb_object_keys(p) k where k not in ('boss_pm', 'fired')) then return false; end if;
  if jsonb_typeof(p->'boss_pm') is distinct from 'number' or (p->>'boss_pm') !~ '^[0-9]{1,4}$' or (p->>'boss_pm')::int > 1000 then return false; end if;
  return public.hr_hunt_tally_ok(jsonb_build_object('fired', coalesce(p->'fired', '{}'::jsonb)), array['fired']);
end $$;
revoke execute on function public.hr_boss_fight_ok(jsonb, text) from public, anon, authenticated, service_role;

-- ── §4 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_boss_hall_enter(p_slot int, p_hall text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'boss_hall';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_h public.hr_boss_halls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype;
  v_ver bigint; v_have bigint; v_a jsonb; v_no jsonb;
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
  -- THE KEY, in this hero's bag (hr_apply below takes it under its own row lock; this read only words the usual refusal).
  select i.qty into v_have from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = v_h.key_item;
  if coalesce(v_have, 0) < 1 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_key', 'hall', p_hall, 'key', v_h.key_item)); end if;
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
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('items', jsonb_build_object(v_h.key_item, -1),
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'boss_hall', 'hall', p_hall, 'key', v_h.key_item, 'party', v_party, 'hunt', v_h.hunt_id))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      v_no := v_a || jsonb_build_object('ok', false); raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
    -- A KEY THIS CALL DID NOT DECIDE (never reached while the read under the locks holds) opens nothing: its seats roll back out.
    if coalesce(v_a->>'replayed', 'false') = 'true' then
      v_no := v_a; raise exception using errcode = 'HR879', message = 'hall_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.boss_hall', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'entered', v_r->'entered', 'party', v_r->'party', 'alone', v_party is null,
                            'hall', p_hall, 'key', v_h.key_item);
end $$;
revoke execute on function public.hr_boss_hall_enter(int, text, uuid) from public;
revoke execute on function public.hr_boss_hall_enter(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_boss_hall_enter(int, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_boss_hall_enter';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_boss_hall_enter', 'p_slot integer, p_hall text, p_idem uuid', 'authenticated',
   'added 2027-04-20 (lane/b-barrow-boss-room): MONEY (an item spent) - a hero alone, or a party''s leader with every member, spends one of the hall''s keys and enters its room; the key read under the lock');

-- ── §5 THE PARTY'S GROUND AFTER THE ROOM ─────────────────────────────────────
create or replace function public.hr_boss_hall_closed()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_from text;
begin
  select h.hall_id into v_from from public.hr_boss_halls h where h.hunt_id = new.hunt_id;
  if v_from is null or exists (select 1 from public.hunt_sessions s where s.instance_id = new.instance_id and s.ended_at is null) then return null; end if;
  -- NEVER WAITS: this runs inside a settle holding the characters, and every party verb takes the party row first (hr_boss_call_closed's rule).
  update public.hunt_parties p set hunt_id = v_from
   where p.id = (select q.id from public.hunt_parties q where q.id = new.instance_id and q.hunt_id = new.hunt_id for update skip locked);
  return null;
end $$;
revoke execute on function public.hr_boss_hall_closed() from public, anon, authenticated, service_role;
drop trigger if exists hr_boss_hall_closed on public.hunt_sessions;
create trigger hr_boss_hall_closed after update of ended_at on public.hunt_sessions
  for each row when (old.ended_at is null and new.ended_at is not null and right(new.hunt_id, 5) = '_hall')
  execute function public.hr_boss_hall_closed();

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The data holds no hall, so the probes make one inside the rolled-back block: the Mill Cellar's ground catalogue rows copied to mill_cellar_hall,
-- opened by a Goblin Totem, its boss the Cellar's own first spawn.
do $$
declare
  c_a constant uuid := '000000d8-0000-4000-a000-00007f0c0a01';   -- a hero in no party
  c_b constant uuid := '000000d8-0000-4000-a000-00007f0c0a02';   -- a party's leader
  c_c constant uuid := '000000d8-0000-4000-a000-00007f0c0a03';   -- a seated member
  c_room constant text := 'mill_cellar_hall';
  c_key constant text := 'goblin_totem';
  k   constant text := '000000d8-0000-4000-b000-0000';
  v jsonb; v_pid uuid; v_s text; v_boss text;
begin
  -- (a) the shape: a signed-in client opens a hall, nobody else; the trigger is owner-only; hygiene STRICT is green; every splice is in.
  if has_function_privilege('anon', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_boss_hall_enter(integer,text,uuid)', 'execute') then
    raise exception 'boss-hall §6(a): the grants on hr_boss_hall_enter are wrong'; end if;
  foreach v_s in array array['public.hr_boss_hall_closed()', 'public.hr_boss_fight_ok(jsonb,text)'] loop
    if has_function_privilege('authenticated', v_s, 'execute') or has_function_privilege('anon', v_s, 'execute') then raise exception 'boss-hall §6(a): a client can execute %', v_s; end if;
  end loop;
  foreach v_s in array array['public.hr_hunt_admit(uuid,integer,text)', 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', 'public.hr_boss_fight_ok(jsonb,text)'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'BOSS-HALL') = 0 then raise exception 'boss-hall §6(a): % has no splice', v_s; end if;
  end loop;
  if (select count(*) from regexp_matches((select prosrc from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure), 'hr_boss_halls', 'g')) <> 3 then
    raise exception 'boss-hall §6(a): the settle does not read the hall on its three arms'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (a2) THE RECORD: a called room's and a normal hunt's answers unchanged (no hall yet).
  if not public.hr_boss_fight_ok('{"boss_pm":230,"fired":{"eat":3}}'::jsonb, 'millrace_sewer_called') then raise exception 'boss-hall §6(a2): a called room''s record was refused'; end if;
  if public.hr_boss_fight_ok('{"boss_pm":230,"fired":{}}'::jsonb, 'millrace_sewer') then raise exception 'boss-hall §6(a2): a normal hunt may carry a record'; end if;

  begin
    update public.hr_hunt_config set enabled = true where id;
    -- THE PROBE HALL: the Mill Cellar's ground catalogue rows (its hunt, travel, ground, spawns and tiers, the rows a start reads), copied to the
    -- room in their foreign keys' order; the boss is the Cellar's first spawn.
    foreach v_s in array array['hr_hunts', 'hr_hunt_travel', 'hr_hunt_grounds', 'hr_hunt_ground_spawns', 'hr_ground_tiers'] loop
      continue when to_regclass('public.' || v_s) is null;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, to_jsonb(r) || jsonb_build_object(''hunt_id'', %2$L)'
                     || ' || case when to_jsonb(r) ? ''ground_id'' then jsonb_build_object(''ground_id'', %2$L) else ''{}''::jsonb end)).* from public.%1$I r where r.hunt_id = ''mill_cellar''',
                     v_s, c_room);
    end loop;
    if not exists (select 1 from public.hr_hunt_grounds where hunt_id = c_room) or not exists (select 1 from public.hr_hunt_ground_spawns where hunt_id = c_room) then
      raise exception 'boss-hall §6-harness: the probe hall was not copied'; end if;
    select s.monster_id into v_boss from public.hr_hunt_ground_spawns s where s.hunt_id = c_room order by s.monster_id limit 1;
    insert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values ('mill_cellar', c_room, v_boss, c_key, 600000);
    foreach v_s in array array[c_a::text, c_b::text, c_c::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'boss-hall §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'boss-hall §6-harness: hr_create_character refused: %', v; end if;
      delete from public.hr_rate_counters where user_id = v_s::uuid;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    -- (b) ★ NO OTHER DOOR: an enter answers hall_only and opens nothing.
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_hunt_enter(0, c_room, '[]'::jsonb, 0, null, (k || '00000c01')::uuid);
    if coalesce(v->>'ok', '') = 'true' or v::text not like '%hall_only%' then raise exception 'boss-hall §6(b): an enter answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null) then raise exception 'boss-hall §6(b): a refused door opened a session'; end if;
    -- (c) the refusals, each by name, each moving nothing: an unknown hall, and no key.
    v := public.hr_boss_hall_enter(0, 'no_such_ground', (k || '00000c02')::uuid);
    if v->>'error' is distinct from 'hall_unknown' then raise exception 'boss-hall §6(c): an unknown hall answered %', v; end if;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c03')::uuid);
    if v->>'error' is distinct from 'no_key' then raise exception 'boss-hall §6(c): no key answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null) or exists (select 1 from public.player_ledger where user_id = c_a and intent like 'boss\_hall:%') then
      raise exception 'boss-hall §6(c): a refusal moved something'; end if;
    -- (d) ★ A HERO ALONE WITH TWO KEYS: one key spent, one ledger row, one seat in the room; a replay of the press spends nothing more.
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_a, 0, c_key, 2) on conflict (user_id, slot, item_id) do update set qty = 2;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'entered')::int <> 1 or v->>'alone' <> 'true' then raise exception 'boss-hall §6(d): the enter answered %', v; end if;
    if (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key) <> 1 then raise exception 'boss-hall §6(d): the bag holds % keys', (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key); end if;
    if (select count(*) from public.hunt_sessions where user_id = c_a and hunt_id = c_room and ended_at is null) <> 1 then raise exception 'boss-hall §6(d): the hero is not in the room'; end if;
    if (select count(*) from public.player_ledger where user_id = c_a and kind = 'shop' and intent = 'boss_hall:mill_cellar' and (meta->>'reason') = 'boss_hall') <> 1 then raise exception 'boss-hall §6(d): not one ledger row'; end if;
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c04')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key) <> 1
       or (select count(*) from public.player_ledger where user_id = c_a and intent like 'boss\_hall:%') <> 1 then raise exception 'boss-hall §6(d): a replay spent again: %', v; end if;
    -- (d2) a second press under another key finds the hero in the room: refused, the last key kept.
    delete from public.hr_rate_counters where user_id = c_a;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c05')::uuid);
    if coalesce(v->>'ok', '') = 'true' or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = c_key) <> 1 then
      raise exception 'boss-hall §6(d2): a second press answered % and spent a key', v; end if;
    if current_setting('hr.boss_hall', true) <> '' then raise exception 'boss-hall §6(d2): the door stayed open'; end if;
    -- (e) A PARTY: a member is refused by name; the leader's key opens the room for both; when it empties the party stands on the hall's ground.
    perform set_config('request.jwt.claim.sub', '', true);
    v_pid := public.hr_party_open(c_b, 0);
    perform public.hr_party_seat_into(v_pid, c_c, 0);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_b, 0, c_key, 1), (c_c, 0, c_key, 1) on conflict (user_id, slot, item_id) do update set qty = 1;
    perform set_config('request.jwt.claim.sub', c_c::text, true);
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c06')::uuid);
    if v->>'error' is distinct from 'hall_leader' then raise exception 'boss-hall §6(e): a member answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_party_start(0, c_room, (k || '00000c07')::uuid);
    if coalesce(v->>'ok', '') = 'true' or v::text not like '%hall_only%' then raise exception 'boss-hall §6(e): Start answered %', v; end if;
    v := public.hr_boss_hall_enter(0, 'mill_cellar', (k || '00000c08')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'boss-hall §6(e): the leader answered %', v; end if;
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and hunt_id = c_room and ended_at is null) <> 2 then raise exception 'boss-hall §6(e): the room does not hold two heroes'; end if;
    if (select qty from public.player_inventory where user_id = c_b and slot = 0 and item_id = c_key) is not null
       or (select qty from public.player_inventory where user_id = c_c and slot = 0 and item_id = c_key) <> 1 then raise exception 'boss-hall §6(e): the wrong key was spent'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'boss_felled', now(), true) from public.hunt_sessions h where h.instance_id = v_pid and h.ended_at is null;
    if (select p.hunt_id from public.hunt_parties p where p.id = v_pid) is distinct from 'mill_cellar' then raise exception 'boss-hall §6(e): the party stands on %', (select p.hunt_id from public.hunt_parties p where p.id = v_pid); end if;
    -- (f) THE RECORD on the probe hall.
    if not public.hr_boss_fight_ok('{"boss_pm":230,"fired":{"eat":3}}'::jsonb, c_room) then raise exception 'boss-hall §6(f): a hall''s record was refused'; end if;
    raise exception using errcode = 'HRL22', message = 'boss-hall §6 complete - rolling back';
  exception when sqlstate 'HRL22' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) or exists (select 1 from public.hr_boss_halls where hunt_id = c_room) then raise exception 'boss-hall §6: LEAKED a probe row'; end if;
  raise notice 'boss-hall: one door, one key, a room that pays; all green';
end $$;
