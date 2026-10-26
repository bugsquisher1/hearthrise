-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — PARTY SETTLE ISOLATION: a refusal one member's own state causes
-- is that member's, never the party's (lane c-party-griefing, backend-architect,
-- 2026-10-25; Security threat model #7, lane/s-market-threat 80b09c29f).
-- STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- DB-ONLY: no hr-accrue change (pack-edge --hash unmoved), no client change.
--
-- ── ROOT CAUSE ──────────────────────────────────────────────────────────────
-- A party settle is all-or-nothing (hr_hunt_apply_instance: every member's half in
-- ONE sub-transaction). Every HR000 raised inside it went to hr_hunt_settle_refused,
-- which counted it on the INSTANCE (hunt_instances.refusals); the sixth in a row
-- called hr_hunt_forfeit, which closes EVERY open session of the instance. So ONE
-- member whose own state moved between the edge's read and its commit ended the
-- whole party's hunt: e.g. under "sell loot to keep going" with the purse near 0, a
-- member deposits (hr_bank_move), sells (vendor_sell) or locks the looted units the
-- window's sell-to-cover names, after the read: cover_over (or item_locked) on six
-- fires in a row, and every partner's hunt ends `server`, its pending windows unpaid
-- — against Tyler's 10-22 rule that nobody ends another hero's hunt except through
-- that hero's own box. The same class: a supply setting flipped after the read
-- (store_off), a "Keep at least" raised (gold_short floor), another hero of the
-- member's account spending the purse (gold_short; the edge's one retry is counted
-- too), the member's own daily budget, its tally rows.
--
-- ── THE FIX (the contract) ──────────────────────────────────────────────────
-- §1 hunt_sessions.refusals int NOT NULL DEFAULT 0 CHECK (>= 0): a SEAT's consecutive
--    refused commits that its own half caused. Written only by the §3/§4 bodies.
-- §2 hr_hunt_forfeit_seat(instance, session, code, detail, refusals) NEW, owner-only:
--    THE ONE PER-SEAT FORFEIT — hr_hunt_forfeit's loop body: the seat locked, one
--    window_forfeit row (gold 0), closed `left` (Leave pressed) or `server` at the
--    instance's last accepted boundary, bag home, forfeit flag set. hr_hunt_forfeit
--    RESTATED WHOLE (from 2026-11-20-hunt-forfeit-durable.sql) to call it per open seat
--    (the same rows; its count is the larger of the instance's and the seat's own).
-- §3 hr_hunt_settle_refused RESTATED WHOLE (from 2026-11-16-hunt-density-bounds.sql):
--    an answer naming a member counts on THAT open seat of THIS instance and never on
--    the instance; the sixth in a row ends that seat alone (hr_hunt_forfeit_seat) when
--    another member still hunts, or the instance (hr_hunt_forfeit, unchanged rows) when
--    it is the last one. An answer naming none is counted on the instance exactly as
--    before. The refusal is recorded on the seat that caused it. The answer gains
--    `seat` (the culprit's seat number) on a member refusal and never carries `member`.
-- §4 hr_hunt_apply_instance, EIGHT ANCHORED SPLICES on the live image (1f195717, the
--    2026-12-25-frame-push-revive.sql post-image; every other line kept): `v_cur`, the
--    member whose own half is being proved, is set before that member's value half
--    (hr_hunt_apply_member), its store bill, its account's "Keep at least" (the hero
--    whose floor binds) and its tally; it is null for the instance's own checks (window,
--    world, member set, a partial replay). The HR000 handler hands it to
--    hr_hunt_settle_refused as `member` (top-level of the answer, built here: no edge
--    or client value reaches it). A landed commit sets every committed seat's count
--    back to 0 inside the sub-transaction, beside the instance's.
-- §5 grants (nothing new is client- or engine-executable); §6 the executed self-check.
-- A FORFEITED SEAT SENDS NOBODY HOME. It is a server-side removal, like a kick
-- (Coordinator ruling 2026-10-23) and an at-once leave: its unit walks out of the
-- stored world at the next settle (combat-sim.js "A HERO WITH NO MEMBER walks out
-- first", tests/hunt-sessions-settle.mjs PARTY-KICK) and the partners hunt on, their
-- owed window re-run and paid from the unmoved boundary. Cascading it through the
-- partners' "Leave if anyone leaves" boxes would hand the griefer the very power
-- this file removes. A death still ends its hero's hunt (and cascades) through the
-- engine, unchanged (CLAUDE.md §6).
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- No new lock and no new order: every write here runs inside hr_hunt_apply_instance's
-- transaction under the instance row lock, every member's character lock and every
-- purse it already holds (hr_hunt_forfeit_seat re-takes the seat's hr_hunt_lock, a
-- re-entrant no-op there, and the instance's lock before a seat's for a direct call).
-- The strike count is written outside the rolled-back member sub-transaction (as the
-- instance count is), so it survives the refusal it counts; a landed commit resets it
-- inside, with the rows it commits. Intent keys and replays are untouched (no verb).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Shrinks: a member's own state can stall its party for at most five fires (the
-- partners lose nothing: the window was never paid and re-runs) and then ends only
-- that member's hunt. No new client grant, RPC or policy; the new function is
-- owner-only; hr_hunt_apply_instance stays hr_engine's alone. The culprit is named
-- only by the server (v_cur, from the member set it already validated). A compromised
-- edge that forges one member's half can now forfeit that seat instead of the
-- instance it could already forfeit: strictly less. The owner can read its own
-- seat's count through hunt_sessions' own-read policy (no value, no other player).
--
-- ── KNOWN LIMITS ────────────────────────────────────────────────────────────
-- · A refusal that is really the shared world's (an engine defect a member's bound
--   catches) is pinned on the first member it trips: that seat ends after six, then
--   the next; the last ends the instance as before. Fail-safe, bounded (6 per seat).
-- · member_set (the proposal names a session closed since the read: a kick, an
--   at-once leave) stays an instance refusal, as do the window/world checks.
-- · The edge still retries only session_moved / version_conflict / gold_short; a
--   cover_over is re-offered at the next fire (10 s) rather than at once.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_hunt_apply_instance's 2026-12-23-tally-tasks.sql image then
-- 2026-12-25-frame-push-revive.sql §4 (or remove the eight PARTY-ISOLATION splices),
-- 2026-11-16's hr_hunt_settle_refused and 2026-11-20's hr_hunt_forfeit; drop
-- hr_hunt_forfeit_seat; `alter table public.hunt_sessions drop column refusals`.
-- No player value is touched either way.
-- ORDER: after 2027-01-20-tutorial-facts.sql (the newest file; it does not touch these
-- bodies). No begin/commit. No cron.* write.
-- COST (100x players): one int per hunt_sessions row (retention keeps 20 per hero);
-- a refused member settle writes one session row instead of the instance row; a
-- landed commit adds one indexed update that touches only seats with a count (none,
-- almost always). Zero new ledger rows except the existing window_forfeit, once.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_close(uuid,text,timestamp with time zone,boolean)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions' and column_name = 'forfeit') then
    raise exception 'PRECONDITION: the hunt chain (2026-11-20-hunt-forfeit-durable.sql) is absent'; end if;
  -- Each body is the live image (measured on the replay = live, tests/live-hash-drift.baseline.json 2026-10-25:
  -- agree) or this file's own post-image (a second apply); anything else moved it, and this file is re-derived.
  for r in select * from (values
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '1f1957170fa2149be05e1b689c5c4ef9', 'bea6e1b1ac0ef7d29859032fd411778a', '2026-12-25-frame-push-revive.sql'),
    ('public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)', '6b825078c56c7a4e7004d2033a19466d', '6febe1260afd4997a805cc18fd17c230', '2026-11-16-hunt-density-bounds.sql'),
    ('public.hr_hunt_forfeit(uuid,text,jsonb)', 'c1c7ae4db3cc368c192c4171be83f8bb', '4d3d6f44c474d60295ef747100710c10', '2026-11-20-hunt-forfeit-durable.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-derive',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE SEAT'S COUNT ─────────────────────────────────────────────────────
alter table public.hunt_sessions add column if not exists refusals integer not null default 0;
alter table public.hunt_sessions drop constraint if exists hunt_sessions_refusals_ck;
alter table public.hunt_sessions add constraint hunt_sessions_refusals_ck check (refusals >= 0);
comment on column public.hunt_sessions.refusals is
  '2027-01-22-party-settle-isolation.sql: consecutive refused instance settles THIS seat''s own half caused '
  '(hr_hunt_settle_refused); reset by a landed commit; the sixth ends this seat alone (hr_hunt_forfeit_seat).';

-- ── §2 THE ONE PER-SEAT FORFEIT, and hr_hunt_forfeit through it ──────────────
create or replace function public.hr_hunt_forfeit_seat(p_instance uuid, p_session uuid, p_code text, p_detail jsonb, p_refusals integer)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_i public.hunt_instances%rowtype;
  v_s public.hunt_sessions%rowtype;
  v_end text;
begin
  -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): hr_hunt_forfeit's per-seat body, one seat. The instance
  -- first, then the seat (the settle's order); nothing of the pending window is credited.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('sessions', 0); end if;
  select * into v_s from public.hunt_sessions h where h.id = p_session and h.instance_id = p_instance and h.ended_at is null;
  if not found then return jsonb_build_object('sessions', 0); end if;
  perform public.hr_hunt_lock(v_s.user_id, v_s.slot);
  select * into v_s from public.hunt_sessions h where h.id = p_session and h.ended_at is null;
  if not found then return jsonb_build_object('sessions', 0); end if;
  v_end := case when v_s.leave_at is not null or v_s.change_at is not null then 'left' else 'server' end;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
    values (v_s.user_id, v_s.slot, 'hunt', 'window_forfeit', 0, 0,
            jsonb_build_object('reason', 'window_forfeit', 'code', left(coalesce(p_code, ''), 64), 'detail', p_detail,
                               'from', v_i.settled_to, 'world_swing', v_i.world_swing, 'refusals', coalesce(p_refusals, 0), 'end', v_end),
            v_s.id);
  perform public.hr_hunt_close(v_s.id, v_end, v_i.settled_to, true);
  update public.hunt_sessions set forfeit = true where id = v_s.id;
  return jsonb_build_object('sessions', 1, 'at', v_i.settled_to, 'seat', v_s.seat);
end $$;

-- hr_hunt_forfeit RESTATED WHOLE (from 2026-11-20-hunt-forfeit-durable.sql): every open seat through the one per-seat body.
create or replace function public.hr_hunt_forfeit(p_instance uuid, p_code text, p_detail jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_i public.hunt_instances%rowtype;
  v_s record;
  v_n int := 0;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql). The caller holds the instance lock.
  -- FORFEIT-DURABLE (2026-11-20-hunt-forfeit-durable.sql): the session row carries the fact.
  -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): each open seat ends through hr_hunt_forfeit_seat, journalled
  -- with the larger of the instance's count and the seat's own.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return null; end if;
  for v_s in select h.id, h.refusals from public.hunt_sessions h
              where h.instance_id = p_instance and h.ended_at is null order by h.user_id, h.slot loop
    v_n := v_n + coalesce((public.hr_hunt_forfeit_seat(p_instance, v_s.id, p_code, p_detail,
                                                        greatest(v_i.refusals, v_s.refusals))->>'sessions')::int, 0);
  end loop;
  update public.hunt_instances set world = null, refusals = 0, version = version + 1 where id = p_instance;
  return jsonb_build_object('sessions', v_n, 'at', v_i.settled_to);
end $$;

-- ── §3 ONE REFUSED COMMIT IS COUNTED WHERE IT WAS CAUSED ────────────────────
create or replace function public.hr_hunt_settle_refused(p_instance uuid, p_world_from bigint, p_first jsonb, p_answer jsonb)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  -- A fuse, not a balance figure: a lost race never repeats six times; a window
  -- the bounds refuse does, every fire (the engine is deterministic).
  c_forfeit_after constant int := 6;
  v_n int;
  v_ans jsonb := coalesce(p_answer, '{}'::jsonb) - 'member';
  v_who jsonb := p_first;
  v_seat public.hunt_sessions%rowtype;
  v_forfeit jsonb;
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql).
  -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): an answer naming the MEMBER whose own half raised it (set
  -- only by hr_hunt_apply_instance) is counted on that open seat of this instance, never on the instance, so one
  -- member's own state can never end another hero's hunt; the sixth in a row ends that seat alone, or the instance
  -- when it is the last one hunting. An answer naming none is the instance's, counted as before.
  if jsonb_typeof(p_answer->'member') = 'object'
     and coalesce(p_answer->'member'->>'session', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.hunt_sessions set refusals = refusals + 1
     where id = (p_answer->'member'->>'session')::uuid and instance_id = p_instance and ended_at is null
    returning * into v_seat;
  end if;
  if v_seat.id is not null then
    v_n := v_seat.refusals;
    v_who := jsonb_build_object('user', v_seat.user_id, 'slot', v_seat.slot);
    v_ans := v_ans || jsonb_build_object('seat', v_seat.seat);
  else
    update public.hunt_instances set refusals = refusals + 1 where id = p_instance returning refusals into v_n;
    if v_n is null then return v_ans; end if;
  end if;
  if coalesce(v_who->>'user', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(v_who->>'slot', '') ~ '^[0-9]{1,2}$' then
    perform public.hr_record_rejection((v_who->>'user')::uuid, (v_who->>'slot')::int, 'hunt_settle',
      coalesce(v_ans->>'error', 'apply_failed'),
      jsonb_build_object('instance', p_instance, 'world_swing', p_world_from, 'refusals', v_n,
                         'counted', case when v_seat.id is null then 'instance' else 'seat' end, 'detail', v_ans->'detail'), 1);
  end if;
  if v_n >= c_forfeit_after then
    if v_seat.id is not null and exists (select 1 from public.hunt_sessions h
                                          where h.instance_id = p_instance and h.ended_at is null and h.id <> v_seat.id) then
      v_forfeit := public.hr_hunt_forfeit_seat(p_instance, v_seat.id, v_ans->>'error', v_ans->'detail', v_n);
      update public.hunt_instances set version = version + 1 where id = p_instance;
    else
      v_forfeit := public.hr_hunt_forfeit(p_instance, v_ans->>'error', v_ans->'detail');
    end if;
    return v_ans || jsonb_build_object('refusals', v_n, 'forfeit', v_forfeit);
  end if;
  return v_ans || jsonb_build_object('refusals', v_n);
end $$;

-- ── §4 THE INSTANCE SETTLE NAMES THE MEMBER IT WAS PROVING: EIGHT ANCHORED SPLICES ─
do $mig$
declare v_def text; v_n int; i int;
  c_old text[]; c_new text[];
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'PARTY-ISOLATION (2027-01-22') > 0 then
    raise notice 'party-settle-isolation §4: hr_hunt_apply_instance already names its member - splices skipped'; return;
  end if;
  c_old := array[
    -- (a) the member being proved
    $a$  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
begin
$a$,
    -- (b) its value half
    $a$      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
$a$,
    -- (c) its store bill
    $a$      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
$a$,
    -- (d) its account's "Keep at least": the hero whose floor binds
    $a$      if public.hr_purse_of(v_u) < v_f then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor',$a$,
    -- (e) a partial replay is the instance's
    $a$    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
$a$,
    -- (f) its tally
    $a$      perform public.hr_tally_count((v_m->>'user')::uuid,$a$,
    -- (g) a landed commit: every committed seat's count starts over with the instance's
    $a$    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
$a$,
    -- (h) the refused exit names the member
    $a$        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end));
  end;
$a$];
  c_new := array[
    $a$  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
begin
$a$,
    $a$      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
$a$,
    $a$      v_cur := jsonb_build_object('user', v_p->'user', 'slot', v_p->'slot', 'session', v_p->'session');
      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
$a$,
    $a$      if public.hr_purse_of(v_u) < v_f then
        select jsonb_build_object('user', e.value->'user', 'slot', e.value->'slot', 'session', e.value->'session') into v_cur
          from jsonb_array_elements(v_pend) e where (e.value->>'user')::uuid = v_u
         order by (e.value->>'floor')::bigint, (e.value->>'slot')::int limit 1;
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor',$a$,
    $a$    v_cur := null;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
$a$,
    $a$      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      perform public.hr_tally_count((v_m->>'user')::uuid,$a$,
    $a$    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
    --      own count starts over too (the fuse counts consecutive refusals only).
    v_cur := null;
    update public.hunt_sessions set refusals = 0
     where id in (select (e.value->>'session')::uuid from jsonb_array_elements(p_members) e) and refusals > 0;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
$a$,
    $a$        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end)
      -- PARTY-ISOLATION: the member whose own half raised it; hr_hunt_settle_refused counts it on that seat alone.
      || case when v_cur is not null then jsonb_build_object('member', v_cur) else '{}'::jsonb end);
  end;
$a$];
  for i in 1 .. array_length(c_old, 1) loop
    v_n := (length(v_def) - length(replace(v_def, c_old[i], ''))) / length(c_old[i]);
    if v_n <> 1 then raise exception 'party-settle-isolation §4: hr_hunt_apply_instance anchor (%) matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, c_old[i], c_new[i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; restated below anyway.
  execute v_def;
end $mig$;

-- ── §5 GRANTS: revoke-then-grant; nothing new reaches a client or the engine ──
do $grants$
declare v_sig text; v_role text;
begin
  revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
  foreach v_sig in array array['public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)', 'public.hr_hunt_forfeit(uuid,text,jsonb)',
                               'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from hr_tick; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine; end if;
end $grants$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-images: (b)-(d) the old bodies count every refusal on the instance and the sixth forfeits the
-- partner; the column, the seat function and the splices do not exist there. The end-to-end griefing race (a party
-- member deposits the units its window's sell-to-cover names, between the edge's read and its commit, six fires in a
-- row; both doors: the tick = browser closed, the player's settle = hunt viewed) is tests/hunt-sessions-settle.mjs
-- PARTY-GRIEF on the replayed chain.
do $$
declare
  c_a    constant uuid := '000000d6-0000-4000-a000-00007a110001';   -- the culprit (first in (user, slot) order)
  c_b    constant uuid := '000000d6-0000-4000-a000-00007a110002';   -- its partner
  v      jsonb;
  v_sig  text;
  v_src  text;
  v_sa   uuid; v_sb uuid; v_inst uuid;
  v_t0   timestamptz;
  v_set  jsonb; v_mem jsonb;
  i      int;
begin
  -- (a) THE SHAPE: the column and its CHECK; each body is this file's image; the splices each landed once, in order,
  --     inside the frame-push order (refused exit: clear the defer, then count); grants closed.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions'
                  and column_name = 'refusals' and data_type = 'integer' and is_nullable = 'NO' and column_default = '0')
     or not exists (select 1 from pg_constraint where conrelid = 'public.hunt_sessions'::regclass and conname = 'hunt_sessions_refusals_ck') then
    raise exception 'party-settle-isolation §6(a): hunt_sessions.refusals is not NOT NULL DEFAULT 0 with its CHECK'; end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure) <> 'bea6e1b1ac0ef7d29859032fd411778a'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)'::regprocedure) <> '6febe1260afd4997a805cc18fd17c230'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_hunt_forfeit(uuid,text,jsonb)'::regprocedure) <> '4d3d6f44c474d60295ef747100710c10' then
    raise exception 'party-settle-isolation §6(a): a body is not this file''s image'; end if;
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure;
  if (length(v_src) - length(replace(v_src, 'v_cur := jsonb_build_object(', ''))) / length('v_cur := jsonb_build_object(') <> 3
     or strpos(v_src, 'jsonb_build_object(''member'', v_cur)') = 0
     or strpos(v_src, 'v_cur := jsonb_build_object(''user'', v_m->''user''') > strpos(v_src, 'v_h := public.hr_hunt_apply_member(')
     or strpos(v_src, 'update public.hunt_sessions set refusals = 0') > strpos(v_src, 'update public.hunt_instances')
     or strpos(v_src, 'update public.hunt_sessions set refusals = 0') < strpos(v_src, 'perform public.hr_tally_count(')
     or not (strpos(v_src, 'exception when sqlstate ''HR000'' then') < strpos(v_src, 'perform set_config(''hr.frame_defer'', '''', true);   -- FRAME-PUSH: a refused settle sends nothing')
             and strpos(v_src, 'perform set_config(''hr.frame_defer'', '''', true);   -- FRAME-PUSH: a refused settle sends nothing')
                 < strpos(v_src, 'jsonb_build_object(''member'', v_cur)')) then
    raise exception 'party-settle-isolation §6(a): hr_hunt_apply_instance does not name its member at every member step, in order'; end if;
  foreach v_sig in array array['hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)', 'hr_hunt_forfeit(uuid,text,jsonb)',
                               'hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)', 'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'] loop
    if has_function_privilege('anon', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('service_role', ('public.' || v_sig)::regprocedure, 'execute')
       or (exists (select 1 from pg_roles where rolname = 'hr_tick') and has_function_privilege('hr_tick', ('public.' || v_sig)::regprocedure, 'execute'))
       or (v_sig not like 'hr_hunt_apply_instance%' and exists (select 1 from pg_roles where rolname = 'hr_engine')
           and has_function_privilege('hr_engine', ('public.' || v_sig)::regprocedure, 'execute'))
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = ('public.' || v_sig)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'party-settle-isolation §6(a): % is reachable by a client or a role that must not run it', v_sig; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute') then
    raise exception 'party-settle-isolation §6(a): hr_engine lost the instance settle'; end if;

  begin
    -- THE PROBE: two admitted heroes hunting ONE instance (the culprit's), seats 0 and 1, ten seconds settled.
    foreach v_sig in array array[c_a::text, c_b::text] loop
      insert into auth.users (id) values (v_sig::uuid) on conflict (id) do nothing;
      insert into public.hr_access_allowlist (user_id, note) values (v_sig::uuid, 'party-settle-isolation §6 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_sig, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'party-settle-isolation §6-harness: hr_create_character refused: %', v; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', '', true);
    v_t0 := date_trunc('milliseconds', now()) - interval '10 seconds';
    v_sa := public.hr_hunt_new_session(c_a, 0, 'mill_cellar', null, 0, null);
    select instance_id into v_inst from public.hunt_sessions where id = v_sa;
    v_sb := public.hr_hunt_open_session(c_b, 0, 'mill_cellar', null, 0, null, v_inst,
                                        (select hunt_from from public.hunt_sessions where id = v_sa), 1);
    update public.hunt_sessions set entered_at = v_t0 - interval '1 minute', hunt_from = v_t0, settled_to = v_t0, next_swing_at = v_t0
     where id in (v_sa, v_sb);
    update public.hunt_instances set settled_to = v_t0, next_swing_at = v_t0, world = null, refusals = 0 where id = v_inst;
    v_set := jsonb_build_object('to', v_t0 + make_interval(secs => public.hr_hunt_limit('swing_interval_ms') / 1000.0),
                                'world_swing', (select world_swing from public.hunt_instances where id = v_inst));
    -- Each member's half is malformed (no swing_from): the FIRST in (user, slot) order, the culprit, raises it.
    v_mem := jsonb_build_array(
      jsonb_build_object('user', c_a, 'slot', 0, 'session', v_sa, 'version', 0, 'intent', gen_random_uuid(), 'delta', '{}'::jsonb, 'hunt', '{}'::jsonb),
      jsonb_build_object('user', c_b, 'slot', 0, 'session', v_sb, 'version', 0, 'intent', gen_random_uuid(), 'delta', '{}'::jsonb, 'hunt', '{}'::jsonb));

    -- (b) AN INSTANCE REFUSAL (a window off the swing grid) is the instance's, as before: no seat is charged.
    v := public.hr_hunt_apply_instance(v_inst, (v_set->>'world_swing')::bigint, v_set || jsonb_build_object('to', v_t0 + interval '1 millisecond'), v_mem);
    if v->>'error' is distinct from 'bad_window' or (select refusals from public.hunt_instances where id = v_inst) <> 1
       or exists (select 1 from public.hunt_sessions where id in (v_sa, v_sb) and refusals <> 0) or v ? 'seat' then
      raise exception 'party-settle-isolation §6(b): an instance refusal answered % (instance %, seats %)', v,
        (select refusals from public.hunt_instances where id = v_inst),
        (select jsonb_agg(refusals) from public.hunt_sessions where id in (v_sa, v_sb)); end if;
    update public.hunt_instances set refusals = 0 where id = v_inst;

    -- (c) THE CULPRIT'S OWN HALF, SIX TIMES: counted on its seat alone; the sixth ends ITS hunt, at the last accepted
    --     boundary, journalled once, and the partner hunts on with the instance's count untouched.
    for i in 1 .. 6 loop
      v := public.hr_hunt_apply_instance(v_inst, (v_set->>'world_swing')::bigint, v_set, v_mem);
      if v->>'error' is distinct from 'bad_swing' or (v->>'refusals')::int is distinct from i or (v->>'seat')::int is distinct from 0
         or v ? 'member' or (i < 6 and v ? 'forfeit') then
        raise exception 'party-settle-isolation §6(c): the culprit''s refusal % answered %', i, v; end if;
      if (select refusals from public.hunt_instances where id = v_inst) <> 0 then
        raise exception 'party-settle-isolation §6(c): a member''s refusal % was counted on the instance', i; end if;
    end loop;
    if (v->'forfeit'->>'sessions')::int is distinct from 1
       or (select end_reason from public.hunt_sessions where id = v_sa) is distinct from 'server'
       or (select forfeit from public.hunt_sessions where id = v_sa) is distinct from true
       or (select ended_at from public.hunt_sessions where id = v_sa) is distinct from v_t0 then
      raise exception 'party-settle-isolation §6(c): the culprit''s sixth refusal did not end its own hunt at the boundary: % / %', v,
        (select jsonb_build_object('end', end_reason, 'at', ended_at, 'forfeit', forfeit) from public.hunt_sessions where id = v_sa); end if;
    if (select ended_at from public.hunt_sessions where id = v_sb) is not null
       or (select refusals from public.hunt_sessions where id = v_sb) <> 0 then
      raise exception 'party-settle-isolation §6(c): the culprit''s refusals ended or charged its partner'; end if;
    if (select count(*) from public.player_ledger where session_id = v_sa and kind = 'hunt' and intent = 'window_forfeit' and coalesce(gold, 0) = 0
          and (meta->>'refusals')::int = 6) <> 1
       or exists (select 1 from public.player_ledger where session_id = v_sb and intent = 'window_forfeit') then
      raise exception 'party-settle-isolation §6(c): the seat forfeit is not journalled once, on the culprit alone'; end if;

    -- (d) THE LAST ONE HUNTING: its own sixth refusal ends the instance, exactly as before (world gone, count reset).
    v_mem := jsonb_build_array(v_mem->1);
    for i in 1 .. 6 loop
      v := public.hr_hunt_apply_instance(v_inst, (v_set->>'world_swing')::bigint, v_set, v_mem);
    end loop;
    if (v->>'error') is distinct from 'bad_swing' or (v->'forfeit'->>'sessions')::int is distinct from 1
       or (select ended_at from public.hunt_sessions where id = v_sb) is distinct from v_t0
       or (select forfeit from public.hunt_sessions where id = v_sb) is distinct from true
       or (select refusals from public.hunt_instances where id = v_inst) <> 0
       or (select world from public.hunt_instances where id = v_inst) is not null then
      raise exception 'party-settle-isolation §6(d): the last seat''s sixth refusal answered % (session %)', v,
        (select jsonb_build_object('end', end_reason, 'at', ended_at, 'forfeit', forfeit) from public.hunt_sessions where id = v_sb); end if;

    raise exception 'party-settle-isolation §6: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'party-settle-isolation §6: ok' then raise; end if;
  end;
end $$;
