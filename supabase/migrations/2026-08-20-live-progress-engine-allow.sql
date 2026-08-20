-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ENGINE CAPABILITY ALLOWLIST: three live-progress reads recorded
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion derivation: tools/derive-grant-hygiene.mjs (§2's body is EXTRACTED)
--   Graded by: tests/run-sql-tests.mjs PART 1f-ii (HR_GRANT_HYGIENE_CHAIN, link 6)
--   Preflight: node tools/derive-grant-hygiene.mjs --check (in tests/run-smoke.mjs)
--
-- ── THE PROBLEM, IN ONE PARAGRAPH ───────────────────────────────────────
-- The nightly grant-hygiene detector RAISES in production. Check (7) — the
-- hr_engine capability pin — reports:
--
--   engine_execute_outside_allowlist:
--     ["hr_bestiary_of(uuid,integer)", "hr_collection_of(uuid,integer)",
--      "hr_renown_of(uuid,integer)"]
--
-- All three grants are correct by design and were made by the migrations that
-- own those functions — 2026-08-20-bestiary.sql, 2026-08-21-collection.sql and
-- 2026-08-20-renown.sql, each of which revokes the read from every client role
-- and grants it to hr_engine only. What was NOT done, three times, was to
-- record them in the allowlist the detector reads — so the detector is doing
-- exactly its job and the fix is to make the reviewed intent explicit, in the
-- one place that expresses it.
--
-- ⚠ THIS IS THE DANGEROUS SHAPE, AND IT IS WORTH SAYING SO BEFORE THE FIX.
--   The pressure a raising detector creates is to make the detector stop
--   raising. There are three ways to do that and only one of them is a fix:
--     (a) revoke the three grants     — breaks every bestiary/collection/renown
--                                        read the engine performs on settle
--     (b) widen/delete check (7)      — deletes the control
--     (c) record the three entries, each with a justification that re-derives
--         the claim the list demands  — this file
--   §4 below therefore ships a MUTATION ARM: after installing, it grants
--   hr_engine EXECUTE on a throwaway probe and requires the detector to NAME
--   it. A detector that stopped firing would fail this migration. Coverage
--   gets STRICTER here, never looser.
--
-- ── THE CLAIM EACH ENTRY MAKES, RE-DERIVED ──────────────────────────────
-- 2026-08-11-grant-hygiene.sql states the bar in its own comment on
-- c_engine_allow: "Adding an entry is a CLAIM: read-only or self-validating,
-- and it accepts no target the caller is not already authorised for. Re-derive
-- that for the whole list every time it changes." So:
--
-- 1/2/3. hr_bestiary_of(uuid,integer), hr_collection_of(uuid,integer),
--        hr_renown_of(uuid,integer)
--    READ-ONLY: all three are declared `stable sql` — a single SELECT/aggregate
--    over player_progress for one (user, slot), no branch that writes and no
--    call to anything that does. `stable sql` is the strongest read-only shape
--    in this repo: there is no PL/pgSQL body through which a future edit could
--    smuggle a write without the language keyword changing.
--    SELF-VALIDATING: each returns a fixed-shape projection of a STRICT SUBSET
--    of what hr_state_of's envelope carried until 2026-08-21-streak-state.sql
--    moved these two populations out of it (ev:kill_monster:% -> bestiary,
--    ev:loot:% -> collection; renown is a derived scalar). The engine reads
--    them here for exactly the reason it stopped reading them through
--    hr_state_of — together they approach that function's 1000-row envelope cap
--    — so this is a re-homing of a read the engine already had, not a new one.
--    NO NEW TARGET: each takes (p_user, p_slot), the same pair the engine
--    already passes to hr_apply and hr_state_of, both of which it holds. It can
--    already WRITE any character it names; this lets it READ, for one character,
--    a subset of what hr_state_of's envelope was already the peer of. No
--    reachability the holder of hr_apply did not have.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────
-- It does not grant anything. All three grants already exist and were made by
-- the migrations that own those functions. It does not touch check (7)'s logic,
-- any other check, the baseline table, or the cron schedule. The ONLY textual
-- difference from 2026-08-17-market-v2.sql's detector is three entries and their
-- justification, inserted at ONE anchor — see §2.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
-- Re-applying 2026-08-17-market-v2.sql restores the previous list exactly (its
-- body is this file's base, unmodified). That is a complete revert of everything
-- this file changes — after which the detector correctly raises again on the
-- three grants, because the finding was never false. A true revert of the
-- FINDING means revoking the three grants, which takes the bestiary, collection
-- and renown reads offline. No table, column, policy, row or grant is touched
-- here, so there is nothing else to undo.
--
-- SAFE TO RE-RUN — see §1, which distinguishes a no-op re-run from a live body
-- this file was not derived from, and refuses the second.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. PRECONDITIONS — REFUSE TO INSTALL ON A BODY THIS FILE DID NOT COME FROM ──
-- This file restates a ~23 KB nine-check DETECTOR it did not author. There is
-- no body in this repo where a blind `create or replace` is worse: the detector
-- is the only automated thing that notices a privileged function born reachable,
-- it runs nightly, and a silently deleted check LOOKS EXACTLY LIKE a clean night.
--
-- So the guard is a SET COMPARISON on the live allowlist, not a term scan:
--   · the anchor must be there at all (else this is not the body we patched);
--   · every entry the LIVE body carries must be one this file will carry —
--     otherwise applying this file DELETES a reviewed capability, and it names
--     which one instead of shrugging;
--   · every entry of the BASE (market-v2's list) must be live — otherwise the
--     live body is older or different and this file was derived from the wrong one;
--   · all three, or none, of the new entries may be present. All three = a
--     no-op re-run, said out loud. A partial set = somebody edited this list by
--     hand, and this file would overwrite that edit, so it refuses.
do $$
declare
  v_src   text;
  v_len   int;
  v_arr   text;
  v_live  text[];
  v_e     text;
  v_new   int := 0;
  -- The entries this file's detector will carry. The base is market-v2's list
  -- (the fifth link's fourteen entries) plus these three.
  c_base constant text[] := array[
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    'hr_claim_lookup(uuid,integer,text,text)',
    'hr_perks_of(uuid,integer)',
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    'hr_state_of(uuid,integer)',
    'hr_seed(uuid,integer,text)',
    'hr_total_level(uuid,integer)',
    'hr_level_from_xp(bigint)',
    'hr_xp_for_level(integer)',
    'hr_offline_cap_ms(uuid,integer)',
    'hr_rate_gate(uuid,integer,text)'
  ];
  c_added constant text[] := array[
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)'
  ];
begin
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene(boolean) is missing — apply '
                    '2026-08-11-grant-hygiene.sql (and the rest of the chain up to '
                    '2026-08-17-market-v2.sql) first. This file only ADDS three entries to its '
                    'engine allowlist; it is not a substitute for the detector.';
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline is missing — apply 2026-08-11-grant-hygiene.sql first; '
                    'check (2) of the body installed here reads it';
  end if;

  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  -- THE ANCHOR. If the array declaration is not there, the live body is not the
  -- one tools/derive-grant-hygiene.mjs patched and nothing below can be trusted.
  v_arr := substring(v_src from 'c_engine_allow constant text\[\] := array\[(.*?)\];');
  if v_arr is null then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live body (% chars) has no '
                    '`c_engine_allow constant text[] := array[…];` declaration, so it is not the '
                    'body this file was derived from. Re-derive from whatever is actually running '
                    '(node tools/derive-grant-hygiene.mjs --report) rather than overwriting it.',
                    coalesce(v_len, 0);
  end if;

  select array_agg(m[1] order by m[1])
    into v_live
    from regexp_matches(v_arr, '''([a-z][a-z0-9_]*\([a-z0-9_, ]*\))''', 'g') m;

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT, because a text scan fails in BOTH
  --   directions. The positive control is an entry no engine allowlist worth the
  --   name can lack; the negative is a sentinel that appears in no body at all.
  if v_live is null or not ('hr_apply(uuid,integer,bigint,uuid,jsonb)' = any (v_live)) then
    raise exception 'THE ALLOWLIST SCAN IS BLIND (positive control): hr_apply is not among the % '
                    'entries parsed out of the live c_engine_allow, and hr_apply is THE writer — '
                    'every check below would refuse on a healthy database. Fix the parse, do not '
                    'delete the check.', coalesce(array_length(v_live, 1), 0);
  end if;
  if 'hr__grant_hygiene_negative_control(uuid)' = any (v_live) then
    raise exception 'THE ALLOWLIST SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no allowlist MATCHED, so the parse is matching everything and '
                    'every check below would pass on any body at all.';
  end if;

  -- (a) Nothing this file would DELETE.
  foreach v_e in array v_live loop
    if not (v_e = any (c_base) or v_e = any (c_added)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist '
                      'carries "%", which the body in this file does NOT. Applying it would '
                      'silently DELETE that reviewed capability and the nightly detector would '
                      'start raising on a grant somebody already approved. Add the entry to '
                      'tools/derive-grant-hygiene.mjs and re-derive.', v_e;
    end if;
  end loop;

  -- (b) Everything the base (market-v2's list) had is still there.
  foreach v_e in array c_base loop
    if not (v_e = any (v_live)) then
      raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live engine allowlist is '
                      'MISSING the base entry "%". This file''s body was derived from '
                      '2026-08-17-market-v2.sql''s detector (the fifth link of '
                      'HR_GRANT_HYGIENE_CHAIN); the live body is not that one. Re-derive rather '
                      'than overwrite.', v_e;
    end if;
  end loop;

  -- (c) All three of the new entries, or none.
  foreach v_e in array c_added loop
    if v_e = any (v_live) then v_new := v_new + 1; end if;
  end loop;
  if v_new > 0 and v_new < 3 then
    raise exception 'REFUSING TO REPLACE hr_assert_grant_hygiene: the live allowlist carries % of '
                    'the three entries this file adds. That is a hand edit, not this file, and '
                    'applying it would overwrite whatever was decided. Reconcile by hand first.',
                    v_new;
  elsif v_new = 3 then
    raise notice 'the live engine allowlist already carries all three entries — this apply is a '
                 'no-op re-run of an identical body.';
  end if;

  raise notice '§0 PASSED: the live hr_assert_grant_hygiene (% chars) is the market-v2 base this '
               'file was derived from; % of 3 new entries already present.', v_len, v_new;
end $$;

-- ── 2. THE DETECTOR, DERIVED ─────────────────────────────────────────────
-- ⚠ THE BLOCK BELOW IS GENERATED. Do not hand-edit between the markers.
--   It is 2026-08-17-market-v2.sql's hr_assert_grant_hygiene, EXTRACTED
--   programmatically by tools/derive-grant-hygiene.mjs (LINKS[5]) and patched at
--   ONE named anchor (the head of c_engine_allow) — an INSERTION of three
--   entries plus their justification, removing nothing, which is why
--   HR_GRANT_HYGIENE_CHAIN's declared-removals list for this link in
--   tests/run-sql-tests.mjs PART 1f-ii is EMPTY.
--   `node tools/derive-grant-hygiene.mjs --check` re-derives and diffs on every
--   run of tests/run-smoke.mjs, so a hand edit here fails the build.
-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- ── 3. GRANTS — revoke from PUBLIC first, then grant (nothing is granted) ─
-- `create or replace` PRESERVES the existing ACL, so on a database that already
-- ran grant-hygiene these are belt-and-braces. They are restated anyway because
-- the detector's own check (1) is the thing that would catch their absence, and
-- a detector that arrives PUBLIC-executable for one migration is a detector an
-- attacker can read the allowlist out of. There is no `grant` line in this file,
-- by design: it adds no capability to anybody.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── 4. SELF-VERIFICATION — EXECUTED, WITH A MUTATION ARM ─────────────────
-- Three things are proven here, in this order:
--   (A) the three entries are in the INSTALLED body and check (7) no longer
--       reports the three live grants — the actual purpose of the file;
--   (B) STRICT PASSES — the whole nine-check detector, not just check (7);
--   (C) THE MUTATION ARM: an unrelated function granted to hr_engine is still
--       NAMED by check (7). A migration that widened an allowlist and did not
--       prove the detector still fires has replaced a control with a comment.
do $$
declare
  v      jsonb;
  v_src  text;
  v_e    text;
  v_have boolean;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_assert_grant_hygiene';

  -- (A) the entries landed, and the live grants they exist for are now silent.
  foreach v_e in array array['hr_bestiary_of(uuid,integer)',
                             'hr_collection_of(uuid,integer)',
                             'hr_renown_of(uuid,integer)'] loop
    if position('''' || v_e || '''' in v_src) = 0 then
      raise exception 'the installed hr_assert_grant_hygiene does not carry the allowlist entry '
                      '% — the derivation did not land', v_e;
    end if;
  end loop;

  v := public.hr_assert_grant_hygiene(false);
  if (v->'engine_execute_outside_allowlist') @> '["hr_bestiary_of(uuid,integer)"]'::jsonb
  or (v->'engine_execute_outside_allowlist') @> '["hr_collection_of(uuid,integer)"]'::jsonb
  or (v->'engine_execute_outside_allowlist') @> '["hr_renown_of(uuid,integer)"]'::jsonb then
    raise exception 'check (7) still reports one of the three entries this file just recorded — report=%',
      (v->'engine_execute_outside_allowlist')::text;
  end if;

  -- Report which of the three grants this database actually has, so a green run
  -- on a database that has NONE cannot be mistaken for a green run on production.
  select exists (select 1 from pg_roles where rolname = 'hr_engine') into v_have;
  if not v_have then
    raise warning 'hr_engine does not exist on this database — check (7) skips itself and the '
                  'mutation arm below cannot run. This file installed correctly but proved less '
                  'than it does on a database with the accrual engine.';
  else
    foreach v_e in array array['public.hr_bestiary_of(uuid,int)',
                               'public.hr_collection_of(uuid,int)',
                               'public.hr_renown_of(uuid,int)'] loop
      if to_regprocedure(v_e) is null then
        raise notice 'ALLOWLIST ENTRY RECORDED FOR AN ABSENT FUNCTION: % does not exist here. That '
                     'is legal — an allowlist is permissive — but this apply did not prove the '
                     'finding is cleared.', v_e;
      elsif not has_function_privilege('hr_engine', v_e, 'execute') then
        raise notice '% exists but hr_engine cannot execute it here — the grant this entry '
                     'authorises is not present on this database.', v_e;
      end if;
    end loop;
  end if;

  -- (B) the WHOLE detector, strict. A self-check that tests only its own file's
  --     terms cannot detect a later file undoing an earlier one.
  v := public.hr_assert_grant_hygiene(true);
  raise notice 'GRANT HYGIENE STRICT PASSES with the widened engine allowlist.';

  -- (C) THE MUTATION ARM. Coverage must get STRICTER, never looser: a genuinely
  --     unlisted engine grant must still be NAMED.
  --
  --     No exception handler on the probe grant, on purpose: if anything below
  --     raises, the whole migration rolls back and the probe cannot survive it.
  if v_have then
    create or replace function public.hr__engine_allow_probe() returns int
      language sql immutable as 'select 1';
    execute 'revoke execute on function public.hr__engine_allow_probe() '
            'from public, anon, authenticated, service_role';
    execute 'grant execute on function public.hr__engine_allow_probe() to hr_engine';

    v := public.hr_assert_grant_hygiene(false);
    if not (v->'engine_execute_outside_allowlist') @> '["hr__engine_allow_probe()"]'::jsonb then
      raise exception 'THE DETECTOR IS BLIND: hr_engine was granted EXECUTE on an unlisted '
                      'function and check (7) did not report it. The allowlist was widened '
                      'without the check that makes an allowlist mean anything. report=%',
                      (v->'engine_execute_outside_allowlist')::text;
    end if;
    begin
      v := public.hr_assert_grant_hygiene(true);
      raise exception 'THE DETECTOR IS NOT FATAL: strict mode returned normally with an unlisted '
                      'engine grant live. The nightly cron run would report success.';
    exception when others then
      if sqlerrm not like 'GRANT HYGIENE FAILED%' then raise; end if;
    end;

    execute 'revoke execute on function public.hr__engine_allow_probe() from hr_engine';
    drop function if exists public.hr__engine_allow_probe();

    -- Clean again, strict, so the migration does not leave a database it has
    -- only proven the failing half of.
    v := public.hr_assert_grant_hygiene(true);
    raise notice 'MUTATION ARM PASSED: an unlisted engine grant is still named AND still fatal.';
  end if;
end $$;

-- Belt-and-braces: the probe is created inside a conditional branch above, so
-- prove it is gone whichever branch ran. A probe left behind is a granted
-- function nobody reviewed.
do $$
begin
  if to_regprocedure('public.hr__engine_allow_probe()') is not null then
    raise exception 'the self-check probe survived this migration';
  end if;
end $$;
