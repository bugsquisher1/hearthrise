-- ════════════════════════════════════════════════════════════════════════
-- 2026-12-25-frame-push-revive.sql — THE CHARACTER PUSH CHANNEL, REVIVED:
--   EVERY COMMITTED SETTLE AND EVERY ACCEPTED WRITE PUSHES THE WHOLE
--   CHARACTER TO ITS OWNER'S PRIVATE TOPIC, WHILE A CLIENT HAS IT OPEN.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-realtime, backend-architect,
-- 2026-10-23). Game CLOSED: applies on its passing §6 (tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00–00:10 UTC). Moves no value:
-- a frame is a copy of a committed fact. In the reopen Security review as a
-- delivery surface (who may hear whose frames). DB-ONLY on the server side: no
-- hr-accrue change (pack-edge --hash unmoved). The client half (src/session/
-- envelope.js, character-session.js, hunt-poll.js) rides the next release and is
-- safe in either order: the v0.2.36 client refuses a `t:'state'` frame as
-- malformed (envelope.js frameOf) and keeps polling; the new client against
-- the old server simply receives nothing, as today.
--
-- ── ROOT CAUSE (measured on the replay, which equals live for every body here:
--    tests/live-hash-drift.baseline.json, measured 2026-10-23) ───────────────
-- realtime.messages held 0 rows on production because NOTHING HAS EVER BEEN
-- SENT. Three faults, each sufficient on its own; (1) is why the table is empty:
--  (1) THE KILL SWITCH WAS NEVER ARMED. hr_frame_send's first statement is
--      `if not coalesce(v_cfg.frame_push, false) then return;` (2026-10-07
--      restatement, line 241). 2026-09-22-frame-push-channel.sql shipped
--      frame_push = false; every later write of it is inside a rolled-back
--      self-check, and the two world-tick ARM files raise if it is on
--      (2026-10-07-world-tick-arm-gather.sql:51, 2026-10-14-world-tick-arm-
--      combat.sql:73). Every accepted write since 09-23 returned there.
--  (2) THE SETTLE NEVER EMITS. Since 2026-10-22-hunt-sessions-settle.sql the
--      one settle is hr_hunt_apply_instance -> hr_hunt_apply_member, which calls
--      hr_apply for the value half; hr_apply's call site (09-23 §5) would send
--      from INSIDE the member loop — before the session row, the instance row,
--      the resume (step 7, a second version bump) and the account purse bills
--      (4b) land — so even armed, a settle frame would carry a state the
--      database never committed (gold before the store bill, the old world
--      swing) at a version one below the row's.
--  (3) THE ONLINE GATE READS A STAMP NOTHING WRITES. hr_frame_wanted's tick
--      branch reads player_state.last_seen_at, written only by hr_heartbeat,
--      which only the old client called (src/net/town.js, scrapped 2026-10-17).
--      The rebuilt client stamps character_presence instead (hr_players_online,
--      every social poll, 2026-11-07-players-online.sql). Any tick frame would
--      have been dropped as "offline".
--
-- ── THE FIX (the contract: docs/design/LIVE_COUNTERS_PUSH.md §11) ───────────
-- §1 THE FRAME IS THE WHOLE CHARACTER: hr_frame_payload(p_env) ->
--      { t: 'state', frame: <env.version>, env: <the projection> }
--    the same hr_state_of envelope a load or a settle answer carries, so the
--    client REPLACES its record with it (envelope.js E1) and never needs an
--    engine call to fill a gap: a missed frame is healed by the next one. The
--    key-subset `delta` (hr_frame_payload(jsonb,text[]) + hr_tick_config.
--    frame_keys + its two CHECKs) is retired: a subset at a newer version is a
--    record that claims a version it does not hold (the 2026-09-13 class).
--    Security ruling 3.1's "no stack in a combat frame" protected a Math.max
--    fold that no longer exists; a whole-record replace at a strictly newer
--    version (E1 + E3) is exactly the "ABSOLUTE flip + monotonic frame gate"
--    hr_tick_config_combat_frame_ck's comment names as its lift.
-- §2 hr_frame_wanted RESTATED: a frame goes only to a character OPEN IN A
--    CLIENT — character_presence.seen_at within 75 s (three social polls' worth
--    of slack; never from the future) — for EVERY origin (an unwatched topic is
--    pure cost), and the 2026-10-09 self-echo rule is kept byte-for-byte: the
--    engine requester's own (user, slot) is not echoed back to the browser that
--    holds the same envelope in its HTTP answer.
-- §3 hr_frame_send RESTATED: kill switch -> transport present -> DEFERRED while
--    an instance settle is in progress (hr.frame_defer) -> the gate -> the
--    payload (projecting only when the caller handed none: after the gate, so
--    an unwatched member costs no projection) -> a size ceiling -> one send.
-- §4 hr_hunt_apply_instance: FOUR ANCHORED SPLICES. hr.frame_defer is set
--    before the member subtransaction and cleared on both of its exits; after
--    the instance row lands, ONE frame per member, in (user, slot) order, from
--    the committed state. The caller's own projection (p_project_user) is
--    computed once and reused for its member and for the answer.
-- §5 THE ARM: hr_tick_config.frame_push = true. `update public.hr_tick_config
--    set frame_push = false;` still stops every frame with no deploy.
-- §5b hr_realtime_policies(): the ONE installer of this project's receive-only
--    policies on realtime.messages (owner-only); here it restates 09-22's
--    "hr_frame_receive_own_topic" verbatim, so the self-check can execute that
--    predicate on the replay's probe transport as well as on production.
-- §6 SELF-CHECK, executed, every probe rolled back by a sentinel.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- The frames are sent inside the settle's own transaction, after its last
-- write, under its locks (instance row, every member's character lock, every
-- purse): realtime.send only INSERTs into realtime.messages, and Realtime
-- delivers from the WAL, so a rolled-back settle never broadcasts and a
-- committed one broadcasts exactly what it committed. The member loop runs in
-- one sub-transaction; a frame raised inside it would roll back with it, which
-- is why the frames are taken after it, not inside it. A push failure can
-- never fail a settle: hr_frame_send swallows its own errors, and the frame
-- loop has its own handler too (the 09-23 "defended twice" rule).
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- A replayed settle (step (1): the CAS lost to an intent that already landed)
-- returns before the member loop and emits nothing; a refused one emits
-- nothing; a replayed hr_apply returns at its step (3) before its call site.
-- So one committed settle = one frame per watched member, and one accepted
-- write = at most one frame. A second apply of this file is byte-identical:
-- §0 accepts the post images, the splices stand down on their marker, the
-- restatements and the installer re-create the same text, the column drop is
-- `if exists`, and §6 re-asserts every body's post md5.
--
-- ── EXPLOIT SURFACE DELTA (for the reopen Security review) ──────────────────
-- No client grant, no new client RPC (hr_client_rpc_baseline unchanged), no
-- table write a request can reach. The topic, its RLS (receive-only, own uid,
-- slot 0-5, exactly three segments) and the absence of ANY write policy on
-- realtime.messages are unchanged and EXECUTED in §6: another user cannot
-- receive this topic, and no client can insert a message. The gate reads two
-- server-stamped facts (character_presence, written only by hr_players_online
-- for the caller's own rows with the server clock; and the edge's transaction-
-- local hr.frame_self, which only suppresses the requester's own echo). A
-- forged presence costs quota, never value, and only on the forger's own topic.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- Frames go only to OPEN characters. A watched hunting hero whose own hello
-- drives its settles gets none (the echo rule); its party members get one per
-- settle; an unwatched hero gets none and costs no projection. Today's 41-45 %
-- repeat-version polls (party members asking for a settle another member just
-- paid) become frames, and the client's poll waits a whole poll after each
-- frame (hunt-poll.js defer), so engine calls FALL. Per watched frame: one
-- hr_state_of (3-10 ms, inside the settle's locks) and one realtime.messages
-- row (Realtime's own table, partitioned daily, ~3-day retention: not
-- player_ledger, so no journal growth). 100x = ~200 open characters at peak:
-- ~200 x 3,600 / 16 s = 45k frames/h at the very most, on Pro's quota.
-- A frame over 250,000 bytes (the Free-plan broadcast ceiling is 256 KB) is
-- not sent (a warning); the poll heals it.
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- Off: `update public.hr_tick_config set frame_push = false;` Full undo:
-- re-apply hr_hunt_apply_instance's 2026-12-23-tally-tasks.sql image (this
-- file's §4 reversed), 2026-10-07's hr_frame_send, 2026-10-09's hr_frame_wanted,
-- 2026-09-23's hr_frame_payload(jsonb,text[]) and 09-22's frame_keys column
-- (each file's own text), then drop hr_frame_payload(jsonb) and
-- hr_realtime_policies().
-- ORDER: after 2026-12-23-tally-tasks.sql (APPLIED 2026-10-23 20:38 UTC, v0.2.37):
-- the hr_hunt_apply_instance image pinned in §0 is ITS whole restatement
-- (c10fb329, step (4c) Tamsin's tally kept byte-for-byte; the splices touch only
-- the declare line, the defer around the member sub-transaction, the refused exit
-- and the final return, so the tally's count and claim land BEFORE the frames
-- and every frame carries them). No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): tests/live-hash-drift.mjs is red with SEVEN
-- entries for this file and 2026-12-26 together (measured on the branch,
-- credential-free, exit 1): replay hr_frame_send, hr_frame_wanted,
-- hr_hunt_apply_instance; replay-missing hr_frame_payload(p_env jsonb, p_keys
-- text[]); replay-extra hr_frame_payload(p_env jsonb); untracked hr_frame_topic
-- and hr_realtime_policies. Re-seed with --live --write once both are applied
-- and flip this note to APPLIED.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.character_presence') is null then
    raise exception 'PRECONDITION: apply 2026-11-07-players-online.sql first (character_presence is the presence the gate reads)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
                  and column_name = 'frame_push') then
    raise exception 'PRECONDITION: hr_tick_config.frame_push is missing (2026-09-22-frame-push-channel.sql)'; end if;
  if to_regprocedure('public.hr_frame_topic(uuid,integer)') is null or to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_frame_topic / hr_state_of are missing'; end if;
  -- Each body is its predecessor's image (pre) or this file's own (post: a second apply); anything else means
  -- another file moved it, and this file is re-pinned to that image before it applies.
  for r in select * from (values
    ('public.hr_frame_send(uuid,integer,jsonb)', '6995575071d68a9d72122d0ae3fababa', 'c924aed24c9e409173e03d7c91fe89c6', '2026-10-07-frame-emit-online-only.sql'),
    ('public.hr_frame_wanted(uuid,integer)', '7343102c1e300050d7374f8a07ff4800', '93d3efe939be804945bf63790704aac6', '2026-10-09-frame-self-echo.sql'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'c10fb3297365cdca0efaf23aa315ad08', '1f1957170fa2149be05e1b689c5c4ef9', '2026-12-23-tally-tasks.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; re-pin',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE FRAME IS THE WHOLE CHARACTER ──────────────────────────────────────
-- PURE. `frame` is the envelope's own `version` (hr_state_of reads it off the row the write just committed, under
-- the write's lock): never incremented, defaulted or taken from a request. An envelope that is not an ok answer
-- with a `state` object and a whole version yields NULL: no message, never a frame the database did not stamp.
create or replace function public.hr_frame_payload(p_env jsonb)
returns jsonb language plpgsql immutable set search_path = public as $fn$
declare v_frame bigint;
begin
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): { t:'state', frame, env } — the client replaces its record with env.
  if p_env is null or jsonb_typeof(p_env) <> 'object' or coalesce(p_env->>'ok', 'false') <> 'true'
     or jsonb_typeof(p_env->'state') is distinct from 'object' or jsonb_typeof(p_env->'version') is distinct from 'number' then
    return null; end if;
  begin v_frame := (p_env->>'version')::bigint;
  exception when others then return null; end;
  if v_frame is null or v_frame < 0 then return null; end if;
  return jsonb_build_object('t', 'state', 'frame', v_frame, 'env', p_env);
end $fn$;
revoke execute on function public.hr_frame_payload(jsonb) from public;
revoke execute on function public.hr_frame_payload(jsonb) from anon, authenticated, service_role;

-- THE KEY-SUBSET DELTA, RETIRED (no caller after §3): its builder, its key list and the two CHECKs on that list.
drop function if exists public.hr_frame_payload(jsonb, text[]);
alter table public.hr_tick_config drop constraint if exists hr_tick_config_combat_frame_ck;
alter table public.hr_tick_config drop constraint if exists hr_tick_config_frame_keys_known;
alter table public.hr_tick_config drop column if exists frame_keys;

-- ── §2 THE GATE: OPEN IN A CLIENT, AND NOT THE REQUESTER'S OWN ECHO ─────────
create or replace function public.hr_frame_wanted(p_user uuid, p_slot integer)
returns boolean language plpgsql stable set search_path = public as $fn$
declare
  -- THREE SOCIAL POLLS (src/data/chat-channels.js friendsPollMs 30 s; hr_players_online stamps with a 20 s floor).
  c_ttl  constant interval := interval '75 seconds';
  v_self text;
  v_role text;
begin
  -- ── (0) OPEN IN A CLIENT (2026-12-25-frame-push-revive.sql). character_presence is the stamp the rebuilt client
  --        writes for its open characters (hr_players_online: the caller's own rows, server clock). Every origin is
  --        gated: a frame to a topic nobody holds is quota for nothing. Unknown, stale or future reads "closed".
  if p_user is null or p_slot is null then return false; end if;
  if not exists (select 1 from public.character_presence cp
                  where cp.user_id = p_user and cp.slot = p_slot
                    and cp.seen_at >  now() - c_ttl
                    and cp.seen_at <= now() + interval '60 seconds') then
    return false;
  end if;

  -- ── (1) A TICK. A world-tick write is never an echo: no self marker is read on this branch, so a player's own
  --        write can never silence a world-tick settle.
  if coalesce(current_setting('hr.frame_origin', true), '') = 'tick' then return true; end if;

  -- ── (2) NOT A TICK. The echo of the caller's OWN write is not sent: the caller already holds this envelope from
  --        its HTTP response (2026-10-09-frame-self-echo.sql, unchanged). Every other frame is sent.
  v_self := coalesce(current_setting('hr.frame_self', true), '');
  if v_self = '' then return true; end if;
  -- (b) EXACTLY this character. A write to anyone else is someone else's news.
  if lower(v_self) <> p_user::text || ':' || p_slot::text then return true; end if;
  -- (c) ONLY THE ENGINE. The same identity test hr_apply trusts p_user on.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role is distinct from 'hr_engine' then return true; end if;
  -- (d) NEVER A CLIENT REQUEST. PostgREST stamps the JWT on every request.
  if nullif(current_setting('request.jwt.claims', true), '') is not null
     or nullif(current_setting('request.jwt.claim.sub', true), '') is not null then
    return true;
  end if;
  return false;
end $fn$;
revoke execute on function public.hr_frame_wanted(uuid, integer) from public;
revoke execute on function public.hr_frame_wanted(uuid, integer) from anon, authenticated, service_role;

-- ── §3 THE EMITTER ───────────────────────────────────────────────────────────
create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
returns void language plpgsql volatile security definer set search_path = public as $fn$
declare
  -- The smallest broadcast payload ceiling Supabase sells (Free: 256 KB); a bigger frame is not sent, the poll heals it.
  c_max_bytes constant int := 250000;
  v_on  boolean;
  v_env jsonb;
  v_msg jsonb;
begin
  /* ⚠ THE WHOLE BODY IS INSIDE ONE exception BLOCK, AND THAT IS THE POINT. The value is computed, clamped, written
     and journalled before this runs; a frame is a COPY of a fact the database already holds. Realtime absent, a
     payload over the limit, a permission change, a projection that throws: each degrades to "no frame", which the
     next frame (a whole record) and the client's poll both heal. It may never degrade to a rolled-back payment. */
  begin
    -- FAIL CLOSED. A missing row, an unreadable table or a NULL reads as "off".
    select c.frame_push into v_on from public.hr_tick_config c where c.id;
    if not coalesce(v_on, false) then return; end if;

    -- NO REALTIME, NO FRAME. Absent in the repo's PGlite replay and possibly on a restored database.
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;

    -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): DEFERRED inside an instance settle. hr_hunt_apply_instance
    -- sets hr.frame_defer around its member loop, where hr_apply's own call site would otherwise push a state the
    -- settle has not finished writing; the instance sends every member's frame itself at its commit point.
    if coalesce(current_setting('hr.frame_defer', true), '') <> '' then return; end if;

    -- NOBODY WATCHING, NO FRAME; AND NEVER THE REQUESTER'S OWN ECHO (hr_frame_wanted). Read before any projection.
    if not public.hr_frame_wanted(p_user, p_slot) then return; end if;

    -- THE PAYLOAD IS THE PROJECTION THE CLIENT ALREADY APPLIES: the caller's when it built one (hr_apply's v_out),
    -- else one fresh read of the committed row, made only now that someone is watching.
    v_env := coalesce(p_env, public.hr_state_of(p_user, p_slot));
    v_msg := public.hr_frame_payload(v_env);
    if v_msg is null then return; end if;
    if octet_length(v_msg::text) > c_max_bytes then
      raise warning 'hr_frame_send: frame % for %/% is % bytes (ceiling %): not sent, the poll heals it',
        v_msg->>'frame', p_user, p_slot, octet_length(v_msg::text), c_max_bytes;
      return;
    end if;

    perform realtime.send(v_msg, 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_frame_send: frame % for %/% not sent (%) — the write is committed anyway',
      coalesce(p_env->>'version', '?'), p_user, p_slot, sqlerrm;
  end;
end $fn$;
revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from public;
revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from hr_engine';
    execute 'revoke execute on function public.hr_frame_wanted(uuid, integer) from hr_engine';
    execute 'revoke execute on function public.hr_frame_payload(jsonb) from hr_engine';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from hr_tick';
    execute 'revoke execute on function public.hr_frame_wanted(uuid, integer) from hr_tick';
    execute 'revoke execute on function public.hr_frame_payload(jsonb) from hr_tick';
  end if;
end $mig$;

-- ── §4 THE SETTLE SENDS AT ITS COMMIT POINT: FOUR ANCHORED SPLICES ───────────
do $mig$
declare v_def text; v_n int; v_old text; v_new text; i int;
  c_old text[]; c_new text[];
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, 'FRAME-PUSH (2026-12-25') > 0 then return; end if;
  c_old := array[
    -- (a) the caller's projection, held once
    $a$  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
begin
$a$,
    -- (b) the defer, around the member sub-transaction
    $a$    perform public.hr_purse_lock(v_u);
  end loop;
  begin
$a$,
    -- (c) the refused exit clears it
    $a$    perform set_config('hr.hunt_session', '', true);
    return public.hr_hunt_settle_refused($a$,
    -- (d) the commit point: one frame per member, then the answer
    $a$  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
end$a$];
  c_new := array[
    $a$  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
begin
$a$,
    $a$    perform public.hr_purse_lock(v_u);
  end loop;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): hr_apply's own frame call is DEFERRED while the members land
  -- (hr_frame_send reads hr.frame_defer); the frames go out below, once, from the committed state.
  perform set_config('hr.frame_defer', 'instance', true);
  begin
$a$,
    $a$    perform set_config('hr.hunt_session', '', true);
    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing
    return public.hr_hunt_settle_refused($a$,
    $a$  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): THE COMMIT POINT. Every member's rows, the purse bills and the
  -- instance row have landed: ONE frame per member, in lock order, of the state the database now holds (hr_frame_send:
  -- only to a character open in a client, never the requester's own echo, a fresh projection only for a watched one).
  -- A push failure never fails the settle: hr_frame_send swallows its own errors, and this handler stands behind it.
  perform set_config('hr.frame_defer', '', true);
  v_proj := case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,
        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);
    end loop;
  exception when others then
    raise warning 'hr_hunt_apply_instance: frames for % not sent (%) — the settle is committed anyway', p_instance, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', v_proj);
end$a$];
  for i in 1 .. array_length(c_old, 1) loop
    v_old := c_old[i]; v_new := c_new[i];
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_hunt_apply_instance: FRAME-PUSH anchor (%) matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_old, v_new);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; none moves here.
  execute v_def;
end $mig$;

-- ── §5 THE ARM ───────────────────────────────────────────────────────────────
update public.hr_tick_config set frame_push = true where id and not frame_push;

-- ── §5b THE ONE INSTALLER OF THE RECEIVE-ONLY POLICIES ON realtime.messages ──
-- Owner-only. It returns how many policies it (re)installed: 0 where realtime is absent (the PGlite replay before
-- §6 installs its probe). Dropped and re-created in one transaction: no window without the policy. There is NO
-- insert / update / delete policy, ever: a client that could write a topic could hand a player any envelope.
create or replace function public.hr_realtime_policies()
returns integer language plpgsql set search_path = public, pg_catalog as $fn$
begin
  if to_regclass('realtime.messages') is null then return 0; end if;
  -- THE CHARACTER'S FRAME TOPIC hr:<uid>:<slot> (2026-09-22-frame-push-channel.sql §6, verbatim): its owner only,
  -- slot 0-5, exactly three segments, broadcast only.
  execute 'drop policy if exists "hr_frame_receive_own_topic" on realtime.messages';
  execute $p$
    create policy "hr_frame_receive_own_topic"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and split_part((select realtime.topic()), ':', 1) = 'hr'
        and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
        and split_part((select realtime.topic()), ':', 3) ~ '^[0-5]$'
        and array_length(string_to_array((select realtime.topic()), ':'), 1) = 3
      )
  $p$;
  return 1;
end $fn$;
revoke execute on function public.hr_realtime_policies() from public;
revoke execute on function public.hr_realtime_policies() from anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_realtime_policies() from hr_engine'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_realtime_policies() from hr_tick'; end if;
end $mig$;
select public.hr_realtime_policies();

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- PROBE ROWS ONLY: every player row is keyed on v_a / v_b / v_c (uuids gen_random_uuid() does not mint). Where the
-- realtime schema is ABSENT (the PGlite replay) a probe transport is installed (messages + send + topic, RLS on, the
-- §5b policies on it); on production the real one is used after a control send. The sentinel rolls everything back.
--   s0  catalog: the emitter's order (switch, transport, defer, gate, payload, size, send); grants; hygiene STRICT
--   s1  the arm and the retirement: frame_push on, frame_keys and the delta builder gone
--   s2  the gate's truth table (presence none / 74 s / 76 s / future; tick; the echo rule)
--   s3  ★ AN ACCEPTED WRITE -> EXACTLY ONE FRAME, the whole envelope at the row's version; closed -> none;
--       a replay -> none; the switch off -> none
--   s4  ★ A SETTLE -> EXACTLY ONE FRAME PER OPEN MEMBER, AT THE COMMIT POINT (the instance's new world swing,
--       the member's final version), none from inside the member loop; the requester's own echo -> none;
--       a closed member -> none, then one once it opens
--   s5  ★ RLS: another user cannot receive hr:<A>:0; A can; a bad slot / a fourth segment cannot; no client can
--       insert a message (no write policy); every policy on realtime.messages is the installer's
--   s6  every body landed as its post pin
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000f2a50001';
  v_b  constant uuid := '000000c0-0000-4000-a000-0000f2a50002';
  v_c  constant uuid := '000000c0-0000-4000-a000-0000f2a50003';
  v_u  uuid[] := array['000000c0-0000-4000-a000-0000f2a50001', '000000c0-0000-4000-a000-0000f2a50002',
                       '000000c0-0000-4000-a000-0000f2a50003']::uuid[];
  k    text := '000000c0-0000-4000-a000-0000';
  v_rt text := 'absent';
  v    jsonb; v_r jsonb; v_m jsonb; v_g text; v_pid uuid; v_i int; v_n int; v_t bigint; v_at timestamptz;
  v_ver bigint; v_wsw bigint; v_txt text;
  v_ta0 text; v_ta1 text; v_tb0 text; v_tc0 text;
  n_a0 int; n_a1 int; n_b0 int;
begin
  begin
    -- ── s0: THE EMITTER'S ORDER, THE GRANTS ─────────────────────────────────
    v_txt := replace(pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if not (position('coalesce(v_on, false)' in v_txt) < position('realtime.send(jsonb,text,text,boolean)' in v_txt)
        and position('realtime.send(jsonb,text,text,boolean)' in v_txt) < position('hr.frame_defer' in v_txt)
        and position('hr.frame_defer' in v_txt) < position('public.hr_frame_wanted(p_user, p_slot)' in v_txt)
        and position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) < position('public.hr_state_of(p_user, p_slot)' in v_txt)
        and position('public.hr_state_of(p_user, p_slot)' in v_txt) < position('c_max_bytes then' in v_txt)
        and position('c_max_bytes then' in v_txt) < position('perform realtime.send(' in v_txt)) then
      raise exception 's0: hr_frame_send no longer reads switch -> transport -> defer -> gate -> payload -> size -> send in order';
    end if;
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      continue when v_txt <> 'public' and not exists (select 1 from pg_roles where rolname = v_txt);
      if has_function_privilege(v_txt, 'public.hr_frame_send(uuid,integer,jsonb)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_frame_wanted(uuid,integer)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_frame_payload(jsonb)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_realtime_policies()', 'EXECUTE') then
        raise exception 's0b: % can EXECUTE a frame function or the policy installer', v_txt;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── s1: ARMED, AND THE DELTA RETIRED ────────────────────────────────────
    if not coalesce((select frame_push from public.hr_tick_config where id), false) then
      raise exception 's1: frame_push is not on after the arm'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
                and column_name = 'frame_keys')
       or to_regprocedure('public.hr_frame_payload(jsonb,text[])') is not null then
      raise exception 's1b: the key-subset delta (frame_keys / hr_frame_payload(jsonb,text[])) is still installed'; end if;

    -- ── THE TRANSPORT. A probe where realtime is absent; the real one after a control send.
    if to_regnamespace('realtime') is null then
      create schema realtime;
      create table realtime.messages (
        id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
        event text, payload jsonb, private boolean, inserted_at timestamptz not null default now());
      create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
        returns void language sql as
        'insert into realtime.messages (topic, extension, event, payload, private) values ($3, ''broadcast'', $2, $1, $4)';
      create function realtime.topic() returns text language sql stable as
        'select nullif(current_setting(''realtime.topic'', true), '''')::text';
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to authenticated;
      grant select, insert on realtime.messages to authenticated;
      grant execute on function realtime.topic() to authenticated;
      if public.hr_realtime_policies() <> 1 then raise exception 's-transport: the installer did not install on the probe'; end if;
      v_rt := 'probe';
    elsif to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null and to_regclass('realtime.messages') is not null then
      begin
        perform realtime.send(jsonb_build_object('t', 'hr1225-control'), 'hr1225-control', 'hr1225-control:' || v_a::text, true);
        select count(*) into v_n from realtime.messages where topic = 'hr1225-control:' || v_a::text;
      exception when others then v_n := -1; end;
      if v_n > 1 then raise exception 's-transport: the control send counted back % rows: this transport duplicates', v_n; end if;
      if v_n = 1 then v_rt := 'live'; end if;
    end if;
    if v_rt = 'absent' then
      raise exception 's-transport: realtime.messages does not round-trip from this session, so every frame property '
                      'below would be asserted on nothing. Apply where realtime works'; end if;

    -- ── the probe characters: A0 + A1 (one account), B0 (a stranger), C0 (alone, in town).
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Frame ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'frame-push-revive §6 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 's-fixture: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
      insert into public.social_presence (user_id, slot, seen_at) values (v_u[v_i], 0, now())
        on conflict (user_id) do update set seen_at = now();
    end loop;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 's-fixture: A''s second hero was refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_a and slot = 1;
    delete from public.hr_rate_counters where user_id = any (v_u);
    v_ta0 := public.hr_frame_topic(v_a, 0); v_ta1 := public.hr_frame_topic(v_a, 1);
    v_tb0 := public.hr_frame_topic(v_b, 0); v_tc0 := public.hr_frame_topic(v_c, 0);
    if exists (select 1 from realtime.messages where topic in (v_ta0, v_ta1, v_tb0, v_tc0)) then
      raise exception 's-fixture: a probe topic carries rows before the first write'; end if;

    -- ── s2: THE GATE'S TRUTH TABLE ──────────────────────────────────────────
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('hr.frame_self', '', true);
    perform set_config('hr.frame_origin', '', true);
    if public.hr_frame_wanted(v_c, 0) then raise exception 's2a: a character never opened in a client was wanted'; end if;
    insert into public.character_presence (user_id, slot, seen_at) values (v_c, 0, now() - interval '76 seconds');
    if public.hr_frame_wanted(v_c, 0) then raise exception 's2b: a 76 s old presence counted as open (TTL 75 s)'; end if;
    update public.character_presence set seen_at = now() + interval '10 minutes' where user_id = v_c and slot = 0;
    if public.hr_frame_wanted(v_c, 0) then raise exception 's2c: a presence from the FUTURE counted as open'; end if;
    update public.character_presence set seen_at = now() - interval '74 seconds' where user_id = v_c and slot = 0;
    if not public.hr_frame_wanted(v_c, 0) then raise exception 's2d: a 74 s old presence counted as closed'; end if;
    if public.hr_frame_wanted(v_c, 1) then raise exception 's2e: another slot of an open account was wanted'; end if;
    perform set_config('hr.frame_origin', 'tick', true);
    perform set_config('hr.frame_self', v_c::text || ':0', true);
    if not public.hr_frame_wanted(v_c, 0) then raise exception 's2f: a tick frame for an open character was silenced'; end if;
    perform set_config('hr.frame_origin', '', true);
    -- the echo rule needs the ENGINE (role hr_engine, no JWT): it is executed through hr_apply in s3h and the
    -- instance settle in s4(b); here, as the owner, a marked transaction still sends (rule (c)).
    if not public.hr_frame_wanted(v_c, 0) then raise exception 's2g: a NON-engine marked frame was silenced'; end if;
    perform set_config('hr.frame_self', '', true);

    -- ── s3: ★ AN ACCEPTED WRITE -> EXACTLY ONE FRAME ★ ──────────────────────
    update public.character_presence set seen_at = now() where user_id = v_c and slot = 0;
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51001')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    if coalesce(v_r->>'ok', '') <> 'true' then raise exception 's3-fixture: the probe write was refused: %', v_r; end if;
    select count(*) into v_n from realtime.messages where topic = v_tc0;
    if v_n <> 1 then raise exception 's3a: an accepted write to an OPEN character sent % frame(s), expected exactly 1', v_n; end if;
    select payload into v_m from realtime.messages where topic = v_tc0;
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    if v_m->>'t' is distinct from 'state' or (v_m->>'frame')::bigint is distinct from v_ver
       or (v_m->'env'->>'version')::bigint is distinct from v_ver or jsonb_typeof(v_m->'env'->'state') <> 'object'
       or v_m->'env'->>'ok' is distinct from 'true' then
      raise exception 's3b: the frame is not the whole envelope at the row''s version % (frame %, t %)', v_ver, v_m->>'frame', v_m->>'t';
    end if;
    if (select event from realtime.messages where topic = v_tc0) is distinct from 'frame'
       or not coalesce((select private from realtime.messages where topic = v_tc0), false) then
      raise exception 's3c: the frame went out under another event or as a PUBLIC message'; end if;
    raise notice 'frame-push-revive: a fresh character''s frame is % bytes', octet_length(v_m::text);
    -- a replay of the same intent sends nothing more
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver - 1, (k || 'f2a51001')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    if (select count(*) from realtime.messages where topic = v_tc0) <> 1 then
      raise exception 's3d: a REPLAYED intent pushed another frame'; end if;
    -- a closed character gets none, and the payment is the same
    update public.character_presence set seen_at = now() - interval '10 minutes' where user_id = v_c and slot = 0;
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51002')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    if coalesce(v_r->>'ok', '') <> 'true' or (select version from public.player_state where user_id = v_c and slot = 0) <> v_ver + 1 then
      raise exception 's3e: the write to a CLOSED character did not land: %', v_r; end if;
    if (select count(*) from realtime.messages where topic = v_tc0) <> 1 then
      raise exception 's3f: a write to a CLOSED character pushed a frame'; end if;
    -- the switch off dominates
    update public.character_presence set seen_at = now() where user_id = v_c and slot = 0;
    update public.hr_tick_config set frame_push = false where id;
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51003')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    update public.hr_tick_config set frame_push = true where id;
    if coalesce(v_r->>'ok', '') <> 'true' or (select count(*) from realtime.messages where topic = v_tc0) <> 1 then
      raise exception 's3g: frame_push = false and a write still pushed (or was refused: %)', v_r; end if;
    -- the engine requester's OWN write (the edge marks hr.frame_self = its verified user:slot) is not echoed;
    -- the same transaction marked for ANOTHER slot still sends
    perform set_config('hr.frame_self', v_c::text || ':0', true);
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51004')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    if coalesce(v_r->>'ok', '') <> 'true' or (select count(*) from realtime.messages where topic = v_tc0) <> 1 then
      raise exception 's3h: the requester''s OWN write was echoed back (or refused: %)', v_r; end if;
    perform set_config('hr.frame_self', v_c::text || ':1', true);
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51005')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    perform set_config('hr.frame_self', '', true);
    if coalesce(v_r->>'ok', '') <> 'true' or (select count(*) from realtime.messages where topic = v_tc0) <> 2 then
      raise exception 's3i: a write marked for ANOTHER slot was silenced (or refused: %)', v_r; end if;

    -- ── s4: ★ A SETTLE -> ONE FRAME PER OPEN MEMBER, AT THE COMMIT POINT ★ ──
    execute $f$
      create function pg_temp.hr_fpr_settle(p_inst uuid, p_swings bigint, p_self text, p_bad boolean default false) returns jsonb
      language plpgsql set search_path = public, pg_catalog as $b$
      -- One instance window of p_swings swings as the engine proposes it (every open member, one kill and one Level XP
      -- each), committed through hr_hunt_apply_instance as hr_engine; p_self is the edge's hr.frame_self marker
      -- ('' = the world tick, '<user>:<slot>' = that member's own hello); p_bad proposes a stale swing index, which
      -- hr_hunt_apply_member refuses INSIDE the member sub-transaction (the refused exit).
      declare v_i public.hunt_instances%rowtype; v_s public.hunt_sessions%rowtype; v_t bigint; v_to timestamptz;
              v_m jsonb := '[]'::jsonb; v_s0 bigint; v_ver bigint; v_e jsonb;
      begin
        perform set_config('request.jwt.claim.sub', '', true);
        select * into v_i from public.hunt_instances where id = p_inst;
        v_t := public.hr_hunt_limit('swing_interval_ms');
        v_to := v_i.settled_to + make_interval(secs => p_swings * v_t / 1000.0);
        for v_s in select * from public.hunt_sessions where instance_id = p_inst and ended_at is null order by user_id, slot loop
          v_s0 := public.hr_stamina_of(v_s.user_id, v_s.slot, v_s.settled_to);
          select version into v_ver from public.player_state where user_id = v_s.user_id and slot = v_s.slot;
          v_m := v_m || jsonb_build_array(jsonb_build_object('user', v_s.user_id, 'slot', v_s.slot, 'session', v_s.id,
            'version', v_ver, 'intent', gen_random_uuid(),
            'delta', jsonb_build_object('accrued_to', v_to, 'level_xp', 1,
              'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
                'meta', jsonb_build_object('ms', p_swings * v_t, 'ticks', p_swings, 'kills', 1, 'mon', v_s.hunt_id,
                                           'from', v_s.settled_to, 'to', v_to))),
            'hunt', jsonb_build_object('swing_from', v_s.swing_index + case when p_bad then 1 else 0 end, 'swing_to', v_s.swing_index + p_swings, 'to', v_to,
              'next_swing_at', v_to, 'uses', '{}'::jsonb, 'paid_ms', p_swings * v_t, 'raw_xp', '{}'::jsonb,
              'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
              'ended', null, 'buys', '{}'::jsonb, 'cover', '{}'::jsonb, 'stamina', greatest(0, v_s0 - p_swings * v_t),
              'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
            'analyzer', null));
        end loop;
        perform set_config('hr.frame_self', coalesce(p_self, ''), true);
        execute 'set local role hr_engine';
        v_e := public.hr_hunt_apply_instance(p_inst, v_i.world_swing,
          jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + p_swings, 'world', null), v_m, null, null);
        execute 'reset role';
        perform set_config('hr.frame_self', '', true);
        return v_e;
      end $b$ $f$;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    update public.hr_hunt_config set enabled = true where id;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    -- A0 leads, A1 (A's own) joins at once, B accepts an invite; A0 starts.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_invite_own(0, 1, (k || 'f2a51100')::uuid);
    v_pid := public.hr_hunt_party_of(v_a, 0);
    v := public.hr_hunt_party_invite(0, 'Probe Frame B', (k || 'f2a51101')::uuid);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || 'f2a51102')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null then raise exception 's4-fixture: the party did not form: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hunt_party_start(0, v_g, (k || 'f2a51103')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 's4-fixture: the start answered %', v; end if;
    v_at := date_trunc('second', now() - interval '10 minutes');
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at
     where user_id = any (v_u) and instance_id = v_pid and ended_at is null;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_pid;
    if (select count(*) from public.hunt_sessions where instance_id = v_pid and ended_at is null) <> 3 then
      raise exception 's4-fixture: the party is not one instance of three'; end if;
    -- A0 and A1 are open in a client; B is not.
    insert into public.character_presence (user_id, slot, seen_at) values (v_a, 0, now()), (v_a, 1, now())
      on conflict (user_id, slot) do update set seen_at = now();
    delete from public.character_presence where user_id = v_b;
    select count(*) filter (where topic = v_ta0), count(*) filter (where topic = v_ta1), count(*) filter (where topic = v_tb0)
      into n_a0, n_a1, n_b0 from realtime.messages;
    -- (a) the world tick's settle: every open member once, the closed one never
    v := pg_temp.hr_fpr_settle(v_pid, 5, '');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 's4-fixture: the tick window answered %', v; end if;
    select world_swing into v_wsw from public.hunt_instances where id = v_pid;
    if (select count(*) from realtime.messages where topic = v_ta0) <> n_a0 + 1
       or (select count(*) from realtime.messages where topic = v_ta1) <> n_a1 + 1 then
      raise exception 's4a: a settle sent % / % frame(s) to the two OPEN members, expected exactly 1 each (a frame from '
                      'inside the member loop is a second one)',
        (select count(*) from realtime.messages where topic = v_ta0) - n_a0, (select count(*) from realtime.messages where topic = v_ta1) - n_a1;
    end if;
    if (select count(*) from realtime.messages where topic = v_tb0) <> n_b0 then
      raise exception 's4b: a settle pushed a frame to a member NOT open in any client'; end if;
    for v_i in 0 .. 1 loop
      select payload into v_m from realtime.messages where topic = public.hr_frame_topic(v_a, v_i) order by (payload->>'frame')::bigint desc limit 1;
      select version into v_ver from public.player_state where user_id = v_a and slot = v_i;
      if v_m->>'t' is distinct from 'state' or (v_m->>'frame')::bigint is distinct from v_ver
         or (v_m->'env'->>'version')::bigint is distinct from v_ver then
        raise exception 's4c: A%''s settle frame is version % (t %), the row holds %: not the committed state', v_i, v_m->>'frame', v_m->>'t', v_ver;
      end if;
      if (v_m->'env'->'hunt'->'instance'->>'world_swing')::bigint is distinct from v_wsw then
        raise exception 's4d: A%''s settle frame shows world swing %, the instance committed %: it was built before the settle finished',
          v_i, v_m->'env'->'hunt'->'instance'->>'world_swing', v_wsw;
      end if;
    end loop;
    -- (b) A0's OWN hello: its echo is not sent, A1's frame is
    v := pg_temp.hr_fpr_settle(v_pid, 5, v_a::text || ':0');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 's4-fixture: A0''s window answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_ta0) <> n_a0 + 1 then
      raise exception 's4e: the requester''s OWN settle was echoed back to it'; end if;
    if (select count(*) from realtime.messages where topic = v_ta1) <> n_a1 + 2 then
      raise exception 's4f: A0''s hello did not push A1''s settled state (A1 is open)'; end if;
    -- (c) B opens: its next settle reaches it, once
    insert into public.character_presence (user_id, slot, seen_at) values (v_b, 0, now());
    v := pg_temp.hr_fpr_settle(v_pid, 5, '');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 's4-fixture: the third window answered %', v; end if;
    if (select count(*) from realtime.messages where topic = v_tb0) <> n_b0 + 1
       or (select count(*) from realtime.messages where topic = v_ta0) <> n_a0 + 2
       or (select count(*) from realtime.messages where topic = v_ta1) <> n_a1 + 3 then
      raise exception 's4g: after B opened, a settle sent B %, A0 %, A1 % frame(s) (expected 1, 1, 1 more)',
        (select count(*) from realtime.messages where topic = v_tb0) - n_b0,
        (select count(*) from realtime.messages where topic = v_ta0) - n_a0 - 1,
        (select count(*) from realtime.messages where topic = v_ta1) - n_a1 - 2;
    end if;
    -- (d) the defer never outlives a settle, committed or REFUSED inside its member loop: the next accepted write in
    --     the same transaction still pushes
    if coalesce(current_setting('hr.frame_defer', true), '') <> '' then
      raise exception 's4h: hr.frame_defer is still set after a committed settle (every later write would be silent)'; end if;
    v := pg_temp.hr_fpr_settle(v_pid, 5, '', true);
    if coalesce(v->>'ok', '') = 'true' then raise exception 's4-fixture: a stale-swing window was accepted: %', v; end if;
    if (select count(*) from realtime.messages where topic in (v_ta0, v_ta1, v_tb0)) <> n_a0 + n_a1 + n_b0 + 6 then
      raise exception 's4i: a REFUSED settle pushed a frame'; end if;
    if coalesce(current_setting('hr.frame_defer', true), '') <> '' then
      raise exception 's4h: hr.frame_defer is still set after a REFUSED settle (every later write would be silent)'; end if;
    select version into v_ver from public.player_state where user_id = v_c and slot = 0;
    execute 'set local role hr_engine';
    v_r := public.hr_apply(v_c, 0, v_ver, (k || 'f2a51006')::uuid,
             jsonb_build_object('gold', 7, 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'frame-push-revive-selfcheck', 'qty', 1))));
    execute 'reset role';
    if coalesce(v_r->>'ok', '') <> 'true' or (select count(*) from realtime.messages where topic = v_tc0) <> 3 then
      raise exception 's4h: an accepted write after a refused settle was silent (or refused: %)', v_r; end if;

    -- ── s5: ★ RLS: WHO MAY RECEIVE hr:<A>:0 ★ ─────────────────────────────────
    -- Realtime authorizes a JOIN: it reads realtime.messages as the joining user with realtime.topic() set to the
    -- channel. So "can U receive topic T" = does U, with realtime.topic = T, see any broadcast row at all.
    perform realtime.send(jsonb_build_object('t', 'hr1225-probe'), 'frame', v_ta0, true);
    for v_i in 1 .. 5 loop
      -- (1) B joins A's topic  (2) A joins its own  (3) A, a fourth segment  (4) A, slot 9  (5) B joins its own
      perform set_config('request.jwt.claim.sub', (case when v_i in (1, 5) then v_b else v_a end)::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', case when v_i in (1, 5) then v_b else v_a end,
                                                                  'role', 'authenticated')::text, true);
      perform set_config('realtime.topic', case v_i when 1 then v_ta0 when 2 then v_ta0 when 3 then v_ta0 || ':x'
                                                 when 4 then 'hr:' || v_a::text || ':9' else v_tb0 end, true);
      execute 'set local role authenticated';
      select count(*) into v_n from realtime.messages;
      execute 'reset role';
      if v_i = 1 and v_n <> 0 then raise exception 's5a: another user receives A''s frame topic (% rows visible)', v_n; end if;
      if v_i = 2 and v_n < 1 then raise exception 's5b: A cannot receive its OWN topic (the frames above never arrive)'; end if;
      if v_i = 3 and v_n <> 0 then raise exception 's5c: a topic with a fourth segment is receivable'; end if;
      if v_i = 4 and v_n <> 0 then raise exception 's5d: slot 9 is receivable (slots are 0-5)'; end if;
      if v_i = 5 and v_n < 1 then raise exception 's5e: B cannot receive its own topic'; end if;
    end loop;
    -- no client can SEND: there is no write policy, so a client insert is refused by RLS (42501)
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', v_ta0, true);
    v_n := 1;
    begin
      execute 'set local role authenticated';
      insert into realtime.messages (topic, extension, event, payload, private)
        values (v_ta0, 'broadcast', 'frame', jsonb_build_object('t', 'state', 'frame', 999999, 'env', jsonb_build_object('ok', true)), true);
    exception
      when insufficient_privilege then v_n := 0;
      when others then v_n := -1; v_txt := sqlerrm;
    end;
    execute 'reset role';
    if v_n = 1 then raise exception 's5f: a CLIENT inserted a message on its own topic: server impersonation'; end if;
    if v_n = -1 then raise exception 's5f-harness: the client insert failed for another reason (%), so the write refusal is unproven', v_txt; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('realtime.topic', '', true);
    select string_agg(policyname || '/' || cmd, ', ' order by policyname) into v_txt
      from pg_policies where schemaname = 'realtime' and tablename = 'messages';
    if v_txt is distinct from 'hr_frame_receive_own_topic/SELECT' then
      raise exception 's5g: realtime.messages carries policies [%], expected exactly the installer''s receive-only one', v_txt; end if;

    -- ── s6: EVERY BODY LANDED AS ITS POST PIN ──────────────────────────────────
    select string_agg(p.sig || ' landed as ' || coalesce(md5(replace(x.prosrc, chr(13), '')), 'nothing') || ', pinned ' || p.post, '; ')
      into v_txt
      from (values
        ('public.hr_frame_send(uuid,integer,jsonb)', 'c924aed24c9e409173e03d7c91fe89c6'),
        ('public.hr_frame_wanted(uuid,integer)', '93d3efe939be804945bf63790704aac6'),
        ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '1f1957170fa2149be05e1b689c5c4ef9')) p(sig, post)
      left join pg_proc x on x.oid = to_regprocedure(p.sig)
     where md5(replace(x.prosrc, chr(13), '')) is distinct from p.post;
    if v_txt is not null then raise exception 's6: a body is not §0''s post pin: %', v_txt; end if;

    raise exception 'hr1225-selfcheck-ok';
  exception when others then
    if sqlerrm <> 'hr1225-selfcheck-ok' then raise; end if;
  end;
  raise notice 'frame-push-revive: self-check passed (transport %), every probe rolled back', v_rt;
end $$;
