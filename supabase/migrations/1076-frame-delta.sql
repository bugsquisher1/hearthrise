-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1076-frame-delta.sql — A PUSHED FRAME CARRIES ONLY THE SECTIONS THAT MOVED SINCE THE TOPIC'S LAST
--   FRAME, WHOLE AGAIN ON THE ONE COPY THE PUSH ITSELF GAVE (lane/realtime-budget, systems-engineer, 2026-11-27).
--
-- STATUS: supabase/migration-notes/1076-frame-delta.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base. It restates ONE body,
--   hr_frame_send (2026-12-25-frame-push-revive.sql's image, PINNED in §0); nothing else on the chain is edited.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §6 self-check.
-- CLIENT: src/session/envelope.js frameOfDelta, src/session/character-session.js onFrame / _rebase (ships with this file).
--   EITHER ORDER IS SAFE: a client without the delta half refuses a `t:'delta'` frame as malformed (envelope.js frameEnvelope)
--   and keeps its record (an unviewed hero then waits for a whole frame: one a join, a key change or a rebase); a client with
--   it against the old server only ever sees whole frames. The client calls hr_frame_rebase at each join; before this file
--   that call answers 404 and changes nothing.
-- EDGE: none (hr-accrue sends no frame; pack-edge --hash unmoved).
--
-- ── WHY (measured, lane/lt-load-test HANDOFFS 2026-11-27 item 4 and this lane's replay) ─────────────────────────────
-- Every frame was the whole hr_state_of envelope: 1.58 to 1.70 frames a second at 20 to 21 KB with 20 accounts online,
--   3.78 a second at 36 KB with 100 (136 KB/s, run 45993601381), about 1.5 KB/s an online account. On the replay's heavy
--   four (one account, four heroes, Krell's Hold, the watched door) a frame is 41.5 KB of jsonb text and 62% of its bytes
--   are sections byte-identical to the same topic's previous frame (hunt_settings 9.8 KB, tower, home, factions, depot,
--   titles, gold_estimate, entry_gates ... never move between two settles). Realtime egress is billed by the byte (the
--   unified egress quota) and the project's tenant config names max_bytes_per_second 100,000.
-- 2026-12-25 retired a KEY-SUBSET delta because "a subset at a newer version is a record that claims a version it does not
--   hold". That fault is a subset applied to WHATEVER the client holds. This frame is applied only to the exact copy it was
--   computed against: the client holds the last frame's whole envelope (its chain), and a delta names that copy's version
--   (`base`); on any other copy it is refused and the client asks for a whole frame (hr_frame_rebase). So the record the
--   client builds is, section for section, the server's envelope at `frame` (E1 unchanged: it REPLACES the record).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 public.hr_frame_memo (user_id, slot) -> version, keys, sums, at: what the server last PUSHED on that hero's topic.
--      keys  md5 of the envelope's top-level key list (collate "C" order);
--      sums  the 16-hex md5 prefix of each section's jsonb text, concatenated in that order (64 bits a section).
--      Owner-only (RLS on, no policy, every grant revoked). Written only by hr_frame_send, in the frame's own transaction,
--      AFTER the size ceiling and BEFORE realtime.send: a frame not sent leaves it as it was, and a rolled-back writer takes
--      its memo and its message back together. Deleted by hr_frame_rebase (the owner's own rows) and pruned after an hour.
-- §2 hr_frame_delta(p_user, p_slot, p_msg) -> (msg, version, keys, sums), owner-only, VOLATILE (it locks the memo row):
--      the whole frame p_msg = {t:'state', frame:V, env} (hr_frame_payload's) is sent WHOLE when the topic has no memo, the
--      memo's version is not older than V, or the key list moved; otherwise as
--        { t: 'delta', frame: V, base: <memo version>, env: { every section whose sum differs from the memo's } }
--      (`version` always moves, so it is always in env). The memo row is read FOR UPDATE, so two writers framing one hero
--      serialise on it and the second's base is the first's frame, in commit order, which is Realtime's delivery order.
-- §3 hr_frame_send RESTATED: the 2026-12-25 order kept (switch, transport, defer, gate, payload, size, send); the payload
--      step adds the delta, the size ceiling reads the message actually sent, and the memo is written between the two.
-- §4 hr_frame_rebase(p_slot) -> { ok }, authenticated: the next frame to the caller's own hero in that slot is whole. The
--      client asks it on every join of the topic and when a delta's base is not the copy it holds (a lost frame).
-- §5 hr_frame_memo_prune(p_limit): memos untouched for an hour, cron hr-frame-memo-prune at :13 (a later frame is whole).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- A frame is sent inside its writer's transaction (hr_apply, the instance settle's commit point) under that writer's locks
--   (the hero's player_state row, the instance, the purses); the memo row lock is taken last, in the same (user, slot) order
--   the commit point frames its members, so it adds no new lock order. A rebase is one DELETE of the caller's own row: a frame
--   in flight either committed first (the delete removes its memo, the next frame is whole) or waits on the row and inserts
--   a fresh memo (sent whole). A memo row never blocks a settle on another hero.
--
-- ── EXPLOIT SURFACE DELTA (pre-EA Security list: a delivery surface, moves no value) ─────────────────────────────────
-- ONE new client verb, hr_frame_rebase(p_slot): signed in, access-checked, rate-gated (20 a minute), deletes only the
--   caller's own memo row for that slot. The worst a forged or spammed call does is make the caller's OWN next frame whole,
--   the cost every frame had before this file. It reads nothing back. No other player's topic, memo or state is reachable:
--   the topic, its RLS and the presence gate are unchanged, and the memo is invisible to every client role. A frame is still
--   a copy of committed state; the delta names a base, never a value the client chose.
--
-- ── COST (bytes and rows) ───────────────────────────────────────────────────
-- Bytes: on the replay's heavy four a frame drops from 41.5 KB to the sections that moved (see the lane's before/after:
--   HANDOFFS 2026-11-27 lane/realtime-budget). Realtime messages: unchanged in count. Database: per frame, one jsonb_each and
--   one md5 a section of the envelope already built (the projection is not re-read), one primary-key read FOR UPDATE and one
--   upsert of a ~1.6 KB row (HOT: no column of it is indexed but the key); realtime.messages (WAL-logged, the message
--   Realtime reads) shrinks by the bytes cut, far more than the memo adds. Unwatched heroes and closed tabs cost nothing
--   (the gate comes first). Rows: one memo row a hero open in a client in the last hour.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-12-25-frame-push-revive.sql §3's hr_frame_send (every frame whole again; clients holding a chain take a
--   whole frame as always), then drop hr_frame_rebase (and its baseline row), hr_frame_delta, hr_frame_memo_prune, the cron
--   job and the table. Nothing a player owns is in any of them.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regprocedure('public.hr_frame_payload(jsonb)') is null or to_regprocedure('public.hr_frame_wanted(uuid,integer)') is null
     or to_regprocedure('public.hr_frame_topic(uuid,integer)') is null or to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null or to_regprocedure('public.hr_access_check()') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.character_presence') is null then
    raise exception 'PRECONDITION: the push channel (2026-12-25-frame-push-revive.sql), presence and the client surface first'; end if;
  -- hr_frame_send is 2026-12-25's image (pre) or this file's own (post: a second apply); anything else means another file
  -- moved it, and this file is re-derived from that image before it applies.
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_frame_send(uuid,integer,jsonb)');
  if v_md5 is distinct from 'c924aed24c9e409173e03d7c91fe89c6' and strpos(coalesce((select prosrc from pg_proc
       where oid = to_regprocedure('public.hr_frame_send(uuid,integer,jsonb)')), ''), 'FRAME-DELTA (1076') = 0 then
    raise exception 'PIN: hr_frame_send is neither 2026-12-25-frame-push-revive.sql''s image (c924aed2) nor this file''s (md5 %): re-derive', v_md5; end if;
end $mig$;

-- ── §1 THE MEMO: WHAT THE SERVER LAST PUSHED ON EACH OPEN HERO'S TOPIC ──────
create table if not exists public.hr_frame_memo (
  user_id uuid        not null references auth.users (id) on delete cascade,
  slot    smallint    not null check (slot between 0 and 32),
  version bigint      not null check (version >= 0),
  keys    text        not null,
  sums    text        not null,
  at      timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.hr_frame_memo enable row level security;
revoke all on public.hr_frame_memo from public, anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute 'revoke all on public.hr_frame_memo from hr_engine'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute 'revoke all on public.hr_frame_memo from hr_tick'; end if;
end $mig$;
comment on table public.hr_frame_memo is
  'FRAME-DELTA (1076-frame-delta.sql): per hero topic, the version, key-list md5 and per-section md5 prefixes of the last frame pushed; '
  'a frame is sent as the sections that differ from it. Owner-only; written by hr_frame_send, deleted by hr_frame_rebase, pruned after 1 h.';

-- ── §2 THE DELTA ─────────────────────────────────────────────────────────────
-- p_msg is hr_frame_payload's whole frame. Writes nothing; the caller writes the memo once the message is under its ceiling.
create or replace function public.hr_frame_delta(p_user uuid, p_slot integer, p_msg jsonb,
  out msg jsonb, out version bigint, out keys text, out sums text)
language plpgsql volatile security definer set search_path = public as $fn$
declare
  v_env   jsonb := p_msg->'env';
  v_base  bigint; v_keys text; v_sums text;
  v_moved jsonb;
begin
  -- FRAME-DELTA (1076-frame-delta.sql): the sections that moved since this topic's last frame, on that frame's own copy.
  version := (p_msg->>'frame')::bigint;
  select m.version, m.keys, m.sums into v_base, v_keys, v_sums
    from public.hr_frame_memo m where m.user_id = p_user and m.slot = p_slot for update;
  with s as (
    select e.key, e.value, left(md5(e.value::text), 16) as h, row_number() over (order by e.key collate "C") as i
      from jsonb_each(v_env) e)
  select md5(string_agg(s.key, ',' order by s.i)), string_agg(s.h, '' order by s.i),
         coalesce(jsonb_object_agg(s.key, s.value) filter (where substr(coalesce(v_sums, ''), (s.i::int - 1) * 16 + 1, 16) is distinct from s.h), '{}'::jsonb)
    into keys, sums, v_moved
    from s;
  if v_base is null or v_base >= version or v_keys is distinct from keys then
    msg := p_msg;                                           -- WHOLE: no copy to build on, not newer, or the key list moved
  else
    msg := jsonb_build_object('t', 'delta', 'frame', version, 'base', v_base, 'env', v_moved);
  end if;
end $fn$;
revoke execute on function public.hr_frame_delta(uuid, integer, jsonb) from public;
revoke execute on function public.hr_frame_delta(uuid, integer, jsonb) from anon, authenticated, service_role;

-- ── §3 THE EMITTER, RESTATED (2026-12-25 §3 with the delta at its payload step) ──
create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
returns void language plpgsql volatile security definer set search_path = public as $fn$
declare
  -- The smallest broadcast payload ceiling Supabase sells (Free: 256 KB); a bigger frame is not sent, the poll heals it.
  c_max_bytes constant int := 250000;
  v_on  boolean;
  v_env jsonb;
  v_msg jsonb;
  v_d   record;
begin
  /* ⚠ THE WHOLE BODY IS INSIDE ONE exception BLOCK, AND THAT IS THE POINT. The value is computed, clamped, written
     and journalled before this runs; a frame is a COPY of a fact the database already holds. Realtime absent, a
     payload over the limit, a permission change, a projection that throws: each degrades to "no frame", which the
     next frame and the client's rebase both heal. It may never degrade to a rolled-back payment. The block is a
     sub-transaction: a send that raises takes the memo it wrote back with it. */
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
    -- FRAME-DELTA (1076-frame-delta.sql): only the sections that moved since this topic's last frame (hr_frame_delta),
    -- whole when there is no such frame to build on.
    select * into v_d from public.hr_frame_delta(p_user, p_slot, v_msg);
    v_msg := v_d.msg;
    if octet_length(v_msg::text) > c_max_bytes then
      raise warning 'hr_frame_send: frame % for %/% is % bytes (ceiling %): not sent, the poll heals it',
        v_msg->>'frame', p_user, p_slot, octet_length(v_msg::text), c_max_bytes;
      return;
    end if;
    -- The copy the client now holds: the next frame's base (hr_frame_memo). Written only for a frame that goes.
    insert into public.hr_frame_memo as m (user_id, slot, version, keys, sums, at)
    values (p_user, p_slot, v_d.version, v_d.keys, v_d.sums, now())
    on conflict (user_id, slot) do update
      set version = excluded.version, keys = excluded.keys, sums = excluded.sums, at = excluded.at;

    perform realtime.send(v_msg, 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_frame_send: frame % for %/% not sent (%) — the write is committed anyway',
      coalesce(p_env->>'version', '?'), p_user, p_slot, sqlerrm;
  end;
end $fn$;
revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from public;
revoke execute on function public.hr_frame_send(uuid, integer, jsonb) from anon, authenticated, service_role;

-- ── §4 THE CLIENT'S ONE VERB: "MY NEXT FRAME WHOLE" ─────────────────────────
create or replace function public.hr_frame_rebase(p_slot integer)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid();
begin
  -- FRAME-DELTA (1076-frame-delta.sql): the client has no copy the next delta could build on (a join, a lost frame).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 32 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'frame:rebase', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  delete from public.hr_frame_memo where user_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true);
end $fn$;
revoke execute on function public.hr_frame_rebase(integer) from public;
revoke execute on function public.hr_frame_rebase(integer) from anon, service_role;
grant execute on function public.hr_frame_rebase(integer) to authenticated;

-- ── §5 THE PRUNE ─────────────────────────────────────────────────────────────
create or replace function public.hr_frame_memo_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $fn$
declare v_n bigint;
begin
  -- FRAME-DELTA (1076-frame-delta.sql): a memo untouched for an hour builds no frame anyone holds; the next one is whole.
  with doomed as (
    select m.user_id, m.slot from public.hr_frame_memo m
     where m.at < now() - interval '1 hour'
     limit greatest(1, least(coalesce(p_limit, 20000), 200000)))
  delete from public.hr_frame_memo m using doomed d where m.user_id = d.user_id and m.slot = d.slot;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke execute on function public.hr_frame_memo_prune(integer) from public;
revoke execute on function public.hr_frame_memo_prune(integer) from anon, authenticated, service_role;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_frame_delta(uuid,integer,jsonb)', 'public.hr_frame_send(uuid,integer,jsonb)',
                               'public.hr_frame_rebase(integer)', 'public.hr_frame_memo_prune(integer)'] loop
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'frame-delta §5: pg_cron absent here; hr-frame-memo-prune is not scheduled';
    return;
  end if;
  perform public.hr_cron_ensure('hr-frame-memo-prune', '13 * * * *', 'select public.hr_frame_memo_prune(20000)');
end $mig$;

-- A walled (Game Master) account plays its own heroes on the same push: its rebase reaches only its own memo.
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_frame_rebase', 'its own push') on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_frame_rebase';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_frame_rebase', 'p_slot integer', 'authenticated',
   'added 1076-frame-delta.sql (lane/realtime-budget): the next pushed frame to the caller''s own hero in that slot is whole (deletes the caller''s own hr_frame_memo row); access-checked, 20 a minute; moves no value; pre-EA Security list (delivery surface)');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
--   s0  grants: only authenticated executes the verb; nobody executes the delta, the emitter or the prune; the memo is
--       invisible to every client role; hygiene STRICT; the emitter keeps switch -> defer -> gate -> size -> memo -> send
--   s1  ★ the first frame to a topic is WHOLE and leaves a memo at its version
--   s2  ★ the next one is a DELTA on that version carrying exactly the sections that moved, and the base's env with the
--       delta's laid over it IS the whole envelope at the new version, key for key
--   s3  a moved key list, or a version not newer than the memo's, goes WHOLE
--   s4  a closed character: no frame, the memo untouched; a frame over the ceiling: not sent, the memo untouched
--   s5  ★ the rebase: signed out refused; the caller's own slot only; the next frame is WHOLE
--   s6  the prune takes an hour-old memo and keeps a fresh one
do $$
declare
  c_a  constant uuid := '000000c0-0000-4000-a000-00001076f0a1';
  c_b  constant uuid := '000000c0-0000-4000-a000-00001076f0b2';
  v_rt text := 'absent';
  v_ta text; v_tb text; v_txt text; v_n int; v_m jsonb; v_e5 jsonb; v_e6 jsonb; v_e7 jsonb; v_r jsonb;
  v_pad text := repeat('x', 4000);
begin
  begin
    -- ── s0 ──────────────────────────────────────────────────────────────────
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      continue when v_txt <> 'public' and not exists (select 1 from pg_roles where rolname = v_txt);
      if has_function_privilege(v_txt, 'public.hr_frame_delta(uuid,integer,jsonb)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_frame_send(uuid,integer,jsonb)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_frame_memo_prune(integer)', 'EXECUTE')
         or (v_txt <> 'authenticated' and has_function_privilege(v_txt, 'public.hr_frame_rebase(integer)', 'EXECUTE'))
         or (v_txt <> 'public' and has_table_privilege(v_txt, 'public.hr_frame_memo', 'SELECT,INSERT,UPDATE,DELETE')) then
        raise exception 's0a: % can reach the frame delta, the emitter, the prune, the memo or (not a client) the rebase', v_txt;
      end if;
    end loop;
    if not has_function_privilege('authenticated', 'public.hr_frame_rebase(integer)', 'EXECUTE') then
      raise exception 's0b: a signed-in client cannot ask for its whole frame'; end if;
    if not exists (select 1 from pg_class where oid = 'public.hr_frame_memo'::regclass and relrowsecurity) then
      raise exception 's0c: hr_frame_memo has no row level security'; end if;
    v_txt := replace(pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if not (position('coalesce(v_on, false)' in v_txt) < position('hr.frame_defer' in v_txt)
        and position('hr.frame_defer' in v_txt) < position('public.hr_frame_wanted(p_user, p_slot)' in v_txt)
        and position('public.hr_frame_wanted(p_user, p_slot)' in v_txt) < position('public.hr_frame_delta(p_user, p_slot, v_msg)' in v_txt)
        and position('public.hr_frame_delta(p_user, p_slot, v_msg)' in v_txt) < position('c_max_bytes then' in v_txt)
        and position('c_max_bytes then' in v_txt) < position('insert into public.hr_frame_memo' in v_txt)
        and position('insert into public.hr_frame_memo' in v_txt) < position('perform realtime.send(' in v_txt)) then
      raise exception 's0d: hr_frame_send no longer reads switch -> defer -> gate -> delta -> size -> memo -> send in order';
    end if;
    perform public.hr_assert_grant_hygiene(true);

    -- ── THE TRANSPORT: a probe where realtime is absent, the real one after a control send (rolled back either way).
    if to_regnamespace('realtime') is null then
      create schema realtime;
      create table realtime.messages (
        id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
        event text, payload jsonb, private boolean, inserted_at timestamptz not null default now());
      create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
        returns void language sql as
        'insert into realtime.messages (topic, extension, event, payload, private) values ($3, ''broadcast'', $2, $1, $4)';
      v_rt := 'probe';
    elsif to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null and to_regclass('realtime.messages') is not null then
      begin
        perform realtime.send(jsonb_build_object('t', 'hr1076-control'), 'hr1076-control', 'hr1076-control:' || c_a::text, true);
        select count(*) into v_n from realtime.messages where topic = 'hr1076-control:' || c_a::text;
      exception when others then v_n := -1; end;
      if v_n = 1 then v_rt := 'live'; end if;
    end if;
    if v_rt = 'absent' then raise exception 's-transport: realtime.messages does not round-trip here; apply where realtime works'; end if;
    update public.hr_tick_config set frame_push = true where id;
    perform set_config('hr.frame_defer', '', true);
    perform set_config('hr.frame_self', '', true);
    perform set_config('hr.frame_origin', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    insert into auth.users (id) values (c_a), (c_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, '1076 §6 probe'), (c_b, '1076 §6 probe') on conflict (user_id) do nothing;
    insert into public.character_presence (user_id, slot, seen_at) values (c_a, 0, now()), (c_b, 0, now())
      on conflict (user_id, slot) do update set seen_at = now();
    delete from public.hr_frame_memo where user_id in (c_a, c_b);
    v_ta := public.hr_frame_topic(c_a, 0); v_tb := public.hr_frame_topic(c_b, 0);
    -- the probe envelopes: hr_state_of's shape (ok, version, state) with a big section that does not move
    v_e5 := jsonb_build_object('ok', true, 'version', 5, 'state', jsonb_build_object('gold', 10, 'hp', 40),
              'skills', jsonb_build_object('melee', 3), 'big', jsonb_build_object('pad', v_pad), 'now', '2026-11-27T00:00:05Z');
    v_e6 := v_e5 || jsonb_build_object('version', 6, 'state', jsonb_build_object('gold', 12, 'hp', 40), 'now', '2026-11-27T00:01:35Z');

    -- ── s1: THE FIRST FRAME IS WHOLE ────────────────────────────────────────
    perform public.hr_frame_send(c_a, 0, v_e5);
    select count(*), (array_agg(payload))[1] into v_n, v_m from realtime.messages where topic = v_ta;
    if v_n <> 1 or v_m->>'t' is distinct from 'state' or v_m->'env' is distinct from v_e5 then
      raise exception 's1a: the first frame to a topic was not the whole envelope (% messages, %)', v_n, left(coalesce(v_m::text, 'none'), 120); end if;
    if (select version from public.hr_frame_memo where user_id = c_a and slot = 0) is distinct from 5 then
      raise exception 's1b: the first frame left no memo at its version'; end if;

    -- ── s2: ★ THE NEXT ONE IS A DELTA, WHOLE AGAIN ON ITS BASE ★ ────────────
    perform public.hr_frame_send(c_a, 0, v_e6);
    select count(*) into v_n from realtime.messages where topic = v_ta;
    select payload into v_m from realtime.messages where topic = v_ta and payload->>'t' = 'delta';
    if v_n <> 2 or v_m is null or (v_m->>'frame')::bigint is distinct from 6 or (v_m->>'base')::bigint is distinct from 5 then
      raise exception 's2a: the second frame was not a delta from 5 to 6 (% messages, %)', v_n, left(coalesce(v_m::text, 'none'), 160); end if;
    if (select array_agg(k order by k) from jsonb_object_keys(v_m->'env') k) is distinct from array['now', 'state', 'version'] then
      raise exception 's2b: the delta carried % (want exactly the sections that moved: now, state, version)',
        (select array_agg(k order by k) from jsonb_object_keys(v_m->'env') k); end if;
    if (v_e5 || (v_m->'env')) is distinct from v_e6 then
      raise exception 's2c: the base with the delta laid over it is not the envelope at 6'; end if;
    if octet_length(v_m::text) * 4 > octet_length(v_e6::text) then
      raise exception 's2d: the delta (% bytes) is not a fraction of the whole (% bytes)', octet_length(v_m::text), octet_length(v_e6::text); end if;
    if (select version from public.hr_frame_memo where user_id = c_a and slot = 0) is distinct from 6 then
      raise exception 's2e: the memo did not move to the delta''s frame'; end if;

    -- ── s3: A MOVED KEY LIST, OR NOT NEWER, GOES WHOLE ──────────────────────
    v_e7 := v_e6 || jsonb_build_object('version', 7, 'hunt', jsonb_build_object('session_id', 'h1'));
    perform public.hr_frame_send(c_a, 0, v_e7);
    select payload into v_m from realtime.messages where topic = v_ta order by inserted_at desc, (payload->>'frame')::bigint desc limit 1;
    if v_m->>'t' is distinct from 'state' or v_m->'env' is distinct from v_e7 then
      raise exception 's3a: a frame whose key list moved was not whole: %', left(v_m::text, 120); end if;
    perform public.hr_frame_send(c_a, 0, v_e7);
    select count(*) into v_n from realtime.messages where topic = v_ta and payload->>'t' = 'delta';
    if v_n <> 1 then raise exception 's3b: a frame not newer than the memo went as a delta (% deltas)', v_n; end if;

    -- ── s4: CLOSED, AND OVER THE CEILING: NOTHING SENT, THE MEMO UNTOUCHED ──
    update public.character_presence set seen_at = now() - interval '5 minutes' where user_id = c_a and slot = 0;
    select count(*) into v_n from realtime.messages where topic = v_ta;
    perform public.hr_frame_send(c_a, 0, v_e7 || jsonb_build_object('version', 8));
    if (select count(*) from realtime.messages where topic = v_ta) <> v_n
       or (select version from public.hr_frame_memo where user_id = c_a and slot = 0) is distinct from 7 then
      raise exception 's4a: a closed character was framed or its memo moved'; end if;
    update public.character_presence set seen_at = now() where user_id = c_a and slot = 0;
    perform public.hr_frame_send(c_a, 0, v_e7 || jsonb_build_object('version', 8, 'big', jsonb_build_object('pad', repeat('y', 260000))));
    if (select count(*) from realtime.messages where topic = v_ta) <> v_n
       or (select version from public.hr_frame_memo where user_id = c_a and slot = 0) is distinct from 7 then
      raise exception 's4b: a frame over the ceiling was sent or moved the memo'; end if;

    -- ── s5: ★ THE REBASE ★ ──────────────────────────────────────────────────
    if public.hr_frame_rebase(0)->>'error' is distinct from 'not_signed_in' then raise exception 's5a: a signed-out rebase was answered'; end if;
    perform public.hr_frame_send(c_b, 0, v_e5);
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    if public.hr_frame_rebase(99)->>'error' is distinct from 'bad_slot' then raise exception 's5b: a slot out of range was not refused'; end if;
    v_r := public.hr_frame_rebase(0);
    if v_r->>'ok' is distinct from 'true' then raise exception 's5c: the owner''s rebase was refused: %', v_r; end if;
    if exists (select 1 from public.hr_frame_memo where user_id = c_a and slot = 0) then raise exception 's5d: the rebase left the memo'; end if;
    if not exists (select 1 from public.hr_frame_memo where user_id = c_b and slot = 0) then raise exception 's5e: A''s rebase took B''s memo'; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform public.hr_frame_send(c_a, 0, v_e7 || jsonb_build_object('version', 9));
    select payload into v_m from realtime.messages where topic = v_ta and (payload->>'frame')::bigint = 9;
    if v_m->>'t' is distinct from 'state' then raise exception 's5f: the frame after a rebase was not whole: %', left(coalesce(v_m::text, 'none'), 120); end if;

    -- ── s6: THE PRUNE ───────────────────────────────────────────────────────
    update public.hr_frame_memo set at = now() - interval '2 hours' where user_id = c_b and slot = 0;
    perform public.hr_frame_memo_prune(20000);
    if exists (select 1 from public.hr_frame_memo where user_id = c_b) or not exists (select 1 from public.hr_frame_memo where user_id = c_a) then
      raise exception 's6: the prune did not take exactly the hour-old memo'; end if;

    raise exception 'HR1076_SELFCHECK_OK';
  exception when others then
    if sqlerrm <> 'HR1076_SELFCHECK_OK' then raise; end if;
  end;
end $$;
