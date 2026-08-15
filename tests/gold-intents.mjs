#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gold-intents.mjs — THE TWO ECONOMY INTENTS, BEHAVIOURALLY.
//
//   shop_buy    gold  -> items, at the CATALOGUE price
//   vendor_sell items -> gold,  at the CATALOGUE bid
//
// THE INVARIANTS (each is a line in the change contract; each is mutation-proven
// RED — `--selftest`):
//
//   1. THE CLIENT NEVER SENDS A PRICE. The request names an OFFER or an ITEM and
//      a COUNT; every gold figure that moves came out of src/data.
//   2. THE PRICE THE SERVER CHARGES IS THE PRICE THE SHOP SHOWS. Both are
//      src/data/shops.js, and the vendor bid's formula and rate are read out of
//      src/legacy.js and compared — a second statement of one number is only
//      defensible while something proves it has not diverged.
//   3. A PURCHASE DOES NOT CONFISCATE THE PLAYER'S NIGHT. hr_apply stamps
//      `accrued_to = now()` on any delta carrying `activity`, `equip` or
//      `accrued_to`; a gold verb carries none of them, and `guardStampKeys`
//      re-checks that on the real delta rather than trusting the comment.
//   4. A REPLAYED SPEND MOVES NOTHING, AND ITS RECEIPT IS NULL.
//   5. ONE KEY MEANS ONE PURCHASE. Same key, different offer OR DIFFERENT COUNT
//      ⇒ `intent_mismatch`, not a silent no-op that charges for one sword while
//      the client believes it bought five.
//   6. AFFORDABILITY AND STOCK ARE hr_apply's ANSWERS, under the lock. This
//      layer never pre-decides them, and a forged request cannot mint.
//   7. HOSTILE NAMES ARE OWN-PROPERTY LOOKUPS (review C6). `GOLD_OFFERS
//      ['constructor']` must not resolve to an object whose `.gold` is
//      undefined — that is a free purchase.
//
// ── WHERE IT RUNS, AND WHY THAT IS THE STRONGEST AVAILABLE PROOF ────────
// In process against a REAL PostgreSQL (PGlite / PG 18 in WASM) with the REAL
// migration chain applied verbatim, including the staged
// 2026-08-15-gold-intents.sql. Nothing server-side is stubbed.
//
// And the intents themselves are not ported either: `runShopBuy` /
// `runVendorSell` are imported from supabase/functions/hr-accrue/*.js — the same
// bytes tools/pack-edge.mjs ships — behind their one injected seam, `exec`.
//
// ⚠ AND ONE GROUP RUNS OVER THE REAL WIRE. G18 exposes the same PGlite over the
//   PostgreSQL wire protocol (`@electric-sql/pglite-socket`) and drives both
//   verbs through the REAL `postgres@3.4.5` driver with index.ts's own pool
//   options. That is not belt-and-braces: on 2026-08-15 a 27-mutation suite was
//   green against an apply path that had NEVER ONCE WORKED in production,
//   because the harness injected a PGlite `exec` and the bug was in the
//   TRANSPORT (instance #18). A new apply site that has never been driven
//   through postgres.js is exactly that gap, reopened.
//
// ── WHAT THIS DOES **NOT** PROVE ────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The advisory lock in hr_apply is
//     exercised and contended by nothing; the version conflict below is a fault
//     injection at the point a race would produce one, not a race.
//   · RLS AND GRANTS beyond `set role hr_engine` around every statement.
//   · THE HTTP SHELL — JWT, CORS, the pooler. Owned by tests/jwt-verify.mjs,
//     tests/cors-preflight.mjs and tools/switch-on-test.mjs.
//   · THE CLIENT. Nothing in src/** calls these verbs yet, by design.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node tests/gold-intents.mjs               clean run
//   node tests/gold-intents.mjs --list        the mutation catalogue
//   node tests/gold-intents.mjs --selftest    every mutation must be CAUGHT
//   node tests/gold-intents.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { bootChain, ROOT } from './pglite-chain.mjs';

const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* The same EXTRA chain tests/activity-intent.mjs appends, plus this slice's own
   staged migration LAST — it is the third file to `create or replace`
   hr_rate_gate and applying it before activity-intent would silently delete the
   `activity` bucket. Kept as a literal rather than imported so a change to that
   file's ordering cannot silently change what this one runs against. */
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['accrual', MIG('2026-08-11-accrual.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
  ['activity-intent', MIG('2026-08-15-activity-intent.sql')],
  ['key-hygiene', MIG('2026-08-15-intent-key-hygiene.sql')],
  ['auto-eat', MIG('2026-08-15-auto-eat.sql')],
  ['tool-carry', MIG('2026-08-15-tool-carry.sql')],
  ['gold-intents', MIG('2026-08-15-gold-intents.sql')],
];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry patches a REAL source file with a bug this suite claims to catch.
   `--selftest` demands every one of them turns the run RED. A patch whose anchor
   does not match, or which produces identical text, is a HARNESS failure: a
   planted bug that was never planted is decoration. */
const MUTATIONS = {
  // ── the price is the server's ───────────────────────────────────────────
  vendor_rate_drift: {
    file: FN('catalogue.js'),
    why: 'the vendor rate drifts away from src/legacy.js VENDOR_RAW_RATE — the server pays 25% for '
       + 'raws while the shop UI promises 20%, silently, on every sale in the game',
    find: 'export const VENDOR_RAW_RATE = 0.20;',
    repl: 'export const VENDOR_RAW_RATE = 0.25;',
  },
  vendor_ignores_raw: {
    file: FN('catalogue.js'),
    why: 'the raw-material discount vanishes, so a maxed gatherer vendors at 5x the intended rate — '
       + 'the exact inflation b226 was written to close',
    find: '  return it.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : v;',
    repl: '  return v;',
  },
  buy_price_invented: {
    file: FN('shop-buy.js'),
    why: 'the delta stops charging the catalogue price — the server invents one, which is worse '
       + 'than having none',
    find: '    gold: -(offer.gold * qty),',
    repl: '    gold: -1,',
  },
  sell_price_invented: {
    file: FN('vendor-sell.js'),
    why: 'the sale mints a flat amount instead of the catalogue bid',
    find: '    gold: sale.unit * qty,',
    repl: '    gold: 1000,',
  },
  // ── the offer catalogue's eligibility predicate ─────────────────────────
  offer_predicate_loosened: {
    file: FN('catalogue.js'),
    why: 'the eligibility test stops rejecting offers carrying fields this verb does not implement '
       + '(reqSkill, max, period, authority) — a gated or capped offer becomes sellable UNGATED',
    find: '  for (const k of Object.keys(o)) {\n    if (!OFFER_FIELDS_UNDERSTOOD.includes(k)) return `unimplemented_field:${k}`;\n  }',
    repl: '  /* mutated: unknown offer fields no longer disqualify */',
  },
  /* ── C6 IS DEFENDED TWICE, SO EACH LAYER GETS ITS OWN MUTATION ──────────
     A prototype name reaching a free purchase needs BOTH defences to fail: the
     catalogue is null-prototype AND every lookup goes through `catalogueGet`.
     Removing either one alone is behaviourally invisible — which is exactly the
     state in which a defence rots — so one mutation is caught behaviourally and
     the other by a source assertion, and neither is allowed to be "covered by
     the other one". */
  offers_plain_object: {
    file: FN('catalogue.js'),
    why: 'C6 — the offer catalogue gains a prototype, so `GOLD_OFFERS.constructor` resolves to the '
       + 'Object constructor for anyone who indexes it without catalogueGet',
    find: 'const goldOffers = Object.create(null);',
    repl: 'const goldOffers = {};',
  },
  offer_truthy: {
    file: FN('shop-buy.js'),
    why: 'C6 — the offer lookup goes back to raw indexing. Behaviourally inert TODAY because the '
       + 'catalogue is null-prototype; one `Object.create(null)` away from a FREE purchase, so only '
       + 'a source assertion can see it — which is the whole point',
    find: '  const offer = catalogueGet(GOLD_OFFERS, offerId);',
    repl: '  const offer = GOLD_OFFERS[offerId];',
  },
  item_truthy: {
    file: FN('vendor-sell.js'),
    why: 'C6 — the item lookup goes back to truthiness, so a prototype name walks past the guard '
       + 'and reaches the database',
    find: '  const item = catalogueGet(ITEMS, itemId);\n  if (item === undefined) {',
    repl: '  const item = ITEMS[itemId];\n  if (!item) {',
  },
  // ── the quantity ────────────────────────────────────────────────────────
  qty_defaults_to_one: {
    file: FN('request.js'),
    why: 'an absent or malformed qty is GUESSED as 1 instead of refused — the server authors a '
       + 'number the player did not ask for, in a value transfer',
    find: "  if (!Object.prototype.hasOwnProperty.call(body, 'qty')) return null;",
    repl: "  if (!Object.prototype.hasOwnProperty.call(body, 'qty')) return 1;",
  },
  qty_unbounded: {
    file: FN('request.js'),
    why: 'the MAX_QTY bound is dropped, so one tap can name any count at all',
    find: '  return v >= 1 && v <= MAX_QTY ? v : null;',
    repl: '  return v >= 1 ? v : null;',
  },
  qty_accepts_string: {
    file: FN('request.js'),
    why: 'a numeric STRING is accepted, so "1e3" and " 5 " become quantities — two spellings of one '
       + 'value in the field that multiplies a transfer',
    find: '  const v = body.qty;\n',
    repl: '  const v = Number(body.qty);\n',
  },
  no_shape_check: {
    file: FN('spend.js'),
    why: 'a malformed quantity reaches the database and spends the player\'s rate budget',
    find: '  if (!Number.isSafeInteger(qty) || qty < 1) {',
    repl: '  if (false) {',
  },
  // ── the key names what it did ───────────────────────────────────────────
  name_drops_qty: {
    file: FN('intents.js'),
    why: 'journal.intent stops naming everything that changes what the delta DOES, so one key '
       + 'reused for "buy 1" then "buy 5" answers replayed:true and charges for one',
    find: "  return [verb, ...named].join(':');",
    repl: '  return verb;',
  },
  // ── rule 3's precondition ───────────────────────────────────────────────
  stamp_guard_off: {
    file: FN('intents.js'),
    why: 'the stamping-key guard is disarmed, so a delta carrying `equip` or `accrued_to` from a '
       + 'non-collecting verb silently confiscates the elapsed accrual window',
    find: '  const keys = stampKeysIn(delta);\n  if (keys.length === 0) return null;',
    repl: '  const keys = stampKeysIn(delta);\n  return null;\n  /* mutated */ if (keys.length === 0) return null;',
  },
  // ── the registry is read, not decoration (C4) ───────────────────────────
  registry_bucket_bogus: {
    file: FN('intents.js'),
    why: 'C4 — the registry names a bucket the database does not have; if nothing READS the '
       + 'registry this is invisible',
    find: "  shop_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  shop_buy: Object.freeze({ bucket: 'shoppe', needsKey: true, collectsFirst: false }),",
  },
  registry_needs_key_false: {
    file: FN('intents.js'),
    why: 'C4 — the registry says a value transfer needs no idempotency key',
    find: "  vendor_sell: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  vendor_sell: Object.freeze({ bucket: 'shop', needsKey: false, collectsFirst: false }),",
  },
  registry_collects_first_true: {
    file: FN('intents.js'),
    why: 'C4 — the registry says this verb collects before it acts and no collect is implemented; '
       + 'the read must FAIL CLOSED rather than proceed',
    find: "  shop_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  shop_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: true }),",
  },
  gate_literal_bucket: {
    file: FN('spend.js'),
    why: 'C4 — the rate bucket becomes a literal at the call site again. Behaviourally IDENTICAL '
       + 'today, so only the source assertion can see it — which is the whole point',
    find: '  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(verb)]);',
    repl: "  const [read] = await exec(READ_SQL, [user, slot, 'shop']);",
  },
  // ── the body speaks for the server (C5) ─────────────────────────────────
  receipt_on_replay: {
    file: FN('spend.js'),
    why: 'C5 — a REPLAYED spend reports a receipt for a transfer this invocation did not make',
    find: '      receipt: res.replayed === true ? null : plan.receipt,',
    repl: '      receipt: plan.receipt,',
  },
  refusal_no_state: {
    file: FN('spend.js'),
    why: 'C2 — a refusal stops carrying the envelope, so "reconcile to what the envelope says" is '
       + 'unexecutable on exactly the path that needs it',
    find: '  if (!env) return { ok: false, verb, ...refusal };',
    repl: '  return { ok: false, verb, ...refusal };\n  /* mutated */ if (!env) return null;',
  },
  // ── the transport (instance #18) ────────────────────────────────────────
  bare_jsonb_spend: {
    file: FN('spend.js'),
    why: 'the third apply site binds a pre-stringified delta into a bare $5::jsonb — the shipped '
       + 'P0, reintroduced in the file T1/T2 of delta-transport do not know by name',
    find: '$4::uuid, $5::text::jsonb) as res`;',
    repl: '$4::uuid, $5::jsonb) as res`;',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const UID = '00000000-0000-4000-b351-000000000001';
const UID2 = '00000000-0000-4000-b351-000000000002';

const FIXTURE = `
insert into auth.users (id) values ('${UID}'), ('${UID2}') on conflict (id) do nothing;

create or replace function public.__b351_create(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_create_character(p_slot);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
`;

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }
/** Non-fatal: record and keep going, for assertions that do not invalidate the
    rest of the run. A group that aborts on its first problem hides the others. */
function note(cond, msg) { if (!cond) fails.push(msg); }

async function boot(mutate) {
  const patchedJs = new Map();
  let sqlPatches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    if (m.file.endsWith('.sql')) {
      sqlPatches = new Map([[m.migration, [[m.find, m.repl]]]]);
    } else {
      const src = (await readFile(m.file, 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(m.find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.file}`);
        e.harness = true; throw e;
      }
      const after = src.replace(m.find, m.repl);
      if (after === src) {
        const e = new Error(`mutation "${mutate}" produced identical text`); e.harness = true; throw e;
      }
      patchedJs.set(m.file, after);
    }
  }

  let db;
  try {
    ({ db } = await bootChain({ extra: EXTRA, patches: sqlPatches }));
  } catch (e) {
    if (e.harness) throw e;
    /* A mutation that makes a migration refuse to install IS the guard working —
       the migration's own do$$ self-check is a commit gate. */
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(FIXTURE);
  const mods = await loadModules(patchedJs);
  return { db, ...mods };
}

async function loadModules(patched) {
  const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');

  const importAll = async (dir) => {
    const bust = `?t=${Date.now()}${Math.random()}`;
    return {
      buy: await import(pathToFileURL(join(dir, 'shop-buy.js')).href + bust),
      sell: await import(pathToFileURL(join(dir, 'vendor-sell.js')).href + bust),
      it: await import(pathToFileURL(join(dir, 'intents.js')).href + bust),
      cat: await import(pathToFileURL(join(dir, 'catalogue.js')).href + bust),
      req: await import(pathToFileURL(join(dir, 'request.js')).href + bust),
      sp: await import(pathToFileURL(join(dir, 'spend.js')).href + bust),
      fnDir: dir,
    };
  };
  if (!patched.size) return importAll(FN(''));

  /* A mutated module has to be imported from disk, and it imports its siblings
     by relative path — so the WHOLE function directory is copied to a temp dir
     at the same depth relative to ROOT, the patched file is overwritten there,
     and the copy is imported. Same depth matters: catalogue.js reaches
     ../../../src/data/**.

     ⚠ SOURCE-READING ASSERTIONS MUST READ THE SOURCE THAT RAN. `fnDir` points at
       this copy, and G13's literal-bucket scan reads from it — reading the repo
       path instead is how activity-intent.mjs's own A14 mutation SLIPPED. */
  const base = await mkdtemp(join(tmpdir(), 'hr-b351-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(FN(''), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, text] of patched) {
    await writeFile(join(dir, file.split(/[\\/]/).pop()), text, 'utf8');
  }
  return importAll(dir);
}

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module.
 *
 *  `set role hr_engine` around the statement, and that is not cosmetic: it is
 *  the role the Edge Function connects as, it holds ZERO table privileges in
 *  every schema, and it holds EXECUTE on exactly the functions the engine needs.
 *  So if a verb ever tried to touch a table directly it would be refused here
 *  exactly as it would be in production.
 *
 *  Hooks run OUTSIDE the role switch: they are the harness playing the part of a
 *  concurrent writer, which is a privilege the engine does not have and must not
 *  be given in order to be tested against. */
function makeExec(db, hooks = {}) {
  return async (text, params) => {
    if (hooks.before) await hooks.before(text, params);
    if (hooks.intercept) {
      const forced = await hooks.intercept(text, params);
      if (forced !== undefined) return forced;
    }
    await db.exec('set role hr_engine');
    try {
      return (await db.query(text, params)).rows;
    } finally {
      await db.exec('reset role');
    }
  };
}

const uuid = () => crypto.randomUUID();
const state = async (db, uid, slot = 0) => (await db.query(
  'select * from public.player_state where user_id = $1 and slot = $2', [uid, slot])).rows[0];
const invOf = async (db, uid, id, slot = 0) => Number(((await db.query(
  'select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3',
  [uid, slot, id])).rows[0] || { qty: 0 }).qty);
const ledger = async (db, uid, slot = 0) => (await db.query(
  'select kind, intent, gold, gold_in, xp_in, qty_in, meta from public.player_ledger '
  + 'where user_id = $1 and slot = $2 order by at, id', [uid, slot])).rows;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, buy, sell, it, cat, req, sp, fnDir } = await boot(mutate);
  const exec = makeExec(db);
  const doBuy = (o) => buy.runShopBuy({ exec, user: UID, slot: 0, ...o });
  const doSell = (o) => sell.runVendorSell({ exec, user: UID, slot: 0, ...o });
  const clearGate = () => db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);

  /** hr_apply driven directly as the engine — used only to SET UP fixtures
      (grant gold, grant stock). Never to assert an intent's behaviour. */
  const applyRaw = async (version, delta, uid = UID, slot = 0) => {
    const [r] = await exec(
      'select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text::jsonb) as res',
      [uid, slot, version, uuid(), JSON.stringify(delta)]);
    return r && r.res;
  };
  const grant = async (delta, uid = UID, slot = 0) => {
    const st = await state(db, uid, slot);
    const r = await applyRaw(Number(st.version), delta, uid, slot);
    ok(r && r.ok === true, `harness: fixture grant refused: ${JSON.stringify(r)}`);
    return r;
  };

  // ── G0. THE OFFER CATALOGUE IS DERIVED, AND THE PARTITION IS TOTAL ───────
  {
    const shops = await import('../src/data/shops.js');
    const eligible = Object.keys(cat.GOLD_OFFERS);
    const refused = Object.keys(cat.OFFER_REFUSALS);
    ok(eligible.length > 0, 'G0: GOLD_OFFERS is EMPTY — every purchase would be unknown_offer');
    ok(refused.length > 0,
      'G0-CONTROL: every authored offer is sellable, so the offer_unsupported refusal below proves '
      + 'nothing about the eligibility predicate');
    ok(eligible.length + refused.length === shops.SHOP_OFFERS.length,
      `G0: ${eligible.length} eligible + ${refused.length} refused != ${shops.SHOP_OFFERS.length} `
      + 'authored offers. The classification must be TOTAL — an offer in neither set is an offer '
      + 'nothing has an opinion about.');
    ok(Object.getPrototypeOf(cat.GOLD_OFFERS) === null,
      'G0: GOLD_OFFERS has a prototype — `constructor` and `__proto__` would resolve through it');
    ok(Object.getPrototypeOf(cat.OFFER_REFUSALS) === null, 'G0: OFFER_REFUSALS has a prototype');

    /* THE PRICE PARITY. Every eligible offer's gold must be the number the
       generated catalogue carries — not a number this file restates. */
    const byId = new Map(shops.SHOP_OFFERS.map((o) => [o.id, o]));
    for (const id of eligible) {
      const src = byId.get(id);
      const mine = cat.GOLD_OFFERS[id];
      ok(src && mine.gold === src.cost[0].amount,
        `G0: offer ${id} is priced ${mine.gold} here and ${src && src.cost[0].amount} in `
        + 'src/data/shops.js — the server would charge a price the shop does not show');
      for (const g of mine.grant) {
        const from = src.grant.find((x) => x.id === g.id);
        ok(from && from.amount === g.amount,
          `G0: offer ${id} grants ${g.amount}x ${g.id} here and ${from && from.amount} in the catalogue`);
      }
    }

    /* THE PREDICATE REFUSES FOR REAL REASONS, not one catch-all. A census, so
       a predicate that collapsed to "everything is unpayable_cost" is visible. */
    const families = new Set(refused.map((id) => String(cat.OFFER_REFUSALS[id]).split(':')[0]));
    ok(families.has('ungrantable'),
      `G0: no offer was refused for granting something other than an item (families: ${[...families]}). `
      + 'Unlocks are player_progress rows and are deliberately absent from hr_apply\'s delta '
      + 'allowlist — 99 of the 128 offers are that shape, so this family cannot be empty.');
    ok(families.has('unpayable_cost'),
      `G0: no offer was refused for a non-gold cost (families: ${[...families]}) — gems, Bounty `
      + 'Marks and USD are all authored, and Marks have no server column at all');
    ok(families.size >= 2,
      `G0: the eligibility predicate produced ${families.size} distinct refusal family — a single `
      + 'catch-all reason is indistinguishable from a predicate that stopped discriminating');

    ok(cat.ALL_OFFER_IDS.length === shops.SHOP_OFFERS.length,
      'G0: ALL_OFFER_IDS does not cover every authored offer');

    /* ── THE FIELD ALLOWLIST IS LIVE, AND IT IS THE MOST IMPORTANT LINE IN THE
       PREDICATE — so it is driven directly rather than inferred from the census.
       No authored offer today is gold-for-an-item-with-a-condition, which means
       the allowlist has nothing live to reject and the census above cannot see
       it at all: dropping it changes NOTHING about the 128 rows. It starts
       mattering the day somebody authors "Master's Longbow, 3,000g, requires
       Fletching 60" — at which point the difference between an allowlist and a
       shape check is the difference between a refusal and selling a level-60
       item to a level-3 character.

       So: a synthetic offer per condition, each of which MUST be refused, plus a
       control that the same row without the condition IS eligible. */
    const base = {
      id: 'probe.thing', table: 'probe', name: 'Probe',
      cost: [{ kind: 'currency', id: 'gold', amount: 100 }],
      grant: [{ kind: 'item', id: 'normal_log', amount: 1 }],
      repeatable: true,
    };
    ok(cat.offerIneligibility(base) === null,
      `G0-CONTROL: a plain gold->item offer is refused (${cat.offerIneligibility(base)}) — every `
      + 'assertion below would then pass for the wrong reason');
    for (const [field, value] of [['reqSkill', 'fletching'], ['reqLv', 60], ['max', 1],
      ['period', 'month'], ['authority', 'platform'], ['note', 'x']]) {
      const why = cat.offerIneligibility({ ...base, [field]: value });
      ok(why === `unimplemented_field:${field}`,
        `G0: an offer carrying '${field}' was judged '${why}'. This verb does not implement skill `
        + 'gates, purchase caps, subscriptions or platform billing; an offer that grows one must '
        + 'fall OUT of the sellable set BY CONSTRUCTION, not be sold with the condition ignored.');
    }
    ok(cat.offerIneligibility({ ...base, cost: [{ kind: 'currency', id: 'gold', amount: 0 }] })
      === 'non_positive_price',
      'G0: a 0-gold offer granting an item was accepted — that is an infinite item faucet');
    ok(String(cat.offerIneligibility({ ...base, grant: [{ kind: 'item', id: 'constructor', amount: 1 }] }))
      .startsWith('unknown_item'),
      'G0: an offer granting a prototype name was accepted');
    ok(cat.offerIneligibility({ ...base, repeatable: false }) === 'not_repeatable',
      'G0: a buy-once offer was accepted — the server keeps no purchase record, and a cap that is '
      + 'not enforced is not a cap');
  }

  // ── G1. THE VENDOR BID IS legacy.js's, NOT A SECOND OPINION ─────────────
  // src/data/shops.js exists BECAUSE legacy.js cannot be imported by ESM, and it
  // is defensible only because a guard proves the copy has not diverged. The
  // vendor formula is the same bargain — one more number that lives in two
  // places — so it gets the same treatment.
  {
    const legacy = (await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8')).replace(/\r\n/g, '\n');
    const rate = /const VENDOR_RAW_RATE\s*=\s*([0-9.]+)\s*;/.exec(legacy);
    ok(!!rate,
      'G1-CONTROL: no `const VENDOR_RAW_RATE = …` in src/legacy.js — this scan is blind, so a green '
      + 'run says nothing about whether the server pays what the shop promises');
    ok(Number(rate[1]) === cat.VENDOR_RAW_RATE,
      `G1: src/legacy.js pays raws at ${rate[1]} and the server pays ${cat.VENDOR_RAW_RATE}. The `
      + 'client renders one number in the bag and the server credits another — on every sale in '
      + 'the game, silently. Change it in legacy.js AND here, or move the rate into src/data.');

    const body = /function vendorPrice\(id\)\{([\s\S]*?)\n\}/.exec(legacy);
    ok(!!body, 'G1-CONTROL: could not read vendorPrice() out of src/legacy.js — the scan is blind');
    ok(/it\.raw\s*\?\s*Math\.max\(1,\s*Math\.floor\(v\s*\*\s*VENDOR_RAW_RATE\)\)\s*:\s*v/.test(body[1]),
      'G1: legacy.js\'s vendorPrice() formula has changed shape. The server\'s vendorPriceOf mirrors '
      + '`raw ? max(1, floor(v * rate)) : v`; if the client\'s has moved, one of them is now wrong.');

    /* BEHAVIOURAL PARITY over the whole catalogue, computed from the legacy
       formula rather than restated: every one of the 426 items, not a sample. */
    const { ITEMS } = await import('../src/data/items.js');
    const legacyPrice = (id) => {
      const item = ITEMS[id];
      if (!item) return 0;
      const v = Number(item.v) || 0;
      if (v <= 0) return 0;
      return item.raw ? Math.max(1, Math.floor(v * Number(rate[1]))) : v;
    };
    const wrong = Object.keys(ITEMS)
      .filter((id) => cat.vendorPriceOf(ITEMS, id) !== legacyPrice(id)).slice(0, 5);
    ok(wrong.length === 0,
      `G1: the server and the client disagree on the vendor bid for [${wrong}] — e.g. ${wrong[0]}: `
      + `server ${cat.vendorPriceOf(ITEMS, wrong[0])}, client ${legacyPrice(wrong[0])}`);
    /* THE DISCOUNT IS ACTUALLY BEING APPLIED. Sampled at v >= 10 deliberately:
       below that the `max(1, …)` floor makes the discounted price equal the book
       value, so a cheap raw is a control that cannot fail. Found the hard way —
       the first version of this line picked `bones` (v = 1) and reported the
       formula as absent when it was working. */
    const raws = Object.keys(ITEMS).filter((id) => ITEMS[id].raw && Number(ITEMS[id].v) >= 10);
    ok(raws.length > 20,
      `G1-CONTROL: only ${raws.length} raw items are worth 10+, so the discount half of the formula `
      + 'is barely exercised and the comparison above is close to vacuous');
    for (const id of raws.slice(0, 5)) {
      ok(cat.vendorPriceOf(ITEMS, id) < Number(ITEMS[id].v),
        `G1-CONTROL: ${id} is raw (v=${ITEMS[id].v}) but the server bids full book value — the `
        + 'discount is not being applied at all, so "the two agree" would only mean they are both wrong');
    }
    const plain = Object.keys(ITEMS).find((id) => !ITEMS[id].raw && Number(ITEMS[id].v) >= 10);
    ok(plain && cat.vendorPriceOf(ITEMS, plain) === Number(ITEMS[plain].v),
      `G1-CONTROL: ${plain} is NOT raw and the server does not bid book value — the discount is `
      + 'being applied to everything, which the comparison above would not distinguish');
    ok(cat.vendorPriceOf({}, 'constructor') === 0,
      'G1: vendorPriceOf priced a prototype member — `ITEMS[\'constructor\']` must not resolve');
  }

  // ── G2. THE PARSER, ON THE SHAPES AN ATTACKER SENDS ─────────────────────
  {
    const hostile = [
      null, 0, 'offer', [], {},
      { verb: 'shop_buy', offer: 'equip.iron_sword', qty: 5, price: 1, gold: 1e12, unit: 0 },
      { qty: '5' }, { qty: 0 }, { qty: -1 }, { qty: 1.5 }, { qty: 1e999 }, { qty: NaN },
      { qty: req.MAX_QTY + 1 }, { qty: Number.MAX_SAFE_INTEGER },
      { qty: { valueOf: () => 5 } }, { qty: [5] },
      { offer: 'constructor' }, { offer: '__proto__' }, { offer: 'a'.repeat(200) },
      { offer: 'EQUIP.IRON_SWORD' }, { offer: "equip.x'; drop table player_state; --" },
      { item: 'constructor' }, { item: '__proto__' }, { item: 'normal_log; drop table x' },
      JSON.parse('{"__proto__":{"qty":9999},"offer":"equip.iron_sword"}'),
    ];
    for (const b of hostile) {
      const r = req.parseIntent(b);
      ok(Object.getPrototypeOf(r) === null, 'G2: parseIntent returned an object with a prototype');
      const keys = Object.keys(r).sort().join(',');
      ok(keys === [...req.INTENT_KEYS].sort().join(','),
        `G2: parseIntent returned [${keys}] — the contract is [${req.INTENT_KEYS}]`);
      ok(r.offer === null || req.OFFER_ID_RE.test(r.offer), `G2: offer '${r.offer}' escaped its shape`);
      ok(r.item === null || req.CATALOGUE_ID_RE.test(r.item), `G2: item '${r.item}' escaped its shape`);
      ok(r.qty === null || (Number.isSafeInteger(r.qty) && r.qty >= 1 && r.qty <= req.MAX_QTY),
        `G2: qty '${r.qty}' escaped [1, ${req.MAX_QTY}] — it MULTIPLIES a value transfer`);
      for (const forbidden of ['price', 'cost', 'gold', 'unit', 'total']) {
        ok(!(forbidden in r),
          `G2: parseIntent surfaced a '${forbidden}' field. The client may name a thing and a `
          + 'count; the moment it can name a VALUE the economy is forgeable from devtools again.');
      }
    }
    ok(({}).qty === undefined, 'G2: Object.prototype was polluted');

    /* ── AN UNREADABLE COUNT IS `null`, NEVER A GUESS. ─────────────────────
       The loop above only asserts that whatever comes back is IN RANGE, and
       a silent default of 1 is in range — so this is stated separately and by
       value. A server that guesses a quantity has authored a number the player
       did not ask for, in the one field that multiplies a value transfer, and
       it is wrong in both directions: default-to-1 sells one item when they
       meant a hundred, `Number("1e3")` sells a thousand when they typed
       nonsense. `bad_qty` costs one round trip; a guess costs their stock. */
    for (const b of [{}, { qty: null }, { qty: '5' }, { qty: ' 5 ' }, { qty: '1e3' }, { qty: 1.5 },
      { qty: 0 }, { qty: -1 }, { qty: true }, { qty: [5] }, { qty: { valueOf: () => 5 } },
      { qty: Infinity }, { qty: NaN }, { qty: req.MAX_QTY + 1 }]) {
      ok(req.parseIntent(b).qty === null,
        `G2: qty ${JSON.stringify(b.qty)} parsed to ${req.parseIntent(b).qty} instead of null — the `
        + 'server GUESSED a count. It must be refused by name (bad_qty), never replaced.');
    }
    ok(req.parseIntent({ qty: 1 }).qty === 1 && req.parseIntent({ qty: req.MAX_QTY }).qty === req.MAX_QTY,
      'G2-CONTROL: a legitimate count was rejected, so "always null" would pass the loop above');
    /* CONTROL — a legitimate request survives intact, so none of the above is
       "always null". */
    const good = req.parseIntent({
      slot: 2, verb: 'shop_buy', intentId: '11111111-2222-4333-8444-555555555555',
      offer: 'equip.iron_sword', qty: 5,
    });
    ok(good.verb === 'shop_buy' && good.offer === 'equip.iron_sword' && good.qty === 5 && good.slot === 2,
      `G2-CONTROL: a legitimate request was mangled: ${JSON.stringify(good)}`);
    const good2 = req.parseIntent({ verb: 'vendor_sell', item: 'normal_log', qty: 1 });
    ok(good2.verb === 'vendor_sell' && good2.item === 'normal_log' && good2.qty === 1,
      `G2-CONTROL: a legitimate sale was mangled: ${JSON.stringify(good2)}`);
    ok(req.VERBS.includes('shop_buy') && req.VERBS.includes('vendor_sell'),
      'G2: the new verbs are not in the parser allowlist — index.ts would answer unknown_verb');
  }

  // ── G3. NO CHARACTER, then the happy path ────────────────────────────────
  {
    const r = await doBuy({ intentId: uuid(), offer: 'equip.iron_sword', qty: 1 });
    ok(r.status === 409 && r.body.error === 'no_character',
      `G3: an empty slot returned ${r.status} ${JSON.stringify(r.body)}`);
    ok(r.body.verb === 'shop_buy', 'G3: the refusal does not name its verb');
  }
  {
    const made = (await db.query('select public.__b351_create($1,0) as v', [UID])).rows[0].v;
    ok(made.ok === true && made.created === true, `G3b: hr_create_character returned ${JSON.stringify(made)}`);
    await grant({ gold: 100000, journal: { kind: 'admin', intent: 'fixture:seed' } });
  }

  const OFFER = 'equip.iron_sword';
  let unitGold;
  {
    unitGold = cat.GOLD_OFFERS[OFFER].gold;
    ok(unitGold > 0, `G3-CONTROL: ${OFFER} is not in GOLD_OFFERS — this whole group has no subject`);
    const before = await state(db, UID);
    const beforeLedger = (await ledger(db, UID)).length;

    const r = await doBuy({ intentId: uuid(), offer: OFFER, qty: 5 });
    ok(r.status === 200 && r.body.ok === true,
      `G3: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);

    const st = await state(db, UID);
    ok(Number(before.gold) - Number(st.gold) === unitGold * 5,
      `G3: five swords at ${unitGold} cost ${Number(before.gold) - Number(st.gold)} gold`);
    ok(await invOf(db, UID, 'iron_sword') === 5,
      `G3: the bag holds ${await invOf(db, UID, 'iron_sword')} iron_sword, expected 5`);
    ok(Number(st.version) === Number(before.version) + 1,
      `G3: version ${before.version} → ${st.version}, expected exactly one bump`);

    /* THE ENVELOPE IS THE SERVER'S. Gold is read out of `state`, not echoed. */
    ok(Number(r.body.state.gold) === Number(st.gold),
      `G3: the body reports gold ${r.body.state.gold} and the row holds ${st.gold}`);
    ok(r.body.receipt && r.body.receipt.gold === -(unitGold * 5) && r.body.receipt.qty === 5,
      `G3: the receipt reads ${JSON.stringify(r.body.receipt)} — it must state what the SERVER `
      + 'charged, with the sign the delta carried');
    ok(r.body.receipt.items.iron_sword === 5, 'G3: the receipt does not state what was delivered');

    const rows = (await ledger(db, UID)).slice(beforeLedger);
    ok(rows.length === 1, `G3: ${rows.length} ledger rows for one purchase, expected 1`);
    ok(rows[0].kind === 'shop', `G3: journalled as kind '${rows[0].kind}', expected shop`);
    ok(rows[0].intent === `shop_buy:${OFFER}:5`,
      `G3: journal.intent is '${rows[0].intent}' — it must name the verb, the OFFER and the COUNT, `
      + 'or one key reused for two different purchases is a silent no-op instead of intent_mismatch');
    ok(Number(rows[0].gold_in) === 0,
      `G3: a purchase stamped gold_in=${rows[0].gold_in} — a SPEND must not charge the daily `
      + 'gross-inflow budget, or a player could lock themselves out of the economy by shopping');
    ok(rows[0].meta && Number(rows[0].meta.unit_gold) === unitGold,
      `G3: the ledger does not record the unit price the server charged (${JSON.stringify(rows[0].meta)})`);
  }

  // ── G4. ⚠ A PURCHASE DOES NOT CONFISCATE THE NIGHT ───────────────────────
  // The invariant `collectsFirst: false` rests on. hr_apply stamps
  // `accrued_to = now()` on any delta carrying activity/equip/accrued_to; a gold
  // verb carries none, so an unpaid window survives a shopping trip untouched.
  {
    await clearGate();
    await db.query(
      `update public.player_state
          set active_kind = 'combat', active_id = 'goblin',
              accrued_to = now() - interval '3 hours', active_since = now() - interval '3 hours'
        where user_id = $1 and slot = 0`, [UID]);
    const before = await state(db, UID);

    const r = await doBuy({ intentId: uuid(), offer: OFFER, qty: 1 });
    ok(r.body.ok === true, `G4-CONTROL: the purchase failed: ${JSON.stringify(r.body).slice(0, 200)}`);
    const after = await state(db, UID);
    ok(new Date(after.accrued_to).getTime() === new Date(before.accrued_to).getTime(),
      'G4: BUYING A SWORD CONFISCATED THREE HOURS OF UNPAID COMBAT. hr_apply stamps accrued_to on '
      + 'any delta carrying activity/equip/accrued_to; a gold verb must carry none of them, which '
      + 'is what makes collectsFirst:false correct rather than convenient.');
    ok(after.active_kind === before.active_kind && after.active_id === before.active_id,
      `G4: the purchase moved the activity pointer (${before.active_id} → ${after.active_id})`);
    ok(new Date(after.active_since).getTime() === new Date(before.active_since).getTime(),
      'G4: the purchase moved active_since — the second watermark');

    const sr = await doSell({ intentId: uuid(), item: 'iron_sword', qty: 1 });
    ok(sr.body.ok === true, `G4-CONTROL: the sale failed: ${JSON.stringify(sr.body).slice(0, 200)}`);
    const after2 = await state(db, UID);
    ok(new Date(after2.accrued_to).getTime() === new Date(before.accrued_to).getTime(),
      'G4: SELLING confiscated the unpaid window');

    /* AND THE RULE IS A FUNCTION, NOT A HABIT. Every stamping key, refused for a
       non-collecting verb; and the ONE that collects is exempt. */
    for (const k of it.STAMP_KEYS) {
      const bad = { gold: -1, [k]: 'x', journal: { kind: 'shop', intent: 'probe' } };
      const g = it.guardStampKeys('shop_buy', bad);
      ok(g && g.error === 'delta_would_stamp' && g.keys.includes(k),
        `G4: guardStampKeys let a non-collecting verb propose a delta carrying '${k}' — that key `
        + 'closes the accrual window, so every caller would silently lose their elapsed time');
      ok(it.guardStampKeys('set_activity', bad) === null,
        `G4-CONTROL: guardStampKeys refused '${k}' for set_activity, which DOES collect first — the `
        + 'rule would then block the one verb it was written around');
    }
    ok(it.guardStampKeys('shop_buy', { gold: -1 }) === null,
      'G4-CONTROL: guardStampKeys refused an ordinary spend — every purchase would fail');
    ok(it.stampKeysIn(JSON.parse('{"__proto__":{"equip":1}}')).length === 0,
      'G4: stampKeysIn reported an inherited key');

    /* AND IT REFUSES THE CALL, not just the unit test. A verb whose delta grew a
       stamping key must be stopped BEFORE hr_apply, with the window intact. */
    const st0 = await state(db, UID);
    const forced = await sp.runValueIntent({
      exec, user: UID, slot: 0, verb: 'shop_buy', intentId: uuid(),
      plan: {
        delta: { gold: -1, accrued_to: 'now', journal: { kind: 'shop', intent: 'probe:stamp' } },
        receipt: null,
      },
    });
    ok(forced.status === 409 && forced.body.error === 'delta_would_stamp',
      `G4: a planted stamping delta returned ${JSON.stringify(forced.body).slice(0, 200)}`);
    const st1 = await state(db, UID);
    ok(new Date(st1.accrued_to).getTime() === new Date(st0.accrued_to).getTime()
      && Number(st1.version) === Number(st0.version),
      'G4: the refused stamping delta still moved the state');
    ok(forced.body.state && forced.body.state.active_kind,
      'G4: the delta_would_stamp refusal carries no envelope (C2)');
  }

  // ── G5. A REPLAYED SPEND MOVES NOTHING, AND ITS RECEIPT IS NULL ──────────
  {
    await clearGate();
    const key = uuid();
    const first = await doBuy({ intentId: key, offer: OFFER, qty: 2 });
    ok(first.body.ok === true, `G5: the first call failed: ${JSON.stringify(first.body).slice(0, 200)}`);
    ok(first.body.receipt && first.body.receipt.qty === 2, 'G5-CONTROL: the first call reported no receipt');
    const mid = await state(db, UID);
    const midLedger = (await ledger(db, UID)).length;
    const midStock = await invOf(db, UID, 'iron_sword');

    const again = await doBuy({ intentId: key, offer: OFFER, qty: 2 });
    ok(again.body.ok === true, `G5: the replay was not ok:true: ${JSON.stringify(again.body).slice(0, 200)}`);
    ok(again.body.replayed === true, 'G5: the replay was not reported as a replay');
    const after = await state(db, UID);
    ok(Number(after.gold) === Number(mid.gold),
      `G5: THE REPLAY CHARGED AGAIN (${mid.gold} → ${after.gold}) — a dropped socket would cost the `
      + 'player twice, which is the entire reason an idempotency key exists');
    ok(await invOf(db, UID, 'iron_sword') === midStock, 'G5: the replay delivered a second time');
    ok(Number(after.version) === Number(mid.version), 'G5: the replay bumped version');
    ok((await ledger(db, UID)).length === midLedger, 'G5: the replay wrote a ledger row');
    ok(again.body.receipt === null,
      `G5: the replay reported receipt ${JSON.stringify(again.body.receipt)} for a transfer THIS `
      + 'invocation did not make. The receipt describes the apply; on a replay the apply was '
      + 'somebody else\'s. (Note this is the OPPOSITE of set_activity\'s `collected`, which '
      + 'describes a SEPARATE apply that did land — see spend.js.)');
    ok(Number(again.body.state.gold) === Number(after.gold),
      'G5: the replay envelope does not carry current state');
  }

  // ── G6. ONE KEY MEANS ONE PURCHASE ──────────────────────────────────────
  {
    await clearGate();
    const key = uuid();
    const first = await doBuy({ intentId: key, offer: OFFER, qty: 1 });
    ok(first.body.ok === true, `G6-CONTROL: the control call failed: ${JSON.stringify(first.body).slice(0, 200)}`);
    const mid = await state(db, UID);

    const otherQty = await doBuy({ intentId: key, offer: OFFER, qty: 5 });
    ok(otherQty.body.ok === false && otherQty.body.error === 'intent_mismatch',
      `G6: the SAME key with a different COUNT returned ${JSON.stringify(otherQty.body).slice(0, 200)} `
      + '— expected intent_mismatch. A silent replay here charges for one sword while the client '
      + 'believes it bought five.');
    const otherOffer = await doBuy({ intentId: key, offer: 'equip.bronze_sword', qty: 1 });
    ok(otherOffer.body.ok === false && otherOffer.body.error === 'intent_mismatch',
      `G6: the SAME key on a different OFFER returned ${JSON.stringify(otherOffer.body).slice(0, 200)}`);
    const crossVerb = await doSell({ intentId: key, item: 'iron_sword', qty: 1 });
    ok(crossVerb.body.ok === false && crossVerb.body.error === 'intent_mismatch',
      `G6: the SAME key across VERBS returned ${JSON.stringify(crossVerb.body).slice(0, 200)} — a buy `
      + 'key reused for a sale must not hand back the buy\'s decision');
    const after = await state(db, UID);
    ok(Number(after.gold) === Number(mid.gold) && Number(after.version) === Number(mid.version),
      'G6: one of the mismatched calls applied something');

    /* AND THE NAME IS WHAT MAKES IT FIRE. Two spellings of one rule would be two
       rules, so the general namer is asserted against the activity one. */
    ok(it.intentNameOf('set_activity', 'combat', 'goblin') === it.intentNameFor('set_activity', 'combat', 'goblin'),
      'G6: intentNameOf and intentNameFor disagree on the activity shape — two namers producing '
      + 'different strings is how hr_apply\'s comparison stops meaning one thing');
    ok(it.intentNameOf('shop_buy', 'equip.iron_sword', 5) === 'shop_buy:equip.iron_sword:5',
      `G6: intentNameOf produced '${it.intentNameOf('shop_buy', 'equip.iron_sword', 5)}'`);
    ok(it.intentNameOf('shop_buy', 'x', 1) !== it.intentNameOf('shop_buy', 'x', 2),
      'G6: the intent name does not distinguish two different counts');
  }

  // ── G7. BUYING WITHOUT THE GOLD ─────────────────────────────────────────
  // The refusal is hr_apply's, computed under the lock after `select … for
  // update`. shop-buy.js deliberately never pre-decides it.
  {
    await clearGate();
    const st = await state(db, UID);
    const afford = Math.floor(Number(st.gold) / unitGold);
    ok(afford >= 0 && afford < req.MAX_QTY,
      `G7-CONTROL: the probe can afford ${afford} swords, which is outside the count this verb can `
      + 'name — the overspend below would be refused as bad_qty instead');
    const r = await doBuy({ intentId: uuid(), offer: OFFER, qty: afford + 1 });
    ok(r.status === 409 && r.body.error === 'insufficient_gold',
      `G7: overspending returned ${JSON.stringify(r.body).slice(0, 250)} — expected insufficient_gold`);
    ok(r.body.stage === 'apply', `G7: the refusal does not name its stage (${r.body.stage})`);
    ok(r.body.detail && Number(r.body.detail.have) === Number(st.gold),
      `G7: the refusal does not say what they HAVE (${JSON.stringify(r.body.detail)})`);
    const after = await state(db, UID);
    ok(Number(after.gold) === Number(st.gold) && Number(after.version) === Number(st.version),
      `G7: the refused purchase still moved state (gold ${st.gold} → ${after.gold})`);
    ok(await invOf(db, UID, 'iron_sword') > 0, 'G7-CONTROL: the bag is empty, so nothing was delivered ever');
    /* C2 — a refusal that reached the database carries the envelope. */
    ok(r.body.state && typeof r.body.state === 'object' && Number.isFinite(Number(r.body.version)),
      'G7: the insufficient_gold refusal carries no state envelope, so the client cannot reconcile '
      + 'the balance it optimistically decremented to anything but its own guess');
    ok(r.body.ok === false, 'G7: the envelope spread overwrote ok — a refusal claiming success');
  }

  // ── G8. UNKNOWN vs UNSUPPORTED, AND NEITHER COSTS A ROUND TRIP ──────────
  {
    await clearGate();
    const probe = async (fn, args) => {
      let stmts = 0;
      const counting = makeExec(db, { before: async () => { stmts++; } });
      const r = await fn({ exec: counting, user: UID, slot: 0, intentId: uuid(), ...args });
      return { stmts, body: r.body, status: r.status };
    };

    const unknown = await probe(buy.runShopBuy, { offer: 'equip.not_a_thing', qty: 1 });
    ok(unknown.body.error === 'unknown_offer' && unknown.stmts === 0,
      `G8: an unknown offer returned ${JSON.stringify(unknown.body).slice(0, 160)} after `
      + `${unknown.stmts} statement(s)`);

    /* A REAL offer this build cannot sell must be named, with the reason. */
    const unsupportedId = Object.keys(cat.OFFER_REFUSALS)[0];
    const unsupported = await probe(buy.runShopBuy, { offer: unsupportedId, qty: 1 });
    ok(unsupported.body.error === 'offer_unsupported' && unsupported.stmts === 0,
      `G8: the authored offer '${unsupportedId}' returned ${JSON.stringify(unsupported.body).slice(0, 200)}`);
    ok(unsupported.body.reason === cat.OFFER_REFUSALS[unsupportedId],
      `G8: the refusal does not carry WHY (${JSON.stringify(unsupported.body)}). A player told "no `
      + 'such offer" about a real subscription files a bug against the wrong system.');

    /* ── C6. PROTOTYPE NAMES. `GOLD_OFFERS['constructor']` on a plain object is
       the Object constructor, whose `.gold` is undefined — `-(undefined * qty)`
       is NaN and a NaN gold delta is a purchase the player does not pay for.
       The measurement is the STATEMENT COUNT: a prototype name that reaches the
       database has walked past the guard. A genuinely unknown name is the
       control — it must cost the same nothing. */
    for (const bad of ['constructor', '__proto__', 'toString', 'valueOf']) {
      const asOffer = await probe(buy.runShopBuy, { offer: `equip.${bad}`, qty: 1 });
      ok(asOffer.body.ok !== true && asOffer.stmts === 0,
        `G8: offer 'equip.${bad}' returned ${JSON.stringify(asOffer.body).slice(0, 160)} after `
        + `${asOffer.stmts} statement(s)`);
      const bare = await probe(buy.runShopBuy, { offer: bad, qty: 1 });
      ok(bare.body.ok !== true,
        `G8: the bare prototype name '${bad}' was accepted as an offer: `
        + JSON.stringify(bare.body).slice(0, 160));
      const asItem = await probe(sell.runVendorSell, { item: bad, qty: 1 });
      ok(asItem.body.error === 'unknown_item' && asItem.stmts === 0,
        `G8: selling '${bad}' returned ${JSON.stringify(asItem.body).slice(0, 160)} after `
        + `${asItem.stmts} statement(s). ITEMS['${bad}'] is truthy, so a truthiness guard admits `
        + 'it — today a wasted round trip, and a free sale the day the ordering changes.');
    }
    const control = await probe(sell.runVendorSell, { item: 'not_an_item_at_all', qty: 1 });
    ok(control.body.error === 'unknown_item' && control.stmts === 0,
      `G8-CONTROL: a genuinely unknown item issued ${control.stmts} statement(s) — the count is not `
      + 'discriminating');

    /* ── SOURCE: EVERY CATALOGUE LOOKUP GOES THROUGH `catalogueGet`. ────────
       The behavioural probes above pass today whether or not this holds, because
       the catalogues are null-prototype — two independent defences, and a
       defence whose removal changes nothing is a defence that rots. This is the
       half only a source assertion can see, and its justification is identical
       to G13's literal-bucket scan. `offers_plain_object` covers the other
       half behaviourally, so neither is "covered by the other one". */
    for (const [file, cats] of [['shop-buy.js', ['GOLD_OFFERS', 'OFFER_REFUSALS']],
      ['vendor-sell.js', ['ITEMS']], ['catalogue.js', ['ITEMS']]]) {
      const s = (await readFile(join(fnDir, file), 'utf8'))
        .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      for (const c of cats) {
        const raw = new RegExp(`${c}\\s*\\[`).test(s);
        ok(!raw,
          `G8: ${file} indexes ${c} directly (\`${c}[…]\`) instead of going through catalogueGet. `
          + 'The id shapes admit `constructor` and `__proto__`; that is harmless only while the '
          + 'catalogue is null-prototype, and a free purchase the day somebody writes '
          + '`const x = {}` in catalogue.js. Two defences, both required.');
      }
      ok(/catalogueGet\(/.test(s),
        `G8: ${file} never calls catalogueGet — its catalogue lookups are unguarded`);
    }

    /* The pure resolvers, directly, on the same shapes. */
    ok(buy.resolveOffer('constructor').ok === false, 'G8: resolveOffer admitted `constructor`');
    ok(buy.resolveOffer(null).error === 'bad_offer', 'G8: resolveOffer did not name a null offer');
    ok(sell.resolveSale('__proto__').error === 'unknown_item', 'G8: resolveSale admitted `__proto__`');
    ok(buy.resolveOffer(OFFER).ok === true, 'G8-CONTROL: resolveOffer refuses a real offer');
    ok(sell.resolveSale('normal_log').ok === true, 'G8-CONTROL: resolveSale refuses a real item');
  }

  // ── G9. SELLING ─────────────────────────────────────────────────────────
  {
    await clearGate();
    await grant({ items: { normal_log: 500 }, journal: { kind: 'admin', intent: 'fixture:stock' } });
    const { ITEMS } = await import('../src/data/items.js');
    const unit = cat.vendorPriceOf(ITEMS, 'normal_log');
    ok(unit > 0, 'G9-CONTROL: normal_log is not sellable, so this group has no subject');

    const before = await state(db, UID);
    const beforeLedger = (await ledger(db, UID)).length;
    const r = await doSell({ intentId: uuid(), item: 'normal_log', qty: 10 });
    ok(r.status === 200 && r.body.ok === true, `G9: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);

    const st = await state(db, UID);
    ok(Number(st.gold) - Number(before.gold) === unit * 10,
      `G9: ten logs at ${unit} paid ${Number(st.gold) - Number(before.gold)} gold`);
    ok(await invOf(db, UID, 'normal_log') === 490,
      `G9: the bag holds ${await invOf(db, UID, 'normal_log')} logs, expected 490`);
    ok(r.body.receipt && r.body.receipt.unit_gold === unit && r.body.receipt.gold === unit * 10,
      `G9: the receipt reads ${JSON.stringify(r.body.receipt)} — the client has no copy of the bid `
      + 'and renders this rather than computing it');

    const rows = (await ledger(db, UID)).slice(beforeLedger);
    ok(rows.length === 1, `G9: ${rows.length} ledger rows for one sale, expected 1`);
    ok(rows[0].intent === 'vendor_sell:normal_log:10',
      `G9: journalled as '${rows[0].intent}'`);
    ok(Number(rows[0].gold_in) === unit * 10,
      `G9: the sale stamped gold_in=${rows[0].gold_in} but minted ${unit * 10}. THIS IS THE FIRST `
      + 'CLIENT-REACHABLE GOLD MINT IN THE PROGRAM; the 25,000,000/day gross-inflow ceiling is its '
      + 'only fuse above the per-call clamp, and it sums exactly this column.');
  }

  // ── G10. SELLING WHAT YOU DO NOT HAVE ───────────────────────────────────
  {
    await clearGate();
    const before = await state(db, UID);
    const held = await invOf(db, UID, 'normal_log');
    const r = await doSell({ intentId: uuid(), item: 'normal_log', qty: held + 10 });
    ok(r.status === 409 && r.body.error === 'insufficient_item',
      `G10: selling ${held + 10} of ${held} logs returned ${JSON.stringify(r.body).slice(0, 250)} — `
      + 'expected insufficient_item. Anything else is a gold mint.');
    ok(r.body.detail && Number(r.body.detail.have) === held,
      `G10: the refusal does not say what they HAVE (${JSON.stringify(r.body.detail)})`);
    const after = await state(db, UID);
    ok(Number(after.gold) === Number(before.gold),
      `G10: the refused sale MINTED ${Number(after.gold) - Number(before.gold)} gold`);
    ok(await invOf(db, UID, 'normal_log') === held, 'G10: the refused sale still removed stock');

    /* An item the player has never owned at all — the same answer, from the same
       authority, with a zero `have`. */
    const never = await doSell({ intentId: uuid(), item: 'dragon_bones', qty: 1 });
    ok(never.body.error === 'insufficient_item' && Number(never.body.detail.have) === 0,
      `G10: selling an item never owned returned ${JSON.stringify(never.body).slice(0, 200)}`);

    /* A real item the vendor does not buy, refused BY NAME and before the gate. */
    const { ITEMS } = await import('../src/data/items.js');
    const worthless = Object.keys(ITEMS).find((id) => cat.vendorPriceOf(ITEMS, id) === 0);
    ok(!!worthless,
      'G10-CONTROL: every item has a vendor bid, so the item_not_sellable branch is unreachable and '
      + 'the assertion below would be vacuous');
    const ns = await doSell({ intentId: uuid(), item: worthless, qty: 1 });
    ok(ns.status === 409 && ns.body.error === 'item_not_sellable',
      `G10: '${worthless}' (vendor bid 0) returned ${JSON.stringify(ns.body).slice(0, 200)} — it is a `
      + 'REAL item, and "unknown_item" would tell the player their quest key does not exist');
  }

  // ── G11. THE SHAPE CHECKS COST NO RATE BUDGET ───────────────────────────
  {
    const n0 = Number((await db.query(
      'select count(*) as n from public.hr_rate_counters where user_id = $1', [UID2])).rows[0].n);
    const bad = [
      { fn: buy.runShopBuy, args: { intentId: null, offer: OFFER, qty: 1 }, want: 'missing_intent_id' },
      { fn: buy.runShopBuy, args: { intentId: uuid(), offer: OFFER, qty: null }, want: 'bad_qty' },
      { fn: buy.runShopBuy, args: { intentId: uuid(), offer: OFFER, qty: 0 }, want: 'bad_qty' },
      { fn: buy.runShopBuy, args: { intentId: uuid(), offer: null, qty: 1 }, want: 'bad_offer' },
      { fn: sell.runVendorSell, args: { intentId: uuid(), item: null, qty: 1 }, want: 'bad_item' },
      { fn: sell.runVendorSell, args: { intentId: null, item: 'normal_log', qty: 1 }, want: 'missing_intent_id' },
      { fn: sell.runVendorSell, args: { intentId: uuid(), item: 'normal_log', qty: -5 }, want: 'bad_qty' },
    ];
    for (const b of bad) {
      const r = await b.fn({ exec, user: UID2, slot: 0, ...b.args });
      ok(r.status === 400 && r.body.error === b.want,
        `G11: expected ${b.want}, got ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      ok(!r.body.state,
        `G11: a SHAPE refusal (${b.want}) carried a state envelope — reading one is the database `
        + 'work the shape check exists to avoid');
    }
    const n1 = Number((await db.query(
      'select count(*) as n from public.hr_rate_counters where user_id = $1', [UID2])).rows[0].n);
    ok(n1 === n0,
      'G11: a malformed request spent rate budget — the shape check must precede the gate, or a '
      + 'broken client can exhaust a real player\'s allowance by looping on garbage');
  }

  // ── G12. THE RATE GATE, AND ITS BUCKET ──────────────────────────────────
  {
    await clearGate();
    let limited = 0; let allowed = 0;
    for (let i = 0; i < 40; i++) {
      const r = await doBuy({ intentId: uuid(), offer: OFFER, qty: 1 });
      if (r.status === 429) limited++; else allowed++;
    }
    ok(limited > 0, `G12: 40 calls in a minute produced ${limited} refusals — the gate is not applied`);
    ok(allowed > 0, 'G12-CONTROL: every call was refused, so the limit is not what is being measured');
    const spent = (await db.query(
      'select distinct bucket from public.hr_rate_counters where user_id = $1', [UID])).rows
      .map((x) => x.bucket);
    ok(spent.includes(it.rateBucketFor('shop_buy')),
      `G12: the call spent [${spent}] but the registry names '${it.rateBucketFor('shop_buy')}'. The `
      + 'registry does not describe the code, which means it describes nothing.');
    ok(!spent.includes('accrue') && !spent.includes('activity'),
      `G12: a shop call spent [${spent}] — a shopping spree must not exhaust the budget that pays `
      + 'the player\'s night');
    /* The two gold verbs SHARE one bucket, deliberately (intents.js). Asserted so
       a later split is a decision rather than a drift. */
    ok(it.rateBucketFor('shop_buy') === it.rateBucketFor('vendor_sell'),
      'G12: the two gold verbs no longer share a rate bucket — that is a real change to the '
      + 'contract, not a refactor; state it in the registry comment and in the migration');
    await clearGate();
  }

  // ── G13. THE REGISTRY IS READ, NOT DECORATION (review C4) ───────────────
  {
    await clearGate();
    const verbs = [...req.VERBS].sort().join(',');
    const rows = Object.keys(it.INTENT_REGISTRY).sort().join(',');
    ok(verbs === rows,
      `G13: request.js accepts [${verbs}] but the registry describes [${rows}]. A verb the parser `
      + 'admits and the registry does not describe has no rate bucket, no key rule and no collect '
      + 'rule.');
    for (const v of Object.keys(it.INTENT_REGISTRY)) {
      for (const f of it.REGISTRY_FIELDS) {
        ok(Object.prototype.hasOwnProperty.call(it.INTENT_REGISTRY[v], f),
          `G13: registry row '${v}' has no '${f}'`);
      }
    }
    ok(it.requiresKey('shop_buy') && it.requiresKey('vendor_sell'),
      'G13: a VALUE TRANSFER is registered as not needing an idempotency key');

    /* `collectsFirst` is READ, and it FAILS CLOSED. Under the mutation that
       flips it to true, this call must be refused rather than proceeding. */
    ok(it.collectsFirst('shop_buy') === false,
      'G13-CONTROL: the registry says shop_buy collects first, so every purchase in this run took '
      + 'the refusal path and the happy-path groups above measured nothing');

    /* THE FAIL-CLOSED READ, PROVEN DIRECTLY. `set_activity` is the one verb whose
       registry row says collectsFirst — and it implements its own collect, so it
       never comes through here. Driving the shared runner WITH that verb is the
       cheapest honest way to show what happens when a registry row and an
       implementation disagree: a refusal, before the apply, with the window
       intact. The alternative — inferring it from a mutation that flips the
       shop_buy row — proves the same thing one step further away. */
    const st0 = await state(db, UID);
    const forced = await sp.runValueIntent({
      exec, user: UID, slot: 0, verb: 'set_activity', intentId: uuid(),
      plan: { delta: { gold: -1, journal: { kind: 'shop', intent: 'probe:collect' } }, receipt: null },
    });
    ok(forced.status === 409 && forced.body.error === 'collect_required',
      `G13: the shared runner PROCEEDED for a verb the registry says collects first `
      + `(${JSON.stringify(forced.body).slice(0, 200)}). It implements no collect, so proceeding `
      + 'confiscates the elapsed window — the registry must be read, and the read must fail closed.');
    ok(Number((await state(db, UID)).version) === Number(st0.version),
      'G13: the collect_required refusal still applied something');
    ok(forced.body.state, 'G13: the collect_required refusal carries no envelope (C2)');

    /* SOURCE: no bucket LITERAL at the gate call site. Behaviourally identical
       today, so only this can see it — which is the whole point. Read from the
       source that RAN (fnDir), not from the repo. */
    const src = (await readFile(join(fnDir, 'spend.js'), 'utf8'))
      .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const at = src.indexOf('exec(READ_SQL');
    ok(at >= 0, 'G13-CONTROL: no READ_SQL call site in spend.js — the scan is blind');
    const args = src.slice(at, src.indexOf(')', src.indexOf('[', at))).replace(/rateBucketFor\([^)]*\)/g, 'REGISTRY');
    ok(!/['"]/.test(args),
      `G13: spend.js names a rate bucket as a LITERAL at the gate (${args.trim().slice(0, 120)}). `
      + 'A literal at a call site is a second registry.');
    ok(/rateBucketFor\(/.test(src),
      'G13: spend.js gates without ever calling rateBucketFor — the value it passes came from '
      + 'somewhere other than the registry');
    ok(/collectsFirst\(/.test(src) && /requiresKey\(/.test(src),
      'G13: spend.js never reads collectsFirst/requiresKey — those columns are decoration, and '
      + 'intent #4 could declare anything with every guard still green');
  }

  // ── G14. THE ERROR TAXONOMY AGREES WITH THE WIRE ────────────────────────
  {
    for (const e of ['bad_offer', 'bad_qty', 'unknown_offer', 'offer_unsupported',
      'bad_item', 'unknown_item', 'item_not_sellable', 'rate_limited', 'no_character']) {
      ok(it.refusalCarriesState(e) === false,
        `G14: refusalCarriesState('${e}') says the envelope is mandatory, but it is answered before `
        + 'any database work — the code and the contract disagree');
    }
    for (const e of ['insufficient_gold', 'insufficient_item', 'version_conflict',
      'intent_mismatch', 'daily_budget', 'delta_would_stamp', 'collect_required']) {
      ok(it.refusalCarriesState(e) === true,
        `G14: refusalCarriesState('${e}') exempts a refusal that REACHED the database`);
    }
    /* Every code these two verbs produce themselves must be in the taxonomy, so
       a hand-typed string at a call site cannot invent one. */
    for (const f of ['shop-buy.js', 'vendor-sell.js', 'spend.js']) {
      const s = (await readFile(join(fnDir, f), 'utf8')).replace(/\r\n/g, '\n');
      const bare = [...s.matchAll(/error:\s*'([a-z_]+)'/g)].map((m) => m[1]);
      ok(bare.length === 0,
        `G14: ${f} produces a bare error literal (${bare.join(', ')}) instead of naming an `
        + 'INTENT_ERRORS member — a code nothing else knows about is a code the client cannot handle');
    }
  }

  // ── G15. THE CLAMP HEADROOM, DERIVED FROM BOTH SIDES ────────────────────
  // MAX_QTY is a number in request.js and the per-call gold clamp is a number in
  // apply-engine.sql. Neither is restated here; both are READ, and the product
  // is compared. A guard that hard-codes either is asserting about a system it
  // imagined.
  {
    const sql = (await readFile(MIG('2026-08-11-apply-engine.sql'), 'utf8')).replace(/\r\n/g, '\n');
    const m = /c_max_gold_delta\s+constant\s+bigint\s*:=\s*(\d+)/.exec(sql);
    ok(!!m, 'G15-CONTROL: could not read c_max_gold_delta out of apply-engine.sql — the scan is blind');
    const clamp = Number(m[1]);
    const dearest = Math.max(...Object.values(cat.GOLD_OFFERS).map((o) => o.gold));
    ok(dearest * req.MAX_QTY <= clamp,
      `G15: ${req.MAX_QTY} x the dearest gold offer (${dearest}) is ${dearest * req.MAX_QTY}, above `
      + `hr_apply's per-call gold clamp of ${clamp}. A legal request would then be refused as `
      + 'gold_clamp — a diagnosis about an insane delta, applied to an ordinary purchase. Lower '
      + 'MAX_QTY or raise the clamp deliberately.');

    /* THE SELL SIDE HAS NO SUCH HEADROOM, AND THAT IS STATED RATHER THAN HIDDEN.
       1,000 x the dearest item is far above the clamp, so the pathological sale
       must be refused BY NAME and apply nothing. Measured, not reasoned. */
    const { ITEMS } = await import('../src/data/items.js');
    const dear = Object.keys(ITEMS)
      .sort((a, b) => cat.vendorPriceOf(ITEMS, b) - cat.vendorPriceOf(ITEMS, a))[0];
    const dearUnit = cat.vendorPriceOf(ITEMS, dear);
    ok(dearUnit * req.MAX_QTY > clamp,
      `G15-CONTROL: ${req.MAX_QTY} x ${dear} (${dearUnit}) is inside the clamp, so the refusal below `
      + 'is not the one this assertion claims to measure');
    await clearGate();
    await grant({ items: { [dear]: 1000 }, journal: { kind: 'admin', intent: 'fixture:dear' } });
    const before = await state(db, UID);
    const r = await doSell({ intentId: uuid(), item: dear, qty: req.MAX_QTY });
    ok(r.body.ok !== true && typeof r.body.error === 'string',
      `G15: a ${(dearUnit * req.MAX_QTY).toLocaleString()}-gold sale was ACCEPTED — it is above both `
      + `the ${clamp.toLocaleString()} per-call clamp and the 25,000,000 daily ceiling`);
    ok(['gold_clamp', 'daily_budget'].includes(r.body.error),
      `G15: the oversized sale was refused as '${r.body.error}' — expected the clamp or the daily `
      + 'budget, both of which are named machine codes the client can act on');
    const after = await state(db, UID);
    ok(Number(after.gold) === Number(before.gold),
      `G15: the refused sale still minted ${Number(after.gold) - Number(before.gold)} gold`);
    ok(await invOf(db, UID, dear) === 1000, 'G15: the refused sale still took the stock');
  }

  // ── G16. THE ITEM CATALOGUE THE SERVER VALIDATES AGAINST IS THE ONE THIS
  //         VERB PRICES FROM. `unknown_item` has two producers — this layer and
  //         hr_apply's hr_items lookup — and only one of them may ever be live.
  {
    const { ITEMS } = await import('../src/data/items.js');
    const rows = (await db.query('select item_id from public.hr_items')).rows.map((r) => r.item_id);
    const known = new Set(rows);
    ok(rows.length > 100, `G16-CONTROL: hr_items holds ${rows.length} rows — the catalogue is not the generated one`);
    const missing = Object.keys(ITEMS).filter((id) => !known.has(id)).slice(0, 5);
    ok(missing.length === 0,
      `G16: [${missing}] are priceable here and ABSENT from the generated hr_items, so a vendor_sell `
      + 'would pass this layer\'s guard and be refused by hr_apply with the same code from a '
      + 'different cause. Re-run `node tools/gen-catalogues.mjs` and re-apply the catalogue.');
    for (const o of Object.values(cat.GOLD_OFFERS)) {
      for (const g of o.grant) {
        ok(known.has(g.id),
          `G16: offer ${o.id} grants '${g.id}', which is not in the generated hr_items — every `
          + 'purchase of it would be refused as unknown_item AFTER taking the gold... except '
          + 'hr_apply rolls back in full, so it is "refused forever" rather than "stolen". Still a '
          + 'shop entry nobody can buy.');
      }
    }
  }

  // ── G17. A STALE VERSION IS REFUSED ─────────────────────────────────────
  // Injected at exactly the point a concurrent apply would produce it: after the
  // read, before the apply. PGlite is one backend, so this is a fault injection
  // and not a race — stated, not implied.
  {
    await clearGate();
    const before = await state(db, UID);
    let bumped = false;
    const racing = makeExec(db, {
      before: async (text) => {
        if (!bumped && /hr_apply/.test(text)) {
          bumped = true;
          await db.query(
            'update public.player_state set version = version + 1 where user_id = $1 and slot = 0', [UID]);
        }
      },
    });
    const r = await buy.runShopBuy({
      exec: racing, user: UID, slot: 0, intentId: uuid(), offer: OFFER, qty: 1,
    });
    ok(bumped, 'G17-CONTROL: the injector never fired — no hr_apply statement was seen');
    ok(r.body.ok === false && r.body.error === 'version_conflict',
      `G17: a stale version returned ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(Number((await state(db, UID)).gold) === Number(before.gold),
      'G17: the conflicted purchase still charged');
    ok(r.body.state && Number(r.body.version) === Number((await state(db, UID)).version),
      'G17: the refusal carries a STALE version — it must be re-read, not echoed from the failed call');
  }

  // ── G18. ⚠ OVER THE REAL WIRE, THROUGH THE REAL DRIVER ──────────────────
  // Everything above injects a PGlite `exec`. Production runs postgres.js +
  // `tx.unsafe` over a pooler, and on 2026-08-15 that difference hid a P0 for the
  // entire life of the deployment: a pre-stringified delta bound into a bare
  // `::jsonb` is re-serialised by the driver and reaches hr_apply as a jsonb
  // STRING SCALAR. 27 mutations were green against an apply path that had never
  // once worked. spend.js is the THIRD apply site in the payload, so it gets the
  // same treatment rather than the same assumption.
  {
    let server = null; let sql = null;
    try {
      const port = await freePort();
      const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
      server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 4 });
      await server.start();
      const { default: postgres } = await import('postgres');
      /* index.ts's own pool options. `prepare: false` is not a detail: it is what
         puts every statement on the describe-first path where the driver learns
         the resolved parameter type, which is the whole bug. */
      sql = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`, {
        max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {},
      });

      /* THE CONTROL. If the double-encode is no longer reproducible with this
         driver, everything below passes for free — that is a FAILURE, not a pass. */
      const [c] = await sql.unsafe(
        'select jsonb_typeof($1::jsonb) as bare, jsonb_typeof($2::text::jsonb) as viatext',
        [JSON.stringify({ gold: -1 }), JSON.stringify({ gold: -1 })]);
      ok(c.bare === 'string' && c.viatext === 'object',
        `G18-CONTROL: bare=${c.bare} viatext=${c.viatext}. The double-encode this group exists to `
        + 'catch is no longer visible with this driver, so the two end-to-end runs below prove '
        + 'nothing. Find out what changed before trusting a green run.');

      /* index.ts:256-260, verbatim in behaviour. */
      const wireExec = async (text, params) => await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        return await tx.unsafe(text, params);
      });

      await clearGate();
      await grant({ gold: 50000, journal: { kind: 'admin', intent: 'fixture:wire' } });
      const g0 = Number((await state(db, UID)).gold);
      const b = await buy.runShopBuy({
        exec: wireExec, user: UID, slot: 0, intentId: uuid(), offer: OFFER, qty: 3,
      });
      ok(b.status === 200 && b.body.ok === true,
        `G18: shop_buy over the REAL postgres driver answered ${b.status} `
        + `error=${JSON.stringify(b.body.error)} stage=${JSON.stringify(b.body.stage)} `
        + `detail=${JSON.stringify(b.body.detail)}. 409/bad_delta is the verbatim 2026-08-15 P0: the `
        + 'delta reached hr_apply as a jsonb string scalar because postgres.js re-serialised a '
        + 'value that was already JSON.stringify-d. Cast the parameter ::text::jsonb.');
      const g1 = Number((await state(db, UID)).gold);
      ok(g0 - g1 === unitGold * 3,
        `G18: hr_apply reported success but gold moved by ${g0 - g1}, not ${unitGold * 3} — the 200 `
        + 'above is not evidence of anything');

      const s = await sell.runVendorSell({
        exec: wireExec, user: UID, slot: 0, intentId: uuid(), item: 'normal_log', qty: 5,
      });
      ok(s.status === 200 && s.body.ok === true,
        `G18: vendor_sell over the REAL postgres driver answered ${s.status} `
        + `${JSON.stringify(s.body.error)} / ${JSON.stringify(s.body.detail)}`);
      ok(Number((await state(db, UID)).gold) > g1,
        'G18: the sale reported success and paid nothing');
    } finally {
      try { if (sql) await sql.end({ timeout: 5 }); } catch { /* closing */ }
      try { if (server) await server.stop(); } catch { /* closing */ }
    }
  }

  await db.close();
  return fails;
}

// ── driver ──────────────────────────────────────────────────────────────
(async () => {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(28)} ${m.why}`);
    process.exit(0);
  }

  const one = argOf('mutate', null);
  if (one) {
    let red = false; let why = '';
    try { const f = await run(one); red = f.length > 0; why = f[0] || ''; }
    catch (e) { if (e.harness) { console.error(e.message); process.exit(2); } red = true; why = e.message; }
    console.log(`${one}: ${red ? 'CAUGHT' : 'SLIPPED'}${red ? ` — ${why.slice(0, 180)}` : ''}`);
    process.exit(red ? 0 : 1);
  }

  let clean = [];
  try { clean = await run(null); }
  catch (e) {
    if (e.harness) { console.error(e.message); process.exit(2); }
    if (!(e instanceof Red)) { console.error(e.stack || e.message); process.exit(2); }
    clean = fails.length ? fails : [e.message];
  }
  if (clean.length) {
    console.log('gold-intents: RED');
    for (const f of clean) console.log('  ✗ ' + f);
    process.exit(1);
  }
  console.log('gold-intents: OK — catalogue derivation, vendor-price parity with legacy.js, hostile '
    + 'bodies, buy/sell happy paths, the no-confiscation invariant, replay, one-key-one-purchase, '
    + 'insufficient gold, unknown vs unsupported, prototype names, unowned stock, budget-free shape '
    + 'refusals, the rate bucket, the registry, the taxonomy, clamp headroom, catalogue containment, '
    + 'stale version, and BOTH verbs end to end over the real postgres driver '
    + '(19 groups, real PG18 + the deployed intent modules)');

  if (has('selftest')) {
    let slipped = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let red = false; let why = '';
      try { const f = await run(id); red = f.length > 0; why = f[0] || ''; }
      catch (e) { if (e.harness) { console.error(e.message); process.exit(2); } red = true; why = e.message; }
      console.log(`  ${red ? 'CAUGHT ' : 'SLIPPED'} ${id.padEnd(28)} ${red ? why.slice(0, 110) : MUTATIONS[id].why}`);
      if (!red) slipped++;
    }
    if (slipped) { console.log(`\n${slipped} mutation(s) SLIPPED — the guard cannot see them.`); process.exit(1); }
    console.log(`\nall ${Object.keys(MUTATIONS).length} mutations CAUGHT.`);
  }
})();
