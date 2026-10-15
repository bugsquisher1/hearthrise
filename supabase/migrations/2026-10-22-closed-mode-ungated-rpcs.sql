-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-22-closed-mode-ungated-rpcs.sql — THE SIX CLIENT RPCs THAT NEVER CALL
--   hr_rpc_gate REFUSE A NON-ADMITTED CALLER THEMSELVES (Security, closed-mode
--   review item R3).
--
-- STATUS: STAGED, NOT APPLIED — Security GO REQUIRED. Lane C2. The Coordinator
-- applies (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). ORDER: after 2026-10-21-closed-mode.sql (hr_access_check
-- must exist — §0 refuses otherwise) and after
-- 2026-10-22-hunt-sessions-delete-away.sql (which restates hr_create_character
-- whole against a pinned pre-image; splicing first would break that pin).
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- Closed mode has four layers (2026-10-21-closed-mode.sql header). L2 is
-- "hr_rpc_gate calls hr_access_check first", which covers the 93 client RPCs
-- that call the gate. Seven never did: hr_load, hr_create_character,
-- hr_clan_browser, hr_companion_equip, hr_companion_grant, hr_rest and
-- hr_set_auto_eat. hr_set_auto_eat is DROPPED by
-- 2026-10-22-hunt-sessions-delete-away.sql. The other six get the same first
-- line L2 gives the gate, so if L1 (the PostgREST pre-request role setting) is
-- ever lost, a non-allowlisted account still cannot create a character, load
-- one, rest, browse clans or touch a companion.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
-- §0 preconditions: hr_access_check exists; hr_set_auto_eat is gone.
-- §1 ONE anchored splice per function, the same shape closed-mode §5 uses on
--    hr_rpc_gate: `perform public.hr_access_check();` becomes the FIRST
--    statement after the body's top-level `begin`. The anchor is
--    "<newline>begin<newline>" and must match EXACTLY ONCE in the
--    pg_get_functiondef text, or the file refuses to patch blind. Already
--    spliced → skipped (idempotent; a second apply is byte-identical).
--    pg_get_functiondef re-emits the proconfig / security / grants-free
--    definition, so owner, SECURITY DEFINER and search_path are unchanged;
--    grants are untouched by CREATE OR REPLACE and re-asserted in §2.
-- §2 grants, revoke first: each stays executable by `authenticated` only
--    (the hr_client_rpc_baseline rows are unchanged).
-- §3 self-check, EXECUTED, every fixture rolled back:
--    (a) each body's first statement is the access check;
--    (b) closed mode forced ON inside the probe: a signed-in NON-allowlisted
--        caller is refused hr_closed (SQLSTATE PGRST) by each of the six, and
--        an allowlisted caller passes the check (hr_load answers);
--    (c) the flag and the fixtures are as they were; grant hygiene green.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Narrows only: six definer bodies gain a refusal line before any read or
-- write. No new function, no new grant, no value moves.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Replay the chain without this file, or re-create each body from
-- pg_get_functiondef with the one line removed. Opening the game (closed_mode
-- = false) makes the line a no-op: hr_admitted answers true for everyone.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_access_check()') is null then
    raise exception 'closed-mode-ungated-rpcs §0: public.hr_access_check() does not exist — apply 2026-10-21-closed-mode.sql first';
  end if;
  if to_regprocedure('public.hr_set_auto_eat(integer,boolean,text,integer,uuid)') is not null
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'hr_set_auto_eat') then
    raise exception 'closed-mode-ungated-rpcs §0: hr_set_auto_eat still exists — apply 2026-10-22-hunt-sessions-delete-away.sql first';
  end if;
end $$;

-- ── §1 THE SPLICE — ONE LINE, FIRST, IN EACH OF THE SIX ──────────────────────
do $$
declare
  f        text;
  v_src    text;
  v_new    text;
  c_anchor constant text := chr(10) || 'begin' || chr(10);
  c_line   constant text := 'perform public.hr_access_check();';
begin
  foreach f in array array[
    'public.hr_load(integer)',
    'public.hr_create_character(integer)',
    'public.hr_clan_browser(integer)',
    'public.hr_companion_equip(integer,text,boolean)',
    'public.hr_companion_grant(integer,text,text,uuid)',
    'public.hr_rest(integer,uuid)'
  ] loop
    select pg_get_functiondef(f::regprocedure) into v_src;
    v_src := replace(v_src, chr(13), '');
    if position(c_line in v_src) > 0 then
      raise notice '% already calls hr_access_check — splice skipped', f;
      continue;
    end if;
    if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
      raise exception '%: anchor ''<newline>begin<newline>'' did not match exactly once — refusing to patch blind', f;
    end if;
    v_new := replace(v_src, c_anchor,
      chr(10) || 'begin' || chr(10) ||
      '  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC' || chr(10) ||
      '  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.' || chr(10) ||
      '  ' || c_line || chr(10));
    execute v_new;
  end loop;
end $$;

-- ── §2 GRANTS — EXACT, REVOKE FIRST ──────────────────────────────────────────
revoke execute on function public.hr_load(integer) from public, anon, service_role;
revoke execute on function public.hr_create_character(integer) from public, anon, service_role;
revoke execute on function public.hr_clan_browser(integer) from public, anon, service_role;
revoke execute on function public.hr_companion_equip(integer,text,boolean) from public, anon, service_role;
revoke execute on function public.hr_companion_grant(integer,text,text,uuid) from public, anon, service_role;
revoke execute on function public.hr_rest(integer,uuid) from public, anon, service_role;
grant execute on function public.hr_load(integer) to authenticated;
grant execute on function public.hr_create_character(integer) to authenticated;
grant execute on function public.hr_clan_browser(integer) to authenticated;
grant execute on function public.hr_companion_equip(integer,text,boolean) to authenticated;
grant execute on function public.hr_companion_grant(integer,text,text,uuid) to authenticated;
grant execute on function public.hr_rest(integer,uuid) to authenticated;

-- ── §3 SELF-CHECK, EXECUTED ──────────────────────────────────────────────────
do $$
declare
  f       text;
  v_def   text;
  v_body  text;
  v_err   text;
  v_r     jsonb;
  v_flag  boolean;
  v_in    uuid := '00000000-0000-4000-8000-0000000c2a01';
  v_out   uuid := '00000000-0000-4000-8000-0000000c2a02';
  c_line  constant text := 'perform public.hr_access_check();';
  c_six   constant text[] := array[
    'public.hr_load(integer)',
    'public.hr_create_character(integer)',
    'public.hr_clan_browser(integer)',
    'public.hr_companion_equip(integer,text,boolean)',
    'public.hr_companion_grant(integer,text,text,uuid)',
    'public.hr_rest(integer,uuid)'];
begin
  select enabled into v_flag from public.hr_flags where key = 'closed_mode';

  -- (a) the check is the first statement of each body, and the grants are exact.
  foreach f in array c_six loop
    select replace(prosrc, chr(13), '') into v_body from pg_proc where oid = f::regprocedure;
    if regexp_replace(substr(v_body, position(chr(10) || 'begin' || chr(10) in v_body) + 7), '^(\s*--[^\n]*\n)*\s*', '')
       not like c_line || '%' then
      raise exception 'closed-mode-ungated-rpcs §3a: % does not open with %', f, c_line; end if;
    if not has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'closed-mode-ungated-rpcs §3a: % grants moved', f; end if;
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'closed-mode-ungated-rpcs §3a: % is no longer SECURITY DEFINER', f; end if;
  end loop;

  -- (b) BEHAVIOUR, closed mode forced on, every row rolled back.
  begin
    insert into auth.users (id) values (v_in), (v_out) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_in, 'ungated-rpcs self-check')
      on conflict (user_id) do nothing;
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'self-check')
      on conflict (key) do update set enabled = true;

    perform set_config('request.jwt.claim.sub', v_out::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    foreach f in array c_six loop
      v_err := null;
      begin
        case f
          when 'public.hr_load(integer)' then perform public.hr_load(0);
          when 'public.hr_create_character(integer)' then perform public.hr_create_character(0);
          when 'public.hr_clan_browser(integer)' then perform public.hr_clan_browser(25);
          when 'public.hr_companion_equip(integer,text,boolean)' then perform public.hr_companion_equip(0, 'fox', true);
          when 'public.hr_companion_grant(integer,text,text,uuid)' then perform public.hr_companion_grant(0, 'fox', 'shop', gen_random_uuid());
          when 'public.hr_rest(integer,uuid)' then perform public.hr_rest(0, gen_random_uuid());
        end case;
      exception when sqlstate 'PGRST' then
        v_err := sqlerrm;
      end;
      if v_err is null or position('"code":"hr_closed"' in v_err) = 0 then
        raise exception 'closed-mode-ungated-rpcs §3b: % admitted a non-allowlisted caller (%)', f, v_err; end if;
    end loop;

    -- the allowlisted caller passes the check (hr_load answers, whatever it says)
    perform set_config('request.jwt.claim.sub', v_in::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
    v_r := public.hr_load(0);
    if v_r is null then raise exception 'closed-mode-ungated-rpcs §3b: hr_load answered nothing for an allowlisted caller'; end if;

    raise exception using errcode = 'HRC3U', message = 'closed-mode-ungated-rpcs §3 complete — rolling back';
  exception when sqlstate 'HRC3U' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- (c) the fixtures are gone and the flag is what it was; hygiene still holds.
  if exists (select 1 from auth.users where id in (v_in, v_out))
     or exists (select 1 from public.hr_access_allowlist where user_id in (v_in, v_out))
     or (select enabled from public.hr_flags where key = 'closed_mode') is distinct from v_flag then
    raise exception 'closed-mode-ungated-rpcs §3c: the self-check left a fixture or moved the flag'; end if;
  perform public.hr_assert_grant_hygiene(true);
end $$;
