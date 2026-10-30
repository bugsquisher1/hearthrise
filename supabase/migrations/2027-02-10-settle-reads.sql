-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A HUNTER'S HELLO BUILDS NO ENVELOPE THE ANSWER THROWS AWAY; THE ROLE IS READ ONCE; THE SECTIONS IN ONE BUILD
-- (lane/c-settle-cost-2, backend-architect, 2026-10-30; Tyler 10-30: "optimization, core loop, basics MOST important").
-- STAGED. Game CLOSED: applies on its passing §5 (CLAUDE.md §2), one file via the Coordinator's apply tool,
-- never inside begin/commit, never 00:00-00:10 UTC.
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- Live, 2026-10-30 05:58-05:59 UTC (pg_stat_statements deltas, the QA account's four heroes hunting as one watched
-- party): 7 hellos, 3 landed settles, 4 live-view asks answered below the floor. Every hello's FIRST statement was
-- index.ts's accrue read, `hr_state_of + hr_accrue_cap_ms`, 88.5 ms a call: 7 x 88.5 = 620 ms of the 2,630 ms those
-- 3 settles cost (24 %). For a hunter that envelope is never answered: the hello settles the hunt next
-- (hunt-settle.js), and its answer carries the commit's projection or, on an early answer, a fresh read. What the
-- accrue path reads of it for a hunter is the activity pointer (computeAccrual answers hunt_open on it), the version,
-- the clock and the rested bank's two fields (accrual.js accrueRested). A watched party paid a whole envelope a hello
-- for six scalars. tools/settle-cost.mjs --door=viewed reproduces live's statement mix on the replay.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hr_accrue_read(p_user uuid, p_slot int) -> jsonb   NEW, engine-only (hr_engine; no client, no hr_tick). The
--    accrue read's state term (index.ts: `select hr_accrue_read(..) as state, hr_accrue_cap_ms(..) as cap_ms, now()`):
--      no open hunt (hr_hunt_open_of null)  hr_state_of(p_user, p_slot), unchanged — every non-hunter, the boot read
--      an open hunt                         { ok, version, now, state: { slot, active_kind, active_id, active_since,
--                                           accrued_to, rested_xp, rested_at } }: those keys, by hr_state_of's own
--                                           expressions, and nothing else
--      an open hunt, no hero row            hr_state_of's own refusal (unreachable: a session needs a hero)
--    What index.ts reads of a hunter's state, all of it: env.ok / env.error, env.version, env.now, state.accrued_to
--    (the seed and intent labels), state.active_kind / active_id / active_since (computeAccrual answers hunt_open on
--    the pointer: engineInputsFromEnvelope's other keys are read only past that answer), state.rested_xp / rested_at
--    (accrueRested), env.workers (absent from both since 2027-01-18). The open hunt index.ts then reads in its own
--    statement (a later snapshot, as before): a hunt that ends between the two reads answers the same either way (a
--    combat pointer with no session prices nothing and spreads no envelope).
-- §2 hr_hunt_role_of and §3 hr_role_view RESTATED: plpgsql (the plan kept, 2027-02-10-settle-plan-cache.generated.sql's
--    rule) and the worn weapon's key read ONCE, `= (select public.hr_hunt_weapon_of(..))`, instead of once for every
--    hr_hunt_weapon_roles row the filter scans (12 rows: 54 hr_hunt_weapon_of calls a projection, 414 a watched
--    settle). hr_hunt_weapon_of is STABLE: the same answer either way, now as one InitPlan. Every other line verbatim.
-- §3b hr_state_sections_of RESTATED: every registry row folded into ONE jsonb_build_object in ONE dynamic statement
--    (the same section calls, keys and values) instead of thirty EXECUTEs and thirty `||`, each of which decoded and
--    re-encoded the whole growing object: 16 ms of a 115 ms projection on PostgreSQL 17. The registry (X7) is unchanged.
-- §4 grants; §5 the executed self-check.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   §1 is a read: one statement, one snapshot. It writes nothing (hr_accrue_cap_ms, the statement's next term, keeps
--   its own write and its place after the state, as before). §2/§3 are create-or-replace of the same text; a second
--   apply finds the post-images (§0 accepts them).
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   §1 is reachable by hr_engine only (asserted in §5). It hands the engine a STRICT SUBSET of hr_state_of for the
--   hero the verified JWT names, and only that hero (index.ts passes the subject). No value moves; the accrue path's
--   writes (rested bank, horizon) read the same fields from it as from the envelope. §2/§3 keep their grants.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none. Per watched 4-hero settle: hr_state_of 7.67 -> 5.33 calls (the before/after table is in the
--   lane report); hr_hunt_weapon_of 414 -> 32 calls (PGlite; 75 on PostgreSQL 17, whose planner scans the 12-row
--   table hr_hunt_settings_view filters per row); a projection's section build 16 ms -> ~2 ms.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Drop hr_accrue_read (the edge falls back on 42883 to the old statement, which it keeps verbatim); restate hr_hunt_role_of / hr_role_view /
--   hr_state_sections_of from their pre-images (verbatim in §5's pg_temp copies). No data.
--
-- ORDER: after 2027-02-10-settle-plan-cache.generated.sql. EDGE: hr-accrue moves in the same lane (index.ts's accrue
--   read, in a savepoint); either order is safe (the new edge falls back on 42883; the old edge never calls §1).
--   No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare r record; v_md5 text; v_lang text;
begin
  if to_regprocedure('public.hr_accrue_cap_ms(uuid,integer)') is null or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null then
    raise exception 'PRECONDITION: the accrue read''s and the role''s functions are absent'; end if;
  -- §1 copies hr_state_of's own expressions for the keys it projects, and §5(b) proves them equal: it is pinned so a
  -- moved envelope re-runs that proof in the file that moves it.
  for r in select * from (values
    ('public.hr_state_of(uuid,integer)',     'plpgsql', 'e0a71bfea1bf596df13f9cbfc59f5cf3', null::text),
    ('public.hr_hunt_open_of(uuid,integer)', null,      'e81bf96fc9bb15c16238c2e981f41fb1', null),
    ('public.hr_hunt_role_of(uuid,integer)', 'sql',     'a2bec8197365cd274da24d3b9dc7997b', 'a99235b8f466eadf09967002566e9a49'),
    ('public.hr_role_view(uuid,integer)',    'sql',     '304d6a0dd0807debe588153d4ec0734e', 'e9f2d51798d5bd2ee5c8a14fe9685d73'),
    ('public.hr_state_sections_of(uuid,integer)', 'plpgsql', 'b451a588890152ef8ca20c20f315fdbe', '6fd4f6ee89976974e799053fbd742d2b')
  ) as t(sig, lang, pre, post) loop
    select md5(replace(p.prosrc, chr(13), '')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    if not ((v_md5 = r.pre and (r.lang is null or v_lang = r.lang)) or (r.post is not null and v_md5 = r.post and v_lang = 'plpgsql')) then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s post-image: % % - another file moved it', r.sig, r.pre, v_lang, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE ACCRUE READ: a hunter's seven scalars, anyone else's envelope ─────
create or replace function public.hr_accrue_read(p_user uuid, p_slot integer)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
-- 2027-02-10-settle-reads.sql: the state term of index.ts's accrue read. With no open hunt: hr_state_of, unchanged.
-- With one: the keys the accrue path reads for a hunter (the pointer computeAccrual answers hunt_open on, the version,
-- the clock, the rested bank), each by hr_state_of's own expression, and nothing else: the hello settles the hunt next
-- and answers with the commit's projection (hunt-settle.js), so a whole envelope here was built and dropped every hello.
declare
  v_role text;
  v_st   public.player_state%rowtype;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_accrue_read: not callable by %', v_role using errcode = '42501';
  end if;
  if public.hr_hunt_open_of(p_user, p_slot) is null then return public.hr_state_of(p_user, p_slot); end if;
  select * into v_st from public.player_state where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return public.hr_state_of(p_user, p_slot); end if;
  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at));
end $fn$;

-- ── §2 THE HERO'S ROLE: plpgsql, the weapon read once ───────────────────────
create or replace function public.hr_hunt_role_of(p_user uuid, p_slot integer)
 returns text
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- SETTLE-READS (2027-02-10-settle-reads.sql): plpgsql, so PostgreSQL 17 keeps the plan, and the worn weapon's key read
-- ONCE (`= (select ..)`), not once per hr_hunt_weapon_roles row the filter scans. The SQL body, otherwise verbatim:
#variable_conflict use_column
begin
  return (select hr_q.v from (
  -- TOWN-DEFAULTS (2027-01-25-town-defaults.sql): the role the worn set gives (the role key's first role, or the set's
  -- pick when the key allows it), on the hero's open hunt's set, else its current set: hr_hunt_settings_view's own rule.
  select case when a.options->>'role' = any (w.roles) then a.options->>'role' else w.roles[1] end
    from public.hr_hunt_weapon_roles w
    left join public.player_action_sets a
      on a.user_id = p_user and a.slot = p_slot
     and a.preset = coalesce((select h.preset::int from public.hunt_sessions h
                               where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
                               order by h.entered_at desc limit 1), public.hr_hunt_active_set(p_user, p_slot))
   where w.weapon_type = (select public.hr_hunt_weapon_of(p_user, p_slot))
  ) as hr_q(v) limit 1);
end
$plc$;

-- ── §3 THE ROLE SECTION: plpgsql, the weapon read once ──────────────────────
create or replace function public.hr_role_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- SETTLE-READS (2027-02-10-settle-reads.sql): plpgsql, so PostgreSQL 17 keeps the plan, and the worn weapon's key read
-- ONCE (`= (select ..)`), not once per hr_hunt_weapon_roles row the filter scans. The SQL body, otherwise verbatim:
#variable_conflict use_column
begin
  return (select hr_q.v from (
  select jsonb_build_object(
           'id', case when (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot)) = any (w.roles)
                      then (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot))
                      else w.roles[1] end,
           'weapon', w.weapon_type)
    from public.hr_hunt_weapon_roles w
   where w.weapon_type = (select public.hr_hunt_weapon_of(p_user, p_slot))
     and exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
  ) as hr_q(v) limit 1);
end
$plc$;

-- ── §3b THE SECTION REGISTRY IN ONE STATEMENT ───────────────────────────────
create or replace function public.hr_state_sections_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $fn$
-- SETTLE-READS (2027-02-10-settle-reads.sql): every hr_state_sections row, folded into ONE jsonb_build_object in ONE
-- statement (the registry still decides which sections there are: architecture contracts X7). It was one EXECUTE and
-- one `||` per section, thirty of each, and each `||` decoded and re-encoded the whole growing object (~42 KB): 16 ms a
-- projection on PostgreSQL 17, a sixth of hr_state_of. The same calls, keys and values; one build.
declare v_sql text; v_out jsonb;
begin
  select string_agg(format('%L, public.%I($1, $2)', s.key, s.fn), ', ' order by s.key) into v_sql
    from public.hr_state_sections s;
  execute 'select jsonb_build_object(' || coalesce(v_sql, '') || ')' into v_out using p_user, p_slot;
  return v_out;
end $fn$;

-- ── §4 GRANTS: revoke-then-grant; §1 reaches the engine only ────────────────
do $grants$
begin
  revoke all on function public.hr_accrue_read(uuid, integer) from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_accrue_read(uuid, integer) from hr_tick; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_accrue_read(uuid, integer) to hr_engine; end if;
end $grants$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image (no hr_accrue_read; the role functions are SQL and scan per row).
do $check$
declare
  c_idle constant uuid := '000000d6-0000-4000-a000-00005e77ead1';   -- a hero in town
  c_hunt constant uuid := '000000d6-0000-4000-a000-00005e77ead2';   -- a hero hunting
  c_none constant uuid := '000000d6-0000-4000-a000-00005e77ead3';   -- no character
  v jsonb; v_full jsonb; v_lean jsonb; v_hunt text; v_sig text; v_n int; v_ex text;
begin
  -- (a) THE SHAPE: the two restated bodies, plpgsql, their properties kept; §1 reaches hr_engine and nothing else.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_role_of(uuid,integer)'::regprocedure) <> 'a99235b8f466eadf09967002566e9a49'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_role_view(uuid,integer)'::regprocedure) <> 'e9f2d51798d5bd2ee5c8a14fe9685d73'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_state_sections_of(uuid,integer)'::regprocedure) <> '6fd4f6ee89976974e799053fbd742d2b'
     or not (select prosecdef from pg_proc where oid = 'public.hr_state_sections_of(uuid,integer)'::regprocedure) then
    raise exception 'settle-reads §5(a): hr_hunt_role_of / hr_role_view / hr_state_sections_of are not this file''s images'; end if;
  if exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
              where p.oid in ('public.hr_hunt_role_of(uuid,integer)'::regprocedure, 'public.hr_role_view(uuid,integer)'::regprocedure)
                and (l.lanname <> 'plpgsql' or p.provolatile <> 's' or p.proconfig is distinct from array['search_path=public, pg_catalog']))
     or (select prosecdef from pg_proc where oid = 'public.hr_hunt_role_of(uuid,integer)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.hr_role_view(uuid,integer)'::regprocedure) then
    raise exception 'settle-reads §5(a): a restated role function lost a property of its pre-image'; end if;
  v_sig := 'public.hr_accrue_read(uuid,integer)';
  if has_function_privilege('anon', v_sig, 'execute') or has_function_privilege('authenticated', v_sig, 'execute')
     or has_function_privilege('service_role', v_sig, 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', v_sig, 'execute'))
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'settle-reads §5(a): hr_accrue_read is reachable by a client or the tick'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') and not has_function_privilege('hr_engine', v_sig, 'execute') then
    raise exception 'settle-reads §5(a): hr_engine cannot run hr_accrue_read'; end if;

  begin
    -- THE PROBE: a hero in town, a hero hunting the lowest ground (hunts on), and no hero at all.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    foreach v_sig in array array[c_idle::text, c_hunt::text] loop
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'settle-reads §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'settle-reads §5-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    -- the rested bank and both watermarks set, so the hunter's lean read carries values, not nulls
    update public.player_state set rested_xp = 7, rested_at = now() - interval '3 minutes', accrued_to = now() - interval '1 minute',
           active_since = now() - interval '2 minutes' where user_id in (c_idle, c_hunt) and slot = 0;
    v := public.hr_hunt_enter_for(c_hunt, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'settle-reads §5-harness: the probe hunt did not start on %: %', v_hunt, v; end if;

    -- (b) THE ACCRUE READ: in town, the envelope itself; hunting, hr_state_of's own values for exactly its keys;
    --     no hero, hr_state_of's own refusal. Same statement, same now().
    v := public.hr_accrue_read(c_idle, 0);
    if v::text is distinct from public.hr_state_of(c_idle, 0)::text or v->>'ok' <> 'true' then
      raise exception 'settle-reads §5(b): a hero in town is not handed its envelope: %', left(v::text, 300); end if;
    v := public.hr_accrue_read(c_none, 0);
    if v::text is distinct from public.hr_state_of(c_none, 0)::text then
      raise exception 'settle-reads §5(b): no hero answers %', v; end if;
    v := public.hr_accrue_read(c_hunt, 0);
    v_full := public.hr_state_of(c_hunt, 0);
    v_lean := jsonb_build_object('ok', v_full->'ok', 'version', v_full->'version', 'now', v_full->'now',
                'state', (select jsonb_object_agg(e.key, e.value) from jsonb_each(v_full->'state') e
                           where e.key in ('slot', 'active_kind', 'active_id', 'active_since', 'accrued_to', 'rested_xp', 'rested_at')));
    if v::text is distinct from v_lean::text or (select count(*) from jsonb_object_keys(v->'state')) <> 7 then
      raise exception 'settle-reads §5(b): the hunter''s read % is not hr_state_of''s % for its keys', v, v_lean; end if;
    if v->'state'->>'active_kind' is distinct from 'combat' or (v->'state'->>'rested_xp')::int <> 7
       or v->'state'->'rested_at' = 'null'::jsonb or v->'state'->'accrued_to' = 'null'::jsonb then
      raise exception 'settle-reads §5(b)-harness: the probe hunter does not exercise the pointer and the bank: %', v; end if;

    -- (c) THE ROLE: each restated function answers exactly what its SQL pre-image answers (a pg_temp copy), as text,
    --     for every character (the probes; on production every hero) and for none.
    execute $pre$create function pg_temp.hrsr_role_of(p_user uuid, p_slot integer) returns text language sql stable
      set search_path = public, pg_catalog as $b$
  select case when a.options->>'role' = any (w.roles) then a.options->>'role' else w.roles[1] end
    from public.hr_hunt_weapon_roles w
    left join public.player_action_sets a
      on a.user_id = p_user and a.slot = p_slot
     and a.preset = coalesce((select h.preset::int from public.hunt_sessions h
                               where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
                               order by h.entered_at desc limit 1), public.hr_hunt_active_set(p_user, p_slot))
   where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot)
$b$$pre$;
    execute $pre$create function pg_temp.hrsr_role_view(p_user uuid, p_slot integer) returns jsonb language sql stable security definer
      set search_path = public, pg_catalog as $b$
  select jsonb_build_object(
           'id', case when (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot)) = any (w.roles)
                      then (select a.options->>'role' from public.player_action_sets a
                             where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot))
                      else w.roles[1] end,
           'weapon', w.weapon_type)
    from public.hr_hunt_weapon_roles w
   where w.weapon_type = public.hr_hunt_weapon_of(p_user, p_slot)
     and exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$b$$pre$;
    select count(*)::int, min(w.u::text || '/' || w.s) into v_n, v_ex
      from (select user_id, slot from public.player_state union all select c_none, 0) w(u, s)
     where public.hr_hunt_role_of(w.u, w.s) is distinct from pg_temp.hrsr_role_of(w.u, w.s)
        or public.hr_role_view(w.u, w.s)::text is distinct from pg_temp.hrsr_role_view(w.u, w.s)::text;
    if v_n <> 0 then raise exception 'settle-reads §5(c): the role answers moved for % hero(es), e.g. %', v_n, v_ex; end if;
    if public.hr_hunt_role_of(c_hunt, 0) is null or public.hr_role_view(c_hunt, 0) is null then
      raise exception 'settle-reads §5(c)-harness: the probe hunter has no role to compare'; end if;

    -- (d) THE SECTIONS: one statement answers, as text, exactly what the thirty-EXECUTE loop answered (a pg_temp copy of
    --     the pre-image), for every character and none; and the hunter's envelope still carries every registry key.
    execute $pre$create function pg_temp.hrsr_sections(p_user uuid, p_slot integer) returns jsonb language plpgsql stable
      security definer set search_path = public, pg_catalog as $b$
declare v_out jsonb := '{}'::jsonb; v_r record; v_v jsonb;
begin
  for v_r in select key, fn from public.hr_state_sections order by key loop
    execute format('select public.%I($1, $2)', v_r.fn) into v_v using p_user, p_slot;
    v_out := v_out || jsonb_build_object(v_r.key, v_v);
  end loop;
  return v_out;
end $b$$pre$;
    select count(*)::int, min(w.u::text || '/' || w.s) into v_n, v_ex
      from (select user_id, slot from public.player_state union all select c_none, 0) w(u, s)
     where public.hr_state_sections_of(w.u, w.s)::text is distinct from pg_temp.hrsr_sections(w.u, w.s)::text;
    if v_n <> 0 then raise exception 'settle-reads §5(d): the sections moved for % hero(es), e.g. %', v_n, v_ex; end if;
    if exists (select 1 from public.hr_state_sections s where not (public.hr_state_of(c_hunt, 0) ? s.key))
       or (select count(*) from public.hr_state_sections) < 1 then
      raise exception 'settle-reads §5(d)-harness: the hunter''s envelope lacks a registry key, or there is no registry'; end if;

    raise exception 'settle-reads §5: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'settle-reads §5: ok' then raise; end if;
  end;
end $check$;
