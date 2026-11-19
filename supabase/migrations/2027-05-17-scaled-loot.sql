-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-17-scaled-loot.sql — A SCALED WINDOW'S ITEMS, BOUNDED AT ITS DROPS MULTIPLE (lane/c-arm-switches, systems-engineer, 2026-11-18;
--   Tyler 2026-11-07, binding: "difficulty, XP and loot scale"; the designer's rule the same day: a scaled kill's drops gain as much gold as
--   its coin does and never more than Gold ×, src/data/scaled-hunts.js lootPmFor; the engine rolls each of the ground's own rows ceil(x)
--   times at chance × x / ceil(x), src/core/drops.js rollDropTable).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §2. MONEY SURFACE (the items a settle may pay): ON THE EA SECURITY LIST with 2027-03-21-scaled-hunts.sql.
-- ORDER: after 2027-05-17-scaled-loot-scaled-hunts-catalogue.generated.sql (hr_scaled_kill_bounds.loot_pm, read here) and
--   2027-05-17-scaled-best.sql; before 2027-05-18-arm-scaled-hunts.sql. §0 pins hr_hunt_apply_member as 2027-05-17-scaled-best.sql leaves it
--   (production's bd933997, tests/live-hash-drift.baseline.json 2026-11-18, plus that file's one SCALED-BEST splice).
-- EDGE: the hr-accrue that rolls a scaled row's drops at its multiple deploys BEFORE 2027-05-18-arm-scaled-hunts.sql. Either order with this
--   file is safe while the switch is off (no window is proved scaled, the multiplier below reads 1); an engine that rolls more than one roll a
--   row before this file lands would be refused value_over on a scaled window, which is why the arm waits on both.
-- CLIENT: none here (the card's "Drops ×" row reads src/data/scaled-hunts.js scaleFor).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_hunt_apply_member   ONE anchored splice (marker SCALED-LOOT): the item bound (kills × the most rows one kill of the ground names an
--                          item) is multiplied, on a window the commit proved scaled (hunt_instances.scale_level, written by
--                          hr_hunt_apply_instance before any member lands), by the rolls a row takes at that ground and Level:
--                          ceil(hr_scaled_kill_bounds.loot_pm / 1000). An unscaled window multiplies by 1, the bound as before.
--
-- ── CONCURRENCY AND IDEMPOTENCY ───────────────────────────────────────────────
-- A read of the instance row this settle already holds locked and one catalogue primary key, inside the bound's own statement: no new
--   lock, no write. A second apply finds the marker and changes nothing; §0 refuses a body that is neither its pin nor this file's.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- The multiple is the server's own: the Level the commit re-proved (a claim the leader's bank and Level don't hold is scale_moved before
--   this runs) and the generated catalogue's loot_pm for it. A forged item count past kills × rows × the rolls is refused value_over, as
--   any other window's. Coin, XP and Defense keep their own bounds (hr_scaled_kill_bounds gold_max, xp_max, level_max).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One primary-key join a settle that carries items; nothing else.
--
-- REVERSIBILITY: re-apply the pinned pre-image (225e3b72e36375eeafd625e9c4315a25, the body 2027-05-17-scaled-best.sql leaves). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_scaled_kill_bounds' and column_name = 'loot_pm') then
    raise exception 'PRECONDITION: hr_scaled_kill_bounds.loot_pm: apply 2027-05-17-scaled-loot-scaled-hunts-catalogue.generated.sql first'; end if;
  v_def := pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) is distinct from '225e3b72e36375eeafd625e9c4315a25'
     and strpos(v_def, 'SCALED-LOOT (2027-05-17-scaled-loot.sql)') = 0 then
    raise exception 'PIN: hr_hunt_apply_member is neither the image 2027-05-17-scaled-best.sql leaves (225e3b72) nor this file''s: md5 % - another file moved it',
      md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')); end if;
end $mig$;

-- ── §1 THE BOUND (one anchored splice) ────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  if strpos(v_def, 'SCALED-LOOT (2027-05-17-scaled-loot.sql)') > 0 then return; end if;
  v_old := $a$              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;$a$;
  v_new := $a$              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
           -- SCALED-LOOT (2027-05-17-scaled-loot.sql): a window the commit proved scaled rolls each row ceil(loot_pm / 1000) times
           * coalesce((select ceil(b.loot_pm / 1000.0) from public.hunt_instances i join public.hr_scaled_kill_bounds b
                        on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 1)
     limit 1;$a$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'hr_hunt_apply_member: the item bound anchor matched % times (need 1): the body moved', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, read-only ────────────────────────
-- (a) the body carries the marker and the multiplier exactly once
-- (b) every scalable ground holds a loot_pm row for every Level it scales to, each at least 1000 (one roll, the table as written)
-- (c) no client role can execute the member half (the grant hygiene baseline holds)
do $chk$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'SCALED-LOOT (2027-05-17-scaled-loot.sql)', ''))) / length('SCALED-LOOT (2027-05-17-scaled-loot.sql)') <> 1
     or strpos(v_def, '* coalesce((select ceil(b.loot_pm / 1000.0) from public.hunt_instances i join public.hr_scaled_kill_bounds b') = 0 then
    raise exception 'scaled-loot §2(a): the item bound does not read the scaled rolls once'; end if;
  if exists (select 1 from public.hr_scaled_kill_bounds where loot_pm is null or loot_pm < 1000)
     or exists (select 1 from public.hr_scaled_grounds s cross join public.hr_scaled_hunt_rule r
                 where (select count(*) from public.hr_scaled_kill_bounds b where b.hunt_id = s.hunt_id) <> r.top_level - s.top) then
    raise exception 'scaled-loot §2(b): a scaled ground or Level holds no loot multiple'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure, 'execute') then
    raise exception 'scaled-loot §2(c): a client role reaches hr_hunt_apply_member'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'scaled-loot §2 OK: a scaled window''s items are bounded at its rolls, every other window as before';
end $chk$;
