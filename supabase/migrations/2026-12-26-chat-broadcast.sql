-- ════════════════════════════════════════════════════════════════════════
-- 2026-12-26-chat-broadcast.sql — LIVE CHAT ARRIVES BY PRIVATE BROADCAST, NOT
--   BY THE POSTGRES_CHANGES WAL POLLER.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-realtime, backend-architect,
-- 2026-10-23). Game CLOSED: applies on its passing §5. Moves no value; in the
-- reopen Security review as a delivery surface (who may hear whose lines and
-- whispers). DB-ONLY; no hr-accrue change. FIRST OF TWO: this file adds the
-- broadcast path and leaves the publication alone, so the live v0.2.36 client
-- (postgres_changes) and the new client (broadcast) BOTH hear every line while
-- the client half ships; 2026-12-27-chat-unpublish.sql drops the two tables
-- from supabase_realtime once the new client is live (the Coordinator applies
-- it after that release, not before: before, the old client would hear no live
-- line until it reloads into the new one).
--
-- ── WHY (measured, 2026-10-23) ──────────────────────────────────────────────
-- pg_stat_statements since 08-17: the Realtime WAL poller is 8.57M calls and
-- 52.3M ms of 135.4M (38.6 % of ALL database time), for exactly two published
-- tables, chat_messages and chat_whispers, which src/social/realtime.js reads
-- with INSERT postgres_changes. Postgres-changes re-evaluates every subscriber's
-- RLS on every decoded row; Broadcast evaluates it ONCE per join and then fans a
-- message out, and the database writes one realtime.messages row per send.
--
-- ── THE CONTRACT (docs/design/LIVE_COUNTERS_PUSH.md §12) ────────────────────
-- §1 TOPICS, spelled once (hr_chat_topic / hr_chat_inbox_topic, owner-only):
--      chat:global · chat:system · chat:local:<zone>   one per public channel
--      chat:inbox:<uid>                                one per ACCOUNT: the
--        whispers TO it and the party lines OF its party (fanned out per member
--        at send time from the line's own audience, the party at that moment,
--        so a member who left hears no later line and nothing depends on a join
--        made while still seated)
--    event 'line' payload {t:'line', line: hr_chat_row(row)} (the server's row
--    shape: server-stamped name, level, weapon, role; the body as stored, i.e.
--    already masked by hr_chat_word_filter; never `audience`), event 'whisper'
--    payload {t:'whisper', line: hr_whisper_row(row)}.
-- §2 AFTER INSERT triggers hr_chat_broadcast (chat_messages) and
--    hr_whisper_broadcast (chat_whispers): EVERY writer is covered (hr_chat_send,
--    hr_whisper_send, the server's world notices hr_world_notice_rare). A party
--    line skips its sender and any member who blocked the sender; a whisper to
--    someone who blocked the sender is not sent (hr_whisper_send already refuses
--    a block either way; this is the second lock). A push failure never fails
--    the insert: the line is stored, and the client's re-read on every (re)join
--    shows it.
-- §3 hr_realtime_policies() RESTATED: the frame policy unchanged, plus
--    "hr_chat_receive" (SELECT, authenticated, broadcast only, an ADMITTED
--    player only): chat:global / chat:system / chat:local:<zone> for any
--    admitted player (the table policy "public channels readable" already lets
--    any player read any of these), chat:inbox:<uid> only for uid. Still NO
--    write policy: no client can send a line or a whisper on any topic.
-- §5 SELF-CHECK, executed, every probe rolled back by a sentinel.
--
-- ── BLOCKS, AND WHAT MOVES TO THE CLIENT (for Security) ─────────────────────
-- postgres_changes applied hr_chat_hide_blocked per subscriber per row. A
-- broadcast topic is authorized per JOIN, so on chat:global / chat:local a line
-- from a player you blocked still reaches your socket and the CLIENT hides it
-- (ChatStore drops a blocked sender's line, as it already drops them on a
-- block). Blocks stay SERVER-enforced where they protect anything: whispers
-- (refused at send, never sent to a blocker's inbox), party lines (never fanned
-- to a member who blocked the sender), and every history read (hr_chat_recent,
-- hr_whispers_recent). A public line is public: anyone in the channel can read
-- it from another account anyway.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- The send is inside the inserting transaction: a rolled-back insert never
-- broadcasts, a committed one broadcasts exactly once (realtime.messages is
-- WAL-delivered). A client dedupes by line id (a line can also arrive in its own
-- send answer or a catch-up read). A second apply is byte-identical: §0 accepts
-- the post image, the triggers are dropped and re-created, the restatements
-- re-create the same text, §5 re-asserts the post md5.
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- One realtime.messages row per public line, one per party member per party
-- line (<= party_max), one per whisper; Realtime's own partitioned table
-- (~3-day retention), not player_ledger. The WAL poller's 38.6 % goes to zero
-- once 2026-12-27-chat-unpublish.sql applies and no client subscribes to
-- postgres_changes. Each client holds at most 4 chat joins (global, system,
-- its zone, its inbox), under CHAT_LIMITS.realtimeBindingsMax = 5.
--
-- ── REVERSIBLE ──────────────────────────────────────────────────────────────
-- drop trigger hr_chat_broadcast on public.chat_messages; drop trigger
-- hr_whisper_broadcast on public.chat_whispers; drop the four functions; re-run
-- 2026-12-25-frame-push-revive.sql's hr_realtime_policies() text and call it.
-- ORDER: right after 2026-12-25-frame-push-revive.sql (its installer is
-- restated here). No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): live-hash-drift wants hr_realtime_policies
-- (replay) and the four new functions if the sweep tracks them; flip this note.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.chat_messages') is null or to_regclass('public.chat_whispers') is null
     or to_regprocedure('public.hr_chat_row(public.chat_messages)') is null
     or to_regprocedure('public.hr_whisper_row(public.chat_whispers)') is null then
    raise exception 'PRECONDITION: the chat tables and their row shapes (2026-10-25-chat-channels.sql, -social.sql) are missing'; end if;
  if to_regprocedure('public.hr_admitted(uuid)') is null then
    raise exception 'PRECONDITION: hr_admitted(uuid) is missing (2026-10-21-closed-mode.sql)'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_realtime_policies()');
  if v_md5 is null then raise exception 'PRECONDITION: apply 2026-12-25-frame-push-revive.sql first (hr_realtime_policies)'; end if;
  if v_md5 is distinct from '0ee73433387f8c3ed95fe01eddeb8dfd' and v_md5 is distinct from 'facea09281fe2085a0b0260958729309' then
    raise exception 'PIN: hr_realtime_policies() is neither 2026-12-25''s image (0ee73433) nor this file''s - md5 %: re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE TOPICS, SPELLED ONCE ──────────────────────────────────────────────
-- A public channel's topic, or NULL for a channel that has none (party lines go to the members' inboxes; a legacy
-- clan or trade channel has no live listener). IMMUTABLE: one spelling the trigger and the policy agree on.
create or replace function public.hr_chat_topic(p_channel text)
returns text language sql immutable set search_path = public as $fn$
  select case when p_channel in ('global', 'system') or p_channel ~ '^local:[a-z0-9_]{1,64}$' then 'chat:' || p_channel end
$fn$;
create or replace function public.hr_chat_inbox_topic(p_user uuid)
returns text language sql immutable set search_path = public as $fn$
  select case when p_user is not null then 'chat:inbox:' || p_user::text end
$fn$;

-- ── §2 THE TWO SENDERS ───────────────────────────────────────────────────────
create or replace function public.hr_chat_broadcast()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_msg jsonb; v_topic text; v_u uuid;
begin
  -- CHAT-BROADCAST (2026-12-26-chat-broadcast.sql): the stored line, once, to everyone allowed to hear it.
  begin
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if;
    v_msg := jsonb_build_object('t', 'line', 'line', public.hr_chat_row(new));
    if new.channel like 'party:%' then
      -- The party as it stood when the line was written (hr_chat_send's audience), each member's own inbox: never
      -- the sender's (its answer carries the line), never a member who blocked the sender.
      for v_u in select distinct a from unnest(coalesce(new.audience, '{}'::uuid[])) a
                  where a is not null and a is distinct from new.from_id
                    and not exists (select 1 from public.chat_blocks b where b.blocker_id = a and b.blocked_id = new.from_id)
                  order by 1 loop
        perform realtime.send(v_msg, 'line', public.hr_chat_inbox_topic(v_u), true);
      end loop;
    else
      v_topic := public.hr_chat_topic(new.channel);
      if v_topic is not null then perform realtime.send(v_msg, 'line', v_topic, true); end if;
    end if;
  exception when others then
    raise warning 'hr_chat_broadcast: line % not pushed (%) — it is stored; the next read shows it', new.id, sqlerrm;
  end;
  return null;
end $fn$;

create or replace function public.hr_whisper_broadcast()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- CHAT-BROADCAST (2026-12-26-chat-broadcast.sql): a whisper reaches its recipient's inbox only.
  begin
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if;
    if new.to_id is null or new.to_id = new.from_id
       or exists (select 1 from public.chat_blocks b where b.blocker_id = new.to_id and b.blocked_id = new.from_id) then
      return null; end if;
    perform realtime.send(jsonb_build_object('t', 'whisper', 'line', public.hr_whisper_row(new)), 'whisper',
                          public.hr_chat_inbox_topic(new.to_id), true);
  exception when others then
    raise warning 'hr_whisper_broadcast: whisper % not pushed (%) — it is stored; the next read shows it', new.id, sqlerrm;
  end;
  return null;
end $fn$;

drop trigger if exists hr_chat_broadcast on public.chat_messages;
create trigger hr_chat_broadcast after insert on public.chat_messages
  for each row execute function public.hr_chat_broadcast();
drop trigger if exists hr_whisper_broadcast on public.chat_whispers;
create trigger hr_whisper_broadcast after insert on public.chat_whispers
  for each row execute function public.hr_whisper_broadcast();

do $mig$
declare v_fn text;
begin
  foreach v_fn in array array['public.hr_chat_topic(text)', 'public.hr_chat_inbox_topic(uuid)',
                              'public.hr_chat_broadcast()', 'public.hr_whisper_broadcast()'] loop
    execute format('revoke execute on function %s from public', v_fn);
    execute format('revoke execute on function %s from anon, authenticated, service_role', v_fn);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then execute format('revoke execute on function %s from hr_engine', v_fn); end if;
    if exists (select 1 from pg_roles where rolname = 'hr_tick') then execute format('revoke execute on function %s from hr_tick', v_fn); end if;
  end loop;
end $mig$;

-- ── §3 THE RECEIVE-ONLY POLICIES, RESTATED: + the chat topics ────────────────
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
  -- CHAT-BROADCAST (2026-12-26-chat-broadcast.sql): an ADMITTED player hears the public channels and its own inbox.
  -- The inbox is pinned to auth.uid() by EQUALITY over the whole topic, so no prefix or extra segment widens it.
  execute 'drop policy if exists "hr_chat_receive" on realtime.messages';
  execute $p$
    create policy "hr_chat_receive"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and (select public.hr_admitted((select auth.uid())))
        and (   (select realtime.topic()) in ('chat:global', 'chat:system')
             or (select realtime.topic()) ~ '^chat:local:[a-z0-9_]{1,64}$'
             or (select realtime.topic()) = 'chat:inbox:' || (select auth.uid())::text)
      )
  $p$;
  return 2;
end $fn$;
select public.hr_realtime_policies();

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- PROBE ROWS ONLY: every row keyed on v_a / v_b / v_c / v_d (uuids gen_random_uuid() does not mint). A probe
-- transport where realtime is absent (PGlite), the real one after a control send on production.
--   c0  grants: no client role may execute the topics, the senders or the installer; hygiene STRICT
--   c1  ★ a GLOBAL line reaches chat:global once, as the server's row (name stamped, body as stored, no audience)
--   c2  a LOCAL line reaches its zone's topic once; a world notice (channel system) reaches chat:system once
--   c3  ★ a PARTY line reaches each OTHER member's inbox once, never the sender's, never a third player's; a
--       member who blocked the sender gets none
--   c4  ★ a WHISPER reaches the recipient's inbox once, never the sender's or a third player's
--   c5  ★ RLS: a third player cannot receive someone's inbox; the owner can; an admitted player receives the
--       public topics; a party topic does not exist; a player not admitted receives nothing; no client can
--       insert; the policies on realtime.messages are exactly the installer's two
--   c6  a push failure never fails the line (probe transport only: a raising send, the line still stored)
--   c7  every body landed as its post pin
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000c4a70001';
  v_b  constant uuid := '000000c0-0000-4000-a000-0000c4a70002';
  v_c  constant uuid := '000000c0-0000-4000-a000-0000c4a70003';
  v_d  constant uuid := '000000c0-0000-4000-a000-0000c4a70004';
  v_u  uuid[] := array['000000c0-0000-4000-a000-0000c4a70001', '000000c0-0000-4000-a000-0000c4a70002',
                       '000000c0-0000-4000-a000-0000c4a70003']::uuid[];
  k    text := '000000c0-0000-4000-a000-0000';
  v_rt text := 'absent';
  v    jsonb; v_m jsonb; v_i int; v_n int; v_txt text; v_zone text; v_pid uuid; v_id uuid;
  v_ia text; v_ib text; v_ic text; v_adm boolean;
begin
  begin
    -- ── c0: GRANTS ───────────────────────────────────────────────────────────
    foreach v_txt in array array['public', 'anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      continue when v_txt <> 'public' and not exists (select 1 from pg_roles where rolname = v_txt);
      if has_function_privilege(v_txt, 'public.hr_chat_topic(text)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_chat_inbox_topic(uuid)', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_chat_broadcast()', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_whisper_broadcast()', 'EXECUTE')
         or has_function_privilege(v_txt, 'public.hr_realtime_policies()', 'EXECUTE') then
        raise exception 'c0: % can EXECUTE a chat-broadcast function or the policy installer', v_txt;
      end if;
    end loop;
    perform public.hr_assert_grant_hygiene(true);

    -- ── THE TRANSPORT ───────────────────────────────────────────────────────
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
      if public.hr_realtime_policies() <> 2 then raise exception 'c-transport: the installer did not install both policies on the probe'; end if;
      v_rt := 'probe';
    elsif to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null and to_regclass('realtime.messages') is not null then
      begin
        perform realtime.send(jsonb_build_object('t', 'hr1226-control'), 'hr1226-control', 'hr1226-control:' || v_a::text, true);
        select count(*) into v_n from realtime.messages where topic = 'hr1226-control:' || v_a::text;
      exception when others then v_n := -1; end;
      if v_n > 1 then raise exception 'c-transport: the control send counted back % rows: this transport duplicates', v_n; end if;
      if v_n = 1 then v_rt := 'live'; end if;
    end if;
    if v_rt = 'absent' then
      raise exception 'c-transport: realtime.messages does not round-trip from this session; apply where realtime works'; end if;

    -- ── the probe players: A (sender), B (A's party, the whisper's recipient), C (a third player), D (not admitted)
    for v_i in 1 .. 3 loop
      perform set_config('request.jwt.claim.sub', v_u[v_i]::text, true);
      insert into auth.users (id) values (v_u[v_i]) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_u[v_i], 'Probe Chat ' || chr(64 + v_i))
        on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_u[v_i], 'chat-broadcast §5 probe') on conflict (user_id) do nothing;
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: hr_create_character refused: %', v; end if;
      update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u[v_i] and slot = 0;
    end loop;
    insert into auth.users (id) values (v_d) on conflict (id) do nothing;
    delete from public.hr_rate_counters where user_id = any (v_u);
    v_ia := public.hr_chat_inbox_topic(v_a); v_ib := public.hr_chat_inbox_topic(v_b); v_ic := public.hr_chat_inbox_topic(v_c);
    v_zone := public.hr_chat_zone_of(v_a, 0);
    if exists (select 1 from realtime.messages where topic in (v_ia, v_ib, v_ic)) then
      raise exception 'c-fixture: a probe inbox carries rows before the first line'; end if;

    -- ── c1: A GLOBAL LINE ────────────────────────────────────────────────────
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    select count(*) into v_n from realtime.messages where topic = 'chat:global';
    v := public.hr_chat_send(0, 'global', 'probe global line');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: the global line was refused: %', v; end if;
    v_id := (v->'line'->>'id')::uuid;
    if (select count(*) from realtime.messages where topic = 'chat:global') <> v_n + 1 then
      raise exception 'c1a: a global line reached chat:global % time(s), expected once', (select count(*) from realtime.messages where topic = 'chat:global') - v_n; end if;
    select payload into v_m from realtime.messages where topic = 'chat:global' and payload->'line'->>'id' = v_id::text;
    if v_m is null or v_m->>'t' is distinct from 'line' or v_m->'line' ? 'audience'
       or v_m->'line'->>'body' is distinct from (select body from public.chat_messages where id = v_id)
       or v_m->'line'->>'from_name' is distinct from left(public.hr_character_name(v_a, 0), 24)
       or (select event from realtime.messages where topic = 'chat:global' and payload->'line'->>'id' = v_id::text) is distinct from 'line'
       or not coalesce((select private from realtime.messages where topic = 'chat:global' and payload->'line'->>'id' = v_id::text), false) then
      raise exception 'c1b: the pushed global line is not the server''s stored row, privately, under event line: %', v_m; end if;
    if exists (select 1 from realtime.messages where topic in (v_ia, v_ib, v_ic)) then
      raise exception 'c1c: a global line reached an inbox'; end if;

    -- ── c2: LOCAL, AND A WORLD NOTICE ────────────────────────────────────────
    select count(*) into v_n from realtime.messages where topic = 'chat:' || v_zone;
    v := public.hr_chat_send(0, 'local', 'probe local line');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: the local line was refused: %', v; end if;
    if (select count(*) from realtime.messages where topic = 'chat:' || v_zone) <> v_n + 1 then
      raise exception 'c2a: a local line did not reach chat:% exactly once', v_zone; end if;
    select count(*) into v_n from realtime.messages where topic = 'chat:system';
    insert into public.chat_messages (channel, from_id, from_name, body, from_slot)
      values ('system', v_a, 'Probe Chat A', 'found a probe notice.', 0);
    if (select count(*) from realtime.messages where topic = 'chat:system') <> v_n + 1 then
      raise exception 'c2b: a server notice (channel system) did not reach chat:system exactly once'; end if;

    -- ── c3: A PARTY LINE: every other member's inbox, once ──────────────────
    v := public.hr_hunt_party_invite(0, 'Probe Chat B', (k || 'c4a71100')::uuid);
    v_pid := public.hr_hunt_party_of(v_a, 0);
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_hunt_party_accept(0, (public.hr_state_of(v_b, 0)->'party_invites'->0->>'id')::uuid, (k || 'c4a71101')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v_pid is null then raise exception 'c-fixture: the party did not form: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_chat_send(0, 'party', 'probe party line');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: the party line was refused: %', v; end if;
    if (select count(*) from realtime.messages where topic = v_ib) <> 1 then
      raise exception 'c3a: a party line reached the other member''s inbox % time(s), expected once', (select count(*) from realtime.messages where topic = v_ib); end if;
    if exists (select 1 from realtime.messages where topic = v_ia) then raise exception 'c3b: a party line was pushed back to its sender'; end if;
    if exists (select 1 from realtime.messages where topic = v_ic) then raise exception 'c3c: a party line reached a player outside the party'; end if;
    if exists (select 1 from realtime.messages where topic like 'chat:party:%') then raise exception 'c3d: a party line went to a shared party topic'; end if;
    if (select payload->'line'->>'channel' from realtime.messages where topic = v_ib) is distinct from 'party:' || v_pid::text then
      raise exception 'c3e: the inbox line does not name its party channel'; end if;
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_b, v_a);
    v := public.hr_chat_send(0, 'party', 'probe party line after the block');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: the second party line was refused: %', v; end if;
    if (select count(*) from realtime.messages where topic = v_ib) <> 1 then
      raise exception 'c3f: a party line reached a member who BLOCKED its sender'; end if;
    delete from public.chat_blocks where blocker_id = v_b and blocked_id = v_a;

    -- ── c4: A WHISPER: the recipient's inbox only ───────────────────────────
    v := public.hr_whisper_send(0, v_b::text, 'probe whisper');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'c-fixture: the whisper was refused: %', v; end if;
    if (select count(*) from realtime.messages where topic = v_ib and event = 'whisper') <> 1 then
      raise exception 'c4a: a whisper did not reach its recipient''s inbox exactly once'; end if;
    if exists (select 1 from realtime.messages where topic in (v_ia, v_ic)) then
      raise exception 'c4b: a whisper reached its sender''s or a third player''s inbox'; end if;
    select payload into v_m from realtime.messages where topic = v_ib and event = 'whisper';
    if v_m->>'t' is distinct from 'whisper' or (v_m->'line'->>'to_id')::uuid is distinct from v_b or (v_m->'line'->>'from_id')::uuid is distinct from v_a then
      raise exception 'c4c: the pushed whisper is not the server''s row: %', v_m; end if;
    -- the second lock: a whisper row that reaches the table past a block (any writer) is still not pushed to the blocker
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_b, v_a);
    insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
      values (v_a, 0, 'Probe Chat A', 1, 'sword', 'tank', v_b, 'Probe Chat B', 'probe whisper past a block');
    if (select count(*) from realtime.messages where topic = v_ib and event = 'whisper') <> 1 then
      raise exception 'c4d: a whisper was pushed to a recipient who BLOCKED its sender'; end if;
    delete from public.chat_blocks where blocker_id = v_b and blocked_id = v_a;

    -- ── c5: ★ RLS: WHO MAY RECEIVE WHAT ★ ────────────────────────────────────
    -- Realtime authorizes a JOIN by reading realtime.messages as the joining user with realtime.topic() set.
    v_adm := coalesce(public.hr_admitted(v_d), false);
    for v_i in 1 .. 7 loop
      -- (1) C joins B's inbox (2) B its own (3) C chat:global (4) C its zone (5) C a party topic
      -- (6) D (not admitted) chat:global (7) B its own inbox with a suffix
      v_id := case when v_i in (2, 7) then v_b when v_i = 6 then v_d else v_c end;
      perform set_config('request.jwt.claim.sub', v_id::text, true);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_id, 'role', 'authenticated')::text, true);
      perform set_config('realtime.topic', case v_i when 1 then v_ib when 2 then v_ib when 3 then 'chat:global'
                                                 when 4 then 'chat:' || v_zone when 5 then 'chat:party:' || v_pid::text
                                                 when 6 then 'chat:global' else v_ib || ':x' end, true);
      execute 'set local role authenticated';
      select count(*) into v_n from realtime.messages;
      execute 'reset role';
      if v_i = 1 and v_n <> 0 then raise exception 'c5a: a third player receives another player''s inbox (% rows)', v_n; end if;
      if v_i = 2 and v_n < 1 then raise exception 'c5b: a player cannot receive its OWN inbox'; end if;
      if v_i = 3 and v_n < 1 then raise exception 'c5c: an admitted player cannot receive chat:global'; end if;
      if v_i = 4 and v_n < 1 then raise exception 'c5d: an admitted player cannot receive its zone''s topic'; end if;
      if v_i = 5 and v_n <> 0 then raise exception 'c5e: a party topic is receivable (party lines go to the members'' inboxes)'; end if;
      -- (while the game is closed D is not admitted; once it opens everyone is, and this arm has nothing to refuse)
      if v_i = 6 and v_n <> 0 and not v_adm then
        raise exception 'c5f: a player NOT admitted receives chat:global (% rows)', v_n; end if;
      if v_i = 7 and v_n <> 0 then raise exception 'c5g: an inbox topic with a suffix is receivable'; end if;
    end loop;
    perform set_config('request.jwt.claim.sub', v_c::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', 'chat:global', true);
    v_n := 1;
    begin
      execute 'set local role authenticated';
      insert into realtime.messages (topic, extension, event, payload, private)
        values ('chat:global', 'broadcast', 'line', jsonb_build_object('t', 'line', 'line', jsonb_build_object('body', 'forged')), true);
    exception
      when insufficient_privilege then v_n := 0;
      when others then v_n := -1; v_txt := sqlerrm;
    end;
    execute 'reset role';
    if v_n = 1 then raise exception 'c5h: a CLIENT inserted a chat line on chat:global: anyone could speak as anyone'; end if;
    if v_n = -1 then raise exception 'c5h-harness: the client insert failed for another reason (%), so the write refusal is unproven', v_txt; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('realtime.topic', '', true);
    select string_agg(policyname || '/' || cmd, ', ' order by policyname) into v_txt
      from pg_policies where schemaname = 'realtime' and tablename = 'messages';
    if v_txt is distinct from 'hr_chat_receive/SELECT, hr_frame_receive_own_topic/SELECT' then
      raise exception 'c5i: realtime.messages carries policies [%], expected exactly the installer''s two receive-only ones', v_txt; end if;

    -- ── c6: A PUSH FAILURE NEVER FAILS THE LINE (probe transport only) ──────
    if v_rt = 'probe' then
      create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
        returns void language plpgsql as 'begin raise exception ''probe transport down''; end';
      perform set_config('request.jwt.claim.sub', v_c::text, true);
      begin
        v := public.hr_chat_send(0, 'global', 'probe line while the transport is down');
      exception when others then
        raise exception 'c6: a failing push failed the line itself (%)', sqlerrm;
      end;
      if coalesce(v->>'ok', '') <> 'true' or not exists (select 1 from public.chat_messages where id = (v->'line'->>'id')::uuid) then
        raise exception 'c6: a failing push failed the line itself: %', v; end if;
      perform set_config('request.jwt.claim.sub', '', true);
    end if;

    -- ── c7: THE POST PIN ─────────────────────────────────────────────────────
    if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_realtime_policies()')) is distinct from 'facea09281fe2085a0b0260958729309' then
      raise exception 'c7: hr_realtime_policies() landed as md5 %, not §0''s post pin facea092',
        (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_realtime_policies()')); end if;

    raise exception 'hr1226-selfcheck-ok';
  exception when others then
    if sqlerrm <> 'hr1226-selfcheck-ok' then raise; end if;
  end;
  raise notice 'chat-broadcast: self-check passed (transport %), every probe rolled back', v_rt;
end $$;
