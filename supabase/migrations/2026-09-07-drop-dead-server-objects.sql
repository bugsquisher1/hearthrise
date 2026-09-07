-- ============================================================================
-- 2026-09-07-drop-dead-server-objects.sql — DELETE ELEVEN DEAD SERVER OBJECTS.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. The Coordinator applies after Security GO.
--
-- Cleanup program slice 3, SERVER half. This file REMOVES code. It adds no
-- column, no policy, no grant, and writes no player row. Every object below was
-- ruled DEAD by the game designer (read-only ruling, 2026-09-07) and verified
-- dead against production nezapsylztqbbwuwembx by read-only catalogue queries
-- on the same day (evidence inline, per object).
--
-- WHY DELETE RATHER THAN LEAVE. Each of these is a SECURITY DEFINER function
-- that still exists on a live database. `revoke`d today is not `revoke`d after
-- the next sweep regresses; a body that nothing calls is a body nobody reads,
-- and clan_withdraw()/clan_upkeep_pay() move CLAN GOLD. The cheapest permanent
-- revocation of a dead privileged body is to not have it.
--
-- ── THE ELEVEN, WITH THE EXACT LIVE SIGNATURE EACH DROP TARGETS ─────────────
-- Signatures read from live pg_proc 2026-09-07 (oid::regprocedure). Every one
-- has EXACTLY ONE overload; there is no second arity to miss. A signature that
-- was not verified live is not dropped by this file.
--
--   GROUP A — v1 clan shapes, superseded IN FULL by docs/design/clan-overhaul.md
--   v2. CLAN_LAUNCHED=false, so no player has a path through any of them and no
--   player loses one. All six originate in 2026-08-08-clan-seat.sql.
--     1. clan_withdraw(uuid, bigint)                          [also replaced by 2026-08-09-clan-governance.sql]
--     2. clan_withdraw_cancel(uuid)
--     3. clan_withdraw_settle(uuid)
--     4. clan_upkeep_pay(uuid)                                [also replaced by 2026-08-11-authenticated-surface-lockdown.sql]
--     5. clan_set_role(uuid, uuid, text, text)                [also replaced by 2026-08-09-clan-governance.sql]
--     6. clan_claim_leadership(uuid)
--
--   GROUP B — the cutover import tool. The cutover is COMPLETE and the beta was
--   wiped (CLAUDE.md §1). There is no blob left to import and there will never
--   be another; keeping a SECURITY DEFINER function whose whole job is to write
--   a player's inventory/progress/skills from a caller-supplied jsonb is the
--   single largest dead privilege on the database.
--     7. hr_import_apply(uuid, integer, jsonb, jsonb, boolean)
--        [origin 2026-08-17-cutover-import.sql; last replaced by
--         2026-09-09-import-apply-slot-entitlement.sql; programmatically
--         patched by 2026-09-04-auto-eat-at-creation.sql and
--         2026-09-06-bank-cap-tracks-rungs.sql. This file sits AFTER all four
--         in tests/schema-apply-order.json, so each of them still runs, still
--         self-checks, and only then is the function removed.]
--
--   GROUP C — four ORPHANED market trigger bodies. `returns trigger`, but NO
--   pg_trigger row anywhere in the database references any of them (verified
--   live 2026-09-07: the only non-internal triggers on market tables are
--   trg_market_offer_cap, trg_market_offer_stamp, trg_market_offer_immutable
--   and trg_market_listing_immutable, none of which point at these four).
--   2026-08-17-market-v2.sql:386 does `drop table ... cascade` on
--   market_listings/market_sales, which took the triggers with it and never
--   re-created them; the bodies were left behind.
--     8.  hr_market_listing_stamp()          [origin 2026-08-11-live-market-rls.sql]
--     9.  hr_market_listing_cap()            [origin 2026-08-12-market-offers-authority.sql]
--     10. hr_market_listing_frozen()         [origin 2026-08-11-live-market-rls.sql]
--     11. hr_market_sale_collect_only()      [origin 2026-08-11-live-market-rls.sql]
--
-- ── WHERE GROUP C's FOUR INVARIANTS LIVE NOW (this is the load-bearing claim,
--    and §4(d) EXECUTES it rather than asserting it in prose) ────────────────
--   · stamp   (posted_at/expires_at/seller_name are server-authored, never
--             caller values) -> 2026-08-17-market-v2.sql L845-851: hr_market_list
--             inserts seller_name = hr_display_name_of(v_uid) and
--             expires_at = now() + make_interval(hours => v_cfg.listing_ttl_h).
--   · cap     (a seller may not hold unbounded open listings)
--             -> 2026-08-17-market-v2.sql L818-828: the bounded `limit
--             v_cfg.max_listings` probe then hr_reject('too_many_listings').
--   · frozen  (price/seller identity cannot change after insert)
--             -> 2026-08-17-market-v2.sql L448-469: hr_market_listing_immutable()
--             + the ARMED trigger trg_market_listing_immutable on
--             market_listings (before update, for each row).
--   · collect-only (a sale row's proceeds may be collected but not re-written)
--             -> STRUCTURAL: market_sales.collected DOES NOT EXIST. market-v2
--             replaced the collect flag with direct settlement, so there is no
--             column left to guard. Verified live 2026-09-07: absent.
--
-- ── NOT DROPPED, DELIBERATELY ──────────────────────────────────────────────
-- The clan_* TABLES (clan_withdrawals, clan_ledger, clan_board, ...) stay. This
-- file removes behaviour, not storage; table shape is a separate slice and
-- dropping a table is irreversible in a way a function body is not.
--
-- ── SAFETY / BLAST RADIUS ──────────────────────────────────────────────────
-- Verified live 2026-09-07, read-only, before authoring:
--   · pg_trigger:            ZERO rows bind any of the eleven. (§1 drops any
--                            that appear anyway; §4 asserts none remain.)
--   · hr_client_rpc_baseline: ZERO rows for any of the eleven. Nothing to
--                            delete; §4(b) asserts it stays zero. (Had a row
--                            existed, leaving it would surface forever as a
--                            `baseline_rows_no_longer_live` hygiene finding.)
--   · pg_get_functiondef scan over every public function: ZERO other body
--                            mentions any of the eleven names. Nothing calls
--                            them. (§4(e) re-executes this scan.)
--   · proacl:                none of the eleven is executable by anon or
--                            authenticated today. FIVE carry a service_role
--                            EXECUTE that this drop removes for good:
--                            clan_withdraw, clan_withdraw_cancel,
--                            clan_withdraw_settle, clan_set_role,
--                            clan_claim_leadership. clan_upkeep_pay and the
--                            five hr_* are postgres-only (owner) already.
--                            Re-verified live 2026-09-07, read-only:
--                              select p.proname,
--                                     pg_get_function_identity_arguments(p.oid),
--                                     p.proacl
--                                from pg_proc p
--                                join pg_namespace n on n.oid = p.pronamespace
--                               where n.nspname = 'public'
--                                 and p.proname = any(<the eleven>);
--   · hr_assert_grant_hygiene(false) baseline BEFORE the change: every bucket
--                            empty except platform_schema_defacls_open =
--                            ["supabase_admin:public"], which is a Supabase
--                            platform default and pre-exists this file. §4(c)
--                            asserts exactly that shape AFTER.
-- No lock is taken on any player table. `drop function` takes an ACCESS
-- EXCLUSIVE lock on the pg_proc row only. Not destructive to data.
--
-- ── REVERT (exact) ─────────────────────────────────────────────────────────
-- There is no `undrop function`. To restore, re-run the `create or replace
-- function` bodies from their original migrations, in this order — each file's
-- body is the authoritative text and none of them has been hand-edited since:
--   1-6 clan_*                    supabase/migrations/2026-08-08-clan-seat.sql
--       then clan_withdraw + clan_set_role from
--                                 supabase/migrations/2026-08-09-clan-governance.sql
--       then clan_upkeep_pay from
--                                 supabase/migrations/2026-08-11-authenticated-surface-lockdown.sql
--   7   hr_import_apply           supabase/migrations/2026-08-17-cutover-import.sql
--       then                      supabase/migrations/2026-09-09-import-apply-slot-entitlement.sql
--       then the programmatic patches in
--                                 supabase/migrations/2026-09-04-auto-eat-at-creation.sql
--                                 supabase/migrations/2026-09-06-bank-cap-tracks-rungs.sql
--   8,10,11 hr_market_listing_stamp / _frozen / hr_market_sale_collect_only
--                                 supabase/migrations/2026-08-11-live-market-rls.sql
--   9   hr_market_listing_cap     supabase/migrations/2026-08-12-market-offers-authority.sql
-- Re-creating a body does NOT re-create a trigger; none of Group C had one, so
-- there is nothing further to re-arm. Restoring Group A/B also restores their
-- original grants, which is why revert is a deliberate act and not a rollback
-- script pasted in a hurry.
--
-- ── IDEMPOTENCY ────────────────────────────────────────────────────────────
-- Every statement is `if exists`. A second apply is a byte-identical no-op and
-- the self-check passes unchanged (it asserts ABSENCE, which is stable).
--
-- ── FOLLOW-UPS THIS FILE CREATES (Coordinator, after apply) ────────────────
--   · tests/live-hash-drift.baseline.json tracks clan_upkeep_pay(p_clan_id uuid).
--     Agents never edit that file. After apply the entry must be removed by the
--     Coordinator via `node tests/live-hash-drift.mjs --live --write`.
--   · THE TEST HALF IS DONE IN THIS SAME COMMIT, corrected from the review
--     draft, which mis-stated both the blast radius and the CI exposure:
--       tests/cutover-import.mjs + tools/cutover-import.mjs — DELETED. The guard
--         drove the real hr_import_apply on a FULL chain replay, so it goes red
--         the moment this file lands. It WAS a CI step (imported and invoked by
--         tests/run-smoke.mjs, which .github/workflows/smoke.yml runs) — the
--         review draft's "none is a step in smoke.yml" was wrong, it only
--         checked the yml for a direct `node tests/cutover-import.mjs` line.
--         Its registration in run-smoke.mjs is replaced by a named comment so
--         it reads as deliberately retired, not silently unregistered.
--       tests/auto-eat-at-creation.mjs — arm A9 (the empty-plan import dry run)
--         and the `import_verify_unreconciled` mutation that only A9 detected
--         are REMOVED. Full-chain replay, so it too would go red. The property
--         worth keeping — the bootstrap writes exactly one progress row, leaves
--         version at 0 and journals one ledger row — is A2b/A2c and is untouched.
--       tests/client-write-sweep-4.mjs:693-720 — NOT TOUCHED, and the review
--         draft was wrong to list it. It boots with `upTo: MIG` where MIG is
--         2026-08-16-client-write-grant-sweep-4.sql, so THIS FILE NEVER APPLIES
--         in that replay and all six clan_* bodies still exist there. It is an
--         as-of-batch-4 assertion about grants, not a claim that the RPCs are
--         live today. Deleting the six drives would in fact BREAK it: C4
--         COVERAGE requires every writer named in that migration's c_writers to
--         be driven, and clan_withdraw / _cancel / _settle are the only drivers
--         of clan_withdrawals, one of the seventeen swept tables.
--     tests/market-offers-guard.mjs greps MIGRATION FILE TEXT, which this file
--     does not edit, so it is unaffected.
-- ============================================================================

-- ── 1. TRIGGERS. Expect none; drop defensively, then assert. ───────────────
-- A trigger bound to a body being dropped would make the drop fail (or, with
-- CASCADE, silently disarm an enforcement point). We use neither CASCADE nor
-- hope: unbind explicitly, and §4(a2) proves the expectation was right.
do $$
declare r record; v_n int := 0;
begin
  for r in
    select t.tgname, t.tgrelid::regclass::text as tbl, p.proname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where not t.tgisinternal
       and p.proname in ('clan_withdraw','clan_withdraw_cancel','clan_withdraw_settle',
                         'clan_upkeep_pay','clan_set_role','clan_claim_leadership',
                         'hr_import_apply','hr_market_listing_stamp','hr_market_listing_cap',
                         'hr_market_listing_frozen','hr_market_sale_collect_only')
  loop
    execute format('drop trigger if exists %I on %s', r.tgname, r.tbl);
    v_n := v_n + 1;
    raise warning 'drop-dead: UNEXPECTED trigger % on % was bound to % — dropped', r.tgname, r.tbl, r.proname;
  end loop;
  if v_n = 0 then
    raise notice 'drop-dead: no trigger bound to any of the eleven (as measured 2026-09-07)';
  end if;
end $$;

-- ── 2. GROUP A — v1 clan shapes (clan-overhaul.md v2 supersedes; unlaunched) ─
drop function if exists public.clan_withdraw(uuid, bigint);
drop function if exists public.clan_withdraw_cancel(uuid);
drop function if exists public.clan_withdraw_settle(uuid);
drop function if exists public.clan_upkeep_pay(uuid);
drop function if exists public.clan_set_role(uuid, uuid, text, text);
drop function if exists public.clan_claim_leadership(uuid);

-- ── 3. GROUP B — the cutover import tool (cutover complete, beta wiped) ─────
drop function if exists public.hr_import_apply(uuid, integer, jsonb, jsonb, boolean);

-- ── 4. GROUP C — orphaned market trigger bodies (no pg_trigger references) ──
drop function if exists public.hr_market_listing_stamp();
drop function if exists public.hr_market_listing_cap();
drop function if exists public.hr_market_listing_frozen();
drop function if exists public.hr_market_sale_collect_only();

-- ── §4 SELF-CHECK — the commit gate. Properties are EXECUTED, not asserted. ─
do $$
declare
  c_dead constant text[] := array[
    'clan_withdraw','clan_withdraw_cancel','clan_withdraw_settle','clan_upkeep_pay',
    'clan_set_role','clan_claim_leadership','hr_import_apply','hr_market_listing_stamp',
    'hr_market_listing_cap','hr_market_listing_frozen','hr_market_sale_collect_only'];
  v_left     text;
  v_n        int;
  v_hyg      jsonb;
  v_bad      text;
  v_body     text;
  v_tgena    "char";
begin
  -- (a) NONE of the eleven remains in pg_proc, in ANY schema and at ANY arity.
  --     Schema-wide on purpose: a copy parked in another schema is the same
  --     privileged body with a different search_path in front of it.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_left
    from pg_proc p
   where p.proname = any (c_dead);
  if v_left is not null then
    raise exception 'SELF-CHECK (a) FAILED: dead function(s) still present: %', v_left;
  end if;

  -- (a2) and no trigger anywhere still names one of them (§1 should have found
  --      zero; this proves §1 was not a no-op that HID a bound trigger).
  select count(*) into v_n
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and p.proname = any (c_dead);
  if v_n > 0 then
    raise exception 'SELF-CHECK (a2) FAILED: % trigger(s) still bound to a dropped body', v_n;
  end if;

  -- (b) hr_client_rpc_baseline holds NO row for any of them. Measured zero
  --     before the change; a leftover row would show up forever afterwards as a
  --     `baseline_rows_no_longer_live` finding from the hygiene detector.
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    execute 'select count(*) from public.hr_client_rpc_baseline where proname = any($1)'
      into v_n using c_dead;
    if v_n > 0 then
      raise exception 'SELF-CHECK (b) FAILED: % hr_client_rpc_baseline row(s) name a dropped function', v_n;
    end if;
  else
    raise notice 'drop-dead: hr_client_rpc_baseline absent in this replay — (b) vacuous';
  end if;

  -- (c) grant hygiene is unchanged and still clean. Every bucket must be empty
  --     EXCEPT platform_schema_defacls_open, which is a Supabase platform
  --     default (supabase_admin:public) that pre-exists this file and is not
  --     ours to clear. Asserting "empty except that" rather than "no worse than
  --     before" means a regression cannot hide behind a vague comparison.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    execute 'select public.hr_assert_grant_hygiene(false)' into v_hyg;
    select string_agg(k || '=' || v::text, ' | ' order by k)
      into v_bad
      from jsonb_each(v_hyg) e(k, v)
     where k <> 'platform_schema_defacls_open'
       and jsonb_array_length(v) > 0;
    if v_bad is not null then
      raise exception 'SELF-CHECK (c) FAILED: grant hygiene findings: %', v_bad;
    end if;
  else
    raise notice 'drop-dead: hr_assert_grant_hygiene absent in this replay — (c) vacuous';
  end if;

  -- (d) THE CONTROL, and the reason this file is allowed to delete Group C:
  --     the four market invariants must still be enforced somewhere real.
  --     (a) would pass just as happily on a migration that deleted the
  --     enforcement along with the orphans.
  if to_regprocedure('public.hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)') is null then
    raise exception 'SELF-CHECK (d) FAILED: hr_market_list is GONE — the cap/stamp invariants have no home';
  end if;
  v_body := pg_get_functiondef('public.hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)'::regprocedure);
  if position('too_many_listings' in v_body) = 0 then
    raise exception 'SELF-CHECK (d.cap) FAILED: hr_market_list no longer rejects too_many_listings '
      '(that reject IS the open-listing cap hr_market_listing_cap() used to be)';
  end if;
  if position('listing_ttl_h' in v_body) = 0 then
    raise exception 'SELF-CHECK (d.stamp) FAILED: hr_market_list no longer stamps expires_at from '
      'listing_ttl_h (that stamp IS what hr_market_listing_stamp() used to do)';
  end if;
  select t.tgenabled into v_tgena
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and p.proname = 'hr_market_listing_immutable';
  if v_tgena is null then
    raise exception 'SELF-CHECK (d.frozen) FAILED: no trigger is bound to hr_market_listing_immutable() — '
      'the price/seller freeze that replaced hr_market_listing_frozen() is DISARMED';
  end if;
  if v_tgena <> 'O' then
    raise exception 'SELF-CHECK (d.frozen) FAILED: the hr_market_listing_immutable trigger exists but '
      'tgenabled = % (expected O = enabled)', v_tgena;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'market_sales' and column_name = 'collected') then
    raise exception 'SELF-CHECK (d.collect) FAILED: market_sales.collected EXISTS again — the '
      'collect-only invariant is structural only while that column does not exist, so '
      'hr_market_sale_collect_only() (or a replacement) would be needed';
  end if;

  -- (e) no surviving function body references a dropped name. A dangling call
  --     is a runtime 42883 on some future code path, not a compile error, so
  --     the only way to know is to read every body. Scope: FUNCTIONS AND
  --     PROCEDURES ('f','p' -- a procedure can `call` a dead name just as an
  --     unresolved 42883) across EVERY non-catalog schema, not just public:
  --     a trigger helper parked in a private schema is exactly where a
  --     dangling call hides. Aggregates/windows ('a','w') have no body to read
  --     and pg_get_functiondef errors on them, so they stay excluded.
  select string_agg(p.oid::regprocedure::text || ' -> ' || d.n, ', ')
    into v_bad
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    join unnest(c_dead) d(n) on pg_get_functiondef(p.oid) ~ ('\m' || d.n || '\M')
   where p.prokind in ('f', 'p')
     and ns.nspname not in ('pg_catalog', 'information_schema')
     and ns.nspname not like 'pg_toast%'
     and ns.nspname not like 'pg_temp%';
  if v_bad is not null then
    raise exception 'SELF-CHECK (e) FAILED: surviving body references a dropped function: %', v_bad;
  end if;

  raise notice 'drop-dead-server-objects OK: 11 dead bodies gone; market cap/stamp/freeze/collect '
    'invariants all still enforced; grant hygiene clean; no dangling reference';
end $$;
