-- ════════════════════════════════════════════════════════════════════════
-- 2026-11-24-rare-broadcast.sql — A RARE DROP IS TOLD TO EVERY PLAYER ONLINE,
--   BY THE SERVER, ONCE.
--
-- STATUS: STAGED, NOT APPLIED. Lane lane/b-rare-broadcast (systems-engineer,
-- 2026-10-22; Tyler's rule "super-rare drop moments": a real reveal, a
-- BROADCAST, a shareable card). The game is CLOSED: this applies on its passing
-- §4 (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC); Security reviews it with every closed-mode surface at the
-- reopen gate. ORDER: last in the chain (after 2026-11-08-hunt-sessions-
-- catalogue.generated.sql). No edge deploy: the settle already writes the
-- `rare_drop` event this reads.
--
-- ── WHAT ────────────────────────────────────────────────────────────────────
-- §1 hr_world_notice_rules — THE DATA ROW (src/data/chat-channels.js
--    WORLD_NOTICES; tests/chat-social.mjs RB-1 holds the two equal): which
--    channel a world notice goes to and how many one character may post per UTC
--    day. Server-only.
-- §1 hr_world_notices — THE JOURNAL, one row per rare_drop event the trigger
--    saw: posted (with the chat line's id), capped (the character's daily
--    notices were spent), quiet (the character set presence_quiet: a quiet
--    hero is never named to the world) or refused (the transaction carries a
--    signed-in caller who is not the finder, so hr_chat_name_authority would
--    stamp the wrong sender: never posted rather than misattributed; no settle
--    path runs with a JWT today — the edge and the world tick connect as the
--    database). UNIQUE (event_id) and UNIQUE (session_id, item_id, found_at):
--    an event is announced at most once, whatever writes it again. Server-only,
--    append-only (an UPDATE raises).
-- §2 hr_world_notice_rare — AFTER INSERT on hunt_session_events WHEN type =
--    'rare_drop'. The settle (hr_hunt_settle_session) writes that row only for
--    an item THIS fold looted (its ledger high-water mark), so a replayed or
--    refused settle writes no event and posts nothing. The line: channel from
--    the rule (System), from_id = the finder, from_slot = the hero (the name is
--    stamped by hr_chat_name_authority from character_names and re-read by
--    hr_chat_row, so a rename follows and a block hides it), body
--    `found [[item:<id>]] in [[hunt:<id>]].` — the item id is a row of
--    hr_items (a link the client renders from its catalogue in its rarity),
--    the hunt id the session's own. Every value is a server row; nothing a
--    client sent reaches it.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No client function, no client grant, no policy. A client cannot write the
-- System channel (no INSERT on chat_messages; hr_chat_send's kinds are global,
-- local and party), cannot write hunt_session_events (select only), and cannot
-- read or write either new table. No value moves; nothing here touches gold,
-- items, XP or a ranking. §4 executes each refusal.
--
-- ── COST (10x) ──────────────────────────────────────────────────────────────
-- A rare is ~1 per 10–20 h of hunting per hero (rulings of record): at 1,000
-- heroes hunting around the clock that is ~50–100 notices an hour, each one
-- journal insert, one indexed count and one chat insert inside the settle that
-- already wrote the event. The daily cap bounds a lucky streak. Realtime: the
-- System channel is already one of each client's five bindings. Retention:
-- chat lines leave with the nightly 60-day trim; the journal grows at the
-- rare-drop rate (tiny) and is wiped with the game at the EA launch.
--
-- REVERSIBILITY: drop trigger hr_world_notice_rare on hunt_session_events;
-- drop function hr_world_notice_rare(), hr_world_notices_immutable(); drop
-- tables hr_world_notices, hr_world_notice_rules. The posted lines stay (they
-- are ordinary System lines and age out with the trim).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.chat_messages') is null or to_regclass('public.hunt_session_events') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hr_items') is null then
    raise exception 'rare-broadcast §0: chat_messages / hunt_session_events / hunt_sessions / hr_items absent';
  end if;
  if to_regprocedure('public.hr_character_name(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)') is null
     or to_regprocedure('public.hr_chat_send(integer,text,text)') is null then
    raise exception 'rare-broadcast §0: hr_character_name / hr_hunt_settle_session / hr_chat_send absent';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'player_state' and column_name = 'presence_quiet') then
    raise exception 'rare-broadcast §0: player_state.presence_quiet absent (2026-09-13-town-presence.sql)';
  end if;
  -- The sender stamp this file relies on: a server insert with no signed-in caller keeps its from_id,
  -- and the name is the character's (2026-10-29-character-names-everywhere.sql).
  if strpos((select prosrc from pg_proc where oid = 'public.hr_chat_name_authority()'::regprocedure),
            'hr_character_name(new.from_id') = 0 then
    raise exception 'rare-broadcast §0: hr_chat_name_authority does not stamp the character''s name (apply 2026-10-29-character-names-everywhere.sql)';
  end if;
  -- The settle writes a rare_drop event only for an item its fold looted.
  if strpos((select prosrc from pg_proc where oid = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)'::regprocedure),
            '''rare_drop''') = 0 then
    raise exception 'rare-broadcast §0: hr_hunt_settle_session no longer writes rare_drop events';
  end if;
end $mig$;

-- ── §1 THE RULE AND THE JOURNAL ──────────────────────────────────────────────
create table if not exists public.hr_world_notice_rules (
  kind         text primary key check (kind in ('rare_drop')),
  channel      text not null check (channel in ('system', 'global')),
  per_char_day int  not null check (per_char_day between 0 and 50)
);
alter table public.hr_world_notice_rules enable row level security;
revoke all on public.hr_world_notice_rules from public, anon, authenticated, service_role;
-- src/data/chat-channels.js WORLD_NOTICES.rare_drop (tests/chat-social.mjs RB-1).
insert into public.hr_world_notice_rules (kind, channel, per_char_day) values ('rare_drop', 'system', 3)
  on conflict (kind) do update set channel = excluded.channel, per_char_day = excluded.per_char_day;

create table if not exists public.hr_world_notices (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('rare_drop')),
  event_id   bigint not null unique,
  session_id uuid not null,
  user_id    uuid not null,
  slot       int  not null check (slot between 0 and 32),
  item_id    text not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  hunt_id    text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  found_at   timestamptz not null,
  status     text not null check (status in ('posted', 'capped', 'quiet', 'refused')),
  message_id uuid,
  created_at timestamptz not null default now(),
  unique (session_id, item_id, found_at),
  check ((status = 'posted') = (message_id is not null))
);
create index if not exists hr_world_notices_char_day on public.hr_world_notices (user_id, slot, created_at) where status = 'posted';
alter table public.hr_world_notices enable row level security;
revoke all on public.hr_world_notices from public, anon, authenticated, service_role;

create or replace function public.hr_world_notices_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  raise exception 'hr_world_notices is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $$;
revoke execute on function public.hr_world_notices_immutable() from public, anon, authenticated, service_role;
drop trigger if exists hr_world_notices_immutable on public.hr_world_notices;
create trigger hr_world_notices_immutable before update on public.hr_world_notices
  for each row execute function public.hr_world_notices_immutable();

-- ── §2 THE ONE WRITER: the settle's rare_drop event ──────────────────────────
create or replace function public.hr_world_notice_rare()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_rule  public.hr_world_notice_rules%rowtype;
  v_item  text := new.data->>'item';
  v_hunt  text;
  v_quiet boolean;
  v_n     int;
  v_status text;
  v_msg   uuid;
  v_jid   bigint;
begin
  select * into v_rule from public.hr_world_notice_rules where kind = 'rare_drop';
  if not found then return null; end if;
  -- Only a catalogue item is announced (the line links it); only the event's own session names the place.
  if v_item is null or v_item !~ '^[a-z0-9_]{1,64}$'
     or not exists (select 1 from public.hr_items i where i.item_id = v_item) then return null; end if;
  select h.hunt_id into v_hunt from public.hunt_sessions h
   where h.id = new.session_id and h.user_id = new.user_id and h.slot = new.slot;
  if v_hunt is null then return null; end if;
  -- An event already announced (or journalled) is never announced again.
  if exists (select 1 from public.hr_world_notices w
              where w.event_id = new.id or (w.session_id = new.session_id and w.item_id = v_item and w.found_at = new.at)) then
    return null; end if;
  select coalesce(ps.presence_quiet, false) into v_quiet from public.player_state ps
   where ps.user_id = new.user_id and ps.slot = new.slot;
  select count(*) into v_n from public.hr_world_notices w
   where w.user_id = new.user_id and w.slot = new.slot and w.status = 'posted'
     and w.created_at >= date_trunc('day', now(), 'UTC');
  v_status := case when coalesce(v_quiet, false) then 'quiet'
                   when auth.uid() is not null and auth.uid() is distinct from new.user_id then 'refused'
                   when v_n >= v_rule.per_char_day then 'capped'
                   else 'posted' end;
  if v_status = 'posted' then v_msg := gen_random_uuid(); end if;
  insert into public.hr_world_notices (kind, event_id, session_id, user_id, slot, item_id, hunt_id, found_at, status, message_id)
  values ('rare_drop', new.id, new.session_id, new.user_id, new.slot, v_item, v_hunt, new.at, v_status, v_msg)
  on conflict do nothing
  returning id into v_jid;
  if v_jid is null or v_status <> 'posted' then return null; end if;
  -- from_name is stamped by hr_chat_name_authority (the character's name); the placeholder never shows.
  insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
  values (v_msg, v_rule.channel, new.user_id, 'Adventurer', new.slot,
          'found [[item:' || v_item || ']] in [[hunt:' || v_hunt || ']].');
  return null;
end $$;
revoke execute on function public.hr_world_notice_rare() from public, anon, authenticated, service_role;
drop trigger if exists hr_world_notice_rare on public.hunt_session_events;
create trigger hr_world_notice_rare after insert on public.hunt_session_events
  for each row when (new.type = 'rare_drop') execute function public.hr_world_notice_rare();

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_a constant uuid := '000000c0-0000-0000-0000-0000b40a0001';   -- the finder
  v_b constant uuid := '000000c0-0000-0000-0000-0000b40a0002';   -- a quiet finder
  v_c constant uuid := '000000c0-0000-0000-0000-0000b40a0003';   -- a signed-in stranger
  v_item text := coalesce((select item_id from public.hr_items where item_id = 'crown_shard'),
                          (select item_id from public.hr_items where item_id ~ '^[a-z0-9_]{1,64}$' order by item_id limit 1));
  v_hunt text := (select hunt_id from public.hr_hunt_travel where not training order by hunt_id limit 1);
  v_sid uuid; v_sid_b uuid; v_from timestamptz; v jsonb; v_n int; v_err text; v_cap int; v_i int; v_u uuid;
  v_lines int;
begin
  if v_item is null or v_hunt is null then raise exception 'rare-broadcast §4: no catalogue item or hunt to probe with'; end if;
  select per_char_day into v_cap from public.hr_world_notice_rules where kind = 'rare_drop';
  if v_cap is distinct from 3 then raise exception 'rare-broadcast §4: the rule row is %', v_cap; end if;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    foreach v_u in array array[v_a, v_b, v_c] loop
      insert into auth.users (id) values (v_u) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u, 'Rbprobe' || right(v_u::text, 1))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.player_state (user_id, slot) values (v_u, 0) on conflict do nothing;
    end loop;
    update public.player_state set presence_quiet = true where user_id = v_b and slot = 0;
    foreach v_u in array array[v_a, v_b] loop
      insert into public.hunt_sessions (user_id, slot, hunt_id, entered_at, hunt_from, settled_to, next_swing_at)
      values (v_u, 0, v_hunt, now() - interval '10 minutes', now() - interval '9 minutes',
              now() - interval '9 minutes', now() - interval '9 minutes');
    end loop;
    select id into v_sid from public.hunt_sessions where user_id = v_a and slot = 0 and ended_at is null;
    select id into v_sid_b from public.hunt_sessions where user_id = v_b and slot = 0 and ended_at is null;
    insert into public.hunt_session_tally (session_id, user_id, slot) values (v_sid, v_a, 0), (v_sid_b, v_b, 0)
      on conflict (session_id) do nothing;
    select settled_to into v_from from public.hunt_sessions where id = v_sid;
    select count(*) into v_lines from public.chat_messages;

    -- (a) A SETTLE WITH A RARE POSTS EXACTLY ONE LINE: the engine's stamped loot row, then the settle with its hint.
    perform set_config('hr.hunt_session', v_sid::text, true);
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_a, 0, 'accrue', 'tick', 0, jsonb_build_object('delta', jsonb_build_object('i', jsonb_build_object(v_item, 1)), 'kills', 1));
    perform set_config('hr.hunt_session', '', true);
    v := public.hr_hunt_settle_session(v_a, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 10,
           'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds',
           'hints', jsonb_build_object('rare_drop', jsonb_build_array(jsonb_build_object('item', v_item)))));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'rare-broadcast §4(a): the honest settle answered %', v; end if;
    if (select count(*) from public.hunt_session_events where session_id = v_sid and type = 'rare_drop') <> 1 then
      raise exception 'rare-broadcast §4(a) CANNOT RUN: the settle wrote no rare_drop event'; end if;
    select count(*) into v_n from public.chat_messages
     where channel = 'system' and from_id = v_a and body = 'found [[item:' || v_item || ']] in [[hunt:' || v_hunt || ']].';
    if v_n <> 1 or (select count(*) from public.chat_messages) <> v_lines + 1 then
      raise exception 'rare-broadcast §4(a): a settle with one rare posted % line(s)', v_n; end if;
    if (select from_name from public.chat_messages where from_id = v_a and channel = 'system') is distinct from left(public.hr_character_name(v_a, 0), 24)
       or (select from_slot from public.chat_messages where from_id = v_a and channel = 'system') is distinct from 0 then
      raise exception 'rare-broadcast §4(a): the line is not stamped with the finder''s character'; end if;
    if (select count(*) from public.hr_world_notices where user_id = v_a and status = 'posted'
          and message_id = (select id from public.chat_messages where from_id = v_a and channel = 'system')) <> 1 then
      raise exception 'rare-broadcast §4(a): the post is not journalled with its line'; end if;

    -- (b) A REPLAY POSTS NONE: the same settle again is refused (session_moved); the next settle, carrying the same
    --     hint with nothing new looted, writes no event and posts nothing.
    v_err := null;
    begin
      perform public.hr_hunt_settle_session(v_a, 0, v_sid, jsonb_build_object('swing_from', 0, 'swing_to', 10,
                'to', v_from + interval '60 seconds', 'next_swing_at', v_from + interval '61 seconds',
                'hints', jsonb_build_object('rare_drop', jsonb_build_array(jsonb_build_object('item', v_item)))));
    exception when sqlstate 'HR000' then v_err := sqlerrm;
    end;
    if v_err is null then raise exception 'rare-broadcast §4(b): a replayed settle was accepted'; end if;
    v := public.hr_hunt_settle_session(v_a, 0, v_sid, jsonb_build_object('swing_from', 10, 'swing_to', 20,
           'to', v_from + interval '120 seconds', 'next_swing_at', v_from + interval '121 seconds',
           'hints', jsonb_build_object('rare_drop', jsonb_build_array(jsonb_build_object('item', v_item)))));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'rare-broadcast §4(b): the next settle answered %', v; end if;
    if (select count(*) from public.chat_messages) <> v_lines + 1 then
      raise exception 'rare-broadcast §4(b): a replayed hint posted again'; end if;
    -- The same event written again (any writer) is announced once.
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      select session_id, user_id, slot, type, at, data from public.hunt_session_events
       where session_id = v_sid and type = 'rare_drop' limit 1;
    if (select count(*) from public.chat_messages) <> v_lines + 1 then
      raise exception 'rare-broadcast §4(b): a re-written event was announced twice'; end if;

    -- (c) THE DAILY CAP (the data row): the finder's 2nd and 3rd post, the 4th is journalled `capped`.
    for v_i in 1 .. v_cap loop
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (v_sid, v_a, 0, 'rare_drop', v_from + make_interval(secs => 200 + v_i), jsonb_build_object('item', v_item));
    end loop;
    if (select count(*) from public.chat_messages where from_id = v_a and channel = 'system') <> v_cap
       or (select count(*) from public.hr_world_notices where user_id = v_a and status = 'capped') <> 1 then
      raise exception 'rare-broadcast §4(c): % lines and % capped after % + 1 rares',
        (select count(*) from public.chat_messages where from_id = v_a and channel = 'system'),
        (select count(*) from public.hr_world_notices where user_id = v_a and status = 'capped'), v_cap; end if;

    -- (d) A QUIET HERO IS NEVER NAMED; A FOREIGN SIGNED-IN CALLER NEVER MISATTRIBUTES.
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (v_sid_b, v_b, 0, 'rare_drop', v_from + interval '30 seconds', jsonb_build_object('item', v_item));
    if exists (select 1 from public.chat_messages where from_id = v_b)
       or (select status from public.hr_world_notices where user_id = v_b) is distinct from 'quiet' then
      raise exception 'rare-broadcast §4(d): a quiet hero was announced'; end if;
    update public.player_state set presence_quiet = false where user_id = v_b and slot = 0;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (v_sid_b, v_b, 0, 'rare_drop', v_from + interval '40 seconds', jsonb_build_object('item', v_item));
    perform set_config('request.jwt.claim.sub', '', true);
    if exists (select 1 from public.chat_messages where from_id in (v_b, v_c))
       or (select count(*) from public.hr_world_notices where user_id = v_b and status = 'refused') <> 1 then
      raise exception 'rare-broadcast §4(d): a stranger''s transaction announced (or misattributed) a rare'; end if;
    -- An item the catalogue does not know is not announced.
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (v_sid_b, v_b, 0, 'rare_drop', v_from + interval '50 seconds', jsonb_build_object('item', 'no_such_item_zz'));
    if exists (select 1 from public.chat_messages where from_id = v_b) then
      raise exception 'rare-broadcast §4(d): an unknown item was announced'; end if;

    -- (e) A CLIENT CANNOT WRITE ONE: not the line, not the event, not the journal; not through hr_chat_send.
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    v_n := null;
    begin
      set local role authenticated;
      insert into public.chat_messages (channel, from_id, from_name, from_slot, body)
        values ('system', v_a, 'Rbprobe1', 0, 'found [[item:' || v_item || ']] in [[hunt:' || v_hunt || ']].');
      reset role;
      v_n := 1;
    exception when insufficient_privilege then
      reset role; v_n := -1;
    end;
    if v_n is distinct from -1 then raise exception 'rare-broadcast §4(e): an authenticated client wrote a System line'; end if;
    v_n := null;
    begin
      set local role authenticated;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (v_sid, v_a, 0, 'rare_drop', now(), jsonb_build_object('item', v_item));
      reset role;
      v_n := 1;
    exception when insufficient_privilege then
      reset role; v_n := -1;
    end;
    if v_n is distinct from -1 then raise exception 'rare-broadcast §4(e): an authenticated client wrote a rare_drop event'; end if;
    v_n := null;
    begin
      set local role authenticated;
      insert into public.hr_world_notices (kind, event_id, session_id, user_id, slot, item_id, hunt_id, found_at, status)
        values ('rare_drop', -1, v_sid, v_a, 0, v_item, v_hunt, now(), 'capped');
      reset role;
      v_n := 1;
    exception when insufficient_privilege then
      reset role; v_n := -1;
    end;
    if v_n is distinct from -1 then raise exception 'rare-broadcast §4(e): an authenticated client wrote a journal row'; end if;
    -- (closed mode refuses the stranger before the kind is read: either refusal is a refusal)
    v := null;
    begin
      v := public.hr_chat_send(0, 'system', 'found it');
    exception when sqlstate 'PGRST' then v := jsonb_build_object('ok', false, 'error', 'hr_closed');
    end;
    if coalesce(v->>'ok', '') = 'true' or exists (select 1 from public.chat_messages where from_id = v_c) then
      raise exception 'rare-broadcast §4(e): hr_chat_send wrote the System channel (%)', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    -- (f) the journal is append-only.
    begin
      update public.hr_world_notices set status = 'posted' where user_id = v_b;
      raise exception 'rare-broadcast §4(f): a journal row was updated';
    exception when check_violation then null;
    end;
    raise exception using errcode = 'HR914', message = 'rare-broadcast §4 complete - rolling back';
  exception when sqlstate 'HR914' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('hr.hunt_session', '', true);
  -- (g) nothing leaked; no client role reaches the new objects.
  if exists (select 1 from public.chat_messages where from_id in (v_a, v_b, v_c))
     or exists (select 1 from public.hr_world_notices where user_id in (v_a, v_b, v_c))
     or exists (select 1 from public.player_state where user_id in (v_a, v_b, v_c)) then
    raise exception 'rare-broadcast §4(g): a probe row leaked'; end if;
  if has_table_privilege('authenticated', 'public.hr_world_notices', 'select')
     or has_table_privilege('anon', 'public.hr_world_notices', 'select')
     or has_table_privilege('authenticated', 'public.hr_world_notice_rules', 'select')
     or has_table_privilege('authenticated', 'public.hr_world_notice_rules', 'update')
     or has_table_privilege('authenticated', 'public.hr_world_notices', 'insert')
     or has_table_privilege('authenticated', 'public.hunt_session_events', 'insert')
     or has_table_privilege('authenticated', 'public.chat_messages', 'insert')
     or has_function_privilege('authenticated', 'public.hr_world_notice_rare()', 'execute')
     or has_function_privilege('anon', 'public.hr_world_notice_rare()', 'execute') then
    raise exception 'rare-broadcast §4(g): a client role reaches a world-notice object'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.hunt_session_events'::regclass
                  and tgname = 'hr_world_notice_rare' and tgenabled = 'O') then
    raise exception 'rare-broadcast §4(g): the trigger is not armed'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'rare-broadcast: a settle''s rare posts one System line, a replay none, capped per character per day, quiet never named, no client writer; all green';
end $mig$;
