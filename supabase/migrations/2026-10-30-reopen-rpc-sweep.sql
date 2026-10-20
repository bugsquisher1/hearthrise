-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE REOPEN RPC SWEEP (lane S1, backend-architect; Security
-- read-only review 2026-10-19, findings 1-3). STAGED. Game CLOSED: applies on
-- its passing §3; Security reviews it with the reopen gate. Moves no value.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- The rebuilt client calls none of the claim RPCs below (grep src/: no caller),
-- yet each stayed granted to `authenticated` and each pays value by a DIRECT
-- `update player_state set gold` outside hr_apply (gold_in = 0 on the ledger):
--   hr_claim_rank        250 .. 1,000,000 gold per character per rank (BLOCKER)
--   hr_claim_milestone / hr_claim_quest / hr_claim_daily   goal-board payouts
--   raid_claim / world_event_claim / world_event_absence_claim   muster + rally
--   world_event_pledge (+ world_event_pledge_settle, its zero-value sibling:
--     with the payer gone a pledge is a dead row, so its closer goes too)
--   hr_buy_gem_unlock    a Crowns spend with no client
-- A surface with no client is a surface nobody watches. They are DROPPED, not
-- revoked: a revoked body is one `grant` away from live again.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 drop each wrapper AND its __ungated body; delete their hr_client_rpc_baseline
--    rows (hr_assert_grant_hygiene would otherwise report them `lost` nightly).
-- §2 the market writers hr_market_list / hr_market_cancel / hr_market_buy lose
--    EXECUTE from PUBLIC, anon, authenticated, service_role AND hr_engine, so the
--    edge's market verbs fail at the database. Tables, cron expiry (which returns
--    escrow) and hr_market_config stay; the edge dispatch belongs to hr-accrue's
--    lane. c_engine_allow in hr_assert_grant_hygiene still LISTS the three (an
--    allowlist is a ceiling, not a floor); tests/rpc-execute-surface.mjs pins the
--    engine's actual surface exactly, so a re-grant is red in CI.
-- §3 hr_rpc_gate RESTATED WHOLE from its chain-end body (2026-10-25-character-
--    sheet.sql, md5 pinned) minus nine retired buckets. `hr_claim_daily` STAYS:
--    hr_login_claim (2026-10-23-premium-login-reward.sql) still spends it.
--    Nothing else moves.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Strictly smaller: 10 authenticated RPCs gone, 3 engine writers revoked.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the authoring files' bodies + grants + baseline rows and the
-- character-sheet hr_rpc_gate. Nothing here deletes a player row.
-- ORDER: LAST in the chain (after 2026-10-29-party-security.sql). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
-- The gate restatement runs only over the chain-end body or over its own image,
-- so a bucket another lane added meanwhile is refused, never clobbered.
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: grant hygiene (2026-08-11-grant-hygiene.sql) is absent'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_rpc_gate(text)');
  if v_md5 is null or v_md5 not in ('71013ed0842045ab4a98d2ef664792cc', -- 2026-10-25-character-sheet.sql
                                    '69610a81a8a5fcfffb951644c0929791') then -- this file's own image
    raise exception 'reopen-rpc-sweep §0: hr_rpc_gate is not the body this file restates (md5 %) — a bucket was added since 2026-10-25-character-sheet.sql; restate from that body instead', v_md5;
  end if;
end $mig$;

-- ── §1 THE DORMANT CLAIMS: DROPPED, wrapper and body ─────────────────────────
drop function if exists public.hr_claim_rank(text, integer);
drop function if exists public.hr_claim_rank__ungated(text, integer);
drop function if exists public.hr_claim_milestone(text, integer);
drop function if exists public.hr_claim_milestone__ungated(text, integer);
drop function if exists public.hr_claim_quest(text, integer);
drop function if exists public.hr_claim_quest__ungated(text, integer);
drop function if exists public.hr_claim_daily(text, integer);
drop function if exists public.hr_claim_daily__ungated(text, integer);
drop function if exists public.raid_claim(text, uuid, text, integer);
drop function if exists public.raid_claim__ungated(text, uuid, text, integer);
drop function if exists public.world_event_claim(text, integer);
drop function if exists public.world_event_claim__ungated(text, integer);
drop function if exists public.world_event_absence_claim(text);
drop function if exists public.world_event_absence_claim__ungated(text);
drop function if exists public.world_event_pledge(text);
drop function if exists public.world_event_pledge__ungated(text);
drop function if exists public.world_event_pledge_settle(text);
drop function if exists public.world_event_pledge_settle__ungated(text);
drop function if exists public.hr_buy_gem_unlock(text, integer, uuid);
drop function if exists public.hr_buy_gem_unlock__ungated(text, integer, uuid);

delete from public.hr_client_rpc_baseline
 where proname in ('hr_claim_rank', 'hr_claim_milestone', 'hr_claim_quest', 'hr_claim_daily',
                   'raid_claim', 'world_event_claim', 'world_event_absence_claim',
                   'world_event_pledge', 'world_event_pledge_settle', 'hr_buy_gem_unlock');

-- ── §2 THE MARKET WRITERS: no client, no engine ──────────────────────────────
revoke execute on function public.hr_market_list(uuid, integer, bigint, uuid, text, bigint, bigint)
  from public, anon, authenticated, service_role, hr_engine;
revoke execute on function public.hr_market_cancel(uuid, integer, bigint, uuid, uuid)
  from public, anon, authenticated, service_role, hr_engine;
revoke execute on function public.hr_market_buy(uuid, integer, bigint, uuid, uuid, bigint)
  from public, anon, authenticated, service_role, hr_engine;

-- ── §3 hr_rpc_gate RESTATED WHOLE, minus the retired buckets ─────────────────
-- Removed: raid_claim, world_event_absence_claim, world_event_claim,
-- world_event_pledge, world_event_pledge_settle, hr_claim_quest,
-- hr_claim_milestone, hr_claim_rank, hr_buy_gem_unlock. Kept: hr_claim_daily
-- (hr_login_claim's bucket). An unlisted bucket is `else return false`: a body
-- that came back would be refused, never admitted.
CREATE OR REPLACE FUNCTION public.hr_rpc_gate(p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_unkeyed_limit constant int := 600;
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
  v_ip     text;
  v_bucket text;
  v_key    uuid;
begin
  -- CLOSED MODE (2026-10-21-closed-mode.sql): a signed-in caller who is not
  -- admitted is refused hr_closed (HTTP 403) before any bucket is spent.
  perform public.hr_access_check();
  case p_bucket
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now',
         'clan_invites_list',
         'hr_goal_state'
      then v_limit := 120;
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_strike',
         'world_event_contribute', 'world_event_join',
         'farm_plant', 'farm_harvest', 'farm_water',
         'worker_hire', 'worker_assign',
         'bank_move',
         'hr_credit_kills', 'hr_credit_combat_xp',
         'client_state_put'
      then v_limit := 60;
    when 'hr_set_style'
      then v_limit := 30;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post',
         'clan_create', 'clan_join', 'clan_leave', 'clan_kick',
         'clan_invite', 'clan_invite_revoke', 'clan_join_policy_set',
         'hr_claim_daily',
         'hr_accept_bounty', 'hr_claim_bounty',
         'hr_bounty_spend',
         'hr_trait_buy', 'hr_claim_goal'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_buy_hero_slot' then v_limit := 12;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'hr_vigour_refill' then v_limit := 6;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
    when 'hr_tally_state' then v_limit := 120;
    -- HUNT SESSIONS (2026-10-21-hunt-sessions.sql): every session / bag /
    -- action-bar write shares `hunt`; a manual press is `hunt_use` (one per
    -- second is the action bar's own buff cooldown); the Analyzer and the read
    -- cursor are `hunt_read`.
    when 'hunt' then v_limit := 30;
    when 'hunt_use' then v_limit := 60;
    when 'hunt_read' then v_limit := 60;
    -- THE CHARACTER WINDOW (2026-10-25-character-sheet.sql): the outfit save.
    when 'outfit' then v_limit := 20;
    else return false;
  end case;

  if v_uid is not null then
    v_key    := v_uid;
    v_bucket := 'rpc:' || p_bucket;
  else
    v_ip := public.hr_request_ip();
    if v_ip is not null then
      v_key    := md5('anon-ip:' || v_ip)::uuid;
      v_bucket := 'rpc:anon:' || p_bucket;
    else
      v_key    := md5('anon-unkeyed')::uuid;
      v_bucket := 'rpc:anon-unkeyed:' || p_bucket;
      v_limit  := c_unkeyed_limit;
    end if;
  end if;

  if public.hr_rate_ok(v_key, v_bucket, v_limit, v_window) then
    return true;
  end if;

  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_key, v_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_key, 0,
      case when v_uid is null then 'anon:' || p_bucket else p_bucket end,
      'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc',
                         'anon', v_uid is null), v_weight);
  end if;
  return false;
end $function$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_gone constant text[] := array[
    'hr_claim_rank', 'hr_claim_milestone', 'hr_claim_quest', 'hr_claim_daily',
    'raid_claim', 'world_event_claim', 'world_event_absence_claim',
    'world_event_pledge', 'world_event_pledge_settle', 'hr_buy_gem_unlock'];
  -- the gate buckets retired with them (hr_claim_daily stays: hr_login_claim's)
  c_buckets constant text[] := array[
    'hr_claim_rank', 'hr_claim_milestone', 'hr_claim_quest',
    'raid_claim', 'world_event_claim', 'world_event_absence_claim',
    'world_event_pledge', 'world_event_pledge_settle', 'hr_buy_gem_unlock'];
  c_market constant text[] := array[
    'public.hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'public.hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)'];
  v_u constant uuid := '000000c0-0000-0000-0000-0000a5e10001';
  v_left text; v_fn text; v_role text; v_src text; v_r jsonb;
begin
  -- (a) every retired claim is gone: no overload, wrapper or __ungated body.
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname = any (c_gone) or regexp_replace(p.proname, '__ungated$', '') = any (c_gone));
  if v_left is not null then raise exception 'VERIFY(a): retired claims still exist: %', v_left; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = any (c_gone)) then
    raise exception 'VERIFY(a): hr_client_rpc_baseline still approves a retired claim'; end if;

  -- (b) the market writers exist and NO client, operator or engine role holds them.
  foreach v_fn in array c_market loop
    if to_regprocedure(v_fn) is null then raise exception 'VERIFY(b): % is missing', v_fn; end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, to_regprocedure(v_fn), 'execute') then
        raise exception 'VERIFY(b): % can still execute %', v_role, v_fn; end if;
    end loop;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = to_regprocedure(v_fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'VERIFY(b): PUBLIC can still execute %', v_fn; end if;
  end loop;

  -- (c) hr_rpc_gate names no retired bucket, and no surviving body passes one.
  select prosrc into v_src from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure;
  foreach v_fn in array c_buckets loop
    if strpos(v_src, '''' || v_fn || '''') > 0 then
      raise exception 'VERIFY(c): hr_rpc_gate still admits the retired bucket %', v_fn; end if;
  end loop;
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosrc ~ ('hr_rpc_gate\s*\(\s*''+(' || array_to_string(c_buckets, '|') || ')''+\s*\)');
  if v_left is not null then raise exception 'VERIFY(c): a live body still passes a retired bucket: %', v_left; end if;

  -- (d) executed, as an ADMITTED signed-in caller: a retired bucket is refused,
  --     a kept bucket still admits — the restatement removed only what it says.
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'reopen-rpc-sweep §4 probe') on conflict (user_id) do nothing;
    -- (through a variable: a literal call here would read as a live caller to
    --  tests/rpc-gate-bucket-guard.mjs, which is exactly what it must not be)
    foreach v_fn in array c_buckets loop
      if public.hr_rpc_gate(v_fn) then raise exception 'VERIFY(d): the retired % bucket still admits', v_fn; end if;
    end loop;
    if not public.hr_rpc_gate('outfit') then raise exception 'VERIFY(d): the kept outfit bucket no longer admits'; end if;
    if not public.hr_rpc_gate('hr_claim_daily') then raise exception 'VERIFY(d): hr_login_claim''s hr_claim_daily bucket no longer admits'; end if;
    raise exception using errcode = 'HR876', message = 'reopen-rpc-sweep §4 probe complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hr_access_allowlist where user_id = v_u) then raise exception 'VERIFY(d): §4 LEAKED a probe row'; end if;

  -- (e) grant hygiene is strict-green and no approved client RPC went missing.
  v_r := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(v_r->'baseline_rows_no_longer_live') > 0 then
    raise exception 'VERIFY(e): approved client RPCs lost: %', v_r->'baseline_rows_no_longer_live'; end if;
  raise notice 'reopen-rpc-sweep: 10 dormant claims dropped, 3 market writers unreachable, gate restated; all green';
end $$;
