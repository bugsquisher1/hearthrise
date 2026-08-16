-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CLIENT WRITE GRANT SWEEP, BATCH 4 (THE LAST ONE):
--                    world_event_* (3) + clan_* (12) + maintenance_* (2)
--                    = 17 tables, 34 (table, grantee) pairs, and the baseline
--                    is EMPTY when this file has run.
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Predecessors: 2026-08-16-client-write-grant-sweep.sql   (batch 1 — six
--                 castle/hunt catalogues revoked, 21 pairs baselined, check (4)
--                 widened; it creates the baseline this file CONSUMES from)
--                 2026-08-16-client-write-grant-sweep-2.sql (batch 2 —
--                 display_names + leaderboard_meta; first to revoke MAINTAIN)
--                 2026-08-16-client-write-grant-sweep-3.sql (batch 3 — raid_*,
--                 plus the MAINTAIN pass over batch 1's six; the aclexplode-
--                 derived privilege vocabulary this file copies verbatim)
--   Graded by:    tests/client-write-sweep-4.mjs (behavioural, on the replay,
--                 with a mutation catalogue: --selftest must catch every entry)
--   Detector:     public.hr_assert_grant_hygiene(boolean) — NOT TOUCHED by this
--                 file. Grants and baseline rows only, so the derivation chain
--                 (tools/derive-grant-hygiene.mjs, PART 1f-ii) is not in play
--                 and §0 ASSERTS the body it depends on rather than replacing it.
--
-- ── PART A · THE SEVENTEEN, AND WHY THEY ARE ONE BATCH ──────────────────
-- Batches 1–3 took the tables whose blast radius could be argued one at a time.
-- What is left is the whole clan domain plus the two staff tables plus the three
-- world-event tables, and they are one batch because they share ONE writer
-- population — the clan/world-event RPC surface — and confirming that population
-- is the expensive part. Splitting it into three files would mean deriving the
-- same 42-function writer set three times and getting three chances to derive it
-- differently.
--
-- Ranked by blast radius, which is the axis this programme is ranked on:
--
--   · world_event_totals  — a SHARED, WHOLE-POPULATION aggregate. `goal` and
--     `progress` decide whether the community target is MET, and met_at applies
--     a 1.5× multiplier and a Muster Seal to EVERY participant's chest
--     (world_event_claim__ungated). One UPDATE sets the goal for everybody, or
--     hands the whole server the held-the-line bonus. Same shape as batch 2's
--     leaderboard_meta and the highest-radius row in this file.
--   · clan_ledger — THE APPEND-ONLY JOURNAL EVERY CLAN CAP IS READ FROM. The
--     per-member per-day contribute clamp, the board clamp, the tier-up
--     distinct-contributor gate and the whole abuse-detection story are all
--     `select ... from clan_ledger`. A client DELETE on it resets every daily
--     cap in the clan domain and erases the evidence that they were ever spent;
--     a client INSERT forges the contributor gate. It is the single most
--     load-bearing table in the batch, and tests/clan-journal-guard.mjs J11
--     already asserts it is not client-writable — through RLS. This file removes
--     the grant RLS is standing in front of.
--   · clan_stores / clan_raids / clan_board / clan_tavern / clan_work_* — shared
--     clan property and shared progress. Cross-player by construction.
--   · clan_withdrawals — the 24h escrow on a treasury withdrawal. A client
--     UPDATE of `ready_at` collapses the escrow; a DELETE of the row after
--     settle_at loses the record of who took it.
--   · clan_bans — the half of the S-KICK remedy that stops an evicted alt
--     walking back in. A client DELETE un-bans.
--   · clan_invites / clan_order_votes / clan_order_ballots — admission and the
--     build vote. A forged ballot decides what the hold builds.
--   · world_event_joins / world_event_pledges — per-player rows, but `points`
--     feeds the MEDIAN that sets everyone else's reward band, so a forged
--     points row changes what OTHER players are paid.
--   · maintenance_alerts / maintenance_log — staff-facing, smallest radius, and
--     the one place where the interesting verb is DELETE: these two tables are
--     where the nightly hr_assert_grant_hygiene failure surfaces. Silencing the
--     alarm is a smaller prize than robbing the vault and a bigger one than it
--     looks, because it is the thing that would tell you about the vault.
--
-- Every one of the 34 grants is DEAD today: RLS is on, and NOT ONE of the 17
-- carries an INSERT/UPDATE/DELETE/ALL policy. §0(b) re-derives that on the
-- database being migrated rather than trusting this paragraph.
--
-- ── ⚠ PART B · THE LIVE-POLICY QUESTION, RECONCILED HONESTLY ────────────
-- The reviewer's warning for this batch was: clan_members carries a LIVE write
-- policy (the `join as self` INSERT door for `join_policy='open'` clans), so it
-- may not be in the dead-grant class for INSERT, and revoking that (table, verb)
-- pair would break a working path.
--
-- The warning is correct about clan_members and it does NOT apply to this file,
-- for a reason worth writing down rather than asserting:
--
--   **clan_members is not one of the seventeen, and never was.** Batch 1's class
--   predicate is "RLS on AND a client write grant AND *no* INSERT/UPDATE/DELETE/
--   ALL policy AT ALL" — a table with ANY write policy is excluded from the class
--   by construction, so it was never baselined and there is no baseline row for
--   this file to consume. Measured on production 2026-08-16, the tables carrying
--   live client write policies in this domain are exactly two, and NEITHER is
--   baselined:
--     clan_members  "join as self"    [INSERT to authenticated]
--                   "leave as self"   [DELETE to public]
--     clans         "clans creatable" [INSERT to authenticated]
--   …and all seventeen tables this file sweeps report NO write policy at all.
--
-- So there are ZERO live-policy pairs among the 34, nothing to re-justify, and
-- the baseline is EMPTY when this file has run. That is a measurement, not a
-- plan: §0(b) refuses if any of the 17 has gained a write policy since, and
-- §0(b2) refuses if clan_members or clans has somehow been baselined — which
-- would mean either their policies were dropped without this file being
-- re-reviewed, or somebody hand-inserted a row.
--
-- ⚠ AND THE OTHER DIRECTION, said plainly because it is a REAL finding this file
--   does NOT fix: clan_members and clans still have live client write policies,
--   i.e. a browser can still INSERT a membership row and a clan row and DELETE
--   its own membership. The migration that closes them —
--   2026-08-12-clan-members-rls-drop.sql — is STAGED, NOT APPLIED, and it
--   refuses to apply until `select count(*) from clan_ledger where kind='member'`
--   is non-zero. On production that count was **0** on 2026-08-16, so the
--   precondition is still unmet and this file changes nothing about it. Driving
--   clan_join() on the REPLAY (which tests/client-write-sweep-4.mjs does, and
--   which does write a kind='member' row there) does NOT satisfy it: the
--   precondition is a statement about PRODUCTION's ledger, and the replay is a
--   different database. Named here so the gap is a decision rather than an
--   oversight; it belongs to the clan-membership programme, not to a grant sweep.
--
-- ── THE CONFIRMED WRITERS (the claim this file rests on) ─────────────────
-- FORTY-TWO functions, every one SECURITY DEFINER and owned by the table owner.
-- Measured on production AND on the repo's replay 2026-08-16 — the two sets are
-- byte-identical — with a full pg_proc.prosrc scan, and re-derived by §0(c) on
-- the database being migrated. Per table:
--
--   world_event_joins    world_event_claim__ungated, world_event_contribute__ungated,
--                        world_event_join__ungated
--   world_event_pledges  world_event_absence_claim__ungated, world_event_pledge__ungated,
--                        world_event_pledge_settle__ungated
--   world_event_totals   world_event_contribute__ungated, world_event_join__ungated
--   clan_bans            clan_invite, clan_kick
--   clan_board           clan_board_claim__ungated, clan_board_progress__ungated,
--                        clan_board_roll__ungated
--   clan_invites         clan_invite, clan_invite_revoke, clan_join, clan_kick
--   clan_ledger          twenty-six — every clan RPC that moves anything, plus
--                        raid_claim__ungated (the raid chest is journalled in the
--                        clan books). Enumerated in c_writers below.
--   clan_order_ballots   clan_vote_cast__ungated
--   clan_order_votes     clan_vote_open__ungated, hr_clan_vote_settle_one
--   clan_raids           clan_hunt_declare__ungated, raid_claim__ungated,
--                        raid_strike__ungated
--   clan_stores          clan_deposit__ungated, clan_tier_up__ungated,
--                        clan_upkeep_settle, clan_work_supply__ungated
--   clan_tavern          clan_feast_call__ungated, clan_feast_deposit__ungated
--   clan_withdrawals     clan_withdraw, clan_withdraw_cancel, clan_withdraw_settle
--   clan_work_labour     clan_work_labour__ungated
--   clan_work_orders     clan_work_complete__ungated, clan_work_labour__ungated,
--                        clan_work_supply__ungated, hr_clan_order_create
--   maintenance_alerts   hr_cron_health
--   maintenance_log      hr_cron_health, hr_trim_game_events
--
-- No non-internal trigger fires on any of the 17, no rule rewrites any, and no
-- view or materialised view depends on any. §0(c) re-derives ALL FOUR
-- populations and carries a POSITIVE CONTROL (every declared writer must be
-- matched by the very expression used to decide nothing else writes) plus an
-- ANCHOR CONTROL (the word-anchored and un-anchored scans must agree, so the
-- `\M` cannot be what makes an unknown writer invisible).
--
-- ⚠ EVERY ONE OF THE 42 IS DRIVEN FOR REAL, BEFORE AND AFTER THE REVOKE, by
--   tests/client-write-sweep-4.mjs arm C4 — client-callable ones through their
--   A9 wrappers as a signed-in player, cron/nested ones as the owner they really
--   run as — and each is required to actually CHANGE its target table, measured
--   by a row fingerprint rather than by a returned `ok:true`. "The RPC answered"
--   and "the RPC wrote" are different claims and only the second one matters here.
--
-- SELECT IS NOT REVOKED ANYWHERE IN THIS FILE, and must not be. Twelve of the
-- 17 carry a read policy the client renders from (the roster, the board, the
-- ledger feed, the muster totals); the other five have no policy at all, so
-- their SELECT grant is already inert and taking it away is not this file's
-- business. Who may READ these tables is not this file's business; who may
-- WRITE them is.
--
-- REVERSIBILITY (should never be needed; every grant here is dead)
--   grant insert, update, delete, maintain on
--     public.world_event_joins, public.world_event_pledges, public.world_event_totals,
--     public.clan_bans, public.clan_board, public.clan_invites, public.clan_ledger,
--     public.clan_order_ballots, public.clan_order_votes, public.clan_raids,
--     public.clan_stores, public.clan_tavern, public.clan_withdrawals,
--     public.clan_work_labour, public.clan_work_orders,
--     public.maintenance_alerts, public.maintenance_log to anon, authenticated;
--   insert into public.hr_client_write_baseline (table_name, grantee, note)
--     select t, g, 'restored'
--       from unnest(array['world_event_joins','world_event_pledges','world_event_totals',
--                         'clan_bans','clan_board','clan_invites','clan_ledger',
--                         'clan_order_ballots','clan_order_votes','clan_raids',
--                         'clan_stores','clan_tavern','clan_withdrawals',
--                         'clan_work_labour','clan_work_orders',
--                         'maintenance_alerts','maintenance_log']) t
--       cross join unnest(array['anon','authenticated']) g;
--   Nothing else is touched: no function body, no policy, no player row, no
--   detector, and NO PREDECESSOR IS EDITED — see batch 2's §5 for the mechanical
--   reason (a rebuild applies them BEFORE this file, when the pairs are still in
--   the class).
--
-- APPLY ORDER: … → sweep.sql → sweep-2.sql → sweep-3.sql → THIS FILE.
--   Batch 1 is a HARD predecessor (this file consumes rows it seeds and asserts
--   the check (4) it installs). Batches 2 and 3 are NOT mechanically required —
--   they touch different tables — so §0(f) reports their state as a NOTICE
--   rather than refusing. Stated so the absence of a refusal is a decision.
--
-- SAFE TO RE-RUN? **NO, AND DELIBERATELY SO**, exactly as batches 2 and 3.
-- §1(b) REFUSES if a baseline row it is supposed to delete is already absent.
-- A re-run is a loud stop, not a silent no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — REFUSE TO INSTALL ON A DATABASE THIS IS NOT TRUE OF ──
do $$
declare
  -- THE SEVENTEEN.
  c_tables constant text[] := array[
    'world_event_joins','world_event_pledges','world_event_totals',
    'clan_bans','clan_board','clan_invites','clan_ledger','clan_order_ballots',
    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',
    'clan_work_labour','clan_work_orders',
    'maintenance_alerts','maintenance_log'];

  -- ⚠ THE TABLES THAT ARE **NOT** IN THE CLASS BECAUSE THEY HAVE A LIVE WRITE
  --   POLICY. Named so that "clan_members is missing from the list" is a
  --   DECISION with a check behind it rather than something nobody noticed.
  --   §0(b2) asserts they still carry a write policy AND are still unbaselined.
  c_live_policy constant text[] := array['clan_members','clans'];

  -- THE CONFIRMED WRITERS, as (table, function) pairs. §0(c) proves this list is
  -- COMPLETE (nothing else writes) and §0(c) proves it is HONEST (every entry is
  -- really matched by the scan) — both directions, because either alone passes
  -- on a blind regex.
  c_writers constant text[][] := array[
    ['world_event_joins','world_event_claim__ungated'],
    ['world_event_joins','world_event_contribute__ungated'],
    ['world_event_joins','world_event_join__ungated'],
    ['world_event_pledges','world_event_absence_claim__ungated'],
    ['world_event_pledges','world_event_pledge__ungated'],
    ['world_event_pledges','world_event_pledge_settle__ungated'],
    ['world_event_totals','world_event_contribute__ungated'],
    ['world_event_totals','world_event_join__ungated'],
    ['clan_bans','clan_invite'],
    ['clan_bans','clan_kick'],
    ['clan_board','clan_board_claim__ungated'],
    ['clan_board','clan_board_progress__ungated'],
    ['clan_board','clan_board_roll__ungated'],
    ['clan_invites','clan_invite'],
    ['clan_invites','clan_invite_revoke'],
    ['clan_invites','clan_join'],
    ['clan_invites','clan_kick'],
    ['clan_ledger','clan_board_claim__ungated'],
    ['clan_ledger','clan_board_progress__ungated'],
    ['clan_ledger','clan_claim_leadership'],
    ['clan_ledger','clan_contribute__ungated'],
    ['clan_ledger','clan_create'],
    ['clan_ledger','clan_deposit__ungated'],
    ['clan_ledger','clan_feast_call__ungated'],
    ['clan_ledger','clan_feast_deposit__ungated'],
    ['clan_ledger','clan_invite'],
    ['clan_ledger','clan_invite_revoke'],
    ['clan_ledger','clan_join'],
    ['clan_ledger','clan_join_policy_set'],
    ['clan_ledger','clan_kick'],
    ['clan_ledger','clan_leave'],
    ['clan_ledger','clan_rested_grant__ungated'],
    ['clan_ledger','clan_set_role'],
    ['clan_ledger','clan_tier_up__ungated'],
    ['clan_ledger','clan_upkeep_pay'],
    ['clan_ledger','clan_upkeep_settle'],
    ['clan_ledger','clan_vice_set__ungated'],
    ['clan_ledger','clan_vote_open__ungated'],
    ['clan_ledger','clan_withdraw'],
    ['clan_ledger','clan_withdraw_settle'],
    ['clan_ledger','clan_work_complete__ungated'],
    ['clan_ledger','clan_work_labour__ungated'],
    ['clan_ledger','raid_claim__ungated'],
    ['clan_order_ballots','clan_vote_cast__ungated'],
    ['clan_order_votes','clan_vote_open__ungated'],
    ['clan_order_votes','hr_clan_vote_settle_one'],
    ['clan_raids','clan_hunt_declare__ungated'],
    ['clan_raids','raid_claim__ungated'],
    ['clan_raids','raid_strike__ungated'],
    ['clan_stores','clan_deposit__ungated'],
    ['clan_stores','clan_tier_up__ungated'],
    ['clan_stores','clan_upkeep_settle'],
    ['clan_stores','clan_work_supply__ungated'],
    ['clan_tavern','clan_feast_call__ungated'],
    ['clan_tavern','clan_feast_deposit__ungated'],
    ['clan_withdrawals','clan_withdraw'],
    ['clan_withdrawals','clan_withdraw_cancel'],
    ['clan_withdrawals','clan_withdraw_settle'],
    ['clan_work_labour','clan_work_labour__ungated'],
    ['clan_work_orders','clan_work_complete__ungated'],
    ['clan_work_orders','clan_work_labour__ungated'],
    ['clan_work_orders','clan_work_supply__ungated'],
    ['clan_work_orders','hr_clan_order_create'],
    ['maintenance_alerts','hr_cron_health'],
    ['maintenance_log','hr_cron_health'],
    ['maintenance_log','hr_trim_game_events']
  ];

  -- The FULL table-privilege vocabulary this file claims to enumerate. §0(e)
  -- checks it against what the SERVER knows, which is the whole point — a
  -- hand-typed list is exactly how MAINTAIN survived batch 1.
  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',
                                    'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
  -- The scan, in ONE place: the raise, the positive control and the anchor
  -- control must all be about the same expression or the controls prove nothing
  -- about the check. %1$s is the table name.
  c_scan   constant text := '(insert\s+into|update|delete\s+from)\s+(public\.)?%1$s\M';
  c_scan0  constant text := '(insert\s+into|update|delete\s+from)\s+(public\.)?%1$s';

  t        text;
  fn       text;
  v_src    text;
  v_n      int;
  v_bad    text;
  v_owner  oid;
  v_srv    text[];
begin
  -- (a) BATCH 1 RAN, and check (4) is the WIDENED one. Without the widening the
  --     class this file is emptying does not exist as a concept, and §4's
  --     "reports clean" would be clean for the wrong reason.
  if to_regclass('public.hr_client_write_baseline') is null then
    raise exception 'REFUSING TO INSTALL: public.hr_client_write_baseline is missing. Apply '
                    '2026-08-16-client-write-grant-sweep.sql first — this file consumes the '
                    'baseline it creates and has nothing to delete without it.';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'REFUSING TO INSTALL: hr_assert_grant_hygiene is missing.';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';
  if v_src !~ 'hr_client_write_baseline' then
    raise exception 'REFUSING TO INSTALL: the live hr_assert_grant_hygiene does not consult '
                    'hr_client_write_baseline, so check (4) is the PRE-WIDENING body. §4 of this '
                    'file would then report "clean" because the check cannot see the class at all. '
                    'Apply 2026-08-16-client-write-grant-sweep.sql.';
  end if;

  -- (b) THE SEVENTEEN EXIST AND ARE STILL SHAPED THE WAY THE CLAIM ASSUMES:
  --     RLS ON, and NO write policy of any kind. A write policy having appeared
  --     means the grant is NOT dead, something intends to use it, and revoking
  --     it breaks a live path — which is precisely the reviewer's warning about
  --     clan_members, applied per table on the database being migrated.
  foreach t in array c_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'REFUSING TO INSTALL: public.% does not exist. This file was written against '
                      'a database that has it; on one that does not, the sweep is not a no-op, it '
                      'is a sign the chain applied differently than assumed.', t;
    end if;
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || quote_ident(t))::regclass) then
      raise exception 'REFUSING TO INSTALL: RLS is DISABLED on public.%. That is a far larger '
                      'finding than this file addresses — with RLS off, every grant on it is LIVE '
                      'right now, not dead. Fix that first.', t;
    end if;
    select string_agg(policyname || '(' || cmd || ')', ', ') into v_bad
      from pg_policies where schemaname = 'public' and tablename = t
       and cmd in ('INSERT','UPDATE','DELETE','ALL');
    if v_bad is not null then
      raise exception 'REFUSING TO INSTALL: public.% now carries a client WRITE policy (%). The '
                      'grant this file calls dead is therefore LIVE for that verb, the (table, '
                      'grantee) pair is NOT in the dead-grant class, and revoking it would break a '
                      'working path. This is the clan_members case arriving on a table that was in '
                      'the class when the batch was reviewed: do NOT widen this check. Take the '
                      'table out of c_tables and c_pairs, re-justify its baseline row by hand, and '
                      'review the policy.', t, v_bad;
    end if;
  end loop;

  -- (b2) ⚠ THE MIRROR OF (b), AND THE REVIEWER'S ACTUAL WARNING. clan_members
  --      and clans DO carry live write policies and are therefore NOT in the
  --      class and NOT baselined. Both halves are asserted, because either one
  --      changing means this file's Part B is out of date:
  --        · a live-policy table appearing in the baseline = somebody baselined
  --          a pair that is not dead;
  --        · a live-policy table LOSING its last write policy = it has silently
  --          JOINED the class, is not in this file's list, and is now an
  --          unswept, unbaselined member that check (4) will raise on nightly.
  foreach t in array c_live_policy loop
    if to_regclass('public.' || t) is null then
      raise notice 'SWEEP-4 §0(b2): public.% does not exist here — skipping the live-policy '
                   'reconciliation for it', t;
      continue;
    end if;
    if exists (select 1 from public.hr_client_write_baseline b where b.table_name = t) then
      raise exception 'REFUSING TO INSTALL: public.% is BASELINED, but it carries a live client '
                      'write policy and therefore cannot be in the dead-grant class. Either the '
                      'row was inserted by hand or batch 1''s predicate has changed. Reconcile '
                      'before sweeping anything.', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and cmd in ('INSERT','UPDATE','DELETE','ALL')) then
      raise exception 'REFUSING TO INSTALL: public.% no longer has ANY client write policy. It was '
                      'excluded from this batch precisely because it had one (clan_members "join '
                      'as self" / "leave as self", clans "clans creatable"), so it has now JOINED '
                      'the dead-grant class — unswept, unbaselined, and something the nightly '
                      'hr_assert_grant_hygiene will start raising on. If 2026-08-12-clan-members-'
                      'rls-drop.sql has been applied, that table belongs in a batch 5 with its own '
                      'confirmed writers; it does not belong in this one silently.', t;
    end if;
  end loop;

  -- (c) THE WRITERS ARE CONFIRMED ON THIS DATABASE, NOT IN THIS COMMENT.
  --     FOUR populations, because "the writer" is not only a function:
  --       (i)   pg_proc bodies containing a DML statement against the table
  --       (ii)  non-internal triggers on the table
  --       (iii) rules rewriting the table
  --       (iv)  views / matviews depending on it (an updatable view is a writer
  --             that needs no grant of its own)
  foreach t in array c_tables loop
    execute format(
      'select string_agg(x.fn, '', '' order by x.fn) from ('
      '  select p.oid::regprocedure::text as fn'
      '    from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
      '   where n.nspname = ''public'''
      '     and p.prosrc ~* %L'
      '     and p.proname <> ''hr_assert_grant_hygiene'''
      '     and p.proname <> all ($1)) x',
      format(c_scan, t))
      into v_bad
      using (select coalesce(array_agg(c_writers[i][2]), array[]::text[])
               from generate_subscripts(c_writers, 1) i
              where c_writers[i][1] = t);
    if v_bad is not null then
      raise exception 'REFUSING TO INSTALL: public.% has writer(s) this file does not know about: '
                      '%. "The writers are confirmed" is the entire basis on which a batch is '
                      'allowed to sweep, and that claim is now false.', t, v_bad;
    end if;

    -- ⚠ POSITIVE CONTROL. The expression above is written to find NOTHING; an
    --   expression that has stopped matching anything at all also finds nothing
    --   and would pass while seeing zero writers. So every DECLARED writer of
    --   this table must be matched by the very same expression.
    for fn in select c_writers[i][2] from generate_subscripts(c_writers, 1) i
               where c_writers[i][1] = t loop
      execute format(
        'select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
        ' where n.nspname = ''public'' and p.proname = %L and p.prosrc ~* %L', fn, format(c_scan, t))
        into v_n;
      if v_n is null then
        raise exception 'THE WRITER SCAN IS BLIND (positive control): the declared writer public.% '
                        'is not matched by the very expression used to decide nothing else writes '
                        'public.%. Either the function is gone or the scan no longer works.', fn, t;
      end if;
    end loop;

    -- ⚠ ANCHOR CONTROL. The scan is word-anchored (`\M`) so that a writer of a
    --   DIFFERENTLY-NAMED sibling table (clan_board vs clan_board_history) is
    --   not reported as an unknown writer of this one. That anchor is also the
    --   one thing that could make a REAL writer invisible, so the anchored and
    --   un-anchored scans are required to agree. Measured equal on production
    --   and on the replay 2026-08-16 for all seventeen; if they ever diverge the
    --   correct answer is a human, not a narrower regex.
    execute format(
      'select string_agg(p.proname, '', '' order by p.proname)'
      '  from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
      ' where n.nspname = ''public'' and p.prosrc ~* %L and p.prosrc !~* %L',
      format(c_scan0, t), format(c_scan, t))
      into v_bad;
    if v_bad is not null then
      raise exception 'REFUSING TO INSTALL (anchor control): the word-anchored writer scan for '
                      'public.% HIDES % from the un-anchored one. The word anchor is narrowing the '
                      'very check that decides this grant is dead.', t, v_bad;
    end if;
  end loop;

  select string_agg(x.k, ', ' order by x.k) into v_bad from (
    select 'trigger ' || tg.tgname || ' on ' || tg.tgrelid::regclass::text as k
      from pg_trigger tg
     where not tg.tgisinternal
       and tg.tgrelid::regclass::text = any (c_tables)
    union all
    select 'rule ' || r.rulename || ' on ' || r.ev_class::regclass::text
      from pg_rewrite r
     where r.rulename <> '_RETURN'
       and r.ev_class::regclass::text = any (c_tables)
    union all
    select 'view ' || c.relname || ' on ' || d.refobjid::regclass::text
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class c on c.oid = r.ev_class
     where c.relkind in ('v','m')
       and d.refobjid::regclass::text = any (c_tables)
       and c.relname <> all (c_tables)) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: something other than a function routes into the swept '
                    'tables: %. A trigger, a rule or an updatable view is a writer, and this file '
                    'has confirmed only SECURITY DEFINER functions.', v_bad;
  end if;

  -- (d) THE WRITERS SURVIVE THE REVOKE — asserted structurally here, and PROVEN
  --     behaviourally on the replay by tests/client-write-sweep-4.mjs C4, which
  --     DRIVES all 42 before AND after. A SECURITY DEFINER function executes as
  --     its OWNER, so the property is: the function is really SECURITY DEFINER,
  --     its A9 wrapper (where there is one) is too, and the owner holds the
  --     write privileges on the table. All three by name; any one alone is
  --     worthless.
  for t, fn in select c_writers[i][1], c_writers[i][2]
                 from generate_subscripts(c_writers, 1) i loop
    select p.proowner into v_owner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn limit 1;
    if v_owner is null then
      raise exception 'REFUSING TO INSTALL: the confirmed writer public.% does not exist on this '
                      'database, so "the writer still works after the revoke" is untestable.', fn;
    end if;
    -- The function AND, where the A9 retrofit wrapped it, the client-facing
    -- wrapper. `authenticated` executes the WRAPPER; if that stopped being
    -- SECURITY DEFINER it would run as the caller and this revoke would break it.
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in (fn, regexp_replace(fn, '__ungated$', ''))
                  and not p.prosecdef) then
      raise exception 'REFUSING TO INSTALL: public.% (or its A9 wrapper) is not SECURITY DEFINER. '
                      'It would then execute as the CALLER, and revoking the caller''s grants is '
                      'exactly what breaks it.', fn;
    end if;
    if not has_table_privilege(v_owner::regrole::text, 'public.' || quote_ident(t),
                               'INSERT, UPDATE, DELETE') then
      raise exception 'REFUSING TO INSTALL: %, the owner of the confirmed writer public.%, does not '
                      'hold INSERT/UPDATE/DELETE on public.%. Revoking the client grants would '
                      'leave the table with NO writer at all.', v_owner::regrole::text, fn, t;
    end if;
  end loop;

  -- (e) ⚠ THE INSTRUMENT CHECK (batch 3's, verbatim — it is the reason batch 1's
  --     six were still dirty after being reported clean). The privilege
  --     vocabulary is DERIVED FROM THE SERVER, not typed. If the server knows a
  --     table privilege this file does not enumerate, every measurement below is
  --     partial and its "0 remain" is the same false report batch 1 filed.
  select array_agg(distinct a.privilege_type::text order by a.privilege_type::text)
    into v_srv
    from aclexplode(acldefault('r', (select oid from pg_roles
                                      where rolname = current_user))) a;
  if v_srv is null or array_length(v_srv, 1) is null then
    raise exception 'REFUSING TO INSTALL: could not derive the table-privilege vocabulary from '
                    'acldefault(). Without it this file cannot know whether its enumeration is '
                    'complete, which is precisely how MAINTAIN survived batch 1.';
  end if;
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(v_srv) s where not (s = any (c_vocab));
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: this server knows table privilege(s) this file does not '
                    'enumerate: %. Every revoke and every verification below would then be partial '
                    'and would still report success — the exact failure that left MAINTAIN on '
                    'batch 1''s six catalogues. Widen c_vocab (and the revoke) first.', v_bad;
  end if;
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(c_vocab) s where not (s = any (v_srv));
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: this file enumerates privilege(s) this server does not '
                    'have: % (server_version_num = %). MAINTAIN needs PostgreSQL 17+.',
                    v_bad, current_setting('server_version_num');
  end if;

  -- (f) BATCHES 2 AND 3's STATE — reported, NOT required. Nothing in this file
  --     depends on either: different tables, different rows. Said out loud so
  --     their absence is a decision rather than something nobody looked at.
  if exists (select 1 from public.hr_client_write_baseline
              where table_name in ('display_names','leaderboard_meta')) then
    raise notice 'SWEEP-4 §0(f): batch 2 (display_names, leaderboard_meta) has NOT been applied on '
                 'this database. Not an error here — different tables — but the chain is meant to '
                 'run 1 -> 2 -> 3 -> 4.';
  end if;
  if exists (select 1 from public.hr_client_write_baseline
              where table_name in ('raid_claims','raid_contributions')) then
    raise notice 'SWEEP-4 §0(f): batch 3 (raid_claims, raid_contributions) has NOT been applied on '
                 'this database. Not an error here — different tables.';
  end if;

  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'SWEEP-4 §0 PASSED: batch 1 is applied (% baselined pair(s)); all 17 tables have RLS '
               'on with NO write policy; clan_members/clans still hold their live write policies '
               'and are still unbaselined; all % declared writer/table pairs are SECURITY DEFINER, '
               'owned by a role that keeps its write privileges, and are the ONLY writers (no '
               'trigger, rule or view routes in); and the privilege vocabulary this file enumerates '
               'is EXACTLY what the server knows (%).',
               v_n, array_length(c_writers, 1), array_to_string(v_srv, ',');
end $$;

-- ── 1. THE SWEEP — revoke, and CONSUME the baseline rows in the same file ──
do $$
declare
  c_tables constant text[] := array[
    'world_event_joins','world_event_pledges','world_event_totals',
    'clan_bans','clan_board','clan_invites','clan_ledger','clan_order_ballots',
    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',
    'clan_work_labour','clan_work_orders',
    'maintenance_alerts','maintenance_log'];
  /* ⚠ THE 34 PAIRS ARE DECLARED LITERALLY, AND THAT IS A CONTRACT, NOT A STYLE.
     Deriving them from c_tables would be less to type and less to get wrong —
     but tests/client-write-sweep-2.mjs and -3.mjs each build their expected
     baseline as "batch 1's declared class MINUS the union of every `c_pairs`
     array declared by every sweep file in the migrations directory", parsed out
     of the SQL text. A batch that derives its pairs at runtime contributes
     NOTHING to that union, so both predecessor guards would compute a 34-row
     expected baseline against an empty one and go RED — for a database in
     perfect order. That is exactly the pressure that gets a guard loosened
     instead of fixed (batch 3's C5 comment records the same thing happening to
     batch 2 when batch 3 landed).
     So: declared literally for the parser, and CROSS-CHECKED against c_tables
     immediately below, which is the only thing the derivation was buying. */
  c_pairs  constant text[][] := array[
    ['clan_bans','anon'],            ['clan_bans','authenticated'],
    ['clan_board','anon'],           ['clan_board','authenticated'],
    ['clan_invites','anon'],         ['clan_invites','authenticated'],
    ['clan_ledger','anon'],          ['clan_ledger','authenticated'],
    ['clan_order_ballots','anon'],   ['clan_order_ballots','authenticated'],
    ['clan_order_votes','anon'],     ['clan_order_votes','authenticated'],
    ['clan_raids','anon'],           ['clan_raids','authenticated'],
    ['clan_stores','anon'],          ['clan_stores','authenticated'],
    ['clan_tavern','anon'],          ['clan_tavern','authenticated'],
    ['clan_withdrawals','anon'],     ['clan_withdrawals','authenticated'],
    ['clan_work_labour','anon'],     ['clan_work_labour','authenticated'],
    ['clan_work_orders','anon'],     ['clan_work_orders','authenticated'],
    ['maintenance_alerts','anon'],   ['maintenance_alerts','authenticated'],
    ['maintenance_log','anon'],      ['maintenance_log','authenticated'],
    ['world_event_joins','anon'],    ['world_event_joins','authenticated'],
    ['world_event_pledges','anon'],  ['world_event_pledges','authenticated'],
    ['world_event_totals','anon'],   ['world_event_totals','authenticated']];
  t        text;
  v_drift  text;
  -- NB: no `i` variable. `generate_subscripts(...) i` below is a RANGE ALIAS,
  -- and a PL/pgSQL variable of the same name makes every reference to it
  -- ambiguous — which Postgres reports at execution, not at create time, so it
  -- fails on the apply rather than in review. (Batch 2 learned this here.)
  v_before  text;
  v_missing text;
  v_deleted int;
begin
  -- THE CROSS-CHECK. The two hand-typed lists must be exactly c_tables ×
  -- {anon, authenticated}, in BOTH directions — a table in c_tables with no pair
  -- would be revoked and left baselined (a permanent silent exemption on a table
  -- with no grant), and a pair whose table is not in c_tables would delete a
  -- baseline row without revoking anything (the same exemption, the other way
  -- round, with the grant still live).
  select string_agg(k, ', ' order by k) into v_drift from (
    select tt || ':' || gg as k
      from unnest(c_tables) tt cross join unnest(array['anon','authenticated']) gg
     where not exists (select 1 from generate_subscripts(c_pairs, 1) i
                        where c_pairs[i][1] = tt and c_pairs[i][2] = gg)
    union all
    select c_pairs[i][1] || ':' || c_pairs[i][2]
      from generate_subscripts(c_pairs, 1) i
     where not (c_pairs[i][1] = any (c_tables))) x;
  if v_drift is not null then
    raise exception 'SWEEP-4 §1: c_tables and c_pairs disagree about which pairs this batch owns: '
                    '%. One of the two lists has been edited without the other.', v_drift;
  end if;
  if array_length(c_pairs, 1) <> 34 then
    raise exception 'SWEEP-4 §1: the pair list holds % rows, not 34. The table list and the batch '
                    'this file documents have diverged.', array_length(c_pairs, 1);
  end if;

  -- What we are about to remove, named at apply time. Through has_table_privilege
  -- rather than information_schema — see the MAINTAIN note in batch 3's header.
  select string_agg(x.k, ', ' order by x.k) into v_before from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(c_tables) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
                              'TRIGGER','MAINTAIN']) pp
     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;

  -- (a) THE REVOKE. Enumerated, not `revoke all`, because SELECT must survive —
  --     twelve of the seventeen carry a read policy the client renders from.
  --     MAINTAIN is included; §0(e) has already proven the server has it, so no
  --     version guard is needed here (an unguarded `revoke maintain` on PG16
  --     would be a syntax error, and §0(e) refuses to install there by name).
  foreach t in array c_tables loop
    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '
                   'on public.%I from public, anon, authenticated', t);
  end loop;

  -- (b) THE BASELINE ROWS, DELETED — and REFUSING TO INSTALL IF ONE IS ABSENT.
  --     An absent row means somebody else already swept this pair, so this file
  --     is reasoning about a state that no longer exists. Checked BEFORE the
  --     delete so the message can name which pair, and the whole migration rolls
  --     back (including the revokes above) on the raise.
  select string_agg(c_pairs[i][1] || ':' || c_pairs[i][2], ', ') into v_missing
    from generate_subscripts(c_pairs, 1) i
   where not exists (select 1 from public.hr_client_write_baseline b
                      where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2]);
  if v_missing is not null then
    raise exception 'REFUSING TO INSTALL: baseline row(s) this file is supposed to DELETE are '
                    'already absent: %. Either this migration has already been applied (it is NOT '
                    'safe to re-run, by design — see the header) or another batch swept the same '
                    'pair. Both mean this file no longer knows what state it is changing. '
                    'Reconcile by hand.', v_missing;
  end if;

  delete from public.hr_client_write_baseline b
   using generate_subscripts(c_pairs, 1) i
   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2];
  get diagnostics v_deleted = row_count;
  if v_deleted <> array_length(c_pairs, 1) then
    raise exception 'SWEEP-4 §1(b): expected to delete % baseline row(s), deleted %. The list and '
                    'the table disagree about their own primary key.', array_length(c_pairs,1), v_deleted;
  end if;

  raise notice 'SWEEP-4 §1: revoked [%]; % baseline row(s) consumed.',
    coalesce(v_before, '(none — nothing to revoke, which is itself worth reading twice)'), v_deleted;
end $$;

-- ── 2. VERIFICATION (A) — NOTHING SURVIVES, MEASURED THE WAY THAT CAN SEE ──
-- has_table_privilege over the full server-derived vocabulary, not
-- information_schema, which cannot report MAINTAIN.
do $$
declare
  c_tables constant text[] := array[
    'world_event_joins','world_event_pledges','world_event_totals',
    'clan_bans','clan_board','clan_invites','clan_ledger','clan_order_ballots',
    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',
    'clan_work_labour','clan_work_orders',
    'maintenance_alerts','maintenance_log'];
  v_left text; v_sel int;
begin
  select string_agg(x.k, ', ' order by x.k) into v_left from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(c_tables) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
                              'TRIGGER','MAINTAIN']) pp
     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;
  if v_left is not null then
    raise exception 'SWEEP-4 §2(A) FAILED: client privilege(s) survive the revoke: %', v_left;
  end if;

  -- SELECT MUST STILL BE THERE, on all 34 pairs. A sweep that quietly took the
  -- read with it would empty the clan roster, the board, the ledger feed and the
  -- muster totals — silently, with nothing else in this file noticing.
  select count(*) into v_sel from (
    select 1 from unnest(c_tables) tt
      cross join unnest(array['anon','authenticated']) gg
     where has_table_privilege(gg, 'public.' || quote_ident(tt), 'SELECT')) z;
  if v_sel <> 34 then
    raise exception 'SWEEP-4 §2(A) FAILED: SELECT was collaterally revoked (% of 34 remain). Who '
                    'may READ these tables is not this file''s business.', v_sel;
  end if;
  raise notice 'SWEEP-4 §2(A): zero client write privileges remain on any of the 17 (measured over '
               'the full server-derived vocabulary, MAINTAIN included); all 34 SELECT grants intact.';
end $$;

-- ── 3. VERIFICATION (B) — THE DOOR IS SHUT, PROVEN BY EXECUTION ───────────
-- A catalogue assertion says what the catalogue says. This ATTEMPTS THE WRITE as
-- the client roles, on all 17 tables, and reads the refusal back.
--
-- ⚠ THE CONTROL THAT MAKES IT MEAN ANYTHING. Before the revoke these INSERTs
--   already failed — on ROW-LEVEL SECURITY, which raises the SAME SQLSTATE
--   (42501) as a missing grant. So "it failed" proves nothing on its own and a
--   test that only asserted 42501 would have passed against an un-swept
--   database. The two are distinguished by MESSAGE: "permission denied for
--   table x" (the grant is gone) vs "new row violates row-level security policy"
--   (the grant is there and RLS is the only thing holding it). This block demands
--   the FORMER. The matching pre-state arm — same probe, un-swept database, must
--   report the RLS message — is in tests/client-write-sweep-4.mjs (C3).
--
-- ⚠ RESIDUAL, stated rather than hidden: this match is on the ENGLISH message
--   text, so it is lc_messages-dependent. It cannot be keyed on SQLSTATE (both
--   states are 42501 — that is the whole problem) and PL/pgSQL cannot see the
--   error's internal identifier. Production runs lc_messages = en_US, and §2 has
--   already proven the same property from the catalogue, so a locale change
--   produces a spurious FAILURE (loud) rather than a spurious pass.
--
-- `insert ... default values` rather than a column list, deliberately: the ACL
-- check happens at executor start, BEFORE any column, constraint or RLS policy
-- is evaluated, so the probe cannot be derailed by a schema change to any of the
-- seventeen and cannot accidentally assert a NOT NULL instead of a privilege.
-- Non-destructive by construction: every probe is inside a subtransaction whose
-- every exit path is an exception, so a probe that unexpectedly SUCCEEDS is
-- rolled back before this block decides what to do about it.
do $$
declare
  c_tables constant text[] := array[
    'world_event_joins','world_event_pledges','world_event_totals',
    'clan_bans','clan_board','clan_invites','clan_ledger','clan_order_ballots',
    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',
    'clan_work_labour','clan_work_orders',
    'maintenance_alerts','maintenance_log'];
  t     text;
  g     text;
  v_msg text;
  v_n   int := 0;
begin
  foreach g in array array['anon','authenticated'] loop
    foreach t in array c_tables loop
      execute format('set local role %I', g);
      begin
        execute format('insert into public.%I default values', t);
        -- Reached ONLY if the write was permitted. Raise to unwind the
        -- subtransaction; the handler below turns it into the verdict.
        raise exception using errcode = 'HR002', message = 'THE WRITE WAS PERMITTED';
      exception
        when sqlstate 'HR002' then v_msg := 'PERMITTED';
        when others           then v_msg := sqlerrm;
      end;
      execute 'reset role';

      if v_msg = 'PERMITTED' then
        raise exception 'SWEEP-4 §3 FAILED: role % WROTE public.% after the revoke. The grant was '
                        'not the only thing standing there.', g, t;
      end if;
      if v_msg !~ 'permission denied for table' then
        raise exception 'SWEEP-4 §3 FAILED: role % was refused on public.% with "%" rather than a '
                        'PERMISSION error. If that is the row-level-security message, the table '
                        'grant is STILL PRESENT and RLS is the only thing holding the door — which '
                        'is the exact state this file exists to end.', g, t, v_msg;
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  raise notice 'SWEEP-4 §3: anon and authenticated are refused on all % (table, role) pairs with '
               '"permission denied for table" — the grant is gone, not merely out-voted by RLS.', v_n;
end $$;

-- ── 4. VERIFICATION (C) — THE DETECTOR REPORTS CLEAN, AND STILL SEES ──────
-- Three claims: none of the 17 is named in the report; the baseline no longer
-- carries a claim about any of them; and STRICT passes.
--
-- ⚠ AND THE CONTROL HAS TO CHANGE HERE, which is the one place this file cannot
--   copy batch 3. Batches 2 and 3 guarded against a blind check by asserting the
--   baseline was NOT EMPTY. THIS FILE EMPTIES IT — that is the point of it —
--   so that control would now fail on a database in perfect order, and
--   "loosen the assertion that fails" is exactly how a guard dies. The property
--   the old control was really about is "check (4) can still SEE a dead client
--   write grant", so that is what is asserted instead, the way batch 1's §5(C)
--   asserted it: create a probe table with RLS on, no policy and an
--   authenticated INSERT grant, and demand it is NAMED and FATAL. A control that
--   tests the check rather than the size of the exemption list.
do $$
declare
  c_tables constant text[] := array[
    'world_event_joins','world_event_pledges','world_event_totals',
    'clan_bans','clan_board','clan_invites','clan_ledger','clan_order_ballots',
    'clan_order_votes','clan_raids','clan_stores','clan_tavern','clan_withdrawals',
    'clan_work_labour','clan_work_orders',
    'maintenance_alerts','maintenance_log'];
  v jsonb; t text; v_n int; v_rows text;
begin
  v := public.hr_assert_grant_hygiene(false);
  foreach t in array c_tables loop
    if (v->'client_truncate_grants')::text like '%' || t || '%' then
      raise exception 'SWEEP-4 §4 FAILED: % is still named in the hygiene report: %',
        t, (v->'client_truncate_grants')::text;
    end if;
  end loop;

  select string_agg(table_name || ':' || grantee, ', ') into v_rows
    from public.hr_client_write_baseline where table_name = any (c_tables);
  if v_rows is not null then
    raise exception 'SWEEP-4 §4 FAILED: baseline row(s) survived the sweep (%). A baselined pair is '
                    'a standing exemption: re-granting that table later would be INVISIBLE to the '
                    'detector. The grant and the row come out together or neither does.', v_rows;
  end if;

  v := public.hr_assert_grant_hygiene(true);

  -- THE CONTROL. No exception handler around the probe's creation, on purpose:
  -- if anything below raises, the whole migration rolls back and the probe
  -- cannot survive it either.
  create table public.hr__sweep4_probe (id int primary key);
  alter table public.hr__sweep4_probe enable row level security;
  -- Born with the platform's default ACL — `grant all to anon, authenticated,
  -- service_role`, which is the mechanism that produced all 27 findings in the
  -- first place. Closed explicitly first, so the probe carries ONE grant.
  revoke all on public.hr__sweep4_probe from public, anon, authenticated, service_role;
  grant insert on public.hr__sweep4_probe to authenticated;

  v := public.hr_assert_grant_hygiene(false);
  if not ((v->'client_truncate_grants')::text like '%hr__sweep4_probe:authenticated:INSERT%') then
    raise exception 'SWEEP-4 §4 CONTROL FAILED — CHECK (4) IS BLIND: a table with RLS on, no write '
                    'policy and an authenticated INSERT grant was NOT reported. With the baseline '
                    'now EMPTY, every "clean" above would be clean because the check sees nothing '
                    'at all. report=%', (v->'client_truncate_grants')::text;
  end if;
  begin
    v := public.hr_assert_grant_hygiene(true);
    raise exception 'SWEEP-4 §4 CONTROL FAILED: strict mode returned normally with a dead client '
                    'write grant live. The nightly cron run would report success.';
  exception when others then
    if sqlerrm not like 'GRANT HYGIENE FAILED%' then raise; end if;
  end;
  revoke insert on public.hr__sweep4_probe from authenticated;
  drop table public.hr__sweep4_probe;

  v := public.hr_assert_grant_hygiene(true);

  select count(*) into v_n from public.hr_client_write_baseline;
  if v_n <> 0 then
    raise exception 'SWEEP-4 §4: the baseline still holds % pair(s) after the LAST batch: %. Either '
                    'batch 1 seeded something this chain never accounted for, or a new table joined '
                    'the class between the batches. Both need a human.', v_n,
                    (select string_agg(table_name || ':' || grantee, ', ')
                       from public.hr_client_write_baseline);
  end if;
  raise notice 'SWEEP-4 §4: GRANT HYGIENE STRICT PASSES; none of the 17 is named; THE BASELINE IS '
               'EMPTY; and check (4) still NAMES and RAISES on a freshly-created dead client write '
               'grant, so the empty baseline is an empty class and not a blind check.';
end $$;

-- The probe is created inside a do-block above; prove it is gone whichever path
-- ran. A probe left behind is a granted table nobody reviewed.
do $$
begin
  if to_regclass('public.hr__sweep4_probe') is not null then
    raise exception 'SWEEP-4: the §4 control probe survived this migration';
  end if;
  if exists (select 1 from public.hr_client_write_baseline where table_name like 'hr\_\_%') then
    raise exception 'SWEEP-4: a probe row survived in hr_client_write_baseline';
  end if;
end $$;

-- ── 5. WHAT WAS FIXED, SAID AT APPLY TIME ────────────────────────────────
do $$
declare v_n int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'CLIENT WRITE GRANT SWEEP BATCH 4 APPLIED — AND THE PROGRAMME IS COMPLETE. The '
               'twelve clan tables, the three world-event tables and the two maintenance tables no '
               'longer carry any client write privilege (MAINTAIN included), all 34 baseline rows '
               'are consumed, and public.hr_client_write_baseline now holds % row(s). Every one of '
               'the 27 tables batch 1 found in the dead-grant class has been swept rather than '
               'recorded.', v_n;
end $$;

-- ── 6. WHAT IS LEFT, AND WHO OWNS IT ─────────────────────────────────────
-- (1) ⚠ clan_members AND clans STILL TAKE CLIENT WRITES — the one live finding
--     this batch touched and did not fix, because it is not a dead grant and
--     therefore not a grant sweep's business:
--       clan_members  "join as self"    [INSERT to authenticated]
--                     "leave as self"   [DELETE to **public**]
--       clans         "clans creatable" [INSERT to authenticated]
--     Their WITH CHECK clauses are tight (pinned columns, a ±2-minute timestamp
--     bound, open-clan-only admission), so this is not the forge-anything hole
--     the market was — but a raw INSERT still bypasses the BAN LIST, the invite
--     bookkeeping, the clan_ledger journal and the rate limit, all four of which
--     live only inside clan_join(). 2026-08-12-clan-members-rls-drop.sql closes
--     it and is STAGED, NOT APPLIED: it refuses until production's clan_ledger
--     holds a kind='member' row, i.e. until a real player has joined through the
--     RPC on a deployed client. That count was 0 on production 2026-08-16.
--     Owner: the clan-membership programme. NOT this file, and NOT satisfied by
--     the replay drive in tests/client-write-sweep-4.mjs — a replay row is not a
--     production row, and pretending otherwise is how a precondition gets
--     satisfied by its own test.
--     ⚠ AND WHEN IT LANDS, clan_members and clans JOIN THE DEAD-GRANT CLASS the
--     moment their last write policy is dropped — unswept and unbaselined. §0(b2)
--     of this file REFUSES TO INSTALL in exactly that state, so a rebuild after
--     the drop stops loudly instead of leaving two tables the nightly detector
--     will raise on. Whoever applies the rls-drop owns a batch 5 for those two.
--
-- (2) ⚠ MAINTAIN ACROSS THE REST OF THE SCHEMA — still not done, and it is now
--     the largest remaining item. Batch 3 §7(2) measured 78 (table, grantee)
--     pairs in `public` holding MAINTAIN for anon or authenticated, of which it
--     removed 16 and this file removes 34 more. The rest are on tables OUTSIDE
--     the dead-grant class (they have write policies, so they are live tables),
--     and MAINTAIN on them is dead in the same way — PostgREST cannot issue
--     VACUUM / ANALYZE / CLUSTER / REINDEX / REFRESH MATERIALIZED VIEW. §7
--     re-measures it at apply time rather than repeating batch 3's number.
--
-- (3) ⚠ THE DETECTOR STILL CANNOT SEE MAINTAIN. check (4) of
--     hr_assert_grant_hygiene is built on information_schema.role_table_grants,
--     which reports SQL-standard privileges only. Batch 3 §8 scoped the takeover
--     and DEFERRED it with the measurement that made it a separate programme.
--     That deferral is now cheaper to end than it was: the blocker was that
--     widening the check would put dozens of unbaselined pairs into the class on
--     day one, and every table this programme swept is now out of it. The
--     remaining work is the schema-wide MAINTAIN revoke in (2) plus (4), THEN
--     the widening. Recommended as batch 5, in that order.
--
-- (4) ⚠ THE GENERATOR, which is upstream of this entire programme and is the
--     reason it will otherwise have to be run again. The schema default ACL on
--     production is
--         alter default privileges in schema public for role postgres
--           grant all on tables to anon, authenticated
--       -> pg_default_acl: {anon=arwdm/postgres, authenticated=arwdm/postgres}
--     Every NEW table in `public` is born with INSERT, UPDATE, DELETE and
--     MAINTAIN for both client roles, and joins the dead-grant class
--     automatically the moment RLS is enabled on it. **The baseline being empty
--     is a state, not a property.** The next table anybody creates re-opens the
--     class, and the only thing that catches it is check (4) raising nightly —
--     which is the correct outcome, and is also a defect report rather than a
--     defence. The cure is a fail-closed default ACL. It is a project-wide
--     posture change with its own review; named here so it is a decision.
--
-- (5) service_role. Still deliberately out of scope (batch 1 §header): Supabase's
--     platform default grants it every privilege on every table in `public`, so
--     including it would report all 40-odd tables and check (4) could never be
--     strict. A platform posture, not a migration.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_n int; v_m int; v_c int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  select count(*) into v_m from pg_class c
    cross join unnest(array['anon','authenticated']) gg
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
     and has_table_privilege(gg, c.oid, 'MAINTAIN');
  -- The live class, measured the way check (4) measures it. Zero is the whole
  -- point of this batch; it is reported rather than asserted here because §4
  -- already asserted it with a control that proves the check is not blind.
  select count(*) into v_c
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace
   where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
     and g.privilege_type in ('INSERT','UPDATE','DELETE') and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = g.table_name
                        and p.cmd in ('INSERT','UPDATE','DELETE','ALL'));
  raise notice 'SWEEP-4 §6: % dead client write pair(s) remain BASELINED and % pair(s) are in the '
               'live dead-grant class — both should be ZERO, and the programme batch 1 opened is '
               'finished. Separately, % (table, grantee) pair(s) in `public` still hold MAINTAIN, '
               'the privilege check (4) cannot see, on tables outside the class. That plus the '
               'fail-closed default ACL is batch 5, NOT this file.', v_n, v_c, v_m;
end $$;
