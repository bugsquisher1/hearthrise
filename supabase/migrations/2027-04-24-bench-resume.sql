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
-- hr_hunt_apply_member   RESTATED WHOLE (2027-04-23-session-modes.sql's image, pg_get_functiondef's own text; §0 pins it).
--   BENCH-RESUME marks its two changes and every other line is verbatim: step (7)'s 31 lines are one call of hr_hunt_resume,
--   and that step's five locals (v_end, v_lk, v_li, v_home, v_ok) are gone. hr_hunt_settle_session is NOT touched.
--   Whole, not an anchored edit: the mutant harnesses plant in this body's ONE last author (tests/alpha-server.mjs
--   MEMBER_LAST), and a body that runs should stand in one file (tests/patch-chain-guard.mjs, depth 0).
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
-- (src/data/how-to-play.js, the Help page's `town` note); "Then {name} went back to working on X" already reads the pointer.
-- A hunt open across the apply was entered before the capture existed: its bench is not resumed, as before this file.
-- REVERSIBILITY: re-apply hr_resume_has_inputs from 2027-02-15-panel-truth.sql, hr_last_activity_note from
-- 2026-10-22-hunt-sessions-settle.sql and hr_hunt_apply_member from 2027-04-23-session-modes.sql, drop the four new
-- functions; the column is inert. No row of any character needs repair.
-- ORDER: after 2027-04-23-session-modes.sql (lane/c-tower-mode), which restates hr_hunt_apply_member first: this file's
-- restate is THAT image (its three SESSION-MODES changes, verbatim) with step (7) as one call; the two lanes share no other
-- line. A LATER whole restate of that body re-bases the same way: anchor on step (7)'s one call, keep it.
-- After apply: live-hash-drift wants hr_hunt_apply_member, hr_resume_has_inputs and hr_last_activity_note re-measured and the
-- four new bodies tracked (Coordinator).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS: FAIL CLOSED IF ANOTHER FILE MOVED A RESTATED BODY ─────────────────────────────────────────
-- md5 of pg_get_functiondef with whitespace runs as one: tests/live-hash-drift.baseline.json's own normalisation, so each
-- pre-image below is the value MEASURED ON PRODUCTION (2026-11-15, equal to the replay's), or this file's own (a second apply).
-- hr_hunt_apply_member's is the replay's alone: 2027-04-23-session-modes.sql is staged too and must be applied first.
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
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'add877806bb908e8e79416f2baafe912', '034d0bcb1a3ad843d30917afb5ae7fe9', '2027-04-23-session-modes.sql'),
    ('public.hr_resume_has_inputs(uuid,integer,text,text)', '5b1886334c5669f1395b9f8c08128895', '44e151312349ce9b7543b418e90e21d9', '2027-02-15-panel-truth.sql'),
    ('public.hr_last_activity_note()', '7486863c27623617ddb85abf5a048338', 'c613f3e203cdb279f1b5830db8c32f84', '2026-10-22-hunt-sessions-settle.sql')
  ) p(sig, pre, post, src) loop
    if to_regprocedure(r.sig) is null then raise exception 'PIN: % is missing', r.sig; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(r.sig::regprocedure), '[[:space:]]+', ' ', 'g'));
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

-- hr_hunt_apply_member's step (7), whole: the same reads, checks and writes in the same order. BENCH-RESUME marks what is new.
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

-- ── §4 THE SETTLE CALLS IT: hr_hunt_apply_member RESTATED WHOLE ──────────────
-- 2027-04-23-session-modes.sql's image, pg_get_functiondef's own text, with the two BENCH-RESUME changes, each marked: step (7)
-- is one call of hr_hunt_resume, and that step's five locals went with it. Every other line is verbatim. CREATE OR REPLACE keeps
-- the function's grants; none moves here.
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS: the catalogue's `combat` rows, so a renamed or new
  -- combat skill is priced with no body edit; 2027-01-31-inner-flame.sql); the Level is priced as `level`.
  c_xp_skills constant text[] := array(select k.skill_id from public.hr_skills k where k.cat = 'combat' order by k.skill_id);
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_lfrom int; v_lto int;  -- DEATH-SHARE (2027-03-25-death-share.sql): the hero's Level before and after the death's debit
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): step (7)'s five locals went with it to hr_hunt_resume.
  v_train boolean;  -- TRAINING (2027-04-16-combat-training.sql): this session trains on a training ground (hr_training_grounds)
  v_mode  public.hr_session_modes%rowtype;  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance's mode, frozen at its start
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  -- LIVE-EVENTS (2027-03-22-live-events.sql): `xp_event` is this member's own (kept on the tally below), never the session half's.
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms' - 'xp_event';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    -- DEATH-SHARE: one formula, a share of the TOTAL Level XP (no alternative base row).
    v_rate := public.hr_hunt_limit('death_xp_permille');
    if v_rate is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  -- TRAINING (2027-04-16-combat-training.sql): a training session spends no stamina and proposes none (a JSON null, src/core/combat-sim.js);
  -- the pool is never written here, so it rests while the hero trains (hr_stamina_of from its last stamp).
  v_train := exists (select 1 from public.hr_training_grounds t where t.hunt_id = v_s.hunt_id);
  if v_train then
    if v_stam is null or jsonb_typeof(v_stam) <> 'null' then perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'training')); end if;
  elsif v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed', 'fight'))
          or (p_analyzer ? 'fight' and not public.hr_boss_fight_ok(p_analyzer->'fight', v_s.hunt_id)) -- CALL-OUT: one room's record
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- SESSION-MODES (2027-04-23-session-modes.sql): THE INSTANCE'S MODE, frozen by the server when it started (hunt_instances.session_mode,
  -- hr_hunt_mode_freeze, from its own ground catalogue), never an intent's or the edge's. Its row bounds the death (6) and its Blessings.
  select m.* into v_mode from public.hunt_instances i join public.hr_session_modes m on m.mode_id = i.session_mode where i.id = p_instance;
  if not found then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'session_mode')); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- CALL-OUT (2027-03-12-boss-call.sql): A CALLED ROOM PAYS NOTHING, by any route: refused whole, before hr_apply writes a thing.
  if exists (select 1 from public.hr_boss_calls c where c.hunt_id = v_s.hunt_id and public.hr_boss_call_pays(p_delta, c.monster_id) is not null) then
    perform public.hr_reject('called_pays', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): A TRAINING WINDOW PAYS ITS SKILL AND NOTHING ELSE, refused whole before hr_apply writes a thing
  -- (hr_training_window: an allowlist, the trained skill's key only, no Level XP, no coin, no item, no kill, no death, a time bound).
  if v_train then perform public.hr_training_window(p_user, p_slot, v_s.hunt_id, v_s.settled_to, v_to, p_delta); end if;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): a window the commit proved scaled (hunt_instances.scale_level, written by
  -- hr_hunt_apply_instance before any member lands) is bounded by its scaled roster's most a kill pays as well (hr_scaled_kill_bounds).
  select greatest(v_vb_gold, coalesce(max(b.gold_max), 0)), greatest(v_vb_xp, coalesce(max(b.xp_max), 0)) into v_vb_gold, v_vb_xp
    from public.hunt_instances i join public.hr_scaled_kill_bounds b on b.hunt_id = i.hunt_id and b.level = i.scale_level
   where i.id = p_instance;
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Inner Flame rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * greatest(coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0),
                           coalesce((select b.level_max from public.hunt_instances i join public.hr_scaled_kill_bounds b
                                       on b.hunt_id = i.hunt_id and b.level = i.scale_level where i.id = p_instance), 0))
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  -- LIVE-EVENTS: the Level XP bound grows by this account's own live dial over this window's span, and by nothing else.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric
       > v_kills * v_vb_xp * v_vb_h * public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) / 1000.0 then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  -- TRAINING (2027-04-16-combat-training.sql): a training window drains nothing and stamps nothing (the clock above is still re-proved).
  if not v_train then
    if v_e <> greatest(0, v_s0 - v_paid) then
      perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
    if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
    update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;
  end if;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    -- MEMBER-WRITE-ONCE (2027-04-08-member-write-once.sql): the bill's tally increments (bought, supply_gold) are written
    -- with the analyzer's, in the one tally write after the session half (THE ANALYZER TALLY below). Nothing reads them between.
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- TRAINING (2027-04-16-combat-training.sql): THE YARD'S NEXT HOUR, at its first instant (the edge cuts a yard window there, src/core/hunt/training.js
  -- trainingStopMs): paid from the account purse out of what this window's own store bill and the hero's floor leave, or the session ends gold_out
  -- right there (hr_training_hour). Its end, if any, rides the answer, so the resume below and the edge read it as any end.
  if v_train then v_h := public.hr_training_hour(p_user, p_slot, p_session, v_to, v_cost, v_floor, v_h); end if;
  -- LIVE-EVENTS: THE EVENT'S PART of this window's Level XP, apart on the tally (a best leaves it out). Never more than the window's Level XP,
  --   nor more than the account's own dial could add to it (a floor a kill, so the window's kills on top), and none with no event live.
  if p_hunt ? 'xp_event' then
    if jsonb_typeof(p_hunt->'xp_event') is distinct from 'number' or (p_hunt->>'xp_event') !~ '^[0-9]{1,15}$'
       or (p_hunt->>'xp_event')::numeric > coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0)
       or (p_hunt->>'xp_event')::numeric > (select case when q.m = 1000 then 0
              else coalesce(case when jsonb_typeof(p_delta->'level_xp') = 'number' then (p_delta->>'level_xp')::numeric end, 0) * (q.m - 1000) / q.m + v_kills end
            from (select public.hr_live_xp_max_pm(p_user, v_s.hunt_id, v_s.settled_to, v_to) as m) q) then
      perform public.hr_reject('bad_xp_event', jsonb_build_object('xp_event', p_hunt->'xp_event', 'level_xp', p_delta->'level_xp')); end if;
  end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if not v_train and v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  -- SESSION-MODES: a mode whose death uses no Blessing (one that costs nothing: the Burning Tower) never calls the hook; they stay held.
  if v_nd > 0 and v_mode.blessings then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-11-09, CORE_MODEL.md §6):
  --     DEATH-SHARE: every bound is hr_death_xp_max, the one rule: the LEVEL loses at most
  --     death_xp_permille of its TOTAL XP, and that may take a Level (never below 0 XP, Level 1);
  --     each combat skill loses at most the permille of its progress into its level, never a level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  --     SESSION-MODES: each bound is that rule at the instance mode's share (hr_death_xp_mode_max): the rule itself in a hunt, and 0 in
  --     a mode whose death costs nothing, so there any death XP at all is refused (the engine proposes none: two locks).
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        if v_n > public.hr_death_xp_mode_max('level', v_cur, v_mode.death_loss_pm) then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', public.hr_char_level(v_cur))); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      if v_n > public.hr_death_xp_mode_max(v_k, v_cur, v_mode.death_loss_pm) then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', public.hr_skill_level(v_k, v_cur))); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  -- DEATH-SHARE: the death names the Level it took the hero from and to (equal when it took none), off the debited Level XP.
  if v_nd > 0 then
    select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot;
    v_lto := public.hr_char_level(v_cur);
    v_lfrom := public.hr_char_level(v_cur + coalesce((v_lost->>'level')::bigint, 0));
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x),
                                             'level_from', v_lfrom, 'level_to', v_lto)
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home), by the job's kind.
  --     BENCH-RESUME (2027-04-24-bench-resume.sql): the step is hr_hunt_resume, whole, so a new kind of job never restates this body.
  perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>'ended', v_ev0);
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  -- LIVE-EVENTS: the tally's one update also keeps the event's part (bounded above), analyzer or not.
  -- MEMBER-WRITE-ONCE: the store bill (v_cost > 0) rides this one write; each column keeps its own condition.
  if (p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object') or p_hunt ? 'xp_event' or v_cost > 0 then
    update public.hunt_session_tally t
       set bought = case when v_cost > 0 then public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                                                from jsonb_each(v_items) i)) else t.bought end,
           supply_gold = t.supply_gold + v_cost,
           xp_event = t.xp_event + coalesce((p_hunt->>'xp_event')::bigint, 0),
           dealt = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)) else t.dealt end,
           taken = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                        then public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)) else t.taken end,
           healed = case when p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' or p_hunt ? 'xp_event'
                         then public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb)) else t.healed end,
           fight = case when p_analyzer ? 'fight' then jsonb_build_object('boss_pm', p_analyzer->'fight'->'boss_pm',
             'fired', public.hr_jsonb_add(coalesce(t.fight->'fired', '{}'::jsonb), coalesce(p_analyzer->'fight'->'fired', '{}'::jsonb))) else t.fight end
     where t.session_id = p_session;
  end if;
  -- MEMBER-WRITE-ONCE: written only when it moves (the session half already took this row's version forward).
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end
   where id = p_session and unit_id is distinct from (case when ended_at is null then v_unit_id end);
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

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
-- running at Enter does not resume (panel-truth), and before it a resumed bench had no count; (e) no row said why. The settle's
-- own call, on both doors (the browser closed, the hunt viewed), and the engine spending exactly the count are
-- tests/hunt-sessions-settle.mjs RESUME.
do $chk$
declare
  c_u    constant uuid := '000000c0-0000-4000-a000-0000be7c0424';
  k      constant text := '000000c0-0000-4000-b000-be7c0424';
  c_hunt constant text := 'mill_cellar';
  c_am   constant text := 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
  v jsonb; v_s text; v_role text; v_src text; v_n int; v_i int := 0;
  v_bench text; v_in text; v_need bigint; v_node text; v_lock text; v_sid uuid; v_st record; v_meta jsonb;
  r record;
begin
  -- (a) THE SHAPE: no client or engine role runs a body of this file; each keeps a pinned search_path; the column is ranged
  --     like active_left; the trigger still stands on the pointer; the settle calls the resume once, after the value half and
  --     after a replayed key has returned, writes no pointer itself, and is the reviewed image.
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
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = c_am::regprocedure;
  v_s := 'perform public.hr_hunt_resume(p_user, p_slot, p_session, v_h->>''ended'', v_ev0);';
  if (length(v_src) - length(replace(v_src, v_s, ''))) / length(v_s) <> 1 then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member does not call hr_hunt_resume exactly once'; end if;
  if strpos(v_src, 'set active_kind = v_lk') > 0 or strpos(v_src, 'hr_resume_has_inputs') > 0 then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member still resumes inline'; end if;
  if strpos(v_src, 'perform public.hr_hunt_resume') < strpos(v_src, 'v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);')
     or strpos(v_src, 'perform public.hr_hunt_resume') < strpos(v_src, 'return jsonb_build_object(''ok'', true, ''replayed'', true);') then
    raise exception 'bench-resume §6(a): the resume runs before the value half or before a replayed key returns'; end if;
  -- the restated settle is the reviewed image, still the owner's SECURITY DEFINER body that no client role runs
  if md5(regexp_replace(pg_get_functiondef(c_am::regprocedure), '[[:space:]]+', ' ', 'g')) is distinct from '034d0bcb1a3ad843d30917afb5ae7fe9' then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member is not the reviewed image'; end if;
  if not exists (select 1 from pg_proc p where p.oid = c_am::regprocedure and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog'])
     or has_function_privilege('anon', c_am, 'execute') or has_function_privilege('authenticated', c_am, 'execute') then
    raise exception 'bench-resume §6(a): hr_hunt_apply_member lost its definer shape or a client role can run it'; end if;
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
      ('not running at Enter, an old count',  'artisan', false, null, 20, 0,  0, false, 'stamina', null, false, null, 'no_count'),
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
        -- ...and an older hunt's start had remembered a count for it, which this Enter must void
        update public.player_state set active_kind = 'idle', active_id = null, active_left = null, last_activity_left = 9
         where user_id = c_u and slot = 0;
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
      -- a change of ground keeps what the hunt's START remembered (hr_hunt_swap's own pointer write, hunt to hunt)
      perform public.hr_hunt_point(c_u, 0, c_hunt);
      if (select ps.last_activity_left from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is distinct from r.want_enter then
        raise exception 'bench-resume §6(c) (%): a change of ground moved the remembered count to %', r.tag,
          (select ps.last_activity_left from public.player_state ps where ps.user_id = c_u and ps.slot = 0); end if;
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

    -- (e) WHAT THE OLD STEP REFUSED IS STILL REFUSED, and the row now says why: no remembered job; a kind with no catalogue row
    --     (the reserved `training`); a job above the hero's level. Each through a real hunt that ends on its own.
    select a.activity_id into v_lock from public.hr_activities a
     where a.kind = 'gather' and a.req_skill is not null and a.req_lv > 1 order by a.req_lv desc, a.activity_id limit 1;
    if v_lock is null then raise exception 'bench-resume §6-harness: no gathering node is level-locked'; end if;
    for r in select * from (values ('no remembered job', null, null, 'none'), ('the reserved training kind', 'training', 'yard', 'gone'),
                                   ('a node above the hero''s level', 'gather', v_lock, 'level')) t(tag, kind, id, want_why) loop
      v_i := v_i + 1;
      update public.player_state set active_kind = 'idle', active_id = null, active_left = null,
                                     last_activity_kind = r.kind, last_activity_id = r.id, last_activity_left = null
       where user_id = c_u and slot = 0;
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_hunt_enter(0, c_hunt, '[]'::jsonb, 0, null, (k || lpad(v_i::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'bench-resume §6-harness (%): entering answered %', r.tag, v; end if;
      select h.id into v_sid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
      perform public.hr_hunt_close(v_sid, 'stamina', now(), true);
      perform public.hr_hunt_resume(c_u, 0, v_sid, 'stamina', 0);
      select ps.active_kind, ps.active_id, ps.active_left into v_st from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
      select l.meta into v_meta from public.player_ledger l where l.session_id = v_sid and l.kind = 'hunt' and l.intent = 'resume';
      if v_st.active_kind <> 'idle' or (v_meta->>'resumed') is distinct from 'false' or v_meta->>'why' is distinct from r.want_why then
        raise exception 'bench-resume §6(e) (%): the end left the hero % and journalled %, wanted idle and why %', r.tag, v_st.active_kind, v_meta, r.want_why; end if;
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
