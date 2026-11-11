-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-23-town-visit-hold.sql — A VISIT HOLDS THE BODY LONG ENOUGH TO WALK THERE AND THROW, THEN A WORKER GOES
--   BACK TO ITS JOB (lane/a-hearth-walk, systems-engineer, 2026-11-08; Tyler the same day: "Fingerguns didn't run all the
--   way to the hearth to throw his borax in").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §3. Display presence only: no value, rank or shared surface moves (no Security review).
-- EDGE: none. CLIENT: src/world/hearth-burn.js + src/session/town-presence.js ride the next release; either half alone is
-- safe (an older client reads no new key; this file changes no answer's shape).
--
-- ── THE CAUSE (measured) ─────────────────────────────────────────────────────
-- A powder (hr_town_show) and a named fuel (hr_hearth_burn) set the body on a Hearth fuel stand as a 'visit'
-- (hr_town_place). Nothing ever ended that visit: a hero still woodcutting stood at the fire for good, drawn idle there
-- for everyone, until its next activity change, which then moved it at once, mid-walk or mid-throw. And the World threw
-- the pinch only if the hero reached the fire inside a fixed 30 s (src/world/hearth-burn.js BURN_KEEP_MS), while the walk
-- from the Westwood's first stand is 37.2 s at 3.2 tiles/s and up to 46.7 s from the farthest stand: a woodcutter's powder
-- was never thrown.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- town_bodies.visit_until: when a body's visit ends. hr_town_place stamps it for every 'visit' (now() + the hold for the
-- straight line from where the body stood to its new stand) and clears it for every other placement; a second visit to
-- the stand it already holds extends it, never shortens it. hr_town_visit_hold(tiles) is the one rule:
-- tiles x pathFactor / 3.2 tiles/s + holdS, mirroring src/data/town-presence.js TOWN_VISIT (tests/town-shows.mjs TS-VISIT).
-- hr_town_moves_settle (the town's reads apply it, as they apply the notes) now also:
--   DEFERS a new town job's placement while the body's visit holds (the throw first; a hunt start still releases at once,
--     a stop still only changes the pose);
--   ENDS every ended visit on its map (or the caller's own): a hero working a town job (gather, artisan, training, no open
--     hunt) walks back to that job's station from where it stands; any other keeps standing where it is with its hold
--     cleared (Tyler 10-19: it never walks on its own).
-- hr_town_go's counter visits get the same hold (no client sends one today).
--
-- COST: one nullable column; a partial index over visiting bodies only. Each read adds one indexed probe for ended visits.
-- REVERSIBILITY: re-apply hr_town_place and hr_town_moves_settle from 2027-01-28-town-stands.sql (their md5s are §0's
-- pre-images); drop hr_town_visit_hold, the index and the column.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regclass('public.town_bodies') is null or to_regclass('public.town_moves') is null
     or to_regprocedure('public.hr_town_station_for(text,text,text)') is null then
    raise exception 'PRECONDITION: apply 2027-01-28-town-stands.sql and its catalogue first'; end if;
  -- each restated body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-08), or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)', 'd3bd3e7fecca1023967a1204ed92d758'),
    ('public.hr_town_moves_settle(text,integer,uuid,integer)', 'f7660d3393dadfeb15890d0c2c2256b3')) t(fn, pre) loop
    select prosrc into v_md5 from pg_proc where oid = v_r.fn::regprocedure;
    if strpos(v_md5, 'TOWN-VISIT') > 0 then continue; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s image: md5 % - another file moved it', v_r.fn, v_r.pre, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE COLUMN AND THE RULE ───────────────────────────────────────────────
alter table public.town_bodies add column if not exists visit_until timestamptz;
comment on column public.town_bodies.visit_until is
  '2027-03-23-town-visit-hold.sql: when this body''s visit ends (why = visit), stamped by hr_town_place; the town''s reads end it (hr_town_moves_settle).';
create index if not exists town_bodies_visits on public.town_bodies (map_id, visit_until) where why = 'visit' and visit_until is not null;

-- THE HOLD for a walk of p_tiles in a straight line: the walk at 3.2 tiles/s (hr_town_bodies_at's, the client's
-- WALK_TILES_PER_S) stretched by pathFactor, plus holdS. Mirrors src/data/town-presence.js TOWN_VISIT { pathFactor: 1.5, holdS: 10 }.
create or replace function public.hr_town_visit_hold(p_tiles double precision)
returns interval language sql immutable set search_path = public, pg_catalog as $fn$
  select make_interval(secs => greatest(coalesce(p_tiles, 0), 0) * 1.5 / 3.2 + 10)
$fn$;
revoke execute on function public.hr_town_visit_hold(double precision) from public, anon, authenticated, service_role;

-- ── §2 THE TWO BODIES, RESTATED WHOLE (§0 pins them) ─────────────────────────
-- THE PLACE (2027-01-28-town-stands.sql) + a visit's hold: stamped on a visit, cleared on any other placement.
create or replace function public.hr_town_place(p_user uuid, p_slot int, p_map text, p_station text, p_why text,
                                               p_since timestamptz default null, p_from_station text default null, p_inst int default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_map  public.hr_town_maps%rowtype;
  v_b    public.town_bodies%rowtype;
  v_inst int; v_st text; v_no int; v_ax int; v_ay int; v_fx int; v_fy int; v_fallback text;
  v_keep boolean := false;
  v_tx int; v_ty int; v_until timestamptz;
begin
  -- TOWN-VISIT (2027-03-23-town-visit-hold.sql): a visit holds the body for its walk and its throw.
  select * into v_map from public.hr_town_maps where map_id = p_map;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  select coalesce(s.face_x, (select d.x from public.hr_town_stands d where d.map_id = s.map_id and d.station_id = s.station_id order by d.stand_no limit 1)),
         coalesce(s.face_y, (select d.y from public.hr_town_stands d where d.map_id = s.map_id and d.station_id = s.station_id order by d.stand_no limit 1)),
         s.fallback
    into v_ax, v_ay, v_fallback from public.hr_town_stations s where s.map_id = p_map and s.station_id = p_station;
  if not found or coalesce(p_why, '') not in ('work', 'arrive', 'idle', 'visit') then return jsonb_build_object('ok', false, 'error', 'unknown_station'); end if;
  perform public.hr_town_lock(p_map);
  select * into v_b from public.town_bodies where user_id = p_user and slot = p_slot for update;
  -- THE INSTANCE: a party move names it; else the one its account stands in; else a seat (the lock is held)
  v_inst := coalesce(p_inst,
    case when v_b.station_id is not null and v_b.map_id = p_map and public.hr_town_live(p_user, p_slot) then v_b.inst end,
    public.hr_town_seat(p_user, p_map));
  -- an idle hero whose browser closed lets go of its stand here (no goodbye is needed)
  update public.town_bodies b set station_id = null, stand_no = null, why = 'gone', from_x = null, from_y = null, changed_at = now()
    from public.hr_town_held(p_map) h
   where h.inst = v_inst and not h.live and not (h.user_id = p_user and h.slot = p_slot)
     and b.user_id = h.user_id and b.slot = h.slot and b.map_id = p_map and b.station_id is not null;
  -- one player fields at most v_map.heroes bodies
  if (select count(*) from public.town_bodies b where b.user_id = p_user and b.map_id = p_map and b.inst = v_inst
        and b.station_id is not null and b.slot <> p_slot) >= v_map.heroes then
    return jsonb_build_object('ok', false, 'error', 'too_many_bodies');
  end if;
  if v_b.station_id = p_station and v_b.map_id = p_map and v_b.inst = v_inst then
    v_keep := true;
  else
    select s.station_id, s.stand_no into v_st, v_no
      from public.hr_town_stands s join public.hr_town_stations st on st.map_id = s.map_id and st.station_id = s.station_id
     where s.map_id = p_map
       and not exists (select 1 from public.town_bodies o
                        where o.map_id = p_map and o.inst = v_inst and o.station_id = s.station_id and o.stand_no = s.stand_no
                          and not (o.user_id = p_user and o.slot = p_slot))
     order by case when s.station_id = p_station then 0 when s.station_id = v_fallback then 1 when st.role = 'bench' then 2 else 3 end,
              case when s.station_id = p_station or s.station_id = v_fallback then s.stand_no else 0 end,
              power(s.x - v_ax, 2) + power(s.y - v_ay, 2), s.station_id, s.stand_no
     limit 1;
    if v_st is null then return jsonb_build_object('ok', false, 'error', 'town_full'); end if;
    -- where it walks from: the station it came through, else the tile it stood on
    if p_from_station is not null then
      select s.x, s.y into v_fx, v_fy from public.hr_town_stands s where s.map_id = p_map and s.station_id = p_from_station order by s.stand_no limit 1;
    elsif v_b.station_id is not null and v_b.map_id = p_map then
      select t.x, t.y into v_fx, v_fy from public.hr_town_bodies_at(p_map, v_b.inst, null, p_user, p_slot) t;
    end if;
  end if;
  -- THE VISIT'S HOLD: the walk from where it stands (or came from) to the stand, and the throw. Any other placement clears it.
  if p_why = 'visit' then
    if v_keep then
      select t.x, t.y, t.sx, t.sy into v_fx, v_fy, v_tx, v_ty from public.hr_town_bodies_at(p_map, v_b.inst, null, p_user, p_slot) t;
    else
      select s.x, s.y into v_tx, v_ty from public.hr_town_stands s where s.map_id = p_map and s.station_id = v_st and s.stand_no = v_no;
    end if;
    v_until := now() + public.hr_town_visit_hold(case when v_fx is null or v_tx is null then 0 else sqrt(power(v_tx - v_fx, 2) + power(v_ty - v_fy, 2)) end);
  end if;
  if v_keep then
    update public.town_bodies set why = p_why, changed_at = now()
     where user_id = p_user and slot = p_slot and why is distinct from p_why;
    -- a second visit to the stand it holds extends the hold, never shortens it (not a visible change: changed_at stays)
    update public.town_bodies set visit_until = case when p_why = 'visit' then greatest(visit_until, v_until) end
     where user_id = p_user and slot = p_slot and visit_until is distinct from (case when p_why = 'visit' then greatest(visit_until, v_until) end);
  else
    -- its look is read with its stand (a new body is never sent without one)
    insert into public.town_bodies as tb (user_id, slot, map_id, inst, station_id, stand_no, why, since, from_x, from_y, changed_at, look, look_at, visit_until)
      values (p_user, p_slot, p_map, v_inst, v_st, v_no, p_why, coalesce(p_since, now()), v_fx, v_fy, now(), public.hr_town_look(p_user, p_slot), now(), v_until)
    on conflict (user_id, slot) do update
      set map_id = excluded.map_id, inst = excluded.inst, station_id = excluded.station_id, stand_no = excluded.stand_no,
          why = excluded.why, since = excluded.since, from_x = excluded.from_x, from_y = excluded.from_y, changed_at = excluded.changed_at,
          look = excluded.look, look_at = excluded.look_at, visit_until = excluded.visit_until;
  end if;
  return jsonb_build_object('ok', true, 'me', public.hr_town_me(p_user, p_slot));
end $fn$;

-- THE NOTES APPLIED (2027-01-28-town-stands.sql) + a visit holds a new town job's placement, and every ended visit is ended.
create or replace function public.hr_town_moves_settle(p_map text, p_limit int, p_user uuid default null, p_slot int default null)
returns int language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  r record; v_n int := 0; v_kind text; v_id text; v_main text; v_from text;
begin
  -- TOWN-VISIT (2027-03-23-town-visit-hold.sql): a visit holds its body until it ends; the reads end it.
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
      returning m.user_id, m.slot, m.from_hunt, m.at, m.id)
    select p.user_id, p.slot, (array_agg(p.from_hunt order by p.id desc) filter (where p.from_hunt is not null))[1] as from_hunt,
           max(p.at) as at, max(p.at) filter (where p.from_hunt is not null) as ended_at
      from picked p group by p.user_id, p.slot
      order by min(p.id)
  loop
    select ps.active_kind, ps.active_id into v_kind, v_id from public.player_state ps where ps.user_id = r.user_id and ps.slot = r.slot;
    if not found then continue; end if;
    if v_kind = 'combat' or exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null) then
      -- A HUNTER IS NOT IN TOWN
      perform public.hr_town_release(r.user_id, r.slot);
      delete from public.town_seen where user_id = r.user_id and slot = r.slot;
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

revoke execute on function public.hr_town_place(uuid, integer, text, text, text, timestamp with time zone, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.hr_town_moves_settle(text, integer, uuid, integer) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4; executed, any failure rolls the apply back). On a copy of the town: nothing here stays. ──
do $chk$
declare
  v_u uuid := '000000c0-0000-4000-a000-0000757d0001';
  v_map text; v_work text; v_r jsonb; v_b record; v_left interval;
begin
  -- (1) the rule: the walk stretched by 1.5 at 3.2 tiles/s, plus 10 s (src/data/town-presence.js TOWN_VISIT)
  if public.hr_town_visit_hold(0) <> interval '10 seconds' or public.hr_town_visit_hold(32) <> interval '25 seconds'
     or public.hr_town_visit_hold(null) <> interval '10 seconds' then
    raise exception 'SELF-CHECK 1 FAILED: hr_town_visit_hold(0, 32, null) = %, %, %', public.hr_town_visit_hold(0), public.hr_town_visit_hold(32), public.hr_town_visit_hold(null); end if;
  -- (2) no client reaches a town helper
  if has_function_privilege('authenticated', 'public.hr_town_visit_hold(double precision)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_place(uuid,integer,text,text,text,timestamp with time zone,text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_moves_settle(text,integer,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.hr_town_moves_settle(text,integer,uuid,integer)', 'execute') then
    raise exception 'SELF-CHECK 2 FAILED: a town helper is client-executable'; end if;
  -- (3) A WOODCUTTER THROWS AT THE HEARTH AND GOES BACK: played on a probe hero, rolled back by the raise at the end
  v_map := (select m.map_id from public.hr_town_maps m where m.main);
  v_work := public.hr_town_station_for(v_map, 'gather', 'normal_tree');
  if v_map is null or v_work is null or v_work = 'hearth' or not exists (select 1 from public.hr_town_stands s where s.map_id = v_map and s.station_id = 'hearth') then
    raise exception 'SELF-CHECK 3 FAILED: no town, no woodcutting station or no Hearth stand'; end if;
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Visit probe') on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'town-visit-hold self-check') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'SELF-CHECK 3 FAILED: the probe hero was not made'; end if;
    update public.player_state set active_kind = 'gather', active_id = 'normal_tree', active_since = now() where user_id = v_u and slot = 0;
    delete from public.town_moves where user_id = v_u;
    v_r := public.hr_town_place(v_u, 0, v_map, v_work, 'work');
    if v_r->>'ok' <> 'true' then raise exception 'SELF-CHECK 3 FAILED: the woodcutter was not set down: %', v_r; end if;
    v_r := public.hr_town_place(v_u, 0, v_map, 'hearth', 'visit');
    select b.*, s.x as sx, s.y as sy into v_b from public.town_bodies b
      join public.hr_town_stands s on s.map_id = b.map_id and s.station_id = b.station_id and s.stand_no = b.stand_no
     where b.user_id = v_u and b.slot = 0;
    if v_b.station_id is distinct from 'hearth' or v_b.why <> 'visit' or v_b.from_x is null then
      raise exception 'SELF-CHECK 3 FAILED: the powder did not send the woodcutter to the Hearth: % % from %', v_b.station_id, v_b.why, v_b.from_x; end if;
    -- the hold is the walk from where it stood (its job's stand) to its Hearth stand, by the one rule
    v_left := v_b.visit_until - now();
    if v_left is distinct from public.hr_town_visit_hold(sqrt(power(v_b.sx - v_b.from_x, 2) + power(v_b.sy - v_b.from_y, 2)))
       or v_left < interval '30 seconds' then
      raise exception 'SELF-CHECK 3 FAILED: the hold % is not the walk from (%, %) to (%, %)', v_left, v_b.from_x, v_b.from_y, v_b.sx, v_b.sy; end if;
    -- the job's pointer is written again (a note) while the visit holds: the body stays at the fire
    insert into public.town_moves (user_id, slot, from_hunt, at) values (v_u, 0, null, now());
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    if (select station_id from public.town_bodies where user_id = v_u and slot = 0) <> 'hearth' then
      raise exception 'SELF-CHECK 3 FAILED: a job write took the body off the Hearth before its visit ended'; end if;
    -- the visit ends: the woodcutter walks back to its job's station
    update public.town_bodies set visit_until = now() - interval '1 second' where user_id = v_u and slot = 0;
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    select * into v_b from public.town_bodies where user_id = v_u and slot = 0;
    if v_b.station_id <> v_work or v_b.why <> 'work' or v_b.visit_until is not null then
      raise exception 'SELF-CHECK 3 FAILED: the ended visit left the woodcutter at % (%), hold %', v_b.station_id, v_b.why, v_b.visit_until; end if;
    -- an idle hero's ended visit leaves it standing where it is
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    delete from public.town_moves where user_id = v_u;
    perform public.hr_town_place(v_u, 0, v_map, 'hearth', 'visit');
    update public.town_bodies set visit_until = now() - interval '1 second' where user_id = v_u and slot = 0;
    perform public.hr_town_moves_settle(v_map, 4, v_u, 0);
    select * into v_b from public.town_bodies where user_id = v_u and slot = 0;
    if v_b.station_id <> 'hearth' or v_b.visit_until is not null then
      raise exception 'SELF-CHECK 3 FAILED: an idle hero''s ended visit moved it to % (hold %)', v_b.station_id, v_b.visit_until; end if;
    raise exception using errcode = 'HR9V0', message = 'probe done';
  exception when sqlstate 'HR9V0' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.town_bodies where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'SELF-CHECK 3 FAILED: the probe hero was not rolled back'; end if;
end $chk$;
