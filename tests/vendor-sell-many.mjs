#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/vendor-sell-many.mjs — THE BULK SALE, GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/vendor-sell-many.mjs            clean run
//   node tests/vendor-sell-many.mjs --list     the mutation catalogue
//   node tests/vendor-sell-many.mjs --mutate   every mutation must turn it RED
//
// Ships with: supabase/functions/hr-accrue/vendor-sell.js (runVendorSellMany),
// request.js (readLines), intents.js (the registry row), and the client half in
// src/screens/shop-counter.js / src/features/inv-context-menu.js.
//
// THE PROPERTIES (each is a line of the change contract):
//   V1  THE PRICE IS THE SERVER'S. A `unit`/`price`/`gold` on a line or on the
//       body never reaches the delta: request.js copies `item` and `qty` only,
//       and every unit is vendorPriceOf(ITEMS, id) — the same bid vendor_sell
//       pays. Driven from a RAW hostile body through parseIntent, so the parser
//       and the verb are graded together, the way index.ts composes them.
//   V2  ALL-OR-NOTHING. One line the player cannot cover is hr_apply's
//       `insufficient_item` for the WHOLE batch: gold, every stack and the
//       ledger are byte-for-byte unchanged. An unknown/unsellable line refuses
//       the whole intent before any database work and names the line.
//   V3  ONE GESTURE COSTS ONE `shop` RATE TOKEN, ONE apply, ONE ledger row
//       (kind `shop`, every line's unit in meta.lines, gold_in = the sum).
//   V4  THE CAP. ≤ MAX_SELL_LINES lines, and MAX_SELL_LINES ≤ hr_apply's
//       `c_max_item_kinds` read out of the migration, so the edge never
//       proposes a delta the database refuses for its size. A full cap applies.
//   V5  IDEMPOTENT ON p_idem. The same key + the same lines replays (nothing
//       moves, receipt null); the same key + DIFFERENT lines (even the same
//       line COUNT) is `intent_mismatch`, never a silent replay.
//   V6  THE RECEIPT SUMS ITS LINES and equals the gold that moved.
//
// WHAT IT CANNOT EXERCISE: the pooler, the JWT, true concurrency (PGlite is one
// backend; the per-character lock is hr_apply's and is graded there), and the
// HTTP shell. The client half is graded in-page (BULK-SELL-* in
// src/features/smoke/monsters-inventory-and-brand.js).
// ════════════════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdtemp, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { runMutationProof } from './mutation-proof.mjs';

const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* ── THE MUTATION CATALOGUE ────────────────────────────────────────────────
   Each plants a bug this guard claims to catch, in the REAL edge bytes (copied
   to a temp dir at the same depth, so relative imports still resolve). */
const MUTATIONS = {
  client_price_trusted: {
    why: 'V1 — the parser forwards the whole line and the verb prefers a client `unit`: devtools '
       + 'names the price of every stack in a sweep, an infinite gold faucet',
    patches: [
      ['request.js', '    const line = Object.create(null);\n',
        '    const line = Object.assign(Object.create(null), l);\n'],
      ['vendor-sell.js', '    sales.push({ item: r.item, name: r.name, unit: r.unit, qty: l.qty });',
        '    sales.push({ item: r.item, name: r.name, unit: Number(l.unit) || r.unit, qty: l.qty });'],
    ],
  },
  per_line_applies: {
    why: 'V2/V3 — the naive "loop vendor_sell" shape: each line is its own apply under its own key, '
       + 'so a short line half-sells the bag and a sweep spends N rate tokens and N settles',
    patches: [
      ['vendor-sell.js',
        '  const delta = sellManyDelta(resolved.sales);\n  return runValueIntent({',
        '  let last = null;\n'
        + '  for (const s of resolved.sales) {\n'
        + '    const d1 = sellManyDelta([s]);\n'
        + '    last = await runValueIntent({ partyOwnsWindow: false, exec, user, slot, verb: VERB_MANY,\n'
        + '      intentId: crypto.randomUUID(), plan: { delta: d1, receipt: { lines: [], gold: d1.gold } } });\n'
        + '    if (last.status !== 200) return last;\n'
        + '  }\n'
        + '  const delta = sellManyDelta(resolved.sales);\n'
        + '  if (last) return last;\n'
        + '  return runValueIntent({'],
    ],
  },
  unknown_line_skipped: {
    why: 'V2 — an unknown/unsellable line is silently dropped instead of refusing the batch: the '
       + 'server sells a different set than the player asked for',
    patches: [
      ['vendor-sell.js',
        '    if (!r.ok) {\n      return { ok: false, status: r.status, error: r.error, detail: { ...(r.detail || {}), line: i } };\n    }',
        '    if (!r.ok) continue;'],
    ],
  },
  duplicate_lines_admitted: {
    why: 'V4 — the same item twice is admitted; the delta map silently keeps one line while the '
       + 'receipt counts both',
    patches: [['request.js', '    if (seen.has(item)) return null;\n', '']],
  },
  cap_dropped: {
    why: 'V4 — the line cap is dropped, so a body can propose more item kinds than hr_apply takes',
    patches: [['request.js',
      '  if (!Array.isArray(a) || a.length === 0 || a.length > MAX_SELL_LINES) return null;',
      '  if (!Array.isArray(a) || a.length === 0) return null;']],
  },
  name_drops_digest: {
    why: 'V5 — the intent name stops binding the line set, so one key reused for a different sweep '
       + 'of the same length answers replayed:true having sold nothing',
    patches: [['vendor-sell.js',
      '      intent: intentNameOf(VERB_MANY, sales.length, linesDigest(sales)),',
      '      intent: intentNameOf(VERB_MANY, sales.length),']],
  },
  receipt_invented: {
    why: 'V6 — the receipt gold stops being the delta gold, so the toast the client builds from it '
       + 'is a number the server did not pay',
    patches: [['vendor-sell.js', '        gold: delta.gold,\n      },\n    },\n  });\n}\n',
      '        gold: delta.gold + 1,\n      },\n    },\n  });\n}\n']],
  },
  no_settle_first: {
    why: 'V3 — the registry row stops settling first: a sweep at return prices the whole absence '
       + 'without the tools/food it just sold',
    patches: [['intents.js',
      "  vendor_sell_many: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: true }),",
      "  vendor_sell_many: Object.freeze({ bucket: 'shop', needsKey: true, collectsFirst: false }),"]],
  },
};

let failures = 0;
const problems = [];
const ok = (cond, msg) => { if (!cond) { failures++; problems.push(msg); } };

/** The edge modules — the repo's own bytes, or a patched copy. */
async function loadModules(patches) {
  let dir = FN('');
  if (patches && patches.length) {
    const base = await mkdtemp(join(tmpdir(), 'hr-b564-'));
    dir = join(base, 'supabase', 'functions', 'hr-accrue');
    await cp(FN(''), dir, { recursive: true });
    await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
    const byFile = new Map();
    for (const [file, find, repl] of patches) {
      const src = byFile.get(file) ?? (await readFile(join(dir, file), 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation anchor matched ${n} times (need exactly 1) in ${file}: ${find.slice(0, 80)}`);
        e.harness = true; throw e;
      }
      byFile.set(file, src.replace(find, repl));
    }
    for (const [file, text] of byFile) await writeFile(join(dir, file), text, 'utf8');
  }
  const bust = `?t=${Date.now()}${Math.random()}`;
  const imp = (f) => import(pathToFileURL(join(dir, f)).href + bust);
  return {
    sell: await imp('vendor-sell.js'),
    req: await imp('request.js'),
    it: await imp('intents.js'),
    cat: await imp('catalogue.js'),
  };
}

function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
}

// ════════════════════════════════════════════════════════════════════════
// PART 1 — THE CONTRACT, no database.
// ════════════════════════════════════════════════════════════════════════
async function contract(m, ITEMS) {
  const { sell, req, it, cat } = m;
  ok(req.VERBS.includes('vendor_sell_many'), 'C0: vendor_sell_many is not in request.js VERBS');
  const row = it.INTENT_REGISTRY.vendor_sell_many;
  ok(row && row.bucket === 'shop' && row.needsKey === true && row.collectsFirst === true,
    `C0: the registry row is ${JSON.stringify(row)} — want {shop, needsKey, collectsFirst}: one shop `
    + 'token per gesture, a key, and a settle before items that priced the night leave the bag');
  ok(req.INTENT_KEYS.includes('lines'), 'C0: `lines` is not in INTENT_KEYS');
  ok(it.STATELESS_REFUSALS.includes('bad_lines'), 'C0: bad_lines must be a stateless (pre-DB) refusal');

  /* V4 — the cap is bounded by hr_apply's own item-kind bound, read from SQL. */
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-09-14-hr-apply-restatement.sql'), 'utf8');
  const kinds = Number((sql.match(/c_max_item_kinds\s+constant int\s+:=\s*(\d+);/) || [])[1]);
  ok(Number.isInteger(kinds) && kinds > 0, 'C1-HARNESS: could not read c_max_item_kinds from hr_apply');
  ok(req.MAX_SELL_LINES >= 1 && req.MAX_SELL_LINES <= kinds,
    `C1: MAX_SELL_LINES ${req.MAX_SELL_LINES} exceeds hr_apply's c_max_item_kinds ${kinds}`);

  const L = (n) => Array.from({ length: n }, (_, i) => ({ item: `x${i}`, qty: 1 }));
  ok(req.readLines({ lines: L(req.MAX_SELL_LINES) })?.length === req.MAX_SELL_LINES,
    'C1: a full-cap list was refused');
  ok(req.readLines({ lines: L(req.MAX_SELL_LINES + 1) }) === null, 'C1: a list over the cap was admitted');
  ok(req.readLines({ lines: [] }) === null, 'C1: an empty list was admitted');
  ok(req.readLines({ lines: [{ item: 'normal_log', qty: 1 }, { item: 'normal_log', qty: 2 }] }) === null,
    'C1: the same item twice was admitted — the delta is a map, so one line would vanish');
  ok(req.readLines({ lines: [{ item: 'normal_log', qty: '5' }] }) === null, 'C1: a string qty was admitted');
  ok(req.readLines({ lines: [{ item: 'normal_log', qty: req.MAX_QTY + 1 }] }) === null,
    'C1: a qty over MAX_QTY was admitted');
  ok(req.readLines({ lines: [{ item: 'Normal Log', qty: 1 }] }) === null, 'C1: a malformed id was admitted');
  ok(req.readLines({ lines: { 0: { item: 'normal_log', qty: 1 } } }) === null, 'C1: a non-array was admitted');

  /* V1 at the parser: a priced line comes out holding item + qty and NOTHING else. */
  const hostile = req.parseIntent({ verb: 'vendor_sell_many', intentId: crypto.randomUUID(),
    price: 1e9, unit: 1e9, gold: 1e9,
    lines: [{ item: 'bronze_helm', qty: 2, unit: 999999, price: 999999, gold: 1e9 }] });
  ok(hostile.lines && hostile.lines.length === 1
     && Object.keys(hostile.lines[0]).sort().join(',') === 'item,qty',
    `C2: a priced line reached the verb as ${JSON.stringify(hostile.lines)} — only item and qty may cross`);

  /* The delta is the catalogue's, and stamps nothing. */
  const res = sell.resolveSaleLines([{ item: 'bronze_helm', qty: 2 }, { item: 'normal_log', qty: 7 }]);
  ok(res.ok, 'C3: two real sellable lines did not resolve');
  if (res.ok) {
    const d = sell.sellManyDelta(res.sales);
    const want = cat.vendorPriceOf(ITEMS, 'bronze_helm') * 2 + cat.vendorPriceOf(ITEMS, 'normal_log') * 7;
    ok(d.gold === want, `C3: the delta pays ${d.gold}, the catalogue says ${want}`);
    ok(d.items.bronze_helm === -2 && d.items.normal_log === -7, 'C3: the delta does not debit each line');
    ok(it.guardStampKeys('vendor_sell_many', d) === null, 'C3: the bulk delta carries a stamping key');
    ok(/^vendor_sell_many:2:[0-9a-f]{16}$/.test(d.journal.intent), `C3: intent name ${d.journal.intent}`);
    const swapped = sell.sellManyDelta([res.sales[1], res.sales[0]]);
    ok(swapped.journal.intent === d.journal.intent, 'C3: the intent name depends on line ORDER — one sweep, two names');
  }
  const bad = sell.resolveSaleLines([{ item: 'normal_log', qty: 1 }, { item: 'not_a_real_item_zzz', qty: 1 }]);
  ok(!bad.ok && bad.error === 'unknown_item' && bad.detail.line === 1,
    `C3: an unknown second line resolved as ${JSON.stringify(bad)} — the whole batch must refuse, naming line 1`);
}

// ════════════════════════════════════════════════════════════════════════
// PART 2 — BEHAVIOUR, against the real chain. A fresh character per arm.
// ════════════════════════════════════════════════════════════════════════
let userSeq = 0;
async function newCharacter(db) {
  userSeq++;
  const uid = `00000564-0000-4000-a000-${String(userSeq).padStart(12, '0')}`;
  await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into profiles(id, display_name) values ($1,$2) on conflict (id) do nothing',
    [uid, `SellMany${userSeq}`]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const cr = (await db.query('select hr_create_character(0) r')).rows[0].r;
  if (!cr || cr.ok !== true) {
    const e = new Error(`hr_create_character failed: ${JSON.stringify(cr)}`); e.harness = true; throw e;
  }
  return uid;
}

async function behaviour(db, m, ITEMS) {
  const { sell, req, cat } = m;
  const exec = makeExec(db);
  const uid = await newCharacter(db);
  const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
  const version = async () => Number((await q1('select version::text v from player_state where user_id=$1 and slot=0', [uid])).v);
  const gold = async () => Number((await q1('select gold::text g from player_state where user_id=$1 and slot=0', [uid])).g);
  const inv = async (id) => Number((await q1(
    'select qty::text q from player_inventory where user_id=$1 and slot=0 and item_id=$2', [uid, id]))?.q ?? 0);
  const ledgerN = async () => Number((await q1('select count(*)::int n from player_ledger where user_id=$1', [uid])).n);
  const shopTokens = async () => Number((await q1(
    "select coalesce(sum(n),0)::int n from hr_rate_counters where user_id=$1 and bucket='shop'", [uid])).n);
  const admin = async (delta) => {
    const v = await version();
    await db.exec('set role hr_engine');
    try {
      return (await db.query('select hr_apply($1,0,$2,$3,$4::jsonb) r', [uid, v, crypto.randomUUID(),
        JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 'sell_many_probe' } })])).rows[0].r;
    } finally { await db.exec('reset role'); }
  };
  /* index.ts's composition: a RAW body through parseIntent, then the verb. */
  const send = (body, key = crypto.randomUUID()) => {
    const intent = req.parseIntent({ verb: 'vendor_sell_many', intentId: key, ...body });
    return sell.runVendorSellMany({ exec, user: uid, slot: 0, intentId: intent.intentId, lines: intent.lines });
  };
  const price = (id) => cat.vendorPriceOf(ITEMS, id);

  const g = await admin({ items: { bronze_helm: 5, normal_log: 40, copper_ore: 30 } });
  if (!g || g.ok !== true) { const e = new Error(`fixture grant refused: ${JSON.stringify(g)}`); e.harness = true; throw e; }

  // ── V1 + V3 + V6: the happy path, priced lines on the wire ───────────────
  {
    const g0 = await gold(); const l0 = await ledgerN(); const t0 = await shopTokens();
    const r = await send({ price: 1e9, lines: [
      { item: 'bronze_helm', qty: 2, unit: 999999 },
      { item: 'normal_log', qty: 30, price: 999999 },
      { item: 'copper_ore', qty: 10, gold: 1e9 },
    ] });
    const want = price('bronze_helm') * 2 + price('normal_log') * 30 + price('copper_ore') * 10;
    ok(r.status === 200 && r.body.ok === true, `V1: an honest sweep was refused — ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(await gold() - g0 === want,
      `V1: the sweep paid ${await gold() - g0} gold; the catalogue says ${want}. A client unit crossed into the economy.`);
    ok(await inv('bronze_helm') === 3 && await inv('normal_log') === 10 && await inv('copper_ore') === 20,
      'V1: the stacks did not leave the bag server-side');
    ok(await shopTokens() - t0 === 1, `V3: one sweep spent ${await shopTokens() - t0} shop rate tokens — want exactly 1`);
    const rows = (await db.query(
      'select kind, intent, gold::text g, gold_in::text gi, meta from player_ledger where user_id=$1 order by id', [uid])).rows.slice(l0);
    const sale = rows.filter((x) => String(x.intent || '').startsWith('vendor_sell_many:'));
    ok(sale.length === 1, `V3: the sweep wrote ${sale.length} vendor_sell_many ledger rows — want ONE per gesture`);
    if (sale[0]) {
      ok(sale[0].kind === 'shop', `V3: ledger kind ${sale[0].kind} — want shop`);
      ok(Number(sale[0].g) === want && Number(sale[0].gi) === want,
        `V3: ledger gold ${sale[0].g} / gold_in ${sale[0].gi} — want ${want} (the daily budget sums gold_in)`);
      const ml = sale[0].meta && sale[0].meta.lines;
      ok(ml && ml.bronze_helm?.[1] === price('bronze_helm') && ml.normal_log?.[0] === 30,
        `V3: meta.lines ${JSON.stringify(ml)} does not journal each line's qty and catalogue unit`);
    }
    const rc = r.body.receipt;
    const sumLines = rc && Array.isArray(rc.lines) ? rc.lines.reduce((s, l) => s + l.gold, 0) : NaN;
    ok(rc && rc.gold === want && sumLines === want,
      `V6: receipt gold ${rc && rc.gold}, Σ lines ${sumLines}, moved ${want} — the toast is built from this`);
    ok(rc && rc.lines.every((l) => l.unit_gold === price(l.item)), 'V6: a receipt line names a non-catalogue unit');
  }

  // ── V2: all-or-nothing on stock ─────────────────────────────────────────
  {
    const g0 = await gold(); const l0 = await ledgerN();
    const before = [await inv('bronze_helm'), await inv('normal_log'), await inv('copper_ore')];
    const r = await send({ lines: [{ item: 'bronze_helm', qty: 1 }, { item: 'normal_log', qty: 999 }, { item: 'copper_ore', qty: 1 }] });
    ok(r.status === 409 && r.body.error === 'insufficient_item',
      `V2: a sweep with one short line returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(r.body.state, 'V2: the insufficient_item refusal carried no envelope for the client to restore the bag from');
    const after = [await inv('bronze_helm'), await inv('normal_log'), await inv('copper_ore')];
    ok(await gold() === g0 && after.join() === before.join(),
      `V2: A SWEEP HALF-APPLIED — gold ${g0}→${await gold()}, stacks ${before}→${after}`);
    ok(await ledgerN() === l0, 'V2: a refused sweep wrote a ledger row');
  }

  // ── V2: an unknown / unsellable line refuses the whole batch pre-DB ─────
  {
    const t0 = await shopTokens(); const g0 = await gold();
    const worthless = Object.keys(ITEMS).find((id) => price(id) === 0);
    for (const [bad, code] of [['not_a_real_item_zzz', 'unknown_item'], [worthless, 'item_not_sellable']]) {
      const r = await send({ lines: [{ item: 'copper_ore', qty: 1 }, { item: bad, qty: 1 }] });
      ok(r.status === 409 && r.body.error === code && r.body.line === 1,
        `V2: a ${code} second line returned ${r.status} ${JSON.stringify(r.body).slice(0, 200)} — want the whole batch refused, naming line 1`);
    }
    ok(await gold() === g0 && await inv('copper_ore') === 20, 'V2: a refused batch sold its good line anyway');
    ok(await shopTokens() === t0, 'V2: a catalogue refusal spent a rate token — it must be answered before the gate');
  }

  // ── V4: the cap, and shape refusals ─────────────────────────────────────
  {
    const r0 = await send({ lines: Array.from({ length: req.MAX_SELL_LINES + 1 }, (_, i) => ({ item: `x${i}`, qty: 1 })) });
    ok(r0.status === 400 && r0.body.error === 'bad_lines', `V4: an over-cap body returned ${JSON.stringify(r0.body).slice(0, 160)}`);
    const r1 = await send({ lines: [{ item: 'copper_ore', qty: 1 }, { item: 'copper_ore', qty: 1 }] });
    ok(r1.status === 400 && r1.body.error === 'bad_lines', `V4: a duplicate-line body returned ${JSON.stringify(r1.body).slice(0, 160)}`);
    const r2 = await sell.runVendorSellMany({ exec, user: uid, slot: 0, intentId: null, lines: [{ item: 'copper_ore', qty: 1 }] });
    ok(r2.status === 400 && r2.body.error === 'missing_intent_id', 'V4: a keyless sweep was not refused');

    /* A FULL-CAP sweep applies: MAX_SELL_LINES real sellable kinds in one delta. */
    const ids = Object.keys(ITEMS).filter((id) => price(id) > 0 && price(id) <= 50
      && !['bronze_helm', 'normal_log', 'copper_ore'].includes(id)).slice(0, req.MAX_SELL_LINES);
    ok(ids.length === req.MAX_SELL_LINES, `V4-HARNESS: only ${ids.length} cheap sellable items in the catalogue`);
    const grant = {}; for (const id of ids) grant[id] = 1;
    const ga = await admin({ items: grant });
    ok(ga && ga.ok === true, `V4-HARNESS: the full-cap fixture was refused ${JSON.stringify(ga).slice(0, 200)}`);
    const g0 = await gold();
    const r = await send({ lines: ids.map((id) => ({ item: id, qty: 1 })) });
    ok(r.status === 200, `V4: a full-cap sweep (${ids.length} lines) was refused — ${JSON.stringify(r.body).slice(0, 200)}`);
    ok(await gold() - g0 === ids.reduce((s, id) => s + price(id), 0), 'V4: the full-cap sweep paid the wrong sum');
  }

  // ── V5: idempotency ────────────────────────────────────────────────────
  {
    const key = crypto.randomUUID();
    const lines = [{ item: 'copper_ore', qty: 3 }, { item: 'normal_log', qty: 2 }];
    const a = await send({ lines }, key);
    ok(a.status === 200 && a.body.ok === true, `V5: first sweep refused ${JSON.stringify(a.body).slice(0, 200)}`);
    const g1 = await gold(); const c1 = await inv('copper_ore'); const l1 = await ledgerN();
    const b = await send({ lines: [...lines].reverse() }, key);
    ok(b.body.ok === true && b.body.replayed === true, `V5: a replay answered ${JSON.stringify(b.body).slice(0, 200)}`);
    ok(b.body.receipt == null, 'V5: a replay reported a receipt — this invocation moved nothing');
    ok(await gold() === g1 && await inv('copper_ore') === c1 && await ledgerN() === l1,
      'V5: A REPLAY SOLD TWICE — idempotency is broken');
    const c = await send({ lines: [{ item: 'copper_ore', qty: 4 }, { item: 'normal_log', qty: 2 }] }, key);
    ok(c.body.error === 'intent_mismatch',
      `V5: one key reused for a DIFFERENT sweep of the same length answered ${JSON.stringify(c.body).slice(0, 200)} — want intent_mismatch`);
    ok(await gold() === g1 && await inv('copper_ore') === c1, 'V5: the mismatched sweep moved value');
  }
}

// ════════════════════════════════════════════════════════════════════════
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    for (const [id, mm] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${mm.why}`);
    return;
  }
  const { ITEMS } = await import('../src/data/items.js');
  const { db } = await bootReplay();
  const run = async (patches) => {
    const m = await loadModules(patches);
    await contract(m, ITEMS);
    await behaviour(db, m, ITEMS);
  };

  if (argv.includes('--mutate')) {
    await runMutationProof({
      label: 'vendor-sell-many',
      cases: Object.entries(MUTATIONS).map(([id, mm]) => ({ id, why: mm.why })),
      baseline: () => run(null),
      arm: (id) => run(MUTATIONS[id].patches),
      failures: () => failures,
      reset: () => { failures = 0; problems.length = 0; },
    });
    return;
  }
  await run(null);
  if (failures) {
    console.error('VENDOR-SELL-MANY RED:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('vendor-sell-many: all guards green (V1-V6)');
}

await main();
