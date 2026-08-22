#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/run-sql-tests.mjs — the server tier's test gate
//
// Before this file the repo had no SQL test harness and zero test references
// to hr_apply, market_buy or pg_policies: every security property of the
// server was asserted by reading the migration. This is the minimum viable
// harness, and it is deliberately split in two so that the half which needs no
// database still runs on every push.
//
//   PART 1 — STATIC (no database, always runs, gates the build)
//     • catalogue drift: regenerate from src/data/*.js and diff
//     • grant hygiene:   every CREATE FUNCTION in the new migrations must be
//                        followed by a `revoke execute … from public` before
//                        any grant, and no migration may grant a privileged
//                        function to a client role
//     • rollback hygiene: no `return jsonb_build_object('ok', false …)` may
//                        appear after a DML statement inside hr_apply — that
//                        is exactly the S2 defect, and a lint is the only
//                        thing that will catch its reintroduction in review
//
//   PART 2 — BEHAVIOURAL (needs a database)
//     tests/sql/server-authority.test.sql, designed to run inside a
//     transaction that is rolled back. `--emit` prints the whole bundle
//     (migrations + suite, wrapped in begin/rollback) to stdout so it can be
//     piped at psql, `supabase db execute`, or pasted into a SQL console:
//
//       node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"
//
//     ⚠ THIS BUNDLE IS *NOT* "SAFE AGAINST ANY DATABASE". (Review R9. An
//       earlier revision of this header claimed it was, which was wrong in two
//       specific ways that matter operationally:)
//
//       1. LOCKS. 2026-08-17-market-v2.sql does `drop table market_listings
//          cascade` and `create table market_listings`, so it holds ACCESS
//          EXCLUSIVE on the live market table for the ENTIRE run — every
//          statement of four migrations plus twenty test sections. Against a
//          production database with players trading, that is a stall, not a
//          no-op, even though nothing is committed. The emitted bundle
//          therefore sets `lock_timeout` so it FAILS FAST instead of queueing
//          in front of real traffic, and `statement_timeout` so a pathological
//          statement cannot sit there.
//       2. WORK. Rolled back is not free: the run writes and then discards
//          WAL, bloats catalogs, and leaves dead tuples for autovacuum.
//
//       So `--emit` now REFUSES to target production unless you say so:
//       pass `--allow-production` (and read the two points above first).
//       Without it the bundle carries a guard that aborts if it finds live
//       player data. The default is the safe one.
//
//     No Postgres driver is vendored on purpose: this repo is a static site
//     with one devDependency, and adding `pg` to run one script is a worse
//     trade than emitting SQL.
//
//     IF YOU HAVE NO psql AND NO DATABASE_URL (the usual case on Tyler's box),
//     the bundle can still be run against a live database through the Supabase
//     MCP `execute_sql` tool, which is worth writing down because two of the
//     obvious ways to do it are unsafe:
//
//       • Each execute_sql call is a SEPARATE backend and a separate implicit
//         transaction — verified: pg_backend_pid() changes per call and a temp
//         table does not survive. So you CANNOT chunk the bundle across calls
//         inside one `begin`. A chunked `begin` silently does not hold, and
//         market-v2's `drop table market_listings` would then be permanent.
//       • An explicit `begin; … rollback;` inside a SINGLE call IS honoured,
//         including for DDL, CREATE ROLE and CREATE EXTENSION — also verified.
//
//     The bundle is ~215 KB, which is too big for one call, so the trick is to
//     let Postgres fetch its own source: the migrations are served publicly at
//     https://hearthrise.net/<repo path>. One call, one transaction:
//
//       begin;
//       create extension if not exists http with schema extensions;
//       do $$ … for each file: http_get, CHECK ITS sha256, execute … $$;
//       rollback;
//
//     Verify the sha256 of every fetched file against the local working copy
//     before executing it — otherwise a CDN error page becomes something you
//     hand to EXECUTE. PL/pgSQL EXECUTE does accept a multi-statement string.
//
// Exit codes: 0 = clean · 1 = a check failed · 2 = harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

// The server-authority foundation, in apply order. Order is load-bearing:
// files 3 and 4 fail closed without file 2.
const BUNDLE = [
  '2026-08-11-player-state.sql',
  '2026-08-11-catalogue.generated.sql',
  // The C5/X3 daily budget. BEFORE apply-engine because apply-engine's §0 now
  // fails closed without hr_day_budget_check — the order in this list is the
  // order the migration bundle is applied in, and getting it wrong is a refused
  // migration rather than a subtle degradation.
  '2026-08-11-daily-budget.sql',
  '2026-08-11-apply-engine.sql',
  /* ⚠ market-v2 LEFT THIS BUNDLE ON 2026-08-17, and it is a real narrowing, so
     it is stated rather than quietly done. The 2026-08-11 file could be applied
     on top of these four; 2026-08-17-market-v2.sql cannot, because its §0 fails
     closed without hr_utc_day_key (clan-seat), hr_client_write_baseline
     (client-write-grant-sweep) and an hr_apply carrying the b346 slot/mismatch/
     key-release terms (the four-file hr_apply chain). Adding all of those to a
     "foundation bundle" would make it the whole chain under another name.
     WHAT REPLACED THE COVERAGE: tests/market-v2.mjs boots the REAL ordered
     chain through tests/schema-replay.mjs `bootReplay()` and drives two real
     characters through it — strictly more than a six-file subset could see. The
     file is still in ALSO_LINTED, so every grant lint and PART 1d/1e/1f check
     below still reads it. */
];
// Shipped and reviewed separately, so these are linted but are not part of the
// foundation bundle. Anything that creates a function in `public` belongs here:
// the grant-hygiene lints below are the repo's only static defence against a
// new SECURITY DEFINER function being born reachable, and a file that is not
// listed is a file that defence does not cover.
const ALSO_LINTED = [
  '2026-08-11-chat-name-authority.sql',
  '2026-08-11-anon-execute-lockdown.sql',
  '2026-08-11-grant-hygiene.sql',
  '2026-08-11-telemetry-retention.sql',
  '2026-08-11-clan-write-policy-pin.sql',
  '2026-08-11-authenticated-surface-lockdown.sql',
  '2026-08-11-live-market-rls.sql',
  '2026-08-11-clan-membership-authority.sql',
  // O1/O2 on the v1 market_buy_offers + a volume bound on both market tables.
  // Behaviourally proven, with controls and mutations, by
  // tests/market-offers-guard.mjs on PGlite. It deliberately does NOT fix M1
  // (listing an item you do not own) — see that file's header.
  '2026-08-12-market-offers-authority.sql',
  // F5's other half: hr_clan_browser replaces the world-readable
  // clan_leaderboard view, and leaderboard_ranked stops being client-selectable.
  // Behaviourally proven, with controls and mutations, by
  // tests/leaderboard-lockdown-guard.mjs on a fully replayed PGlite chain.
  '2026-08-14-leaderboard-view-lockdown.sql',
  /* ⚠ THE 2026-08-15 FILES WERE NOT ON THIS LIST, and the comment above says
     plainly that they should have been: all four `create or replace` a
     SECURITY DEFINER function in `public`, and `create or replace` PRESERVES an
     ACL — so a file that restates a 47 KB body and forgets its revoke/grant
     block leaves whatever the previous ACL was, silently, which is precisely
     the failure this lint is the only static defence against. They were added
     on 2026-08-15 with the tool-carry work; all four pass unchanged, which
     means this is a coverage fix and not a behaviour change. */
  '2026-08-15-auto-eat.sql',
  '2026-08-15-activity-intent.sql',
  '2026-08-15-intent-key-hygiene.sql',
  /* The two other links of the hr_rate_gate chain. They are here so `sources`
     holds them for PART 1f-ii's derivation walk AND so the grant lints see
     them: both `create or replace` a SECURITY DEFINER function in `public`,
     which is the shape those lints are the only static defence against. */
  '2026-08-11-accrue-gate.sql',
  '2026-08-15-gold-intents.sql',
  /* b348 — the gathering tool carry. Replaces BOTH hr_apply and hr_state_of. */
  '2026-08-15-tool-carry.sql',
  /* b351 — the gem daily budget (Security's blocking condition 1). Replaces
     hr_apply and all three daily-budget functions. It is the CURRENT last
     toucher of hr_apply; PART 1f-ii below pins that chain. */
  '2026-08-15-gem-daily-budget.sql',
  /* b349 — the grant intent. `create or replace`s hr_rate_gate and creates
     hr_claim_lookup, which takes p_user as an ARGUMENT and is SECURITY DEFINER —
     i.e. it reads any player's claim history for anyone who can call it. That is
     precisely the shape this lint is the only static defence against. It is the
     CURRENT last toucher of hr_rate_gate; PART 1f-ii below pins that chain too. */
  '2026-08-16-claim-reward.sql',
  /* b352 — the artisan progress model, plus the perk-channel file its
     hr_perks_of is DERIVED from. Between them they `create or replace` three
     SECURITY DEFINER functions in `public` (hr_perks_of twice, hr_unlock_levels
     once) and create a trigger function — exactly the shapes these grant lints
     are the only static defence against. artisan-progress-model is the CURRENT
     last toucher of hr_perks_of; PART 1f-ii below pins that chain, as a third
     object. */
  '2026-08-15-perk-channel.sql',
  '2026-08-16-artisan-progress-model.sql',
  /* b353 — the engine capability allowlist. It `create or replace`s THE
     DETECTOR itself, which is the one body where a blind restatement is worst:
     a silently deleted check looks exactly like a clean night. Listed here so
     the grant lints see it AND so PART 1f-ii can walk its derivation. */
  '2026-08-16-engine-allowlist-claim-perks.sql',
  /* b354 — the unlock purchase. It creates a SECURITY DEFINER function that
     WRITES four player tables and grants it to hr_engine, and it is the CURRENT
     last toucher of hr_assert_grant_hygiene; PART 1f-ii below pins that chain
     as a third link. Exactly the shape these grant lints are the only static
     defence against. */
  '2026-08-16-unlock-buy.sql',
  /* b354 / Security C3 — the dead-client-write-grant sweep. It revokes on six
     content catalogues and `create or replace`s the detector to widen check (4). */
  '2026-08-16-client-write-grant-sweep.sql',
  /* b350 (Security batch 5) — the detector TAKEOVER. It `create or replace`s
     hr_assert_grant_hygiene to move check (4) onto has_table_privilege (so
     MAINTAIN and matviews stop being blind spots). PART 1f-ii walks it as the
     fourth link; market-v2 (below) then takes over as the fifth and last. */
  '2026-08-16-client-write-grant-sweep-5.sql',
  /* market v2 — three SECURITY DEFINER functions that WRITE player state, one
     of which writes a SECOND player's row, plus a `create or replace` of the
     detector to record them (rebased onto batch 5's now-live body). It is the
     CURRENT last toucher of hr_assert_grant_hygiene; PART 1f-ii pins that chain
     as the fifth link. It is also the file PART 1e's destructive-migration
     interlocks read. */
  '2026-08-17-market-v2.sql',
  /* Phase 0 of live settlement — the in-flight fight becomes server state. It
     replaces BOTH hr_apply and hr_state_of and is the CURRENT last toucher of
     hr_apply; PART 1f-ii pins that chain as its fourth link. Both bodies are
     GENERATED by tools/derive-fight-carry.mjs, which the smoke suite re-runs
     with --check, so a hand-edit of either is a build failure. */
  '2026-08-17-fight-carry.sql',
  /* Phase 2 of live settlement, part 1 — the equip verb's refusals join the
     intent-key release class. It `create or replace`s hr_apply and is the
     CURRENT last toucher of it; PART 1f-ii pins that chain as its fifth link.
     The body is GENERATED by tools/derive-equip-release.mjs, which the smoke
     suite re-runs with --check, so a hand-edit is a build failure. */
  '2026-08-18-equip-release-codes.sql',
  /* b370 — the permanent fix for the `unknown_skill` incident. It `create or
     replace`s hr_apply and is the CURRENT last toucher of it; PART 1f-ii pins
     that chain as its sixth link. The body is GENERATED by
     tools/derive-skill-row-upsert.mjs, which the smoke suite re-runs with
     --check, so a hand-edit is a build failure. */
  '2026-08-18-skill-row-upsert.sql',
  /* ELEMENTS/ENCHANTING v1 — the server half. It `create or replace`s BOTH
     hr_apply (the enchant delta key + block + §S5 stamp + ledger kind + release
     code) AND hr_state_of (the `enchant` projection), so it is the CURRENT last
     toucher of BOTH; PART 1f-ii pins it as the eighth link of HR_APPLY_CHAIN and
     the fifth of HR_STATE_OF_CHAIN. The bodies are GENERATED by
     tools/derive-enchant.mjs, which the smoke suite re-runs with --check, so a
     hand-edit is a build failure. Here so `sources` holds it for the derivation
     walk and the grant lints. */
  '2026-08-18-enchant.sql',
  /* b366 / Security P0 — the clan Storehouse's ownership debit. It `create or
     replace`s public.clan_deposit__ungated, i.e. a SECURITY DEFINER body that
     writes four shared-surface tables, which is exactly the shape the grant
     lints below are the only static defence against. It is in NO derivation
     chain (it touches none of the four graded bodies); PART 1h grades it. */
  '2026-08-18-clan-deposit-ownership.sql',
  /* Live-progress Slices 2+3 — the SHARED hr_state_of change. It `create or
     replace`s BOTH hr_apply (the daily settle streak) AND hr_state_of (project
     the streak + EXCLUDE the ev:kill_monster:% / ev:loot:% populations), so it
     is the CURRENT last toucher of BOTH; PART 1f-ii pins it as the ninth link of
     HR_APPLY_CHAIN and the sixth of HR_STATE_OF_CHAIN. GENERATED by
     tools/derive-live-progress.mjs, re-run with --check in the smoke suite. */
  '2026-08-21-streak-state.sql',
  /* inventory-flip Step B1 — the server-stamped `inventory_complete` signal. It
     `create or replace`s hr_state_of to add ONE additive top-level boolean, so it
     is the CURRENT last toucher of hr_state_of; PART 1f-ii pins it as the seventh
     link of HR_STATE_OF_CHAIN. GENERATED by tools/derive-inventory-complete.mjs,
     re-run with --check in the smoke suite. Listed here so `sources` holds it for
     the derivation walk and the grant lints see its create-or-replace. */
  '2026-08-24-inventory-complete.sql',
  /* worker-settlement slice — the LAST TOUCHER of BOTH hr_apply and hr_state_of.
     It `create or replace`s both (the `workers` xp sub-delta + watermark key +
     `worker` ledger kind in hr_apply; the crew/watermark projection + the
     completeness third arm in hr_state_of) AND creates two client-callable
     SECURITY DEFINER RPCs (hr_worker_hire / hr_worker_assign). GENERATED by
     tools/derive-workers.mjs, re-run with --check in the smoke suite. Listed here
     so `sources` holds it for BOTH derivation walks and the grant lints see its
     create-or-replaces + the two new RPC grants. */
  '2026-08-25-workers.sql',
  /* Link 6 of HR_GRANT_HYGIENE_CHAIN — the live-progress read projections. It
     `create or replace`s THE DETECTOR to record three reviewed engine grants
     (hr_bestiary_of / hr_collection_of / hr_renown_of), which the nightly run
     raises on until they are allowlisted. GENERATED by tools/derive-grant-hygiene.mjs
     (LINKS[5]) from market-v2's body, insertions only. Listed here so the grant
     lints see it AND PART 1f-ii can walk its derivation; it is the CURRENT last
     toucher of hr_assert_grant_hygiene. */
  '2026-08-20-live-progress-engine-allow.sql',
  /* Slice 4 of live settlement — the server-derived renown score. It creates a
     SECURITY DEFINER projection (hr_renown_of) AND `create or replace`s
     hr_perks_of to wire the renownAllXp channel, so it is the CURRENT last
     toucher of hr_perks_of; PART 1f-ii pins that chain as its third link. Listed
     here so `sources` holds it for the derivation walk and the grant lints. */
  '2026-08-20-renown.sql',
  /* The equipped-companion channel — the CURRENT last toucher of hr_perks_of
     (HR_PERKS_OF_CHAIN link 4). It `create or replace`s hr_perks_of (a faithful
     superset of renown's body + the companion field) AND creates a SECURITY
     DEFINER RPC hr_companion_equip, so it is here for the derivation walk and
     the grant lints. */
  '2026-08-20-companion-model.sql',
  /* SERVER-FARMING slice 1 — the hr_farm_plant / hr_farm_harvest RPC pair. Both
     are client-callable (authenticated) SECURITY DEFINER money RPCs, so PART
     1b-ii (A9) must see them and confirm each references a rate gate. It was
     SILENTLY SKIPPED before this line, which is why the missing gate (F1) was
     not caught at build time. It touches none of the graded bodies (hr_apply /
     hr_state_of / hr_perks_of / hr_rate_gate / hr_assert_grant_hygiene), so it
     is on no derivation chain — the farm rate buckets live in hr_rpc_gate's
     last toucher (2026-08-23-bounty.sql), not here. */
  '2026-08-20-server-farming.sql',
  /* FARM RECONCILE (b435) — the merged last-toucher of every farm RPC
     (hr_farm_plant/harvest/water/upgrade_plot + hr_farm_growth_hours) and the
     new hr_rpc_gate last toucher (adds farm_water). Listed here so the grant
     lints see its create-or-replaces + new RPC grants. It patches hr_state_of
     programmatically (pg_get_functiondef), so it is NOT an HR_STATE_OF_CHAIN
     member. */
  '2026-08-22-server-farming-complete.sql',
  /* BOUNTY MARKS server-of-record (b436). It STATICALLY create-or-replaces
     hr_state_of (the marks scalar) — HR_STATE_OF_CHAIN link 9, GENERATED by
     tools/derive-marks.mjs from workers — AND creates hr_bounty_spend/__ungated
     + restates hr_rpc_gate. MUST be here so `sources` holds it for the
     derivation walk (else the chain-9 body cannot be extracted) and the grant
     lints see the new RPC. */
  '2026-08-26-marks-record.sql',
  /* BANK item store server-of-record (b438). Creates hr_bank_move (client
     SECURITY DEFINER RPC) + restates hr_rpc_gate (adds bank_move). Patches
     hr_state_of programmatically (pg_get_functiondef → bank map projection), so
     NOT an HR_STATE_OF_CHAIN member. Listed here for the grant lints. */
  '2026-08-27-bank-store.sql',
  /* CLIENT_STATE home for the non-authority residue (b439). Creates
     hr_put_client_state (client SECURITY DEFINER RPC) + patches hr_rpc_gate
     (adds client_state_put) and hr_state_of (projects client_state) BOTH
     PROGRAMMATICALLY (pg_get_functiondef), so NOT an HR_STATE_OF_CHAIN / rate-
     gate-chain member. Listed here so the grant lints see the new RPC's grants. */
  '2026-08-28-client-state.sql',
];

// ── THE hr_apply DERIVATION CHAIN ────────────────────────────────────────
// Every file here restates the WHOLE of hr_apply, and each one was derived from
// its predecessor by extracting the text programmatically and patching it at
// named anchors. The chain is [older, …, CURRENT LAST TOUCHER]; PART 1f-ii
// re-derives each link and requires the result to be byte-identical.
//
// A new file that replaces hr_apply is appended here AND to
// tests/schema-apply-order.json, in the same commit. If it is not, PART 1f-ii's
// last-toucher check fails by name — which is the whole point: this repo has
// already had three migrations each defining one policy, with filename order
// silently installing the wrong one and every self-check still passing.
const HR_APPLY_CHAIN = [
  '2026-08-11-apply-engine.sql',
  '2026-08-15-intent-key-hygiene.sql',
  '2026-08-15-tool-carry.sql',
  '2026-08-15-gem-daily-budget.sql',
  '2026-08-17-fight-carry.sql',
  '2026-08-18-equip-release-codes.sql',
  '2026-08-18-skill-row-upsert.sql',
  // ELEMENTS/ENCHANTING v1. Restates the WHOLE of hr_apply to add the enchant
  // delta key + block + the §S5 stamp + the enchant ledger kind + the bad_enchant
  // release code. GENERATED by tools/derive-enchant.mjs from skill-row-upsert.
  '2026-08-18-enchant.sql',
  // LIVE-PROGRESS Slices 2+3. Restates the WHOLE of hr_apply to advance the
  // daily settle streak from now() on any accrual delta. INSERTIONS ONLY (the
  // scratch declares, the streak computation, two SET-clause columns), so its
  // declared-removals list is EMPTY. GENERATED by tools/derive-live-progress.mjs
  // from enchant.
  '2026-08-21-streak-state.sql',
  // worker-settlement slice. Restates the WHOLE of hr_apply to add the `workers`
  // per-worker xp sub-delta + the `workers_accrued_to` watermark key + the
  // `worker` ledger kind. INSERTIONS ONLY except the two terminator lines
  // (c_delta_keys, c_ledger_kinds) — its declared removals below. GENERATED by
  // tools/derive-workers.mjs from streak-state. It is the new last toucher.
  '2026-08-25-workers.sql',
];

// ── THE hr_state_of DERIVATION CHAIN ─────────────────────────────────────
// The FIFTH object, added with ELEMENTS v1 — and the one whose ABSENCE was the
// hole. hr_state_of is restated by four historic files (auto-eat, tool-carry,
// fight-carry) plus this one, each adding ONE projection to the envelope, and
// until now nothing diffed link against link. tests/live-settlement.mjs banned
// ANY post-fight-carry hr_state_of replacement outright FOR THAT REASON — "there
// is no derivation chain for hr_state_of, so a later toucher would silently
// delete the `fight` projection". This chain is that missing derivation, so the
// ban becomes membership (mirroring the hr_apply arm): a later toucher is
// allowed iff it is here and PART 1f-ii proves its body is the predecessor's
// plus insertions. enchant adds `enchant` next to `equipment` — ZERO removals.
//
// A new file that replaces hr_state_of is appended here AND to
// tests/schema-apply-order.json, in the same commit.
const HR_STATE_OF_CHAIN = [
  '2026-08-11-apply-engine.sql',
  '2026-08-15-auto-eat.sql',
  '2026-08-15-tool-carry.sql',
  '2026-08-17-fight-carry.sql',
  '2026-08-18-enchant.sql',
  // LIVE-PROGRESS Slices 2+3. Restates the WHOLE of hr_state_of to project the
  // streak (next to `fight`) and EXCLUDE the ev:kill_monster:% / ev:loot:%
  // populations from the generic read. The `fight` terminator gains the streak
  // fields, so that ONE line changes (its declared removal below); everything
  // else is insertion. GENERATED by tools/derive-live-progress.mjs from enchant.
  '2026-08-21-streak-state.sql',
  // inventory-flip Step B1. Restates the WHOLE of hr_state_of to add ONE additive
  // top-level `inventory_complete` boolean after `total_level`. The `total_level`
  // terminator gains a comma — that ONE line changes (its declared removal below);
  // everything else is insertion. GENERATED by tools/derive-inventory-complete.mjs
  // from streak-state. It is the new last toucher of hr_state_of.
  '2026-08-24-inventory-complete.sql',
  // worker-settlement slice. Restates the WHOLE of hr_state_of to project the
  // crew watermark + the crew array, and to AND a THIRD ARM into
  // inventory_complete (crew non-empty + open window => incomplete). INSERTIONS
  // ONLY except the inventory_complete `case` line, which gains an outer paren —
  // its one declared removal below. GENERATED by tools/derive-workers.mjs from
  // inventory-complete. It is the new last toucher of hr_state_of.
  '2026-08-25-workers.sql',
  // Bounty-Marks server-of-record. Restates the WHOLE of hr_state_of to project the
  // `marks` scalar (beside gold/gems). INSERTION ONLY — no declared removal.
  // GENERATED by tools/derive-marks.mjs from workers. New last toucher of hr_state_of.
  '2026-08-26-marks-record.sql',
];

// ── THE hr_rate_gate DERIVATION CHAIN ────────────────────────────────────
// Same rule, same mechanism, a second object — added 2026-08-16 after a real
// near-miss, which is the only honest reason to generalise a guard.
//
// 2026-08-16-claim-reward.sql was branched from the pre-`shop` gate in
// 2026-08-15-activity-intent.sql. 2026-08-15-gold-intents.sql then landed the
// `shop` arm and was APPLIED TO PRODUCTION. Merged as written, claim-reward
// would have restated the gate WITHOUT `shop` — and because an unknown bucket
// fails closed, every shop_buy and vendor_sell would have answered 429 having
// read and written nothing, with claim-reward's own self-check reporting
// success, because it asserted only its own arm. That is the clan_members
// "join as self" defect exactly, and the ordering rule in
// schema-apply-order.json would only have caught the REVERSE order.
//
// So the gate is now derived link by link like hr_apply is, and PART 1f-ii
// grades both. A new file that replaces hr_rate_gate is appended here AND to
// tests/schema-apply-order.json, in the same commit, and its body is extracted
// from its predecessor's rather than retyped.
// ── THE hr_perks_of DERIVATION CHAIN ─────────────────────────────────────
// The third object, added 2026-08-16 with the artisan progress model, for the
// same reason and by the same mechanism. 2026-08-15-perk-channel.sql
// introduces hr_perks_of; 2026-08-16-artisan-progress-model.sql restates the
// WHOLE body in order to add ONE key (`unlockedRecipes`, the artisan gate).
//
// Its body is extracted from perk-channel's by tools/derive-perks-of.mjs and
// patched at four named anchors — INSERTIONS ONLY, which is why the artisan
// link's declared-removals list below is EMPTY. An empty declared-removals list
// is the strongest form this check can take: nothing of the base body may go.
//
// 2026-08-20-renown.sql is the THIRD link: it wires the `renownAllXp` channel
// from the server-derived score. A first draft of that file derived its
// restatement from perk-channel (the SECOND-to-last body) and thereby SILENTLY
// DROPPED the artisan model's `unlockedRecipes` projection — breaking every
// crafting-recipe unlock server-side, exactly the class this chain exists to
// catch. The corrected body is artisan-progress-model's VERBATIM plus the renown
// wiring, so it removes only TWO lines (the renownAllXp value and the
// sources.renown census entry both genuinely change) — both declared below. Had
// this link existed when renown was first written, the dropped `unlockedRecipes`
// lines would have been UNDECLARED removals and failed the build.
//
// A new file that replaces hr_perks_of is appended here AND to
// tests/schema-apply-order.json, in the same commit.
const HR_PERKS_OF_CHAIN = [
  '2026-08-15-perk-channel.sql',
  '2026-08-16-artisan-progress-model.sql',
  '2026-08-20-renown.sql',
  // FOURTH link: the equipped-companion channel. A faithful SUPERSET of renown's
  // body — the whole artisan gate + the renown channel carried verbatim — that
  // INSERTS the companion read + the `companion` returned field and changes ONLY
  // the sources.companions census line (blocked → derived), its sole declared
  // removal below.
  '2026-08-20-companion-model.sql',
];

// ── THE hr_assert_grant_hygiene DERIVATION CHAIN ─────────────────────────
// The FOURTH object, added 2026-08-16, and the one with the worst failure mode
// of the four. 2026-08-11-grant-hygiene.sql had been the SOLE definer of the
// detector since it was written; 2026-08-16-engine-allowlist-claim-perks.sql
// takes over, in order to record two reviewed engine grants
// (hr_claim_lookup, hr_perks_of) that the nightly pg_cron run raises on.
//
// Why this body more than the other three: hr_apply going wrong is a broken
// feature and someone notices within an hour. THE DETECTOR going wrong is
// SILENCE — a restatement that dropped check (5), or check (8), or the
// `prokind in ('f','p')` that makes a PROCEDURE visible, would read as a clean
// night for as long as nobody looked. So its body is EXTRACTED from
// grant-hygiene's by tools/derive-grant-hygiene.mjs and patched at ONE anchor
// (the head of c_engine_allow) — INSERTIONS ONLY, which is why this chain's
// declared-removals list below is EMPTY.
//
// A new file that replaces hr_assert_grant_hygiene is appended here AND to
// tests/schema-apply-order.json, in the same commit.
// b354 adds a THIRD link and the first WRITER the engine allowlist has taken
// since hr_apply: 2026-08-16-unlock-buy.sql records hr_unlock_buy. Its body is
// engine-allowlist-claim-perks' — extracted by tools/derive-grant-hygiene.mjs
// (LINKS[1]) and patched at the same single anchor, insertions only — so the
// declared-removals list for this chain stays EMPTY.
const HR_GRANT_HYGIENE_CHAIN = [
  '2026-08-11-grant-hygiene.sql',
  '2026-08-16-engine-allowlist-claim-perks.sql',
  '2026-08-16-unlock-buy.sql',
  // b354 / Security C3. The first link in this chain that REPLACES lines — see
  // DECLARED_REMOVALS below, which is this chain's first non-empty list.
  '2026-08-16-client-write-grant-sweep.sql',
  // b350 / Security batch 5 — THE DETECTOR TAKEOVER, and the SECOND replacing
  // link. It swaps check (4)'s whole information_schema query for a
  // has_table_privilege query over pg_class (full PG17 vocabulary + every
  // relkind), so MAINTAIN and matviews become permanently visible. Its removed
  // lines are the second non-empty entry in DECLARED_REMOVALS below.
  '2026-08-16-client-write-grant-sweep-5.sql',
  // market v2 — link 5, rebased onto batch 5's now-live body: an INSERTION
  // (three engine grants at the head of c_engine_allow) AND one REMOVAL (the
  // stale market_expire(integer) entry, Security M7), so its declared-removals
  // list below is NON-empty.
  '2026-08-17-market-v2.sql',
  // link 6 — the live-progress read projections. An INSERTION (three engine
  // grants at the head of c_engine_allow: hr_bestiary_of / hr_collection_of /
  // hr_renown_of, each granted to hr_engine by its own migration but never
  // recorded, so the nightly detector raises on all three). Insertions only, so
  // its declared-removals list below stays EMPTY. It is the new last toucher.
  '2026-08-20-live-progress-engine-allow.sql',
];

const HR_RATE_GATE_CHAIN = [
  '2026-08-11-accrue-gate.sql',
  '2026-08-15-activity-intent.sql',
  '2026-08-15-gold-intents.sql',
  '2026-08-16-claim-reward.sql',
];

// Functions created only to PROVE a check works, inside that check's own
// self-verification block. They are granted a privilege on purpose and must be
// dropped in the same file — which is asserted, so this is not an escape hatch.
const PROBE = /^hr__/;

// ⚠ WITH --emit, STDOUT IS THE SQL BUNDLE AND NOTHING ELSE.
// The documented gate is `node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"`, and the
// progress lines below used to go to stdout — so the very command in the header piped
// `── catalogue drift` and thirty `ok …` lines straight into psql ahead of `begin;`. Every one of
// them is a syntax error, and the ones after `begin;` would have aborted the transaction. Found
// 2026-08-11 while re-running the gate. All human-facing output now goes to stderr, which is also
// where it belongs when the tool's product is a stream.
const EMIT = process.argv.includes('--emit');
const say = (msg) => (EMIT ? process.stderr : process.stdout).write(msg + '\n');
let failures = 0;
const fail = (msg) => { failures++; process.stderr.write(`  FAIL  ${msg}\n`); };
const pass = (msg) => say(`  ok    ${msg}`);

// ── PART 1a — catalogue drift ────────────────────────────────────────────
say('── catalogue drift');
{
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-catalogues.mjs'), '--check'],
    { encoding: 'utf8' });
  if (r.status === 0) pass((r.stdout || '').trim() || 'catalogue in sync');
  else fail(`catalogue drift\n${(r.stdout || '') + (r.stderr || '')}`);
}

// ── PART 1b — grant hygiene ──────────────────────────────────────────────
// Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
// default ACL additionally grants it to anon, authenticated and service_role.
// A new SECURITY DEFINER function with no revoke is therefore anon-callable
// the moment it is created — which is exactly what the review found on six of
// them. The rule this enforces: revoke before you grant, every time.
say('── grant hygiene (revoke before grant)');
const sources = new Map();
for (const f of [...BUNDLE, ...ALSO_LINTED]) {
  try { sources.set(f, await readFile(MIG(f), 'utf8')); }
  catch { console.error(`  harness: cannot read ${f}`); process.exit(2); }
}

// ⚠ THE GRANT LINTS READ `code`, NOT `sources`. `code` is the same SQL with
//   `--` comments removed. Until 2026-08-11 they read the raw text, which meant
//   a migration could FAIL ITS OWN LINT for a sentence in its reversibility
//   notes: the §6 "to undo, run `grant execute … to authenticated`" line in
//   2026-08-11-authenticated-surface-lockdown.sql was read as an actual grant,
//   and a `create or replace function public.clan_deposit(…)` used to ILLUSTRATE
//   the footgun was read as an actual definition with no revoke. Both were
//   false, both were fatal, and the pressure a false-positive lint creates is
//   to stop writing the comment — i.e. it taxes exactly the documentation this
//   codebase depends on. The stripper is the same one PART 1c-ii already used;
//   it has simply been moved above its first consumer.
const stripComments = (sql) => sql.split('\n').map((line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") q = !q;
    else if (!q && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');
const code = new Map([...sources].map(([f, sql]) => [f, stripComments(sql)]));

// Functions that are allowed to be reachable by a client role, and by WHICH
// roles. Everything else must be revoked from all four.
// (Was a name→role Map; became name→role[] on 2026-08-11 because
// beta_invite_check is legitimately anon-callable — the invite modal checks a
// code BEFORE sign-up — and a single-role map could only express that by
// weakening the anon rule for everybody.)
const CLIENT_CALLABLE = new Map([
  ['hr_load', ['authenticated']],
  ['hr_create_character', ['authenticated']],
  // Both lose their `authenticated` grant in
  // 2026-08-11-authenticated-surface-lockdown.sql §2 (Group 1) and keep only
  // hr_engine. Left on the list because the four foundation files still grant
  // them at creation time and the lockdown revokes afterwards.
  ['hr_xp_for_level', ['authenticated']],
  ['hr_level_from_xp', ['authenticated']],
  ['market_list', ['authenticated']],
  ['market_cancel', ['authenticated']],
  ['market_buy', ['authenticated']],
  ['hr_server_now', ['authenticated']],
  ['beta_invite_check', ['anon', 'authenticated']],
  // 2026-08-11-clan-membership-authority.sql — S-CAP-1 / S-KICK. These are the
  // server-side join/kick path that `clan-write-policy-pin.sql` recorded as
  // "QUEUED, NOT DONE". All eight are player actions, all eight are gated
  // through hr_rpc_gate, and none is reachable by anon.
  ['clan_create', ['authenticated']],
  ['clan_join', ['authenticated']],
  ['clan_leave', ['authenticated']],
  ['clan_kick', ['authenticated']],
  ['clan_invite', ['authenticated']],
  ['clan_invite_revoke', ['authenticated']],
  ['clan_invites_list', ['authenticated']],
  ['clan_join_policy_set', ['authenticated']],
  // 2026-08-14-leaderboard-view-lockdown.sql — F5. The clan browser's feed,
  // replacing a view that `anon` could read. authenticated only, on purpose:
  // you must be signed in to join a hold, so an anonymous browse was never a
  // feature, only an enumeration surface.
  ['hr_clan_browser', ['authenticated']],
  /* 2026-08-15-auto-eat.sql. The player's own Auto-Eat settings — a client
     action by definition, and deliberately NOT reachable by hr_engine (the
     engine must never switch on a 100-Bounty-Mark trait for somebody).
     SURFACED BY WIDENING `ALSO_LINTED` above, and it is the reason widening was
     worth doing: the DATABASE-side detector already knew about this grant
     (2026-08-15-auto-eat-baseline.sql records it in hr_client_rpc_baseline
     precisely because hr_assert_grant_hygiene check (2) raised on it), while
     this STATIC list had never been told. Two baselines, one of them stale, is
     how the next deliberate grant gets waved through by the check that still
     agrees with it. */
  ['hr_set_auto_eat', ['authenticated']],
  /* The companion equip toggle — the player owns which companion is equipped.
     Ownership-gated + version-bumping + collect-first-guarded (the hr_set_auto_eat
     pattern), deliberately NOT granted to hr_engine (2026-08-20-companion-model.sql
     §5 records the matching hr_client_rpc_baseline row; §6 re-runs the detector). */
  ['hr_companion_equip', ['authenticated']],
  /* 2026-08-20-server-farming.sql — the plant/harvest intent pair. Both are
     player actions (the player owns their own plots), version-bumping,
     seed-debit / yield-credit / farming-XP all server-derived, day-budget
     clamped, and rate-gated (farm_plant / farm_harvest buckets). Deliberately
     NOT granted to hr_engine — the accrual engine never plants or harvests for
     anyone. The migration's §6 records both in hr_client_rpc_baseline and §6b
     re-runs hr_assert_grant_hygiene(true) strict. */
  ['hr_farm_plant',   ['authenticated']],
  ['hr_farm_harvest', ['authenticated']],
  /* worker-settlement slice — the hire/assign INTENTS. hr_worker_hire debits gold
     server-side and writes the crew; hr_worker_assign gates a worker onto a gather
     node re-checked against the player's OWN server level. Both are player actions,
     both rate-gated (worker_hire / worker_assign buckets), NO qty/rate/price
     crosses, and deliberately NOT granted to hr_engine — the engine settles the
     crew's output but never hires or assigns for anyone. §6 records both in
     hr_client_rpc_baseline. */
  ['hr_worker_hire',   ['authenticated']],
  ['hr_worker_assign', ['authenticated']],
  /* 2026-08-22-server-farming-complete.sql — the reconciled farm RPC set adds
     watering and the plot-tier deed upgrade. Both are player actions on the
     player's OWN plots/homestead (server-derived watering window, water XP, and
     the (tier+1)*2 property cap), version-bumping, rate-gated (farm_water bucket
     + the shared farm buckets), NOT granted to hr_engine. */
  ['hr_farm_water',        ['authenticated']],
  ['hr_farm_upgrade_plot', ['authenticated']],
  /* 2026-08-26-marks-record.sql — the bounty-Marks SPEND intent. Server derives
     the reroll cost (5 + paid-rerolls-today*5 from the append-only ledger) and
     abandon fee, clamps to holdings, journals kind='bounty', idempotent, rate-
     gated (bounty_spend bucket). NOT granted to hr_engine. */
  ['hr_bounty_spend',  ['authenticated']],
  /* 2026-08-27-bank-store.sql — the bank move intent (bag<->bank). Value-neutral
     server-side move clamped to holdings, idempotent, journalled kind='bank',
     rate-gated (bank_move bucket). NOT granted to hr_engine. */
  ['hr_bank_move',     ['authenticated']],
  /* 2026-08-28-client-state.sql — the verbatim self-only client_state MERGE.
     Shallow jsonb merge under the per-character lock, idempotent, size-bounded
     (256KiB), rate-gated (client_state_put bucket). NOT authority (a forged value
     is self-only), NOT journalled to player_ledger, NOT granted to hr_engine. */
  ['hr_put_client_state', ['authenticated']],
]);

for (const [file, sql] of code) {
  // Every `create or replace function public.NAME(` in the file.
  const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)]
    .map((m) => m[1]);
  for (const fn of new Set(created)) {
    if (PROBE.test(fn)) {
      // A probe may hold a grant; what it may NOT do is survive the migration.
      if (new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)) {
        pass(`${file}: ${fn}() is a self-check probe and is dropped in-file`);
      } else {
        fail(`${file}: ${fn}() looks like a self-check probe but is never dropped — it would be left behind, granted`);
      }
      continue;
    }
    const revoked = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)[\\s\\S]{0,200}?from[^;]*\\bpublic\\b`,
      'i').test(sql);
    if (!revoked) fail(`${file}: ${fn}() is created but never revoked from PUBLIC`);
    else pass(`${file}: ${fn}() revoked from PUBLIC`);

    // A privileged function must not be granted to a client role.
    const grants = [...sql.matchAll(
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+([^;]+);`, 'gi'))]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()));
    const allowed = CLIENT_CALLABLE.get(fn) || [];
    for (const g of grants) {
      if (g === 'service_role') fail(`${file}: ${fn}() granted to service_role`);
      if ((g === 'anon' || g === 'authenticated') && !allowed.includes(g)) {
        fail(`${file}: ${fn}() granted to ${g} but is not on the client-callable list for that role`);
      }
    }
  }
}

// ── PART 1b-ii — A9: every client-callable SECURITY DEFINER RPC is gated ─
// The standing rule "rate-limit every player-callable RPC" was met on 2 of 43
// when the `authenticated`-surface audit measured it. The retrofit lives in
// 2026-08-11-authenticated-surface-lockdown.sql; THIS is the thing that stops
// it decaying, and the Security Engineer was explicit that the lint is the more
// valuable half of the fix. A retrofit is a one-day event; a lint is a policy.
//
// The rule, stated exactly: a `create or replace function public.X(...)` that
// is SECURITY DEFINER and is granted to anon or authenticated (or is on
// CLIENT_CALLABLE) must reference a rate gate in its own body.
//
// ⚠ WHAT THIS CANNOT SEE, said out loud so nobody mistakes green for total
//   coverage: the A9 retrofit builds its 35 wrappers with dynamic SQL inside a
//   `do $$` block, so no `create or replace function public.<name>` literal
//   exists for them and this lint is silent about all 35. That half is covered
//   at RUNTIME by check (8) inside hr_assert_grant_hygiene(), which runs at
//   every migration and nightly via pg_cron. Two halves, neither sufficient:
//   the lint catches a NEW hand-written RPC before it merges; the runtime check
//   catches a wrapper that a re-applied older migration silently overwrote.
say('── A9: client-callable SECURITY DEFINER RPCs reference a rate gate');
{
  const GATE = /hr_rpc_gate|hr_rate_gate|hr_rate_ok/;
  let checked = 0;
  for (const [file, sql] of code) {
    const defs = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)];
    for (let i = 0; i < defs.length; i++) {
      const fn = defs[i][1];
      if (PROBE.test(fn)) continue;
      // The body is everything up to the next `create or replace function`.
      const body = sql.slice(defs[i].index, i + 1 < defs.length ? defs[i + 1].index : sql.length);
      const header = body.slice(0, body.indexOf('$$') < 0 ? 400 : body.indexOf('$$'));
      if (!/security\s+definer/i.test(header)) continue;
      const grantedToClient = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*to\\s+[^;]*\\b(anon|authenticated)\\b`,
        'i').test(sql);
      if (!grantedToClient && !CLIENT_CALLABLE.has(fn)) continue;
      checked++;
      if (!GATE.test(body)) {
        fail(`${file}: ${fn}() is SECURITY DEFINER and client-callable but references no rate gate. `
           + 'Add `if not public.hr_rpc_gate(\'<bucket>\') then return … rate_limited … end if;` as its '
           + 'first statement and add the bucket to hr_rpc_gate\'s `case` in '
           + '2026-08-11-authenticated-surface-lockdown.sql §2b. A player-callable RPC with no rate '
           + 'limit is a free denial-of-service against the whole project (A9).');
      }
    }
  }
  if (!failures) pass(`${checked} client-callable SECURITY DEFINER RPC(s) reference a rate gate`);
}

// hr_apply in particular: exactly one grantee, and it must be hr_engine.
{
  const sql = sources.get('2026-08-11-apply-engine.sql') || '';
  const grants = [...sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.hr_apply\s*\([^)]*\)\s*to\s+([^;]+);/gi)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()));
  if (grants.length === 1 && grants[0] === 'hr_engine') pass('hr_apply is granted to hr_engine and nothing else');
  else fail(`hr_apply grantees are [${grants.join(', ')}] — must be exactly [hr_engine]`);
}

// ── PART 1c — rollback hygiene (the S2 lint) ─────────────────────────────
// Inside hr_apply's protected block, a bare `return` after a write commits the
// write. Every rejection there must go through hr_reject(), which raises.
say('── rollback hygiene (no bare return after a write in hr_apply)');
{
  const sql = sources.get('2026-08-11-apply-engine.sql') || '';
  const start = sql.indexOf('THE PROTECTED BLOCK');
  const end = sql.indexOf('when sqlstate \'HR000\' then', start);
  if (start < 0 || end < 0) fail('could not locate hr_apply\'s protected block — has the shape changed?');
  else {
    const body = sql.slice(start, end);
    const bad = [...body.matchAll(/^\s*return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*false/gim)];
    if (bad.length) fail(`${bad.length} bare rejection return(s) inside the protected block — use hr_reject()`);
    else pass('every rejection in the protected block raises');
    if (!/perform\s+public\.hr_reject\(/.test(body)) fail('the protected block never calls hr_reject()');
    else pass(`hr_reject() is used ${[...body.matchAll(/perform\s+public\.hr_reject\(/g)].length} times`);
  }
}

// ── PART 1c-ii — to_regproc must never be handed an argument list ────────
// to_regproc takes a bare NAME. It returns NULL for "missing" AND for
// "ambiguous", and it does not parse an argument list at all — so
// `to_regproc('cron.schedule(text,text,text)')` is NULL on every database in
// the world. Two preconditions were written that way, which meant
// player-state.sql and market-v2.sql aborted on EVERY apply. Nobody caught it
// in three reviews because reading it looks right; it was found the first time
// the file was actually executed (branch run, 2026-08-11). The arg-typed form
// is to_regprocEDURE.
// Both lints below read CODE, not prose: a `--` comment that quotes the wrong
// form (this file's own explanations do exactly that) must not trip them. The
// stripper only removes a `--` that is not inside a string literal, judged by
// the parity of unescaped quotes ahead of it on the line — enough for SQL we
// control, and it fails toward keeping text rather than dropping it.
// (`stripComments` and `code` moved above PART 1b on 2026-08-11 so the GRANT
//  lints get the same treatment — see the note there.)

say('── to_regproc vs to_regprocedure');
{
  let bad = 0;
  for (const [file, sql] of code) {
    for (const m of sql.matchAll(/to_regproc\s*\(\s*'([^']*)'/gi)) {
      if (m[1].includes('(')) { fail(`${file}: to_regproc('${m[1]}') is ALWAYS NULL — use to_regprocedure`); bad++; }
    }
  }
  if (!bad) pass('no to_regproc() call is given an argument list');
}

// ── PART 1c-iii — every rate-limit rejection must be recorded (review C2) ─
// The rate limit returns before the intent claim, so without an explicit
// hr_record_rejection the loudest automation signal the server produces
// vanishes: no ledger row, no intent row, nothing. Same defect class as R4.
say('── rate-limit rejections are observable (C2) and sampled (S6)');
{
  let bad = 0, seen = 0;
  for (const [file, sql] of code) {
    // Each `if not …hr_rate_ok(…) then … end if;` block must mention
    // hr_record_rejection before it returns.
    for (const m of sql.matchAll(/if\s+not\s+public\.hr_rate_ok\([\s\S]*?end if;/gi)) {
      seen++;
      if (!/hr_record_rejection/.test(m[0])) {
        fail(`${file}: a hr_rate_ok() rejection returns without hr_record_rejection (C2)`);
        bad++;
      }
      // S6: …and it must be SAMPLED. An unconditional write on the rate-limit
      // path means a retry storm costs a row lock and a WAL record per request,
      // all serialised on one tuple — the server doing more durable work the
      // harder it is hammered. The gate is hr_rate_sample_weight() > 0.
      if (!/hr_rate_sample_weight/.test(m[0])) {
        fail(`${file}: a hr_rate_ok() rejection records unconditionally — gate it on hr_rate_sample_weight() (S6)`);
        bad++;
      }
    }
  }
  if (!bad) pass(`all ${seen} rate-limit rejections are recorded and sampled`);
}

// ── PART 1c-iv — no migration may control its own transaction (review S5) ─
// 2026-08-11-telemetry-retention.sql shipped with a top-level `begin;`/`commit;`
// and was therefore UNAPPLIABLE by every transactional tool in the toolchain
// (Supabase MCP apply_migration, `supabase db push`, `psql -1`, every migration
// runner) — each of those already wraps the file, so the nested `begin` is an
// error or a no-op and the `commit` closes the OUTER transaction early, leaving
// the rest of the file running unprotected. The retention fix sat undeployed
// for a day while reading as shipped. A migration is a sequence of statements;
// its runner owns the transaction. Atomic sections go in a `do $$ … $$` block.
say('── no top-level transaction control in a migration (S5)');
{
  let bad = 0;
  for (const [file, sql] of code) {
    sql.split('\n').forEach((line, i) => {
      // Column 0 ONLY, and `end;` is deliberately not in the list. Every
      // PL/pgSQL block in these files is indented inside a `do $$`, and a
      // nested block legitimately closes with an indented `end;` — matching
      // those would make this lint noise, and a noisy lint gets deleted.
      if (/^(begin|commit|rollback|start\s+transaction)\s*;\s*$/i.test(line)) {
        fail(`${file}:${i + 1}: top-level \`${line.trim()}\` — a migration must not control its own transaction (S5)`);
        bad++;
      }
    });
  }
  if (!bad) pass('no migration opens or closes a transaction');
}

// ── PART 1c-iii — ONE OWNER FOR clan_members."join as self" ──────────────
// On 2026-08-11 two parallel security passes defined this one policy within an
// hour of each other. `raid-claim-authority` (R4) pinned `joined_at`, which is
// an authorisation input for raid_claim's joined_after_kill /
// joined_after_declare and for clan-seat's 72h alt gate.
// `clan-membership-authority` (S-CAP-1) added the invite-only door plus the
// cp_at / last_seen pins. `c` sorts before `r`, so a replay of the migrations
// in filename order would have run R4's shorter definition LAST and silently
// deleted the door — while R4's own assertion still passed, because it only
// checks that `joined_at` appears.
//
// This is the same hazard 2026-08-11-authenticated-surface-lockdown.sql §2b
// names about hr_rpc_gate's `case`, in a place where the two owners cannot be
// split into separate objects. So the rule is enforced statically instead:
// exactly ONE migration may define this policy, and that definition must carry
// every term the live policy is relied upon for. A file that reintroduces a
// second definition fails the build rather than the game.
say('── one owner for clan_members."join as self"');
{
  const DEF = /create\s+policy\s+"join as self"/i;
  // COMMENTS MUST BE STRIPPED FIRST. The two files that ceded ownership each
  // say so in a comment that quotes the statement they removed — and without
  // this, that sentence re-registers them as owners and the check reports a
  // conflict that does not exist. Caught by running it, not by reading it.
  const uncommented = (sql) => sql.replace(/--[^\n]*/g, '');
  const owners = [...sources.entries()]
    .filter(([, sql]) => DEF.test(uncommented(sql))).map(([f]) => f);
  if (owners.length !== 1) {
    fail(`clan_members."join as self" is defined in ${owners.length} migration(s) [${owners.join(', ')}] — `
       + 'exactly one file may own it. Whichever applies second silently deletes the other\'s terms; '
       + 'that is how the invite-only door (S-CAP-1) gets dropped without any assertion noticing.');
  } else {
    const sql = sources.get(owners[0]);
    // Everything the live policy is depended on for, by the system that depends
    // on it. Each term is here because something else would break without it.
    const TERMS = [
      ['auth.uid() = user_id', /auth\.uid\(\)\s*=\s*user_id/,          'a caller could insert somebody else'],
      ['joined_at',            /joined_at\s+between/i,                  'R4: raid_claim / the 72h alt gate read it'],
      ['cp_at',                /cp_at\s+between/i,                      'a future cp_at makes CP immune to decay'],
      ['last_seen',            /last_seen\s+is\s+null/i,                'rested-XP charges are keyed on it'],
      ['join_policy',          /join_policy\s*=\s*'open'/i,             'S-CAP-1: the invite-only door'],
      ['contributed',          /contributed\s*=\s*0/i,                  'a forged contribution ranks on the clan board'],
      ['cp',                   /\bcp\s*=\s*0/i,                         'CP is castle standing'],
      ['charge',               /charge\s+is\s+null/i,                   'a forged charge is an officer commission'],
    ];
    let bad = 0;
    for (const [name, re, why] of TERMS) {
      if (!re.test(sql)) { bad++; fail(`${owners[0]}: the join policy no longer pins \`${name}\` — ${why}`); }
    }
    if (!bad) pass(`${owners[0]} is the sole owner of "join as self" and pins all ${TERMS.length} load-bearing terms`);
  }
}

// ── PART 1d — the migrations must be self-verifying ──────────────────────
say('── self-verification blocks');
for (const [file, sql] of sources) {
  if (/raise\s+exception/i.test(sql) && /do\s+\$\$/.test(sql)) pass(`${file}: has assertions`);
  else fail(`${file}: no self-verifying do-block`);
}

// ── PART 1e — the destructive-migration interlocks must still be there ───
// These are the two properties that stop a migration from being a footgun. A
// lint is the only thing that notices when someone "simplifies" one away.
say('── destructive-migration interlocks');
{
  const mv2 = sources.get('2026-08-17-market-v2.sql') || '';
  if (/hearthrise\.market_wipe_ok/.test(mv2) && /REFUSING TO WIPE THE MARKET/.test(mv2)) {
    pass('market-v2: drop is gated on hearthrise.market_wipe_ok, not on a comment');
  } else {
    fail('market-v2: the DROP TABLE has no wipe gate — a prose warning is not an interlock');
  }
  if (/drop table if exists public\.market_listings cascade/i.test(mv2)
      && !/create table if not exists public\.market_listings/i.test(mv2)) {
    pass('market-v2: re-runnability comes from the drops (documented coupling holds)');
  } else if (/create table if not exists public\.market_listings/i.test(mv2)) {
    pass('market-v2: creates are if-not-exists, so the drops are no longer load-bearing');
  }
  // R1: the escrow-destroying cron job must be removed BY THE MIGRATION.
  if (/trim-expired-listings/.test(mv2) && /hr_cron_drop\('trim-expired-listings'\)/.test(mv2)) {
    pass('market-v2: unschedules trim-expired-listings in-file (R1)');
  } else {
    fail('market-v2: does NOT unschedule trim-expired-listings — applying it ARMS a nightly job that deletes escrow');
  }
  // C-c: …and it must do so BEFORE it creates the column that arms the job.
  // §9(h) asserts the end state, which cannot distinguish "disarmed first" from
  // "disarmed 650 lines later" — and only the first is safe if the apply is not
  // transactional (psql without -1, a tool that splits on `;`, an apply that
  // dies halfway). Deleting the ordering dependency beats documenting it, so
  // the order is a lint rather than a paragraph.
  {
    const drop = mv2.indexOf("hr_cron_drop('trim-expired-listings')");
    const create = mv2.search(/create\s+table\s+public\.market_listings/i);
    if (drop >= 0 && create >= 0 && drop < create) {
      pass('market-v2: the escrow-destroying job is disarmed BEFORE market_listings.expires_at exists (C-c)');
    } else {
      fail('market-v2: hr_cron_drop(\'trim-expired-listings\') must appear BEFORE `create table public.market_listings` '
         + '— otherwise a non-transactional apply leaves a window where the nightly delete is armed against live escrow (C-c)');
    }
    if (/hearthrise\.market_cron_disarmed/.test(mv2)) {
      pass('market-v2: §9 asserts the disarm actually ran in this session (C-c)');
    } else {
      fail('market-v2: nothing asserts that the §0c disarm ran — deleting it would be silent (C-c)');
    }
  }
  if (/hr_cron_ensure\('hr-market-expire'/.test(mv2)) pass('market-v2: schedules market_expire (R1)');
  else fail('market-v2: market_expire is never scheduled — expiry is assumed, not wired');
  if (/hr_cron_drop\('trim-market-sales'\)/.test(mv2)) pass('market-v2: retires the broken sold_at job (R2)');
  else fail('market-v2: trim-market-sales is left erroring nightly (R2)');
}

// ── PART 1f — every unbounded table ships its retention policy ───────────
// The rule, and the reason it is a lint: game_events had a prune function and
// no schedule, and reached 1.6M rows / 229 MB from six players in 3.45 days.
say('── retention policies are wired');
{
  const ps = sources.get('2026-08-11-player-state.sql') || '';
  const mv2 = sources.get('2026-08-17-market-v2.sql') || '';
  const all = ps + mv2;
  for (const job of ['hr-ledger-prune', 'hr-intents-prune', 'hr-progress-prune',
                     'hr-rejections-prune', 'hr-market-expire', 'hr-market-sales-prune']) {
    if (new RegExp(`hr_cron_ensure\\('${job}'`).test(all)) pass(`${job} is scheduled in-migration`);
    else fail(`${job} is not scheduled — a retention policy that is a runbook step does not exist`);
  }
  // RL2: the ledger must be deletable at all, or retention is impossible.
  if (/before update or delete on public\.player_ledger/i.test(ps)
      && /tg_op = 'DELETE'/.test(ps) && /retention window/.test(ps)) {
    pass('player_ledger: UPDATE always refused, DELETE refused only inside the retention window');
  } else {
    fail('player_ledger: the immutability trigger must allow deletes OUTSIDE the retention window (RL2)');
  }
  if (/primary key \(at, id\)/.test(ps)) pass('player_ledger PK is (at, id) — partitionable without a rebuild');
  else fail('player_ledger PK does not lead with `at` (RL2d)');
}

// ── PART 1f-ii — a RESTATED BODY is DERIVED, not retyped, and one file is last ─
// FOUR objects are graded here by ONE mechanism: `hr_apply` (four migrations now
// restate the whole 47-56 KB body), `hr_rate_gate` (four restate the whole
// gate), `hr_perks_of` (two) and `hr_assert_grant_hygiene` (two — THE DETECTOR,
// added 2026-08-16). Each link was built by extracting its predecessor's text
// programmatically and patching it at named anchors — because retyping it is how
// a fix that landed last week silently disappears, and because `create or
// replace` on a body you have not read is the single most destructive statement
// in this repo. The migrations each assert this at APPLY time against pg_proc;
// this is the STATIC half, and it is the only one that runs without a database.
//
// The check: every line of a predecessor's body must survive into its
// successor's, except a small list of lines the successor DECLARES it replaced.
// An undeclared removal is a fix that vanished. A declared removal that is no
// longer there means the anchor moved and the derivation was re-done by hand.
//
// ⚠ WHY IT GRADES TWO OBJECTS AS OF 2026-08-16. It was written for hr_apply, and
//   the gate then produced the identical near-miss: 2026-08-16-claim-reward.sql
//   restated hr_rate_gate from the PRE-`shop` body, so applying it after
//   2026-08-15-gold-intents.sql (which production runs) would have deleted the
//   `shop` arm and answered every shop_buy and vendor_sell 429 forever, with
//   claim-reward's own self-check green because it asserted only its own arm.
//   A guard that grades one object is not a guard against the defect class; it
//   is a guard against the instance that produced it.
//
// ⚠ AND WHY IT GRADES THE DETECTOR ITSELF. 2026-08-16-engine-allowlist-claim-
//   perks.sql restates hr_assert_grant_hygiene to record two reviewed engine
//   grants. Every other body on this list fails LOUDLY when it is damaged — a
//   broken hr_apply is a broken game within the hour. A damaged DETECTOR fails
//   SILENTLY, and reads as a clean night for as long as nobody looks. That
//   asymmetry is the argument for grading it here rather than trusting review.
const DERIVED_BODIES = [
  {
    fn: 'hr_apply',
    open: 'create or replace function public.hr_apply(',
    chain: HR_APPLY_CHAIN,
    chainName: 'HR_APPLY_CHAIN',
  },
  {
    fn: 'hr_state_of',
    open: 'create or replace function public.hr_state_of(',
    chain: HR_STATE_OF_CHAIN,
    chainName: 'HR_STATE_OF_CHAIN',
  },
  {
    fn: 'hr_rate_gate',
    open: 'create or replace function public.hr_rate_gate(',
    chain: HR_RATE_GATE_CHAIN,
    chainName: 'HR_RATE_GATE_CHAIN',
  },
  {
    fn: 'hr_perks_of',
    open: 'create or replace function public.hr_perks_of(',
    chain: HR_PERKS_OF_CHAIN,
    chainName: 'HR_PERKS_OF_CHAIN',
  },
  {
    fn: 'hr_assert_grant_hygiene',
    open: 'create or replace function public.hr_assert_grant_hygiene(',
    chain: HR_GRANT_HYGIENE_CHAIN,
    chainName: 'HR_GRANT_HYGIENE_CHAIN',
  },
];

for (const SPEC of DERIVED_BODIES) {
say(`── ${SPEC.fn} derivation chain (each body derived from the last, nothing retyped)`);
{
  const applyBody = (file) => {
    const sql = (sources.get(file) || '').replace(/\r\n/g, '\n');
    const i = sql.indexOf(SPEC.open);
    if (i < 0) return null;
    const j = sql.indexOf('\nend $$;\n', i);
    if (j < 0) return null;
    const fn = sql.slice(i, j);
    return fn.slice(fn.indexOf('$$') + 2);
  };

  /* Lines a link is ALLOWED to remove, and why. Anything else removed is a
     silent regression; anything here that is no longer removed means the
     derivation drifted and this list is stale. Both directions are fatal.

     Keyed by successor filename across BOTH chains — the filenames are unique,
     and no file appears in both chains (a file that restated hr_apply AND
     hr_rate_gate would need its removals split, and is not a thing that exists). */
  const DECLARED_REMOVALS = {
    /* hr_perks_of: 2026-08-20-renown.sql restates artisan-progress-model's body
       to wire the renown channel. It is a faithful SUPERSET — the whole artisan
       gate (v_recipes + its select + the 'recipes' source line + unlockedRecipes)
       is carried verbatim — and changes exactly TWO lines: the renownAllXp value
       (0 -> v_renown_allxp) and the sources.renown census entry (blocked -> derived).
       Anything else it drops (e.g. the unlockedRecipes projection, the bug this
       chain was extended to catch) would be an UNDECLARED removal and fail. */
    '2026-08-20-renown.sql': [
      "    'renownAllXp', 0,",
      "      'renown',     'blocked:no_server_renown_score',",
    ],
    /* hr_perks_of: 2026-08-20-companion-model.sql restates renown's body to add
       the equipped-companion channel. It is a faithful SUPERSET — the artisan
       gate, the renown channel and every other source line are carried verbatim
       — and INSERTS the companion read + the `companion` returned field (both
       additive). The ONLY line it removes is the companions census entry, whose
       value changes from blocked to derived. */
    '2026-08-20-companion-model.sql': [
      "      'companions', 'blocked:no_server_pet_model')",
    ],
    '2026-08-15-intent-key-hygiene.sql': [
      // C3: the replay lookup and its comparison also read `slot`.
      '  select result, intent into v_prev, v_prev_intent from public.player_intents',
      '    if v_prev_intent is distinct from v_this_intent then',
      "        jsonb_build_object('stored', v_prev_intent, 'sent', v_this_intent));",
      // C1: step (5) becomes a branch — release on version_conflict, else store.
      '  update public.player_intents',
      "     set result = case when coalesce(v_out->>'ok','false') = 'true'",
      "                       then jsonb_build_object('ok', true)",
      '                       else v_out end',
      '   where user_id = v_uid and intent_id = p_intent_id;',
    ],
    '2026-08-15-tool-carry.sql': [
      // c_delta_keys gains 'tool_carry' on its last line.
      "    'farm','progress','progress_claim','journal'];",
    ],
    '2026-08-15-gem-daily-budget.sql': [
      // The budget call gains a sixth argument…
      '    v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in);',
      // …and the ledger insert gains gems_in, in both its column and value list.
      '      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)',
      '       v_gold_in, v_xp_in, v_qty_in,',
    ],
    /* ── Phase 0, live settlement. TWO replacements, both named. Everything
       else in this link is an insertion (the declares, the (4a-iii) validation
       block, two lines in the UPDATE's CASE, the post-state void).
         · c_delta_keys' terminator, which gains 'fight'.
         · step (5)'s intent-key release predicate, which widens from the single
           literal 'version_conflict' to `any (c_release_codes)` — Security F3,
           2026-08-16: a bad_fight_hp rejection moves neither the watermark nor
           the version, so the accrual engine re-derives a byte-identical key
           and replays the stored rejection for up to 25 hours. The long comment
           block above that branch is UNCHANGED and correctly not listed.
       A third removal here would be a silent regression. */
    '2026-08-17-fight-carry.sql': [
      "    'tool_carry'];",
      "     and v_out->>'error' = 'version_conflict' then",
    ],

    /* ── b366, Phase 2 — ONE declared replacement, and it is the terminator of
       the c_release_codes array literal. Everything else in this link is
       INSERTION: the comment block explaining why the equip block's refusals
       belong on the list, and the five new codes.

       ⚠ THE ONE THING THIS LINK MUST NOT DO IS SHORTEN THE LIST. A patch that
         REPLACED the array instead of extending it would drop
         'unknown_skill' / 'unknown_item' / 'unknown_activity' and bring the
         b361 accrual-key brick back through the fix for it — so the migration's
         own §3(b) reads the landed literal and asserts all thirteen codes by
         name, and this entry pins the fact that exactly one line changed. */
    '2026-08-18-equip-release-codes.sql': [
      "    'unknown_skill', 'unknown_item', 'unknown_activity'];",
    ],

    /* ── b370 — the permanent fix for the `unknown_skill` incident. THREE
       declared removals, and they are the whole of the old XP write: the
       UPDATE, its WHERE, and the row-count read. Everything else in this link
       is INSERTION — the comment block, the true-unknown check against
       hr_skills, and the upsert.

       ⚠ WHAT SURVIVES VERBATIM AND IS THEREFORE CORRECTLY *NOT* LISTED is the
         `perform public.hr_reject('unknown_skill', …)` call and its closing
         `end if;`. The code is still raised — for a genuinely stale catalogue
         instead of for a missing row — and a FIFTH removal here would mean it
         stopped being raised at all, i.e. a client string could mint a
         player_skills row, because there is no FK from player_skills.skill_id
         to hr_skills. The guard predicate above it changes (`if v_rows <> 1
         then` -> `if not exists (select 1 from public.hr_skills …) then`), so
         the old line is a real removal and is listed. */
    '2026-08-18-skill-row-upsert.sql': [
      '        update public.player_skills set xp = xp + v_n',
      '          where user_id = v_uid and slot = v_slot and skill_id = k;',
      '        get diagnostics v_rows = row_count;',
      '        if v_rows <> 1 then',
    ],

    /* ── ELEMENTS/ENCHANTING v1 — FOUR declared replacements in hr_apply, and
       every one is a terminator or a condition that GAINS a term. Everything
       else in this link is INSERTION: the v_enchant_el declare, the whole
       enchant block before BANK CAP, and the extended comment. A fifth removal
       would be a silent regression.
         · c_delta_keys' terminator gains 'enchant'.
         · the §S5 stamp condition gains `or p_delta ? 'enchant'` (so an enchant
           closes the accrual window — the collect-before-enchant order).
         · c_ledger_kinds' terminator gains 'enchant' (journal.kind:'enchant').
         · c_release_codes' terminator gains 'bad_enchant' (shape refusal, like
           bad_equip; insufficient_item stays OFF — the ownership check). */
    '2026-08-18-enchant.sql': [
      "    'fight'];",
      "    if p_delta ? 'equip' or p_delta ? 'activity' then",
      "    'quest','equip','admin','iap','clan','raid'];",
      "    'too_many_equip_ops'];",
    ],

    /* ── worker-settlement slice — TWO declared replacements in hr_apply, and
       both are array terminators that GAIN a term. Everything else in this link
       is INSERTION: the c_max_worker_ops declare, the whole (4a-iv) worker
       validation block before the daily budget, and the workers_accrued_to line
       in the UPDATE's SET clause. A third removal would be a silent regression.
         · c_delta_keys' terminator gains 'workers' + 'workers_accrued_to'.
         · c_ledger_kinds' terminator gains 'worker' (journal.kind:'worker'). */
    '2026-08-25-workers.sql': [
      "    'enchant'];",
      "    'quest','equip','admin','iap','clan','raid','enchant'];",
    ],

    /* ── hr_rate_gate's two HISTORIC links ────────────────────────────────
       Both removals are cosmetic and both are REAL: they are what a human
       retyping a 40-line body does, and they are exactly why this check now
       covers the gate. Declared rather than normalised away — a whitespace-
       insensitive comparison would also stop seeing a limit changed from 30 to
       3,000 by an editor's re-indent, and the point of the check is that a line
       which changed at all is a line somebody has to account for. */
    '2026-08-15-activity-intent.sql': [
      // The `accrue` arm was re-ALIGNED (one space -> three) when the `activity`
      // arm was added under it. Same limit, same window, same bucket.
      "    when 'accrue' then v_limit := 30; v_window := interval '1 minute';",
    ],
    '2026-08-15-gold-intents.sql': [
      // Prose only: "Server-owned, both of them" -> "all of them", once the
      // second bucket became a third.
      '  -- THE ALLOWLIST AND THE LIMITS. Server-owned, both of them. An unknown bucket',
    ],

    /* ── hr_assert_grant_hygiene's ONE replacing link (b354, Security C3) ──
       The first two links are pure insertions (allowlist entries), which is why
       this chain had an empty list until now. Check (4) could not be widened by
       insertion: it is a single SELECT whose WHERE clause IS the rule, and the
       new rule is a UNION of two populations — the historical
       TRUNCATE/REFERENCES/TRIGGER scan, plus "a client write grant on a table
       with RLS on and NO write policy", minus hr_client_write_baseline. These
       four lines are that SELECT. A fifth removal is a silent regression. */
    '2026-08-16-client-write-grant-sweep.sql': [
      "  select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb) into v_client_trunc",
      '    from information_schema.role_table_grants',
      "   where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')",
      "     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');",
    ],

    /* ── hr_assert_grant_hygiene's SECOND replacing link (b350, Security batch 5)
       — THE DETECTOR TAKEOVER. Batch 1 could only widen the VERB LIST; it stayed
       on information_schema, which reports SQL-standard privileges (no MAINTAIN)
       and omits matviews. Batch 5 replaces the whole two-arm SELECT with a
       has_table_privilege query over pg_class. The fifteen lines below are batch
       1's information_schema query; the shared lines (`select coalesce(... into
       v_client_trunc from (`, `union all`, `and c.relrowsecurity`, `) x;`)
       survive into the new body and are correctly NOT listed. A sixteenth removal
       would be a silent regression. */
    '2026-08-16-client-write-grant-sweep-5.sql': [
      '    select table_name as g',
      '      from information_schema.role_table_grants',
      "     where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')",
      "       and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')",
      "    select g.table_name || ':' || g.grantee || ':' || g.privilege_type",
      '      from information_schema.role_table_grants g',
      '      join pg_class c on c.relname = g.table_name',
      "                     and c.relnamespace = 'public'::regnamespace",
      "     where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')",
      "       and g.privilege_type in ('INSERT','UPDATE','DELETE')",
      '       and not exists (select 1 from pg_policies p',
      "                        where p.schemaname = 'public' and p.tablename = g.table_name",
      "                          and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))",
      '       and not exists (select 1 from public.hr_client_write_baseline b',
      '                        where b.table_name = g.table_name and b.grantee = g.grantee)',
    ],

    /* ── market v2, link 5 (Security M7), rebased onto batch 5's body ────────
       An insertion (three engine grants at the head of c_engine_allow) PLUS one
       removal: the stale `market_expire(integer)` entry, whose function was
       renamed hr_market_expire and is asserted NOT engine-holdable. Its comment
       line and its entry line are these two declared removals; anything else this
       link drops is a silent regression. */
    '2026-08-17-market-v2.sql': [
      '    -- writes, but only the "return the lapsed seller\'s own goods" path, capped at 200',
      "    'market_expire(integer)',",
    ],
  };

  /* ── PER-FUNCTION DECLARED REMOVALS ──────────────────────────────────────
     The flat map above is keyed by successor filename and worked while no file
     restated two chained bodies. hr_state_of breaks that: 2026-08-15-tool-carry,
     2026-08-17-fight-carry AND 2026-08-18-enchant each restate BOTH hr_apply and
     hr_state_of, so the SAME filename has DIFFERENT removals in the two chains.
     A flat entry would report the hr_apply removals as "unused" against the
     hr_state_of body (and vice versa). So hr_state_of gets its own map, and the
     lookup below prefers a per-fn map when one exists for SPEC.fn — the flat map
     is then hr_apply's/hr_rate_gate's/… as before, untouched. */
  const DECLARED_REMOVALS_BY_FN = {
    hr_state_of: {
      /* auto-eat inserts the three auto_eat_* keys after `accrued_to` — so the
         `accrued_to)` terminator gains a comma (a real line change), and the
         "server clock" and "BOUNDED (RL4)" comment blocks were reflowed/moved as
         the object grew. All comments or a terminator; nothing structural. */
      '2026-08-15-auto-eat.sql': [
        '    -- The server clock, so the client renders countdowns without ever',
        '    -- consulting its own.',
        "      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to),",
        '    -- BOUNDED (reliability RL4). Revision 2 read every player_progress row a',
        '    -- character had ever accumulated, on every session start, with no filter',
        '    -- and no limit — and player_progress mints a permanent row per counter per',
        '    -- PERIOD. At 6 dailies that is +2,190 rows/player/year that this query',
        '    -- would keep dragging across the wire forever.',
        '    --   • period rows are filtered to the SAME window hr_progress_prune keeps',
        "    --     (31 days), so the read and the retention policy cannot disagree;",
        "    --   • permanent rows (period_key = '') are unfiltered — they are bounded by",
        '    --     content, and dropping one would hide a completed quest;',
        '    --   • a hard LIMIT is the backstop, and `progress_truncated` tells the',
        '    --     client the truth instead of silently shortening its world.',
      ],
      // tool-carry inserts `tool_carry` after the auto_eat block — the last
      // auto_eat key's terminator gains a comma.
      '2026-08-15-tool-carry.sql': [
        "      'auto_eat_pct', v_st.auto_eat_pct),",
      ],
      // fight-carry inserts `fight` after tool_carry — that terminator gains a comma.
      '2026-08-17-fight-carry.sql': [
        "      'tool_carry', v_st.tool_carry),",
      ],
      // ELEMENTS v1 inserts `enchant` after `equipment` — the equipment lines are
      // preserved verbatim, so this link removes NOTHING. An empty list is the
      // strongest form: nothing of fight-carry's hr_state_of may go.
      '2026-08-18-enchant.sql': [],
      /* live-progress Slices 2+3 inserts the streak fields directly after the
         `fight` projection, so the `'fight', v_st.fight)` terminator gains the
         two streak keys — that ONE line changes (`),` -> `,`). The two
         prefix-exclusion patches are pure insertions into the progress subquery.
         So this link removes exactly the old fight terminator; anything else it
         drops is a silent regression (e.g. the `fight` projection vanishing). */
      '2026-08-21-streak-state.sql': [
        "      'fight', v_st.fight),",
      ],
      /* inventory-flip Step B1 inserts `inventory_complete` directly after the
         `total_level` field, so the `total_level` terminator gains a trailing
         comma — that ONE line changes. Everything else (the whole streak/enchant/
         fight/exclusion body) is carried verbatim; anything else it drops is a
         silent regression. */
      '2026-08-24-inventory-complete.sql': [
        "    'total_level', public.hr_total_level(p_user, v_st.slot)",
      ],
      /* worker-settlement slice ANDs a THIRD ARM onto inventory_complete. The
         pointer `(case…end)` is already a parenthesised boolean, so the third arm
         is appended with ` and (…)` — no line changes. The crew-watermark
         projection and the crew array are likewise pure insertions. An empty list
         is the strongest form: nothing of the inventory-complete body may go. */
      '2026-08-25-workers.sql': [],
      /* Bounty-Marks record inserts `'marks', v_st.marks,` on its OWN new line
         directly after the `'gems', v_st.gems,` line (which already ends in a comma
         and is carried verbatim). Pure insertion — an empty list is the strongest
         form: nothing of the workers body may go. */
      '2026-08-26-marks-record.sql': [],
    },
  };

  let chainOk = true;
  for (let k = 1; k < SPEC.chain.length; k++) {
    const from = SPEC.chain[k - 1];
    const to = SPEC.chain[k];
    const a = applyBody(from);
    const b = applyBody(to);
    if (!a || !b) {
      fail(`${SPEC.fn} derivation: cannot extract the body from ${!a ? from : to} — has the shape changed?`);
      chainOk = false;
      continue;
    }
    const have = new Map();
    for (const line of b.split('\n')) have.set(line, (have.get(line) || 0) + 1);
    const removed = [];
    for (const line of a.split('\n')) {
      const c = have.get(line) || 0;
      if (c > 0) have.set(line, c - 1);
      else removed.push(line);
    }
    const perFn = DECLARED_REMOVALS_BY_FN[SPEC.fn];
    const declared = perFn ? (perFn[to] || []) : (DECLARED_REMOVALS[to] || []);
    const undeclared = removed.filter((l) => !declared.includes(l));
    const unused = declared.filter((l) => !removed.includes(l));
    if (undeclared.length) {
      chainOk = false;
      fail(`${to}: its ${SPEC.fn} DROPS ${undeclared.length} line(s) of ${from}'s body that it does not `
         + 'declare. A restatement that loses a line loses whatever that line was defending, and the '
         + 'migration\'s own §0 can only check the terms somebody remembered to list. First:\n'
         + undeclared.slice(0, 3).map((l) => `            ${JSON.stringify(l)}`).join('\n'));
    }
    if (unused.length) {
      chainOk = false;
      fail(`${to}: DECLARED_REMOVALS lists ${unused.length} line(s) that are not actually removed from `
         + `${from}'s body — the anchor moved, so this list is documenting a derivation that no longer `
         + 'happened. First: ' + JSON.stringify(unused[0]));
    }
    if (!undeclared.length && !unused.length) {
      pass(`${to}: ${SPEC.fn} is ${from}'s body + insertions, with ${declared.length} declared replacement(s)`);
    }
  }

  // ONE LAST TOUCHER, and the apply order must agree with this file about who it
  // is. Two lists that disagree is exactly the clan_members "join as self"
  // defect: filename order installs the wrong one and every self-check passes.
  const last = SPEC.chain[SPEC.chain.length - 1];
  const DEF_RE = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${SPEC.fn}\\s*\\(`, 'i');
  const definers = [...sources.entries()]
    .filter(([, sql]) => DEF_RE.test(stripComments(sql)))
    .map(([f]) => f).sort();
  if (definers.join('|') !== [...SPEC.chain].sort().join('|')) {
    fail(`the files that replace ${SPEC.fn} are [${definers.join(', ')}] but ${SPEC.chainName} says `
       + `[${[...SPEC.chain].sort().join(', ')}]. A file that restates ${SPEC.fn} and is not in the `
       + 'chain is a body nobody has proven is derived from the one it replaces.');
    chainOk = false;
  }
  {
    const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
    const positions = SPEC.chain.map((f) => order.indexOf(f));
    if (positions.some((p) => p < 0)) {
      fail(`a ${SPEC.fn} file is missing from schema-apply-order.json's "order": `
         + SPEC.chain.filter((_, i) => positions[i] < 0).join(', '));
      chainOk = false;
    } else if (Math.max(...positions) !== order.indexOf(last)) {
      fail(`${last} is the last file in ${SPEC.chainName} but schema-apply-order.json applies another `
         + `${SPEC.fn} file AFTER it. Whichever applies last wins, and it would silently delete this `
         + "one's change while every self-check still passed.");
      chainOk = false;
    } else if (chainOk) {
      pass(`${last} is the last toucher of ${SPEC.fn}, in this file and in the apply order`);
    }
  }
}
}

// ── PART 1f-iii — NO MIGRATION MAY MAKE A LEVEL UNLOCK ADDITIVE ─────────
// `kind='unlock'` is deliberately ABSENT from hr_apply's progress allowlist.
// That absence is the entire mechanism by which a room rung cannot be climbed
// by the additive `value = value + add` merge — buying the 500-gold Hearthstone
// twice would otherwise yield room:kitchen = 2, i.e. the 2,000-gold Iron Stove
// for 1,000 gold.
//
// It is an ABSENCE, and an absence has no self-check anywhere: a future
// hr_apply revision that widened the list would pass its own §0, pass every
// grant lint, and pass the derivation chain above (widening a list is an
// insertion, not a removal). So the guard is here, static, over every migration
// in the tree.
//
// ⚠ SCOPED TO THE PROGRESS-KIND LIST, not to the word 'unlock' anywhere — the
//   artisan model's own files contain that word hundreds of times. The anchor
//   is hr_apply's literal kind list, which PART 1f-ii already proves is
//   carried verbatim from link to link.
// (Inherited from the parked economy-substrate branch, which wrote this lint
//  first; re-derived here against the current chain.)
say('── the progress-kind allowlist (a level unlock must stay unwritable by hr_apply)');
{
  const KIND_LIST = /not\s+in\s*\n?\s*\(\s*'quest'[^)]*\)/g;
  let sawOne = false;
  for (const [file, sql] of sources.entries()) {
    if (!/create\s+or\s+replace\s+function\s+public\.hr_apply\s*\(/i.test(stripComments(sql))) continue;
    const lists = stripComments(sql.replace(/\r\n/g, '\n')).match(KIND_LIST) || [];
    if (!lists.length) {
      fail(`${file} restates hr_apply but its progress-kind allowlist could not be located. The `
         + 'anchor moved, so this lint is now blind on the one file it exists to grade.');
      continue;
    }
    for (const list of lists) {
      sawOne = true;
      if (/'unlock'/.test(list)) {
        fail(`${file} ADDS 'unlock' to hr_apply's progress-kind allowlist: ${list.replace(/\s+/g, ' ')}\n`
           + '    Its merge is `value = value + add`, so every room rung and property tier becomes '
           + 'additive — two cheap rungs buy an expensive one. If a MAX-merged write through '
           + 'hr_apply is genuinely needed, add a SEPARATE delta key with its own merge; do not '
           + 'widen the additive one.');
      }
      if (!/'flag'/.test(list)) {
        fail(`${file} REMOVES 'flag' from hr_apply's progress-kind allowlist: ${list.replace(/\s+/g, ' ')}\n`
           + '    unlockedRecipes is stored as a flag row precisely so the accrual engine can grant '
           + 'a recipe scroll its own drop roll produced. Without it the artisan gate can never '
           + 'open server-side.');
      }
    }
  }
  /* The lint's own control: if it stopped finding ANY kind list, every check
     above passes vacuously on a tree where hr_apply's allowlist says anything
     at all. Four files restate hr_apply today. */
  if (!sawOne) {
    fail('the progress-kind allowlist lint found NO kind list in any hr_apply file — it is blind, '
       + 'and a blind lint reports a clean bill on a broken tree.');
  } else {
    pass("no migration adds 'unlock' to (or removes 'flag' from) hr_apply's progress kinds");
  }
}

// ── PART 1g — EVERY CURRENCY THE ENGINE CAN WRITE HAS A DAILY CEILING ────
// Security's ruling, 2026-08-15, after the gem finding: "A delta key the engine
// can write must have both a per-call clamp and a per-day ledger-derived ceiling
// before the first intent that writes it ships. If a currency has no `*_in`
// column on player_ledger and no dimension in hr_day_budget_limits(), no intent
// may put it in a delta."
//
// The finding it came from: gems had a 100,000/call clamp and NO daily ceiling,
// so a probe minted 1,200,000 gems in 12 calls with zero refusals while the
// byte-identical gold loop was refused at call 6. One dimension was missing.
// Nobody noticed because nothing anywhere related the delta-key list to the
// budget-dimension list — so this lint relates them, by name.
//
// It is deliberately a CLASSIFICATION rather than a heuristic: every key in
// hr_apply's c_delta_keys must be classified below, and an UNCLASSIFIED key
// fails the build. That is the property that matters — a new delta key cannot
// ship without somebody deciding, in writing, whether it moves value.
say('── every currency delta key has a per-call clamp AND a daily ceiling (Security 2026-08-15)');
{
  const LAST = HR_APPLY_CHAIN[HR_APPLY_CHAIN.length - 1];
  const applySql = (sources.get(LAST) || '').replace(/\r\n/g, '\n');

  // key -> [class, note]. 'currency' means "a scalar balance hr_apply adds to";
  // those need the full treatment. Everything else states WHY it does not.
  const DELTA_KEY_CLASS = {
    gold:  ['currency', 'the economy'],
    gems:  ['currency', 'premium; b351 — the ruling that produced this lint'],
    xp:    ['budgeted', 'not a balance but ledger-budgeted as `xp` (per-skill clamp)'],
    items: ['budgeted', 'not a balance but ledger-budgeted as `qty` (per-item clamp)'],
    hp:    ['bounded',  'clamped into [0, max_hp] by the UPDATE itself; not tradeable, not rankable'],
    equip: ['conserved', 'a TRANSFER between player_inventory and player_equipment; totals conserved'],
    activity: ['pointer', 'names an activity; validated against hr_activities + the skill gate'],
    accrued_to: ['clock', 'clamped into [old, now()] by the server; never a value'],
    farm: ['pointer', 'crop id validated against hr_crops; planted_at is now()'],
    progress: ['bounded', 'kind allowlisted, add clamped, "claimed" unreachable'],
    progress_claim: ['bounded', 'requires an already-done row; row_count is the check'],
    journal: ['metadata', 'kind allowlisted, intent is a label'],
    tool_carry: ['bounded', 'b348 — an ABSOLUTE fraction per skill, range-refused in hr_apply'],
    /* Phase 0, live settlement. NOT a currency and NOT budgeted, and here is the
       one line the lint demands. `fight` is an ABSOLUTE checkpoint of the fight
       in flight — `{monster, hp, kills}` — and it moves no balance: no gold, no
       item, no XP, nothing tradeable, rankable or contributable. What it CAN do
       is change how much a LATER window pays, which is why its bound is a
       re-derivation rather than a clamp: `hp` must be an integer in
       [1, hr_activities.max_hp] for the monster it names, looked up server-side
       under the row lock, and it is REFUSED rather than clamped when it is not.
       An activity change voids the whole thing unconditionally, so the largest
       value a forged one could be worth is one fight's worth of damage on the
       target the character is ALREADY on — bounded by the monster's own HP.
       Reviewed against Security's 2026-08-15 rule and deliberately not given a
       ledger dimension: there is no quantity here to sum. */
    fight: ['bounded', 'Phase 0 — an ABSOLUTE fight checkpoint; hp re-derived against '
      + 'hr_activities.max_hp and refused out of range; voided by any activity change; moves no '
      + 'balance, so no *_in column and no daily dimension'],
    /* ELEMENTS/ENCHANTING v1. NOT a currency and NOT budgeted, and here is the
       one line the lint demands. The `enchant` key does two things, neither of
       which moves a tradeable/rankable/contributable balance:
         · it DEBITS exactly ONE rune from the player's OWN player_inventory —
           the ownership check, bounded at 1 per call and impossible to mint
           (it can only destroy the player's own item), so it needs no per-call
           clamp, no *_in ledger column and no daily dimension: there is no
           quantity to sum and no way to gain from it. NOT routed through the
           budgeted `items` key precisely because it is a fixed-one consumption,
           not a client-named quantity.
         · it SETS an ABSOLUTE element string (player_state.enchant[slot]),
           RESOLVED server-side from hr_runes under the row lock — never a client
           value. Like `fight`, what it can change is how much a LATER window
           pays (the weapon's element vs the monster's weakness), which is
           bounded by the accrual engine's own caps, not by this key.
       Reviewed against Security's 2026-08-15 rule and deliberately given no
       ledger dimension. */
    enchant: ['bounded', 'ELEMENTS v1 — debits exactly ONE owned rune (bounded, the ownership '
      + 'check, cannot mint) and sets an ABSOLUTE element resolved server-side from hr_runes; moves '
      + 'no tradeable/rankable balance, so no *_in column and no daily dimension'],
    /* worker-settlement slice. NEITHER key moves a tradeable/rankable balance,
       and here are the one-liners the lint demands:
         · `workers` credits PER-WORKER xp into player_workers.xp — a private
           efficiency multiplier internal to worker production, NOT player xp and
           NOT a player_skills row. Each uid is re-validated against the caller's
           OWN crew; each op is clamped per-worker at c_max_xp_delta (same clamp as
           a player-skill op). It is not tradeable/rankable/contributable, so it
           needs no *_in column and no daily dimension. The worker OUTPUT (items)
           does NOT ride this key — it rides the budgeted `items` map, which stamps
           qty_in and is counted against the day budget, so the economic effect IS
           budgeted; only the private xp lives here.
         · `workers_accrued_to` is a CLOCK, exactly like `accrued_to`: the crew's
           own watermark, set to now() server-side on presence (the value is
           ignored), never a balance. */
    workers: ['bounded', 'per-worker xp into player_workers.xp (private efficiency multiplier, uid '
      + 'validated against the caller own crew, clamped at c_max_xp_delta); worker OUTPUT rides the '
      + 'budgeted `items` key, so this xp moves no tradeable/rankable balance — no *_in column, no daily dimension'],
    workers_accrued_to: ['clock', 'the crew watermark; set to now() server-side on presence, never a value'],
  };

  const m = applySql.match(/c_delta_keys constant text\[\] := array\[([\s\S]*?)\];/);
  if (!m) {
    fail(`could not read c_delta_keys out of ${LAST} — this lint would be vacuous, which is the `
       + 'always-null-probe failure the whole SQL tier is organised around.');
  } else {
    const keys = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    if (keys.length < 5) {
      fail(`c_delta_keys parsed to ${keys.length} key(s) — the parser has stopped matching reality`);
    }
    const unclassified = keys.filter((k) => !DELTA_KEY_CLASS[k]);
    const stale = Object.keys(DELTA_KEY_CLASS).filter((k) => !keys.includes(k));
    for (const k of unclassified) {
      fail(`hr_apply accepts the delta key "${k}" and DELTA_KEY_CLASS in tests/run-sql-tests.mjs does `
         + 'not classify it. If it moves a balance, it needs a per-call clamp, a `*_in` column on '
         + 'player_ledger stamped by hr_apply, and a dimension in hr_day_budget_limits() — all three, '
         + 'before the first intent that writes it ships (Security, 2026-08-15). If it does not, say '
         + 'so here in one line.');
    }
    for (const k of stale) {
      fail(`DELTA_KEY_CLASS classifies "${k}" but hr_apply no longer accepts it — a stale entry means `
         + 'this lint is describing a contract that has moved.');
    }

    /* The currencies, in full.

       ⚠ THE DIMENSIONS ARE READ FROM WHOEVER DECLARES THEM LAST, NOT FROM THE
         hr_apply FILE. This used to be `const budgetSql = applySql` with the
         comment "§2 of the same file declares the limits", which was true when
         2026-08-15-gem-daily-budget.sql was last of BOTH — and it was already
         only true by luck: 2026-08-16-day-budget-artisan.sql took over
         hr_day_budget_limits months before anything took over hr_apply, and
         this lint kept passing because gem-daily-budget's now-superseded copy
         still contained the text. It went red the moment a file restated
         hr_apply without also restating the budget, reporting "gold has NO
         DIMENSION" about a ceiling that is live and correct — a lint that
         answers a question about file B by reading file A. Now it walks the
         apply order and takes the LAST file that actually declares the
         function, which is the same last-toucher discipline PART 1f-ii
         enforces. */
    const budgetSql = await (async () => {
      const order = JSON.parse(
        await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
      let last = '';
      for (const f of order) {
        let sql = sources.get(f);
        if (sql === undefined) { try { sql = await readFile(MIG(f), 'utf8'); } catch { continue; } }
        if (/create or replace function public\.hr_day_budget_limits/.test(sql)) last = sql;
      }
      if (!last) {
        fail('no file in the apply order declares hr_day_budget_limits — this lint would report every '
           + 'currency as unbudgeted, which is the always-null-probe failure inverted');
      }
      return last;
    })();
    for (const k of keys.filter((x) => (DELTA_KEY_CLASS[x] || [])[0] === 'currency')) {
      const col = `${k}_in`;
      const clamp = new RegExp(`c_max_${k.replace(/s$/, '')}_delta\\s+constant bigint`);
      /* BOTH halves of the INSERT, inside the one statement. The column list
         alone is not the stamp: `(… gems_in, meta) values (… v_qty_in, meta)`
         parses, inserts NULL, and leaves a ceiling checked against a sum that
         can never grow — which is the shape mutation `apply_stamps_null` in
         tests/gem-daily-budget.mjs plants and this lint must be able to see. */
      const insertStmt = (applySql.match(
        /insert into public\.player_ledger[\s\S]*?\)\);/) || [''])[0];
      const stamped = new RegExp(`\\b${col}\\b`).test(insertStmt)
        && new RegExp(`\\bv_${col}\\b`).test(insertStmt);
      const dimension = new RegExp(`'${k}',\\s*c_day_${k}_budget`).test(budgetSql);
      const column = [...sources.values()].some((sql) =>
        new RegExp(`alter table public\\.player_ledger add column if not exists ${col}\\b`, 'i').test(sql));

      if (!clamp.test(applySql)) fail(`currency "${k}" has no per-call clamp (c_max_*_delta) in ${LAST}`);
      else if (!column) fail(`currency "${k}" has no player_ledger.${col} column created by any migration `
        + '— the daily ceiling would have nothing to sum');
      else if (!stamped) fail(`currency "${k}" is never stamped into player_ledger.${col} by hr_apply — `
        + 'the ceiling would be checked against a sum that cannot grow, which is a control that reads '
        + 'as a control and is not one');
      else if (!dimension) fail(`currency "${k}" has NO DIMENSION in hr_day_budget_limits(). This is the `
        + 'exact defect Security blocked the gold-grant intent on: a per-call clamp with no daily '
        + 'ceiling is a speed bump measured in seconds (hr_apply allows 240 applies/minute).');
      else pass(`currency "${k}": per-call clamp + player_ledger.${col} + stamped by hr_apply + a `
        + `c_day_${k}_budget dimension`);
    }
    if (!unclassified.length && !stale.length) {
      pass(`all ${keys.length} delta keys are classified (${keys.filter((x) => DELTA_KEY_CLASS[x][0] === 'currency').length} currencies)`);
    }
  }
}

// ── PART 1h — THE CLAN STOREHOUSE MAY NEVER ACCEPT AN ITEM NOBODY OWNS ───
// Security P0, b366. `clan_deposit` validated the item against hr_castle_items,
// clamped it by gold value, journalled it — and never debited the depositor.
// `clan_deposit(clan, '{"keystone":100000}')` from a devtools console therefore
// minted materials into clan_stores, castle_tier, contribution points and the
// clan_power leaderboard: four surfaces that all cross to other players.
//
// The fix is 2026-08-18-clan-deposit-ownership.sql. This is the static half of
// the guard that stops it decaying (the behavioural half is
// tests/clan-deposit-ownership.mjs, which drives it on real PostgreSQL). It
// grades four properties, and each one is here because losing it silently
// restores the hole or opens another:
//
//   (i)   ONE OWNER for public.clan_deposit__ungated — the clan_members
//         "join as self" rule applied to a body. Two files defining it means
//         filename order picks one, and the loser's ownership debit is deleted
//         while every self-check still passes.
//   (ii)  THE ONE-WAY DOOR. No file that applies AFTER the A9 retrofit may
//         `create or replace function public.clan_deposit(...)`: the public name
//         is the rate-gated WRAPPER, and replacing it installs an ungated body
//         beside a now-orphaned __ungated twin (2026-08-11-authenticated-surface-
//         lockdown.sql §6 names this exact footgun).
//   (iii) THE DEBIT ITSELF, all four parts — it reads player_inventory, it reads
//         it `for update`, it refuses `insufficient_item`, and it refuses by
//         RAISING through hr_reject rather than returning (a bare `return
//         ok:false` mid-loop commits the rows already written, which with a
//         debit in the same loop is a committed half-transfer).
//   (iv)  THE CLAMPS AND THE LEDGER SURVIVED. This was a possession fix, not a
//         rebalance, and the per-day cap is READ FROM clan_ledger — so a body
//         that stopped journalling would also stop capping.
say('── the clan Storehouse debits the depositor (Security P0, b366)');
{
  const OWNER = '2026-08-18-clan-deposit-ownership.sql';
  const INNER = /create\s+or\s+replace\s+function\s+public\.clan_deposit__ungated\s*\(/i;
  // The PUBLIC name, and NOT the __ungated one: `\s*\(` after the name is what
  // separates `clan_deposit(` from `clan_deposit__ungated(`.
  const OUTER = /create\s+or\s+replace\s+function\s+public\.clan_deposit\s*\(/i;
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;

  // (i) ONE OWNER.
  const inners = [...code.entries()].filter(([, sql]) => INNER.test(sql)).map(([f]) => f);
  if (inners.length !== 1 || inners[0] !== OWNER) {
    fail(`public.clan_deposit__ungated is defined in [${inners.join(', ') || 'nothing'}] — exactly one `
       + `file may own it and it must be ${OWNER}. Whichever applies last wins, and the loser's `
       + 'ownership debit is deleted with every self-check still green.');
  } else {
    pass(`${OWNER} is the sole owner of clan_deposit__ungated`);
  }

  // (ii) THE ONE-WAY DOOR. 2026-08-08-clan-seat.sql legitimately defines the
  //      public name — it wrote the body BEFORE the rename existed. Anything
  //      after the retrofit does not.
  const LOCKDOWN = '2026-08-11-authenticated-surface-lockdown.sql';
  const iLock = order.indexOf(LOCKDOWN);
  const late = [...code.entries()]
    .filter(([f, sql]) => OUTER.test(sql) && order.indexOf(f) > iLock)
    .map(([f]) => f);
  if (late.length) {
    fail(`${late.join(', ')} does \`create or replace function public.clan_deposit(...)\` and applies `
       + `AFTER ${LOCKDOWN}. That replaces the A9 rate-gated WRAPPER with an ungated body while `
       + 'clan_deposit__ungated survives beside it — the RPC becomes ungated and there are two live '
       + 'copies. Replace the __ungated twin instead.');
  } else {
    pass('no post-retrofit migration replaces the public clan_deposit wrapper');
  }

  // (iii) + (iv) THE BODY.
  const body = code.get(OWNER) || '';
  const TERMS = [
    ['public.player_inventory', /from\s+public\.player_inventory/i,
      'the debit has nothing to read — this is the P0 itself'],
    ['for update', /where\s+user_id\s*=\s*v_uid[\s\S]{0,120}?for update/i,
      'two concurrent deposits could each see the same stock and both succeed'],
    ['insufficient_item', /hr_reject\('insufficient_item'/i,
      'it reads the inventory and does not act on it — a check that is not one'],
    ['delete from public.player_inventory', /delete\s+from\s+public\.player_inventory/i,
      'player_inventory checks qty > 0, so an exact-zero debit must DELETE, not update'],
    ['hr_reject', /perform\s+public\.hr_reject\(/i,
      'a mid-loop `return ok:false` COMMITS the rows already written — a half-transfer'],
    ['HR000 handler', /exception\s+when\s+sqlstate\s+'HR000'\s+then/i,
      'without it every refusal escapes the RPC as a 500'],
    ['clan_ledger', /insert into public\.clan_ledger/i,
      'the per-member per-day cap is READ FROM the ledger, so losing it also loses the cap'],
    ['c_call_clamp 1000000', /c_call_clamp\s+constant bigint\s*:=\s*1000000;/,
      'the per-call gold-value ceiling was relaxed by a possession fix'],
    ['c_day_clamp 5000000', /c_day_clamp\s+constant bigint\s*:=\s*5000000;/,
      'the per-member per-day ceiling was relaxed by a possession fix'],
    ['c_qty_clamp 100000', /c_qty_clamp\s+constant bigint\s*:=\s*100000;/,
      'the per-item-per-call ceiling was relaxed by a possession fix'],
  ];
  if (!body) {
    fail(`${OWNER} is not readable — PART 1h would pass vacuously, which is the always-null-probe `
       + 'failure the whole SQL tier is organised around');
  } else {
    let bad = 0;
    for (const [name, re, why] of TERMS) {
      if (!re.test(body)) { bad++; fail(`${OWNER}: lost \`${name}\` — ${why}`); }
    }
    if (!bad) pass(`${OWNER} carries all ${TERMS.length} load-bearing terms of the ownership debit`);
  }

  // The order dependency, stated where it is checked rather than only in prose.
  for (const dep of [LOCKDOWN, '2026-08-11-player-state.sql', '2026-08-11-apply-engine.sql',
                     '2026-08-08-clan-seat.sql']) {
    if (order.indexOf(OWNER) < 0 || order.indexOf(dep) < 0 || order.indexOf(dep) > order.indexOf(OWNER)) {
      fail(`${OWNER} must apply AFTER ${dep} — its §0 fails closed without it`);
    }
  }
}

// ── PART 2 — emit the behavioural bundle ─────────────────────────────────
if (process.argv.includes('--emit')) {
  const allowProd = process.argv.includes('--allow-production');
  const suite = await readFile(join(ROOT, 'tests', 'sql', 'server-authority.test.sql'), 'utf8');
  const parts = [
    '-- GENERATED by tests/run-sql-tests.mjs --emit. Runs and rolls back.\n',
    `-- production target: ${allowProd ? 'EXPLICITLY ALLOWED (--allow-production)' : 'refused (default)'}\n`,
    'begin;\n',
    // R9: market-v2 takes ACCESS EXCLUSIVE on market_listings for the whole
    // run. Fail fast rather than queue in front of live traffic.
    "set local lock_timeout = '5s';\n",
    "set local statement_timeout = '300s';\n",
    // RL6: the bundle DOES wipe the market tables. Inside begin/rollback that
    // is harmless, and stating it here is what makes it a decision.
    "set local hearthrise.market_wipe_ok = 'yes';  -- rolled back; see market-v2.sql §0b\n",
  ];
  if (!allowProd) {
    parts.push(`
-- ── PRODUCTION GUARD (review R9) ─────────────────────────────────────────
-- Without --allow-production the bundle refuses a database that is carrying
-- live players. Rolled back is not the same as harmless: this run holds ACCESS
-- EXCLUSIVE on market_listings from here to the rollback.
do $$
declare v_saves bigint := 0;
begin
  if to_regclass('public.game_saves') is not null then
    execute 'select count(*) from public.game_saves' into v_saves;
  end if;
  if v_saves > 0 then
    raise exception 'REFUSING: this looks like production (% game_saves rows). '
      'This bundle drops and recreates market_listings/market_sales and holds ACCESS '
      'EXCLUSIVE on the live market for its whole run. Re-emit with --allow-production '
      'if you have read tests/run-sql-tests.mjs'' header and accept that.', v_saves;
  end if;
end $$;
`);
  }
  for (const f of BUNDLE) parts.push(`\n-- ══ ${f} ══\n${sources.get(f)}\n`);
  parts.push(`\n-- ══ tests/sql/server-authority.test.sql ══\n${suite}\n`);
  parts.push('\nrollback;\n');
  process.stdout.write(parts.join(''));
  if (allowProd) {
    process.stderr.write('\n⚠ emitted WITHOUT the production guard (--allow-production).\n'
      + '  market-v2 holds ACCESS EXCLUSIVE on market_listings for the whole run.\n'
      + '  lock_timeout is 5s so it fails fast instead of blocking players.\n\n');
  }
  process.exit(failures ? 1 : 0);
}

say('');
if (failures) {
  console.error(`${failures} static check(s) failed.`);
  console.error('The behavioural suite is tests/sql/server-authority.test.sql —');
  console.error('run it with:  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
  process.exit(1);
}
say('static server-tier checks passed.');
say('Behavioural suite (needs a database):');
say('  node tests/run-sql-tests.mjs --emit | psql "$DATABASE_URL"');
say('  (no psql? see the header for the single-call begin/rollback');
say('   recipe that runs the same bundle through Supabase MCP)');
