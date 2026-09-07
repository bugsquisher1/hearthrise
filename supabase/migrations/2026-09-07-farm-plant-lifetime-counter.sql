-- 2026-09-07-farm-plant-lifetime-counter.sql
--
-- STAGED - REVIEW ONLY, NOT AUTO-APPLIED.
-- The Coordinator applies this by hand (tools/apply-migration.mjs, one file,
-- one txn) AFTER a Security GO: player_progress rows are the input hr_claim_goal
-- and hr_claim_quest grade GOLD, GEMS and XP against, so any writer of that
-- table is a money surface even when the key it writes has no paying reader yet.
--
-- ==========================================================================
-- THE BUG: THE PLANT COUNTER HAS ONE HALF, THE HARVEST COUNTER HAS TWO
-- ==========================================================================
-- hr_farm_harvest stamps BOTH progress rows for its event:
--     kind='daily', key='ev:harvest', period_key=<UTC day>   (the period row)
--     kind='stat',  key='ev:harvest', period_key=''          (the LIFETIME row)
-- hr_farm_plant stamps only the first. The b461 patch that added it
-- (2026-08-23-modal-goal-claims.sql §5) said so in a comment that was true when
-- it was written - "no lifetime twin because no quest reads one" - and is now
-- false: the client mirrors the LIFETIME rows into G.stats.* (branch
-- fix/farm-goal-counters-projected, merged to main), and DAILY_GOAL_POOL's
-- 'plant' row grades `stats.planted - dayStartBaseline`. With no lifetime row
-- stats.planted is frozen at 0 for every player for ever, the subtraction is
-- always 0, and the "Plant N crops" daily can never move in the panel no matter
-- how much the player farms. Farming sat at ZERO plants/day for ten days
-- (2026-08-27 -> 09-06); this is one of the reasons a returning farmer sees no
-- progress for real work.
--
-- This file adds the twin, next to the existing daily stamp, in exactly the
-- shape hr_farm_harvest uses - same columns, same conflict target, same
-- additive DO UPDATE, same state='active', period_key=''. Nothing else moves.
--
-- ==========================================================================
-- WHY AN ANCHORED PROGRAMMATIC PATCH AND NOT A create-or-replace RESTATEMENT
-- ==========================================================================
-- Both forms were on the table. The patch wins on three counts:
--   1. hr_farm_plant's ~150-line body has TWO authors already
--      (2026-08-22-server-farming-complete.sql wrote it,
--      2026-08-23-modal-goal-claims.sql §5 patched it). A restatement would make
--      THIS file the last toucher of that body, and a restatement built from
--      repo text that has drifted from production silently REVERTS whatever it
--      did not know about - the b484-b487 wave, twice over.
--   2. The change is four executable lines. A 150-line create-or-replace to add
--      four lines puts ~146 lines of unreviewed surface in front of Security for
--      nothing.
--   3. The anchor is a HARD gate: the exact daily-stamp statement must appear
--      exactly once or the migration aborts. A patch that cannot find its anchor
--      fails closed; a restatement cannot fail at all - it just wins.
-- The anchor text was read from PRODUCTION with pg_get_functiondef on
-- 2026-09-07 (read-only MCP), not from the repo template, and matches the b461
-- patch byte for byte.
--
-- ==========================================================================
-- BACKFILL - MEASURED, NOT INVENTED
-- ==========================================================================
-- Every successful hr_farm_plant writes exactly ONE player_ledger row
-- (kind='farm', intent='farm_plant', qty=-1: one seed debited per call), so
-- count(*) per (user_id, slot) IS the lifetime plant count. Verified read-only
-- on production 2026-09-07: 120 rows, qty sum -120, 27 (user_id, slot) groups,
-- all 27 with a live player_state row, max 13 plants, and zero existing
-- stat/'ev:planted' rows. Completeness verified too: hr_ledger_prune keeps 90
-- days (hr_ledger_config.retain_days = 90) and rolls the remainder into
-- player_ledger_rollup, which is EMPTY - no farm row has ever been pruned - and
-- the oldest ledger row (2026-08-23 04:04 UTC) predates the first plant
-- (2026-08-23 04:46 UTC). §3 re-asserts that emptiness AT APPLY TIME and SKIPS
-- the backfill with a notice rather than writing a count it cannot stand behind.
-- ON CONFLICT DO NOTHING: a re-apply, or a row the RPC has already grown past
-- the ledger count, is never overwritten and never doubled.
--
-- ORDER: AFTER 2026-08-22-server-farming-complete.sql (creates hr_farm_plant)
-- and AFTER 2026-08-23-modal-goal-claims.sql (adds the daily stamp this file
-- anchors on). §1 fails closed on both.
-- NO EDGE CHANGE (the accrual engine never plants; hr_apply's progress ops are
-- untouched). NO CLIENT CHANGE required - the projection half is already on main.
-- REVERSIBILITY: re-apply 2026-08-22-server-farming-complete.sql then
-- 2026-08-23-modal-goal-claims.sql to restore the daily-only body; the
-- backfilled stat rows are ordinary counters and can be deleted with
--   delete from public.player_progress where kind='stat' and key='ev:planted';
-- No value has ever been paid out of that key (no server catalogue grades it).

-- -- 1. hr_farm_plant - anchored additive patch (the LIFETIME ev:planted twin) --
do $$
declare
  v_src text; v_new text; v_hits int;
  -- The live daily stamp, exactly as the b461 patch wrote it.
  c_stamp constant text :=
    'insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)' || chr(10) ||
    '    values (v_uid, p_slot, ''daily'', ''ev:planted'', 1, public.hr_utc_day_key(now()), ''active'')' || chr(10) ||
    '    on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '      do update set value = public.player_progress.value + excluded.value,' || chr(10) ||
    '                    state = ''active'', updated_at = now();';
  -- The sentence b461 left behind, now false. Repaired best-effort: its absence
  -- is not a reason to refuse the fix, so this replace is NOT gated.
  c_stale constant text :=
    '  -- nothing else; there is no lifetime twin because no quest reads one.';
  c_fresh constant text :=
    '  -- nothing else. The LIFETIME twin below is what the client mirrors into' || chr(10) ||
    '  -- G.stats.planted, which is what the panel grades against a day baseline.';
  -- The twin, in hr_farm_harvest's shape verbatim (same columns, same conflict
  -- target, same additive DO UPDATE, period_key = the empty string).
  c_twin constant text :=
    '  -- 2026-09-07: the LIFETIME twin. Mirrors hr_farm_harvest''s stat/ev:harvest' || chr(10) ||
    '  -- row exactly: kind ''stat'', period_key '''', additive, state ''active''. The' || chr(10) ||
    '  -- client projects the stat rows into G.stats.planted and DAILY_GOAL_POOL''s' || chr(10) ||
    '  -- "plant" goal grades stats.planted minus a day-start baseline, so without' || chr(10) ||
    '  -- this row the goal can never move however much the player plants.' || chr(10) ||
    '  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)' || chr(10) ||
    '    values (v_uid, p_slot, ''stat'', ''ev:planted'', 1, '''', ''active'')' || chr(10) ||
    '    on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '      do update set value = public.player_progress.value + excluded.value,' || chr(10) ||
    '                    state = ''active'', updated_at = now();';
begin
  if to_regprocedure('public.hr_farm_plant(int,int,text,uuid)') is null then
    raise exception 'hr_farm_plant(int,int,text,uuid) is absent - apply '
                    '2026-08-22-server-farming-complete.sql first.';
  end if;
  select pg_get_functiondef('public.hr_farm_plant(int,int,text,uuid)'::regprocedure) into v_src;
  -- CR-tolerant, same reason as the b461 patch: a body applied from a CRLF
  -- working copy stores CRLF and an LF-joined anchor would miss every line.
  v_src := replace(v_src, chr(13), '');

  -- IDEMPOTENCE. The marker is the twin's own literal pair, which cannot be
  -- confused with the daily stamp's ('daily', 'ev:planted').
  if position('''stat'', ''ev:planted''' in v_src) > 0 then
    raise notice 'hr_farm_plant already stamps the lifetime ev:planted twin - patch skipped';
    return;
  end if;

  if position('''daily'', ''ev:planted''' in v_src) = 0 then
    raise exception 'hr_farm_plant does not stamp the DAILY ev:planted counter - apply '
                    '2026-08-23-modal-goal-claims.sql (§5) first. Patching a body without the '
                    'daily half would ship half a counter.';
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_stamp, ''))) / length(c_stamp);
  if v_hits <> 1 then
    raise exception 'the ev:planted daily-stamp anchor matched % times, expected exactly 1 - refusing '
                    'to patch blind. Re-apply 2026-08-22-server-farming-complete.sql then '
                    '2026-08-23-modal-goal-claims.sql, then this file.', v_hits;
  end if;

  v_new := replace(v_src, c_stale, c_fresh);
  v_new := replace(v_new, c_stamp, c_stamp || chr(10) || chr(10) || c_twin);
  execute v_new;
  raise notice 'hr_farm_plant patched: stamps the lifetime stat/ev:planted twin';
end $$;

-- -- 2. ACL - create-or-replace preserves it, but be explicit --
-- (the lesson of every restated body in this tree). Unchanged from §5 of
-- 2026-08-23-modal-goal-claims.sql: authenticated only.
revoke execute on function public.hr_farm_plant(int, int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_plant(int, int, text, uuid) to authenticated;

-- -- 3. BACKFILL - the lifetime count the ledger already proves --
do $$
declare v_n int; v_pruned bigint;
begin
  select count(*) into v_pruned from public.player_ledger_rollup where kind = 'farm';
  if v_pruned > 0 then
    raise notice 'BACKFILL SKIPPED: % farm ledger rollup row(s) exist, so farm rows have been pruned '
                 'and count(*) is no longer the lifetime plant count. A partial count would UNDERSTATE '
                 'a real player''s progress and there is no honest source for the remainder.', v_pruned;
    return;
  end if;
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    select l.user_id, l.slot, 'stat', 'ev:planted', count(*), '', 'active'
      from public.player_ledger l
      join public.player_state ps on ps.user_id = l.user_id and ps.slot = l.slot
     where l.kind = 'farm' and l.intent = 'farm_plant'
     group by l.user_id, l.slot
    on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_n = row_count;
  raise notice 'BACKFILL: seeded % lifetime ev:planted row(s) from the plant ledger', v_n;
end $$;

-- -- 4. SELF-VERIFYING COMMIT GATE --
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. The row-writing probe lives in a
-- subtransaction discarded by a sentinel raise (HR821): net-zero on production.
do $$
declare
  v_src   text;
  v_uid   constant uuid := '000000f7-0000-0000-0000-0000000000a1';
  v_slot  constant int  := 0;
  v_day   text;
  v_r     jsonb;
  v_daily bigint; v_life bigint; v_rows int;
  v_pk text; v_state text; v_kind text;
begin
  select pg_get_functiondef('public.hr_farm_plant(int,int,text,uuid)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');

  -- (a) THE MARKER IS PRESENT EXACTLY ONCE. Twice would mean a double-splice
  --     (double-counting every plant); zero means the patch silently skipped.
  v_rows := (length(v_src) - length(replace(v_src, '''stat'', ''ev:planted''', '')))
            / length('''stat'', ''ev:planted''');
  if v_rows <> 1 then
    raise exception 'GATE(a): the lifetime twin appears % times in hr_farm_plant, expected exactly 1', v_rows;
  end if;
  if (length(v_src) - length(replace(v_src, '''daily'', ''ev:planted''', '')))
     / length('''daily'', ''ev:planted''') <> 1 then
    raise exception 'GATE(a): the DAILY ev:planted stamp is no longer present exactly once - the splice '
                    'ate or duplicated it';
  end if;

  -- (b) POSITIVE CONTROL: the splice ate none of the body's other work. Every
  --     one of these was in the live body read on 2026-09-07.
  if position('hr_rpc_gate(''farm_plant'')' in v_src) = 0 then
    raise exception 'GATE(b): the rate gate is gone from hr_farm_plant'; end if;
  if position('hr_intent_replay(v_uid, p_slot, p_idem, ''farm_plant'')' in v_src) = 0 then
    raise exception 'GATE(b): the idempotency replay check is gone from hr_farm_plant'; end if;
  if position('''insufficient_seed''' in v_src) = 0 then
    raise exception 'GATE(b): the seed debit guard is gone from hr_farm_plant'; end if;
  if position('''plot_tier_locked''' in v_src) = 0 then
    raise exception 'GATE(b): the plot-tier gate is gone from hr_farm_plant'; end if;
  if position('hr_day_budget_check' in v_src) = 0 then
    raise exception 'GATE(b): the day-budget clamp is gone from hr_farm_plant'; end if;
  if position('insert into public.player_intents' in v_src) = 0 then
    raise exception 'GATE(b): the intent cache write is gone from hr_farm_plant'; end if;
  if position('''farm_plant'', v_crop.seed_item' in v_src) = 0 then
    raise exception 'GATE(b): the ledger journal row is gone from hr_farm_plant'; end if;
  if position('SECURITY DEFINER' in upper(v_src)) = 0 then
    raise exception 'GATE(b): hr_farm_plant is no longer SECURITY DEFINER'; end if;
  if position('SET SEARCH_PATH' in upper(v_src)) = 0 then
    raise exception 'GATE(b): hr_farm_plant lost its search_path pin'; end if;

  -- (c) ACL UNCHANGED. authenticated may call it (it is the player's own verb);
  --     anon/PUBLIC/service_role may not.
  if not has_function_privilege('authenticated',
        'public.hr_farm_plant(int,int,text,uuid)', 'EXECUTE') then
    raise exception 'GATE(c): authenticated lost EXECUTE on hr_farm_plant - planting is dead'; end if;
  if exists (select 1 from information_schema.role_routine_grants
              where routine_schema='public' and routine_name='hr_farm_plant'
                and grantee in ('anon','PUBLIC','service_role')) then
    raise exception 'GATE(c): hr_farm_plant is executable by anon/PUBLIC/service_role'; end if;

  -- (d) NO CLIENT WRITE ON THE COUNTER TABLE. If a client could write
  --     player_progress directly, every goal in the game is free gold.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_progress'
                and grantee in ('anon','authenticated','PUBLIC')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(d): a client write grant exists on player_progress - every goal is forgeable';
  end if;

  -- (e) BACKFILL SANITY: no lifetime planted row is zero or negative.
  if exists (select 1 from public.player_progress
              where kind='stat' and key='ev:planted' and period_key='' and value <= 0) then
    raise exception 'GATE(e): a lifetime ev:planted row is <= 0'; end if;

  -- (f) EXECUTED - a real plant through the real RPC moves BOTH rows by 1, a
  --     second plant takes both to 2, an IDEMPOTENT REPLAY moves neither, and
  --     the daily row's shape is untouched. Discarded subtransaction.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, plot_level, version)
      values (v_uid, v_slot, 0, 0, 3, 1)
      on conflict (user_id, slot) do update set plot_level = 3, version = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'farming', 500)
      on conflict (user_id, slot, skill_id) do update set xp = 500;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, 'turnip_seed', 4)
      on conflict (user_id, slot, item_id) do update set qty = 4;

    v_day := public.hr_utc_day_key(now());

    v_r := public.hr_farm_plant(v_slot, 0, 'turnip', '000000f7-0000-0000-0000-0000000000b1');
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'GATE(f): the probe plant was refused: %', v_r; end if;
    select coalesce(max(value) filter (where kind='daily' and period_key=v_day), 0),
           coalesce(max(value) filter (where kind='stat'  and period_key=''),   0)
      into v_daily, v_life
      from public.player_progress
     where user_id=v_uid and slot=v_slot and key='ev:planted';
    if v_daily <> 1 then
      raise exception 'GATE(f): one plant stamped daily ev:planted = % (expected 1)', v_daily; end if;
    if v_life <> 1 then
      raise exception 'GATE(f): one plant stamped LIFETIME ev:planted = % (expected 1) - THE BUG: the '
                      'stat/ev:planted twin is not being written, so G.stats.planted stays 0 for ever '
                      'and the "Plant N crops" goal can never complete', v_life; end if;

    v_r := public.hr_farm_plant(v_slot, 1, 'turnip', '000000f7-0000-0000-0000-0000000000b2');
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'GATE(f): the second probe plant was refused: %', v_r; end if;
    select coalesce(max(value) filter (where kind='daily' and period_key=v_day), 0),
           coalesce(max(value) filter (where kind='stat'  and period_key=''),   0)
      into v_daily, v_life
      from public.player_progress
     where user_id=v_uid and slot=v_slot and key='ev:planted';
    if v_daily <> 2 or v_life <> 2 then
      raise exception 'GATE(f): after two plants daily=% lifetime=% (expected 2 and 2) - the twin is not '
                      'additive in lockstep with the daily row', v_daily, v_life; end if;

    -- REPLAY: the same idempotency key must move NEITHER counter. The twin sits
    -- after hr_intent_replay's early return, so a retried plant cannot inflate
    -- a lifetime stat the panel grades.
    v_r := public.hr_farm_plant(v_slot, 1, 'turnip', '000000f7-0000-0000-0000-0000000000b2');
    select coalesce(max(value) filter (where kind='daily' and period_key=v_day), 0),
           coalesce(max(value) filter (where kind='stat'  and period_key=''),   0)
      into v_daily, v_life
      from public.player_progress
     where user_id=v_uid and slot=v_slot and key='ev:planted';
    if v_daily <> 2 or v_life <> 2 then
      raise exception 'GATE(f): an idempotent REPLAY moved the counters to daily=% lifetime=% - a '
                      'retried plant now double-counts', v_daily, v_life; end if;

    -- THE DAILY ROW IS UNTOUCHED IN SHAPE: still exactly one row, still
    -- kind='daily', still today's period key, still 'active'; and the twin is
    -- exactly one row with the empty period key. Two rows total, no more.
    select count(*) into v_rows from public.player_progress
      where user_id=v_uid and slot=v_slot and key='ev:planted';
    if v_rows <> 2 then
      raise exception 'GATE(f): % ev:planted rows exist (expected exactly 2: one daily, one lifetime)', v_rows; end if;
    select kind, period_key, state into v_kind, v_pk, v_state from public.player_progress
      where user_id=v_uid and slot=v_slot and key='ev:planted' and kind='daily';
    if v_kind <> 'daily' or v_pk <> v_day or coalesce(v_state,'') <> 'active' then
      raise exception 'GATE(f): the daily row shape changed: kind=% period_key=% state=%', v_kind, v_pk, v_state; end if;
    select kind, period_key, state into v_kind, v_pk, v_state from public.player_progress
      where user_id=v_uid and slot=v_slot and key='ev:planted' and kind='stat';
    if v_pk <> '' or coalesce(v_state,'') <> 'active' then
      raise exception 'GATE(f): the lifetime row is not the harvest shape: period_key=% state=%', v_pk, v_state; end if;

    raise exception using errcode = 'HR821', message = 'farm-plant-lifetime-counter §4 complete - rolling back';
  exception when sqlstate 'HR821' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_farm   where user_id = v_uid)
     or exists (select 1 from public.player_state  where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users           where id      = v_uid) then
    raise exception 'GATE: §4 LEAKED a probe row'; end if;

  raise notice 'farm-plant-lifetime-counter: hr_farm_plant stamps the lifetime stat/ev:planted twin in '
               'lockstep with the daily row, a replay moves neither, the daily row shape and the whole '
               'rest of the body are untouched, ACL unchanged, no client write on player_progress - all green';
end $$;
