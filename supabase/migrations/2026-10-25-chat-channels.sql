-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-25-chat-channels.sql — THE CHAT WINDOW'S CHANNELS: GLOBAL, LOCAL,
--   PARTY AND SYSTEM, WRITTEN ONLY BY THE SERVER.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/chat (Tyler's playtest 10-18: "the
-- chat makes zero sense"). The game is CLOSED: this applies on its passing §6
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC); Security reviews it with every closed-mode surface at the
-- reopen gate. ORDER: after 2026-10-24-hunterall-119.sql, BEFORE
-- 2026-10-25-social.sql (which reads the helpers this file makes). No edge
-- deploy.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
-- §1 chat_messages gains the sender's server facts — from_slot, from_level
--    (hr_bounty_combat_level), from_weapon (hr_hunt_weapon_of) and from_role
--    (the role PICK on the character's action set; the client derives the role
--    with roleForWeapon(weapon, pick), the one source) — and `audience`, the
--    user ids a party line is for (null on a public line).
-- §2 THE ONE WRITER. The direct RLS insert ("signed-in users send as
--    themselves") is dropped and authenticated loses INSERT: every line now
--    goes through hr_chat_send, which takes the channel KIND and the body and
--    nothing else. The name (hr_chat_name_authority trigger), level, weapon,
--    role, the concrete channel (local zone, party id) and the audience are all
--    the server's. A client cannot name a sender, a level or a zone.
-- §3 READS. Public: global, trade, system and every local:<zone> (a zone is
--    public speech; the client subscribes to its own). Party: only a user in
--    the line's audience. RESTRICTIVE hr_chat_hide_blocked: a line whose sender
--    the reader blocked (chat_blocks) is never returned, by PostgREST or by
--    Realtime (which evaluates the same RLS per subscriber).
-- §4 hr_chat_send(p_slot, p_kind, p_body) — kinds global | local | party.
--    Body: control characters become spaces, whitespace collapses, 1..240
--    characters. ITEM LINKS: `[[item:<id>]]` markers, at most 3 per line, each
--    id must be a row of hr_items or the line is refused `bad_link` (the client
--    sends only the id; name, rarity and stats render from the catalogue).
--    Rate: 5 lines per 10 s and 20 per minute (hr_rate_ok, server clock).
--    Closed mode: hr_access_check first (a definer body bypasses RLS, so the
--    restrictive hr_closed_admit policy cannot be relied on here).
-- §5 hr_chat_recent(p_slot) — the window's history on open: the last 50
--    global, 50 local (this character's zone), 50 party and 20 system lines,
--    oldest first, blocked senders removed, plus the zone and party channel the
--    client subscribes to. 30 reads a minute.
-- §6 self-check, EXECUTED, every probe rolled back.
--
-- ── THE REALTIME CONTRACT ──────────────────────────────────────────────────
-- Publication supabase_realtime keeps chat_messages (already published).
-- The client (src/social/realtime.js) binds INSERT with one filter per channel
-- it shows: channel=eq.global, eq.system, eq.<zone>, eq.<party>. The row shape
-- the RPCs answer is the row shape Realtime pushes (hr_chat_row), so the client
-- has one parser.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- +2 client functions (definer, rate-gated, closed-mode gated). −1 client write
-- path (the direct insert). Reads narrow (blocked senders hidden). No value
-- moves; nothing here touches gold, items, XP or a ranking.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- A send is two UNLOGGED counter upserts, four point reads and one insert. The
-- party audience is ≤ 5 uuids. History reads use chat_messages_channel_idx.
-- Retention stays the nightly trim-chat-messages job (60 days): scheduled by
-- 2026-08-11-chat-name-authority.sql (cron '15 3 * * *'), kept by the
-- closed-rebuild wipe (chat_messages is wiped, its job is not), and pinned in
-- tests/restore-census.baseline.json "cron". Whispers are a separate table on
-- purpose (2026-10-25-social.sql header) with their own 30-day job.
--
-- REVERSIBILITY: drop the two functions and the hr_chat_* helpers; re-create
-- the insert policy from supabase/schema.sql and `grant insert on
-- public.chat_messages to authenticated`. The new columns are nullable.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.chat_messages') is null or to_regclass('public.chat_blocks') is null
     or to_regclass('public.hr_items') is null or to_regclass('public.hunt_party_members') is null then
    raise exception 'chat-channels §0: chat_messages / chat_blocks / hr_items / hunt_party_members absent';
  end if;
  if to_regprocedure('public.hr_access_check()') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null
     or to_regprocedure('public.hr_bounty_combat_level(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_weapon_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_party_of(uuid,integer)') is null then
    raise exception 'chat-channels §0: a helper this file calls is absent (closed mode, rate gate, hunt party)';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.chat_messages'::regclass
                  and tgname = 'hr_chat_name_authority' and not tgisinternal) then
    raise exception 'chat-channels §0: hr_chat_name_authority is not on chat_messages — the name would be the client''s';
  end if;
end $mig$;

-- ── §1 THE SENDER'S SERVER FACTS ─────────────────────────────────────────────
alter table public.chat_messages
  add column if not exists from_slot   smallint check (from_slot between 0 and 32),
  add column if not exists from_level  int      check (from_level between 0 and 10000),
  add column if not exists from_weapon text     check (from_weapon ~ '^[a-z0-9_]{1,32}$'),
  add column if not exists from_role   text     check (from_role ~ '^[a-z_]{1,32}$'),
  add column if not exists audience    uuid[]   check (audience is null or cardinality(audience) between 1 and 8);
comment on column public.chat_messages.audience is
  '2026-10-25-chat-channels.sql: the user ids a party line is for, stamped by hr_chat_send at send time; null on a public line.';

-- ── §2 THE ONE WRITER ────────────────────────────────────────────────────────
drop policy if exists "signed-in users send as themselves" on public.chat_messages;
revoke insert on public.chat_messages from authenticated, anon;

-- ── §3 READS ─────────────────────────────────────────────────────────────────
drop policy if exists "public channels readable" on public.chat_messages;
create policy "public channels readable" on public.chat_messages
  for select using (channel in ('global', 'trade', 'system') or channel like 'local:%');
drop policy if exists "party channel readable by its audience" on public.chat_messages;
create policy "party channel readable by its audience" on public.chat_messages
  for select to authenticated using (channel like 'party:%' and (select auth.uid()) = any (audience));
drop policy if exists hr_chat_hide_blocked on public.chat_messages;
create policy hr_chat_hide_blocked on public.chat_messages as restrictive
  for select to authenticated using (not exists (
    select 1 from public.chat_blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = chat_messages.from_id));

-- ── §4 THE HELPERS (internal: no client grant) ───────────────────────────────
-- A body as the server stores it: control characters to spaces, runs of
-- whitespace to one, trimmed.
create or replace function public.hr_chat_clean(p_body text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[\x00-\x1f\x7f]', ' ', 'g'), '\s+', ' ', 'g'))
$$;
-- What is wrong with a cleaned body, or null: empty, too_long, too_many_links, bad_link.
create or replace function public.hr_chat_body_fault(p_body text)
returns text language plpgsql stable set search_path = public, pg_catalog as $$
declare c_max_len constant int := 240; c_max_links constant int := 3; v_ids text[];
begin
  if p_body is null or p_body = '' then return 'empty'; end if;
  if length(p_body) > c_max_len then return 'too_long'; end if;
  select coalesce(array_agg(m[1]), '{}') into v_ids from regexp_matches(p_body, '\[\[item:([a-z0-9_]{1,64})\]\]', 'g') m;
  if cardinality(v_ids) > c_max_links then return 'too_many_links'; end if;
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.hr_items h where h.item_id = i)) then
    return 'bad_link'; end if;
  -- A half-made or malformed marker is refused too, so a client can never
  -- render text that looks like a link the server did not check.
  if regexp_replace(p_body, '\[\[item:[a-z0-9_]{1,64}\]\]', '', 'g') ~ '\[\[item:' then return 'bad_link'; end if;
  return null;
end $$;
-- The local channel of a character: its open hunt's ground, else the town.
create or replace function public.hr_chat_zone_of(p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  select 'local:' || coalesce((select h.hunt_id from public.hunt_sessions h
                                where h.user_id = p_user and h.slot = p_slot and h.ended_at is null
                                order by h.entered_at desc limit 1), 'town')
$$;
-- The role pick on the action set the character fights with (its open session's preset, else 0).
create or replace function public.hr_chat_role_pick(p_user uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $$
  select a.options->>'role' from public.player_action_sets a
   where a.user_id = p_user and a.slot = p_slot
     and a.preset = coalesce((select h.preset from public.hunt_sessions h
                               where h.user_id = p_user and h.slot = p_slot and h.ended_at is null limit 1), 0)
     and coalesce(a.options->>'role', '') ~ '^[a-z_]{1,32}$'
$$;
-- THE ROW SHAPE (one contract: the RPC answers and the Realtime INSERT payload carry these keys).
create or replace function public.hr_chat_row(m public.chat_messages)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', m.id, 'channel', m.channel, 'from_id', m.from_id, 'from_name', m.from_name,
    'from_slot', m.from_slot, 'from_level', m.from_level, 'from_weapon', m.from_weapon, 'from_role', m.from_role,
    'body', m.body, 'created_at', m.created_at)
$$;
do $mig$
declare f text;
begin
  foreach f in array array['public.hr_chat_clean(text)', 'public.hr_chat_body_fault(text)',
                           'public.hr_chat_zone_of(uuid,integer)', 'public.hr_chat_role_pick(uuid,integer)',
                           'public.hr_chat_row(public.chat_messages)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $mig$;

-- ── §4b hr_chat_send ─────────────────────────────────────────────────────────
create or replace function public.hr_chat_send(p_slot int, p_kind text, p_body text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_body text; v_fault text; v_channel text; v_pid uuid; v_aud uuid[];
  v_row public.chat_messages%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_kind is null or p_kind not in ('global', 'local', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_kind = 'global' then
    v_channel := 'global';
  elsif p_kind = 'local' then
    v_channel := public.hr_chat_zone_of(v_uid, p_slot);
  else
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
    v_channel := 'party:' || v_pid::text;
    select array_agg(distinct m.user_id) into v_aud from public.hunt_party_members m where m.party_id = v_pid;
  end if;
  -- from_id and from_name are overwritten by hr_chat_name_authority from the session and profiles.
  insert into public.chat_messages (channel, from_id, from_name, body, from_slot, from_level, from_weapon, from_role, audience)
  values (v_channel, v_uid, 'Adventurer', v_body, p_slot,
          public.hr_bounty_combat_level(v_uid, p_slot), public.hr_hunt_weapon_of(v_uid, p_slot),
          public.hr_chat_role_pick(v_uid, p_slot), v_aud)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_chat_row(v_row));
end $$;

-- ── §5 hr_chat_recent ────────────────────────────────────────────────────────
create or replace function public.hr_chat_recent(p_slot int)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_uid uuid := auth.uid(); v_zone text; v_pid uuid; v_party text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:read', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_zone := public.hr_chat_zone_of(v_uid, p_slot);
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  v_party := case when v_pid is null then null else 'party:' || v_pid::text end;
  return jsonb_build_object('ok', true, 'zone', v_zone, 'party', v_party, 'lines', coalesce((
    select jsonb_agg(public.hr_chat_row(x) order by x.created_at, x.id) from (
      (select * from public.chat_messages m where m.channel = 'global' order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = v_zone order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where v_party is not null and m.channel = v_party
                   and v_uid = any (m.audience) order by m.created_at desc limit 50)
      union all (select * from public.chat_messages m where m.channel = 'system' order by m.created_at desc limit 20)
    ) x
    where not exists (select 1 from public.chat_blocks b where b.blocker_id = v_uid and b.blocked_id = x.from_id)), '[]'::jsonb));
end $$;

-- ── §5b GRANTS AND THE BASELINE ──────────────────────────────────────────────
revoke execute on function public.hr_chat_send(int, text, text) from public, anon, service_role;
grant execute on function public.hr_chat_send(int, text, text) to authenticated;
revoke execute on function public.hr_chat_recent(int) from public, anon, service_role;
grant execute on function public.hr_chat_recent(int) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_chat_send', 'hr_chat_recent');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_chat_send', 'p_slot integer, p_kind text, p_body text', 'authenticated',
   'added 2026-10-25 (chat-channels): post a line to global / local / party; name, level, weapon, role, zone and audience are the server''s; 5/10 s, 20/min; item links checked against hr_items'),
  ('hr_chat_recent', 'p_slot integer', 'authenticated',
   'added 2026-10-25 (chat-channels): the chat window''s history and the channels to subscribe to; blocked senders removed; 30/min');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-00000c4a7001';   -- allowlisted sender
  v_b constant uuid := '000000c0-0000-0000-0000-00000c4a7002';   -- allowlisted reader, party mate
  v_c constant uuid := '000000c0-0000-0000-0000-00000c4a7003';   -- allowlisted, not in the party
  v_x constant uuid := '000000c0-0000-0000-0000-00000c4a7004';   -- NOT allowlisted
  v_item text := (select item_id from public.hr_items where item_id ~ '^[a-z0-9_]{1,64}$' order by item_id limit 1);
  v jsonb; v_n int; v_err text; v_pid uuid := '000000c0-0000-4000-a000-00000c4a7101'; v_i int; v_u uuid;
begin
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'chat-channels §6')
      on conflict (key) do update set enabled = true;
    foreach v_u in array array[v_a, v_b, v_c, v_x] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Probe' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      if v_u <> v_x then
        insert into public.hr_access_allowlist (user_id, note) values (v_u, 'chat-channels §6 probe') on conflict (user_id) do nothing;
        perform set_config('request.jwt.claim.sub', v_u::text, true);
        v := public.hr_create_character(0);
        if coalesce(v->>'ok', '') <> 'true' then raise exception 'chat-channels §6(a): hr_create_character refused: %', v; end if;
      end if;
    end loop;

    -- (a) the server stamps the sender: name from profiles, level, weapon, slot; zone town.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_chat_send(0, 'global', E'  hello\tthere  ');
    if coalesce(v->>'ok', '') <> 'true' or v->'line'->>'from_name' <> 'Probe1' or v->'line'->>'body' <> 'hello there'
       or (v->'line'->>'from_level')::int is distinct from public.hr_bounty_combat_level(v_a, 0)
       or v->'line'->>'from_weapon' is distinct from public.hr_hunt_weapon_of(v_a, 0)
       or (v->'line'->>'from_slot')::int is distinct from 0 or (v->'line'->>'from_id')::uuid is distinct from v_a
       or v->'line'->>'channel' <> 'global' then
      raise exception 'chat-channels §6(a): a global line is %', v; end if;
    if exists (select 1 from pg_proc p, unnest(p.proargnames) a where p.oid = 'public.hr_chat_send(integer,text,text)'::regprocedure
                and a ~ 'name|level|role|weapon|zone|channel_id|audience') then
      raise exception 'chat-channels §6(a): hr_chat_send takes a sender fact from the client'; end if;
    v := public.hr_chat_send(0, 'local', 'in town');
    if v->'line'->>'channel' is distinct from 'local:town' then raise exception 'chat-channels §6(a): local is %', v; end if;

    -- (b) the body rules and the item links.
    if public.hr_chat_send(0, 'global', '   ')->>'error' is distinct from 'empty'
       or public.hr_chat_send(0, 'global', repeat('a', 241))->>'error' is distinct from 'too_long'
       or public.hr_chat_send(0, 'shout', 'hi')->>'error' is distinct from 'bad_channel'
       or public.hr_chat_send(0, 'party', 'hi')->>'error' is distinct from 'not_in_party'
       or public.hr_chat_send(0, 'global', 'look [[item:no_such_item_zz]]')->>'error' is distinct from 'bad_link'
       or public.hr_chat_send(0, 'global', 'look [[item:Bad]]')->>'error' is distinct from 'bad_link' then
      raise exception 'chat-channels §6(b): a bad body was not refused as itself'; end if;
    if v_item is not null then
      if public.hr_chat_body_fault(repeat('[[item:' || v_item || ']] ', 4)) is distinct from 'too_many_links' then
        raise exception 'chat-channels §6(b): four links were not refused'; end if;
      delete from public.hr_rate_counters where user_id = v_a;
      v := public.hr_chat_send(0, 'global', 'see [[item:' || v_item || ']]');
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'chat-channels §6(b): a valid link was refused: %', v; end if;
    end if;

    -- (c) the rate limit: five in ten seconds, the sixth refused.
    delete from public.hr_rate_counters where user_id = v_a;
    for v_i in 1 .. 5 loop
      if coalesce(public.hr_chat_send(0, 'global', 'line ' || v_i)->>'ok', '') <> 'true' then
        raise exception 'chat-channels §6(c): line % of 5 was refused', v_i; end if;
    end loop;
    if public.hr_chat_send(0, 'global', 'line 6')->>'error' is distinct from 'rate_limited' then
      raise exception 'chat-channels §6(c): the sixth line in ten seconds was not rate_limited'; end if;
    delete from public.hr_rate_counters where user_id = v_a;

    -- (d) party: the audience is the party; only it reads the line.
    insert into public.hunt_parties (id, hunt_id, leader_user, leader_slot, max_size) values (v_pid, 'chatprobe', v_a, 0, 4);
    insert into public.hunt_party_members (party_id, user_id, slot, seat, weapon_type) values
      (v_pid, v_a, 0, 0, 'neutral'), (v_pid, v_b, 0, 1, 'neutral');
    v := public.hr_chat_send(0, 'party', 'party only');
    if v->'line'->>'channel' is distinct from 'party:' || v_pid::text then raise exception 'chat-channels §6(d): party is %', v; end if;
    foreach v_u in array array[v_b, v_c] loop
      perform set_config('request.jwt.claim.sub', v_u::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.chat_messages where channel = 'party:' || v_pid::text;
      reset role;
      if v_n <> (case when v_u = v_b then 1 else 0 end) then
        raise exception 'chat-channels §6(d): % read % party line(s)', v_u, v_n; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_chat_recent(0);
    if v->>'party' is distinct from 'party:' || v_pid::text or v->>'zone' <> 'local:town'
       or not exists (select 1 from jsonb_array_elements(v->'lines') l where l->>'body' = 'party only') then
      raise exception 'chat-channels §6(d): the party mate''s history is %', v; end if;

    -- (e) a block hides the sender from the reader, through RLS and the history.
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_b, v_a);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.chat_messages where from_id = v_a;
    reset role;
    if v_n <> 0 then raise exception 'chat-channels §6(e): a blocked sender''s % line(s) are readable', v_n; end if;
    if exists (select 1 from jsonb_array_elements(public.hr_chat_recent(0)->'lines') l where (l->>'from_id')::uuid = v_a) then
      raise exception 'chat-channels §6(e): the history shows a blocked sender'; end if;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.chat_messages where from_id = v_a and channel = 'global';
    reset role;
    if v_n = 0 then raise exception 'chat-channels §6(e) CONTROL: an unblocking reader sees no global line'; end if;

    -- (f) the direct insert is gone: a client cannot write a line (or a forged name) itself.
    v_err := null;
    begin
      set local role authenticated;
      insert into public.chat_messages (channel, from_id, from_name, body) values ('global', v_c, 'Tyler', 'forged');
    exception when insufficient_privilege then v_err := 'refused';
    end;
    reset role;
    if v_err is null then raise exception 'chat-channels §6(f): an authenticated client inserted a chat line directly'; end if;

    -- (g) closed mode: a non-allowlisted caller is refused hr_closed before anything.
    perform set_config('request.jwt.claim.sub', v_x::text, true);
    v_err := null;
    begin
      perform public.hr_chat_send(0, 'global', 'let me in');
    exception when sqlstate 'PGRST' then v_err := sqlerrm;
    end;
    if v_err is null or position('hr_closed' in v_err) = 0 then
      raise exception 'chat-channels §6(g): a non-allowlisted caller reached hr_chat_send'; end if;
    raise exception using errcode = 'HR870', message = 'chat-channels §6 complete - rolling back';
  exception when sqlstate 'HR870' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  -- (h) nothing leaked; the grants and the publication are exact.
  if exists (select 1 from public.chat_messages where from_id in (v_a, v_b, v_c, v_x))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.hunt_parties where id = v_pid) then
    raise exception 'chat-channels §6(h): a probe row leaked'; end if;
  if has_table_privilege('authenticated', 'public.chat_messages', 'insert')
     or has_table_privilege('anon', 'public.chat_messages', 'insert')
     or has_function_privilege('anon', 'public.hr_chat_send(integer,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_chat_send(integer,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_chat_recent(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_chat_body_fault(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_chat_zone_of(uuid,integer)', 'execute') then
    raise exception 'chat-channels §6(h): the chat grants are not exact'; end if;
  if exists (select 1 from pg_namespace where nspname = 'pg_catalog')
     and exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = 'chat_messages') then
    raise exception 'chat-channels §6(h): chat_messages is not published — no peer line would arrive'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'chat-channels: one server writer, sender facts and zone from the server, party by audience, blocks hidden, links checked, 5/10 s; all green';
end $mig$;
