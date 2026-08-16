-- ════════════════════════════════════════════════════════════════════════
-- b357 — RUNECRAFTING + STONEMASON JOIN THE SKILL BOARDS
--
-- WHY THIS FILE EXISTS AT ALL
--   `public.hr_lb_skills()` is the CLOSED board namespace: the ranked
--   materialized view filters every save's skill keys against it, "so a save
--   carrying a junk skill key cannot invent a board" (2026-08-08-leaderboards
--   .sql:168). That closure is the whole security property of the leaderboard
--   surface, and it is the reason the list is a SQL literal rather than
--   something derived from the client's SKILLS_DEF at read time.
--
--   The cost of that closure is exactly this file: adding a skill to
--   src/data/skills.js is a data change on the client and a MIGRATION on the
--   server, and the two must ship together. src/features/leaderboards.js's
--   SKILL_ORDER and the smoke suite's board test both assert the client list
--   is EXACTLY SKILLS_DEF, which is what makes forgetting this file impossible
--   rather than merely unlikely.
--
-- WHAT AN UNAPPLIED VERSION OF THIS LOOKS LIKE, STATED SO IT IS NOT A SURPRISE
--   The client offers `skill:runecrafting` and `skill:stonemason` chips as soon
--   as b357 deploys. Against a server that has NOT run this file,
--   `hr_leaderboard('skill:runecrafting')` returns an EMPTY board — not an
--   error, because the board id is simply absent from the ranked view. An empty
--   honour roll on a brand-new skill on wipe day is indistinguishable from the
--   truth, so the degraded state is honest. It resolves on apply.
--
-- SAFE TO RE-RUN. `create or replace` on one immutable function plus a refresh
-- of the view that reads it. It holds only derived data.
--
-- APPLY AFTER: 2026-08-08-leaderboards.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Fail closed if the leaderboard program has not been applied. A
--    `create or replace` against a database with no leaderboard would SUCCEED
--    and leave a function nothing reads — a migration that reports green while
--    doing nothing is worse than one that fails.
do $$
begin
  if to_regproc('public.hr_lb_skills') is null then
    raise exception 'run 2026-08-08-leaderboards.sql first — hr_lb_skills() does not exist';
  end if;
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'run 2026-08-08-leaderboards.sql first — leaderboard_ranked does not exist';
  end if;
end $$;

-- ── 1. The namespace. Order matches src/features/leaderboards.js SKILL_ORDER,
--    which matches src/data/skills.js. Seventeen ids; `bountyHunter` keeps its
--    camelCase, because the board id is the SAVE KEY and the save key is
--    camelCase.
create or replace function public.hr_lb_skills()
returns text[] language sql immutable as $$
  select array[
    'attack','strength','defense','hitpoints','prayer','magic','ranged',
    'woodcutting','mining','fishing','farming',
    'cooking','crafting','smithing','runecrafting','stonemason','bountyHunter'
  ]
$$;

-- ── 2. Rebuild the ranked rows so the two new boards are populated rather than
--    empty-until-the-next-scheduled-refresh. The view is derived data; a
--    refresh loses nothing.
refresh materialized view public.leaderboard_ranked;

-- ── 3. SELF-VERIFICATION ────────────────────────────────────────────────────
--    Four checks, and each one fails for a DIFFERENT reason so a red tells you
--    which half broke. (The repo's standing lesson: an always-passing probe is
--    the failure mode this project has been bitten by nine times, so every
--    assertion below is paired with something that could actually be false.)
do $$
declare v_n int; v_skills text[]; v_boards text[];
begin
  v_skills := public.hr_lb_skills();

  -- (a) the COUNT, so a botched edit that drops an id is caught even if both
  --     new ids are present.
  if array_length(v_skills, 1) <> 17 then
    raise exception 'hr_lb_skills() has % entries, expected 17', array_length(v_skills, 1);
  end if;

  -- (b) the two NEW ids specifically.
  if not ('skill:runecrafting' = any (public.hr_lb_boards())) then
    raise exception 'hr_lb_boards() is missing skill:runecrafting';
  end if;
  if not ('skill:stonemason' = any (public.hr_lb_boards())) then
    raise exception 'hr_lb_boards() is missing skill:stonemason';
  end if;

  -- (c) the CATALOGUE AGREES. This is the check that actually matters: the
  --     board namespace and the skill catalogue are two independent copies of
  --     one list, generated from the same src/data/skills.js by two different
  --     tools, and they have no other reason to agree. A board for a skill the
  --     catalogue does not have would rank a column no character can hold.
  if to_regclass('public.hr_skills') is not null then
    select count(*) into v_n
      from unnest(v_skills) s
     where not exists (select 1 from public.hr_skills k where k.skill_id = s);
    if v_n > 0 then
      raise exception '% leaderboard skill(s) are not in hr_skills — re-run tools/gen-catalogues.mjs and re-apply the catalogue', v_n;
    end if;
    select count(*) into v_n from public.hr_skills k
     where not (k.skill_id = any (v_skills));
    if v_n > 0 then
      raise exception '% skill(s) in hr_skills have no leaderboard board — this file is out of date', v_n;
    end if;
  end if;

  -- (d) the READ PATH still works end to end. `create or replace` on a function
  --     a materialized view depends on is exactly the shape that can leave the
  --     view stale or the RPC broken, and (a)-(c) would all pass anyway.
  v_boards := public.hr_lb_boards();
  if array_length(v_boards, 1) <> 23 then
    raise exception 'hr_lb_boards() has % entries, expected 23 (6 fixed + 17 skills)', array_length(v_boards, 1);
  end if;
  perform public.hr_leaderboard('skill:mining', 25, 1);
  perform public.hr_leaderboard('skill:stonemason', 25, 1);

  raise notice 'LEADERBOARD SKILLS OK — % boards, % skills (runecrafting + stonemason added)',
    array_length(v_boards, 1), array_length(v_skills, 1);
end $$;
