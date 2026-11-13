-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-08-member-write-once.sql — A HUNT MEMBER'S SESSION ROW AND TALLY ROW ARE WRITTEN ONCE LESS A COMMIT
--   (lane/r-commit-cost, reliability-engineer, 2026-11-11). Evidence: .claude/coordination/commit-cost-2026-11-11.md.
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (the apply tool, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §3. ON THE EA SECURITY LIST: hr_hunt_apply_member is on the settle path that credits gold and XP (no value,
-- clamp, refusal or ledger row moves; §3(b) proves it by running one window under both bodies). EDGE: none. CLIENT: none.
-- ORDER: after 2027-02-21-tick-gateway-apikey.sql and every file that restates hr_hunt_apply_member up to
-- 2027-03-25-death-share.sql; independent of 2027-03-30-dead-writes.sql / -31-watched-settle-cost.sql (they edit hr_apply
-- and the edge, not this body) and of 2027-04-08-progress-hot.sql. Its three anchors pin only the lines it changes.
-- RESTATEMENT-DEBT-ACK: hr_hunt_apply_member takes three anchored edits, each matched exactly once, so this file applies in
-- either order with any lane in flight that edits other lines of it.
--
-- WHAT A COMMIT WROTE TWICE (tools/commit-cost.mjs --audit: every row a party-of-four commit writes, with the line that wrote
-- it; Coppercap Warrens, Level 40, one account, the world tick's commit):
--   hunt_sessions       4 rows, 8 writes. hr_hunt_settle_session moves the clock; then this body's last statement rewrote
--                       unit_id to the value it already held, every member, every window: 4 updates that change NO column,
--                       each a new row version and 636 WAL bytes a commit.
--   hunt_session_tally  4 rows, up to 12 writes. The session half's fold, then the store bill's `bought`/`supply_gold`, then
--                       the analyzer's `dealt`/`taken`/`healed`/`fight`/`xp_event`: two separate updates of one row whose
--                       columns do not overlap, 10 tally writes a commit in the measured mix.
-- THE CHANGE (hr_hunt_apply_member only).
--   1  the unit_id write happens only when the value moves (the hero left, or the engine named a new unit)
--   2  the store bill's tally increments ride the analyzer's update: ONE tally write after the session half, holding both
--      (taken where the bill was; the analyzer's own guard `analyzer or xp_event` widened by `or v_cost > 0`; each column
--      keeps its own condition, so a window with a bill and no analyzer adds nothing to dealt/taken/healed/fight)
--   Values do not move: both writes are additions to columns nothing reads between the old and the new place (the session
--   half reads ledger_hwm only; hr_hunt_view, hr_tally_count and the instance's bill read after the member returns).
-- WHAT IT DOES NOT TOUCH. The session half's own tally fold (a third write is folded only by changing hr_hunt_settle_session's
--   contract: the backend-architect's call, listed in the evidence file). player_state (4 writes a member) and the account
--   purse (6 writes a party commit) stay as they are: measured at 2,922 and 826 WAL bytes a commit (7% and 2%), and each
--   write there carries a running balance or a proof the next statement reads. Not worth a money-path restructure.
--
-- EXPLOIT SURFACE DELTA: none. No input is read that was not read before; every clamp and refusal is ahead of the moved write,
--   unchanged. No grant (CREATE OR REPLACE keeps them; §3(c) asserts them).
-- CONCURRENCY / IDEMPOTENCY: under the same character and session locks as before. A second apply finds the marker and skips
--   the splice (byte-identical).
-- REVERSIBILITY: §1's a[] is the pre-image: replace r[i] with a[i] on the landed body (§3(b) does exactly that to run the
--   old body). No row or value is lost either way. COST: −1 row version a member a commit (the unit), −1 a member a window
--   with a store bill (the tally). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)') is null then
    raise exception 'PRECONDITION: the hunt commit (hr_hunt_apply_instance / hr_hunt_apply_member) is missing'; end if;
end $mig$;

-- ── §1 hr_hunt_apply_member: THREE ANCHORED EDITS (a[i] is the pre-image, verbatim; r[i] replaces it) ─────────────
--   1  the store bill's tally write: removed here (it rides edit 2)
--   2  the analyzer's tally write: carries the bill too
--   3  the unit's write: only when it moves
-- The (a, r) pairs are kept for §3 in a temporary table: §3 rebuilds the pre-image from the landed body by putting a back.
create temporary table if not exists mwo_pairs (i int, a text, r text) on commit drop;
do $mig$
declare
  c_sig constant text := 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
  v_def text; v_n int;
  a constant text[] := array[
$a$    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
$a$,
$a$  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' then
    update public.hunt_session_tally t
       set xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)),
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
$a$,
$a$  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
$a$];
  r constant text[] := array[
$a$    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
$a$,
$a$  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
$a$,
$a$  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
$a$];
begin
  delete from mwo_pairs;
  insert into mwo_pairs select i, a[i], r[i] from generate_subscripts(a, 1) i;
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('MEMBER-WRITE-ONCE' in v_def) > 0 then
    raise notice 'member-write-once §1: hr_hunt_apply_member already carries the edit - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'member-write-once §1: hr_hunt_apply_member anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants (§3(c) asserts them).
  execute v_def;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image: (a) by text; (b) the same window under both bodies differs in writes (it must not differ in rows).
--   (a) the landed body: the unit write is conditional, the bill's tally write is gone from before the session half and
--       rides the analyzer's write, each exactly once
--   (b) THE PINNED SETTLE, A/B: a probe hero on the cheapest ground, one window of 4 swings with an analyzer and a store
--       bill, sent through hr_hunt_apply_instance as hr_engine twice from the same state: under the pre-image body (rolled
--       back) and under the landed one. Every row either writes (ledger, tally, session, character, purse, events,
--       inventory, progress, the intent) and the answer must be identical, sequence ids aside; the ledger row count too.
--       The landed body writes the session row once (the session half's clock) and the tally row twice (the session half's
--       fold, then the one analyzer-and-bill write), row versions counted.
--   (c) grants: no client role executes it
do $$
declare
  c_sig  constant text := 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
  c_u    constant uuid := '000000d7-0000-4000-a000-00000000b409';
  c_k    constant uuid := '000000d7-0000-4000-a000-0000000c0de1';
  v_def  text; v_pre text; v_x record;
  v      jsonb; v_g text; v_s public.hunt_sessions%rowtype; v_i public.hunt_instances%rowtype;
  v_at   timestamptz; v_t bigint; v_mto timestamptz; v_to timestamptz; v_ver bigint; v_s0 bigint; v_buy text;
  v_a    jsonb; v_b jsonb; v_ra jsonb; v_rb jsonb;
  v_su0  bigint; v_tu0 bigint;
  c_sw   constant int := 4;
begin
  -- (a)
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if (length(v_def) - length(replace(v_def, 'and unit_id is distinct from (case when ended_at is null then v_unit_id end)', '')))
       / length('and unit_id is distinct from (case when ended_at is null then v_unit_id end)') <> 1
     or (length(v_def) - length(replace(v_def, 'update public.hunt_session_tally t', ''))) / length('update public.hunt_session_tally t') <> 2
     or (length(v_def) - length(replace(v_def, 'supply_gold = t.supply_gold + v_cost', ''))) / length('supply_gold = t.supply_gold + v_cost') <> 1
     or position('or p_hunt ? ''xp_event'' or v_cost > 0 then' in v_def) = 0 then
    raise exception 'member-write-once §3(a): hr_hunt_apply_member does not carry the three edits exactly once'; end if;
  -- the pre-image: the landed body with every a[i] put back (the file's documented rollback, executed)
  v_pre := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  for v_x in select * from mwo_pairs order by i loop v_pre := replace(v_pre, v_x.r, v_x.a); end loop;
  if v_pre is null or v_pre = v_def or position('MEMBER-WRITE-ONCE' in v_pre) > 0 then
    raise exception 'member-write-once §3-harness: no pre-image to run'; end if;

  begin
    -- THE PROBE: a hero on the cheapest ground, its store switched on, the hunt four swings old.
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'member-write-once §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'member-write-once §3-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    insert into public.account_wallet (user_id, gold) values (c_u, 1000) on conflict (user_id) do update set gold = 1000;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    update public.hr_hunt_config set enabled = true where id;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'member-write-once §3-harness: the enter answered %', v; end if;
    select * into v_s from public.hunt_sessions where user_id = c_u and slot = 0 and ended_at is null;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_action_set_options(0, v_s.preset, '{"supply_source": "store"}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'member-write-once §3-harness: the store setting answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    v_t := public.hr_hunt_limit('swing_interval_ms');
    v_at := date_trunc('second', now()) - make_interval(secs => (c_sw + 1) * v_t / 1000.0);
    -- the hero's unit is 7 and the engine names 7 again: the old body rewrote it, the new one does not
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at, unit_id = 7 where id = v_s.id;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_s.instance_id;
    select * into v_s from public.hunt_sessions where id = v_s.id;
    select * into v_i from public.hunt_instances where id = v_s.instance_id;
    select q.basic_id into v_buy from public.hr_hunt_basic_supplies q where q.kind = 'ammo' order by q.price, q.basic_id limit 1;
    v_mto := v_s.settled_to + make_interval(secs => c_sw * v_t / 1000.0);
    v_to := v_i.settled_to + make_interval(secs => c_sw * v_t / 1000.0);
    v_s0 := public.hr_stamina_of(c_u, 0, v_s.settled_to);
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    -- the window, as the engine proposes it: no kill, one store shot bought and spent, an analyzer line
    execute $f$
      create or replace function pg_temp.mwo_window(p_inst uuid, p_from bigint, p_settle jsonb, p_members jsonb) returns jsonb
      language plpgsql as $b$
      declare v jsonb;
      begin
        execute 'set local role hr_engine';
        v := public.hr_hunt_apply_instance(p_inst, p_from, p_settle, p_members, null, null);
        execute 'reset role';
        return v;
      end $b$ $f$;
    -- every row the window can write, sequence ids aside (now() is one instant in this transaction, so both runs stamp alike)
    execute $f$
      create or replace function pg_temp.mwo_rows(p_u uuid, p_sid uuid, p_inst uuid) returns jsonb
      language sql as $b$
        select jsonb_build_object(
          'ledger', (select coalesce(jsonb_agg(to_jsonb(x) - 'id' order by (to_jsonb(x) - 'id')::text), '[]') from public.player_ledger x where x.user_id = p_u),
          -- the fold's high-water mark is a ledger id (a sequence: A's ids are burnt), so it is compared as a rank among the probe's rows
          'tally', (select (to_jsonb(x) - 'ledger_hwm') || jsonb_build_object('ledger_hwm_rank', (select count(*) from public.player_ledger l where l.user_id = p_u and l.id <= x.ledger_hwm))
                      from public.hunt_session_tally x where x.session_id = p_sid),
          'session', (select to_jsonb(x) from public.hunt_sessions x where x.id = p_sid),
          'instance', (select to_jsonb(x) from public.hunt_instances x where x.id = p_inst),
          'state', (select to_jsonb(x) from public.player_state x where x.user_id = p_u),
          'purse', (select to_jsonb(x) from public.account_wallet x where x.user_id = p_u),
          'events', (select coalesce(jsonb_agg(to_jsonb(x) - 'id' order by (to_jsonb(x) - 'id')::text), '[]') from public.hunt_session_events x where x.session_id = p_sid),
          'inventory', (select coalesce(jsonb_agg(to_jsonb(x) order by x.item_id), '[]') from public.player_inventory x where x.user_id = p_u),
          'progress', (select coalesce(jsonb_agg(to_jsonb(x) order by (to_jsonb(x))::text), '[]') from public.player_progress x where x.user_id = p_u),
          'skills', (select coalesce(jsonb_agg(to_jsonb(x) order by x.skill_id), '[]') from public.player_skills x where x.user_id = p_u),
          'intents', (select coalesce(jsonb_agg(to_jsonb(x) order by x.intent_id), '[]') from public.player_intents x where x.user_id = p_u),
          'bag', (select coalesce(jsonb_agg(to_jsonb(x) order by (to_jsonb(x))::text), '[]') from public.hunt_bag x where x.session_id = p_sid))
      $b$ $f$;
    v := jsonb_build_object(
      'settle', jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + c_sw, 'world', null),
      'members', jsonb_build_array(jsonb_build_object('user', c_u, 'slot', 0, 'session', v_s.id, 'version', v_ver, 'intent', c_k,
        'delta', jsonb_build_object('accrued_to', v_mto, 'level_xp', 0,
          'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
            'meta', jsonb_build_object('ms', c_sw * v_t, 'ticks', c_sw, 'kills', 0, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto))),
        'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + c_sw, 'to', v_mto,
          'next_swing_at', v_mto, 'uses', '{}'::jsonb, 'paid_ms', c_sw * v_t, 'raw_xp', '{}'::jsonb,
          'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
          'buys', jsonb_build_object(v_buy, 1), 'cover', '{}'::jsonb,
          'stamina', greatest(0, v_s0 - c_sw * v_t), 'death_xp', '[]'::jsonb, 'unit_id', 7, 'tick_ms', v_t),
        'analyzer', jsonb_build_object('dealt', '{"byAbility": {"probe_skill": 7}}'::jsonb, 'taken', '{"byMonster": {"probe_mon": 3}}'::jsonb))));

    -- A: the pre-image body, its rows read, all of it rolled back
    begin
      execute v_pre;
      v_ra := pg_temp.mwo_window(v_i.id, v_i.world_swing, v->'settle', v->'members');
      v_a := pg_temp.mwo_rows(c_u, v_s.id, v_i.id);
      raise exception 'mwo-a' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;
    if position('MEMBER-WRITE-ONCE' in replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '')) = 0 then
      raise exception 'member-write-once §3-harness: the landed body did not come back after A'; end if;
    -- B: the landed body
    v_su0 := pg_stat_get_xact_tuples_updated('public.hunt_sessions'::regclass);
    v_tu0 := pg_stat_get_xact_tuples_updated('public.hunt_session_tally'::regclass);
    v_rb := pg_temp.mwo_window(v_i.id, v_i.world_swing, v->'settle', v->'members');
    v_b := pg_temp.mwo_rows(c_u, v_s.id, v_i.id);
    if coalesce(v_rb->>'ok', '') <> 'true' or coalesce(v_ra->>'ok', '') <> 'true' then
      raise exception 'member-write-once §3(b)-harness: the window did not land: A % / B %', v_ra, v_rb; end if;
    if (v_b->'tally'->>'supply_gold')::bigint <= 0 or v_b->'tally'->'dealt' = '{}'::jsonb then
      raise exception 'member-write-once §3(b)-harness: the window carried no bill or no analyzer: %', v_b->'tally'; end if;
    if jsonb_array_length(coalesce(v_a->'ledger', '[]')) <> jsonb_array_length(coalesce(v_b->'ledger', '[]'))
       or jsonb_array_length(coalesce(v_b->'ledger', '[]')) = 0 then
      raise exception 'member-write-once §3(b): % ledger rows under the old body, % under the new',
        jsonb_array_length(coalesce(v_a->'ledger', '[]')), jsonb_array_length(coalesce(v_b->'ledger', '[]')); end if;
    if v_a <> v_b or regexp_replace(v_ra::text, '"id": [0-9]+', '"id": #', 'g') <> regexp_replace(v_rb::text, '"id": [0-9]+', '"id": #', 'g') then
      raise exception 'member-write-once §3(b): the same window wrote different rows: % / %',
        (select jsonb_object_agg(k, jsonb_build_object('old', v_a->k, 'new', v_b->k)) from jsonb_object_keys(v_b) k where v_a->k is distinct from v_b->k),
        case when v_ra::text <> v_rb::text then left(v_ra::text, 400) || ' / ' || left(v_rb::text, 400) else 'answers equal' end; end if;
    if pg_stat_get_xact_tuples_updated('public.hunt_sessions'::regclass) - v_su0 <> 1
       or pg_stat_get_xact_tuples_updated('public.hunt_session_tally'::regclass) - v_tu0 <> 2 then
      -- the session: the session half's clock alone (the unit did not move); the tally: the session half's fold + the one
      -- analyzer-and-bill write
      raise exception 'member-write-once §3(b): the landed body wrote the session % and the tally % times (want 1 and 2)',
        pg_stat_get_xact_tuples_updated('public.hunt_sessions'::regclass) - v_su0, pg_stat_get_xact_tuples_updated('public.hunt_session_tally'::regclass) - v_tu0; end if;
    raise exception 'member-write-once §3: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'member-write-once §3: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.hunt_sessions where user_id = c_u) then
    raise exception 'member-write-once §3: LEAKED a probe row'; end if;

  -- (c)
  if has_function_privilege('anon', c_sig, 'execute') or has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then
    raise exception 'member-write-once §3(c): a client role executes hr_hunt_apply_member'; end if;
  perform public.hr_assert_grant_hygiene(true);
  drop table if exists mwo_pairs;
  raise notice 'member-write-once: the unit is written only when it moves, the bill rides the analyzer''s tally write, the same window writes the same rows under both bodies; all green';
end $$;
