-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1003-dead-client-writes.sql — THE LAST THREE DEAD CLIENT-WRITABLE TABLES CLOSE, AND THE DETECTOR SEES A REGRANT
--   (lane/c-server-cost, backend-architect, 2026-11-19; the 11-19 server audit, row 1).
--
-- STATUS: supabase/migration-notes/1003-dead-client-writes.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── THE HOLE ────────────────────────────────────────────────────────────────
-- Measured on the replayed chain (set/v0.2.143): four public tables still took a client's own INSERT/UPDATE/DELETE through
--   PostgREST. One is live (bug_reports, the report form). Three are dead, each still writable by any signed-in account:
--   game_events     authenticated INSERT, policy "own events insert". The per-kill event log of the old client (1.6M rows,
--                   229 MB in four days, CLAUDE.md law 6); no writer since. Read only by its trim (hr_trim_game_events, cron).
--   session_claims  authenticated SELECT/INSERT/UPDATE/DELETE, four "_own" policies. The old client's tab claim; no reader.
--   clan_members    authenticated INSERT/DELETE (+ SELECT, anon SELECT), policies "join as self", "leave as self",
--                   "memberships readable". Every clan door is a SECURITY DEFINER RPC (clan_join, clan_leave, ...), which
--                   writes as the owner; the raw path wrote a forgeable join straight past them.
--   CALLERS, proved: no `game_events`, `session_claims` or `clan_members` outside comments in src/, supabase/functions/ or tools/
--   (the client reaches the database only through /rest/v1/rpc/, src/session/server.js); no view, publication or client-callable
--   function reads them as the caller (the clan functions and hr_trim_game_events are SECURITY DEFINER).
-- And the detector could not see a regrant: check (4) arm 2 exempts a table with ANY write policy, and the closed-mode
--   RESTRICTIVE "for all" policy (hr_closed_admit, on all three) counted as one.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1  revoke every privilege anon and authenticated (and PUBLIC) hold on the three tables; drop their PERMISSIVE client policies.
--     The tables, their rows, triggers, the trim job and the restrictive closed-mode policies stay (inert without a grant): dropping
--     a table is a separate cut, and nothing here needs one.
-- THE DETECTOR that makes a regrant fatal is 1004-tick-pack-heroes.sql's (link 24 of HR_GRANT_HYGIENE_CHAIN, check (4) ARM 3:
--     any client INSERT/UPDATE/DELETE outside the live set, bug_reports:authenticated:INSERT, and hr_client_write_baseline,
--     whatever its policies say), restated in ONE staged file so the staged tail re-applies in order (tests/schema-drift.mjs).
-- REFUSAL CODES: none; a raw PostgREST write to any of the three now answers 42501 (permission denied).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- DDL only; revokes and `drop policy if exists` are idempotent: a second apply is byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- CLOSES three client write paths (a forged clan membership row past clan_join's checks; unbounded junk into game_events and
--   session_claims). No new grant, function or table.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- None at runtime.
--
-- APPLY RISK, stated: a client write grant production holds and the repo does not is a §4 finding: the apply rolls back naming it.
-- EDGE: none. CLIENT: none (no caller).
-- GUARDS: this file's §4; 1004-tick-pack-heroes.sql §5 r1 (each regrant shape planted and named by arm 3).
-- REVERSIBLE: re-apply the three tables' grants and policies from 2026-08-10-session-claims.sql, the clan files and the game_events
--   base. Nothing to restore: no row moved.
-- WIPE: nothing new.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.game_events') is null or to_regclass('public.session_claims') is null or to_regclass('public.clan_members') is null
     or to_regclass('public.hr_client_write_baseline') is null then
    raise exception 'PRECONDITION: a table this file closes (or the write baseline) is missing'; end if;
end $mig$;

-- ── §1 THE THREE TABLES CLOSE ────────────────────────────────────────────────
revoke all on public.game_events from public, anon, authenticated;
revoke all on public.session_claims from public, anon, authenticated;
revoke all on public.clan_members from public, anon, authenticated;
drop policy if exists "own events insert" on public.game_events;
drop policy if exists session_claims_select_own on public.session_claims;
drop policy if exists session_claims_insert_own on public.session_claims;
drop policy if exists session_claims_update_own on public.session_claims;
drop policy if exists session_claims_delete_own on public.session_claims;
drop policy if exists "join as self" on public.clan_members;
drop policy if exists "leave as self" on public.clan_members;
drop policy if exists "memberships readable" on public.clan_members;

-- ── §4 THE SELF-CHECK, BY EXECUTING IT ───────────────────────────────────────
-- (a) no anon / authenticated privilege of any kind on the three tables, and no permissive policy left on them;
-- (b) the detector passes strict on this state;
-- (c) the detector is not client-executable. The regrant plants (each shape NAMED and fatal) run in 1004-tick-pack-heroes.sql,
--     whose link 24 of the detector carries the arm that names them.
do $$
declare v jsonb; v_role text; v_t text; v_named text;
begin
  -- (a)
  foreach v_t in array array['game_events', 'session_claims', 'clan_members'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || v_t, 'select,insert,update,delete,truncate,references,trigger,maintain') then
        raise exception 'VERIFY(a): % still holds a privilege on %', v_role, v_t; end if;
    end loop;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_t and permissive = 'PERMISSIVE') then
      raise exception 'VERIFY(a): % keeps a permissive policy: %', v_t,
        (select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = v_t and permissive = 'PERMISSIVE'); end if;
  end loop;
  -- (b)
  perform public.hr_assert_grant_hygiene(true);
  if not has_table_privilege('authenticated', 'public.bug_reports', 'insert') then
    raise exception 'VERIFY(b) CANNOT RUN: bug_reports lost its live INSERT; the live pair is no longer a control'; end if;
  -- (c)
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_assert_grant_hygiene(boolean)', 'execute') then
      raise exception 'VERIFY(c): % can execute the detector', v_role; end if;
  end loop;
  raise notice 'dead-client-writes: game_events, session_claims and clan_members take no client write; a regrant is fatal';
end $$;
