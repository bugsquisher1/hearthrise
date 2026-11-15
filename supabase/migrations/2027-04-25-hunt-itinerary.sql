-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-25-hunt-itinerary.sql — WHEN THE HUNT ENDS: THE HERO'S NEXT STOP IS THE PLAYER'S PICK, KEPT AND RUN BY THE SERVER
-- (Tyler 2026-11-15: "I think we just need an itinerary of sorts where a player picks a hunt and picks what they want to do
--  when the hunt finishes"; lane/c-hunt-itinerary, backend-architect). STAGED: tools/apply-migration.mjs, one file, never
--  inside begin/commit, never 00:00-00:10 UTC. Pre-EA: applies on its passing §8. ON THE EA SECURITY LIST: a remembered choice
--  starts a paid training session.
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
-- A hero has ONE remembered choice for what it does when a hunt ends ON ITS OWN (hr_hunt_end_reasons.resumes; a hunt the
-- player leaves or changes by hand ends with the hero waiting in town, as before). The rows are hr_hunt_after_choices
-- (generated from src/data/hunt-after.js):
--   job    (the default: a hero that never picked)  back to its job: its last gathering job, as always; or the bench it SET
--          OFF FROM, for the count that bench still had to make then (2027-04-24-bench-resume.sql), never the hunt's loot.
--   wait   wait in town.
--   train  train a skill the player named, at the row's place (the yard): hr_training_start, the ONE door to a training
--          session, at the SERVER's price on the server's clock, charged when it starts. Not enough gold, a hero still in a
--          party, a hero under the yard's Level: the hero waits in town and the hunt's record says why.
-- The choice is FROZEN ON THE HUNT at Enter (a BEFORE INSERT trigger on hunt_sessions copies the hero's own; a change of
-- ground carries the hunt's; a training session never trains again unasked: it takes the default). Each party seat has its own.
--
-- ── WHY ENTER MUST REMEMBER A STOPPED BENCH (the hole 2027-04-24-bench-resume.sql left) ─────────────────────────────────────
-- The client stops a hero's town job a moment BEFORE Enter (set_activity idle: the engine pays the last stretch, and putting
-- another setup on needs an idle hero), so at Enter the pointer is already idle and the bench's count is gone: with the real
-- client no bench ever resumed. Now the PLAYER'S OWN STOP of the remembered job keeps the run's count and its instant
-- (player_state.last_activity_stopped_at), and an Enter no later than hr_hunt_after_rule.job_grace_s after it counts that
-- bench as the job the hero set off from. A run the ENGINE ended (its count reached, its stock or gold spent) is not a stop
-- and is never picked up. The two are told apart by the intent hr_apply registered for the transaction (player_intents,
-- `set_activity:idle`, the same now()): hr_apply writes that row before the state row, and §8 holds it on real applies.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- player_state.after_choice text NULL -> hr_hunt_after_choices (NULL: the rule's default), after_skill text NULL (the skill a
--   training choice trains), last_activity_stopped_at timestamptz NULL. Written only by hr_hunt_after_set / the trigger.
-- hunt_sessions.after_choice, after_skill (frozen at INSERT), after_done jsonb NULL: what came of it, written once the hunt
--   ended on its own: { state: resumed | waited | pending | started, why?, kind?, id?, left?, skill?, place?, fee?, purse?,
--   session?, at }. `pending`: a training start the sweep has not run yet.
-- hr_hunt_after_set(p_slot int, p_choice text, p_skill text, p_idem uuid) -> jsonb   CLIENT VERB (authenticated). Stores the
--   hero's choice for its NEXT hunts. No value moves. ok: { ok, choice, skill, hunt_after }. Refusals, each storing nothing:
--   not_signed_in, bad_slot, bad_idem, bad_choice (no such row), bad_skill (a training choice with no skill the row's place
--   trains; any other choice with a skill), rate_limited, no_character, intent_mismatch. NO PRICE, COUNT OR JOB is ever taken
--   from the client: the job and its count are the server's own rows, the fee is hr_training_quote's when the session starts.
-- hr_hunt_after_job(user, slot) -> jsonb   owner-only. What "back to the job" means for this hero NOW: { kind, id, left? } or
--   null. In town: the job it is on, or the bench it stopped within the grace, or its remembered gathering job. In a hunt: what
--   Enter remembered.
-- hr_hunt_after_section(user, slot) -> jsonb   the `hunt_after` envelope section (hr_state_sections): { choice, skill,
--   grace_s, job, last: { session, open, choice, skill, done } | null (the hero's newest hunt: its frozen choice and what came
--   of it) }. Every envelope replaces it.
-- hr_hunt_resume  RESTATED WHOLE (2027-04-24-bench-resume.sql's image; §0 pins it): the SAME signature, so
--   hr_hunt_apply_member is NOT touched. It reads the hunt's frozen choice and does what the row `runs`: job (the by-kind
--   plan, unchanged), nothing, or training (marks the hunt `pending`: the start is NOT run inside the settle, see below).
--   The ledger row is the old one plus `plan` when the choice is not the default.
-- hr_hunt_after_start(session) -> jsonb, hr_hunt_after_sweep(limit) -> int   owner-only. THE DEFERRED START: a pending hunt
--   whose hero is still idle in town with no newer hunt gets hr_training_quote's price and ONE call of hr_training_start
--   as that hero (the JWT subject set for the call and put back), on a key derived from the ended hunt, so it charges once.
--   The cron job hr-hunt-after runs the sweep every minute. Journal: hr_training_start's own row (kind shop, the fee) and one
--   row of the plan's outcome (kind hunt, intent after_hunt, no gold, the hunt in meta).
-- hr_last_activity_note  RESTATED WHOLE (2027-04-24-bench-resume.sql's image; §0 pins it): + the player's Stop and the grace.
--
-- WHY THE START IS NOT IN THE SETTLE: the settle holds the hero's lock and the account's purse; a training start takes the
-- account's training key and play locks and THEN the purse. Opening a session inside another session's settle would take
-- them in the other order (a deadlock with a sibling hero's start) and write a second session under the instance commit.
-- A separate transaction through the one door has neither problem, and both doors (the hunt viewed, the browser closed)
-- write the same rows because neither door starts anything.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────
-- hr_hunt_after_set: the hero's lock, the caller's key (hr_intent_replay). The freeze runs inside Enter's transaction under
-- the hero's lock. The sweep takes each pending hunt `for update skip locked` (two sweeps never start one hunt twice), then
-- hr_training_start's own order (training key, hero, play locks, purse). Its key is md5 of the ended hunt's id: a re-run after
-- a crash replays hr_training_start's stored answer and charges nothing more; after_done moves pending -> started | waited
-- once. A transient refusal (rate_limited, quote_changed, intent_in_flight) leaves it pending for the next minute, for ten
-- minutes at most.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- One new client verb that moves no value and names only catalogue rows. The paid path adds NO new way to charge: it is
-- hr_training_start with the server's own quote, reachable only for a hunt that ended on its own with the hero's own frozen
-- choice, once. A forged choice or skill is refused at the verb; a choice row removed later reads as the default. Nothing
-- crosses to another player. The impersonation is local to the transaction and only names the hunt's own hero.
--
-- ── ROWS AND BYTES ──────────────────────────────────────────────────────────
-- player_state +3 columns (two NULL for a hero that never picked); hunt_sessions +3 (the kept hunts only, 20 a hero). No new
-- table. Ledger: one `after_hunt` row a training plan that ran (not per tick). Per envelope: the section reads the hero's row
-- and its newest hunt (hunt_sessions_char_recent), and a bench's two stock rows only while the hero stands at one. Per minute:
-- one probe of a partial index that is empty unless a training plan is waiting.
--
-- EDGE: none. CLIENT: src/session/hunt-after-sections.js reads the section; the hunt page's "When the hunt ends" sends the verb.
-- REVERSIBILITY: unschedule hr-hunt-after; re-apply hr_hunt_resume and hr_last_activity_note from 2027-04-24-bench-resume.sql;
-- drop the trigger hr_hunt_after_freeze, the six functions, the section and baseline rows; the columns are inert.
-- ORDER: after 2027-04-25-hunt-after-catalogue.generated.sql (and so after 2027-04-24-bench-resume.sql and the training files).
-- After apply: live-hash-drift wants hr_hunt_resume and hr_last_activity_note re-measured and six bodies tracked (Coordinator).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- md5 of pg_get_functiondef with whitespace runs as one (tests/live-hash-drift.baseline.json's normalisation): each restated
-- body is 2027-04-24-bench-resume.sql's image, or this file's own (a second apply).
do $mig$
declare v_md5 text; r record;
begin
  if to_regclass('public.hr_hunt_after_choices') is null or not exists (select 1 from public.hr_hunt_after_rule where id) then
    raise exception 'PRECONDITION: apply 2027-04-25-hunt-after-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_activity_left(uuid,integer,text,text,integer)') is null
     or to_regprocedure('public.hr_resume_plan(uuid,integer,text,text,integer)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'last_activity_left') then
    raise exception 'PRECONDITION: apply 2027-04-24-bench-resume.sql first'; end if;
  if to_regprocedure('public.hr_training_start(integer,text,text,bigint,uuid)') is null
     or to_regprocedure('public.hr_training_quote(uuid,integer,text,text)') is null or to_regclass('public.hr_training_grounds') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.player_intents') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing (the training files, the intent helpers)'; end if;
  for r in select * from (values
    ('public.hr_hunt_resume(uuid,integer,uuid,text,bigint)', '17be194383cca96b57b76742145dc2d8', '912c123f21f1a37e1cfe0dcd9df143d0'),
    ('public.hr_last_activity_note()', 'c613f3e203cdb279f1b5830db8c32f84', '9f4a691047caeb1f615452373985df44')
  ) p(sig, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(r.sig::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither 2027-04-24-bench-resume.sql''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMNS ───────────────────────────────────────────────────────────
alter table public.player_state add column if not exists after_choice text;
alter table public.player_state add column if not exists after_skill text;
alter table public.player_state add column if not exists last_activity_stopped_at timestamptz;
alter table public.hunt_sessions add column if not exists after_choice text;
alter table public.hunt_sessions add column if not exists after_skill text;
alter table public.hunt_sessions add column if not exists after_done jsonb;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_after_choice_fk' and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_after_choice_fk
      foreign key (after_choice) references public.hr_hunt_after_choices (choice) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_state_after_skill_ck' and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_after_skill_ck
      check (after_skill is null or (after_choice is not null and after_skill ~ '^[a-z_]{1,32}$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hunt_sessions_after_ck' and conrelid = 'public.hunt_sessions'::regclass) then
    alter table public.hunt_sessions add constraint hunt_sessions_after_ck
      check ((after_choice is null or after_choice ~ '^[a-z_]{1,24}$') and (after_skill is null or after_skill ~ '^[a-z_]{1,32}$')
             and (after_done is null or (jsonb_typeof(after_done) = 'object' and after_done->>'state' in ('resumed', 'waited', 'pending', 'started'))));
  end if;
end $mig$;
create index if not exists hunt_sessions_after_pending on public.hunt_sessions (ended_at) where (after_done->>'state') = 'pending';
comment on column public.player_state.after_choice is
  '2027-04-25-hunt-itinerary.sql: what this hero does when a hunt ends on its own (hr_hunt_after_choices); NULL = the rule''s default. Written only by hr_hunt_after_set.';
comment on column public.player_state.after_skill is
  '2027-04-25-hunt-itinerary.sql: the skill a training choice trains; NULL for any other choice.';
comment on column public.player_state.last_activity_stopped_at is
  '2027-04-25-hunt-itinerary.sql: when the PLAYER''s own Stop ended the remembered job (last_activity_left then holds the run''s count, NULL = "All"); cleared by the next start or Enter. Written only by hr_last_activity_note.';
comment on column public.hunt_sessions.after_done is
  '2027-04-25-hunt-itinerary.sql: what came of the hunt''s frozen choice once it ended on its own: {state: resumed|waited|pending|started, why, ...}.';

-- ── §2 THE HERO'S CHOICE ─────────────────────────────────────────────────────
-- WHAT "BACK TO THE JOB" MEANS FOR THIS HERO NOW. One body for the envelope and the self-check, so the page can never show a job
-- the settle would not go back to.
create or replace function public.hr_hunt_after_job(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_st public.player_state%rowtype; v_k text; v_i text; v_left int; v_counted boolean;
begin
  select * into v_st from public.player_state where user_id = p_user and slot = p_slot;
  if not found then return null; end if;
  if v_st.active_kind = 'combat' then
    -- in a hunt: what Enter remembered
    v_k := v_st.last_activity_kind; v_i := v_st.last_activity_id; v_left := v_st.last_activity_left;
  elsif v_st.active_id is not null and v_st.active_kind = v_st.last_activity_kind and v_st.active_id = v_st.last_activity_id then
    -- in town, on the job
    v_k := v_st.active_kind; v_i := v_st.active_id;
    v_left := public.hr_activity_left(p_user, p_slot, v_k, v_i, v_st.active_left);
  elsif v_st.last_activity_stopped_at is not null
        and v_st.last_activity_stopped_at >= now() - make_interval(secs => (select r.job_grace_s from public.hr_hunt_after_rule r where r.id)) then
    -- in town, the player's Stop a moment ago
    v_k := v_st.last_activity_kind; v_i := v_st.last_activity_id;
    v_left := public.hr_activity_left(p_user, p_slot, v_k, v_i, v_st.last_activity_left);
  else
    -- in town, idle: a remembered job with no count (gathering) is still the job; a bench stopped on purpose is not
    v_k := v_st.last_activity_kind; v_i := v_st.last_activity_id; v_left := null;
  end if;
  if v_k is null or not exists (select 1 from public.hr_activities a where a.kind = v_k and a.activity_id = v_i) then return null; end if;
  -- the by-kind plan is the judge of whether a count is needed (a bench with none left is no job to go back to)
  v_counted := coalesce((public.hr_resume_plan(p_user, p_slot, v_k, v_i, null)->>'ok')::boolean, false) is false;
  if v_counted and v_left is null then return null; end if;
  return jsonb_build_object('kind', v_k, 'id', v_i) || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end;
end $fn$;

create or replace function public.hr_hunt_after_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_def text; v_grace int; v_choice text; v_skill text; v_last jsonb;
begin
  select r.default_choice, r.job_grace_s into v_def, v_grace from public.hr_hunt_after_rule r where r.id;
  select ps.after_choice, ps.after_skill into v_choice, v_skill from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  select jsonb_build_object('session', s.id, 'open', s.ended_at is null, 'choice', coalesce(s.after_choice, v_def), 'skill', s.after_skill, 'done', s.after_done)
    into v_last from public.hunt_sessions s where s.user_id = p_user and s.slot = p_slot order by s.entered_at desc, s.id limit 1;
  return jsonb_build_object('choice', coalesce(v_choice, v_def), 'skill', v_skill, 'grace_s', v_grace,
                            'job', public.hr_hunt_after_job(p_user, p_slot), 'last', v_last);
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('hunt_after', 'hr_hunt_after_section', '2027-04-25-hunt-itinerary.sql: what this hero does when a hunt ends on its own (its choice, the job that means now, its newest hunt''s frozen choice and what came of it)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

create or replace function public.hr_hunt_after_set(p_slot int, p_choice text, p_skill text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'hunt_after_set';
  v_uid uuid := auth.uid(); v_c public.hr_hunt_after_choices%rowtype; v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- THE SERVER'S OWN ROWS, never the caller's word: the choice is a catalogue row, and a skill is one its place trains.
  select * into v_c from public.hr_hunt_after_choices where choice = p_choice;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_choice')); end if;
  if (v_c.runs = 'training' and not exists (select 1 from public.hr_training_grounds g where g.place = v_c.place and g.skill = p_skill))
     or (v_c.runs <> 'training' and p_skill is not null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_skill')); end if;
  v_verb := c_verb || ':' || v_c.choice || ':' || coalesce(p_skill, '');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  update public.player_state set after_choice = v_c.choice, after_skill = p_skill, updated_at = now()
   where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_r := jsonb_build_object('ok', true, 'choice', v_c.choice, 'skill', p_skill);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('hunt_after', public.hr_hunt_after_section(v_uid, p_slot));
end $fn$;

-- ── §3 THE FREEZE: A HUNT CARRIES THE CHOICE ITS HERO HAD AT ENTER ───────────
create or replace function public.hr_hunt_after_freeze()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
declare v_def text;
begin
  select r.default_choice into v_def from public.hr_hunt_after_rule r where r.id;
  if new.prev_session_id is not null then
    -- a change of ground: the hunt's own choice goes with it
    select s.after_choice, s.after_skill into new.after_choice, new.after_skill from public.hunt_sessions s where s.id = new.prev_session_id;
  else
    select ps.after_choice, ps.after_skill into new.after_choice, new.after_skill
      from public.player_state ps where ps.user_id = new.user_id and ps.slot = new.slot;
  end if;
  new.after_choice := coalesce(new.after_choice, v_def);
  -- A TRAINING SESSION NEVER TRAINS AGAIN UNASKED (it would buy hours for ever): its own end takes the default.
  if exists (select 1 from public.hr_training_grounds g where g.hunt_id = new.hunt_id)
     and exists (select 1 from public.hr_hunt_after_choices c where c.choice = new.after_choice and c.runs = 'training') then
    new.after_choice := v_def;
  end if;
  if not exists (select 1 from public.hr_hunt_after_choices c where c.choice = new.after_choice and c.runs = 'training') then
    new.after_skill := null;
  end if;
  new.after_done := null;
  return new;
end $fn$;
drop trigger if exists hr_hunt_after_freeze on public.hunt_sessions;
create trigger hr_hunt_after_freeze before insert on public.hunt_sessions
  for each row execute function public.hr_hunt_after_freeze();

-- ── §4 THE JOB A HERO SETS OFF FROM (hr_last_activity_note, restated whole) ──
create or replace function public.hr_last_activity_note()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if (new.active_kind is distinct from old.active_kind or new.active_id is distinct from old.active_id)
     and new.active_id is not null and new.active_id ~ '^[a-z0-9_]{1,64}$'
     and exists (select 1 from public.hr_hunt_resumable_kinds k where k.kind = new.active_kind) then
    new.last_activity_kind := new.active_kind;
    new.last_activity_id := new.active_id;
    -- HUNT-ITINERARY: on a job again, so no Stop is waiting
    new.last_activity_stopped_at := null;
  end if;
  -- HUNT-ITINERARY (2027-04-25-hunt-itinerary.sql): THE PLAYER'S OWN STOP OF THE REMEMBERED JOB KEEPS THE RUN'S COUNT. The client
  -- stops a job a moment before Enter, so Enter would find an idle hero and no count. A Stop is the statement hr_apply registered
  -- for this transaction (player_intents: `set_activity:idle`, the same now()); a run the ENGINE ended (count reached, stock or
  -- gold spent) arrives as an accrual and is never picked up.
  if new.active_kind = 'idle' and old.active_kind is distinct from 'idle'
     and old.active_id is not null and old.active_kind = new.last_activity_kind and old.active_id = new.last_activity_id then
    if exists (select 1 from public.player_intents i
                where i.at = now() and i.user_id = old.user_id and i.slot = old.slot and i.intent = 'set_activity:idle') then
      new.last_activity_left := old.active_left;
      new.last_activity_stopped_at := now();
    else
      new.last_activity_left := null;
      new.last_activity_stopped_at := null;
    end if;
  end if;
  -- BENCH-RESUME (2027-04-24-bench-resume.sql; Tyler 2026-11-15): THE HUNT'S START REMEMBERS WHAT THE JOB IT STOPS STILL HAD
  -- TO MAKE. The pointer moves from town onto a hunt (whichever writer made it): the count of the remembered job, if that is
  -- the one running, by its kind (hr_activity_left); else NULL, so a job that had ended or been stopped is never picked up.
  -- A change of ground (`combat` to `combat`) keeps what the hunt's start wrote.
  -- HUNT-ITINERARY: ...or the one the player's Stop ended no longer ago than the rule's grace (its count at that Stop).
  if new.active_kind = 'combat' and old.active_kind is distinct from 'combat' then
    new.last_activity_left := case
      when old.active_id is not null and old.active_kind = new.last_activity_kind and old.active_id = new.last_activity_id
      then public.hr_activity_left(old.user_id, old.slot, old.active_kind, old.active_id, old.active_left)
      when old.last_activity_stopped_at is not null
           and old.last_activity_stopped_at >= now() - make_interval(secs => (select r.job_grace_s from public.hr_hunt_after_rule r where r.id))
      then public.hr_activity_left(old.user_id, old.slot, old.last_activity_kind, old.last_activity_id, old.last_activity_left) end;
    new.last_activity_stopped_at := null;
  end if;
  return new;
end $$;

-- ── §5 THE HUNT'S END RUNS THE HUNT'S CHOICE (hr_hunt_resume, restated whole) ─
-- 2027-04-24-bench-resume.sql's body; HUNT-ITINERARY marks what is new. The signature is the same: the settle is not touched.
create or replace function public.hr_hunt_resume(p_user uuid, p_slot int, p_session uuid, p_end text, p_ev0 bigint)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare
  v_lk text; v_li text; v_ll int; v_home timestamptz; v_ok boolean; v_plan jsonb; v_left int; v_why text;
  -- HUNT-ITINERARY: the hunt's frozen choice, what its row runs, and what came of it
  v_def text; v_choice text; v_skill text; v_c public.hr_hunt_after_choices%rowtype; v_done jsonb;
begin
  -- AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  if p_end is null or not coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = p_end), false) then
    return; end if;
  select ps.last_activity_kind, ps.last_activity_id, ps.last_activity_left into v_lk, v_li, v_ll
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0)),
         h.after_choice, h.after_skill
    into v_home, v_choice, v_skill from public.hunt_sessions h where h.id = p_session;
  -- HUNT-ITINERARY: a hunt entered before this file, or one whose row is gone, takes the default.
  select r.default_choice into v_def from public.hr_hunt_after_rule r where r.id;
  select * into v_c from public.hr_hunt_after_choices c where c.choice = coalesce(v_choice, v_def);
  if not found then select * into v_c from public.hr_hunt_after_choices c where c.choice = v_def; end if;
  if v_c.runs = 'nothing' then
    -- HUNT-ITINERARY: the player chose to wait in town
    v_why := 'chose_wait';
  elsif v_c.runs = 'training' then
    -- HUNT-ITINERARY: a training session is opened by its ONE door in its own transaction (hr_hunt_after_start), never here
    v_why := 'pending';
  elsif v_lk is null or v_home is null then v_why := 'none';
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
  -- HUNT-ITINERARY: ...and the choice, when it is not the default (a default hunt's row is byte for byte the old one).
  insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
    values (p_user, p_slot, 'hunt', 'resume',
            jsonb_build_object('reason', p_end, 'resumed', v_ok, 'kind', case when v_c.runs = 'job' then v_lk end,
                               'id', case when v_c.runs = 'job' then v_li end, 'at', v_home)
              || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end
              || case when v_why is not null then jsonb_build_object('why', v_why) else '{}'::jsonb end
              || case when v_c.choice is distinct from v_def then jsonb_build_object('plan', v_c.choice) || case when v_c.runs = 'training' then jsonb_build_object('skill', v_skill) else '{}'::jsonb end
                      else '{}'::jsonb end, p_session);
  update public.hunt_session_events e
     set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home)
                            || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end else null end)
   where e.session_id = p_session and e.id > p_ev0 and e.type = 'ended';
  -- HUNT-ITINERARY: what came of the hunt's choice, on the hunt (the envelope's hunt_after.last reads it).
  v_done := case
    when v_ok then jsonb_build_object('state', 'resumed', 'kind', v_lk, 'id', v_li, 'at', v_home)
                   || case when v_left is not null then jsonb_build_object('left', v_left) else '{}'::jsonb end
    when v_c.runs = 'training' then jsonb_build_object('state', 'pending', 'skill', v_skill, 'place', v_c.place, 'at', v_home)
    else jsonb_build_object('state', 'waited', 'why', v_why, 'at', v_home)
           || case when v_c.runs = 'job' and v_lk is not null then jsonb_build_object('kind', v_lk, 'id', v_li) else '{}'::jsonb end end;
  update public.hunt_sessions set after_done = v_done where id = p_session;
end $$;

-- ── §6 THE DEFERRED START: A TRAINING CHOICE, THROUGH THE ONE DOOR, ONCE ─────
create or replace function public.hr_hunt_after_start(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_s public.hunt_sessions%rowtype; v_c public.hr_hunt_after_choices%rowtype; v_q jsonb; v_r jsonb; v_done jsonb; v_why text;
  v_price bigint; v_sub text; v_claims text;
  v_key constant uuid := md5('hunt_after:' || p_session::text)::uuid;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update skip locked;
  if not found or v_s.after_done->>'state' is distinct from 'pending' then return null; end if;
  select * into v_c from public.hr_hunt_after_choices c where c.choice = v_s.after_choice and c.runs = 'training';
  if not found then v_why := 'no_training';
  -- THE HERO MUST STILL BE WHERE THE HUNT LEFT IT: idle in town, with no hunt since. A player who came back and did something
  -- else has made their own choice.
  elsif exists (select 1 from public.hunt_sessions h where h.user_id = v_s.user_id and h.slot = v_s.slot and h.entered_at > v_s.entered_at)
        or coalesce((select ps.active_kind from public.player_state ps where ps.user_id = v_s.user_id and ps.slot = v_s.slot), 'gone') <> 'idle' then
    v_why := 'moved_on';
  else
    -- THE SERVER'S PRICE, on the server's clock, for the skill the hunt froze. Never a number a client sent.
    v_q := public.hr_training_quote(v_s.user_id, v_s.slot, v_s.after_skill, v_c.place);
    if v_q is null then v_why := 'no_training';
    elsif not (v_q->>'available')::boolean then v_why := v_q->>'why';
    else
      v_price := (v_q->>'price')::bigint;
      -- hr_training_start is the ONE door: called as the hunt's own hero (its JWT subject for this call, then put back).
      v_sub := current_setting('request.jwt.claim.sub', true); v_claims := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claim.sub', v_s.user_id::text, true),
              set_config('request.jwt.claims', jsonb_build_object('sub', v_s.user_id, 'role', 'authenticated')::text, true);
      v_r := public.hr_training_start(v_s.slot, v_s.after_skill, v_c.place, v_price, v_key);
      perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);
      if coalesce(v_r->>'ok', 'false') = 'true' then
        v_done := jsonb_build_object('state', 'started', 'skill', v_s.after_skill, 'place', v_c.place, 'fee', v_price,
                                     'session', v_r->'session_id', 'at', now());
      elsif v_r->>'error' in ('rate_limited', 'quote_changed', 'intent_in_flight') and v_s.ended_at > now() - interval '10 minutes' then
        return jsonb_build_object('state', 'pending', 'why', v_r->>'error');   -- the next sweep tries again
      else
        v_why := coalesce(v_r->>'error', 'refused');
      end if;
    end if;
  end if;
  if v_done is null then
    v_done := jsonb_build_object('state', 'waited', 'why', v_why, 'skill', v_s.after_skill, 'place', v_c.place, 'at', now())
      || case when coalesce(v_r->>'fee', v_q->>'price') is not null then jsonb_build_object('fee', coalesce((v_r->>'fee')::bigint, (v_q->>'price')::bigint)) else '{}'::jsonb end
      || case when v_r ? 'purse' then jsonb_build_object('purse', v_r->'purse') else '{}'::jsonb end
      || case when v_q ? 'need' then jsonb_build_object('need', v_q->'need', 'level', v_q->'level') else '{}'::jsonb end;
  end if;
  update public.hunt_sessions set after_done = v_done where id = p_session;
  -- THE PLAN'S OUTCOME, journalled (no gold: the fee is hr_training_start's own row). The hunt is named in meta, never in
  -- session_id: a session-stamped row folds into the hunt's own tally.
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_s.user_id, v_s.slot, 'hunt', 'after_hunt', v_done || jsonb_build_object('hunt_session', p_session, 'plan', v_s.after_choice));
  return v_done;
end $fn$;

create or replace function public.hr_hunt_after_sweep(p_limit int default 50)
returns int language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select s.id from public.hunt_sessions s
               where (s.after_done->>'state') = 'pending' and s.ended_at is not null
               order by s.ended_at limit greatest(1, least(coalesce(p_limit, 50), 500)) loop
    begin
      if public.hr_hunt_after_start(v_id) is not null then v_n := v_n + 1; end if;
    exception when others then
      -- one hero's start can never stop the others': the hunt stays pending and the next minute tries again
      raise warning 'hr_hunt_after_sweep: % for hunt %', sqlerrm, v_id;
    end;
  end loop;
  return v_n;
end $fn$;

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise notice 'hunt-itinerary §6: pg_cron absent here; hr-hunt-after is not scheduled'; return; end if;
  perform public.hr_cron_ensure('hr-hunt-after', '* * * * *', 'select public.hr_hunt_after_sweep(50)');
end $mig$;

-- ── §7 GRANTS AND THE CLIENT BASELINE ────────────────────────────────────────
revoke execute on function public.hr_hunt_after_set(int, text, text, uuid) from public;
revoke execute on function public.hr_hunt_after_set(int, text, text, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_after_set(int, text, text, uuid) to authenticated;
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_hunt_after_job(uuid,integer)', 'public.hr_hunt_after_section(uuid,integer)', 'public.hr_hunt_after_freeze()',
                               'public.hr_last_activity_note()', 'public.hr_hunt_resume(uuid,integer,uuid,text,bigint)',
                               'public.hr_hunt_after_start(uuid)', 'public.hr_hunt_after_sweep(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hunt_after_set';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_after_set', 'p_slot integer, p_choice text, p_skill text, p_idem uuid', 'authenticated',
   'added 2027-04-25 (lane/c-hunt-itinerary): stores what the caller''s own hero does when a hunt ends on its own (a row of hr_hunt_after_choices and, for training, a skill its place trains); moves no value; the paid start is hr_training_start at the server''s price, later, once; pre-EA Security list')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
-- Fails on the pre-images: (b) no verb stores a choice; (c) a hunt carries none; (d) a bench the client stopped before Enter is
-- not picked up; (e)-(g) every hunt goes back to the job whatever was picked and nothing starts training. Both doors of the
-- settle and the engine's spend are tests/hunt-itinerary.mjs on the replayed chain.
do $chk$
declare
  c_u    constant uuid := '000000c0-0000-4000-a000-0000a17e0425';
  k      constant text := '000000c0-0000-4000-b000-a17e0425';
  c_hunt constant text := 'mill_cellar';
  v jsonb; v_s text; v_role text; v_i int := 0; v_n int; v_ver bigint;
  v_bench text; v_in text; v_need bigint; v_node text; v_skill text; v_fee bigint; v_sid uuid; v_tid uuid; v_g0 bigint;
  v_st record; v_done jsonb; v_meta jsonb; r record;
begin
  -- (a) THE SHAPE: one client verb, signed-in callers only; every other body is the owner's; the section and the cron job stand;
  --     the freeze stands on hunt_sessions; no policy lets a client write a choice; hygiene is green.
  if has_function_privilege('anon', 'public.hr_hunt_after_set(integer,text,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_after_set(integer,text,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_after_set(integer,text,text,uuid)', 'execute') then
    raise exception 'hunt-itinerary §8(a): the grants on hr_hunt_after_set are wrong'; end if;
  foreach v_s in array array['public.hr_hunt_after_job(uuid,integer)', 'public.hr_hunt_after_section(uuid,integer)', 'public.hr_hunt_after_freeze()',
                             'public.hr_last_activity_note()', 'public.hr_hunt_resume(uuid,integer,uuid,text,bigint)',
                             'public.hr_hunt_after_start(uuid)', 'public.hr_hunt_after_sweep(integer)'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) and has_function_privilege(v_role, v_s, 'execute') then
        raise exception 'hunt-itinerary §8(a): % can execute %', v_role, v_s; end if;
    end loop;
    if not exists (select 1 from pg_proc p where p.oid = v_s::regprocedure and p.proconfig @> array['search_path=public, pg_catalog']) then
      raise exception 'hunt-itinerary §8(a): % has no pinned search_path', v_s; end if;
  end loop;
  if not exists (select 1 from public.hr_state_sections where key = 'hunt_after' and fn = 'hr_hunt_after_section') then
    raise exception 'hunt-itinerary §8(a): the hunt_after section is not registered'; end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and t.tgname = 'hr_hunt_after_freeze' and t.tgenabled = 'O') then
    raise exception 'hunt-itinerary §8(a): the freeze is not on hunt_sessions'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-hunt-after') then
    raise exception 'hunt-itinerary §8(a): the sweep is not scheduled'; end if;
  perform public.hr_assert_grant_hygiene(true);

  begin
    -- THE PROBE: one hero at the yard's Level with a purse, a level-1 one-input bench, a level-1 gathering node, a yard skill.
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'hunt-itinerary §8 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-itinerary §8-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null,
           level_xp = public.hr_char_xp_for_level((select min_level from public.hr_training_rules where id))
     where user_id = c_u and slot = 0;
    select b.key, i.key, (i.value #>> '{}')::bigint into v_bench, v_in, v_need
      from jsonb_each(public.hr_bench_inputs()) b cross join lateral jsonb_each(b.value) i
     where (select count(*) from jsonb_object_keys(b.value)) = 1
       and exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key and coalesce(a.req_lv, 1) <= 1)
     order by b.key limit 1;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1 order by a.activity_id limit 1;
    select g.skill into v_skill from public.hr_training_grounds g
      join public.hr_hunt_after_choices c on c.runs = 'training' and c.place = g.place where c.choice = 'train' order by g.skill limit 1;
    if v_bench is null or v_node is null or v_skill is null then
      raise exception 'hunt-itinerary §8-harness: no bench (%), node (%) or yard skill (%)', v_bench, v_node, v_skill; end if;

    -- (b) THE VERB: a forged choice or skill stores nothing; a good one is stored and replayed once.
    for r in select * from (values ('nap', null, 'bad_choice'), ('train', null, 'bad_skill'), ('train', 'cooking', 'bad_skill'),
                                   ('wait', 'melee', 'bad_skill'), ('job', 'melee', 'bad_skill')) t(choice, skill, want) loop
      v_i := v_i + 1;
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_hunt_after_set(0, r.choice, r.skill, (k || lpad(v_i::text, 4, '0'))::uuid);
      if v->>'error' is distinct from r.want or (select ps.after_choice from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is not null then
        raise exception 'hunt-itinerary §8(b): % / % answered %, wanted %', r.choice, r.skill, v, r.want; end if;
    end loop;
    v_i := v_i + 1;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_after_set(0, 'train', v_skill, (k || lpad(v_i::text, 4, '0'))::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'hunt_after'->>'choice' is distinct from 'train' or v->'hunt_after'->>'skill' is distinct from v_skill then
      raise exception 'hunt-itinerary §8(b): a good choice answered %', v; end if;
    if (public.hr_hunt_after_set(0, 'train', v_skill, (k || lpad(v_i::text, 4, '0'))::uuid))->>'ok' is distinct from 'true'
       or (public.hr_hunt_after_set(0, 'wait', null, (k || lpad(v_i::text, 4, '0'))::uuid))->>'error' is distinct from 'intent_mismatch' then
      raise exception 'hunt-itinerary §8(b): a replayed key did not answer once, or a reused key was not refused'; end if;

    -- (c)-(g) THROUGH THE REAL ENTER AND THE REAL END, one hunt a row. `choice` / `skill`: what the hero picked (null: never
    -- picked). `job`: the town job before the hunt: bench (running, counted 7 of a stock of 20), stopped (the same bench, ended
    -- by the player's own Stop through hr_apply a moment before Enter), finished (the same, ended by an engine accrual), old (the
    -- player's Stop, long ago), gather (a node), or none. `gold`: the purse at the end. Wanted: the hunt's frozen choice, what
    -- came of it (and why), and where the hero stands.
    for r in select * from (values
      ('never picked, a bench running',            null,    null,    'bench',    1000000, 'stamina', 'job',   'resumed', null,                'artisan'),
      ('never picked, the client stopped it',      null,    null,    'stopped',  1000000, 'stamina', 'job',   'resumed', null,                'artisan'),
      ('never picked, the engine finished it',     null,    null,    'finished', 1000000, 'stamina', 'job',   'waited',  'no_count',          'idle'),
      ('never picked, stopped long ago',           null,    null,    'old',      1000000, 'stamina', 'job',   'waited',  'no_count',          'idle'),
      ('never picked, gathering',                  null,    null,    'gather',   1000000, 'died',    'job',   'resumed', null,                'gather'),
      ('wait in town, a bench running',            'wait',  null,    'bench',    1000000, 'stamina', 'wait',  'waited',  'chose_wait',        'idle'),
      ('train, gold for the hour',                 'train', v_skill, 'bench',    1000000, 'stamina', 'train', 'started', null,                'combat'),
      ('train, too little gold',                   'train', v_skill, 'none',     0,       'stamina', 'train', 'waited',  'insufficient_gold', 'idle'),
      ('train, but the player left the hunt',      'train', v_skill, 'bench',    1000000, 'left',    'train', null,      null,                'idle')
    ) t(tag, choice, skill, job, gold, why_end, want_choice, want_state, want_why, want_kind) loop
      v_i := v_i + 1;
      -- a clean hero: no open hunt, idle, the stock, the purse, the choice
      update public.hunt_sessions set ended_at = now(), end_reason = 'left' where user_id = c_u and slot = 0 and ended_at is null;
      update public.player_state set active_kind = 'idle', active_id = null, active_left = null, after_choice = r.choice, after_skill = r.skill,
             last_activity_kind = null, last_activity_id = null, last_activity_left = null, last_activity_stopped_at = null
       where user_id = c_u and slot = 0;
      delete from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_in;
      insert into public.player_inventory (user_id, slot, item_id, qty) values (c_u, 0, v_in, 20 * v_need);
      -- this block is ONE transaction where production runs one apply each: an earlier row's Stop is not this row's
      delete from public.player_intents where user_id = c_u and intent in ('set_activity:idle', 'accrue');
      perform public.hr_purse_move(c_u, 1000000 - public.hr_purse_of(c_u), 0);
      if r.job in ('bench', 'stopped', 'finished', 'old') then
        update public.player_state set active_kind = 'artisan', active_id = v_bench, active_left = 7, active_since = now(), accrued_to = now()
         where user_id = c_u and slot = 0;
      elsif r.job = 'gather' then
        update public.player_state set active_kind = 'gather', active_id = v_node, active_since = now(), accrued_to = now() where user_id = c_u and slot = 0;
      end if;
      if r.job in ('stopped', 'old', 'finished') then
        -- THE REAL WRITE PATH: hr_apply, as the edge calls it. A Stop is the statement `set_activity:idle`; the engine ending a
        -- run is an accrual that carries the idle.
        select version into v_ver from public.player_state where user_id = c_u and slot = 0;
        v := public.hr_apply(c_u, 0, v_ver, (k || lpad((9000 + v_i)::text, 4, '0'))::uuid,
               case when r.job = 'finished'
                    then jsonb_build_object('accrued_to', 'now', 'activity', jsonb_build_object('kind', 'idle'), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'accrue'))
                    else jsonb_build_object('activity', jsonb_build_object('kind', 'idle'), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'set_activity:idle')) end);
        if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-itinerary §8-harness (%): the stop through hr_apply answered %', r.tag, v; end if;
        select ps.active_kind, ps.last_activity_left, ps.last_activity_stopped_at into v_st from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
        if v_st.active_kind <> 'idle' or (r.job = 'finished') <> (v_st.last_activity_stopped_at is null)
           or (r.job <> 'finished' and v_st.last_activity_left is distinct from 7) then
          raise exception 'hunt-itinerary §8(d) (%): after the stop the hero is %, count %, stopped at %', r.tag, v_st.active_kind,
            v_st.last_activity_left, v_st.last_activity_stopped_at; end if;
        if r.job = 'old' then
          update public.player_state set last_activity_stopped_at = now() - interval '1 hour' where user_id = c_u and slot = 0;
        end if;
      end if;
      -- what the page would show for "back to the job", before Enter
      v := public.hr_hunt_after_job(c_u, 0);
      if (r.job in ('bench', 'stopped') and (v->>'kind' is distinct from 'artisan' or (v->>'left')::int is distinct from 7))
         or (r.job in ('finished', 'old', 'none') and v is not null) or (r.job = 'gather' and v->>'kind' is distinct from 'gather') then
        raise exception 'hunt-itinerary §8(d) (%): the job shown before Enter is %', r.tag, v; end if;
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_hunt_enter(0, c_hunt, '[]'::jsonb, 0, null, (k || lpad(v_i::text, 4, '0'))::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-itinerary §8-harness (%): entering answered %', r.tag, v; end if;
      select h.id into v_sid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
      -- (c) THE FREEZE: the hunt carries the hero's choice; a later pick does not move it.
      update public.player_state set after_choice = 'wait', after_skill = null where user_id = c_u and slot = 0;
      if (select h.after_choice from public.hunt_sessions h where h.id = v_sid) is distinct from r.want_choice
         or (select h.after_skill from public.hunt_sessions h where h.id = v_sid) is distinct from (case when r.want_choice = 'train' then v_skill end) then
        raise exception 'hunt-itinerary §8(c) (%): the hunt froze % / %', r.tag, (select h.after_choice from public.hunt_sessions h where h.id = v_sid),
          (select h.after_skill from public.hunt_sessions h where h.id = v_sid); end if;
      update public.player_state set after_choice = r.choice, after_skill = r.skill where user_id = c_u and slot = 0;
      -- the hunt: the purse it ends with; loot of the bench's input lands in the bag
      perform public.hr_purse_move(c_u, r.gold - public.hr_purse_of(c_u), 0);
      update public.player_inventory set qty = qty + 50 * v_need where user_id = c_u and slot = 0 and item_id = v_in;
      v_g0 := public.hr_purse_of(c_u);
      -- the end, the settle's step (7), then the minute's sweep
      perform public.hr_hunt_close(v_sid, r.why_end, now(), true);
      perform public.hr_hunt_resume(c_u, 0, v_sid, r.why_end, 0);
      v_n := public.hr_hunt_after_sweep(50);
      select h.after_done into v_done from public.hunt_sessions h where h.id = v_sid;
      select ps.active_kind, ps.active_id, ps.active_left into v_st from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
      if v_done->>'state' is distinct from r.want_state or v_done->>'why' is distinct from r.want_why or v_st.active_kind is distinct from r.want_kind then
        raise exception 'hunt-itinerary §8(e) (%): the hunt''s choice came to % and the hero is % %, wanted % / % / %', r.tag, v_done, v_st.active_kind,
          v_st.active_id, r.want_state, r.want_why, r.want_kind; end if;
      if r.want_state = 'resumed' and r.want_kind = 'artisan' and (v_st.active_id is distinct from v_bench or v_st.active_left is distinct from 7) then
        raise exception 'hunt-itinerary §8(e) (%): the bench came back as % with % left, not the 7 it had at Enter', r.tag, v_st.active_id, v_st.active_left; end if;
      -- (f) THE PAID START: the server's fee, once, journalled; a second sweep and a second start charge nothing more.
      if r.want_state = 'started' then
        v_fee := (v_done->>'fee')::bigint;
        select h.id into v_tid from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
        if v_fee is null or v_fee <= 0 or v_fee is distinct from public.hr_training_fee(public.hr_skill_level(v_skill, coalesce((select xp from public.player_skills
              where user_id = c_u and slot = 0 and skill_id = v_skill), 0))) or public.hr_purse_of(c_u) <> v_g0 - v_fee
           or v_tid is null or not exists (select 1 from public.hr_training_grounds g join public.hunt_sessions h on h.hunt_id = g.hunt_id where h.id = v_tid and g.skill = v_skill and g.place = 'yard') then
          raise exception 'hunt-itinerary §8(f) (%): the start charged % (purse % -> %) and opened %', r.tag, v_fee, v_g0, public.hr_purse_of(c_u), v_tid; end if;
        if (select count(*) from public.player_ledger l where l.user_id = c_u and l.kind = 'shop' and l.intent like 'training_start:%' and (l.meta->>'session')::uuid = v_tid and l.gold = -v_fee) <> 1
           or (select count(*) from public.player_ledger l where l.user_id = c_u and l.kind = 'hunt' and l.intent = 'after_hunt' and (l.meta->>'hunt_session')::uuid = v_sid) <> 1 then
          raise exception 'hunt-itinerary §8(f) (%): the fee or the plan''s outcome is not journalled once', r.tag; end if;
        if public.hr_hunt_after_sweep(50) <> 0 or public.hr_hunt_after_start(v_sid) is not null or public.hr_purse_of(c_u) <> v_g0 - v_fee then
          raise exception 'hunt-itinerary §8(f) (%): a second sweep or start ran again', r.tag; end if;
        -- A TRAINING SESSION NEVER TRAINS AGAIN UNASKED: its own frozen choice is the default.
        if (select h.after_choice from public.hunt_sessions h where h.id = v_tid) is distinct from 'job' then
          raise exception 'hunt-itinerary §8(f) (%): the training session froze %', r.tag, (select h.after_choice from public.hunt_sessions h where h.id = v_tid); end if;
      elsif public.hr_purse_of(c_u) <> v_g0 then
        raise exception 'hunt-itinerary §8(g) (%): gold moved (% -> %) with nothing started', r.tag, v_g0, public.hr_purse_of(c_u);
      end if;
      -- (g) TOO LITTLE GOLD SAYS SO: the fee the server wanted and the purse it found.
      if r.want_why = 'insufficient_gold' and ((v_done->>'fee')::bigint is null or (v_done->>'fee')::bigint <= 0 or (v_done->>'purse')::bigint is distinct from 0) then
        raise exception 'hunt-itinerary §8(g) (%): the refusal does not say the fee and the purse: %', r.tag, v_done; end if;
      -- a hunt the player left: nothing came of the choice, no row, no start
      if r.want_state is null and (v_done is not null or exists (select 1 from public.player_ledger l where l.session_id = v_sid and l.intent = 'resume')) then
        raise exception 'hunt-itinerary §8(g) (%): a hunt the player left ran its choice: %', r.tag, v_done; end if;
    end loop;
    raise exception using errcode = 'HRI25', message = 'hunt-itinerary §8 complete - rolling back';
  exception when sqlstate 'HRI25' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u) then
    raise exception 'hunt-itinerary §8: LEAKED a probe row'; end if;
  raise notice 'hunt-itinerary: a hunt carries its hero''s choice; back to the job (a bench the client stopped included), wait, or train at the server''s price once; a forged choice is refused; all green';
end $chk$;
