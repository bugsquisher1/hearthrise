-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-27-hearth-errand.sql — FEEDING THE HEARTH ONE FUEL IS AN ERRAND: THE HERO WALKS TO THE FIRE, THROWS IT, AND GOES BACK
--   TO WHAT IT WAS DOING (lane/c-hearth-feed-visit, backend-architect, 2026-11-16; Tyler the same day: feeding the Great Hearth
--   while fishing, "the hero didn't walk over or throw it like it used to, and stayed at its fishing spot").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §5. No value, rank or shared surface moves: the one fuel is burnt and paid by the engine's own
-- bench run, as before (hr_apply, the generated catalogue); this file decides only where the pointer and the body go next.
-- ON THE EA SECURITY LIST: it writes the activity pointer from a trigger.
-- EDGE: none (pack-edge --hash unmoved). CLIENT: src/shell/town-work.js (no armed Stop on an errand, no "You stopped" words) and
-- src/world/hearth-burn.js (the throw plays on the visit) ride the next release. Either half alone is safe: an old client's
-- armed Stop ends the restored job a moment later (today's outcome, never worse); a new client on the old server sees the run
-- end as before.
--
-- ── THE CAUSE (reproduced on local-world, then on the replayed chain: tests/inner-flame.mjs IF-5) ──────────────────────
-- "Fuel the hearth" on one fuel is a bench run of ONE (set_activity artisan fuel_<item>, count 1). The switch REPLACED the job
-- that was running: fishing stopped for good. The town put the body on a Hearth stand as 'work', but the one fuel burns in
-- 640 ms and the run ended on the next settle, about 3 s in; its idle note left the body where it stood ("it stopped"), and the
-- World throws a fuel bench's chunk only while the pointer still names the fuel (src/world/hearth-burn.js), so the ~25 s walk
-- arrived to nothing. The visit hold (2027-03-23-town-visit-hold.sql) covered a named fuel and a powder, never a bench run.
--
-- ── THE RULE (the Coordinator's call, the visit-hold design's own: a feed is a short visit) ────────────────────────────
-- An ERRAND is the pointer's move onto a Hearth run of ONE: kind artisan, an Inner Flame row of the generated catalogue,
-- active_left = 1 (hr_hearth_errand). Then:
--   THE JOB IT INTERRUPTS IS REMEMBERED (a gathering node, a bench and the count it still had to make). Nothing is remembered
--     from idle. An errand on an errand keeps the first one's job. An errand is never itself the job a hunt or a Stop goes back
--     to (last_activity_* keep the job's).
--   THE BODY VISITS THE FIRE: the note of that move names the errand (town_moves.errand), and the town's read sends the body to
--     the errand's station as a 'visit' (TOWN-VISIT holds it for the walk and the throw) however soon the run ends. A note read
--     after the longest such visit on its map (hr_town_visit_span) is over: the body goes on as before.
--   THE RUN ENDS AS ANY RUN ENDS (its one fuel burnt, or the fuel gone: the engine's `activity: idle`, on the owner's settle or
--     the world tick's), and the pointer goes BACK to the remembered job, now, with its count: fishing resumes where it was.
--     The town defers the job's placement while the visit holds; the visit's end walks the body back to the job's station.
--   THE PLAYER'S OWN STOP (set_activity idle, the statement hr_apply registered in this transaction) stops the hero, as every
--     Stop does. Another job or a hunt replaces the errand; a hunt started mid-errand remembers the job the errand interrupted,
--     with what it still had to make (BENCH-RESUME's count).
--   A job that may no longer run is not restored (its catalogue row gone, the skill below its level, a bench with no inputs left).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- player_state.errand_kind / errand_id / errand_left   NEW, NULL but during an errand. The job an errand interrupted and the
--   count it still had to make. Written only by the trigger hr_town_errand; read only by it. In no envelope section.
-- town_moves.errand text   NEW, NULL but on the note of a move onto an errand: that run's activity id.
-- hr_hearth_errand(kind, id, left) -> boolean   NEW, owner-only, stable. The one definition of an errand.
-- hr_town_visit_span(map, station) -> interval  NEW, owner-only, stable. The longest a visit to that station holds on that map:
--   hr_town_visit_hold of the farthest stand from it.
-- hr_town_errand()   NEW BEFORE UPDATE OF active_kind, active_id trigger on player_state. It is named to fire AFTER
--   hr_last_activity_note (PostgreSQL fires a table's triggers in name order), so it has the last word on last_activity_*; §5
--   asserts the order.
-- hr_town_note_move()     RESTATED WHOLE (2027-01-28-town-stands.sql's image + the errand's id on the note).
-- hr_town_moves_settle()  RESTATED WHOLE (2027-03-23-town-visit-hold.sql's image + the errand's visit). Every line of that image is
--   kept verbatim (tests/town-shows.mjs plants its TOWN-VISIT mutants on two of them).
-- ERROR TAXONOMY: none new. Nothing here is client-callable and nothing refuses.
--
-- ── CONCURRENCY AND IDEMPOTENCY ─────────────────────────────────────────────
-- Every pointer writer holds the hero's row lock (hr_apply's `for update` under hr_hunt_lock's key; hr_tick_settle's fence), and
-- the trigger runs inside that UPDATE, so the remember and the restore cannot interleave with another write of the pointer. A
-- replayed key never reaches the UPDATE (hr_apply `replayed`), so a restore happens once per landed end. The town half takes the
-- town's own lock (hr_town_lock), as before. No roll, no clock but now().
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- No new client verb, grant, policy or delta key. The restore moves no gold, item or XP: it points the hero back at a job it was
-- already running, re-checked against the catalogue, the skill's level and the inputs, and that job is then paid by the audited
-- engine path from its own watermark (active_since = now(): the errand's seconds pay nothing to the job). A player cannot write
-- the remembered job: the errand_* columns have no writer but this trigger, and the pointer it restores was the player's own.
-- The count restored is the job's own (never raised).
--
-- ── ROWS AND BYTES (100x players) ───────────────────────────────────────────
-- Three nullable columns on player_state (NULL on every row but an errand's, for its few seconds) and one on town_moves (a note is
-- deleted when read). No table, index or ledger row: an errand journals what a run of one always did (the switch's `admin` row,
-- the burn's one `craft` row). Per pointer move: one more trigger with two catalogue probes. Per town read with an errand note:
-- one hr_town_visit_span over the map's stands (a few hundred rows). Nothing per tick.
--
-- REVERSIBILITY: re-apply hr_town_note_move from 2027-01-28-town-stands.sql and hr_town_moves_settle from
-- 2027-03-23-town-visit-hold.sql (§0 pins their md5s), drop the trigger hr_town_errand and the functions hr_town_errand,
-- hr_hearth_errand and hr_town_visit_span; the four columns are inert. No row of any character needs repair.
-- ORDER: after 2027-04-25-hunt-itinerary.sql (last_activity_stopped_at, the player's-Stop probe this file mirrors). FREE against
-- every staged file that does not restate the two town bodies.
-- After apply: live-hash-drift wants hr_town_note_move and hr_town_moves_settle re-measured and the three new bodies tracked
-- (Coordinator). restore-census: no table, no seeded row.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS: FAIL CLOSED IF ANOTHER FILE MOVED A RESTATED BODY ─────────────────────────────────────────
-- md5 of pg_get_functiondef with whitespace runs as one (tests/live-hash-drift.baseline.json's own normalisation): each pre-image
-- is the value MEASURED ON PRODUCTION (2026-11-16, equal to the replay's), or this file's own (a second apply).
do $mig$
declare v_md5 text; r record;
begin
  if to_regclass('public.town_bodies') is null or to_regclass('public.town_moves') is null
     or to_regclass('public.hr_hunt_resumable_kinds') is null or to_regclass('public.hr_activities') is null
     or to_regprocedure('public.hr_town_visit_hold(double precision)') is null
     or to_regprocedure('public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.hr_town_station_for(text,text,text)') is null
     or to_regprocedure('public.hr_activity_left(uuid,integer,text,text,integer)') is null
     or to_regprocedure('public.hr_resume_has_inputs(uuid,integer,text,text)') is null
     or to_regprocedure('public.hr_last_activity_note()') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'town_bodies' and column_name = 'visit_until')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'last_activity_stopped_at') then
    raise exception 'PRECONDITION: apply 2027-03-23-town-visit-hold.sql, 2027-04-24-bench-resume.sql and 2027-04-25-hunt-itinerary.sql first'; end if;
  for r in select * from (values
    ('public.hr_town_note_move()', '4ad20f428da780560d0205aa77b158a3', 'b4009a1e7287492d5bea0dff6d78f528', '2027-01-28-town-stands.sql'),
    ('public.hr_town_moves_settle(text,integer,uuid,integer)', '4f1a44969b86ecd62a8b1e0884441be0', 'f816625c234b950add5862bae1ae1822', '2027-03-23-town-visit-hold.sql')
  ) p(sig, pre, post, src) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(r.sig::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMNS ───────────────────────────────────────────────────────────
alter table public.player_state add column if not exists errand_kind text;
alter table public.player_state add column if not exists errand_id text;
alter table public.player_state add column if not exists errand_left int;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_errand_ck' and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_errand_ck
      check ((errand_kind is null) = (errand_id is null)
             and (errand_kind is null or errand_kind in ('gather', 'artisan', 'training'))
             and (errand_id is null or errand_id ~ '^[a-z0-9_]{1,64}$')
             and (errand_left is null or (errand_kind is not null and errand_left between 1 and 100000)));
  end if;
end $mig$;
comment on column public.player_state.errand_kind is
  '2027-04-27-hearth-errand.sql: the job a Hearth errand (a run of one fuel) interrupted, with errand_id / errand_left (the count it still had to make); the errand''s end points the hero back at it. Written and read only by the trigger hr_town_errand. NULL but during an errand.';
alter table public.town_moves add column if not exists errand text;
comment on column public.town_moves.errand is
  '2027-04-27-hearth-errand.sql: on the note of a move onto a Hearth errand, that run''s activity id: the town''s read sends the body to its station as a visit (hr_town_moves_settle), however soon the run ends.';

-- ── §2 THE RULES ─────────────────────────────────────────────────────────────
-- THE ERRAND: a Hearth run of ONE. The Inner Flame rows of the generated catalogue are the Hearth's fuels (src/data/recipes.js
-- ARTISAN_RECIPES.inner_flame, one per src/data/hearth.js HEARTH_FUELS rung); "Fuel the hearth" sends a count of one.
create or replace function public.hr_hearth_errand(p_kind text, p_id text, p_left int)
returns boolean language sql stable set search_path = public, pg_catalog as $fn$
  select coalesce(p_kind = 'artisan' and p_left = 1, false)
     and exists (select 1 from public.hr_activities a
                  where a.kind = 'artisan' and a.activity_id = p_id and a.req_skill = 'inner_flame')
$fn$;
revoke execute on function public.hr_hearth_errand(text, text, int) from public, anon, authenticated, service_role;

-- THE LONGEST A VISIT TO p_station HOLDS ON p_map: TOWN-VISIT's rule over the farthest stand from it. A note older than this
-- names a visit that is already over.
create or replace function public.hr_town_visit_span(p_map text, p_station text)
returns interval language sql stable set search_path = public, pg_catalog as $fn$
  select public.hr_town_visit_hold(coalesce(max(sqrt(power(s.x - t.x, 2) + power(s.y - t.y, 2))), 0))
    from public.hr_town_stands s
    join public.hr_town_stands t on t.map_id = s.map_id and t.station_id = p_station
   where s.map_id = p_map
$fn$;
revoke execute on function public.hr_town_visit_span(text, text) from public, anon, authenticated, service_role;

-- ── §3 THE ERRAND ON THE POINTER: REMEMBER THE JOB, AND GO BACK TO IT ─────────
create or replace function public.hr_town_errand()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- HEARTH-ERRAND (2027-04-27-hearth-errand.sql). Fires after hr_last_activity_note (name order), so the remembered job is its word.
  -- (1) THE ERRAND STARTS: the pointer moves onto a Hearth run of one. It remembers the job it interrupts (an errand on an errand
  --     keeps the first one's; nothing from idle) and is never itself the job a hunt or a Stop goes back to.
  if public.hr_hearth_errand(new.active_kind, new.active_id, new.active_left) then
    if old.errand_kind is null then
      if old.active_id is not null and exists (select 1 from public.hr_hunt_resumable_kinds k where k.kind = old.active_kind) then
        new.errand_kind := old.active_kind;
        new.errand_id := old.active_id;
        new.errand_left := old.active_left;
      else
        new.errand_kind := null; new.errand_id := null; new.errand_left := null;
      end if;
    end if;
    new.last_activity_kind := old.last_activity_kind;
    new.last_activity_id := old.last_activity_id;
    new.last_activity_stopped_at := old.last_activity_stopped_at;
    return new;
  end if;
  if old.errand_kind is null then return new; end if;
  -- (2) THE ERRAND'S POINTER MOVES ON. Its run ended (the engine's idle: its fuel burnt, or gone): back to the job, now, with its
  --     count, if that job may still run. The player's own Stop (the statement hr_apply registered in this transaction, as
  --     hr_last_activity_note reads it) stops the hero. A hunt remembers the job the errand interrupted. Anything else replaces it.
  if new.active_kind = 'idle'
     and not exists (select 1 from public.player_intents i
                      where i.at = now() and i.user_id = old.user_id and i.slot = old.slot and i.intent = 'set_activity:idle')
     and exists (select 1 from public.hr_activities a where a.kind = old.errand_kind and a.activity_id = old.errand_id)
     and not exists (select 1 from public.hr_activities a
                      where a.kind = old.errand_kind and a.activity_id = old.errand_id and a.req_skill is not null and a.req_lv is not null
                        and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                       where sk.user_id = old.user_id and sk.slot = old.slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
     and public.hr_resume_has_inputs(old.user_id, old.slot, old.errand_kind, old.errand_id) then
    new.active_kind := old.errand_kind;
    new.active_id := old.errand_id;
    new.active_left := old.errand_left;
    new.active_since := now();
    new.last_activity_kind := old.errand_kind;
    new.last_activity_id := old.errand_id;
    new.last_activity_stopped_at := null;
  elsif new.active_kind = 'combat' then
    new.last_activity_left := case when new.last_activity_kind = old.errand_kind and new.last_activity_id = old.errand_id
      then public.hr_activity_left(old.user_id, old.slot, old.errand_kind, old.errand_id, old.errand_left) end;
  end if;
  new.errand_kind := null; new.errand_id := null; new.errand_left := null;
  return new;
end $fn$;
revoke execute on function public.hr_town_errand() from public, anon, authenticated, service_role;
drop trigger if exists hr_town_errand on public.player_state;
create trigger hr_town_errand before update of active_kind, active_id on public.player_state
  for each row when (old.active_kind is distinct from new.active_kind or old.active_id is distinct from new.active_id)
  execute function public.hr_town_errand();

-- ── §4 THE ERRAND IN TOWN: THE NOTE NAMES IT, THE READ SENDS THE BODY ON A VISIT (both restated whole; §0 pins them) ──────
-- THE NOTE (2027-01-28-town-stands.sql) + the errand's run on the note of a move onto one.
create or replace function public.hr_town_note_move()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- TOWN-STANDS (2027-01-28-town-stands.sql): note THAT the activity pointer changed (and the hunt it came back from);
-- the town's next read moves the body. An insert, nothing else: no lock, no wait, no read of any town table.
-- HEARTH-ERRAND (2027-04-27-hearth-errand.sql): a move onto an errand names its run, so the read sends the body on its visit.
begin
  insert into public.town_moves (user_id, slot, from_hunt, at, errand)
  values (new.user_id, new.slot,
          case when tg_op = 'UPDATE' and old.active_kind = 'combat' and new.active_kind is distinct from 'combat' then old.active_id end,
          now(),
          case when public.hr_hearth_errand(new.active_kind, new.active_id, new.active_left) then new.active_id end);
  return null;
end $fn$;

-- THE NOTES APPLIED (2027-03-23-town-visit-hold.sql) + an errand's note sends the body to its station on a visit.
create or replace function public.hr_town_moves_settle(p_map text, p_limit int, p_user uuid default null, p_slot int default null)
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  r record; v_n int := 0; v_kind text; v_id text; v_main text; v_from text; v_go text;
begin
  -- TOWN-VISIT (2027-03-23-town-visit-hold.sql): a visit holds its body until it ends; the reads end it.
  -- HEARTH-ERRAND (2027-04-27-hearth-errand.sql): a note naming an errand sends the body on its visit, however soon the run ended.
  if not exists (select 1 from public.town_moves m
                  where (p_user is null or (m.user_id = p_user and m.slot = p_slot)))
     and not exists (select 1 from public.town_bodies b
                      where b.map_id = p_map and b.why = 'visit' and b.visit_until <= now()
                        and (p_user is null or (b.user_id = p_user and b.slot = p_slot))) then return 0; end if;
  select map_id into v_main from public.hr_town_maps where main;
  perform public.hr_town_lock(p_map);
  for r in
    with chars as (
      select m2.user_id, m2.slot from public.town_moves m2
        left join public.town_bodies b on b.user_id = m2.user_id and b.slot = m2.slot
       where coalesce(b.map_id, v_main) = p_map
         and (p_user is null or (m2.user_id = p_user and m2.slot = p_slot))
       group by m2.user_id, m2.slot
       order by min(m2.id) limit p_limit
    ), picked as (
      delete from public.town_moves m using chars c
       where m.user_id = c.user_id and m.slot = c.slot
      returning m.user_id, m.slot, m.from_hunt, m.at, m.id, m.errand)
    select p.user_id, p.slot, (array_agg(p.from_hunt order by p.id desc) filter (where p.from_hunt is not null))[1] as from_hunt,
           max(p.at) as at, max(p.at) filter (where p.from_hunt is not null) as ended_at,
           (array_agg(p.errand order by p.id desc) filter (where p.errand is not null))[1] as errand,
           max(p.at) filter (where p.errand is not null) as errand_at
      from picked p group by p.user_id, p.slot
      order by min(p.id)
  loop
    select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = r.user_id and ps.slot = r.slot;
    if not found then continue; end if;
    -- HEARTH-ERRAND: the errand's station, while its visit can still be under way (a later read finds it over)
    v_go := case when r.errand is not null then public.hr_town_station_for(p_map, 'artisan', r.errand) end;
    if v_go is not null and r.errand_at + public.hr_town_visit_span(p_map, v_go) <= now() then v_go := null; end if;
    if v_kind = 'combat' or exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null) then
      -- A HUNTER IS NOT IN TOWN
      perform public.hr_town_release(r.user_id, r.slot);
      delete from public.town_seen where user_id = r.user_id and slot = r.slot;
    elsif v_go is not null then
      -- HEARTH-ERRAND: THE ERRAND'S VISIT: the walk to the fire (from the hunt's arrival, back from one) and the throw, held by
      -- TOWN-VISIT; its end sets the body down at the job the pointer went back to (THE ENDED VISITS, below). In town from the press.
      v_from := case when r.from_hunt is not null then public.hr_town_station_for(p_map, 'combat', r.from_hunt) end;
      insert into public.town_seen as ts (user_id, slot, seen_at) values (r.user_id, r.slot, r.errand_at)
        on conflict (user_id, slot) do update set seen_at = greatest(ts.seen_at, excluded.seen_at);
      perform public.hr_town_place(r.user_id, r.slot, p_map, v_go, 'visit', null, v_from);
    elsif r.from_hunt is not null then
      v_from := public.hr_town_station_for(p_map, 'combat', r.from_hunt);
      if public.hr_town_work_kind(v_kind) then
        -- BACK FROM A HUNT, RESUMING: at its activity's station, walking in from the arrival
        perform public.hr_town_place(r.user_id, r.slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work', r.at, v_from);
      else
        -- BACK FROM A HUNT, IDLE: set down at its hunt's arrival, in town 30 s from the end (an open browser keeps it)
        insert into public.town_seen as ts (user_id, slot, seen_at) values (r.user_id, r.slot, r.ended_at)
          on conflict (user_id, slot) do update set seen_at = greatest(ts.seen_at, excluded.seen_at);
        perform public.hr_town_place(r.user_id, r.slot, p_map, v_from, 'arrive', r.ended_at);
      end if;
    elsif public.hr_town_work_kind(v_kind) then
      -- A VISIT HOLDS: the throw first; its end (below, on a later read) sets the body down at this job's station
      if not exists (select 1 from public.town_bodies b where b.user_id = r.user_id and b.slot = r.slot and b.map_id = p_map
                       and b.why = 'visit' and b.visit_until > now()) then
        perform public.hr_town_place(r.user_id, r.slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work', r.at);
      end if;
    else
      -- IT STOPPED: it stays where it stands (it never walks on its own); only its pose changes
      update public.town_bodies set why = 'idle', changed_at = now()
       where user_id = r.user_id and slot = r.slot and station_id is not null and why = 'work';
    end if;
    v_n := v_n + 1;
  end loop;
  -- THE ENDED VISITS: a hero working a town job walks back to its job's station from where it stands; any other stays put
  for r in
    select b.user_id, b.slot from public.town_bodies b
     where b.map_id = p_map and b.why = 'visit' and b.visit_until <= now() and b.station_id is not null
       and (p_user is null or (b.user_id = p_user and b.slot = p_slot))
     order by b.visit_until, b.user_id, b.slot limit p_limit
  loop
    select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = r.user_id and ps.slot = r.slot;
    if found and public.hr_town_work_kind(v_kind)
       and not exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null) then
      perform public.hr_town_place(r.user_id, r.slot, p_map, public.hr_town_station_for(p_map, v_kind, v_id), 'work');
    end if;
    -- placed elsewhere its hold is already gone; kept (or refused a stand) it stands where it is, its visit over
    update public.town_bodies set visit_until = null where user_id = r.user_id and slot = r.slot and why = 'visit';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

revoke execute on function public.hr_town_note_move() from public, anon, authenticated, service_role;
revoke execute on function public.hr_town_moves_settle(text, integer, uuid, integer) from public, anon, authenticated, service_role;

-- ── §5 SELF-CHECK (CLAUDE.md §4; executed, any failure rolls the apply back). On a probe hero: nothing here stays. ──────────
do $chk$
declare
  v_u uuid := '000000c0-0000-4000-a000-0000e44a0001';
  v_map text; v_work text; v_b record; v_p record; v_t text[];
begin
  -- (1) no client reaches a new rule or a restated body
  if has_function_privilege('authenticated', 'public.hr_hearth_errand(text,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_hearth_errand(text,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_visit_span(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_errand()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_note_move()', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_moves_settle(text,integer,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_moves_settle(text,integer,uuid,integer)', 'execute') then
    raise exception 'SELF-CHECK 1 FAILED: an errand helper is client-executable'; end if;
  -- (2) the errand's trigger has the last word: it fires after hr_last_activity_note (a table's BEFORE triggers run in name order)
  select array_agg(t.tgname::text order by t.tgname::text) into v_t from pg_trigger t
   where t.tgrelid = 'public.player_state'::regclass and not t.tgisinternal and t.tgname in ('hr_last_activity_note', 'hr_town_errand')
     and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16;
  if v_t is distinct from array['hr_last_activity_note', 'hr_town_errand'] then
    raise exception 'SELF-CHECK 2 FAILED: the BEFORE UPDATE triggers read % (want hr_last_activity_note, then hr_town_errand)', v_t; end if;
  -- (3) THE ERRAND, played on a probe hero (the engine's writes stated as hr_apply makes them), rolled back by the raise at the end
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  v_work := public.hr_town_station_for(v_map, 'gather', 'normal_tree');
  if v_map is null or v_work is null or v_work = 'hearth' or public.hr_town_station_for(v_map, 'artisan', 'fuel_bones') <> 'hearth'
     or not public.hr_hearth_errand('artisan', 'fuel_bones', 1) or public.hr_hearth_errand('artisan', 'fuel_bones', 2)
     or public.hr_hearth_errand('artisan', 'fuel_bones', null) or public.hr_hearth_errand('gather', 'normal_tree', 1) then
    raise exception 'SELF-CHECK 3 FAILED: no town, no woodcutting station, the Bones run is not the Hearth''s, or the errand rule is wrong'; end if;
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Errand probe') on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hearth-errand self-check') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'SELF-CHECK 3 FAILED: the probe hero was not made'; end if;
    -- a woodcutter at its station
    update public.player_state set active_kind = 'gather', active_id = 'normal_tree', active_left = null where user_id = v_u and slot = 0;
    delete from public.town_moves where user_id = v_u;
    perform public.hr_town_place(v_u, 0, v_map, v_work, 'work');
    -- (a) "Fuel the hearth": the switch onto a run of one remembers the woodcutting, and its note names the errand
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 1 where user_id = v_u and slot = 0;
    select * into v_p from public.player_state where user_id = v_u and slot = 0;
    if v_p.errand_kind is distinct from 'gather' or v_p.errand_id is distinct from 'normal_tree' or v_p.errand_left is not null
       or v_p.last_activity_kind is distinct from 'gather' or v_p.last_activity_id is distinct from 'normal_tree' then
      raise exception 'SELF-CHECK 3a FAILED: the errand remembered %/% (%), the hunt''s job %/%', v_p.errand_kind, v_p.errand_id, v_p.errand_left,
        v_p.last_activity_kind, v_p.last_activity_id; end if;
    if not exists (select 1 from public.town_moves where user_id = v_u and slot = 0 and errand = 'fuel_bones') then
      raise exception 'SELF-CHECK 3a FAILED: the errand''s note does not name its run'; end if;
    -- (b) the town's read sends the body to the Hearth on a visit
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    select * into v_b from public.town_bodies where user_id = v_u and slot = 0;
    if v_b.station_id is distinct from 'hearth' or v_b.why <> 'visit' or not (v_b.visit_until > now()) then
      raise exception 'SELF-CHECK 3b FAILED: the errand set the body at % (%), hold %', v_b.station_id, v_b.why, v_b.visit_until; end if;
    -- (c) the engine ends the run of one: the pointer goes back to the woodcutting, now
    update public.player_state set active_kind = 'idle', active_id = null, active_left = null, active_since = now() - interval '1 hour'
     where user_id = v_u and slot = 0;
    select * into v_p from public.player_state where user_id = v_u and slot = 0;
    if v_p.active_kind is distinct from 'gather' or v_p.active_id is distinct from 'normal_tree' or v_p.active_since <> now()
       or v_p.errand_kind is not null or v_p.errand_id is not null then
      raise exception 'SELF-CHECK 3c FAILED: the run''s end left the pointer at %/% since %, errand %/%', v_p.active_kind, v_p.active_id,
        v_p.active_since, v_p.errand_kind, v_p.errand_id; end if;
    -- (d) the body stays at the fire while the visit holds, then walks back to the job's station
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    if (select station_id from public.town_bodies where user_id = v_u and slot = 0) is distinct from 'hearth' then
      raise exception 'SELF-CHECK 3d FAILED: the job''s note took the body off the Hearth before its visit ended'; end if;
    update public.town_bodies set visit_until = now() - interval '1 second' where user_id = v_u and slot = 0;
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    select * into v_b from public.town_bodies where user_id = v_u and slot = 0;
    if v_b.station_id is distinct from v_work or v_b.why <> 'work' or v_b.visit_until is not null then
      raise exception 'SELF-CHECK 3d FAILED: the ended visit left the woodcutter at % (%)', v_b.station_id, v_b.why; end if;
    -- (e) the player's own Stop mid-errand stops the hero
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 1 where user_id = v_u and slot = 0;
    insert into public.player_intents (user_id, intent_id, slot, intent) values (v_u, gen_random_uuid(), 0, 'set_activity:idle');
    update public.player_state set active_kind = 'idle', active_id = null, active_left = null where user_id = v_u and slot = 0;
    select * into v_p from public.player_state where user_id = v_u and slot = 0;
    if v_p.active_kind <> 'idle' or v_p.errand_kind is not null then
      raise exception 'SELF-CHECK 3e FAILED: a Stop mid-errand left the pointer at %/%, errand %', v_p.active_kind, v_p.active_id, v_p.errand_kind; end if;
    delete from public.player_intents where user_id = v_u;
    -- (f) an errand from idle ends idle; another job replaces an errand
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 1 where user_id = v_u and slot = 0;
    if (select errand_kind from public.player_state where user_id = v_u and slot = 0) is not null then
      raise exception 'SELF-CHECK 3f FAILED: an errand from idle remembered a job'; end if;
    update public.player_state set active_kind = 'idle', active_id = null, active_left = null where user_id = v_u and slot = 0;
    if (select active_kind from public.player_state where user_id = v_u and slot = 0) <> 'idle' then
      raise exception 'SELF-CHECK 3f FAILED: an errand from idle went somewhere'; end if;
    update public.player_state set active_kind = 'gather', active_id = 'normal_tree' where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 1 where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'gather', active_id = 'shrimp_s', active_left = null where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    if (select active_kind from public.player_state where user_id = v_u and slot = 0) <> 'idle'
       or (select errand_kind from public.player_state where user_id = v_u and slot = 0) is not null then
      raise exception 'SELF-CHECK 3f FAILED: a job chosen mid-errand did not replace it'; end if;
    -- (g) "Fuel all", or a count of more, is a job, not an errand; a count run down to its last is no errand either
    update public.player_state set active_kind = 'gather', active_id = 'normal_tree' where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 3 where user_id = v_u and slot = 0;
    update public.player_state set active_left = 1 where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'idle', active_id = null, active_left = null where user_id = v_u and slot = 0;
    select * into v_p from public.player_state where user_id = v_u and slot = 0;
    if v_p.active_kind <> 'idle' or v_p.errand_kind is not null then
      raise exception 'SELF-CHECK 3g FAILED: a run of three counted down was taken for an errand (%/%)', v_p.active_kind, v_p.active_id; end if;
    -- (h) a hunt started mid-errand remembers the bench the errand interrupted, with the count it still had to make (BENCH-RESUME)
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'copper_ore', 20)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    update public.player_state set active_kind = 'artisan', active_id = 'smelt_bronze', active_left = 5 where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'artisan', active_id = 'fuel_bones', active_left = 1 where user_id = v_u and slot = 0;
    update public.player_state set active_kind = 'combat', active_id = 'mill_cellar', active_left = null where user_id = v_u and slot = 0;
    select * into v_p from public.player_state where user_id = v_u and slot = 0;
    if v_p.last_activity_kind is distinct from 'artisan' or v_p.last_activity_id is distinct from 'smelt_bronze'
       or v_p.last_activity_left is distinct from 5 or v_p.errand_kind is not null then
      raise exception 'SELF-CHECK 3h FAILED: a hunt mid-errand remembers %/% for %, errand %', v_p.last_activity_kind, v_p.last_activity_id,
        v_p.last_activity_left, v_p.errand_kind; end if;
    raise exception using errcode = 'HR9E0', message = 'probe done';
  exception when sqlstate 'HR9E0' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_bodies where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'SELF-CHECK 3 FAILED: the probe hero was not rolled back'; end if;
end $chk$;
