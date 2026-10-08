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
// SECOND PROPERTY (b-craft-anchor): no recipe's outputs may vendor for more
// than 1.5x its inputs (findRecipeArbitrage below).
//
// Equal prices are not a loop (zero profit); only vendor > shop is red.
// Exit 0 clean, 1 on any violation (each named with both prices), 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLD_OFFERS, vendorPriceOf, VENDOR_RAW_RATE } from '../supabase/functions/hr-accrue/catalogue.js';
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { recipeInputs } from '../src/core/artisan.js';
import { anchorPaths, baseVendorBid } from '../src/core/vendor.js';

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
  const re = /insert\s+into\s+public\.hr_items\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/gi;
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

/* ── THE SECOND PROPERTY: NO BENCH IS A GOLD PRINTER (b-craft-anchor) ───────
   For every authored recipe with inputs, what its outputs fetch at the vendor
   must not exceed 1.5x what its inputs fetch: outQty x bid(out) <= 1.5 x
   sum(qty x bid(in)). Before the anchor, crafted items bid 100% of book while
   their raw inputs bid 20%, so every bench multiplied gathering gold by ~5
   (tools/econ-sim.mjs: a grinder on the 25M/day cap from day 2). A recipe with
   NO inputs is a gather and is exempt. Integer form (x2 / x3) — no float. */
export function findRecipeArbitrage({ recipes = ARTISAN_RECIPES, price = (id) => vendorPriceOf(ITEMS, id) } = {}) {
  const bad = []; let checked = 0;
  for (const skill of Object.keys(recipes)) {
    for (const r of recipes[skill] || []) {
      if (!r || !r.output) continue;
      const ins = recipeInputs(r);
      const keys = Object.keys(ins);
      if (!keys.length) continue;
      const q = r.outputQty || 1;
      let inGold = 0;
      for (const k of keys) inGold += ins[k] * price(k);
      const outGold = q * price(r.output);
      checked++;
      if (outGold * 2 > inGold * 3) bad.push({ recipe: r.id, out: `${q}x${r.output}`, outGold, inGold });
    }
  }
  return { bad, checked };
}

/* ── THE THIRD PROPERTY: NO BUY → CRAFT → SELL LOOP (Security wave-1 review) ──
   The cheapest PURE-GOLD way to obtain each item — buy it from a gold shop, or
   craft it from things that are themselves bought or crafted from bought
   things, any depth — must cost at least what the vendor bids for it. On main
   before the craft anchor, 7 shop rune blanks (49 g) bound into 58 Earth Runes
   (58 g at 1 g each): a loop that needs no play. Computed as a least fixed
   point from shop unit prices (decreasing from Infinity, so cycles settle);
   costs are exact rationals compared with a 1e-9 tolerance. Items with no
   pure-gold route (they need a gather or a drop) have infinite cost and are
   not a loop. */
export function findShopCraftLoops({ offers = GOLD_OFFERS, recipes = ARTISAN_RECIPES, price = (id) => vendorPriceOf(ITEMS, id) } = {}) {
  const cost = new Map();
  const via = new Map();
  for (const id of Object.keys(offers)) {
    const o = offers[id];
    if (!o || o.grant.length !== 1 || !(o.grant[0].amount > 0)) continue;
    const g = o.grant[0];
    const unit = o.gold / g.amount;
    if (!(unit >= (cost.get(g.id) ?? Infinity))) { cost.set(g.id, unit); via.set(g.id, `buy ${id}`); }
  }
  const paths = [];
  for (const skill of Object.keys(recipes)) for (const r of recipes[skill] || []) {
    if (!r || !r.output) continue;
    const ins = recipeInputs(r);
    if (Object.keys(ins).length) paths.push({ r, ins, q: r.outputQty || 1 });
  }
  for (let round = 0, moved = true; moved && round < 1000; round++) {
    moved = false;
    for (const { r, ins, q } of paths) {
      let c = 0;
      for (const k of Object.keys(ins)) c += ins[k] * (cost.get(k) ?? Infinity);
      c /= q;
      if (c < (cost.get(r.output) ?? Infinity) - 1e-9) { cost.set(r.output, c); via.set(r.output, `craft ${r.id}`); moved = true; }
    }
  }
  const bad = [];
  for (const [id, c] of cost) {
    const bid = price(id);
    if (bid > c + 1e-9) bad.push({ item: id, cost: c, bid, via: via.get(id) });
  }
  return { bad, reachable: cost.size };
}

function report({ bad, priced, total }, recipe, loops) {
  if (total === 0 || priced === 0) throw new HarnessError(`vacuous: ${total} gold offers, ${priced} with a vendor bid`);
  if (recipe.checked < 100) throw new HarnessError(`vacuous: only ${recipe.checked} recipes with inputs checked`);
  for (const b of bad) {
    console.log(`  ✗ ${b.offer} (${b.items}): shop ${b.shop}g < vendor ${b.vendor}g (edge ${b.edge}g, hr_items ${b.db}g)`);
  }
  for (const b of recipe.bad) {
    console.log(`  ✗ recipe ${b.recipe}: ${b.out} vendors for ${b.outGold}g, its inputs for ${b.inGold}g (> 1.5x)`);
  }
  if (loops.reachable < 10) throw new HarnessError(`vacuous: only ${loops.reachable} items have a pure-gold route`);
  for (const b of loops.bad) {
    console.log(`  ✗ loop ${b.item}: costs ${b.cost.toFixed(3)}g in pure gold (${b.via}) and vendors for ${b.bid}g`);
  }
  console.log(`vendor-shop-arbitrage: ${total} gold offers, ${priced} vendorable, ${bad.length} violation(s); `
    + `${recipe.checked} recipes, ${recipe.bad.length} over the 1.5x craft anchor; `
    + `${loops.reachable} items buyable-or-craftable from gold, ${loops.bad.length} buy→craft→sell loop(s)`);
  return bad.length || recipe.bad.length || loops.bad.length ? 1 : 0;
}

function selftest() {
  const sqlVal = sqlItemValues();
  const fails = [];
  const clean = findArbitrage({ sqlVal });
  if (clean.bad.length) fails.push(`control: tree is not clean (${clean.bad.map((b) => b.offer).join(', ')})`);
  /* The target's item must NOT be craft-anchored: raising the book value of an
     anchored item rightly does not raise its bid (the anchor caps it), so M2
     would prove nothing about the edge half. */
  const paths = anchorPaths(ARTISAN_RECIPES);
  const target = Object.values(GOLD_OFFERS).find((o) => o.grant.length === 1 && !paths[o.grant[0].id]);
  if (!target) throw new HarnessError('no single-grant offer of an un-anchored item to mutate');
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

  // M4 — the craft anchor removed: every recipe priced at the pre-anchor bid
  // (raw 20%, everything else book) must be caught, by a named recipe.
  const rc = findRecipeArbitrage();
  if (rc.bad.length) fails.push(`control: recipes over the anchor (${rc.bad.slice(0, 3).map((b) => b.recipe).join(', ')})`);
  const m4 = findRecipeArbitrage({ price: (id) => baseVendorBid(Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null) });
  if (!m4.bad.some((b) => b.recipe === 'forge_dawn_platebody')) fails.push('M4 anchor removed: forge_dawn_platebody not caught by name');

  // M5 — a 2x markup (one bench pays double its inputs) must be caught.
  const m5 = findRecipeArbitrage({ price: (id) => (id === 'dawn_platebody' ? 2 * 5 * vendorPriceOf(ITEMS, 'dawn_bar') : vendorPriceOf(ITEMS, id)) });
  if (!m5.bad.some((b) => b.recipe === 'forge_dawn_platebody')) fails.push('M5 2x markup on dawn_platebody: not caught by name');

  // M6 — main's pre-anchor bids: shop rune blanks -> deepbind_earth -> 58 Earth
  // Runes at 1 g must be caught as a buy→craft→sell loop, by name.
  const lc = findShopCraftLoops();
  if (lc.bad.length) fails.push(`control: buy→craft→sell loops (${lc.bad.slice(0, 3).map((b) => b.item).join(', ')})`);
  const m6 = findShopCraftLoops({ price: (id) => baseVendorBid(Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null) });
  if (!m6.bad.some((b) => b.item === 'earth_rune')) fails.push('M6 pre-anchor bids: the rune-blank → earth_rune loop not caught by name');
  // M7 — the CRAFT leg, two steps deep, against the shipped bids: a planted
  // recipe binding shop rune blanks into an intermediate that crafts into
  // something the vendor pays 5,000 g for. No shipped recipe is made purely of
  // shop stock with a vendor-bought output (measured), so the link is planted.
  const m7 = findShopCraftLoops({ recipes: { ...ARTISAN_RECIPES, __m7: [
    { id: '__m7_a', inputs: { rune_blank: 2 }, output: '__m7_mid' },
    { id: '__m7_b', inputs: { __m7_mid: 1 }, output: 'dragon_relic' },
  ] } });
  if (!(vendorPriceOf(ITEMS, 'dragon_relic') > 100)) throw new HarnessError('dragon_relic no longer bids > 100 g; pick another M7 target');
  if (!m7.bad.some((b) => b.item === 'dragon_relic')) fails.push('M7 planted rune_blank → mid → dragon_relic: not caught by name');

  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`vendor-shop-arbitrage --selftest: control + 7 mutants on ${target.id} (${item}) and the recipe anchor, ${fails.length} failure(s)`);
  return fails.length ? 1 : 0;
}

try {
  process.exitCode = process.argv.includes('--selftest')
    ? selftest()
    : report(findArbitrage({ sqlVal: sqlItemValues() }), findRecipeArbitrage(), findShopCraftLoops());
} catch (e) {
  console.error(`vendor-shop-arbitrage: HARNESS ${e instanceof HarnessError ? '' : 'CRASH '}${e.message}`);
  process.exitCode = 2;
}
