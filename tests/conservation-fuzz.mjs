#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/conservation-fuzz.mjs — THE CONSERVATION-INVARIANT FUZZ
//
// Six hand-authored races prove six hypotheses. This proves the PROPERTY:
//
//   After N randomised operations across M characters, value is neither
//   created nor destroyed EXCEPT by paths that are supposed to create or
//   destroy it.
//
// Stated as a ledger rather than as "the totals never move", because the
// totals are SUPPOSED to move — an accrual grant mints, a craft burns, a
// vendor sale destroys an item and creates gold. So the harness models the
// EXPECTED delta of every operation and asserts the books reconcile:
//
//   for every item id:
//     Σ player_inventory.qty + Σ player_equipment (1 per row)
//       + Σ account_bank.qty (Storage, one per ACCOUNT)
//       + Σ hunt_bag.qty_left (a running hunt's packed supplies)
//       + Σ market_listings.qty (the escrow)
//        == opening + Σ intended mints − Σ intended burns
//
//   Σ account_wallet.gold (ONE purse per account, 2026-12-15-account-gold.sql)
//       + Σ market_sales.tax (the cut) + Σ listing fees (market_list ledger rows)
//        == opening + Σ intended mints − Σ intended burns
//
// The escrow path is the one this exists for: A LISTING IS THE ESCROW — list
// DEBITS the goods out of a hero's bag or the account's Storage and the listing
// row is the only record that they exist; cancel and expiry return them to
// Storage (2027-01-12-market-account.sql) — so list→cancel, list→buy and
// list→expire must each conserve EXACTLY. Storage and the hunt bag are counted
// because the market threat model (2026-10-24, #6) found a dupe through either
// would have passed this file: they were the two places it did not look.
//
// STORAGE IS IN THE IDENTITY (2027-01-10-house-from-storage.sql; Security's
// marketplace threat model 2026-10-24 #6): a house build takes its materials from
// the building hero's bag first and then the ACCOUNT's Storage, so a stack that
// moves between a bag and Storage, or is taken from the wrong one, is only seen
// when Storage is counted. PHASE 4 drives that path (deposits, a withdrawal, a
// deed, a room, two chests, a short line, a short purse, a replay) on every seed.
//
// ── WHERE IT RUNS ───────────────────────────────────────────────────────
// In process, against a REAL PostgreSQL (PGlite/WASM, PG 18) with THE WHOLE
// MIGRATION CHAIN applied verbatim, in the order tests/schema-apply-order.json
// declares — the same `bootReplay` every other chain guard uses.
//
// ⚠ IT USED TO APPLY A HAND-PICKED BUNDLE OF SIX FILES, AND THAT STOPPED
//   BEING HONEST ON 2026-08-17. 2026-08-17-market-v2.sql REFUSES TO INSTALL
//   without hr_utc_day_key, hr_client_write_baseline, hr_assert_grant_hygiene
//   and four asserted properties of the LIVE hr_apply body — whose transitive
//   closure is the whole chain under another name. A hand-maintained bundle
//   would therefore have to grow to the full list anyway, one debugging session
//   at a time, and would still be a SECOND declaration of the apply order next
//   to the manifest that owns it. The side benefit is the one that matters:
//   every migration's own self-verifying `do $$` block — including market-v2's
//   §0 refuse-to-install with both scan controls and its §11(a)-(k) — now
//   EXECUTES on every fuzz run, before a single op is issued.
//
// Nothing is reimplemented, stubbed or "modelled" on the server side. The
// only scaffolding is tests/sql/pglite-fixture.sql (auth.uid, auth.users,
// profiles, a pg_cron shim) plus schema-replay's SCAFFOLD (the platform's base
// grants) — read their headers for what is stubbed and why each stub is
// faithful. Production is never touched: no network, no credentials, no
// branch, nothing to leave behind.
//
// ── WHY THE MODEL IS INDEPENDENT (this is the whole design) ─────────────
// The expected delta of an operation is derived from (the operation's own
// parameters) × (the ok/error verdict the RPC returned). It is NEVER derived
// by reading the database afterwards. That is what makes the harness capable
// of failing:
//
//   • a rejected op (`ok:false`) is modelled as moving NOTHING, so any write
//     that survives a rejection is a diff;
//   • a successful op is modelled from the numbers the harness chose, so a
//     server that pays a different number is a diff;
//   • the global identity above is computed from DATABASE-ONLY aggregates
//     against mint/burn COUNTERS, which is a second, independent construction
//     — not a restatement of the per-character model.
//
// ── FALSIFIABILITY (report this first, not the clean run) ───────────────
// The always-null-probe class — an assertion that passes while asserting
// nothing — has bitten this program six times. So the harness is required to
// prove it can fail: `--selftest` applies each of the TWENTY-TWO known conservation
// violations in INJECTIONS as a textual patch to the real migration SQL, re-runs
// the fuzz, and demands that every one of them is CAUGHT. (The count is stated
// here because it used to say EIGHT while the catalogue held sixteen — a number
// in prose next to a list is a number that goes stale, so if you add one, move
// this word.) A patch that does not change
// the SQL text is itself a harness failure (that is how a "planted bug" quietly
// becomes decoration). An injection that survives the fuzz is reported as
// SLIPPED and exits non-zero.
//
// ── WHAT THIS DOES **NOT** TEST — read before trusting a green run ──────
//   • TRUE CONCURRENCY. PGlite is one backend, so two simultaneous
//     transactions are not constructible here. Advisory locks, `for update`,
//     the canonical lock order and the deadlock the market_buy comment
//     describes are therefore EXERCISED but not RACED. The `intent_in_flight`
//     op reaches the state a concurrent caller leaves behind (a claimed,
//     undecided intent) which is the closest available approximation. A real
//     race needs a multi-connection database — a branch.
//   • RLS AND GRANTS. The harness runs as the database owner, so row-level
//     security and the EXECUTE grants are not enforced against it. Those are
//     owned by tests/run-sql-tests.mjs (static) and
//     tests/sql/server-authority.test.sql (behavioural).
//   • pg_cron ITSELF. The shim records jobs; it does not run them. The fuzz
//     calls market_expire() directly, which is what a deterministic harness
//     has to do anyway.
//   • THE DEGRADE LADDER'S DRIVER. The ladder lives in TypeScript
//     (hr-accrue/index.ts) and cannot be imported by Node, so the loop is
//     re-driven here with MAX_DEGRADE and DEGRADABLE read out of that file
//     rather than retyped. The APPLIES are real; the driver is a port.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node tests/conservation-fuzz.mjs                 # clean run, CI scale
//   node tests/conservation-fuzz.mjs --ops=5000      # soak
//   node tests/conservation-fuzz.mjs --seed=123456   # reproduce a failure
//   node tests/conservation-fuzz.mjs --selftest      # clean + all injections
//   node tests/conservation-fuzz.mjs --inject=cancel_vanish   # one injection
//   node tests/conservation-fuzz.mjs --list          # the injection catalogue
//
// Every run prints its seed on the first line, pass or fail. A failure is
// reproduced byte-for-byte by re-running with --seed=<that number> --ops=<same>.
//
// Exit codes: 0 = clean · 1 = a violation (or a slipped injection) · 2 = harness
// problem (missing dependency, migration would not apply).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

/* ── WHICH FILE AN INJECTION PLANTS ITS BUG IN ──────────────────────────────
   The injection catalogue below names files by SHORT NAME, which is what a
   reader of a planted bug wants to see. `bootReplay` keys its patches by the
   filename in the apply-order manifest. This map is the only place the two
   meet, so an injection entry cannot silently name a file that is not in the
   chain: `boot()` refuses an unmapped name as a HARNESS failure, exactly as
   bootReplay refuses a patch anchor that does not match. */
const INJECTION_FILES = Object.freeze({
  'player-state': '2026-08-11-player-state.sql',
  'catalogue': '2026-08-11-catalogue.generated.sql',
  'daily-budget': '2026-08-11-daily-budget.sql',
  'apply-engine': '2026-08-11-apply-engine.sql',
  /* ⚠ `apply-live` IS 2026-08-15-gem-daily-budget.sql, AND IT IS THE ONE THAT
     MATTERS FOR ANYTHING INSIDE hr_apply. FOUR files `create or replace` that
     function; on the six-file bundle the 2026-08-11 one was the last, so a
     plant there was the body that ran. On the FULL chain it is overwritten
     three times, and the first selftest after the move reported five plants
     SLIPPED — not because the fuzz stopped seeing those defects, but because
     the defects were never installed. That is the "planted bug that was never
     planted" failure arriving through the apply ORDER instead of through a
     stale anchor, and it is the single most valuable thing the move to the
     full chain taught. Anything that patches hr_apply or hr_day_budget_used
     must name THIS file, which is the last writer of both. */
  'apply-live': '2026-08-15-gem-daily-budget.sql',
  /* ⚠ AND `apply-live` IS NO LONGER THE LAST WRITER OF hr_apply — THIS KEY IS.
     The warning above was right about the mechanism and went stale about the
     file. hr_apply is create-or-replace'd by TEN files in the chain; on
     2026-08-15 gem-daily-budget was the last of them, and by 2026-08-17
     fight-carry, equip-release-codes, skill-row-upsert, enchant, streak-state and
     workers had all landed after it (apply-order indices 69, 70, 71, 72, 82, 91).
     From that day every plant anchored inside hr_apply and declared on
     `apply-live` was applied to file 49 and then OVERWRITTEN six times before a
     single op ran — the exact failure the note above calls "the single most
     valuable thing the move to the full chain taught", repeated on the same key
     that documents it. Measured 2026-09-04: budget_ignores_xp, budget_ignores_qty
     and budget_qty_not_summed all SLIP against a clean chain; they had been
     reading CAUGHT only because the clean run was red on PHASE 3 leg 6 and every
     child exited non-zero on THAT.
     hr_day_budget_used is a different function with a different last writer, and
     it is still gem-daily-budget — which is why both keys exist. `boot()` now
     refuses to run any plant whose anchor is re-written later in the apply order,
     so this cannot go stale silently a third time; it goes HARNESS-red.

     ⚠ AND THE KEY THAT REPLACED IT — `apply-last`, 2026-08-25-workers.sql, the
     last AUTHOR of hr_apply — IS GONE TOO, deliberately, on 2026-09-13. It is
     not that it went stale a third time: it cannot be made correct at all, for
     the reason INJECTION_FINAL_BODIES gives below. Every plant that used to name
     it now names `final: 'apply-final'`. The key is removed rather than left
     pointing at a real file, because a key that still resolves is a key the next
     arm will use, and using it re-creates exactly this bug. */
  'grant-hygiene': '2026-08-11-grant-hygiene.sql',
  /* 2027-01-12 (lane c-market-account): the account market's file. Its §9 refuses a sweep that
     does not arbitrate by DELETE, which is expire_double's gate; every other market plant is a
     `final:` one (the §9 probes would score them first). */
  'market-account': '2027-01-12-market-account.sql',
});

/* ── THE FOURTH KIND OF TARGET: THE BODY THE CHAIN ENDS UP WITH ────────────
   Every key above names a FILE, and that works while the file's text is the
   text production executes. hr_apply stopped being that on 2026-09-12.

   The chain now writes hr_apply in two ways (b538's vocabulary): TEN AUTHORS
   (the last is 2026-08-25-workers.sql, apply-order 93) and then a growing tail
   of PATCHERS — 2026-09-03-intent-mismatch-class/-escalates,
   2026-09-12-renown-high-projection.sql, 2026-09-13-consumable-buffs.sql (five
   anchored splices) — each of which reads the body back with
   pg_get_functiondef, splices, and re-executes. A patcher carries a plant
   FORWARD, so a plant in file 93 is genuinely INSTALLED.

   Being installed is not the problem. BEING INSTALLED TOO EARLY IS. Each of
   those later files carries a §4 self-check that EXECUTES hr_apply and asserts
   a property of it, and a plant standing in the body before that block runs is
   a plant the self-check correctly refuses — so the chain will not apply and
   the arm scores HARNESS instead of being scored by the fuzz. That is not a
   defect in the migration and not a defect in the fuzz's model; it is the two
   of them being run in the wrong order.

   Measured twice in two days, same class, different arm:
     • 2026-09-12 — gold_double. The renown file's §3(c6) runs a PAID apply and
       asserts `gold1 = gold0 + 7777` exactly; the doubled credit read 15554.
     • 2026-09-13 — replay_applies_twice. consumable-buffs' §4(f5) asserts a
       repeated intent_id is answered as a REPLAY; the plant answered
       version_conflict.
   Both plants were live, both chains refused, both arms read HARNESS. Every
   remaining arm inside hr_apply had the same exposure, waiting for the next
   migration whose self-check happened to touch its line.

   The two obvious repairs are both wrong. Declaring `gate:` on c6 moves the
   catch into one migration's fixture, and this file has twice been burned by a
   gate that silently stopped firing when its file moved (see `apply-live` and
   budget_kind_scoped) — while the runtime Σgold identity is permanent and is
   the only plant that proves it can see a mint through hr_apply at all.
   Re-shaping the plant so it dodges c6 is worse: that is evading a commit gate
   to prove a runtime detector, which expire_double's note explicitly refuses.

   So the plant moves to where production's body actually is. `final:` names a
   FUNCTION rather than a file: the chain replays UNPATCHED and every migration
   self-check certifies the clean body exactly as it does in production, and
   only then is the anchor replaced in `pg_get_functiondef(...)` — the text the
   database is left holding — and re-executed. That is the same text §1 of the
   renown file edits, one step further along: the author's line, carried
   through every patcher, as the fuzz's ops will actually execute it.

   ALL EIGHT hr_apply ARMS USE IT (2026-09-13), not only the two that had been
   caught out. Converting them one incident at a time would have meant one red
   CI run per future migration that self-checks hr_apply, each looking like a
   new bug; the exposure is a property of the target, so it is fixed at the
   target. `INJECTION_FILES` no longer has a key that resolves to an hr_apply
   author, so the wrong choice is not available.

   The discipline is bootReplay's, kept: the anchor must appear EXACTLY ONCE in
   the live body and must CHANGE it, or the run is a HARNESS failure — which is
   also what now detects a patcher that rewrites a plant's line (the anchor
   stops matching the final body, loudly, on the first run). The marker sweep
   below (PLANT STILL STANDING) then re-reads it out of pg_proc, so "planted" is
   a measurement here too, not an inference. */
const INJECTION_FINAL_BODIES = Object.freeze({
  'apply-final': 'public.hr_apply(uuid,int,bigint,uuid,jsonb)',
  /* 2026-09-13, the same rule arriving from the other direction — a RE-AUTHOR
     rather than a later self-check. 2026-09-13-rejections-verb-map-2.sql
     RESTATES hr_record_rejection whole (the verb map), so the plant
     `reject_mutates` had held in 2026-08-11-player-state.sql since day one was
     replaced by the clean body and boot()'s relocation detector said so. Moving
     it to the new last author would install a live plant but retire its GATE:
     the gate is apply-engine §6(g)'s C5 probe at apply-order 34, which now runs
     long before the plant exists and can never fire again. `final:` is therefore
     not a workaround here, it is the only honest target, and the arm is scored
     by reconcile() as it was before 2026-08-11. */
  'reject-final': 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)',
  /* 2026-10-19 (b570 bundle), the same re-author rule a third time:
     2026-10-19-account-wallet.sql RESTATES hr_day_budget_used whole (the gem
     dimension summed over the ACCOUNT), so the two budget plants that lived in
     2026-08-15-gem-daily-budget.sql would be replaced by the clean body. Their
     gates (gem-daily-budget §10) run long before the wallet, so the honest
     target is the body the chain ends with, scored by reconcile(). */
  'budget-final': 'public.hr_day_budget_used(uuid,integer,timestamp with time zone)',
  /* 2026-12-15 (lane c-account-gold), the re-author rule a fourth time: 2026-12-15-account-gold.sql
     RESTATES hr_market_buy whole (both gold moves go through the ACCOUNT purse, hr_purse_move), so the
     two buy plants that lived in 2026-08-17-market-v2.sql would be replaced by the clean body. The
     honest target is the body the chain ends with, scored by reconcile(). */
  /* 2027-01-12 (lane c-market-account) re-derives every market verb on the ACCOUNT with new
     signatures, and its §9 executes each, so every market plant targets the body the chain ends with. */
  'market-buy-final': 'public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)',
  'market-list-final': 'public.hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)',
  'market-cancel-final': 'public.hr_market_cancel(uuid,integer,uuid,uuid)',
  'market-expire-final': 'public.hr_market_expire(integer,uuid)',
  'bank-move-final': 'public.hr_bank_move(integer,text,bigint,text,uuid)',
  'restock-final': 'public.hr_hunt_restock(integer,text,bigint,uuid)',
  /* 2027-01-10 (lane c-house-from-storage): the ONE material take of a house build. Its own file's §5
     executes it, so the plant goes in the body the chain ends with and reconcile() grades it. */
  'house-take-final': 'public.hr_materials_take(uuid,integer,jsonb,boolean)',
});

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const OPS = Math.max(20, Number(argOf('ops', 400)) | 0);
const USERS = Math.max(2, Number(argOf('users', 4)) | 0);
const SLOTS = Math.max(1, Number(argOf('slots', 2)) | 0);
const VERBOSE = argv.includes('--verbose');
const SELFTEST = argv.includes('--selftest');
const ONLY_INJECT = argOf('inject', null);
const SEED_ARG = argOf('seed', null);

// ════════════════════════════════════════════════════════════════════════
// THE INJECTION CATALOGUE — known conservation violations, planted in the
// REAL migration text. Each is the shape of a bug this codebase could
// plausibly ship; each must be caught.
//
// `patches` are exact-substring replacements. A patch that does not match, or
// that produces identical text, aborts the run as a HARNESS failure — a
// planted bug that was never planted is the same defect as a probe that is
// always null.
//
// ── THE RULE FOR WHERE A PLANT GOES (2026-09-13, after two incidents) ──────
//   PLANTS GO IN THE FINAL BODY; SELF-CHECKS CERTIFY THE CLEAN CHAIN, NEVER
//   SCORE A PLANT.
// An arm targets `final:` (the body the whole chain leaves installed) whenever
// the function it corrupts is re-checked by a LATER migration's §4 — which, for
// anything inside hr_apply, is every arm and every future migration. The chain
// then replays byte-for-byte clean, every self-check asserts what it was written
// to assert, and the ONLY thing that grades the plant is this file's own
// identity. An arm on `file:` is for text no later self-check executes; if a new
// migration starts exercising it, that arm moves to `final:` too rather than the
// fuzz learning to read a migration's exception message as a verdict.
// The `gate:` arms are the deliberate exception, documented one by one: there
// the migration REFUSING to install is the outcome being tested. There are TWO
// (expire_double, budget_kind_scoped) since 2026-09-13, when reject_mutates lost
// its gate — not to a preference but because the chain restated its function
// downstream of the probe that used to refuse it (see the arm). A gate is only
// legitimate while the file that fires it is still DOWNSTREAM of the plant;
// `node tests/conservation-fuzz.mjs --selftest` is what proves that, arm by arm.
// ════════════════════════════════════════════════════════════════════════
const INJECTIONS = {
  /* ⚠ THE MARKET PLANTS MIRROR tests/market-v2.mjs's (2027-01-12-market-account.sql). Two guards
     drive the same verbs and each has to be able to fail. They are `final:` plants: the account
     market's own §9 executes every verb on probe accounts, so a plant in the FILE would be scored
     by that self-check instead of by this file's identities (the rule above). */
  cancel_vanish: {
    what: 'market_cancel deletes the listing but never returns the escrow to Storage — the stack ceases to exist',
    final: 'market-cancel-final',
    /* ⚠ THE ESCROW IS NOT RETURNED AT ALL, rather than returned as ZERO: a zero return trips
       account_bank's own `qty > 0` CHECK, the exception handler refuses the cancel and nothing
       moves (the plant would slip). The cancel must succeed and destroy the stack. */
    patches: [[
      '    insert into public.account_bank as b (user_id, item_id, qty, updated_at)\n'
      + '      values (v_uid, v_row.item_id, v_row.qty, now())\n'
      + '      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();',
      '    -- INJECTED cancel_vanish: the escrow is simply not returned',
    ]],
  },

  storage_return_keeps_listing: {
    what: 'market_cancel returns the units to Storage but never deletes the listing — the goods exist twice '
      + '(the threat model\'s #6 mutant: a Storage return without the delete-as-arbiter)',
    final: 'market-cancel-final',
    patches: [[
      '    delete from public.market_listings where id = p_listing_id and user_id = v_uid returning * into v_row;',
      '    select * into v_row from public.market_listings where id = p_listing_id and user_id = v_uid;  -- INJECTED storage_return_keeps_listing',
    ]],
  },

  expire_keeps_listing: {
    what: 'the expiry sweep returns the units to Storage but leaves the listing in place — the goods exist twice',
    final: 'market-expire-final',
    patches: [[
      '      delete from public.market_listings where id = v_c.id returning * into v_row;',
      '      select * into v_row from public.market_listings where id = v_c.id;  -- INJECTED expire_keeps_listing',
    ]],
  },

  list_no_escrow: {
    what: 'market_list posts the listing without debiting the seller\'s bag — the goods exist twice',
    final: 'market-list-final',
    /* BOTH branches of the bag debit, because it has a whole-stack form and a partial-stack form
       and a plant that disarmed only one would be caught by whichever leg took the other. */
    patches: [[
      '      if v_have = p_qty then\n        delete from public.player_inventory where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n'
      + '      else\n        update public.player_inventory set qty = v_have - p_qty\n         where user_id = v_uid and slot = v_slot and item_id = p_item_id;\n      end if;',
      '      null;  -- INJECTED list_no_escrow',
    ]],
  },

  bank_deposit_no_debit: {
    what: 'a Storage deposit credits the account\'s Storage without debiting the hero\'s bag — a dupe through Storage',
    final: 'bank-move-final',
    patches: [[
      '    if v_have = p_qty then\n      delete from public.player_inventory\n        where user_id = v_uid and slot = p_slot and item_id = p_item;\n'
      + '    else\n      update public.player_inventory set qty = qty - p_qty\n        where user_id = v_uid and slot = p_slot and item_id = p_item;\n    end if;',
      '    null;  -- INJECTED bank_deposit_no_debit',
    ]],
  },

  restock_no_debit: {
    what: 'a hunt restock packs supplies into the hunt bag without debiting the hero\'s bag — a dupe through the packed bag',
    final: 'restock-final',
    patches: [[
      '  if v_have = p_qty then\n    delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = p_item;\n'
      + '  else\n    update public.player_inventory set qty = qty - p_qty where user_id = v_uid and slot = p_slot and item_id = p_item;\n  end if;',
      '  null;  -- INJECTED restock_no_debit',
    ]],
  },

  gold_double: {
    what: 'hr_apply credits a positive gold delta twice',
    /* ⚠ `final:`, NOT `file:` — SEE INJECTION_FINAL_BODIES. On 2026-09-12 the
       renown projection landed a §3(c6) probe that runs a paid apply and
       asserts the gold exactly, so this plant (measured at 2× 7,777) made the
       CHAIN refuse to install and the arm scored HARNESS. The gold credit is
       still authored at 2026-08-25-workers.sql:712 and still carried forward by
       every later patcher; what changed is that the clean chain now has to
       finish before the defect exists. Planted in the final body it reaches the
       ops, and the thing that should catch it does: the Σgold identity. */
    final: 'apply-final',
    /* THE `gate:` IS GONE, AND THE REASON IS THE WHOLE `apply-last` STORY.
       It used to read /the first claim paid 1000 gold, expected 500/ and fire in
       2026-08-16-claim-reward.sql, whose self-check claims a real reward and
       asserts the gold that arrived — a commit gate, which is a stronger outcome
       than a runtime catch. But that only worked because the plant was going into
       gem-daily-budget (apply-order 51), UPSTREAM of claim-reward — and the same
       fact made it a plant in a body that six later files overwrite, so it never
       tested the hr_apply the fuzz actually runs against. Planted where it
       belongs — for three weeks that was 93, the last author; since 2026-09-12
       it is the body the chain ENDS with — the gate cannot fire, and the defect
       is caught by the thing that should catch it: the conservation identity, at
       2,000,000 gold of drift over 400 ops. A gate that can no longer fire is a
       gate that quietly downgrades a catch to a harness error — budget_kind_scoped
       says so below, and this is that note applied to itself. */
    /* 2026-12-15: the credit lands in the ACCOUNT purse (2026-12-15-account-gold.sql §5's gold block). */
    patches: [[
      `        v_new_gold := public.hr_purse_move(v_uid, v_n, 0);`,
      `        v_new_gold := public.hr_purse_move(v_uid, v_n + greatest(v_n, 0), 0);  -- INJECTED gold_double`,
    ]],
  },

  buy_no_debit: {
    what: 'market_buy pays the seller and delivers the goods but never debits the buyer',
    /* 2027-01-12: hr_market_buy's last author is 2027-01-12-market-account.sql (account to account). */
    final: 'market-buy-final',
    patches: [[
      '    v_bpurse := public.hr_purse_move(v_uid, -v_gross, 0);',
      '    v_bpurse := public.hr_purse_move(v_uid, 0, 0);  -- INJECTED buy_no_debit',
    ]],
  },

  tax_skim: {
    what: 'market_buy destroys one extra gold per trade that no tax row accounts for (a leak, not a sink)',
    /* ⚠ THE LEAK IS PLANTED IN THE CREDIT, NOT IN `v_net`, AND THAT IS FORCED
       BY market_sales' OWN CONSTRAINT. `gold_gross = gold_net + tax` is a CHECK
       on the receipt table (market-v2 §1, "conservation, as a constraint"), so
       shaving `v_net` makes the INSERT raise, the exception handler answers
       `bad_market_write`, the trade is refused and nothing moves — the plant
       slips, having been stopped by a defence one layer down. That is the
       database doing its job, and it is also why this plant has to shave the
       gold that actually reaches the SELLER while leaving the receipt
       internally consistent: one gold per trade destroyed, no tax row for it,
       and the Σgold identity is the only thing that can see it. Measured: the
       `v_net` form SLIPPED here on 400 ops. */
    /* 2027-01-12: the seller's credit lands in the selling ACCOUNT's purse (2027-01-12-market-account.sql). */
    final: 'market-buy-final',
    patches: [[
      '    v_spurse := public.hr_purse_move(v_row.user_id, v_net, 0);',
      '    v_spurse := public.hr_purse_move(v_row.user_id, greatest(0, v_net - 1), 0);  -- INJECTED tax_skim',
    ]],
  },

  reject_mutates: {
    what: 'a REJECTED op still writes: hr_record_rejection (outside the protected block) credits gold',
    final: 'reject-final',
    /* THE GATE IS RETIRED, AND NOT BY CHOICE — READ THIS BEFORE PUTTING IT BACK.
       2026-08-11: caught by reconcile() at op #N. Then it was caught EARLIER —
       apply-engine §6(g)'s C5 probe drives a real rejection and asserts the
       character's gold did not move — so the arm became `gate:` with
       /a daily_budget rejection still moved gold/, on the rule that a bug which
       cannot be installed beats a bug detected at runtime.
       2026-09-13: 2026-09-13-rejections-verb-map-2.sql RESTATES
       hr_record_rejection at the END of the chain, so the plant in
       2026-08-11-player-state.sql (apply-order 20) is now overwritten by a clean
       body before a single op runs — boot()'s relocation detector caught it, the
       third arm in three days to hit the "the chain moved under the plant" class.
       Planting in the new last author instead would install the defect but put it
       DOWNSTREAM of the §6(g) probe at 34: the gate could then never fire, which
       is precisely the silent downgrade budget_kind_scoped's note warns about. So
       the arm returns to what it was built as — a runtime catch, scored by
       reconcile() against the body the chain ends with. The §6(g) probe is
       untouched and still guards production; it simply is not this arm's scorer
       any more. */
    patches: [[
      `  if p_user is null or p_code is null then return; end if;`,
      `  if p_user is null or p_code is null then return; end if;
  -- INJECTED reject_mutates: bookkeeping that moves value
  update public.account_wallet set gold = gold + 1
   where user_id = p_user;`,
    ]],
  },

  replay_applies_twice: {
    what: 'hr_apply loses idempotency — a replayed intent id applies its delta a second time',
    final: 'apply-final',
    // NOTE the shape. The obvious plant — make the player_intents lookup miss —
    // also breaks the S6 intent-collision branch, and apply-engine's own
    // self-verification block refuses to install a function without it. The
    // migration is therefore not installable with that bug, which is a genuine
    // (and welcome) second line of defence, but it means the fuzz never gets to
    // run. So this plant leaves the collision branch intact and only removes
    // the SHORT-CIRCUIT on a successful replay: the key is still recognised,
    // and the delta is applied a second time anyway. That is the real-world
    // shape of the bug — the b214 double-pay class — and it survives the
    // migration's own checks, which is exactly why the fuzz has to exist.
    patches: [
      [`    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;`,
        `    if coalesce(v_prev->>'ok', 'false') <> 'true' then    -- INJECTED replay_applies_twice
      return v_prev || jsonb_build_object('replayed', true);
    end if;
  end if;`],
      [`  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;`,
        `  on conflict (user_id, intent_id) do update set slot = excluded.slot;  -- INJECTED replay_applies_twice`],
    ],
  },

  equip_dupe: {
    what: 'unequip credits the bank without clearing the equipment row — the item is worn AND held',
    final: 'apply-final',
    patches: [[
      `            delete from public.player_equipment
             where user_id = v_uid and slot = v_slot and equip_slot = k;
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)`,
      `            -- INJECTED equip_dupe: the equipment row survives the unequip
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)`,
    ]],
  },

  reject_becomes_ok: {
    what: 'a rejection stops being a rejection — hr_apply answers ok:true to unknown_delta_key',
    final: 'apply-final',
    // The only injection here that moves NO value. It exists to prove the
    // want/got verdict assertion is real: without it the fuzz would book "the
    // op succeeded and legitimately changed nothing", stay green, and a
    // contract that had silently started accepting unimplemented delta keys
    // would ship. If this one ever SLIPS, the verdict check has gone soft.
    patches: [[
      `    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key',`,
      `    v_out := jsonb_build_object('ok', true, 'error', 'unknown_delta_key',  -- INJECTED reject_becomes_ok`,
    ]],
  },

  expire_double: {
    what: 'hr_market_expire reads the listing and then deletes it, instead of letting the DELETE be '
      + 'the arbiter — so an expiry racing a cancel returns one escrow to Storage twice',
    file: 'market-account',
    /* ⚠ `gate:` — AND THIS IS THE STRONGEST OUTCOME ON THE LIST. The account market's §9 (c)
       scans its own installed sweep for the try-lock / skip-locked / delete-as-arbiter shape and
       REFUSES TO INSTALL without it, so the bug cannot reach a database at all (one backend could
       not race it at runtime anyway). Recorded as a gate rather than "fixed" by finding a plant
       that evades the check — evading a commit gate to prove a runtime detector is testing the
       wrong thing. */
    gate: /hr_market_expire must TRY the Storage lock/,
    patches: [[
      '      delete from public.market_listings where id = v_c.id returning * into v_row;\n'
      + '      if not found then continue; end if;',
      '      select * into v_row from public.market_listings where id = v_c.id;\n'
      + '      delete from public.market_listings where id = v_c.id;',
    ]],
  },

  // ── THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ─────────────────────────
  // Six plants. THREE ARE `gate: true` — the migration's own do$$ block is
  // expected to refuse to install them, which is a stronger outcome than the
  // fuzz catching them at runtime and is the whole reason apply-engine §6(g)
  // stands up a real character instead of grepping prosrc. The other three are
  // deliberately chosen to be INVISIBLE to those migration probes (which only
  // exercise the gold dimension, and cannot see market-v2 at all), so
  // conservation-fuzz's own PHASE 3 has to be the thing that catches them.
  // Without that split, the phase assertions would be unproven decoration.

  budget_not_enforced: {
    what: 'hr_apply computes the daily-budget check and then ignores the answer',
    final: 'apply-final',
    /* No `gate:` any more, for gold_double's reason: it read /daily budget/i and
       fired on gem-daily-budget's own §10 mint-and-read-back check, which is
       upstream of the six files that re-create hr_apply. Planted in the last
       writer it reaches the fuzz, and PHASE 3 leg 5 answers it directly —
       "crossing the XP ceiling answered ok:true — it must be daily_budget". */
    patches: [[
      `      perform public.hr_reject('daily_budget', v_bud);`,
      `      perform 1;  -- INJECTED budget_not_enforced: the ceiling is computed and discarded`,
    ]],
  },

  budget_kind_scoped: {
    what: "the budget only counts kind='accrue' rows — and journal.kind is caller-chosen",
    /* Re-anchored 2026-08-17 onto the LIVE body (gate: gem-daily-budget §10(b)(i)),
       and 2026-10-19 onto the FINAL body: the account wallet re-authors
       hr_day_budget_used after that gate has run (see 'budget-final'). */
    final: 'budget-final',
    patches: [[
      `   where user_id = p_user
     and slot    = p_slot
     and at >= public.hr_utc_day_start(p_at)`,
      `   where user_id = p_user
     and slot    = p_slot
     and kind    = 'accrue'  -- INJECTED budget_kind_scoped
     and at >= public.hr_utc_day_start(p_at)`,
    ]],
  },

  budget_no_day_window: {
    what: 'the budget sums ALL time instead of the UTC day — one big day locks the account out forever',
    final: 'budget-final',   // the wallet re-authors hr_day_budget_used (see 'budget-final')
    patches: [[
      `     and at >= public.hr_utc_day_start(p_at)
     and at <  public.hr_utc_day_start(p_at) + interval '1 day';`,
      `     and at >= '-infinity'::timestamptz  -- INJECTED budget_no_day_window
     and at <  public.hr_utc_day_start(p_at) + interval '1 day';`,
    ]],
  },

  budget_ignores_xp: {
    what: 'hr_apply never stamps xp_in — XP is minted outside the daily ceiling',
    // Invisible to both migration probes: §8 and §6(g) exercise gold only.
    // PHASE 3 leg 5 is the only thing that can see it.
    final: 'apply-final',
    patches: [[
      `    if jsonb_typeof(p_delta->'xp') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_xp_in from jsonb_each_text(p_delta->'xp');
    end if;`,
      `    -- INJECTED budget_ignores_xp: v_xp_in stays 0`,
    ]],
  },

  budget_ignores_qty: {
    what: 'hr_apply never stamps qty_in — item units are minted outside the daily ceiling',
    final: 'apply-final',
    patches: [[
      `    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;`,
      `    -- INJECTED budget_ignores_qty: v_qty_in stays 0`,
    ]],
  },

  budget_qty_not_summed: {
    what: 'hr_apply stamps only the LARGEST item delta as qty_in — a mint split across ids is '
      + 'almost entirely free',
    /* THE DEFECT PHASE 3 LEG 6 EXISTS FOR, AND IT HAD NO PLANT UNTIL NOW. Leg 6
       asserted "the qty ceiling sums across item ids" for three weeks with
       nothing in this catalogue able to make that assertion fail — which is the
       always-null-probe class the header opens with, arrived at from the other
       direction: not an assertion that passes while asserting nothing, but an
       assertion nobody had ever seen fail. sum -> max is the realistic form (one
       aggregate, one word) and it is invisible to every other leg: a single-id
       mint stamps identically, so leg 2's 500-unit craft still reads 500.
       Caught by leg 6(a) at seven units and again by 6(b) at the ceiling. */
    final: 'apply-final',
    patches: [[
      `    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;`,
      `    if jsonb_typeof(p_delta->'items') = 'object' then
      -- INJECTED budget_qty_not_summed: max, not sum
      select coalesce(max(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;`,
    ]],
  },

  budget_market_credit_charged: {
    what: "market_buy stamps the seller's credit as progression inflow — selling a hoard burns the "
      + 'seller\'s whole day of progression',
    /* 2027-01-12: hr_market_buy's last author is 2027-01-12-market-account.sql (the seller's row: qty null). */
    final: 'market-buy-final',
    patches: [[
      '       v_row.item_id, null, v_net, 0, 0, 0, 0,',
      '       v_row.item_id, null, v_net, v_net, 0, 0, 0,',
    ]],
  },
};

/* THE HOUSE FROM STORAGE (2027-01-10-house-from-storage.sql). Storage is counted, never debited:
   the build lands and the materials are still in Storage — a dupe only Σ account_bank can see. */
INJECTIONS.house_storage_kept = {
  what: 'a house build counts the account\'s Storage but never debits it — the materials exist twice',
  final: 'house-take-final',
  patches: [[
    "    if (l->>'storage')::bigint > 0 then\n      if (l->>'storage')::bigint = (l->>'storage_held')::bigint then",
    "    if false then  -- INJECTED house_storage_kept\n      if (l->>'storage')::bigint = (l->>'storage_held')::bigint then",
  ]],
};

if (argv.includes('--list')) {
  for (const [id, inj] of Object.entries(INJECTIONS)) console.log(`${id.padEnd(22)} ${inj.what}`);
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════════════
// Seeded RNG — mulberry32. Same seed, same op sequence, same failure.
// ════════════════════════════════════════════════════════════════════════
function rngOf(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[next.int(arr.length)];
  next.range = (lo, hi) => lo + next.int(hi - lo + 1);
  // A weighted pick over [[weight, value], …].
  next.weighted = (table) => {
    const total = table.reduce((s, [w]) => s + w, 0);
    let r = next() * total;
    for (const [w, v] of table) { r -= w; if (r < 0) return v; }
    return table[table.length - 1][1];
  };
  return next;
}

// Deterministic uuids so a seed reproduces intent ids too.
const uuidOf = (rng) => {
  const hex = () => rng.int(16).toString(16);
  const s = (n) => Array.from({ length: n }, hex).join('');
  return `${s(8)}-${s(4)}-4${s(3)}-a${s(3)}-${s(12)}`;
};

// ════════════════════════════════════════════════════════════════════════
// The database
// ════════════════════════════════════════════════════════════════════════
async function boot(injectionId) {
  /* THE PLANT, TRANSLATED INTO bootReplay's VOCABULARY. bootReplay owns the
     anchor discipline now — it demands each anchor match EXACTLY ONCE and
     CHANGE the text, and throws `e.harness` otherwise — so the only thing left
     here is mapping the injection's short file name onto the chain's filename
     and refusing an unmapped one. Deleting the local copy of that discipline is
     the point: two implementations of "prove the plant landed" is one that gets
     weakened without the other noticing. */
  let patches = null;
  let finalBody = null;      // a `final:` plant — applied AFTER the chain, below
  if (injectionId) {
    const inj = INJECTIONS[injectionId];
    if (!inj) { process.stderr.write(`HARNESS: unknown injection "${injectionId}"\n`); process.exit(2); }
    if ((inj.file ? 1 : 0) + (inj.final ? 1 : 0) !== 1) {
      process.stderr.write(`HARNESS: injection "${injectionId}" must declare exactly one of file: (a `
        + 'migration in the chain) or final: (the body the chain ends with). Declaring both, or\n'
        + '  neither, leaves it ambiguous WHICH text the plant corrupts.\n');
      process.exit(2);
    }
    if (inj.final) {
      finalBody = INJECTION_FINAL_BODIES[inj.final];
      if (!finalBody) {
        process.stderr.write(`HARNESS: injection "${injectionId}" names final body "${inj.final}", `
          + 'which is not in INJECTION_FINAL_BODIES.\n');
        process.exit(2);
      }
      if (inj.gate) {
        /* A `final:` plant is installed after every migration has already run,
           so no migration self-check can possibly see it. Declaring a gate here
           would be a gate that CANNOT fire, which is the exact failure mode
           budget_kind_scoped's note names. */
        process.stderr.write(`HARNESS: injection "${injectionId}" declares both final: and gate:. A `
          + 'plant applied after the chain cannot be refused by a migration, so the gate could\n'
          + '  never fire and the arm would silently grade on the wrong thing.\n');
        process.exit(2);
      }
      return await bootFinalBody(injectionId, finalBody);
    }
    const file = INJECTION_FILES[inj.file];
    if (!file) {
      process.stderr.write(`HARNESS: injection "${injectionId}" names file "${inj.file}", which is `
        + 'not in INJECTION_FILES. Add it there (and check it is in the apply order) rather than\n'
        + '  letting the plant be applied to nothing.\n');
      process.exit(2);
    }
    /* ⚠ IS THIS PLANT STILL STANDING WHEN THE FUZZ RUNS? A migration chain is a
       sequence of `create or replace`, so patching the file that USED to be the
       last writer of a function plants a defect that a later file quietly
       replaces with the clean body — the fuzz then runs against clean SQL and
       reports whatever it would have reported anyway. That is the "planted bug
       that was never planted" class the INJECTION_FILES header calls the single
       most valuable thing the move to the full chain taught, and it came back
       anyway: on 2026-08-17 fight-carry started re-creating hr_apply after
       gem-daily-budget, and six of the plants declared on `apply-live` stopped
       being installed. Nobody could see it, because the clean run was red for an
       unrelated reason (PHASE 3 leg 6) and every child therefore exited non-zero.

       So the apply order is CHECKED, not trusted: if any file AFTER the declared
       one carries the same anchor text, the plant is overwritten and this exits 2
       (HARNESS) naming the file to move it to. It is a text check over the same
       manifest bootReplay applies, so it costs one read of each later file and it
       cannot go stale — the next time a migration re-creates a patched function,
       this says so on the first run instead of in three weeks' time.

       A false positive is possible in principle (the same text in an unrelated
       later object) and is DELIBERATELY still fatal: identical SQL text appearing
       later in the chain is worth one human look, and the fix — declare the file
       that actually wins — is one line. */
    {
      const { chainFiles } = await import('./schema-replay.mjs');
      const { readFile } = await import('node:fs/promises');
      const chain = await chainFiles();
      const at = chain.findIndex(([n]) => n === file);
      if (at < 0) {
        process.stderr.write(`HARNESS: injection "${injectionId}" names ${file}, which is not in the `
          + 'apply order (tests/schema-apply-order.json). A plant in a file the chain never applies\n'
          + '  is not a plant.\n');
        process.exit(2);
      }
      /* ⚠ "CARRIES THE ANCHOR" IS NOT "OVERWRITES THE PLANT" — b538.
         This check used to fail if ANY later file contained the anchor text,
         and that was wrong in one direction that matters. A migration chain has
         two kinds of later writer:

           AUTHOR   `create or replace function public.f` with a whole body.
                    The plant IS replaced by the clean text. Still fatal.
           PATCHER  reads f's own body back with pg_get_functiondef, edits it at
                    an anchor and re-executes it (the 2026-09-03-intent-mismatch
                    idiom). Such a file necessarily QUOTES the anchor it edits —
                    and it carries the plant FORWARD, because it patches whatever
                    body it finds, planted or not.

         2026-09-12-hr-rejections-journal.sql is the second kind on
         hr_record_rejection, and it made `reject_mutates` exit 2 as ambiguous
         even though the plant survives to chain end intact. A guard that goes
         red on correct work teaches people to loosen guards, so the rule is now
         scoped to the FUNCTION the anchor lives in and to re-AUTHORING it. The
         inference is then falsified by measurement below (see PLANT STILL
         STANDING): for every injection that carries an `-- INJECTED <id>`
         marker, the marker has to be present in the chain-end catalogue or this
         exits 2 anyway. Narrowed, and then checked — not relaxed. */
      /* Comments are stripped before ANY create-or-replace scan. Measured while
         building this: 2026-09-07-last-away-receipt.sql says, in prose,
         "It carries no literal `create or replace function public.hr_apply(`
         header" — and an unstripped regex reads that sentence as an author and
         declares three healthy injections overwritten. A guard that matches on
         a file's comments is reading documentation, not SQL. Dollar-quoted
         bodies are deliberately NOT stripped: a create-or-replace inside one
         that a migration then EXECUTEs really is an author. */
      const stripSql = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
      const declared = (await readFile(chain[at][1], 'utf8')).split('\r\n').join('\n');
      const fns = new Set();
      for (const [anchor] of inj.patches) {
        // The anchor is located in the RAW text (an anchor may itself contain a
        // comment); only the prefix being scanned for an owner is stripped.
        const cut = declared.indexOf(anchor);
        if (cut < 0) continue;   // bootReplay's own anchor discipline reports this
        const before = stripSql(declared.slice(0, cut));
        const owners = [...before.matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)];
        if (owners.length) fns.add(owners[owners.length - 1][1].toLowerCase());
      }
      if (fns.size === 0) {
        process.stderr.write(`HARNESS: injection "${injectionId}" — no `
          + 'create-or-replace-function precedes its anchor in ' + file + ', so the function the\n'
          + '  plant lands in cannot be resolved and "does a later file re-author it" cannot be\n'
          + '  answered. Fix the injection rather than skipping the question.\n');
        process.exit(2);
      }
      const overwritten = [];
      for (let i = at + 1; i < chain.length; i++) {
        const text = stripSql((await readFile(chain[i][1], 'utf8')).split('\r\n').join('\n'));
        for (const fn of fns) {
          if (new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`, 'i').test(text)) {
            overwritten.push(chain[i][0]);
            break;
          }
        }
      }
      if (overwritten.length) {
        process.stderr.write(`HARNESS: injection "${injectionId}" is planted in ${file}, but `
          + `${overwritten.length} later file(s) in the apply order RE-AUTHOR `
          + `${[...fns].join(', ')} and will\n`
          + `  overwrite it: ${overwritten.join(', ')}\n`
          + `  The fuzz would run against a CLEAN body and prove nothing. Declare the LAST writer\n`
          + `  (${overwritten[overwritten.length - 1]}) instead — add it to INJECTION_FILES if it is\n`
          + '  not there — and re-check what catches the plant once it actually reaches the run.\n');
        process.exit(2);
      }
    }
    patches = new Map([[file, inj.patches]]);
  }

  let db;
  try {
    ({ db } = await bootReplay(patches
      ? { patches, fullChain: 'the fuzz judges the CHAIN-END economy; the injection file is checked above to be the LAST writer' }
      : {}));
  } catch (e) {
    // A `gate: true` injection is one the MIGRATION'S OWN do$$ block is
    // supposed to refuse. That is a stronger result than the fuzz catching it
    // at runtime — the bug cannot even be installed — so it is reported as a
    // CATCH rather than as a harness failure.
    //
    // ⚠ THE MESSAGE HAS TO MATCH. Without `gateMatch` this would count a
    //   SYNTAX ERROR caused by a badly written patch as a successful catch,
    //   which is the "planted bug that was never planted" defect wearing a
    //   different hat: the injection would be graded on breaking the migration
    //   rather than on being detected by it.
    /* bootReplay's OWN harness failures — a stale anchor, a patch that changed
       nothing, a missing PGlite. Never a catch: an injection graded on breaking
       the replay engine is an injection that proves nothing about the market. */
    if (e.harness) { process.stderr.write(`HARNESS: ${e.message}\n`); process.exit(2); }
    const inj = injectionId ? INJECTIONS[injectionId] : null;
    if (inj && inj.gate && inj.gate.test(e.message)) {
      process.stdout.write(`CAUGHT at op #migration\n  the migration REFUSED TO INSTALL the planted bug:\n`
        + `  ${e.message}\n`);
      process.exit(0);
    }
    process.stderr.write(`HARNESS: migrations would not apply: ${e.message}\n`);
    if (inj && inj.gate) {
      process.stderr.write('  (this injection declares gate:, but the failure message did not match it —\n'
        + '   the patch probably broke the SQL instead of being detected by the self-check)\n');
    }
    process.exit(2);
  }
  /* ── PLANT STILL STANDING, MEASURED (b538) ────────────────────────────────
     The pre-boot check above is an INFERENCE about the apply order. This is the
     measurement that falsifies it: thirteen of the seventeen injections write a
     `-- INJECTED <id>` marker into the body they corrupt, so after the whole
     chain has replayed the marker must be READABLE IN THE CATALOGUE. If it is
     not, some later file replaced the body and the fuzz is about to run against
     clean SQL and report whatever it would have reported anyway — the "planted
     bug that was never planted" class, which the INJECTION_FILES header calls
     the single most valuable thing the move to the full chain taught, and which
     came back once already (fight-carry, 2026-08-17).

     It costs one indexed catalogue scan per injected run and it cannot go
     stale, because it asks the database rather than the file list. */
  if (injectionId) await assertPlantStanding(db, injectionId);
  if (injectionId && INJECTIONS[injectionId].gate) {
    // The gate did NOT fire. Do not exit here — let the fuzz run, so the plant
    // still gets a fair chance to be caught at runtime and the result reads as
    // SLIPPED only if nothing at all noticed.
    process.stderr.write(`NOTE: injection "${injectionId}" declares gate: but the migration installed it anyway.\n`);
  }
  return db;
}

/** The marker sweep, shared by both plant kinds — see PLANT STILL STANDING. */
async function assertPlantStanding(db, injectionId) {
  const marker = `-- INJECTED ${injectionId}`;
  if (!INJECTIONS[injectionId].patches.some(([, repl]) => repl.includes(marker))) return;
  const { rows } = await db.query(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and position($1 in p.prosrc) > 0`, [marker]);
  if (!rows[0] || rows[0].n === 0) {
    process.stderr.write(`HARNESS: injection "${injectionId}" applied, but after the FULL chain no `
      + `function in public carries its marker (${marker}).\n`
      + '  A later migration replaced the planted body, so the fuzz would run against clean SQL\n'
      + '  and prove nothing. Declare the file that actually wins, and re-check what catches it.\n');
    process.exit(2);
  }
}

/* ── A `final:` PLANT — CORRUPT THE BODY THE CHAIN ENDED UP WITH ───────────
   The chain replays VERBATIM: every migration self-check certifies the clean
   body, exactly as it does on production, and nothing is bypassed. Then the
   defect is spliced into `pg_get_functiondef(...)` — the same text the renown
   file's §1 patcher edits, read from the catalogue rather than from a file —
   and re-executed, which is how every patcher in the chain installs its own
   change. `create or replace` preserves the grants, so the revoke/grant set
   the chain established still stands.

   bootReplay's anchor discipline is reproduced here rather than reused,
   because bootReplay speaks in files and this speaks in catalogue text; it is
   the same three rules — the anchor matches EXACTLY ONCE, the replacement
   CHANGES the text, and the result is re-read out of pg_proc afterwards. A
   plant that could not be placed is a harness failure, never a catch. */
async function bootFinalBody(injectionId, signature) {
  const inj = INJECTIONS[injectionId];
  let db;
  try {
    ({ db } = await bootReplay({}));
  } catch (e) {
    if (e.harness) { process.stderr.write(`HARNESS: ${e.message}\n`); process.exit(2); }
    process.stderr.write(`HARNESS: migrations would not apply (CLEAN chain, before the "${injectionId}" `
      + `plant was placed — so this is not the plant): ${e.message}\n`);
    process.exit(2);
  }
  let def;
  try {
    const { rows } = await db.query('select pg_get_functiondef($1::regprocedure) as def', [signature]);
    def = rows[0] && rows[0].def;
  } catch (e) {
    process.stderr.write(`HARNESS: injection "${injectionId}" targets ${signature}, which the chain did `
      + `not leave installed: ${e.message}\n`);
    process.exit(2);
  }
  if (!def) {
    process.stderr.write(`HARNESS: injection "${injectionId}" targets ${signature}, which the chain did `
      + 'not leave installed.\n');
    process.exit(2);
  }
  for (const [anchor, repl] of inj.patches) {
    const hits = def.split(anchor).length - 1;
    if (hits !== 1) {
      process.stderr.write(`HARNESS: injection "${injectionId}" — its anchor matches ${hits} time(s) in `
        + `the final body of ${signature} (expected exactly 1). The chain has moved under the plant;\n`
        + '  re-read the body and re-anchor rather than planting into text that is not there.\n'
        + `  anchor: ${JSON.stringify(anchor.slice(0, 120))}\n`);
      process.exit(2);
    }
    const next = def.replace(anchor, repl);
    if (next === def) {
      process.stderr.write(`HARNESS: injection "${injectionId}" — the patch did not CHANGE the final `
        + `body of ${signature}. A planted bug that was never planted is not a plant.\n`);
      process.exit(2);
    }
    def = next;
  }
  await db.exec(def);
  await assertPlantStanding(db, injectionId);
  return db;
}

// ════════════════════════════════════════════════════════════════════════
// The model — an independent second set of books.
// ════════════════════════════════════════════════════════════════════════
class Books {
  constructor() {
    this.chars = new Map();     // "uid:slot" → {uid, slot, gold, inv:Map, equip:Map, version, bankCap}
    /* GOLD IS THE ACCOUNT'S (2026-12-15-account-gold.sql): ONE purse per uid, which every character of
       the account reads and writes as `c.gold` (an accessor, so every op below models account gold
       without knowing it). */
    this.purses = new Map();    // uid → gold
    this.opened = new Set();    // the accounts whose opening purse is booked (once each)
    /* THE ACCOUNT MARKET (2027-01-12-market-account.sql): a listing is the ACCOUNT's (uid), filed
       under the hero that listed it (key); cancel and expiry return it to the account's Storage. */
    this.listings = new Map();  // listingId → {key, uid, item, qty, ask, fee, aged}
    /* STORAGE IS THE ACCOUNT'S (account_bank, 2026-11-27-account-depot.sql): uid → Map(item → qty). */
    this.storage = new Map();
    this.storageOpened = new Set();
    this.huntBag = new Map();   // "uid:slot" → Map(item → qty_left): a running hunt's packed supplies
    this.tax = 0;               // Σ house tax the harness EXPECTS to have been taken
    this.fees = 0;              // Σ listing fees the harness EXPECTS to have been burned
    this.mintGold = 0; this.burnGold = 0;
    this.mintItems = new Map(); this.burnItems = new Map();
    this.openGold = 0; this.openItems = new Map();
  }
  char(key) { return this.chars.get(key); }
  /** A character of account `uid`: its own bag and gear, the ACCOUNT's gold. */
  newChar(uid, slot) {
    const purses = this.purses;
    if (!purses.has(uid)) purses.set(uid, 0);
    return { uid, slot, inv: new Map(), equip: new Map(), version: 0, bankCap: 100,
      get gold() { return purses.get(uid) || 0; }, set gold(v) { purses.set(uid, v); } };
  }
  /** Book an account's opening purse ONCE, however many of its characters read it. */
  openPurse(uid, gold) {
    if (this.opened.has(uid)) return;
    this.opened.add(uid);
    this.purses.set(uid, gold);
    this.openGold += gold;
  }
  addItem(m, id, n) { m.set(id, (m.get(id) || 0) + n); }
  mint(id, n) { this.addItem(this.mintItems, id, n); }
  burn(id, n) { this.addItem(this.burnItems, id, n); }
  /** Book an account's opening Storage ONCE (rows the database already holds). */
  openStorage(uid, rows) {
    if (this.storageOpened.has(uid)) return;
    this.storageOpened.add(uid);
    for (const r of rows) { this.stoAdd(uid, r.item_id, Number(r.q)); this.addItem(this.openItems, r.item_id, Number(r.q)); }
  }
  stoAdd(uid, id, n) {
    if (!this.storage.has(uid)) this.storage.set(uid, new Map());
    const m = this.storage.get(uid);
    const cur = (m.get(id) || 0) + n;
    if (cur < 0) throw new Error(`model Storage went negative on ${id}`);
    if (cur === 0) m.delete(id); else m.set(id, cur);
  }
  invAdd(c, id, n) {
    const cur = (c.inv.get(id) || 0) + n;
    if (cur < 0) throw new Error(`model went negative on ${id}`);
    if (cur === 0) c.inv.delete(id); else c.inv.set(id, cur);
  }
  /** An account's Storage, as a Map (made on first use). */
  storeOf(uid) { if (!this.storage.has(uid)) this.storage.set(uid, new Map()); return this.storage.get(uid); }
  /** The kinds the account's Storage ROOM counts: kinds in Storage + kinds it has listed. */
  roomKinds(uid) {
    const k = new Set(this.storeOf(uid).keys());
    for (const l of this.listings.values()) if (l.uid === uid) k.add(l.item);
    return k;
  }
  /** Everything the world currently believes it holds, by item. */
  itemTotals() {
    const t = new Map();
    for (const c of this.chars.values()) {
      for (const [id, n] of c.inv) this.addItem(t, id, n);
      for (const id of c.equip.values()) this.addItem(t, id, 1);
    }
    for (const m of this.huntBag.values()) for (const [id, n] of m) this.addItem(t, id, n);
    for (const l of this.listings.values()) this.addItem(t, l.item, l.qty);
    for (const m of this.storage.values()) for (const [id, n] of m) this.addItem(t, id, n);
    return t;
  }
  goldTotal() { let g = 0; for (const v of this.purses.values()) g += v; return g; }
}

// ════════════════════════════════════════════════════════════════════════
// Reconciliation. Two independent checks, run after EVERY operation:
//
//   (A) EXACT — the modelled balance of every character, every equipment
//       slot and every listing must equal the database, row for row. This is
//       the sharp instrument: it names the character and the item.
//
//   (B) CONSERVATION — the stated property, computed from DATABASE-ONLY
//       aggregates against mint/burn counters. It scans every row in the
//       database rather than only the characters the model knows about, so a
//       stack that materialises somewhere the model never looks is still
//       caught.
// ════════════════════════════════════════════════════════════════════════
async function reconcile(db, books, ctx) {
  const bad = [];
  const q = async (s) => (await db.query(s)).rows;

  const stateRows = await q('select user_id::text u, slot, version::text v from player_state');
  /* GOLD IS THE ACCOUNT'S (2026-12-15-account-gold.sql): every purse in the database, by account. */
  const purseRows = await q('select user_id::text u, gold::text g from account_wallet');
  const invRows = await q('select user_id::text u, slot, item_id, qty::text q from player_inventory');
  const eqRows = await q('select user_id::text u, slot, equip_slot, item_id from player_equipment');
  const lstRows = await q('select id::text id, user_id::text u, slot, item_id, qty::text q, ask_each::text a, fee::text f from market_listings');
  /* STORAGE, the ACCOUNT's (account_bank): exact per account in (A), counted in the world's total in (B). */
  const stoRows = await q('select user_id::text u, item_id, qty::text q from account_bank');
  const huntRows = await q('select user_id::text u, slot, item_id, sum(qty_left)::text q from hunt_bag group by 1, 2, 3');
  const [{ tax, gross, net }] = await q(
    'select coalesce(sum(tax),0)::text tax, coalesce(sum(gold_gross),0)::text gross, coalesce(sum(gold_net),0)::text net from market_sales');
  /* THE LISTING FEE IS A SINK (2027-01-12-market-account.sql): one ledger row per listing, gold = -fee. */
  const [{ fees }] = await q("select coalesce(sum(-gold),0)::text fees from player_ledger where kind = 'trade' and intent like 'market\\_list:%'");

  // ── (A) exact, per character ─────────────────────────────────────────
  const dbGold = new Map(); const dbVer = new Map();
  for (const r of stateRows) dbVer.set(`${r.u}:${r.slot}`, Number(r.v));
  for (const r of purseRows) dbGold.set(r.u, Number(r.g));
  const dbInv = new Map();
  for (const r of invRows) {
    const k = `${r.u}:${r.slot}`;
    if (!dbInv.has(k)) dbInv.set(k, new Map());
    dbInv.get(k).set(r.item_id, Number(r.q));
  }
  const dbEq = new Map();
  for (const r of eqRows) {
    const k = `${r.u}:${r.slot}`;
    if (!dbEq.has(k)) dbEq.set(k, new Map());
    dbEq.get(k).set(r.equip_slot, r.item_id);
  }

  if (stateRows.length !== books.chars.size) {
    bad.push(`character count: db ${stateRows.length}, model ${books.chars.size}`);
  }
  for (const [uid, g] of books.purses) {
    if ((dbGold.get(uid) || 0) !== g) bad.push(`purse[${uid}]: db ${dbGold.get(uid) || 0}, expected ${g}`);
  }
  for (const [key, c] of books.chars) {
    if (dbVer.get(key) !== c.version) bad.push(`version[${key}]: db ${dbVer.get(key)}, expected ${c.version}`);
    const inv = dbInv.get(key) || new Map();
    for (const id of new Set([...inv.keys(), ...c.inv.keys()])) {
      if ((inv.get(id) || 0) !== (c.inv.get(id) || 0)) {
        bad.push(`inv[${key}][${id}]: db ${inv.get(id) || 0}, expected ${c.inv.get(id) || 0}`);
      }
    }
    const eq = dbEq.get(key) || new Map();
    for (const s of new Set([...eq.keys(), ...c.equip.keys()])) {
      if ((eq.get(s) || null) !== (c.equip.get(s) || null)) {
        bad.push(`equip[${key}][${s}]: db ${eq.get(s) || 'none'}, expected ${c.equip.get(s) || 'none'}`);
      }
    }
  }

  // Storage, per account
  const dbSto = new Map();
  for (const r of stoRows) {
    if (!dbSto.has(r.u)) dbSto.set(r.u, new Map());
    dbSto.get(r.u).set(r.item_id, Number(r.q));
  }
  for (const uid of new Set([...dbSto.keys(), ...books.storage.keys()])) {
    const d = dbSto.get(uid) || new Map(); const m = books.storage.get(uid) || new Map();
    for (const id of new Set([...d.keys(), ...m.keys()])) {
      if ((d.get(id) || 0) !== (m.get(id) || 0)) bad.push(`storage[${uid}][${id}]: db ${d.get(id) || 0}, expected ${m.get(id) || 0}`);
    }
  }

  // listings (the escrow)
  const dbL = new Map(lstRows.map((r) => [r.id, r]));
  for (const id of new Set([...dbL.keys(), ...books.listings.keys()])) {
    const d = dbL.get(id); const m = books.listings.get(id);
    if (!d && m) { bad.push(`listing ${id.slice(0, 8)}: gone from db, model holds ${m.qty}×${m.item} in escrow`); continue; }
    if (d && !m) { bad.push(`listing ${id.slice(0, 8)}: in db (${d.q}×${d.item_id}) but not in model`); continue; }
    if (Number(d.q) !== m.qty) bad.push(`listing ${id.slice(0, 8)} qty: db ${d.q}, expected ${m.qty}`);
    if (d.item_id !== m.item) bad.push(`listing ${id.slice(0, 8)} item: db ${d.item_id}, expected ${m.item}`);
    if (Number(d.a) !== m.ask) bad.push(`listing ${id.slice(0, 8)} ask: db ${d.a}, expected ${m.ask}`);
    if (d.u !== m.uid) bad.push(`listing ${id.slice(0, 8)} owner: db ${d.u}, expected the account ${m.uid}`);
    if (Number(d.f) !== m.fee) bad.push(`listing ${id.slice(0, 8)} fee: db ${d.f}, expected ${m.fee}`);
  }

  // a running hunt's packed supplies, by hero
  const dbHunt = new Map();
  for (const r of huntRows) {
    const k = `${r.u}:${r.slot}`;
    if (!dbHunt.has(k)) dbHunt.set(k, new Map());
    dbHunt.get(k).set(r.item_id, Number(r.q));
  }
  for (const k of new Set([...dbHunt.keys(), ...books.huntBag.keys()])) {
    const d = dbHunt.get(k) || new Map(); const m = books.huntBag.get(k) || new Map();
    for (const id of new Set([...d.keys(), ...m.keys()])) {
      if ((d.get(id) || 0) !== (m.get(id) || 0)) bad.push(`hunt_bag[${k}][${id}]: db ${d.get(id) || 0}, expected ${m.get(id) || 0}`);
    }
  }

  // ── (B) CONSERVATION, from the database alone ────────────────────────
  const worldItems = new Map();
  const add = (id, n) => worldItems.set(id, (worldItems.get(id) || 0) + n);
  for (const r of invRows) add(r.item_id, Number(r.q));
  for (const r of eqRows) add(r.item_id, 1);
  for (const r of huntRows) add(r.item_id, Number(r.q));
  for (const r of lstRows) add(r.item_id, Number(r.q));
  for (const r of stoRows) add(r.item_id, Number(r.q));

  for (const id of new Set([...worldItems.keys(), ...books.openItems.keys(),
    ...books.mintItems.keys(), ...books.burnItems.keys()])) {
    const expected = (books.openItems.get(id) || 0)
      + (books.mintItems.get(id) || 0) - (books.burnItems.get(id) || 0);
    const actual = worldItems.get(id) || 0;
    if (actual !== expected) {
      bad.push(`CONSERVATION item ${id}: world holds ${actual}, ledger says `
        + `${books.openItems.get(id) || 0} opening + ${books.mintItems.get(id) || 0} minted `
        + `- ${books.burnItems.get(id) || 0} burned = ${expected} (drift ${actual - expected})`);
    }
  }

  let worldGold = 0;
  for (const r of purseRows) worldGold += Number(r.g);
  const expectedGold = books.openGold + books.mintGold - books.burnGold - Number(tax) - Number(fees);
  if (worldGold !== expectedGold) {
    bad.push(`CONSERVATION gold: players hold ${worldGold}, ledger says `
      + `${books.openGold} opening + ${books.mintGold} minted - ${books.burnGold} burned `
      + `- ${tax} house tax - ${fees} listing fees = ${expectedGold} (drift ${worldGold - expectedGold})`);
  }
  // …and the fees the SERVER journalled are the fees the harness computed from the asks it chose.
  if (Number(fees) !== books.fees) bad.push(`listing fees: db ${fees}, expected ${books.fees}`);
  // The house tax the SERVER recorded must equal the tax the harness computed
  // from the prices it chose. A trade that quietly takes a different cut is a
  // conservation violation that the gold identity above would absorb, because
  // that identity trusts market_sales.tax.
  if (Number(tax) !== books.tax) bad.push(`house tax: db ${tax}, expected ${books.tax}`);
  // …and the receipt must be internally consistent: gross = net + tax.
  if (Number(gross) !== Number(net) + Number(tax)) {
    bad.push(`market_sales receipt: gross ${gross} <> net ${net} + tax ${tax}`);
  }

  if (bad.length) {
    return { ok: false, detail: `after op #${ctx.i} [${ctx.op}] ${ctx.note || ''}\n      ` + bad.join('\n      ') };
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════
// The run
// ════════════════════════════════════════════════════════════════════════
async function runFuzz({ seed, ops, injection }) {
  const rng = rngOf(seed);
  const db = await boot(injection);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const rpc = async (sql, params) => {
    try { return (await db.query(sql, params)).rows[0].r; }
    catch (e) { return { ok: false, error: '__exception', message: e.message }; }
  };
  const asUser = async (uid) => { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); };

  // ── the working catalogue, read from the SERVER's own generated tables ──
  /* LISTABLE stackables (2027-01-12-market-account.sql's one rule, hr_market_items): the market ops
     trade them, so every working-set item has a floor (the shop's bid) and a ceiling to ask between. */
  const stackRows = await q(
    `select m.item_id, m.floor_each::text f, m.ceiling_each::text c from hr_market_items m
      where m.listable and m.item_id not in (select item_id from hr_item_slots)
      order by m.item_id limit 400`);
  const stackables = stackRows.map((r) => r.item_id);
  const PRICE = new Map(stackRows.map((r) => [r.item_id, { floor: Number(r.f), ceil: Number(r.c) }]));
  const askOf = (id) => { const p = PRICE.get(id); return rng.range(p.floor, Math.min(p.ceil, p.floor + 400)); };
  const wearables = await q(
    `select i.item_id, s.equip_slot from hr_items i
       join hr_item_slots s using (item_id)
      where i.tradeable and coalesce(i.req_lv, 1) <= 1   -- a level-1 character can wear it (W0 rules every wearable, the starters at 1)
      order by i.item_id, s.equip_slot limit 400`);
  const untradeable = (await q('select item_id from hr_items where not tradeable order by item_id limit 20')).map((r) => r.item_id);
  const activities = await q("select kind, activity_id from hr_activities where req_lv is null order by kind, activity_id limit 200");
  /* THE MARKET SHIPS OFF (2027-01-12-market-account.sql §2): the fuzz plays it, so it switches it on,
     the operator's one UPDATE. It moves no value and no schema object. */
  await q('update hr_market_config set enabled = true where only_row');
  const cfg = (await q('select house_tax_bp, listing_ttl_h, max_listings, max_qty, list_fee_bp, list_fee_min from hr_market_config'))[0];
  const TAX_BP = Number(cfg.house_tax_bp);
  const FEE_BP = Number(cfg.list_fee_bp); const FEE_MIN = Number(cfg.list_fee_min);
  /* THE LISTING FEE ROUNDS UP and never falls under its minimum (the migration's §4a). */
  const feeOf = (qty, ask) => Math.max(FEE_MIN, Math.ceil((qty * ask * FEE_BP) / 10000));
  const ROOM_CAP = Number((await q('select base_stacks from hr_depot_config'))[0].base_stacks);
  /* THE HOUSE TAX ROUNDS UP, AND THE MODEL MUST ROUND THE SAME WAY.
     2026-08-17-market-v2.sql section 7(5) computes
       v_tax := ceil(v_gross_n * house_tax_bp::numeric / 10000)::bigint
     - the Designer's ruling on Security condition 12 (64e8a99c, 2026-08-15): trunc
     let a whole-number split to ZERO tax (sixty 1-gold buys paid 0), and rounding
     in the SINK's favour is what an anti-inflation drain is for. This model kept
     Math.trunc from 0f362815 (2026-08-11) and was never moved with it, so every
     buy whose gross*bp did not divide 10000 exactly booked one gold less tax than
     the server took: measured live here as `house tax: db 10, expected 9` on a
     650-gold buy (650*150/10000 = 9.75). The SERVER is right; the model was wrong.
     Keep these two expressions in step - a conservation model that rounds
     differently from the thing it audits reports arithmetic as theft. */
  /* ONE EXPRESSION, THREE CALL SITES. The drift above happened because the
     same arithmetic was typed out three times and only the copies somebody
     was looking at got moved. A function cannot drift from itself. */
  const houseTax = (gross) => Math.ceil((gross * TAX_BP) / 10000);
  const MAX_LISTINGS = Number(cfg.max_listings);

  // A SMALL working set — a fuzz that spreads 400 items over 400 ops never
  // collides, and collisions (two characters trading the same stack, an equip
  // of something already listed) are where conservation bugs live.
  const ITEMS = stackables.slice(0, 6).concat(stackables.slice(40, 44));
  const WEAR = wearables.slice(0, 6);
  if (ITEMS.length < 8 || WEAR.length < 3 || !untradeable.length || !activities.length) {
    process.stderr.write('HARNESS: the generated catalogue did not yield a usable working set\n');
    process.exit(2);
  }

  // ── characters ───────────────────────────────────────────────────────
  const books = new Books();
  const keys = [];
  for (let u = 0; u < USERS; u++) {
    const uid = `000000${String(u).padStart(2, '0')}-0000-4000-a000-${String(u).padStart(12, '0')}`;
    /* ⚠ UPSERT, NOT INSERT, AND THE REASON IS THE POINT OF MOVING TO THE FULL
       CHAIN. The old six-file bundle had no `on_auth_user_created` trigger, so
       a profile row was this harness's to create. The real chain HAS one, and a
       plain insert therefore raises a duplicate key before op #0 — reported, on
       the first run, as a conservation violation, which is a harness failure
       wearing the costume of a finding. The display name is still forced,
       because hr_market_list DERIVES seller_name from this column and a leg
       asserting on it wants a name it chose. */
    await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query(
      'insert into profiles(id, display_name) values ($1,$2) '
      + 'on conflict (id) do update set display_name = excluded.display_name', [uid, `Fuzzer${u}`]);
    await asUser(uid);
    for (let s = 0; s < SLOTS; s++) {
      /* SLOT 0 IS FREE; EVERY SLOT ABOVE IT MUST BE OWNED. Since
         2026-09-08-hero-slot-buy.sql section 8, hr_create_character gates any slot > 0
         on account-level ownership - `if v_slot > 0 and not
         (hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then slot_not_owned` - which is
         the gate that closed the free-extra-character mint. A bare
         hr_create_character(1) is therefore CORRECTLY refused, and this harness
         (default --slots=2) died in setup with slot_not_owned before op #0: a stale
         fixture wearing the costume of a conservation finding.
         So OWN the slot first, the way a player does: plant the byte-identical
         player_progress row hr_buy_hero_slot writes in its section 10 (slot 0,
         kind='flag', key='character_slot:<n>', period_key='', value 1) through the
         owner-level DML seam this file already uses for fixtures, then create through
         the real, now-gated RPC. Same fix and same reasoning as tests/market-v2.mjs
         (c7ca8261). Planting a flag row mints NO value - player_progress flags are
         outside the gold/item/market ledger this fuzz conserves - so the OPENING
         balance read below is unchanged by it. */
      if (s > 0) {
        await q(
          `insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
           values ($1, 0, 'flag', $2, 1, '', null, now())
           on conflict (user_id, slot, kind, key, period_key) do nothing`,
          [uid, `character_slot:${s}`]);
      }
      const r = await rpc('select hr_create_character($1) r', [s]);
      if (r.ok !== true) { process.stderr.write(`HARNESS: hr_create_character failed: ${JSON.stringify(r)}\n`); process.exit(2); }
      const key = `${uid}:${s}`;
      keys.push(key);
      books.chars.set(key, books.newChar(uid, s));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE OPENING POSITION IS MEASURED, NOT ASSUMED TO BE ZERO.
     ══════════════════════════════════════════════════════════════════════
     `hr_create_character` grants a STARTER KIT — gold, seeds, food and an
     EQUIPPED bronze sword. The old six-file bundle did not include
     character-bootstrap, so a fresh character really was empty and the model
     could start from zero; on the full chain that assumption is false, and it
     failed loudly on the first run (24 carrot seeds and 4,000 gold of "drift"
     that were simply the game's own starting gift).

     So the opening is READ ONCE, here, from the database, and booked as
     OPENING rather than as a mint. That is the one and only place this harness
     is allowed to learn a number from the thing it is testing, and it is safe
     for the reason the header states: everything AFTER this point is modelled
     from the operation's own parameters and the verdict it returned, never from
     a later read. A starter kit that changed size would move the opening and
     change nothing else — which is exactly what an opening balance is for. */
  for (const key of keys) {
    const c = books.char(key);
    const st = (await q(`select coalesce((select w.gold from account_wallet w where w.user_id = '${c.uid}'), 0)::text g, version::text v
                           from player_state where user_id = '${c.uid}' and slot = ${c.slot}`))[0];
    books.openPurse(c.uid, Number(st.g)); c.version = Number(st.v);
    for (const r of await q(`select item_id, qty::text q from player_inventory
                              where user_id = '${c.uid}' and slot = ${c.slot}`)) {
      c.inv.set(r.item_id, Number(r.q));
      books.addItem(books.openItems, r.item_id, Number(r.q));
    }
    for (const r of await q(`select equip_slot, item_id from player_equipment
                              where user_id = '${c.uid}' and slot = ${c.slot}`)) {
      c.equip.set(r.equip_slot, r.item_id);
      books.addItem(books.openItems, r.item_id, 1);
    }
    books.openStorage(c.uid, await q(`select item_id, qty::text q from account_bank where user_id = '${c.uid}'`));
  }

  // ── opening balances, minted on purpose and counted as mints ─────────
  // Seeding through hr_apply rather than by INSERT keeps the opening position
  // inside the same contract everything else uses; the mint counters then make
  // the conservation identity hold from op #0.
  for (const key of keys) {
    const c = books.char(key);
    const items = {};
    for (const id of ITEMS) items[id] = 40;
    for (const w of WEAR) items[w.item_id] = (items[w.item_id] || 0) + 2;
    const gold = 250000;
    await asUser(c.uid);
    await db.exec('set role hr_engine');
    const r = await rpc('select hr_apply($1,$2,$3,$4,$5::jsonb) r',
      [c.uid, c.slot, c.version, uuidOf(rng),
        JSON.stringify({ gold, items, journal: { kind: 'admin', intent: 'seed' } })]);
    await db.exec('reset role');
    if (r.ok !== true) { process.stderr.write(`HARNESS: seeding failed: ${JSON.stringify(r)}\n`); process.exit(2); }
    c.gold += gold; c.version += 1;
    books.mintGold += gold;
    for (const [id, n] of Object.entries(items)) { books.invAdd(c, id, n); books.mint(id, n); }
  }

  // Opening position is recorded AFTER seeding, and the mints above are kept in
  // the counters, so the identity is checked against a non-trivial baseline
  // rather than against zero.
  {
    const r0 = await reconcile(db, books, { i: -1, op: 'seed' });
    if (!r0.ok) return { ok: false, seed, detail: `seeding did not reconcile\n${r0.detail}`, opsRun: 0 };
  }

  // ── op bookkeeping ───────────────────────────────────────────────────
  const usedIntents = [];      // {id, delta, key, journalIntent} for replay/mismatch ops
  const counts = Object.create(null);
  const verdicts = Object.create(null);
  const divergences = [];
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
  /* PHASE 0's leg and PHASE 1's coverage of the same path, MEASURED. The
     equip_dupe incident (see PHASE 0) was invisible because nothing reported
     how often the return-to-bag branch actually ran — a run with zero occupied
     unequips printed the same summary as a run with ten. summarise() prints
     these, so the leg cannot be deleted, and the bias cannot regress, without
     the next run saying so out loud. */
  const equip = { leg: false, unequips: 0, worn: 0 };

  // Rate buckets: the fuzz issues far more calls per wall-clock minute than a
  // player ever could, so it would spend most of a long run rate-limited and
  // exercise nothing. Rolling the window forward is a CLOCK simulation — it
  // touches an unlogged counter and moves no value — and the rate-limit path
  // gets its own deliberate probe (`rate_storm`) instead of being an accident.
  const rollWindows = async () => {
    await db.query("update hr_rate_counters set window_start = now() - interval '2 hours'");
  };

  const applyAs = async (c, version, intentId, delta) => {
    await asUser(c.uid);
    await db.exec('set role hr_engine');
    const r = await rpc('select hr_apply($1,$2,$3,$4,$5::jsonb) r',
      [c.uid, c.slot, version, intentId, JSON.stringify(delta)]);
    await db.exec('reset role');
    return r;
  };

  /* ══════════════════════════════════════════════════════════════════════
     THE MARKET SEAM (2026-08-17). ENGINE-ONLY, AND THAT IS THE CHANGE.
     ══════════════════════════════════════════════════════════════════════
     Market v1's RPCs were granted to `authenticated` and took (slot, …), so
     this harness called them AS THE PLAYER. Under v2 they are granted to
     `hr_engine` ALONE and take (p_user, p_slot, p_version, p_intent_id, …) —
     the same first four parameters hr_apply takes, from the same caller, behind
     the same gate. The browser cannot reach them at all.

     So every market call here now goes through the engine role, names the user
     it is acting for, and NAMES THE VERSION IT READ. That last one is not
     bookkeeping: `p_version` is the whole of the concurrency control, a stale
     one is refused, and the harness's `books` already tracks a version per
     character — so the fuzz is now exercising optimistic concurrency on the
     market path for free, and a missing bump shows up as a `version[…]` diff in
     reconcile() rather than as a silent divergence.

     The JWT claim is still set, deliberately: hr_market_* reads `auth.uid()`
     when the caller is not the engine, and leaving a stale claim behind is how
     a later leg would run as the wrong player. */
  const marketAs = async (c, sql, params) => {
    await asUser(c.uid);
    await db.exec('set role hr_engine');
    const r = await rpc(sql, params);
    await db.exec('reset role');
    return r;
  };
  /* THE ACCOUNT MARKET (2027-01-12-market-account.sql): list names a SOURCE (the hero's bag or
     the account's Storage), buy names a MAX price and a DESTINATION (Storage or the hero's bag),
     and cancel carries no version (it touches no bag). */
  const mList = (c, item, qty, ask, version, source = 'bag') => marketAs(c,
    'select hr_market_list($1::uuid,$2::int,$3::bigint,$4::uuid,$5::text,$6::text,$7::bigint,$8::bigint) r',
    [c.uid, c.slot, version ?? c.version, uuidOf(rng), source, item, qty, ask]);
  const mCancel = (c, listing) => marketAs(c,
    'select hr_market_cancel($1::uuid,$2::int,$3::uuid,$4::uuid) r',
    [c.uid, c.slot, uuidOf(rng), listing]);
  const mBuy = (c, listing, qty, maxEach, deliver = 'storage', version) => marketAs(c,
    'select hr_market_buy($1::uuid,$2::int,$3::bigint,$4::uuid,$5::uuid,$6::bigint,$7::bigint,$8::text) r',
    [c.uid, c.slot, version ?? c.version, uuidOf(rng), listing, qty, maxEach, deliver]);
  /* Storage moves are the PLAYER's verb (authenticated, auth.uid()), not the engine's. */
  const bankAs = async (c, item, qty, dir) => {
    await asUser(c.uid);
    await db.exec('set role authenticated');
    const r = await rpc('select hr_bank_move($1::int,$2::text,$3::bigint,$4::text,$5::uuid) r', [c.slot, item, qty, dir, uuidOf(rng)]);
    await db.exec('reset role');
    return r;
  };
  /* ⚠ THE SWEEP IS RUN AS THE OWNER, NOT AS THE ENGINE, AND THAT IS THE POINT
       OF §8. hr_market_expire is callable by NOBODY — not anon, not
       authenticated, not service_role, and NOT hr_engine. It has no grant at
       all, because the only caller it is meant to have is pg_cron, which runs
       as the function's owner. Calling it here as hr_engine would fail with a
       permission error and read as a broken harness; calling it as the owner is
       what production does. The pg_cron shim records the job and does not run
       it, so a deterministic harness has to drive the sweep itself anyway. */
  const mExpire = async (limit) => {
    await db.exec('reset role');
    return (await q(`select hr_market_expire(${Number(limit) | 0}) r`))[0].r;
  };
  /* The listings an ACCOUNT holds (any hero), and the ones another account could buy. */
  const openOf = (uid) => [...books.listings.values()].filter((l) => l.uid === uid).length;
  const listedToday = Object.create(null);   // uid → successful lists this run (the day cap's count)

  // ── the operation table ──────────────────────────────────────────────
  // OPS WHOSE VERDICT IS NOT A MATTER OF OPINION. Each of these is constructed
  // so exactly one answer is honest — spend more gold than you hold, name an
  // item that is not in the catalogue, cancel a listing that is not yours — so
  // a different answer is a contract violation and fails the run outright. The
  // remaining ops (the ones expected to SUCCEED) stay advisory, because bank
  // caps, listing caps and rate limits can legitimately pre-empt them and a
  // harness whose rules model is merely incomplete must never manufacture a
  // failure.
  const CERTAIN = new Set([
    'overspend_gold', 'overspend_item', 'stale_version', 'unknown_key',
    'unknown_item', 'gold_clamp', 'intent_mismatch', 'list_overqty',
    'list_untradeable', 'cancel_foreign', 'buy_own', 'buy_poor', 'replay',
    'intent_in_flight', 'buy_over_max',
  ]);

  const OP_TABLE = [
    [10, 'accrue_grant'], [8, 'craft'], [8, 'vendor_sell'], [6, 'vendor_buy'],
    [7, 'equip'], [6, 'unequip'],
    [4, 'activity_set'], [4, 'progress'],
    [12, 'market_list'], [8, 'market_cancel'], [12, 'market_buy'], [4, 'market_expire'],
    [6, 'bank_deposit'], [5, 'bank_withdraw'],
    // rejections — every one of these must move NOTHING
    [4, 'overspend_gold'], [4, 'overspend_item'], [4, 'stale_version'],
    [3, 'unknown_key'], [3, 'unknown_item'], [3, 'gold_clamp'],
    [7, 'replay'], [3, 'intent_mismatch'], [3, 'intent_in_flight'],
    [3, 'list_overqty'], [3, 'list_untradeable'], [3, 'cancel_foreign'],
    [3, 'buy_own'], [3, 'buy_poor'], [3, 'buy_over_max'], [2, 'rate_storm'],
  ];

  /* ── PHASE 0 — THE EQUIPMENT TRANSFER, ON EVERY SEED ──────────────────
     hr_apply returns the worn unit to the bag in ONE place, and that place is
     guarded: `if v_cur is not null then delete … ; insert into
     player_inventory …` (the unequip branch). A slot that holds nothing takes
     the guard's false arm, moves no value, and is therefore blind to every
     defect in the transfer.

     The random walk reached the true arm only by luck. `unequip` picks
     `rng.pick(WEAR).equip_slot` with no regard for what the character is
     wearing, so most unequips were no-ops against an empty slot, and whether
     ANY unequip in a 400-op run landed on an occupied one was a property of
     the seed. Measured 2026-09-24: the `equip_dupe` plant — the equipment row
     surviving the unequip, the item worn AND held — SLIPPED on seed
     3855906536 and was caught on seven other seeds, ~1 run in 8. It is what
     reddened economy-selftests on `next` at 1a26e29a (GitHub run 35934075346,
     `16/17 caught`), and it was never an S2 regression: S2 touches neither
     hr_apply nor player_equipment, and the green on 186d4204 was a lucky seed.
     The selftest self-seeds, so every run was rolling that die.

     A plant that is caught on most seeds is not caught. The coverage a gate
     depends on cannot be left to the RNG, so the transfer runs here, in the
     open, before the walk: wear one unit, reconcile, take it off, reconcile.
     It is net-zero on the books — the same item returns to the same bag at the
     same count — so the random walk below starts from the position seeding
     left, and PHASE 1 keeps its own unequip op for the COLLISION cases (a slot
     that is empty, a slot re-worn, an item already listed) that a fixed leg
     cannot reach. The bias added to that op covers the same path a second way;
     this leg is what makes it a certainty rather than a likelihood. */
  {
    // Seeding has already spent this character's rate budget, and a leg that
    // exists to remove a flake must not become one: roll the window first, the
    // same clock simulation PHASE 1 does every 40 ops.
    await rollWindows();
    const w = WEAR[0];
    const c = books.char(keys[0]);
    const prior = c.equip.get(w.equip_slot) || null;

    const rEq = await applyAs(c, c.version, uuidOf(rng),
      { equip: { [w.equip_slot]: w.item_id }, journal: { kind: 'equip', intent: 'equip' } });
    if (rEq.ok !== true) {
      process.stderr.write(`HARNESS: PHASE 0 could not wear ${w.item_id} in ${w.equip_slot}: `
        + `${JSON.stringify(rEq)}\n  The leg exists to guarantee the transfer path runs; it cannot `
        + 'be skipped on a refusal, or the guarantee is back to being a coin flip.\n');
      process.exit(2);
    }
    c.version += 1;
    if (prior !== w.item_id) {
      books.invAdd(c, w.item_id, -1);
      if (prior) books.invAdd(c, prior, 1);
      c.equip.set(w.equip_slot, w.item_id);
    }
    const r0 = await reconcile(db, books, { i: -1, op: 'phase0-equip' });
    if (!r0.ok) { await db.close(); return { ok: false, seed, detail: r0.detail, opsRun: 0, counts, verdicts, divergences }; }

    // THE ASSERTION THIS LEG WAS ADDED FOR: the slot is OCCUPIED, so this
    // unequip takes hr_apply's `v_cur is not null` arm and the unit must come
    // back to the bag exactly once — out of player_equipment and into
    // player_inventory, never both.
    const rUn = await applyAs(c, c.version, uuidOf(rng),
      { equip: { [w.equip_slot]: null }, journal: { kind: 'equip', intent: 'unequip' } });
    if (rUn.ok !== true) {
      process.stderr.write(`HARNESS: PHASE 0 could not remove ${w.equip_slot}: ${JSON.stringify(rUn)}\n`);
      process.exit(2);
    }
    c.version += 1;
    books.invAdd(c, w.item_id, 1);
    c.equip.delete(w.equip_slot);
    const r1 = await reconcile(db, books, { i: -1, op: 'phase0-unequip' });
    if (!r1.ok) { await db.close(); return { ok: false, seed, detail: r1.detail, opsRun: 0, counts, verdicts, divergences }; }
    equip.leg = true;
  }

  /* ── PHASE 0b — A RUNNING HUNT'S PACKED BAG, COUNTED (market threat model #6, P5, P6) ──
     A hunt MOVES supplies from the hero's bag into hunt_bag (enter, restock); the market and
     Storage read only the bag, so packed supplies are unreachable. This leg packs a real hunt on a
     hero of its own account (not in `keys`, so the walk below never acts for it, and it stays
     hunting for the whole run: no tick runs here, so the bag never drains), then proves the
     reach both ways and lists from the hunting hero's bag (a hunt does not stall the market).
     Its opening is read once, like every other new character's starting gift above. */
  const hunt = { leg: false };
  {
    await rollWindows();
    const HU = '000000fd-0000-4000-a000-0000000000fd';   // not PHASE 3's (000000ff…) or PHASE 4's (000000fe…) account
    await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [HU]);
    await asUser(HU);
    const made = await rpc('select hr_create_character(0) r', []);
    if (made.ok !== true) { process.stderr.write(`HARNESS: PHASE 0b could not create its hunter: ${JSON.stringify(made)}\n`); process.exit(2); }
    const hk = `${HU}:0`;
    const h = books.newChar(HU, 0); books.chars.set(hk, h);
    const st = (await q(`select coalesce((select w.gold from account_wallet w where w.user_id = '${HU}'), 0)::text g, version::text v
                           from player_state where user_id = '${HU}' and slot = 0`))[0];
    books.openPurse(HU, Number(st.g)); h.version = Number(st.v);
    for (const r of await q(`select item_id, qty::text q from player_inventory where user_id = '${HU}' and slot = 0`)) {
      h.inv.set(r.item_id, Number(r.q)); books.addItem(books.openItems, r.item_id, Number(r.q));
    }
    for (const r of await q(`select equip_slot, item_id from player_equipment where user_id = '${HU}' and slot = 0`)) {
      h.equip.set(r.equip_slot, r.item_id); books.addItem(books.openItems, r.item_id, 1);
    }
    const SUP = (await q(`select s.item_id from hr_hunt_supplies s join hr_market_items m using (item_id)
                           where m.listable and s.kind = 'heal' order by s.item_id limit 1`))[0];
    if (!SUP) { process.stderr.write('HARNESS: PHASE 0b found no listable heal supply\n'); process.exit(2); }
    const sup = SUP.item_id;
    const PRICE_SUP = (await q(`select floor_each::text f from hr_market_items where item_id = '${sup}'`))[0].f;
    const seed0 = await applyAs(h, h.version, uuidOf(rng), { items: { [sup]: 20 }, journal: { kind: 'admin', intent: 'seed' } });
    if (seed0.ok !== true) { process.stderr.write(`HARNESS: PHASE 0b seeding refused ${JSON.stringify(seed0)}\n`); process.exit(2); }
    h.version += 1; books.invAdd(h, sup, 20); books.mint(sup, 20);
    const playerAs = async (sql, params) => {
      await asUser(HU); await db.exec('set role authenticated');
      const r = await rpc(sql, params); await db.exec('reset role'); return r;
    };
    const fail0b = async (detail) => { await db.close(); return { ok: false, seed, detail: `PHASE 0b ${detail}`, opsRun: 0, counts, verdicts, divergences }; };
    const enter = await playerAs("select hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, $2::uuid) r",
      [JSON.stringify([{ item: sup, qty: 8 }]), uuidOf(rng)]);
    if (enter.ok !== true) { process.stderr.write(`HARNESS: PHASE 0b could not enter a hunt: ${JSON.stringify(enter).slice(0, 300)}\n`); process.exit(2); }
    h.version += 1; books.invAdd(h, sup, -8);
    books.huntBag.set(hk, new Map([[sup, 8]]));
    let rc = await reconcile(db, books, { i: -1, op: 'phase0b-enter' });
    if (!rc.ok) return fail0b(rc.detail);
    const restock = await playerAs('select hr_hunt_restock(0, $1, 3, $2::uuid) r', [sup, uuidOf(rng)]);
    if (restock.ok !== true) return fail0b(`restock refused ${JSON.stringify(restock).slice(0, 200)}`);
    h.version += 1; books.invAdd(h, sup, -3); books.huntBag.get(hk).set(sup, 11);
    rc = await reconcile(db, books, { i: -1, op: 'phase0b-restock' });
    if (!rc.ok) return fail0b(rc.detail);
    /* P6: the bag holds 9; the 11 packed are out of reach of the market and of Storage. */
    const held = h.inv.get(sup) || 0;
    const over = await mList(h, sup, held + 1, Number(PRICE_SUP));
    if (over.error !== 'insufficient_item') return fail0b(`a list reached the packed supplies: ${JSON.stringify(over).slice(0, 200)}`);
    const dep = await bankAs(h, sup, held + 1, 'deposit');
    if (dep.error !== 'insufficient_item') return fail0b(`a Storage deposit reached the packed supplies: ${JSON.stringify(dep).slice(0, 200)}`);
    /* P5: the hunting hero lists from its bag (a hunt does not stall a bag verb). */
    const lst = await mList(h, sup, 1, Number(PRICE_SUP));
    if (lst.ok !== true) return fail0b(`a hunting hero could not list from its bag: ${JSON.stringify(lst).slice(0, 200)}`);
    const fee = feeOf(1, Number(PRICE_SUP));
    h.version += 1; books.invAdd(h, sup, -1); h.gold -= fee; books.fees += fee;
    books.listings.set(lst.listed.listing_id, { key: hk, uid: HU, item: sup, qty: 1, ask: Number(PRICE_SUP), fee, aged: false });
    rc = await reconcile(db, books, { i: -1, op: 'phase0b-list' });
    if (!rc.ok) return fail0b(rc.detail);
    hunt.leg = true;
  }

  for (let i = 0; i < ops; i++) {
    if (i % 40 === 0) await rollWindows();
    const op = rng.weighted(OP_TABLE);
    const key = rng.pick(keys);
    const c = books.char(key);
    let note = '';

    // ── want vs got — THE SECOND ASSERTION, and it is not decoration.
    //
    //    `want` is what the harness believes the server MUST answer, decided
    //    from the harness's own books before the call. `got` is what came
    //    back. A mismatch is reported as a DIVERGENCE: either the harness's
    //    model of the rules is wrong, or the server's is, and both are worth
    //    knowing. It is deliberately NOT fatal — the conservation assertion
    //    stands on the verdict actually returned, so an incomplete rules model
    //    can never turn into a false conservation failure.
    //
    //    It matters most on the rejection ops. "A rejected op must move
    //    nothing" is only tested if the op was actually rejected; without this
    //    check, a server that silently started ACCEPTING `unknown_delta_key`
    //    would make the fuzz book the mutation as legitimate and stay green.
    //    `want` is what notices.
    //
    //    Ops whose verdict genuinely cannot be predicted from the model
    //    (rate limiting can pre-empt anything; the expiry sweep returns a
    //    count, not a verdict) set `want = null` and opt out.
    let want = null;
    let got = null;

    switch (op) {
      // ── minting / burning paths ────────────────────────────────────────
      case 'accrue_grant': {
        const gold = rng.range(10, 5000);
        const id = rng.pick(ITEMS); const n = rng.range(1, 30);
        const intentId = uuidOf(rng);
        const delta = {
          gold, items: { [id]: n },
          xp: { woodcutting: rng.range(1, 500) },
          accrued_to: 'now',
          journal: { kind: 'accrue', intent: 'accrue' },
        };
        const r = await applyAs(c, c.version, intentId, delta);
        want = 'ok';
        if (r.ok === true) {
          c.gold += gold; c.version += 1; books.mintGold += gold;
          books.invAdd(c, id, n); books.mint(id, n);
          usedIntents.push({ id: intentId, delta, key, journalIntent: 'accrue' });
        }
        note = `+${gold}g +${n}×${id}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'craft': {
        const [a, b, out] = [rng.pick(ITEMS), rng.pick(ITEMS), rng.pick(ITEMS)];
        if (a === b || a === out || b === out) { i--; continue; }
        const na = rng.range(1, 5); const nb = rng.range(1, 5); const no = rng.range(1, 3);
        const enough = (c.inv.get(a) || 0) >= na && (c.inv.get(b) || 0) >= nb;
        const intentId = uuidOf(rng);
        const delta = { items: { [a]: -na, [b]: -nb, [out]: no }, xp: { crafting: 25 },
          journal: { kind: 'craft', intent: 'craft' } };
        const r = await applyAs(c, c.version, intentId, delta);
        want = enough ? 'ok' : 'insufficient_item';
        if (r.ok === true) {
          c.version += 1;
          books.invAdd(c, a, -na); books.burn(a, na);
          books.invAdd(c, b, -nb); books.burn(b, nb);
          books.invAdd(c, out, no); books.mint(out, no);
          usedIntents.push({ id: intentId, delta, key, journalIntent: 'craft' });
        }
        note = `-${na}${a} -${nb}${b} +${no}${out}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'vendor_sell': {
        // The named path: an item is DESTROYED and gold is CREATED.
        const id = rng.pick(ITEMS); const have = c.inv.get(id) || 0;
        const n = have > 0 ? rng.range(1, Math.min(have, 10)) : 1;
        const price = rng.range(1, 50) * n;
        const intentId = uuidOf(rng);
        const delta = { items: { [id]: -n }, gold: price, journal: { kind: 'shop', intent: 'vendor_sell' } };
        const r = await applyAs(c, c.version, intentId, delta);
        want = have >= n ? 'ok' : 'insufficient_item';
        if (r.ok === true) {
          c.version += 1; c.gold += price; books.mintGold += price;
          books.invAdd(c, id, -n); books.burn(id, n);
          usedIntents.push({ id: intentId, delta, key, journalIntent: 'vendor_sell' });
        }
        note = `sell ${n}×${id} for ${price}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'vendor_buy': {
        // …and its mirror: gold is DESTROYED and an item is CREATED.
        const id = rng.pick(ITEMS); const n = rng.range(1, 10);
        const price = Math.min(c.gold, rng.range(1, 60) * n);
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId,
          { items: { [id]: n }, gold: -price, journal: { kind: 'shop', intent: 'vendor_buy' } });
        want = 'ok';
        if (r.ok === true) {
          c.version += 1; c.gold -= price; books.burnGold += price;
          books.invAdd(c, id, n); books.mint(id, n);
        }
        note = `buy ${n}×${id} for ${price}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }

      // ── the pure-conservation paths (no mint, no burn) ──────────────────
      case 'equip': {
        const w = rng.pick(WEAR);
        const have = c.inv.get(w.item_id) || 0;
        const cur = c.equip.get(w.equip_slot) || null;
        const noop = cur === w.item_id;
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId,
          { equip: { [w.equip_slot]: w.item_id }, journal: { kind: 'equip', intent: 'equip' } });
        want = noop ? 'ok' : (have >= 1 ? 'ok' : 'insufficient_item');
        if (r.ok === true) {
          c.version += 1;
          if (!noop) {
            books.invAdd(c, w.item_id, -1);
            if (cur) books.invAdd(c, cur, 1);
            c.equip.set(w.equip_slot, w.item_id);
          }
        }
        note = `equip ${w.item_id} → ${w.equip_slot}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'unequip': {
        /* PREFER A SLOT THIS CHARACTER IS ACTUALLY WEARING. `rng.pick(WEAR)`
           alone drew from the catalogue, not from the character, so most
           unequips were no-ops against an empty slot and hr_apply's return-to-
           bag branch went unexercised for whole runs — the coverage hole PHASE 0
           above documents and measures. The empty-slot draw still has to
           happen (it is what asserts that removing nothing moves nothing), so
           it keeps a quarter of them. */
        const worn = [...c.equip.keys()];
        const slotName = (worn.length && rng() < 0.75)
          ? rng.pick(worn)
          : rng.pick(WEAR).equip_slot;
        const cur = c.equip.get(slotName) || null;
        equip.unequips += 1;
        if (cur) equip.worn += 1;
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId,
          { equip: { [slotName]: null }, journal: { kind: 'equip', intent: 'unequip' } });
        want = 'ok';
        if (r.ok === true) {
          c.version += 1;
          if (cur) { books.invAdd(c, cur, 1); c.equip.delete(slotName); }
        }
        note = `unequip ${slotName} (${cur || 'empty'})`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'activity_set': {
        const a = rng.pick(activities);
        const idle = rng() < 0.25;
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId, {
          activity: idle ? { kind: 'idle', id: null } : { kind: a.kind, id: a.activity_id, restart: true },
          journal: { kind: 'admin', intent: 'start_activity' },
        });
        want = 'ok';
        if (r.ok === true) c.version += 1;
        note = idle ? 'idle' : `${a.kind}:${a.activity_id}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'progress': {
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId, {
          progress: [{ kind: 'stat', key: 'kills', period: '', add: rng.range(1, 9), state: 'active' }],
          journal: { kind: 'quest', intent: 'progress' },
        });
        want = 'ok';
        if (r.ok === true) c.version += 1;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }

      // ── the escrow path (the ACCOUNT market, 2027-01-12-market-account.sql) ──
      case 'market_list': {
        /* From the hero's bag or the account's Storage; the account pays the fee; the listing is
           the account's. The verdict the model predicts follows the server's own order: the
           per-ACCOUNT caps, then the Storage room, then the escrow, then the fee. */
        const source = rng() < 0.7 ? 'bag' : 'storage';
        const id = rng.pick(ITEMS);
        const have = source === 'bag' ? (c.inv.get(id) || 0) : (books.storeOf(c.uid).get(id) || 0);
        const n = have > 0 ? rng.range(1, Math.min(have, 15)) : 1;
        const ask = askOf(id);
        const fee = feeOf(n, ask);
        const room = books.roomKinds(c.uid);
        const r = await mList(c, id, n, ask, undefined, source);
        want = openOf(c.uid) >= MAX_LISTINGS ? 'too_many_listings'
          : (listedToday[c.uid] || 0) >= 200 ? 'list_daily_cap'
          : (!room.has(id) && room.size >= ROOM_CAP) ? 'storage_no_room'
          : have < n ? 'insufficient_item'
          : c.gold < fee ? 'insufficient_gold' : 'ok';
        if (r.ok === true) {
          c.version += 1;
          if (source === 'bag') books.invAdd(c, id, -n); else books.stoAdd(c.uid, id, -n);
          c.gold -= fee; books.fees += fee;
          listedToday[c.uid] = (listedToday[c.uid] || 0) + 1;
          /* THE LISTING ID COMES OUT OF THE SERVER'S RECEIPT (the envelope's `listed`). */
          books.listings.set(r.listed.listing_id, { key, uid: c.uid, item: id, qty: n, ask, fee, aged: false });
        }
        note = `list ${n}×${id} @${ask} from ${source} fee ${fee}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_cancel': {
        /* ANY hero of the account cancels; the units go to the account's Storage, the fee is kept. */
        const mine = [...books.listings.entries()].filter(([, l]) => l.uid === c.uid);
        if (!mine.length) { i--; continue; }
        const [lid, l] = rng.pick(mine);
        const r = await mCancel(c, lid);
        want = 'ok';
        if (r.ok === true) {
          c.version += 1;
          books.stoAdd(c.uid, l.item, l.qty);
          books.listings.delete(lid);
        }
        note = `cancel ${l.qty}×${l.item} (listed by ${l.key === key ? 'this' : 'another'} hero) → Storage`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_buy': {
        /* Another ACCOUNT's listing; delivered to the buyer's Storage or this hero's bag; the
           seller's ACCOUNT is paid (its heroes are not touched, so no seller version moves). */
        const others = [...books.listings.entries()].filter(([, l]) => l.uid !== c.uid);
        if (!others.length) { i--; continue; }
        const [lid, l] = rng.pick(others);
        const n = rng() < 0.4 ? l.qty : rng.range(1, l.qty);
        const deliver = rng() < 0.7 ? 'storage' : 'bag';
        const gross = n * l.ask;
        const tax = houseTax(gross);
        const net = gross - tax;
        const room = books.roomKinds(c.uid);
        const r = await mBuy(c, lid, n, l.ask, deliver);
        want = (deliver === 'storage' && !room.has(l.item) && room.size >= ROOM_CAP) ? 'storage_full'
          : c.gold >= gross ? 'ok' : 'insufficient_gold';
        if (r.ok === true) {
          c.gold -= gross; c.version += 1;
          books.purses.set(l.uid, (books.purses.get(l.uid) || 0) + net);
          books.tax += tax;
          if (deliver === 'storage') books.stoAdd(c.uid, l.item, n); else books.invAdd(c, l.item, n);
          if (n === l.qty) books.listings.delete(lid); else l.qty -= n;
        }
        note = `buy ${n}×${l.item} → ${deliver} gross ${gross} tax ${tax} net ${net}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_expire': {
        // Age a listing (a CLOCK move — expires_at only moves earlier, the trigger allows that and
        // nothing that holds value moves), then run the real expiry sweep as cron does (the owner).
        const all = [...books.listings.entries()];
        if (!all.length) { i--; continue; }
        const [lid, l] = rng.pick(all);
        await db.query("update market_listings set expires_at = now() - interval '1 minute' where id = $1", [lid]);
        l.aged = true;
        const aged = [...books.listings.entries()].filter(([, x]) => x.aged);
        const n = await mExpire(200);
        if (Number(n) !== aged.length) {
          divergences.push(`op#${i} market_expire returned ${n}, harness aged ${aged.length}`);
        }
        /* Returns go to the ACCOUNT's Storage and bump no hero (the sweep holds no hero lock). */
        for (const [id, x] of aged) {
          books.stoAdd(x.uid, x.item, x.qty);
          books.listings.delete(id);
        }
        want = null;
        note = `expire ${aged.length} → Storage`;
        got = 'expire';
        break;
      }

      // ── Storage: the account depot (2026-11-27), room counting listed kinds (2027-01-12) ──
      case 'bank_deposit': {
        const id = rng.pick(ITEMS); const have = c.inv.get(id) || 0;
        const n = have > 0 ? rng.range(1, Math.min(have, 20)) : 1;
        const room = books.roomKinds(c.uid);
        const r = await bankAs(c, id, n, 'deposit');
        want = have < n ? 'insufficient_item' : (!room.has(id) && room.size >= ROOM_CAP) ? 'bank_full' : 'ok';
        if (r.ok === true) { c.version += 1; books.invAdd(c, id, -n); books.stoAdd(c.uid, id, n); }
        note = `deposit ${n}×${id}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'bank_withdraw': {
        const st = [...books.storeOf(c.uid).entries()];
        if (!st.length) { i--; continue; }
        const [id, have] = rng.pick(st);
        const n = rng.range(1, have);
        const r = await bankAs(c, id, n, 'withdraw');
        want = 'ok';
        if (r.ok === true) { c.version += 1; books.stoAdd(c.uid, id, -n); books.invAdd(c, id, n); }
        note = `withdraw ${n}×${id}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }

      // ── rejections: every one must move NOTHING ─────────────────────────
      case 'overspend_gold': {
        const r = await applyAs(c, c.version, uuidOf(rng),
          { gold: -(c.gold + rng.range(1, 1000)), journal: { kind: 'shop', intent: 'overspend' } });
        want = 'insufficient_gold';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'overspend_item': {
        const id = rng.pick(ITEMS);
        const r = await applyAs(c, c.version, uuidOf(rng),
          { items: { [id]: -((c.inv.get(id) || 0) + rng.range(1, 50)) },
            journal: { kind: 'craft', intent: 'overspend' } });
        want = 'insufficient_item';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'stale_version': {
        const r = await applyAs(c, c.version - 1, uuidOf(rng),
          { gold: 5000, journal: { kind: 'accrue', intent: 'accrue' } });
        want = 'version_conflict';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'unknown_key': {
        const r = await applyAs(c, c.version, uuidOf(rng),
          { gold: 999, hearth_tokens: 5, journal: { kind: 'iap', intent: 'evil' } });
        want = 'unknown_delta_key';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'unknown_item': {
        const r = await applyAs(c, c.version, uuidOf(rng),
          { items: { __not_a_real_item__: 500 }, journal: { kind: 'gather', intent: 'collect' } });
        want = 'unknown_item';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'gold_clamp': {
        const r = await applyAs(c, c.version, uuidOf(rng),
          { gold: 50000001, journal: { kind: 'accrue', intent: 'accrue' } });
        want = 'gold_clamp';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'replay': {
        // The exact contract: same key, same answer, effect applied ONCE.
        const mine = usedIntents.filter((u) => u.key === key);
        if (!mine.length) { i--; continue; }
        const u = rng.pick(mine);
        const r = await applyAs(c, c.version, u.id, u.delta);
        want = 'replayed';
        /* ⚠ `rate_limited` PRE-EMPTS EVERY RPC IN THE SYSTEM and is a legitimate
           answer to anything — the generic want/got check below already says so
           and this branch has to say it too. It became reachable when
           `rate_storm` started genuinely exhausting the shared `apply` budget
           (v2's market verbs spend hr_apply's namespace on purpose), and a
           divergence that fires because ANOTHER op did its job is noise that
           trains a reader to skim the divergence list. */
        if (r.replayed !== true && r.error !== 'rate_limited') {
          divergences.push(`op#${i} replay of ${u.id.slice(0, 8)} was not marked replayed: ${JSON.stringify(r).slice(0, 160)}`);
        }
        got = r.replayed === true ? 'replayed' : (r.ok === true ? 'ok' : String(r.error));
        break;
      }
      case 'intent_in_flight': {
        // THE CLOSEST THING TO A CONCURRENCY PROBE THIS HARNESS CAN RUN.
        // PGlite is a single backend, so two genuinely simultaneous
        // transactions are not constructible (stated in the change contract).
        // What IS constructible is the state a concurrent caller leaves
        // behind: a CLAIMED but UNDECIDED intent — the row exists with a null
        // result — which is the window in which a retry arrives while the
        // first attempt is still running. The contract is that the retry is
        // refused and moves nothing; historically this branch returned another
        // caller's decision.
        const ghost = uuidOf(rng);
        await db.query(
          'insert into player_intents (user_id, intent_id, slot, intent) values ($1,$2,$3,$4)',
          [c.uid, ghost, c.slot, 'accrue']);
        const r = await applyAs(c, c.version, ghost,
          { gold: 12345, items: { [rng.pick(ITEMS)]: 7 }, journal: { kind: 'accrue', intent: 'accrue' } });
        want = 'intent_in_flight';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'intent_mismatch': {
        const mine = usedIntents.filter((u) => u.key === key);
        if (!mine.length) { i--; continue; }
        const u = rng.pick(mine);
        const r = await applyAs(c, c.version, u.id,
          { gold: 100000, journal: { kind: 'admin', intent: 'not_the_same_intent' } });
        want = 'intent_mismatch';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'list_overqty': {
        /* More than the account's Storage holds (the Storage source carries no settle-first and no
           version, so the only honest answers are the caps' and insufficient_item). */
        const id = rng.pick(ITEMS);
        const have = books.storeOf(c.uid).get(id) || 0;
        const room = books.roomKinds(c.uid);
        const r = await mList(c, id, have + rng.range(1, 100), PRICE.get(id).floor, undefined, 'storage');
        want = openOf(c.uid) >= MAX_LISTINGS ? 'too_many_listings'
          : (listedToday[c.uid] || 0) >= 200 ? 'list_daily_cap'
          : (!room.has(id) && room.size >= ROOM_CAP) ? 'storage_no_room' : 'insufficient_item';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'list_untradeable': {
        const r = await mList(c, rng.pick(untradeable), 1, 100);
        want = 'not_tradeable';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'cancel_foreign': {
        const others = [...books.listings.entries()].filter(([, l]) => l.uid !== c.uid);
        if (!others.length) { i--; continue; }
        const r = await mCancel(c, rng.pick(others)[0]);
        want = 'not_yours';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'buy_own': {
        /* THE SAME ACCOUNT, ANY HERO (2027-01-12, threat model #5): Storage moves goods between
           one's own heroes for free, so a buy from one's own account is only a fake price and is
           refused whichever hero listed it. (Under v2 only the same (uid, slot) was refused.) */
        const mine = [...books.listings.entries()].filter(([, l]) => l.uid === c.uid);
        if (!mine.length) { i--; continue; }
        const [lid, l] = rng.pick(mine);
        const r = await mBuy(c, lid, 1, l.ask, 'storage');
        want = 'own_listing';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'buy_over_max': {
        /* The buyer's confirmed price is below the ask: price_above_max, and nothing moves. */
        const others = [...books.listings.entries()].filter(([, l]) => l.uid !== c.uid && l.ask >= 2);
        if (!others.length) { i--; continue; }
        const [lid, l] = rng.pick(others);
        const r = await mBuy(c, lid, 1, l.ask - 1, 'storage');
        want = 'price_above_max';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'buy_poor': {
        /* A buyer that demonstrably cannot afford a whole listing: its purse is burned (through
           hr_apply, journalled) to one gold short of the gross, the buy must answer
           insufficient_gold and move nothing, and the burned gold is minted back afterwards so the
           rest of the walk keeps a solvent account. */
        const others = [...books.listings.entries()].filter(([, l]) => l.uid !== c.uid);
        if (!others.length) { i--; continue; }
        const [lid, l] = rng.pick(others);
        const gross = l.qty * l.ask;
        const room = books.roomKinds(c.uid);
        if (!room.has(l.item) && room.size >= ROOM_CAP) { i--; continue; }
        const burn = Math.max(0, c.gold - (gross - 1));
        if (burn > 0) {
          const br = await applyAs(c, c.version, uuidOf(rng), { gold: -burn, journal: { kind: 'shop', intent: 'buy_poor_burn' } });
          if (br.ok !== true) { i--; continue; }
          c.version += 1; c.gold -= burn; books.burnGold += burn;
        }
        const r = await mBuy(c, lid, l.qty, l.ask, 'storage');
        want = 'insufficient_gold';
        if (r.ok === true) {
          // Should be unreachable; model it anyway so the run continues honestly.
          const tax = houseTax(gross);
          c.gold -= gross; c.version += 1;
          books.purses.set(l.uid, (books.purses.get(l.uid) || 0) + gross - tax);
          books.tax += tax; books.stoAdd(c.uid, l.item, l.qty); books.listings.delete(lid);
        }
        if (burn > 0) {
          const mr = await applyAs(c, c.version, uuidOf(rng), { gold: burn, journal: { kind: 'admin', intent: 'buy_poor_restore' } });
          if (mr.ok === true) { c.version += 1; c.gold += burn; books.mintGold += burn; }
        }
        note = `gross ${gross} against a purse of ${c.gold - (burn > 0 ? burn : 0)}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'rate_storm': {
        /* Blow the market path's rate budget and assert the rejections are free
           of side effects. The window is NOT rolled forward first, so the storm
           lands inside whatever budget the run has already spent.

           ⚠ TWO THINGS CHANGED WITH v2 AND BOTH WOULD HAVE MADE THIS A PROBE
             THAT PROVES NOTHING.

             (1) THE BUDGET IS `apply`, AT 240/min, NOT market_list's OWN 60. v2
                 deliberately spends hr_apply's namespace rather than opening a
                 second one, because a second writer with its own allowance
                 RAISES a compromised engine's total reachable write rate. So 70
                 calls no longer trip anything; the storm has to clear 240, and
                 it shares that ceiling with every hr_apply the run has already
                 issued (which only helps).

             (2) AN UNTRADEABLE ITEM NEVER REACHES THE RATE CHECK. v2 answers
                 shape and catalogue refusals BEFORE the gate — deliberately, so
                 a client looping on garbage cannot contend on a real player's
                 state row — so the old storm was 70 free `not_tradeable`s and
                 the divergence it printed was the truth. The storm therefore
                 names a REAL, TRADEABLE item at a quantity the seller provably
                 does not have: past the catalogue, through the gate, into the
                 protected block, refused as `insufficient_item`, and every one
                 of them moves nothing. */
        let limited = 0; let reached = 0;
        const stormItem = ITEMS[0];
        /* ⚠ OVER WHAT THEY HOLD, BUT UNDER `max_qty` (1e6) AND UNDER the
           per-trade gross ceiling. A quantity above the config bound is refused
           as `bad_qty` in the SHAPE block — before the gate, exactly like the
           untradeable item was — and the storm would once again be 260 free
           refusals reporting a limit it never reached. Measured: the first
           revision of this fix used `+ 1000000` and scored 0/260 on both
           counters, which is the always-null probe in its purest form. */
        /* 2027-01-12: from STORAGE at the item's own floor (a price outside [floor, ceiling] is refused
           before the gate, and the bag source would answer settle_first to a hero at town work), and
           the bucket is the market's own, 60/min per ACCOUNT, no longer hr_apply's. */
        const overQty = (books.storeOf(c.uid).get(stormItem) || 0) + 1000;
        for (let k = 0; k < 260; k++) {
          const r = await mList(c, stormItem, overQty, PRICE.get(stormItem).floor, undefined, 'storage');
          if (r.error === 'rate_limited') limited++;
          /* Both of these are decided INSIDE the protected block, i.e. past the
             gate, and both move nothing. */
          else if (r.error === 'insufficient_item' || r.error === 'too_many_listings' || r.error === 'storage_no_room' || r.error === 'list_daily_cap') reached++;
        }
        if (!limited) {
          divergences.push(`op#${i} rate_storm never tripped the market rate limit `
            + `(${reached} calls reached the protected block)`);
        }
        note = `${limited}/260 rate-limited, ${reached} reached the block`;
        want = null;
        got = 'rate_storm';
        break;
      }
      default: throw new Error(`unhandled op ${op}`);
    }

    bump(counts, op);
    bump(verdicts, got || 'none');
    // `rate_limited` pre-empts every RPC in the system and is a legitimate
    // answer to anything, so it never counts as a divergence.
    if (want && got && got !== want && got !== 'rate_limited') {
      const msg = `op#${i} ${op}: wanted "${want}", got "${got}" ${note}`;
      if (CERTAIN.has(op)) {
        // On the constructed-rejection ops the answer is not a matter of
        // opinion — the op was built so that exactly one verdict is honest.
        // A different verdict is a contract violation and fails the run.
        await db.close();
        return { ok: false, seed, detail: `VERDICT ${msg}`, opsRun: i + 1, counts, verdicts, divergences };
      }
      divergences.push(msg);
    }
    const rec = await reconcile(db, books, { i, op, note });
    if (!rec.ok) {
      await db.close();
      return { ok: false, seed, detail: rec.detail, opsRun: i + 1, counts, verdicts, divergences };
    }
    if (VERBOSE) process.stderr.write(`  #${String(i).padStart(4)} ${op.padEnd(18)} ${note}\n`);
  }

  // ── PHASE 2 — the real accrual engine, and the b328 degrade ladder ────
  const accrual = await accrualPhase(db, books, keys, rng, applyAs, q, divergences);

  // ── PHASE 3 — the ledger-derived daily budget (C5/X3) ─────────────────
  // Runs LAST because it deliberately saturates a character's gold ceiling,
  // which is a state nothing after it should have to reason about.
  const budget = await budgetPhase(db, books, keys, rng, applyAs, rpc, asUser, q, ITEMS,
    stackables, houseTax, { list: mList, buy: mBuy, feeOf, floorOf: (id) => PRICE.get(id).floor });

  // ── PHASE 4 — the house from Storage (its own account, its own RNG) ───
  const house = await housePhase(db, books, seed, q, rpc, asUser, applyAs);

  const final = await reconcile(db, books, { i: ops, op: 'final' });
  await db.close();
  if (!final.ok) return { ok: false, seed, detail: final.detail, opsRun: ops, counts, verdicts, divergences };
  return { ok: true, seed, opsRun: ops, counts, verdicts, divergences, accrual, budget, equip, hunt, house };
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 4 — THE HOUSE FROM STORAGE (2027-01-10-house-from-storage.sql).
//
// A house build (the deed, a room rung, a storage chest) takes each material
// from the building hero's bag first and the rest from the ACCOUNT's Storage,
// in one transaction, all or nothing, the purse last. With Storage in the
// identity, a build that takes from the wrong place, takes twice, or leaves a
// debit standing beside a refusal is a CONSERVATION diff; this phase makes the
// path run on every seed (a fixed sequence of legs, PHASE 0's rule: a plant that
// is caught on most seeds is not caught), with seed-chosen bag / Storage splits,
// and holds every build's ONE journal row to the split the model expects
// (meta.from). Bag + Storage + the house balance across every build: the
// materials leave as BURNS of exactly the catalogue's cost, nothing else moves.
//
// Its own account and its own RNG (derived from the seed), so the walk and every
// phase before it replay exactly as they did before this phase existed. Every
// verdict here is constructed (one answer is honest), so a different one fails
// the run outright, like PHASE 3.
// ════════════════════════════════════════════════════════════════════════
async function housePhase(db, books, seed, q, rpc, asUser, applyAs) {
  const fail = (msg, extra) => {
    throw Object.assign(new Error('house-from-storage violation'),
      { detail: `HOUSE FROM STORAGE: ${msg}${extra ? `\n    ${extra}` : ''}` });
  };
  const rng = rngOf((seed ^ 0x40053a1d) >>> 0);
  const stats = { ran: true, builds: 0, refusals: 0, moves: 0, fromBag: 0, fromStorage: 0 };
  const one = async (sql, p) => (await q(sql, p))[0];
  const costOf = (items) => Object.entries(items || {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => v > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // THE CATALOGUE ROWS, by property: the first home, a first room rung it opens, the first two chests.
  const H = await one("select o.* from hr_unlock_offers o join hr_unlocks u on u.unlock_id = o.unlock_id where u.namespace = 'property' and o.refusal is null order by o.value limit 1");
  if (!H) fail('the catalogue has no first home');
  const R = await one(`select o.* from hr_unlock_offers o join hr_unlocks u on u.unlock_id = o.unlock_id
     where u.namespace = 'room' and o.refusal is null and o.value = 1 and coalesce(o.req_property_tier, 0) <= $1
       and o.req_item is null and o.req_skill is null order by o.offer_id limit 1`, [H.value]);
  const [C1, C2] = await q('select * from hr_storage_chests order by ord limit 2');
  if (!R || !C1 || !C2 || Number(C1.req_property_tier) > 0 || Number(C2.req_property_tier) > Number(H.value)) {
    fail('the catalogue has no room rung, or no first two chests the first home opens');
  }

  // ── an account of its own, two heroes ──
  const uid = '000000fe-0000-4000-a000-0000000000fe';
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'HouseProbe']);
  await asUser(uid);
  const hero = [];
  for (const slot of [0, 1]) {
    /* A slot above 0 must be owned (the main setup's rule): the flag row hr_buy_hero_slot writes, on slot 0. */
    if (slot > 0) {
      await q(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
               values ($1, 0, 'flag', $2, 1, '', null, now()) on conflict (user_id, slot, kind, key, period_key) do nothing`, [uid, `character_slot:${slot}`]);
    }
    const r = await rpc('select hr_create_character($1) r', [slot]);
    if (r.ok !== true) fail(`could not create hero ${slot}`, JSON.stringify(r));
  }
  /* THE OPENING, MEASURED once both heroes exist: each start kit pays its gold into the ONE purse. */
  for (const slot of [0, 1]) {
    const key = `${uid}:${slot}`;
    const c = books.newChar(uid, slot);
    books.chars.set(key, c);
    const st = (await q(`select coalesce((select w.gold from account_wallet w where w.user_id = '${uid}'), 0)::text g, version::text v
                          from player_state where user_id = '${uid}' and slot = ${slot}`))[0];
    books.openPurse(uid, Number(st.g)); c.version = Number(st.v);
    for (const row of await q(`select item_id, qty::text q from player_inventory where user_id = '${uid}' and slot = ${slot}`)) {
      c.inv.set(row.item_id, Number(row.q)); books.addItem(books.openItems, row.item_id, Number(row.q));
    }
    for (const row of await q(`select equip_slot, item_id from player_equipment where user_id = '${uid}' and slot = ${slot}`)) {
      c.equip.set(row.equip_slot, row.item_id); books.addItem(books.openItems, row.item_id, 1);
    }
    hero.push(c);
  }
  books.openStorage(uid, await q(`select item_id, qty::text q from account_bank where user_id = '${uid}'`));
  const rec = async (label) => {
    const r = await reconcile(db, books, { i: `house/${label}`, op: 'house' });
    if (!r.ok) throw Object.assign(new Error('house conservation violation'), { detail: r.detail });
  };
  await rec('opening');
  const roll = () => db.query("update hr_rate_counters set window_start = now() - interval '2 hours'");

  // ── the verbs, each booked from its own parameters and its verdict ──
  const mint = async (c, gold, items) => {
    await roll();
    const r = await applyAs(c, c.version, uuidOf(rng), { gold, items, journal: { kind: 'admin', intent: 'seed' } });
    if (r.ok !== true) fail(`seeding hero ${c.slot} was refused`, JSON.stringify(r).slice(0, 300));
    c.version += 1; c.gold += gold; books.mintGold += gold;
    for (const [id, n] of Object.entries(items)) { books.invAdd(c, id, n); books.mint(id, n); }
  };
  const move = async (c, id, n, dir) => {
    await roll(); await asUser(uid);
    const r = await rpc('select hr_bank_move($1,$2,$3,$4,$5) r', [c.slot, id, n, dir, uuidOf(rng)]);
    if (r.ok !== true) fail(`a ${dir} of ${n}×${id} from hero ${c.slot} was refused`, JSON.stringify(r).slice(0, 300));
    const sign = dir === 'deposit' ? 1 : -1;
    books.invAdd(c, id, -sign * n); books.stoAdd(uid, id, sign * n); c.version += 1; stats.moves += 1;
  };
  const stoOf = (id) => (books.storage.get(uid) || new Map()).get(id) || 0;
  /* What the server must take for this cost, from the MODEL: the bag first, the rest from Storage. */
  const plan = (c, cost) => cost.map(([id, need]) => {
    const fromBag = Math.min(c.inv.get(id) || 0, need);
    return { id, need, fromBag, fromSto: need - fromBag, short: fromBag + stoOf(id) < need };
  });
  const book = (c, p, gold) => {
    for (const l of p) {
      books.invAdd(c, l.id, -l.fromBag); books.stoAdd(uid, l.id, -l.fromSto); books.burn(l.id, l.need);
      stats.fromBag += l.fromBag; stats.fromStorage += l.fromSto;
    }
    c.gold -= gold; books.burnGold += gold; c.version += 1; stats.builds += 1;
  };
  const journalSays = async (intent, p) => {
    const rows = await q('select meta from player_ledger where user_id = $1 and intent = $2', [uid, intent]);
    const want = { bag: {}, storage: {} };
    for (const l of p) { if (l.fromBag) want.bag[l.id] = l.fromBag; if (l.fromSto) want.storage[l.id] = l.fromSto; }
    const norm = (o) => JSON.stringify(Object.entries(o || {}).map(([k, v]) => [k, Number(v)]).sort());
    const got = rows.length === 1 && rows[0].meta && rows[0].meta.from;
    if (!got || norm(got.bag) !== norm(want.bag) || norm(got.storage) !== norm(want.storage)) {
      fail(`the journal of ${intent} does not say where its units came from`, `want ${JSON.stringify(want)}, rows ${JSON.stringify(rows.map((r) => r.meta && r.meta.from))}`);
    }
  };
  const buy = async (c, offer) => {
    await roll(); await asUser(uid);
    await db.exec('set role hr_engine');
    try { return (await db.query('select hr_unlock_buy($1,$2,$3,$4,$5) r', [uid, c.slot, c.version, uuidOf(rng), offer])).rows[0].r; }
    catch (e) { return { ok: false, error: '__exception', message: e.message }; }
    finally { await db.exec('reset role'); }
  };
  const chest = async (c, ch, key) => {
    await roll(); await asUser(uid);
    return rpc('select hr_storage_chest_build($1,$2,$3,$4) r', [c.slot, ch.chest_id, Number(ch.gold), key]);
  };
  const expect = (what, got, want) => {
    const verdict = got && got.ok === true ? 'ok' : String(got && got.error);
    if (verdict !== want) fail(`${what}: wanted "${want}", got "${verdict}"`, JSON.stringify(got).slice(0, 300));
  };
  /* Put a seed-chosen part of a hero's units into Storage (the bag keeps the rest). */
  const stash = async (c, cost, { allOf } = {}) => {
    for (const [id] of cost) {
      const held = c.inv.get(id) || 0;
      const n = id === allOf ? held : rng.range(0, held);
      if (n > 0) await move(c, id, n, 'deposit');
    }
  };

  const [h0, h1] = hero;
  const hCost = costOf(H.items), rCost = costOf(R.items), c1Cost = costOf(C1.items), c2Cost = costOf(C2.items);
  // The purse covers the deed, the room and the first chest, never the second one.
  const spare = 50;
  await mint(h0, Number(H.gold) + Number(R.gold) + Number(C1.gold) + spare, Object.fromEntries(hCost.map(([id, n]) => [id, n + rng.range(0, 6)])));
  const left = h0.gold - Number(H.gold) - Number(R.gold) - Number(C1.gold);
  if (left >= Number(C2.gold)) fail('the purse would pay for the second chest, so its short-purse leg proves nothing', `purse after three builds ${left}, chest ${C2.gold}`);

  // LEG 1 — THE DEED FROM BAG + STORAGE: its first line all in Storage (the bag holds none), the rest seed-split.
  await stash(h0, hCost, { allOf: hCost[0][0] });
  await rec('leg1-stash');
  let p = plan(h0, hCost);
  if (p.some((l) => l.short)) fail('leg 1 was built short; the model and the seed disagree', JSON.stringify(p));
  if (p[0].fromBag !== 0) fail('leg 1 must take its first line from Storage alone', JSON.stringify(p[0]));
  expect(`the deed ${H.offer_id}`, await buy(h0, H.offer_id), 'ok');
  book(h0, p, Number(H.gold));
  await rec('leg1-deed');
  await journalSays(`unlock_buy:${H.offer_id}:${H.value}`, p);

  // LEG 2 — A ROOM ONE UNIT SHORT ACROSS BAG + STORAGE: refused, and nothing moves.
  const last = rCost[rCost.length - 1][0];
  /* Exactly one unit short of the last line across h1's bag + Storage (whatever the start kit holds). */
  const lastHeld = (h1.inv.get(last) || 0) + stoOf(last), lastNeed = rCost[rCost.length - 1][1];
  if (lastHeld > lastNeed - 1) fail(`leg 2 cannot be built short: hero 1 already holds ${lastHeld} ${last}`);
  await mint(h1, 0, Object.fromEntries(rCost.map(([id, n]) => [id, id === last ? lastNeed - 1 - lastHeld : n + rng.range(0, 4)]).filter(([, n]) => n > 0)));
  await stash(h1, rCost);
  p = plan(h1, rCost);
  if (!p.find((l) => l.id === last).short) fail('leg 2 must be one unit short', JSON.stringify(p));
  expect(`the room ${R.offer_id} one ${last} short`, await buy(h1, R.offer_id), 'insufficient_item');
  stats.refusals += 1;
  await rec('leg2-short');

  // LEG 3 — THE SAME ROOM, THE LAST UNIT DEPOSITED BY THE OTHER HERO: Storage a sibling filled pays.
  await mint(h0, 0, { [last]: 1 });
  await move(h0, last, 1, 'deposit');
  p = plan(h1, rCost);
  if (p.some((l) => l.short)) fail('leg 3 is still short', JSON.stringify(p));
  expect(`the room ${R.offer_id}`, await buy(h1, R.offer_id), 'ok');
  book(h1, p, Number(R.gold));
  await rec('leg3-room');
  await journalSays(`unlock_buy:${R.offer_id}:${R.value}`, p);

  // LEG 4 — THE FIRST CHEST FROM BAG + STORAGE, and its key replayed (nothing moves the second time).
  await mint(h1, 0, Object.fromEntries(c1Cost.map(([id, n]) => [id, n + rng.range(0, 5)])));
  await stash(h1, c1Cost);
  p = plan(h1, c1Cost);
  const key4 = uuidOf(rng);
  expect(`the chest ${C1.chest_id}`, await chest(h1, C1, key4), 'ok');
  book(h1, p, Number(C1.gold));
  await rec('leg4-chest');
  await journalSays(`storage_chest:${C1.chest_id}`, p);
  expect(`the chest ${C1.chest_id} replayed`, await chest(h1, C1, key4), 'ok');
  await rec('leg4-replay');

  // LEG 5 — THE SECOND CHEST, ITS MATERIALS COVERED AND THE PURSE SHORT: refused, the materials stay put;
  //         then one line comes back out of Storage (a withdrawal) and the books still balance.
  await mint(h0, 0, Object.fromEntries(c2Cost.map(([id, n]) => [id, n + rng.range(0, 3)])));
  await stash(h0, c2Cost);
  p = plan(h0, c2Cost);
  if (p.some((l) => l.short)) fail('leg 5 must be short of gold only', JSON.stringify(p));
  expect(`the chest ${C2.chest_id} with a short purse`, await chest(h0, C2, uuidOf(rng)), 'insufficient_gold');
  stats.refusals += 1;
  await rec('leg5-short-purse');
  const back = c2Cost.find(([id]) => stoOf(id) > 0);
  if (back) { await move(h0, back[0], stoOf(back[0]), 'withdraw'); await rec('leg5-withdraw'); }
  return stats;
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 3 — THE LEDGER-DERIVED DAILY BUDGET (C5 / X3).
//
// The budget is not a conservation property, so reconcile() cannot see it: a
// budget that never fires and a budget that fires on everything both conserve
// value perfectly. It needs its own assertions, and they have to be the ones
// that discriminate between "derived by summing an append-only ledger" and the
// four cheaper things it could accidentally be:
//
//   a stored counter        → a spend would give budget back
//   a signed sum            → same, via the `gold` column instead of the stamp
//   an all-time sum         → yesterday would still be charged, forever
//   a kind-scoped sum       → journal.kind is caller-chosen, so it is a door
//   a whole-ledger sum      → a market sale would eat a trader's progression
//
// Every assertion below is a HARD failure (thrown, with .detail) rather than a
// divergence, because divergences do not fail a run and an injection catalogue
// entry that produces only a divergence is decoration.
//
// The one thing this phase does NOT prove is the RACE. PGlite is a single
// backend, so the advisory lock + `for update` + VOLATILE-snapshot chain that
// makes two simultaneous collects impossible is EXERCISED here and never
// CONTENDED. See the header's "WHAT THIS DOES NOT TEST".
// ════════════════════════════════════════════════════════════════════════
async function budgetPhase(db, books, keys, rng, applyAs, rpc, asUser, q, ITEMS, POOL, houseTax, market) {
  const fail = (msg, extra) => {
    throw Object.assign(new Error('daily-budget violation'),
      { detail: `DAILY BUDGET: ${msg}${extra ? `\n    ${extra}` : ''}` });
  };

  const LIM = (await q('select hr_day_budget_limits() r'))[0].r;
  for (const d of ['gold', 'xp', 'qty']) {
    if (!(Number(LIM[d]) > 0)) fail(`hr_day_budget_limits() has no positive ${d} limit`, JSON.stringify(LIM));
  }

  /* THE PER-CALL CLAMPS, READ OUT OF THE BODY THAT ENFORCES THEM.
     Legs 5 and 6 have to compose calls that are legal PER CALL and illegal PER
     DAY, which is only constructible if they know both numbers — and a copy of
     a number in a test is a drift generator. 2026-08-11-daily-budget.sql §3 says
     exactly this about its own ceilings ("a second copy of a number is a drift
     generator, which is the failure this whole program is organised around"),
     and leg 6 is the proof: it carried a copy of the SHAPE of the b355 numbers
     and went stale the moment b356 moved one of them.
     pg_get_functiondef returns the plpgsql source of the hr_apply THIS CHAIN
     ACTUALLY BUILT — the last of the ten files that create-or-replace it — so a
     retune of either constant moves these legs with it, in the same run. */
  const applyDefs = await q(
    "select p.proname::text nm, pg_get_functiondef(p.oid) def "
    + "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'hr\\_apply%'");
  const clampOf = (name, re) => {
    const seen = new Map();
    for (const d of applyDefs) {
      const m = re.exec(d.def);
      if (m) seen.set(m[1], (seen.get(m[1]) || []).concat(d.nm));
    }
    if (seen.size === 0) {
      fail(`no hr_apply* body declares ${name} — the per-call clamp cannot be read, so legs 5 and 6 `
        + 'cannot know what a legal call is. Do not guess it: find where the constant went.');
    }
    if (seen.size > 1) {
      fail(`hr_apply* bodies disagree about ${name}: `
        + [...seen].map(([v, ns]) => `${v} in ${ns.join('/')}`).join(', '));
    }
    return Number([...seen.keys()][0]);
  };
  const MAX_ITEM_DELTA = clampOf('c_max_item_delta', /c_max_item_delta\s+constant\s+bigint\s*:=\s*(\d+)/);
  const MAX_ITEM_KINDS = clampOf('c_max_item_kinds', /c_max_item_kinds\s+constant\s+int\s*:=\s*(\d+)/);
  const MAX_XP_DELTA   = clampOf('c_max_xp_delta',   /c_max_xp_delta\s+constant\s+bigint\s*:=\s*(\d+)/);

  // A character of its own. The ones the op loop used carry whatever usage the
  // seed happened to produce, and an assertion of the form "used went up by
  // exactly N" wants a clean starting point it did not have to guess.
  const uid = '000000ff-0000-4000-a000-0000000000ff';
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [uid, 'BudgetProbe']);
  await asUser(uid);
  const cr = await rpc('select hr_create_character($1) r', [0]);
  if (cr.ok !== true) fail('could not create the budget probe character', JSON.stringify(cr));
  const key = `${uid}:0`;
  keys.push(key);
  const c = books.newChar(uid, 0);
  books.chars.set(key, c);
  /* THE STARTER KIT, BOOKED AS OPENING — the same measurement the op loop makes
     for its own characters, for the same reason: `hr_create_character` grants
     gold, seeds, food and an equipped sword, and a model that assumed zero here
     would report the game's own welcome gift as a conservation drift. */
  {
    const st0 = (await q(`select coalesce((select w.gold from account_wallet w where w.user_id = '${uid}'), 0)::text g, version::text v
                            from player_state where user_id = '${uid}' and slot = 0`))[0];
    books.openPurse(uid, Number(st0.g)); c.version = Number(st0.v);
    for (const r of await q(`select item_id, qty::text q from player_inventory
                              where user_id = '${uid}' and slot = 0`)) {
      c.inv.set(r.item_id, Number(r.q));
      books.addItem(books.openItems, r.item_id, Number(r.q));
    }
    for (const r of await q(`select equip_slot, item_id from player_equipment
                              where user_id = '${uid}' and slot = 0`)) {
      c.equip.set(r.equip_slot, r.item_id);
      books.addItem(books.openItems, r.item_id, 1);
    }
  }

  const used = async (at = 'now()') => {
    const r = (await db.query(
      `select hr_day_budget_used($1,$2,${at}) r`, [uid, 0])).rows[0].r;
    return { gold: Number(r.gold), xp: Number(r.xp), qty: Number(r.qty), rows: Number(r.rows), day: r.day };
  };
  // Every apply goes through the REAL hr_apply as the REAL engine role.
  const apply = async (delta) => {
    const r = await applyAs(c, c.version, uuidOf(rng), delta);
    if (r.ok === true) c.version += 1;
    return r;
  };
  const jr = (kind, intent) => ({ kind, intent });
  const stats = { checks: 0 };
  const step = async (what, fn) => { await fn(); stats.checks++; if (VERBOSE) process.stderr.write(`  budget: ${what}\n`); };

  const u0 = await used();
  if (u0.gold !== 0 || u0.xp !== 0 || u0.qty !== 0) {
    fail('a brand-new character already has daily-budget usage', JSON.stringify(u0));
  }

  // ── 1. A MINT IS CHARGED, EXACTLY ONCE, AND A SPEND DOES NOT REFUND IT ──
  // This is the property that separates a ledger sum from a counter. With the
  // budget summing the signed `gold` column (a plausible "we already have that
  // column" bug) the spend below would hand the budget straight back.
  await step('mint charges, spend does not refund', async () => {
    const A = 100000;
    let r = await apply({ gold: A, journal: jr('admin', 'budget_mint') });
    if (r.ok !== true) fail(`a ${A} gold mint was refused`, JSON.stringify(r));
    c.gold += A; books.mintGold += A;
    let u = await used();
    if (u.gold !== A) fail(`after minting ${A} gold, usage is ${u.gold}`, JSON.stringify(u));

    r = await apply({ gold: -A, journal: jr('shop', 'budget_spend') });
    if (r.ok !== true) fail(`spending ${A} gold was refused`, JSON.stringify(r));
    c.gold -= A; books.burnGold += A;
    u = await used();
    if (u.gold !== A) {
      fail(`spending gold changed the day's usage from ${A} to ${u.gold} — the budget is a NET counter, `
        + 'which means "mint the ceiling, spend it, mint it again" is free', JSON.stringify(u));
    }
  });

  // ── 2. journal.kind IS NOT A DOOR ───────────────────────────────────────
  // `kind` is chosen by the caller. A budget that only counted kind='accrue'
  // would be evaded by a compromised engine writing kind='craft'.
  await step('every ledger kind is charged, not just accrue', async () => {
    const id = ITEMS[0];
    const before = await used();
    const r = await apply({ items: { [id]: 500 }, journal: jr('craft', 'budget_kind') });
    if (r.ok !== true) fail('a craft-kind item mint was refused', JSON.stringify(r));
    books.invAdd(c, id, 500); books.mint(id, 500);
    const after = await used();
    if (after.qty - before.qty !== 500) {
      fail(`500 units minted under kind='craft' moved the qty budget by ${after.qty - before.qty} — `
        + 'journal.kind is caller-chosen, so a kind-scoped budget is an open door', JSON.stringify(after));
    }
  });

  // ── 3. THE DAY WINDOW, IN BOTH DIRECTIONS ───────────────────────────────
  // A direct INSERT, deliberately: there is no RPC that can write a row dated
  // yesterday, and "the window is real" is exactly the assertion that a
  // same-day-only harness cannot make. gold is left at 0 on the planted row so
  // it is invisible to every conservation aggregate.
  await step('yesterday does not consume today', async () => {
    const before = await used();
    await db.query(
      `insert into player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, at)
       values ($1, 0, 'accrue', 'budget_yesterday', 0, $2, $2, $2, now() - interval '1 day')`,
      [uid, 999999999]);
    const after = await used();
    if (after.gold !== before.gold || after.xp !== before.xp || after.qty !== before.qty) {
      fail('a ledger row dated yesterday consumed today\'s budget — the window is not a UTC day, '
        + 'so one big day would lock the account out permanently',
        `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
    const y = await used("now() - interval '1 day'");
    if (y.gold !== 999999999) {
      fail(`asked for yesterday, the sum returned ${y.gold} — the window excludes rows it should include, `
        + 'which is the same defect pointed the other way', JSON.stringify(y));
    }
  });

  // ── 4. A MARKET CREDIT IS NOT PROGRESSION ───────────────────────────────
  // market_buy pays the seller directly and journals it. That gold was already
  // charged to whoever minted it. Charging it again would lock a trader out of
  // progression for selling a hoard — the fuse firing on the most honest
  // behaviour there is.
  await step('a market sale does not consume the seller\'s budget', async () => {
    const id = ITEMS[1];
    // give the probe something to sell, and the buyer something to pay with
    let r = await apply({ items: { [id]: 5 }, journal: jr('admin', 'budget_sellstock') });
    if (r.ok !== true) fail('could not stock the budget probe', JSON.stringify(r));
    books.invAdd(c, id, 5); books.mint(id, 5);

    // Fund a buyer rather than hoping the seed left one solvent: a leg that
    // silently skips is a leg that stops catching its injection on a bad seed.
    let buyerKey = keys.find((k) => k !== key && books.char(k).gold > 5000);
    if (!buyerKey) {
      buyerKey = keys.find((k) => k !== key);
      const bb = books.char(buyerKey);
      const fr = await applyAs(bb, bb.version, uuidOf(rng),
        { gold: 20000, journal: jr('admin', 'budget_fund_buyer') });
      if (fr.ok !== true) fail('could not fund a buyer for the market leg', JSON.stringify(fr));
      bb.version += 1; bb.gold += 20000; books.mintGold += 20000;
    }
    const b = books.char(buyerKey);

    /* ⚠ ROLL THE RATE WINDOW FIRST, THEN FAIL RATHER THAN SKIP. This leg used
       to bail quietly on any refusal, and after the market verbs moved onto the
       shared `apply` budget the op loop's `rate_storm` could leave that budget
       spent — so on some seeds the leg silently did nothing and the injection
       it exists to catch (budget_market_credit_charged) read as SLIPPED.
       Measured: caught at 60 ops, slipped at 400, on the same seed. A leg that
       skips on a bad seed is a leg that is decoration on that seed. */
    await db.query("update hr_rate_counters set window_start = now() - interval '2 hours'");
    /* SETTLE-BEFORE-MUTATE (Security F2, 2026-09-28): a buy on a character whose
       combat window is still unpaid is refused settle_first — the accrue phase
       leaves every character six hours stale. Close the buyer's window the way
       the engine's collect does (an accrued_to-only settle, no value moved), so
       this leg measures the budget and not the ordering rule. */
    const sr = await applyAs(b, b.version, uuidOf(rng), { accrued_to: 'now', journal: jr('accrue', 'budget_buyer_settle') });
    if (sr.ok !== true) fail('could not settle the buyer before the market leg', JSON.stringify(sr));
    b.version += 1;
    /* 2027-01-12: listing from the BAG is a bag verb, so the seller's open window is settled too
       (the same accrued_to-only settle), and the ask is the item's own floor (the shop's bid). */
    const ss = await applyAs(c, c.version, uuidOf(rng), { accrued_to: 'now', journal: jr('accrue', 'budget_seller_settle') });
    if (ss.ok !== true) fail('could not settle the seller before the market leg', JSON.stringify(ss));
    c.version += 1;
    const ask = market.floorOf(id);
    const lr = await market.list(c, id, 5, ask);
    if (lr.ok !== true) fail(`the market leg could not list (${lr.error})`, JSON.stringify(lr));
    const fee = market.feeOf(5, ask);
    c.version += 1; books.invAdd(c, id, -5); c.gold -= fee; books.fees += fee;
    books.listings.set(lr.listed.listing_id, { key, uid: c.uid, item: id, qty: 5, ask, fee, aged: false });

    const before = await used();
    const br = await market.buy(b, lr.listed.listing_id, 5, ask, 'storage');
    if (br.ok !== true) fail(`the market leg could not buy (${br.error})`, JSON.stringify(br));
    const gross = 5 * ask; const tax = houseTax(gross);
    b.gold -= gross; b.version += 1; books.purses.set(c.uid, (books.purses.get(c.uid) || 0) + gross - tax);
    books.tax += tax; books.stoAdd(b.uid, id, 5); books.listings.delete(lr.listed.listing_id);

    const after = await used();
    if (after.gold !== before.gold) {
      fail(`a market sale moved the seller's daily budget by ${after.gold - before.gold} — `
        + 'transfers are not mints, and charging them locks honest traders out',
        `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
  });

  // ── 5. THE XP CEILING CATCHES WHAT NO PER-CALL CLAMP CAN ────────────────
  // A sequence of individually-legal calls walks straight past the per-call
  // clamp, and only the DAY budget stops the last one. That gap is the entire
  // reason this control exists — so the call size is derived from the clamp the
  // deployed body declares rather than typed. (The hard-coded "12,000,000 /
  // 40,000,000, so four calls" that stood here was the b355 ceiling; b356 moved
  // the day budget to 120,000,000 and the prose stopped describing the run,
  // which is one line of drift away from what happened to leg 6 below.)
  await step('the XP ceiling stops a sequence of individually-legal calls', async () => {
    const perCall = Math.floor(MAX_XP_DELTA * 5 / 6);   // legal per call, by construction
    const limXp = Number(LIM.xp);
    let n = 0; let last = null;
    for (let k = 0; k < 20; k++) {
      const u = await used();
      if (u.xp + perCall > limXp) break;
      const r = await apply({ xp: { woodcutting: perCall }, journal: jr('accrue', 'budget_xp') });
      if (r.ok !== true) fail(`a ${perCall} XP grant was refused at usage ${u.xp}`, JSON.stringify(r));
      n++;
    }
    if (n < 2) fail(`only ${n} individually-legal XP calls fitted under the ceiling — the day budget `
      + 'is at or below the per-call clamp, which makes the per-call clamp unreachable');
    // The loop must have stopped because USAGE filled the ceiling, not because
    // it ran out of iterations. If xp_in is never stamped, usage stays 0 and
    // the loop mints 200,000,000 XP without ever noticing — which is precisely
    // the failure mode, and it must be named as that rather than showing up
    // later as an incidental xp_clamp.
    if (n >= 20) {
      fail(`20 grants of ${perCall} XP each all fitted under a ${limXp} ceiling — the day's XP usage `
        + 'never accumulated, so xp_in is not being stamped and XP is minted outside the budget entirely',
        JSON.stringify(await used()));
    }
    const u = await used();
    last = await apply({ xp: { woodcutting: limXp - u.xp + 1 }, journal: jr('accrue', 'budget_xp_over') });
    if (last.error !== 'daily_budget') {
      fail(`crossing the XP ceiling answered "${last.error ?? `ok:${last.ok}`}" — it must be daily_budget`,
        JSON.stringify(last));
    }
    if (last.dim !== 'xp') fail(`the XP breach reported dim="${last.dim}"`, JSON.stringify(last));
    if (Number(last.used) !== u.xp) {
      fail(`the breach detail says used=${last.used} but the ledger sum is ${u.xp} — the detail is not `
        + 'the sum, so it is a counter', JSON.stringify(last));
    }
    if (Number(last.limit) !== limXp) fail(`the breach reported limit=${last.limit}, not ${limXp}`);
    const after = await used();
    if (after.xp !== u.xp) fail(`a rejected XP grant still moved the budget: ${u.xp} → ${after.xp}`);
  });

  // ── 6. THE QTY CEILING IS A SUM ACROSS ITEM IDS ─────────────────────────
  // Two halves, because they fail for different reasons and only one of them
  // depends on the size of the ceiling:
  //   (a) a multi-id call moves the day's usage by the SUM of its entries;
  //   (b) the ceiling is compared against that sum, so a mint split across ids
  //       is refused exactly where a single-id mint of the same size would be.
  //
  // ⚠ (b) HAD BEEN RED SINCE 2026-08-16 AND NOTHING SAID SO. It used to send two
  //   ids each carrying half the day's remaining room, which was legal when the
  //   leg was written (835b2a43, 2026-08-11: c_day_qty_budget was 1,000,000, so a
  //   half was ~500,000 — comfortably inside the 1,000,000 per-item-per-call
  //   clamp). b356 (2026-08-16-day-budget-artisan.sql §1) raised c_day_qty_budget
  //   to 70,000,000 and deliberately HELD c_max_item_delta at 1,000,000 (its own
  //   §0 refuses to install if that constant has moved). From that commit a half
  //   was ~35,000,000, and hr_apply's per-item clamp refused the call ~640 lines
  //   before the budget check ran: `item_clamp` where the leg demanded
  //   `daily_budget`. THE SERVER WAS RIGHT ON EVERY ONE OF THOSE RUNS — the
  //   construction was stale — but the failure read as a conservation violation
  //   and it took the whole `--selftest` down with it: with the clean run RED,
  //   five injections were graded CAUGHT on this leg's message rather than on
  //   their own defect (see the selftest driver's false-catch check).
  //
  // So the two clamps are READ OUT OF THE DEPLOYED hr_apply BODY rather than
  // copied here, the breach is composed from as many ids as the ceiling now
  // needs, and if a retune ever puts the ceiling out of reach of one legal call
  // this leg says so IN WORDS instead of quietly proving something smaller.
  await step('the qty ceiling sums across item ids', async () => {
    const limQty = Number(LIM.qty);

    // (a) USAGE IS THE SUM OF THE CALL, not one of its entries. Seven units, so
    //     it is true at any ceiling and cannot go stale the way (b) did.
    {
      const a = ITEMS[2]; const b = ITEMS[3];
      if (!a || !b || a === b) fail(`the working set did not yield two distinct ids (${a}, ${b})`);
      const before = await used();
      const r = await apply({ items: { [a]: 3, [b]: 4 }, journal: jr('gather', 'budget_qty_sum') });
      if (r.ok !== true) fail('a two-id, seven-unit mint was refused', JSON.stringify(r));
      books.invAdd(c, a, 3); books.mint(a, 3);
      books.invAdd(c, b, 4); books.mint(b, 4);
      const after = await used();
      if (after.qty - before.qty !== 7) {
        fail(`3 units of one id plus 4 of another moved the qty budget by ${after.qty - before.qty}, `
          + 'not 7 — the day usage does not SUM across item ids, so splitting a mint over ids is '
          + 'partly free', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      }
    }

    // (b) …AND THE CEILING IS COMPARED AGAINST THAT SUM.
    const u = await used();
    const room = limQty - u.qty;
    if (room < 4) { if (VERBOSE) process.stderr.write('  budget: no qty room — leg skipped\n'); return; }
    const need = room + 1;                       // exactly one unit past the ceiling
    const kinds = Math.max(2, Math.ceil(need / MAX_ITEM_DELTA));
    if (kinds > MAX_ITEM_KINDS) {
      fail(`no single legal call can exceed a qty ceiling of ${limQty}: it would need ${kinds} item `
        + `ids carrying at most ${MAX_ITEM_DELTA} units each, and hr_apply refuses more than `
        + `${MAX_ITEM_KINDS} item kinds per call. The day ceiling has been raised past the reach of `
        + 'the per-call clamps, so this leg can no longer construct the breach in one call — '
        + 'saturate the day with legal calls first, or re-size the ceiling. This is the SAME shape '
        + 'of staleness b356 introduced; it is failing loudly on purpose rather than proving less.');
    }
    if (kinds > POOL.length) {
      fail(`the breach needs ${kinds} distinct item ids and the generated catalogue yielded `
        + `${POOL.length} stackable ones`);
    }
    const ids = POOL.slice(0, kinds);
    const per = Math.ceil(need / kinds);
    const items = {};
    let placed = 0;
    ids.forEach((id, n) => {
      const v = n === kinds - 1 ? need - placed : per;
      items[id] = v; placed += v;
    });
    for (const [id, v] of Object.entries(items)) {
      if (!(v >= 1 && v <= MAX_ITEM_DELTA)) {
        fail(`the breach put ${v} units on ${id}, outside 1..${MAX_ITEM_DELTA} — the split is wrong, `
          + 'not the server');
      }
    }
    if (placed !== need) fail(`the breach sums to ${placed}, not the ${need} it must`);

    const r = await apply({ items, journal: jr('gather', 'budget_qty_over') });
    if (r.error === 'item_clamp') {
      fail(`${kinds} ids carrying at most ${per} units each — every one inside the ${MAX_ITEM_DELTA} `
        + 'per-item clamp read out of the deployed hr_apply body — was refused with item_clamp. '
        + 'The clamp the body declares is not the clamp it enforces', JSON.stringify(r));
    }
    if (r.error !== 'daily_budget' || r.dim !== 'qty') {
      fail(`${placed} units spread over ${kinds} ids against ${room} of room answered `
        + `"${r.error ?? `ok:${r.ok}`}" (dim ${r.dim}) — the qty budget must sum across item ids`,
        JSON.stringify(r));
    }
    if (Number(r.used) !== u.qty) {
      fail(`the breach detail says used=${r.used} but the ledger sum is ${u.qty} — the detail is not `
        + 'the sum, so it is a counter', JSON.stringify(r));
    }
    if (Number(r.limit) !== limQty) fail(`the breach reported limit=${r.limit}, not ${limQty}`, JSON.stringify(r));
    const after = await used();
    if (after.qty !== u.qty) fail(`a rejected item mint still moved the budget: ${u.qty} → ${after.qty}`);
  });

  // ── 7. THE GOLD CEILING: ENFORCED, EXACT, AND NOT A LATCH ───────────────
  await step('the gold ceiling is a sum, not a latch', async () => {
    const limGold = Number(LIM.gold);
    let u = await used();
    const room = limGold - u.gold;

    // one over → refused, and inert
    let r = await apply({ gold: room + 1, journal: jr('accrue', 'budget_gold_over') });
    if (r.error !== 'daily_budget' || r.dim !== 'gold') {
      fail(`one gold over the ceiling answered "${r.error ?? `ok:${r.ok}`}"`, JSON.stringify(r));
    }
    if ((await used()).gold !== u.gold) fail('a rejected gold mint still moved the budget');

    // exactly the remaining room → paid. THIS is the latch test: a control that
    // simply trips on first breach would refuse this too.
    r = await apply({ gold: room, journal: jr('accrue', 'budget_gold_exact') });
    if (r.ok !== true) fail(`exactly the remaining ${room} gold was refused — the budget is a latch`, JSON.stringify(r));
    c.gold += room; books.mintGold += room;
    u = await used();
    if (u.gold !== limGold) fail(`after filling the ceiling exactly, usage is ${u.gold}, not ${limGold}`);

    // …and now one more gold is refused.
    r = await apply({ gold: 1, journal: jr('accrue', 'budget_gold_after') });
    if (r.error !== 'daily_budget') fail(`one gold past a full ceiling answered "${r.error ?? `ok:${r.ok}`}"`);

    // ── the escape hatch that keeps a saturated character playable ─────────
    // A zero-inflow apply is never refused, which is what keeps the b328
    // degrade ladder's last rung — the watermark-only accrue_forfeit — reachable
    // for a character that has spent its whole budget. Without it a breach
    // would brick accrual instead of costing one span.
    r = await apply({ accrued_to: 'now', journal: jr('accrue', 'accrue_forfeit') });
    if (r.ok !== true) fail('a watermark-only accrue_forfeit was refused on a saturated character — '
      + 'a budget breach now bricks accrual instead of costing one span', JSON.stringify(r));
    r = await apply({ gold: -1, journal: jr('shop', 'budget_spend_after') });
    if (r.ok !== true) fail('a pure SPEND was refused on a saturated character', JSON.stringify(r));
    c.gold -= 1; books.burnGold += 1;
  });

  const rec = await reconcile(db, books, { i: 'budget', op: 'budget' });
  if (!rec.ok) throw Object.assign(new Error('daily-budget conservation violation'), { detail: rec.detail });

  const fin = await used();
  return { ran: true, checks: stats.checks, limits: LIM, finalUsed: fin };
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 2 — accrual.
//
// computeAccrual is the REAL server engine (supabase/functions/hr-accrue/
// accrual.js, the same module tests/accrual-engine.mjs asserts parity on). Its
// delta goes to the REAL hr_apply. What the fuzz adds is the conservation
// question the parity test does not ask: does an accrual grant mint EXACTLY
// what it says it minted, once — including when it is replayed, and including
// when the b328 degrade ladder has to walk the span down.
//
// ⚠ THE LADDER DRIVER IS A PORT. The ladder itself lives in TypeScript
//   (supabase/functions/hr-accrue/index.ts) and cannot be imported by Node, so
//   the loop below re-drives it: apply → on a DEGRADABLE error halve grantMs
//   and recompute → after MAX_DEGRADE, apply a watermark-only `accrue_forfeit`.
//   The constants are read out of index.ts and asserted rather than retyped, so
//   a change there fails here — but the DRIVER is the harness's, and that is a
//   stated limitation, not a claim of parity.
// ════════════════════════════════════════════════════════════════════════
async function accrualPhase(db, books, keys, rng, applyAs, q, divergences) {
  /* No `?v=` here: a cache-buster is a browser mechanism, bump-version.sh walks
     src/ only so this one froze at ?v=328, and Node ignores the query anyway.
     tools/pack-edge.mjs `versionQueryGuard()` now fails the build on one. */
  let computeAccrual; let ITEMS_DATA; let MONSTERS_DATA; let NODES;
  try {
    ({ computeAccrual } = await import('../supabase/functions/hr-accrue/accrual.js'));
    ({ ITEMS: ITEMS_DATA } = await import('../src/data/items.js'));
    ({ MONSTERS: MONSTERS_DATA } = await import('../src/data/monsters.js'));
    ({ GATHER_NODES: NODES } = await import('../supabase/functions/hr-accrue/catalogue.js'));
  } catch (e) {
    divergences.push(`accrual phase skipped: ${e.message}`);
    return { ran: false };
  }

  // Tie the driver's constants to the deployed ladder.
  const idx = await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts'), 'utf8');
  const maxDegrade = Number((idx.match(/const MAX_DEGRADE\s*=\s*(\d+)/) || [])[1]);
  const degradable = new Set(
    ((idx.match(/const DEGRADABLE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '')
      .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean));
  if (!(maxDegrade > 0) || degradable.size === 0) {
    divergences.push('accrual phase: could not read MAX_DEGRADE / DEGRADABLE out of index.ts — the ladder driver is unanchored');
    return { ran: false };
  }

  /* A GATHERING pointer (closed rebuild, lane C2): a fight outside a hunt
     session is never priced, so the away ladder is walked on the payable kind
     the away path still prices. */
  const NODE = 'normal_tree';
  const stats = { grants: 0, replays: 0, degraded: 0, forfeits: 0, minted: 0 };

  for (const key of keys) {
    const c = books.char(key);
    for (const round of [0, 1]) {
      // Put the character on a real gathering activity with a real start clock.
      await db.query(
        `update player_state
            set active_kind = 'gather', active_id = $3,
                active_since = now() - interval '6 hours',
                accrued_to   = now() - interval '6 hours'
          where user_id = $1 and slot = $2`, [c.uid, c.slot, NODE]);
      c.version += 0; // a direct UPDATE, not an intent: version is untouched

      // ROUND 1 squeezes the bank to ONE stack so a real accrual delta trips
      // the real `bank_full` clamp, which is on the DEGRADABLE list. That is
      // the only way to walk the b328 ladder without fabricating a rejection —
      // and halving the span never reduces the STACK COUNT, so this round is
      // guaranteed to run the ladder all the way to `accrue_forfeit`, which is
      // precisely the path that must move the watermark and nothing else.
      const cap = round === 1 ? 1 : 100;
      await db.query('update player_state set bank_cap = $3 where user_id = $1 and slot = $2', [c.uid, c.slot, cap]);
      c.bankCap = cap;

      const st = (await db.query(
        `select coalesce((select w.gold from account_wallet w where w.user_id = $1), 0)::text gold, hp, level_xp::text level_xp, version::text version,
                extract(epoch from accrued_to)*1000 a, extract(epoch from active_since)*1000 s,
                extract(epoch from now())*1000 n
           from player_state where user_id = $1 and slot = $2`, [c.uid, c.slot])).rows[0];
      const skills = Object.fromEntries((await db.query(
        'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=$2',
        [c.uid, c.slot])).rows.map((r) => [r.skill_id, Number(r.xp)]));
      const equipment = Object.fromEntries([...c.equip].map(([s, id]) => [s, id]));

      const env = {
        nowMs: Number(st.n), accruedToMs: Number(st.a), activeSinceMs: Number(st.s),
        activeKind: 'gather', activeId: NODE, capMs: 12 * 3600000,
        seed: 1234567, hp: Number(st.hp), levelXp: Number(st.level_xp), gold: Number(st.gold),
        skills, equipment, items: ITEMS_DATA, monsters: MONSTERS_DATA, nodes: NODES,
      };

      let out = computeAccrual(env);
      if (!out.accrued) {
        /* Nothing to price: the squeezed cap must still be restored, or the
           next phase inherits a one-stack bank (a skipped restore read as a
           bank_full far from here). */
        await db.query('update player_state set bank_cap = 100 where user_id = $1 and slot = $2', [c.uid, c.slot]);
        c.bankCap = 100;
        divergences.push(`accrual phase: the ${NODE} window for ${key} priced nothing (${out.reason}) — the ladder was not walked`);
        continue;
      }

      // The version comes from the MODEL, not from a fresh read. Re-reading it
      // here would paper over any version drift the ladder introduced, and
      // version drift is one of the things reconcile() is watching for.
      const apply1 = async (delta) => {
        const intentId = uuidOf(rng);
        const r = await applyAs(c, c.version, intentId, delta);
        return { r, intentId };
      };

      let { r: res, intentId } = await apply1(out.delta);
      let degraded = false;
      for (let attempt = 1; attempt <= maxDegrade && res.ok !== true && degradable.has(String(res.error)); attempt++) {
        const smaller = Math.floor(Number(out.grantMs) / 2);
        degraded = true;
        if (!(smaller > 0)) break;
        const next = computeAccrual({ ...env, capMs: smaller });
        if (!next.accrued) break;
        out = next;
        ({ r: res, intentId } = await apply1(out.delta));
      }
      if (degraded) stats.degraded++;

      if (res.ok !== true && degradable.has(String(res.error))) {
        // The forfeit: the watermark moves, NOTHING else does.
        const fr = await apply1({ accrued_to: 'now',
          journal: { kind: 'accrue', intent: 'accrue_forfeit', meta: { reason: String(res.error) } } });
        if (fr.r.ok === true) { c.version += 1; stats.forfeits++; }
      } else if (res.ok === true) {
        // The grant landed. Book exactly what the ENGINE said it granted —
        // that number came from computeAccrual, not from reading the database.
        const d = out.delta;
        c.version += 1;
        if (d.gold) { c.gold += d.gold; books.mintGold += d.gold; stats.minted += d.gold; }
        for (const [id, n] of Object.entries(d.items || {})) { books.invAdd(c, id, n); books.mint(id, n); }
        stats.grants++;

        // …and a REPLAY of the very same key must add nothing at all.
        const rep = await applyAs(c, c.version, intentId, d);
        if (rep.replayed !== true) divergences.push(`accrual replay not marked replayed for ${key}`);
        stats.replays++;
      }

      // Restore a workable bank cap for the next round.
      await db.query('update player_state set bank_cap = 100 where user_id = $1 and slot = $2', [c.uid, c.slot]);
      c.bankCap = 100;

      const rec = await reconcile(db, books, { i: `accrual/${key}/${round}`, op: 'accrual' });
      if (!rec.ok) throw Object.assign(new Error('accrual conservation violation'), { detail: rec.detail });
    }
  }
  return { ran: true, ...stats };
}

// ════════════════════════════════════════════════════════════════════════
// main
// ════════════════════════════════════════════════════════════════════════
const t0 = Date.now();
const baseSeed = SEED_ARG !== null ? (Number(SEED_ARG) >>> 0) : (Math.random() * 0xffffffff) >>> 0;

const runOnce = async (label, seed, injection) => {
  try {
    const r = await runFuzz({ seed, ops: OPS, injection });
    return r;
  } catch (e) {
    if (e.detail) return { ok: false, seed, detail: e.detail, opsRun: '?' };
    throw e;
  }
};

if (SELFTEST) {
  process.stdout.write(`conservation-fuzz SELFTEST · seed ${baseSeed} · ${OPS} ops/run · `
    + `${USERS} users × ${SLOTS} slots\n\n`);

  // EACH RUN GETS ITS OWN PROCESS. Two PGlite instances in one Node process do
  // not stay independent — the second boot of the same migration bundle failed
  // an assertion that had just passed in the first, which is a WASM-VM sharing
  // artefact and nothing to do with the injection. A fuzz whose result depends
  // on what ran before it is not reproducible from its seed, which is the one
  // property this harness promises. So: fork, and read the child's verdict from
  // its exit code, exactly as CI would.
  const { spawnSync } = await import('node:child_process');
  const childArgs = [`--ops=${OPS}`, `--users=${USERS}`, `--slots=${SLOTS}`, `--seed=${baseSeed}`];
  const child = (extra) => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...childArgs, ...extra],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };

  const cleanChild = child([]);
  const cleanOk = cleanChild.status === 0;
  process.stdout.write(`CLEAN RUN            ${cleanOk ? 'no violation (as required)' : 'VIOLATION'}\n`);
  if (!cleanOk) process.stdout.write(indent(cleanChild.out));
  const clean = { ok: cleanOk, detail: cleanChild.out };

  /* ⚠ A RED CLEAN RUN INVALIDATES EVERY INJECTION RESULT, AND THAT MUST BE SAID
     OUT LOUD. A `--inject` child is graded on its EXIT CODE: non-zero means "the
     fuzz reported a violation", which is evidence about the PLANT only if the
     same fuzz reports nothing WITHOUT it. From 2026-08-16 to 2026-09-04 the clean
     run was red on PHASE 3 leg 6 (a stale construction — see there) and this table
     printed "16/16 caught" underneath it: five of those sixteen exited non-zero on
     leg 6's message, byte-for-byte the clean run's, and would have done so with no
     plant at all. The overall exit was 1, so nothing shipped on a false green — but
     the line that says THE HARNESS WORKS was wrong, which is the renown-faucet
     lesson ("eight of eleven mutations demonstrated only that the apply threw")
     arriving in this file by a different route.
     So: while the clean run is red every injection is UNGRADED, and the ones whose
     failure matches the clean failure are named as the reason it is unreadable. */
  const violationOf = (out) => {
    const lines = String(out || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const i = lines.findIndex((l) => l === 'CONSERVATION VIOLATION' || l.startsWith('CAUGHT at op #'));
    if (i < 0) return '';
    // Seeds, op indices and balances differ between runs BY DESIGN; what is being
    // compared is the SHAPE of the failure.
    return lines.slice(i + 1, i + 3).join(' | ').replace(/\d+/g, 'N');
  };
  const cleanViolation = cleanOk ? '' : violationOf(cleanChild.out);

  const results = [];
  for (const id of Object.keys(INJECTIONS)) {
    // `--inject` exits 0 when it CAUGHT the planted bug and 1 when it slipped;
    // exit 2 is a harness problem (a stale anchor, a migration that will not
    // apply) and must never be silently read as "caught".
    const r = child([`--inject=${id}`]);
    if (r.status === 2) {
      results.push({ id, caught: false, harness: true, first: firstLine(r.out) });
      continue;
    }
    const caught = r.status === 0;
    const at = (r.out.match(/CAUGHT at op #(\S+)/) || [])[1] || '?';
    const same = !cleanOk && caught && violationOf(r.out) === cleanViolation;
    results.push({ id, caught, at, ungraded: !cleanOk, same, first: caught ? firstLine(r.out) : null });
  }

  process.stdout.write('\nINJECTION RESULTS — a harness that cannot catch a planted bug is decoration\n');
  process.stdout.write(''.padEnd(78, '─') + '\n');
  for (const r of results) {
    const verdict = r.harness ? 'HARNESS ' : (r.ungraded ? 'UNGRADED' : (r.caught ? 'CAUGHT  ' : 'SLIPPED '));
    const why = r.harness ? `— harness error: ${r.first}`
      : (r.same ? "— failed with the CLEAN RUN's own failure, so it proves nothing about this plant"
      : (r.caught ? `at op #${r.at}: ${r.first}` : '— the fuzz ran clean with this bug in place'));
    process.stdout.write(`  ${verdict} ${r.id.padEnd(22)} ${why}\n`);
  }
  const slipped = results.filter((r) => !r.caught);
  const sameAsClean = results.filter((r) => r.same);
  process.stdout.write(''.padEnd(78, '─') + '\n');
  if (clean.ok) {
    process.stdout.write(`  ${results.length - slipped.length}/${results.length} caught · `
      + `clean run green · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  } else {
    process.stdout.write('  CLEAN RUN RED — NOTHING ABOVE IS GRADED. The fuzz must report no violation\n'
      + '  without a plant before "caught" means anything'
      + (sameAsClean.length
        ? `; ${sameAsClean.length} of ${results.length} failed with the clean run's own failure`
        : '')
      + `. ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
  if (clean.ok) process.stdout.write(clean.detail.split('\n').filter((l) => /^\s{2}(operations|verdicts|accrual|day budget|DIVERG)/.test(l) || /^\s{4}\S/.test(l)).join('\n') + '\n');
  process.exit(slipped.length || !clean.ok ? 1 : 0);
}

if (ONLY_INJECT) {
  const r = await runOnce(ONLY_INJECT, baseSeed, ONLY_INJECT);
  process.stdout.write(`conservation-fuzz --inject=${ONLY_INJECT} · seed ${baseSeed}\n`);
  if (r.ok) {
    process.stdout.write(`SLIPPED — the fuzz ran clean with "${INJECTIONS[ONLY_INJECT].what}" in place.\n`);
    process.exit(1);
  }
  process.stdout.write(`CAUGHT at op #${r.opsRun}:\n  ${r.detail}\n`);
  process.exit(0);
}

const r = await runOnce('clean', baseSeed, null);
process.stdout.write(`conservation-fuzz · seed ${baseSeed} · ${OPS} ops · ${USERS} users × ${SLOTS} slots\n`);
if (!r.ok) {
  process.stdout.write(`\nCONSERVATION VIOLATION\n  ${r.detail}\n\n`);
  process.stdout.write(`reproduce:  node tests/conservation-fuzz.mjs --seed=${r.seed} --ops=${OPS} --users=${USERS} --slots=${SLOTS}\n`);
  process.exit(1);
}
summarise(r);
process.stdout.write(`\nno conservation violation in ${r.opsRun} ops · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
process.stdout.write('(a clean run proves nothing on its own — run --selftest to see the harness fail on planted bugs)\n');
process.exit(0);

function firstLine(s) {
  const lines = String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  // The most informative line of a --inject run is the first concrete diff,
  // which sits under the "CAUGHT at op #…" header.
  const at = lines.findIndex((l) => l.startsWith('CAUGHT at op'));
  if (at >= 0) return lines[at + 2] || lines[at + 1] || lines[at];
  return lines.find((l) => l.startsWith('HARNESS:')) || lines[0] || '';
}
function indent(s) { return String(s || '').split('\n').map((l) => `  ${l}`).join('\n') + '\n'; }

function summarise(res) {
  const ops = Object.entries(res.counts || {}).sort((a, b) => b[1] - a[1]);
  process.stdout.write('\n  operations : ' + ops.map(([k, v]) => `${k}×${v}`).join(' ') + '\n');
  const v = Object.entries(res.verdicts || {}).sort((a, b) => b[1] - a[1]);
  process.stdout.write('  verdicts   : ' + v.map(([k, n]) => `${k}×${n}`).join(' ') + '\n');
  if (res.accrual && res.accrual.ran) {
    process.stdout.write(`  accrual    : ${res.accrual.grants} grants, ${res.accrual.replays} replays, `
      + `${res.accrual.degraded} degrade ladders, ${res.accrual.forfeits} forfeits, `
      + `${res.accrual.minted} gold minted\n`);
  }
  if (res.budget && res.budget.ran) {
    const L = res.budget.limits; const U = res.budget.finalUsed;
    process.stdout.write(`  day budget : ${res.budget.checks}/7 legs · ceilings gold ${L.gold} / xp ${L.xp} / qty ${L.qty}`
      + ` · probe finished at gold ${U.gold} xp ${U.xp} qty ${U.qty} over ${U.rows} ledger rows\n`);
  }
  if (res.house && res.house.ran) {
    const h = res.house;
    process.stdout.write(`  house      : PHASE 4 ${h.builds} builds and ${h.refusals} refusals reconciled · ${h.moves} Storage moves`
      + ` · ${h.fromBag} units from bags, ${h.fromStorage} from Storage\n`);
  }
  if (res.equip) {
    const e = res.equip;
    process.stdout.write(`  equipment  : PHASE 0 transfer leg ${e.leg ? 'ran' : 'DID NOT RUN'}`
      + ` · ${e.worn}/${e.unequips} PHASE 1 unequips took hr_apply's return-to-bag branch\n`);
  }
  if (res.hunt) {
    process.stdout.write(`  hunt bag   : PHASE 0b packed-supplies leg ${res.hunt.leg ? 'ran (enter, restock, list + Storage refused past the bag, a hunting hero listed)' : 'DID NOT RUN'}\n`);
  }
  if (res.divergences && res.divergences.length) {
    process.stdout.write('  DIVERGENCES (harness model vs server — not conservation violations):\n');
    for (const d of res.divergences.slice(0, 12)) process.stdout.write(`    ${d}\n`);
    if (res.divergences.length > 12) process.stdout.write(`    …and ${res.divergences.length - 12} more\n`);
  }
}
