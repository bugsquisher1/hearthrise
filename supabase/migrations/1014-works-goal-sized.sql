-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1014-works-goal-sized.sql — THE TOWN WORKS' GOAL IS SIZED TO THE SERVER: 20,000 GOLD A WEEKLY ACTIVE ACCOUNT,
--   NEVER UNDER THE LEAST (lane/c-approved-rows, backend-architect, 2026-11-20; Tyler 2026-11-20, balance call 24-7; the economy dive,
--   docs/design/balance-program/24-economy.md Q9: "a playtest of ten opens its market in a week and a server of 1,000 in a day").
--
-- STATUS: supabase/migration-notes/1014-works-goal-sized.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1013-approved-rows-town-works-catalogue.generated.sql, which adds
--   hr_town_works.per_active and the least-goal stages (§0 refuses without them). Between the two, the 2027-03-04 bodies read the last
--   stage as a fixed goal of 250,000: a safe state on its own.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. ON THE EA SECURITY LIST (a shared
--   money surface: the gift verb's refusal reads the goal).
--
-- ── THE RULE ────────────────────────────────────────────────────────────────
-- A WEEKLY ACTIVE ACCOUNT (hr_weekly_actives_count, the one definition): an account any of whose heroes ENTERED A HUNT in the last 7 days
--   (hunt_sessions.entered_at: a hunt's start needs a server-authorized session, Tyler 2026-10-18; training and the Tower are hunt
--   sessions too) or holds a job it STARTED in the last 7 days (player_state.active_since on a pointer other than idle: gathering, a
--   bench). The server's clock only; a row stamped in the future is not counted. Each account once. No client sends a count.
-- THE GOAL (hr_town_works_goal) of a project with per_active > 0 is greatest(least, per_active x weekly actives), least being its last
--   stage as the catalogue writes it. A project with per_active 0 keeps its fixed goal. Each stage keeps its share of the goal
--   (hr_town_works_stages: stage k at at_k / at_last of it, floored; the last at the goal), so the lines, the map's art and the window
--   move with it. A project that is DONE (finished by a gift, or its total at or past today's goal) reads its total as its goal.
-- THE CLAMP: the goal moves at most once a UTC day (hr_town_works_size: the first Works read of the day sizes every project, under a
--   try-lock, so a giver never meets a goal that moves under the press); the count is held to 0..1,000,000 and the goal to 1e9.
-- DONE STAYS DONE (hr_town_works_size_to): a project whose total reached its goal keeps that goal when the server grows; a server that
--   shrinks under what was given makes it done at its total. Only the day's sizing writes hr_town_works_goals; only the gift verb still
--   writes the totals and the gifts (tests/town-works.mjs TW-ONLY), and a goal is still no buff (TW-NO-BUFF: no engine, XP, drop or price
--   reads it).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_town_works_goals          NEW. One row a sized project: the UTC day it was sized, the count, the goal. RLS on, no policy, no client
--                              grant. Written only by hr_town_works_size_to.
-- hr_weekly_actives_count(p_users uuid[] default null) -> int     NEW, owner-only, stable. The count (scoped to p_users for the probe).
-- hr_town_works_stages(p_at bigint[], p_goal bigint) -> bigint[] NEW, owner-only, immutable.
-- hr_town_works_goal(p_project text) -> bigint                     NEW, owner-only, stable. Null for an unknown project.
-- hr_town_works_size_to(p_actives int) -> int                       NEW, owner-only. Today's goals from a count; the projects sized.
-- hr_town_works_size() -> boolean                                   NEW, owner-only. Once a UTC day; true when it sized.
-- hr_town_works_give           RESTATED WHOLE. The goal and its stages come from hr_town_works_goal, read before the charge and AGAIN
--                              under the project's key (the day's sizing takes the same key). Refusal codes, answer shape, locks, journal
--                              and grants unchanged; `goal` and `stage` are the sized ones.
-- hr_town_works_view           RESTATED WHOLE. Sizes the day first (a failed sizing raises a WARNING and keeps yesterday's goal), then
--                              answers as before with the sized goal, `stage_at` the sized stages, `finished` when done.
-- hr_town_extras               RESTATED WHOLE. The map's stage on the sized stages.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- LOCK ORDER. The gift: hero, hr:sink:<uid>, the purse (hr_apply), then hr:works:<project>, as before. The sizing runs only inside the
--   window's read, which holds no hero, sink or purse lock: hr:works:size (a try-lock: a second reader at the turn of the day keeps
--   yesterday's goal rather than queue), then each project's hr:works:<project> while it sizes that project. No cycle.
-- A GIFT RACING THE SIZING either commits under the key first (the sizing then reads its total) or reads the new goal under the key and
--   is judged by it: a gift that no longer fits raises inside the charge's block and rolls back whole (the 2027-03-04 rule).
-- A second apply restates the same bodies (§0 accepts this file's own pins) and writes no row: byte-identical. The §4 probe is rolled back.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- No new client door: the client surface stays hr_town_works_give and hr_town_works_view. The new inputs are the server's own rows. The
--   one lever a player holds is to BE active: alt accounts on the allowlist raise the goal by 20,000 each (they cannot lower it under the
--   least); the count is the server's, the gift cap per account and per day is unchanged. For the EA Security review.
--
-- ── COST AT 100x (2,000 accounts, ~8,000 heroes, hunt_sessions keeps 20 a hero: ~160,000 rows) ──
-- The count runs ONCE a UTC day: one scan of hunt_sessions (no index on entered_at, so no write cost on the hunt door) and the working
--   heroes' partial index (player_state_playing). The window's read adds one primary-key probe a project to see that today stands. The
--   map's read (hr_town_view, every 2 s a viewer) adds one primary-key probe of hr_town_works_goals a project. One row a project.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Restate the three bodies from 2027-03-04-town-works.sql (§0's pre pins), drop the five functions and hr_town_works_goals. With per_active
--   left in the catalogue the 2027-03-04 bodies read the least as a fixed goal. Nothing given moves either way.
-- EDGE: none (no engine or edge file reads the Works: TW-NO-BUFF). CLIENT: none needed; the Works tab and the Weighhouse read the server's
--   goal, stages and finish field by field (src/session/town-intents.js parseWorks).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
-- Each body is the 2027-03-04-town-works.sql image or this file's own (a second apply): md5 of prosrc with carriage returns removed.
do $mig$
declare v_md5 text; v_fn text; v_pre text; v_own text;
begin
  if to_regclass('public.hr_town_works') is null or to_regclass('public.town_works_totals') is null or to_regclass('public.town_works_gifts') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.player_state') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_town_works' and column_name = 'per_active') then
    raise exception 'PRECONDITION: apply 1013-approved-rows-town-works-catalogue.generated.sql first (hr_town_works.per_active)'; end if;
  if to_regprocedure('public.hr_town_works_stage(bigint[],bigint)') is null or to_regprocedure('public.hr_town_works_fault(bigint,bigint,bigint,bigint,bigint)') is null
     or to_regprocedure('public.hr_town_notice(text,text)') is null then
    raise exception 'PRECONDITION: the 2027-03-04 Works helpers are missing'; end if;
  foreach v_fn in array array['hr_town_works_give(integer,text,bigint,uuid)|81c2e848121f75eb4efc94d54d73d27e|d550d5b6fcf9cc665902b1501368b9fd',
                              'hr_town_works_view(integer)|ccc2c469606ed1f2eaa901774ba3b698|2fb7da948beced35e51139673e80d8a9',
                              'hr_town_extras(text)|5266cd98e0a1b6e0fb1ee740a9a86dd6|eab081845387cf6b9cb91a307f4bace5'] loop
    v_pre := split_part(v_fn, '|', 2); v_own := split_part(v_fn, '|', 3);
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.' || split_part(v_fn, '|', 1));
    if v_md5 is null then raise exception 'PIN: % is missing', split_part(v_fn, '|', 1); end if;
    if v_md5 is distinct from v_pre and v_md5 is distinct from v_own then
      raise exception 'PIN: % is neither the 2027-03-04 image (%) nor this file''s own (%): md5 % - another file moved it; re-pin',
        split_part(v_fn, '|', 1), v_pre, v_own, v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE DAY'S GOALS ───────────────────────────────────────────────────────
create table if not exists public.hr_town_works_goals (
  project_id text        primary key references public.hr_town_works (project_id) on delete cascade,
  day        date        not null,
  actives    int         not null check (actives between 0 and 1000000),
  goal       bigint      not null check (goal between 1 and 1000000000),
  at         timestamptz not null default now()
);
comment on table public.hr_town_works_goals is
  '1014-works-goal-sized.sql: one row a sized Town Works project (hr_town_works.per_active > 0): the UTC day it was sized, the weekly active accounts counted, the goal. '
  'Written only by hr_town_works_size_to, once a UTC day. NEVER read by the engine, XP, drops or prices (tests/town-works.mjs TW-NO-BUFF).';
alter table public.hr_town_works_goals enable row level security;
revoke all on table public.hr_town_works_goals from public, anon, authenticated, service_role;

-- ── §2 THE HELPERS ───────────────────────────────────────────────────────────
-- THE ONE DEFINITION OF A WEEKLY ACTIVE ACCOUNT: a hunt entered, or a job started and still held, in the last 7 days of the server's clock.
create or replace function public.hr_weekly_actives_count(p_users uuid[] default null)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select count(*)::int from (
    select h.user_id from public.hunt_sessions h
     where h.entered_at > now() - interval '7 days' and h.entered_at <= now()
       and (p_users is null or h.user_id = any (p_users))
    union
    select ps.user_id from public.player_state ps
     where ps.active_kind <> 'idle' and ps.active_since > now() - interval '7 days' and ps.active_since <= now()
       and (p_users is null or ps.user_id = any (p_users))
  ) a
$fn$;

-- THE STAGES A GOAL STANDS: stage k at at_k / at_last of the goal, floored; the last at the goal. A goal at or under the least keeps them.
create or replace function public.hr_town_works_stages(p_at bigint[], p_goal bigint)
returns bigint[] language sql immutable set search_path = public, pg_catalog as $fn$
  select case
    when coalesce(cardinality(p_at), 0) < 2 or p_at[cardinality(p_at)] <= 0 or p_goal is null or p_goal <= p_at[cardinality(p_at)] then p_at
    else (select array_agg(case when i = cardinality(p_at) then p_goal else floor(p_at[i]::numeric * p_goal / p_at[cardinality(p_at)])::bigint end order by i)
            from generate_subscripts(p_at, 1) i)
  end
$fn$;

-- THE GOAL OF A PROJECT NOW: its least, or today's sized goal over it; a DONE project (finished, or its total at or past that goal) reads its total.
create or replace function public.hr_town_works_goal(p_project text)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select case when t.finished_at is not null or coalesce(t.total, 0) >= x.goal then greatest(coalesce(t.total, 0), 1) else x.goal end
    from public.hr_town_works w
    cross join lateral (select case when w.per_active > 0
                                    then greatest(w.stage_at[cardinality(w.stage_at)],
                                                  coalesce((select g.goal from public.hr_town_works_goals g where g.project_id = w.project_id), 0))
                                    else w.stage_at[cardinality(w.stage_at)] end as goal) x
    left join public.town_works_totals t on t.project_id = w.project_id
   where w.project_id = p_project
$fn$;

-- TODAY'S GOALS FROM A COUNT, every sized project under its own key. DONE STAYS DONE: a total at or past the goal it had keeps that goal;
-- a server that shrank under what was given makes it done at its total. The projects sized.
create or replace function public.hr_town_works_size_to(p_actives int)
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_n     int := greatest(0, least(coalesce(p_actives, 0), 1000000));
  v_day   date := (now() at time zone 'utc')::date;
  r       record;
  v_old   bigint; v_total bigint; v_sized bigint; v_goal bigint; v_k int := 0;
begin
  for r in select w.project_id, w.per_active, w.stage_at[cardinality(w.stage_at)] as least_goal
             from public.hr_town_works w where w.per_active > 0 order by w.project_id loop
    perform pg_advisory_xact_lock(hashtextextended('hr:works:' || r.project_id, 0));
    v_old := (select g.goal from public.hr_town_works_goals g where g.project_id = r.project_id);
    v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = r.project_id), 0);
    v_sized := greatest(r.least_goal, least(1000000000::bigint, r.per_active * v_n));
    v_goal := case when v_old is not null and v_total >= v_old then v_old
                   when v_total >= v_sized then least(greatest(v_total, 1), 1000000000)
                   else v_sized end;
    insert into public.hr_town_works_goals as g (project_id, day, actives, goal, at)
    values (r.project_id, v_day, v_n, v_goal, now())
    on conflict (project_id) do update set day = excluded.day, actives = excluded.actives, goal = excluded.goal, at = excluded.at;
    v_k := v_k + 1;
  end loop;
  return v_k;
end $fn$;

-- ONCE A UTC DAY: true when this call sized the projects, false when today's goals stand or another caller is sizing them.
create or replace function public.hr_town_works_size()
returns boolean language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_day date := (now() at time zone 'utc')::date;
begin
  if not exists (select 1 from public.hr_town_works w where w.per_active > 0
                  and not exists (select 1 from public.hr_town_works_goals g where g.project_id = w.project_id and g.day = v_day)) then
    return false; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('hr:works:size', 0)) then return false; end if;
  if not exists (select 1 from public.hr_town_works w where w.per_active > 0
                  and not exists (select 1 from public.hr_town_works_goals g where g.project_id = w.project_id and g.day = v_day)) then
    return false; end if;
  perform public.hr_town_works_size_to(public.hr_weekly_actives_count(null));
  return true;
end $fn$;

-- ── §3 THE VERB, THE WINDOW'S READ AND THE MAP'S READ, ON THE SIZED GOAL ──────
create or replace function public.hr_town_works_give(p_slot int, p_project text, p_amount bigint, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid   uuid := auth.uid();
  v_p     public.hr_town_works%rowtype;
  v_verb  text; v_r jsonb; v_ver bigint; v_a jsonb; v_fault jsonb;
  v_goal  bigint; v_total bigint; v_after bigint; v_given bigint; v_k int;
  v_at0   bigint[];
  v_day   date := (now() at time zone 'utc')::date;
  v_by    bigint[] := array[0, 0, 0, 0, 0, 0]::bigint[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'bad_amount')); end if;
  if p_project is null or p_project !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_project')); end if;
  v_verb := 'town_works:' || p_project || ':' || p_amount;
  -- A RETRY of a decided key answers that decision and charges nothing again
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;
  -- THE CATALOGUE
  select * into v_p from public.hr_town_works w where w.project_id = p_project;
  if not found then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'not_a_project')); end if;
  if not public.hr_rate_ok(v_uid, 'town_works', v_p.per_minute, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO: its lock, its row
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('town_works', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE ACCOUNT'S DAY, under its key: two heroes pressing together read what's left in order
  perform public.hr_sink_lock(v_uid);
  v_given := public.hr_town_works_given_today(v_uid);
  -- THE GOAL, SIZED TO THE SERVER (1014-works-goal-sized.sql), and the stages it stands
  v_at0 := v_p.stage_at;
  v_goal := public.hr_town_works_goal(p_project);
  v_p.stage_at := public.hr_town_works_stages(v_at0, v_goal);
  v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);
  -- THE RULE, read before the charge, so the usual refusal charges nothing at all
  v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);
  if v_fault is not null then
    return public.hr_note_rejection('town_works', p_slot, v_fault || jsonb_build_object('ok', false, 'project', p_project)); end if;
  begin
    -- THE CHARGE: gold only, never an xp key and never an item. Exactly one journal row.
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_amount,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'town_works', 'project', p_project, 'map', v_p.map_id))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('town_works', p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- THE PROJECT'S KEY, LAST. A gift that no longer fits raises and rolls back whole: nobody pays for what the Works refused.
    perform pg_advisory_xact_lock(hashtextextended('hr:works:' || p_project, 0));
    -- the day's sizing takes this key too: the goal is read again under it
    v_goal := public.hr_town_works_goal(p_project);
    v_p.stage_at := public.hr_town_works_stages(v_at0, v_goal);
    v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);
    v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);
    if v_fault is not null then raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;
    v_after := v_total + p_amount;
    insert into public.town_works_totals as t (project_id, total, finished_at, updated_at)
    values (p_project, v_after, case when v_after >= v_goal then now() end, now())
    on conflict (project_id) do update set total = excluded.total, finished_at = excluded.finished_at, updated_at = excluded.updated_at;
    v_by[p_slot + 1] := p_amount;
    insert into public.town_works_gifts as g (project_id, user_id, gold, by_slot, day, day_gold, last_gift, last_at)
    values (p_project, v_uid, p_amount, v_by, v_day, p_amount, p_amount, now())
    on conflict (project_id, user_id) do update
      set gold = g.gold + excluded.gold,
          by_slot[p_slot + 1] = g.by_slot[p_slot + 1] + p_amount,
          day_gold = case when g.day = v_day then g.day_gold + p_amount else p_amount end,
          day = v_day, last_gift = p_amount, last_at = now();
    perform public.hr_gold_given_add(v_uid, p_slot, p_amount);
    -- EACH STAGE THIS GIFT CROSSED says so, once: only the key's holder moves the total
    for v_k in 2 .. cardinality(v_p.stage_at) loop
      if v_total < v_p.stage_at[v_k] and v_after >= v_p.stage_at[v_k] then
        perform public.hr_town_notice(v_p.name, v_p.stage_lines[v_k]);
      end if;
    end loop;
  exception when sqlstate 'HR943' then
    return public.hr_note_rejection('town_works', p_slot, v_fault || jsonb_build_object('ok', false, 'project', p_project));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'project', p_project, 'amount', p_amount, 'total', v_after, 'goal', v_goal,
    'stage', public.hr_town_works_stage(v_p.stage_at, v_after), 'given_today', v_given + p_amount, 'left_today', v_p.per_day - v_given - p_amount);
end $fn$;

create or replace function public.hr_town_works_view(p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid();
  v_p   public.hr_town_works%rowtype;
  v_g   public.town_works_gifts%rowtype;
  v_total bigint; v_finished timestamptz; v_goal bigint; v_given bigint; v_left bigint; v_day_left bigint; v_floor bigint; v_place int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'town_works_view', 60, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- TODAY'S GOAL (1014-works-goal-sized.sql): the first read of a UTC day sizes it; a failed sizing keeps yesterday's goal
  begin
    perform public.hr_town_works_size();
  exception when others then
    raise warning 'hr_town_works_view: sizing the goal failed, yesterday''s stands: %', sqlerrm;
  end;
  -- THE PROJECT ON SHOW: the first still being built, else the last that finished
  select w.* into v_p from public.hr_town_works w
    left join public.town_works_totals t on t.project_id = w.project_id
   order by coalesce(t.total, 0) >= public.hr_town_works_goal(w.project_id),
            case when coalesce(t.total, 0) >= public.hr_town_works_goal(w.project_id) then -w.ord else w.ord end
   limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  select t.total, t.finished_at into v_total, v_finished from public.town_works_totals t where t.project_id = v_p.project_id;
  v_total := coalesce(v_total, 0);
  v_goal := public.hr_town_works_goal(v_p.project_id);
  v_p.stage_at := public.hr_town_works_stages(v_p.stage_at, v_goal);
  v_left := greatest(v_goal - v_total, 0);
  v_given := public.hr_town_works_given_today(v_uid);
  v_day_left := greatest(v_p.per_day - v_given, 0);
  v_floor := least(v_p.min_gift, greatest(v_left, 1));
  select * into v_g from public.town_works_gifts g where g.project_id = v_p.project_id and g.user_id = v_uid;
  -- THIS ACCOUNT'S PLACE: an account with no hero left to show holds none
  if v_g.user_id is not null and public.hr_town_works_lead(v_uid, v_g.by_slot) is not null then
    select 1 + count(*)::int into v_place from public.town_works_gifts o
     where o.project_id = v_p.project_id
       and (o.gold > v_g.gold or (o.gold = v_g.gold and (o.last_at, o.user_id) < (v_g.last_at, v_g.user_id)))
       and public.hr_town_works_lead(o.user_id, o.by_slot) is not null;
  end if;
  return jsonb_build_object('ok', true, 'project', v_p.project_id, 'name', v_p.name, 'total', v_total, 'goal', v_goal, 'left', v_left, 'stage_at', to_jsonb(v_p.stage_at),
    'stage', public.hr_town_works_stage(v_p.stage_at, v_total), 'finished', v_left = 0,
    'min_gift', v_floor, 'per_day', v_p.per_day, 'given_today', v_given, 'left_today', v_day_left,
    -- the most this account can give right now, 0 when what's left today is under the smallest gift
    'max_gift', case when v_left > 0 and least(v_day_left, v_left) >= v_floor then least(v_day_left, v_left) else 0 end,
    'last_gift', v_g.last_gift, 'gold', coalesce(v_g.gold, 0), 'place', v_place,
    'plaque', public.hr_town_works_plaque(v_p.project_id, v_uid, v_p.plaque_top));
end $fn$;

create or replace function public.hr_town_extras(p_map text)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
  select coalesce(
    (select jsonb_build_object('works', jsonb_object_agg(w.project_id, public.hr_town_works_stage(w.stage_at, t.total)))
       from (select x.project_id, x.map_id, public.hr_town_works_stages(x.stage_at, public.hr_town_works_goal(x.project_id)) as stage_at
               from public.hr_town_works x) w
       left join public.town_works_totals t on t.project_id = w.project_id
      where w.map_id = p_map
     having count(*) > 0),
    '{}'::jsonb)
$fn$;

-- ── §4 GRANTS: THE NEW HELPERS ARE NO ONE'S ──────────────────────────────────
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_weekly_actives_count(uuid[])', 'public.hr_town_works_stages(bigint[],bigint)', 'public.hr_town_works_goal(text)',
                           'public.hr_town_works_size_to(integer)', 'public.hr_town_works_size()', 'public.hr_town_extras(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    foreach f in array array['public.hr_weekly_actives_count(uuid[])', 'public.hr_town_works_goal(text)', 'public.hr_town_works_size_to(integer)', 'public.hr_town_works_size()'] loop
      execute format('revoke execute on function %s from hr_engine', f);
    end loop;
  end if;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING, every probe rolled back ──
-- Probe accounts and a probe project of their own, so nothing here reads or counts a real player's row except the day's sizing in (g),
-- which the sentinel rolls back with everything else.
do $chk$
declare
  c_u   uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  c_p   constant text := 'zz_probe_sized';
  c_k   text := replace(gen_random_uuid()::text, '-', '');
  v     jsonb; v_map text; v_hunt text; v_i int; v_u uuid; f text; v_role text; v_n int; v_g bigint;
begin
  -- (a) THE STAGES: a goal four times the least stands every stage four times as far; one at or under the least keeps them; an odd goal still climbs.
  if public.hr_town_works_stages(array[0, 25000, 75000, 150000, 250000]::bigint[], 1000000) is distinct from array[0, 100000, 300000, 600000, 1000000]::bigint[]
     or public.hr_town_works_stages(array[0, 25000, 75000, 150000, 250000]::bigint[], 250000) is distinct from array[0, 25000, 75000, 150000, 250000]::bigint[]
     or public.hr_town_works_stages(array[0, 25000, 75000, 150000, 250000]::bigint[], 100) is distinct from array[0, 25000, 75000, 150000, 250000]::bigint[]
     or public.hr_town_works_stages(array[0, 1, 2, 3]::bigint[], 4) is distinct from array[0, 1, 2, 4]::bigint[] then
    raise exception 'works-goal §5(a): the stages do not keep their share of the goal'; end if;
  -- every sized project in the catalogue climbs at its least and at a goal past it
  if exists (select 1 from public.hr_town_works w, lateral (select public.hr_town_works_stages(w.stage_at, w.stage_at[cardinality(w.stage_at)] * 7 + 3) s) z
              where w.per_active > 0 and exists (select 1 from generate_subscripts(z.s, 1) i where i > 1 and z.s[i] <= z.s[i - 1])) then
    raise exception 'works-goal §5(a): a sized project''s stages stop climbing'; end if;
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  if v_map is null then raise exception 'works-goal §5: no main town'; end if;
  begin
    -- THE PROBES: four accounts, each made by the game's own verbs; a probe project of its own.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     where not exists (select 1 from public.hr_training_grounds t where t.hunt_id = g.hunt_id)
       and not exists (select 1 from public.hr_ground_session_modes m where m.hunt_id = g.hunt_id and m.mode_id <> 'hunt')
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    if v_hunt is null then raise exception 'works-goal §5-harness: no ground to enter'; end if;
    for v_i in 1 .. 4 loop
      v_u := c_u[v_i];
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_u, 'works-goal-sized §5 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'works-goal §5-harness: hr_create_character refused for %: %', v_i, v; end if;
      update public.player_state set active_kind = 'idle', active_id = null, active_since = null where user_id = v_u;
    end loop;

    -- (b) THE COUNT: A entered a hunt now; B holds a job it started now; C entered a hunt 8 days ago; D did nothing. A and B, once each.
    perform set_config('request.jwt.claim.sub', c_u[1]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[1], 'role', 'authenticated')::text, true);
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000b1')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'works-goal §5-harness: A entering % answered %', v_hunt, v; end if;
    perform set_config('request.jwt.claim.sub', c_u[3]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[3], 'role', 'authenticated')::text, true);
    delete from public.hr_rate_counters where user_id = c_u[3];
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000b3')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'works-goal §5-harness: C entering % answered %', v_hunt, v; end if;
    update public.hunt_sessions set entered_at = now() - interval '8 days' where user_id = c_u[3];
    update public.player_state set active_kind = 'idle', active_id = null, active_since = null where user_id = c_u[3];
    update public.player_state set active_kind = 'gather',
           active_id = (select a.activity_id from public.hr_activities a where a.kind = 'gather' order by a.activity_id limit 1),
           active_left = null, active_since = now(), accrued_to = now() where user_id = c_u[2];
    v_n := public.hr_weekly_actives_count(c_u);
    if v_n is distinct from 2 then raise exception 'works-goal §5(b): the four probes count %, want 2 (a hunt now, a job now; not 8 days ago, not nothing)', v_n; end if;
    update public.player_state set active_since = now() + interval '1 hour' where user_id = c_u[2];
    if public.hr_weekly_actives_count(c_u) is distinct from 1 then raise exception 'works-goal §5(b): a job stamped in the future counted'; end if;

    -- THE PROBE PROJECT: 1,000 a weekly active account, 30,000 at least, stages at a third and two thirds of it.
    insert into public.hr_town_works (project_id, map_id, ord, name, min_gift, per_day, per_minute, stage_at, stage_lines, plaque_top, per_active)
    values (c_p, v_map, 90002, 'The Probe', 100, 25000, 60, array[0, 10000, 20000, 30000]::bigint[], array[null, 'has its first.', 'has its second.', 'is finished.']::text[], 10, 1000);
    update public.account_wallet set gold = 1000000 where user_id = c_u[1];
    perform set_config('request.jwt.claim.sub', c_u[1]::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u[1], 'role', 'authenticated')::text, true);

    -- (c) THE GOAL FOLLOWS THE DAY'S SIZE: 10 actives read the least; 60 read 60,000 and stand the stages there, for the gift, the map and the line.
    if public.hr_town_works_goal(c_p) is distinct from 30000 then raise exception 'works-goal §5(c): unsized, the goal reads %', public.hr_town_works_goal(c_p); end if;
    perform public.hr_town_works_size_to(10);
    if public.hr_town_works_goal(c_p) is distinct from 30000 then raise exception 'works-goal §5(c): 10 actives read %, want the least 30,000', public.hr_town_works_goal(c_p); end if;
    perform public.hr_town_works_size_to(60);
    if public.hr_town_works_goal(c_p) is distinct from 60000 then raise exception 'works-goal §5(c): 60 actives read %, want 60,000', public.hr_town_works_goal(c_p); end if;
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_town_works_give(0, c_p, 19000, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000c1')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'goal')::bigint <> 60000 or (v->>'stage')::int <> 0 then
      raise exception 'works-goal §5(c): 19,000 of a 60,000 goal answered % (its first stage is 20,000 now, not 10,000)', v; end if;
    if (select count(*) from public.chat_messages where from_name = 'The Probe' and body = 'has its first.') <> 0 then
      raise exception 'works-goal §5(c): the first line spoke at the least''s stage, not the sized one'; end if;
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_town_works_give(0, c_p, 1000, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000c2')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'stage')::int <> 1 then raise exception 'works-goal §5(c): the gift to 20,000 answered %', v; end if;
    if (select count(*) from public.chat_messages where channel = 'system' and from_id is null and from_name = 'The Probe' and body = 'has its first.') <> 1 then
      raise exception 'works-goal §5(c): crossing the sized first stage did not speak once as the town'; end if;
    if (public.hr_town_extras(v_map)->'works'->>c_p)::int is distinct from 1 then raise exception 'works-goal §5(c): the map reads %', public.hr_town_extras(v_map); end if;

    -- (d) THE SERVER SHRINKS: under the total the goal falls to the least; past it, the project is DONE at its total, and stays done when it grows.
    perform public.hr_town_works_size_to(15);
    if public.hr_town_works_goal(c_p) is distinct from 30000 then raise exception 'works-goal §5(d): 15 actives read %, want 30,000', public.hr_town_works_goal(c_p); end if;
    update public.town_works_totals set total = 35000 where project_id = c_p;
    perform public.hr_town_works_size_to(20);
    if public.hr_town_works_goal(c_p) is distinct from 35000 or (select goal from public.hr_town_works_goals where project_id = c_p) is distinct from 35000 then
      raise exception 'works-goal §5(d): past what was given the goal reads %, want done at 35,000', public.hr_town_works_goal(c_p); end if;
    perform public.hr_town_works_size_to(500);
    if public.hr_town_works_goal(c_p) is distinct from 35000 then raise exception 'works-goal §5(d): a done project reopened at %', public.hr_town_works_goal(c_p); end if;
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_town_works_give(0, c_p, 100, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000c3')::uuid);
    if v->>'error' is distinct from 'works_done' then raise exception 'works-goal §5(d): a gift to a done project answered %', v; end if;
    if (public.hr_town_extras(v_map)->'works'->>c_p)::int is distinct from 3 then raise exception 'works-goal §5(d): the map draws a done project at %', public.hr_town_extras(v_map); end if;

    -- (e) A GIFT'S FINISH STANDS: a project finished by the last coins keeps its finish when the server grows.
    delete from public.hr_town_works_goals where project_id = c_p;
    delete from public.town_works_totals where project_id = c_p;
    perform public.hr_town_works_size_to(10);
    insert into public.town_works_totals (project_id, total, updated_at) values (c_p, 29000, now());
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_town_works_give(0, c_p, 1000, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000c4')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'total')::bigint <> 30000 or (select finished_at from public.town_works_totals where project_id = c_p) is null then
      raise exception 'works-goal §5(e): the last coins answered % and the finish was not stamped', v; end if;
    perform public.hr_town_works_size_to(100);
    if public.hr_town_works_goal(c_p) is distinct from 30000 then raise exception 'works-goal §5(e): a finished project reopened at %', public.hr_town_works_goal(c_p); end if;

    -- (f) A GIFT IS JUDGED BY TODAY'S GOAL: 2,000 left at 32 actives; once the day's goal falls to leave 500, a 1,000 gift is refused
    --     works_short and pays nothing. (The same read under the project's key judges a gift that races the sizing: TW-LOST and
    --     tests/town-shows-race.mjs prove that order on real backends.)
    delete from public.hr_town_works_goals where project_id = c_p;
    delete from public.town_works_totals where project_id = c_p;
    perform public.hr_town_works_size_to(32);
    insert into public.town_works_totals (project_id, total, updated_at) values (c_p, 30000, now());
    if public.hr_town_works_goal(c_p) is distinct from 32000 then raise exception 'works-goal §5(f)-harness: the goal reads %', public.hr_town_works_goal(c_p); end if;
    update public.hr_town_works_goals set goal = 30500 where project_id = c_p;
    v_g := public.hr_purse_of(c_u[1]);
    delete from public.hr_rate_counters where user_id = c_u[1];
    v := public.hr_town_works_give(0, c_p, 1000, (substr(c_k, 1, 8) || '-0000-4000-a000-0000000000c5')::uuid);
    if v->>'error' is distinct from 'works_short' or (v->>'left')::bigint <> 500 or public.hr_purse_of(c_u[1]) <> v_g then
      raise exception 'works-goal §5(f): over a goal that fell answered % (purse % -> %)', v, v_g, public.hr_purse_of(c_u[1]); end if;

    -- (g) ONCE A UTC DAY: the first sizing of the day sizes every sized project at the server's own count; the second stands.
    delete from public.hr_town_works_goals;
    if public.hr_town_works_size() is distinct from true then raise exception 'works-goal §5(g): the day''s first sizing did not size'; end if;
    if public.hr_town_works_size() is distinct from false then raise exception 'works-goal §5(g): a second sizing the same day sized again'; end if;
    if exists (select 1 from public.hr_town_works w where w.per_active > 0
                and not exists (select 1 from public.hr_town_works_goals g where g.project_id = w.project_id
                                 and g.day = (now() at time zone 'utc')::date and g.actives = least(public.hr_weekly_actives_count(null), 1000000))) then
      raise exception 'works-goal §5(g): a sized project is not at today''s count'; end if;
    -- the window's read answers on the sized goal
    v := public.hr_town_works_view(0);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'goal')::bigint is distinct from public.hr_town_works_goal(v->>'project')
       or (v->'stage_at'->>(jsonb_array_length(v->'stage_at') - 1))::bigint is distinct from (v->>'goal')::bigint then
      raise exception 'works-goal §5(g): the read answered %', v; end if;
    raise exception using errcode = 'HR945', message = 'works-goal §5 complete - rolling back';
  exception when sqlstate 'HR945' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = any (c_u)) or exists (select 1 from public.player_state where user_id = any (c_u))
     or exists (select 1 from public.hr_town_works where project_id = c_p) or exists (select 1 from public.town_works_totals where project_id = c_p) then
    raise exception 'works-goal §5: LEAKED a probe row'; end if;
  -- (h) GRANTS: the client surface is still the verb and the read; the goals and the helpers are no one's
  if not has_function_privilege('authenticated', 'public.hr_town_works_give(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_town_works_view(integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_works_give(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_works_view(integer)', 'execute') then
    raise exception 'works-goal §5(h): the verb''s or the read''s grants moved'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach f in array array['public.hr_weekly_actives_count(uuid[])', 'public.hr_town_works_stages(bigint[],bigint)', 'public.hr_town_works_goal(text)',
                             'public.hr_town_works_size_to(integer)', 'public.hr_town_works_size()', 'public.hr_town_extras(text)'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'works-goal §5(h): % reaches %', v_role, f; end if;
    end loop;
    if has_table_privilege(v_role, 'public.hr_town_works_goals', 'select') or has_table_privilege(v_role, 'public.hr_town_works_goals', 'insert,update,delete') then
      raise exception 'works-goal §5(h): % reaches hr_town_works_goals', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_town_works_goals') then raise exception 'works-goal §5(h): a policy opens the goals'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_town_works_goals'::regclass) then raise exception 'works-goal §5(h): the goals have no RLS'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'works-goal-sized: the goal follows the server once a UTC day, the stages keep their share, done stays done, a racing gift is judged under the key; all green';
end $chk$;
