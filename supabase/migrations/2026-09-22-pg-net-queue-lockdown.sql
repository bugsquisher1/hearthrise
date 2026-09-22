-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-22-pg-net-queue-lockdown.sql
-- T-5 OF docs/planning/SEC_WORLD_TICK_M1_2026-09-21.md: THE TICK BEARER TRANSITS
-- pg_net's QUEUE, SO NO CLIENT ROLE MAY READ IT.
--
-- pg_net installs `net.http_request_queue` and `net._http_response` with SELECT
-- granted to PUBLIC (measured on production 2026-09-22 21:35 UTC via
-- aclexplode: grantee "-" = PUBLIC, plus supabase_admin), and USAGE on schema
-- `net` to anon/authenticated/service_role. The world-tick driver
-- (hr_tick_cron_run, 2026-09-21-world-tick-cron.sql) POSTs to hr-accrue with the
-- X-HR-Tick-Auth bearer read from Vault, and that request row — headers
-- included — sits in `net.http_request_queue` until the worker drains it.
-- Security's runbook step 0a: "A TRUE on http_request_queue means the tick
-- bearer is readable by that role and the milestone does not arm until it is
-- revoked." This file is that revoke, recorded.
--
-- WHAT IT DOES: revokes SELECT on the two tables from PUBLIC and from the four
-- roles the runbook names. postgres (the driver's owner, and the operator who
-- verifies a rotation by reading `net._http_response`) and supabase_admin keep
-- theirs. Nothing else moves: no grant is added, no function, no policy.
--
-- REPLAY-SAFE: PGlite has no pg_net; every statement is guarded on the tables
-- existing, so the chain replays this file as a no-op and a second apply on
-- production is byte-identical (revoking an absent privilege is a no-op).
-- ═══════════════════════════════════════════════════════════════════════════

do $lock$
begin
  if to_regclass('net.http_request_queue') is null then
    raise notice 'pg-net-queue-lockdown: net.http_request_queue absent (no pg_net here); nothing to revoke';
    return;
  end if;
  revoke select on net.http_request_queue, net._http_response from public;
  revoke select on net.http_request_queue, net._http_response from anon, authenticated, service_role;
  if to_regrole('hr_engine') is not null then
    revoke select on net.http_request_queue, net._http_response from hr_engine;
  end if;
end $lock$;

-- ── §4 SELF-CHECK: asserted by execution, no player row read or written ──────
do $chk$
declare r text; t text; v boolean;
begin
  if to_regclass('net.http_request_queue') is null then
    raise notice 'pg-net-queue-lockdown self-check: skipped (no pg_net here)';
    return;
  end if;
  foreach t in array array['net.http_request_queue', 'net._http_response'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(r, t, 'SELECT') then
        raise exception 'T-5: % can still SELECT % — the tick bearer would be readable', r, t;
      end if;
    end loop;
    if to_regrole('hr_engine') is not null and has_table_privilege('hr_engine', t, 'SELECT') then
      raise exception 'T-5: hr_engine can still SELECT %', t;
    end if;
    -- the operator keeps the read it needs to verify a rotation (runbook: net._http_response, status 401)
    if not has_table_privilege('postgres', t, 'SELECT') then
      raise exception 'T-5: postgres lost SELECT on % — the rotation check would be blind', t;
    end if;
  end loop;
end $chk$;
