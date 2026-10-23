-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A DEPLOY NEVER ENDS A HUNT (lane c-deploy-no-forfeit,
-- backend-architect, 2026-10-22). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §5. Touches the settle's refusal / forfeit path (hunt economy):
-- in the reopen Security review.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- v0.2.32 (live 2026-10-22): 2026-12-09-hunt-sessions-catalogue.generated.sql
-- (a new world field list: hold / holdNext) applied at 23:11:11; the hr-accrue
-- edge writing that shape landed at 23:11:33. In those 22 s every settle of the
-- old engine carried a world of the field list the catalogue had just replaced.
-- hr_hunt_apply_instance (2026-11-16-hunt-density-bounds.sql:785-789) refused each
-- `bad_world` / `shape` THROUGH hr_hunt_settle_refused, which COUNTS it, and the
-- sixth in a row forfeits (c_forfeit_after): two WATCHED party hunts (8 and 9
-- refusals, a settle every ~2.5 s) were ended `server` and sent home. The
-- refusal was the server's own version skew, not anything the hunt did; the
-- forfeit exists for a window the server can judge and refuses every fire (P0
-- #57, kills_over x133). The other order fails the same way: an edge landing
-- FIRST writes a shape the catalogue does not know yet.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 hunt_world_shape_move (NEW, one row, server-only): the catalogue's world
--    shape and the one it REPLACED, and when (moved_at, the server's clock).
--    Written ONLY by trigger hr_hunt_world_shape_move on hr_hunt_world_shape
--    (every generated catalogue file's delete + insert), so it is judged by the
--    server's own catalogue history, never by anything a settle carries. A
--    re-insert of the same shape (a second apply) moves nothing.
-- §2 hr_hunt_settle_held (NEW, owner only): a refusal the SERVER caused is
--    recorded (hr_rejections, intent hunt_settle) and NOT counted: the
--    instance's consecutive-refusal count is neither raised nor reset.
-- §3 hr_hunt_apply_instance RESTATED WHOLE (the 2026-11-16 image, md5 pinned),
--    one branch added inside the shape refusal: a WELL-FORMED world of THIS
--    instance (its ground, the settle's world swing) whose { v, s } is exactly
--    the shape the catalogue replaced less than c_shape_grace (30 min) ago
--    answers `world_shape_moved` through §2. Nothing of the window moves; the
--    instance keeps its owed time on its unmoved settled_to, and the first
--    settle of the engine that writes the new shape takes the whole window
--    from there (a stored world of the old shape restarts: world-state.js
--    decodeStored). Every other world refusal counts exactly as before.
-- §4 hr_hunt_instance_read SPLICED (the 2026-12-08 image, md5 pinned):
--    instance.world_shape = { v, s } of hr_hunt_world_shape, so the edge
--    (hunt-settle.js readHuntSettle, same lane) proposes nothing while its own
--    world-state.js WORLD_VERSION / SHAPE is not the catalogue's: an edge that
--    lands before (or after) the catalogue sends no doomed settle at all, and
--    a settle-before-mutate verb (set-activity.js collectCurrentWindow) waits
--    for the owed window instead of mutating ahead of it.
--    Together: the deploy is safe in EITHER order.
-- ERROR TAXONOMY of the world check: bad_world {json | type | shape} counted
--    (unchanged); world_shape_moved {from, to, moved_at} + counted:false, held
--    (new). The edge's skip is outcome `nothing`, reason world_shape_pending.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged lock order (the instance row FOR UPDATE, then members by (user_id,
-- slot)). The held path takes no new lock and writes only the rejection
-- counter row. The move row is written in the catalogue apply's own
-- transaction, so a settle sees the new shape and its move together. A held
-- settle writes no intent key, so its retry is a fresh attempt, never a replay.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- The exemption is decided by server rows only: the catalogue's CURRENT shape
-- and the one IT replaced, within 30 min of the server's own move. A settle
-- cannot claim it: an unknown shape counts; the previous shape counts once the
-- grace has passed; a held settle credits nothing and moves nothing, so an
-- engine (or a forged hr_engine payload) that kept writing the old shape would
-- gain nothing for 30 min and then be forfeited as before. No grant moves:
-- hr_hunt_apply_instance stays hr_engine-only, the read stays engine-only, the
-- two new functions and the table are the owner's (RLS on, no policy).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_apply_instance from 2026-11-16-hunt-density-bounds.sql and
-- hr_hunt_instance_read's 2026-12-08 image (re-run that file's §3 splice on the
-- 2026-11-16 body); drop trigger hr_hunt_world_shape_move, functions
-- hr_hunt_world_shape_moved and hr_hunt_settle_held, table hunt_world_shape_move.
-- The edge half is inert against the old read (no world_shape: no skip).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One 60-byte row, ever. The read gains one single-row subselect per settle;
-- the shape check reads the move row only on a world that is already refused.
-- ORDER: after 2026-12-10-town-walker-role.sql (last APPLIED; no object in
-- common). EDGE: hr-accrue redeploys with this lane (hunt-settle.js,
-- set-activity.js); either order against this file is safe. Proof:
-- tests/hunt-sessions-settle.mjs DEPLOY (+ 7 mutants). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_hunt_world_shape') is null or (select count(*) from public.hr_hunt_world_shape) <> 1
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_instances' and column_name = 'refusals')
     or to_regprocedure('public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)') is null then
    raise exception 'PRECONDITION: one hr_hunt_world_shape row, hunt_instances.refusals and hr_hunt_settle_refused (2026-11-16) first'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure;
  if md5(v_src) <> 'f14daefbe59c6c9dba56821f5eed595e' and strpos(v_src, 'DEPLOY-NO-FORFEIT') = 0 then
    raise exception 'PIN: hr_hunt_apply_instance is neither the 2026-11-16 density-bounds image (f14daefb...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'c02293637927e33f404221e987704006' and strpos(v_src, 'DEPLOY-NO-FORFEIT') = 0 then
    raise exception 'PIN: hr_hunt_instance_read is neither the 2026-12-08 party-hold image (c0229363...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE CATALOGUE'S SHAPE MOVE ────────────────────────────────────────────
create table if not exists public.hunt_world_shape_move (
  id           boolean primary key default true check (id),
  version      int not null,
  shape        bigint not null,
  prev_version int,
  prev_shape   bigint,
  moved_at     timestamptz not null default now(),
  constraint hunt_world_shape_move_prev check ((prev_version is null) = (prev_shape is null))
);
alter table public.hunt_world_shape_move enable row level security;
revoke all on public.hunt_world_shape_move from public, anon, authenticated, service_role;
comment on table public.hunt_world_shape_move is
  '2026-12-11-hunt-deploy-no-forfeit.sql: the catalogue world shape (hr_hunt_world_shape), the one it replaced and when. '
  'Written only by trigger hr_hunt_world_shape_move. hr_hunt_apply_instance holds (does not count) a settle whose world '
  'is the replaced shape for 30 min after the move: the catalogue and the edge land seconds apart.';

create or replace function public.hr_hunt_world_shape_moved()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a catalogue file rewrote the world shape.
  -- The same shape again (a second apply of the same file) moves nothing.
  insert into public.hunt_world_shape_move as m (id, version, shape, moved_at)
    values (true, new.version, new.shape, now())
  on conflict (id) do update
    set prev_version = m.version, prev_shape = m.shape,
        version = excluded.version, shape = excluded.shape, moved_at = now()
    where (m.version, m.shape) is distinct from (excluded.version, excluded.shape);
  return null;
end $$;
revoke execute on function public.hr_hunt_world_shape_moved() from public;
revoke execute on function public.hr_hunt_world_shape_moved() from anon, authenticated, service_role, hr_engine, hr_tick;
drop trigger if exists hr_hunt_world_shape_move on public.hr_hunt_world_shape;
create trigger hr_hunt_world_shape_move after insert or update of version, shape on public.hr_hunt_world_shape
  for each row execute function public.hr_hunt_world_shape_moved();

-- ONCE: the shape in force now, with nothing before it (no exemption until the next move).
insert into public.hunt_world_shape_move (id, version, shape)
  select true, w.version, w.shape from public.hr_hunt_world_shape w where w.id
on conflict (id) do nothing;

-- ── §2 A REFUSAL THE SERVER CAUSED ──────────────────────────────────────────
-- HELD (owner only): recorded with its own detail, NOT counted toward the forfeit, the count kept.
create or replace function public.hr_hunt_settle_held(p_instance uuid, p_world_from bigint, p_first jsonb, p_answer jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_n int;
begin
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql). The caller holds the instance lock.
  select refusals into v_n from public.hunt_instances where id = p_instance;
  if coalesce(p_first->>'user', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(p_first->>'slot', '') ~ '^[0-9]{1,2}$' then
    perform public.hr_record_rejection((p_first->>'user')::uuid, (p_first->>'slot')::int, 'hunt_settle',
      coalesce(p_answer->>'error', 'apply_failed'),
      jsonb_build_object('instance', p_instance, 'world_swing', p_world_from, 'refusals', v_n, 'counted', false,
                         'detail', p_answer->'detail'), 1);
  end if;
  return p_answer || jsonb_build_object('refusals', coalesce(v_n, 0), 'counted', false);
end $$;
revoke execute on function public.hr_hunt_settle_held(uuid, bigint, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_settle_held(uuid, bigint, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;

-- ── §3 THE ONE SETTLE OF AN INSTANCE ────────────────────────────────────────
-- The 2026-11-16 body; the shape refusal holds the catalogue's own deploy gap.
create or replace function public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb,
  p_members jsonb, p_project_user uuid default null, p_project_slot int default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_skew constant interval := interval '60 seconds';
  -- A fuse on the deploy gap, not a balance figure: the catalogue and the edge land seconds to minutes apart.
  c_shape_grace constant interval := interval '30 minutes';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_move  public.hunt_world_shape_move%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      -- THE SERVER'S OWN DEPLOY GAP: a well-formed world of THIS instance written under exactly the field list the
      -- catalogue replaced less than c_shape_grace ago (hunt_world_shape_move, written only by the catalogue's own
      -- trigger) is held: nothing moves, nothing is counted. Every other shape still counts toward the forfeit.
      select * into v_move from public.hunt_world_shape_move where id;
      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace
         and v_move.version = v_shape.version and v_move.shape = v_shape.shape
         and jsonb_typeof(v_wj) = 'object'
         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)
         and jsonb_typeof(v_wj->'w') = 'array' and jsonb_typeof(v_wj->'u') = 'array' and jsonb_typeof(v_wj->'p') = 'array'
         and v_wj->'w'->>0 is not distinct from v_ground and v_wj->'w'->1 = to_jsonb(v_wsw) then
        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',
          'detail', jsonb_build_object('from', jsonb_build_object('v', v_move.prev_version, 's', v_move.prev_shape),
                                       'to', jsonb_build_object('v', v_shape.version, 's', v_shape.shape), 'moved_at', v_move.moved_at)));
      end if;
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end));
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
end $$;
revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from public;
revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) to hr_engine;

-- ── §4 THE ENGINE'S READ CARRIES THE CATALOGUE'S SHAPE (ONE ANCHORED SPLICE) ──
do $mig$
declare v_def text; v_n int; v_old text; v_new text;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_instance_read(uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'DEPLOY-NO-FORFEIT') = 0 then
    v_old := $a$'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),$a$;
    v_new := $a$'hold_seat', (select p.hold_seat from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_instance_read: DEPLOY-NO-FORFEIT anchor matched % times (need 1): the body moved', v_n; end if;
    -- CREATE OR REPLACE keeps the grants; none moves here.
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, ROLLED BACK ──────────────────────
-- A probe hero at Mill Cellar, its windows committed through hr_hunt_apply_instance itself:
-- (0) the move record is the catalogue and the engine read carries it; (a) a second apply of the
-- same catalogue moves nothing; (b) a window of the shape in force lands; THE DEPLOY: the catalogue
-- moves the field list; (c) nine settles of the field list it replaced are held: never counted,
-- nothing moves, each recorded; (d) the new field list lands the whole owed window from the unmoved
-- boundary; (e) an unknown field list counts; (f) past the grace the replaced one counts; (g) after
-- Leave, six genuinely refused windows forfeit exactly as before and a held one between them
-- neither counts nor resets: ended `left` at the last accepted boundary, one zero-value row, purse unmoved.
do $$
declare
  v_u     uuid := '000000c0-0000-4000-a000-00000d4f0001';
  v_hunt  text := 'mill_cellar';
  v_ver   int; v_old bigint; v_new bigint; v_fields jsonb;
  v       jsonb;
  v_sid   uuid; v_inst uuid;
  v_at    timestamptz; v_sw bigint; v_swing bigint; v_tick bigint;
  v_gold  bigint;
  v_i     int;
  v_role  text;
  v_mv    public.hunt_world_shape_move%rowtype;
begin
  select version, shape, fields into v_ver, v_old, v_fields from public.hr_hunt_world_shape where id;
  v_new := (v_old + 1) % 4294967296;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  begin
    execute $f$
      create function pg_temp.hr_dnf_probe(p_user uuid, p_kills bigint, p_win_ms bigint, p_shape bigint) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      declare v_s public.hunt_sessions%rowtype; v_i public.hunt_instances%rowtype; v_to timestamptz; v_n bigint; v_t bigint;
              v_s0 bigint; v_ver bigint; v_g text; v_w text;
      begin
        select * into v_s from public.hunt_sessions where user_id = p_user and slot = 0 and ended_at is null;
        if v_s.id is null then return jsonb_build_object('ok', false, 'error', 'probe_no_hunt'); end if;
        select * into v_i from public.hunt_instances where id = v_s.instance_id;
        select ground_id into v_g from public.hr_hunt_grounds where hunt_id = v_i.hunt_id;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_to := v_i.settled_to + make_interval(secs => p_win_ms / 1000.0);
        v_n := p_win_ms / v_t;
        -- the world an engine of field list p_shape writes: well-formed, this instance's ground and swing
        v_w := jsonb_build_object('v', (select version from public.hr_hunt_world_shape where id), 's', p_shape,
                 'w', jsonb_build_array(v_g, v_i.world_swing + v_n), 'u', '[]'::jsonb, 'p', '[]'::jsonb)::text;
        v_s0 := public.hr_stamina_of(p_user, 0, v_s.settled_to);
        select version into v_ver from public.player_state where user_id = p_user and slot = 0;
        return public.hr_hunt_apply_instance(v_i.id, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + v_n, 'world', v_w),
          jsonb_build_array(jsonb_build_object('user', p_user, 'slot', 0, 'session', v_s.id, 'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_to, 'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
              'meta', jsonb_build_object('ms', p_win_ms, 'ticks', v_n, 'kills', p_kills, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_to))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + v_n, 'to', v_to, 'next_swing_at', v_to,
              'uses', '{}'::jsonb, 'paid_ms', v_n * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'death', '[]'::jsonb, 'rare_drop', '[]'::jsonb),
              'ended', null, 'buys', '{}'::jsonb, 'cover', '{}'::jsonb, 'stamina', greatest(0, v_s0 - v_n * v_t),
              'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null)), null, null);
      end $b$ $f$;
    update public.hr_hunt_config set enabled = true where id;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'deploy-no-forfeit §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'created', v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character refused: %', v; end if;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_hunt_enter refused: %', v; end if;
    v_sid := (v->'session'->>'id')::uuid;
    select instance_id into v_inst from public.hunt_sessions where id = v_sid;
    v_at := date_trunc('second', now() - interval '10 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at where id = v_sid;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_inst;
    -- (0) the move record is the catalogue in force; the engine's read carries its shape.
    select * into v_mv from public.hunt_world_shape_move where id;
    if v_mv.version is distinct from v_ver or v_mv.shape is distinct from v_old then
      raise exception 'VERIFY(0): the move record (%, %) is not the catalogue (%, %)', v_mv.version, v_mv.shape, v_ver, v_old; end if;
    if public.hr_hunt_instance_read(v_u, 0)->'instance'->'world_shape' is distinct from jsonb_build_object('v', v_ver, 's', v_old) then
      raise exception 'VERIFY(0): the engine read carries world_shape %', public.hr_hunt_instance_read(v_u, 0)->'instance'->'world_shape'; end if;
    -- (a) the same catalogue applied again (a generated file's delete + insert) moves nothing.
    update public.hunt_world_shape_move set moved_at = now() - interval '1 day' where id;
    delete from public.hr_hunt_world_shape;
    insert into public.hr_hunt_world_shape (id, version, shape, fields) values (true, v_ver, v_old, v_fields);
    select * into v_mv from public.hunt_world_shape_move where id;
    if v_mv.moved_at <> now() - interval '1 day' or v_mv.shape <> v_old then
      raise exception 'VERIFY(a): a re-insert of the same shape moved the record: %', to_jsonb(v_mv); end if;
    -- (b) a window of the shape in force lands.
    v := pg_temp.hr_dnf_probe(v_u, 1, 10000, v_old);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a window of the shape in force answered %', v; end if;
    -- THE DEPLOY: the catalogue moves the field list, exactly as a generated catalogue file does.
    delete from public.hr_hunt_world_shape;
    insert into public.hr_hunt_world_shape (id, version, shape, fields) values (true, v_ver, v_new, v_fields);
    select * into v_mv from public.hunt_world_shape_move where id;
    if v_mv.shape <> v_new or v_mv.prev_shape is distinct from v_old or v_mv.prev_version is distinct from v_ver or v_mv.moved_at <> now() then
      raise exception 'VERIFY(c): the move is not recorded: %', to_jsonb(v_mv); end if;
    if public.hr_hunt_instance_read(v_u, 0)->'instance'->'world_shape' is distinct from jsonb_build_object('v', v_ver, 's', v_new) then
      raise exception 'VERIFY(c): the engine read did not follow the move'; end if;
    select settled_to, world_swing into v_at, v_sw from public.hunt_instances where id = v_inst;
    select swing_index into v_swing from public.hunt_sessions where id = v_sid;
    -- (c) nine settles from the engine still writing the replaced field list: held, never counted, nothing moves.
    for v_i in 1 .. 9 loop
      v := pg_temp.hr_dnf_probe(v_u, 1, 10000, v_old);
      if v->>'error' is distinct from 'world_shape_moved' or (v->>'counted')::boolean is distinct from false
         or (v->>'refusals')::int is distinct from 0 or v ? 'forfeit' then
        raise exception 'VERIFY(c): settle % of the replaced shape answered %', v_i, v; end if;
    end loop;
    if (select refusals from public.hunt_instances where id = v_inst) <> 0
       or (select settled_to from public.hunt_instances where id = v_inst) <> v_at
       or (select world_swing from public.hunt_instances where id = v_inst) <> v_sw
       or (select ended_at from public.hunt_sessions where id = v_sid) is not null
       or exists (select 1 from public.player_ledger where session_id = v_sid and intent = 'window_forfeit') then
      raise exception 'VERIFY(c): a held settle moved the instance, counted, or ended the hunt'; end if;
    if (select n from public.hr_rejections where user_id = v_u and slot = 0 and day = current_date and code = 'world_shape_moved') is distinct from 9 then
      raise exception 'VERIFY(c): the held settles are not each recorded (%)',
        (select n from public.hr_rejections where user_id = v_u and slot = 0 and day = current_date and code = 'world_shape_moved'); end if;
    -- (d) the engine of the new field list: the whole owed window from the unmoved boundary lands.
    v := pg_temp.hr_dnf_probe(v_u, 1, 20000, v_new);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the new shape''s window answered %', v; end if;
    if (select settled_to from public.hunt_instances where id = v_inst) <> v_at + interval '20 seconds'
       or (select swing_index from public.hunt_sessions where id = v_sid) <> v_swing + 20000 / v_tick
       or (select refusals from public.hunt_instances where id = v_inst) <> 0
       or ((select world from public.hunt_instances where id = v_inst)::jsonb->>'s')::bigint <> v_new then
      raise exception 'VERIFY(d): the window after the deploy lost time or kept a count'; end if;
    -- (e) only the field list the catalogue just replaced is held: an unknown one counts, as before.
    v := pg_temp.hr_dnf_probe(v_u, 1, 10000, (v_new + 7) % 4294967296);
    if v->>'error' is distinct from 'bad_world' or (v->>'refusals')::int is distinct from 1 then
      raise exception 'VERIFY(e): an unknown shape answered %', v; end if;
    -- (f) and only for the grace: past it the replaced field list counts again.
    update public.hunt_world_shape_move set moved_at = now() - interval '31 minutes' where id;
    v := pg_temp.hr_dnf_probe(v_u, 1, 10000, v_old);
    if v->>'error' is distinct from 'bad_world' or (v->>'refusals')::int is distinct from 2 then
      raise exception 'VERIFY(f): the replaced shape past the grace answered %', v; end if;
    update public.hunt_world_shape_move set moved_at = now() where id;
    v := pg_temp.hr_dnf_probe(v_u, 1, 10000, v_new);
    if coalesce(v->>'ok', '') <> 'true' or (select refusals from public.hunt_instances where id = v_inst) <> 0 then
      raise exception 'VERIFY(f): a landed window after the refusals answered % (count %)', v, (select refusals from public.hunt_instances where id = v_inst); end if;
    select gold into v_gold from public.player_state where user_id = v_u and slot = 0;
    v_at := (select settled_to from public.hunt_instances where id = v_inst);
    -- (g) Leave; five genuinely refused windows, one held, the sixth refused: it forfeits.
    v := public.hr_hunt_leave(0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(g): the leave was refused: %', v; end if;
    for v_i in 1 .. 5 loop
      v := pg_temp.hr_dnf_probe(v_u, 100000, 10000, v_new);
      if v->>'error' is distinct from 'kills_over' or (v->>'refusals')::int is distinct from v_i or v ? 'forfeit' then
        raise exception 'VERIFY(g): refusal % answered %', v_i, v; end if;
    end loop;
    v := pg_temp.hr_dnf_probe(v_u, 1, 10000, v_old);
    if v->>'error' is distinct from 'world_shape_moved' or (v->>'refusals')::int is distinct from 5 or v ? 'forfeit'
       or (select refusals from public.hunt_instances where id = v_inst) <> 5
       or (select ended_at from public.hunt_sessions where id = v_sid) is not null then
      raise exception 'VERIFY(g): a held settle after five refusals answered % (it must neither count nor reset)', v; end if;
    v := pg_temp.hr_dnf_probe(v_u, 100000, 10000, v_new);
    if v->>'error' is distinct from 'kills_over' or not (v ? 'forfeit') then
      raise exception 'VERIFY(g): the sixth counted refusal did not forfeit: %', v; end if;
    if (select end_reason from public.hunt_sessions where id = v_sid) is distinct from 'left'
       or (select ended_at from public.hunt_sessions where id = v_sid) is distinct from v_at then
      raise exception 'VERIFY(g): the forfeited hunt ended % at % (want left at %)',
        (select end_reason from public.hunt_sessions where id = v_sid), (select ended_at from public.hunt_sessions where id = v_sid), v_at; end if;
    if (select count(*) from public.player_ledger where session_id = v_sid and intent = 'window_forfeit'
          and kind = 'hunt' and coalesce(gold, 0) = 0 and meta->>'code' = 'kills_over') <> 1 then
      raise exception 'VERIFY(g): the forfeit is not journalled exactly once'; end if;
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold then
      raise exception 'VERIFY(g): the forfeit moved the purse'; end if;
    if exists (select 1 from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null)
       or (select world from public.hunt_instances where id = v_inst) is not null
       or (select refusals from public.hunt_instances where id = v_inst) <> 0 then
      raise exception 'VERIFY(g): the forfeit left an open hunt, a world or a count'; end if;
    raise exception using errcode = 'HRDNF', message = 'deploy-no-forfeit §5 complete - rolling back';
  exception when sqlstate 'HRDNF' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or to_regprocedure('pg_temp.hr_dnf_probe(uuid,bigint,bigint,bigint)') is not null then
    raise exception 'VERIFY: §5 LEAKED a probe row or function'; end if;
  if (select (version, shape) from public.hunt_world_shape_move where id) is distinct from (select (version, shape) from public.hr_hunt_world_shape where id) then
    raise exception 'VERIFY: the move record is not the catalogue after the rollback'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hr_hunt_world_shape'::regclass and tgname = 'hr_hunt_world_shape_move' and not tgisinternal) then
    raise exception 'VERIFY: the catalogue has no move trigger'; end if;
  -- (h) the grants: the settle stays hr_engine's alone; the read engine-only; the new pieces the owner's.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % may run the instance settle', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
    raise exception 'VERIFY(h): hr_engine lost the instance settle or its read'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_instance_read(uuid,integer)', 'execute') then
      raise exception 'VERIFY(h): % reaches the engine read', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_settle_held(uuid,bigint,jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_world_shape_moved()', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)', 'execute') then
      raise exception 'VERIFY(h): % reaches a settle internal', v_role; end if;
    if has_table_privilege(v_role, 'public.hunt_world_shape_move', 'select')
       or has_table_privilege(v_role, 'public.hunt_world_shape_move', 'insert')
       or has_table_privilege(v_role, 'public.hunt_world_shape_move', 'update')
       or has_table_privilege(v_role, 'public.hunt_world_shape_move', 'delete') then
      raise exception 'VERIFY(h): % reaches hunt_world_shape_move', v_role; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.hunt_world_shape_move'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hunt_world_shape_move') then
    raise exception 'VERIFY(h): hunt_world_shape_move gained a policy or lost RLS'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'deploy-no-forfeit: a world of the shape the catalogue just replaced is held, never counted; the next engine lands the whole window; six genuine refusals still forfeit';
end $$;
