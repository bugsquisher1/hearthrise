-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A BAR SLOT TAKES AT MOST THREE CONDITIONS, AND ALL MUST MATCH
-- (Tyler's ruling, 2026-10-19 audit item C2; lane b-condition-builder). STAGED.
-- Game CLOSED: applies on its passing §4; Security reviews it with every
-- action-engine surface at the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- 1. hr_hunt_condition_limits.max_conditions 4 -> 3 (src/data/condition-
--    metrics.js MAX_CONDITIONS; the ⟦limits⟧ block below is generated from it
--    and pinned equal by tests/hunt-core/conditions.mjs `sql-rows`).
-- 2. hr_hunt_conds_check RESTATED (2026-10-25-action-conditions.sql §2): a
--    SLOT's join must be 'and' ("all conditions must match"); a STOP RULE keeps
--    'and' | 'or'. Mirrored by src/core/hunt/conditions.js conditionsProblem.
-- A stored bar that breaks either rule reads as empty tablets through
-- hr_hunt_settings_view (hr_hunt_slot_check), never as a half-slot: no
-- migration of stored rows (no back-compat before the EA wipe, CLAUDE.md §1).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Narrows what a client may store; moves no value.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-10-25-action-conditions.sql's §1 limits block and §2 body.
-- ORDER: after 2026-10-25-action-conditions.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_hunt_condition_limits') is null
     or to_regprocedure('public.hr_hunt_conds_check(jsonb,jsonb,boolean)') is null
     or to_regprocedure('public.hr_hunt_cond_check(jsonb,boolean)') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-action-conditions.sql first'; end if;
end $mig$;

-- ── §1 THE LIMITS (condition-metrics.js MAX_CONDITIONS / MAX_STOP_RULES / STOP_HOLD_MS) ──
delete from public.hr_hunt_condition_limits;
insert into public.hr_hunt_condition_limits (key, value) values
-- ⟦limits⟧
  ('max_conditions', 3),
  ('max_stop_rules', 3),
  ('stop_hold_max_ms', 600000),
  ('stop_hold_step_ms', 100)
-- ⟦/limits⟧
;

-- ── §2 THE CONDITIONS CHECK: a slot's conditions all must match ──────────────
create or replace function public.hr_hunt_conds_check(p_conds jsonb, p_join jsonb, p_stop boolean)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_e jsonb; v_i int := 0; v_why text;
  v_max int := (select value from public.hr_hunt_condition_limits where key = 'max_conditions');
begin
  if v_max is null then return jsonb_build_object('error', 'catalogue_missing'); end if;
  if p_conds is not null and jsonb_typeof(p_conds) <> 'array' then return jsonb_build_object('error', 'bad_condition'); end if;
  if p_conds is not null and jsonb_array_length(p_conds) > v_max then return jsonb_build_object('error', 'too_many_conditions', 'max', v_max); end if;
  -- A slot: all must match ('and'). A stop rule: 'and' or 'or'.
  if p_join is not null and (jsonb_typeof(p_join) <> 'string' or (p_join #>> '{}') not in ('and', 'or')
                             or (not coalesce(p_stop, false) and (p_join #>> '{}') <> 'and')) then
    return jsonb_build_object('error', 'bad_join'); end if;
  for v_e in select value from jsonb_array_elements(coalesce(p_conds, '[]'::jsonb)) loop
    v_why := public.hr_hunt_cond_check(v_e, p_stop);
    if v_why is not null then return jsonb_build_object('error', v_why, 'condition', v_i); end if;
    v_i := v_i + 1;
  end loop;
  return null;
end $$;
revoke execute on function public.hr_hunt_conds_check(jsonb, jsonb, boolean) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED; it changes nothing it reads ──────
do $$
declare
  c jsonb := '{"metric":"self_hp_pct","op":"lt","value":50}'::jsonb;
  v jsonb;
begin
  if (select value from public.hr_hunt_condition_limits where key = 'max_conditions') <> 3 then
    raise exception 'VERIFY(a): max_conditions is not 3'; end if;
  v := public.hr_hunt_conds_check(jsonb_build_array(c, c, c), '"and"'::jsonb, false);
  if v is not null then raise exception 'VERIFY(b): three conditions joined and were refused: %', v; end if;
  v := public.hr_hunt_conds_check(jsonb_build_array(c, c, c, c), '"and"'::jsonb, false);
  if v->>'error' is distinct from 'too_many_conditions' then raise exception 'VERIFY(c): four conditions were not refused: %', v; end if;
  v := public.hr_hunt_conds_check(jsonb_build_array(c, c), '"or"'::jsonb, false);
  if v->>'error' is distinct from 'bad_join' then raise exception 'VERIFY(d): a slot joined or was not refused: %', v; end if;
  v := public.hr_hunt_conds_check(jsonb_build_array(c, c), '"or"'::jsonb, true);
  if v is not null then raise exception 'VERIFY(e): a stop rule joined or was refused: %', v; end if;
  v := public.hr_hunt_slot_check(jsonb_build_object('action', jsonb_build_object('type', 'consume', 'id', 'food'),
         'conditions', jsonb_build_array(c, c), 'join', 'or'));
  if (v->>'ok')::boolean then raise exception 'VERIFY(f): hr_hunt_slot_check stored a slot joined or: %', v; end if;
  if has_function_privilege('authenticated', 'public.hr_hunt_conds_check(jsonb,jsonb,boolean)', 'execute') then
    raise exception 'VERIFY(g): hr_hunt_conds_check is callable by clients'; end if;
end $$;
