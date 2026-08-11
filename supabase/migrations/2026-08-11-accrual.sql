-- ============================================================================
-- 2026-08-11-accrual.sql — the server-owned OFFLINE CAP.
--
-- Phase C of the server-authority program. The accrual Edge Function computes
-- WHAT should happen; this file supplies the one number it is not allowed to
-- decide for itself and hr_apply supplies the decision about whether it may.
--
-- ── WHY THE CAP LIVES IN POSTGRES AND NOT IN THE EDGE FUNCTION ──────────────
-- `grantMs = min(now() - accrued_to, capMs)`. `capMs` is a MULTIPLIER on the
-- entire grant — a 12h cap raised to 120h pays ten nights instead of one — so
-- it belongs in the same category as `tickMs`: a number the client must never
-- author and the engine should not be the sole authority for either.
--
-- The Edge Function already reads `accrued_to` and `now()` from the database.
-- Reading `capMs` from the database too means the accrual engine holds NO
-- authoritative number of its own: every input to the grant arrives from a
-- server table, and a compromised Edge Function's remaining capability is
-- "propose a delta to a function that re-validates every invariant" — exactly
-- the property §2a of docs/design/server-authority.md is built around.
--
-- ── WHAT IS ACTUALLY SERVER-KNOWN TODAY, STATED HONESTLY ────────────────────
-- The client's offlineCapHours() (legacy.js:936) sums four sources:
--
--   base                       12h            server-known (a constant)
--   Offline+ entitlement       +4h  (→16h)    NOT server-owned — no entitlements
--                                             table exists. Contributes 0.
--   renown perk                +0…?h          NOT server-owned. Contributes 0.
--   property tier              +1…+4h         NOT server-owned. Contributes 0.
--   clan level                 +1h @Lv4,      SERVER-OWNED (clans.level, and
--                              +3h @Lv7       clan_members is written only by
--                                             SECURITY DEFINER clan RPCs).
--
-- Three of the five contribute 0 today, so the server cap is currently LOWER
-- than the client's for an entitled/propertied player. That direction is the
-- correct one to be wrong in FOR THIS NUMBER: the cap under-pays rather than
-- over-pays, and a player who is owed more gets it the moment those sources
-- become server state. The alternative — trusting a client-reported entitlement
-- — is the exact defect this program exists to remove. Each source is closed by
-- moving it into a table, at which point the coalesce below grows one line.
--
-- ⚠ DO NOT GENERALISE THAT SENTENCE TO THE ACCRUAL ENGINE. It is true of the
--   cap and false of the grant: `equipment` is read at COLLECT time and prices
--   the whole window, so logging off naked and equipping best-in-slot before
--   collecting is paid at best-in-slot rates — measured at 12.8x gold and 20x
--   XP on an identical seed and window (review S5, docs/design/server-authority.md
--   §3). That is an OVER-payment path, it is deferred to Phase D, and it has no
--   live blast radius only because no client path can start an activity yet.
--
-- ⚠ A DISCREPANCY THE GAME DESIGNER SHOULD RULE ON. The program brief says
--   "clan +1..+2h". The shipped client (src/features/clans.js:81 perksFor) sums
--   the perk ladder CUMULATIVELY, so a level-7 clan grants +1 (Lv4) AND +2
--   (Lv7) = +3h, not +2h. This function mirrors the SHIPPED behaviour, because
--   a server that quietly pays less than the client advertises is a support
--   ticket. If +3h was not intended, the fix belongs in clans.js and here in
--   the same commit.
--
-- ── ADDITIVE AND IDEMPOTENT ────────────────────────────────────────────────
-- One CREATE OR REPLACE FUNCTION. No DDL on any table, nothing dropped, no
-- data touched. Reversible with a single DROP FUNCTION (§7).
-- ============================================================================

-- ── 1. hr_offline_cap_ms ────────────────────────────────────────────────────
create or replace function public.hr_offline_cap_ms(p_user uuid, p_slot int default 0)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  -- The base cap, in hours. 12h F2P (legacy.js:938).
  c_base_h      constant int := 12;
  -- THE CEILING. Not balance — a fuse. It is the largest cap any legal
  -- combination of sources could ever produce (16h Offline+ · +4h property ·
  -- +4h renown · +3h clan = 27h, rounded up to a day), so it can never clip an
  -- honest player, and it bounds the blast radius if a perk table is ever
  -- mis-seeded or a future source is added without re-reading this file.
  -- A cap is a multiplier on a whole night's progress; an unbounded one is a
  -- mint.
  c_ceiling_ms  constant bigint := 24 * 3600000;
  v_clan_lv     int;
  v_hours       int := c_base_h;
begin
  if p_user is null then return c_base_h::bigint * 3600000; end if;

  -- Clan level. `clan_members` carries no write policy for clients (the clan
  -- RPCs are the only writers), so this is a real server fact and not a
  -- laundered client one — the rule from design §5: "a server-derived value is
  -- only as trustworthy as the write privileges on the column it is derived
  -- from. Check the source table, not the derivation."
  select c.level into v_clan_lv
    from public.clan_members m
    join public.clans c on c.id = m.clan_id
   where m.user_id = p_user
   limit 1;

  -- CUMULATIVE, matching src/features/clans.js perksFor(). Written as two
  -- independent adds rather than a CASE ladder for exactly that reason: the
  -- client sums the ladder, so a level-7 clan collects both rungs.
  if coalesce(v_clan_lv, 0) >= 4 then v_hours := v_hours + 1; end if;
  if coalesce(v_clan_lv, 0) >= 7 then v_hours := v_hours + 2; end if;

  -- (Offline+ entitlement, renown and property tier land here when they become
  --  server state. Until then they contribute 0 — see the header.)

  return least(c_ceiling_ms, v_hours::bigint * 3600000);
end $$;

-- ── 2. GRANTS ───────────────────────────────────────────────────────────────
-- Revoke before granting, and revoke from PUBLIC first: Postgres grants EXECUTE
-- to PUBLIC on every new function and Supabase's default ACL additionally
-- grants anon/authenticated/service_role. Revoking one of the four leaves the
-- privilege intact three other ways.
revoke execute on function public.hr_offline_cap_ms(uuid, int) from public;
revoke execute on function public.hr_offline_cap_ms(uuid, int)
  from anon, authenticated, service_role;
-- The engine is the only caller. A player has no reason to ask the server for
-- their own cap through this function — hr_load's envelope is where a UI number
-- belongs — and every function a browser can reach is a function that has to be
-- reasoned about again.
grant execute on function public.hr_offline_cap_ms(uuid, int) to hr_engine;

-- ── 3. REVERSIBILITY ────────────────────────────────────────────────────────
--   drop function if exists public.hr_offline_cap_ms(uuid, int);
-- Nothing else to undo. No table, no column, no row, no cron job. The accrual
-- Edge Function fails closed without it (it refuses to accrue rather than
-- falling back to a hardcoded cap) — see supabase/functions/hr-accrue/index.ts,
-- which is the correct direction: no cap means no grant, never an unbounded one.

-- ── 4. SELF-VERIFICATION ────────────────────────────────────────────────────
-- Asserts the properties this file is load-bearing for. A migration that does
-- not check its own claims is a comment.
--
-- ⚠ to_regprocedure, NOT to_regproc: to_regproc('f(int)') returns NULL because
--   it does not accept an argument list, so a `to_regproc(...) is null` guard
--   would fail its own migration on the first run. That mistake has already
--   been made twice in this program; it is written down here so it is not made
--   a third time.
do $$
declare
  v_p oid;
  v_bad text;
begin
  v_p := to_regprocedure('public.hr_offline_cap_ms(uuid,int)');
  if v_p is null then
    raise exception 'hr_offline_cap_ms(uuid,int) missing — the signature in the '
                    'assertion does not match the one that was created';
  end if;

  -- (a) NOT executable by anything a browser request can arrive as. This is the
  --     assertion that matters: the cap is an input to every grant.
  select string_agg(r, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, v_p, 'execute');
  if v_bad is not null then
    raise exception 'hr_offline_cap_ms is executable by: % — revoke before grant', v_bad;
  end if;

  -- (b) …and IS executable by the engine, which is the only caller. Asserted
  --     because a grant that silently did not apply produces a runtime failure
  --     in the accrual path at 3am rather than a failed migration now.
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_engine cannot execute hr_offline_cap_ms';
  end if;

  -- (c) Behavioural: the base cap is exactly 12h for a user in no clan. A
  --     random uuid is guaranteed to have no clan_members row, so this is a
  --     read-only probe with no fixture and no cleanup.
  if public.hr_offline_cap_ms(gen_random_uuid(), 0) <> 12 * 3600000 then
    raise exception 'hr_offline_cap_ms base cap is not 12h';
  end if;

  -- (d) …and a null user still returns the base cap rather than NULL. A NULL
  --     cap would become `min(elapsed, NULL)` = NULL in the caller, and a
  --     NULL that reaches JS as `null` coerces to 0 — silently granting
  --     nothing forever. Fail loudly here instead.
  if public.hr_offline_cap_ms(null, 0) is distinct from 12::bigint * 3600000 then
    raise exception 'hr_offline_cap_ms(null) must return the base cap, not null';
  end if;

  -- (e) The ceiling is a fuse, so prove the function cannot exceed it for ANY
  --     row currently in the database. Bounded scan: clans is small and this
  --     runs once, at migration time.
  if exists (
    select 1 from public.clan_members m
     where public.hr_offline_cap_ms(m.user_id, 0) > 24::bigint * 3600000
     limit 1)
  then
    raise exception 'hr_offline_cap_ms exceeded its own ceiling for a live member row';
  end if;

  raise notice 'hr_offline_cap_ms: installed, engine-only, base 12h, ceiling 24h.';
end $$;
