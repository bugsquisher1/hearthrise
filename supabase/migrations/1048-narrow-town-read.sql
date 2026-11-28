-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1048-narrow-town-read.sql — THE WORLD TICK READS A TOWN HERO'S ENGINE INPUTS, NOT THE WHOLE HERO
--   (lane/c-settle-cost FB-4, reliability-engineer, 2026-11-21; study 48 section 3 "the settle read" row of town work and
--   section 9 "the narrow town read", build plan 13 section 2.6 FB-4).
--
-- STATUS: supabase/migration-notes/1048-narrow-town-read.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (after FB-2's 1040, whose
--   hr_state_of image (1032's) this read mirrors). Applied as ONE transaction by the apply tool; never begin/commit here.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- REAL (48 section 2): a town settle on the tick is 90 ms, half of it the WHOLE-HERO read the tick makes to learn the
-- hero's activity: hr_state_of, every section of the envelope (about 50: the shop, the market, the party, the home...),
-- 48 ms, 0.84 a town settle. The town engine reads eleven fields of it (supabase/functions/hr-accrue/envelope.js
-- engineInputsFromEnvelope) and tick.js four more (the pointer and the version).
--
-- AMENDED IN PLACE by lane/bench-cut-server (09-crafting.md 4.17, 1079-one-town-work-cut.sql), before it ever applied: the bench tax is cut, so the read carries no `bench_tax` and needs no hr_bench_tax_view.
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_tick_town_state(p_user, p_slot) -> jsonb  NEW, SECURITY DEFINER, EXECUTE for hr_engine only (as hr_accrue_read). The
--   town engine's inputs, each by the SAME definition hr_state_of uses, and nothing else:
--     hr_hunt_member_state (the hunt settle's engine inputs, one definition: version, gm, buffs, gold, hp, level_xp,
--       hearthfind_ready, deaths_lifetime, deaths_today, skills, inventory, equipment)
--     + state.{slot, active_kind, active_id, active_since, accrued_to, bank_cap, tool_carry, fight}: hr_state_of's columns
--     + bank: hr_state_of's expression (account_bank)
--     + bench_run, bench_tax, skill_inputs: the registry's own section functions (hr_state_sections: hr_bench_run_view,
--       hr_bench_tax_view, hr_skill_inputs_view), called as hr_state_sections_of calls them
--     + now.
--   S-8 HOLDS: the read still comes BEFORE the probe (tick.js (1)), names only the (user, slot) the roster leased, and
--   carries active_kind from the same row as the version. A town hero's engine inputs are byte-for-byte what
--   engineInputsFromEnvelope builds from hr_state_of (§4(b) on a probe hero; tests/town-read.mjs on real town fixtures).
-- THE DETECTOR KNOWS THE GRANT FROM 1032-approved-cuts.sql: its hr_assert_grant_hygiene (link 25, tools/derive-grant-hygiene.mjs
--   `narrow_town_read`) carries `hr_tick_town_state(uuid,integer)` at the head of c_engine_allow. ONE staged file restates the
--   detector (link 24's rule: the staged tail is re-applied in order, and a staged link re-applied over a later one would put the
--   later's entries out), so this file restates nothing and §0 requires the entry. Read-only: one character the caller names,
--   the same one hr_engine already reads whole.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- A STABLE read in the caller's one statement. A second apply restates the same body and the same grants.
-- EXPLOIT SURFACE: none new. hr_engine already reads every field of it through hr_state_of; the client cannot call it.
-- COST: about half a town settle (48: 40% of a town settle), at every town hero's every flush.
-- EDGE: tick.js calls it in place of hr_state_of (the same deploy). The edge deploys after this file in the release
--   window; an edge before it calls hr_state_of as before. CLIENT: none.
-- REVERSIBLE: the edge back to hr_state_of; drop the function (the detector's entry then names nothing hr_engine can run).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_member_state(uuid,integer)') is null or to_regprocedure('public.hr_bench_run_view(uuid,integer)') is null
     or to_regprocedure('public.hr_skill_inputs_view(uuid,integer)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: the member state, a section function or hr_state_of is missing'; end if;
  -- the sections the read calls are still the registry's for those keys
  if (select count(*) from public.hr_state_sections where (key, fn) in (('bench_run', 'hr_bench_run_view'),
                                                                        ('skill_inputs', 'hr_skill_inputs_view'), ('gm', 'hr_gm_section'))) <> 3 then
    raise exception 'PRECONDITION: hr_state_sections no longer maps bench_run, skill_inputs and gm to the functions this read calls'; end if;
  -- the detector already allows the grant §1 makes (1032's link 25): without it the grant would read engine_execute_outside_allowlist
  if strpos((select prosrc from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure),
            '''hr_tick_town_state(uuid,integer)''') = 0 then
    raise exception 'PRECONDITION: hr_assert_grant_hygiene''s c_engine_allow lacks hr_tick_town_state(uuid,integer): apply 1032-approved-cuts.sql (link 25) first'; end if;
end $mig$;

-- ── §1 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_tick_town_state(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- NARROW-TOWN-READ (1048-narrow-town-read.sql): the world tick's read of a town hero (tick.js tickOne (1)). The engine inputs
-- envelope.js engineInputsFromEnvelope builds a town session from and the pointer and version tick.js reads, each by
-- hr_state_of's own definition, and none of the envelope's other sections.
declare
  v_role text;
  v_st   public.player_state%rowtype;
  v_m    jsonb;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_town_state: not callable by %', v_role using errcode = '42501';
  end if;
  select * into v_st from public.player_state where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_m := public.hr_hunt_member_state(p_user, v_st.slot);
  if coalesce((v_m ->> 'ok')::boolean, false) is not true then return v_m; end if;
  return v_m || jsonb_build_object(
    'now', now(),
    'state', (v_m -> 'state') || jsonb_build_object(
      'slot', v_st.slot,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight),
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.account_bank where user_id = p_user), '{}'::jsonb),
    'bench_run', public.hr_bench_run_view(p_user, v_st.slot),
    'skill_inputs', public.hr_skill_inputs_view(p_user, v_st.slot));
end $fn$;

do $mig$
begin
  revoke all on function public.hr_tick_town_state(uuid, integer) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.hr_tick_town_state(uuid, integer) from anon, authenticated, service_role; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_tick_town_state(uuid, integer) from hr_tick; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_tick_town_state(uuid, integer) to hr_engine; end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe is rolled back ─────────
-- (a) the grants: hr_engine may run the read, no client role and not hr_tick; a client role is refused by the body too
-- (b) THE ENGINE INPUTS ARE hr_state_of's: on a probe hero at the bench (bag, Storage, buffs, a counted run, skills with a
--     carried remainder, worn gear, a death today), every key engineInputsFromEnvelope reads and every key tick.js reads is
--     the same JSON in both reads; and the read carries no section the town engine does not read
-- (c) the detector passes with the new grant
do $chk$
declare
  u constant uuid := '000000c0-0000-4000-a000-00000b0a1043';
  v_a jsonb; v_b jsonb; k text; v_err text;
begin
  if not has_function_privilege('hr_engine', 'public.hr_tick_town_state(uuid,integer)', 'execute') then
    raise exception 'narrow-town-read §4(a): hr_engine cannot run the read'; end if;
  if exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('hr_tick')) x(r)
              where exists (select 1 from pg_roles where rolname = x.r)
                and has_function_privilege(x.r, 'public.hr_tick_town_state(uuid,integer)', 'execute')) then
    raise exception 'narrow-town-read §4(a): a client role or hr_tick may run the read'; end if;

  begin
    insert into auth.users (id) values (u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (u, 'narrow-town-read §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', u::text, true);
    if (public.hr_create_character(0) ->> 'created') is distinct from 'true' then
      raise exception 'narrow-town-read §4(b): the probe hero was not created'; end if;
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_since = now() - interval '1 hour',
           accrued_to = now() - interval '10 minutes', bank_cap = 400, tool_carry = '{"axe": 3}'::jsonb,
           buffs = jsonb_build_array(jsonb_build_object('type', 'xp', 'magnitude', 0.1, 'until', (now() + interval '20 minutes')::text,
                                                        'from', (now() - interval '5 minutes')::text, 'scale', 1.2))
     where user_id = u and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (u, 0, 'bones', 120)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    insert into public.account_bank (user_id, item_id, qty) values (u, 'bones', 500)
      on conflict (user_id, item_id) do update set qty = excluded.qty;
    update public.player_skills set xp = xp + 1234, xp_frac = 0.375 where user_id = u and slot = 0;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key)
      values (u, 0, 'stat', 'deaths', 2, ''), (u, 0, 'stat', 'deaths', 1, public.hr_utc_day_key(now()))
      on conflict do nothing;
    v_a := public.hr_tick_town_state(u, 0);
    v_b := public.hr_state_of(u, 0);
    if (v_a ->> 'ok')::boolean is not true then raise exception 'narrow-town-read §4(b): the read answered %', v_a; end if;
    foreach k in array array['version', 'gm', 'buffs', 'inventory', 'equipment', 'bank', 'bench_run', 'skill_inputs'] loop
      if (v_a -> k) is distinct from (v_b -> k) then
        raise exception 'narrow-town-read §4(b): % is % in the read, % in hr_state_of', k, v_a -> k, v_b -> k; end if;
    end loop;
    foreach k in array array['slot', 'active_kind', 'active_id', 'active_since', 'accrued_to', 'hp', 'level_xp', 'gold', 'bank_cap',
                             'tool_carry', 'fight', 'deaths_today', 'deaths_lifetime', 'hearthfind_ready'] loop
      if (v_a -> 'state' -> k) is distinct from (v_b -> 'state' -> k) then
        raise exception 'narrow-town-read §4(b): state.% is % in the read, % in hr_state_of', k, v_a -> 'state' -> k, v_b -> 'state' -> k; end if;
    end loop;
    if (select jsonb_object_agg(s.key, jsonb_build_object('xp', s.value -> 'xp', 'frac', s.value -> 'frac')) from jsonb_each(v_a -> 'skills') s)
       is distinct from (select jsonb_object_agg(s.key, jsonb_build_object('xp', s.value -> 'xp', 'frac', s.value -> 'frac')) from jsonb_each(v_b -> 'skills') s) then
      raise exception 'narrow-town-read §4(b): the skills'' xp or carried remainder differ'; end if;
    if exists (select 1 from jsonb_object_keys(v_a) x
                where x not in ('ok', 'version', 'now', 'gm', 'buffs', 'state', 'skills', 'inventory', 'equipment', 'bank', 'bench_run',
                                'skill_inputs')) then
      raise exception 'narrow-town-read §4(b): the read carries a key the town engine does not read: %', (select array_agg(x) from jsonb_object_keys(v_a) x); end if;
    raise exception using errcode = 'HRNT1', message = 'probe done - rolling back';
  exception when sqlstate 'HRNT1' then null;
  end;
  if exists (select 1 from public.player_state where user_id = u) then raise exception 'narrow-town-read §4: the probe hero stayed'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'narrow-town-read: the tick reads a town hero''s engine inputs, each by hr_state_of''s definition; engine-only; all green';
end $chk$;
