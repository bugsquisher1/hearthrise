-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-10-own-hunt-nudge-once.sql — ONE PUSH FOR ONE END: A SETTLE'S FRAME CARRIES IT, THE NUDGE ONLY WHERE NO FRAME GOES
--   (lane/c-watched-settle-cost, backend-architect, 2026-11-11; set/v0.2.120 48ef016e8: tests/watched-settle-cost.mjs --mutate
--   red at END, "the commit in which the off-screen hero's hunt ended sent it 2 frame(s)").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. Moves no value: it decides which of two state-free pushes over a committed fact goes.
-- EDGE: none (hr-accrue is not touched; pack-edge --hash unmoved). CLIENT: none.
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- 2027-04-09-own-hunt-nudge.sql's hr_hunt_nudge_close fires on every end, whoever caused it. An end found by an instance
-- settle (a death, stamina, supplies, gold, a leave, a swap) happens inside hr_hunt_apply_instance's member loop, and that
-- settle's commit point then frames every member open in a client with its committed state, which already says the hunt
-- ended (2026-12-25-frame-push-revive.sql; never held, 2027-03-31-watched-settle-cost.sql hr_frame_own_held (4)). So every
-- open member except the asker got TWO pushes for one end: the frame (the whole state) and a nudge, which makes each of its
-- clients read hr_state_of once more (42 ms and 75 KB a read, the cost 2027-03-31 was written to cut). CLAUDE.md §6: the
-- end reaches the hero once.
--
-- ── THE FIX (the contract) ──────────────────────────────────────────────────
-- hr_hunt_nudge_trg RESTATED: inside an instance settle (hr.frame_defer, which hr_hunt_apply_instance alone sets, to
-- 'instance', around its members, and clears before its commit point's frames) a hunt's open or close is NOT nudged when
-- hr_frame_wanted says the commit point frames that hero; that frame is the one push. The hero that frame spares (the
-- requester's own echo: its asking client holds the answer, its OTHER clients hold nothing) is still nudged, once, which
-- is the case 2027-04-09 was written for. Outside a settle (a solo enter, the leader's Start, a forfeit, the sweep, a
-- verb) nothing changes: no frame goes there, so the nudge is the one push. Same transaction, same GUCs, same role, same
-- presence row as the commit point's own hr_frame_send, so the two reads agree. The read sits in its own exception
-- block: if it ever fails, the nudge goes (a second push costs a read; a lost end is a bug).
--
-- ── WHO GETS WHAT, PER END (each open in a client) ──────────────────────────
--   the asker's own hero, in its own settle      one nudge (no frame: the self-echo rule)      2027-04-09: one nudge
--   another member (own account or not)          one frame                                     2027-04-09: frame + nudge
--   any member, the world tick's settle          one frame                                     2027-04-09: frame + nudge
--   a forfeit, the sweep, a verb                 one nudge                                     unchanged
--   a hero open in no client                     nothing                                       unchanged
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- No lock, no row: one read of character_presence (the primary key) and of three settings, inside the writer's own
-- transaction. A rolled-back member or settle sends nothing either way. A second apply: §0 accepts the pre-image or this
-- file's own image; create or replace.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None. No grant (§3 asserts no client role executes the trigger function). hr.frame_defer and hr.frame_self are
-- transaction-local settings the engine path sets; a client that set them on its own request could only silence a nudge
-- to its own hero (hr_frame_wanted's (d): a client request is always "wanted", so the nudge would skip only where a frame
-- is not coming from that request either) and cannot reach another player's topic or any value.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- Saves one hr_load (about 42 ms of database time and 75 KB) per open client per settle-found end, and one ~60-byte
-- message. Adds, per end inside a settle, one primary-key probe of character_presence. Nothing per tick.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply §3's hr_hunt_nudge_trg from 2027-04-09-own-hunt-nudge.sql (its image is pinned in §0). No column, row or player
-- value is touched.
-- ORDER: after 2027-04-09-own-hunt-nudge.sql (it restates that file's hr_hunt_nudge_trg). Proof: tests/watched-settle-cost.mjs
-- ONCE (+ --mutate) through the shipped edge, tests/party-flow.mjs PF-OWN-NUDGE / PF-ONCE-IDEM (+ --mutate), §2 below.
-- No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED THE BODY THIS FILE RESTATES, OR THE CONTRACT IT LEANS ON ──────
do $mig$
declare v_md5 text; v_def text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_hunt_nudge_trg()');
  if v_md5 is null then raise exception 'PRECONDITION: apply 2027-04-09-own-hunt-nudge.sql first (hr_hunt_nudge_trg is missing)'; end if;
  if v_md5 is distinct from '5601c5ee71e4f583715515e8024307fd' and v_md5 is distinct from '539b0e423afbaa253ef3b3c5e5c8c3a4' then
    raise exception 'PIN: hr_hunt_nudge_trg is neither 2027-04-09''s image (5601c5ee) nor this file''s own (%) - md5 %: another file moved it; restate from the new image',
      left('539b0e423afbaa253ef3b3c5e5c8c3a4', 8), v_md5; end if;
  if to_regprocedure('public.hr_frame_wanted(uuid,integer)') is null or to_regprocedure('public.hr_hero_nudge(uuid,integer)') is null then
    raise exception 'PRECONDITION: hr_frame_wanted and hr_hero_nudge must exist'; end if;
  -- The settle's push contract this file leans on: hr.frame_defer is 'instance' around the members and cleared before the
  -- commit point, whose loop frames every member through hr_frame_send.
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure), chr(13), '');
  if not (strpos(v_def, 'perform set_config(''hr.frame_defer'', ''instance'', true);') > 0
          and strpos(v_def, 'perform set_config(''hr.frame_defer'', ''instance'', true);') < strpos(v_def, 'v_h := public.hr_hunt_apply_member(')
          and strpos(v_def, 'v_h := public.hr_hunt_apply_member(') < strpos(v_def, 'perform set_config(''hr.frame_defer'', '''', true);
  v_proj := ')
          and strpos(v_def, 'perform set_config(''hr.frame_defer'', '''', true);
  v_proj := ') < strpos(v_def, 'perform public.hr_frame_send((v_m->>''user'')::uuid, (v_m->>''slot'')::int,')) then
    raise exception 'PRECONDITION: hr_hunt_apply_instance no longer defers its members'' pushes to one frame each at its commit point; re-derive this file';
  end if;
end $mig$;

-- ── §1 THE OPEN OR CLOSE NUDGE, EXCEPT WHERE THE SETTLE'S OWN FRAME CARRIES IT ─────────────────────────────────
create or replace function public.hr_hunt_nudge_trg()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- OWN-HUNT-NUDGE (2027-04-09-own-hunt-nudge.sql): the hero's own topic, whoever caused it (its owner on another device
  -- included); a hero idle in town asks nothing, so this is how every other client of it learns the hunt began or ended.
  -- ONE PUSH AN END (2027-04-10-own-hunt-nudge-once.sql): inside an instance settle (hr.frame_defer) the commit point frames
  -- every member hr_frame_wanted wants, with the state that already holds this open or close. That frame is the push; only
  -- the hero it spares (the requester's own echo) is nudged here, for its other clients. If the read fails, the nudge goes.
  begin
    if coalesce(current_setting('hr.frame_defer', true), '') <> '' and public.hr_frame_wanted(new.user_id, new.slot) then
      return null;
    end if;
  exception when others then
    raise warning 'hr_hunt_nudge_trg: the settle''s frame read failed for %/% (%): nudged', new.user_id, new.slot, sqlerrm;
  end;
  perform public.hr_hero_nudge(new.user_id, new.slot);
  return null;
end $$;

do $grants$
declare v_role text;
begin
  revoke all on function public.hr_hunt_nudge_trg() from public, anon, authenticated, service_role;
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_hunt_nudge_trg() from %I', v_role); end if;
  end loop;
end $grants$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- One hero open in a client, solo on the cheapest ground, its Leave due at the end of a four-swing window. The same window,
-- from the same state, through hr_hunt_apply_instance as hr_engine (the edge's role):
--   (a) the hero's OWN ask (hr.frame_self = it): the end reaches its topic ONCE, as a nudge (no frame: the self-echo rule)
--   (b) the world tick (no requester): ONCE, as the state frame (no nudge)
--   (c) outside a settle (hr_hunt_close, as a forfeit or the sweep ends it): ONCE, as a nudge (2027-04-09's rule kept)
--   (d) inside a settle, a hero open in no client: nothing
--   (e) the landed body and grants
do $$
declare
  c_u   constant uuid := '000000d7-0000-4000-a000-00000a4e1001';
  c_sw  constant int := 4;
  v     jsonb; v_g text; v_s public.hunt_sessions%rowtype; v_i public.hunt_instances%rowtype;
  v_at  timestamptz; v_t bigint; v_mto timestamptz; v_to timestamptz; v_ver bigint; v_s0 bigint; v_m jsonb; v_r jsonb;
  v_tp  text; v_nf bigint; v_nn bigint; v_def text;
begin
  begin
    if to_regnamespace('realtime') is null then
      create schema realtime;
      create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
        event text, payload jsonb, private boolean, inserted_at timestamptz not null default now());
      create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as
        'insert into realtime.messages (topic, extension, event, payload, private) values ($3, ''broadcast'', $2, $1, $4)';
    end if;
    update public.hr_tick_config set frame_push = true where id;
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'own-hunt-nudge-once §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'own-hunt-nudge-once §2-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    select g.hunt_id into v_g from public.hr_hunt_grounds g join public.hr_hunts h using (hunt_id) order by h.band_min, g.hunt_id limit 1;
    v := public.hr_hunt_enter(0, v_g, '[]'::jsonb, 0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'own-hunt-nudge-once §2-harness: the enter answered %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    select * into v_s from public.hunt_sessions where user_id = c_u and slot = 0 and ended_at is null;
    v_t := public.hr_hunt_limit('swing_interval_ms');
    v_at := date_trunc('second', now()) - make_interval(secs => (c_sw + 1) * v_t / 1000.0);
    v_mto := v_at + make_interval(secs => c_sw * v_t / 1000.0);
    update public.hunt_sessions set entered_at = v_at - interval '1 minute', hunt_from = v_at, settled_to = v_at, next_swing_at = v_at,
                                    leave_at = v_mto where id = v_s.id;
    update public.hunt_instances set settled_to = v_at, next_swing_at = v_at where id = v_s.instance_id;
    select * into v_s from public.hunt_sessions where id = v_s.id;
    select * into v_i from public.hunt_instances where id = v_s.instance_id;
    v_to := v_i.settled_to + make_interval(secs => c_sw * v_t / 1000.0);
    v_s0 := public.hr_stamina_of(c_u, 0, v_s.settled_to);
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    insert into public.character_presence (user_id, slot, seen_at) values (c_u, 0, now()) on conflict (user_id, slot) do update set seen_at = now();
    v_tp := public.hr_frame_topic(c_u, 0);
    if exists (select 1 from realtime.messages where topic = v_tp) then raise exception 'own-hunt-nudge-once §2-harness: the probe topic is not empty'; end if;
    -- the window as the engine proposes it: no kill, the hero's Leave reached at its end
    v_m := jsonb_build_array(jsonb_build_object('user', c_u, 'slot', 0, 'session', v_s.id, 'version', v_ver, 'intent', gen_random_uuid(),
      'delta', jsonb_build_object('accrued_to', v_mto, 'level_xp', 0,
        'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue',
          'meta', jsonb_build_object('ms', c_sw * v_t, 'ticks', c_sw, 'kills', 0, 'mon', v_s.hunt_id, 'from', v_s.settled_to, 'to', v_mto))),
      'hunt', jsonb_build_object('swing_from', v_s.swing_index, 'swing_to', v_s.swing_index + c_sw, 'to', v_mto,
        'next_swing_at', v_mto, 'uses', '{}'::jsonb, 'paid_ms', c_sw * v_t, 'raw_xp', '{}'::jsonb,
        'hints', jsonb_build_object('slot_dry', '{}'::jsonb, 'rare_drop', '[]'::jsonb, 'death', '[]'::jsonb),
        'ended', jsonb_build_object('reason', 'left', 'at', v_mto),
        'buys', '{}'::jsonb, 'cover', '{}'::jsonb,
        'stamina', greatest(0, v_s0 - c_sw * v_t), 'death_xp', '[]'::jsonb, 'unit_id', null, 'tick_ms', v_t),
      'analyzer', null));
    execute $f$
      create or replace function pg_temp.ohno_window(p_inst uuid, p_from bigint, p_settle jsonb, p_members jsonb, p_self text) returns jsonb
      language plpgsql as $b$
      declare v jsonb;
      begin
        perform set_config('hr.frame_self', p_self, true);
        execute 'set local role hr_engine';
        v := public.hr_hunt_apply_instance(p_inst, p_from, p_settle, p_members, null, null);
        execute 'reset role';
        perform set_config('hr.frame_self', '', true);
        return v;
      end $b$ $f$;

    -- (a) THE HERO'S OWN ASK: one nudge, no frame
    begin
      v_r := pg_temp.ohno_window(v_i.id, v_i.world_swing, jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + c_sw, 'world', null),
                                 v_m, c_u::text || ':0');
      if coalesce(v_r->>'ok', '') <> 'true' or not exists (select 1 from public.hunt_sessions where id = v_s.id and ended_at is not null and end_reason = 'left') then
        raise exception 'own-hunt-nudge-once §2(a)-harness: the window did not land the Leave: %', left(v_r::text, 300); end if;
      select count(*) filter (where payload->>'t' = 'state'), count(*) filter (where payload - 'id' = '{"t":"nudge"}'::jsonb)
        into v_nf, v_nn from realtime.messages where topic = v_tp;
      if v_nf <> 0 or v_nn <> 1 then
        raise exception 'own-hunt-nudge-once §2(a): the hero''s own settle ended its hunt with % frame(s) and % nudge(s), want 0 and 1 (its other clients hear it once)', v_nf, v_nn; end if;
      raise exception 'ohno-a' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;

    -- (b) THE WORLD TICK: one state frame, no nudge
    begin
      v_r := pg_temp.ohno_window(v_i.id, v_i.world_swing, jsonb_build_object('to', v_to, 'world_swing', v_i.world_swing + c_sw, 'world', null),
                                 v_m, '');
      if coalesce(v_r->>'ok', '') <> 'true' or not exists (select 1 from public.hunt_sessions where id = v_s.id and ended_at is not null) then
        raise exception 'own-hunt-nudge-once §2(b)-harness: the window did not land the Leave: %', left(v_r::text, 300); end if;
      select count(*) filter (where payload->>'t' = 'state'), count(*) filter (where payload - 'id' = '{"t":"nudge"}'::jsonb)
        into v_nf, v_nn from realtime.messages where topic = v_tp;
      if v_nf <> 1 or v_nn <> 0 then
        raise exception 'own-hunt-nudge-once §2(b): the tick''s settle ended the hunt with % frame(s) and % nudge(s), want 1 and 0 (one push an end)', v_nf, v_nn; end if;
      raise exception 'ohno-b' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;

    -- (c) OUTSIDE A SETTLE: one nudge
    begin
      perform public.hr_hunt_close(v_s.id, 'left', now(), true);
      select count(*) filter (where payload->>'t' = 'state'), count(*) filter (where payload - 'id' = '{"t":"nudge"}'::jsonb)
        into v_nf, v_nn from realtime.messages where topic = v_tp;
      if v_nf <> 0 or v_nn <> 1 then
        raise exception 'own-hunt-nudge-once §2(c): an end outside a settle sent % frame(s) and % nudge(s), want 0 and 1', v_nf, v_nn; end if;
      raise exception 'ohno-c' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null;
    end;

    -- (d) INSIDE A SETTLE, A HERO OPEN IN NO CLIENT: nothing
    update public.character_presence set seen_at = now() - interval '2 minutes' where user_id = c_u and slot = 0;
    perform set_config('hr.frame_defer', 'instance', true);
    perform public.hr_hunt_close(v_s.id, 'left', now(), true);
    perform set_config('hr.frame_defer', '', true);
    if exists (select 1 from realtime.messages where topic = v_tp) then
      raise exception 'own-hunt-nudge-once §2(d): a hero open in no client heard its end'; end if;
    raise exception 'own-hunt-nudge-once §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'own-hunt-nudge-once §2: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('hr.frame_defer', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.hunt_sessions where user_id = c_u) then
    raise exception 'own-hunt-nudge-once §2: LEAKED a probe row'; end if;

  -- (e) THE SHAPE: the guard once, before the one nudge; both hunt triggers still call this function; no client executes it.
  v_def := replace(pg_get_functiondef('public.hr_hunt_nudge_trg()'::regprocedure), chr(13), '');
  if strpos(v_def, 'if coalesce(current_setting(''hr.frame_defer'', true), '''') <> '''' and public.hr_frame_wanted(new.user_id, new.slot) then') = 0
     or strpos(v_def, 'and public.hr_frame_wanted(new.user_id, new.slot) then') > strpos(v_def, 'perform public.hr_hero_nudge(new.user_id, new.slot);')
     or (length(v_def) - length(replace(v_def, 'public.hr_hero_nudge(', ''))) / length('public.hr_hero_nudge(') <> 1 then
    raise exception 'own-hunt-nudge-once §2(e): hr_hunt_nudge_trg does not hold the settle guard once, before its one nudge'; end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.hunt_sessions'::regclass and not t.tgisinternal
        and t.tgfoid = 'public.hr_hunt_nudge_trg()'::regprocedure and t.tgname in ('hr_hunt_nudge_open', 'hr_hunt_nudge_close')) <> 2 then
    raise exception 'own-hunt-nudge-once §2(e): the two hunt_sessions nudge triggers are not both installed'; end if;
  if has_function_privilege('anon', 'public.hr_hunt_nudge_trg()', 'execute') or has_function_privilege('authenticated', 'public.hr_hunt_nudge_trg()', 'execute')
     or has_function_privilege('service_role', 'public.hr_hunt_nudge_trg()', 'execute') then
    raise exception 'own-hunt-nudge-once §2(e): hr_hunt_nudge_trg is reachable by a client'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'own-hunt-nudge-once: an end inside a settle reaches each open hero once (the frame, or a nudge where the frame spares the asker), outside it a nudge, never a hero open in no client; all green';
end $$;
