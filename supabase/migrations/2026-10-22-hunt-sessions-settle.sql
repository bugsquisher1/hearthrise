-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: THE SETTLE (lane C2, ruling HR-2026-10-14
-- "Hunt Sessions replace away", §2 / §4 / §5 row C2).
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: Security GO, then the Coordinator
-- applies (tools/apply-migration.mjs, one file, never inside begin/commit,
-- never 00:00–00:10 UTC). Applies AFTER 2026-10-21-hunt-sessions.sql (C1).
-- EDGE HALF: supabase/functions/hr-accrue/hunt-settle.js (the settle),
-- tick.js (the world tick carries `hunts`), index.ts (the hunt_settle /
-- hunt_use verbs). The edge and this file are safe in either order: an edge
-- without this file answers `no_hunt` (hr_hunt_open_of is absent → 42883 →
-- the hunt path is off); this file without the edge posts `hunts` to an edge
-- that ignores the key.
--
-- ── THE ONE RULE (ruling §2): THE WORLD TICK IS THE ONLY THING THAT SETTLES
--    A SESSION — plus the two hunt verbs a player can press, which run the
--    SAME settle through the SAME door.
--
-- ── WHAT ONE SETTLE IS ───────────────────────────────────────────────────────
--   The edge reads the session (hr_hunt_engine_read) and the character
--   (hr_state_of), runs computeAccrual with the session attached
--   (simulateHuntSpan — the one combat engine, per-swing keyed seeds), and
--   hands TWO halves of one proposal to ONE statement:
--
--     hr_hunt_apply(user, slot, session, version, intent, delta, hunt, buffs, press)
--       (1) the character lock + the session row (hr_hunt_lock — hr_apply's key)
--       (2) a manual press, validated exactly as hr_hunt_use validates it
--       (3) hr_apply(delta)  with hr.hunt_session set, so every ledger row it
--           writes (the accrue row, the death rows) is stamped with the session
--       (4) the press lands; the action bar's buff queue is validated + written
--       (5) hr_hunt_settle_session(hunt): swing CAS, window, bag, use caps,
--           presses-only-shrink, falls = the death rows (3) just wrote, every
--           end re-proved, tally folded from the stamped rows, events derived
--     All of (2)–(5) is ONE SUBTRANSACTION: any refusal in it (hr_apply's own
--     {ok:false}, an HR000 from the session applier) rolls every write of the
--     settle back, journals the refusal (hr_record_rejection, aggregated), and
--     answers {ok:false, error, stage}. Nothing half-lands: the value and the
--     session clock move together or not at all.
--
--   Edge decides WHAT should happen; Postgres decides WHETHER IT MAY.
--
-- ── THE OLD COMBAT PATH CANNOT PAY A HUNTER (C1 note 2) ─────────────────────
--   hr_hunt_accrue_fence: a BEFORE INSERT trigger on player_ledger that refuses
--   (hr_reject 'hunt_open') a combat ACCRUE row for a character holding an open
--   session unless the row is being written inside that session's own settle
--   (hr.hunt_session names it). hr_apply turns the HR000 into {ok:false,
--   error:'hunt_open'} and writes nothing. The edge already routes around it;
--   this makes it a property of the database.
--
-- ── WHO GETS SETTLED, AND WHEN (the world tick) ─────────────────────────────
--   hr_hunt_roster (hr_tick only) hands the cron driver the OPEN sessions that
--   are DUE, leased per session (hunt_tick_lease, `for update skip locked`):
--     · a pending leave / change, or the kill switch off   → the next fire
--     · an ONLINE character (heartbeat within 75 s)         → every flush
--     · an AWAY character                                   → every flush x fold
--   the SAME geometry the gather tick uses (hr_tick_config), so a hunt writes
--   at most the accrue row's rate: 960 settles/day online, 120 away at fold 8.
--   hr_tick_cron_run (restated, §8) posts them as their own body (`hunts`,
--   empty roster) to the same edge, under shard 0's holder. A session whose
--   settle is refused stays due and is offered again: owed, never lost.
--
-- ── IDEMPOTENCY AND CONCURRENCY ─────────────────────────────────────────────
--   Every settle carries an intent key: the tick derives it from
--   (session, swing_from, version, the session secret); a press carries the
--   player's own key. hr_apply's player_intents makes a replay answer
--   `replayed` and the wrapper then writes NOTHING else. Two settlers racing
--   one session serialise on the character lock; the loser is refused by the
--   swing CAS (`session_moved`) or the version CAS (`version_conflict`) and
--   re-reads. The lease only spares the duplicate engine work.
--
-- ── SCALE (100x: ~600 hunters) ──────────────────────────────────────────────
--   rows/day per hunting character: accrue 120 (away) – 960 (online all day),
--   + one consumption row per settle that used anything (C1), + death rows
--   (ladder-bounded), + hunt_session_events (~5-30/session). hunt_tick_lease:
--   one row per open session, upserted per visit, deleted with the session.
--   At 600 hunters: ≤ ~1.2 M ledger rows/day all online, ~150 k all away —
--   inside the 480 k/day prune ceiling at realistic online share; the same
--   envelope the gather tick was sized at.
--
-- ── REVERT (targeted) ───────────────────────────────────────────────────────
--   Re-apply the hr_tick_cron_run statement of 2026-10-11-world-tick-catchup.sql
--   §2; drop trigger hr_hunt_accrue_fence; drop functions hr_hunt_roster,
--   hr_hunt_apply, hr_hunt_buffs_put, hr_hunt_engine_read, hr_hunt_open_of,
--   hr_hunt_accrue_fence; drop table hunt_tick_lease; re-apply the
--   hr_assert_grant_hygiene block of 2026-10-10-world-tick-presence-horizon.sql.
--   No value is held by anything this file creates.
-- No begin/commit (CLAUDE.md §2 — tools/apply-migration.mjs sends one batch).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
declare v_cron text;
begin
  if to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_bag') is null
     or to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_view(uuid)') is null
     or to_regprocedure('public.hr_hunt_preset_slots(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_seed(uuid,integer,text)') is null
     or to_regclass('public.hr_item_buffs') is null or to_regclass('public.hr_hunt_supplies') is null
     or to_regclass('public.hr_tick_config') is null then
    raise exception 'PRECONDITION: the hunt-session tables / applier (2026-10-21-hunt-sessions.sql), hr_apply, '
                    'hr_state_of, hr_seed, hr_item_buffs, hr_hunt_supplies or hr_tick_config is absent';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_cron from pg_proc p
   where p.oid = to_regprocedure('public.hr_tick_cron_run()');
  if v_cron is null or v_cron not in ('aa35ea7090c298e145d8b55e90a39645', 'd05cbc3948b4ad0a2c90a3e72ae62da8') then
    raise exception 'PRECONDITION: hr_tick_cron_run prosrc md5 is %, expected 2026-10-11-world-tick-catchup.sql''s '
                    'aa35ea7090c298e145d8b55e90a39645 or this file''s d05cbc3948b4ad0a2c90a3e72ae62da8 — restate from the installed body', v_cron;
  end if;
  -- The online test below restates hr_frame_wanted's: 75 s, not in the future.
  if position('interval ''75 seconds''' in (select p.prosrc from pg_proc p
                where p.oid = to_regprocedure('public.hr_frame_wanted(uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_frame_wanted no longer uses a 75 s heartbeat; re-derive the roster''s online test.';
  end if;
end $mig$;

-- ── §1 THE TICK LEASE (one row per open session the driver is settling) ────
create table if not exists public.hunt_tick_lease (
  session_id  uuid primary key references public.hunt_sessions (id) on delete cascade,
  holder      text not null check (char_length(holder) between 1 and 64),
  lease_until timestamptz not null
);
alter table public.hunt_tick_lease enable row level security;
revoke all on public.hunt_tick_lease from public, anon, authenticated, service_role;
comment on table public.hunt_tick_lease is
  '2026-10-22 (hunt sessions C2). Which world-tick driver is settling which open session, until when. '
  'OPERATIONAL: holds no value; written only by hr_hunt_roster; deleted with its session. The lease spares '
  'duplicate engine work only — the character lock + swing CAS in hr_hunt_apply are the correctness.';

-- ── §2 hr_hunt_open_of — the engine's cheap "is a hunt open?" ──────────────
-- The accrue and collect paths ask it so the old combat pricing never runs for
-- a hunter (it answers hunt_open instead). Read-only, one indexed row.
create or replace function public.hr_hunt_open_of(p_user uuid, p_slot int)
returns uuid language sql stable security definer set search_path = public, pg_catalog as $$
  select h.id from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
$$;

-- ── §3 hr_hunt_engine_read — everything the settle needs about ONE session ──
-- Instants travel as EPOCH MILLISECONDS rounded UP (ceil): the engine walks a
-- millisecond clock, and every server instant it compares against (hunt_from
-- for the hours limit, leave_at, change_at, settled_to) must never read
-- EARLIER in the engine than in this database — an end the engine stamped a
-- microsecond before the stored instant would be refused `end_not_proven`.
-- `secret` is hr_seed(user, slot, 'hunt:' || session): the key of the edge's
-- per-swing HMAC (hunt-seed.js). Like every hr_seed value it is reachable by
-- the engine role only; no client role can call this function or hr_seed.
create or replace function public.hr_hunt_engine_read(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_engine_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'id', v_s.id, 'hunt', v_s.hunt_id, 'preset', v_s.preset, 'version', v_s.version,
    'hunt_from_ms', ceil(extract(epoch from v_s.hunt_from) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from v_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from v_s.next_swing_at) * 1000)::bigint,
    'swing_index', v_s.swing_index, 'falls', v_s.falls, 'falls_limit', v_s.falls_limit,
    'hours_limit', v_s.hours_limit, 'down', v_s.down,
    'cooldowns', v_s.cooldowns, 'presses', v_s.presses,
    'leave_at_ms', case when v_s.leave_at is null then null else ceil(extract(epoch from v_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when v_s.change_at is null then null else ceil(extract(epoch from v_s.change_at) * 1000)::bigint end,
    'change_to', v_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = v_s.id), '{}'::jsonb),
    'slots', coalesce(public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset), '[]'::jsonb),
    'secret', public.hr_seed(p_user, p_slot, 'hunt:' || v_s.id::text)::text,
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $$;

-- ── §4 hr_hunt_buffs_put — the queue the action bar leaves behind ──────────
-- The engine fires Feasts and draughts inside a window and proposes the
-- resulting queue in the server's absolute shape. It is ADMITTED, not trusted:
--   · shape: ≤ 64 segments, ≤ 8 per type, keys ⊆ {type, magnitude, until,
--     from, scale}, a known type, a magnitude some catalogued item of that
--     type carries, from ≤ until ≤ window end + 1 h, 1 ≤ scale ≤ 2;
--   · PAID FOR: a segment the stored queue did not hold (same type,
--     magnitude, until) must be backed by a bag use THIS window of an item of
--     that type and magnitude;
--   · BOUNDED: per type, the coverage the proposal adds over the stored live
--     queue (from the window start) is at most what this window's uses of that
--     type could buy at the largest scale (Σ duration × 2).
-- Refused segments refuse the whole settle (HR000 'bad_hunt_buffs' /
-- 'buff_not_paid' / 'buff_over_paid'); the queue never shrinks a player's
-- paid-for time except by the engine dropping a weaker segment its own merge
-- rule (src/core/buffs.js applyBuffSegment) covers.
create or replace function public.hr_hunt_buffs_put(p_user uuid, p_slot int, p_from timestamptz,
  p_to timestamptz, p_uses jsonb, p_buffs jsonb)
returns void language plpgsql set search_path = public, pg_catalog as $$
declare
  c_max_ms     constant bigint  := 3600000;     -- hr_apply c_buff_max_ms
  c_scale_max  constant numeric := 2;           -- hr_apply c_buff_scale_max
  c_max_segs   constant int     := 8;           -- hr_apply c_buff_max_segments
  v_e jsonb; v_t text; v_m numeric; v_u timestamptz; v_f timestamptz;
  v_stored jsonb;
  v_bad text;
begin
  if p_buffs is null then return; end if;
  if jsonb_typeof(p_buffs) <> 'array' or jsonb_array_length(p_buffs) > 64 then
    perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'not_an_array_or_too_long')); end if;
  select coalesce(buffs, '[]'::jsonb) into v_stored from public.player_state where user_id = p_user and slot = p_slot;
  for v_e in select value from jsonb_array_elements(p_buffs) loop
    if jsonb_typeof(v_e) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_e) k where k not in ('type', 'magnitude', 'until', 'from', 'scale'))
       or jsonb_typeof(v_e->'type') is distinct from 'string' or jsonb_typeof(v_e->'magnitude') is distinct from 'number'
       or jsonb_typeof(v_e->'until') is distinct from 'string'
       or (v_e ? 'from' and jsonb_typeof(v_e->'from') <> 'string')
       or (v_e ? 'scale' and (jsonb_typeof(v_e->'scale') <> 'number'
                              or (v_e->>'scale')::numeric < 1 or (v_e->>'scale')::numeric > c_scale_max)) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_shape'));
    end if;
    v_t := v_e->>'type'; v_m := (v_e->>'magnitude')::numeric;
    begin
      v_u := (v_e->>'until')::timestamptz;
      v_f := case when v_e ? 'from' then (v_e->>'from')::timestamptz end;
    exception when others then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_time'));
    end;
    if not exists (select 1 from public.hr_item_buffs b where b.type = v_t and b.magnitude = v_m) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'unknown_type_or_magnitude', 'type', left(v_t, 32)));
    end if;
    if v_u <= p_from or v_u > p_to + make_interval(secs => c_max_ms / 1000.0)
       or (v_f is not null and v_f > v_u) then
      perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_window', 'type', v_t));
    end if;
    -- PAID FOR: new or moved segments need a use of that type AND magnitude this window.
    if not exists (select 1 from jsonb_array_elements(v_stored) s(v)
                    where s.v->>'type' = v_t and (s.v->>'magnitude')::numeric = v_m
                      and (s.v->>'until')::timestamptz = v_u)
       and not exists (select 1 from jsonb_each_text(coalesce(p_uses, '{}'::jsonb)) u
                         join public.hr_item_buffs b on b.item_id = u.key
                        where b.type = v_t and b.magnitude = v_m and u.value::bigint > 0) then
      perform public.hr_reject('buff_not_paid', jsonb_build_object('type', v_t, 'magnitude', v_m));
    end if;
  end loop;
  -- ≤ c_max_segs live segments per type.
  select string_agg(t, ',') into v_bad from (
    select e.value->>'type' as t from jsonb_array_elements(p_buffs) e group by 1 having count(*) > c_max_segs) x;
  if v_bad is not null then
    perform public.hr_reject('bad_hunt_buffs', jsonb_build_object('why', 'segment_budget', 'types', v_bad)); end if;
  -- BOUNDED: added coverage per type ≤ Σ(uses of that type × duration × max scale).
  select string_agg(x.t, ',') into v_bad from (
    select p.t, p.cov - coalesce(s.cov, 0) as added, coalesce(u.buy, 0) as buy
      from (select e.value->>'type' as t,
                   sum(greatest(0, extract(epoch from ((e.value->>'until')::timestamptz
                        - greatest(p_from, coalesce((e.value->>'from')::timestamptz, p_from)))) * 1000)) as cov
              from jsonb_array_elements(p_buffs) e group by 1) p
      left join (select e.value->>'type' as t,
                        sum(greatest(0, extract(epoch from ((e.value->>'until')::timestamptz
                             - greatest(p_from, coalesce((e.value->>'from')::timestamptz, p_from)))) * 1000)) as cov
                   from jsonb_array_elements(v_stored) e
                  where (e.value->>'until')::timestamptz > p_from group by 1) s on s.t = p.t
      left join (select b.type as t, sum(u.value::bigint * b.duration_ms * c_scale_max) as buy
                   from jsonb_each_text(coalesce(p_uses, '{}'::jsonb)) u
                   join public.hr_item_buffs b on b.item_id = u.key group by 1) u on u.t = p.t) x
   where x.added > x.buy + 1000;
  if v_bad is not null then
    perform public.hr_reject('buff_over_paid', jsonb_build_object('types', v_bad)); end if;
  update public.player_state
     set buffs = (select coalesce(jsonb_agg(e.value order by (e.value->>'until')::timestamptz), '[]'::jsonb)
                    from jsonb_array_elements(p_buffs) e)
   where user_id = p_user and slot = p_slot;
end $$;

-- ── §5 hr_hunt_apply — ONE SETTLE, ONE STATEMENT, ONE SUBTRANSACTION ───────
create or replace function public.hr_hunt_apply(p_user uuid, p_slot int, p_session uuid, p_version bigint,
  p_intent uuid, p_delta jsonb, p_hunt jsonb, p_buffs jsonb default null, p_press jsonb default null,
  p_project boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_slots     constant int := coalesce(public.hr_hunt_limit('slots'), 10);
  v_role      text;
  v_s         public.hunt_sessions%rowtype;
  v_a         jsonb;
  v_h         jsonb;
  v_bar       jsonb;
  v_item      text;
  v_pslot     int;
  v_pat_ms    bigint;
  v_to        timestamptz;
  v_out       jsonb;
  v_code      text;
  v_detail    text;
begin
  -- (0) IDENTITY: the engine, never a request role (the primary control is the
  --     GRANT in §9; this is the hr_apply-style secondary seam).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null or p_session is null or p_version is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object'
     or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;

  -- (1) THE LOCK — hr_apply's advisory key + the session row, held to commit.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then
    return jsonb_build_object('ok', false, 'error', 'no_hunt');
  end if;

  -- (2) A MANUAL PRESS, judged exactly as hr_hunt_use judges one, before any
  --     write. `at` is the edge's read of now(): clamped into [settled_to,
  --     now()] so it can neither reach back past the settled window nor ahead.
  if p_press is not null then
    if jsonb_typeof(p_press) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_press) k where k not in ('slot', 'at'))
       or jsonb_typeof(p_press->'slot') is distinct from 'number' or (p_press->>'slot') !~ '^[0-9]{1,2}$'
       or jsonb_typeof(p_press->'at') is distinct from 'number' or (p_press->>'at') !~ '^[0-9]{1,15}$' then
      return jsonb_build_object('ok', false, 'error', 'bad_press');
    end if;
    if v_s.leave_at is not null or v_s.change_at is not null then
      return jsonb_build_object('ok', false, 'error', 'hunt_leaving'); end if;
    v_pslot := (p_press->>'slot')::int;
    if v_pslot >= c_slots then return jsonb_build_object('ok', false, 'error', 'bad_bar_slot'); end if;
    v_bar := public.hr_hunt_preset_slots(p_user, p_slot, v_s.preset) -> v_pslot;
    if v_bar is null then return jsonb_build_object('ok', false, 'error', 'bad_bar_slot'); end if;
    v_item := v_bar->>'item';
    if not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                    where b.session_id = v_s.id and b.qty_left > 0
                      and ((v_item = '*heal' and p.kind = 'heal') or b.item_id = v_item)) then
      return jsonb_build_object('ok', false, 'error', 'bag_empty'); end if;
    if exists (select 1 from jsonb_array_elements(v_s.presses) e where (e.value->>'slot')::int = v_pslot)
       or jsonb_array_length(v_s.presses) >= c_slots then
      return jsonb_build_object('ok', false, 'error', 'press_queued'); end if;
    v_pat_ms := least(greatest((p_press->>'at')::bigint,
                               ceil(extract(epoch from v_s.settled_to) * 1000)::bigint),
                      floor(extract(epoch from now()) * 1000)::bigint);
  end if;

  -- (3)–(5) ONE SUBTRANSACTION: a refusal anywhere in it un-writes all of it.
  begin
    perform set_config('hr.hunt_session', p_session::text, true);
    v_a := public.hr_apply(p_user, p_slot, p_version, p_intent, p_delta);
    perform set_config('hr.hunt_session', '', true);
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      -- hr_apply wrote nothing but its own rejection record; answer as-is.
      return v_a || jsonb_build_object('stage', 'apply');
    end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then
      -- THIS window already landed under this key: nothing else may move.
      return v_a || jsonb_build_object('stage', 'replayed');
    end if;
    if p_press is not null then
      update public.hunt_sessions
         set presses = presses || jsonb_build_array(jsonb_build_object('slot', v_pslot, 'at', v_pat_ms)),
             version = version + 1
       where id = p_session;
    end if;
    if p_buffs is not null then
      begin v_to := (p_hunt->>'to')::timestamptz;
      exception when others then perform public.hr_reject('bad_window'); end;
      perform public.hr_hunt_buffs_put(p_user, p_slot, v_s.settled_to, v_to, p_hunt->'uses', p_buffs);
    end if;
    v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, p_hunt);
    -- C1 rev. 1 answered refusals as {ok:false}; the contract is a rollback.
    if coalesce(v_h->>'ok', 'true') = 'false' then
      perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h);
    end if;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    perform public.hr_record_rejection(p_user, p_slot, 'hunt_settle', v_code,
      jsonb_build_object('session', p_session, 'swing_from', p_hunt->'swing_from'));
    return jsonb_build_object('ok', false, 'error', v_code, 'stage', 'session',
      'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end);
  end;

  v_out := case when p_project then public.hr_state_of(p_user, p_slot) else v_a end;
  return v_out || jsonb_build_object('ok', true, 'hunt_settle', v_h,
                                     'session', public.hr_hunt_view(p_session));
end $$;

-- ── §6 THE FENCE: no combat accrue row for a hunter outside its own settle ─
create or replace function public.hr_hunt_accrue_fence()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_s uuid; v_g text := coalesce(current_setting('hr.hunt_session', true), '');
begin
  select h.id into v_s from public.hunt_sessions h
   where h.user_id = new.user_id and h.slot = new.slot and h.ended_at is null;
  if v_s is not null and v_g <> v_s::text then
    perform public.hr_reject('hunt_open', jsonb_build_object('session', v_s));
  end if;
  return new;
end $$;
revoke execute on function public.hr_hunt_accrue_fence() from public, anon, authenticated, service_role;
drop trigger if exists hr_hunt_accrue_fence on public.player_ledger;
create trigger hr_hunt_accrue_fence before insert on public.player_ledger
  for each row when (new.kind = 'combat' and new.intent = 'accrue')
  execute function public.hr_hunt_accrue_fence();

-- ── §6b THE TWO CLIENT CREDIT DOORS ARE SHUT FOR A HUNTER ───────────────────
-- hr_credit_combat_xp (live combat XP) and hr_credit_kills (attended kill
-- credit) let the CLIENT report what its own 2.4 s fight did. A hunt has no
-- client fight: the hunt settle pays every swing's XP and files every kill
-- counter itself, ignoring combat_xp_accrued_to — so a credit on top would pay
-- the same fight TWICE (XP is ranked; the kill counters feed bounties, dailies
-- and renown). Each wrapper is RESTATED WHOLE from its installed body (md5
-- pinned below) with ONE change: the call to __ungated is skipped, and
-- `hunt_open` answered instead, while the caller holds an open session. Still
-- ONE hr_note_rejection seam per wrapper (tests/rejections-journal.mjs P6).
-- hr_credit_kills is dropped outright by 2026-10-22-hunt-sessions-drop-away.sql;
-- this covers the window between the C2 deploy and that apply.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_credit_combat_xp(integer,jsonb,text)');
  if v_md5 is null or (v_md5 <> 'b96fd20d3a8e7226a69a3857653212df'
       and strpos((select prosrc from pg_proc where oid = 'public.hr_credit_combat_xp(integer,jsonb,text)'::regprocedure),
                  'hr_hunt_open_of') = 0) then
    raise exception 'hr_credit_combat_xp is not the body this file restates (md5 %) — restate from the installed body', v_md5;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc
   where oid = to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)');
  if v_md5 is not null and v_md5 <> 'b5362b470a8b442e1ba8ed72fafcb7ed'
     and strpos((select prosrc from pg_proc where oid = 'public.hr_credit_kills(integer,text,bigint,text)'::regprocedure),
                'hr_hunt_open_of') = 0 then
    raise exception 'hr_credit_kills is not the body this file restates (md5 %) — restate from the installed body', v_md5;
  end if;
end $mig$;

CREATE OR REPLACE FUNCTION public.hr_credit_combat_xp(p_slot integer, p_xp jsonb, p_idem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if not public.hr_rpc_gate('hr_credit_combat_xp') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql §6b): a hunter's combat
  -- XP is the hunt settle's to pay; a client credit on top would pay it twice.
  return public.hr_note_rejection('hr_credit_combat_xp', p_slot,
    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null
         then jsonb_build_object('ok', false, 'error', 'hunt_open')
         else public.hr_credit_combat_xp__ungated($1, $2, $3) end);
end $function$;
revoke execute on function public.hr_credit_combat_xp(integer, jsonb, text) from public, anon, service_role;
grant execute on function public.hr_credit_combat_xp(integer, jsonb, text) to authenticated;

do $mig$
begin
  if to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is null then return; end if;
  execute $def$
CREATE OR REPLACE FUNCTION public.hr_credit_kills(p_slot integer, p_target text, p_claimed bigint, p_idem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('hr_credit_kills', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if not public.hr_rpc_gate('hr_credit_kills') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql §6b): a hunter's kill
  -- counters are the hunt settle's to file; a client credit would file them twice.
  return public.hr_note_rejection('hr_credit_kills', p_slot,
    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null
         then jsonb_build_object('ok', false, 'error', 'hunt_open')
         else public.hr_credit_kills__ungated($1, $2, $3, $4) end);
end $function$;
$def$;
  execute 'revoke execute on function public.hr_credit_kills(integer, text, bigint, text) from public, anon, service_role';
  execute 'grant execute on function public.hr_credit_kills(integer, text, bigint, text) to authenticated';
end $mig$;

-- ── §7 hr_hunt_roster — the due open sessions, leased to ONE driver ────────
create or replace function public.hr_hunt_roster(p_holder text, p_limit int default 200, p_lease_ms int default 30000)
returns table (user_id uuid, slot int, session_id uuid)
language plpgsql security definer set search_path = public, pg_catalog as $$
#variable_conflict use_column
declare
  c_max_rows constant int := 500;
  v_role    text;
  v_limit   int;
  v_lease   interval;
  v_holder  text;
  v_flush   interval;
  v_fold    int;
  v_enabled boolean;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_engine') then
    raise exception 'hr_hunt_roster: not callable by %', v_role using errcode = '42501';
  end if;
  v_limit  := least(greatest(coalesce(p_limit, 200), 1), c_max_rows);
  v_lease  := make_interval(secs => least(greatest(coalesce(p_lease_ms, 30000), 5000), 300000) / 1000.0);
  v_holder := left(coalesce(nullif(p_holder, ''), 'unnamed'), 64);
  select make_interval(secs => c.flush_seconds), c.fold_windows into v_flush, v_fold
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, interval '90 seconds');
  v_fold  := least(greatest(coalesce(v_fold, 1), 1), 8);
  v_enabled := coalesce((select c.enabled from public.hr_hunt_config c where c.id), false);
  return query
  with due as (
    select h.id, h.user_id as uid, h.slot as sl, h.settled_to
      from public.hunt_sessions h
      join public.player_state ps on ps.user_id = h.user_id and ps.slot = h.slot
      left join public.hunt_tick_lease l on l.session_id = h.id
     where h.ended_at is null
       and h.settled_to <= now()                                  -- not walking, not ahead
       and (l.session_id is null or l.lease_until < now() or l.holder = v_holder)
       and (h.leave_at is not null or h.change_at is not null or not v_enabled
            or h.settled_to <= now() - v_flush * (
                 case when coalesce(ps.last_seen_at >  now() - interval '75 seconds'
                                and ps.last_seen_at <= now() + interval '60 seconds', false)
                      then 1 else v_fold end))
     order by h.settled_to, h.id
     limit v_limit
     for update of h skip locked
  ), leased as (
    insert into public.hunt_tick_lease as t (session_id, holder, lease_until)
    select d.id, v_holder, now() + v_lease from due d
    on conflict (session_id) do update set holder = excluded.holder, lease_until = excluded.lease_until
    returning t.session_id
  )
  select d.uid, d.sl, d.id from due d join leased x on x.session_id = d.id
   order by d.settled_to, d.id;
end $$;

-- ── §8 hr_tick_cron_run — RESTATED WHOLE: the catch-up body + the hunts ────
-- 2026-10-11-world-tick-catchup.sql §2 (md5 aa35ea7090c298e145d8b55e90a39645)
-- with THREE insertions and one widened predicate, nothing else:
--   + v_hunts / v_nh declared
--   + after the shard loop: hr_hunt_roster under shard 0's holder; when it
--     returns sessions they ride THEIR OWN body (`roster: []`, `hunts: [...]`)
--     so every gather body stays byte-identical
--   ~ `if v_n = 0` → `if v_n = 0 and v_nh = 0` (a fire with only hunts posts)
--   + the fire log and the answer carry `hunts`
create or replace function public.hr_tick_cron_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_t0       timestamptz := clock_timestamp();
  v_cfg      public.hr_tick_config%rowtype;
  -- THE FAN-OUT (2026-10-11, world-tick scale S2). One POST per SHARD per
  -- fire, each to its own edge invocation, each under its own lease holder.
  -- Shard 0's holder is byte-identical to the single-POST driver's, so at
  -- shards = 1 every byte this function stamps, posts and logs is unchanged
  -- except the roster rows' dead `state` key (S1 made it NULL) and the
  -- cursor's home (hr_tick_shard_cursor).
  v_shards   int;
  k          int;
  v_holders  text[]  := '{}';
  v_bodies   text[]  := '{}';
  v_counts   int[]   := '{}';
  v_auths    text[]  := '{}';
  v_holder   text;
  v_batch    jsonb;
  v_nk       int;
  v_n        int := 0;
  v_last_u   uuid;
  v_last_s   int;
  v_last_a   timestamptz;
  v_cur      public.hr_tick_shard_cursor%rowtype;
  v_wrapped  boolean := true;
  v_gateway  text;
  v_body_sha text;
  v_bucket   bigint;
  v_auth     text;
  -- The BOOLEAN the fire log carries, computed before the note rather than
  -- inside it. d8b's rule is blunt on purpose — no `hr_tick_cron_note(...)`
  -- argument list may name `v_auth` at all — and a rule with an exception for
  -- "but only in a predicate" is a rule that stops being checkable.
  v_have_tok boolean := true;
  v_eff      int := 0;
  -- THE ADMISSION COUNTER (2026-10-06, ruling 1: shadow-chain admission ends
  -- LOUDLY). Owned, on-channel, unpartied characters the roster's admission
  -- predicate dropped, by reason. NULL when nobody was dropped, so a healthy
  -- fire's log row does not grow.
  v_adm      jsonb;
  v_out      text;
  v_ms       int;
  v_posted   int := 0;
  -- HUNT SESSIONS (2026-10-22-hunt-sessions-settle.sql): the due OPEN
  -- sessions, leased under shard 0's holder, posted as their own body.
  v_hunts    jsonb;
  v_nh       int := 0;
begin
  -- ── (1) THE ADVISORY LOCK, TAKEN FIRST. Unchanged: `_xact_` so pg_cron's own
  --        transaction releases it at commit even if this function raises, and
  --        `pg_try_` so a held lock means SKIP THIS FIRE rather than queue. ONE
  --        lock for every shard: the shards are one fire.
  if not pg_try_advisory_xact_lock(hashtext('hr_tick_cron_run')) then
    perform public.hr_tick_cron_note('locked', 0);
    return jsonb_build_object('ok', true, 'outcome', 'locked');
  end if;

  -- ── (2) THE KILL SWITCH, FAILING CLOSED. A missing row is "off".
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    perform public.hr_tick_cron_note('disabled', 0);
    return jsonb_build_object('ok', true, 'outcome', 'disabled');
  end if;
  if v_cfg.edge_url is null or v_cfg.edge_url = '' then
    perform public.hr_tick_cron_note('no_edge_url', 0);
    return jsonb_build_object('ok', false, 'outcome', 'no_edge_url');
  end if;
  -- The CHECK holds shards to 1..16; a NULL (impossible: NOT NULL) reads as 1.
  v_shards := least(greatest(coalesce(v_cfg.shards, 1), 1), 16);

  -- ── (2b) WHO ADMISSION DROPPED, COUNTED (2026-10-06). Unchanged: once per
  --         fire, over the whole owned cohort (every shard).
  select case when count(*) = 0 then null
              else jsonb_object_agg(x.why, x.n) end
    into v_adm
    from (select ad.why, count(*)::int as n
            from public.hr_tick_ownership o
            join public.player_state ps
              on ps.user_id = o.user_id and ps.slot = o.slot
           cross join lateral (
             select coalesce(o.channel = any (v_cfg.armed_channels), false) as armed) a
           cross join lateral (
             select public.hr_tick_admit(a.armed, ps.accrued_to,
                      case when not a.armed
                           then greatest(ps.accrued_to, coalesce(o.shadow_accrued_to, ps.accrued_to))
                           else ps.accrued_to end) as why) ad
           where o.owned
             and o.channel = ps.active_kind
             and ps.active_kind = any (v_cfg.channels)
             and not public.hr_partied(o.user_id, o.slot)
             and ad.why <> 'admit'
           group by ad.why) x;

  -- ── (3) THE BATCHES, ONE PER SHARD. `hr_shard_of` (a stable hash of user_id
  --        mod shards) partitions the owned cohort, so the shards' rosters are
  --        DISJOINT by construction; the per-shard holder makes a character
  --        leased by one shard unclaimable by another until that lease ends
  --        (the roster's lease predicate), which is what keeps a change of
  --        `shards` from ever handing one character to two invocations.
  --        `r.accrued_to` is the EFFECTIVE watermark (Security M-1).
  for k in 0 .. v_shards - 1 loop
    -- THE HOLDER. Shard 0: the single-POST driver's expression, unchanged.
    -- Shard k > 0: the same prefix cut to 58 so ':s<k>' always fits in 64 and
    -- can never be truncated into shard 0's name. tick.js TICK_HOLDER_SQL is
    -- the same expression; tests/world-tick-scale.mjs H1 drives both.
    v_holder := case when k = 0 then left('cron:' || coalesce(current_database(), 'db'), 64)
                     else left('cron:' || coalesce(current_database(), 'db'), 58) || ':s' || k end;
    select * into v_cur from public.hr_tick_shard_cursor where shard = k;
    if not found then
      v_cur.cursor_at := null; v_cur.cursor_user := null; v_cur.cursor_slot := null;
    end if;
    select jsonb_agg(jsonb_build_object(
             'user_id', r.user_id, 'slot', r.slot, 'shard', r.shard,
             'active_kind', r.active_kind, 'active_id', r.active_id,
             'active_since', r.active_since, 'accrued_to', r.accrued_to,
             'shadow_accrued_to', r.shadow_accrued_to,
             'version', r.version, 'seed', r.seed)
             order by r.accrued_to, r.user_id, r.slot),
           count(*),
           max(r.accrued_to)
      into v_batch, v_nk, v_last_a
      from public.hr_tick_roster(v_cfg.channels, k, v_cfg.batch_limit, v_holder,
                                 v_cfg.lease_ms, v_cur.cursor_at, v_cur.cursor_user,
                                 v_cur.cursor_slot) r;
    v_nk := coalesce(v_nk, 0);

    if v_nk < v_cfg.batch_limit then
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, null, null, null, now())
      on conflict (shard) do update set cursor_at = null, cursor_user = null,
             cursor_slot = null, updated_at = now();
    else
      v_wrapped := false;
      select (e->>'user_id')::uuid, (e->>'slot')::int
        into v_last_u, v_last_s
        from jsonb_array_elements(v_batch) e
       order by (e->>'accrued_to')::timestamptz desc, (e->>'user_id')::uuid desc, (e->>'slot')::int desc
       limit 1;
      insert into public.hr_tick_shard_cursor (shard, cursor_at, cursor_user, cursor_slot, updated_at)
      values (k, v_last_a, v_last_u, v_last_s, now())
      on conflict (shard) do update set cursor_at = excluded.cursor_at, cursor_user = excluded.cursor_user,
             cursor_slot = excluded.cursor_slot, updated_at = now();
    end if;

    if v_nk > 0 then
      v_n := v_n + v_nk;
      v_eff := greatest(v_eff,
        v_cfg.cadence_seconds * greatest(1, ceil(v_nk::numeric / greatest(1, v_cfg.batch_limit))::int));
      v_holders := v_holders || v_holder;
      v_counts  := v_counts || v_nk;
      -- ── (4a) THE BODY, AS TEXT, BECAUSE THE MAC BINDS THE BYTES.
      --         `net.http_post` stores `convert_to(body::text,'UTF8')` and sends
      --         those bytes verbatim, so hashing this exact text and posting
      --         `v_body_txt::jsonb` hashes what leaves. `shard` is the one new
      --         key: the edge derives its holder from it (a SELECTOR, bound by
      --         the MAC like every byte here; the fence still refuses any
      --         character whose lease is not that holder's).
      v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                   'shard', k,
                                   -- per channel since 2026-10-06; the
                                   -- edge IGNORES this key (tick.js reads
                                   -- the mode off the fence), it is here
                                   -- for the operator reading the queue.
                                   'armed', to_jsonb(v_cfg.armed_channels),
                                   'cadence_ms', v_cfg.cadence_seconds * 1000,
                                   'flush_ms', v_cfg.flush_seconds * 1000,
                                   -- CATCH-UP AND FOLD (2026-10-11, S3/S4):
                                   -- how many flush windows one visit may
                                   -- settle, and how many of them one settle
                                   -- (one ledger row) may carry. GEOMETRY
                                   -- like cadence/flush: clamped again by the
                                   -- edge; the fence decides every payment.
                                   'catchup_windows', v_cfg.catchup_windows,
                                   'fold_windows', v_cfg.fold_windows,
                                   'roster', v_batch)::text);
    end if;
  end loop;

  -- The single-POST driver kept its cursor on the config row. Retired there
  -- (hr_tick_shard_cursor is the cursor now); cleared so nobody reads a stale one.
  update public.hr_tick_config set cursor_at = null, cursor_user = null,
         cursor_slot = null, updated_at = now() where id;

  -- ── (3c) THE HUNTS (2026-10-22, lane C2). The due open hunt sessions
  --         (hr_hunt_roster: a pending leave/change or the kill switch at
  --         the next fire, an online character every flush, an away one every
  --         flush x fold), leased to shard 0's holder. They ride THEIR OWN
  --         body — an empty roster and a `hunts` array — so every gather body
  --         above is byte-identical to the catch-up driver's. SELECTORS only:
  --         the edge re-reads every session and the character itself, and
  --         hr_hunt_apply decides whether anything may land.
  v_holder := left('cron:' || coalesce(current_database(), 'db'), 64);
  select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'slot', r.slot, 'session_id', r.session_id)),
         count(*)
    into v_hunts, v_nh
    from public.hr_hunt_roster(v_holder, v_cfg.batch_limit, v_cfg.lease_ms) r;
  v_nh := coalesce(v_nh, 0);
  if v_nh > 0 then
    v_holders := v_holders || v_holder;
    v_counts  := v_counts || v_nh;
    v_bodies := v_bodies || (jsonb_build_object('op', 'tick', 'holder', v_holder,
                                 'shard', 0,
                                 'armed', to_jsonb(v_cfg.armed_channels),
                                 'cadence_ms', v_cfg.cadence_seconds * 1000,
                                 'flush_ms', v_cfg.flush_seconds * 1000,
                                 'catchup_windows', 1,
                                 'fold_windows', 1,
                                 'roster', '[]'::jsonb,
                                 'hunts', v_hunts)::text);
  end if;

  if v_n = 0 and v_nh = 0 then
    perform public.hr_tick_cron_note('empty',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, 0, null,
     case when v_adm is null then null else jsonb_build_object('admission', v_adm) end);
    return jsonb_build_object('ok', true, 'outcome', 'empty');
  end if;

  -- ── (4) THE GATEWAY KEY. STILL A VARIABLE, AND THAT IS CORRECT: it is the
  --        project ANON key, public by design (src/net/supabase-bootstrap.js),
  --        read from Vault only so a project move is a Vault write rather than
  --        a migration. `supabase/config.toml` pins `verify_jwt = true` on
  --        hr-accrue and it STAYS ON (tests/edge-jwt-gate.mjs --strict), so the
  --        Supabase gateway refuses the request before the function runs unless
  --        `Authorization` carries a JWT it accepts. IT IS NOT THE TICK'S
  --        AUTHORISATION and must never be mistaken for it.
  if to_regclass('vault.decrypted_secrets') is null then
    v_gateway := null;
  else
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_gateway using 'hr_tick_gateway_key';
  end if;

  -- T-5.3's bucket, on `now()` (transaction time) exactly as the ruling spells
  -- it. The edge accepts {n-1, n, n+1}, so the ≤90 s window absorbs both the
  -- fire's own duration and any Postgres↔edge skew. One bucket per fire.
  v_bucket := floor(extract(epoch from now()) / 30)::bigint;

  -- ── (4b) THE DERIVATION, PER BODY. pgcrypto absent is `no_hmac` and NOTHING
  --         IS POSTED for any shard: there is no static fallback, by
  --         construction — this function has no code path that can put a
  --         long-lived secret on the wire. Every MAC is derived before any POST,
  --         so a fire either posts every shard's body or none.
  for k in 1 .. cardinality(v_bodies) loop
    v_body_sha := public.hr_tick_body_sha256(v_bodies[k]);
    if v_body_sha is null then
      perform public.hr_tick_cron_note('no_hmac',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('hint', 'pgcrypto is not reachable: create extension if not exists pgcrypto'));
      return jsonb_build_object('ok', false, 'outcome', 'no_hmac', 'rostered', v_n);
    end if;
    v_auth := public.hr_tick_auth_header(v_bucket, v_body_sha);
    v_have_tok := v_have_tok and v_auth is not null;
    v_auths := v_auths || v_auth;
  end loop;

  if not v_have_tok or v_gateway is null or v_gateway = '' then
    perform public.hr_tick_cron_note('no_secret',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     -- ⚠ THE HINT DOES NOT NAME THE TICK SECRET, and that is load-bearing
     --   rather than coy: d9 asserts that `hr_tick_cron_run`'s installed body
     --   mentions it NOWHERE, which is what makes "exactly one routine in
     --   public can reach the plaintext" a checkable equality instead of a
     --   claim. §6 of 2026-09-22-world-tick-derived-token.sql carries both names
     --   for the operator.
     jsonb_build_object('hint', 'vault needs the tick token secret (>= 32 chars) and the gateway key'
                                ' — see §6 of 2026-09-22-world-tick-derived-token.sql',
                        'have_tick_token', v_have_tok,
                        'have_gateway_key', v_gateway is not null and v_gateway <> ''));
    return jsonb_build_object('ok', false, 'outcome', 'no_secret', 'rostered', v_n);
  end if;

  -- ── (5) THE POSTS. Dynamic EXECUTE so this file APPLIES where pg_net is not
  --        installed; the job then reports `pg_net_absent` every fire, which is
  --        a visible, harmless, fixable state rather than a migration that will
  --        not replay. pg_net sends the queued requests CONCURRENTLY after this
  --        transaction commits: N shards are N parallel edge invocations.
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    perform public.hr_tick_cron_note('pg_net_absent',
     floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
     jsonb_build_object('hint', 'create extension if not exists pg_net'));
    return jsonb_build_object('ok', false, 'outcome', 'pg_net_absent', 'rostered', v_n);
  end if;

  v_out := 'posted';
  for k in 1 .. cardinality(v_bodies) loop
    begin
      execute 'select net.http_post($1, $2, $3, $4, $5)'
        using v_cfg.edge_url,
              v_bodies[k]::jsonb,
              '{}'::jsonb,
              jsonb_build_object('Content-Type', 'application/json',
                                 -- the GATEWAY's gate...
                                 'Authorization', 'Bearer ' || v_gateway,
                                 -- ...and the tick's own, DERIVED PER BODY. The
                                 -- Vault secret is not here and never was: this
                                 -- value is a mac over (bucket, body hash).
                                 'X-HR-Tick-Auth', v_auths[k]),
              greatest(1000, v_cfg.cadence_seconds * 1000 - 1000);
      v_posted := v_posted + 1;
    exception when others then
      -- Nothing derived from a secret reaches the log even in an error path.
      -- The shards already queued stay queued (their sub-transactions
      -- committed); the fire is logged `error` with how many went out.
      perform public.hr_tick_cron_note('error',
       floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int, v_n, v_eff,
       jsonb_build_object('sqlstate', sqlstate, 'posted_shards', v_posted));
      return jsonb_build_object('ok', false, 'outcome', 'error', 'sqlstate', sqlstate);
    end;
  end loop;

  -- ⚠ THE MAC IS NOT JOURNALLED EITHER. It is not the secret, but it is a valid
  --   credential for one body for ≤90 s, and `hr_tick_cron_log` exists to be
  --   read by an operator. `bucket` is logged because it is a clock reading and
  --   nothing else. d8 executes the absence of any 64-hex run in `detail`.
  --   `shards` / `rostered_by_shard` appear only when the fire fanned out, so a
  --   one-shard fire's log row is the single-POST driver's, key for key.
  v_ms := floor(extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  perform public.hr_tick_cron_note(v_out, v_ms, v_n, v_eff,
    jsonb_build_object('armed', to_jsonb(v_cfg.armed_channels), 'holder', v_holders[1],
                       'auth', 'v1', 'bucket', v_bucket,
                       'cursor_wrapped', v_wrapped, 'hunts', v_nh)
    || case when v_shards > 1
            then jsonb_build_object('shards', v_shards, 'rostered_by_shard', to_jsonb(v_counts),
                                    'holders', to_jsonb(v_holders))
            else '{}'::jsonb end
    || case when v_adm is null then '{}'::jsonb else jsonb_build_object('admission', v_adm) end);
  return jsonb_build_object('ok', true, 'outcome', v_out, 'rostered', v_n,
                            'armed', to_jsonb(v_cfg.armed_channels), 'ms', v_ms,
                            'auth', 'v1',
                            'effective_cadence_seconds', v_eff, 'hunts', v_nh)
    || case when v_shards > 1 then jsonb_build_object('shards', v_shards, 'posts', v_posted)
            else '{}'::jsonb end;
end $$;

-- ── §9 GRANTS — EXACT, REVOKE FIRST ────────────────────────────────────────
do $mig$
declare f text; r text;
begin
  foreach f in array array[
    'public.hr_hunt_open_of(uuid, int)', 'public.hr_hunt_engine_read(uuid, int)',
    'public.hr_hunt_buffs_put(uuid, int, timestamptz, timestamptz, jsonb, jsonb)',
    'public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean)',
    'public.hr_hunt_roster(text, int, int)', 'public.hr_tick_cron_run()'] loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
end $mig$;
grant execute on function public.hr_hunt_open_of(uuid, int) to hr_engine;
grant execute on function public.hr_hunt_engine_read(uuid, int) to hr_engine;
grant execute on function public.hr_hunt_apply(uuid, int, uuid, bigint, uuid, jsonb, jsonb, jsonb, jsonb, boolean) to hr_engine;
grant execute on function public.hr_hunt_roster(text, int, int) to hr_tick;

-- THE DETECTOR learns the three engine entries (link 18 of
-- HR_GRANT_HYGIENE_CHAIN): an INSERTION at the head of c_engine_allow, derived
-- from 2026-10-10-world-tick-presence-horizon.sql's committed block by
-- tools/derive-grant-hygiene.mjs — never hand-edited.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- ── ADDED 2026-09-11 — THE QUARTERMASTER SPEND WRITER ───────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, and an OFFER ID (a primary key in the generated,
    -- client-unwritable hr_qm_offers). No item, no qty, no price and no scrip
    -- amount cross. The PRICE and the ITEM come from hr_qm_offers; the scrip
    -- balance is the character's OWN player_state row read under the SAME advisory
    -- lock hr_apply takes; the debit is bounded by that balance
    -- (insufficient_scrip). NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip is server-of-record and its SPEND (the Quartermaster) must be
    -- one server transaction with the item grant, or the b372 half-undo returns —
    -- and NO other RPC debits player_state.dungeon_scrip, so without this the only
    -- writer of the spend is the client.
    'hr_quartermaster_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-09-10 — THE DUNGEON SETTLE WRITER ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a version, an
    -- idempotency uuid, a DUNGEON ID (a primary key in the generated,
    -- client-unwritable hr_dungeons), a MODE (auto|manual|scavenger), and a
    -- p_quality CLAMPED server-side to [0,1] that scales SELF-ONLY scrip and
    -- touches NO loot. No item, no qty, no chance, no price and no timestamp
    -- cross. Every number it writes comes from hr_dungeons / hr_dungeon_loot or
    -- the character's OWN row read under the SAME advisory lock hr_apply takes;
    -- loot is rolled by the server hr_seed PRNG (never a client value); the entry
    -- KEY is debited from the caller's own player_inventory (the load-bearing
    -- gate); the cooldown and the per-day scrip cap read now() and the
    -- append-only ledger. NO NEW TARGET: p_user is the parameter the engine
    -- already passes to hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT:
    -- dungeon scrip + run loot are server-of-record (dungeon-settlement.md
    -- §1/§2) and NO other RPC writes player_state.dungeon_scrip, so without this
    -- the only writer of the currency is the client.
    'hr_dungeon_settle(uuid,integer,bigint,uuid,text,text,numeric)',
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean) from public, anon, authenticated, service_role;

-- ── §10 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ────────────────
do $mig$
declare
  v_uid  uuid := '00000000-0000-4000-8000-0000000c2b01';
  v_r    jsonb;
  v_sid  uuid;
  v_ver  bigint;
  v_from timestamptz;
  v_to   timestamptz;
  v_n    bigint;
  v_gold bigint;
  v_h    jsonb;
  v_f    text;
  v_role text;
  v_hunt jsonb;
  v_delta jsonb;
begin
  -- (a) PRIVILEGES. Engine functions: hr_engine only. The roster: hr_tick only.
  --     The buff writer and the fence: nobody. The lease table: no grant.
  foreach v_f in array array['public.hr_hunt_open_of(uuid,integer)', 'public.hr_hunt_engine_read(uuid,integer)',
      'public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)'] loop
    if not has_function_privilege('hr_engine', v_f, 'execute') then raise exception 'GATE(a): hr_engine cannot execute %', v_f; end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_tick'] loop
      if has_function_privilege(v_role, v_f, 'execute') then raise exception 'GATE(a): % can execute %', v_role, v_f; end if;
    end loop;
  end loop;
  if not has_function_privilege('hr_tick', 'public.hr_hunt_roster(text,integer,integer)', 'execute') then
    raise exception 'GATE(a): hr_tick cannot execute hr_hunt_roster'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_role, 'public.hr_hunt_roster(text,integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_buffs_put(uuid,integer,timestamp with time zone,timestamp with time zone,jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_accrue_fence()', 'execute')
       or has_function_privilege(v_role, 'public.hr_tick_cron_run()', 'execute')
       or has_table_privilege(v_role, 'public.hunt_tick_lease', 'select,insert,update,delete') then
      raise exception 'GATE(a): % reaches an internal of this file', v_role; end if;
  end loop;
  if position('''hunts''' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0
     or position('hr_hunt_roster(' in (select p.prosrc from pg_proc p where p.oid = 'public.hr_tick_cron_run()'::regprocedure)) = 0 then
    raise exception 'GATE(a): the installed driver does not post hunts';
  end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC2B ──────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;
    delete from public.player_inventory where user_id = v_uid and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, 'cooked_shrimp', 20);
    update public.hr_hunt_config set enabled = true where id;
    v_r := public.hr_hunt_enter(0, 'mill_cellar', '[{"item":"cooked_shrimp","qty":12}]', 0, null, null, gen_random_uuid());
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(b): enter answered %', v_r; end if;
    v_sid := (v_r->'session'->>'id')::uuid;
    update public.hunt_sessions set entered_at = now() - interval '10 minutes', hunt_from = now() - interval '9 minutes',
                                    settled_to = now() - interval '9 minutes', next_swing_at = now() - interval '9 minutes'
     where id = v_sid;
    select settled_to into v_from from public.hunt_sessions where id = v_sid;
    v_to := v_from + interval '24 seconds';
    select version, gold into v_ver, v_gold from public.player_state where user_id = v_uid and slot = 0;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) THE ENGINE READ answers the session, the bag and a 64-bit secret text.
    set local role hr_engine;
    v_h := public.hr_hunt_engine_read(v_uid, 0);
    reset role;
    if coalesce(v_h->>'open', 'false') <> 'true' or (v_h->>'id')::uuid <> v_sid
       or (v_h->'bag'->'cooked_shrimp'->>'left')::int <> 12 or (v_h->>'secret') !~ '^-?[0-9]{1,20}$'
       or (v_h->>'settled_to_ms')::bigint < floor(extract(epoch from v_from) * 1000) then
      raise exception 'GATE(b): the engine read answered %', v_h; end if;

    v_delta := jsonb_build_object('gold', 10, 'xp', jsonb_build_object('attack', 5),
      'accrued_to', to_jsonb(v_to),
      'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
        'meta', jsonb_build_object('ms', 24000, 'ticks', 10, 'kills', 2, 'mon', 'mill_cellar')));
    v_hunt := jsonb_build_object('swing_from', 0, 'swing_to', 10, 'to', to_jsonb(v_to), 'next_swing_at', to_jsonb(v_to),
      'uses', jsonb_build_object('cooked_shrimp', 2), 'falls', 0, 'down', false, 'down_ms', 0, 'paid_ms', 24000);

    -- (c) THE FENCE: the OLD combat path cannot pay a hunter.
    set local role hr_engine;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), v_delta);
    reset role;
    if v_r->>'error' is distinct from 'hunt_open'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(c): a bare combat accrue for a hunter answered % (and must move nothing)', v_r; end if;

    -- (d) A REFUSED SESSION HALF UN-WRITES THE VALUE HALF (stale swing).
    select count(*) into v_n from public.player_ledger where user_id = v_uid;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta,
             v_hunt || jsonb_build_object('swing_from', 7));
    reset role;
    if v_r->>'error' is distinct from 'session_moved'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold
       or (select count(*) from public.player_ledger where user_id = v_uid) <> v_n
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 0 then
      raise exception 'GATE(d): a refused settle answered % or left a write behind', v_r; end if;

    -- (e) AN UNPAID BUFF refuses the whole settle.
    select jsonb_build_array(jsonb_build_object('type', b.type, 'magnitude', b.magnitude,
             'until', to_jsonb(v_to + interval '5 minutes')))
      into v_h from public.hr_item_buffs b order by b.item_id limit 1;
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, gen_random_uuid(), v_delta, v_hunt, v_h);
    reset role;
    if v_r->>'error' is distinct from 'buff_not_paid'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e): an unpaid buff segment answered % or moved gold', v_r; end if;

    -- (f) THE HONEST SETTLE, with a press that stays queued: value + session move together.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, '00000000-0000-4000-8000-0000000c2bf1', v_delta,
             v_hunt || jsonb_build_object('presses_left', jsonb_build_array(0)), null,
             jsonb_build_object('slot', 0, 'at', floor(extract(epoch from v_from) * 1000)::bigint + 30000), true);
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(f): the honest settle answered %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 10
       or (select qty_left from public.hunt_bag where session_id = v_sid and item_id = 'cooked_shrimp') <> 10
       or (select coins from public.hunt_session_tally where session_id = v_sid) <> 10
       or (select kills from public.hunt_session_tally where session_id = v_sid) <> 2
       or jsonb_array_length((select presses from public.hunt_sessions where id = v_sid)) <> 1
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'combat' and intent = 'accrue'
                                                     and session_id = v_sid) <> 1 then
      raise exception 'GATE(f): the settle did not move gold / clock / bag / tally / press / stamp together'; end if;
    -- (f2) IDEMPOTENT: the same key replays and moves nothing more.
    set local role hr_engine;
    v_r := public.hr_hunt_apply(v_uid, 0, v_sid, v_ver, '00000000-0000-4000-8000-0000000c2bf1', v_delta, v_hunt);
    reset role;
    if v_r->>'stage' is distinct from 'replayed'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold + 10
       or (select swing_index from public.hunt_sessions where id = v_sid) <> 10 then
      raise exception 'GATE(f2): a replayed key answered % or moved value again', v_r; end if;

    -- (g) THE ROSTER offers a due session once, leased; a second driver skips it.
    update public.hunt_sessions set entered_at = now() - interval '30 minutes', hunt_from = now() - interval '25 minutes',
                                    settled_to = now() - interval '20 minutes', next_swing_at = now() - interval '20 minutes'
     where id = v_sid;
    set local role hr_tick;
    select count(*) into v_n from public.hr_hunt_roster('selfcheck:a', 50, 30000) r where r.session_id = v_sid;
    if v_n <> 1 then reset role; raise exception 'GATE(g): a due session was not rostered (%)', v_n; end if;
    select count(*) into v_n from public.hr_hunt_roster('selfcheck:b', 50, 30000) r where r.session_id = v_sid;
    reset role;
    if v_n <> 0 then raise exception 'GATE(g): a leased session was handed to a second driver'; end if;

    -- (h) THE CLIENT CREDIT DOORS ARE SHUT FOR A HUNTER (§6b).
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_credit_combat_xp(0, '{"attack": 5}'::jsonb, 'c2-selfcheck');
    if v_r->>'error' is distinct from 'hunt_open' then
      raise exception 'GATE(h): a hunter''s client combat-XP credit answered %', v_r; end if;
    if to_regprocedure('public.hr_credit_kills(integer,text,bigint,text)') is not null then
      v_r := public.hr_credit_kills(0, 'rat', 3, 'c2-selfcheck');
      if v_r->>'error' is distinct from 'hunt_open' and v_r->>'error' is distinct from 'settle_first' then
        raise exception 'GATE(h): a hunter''s client kill credit answered %', v_r; end if;
    end if;
    perform set_config('request.jwt.claim.sub', '', true);

    raise exception using errcode = 'HRC2B', message = 'hunt-sessions-settle §10 complete — rolling back';
  exception when sqlstate 'HRC2B' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.hunt_sessions where user_id = v_uid)
     or exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): §10 LEAKED a probe row'; end if;

  -- (y) THE DETECTOR IS GREEN.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;
  raise notice 'hunt-sessions-settle: EXECUTED - engine-only read/apply, tick-only roster, the fence refuses a bare '
               'combat accrue for a hunter, a refused session half un-writes the value half, an unpaid buff refuses, '
               'value + clock + bag + tally + press move together, a replay moves nothing, the lease holds; net zero';
end $mig$;
