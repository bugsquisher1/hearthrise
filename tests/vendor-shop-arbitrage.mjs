#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/vendor-shop-arbitrage.mjs — NO BUY-LOW / SELL-HIGH LOOP AGAINST THE NPCs
//
//   node tests/vendor-shop-arbitrage.mjs             the guard
//   node tests/vendor-shop-arbitrage.mjs --selftest  mutation proof
//
// THE PROPERTY (b565 strict margin, game-designer ruling). For every offer the
// server will SELL for gold (`shop_buy`), the gold the NPC vendor PAYS for
// everything that offer grants (`vendor_sell`) must not exceed HALF the gold the
// offer costs (SHOP_BUYBACK_RATE × shop price). At 1.00 a buy -> sell loop is a
// zero-loss laundering channel; above it, an unbounded gold faucet.
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
//                    the same raw/rate/buy-back formula. The guard takes the HIGHER of
//                    the two, so a drift between the payload and the catalogue
//                    can only make it stricter.
//   An `update public.hr_items` that writes `value` in a shape this parser does
//   not understand FAILS CLOSED (exit 2) rather than being skipped.
//
// THE CRAFT LOOP (W0 Security follow-up, 2026-10-10). A recipe whose inputs can
// ALL be bought for gold is a second buy -> craft -> sell loop: its output's
// vendor bid (x outputQty) must not exceed MARGIN x the gold cost of buying its
// inputs at the cheapest shop unit price. Security's mutant — a 200g Steel Bar
// offer, a +100 loop through the platebody — stayed green before this arm.
//
// Only vendor > SHOP_BUYBACK_RATE × shop is red; exactly half is the ruling.
// Exit 0 clean, 1 on any violation (each named with both prices), 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CAT from '../supabase/functions/hr-accrue/catalogue.js';
import { writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { GOLD_OFFERS, VENDOR_RAW_RATE, SHOP_BUYBACK_RATE, SHOP_UNIT_PRICE } = CAT;
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { recipeInputs } from '../src/core/artisan.js';

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
  const bid = it && it.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : v;
  const unit = Object.prototype.hasOwnProperty.call(SHOP_UNIT_PRICE, id) ? SHOP_UNIT_PRICE[id] : 0;
  return unit > 0 ? Math.min(bid, Math.max(1, Math.floor(SHOP_BUYBACK_RATE * unit))) : bid;
}

/** The STRICT margin. Never read from the module under test, so a mutant that
    raises SHOP_BUYBACK_RATE cannot also raise the bar it is measured against. */
const MARGIN = 0.5;

/** Pure: every offer whose vendor revenue beats half its price. */
export function findArbitrage({ offers = GOLD_OFFERS, items = ITEMS, sqlVal, vendorPriceOf = CAT.vendorPriceOf }) {
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
    if (sell > MARGIN * o.gold) {
      bad.push({ offer: id, items: o.grant.map((g) => `${g.amount}x${g.id}`).join('+'), shop: o.gold, vendor: sell, edge, db });
    }
  }
  return { bad, priced, total: Object.keys(offers).length };
}

/* KNOWN CRAFT LOOPS — found by this arm the day it landed (W0, 2026-10-10), held
   at their MEASURED numbers and SHRINK-ONLY. Blank Runes are sold 20 for 140g,
   and binding them returns 100% (air) to 107-118% (earth) of the gold spent at
   book value: the Runecrafting first rungs are a tiny faucet. Owner: lane w0e
   (Runecrafting from level 1 / ammo rework) with the Game Designer's values.
   A row whose loop GROWS (vendor or cost moves) fails; a row that is no longer
   a loop fails as stale until deleted; anything not listed fails outright. */
const KNOWN_CRAFT_LOOPS = Object.freeze({
  bind_air_runes:   { vendor: 42, cost: 42 },
  bind_earth_runes: { vendor: 45, cost: 42 },
  deepbind_earth:   { vendor: 58, cost: 49 },
});

/** Cheapest gold price of ONE unit of each item, over single-item gold offers. */
function unitPrices(offers) {
  const unit = Object.create(null);
  for (const id of Object.keys(offers)) {
    const o = offers[id];
    if (!o || !Array.isArray(o.grant) || o.grant.length !== 1 || !(o.gold > 0)) continue;
    const g = o.grant[0]; const each = o.gold / g.amount;
    if (!(g.amount > 0)) continue;
    if (!(g.id in unit) || each < unit[g.id]) unit[g.id] = each;
  }
  return unit;
}

/** Pure: every recipe whose inputs are all shop-buyable and whose output sells
    for more than MARGIN x the inputs' gold cost. */
export function findCraftArbitrage({ offers = GOLD_OFFERS, items = ITEMS, recipes = ARTISAN_RECIPES, sqlVal, vendorPriceOf = CAT.vendorPriceOf }) {
  const unit = unitPrices(offers);
  const bad = []; let buyable = 0;
  for (const skill of Object.keys(recipes)) {
    for (const rcp of recipes[skill] || []) {
      if (!rcp || !rcp.output) continue;
      const inp = recipeInputs(rcp);
      const ids = Object.keys(inp);
      if (!ids.length || !ids.every((id) => id in unit)) continue;
      buyable++;
      const cost = ids.reduce((t, id) => t + inp[id] * unit[id], 0);
      const qty = Math.max(1, Number(rcp.outputQty) || 1);
      const sell = qty * Math.max(vendorPriceOf(items, rcp.output), sqlBid(sqlVal, items, rcp.output));
      if (sell > MARGIN * cost) bad.push({ recipe: rcp.id, output: rcp.output, cost, vendor: sell });
    }
  }
  return { bad, buyable };
}

/** Splits the craft findings against KNOWN_CRAFT_LOOPS. */
export function judgeCraft({ bad }, known = KNOWN_CRAFT_LOOPS) {
  const fails = [], held = [];
  for (const b of bad) {
    const k = Object.prototype.hasOwnProperty.call(known, b.recipe) ? known[b.recipe] : null;
    if (k && b.vendor <= k.vendor && b.cost >= k.cost) held.push(b);
    else fails.push(`craft loop ${b.recipe} -> ${b.output}: vendor ${b.vendor}g > ${MARGIN} × inputs ${b.cost}g bought for gold`
      + (k ? ` (GREW past the held ${k.vendor}g/${k.cost}g)` : ''));
  }
  for (const id of Object.keys(known)) if (!bad.some((b) => b.recipe === id)) fails.push(`stale KNOWN_CRAFT_LOOPS row ${id} — no longer a loop, delete it`);
  return { fails, held };
}

function reportCraft(found) {
  const { fails, held } = judgeCraft(found);
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`vendor-shop-arbitrage: ${found.buyable} recipe(s) with every input shop-buyable, ${fails.length} craft-loop violation(s), ${held.length} known loop(s) held (w0e)`);
  return fails.length ? 1 : 0;
}

function report({ bad, priced, total }) {
  if (total === 0 || priced === 0) throw new HarnessError(`vacuous: ${total} gold offers, ${priced} with a vendor bid`);
  for (const b of bad) {
    console.log(`  ✗ ${b.offer} (${b.items}): vendor ${b.vendor}g > ${MARGIN} × shop ${b.shop}g (edge ${b.edge}g, hr_items ${b.db}g)`);
  }
  console.log(`vendor-shop-arbitrage: ${total} gold offers, ${priced} vendorable, ${bad.length} violation(s)`);
  return bad.length ? 1 : 0;
}

/** Import catalogue.js with ONE textual patch, from a sibling temp file so its
    relative imports resolve. The anchor must match exactly once. */
async function mutantCatalogue(find, repl) {
  const src = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'catalogue.js');
  const text = readFileSync(src, 'utf8');
  if (text.split(find).length !== 2) throw new HarnessError(`mutant anchor matched ${text.split(find).length - 1}x: ${find}`);
  const tmp = join(ROOT, 'supabase', 'functions', 'hr-accrue', `.catalogue.mutant-${process.pid}-${Date.now()}.js`);
  writeFileSync(tmp, text.replace(find, repl));
  try { return await import(pathToFileURL(tmp).href); } finally { unlinkSync(tmp); }
}

async function selftest() {
  const sqlVal = sqlItemValues();
  const fails = [];
  const clean = findArbitrage({ sqlVal });
  if (clean.bad.length) fails.push(`control: tree is not clean (${clean.bad.map((b) => b.offer).join(', ')})`);
  /* The planted victim: a starter offer whose book value (110g) is well above the half-price bid (W0: steel_platebody, the b565 victim, left the shop). */
  const target = GOLD_OFFERS['equip.stone_maul'];
  if (!target || target.grant.length !== 1) throw new HarnessError('equip.stone_maul is not a single-grant gold offer');
  const caught = (r) => r.bad.some((b) => b.offer === target.id);

  // M1 — the edge cap removed: vendorPriceOf bids book value again.
  const m1 = await mutantCatalogue(
    '  return unit > 0 ? Math.min(bid, Math.max(1, Math.floor(SHOP_BUYBACK_RATE * unit))) : bid;',
    '  return bid;');
  if (!caught(findArbitrage({ sqlVal, vendorPriceOf: m1.vendorPriceOf }))) fails.push('M1 buy-back cap removed: not caught by name');

  // M2 — the rate drifts above the ruling (0.5 -> 0.6).
  const m2 = await mutantCatalogue('export const SHOP_BUYBACK_RATE = 0.5;', 'export const SHOP_BUYBACK_RATE = 0.6;');
  if (!caught(findArbitrage({ sqlVal, vendorPriceOf: m2.vendorPriceOf }))) fails.push('M2 SHOP_BUYBACK_RATE=0.6: not caught by name');

  // M3 — the cheapest-unit index loses the item (cap silently skipped).
  const m3 = await mutantCatalogue(
    '  const unit = catalogueGet(SHOP_UNIT_PRICE, id);',
    "  const unit = id === 'stone_maul' ? 0 : catalogueGet(SHOP_UNIT_PRICE, id);");
  if (!caught(findArbitrage({ sqlVal, vendorPriceOf: m3.vendorPriceOf }))) fails.push('M3 unit index drops stone_maul: not caught by name');

  // M4 — an unparseable later write to hr_items.value must fail closed.
  const item = target.grant[0].id;
  const last = ORDER[ORDER.length - 1];
  try {
    sqlItemValues(ORDER, (f) => readMig(f) + (f === last ? `
update public.hr_items set value = 1 where item_id = '${item}';
` : ''));
    fails.push('M4 unparsed hr_items.value UPDATE: accepted silently');
  } catch (e) { if (!(e instanceof HarnessError)) throw e; }

  // M5 — Security's mutant: a 200g Steel Bar gold offer opens buy-bars -> forge
  //      platebody -> vendor. The craft arm must name the recipe.
  const cleanCraft = findCraftArbitrage({ sqlVal });
  if (judgeCraft(cleanCraft).fails.length) fails.push(`craft control: tree is not clean (${judgeCraft(cleanCraft).fails.join('; ')})`);
  const mutOffers = Object.assign(Object.create(null), GOLD_OFFERS, {
    'equip.__mut_steel_bar': { id: 'equip.__mut_steel_bar', gold: 200, grant: [{ id: 'steel_bar', amount: 1 }] } });
  const m5 = findCraftArbitrage({ offers: mutOffers, sqlVal });
  if (!judgeCraft(m5).fails.some((f) => / -> steel_platebody:/.test(f))) fails.push('M5 200g Steel Bar offer (platebody loop): not caught');
  // M6 — a held loop that GROWS (the blank-rune offer halves in price) must go red.
  const cheapBlanks = Object.assign(Object.create(null), GOLD_OFFERS);
  cheapBlanks['seed.rune_blank'] = Object.assign({}, GOLD_OFFERS['seed.rune_blank'], { gold: 70 });
  if (!judgeCraft(findCraftArbitrage({ offers: cheapBlanks, sqlVal })).fails.some((f) => /GREW/.test(f))) fails.push('M6 a held rune loop grew: not caught');

  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`vendor-shop-arbitrage --selftest: control + 6 mutants on ${target.id} (${item}), ${fails.length} failure(s)`);
  return fails.length ? 1 : 0;
}

try {
  process.exitCode = process.argv.includes('--selftest')
    ? await selftest()
    : (() => { const sv = sqlItemValues(); return report(findArbitrage({ sqlVal: sv })) | reportCraft(findCraftArbitrage({ sqlVal: sv })); })();
} catch (e) {
  console.error(`vendor-shop-arbitrage: HARNESS ${e instanceof HarnessError ? '' : 'CRASH '}${e.message}`);
  process.exitCode = 2;
}
