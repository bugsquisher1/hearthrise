-- ============================================================================
-- 2026-09-06-realtime-publication-trim.sql — TRIM supabase_realtime TO ITS ONE
--                                            LOAD-BEARING TABLE.
--
-- STAGED, NOT APPLIED - REVIEW ONLY.
--
-- ── WHAT WAS MEASURED (production nezapsylztqbbwuwembx, 2026-09-06) ─────────
-- pg_stat_statements, window 2026-08-17 07:46 UTC -> now (20.25 days):
--   the Realtime WAL poller (`select wal->>... ` over list_changes)
--     2,706,517 calls | 15,669 s total | mean 5.79 ms | max 9,847 ms
--   #2 by total time is a PostgREST RPC at 438 s. The poller is ~36x the next
--   consumer and ~61% of ALL measured exec time in the database.
--
-- Read that honestly: 15,669 s over 20.25 days is 774 s/day == 0.9% of ONE
-- vCPU, at 1.55 calls/s. The poller is not eating the box on average. What it
-- does have is a 9.8 s maximum, and the same window shows the hr_rate_gate
-- composite at mean 402 ms / max 6.8 s with ZERO disk reads. Two unrelated
-- statements both stalling for seconds with no IO is the signature of an
-- instance-wide freeze (shared-tier CPU steal / checkpoint), NOT of a 0.9%
-- consumer starving anything. This file therefore does NOT claim to fix the
-- stalls, and must not be reported as having fixed them.
--
-- ── WHAT IT DOES FIX: an unsubscribed table in the publication is a bill that
-- has not arrived yet. Every published table's INSERT/UPDATE/DELETE is decoded
-- out of WAL and RLS-evaluated ONCE PER CONNECTED SUBSCRIBER on every poll.
-- Today both trimmed tables hold 0 rows, so the saving today is ~0 s. At the
-- 100x-player projection where market_buy_offers is actually written, an
-- unsubscribed publication entry is per-write decode + per-client RLS work for
-- events no client is listening to. Cheapest time to remove it is now.
--
-- ── WHO ACTUALLY SUBSCRIBES (grep of src/**, vendor excluded) ───────────────
--   chat_messages     -> src/net/supabase-chat-backend.js:150-158
--                        .channel('chat-'+ch).on('postgres_changes', INSERT,
--                        filter channel=eq.<ch>). Caller: src/chat.js:993.
--                        LOAD-BEARING: the backend has fetch(channel, sinceTs)
--                        but NOTHING polls it — Realtime is the only path by
--                        which a peer's message ever reaches another client.
--                        KEPT. Dropping it silently kills multiplayer chat.
--   market_buy_offers -> NO subscriber anywhere in src/**. DROPPED.
--   market_listings   -> src/net/supabase-market-backend.js:488 subscribes to
--                        it, and that subscribe(onChange) has NO CALLER in the
--                        entire tree (grep: the only hits are its own definition
--                        and its own .subscribe()). It is also NOT PUBLISHED IN
--                        PRODUCTION — pg_publication_tables live returns exactly
--                        {chat_messages, market_buy_offers}. So the repo chain
--                        (supabase/schema.sql:252) believes a table is published
--                        that live has never had. DROPPED, which makes the repo
--                        match the measured database rather than the reverse.
--                        ROOT CAUSE FOUND while writing the guard, and worth
--                        knowing generally: 2026-08-17-market-v2.sql:386 does
--                        `drop table if exists public.market_listings cascade`
--                        and recreates it — and DROPPING A TABLE SILENTLY
--                        REMOVES IT FROM EVERY PUBLICATION. Nothing re-added it.
--                        So §2 below is a proven NO-OP against both production
--                        and a clean repo replay; it is kept because it is the
--                        only thing that makes the intent survive a database
--                        where the row DID linger, and its notice says so.
--                        Any future `drop table` on a published table has this
--                        same invisible side effect — tests/realtime-cost.mjs R1
--                        is now what notices.
--
-- ── THE KNOB THIS FILE CANNOT TURN ─────────────────────────────────────────
-- The 2.7M call COUNT is the Realtime tenant's poll cadence. It is paid per
-- poll regardless of how many tables are published, so this migration does not
-- and cannot reduce it. `poll_interval_ms` and `max_changes` are internal
-- Realtime tenant parameters: they are not GUCs, not settable by SQL, and are
-- not exposed in the Supabase dashboard or the documented Management API
-- (searched 2026-09-06). The only project-level lever is Dashboard -> Database
-- -> Replication -> supabase_realtime, i.e. the table list this file edits.
-- Turning the poller OFF entirely means publishing zero tables, which costs
-- chat. That is Tyler's call, not this file's.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Takes no lock on any player table (ALTER PUBLICATION touches catalog only).
-- Reads and writes no player row. Not destructive: nothing is dropped, deleted
-- or truncated — only publication membership changes.
--
-- ROLLBACK (exact, idempotent, safe to paste):
--   do $$ begin alter publication supabase_realtime add table public.market_buy_offers;
--   exception when duplicate_object then null; end $$;
--   do $$ begin alter publication supabase_realtime add table public.market_listings;
--   exception when duplicate_object then null; end $$;
-- Effect of rollback: the pre-change set is restored within one poll cycle
-- (~1 s). No client reconnect required; no data can be lost either way.
--
-- NOTE ON SYNTAX: PostgreSQL has no `ALTER PUBLICATION ... DROP TABLE IF
-- EXISTS`. Idempotency is therefore a membership test, which is stronger: it
-- also no-ops cleanly on a database where the table itself does not exist.
-- ============================================================================

-- ── 1. Drop market_buy_offers (no subscriber) ───────────────────────────────
do $$ begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime'
                and schemaname = 'public' and tablename = 'market_buy_offers') then
    alter publication supabase_realtime drop table public.market_buy_offers;
    raise notice 'realtime-trim: market_buy_offers unpublished';
  else
    raise notice 'realtime-trim: market_buy_offers already unpublished (no-op)';
  end if;
exception when undefined_object then
  raise notice 'realtime-trim: publication supabase_realtime absent (no-op)';
end $$;

-- ── 2. Drop market_listings (subscriber exists but is dead code; never live) ─
do $$ begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime'
                and schemaname = 'public' and tablename = 'market_listings') then
    alter publication supabase_realtime drop table public.market_listings;
    raise notice 'realtime-trim: market_listings unpublished';
  else
    raise notice 'realtime-trim: market_listings already unpublished (no-op)';
  end if;
exception when undefined_object then
  raise notice 'realtime-trim: publication supabase_realtime absent (no-op)';
end $$;

-- ── 3. chat_messages is KEPT, and that is asserted, not assumed ─────────────
do $$ begin
  if to_regclass('public.chat_messages') is not null
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime'
                        and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
    raise notice 'realtime-trim: chat_messages re-published (it must be)';
  end if;
exception when undefined_object then null; end $$;

-- ── 4. SELF-CHECK — the commit gate ────────────────────────────────────────
do $$
declare v_set text; v_expected constant text := 'chat_messages';
begin
  select coalesce(string_agg(tablename, ', ' order by tablename), '(none)')
    into v_set
    from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';

  -- (a) the set is EXACTLY the one load-bearing table.
  if v_set is distinct from v_expected then
    raise exception 'SELF-CHECK FAILED: published set is [%], expected [%]', v_set, v_expected;
  end if;

  -- (b) CONTROL. (a) would pass just as happily on a migration that dropped
  --     EVERY table and then re-added chat_messages to an EMPTY publication —
  --     or on one that unpublished chat and left the game with no peer message
  --     delivery at all. Name the failure that actually matters.
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'chat_messages') then
    raise exception 'SELF-CHECK FAILED: chat_messages is not published — '
      'src/net/supabase-chat-backend.js:150 is the ONLY peer-delivery path and nothing polls it';
  end if;

  -- (c) CONTROL. The tables themselves must still exist. Unpublishing is not
  --     dropping, and a migration that confused the two would satisfy (a).
  if to_regclass('public.market_buy_offers') is null then
    raise exception 'SELF-CHECK FAILED: market_buy_offers table is GONE — this file unpublishes, it does not drop';
  end if;
  if to_regclass('public.market_listings') is null then
    raise exception 'SELF-CHECK FAILED: market_listings table is GONE — this file unpublishes, it does not drop';
  end if;

  raise notice 'realtime-publication-trim OK: supabase_realtime publishes exactly [%]', v_set;
end $$;
