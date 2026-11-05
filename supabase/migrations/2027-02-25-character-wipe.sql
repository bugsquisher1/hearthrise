-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-25-character-wipe.sql — A DECLARED WIPE: EVERY HERO AND EVERYTHING A HERO OR ACCOUNT HAS EARNED GOES, ONCE.
--   ACCOUNTS, THE ALLOWLIST, THE FRIEND GRAPH, CATALOGUES AND OPERATOR ROWS STAY (lane/c-char-wipe, backend-architect, 2026-11-04).
--
-- STATUS: STAGED. ⚠ APPLY ONLY ON TYLER'S WORD, AS PART OF THE WHOLE PROCEDURE. It is in tests/schema-apply-order.json
-- `excluded`, never replayed. tools/apply-migration.mjs, one file per call, never inside begin/commit. IRREVERSIBLE except by the
-- daily backup taken before it. EDGE: no deploy. CLIENT: no change has to land first (below).
--
-- ── THE PROCEDURE, IN THIS ORDER ─────────────────────────────────────────────
--   0. closed_mode ON (it is), and a pre-wipe backup exists (dashboard: Database, Backups).
--   1. 2027-02-14-market-off.sql            list and buy answer market_closed.
--   2. 2027-02-20-market-wipe.sql           the market's three tables empty, the expiry sweep unscheduled.
--   3. THIS FILE                            refuses unless 0-2 hold.
--   4. 2027-02-20-market-wipe-resume.sql    the sweep scheduled again.
--   5. 2027-02-14-market-on.sql             the market opens; it refuses until step 4 ran.
--   Then, 30 s later, read: select count(*) from public.player_state;   (players may have started again: heroes they made are theirs)
--
-- ── WHAT GOES, WHAT STAYS ────────────────────────────────────────────────────
--   GOES (c_wipe, 99 tables): heroes and every row keyed on one; the account's gold, Storage, house and land; names; parties;
--     hunts and their instances, worlds and leases; the ledger and its rollup; chat lines, whispers and world notices (a line names a
--     hero); presence, town bodies and the play cap's claims; the rate counters, refusal aggregates and intent journal; the tick's
--     per-character rows; clans; the town snapshot (its own 25 s cron rebuilds it); bought hero slots (flag rows in player_progress);
--     the gold sinks' records (shows, gold given, titles held, the Town Works' totals and gifts: made of gold this file deletes, naming
--     heroes who no longer exist). The sink lanes' tables are on these lists from the first edit; a name whose table doesn't exist yet
--     is skipped (tests/char-wipe.mjs CW-SINKS), so the lanes can land in any order.
--   STAYS (c_keep): auth.*, profiles (reset to a fresh signup's shape), hr_access_allowlist (untouched: closed mode still decides who
--     plays), friend_links, friend_requests, chat_blocks (a player's social choices), bug_reports (the team's triage), beta_invites and
--     beta_signup_log (the signup record), hr_lb_hidden (who the boards leave out), hr_tick_config and hr_tick_shard_cursor (their
--     cursors nulled), hr_name_holds (owner cleared: a name a moderator pulled stays pulled; every other name is free again).
--   MUST ALREADY BE EMPTY (c_market): market_listings is the escrow, so its own file empties it first; this file refuses otherwise.
--   NAMES NO PLAYER (c_no_player): catalogues, config, baselines, operator logs. Counted before and after.
--   ALSO: every row of leaderboard_ranked (a refresh), private frames in realtime.messages (no page can read them back).
--
-- ── AN UNKNOWN TABLE STOPS THE WIPE ─────────────────────────────────────────
--   The lists were generated from the replayed catalog, and §0 re-reads the live one: every public base table must be on exactly one
--   list, and no table on c_no_player may hold a person column (a uuid not named as something else, or a foreign key to auth.users,
--   profiles or a wiped table). A table added since refuses the file by name. Add it to a list, re-run tests/char-wipe.mjs.
--
-- ── OPEN HUNTS ───────────────────────────────────────────────────────────────
--   Dropped, not settled: no window is paid and no hero comes home, because the bag, the hero and the purse go in the same statement.
--   TRUNCATE waits for a settle in flight (lock_timeout 10 s, then the file fails whole and can be run again). A settle whose engine
--   read before the commit lands after it on a missing instance: refused, no row (tests/char-wipe.mjs CW-STALE). The tick finds no
--   due session and posts nothing. A window the engine had computed for a hero that no longer exists has nothing to pay.
--
-- ── THE BROWSER ──────────────────────────────────────────────────────────────
--   NO CLIENT CHANGE MUST LAND FIRST. All residue is server-side (`player_state.client_state`: coach progress, seen deaths, summaries,
--   away stamps, HUD), so it goes with the row. A device keeps only its sign-in and the tab's list of open heroes; a hero the server no
--   longer holds doesn't load, and the characters screen is drawn (played: tests/char-wipe-world.mjs). A TAB LEFT OPEN through the wipe
--   on a build before this lane's stands still until it reloads, and until then can put a pending residue field into a hero made in
--   that slot elsewhere; the build with this lane's client half lets the hero go and draws the characters screen (session-core ACC-5).
--
-- ── THE ONE-SHOT FENCE ───────────────────────────────────────────────────────
--   hr_wipe_log row 'character-wipe-2026-11', written in the same transaction. A re-apply is a NO-OP that says so. The next declared
--   wipe (each beta is wiped) is a new file with a new key.
--
-- REVERSIBILITY: restore the pre-apply daily backup. Nothing else.
-- ════════════════════════════════════════════════════════════════════════

do $mig$
declare
  c_key  constant text := 'character-wipe-2026-11';
  c_wipe constant text[] := array[
    'account_bank', 'account_farm', 'account_farm_plots', 'account_gem_grants', 'account_play_net', 'account_storage_chests', 'account_wallet',
    'active_bounty', 'character_names', 'character_presence', 'chat_messages', 'chat_whispers',
    'clan_bans', 'clan_invites', 'clan_ledger', 'clan_members', 'clan_order_ballots', 'clan_order_votes', 'clan_stores', 'clan_tavern',
    'clan_withdrawals', 'clan_work_labour', 'clan_work_orders', 'clans',
    'display_names', 'game_events', 'game_saves', 'hearth_flames', 'hearthfind_log', 'hearthfind_ordinal', 'hero_play_net',
    'hero_tally', 'hero_tally_claims', 'hero_tally_given', 'hero_tally_tasks',
    'hr_character_sheets', 'hr_combat_xp_credit_log', 'hr_discord_gift_claims', 'hr_import_marker', 'hr_kill_credit_log',
    'hr_rate_counters', 'hr_rejections', 'hr_return_anchor',
    'hr_tick_enrolment', 'hr_tick_horizon_log', 'hr_tick_ownership', 'hr_tick_probe', 'hr_tick_shadow', 'hr_world_notices',
    'hunt_bag', 'hunt_bests', 'hunt_density', 'hunt_instances', 'hunt_parties', 'hunt_party_invites', 'hunt_party_members',
    'hunt_session_events', 'hunt_session_tally', 'hunt_sessions', 'hunt_tick_lease',
    'account_gold_given', 'player_titles', 'town_shows', 'town_works_gifts', 'town_works_totals',
    'party', 'party_hunt', 'party_hunt_roster_log', 'party_hunt_tally', 'party_invite', 'party_member', 'party_notices', 'party_seekers',
    'party_settle_boundary', 'party_tick_lease',
    'player_action_sets', 'player_blessings', 'player_cosmetics', 'player_equipment', 'player_hunt_active', 'player_hunt_presets',
    'player_intents', 'player_inventory', 'player_item_rules', 'player_ledger', 'player_ledger_rollup', 'player_outfits', 'player_progress',
    'player_skills', 'player_state', 'player_workers',
    'session_claims', 'social_presence', 'town_bodies', 'town_moves', 'town_positions', 'town_seen', 'town_snapshot', 'world_finds'];
  -- hr_account_deletions is lane/c-account-delete's, if it lands first: a waiting deletion belongs to the account, which stays.
  c_keep constant text[] := array[
    'beta_invites', 'beta_signup_log', 'bug_reports', 'chat_blocks', 'friend_links', 'friend_requests', 'profiles', 'hr_access_allowlist',
    'hr_lb_hidden', 'hr_name_holds', 'hr_tick_config', 'hr_tick_shard_cursor', 'hr_account_deletions'];
  c_market constant text[] := array['market_listings', 'market_sales', 'market_item_daily'];
  c_no_player constant text[] := array[
    'hr_activities', 'hr_bench_tax_rates', 'hr_blessing_rule', 'hr_blessing_tiers', 'hr_bounty_board_monsters', 'hr_bounty_monsters',
    'hr_castle_buildings', 'hr_castle_items', 'hr_castle_tiers', 'hr_catalogue_meta', 'hr_character_sheet_engine', 'hr_chat_config',
    'hr_client_rpc_baseline', 'hr_client_write_baseline', 'hr_companion_grants', 'hr_crop_plot_tier', 'hr_crops', 'hr_db_samples', 'hr_depot_config',
    'hr_dungeon_loot', 'hr_dungeons', 'hr_equip_slots', 'hr_farm_yield_perk', 'hr_feast_foods', 'hr_flags', 'hr_gem_unlocks',
    'hr_ground_tiers', 'hr_hearth_named', 'hr_hearth_rule', 'hr_hearthfind_items', 'hr_hearthfind_meta', 'hr_hearthfind_sources', 'hr_hero_rename_rule', 'hr_hero_slots',
    'hr_hunt_abilities', 'hr_hunt_action_ids', 'hr_hunt_basic_supplies', 'hr_hunt_condition_limits', 'hr_hunt_condition_metrics', 'hr_hunt_config',
    'hr_hunt_cover_items', 'hr_hunt_end_reasons', 'hr_hunt_ground_spawns', 'hr_hunt_grounds', 'hr_hunt_kill_bounds', 'hr_hunt_lanes', 'hr_hunt_limits',
    'hr_hunt_resumable_kinds', 'hr_hunt_role_rules', 'hr_hunt_roles', 'hr_hunt_roster', 'hr_hunt_set_options', 'hr_hunt_shields', 'hr_hunt_spawns',
    'hr_hunt_stances', 'hr_hunt_supplies', 'hr_hunt_target_modes', 'hr_hunt_travel', 'hr_hunt_vendor_value', 'hr_hunt_weapon_roles', 'hr_hunt_weapons',
    'hr_hunt_world_shape', 'hr_hunts', 'hr_item_buffs', 'hr_item_slots', 'hr_items', 'hr_ledger_config', 'hr_level_curve', 'hr_market_config',
    'hr_market_premium_items', 'hr_name_blocklist', 'hr_outfit_dyes', 'hr_outfits', 'hr_players_online_cache', 'hr_plot_tier', 'hr_premium_login_reward',
    'hr_qm_offers', 'hr_room_perks', 'hr_runes', 'hr_server_secrets', 'hr_settings', 'hr_shop_supply_offers', 'hr_skill_curve', 'hr_skills',
    'hr_stamina_refill_rule', 'hr_start_equipment', 'hr_start_inventory', 'hr_start_kit', 'hr_start_skill_xp', 'hr_state_sections', 'hr_storage_chests',
    'hr_tally_config', 'hr_tally_materials', 'hr_tally_pieces', 'hr_tally_tasks', 'hr_tick_cohort', 'hr_tick_cron_log',
    'hr_town_maps', 'hr_town_stands', 'hr_town_station_hosts', 'hr_town_stations', 'hr_traits', 'hr_unlock_offers', 'hr_unlocks', 'hr_wipe_log',
    'hr_world_notice_rules', 'hr_xp_table', 'hunt_world_shape_move', 'leaderboard_meta', 'maintenance_alerts', 'maintenance_log',
    'hr_account_deletion_log', 'hr_sink_rules', 'hr_titles', 'hr_town_works'];
  c_probe constant uuid := '000000c0-0000-4000-a000-0000c4a2e101';
  c_stranger constant uuid := '000000c0-0000-4000-a000-0000c4a2e102';
  v_present text[] := '{}';
  v_removed jsonb := '{}';
  v_kept    jsonb := '{}';
  v_after   jsonb := '{}';
  v_bad     text;
  v_n       bigint;
  v_users   bigint;
  v_allow   bigint;
  v_slots   jsonb;
  v         jsonb;
  v_hunt    text;
  v_item    text;
  v_ok      boolean;
  v_colors  jsonb;
  t         text;
begin
  -- THE FENCE FIRST: a re-apply answers before any precondition, so it stays a no-op with the market back on.
  if to_regclass('public.hr_wipe_log') is null then
    raise exception 'PRECONDITION: hr_wipe_log (2026-10-21-closed-rebuild-wipe.sql) is absent'; end if;
  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise notice 'character wipe already ran at % — no-op', (select wiped_at from public.hr_wipe_log where wipe_key = c_key);
    return;
  end if;

  -- ── §0 PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then
    raise exception 'PRECONDITION: closed_mode is not ON: wiping an open game lets players re-create state during the wipe'; end if;
  if (select enabled from public.hr_market_config) is distinct from false then
    raise exception 'PRECONDITION: the market is ON: apply 2027-02-14-market-off.sql first'; end if;
  foreach t in array c_market loop
    if to_regclass('public.' || t) is null then raise exception 'PRECONDITION: public.% is absent', t; end if;
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n <> 0 then raise exception 'PRECONDITION: public.% holds % rows: apply 2027-02-20-market-wipe.sql first (a listing is the only copy of its goods)', t, v_n; end if;
  end loop;
  if exists (select 1 from cron.job where jobname = 'hr-market-expire') then
    raise exception 'PRECONDITION: the expiry sweep is scheduled: apply 2027-02-20-market-wipe.sql first'; end if;
  if to_regprocedure('public.hr_create_hero(integer,text,jsonb,uuid)') is null or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or (select count(*) from public.hr_hero_slots where starter) <> 1 then
    raise exception 'PRECONDITION: hero creation or the starter slot catalogue is missing: after this file an account would have no way back in'; end if;

  -- AN UNKNOWN TABLE STOPS THE WIPE: every public base table is on exactly one list...
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
     and c.relname <> all (c_wipe) and c.relname <> all (c_keep) and c.relname <> all (c_market) and c.relname <> all (c_no_player);
  if v_bad is not null then
    raise exception 'wipe §0: table(s) on no list: % — decide each (goes, stays, or names no player), then apply', v_bad; end if;
  select string_agg(x, ', ') into v_bad from unnest(c_wipe) x
   where x = any (c_keep) or x = any (c_market) or x = any (c_no_player);
  if v_bad is not null then raise exception 'wipe §0: on two lists: %', v_bad; end if;
  -- ...and nothing on the no-player list names one: a uuid column not named as something else, or a key to an account or a wiped table.
  select string_agg(distinct c.relname, ', ') into v_bad
    from pg_class c
    left join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.atttypid in ('uuid'::regtype, 'uuid[]'::regtype)
         and a.attname <> all (array['id', 'session_id', 'instance_id', 'party_id', 'clan_id', 'hunt_id', 'listing_id', 'vote_id', 'order_id',
                                     'message_id', 'claim_id', 'intent_id', 'prev_session_id', 'xp_session', 'balance_session', 'stand_in'])
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname = any (c_no_player)
     and (a.attname is not null
          or exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'
                       and (k.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
                            or k.confrelid in (select w.oid from pg_class w where w.relnamespace = 'public'::regnamespace and w.relname = any (c_wipe)))));
  if v_bad is not null then raise exception 'wipe §0: on the no-player list but naming a player: %', v_bad; end if;

  -- ── §1 THE SNAPSHOT AND THE WIPE ───────────────────────────────────────────
  set local lock_timeout = '10s';
  foreach t in array c_wipe loop
    if to_regclass('public.' || t) is not null then
      v_present := v_present || t;
      execute format('select count(*) from public.%I', t) into v_n;
      v_removed := v_removed || jsonb_build_object(t, v_n);
    end if;
  end loop;
  foreach t in array c_keep || c_no_player loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      v_kept := v_kept || jsonb_build_object(t, v_n);
    end if;
  end loop;
  select count(*) into v_users from auth.users;
  select count(*) into v_allow from public.hr_access_allowlist;

  -- A settle takes a party, then an instance, then a hero, then the purse: taken here in that order it finishes first and the next one waits,
  -- rather than meeting this file halfway through the alphabet. A deadlock or a held lock fails the file whole, and it can be run again.
  lock table public.hunt_parties, public.hunt_instances, public.hunt_sessions, public.player_state, public.account_wallet, public.account_bank, public.player_ledger in access exclusive mode;
  -- One statement; RESTRICT, so a kept table that still referenced a wiped one refuses rather than cascades. The ledger's guard is lifted for it alone.
  alter table public.player_ledger disable trigger hr_ledger_no_truncate;
  execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(v_present) x) || ' continue identity restrict';
  alter table public.player_ledger enable trigger hr_ledger_no_truncate;

  -- A fresh signup's shape: no name, no clan.
  update public.profiles
     set display_name = null, clan_id = null, name_state = 'ok', must_rename = false, updated_at = now()
   where display_name is not null or clan_id is not null or name_state <> 'ok' or must_rename;
  -- The tick's cursors pointed at characters that no longer exist.
  update public.hr_tick_shard_cursor set cursor_user = null, cursor_slot = null, cursor_at = null
   where cursor_user is not null or cursor_slot is not null or cursor_at is not null;
  update public.hr_tick_config set cursor_user = null, cursor_slot = null, cursor_at = null
   where cursor_user is not null or cursor_slot is not null or cursor_at is not null;
  -- A name a moderator pulled stays pulled, tied to nobody.
  update public.hr_name_holds set user_id = null where user_id is not null;
  -- Frames and chat pushes queued for hidden heroes. No page can read one back; they would only age out in an hour.
  if to_regclass('realtime.messages') is not null then
    begin
      execute 'delete from realtime.messages where private is true';
    exception when insufficient_privilege then
      raise notice 'character wipe: realtime.messages kept (no privilege here); its frames age out in an hour';
    end;
  end if;
  -- The boards read the wiped tables through a materialized view.
  refresh materialized view public.leaderboard_ranked;
  update public.leaderboard_meta set refreshed_at = now() where id = 1;

  insert into public.hr_wipe_log (wipe_key, removed, kept) values (c_key, v_removed, v_kept || jsonb_build_object('auth.users', v_users));

  -- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ─────────────────────────────────
  -- k1 every wiped table is empty.
  foreach t in array v_present loop
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n <> 0 then raise exception 'wipe k1: public.% still holds % row(s)', t, v_n; end if;
  end loop;
  -- k2 nothing else lost a row.
  for t in select key from jsonb_each(v_kept) loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_after := v_after || jsonb_build_object(t, v_n);
  end loop;
  select string_agg(format('%s %s→%s', k.key, k.value, v_after -> k.key), ', ') into v_bad
    from jsonb_each(v_kept) k where (v_after ->> k.key)::bigint < (k.value #>> '{}')::bigint;
  if v_bad is not null then raise exception 'wipe k2: a kept table lost rows: %', v_bad; end if;
  -- k3 accounts and access survive, unmoved; every profile is a fresh signup's.
  if (select count(*) from auth.users) <> v_users then raise exception 'wipe k3: auth.users moved'; end if;
  if (select count(*) from public.hr_access_allowlist) <> v_allow then raise exception 'wipe k3: the allowlist moved'; end if;
  if exists (select 1 from public.profiles where display_name is not null or clan_id is not null or name_state <> 'ok' or must_rename) then
    raise exception 'wipe k3: a profile still carries an old name or clan'; end if;
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then raise exception 'wipe k3: closed_mode moved'; end if;
  -- k4 the ledger keeps both of its locks.
  if (select count(*) from pg_trigger where tgrelid = 'public.player_ledger'::regclass and not tgisinternal and tgenabled = 'O'
       and tgname in ('hr_ledger_immutable', 'hr_ledger_no_truncate')) <> 2 then
    raise exception 'wipe k4: a player_ledger immutability trigger is missing or disabled'; end if;
  -- k5 the boards and the cursors describe nobody; no hold has an owner.
  if exists (select 1 from public.leaderboard_ranked) then raise exception 'wipe k5: leaderboard_ranked still ranks someone'; end if;
  if exists (select 1 from public.hr_tick_shard_cursor where cursor_user is not null) or exists (select 1 from public.hr_tick_config where cursor_user is not null) then
    raise exception 'wipe k5: a tick cursor still names a character'; end if;
  if exists (select 1 from public.hr_name_holds where user_id is not null) then raise exception 'wipe k5: a name hold still names its owner'; end if;
  -- k6 EVERY ACCOUNT OWNS THE CATALOGUE'S STARTERS, NOTHING BOUGHT SURVIVES.
  select jsonb_agg(s order by s) into v_slots from (select 0 as s union select slot_id from public.hr_hero_slots where starter) q;
  select string_agg(u.id::text, ', ') into v_bad from auth.users u where public.hr_hero_slots_of(u.id) is distinct from v_slots;
  if v_bad is not null then raise exception 'wipe k6: account(s) own other than %: %', v_slots, v_bad; end if;

  -- k7 THE WAY BACK IN, AND THE DOOR STILL SHUT, ON A PROBE THAT ROLLS BACK: a new hero makes it to a hunt, and every job a tick runs
  --    answers on the empty world. Inside this transaction nobody else can see any of it.
  begin
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    perform public.hr_tick_enrol(200);
    perform public.hr_tick_cron_run();
    perform public.hr_town_refresh();
    perform public.hr_hunt_party_sweep(200);
    perform public.hr_party_reap_stale(200);
    insert into auth.users (id) values (c_probe), (c_stranger) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_probe, 'character-wipe §2 probe');
    perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.62"}', true);
    perform set_config('request.jwt.claim.sub', c_probe::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_probe, 'role', 'authenticated')::text, true);
    if public.hr_hero_slots_of(c_probe) is distinct from v_slots then raise exception 'wipe k7: a new account owns %', public.hr_hero_slots_of(c_probe); end if;
    select jsonb_build_object('head', min(d.idx), 'body', min(d.idx), 'legs', min(d.idx), 'feet', min(d.idx)) into v_colors from public.hr_outfit_dyes d;
    execute 'set local role authenticated';
    v := public.hr_create_hero(0, 'Wipeprobe', v_colors, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'wipe k7: hr_create_hero answered %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'wipe k7: hr_hunt_enter answered %', v; end if;
    execute 'reset role';
    if public.hr_level_of(c_probe, 0) <> 1 then raise exception 'wipe k7: a new hero is not Level 1'; end if;
    perform public.hr_tick_enrol(200);
    perform public.hr_tick_cron_run();
    -- The closed notice's door: an account on no list is refused hr_closed.
    perform set_config('request.jwt.claim.sub', c_stranger::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_stranger, 'role', 'authenticated')::text, true);
    v_ok := false;
    begin
      perform public.hr_access_check();
    exception when sqlstate 'PGRST' then
      v_ok := position('hr_closed' in sqlerrm) > 0;
    end;
    if not v_ok then raise exception 'wipe k7: an account on no allowlist was not refused hr_closed'; end if;
    raise exception using errcode = 'HR877', message = 'character-wipe k7 complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  -- k8 the probe left nothing, and the fence stands.
  if exists (select 1 from public.player_state) or exists (select 1 from public.hunt_sessions) or exists (select 1 from auth.users where id in (c_probe, c_stranger)) then
    raise exception 'wipe k8: the probe leaked a row'; end if;
  if not exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then raise exception 'wipe k8: the one-shot fence was not written'; end if;
  raise notice 'character wipe: % tables emptied, % rows removed; apply 2027-02-20-market-wipe-resume.sql next',
    cardinality(v_present), (select sum(value::bigint) from jsonb_each_text(v_removed));
end $mig$;
