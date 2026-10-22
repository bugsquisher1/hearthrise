-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE THIRD OLD-CLIENT CUT: THE RAID STRIKE, THE WORLD EVENTS
-- AND THE CLAN BOARD / HUNT / TIER / WORK-COMPLETE ACTIONS (lane
-- c-world-actions-cut, systems-engineer, 2026-10-22). STAGED. Game CLOSED:
-- applies on its passing §4 (CLAUDE.md §2), one file via
-- tools/apply-migration.mjs, never inside begin/commit, never 00:00–00:10 UTC.
-- It SHRINKS the surface Security reviews at the reopen gate (eleven client
-- RPCs leave, several of which trusted client-claimed values: raid_strike took
-- the boss's max HP and the damage from the caller, world_event_absence_claim
-- paid gold, gems and XP).
--
-- THE RULING (Tyler, 2026-10-22, verbatim): "Cut them: raid_strike,
-- world_event_*, clan_board_*, clan_hunt_declare, clan_tier_up,
-- clan_work_complete. Redesign live world events later." Leftovers of the old
-- client: grep of src/**, supabase/functions/**, index.html and play.html at
-- this file names none of them, and no pg_cron job, trigger, policy, column
-- default or view calls them (measured on the replayed chain).
--
-- §1 THE CLIENT DOORS (authenticated, each with its __ungated body):
--    raid_strike, clan_hunt_declare, clan_tier_up, clan_work_complete,
--    clan_board_roll, clan_board_progress, world_event_join,
--    world_event_contribute, world_event_pledge, world_event_pledge_settle,
--    world_event_absence_claim, and hr_rally_pledge_state — the world events'
--    own read (the rally pledge status, no client caller), which is world_event_*
--    in all but name: it reads only the two pledge tables cut below.
-- §2 THE HELPERS LEFT WITH NO CALLER (fixed point over every kept body,
--    comments excluded): the raid/clan-hunt maths hr_max_hunt_tier,
--    hr_hunt_pool, hr_hunt_clamp, hr_utc_week_key (only the board, the strike
--    and the declare read it) and hr_week_start (no caller since the raid
--    claim left); the board reader hr_clan_board_rows; and the whole rally
--    engine behind the world events: hr_rally_refresh, _points_of,
--    _point_rules, _pledge_char, _xp_credit, _absent_chest, _chest,
--    _chest_value, _day, _day_close, _slot, _event_for_key, _event_id, _pool,
--    _theme.
-- §3 THE TABLES nothing that stays reads or writes (their policies, grants and
--    constraints go with them): raid_contributions, clan_raids, clan_board,
--    world_event_joins, world_event_pledges, world_event_totals, and the
--    server-only catalogues hr_castle_board_tasks (9 rows), hr_hunt_bosses (6),
--    hr_hunt_tiers (5), hr_hunt_boss_reward (6; unread since 12-03 cut
--    raid_claim) and hr_rally_action_s (409). No src/data file or generator
--    authors any of them (they were seeded by their 2026-08/10 files).
-- §4 THE CLIENT SURFACE: the twelve hr_client_rpc_baseline rows leave.
--
-- KEPT, AND WHY (clan membership and clan chat are not ruled on):
--   clans, clan_members, clan_ledger (history + every kept clan RPC's journal),
--   clan_stores, clan_tavern, clan_withdrawals, clan_bans, clan_invites,
--   clan_order_ballots / clan_order_votes, hr_castle_tiers (member caps read it),
--   hr_castle_buildings (votes and work orders read it), and every clan_* RPC
--   not named above: create/join/leave/kick/invite/seat_read/deposit/contribute/
--   feast_*/vote_*/vice_set/rested_grant/upkeep_settle and clan_work_post/
--   _supply/_labour with clan_work_orders/_labour. NOTE: without
--   clan_work_complete a work order can be posted, supplied and laboured but
--   never finishes, and without clan_tier_up clans.castle_tier stays where it
--   is: both are the ruling's direct consequence, named for the clan redesign.
--   hr_bounty_monsters stays (a monster catalogue; its last SQL reader was
--   hr_rally_points_of, four tests still read it): its owner decides.
--   hr_rpc_gate is NOT restated: its case labels for the cut buckets are inert
--   strings (the 12-03 cut left raid_claim's the same way); restating that
--   shared chained body here would collide with lane c-hunt-screens-server.
--   Ledger rows (player_ledger kind 'rally', clan_ledger 'board_progress' /
--   'tier') are history and stay; no kind constraint is narrowed.
-- REVERSIBILITY: re-apply the files that created each object
-- (tests/live-hash-drift.baseline.json `touched_by`); every dropped table held
-- either catalogue rows those files seed or nothing (the 2026-10 wipes).
-- ORDER: after 2026-12-04-hero-rename.sql (no object in common) and
-- 2026-12-03-daily-claims-cut.sql (§0 requires it). EDGE: unchanged — the
-- hr-accrue engine and src/core name none of these objects.
-- COST: nothing per call; eleven fewer tables to back up and restore.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.raid_claims') is not null
     or to_regprocedure('public.raid_claim__ungated(text,uuid,text,integer)') is not null then
    raise exception 'PRECONDITION: apply 2026-12-03-daily-claims-cut.sql first'; end if;
end $mig$;

-- ── §1 THE CLIENT DOORS ────────────────────────────────────────────────────
drop function if exists public.raid_strike(uuid, text, text, bigint, bigint);
drop function if exists public.raid_strike__ungated(uuid, text, text, bigint, bigint);
drop function if exists public.clan_hunt_declare(uuid, text, integer, text);
drop function if exists public.clan_hunt_declare__ungated(uuid, text, integer, text);
drop function if exists public.clan_tier_up(uuid, integer);
drop function if exists public.clan_tier_up__ungated(uuid, integer);
drop function if exists public.clan_work_complete(uuid, uuid);
drop function if exists public.clan_work_complete__ungated(uuid, uuid);
drop function if exists public.clan_board_roll(uuid);
drop function if exists public.clan_board_roll__ungated(uuid);
drop function if exists public.clan_board_progress(uuid, text, integer);
drop function if exists public.clan_board_progress__ungated(uuid, text, integer);
drop function if exists public.world_event_join(text);
drop function if exists public.world_event_join__ungated(text);
drop function if exists public.world_event_contribute(text);
drop function if exists public.world_event_contribute__ungated(text);
drop function if exists public.world_event_pledge(text);
drop function if exists public.world_event_pledge__ungated(text);
drop function if exists public.world_event_pledge_settle(text);
drop function if exists public.world_event_pledge_settle__ungated(text);
drop function if exists public.world_event_absence_claim(text);
drop function if exists public.world_event_absence_claim__ungated(text);
drop function if exists public.hr_rally_pledge_state();
drop function if exists public.hr_rally_pledge_state__ungated();

-- ── §2 THE HELPERS LEFT WITH NO CALLER ─────────────────────────────────────
drop function if exists public.hr_max_hunt_tier(uuid);
drop function if exists public.hr_hunt_pool(integer, integer);
drop function if exists public.hr_hunt_clamp(bigint);
drop function if exists public.hr_utc_week_key(timestamp with time zone);
drop function if exists public.hr_week_start(text);
drop function if exists public.hr_clan_board_rows(uuid, text, text);
drop function if exists public.hr_rally_refresh(uuid, text);
drop function if exists public.hr_rally_points_of(uuid, integer, text, timestamp with time zone, timestamp with time zone);
drop function if exists public.hr_rally_point_rules(text);
drop function if exists public.hr_rally_pledge_char(uuid);
drop function if exists public.hr_rally_xp_credit(text, jsonb);
drop function if exists public.hr_rally_absent_chest(text);
drop function if exists public.hr_rally_chest(text, bigint, integer, integer);
drop function if exists public.hr_rally_chest_value(jsonb);
drop function if exists public.hr_rally_day_close(text);
drop function if exists public.hr_rally_day(text);
drop function if exists public.hr_rally_slot(text, integer);
drop function if exists public.hr_rally_event_for_key(text);
drop function if exists public.hr_rally_event_id(text, integer);
drop function if exists public.hr_rally_pool();
drop function if exists public.hr_rally_theme(text);

-- ── §3 THE TABLES ──────────────────────────────────────────────────────────
drop table if exists public.raid_contributions;
drop table if exists public.clan_raids;
drop table if exists public.clan_board;
drop table if exists public.hr_castle_board_tasks;
drop table if exists public.hr_hunt_bosses;
drop table if exists public.hr_hunt_tiers;
drop table if exists public.hr_hunt_boss_reward;
drop table if exists public.world_event_joins;
drop table if exists public.world_event_pledges;
drop table if exists public.world_event_totals;
drop table if exists public.hr_rally_action_s;

-- ── §4 THE CLIENT SURFACE ──────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline
 where proname in ('raid_strike', 'clan_hunt_declare', 'clan_tier_up', 'clan_work_complete',
                   'clan_board_roll', 'clan_board_progress', 'world_event_join', 'world_event_contribute',
                   'world_event_pledge', 'world_event_pledge_settle', 'world_event_absence_claim',
                   'hr_rally_pledge_state');

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED ─────────────────────────────────
do $mig$
declare
  c_fns constant text[] := array[
    'raid_strike', 'raid_strike__ungated', 'clan_hunt_declare', 'clan_hunt_declare__ungated',
    'clan_tier_up', 'clan_tier_up__ungated', 'clan_work_complete', 'clan_work_complete__ungated',
    'clan_board_roll', 'clan_board_roll__ungated', 'clan_board_progress', 'clan_board_progress__ungated',
    'world_event_join', 'world_event_join__ungated', 'world_event_contribute', 'world_event_contribute__ungated',
    'world_event_pledge', 'world_event_pledge__ungated', 'world_event_pledge_settle',
    'world_event_pledge_settle__ungated', 'world_event_absence_claim', 'world_event_absence_claim__ungated',
    'hr_rally_pledge_state', 'hr_rally_pledge_state__ungated',
    'hr_max_hunt_tier', 'hr_hunt_pool', 'hr_hunt_clamp', 'hr_utc_week_key', 'hr_week_start', 'hr_clan_board_rows',
    'hr_rally_refresh', 'hr_rally_points_of', 'hr_rally_point_rules', 'hr_rally_pledge_char', 'hr_rally_xp_credit',
    'hr_rally_absent_chest', 'hr_rally_chest', 'hr_rally_chest_value', 'hr_rally_day_close', 'hr_rally_day',
    'hr_rally_slot', 'hr_rally_event_for_key', 'hr_rally_event_id', 'hr_rally_pool', 'hr_rally_theme'];
  c_tables constant text[] := array[
    'raid_contributions', 'clan_raids', 'clan_board', 'hr_castle_board_tasks', 'hr_hunt_bosses', 'hr_hunt_tiers',
    'hr_hunt_boss_reward', 'world_event_joins', 'world_event_pledges', 'world_event_totals', 'hr_rally_action_s'];
  v      jsonb;
  v_n    int;
  v_set  text;
  v_name text;
begin
  -- (a) EVERY DROPPED FUNCTION IS GONE, under ANY signature, and every dropped table.
  select string_agg(p.oid::regprocedure::text, ', ' order by 1) into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (c_fns);
  if v_set is not null then raise exception 'world-actions-cut §5(a): still defined: %', v_set; end if;
  select string_agg(t, ', ') into v_set from unnest(c_tables) t where to_regclass('public.' || t) is not null;
  if v_set is not null then raise exception 'world-actions-cut §5(a): table(s) remain: %', v_set; end if;

  -- (b) NO GRANT AND NO CLIENT-BASELINE ROW NAMES ONE; no baseline row names a missing function.
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = any (c_fns);
  if v_n <> 0 then raise exception 'world-actions-cut §5(b): % routine grant(s) still name a cut function', v_n; end if;
  select string_agg(b.proname, ', ') into v_set from public.hr_client_rpc_baseline b
   where b.proname = any (c_fns)
      or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = b.proname);
  if v_set is not null then raise exception 'world-actions-cut §5(b): baseline row(s) name a missing or cut function: %', v_set; end if;

  -- (c) NOTHING THAT STAYS CALLS A CUT FUNCTION OR READS A CUT TABLE: every kept public body
  --     (comments stripped; a quoted rate-bucket label in hr_rpc_gate is not a call), every
  --     policy expression, column default, view and pg_cron command.
  foreach v_name in array c_fns loop
    select string_agg(p.proname, ',') into v_set
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
           ~ ('\m' || v_name || '\s*\(');
    if v_set is not null then raise exception 'world-actions-cut §5(c): % still calls the cut %', v_set, v_name; end if;
  end loop;
  foreach v_name in array c_tables loop
    select string_agg(p.proname, ',') into v_set
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
           ~ ('\m' || v_name || '\M');
    if v_set is not null then raise exception 'world-actions-cut §5(c): % still names the cut table %', v_set, v_name; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ ('\m(' || array_to_string(c_fns || c_tables, '|') || ')\M'))
     or exists (select 1 from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and pg_get_expr(d.adbin, d.adrelid) ~ ('\m(' || array_to_string(c_fns, '|') || ')\M'))
     or exists (select 1 from pg_views where schemaname = 'public' and definition ~ ('\m(' || array_to_string(c_fns || c_tables, '|') || ')\M'))
     or exists (select 1 from pg_matviews where schemaname = 'public' and definition ~ ('\m(' || array_to_string(c_fns || c_tables, '|') || ')\M')) then
    raise exception 'world-actions-cut §5(c): a policy, default or view still names a cut object'; end if;
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job where command ~ ('\m(' || array_to_string($1, '|') || ')\M')$q$
      into v_n using c_fns || c_tables;
    if v_n <> 0 then raise exception 'world-actions-cut §5(c): % pg_cron job(s) name a cut object', v_n; end if;
  end if;

  -- (d) THE KEPT DOORS ARE STILL THERE (a cut that took clan membership or clan chat is worse than none).
  select string_agg(k, ', ') into v_set
    from unnest(array['clan_create', 'clan_join', 'clan_leave', 'clan_kick', 'clan_invite', 'clan_seat_read',
                      'clan_deposit', 'clan_contribute', 'clan_feast_call', 'clan_feast_deposit', 'clan_vote_open',
                      'clan_vote_cast', 'clan_vote_close', 'clan_vote_read', 'clan_vice_set', 'clan_rested_grant',
                      'clan_upkeep_settle', 'clan_work_post', 'clan_work_supply', 'clan_work_labour',
                      'hr_chat_send', 'hr_rpc_gate', 'hr_assert_grant_hygiene']) k
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = k);
  if v_set is not null then raise exception 'world-actions-cut §5(d): kept function(s) missing: %', v_set; end if;
  select string_agg(t, ', ') into v_set
    from unnest(array['clans', 'clan_members', 'clan_ledger', 'clan_stores', 'clan_work_orders', 'clan_work_labour',
                      'hr_castle_tiers', 'hr_castle_buildings', 'chat_messages', 'hr_bounty_monsters']) t
   where to_regclass('public.' || t) is null;
  if v_set is not null then raise exception 'world-actions-cut §5(d): kept table(s) missing: %', v_set; end if;

  -- (e) GRANT HYGIENE IS CLEAN on everything this cut can move.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'baseline_rows_no_longer_live', '[]'::jsonb)) <> 0 then
    raise exception 'world-actions-cut §5(e): grant hygiene is red: %', v; end if;

  raise notice 'world-actions-cut: raid_strike, the world events, the clan board / hunt / tier / work-complete '
               'actions and their helpers and tables cut; clan membership, clan chat and the kept clan doors stay';
end $mig$;
