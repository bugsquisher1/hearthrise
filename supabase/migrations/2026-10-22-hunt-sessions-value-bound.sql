-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: THE VALUE BOUND (lane C2; Security GO-WITH-CHANGES
-- on 534b49fb, item 3 — required BEFORE THE GAME OPENS, staged after the arm).
-- STAGED, NOT APPLIED. Security GO REQUIRED (XP + GOLD + ITEM SURFACE).
--
-- THE PROPERTY. A hunt settle's VALUE is bounded by K x the catalogue maximum
-- per kill, server-side, where K is the kills the settle's own stamped ledger
-- rows journal — the same K that (4b) has already held to the spawn cycle
-- (K = left_old + P x n - left_new, n within the respawns the window's TIME
-- admits). So the value a window can carry is bounded by time, not by the
-- engine's word:
--   gold   p_delta.gold                <= K       x max gold_max x headroom
--   XP     sum of positive p_delta.xp  <= (K + P) x max xp_max   x headroom
--          (+P: a foe standing at either edge of the window may have taken
--           damage this window without dying in it — at most P of them)
--   items  every positive p_delta.items[i] <= K x max drops[i] over the
--          hunt's spawns (one unit per drop row naming it; no headroom — a
--          drop row pays exactly one unit), and an item no spawn drops is
--          refused outright.
-- The maxima are generated rows (hr_hunt_kill_bounds, from src/data/monsters.js
-- by tools/gen-hunt-sessions.mjs into 2026-10-22-hunt-sessions-catalogue.
-- generated.sql); the headroom is the generated limits row value_headroom
-- (hunt-sessions.js VALUE_HEADROOM, 3) — a BLAST RADIUS that absorbs every
-- multiplier honest play has (gold find, XP perks and buffs, rested), never a
-- balance number. The spawns are hr_hunt_spawns for a named hunt and the
-- monster itself for a training hunt (hr_hunt_travel.training).
-- Refused `value_over` (HR000 inside the settle's subtransaction: the value
-- half and the session clock roll back together, journalled by hr_apply's
-- caller like every other session-half refusal).
--
-- HOW. ONE anchored splice of hr_hunt_apply (declares + a (4c) block right
-- after the spawn cycle's write), exactly-once, idempotent on the marker
-- `value_over`. hr_hunt_apply's grants are untouched (CREATE OR REPLACE keeps
-- the ACL) and re-asserted in §2.
-- ORDER: after 2026-10-22-hunt-sessions-arm.sql (the catalogue rows ride the
-- 10-22 catalogue file, applied first). Reversible: re-apply the settle file's
-- hr_hunt_apply (the splice is the only change).
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)') is null then
    raise exception 'PRECONDITION: hr_hunt_apply is absent — apply 2026-10-22-hunt-sessions-settle.sql first';
  end if;
  if to_regclass('public.hr_hunt_kill_bounds') is null or not exists (select 1 from public.hr_hunt_kill_bounds) then
    raise exception 'PRECONDITION: hr_hunt_kill_bounds is absent or empty — apply 2026-10-22-hunt-sessions-catalogue.generated.sql first';
  end if;
  if public.hr_hunt_limit('value_headroom') is null then
    raise exception 'PRECONDITION: no value_headroom limits row';
  end if;
end $$;

-- ── §1 THE SPLICE ────────────────────────────────────────────────────────────
do $$
declare
  v_def text; v_n int;
  c_old1 constant text := $a$  v_ira       timestamptz;
$a$;
  c_new1 constant text := $a$  v_ira       timestamptz;
  -- THE VALUE BOUND (2026-10-22-hunt-sessions-value-bound.sql)
  v_vb_gold   bigint;
  v_vb_xp     bigint;
  v_vb_h      bigint;
  v_vb_item   text;
$a$;
  c_old2 constant text := $a$           version = version + 1
     where id = v_s.instance_id;
$a$;
  c_new2 constant text := $a$           version = version + 1
     where id = v_s.instance_id;
    -- (4c) THE VALUE BOUND (Security GO item 3): the window's gold, XP and
    --      drops are held to K x the catalogue maximum per kill of this hunt's
    --      spawns (hr_hunt_kill_bounds), K being the kills (4b) just proved.
    v_vb_h := public.hr_hunt_limit('value_headroom');
    select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
      from public.hr_hunt_kill_bounds b
     where b.monster_id in (select sp.monster_id from public.hr_hunt_spawns sp where sp.hunt_id = v_s.hunt_id
                            union select t.hunt_id from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id and t.training);
    if jsonb_typeof(p_delta->'gold') = 'number'
       and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold',
        'kills', v_kills, 'max', v_kills * v_vb_gold * v_vb_h));
    end if;
    if jsonb_typeof(p_delta->'xp') = 'object'
       and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
             where jsonb_typeof(e.value) = 'number') > (v_kills + v_psz) * v_vb_xp * v_vb_h then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pull', v_psz,
        'max', (v_kills + v_psz) * v_vb_xp * v_vb_h));
    end if;
    if jsonb_typeof(p_delta->'items') = 'object' then
      select e.key into v_vb_item from jsonb_each(p_delta->'items') e
       where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
         and (e.value #>> '{}')::numeric > v_kills * coalesce((
               select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
                where b.monster_id in (select sp.monster_id from public.hr_hunt_spawns sp where sp.hunt_id = v_s.hunt_id
                                       union select t.hunt_id from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id and t.training)), 0)
       limit 1;
      if v_vb_item is not null then
        perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
          'qty', p_delta->'items'->v_vb_item, 'kills', v_kills));
      end if;
    end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure), chr(13), '');
  if strpos(v_def, 'value_over') > 0 then raise notice 'hr_hunt_apply already bounds the value — edit skipped'; return; end if;
  foreach v_n in array array[1, 2] loop
    if (length(v_def) - length(replace(v_def, case v_n when 1 then c_old1 else c_old2 end, '')))
       / length(case v_n when 1 then c_old1 else c_old2 end) <> 1 then
      raise exception 'hr_hunt_apply: value-bound anchor % did not match exactly once — the body moved', v_n;
    end if;
  end loop;
  execute replace(replace(v_def, c_old1, c_new1), c_old2, c_new2);
end $$;

-- ── §2 GRANTS — EXACT, REVOKE FIRST ──────────────────────────────────────────
revoke execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from public;
revoke execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to hr_engine;

-- ── §3 SELF-CHECK (CLAUDE.md §4) ─────────────────────────────────────────────
do $$
declare v_role text; v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure;
  if (length(v_src) - length(replace(v_src, '(4c) THE VALUE BOUND', ''))) / length('(4c) THE VALUE BOUND') <> 1 then
    raise exception 'SELF-CHECK: hr_hunt_apply does not carry exactly one (4c) value bound';
  end if;
  if position('(4c) THE VALUE BOUND' in v_src) < position('(4b) THE SPAWN CYCLE, RE-PROVED' in v_src)
     or position('(4c) THE VALUE BOUND' in v_src) > position('(5a) THE STAMINA POOL' in v_src) then
    raise exception 'SELF-CHECK: the value bound is not between the proved kill count (4b) and the stamina pool (5a)';
  end if;
  -- Every monster a hunt can spawn has a bound row (a missing row would bound
  -- its kills at 0 and refuse every honest settle on that ground).
  if exists (select 1 from public.hr_hunt_spawns sp
              where not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = sp.monster_id))
     or exists (select 1 from public.hr_hunt_travel t where t.training
                  and not exists (select 1 from public.hr_hunt_kill_bounds b where b.monster_id = t.hunt_id)) then
    raise exception 'SELF-CHECK: a spawnable monster has no hr_hunt_kill_bounds row';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'execute') then
    raise exception 'SELF-CHECK: hr_engine lost hr_hunt_apply'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'execute') then
      raise exception 'SELF-CHECK: % can execute hr_hunt_apply', v_role; end if;
    if has_table_privilege(v_role, 'public.hr_hunt_kill_bounds', 'select,insert,update,delete') then
      raise exception 'SELF-CHECK: % reaches hr_hunt_kill_bounds', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
end $$;
