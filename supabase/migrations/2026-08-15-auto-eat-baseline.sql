-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — record hr_set_auto_eat in the client-RPC baseline
--
-- WHY THIS EXISTS, AND WHY IT IS A SEPARATE FILE.
-- `2026-08-15-auto-eat.sql` granted EXECUTE on `hr_set_auto_eat` to
-- `authenticated` — correctly, because the player is the only party who may
-- choose their own food and threshold, and the function is deliberately NOT
-- granted to `hr_engine` so the engine can never switch a paid trait on for
-- somebody. But it did not add the matching row to `hr_client_rpc_baseline`,
-- and check (2) of `hr_assert_grant_hygiene` raises on exactly that:
--
--   unapproved_client_rpcs: ["hr_set_auto_eat(...) → authenticated"]
--
-- That detector runs NIGHTLY on pg_cron (`hr-grant-hygiene`, 50 4 * * *), so
-- the job would have failed every run until this landed, and any later
-- migration calling the strict form would have been refused.
--
-- THIS IS THE SECOND TIME THIS EXACT DEFECT HAS SHIPPED. `2026-08-12-raid-band-
-- fairness.sql` did the same thing with three `hr_hunt_*` functions. The fix
-- there was to REVOKE, because the client never called them. The fix here is
-- the opposite — add the baseline row — and the difference is the whole point
-- of the baseline: it is a standing statement that a client MAY call something.
-- Writing one to silence a detector for a surface the client does not use
-- inverts its meaning; writing one for a surface the client genuinely owns is
-- what it is for.
--
-- GENERALISE IT: a migration that grants a new client-callable RPC is not
-- finished until it has decided which of those two it is. Adding the grant and
-- the baseline row in the same file would have made this impossible to forget.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  if to_regproc('public.hr_set_auto_eat') is null then
    raise exception 'hr_set_auto_eat absent — apply 2026-08-15-auto-eat.sql first';
  end if;

  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'auto-eat settings: the player owns their own food + threshold. Deliberately NOT '
         'granted to hr_engine — the engine must never switch a paid trait on for somebody. '
         '2026-08-15'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'hr_set_auto_eat'
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % row(s) recorded for hr_set_auto_eat', v_n;
end $$;

-- ── The commit gate ──────────────────────────────────────────────────────
-- Not "did the insert run" — that is satisfied by an insert that recorded the
-- wrong signature. The gate is the DETECTOR ITSELF passing in its strict form,
-- which is the same call the nightly cron makes. If this file records a
-- signature that does not match the live function, the row does not silence the
-- check and this raises.
do $$
declare v_report jsonb;
begin
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene still reports unapproved client RPCs: %',
      v_report->'unapproved_client_rpcs';
  end if;

  -- And the property the baseline row must NOT quietly grant: the engine still
  -- cannot call it. A baseline row records an approval; it must not become a
  -- back door for the role that computes other people's progression.
  if has_function_privilege('hr_engine', 'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute') then
    raise exception 'hr_engine can execute hr_set_auto_eat — the engine must never set a paid trait for a player';
  end if;

  raise notice 'AUTO-EAT BASELINE OK — hygiene clean in strict form, engine still refused.';
end $$;
