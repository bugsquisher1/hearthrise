-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CLIENT WRITE GRANT SWEEP, BATCH 3:
--                    raid_claims + raid_contributions,
--                    and the MAINTAIN pass over BATCH 1's six catalogues
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Predecessors: 2026-08-16-client-write-grant-sweep.sql   (batch 1 — six
--                 castle/hunt catalogues revoked, 21 pairs baselined, check (4)
--                 widened; it creates the baseline this file CONSUMES from)
--                 2026-08-16-client-write-grant-sweep-2.sql (batch 2 — the two
--                 cross-player identity/ranking surfaces; the protocol this file
--                 follows verbatim, and the file that first revoked MAINTAIN)
--   Graded by:    tests/client-write-sweep-3.mjs (behavioural, on the replay,
--                 with a mutation catalogue: --selftest must catch every entry)
--   Detector:     public.hr_assert_grant_hygiene(boolean) — NOT TOUCHED by this
--                 file. Grants and baseline rows only, so the derivation chain
--                 (tools/derive-grant-hygiene.mjs, PART 1f-ii) is not in play
--                 and §0 ASSERTS the body it depends on rather than replacing
--                 it. §8 records WHY the detector takeover was DEFERRED, with
--                 the measurement that made it a separate program.
--
-- ── PART A · WHY THE raid_* TABLES ARE NEXT ─────────────────────────────
-- Batch 2's reviewer ranked the remaining 17 tables and put raid_* first, for a
-- reason that is historical rather than theoretical: **raid_contributions is
-- the one table in the baseline that has ALREADY HOSTED A LIVE CLIENT-WRITE
-- EXPLOIT.** The b209 design shipped an "own contribution claim" UPDATE policy
-- — `for update using (auth.uid() = user_id)` — so a player flipped their own
-- `claimed` flag from the browser and the client then paid the chest. It was
-- removed by 2026-08-08-raid-hardening.sql. The GRANT it stood on was never
-- removed, and it is still there today:
--
--     raid_claims        anon=arwdm/postgres  authenticated=arwdm/postgres
--     raid_contributions anon=arwdm/postgres  authenticated=arwdm/postgres
--                        (measured on production, 2026-08-16)
--
-- So this is not a table that MIGHT one day get a write policy. It is a table
-- that HAD one, that had it deliberately taken away, and whose grant survived
-- the removal — which makes "somebody re-adds the policy" the likeliest of the
-- 17 by a distance. What that would restore, precisely:
--   · raid_contributions.damage / strikes — the numbers raid_claim__ungated
--     reads to decide a BAND, and (in the partial-kill path) the numbers it
--     SUMS ACROSS THE WHOLE CLAN to compute v_factor. A forged damage row
--     therefore changes how much SOMEBODY ELSE is paid. That is the exact
--     cross-player property CLAUDE.md's server-authority rule names.
--   · raid_contributions.claimed / claimed_at — the b209 exploit verbatim.
--   · raid_claims — the (user_id, week_key) chest ledger. DELETE on it is
--     UNLIMITED WEEKLY CHEST REPLAY: raid_claim__ungated's whole idempotency is
--     `on conflict (user_id, week_key) do nothing` + `row_count = 0 →
--     already_claimed`. Delete the row, claim again. There is no second ledger.
--
-- ⚠ AND THE CLIENT STILL REACHES FOR IT. src/features/raids.js:1023
--   `legacyClanClaim()` PATCHes raid_contributions directly
--   (`?...&claimed=eq.false` → `{claimed:true}`) and grants the chest on the
--   returned row count. Its own comment says it is dead once the hardening
--   migration ran, and it is: the branch is reached only when the raid_claim
--   RPC answers 404 ('unsupported'), which on production it does not. Today the
--   PATCH would return 200 with `[]` (RLS makes zero rows visible for UPDATE);
--   after this file it returns 403. THE CLIENT HANDLES BOTH IDENTICALLY —
--   `res.ok ? await res.json() : []` → `flipped.length === 0` → the
--   no_contribution notice → `return false`. No client change is needed and no
--   behaviour moves. Stated because "no code calls it" was checked, not assumed,
--   and because the one call site that exists changes HTTP status here.
--
-- ── THE CONFIRMED WRITERS (the claim this file rests on) ─────────────────
--   raid_claims        → public.raid_claim__ungated(text,uuid,text)
--   raid_contributions → public.raid_claim__ungated(text,uuid,text)   (the
--                        `set claimed = true` after a paid chest)
--                        public.raid_strike__ungated(uuid,text,text,bigint,bigint)
-- Both are SECURITY DEFINER, owned by the table owner, and reached ONLY through
-- their A9 wrappers raid_claim(text,uuid,text) / raid_strike(uuid,…), which are
-- the client-callable, rate-gated names. Measured on production 2026-08-16 with
-- a FULL pg_proc.prosrc scan: no other function contains a DML statement against
-- either table, no non-internal trigger fires on either, no rule rewrites either,
-- and no view or materialised view depends on either. §0(c) RE-DERIVES all four
-- of those on the database being migrated rather than trusting this comment, and
-- carries a POSITIVE CONTROL so a regex that has stopped matching anything
-- cannot report "no unknown writers".
--
-- ── PART B · THE MAINTAIN PASS OVER BATCH 1's SIX ───────────────────────
-- Batch 1 swept hr_castle_board_tasks, hr_castle_buildings, hr_castle_items,
-- hr_castle_tiers, hr_hunt_bosses and hr_hunt_tiers, verified itself through
-- `information_schema.role_table_grants`, and reported "0 remain". Measured on
-- production 2026-08-16, all twelve pairs still hold MAINTAIN:
--
--     hr_castle_board_tasks anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--     hr_castle_buildings   anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--     hr_castle_items       anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--     hr_castle_tiers       anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--     hr_hunt_bosses        anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--     hr_hunt_tiers         anon=MAINTAIN,SELECT  authenticated=MAINTAIN,SELECT
--
-- `m` is MAINTAIN (VACUUM / ANALYZE / CLUSTER / REINDEX / REFRESH MATERIALIZED
-- VIEW), new in PostgreSQL 17. **information_schema reports SQL-standard
-- privileges only and CANNOT SEE IT**, so batch 1's §1 count, its §2 class
-- predicate and check (4) of the detector are all blind to it. Batch 1's report
-- was true of the instrument and false of the database.
--
-- ⚠ THE INSTRUMENT IS THE FIX, not the enumeration. This file does not simply
--   type MAINTAIN into a longer list — a longer list goes stale the same way the
--   short one did. §0(e) DERIVES the privilege vocabulary from the server itself
--   (`aclexplode(acldefault('r', <owner>))`) and REFUSES TO INSTALL if the
--   server knows a table privilege this file does not enumerate. On PG17/18 that
--   is exactly {SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
--   MAINTAIN}; on a future major that adds one, this file stops rather than
--   quietly sweeping seven eighths of the surface and reporting success.
--
-- Blast radius of the MAINTAIN grant itself, stated honestly rather than
-- inflated: anon and authenticated are NOLOGIN roles reachable only through
-- PostgREST, and PostgREST cannot issue VACUUM / ANALYZE / CLUSTER / REINDEX /
-- REFRESH MATERIALIZED VIEW. It is DEAD in exactly the way the INSERT grant on
-- a policy-less table is dead — which is why it belongs in a sweep whose whole
-- subject is dead grants. It is NOT a live finding and this file does not claim
-- it is.
--
-- SELECT IS NOT REVOKED ANYWHERE IN THIS FILE, and must not be. The six are
-- world-readable content catalogues the client renders from, and the client
-- READS raid_contributions directly (src/features/raids.js:719, the Hunt
-- roster: `?select=user_id,damage,strikes`). Who may READ these tables is not
-- this file's business; who may WRITE them is.
--
-- REVERSIBILITY (should never be needed; every grant here is dead)
--   grant insert, update, delete, maintain
--     on public.raid_claims, public.raid_contributions to anon, authenticated;
--   grant maintain on public.hr_castle_board_tasks, public.hr_castle_buildings,
--     public.hr_castle_items, public.hr_castle_tiers, public.hr_hunt_bosses,
--     public.hr_hunt_tiers to anon, authenticated;
--   insert into public.hr_client_write_baseline (table_name, grantee, note) values
--     ('raid_claims','anon','restored'), ('raid_claims','authenticated','restored'),
--     ('raid_contributions','anon','restored'), ('raid_contributions','authenticated','restored');
--   Nothing else is touched: no function body, no policy, no player row, no
--   detector, and NEITHER PREDECESSOR IS EDITED — see batch 2's §5 for the
--   mechanical reason (a rebuild applies them BEFORE this file, when the pairs
--   are still in the class).
--
-- APPLY ORDER: … → 2026-08-16-client-write-grant-sweep.sql
--                → 2026-08-16-client-write-grant-sweep-2.sql → THIS FILE.
--   Batch 1 is a HARD predecessor (this file consumes rows it seeds and asserts
--   the check (4) it installs). Batch 2 is NOT mechanically required — it
--   touches different tables — so §0(f) reports its state as a NOTICE rather
--   than refusing. Stated so the absence of a refusal is a decision.
--
-- SAFE TO RE-RUN? **NO, AND DELIBERATELY SO**, exactly as batch 2. §1(b)
-- REFUSES if a baseline row it is supposed to delete is already absent, and
-- §2(a) REFUSES if one of batch 1's six has regained a non-MAINTAIN client write
-- privilege. A re-run is a loud stop, not a silent no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — REFUSE TO INSTALL ON A DATABASE THIS IS NOT TRUE OF ──
do $$
declare
  c_tables constant text[] := array['raid_claims','raid_contributions'];
  c_six    constant text[] := array[
    'hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
    'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers'];
  -- The FULL table-privilege vocabulary this file claims to enumerate. §0(e)
  -- checks it against what the SERVER knows, which is the whole point.
  c_vocab  constant text[] := array['SELECT','INSERT','UPDATE','DELETE',
                                    'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
  t        text;
  v_src    text;
  v_n      int;
  v_bad    text;
  v_owner  oid;
  v_srv    text[];
begin
  -- (a) BATCH 1 RAN, and check (4) is the WIDENED one. Without the widening the
  --     class this file is emptying does not exist as a concept, and §5's
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
                    'hr_client_write_baseline, so check (4) is the PRE-WIDENING body. §5 of this '
                    'file would then report "clean" because the check cannot see the class at all. '
                    'Apply 2026-08-16-client-write-grant-sweep.sql.';
  end if;

  -- (b) THE TABLES EXIST AND ARE STILL SHAPED THE WAY THE CLAIM ASSUMES.
  --     RLS ON, and NO write policy. raid_contributions is the table this
  --     codebase has ALREADY shipped a client write policy on ("own
  --     contribution claim", b209), so a policy having reappeared is not a
  --     hypothetical here — and if one has, the grant is NOT dead, revoking it
  --     breaks a live path, and the correct answer is a human, not this file.
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
                      'and revoking it would break that path. On raid_contributions specifically '
                      'that policy is the b209 "own contribution claim" exploit returning — review '
                      'it before anything else.', t, v_bad;
    end if;
  end loop;

  -- (c) THE WRITERS ARE CONFIRMED ON THIS DATABASE, NOT IN THIS COMMENT.
  --     FOUR populations, because "the writer" is not only a function:
  --       (i)   pg_proc bodies containing a DML statement against the table
  --       (ii)  non-internal triggers on the table
  --       (iii) rules rewriting the table
  --       (iv)  views / matviews depending on it (an updatable view is a writer
  --             that needs no grant of its own)
  --     Anything outside the known set invalidates the claim this file rests on.
  select string_agg(x.fn, ', ' order by x.fn) into v_bad from (
    select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(raid_claims|raid_contributions)'
       and p.proname not in ('raid_claim__ungated','raid_strike__ungated',
                             'hr_assert_grant_hygiene')) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: the raid tables have writer(s) this file does not know '
                    'about: %. The header claims raid_claim__ungated and raid_strike__ungated are '
                    'the only ones; that claim is now false and the sweep has not been reviewed '
                    'against reality.', v_bad;
  end if;

  -- ⚠ A POSITIVE CONTROL ON THAT SCAN. The regex above is written to find
  --   NOTHING; a regex that has stopped matching anything at all also finds
  --   nothing, and would pass while seeing zero writers. So assert the KNOWN
  --   writers ARE matched by the very same expression — BOTH of them, because
  --   one matching is not evidence that the other is visible.
  foreach t in array array['raid_claim__ungated','raid_strike__ungated'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = t
                      and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(raid_claims|raid_contributions)') then
      raise exception 'THE WRITER SCAN IS BLIND (positive control): public.% is not matched by the '
                      'very expression used to decide nothing else writes the raid tables.', t;
    end if;
  end loop;

  select string_agg(x.k, ', ' order by x.k) into v_bad from (
    select 'trigger ' || tg.tgname || ' on ' || tg.tgrelid::regclass::text as k
      from pg_trigger tg
     where not tg.tgisinternal
       and tg.tgrelid in ('public.raid_claims'::regclass, 'public.raid_contributions'::regclass)
    union all
    select 'rule ' || r.rulename || ' on ' || r.ev_class::regclass::text
      from pg_rewrite r
     where r.ev_class in ('public.raid_claims'::regclass, 'public.raid_contributions'::regclass)
       and r.rulename <> '_RETURN'
    union all
    select 'view ' || c.relname
      from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class c on c.oid = r.ev_class
     where d.refobjid in ('public.raid_claims'::regclass, 'public.raid_contributions'::regclass)
       and c.relkind in ('v','m')
       and c.relname not in ('raid_claims','raid_contributions')) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: something other than a function routes into the raid '
                    'tables: %. A trigger, a rule or an updatable view is a writer, and this file '
                    'has confirmed only the two SECURITY DEFINER RPCs.', v_bad;
  end if;

  -- (d) THE WRITERS SURVIVE THE REVOKE — asserted structurally here, and PROVEN
  --     behaviourally on the replay by tests/client-write-sweep-3.mjs, which
  --     DRIVES both RPCs through their A9 wrappers as a signed-in player. A
  --     SECURITY DEFINER function executes as its OWNER, so the property is:
  --     the owner holds the write privileges, and BOTH the wrapper and the
  --     __ungated body are really SECURITY DEFINER. All of it by name, because
  --     any one of them alone is worthless.
  foreach v_bad in array array['raid_claim','raid_strike'] loop
    select p.proowner into v_owner from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_bad || '__ungated' limit 1;
    if v_owner is null then
      raise exception 'REFUSING TO INSTALL: the confirmed writer public.%__ungated does not exist '
                      'on this database, so "the writer still works after the revoke" is '
                      'untestable.', v_bad;
    end if;
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in (v_bad, v_bad || '__ungated')
                  and not p.prosecdef) then
      raise exception 'REFUSING TO INSTALL: public.% (or its __ungated body) is not SECURITY '
                      'DEFINER. It would then execute as the CALLER, and revoking the caller''s '
                      'grants is exactly what breaks it.', v_bad;
    end if;
    foreach t in array c_tables loop
      if not has_table_privilege(v_owner::regrole::text, 'public.' || quote_ident(t),
                                 'INSERT, UPDATE, DELETE') then
        raise exception 'REFUSING TO INSTALL: %, the owner of the confirmed writer public.%, does '
                        'not hold INSERT/UPDATE/DELETE on public.%. Revoking the client grants '
                        'would leave the table with NO writer at all.',
                        v_owner::regrole::text, v_bad, t;
      end if;
    end loop;
  end loop;

  -- (e) ⚠ THE INSTRUMENT CHECK — the whole reason batch 1's six are still dirty.
  --     The privilege vocabulary is DERIVED FROM THE SERVER, not typed. If the
  --     server knows a table privilege this file does not enumerate, every
  --     measurement below is partial and its "0 remain" is the same false
  --     report batch 1 filed. Fail loudly rather than sweep seven eighths.
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
                    'enumerate: %. Every revoke and every verification below would then be '
                    'partial and would still report success — the exact failure that left MAINTAIN '
                    'on batch 1''s six catalogues. Widen c_vocab (and the revoke) first.', v_bad;
  end if;
  -- …and the mirror. A vocabulary entry the server does NOT know would make the
  -- revoke a syntax error at apply time; better to say why here than to fail
  -- three sections later with "unrecognized privilege type".
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(c_vocab) s where not (s = any (v_srv));
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: this file enumerates privilege(s) this server does not '
                    'have: % (server_version_num = %). MAINTAIN needs PostgreSQL 17+.',
                    v_bad, current_setting('server_version_num');
  end if;

  -- (f) BATCH 2's STATE — reported, NOT required. Nothing in this file depends
  --     on it: different tables, different rows. Said out loud so its absence
  --     is a decision rather than something nobody looked at.
  if exists (select 1 from public.hr_client_write_baseline
              where table_name in ('display_names','leaderboard_meta')) then
    raise notice 'SWEEP-3 §0(f): batch 2 (display_names, leaderboard_meta) has NOT been applied on '
                 'this database. That is not an error here — this file sweeps different tables — '
                 'but the chain is meant to run 1 → 2 → 3.';
  end if;

  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'SWEEP-3 §0 PASSED: batch 1 is applied (% baselined pair(s)); both raid tables have '
               'RLS on with SELECT-only policies; the only writers are raid_claim__ungated and '
               'raid_strike__ungated (no trigger, rule or view routes in); both are SECURITY '
               'DEFINER, owned by a role that keeps its write privileges; and the privilege '
               'vocabulary this file enumerates is EXACTLY what the server knows (%).',
               v_n, array_to_string(v_srv, ',');
end $$;

-- ── 1. THE RAID SWEEP — revoke, and CONSUME the baseline rows in the same file ──
do $$
declare
  c_tables constant text[] := array['raid_claims','raid_contributions'];
  c_pairs  constant text[][] := array[
    ['raid_claims','anon'],        ['raid_claims','authenticated'],
    ['raid_contributions','anon'], ['raid_contributions','authenticated']];
  t        text;
  -- NB: no `i` variable. `generate_subscripts(...) i` below is a RANGE ALIAS,
  -- and a PL/pgSQL variable of the same name makes every reference to it
  -- ambiguous — which Postgres reports at execution, not at create time, so it
  -- fails on the apply rather than in review. (Batch 2 learned this here.)
  v_before  text;
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
  --     the client READS raid_contributions to render the Hunt roster
  --     (src/features/raids.js:719) and both tables are world-readable by the
  --     design of their own migrations. MAINTAIN is included; §0(e) has already
  --     proven the server has it, so no version guard is needed here — an
  --     unguarded `revoke maintain` on PG16 would be a syntax error, and §0(e)
  --     refuses to install there by name instead.
  foreach t in array c_tables loop
    execute format('revoke insert, update, delete, truncate, references, trigger, maintain '
                   'on public.%I from public, anon, authenticated', t);
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
    raise exception 'SWEEP-3 §1(b): expected to delete % baseline row(s), deleted %. The list and '
                    'the table disagree about their own primary key.', array_length(c_pairs,1), v_deleted;
  end if;

  raise notice 'SWEEP-3 §1: revoked [%]; % baseline row(s) consumed.',
    coalesce(v_before, '(none — nothing to revoke, which is itself worth reading twice)'), v_deleted;
end $$;

-- ── 2. THE MAINTAIN PASS OVER BATCH 1's SIX ──────────────────────────────
-- Five statements of work and a precondition that is worth more than the work.
-- These six carry NO baseline rows (batch 1 §2 asserts that, and this file does
-- not change it), so nothing is consumed here — only a privilege that
-- information_schema could not report is removed.
do $$
declare
  c_six constant text[] := array[
    'hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
    'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers'];
  t       text;
  v_bad   text;
  v_had   text;
  v_seen  int := 0;
begin
  -- (a) ⚠ REFUSE IF BATCH 1's WORK HAS COME UNDONE. If any of the six has
  --     regained a client write privilege OTHER than MAINTAIN, then either
  --     batch 1 was never applied or something re-granted it — and quietly
  --     revoking MAINTAIN while leaving an INSERT would produce a file whose
  --     own §3 then fails for a reason nobody can read. Named by pair.
  select string_agg(x.k, ', ' order by x.k) into v_bad from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(c_six) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pp
     where to_regclass('public.' || quote_ident(tt)) is not null
       and has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;
  if v_bad is not null then
    raise exception 'REFUSING TO INSTALL: batch 1''s six catalogues carry NON-MAINTAIN client write '
                    'privilege(s): %. Either 2026-08-16-client-write-grant-sweep.sql was not '
                    'applied, or something re-granted them since. This file only removes the '
                    'MAINTAIN privilege batch 1 could not see; it is not a substitute for batch 1 '
                    'and must not paper over a re-grant.', v_bad;
  end if;

  -- (b) WHAT IS ACTUALLY THERE, named at apply time — the evidence for the
  --     claim that batch 1's "0 remain" was an instrument error rather than a
  --     statement about the database.
  select string_agg(x.k, ', ' order by x.k) into v_had from (
    select tt || ':' || gg as k
      from unnest(c_six) tt
      cross join unnest(array['anon','authenticated']) gg
     where to_regclass('public.' || quote_ident(tt)) is not null
       and has_table_privilege(gg, 'public.' || quote_ident(tt), 'MAINTAIN')) x;

  foreach t in array c_six loop
    if to_regclass('public.' || quote_ident(t)) is null then
      -- A database that never had the castle/hunt content. Batch 1 treats this
      -- as a notice rather than an error and so does this file: the job is that
      -- the privilege is absent, and it is.
      raise notice 'SWEEP-3 §2: public.% does not exist here — nothing to revoke', t;
      continue;
    end if;
    v_seen := v_seen + 1;
    execute format('revoke maintain on public.%I from public, anon, authenticated', t);
  end loop;

  raise notice 'SWEEP-3 §2: MAINTAIN revoked on % of batch 1''s six catalogues. It was held by [%] '
               '— every one of which batch 1 reported as swept, because '
               'information_schema.role_table_grants cannot see MAINTAIN.',
               v_seen, coalesce(v_had, '(none — batch 1 was measured with a different instrument, '
                                       'or somebody has already done this)');
end $$;

-- ── 3. VERIFICATION (A) — NOTHING SURVIVES, MEASURED THE WAY THAT CAN SEE ──
-- has_table_privilege over the full server-derived vocabulary, not
-- information_schema. Over BOTH populations this file touched: the two raid
-- tables and batch 1's six. If this file had verified itself the way batch 1
-- did, §2 would have changed nothing measurable and the report would still have
-- said "0 remain".
do $$
declare
  c_all constant text[] := array[
    'raid_claims','raid_contributions',
    'hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
    'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers'];
  v_left text; v_sel int; v_want int;
begin
  select string_agg(x.k, ', ' order by x.k) into v_left from (
    select tt || ':' || gg || ':' || pp as k
      from unnest(c_all) tt
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES',
                              'TRIGGER','MAINTAIN']) pp
     where to_regclass('public.' || quote_ident(tt)) is not null
       and has_table_privilege(gg, 'public.' || quote_ident(tt), pp)) x;
  if v_left is not null then
    raise exception 'SWEEP-3 §3(A) FAILED: client privilege(s) survive: %', v_left;
  end if;

  -- SELECT MUST STILL BE THERE, on every table that exists. A sweep that
  -- quietly took the read with it would empty the Hunt roster
  -- (src/features/raids.js:719 reads raid_contributions) and blank the castle
  -- and hunt catalogues — silently, with nothing else in this file noticing.
  select count(*) into v_want from unnest(c_all) tt
   where to_regclass('public.' || quote_ident(tt)) is not null;
  select count(*) into v_sel from (
    select 1 from unnest(c_all) tt
      cross join unnest(array['anon','authenticated']) gg
     where to_regclass('public.' || quote_ident(tt)) is not null
       and has_table_privilege(gg, 'public.' || quote_ident(tt), 'SELECT')) z;
  if v_sel <> v_want * 2 then
    raise exception 'SWEEP-3 §3(A) FAILED: SELECT was collaterally revoked (% of % remain). These '
                    'tables are world-readable by design — the client READS raid_contributions to '
                    'render the Hunt roster.', v_sel, v_want * 2;
  end if;
  raise notice 'SWEEP-3 §3(A): zero client write privileges remain on the two raid tables OR on '
               'batch 1''s six (measured over the full server-derived vocabulary, MAINTAIN '
               'included); all % SELECT grants intact.', v_sel;
end $$;

-- ── 4. VERIFICATION (B) — THE DOOR IS SHUT, PROVEN BY EXECUTION ───────────
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
--   block demands the FORMER. Measured on production 2026-08-16 inside a
--   transaction that was rolled back: all four pairs answered RLS_ONLY before
--   the revoke and NO_GRANT after it, which is the pre/post pair this block
--   asserts one half of. The matching pre-state arm — same probe, un-swept
--   database — is in tests/client-write-sweep-3.mjs (C3), where it can be run
--   against a database this file has not been applied to.
--
-- ⚠ RESIDUAL, stated rather than hidden: this match is on the ENGLISH message
--   text, so it is lc_messages-dependent. It cannot be keyed on SQLSTATE (both
--   states are 42501 — that is the whole problem) and PL/pgSQL cannot see the
--   error's internal identifier. Production runs lc_messages = en_US, and §3
--   above has already proven the same property from the catalogue, so a locale
--   change would produce a spurious FAILURE (loud) rather than a spurious pass.
--
-- `insert ... default values` rather than a column list, deliberately: the ACL
-- check happens at executor start, BEFORE any column, constraint or RLS policy
-- is evaluated, so the probe cannot be derailed by a schema change to either
-- table and cannot accidentally assert a NOT NULL instead of a privilege.
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
    foreach t in array array['raid_claims','raid_contributions'] loop
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
        raise exception 'SWEEP-3 §4 FAILED: role % WROTE public.% after the revoke. The grant was '
                        'not the only thing standing there.', g, t;
      end if;
      if v_msg !~ 'permission denied for table' then
        raise exception 'SWEEP-3 §4 FAILED: role % was refused on public.% with "%" rather than a '
                        'PERMISSION error. If that is the row-level-security message, the table '
                        'grant is STILL PRESENT and RLS is the only thing holding the door — which '
                        'is the exact state this file exists to end.', g, t, v_msg;
      end if;
    end loop;
  end loop;
  raise notice 'SWEEP-3 §4: anon and authenticated are refused on BOTH raid tables with "permission '
               'denied for table" — the grant is gone, not merely out-voted by RLS.';
end $$;

-- ── 5. VERIFICATION (C) — THE DETECTOR REPORTS CLEAN ──────────────────────
-- Three claims: neither raid table is named anywhere in the report; STRICT
-- passes; and the baseline no longer carries a claim about either of them (a
-- row left behind is a permanent, silent exemption for a table that no longer
-- needs one — and the NEXT time somebody re-grants it, the detector would say
-- nothing).
do $$
declare v jsonb; t text; v_n int; v_rows text;
begin
  v := public.hr_assert_grant_hygiene(false);
  foreach t in array array['raid_claims','raid_contributions'] loop
    if v::text like '%' || t || '%' then
      raise exception 'SWEEP-3 §5 FAILED: % is still named in the hygiene report: %', t, v::text;
    end if;
  end loop;

  select string_agg(table_name || ':' || grantee, ', ') into v_rows
    from public.hr_client_write_baseline
   where table_name in ('raid_claims','raid_contributions');
  if v_rows is not null then
    raise exception 'SWEEP-3 §5 FAILED: baseline row(s) survived the sweep (%). A baselined pair '
                    'is a standing exemption: re-granting that table later would be INVISIBLE to '
                    'the detector. The grant and the row come out together or neither does.', v_rows;
  end if;

  -- Batch 1's six must still not be baselined — this file revoked a privilege
  -- from them and must not have recorded one instead.
  select string_agg(distinct table_name, ', ') into v_rows
    from public.hr_client_write_baseline
   where table_name in ('hr_castle_board_tasks','hr_castle_buildings','hr_castle_items',
                        'hr_castle_tiers','hr_hunt_bosses','hr_hunt_tiers');
  if v_rows is not null then
    raise exception 'SWEEP-3 §5 FAILED: batch 1''s swept catalogues appear in the baseline (%) — a '
                    'control turned into a comment.', v_rows;
  end if;

  v := public.hr_assert_grant_hygiene(true);

  -- ⚠ A CONTROL, the same one both predecessors insisted on. If the class is
  --   now EMPTY the assertions above are vacuous — they would pass on a
  --   database where the predicate stopped matching anything.
  --   ⚠ NO COUNT IS ASSERTED HERE, deliberately (CLAUDE.md b339: three separate
  --   wrong numbers have shipped in prose about this allowlist, and an
  --   assertion written from one fails spuriously and gets loosened). Batches
  --   may interleave and batch 4 will change it. ZERO is the only value that
  --   means the check has gone blind, so ZERO is the only value asserted. The
  --   exact arithmetic — the baseline shrank by precisely the four rows this
  --   file consumed, measured against BATCH 1'S OWN DECLARED LIST — is in
  --   tests/client-write-sweep-3.mjs arm C6, where it is derived rather than
  --   typed.
  select count(*) into v_n from public.hr_client_write_baseline;
  if v_n = 0 then
    raise exception 'SWEEP-3 §5: the baseline is EMPTY. Either every remaining batch has been swept '
                    '(excellent, and not something to discover silently) or something truncated it. '
                    'Until it is empty legitimately, an empty baseline makes §5''s checks vacuous.';
  end if;
  raise notice 'SWEEP-3 §5: GRANT HYGIENE STRICT PASSES; neither raid table is named; % baselined '
               'pair(s) remain for batch 4+.', v_n;
end $$;

-- ── 6. WHAT WAS FIXED, SAID AT APPLY TIME ────────────────────────────────
do $$
declare v_n int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  raise notice 'CLIENT WRITE GRANT SWEEP BATCH 3 APPLIED. raid_claims and raid_contributions — the '
               'one table in the baseline that has ALREADY hosted a live client-write exploit (the '
               'b209 "own contribution claim" UPDATE policy) — no longer carry any client write '
               'privilege, their baseline rows are consumed, and batch 1''s six catalogues have '
               'lost the MAINTAIN privilege information_schema could not report. % pair(s) remain: '
               'clan_* (12 tables), world_event_* (3), maintenance_* (2). Those are batch 4+ and '
               'are NOT this file.', v_n;
end $$;

-- ── 7. WHAT IS LEFT, AND WHO OWNS IT ─────────────────────────────────────
-- (1) SEVENTEEN BASELINED TABLES, 34 pairs: clan_bans, clan_board, clan_invites,
--     clan_ledger, clan_order_ballots, clan_order_votes, clan_raids, clan_stores,
--     clan_tavern, clan_withdrawals, clan_work_labour, clan_work_orders,
--     maintenance_alerts, maintenance_log, world_event_joins,
--     world_event_pledges, world_event_totals. Batch 4 should take world_event_*
--     next on blast radius (world_event_totals is a shared, cross-population
--     aggregate — the same shape as leaderboard_meta), then clan_*, then
--     maintenance_* (staff-facing, smallest radius). Same protocol: confirm the
--     writer on the database being migrated, drive it before and after, revoke
--     everything including MAINTAIN, consume the baseline rows in the SAME file,
--     refuse if one is already absent.
--
-- (2) ⚠ MAINTAIN ACROSS THE WHOLE SCHEMA — NOT DONE HERE, AND MEASURED.
--     On production 2026-08-16, **78 of the 138 (table, grantee) pairs in
--     `public` hold MAINTAIN for anon or authenticated, and 56 of those are on
--     tables with RLS on and no write policy** — i.e. would land squarely in
--     check (4)'s class the moment the detector could see the privilege. This
--     file removes 16 of the 78 (the two raid tables and batch 1's six); it
--     does not attempt the rest. See §8 for why that is the same decision as
--     deferring the detector takeover, and what the real fix is.
--
-- (3) THE GENERATOR, which is upstream of this entire programme. The schema
--     default ACL on production is
--         alter default privileges in schema public for role postgres
--           grant all on tables to anon, authenticated
--       → pg_default_acl: {anon=arwdm/postgres, authenticated=arwdm/postgres}
--     Every NEW table in `public` is therefore born with INSERT, UPDATE, DELETE
--     and MAINTAIN for both client roles, and joins the dead-grant class
--     automatically the moment RLS is enabled on it. Sweeping tables one batch
--     at a time is treating the symptom; the cure is a fail-closed default ACL.
--     That is a project-wide posture change with its own review — named here so
--     it is a decision rather than an oversight, exactly as batch 1 named
--     service_role.
--
-- (4) service_role. Still deliberately out of scope (batch 1 §header).
--
-- ── 8. THE DETECTOR TAKEOVER — CONSIDERED AND DEFERRED, WITH THE NUMBER ──
-- The obvious companion to this file is to move check (4) of
-- hr_assert_grant_hygiene off information_schema and onto has_table_privilege,
-- so MAINTAIN becomes permanently visible to the detector instead of being
-- something each batch has to remember. It was scoped and NOT done, and the
-- reason is not effort — the derivation chain (tools/derive-grant-hygiene.mjs,
-- a fourth link, graded by tests/run-sql-tests.mjs PART 1f-ii) makes the
-- mechanics routine. It is this:
--
--     Widening check (4) to see MAINTAIN would put 56 (table, grantee) pairs
--     into the class ON THE DAY IT LANDS — none of them baselined, none of them
--     swept, none of them reviewed. hr_assert_grant_hygiene(true) would then
--     RAISE, and it runs NIGHTLY ON pg_cron with its failures surfacing as
--     maintenance_alerts. The detector would fail every night until a
--     schema-wide MAINTAIN sweep landed.
--
-- There are only two honest ways to land it, and both are their own migration:
--   (a) REVOKE FIRST, SEE SECOND. Sweep MAINTAIN from anon and authenticated
--       across all of `public` (78 pairs), fix the default ACL in (3) so new
--       tables stop arriving with it, THEN widen check (4). This is the right
--       one: MAINTAIN is unreachable through PostgREST, so the regression risk
--       of the schema-wide revoke is close to nil — but "close to nil" on a
--       78-pair privilege change is a claim that needs its own before/after
--       evidence, not a paragraph in a raid migration.
--   (b) Widen the check and baseline all 56 pairs. This RECORDS the finding
--       instead of fixing it, which is exactly what batch 1 §2 refused to do.
--       Rejected.
--
-- Doing (a) inside this file would have coupled a 78-pair schema-wide privilege
-- change and a detector-body replacement to a four-pair raid sweep, and the
-- batch protocol exists precisely so that each batch's blast radius is one
-- reviewable thing. So: **deferred, named, and measured** — batch 5, after the
-- table sweeps, with the default-ACL change in the same file. Until then the
-- MAINTAIN residual is bounded (dead: no PostgREST verb reaches it), visible
-- (this section, and the numbers in §7(2)), and each batch removes its own.
--
-- ⚠ WHAT THAT LEAVES OPEN, said plainly: until (a) lands, a table that is
--   re-granted MAINTAIN — or a NEW table born with it — is INVISIBLE to the
--   nightly detector. That is a real gap. It is not made worse by this file,
--   and this file is the first to measure it.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare v_n int; v_m int;
begin
  select count(*) into v_n from public.hr_client_write_baseline;
  select count(*) into v_m from pg_class c
    cross join unnest(array['anon','authenticated']) gg
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
     and has_table_privilege(gg, c.oid, 'MAINTAIN');
  raise notice 'SWEEP-3 §8: % dead client write pair(s) remain BASELINED (batch 4+, one confirmed '
               'writer at a time). Separately, % (table, grantee) pair(s) in `public` still hold '
               'MAINTAIN — the privilege check (4) cannot see. That is batch 5 together with the '
               'fail-closed default ACL, NOT this file.', v_n, v_m;
end $$;
