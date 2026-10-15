-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-21-closed-rebuild-wipe.sql — THE CLEAN SLATE: EVERY PLAYER'S
--   PROGRESS AND EVERY PIECE OF SHARED WORLD STATE FROM THE OLD GAME IS
--   REMOVED, ONCE. ACCOUNTS, THE ALLOWLIST, CATALOGUES AND CONFIG STAY.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C (lane/c-closed-rebuild).
-- Tyler's ruling 2026-10-14/15: the game closes for a full rebuild and all
-- player progress is wiped; Supabase's daily backups are the only backup — no
-- export, no carry, no conversion, nothing kept from the old game. Security GO,
-- then the Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). APPLY ORDER: AFTER
-- 2026-10-21-closed-mode.sql — §0 refuses unless closed mode is installed AND
-- closed, so nobody can be mid-play (and immediately re-create state) while the
-- tables empty. ⚠ IRREVERSIBLE except by restoring the daily backup taken
-- BEFORE the apply: confirm that backup exists (dashboard → Database → Backups)
-- before running this file.
--
-- ── THE RULE (what goes, what stays) ────────────────────────────────────────
--   GOES — a row that describes a player's or the world's GAME STATE, or is
--   bookkeeping derived from it: characters, skills, items, bank, farm,
--   workers, equipment, progress, bounties, wallets and grant keys, names,
--   clans and everything clan-keyed, parties, hunts, market, raids, world
--   events and finds, chat, the ledger and its rollup, the idempotency journal,
--   rate counters and refusal aggregates, telemetry, the world tick's
--   per-character ownership / shadow / probes / enrolment / horizons, the
--   retired save blob, the cutover import markers, the town snapshot (rebuilt by
--   its own 25 s cron).
--   STAYS — auth.* (accounts and sessions), public.profiles ROWS (one per auth
--   user, created by handle_new_user; RESET to the shape a fresh signup has:
--   no name, no clan), hr_access_allowlist, the signup structure (beta_invites,
--   beta_signup_log — append-only by its own trigger), chat_blocks (a player's
--   safety choice, not progress), bug_reports (the team's triage history),
--   every seeded catalogue, every operator_tunable row (hr_settings, hr_flags,
--   hr_market_config, hr_ledger_config, hr_tick_config / hr_tick_cohort,
--   hr_vigour_price_rule), the RPC/grant baselines, hr_server_secrets, and
--   operator telemetry that names no player (maintenance_log /
--   maintenance_alerts, hr_db_samples, hr_tick_cron_log). The tick cursors are
--   NULLED (they point at a character that no longer exists).
--
-- ── THE LEDGER RULING: player_ledger IS TRUNCATED ───────────────────────────
--   It is append-only so that history cannot be REWRITTEN while the economy it
--   describes is live — a forged or edited row would make a balance
--   unexplainable. Here the economy itself ends: every balance it explains goes
--   to zero in the same transaction. Kept, the ledger would describe value that
--   no longer exists — every reconciliation (balance == the sum of its rows,
--   the conservation fuzz, the vitals counts, the 90-day retention clock) would
--   read the new game as having started with 32k movements and nothing to show
--   for them, and a rebuilt character would inherit a ledger history it never
--   made. The audit trail of the old game is not lost: it is in the pre-wipe
--   daily backup, which Tyler named as the only backup. What stays is the
--   STRUCTURE: the table, its kind CHECK, its RLS, and both immutability
--   triggers — the TRUNCATE guard is disabled for exactly this one statement
--   inside this transaction and the self-check proves it is enabled again.
--   The wipe journals itself instead: one row in public.hr_wipe_log with the
--   row count removed from every table.
--
-- ── THE ONE-SHOT FENCE ──────────────────────────────────────────────────────
--   The wipe runs only when hr_wipe_log has no 'closed-rebuild-2026-10' row and
--   writes that row in the same transaction. Re-applying this file — by
--   accident, after friends have started playing the rebuild — is a NO-OP that
--   says so. A restore to a pre-wipe backup restores the absence of the row,
--   which is correct: that database has not been wiped.
--
-- ── AN UNKNOWN TABLE STOPS THE WIPE ─────────────────────────────────────────
--   Before anything is removed, every base table in `public` that names a
--   player (a user-id column, a foreign key to auth.users, or a foreign key to a
--   table on the wipe list) must be on the WIPE list or the KEEP list below. A
--   table nobody classified — e.g. one a lane applied after this file was
--   reviewed — refuses the whole file. Production carries four hunt-session
--   tables (hunt_sessions, hunt_bag, hunt_session_events, hunt_session_tally)
--   from 2026-10-21-hunt-sessions.sql, which is live but not on main; they are
--   on the WIPE list and skipped where absent (the repo replay).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   ONE TRUNCATE statement over every wiped table (RESTRICT, so a KEPT table
--   that still referenced a wiped one would refuse rather than be cascaded into),
--   under lock_timeout 10 s: a world-tick cron holding a row lock makes the apply
--   fail fast and retryable instead of queueing every request behind an ACCESS
--   EXCLUSIVE lock. CONTINUE IDENTITY: no id is ever reissued, so a stale id in
--   a client cache or a log can never alias a new row.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Measured 2026-10-14: ~45k rows (player_ledger 32k, hr_tick_shadow 11k),
--   ~40 MB freed immediately (TRUNCATE, no vacuum debt).
--
-- REVERSIBILITY: restore the pre-apply daily backup. Nothing else.
--
-- ⚠ AFTER APPLYING: restore-census --live re-measure (production counts move);
--   live-hash-drift is unaffected (no function body is created). Sign in as the
--   QA account: a fresh character is created on first load. Storage is NOT
--   touched (13 objects in the `avatars` bucket on 2026-10-14) — delete them
--   through the Storage API if the slate must be cleaner than the database.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — CLOSED MODE FIRST, AND CLOSED ────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_access_check()') is null
     or to_regclass('public.hr_access_allowlist') is null then
    raise exception 'PRECONDITION: apply 2026-10-21-closed-mode.sql before this file';
  end if;
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then
    raise exception 'PRECONDITION: closed_mode is not ON — wiping an OPEN game lets players re-create state '
                    'during the wipe. update public.hr_flags set enabled = true where key = ''closed_mode'' first';
  end if;
end $mig$;

-- ── §1 THE WIPE JOURNAL ─────────────────────────────────────────────────────
create table if not exists public.hr_wipe_log (
  wipe_key   text        primary key check (length(wipe_key) between 1 and 64),
  wiped_at   timestamptz not null default now(),
  removed    jsonb       not null,
  kept       jsonb       not null
);
alter table public.hr_wipe_log enable row level security;
alter table public.hr_wipe_log force row level security;
do $mig$
declare r text;
begin
  revoke all on public.hr_wipe_log from public;
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.hr_wipe_log from %I', r);
    end if;
  end loop;
end $mig$;

-- ── §2 THE WIPE AND ITS SELF-CHECK (CLAUDE.md §4) — ONE BLOCK, ONE SNAPSHOT ─
do $mig$
declare
  c_key  constant text := 'closed-rebuild-2026-10';
  -- Every table whose rows are the old game. Absent ones are skipped.
  c_wipe constant text[] := array[
    'account_gem_grants', 'account_wallet', 'active_bounty',
    'chat_messages',
    'clan_bans', 'clan_board', 'clan_invites', 'clan_ledger', 'clan_members',
    'clan_order_ballots', 'clan_order_votes', 'clan_raids', 'clan_stores', 'clan_tavern',
    'clan_withdrawals', 'clan_work_labour', 'clan_work_orders', 'clans',
    'display_names', 'game_events', 'game_saves',
    'hearthfind_log', 'hearthfind_ordinal',
    'hr_combat_xp_credit_log', 'hr_discord_gift_claims', 'hr_import_marker',
    'hr_kill_credit_log', 'hr_name_holds', 'hr_rate_counters', 'hr_rejections',
    'hr_return_anchor',
    'hr_tick_enrolment', 'hr_tick_horizon_log', 'hr_tick_ownership', 'hr_tick_probe',
    'hr_tick_shadow',
    'hunt_bag', 'hunt_session_events', 'hunt_session_tally', 'hunt_sessions',
    'market_buy_offers', 'market_listings', 'market_sales',
    'party', 'party_hunt', 'party_hunt_roster_log', 'party_hunt_tally', 'party_invite',
    'party_member', 'party_settle_boundary', 'party_tick_lease',
    'player_action_sets', 'player_bank', 'player_cosmetics', 'player_equipment',
    'player_farm', 'player_intents', 'player_inventory', 'player_ledger',
    'player_ledger_rollup', 'player_progress', 'player_skills', 'player_state',
    'player_workers',
    'raid_claims', 'raid_contributions',
    'session_claims', 'town_snapshot',
    'world_event_joins', 'world_event_pledges', 'world_event_totals', 'world_finds'];
  -- Tables that NAME a player and stay, each for the reason in the header.
  c_keep constant text[] := array[
    'beta_invites', 'beta_signup_log', 'bug_reports', 'chat_blocks', 'profiles',
    'hr_access_allowlist'];
  -- Catalogues that must survive non-empty (the "catalogues intact" half).
  c_catalogue constant text[] := array[
    'hr_items', 'hr_skills', 'hr_xp_table', 'hr_activities', 'hr_crops', 'hr_unlocks',
    'hr_client_rpc_baseline', 'hr_start_kit', 'hr_start_inventory'];
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
    raise notice 'closed-rebuild wipe already ran at % — no-op',
      (select wiped_at from public.hr_wipe_log where wipe_key = c_key);
    return;
  end if;

  -- (a) the two lists are disjoint
  select string_agg(x, ', ') into v_bad from unnest(c_wipe) x where x = any (c_keep);
  if v_bad is not null then raise exception 'wipe §2a: % is on both lists', v_bad; end if;

  -- (b) AN UNKNOWN PLAYER TABLE STOPS THE WIPE
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
     and c.relname <> all (c_wipe) and c.relname <> all (c_keep)
     and (exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                     and a.attname in ('user_id', 'from_id', 'seller_user_id', 'buyer_user_id',
                                       'blocker_id', 'blocked_id', 'owner_id', 'created_by', 'subject_id'))
          or exists (select 1 from pg_constraint k
                      where k.conrelid = c.oid and k.contype = 'f'
                        and (k.confrelid = 'auth.users'::regclass
                             or k.confrelid in (select w.oid from pg_class w
                                                 where w.relnamespace = 'public'::regnamespace
                                                   and w.relname = any (c_wipe)))));
  if v_bad is not null then
    raise exception 'wipe §2b: unclassified table(s) naming a player: % — add each to the WIPE or KEEP list '
                    'with a reason, re-review, then apply', v_bad;
  end if;

  -- (c) the snapshot: rows each wiped table loses, rows every other table must keep
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
  -- k2 nothing else lost a row: every kept table holds AT LEAST its snapshot
  --    count. At least, not exactly: the world-tick cron and the maintenance jobs
  --    append to operator logs (hr_tick_cron_log, maintenance_log …) from their
  --    own transactions while this one runs, and a signup can land in auth.users.
  --    The property is "the wipe removed nothing it was not told to", and that is
  --    what a lower count would disprove.
  for t in select key from jsonb_each(v_kept) loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_after := v_after || jsonb_build_object(t, v_n);
  end loop;
  select string_agg(format('%s %s→%s', k.key, k.value, v_after -> k.key), ', ') into v_bad
    from jsonb_each(v_kept) k where (v_after ->> k.key)::bigint < (k.value #>> '{}')::bigint;
  if v_bad is not null then raise exception 'wipe k2: a kept table lost rows: %', v_bad; end if;
  -- k3 accounts and access survive.
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
  if to_regclass('public.leaderboard_ranked') is not null
     and exists (select 1 from public.leaderboard_ranked) then
    raise exception 'wipe k6: leaderboard_ranked still ranks someone'; end if;
  if exists (select 1 from public.hr_tick_shard_cursor where cursor_user is not null)
     or exists (select 1 from public.hr_tick_config where cursor_user is not null) then
    raise exception 'wipe k6: a tick cursor still names a character'; end if;
  -- k7 the fence is written.
  if not exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise exception 'wipe k7: the one-shot fence row was not written'; end if;
  raise notice 'closed-rebuild wipe: % table(s) emptied, % row(s) removed; % kept table(s) unchanged',
    cardinality(v_present), (select sum(value::bigint) from jsonb_each_text(v_removed)),
    (select count(*) from jsonb_object_keys(v_kept));
end $mig$;

-- ── §3 THE FENCE IS ALWAYS THERE AFTER THIS FILE (first apply or re-apply) ──
do $mig$
begin
  if not exists (select 1 from public.hr_wipe_log where wipe_key = 'closed-rebuild-2026-10') then
    raise exception 'wipe §3: hr_wipe_log has no closed-rebuild-2026-10 row'; end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'hr_wipe_log'
                and grantee in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick', 'PUBLIC')) then
    raise exception 'wipe §3: a client or engine role holds a privilege on hr_wipe_log'; end if;
end $mig$;
