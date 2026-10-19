-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-26-demolition-m1-drops.sql — DEMOLITION M1, PART 2: THE RETIRED
-- SYSTEMS' SERVER HALF GOES (lane C, the closed rebuild — Tyler 2026-10-15:
-- "the game is closed and will be WIPED ... old systems are deleted outright";
-- guard diet 2026-10-19 R2: "write the M1/M2 drop migration").
-- STAGED, NOT APPLIED. Game CLOSED: applies on its passing §5 (CLAUDE.md §2,
-- Tyler 10-17); the reopen-gate Security review covers it. The Coordinator
-- applies (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00-00:10 UTC).
--
-- ORDER: AFTER 2026-10-26-demolition-m1-readers.sql (§0 refuses while any
-- surviving body still reads a dropped object). EDGE FIRST: the hr-accrue
-- payload without the market / unlock_buy verbs and the worker merge must be
-- live (pack-edge --hash == the deployed payload_sha256), or those verbs answer
-- "function does not exist" instead of `unknown_verb`.
--
-- ── WHAT IT DELETES (none of it is on the v0.2.1 client's surface:
--    tests/client-intent-surface.mjs CLIENT_RPCS / CLIENT_EDGE_INTENTS) ───────
--   CLANS + CASTLE   clans and every clan_* table, the castle catalogues, the
--                    feast foods, clan_* RPCs (+ __ungated), hr_clan_* helpers,
--                    the profile mirror (sync_profile_clan, profiles.clan_id).
--   RAIDS            raid_strike / raid_claim, raid_claims, raid_contributions,
--                    clan_raids, hr_max_hunt_tier (read only by the raid/clan
--                    hunt declare), hr_week_start / hr_utc_week_key.
--   MARKET           listings, buy offers, sales, the price-history view, the
--                    config row, hr_market_* (list / buy / cancel / expire and
--                    the offer triggers), market_sales_prune, two cron jobs.
--   COMPANIONS       hr_companion_grant / hr_companion_equip and the grant
--                    catalogue. (player_state.companion_equipped stays: the
--                    perk read and the projection still name it; with no writer
--                    it is null after the wipe.)
--   WORLD EVENTS     world_event_* RPCs (+ __ungated) and tables, the muster /
--                    rally helpers (hr_rally_*, hr_muster_window).
--   DAILY + QUESTS   hr_claim_daily / hr_claim_quest (+ __ungated), the daily
--                    task set helpers, hr_tally_state, hr_goal_* helpers,
--                    hr_quest_rewards (+ its item check), hr_iso_week_key. The
--                    'hr_claim_daily' RATE BUCKET stays: hr_login_claim spends it.
--   LEADERBOARDS     hr_leaderboard (+ __ungated), hr_leaderboard_refresh,
--                    hr_lb_* (hr_lb_combat_level STAYS: renown, the hunt gate and
--                    the party level read it), leaderboard_ranked, leaderboard_meta.
--   HIRED WORKERS    hr_worker_hire / hr_worker_assign, player_workers,
--                    player_state.workers_accrued_to.
--   HERO-SLOT BUY    hr_buy_hero_slot (+ __ungated). hr_hero_slots and
--                    hr_hero_slots_of STAY (the client reads `hero_slots`).
--   UNLOCK BUYS      hr_unlock_buy (engine), hr_unlock_offers; hr_buy_gem_unlock
--                    (+ __ungated), hr_gem_unlocks, hr_gem_unlocks_of. hr_unlocks
--                    STAYS (perks, recipes and the bank-cap rungs read it).
--   BOUNTY LEFTOVERS active_bounty, hr_bounty_monsters, hr_bounty_board_monsters
--                    and every hr_bounty_* helper but hr_bounty_combat_level (the
--                    hunt gate, blessings, chat and the sheet read it).
--   ATTENDED CREDIT  hr_credit_combat_xp (+ __ungated; it already refused a
--                    hunter), hr_combat_xp_cap, hr_combat_xp_credit_log and
--                    hr_kill_credit_log with their prune functions + cron jobs.
--   GATE + BASELINE  hr_rpc_gate restated WHOLE minus the dead buckets (§0
--                    md5-pins the 2026-10-25-character-sheet.sql body); the
--                    dropped client RPCs leave hr_client_rpc_baseline.
--
-- ── WHAT IT DELIBERATELY KEEPS (each is on a live path; listed so the next
--    lane does not have to rediscover it) ─────────────────────────────────
--   set_activity, the gather / artisan engine and the artisan recipe catalogue
--     (Coordinator 2026-10-26: Prayer trains by burying bones through them).
--   The OLD party (party, party_member, party_invite, party_hunt*, party_tick_
--     lease, party_settle_boundary, hr_party_* save hr_party_invites_view) and the
--     world-tick gather / presence channel (hr_tick_roster, hr_return_anchor,
--     hr_offline_cap_ms, hr_accrue_cap_ms): hr_tick_cron_run drives the v0.2.1
--     hunt roster in the same body, the edge accrue read calls hr_accrue_cap_ms,
--     and the gather tick is the kept gathering path's away pay.
--   hr_claim_rank (renown ranks), hr_trait_buy, the Discord gift, the farm,
--     combat styles: not in this demolition's ruling.
--   hr_assert_grant_hygiene is NOT restated: its engine allowlist keeps the
--     dropped names as inert TEXT (it admits nothing that does not exist — the
--     same posture links 19-20 took); a removal link needs its own declared
--     removals and buys nothing.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
-- Every dropped writer moved value on a surface no client can reach today
-- (none is on CLIENT_RPCS / CLIENT_EDGE_INTENTS); dropping a writer cannot mint.
-- The append-only ledger keeps every historic row (kinds untouched).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- The beta is wiped at cutover; the dropped tables hold closed-beta rows only.
-- A revert re-runs the original migrations of each family (they stay in the
-- chain) and the 2026-10-25-character-sheet.sql gate body. No begin/commit.
--
-- ⚠ AFTER APPLYING (Coordinator): live-hash-drift --live --write (152
--   functions and 42 relations leave; hr_rpc_gate moves); restore-census
--   re-pinned in this lane.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS: THE READERS WENT FIRST, AND THE GATE IS THE ONE WE CUT ─
do $mig$
declare
  v_funcs  text[] := array[
      'clan_board_claim', 'clan_board_claim__ungated', 'clan_board_progress',
      'clan_board_progress__ungated', 'clan_board_roll', 'clan_board_roll__ungated', 'clan_contribute',
      'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
      'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit',
      'clan_feast_deposit__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated', 'clan_invite',
      'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
      'clan_leave', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read',
      'clan_seat_read__ungated', 'clan_tier_up', 'clan_tier_up__ungated', 'clan_upkeep_settle',
      'clan_vice_set', 'clan_vice_set__ungated', 'clan_vote_cast', 'clan_vote_cast__ungated',
      'clan_vote_close', 'clan_vote_close__ungated', 'clan_vote_open', 'clan_vote_open__ungated',
      'clan_vote_read', 'clan_vote_read__ungated', 'clan_work_complete', 'clan_work_complete__ungated',
      'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
      'clan_work_supply', 'clan_work_supply__ungated', 'hr_bounty_count_mult',
      'hr_bounty_difficulty_unlocked', 'hr_bounty_first_contract', 'hr_bounty_first_contract_range',
      'hr_bounty_kill_cap', 'hr_bounty_kill_range', 'hr_bounty_kills', 'hr_bounty_reward',
      'hr_bounty_unlocked_tier', 'hr_buy_gem_unlock', 'hr_buy_gem_unlock__ungated', 'hr_buy_hero_slot',
      'hr_buy_hero_slot__ungated', 'hr_claim_daily', 'hr_claim_daily__ungated', 'hr_claim_quest',
      'hr_claim_quest__ungated', 'hr_clan_board_rows', 'hr_clan_browser', 'hr_clan_decay_cp',
      'hr_clan_may_admit', 'hr_clan_may_post', 'hr_clan_member_cap_guard', 'hr_clan_order_create',
      'hr_clan_vote_settle', 'hr_clan_vote_settle_one', 'hr_clan_vote_tally', 'hr_clan_week_start',
      'hr_combat_xp_cap', 'hr_combat_xp_credit_prune', 'hr_companion_equip', 'hr_companion_grant',
      'hr_credit_combat_xp', 'hr_credit_combat_xp__ungated', 'hr_daily_task_eligible',
      'hr_daily_task_set', 'hr_daily_task_set_caps', 'hr_daily_task_set_for', 'hr_gem_unlocks_of',
      'hr_goal_daily_seed', 'hr_goal_period_start', 'hr_goal_week_days', 'hr_iso_week_key',
      'hr_kill_credit_prune', 'hr_lb_boards', 'hr_lb_num', 'hr_lb_skills', 'hr_lb_unsourced',
      'hr_leaderboard', 'hr_leaderboard__ungated', 'hr_leaderboard_refresh', 'hr_market_buy',
      'hr_market_cancel', 'hr_market_expire', 'hr_market_list', 'hr_market_listing_immutable',
      'hr_market_offer_cap', 'hr_market_offer_immutable', 'hr_market_offer_stamp', 'hr_max_hunt_tier',
      'hr_muster_window', 'hr_quest_rewards_items_ok', 'hr_rally_absent_chest', 'hr_rally_chest',
      'hr_rally_chest_value', 'hr_rally_day', 'hr_rally_day_close', 'hr_rally_event_for_key',
      'hr_rally_event_id', 'hr_rally_pledge_char', 'hr_rally_pledge_state',
      'hr_rally_pledge_state__ungated', 'hr_rally_point_rules', 'hr_rally_points_of', 'hr_rally_pool',
      'hr_rally_refresh', 'hr_rally_slot', 'hr_rally_theme', 'hr_rally_xp_credit', 'hr_tally_state',
      'hr_unlock_buy', 'hr_utc_week_key', 'hr_week_start', 'hr_worker_assign', 'hr_worker_hire',
      'market_sales_prune', 'raid_claim', 'raid_claim__ungated', 'raid_strike', 'raid_strike__ungated',
      'sync_profile_clan', 'world_event_absence_claim', 'world_event_absence_claim__ungated',
      'world_event_claim', 'world_event_claim__ungated', 'world_event_contribute',
      'world_event_contribute__ungated', 'world_event_join', 'world_event_join__ungated',
      'world_event_pledge', 'world_event_pledge__ungated', 'world_event_pledge_settle',
      'world_event_pledge_settle__ungated'];
  v_tables text[] := array[
      'market_price_history', 'leaderboard_ranked', 'clan_order_ballots', 'clan_order_votes',
      'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_members', 'clan_raids',
      'clan_stores', 'clan_tavern', 'clan_withdrawals', 'clan_work_labour', 'clan_work_orders',
      'raid_claims', 'raid_contributions', 'clans', 'hr_castle_board_tasks', 'hr_castle_buildings',
      'hr_castle_items', 'hr_castle_tiers', 'hr_feast_foods', 'leaderboard_meta', 'market_buy_offers',
      'market_listings', 'market_sales', 'hr_market_config', 'world_event_joins',
      'world_event_pledges', 'world_event_totals', 'hr_rally_action_s', 'hr_companion_grants',
      'hr_quest_rewards', 'player_workers', 'hr_unlock_offers', 'hr_gem_unlocks', 'active_bounty',
      'hr_bounty_board_monsters', 'hr_bounty_monsters', 'hr_kill_credit_log',
      'hr_combat_xp_credit_log'];
  v_readers text;
  v_md5     text;
  v_case    text;
begin
  -- Fail closed: no body OUTSIDE the drop set may still name a dropped object
  -- in code. hr_rpc_gate (bucket strings, restated in §3) and
  -- hr_assert_grant_hygiene (allowlist text) carry DATA, not calls; so does a
  -- caller's hr_rpc_gate('<bucket>') argument (hr_login_claim spends the
  -- 'hr_claim_daily' bucket), which is stripped before the match.
  select string_agg(distinct p.oid::regprocedure::text || ' -> ' || o.obj, '; ')
    into v_readers
    from pg_proc p, unnest(v_funcs || v_tables) o(obj)
   where p.pronamespace = 'public'::regnamespace
     and not (p.proname = any (v_funcs))
     and p.proname not in ('hr_rpc_gate', 'hr_assert_grant_hygiene')
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g'),
                        'hr_rpc_gate\(\s*''[a-z0-9_]+''\s*\)', '', 'g')
         ~ ('\m' || o.obj || '\M');
  if v_readers is not null then
    raise exception 'demolition-m1-drops: still read by % — 2026-10-26-demolition-m1-readers.sql (or the reader''s own restatement) must apply first', v_readers;
  end if;
  select md5(replace(p.prosrc, chr(13), '')),
         substring(p.prosrc from 'case p_bucket(.*)end case')
    into v_md5, v_case
    from pg_proc p where p.oid = to_regprocedure('public.hr_rpc_gate(text)');
  if v_md5 is null then raise exception 'demolition-m1-drops: hr_rpc_gate is absent'; end if;
  if v_md5 <> '71013ed0842045ab4a98d2ef664792cc' and v_case ~ '''(clan_join|raid_strike|world_event_join|worker_hire|hr_leaderboard)''' then
    raise exception 'demolition-m1-drops: hr_rpc_gate is not the body this file restates (md5 %) — re-derive from the installed body', v_md5;
  end if;
end $mig$;

-- ── §1 THE CRON JOBS THAT CALL A DROPPED FUNCTION ──────────────────────────
select public.hr_cron_drop('hr-market-expire');
select public.hr_cron_drop('hr-market-sales-prune');
select public.hr_cron_drop('hr-kill-credit-prune');
select public.hr_cron_drop('hr-combat-xp-credit-prune');

-- ── §2 THE RELATIONS (views first, children before parents; no CASCADE, so an
--    undeclared dependent refuses the file instead of vanishing with it) ─────
drop view if exists public.market_price_history;
drop materialized view if exists public.leaderboard_ranked;
drop table if exists public.clan_order_ballots;
drop table if exists public.clan_order_votes;
drop table if exists public.clan_bans;
drop table if exists public.clan_board;
drop table if exists public.clan_invites;
drop table if exists public.clan_ledger;
drop table if exists public.clan_members;
drop table if exists public.clan_raids;
drop table if exists public.clan_stores;
drop table if exists public.clan_tavern;
drop table if exists public.clan_withdrawals;
drop table if exists public.clan_work_labour;
drop table if exists public.clan_work_orders;
drop table if exists public.raid_claims;
drop table if exists public.raid_contributions;
drop table if exists public.clans;
drop table if exists public.hr_castle_board_tasks;
drop table if exists public.hr_castle_buildings;
drop table if exists public.hr_castle_items;
drop table if exists public.hr_castle_tiers;
drop table if exists public.hr_feast_foods;
drop table if exists public.leaderboard_meta;
drop table if exists public.market_buy_offers;
drop table if exists public.market_listings;
drop table if exists public.market_sales;
drop table if exists public.hr_market_config;
drop table if exists public.world_event_joins;
drop table if exists public.world_event_pledges;
drop table if exists public.world_event_totals;
drop table if exists public.hr_rally_action_s;
drop table if exists public.hr_companion_grants;
drop table if exists public.hr_quest_rewards;
drop table if exists public.player_workers;
drop table if exists public.hr_unlock_offers;
drop table if exists public.hr_gem_unlocks;
drop table if exists public.active_bounty;
drop table if exists public.hr_bounty_board_monsters;
drop table if exists public.hr_bounty_monsters;
drop table if exists public.hr_kill_credit_log;
drop table if exists public.hr_combat_xp_credit_log;
alter table public.profiles drop column if exists clan_id;
alter table public.player_state drop column if exists workers_accrued_to;

-- ── §2b THE FUNCTIONS (every overload of every listed name; no CASCADE) ─────
do $mig$
declare
  v_funcs text[] := array[
      'clan_board_claim', 'clan_board_claim__ungated', 'clan_board_progress',
      'clan_board_progress__ungated', 'clan_board_roll', 'clan_board_roll__ungated', 'clan_contribute',
      'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
      'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit',
      'clan_feast_deposit__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated', 'clan_invite',
      'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
      'clan_leave', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read',
      'clan_seat_read__ungated', 'clan_tier_up', 'clan_tier_up__ungated', 'clan_upkeep_settle',
      'clan_vice_set', 'clan_vice_set__ungated', 'clan_vote_cast', 'clan_vote_cast__ungated',
      'clan_vote_close', 'clan_vote_close__ungated', 'clan_vote_open', 'clan_vote_open__ungated',
      'clan_vote_read', 'clan_vote_read__ungated', 'clan_work_complete', 'clan_work_complete__ungated',
      'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
      'clan_work_supply', 'clan_work_supply__ungated', 'hr_bounty_count_mult',
      'hr_bounty_difficulty_unlocked', 'hr_bounty_first_contract', 'hr_bounty_first_contract_range',
      'hr_bounty_kill_cap', 'hr_bounty_kill_range', 'hr_bounty_kills', 'hr_bounty_reward',
      'hr_bounty_unlocked_tier', 'hr_buy_gem_unlock', 'hr_buy_gem_unlock__ungated', 'hr_buy_hero_slot',
      'hr_buy_hero_slot__ungated', 'hr_claim_daily', 'hr_claim_daily__ungated', 'hr_claim_quest',
      'hr_claim_quest__ungated', 'hr_clan_board_rows', 'hr_clan_browser', 'hr_clan_decay_cp',
      'hr_clan_may_admit', 'hr_clan_may_post', 'hr_clan_member_cap_guard', 'hr_clan_order_create',
      'hr_clan_vote_settle', 'hr_clan_vote_settle_one', 'hr_clan_vote_tally', 'hr_clan_week_start',
      'hr_combat_xp_cap', 'hr_combat_xp_credit_prune', 'hr_companion_equip', 'hr_companion_grant',
      'hr_credit_combat_xp', 'hr_credit_combat_xp__ungated', 'hr_daily_task_eligible',
      'hr_daily_task_set', 'hr_daily_task_set_caps', 'hr_daily_task_set_for', 'hr_gem_unlocks_of',
      'hr_goal_daily_seed', 'hr_goal_period_start', 'hr_goal_week_days', 'hr_iso_week_key',
      'hr_kill_credit_prune', 'hr_lb_boards', 'hr_lb_num', 'hr_lb_skills', 'hr_lb_unsourced',
      'hr_leaderboard', 'hr_leaderboard__ungated', 'hr_leaderboard_refresh', 'hr_market_buy',
      'hr_market_cancel', 'hr_market_expire', 'hr_market_list', 'hr_market_listing_immutable',
      'hr_market_offer_cap', 'hr_market_offer_immutable', 'hr_market_offer_stamp', 'hr_max_hunt_tier',
      'hr_muster_window', 'hr_quest_rewards_items_ok', 'hr_rally_absent_chest', 'hr_rally_chest',
      'hr_rally_chest_value', 'hr_rally_day', 'hr_rally_day_close', 'hr_rally_event_for_key',
      'hr_rally_event_id', 'hr_rally_pledge_char', 'hr_rally_pledge_state',
      'hr_rally_pledge_state__ungated', 'hr_rally_point_rules', 'hr_rally_points_of', 'hr_rally_pool',
      'hr_rally_refresh', 'hr_rally_slot', 'hr_rally_theme', 'hr_rally_xp_credit', 'hr_tally_state',
      'hr_unlock_buy', 'hr_utc_week_key', 'hr_week_start', 'hr_worker_assign', 'hr_worker_hire',
      'market_sales_prune', 'raid_claim', 'raid_claim__ungated', 'raid_strike', 'raid_strike__ungated',
      'sync_profile_clan', 'world_event_absence_claim', 'world_event_absence_claim__ungated',
      'world_event_claim', 'world_event_claim__ungated', 'world_event_contribute',
      'world_event_contribute__ungated', 'world_event_join', 'world_event_join__ungated',
      'world_event_pledge', 'world_event_pledge__ungated', 'world_event_pledge_settle',
      'world_event_pledge_settle__ungated'];
  r record;
begin
  for r in select p.oid::regprocedure::text as sig
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname = any (v_funcs)
            order by p.proname, p.oid loop
    execute 'drop function ' || r.sig;
  end loop;
end $mig$;

delete from public.hr_client_rpc_baseline
 where proname in (
   'clan_board_claim', 'clan_board_progress', 'clan_board_roll', 'clan_contribute', 'clan_create',
   'clan_deposit', 'clan_feast_call', 'clan_feast_deposit', 'clan_hunt_declare', 'clan_invite',
   'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
   'clan_leave', 'clan_rested_grant', 'clan_seat_read', 'clan_tier_up', 'clan_vice_set',
   'clan_vote_cast', 'clan_vote_close', 'clan_vote_open', 'clan_vote_read', 'clan_work_complete',
   'clan_work_labour', 'clan_work_post', 'clan_work_supply', 'hr_buy_gem_unlock',
   'hr_buy_hero_slot', 'hr_claim_daily', 'hr_claim_quest', 'hr_clan_browser', 'hr_companion_equip',
   'hr_companion_grant', 'hr_credit_combat_xp', 'hr_leaderboard', 'hr_rally_pledge_state',
   'hr_tally_state', 'hr_worker_assign', 'hr_worker_hire', 'raid_claim', 'raid_strike',
   'world_event_absence_claim', 'world_event_claim', 'world_event_contribute', 'world_event_join',
   'world_event_pledge', 'world_event_pledge_settle');

-- ── §3 hr_rpc_gate, RESTATED WHOLE MINUS THE DEAD BUCKETS ──────────────────
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
  -- DEMOLITION M1 (2026-10-26-demolition-m1-drops.sql): every bucket whose
  -- callers are all dropped (clans, raids, the market, world events / muster,
  -- daily + quest claims and their tally, leaderboards, hired workers, the
  -- hero-slot and gem-unlock buys, the bounty board, the attended kill / combat
  -- XP credits, Vigour, the goal board) left this list with them. An unknown
  -- bucket fails closed. 'hr_claim_daily' STAYS: hr_login_claim spends it.
  case p_bucket
    when 'hr_display_name_available', 'hr_server_now'
      then v_limit := 120;
    when 'farm_plant', 'farm_harvest', 'farm_water',
         'bank_move',
         'client_state_put'
      then v_limit := 60;
    when 'hr_set_style'
      then v_limit := 30;
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'hr_claim_daily', 'hr_claim_milestone', 'hr_claim_rank',
         'hr_trait_buy'
      then v_limit := 12;
    when 'beta_invite_check'
      then v_limit := 20;
    when 'hr_heartbeat' then v_limit := 6;
    when 'hr_town_of' then v_limit := 30;
    when 'hr_set_presence_quiet' then v_limit := 4;
    when 'hr_world_finds_of' then v_limit := 6;
    when 'hr_recipe_learn' then v_limit := 12;
    when 'party' then v_limit := 12;
    when 'party_hunt_view' then v_limit := 20;
    when 'hr_claim_discord_gift' then v_limit := 6;
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
revoke execute on function public.hr_rpc_gate(text) from public, anon, authenticated, service_role;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ────────────────
do $$
declare
  v_funcs  text[] := array[
      'clan_board_claim', 'clan_board_claim__ungated', 'clan_board_progress',
      'clan_board_progress__ungated', 'clan_board_roll', 'clan_board_roll__ungated', 'clan_contribute',
      'clan_contribute__ungated', 'clan_create', 'clan_deposit', 'clan_deposit__ungated',
      'clan_feast_call', 'clan_feast_call__ungated', 'clan_feast_deposit',
      'clan_feast_deposit__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated', 'clan_invite',
      'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set', 'clan_kick',
      'clan_leave', 'clan_rested_grant', 'clan_rested_grant__ungated', 'clan_seat_read',
      'clan_seat_read__ungated', 'clan_tier_up', 'clan_tier_up__ungated', 'clan_upkeep_settle',
      'clan_vice_set', 'clan_vice_set__ungated', 'clan_vote_cast', 'clan_vote_cast__ungated',
      'clan_vote_close', 'clan_vote_close__ungated', 'clan_vote_open', 'clan_vote_open__ungated',
      'clan_vote_read', 'clan_vote_read__ungated', 'clan_work_complete', 'clan_work_complete__ungated',
      'clan_work_labour', 'clan_work_labour__ungated', 'clan_work_post', 'clan_work_post__ungated',
      'clan_work_supply', 'clan_work_supply__ungated', 'hr_bounty_count_mult',
      'hr_bounty_difficulty_unlocked', 'hr_bounty_first_contract', 'hr_bounty_first_contract_range',
      'hr_bounty_kill_cap', 'hr_bounty_kill_range', 'hr_bounty_kills', 'hr_bounty_reward',
      'hr_bounty_unlocked_tier', 'hr_buy_gem_unlock', 'hr_buy_gem_unlock__ungated', 'hr_buy_hero_slot',
      'hr_buy_hero_slot__ungated', 'hr_claim_daily', 'hr_claim_daily__ungated', 'hr_claim_quest',
      'hr_claim_quest__ungated', 'hr_clan_board_rows', 'hr_clan_browser', 'hr_clan_decay_cp',
      'hr_clan_may_admit', 'hr_clan_may_post', 'hr_clan_member_cap_guard', 'hr_clan_order_create',
      'hr_clan_vote_settle', 'hr_clan_vote_settle_one', 'hr_clan_vote_tally', 'hr_clan_week_start',
      'hr_combat_xp_cap', 'hr_combat_xp_credit_prune', 'hr_companion_equip', 'hr_companion_grant',
      'hr_credit_combat_xp', 'hr_credit_combat_xp__ungated', 'hr_daily_task_eligible',
      'hr_daily_task_set', 'hr_daily_task_set_caps', 'hr_daily_task_set_for', 'hr_gem_unlocks_of',
      'hr_goal_daily_seed', 'hr_goal_period_start', 'hr_goal_week_days', 'hr_iso_week_key',
      'hr_kill_credit_prune', 'hr_lb_boards', 'hr_lb_num', 'hr_lb_skills', 'hr_lb_unsourced',
      'hr_leaderboard', 'hr_leaderboard__ungated', 'hr_leaderboard_refresh', 'hr_market_buy',
      'hr_market_cancel', 'hr_market_expire', 'hr_market_list', 'hr_market_listing_immutable',
      'hr_market_offer_cap', 'hr_market_offer_immutable', 'hr_market_offer_stamp', 'hr_max_hunt_tier',
      'hr_muster_window', 'hr_quest_rewards_items_ok', 'hr_rally_absent_chest', 'hr_rally_chest',
      'hr_rally_chest_value', 'hr_rally_day', 'hr_rally_day_close', 'hr_rally_event_for_key',
      'hr_rally_event_id', 'hr_rally_pledge_char', 'hr_rally_pledge_state',
      'hr_rally_pledge_state__ungated', 'hr_rally_point_rules', 'hr_rally_points_of', 'hr_rally_pool',
      'hr_rally_refresh', 'hr_rally_slot', 'hr_rally_theme', 'hr_rally_xp_credit', 'hr_tally_state',
      'hr_unlock_buy', 'hr_utc_week_key', 'hr_week_start', 'hr_worker_assign', 'hr_worker_hire',
      'market_sales_prune', 'raid_claim', 'raid_claim__ungated', 'raid_strike', 'raid_strike__ungated',
      'sync_profile_clan', 'world_event_absence_claim', 'world_event_absence_claim__ungated',
      'world_event_claim', 'world_event_claim__ungated', 'world_event_contribute',
      'world_event_contribute__ungated', 'world_event_join', 'world_event_join__ungated',
      'world_event_pledge', 'world_event_pledge__ungated', 'world_event_pledge_settle',
      'world_event_pledge_settle__ungated'];
  v_tables text[] := array[
      'market_price_history', 'leaderboard_ranked', 'clan_order_ballots', 'clan_order_votes',
      'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_members', 'clan_raids',
      'clan_stores', 'clan_tavern', 'clan_withdrawals', 'clan_work_labour', 'clan_work_orders',
      'raid_claims', 'raid_contributions', 'clans', 'hr_castle_board_tasks', 'hr_castle_buildings',
      'hr_castle_items', 'hr_castle_tiers', 'hr_feast_foods', 'leaderboard_meta', 'market_buy_offers',
      'market_listings', 'market_sales', 'hr_market_config', 'world_event_joins',
      'world_event_pledges', 'world_event_totals', 'hr_rally_action_s', 'hr_companion_grants',
      'hr_quest_rewards', 'player_workers', 'hr_unlock_offers', 'hr_gem_unlocks', 'active_bounty',
      'hr_bounty_board_monsters', 'hr_bounty_monsters', 'hr_kill_credit_log',
      'hr_combat_xp_credit_log'];
  v_uid    uuid := '00000000-0000-4000-8000-0000000d1e02';
  v_bad    text;
  v_n      bigint;
  v_case   text;
  v_b      text;
  v_role   text;
  v_h      jsonb;
begin
  -- (a) EVERY LISTED FUNCTION AND RELATION IS GONE, WITH THE TWO COLUMNS.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (v_funcs);
  if v_bad is not null then raise exception 'GATE(a): survived: %', v_bad; end if;
  select string_agg(t, ', ') into v_bad from unnest(v_tables) t where to_regclass('public.' || t) is not null;
  if v_bad is not null then raise exception 'GATE(a): relations survived: %', v_bad; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and ((table_name = 'profiles' and column_name = 'clan_id')
                 or (table_name = 'player_state' and column_name = 'workers_accrued_to'))) then
    raise exception 'GATE(a): profiles.clan_id or player_state.workers_accrued_to survived'; end if;
  if exists (select 1 from cron.job where jobname in ('hr-market-expire', 'hr-market-sales-prune',
               'hr-kill-credit-prune', 'hr-combat-xp-credit-prune')) then
    raise exception 'GATE(a): a cron job for a dropped function survived'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline b where b.proname = any (v_funcs)) then
    raise exception 'GATE(a): a dropped RPC is still on the client baseline'; end if;
  -- What this file must LEAVE is still there.
  if to_regprocedure('public.hr_lb_combat_level(integer,integer,integer,integer,integer,integer,integer)') is null
     and not exists (select 1 from pg_proc where proname = 'hr_lb_combat_level' and pronamespace = 'public'::regnamespace) then
    raise exception 'GATE(a): hr_lb_combat_level is gone'; end if;
  if not exists (select 1 from pg_proc where proname = 'hr_bounty_combat_level' and pronamespace = 'public'::regnamespace)
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null or to_regclass('public.hr_hero_slots') is null
     or to_regclass('public.hr_unlocks') is null or to_regclass('public.party') is null
     or to_regprocedure('public.hr_login_claim(integer,uuid)') is null then
    raise exception 'GATE(a): an object this file must keep is gone'; end if;

  -- (b) NO SURVIVING BODY NAMES A DROPPED OBJECT IN CODE (the gate and the
  --     detector excepted, as in §0), and no client role can execute a
  --     function whose name belongs to a dropped family.
  select string_agg(distinct p.oid::regprocedure::text || ' -> ' || o.obj, '; ') into v_bad
    from pg_proc p, unnest(v_funcs || v_tables) o(obj)
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('hr_rpc_gate', 'hr_assert_grant_hygiene')
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g'),
                        'hr_rpc_gate\(\s*''[a-z0-9_]+''\s*\)', '', 'g') ~ ('\m' || o.obj || '\M');
  if v_bad is not null then raise exception 'GATE(b): %', v_bad; end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname ~ '^(clan_|hr_clan_|raid_|hr_market_|market_|hr_companion_|world_event_|hr_rally_|hr_leaderboard|hr_worker_|hr_buy_)'
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));
  if v_n > 0 then raise exception 'GATE(b): % retired-family function(s) are client-executable', v_n; end if;

  -- (c) THE GATE ADMITS EVERY BUCKET A SURVIVING BODY SPENDS, AND NO DEAD ONE.
  select substring(prosrc from 'case p_bucket(.*)end case') into v_case
    from pg_proc where oid = to_regprocedure('public.hr_rpc_gate(text)');
  for v_b in select distinct m[1]
               from pg_proc p,
                    regexp_matches(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), 'hr_rpc_gate\(\s*''([a-z0-9_]+)''', 'g') m
              where p.pronamespace = 'public'::regnamespace and p.proname <> 'hr_rpc_gate' loop
    if position('''' || v_b || '''' in v_case) = 0 then
      raise exception 'GATE(c): the gate no longer admits %, which a surviving body spends', v_b; end if;
  end loop;
  foreach v_b in array array['clan_join', 'raid_strike', 'world_event_join', 'worker_hire', 'hr_leaderboard',
      'buy_listing', 'hr_claim_quest', 'hr_tally_state', 'hr_buy_hero_slot', 'hr_buy_gem_unlock',
      'hr_credit_combat_xp', 'hr_credit_kills', 'hr_vigour_refill', 'hr_claim_goal', 'hr_goal_state',
      'hr_accept_bounty', 'hr_claim_bounty', 'hr_bounty_spend', 'hr_rally_pledge_state'] loop
    if position('''' || v_b || '''' in v_case) > 0 then raise exception 'GATE(c): dead bucket % is still admitted', v_b; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_rpc_gate(text)', 'execute') then
      raise exception 'GATE(c): % can execute hr_rpc_gate', v_role; end if;
  end loop;

  -- (d) EXECUTED: for an admitted probe the gate passes a live bucket and
  --     refuses a dead one (counters written here are rolled back).
  begin
    insert into auth.users (id) values (v_uid);
    if to_regclass('public.hr_access_allowlist') is not null then
      execute 'insert into public.hr_access_allowlist (user_id, note) values ($1, ''m1 drops self-check probe'')' using v_uid;
    end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if not public.hr_rpc_gate('hr_server_now') then raise exception 'GATE(d): a live bucket was refused'; end if;
    if not public.hr_rpc_gate('hunt') then raise exception 'GATE(d): the hunt bucket was refused'; end if;
    if public.hr_rpc_gate('clan_join') then raise exception 'GATE(d): a dead bucket was admitted'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    raise exception using errcode = 'HRM1D', message = 'demolition-m1-drops §5 complete — rolling back';
  exception when sqlstate 'HRM1D' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_uid) then raise exception 'GATE(z): §5 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN.
  v_h := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
    raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;

  raise notice 'demolition-m1-drops: EXECUTED - 152 functions and 42 relations gone with their baseline rows and '
               'cron jobs; no surviving body names them; the gate admits every live bucket and no dead one; '
               'grant hygiene green; net zero';
end $$;
