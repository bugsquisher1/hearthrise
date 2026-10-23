-- ════════════════════════════════════════════════════════════════════════
-- 2026-12-27-chat-unpublish.sql — THE CHAT TABLES LEAVE THE supabase_realtime
--   PUBLICATION: THE POSTGRES_CHANGES WAL POLLER HAS NOTHING LEFT TO DECODE.
--
-- STATUS: STAGED, NOT APPLIED (lane/c-realtime, backend-architect,
-- 2026-10-23). SECOND OF TWO, and ORDER-SENSITIVE: apply only AFTER the client
-- release that listens on Broadcast (src/social/realtime.js chat topics + the
-- inbox) is live. 2026-12-26-chat-broadcast.sql (applied first) already
-- broadcasts every line; this file only removes the old delivery, so before
-- the new client is live it would leave the v0.2.36 client with no live line
-- until it reloads. Game CLOSED: applies on its passing §2. Moves no value.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- The Realtime WAL poller (realtime.list_changes) was 38.6 % of all database
-- time since 08-17 (pg_stat_statements: 52.3M of 135.4M ms, 8.57M calls) for
-- exactly these two published tables. With no table published and no client
-- subscribed to postgres_changes, there is nothing for it to poll.
--
-- ── WHAT ────────────────────────────────────────────────────────────────────
-- §1 alter publication supabase_realtime drop table chat_messages, chat_whispers
--    (each only if it is a member: a second apply is a no-op). The publication
--    itself stays (Supabase owns it; empty is a valid state). The tables, their
--    rows, their RLS and their history reads are untouched: history is a table
--    read (hr_chat_recent / hr_whispers_recent), live delivery is Broadcast.
-- §2 SELF-CHECK: the publication carries neither table; the broadcast path is
--    in place and ENABLED (both triggers), so this cannot strand chat; both
--    tables still exist (unpublishing is not dropping).
-- REVERSIBLE: alter publication supabase_realtime add table public.chat_messages,
-- public.chat_whispers; (and ship a client that subscribes again).
-- ORDER: after 2026-12-26-chat-broadcast.sql. No begin/commit (CLAUDE.md §2).
-- AFTER APPLYING (Coordinator): no function moves (live-hash-drift unchanged);
-- read the poller's calls in pg_stat_statements a day later; flip this note.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITION: the broadcast path exists before the old one goes ────────
do $mig$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.chat_messages'::regclass and tgname = 'hr_chat_broadcast' and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.chat_whispers'::regclass and tgname = 'hr_whisper_broadcast' and tgenabled <> 'D') then
    raise exception 'PRECONDITION: apply 2026-12-26-chat-broadcast.sql first: without its triggers this file would stop every live line';
  end if;
end $mig$;

-- ── §1 UNPUBLISH ─────────────────────────────────────────────────────────────
do $mig$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
      alter publication supabase_realtime drop table public.chat_messages;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_whispers') then
      alter publication supabase_realtime drop table public.chat_whispers;
    end if;
  end if;
end $mig$;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED ───────────────────────────────────
do $$
declare v_txt text;
begin
  select string_agg(schemaname || '.' || tablename, ', ' order by tablename) into v_txt
    from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('chat_messages', 'chat_whispers');
  if v_txt is not null then raise exception 'u1: supabase_realtime still publishes % (the WAL poller keeps decoding them)', v_txt; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled <> 'D'
        and ((tgrelid = 'public.chat_messages'::regclass and tgname = 'hr_chat_broadcast')
          or (tgrelid = 'public.chat_whispers'::regclass and tgname = 'hr_whisper_broadcast'))) <> 2 then
    raise exception 'u2: the broadcast triggers are not both in place and enabled: unpublishing would strand chat'; end if;
  if to_regclass('public.chat_messages') is null or to_regclass('public.chat_whispers') is null then
    raise exception 'u3: a chat table is gone (unpublishing is not dropping)'; end if;
  raise notice 'chat-unpublish: supabase_realtime no longer carries the chat tables; Broadcast delivers every line';
end $$;
