-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A BENCH RUN CAN "MAKE N" (lane c-work-fixes, systems-engineer,
-- 2026-10-22; town-skills designer handoff, docs/planning/PRIORITY_BOARD.md:
-- "Forging one tool spends every bar and plank today").
-- STAGED. Game CLOSED: applies on its passing §4; Security reviews it at the
-- reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- player_state.active_left (NEW, nullable int 1..100000): how many more actions
-- the artisan run on the pointer may make. NULL = until an input runs out (the
-- behaviour before this file).
-- hr_apply, FIVE anchored splices (each anchor must match exactly once; the
-- function is NOT restated, so nothing else in its 2,500 lines can move):
--   1. the delta-key allowlist gains `active_left` (engine output);
--   2. the activity statement's allowlist gains `count`;
--   3. validation: `count` only on an artisan statement, a whole number
--      1..100000; `active_left` only with `accrued_to` (an accrual), never with an
--      activity statement, on a stored artisan run with a count, a whole number
--      at least 1 and BELOW the stored count (it only ever counts down);
--   4. the row write: any activity statement sets active_left to its count (or
--      NULL); `active_left` alone lowers it;
--   5. one declared variable for the above.
-- The engine (hr-accrue accrual.js accrueArtisan) caps a window at the count,
-- proposes the lowered count when it is not yet reached, and ends the run
-- (activity idle, which clears the count) on the action that reaches it. So a
-- run pays exactly N actions however its settles are cut, and fewer when the
-- bag runs out first ("as many as possible"); a replayed settle is refused by
-- the watermark and the version check as before, and pays nothing.
-- hr_bench_run_view (NEW, section `bench_run` of the envelope registry):
-- { left } (the column; only the artisan engine and a bench row read it). The engine reads it as
-- `activeLeft`; the Work window shows "N left".
-- Moves no value: a count can only SHORTEN a run the bag already bounds.
--
-- REVERSIBILITY: re-apply hr_apply from 2026-10-27-core-bodies.sql, delete the
-- `bench_run` section row, drop hr_bench_run_view and the column.
-- ORDER: after 2026-11-22-loot-catalogue.generated.sql (no object in
-- common). No begin/commit. The client half (the Work window's amount picker)
-- needs this applied and the edge carrying `count` deployed first.
-- ════════════════════════════════════════════════════════════════════════

alter table public.player_state add column if not exists active_left int;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_active_left_range') then
    alter table public.player_state add constraint player_state_active_left_range
      check (active_left is null or active_left between 1 and 100000);
  end if;
end $mig$;
comment on column public.player_state.active_left is
  '2026-12-01-bench-count.sql: actions left on the artisan run (set by the activity statement''s count, lowered by the engine; NULL = until an input runs out).';

-- ── §1 hr_apply: five anchored splices ─────────────────────────────────────
do $mig$
declare
  v_def text; v_n int; v_i int;
  a_old text[]; a_new text[];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BENCH-COUNT') > 0 then raise notice 'hr_apply already carries BENCH-COUNT — splices skipped'; return; end if;
  a_old := array[
$a$  c_delta_keys constant text[] := array[$a$,
$a$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$a$,
$a$                  where ak <> all (array['kind','id','restart'])) then$a$,
$a$    -- ── (4a-ii) THE GATHERING TOOL CARRY (b348)$a$,
$a$           tool_carry   = case when p_delta ? 'tool_carry'$a$];
  a_new := array[
$a$  -- BENCH-COUNT (2026-12-01-bench-count.sql): the run's count this apply writes.
  v_bench_left int;
  c_delta_keys constant text[] := array[$a$,
$a$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- BENCH-COUNT: the engine's lowered count of a "make N" run (2026-12-01-bench-count.sql).
    'active_left',$a$,
$a$                  where ak <> all (array['kind','id','restart','count'])) then$a$,
$a$    -- ── BENCH-COUNT (2026-12-01-bench-count.sql): "make N" ─────────────────
    -- `count` rides only an artisan statement (a whole number 1..100000); any
    -- statement without one clears the run's count. `active_left` is the
    -- engine's countdown: only on an accrual (accrued_to), never beside an
    -- activity statement, on a stored artisan run that has a count, a whole
    -- number at least 1 and below the stored one. It can only shorten a run.
    if p_delta ? 'activity' and v_act ? 'count' then
      if v_act->>'kind' is distinct from 'artisan' or jsonb_typeof(v_act->'count') <> 'number'
         or (v_act->>'count')::numeric <> trunc((v_act->>'count')::numeric)
         or (v_act->>'count')::numeric < 1 or (v_act->>'count')::numeric > 100000 then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'count is a whole number 1..100000 on an artisan run'));
      end if;
      v_bench_left := (v_act->>'count')::int;
    end if;
    if p_delta ? 'active_left' then
      if p_delta ? 'activity' or not (p_delta ? 'accrued_to')
         or jsonb_typeof(p_delta->'active_left') <> 'number'
         or (p_delta->>'active_left')::numeric <> trunc((p_delta->>'active_left')::numeric)
         or v_st.active_kind is distinct from 'artisan' or v_st.active_left is null
         or (p_delta->>'active_left')::numeric < 1
         or (p_delta->>'active_left')::numeric >= v_st.active_left then
        perform public.hr_reject('bad_delta',
          jsonb_build_object('why', 'active_left only counts a stored artisan run down', 'stored', v_st.active_left));
      end if;
      v_bench_left := (p_delta->>'active_left')::int;
    end if;

    -- ── (4a-ii) THE GATHERING TOOL CARRY (b348)$a$,
$a$           -- BENCH-COUNT: an activity statement sets the run's count (NULL = until
           -- the bag runs out); `active_left` alone counts it down.
           active_left  = case when p_delta ? 'activity' or p_delta ? 'active_left'
                               then v_bench_left else active_left end,
           tool_carry   = case when p_delta ? 'tool_carry'$a$];
  for v_i in 1 .. array_length(a_old, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a_old[v_i], ''))) / length(a_old[v_i]);
    if v_n <> 1 then raise exception 'hr_apply: BENCH-COUNT anchor % matched % times (need 1) — the body moved', v_i, v_n; end if;
    v_def := replace(v_def, a_old[v_i], a_new[v_i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; no grant moves here.
  execute v_def;
end $mig$;

-- ── §2 THE ENVELOPE SECTION ────────────────────────────────────────────────
create or replace function public.hr_bench_run_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- The column as stored: only the artisan engine reads it (accrual.js accrueArtisan), and the
  -- Work window shows it on a bench row only.
  select jsonb_build_object('left', ps.active_left)
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$$;
revoke execute on function public.hr_bench_run_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('bench_run', 'hr_bench_run_view', '2026-12-01-bench-count.sql: actions left on this hero''s artisan run ("make N"); null = until the bag runs out')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The database half of "make N": the count is stored only on an artisan run,
-- only counts down, is cleared by any other statement, and a replayed apply
-- moves nothing. (The engine half, a run pays exactly N or as many as the bag
-- allows when N is more, is tests/activity-intent.mjs BENCH-N on this chain.)
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e3b0001';
  k text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_d jsonb; v_ver bigint; v_n int; v_rec text;
begin
  begin
    v_rec := (select a.activity_id from public.hr_activities a where a.kind = 'artisan' and a.activity_id = 'smelt_copper'
               and coalesce(a.req_lv, 1) <= 1);
    if v_rec is null then raise exception 'VERIFY(0): the catalogue has no level-1 smelt_copper artisan row'; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Bench') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bench-count §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;

    -- (a) an artisan statement with count 5: stored, and projected as bench_run.left.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '5e3b0101')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true, 'count', 5),
                         'journal', jsonb_build_object('kind', 'admin', 'intent', 'set_activity:artisan:' || v_rec, 'meta', jsonb_build_object('count', 5))));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): make 5 was refused: %', v; end if;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is distinct from 5 then raise exception 'VERIFY(a): make 5 stored active_left %', v_n; end if;
    if (public.hr_state_of(v_u, 0)->'bench_run'->>'left')::int is distinct from 5 then
      raise exception 'VERIFY(a): the envelope says bench_run %', public.hr_state_of(v_u, 0)->'bench_run'; end if;

    -- (b) a count that is not a whole number 1..100000 on an artisan statement is refused, and moves nothing.
    for v_d in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true, 'count', 0)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true, 'count', 2.5)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true, 'count', 100001)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true, 'count', '3')),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', 'copper_rock', 'restart', true, 'count', 3)))) as t(x) loop
      select version into v_ver from public.player_state where user_id = v_u and slot = 0;
      v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), v_d);
      if v->>'error' is distinct from 'bad_activity' then
        raise exception 'VERIFY(b): an illegal count answered % (want bad_activity): %', v, v_d; end if;
    end loop;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is distinct from 5 then raise exception 'VERIFY(b): a refused count moved active_left to %', v_n; end if;

    -- (c) the engine counts it down 5 -> 3 on an accrual; a replay of that apply moves nothing.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v_d := jsonb_build_object('accrued_to', now(), 'active_left', 3, 'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue'));
    v := public.hr_apply(v_u, 0, v_ver, (k || '5e3b0105')::uuid, v_d);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): the countdown 5 -> 3 was refused: %', v; end if;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is distinct from 3 then raise exception 'VERIFY(c): the countdown stored %', v_n; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    perform public.hr_apply(v_u, 0, v_ver, (k || '5e3b0105')::uuid, v_d);
    if (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver then
      raise exception 'VERIFY(c): a replayed countdown (same key) wrote the row again'; end if;
    -- never up, never level, never to 0, never without accrued_to, never beside an activity statement.
    for v_d in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('accrued_to', now(), 'active_left', 4),
        jsonb_build_object('accrued_to', now(), 'active_left', 3),
        jsonb_build_object('accrued_to', now(), 'active_left', 0),
        jsonb_build_object('accrued_to', now(), 'active_left', 2.5),
        jsonb_build_object('active_left', 2),
        jsonb_build_object('accrued_to', now(), 'active_left', 2,
          'activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true)))) as t(x) loop
      select version into v_ver from public.player_state where user_id = v_u and slot = 0;
      v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), v_d);
      if v->>'error' is distinct from 'bad_delta' then
        raise exception 'VERIFY(c): an illegal countdown answered % (want bad_delta): %', v, v_d; end if;
    end loop;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is distinct from 3 then raise exception 'VERIFY(c): an illegal countdown moved active_left to %', v_n; end if;

    -- (d) the run is over (the engine's idle at N, or a Stop): the count is cleared, the envelope says null.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '5e3b0106')::uuid,
      jsonb_build_object('accrued_to', now(), 'activity', jsonb_build_object('kind', 'idle', 'id', null),
                         'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the run''s end was refused: %', v; end if;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is not null then raise exception 'VERIFY(d): an idle pointer kept active_left %', v_n; end if;
    if public.hr_state_of(v_u, 0)->'bench_run'->'left' <> 'null'::jsonb then
      raise exception 'VERIFY(d): the envelope says bench_run %', public.hr_state_of(v_u, 0)->'bench_run'; end if;
    -- (e) an artisan statement without a count runs until the bag is out (NULL).
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '5e3b0108')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_rec, 'restart', true)));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): an artisan start without a count was refused: %', v; end if;
    select active_left into v_n from public.player_state where user_id = v_u and slot = 0;
    if v_n is not null then raise exception 'VERIFY(e): an uncounted run stored active_left %', v_n; end if;
    raise exception using errcode = 'HR884', message = 'bench-count §3 complete - rolling back';
  exception when sqlstate 'HR884' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'bench-count: a count is stored only on an artisan run, only counts down, clears on any other statement, a replay moves nothing; all green';
end $$;
