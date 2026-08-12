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
//                             + Σ market_listings.qty
//        == opening + Σ intended mints − Σ intended burns
//
//   Σ player_state.gold + Σ market_sales.tax
//        == opening + Σ intended mints − Σ intended burns
//
// The escrow path is the one this exists for: under market v2 A LISTING IS
// THE ESCROW — market_list DELETEs the goods out of player_inventory and the
// listing row is the only record that they exist — so list→cancel, list→buy
// and list→expire must each conserve EXACTLY, with no third place for a stack
// to hide.
//
// ── WHERE IT RUNS ───────────────────────────────────────────────────────
// In process, against a REAL PostgreSQL (PGlite/WASM, PG 18) with the FOUR
// REAL MIGRATION FILES applied verbatim:
//
//     2026-08-11-player-state.sql
//     2026-08-11-catalogue.generated.sql
//     2026-08-11-apply-engine.sql
//     2026-08-11-market-v2.sql
//
// Nothing is reimplemented, stubbed or "modelled" on the server side. The
// only scaffolding is tests/sql/pglite-fixture.sql (auth.uid, auth.users,
// profiles, a pg_cron shim) — read its header for what is stubbed and why
// each stub is faithful. Production is never touched: no network, no
// credentials, no branch, nothing to leave behind.
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
// prove it can fail: `--selftest` applies each of EIGHT known conservation
// violations as a textual patch to the real migration SQL, re-runs the fuzz,
// and demands that every one of them is CAUGHT. A patch that does not change
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

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

// grant-hygiene is in this list as of 2026-08-11 because market-v2 §9(i) no
// longer carries its own copy of the hr_engine capability pin — it DELEGATES to
// hr_assert_grant_hygiene(), which is where the pin actually runs (review S9).
// market-v2 fails closed without it, deliberately, so the harness has to apply
// it too. Side benefit: the detector's own self-check now runs on every fuzz.
const MIGRATIONS = [
  ['player-state', MIG('2026-08-11-player-state.sql')],
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  // daily-budget is BEFORE apply-engine because apply-engine fails closed
  // without hr_day_budget_check (C5/X3). Applying them the other way round is
  // not a slow degradation, it is a refused migration — which is the point.
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['grant-hygiene', MIG('2026-08-11-grant-hygiene.sql')],
  ['market-v2', MIG('2026-08-11-market-v2.sql')],
];

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
// ════════════════════════════════════════════════════════════════════════
const INJECTIONS = {
  cancel_vanish: {
    what: 'market_cancel deletes the listing but never returns the escrow — the stack ceases to exist',
    file: 'market-v2',
    patches: [[
      `    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;`,
      `    -- INJECTED cancel_vanish: escrow is not returned`,
    ]],
  },

  list_no_escrow: {
    what: 'market_list posts the listing without debiting the seller — the goods exist twice',
    file: 'market-v2',
    patches: [[
      `    if v_have = p_qty then
      delete from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    else
      update public.player_inventory set qty = qty - p_qty
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    end if;`,
      `    -- INJECTED list_no_escrow: the seller keeps the goods AND gets the listing`,
    ]],
  },

  gold_double: {
    what: 'hr_apply credits a positive gold delta twice',
    file: 'apply-engine',
    patches: [[
      `      v_new_gold := v_st.gold + v_n;`,
      `      v_new_gold := v_st.gold + v_n + greatest(v_n, 0);  -- INJECTED gold_double`,
    ]],
  },

  buy_no_debit: {
    what: 'market_buy pays the seller and delivers the goods but never debits the buyer',
    file: 'market-v2',
    patches: [[
      `    update public.player_state set gold = gold - v_gross, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;`,
      `    update public.player_state set gold = gold - 0, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;  -- INJECTED buy_no_debit`,
    ]],
  },

  tax_skim: {
    what: 'market_buy destroys one extra gold per trade that no tax row accounts for (a leak, not a sink)',
    file: 'market-v2',
    patches: [[
      `    v_net   := v_gross - v_tax;`,
      `    v_net   := greatest(0, v_gross - v_tax - 1);  -- INJECTED tax_skim`,
    ]],
  },

  reject_mutates: {
    what: 'a REJECTED op still writes: hr_record_rejection (outside the protected block) credits gold',
    file: 'player-state',
    // 2026-08-11: this used to be caught by reconcile() at op #N. It is now
    // caught EARLIER — apply-engine §6(g)'s C5 probe drives a real rejection
    // and asserts the character's gold did not move, which is the same property
    // one layer up. A bug that cannot be installed beats a bug that is detected
    // at runtime, so the gate is recorded rather than weakened; the
    // conservation model's ability to see this class is still proven by
    // cancel_vanish / gold_double / buy_no_debit / tax_skim / equip_dupe /
    // expire_double.
    gate: /a daily_budget rejection still moved gold/,
    patches: [[
      `  if p_user is null or p_code is null then return; end if;`,
      `  if p_user is null or p_code is null then return; end if;
  -- INJECTED reject_mutates: bookkeeping that moves value
  update public.player_state set gold = gold + 1
   where user_id = p_user and slot = coalesce(p_slot, 0);`,
    ]],
  },

  replay_applies_twice: {
    what: 'hr_apply loses idempotency — a replayed intent id applies its delta a second time',
    file: 'apply-engine',
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
    file: 'apply-engine',
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
    file: 'apply-engine',
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
    what: 'market_expire returns an expired listing\'s escrow twice',
    file: 'market-v2',
    patches: [[
      `    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    -- Bump \`version\` (review S15)`,
      `    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)  -- INJECTED expire_double
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    -- Bump \`version\` (review S15)`,
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
    file: 'apply-engine',
    gate: /daily budget|daily_budget/i,
    patches: [[
      `      perform public.hr_reject('daily_budget', v_bud);`,
      `      perform 1;  -- INJECTED budget_not_enforced: the ceiling is computed and discarded`,
    ]],
  },

  budget_kind_scoped: {
    what: "the budget only counts kind='accrue' rows — and journal.kind is caller-chosen",
    file: 'daily-budget',
    // caught by daily-budget.sql §8(e): the market-credit row is kind='trade',
    // so a kind-scoped sum sees one row where the probe planted two.
    gate: /hr_day_budget_used saw \d+ rows in the day window/,
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
    file: 'daily-budget',
    gate: /day|budget/i,
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
    file: 'apply-engine',
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
    file: 'apply-engine',
    patches: [[
      `    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;`,
      `    -- INJECTED budget_ignores_qty: v_qty_in stays 0`,
    ]],
  },

  budget_market_credit_charged: {
    what: "market_buy stamps the seller's credit as progression inflow — selling a hoard burns the "
      + 'seller\'s whole day of progression',
    file: 'market-v2',
    patches: [[
      `    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
      values (v_uid, v_slot, 'trade', 'market_buy', v_row.item_id, p_qty, -v_gross,
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each)),
             (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_sold',
              v_row.item_id, -p_qty, v_net,
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax));`,
      `    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, meta)
      values (v_uid, v_slot, 'trade', 'market_buy', v_row.item_id, p_qty, -v_gross, 0,
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each)),
             (v_row.seller_user_id, v_row.seller_slot, 'trade', 'market_sold',
              v_row.item_id, -p_qty, v_net, v_net,  -- INJECTED budget_market_credit_charged
              jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax));`,
    ]],
  },
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
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    process.stderr.write(
      'HARNESS: @electric-sql/pglite is not installed.\n'
      + '  This fuzz runs a real PostgreSQL in-process; without it there is nothing to assert against\n'
      + '  and a "pass" would be meaningless. Install it:  npm i -D @electric-sql/pglite\n');
    process.exit(2);
  }

  const db = await PGlite.create();
  // Line endings are normalised to LF IN MEMORY ONLY. The migrations are
  // checked in with CRLF on this box; the injection anchors below are written
  // with LF, and an anchor that silently fails to match is the exact "planted
  // bug that was never planted" failure the anchor guard exists to catch. It
  // makes no difference to Postgres.
  const sources = new Map();
  for (const [name, path] of MIGRATIONS) {
    sources.set(name, (await readFile(path, 'utf8')).replace(/\r\n/g, '\n'));
  }

  // Plant the bug, if any — and prove the plant landed.
  if (injectionId) {
    const inj = INJECTIONS[injectionId];
    if (!inj) { process.stderr.write(`HARNESS: unknown injection "${injectionId}"\n`); process.exit(2); }
    let sql = sources.get(inj.file);
    if (sql === undefined) { process.stderr.write(`HARNESS: injection names an unknown file ${inj.file}\n`); process.exit(2); }
    for (const [find, replace] of inj.patches) {
      const n = sql.split(find).length - 1;
      if (n !== 1) {
        process.stderr.write(
          `HARNESS: injection "${injectionId}" anchor matched ${n} times in ${inj.file} (need exactly 1).\n`
          + '  The migration text has moved. A planted bug that is not planted is decoration —\n'
          + '  fix the anchor rather than letting the injection silently no-op.\n');
        process.exit(2);
      }
      const after = sql.replace(find, replace);
      if (after === sql) { process.stderr.write(`HARNESS: injection "${injectionId}" produced identical SQL\n`); process.exit(2); }
      sql = after;
    }
    sources.set(inj.file, sql);
  }

  const fixture = await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8');
  try {
    // market-v2 refuses to drop a non-empty market without this. Scoped to this
    // database, which exists only in this process's memory.
    await db.exec("select set_config('hearthrise.market_wipe_ok','yes',false)");
    await db.exec(fixture);
    // hr_utc_day_key is a PRE-EXISTING production object (it ships in
    // 2026-08-08-clan-seat.sql, applied months before this bundle) and
    // 2026-08-11-daily-budget.sql fails closed without it. Restating it in the
    // fixture would put a SECOND definition of "what a UTC day is" in the tree,
    // which is the drift generator this whole program is organised around — and
    // the budget's day boundary is derived from it. So the EXACT BYTES are
    // lifted out of the migration that owns it. If that file's definition ever
    // changes, the fuzz picks the change up; if the anchor stops matching, the
    // harness aborts rather than quietly stubbing.
    const seat = await readFile(MIG('2026-08-08-clan-seat.sql'), 'utf8');
    const dayKey = seat.match(/create or replace function public\.hr_utc_day_key[\s\S]*?\$\$;/);
    if (!dayKey) throw new Error('could not lift hr_utc_day_key out of 2026-08-08-clan-seat.sql');
    await db.exec(dayKey[0]);
    // …and put it back in the posture production actually holds it in.
    // 2026-08-11-authenticated-surface-lockdown.sql §1b revoked hr_utc_day_key
    // from every client role (it is the day boundary for daily gates, and a
    // client that can ask the server what day it thinks it is gets a free
    // oracle). Without this line the lifted function arrives with Postgres'
    // default PUBLIC EXECUTE and hr_assert_grant_hygiene fails the bundle —
    // which is the detector working correctly, on scaffolding rather than on
    // anything under test.
    await db.exec(`revoke execute on function public.hr_utc_day_key(timestamptz)
                     from public, anon, authenticated, service_role`);
    for (const [name] of MIGRATIONS) await db.exec(sources.get(name));
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
  if (injectionId && INJECTIONS[injectionId].gate) {
    // The gate did NOT fire. Do not exit here — let the fuzz run, so the plant
    // still gets a fair chance to be caught at runtime and the result reads as
    // SLIPPED only if nothing at all noticed.
    process.stderr.write(`NOTE: injection "${injectionId}" declares gate: but the migration installed it anyway.\n`);
  }
  return db;
}

// ════════════════════════════════════════════════════════════════════════
// The model — an independent second set of books.
// ════════════════════════════════════════════════════════════════════════
class Books {
  constructor() {
    this.chars = new Map();     // "uid:slot" → {uid, slot, gold, inv:Map, equip:Map, version, bankCap}
    this.listings = new Map();  // listingId → {key, item, qty, ask, aged}
    this.tax = 0;               // Σ house tax the harness EXPECTS to have been taken
    this.mintGold = 0; this.burnGold = 0;
    this.mintItems = new Map(); this.burnItems = new Map();
    this.openGold = 0; this.openItems = new Map();
  }
  char(key) { return this.chars.get(key); }
  addItem(m, id, n) { m.set(id, (m.get(id) || 0) + n); }
  mint(id, n) { this.addItem(this.mintItems, id, n); }
  burn(id, n) { this.addItem(this.burnItems, id, n); }
  invAdd(c, id, n) {
    const cur = (c.inv.get(id) || 0) + n;
    if (cur < 0) throw new Error(`model went negative on ${id}`);
    if (cur === 0) c.inv.delete(id); else c.inv.set(id, cur);
  }
  /** Everything the world currently believes it holds, by item. */
  itemTotals() {
    const t = new Map();
    for (const c of this.chars.values()) {
      for (const [id, n] of c.inv) this.addItem(t, id, n);
      for (const id of c.equip.values()) this.addItem(t, id, 1);
    }
    for (const l of this.listings.values()) this.addItem(t, l.item, l.qty);
    return t;
  }
  goldTotal() { let g = 0; for (const c of this.chars.values()) g += c.gold; return g; }
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

  const stateRows = await q('select user_id::text u, slot, gold::text g, version::text v from player_state');
  const invRows = await q('select user_id::text u, slot, item_id, qty::text q from player_inventory');
  const eqRows = await q('select user_id::text u, slot, equip_slot, item_id from player_equipment');
  const lstRows = await q('select id::text id, seller_user_id::text u, seller_slot, item_id, qty::text q, ask_each::text a from market_listings');
  const [{ tax, gross, net }] = await q(
    'select coalesce(sum(tax),0)::text tax, coalesce(sum(gold_gross),0)::text gross, coalesce(sum(gold_net),0)::text net from market_sales');

  // ── (A) exact, per character ─────────────────────────────────────────
  const dbGold = new Map(); const dbVer = new Map();
  for (const r of stateRows) { dbGold.set(`${r.u}:${r.slot}`, Number(r.g)); dbVer.set(`${r.u}:${r.slot}`, Number(r.v)); }
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
  for (const [key, c] of books.chars) {
    if (dbGold.get(key) !== c.gold) bad.push(`gold[${key}]: db ${dbGold.get(key)}, expected ${c.gold}`);
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

  // listings (the escrow)
  const dbL = new Map(lstRows.map((r) => [r.id, r]));
  for (const id of new Set([...dbL.keys(), ...books.listings.keys()])) {
    const d = dbL.get(id); const m = books.listings.get(id);
    if (!d && m) { bad.push(`listing ${id.slice(0, 8)}: gone from db, model holds ${m.qty}×${m.item} in escrow`); continue; }
    if (d && !m) { bad.push(`listing ${id.slice(0, 8)}: in db (${d.q}×${d.item_id}) but not in model`); continue; }
    if (Number(d.q) !== m.qty) bad.push(`listing ${id.slice(0, 8)} qty: db ${d.q}, expected ${m.qty}`);
    if (d.item_id !== m.item) bad.push(`listing ${id.slice(0, 8)} item: db ${d.item_id}, expected ${m.item}`);
    if (Number(d.a) !== m.ask) bad.push(`listing ${id.slice(0, 8)} ask: db ${d.a}, expected ${m.ask}`);
  }

  // ── (B) CONSERVATION, from the database alone ────────────────────────
  const worldItems = new Map();
  const add = (id, n) => worldItems.set(id, (worldItems.get(id) || 0) + n);
  for (const r of invRows) add(r.item_id, Number(r.q));
  for (const r of eqRows) add(r.item_id, 1);
  for (const r of lstRows) add(r.item_id, Number(r.q));

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
  for (const r of stateRows) worldGold += Number(r.g);
  const expectedGold = books.openGold + books.mintGold - books.burnGold - Number(tax);
  if (worldGold !== expectedGold) {
    bad.push(`CONSERVATION gold: players hold ${worldGold}, ledger says `
      + `${books.openGold} opening + ${books.mintGold} minted - ${books.burnGold} burned `
      + `- ${tax} house tax = ${expectedGold} (drift ${worldGold - expectedGold})`);
  }
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
  const stackables = (await q(
    `select item_id from hr_items
      where tradeable and item_id not in (select item_id from hr_item_slots)
      order by item_id limit 400`)).map((r) => r.item_id);
  const wearables = await q(
    `select i.item_id, s.equip_slot from hr_items i
       join hr_item_slots s using (item_id)
      where i.tradeable and i.req_lv is null
      order by i.item_id, s.equip_slot limit 400`);
  const untradeable = (await q('select item_id from hr_items where not tradeable order by item_id limit 20')).map((r) => r.item_id);
  const activities = await q("select kind, activity_id from hr_activities where req_lv is null order by kind, activity_id limit 200");
  const cfg = (await q('select house_tax_bp, listing_ttl_h, max_listings, max_qty from hr_market_config'))[0];
  const TAX_BP = Number(cfg.house_tax_bp);
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
    await db.query('insert into auth.users(id) values ($1)', [uid]);
    await db.query('insert into profiles(id, display_name) values ($1,$2)', [uid, `Fuzzer${u}`]);
    await asUser(uid);
    for (let s = 0; s < SLOTS; s++) {
      const r = await rpc('select hr_create_character($1) r', [s]);
      if (r.ok !== true) { process.stderr.write(`HARNESS: hr_create_character failed: ${JSON.stringify(r)}\n`); process.exit(2); }
      const key = `${uid}:${s}`;
      keys.push(key);
      books.chars.set(key, { uid, slot: s, gold: 0, inv: new Map(), equip: new Map(), version: 0, bankCap: 100 });
    }
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
    'intent_in_flight',
  ]);

  const OP_TABLE = [
    [10, 'accrue_grant'], [8, 'craft'], [8, 'vendor_sell'], [6, 'vendor_buy'],
    [7, 'equip'], [6, 'unequip'],
    [4, 'activity_set'], [4, 'progress'],
    [12, 'market_list'], [8, 'market_cancel'], [12, 'market_buy'], [4, 'market_expire'],
    // rejections — every one of these must move NOTHING
    [4, 'overspend_gold'], [4, 'overspend_item'], [4, 'stale_version'],
    [3, 'unknown_key'], [3, 'unknown_item'], [3, 'gold_clamp'],
    [7, 'replay'], [3, 'intent_mismatch'], [3, 'intent_in_flight'],
    [3, 'list_overqty'], [3, 'list_untradeable'], [3, 'cancel_foreign'],
    [3, 'buy_own'], [3, 'buy_poor'], [2, 'rate_storm'],
  ];

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
        const slotName = rng.pick(WEAR).equip_slot;
        const cur = c.equip.get(slotName) || null;
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

      // ── the escrow path ────────────────────────────────────────────────
      case 'market_list': {
        const id = rng.pick(ITEMS);
        const have = c.inv.get(id) || 0;
        const n = have > 0 ? rng.range(1, Math.min(have, 15)) : 1;
        const ask = rng.range(1, 400);
        const open = [...books.listings.values()].filter((l) => l.key === key).length;
        await asUser(c.uid);
        const r = await rpc('select market_list($1,$2,$3,$4,$5) r', [c.slot, id, n, ask, uuidOf(rng)]);
        want = open >= MAX_LISTINGS ? 'too_many_listings' : (have >= n ? 'ok' : 'insufficient_item');
        if (r.ok === true) {
          c.version += 1;
          books.invAdd(c, id, -n);
          books.listings.set(r.listing_id, { key, item: id, qty: n, ask, aged: false });
        }
        note = `list ${n}×${id} @${ask}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_cancel': {
        const mine = [...books.listings.entries()].filter(([, l]) => l.key === key);
        if (!mine.length) { i--; continue; }
        const [lid, l] = rng.pick(mine);
        await asUser(c.uid);
        const r = await rpc('select market_cancel($1,$2) r', [lid, uuidOf(rng)]);
        want = 'ok';
        if (r.ok === true) {
          c.version += 1;
          books.invAdd(c, l.item, l.qty);
          books.listings.delete(lid);
        }
        note = `cancel ${l.qty}×${l.item}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_buy': {
        const others = [...books.listings.entries()].filter(([, l]) => books.char(l.key).uid !== c.uid);
        if (!others.length) { i--; continue; }
        const [lid, l] = rng.pick(others);
        const n = rng() < 0.4 ? l.qty : rng.range(1, l.qty);
        const gross = n * l.ask;
        const tax = Math.trunc((gross * TAX_BP) / 10000);
        const net = gross - tax;
        const seller = books.char(l.key);
        await asUser(c.uid);
        const r = await rpc('select market_buy($1,$2,$3,$4) r', [c.slot, lid, n, uuidOf(rng)]);
        want = c.gold >= gross ? 'ok' : 'insufficient_gold';
        if (r.ok === true) {
          c.gold -= gross; c.version += 1;
          seller.gold += net; seller.version += 1;
          books.tax += tax;
          books.invAdd(c, l.item, n);
          if (n === l.qty) books.listings.delete(lid); else l.qty -= n;
        }
        note = `buy ${n}×${l.item} gross ${gross} tax ${tax} net ${net}`;
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'market_expire': {
        // Age a listing (a CLOCK move — it touches expires_at and nothing that
        // holds value), then run the real expiry sweep as the engine role.
        const all = [...books.listings.entries()];
        if (!all.length) { i--; continue; }
        const [lid, l] = rng.pick(all);
        await db.query("update market_listings set expires_at = now() - interval '1 minute' where id = $1", [lid]);
        l.aged = true;
        const aged = [...books.listings.entries()].filter(([, x]) => x.aged);
        await db.exec('set role hr_engine');
        const n = (await q('select market_expire(200) r'))[0].r;
        await db.exec('reset role');
        if (Number(n) !== aged.length) {
          divergences.push(`op#${i} market_expire returned ${n}, harness aged ${aged.length}`);
        }
        for (const [id, x] of aged) {
          const sc = books.char(x.key);
          books.invAdd(sc, x.item, x.qty);
          sc.version += 1;
          books.listings.delete(id);
        }
        want = null;
        note = `expire ${aged.length}`;
        got = 'expire';
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
        if (r.replayed !== true) divergences.push(`op#${i} replay of ${u.id.slice(0, 8)} was not marked replayed: ${JSON.stringify(r).slice(0, 160)}`);
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
        const id = rng.pick(ITEMS);
        await asUser(c.uid);
        const r = await rpc('select market_list($1,$2,$3,$4,$5) r',
          [c.slot, id, (c.inv.get(id) || 0) + rng.range(1, 100), rng.range(1, 100), uuidOf(rng)]);
        want = 'insufficient_item';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'list_untradeable': {
        await asUser(c.uid);
        const r = await rpc('select market_list($1,$2,$3,$4,$5) r',
          [c.slot, rng.pick(untradeable), 1, 100, uuidOf(rng)]);
        want = 'not_tradeable';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'cancel_foreign': {
        const others = [...books.listings.entries()].filter(([, l]) => books.char(l.key).uid !== c.uid);
        if (!others.length) { i--; continue; }
        await asUser(c.uid);
        const r = await rpc('select market_cancel($1,$2) r', [rng.pick(others)[0], uuidOf(rng)]);
        want = 'not_yours';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'buy_own': {
        const mine = [...books.listings.entries()].filter(([, l]) => books.char(l.key).uid === c.uid);
        if (!mine.length) { i--; continue; }
        const [lid, l] = rng.pick(mine);
        await asUser(c.uid);
        const r = await rpc('select market_buy($1,$2,$3,$4) r', [c.slot, lid, Math.min(1, l.qty), uuidOf(rng)]);
        want = 'own_listing';
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'buy_poor': {
        // A listing the buyer demonstrably cannot afford. Priced above the
        // buyer's balance by construction, so `insufficient_gold` is the only
        // honest answer and any movement is a leak.
        const seller = books.char(rng.pick(keys.filter((k) => books.char(k).uid !== c.uid)));
        const id = rng.pick(ITEMS);
        if ((seller.inv.get(id) || 0) < 1) { i--; continue; }
        await asUser(seller.uid);
        const ask = Math.min(1000000000, Math.max(1, c.gold + 1));
        const lr = await rpc('select market_list($1,$2,$3,$4,$5) r', [seller.slot, id, 1, ask, uuidOf(rng)]);
        if (lr.ok !== true) { i--; continue; }
        seller.version += 1; books.invAdd(seller, id, -1);
        books.listings.set(lr.listing_id, { key: `${seller.uid}:${seller.slot}`, item: id, qty: 1, ask, aged: false });
        await asUser(c.uid);
        const r = await rpc('select market_buy($1,$2,$3,$4) r', [c.slot, lr.listing_id, 1, uuidOf(rng)]);
        want = 'insufficient_gold';
        if (r.ok === true) {
          // Should be unreachable; model it anyway so the run continues honestly.
          const gross = ask; const tax = Math.trunc((gross * TAX_BP) / 10000);
          c.gold -= gross; c.version += 1; seller.gold += gross - tax; seller.version += 1;
          books.tax += tax; books.invAdd(c, id, 1); books.listings.delete(lr.listing_id);
        }
        got = r.ok === true ? 'ok' : String(r.error);
        break;
      }
      case 'rate_storm': {
        // Blow the market_list bucket (60/min) and assert the rejections are
        // free of side effects. The window is NOT rolled forward first, so the
        // storm lands inside whatever budget the run has already spent.
        let limited = 0;
        await asUser(c.uid);
        for (let k = 0; k < 70; k++) {
          const r = await rpc('select market_list($1,$2,$3,$4,$5) r',
            [c.slot, rng.pick(untradeable), 1, 10, uuidOf(rng)]);
          if (r.error === 'rate_limited') limited++;
        }
        if (!limited) divergences.push(`op#${i} rate_storm never tripped the market_list limit`);
        note = `${limited}/70 rate-limited`;
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
  const budget = await budgetPhase(db, books, keys, rng, applyAs, rpc, asUser, q, ITEMS, TAX_BP);

  const final = await reconcile(db, books, { i: ops, op: 'final' });
  await db.close();
  if (!final.ok) return { ok: false, seed, detail: final.detail, opsRun: ops, counts, verdicts, divergences };
  return { ok: true, seed, opsRun: ops, counts, verdicts, divergences, accrual, budget };
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
async function budgetPhase(db, books, keys, rng, applyAs, rpc, asUser, q, ITEMS, TAX_BP) {
  const fail = (msg, extra) => {
    throw Object.assign(new Error('daily-budget violation'),
      { detail: `DAILY BUDGET: ${msg}${extra ? `\n    ${extra}` : ''}` });
  };

  const LIM = (await q('select hr_day_budget_limits() r'))[0].r;
  for (const d of ['gold', 'xp', 'qty']) {
    if (!(Number(LIM[d]) > 0)) fail(`hr_day_budget_limits() has no positive ${d} limit`, JSON.stringify(LIM));
  }

  // A character of its own. The ones the op loop used carry whatever usage the
  // seed happened to produce, and an assertion of the form "used went up by
  // exactly N" wants a clean starting point it did not have to guess.
  const uid = '000000ff-0000-4000-a000-0000000000ff';
  await db.query('insert into auth.users(id) values ($1)', [uid]);
  await db.query('insert into profiles(id, display_name) values ($1,$2)', [uid, 'BudgetProbe']);
  await asUser(uid);
  const cr = await rpc('select hr_create_character($1) r', [0]);
  if (cr.ok !== true) fail('could not create the budget probe character', JSON.stringify(cr));
  const key = `${uid}:0`;
  keys.push(key);
  const c = { uid, slot: 0, gold: 0, inv: new Map(), equip: new Map(), version: 0, bankCap: 100 };
  books.chars.set(key, c);

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

    await asUser(uid);
    const lr = await rpc('select market_list($1,$2,$3,$4,$5) r', [0, id, 5, 100, uuidOf(rng)]);
    if (lr.ok !== true) { if (VERBOSE) process.stderr.write(`  budget: market_list refused (${lr.error}) — market leg skipped\n`); return; }
    c.version += 1; books.invAdd(c, id, -5);
    books.listings.set(lr.listing_id, { key, item: id, qty: 5, ask: 100, aged: false });

    const before = await used();
    await asUser(b.uid);
    const br = await rpc('select market_buy($1,$2,$3,$4) r', [b.slot, lr.listing_id, 5, uuidOf(rng)]);
    if (br.ok !== true) { if (VERBOSE) process.stderr.write(`  budget: market_buy refused (${br.error}) — market leg skipped\n`); return; }
    const gross = 500; const tax = Math.trunc((gross * TAX_BP) / 10000);
    b.gold -= gross; b.version += 1; c.gold += gross - tax; c.version += 1;
    books.tax += tax; books.invAdd(b, id, 5); books.listings.delete(lr.listing_id);

    const after = await used();
    if (after.gold !== before.gold) {
      fail(`a market sale moved the seller's daily budget by ${after.gold - before.gold} — `
        + 'transfers are not mints, and charging them locks honest traders out',
        `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
  });

  // ── 5. THE XP CEILING CATCHES WHAT NO PER-CALL CLAMP CAN ────────────────
  // c_max_xp_delta is 12,000,000 and the day ceiling is 40,000,000, so four
  // legal calls walk straight past the per-call clamp and only the DAY budget
  // stops the fifth. That gap is the entire reason this control exists.
  await step('the XP ceiling stops a sequence of individually-legal calls', async () => {
    const perCall = 10000000;
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
  // c_max_item_delta is per-item, so no per-call clamp can express "a million
  // units in total". Two ids, each individually legal, together over the day
  // ceiling.
  await step('the qty ceiling sums across item ids', async () => {
    const limQty = Number(LIM.qty);
    const u = await used();
    const room = limQty - u.qty;
    if (room < 4) { if (VERBOSE) process.stderr.write('  budget: no qty room — leg skipped\n'); return; }
    const a = ITEMS[2]; const b = ITEMS[3];
    const half = Math.floor((room + 2) / 2);
    const r = await apply({ items: { [a]: half, [b]: half }, journal: jr('gather', 'budget_qty_over') });
    if (r.error !== 'daily_budget' || r.dim !== 'qty') {
      fail(`${half}+${half} units against ${room} of room answered "${r.error ?? `ok:${r.ok}`}" (dim ${r.dim}) `
        + '— the qty budget must sum across item ids', JSON.stringify(r));
    }
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
  let computeAccrual; let ITEMS_DATA; let MONSTERS_DATA;
  try {
    ({ computeAccrual } = await import('../supabase/functions/hr-accrue/accrual.js'));
    ({ ITEMS: ITEMS_DATA } = await import('../src/data/items.js'));
    ({ MONSTERS: MONSTERS_DATA } = await import('../src/data/monsters.js'));
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

  const monster = Object.keys(MONSTERS_DATA)[0];
  const stats = { grants: 0, replays: 0, degraded: 0, forfeits: 0, minted: 0 };

  for (const key of keys) {
    const c = books.char(key);
    for (const round of [0, 1]) {
      // Put the character on a real combat activity with a real start clock.
      await db.query(
        `update player_state
            set active_kind = 'combat', active_id = $3,
                active_since = now() - interval '6 hours',
                accrued_to   = now() - interval '6 hours'
          where user_id = $1 and slot = $2`, [c.uid, c.slot, monster]);
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
        `select gold::text gold, hp, max_hp, version::text version,
                extract(epoch from accrued_to)*1000 a, extract(epoch from active_since)*1000 s,
                extract(epoch from now())*1000 n
           from player_state where user_id = $1 and slot = $2`, [c.uid, c.slot])).rows[0];
      const skills = Object.fromEntries((await db.query(
        'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=$2',
        [c.uid, c.slot])).rows.map((r) => [r.skill_id, Number(r.xp)]));
      const equipment = Object.fromEntries([...c.equip].map(([s, id]) => [s, id]));

      const env = {
        nowMs: Number(st.n), accruedToMs: Number(st.a), activeSinceMs: Number(st.s),
        activeKind: 'combat', activeId: monster, capMs: 12 * 3600000,
        seed: 1234567, hp: Number(st.hp), maxHp: Number(st.max_hp), gold: Number(st.gold),
        skills, equipment, items: ITEMS_DATA, monsters: MONSTERS_DATA,
      };

      let out = computeAccrual(env);
      if (!out.accrued) continue;

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
    results.push({ id, caught, at, first: caught ? firstLine(r.out) : null });
  }

  process.stdout.write('\nINJECTION RESULTS — a harness that cannot catch a planted bug is decoration\n');
  process.stdout.write(''.padEnd(78, '─') + '\n');
  for (const r of results) {
    const verdict = r.harness ? 'HARNESS' : (r.caught ? 'CAUGHT ' : 'SLIPPED');
    const why = r.harness ? `— harness error: ${r.first}`
      : (r.caught ? `at op #${r.at}: ${r.first}` : '— the fuzz ran clean with this bug in place');
    process.stdout.write(`  ${verdict}  ${r.id.padEnd(22)} ${why}\n`);
  }
  const slipped = results.filter((r) => !r.caught);
  process.stdout.write(''.padEnd(78, '─') + '\n');
  process.stdout.write(`  ${results.length - slipped.length}/${results.length} caught · `
    + `clean run ${clean.ok ? 'green' : 'RED'} · ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
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
  if (res.divergences && res.divergences.length) {
    process.stdout.write('  DIVERGENCES (harness model vs server — not conservation violations):\n');
    for (const d of res.divergences.slice(0, 12)) process.stdout.write(`    ${d}\n`);
    if (res.divergences.length > 12) process.stdout.write(`    …and ${res.divergences.length - 12} more\n`);
  }
}
