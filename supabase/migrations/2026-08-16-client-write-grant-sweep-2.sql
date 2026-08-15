-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CLIENT WRITE GRANT SWEEP, BATCH 2:
--                    display_names + leaderboard_meta
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Predecessor: 2026-08-16-client-write-grant-sweep.sql (batch 1 — six castle/
--                hunt catalogues revoked, 21 pairs baselined, check (4) widened).
--                Its §7 names this sweep and its protocol: BATCHES, each batch
--                removing its baseline rows in the SAME migration as its revokes,
--                each with the writer CONFIRMED rather than assumed.
--   Graded by:   tests/client-write-sweep-2.mjs (behavioural, on the replay, with
--                a mutation catalogue: --selftest must catch every entry)
--   Detector:    public.hr_assert_grant_hygiene(boolean) — NOT TOUCHED by this
--                file. This is grants + baseline rows only, so the derivation
--                chain (tools/derive-grant-hygiene.mjs, PART 1f-ii) is not in
--                play and §0 asserts the body it depends on rather than
--                replacing it.
--
-- ── WHY THESE TWO FIRST ─────────────────────────────────────────────────
-- Of the 21 baselined pairs these are the two with a CROSS-PLAYER IDENTITY OR
-- RANKING surface, which is the axis the sweep is ranked on — blast radius, not
-- cleverness. The grants are dead today (RLS is on, and the ONLY policy on each
-- table is `for select using (true)`), so the finding is not "a client can write
-- them" — it is that each is ONE POLICY away from being writable, and the policy
-- in question is one somebody would plausibly add:
--
--   · display_names — the namespace that makes a player NAME an ADDRESS
--     (2026-08-08-unique-names.sql's whole thesis). It carries anon+authenticated
--     INSERT/UPDATE/DELETE. Add the obvious-looking "let a player rename
--     themselves without a round trip" policy — `for update using (user_id =
--     auth.uid())` — and the client can write `canonical`/`name` DIRECTLY,
--     bypassing hr_validate_display_name entirely: the reserved list (admin, gm,
--     moderator, hearthrise, staff…), the 3–20 length bound and the charset rule
--     are ALL enforced inside claim_display_name and NOWHERE ELSE. That is
--     impersonation, in the one field every social surface in the game addresses
--     a player by. Widen the same policy to `for all using (true)` — the exact
--     mistake this codebase has already shipped twice (raid_contributions'
--     "own contribution claim" UPDATE, clan_members' `for all`) — and DELETE
--     frees ANOTHER player's name for a squatter.
--   · leaderboard_meta — one row, one column: refreshed_at. It is the staleness
--     gate of the entire board system (hr_leaderboard_refresh returns early
--     while `now() - refreshed_at < 5 minutes`). A client that can UPDATE it can
--     pin refreshed_at at now() forever and FREEZE ALL 21 BOARDS at whatever
--     ranks they held — freeze yourself at #1, or deny a rival the rank they
--     just earned. One UPDATE, whole-population ranking blast radius, and
--     nothing anywhere would log it.
--
-- Neither table needs a client write for anything. Confirmed, not assumed —
-- §0(c) below re-derives the writer set from pg_proc ON THE DATABASE BEING
-- MIGRATED rather than from this comment.
--
-- ── THE CONFIRMED WRITERS (the claim this file rests on) ─────────────────
--   display_names    → public.claim_display_name(text) [SECURITY DEFINER,
--                      grant execute to authenticated only], via its A9 wrapper
--                      over claim_display_name__ungated(text). Nothing else in
--                      pg_proc references the table in a DML statement; no
--                      trigger, no rule, no updatable view routes into it; the
--                      only other mutation path is the ON DELETE CASCADE from
--                      auth.users, which is the platform's and needs no grant in
--                      `public`. The browser's only contact with the table is a
--                      SELECT (src/features/identity.js:466,
--                      `display_names?select=name,canonical&user_id=eq.<uid>`).
--   leaderboard_meta → public.hr_leaderboard_refresh(boolean) [SECURITY DEFINER;
--                      on production it is executable by NEITHER anon NOR
--                      authenticated — it is reached only from inside
--                      hr_leaderboard__ungated and from pg_cron]. One UPDATE,
--                      one row, `set refreshed_at = now()`.
-- Both are SECURITY DEFINER and owned by the table owner, so both keep working
-- with every client grant gone. §0(d) asserts that ownership rather than
-- trusting it, and §3 PROVES the door is shut by EXECUTING against it.
--
-- ── ⚠ MAINTAIN, AND WHY THE PREDECESSOR'S "0 REMAIN" WAS BLIND ──────────
-- Production is PostgreSQL 17.6 and the live ACL on both tables is
--   {postgres=arwdDxtm/postgres, anon=arwdm/postgres, authenticated=arwdm/postgres, …}
-- `m` is MAINTAIN (new in PG17: VACUUM / ANALYZE / CLUSTER / REINDEX / REFRESH
-- MATERIALIZED VIEW). It is granted to anon and authenticated by Supabase's
-- default ACL like everything else — and **information_schema.role_table_grants
-- CANNOT SEE IT**, because information_schema reports SQL-standard privileges
-- only. Every measurement in the predecessor — its §1 "0 remain" assertion, its
-- §2 class predicate, and check (4) of the detector itself — is built on
-- information_schema, so a table can be swept, report zero client privileges,
-- and still carry MAINTAIN for both client roles. Batch 1's six catalogues are
-- in exactly that state right now.
--
-- So this file revokes MAINTAIN too, and — more importantly — it does its own
-- verification through **has_table_privilege() over the FULL PG17 privilege
-- vocabulary** (§2), which is the only enumeration that can see it. That is a
-- deliberate departure from the predecessor's measurement and it is the reason
-- this file's §2 does not simply re-run the predecessor's count.
--
-- Blast radius of the MAINTAIN grant itself, stated honestly rather than
-- inflated: anon and authenticated are NOLOGIN roles reachable only through
-- PostgREST, and PostgREST cannot issue VACUUM/ANALYZE/REFRESH. It is therefore
-- DEAD in the same way the INSERT grant is dead — unreachable until something
-- changes — which is precisely why it belongs in a sweep whose whole subject is
-- dead grants. It is NOT a live finding and this file does not claim it is.
-- Handed to the Coordinator as a note for batches 2+: the other 19 tables and
-- batch 1's six all still carry it.
--
-- SELECT IS NOT REVOKED, and must not be. display_names is read by the client
-- to resolve its own claim (identity.js) and both tables are world-readable by
-- the design of their own migrations. Who may READ them is not this file's
-- business; who may WRITE them is.
--
-- REVERSIBILITY (should never be needed; the grants are dead)
--   grant insert, update, delete, maintain on public.display_names, public.leaderboard_meta
--     to anon, authenticated;
--   insert into public.hr_client_write_baseline (table_name, grantee, note) values
--     ('display_names','anon','restored'), ('display_names','authenticated','restored'),
--     ('leaderboard_meta','anon','restored'), ('leaderboard_meta','authenticated','restored');
--   Nothing else is touched: no function body, no policy, no player row, no
--   detector. In particular the PREDECESSOR IS NOT EDITED — see §5.
--
-- APPLY ORDER: … → 2026-08-16-client-write-grant-sweep.sql → THIS FILE.
--
-- SAFE TO RE-RUN? **NO, AND DELIBERATELY SO.** §1(b) REFUSES to install if a
-- baseline row it is supposed to delete is already absent, because that means
-- somebody else swept this pair and this file no longer knows what state it is
-- reasoning about. A re-run is therefore a loud stop, not a silent no-op. That
-- is the opposite of the predecessor's posture and it is on purpose: the
-- predecessor SEEDS a list (idempotent by nature), this one CONSUMES it.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — REFUSE TO INSTALL ON A DATABASE THIS IS NOT TRUE OF ──
do $$
declare
  c_tables constant text[] := array['display_names','leaderboard_meta'];
  t        text;
  v_src    text;
  v_n      int;
  v_bad    text;
  v_owner  oid;
begin
  -- (a) THE PREDECESSOR RAN, and check (4) is the WIDENED one. Without the
  --     widening the class this file is emptying does not exist as a concept,
  --     and §4's "reports clean" would be clean for the wrong reason.
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

  -- (b) THE TABLES EXIST AND ARE STILL SHAPED THE WAY THE CLAIM ASSUMES.
  --     RLS ON, and NO write policy. If a write policy has appeared since batch
  --     1, the grant is NO LONGER DEAD — revoking it would break a live feature,
  --     and the correct answer is a human, not this file.
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
                      'grant this file calls dead is therefore LIVE, something intends to use it, '
                      'and revoking it would break that path. Review the policy first.', t, v_bad;
    end if;
  end loop;

  -- (c) THE WRITER IS CONFIRMED ON THIS DATABASE, NOT IN THIS COMMENT.
  --     Re-derived from pg_proc: the set of functions whose body contains a DML
  --     statement against the table must be exactly the SECURITY DEFINER RPC
  --     named in the header (plus its __ungated body, plus the detector, which
  --     only ever names the table as a string). Anything else — a new writer, a
  --     writer that stopped being SECURITY DEFINER — invalidates the claim.
  select string_agg(x.fn, ', ' order by x.fn) into v_bad from (
    select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?display_names'
       and p.proname not in ('claim_display_name','claim_display_name__ungated',
                             'hr_assert_grant_hygiene')) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: public.display_names has writer(s) this file does not '
                    'know about: %. The header claims claim_display_name is the only one; that '
                    'claim is now false and the sweep has not been reviewed against reality.', v_bad;
  end if;
  select string_agg(x.fn, ', ' order by x.fn) into v_bad from (
    select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?leaderboard_meta'
       and p.proname not in ('hr_leaderboard_refresh','hr_leaderboard_refresh__ungated',
                             'hr_assert_grant_hygiene')) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: public.leaderboard_meta has writer(s) this file does not '
                    'know about: %.', v_bad;
  end if;

  -- ⚠ A POSITIVE CONTROL ON THAT SCAN. The two regexes above are written to
  --   find NOTHING; a regex that has stopped matching anything at all also
  --   finds nothing, and would pass both checks while seeing zero writers. So
  --   assert the KNOWN writers ARE matched by the same expressions.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname like 'claim_display_name%'
                    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?display_names') then
    raise exception 'THE WRITER SCAN IS BLIND (positive control): claim_display_name is not matched '
                    'by the very expression used to decide nothing else writes display_names.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname like 'hr_leaderboard_refresh%'
                    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?leaderboard_meta') then
    raise exception 'THE WRITER SCAN IS BLIND (positive control): hr_leaderboard_refresh is not '
                    'matched by the expression used to decide nothing else writes leaderboard_meta.';
  end if;

  -- (d) THE WRITERS SURVIVE THE REVOKE — asserted structurally here, and PROVEN
  --     behaviourally on the replay by tests/client-write-sweep-2.mjs. A
  --     SECURITY DEFINER function executes as its OWNER, so the property is:
  --     the owner holds the write privileges, and the function is really
  --     SECURITY DEFINER. Both, by name, because either alone is worthless.
  for t, v_bad in
    select 'display_names', 'claim_display_name' union all
    select 'leaderboard_meta', 'hr_leaderboard_refresh'
  loop
    select p.proowner into v_owner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_bad || '__ungated'
     limit 1;
    if v_owner is null then
      select p.proowner into v_owner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_bad limit 1;
    end if;
    if v_owner is null then
      raise exception 'REFUSING TO INSTALL: the confirmed writer public.% does not exist on this '
                      'database, so "the writer still works after the revoke" is untestable.', v_bad;
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in (v_bad, v_bad || '__ungated')
                  and not p.prosecdef) then
      raise exception 'REFUSING TO INSTALL: public.% is not SECURITY DEFINER. It would then execute '
                      'as the CALLER, and revoking the caller''s grants is exactly what breaks '
                      'it.', v_bad;
    end if;
    if not has_table_privilege(v_owner::regrole::text, 'public.' || quote_ident(t),
                               'INSERT, UPDATE, DELETE') then
      raise exception 'REFUSING TO INSTALL: %, the owner of the confirmed writer of public.%, does '
                      'not hold INSERT/UPDATE/DELETE on it. Revoking the client grants would leave '
                      'the table with NO writer at all.', v_owner::regrole::text, t;
    end if;
  end loop;

  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'SWEEP-2 §0 PASSED: the predecessor is applied (% baselined pair(s)), both tables '
               'have RLS on with SELECT-only policies, and the confirmed writers '
               '(claim_display_name, hr_leaderboard_refresh) are SECURITY DEFINER and owned by a '
               'role that keeps its write privileges.', v_n;
end $$;

-- ── 1. THE SWEEP — revoke, and CONSUME the baseline rows in the same file ──
do $$
declare
  c_tables constant text[] := array['display_names','leaderboard_meta'];
  c_pairs  constant text[][] := array[
    ['display_names','anon'],    ['display_names','authenticated'],
    ['leaderboard_meta','anon'], ['leaderboard_meta','authenticated']];
  t        text;
  -- NB: no `i` variable. `generate_subscripts(...) i` below is a RANGE ALIAS,
  -- and a PL/pgSQL variable of the same name makes every reference to it
  -- ambiguous — which Postgres reports as an error at execution, not at create
  -- time, so it fails on the apply rather than in review.
  v_before text;
  v_missing text;
  v_deleted int;
begin
  -- What we are about to remove, named at apply time. Through has_table_privilege
  -- rather than information_schema — see the MAINTAIN note in the header.
  select string_agg(x.k, ', ' order by x.k) into v_before from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(c_tables) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
                              'TRIGGER','MAINTAIN']) pp
     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;

  -- (a) THE REVOKE. Enumerated, not `revoke all`, because SELECT must survive:
  --     both tables are world-readable by the design of their own migrations.
  --     MAINTAIN is included and is the privilege the predecessor's measurement
  --     could not see; it is guarded on server version because it does not
  --     exist before PG17 and naming it there is a syntax error, not a no-op.
  foreach t in array c_tables loop
    execute format('revoke insert, update, delete, truncate, references, trigger '
                   'on public.%I from public, anon, authenticated', t);
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on public.%I from public, anon, authenticated', t);
    end if;
  end loop;

  -- (b) THE BASELINE ROWS, DELETED — and REFUSING TO INSTALL IF ONE IS ABSENT.
  --     An absent row means somebody else already swept this pair, so this file
  --     is reasoning about a state that no longer exists. Checked BEFORE the
  --     delete so the message can name which pair, and the whole migration
  --     rolls back (including the revokes above) on the raise.
  select string_agg(c_pairs[i][1] || ':' || c_pairs[i][2], ', ') into v_missing
    from generate_subscripts(c_pairs, 1) i
   where not exists (select 1 from public.hr_client_write_baseline b
                      where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2]);
  if v_missing is not null then
    raise exception 'REFUSING TO INSTALL: baseline row(s) this file is supposed to DELETE are '
                    'already absent: %. Either this migration has already been applied (it is '
                    'NOT safe to re-run, by design — see the header) or another batch swept the '
                    'same pair. Both mean this file no longer knows what state it is changing. '
                    'Reconcile by hand.', v_missing;
  end if;

  delete from public.hr_client_write_baseline b
   using generate_subscripts(c_pairs, 1) i
   where b.table_name = c_pairs[i][1] and b.grantee = c_pairs[i][2];
  get diagnostics v_deleted = row_count;
  if v_deleted <> array_length(c_pairs, 1) then
    raise exception 'SWEEP-2 §1(b): expected to delete % baseline row(s), deleted %. The list and '
                    'the table disagree about their own primary key.', array_length(c_pairs,1), v_deleted;
  end if;

  raise notice 'SWEEP-2 §1: revoked [%]; % baseline row(s) consumed.',
    coalesce(v_before, '(none — nothing to revoke, which is itself worth reading twice)'), v_deleted;
end $$;

-- ── 2. VERIFICATION (A) — NOTHING SURVIVES, MEASURED THE WAY THAT CAN SEE ──
-- has_table_privilege over the FULL PG17 vocabulary, not information_schema.
-- If this file had verified itself the way the predecessor did, MAINTAIN would
-- have survived on both tables and the report would have said "0 remain".
do $$
declare v_left text; v_sel int;
begin
  select string_agg(x.k, ', ' order by x.k) into v_left from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(array['display_names','leaderboard_meta']) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
                              'TRIGGER','MAINTAIN']) pp
     where has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;
  if v_left is not null then
    raise exception 'SWEEP-2 §2(A) FAILED: client privilege(s) survive the revoke: %', v_left;
  end if;

  -- SELECT MUST STILL BE THERE. A sweep that quietly took the read with it
  -- would break the name lookup in src/features/identity.js and the boards, and
  -- would do it silently — nothing in this file's own checks would notice.
  select count(*) into v_sel from (
    select 1 from unnest(array['display_names','leaderboard_meta']) tt
      cross join unnest(array['anon','authenticated']) gg
     where has_table_privilege(gg, 'public.' || quote_ident(tt), 'SELECT')) z;
  if v_sel <> 4 then
    raise exception 'SWEEP-2 §2(A) FAILED: SELECT was collaterally revoked (% of 4 remain). These '
                    'tables are world-readable by design — display_names is READ by the client to '
                    'resolve its own claim.', v_sel;
  end if;
  raise notice 'SWEEP-2 §2(A): zero client write privileges remain on either table (measured over '
               'the full PG17 vocabulary, MAINTAIN included); all 4 SELECT grants intact.';
end $$;

-- ── 3. VERIFICATION (B) — THE DOOR IS SHUT, PROVEN BY EXECUTION ───────────
-- A catalogue assertion says what the catalogue says. This ATTEMPTS THE WRITE
-- as the client roles and reads the refusal back.
--
-- ⚠ THE CONTROL THAT MAKES IT MEAN ANYTHING. Before the revoke these INSERTs
--   already failed — on ROW-LEVEL SECURITY, which raises the SAME SQLSTATE
--   (42501) as a missing grant. So "it failed" proves nothing on its own and a
--   test that only asserted 42501 would have passed against an un-swept
--   database. The two are distinguished by MESSAGE: "permission denied for
--   table x" (the grant is gone) vs "new row violates row-level security
--   policy" (the grant is there and RLS is the only thing holding it). This
--   block demands the FORMER, i.e. it can tell the post state from the pre
--   state. The matching pre-state arm — same probe, un-swept database, must
--   report the RLS message — is in tests/client-write-sweep-2.mjs, where it can
--   be run against a database that has NOT had this file applied.
--
-- ⚠ RESIDUAL, stated rather than hidden: this match is on the ENGLISH message
--   text, so it is lc_messages-dependent. It cannot be keyed on SQLSTATE (both
--   states are 42501 — that is the whole problem) and PL/pgSQL cannot see the
--   error's internal identifier. Production runs lc_messages = en_US, and §2
--   above has already proven the same property from the catalogue, so a locale
--   change would produce a spurious FAILURE (loud) rather than a spurious pass.
--   That is the correct direction for it to be wrong in.
--
-- Non-destructive by construction: every probe is inside a subtransaction whose
-- every exit path is an exception, so a probe that unexpectedly SUCCEEDS is
-- rolled back before this block decides what to do about it.
do $$
declare
  t     text;
  g     text;
  v_msg text;
begin
  foreach g in array array['anon','authenticated'] loop
    foreach t in array array['display_names','leaderboard_meta'] loop
      execute format('set local role %I', g);
      begin
        if t = 'display_names' then
          insert into public.display_names (canonical, user_id, name)
            values ('hr  sweep2 probe', '00000000-0000-0000-0000-000000000000'::uuid, 'probe');
        else
          insert into public.leaderboard_meta (id, refreshed_at) values (1, now());
        end if;
        -- Reached ONLY if the write was permitted. Raise to unwind the
        -- subtransaction; the handler below turns it into the verdict.
        raise exception using errcode = 'HR002', message = 'THE WRITE WAS PERMITTED';
      exception
        when sqlstate 'HR002' then v_msg := 'PERMITTED';
        when others           then v_msg := sqlerrm;
      end;
      execute 'reset role';

      if v_msg = 'PERMITTED' then
        raise exception 'SWEEP-2 §3 FAILED: role % WROTE public.% after the revoke. The grant was '
                        'not the only thing standing there.', g, t;
      end if;
      if v_msg !~ 'permission denied for table' then
        raise exception 'SWEEP-2 §3 FAILED: role % was refused on public.% with "%" rather than a '
                        'PERMISSION error. If that is the row-level-security message, the table '
                        'grant is STILL PRESENT and RLS is the only thing holding the door — which '
                        'is the exact state this file exists to end.', g, t, v_msg;
      end if;
    end loop;
  end loop;
  raise notice 'SWEEP-2 §3: anon and authenticated are refused on BOTH tables with "permission '
               'denied for table" — the grant is gone, not merely out-voted by RLS.';
end $$;

-- ── 4. VERIFICATION (C) — THE WIDENED DETECTOR REPORTS CLEAN ──────────────
-- Three claims: neither table is named anywhere in the report; STRICT passes;
-- and the baseline no longer carries a claim about either of them (a row left
-- behind is a permanent, silent exemption for a table that no longer needs one
-- — and the NEXT time somebody re-grants it, the detector would say nothing).
do $$
declare v jsonb; t text; v_n int; v_rows text;
begin
  v := public.hr_assert_grant_hygiene(false);
  foreach t in array array['display_names','leaderboard_meta'] loop
    if v::text like '%' || t || '%' then
      raise exception 'SWEEP-2 §4 FAILED: % is still named in the hygiene report: %', t, v::text;
    end if;
  end loop;

  select string_agg(table_name || ':' || grantee, ', ') into v_rows
    from public.hr_client_write_baseline
   where table_name in ('display_names','leaderboard_meta');
  if v_rows is not null then
    raise exception 'SWEEP-2 §4 FAILED: baseline row(s) survived the sweep (%). A baselined pair '
                    'is a standing exemption: re-granting that table later would be INVISIBLE to '
                    'the detector. The grant and the row come out together or neither does.', v_rows;
  end if;

  v := public.hr_assert_grant_hygiene(true);

  -- ⚠ A CONTROL, the same one the predecessor's §2 insisted on. If the class is
  --   now EMPTY the two assertions above are vacuous — they would pass on a
  --   database where the predicate stopped matching anything.
  --   ⚠ NO COUNT IS ASSERTED HERE, deliberately (CLAUDE.md b339: three separate
  --   wrong numbers have shipped in prose about this allowlist, and an
  --   assertion written from one fails spuriously and gets loosened). Batches
  --   may interleave and batch 3 will change it. ZERO is the only value that
  --   means the check has gone blind, so ZERO is the only value asserted. The
  --   exact arithmetic — the baseline shrank by precisely the four rows this
  --   file consumed, measured against the PREDECESSOR'S OWN declared list — is
  --   in tests/client-write-sweep-2.mjs arm C6, where it is derived rather than
  --   typed.
  select count(*) into v_n from public.hr_client_write_baseline;
  if v_n = 0 then
    raise exception 'SWEEP-2 §4: the baseline is EMPTY. Either every remaining batch has been swept '
                    '(excellent, and not something to discover silently) or something truncated it. '
                    'Until it is empty legitimately, an empty baseline makes §4''s checks vacuous.';
  end if;
  raise notice 'SWEEP-2 §4: GRANT HYGIENE STRICT PASSES; neither table is named; % baselined '
               'pair(s) remain for batches 3+.', v_n;
end $$;

-- ── 5. WHY THE PREDECESSOR IS NOT EDITED ──────────────────────────────────
-- 2026-08-16-client-write-grant-sweep.sql's §2 warning says "delete those rows
-- from c_expected in this file". DO NOT, and the reason is mechanical rather
-- than stylistic: on a REBUILD the predecessor applies BEFORE this file, at
-- which point display_names and leaderboard_meta are still IN the dead-grant
-- class. Its §2(a) raises on any class member the list does not name — so
-- removing the four pairs there turns every future replay of the chain RED at
-- the predecessor, one file before the sweep that justifies it.
--
-- The designed behaviour on a re-run of the predecessor AFTER this file is
-- exactly right and needs no edit: §2(b) emits a WARNING naming the four pairs
-- as "no longer in the class — somebody swept them", and §2(c)'s seed skips
-- them because it only seeds pairs that are actually in the class. So the rows
-- do NOT come back. Asserted rather than believed:
-- tests/client-write-sweep-2.mjs arm `predecessor_rerun`.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'CLIENT WRITE GRANT SWEEP BATCH 2 APPLIED. display_names and leaderboard_meta — '
               'the two cross-player identity/ranking surfaces of the 21 — no longer carry any '
               'client write privilege (MAINTAIN included), their baseline rows are consumed, and '
               '% pair(s) remain: clan_* (12), world_event_* (3), raid_* (2), maintenance_* (2). '
               'Those are batches 3+ and are NOT this file.', v_n;
end $$;
