-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-jewel-guarantees.sql — CRAFTED JEWELRY'S GUARANTEE LAYER, DARK: THE SWITCH IT SITS BEHIND, AND THE ODDS EVERY ROLLED JOB
--   SHOWS, FROM THE SERVER (lane/c-crafted-jewelry, systems-engineer, 2026-11-15; Tyler 2026-11-14: high-end jewelry comes from crafting,
--   "and i really want that to be RNG", "with some items that can guarantee some things"; the designer's board section 2026-11-15 (d)).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §4. ON THE EA SECURITY LIST with the rolls (a paid-for-nothing chance on a tradeable item: the Steam/legal review).
-- EDGE: the guarantee jobs and their roll ship in the hr-accrue bundle (src/data/jewelry.js, src/core/artisan.js), and its set_activity
-- refuses a switched job for an account the switch is off for (supabase/functions/hr-accrue/set-activity.js switchedOn).
-- CLIENT: the bench reads its odds from the section below and offers a switched job only when the section lists it.
-- APPLY ORDER: after 2027-03-21-feature-switches.sql (hr_feature_switches, hr_feature_on) and 2027-04-24-jewel-jobs-catalogue.generated.sql
--   (hr_jewel_jobs, hr_jewel_odds), itself after the activities catalogue that holds the three guarantee jobs.
--
-- ── THE SWITCH ───────────────────────────────────────────────────────────────
-- hr_feature_switches 'jewel_guarantees', scope OFF on first apply (a re-apply never moves a scope the Coordinator set since). The three
--   guarantee jobs (a Crown Shard, the Rat King's Crown, both, set in a Banded Signet) are real for an account it is on for and for
--   nobody else: the section leaves them out, and hr-accrue's set_activity answers activity_unsupported {switch}. Moving it is the
--   Coordinator's tiny dated migration (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"): 'accounts' with the QA and GM accounts
--   to play it, then 'testers', then 'everyone'.
--
-- ── THE SECTION `jewel_jobs` ─────────────────────────────────────────────────
-- hr_jewel_jobs_view(user, slot) -> { level, jobs: [{ recipe, piece, kind, perk, rolls, fine, hallmarked, plain }] }: every rolled
--   Crafting job open to this account (no switch, or its switch on), with its odds per 10,000 at the hero's Crafting level as
--   player_skills holds it (1..99), from hr_jewel_odds. `perk` is the guaranteed perk (null: none), `rolls` the perks the roll may still
--   draw. Display only: the bench rolls in the engine on the server's seed, from the same table this was generated from.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None reachable from a client: no verb, no grant; the section names only jobs open to the caller's own account and the hero's own level.
-- A switch gates a door, never a number. The roll moves no gold (rolled jobs pay no bench tax: src/data/bench-tax.js benchTaxed).
--
-- COST: one PK read of player_skills, a scan of a handful of job rows (one hr_feature_on per switched row), one PK read of the odds a row.
-- plpgsql, not sql: the settle reads every section every window (tests/settle-budget.mjs SB-3).
--
-- REVERSIBILITY: delete the section row; drop hr_jewel_jobs_view; delete the switch row. Items made stay made (the wipe takes them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-feature-switches.sql first'; end if;
  if to_regclass('public.hr_jewel_jobs') is null or to_regclass('public.hr_jewel_odds') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-jewel-jobs-catalogue.generated.sql first'; end if;
  if not exists (select 1 from public.hr_jewel_jobs where switch_id = 'jewel_guarantees') then
    raise exception 'PRECONDITION: the jobs catalogue holds no job behind jewel_guarantees'; end if;
  if to_regprocedure('public.hr_skill_level(text,bigint)') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a seam this section reads is missing (hr_skill_level, hr_state_sections)'; end if;
end $mig$;

-- ── §1 THE SWITCH, OFF ───────────────────────────────────────────────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('jewel_guarantees', 'off', '2027-04-24-jewel-guarantees.sql: crafted jewelry''s guarantee jobs (a boss gem fixes a perk, a boss Trophy fixes Hallmarked), dark until played')
  on conflict (switch_id) do nothing;

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
create or replace function public.hr_jewel_jobs_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_lv int; v jsonb;
begin
  if not exists (select 1 from public.hr_jewel_jobs) then return null; end if;
  v_lv := greatest(1, least(99, public.hr_skill_level('crafting',
            coalesce((select k.xp from public.player_skills k where k.user_id = p_user and k.slot = p_slot and k.skill_id = 'crafting'), 0))));
  select coalesce(jsonb_agg(jsonb_build_object('recipe', j.recipe_id, 'piece', j.piece, 'kind', j.kind, 'perk', j.perk, 'rolls', to_jsonb(j.rolls),
           'fine', o.fine, 'hallmarked', o.hallmarked, 'plain', 10000 - o.fine - o.hallmarked) order by j.recipe_id), '[]'::jsonb)
    into v
    from public.hr_jewel_jobs j
    join public.hr_jewel_odds o on o.kind = j.kind and o.level = v_lv
   where j.skill = 'crafting' and (j.switch_id is null or public.hr_feature_on(j.switch_id, p_user));
  return jsonb_build_object('level', v_lv, 'jobs', v);
end $$;
revoke all on function public.hr_jewel_jobs_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke all on function public.hr_jewel_jobs_view(uuid, int) from hr_engine; end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('jewel_jobs', 'hr_jewel_jobs_view', '2027-04-24-jewel-guarantees.sql: every rolled Crafting job open to this account, its guarantee and its odds at the hero''s Crafting level')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED on a probe account, every probe rolled back ─────────────────────
do $mig$
declare
  v_u constant uuid := '00000000-0000-4000-c000-1e3e1a000001';
  v jsonb; s jsonb; v_role text; v_all int; v_sw int; v_lv int; v_scope text; v_accounts uuid[];
begin
  select count(*) into v_all from public.hr_jewel_jobs where skill = 'crafting';
  select count(*) into v_sw from public.hr_jewel_jobs where skill = 'crafting' and switch_id = 'jewel_guarantees';
  -- (a) THE SWITCH ROW IS THERE (off on a first apply; a re-apply keeps whatever scope the Coordinator set since).
  select f.scope, f.accounts into v_scope, v_accounts from public.hr_feature_switches f where f.switch_id = 'jewel_guarantees';
  if v_scope is null then raise exception 'jewel-guarantees §4(a): the switch row is missing'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'jewel-guarantees §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'jewel-guarantees §4: hr_create_character refused: %', v; end if;
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'jewel_guarantees';

    -- (b) SWITCH OFF: the section, through hr_state_of, lists every open job and no switched one, at Crafting 1.
    s := public.hr_state_of(v_u, 0)->'jewel_jobs';
    if s is null or (s->>'level')::int <> 1 or jsonb_array_length(s->'jobs') <> v_all - v_sw
       or exists (select 1 from jsonb_array_elements(s->'jobs') e join public.hr_jewel_jobs j on j.recipe_id = e->>'recipe' where j.switch_id is not null) then
      raise exception 'jewel-guarantees §4(b): with the switch off the section reads %', s; end if;

    -- (c) THE SWITCH ON FOR THIS ACCOUNT: every job, each with the odds row of its kind at the SERVER's Crafting level.
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'jewel_guarantees';
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_u, 0, 'crafting', public.hr_skill_xp_for_level('crafting', 37))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    s := public.hr_jewel_jobs_view(v_u, 0);
    v_lv := (s->>'level')::int;
    if v_lv <> 37 or jsonb_array_length(s->'jobs') <> v_all then raise exception 'jewel-guarantees §4(c): with the switch on the section reads %', s; end if;
    if exists (select 1 from jsonb_array_elements(s->'jobs') e join public.hr_jewel_odds o on o.kind = e->>'kind' and o.level = 37
                where (e->>'fine')::int <> o.fine or (e->>'hallmarked')::int <> o.hallmarked or (e->>'plain')::int <> 10000 - o.fine - o.hallmarked) then
      raise exception 'jewel-guarantees §4(c): a job''s odds are not its kind''s row at Crafting 37: %', s; end if;
    -- (d) A GUARANTEE READS AS ONE: a perk job never rolls its own perk; a seal job is Hallmarked at every level.
    if exists (select 1 from jsonb_array_elements(s->'jobs') e where e->>'perk' is not null and (e->'rolls') ? (e->>'perk'))
       or exists (select 1 from jsonb_array_elements(s->'jobs') e where e->>'kind' = 'seal' and (e->>'hallmarked')::int <> 10000)
       or not exists (select 1 from jsonb_array_elements(s->'jobs') e where e->>'kind' = 'seal') then
      raise exception 'jewel-guarantees §4(d): a guarantee does not read as one: %', s; end if;
    -- (e) ANOTHER ACCOUNT stays dark while this one is lit.
    if exists (select 1 from jsonb_array_elements(public.hr_jewel_jobs_view('00000000-0000-4000-c000-1e3e1a000002'::uuid, 0)->'jobs') e
                join public.hr_jewel_jobs j on j.recipe_id = e->>'recipe' where j.switch_id is not null) then
      raise exception 'jewel-guarantees §4(e): an account the switch names not sees a switched job'; end if;
    raise exception using errcode = 'HRJ99', message = 'jewel-guarantees §4 complete - rolling back';
  exception when sqlstate 'HRJ99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'jewel-guarantees §4: a probe row leaked'; end if;
  if not exists (select 1 from public.hr_feature_switches f where f.switch_id = 'jewel_guarantees' and f.scope = v_scope and f.accounts = v_accounts) then
    raise exception 'jewel-guarantees §4: the probe moved the switch'; end if;
  -- (f) THE GRANTS: the section is the server's alone.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_jewel_jobs_view(uuid,integer)', 'execute') then
      raise exception 'jewel-guarantees §4(f): % reaches the section', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'jewel-guarantees §4 OK: off on apply, the section dark then lit for one account, the server''s level and odds, a guarantee reads as one, the grants';
end $mig$;
