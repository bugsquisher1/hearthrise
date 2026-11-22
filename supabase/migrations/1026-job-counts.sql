-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1026-job-counts.sql — EVERY JOB TAKES A COUNT AND A "THEN", AND THE SERVER ENDS IT AT THE COUNT
--   (plan L08, retention R3; lane/c-job-counts, backend-architect, 2026-11-20).
-- RE-CUT 2026-11-22 (lane/r12-company-trades, FB-10 slice 1; designer D-11, review/05-designer-rulings.md section 3.4, and
--   12-targets.md's fate table): "The counts stay, the sweep goes." No rest plan starts a hunt (Tyler let 27b stand 2026-11-21), so
--   the THEN of hunt, hr_job_next_start, hr_job_next_sweep, the cron job hr-job-next, its index and its ledger row are WITHDRAWN.
--   The THEN keeps one value, wait (a later queue step may add one). Never applied, so cut in place; 1040-rested-bank-cut.sql,
--   which restates hr_apply with these splices, is re-derived after it in the same lane.
--
-- STATUS: supabase/migration-notes/1026-job-counts.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: hr-accrue moves with it (accrue-gather.js counts a gathering job down and ends it; accrue-artisan.js and
--   accrue-gather.js state what an ended job left; set-activity.js + request.js take `next` (the THEN) and require a gathering count;
--   tick-shadow.js carries the count between polls). Either half alone is safe: an old edge sends no `next` and no gathering
--   count (jobs run as today); a new edge on the old database sends neither until this file's `bench_run` section names
--   `count` (set-activity.js, the self-configuring switch: a gathering job runs uncounted, as today). Apply, then deploy.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 158k chars, 14 splices deep since
--   2026-10-27-core-bodies.sql) takes FOUR anchored edits in §2, each matched exactly once, marked JOB-COUNTS; a whole
--   restatement would overwrite any hr_apply splice a lane in flight lands first. The restatement is its own lane.
--
-- ── WHY (the retention dive, 27-retention.md, PLAYED) ───────────────────────────────────────────────────────────────────
-- The Level 7 coach card sends a new hero to gather 20 Copper Ore. The job took no count and nothing sent the hero back: 8 hours
-- later the card read "+6,001 Copper Ore, Mining 1 to 42. Still mining." A job must end, and the player says how it ends.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A gathering job or a bench run takes a COUNT (actions: swings at a node, crafts at a bench; 1..100000) and a THEN, both on the
-- one set_activity statement. A gathering job MUST carry a count (the edge refuses one without); a bench may run on "All" (no
-- count: until its inputs run out), which takes no THEN. The engine caps every window at the count left and ENDS the job on the
-- action that reaches it, on every door (the owner's accrue, a switch's collect, the world tick), so N actions are paid however
-- the settles are cut. Then the THEN (src/data/hunt-after.js JOB_NEXTS):
--   wait   the hero waits in town. Nothing a job ends in starts a hunt (D-11: a hunt starts on a press in a session).
-- A THEN runs only when the COUNT is reached. A job the inputs, a full bag, the level gate or the purse ended first stops and
-- says so; the player's own Stop is a Stop. A job a hunt's after-plan resumes, or a Hearth errand gives back, keeps its count
-- left; the errand gives back its whole count and its THEN too, a resumed job ends waiting (one follow-up, never a loop:
-- ruling C8 and 27-1, "no hunt ever starts by itself"). A gathering job resumes after a hunt only with a count left, as a bench.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- player_state.active_left   (2026-12-01-bench-count.sql) the job's count LEFT; now a gathering job's too.
-- player_state.active_count  NEW int 1..100000: the job's whole count as set (the card's "N of M"); NULL with no count.
-- player_state.active_next   NEW text, wait (CHECK = JOB_NEXTS ids): the job's THEN; NULL = wait.
-- player_state.errand_count, errand_next  NEW: the count and THEN a Hearth errand keeps for the job it interrupted.
-- player_state.job_end       NEW jsonb: the last counted job the ENGINE ended: { kind, id, count, done, left, next,
--   end: count | stopped, at, next_state?: waited }. Never a value: what the card says. Written only by hr_apply (the end; 1059
--   adds end: work_cap when the hero's work day ran out).
-- hr_apply   FOUR splices (JOB-COUNTS): `next` (the THEN; never `then`, which makes a JS object a thenable) joins the activity statement's allowlist; `count` rides a gathering or a bench
--   statement, `next` (wait) only beside a count; `active_left` counts a stored gathering job or bench run down (1 ..
--   stored-1, as before), or, BESIDE an `activity: idle` on an accrual, says what the ending job left (0 .. stored): 0 is the
--   count reached. That end writes job_end (not for a Hearth errand: hr_hearth_errand). Every activity statement writes
--   active_count and active_next (NULL without).
-- hr_work_job_note()  NEW BEFORE UPDATE trigger on player_state, named to fire AFTER hr_town_errand (name order): an errand keeps
--   and gives back the job's count and THEN; a pointer with no counted job carries neither; a count set without its whole
--   (a resume, a give-back) is its own whole.
-- hr_activity_left, hr_resume_plan  RESTATED (2027-04-24-bench-resume.sql's images + a gathering arm): a gathering job's count
--   left is its own; it resumes after a hunt only with one ("no_count" otherwise: the 6,001-ore path).
-- hr_bench_run_view   RESTATED (the plan-cache image + three keys): the `bench_run` section is { left, count, next, ended }.
--   The engine reads `left` as activeLeft (envelope.js), as before. The key keeps the bench's name from before gathering counted.
-- ERROR TAXONOMY: none new. bad_activity (a count off a job or out of range, a THEN without a count or not a JOB_NEXTS id: a
--   THEN of hunt is refused by name) and bad_delta (an active_left that is not a countdown of a stored counted job) are hr_apply's
--   existing codes.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────────────────
-- Every pointer and count writer holds the hero's row lock (hr_apply's `for update` under hr_hunt_lock's key; the tick's fence),
-- and the trigger runs inside that UPDATE. A replayed settle key returns before the UPDATE (hr_apply `replayed`), so a count is
-- counted down, and a job's end written, once per landed window; `active_left` may never rise, so a re-cut window cannot pay
-- past N. No roll, no clock but now(), no sweep.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- No new client verb, grant, policy, value key or price. A count only SHORTENS a job (the engine's cap; hr_apply refuses any
-- rise). Nothing here starts a hunt (the re-cut took the sweep out, so this file leaves the EA Security list's "a server sweep
-- starts a hunt" row).
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────────────────────────────────────────────────
-- Rows: none; the job's end rides the window's existing ledger row. Columns: 5 small ones on player_state (~40 B a hero). No
-- sweep, no index, no statement a minute (the 15-cent budget, RULED 2026-11-21).
--
-- REVERSIBILITY: drop the trigger hr_work_job_note and the function hr_work_job_note; re-apply hr_activity_left / hr_resume_plan from 2027-04-24-bench-resume.sql and
--   hr_bench_run_view from 2027-02-10-settle-plan-cache.generated.sql; re-apply hr_apply's four pre-images (the a_old texts of
--   §2) by the same splice reversed; drop the five columns. Player state written meanwhile: active_left on gathering jobs
--   (harmless to the old engine, which ignores it for a node).
-- ════════════════════════════════════════════════════════════════════════

-- ── §1 THE COLUMNS ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists active_count int;
alter table public.player_state add column if not exists active_next text;
alter table public.player_state add column if not exists errand_count int;
alter table public.player_state add column if not exists errand_next text;
alter table public.player_state add column if not exists job_end jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_active_count_range') then
    alter table public.player_state add constraint player_state_active_count_range
      check (active_count is null or active_count between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_state_errand_count_range') then
    alter table public.player_state add constraint player_state_errand_count_range
      check (errand_count is null or errand_count between 1 and 100000);
  end if;
  -- src/data/hunt-after.js JOB_NEXTS ids (tests/job-counts.mjs J-DATA asserts the two lists are one)
  if not exists (select 1 from pg_constraint where conname = 'player_state_active_next_ck') then
    alter table public.player_state add constraint player_state_active_next_ck
      check (active_next is null or active_next in ('wait'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_state_errand_next_ck') then
    alter table public.player_state add constraint player_state_errand_next_ck
      check (errand_next is null or errand_next in ('wait'));
  end if;
end $mig$;
comment on column public.player_state.active_count is
  '1026-job-counts.sql: the job''s whole count as set (active_left is what is left of it); NULL with no count.';
comment on column public.player_state.active_next is
  '1026-job-counts.sql: what the hero does when the server counts the job out (src/data/hunt-after.js JOB_THENS); NULL = wait.';
comment on column public.player_state.job_end is
  '1026-job-counts.sql: the last counted job the engine ended, and how. Display only; written by hr_apply.';

-- ── §2 hr_apply: FOUR ANCHORED SPLICES (RESTATEMENT-DEBT-ACK in the header) ─────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int; v_i int;
  a_old text[]; a_new text[];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'JOB-COUNTS') > 0 then raise notice 'hr_apply already carries JOB-COUNTS: splices skipped'; return; end if;
  a_old := array[
$a$  -- BENCH-COUNT (2026-12-01-bench-count.sql): the run's count this apply writes.
  v_bench_left int;
$a$,
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
$a$,
$a$           active_left  = case when p_delta ? 'activity' or p_delta ? 'active_left'
                               then v_bench_left else active_left end,
$a$];
  a_new := array[
$a$  -- BENCH-COUNT (2026-12-01-bench-count.sql): the run's count this apply writes.
  v_bench_left int;
  -- JOB-COUNTS (1026-job-counts.sql): the statement's whole count and THEN, and the end of a job the engine counted out.
  v_job_count int; v_job_next text; v_job_end jsonb; v_job_left int;
$a$,
$a$                  where ak <> all (array['kind','id','restart','count','next'])) then$a$,
$a$    -- ── JOB-COUNTS (1026-job-counts.sql; "make N" 2026-12-01-bench-count.sql) ─────────────────
    -- `count` rides a gathering job or a bench run's statement (a whole number 1..100000), `next` (wait) only beside
    -- a count; a statement without them clears the job's count and THEN. No THEN starts a hunt (D-11: 27b). `active_left` is the engine's countdown, only on
    -- an accrual (accrued_to), of a stored gathering job or bench run that has a count: alone, a whole number at least 1
    -- and below the stored one (it can only shorten a job); BESIDE an `activity: idle` (the engine ending the job), what
    -- the job left, 0 .. the stored count, where 0 is the count reached: the job's end.
    if p_delta ? 'activity' and v_act ? 'count' then
      if coalesce(v_act->>'kind', '') not in ('artisan', 'gather') or jsonb_typeof(v_act->'count') <> 'number'
         or (v_act->>'count')::numeric <> trunc((v_act->>'count')::numeric)
         or (v_act->>'count')::numeric < 1 or (v_act->>'count')::numeric > 100000 then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'count is a whole number 1..100000 on a gathering job or a bench run'));
      end if;
      v_bench_left := (v_act->>'count')::int;
      v_job_count := v_bench_left;
    end if;
    if p_delta ? 'activity' and v_act ? 'next' then
      if not (v_act ? 'count') or jsonb_typeof(v_act->'next') <> 'string' or coalesce(v_act->>'next', '') not in ('wait') then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'next is wait, beside a count'));
      end if;
      v_job_next := v_act->>'next';
    end if;
    if p_delta ? 'active_left' then
      if not (p_delta ? 'accrued_to')
         or jsonb_typeof(p_delta->'active_left') <> 'number'
         or (p_delta->>'active_left')::numeric <> trunc((p_delta->>'active_left')::numeric)
         or coalesce(v_st.active_kind, '') not in ('artisan', 'gather') or v_st.active_left is null
         or (p_delta ? 'activity' and (v_act->>'kind' is distinct from 'idle' or v_act ? 'count'))
         or (p_delta->>'active_left')::numeric < (case when p_delta ? 'activity' then 0 else 1 end)
         or (p_delta->>'active_left')::numeric > v_st.active_left
         or (not (p_delta ? 'activity') and (p_delta->>'active_left')::numeric >= v_st.active_left) then
        perform public.hr_reject('bad_delta',
          jsonb_build_object('why', 'active_left only counts a stored job down, or says what an ending job left', 'stored', v_st.active_left));
      end if;
      if p_delta ? 'activity' then
        -- THE JOB ENDED on this accrual (its pointer goes idle, so it keeps no count). A Hearth errand is a visit, not a job:
        -- hr_town_errand gives the interrupted job back and nothing is said.
        v_job_left := (p_delta->>'active_left')::int;
        if not public.hr_hearth_errand(v_st.active_kind, v_st.active_id, v_st.active_left) then
          v_job_end := jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id,
                         'count', greatest(coalesce(v_st.active_count, v_st.active_left), v_st.active_left), 'left', v_job_left,
                         'done', greatest(coalesce(v_st.active_count, v_st.active_left), v_st.active_left) - v_job_left,
                         'next', coalesce(v_st.active_next, 'wait'),
                         'end', case when v_job_left = 0 then 'count' else 'stopped' end, 'at', now())
            || case when v_job_left > 0 then '{}'::jsonb else jsonb_build_object('next_state', 'waited') end;
        end if;
      else
        v_bench_left := (p_delta->>'active_left')::int;
      end if;
    end if;
$a$,
$a$           active_left  = case when p_delta ? 'activity' or p_delta ? 'active_left'
                               then v_bench_left else active_left end,
           -- JOB-COUNTS: every activity statement sets the job's whole count and THEN (NULL without); a job the engine ended
           -- leaves its end (hr_work_job_note keeps the three consistent with the pointer).
           active_count = case when p_delta ? 'activity' then v_job_count else active_count end,
           active_next  = case when p_delta ? 'activity' then v_job_next else active_next end,
           job_end      = coalesce(v_job_end, job_end),
$a$];
  for v_i in 1 .. array_length(a_old, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a_old[v_i], ''))) / length(a_old[v_i]);
    if v_n <> 1 then raise exception 'hr_apply: JOB-COUNTS anchor % matched % times (need 1): the body moved', v_i, v_n; end if;
    v_def := replace(v_def, a_old[v_i], a_new[v_i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; no grant moves here.
  execute v_def;
end $mig$;

-- ── §3 THE TRIGGER: A COUNT AND A THEN BELONG TO A COUNTED JOB ─────────────────────────────────────────────────────────
create or replace function public.hr_work_job_note()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- JOB-COUNTS (1026-job-counts.sql). Named to fire AFTER hr_town_errand (a table's triggers fire in name order), so the errand's
  -- word on the pointer and its errand_* columns is in NEW.
  -- (1) A HEARTH ERRAND KEEPS THE JOB'S WHOLE COUNT AND THEN, AND GIVES THEM BACK with the job (its kind, id and count left are
  --     hr_town_errand's). Any other end of the errand drops them.
  if new.errand_kind is not null and old.errand_kind is null then
    new.errand_count := old.active_count;
    new.errand_next := old.active_next;
  elsif old.errand_kind is not null and new.errand_kind is null then
    if new.active_kind = old.errand_kind and new.active_id is not distinct from old.errand_id
       and new.active_left is not distinct from old.errand_left
       and (old.active_kind is distinct from new.active_kind or old.active_id is distinct from new.active_id) then
      new.active_count := old.errand_count;
      new.active_next := old.errand_next;
    end if;
    new.errand_count := null;
    new.errand_next := null;
  end if;
  -- (2) A POINTER THAT IS NOT A COUNTED JOB CARRIES NEITHER (a hunt, training, idle, a bench on "All"). A count written without
  --     its whole (a hunt's resume, a give-back) is its own whole, and such a job ends waiting.
  if coalesce(new.active_kind, '') not in ('gather', 'artisan') or new.active_left is null then
    new.active_count := null;
    new.active_next := null;
  elsif new.active_count is null or new.active_count < new.active_left then
    new.active_count := new.active_left;
  end if;
  return new;
end $fn$;
drop trigger if exists hr_work_job_note on public.player_state;
create trigger hr_work_job_note before update of active_kind, active_id, active_left, active_count, active_next
  on public.player_state for each row execute function public.hr_work_job_note();

-- ── §4 THE BY-KIND RULES GAIN A GATHERING ARM (2027-04-24-bench-resume.sql's images) ────────────────────────────────────
create or replace function public.hr_activity_left(p_user uuid, p_slot integer, p_kind text, p_id text, p_left integer)
returns integer language sql stable set search_path = public, pg_catalog as $fn$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): THE BY-KIND RULE AT ENTER. What a running job of this kind still has to make,
  -- as the count its resume may run for; NULL = this kind has no count, or nothing is left. A bench: the smaller of its own
  -- count (`p_left`, player_state.active_left; none on "All") and what its stock can make now, held to active_left's range
  -- (player_state_active_left_range, 100000). A new kind adds its arm here.
  -- JOB-COUNTS (1026-job-counts.sql): a gathering job spends nothing, so its count left is its own.
  select case when p_kind = 'artisan' then
    (select case when x.n >= 1 then x.n::int end
       from (select least(coalesce(p_left, 100000)::bigint,
                          coalesce(public.hr_bench_makes(p_user, p_slot, p_id), 100000)) as n) x)
    when p_kind = 'gather' then case when p_left >= 1 then least(p_left, 100000) end
  end
$fn$;

create or replace function public.hr_resume_plan(p_user uuid, p_slot integer, p_kind text, p_id text, p_left integer)
returns jsonb language sql stable set search_path = public, pg_catalog as $fn$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): THE BY-KIND RULE AT THE HUNT'S END, given the count remembered at Enter
  -- (player_state.last_activity_left). { ok, left?, why? }. A bench resumes only for that count, and only while one action's
  -- inputs are still held. A new kind adds its arm here.
  -- JOB-COUNTS (1026-job-counts.sql): a gathering job resumes only for the count it still had (none: it was done, or it is a
  -- job from before counts, the 6,001-ore path); anything else that spends nothing resumes as it always did.
  select case
    when p_kind = 'gather' and p_left is null then jsonb_build_object('ok', false, 'why', 'no_count')
    when p_kind = 'gather' then jsonb_build_object('ok', true, 'left', p_left)
    when p_kind is distinct from 'artisan' then jsonb_build_object('ok', true)
    when p_left is null then jsonb_build_object('ok', false, 'why', 'no_count')
    when not public.hr_resume_has_inputs(p_user, p_slot, p_kind, p_id) then jsonb_build_object('ok', false, 'why', 'dry')
    else jsonb_build_object('ok', true, 'left', p_left)
  end
$fn$;

-- ── §5 THE ENVELOPE SECTION (the plan-cache image of 2027-02-10-settle-plan-cache.generated.sql + three keys) ────────────
create or replace function public.hr_bench_run_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- JOB-COUNTS (1026-job-counts.sql): the hero's job as the server holds it. `left`: its count left (a gathering job's swings
  -- or a bench run's actions; the engine reads it as activeLeft, envelope.js); `count`: the whole; `next`: wait (null:
  -- wait); `ended`: the last counted job the engine ended and how (player_state.job_end). The key keeps the
  -- bench's name from before gathering took a count.
  select jsonb_build_object('left', ps.active_left, 'count', ps.active_count, 'next', ps.active_next, 'ended', ps.job_end)
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
  ) as hr_q(v) limit 1);
end
$fn$;

-- ── §6 (WITHDRAWN 2026-11-22: the THEN of hunt, its sweep and its cron job; D-11 section 3.4) ──────────────────────────────

-- ── §7 GRANTS: nothing here is client-callable ────────────────────────────────────────────────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_work_job_note()', 'public.hr_activity_left(uuid,integer,text,text,integer)',
                               'public.hr_resume_plan(uuid,integer,text,text,integer)', 'public.hr_bench_run_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────────────────────────────────────────────────
-- Through the real hr_apply: a gathering count is stored, forged counts and THENs (a THEN of hunt among them) are refused and
-- move nothing, the count only counts down, the count reached ends the job and the hero waits (a replay moves nothing), a stop
-- before the count is not the count reached, an errand gives the job its count and THEN back, no sweep or cron job exists, and a
-- gathering job resumes after a hunt only with a count. (The engine half, a job of 20 stops at 20 on the owner's door and the
-- world tick, is tests/job-counts.mjs on this chain.)
do $$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-00001009a001';
  k constant text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_d jsonb; v_ver bigint; v_node text; v_st public.player_state%rowtype; v_i int := 0; v_rows int;
  v_fuel text;
begin
  if (select count(*) from pg_constraint where conname in ('player_state_active_count_range', 'player_state_active_next_ck',
        'player_state_errand_count_range', 'player_state_errand_next_ck')) <> 4 then
    raise exception 'job-counts §8(0): a CHECK is missing'; end if;
  if strpos(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), 'JOB-COUNTS') = 0 then
    raise exception 'job-counts §8(0): hr_apply carries no JOB-COUNTS splice'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_work_job_note' and tgrelid = 'public.player_state'::regclass)
     or 'hr_work_job_note' <= 'hr_town_errand' then
    raise exception 'job-counts §8(0): the trigger is missing or would fire before hr_town_errand'; end if;
  if to_regprocedure('public.hr_job_next_start(uuid,integer)') is not null or to_regprocedure('public.hr_job_next_sweep(integer)') is not null
     or (to_regclass('cron.job') is not null and exists (select 1 from cron.job where jobname = 'hr-job-next')) then
    raise exception 'job-counts §8(0): the withdrawn THEN-of-hunt sweep still exists'; end if;
  if exists (select 1 from unnest(array['public.hr_work_job_note()']) s(sig)
             cross join unnest(array['anon', 'authenticated', 'public']) g(role)
             where has_function_privilege(case when g.role = 'public' then 'anon' else g.role end, s.sig::regprocedure, 'execute')) then
    raise exception 'job-counts §8(0): a new function is client-executable'; end if;
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'job-counts §8 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'job-counts §8-harness: hr_create_character refused: %', v; end if;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1
     order by a.activity_id limit 1;
    select a.activity_id into v_fuel from public.hr_activities a where a.kind = 'artisan' and a.req_skill = 'inner_flame'
       and coalesce(a.req_lv, 1) <= 1 and a.activity_id = 'fuel_bones';
    if v_node is null or v_fuel is null then raise exception 'job-counts §8-harness: no level-1 node (%) or fuel_bones (%)', v_node, v_fuel; end if;

    -- (a) a gathering job of 5, then wait: stored, and the envelope says it.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a101')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 5, 'next', 'wait'),
                         'journal', jsonb_build_object('kind', 'admin', 'intent', 'set_activity:gather:' || v_node)));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'job-counts §8(a): a gathering job of 5 was refused: %', v; end if;
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v_st.active_left is distinct from 5 or v_st.active_count is distinct from 5 or v_st.active_next is distinct from 'wait' then
      raise exception 'job-counts §8(a): stored left %, count %, then %', v_st.active_left, v_st.active_count, v_st.active_next; end if;
    v := public.hr_state_of(c_u, 0)->'bench_run';
    if (v->>'left')::int is distinct from 5 or (v->>'count')::int is distinct from 5 or v->>'next' is distinct from 'wait' then
      raise exception 'job-counts §8(a): the envelope says %', v; end if;

    -- (b) FORGED: a count off a job or out of range, a THEN with no count or no such THEN (hunt among them): bad_activity, nothing moves.
    for v_d in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 0)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 2.5)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 100001)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', '3')),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'next', 'wait')),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 3, 'next', 'hunt')),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 3, 'next', 'nap')),
        jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 3, 'next', 1)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'idle', 'id', null, 'count', 3)),
        jsonb_build_object('activity', jsonb_build_object('kind', 'idle', 'id', null, 'next', 'wait')))) as t(x) loop
      select version into v_ver from public.player_state where user_id = c_u and slot = 0;
      v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), v_d);
      if v->>'error' is distinct from 'bad_activity' then
        raise exception 'job-counts §8(b): a forged statement answered % (want bad_activity): %', v, v_d; end if;
    end loop;
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v_st.active_left is distinct from 5 or v_st.active_count is distinct from 5 or v_st.active_next is distinct from 'wait'
       or v_st.active_kind <> 'gather' then
      raise exception 'job-counts §8(b): a refused statement moved the job: % % % %', v_st.active_kind, v_st.active_left, v_st.active_count, v_st.active_next; end if;

    -- (c) THE COUNTDOWN 5 -> 3 on an accrual; its replay moves nothing; never up, never level, never to 0 without the end,
    --     never beside a statement that is not the end, never past the stored count at the end.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v_d := jsonb_build_object('accrued_to', now(), 'active_left', 3, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue'));
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a103')::uuid, v_d);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'job-counts §8(c): the countdown 5 -> 3 was refused: %', v; end if;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    perform public.hr_apply(c_u, 0, v_ver, (k || '1009a103')::uuid, v_d);
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v_st.version <> v_ver or v_st.active_left is distinct from 3 or v_st.active_count is distinct from 5 then
      raise exception 'job-counts §8(c): countdown % / count % / a replay wrote (% -> %)', v_st.active_left, v_st.active_count, v_ver, v_st.version; end if;
    for v_d in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('accrued_to', now(), 'active_left', 4),
        jsonb_build_object('accrued_to', now(), 'active_left', 3),
        jsonb_build_object('accrued_to', now(), 'active_left', 0),
        jsonb_build_object('active_left', 2),
        jsonb_build_object('accrued_to', now(), 'active_left', 4, 'activity', jsonb_build_object('kind', 'idle', 'id', null)),
        jsonb_build_object('accrued_to', now(), 'active_left', -1, 'activity', jsonb_build_object('kind', 'idle', 'id', null)),
        jsonb_build_object('accrued_to', now(), 'active_left', 0,
          'activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 5)))) as t(x) loop
      select version into v_ver from public.player_state where user_id = c_u and slot = 0;
      v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), v_d);
      if v->>'error' is distinct from 'bad_delta' then
        raise exception 'job-counts §8(c): an illegal count answered % (want bad_delta): %', v, v_d; end if;
    end loop;
    if (select active_left from public.player_state where user_id = c_u and slot = 0) is distinct from 3 then
      raise exception 'job-counts §8(c): an illegal count moved active_left'; end if;

    -- (d) THE COUNT REACHED: the engine's end (idle + 0 left) idles the hero, clears the count, and the end says count, done
    --     5 of 5, waited; its replay moves nothing.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v_d := jsonb_build_object('accrued_to', now(), 'active_left', 0, 'activity', jsonb_build_object('kind', 'idle', 'id', null),
                              'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue'));
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a104')::uuid, v_d);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'job-counts §8(d): the count reached was refused: %', v; end if;
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v_st.active_kind <> 'idle' or v_st.active_left is not null or v_st.active_count is not null or v_st.active_next is not null
       or v_st.job_end->>'end' is distinct from 'count' or (v_st.job_end->>'done')::int is distinct from 5
       or (v_st.job_end->>'count')::int is distinct from 5 or v_st.job_end->>'next_state' is distinct from 'waited'
       or v_st.job_end->>'next' is distinct from 'wait'
       or v_st.job_end->>'kind' is distinct from 'gather' or v_st.job_end->>'id' is distinct from v_node then
      raise exception 'job-counts §8(d): after the count: % % % % end %', v_st.active_kind, v_st.active_left, v_st.active_count, v_st.active_next, v_st.job_end; end if;
    v_ver := v_st.version;
    perform public.hr_apply(c_u, 0, v_ver, (k || '1009a104')::uuid, v_d);
    if (select version from public.player_state where user_id = c_u and slot = 0) <> v_ver then
      raise exception 'job-counts §8(d): a replayed end wrote the row again'; end if;

    -- (f) A STOP BEFORE THE COUNT (the bag or the level ended it, 2 of 5 left) is not the count reached: no THEN.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    perform public.hr_apply(c_u, 0, v_ver, (k || '1009a106')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 5, 'next', 'wait')));
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a107')::uuid,
      jsonb_build_object('accrued_to', now(), 'active_left', 2, 'activity', jsonb_build_object('kind', 'idle', 'id', null)));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_st.job_end->>'end' is distinct from 'stopped' or (v_st.job_end->>'done')::int is distinct from 3
       or v_st.job_end ? 'next_state' then
      raise exception 'job-counts §8(f): a stop before the count came to % (%)', v_st.job_end, v; end if;

    -- (g) A HEARTH ERRAND keeps the job's whole count and THEN and gives them back with the job; its own end says nothing.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, 'bones', 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    perform public.hr_apply(c_u, 0, v_ver, (k || '1009a108')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 9, 'next', 'wait')));
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a109')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'artisan', 'id', v_fuel, 'restart', true, 'count', 1)));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_st.errand_kind is distinct from 'gather' or v_st.errand_count is distinct from 9
       or v_st.errand_next is distinct from 'wait' or v_st.active_count is distinct from 1 or v_st.active_next is not null then
      raise exception 'job-counts §8(g): the errand kept % % % (pointer % count % then %; %)', v_st.errand_kind, v_st.errand_count,
        v_st.errand_next, v_st.active_id, v_st.active_count, v_st.active_next, v; end if;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '1009a10a')::uuid,
      jsonb_build_object('accrued_to', now(), 'active_left', 0, 'activity', jsonb_build_object('kind', 'idle', 'id', null),
                         'journal', jsonb_build_object('kind', 'craft', 'intent', 'accrue')));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_st.active_kind <> 'gather' or v_st.active_left is distinct from 9
       or v_st.active_count is distinct from 9 or v_st.active_next is distinct from 'wait' or v_st.errand_kind is not null
       or v_st.errand_count is not null or v_st.job_end->>'end' is distinct from 'stopped' then
      raise exception 'job-counts §8(g): the give-back came to % % left % count % then % (end %; %)', v_st.active_kind, v_st.active_id,
        v_st.active_left, v_st.active_count, v_st.active_next, v_st.job_end, v; end if;

    -- (h) THE BY-KIND RULES: a gathering job's count left is its own and it resumes only with one.
    if public.hr_activity_left(c_u, 0, 'gather', v_node, 7) is distinct from 7 or public.hr_activity_left(c_u, 0, 'gather', v_node, null) is not null
       or public.hr_resume_plan(c_u, 0, 'gather', v_node, null) <> jsonb_build_object('ok', false, 'why', 'no_count')
       or public.hr_resume_plan(c_u, 0, 'gather', v_node, 7) <> jsonb_build_object('ok', true, 'left', 7) then
      raise exception 'job-counts §8(h): the gathering arm is wrong'; end if;

    -- (i) A STATEMENT WITHOUT A COUNT clears the count and THEN (the bench's "All").
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    perform public.hr_apply(c_u, 0, v_ver, (k || '1009a10b')::uuid,
      jsonb_build_object('activity', jsonb_build_object('kind', 'idle', 'id', null)));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v_st.active_left is not null or v_st.active_count is not null or v_st.active_next is not null then
      raise exception 'job-counts §8(i): idle kept % % %', v_st.active_left, v_st.active_count, v_st.active_next; end if;
    raise exception using errcode = 'HR109', message = 'job-counts §8 complete - rolling back';
  exception when sqlstate 'HR109' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) then raise exception 'job-counts §8: LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'job-counts: a gathering count is stored and only counts down, forged counts and THENs (hunt among them) move nothing, the count reached ends the job and the hero waits, no sweep exists, an errand gives the count back; all green';
end $$;
