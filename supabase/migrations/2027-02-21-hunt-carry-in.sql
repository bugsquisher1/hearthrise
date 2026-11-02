-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-21-hunt-carry-in.sql — CARRY SUPPLIES FROM THE BAG INTO THE RUNNING HUNT (lane/c-carry-in,
--   backend-architect, 2026-11-02; ruling Tyler 2026-11-02 "Yes, add a press", from Andy's report: "Action bar
--   not recognizing inventory in my backpack when action items were added during a hunt").
--
-- STATUS: STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §3, one file via the Coordinator's apply tool,
-- never inside begin/commit, never 00:00–00:10 UTC. On the EA Security list (it moves a hero's items between its
-- bag and its hunt bag). EDGE: none, pack-edge --hash unmoved (the engine already reads the hunt bag fresh at every
-- settle: hr_hunt_member_read `bag`). CLIENT: src/session/carry-intents.js (Hunt prep, the bar's Configure action)
-- rides the next release; the verb's signature and grant are today's, so either may land first.
-- ORDER: after 2027-02-20-party-leader-starts.sql. No object in common with any staged file.
--
-- ── THE GAP ─────────────────────────────────────────────────────────────────
-- Enter (hr_hunt_enter_for) moves every hunt supply in the bag into hunt_bag; the engine spends only hunt_bag, then
-- the store. A supply that reaches the bag MID-HUNT (crafted, bought, taken out of Storage, looted) sat unused, and
-- the bar struck its slot "none left", until the hero went home. hr_hunt_restock (2026-10-21-hunt-sessions.sql)
-- is the move, live and granted, with no caller in the rebuilt client. Read against today's rules it had three
-- defects, fixed here:
--   (1) THE KEY WAS READ BEFORE ANY LOCK. Two calls with one key (a double press, a resend after a lost answer)
--       both passed hr_intent_replay, queued on the character lock, and BOTH moved the stack; the second's
--       player_intents insert did nothing. Not a mint (both legs moved), but not idempotent.
--   (2) A FULL HUNT BAG REFUSED ITS OWN LINES. The upsert fires hunt_bag's BEFORE INSERT line fuse
--       (hr_hunt_bag_fuse) before ON CONFLICT is judged, so with bag_lines (10) lines open, carrying more of a kind
--       ALREADY in the bag raised check_violation (a 400, not a refusal).
--   (3) THE ANSWER CARRIED THE WHOLE SESSION VIEW into player_intents (its tally and bag), replayed as stale state.
--
-- ── THE CONTRACT (hr_hunt_restock RESTATED WHOLE; signature, grant and client baseline row kept) ──
--   hr_hunt_restock(p_slot int, p_item text, p_qty bigint, p_idem uuid) -> jsonb     authenticated; own hero only
--   ok      { ok:true, item, qty, left, have, session_id, version }: `left` the hunt bag's line after the move, `have`
--           the bag's stack after it, `version` the hero's. The same key answers the same, moving nothing.
--   refused (journalled in hr_rejections; nothing written; the key is not consumed), in the order checked:
--     not_signed_in | bad_slot | bad_idem
--     intent_mismatch   the key names another verb or slot (hr_intent_replay)
--     rate_limited      the `hunt` bucket (30 a minute, every hunt edit)
--     unknown_supply    not in hr_hunt_supplies: the catalogue Enter packs from (food, drink, ammo, runes, feasts),
--                       generated from src/data/supplies.js. Never gear, never loot.
--     bad_qty {max}     outside 1..c_max_carry (100,000: Enter's per-line max), or the line past 1,000,000 loaded
--     no_hunt           no open session: never entered, ended, forfeited (the forfeit ends the session)
--     hunt_leaving      a Leave or a change pends (the countdown home); the close returns the bag whole
--     settle_first {unsettled_ms}  the session is more than 20 s unsettled (the slack every mid-hunt edit shares)
--     too_many_lines {max}  a NEW kind past bag_lines (10); more of a kind already carried is always a line
--     insufficient_item {item, have, need}  the bag holds fewer than asked
--   Journal: ONE matched pair per move, hr_hunt_ledger_pair(..., 'hunt_pack'), exactly Enter's: the inventory side
--   -qty, the bag side +qty stamped with the session. hunt_return pairs give back qty_left at the end, so the bag
--   side of the journal equals the hunt bag at every instant (tests/hunt-sessions-db.mjs B1).
--
-- ── CONCURRENCY (the race argument; tests/hunt-sessions-settle.mjs CARRY-IN executes each order) ──
-- Locks, in order: the key's own advisory lock ('hr:intent:<user>:<key>', taken only here, before anything else),
-- then the character lock hr_hunt_lock (hr_apply's advisory key, the player_state row, the open session row), then
-- the hunt_bag line and the player_inventory row FOR UPDATE. Every writer of those rows (the settle, Enter, the
-- close, every bag verb) takes the same character lock first, so no deadlock and no interleaving inside a move.
--   A carry DURING A SETTLE (between the edge's read and hr_hunt_apply_instance's commit): the engine priced the
--     window on the line it read; the commit takes the character lock after (or before) the carry, re-checks each
--     use against the line AS IT STANDS (bag_short) and debits RELATIVELY (qty_left = qty_left - uses). So the line
--     ends at read + carried - used: the carried units are neither spent twice nor lost, and the NEXT window, which
--     reads the line fresh, spends them before the store. The settle's CAS is the instance's world_swing and each
--     session's swing_index, which a carry never moves, so it costs the settle no retry. One edge: a hero on "end the
--     hunt when supplies run out" whose read window ended heals_out / ammo_out has that end refused end_not_proven
--     (the commit re-proves it on the line that now holds stock); nothing lands, and the next fire settles on.
--   TWO CARRIES AT ONCE: the character lock queues them; the second reads the first's line and stack (fresh
--     statements under READ COMMITTED). One key twice: the key lock queues them and the second replays.
--   A CARRY RACING THE END: the close (hr_hunt_close, inside a settle or a Leave) returns qty_left under the same
--     lock. A carry first is returned whole by the close; the close first leaves no open session (no_hunt).
--   RETROACTIVITY, bounded: the next window starts at the session's settled_to, at most c_slack_ms before the carry.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new grant, RPC, table, policy or column: the verb was already authenticated-executable. The client names an
-- item and a count; both are re-checked here against the server catalogue and the hero's own locked stack, and only
-- the caller's own open session is reachable (auth.uid(); a party member carries only its own). Value-neutral: a
-- move between two of the same hero's holdings, conserving units; no gold, price or other player is touched.
-- Closed: (1) one key now moves once. FOR THE EA REVIEW: the move lets a hero bring stock into a window up to 20 s
-- old (the slack); it is the hero's own stock, and the store would have sold the same uses for gold.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- A player press, never a tick: 2 ledger rows + 1 intent row per carry (~200 B each); at a generous 20 carries a
-- hunter-day x 600 hunters, 36k rows / ~7 MB a day, below Enter's own pairs. One extra advisory lock a call.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_restock from 2026-10-21-hunt-sessions.sql (prosrc md5 b1c0df0a) and its baseline note, by hand
-- (§0 accepts only the two images). No row, column or player value moves either way.
-- No begin/commit. No cron.* write.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE BODY RESTATED IS THE ONE LIVE ────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_hunt_gap_ms(public.hunt_sessions)') is null
     or to_regprocedure('public.hr_hunt_ledger_pair(uuid,integer,uuid,uuid,text,bigint,text)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regclass('public.hr_hunt_supplies') is null then
    raise exception 'PRECONDITION: the hunt-session chain (2026-10-21-hunt-sessions.sql) is absent'; end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_src from pg_proc p
   where p.oid = to_regprocedure('public.hr_hunt_restock(integer,text,bigint,uuid)');
  if v_src is null or v_src not in ('b1c0df0a740d5c94c912aa95dae7bc17', 'b92561b2ab9d0675c10c9084c75e6ad7') then
    raise exception 'PRECONDITION: hr_hunt_restock prosrc md5 is %, expected the live b1c0df0a (2026-10-21-hunt-sessions.sql) or this file''s. Re-cut this file.', v_src; end if;
end $mig$;

-- ── §1 THE VERB ─────────────────────────────────────────────────────────────
create or replace function public.hr_hunt_restock(p_slot int, p_item text, p_qty bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  -- CARRY-IN (2027-02-21-hunt-carry-in.sql): a hunting hero carries supplies from its bag into its running hunt.
  c_verb      constant text   := 'hunt_restock';
  -- The mid-hunt slack every hunt edit shares (2026-10-21-hunt-sessions.sql §4: two world ticks).
  c_slack_ms  constant bigint := 20000;
  -- ONE CALL moves at most what one Enter line may (hr_hunt_enter_check `bad_qty`).
  c_max_carry constant bigint := 100000;
  -- A LINE never holds more than hunt_bag.qty_loaded's own CHECK.
  c_max_line  constant bigint := 1000000;
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_have bigint;
  v_line public.hunt_bag%rowtype;
  v_left bigint;
  v_ver  bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- THE KEY'S OWN LOCK, then its replay: two calls with one key (a double press, a resend after a lost answer, on
  -- any slot) queue here, and the second answers the first's stored result instead of moving the stack again.
  perform pg_advisory_xact_lock(hashtextextended('hr:intent:' || v_uid::text || ':' || p_idem::text, 0));
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- WHAT MAY BE CARRIED: the server catalogue Enter packs from; never gear, never loot.
  if p_item is null or not exists (select 1 from public.hr_hunt_supplies where item_id = p_item) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_supply')); end if;
  if p_qty is null or p_qty < 1 or p_qty > c_max_carry then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty', 'max', c_max_carry)); end if;

  -- THE CHARACTER LOCK and the caller's own open session: never another hero's, never an ended or forfeited one.
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  if v_s.id is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_hunt')); end if;
  if v_s.leave_at is not null or v_s.change_at is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_leaving')); end if;
  if public.hr_hunt_gap_ms(v_s) > c_slack_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'settle_first',
      'unsettled_ms', public.hr_hunt_gap_ms(v_s))); end if;
  select * into v_line from public.hunt_bag where session_id = v_s.id and item_id = p_item for update;
  if v_line.session_id is null
     and (select count(*) from public.hunt_bag where session_id = v_s.id) >= public.hr_hunt_limit('bag_lines') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'too_many_lines',
      'max', public.hr_hunt_limit('bag_lines'))); end if;
  if coalesce(v_line.qty_loaded, 0) + p_qty > c_max_line then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty',
      'max', c_max_line - coalesce(v_line.qty_loaded, 0))); end if;
  select qty into v_have from public.player_inventory
   where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  if coalesce(v_have, 0) < p_qty then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item',
      'item', p_item, 'have', coalesce(v_have, 0), 'need', p_qty)); end if;

  -- THE MOVE: the bag's stack down and the hunt bag's line up by the same units (loaded is what came in, left what
  -- the settle may still spend), then one matched pair in the journal, as Enter packs.
  if v_have = p_qty then
    delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;
  else
    update public.player_inventory set qty = qty - p_qty where user_id = v_uid and slot = p_slot and item_id = p_item;
  end if;
  -- A kind already carried grows its line (an UPDATE: the line fuse is an INSERT trigger, so a full bag still takes
  -- more of what it holds); a new kind is a new line, under the fuse.
  if v_line.session_id is null then
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_s.id, v_uid, p_slot, p_item, p_qty, p_qty, (select essential from public.hr_hunt_supplies where item_id = p_item))
      returning qty_left into v_left;
  else
    update public.hunt_bag set qty_loaded = qty_loaded + p_qty, qty_left = qty_left + p_qty
     where session_id = v_s.id and item_id = p_item
     returning qty_left into v_left;
  end if;
  perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_s.id, p_item, p_qty, 'hunt_pack');
  update public.hunt_sessions set version = version + 1 where id = v_s.id;
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot
    returning version into v_ver;
  v_r := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty, 'left', v_left, 'have', v_have - p_qty,
                            'session_id', v_s.id, 'version', v_ver);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §2 GRANTS: revoke-then-grant; the client baseline row says what it is now ──
revoke execute on function public.hr_hunt_restock(integer, text, bigint, uuid) from public;
revoke execute on function public.hr_hunt_restock(integer, text, bigint, uuid) from anon, service_role;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_restock(integer, text, bigint, uuid) from %I', v_role); end if;
  end loop;
end $grants$;
grant  execute on function public.hr_hunt_restock(integer, text, bigint, uuid) to authenticated;
update public.hr_client_rpc_baseline
   set note = 'added 2026-10-21 (hunt sessions C1); restated 2027-02-21 (carry-in, Tyler 2026-11-02): carry a hunt supply from the own bag into the own running hunt; catalogue item, 1..100000, stock under lock, one key moves once; matched pair'
 where proname = 'hr_hunt_restock' and grantee = 'authenticated';

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
do $$
declare
  c_a  constant uuid := '000000d6-0000-4000-a000-0000ca771001';   -- the hunter
  c_b  constant uuid := '000000d6-0000-4000-a000-0000ca771002';   -- another account's hero
  k    constant text := '000000d6-0000-4000-b000-0000';
  v    jsonb; v2 jsonb;
  v_hunt text; v_sid uuid; v_sup text; v_gear text; v_kinds text[]; v_k text;
  v_inv0 bigint; v_n int; v_pair int;
  v_sv bigint; v_pv bigint;
begin
  -- (a) THE SHAPE: the body is this file's; a signed-in client asks, nobody else; hygiene STRICT is green; the key's
  --     lock comes before its replay.
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = 'public.hr_hunt_restock(integer,text,bigint,uuid)'::regprocedure)
     <> 'b92561b2ab9d0675c10c9084c75e6ad7' then
    raise exception 'hunt-carry-in §3(a): the installed body is not this file''s'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_restock(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_restock(integer,text,bigint,uuid)', 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine') and has_function_privilege('hr_engine', 'public.hr_hunt_restock(integer,text,bigint,uuid)', 'execute'))
     or not has_function_privilege('authenticated', 'public.hr_hunt_restock(integer,text,bigint,uuid)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = 'public.hr_hunt_restock(integer,text,bigint,uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'hunt-carry-in §3(a): the grants are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  if (select strpos(p.prosrc, 'pg_advisory_xact_lock(hashtextextended(''hr:intent:''') from pg_proc p where p.oid = 'public.hr_hunt_restock(integer,text,bigint,uuid)'::regprocedure) = 0
     or (select strpos(p.prosrc, 'pg_advisory_xact_lock(hashtextextended(''hr:intent:''') > strpos(p.prosrc, 'hr_intent_replay(') from pg_proc p where p.oid = 'public.hr_hunt_restock(integer,text,bigint,uuid)'::regprocedure) then
    raise exception 'hunt-carry-in §3(a): the key is replayed before its lock is taken'; end if;

  begin
    -- THE PROBE: a hero hunting the lowest ground with ONE kind packed, more of it and nine other kinds in its bag.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select array_agg(item_id order by item_id) into v_kinds from (select item_id from public.hr_hunt_supplies order by item_id limit 11) s;
    v_sup := v_kinds[1];
    select i.item_id into v_gear from public.hr_items i
     where not exists (select 1 from public.hr_hunt_supplies s where s.item_id = i.item_id) order by i.item_id limit 1;
    if v_hunt is null or coalesce(array_length(v_kinds, 1), 0) < 11 or v_gear is null then
      raise exception 'hunt-carry-in §3-harness: no ground (%), fewer than 11 supplies, or no non-supply item', v_hunt; end if;
    foreach v_k in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_k::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_k::uuid, 'hunt-carry-in §3 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_k, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'hunt-carry-in §3-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    delete from public.player_inventory where user_id = c_a and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) select c_a, 0, x, 3 from unnest(v_kinds) x;
    update public.player_inventory set qty = 20 where user_id = c_a and slot = 0 and item_id = v_sup;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_a, 0, v_gear, 1);
    select coalesce(sum(qty), 0) into v_inv0 from public.player_inventory where user_id = c_a and slot = 0;
    v := public.hr_hunt_enter(0, v_hunt, jsonb_build_array(jsonb_build_object('item', v_sup, 'qty', 5)), 0, null, (k || '00000c01')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-carry-in §3-harness: enter refused: %', v; end if;
    v_sid := (v->'session'->>'id')::uuid;

    -- (b) ★ THE CARRY: 3 more of the packed kind; the bag's stack down 3, the line up 3 (loaded and left), one
    --     matched pair stamped with the session, both versions moved, the answer says the server's numbers.
    select version into v_sv from public.hunt_sessions where id = v_sid;
    select version into v_pv from public.player_state where user_id = c_a and slot = 0;
    select count(*) into v_pair from public.player_ledger where user_id = c_a and slot = 0 and kind = 'hunt' and intent = 'hunt_pack';
    v := public.hr_hunt_restock(0, v_sup, 3, (k || '00000c02')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'left')::bigint <> 8 or (v->>'have')::bigint <> 12 or (v->>'qty')::bigint <> 3
       or (v->>'session_id')::uuid <> v_sid then
      raise exception 'hunt-carry-in §3(b): the carry answered %', v; end if;
    if (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = v_sup) <> 12
       or (select qty_loaded from public.hunt_bag where session_id = v_sid and item_id = v_sup) <> 8
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_sup) <> 8 then
      raise exception 'hunt-carry-in §3(b): the bag holds % and the line %/%', (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = v_sup),
        (select qty_loaded from public.hunt_bag where session_id = v_sid and item_id = v_sup), (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_sup); end if;
    if (select count(*) from public.player_ledger where user_id = c_a and slot = 0 and kind = 'hunt' and intent = 'hunt_pack') <> v_pair + 2
       or not exists (select 1 from public.player_ledger where user_id = c_a and slot = 0 and intent = 'hunt_pack' and item_id = v_sup
                       and qty = 3 and meta->>'side' = 'bag' and session_id = v_sid)
       or not exists (select 1 from public.player_ledger where user_id = c_a and slot = 0 and intent = 'hunt_pack' and item_id = v_sup
                       and qty = -3 and meta->>'side' = 'inventory' and session_id is null) then
      raise exception 'hunt-carry-in §3(b): the carry is not one matched pair'; end if;
    if (select version from public.hunt_sessions where id = v_sid) <> v_sv + 1
       or (select version from public.player_state where user_id = c_a and slot = 0) <> v_pv + 1
       or (v->>'version')::bigint <> v_pv + 1 then
      raise exception 'hunt-carry-in §3(b): the versions did not move by one'; end if;

    -- (c) ★ ONE KEY MOVES ONCE: the same key answers the same and moves nothing; a key another verb holds is refused.
    v2 := public.hr_hunt_restock(0, v_sup, 3, (k || '00000c02')::uuid);
    if v2 is distinct from v or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = v_sup) <> 12
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_sup) <> 8 then
      raise exception 'hunt-carry-in §3(c): a replay answered % and moved the stack', v2; end if;
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (c_a, (k || '00000c03')::uuid, 0, 'hunt_leave', '{"ok":true}'::jsonb, now());
    v := public.hr_hunt_restock(0, v_sup, 1, (k || '00000c03')::uuid);
    if v->>'error' is distinct from 'intent_mismatch' then raise exception 'hunt-carry-in §3(c): another verb''s key answered %', v; end if;

    -- (d) WHAT MAY NOT BE CARRIED, AND HOW MANY: a non-supply (gear or loot) in the bag; 0; past one call; past the stack.
    v := public.hr_hunt_restock(0, v_gear, 1, (k || '00000c04')::uuid);
    if v->>'error' is distinct from 'unknown_supply' then raise exception 'hunt-carry-in §3(d): a non-supply answered %', v; end if;
    v := public.hr_hunt_restock(0, v_sup, 0, (k || '00000c05')::uuid);
    if v->>'error' is distinct from 'bad_qty' then raise exception 'hunt-carry-in §3(d): 0 answered %', v; end if;
    v := public.hr_hunt_restock(0, v_sup, 100001, (k || '00000c06')::uuid);
    if v->>'error' is distinct from 'bad_qty' then raise exception 'hunt-carry-in §3(d): 100001 answered %', v; end if;
    v := public.hr_hunt_restock(0, v_sup, 13, (k || '00000c07')::uuid);
    if v->>'error' is distinct from 'insufficient_item' or (v->>'have')::bigint <> 12 or (v->>'need')::bigint <> 13 then
      raise exception 'hunt-carry-in §3(d): 13 of 12 answered %', v; end if;
    if (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = v_sup) <> 12
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = v_sup) <> 8 then
      raise exception 'hunt-carry-in §3(d): a refusal moved the stack'; end if;

    -- (e) ★ A FULL HUNT BAG: nine more kinds fill it to bag_lines; more of a kind it holds still lands (the old upsert
    --     raised check_violation in the line fuse); an eleventh kind is refused by name.
    for i in 2 .. 10 loop
      v := public.hr_hunt_restock(0, v_kinds[i], 1, (k || lpad(to_hex(3328 + i), 8, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-carry-in §3(e): kind % answered %', i, v; end if;
    end loop;
    if (select count(*) from public.hunt_bag where session_id = v_sid) <> public.hr_hunt_limit('bag_lines') then
      raise exception 'hunt-carry-in §3(e): the hunt bag holds % lines', (select count(*) from public.hunt_bag where session_id = v_sid); end if;
    v := public.hr_hunt_restock(0, v_sup, 2, (k || '00000c20')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'left')::bigint <> 10 then raise exception 'hunt-carry-in §3(e): more of a carried kind in a full bag answered %', v; end if;
    v := public.hr_hunt_restock(0, v_kinds[11], 1, (k || '00000c21')::uuid);
    if v->>'error' is distinct from 'too_many_lines' then raise exception 'hunt-carry-in §3(e): an eleventh kind answered %', v; end if;

    -- (f) OWN HERO ONLY: another account's signed-in hero carries into ITS hunt, which it has none of.
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_hunt_restock(0, v_sup, 1, (k || '00000c30')::uuid);
    if v->>'error' is distinct from 'no_hunt' then raise exception 'hunt-carry-in §3(f): a hero with no hunt answered %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);

    -- (g) THE SLACK, THE COUNTDOWN, THE END: 21 s unsettled is settle_first; a pending Leave is hunt_leaving; once the
    --     session closes, no_hunt, and the close gave back every unit loaded (the bag whole again: nothing was spent).
    update public.hunt_sessions set entered_at = now() - interval '2 minutes', hunt_from = now() - interval '2 minutes',
                                    settled_to = now() - interval '21 seconds', next_swing_at = now() - interval '21 seconds' where id = v_sid;
    v := public.hr_hunt_restock(0, v_sup, 1, (k || '00000c40')::uuid);
    if v->>'error' is distinct from 'settle_first' then raise exception 'hunt-carry-in §3(g): 21 s unsettled answered %', v; end if;
    update public.hunt_sessions set settled_to = now() - interval '19 seconds', next_swing_at = now() - interval '19 seconds', leave_at = now() + interval '10 seconds' where id = v_sid;
    v := public.hr_hunt_restock(0, v_sup, 1, (k || '00000c41')::uuid);
    if v->>'error' is distinct from 'hunt_leaving' then raise exception 'hunt-carry-in §3(g): a pending Leave answered %', v; end if;
    perform public.hr_hunt_close(v_sid, 'left', now(), true);
    v := public.hr_hunt_restock(0, v_sup, 1, (k || '00000c42')::uuid);
    if v->>'error' is distinct from 'no_hunt' then raise exception 'hunt-carry-in §3(g): an ended hunt answered %', v; end if;
    if (select coalesce(sum(qty), 0) from public.player_inventory where user_id = c_a and slot = 0) <> v_inv0
       or (select qty from public.player_inventory where user_id = c_a and slot = 0 and item_id = v_sup) <> 20
       or exists (select 1 from public.hunt_bag where session_id = v_sid and qty_left <> 0)
       or (select coalesce(sum(qty), 0) from public.player_ledger where session_id = v_sid and kind = 'hunt' and meta->>'side' = 'bag') <> 0 then
      raise exception 'hunt-carry-in §3(g): the close did not give back exactly what was carried (bag %, start %)',
        (select coalesce(sum(qty), 0) from public.player_inventory where user_id = c_a and slot = 0), v_inv0; end if;

    raise exception using errcode = 'HRC21', message = 'hunt-carry-in §3 complete - rolling back';
  exception when sqlstate 'HRC21' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) then raise exception 'hunt-carry-in §3: LEAKED a probe row'; end if;
  raise notice 'hunt-carry-in: a hunting hero carries its own supplies into its own hunt, once per key, as one matched pair; all green';
end $$;
