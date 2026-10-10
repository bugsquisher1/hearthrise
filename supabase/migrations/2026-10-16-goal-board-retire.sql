-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-goal-board-retire.sql — ONE DAILY LIST. THE OLD DAILY/WEEKLY
--                                     GOALS BOARD IS CUT; ITS COUNTERS STAY,
--                                     READ BY ONE TALLY.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Removes a money surface (the
-- board paid gold, gems, XP and items) and adds a client read, so it moves only
-- on a Security GO and the Coordinator applies it (one file,
-- tools/apply-migration.mjs).
-- APPLY ORDER: after 2026-10-16-login-reward.sql (either order is safe; they
-- touch disjoint bodies). The CLIENT HALF (the board's UI and transport deleted,
-- the Quests sheet and Home's "Your week" reading hr_tally_state) must ship in
-- the SAME cut as this apply: an old client against this database gets a 404
-- on hr_goal_state (the "Your week" card renders the pending dash, the board's
-- Claim buttons stay disabled, nothing is paid or lost); a new client against
-- the old database gets a 404 on hr_tally_state (the same dash). Neither order
-- moves value.
--
-- ── WHY (the coherence audit, 2026-10-09, Top-10 #5) ────────────────────────
-- Hearthrise had two daily lists with different counters: the server-paid daily
-- quests (hr_claim_daily, three a day from DAILY_TASK_POOL) and the quest
-- modal's daily/weekly goals board (hr_claim_goal over hr_goal_rewards, drawn
-- and baselined in the browser from client stats). Tyler approved the cut: one
-- list, the server-paid one.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 hr_tally_state(p_slot) — the ONE client read of the server's period
--      counters, for the daily-quest sheet and Home's "Your week" card:
--      today's and this ISO week's `daily` ev:<type> counters (whatever exist,
--      no catalogue to drift), gold earned today / this week (gross ledger
--      inflow, the board's old derivation), the daily quests the server has
--      PAID today, and the set it OFFERS today (hr_daily_task_set_for). Own
--      character only (auth.uid()), rate-gated on its own 120/min bucket,
--      VOLATILE (the gate writes), authenticated only, baselined.
--   §2 hr_rpc_gate learns the 'hr_tally_state' bucket (spliced at the case
--      terminator). The 'hr_claim_goal' / 'hr_goal_state' arms are left in
--      place: older files in the chain still name them, and an admitted bucket
--      with no function behind it admits nothing (tests/rpc-gate-bucket-guard).
--   §3 THE CUT: hr_claim_goal, hr_claim_goal__ungated, hr_goal_state,
--      hr_goal_state__ungated and the hr_goal_rewards catalogue are dropped;
--      their hr_client_rpc_baseline rows go with them. The board's claim rows
--      (player_progress kind='quest', key 'goal:%', period-keyed) are left to
--      hr_progress_prune's 31-day window, which already owns them.
--   §4 self-check by execution, net-zero.
--
-- WHAT IS DELIBERATELY KEPT: every `daily` ev:<type> counter the engine and
-- hr_farm_plant stamp (they are server stats, read by the tally and by
-- hr_claim_daily), and hr_iso_week_key / hr_goal_week_days /
-- hr_goal_period_start (the tally's week and day boundaries).
--
-- ── COST AT 100x PLAYERS ───────────────────────────────────────────────────
-- One tally read per sheet open / Home render (client-cached 120 s): an indexed
-- scan of ≤ 8 days × ~10 counters of one (user, slot) prefix, two ledger sums on
-- player_ledger_user_idx, and hr_daily_task_set_for. Cheaper than the
-- hr_goal_state it replaces (one probe per catalogue row). No table, no row.
--
-- RESTATEMENT-DEBT-ACK: one bucket line spliced into hr_rpc_gate at the case terminator, the idiom every bucket since 2026-08-28 uses; restating the whole gate from a template is exactly the b484-b487 incident class, and the dead hr_goal_state / hr_claim_goal arms must stay admitted for the older files that still name them.
-- REVERSIBILITY: re-apply 2026-08-23-modal-goal-claims.sql's §3, §6-§8 and the
--   later patches to its bodies (2026-09-04-goal-gold-retune.sql,
--   2026-09-07-goal-counter-kind-check.sql, 2026-09-28-settle-before-mutate.sql);
--   drop hr_tally_state. No player value moves either way.
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_rpc_gate and hr_tally_state (new)
--   and loses the four dropped bodies; restore-census drops hr_goal_rewards.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.player_progress') is null or to_regclass('public.player_ledger') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'player_progress / player_ledger / hr_client_rpc_baseline missing — apply the engine chain first'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamptz)') is null
     or to_regprocedure('public.hr_iso_week_key(timestamptz)') is null
     or to_regprocedure('public.hr_goal_week_days(timestamptz)') is null
     or to_regprocedure('public.hr_goal_period_start(boolean,timestamptz)') is null
     or to_regprocedure('public.hr_daily_task_set_for(text,uuid,int)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_rpc_gate / day + week keys / hr_daily_task_set_for / hr_assert_grant_hygiene missing'; end if;
end $mig$;

-- ── 1. hr_tally_state — THE ONE READ OF THE PERIOD COUNTERS ────────────────
create or replace function public.hr_tally_state(p_slot int)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $fn$
declare
  v_uid  uuid := auth.uid();
  v_slot int  := coalesce(p_slot, 0);
  v_day  text := public.hr_utc_day_key(now());
  v_days text[] := public.hr_goal_week_days(now());
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not public.hr_rpc_gate('hr_tally_state') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;
  return jsonb_build_object(
    'ok', true, 'slot', v_slot, 'day_key', v_day, 'week_key', public.hr_iso_week_key(now()),
    -- today's ev:<type> counters, the ones hr_claim_daily grades
    'day', coalesce((select jsonb_object_agg(key, value) from public.player_progress
                      where user_id = v_uid and slot = v_slot and kind = 'daily'
                        and key like 'ev:%' and period_key = v_day), '{}'::jsonb),
    -- the same counters summed over the ISO week (Monday UTC), seven day keys
    'week', coalesce((select jsonb_object_agg(key, n) from (
                        select key, sum(value) as n from public.player_progress
                         where user_id = v_uid and slot = v_slot and kind = 'daily'
                           and key like 'ev:%' and period_key = any (v_days)
                         group by key) w), '{}'::jsonb),
    -- gold EARNED (gross ledger inflow; spending is not taken off)
    'gold_day', (select coalesce(sum(gold), 0) from public.player_ledger
                  where user_id = v_uid and slot = v_slot and gold > 0
                    and at >= public.hr_goal_period_start(false, now())),
    'gold_week', (select coalesce(sum(gold), 0) from public.player_ledger
                   where user_id = v_uid and slot = v_slot and gold > 0
                     and at >= public.hr_goal_period_start(true, now())),
    -- the daily quests the server has PAID today (hr_claim_daily's once-rows)
    'paid', coalesce((select jsonb_agg(key order by key) from public.player_progress
                       where user_id = v_uid and slot = v_slot and kind = 'daily'
                         and period_key = v_day and state = 'claimed' and key like 'daily\_%'), '[]'::jsonb),
    -- the set the server OFFERS today (the eligibility-filtered draw)
    'offered', to_jsonb(public.hr_daily_task_set_for(v_day, v_uid, v_slot)));
end $fn$;
revoke execute on function public.hr_tally_state(int) from public;
do $mig$
begin
  execute 'revoke execute on function public.hr_tally_state(int) from anon, authenticated, service_role';
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_tally_state(int) from hr_engine'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_tally_state(int) from hr_tick'; end if;
end $mig$;
grant execute on function public.hr_tally_state(int) to authenticated;

-- ── 2. THE 'hr_tally_state' RATE BUCKET — SPLICED AT THE CASE TERMINATOR ───
do $mig$
declare v_src text; v_new text; c_anchor constant text := 'else return false;' || chr(10) || '  end case;';
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');
  if position('''hr_tally_state''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_tally_state — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to patch blind.';
  end if;
  -- 120/min: the read the old hr_goal_state was, re-rendered on sheet open.
  v_new := replace(v_src, c_anchor,
    'when ''hr_tally_state'' then v_limit := 120;' || chr(10) ||
    '    ' || c_anchor);
  execute v_new;
end $mig$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 3. THE CUT ─────────────────────────────────────────────────────────────
drop function if exists public.hr_claim_goal(text, boolean, int, uuid);
drop function if exists public.hr_claim_goal__ungated(text, boolean, int, uuid);
drop function if exists public.hr_goal_state(int);
drop function if exists public.hr_goal_state__ungated(int);
drop table if exists public.hr_goal_rewards;

delete from public.hr_client_rpc_baseline
 where proname in ('hr_claim_goal', 'hr_goal_state', 'hr_tally_state') and grantee = 'authenticated';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_tally_state',
   pg_get_function_identity_arguments('public.hr_tally_state(integer)'::regprocedure),
   'authenticated',
   'added 2026-10-16 (goal-board-retire, W0 #5): the ONE client read of the server''s period '
   'counters, for the daily-quest sheet and Home''s Your week card. Own character only '
   '(auth.uid(), own slot). Returns today''s and this ISO week''s daily ev:<type> counters, '
   'gold earned today / this week (gross ledger inflow), the daily quests paid today and the '
   'set offered today. Writes nothing but hr_rpc_gate''s counter (VOLATILE for that). '
   'Rate-gated on its own bucket hr_tally_state at 120/min. Replaces hr_goal_state.');

-- ── 4. SELF-CHECK (§4) — BY EXECUTION, NET-ZERO ────────────────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-c000-0000010a1d02';
  v_day  text := public.hr_utc_day_key(now());
  v_t    jsonb;
  v_days text[] := public.hr_goal_week_days(now());
  v_other text;
begin
  -- (a) THE BOARD IS GONE.
  if to_regclass('public.hr_goal_rewards') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public'
                   and p.proname in ('hr_claim_goal', 'hr_claim_goal__ungated', 'hr_goal_state', 'hr_goal_state__ungated')) then
    raise exception 'goal-board-retire self-check (a): a board object survived'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname in ('hr_claim_goal', 'hr_goal_state')) then
    raise exception 'goal-board-retire self-check (a): the client RPC baseline still names a board RPC'; end if;

  -- (b) THE TALLY IS A CLIENT READ AND NOTHING ELSE.
  if not has_function_privilege('authenticated', 'public.hr_tally_state(int)', 'execute')
     or has_function_privilege('anon', 'public.hr_tally_state(int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_tally_state(int)', 'execute') then
    raise exception 'goal-board-retire self-check (b): hr_tally_state is not authenticated-only'; end if;
  if (select provolatile from pg_proc where oid = 'public.hr_tally_state(int)'::regprocedure) <> 'v'
     or not (select prosecdef from pg_proc where oid = 'public.hr_tally_state(int)'::regprocedure) then
    raise exception 'goal-board-retire self-check (b): hr_tally_state must be VOLATILE SECURITY DEFINER'; end if;
  if position('''hr_tally_state''' in pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)) = 0 then
    raise exception 'goal-board-retire self-check (b): hr_rpc_gate does not admit hr_tally_state'; end if;
  perform public.hr_assert_grant_hygiene(true);

  -- (c) BEHAVIOUR, on a probe character inside a discarded subtransaction.
  begin
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_t := public.hr_tally_state(0);
    if v_t->>'error' is distinct from 'no_character' then
      raise exception 'goal-board-retire self-check (c): a slot with no character answered %', v_t; end if;
    perform public.hr_create_character(0);
    v_t := public.hr_tally_state(0);
    if coalesce(v_t->>'ok', 'false') <> 'true' or v_t->'day' <> '{}'::jsonb or v_t->'paid' <> '[]'::jsonb
       or jsonb_array_length(v_t->'offered') < 1
       -- the start kit's gold is journalled as inflow, so a fresh day is >= 0, never null
       or (v_t->>'gold_day') is null or (v_t->>'gold_week')::bigint < (v_t->>'gold_day')::bigint then
      raise exception 'goal-board-retire self-check (c): a fresh character tallies %', v_t; end if;
    -- today's counters, a paid quest, a login claim (NOT a quest) and another
    -- day of this week (when today is not Monday)
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
      (v_uid, 0, 'daily', 'ev:kill_any', v_day, 31, 'active'),
      (v_uid, 0, 'daily', 'ev:gather',   v_day, 7,  'active'),
      (v_uid, 0, 'daily', 'daily_kill',  v_day, 1,  'claimed'),
      (v_uid, 0, 'daily', 'login',       v_day, 1,  'claimed');
    v_other := (select d from unnest(v_days) d where d <> v_day limit 1);
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'ev:kill_any', v_other, 9, 'active');
    v_t := public.hr_tally_state(0);
    if (v_t #>> '{day,ev:kill_any}')::bigint is distinct from 31 or (v_t #>> '{day,ev:gather}')::bigint is distinct from 7
       or (v_t #>> '{week,ev:kill_any}')::bigint is distinct from 40
       or v_t->'paid' <> '["daily_kill"]'::jsonb then
      raise exception 'goal-board-retire self-check (c): expected day kill 31 / gather 7, week kill 40, paid [daily_kill]; got %', v_t; end if;
    -- another character's rows are not this one's
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-c000-0000010a1d03', true);
    v_t := public.hr_tally_state(0);
    if v_t->>'error' is distinct from 'no_character' then
      raise exception 'goal-board-retire self-check (c): another user read a tally: %', v_t; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    v_t := public.hr_tally_state(0);
    if v_t->>'error' is distinct from 'not_signed_in' then
      raise exception 'goal-board-retire self-check (c): an unsigned call answered %', v_t; end if;
    raise exception using errcode = 'HR949', message = 'goal-board-retire §4 complete — rolling back';
  exception when sqlstate 'HR949' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'goal-board-retire self-check: §4 LEAKED a probe row'; end if;

  raise notice 'goal-board-retire self-check PASSED: (a) the board''s two RPCs, their ungated bodies, the '
               'catalogue and their baseline rows are gone; (b) hr_tally_state is authenticated-only, '
               'VOLATILE SECURITY DEFINER, gated on its own bucket, and grant hygiene is strict-clean; (c) it '
               'answers no_character / not_signed_in, a fresh character''s empty tally, today''s and the '
               'week''s counters, and only the daily quests paid today';
end $$;
