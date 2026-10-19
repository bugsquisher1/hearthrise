-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-27-core-wipe.sql — THE CORE REBUILD'S CLEAN SLATE: EVERY CHARACTER,
--   EVERYTHING A CHARACTER OWNS AND EVERY PIECE OF SHARED WORLD STATE BUILT ON
--   THE OLD MODEL IS REMOVED, ONCE. ACCOUNTS, THE ALLOWLIST, CATALOGUES, CONFIG
--   AND THE TWO STARTING HERO SLOTS PER ACCOUNT STAY.
--
-- STATUS: STAGED (lane/c-core-rebuild). Tyler 2026-10-19: "Rebuild the core ...
-- wipe characters"; and (Q10, Coordinator) everything player-owned goes,
-- cosmetics included: a closed alpha with nobody to protect. Game CLOSED: applies
-- on its passing §2 self-check; the Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00-00:10 UTC). ⚠ IRREVERSIBLE
-- except by restoring the daily backup taken BEFORE the apply.
--
-- ORDER: LAST of the core-rebuild files, and after 2026-10-26-hero-slots-start-two.sql
-- (lane/a-bury-bones): §0 refuses unless the starter-slot catalogue is installed,
-- because after the wipe a slot is owned only through that catalogue (an existing
-- character is no longer there to grandfather it), and every account must come
-- out of this file owning TWO slots, never one.
--
-- ── THE RULE (2026-10-21-closed-rebuild-wipe.sql's, unchanged) ──────────────
--   GOES — every row that describes a character's or the world's game state, or
--   bookkeeping derived from it (the list below; absent tables are skipped).
--   STAYS — auth.* , profiles ROWS reset to a fresh signup's shape (no name, no
--   clan), hr_access_allowlist (the closed allowlist, untouched), the signup
--   structure (beta_invites, beta_signup_log), chat_blocks and the friend graph
--   (a player's social choices, not progress), bug_reports, every catalogue, every
--   operator row, the RPC / grant baselines, the earlier wipes' own journal rows.
-- ── THE LEDGER is truncated for the same reason as 2026-10-21's: every balance it
--   explains goes to zero in the same transaction; its structure and both
--   immutability triggers stay (k5 proves the TRUNCATE guard is enabled again).
-- ── THE ONE-SHOT FENCE: hr_wipe_log row 'core-rebuild-2026-10-19'; a re-apply is
--   a no-op that says so.
-- ── AN UNKNOWN PLAYER TABLE STOPS THE WIPE (§2b), as before.
--
-- REVERSIBILITY: restore the pre-apply daily backup. Nothing else.
-- ⚠ AFTER APPLYING: restore-census --live re-measure; sign in as the QA account:
--   both hero slots are offered and a fresh Level-1 character is created on load.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — CLOSED, THE CORE MODEL IN, THE STARTER SLOTS IN ──────
do $mig$
begin
  if to_regclass('public.hr_wipe_log') is null or to_regprocedure('public.hr_access_check()') is null then
    raise exception 'PRECONDITION: 2026-10-21-closed-mode.sql / 2026-10-21-closed-rebuild-wipe.sql are absent'; end if;
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then
    raise exception 'PRECONDITION: closed_mode is not ON — wiping an OPEN game lets players re-create state during the wipe'; end if;
  if to_regprocedure('public.hr_vitals_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-27-core-bodies.sql first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_hero_slots' and column_name = 'starter')
     or (select count(*) from public.hr_hero_slots where starter) <> 1 then
    raise exception 'PRECONDITION: the starter hero slot (2026-10-26-hero-slots-start-two.sql) is not installed: '
                    'after this wipe an account would own one slot, not two'; end if;
end $mig$;

-- ── §1 THE WIPE AND ITS SELF-CHECK (CLAUDE.md §4) — ONE BLOCK, ONE SNAPSHOT ─
do $mig$
declare
  c_key  constant text := 'core-rebuild-2026-10-19';
  c_wipe constant text[] := array[
    'account_gem_grants', 'account_wallet', 'active_bounty',
    'character_names', 'chat_messages', 'chat_whispers',
    'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_members',
    'clan_order_ballots', 'clan_order_votes', 'clan_raids', 'clan_stores', 'clan_tavern',
    'clan_withdrawals', 'clan_work_labour', 'clan_work_orders', 'clans',
    'display_names', 'game_events', 'game_saves',
    'hearthfind_log', 'hearthfind_ordinal',
    'hr_character_sheets', 'hr_combat_xp_credit_log', 'hr_discord_gift_claims', 'hr_import_marker',
    'hr_kill_credit_log', 'hr_name_holds', 'hr_rate_counters', 'hr_rejections',
    'hr_return_anchor',
    'hr_tick_enrolment', 'hr_tick_horizon_log', 'hr_tick_ownership', 'hr_tick_probe',
    'hr_tick_shadow',
    'hunt_bag', 'hunt_instances', 'hunt_parties', 'hunt_party_invites', 'hunt_party_members',
    'hunt_session_events', 'hunt_session_tally', 'hunt_sessions', 'hunt_tick_lease',
    'market_buy_offers', 'market_listings', 'market_sales',
    'party', 'party_hunt', 'party_hunt_roster_log', 'party_hunt_tally', 'party_invite',
    'party_member', 'party_settle_boundary', 'party_tick_lease',
    'player_action_sets', 'player_bank', 'player_blessings', 'player_cosmetics', 'player_equipment',
    'player_farm', 'player_hunt_active', 'player_hunt_presets', 'player_intents', 'player_inventory',
    'player_item_rules', 'player_ledger', 'player_ledger_rollup', 'player_outfits', 'player_progress',
    'player_skills', 'player_state', 'player_workers',
    'raid_claims', 'raid_contributions',
    'session_claims', 'social_presence', 'town_positions', 'town_snapshot',
    'world_event_joins', 'world_event_pledges', 'world_event_totals', 'world_finds'];
  c_keep constant text[] := array[
    'beta_invites', 'beta_signup_log', 'bug_reports', 'chat_blocks', 'friend_links', 'friend_requests',
    'profiles', 'hr_access_allowlist'];
  c_catalogue constant text[] := array[
    'hr_items', 'hr_skills', 'hr_xp_table', 'hr_skill_curve', 'hr_activities', 'hr_crops', 'hr_unlocks',
    'hr_client_rpc_baseline', 'hr_start_kit', 'hr_start_inventory', 'hr_hero_slots', 'hr_hunt_limits'];
  v_present text[] := '{}';
  v_removed jsonb := '{}';
  v_kept    jsonb := '{}';
  v_after   jsonb := '{}';
  v_bad     text;
  v_n       bigint;
  v_users   bigint;
  v_allow   bigint;
  t         text;
begin
  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise notice 'core-rebuild wipe already ran at % — no-op',
      (select wiped_at from public.hr_wipe_log where wipe_key = c_key);
    return;
  end if;

  -- (a) the two lists are disjoint
  select string_agg(x, ', ') into v_bad from unnest(c_wipe) x where x = any (c_keep);
  if v_bad is not null then raise exception 'wipe §1a: % is on both lists', v_bad; end if;

  -- (b) AN UNKNOWN PLAYER TABLE STOPS THE WIPE
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
     and c.relname <> all (c_wipe) and c.relname <> all (c_keep)
     and (exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                     and a.attname in ('user_id', 'from_id', 'to_id', 'seller_user_id', 'buyer_user_id', 'leader_user',
                                       'blocker_id', 'blocked_id', 'owner_id', 'created_by', 'subject_id',
                                       'from_user', 'to_user', 'user_lo', 'user_hi'))
          or exists (select 1 from pg_constraint k
                      where k.conrelid = c.oid and k.contype = 'f'
                        and (k.confrelid = 'auth.users'::regclass
                             or k.confrelid in (select w.oid from pg_class w
                                                 where w.relnamespace = 'public'::regnamespace
                                                   and w.relname = any (c_wipe)))));
  if v_bad is not null then
    raise exception 'wipe §1b: unclassified table(s) naming a player: % — add each to the WIPE or KEEP list '
                    'with a reason, re-review, then apply', v_bad;
  end if;

  -- (c) the snapshot
  foreach t in array c_wipe loop
    if to_regclass('public.' || t) is not null then
      v_present := v_present || t;
      execute format('select count(*) from public.%I', t) into v_n;
      v_removed := v_removed || jsonb_build_object(t, v_n);
    end if;
  end loop;
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
              and c.relname <> all (v_present) and c.relname <> 'hr_wipe_log'
            order by c.relname loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_kept := v_kept || jsonb_build_object(t, v_n);
  end loop;
  select count(*) into v_users from auth.users;
  select count(*) into v_allow from public.hr_access_allowlist;

  -- (d) THE WIPE. One statement; the ledger's TRUNCATE guard is lifted for it alone.
  perform set_config('lock_timeout', '10s', true);
  alter table public.player_ledger disable trigger hr_ledger_no_truncate;
  execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(v_present) x)
          || ' continue identity restrict';
  alter table public.player_ledger enable trigger hr_ledger_no_truncate;

  -- (e) profiles go back to the shape handle_new_user creates: no name, no clan.
  update public.profiles
     set display_name = null, clan_id = null, name_state = 'ok', must_rename = false, updated_at = now()
   where display_name is not null or clan_id is not null or name_state <> 'ok' or must_rename;

  -- (f) the tick cursors pointed at a character that no longer exists.
  update public.hr_tick_shard_cursor set cursor_user = null, cursor_slot = null, cursor_at = null
   where cursor_user is not null or cursor_slot is not null or cursor_at is not null;
  update public.hr_tick_config set cursor_user = null, cursor_slot = null, cursor_at = null
   where cursor_user is not null or cursor_slot is not null or cursor_at is not null;

  -- (g) the leaderboards read the wiped tables through a materialized view.
  if to_regclass('public.leaderboard_ranked') is not null then
    refresh materialized view public.leaderboard_ranked;
  end if;

  insert into public.hr_wipe_log (wipe_key, removed, kept)
  values (c_key, v_removed, v_kept || jsonb_build_object('auth.users', v_users));

  -- ── SELF-CHECK, EXECUTED ──────────────────────────────────────────────────
  -- k1 zero player rows: every wiped table is empty.
  foreach t in array v_present loop
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n <> 0 then raise exception 'wipe k1: public.% still holds % row(s)', t, v_n; end if;
  end loop;
  -- k2 nothing else lost a row (at least the snapshot: crons append to operator logs meanwhile).
  for t in select key from jsonb_each(v_kept) loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_after := v_after || jsonb_build_object(t, v_n);
  end loop;
  select string_agg(format('%s %s→%s', k.key, k.value, v_after -> k.key), ', ') into v_bad
    from jsonb_each(v_kept) k where (v_after ->> k.key)::bigint < (k.value #>> '{}')::bigint;
  if v_bad is not null then raise exception 'wipe k2: a kept table lost rows: %', v_bad; end if;
  -- k3 accounts and access survive; the closed allowlist is untouched; closed mode did not move.
  if (select count(*) from auth.users) < v_users then raise exception 'wipe k3: auth.users lost rows'; end if;
  if (select count(*) from public.hr_access_allowlist) <> v_allow then raise exception 'wipe k3: the allowlist changed'; end if;
  if exists (select 1 from public.profiles
              where display_name is not null or clan_id is not null or name_state <> 'ok' or must_rename) then
    raise exception 'wipe k3: a profile still carries an old name or clan'; end if;
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then
    raise exception 'wipe k3: closed_mode moved'; end if;
  -- k4 catalogues intact and non-empty.
  foreach t in array c_catalogue loop
    if to_regclass('public.' || t) is null then raise exception 'wipe k4: catalogue % is missing', t; end if;
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n = 0 then raise exception 'wipe k4: catalogue % is empty', t; end if;
  end loop;
  -- k5 the ledger's structure survives: both immutability triggers present and ENABLED.
  if (select count(*) from pg_trigger
       where tgrelid = 'public.player_ledger'::regclass and not tgisinternal and tgenabled = 'O'
         and tgname in ('hr_ledger_immutable', 'hr_ledger_no_truncate')) <> 2 then
    raise exception 'wipe k5: a player_ledger immutability trigger is missing or disabled'; end if;
  -- k6 the leaderboards and the tick cursors describe nobody.
  if to_regclass('public.leaderboard_ranked') is not null and exists (select 1 from public.leaderboard_ranked) then
    raise exception 'wipe k6: leaderboard_ranked still ranks someone'; end if;
  if exists (select 1 from public.hr_tick_shard_cursor where cursor_user is not null)
     or exists (select 1 from public.hr_tick_config where cursor_user is not null) then
    raise exception 'wipe k6: a tick cursor still names a character'; end if;
  -- k7 THE SIGNUP INVARIANT: every account owns exactly the two starting slots (0 and the starter),
  --    never one — ownership no longer leans on a character that the wipe removed.
  select string_agg(u.id::text, ', ') into v_bad
    from auth.users u where public.hr_hero_slots_of(u.id) is distinct from '[0,1]'::jsonb;
  if v_bad is not null then raise exception 'wipe k7: account(s) do not own slots [0,1] after the wipe: %', v_bad; end if;
  -- k8 the fence is written.
  if not exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise exception 'wipe k8: the one-shot fence row was not written'; end if;
  raise notice 'core-rebuild wipe: % table(s) emptied, % row(s) removed; % kept table(s) unchanged',
    cardinality(v_present), (select sum(value::bigint) from jsonb_each_text(v_removed)),
    (select count(*) from jsonb_object_keys(v_kept));
end $mig$;

-- ── §2 THE FENCE IS ALWAYS THERE AFTER THIS FILE; A NEW ACCOUNT STARTS WITH TWO SLOTS ──
do $mig$
declare v_u constant uuid := '000000c0-0000-0000-0000-00000c0e0002'; v jsonb;
begin
  if not exists (select 1 from public.hr_wipe_log where wipe_key = 'core-rebuild-2026-10-19') then
    raise exception 'wipe §2: hr_wipe_log has no core-rebuild-2026-10-19 row'; end if;
  -- A signup after the wipe: two slots, and both create a Level-1 character (rolled back).
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'core-wipe §2 probe') on conflict (user_id) do nothing;
    if public.hr_hero_slots_of(v_u) is distinct from '[0,1]'::jsonb then
      raise exception 'wipe §2: a new account owns %, not [0,1]', public.hr_hero_slots_of(v_u); end if;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'wipe §2: slot 0 create answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_create_character(1);
    if coalesce(v->>'created', '') <> 'true' then raise exception 'wipe §2: slot 1 create answered %', v; end if;
    if public.hr_level_of(v_u, 1) <> 1 then raise exception 'wipe §2: a new character is not Level 1'; end if;
    raise exception using errcode = 'HR879', message = 'core-wipe §2 complete - rolling back';
  exception when sqlstate 'HR879' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'wipe §2: LEAKED a probe row'; end if;
end $mig$;
