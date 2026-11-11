-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-04-skills-from-server.sql — A SKILL'S BAR IS THE SERVER'S, NEVER WORKED OUT IN THE BROWSER
--   (lane/c-skills-from-server, backend-architect, 2026-11-10; the skills half of lane/c-level-from-server,
--   docs/design/ARCHITECTURE_CONTRACTS.md X11 "Open").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. Moves no value: read-only projection, no client grant, no table, no player row.
-- EDGE: none (hr-accrue reads `skills` .xp / .frac only; this file does not touch `skills`). CLIENT: the skill ledgers
-- (Character window combat skills, the Gathering and crafting window, the work head) read this section and ride the
-- release AFTER the apply: a tab on an older release never reads the key; a tab on the new release before the apply
-- draws the level and no bar (src/session/item-sections.js skillLevelsOf: null, never this build's curve).
--
-- THE BUG (CLAUDE.md §6, "the browser never says one thing while the server says another"). hr_state_of states each
-- skill's `level` but not where that level starts or ends, so src/shell/windows/skills.js read the two XP marks of the
-- server's level off THIS BUILD's copy of the curves (src/core/xp.js skillXpForLevel / skillCapOf): the bar, its percent,
-- "N XP to L+1" and "Mastered". The curves are data that moves, and a migration applies before the client carrying the
-- same data ships: on 2026-11-10 the same class printed "Lv 20" for a hero the server fought as Level 19 (the Level half,
-- closed by lane/c-level-from-server with the envelope's `level` block).
--
-- THE CONTRACT. hr_state_of states, as the section `skill_levels`, EVERY skill in the catalogue (public.hr_skills):
--     skill_levels = { <skill_id>: { xp, level, into, need } }
--       xp     the hero's XP in it (0 with no player_skills row)
--       level  hr_skill_level(skill, xp): the level every server gate reads, and `skills[id].level` (one statement,
--              one snapshot, one function: the two keys cannot disagree; §4(d) executes it)
--       into   XP into that level        = xp - hr_skill_xp_for_level(skill, level)
--       need   XP across it to the next  = hr_skill_xp_for_level(skill, level + 1) - hr_skill_xp_for_level(skill, level);
--              0 = no next level (a capped skill at 99, the combat curve's last row): the ledger says "Mastered"
--   built by public.hr_skill_block(skill, xp), the twin of hr_level_block (the `level` key), on the server's own curve
--   functions: no second copy of a curve rule. `skills` is UNCHANGED: it stays the engine's input (envelope.js
--   engineInputsFromEnvelope reads .xp / .frac) and the gates' level; restating hr_state_of whole for a ledger key would
--   move the envelope's pinned body (2027-01-18-dead-surfaces-cut.sql) and every guard that plants into it, for nothing a
--   section cannot carry (architecture contracts X7: a new envelope key is a registry row).
--
-- WHY THE TWO CONVERSIONS (§1). Every envelope now calls hr_skill_xp_for_level and, for a capped skill, hr_xp_for_level.
-- Both are LANGUAGE sql with a SET clause: never inlined, so PostgreSQL 17 (production) parses and plans the body again
-- on every call (tests/settle-budget.mjs SB-3: a watched settle may call no such function). They move to plpgsql in
-- tools/gen-plan-cache.mjs's form: the SQL body verbatim inside `return (select hr_q.v from (<body>) as hr_q(v) limit 1)`,
-- signature, volatility, SET, PARALLEL and COST kept; CREATE OR REPLACE keeps the owner and the grants. §0 records every
-- answer the SQL bodies give over the whole domain the curves have; §4(b) requires the plpgsql bodies to give the same.
--
-- CONCURRENCY / IDEMPOTENCY. A read: no lock, no write, no key. It runs inside hr_state_of's statement, so it sees the
-- snapshot `skills` sees. Re-apply: §0 accepts each body's pre-image (SQL) or this file's post-image (plpgsql) and
-- nothing else; CREATE OR REPLACE and the registry's ON CONFLICT make the second apply byte-identical.
-- EXPLOIT SURFACE: none added. The section states the hero's own skill XP, which `skills` already states to the same
-- caller; no function here is executable by a client role (§4(e)), and none takes a client value.
-- COST: 13 cells an envelope (the catalogue), each one plpgsql call plus three curve reads (hr_skill_level, two
-- hr_skill_xp_for_level; a capped skill one hr_level_from_xp and two hr_xp_for_level more), every read a primary-key or
-- index probe on a <500-row table, every plan cached per backend after §1. About 0.7 KB more JSON an envelope (load,
-- engine answer, pushed frame). No row is written, so nothing grows with players beyond envelopes x 0.7 KB.
-- REVERSIBILITY: delete the hr_state_sections row 'skill_levels'; drop hr_skill_levels_view(uuid,int) and
-- hr_skill_block(text,bigint); re-apply hr_xp_for_level from 2026-08-11-player-state.sql and hr_skill_xp_for_level from
-- 2026-10-27-core-bodies.sql (their answers are identical either way, §4(b)). No data to restore.
-- ORDER: after 2027-03-26-signout-presence.sql; needs 2027-02-10-settle-plan-cache.generated.sql (hr_skill_level in
-- plpgsql) and 2027-02-10-settle-reads.sql (hr_state_sections_of). Shares no object with any later file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS, THE PINS, AND THE PRE-IMAGES' ANSWERS ─────────────────────────────────────────────
do $mig$
declare r record; v_md5 text; v_lang text;
begin
  if to_regprocedure('public.hr_skill_level(text,bigint)') is null or to_regprocedure('public.hr_level_from_xp(bigint)') is null
     or to_regprocedure('public.hr_state_sections_of(uuid,integer)') is null or to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hr_skills') is null
     or to_regclass('public.hr_skill_curve') is null or to_regclass('public.hr_xp_table') is null
     or to_regclass('public.player_skills') is null then
    raise exception 'PRECONDITION: apply 2027-02-10-settle-plan-cache.generated.sql and 2027-02-10-settle-reads.sql first'; end if;
  -- §1 restates these two bodies: each must be its known SQL pre-image or this file's plpgsql post-image (a re-apply).
  -- Anything else is a body another file moved: refuse, never silently revert it. md5 over the whitespace-collapsed text.
  for r in select * from (values
    ('public.hr_xp_for_level(integer)',           '818dce1c894fb9eab25892d6df5ec113',  'cf283f28fddafc51f0f5f39865371a9a'),
    ('public.hr_skill_xp_for_level(text,integer)', 'dd852903774cddc5695aa88fa197dfdd', 'f2824dd1f514bb3f43f68b2a59b881c8')
  ) as t(sig, pre, post) loop
    select md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    if not ((v_lang = 'sql' and v_md5 = r.pre) or (v_lang = 'plpgsql' and v_md5 = r.post)) then
      raise exception 'PIN: % is neither its SQL pre-image (%) nor this file''s post-image (%): % % - another file moved it',
        r.sig, r.pre, r.post, v_lang, v_md5; end if;
  end loop;
  -- THE PRE-IMAGES' ANSWERS, before §1 converts them: every level the curves have and one past each end, a null, for every
  -- catalogue skill, an id outside it and a null id. §4(b) requires the plpgsql bodies to answer each one the same.
  drop table if exists pg_temp.hr_sfs_pre;
  create temp table hr_sfs_pre as
    select 'xp'::text as f, null::text as s, g.l, public.hr_xp_for_level(g.l) as v
      from (select generate_series(-1, 101) as l union all select null) g
    union all
    select 'sxp', k.s, g.l, public.hr_skill_xp_for_level(k.s, g.l)
      from (select skill_id as s from public.hr_skills union all select 'not_a_skill' union all select null) k
     cross join (select generate_series(-1, (select max(level) from public.hr_skill_curve) + 2) as l union all select null) g;
end $mig$;

-- ── §1 THE TWO CURVE READS, IN PLPGSQL (SB-3): the SQL bodies verbatim, planned once per backend ─────────
create or replace function public.hr_xp_for_level(p_level integer)
 returns bigint
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public
as $plc$
-- PLAN-CACHE (2027-04-04-skills-from-server.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select coalesce((select xp from public.hr_xp_table
                    where level = greatest(1, least(99, coalesce(p_level, 1)))), 0)
  ) as hr_q(v) limit 1);
end
$plc$;
revoke execute on function public.hr_xp_for_level(integer) from public, anon, authenticated, service_role;

create or replace function public.hr_skill_xp_for_level(p_skill text, p_level integer)
 returns bigint
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-04-04-skills-from-server.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  select case when exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then coalesce((select c.xp from public.hr_skill_curve c where c.level = greatest(1, coalesce(p_level, 1))),
                            (select max(c.xp) from public.hr_skill_curve c))
              else public.hr_xp_for_level(p_level) end
  ) as hr_q(v) limit 1);
end
$plc$;
revoke execute on function public.hr_skill_xp_for_level(text, integer) from public, anon, authenticated, service_role;

-- ── §2 THE SKILL BLOCK: hr_level_block's twin, on the server's own skill curves ──────────────────────────
create or replace function public.hr_skill_block(p_skill text, p_xp bigint)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $fn$
-- SKILLS-FROM-SERVER (2027-04-04-skills-from-server.sql): { xp, level, into, need } for `p_xp` in `p_skill`. level is
-- hr_skill_level (what every gate reads); into = XP into it; need = XP across it, 0 when there is no next level.
declare
  x  bigint := greatest(0, coalesce(p_xp, 0));
  lv int;
  lo bigint;
begin
  lv := public.hr_skill_level(p_skill, x);
  lo := public.hr_skill_xp_for_level(p_skill, lv);
  return jsonb_build_object('xp', x, 'level', lv, 'into', x - lo, 'need', public.hr_skill_xp_for_level(p_skill, lv + 1) - lo);
end
$fn$;
revoke all on function public.hr_skill_block(text, bigint) from public, anon, authenticated, service_role;

-- ── §3 THE SECTION: every catalogue skill, the hero's XP or 0 ───────────────────────────────────────────
create or replace function public.hr_skill_levels_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $fn$
-- SKILLS-FROM-SERVER (2027-04-04-skills-from-server.sql): hr_state_of's `skill_levels`. Keyed on the CATALOGUE, so a skill
-- the hero holds no row for reads level 1 from the server, and a row for a skill the catalogue no longer has is not drawn.
begin
  return coalesce((
    select jsonb_object_agg(k.skill_id, public.hr_skill_block(k.skill_id, s.xp))
      from public.hr_skills k
      left join public.player_skills s on s.user_id = p_user and s.slot = coalesce(p_slot, 0) and s.skill_id = k.skill_id), '{}'::jsonb);
end
$fn$;
revoke all on function public.hr_skill_levels_view(uuid, integer) from public, anon, authenticated, service_role;
do $mig$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_skill_block(text, bigint) from hr_engine;
    revoke all on function public.hr_skill_levels_view(uuid, integer) from hr_engine;
  end if;
end $mig$;
insert into public.hr_state_sections (key, fn, note) values
  ('skill_levels', 'hr_skill_levels_view', '2027-04-04-skills-from-server.sql: every catalogue skill''s { xp, level, into, need } on the server''s own curves (hr_skill_block), the skill ledgers'' one source')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED; every probe row rolled back ────────────────────────────────
do $mig$
declare
  v_u constant uuid := '00000000-0000-4000-c000-5c111e0f0001';
  v jsonb; s jsonb; b jsonb; r record; v_n int; v_bad text; v_role text; v_top int;
begin
  -- (a) THE CLASS SB-3 HOLDS: all four are plpgsql (no SQL body re-planned per call on PostgreSQL 17).
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid in ('public.hr_xp_for_level(integer)'::regprocedure, 'public.hr_skill_xp_for_level(text,integer)'::regprocedure,
                   'public.hr_skill_block(text,bigint)'::regprocedure, 'public.hr_skill_levels_view(uuid,integer)'::regprocedure)
     and l.lanname <> 'plpgsql';
  if v_bad is not null then raise exception 'skills-from-server §4(a): % not plpgsql', v_bad; end if;

  -- (b) THE CONVERSIONS ANSWER AS THE SQL BODIES DID, on every input §0 recorded.
  select count(*) into v_n from pg_temp.hr_sfs_pre;
  if v_n < 103 + 15 * 400 then raise exception 'skills-from-server §4(b): only % pre-image answers were recorded', v_n; end if;
  select count(*), min(coalesce(p.s, '-') || ' ' || coalesce(p.l::text, 'null')) into v_n, v_bad from pg_temp.hr_sfs_pre p
   where p.v is distinct from (case p.f when 'xp' then public.hr_xp_for_level(p.l) else public.hr_skill_xp_for_level(p.s, p.l) end);
  if v_n <> 0 then raise exception 'skills-from-server §4(b): % answers moved in the conversion (first: %)', v_n, v_bad; end if;
  drop table pg_temp.hr_sfs_pre;

  -- (c) THE BLOCK, for every catalogue skill at 0, one under, on and one over every level boundary (to 140 on the combat
  --     curve, every capped level), past the cap and at 2^53 - 1: its level is hr_skill_level's, its marks the curve's own,
  --     they hold the XP, and need is 0 exactly at the curve's last level.
  v_top := (select max(level) from public.hr_skill_curve);
  select count(*), min(t.s || ' at ' || t.x) into v_n, v_bad from (
    select k.skill_id as s, k.cat = 'combat' as combat, p.x
      from public.hr_skills k
     cross join lateral (
       select public.hr_skill_xp_for_level(k.skill_id, g) + d.d as x
         from generate_series(1, case when k.cat = 'combat' then 140 else 100 end) g, (values (-1), (0), (1)) d(d)
       union select 0 union select 9007199254740991) p
     where p.x >= 0) t
   cross join lateral (select public.hr_skill_block(t.s, t.x) as b, public.hr_skill_level(t.s, t.x) as lv) z
   where (z.b->>'xp')::bigint <> t.x or (z.b->>'level')::int <> z.lv
      or (z.b->>'into')::bigint <> t.x - public.hr_skill_xp_for_level(t.s, z.lv)
      or (z.b->>'need')::bigint <> public.hr_skill_xp_for_level(t.s, z.lv + 1) - public.hr_skill_xp_for_level(t.s, z.lv)
      or (z.b->>'into')::bigint < 0 or (z.b->>'need')::bigint < 0
      or ((z.b->>'need')::bigint > 0 and (z.b->>'into')::bigint >= (z.b->>'need')::bigint)
      or (((z.b->>'need')::bigint = 0) is distinct from (z.lv >= (case when t.combat then v_top else 99 end)));
  if v_n <> 0 then raise exception 'skills-from-server §4(c): % blocks disagree with the curve (first: %)', v_n, v_bad; end if;
  b := public.hr_skill_block('melee', null);
  if b is distinct from jsonb_build_object('xp', 0, 'level', 1, 'into', 0, 'need', public.hr_skill_xp_for_level('melee', 2))
     or public.hr_skill_block('mining', -40) is distinct from jsonb_build_object('xp', 0, 'level', 1, 'into', 0, 'need', public.hr_skill_xp_for_level('mining', 2))
     or (b->>'need')::bigint < 1 then
    raise exception 'skills-from-server §4(c): no XP reads %', b; end if;

  -- (d) THE ENVELOPE on a probe hero: every catalogue skill and nothing else; each cell is the block of the row's XP (0 with
  --     none); its level is `skills`' own; one under a boundary, past the cap and a missing row read as the curve says.
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'skills-from-server §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'skills-from-server §4(d): hr_create_character refused: %', v; end if;
    update public.player_skills set xp = public.hr_skill_xp_for_level('melee', 12) - 1 where user_id = v_u and slot = 0 and skill_id = 'melee';
    update public.player_skills set xp = public.hr_skill_xp_for_level('cooking', 99) + 5 where user_id = v_u and slot = 0 and skill_id = 'cooking';
    update public.player_skills set xp = public.hr_skill_xp_for_level('mining', 30) where user_id = v_u and slot = 0 and skill_id = 'mining';
    delete from public.player_skills where user_id = v_u and slot = 0 and skill_id = 'fishing';
    v := public.hr_state_of(v_u, 0);
    s := v->'skill_levels';
    if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s)) <> (select count(*) from public.hr_skills)
       or exists (select 1 from public.hr_skills k where not (s ? k.skill_id)) then
      raise exception 'skills-from-server §4(d): the envelope''s skill_levels is %', s; end if;
    for r in select k.skill_id as s, ps.xp from public.hr_skills k
               left join public.player_skills ps on ps.user_id = v_u and ps.slot = 0 and ps.skill_id = k.skill_id loop
      if s->r.s is distinct from public.hr_skill_block(r.s, coalesce(r.xp, 0)) then
        raise exception 'skills-from-server §4(d): % at % XP reads % in the envelope', r.s, r.xp, s->r.s; end if;
      if r.xp is not null and (v->'skills'->r.s->'level') is distinct from (s->r.s->'level') then
        raise exception 'skills-from-server §4(d): % reads level % in `skills` and % in `skill_levels`', r.s, v->'skills'->r.s->'level', s->r.s->'level'; end if;
    end loop;
    if (s->'melee'->>'level')::int <> 11 or (s->'melee'->>'into')::bigint <> (s->'melee'->>'need')::bigint - 1
       or (s->'mining'->>'level')::int <> 30 or (s->'mining'->>'into')::bigint <> 0
       or (s->'cooking'->>'level')::int <> 99 or (s->'cooking'->>'need')::bigint <> 0 or (s->'cooking'->>'into')::bigint <> 5
       or s->'fishing' is distinct from jsonb_build_object('xp', 0, 'level', 1, 'into', 0, 'need', public.hr_skill_xp_for_level('fishing', 2)) then
      raise exception 'skills-from-server §4(d): the spot cells read melee %, mining %, cooking %, fishing %', s->'melee', s->'mining', s->'cooking', s->'fishing'; end if;
    raise exception using errcode = 'HRS99', message = 'skills-from-server §4 complete - rolling back';
  exception when sqlstate 'HRS99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_skills where user_id = v_u)
     or exists (select 1 from auth.users where id = v_u) then
    raise exception 'skills-from-server §4: a probe row leaked'; end if;

  -- (e) THE GRANTS: no client role reaches any of the four; the engine keeps hr_xp_for_level (its grant is not moved here).
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_skill_block(text,bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_skill_levels_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_skill_xp_for_level(text,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_xp_for_level(integer)', 'execute') then
      raise exception 'skills-from-server §4(e): % can execute a curve read or the section', v_role; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and (has_function_privilege('hr_engine', 'public.hr_skill_block(text,bigint)', 'execute')
          or has_function_privilege('hr_engine', 'public.hr_skill_levels_view(uuid,integer)', 'execute')
          or not has_function_privilege('hr_engine', 'public.hr_xp_for_level(integer)', 'execute')) then
    raise exception 'skills-from-server §4(e): hr_engine''s reach moved'; end if;

  -- (f) THE REGISTRY names the section once.
  if (select count(*) from public.hr_state_sections where key = 'skill_levels' and fn = 'hr_skill_levels_view') <> 1 then
    raise exception 'skills-from-server §4(f): the skill_levels section is not registered'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'skills-from-server §4 OK: plpgsql, the conversions'' answers, every block on the curve, the envelope''s cells, the grants, the registry';
end $mig$;
