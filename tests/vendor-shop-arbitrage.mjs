#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/vendor-shop-arbitrage.mjs — NO BUY-LOW / SELL-HIGH LOOP AGAINST THE NPCs
//
//   node tests/vendor-shop-arbitrage.mjs             the guard
//   node tests/vendor-shop-arbitrage.mjs --selftest  mutation proof
//
// THE PROPERTY. For every offer the server will SELL for gold (`shop_buy`), the
// gold the NPC vendor PAYS for everything that offer grants (`vendor_sell`)
// must not exceed the gold the offer costs. Otherwise buy -> sell -> repeat is
// an unbounded gold faucet that needs no play at all.
//
// THE AUTHORITATIVE SOURCES — both server-side, never the client mirror:
//   SHOP PRICE   supabase/functions/hr-accrue/catalogue.js GOLD_OFFERS — the
//                exact object shop-buy.js charges from (no SQL shop table
//                exists for item-for-gold; hr_unlock_offers grants unlocks and
//                hr_qm_offers is priced in scrip, so neither can loop gold).
//   VENDOR BID   (a) the edge: catalogue.js vendorPriceOf(ITEMS, id), the
//                    function vendor-sell.js pays from;
//                (b) the database: public.hr_items.value as the LAST migration
//                    in tests/schema-apply-order.json leaves it, run through
//                    the same raw/rate formula. The guard takes the HIGHER of
//                    the two, so a drift between the payload and the catalogue
//                    can only make it stricter.
//   An `update public.hr_items` that writes `value` in a shape this parser does
//   not understand FAILS CLOSED (exit 2) rather than being skipped.
//
// Equal prices are not a loop (zero profit); only vendor > shop is red.
// Exit 0 clean, 1 on any violation (each named with both prices), 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLD_OFFERS, vendorPriceOf, VENDOR_RAW_RATE } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const readMig = (f) => readFileSync(join(MIG, f), 'utf8');
const ORDER = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;

class HarnessError extends Error {}

/** Split one SQL VALUES tuple body into raw tokens ('' escapes honoured). */
function sqlTuple(body) {
  const out = []; let i = 0;
  while (i < body.length) {
    while (body[i] === ' ' || body[i] === ',') i++;
    if (i >= body.length) break;
    if (body[i] === "'") {
      let s = ''; i++;
      while (i < body.length) {
        if (body[i] === "'" && body[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (body[i] === "'") { i++; break; }
        s += body[i++];
      }
      out.push(s);
    } else {
      let s = '';
      while (i < body.length && body[i] !== ',') s += body[i++];
      out.push(s.trim());
    }
  }
  return out;
}

/** Literal `insert into public.hr_items (cols) values (...),(...);` */
function literalInserts(sql, apply) {
  /* `on conflict …` is not a tuple: a generated delta (tools/generated-freeze.mjs)
     upserts, and its conflict list `(item_id)` would otherwise parse as a row. */
  const re = /insert\s+into\s+public\.hr_items\s*\(([^)]*)\)\s*values\s*([\s\S]*?)(?:\bon\s+conflict\b[\s\S]*?)?;/gi;
  let m, n = 0;
  while ((m = re.exec(sql))) {
    const cols = m[1].split(',').map((c) => c.trim());
    const iId = cols.indexOf('item_id'), iV = cols.indexOf('value');
    if (iId < 0 || iV < 0) throw new HarnessError('hr_items insert without item_id/value columns');
    const tuples = m[2].match(/\((?:[^()']|'(?:[^']|'')*')*\)/g) || [];
    for (const t of tuples) { const v = sqlTuple(t.slice(1, -1)); apply(v[iId], Number(v[iV])); n++; }
  }
  return n;
}

/** `insert into public.hr_items ... from jsonb_array_elements(<var>) ... (e->>N)::bigint as value`. */
function jsonbInserts(sql, apply) {
  const re = /insert\s+into\s+public\.hr_items\b[\s\S]*?jsonb_array_elements\((\w+)\)([\s\S]*?);/gi;
  let m, n = 0;
  while ((m = re.exec(sql))) {
    const id = /e->>(\d+)\)?\s+as\s+item_id/.exec(m[2]);
    const val = /\(e->>(\d+)\)::bigint\s+as\s+value/.exec(m[2]);
    const lit = new RegExp(`${m[1]}\\s+constant\\s+jsonb\\s*:=\\s*'([\\s\\S]*?)'::jsonb`).exec(sql);
    if (!id || !val || !lit) throw new HarnessError(`unparsed jsonb hr_items insert from ${m[1]}`);
    for (const row of JSON.parse(lit[1])) { apply(row[+id[1]], Number(row[+val[1]])); n++; }
  }
  return n;
}

/** hr_items.value per item, as the apply order leaves it. */
export function sqlItemValues(order = ORDER, read = readMig) {
  const val = new Map(); let files = 0;
  for (const f of order) {
    const sql = read(f).replace(/--[^\n]*/g, '');
    if (!/public\.hr_items\b/i.test(sql)) continue;
    if (/delete\s+from\s+public\.hr_items\s*;/i.test(sql)) val.clear();
    for (const u of sql.matchAll(/update\s+public\.hr_items\b[\s\S]*?\bset\b([\s\S]*?)\b(from|where)\b/gi)) {
      if (/\bvalue\s*=/.test(u[1])) throw new HarnessError(`${f}: unparsed hr_items.value UPDATE — teach this guard its shape`);
    }
    const apply = (id, v) => {
      if (typeof id !== 'string' || !Number.isFinite(v)) throw new HarnessError(`${f}: bad hr_items row ${id}=${v}`);
      val.set(id, v);
    };
    if (literalInserts(sql, apply) + jsonbInserts(sql, apply) > 0) files++;
  }
  if (val.size < 100 || files === 0) throw new HarnessError(`hr_items parse is vacuous (${val.size} rows, ${files} files)`);
  return val;
}

/** The SQL-side bid: same formula as vendorPriceOf, `value` from the database. */
function sqlBid(sqlVal, items, id) {
  const v = sqlVal.get(id) || 0;
  if (!(v > 0)) return 0;
  const it = Object.prototype.hasOwnProperty.call(items, id) ? items[id] : null;
  return it && it.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : v;
}

/** Pure: every offer whose vendor revenue beats its price. */
export function findArbitrage({ offers = GOLD_OFFERS, items = ITEMS, sqlVal }) {
  const bad = []; let priced = 0;
  for (const id of Object.keys(offers)) {
    const o = offers[id];
    let edge = 0, db = 0;
    for (const g of o.grant) {
      edge += g.amount * vendorPriceOf(items, g.id);
      db += g.amount * sqlBid(sqlVal, items, g.id);
    }
    const sell = Math.max(edge, db);
    if (sell > 0) priced++;
    if (sell > o.gold) {
      bad.push({ offer: id, items: o.grant.map((g) => `${g.amount}x${g.id}`).join('+'), shop: o.gold, vendor: sell, edge, db });
    }
  }
  return { bad, priced, total: Object.keys(offers).length };
}

function report({ bad, priced, total }) {
  if (total === 0 || priced === 0) throw new HarnessError(`vacuous: ${total} gold offers, ${priced} with a vendor bid`);
  for (const b of bad) {
    console.log(`  ✗ ${b.offer} (${b.items}): shop ${b.shop}g < vendor ${b.vendor}g (edge ${b.edge}g, hr_items ${b.db}g)`);
  }
  console.log(`vendor-shop-arbitrage: ${total} gold offers, ${priced} vendorable, ${bad.length} violation(s)`);
  return bad.length ? 1 : 0;
}

function selftest() {
  const sqlVal = sqlItemValues();
  const fails = [];
  const clean = findArbitrage({ sqlVal });
  if (clean.bad.length) fails.push(`control: tree is not clean (${clean.bad.map((b) => b.offer).join(', ')})`);
  const target = Object.values(GOLD_OFFERS).find((o) => o.grant.length === 1);
  if (!target) throw new HarnessError('no single-grant offer to mutate');
  const item = target.grant[0].id;
  const high = target.gold * 10 + 10; // above the shop price even through the 20% raw rate

  // M1 — the database: the item's hr_items.value raised in the catalogue file's own text.
  const cat = '2026-08-11-catalogue.generated.sql';
  const text = readMig(cat);
  const rowRe = new RegExp(`(\\('${item}',(?:'(?:[^']|'')*'|[^,]*),[^,]*,[^,]*,)(\\d+)`);
  if (!rowRe.test(text)) throw new HarnessError(`cannot find ${item} in ${cat}`);
  const mutSql = sqlItemValues(ORDER, (f) => (f === cat ? text.replace(rowRe, `$1${high}`) : readMig(f)));
  const m1 = findArbitrage({ sqlVal: mutSql });
  if (!m1.bad.some((b) => b.offer === target.id)) fails.push(`M1 hr_items.value ${item}=${high}: not caught by name`);

  // M2 — the edge payload: ITEMS[item].v raised; the database untouched.
  const mutItems = { ...ITEMS, [item]: { ...ITEMS[item], v: high } };
  const m2 = findArbitrage({ items: mutItems, sqlVal });
  if (!m2.bad.some((b) => b.offer === target.id)) fails.push(`M2 ITEMS.${item}.v=${high}: not caught by name`);

  // M3 — an unparseable later write to hr_items.value must fail closed.
  const last = ORDER[ORDER.length - 1];
  try {
    sqlItemValues(ORDER, (f) => readMig(f) + (f === last ? `\nupdate public.hr_items set value = 1 where item_id = '${item}';\n` : ''));
    fails.push('M3 unparsed hr_items.value UPDATE: accepted silently');
  } catch (e) { if (!(e instanceof HarnessError)) throw e; }

  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`vendor-shop-arbitrage --selftest: control + 3 mutants on ${target.id} (${item}), ${fails.length} failure(s)`);
  return fails.length ? 1 : 0;
}

try {
  process.exitCode = process.argv.includes('--selftest')
    ? selftest()
    : report(findArbitrage({ sqlVal: sqlItemValues() }));
} catch (e) {
  console.error(`vendor-shop-arbitrage: HARNESS ${e instanceof HarnessError ? '' : 'CRASH '}${e.message}`);
  process.exitCode = 2;
}
