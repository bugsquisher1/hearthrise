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
-- DOES:     revoke INSERT, UPDATE **and DELETE** on public.game_saves from
--           `authenticated`. After this, the client role can only READ.
-- DOES NOT: revoke SELECT. ONE reason, and it is DR/forensics — not a query
--           path:
--             · game_saves is the pre-cutover ARCHIVE of every beta character.
--               `tools/restore-census.mjs` classifies it as retained player
--               data, and a read grant is how a support path or a player-facing
--               data export reads a row back without minting a service-role
--               call for it. Nothing in the running game selects from it.
--
--           ⚠ CORRECTION (Security review, 2026-09-07). The first revision of
--           this header also justified keeping SELECT with:
--
--             "2026-08-08-leaderboards.sql reads `from public.game_saves gs`
--              inside a SECURITY DEFINER body"
--
--           THAT IS FALSE OF THE LIVE DATABASE, and it was load-bearing enough
--           to be worth naming rather than quietly deleting. What is true:
--             · the string does appear in 2026-08-08-leaderboards.sql:145 — but
--               that is the ORIGINAL `leaderboard_ranked` matview body, which
--               2026-08-18-leaderboard-server-source.sql DROPS and rebuilds over
--               `player_state` + `player_skills` precisely BECAUSE the snapshot
--               blob was client-authored. That file's §6(a) reads pg_depend and
--               REFUSES to install unless leaderboard_ranked has zero dependency
--               on game_saves (with a positive control that it does depend on
--               player_state), so the property is asserted, not assumed.
--             · live `hr_leaderboard__ungated` contains zero `game_saves`
--               references; it reads leaderboard_ranked.
--             · a SECURITY DEFINER body would be UNAFFECTED by a role grant
--               anyway, so even if it were true it could never have been a
--               reason to keep a grant on `authenticated`. The sentence argued
--               for the right outcome with an irrelevant fact, which is the
--               kind of reasoning that survives into a decision it cannot
--               support.
--           2026-08-08-leaderboards.sql MUST NOT be re-run against a live
--           database for unrelated reasons already recorded in
--           tests/schema-apply-order.json (it re-opens the F5 matview dump and
--           overwrites the A9 rate-gate wrapper). Nothing depends on this
--           table's SELECT grant except the DR posture above.
-- DOES NOT: drop the table, delete a row, or touch RLS policies. The rows are
--           real players' pre-cutover progress. The table DROP is a later
--           slice, after `node tools/restore-census.mjs` reclassifies it and
--           the retention question is answered by a human.
-- DOES NOT: touch `service_role` (the restore path reads and writes through it).
--
-- ── WHY DELETE IS NOW TAKEN TOO (Security GO-WITH-CHANGES, 2026-09-07) ─────
-- The first revision left DELETE in place and flagged it MEASURED-OPEN, on the
-- reasoning that taking it is a data-RETENTION decision belonging with the
-- table-drop slice. Reviewed, that had it backwards:
--   · Supabase's default privileges hand `authenticated` DELETE on a public
--     table, so a signed-in browser can hand-roll a PostgREST call and delete
--     its OWN archived pre-cutover save (RLS scopes it to auth.uid()).
--   · That single archived row (the 2026-08-23 archive) is THE ONLY FORENSIC
--     COPY of that account's pre-cutover state — including any FORGED state,
--     which is exactly what a beta blob written by the client can contain.
--   · The restore-census ALREADY classifies restoring these rows as FORBIDDEN.
--     So the row can never be given back to a player: its entire remaining
--     value is as EVIDENCE. Leaving DELETE reachable therefore does not
--     preserve a player capability anyone wants — it preserves the ability to
--     erase the evidence of one's own forgery, on request, with no ledger row.
--   · Retention is unaffected in the direction that matters. Revoking DELETE
--     REMOVES a way to destroy retained data; it adds no obligation and blocks
--     no future decision. The drop slice can still drop the table (that runs as
--     the owner, not as `authenticated`), and the rollback line below restores
--     the grant in one statement.
-- Deleting is the one operation on this table that is IRREVERSIBLE, and it was
-- the only one still reachable from a browser. It is now closed. §4 asserts all
-- three writes are absent and SELECT is present, by executing
-- `has_table_privilege` rather than by reading a grant catalogue alone.
--
-- ── FOR THE CENSUS (do NOT change it in this commit) ───────────────────────
-- `tools/restore-census.mjs` keeps its current classification for game_saves
-- now. At the DROP slice, its class becomes `retire`. Recording the intent here
-- rather than pre-applying it keeps the census describing the database that
-- actually exists, which is the only property that makes it worth reading.
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
--   grant insert, update, delete on public.game_saves to authenticated;
-- ⚠ All three, because all three are now taken. Pasting only the b-revision's
-- `grant insert, update` would silently leave DELETE revoked and report success.
-- Effect: the pre-change grant set is restored immediately. No data can be lost
-- either way, in either direction.
-- ============================================================================

-- ── 1. Revoke the client's write capability, INCLUDING DELETE ─────────────
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
    revoke insert, update, delete on public.game_saves from authenticated;
    raise notice 'game-saves-revoke: insert+update+delete revoked from authenticated';
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
--
--     MUTATION-PROVED 2026-09-07, and the proof needed the right TARGET. The
--     repo replay (tests/schema-drift.mjs) runs on a cluster with no
--     `authenticated` role, so §4 early-returns there and asserts nothing — a
--     green replay is NOT evidence this block works. It was therefore exercised
--     on a scratch PGlite cluster built WITH `anon` and `authenticated` and with
--     Supabase's default table privileges granted, where the file applies
--     cleanly and a second apply is a no-op.
--
--     ⚠ MUTATING THE DATABASE PROVES NOTHING HERE, and that is worth recording
--     so the next reviewer does not repeat it: granting a write back and
--     re-running the file does NOT raise, because §1/§2 REVOKE it again before
--     §4 looks. The file is self-healing, which is the desired property and
--     also a blindfold. The mutation target is the FILE. Breaking each revoke
--     in turn, all five bite:
--       · §1 stops revoking DELETE → §4(a) DELETE  raises (grant rows=1)
--       · §1 stops revoking UPDATE → §4(a) UPDATE  raises
--       · §1 stops revoking INSERT → §4(a) INSERT  raises
--       · §2 stops revoking anon   → §4(c)         raises ("anon holds 3")
--       · §1 over-reaches to SELECT→ §4(b)         raises (DR path broken)
--     RLS off → §4(d) raises.
--
--     ⚠ AND THE SECOND READING EARNS ITS KEEP. Granting DELETE to a new role and
--     making `authenticated` a MEMBER of it leaves information_schema.
--     role_table_grants EMPTY for `authenticated` while the capability is fully
--     live. Measured: grant rows=0, has_table_privilege=t → §4(a) still raises.
--     A catalogue-only check would have passed that database. This is why every
--     privilege below is asserted twice.
-- ============================================================================
do $$
declare
  v_ins   int;
  v_upd   int;
  v_del   int;
  v_sel   int;
  v_anon  int;
  v_rls   boolean;
  v_p_ins boolean;
  v_p_upd boolean;
  v_p_del boolean;
  v_p_sel boolean;
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
  select count(*) into v_del  from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'authenticated' and privilege_type = 'DELETE';
  select count(*) into v_sel  from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'authenticated' and privilege_type = 'SELECT';

  /* THE SECOND, INDEPENDENT READING. role_table_grants lists grants made
     DIRECTLY to the named grantee; has_table_privilege answers the question the
     client actually poses at runtime — "may this role do it", following role
     membership and PUBLIC. They can disagree, and when they do it is precisely
     the case that matters: a privilege inherited from PUBLIC or from a role
     `authenticated` is a member of leaves the catalogue empty while the
     capability is still live. Asserting both is what makes §4 a self-check
     rather than a restatement of the REVOKE above. */
  v_p_ins := has_table_privilege('authenticated', 'public.game_saves', 'INSERT');
  v_p_upd := has_table_privilege('authenticated', 'public.game_saves', 'UPDATE');
  v_p_del := has_table_privilege('authenticated', 'public.game_saves', 'DELETE');
  v_p_sel := has_table_privilege('authenticated', 'public.game_saves', 'SELECT');
  select count(*) into v_anon from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'game_saves'
     and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'game_saves';

  -- (a) THE POINT OF THE FILE: NO client write capability remains — insert,
  --     update AND delete, asserted in BOTH readings. DELETE is in this list as
  --     of the Security GO-WITH-CHANGES: the archived row is the only forensic
  --     copy of pre-cutover state the census already forbids restoring, so a
  --     self-delete destroys evidence and returns nothing to the player.
  if v_ins <> 0 or v_p_ins then
    raise exception 'game-saves-revoke §4(a): authenticated can still INSERT into game_saves '
      '(grant rows=%, has_table_privilege=%)', v_ins, v_p_ins;
  end if;
  if v_upd <> 0 or v_p_upd then
    raise exception 'game-saves-revoke §4(a): authenticated can still UPDATE game_saves '
      '(grant rows=%, has_table_privilege=%)', v_upd, v_p_upd;
  end if;
  if v_del <> 0 or v_p_del then
    raise exception 'game-saves-revoke §4(a): authenticated can still DELETE from game_saves '
      '(grant rows=%, has_table_privilege=%). That row is the only forensic copy of this '
      'account''s pre-cutover state and the restore-census already forbids restoring it, so the '
      'only thing a self-delete can accomplish is erasing evidence.', v_del, v_p_del;
  end if;

  -- (b) SELECT IS DELIBERATELY KEPT — DR/forensics only, not a query path. If a
  --     future edit takes it too, this fails loudly rather than quietly breaking
  --     the restore read path. Both readings again: exactly one direct grant,
  --     and the capability genuinely present.
  if v_sel <> 1 then
    raise exception 'game-saves-revoke §4(b): authenticated SELECT on game_saves is % (expected exactly 1). '
      'This file revokes WRITE only — the archive stays readable for the DR/forensic posture.', v_sel;
  end if;
  if not v_p_sel then
    raise exception 'game-saves-revoke §4(b): authenticated cannot SELECT game_saves — the DR/forensic '
      'read path is broken even though a grant row exists';
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

  raise notice 'game-saves-revoke §4: OK — authenticated has SELECT only (no insert/update/delete, '
    'confirmed by grant catalogue AND has_table_privilege), anon has no writes, RLS on';
end $$;
