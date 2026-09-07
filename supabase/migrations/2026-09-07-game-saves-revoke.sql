-- ============================================================================
-- 2026-09-07-game-saves-revoke.sql — TAKE THE CLIENT'S WRITE GRANT ON
--                                    public.game_saves AWAY.
--
-- STAGED, NOT APPLIED - REVIEW ONLY.
--
-- ── WHY, IN ONE SENTENCE ────────────────────────────────────────────────────
-- b515 deleted the last client code that wrote the save blob; this closes the
-- door behind it, so the blob cannot come back through a stale build, a future
-- edit, or a hand-rolled PostgREST call from a signed-in browser.
--
-- ── WHAT b515 DID ON THE CLIENT ─────────────────────────────────────────────
-- The b353 kill switch (`localStorage['hr:serverAccrual'] = 'off'`) is retired.
-- Its OFF position was measured on 2026-09-07 and it was not, as documented, a
-- "pre-cutover client": it was a divergent single-device local game — the
-- authoritative snapshot blob upserted into THIS TABLE (src/net/sync.js
-- snapshotIfDue), away time computed from the device clock (legacy.js
-- processOffline), gold and gems minted locally (legacy.js goldSettleCurrency),
-- `mayClientWrite` answering yes for every server-owned field, every intent
-- dark, the v1 client market writing market_listings directly, and the boot
-- veil off — all of it silently discarded the moment the key was cleared.
-- CLAUDE.md §1 forbids exactly that ("nothing is authored by the client, ever;
-- no client-authored fallbacks"). The switch, the branches and the blob upsert
-- are deleted. `snapshotIfDue` now ships ONLY the self-only residue through
-- hr_put_client_state.
--
-- ── WHAT THIS FILE DOES, AND DOES NOT DO ───────────────────────────────────
-- DOES:     revoke INSERT and UPDATE on public.game_saves from `authenticated`.
-- DOES NOT: revoke SELECT. Two live readers still need it —
--             · the DR/restore posture: game_saves is the pre-cutover archive
--               of every beta character and the restore-census classifies it as
--               retained player data; a read grant is how a support path or a
--               player-facing export reads it back;
--             · 2026-08-08-leaderboards.sql reads `from public.game_saves gs`
--               inside a SECURITY DEFINER body (unaffected by role grants) —
--               named here so a future "select is unused" sweep does not remove
--               the table underneath it.
-- DOES NOT: drop the table, delete a row, or touch RLS policies. The rows are
--           real players' pre-cutover progress. The table DROP is a later
--           slice, after `node tools/restore-census.mjs` reclassifies it and
--           the retention question is answered by a human.
-- DOES NOT: touch `service_role` (the restore path reads and writes through it).
-- DOES NOT: revoke DELETE. MEASURED-OPEN, flagged for the Security review
--           rather than decided here: Supabase's default privileges give
--           `authenticated` DELETE on a public table, so a signed-in browser
--           can still delete its OWN archived pre-cutover save (RLS scopes it
--           to auth.uid()). No client code calls it. It is left in place
--           because taking it is a data-RETENTION decision on rows that are
--           real players' progress, and that belongs with the table-drop slice
--           and the restore-census reclassification, not with a write-path
--           cleanup. §4 does not assert it either way.
--
-- ── WHY A GRANT AND NOT ONLY RLS ───────────────────────────────────────────
-- RLS already scopes the row set to `auth.uid()`, so a forged write could only
-- ever damage the forger's own archived save — this is not an exploit fix and
-- must not be reported as one. It is a CAPABILITY the client no longer needs:
-- the smallest surface a signed-in browser can reach is the one that cannot be
-- misused later. Revoking the table grant is checkable in one query
-- (information_schema.role_table_grants) and cannot be defeated by a policy
-- edit somewhere else.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────────
-- A player on a STALE build (pre-b515, still running the blob upsert) gets a
-- 401/403 from PostgREST on that upsert after this applies. That is the correct
-- and intended outcome — their authority state is already server-side and their
-- residue rides hr_put_client_state, which is a SECURITY DEFINER RPC and is not
-- affected — but it is a real behaviour change for an un-refreshed tab, so this
-- file should apply WITH or AFTER the b515 client push, never long before it.
-- src/net/sync.js `noteSaveOutcome` reports the refusal honestly rather than
-- silently; nothing retries in a loop (the b371 retry is one attempt).
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Catalog-only. Takes no lock on any player row, reads none, writes none, and
-- deletes nothing. Idempotent: a second apply is a no-op and §4 proves it.
--
-- ROLLBACK (exact, idempotent, safe to paste):
--   grant insert, update on public.game_saves to authenticated;
-- Effect: the pre-change grant set is restored immediately. No data can be lost
-- either way, in either direction.
-- ============================================================================

-- ── 1. Revoke the client's write capability ────────────────────────────────
--     GUARDED ON THE ROLE EXISTING, not on the cluster being Supabase: the repo
--     chain replays on PGlite (tests/schema-drift.mjs), where `authenticated`
--     and `anon` are not created. A bare REVOKE would abort that replay, and a
--     chain that cannot replay is a chain nobody can rebuild from.
do $$ begin
  if to_regclass('public.game_saves') is null then
    raise notice 'game-saves-revoke: public.game_saves absent — no-op';
  elsif not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'game-saves-revoke: role authenticated absent (replay cluster) — no-op';
  else
    revoke insert, update on public.game_saves from authenticated;
    raise notice 'game-saves-revoke: insert+update revoked from authenticated';
  end if;
end $$;

-- ── 2. anon must never have held one; take it rather than assume it ────────
do $$ begin
  if to_regclass('public.game_saves') is not null
     and exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete on public.game_saves from anon;
  end if;
end $$;

-- ============================================================================
-- §4. SELF-CHECK — the commit gate. Properties asserted by EXECUTING SQL, not
--     by markers: this block raises (and therefore aborts the apply) unless
--     every claim above is true of the database it just ran against.
-- ============================================================================
do $$
declare
  v_ins   int;
  v_upd   int;
  v_sel   int;
  v_anon  int;
  v_rls   boolean;
begin
  if to_regclass('public.game_saves') is null then
    raise notice 'game-saves-revoke §4: table absent — nothing to assert';
    return;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- The replay cluster. §4's subject is a GRANT, and there is no grantee here.
    -- Say so rather than passing silently: a self-check that cannot run is not
    -- a self-check that passed.
    raise notice 'game-saves-revoke §4: role authenticated absent (replay cluster) — grants not asserted';
    return;
  end if;

  select count(*) into v_ins  from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'authenticated' and privilege_type = 'INSERT';
  select count(*) into v_upd  from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'authenticated' and privilege_type = 'UPDATE';
  select count(*) into v_sel  from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'authenticated' and privilege_type = 'SELECT';
  select count(*) into v_anon from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'game_saves';

  -- (a) THE POINT OF THE FILE: no client write capability remains.
  if v_ins <> 0 then
    raise exception 'game-saves-revoke §4(a): authenticated still holds INSERT on game_saves';
  end if;
  if v_upd <> 0 then
    raise exception 'game-saves-revoke §4(a): authenticated still holds UPDATE on game_saves';
  end if;

  -- (b) SELECT IS DELIBERATELY KEPT. If a future edit takes it too, this fails
  --     loudly rather than quietly breaking the restore/DR read path.
  if v_sel <> 1 then
    raise exception 'game-saves-revoke §4(b): authenticated SELECT on game_saves is % (expected exactly 1). '
      'This file revokes WRITE only — the archive stays readable for the restore posture.', v_sel;
  end if;

  -- (c) anon holds no write capability either.
  if v_anon <> 0 then
    raise exception 'game-saves-revoke §4(c): anon holds % write grant(s) on game_saves', v_anon;
  end if;

  -- (d) RLS is untouched and still ON. A grant revoke must never be mistaken
  --     for, or used to justify weakening, the per-user row scope.
  if v_rls is distinct from true then
    raise exception 'game-saves-revoke §4(d): row-level security on game_saves is not enabled';
  end if;

  raise notice 'game-saves-revoke §4: OK — authenticated has SELECT only, anon has no writes, RLS on';
end $$;
