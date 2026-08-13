-- ============================================================================
-- 2026-08-13-drop-dead-leaderboard-views.sql   — F5 (PARTIAL). APPLIED 2026-08-13.
--
-- WHAT SECURITY FOUND: five SECURITY DEFINER **views** that let `anon` read
-- around game_saves RLS. They matter, and they had never been counted, because
-- every prior census walked `pg_proc` — and a view is not a function. The
-- Supabase advisors are what surfaced them (5 × ERROR `security_definer_view`),
-- which is the one thing an in-house census could not have produced.
--
-- Proven by execution as role `anon`, no JWT: direct `game_saves` returned 0
-- rows (RLS holds), while `lb_gold`, `leaderboard`, `leaderboard_ranked` and
-- `clan_leaderboard` all returned real rows — every player's uuid, name, gold
-- and levels to an unauthenticated caller.
--
-- WHAT THIS FILE DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- DROPS the three that are genuinely dead: `lb_total_level`, `lb_combat`,
-- `lb_gold`. Verified before dropping, not assumed:
--   • 0 dependent objects each (pg_depend/pg_rewrite),
--   • the ONLY references anywhere under src/ are in `src/net/SUPABASE_SETUP.md`
--     — a setup document, not code. No client file reads them.
--
-- DOES NOT drop `leaderboard` or `clan_leaderboard`. The client fetches both
-- DIRECTLY over PostgREST today:
--   src/features/clans.js:443  -> /rest/v1/leaderboard?order=…&limit=15
--   src/features/clans.js:96   -> /rest/v1/clan_leaderboard?limit=25
-- Dropping them closes two advisor ERRORs and breaks the live game, which is a
-- bad trade. They need the client moved onto the `hr_leaderboard` RPC first —
-- `src/features/leaderboards.js` already prefers that path, so this is a
-- narrowing job, not a new feature.
--
-- DOES NOT revoke `anon`/`authenticated` SELECT on `leaderboard_ranked` (the
-- materialized view). That revoke is correct and wanted — while the matview is
-- directly selectable, `hr_leaderboard`'s `p_limit <= 100` clamp and its rate
-- gate are both decorative. But it deserves its own change with a check that
-- every board still resolves through the RPC afterwards.
--
-- REVERSIBILITY: the three view definitions are in 2026-08-08-leaderboards.sql.
-- No table, no policy, no row of player data is read or written.
-- ============================================================================

drop view if exists public.lb_total_level;
drop view if exists public.lb_combat;
drop view if exists public.lb_gold;

-- ── SELF-CHECK — the commit gate ────────────────────────────────────────────
do $$
declare v_left text;
begin
  select string_agg(c.relname, ', ') into v_left
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('lb_total_level','lb_combat','lb_gold');
  if v_left is not null then
    raise exception 'SELF-CHECK FAILED: % survived the drop', v_left;
  end if;

  -- CONTROL. Without these three the assertion above would pass just as happily
  -- on a migration that dropped EVERY leaderboard view — an assertion that can
  -- only report success is the failure mode this repo has hit twelve times.
  if to_regclass('public.leaderboard') is null then
    raise exception 'SELF-CHECK FAILED: public.leaderboard was dropped — src/features/clans.js:443 is now broken';
  end if;
  if to_regclass('public.clan_leaderboard') is null then
    raise exception 'SELF-CHECK FAILED: public.clan_leaderboard was dropped — src/features/clans.js:96 is now broken';
  end if;
  if to_regclass('public.leaderboard_ranked') is null then
    raise exception 'SELF-CHECK FAILED: leaderboard_ranked was dropped — hr_leaderboard reads it';
  end if;

  raise notice 'F5 PARTIAL: 3 dead definer views dropped; leaderboard, clan_leaderboard and leaderboard_ranked intact.';
end $$;
