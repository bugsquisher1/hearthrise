#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-intent.mjs — THE MARKET'S **EDGE** HALF, DRIVEN WITH HOSTILE
// BODIES.
//
// THE CLAIM UNDER TEST, in one line:
//   the only things a client can say to the market are WHICH LISTING, WHICH
//   ITEM, HOW MANY and — for a seller, about their own goods — AN ASK; every
//   other shape is refused BY NAME before a single database statement is
//   issued; and the buyer's wire has no price in it at all.
//
// ── WHY THIS FILE EXISTS SEPARATELY FROM tests/market-v2.mjs ─────────────
// That file grades the AUTHORITY layer — the three SECURITY DEFINER functions,
// with both players measured and conservation stated as an identity. It drives
// them with well-formed SQL parameters, because that is what a review of a
// value transfer has to grade first.
//
// Nobody hands the server well-formed SQL parameters. An attacker hands an HTTP
// BODY to a Deno function, and everything between that body and those
// parameters — `parseIntent`, the registry, the shape refusals, the argument
// lists — is code no SQL test can see. That gap is exactly the one request.js's
// own header describes ("the one surface that is actually reachable was the one
// surface with no executable test"), and it is where a price would ride in.
//
// So: the REAL Edge modules, in plain Node, against a REAL PostgreSQL (PGlite,
// the whole migration chain via bootReplay) behind their one injected seam,
// `exec` — the same shape index.ts hands them, run as `hr_engine`.
//
//   parseIntent (real request.js)
//     → runMarketList / runMarketCancel / runMarketBuy (real market.js)
//     → public.hr_market_*                (real engine-only RPCs)
//     → hr_state_of envelope              (real seam)
//
// ── WHAT THIS FILE DOES NOT PROVE ───────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The version check is driven
//     directly (M-VER), which is the property a race would surface.
//   · The PostgREST/Deno request path. index.ts is not importable in Node;
//     the verbs are pure ESM modules precisely so this file drives the exact
//     bytes that deploy. The DISPATCH itself is graded by argument-list
//     inspection (M-WIRE) rather than by execution.
//   · The CLIENT half. That is B355-1/2/3 in src/features/smoke-test.js, which
//     drives the real gesture in a real browser with a stubbed transport.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/market-intent.mjs --list        the mutation catalogue
//   node tests/market-intent.mjs --selftest    every mutation must be CAUGHT
//   node tests/market-intent.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bootReplay, ROOT } from './schema-replay.mjs';

const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry plants a REAL defect in the Edge half. `--selftest` demands every
   one turns the run RED — a guard over a parser is exactly the kind of guard
   that passes while asserting nothing. */
const MUTATIONS = {
  // ── THE PRICE BOUNDARY ─────────────────────────────────────────────────
  ask_reaches_the_buy: {
    file: FN('market.js'),
    why: 'THE ONE THAT MATTERS. market_buy starts forwarding a caller-supplied price to the RPC. '
       + 'The whole cross-player argument — "the seller\'s number crosses to the SERVER, and the '
       + 'server\'s copy is what the buyer transacts against" — rests on this argument list having '
       + 'no price in it',
    find: '    args: (u, s, v, k) => [u, s, v, k, listing, qty],\n  });\n}\n\n/** The three statements',
    repl: '    args: (u, s, v, k) => [u, s, v, k, listing, qty, o.ask],\n  });\n}\n\n/** The three statements',
  },
  ask_parser_accepts_strings: {
    file: FN('request.js'),
    why: 'readAsk starts accepting a numeric STRING, so `"1e9"` — a fat finger, or a probe — parses '
       + 'as a billion-gold ask instead of being refused as unreadable',
    find: '  if (typeof v !== \'number\' || !Number.isSafeInteger(v)) return null;\n  return v >= 1 && v <= MAX_ASK ? v : null;',
    repl: '  const n = Number(v);\n  return Number.isFinite(n) && n >= 1 ? n : null;',
  },
  ask_unbounded: {
    file: FN('market.js'),
    why: 'the ask bound stops being re-stated at the verb, so a null or an out-of-range ask reaches '
       + 'a `$7::bigint` bind — a listing priced at nothing, or an overflow inside a value transfer',
    find: '  if (!Number.isSafeInteger(ask) || ask < 1 || ask > MAX_ASK) {',
    repl: '  if (false) {',
  },
  // ── THE SELECTOR ───────────────────────────────────────────────────────
  listing_parser_loose: {
    file: FN('request.js'),
    why: 'readListing stops demanding a canonical uuid. Postgres normalises `{…}` and the undashed '
       + 'form on cast, so two spellings of one row id become two things a caller can believe it '
       + 'named — and an unbounded string reaching a ::uuid cast is a free way to make the server '
       + 'do work proportional to the request body',
    find: '  const s = ownString(body, \'listing\');\n  if (s === null || s.length !== 36) return null;\n'
        + '  const low = s.toLowerCase();\n  return UUID_RE.test(low) ? low : null;',
    repl: '  const s = ownString(body, \'listing\');\n  return s === null ? null : s.toLowerCase();',
  },
  // ── SHAPE BEFORE DATABASE WORK ─────────────────────────────────────────
  shape_after_the_gate: {
    file: FN('market.js'),
    why: 'the shape checks move BEHIND the rate gate and the state read, so a malformed client '
       + 'loops on garbage and spends a real player\'s rate budget and a full hr_state_of per '
       + 'request — the D3 outage, reached from the market',
    find: '  const shape = shapeRefusal(BUY_VERB, intentId, qty);\n  if (shape) return shape;\n'
        + '  const bad = listingRefusal(BUY_VERB, listing);\n  if (bad) return bad;\n\n  return runMarketIntent({',
    repl: '  return runMarketIntent({\n    preShape: () => shapeRefusal(BUY_VERB, intentId, qty) '
        + '|| listingRefusal(BUY_VERB, listing),',
  },
  // ── THE REGISTRY IS READ, NOT DECORATION ───────────────────────────────
  registry_bucket_bogus: {
    file: FN('intents.js'),
    why: 'a market verb names a rate bucket the database does not have. hr_rate_gate fails closed '
       + 'on an unknown bucket, so this is a verb that 429s on its first call forever — invisible '
       + 'unless something READS the registry',
    find: "  market_buy: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  market_buy: Object.freeze({ bucket: 'bazaar', needsKey: true, collectsFirst: false }),",
  },
  registry_needs_key_false: {
    file: FN('intents.js'),
    why: 'the registry says a cross-player transfer needs no idempotency key, so a retried purchase '
       + 'is a second purchase',
    find: "  market_list: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),",
    repl: "  market_list: Object.freeze({ bucket: 'shop', needsKey: false, collectsFirst: false }),",
  },
  // ── THE RECEIPT IS THE SERVER'S ────────────────────────────────────────
  receipt_on_replay: {
    file: FN('market.js'),
    why: 'a REPLAYED trade reports a receipt for a transfer this invocation did not make — "you '
       + 'paid 4,000 and received 40 logs" printed twice for one purchase',
    find: '      receipt: (res.replayed === true || !res[field]) ? null : res[field],',
    repl: '      receipt: res[field] || null,',
  },
  // ── THE TRANSPORT SHAPE ────────────────────────────────────────────────
  delta_bound_as_jsonb: {
    file: FN('market.js'),
    why: 'a market statement acquires a `::jsonb` parameter. postgres.js re-serialises a value '
       + 'Postgres describes as jsonb, so a pre-stringified payload arrives double-encoded — the '
       + '2026-08-15 P0. These three verbs are safe BY CONSTRUCTION (scalars only) and that '
       + 'property has to be asserted, not assumed',
    find: '                              $5::uuid, $6::bigint) as res`;',
    repl: '                              $5::uuid, $6::bigint) as res, $7::jsonb as pad`;',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const SELLER = '00000000-0000-4000-b355-000000000001';
const BUYER = '00000000-0000-4000-b355-000000000002';

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }

const uuid = () => crypto.randomUUID();

async function boot(mutate) {
  const patchedJs = new Map();
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
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

  let db;
  try {
    ({ db } = await bootReplay());
  } catch (e) {
    if (e.harness) throw e;
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(`
    insert into auth.users (id) values ('${SELLER}'), ('${BUYER}') on conflict (id) do nothing;
    do $$ begin
      perform set_config('request.jwt.claim.sub', '${SELLER}', true);
      perform public.hr_create_character(0);
      perform set_config('request.jwt.claim.sub', '${BUYER}', true);
      perform public.hr_create_character(0);
      perform set_config('request.jwt.claim.sub', '', true);
    end $$;`);
  const mods = await loadModules(patchedJs);
  return { db, ...mods };
}

/* A mutated module has to be imported FROM DISK, and it imports its siblings by
   relative path — so the whole function directory is copied to a temp dir at
   the same depth relative to ROOT, the patched file is overwritten there, and
   the copy is imported. Same depth matters: these modules reach ../../../src. */
async function loadModules(patched) {
  const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');

  const importAll = async (dir) => {
    const bust = `?t=${Date.now()}${Math.random()}`;
    return {
      mk: await import(pathToFileURL(join(dir, 'market.js')).href + bust),
      req: await import(pathToFileURL(join(dir, 'request.js')).href + bust),
      it: await import(pathToFileURL(join(dir, 'intents.js')).href + bust),
      fnDir: dir,
    };
  };
  if (!patched.size) return importAll(FN(''));

  const base = await mkdtemp(join(tmpdir(), 'hr-b355-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(FN(''), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, text] of patched) {
    await writeFile(join(dir, file.split(/[\\/]/).pop()), text, 'utf8');
  }
  return importAll(dir);
}

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module,
    run as `hr_engine`, the role that holds ZERO table privileges. It COUNTS,
    because "refused before any database work" is a property you measure by
    counting statements, never by reading the code. */
function makeExec(db) {
  const calls = [];
  const exec = async (text, params) => {
    calls.push({ text, params });
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; }
    finally { await db.exec('reset role'); }
  };
  exec.calls = calls;
  exec.reset = () => { calls.length = 0; };
  return exec;
}

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, mk, req, it } = await boot(mutate);
  const exec = makeExec(db);

  const goldOf = async (uid) => Number((await db.query(
    'select gold::text g from public.player_state where user_id=$1 and slot=0', [uid])).rows[0].g);
  const clearGate = () => db.query('delete from public.hr_rate_counters');

  /* THE GOODS, chosen from the SERVER's own generated catalogue by the property
     that matters, never by name — a hard-coded item id is a second copy of
     src/data/items.js. */
  const ITEM = (await db.query(
    `select item_id from public.hr_items
      where tradeable and item_id not in (select item_id from public.hr_item_slots)
      order by item_id limit 1`)).rows[0].item_id;

  const stock = async () => {
    await db.query('update public.player_state set gold = 1000000');
    await db.query(
      `insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,0,$2,100)
       on conflict (user_id, slot, item_id) do update set qty = 100`, [SELLER, ITEM]);
    await clearGate();
  };
  await stock();

  const list = (o) => mk.runMarketList({ exec, user: SELLER, slot: 0, ...o });
  const buy = (o) => mk.runMarketBuy({ exec, user: BUYER, slot: 0, ...o });
  const cancel = (o) => mk.runMarketCancel({ exec, user: SELLER, slot: 0, ...o });

  // ══ M-WIRE · THE BUY'S ARGUMENT LIST HAS NO PRICE IN IT ═══════════════
  //    The single most important property in this file, and it is asserted
  //    against the BOUND PARAMETERS rather than against the source: a source
  //    scan cannot tell a price from any other bigint, and a comment saying
  //    "no price crosses" is exactly the kind of thing that survives the edit
  //    that makes it false.
  let listingId;
  try {
    exec.reset();
    const l = await list({ intentId: uuid(), item: ITEM, qty: 5, ask: 1000 });
    ok(l.status === 200 && l.body.ok === true, `M-WIRE: list refused: ${JSON.stringify(l.body)}`);
    listingId = l.body.receipt.listing_id;
    ok(!!listingId, 'M-WIRE: the list receipt carries no listing id');

    exec.reset();
    const r = await buy({ intentId: uuid(), listing: listingId, qty: 2 });
    ok(r.status === 200 && r.body.ok === true, `M-WIRE: buy refused: ${JSON.stringify(r.body)}`);
    const call = exec.calls.find((c) => /hr_market_buy/.test(c.text));
    ok(!!call, 'M-WIRE: no hr_market_buy statement was issued at all');
    ok(call.params.length === 6,
      `M-WIRE: hr_market_buy was bound ${call.params.length} parameters, not 6. The buyer's whole `
      + `vocabulary is (user, slot, version, intent, listing, qty) — a seventh value is a price, a `
      + `seller or a timestamp, and every one of those is a client value crossing to another `
      + `player: ${JSON.stringify(call.params)}`);
    ok(call.params[4] === listingId && call.params[5] === 2,
      `M-WIRE: the buy named ${JSON.stringify(call.params.slice(4))} instead of the listing and the count`);
    /* …AND THE PRICE THE PLAYER ACTUALLY PAID CAME OFF THE ROW. 1,000 each was
       never sent by the buyer; it is in the receipt because the server put it
       there. */
    ok(Number(r.body.receipt.each) === 1000 && Number(r.body.receipt.gold_gross) === 2000,
      `M-WIRE: the server receipt does not describe the charge: ${JSON.stringify(r.body.receipt)}`);
    ok(typeof r.body.receipt.seller_name === 'string' && r.body.receipt.seller_name.length > 0,
      'M-WIRE: the receipt carries no server-derived seller name');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-HOSTILE · A HOSTILE BODY YIELDS NOTHING, AND COSTS NOTHING ══════
  //    Driven through the REAL body reader with the bodies an attacker sends,
  //    then through the REAL verb — and the statement counter is what proves
  //    "refused before any database work".
  try {
    const HOSTILE = [
      ['a poisoned prototype', { __proto__: { ask: 1, listing: 'x' }, verb: 'market_buy' }],
      ['an array body', ['market_buy', 1, 2]],
      ['a string body', 'market_buy'],
      ['a null body', null],
      ['a numeric-string ask', { verb: 'market_list', item: 'normal_log', qty: 1, ask: '1000000000' }],
      ['a fractional ask', { verb: 'market_list', item: 'normal_log', qty: 1, ask: 1.5 }],
      ['a negative ask', { verb: 'market_list', item: 'normal_log', qty: 1, ask: -5 }],
      ['a zero ask', { verb: 'market_list', item: 'normal_log', qty: 1, ask: 0 }],
      ['an ask past the bound', { verb: 'market_list', item: 'normal_log', qty: 1, ask: 1e9 + 1 }],
      ['an ask as an object', { verb: 'market_list', item: 'normal_log', qty: 1, ask: { valueOf: 1 } }],
      ['a braced listing uuid', { verb: 'market_buy', qty: 1,
        listing: '{11111111-2222-4333-8444-555555555555}' }],
      ['an undashed listing uuid', { verb: 'market_buy', qty: 1,
        listing: '11111111222243338444555555555555' }],
      ['a listing with a trailing space', { verb: 'market_buy', qty: 1,
        listing: '11111111-2222-4333-8444-55555555555 ' }],
      ['a SQL-shaped listing', { verb: 'market_buy', qty: 1, listing: "' or 1=1 --" }],
    ];
    for (const [what, body] of HOSTILE) {
      const parsed = req.parseIntent(body);
      /* EVERY hostile spelling of a price or a selector is `null` — never a
         coerced value, and never a key that survived from the body. */
      ok(parsed.ask === null,
        `M-HOSTILE: ${what} produced ask=${JSON.stringify(parsed.ask)}. A price the parser GUESSES `
        + 'is a number the player did not ask for');
      ok(parsed.listing === null,
        `M-HOSTILE: ${what} produced listing=${JSON.stringify(parsed.listing)}`);
      ok(Object.getPrototypeOf(parsed) === null,
        `M-HOSTILE: ${what} produced an object with a prototype — parseIntent must build a fresh `
        + 'null-prototype object field by field');
      for (const k of Object.keys(parsed)) {
        ok(req.INTENT_KEYS.includes(k),
          `M-HOSTILE: ${what} smuggled the key '${k}' through the parser`);
      }
    }

    /* …AND THE VERB REFUSES THEM WITHOUT TOUCHING THE DATABASE. */
    const cases = [
      ['listing', () => buy({ intentId: uuid(), listing: null, qty: 1 }), it.INTENT_ERRORS.BAD_LISTING],
      ['listing', () => buy({ intentId: uuid(), listing: 'not-a-uuid', qty: 1 }), it.INTENT_ERRORS.BAD_LISTING],
      ['listing', () => cancel({ intentId: uuid(), listing: null }), it.INTENT_ERRORS.BAD_LISTING],
      ['ask', () => list({ intentId: uuid(), item: ITEM, qty: 1, ask: null }), it.INTENT_ERRORS.BAD_ASK],
      ['ask', () => list({ intentId: uuid(), item: ITEM, qty: 1, ask: 0 }), it.INTENT_ERRORS.BAD_ASK],
      ['ask', () => list({ intentId: uuid(), item: ITEM, qty: 1, ask: 1e9 + 1 }), it.INTENT_ERRORS.BAD_ASK],
      ['item', () => list({ intentId: uuid(), item: 'NOT VALID', qty: 1, ask: 5 }), it.INTENT_ERRORS.BAD_ITEM],
      ['qty', () => buy({ intentId: uuid(), listing: uuid(), qty: 0 }), it.INTENT_ERRORS.BAD_QTY],
      ['qty', () => buy({ intentId: uuid(), listing: uuid(), qty: null }), it.INTENT_ERRORS.BAD_QTY],
      ['key', () => buy({ intentId: null, listing: uuid(), qty: 1 }), it.INTENT_ERRORS.MISSING_INTENT_ID],
    ];
    for (const [what, fn, code] of cases) {
      exec.reset();
      const r = await fn();
      ok(r.status === 400 && r.body.error === code,
        `M-HOSTILE: a bad ${what} answered ${r.status} ${JSON.stringify(r.body)} instead of 400 ${code}`);
      ok(typeof r.body.verb === 'string',
        'M-HOSTILE: a refusal carries no `verb` — one client dispatcher has to be able to route a '
        + 'response without remembering what it asked for');
      ok(exec.calls.length === 0,
        `M-HOSTILE: a bad ${what} issued ${exec.calls.length} database statement(s). A refusal that `
        + 'is a fact about the REQUEST must be answered before the rate gate, or a malformed client '
        + "spends a real player's rate budget by looping on garbage");
    }

    /* AND BOTH SHAPE CODES ARE ON THE STATELESS LIST — i.e. the contract agrees
       with the behaviour above rather than merely coexisting with it. */
    for (const code of [it.INTENT_ERRORS.BAD_LISTING, it.INTENT_ERRORS.BAD_ASK]) {
      ok(it.refusalCarriesState(code) === false,
        `M-HOSTILE: ${code} is expected to carry a state envelope, but it is answered before any `
        + 'database read — the two halves of the contract disagree');
    }
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-REG · THE REGISTRY IS READ ON THE HOT PATH ══════════════════════
  try {
    for (const v of mk.MARKET_VERBS) {
      ok(it.isKnownVerb(v), `M-REG: ${v} has no registry row`);
      ok(req.VERBS.includes(v), `M-REG: ${v} is not in the parser's verb allowlist`);
      for (const f of it.REGISTRY_FIELDS) {
        ok(Object.prototype.hasOwnProperty.call(it.INTENT_REGISTRY[v], f),
          `M-REG: ${v}'s registry row is missing '${f}'`);
      }
      ok(it.requiresKey(v) === true,
        `M-REG: ${v} does not require an idempotency key. A cross-player transfer whose retry is a `
        + 'second transfer is the one failure idempotency exists for');
      ok(it.collectsFirst(v) === false,
        `M-REG: ${v} claims to collect first. These verbs propose no delta and never touch `
        + 'accrued_to, so a collect would cost a round trip and buy nothing');
    }
    /* THE BUCKET IS READ, AND IT IS ONE THE DATABASE HAS. An unknown bucket
       fails closed in hr_rate_gate, so a wrong row here is a verb that 429s
       forever — which the live call above would have caught, and this states
       WHY it was caught. */
    for (const v of mk.MARKET_VERBS) {
      const allowed = (await db.query(
        'select public.hr_rate_gate($1::uuid, 0, $2::text) x', [BUYER, it.rateBucketFor(v)])).rows[0].x;
      ok(allowed === true,
        `M-REG: hr_rate_gate refused ${v}'s bucket '${it.rateBucketFor(v)}' on a fresh counter — the `
        + 'registry names a namespace the database does not have, so every call of this verb is a 429');
    }
    await clearGate();
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-SQL · SCALARS ONLY, AND THE VERSION IS ALWAYS THE THIRD BIND ════
  try {
    for (const [verb, sql] of Object.entries(mk.MARKET_SQL)) {
      ok(!/::jsonb/.test(sql),
        `M-SQL: ${verb}'s statement binds a jsonb parameter. postgres.js re-serialises anything `
        + 'Postgres describes as jsonb, so a pre-stringified payload arrives double-encoded — the '
        + '2026-08-15 P0. These verbs are safe by construction because they bind scalars only, and '
        + `that is a property to assert rather than to assume: ${sql.trim()}`);
      ok(/\$3::bigint/.test(sql),
        `M-SQL: ${verb}'s statement does not bind the version as $3::bigint. Every writer in this `
        + 'architecture takes (user, slot, version, intent) in that order, and a version in the '
        + 'wrong position is optimistic concurrency pointed at the wrong value');
      ok(!/hr_apply/.test(sql),
        `M-SQL: ${verb} calls hr_apply. hr_apply is single-character BY CONSTRUCTION; a market `
        + "trade writes two players' rows and must not be spellable as a delta");
    }
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-VER · A STALE VERSION IS REFUSED, AND THE REFUSAL CARRIES STATE ═
  try {
    await stock();
    const l = await list({ intentId: uuid(), item: ITEM, qty: 3, ask: 100 });
    ok(l.body.ok === true, `M-VER: setup list refused: ${JSON.stringify(l.body)}`);
    /* Move the buyer's version underneath the call, the way a concurrent accrual
       would, by letting the read happen and then bumping. The Edge module reads
       the version itself, so the way to make it stale is to bump between its
       read and its write — which PGlite cannot interleave. Instead the RPC is
       driven with a version the module did not read, through the same seam. */
    const before = await goldOf(BUYER);
    /* Through the SAME seam the module uses — as `hr_engine`. Driven directly
       rather than through runMarketBuy because the module reads the version for
       itself and PGlite cannot interleave a bump between its read and its
       write; this is the same substitution tests/market-v2.mjs makes for every
       property a race would surface. */
    const stale = (await exec(
      'select public.hr_market_buy($1::uuid,0,$2::bigint,$3::uuid,$4::uuid,1::bigint) r',
      [BUYER, -1, uuid(), l.body.receipt.listing_id]))[0].r;
    ok(stale && stale.ok === false && stale.error === 'version_conflict',
      `M-VER: a stale version was accepted: ${JSON.stringify(stale)}`);
    ok(await goldOf(BUYER) === before, 'M-VER: a refused purchase still moved gold');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-REPLAY · A REPLAY CARRIES THE ENVELOPE AND NO RECEIPT ═══════════
  try {
    await stock();
    const l = await list({ intentId: uuid(), item: ITEM, qty: 4, ask: 250 });
    ok(l.body.ok === true, `M-REPLAY: setup list refused: ${JSON.stringify(l.body)}`);
    const key = uuid();
    const a = await buy({ intentId: key, listing: l.body.receipt.listing_id, qty: 4 });
    ok(a.body.ok === true, `M-REPLAY: first buy refused: ${JSON.stringify(a.body)}`);
    const mid = await goldOf(BUYER);
    ok(a.body.receipt && Number(a.body.receipt.gold_gross) === 1000,
      `M-REPLAY: the first buy's receipt is wrong: ${JSON.stringify(a.body.receipt)}`);

    const b = await buy({ intentId: key, listing: l.body.receipt.listing_id, qty: 4 });
    ok(b.body.ok === true && b.body.replayed === true,
      `M-REPLAY: a repeated intent id was not reported as a replay: ${JSON.stringify(b.body)}`);
    ok(await goldOf(BUYER) === mid, 'M-REPLAY: THE REPLAY MOVED GOLD');
    ok(b.body.receipt === null,
      `M-REPLAY: the replay reported a receipt (${JSON.stringify(b.body.receipt)}) for a transfer `
      + 'this invocation did not make. The envelope still carries the true balance; the receipt '
      + 'describes the trade, and this call did not make one');
    ok(b.body.state && Number(b.body.state.gold) === mid,
      'M-REPLAY: the replayed answer carries no current envelope — a client that retried would be '
      + 'left holding a prediction it can never settle, which is how a local offset becomes permanent');
  } catch (e) { if (!(e instanceof Red)) throw e; }

  // ══ M-ENV · A REFUSAL THAT REACHED THE DATABASE CARRIES THE ENVELOPE ══
  try {
    await stock();
    const r = await buy({ intentId: uuid(), listing: uuid(), qty: 1 });
    ok(r.status === 409 && r.body.error === 'gone',
      `M-ENV: buying a listing that does not exist answered ${JSON.stringify(r.body)}`);
    ok(r.body.state && Number.isFinite(Number(r.body.state.gold)) && r.body.version !== undefined,
      'M-ENV: a refusal that reached the database carries no state envelope. The client is told to '
      + 'put its optimistic pointer back to what the envelope says; without one that instruction is '
      + "unexecutable and the client's only option is to keep its own guess");
    ok(r.body.stage === 'market',
      `M-ENV: the refusal names stage '${r.body.stage}' — the client routes on it`);
  } catch (e) { if (!(e instanceof Red)) throw e; }

  await db.close?.();
  return fails;
}

// ── driver ──────────────────────────────────────────────────────────────
if (has('list')) {
  for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(28)} ${m.why}`);
  process.exit(0);
}

if (has('selftest')) {
  let slipped = 0;
  for (const id of Object.keys(MUTATIONS)) {
    let caught = false; let why = '';
    try {
      const f = await run(id);
      caught = f.length > 0;
      why = f[0] || '';
    } catch (e) {
      if (e.harness) { console.error(`  HARNESS  ${id}: ${e.message}`); process.exit(2); }
      caught = true; why = e.message;
    }
    if (caught) console.log(`  CAUGHT   ${id}\n             ${String(why).split('\n')[0].slice(0, 150)}`);
    else { slipped++; console.error(`  SLIPPED  ${id} — ${MUTATIONS[id].why}`); }
  }
  console.log(slipped ? `\n${slipped} mutation(s) SLIPPED`
    : `\nall ${Object.keys(MUTATIONS).length} mutations caught`);
  process.exit(slipped ? 1 : 0);
}

const mutate = argOf('mutate', null);
let out;
try { out = await run(mutate); }
catch (e) {
  if (e.harness) { console.error(`HARNESS: ${e.message}`); process.exit(2); }
  console.error(`market-intent: ${e.message}`);
  process.exit(1);
}
if (out.length) {
  for (const f of out) console.error(`  x ${f}`);
  console.error(`\nmarket-intent: ${out.length} failure(s)`);
  process.exit(1);
}
console.log('market-intent: 7 groups green — the market\'s Edge half refuses every hostile body '
  + 'before it costs a statement, and the buyer\'s wire carries no price');

/** Exported so tests/run-smoke.mjs runs this as one guard. */
export async function marketIntentGuard() {
  const f = await run(null);
  return { name: 'market intent (the Edge half)', failures: f };
}
