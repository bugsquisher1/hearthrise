-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-31-total-level-flame.sql — THE LEADERBOARD'S SKILL LIST NAMES INNER FLAME.
--
-- WHY: 2027-01-31-inner-flame.sql renamed the skill key 'prayer' -> 'inner_flame' in every
-- catalogue and every hero's player_skills row, but hr_lb_skills() (restated whole by
-- 2026-10-27-core-bodies.sql) is a fixed list that still said 'prayer'. leaderboard_ranked
-- sums a hero's total_level only over that list, so every hero's Inner Flame level fell out
-- of the board's total (a fresh hero: 12 on the board, 13 on its own screen, src/core/xp.js
-- totalLevel), and the skill:prayer board ranked nobody. tests/leaderboard-server-source.mjs
-- LB-9 / LB-9b caught it.
-- WHAT: hr_lb_skills() restated with 'inner_flame' where 'prayer' stood (same order, same 15
-- skills, so the board list keeps its order), then the materialized view rebuilt so the
-- totals are right at once rather than at the next scheduled refresh. No value moves: the
-- view is derived data.
-- ORDER: after 2027-01-31-inner-flame.sql (the rename) and the 2027-01-31 generated catalogues.
-- No begin/commit. A second apply is a no-op (the restatement is identical; the refresh is
-- idempotent).
-- ════════════════════════════════════════════════════════════════════════

-- §0 PRECONDITIONS: the rename has landed, and the list is the core rebuild's (15 skills, Melee).
do $mig$
begin
  if not exists (select 1 from public.hr_skills where skill_id = 'inner_flame') then
    raise exception 'PRECONDITION: apply 2027-01-31-inner-flame.sql first (no inner_flame skill)'; end if;
  if exists (select 1 from public.hr_skills where skill_id = 'prayer') then
    raise exception 'PRECONDITION: the prayer skill still exists; 2027-01-31-inner-flame.sql has not landed'; end if;
  if to_regprocedure('public.hr_lb_skills()') is null
     or not ('melee' = any (public.hr_lb_skills()))
     or cardinality(public.hr_lb_skills()) <> 15 then
    raise exception 'PRECONDITION: hr_lb_skills() is not the core rebuild''s 15-skill list'; end if;
end $mig$;

-- §1 THE LIST (restated whole from 2026-10-27-core-bodies.sql; only 'prayer' -> 'inner_flame').
CREATE OR REPLACE FUNCTION public.hr_lb_skills()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array[
    'melee','ranged','magic','defense','inner_flame',
    'woodcutting','mining','fishing','farming',
    'cooking','crafting','smithing','runecrafting','stonemason','bountyHunter'
  ]
$function$;

-- §2 THE BOARD, REBUILT NOW (derived data: a refresh loses nothing).
refresh materialized view public.leaderboard_ranked;

-- §3 SELF-CHECK (CLAUDE.md §4): properties asserted by executing SQL.
do $chk$
declare v_bad text; v_n int;
begin
  -- (a) the list names Inner Flame and not Prayer, still 15 skills
  if not ('inner_flame' = any (public.hr_lb_skills())) or 'prayer' = any (public.hr_lb_skills())
     or cardinality(public.hr_lb_skills()) <> 15 then
    raise exception 'SELF-CHECK (a): hr_lb_skills() is %', public.hr_lb_skills(); end if;
  -- (b) every catalogue skill is on the list, so a hero's board total is the sum its own screen shows
  --     (src/core/xp.js totalLevel sums every skill row; a skill missing here falls out of the total)
  select string_agg(k.skill_id, ', ') into v_bad from public.hr_skills k
   where k.skill_id <> all (public.hr_lb_skills());
  if v_bad is not null then raise exception 'SELF-CHECK (b): skills not ranked on total_level: %', v_bad; end if;
  -- (c) the Inner Flame board exists
  if not ('skill:inner_flame' = any (public.hr_lb_boards())) or 'skill:prayer' = any (public.hr_lb_boards()) then
    raise exception 'SELF-CHECK (c): hr_lb_boards() is %', public.hr_lb_boards(); end if;
  -- (d) the rebuilt view: every ranked hero's total_level is the sum of ALL its skill rows on their own curves
  --     (what src/core/xp.js totalLevel shows it), not just of the listed ones
  select count(*) into v_n
    from public.leaderboard_ranked r
    join lateral (select coalesce(sum(public.hr_skill_level(s.skill_id, s.xp)), 0) as want
                    from public.player_skills s
                   where s.user_id = r.subject_id and s.slot = 0) w on true
   where r.board = 'total_level' and r.score <> w.want;
  if v_n > 0 then raise exception 'SELF-CHECK (d): % hero(es) whose total_level is not their skills'' sum', v_n; end if;
end $chk$;
