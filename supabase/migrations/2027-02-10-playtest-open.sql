-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-10-playtest-open.sql — THE GAME OPENS FOR THE DISCORD PLAYTEST:
--   closed_mode reads OPEN, so a brand-new account is admitted by every gate
--   closed mode installed (lane/c-playtest-open, backend-architect, 2026-10-29).
--
-- STATUS: STAGED. APPLY ONLY ON TYLER'S GO FOR THE 2026-10-30 PLAYTEST (Tyler
-- 2026-10-25: "open Friday as is"; no Security gate before EA, CLAUDE.md §2).
-- The Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00–00:10 UTC). EDGE: none. CLIENT: none (the client
-- already treats every answer that is not `hr_closed` as the game).
-- APPLY ORDER: anywhere after 2026-10-21-closed-mode.sql; it is in
-- tests/schema-apply-order.json `excluded`, NOT `order` — see REPLAY below.
--
-- ── WHAT IT IS ───────────────────────────────────────────────────────────────
-- 2026-10-21-closed-mode.sql §2 named the opening as ONE statement:
--     update public.hr_flags set enabled = false where key = 'closed_mode';
-- This file is that statement, made idempotent and self-checking. NOTHING ELSE
-- MOVES: the allowlist, the pre-request hook (L1), the hr_rpc_gate line (L2),
-- the hr_rate_gate line (L3), the restrictive policies (L4) all stay, and each
-- reads the flag on every call (hr_admitted: `not enabled` OR allowlisted), so
-- re-closing is the reverse UPDATE and needs no migration.
--
-- ── THE NEW ACCOUNT'S PATH, CHECKED ON THE REPLAYED CHAIN (tests/playtest-open.mjs)
--   sign-up      GoTrue -> hr_signup_gate (hook) + hr_beta_gate_on_auth_user
--                (trigger): hr_settings.beta_gate is 'off' on production
--                (read 2026-10-29), so a codeless sign-up is allowed and
--                journalled; brake 10 codeless sign-ups per IP per day.
--                handle_new_user writes the profile. No allowlist read.
--   boot         hr_load: hr_access_check (L1 + its own first line) admits.
--   first hero   hr_create_hero: admitted; 2 slots per account (config).
--   first hunt   hr_hunt_enter mill_cellar: hr_rpc_gate('hunt') 30/min PER USER;
--                the play cap is 4 heroes per ACCOUNT and per NETWORK (salted IP).
--   engine       hr-accrue: hr_rate_gate / hr_engine_closed read hr_admitted.
--   Every rate bucket on the path is keyed by the user (or, for anon, by IP);
--   none is global, so ten accounts at once are ten budgets. The only
--   allowlist reader is hr_admitted. Nothing else must ship with the flip.
--
-- ── §4 SELF-CHECK (executed, every fixture rolled back) ─────────────────────
--   k1 the flag row exists once and reads open.
--   k2 a signed-in account on NO allowlist is admitted: hr_admitted, the
--      pre-request hook as `authenticated`, hr_rpc_gate, hr_rate_gate (the
--      engine's door), hr_load as `authenticated` answers instead of raising
--      hr_closed, and the L4 policy predicate is true for it. CONTROL: the same
--      probes with the flag forced closed refuse it (so k2 measures the flag).
--   k3 anon still cannot write: no EXECUTE on hr_admitted, and an INSERT as
--      anon into each client-writable table is refused 42501.
--   k4 closed mode is intact for re-closing: the hook, the L2/L3 lines and the
--      restrictive policies are all still installed.
--   k5 fixtures gone, flag as this file left it; grant hygiene green.
--
-- ── REPLAY (why `excluded`) ─────────────────────────────────────────────────
--   An operator switch that WIDENS exposure is earned on the live database,
--   like the world-tick arms: a database rebuilt from the repo comes back
--   CLOSED (closed-mode §2 lands it closed; a missing row reads closed) and is
--   opened again by applying this file. Replaying it would also turn
--   `hunt-sessions-settle --closed` (keepClosed) into an open-game run without
--   anyone noticing. tests/playtest-open.mjs replays the chain closed, applies
--   this file twice (the second apply moves nothing) and walks the path above.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   Every signed-in account reaches the RPC surface the allowlisted accounts
--   reach today; anon may READ the 18 player-written tables closed-mode §7c
--   hid while closed (chat, names, market, clans: the pre-closed posture).
--   No grant, policy or function changes. Money paths are unchanged.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   One row update. Per request: unchanged (one indexed flag read).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   update public.hr_flags set enabled = true, updated_at = now() where key = 'closed_mode';
--   (every gate refuses non-allowlisted accounts again at once; nothing dropped)
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_flags') is null
     or to_regclass('public.hr_access_allowlist') is null then
    raise exception 'PRECONDITION: hr_flags / hr_access_allowlist absent (apply 2026-10-21-closed-mode.sql first)';
  end if;
  if to_regprocedure('public.hr_admitted(uuid)') is null
     or to_regprocedure('public.hr_access_check()') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_rate_gate(uuid,integer,text)') is null
     or to_regprocedure('public.hr_load(integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a closed-mode gate or hr_load is absent';
  end if;
  -- The switch must still be the thing the gates read: hr_admitted reads the flag row.
  if position('closed_mode' in (select prosrc from pg_proc where oid = 'public.hr_admitted(uuid)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_admitted no longer reads the closed_mode flag — opening it would open nothing; re-measure';
  end if;
end $mig$;

-- ── §1 THE SWITCH: OPEN ─────────────────────────────────────────────────────
-- Idempotent: the update fires only while the row reads closed, so a second
-- apply writes no row version. A missing row (reads closed) is created open.
insert into public.hr_flags (key, enabled, note, updated_at)
values ('closed_mode', false,
        'CLOSED MODE (2026-10-21-closed-mode.sql). FALSE = open (2027-02-10-playtest-open.sql, the '
        '2026-10-30 Discord playtest). TRUE = only accounts in public.hr_access_allowlist get past '
        'the server. A missing row reads as closed.',
        now())
on conflict (key) do update
   set enabled = false, updated_at = now()
 where public.hr_flags.enabled;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ──────────────────
do $mig$
declare
  v_new  constant uuid := '000000c1-0000-0000-0000-0000000000d4';   -- a brand-new account, on no allowlist
  v_err  text; v_n int; v_ok boolean; v_r jsonb; v_flag boolean; v_upd timestamptz;
  t      text;
begin
  -- k1 the flag reads open, one row.
  if (select count(*) from public.hr_flags where key = 'closed_mode') <> 1 then
    raise exception 'playtest-open §2 k1: closed_mode must be exactly one row'; end if;
  select enabled, updated_at into v_flag, v_upd from public.hr_flags where key = 'closed_mode';
  if v_flag then raise exception 'playtest-open §2 k1: closed_mode still reads CLOSED'; end if;

  begin
    insert into auth.users (id) values (v_new) on conflict (id) do nothing;
    if exists (select 1 from public.hr_access_allowlist where user_id = v_new) then
      raise exception 'playtest-open §2 k2: the probe account is allowlisted — it would prove nothing'; end if;

    -- k2 CONTROL FIRST: closed, the same account is refused by the hook and both gates.
    update public.hr_flags set enabled = true where key = 'closed_mode';
    if public.hr_admitted(v_new) or public.hr_rate_gate(v_new, 0, 'accrue') then
      raise exception 'playtest-open §2 k2 (control): closed, a non-allowlisted account is admitted'; end if;
    perform set_config('request.jwt.claim.sub', v_new::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      set local role authenticated;
      perform public.hr_load(0);
    exception when sqlstate 'PGRST' then v_err := sqlerrm;
    end;
    reset role;
    if v_err is null or position('"code":"hr_closed"' in v_err) = 0 then
      raise exception 'playtest-open §2 k2 (control): closed, hr_load did not refuse hr_closed (%)', v_err; end if;

    -- k2 OPEN: the same account, the same probes, admitted.
    update public.hr_flags set enabled = false where key = 'closed_mode';
    if not public.hr_admitted(v_new) then
      raise exception 'playtest-open §2 k2: open, hr_admitted refuses a new account'; end if;
    if not public.hr_rate_gate(v_new, 0, 'accrue') then
      raise exception 'playtest-open §2 k2: open, hr_rate_gate (the engine door) refuses a new account'; end if;
    if not public.hr_rpc_gate('hunt') then
      raise exception 'playtest-open §2 k2: open, hr_rpc_gate refuses a new account'; end if;
    v_err := null;
    begin
      set local role authenticated;
      perform public.hr_access_check();
      select public.hr_load(0) into v_r;
      select count(*) into v_n where (select public.hr_admitted((select auth.uid())));   -- the L4 predicate
    exception when sqlstate 'PGRST' then v_err := sqlerrm;
    end;
    reset role;
    if v_err is not null then
      raise exception 'playtest-open §2 k2: open, a new account was refused (%)', v_err; end if;
    if v_r is null or jsonb_typeof(v_r) <> 'object' then
      raise exception 'playtest-open §2 k2: open, hr_load did not answer the new account (%)', v_r; end if;
    if v_n <> 1 then raise exception 'playtest-open §2 k2: open, the L4 policy predicate refuses a new account'; end if;

    -- k3 anon still cannot write.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    if has_function_privilege('anon', 'public.hr_admitted(uuid)', 'execute') then
      raise exception 'playtest-open §2 k3: anon can execute hr_admitted'; end if;
    foreach t in array array['bug_reports', 'chat_blocks', 'chat_messages', 'chat_whispers',
                             'clan_members', 'game_events', 'session_claims'] loop
      continue when to_regclass('public.' || t) is null;
      v_ok := false;
      begin
        set local role anon;
        execute format('insert into public.%I default values', t);
      exception when insufficient_privilege then v_ok := true;
      end;
      reset role;
      if not v_ok then raise exception 'playtest-open §2 k3: anon reached past the privilege/RLS check on %', t; end if;
    end loop;

    raise exception using errcode = 'HRP10', message = 'playtest-open §2 complete — rolling back';
  exception when sqlstate 'HRP10' then
    null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- k4 closed mode is intact, so closing again is one UPDATE.
  if position('perform public.hr_access_check();'
              in replace(pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'playtest-open §2 k4: hr_rpc_gate lost its access line'; end if;
  if position('if not public.hr_admitted(p_user) then return false; end if;'
              in replace(pg_get_functiondef('public.hr_rate_gate(uuid,integer,text)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'playtest-open §2 k4: hr_rate_gate lost its admitted line'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and policyname = 'hr_closed_admit'
         and permissive = 'RESTRICTIVE') < 6 then
    raise exception 'playtest-open §2 k4: the restrictive hr_closed_admit policies are not all installed'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticator')
     and not exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c
                      where s.setrole = 'authenticator'::regrole and s.setdatabase = 0
                        and c = 'pgrst.db_pre_request=public.hr_access_check') then
    raise exception 'playtest-open §2 k4: the pre-request hook is gone'; end if;

  -- k5 the fixtures are gone and the flag is what §1 left.
  if exists (select 1 from auth.users where id = v_new) then
    raise exception 'playtest-open §2 k5: the probe account survived'; end if;
  if (select enabled from public.hr_flags where key = 'closed_mode')
     or (select updated_at from public.hr_flags where key = 'closed_mode') is distinct from v_upd then
    raise exception 'playtest-open §2 k5: the self-check moved the flag'; end if;
  perform public.hr_assert_grant_hygiene(true);
end $mig$;
