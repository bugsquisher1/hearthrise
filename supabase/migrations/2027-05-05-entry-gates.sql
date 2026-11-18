-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-05-entry-gates.sql — TWO DOORS THE SERVER KEEPS: A LEVEL TO ENTER THE BURNING TOWER, AND A BOSS BEATEN ON HIS OWN GROUND BEFORE HE
--   CAN BE CALLED OUT (lane/c-entry-gates, backend-architect, 2026-11-18; Tyler 2026-11-18: "A minimum level to enter the tower, and you have to
--   beat the boss in the hunting ground X times before you can call them out").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA (CLAUDE.md §2):
--   applies on its passing §5. ON THE EA SECURITY LIST with the Tower and Call out: this file only narrows who reaches them.
-- ORDER: LAST of three, after everything applied with v0.2.137 (2027-05-04-setup-swap-mid-hunt.sql):
--   2027-05-05-entry-gates-hunt-sessions-catalogue.generated.sql (hr_boss_calls.boss_id, wins), 2027-05-05-entry-gates-tower-catalogue.generated.sql
--   (hr_tower_rules.min_level), then THIS FILE. §0 refuses without either.
--
-- ── THE NUMBERS ARE DATA ROWS (never a literal in a body here) ──────────────
-- TOWER_RULES.minLevel = 10 (src/data/tower.js -> hr_tower_rules.min_level, tools/gen-tower.mjs). Measured on the real settle (the play fixture,
--   tests/hunt-core/fixtures/play-ground.mjs -> accrual.js accrueHunt on the Tower's ground in the `tower` mode): a hero who never climbed, from
--   floor 1, store food only, 2 seeds x 60 min, five weapon roles alone; against the same heroes hunting the ground their Level suits.
--     Level 4: a climb pays 2.06-2.12x hunting's Level XP for a sword-and-axe, a bow and a Mage (0.88-0.97x tank and Healer), so it is the fastest
--       path a fresh hero has, while it burns 3,165-8,097 g an hour of food and pays no coin; the Mill Cellar nets 1,146-2,194 g an hour. The QA
--       audit of 2026-11-18 played exactly that: a Level 4 hero ate its 20 starter shrimp and 11 bought in 7 minutes and earned 0 gp.
--     Level 6-8: 0.28-0.85x hunting, the same 3,100-8,100 g an hour of food against a Thicket hour of 1,550-3,990 g.
--     Level 10: 0.27-0.75x hunting (under it in every cell, the Tower's own design guard), a hero alone clears floor 15-35 and takes the floor-10
--       Bronze Key; one climb's food is 700-4,000 g against the ~6 hours of hunting (2-4k g an hour) it took to get there. 10 is also the Level the
--       Training Yard opens at (src/data/training.js minLevel): the first hours stay hunting hours.
-- BOSS_CALL_RULES.winsToCall = 10, one number for every boss (src/data/boss-calls.js -> hr_boss_calls.wins, tools/gen-hunt-sessions.mjs). Measured
--   the same way, 2 seeds x 2 h a cell, natural kills an hour per hero (each hero alive at his kill counts it):
--     the Rat King in the Sewer, Levels 12 / 16 / 20: alone 4.0-16.0 (tank 6.5-8, sword-and-axe 13-16, bow 7.5-11, Mage 5.5-7.5, Healer 4-6), a
--       pair 9-16, a four 18-22.5;
--     Chief Coppercap in the Warrens, Levels 34 / 40 / 46: alone 3.0-10.5 (median about 6), a pair 7.5-14, a four 16-22.5.
--   The two bosses fall at the same rate (once a lap), so one number fits both. 10 wins is about 1.3-1.7 h alone (the median hero), about an hour
--   in a pair, half an hour in a four, and 3.3 h at the very slowest cell (a lone Healer at the Warrens' floor): one to two hours, never days.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_tower_start(p_slot int, p_landing int, p_idem uuid) -> jsonb   RESTATED WHOLE (§0 pins its live image). ENTRY-GATES marks the one addition:
--   after the sessions open (every seat's character locked by the start) and before the checkpoint, THE DOOR'S LEVEL (hr_tower_rules.min_level):
--   the hero under it refuses `tower_level` { need, have }; in a party, the first OTHER seat under it, by seat, refuses `tower_party_level`
--   { who (that hero's name, the server's), need, have }. Either takes every session the start opened back out: nothing opens, nothing is
--   journalled but the sampled rejection, the key is not spent. A Level the hero holds is hr_level_of (player_state.level_xp), never a client value.
-- hr_boss_call_quote(p_user, p_slot, p_call) -> jsonb   RESTATED WHOLE (§0 pins). ENTRY-GATES marks the additions: `wins` { boss
--   (hr_boss_calls.boss_id), need (hr_boss_calls.wins), have (this hero's natural wins), short [{ name, have }] (every OTHER seat under need) };
--   `why` gains call_wins (this hero is short) and party_wins (another seat is; `who` names it), said right after call_leader and ahead of
--   stamina and gold (a hero who has not earned the call is told that, not its price). hr_boss_call is NOT restated: it already refuses the
--   quote's `why` under its locks, charging nothing and opening nothing: { ok false, error: call_wins | party_wins, boss_call: the quote }.
-- hr_boss_wins(p_user, p_slot, p_boss) -> bigint   NEW, owner-only: the hero's natural wins of a boss, its Bestiary counter (player_progress
--   kind 'stat', key 'ev:kill_monster:<boss>', period ''), 0 when none.
-- hr_entry_gates_view(p_user, p_slot) -> jsonb   NEW, owner-only; the envelope's section `entry_gates` (hr_state_sections), on every settle:
--   { tower: { need, level, ok, short [{ seat, name, level }] } | null (the burning_tower switch off for the account, as the tower section),
--     calls: { <call_id>: { boss, need, have, ok, short [{ seat, name, have }] } } }
--   `ok` is true only when the hero AND every other seat of its party meet the number (what the verb itself checks); `short` lists the other
--   seats that don't. A client gate reads `ok` and fails safe to locked (CLAUDE.md §6); every number on screen is one of these.
-- REFUSAL CODES (new): tower_level, tower_party_level (hr_tower_start); call_wins, party_wins (the quote's why: hr_boss_call_view, hr_boss_call).
--
-- ── WHAT COUNTS AS A WIN (the narrowest server count there already is: no new table, no new write) ──
-- player_progress ('stat', 'ev:kill_monster:<boss>', '') is written ONLY by hr_apply out of a settled hunt's delta (the engine's countKill, once a
-- kill for every hero alive at it). The call copies the boss under its own row id (<boss>_called, hunt-rewards.js calledSwing), so a called win
-- moves <boss>_called and never <boss>: a call can never earn the next call. The Tower counts no Bestiary (its mode), a keyed hall fields other
-- bosses, and hr_hunt_ground_spawns fields <boss> only on his own ground (the hunt-sessions catalogue's self-check holds it). Every tier and a
-- scaled hunt of his ground count: they are normal hunts there. No grandfathering: a hero's earlier natural kills count as they stand (the wipe
-- at EA resets every counter).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- hr_tower_start: the gate reads every seat's Level AFTER hr_hunt_enter_for / hr_hunt_party_start took that seat's character lock and BEFORE the
--   run is written, inside the same subtransaction as the checkpoint check, so a refusal unwinds every seat (every seat or none, as before). A
--   seat in town has no settle running (party_hunting / hunt_open refuse first), so its Level cannot move under the read. The key is read again
--   under the door's lock (unchanged): a refused press spends no key, and a replay of a decided key answers it.
-- hr_boss_call: unchanged. The quote (with the gate) is read under the party row lock and hr:boss:<uid>; a seat's win counter only rises (a
--   settle adds), so a read that races a settle can only under-count: it refuses a call it could have taken, never takes one it should refuse.
-- hr_entry_gates_view: a read, no lock (MVCC), like every section.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No new client verb, grant or write path; two verbs refuse MORE. No client value is read: the Level is player_state.level_xp, the wins are the
--   settle's counter, the names hr_character_name. The section shows a party seat's name and Level or win count to the other seats, which the
--   party already shows. FOR THE EA REVIEW: the win counter is bounded by hr_apply's per-op clamp (1e6) and the window's kill count, not by a
--   per-monster kill bound, so a compromised ENGINE could write wins it did not earn; the same counter already gates titles, faction joins and
--   the Bestiary's trophies, so this file adds no new trust in it.
--
-- ── COST (rows and bytes at 100x players) ────────────────────────────────────
-- No table, no row (one hr_state_sections row). Per settle of any hero, the section: one hr_tower_rules primary-key read, the hero's Level, one
--   player_progress primary-key read per call (2 today), and for a hero in a party up to 3 more of each (names only for a seat that falls
--   short): about 10 index reads, no write. hr_tower_start adds 1 + seats Level reads per press; the quote one counter read per seat.
--
-- EDGE: no body here is the engine's, but src/data/tower.js and src/data/boss-calls.js ride the hr-accrue bundle, so pack-edge --hash moves (data
--   only: two numbers the engine never reads). Either order is safe; deploy with the next release.
-- CLIENT: the Tower window and the Call out pane read `entry_gates` and the quote's `wins` after this apply; until they ship, an old client's
--   press reads the refusal's general line (src/data/refusal-words.js), the server still refusing.
-- REVERSIBLE: re-apply hr_tower_start from 2027-04-24-tower-climb.sql §3 and hr_boss_call_quote from 2027-04-24-boss-call-series.sql §4 (their
--   §0 pins accept the live images), delete the section row, drop hr_entry_gates_view and hr_boss_wins; the columns are the catalogues'.
-- IDEMPOTENT: a second apply finds §0's post-images, restates every body byte-identical, upserts the same section row, and §5 rolls back its probes.
-- WIPE: nothing new to wipe (no table; the counters are player_progress's).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each restated body is the image this file was written against (the replayed chain's, as of 2027-05-04-setup-swap-mid-hunt.sql, = production
-- after v0.2.137) or this file's own (a second apply): md5 of pg_get_functiondef with every run of whitespace one space.
do $mig$
declare v_r record; v_md5 text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tower_rules' and column_name = 'min_level' and is_nullable = 'NO')
     or not exists (select 1 from public.hr_tower_rules where id and min_level >= 1) then
    raise exception 'PRECONDITION: apply 2027-05-05-entry-gates-tower-catalogue.generated.sql first (hr_tower_rules.min_level)'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'hr_boss_calls' and column_name in ('boss_id', 'wins') and is_nullable = 'NO') <> 2
     or exists (select 1 from public.hr_boss_calls where wins is null or wins < 1 or boss_id is null) then
    raise exception 'PRECONDITION: apply 2027-05-05-entry-gates-hunt-sessions-catalogue.generated.sql first (hr_boss_calls.boss_id, wins)'; end if;
  if to_regclass('public.player_progress') is null or to_regclass('public.hr_state_sections') is null or to_regclass('public.hunt_party_members') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null or to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_boss_call(integer,text,integer,bigint,uuid)') is null or to_regprocedure('public.hr_tower_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: a table or helper this file reads is missing'; end if;
  for v_r in select * from (values
    ('public.hr_tower_start(integer,integer,uuid)', '3f48c0a223134a17a2912846ea703455', '15c452e5c51d9d029b0e5c949d9c5160'),
    ('public.hr_boss_call_quote(uuid,integer,text)', '3228bc77baba81415ef0cb5722d12afb', 'd1bbad7fe47d89ccd953b9aab755a578')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither the image this file restates (%) nor its own (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE COUNT (owner-only) ────────────────────────────────────────────────
-- A HERO'S NATURAL WINS OF A BOSS: its Bestiary counter, written only by the settle (hr_apply out of a hunt's delta). plpgsql, never sql: the
-- section reads it on every settle (tests/settle-budget.mjs SB-3).
create or replace function public.hr_boss_wins(p_user uuid, p_slot int, p_boss text)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- ENTRY-GATES (2027-05-05-entry-gates.sql)
  return coalesce((select p.value from public.player_progress p
                    where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat' and p.key = 'ev:kill_monster:' || p_boss and p.period_key = ''), 0)::bigint;
end $fn$;
revoke all on function public.hr_boss_wins(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §2 THE TOWER'S DOOR, WITH ITS LEVEL (restated whole; every line but ENTRY-GATES's is the image §0 pins) ──────────────
create or replace function public.hr_tower_start(p_slot int, p_landing int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'tower_start';
  v_uid uuid := auth.uid(); v_hunt text; v_mode text; v_verb text; v_r jsonb; v_no jsonb; v_sid uuid; v_ver bigint; v_a jsonb;
  v_party uuid; v_cps int[]; v_pick int; v_n int;
  v_need int; v_lv int; v_who text;  -- ENTRY-GATES (2027-05-05-entry-gates.sql): the door's Level, a seat's Level, a short seat's name
begin
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql); TOWER-CHECKPOINTS (lane/c-tower-checkpoints, Tyler 2026-11-16)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_landing is not null and (p_landing < 0 or p_landing > 1000000) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_landing')); end if;
  if not public.hr_feature_on('burning_tower', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  select r.hunt_id, g.mode_id into v_hunt, v_mode
    from public.hr_tower_rules r left join public.hr_ground_session_modes g on g.hunt_id = r.hunt_id where r.id;
  if v_hunt is null or v_mode is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  v_verb := c_verb || ':' || coalesce(p_landing::text, 'best');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE LOCK: this hero's own Tower door, which only this verb takes (hr_boss_hall_enter's move, 2027-04-20-boss-hall.sql), before every lock
  -- hr_hunt_enter_for takes below (the character, its bag, the play cap): two presses of one hero's door run one after the other.
  perform pg_advisory_xact_lock(hashtextextended('hr:tower:' || v_uid::text || ':' || p_slot::text, 0));
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above ran
  -- before the first press committed, and past this point hr_apply answers a decided key ok and replayed, under a climb this call opened.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  begin
    -- THE SESSIONS FIRST (their locks: each seat's character), THEN THE RECORD under them: a start can't race a settle into an unearned floor.
    perform set_config('hr.tower', v_hunt, true);
    if v_party is null then
      v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_hunt, public.hr_hunt_saved_bag(v_uid, p_slot), public.hr_hunt_active_set(v_uid, p_slot), null);
    elsif exists (select 1 from public.hunt_party_members m join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot
                   where m.party_id = v_party and h.ended_at is null) then
      -- A PARTY CLIMBS TOGETHER FROM ONE FLOOR: every seat in town first (a seat out hunting would join a climb mid-floor)
      v_r := jsonb_build_object('ok', false, 'error', 'party_hunting', 'hunt', v_hunt);
    else
      -- every seat or none, the leader's call (its own key: hr_hunt_party_start journals what it was asked under)
      v_r := public.hr_hunt_party_start(p_slot, v_hunt, md5('tower_start:party:' || p_idem::text)::uuid);
    end if;
    perform set_config('hr.tower', '', true);
    if coalesce(v_r->>'ok', 'false') <> 'true' then v_no := v_r; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- ENTRY-GATES (2027-05-05-entry-gates.sql; Tyler 2026-11-18 "A minimum level to enter the tower"): THE DOOR'S LEVEL, read under the locks the
    -- start took (every seat's character), the hero first, then every other seat in seat order. The first one under it refuses, and this
    -- subtransaction takes every session the start opened back out. No Level is the catalogue missing: refused, never let through.
    select r.min_level into v_need from public.hr_tower_rules r where r.id;
    if v_need is null then
      v_no := jsonb_build_object('ok', false, 'error', 'catalogue_missing'); raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    v_lv := coalesce(public.hr_level_of(v_uid, p_slot), 1);
    if v_lv < v_need then
      v_no := jsonb_build_object('ok', false, 'error', 'tower_level', 'need', v_need, 'have', v_lv);
      raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    if v_party is not null then
      select public.hr_character_name(m.user_id, m.slot), l.lv into v_who, v_lv
        from public.hunt_party_members m cross join lateral (select coalesce(public.hr_level_of(m.user_id, m.slot), 1) as lv) l
       where m.party_id = v_party and not (m.user_id = v_uid and m.slot = p_slot) and l.lv < v_need
       order by m.seat limit 1;
      if found then
        v_no := jsonb_build_object('ok', false, 'error', 'tower_party_level', 'who', v_who, 'need', v_need, 'have', v_lv);
        raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    end if;
    v_cps := public.hr_mode_checkpoints(v_mode, public.hr_tower_record(v_uid, p_slot));
    v_pick := coalesce(p_landing, v_cps[cardinality(v_cps)]);
    if v_cps is null or v_pick is null or v_pick <> all (v_cps) then
      v_no := jsonb_build_object('ok', false, 'error', 'bad_landing', 'checkpoints', to_jsonb(v_cps));
      raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- ONE RUN A SEAT, all from the floor after the checkpoint (alone: the caller's one)
    select count(*) into v_n from public.hunt_sessions h
     where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                       else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                     and m.user_id = h.user_id and m.slot = h.slot) end);
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor, party, started_at)
      select h.id, h.user_id, h.slot, h.instance_id, v_pick + 1, least(greatest(v_n, 1), 4), now() from public.hunt_sessions h
       where h.ended_at is null and (case when v_party is null then h.user_id = v_uid and h.slot = p_slot
                                         else exists (select 1 from public.hunt_party_members m where m.party_id = v_party
                                                       and m.user_id = h.user_id and m.slot = h.slot) end);
    select h.id into v_sid from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null;
    -- ONE journal-only apply on the caller's key: a replay answers once and opens once.
    select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('journal', jsonb_build_object('kind', 'combat', 'intent', v_verb,
             'meta', jsonb_build_object('reason', 'tower_start', 'hunt', v_hunt, 'landing', v_pick, 'floor', v_pick + 1, 'session', v_sid,
                                        'party', v_party, 'seats', v_n))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then v_no := v_a; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
    -- A KEY THIS CALL DID NOT DECIDE (never reached while the read under the lock holds) opens nothing: its climb rolls back out.
    if coalesce(v_a->>'replayed', 'false') = 'true' then v_no := v_a; raise exception using errcode = 'HR879', message = 'tower_refused'; end if;
  exception when sqlstate 'HR879' then
    perform set_config('hr.tower', '', true);
    return public.hr_note_rejection(c_verb, p_slot, v_no);
  end;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'version', v_a->'version', 'session_id', v_sid, 'session', v_r->'session',
                            'landing', v_pick, 'floor', v_pick + 1, 'checkpoints', to_jsonb(v_cps), 'party', v_r->'party'));
end $fn$;
revoke execute on function public.hr_tower_start(int, int, uuid) from public;
revoke execute on function public.hr_tower_start(int, int, uuid) from anon, service_role;
grant  execute on function public.hr_tower_start(int, int, uuid) to authenticated;

-- ── §3 THE CALL'S QUOTE, WITH THE WINS (restated whole; every line but ENTRY-GATES's is the image §0 pins) ──────────────
create or replace function public.hr_boss_call_quote(p_user uuid, p_slot int, p_call text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_boss_calls%rowtype; v_party uuid; v_p public.hunt_parties%rowtype; v_seats int := 1; v_why text; v_who text;
  v_fee jsonb; v_price bigint; v_stam bigint; v_mine int := 0; v_bill bigint := 0; v_covers bigint;
  v_m record; v_a record; v_pm int; v_ms bigint;
  v_boss int; v_lv int; v_low int; v_under int := 0; v_tank boolean := false; v_healer boolean := false; v_nofood int := 0; v_role text;
  v_won bigint; v_have bigint := 0; v_gate text; v_gate_who text; v_short jsonb := '[]'::jsonb;  -- ENTRY-GATES (2027-05-05-entry-gates.sql)
begin
  -- CALL-SERIES (2027-04-24-boss-call-series.sql): one fight's price for this hero, and what the room can pay right now. No daily cap.
  -- LIVE-EVENTS (2027-03-22-live-events.sql): the price is the row's fee x the account's live fee dial (Open Halls: 0), rounded up: gold only.
  -- CALL-OUT-ALONE (2027-04-05-call-out-alone.sql): a hero in no party is quoted and calls alone; in a party only its leader calls.
  -- ENTRY-GATES (2027-05-05-entry-gates.sql; Tyler 2026-11-18 "you have to beat the boss in the hunting ground X times before you can call them
  --   out"): every seat's natural wins of the boss the call copies (hr_boss_wins), said as `wins`; a seat short of hr_boss_calls.wins is the
  --   first `why` after call_leader (call_wins this hero, party_wins another, `who` its name), ahead of stamina and gold.
  select * into r from public.hr_boss_calls where call_id = p_call;
  if not found then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party;
    v_seats := greatest(1, (select count(*) from public.hunt_party_members m where m.party_id = v_party)::int);
  end if;
  v_fee := public.hr_live_fee_of(p_user, r.call_id, now());
  v_price := (r.fight_fee::bigint * (v_fee->>'pm')::int + 999) / 1000;
  v_stam := public.hr_stamina_of(p_user, p_slot, now());
  v_why := case when v_party is not null and not (v_p.leader_user = p_user and v_p.leader_slot = p_slot) then 'call_leader' end;
  -- EVERY SEAT'S FIRST FIGHT and what the room covers: each hero its own pool, each account its own purse for all its heroes in the room.
  v_covers := r.max_fights;
  -- THE DANGER, SAID BEFORE THE PRESS (audit F24: a call killed a Level 44 hero whose page had warned of nothing): his Level beside every
  -- seat's, whether the room holds a tank and a healer (the worn set's role, hr_hunt_role_of), and a bar with no food switched on.
  v_boss := r.boss_level;
  for v_m in select s.user_id, s.slot from (
               select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_party
               union select p_user, p_slot) s order by (s.user_id = p_user and s.slot = p_slot) desc, s.user_id, s.slot loop
    v_ms := public.hr_stamina_of(v_m.user_id, v_m.slot, now());
    v_covers := least(v_covers, coalesce(v_ms, 0) / r.fight_stamina_ms);
    if v_m.user_id = p_user then v_mine := v_mine + 1; end if;
    v_lv := public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps where ps.user_id = v_m.user_id and ps.slot = v_m.slot), 0));
    v_low := least(coalesce(v_low, v_lv), v_lv);
    if v_lv < v_boss then v_under := v_under + 1; end if;
    v_role := public.hr_hunt_role_of(v_m.user_id, v_m.slot);
    v_tank := v_tank or v_role is not distinct from 'tank';
    v_healer := v_healer or v_role is not distinct from 'healer';
    -- A BAR WITH NO FOOD: the hero's own active bar holds a slot and none of its slots is food switched on. (A bar that holds nothing runs
    -- the start kit's, which eats: src/core/hunt-spawn.js heroSetup.)
    if (select bool_or(jsonb_typeof(sl.value->'action') = 'object')
               and not bool_or(sl.value->'action'->>'type' = 'consume' and coalesce(sl.value->>'enabled', 'true') <> 'false'
                               and (exists (select 1 from public.hr_hunt_supplies p where p.item_id = sl.value->'action'->>'id' and p.kind = 'heal')
                                    or exists (select 1 from public.hr_hunt_basic_supplies q where q.basic_id = sl.value->'action'->>'id' and q.kind = 'heal')))
          from public.player_action_sets a
         cross join lateral jsonb_array_elements(case when jsonb_typeof(a.slots) = 'array' then a.slots else '[]'::jsonb end) sl
         where a.user_id = v_m.user_id and a.slot = v_m.slot and a.preset = public.hr_hunt_active_set(v_m.user_id, v_m.slot)) then
      v_nofood := v_nofood + 1; end if;
    -- ENTRY-GATES: this seat's natural wins (its own Bestiary counter of the boss the call copies, never the called row's)
    v_won := public.hr_boss_wins(v_m.user_id, v_m.slot, r.boss_id);
    if v_m.user_id = p_user and v_m.slot = p_slot then v_have := v_won;
    elsif v_won < r.wins then v_short := v_short || jsonb_build_array(jsonb_build_object('name', public.hr_character_name(v_m.user_id, v_m.slot), 'have', v_won)); end if;
    if v_gate is null and v_won < r.wins then
      if v_m.user_id = p_user and v_m.slot = p_slot then v_gate := 'call_wins';
      else v_gate := 'party_wins'; v_gate_who := public.hr_character_name(v_m.user_id, v_m.slot); end if;
    end if;
    if v_why is null and coalesce(v_ms, 0) < r.fight_stamina_ms then
      if v_m.user_id = p_user and v_m.slot = p_slot then v_why := 'call_stamina';
      else v_why := 'party_stamina'; v_who := public.hr_character_name(v_m.user_id, v_m.slot); end if;
    end if;
  end loop;
  v_bill := v_price * v_mine;
  for v_a in select s.user_id, count(*)::int as n, min(s.slot) as slot0,
                    max(greatest(0, coalesce((public.hr_hunt_supply_of(s.user_id, s.slot, public.hr_hunt_active_set(s.user_id, s.slot))->>'gold_floor')::bigint, 0))) as keep
               from (select m.user_id, m.slot from public.hunt_party_members m where m.party_id = v_party
                     union select p_user, p_slot) s
              group by s.user_id order by (s.user_id = p_user) desc, s.user_id loop
    v_pm := (public.hr_live_fee_of(v_a.user_id, r.call_id, now())->>'pm')::int;
    v_ms := ((r.fight_fee::bigint * v_pm + 999) / 1000) * v_a.n;   -- this account's gold a fight
    continue when v_ms = 0;
    if coalesce(public.hr_purse_of(v_a.user_id), 0) < v_ms then
      v_covers := 0;
      if v_why is null then
        if v_a.user_id = p_user then v_why := 'insufficient_gold';
        else v_why := 'party_gold'; v_who := public.hr_character_name(v_a.user_id, v_a.slot0); end if;
      end if;
    else
      -- the first fight is the press's own; every later one keeps the purse at or over "Keep at least"
      v_covers := least(v_covers, greatest(1, (coalesce(public.hr_purse_of(v_a.user_id), 0) - v_a.keep) / v_ms));
    end if;
  end loop;
  -- ENTRY-GATES: a call not yet earned is said first (after call_leader: a member can't call at all), ahead of its price.
  if v_gate is not null and v_why is distinct from 'call_leader' then v_why := v_gate; v_who := v_gate_who; end if;
  return jsonb_build_object('call', r.call_id, 'available', v_why is null, 'why', v_why, 'who', v_who, 'price', v_price,
                            'fight_fee', r.fight_fee, 'fee_pm', (v_fee->>'pm')::int, 'event', v_fee->'event',
                            'fight_stamina_ms', r.fight_stamina_ms, 'max_fights', r.max_fights, 'limit_ms', r.limit_ms,
                            'stamina_ms', v_stam, 'covers', greatest(0, v_covers), 'heroes', v_mine, 'seats', v_seats, 'alone', v_seats = 1,
                            'drops', r.drops,
                            'danger', jsonb_build_object('boss_level', v_boss, 'under', v_under, 'lowest', v_low, 'tank', v_tank, 'healer', v_healer, 'no_food', v_nofood),
                            'wins', jsonb_build_object('boss', r.boss_id, 'need', r.wins, 'have', v_have, 'short', v_short),
                            'totals', jsonb_build_object(
                              'fee', (select jsonb_agg(v_bill * g order by g) from generate_series(1, r.max_fights) g),
                              'stamina_ms', (select jsonb_agg(r.fight_stamina_ms::bigint * g order by g) from generate_series(1, r.max_fights) g)));
end $fn$;
revoke execute on function public.hr_boss_call_quote(uuid, int, text) from public, anon, authenticated, service_role;

-- ── §4 THE SECTION: BOTH DOORS AS THIS HERO'S PAGES SHOW THEM (owner-only; plpgsql: the settle reads every section) ──────────────
create or replace function public.hr_entry_gates_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_party uuid; v_need int; v_lv int; v_short jsonb; v_tower jsonb := null; v_calls jsonb := '{}'::jsonb; c record; v_have bigint;
begin
  -- ENTRY-GATES (2027-05-05-entry-gates.sql): what hr_tower_start and hr_boss_call_quote check, before any press. `ok` is the hero's AND every
  -- other seat's (what the verb checks); `short` the other seats that fall short, by seat.
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  -- THE TOWER'S LEVEL, only while the Tower is open to this account (the tower section's own rule: nothing of it shows while it is off)
  if public.hr_feature_on('burning_tower', p_user) then
    select r.min_level into v_need from public.hr_tower_rules r where r.id;
    if v_need is not null then
      v_lv := coalesce(public.hr_level_of(p_user, p_slot), 1);
      select coalesce(jsonb_agg(jsonb_build_object('seat', m.seat, 'name', public.hr_character_name(m.user_id, m.slot), 'level', l.lv) order by m.seat), '[]'::jsonb)
        into v_short
        from public.hunt_party_members m cross join lateral (select coalesce(public.hr_level_of(m.user_id, m.slot), 1) as lv) l
       where m.party_id = v_party and not (m.user_id = p_user and m.slot = p_slot) and l.lv < v_need;
      v_tower := jsonb_build_object('need', v_need, 'level', v_lv, 'ok', v_lv >= v_need and v_short = '[]'::jsonb, 'short', v_short);
    end if;
  end if;
  -- EVERY CALL'S NATURAL WINS (each the boss its call copies)
  for c in select b.call_id, b.boss_id, b.wins from public.hr_boss_calls b order by b.call_id loop
    v_have := public.hr_boss_wins(p_user, p_slot, c.boss_id);
    select coalesce(jsonb_agg(jsonb_build_object('seat', m.seat, 'name', public.hr_character_name(m.user_id, m.slot), 'have', w.n) order by m.seat), '[]'::jsonb)
      into v_short
      from public.hunt_party_members m cross join lateral (select public.hr_boss_wins(m.user_id, m.slot, c.boss_id) as n) w
     where m.party_id = v_party and not (m.user_id = p_user and m.slot = p_slot) and w.n < c.wins;
    v_calls := v_calls || jsonb_build_object(c.call_id, jsonb_build_object('boss', c.boss_id, 'need', c.wins, 'have', v_have,
                                                                           'ok', v_have >= c.wins and v_short = '[]'::jsonb, 'short', v_short));
  end loop;
  return jsonb_build_object('tower', v_tower, 'calls', v_calls);
end $fn$;
revoke all on function public.hr_entry_gates_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_entry_gates_view(uuid, int) from hr_engine;
    revoke all on function public.hr_boss_wins(uuid, int, text) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('entry_gates', 'hr_entry_gates_view', '2027-05-05-entry-gates.sql: the two doors the server keeps (Tyler 2026-11-18): the Burning Tower''s Level (tower: need, level, ok, short; null while the switch is off) and every Call out''s natural wins (calls.<id>: boss, need, have, ok, short), the hero''s and every other seat''s')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE SHAPE: the door is the signed-in client's alone and on the baseline; the quote, the count and the section are no client's (nor
--     service_role's); the section is registered; both restated bodies carry ENTRY-GATES; each call counts a ground boss its press's ground
--     fields; grant hygiene STRICT.
-- (b) ★ THE TOWER, ALONE: a hero one Level under the door is refused tower_level { need, have } and NOTHING opens (no session, no run, no
--     journal row); the section says the same (tower.ok false); at the Level the SAME key opens the climb (a refusal spends no key) and the
--     section says ok.
-- (c) ★ THE TOWER, A PARTY: the leader at the Level and a seat one under: tower_party_level naming that seat, nothing opens for either; the
--     section names the short seat for the leader; the seat raised to the Level, the party climbs, one run a seat.
-- (d) ★ CALL OUT, ALONE: one natural win short (and a hundred CALLED wins, which never count): the quote says call_wins with the count, the
--     section the same, the press refuses it charging nothing and opening nothing; at the count the call opens and charges once.
-- (e) ★ CALL OUT, A PARTY: the leader at the count and a seat one short: party_wins naming that seat, nobody charged; the seat at the count,
--     the call opens for both, each charged once.
do $chk$
declare
  c_a constant uuid := '000000e9-0000-4000-a000-0000e7a7e001';   -- a hero alone
  c_b constant uuid := '000000e9-0000-4000-a000-0000e7a7e002';   -- a party's leader
  c_c constant uuid := '000000e9-0000-4000-a000-0000e7a7e003';   -- its seated member
  k   constant text := '000000e9-0000-4000-b000-0000';
  r public.hr_tower_rules%rowtype; c public.hr_boss_calls%rowtype; v jsonb; q jsonb; s jsonb; v_s text; v_pid uuid; v_role text;
begin
  select * into r from public.hr_tower_rules where id;
  select * into c from public.hr_boss_calls order by call_id limit 1;
  if r.min_level is null or r.min_level < 2 or c.call_id is null then
    raise exception 'entry-gates §5: no door Level over 1 or no call to probe with (min_level %, call %)', r.min_level, c.call_id; end if;

  -- (a)
  if not has_function_privilege('authenticated', 'public.hr_tower_start(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_tower_start(integer,integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_tower_start(integer,integer,uuid)', 'execute')
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_tower_start' and grantee = 'authenticated') then
    raise exception 'entry-gates §5(a): hr_tower_start is not the signed-in client''s alone'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_s in array array['public.hr_boss_call_quote(uuid,integer,text)', 'public.hr_boss_wins(uuid,integer,text)', 'public.hr_entry_gates_view(uuid,integer)'] loop
      if has_function_privilege(v_role, v_s::regprocedure, 'execute') then raise exception 'entry-gates §5(a): % can execute %', v_role, v_s; end if;
    end loop;
  end loop;
  if not exists (select 1 from public.hr_state_sections where key = 'entry_gates' and fn = 'hr_entry_gates_view') then
    raise exception 'entry-gates §5(a): the entry_gates section is not registered'; end if;
  foreach v_s in array array['public.hr_tower_start(integer,integer,uuid)', 'public.hr_boss_call_quote(uuid,integer,text)'] loop
    if strpos((select prosrc from pg_proc where oid = v_s::regprocedure), 'ENTRY-GATES') = 0 then raise exception 'entry-gates §5(a): % has no ENTRY-GATES', v_s; end if;
  end loop;
  if exists (select 1 from public.hr_boss_calls b
              where b.boss_id ~ '_called$' or b.wins < 1
                 or not exists (select 1 from public.hr_hunt_ground_spawns g where g.hunt_id = b.from_hunt and g.monster_id = b.boss_id)) then
    raise exception 'entry-gates §5(a): a call counts wins on no ground boss of its press''s ground'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    update public.hr_hunt_config set enabled = true where id;
    update public.hr_feature_switches set scope = 'everyone', accounts = '{}' where switch_id = 'burning_tower';
    foreach v_s in array array[c_a::text, c_b::text, c_c::text] loop
      insert into auth.users (id) values (v_s::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_s::uuid, 'Probe Gate ' || right(v_s, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_s::uuid, 'entry-gates §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_s, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'entry-gates §5-harness: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null, level_xp = public.hr_char_xp_for_level(r.min_level - 1)
       where user_id = v_s::uuid and slot = 0;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    update public.account_wallet set gold = 100000 where user_id in (c_a, c_b, c_c);

    -- (b)
    if public.hr_level_of(c_a, 0) <> r.min_level - 1 then raise exception 'entry-gates §5(b)-harness: the probe stands at Level %', public.hr_level_of(c_a, 0); end if;
    s := public.hr_state_of(c_a, 0)->'entry_gates'->'tower';
    if s is distinct from jsonb_build_object('need', r.min_level, 'level', r.min_level - 1, 'ok', false, 'short', '[]'::jsonb) then
      raise exception 'entry-gates §5(b): one Level under, the section reads %', s; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_tower_start(0, 0, (k || '0000e001')::uuid);
    if v->>'error' is distinct from 'tower_level' or (v->>'need')::int is distinct from r.min_level or (v->>'have')::int is distinct from r.min_level - 1 then
      raise exception 'entry-gates §5(b): one Level under, the door answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where user_id = c_a) or exists (select 1 from public.tower_runs where user_id = c_a)
       or exists (select 1 from public.player_ledger where user_id = c_a and intent like 'tower_start%') then
      raise exception 'entry-gates §5(b): a refused door opened or journalled something'; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.min_level) where user_id = c_a and slot = 0;
    if (public.hr_state_of(c_a, 0)->'entry_gates'->'tower'->>'ok')::boolean is not true then
      raise exception 'entry-gates §5(b): at the Level, the section reads %', public.hr_state_of(c_a, 0)->'entry_gates'->'tower'; end if;
    v := public.hr_tower_start(0, 0, (k || '0000e001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'floor')::int <> 1
       or (select count(*) from public.tower_runs where user_id = c_a and ended_at is null) <> 1 then
      raise exception 'entry-gates §5(b): at the Level, the same key answered %', v; end if;
    perform public.hr_hunt_close((v->>'session_id')::uuid, 'died', now(), true);

    -- (c)
    perform set_config('request.jwt.claim.sub', '', true);
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.min_level) where user_id = c_b and slot = 0;
    v_pid := public.hr_party_open(c_b, 0);
    perform public.hr_party_seat_into(v_pid, c_c, 0);
    s := public.hr_entry_gates_view(c_b, 0)->'tower';
    if (s->>'ok')::boolean is not false or (s->>'level')::int <> r.min_level
       or s->'short' is distinct from jsonb_build_array(jsonb_build_object('seat', 1, 'name', public.hr_character_name(c_c, 0), 'level', r.min_level - 1)) then
      raise exception 'entry-gates §5(c): a seat under the Level, the leader''s section reads %', s; end if;
    if (public.hr_entry_gates_view(c_c, 0)->'tower'->>'ok')::boolean is not false or public.hr_entry_gates_view(c_c, 0)->'tower'->'short' <> '[]'::jsonb then
      raise exception 'entry-gates §5(c): the short seat''s own section reads %', public.hr_entry_gates_view(c_c, 0)->'tower'; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_tower_start(0, 0, (k || '0000e002')::uuid);
    if v->>'error' is distinct from 'tower_party_level' or v->>'who' is distinct from public.hr_character_name(c_c, 0)
       or (v->>'need')::int is distinct from r.min_level or (v->>'have')::int is distinct from r.min_level - 1 then
      raise exception 'entry-gates §5(c): a seat under the Level, the door answered %', v; end if;
    if exists (select 1 from public.hunt_sessions where user_id in (c_b, c_c)) or exists (select 1 from public.tower_runs where user_id in (c_b, c_c)) then
      raise exception 'entry-gates §5(c): a refused party door opened a session'; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(r.min_level) where user_id = c_c and slot = 0;
    if (public.hr_entry_gates_view(c_b, 0)->'tower'->>'ok')::boolean is not true then
      raise exception 'entry-gates §5(c): every seat at the Level, the section reads %', public.hr_entry_gates_view(c_b, 0)->'tower'; end if;
    v := public.hr_tower_start(0, 0, (k || '0000e003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.tower_runs where user_id in (c_b, c_c) and ended_at is null) <> 2 then
      raise exception 'entry-gates §5(c): every seat at the Level, the door answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.hr_hunt_close(h.id, 'died', now(), true) from public.hunt_sessions h where h.user_id in (c_b, c_c) and h.ended_at is null;

    -- (d)
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values
      (c_a, 0, 'stat', 'ev:kill_monster:' || c.boss_id, '', c.wins - 1, now()),
      (c_a, 0, 'stat', 'ev:kill_monster:' || c.monster_id, '', 100, now());
    q := public.hr_boss_call_quote(c_a, 0, c.call_id);
    if (q->>'available')::boolean is not false or q->>'why' is distinct from 'call_wins'
       or q->'wins' is distinct from jsonb_build_object('boss', c.boss_id, 'need', c.wins, 'have', c.wins - 1, 'short', '[]'::jsonb) then
      raise exception 'entry-gates §5(d): one win short, the quote reads % / %', q->>'why', q->'wins'; end if;
    s := public.hr_state_of(c_a, 0)->'entry_gates'->'calls'->c.call_id;
    if s is distinct from jsonb_build_object('boss', c.boss_id, 'need', c.wins, 'have', c.wins - 1, 'ok', false, 'short', '[]'::jsonb) then
      raise exception 'entry-gates §5(d): one win short, the section reads %', s; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_boss_call(0, c.call_id, 1, (q->>'price')::bigint, (k || '0000e004')::uuid);
    if v->>'error' is distinct from 'call_wins' or (v->'boss_call'->'wins'->>'have')::bigint <> c.wins - 1 then
      raise exception 'entry-gates §5(d): one win short, the call answered %', v - 'boss_call'; end if;
    if (select gold from public.account_wallet where user_id = c_a) <> 100000 or exists (select 1 from public.hunt_sessions where user_id = c_a and ended_at is null)
       or exists (select 1 from public.player_ledger where user_id = c_a and intent like 'boss\_call:%') then
      raise exception 'entry-gates §5(d): a refused call charged or opened something'; end if;
    update public.player_progress set value = c.wins where user_id = c_a and slot = 0 and kind = 'stat' and key = 'ev:kill_monster:' || c.boss_id and period_key = '';
    q := public.hr_boss_call_quote(c_a, 0, c.call_id);
    if (q->>'available')::boolean is not true or (q->'wins'->>'have')::bigint <> c.wins
       or (public.hr_entry_gates_view(c_a, 0)->'calls'->c.call_id->>'ok')::boolean is not true then
      raise exception 'entry-gates §5(d): at the count, the quote reads % / %', q->>'why', q->'wins'; end if;
    v := public.hr_boss_call(0, c.call_id, 1, (q->>'price')::bigint, (k || '0000e005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = c_a) <> 100000 - (q->>'price')::bigint
       or (select count(*) from public.hunt_sessions where user_id = c_a and hunt_id = c.hunt_id and ended_at is null) <> 1 then
      raise exception 'entry-gates §5(d): at the count, the call answered %', v - 'boss_call'; end if;

    -- (e)
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values
      (c_b, 0, 'stat', 'ev:kill_monster:' || c.boss_id, '', c.wins, now()),
      (c_c, 0, 'stat', 'ev:kill_monster:' || c.boss_id, '', c.wins - 1, now());
    q := public.hr_boss_call_quote(c_b, 0, c.call_id);
    if (q->>'available')::boolean is not false or q->>'why' is distinct from 'party_wins' or q->>'who' is distinct from public.hr_character_name(c_c, 0)
       or q->'wins' is distinct from jsonb_build_object('boss', c.boss_id, 'need', c.wins, 'have', c.wins,
                                                        'short', jsonb_build_array(jsonb_build_object('name', public.hr_character_name(c_c, 0), 'have', c.wins - 1))) then
      raise exception 'entry-gates §5(e): a seat one win short, the leader''s quote reads % % / %', q->>'why', q->>'who', q->'wins'; end if;
    s := public.hr_entry_gates_view(c_b, 0)->'calls'->c.call_id;
    if (s->>'ok')::boolean is not false or (s->>'have')::bigint <> c.wins
       or s->'short' is distinct from jsonb_build_array(jsonb_build_object('seat', 1, 'name', public.hr_character_name(c_c, 0), 'have', c.wins - 1)) then
      raise exception 'entry-gates §5(e): a seat one win short, the leader''s section reads %', s; end if;
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_boss_call(0, c.call_id, 1, (q->>'price')::bigint, (k || '0000e006')::uuid);
    if v->>'error' is distinct from 'party_wins' or (select count(*) from public.account_wallet where user_id in (c_b, c_c) and gold = 100000) <> 2
       or exists (select 1 from public.hunt_sessions where user_id in (c_b, c_c) and ended_at is null) then
      raise exception 'entry-gates §5(e): a seat one win short, the call answered % (or charged)', v - 'boss_call'; end if;
    update public.player_progress set value = c.wins where user_id = c_c and slot = 0 and kind = 'stat' and key = 'ev:kill_monster:' || c.boss_id and period_key = '';
    q := public.hr_boss_call_quote(c_b, 0, c.call_id);
    v := public.hr_boss_call(0, c.call_id, 1, (q->>'price')::bigint, (k || '0000e007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.account_wallet where user_id in (c_b, c_c) and gold = 100000 - (q->>'price')::bigint) <> 2
       or (select count(*) from public.hunt_sessions where user_id in (c_b, c_c) and ended_at is null) <> 2 then
      raise exception 'entry-gates §5(e): every seat at the count, the call answered % (purses %)', v - 'boss_call',
        (select jsonb_agg(gold) from public.account_wallet where user_id in (c_b, c_c)); end if;

    raise exception using errcode = 'HRE05', message = 'entry-gates §5 complete - rolling back';
  exception when sqlstate 'HRE05' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b, c_c)) or exists (select 1 from public.player_state where user_id in (c_a, c_b, c_c))
     or exists (select 1 from public.player_progress where user_id in (c_a, c_b, c_c)) then
    raise exception 'entry-gates §5: LEAKED a probe row'; end if;
  raise notice 'entry-gates §5 OK: the Tower refuses a hero or a seat under its Level and opens at it; Call out refuses a hero or a seat short of its natural wins (called wins never count) and opens at the count; the section says both; nothing refused moved a thing';
end $chk$;
