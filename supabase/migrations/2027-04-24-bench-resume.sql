-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-24-bench-resume.sql — A HUNT'S END PICKS THE BENCH BACK UP, FOR THE COUNT IT STILL HAD TO MAKE WHEN THE HUNT STARTED
-- (Tyler 2026-11-15, "Yes, resume them": SUPERSEDES his 2026-10-31 "gathering job continues - bench jobs dont";
--  lane/c-bench-resume, backend-architect). STAGED: tools/apply-migration.mjs, one file, never inside begin/commit, never
--  00:00-00:10 UTC. Pre-EA: applies on its passing §6. ON THE EA SECURITY LIST: it decides when a bench spends a hero's stock.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
-- After an AUTOMATIC end (hr_hunt_end_reasons.resumes: every reason but the player's own `left` and `changed`, as for
-- gathering since 2026-10-14) the hero walks home and goes back to the job the hunt stopped:
--   gathering   as before, unchanged: it spends nothing and has no count.
--   a bench     NEW: only a job that was RUNNING when the hunt started, and only for THE COUNT IT STILL HAD TO MAKE THEN:
--                 left at Enter = the smaller of (the run's own count, "Make N"; none on "All")
--                                 and (how many actions the hero's bag plus the account's Storage held inputs for at Enter)
--               So nothing the hunt looted, and nothing bought during it, is ever spent by the resume: "All" pressed on 15
--               Bones before an 11 h hunt resumes for those 15, not for the hunt's 1,954 (the panel's burn, 2026-11-01).
--               Nothing left at Enter (dry, finished, stopped): the bench does not start. Inputs gone by the end: it does not
--               start. A bench that was not running at Enter is not started, however full the bag is.
--   training    reserved, as before (no hr_activities row: `gone`). §"HOW TRAINING SLOTS IN" below.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- player_state.last_activity_left int NULL (1..100000, active_left's own range): the count the remembered job still had to make
--   when the hero's hunt started. WRITTEN ONLY by the trigger hr_last_activity_note, on the pointer's move from town onto a
--   hunt (non-`combat` -> `combat`): the count of the job that move stops, by its kind (hr_activity_left), else NULL. A change of
--   ground mid-hunt (`combat` -> `combat`) keeps it: it is the job the hunt's START stopped. READ ONLY by hr_hunt_resume, at that
--   hunt's end. No client reads or writes it; it is in no envelope section.
-- hr_bench_makes(user, slot, bench) -> bigint     NEW, owner-only, stable. Actions the bag + Storage hold inputs for, now
--   (hr_bench_inputs(), the generated catalogue; the supply hr_apply takes from, SKILLS-FROM-STORAGE). NULL: the bench consumes nothing.
-- hr_activity_left(user, slot, kind, id, left) -> int   NEW, owner-only, stable. THE BY-KIND RULE AT ENTER: what a running job
--   still has to make. `artisan`: least(its count or the ceiling, hr_bench_makes or the ceiling), NULL under 1. Any other kind: NULL.
-- hr_resume_plan(user, slot, kind, id, left) -> jsonb   NEW, owner-only, stable. THE BY-KIND RULE AT THE END:
--   { ok, left?, why? }. `artisan`: no count -> no_count; one action's inputs short -> dry; else ok with the count. Other kinds: ok.
-- hr_resume_has_inputs(user, slot, kind, id) -> boolean  RESTATED (2027-02-15-panel-truth.sql answered false for every bench): one
--   action's inputs in bag + Storage, on hr_bench_makes. Its name is true again.
-- hr_last_activity_note()  RESTATED WHOLE (2026-10-22-hunt-sessions-settle.sql's image + the Enter capture).
-- hr_hunt_resume(user, slot, session, end_reason, events_from) -> void   NEW, owner-only. hr_hunt_apply_member's step (7), whole,
--   moved out of the settle body: the end reason's `resumes` row, the walk home, the catalogue and level checks (verbatim), then the
--   kind's plan. Resumed: the pointer, active_since = accrued_to = home, active_left = the plan's count (NULL for a kind with
--   none, as any activity statement without a count leaves it: hr_apply BENCH-COUNT), the return anchor. Always: ONE ledger row
--   (kind hunt, intent resume; meta as before {reason, resumed, kind, id, at} + `left` when a count was restored + `why` when
--   nothing was resumed: none | gone | level | no_count | dry) and the `ended` event's `resume` ({kind, id, at} + `left`; null).
-- hr_hunt_apply_member   ONE ANCHORED EDIT: step (7)'s 31 lines become one call of hr_hunt_resume. Not restated: lane/c-tower-mode's
--   2027-04-23-session-modes.sql restates this body whole from the same image and leaves step (7) verbatim, so the two files
--   commute as long as that one applies first (ORDER below); a second whole restate here would have made one of the two re-base.
--   Chain depth 0 -> 1 (tests/patch-chain-guard.mjs; the rule bites at 2). Its locals v_end, v_lk, v_li, v_home, v_ok stay
--   declared and unused until the next whole restate.
--
-- ERROR TAXONOMY: none new. Nothing here is client-callable and nothing refuses: a resume that does not happen leaves the hero
-- idle in town and says why in the ledger row.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────
-- Enter and the settle both hold the character's lock (hr_hunt_lock, hr_apply's key), and so does every other pointer writer, so
-- the count, the pointer and the capture cannot interleave. The Storage half of hr_bench_makes is read unlocked (another hero of
-- the account may be moving Storage): the capture is an upper bound as of Enter, and the engine still stops on an empty supply.
-- A replayed settle key returns before step (7) (hr_apply `replayed`), so a resume runs once per landed end: it can never
-- restore a count the bench has since counted down. No roll, no clock but the session's own ended_at: replayable from the rows.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No new client verb, grant, policy or delta key. The resume moves no gold, item or XP: it points the hero at a job the
-- audited artisan path then runs (hr_apply: inputs from bag then Storage, the bench tax, the count that only counts down). The
-- count restored is never above the one the player pressed nor above the stock held when the hunt started. A player cannot
-- raise it: last_activity_left has no writer but the trigger, and active_left no client writer but a `count` statement.
--
-- ── HOW TRAINING SLOTS IN (lane/c-training-gear; not built here) ─────────────
-- A training session is a hunt session on a training ground (2027-04-16-combat-training.sql), not an activity pointer. To
-- resume one, that lane adds an arm to the two by-kind bodies and nothing to the settle: hr_activity_left (what to remember
-- when a real hunt starts from a training session) and hr_resume_plan / hr_hunt_resume (open the session again). OPEN, Tyler's
-- or the designer's: the yard charges gold by the hour, and a resume that buys an hour unasked meets "never automatic
-- purchases" (Tyler 2026-10-18); the house dummy is free.
--
-- ── ROWS AND BYTES ──────────────────────────────────────────────────────────
-- One int on player_state (NULL for nearly every row). No new table, index or ledger row: the `resume` row already existed, one
-- per automatic end, and gains at most two short keys. Per Enter: one trigger branch, and for a hero leaving a running bench
-- two primary-key reads per input (bag, Storage). Per automatic end: the same reads once. Nothing per tick.
--
-- EDGE: none in code (the engine already reads player_state.active_left as bench_run.left and counts it down, accrual.js
-- accrueArtisan). The hr-accrue bundle moves by a comment in src/data/hunt-sessions.js only. CLIENT: words only
-- (src/data/how-to-play.js, src/data/text/away.js); "Then {name} went back to working on X" already reads the pointer.
-- A hunt open across the apply was entered before the capture existed: its bench is not resumed, as before this file.
-- REVERSIBILITY: re-apply hr_resume_has_inputs from 2027-02-15-panel-truth.sql and hr_last_activity_note from
-- 2026-10-22-hunt-sessions-settle.sql, reverse §4's replace (hr_hunt_resume holds the old step verbatim), drop the four new
-- functions; the column is inert. No row of any character needs repair.
-- ORDER: after EVERY file that restates hr_hunt_apply_member whole: 2027-04-16-combat-training.sql today, and
-- 2027-04-23-session-modes.sql once lane/c-tower-mode lands (its §0 pins combat-training's image, so it must run BEFORE this
-- file; this file's anchor matches either image). After apply: live-hash-drift wants hr_hunt_apply_member,
-- hr_resume_has_inputs and hr_last_activity_note re-measured and the four new bodies tracked (Coordinator).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS: FAIL CLOSED IF ANOTHER FILE MOVED A RESTATED BODY ─────────────────────────────────────────
-- md5 of pg_get_functiondef with whitespace runs as one: tests/live-hash-drift.baseline.json's own normalisation, so each
-- pre-image below is the value MEASURED ON PRODUCTION (2026-11-15, equal to the replay's), or this file's own (a second apply).
do $mig$
declare v_md5 text; r record;
begin
  if to_regprocedure('public.hr_bench_inputs()') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null
     or to_regclass('public.hr_hunt_resumable_kinds') is null or to_regclass('public.hr_hunt_end_reasons') is null
     or to_regclass('public.hr_hunt_travel') is null or to_regclass('public.hr_return_anchor') is null
     or to_regclass('public.hr_activities') is null or to_regclass('public.account_bank') is null
     or not exists (select 1 from pg_constraint where conname = 'player_state_active_left_range'
                     and conrelid = 'public.player_state'::regclass) then
    raise exception 'PRECONDITION: a table, helper or column this file builds on is missing (2026-12-01-bench-count.sql, 2027-01-24-skills-from-storage.sql)'; end if;
  for r in select * from (values
    ('public.hr_resume_has_inputs(uuid,integer,text,text)', '5b1886334c5669f1395b9f8c08128895', '44e151312349ce9b7543b418e90e21d9', '2027-02-15-panel-truth.sql'),
    ('public.hr_last_activity_note()', '7486863c27623617ddb85abf5a048338', 'c613f3e203cdb279f1b5830db8c32f84', '2026-10-22-hunt-sessions-settle.sql')
  ) p(sig, pre, post, src) loop
    if to_regprocedure(r.sig) is null then raise exception 'PIN: % is missing', r.sig; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(to_regprocedure(r.sig)), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN ────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists last_activity_left int;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_last_activity_left_range'
                  and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_last_activity_left_range
      check (last_activity_left is null or last_activity_left between 1 and 100000);
  end if;
end $mig$;
comment on column public.player_state.last_activity_left is
  '2027-04-24-bench-resume.sql: the count the remembered job (last_activity_kind / _id) still had to make when the hero''s hunt started; written only by hr_last_activity_note on the move onto a hunt, read only by hr_hunt_resume at that hunt''s end. NULL = no count (gathering), nothing left, or no job was running.';

-- ── §2 THE BY-KIND RULES ─────────────────────────────────────────────────────
create or replace function public.hr_bench_makes(p_user uuid, p_slot int, p_bench text)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): how many actions of this bench the hero's bag plus the account's Storage hold
  -- inputs for, now: the supply hr_apply takes a bench's inputs from (SKILLS-FROM-STORAGE), over the generated catalogue's one
  -- action (hr_bench_inputs()). NULL when the bench consumes nothing: no stock bounds it.
  select min((coalesce((select v.qty from public.player_inventory v
                         where v.user_id = p_user and v.slot = p_slot and v.item_id = i.key), 0)
              + coalesce((select b.qty from public.account_bank b
                           where b.user_id = p_user and b.item_id = i.key), 0))
             / (i.value #>> '{}')::bigint)
    from jsonb_each(coalesce(public.hr_bench_inputs() -> p_bench, '{}'::jsonb)) i
   where (i.value #>> '{}')::bigint > 0
$$;

create or replace function public.hr_activity_left(p_user uuid, p_slot int, p_kind text, p_id text, p_left int)
returns int language sql stable set search_path = public, pg_catalog as $$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): THE BY-KIND RULE AT ENTER. What a running job of this kind still has to make,
  -- as the count its resume may run for; NULL = this kind has no count, or nothing is left. A bench: the smaller of its own
  -- count (`p_left`, player_state.active_left; none on "All") and what its stock can make now, held to active_left's range
  -- (player_state_active_left_range, 100000). Gathering spends nothing and has no count. A new kind adds its arm here.
  select case when p_kind = 'artisan' then
    (select case when x.n >= 1 then x.n::int end
       from (select least(coalesce(p_left, 100000)::bigint,
                          coalesce(public.hr_bench_makes(p_user, p_slot, p_id), 100000)) as n) x)
  end
$$;

create or replace function public.hr_resume_has_inputs(p_user uuid, p_slot integer, p_kind text, p_id text)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql; Tyler 2026-11-15): the name is true again (2027-02-15-panel-truth.sql answered
  -- false for every bench). One action's inputs held in the hero's bag plus the account's Storage (hr_bench_makes). True for
  -- every kind but a bench, and for a bench that consumes nothing.
  select p_kind is distinct from 'artisan' or coalesce(public.hr_bench_makes(p_user, p_slot, p_id), 1) >= 1
$$;

create or replace function public.hr_resume_plan(p_user uuid, p_slot int, p_kind text, p_id text, p_left int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): THE BY-KIND RULE AT THE HUNT'S END, given the count remembered at Enter
  -- (player_state.last_activity_left). { ok, left?, why? }. A bench resumes only for that count, and only while one action's
  -- inputs are still held; anything that spends nothing resumes as it always did. A new kind adds its arm here.
  select case
    when p_kind is distinct from 'artisan' then jsonb_build_object('ok', true)
    when p_left is null then jsonb_build_object('ok', false, 'why', 'no_count')
    when not public.hr_resume_has_inputs(p_user, p_slot, p_kind, p_id) then jsonb_build_object('ok', false, 'why', 'dry')
    else jsonb_build_object('ok', true, 'left', p_left)
  end
$$;

-- ── §3 ENTER REMEMBERS THE COUNT; THE END RESTORES IT ────────────────────────
-- THE LAST NON-HUNT ACTIVITY (Tyler 2026-10-14), restated whole: 2026-10-22-hunt-sessions-settle.sql's body, then the capture.
create or replace function public.hr_last_activity_note()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (new.active_kind is distinct from old.active_kind or new.active_id is distinct from old.active_id)
     and new.active_id is not null and new.active_id ~ '^[a-z0-9_]{1,64}$'
     and exists (select 1 from public.hr_hunt_resumable_kinds k where k.kind = new.active_kind) then
    new.last_activity_kind := new.active_kind;
    new.last_activity_id := new.active_id;
  end if;
  -- BENCH-RESUME (2027-04-24-bench-resume.sql; Tyler 2026-11-15): THE HUNT'S START REMEMBERS WHAT THE JOB IT STOPS STILL HAD
  -- TO MAKE. The pointer moves from town onto a hunt (whichever writer made it): the count of the remembered job, if that is
  -- the one running, by its kind (hr_activity_left); else NULL, so a job that had ended or been stopped is never picked up.
  -- A change of ground (`combat` to `combat`) keeps what the hunt's start wrote.
  if new.active_kind = 'combat' and old.active_kind is distinct from 'combat' then
    new.last_activity_left := case
      when old.active_id is not null and old.active_kind = new.last_activity_kind and old.active_id = new.last_activity_id
      then public.hr_activity_left(old.user_id, old.slot, old.active_kind, old.active_id, old.active_left) end;
  end if;
  return new;
end $$;

-- hr_hunt_apply_member's step (7), whole. Every line of the old step is here verbatim but the three marked BENCH-RESUME.
create or replace function public.hr_hunt_resume(p_user uuid, p_slot int, p_session uuid, p_end text, p_ev0 bigint)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare
  v_lk text; v_li text; v_ll int; v_home timestamptz; v_ok boolean; v_plan jsonb; v_left int; v_why text;
begin
  -- AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  if p_end is null or not coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = p_end), false) then
    return; end if;
  select ps.last_activity_kind, ps.last_activity_id, ps.last_activity_left into v_lk, v_li, v_ll
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
    into v_home from public.hunt_sessions h where h.id = p_session;
  if v_lk is null or v_home is null then v_why := 'none';
  elsif not exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li) then v_why := 'gone';
  elsif exists (select 1 from public.hr_activities a
                 where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                   and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                  where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv) then
    v_why := 'level';
  else
    -- BENCH-RESUME: the kind's own rule (a bench: the count left at Enter, while one action's inputs are held).
    v_plan := public.hr_resume_plan(p_user, p_slot, v_lk, v_li, v_ll);
    if coalesce(v_plan->>'ok', 'false') <> 'true' then v_why := coalesce(v_plan->>'why', 'refused');
    else v_left := (v_plan->>'left')::int; end if;
  end if;
  v_ok := v_why is null;
  if v_ok then
    update public.player_state
       set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
           -- BENCH-RESUME: the run's count, or none (as any activity statement without a count leaves it: hr_apply BENCH-COUNT).
           active_left = v_left,
           fight = '{}'::jsonb, version = version + 1, updated_at = now()
     where user_id = p_user and slot = p_slot;
    insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
      values (p_user, p_slot, v_home, now())
      on conflict (user_id, slot) do update
        set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
  end if;
  -- BENCH-RESUME: the row says the count it restored, and why nothing was resumed.
  insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
    values (p_user, p_slot, 'hunt', 'resume',
            jsonb_build_object('reason', p_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home)
              || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end
              || case when v_why is not null then jsonb_build_object('why', v_why) else '{}'::jsonb end, p_session);
  update public.hunt_session_events e
     set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home)
                            || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end else null end)
   where e.session_id = p_session and e.id > p_ev0 and e.type = 'ended';
end $$;

-- ── §4 THE SETTLE CALLS IT: ONE ANCHORED EDIT OF hr_hunt_apply_member ────────
-- The anchor is step (7) as 2027-04-16-combat-training.sql restated it (and as 2027-04-23-session-modes.sql carries it). It must
-- match EXACTLY once or the block raises. A body that already carries the marker is this file's post-image: skipped.
do $mig$
declare
  v_def text; v_n int;
  v_old constant text := $a$  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
$a$;
  v_new constant text := $a$  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home), by the job's kind: hr_hunt_resume
  --     (BENCH-RESUME, 2027-04-24-bench-resume.sql). The locals v_end, v_lk, v_li, v_home and v_ok were this step's inline form's.
  perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>'ended', v_ev0);
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'BENCH-RESUME') > 0 then
    raise notice 'bench-resume §4: hr_hunt_apply_member already calls hr_hunt_resume - edit skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'bench-resume §4: hr_hunt_apply_member''s step (7) matched % times (need 1): another file moved the step; fold its change into hr_hunt_resume', v_n;
  end if;
  -- CREATE OR REPLACE keeps the function's grants; no grant moves here.
  execute replace(v_def, v_old, v_new);
end $mig$;

-- ── §5 GRANTS: the server's alone (revoke before nothing is granted) ─────────
revoke all on function public.hr_bench_makes(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_activity_left(uuid, integer, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_resume_plan(uuid, integer, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.hr_last_activity_note() from public, anon, authenticated, service_role;
revoke all on function public.hr_hunt_resume(uuid, integer, uuid, text, bigint) from public, anon, authenticated, service_role;
do $$
declare v_role text; v_fn text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_fn in array array['hr_bench_makes(uuid, integer, text)', 'hr_activity_left(uuid, integer, text, text, integer)',
                                  'hr_resume_has_inputs(uuid, integer, text, text)', 'hr_resume_plan(uuid, integer, text, text, integer)',
                                  'hr_last_activity_note()', 'hr_hunt_resume(uuid, integer, uuid, text, bigint)'] loop
        execute format('revoke all on function public.%s from %I', v_fn, v_role);
      end loop;
    end if;
  end loop;
end $$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
-- Fails on the pre-images: (b) no body counts what a bench's stock makes; (c) Enter remembers no count; (d) a stocked bench
-- running at Enter does not resume (panel-truth), and before it a resumed bench had no count. The settle's own call, on both
-- doors (the browser closed, the hunt viewed), and the engine spending exactly the count are tests/hunt-sessions-settle.mjs RESUME.
do $chk$
declare
  c_u    constant uuid := '000000c0-0000-4000-a000-0000be7c0424';
  k      constant text := '000000c0-0000-4000-b000-be7c0424';
  c_hunt constant text := 'mill_cellar';
  c_am   constant regprocedure := 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  v jsonb; v_s text; v_role text; v_src text; v_n int; v_i int := 0;
  v_bench text; v_in text; v_need bigint; v_node text; v_sid uuid; v_st record; v_meta jsonb;
  r record;
begin
  -- (a) THE SHAPE: no client or engine role runs a body of this file; each keeps a pinned search_path; the column is ranged
  --     like active_left; the trigger still stands on the pointer; the settle calls the resume once and writes no pointer itself.
  foreach v_s in array array['public.hr_bench_makes(uuid,integer,text)', 'public.hr_activity_left(uuid,integer,text,text,integer)',
                             'public.hr_resume_has_inputs(uuid,integer,text,text)', 'public.hr_resume_plan(uuid,integer,text,text,integer)',
                             'public.hr_last_activity_note()', 'public.hr_hunt_resume(uuid,integer,uuid,text,bigint)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) and has_function_privilege(v_role, v_s, 'execute') then
        raise exception 'bench-resume §6(a): % can execute %', v_role, v_s; end if;
    end loop;
    if not exists (select 1 from pg_proc p where p.oid = v_s::regprocedure and p.proconfig @> array['search_path=public, pg_catalog']) then
      raise exception 'bench-resume §6(a): % has no pinned search_path', v_s; end if;
  end loop;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'player_state_last_activity_left_range' and c.conrelid = 'public.player_state'::regclass)
     is distinct from replace((select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'player_state_active_left_range' and c.conrelid = 'public.player_state'::regclass),
                              'active_left', 'last_activity_left') then
    raise exception 'bench-resume §6(a): last_activity_left is not ranged as active_left is'; end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.player_state'::regclass and t.tgname = 'hr_last_activity_note'
                  and t.tgenabled = 'O' and t.tgfoid = 'public.hr_last_activity_note()'::regprocedure) then
    raise exception 'bench-resume §6(a): the trigger hr_last_activity_note is not on player_state'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = c_am;
  v_s := 'perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>''ended'', v_ev0);';
  if (length(v_src) - length(replace(v_src, v_s, ''))) / length(v_s) <> 1 then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member does not call hr_hunt_resume exactly once'; end if;
  if strpos(v_src, 'set active_kind = v_lk') > 0 or strpos(v_src, 'hr_resume_has_inputs') > 0 then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member still resumes inline'; end if;
  if strpos(v_src, 'perform public.hr_hunt_resume') < strpos(v_src, 'v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);')
     or strpos(v_src, 'perform public.hr_hunt_resume') < strpos(v_src, 'return jsonb_build_object(''ok'', true, ''replayed'', true);') then
    raise exception 'bench-resume §6(a): the resume runs before the value half or before a replayed key returns'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- THE PROBE: one hero, a level-1 bench with one input, a level-1 gathering node.
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'bench-resume §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'bench-resume §6-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    select b.key, i.key, (i.value #>> '{}')::bigint into v_bench, v_in, v_need
      from jsonb_each(public.hr_bench_inputs()) b cross join lateral jsonb_each(b.value) i
     where (select count(*) from jsonb_object_keys(b.value)) = 1
       and exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key and coalesce(a.req_lv, 1) <= 1)
     order by b.key limit 1;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1 order by a.activity_id limit 1;
    if v_bench is null or v_node is null then raise exception 'bench-resume §6-harness: no level-1 one-input bench (%) or gathering node (%)', v_bench, v_node; end if;
    delete from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_in;
    delete from public.account_bank where user_id = c_u and item_id = v_in;

    -- (b) THE COUNT: the bag plus Storage, whole actions; the smaller of the run's count and the stock; nothing under one.
    if public.hr_bench_makes(c_u, 0, v_bench) is distinct from 0 or public.hr_activity_left(c_u, 0, 'artisan', v_bench, null) is not null
       or public.hr_activity_left(c_u, 0, 'artisan', v_bench, 9) is not null or public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'bench-resume §6(b): an empty stock makes % / left %', public.hr_bench_makes(c_u, 0, v_bench), public.hr_activity_left(c_u, 0, 'artisan', v_bench, 9); end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, v_in, 3 * v_need + (v_need - 1));
    insert into public.account_bank (user_id, item_id, qty) values (c_u, v_in, 1);
    if public.hr_bench_makes(c_u, 0, v_bench) is distinct from 4 then
      raise exception 'bench-resume §6(b): 3 actions and a remainder in the bag plus the last unit in Storage make %, not 4', public.hr_bench_makes(c_u, 0, v_bench); end if;
    if public.hr_activity_left(c_u, 0, 'artisan', v_bench, null) is distinct from 4 or public.hr_activity_left(c_u, 0, 'artisan', v_bench, 3) is distinct from 3
       or public.hr_activity_left(c_u, 0, 'artisan', v_bench, 9) is distinct from 4 or not public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'bench-resume §6(b): left at Enter is not the smaller of the count and the stock (all %, 3 %, 9 %)',
        public.hr_activity_left(c_u, 0, 'artisan', v_bench, null), public.hr_activity_left(c_u, 0, 'artisan', v_bench, 3), public.hr_activity_left(c_u, 0, 'artisan', v_bench, 9); end if;
    if public.hr_activity_left(c_u, 0, 'gather', v_node, 5) is not null or public.hr_activity_left(c_u, 0, 'training', 'anything', 5) is not null
       or public.hr_bench_makes(c_u, 0, 'no_such_bench') is not null or not public.hr_resume_has_inputs(c_u, 0, 'gather', v_node) then
      raise exception 'bench-resume §6(b): a kind with no count has one, or a bench that consumes nothing is bounded'; end if;
    if public.hr_resume_plan(c_u, 0, 'gather', v_node, null) is distinct from '{"ok": true}'::jsonb
       or public.hr_resume_plan(c_u, 0, 'artisan', v_bench, null) is distinct from '{"ok": false, "why": "no_count"}'::jsonb
       or public.hr_resume_plan(c_u, 0, 'artisan', v_bench, 2) is distinct from '{"ok": true, "left": 2}'::jsonb then
      raise exception 'bench-resume §6(b): the plans are % / % / %', public.hr_resume_plan(c_u, 0, 'gather', v_node, null),
        public.hr_resume_plan(c_u, 0, 'artisan', v_bench, null), public.hr_resume_plan(c_u, 0, 'artisan', v_bench, 2); end if;

    -- (c)+(d) THROUGH THE REAL ENTER AND THE REAL END, one hunt a row. `run`: the bench (or node) is running at Enter, with the
    -- count `cnt` ("All" = none); `bag` / `sto` actions of stock at Enter; `loot` actions landed during the hunt; `spent`: the
    -- stock is gone by the end; `why_end` the end reason. Wanted: the count Enter remembered, whether the end resumed, with
    -- which count, and why not.
    for r in select * from (values
      ('a counted run, stocked',              'artisan', true,  7,    20, 0,  0, false, 'stamina', 7,    true,  7,    null),
      ('All, and the hunt looted more',       'artisan', true,  null, 3,  2, 50, false, 'died',    5,    true,  5,    null),
      ('a count past the stock',              'artisan', true,  30,   4,  0, 50, false, 'stamina', 4,    true,  4,    null),
      ('dry at Enter, the hunt looted some',  'artisan', true,  null, 0,  0, 50, false, 'stamina', null, false, null, 'no_count'),
      ('stocked at Enter, gone by the end',   'artisan', true,  5,    5,  0,  0, true,  'stamina', 5,    false, null, 'dry'),
      ('not running at Enter, a full bag',    'artisan', false, null, 20, 0,  0, false, 'stamina', null, false, null, 'no_count'),
      ('the player left the hunt',            'artisan', true,  7,    20, 0,  0, false, 'left',    7,    null,  null, null),
      ('gathering',                           'gather',  true,  null, 0,  0,  0, false, 'stamina', null, true,  null, null)
    ) t(tag, kind, run, cnt, bag, sto, loot, spent, why_end, want_enter, want_resumed, want_left, want_why) loop
      v_i := v_i + 1;
      update public.player_state set active_kind = 'idle', active_id = null, active_left = null where user_id = c_u and slot = 0;
      delete from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_in;
      delete from public.account_bank where user_id = c_u and item_id = v_in;
      if r.bag > 0 then insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, v_in, r.bag * v_need); end if;
      if r.sto > 0 then insert into public.account_bank (user_id, item_id, qty) values (c_u, v_in, r.sto * v_need); end if;
      -- the job starts (the trigger remembers it); a job that is not running at Enter was stopped again
      update public.player_state set active_kind = r.kind, active_id = case when r.kind = 'artisan' then v_bench else v_node end,
                                     active_left = r.cnt, active_since = now(), accrued_to = now()
       where user_id = c_u and slot = 0;
      if not r.run then
        update public.player_state set active_kind = 'idle', active_id = null, active_left = null where user_id = c_u and slot = 0;
      end if;
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_hunt_enter(0, c_hunt, '[]'::jsonb, 0, null, (k || lpad(v_i::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'bench-resume §6-harness (%): entering answered %', r.tag, v; end if;
      select h.id into v_sid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
      select ps.active_kind, ps.last_activity_kind, ps.last_activity_id, ps.last_activity_left into v_st
        from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
      if v_st.active_kind <> 'combat' or v_st.last_activity_kind is distinct from r.kind
         or v_st.last_activity_left is distinct from r.want_enter then
        raise exception 'bench-resume §6(c) (%): Enter left the hero % remembering % % with % left, not %', r.tag, v_st.active_kind,
          v_st.last_activity_kind, v_st.last_activity_id, v_st.last_activity_left, r.want_enter; end if;
      -- the hunt: loot lands in the bag; or the stock is spent
      if r.loot > 0 then
        insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (c_u, 0, v_in, r.loot * v_need)
          on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      end if;
      if r.spent then
        delete from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_in;
        delete from public.account_bank where user_id = c_u and item_id = v_in;
      end if;
      -- the end, then the settle's step (7)
      perform public.hr_hunt_close(v_sid, r.why_end, now(), true);
      perform public.hr_hunt_resume(c_u, 0, v_sid, r.why_end, 0);
      select ps.active_kind, ps.active_id, ps.active_left into v_st from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
      select l.meta into v_meta from public.player_ledger l where l.session_id = v_sid and l.kind = 'hunt' and l.intent = 'resume';
      select count(*) into v_n from public.player_ledger l where l.session_id = v_sid and l.kind = 'hunt' and l.intent = 'resume';
      if r.want_resumed is null then
        if v_st.active_kind <> 'idle' or v_n <> 0 then
          raise exception 'bench-resume §6(d) (%): the hero is % with % resume row(s) after an end that resumes nothing', r.tag, v_st.active_kind, v_n; end if;
      elsif r.want_resumed then
        if v_st.active_kind is distinct from r.kind or v_st.active_id is distinct from (case when r.kind = 'artisan' then v_bench else v_node end)
           or v_st.active_left is distinct from r.want_left then
          raise exception 'bench-resume §6(d) (%): the end left the hero % % with % left, not % with %', r.tag, v_st.active_kind, v_st.active_id,
            v_st.active_left, r.kind, r.want_left; end if;
        if v_n <> 1 or (v_meta->>'resumed') is distinct from 'true' or (v_meta->>'left')::int is distinct from r.want_left or v_meta ? 'why' then
          raise exception 'bench-resume §6(d) (%): the resume journalled % row(s): %', r.tag, v_n, v_meta; end if;
      else
        if v_st.active_kind <> 'idle' or v_st.active_id is not null then
          raise exception 'bench-resume §6(d) (%): the end left the hero % %, not idle', r.tag, v_st.active_kind, v_st.active_id; end if;
        if v_n <> 1 or (v_meta->>'resumed') is distinct from 'false' or v_meta->>'why' is distinct from r.want_why or v_meta ? 'left' then
          raise exception 'bench-resume §6(d) (%): the refusal journalled % row(s): %, wanted why %', r.tag, v_n, v_meta, r.want_why; end if;
      end if;
    end loop;
    raise exception using errcode = 'HRB24', message = 'bench-resume §6 complete - rolling back';
  exception when sqlstate 'HRB24' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception 'bench-resume §6: LEAKED a probe row'; end if;
  raise notice 'bench-resume: a bench running at Enter resumes for the count it had left then, never the hunt''s loot; a dry or stopped bench does not start; gathering as before; all green';
end $chk$;
