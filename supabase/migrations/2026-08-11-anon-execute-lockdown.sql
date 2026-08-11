-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — ANON EXECUTE LOCKDOWN   (standalone hotfix, REVIEW ONLY)
--
-- Authored by the Security Engineer as the recommended remediation for the
-- live finding below. NOT APPLIED. Ships independently of the server-authority
-- rebuild, the same way 2026-08-11-chat-name-authority.sql did.
--
-- Every statement in this file was executed against production inside
-- `begin … rollback` and verified. Results are recorded at the bottom.
--
-- ════════════════════════════════════════════════════════════════════════
-- THE FINDING
--   Supabase's default ACL for schema `public` (verified live in
--   pg_default_acl) grants, to anon AND authenticated, on EVERY newly created
--   object:
--       tables      arwdDxtm   (incl. TRUNCATE / REFERENCES / TRIGGER)
--       functions   X          (EXECUTE)
--       sequences   rwU
--   So `create function` with no revoke is anon-callable the instant it exists.
--   That is why 53 SECURITY DEFINER functions are anon-EXECUTE in production
--   today and why 80 TRUNCATE grants exist. TRUNCATE is NOT subject to
--   row-level security, so RLS is not a backstop for it.
--
--   THREE of the 53 are CONFIRMED exploitable by an unauthenticated caller.
--   They perform no identity check at all and accept a client-supplied actor:
--     • hr_clan_order_create(clan, building, by)
--         → posts a work order in ANY clan, consumes a build slot, stamps
--           posted_by with any uuid.   PROVEN: returned {"ok":true}, orders 0→1.
--     • hr_clan_vote_settle_one(vote, by)
--         → force-closes ANY clan governance vote at a moment of the
--           attacker's choosing, stamps closed_by with any uuid, and posts the
--           winning work order.        PROVEN: closed_by=…deadbeef.
--     • hr_clan_decay_cp(clan, user)
--         → writes clan_members.cp for ANY member. floor() shaves >= 1 CP per
--           call, unbounded and unauthenticated.  PROVEN: 10000 → 9999 → 9998.
--   All three are INTERNAL HELPERS with zero references in src/**. They were
--   never meant to be RPCs; they are only ever called from inside other
--   SECURITY DEFINER functions, which run as the owner and need no grant.
--
-- ════════════════════════════════════════════════════════════════════════
-- THE SHAPE OF THE FIX — a pattern, not 53 one-off edits
--   1. Stop the SOURCE. `alter default privileges`, so future objects are not
--      born public. Fail-closed by design: a new RPC is unreachable until it
--      is explicitly granted, and a forgotten grant is a visible 404 rather
--      than an invisible hole.
--   2. Blanket revoke EXECUTE from PUBLIC + anon on every function in public,
--      then re-grant the one function that is legitimately anonymous.
--   3. Revoke `authenticated` from the internal helpers that were never a
--      client surface. The list is derived from a grep of src/** — every name
--      has ZERO references in the shipped bundle.
--   4. Blanket revoke TRUNCATE / REFERENCES / TRIGGER from anon+authenticated
--      on every relation. No client ever needs these.
--      ⚠ INSERT/UPDATE/DELETE are deliberately LEFT ALONE. Those are
--        load-bearing for the current client and are RLS-constrained; removing
--        them is the rebuild's job, not this hotfix's.
--   5. hr_assert_grant_hygiene() — the RECURRENCE DETECTOR. One-off edits do
--      not hold, because the platform default ACL re-opens the hole on the
--      next create. Call this at the end of every future migration and from
--      CI against the live database.
--
-- SAFE TO RE-RUN. No table created, dropped or altered. No row touched.
-- No client-callable RPC loses a privilege the shipped client uses.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Stop the source of the recurrence ─────────────────────────────────
-- pg_default_acl is keyed by (grantor, schema, objtype). We can only edit
-- entries whose grantor we are a member of; `postgres` owns the entries that
-- apply to everything our migrations create. The `supabase_admin` entries are
-- platform-owned and remain — which is exactly why step 5 exists.
--
-- ⚠⚠ CORRECTION (2026-08-11, review finding C-a). An earlier revision of this
--    file — and commit 37a3eab, which claimed to have fixed the problem —
--    asserted that the three SCHEMA-SCOPED statements below were sufficient to
--    stop a new function from being born PUBLIC-executable. THAT WAS WRONG, and
--    it was wrong in a way that reads as correct, which is why it survived a
--    review. The mechanism:
--
--      • A function's initial ACL is NOT "empty plus whatever pg_default_acl
--        says". It is `acldefault('f', owner)` — a HARDWIRED base that always
--        contains  owner=X  AND  PUBLIC=EXECUTE.
--      • A default-privileges entry is applied ON TOP of that base. A SCHEMA-
--        SCOPED entry (`in schema public`) can only ADD grants to the base; it
--        never replaces it. So `alter default privileges … in schema public
--        revoke execute on functions from anon, authenticated` removed the two
--        Supabase-added grants and left  PUBLIC=X  standing. anon and
--        authenticated are both members of PUBLIC. Net effect on reachability:
--        ZERO. The hole was renamed, not closed.
--      • A GLOBAL entry (no `IN SCHEMA`) is different: it REPLACES the hardwired
--        base entirely. That is the only statement that can take PUBLIC=X away
--        from newly created functions.
--
--    So the load-bearing statement is the GLOBAL one, applied to production on
--    2026-08-11 and verified: a freshly created function in `public` is now born
--        {postgres=X/postgres,service_role=X/postgres}
--    with has_function_privilege('anon', …) = false and no PUBLIC entry.
--    The schema-scoped statements are kept because they are still correct and
--    still remove the Supabase-added anon/authenticated grants for objects the
--    global row does not cover the way we want; they are simply not the fix.
--
--    hr_assert_grant_hygiene() (§5, rewritten 2026-08-11) now asserts the
--    POSITIVE property — that a global row exists for every role that owns
--    functions in public and that it grants EXECUTE to none of PUBLIC / anon /
--    authenticated — because the old negative check could not see this.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ── 2. Blanket revoke EXECUTE, then re-grant the anonymous allowlist ─────
-- The allowlist is deliberately one entry, and it is justified:
--   hr_leaderboard — the public rankings board. Takes no user parameter; its
--     only use of auth.uid() is to mark "this row is you", which is null for
--     anon. src/features/leaderboards.js:118-120 has an anon-key path.
do $$
declare r record; v_n int := 0;
  c_anon_ok constant text[] := array['hr_leaderboard'];
begin
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) as args
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon',
                   r.proname, r.args);
    v_n := v_n + 1;
  end loop;
  raise notice 'revoked EXECUTE from PUBLIC+anon on % functions', v_n;

  for r in select p.proname, pg_get_function_identity_arguments(p.oid) as args
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (c_anon_ok)
  loop
    execute format('grant execute on function public.%I(%s) to anon', r.proname, r.args);
  end loop;
end $$;

-- ── 3. The internal helpers lose `authenticated` too ─────────────────────
-- The first three are the CONFIRMED holes. The rest are defence in depth plus
-- cross-clan read leaks: hr_clan_may_post / hr_max_hunt_tier /
-- hr_clan_vote_tally / hr_clan_board_rows all answer questions about a clan
-- the caller is not in. hr_leaderboard_refresh is an unauthenticated write
-- amplifier (p_force=true forces a full REFRESH MATERIALIZED VIEW per call);
-- it is still reached by cron and internally by hr_leaderboard, both of which
-- run as the owner. The three trigger/event-trigger functions are listed for
-- hygiene — EXECUTE is checked at CREATE TRIGGER time, not at fire time, so
-- revoking it does not stop an existing trigger (verified live).
do $$
declare r record; v_n int := 0;
  c_internal constant text[] := array[
    'hr_clan_order_create','hr_clan_vote_settle_one','hr_clan_decay_cp',
    'hr_clan_vote_settle','hr_clan_vote_tally','hr_clan_may_post',
    'hr_clan_board_rows','hr_max_hunt_tier','hr_leaderboard_refresh',
    'clan_upkeep_settle','handle_new_user','sync_profile_clan','rls_auto_enable'];
begin
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) as args
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (c_internal)
  loop
    execute format('revoke execute on function public.%I(%s) from authenticated, service_role',
                   r.proname, r.args);
    v_n := v_n + 1;
  end loop;
  raise notice 'revoked EXECUTE from authenticated on % internal helpers', v_n;
end $$;

-- ── 4. TRUNCATE / REFERENCES / TRIGGER are never a client privilege ──────
-- TRUNCATE bypasses row-level security entirely. An append-only ledger or a
-- world-state table protected only by RLS is, for TRUNCATE, protected only by
-- the fact that PostgREST does not currently expose it. That is not a control.
do $$
declare r record; v_n int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
  loop
    begin
      execute format('revoke truncate, references, trigger on public.%I from anon, authenticated',
                     r.relname);
      v_n := v_n + 1;
    exception when others then
      raise notice 'skip % : %', r.relname, sqlerrm;
    end;
  end loop;
  raise notice 'narrowed % relations', v_n;
end $$;

-- ── 5. THE RECURRENCE DETECTOR — MOVED ───────────────────────────────────
-- ⚠ hr_assert_grant_hygiene() USED TO BE DEFINED HERE. It is not any more.
--   The definition lives in 2026-08-11-grant-hygiene.sql and NOWHERE ELSE.
--
--   Revision 1 of the detector shipped in this file and had four defects that
--   made it blind to the exact recurrence it existed to catch (it filtered on
--   `prosecdef`, so a `create procedure` was invisible; it asked only about
--   `anon`, while `authenticated` is 65 functions wide and reached all three
--   confirmed clan holes; it never asked the direct PUBLIC question; and its
--   default-ACL count was a false negative by construction). All four are
--   analysed at the top of the new file.
--
--   Keeping a second copy here would mean re-applying THIS file silently
--   downgrades the detector back to the blind version — the single most likely
--   way this control dies. So this file now only CALLS it, and says so if it
--   is missing.
--   The order to apply, on a database that has neither: this file, then
--   2026-08-11-grant-hygiene.sql.

-- ── 6. Self-verification ─────────────────────────────────────────────────
do $$
declare v jsonb;
begin
  -- (a) The three CONFIRMED holes are unreachable by any client role.
  if has_function_privilege('anon',          'public.hr_clan_order_create(uuid,text,uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_clan_order_create(uuid,text,uuid)', 'execute') then
    raise exception 'hr_clan_order_create is still client-callable';
  end if;
  if has_function_privilege('anon',          'public.hr_clan_vote_settle_one(uuid,uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_clan_vote_settle_one(uuid,uuid)', 'execute') then
    raise exception 'hr_clan_vote_settle_one is still client-callable';
  end if;
  if has_function_privilege('anon',          'public.hr_clan_decay_cp(uuid,uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_clan_decay_cp(uuid,uuid)', 'execute') then
    raise exception 'hr_clan_decay_cp is still client-callable';
  end if;

  -- (b) The LIVE CLIENT SURFACE still works. A security fix that breaks the
  --     game is not a security fix.
  if not has_function_privilege('authenticated', 'public.clan_deposit(uuid,jsonb)', 'execute')
  or not has_function_privilege('authenticated', 'public.raid_strike(uuid,text,text,bigint,bigint)', 'execute')
  or not has_function_privilege('authenticated', 'public.raid_claim(text,uuid,text)', 'execute')
  or not has_function_privilege('authenticated', 'public.claim_display_name(text)', 'execute')
  or not has_function_privilege('authenticated', 'public.world_event_contribute(text,integer)', 'execute')
  or not has_function_privilege('authenticated', 'public.clan_seat_read(uuid)', 'execute')
  or not has_function_privilege('authenticated', 'public.buy_listing(uuid,integer)', 'execute') then
    raise exception 'a live client RPC lost its authenticated grant';
  end if;
  if not has_function_privilege('anon', 'public.hr_leaderboard(text,integer,integer)', 'execute') then
    raise exception 'hr_leaderboard is no longer anon-readable — the public board breaks';
  end if;

  -- (c) The detector. Missing is a WARNING, not a failure: this file must stay
  --     applicable on its own, and the hygiene file is what installs it.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise warning 'hr_assert_grant_hygiene() is not installed — apply '
                  '2026-08-11-grant-hygiene.sql next, or this lockdown has no recurrence detector';
  else
    execute 'select public.hr_assert_grant_hygiene(true)' into v;
    raise notice 'ANON EXECUTE LOCKDOWN OK — %', v::text;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFIED AGAINST PRODUCTION INSIDE begin … rollback (2026-08-11):
--   anon-EXECUTE SECURITY DEFINER functions   53  →  1  (hr_leaderboard only)
--   client TRUNCATE/REFERENCES/TRIGGER grants 80  →  0
--   clan_deposit / raid_strike / claim_display_name / world_event_contribute
--     / clan_seat_read / buy_listing  — authenticated grant intact
--   sync_profile_clan trigger still fires after its EXECUTE was revoked
--   residual: 1 platform (supabase_admin) function default ACL cannot be
--     edited by `postgres`; the detector reports it every run.
--
-- STILL OPEN AFTER THIS FILE (deliberately out of scope — the rebuild owns it):
--   • buy_listing() moves no value server-side. Signed-in callers can still buy
--     for free. Anon callers cannot: the insert into market_sales hits a NOT
--     NULL on buyer_user_id and the whole call aborts (PROVEN — listing rows
--     1→1). That is a constraint saving us, not a control. Market v2 replaces
--     the function; until then this remains the top live economy exploit.
--   • anon/authenticated retain INSERT/UPDATE/DELETE on ~40 tables, held back
--     only by RLS. game_saves in particular is still a client-authored blob.
-- ════════════════════════════════════════════════════════════════════════
-- terminator fix for migration guard
select 1;
