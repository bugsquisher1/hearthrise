-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — SERVER CLEANUP: THE DORMANT OLD SYSTEMS LEAVE THE DATABASE
-- (lane 1, backend-architect, 2026-10-20; ports the sound half of the paused
-- lane/c-demolition-finish WIP onto v0.2.11 + the reopen sweep). STAGED, NOT
-- APPLIED. Game CLOSED: applies on its passing §6; Security reviews it with the
-- reopen gate. The Coordinator applies (tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00-00:10 UTC).
--
-- ORDER: AFTER 2026-10-28-reopen-rpc-sweep.sql (§0 refuses until it has run).
-- EDGE FIRST: the hr-accrue payload without the market / unlock_buy verbs
-- (this branch) should be live, or those verbs answer "function does not
-- exist" instead of unknown_verb. Neither has a client.
--
-- ── WHAT GOES (no rebuilt-client caller; tests/client-intent-surface.mjs) ───
--   CLANS + CASTLE   every clan_* RPC (+ __ungated) and table, hr_clan_*, the
--                    castle catalogues, sync_profile_clan, profiles.clan_id, the
--                    chat policy that read it ("clan channel readable by members").
--   RAIDS            raid_strike (+ __ungated), raid_claims, raid_contributions,
--                    clan_raids, hr_max_hunt_tier (read only by raid/clan hunts).
--   OLD MARKET       market_listings, market_buy_offers, market_sales, the
--                    market_price_history view, hr_market_config, every
--                    hr_market_* function and trigger, market_sales_prune, and
--                    the two cron jobs (hr-market-expire, hr-market-sales-prune).
--   COMPANIONS       hr_companion_grant, hr_companion_equip.
--   WORLD EVENTS     world_event_contribute / world_event_join (+ __ungated) and
--                    the world_event_* tables, hr_rally_* (incl. the
--                    hr_rally_action_s catalogue), hr_muster_window.
--   QUESTS / DAILY   hr_daily_task_*, hr_tally_state, hr_goal_*, the week-key
--                    helpers (hr_iso_week_key, hr_utc_week_key, hr_week_start).
--   LEADERBOARDS     hr_leaderboard (+ __ungated), hr_leaderboard_refresh, hr_lb_*
--                    except hr_lb_combat_level, leaderboard_ranked, leaderboard_meta.
--   HIRED WORKERS    hr_worker_hire, hr_worker_assign.
--   UNLOCK BUYS      hr_unlock_buy (the engine writer).
--   GATE + BASELINE  hr_rpc_gate restated whole: it admits exactly the buckets a
--                    surviving body passes (§6 asserts both directions); the
--                    dropped client RPCs leave hr_client_rpc_baseline.
--
-- ── WHAT STAYS, ON PURPOSE ──────────────────────────────────────────────────
--   Read by hr_apply / hr_state_of (core-rebuild bodies the live-engine lane is
--   restating; not re-authored here): player_workers, player_state.
--   workers_accrued_to, hr_gem_unlocks, hr_gem_unlocks_of.
--   Filled or checked by a catalogue GENERATOR whose output must keep applying:
--   hr_quest_rewards (+ hr_quest_rewards_items_ok, its CHECK), hr_feast_foods
--   (tools/gen-catalogues.mjs), hr_companion_grants (gen-companion-grants),
--   hr_unlock_offers (gen-unlock-offers / gen-companion-unlocks / gen-gold-ladders).
--   They go with their generators, in a tools lane.
--   Not in this lane's ruling: hr_login_claim (the premium login reward),
--   hr_trait_buy, the farm (incl. hr_farm_upgrade_plot), hr_buy_hero_slot,
--   set_activity + the gather/artisan engine, the bounty helpers and the
--   attended-credit logs, hr_unlocks + hr_unlock_guard, every party/chat object.
--   hr_assert_grant_hygiene is NOT restated: its engine allowlist keeps the
--   dropped writers as inert text; tests/rpc-execute-surface.mjs pins the real
--   surface.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
-- Writers only leave; nothing that survives gains a path. The append-only
-- ledger keeps every historic row (its kinds are untouched).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- The beta is wiped at EA; the dropped tables hold closed-beta rows only. A
-- revert re-runs each family's original migrations (they stay in the chain),
-- the four pre-image bodies below and the reopen-sweep gate. No begin/commit.
-- ⚠ AFTER APPLYING (Coordinator): live-hash-drift --live --write.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ───────────────────────────────────────────────
-- Each restated body must be the chain-end pre-image (md5 of prosrc) or this
-- file's own image (a re-apply); anything else was moved by another lane.
do $mig$
declare v_md5 text; r record;
begin
  if to_regprocedure('public.hr_claim_rank(text,integer)') is not null then
    raise exception 'PRECONDITION: apply 2026-10-28-reopen-rpc-sweep.sql first'; end if;
  for r in select * from (values
      ('public.hr_rpc_gate(text)',               '69610a81a8a5fcfffb951644c0929791', '67ace15a23ee792fb44642127b8c2cd9'),
      ('public.hr_offline_cap_ms(uuid,integer)', 'ac72785907ae37df0ebb0e45dce0dadb', '5f398aea97658361c9e873b270981f45'),
      ('public.hr_server_now()',                 'da61e5f17e005006466464900f8100ac', 'c2f9a557ce4b6f3eb51a110d5167bdd8'),
      ('public.hr_name_restamp()',               'a60fbf68e0bc200d17466d1256c645a0', 'a4ee9fddc7eacdaca04d6775571f6adb'),
      ('public.hr_mod_force_rename(uuid,text)',  'd50e4fdf7fe7ee5a42595747efe283cf', 'b77e2c0a30b845249d838aab5140cbfd')) v(sig, pre, own) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null or v_md5 not in (r.pre, r.own) then
      raise exception 'server-cleanup §0: % is not the body this file restates (md5 %, pinned %) — re-derive from the installed body', r.sig, v_md5, r.pre;
    end if;
  end loop;
end $mig$;

-- ── §1 THE READERS STOP READING (whole restatements; grants re-asserted) ─────
-- hr_offline_cap_ms — minus the clan-level rungs.
CREATE OR REPLACE FUNCTION public.hr_offline_cap_ms(p_user uuid, p_slot integer DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- The base cap, in hours. 12h F2P (legacy.js:938).
  c_base_h      constant int := 12;
  -- THE CEILING. Not balance — a fuse. It is the largest cap any legal
  -- combination of sources could ever produce (16h Offline+ · +4h property ·
  -- +4h renown = 24h), so it can never clip an
  -- honest player, and it bounds the blast radius if a perk table is ever
  -- mis-seeded or a future source is added without re-reading this file.
  -- A cap is a multiplier on a whole night's progress; an unbounded one is a
  -- mint.
  c_ceiling_ms  constant bigint := 24 * 3600000;
  v_hours       int := c_base_h;
begin
  if p_user is null then return c_base_h::bigint * 3600000; end if;

  -- The clan rungs (+1h at clan level 4, +2h more at 7) left with the clans
  -- (2026-10-30-server-cleanup.sql).

  -- (Offline+ entitlement, renown and property tier land here when they become
  --  server state. Until then they contribute 0 — see the header.)

  return least(c_ceiling_ms, v_hours::bigint * 3600000);
end $function$;
revoke execute on function public.hr_offline_cap_ms(uuid, integer) from public, anon, authenticated, service_role;
grant  execute on function public.hr_offline_cap_ms(uuid, integer) to hr_engine;

-- hr_server_now — minus live_event_key (the muster window).
CREATE OR REPLACE FUNCTION public.hr_server_now()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not public.hr_rpc_gate('hr_server_now') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object(
    'ok', true,
    'epoch_ms', (extract(epoch from now()) * 1000)::bigint,
    'day_key', public.hr_utc_day_key()
  );
end $function$;
revoke execute on function public.hr_server_now() from public, anon, service_role;
grant  execute on function public.hr_server_now() to authenticated;

-- hr_name_restamp — minus the market listing / offer re-stamps; chat stays.
CREATE OR REPLACE FUNCTION public.hr_name_restamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  update public.chat_messages
     set from_name = left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24)
   where from_id = new.id
     and from_name is distinct from
         left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24);
  return null;
end $function$;
revoke execute on function public.hr_name_restamp() from public, anon, authenticated, service_role;

-- hr_mod_force_rename — minus the leaderboard refresh.
CREATE OR REPLACE FUNCTION public.hr_mod_force_rename(p_user uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_prof   public.profiles%rowtype;
  v_canon  text;
  v_fold   text;
  v_base   int;
  v_try    int := 0;
  v_place  text;
  v_done   boolean := false;
  v_ledger bigint;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  if length(v_reason) < 3 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;

  perform pg_advisory_xact_lock(hashtext('hr_display_name'), hashtext(p_user::text));
  select * into v_prof from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_profile'); end if;

  -- IDEMPOTENT: still flagged and still wearing a placeholder → nothing to do.
  if v_prof.name_state = 'flagged' and v_prof.must_rename
     and coalesce(v_prof.display_name, '') ~ '^Adventurer-[0-9]+$' then
    return jsonb_build_object('ok', true, 'already', true, 'user', p_user,
                              'placeholder', v_prof.display_name);
  end if;

  select canonical into v_canon from public.display_names where user_id = p_user;
  v_canon := coalesce(v_canon, public.hr_canon_display_name(v_prof.display_name));
  v_fold  := public.hr_name_fold(v_prof.display_name);
  if v_fold <> '' then
    insert into public.hr_name_holds (fold, user_id) values (v_fold, p_user)
      on conflict (fold) do nothing;
  end if;

  -- A deterministic, per-player start (no counter to leak), probed upward; the
  -- display_names PRIMARY KEY is the arbiter, so a concurrent claimant loses
  -- cleanly to unique_violation and the loop moves on.
  v_base := (hashtext(p_user::text)::bigint & 2147483647)::int % 9000;
  while not v_done loop
    v_place := 'Adventurer-' || case when v_try < 9000 then (1000 + (v_base + v_try) % 9000)::text
                                     else (10000 + v_try - 9000)::text end;
    begin
      if exists (select 1 from public.display_names where user_id = p_user) then
        update public.display_names
           set canonical = public.hr_canon_display_name(v_place), name = v_place, claimed_at = now()
         where user_id = p_user;
      else
        insert into public.display_names (canonical, user_id, name)
          values (public.hr_canon_display_name(v_place), p_user, v_place);
      end if;
      v_done := true;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20000 then raise exception 'hr_mod_force_rename: no free placeholder'; end if;
    end;
  end loop;

  -- The re-stamp trigger (§10) carries this to chat.
  update public.profiles
     set display_name = v_place, name_state = 'flagged', must_rename = true, updated_at = now()
   where id = p_user;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
  values (p_user, 0, 'moderation_rename', 'moderation_rename',
          jsonb_build_object('old_canon_hash', md5(coalesce(v_canon, '')), 'reason', v_reason,
                             'placeholder', v_place))
  returning id into v_ledger;

  return jsonb_build_object('ok', true, 'user', p_user, 'placeholder', v_place, 'ledger_id', v_ledger);
end $function$;
revoke execute on function public.hr_mod_force_rename(uuid, text) from public, anon, authenticated, service_role;

-- ── §2 THE CLAN CHAT POLICY (it reads profiles.clan_id; no clan channel exists) ─
drop policy if exists "clan channel readable by members" on public.chat_messages;

-- ── §3 THE MARKET'S CRON JOBS ────────────────────────────────────────────────
do $mig$
declare v_job text;
begin
  if to_regclass('cron.job') is not null then
    foreach v_job in array array['hr-market-expire', 'hr-market-sales-prune'] loop
      if exists (select 1 from cron.job where jobname = v_job) then perform cron.unschedule(v_job); end if;
    end loop;
  end if;
end $mig$;

-- ── §4 THE RELATIONS (one statement: FKs among them resolve; a dependent
--    OUTSIDE the list fails the apply loudly — no CASCADE) ───────────────────
drop view if exists public.market_price_history;
drop materialized view if exists public.leaderboard_ranked;
drop table if exists
  public.clan_bans, public.clan_board, public.clan_invites, public.clan_ledger, public.clan_members,
  public.clan_order_ballots, public.clan_order_votes, public.clan_raids, public.clan_stores,
  public.clan_tavern, public.clan_withdrawals, public.clan_work_labour, public.clan_work_orders,
  public.clans, public.hr_castle_board_tasks, public.hr_castle_buildings, public.hr_castle_items,
  public.hr_castle_tiers, public.hr_market_config, public.hr_rally_action_s, public.leaderboard_meta,
  public.market_buy_offers, public.market_listings, public.market_sales, public.raid_claims,
  public.raid_contributions, public.world_event_joins, public.world_event_pledges,
  public.world_event_totals;
drop sequence if exists public.clan_ledger_id_seq, public.market_sales_id_seq;
alter table public.profiles drop column if exists clan_id;

-- ── §5 THE FUNCTIONS (wrappers, __ungated bodies, helpers, triggers) ─────────
drop function if exists public.clan_board_claim(uuid,text);
drop function if exists public.clan_board_claim__ungated(uuid,text);
drop function if exists public.clan_board_progress(uuid,text,integer);
drop function if exists public.clan_board_progress__ungated(uuid,text,integer);
drop function if exists public.clan_board_roll(uuid);
drop function if exists public.clan_board_roll__ungated(uuid);
drop function if exists public.clan_contribute(uuid,bigint,integer);
drop function if exists public.clan_contribute__ungated(uuid,bigint,integer);
drop function if exists public.clan_create(text,text);
drop function if exists public.clan_deposit(uuid,jsonb);
drop function if exists public.clan_deposit__ungated(uuid,jsonb);
drop function if exists public.clan_feast_call(uuid);
drop function if exists public.clan_feast_call__ungated(uuid);
drop function if exists public.clan_feast_deposit(uuid,text,integer,integer);
drop function if exists public.clan_feast_deposit__ungated(uuid,text,integer,integer);
drop function if exists public.clan_hunt_declare(uuid,text,integer,text);
drop function if exists public.clan_hunt_declare__ungated(uuid,text,integer,text);
drop function if exists public.clan_invite(text);
drop function if exists public.clan_invite_revoke(uuid);
drop function if exists public.clan_invites_list();
drop function if exists public.clan_join(uuid);
drop function if exists public.clan_join_policy_set(text);
drop function if exists public.clan_kick(uuid,integer);
drop function if exists public.clan_leave();
drop function if exists public.clan_rested_grant(uuid);
drop function if exists public.clan_rested_grant__ungated(uuid);
drop function if exists public.clan_seat_read(uuid);
drop function if exists public.clan_seat_read__ungated(uuid);
drop function if exists public.clan_tier_up(uuid,integer);
drop function if exists public.clan_tier_up__ungated(uuid,integer);
drop function if exists public.clan_upkeep_settle(uuid);
drop function if exists public.clan_vice_set(uuid,uuid,boolean);
drop function if exists public.clan_vice_set__ungated(uuid,uuid,boolean);
drop function if exists public.clan_vote_cast(uuid,uuid,text);
drop function if exists public.clan_vote_cast__ungated(uuid,uuid,text);
drop function if exists public.clan_vote_close(uuid,uuid);
drop function if exists public.clan_vote_close__ungated(uuid,uuid);
drop function if exists public.clan_vote_open(uuid,jsonb,integer);
drop function if exists public.clan_vote_open__ungated(uuid,jsonb,integer);
drop function if exists public.clan_vote_read(uuid);
drop function if exists public.clan_vote_read__ungated(uuid);
drop function if exists public.clan_work_complete(uuid,uuid);
drop function if exists public.clan_work_complete__ungated(uuid,uuid);
drop function if exists public.clan_work_labour(uuid,uuid,integer);
drop function if exists public.clan_work_labour__ungated(uuid,uuid,integer);
drop function if exists public.clan_work_post(uuid,text,integer);
drop function if exists public.clan_work_post__ungated(uuid,text,integer);
drop function if exists public.clan_work_supply(uuid,uuid,jsonb);
drop function if exists public.clan_work_supply__ungated(uuid,uuid,jsonb);
drop function if exists public.hr_clan_board_rows(uuid,text,text);
drop function if exists public.hr_clan_browser(integer);
drop function if exists public.hr_clan_decay_cp(uuid,uuid);
drop function if exists public.hr_clan_may_admit(uuid,uuid);
drop function if exists public.hr_clan_may_post(uuid,uuid);
drop function if exists public.hr_clan_member_cap_guard();
drop function if exists public.hr_clan_order_create(uuid,text,uuid);
drop function if exists public.hr_clan_vote_settle(uuid);
drop function if exists public.hr_clan_vote_settle_one(uuid,uuid);
drop function if exists public.hr_clan_vote_tally(uuid);
drop function if exists public.hr_clan_week_start(timestamp with time zone);
drop function if exists public.hr_companion_equip(integer,text,boolean);
drop function if exists public.hr_companion_grant(integer,text,text,uuid);
drop function if exists public.hr_daily_task_eligible(text,bigint,bigint,bigint,bigint);
drop function if exists public.hr_daily_task_set(text);
drop function if exists public.hr_daily_task_set_caps(text,bigint,bigint,bigint,bigint,boolean);
drop function if exists public.hr_daily_task_set_for(text,uuid,integer);
drop function if exists public.hr_goal_daily_seed(text);
drop function if exists public.hr_goal_period_start(boolean,timestamp with time zone);
drop function if exists public.hr_goal_week_days(timestamp with time zone);
drop function if exists public.hr_iso_week_key(timestamp with time zone);
drop function if exists public.hr_lb_boards();
drop function if exists public.hr_lb_num(jsonb,text);
drop function if exists public.hr_lb_skills();
drop function if exists public.hr_lb_unsourced();
drop function if exists public.hr_leaderboard(text,integer,integer);
drop function if exists public.hr_leaderboard__ungated(text,integer,integer);
drop function if exists public.hr_leaderboard_refresh(boolean);
drop function if exists public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint);
drop function if exists public.hr_market_cancel(uuid,integer,bigint,uuid,uuid);
drop function if exists public.hr_market_expire(integer);
drop function if exists public.hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint);
drop function if exists public.hr_market_listing_immutable();
drop function if exists public.hr_market_offer_cap();
drop function if exists public.hr_market_offer_immutable();
drop function if exists public.hr_market_offer_stamp();
drop function if exists public.hr_max_hunt_tier(uuid);
drop function if exists public.hr_muster_window(timestamp with time zone);
drop function if exists public.hr_rally_absent_chest(text);
drop function if exists public.hr_rally_chest(text,bigint,integer,integer);
drop function if exists public.hr_rally_chest_value(jsonb);
drop function if exists public.hr_rally_day(text);
drop function if exists public.hr_rally_day_close(text);
drop function if exists public.hr_rally_event_for_key(text);
drop function if exists public.hr_rally_event_id(text,integer);
drop function if exists public.hr_rally_pledge_char(uuid);
drop function if exists public.hr_rally_pledge_state();
drop function if exists public.hr_rally_pledge_state__ungated();
drop function if exists public.hr_rally_point_rules(text);
drop function if exists public.hr_rally_points_of(uuid,integer,text,timestamp with time zone,timestamp with time zone);
drop function if exists public.hr_rally_pool();
drop function if exists public.hr_rally_refresh(uuid,text);
drop function if exists public.hr_rally_slot(text,integer);
drop function if exists public.hr_rally_theme(text);
drop function if exists public.hr_rally_xp_credit(text,jsonb);
drop function if exists public.hr_tally_state(integer);
drop function if exists public.hr_unlock_buy(uuid,integer,bigint,uuid,text);
drop function if exists public.hr_utc_week_key(timestamp with time zone);
drop function if exists public.hr_week_start(text);
drop function if exists public.hr_worker_assign(integer,text,text,text,uuid);
drop function if exists public.hr_worker_hire(integer,uuid);
drop function if exists public.market_sales_prune(interval);
drop function if exists public.raid_strike(uuid,text,text,bigint,bigint);
drop function if exists public.raid_strike__ungated(uuid,text,text,bigint,bigint);
drop function if exists public.sync_profile_clan();
drop function if exists public.world_event_contribute(text);
drop function if exists public.world_event_contribute__ungated(text);
drop function if exists public.world_event_join(text);
drop function if exists public.world_event_join__ungated(text);

delete from public.hr_client_rpc_baseline where proname = any (array[
    'clan_board_claim', 'clan_board_claim__ungated', 'clan_board_progress',
    'clan_board_progress__ungated', 'clan_board_roll', 'clan_board_roll__ungated',
    'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit',
    'clan_deposit__ungated', 'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit',
    'clan_feast_deposit__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated', 'clan_invite',
    'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
    'clan_leave', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read',
    'clan_seat_read__ungated', 'clan_tier_up', 'clan_tier_up__ungated', 'clan_upkeep_settle',
    'clan_vice_set', 'clan_vice_set__ungated', 'clan_vote_cast', 'clan_vote_cast__ungated',
    'clan_vote_close', 'clan_vote_close__ungated', 'clan_vote_open', 'clan_vote_open__ungated',
    'clan_vote_read', 'clan_vote_read__ungated', 'clan_work_complete',
    'clan_work_complete__ungated', 'clan_work_labour', 'clan_work_labour__ungated',
    'clan_work_post', 'clan_work_post__ungated', 'clan_work_supply', 'clan_work_supply__ungated',
    'hr_clan_board_rows', 'hr_clan_browser', 'hr_clan_decay_cp', 'hr_clan_may_admit',
    'hr_clan_may_post', 'hr_clan_member_cap_guard', 'hr_clan_order_create', 'hr_clan_vote_settle',
    'hr_clan_vote_settle_one', 'hr_clan_vote_tally', 'hr_clan_week_start', 'hr_companion_equip',
    'hr_companion_grant', 'hr_daily_task_eligible', 'hr_daily_task_set', 'hr_daily_task_set_caps',
    'hr_daily_task_set_for', 'hr_goal_daily_seed', 'hr_goal_period_start', 'hr_goal_week_days',
    'hr_iso_week_key', 'hr_lb_boards', 'hr_lb_num', 'hr_lb_skills', 'hr_lb_unsourced',
    'hr_leaderboard', 'hr_leaderboard__ungated', 'hr_leaderboard_refresh', 'hr_market_buy',
    'hr_market_cancel', 'hr_market_expire', 'hr_market_list', 'hr_market_listing_immutable',
    'hr_market_offer_cap', 'hr_market_offer_immutable', 'hr_market_offer_stamp', 'hr_max_hunt_tier',
    'hr_muster_window', 'hr_rally_absent_chest', 'hr_rally_chest', 'hr_rally_chest_value',
    'hr_rally_day', 'hr_rally_day_close', 'hr_rally_event_for_key', 'hr_rally_event_id',
    'hr_rally_pledge_char', 'hr_rally_pledge_state', 'hr_rally_pledge_state__ungated',
    'hr_rally_point_rules', 'hr_rally_points_of', 'hr_rally_pool', 'hr_rally_refresh',
    'hr_rally_slot', 'hr_rally_theme', 'hr_rally_xp_credit', 'hr_tally_state', 'hr_unlock_buy',
    'hr_utc_week_key', 'hr_week_start', 'hr_worker_assign', 'hr_worker_hire', 'market_sales_prune',
    'raid_strike', 'raid_strike__ungated', 'sync_profile_clan', 'world_event_contribute',
    'world_event_contribute__ungated', 'world_event_join', 'world_event_join__ungated']);

-- ── §6 hr_rpc_gate RESTATED WHOLE: exactly the buckets a surviving body passes ─
-- Gone with their callers: every clan_* bucket, buy_listing, raid_strike,
-- world_event_contribute / _join, hr_rally_pledge_state, hr_leaderboard,
-- hr_tally_state, hr_goal_state, worker_hire / _assign, and the already-orphaned
-- hr_credit_kills, hr_credit_combat_xp, hr_set_style, hr_accept_bounty,
-- hr_claim_bounty, hr_bounty_spend, hr_claim_goal, hr_vigour_refill, hunt_use
-- (their functions left in earlier files). §7(c) asserts the set both ways.
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
    when 'hr_display_name_available', 'hr_server_now'
      then v_limit := 120;
    when 'farm_plant', 'farm_harvest', 'farm_water',
         'bank_move',
         'client_state_put'
      then v_limit := 60;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'hr_claim_daily',
         'hr_trait_buy'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_buy_hero_slot' then v_limit := 12;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
    -- HUNT SESSIONS (2026-10-21-hunt-sessions.sql): every session / bag /
    -- action-bar write shares `hunt`; the Analyzer and the read cursor are
    -- `hunt_read`.
    when 'hunt' then v_limit := 30;
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

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  c_gone constant text[] := array[
    'clan_board_claim', 'clan_board_claim__ungated', 'clan_board_progress',
    'clan_board_progress__ungated', 'clan_board_roll', 'clan_board_roll__ungated',
    'clan_contribute', 'clan_contribute__ungated', 'clan_create', 'clan_deposit',
    'clan_deposit__ungated', 'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit',
    'clan_feast_deposit__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated', 'clan_invite',
    'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
    'clan_leave', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read',
    'clan_seat_read__ungated', 'clan_tier_up', 'clan_tier_up__ungated', 'clan_upkeep_settle',
    'clan_vice_set', 'clan_vice_set__ungated', 'clan_vote_cast', 'clan_vote_cast__ungated',
    'clan_vote_close', 'clan_vote_close__ungated', 'clan_vote_open', 'clan_vote_open__ungated',
    'clan_vote_read', 'clan_vote_read__ungated', 'clan_work_complete',
    'clan_work_complete__ungated', 'clan_work_labour', 'clan_work_labour__ungated',
    'clan_work_post', 'clan_work_post__ungated', 'clan_work_supply', 'clan_work_supply__ungated',
    'hr_clan_board_rows', 'hr_clan_browser', 'hr_clan_decay_cp', 'hr_clan_may_admit',
    'hr_clan_may_post', 'hr_clan_member_cap_guard', 'hr_clan_order_create', 'hr_clan_vote_settle',
    'hr_clan_vote_settle_one', 'hr_clan_vote_tally', 'hr_clan_week_start', 'hr_companion_equip',
    'hr_companion_grant', 'hr_daily_task_eligible', 'hr_daily_task_set', 'hr_daily_task_set_caps',
    'hr_daily_task_set_for', 'hr_goal_daily_seed', 'hr_goal_period_start', 'hr_goal_week_days',
    'hr_iso_week_key', 'hr_lb_boards', 'hr_lb_num', 'hr_lb_skills', 'hr_lb_unsourced',
    'hr_leaderboard', 'hr_leaderboard__ungated', 'hr_leaderboard_refresh', 'hr_market_buy',
    'hr_market_cancel', 'hr_market_expire', 'hr_market_list', 'hr_market_listing_immutable',
    'hr_market_offer_cap', 'hr_market_offer_immutable', 'hr_market_offer_stamp', 'hr_max_hunt_tier',
    'hr_muster_window', 'hr_rally_absent_chest', 'hr_rally_chest', 'hr_rally_chest_value',
    'hr_rally_day', 'hr_rally_day_close', 'hr_rally_event_for_key', 'hr_rally_event_id',
    'hr_rally_pledge_char', 'hr_rally_pledge_state', 'hr_rally_pledge_state__ungated',
    'hr_rally_point_rules', 'hr_rally_points_of', 'hr_rally_pool', 'hr_rally_refresh',
    'hr_rally_slot', 'hr_rally_theme', 'hr_rally_xp_credit', 'hr_tally_state', 'hr_unlock_buy',
    'hr_utc_week_key', 'hr_week_start', 'hr_worker_assign', 'hr_worker_hire', 'market_sales_prune',
    'raid_strike', 'raid_strike__ungated', 'sync_profile_clan', 'world_event_contribute',
    'world_event_contribute__ungated', 'world_event_join', 'world_event_join__ungated'];
  c_rels constant text[] := array[
    'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_members', 'clan_order_ballots',
    'clan_order_votes', 'clan_raids', 'clan_stores', 'clan_tavern', 'clan_withdrawals',
    'clan_work_labour', 'clan_work_orders', 'clans', 'hr_castle_board_tasks', 'hr_castle_buildings',
    'hr_castle_items', 'hr_castle_tiers', 'hr_market_config', 'hr_rally_action_s', 'leaderboard_meta',
    'leaderboard_ranked', 'market_buy_offers', 'market_listings', 'market_price_history', 'market_sales',
    'raid_claims', 'raid_contributions', 'world_event_joins', 'world_event_pledges', 'world_event_totals',
    'clan_ledger_id_seq', 'market_sales_id_seq'];
  v_u constant uuid := '000000c0-0000-0000-0000-0000c1ea0001';
  v_left text; v_src text; v_case text; v_r jsonb;
  v_gate text[]; v_called text[];
begin
  -- (a) every dropped function, relation and column is gone.
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (c_gone);
  if v_left is not null then raise exception 'VERIFY(a): still exist: %', v_left; end if;
  select string_agg(c.relname, ', ') into v_left
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any (c_rels);
  if v_left is not null then raise exception 'VERIFY(a): relations still exist: %', v_left; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'clan_id') then
    raise exception 'VERIFY(a): profiles.clan_id still exists'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'clan channel readable by members') then
    raise exception 'VERIFY(a): the clan chat policy still exists'; end if;
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname in ('hr-market-expire', 'hr-market-sales-prune')) then
    raise exception 'VERIFY(a): a market cron job is still scheduled'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = any (c_gone)) then
    raise exception 'VERIFY(a): hr_client_rpc_baseline still approves a dropped RPC'; end if;

  -- (b) NO SURVIVING BODY OR CRON COMMAND NAMES A DROPPED FUNCTION OR RELATION
  --     in code (comments stripped). hr_assert_grant_hygiene's allowlist is
  --     inert text by design and is excluded.
  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname <> 'hr_assert_grant_hygiene'
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
         ~ ('\m(' || array_to_string(c_gone || c_rels, '|') || ')\M');
  if v_left is not null then raise exception 'VERIFY(b): a surviving body still names a dropped object: %', v_left; end if;
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where command ~ ('\m(' || array_to_string(c_gone || c_rels, '|') || ')\M')) then
    raise exception 'VERIFY(b): a cron command still names a dropped object'; end if;

  -- (c) THE GATE ADMITS EXACTLY THE BUCKETS A SURVIVING BODY PASSES, both ways.
  select prosrc into v_src from pg_proc where oid = 'public.hr_rpc_gate(text)'::regprocedure;
  v_case := substring(v_src from position('case p_bucket' in v_src) for position('end case' in v_src) - position('case p_bucket' in v_src));
  select array_agg(distinct m[1] order by m[1]) into v_gate from regexp_matches(v_case, '''([a-z0-9_]+)''', 'g') m;
  select array_agg(distinct m[1] order by m[1]) into v_called
    from pg_proc p, regexp_matches(p.prosrc, 'hr_rpc_gate\s*\(\s*''([a-z0-9_]+)''\s*\)', 'g') m
   where p.pronamespace = 'public'::regnamespace and p.proname <> 'hr_rpc_gate';
  if v_gate is distinct from v_called then
    raise exception 'VERIFY(c): gate buckets % <> live callers %', v_gate, v_called; end if;

  -- (d) EXECUTED, as an admitted signed-in caller: a dropped bucket is refused,
  --     the kept ones still admit, the clock answers without a muster key, the
  --     clan-free cap is the base 12 h.
  if public.hr_offline_cap_ms(null, 0) <> 12 * 3600000::bigint then
    raise exception 'VERIFY(d): hr_offline_cap_ms(null) answered %', public.hr_offline_cap_ms(null, 0); end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'server-cleanup §7 probe') on conflict (user_id) do nothing;
    foreach v_left in array array['clan_join', 'buy_listing', 'hr_leaderboard', 'worker_hire', 'raid_strike'] loop
      if public.hr_rpc_gate(v_left) then raise exception 'VERIFY(d): the dropped % bucket still admits', v_left; end if;
    end loop;
    foreach v_left in array v_gate loop
      if not public.hr_rpc_gate(v_left) then raise exception 'VERIFY(d): the kept % bucket no longer admits', v_left; end if;
    end loop;
    v_r := public.hr_server_now();
    if coalesce(v_r->>'ok', '') <> 'true' or v_r ? 'live_event_key' or not (v_r ? 'day_key') then
      raise exception 'VERIFY(d): hr_server_now answered %', v_r; end if;
    raise exception using errcode = 'HR877', message = 'server-cleanup §7 probe complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hr_access_allowlist where user_id = v_u) then raise exception 'VERIFY(d): §7 LEAKED a probe row'; end if;

  -- (e) THE RESTATED BODIES KEPT THEIR POSTURE.
  if not has_function_privilege('hr_engine', 'public.hr_offline_cap_ms(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_offline_cap_ms(uuid,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_server_now()', 'execute')
     or has_function_privilege('anon', 'public.hr_server_now()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_mod_force_rename(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_name_restamp()', 'execute') then
    raise exception 'VERIFY(e): a restated body''s grants moved'; end if;

  -- (f) grant hygiene is strict-green and no approved client RPC went missing.
  v_r := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(v_r->'baseline_rows_no_longer_live') > 0 then
    raise exception 'VERIFY(f): approved client RPCs lost: %', v_r->'baseline_rows_no_longer_live'; end if;
  raise notice 'server-cleanup: old systems dropped, readers restated, gate exact; all green';
end $$;
