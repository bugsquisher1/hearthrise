-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-31-watched-settle-cost.sql — A WATCHED HUNT'S SETTLE COSTS LESS (lane/c-watched-settle-cost, reliability-engineer,
--   2026-11-10; Tyler 2026-11-10 on finding 1 of .claude/coordination/hunt-path-baseline-2026-11-10.md: the 16 s confirm
--   cadence stays, so the job is a cheaper watched settle, not a rarer one).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (one file, never inside begin/commit). Pre-EA: applies on its passing
-- §6. ON THE EA SECURITY LIST (hr_hunt_apply_instance's commit point; no value path is edited). DB-ONLY: no hr-accrue
-- change (pack-edge --hash unmoved), no client change. ORDER-FREE against every 2027-03-27 / -28 / -29 / -30 file: it reads
-- none of them, pins no body md5, and each edit is an anchor matched exactly once on the lines it changes.
--
-- ── WHAT THE COST IS (production 2026-11-10 11:45 UTC, SELECT only; pg_stat_statements since 10-31) ─────────────
-- A watched hunt commits a real 18 s window at each ask (26,725 in 7 days; 45 carried no value). The commit itself is not
-- the cost: hr_hunt_apply_instance is 192 ms a call because it REBUILDS THE WHOLE CHARACTER (hr_state_of, 42 ms, 75 KB)
-- once for the asker and once more for every other member open in a client. In the last hour one account's party of four
-- made 180 commits and 540 frames (41 MB), every one to its own three heroes that are not on screen.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- 1. hr_perks_of NO LONGER SCORES RENOWN. It called hr_renown_of on every read (the seed and every member, each ask) to
--    price renownAllXp, a field the engine stopped reading on 2026-10-14 (src/core/perks.js normalisePerkState;
--    tests/perk-channel.mjs pins it by hash). The key stays as a named zero. Four anchored edits.
-- 2. A DIAL, SHIPPED AT TODAY'S VALUE: hr_tick_config.frame_own_s (0 = off). When it is N > 0, the commit point holds the
--    frame to a hero of THE ASKER'S OWN ACCOUNT that is not the asker (not on screen in the asking client) unless the
--    window crossed a multiple of N seconds on the server clock, or the settle carried that hero's news: its hunt ended
--    (a death, stamina, supplies, gold, a leave), its Level rose, a rare drop fell, a supply ran dry or its stamina ran
--    low (the hunt events the strip's alerts are made of). So such a hero gets one frame
--    every N seconds instead of one a commit, and its news at once. Other accounts' members, the tick and every other
--    frame sender are untouched. hr_hunt_apply_instance takes ONE inserted line; the rule is
--    hr_frame_own_held. N is capped at 40: the client re-reads an unviewed hero 60 s after its last frame
--    (src/session/config.js unviewedPollMs), and a held frame must always arrive first (N + one 16 to 19 s window < 60).
--
-- ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────────
-- AT APPLY: nothing a player sees or earns. The dial is 0, so every frame goes exactly as before, and the perk answer
-- prices the same stack (the engine reads rooms and propertyTier only). No row a settle writes moves: gold, XP, drops,
-- stamina, supplies, deaths, the ledger and the hunt are untouched; the asker's answer is untouched at any dial value.
-- WITH THE DIAL ON (one UPDATE, the Coordinator's or Tyler's call, not this file's): the thin bars of the account's own
-- off-screen heroes on the character strip step every N seconds instead of every commit. Switching to one asks at once.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None added. hr_frame_own_held is owner-only (revoked from every role, the engine and the tick included) and reads only
-- its arguments, the dial, one hunt_sessions row by primary key and that session's own events. It can only WITHHOLD a copy of committed state from
-- the asker's own account; it cannot send, widen a topic or reach another account. No client value is read: the asker is
-- the settle's own p_project_user, the window is the instance row's clock. No grant, RPC, policy or table.
--
-- ── CONCURRENCY / IDEMPOTENCY / LOCKS ───────────────────────────────────────
-- The hold runs after the instance row and every member have landed, inside the frame block whose failure never fails a
-- settle; the helper swallows its own errors and answers "not held" (the frame goes, as today). It writes nothing and
-- takes no lock. ADD COLUMN with a constant default is metadata-only on PostgreSQL 17: a brief ACCESS EXCLUSIVE on the
-- one-row hr_tick_config, queued behind at most one settle. A second apply is byte-identical (the marker skips each splice).
--
-- ── COST AT 10x / 100x ──────────────────────────────────────────────────────
-- No table, no row, no index. Per commit: one PK read of hr_tick_config for each member of the asker's own account
-- (0 for a lone hero or a party of strangers). Saves: hr_renown_of on every hr_perks_of (88,527 calls at 2.38 ms since
-- 10-31, more than half of it renown on the local bench); with the dial on, one hr_state_of and one 75 KB realtime
-- message for each held frame (numbers: the lane's before/after table).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- The dial: `update public.hr_tick_config set frame_own_s = 0 where id;` (instant, nothing lost: a frame is a copy).
-- The bodies: reverse the anchors below (a[i] and r[i] swapped). The column and the helper may stay. No player row moves.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_tick_config') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_tick_config' and column_name = 'frame_push')
     or to_regprocedure('public.hr_frame_send(uuid,integer,jsonb)') is null then
    raise exception 'PRECONDITION: apply 2026-12-25-frame-push-revive.sql first (the frame sender and its switch)'; end if;
  if to_regprocedure('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)') is null
     or to_regprocedure('public.hr_perks_of(uuid,integer)') is null or to_regclass('public.hunt_sessions') is null then
    raise exception 'PRECONDITION: hr_hunt_apply_instance, hr_perks_of or hunt_sessions is missing'; end if;
end $mig$;

-- ── §1 THE DIAL (0 = off: every frame goes at every commit, as it always has) ────────────────────────────────────
alter table public.hr_tick_config add column if not exists frame_own_s int not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_frame_own_s_ck'
                    and conrelid = 'public.hr_tick_config'::regclass) then
    alter table public.hr_tick_config add constraint hr_tick_config_frame_own_s_ck check (frame_own_s between 0 and 40);
  end if;
end $mig$;
comment on column public.hr_tick_config.frame_own_s is
  'WATCHED-SETTLE-COST (2027-03-31-watched-settle-cost.sql): seconds between settle frames to a hero of the ASKER''S OWN account that is not the asker (off screen in the asking client). 0 = off, a frame every commit. Capped at 40: the client re-reads an unviewed hero 60 s after its last frame (src/session/config.js unviewedPollMs). A hunt''s end is never held; other accounts and the tick are never held.';

-- ── §2 THE RULE: IS THIS MEMBER'S FRAME HELD AT THIS COMMIT? ─────────────────
-- Every unknown reads "not held": the frame goes, as it always has. Never raises (its caller's handler would drop the
-- remaining members' frames).
create or replace function public.hr_frame_own_held(p_member jsonb, p_project_user uuid, p_project_slot integer,
  p_from timestamptz, p_to timestamptz)
returns boolean language plpgsql stable set search_path = public as $fn$
declare v_n int; v_user uuid; v_slot int; v_session uuid;
begin
  -- WATCHED-SETTLE-COST (2027-03-31-watched-settle-cost.sql). p_member is the settle's own member entry (user, slot, session).
  v_user := (p_member->>'user')::uuid; v_slot := (p_member->>'slot')::int; v_session := (p_member->>'session')::uuid;
  -- (1) ONLY THE ASKER'S OWN ACCOUNT, AND NEVER THE ASKER. No asker (the tick) or another account's member: never held.
  if v_user is null or v_slot is null or p_project_user is null or p_project_slot is null
     or v_user <> p_project_user or v_slot = p_project_slot then return false; end if;
  -- (2) THE DIAL. Off, missing or unreadable: never held.
  select c.frame_own_s into v_n from public.hr_tick_config c where c.id;
  if coalesce(v_n, 0) <= 0 then return false; end if;
  -- (3) THE WINDOW CROSSED A MARK (a multiple of the dial on the server clock): this commit carries the frame. Each mark
  --     falls in exactly one window, so a hunting hero gets one frame a mark however the asks are spaced.
  if p_from is null or p_to is null
     or floor(extract(epoch from p_from) / v_n) <> floor(extract(epoch from p_to) / v_n) then return false; end if;
  -- (4) ITS HUNT ENDED IN THIS SETTLE (a death, stamina, supplies, gold, a leave): that news is never held.
  if v_session is null or not exists (select 1 from public.hunt_sessions h
                                       where h.id = v_session and h.user_id = v_user and h.slot = v_slot and h.ended_at is null) then
    return false; end if;
  -- (5) THE SETTLE WROTE ITS NEWS: its Level rose, a rare drop fell, it died, a supply ran dry, its stamina ran low.
  --     Never held (the events this window wrote; a skill's level and a store cover are not news).
  if exists (select 1 from public.hunt_session_events e
              where e.session_id = v_session and e.at > p_from and e.at <= p_to
                and (e.type in ('rare_drop', 'death', 'ended', 'slot_dry', 'stamina_low') or (e.type = 'level_up' and e.data->>'skill' = 'level'))) then
    return false; end if;
  return true;
exception when others then
  return false;
end $fn$;
revoke execute on function public.hr_frame_own_held(jsonb, uuid, integer, timestamptz, timestamptz) from public;
revoke execute on function public.hr_frame_own_held(jsonb, uuid, integer, timestamptz, timestamptz) from anon, authenticated, service_role;
do $mig$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_frame_own_held(jsonb, uuid, integer, timestamptz, timestamptz) from hr_engine'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_frame_own_held(jsonb, uuid, integer, timestamptz, timestamptz) from hr_tick'; end if;
end $mig$;

-- ── §3 hr_hunt_apply_instance: ONE INSERTED LINE AT THE COMMIT POINT (the anchor is kept verbatim after it) ───────
do $mig$
declare
  c_sig constant text := 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
  v_def text; v_n int;
  a text := $a$      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,
        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);
$a$;
  r text := $a$      -- WATCHED-SETTLE-COST (2027-03-31-watched-settle-cost.sql): the frame to a hero of the asker's own account that is not
      -- on its screen waits for the next mark of hr_tick_config.frame_own_s (0 = never held); its news never waits.
      continue when public.hr_frame_own_held(v_m, p_project_user, p_project_slot, v_i.settled_to, v_to);
$a$;
begin
  a := replace(a, chr(13), ''); r := replace(r, chr(13), '');
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('WATCHED-SETTLE-COST' in v_def) > 0 then
    raise notice 'watched-settle-cost §3: hr_hunt_apply_instance already carries the hold - splice skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_n <> 1 then raise exception 'watched-settle-cost §3: the commit point''s frame call matched % times (need 1): the body moved', v_n; end if;
  -- CREATE OR REPLACE keeps the function's grants; §5 states them again.
  execute replace(v_def, a, r || a);
end $mig$;

-- ── §4 hr_perks_of: FOUR ANCHORED EDITS (a[i] is the pre-image, verbatim; r[i] replaces it) ──────────────────────
--   1  the two renown declarations go
--   2  the score and its four rank steps become a note
--   3  renownAllXp is a named zero
--   4  the honesty field says so
do $mig$
declare
  c_sig constant text := 'public.hr_perks_of(uuid,integer)';
  v_def text; v_n int; v_a text;
  a constant text[] := array[
$a$  v_renown bigint;
  v_renown_allxp float8;
$a$,
$a$  -- THE RENOWN CHANNEL — server-derived, never from the client.
  v_renown := public.hr_renown_of(p_user, p_slot);
  v_renown_allxp :=
      case when v_renown >= 900    then 0.01::float8 else 0::float8 end   -- squire
    + case when v_renown >= 4500   then 0.01::float8 else 0::float8 end   -- baron
    + case when v_renown >= 32000  then 0.01::float8 else 0::float8 end   -- duke
    + case when v_renown >= 120000 then 0.01::float8 else 0::float8 end;  -- highking
$a$,
$a$    'renownAllXp', v_renown_allxp,
$a$,
$a$      'renown',     'derived:hr_renown_of',
$a$];
  r constant text[] := array[
$a$$a$,
$a$  -- THE RENOWN CHANNEL IS RETIRED (WATCHED-SETTLE-COST, 2027-03-31-watched-settle-cost.sql). This read scored the hero's
  -- renown on every settle (the kill counters, the collection, every skill, the purse) to price renownAllXp, which the
  -- engine has not read since 2026-10-14 (src/core/perks.js normalisePerkState). The key stays below as a named zero.
$a$,
$a$    'renownAllXp', 0,
$a$,
$a$      'renown',     'retired:the_engine_reads_no_renown',
$a$];
begin
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('WATCHED-SETTLE-COST' in v_def) > 0 then
    raise notice 'watched-settle-cost §4: hr_perks_of already carries the edit - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_a := replace(a[i], chr(13), '');
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> 1 then raise exception 'watched-settle-cost §4: hr_perks_of anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, v_a, replace(r[i], chr(13), ''));
  end loop;
  execute v_def;
end $mig$;

-- ── §5 GRANTS (unchanged: the engine alone on the settle; the engine and no client on the perk read) ─────────────
revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;
revoke all on function public.hr_perks_of(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, integer) to hr_engine;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image at (a) by text, at (b) and (c) by the column and the rule not existing, at (d) by a probe hero
-- whose renown the old read priced at 0.01. The engine-level proof on both doors (the hunt viewed, the browser closed),
-- with the frames counted, is tests/watched-settle-cost.mjs.
--   (a) the landed bodies: the hold sits once, after the asker's projection and before the frame call; the perk read
--       names no renown score
--   (b) the dial: NOT NULL DEFAULT 0, refuses -1 and 41
--   (c) the rule, executed on a hunting probe hero: held only for the asker's own other hero, with the dial on, inside
--       one mark, while its hunt is open and the window wrote none of its news (its Level, a rare drop, a death, a dry
--       supply, low stamina)
--   (d) the perk read, executed: the same keys as before, renownAllXp 0 for a hero the old read gave 0.01
--   (e) grants: nobody reaches the rule; the settle and the perk read are the engine's alone
do $chk$
declare
  c_u    constant uuid := '000000d7-0000-4000-a000-0000c0570331';
  c_o    constant uuid := '000000d7-0000-4000-a000-0000c0570332';   -- another account (never created: only compared)
  c_inst constant text := 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
  c_perk constant text := 'public.hr_perks_of(uuid,integer)';
  c_held constant text := 'public.hr_frame_own_held(jsonb,uuid,integer,timestamp with time zone,timestamp with time zone)';
  c_t    constant timestamptz := timestamptz '2027-03-31 12:00:05+00';   -- 5 s past a 30 s mark
  v_def  text; v jsonb; v_me jsonb; v_hunt text; v_sess uuid; v_ev bigint; r text; i1 int; i2 int; i3 int;
begin
  -- (a)
  v_def := replace(pg_get_functiondef(c_inst::regprocedure), chr(13), '');
  i1 := position('v_proj := case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end;' in v_def);
  i2 := position('continue when public.hr_frame_own_held(v_m, p_project_user, p_project_slot, v_i.settled_to, v_to);' in v_def);
  i3 := position('perform public.hr_frame_send((v_m->>''user'')::uuid, (v_m->>''slot'')::int,' in v_def);
  if i1 = 0 or i2 = 0 or i3 = 0 or not (i1 < i2 and i2 < i3)
     or (length(v_def) - length(replace(v_def, 'hr_frame_own_held(', ''))) / length('hr_frame_own_held(') <> 1 then
    raise exception 'watched-settle-cost §6(a): the hold is not once between the asker''s projection and the frame call (% % %)', i1, i2, i3; end if;
  v_def := replace(pg_get_functiondef(c_perk::regprocedure), chr(13), '');
  if position('hr_renown_of' in regexp_replace(v_def, '--[^\n]*', '', 'g')) > 0 or position('v_renown' in v_def) > 0
     or position($q$'renownAllXp', 0,$q$ in v_def) = 0 then
    raise exception 'watched-settle-cost §6(a): hr_perks_of still scores renown'; end if;

  -- (b)
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
        and column_name = 'frame_own_s') is distinct from '0'
     or (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'hr_tick_config'
        and column_name = 'frame_own_s') <> 'NO' then
    raise exception 'watched-settle-cost §6(b): hr_tick_config.frame_own_s is not NOT NULL DEFAULT 0'; end if;
  begin
    begin
      update public.hr_tick_config set frame_own_s = -1 where id;
      raise exception 'watched-settle-cost §6(b): frame_own_s = -1 was accepted';
    exception when check_violation then null; end;
    begin
      update public.hr_tick_config set frame_own_s = 41 where id;
      raise exception 'watched-settle-cost §6(b): frame_own_s = 41 was accepted (a held frame could arrive after the client''s 60 s re-read)';
    exception when check_violation then null; end;

    -- (c) THE RULE, on a real open hunt. One probe account, one hero (slot 0) hunting; the asker is argued.
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Held') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'watched-settle-cost §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'watched-settle-cost §6-harness: hr_create_character(0) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, '000000d7-0000-4000-a000-0000c0570333'::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'watched-settle-cost §6-harness: entering % answered %', v_hunt, v; end if;
    select h.id into v_sess from public.hunt_sessions h where h.user_id = c_u and h.slot = 0 and h.ended_at is null;
    if v_sess is null then raise exception 'watched-settle-cost §6-harness: the probe hero does not hunt'; end if;

    v_me := jsonb_build_object('user', c_u, 'slot', 0, 'session', v_sess);
    -- The dial at 0 (the value this file ships): nothing is ever held.
    update public.hr_tick_config set frame_own_s = 0 where id;
    if public.hr_frame_own_held(v_me, c_u, 1, c_t, c_t + interval '18 seconds') then
      raise exception 'watched-settle-cost §6(c): a frame was held with the dial at 0'; end if;
    update public.hr_tick_config set frame_own_s = 30 where id;
    -- HELD: the asker's own other hero, an 18 s window inside one 30 s mark, its hunt open, no news.
    if not public.hr_frame_own_held(v_me, c_u, 1, c_t, c_t + interval '18 seconds') then
      raise exception 'watched-settle-cost §6(c): the asker''s own off-screen hero was not held inside a mark'; end if;
    -- NOT HELD: the window crossed a mark (12:00:23 to 12:00:41 crosses 12:00:30), and one that ends exactly on it.
    if public.hr_frame_own_held(v_me, c_u, 1, c_t + interval '18 seconds', c_t + interval '36 seconds')
       or public.hr_frame_own_held(v_me, c_u, 1, c_t + interval '7 seconds', c_t + interval '25 seconds') then
      raise exception 'watched-settle-cost §6(c): a frame was held across a mark'; end if;
    -- NOT HELD: the asker itself; another account's asker; no asker (the tick); a session that is not this hero's open
    -- hunt; unknown times; a member entry that names nobody.
    if public.hr_frame_own_held(v_me, c_u, 0, c_t, c_t + interval '18 seconds')
       or public.hr_frame_own_held(v_me, c_o, 1, c_t, c_t + interval '18 seconds')
       or public.hr_frame_own_held(v_me, null, null, c_t, c_t + interval '18 seconds')
       or public.hr_frame_own_held(v_me || jsonb_build_object('session', '000000d7-0000-4000-a000-0000c0570334'), c_u, 1, c_t, c_t + interval '18 seconds')
       or public.hr_frame_own_held(v_me, c_u, 1, null, c_t + interval '18 seconds')
       or public.hr_frame_own_held('{}'::jsonb, c_u, 1, c_t, c_t + interval '18 seconds') or public.hr_frame_own_held(null, c_u, 1, c_t, c_t + interval '18 seconds') then
      raise exception 'watched-settle-cost §6(c): a frame was held for the asker, a stranger, the tick, another session, an unknown window or nobody'; end if;
    -- NOT HELD: THE HERO'S NEWS. A skill's level is not news (held); its own Level, a rare drop and a death are.
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (v_sess, c_u, 0, 'level_up', c_t + interval '9 seconds', jsonb_build_object('skill', 'melee', 'level', 2)),
             (v_sess, c_u, 0, 'rare_drop', c_t - interval '9 seconds', '{}'::jsonb);   -- an earlier window's
    if not public.hr_frame_own_held(v_me, c_u, 1, c_t, c_t + interval '18 seconds') then
      raise exception 'watched-settle-cost §6(c): a skill level or an earlier window''s rare drop released the frame'; end if;
    foreach r in array array['level_up', 'rare_drop', 'death', 'slot_dry', 'stamina_low'] loop
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (v_sess, c_u, 0, r, c_t + interval '18 seconds', case when r = 'level_up' then jsonb_build_object('skill', 'level', 'level', 2) else '{}'::jsonb end)
        returning id into v_ev;
      if public.hr_frame_own_held(v_me, c_u, 1, c_t, c_t + interval '18 seconds') then
        raise exception 'watched-settle-cost §6(c): the frame was held in the window that wrote the hero''s % event', r; end if;
      delete from public.hunt_session_events where id = v_ev;
    end loop;
    -- NOT HELD: its hunt ended (the row is closed as a settle closes it).
    update public.hunt_sessions set ended_at = now(), end_reason = 'left' where id = v_sess;
    if public.hr_frame_own_held(v_me, c_u, 1, c_t, c_t + interval '18 seconds') then
      raise exception 'watched-settle-cost §6(c): the frame of a hunt that just ended was held'; end if;

    -- (d) THE PERK READ. 40,000 counted kills score 2,000 renown: the old read answered renownAllXp 0.01 here.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value) values (c_u, 0, 'stat', 'ev:kill_any', '', 40000)
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
    if public.hr_renown_of(c_u, 0) < 900 then
      raise exception 'watched-settle-cost §6-harness: the probe hero scores % renown (the old read would price nothing either)', public.hr_renown_of(c_u, 0); end if;
    v := public.hr_perks_of(c_u, 0);
    if coalesce(v->>'ok', '') <> 'true' or v->'renownAllXp' is distinct from '0'::jsonb
       or v->'sources'->>'renown' is distinct from 'retired:the_engine_reads_no_renown' then
      raise exception 'watched-settle-cost §6(d): the perk read answers %', v; end if;
    if (select array_agg(k order by k collate "C") from jsonb_object_keys(v) k) is distinct from
         array['castle', 'clanPerks', 'companion', 'ok', 'propertyTier', 'renownAllXp', 'rooms', 'sources', 'temper', 'unlockedRecipes']
       or (select array_agg(k order by k collate "C") from jsonb_object_keys(v->'sources') k) is distinct from
         array['castle', 'clan', 'companions', 'property', 'recipes', 'renown', 'rooms', 'temper'] then
      raise exception 'watched-settle-cost §6(d): the perk read''s keys moved: %', v; end if;
    raise exception using errcode = 'HRW31', message = 'watched-settle-cost §6 complete - rolling back';
  exception when sqlstate 'HRW31' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u)
     or exists (select 1 from public.hunt_sessions where user_id = c_u) or exists (select 1 from public.player_progress where user_id = c_u) then
    raise exception 'watched-settle-cost §6: LEAKED a probe row'; end if;

  -- (e)
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, c_held, 'execute') then
      raise exception 'watched-settle-cost §6(e): % can execute hr_frame_own_held', r; end if;
  end loop;
  foreach r in array array[c_inst, c_perk] loop
    if has_function_privilege('anon', r, 'execute') or has_function_privilege('authenticated', r, 'execute')
       or has_function_privilege('service_role', r, 'execute') or not has_function_privilege('hr_engine', r, 'execute') then
      raise exception 'watched-settle-cost §6(e): a grant moved on %', r; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'watched-settle-cost: hr_perks_of scores no renown; frame_own_s is % (0 = every frame at every commit); the hold is in place and holds only the asker''s own off-screen hero inside a mark; all green',
    (select frame_own_s from public.hr_tick_config where id);
end $chk$;
