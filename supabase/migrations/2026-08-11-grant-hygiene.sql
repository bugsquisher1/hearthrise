-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — GRANT HYGIENE, REVISION 2   (the recurrence detector, widened)
--
-- Supersedes §5 of 2026-08-11-anon-execute-lockdown.sql, which now defers to
-- this file. THE DEFINITION LIVES HERE AND NOWHERE ELSE — two copies of a
-- detector is how a detector gets quietly downgraded.
--
-- ════════════════════════════════════════════════════════════════════════
-- WHY A REWRITE: the detector was blind to the recurrence it was written for.
--
-- Revision 1 asked exactly one question — "is any SECURITY DEFINER function
-- EXECUTE-able by anon?" — and reported a number for the default ACLs. Four
-- defects, all found by review on 2026-08-11, all of them the difference
-- between a control and a comfort blanket:
--
--   D1  `and p.prosecdef`. A SECURITY INVOKER function can still be a hole
--       (an information leak, a write amplifier, a helper that a definer
--       function trusts), and the lockdown's own blanket sweep filters
--       `prokind = 'f'`. So `create procedure` was neither swept NOR detected:
--       a privileged PROCEDURE was born PUBLIC-executable and invisible.
--       → now: prokind in ('f','p'), no prosecdef filter.
--
--   D2  It only asked about `anon`. `authenticated` is 65 functions wide on
--       this database and is where all three CONFIRMED clan holes
--       (hr_clan_order_create, hr_clan_vote_settle_one, hr_clan_decay_cp) were
--       equally reachable — every one of them takes the actor as a PARAMETER,
--       so "you must be signed in" buys nothing. A signed-in attacker is the
--       normal case, not the hard case.
--       → now: both client roles, against an approved baseline.
--
--   D3  No direct PUBLIC check. `has_function_privilege('anon', …)` is true
--       when PUBLIC holds EXECUTE, so revision 1 would have caught PUBLIC
--       transitively — but only for SECURITY DEFINER functions, and it said
--       nothing about WHY. The direct question is cheap and unambiguous:
--       does any function's ACL contain a PUBLIC grant, or is proacl NULL
--       (which means "the hardwired acldefault", which CONTAINS PUBLIC=X)?
--       This single check would have caught the five helpers created after the
--       lockdown, each of which was born public because the schema-scoped
--       default-privileges statement could not remove PUBLIC. See D4.
--
--   D4  `platform_default_acls_still_open` was A FALSE NEGATIVE BY
--       CONSTRUCTION. It counted `(anon|authenticated)=X` in SCHEMA-scoped
--       pg_default_acl rows. It therefore reported `1` — the untouchable
--       supabase_admin row — every single run, and was silent about the actual
--       hole, which was `PUBLIC=X` arriving from acldefault() because no
--       GLOBAL default-ACL row existed to replace it. It measured the thing we
--       cannot fix and ignored the thing we can. And it was "reported", not
--       fatal, so even a true reading changed nothing.
--       → now: a POSITIVE, FATAL assertion. For every role that owns a
--         function in schema public there must be a GLOBAL (defaclnamespace =
--         0) default-ACL row for functions, and it must grant EXECUTE to none
--         of PUBLIC, anon, authenticated. That is the property that makes new
--         objects fail closed; assert the property, not a proxy for it.
--
-- ── THE `authenticated` BASELINE ────────────────────────────────────────
-- 65 client-callable functions cannot be hand-enumerated in a check: a
-- hardcoded list of 65 names is a drift generator, and the first time it is
-- wrong someone deletes the check instead of the hole. So the approved set is
-- SNAPSHOTTED into a table, public.hr_client_rpc_baseline, keyed by
-- (name, identity args, grantee). The assertion is then differential:
--
--     no function may be client-executable unless it is in the baseline
--
-- which catches ADDITIONS — a new RPC granted to authenticated, or a new
-- OVERLOAD of an approved name — while staying silent about the 65 that were
-- reviewed. Widening the surface is a deliberate act: call
-- hr_grant_baseline_sync('why'), which prints the diff it is recording.
-- Removals are also reported, because an RPC that lost its grant is a broken
-- feature and should be noticed by the same run.
--
-- ── SCHEDULE ────────────────────────────────────────────────────────────
-- A check that only runs at the end of a migration only ever sees migrations.
-- Every hole found on 2026-08-11 was created BETWEEN migrations — by an agent
-- with a SQL console, by the dashboard, by a hotfix. So it also runs daily via
-- pg_cron. A failure marks the cron run `failed` in cron.job_run_details,
-- which is exactly what hr_cron_health() in 2026-08-11-telemetry-retention.sql
-- turns into a maintenance_alerts row.
--
-- SAFE TO RE-RUN. Additive. No table dropped, no row of player data touched.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Make the property true before asserting it ────────────────────────
-- A GLOBAL default-privileges row (no `IN SCHEMA`) is the ONLY thing that can
-- remove PUBLIC=EXECUTE from a newly created function, because it REPLACES
-- acldefault() instead of adding to it. Ensure one exists for every role that
-- owns a function in public and that we are a member of. Roles we cannot edit
-- are warned about, not silently skipped — check (5) below then fails on them,
-- which is the correct outcome: it is a real, unfixed hole.
do $$
declare r record; v_n int := 0;
begin
  for r in select distinct rl.rolname
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             join pg_roles rl on rl.oid = p.proowner
            where n.nspname = 'public' and p.prokind in ('f','p')
  loop
    if pg_has_role(current_user, r.rolname, 'USAGE') then
      execute format(
        'alter default privileges for role %I revoke execute on functions from public, anon, authenticated',
        r.rolname);
      v_n := v_n + 1;
    else
      raise warning 'cannot edit default privileges for role % (not a member) — new functions it owns '
                    'will still be born PUBLIC-executable', r.rolname;
    end if;
  end loop;
  raise notice 'global fail-closed function default ACL ensured for % owner role(s)', v_n;
end $$;

-- ── 0b. The approved client surface ──────────────────────────────────────
create table if not exists public.hr_client_rpc_baseline (
  proname       text not null,
  identity_args text not null,
  grantee       text not null check (grantee in ('anon','authenticated')),
  approved_at   timestamptz not null default now(),
  note          text,
  primary key (proname, identity_args, grantee)
);
alter table public.hr_client_rpc_baseline enable row level security;
-- No policies and no grants ON PURPOSE. If a client could read this it would be
-- an RPC directory; if it could write it, the detector would be self-editing.
revoke all on public.hr_client_rpc_baseline from public, anon, authenticated, service_role;

-- ── 1. hr_grant_baseline_sync — widening the surface is a deliberate act ─
-- Returns the diff it recorded. Never called by the assertion, only by an
-- operator (or by the tail of a migration that deliberately adds an RPC).
create or replace function public.hr_grant_baseline_sync(p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- NO TEMP TABLE ON PURPOSE. A SECURITY DEFINER function that resolves an
-- unqualified relation name is a search_path hijack waiting to happen — pg_temp
-- is searched ahead of pg_catalog and cannot be excluded by `set search_path`.
-- The live set is a CTE, repeated, which costs one extra catalogue scan.
declare v_added jsonb; v_removed jsonb;
begin
  with live as (
    select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'),('authenticated')) g(grantee)
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege(g.grantee, p.oid, 'execute')
  ), ins as (
    insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
    select l.proname, l.identity_args, l.grantee, p_note from live l
    on conflict (proname, identity_args, grantee) do nothing
    returning proname, identity_args, grantee)
  select coalesce(jsonb_agg(format('%s(%s) → %s', proname, identity_args, grantee)
                            order by proname, grantee), '[]'::jsonb)
    into v_added from ins;

  with live as (
    select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'),('authenticated')) g(grantee)
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege(g.grantee, p.oid, 'execute')
  ), del as (
    delete from public.hr_client_rpc_baseline b
     where not exists (select 1 from live l
                        where l.proname = b.proname and l.identity_args = b.identity_args
                          and l.grantee = b.grantee)
    returning proname, identity_args, grantee)
  select coalesce(jsonb_agg(format('%s(%s) → %s', proname, identity_args, grantee)
                            order by proname, grantee), '[]'::jsonb)
    into v_removed from del;

  raise notice 'baseline sync: % added, % removed (%)',
    jsonb_array_length(v_added), jsonb_array_length(v_removed), coalesce(p_note, 'no note');
  return jsonb_build_object('added', v_added, 'removed', v_removed, 'note', p_note);
end $$;
revoke execute on function public.hr_grant_baseline_sync(text)
  from public, anon, authenticated, service_role;

-- Seed on first apply only. An empty baseline would make the differential check
-- report all 65 approved RPCs as violations, which is a check nobody keeps.
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.hr_client_rpc_baseline;
  if v_n = 0 then
    perform public.hr_grant_baseline_sync(
      'seeded 2026-08-11 from the post-lockdown client surface reviewed by the Security Engineer');
    select count(*) into v_n from public.hr_client_rpc_baseline;
    raise warning 'hr_client_rpc_baseline seeded with % approved (function, args, role) rows. '
                  'Everything reachable by anon/authenticated RIGHT NOW is now considered approved — '
                  'this is a snapshot of a reviewed state, not an audit.', v_n;
  end if;
end $$;

-- ── 2. THE DETECTOR ──────────────────────────────────────────────────────
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_report jsonb;
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

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 3. Run it daily, not only at the end of a migration ──────────────────
-- Every hole this program found was created BETWEEN migrations.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron is not available — GRANT HYGIENE WILL ONLY RUN AT MIGRATION TIME. '
                  'Schedule by hand: select cron.schedule(''hr-grant-hygiene'', ''50 4 * * *'', '
                  '''select public.hr_assert_grant_hygiene(true)'');';
    return;
  end if;
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is not null then
    perform public.hr_cron_ensure('hr-grant-hygiene', '50 4 * * *',
      'select public.hr_assert_grant_hygiene(true)');
  else
    -- Stand alone: this file must not depend on the server-authority bundle.
    begin perform cron.unschedule('hr-grant-hygiene'); exception when others then null; end;
    perform cron.schedule('hr-grant-hygiene', '50 4 * * *',
      'select public.hr_assert_grant_hygiene(true)');
  end if;
end $$;

-- ── 4. Self-verification ─────────────────────────────────────────────────
do $$
declare v jsonb; v_n bigint;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline missing';
  end if;
  select count(*) into v_n from public.hr_client_rpc_baseline;
  if v_n = 0 then
    raise exception 'the baseline is empty — the differential check would flag every legitimate RPC';
  end if;

  -- The detector must not be callable by the roles it polices.
  if has_function_privilege('anon',          'public.hr_assert_grant_hygiene(boolean)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_assert_grant_hygiene(boolean)', 'execute')
  or has_function_privilege('anon',          'public.hr_grant_baseline_sync(text)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_grant_baseline_sync(text)', 'execute') then
    raise exception 'the grant detector is client-callable — a self-editing baseline is not a control';
  end if;

  -- PROVE THE DEFECTS ARE FIXED, rather than asserting it in a comment. A
  -- detector nobody has ever seen FIRE is a detector nobody knows works —
  -- revision 1 passed every apply for a day while being blind.
  --
  -- No exception handler around this: if any assertion below raises, the whole
  -- migration rolls back (verified: Supabase apply_migration is atomic), so the
  -- probe cannot survive a failure either.
  create or replace function public.hr__hygiene_probe() returns int
    language sql immutable as 'select 1';

  -- D1/D3 — a PUBLIC EXECUTE grant must be seen. On a database where the global
  -- default ACL is correct the probe is born WITHOUT PUBLIC=X, so the hole has
  -- to be created deliberately.
  execute 'grant execute on function public.hr__hygiene_probe() to public';
  v := public.hr_assert_grant_hygiene(false);
  if not (v->'public_execute_functions') @> '["hr__hygiene_probe()"]'::jsonb then
    raise exception 'DETECTOR IS BLIND: a PUBLIC-executable function was not reported (D3). report=%', v::text;
  end if;
  execute 'revoke execute on function public.hr__hygiene_probe() from public';

  -- D2 — reachable by `authenticated` and absent from the baseline must be seen.
  -- This is the dimension revision 1 never asked about, and the dimension all
  -- three confirmed clan holes were reachable on.
  execute 'grant execute on function public.hr__hygiene_probe() to authenticated';
  v := public.hr_assert_grant_hygiene(false);
  if not (v->'unapproved_client_rpcs') @> '["hr__hygiene_probe() → authenticated"]'::jsonb then
    raise exception 'DETECTOR IS BLIND: an unapproved authenticated RPC was not reported (D2). report=%', v::text;
  end if;

  drop function if exists public.hr__hygiene_probe();

  -- And now, clean, it must pass in STRICT mode.
  v := public.hr_assert_grant_hygiene(true);
  raise notice 'GRANT HYGIENE v2 OK — % baseline rows, report %', v_n, v::text;
end $$;
