-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ENGINE CAPABILITY ALLOWLIST: two reviewed reads recorded
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion derivation: tools/derive-grant-hygiene.mjs (§2's body is EXTRACTED)
--   Graded by: tests/run-sql-tests.mjs PART 1f-ii (HR_GRANT_HYGIENE_CHAIN)
--   Preflight: node tools/derive-grant-hygiene.mjs --check (in tests/run-smoke.mjs)
--
-- ── THE PROBLEM, IN ONE PARAGRAPH ───────────────────────────────────────
-- The nightly grant-hygiene detector RAISES in production. Check (7) — the
-- hr_engine capability pin — reports:
--
--   engine_execute_outside_allowlist:
--     ["hr_claim_lookup(uuid,integer,text,text)", "hr_perks_of(uuid,integer)"]
--
-- Both grants are correct by design and both were Security-reviewed when they
-- landed (2026-08-16-claim-reward.sql §3 and 2026-08-15-perk-channel.sql
-- respectively). What was NOT done, either time, was to record them in the
-- allowlist the detector reads — so the detector is doing exactly its job and
-- the fix is to make the reviewed intent explicit, in the one place that
-- expresses it.
--
-- ⚠ THIS IS THE DANGEROUS SHAPE, AND IT IS WORTH SAYING SO BEFORE THE FIX.
--   The pressure a raising detector creates is to make the detector stop
--   raising. There are three ways to do that and only one of them is a fix:
--     (a) revoke the two grants        — breaks claim_reward and every perk read
--     (b) widen/delete check (7)       — deletes the control
--     (c) record the two entries, each with a justification that re-derives
--         the claim the list demands   — this file
--   §4 below therefore ships a MUTATION ARM: after installing, it grants
--   hr_engine EXECUTE on a throwaway probe and requires the detector to NAME
--   it. A detector that stopped firing would fail this migration. Coverage
--   gets STRICTER here, never looser.
--
-- ── THE CLAIM EACH ENTRY MAKES, RE-DERIVED ──────────────────────────────
-- 2026-08-11-grant-hygiene.sql states the bar in its own comment on
-- c_engine_allow: "Adding an entry is a CLAIM: read-only or self-validating,
-- and it accepts no target the caller is not already authorised for. Re-derive
-- that for the whole list every time it changes." So:
--
-- 1. hr_claim_lookup(uuid,integer,text,text)
--    READ-ONLY: declared STABLE, and that declaration is asserted at install
--    time by claim-reward §4 rather than trusted — which matters, because a
--    volatility declaration is a claim about the WHOLE CALL TREE and this
--    project has already taken a sign-up outage on exactly that
--    (beta_invite_check was STABLE and true only while a function two levels
--    down did not write). Its body performs a single SELECT against
--    player_progress and calls hr_utc_day_key, which is `stable sql`.
--    SELF-VALIDATING: the row set is bounded STRUCTURALLY, not by a LIMIT. The
--    period keys it reads are '' + hr_utc_day_key(now()) + hr_utc_day_key(now()
--    - 1 day) — the SERVER's clock and the SERVER's day function, never an
--    argument. There is no parameter through which a caller can widen the read
--    into a history scan, and none through which it can name a different day.
--    NO NEW TARGET: it takes p_user as a parameter, and so do hr_apply and
--    hr_state_of, both of which the engine already holds. The engine can
--    already WRITE any character it names; this lets it READ, for one
--    character, a strict subset of what hr_state_of's envelope already carries
--    the peer of. It therefore adds no reachability the engine did not have —
--    which is the honest form of that clause, and the only one worth writing
--    down. (The clause has never meant "cannot name another user": every
--    single entry on this list from hr_apply down takes the user as an
--    argument. It means the entry grants no authority beyond what the holder
--    of hr_apply already has.)
--
-- 2. hr_perks_of(uuid,integer)
--    READ-ONLY: declared STABLE. Its body is four SELECTs against
--    player_progress / player_state and one call to hr_unlock_levels, itself
--    STABLE and read-only. It writes nothing and calls nothing that writes.
--    SELF-VALIDATING: it returns a fixed-shape envelope (rooms, plots,
--    propertyTier, unlockedRecipes, plus a `sources` honesty census) for ONE
--    (user, slot). Its recipe read JOINs the hr_unlocks catalogue on both
--    namespace AND storage kind, so a mis-filed row is invisible as well as
--    unwritable — an absent row is an absent key is a LOCKED recipe, and the
--    fail-closed default is the shape's default rather than a branch somebody
--    wrote.
--    NO NEW TARGET: same argument as above — p_user is a parameter the engine
--    already passes to hr_apply and hr_state_of.
--    WHY THE ENGINE NEEDS IT AT ALL, which is the other half of the review:
--    for the same reason hr_offline_cap_ms is on this list. A perk multiplies
--    a whole night's accrual (noBurn destroys a quarter of a cook's input when
--    read as 0; unlockedRecipes locks eight already-earned recipes when read as
--    absent). The engine must be TOLD its capabilities by the server, never
--    compute or assume them, and it must not own the cap on its own grant.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────
-- It does not grant anything. Both grants already exist and were made by the
-- migrations that own those functions. It does not touch check (7)'s logic,
-- check (8), the baseline table, the cron schedule, or any other check. The
-- ONLY textual difference from 2026-08-11-grant-hygiene.sql's detector is two
-- entries and their justifications, inserted at ONE anchor — see §2.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
-- Re-applying 2026-08-11-grant-hygiene.sql restores the nine-entry list
-- exactly (its body is this file's base, unmodified). That is a complete
-- revert of everything this file changes — after which the detector correctly
-- raises again on the two grants, because the finding was never false. A true
-- revert of the FINDING means revoking both grants, which takes claim_reward
-- and every perk read offline. No table, column, policy, row or grant is
-- touched here, so there is nothing else to undo.
--
-- SAFE TO RE-RUN — see §1, which distinguishes a no-op re-run from a live body
-- this file was not derived from, and refuses the second.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — REFUSE TO INSTALL ON A BODY THIS FILE DID NOT COME FROM ──
-- This file restates a 12 KB nine-check DETECTOR it did not author. There is
-- no body in this repo where a blind `create or replace` is worse: the
-- detector is the only automated thing that notices a privileged function born
-- reachable, it runs nightly, and a silently deleted check LOOKS EXACTLY LIKE
-- a clean night. Three migrations once each defined clan_members "join as
-- self" and filename order installed the shortest; every self-check passed.
--
-- So the guard is a SET COMPARISON on the live allowlist, not a term scan:
--   · the anchor must be there at all (else this is not the body we patched);
--   · every entry the LIVE body carries must be one this file will carry —
--     otherwise applying this file DELETES a reviewed capability, and it names
--     which one instead of shrugging;
--   · every entry of the nine-entry BASE must be live — otherwise the live
--     body is older or different and this file was derived from the wrong one;
--   · both, one, or neither of the two new entries may be present. Both = a
--     no-op re-run, said out loud. Exactly ONE = somebody edited this list by
--     hand, and this file would overwrite that edit, so it refuses.
do $$
declare
  v_src   text;
  v_len   int;
  v_arr   text;
  v_live  text[];
  v_e     text;
  v_new   int := 0;
  -- The eleven entries this file's detector will carry. Nine base + two new.
  c_base constant text[] := array[
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    'hr_state_of(uuid,integer)',
    'hr_seed(uuid,integer,text)',
    'hr_total_level(uuid,integer)',
    'hr_level_from_xp(bigint)',
    'hr_xp_for_level(integer)',
    'market_expire(integer)',
    'hr_offline_cap_ms(uuid,integer)',
    'hr_rate_gate(uuid,integer,text)'
  ];
  c_added constant text[] := array[
    'hr_claim_lookup(uuid,integer,text,text)',
    'hr_perks_of(uuid,integer)'
  ];
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene(boolean) is missing — apply '
                    '2026-08-11-grant-hygiene.sql first. This file only ADDS two entries to '
                    'its engine allowlist; it is not a substitute for the detector.';
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline is missing — apply 2026-08-11-grant-hygiene.sql first; '
                    'check (2) of the body installed here reads it';
  end if;

  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  -- THE ANCHOR. If the array declaration is not there, the live body is not the
  -- one tools/derive-grant-hygiene.mjs patched and nothing below can be trusted.
  v_arr := substring(v_src from 'c_engine_allow constant text\[\] := array\[(.*?)\];');
  if v_arr is null then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live body (% chars) has no '
                    '`c_engine_allow constant text[] := array[…];` declaration, so it is not the '
                    'body this file was derived from. Re-derive from whatever is actually running '
                    '(node tools/derive-grant-hygiene.mjs --report) rather than overwriting it.',
                    coalesce(v_len, 0);
  end if;

  select array_agg(m[1] order by m[1])
    into v_live
    from regexp_matches(v_arr, '''([a-z][a-z0-9_]*\([a-z0-9_, ]*\))''', 'g') m;

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT, because a text scan fails in BOTH
  --   directions. If it stops matching, every "present?" test raises on a
  --   perfectly healthy database (loud, but wrong). If it matches everything,
  --   every test passes on a body with none of these properties (quiet, and
  --   fatal). The positive control is an entry no engine allowlist worth the
  --   name can lack; the negative is a sentinel that appears in no body at all.
  if v_live is null or not ('hr_apply(uuid,integer,bigint,uuid,jsonb)' = any (v_live)) then
    raise exception 'THE ALLOWLIST SCAN IS BLIND (positive control): hr_apply is not among the % '
                    'entries parsed out of the live c_engine_allow, and hr_apply is THE writer — '
                    'every check below would refuse on a healthy database. Fix the parse, do not '
                    'delete the check.', coalesce(array_length(v_live, 1), 0);
  end if;
  if 'hr__grant_hygiene_negative_control(uuid)' = any (v_live) then
    raise exception 'THE ALLOWLIST SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no allowlist MATCHED, so the parse is matching everything and '
                    'every check below would pass on any body at all.';
  end if;

  -- (a) Nothing this file would DELETE.
  foreach v_e in array v_live loop
    if not (v_e = any (c_base) or v_e = any (c_added)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist '
                      'carries "%", which the body in this file does NOT. Applying it would '
                      'silently DELETE that reviewed capability and the nightly detector would '
                      'start raising on a grant somebody already approved. Add the entry to '
                      'tools/derive-grant-hygiene.mjs and re-derive.', v_e;
    end if;
  end loop;

  -- (b) Everything the base had is still there.
  foreach v_e in array c_base loop
    if not (v_e = any (v_live)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist is '
                      'MISSING the base entry "%". This file''s body was derived from '
                      '2026-08-11-grant-hygiene.sql (prosrc md5 c528a8bde53b8e8c603720ef60d88432, '
                      'compared byte-for-byte against production 2026-08-16); the live body is not '
                      'that one. Re-derive rather than overwrite.', v_e;
    end if;
  end loop;

  -- (c) Both of the new entries, or neither.
  foreach v_e in array c_added loop
    if v_e = any (v_live) then v_new := v_new + 1; end if;
  end loop;
  if v_new = 1 then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live allowlist carries '
                    'exactly ONE of the two entries this file adds. That is a hand edit, not this '
                    'file, and applying it would overwrite whatever was decided. Reconcile by '
                    'hand first.';
  elsif v_new = 2 then
    raise notice 'the live engine allowlist already carries both entries — this apply is a '
                 'no-op re-run of an identical body.';
  end if;

  raise notice '§0 PASSED: the live hr_assert_grant_hygiene (% chars) is the nine-entry base this '
               'file was derived from; % of 2 new entries already present.', v_len, v_new;
end $$;

-- ── 2. THE DETECTOR, DERIVED ─────────────────────────────────────────────
-- ⚠ THE BLOCK BELOW IS GENERATED. Do not hand-edit between the markers.
--   It is 2026-08-11-grant-hygiene.sql's hr_assert_grant_hygiene, EXTRACTED
--   programmatically by tools/derive-grant-hygiene.mjs and patched at ONE
--   named anchor (the head of c_engine_allow). Evidence, recorded at
--   derivation time:
--     · base block (grant-hygiene's whole create-or-replace)
--         12,175 chars, md5 8a59a743089caaccc9ffe9bd7c203ede
--     · base INNER body vs PRODUCTION's live prosrc
--         11,985 chars, md5 c528a8bde53b8e8c603720ef60d88432 — BOTH SIDES,
--         measured 2026-08-16 against nezapsylztqbbwuwembx. The repo file and
--         the running detector are byte-identical, so this derivation is from
--         what is actually live and not from a stale copy of it.
--     · derived block   13,916 chars, md5 0509f6a8483e1c431167591b6f1a5630
--     · derived body    13,726 chars, md5 6a6359657a786e2fa03aa55f896c26d5
--     · lines removed from the base: ZERO. Lines added: 26 (2 entries + 24 of
--       justification). An INSERTION-ONLY derivation, which is why
--       HR_GRANT_HYGIENE_CHAIN's declared-removals list in
--       tests/run-sql-tests.mjs PART 1f-ii is EMPTY — the strongest form that
--       check can take: nothing of the base body may go.
--   `node tools/derive-grant-hygiene.mjs --check` re-derives and diffs on every
--   run of tests/run-smoke.mjs, so a hand edit here fails the build.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- writes, but only the "return the lapsed seller's own goods" path, capped at 200
    'market_expire(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb) into v_client_trunc
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- ── 3. GRANTS — revoke from PUBLIC first, then grant (nothing is granted) ─
-- `create or replace` PRESERVES the existing ACL, so on a database that already
-- ran grant-hygiene these are belt-and-braces. They are restated anyway because
-- the detector's own check (1) is the thing that would catch their absence, and
-- a detector that arrives PUBLIC-executable for one migration is a detector an
-- attacker can read the allowlist out of. There is no `grant` line in this
-- file, by design: it adds no capability to anybody.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-VERIFICATION — EXECUTED, WITH A MUTATION ARM ─────────────────
-- Three things are proven here, in this order:
--   (A) the two entries are in the INSTALLED body and check (7) no longer
--       reports the two live grants — the actual purpose of the file;
--   (B) STRICT PASSES — the whole nine-check detector, not just check (7);
--   (C) THE MUTATION ARM: an unrelated function granted to hr_engine is still
--       NAMED by check (7). A migration that widened an allowlist and did not
--       prove the detector still fires has replaced a control with a comment.
do $$
declare
  v      jsonb;
  v_src  text;
  v_e    text;
  v_have boolean;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  -- (A) the entries landed, and the live grants they exist for are now silent.
  foreach v_e in array array['hr_claim_lookup(uuid,integer,text,text)',
                             'hr_perks_of(uuid,integer)'] loop
    if position('''' || v_e || '''' in v_src) = 0 then
      raise exception 'the installed hr_assert_grant_hygiene does not carry the allowlist entry '
                      '% — the derivation did not land', v_e;
    end if;
  end loop;

  v := public.hr_assert_grant_hygiene(false);
  if (v->'engine_execute_outside_allowlist') @> '["hr_claim_lookup(uuid,integer,text,text)"]'::jsonb
  or (v->'engine_execute_outside_allowlist') @> '["hr_perks_of(uuid,integer)"]'::jsonb then
    raise exception 'check (7) still reports the two entries this file just recorded — report=%',
      (v->'engine_execute_outside_allowlist')::text;
  end if;

  -- Report which of the two grants this database actually has, so a green run
  -- on a database that has NEITHER cannot be mistaken for a green run on
  -- production. The replay chain has both (claim-reward + artisan-model).
  select exists (select 1 from pg_roles where rolname = 'hr_engine') into v_have;
  if not v_have then
    raise warning 'hr_engine does not exist on this database — check (7) skips itself and the '
                  'mutation arm below cannot run. This file installed correctly but proved less '
                  'than it does on a database with the accrual engine.';
  else
    foreach v_e in array array['public.hr_claim_lookup(uuid,int,text,text)',
                               'public.hr_perks_of(uuid,int)'] loop
      if to_regprocedure(v_e) is null then
        raise notice 'ALLOWLIST ENTRY RECORDED FOR AN ABSENT FUNCTION: % does not exist here. That '
                     'is legal — an allowlist is permissive — but this apply did not prove the '
                     'finding is cleared.', v_e;
      elsif not has_function_privilege('hr_engine', v_e, 'execute') then
        raise notice '% exists but hr_engine cannot execute it here — the grant this entry '
                     'authorises is not present on this database.', v_e;
      end if;
    end loop;
  end if;

  -- (B) the WHOLE detector, strict. This is the assertion the production
  --     failure is about, and it covers all nine checks — not just the one this
  --     file touched. A self-check that tests only its own file's terms cannot
  --     detect a later file undoing an earlier one.
  v := public.hr_assert_grant_hygiene(true);
  raise notice 'GRANT HYGIENE STRICT PASSES with the widened engine allowlist.';

  -- (C) THE MUTATION ARM. Coverage must get STRICTER, never looser: a genuinely
  --     unlisted engine grant must still be NAMED. Without this, "the detector
  --     stopped raising" and "the detector stopped working" are the same
  --     observation — and this repo has shipped a guard that asserted nothing
  --     twelve times.
  --
  --     No exception handler, on purpose: if anything below raises, the whole
  --     migration rolls back and the probe cannot survive it either.
  if v_have then
    create or replace function public.hr__engine_allow_probe() returns int
      language sql immutable as 'select 1';
    -- Born PUBLIC-executable unless a GLOBAL default ACL says otherwise (which
    -- is check (5)'s whole subject), so close it explicitly before check (1)
    -- correctly objects to it.
    execute 'revoke execute on function public.hr__engine_allow_probe() '
            'from public, anon, authenticated, service_role';
    execute 'grant execute on function public.hr__engine_allow_probe() to hr_engine';

    v := public.hr_assert_grant_hygiene(false);
    if not (v->'engine_execute_outside_allowlist') @> '["hr__engine_allow_probe()"]'::jsonb then
      raise exception 'THE DETECTOR IS BLIND: hr_engine was granted EXECUTE on an unlisted '
                      'function and check (7) did not report it. The allowlist was widened '
                      'without the check that makes an allowlist mean anything. report=%',
                      (v->'engine_execute_outside_allowlist')::text;
    end if;
    -- And it must be FATAL in strict mode, not merely reported — the property
    -- the nightly cron run depends on.
    begin
      v := public.hr_assert_grant_hygiene(true);
      raise exception 'THE DETECTOR IS NOT FATAL: strict mode returned normally with an unlisted '
                      'engine grant live. The nightly cron run would report success.';
    exception when others then
      if sqlerrm not like 'GRANT HYGIENE FAILED%' then raise; end if;
    end;

    execute 'revoke execute on function public.hr__engine_allow_probe() from hr_engine';
    drop function if exists public.hr__engine_allow_probe();

    -- Clean again, strict, so the migration does not leave a database it has
    -- only proven the failing half of.
    v := public.hr_assert_grant_hygiene(true);
    raise notice 'MUTATION ARM PASSED: an unlisted engine grant is still named AND still fatal.';
  end if;
end $$;

-- Belt-and-braces: the probe is created inside a conditional branch above, so
-- prove it is gone whichever branch ran. A probe left behind is a granted
-- function nobody reviewed.
do $$
begin
  if to_regprocedure('public.hr__engine_allow_probe()') is not null then
    raise exception 'the self-check probe survived this migration';
  end if;
end $$;
