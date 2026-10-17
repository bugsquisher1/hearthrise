#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-shops.mjs — the price catalogue, EXTRACTED, with a drift guard
//
// WHY THIS EXISTS
//   A server that authorises a spend must own the price. Today it owns none
//   of them: tools/gen-catalogues.mjs reads six data modules and not one
//   carries a purchase price. Every price in Hearthrise lives in a shop table
//   scattered across seven files, and MEASURED — 99 of the 128 offers are
//   inside src/legacy.js, a CLASSIC SCRIPT, which cannot be imported by an
//   ESM module or by Deno (the b222 trap). Prices are therefore unreachable
//   from the one place the economy is about to be decided.
//
//   There were two ways out. Refactor legacy.js's data seam (move the tables
//   to src/data/ and re-point every reader), or emit a SECOND COPY with a
//   guard that fails the build the moment the two disagree. The refactor is
//   the better end state and the worse mid-program move: it touches the file
//   every other agent is in, mid-flight, for zero runtime benefit. So: a
//   generated file plus a guard — the tools/gen-catalogues.mjs precedent, and
//   the B338-1 starting-kit precedent before it.
//
//   PHASE ONE CHANGES NO RUNTIME BEHAVIOUR. Nothing imports the generated
//   file yet. Its whole job is to exist, to be correct, and to be *provably*
//   still correct on every push. The guard is the deliverable; the data is
//   the by-product.
//
// WHAT IT READS  (every table is asserted present and non-empty)
//   src/legacy.js            ROOMS · PLOT_BUILDINGS · SEED_SHOP · EQUIP_SHOP ·
//                            BANK_SPACE (the gold rung, a DERIVED price)
//   src/features/homestead.js  property TIERS
//   src/features/workers.js    HIRE_COSTS
//   src/multi-character.js     SLOT_COSTS_GOLD
//   src/screens/shop-counter.js  the vendor rates (DERIVED prices)
//
//   src/data/companions.js     'shop:<gold>[:<skill><lv>]' source strings (HELD)
//
//   Demolition (2026-10-14): the theme, cosmetic, IAP, bank-gem, bounty, trait,
//   farm-plot-deed and dungeon-entry tables were deleted with their
//   systems, and character slots are priced in gold (designer ruling).
//
// HOW IT READS legacy.js
//   Not by regex over the price. Anchors are located, the literal is SLICED
//   with a brace matcher that skips comments and strings, and the slice is
//   EVALUATED by the JS engine. A regex that scrapes `cost:(\d+)` cannot tell
//   a price from a level requirement and cannot see a table that moved; an
//   evaluated slice either produces the real object or throws. Every anchor
//   must match EXACTLY ONCE — zero means the table was renamed, two means the
//   anchor is ambiguous, and both are build failures rather than guesses.
//
// USAGE
//   node tools/gen-shops.mjs            → (re)write src/data/shops.js
//   node tools/gen-shops.mjs --check    → exit 1 if the committed file differs
//                                         from a fresh extraction
//   node tools/gen-shops.mjs --report   → print the extraction, table by table
//
//   `--check` is a PREFLIGHT in tests/run-smoke.mjs. Drift fails the build.
//   That is the entire point of the exercise: the second copy is only
//   defensible while something proves it is not diverging.
//
// THE FAILURE MODE THIS FILE IS BUILT AGAINST
//   A drift guard that cannot see drift is this repo's signature failure —
//   the "assertion that asserts nothing" family, at instance #15. If an anchor
//   silently missed, this generator would emit an empty table, `--check`
//   would compare empty to empty, and the guard would go green forever while
//   asserting nothing. So: a table that extracts ZERO rows is a hard failure,
//   independent of the diff. See EMPTY-TABLE TRIPWIRE below.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/* The anchor/brace-match/evaluate slicer, shared with tools/gen-perks.mjs.
   It used to be two local functions here; a SECOND generator needing the same
   trick is exactly when a helper stops being local. Moving it changed no
   behaviour, and `--check` passing is the proof: the catalogue digest hashes
   the extracted DATA, so any difference in the slicer moves it. */
import { makeDie, sliceLiteral as sliceLiteral_, sliceNumber as sliceNumber_ }
  from './lib/slice-literal.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'src', 'data', 'shops.js');

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

const die = makeDie('gen-shops');

// ── 1. Slice a literal out of a classic script ───────────────────────────
// Both helpers now live in tools/lib/slice-literal.mjs (shared with
// tools/gen-perks.mjs); these two lines bind `die` so every call site below
// reads exactly as it did before the move.
const sliceLiteral = (src, anchor, where) => sliceLiteral_(src, anchor, where, die);
const sliceNumber  = (src, decl, where)   => sliceNumber_(src, decl, where, die);

// ── 2. THE COST SHAPE ────────────────────────────────────────────────────
// One line shape, used on BOTH sides of every offer:
//
//     { kind, id, amount }
//
//   kind    the domain the id lives in — and, for a payment, WHICH SERVER
//           TABLE the spend debits. This is not decoration: `hearth_token` is
//           BOTH a row in hr_items and a wallet balance
//           (account_wallet.hearth_tokens), measured, so a bare
//           {currency:'hearth_token'} is genuinely ambiguous at the server and
//           the ambiguity is in the one currency the Final Directive says may
//           never be minted. `kind` removes it by construction.
//   id      the item id / currency id / thing being unlocked
//   amount  a non-negative SAFE INTEGER in the smallest unit of `kind`.
//           Money is in CENTS ('$6.99' → 699) — never a float, never a string.
//
// `cost` and `grant` are both ARRAYS of those lines, because multi-part is
// already real on both sides: a room rung costs gold plus up to four
// materials, and an IAP bundle grants gems plus gold plus a theme. Modelling
// one side as a scalar would mean bolting the other on later as a special
// case — which is exactly how the six ad hoc shapes this file replaces got
// there (`cost` a number, `cost` an object, `price` a string, `price` a
// number with a sibling `currency` flag, a colon-delimited source string, and
// a bare positional ladder).
//
// The RPC contract this becomes:
//     hr_shop_buy(p_offer_id text, p_intent_id uuid, p_version bigint)
//   → look the offer up in hr_shop_offers, debit every cost line, credit
//     every grant line, one transaction, one version bump. The client sends
//     an OFFER ID and never a price. Postgres shape is a straight
//     transliteration: hr_shop_lines(offer_id, side, ord, kind, id, amount).
const CURRENCY_KINDS = new Set(['currency', 'item', 'money']);
const GRANT_KINDS = new Set([
  'currency', 'item', 'unlock', 'capacity',
]);
// Currencies that exist as a balance the player holds.
//   gold                     → player_state.gold (per hero; 2026-08-11-player-state.sql)
//   gems/hearth_tokens       → account_wallet (ONE balance per account since
//                              2026-10-19-account-wallet.sql)
const CURRENCIES = {
  gold: { server: 'player_state.gold' },
  gems: { server: 'account_wallet.gems' },
  hearth_tokens: { server: 'account_wallet.hearth_tokens' },
  usd: { server: null },
};

const line = (kind, id, amount) => ({ kind, id, amount });

// ── 3. Extract ───────────────────────────────────────────────────────────
const { ITEMS } = await imp('src/data/items.js');
const { COMPANIONS } = await imp('src/data/companions.js');

const legacy = await read('src/legacy.js');
const homesteadSrc = await read('src/features/homestead.js');
const workersSrc = await read('src/features/workers.js');
const multiCharSrc = await read('src/multi-character.js');

const L = (anchor) => sliceLiteral(legacy, anchor, 'src/legacy.js');

const ROOMS = L('const ROOMS={');
const PLOT_BUILDINGS = L('const PLOT_BUILDINGS={');
const SEED_SHOP = L('const SEED_SHOP=[');
const EQUIP_SHOP = L('const EQUIP_SHOP=[');
const BANK_SPACE = L('var BANK_SPACE = {');
// The vendor bid left legacy.js for the shop SCREEN CONTROLLER with the rest of
// the counter (task #129 phase 2, 2026-09-14) — same slice, new file.
const shopCounterSrc = await read('src/screens/shop-counter.js');
const VENDOR_RAW_RATE = sliceNumber(shopCounterSrc, 'const VENDOR_RAW_RATE', 'src/screens/shop-counter.js');
const SHOP_BUYBACK_RATE = sliceNumber(shopCounterSrc, 'const SHOP_BUYBACK_RATE', 'src/screens/shop-counter.js');

const PROPERTY_TIERS = sliceLiteral(homesteadSrc, 'var TIERS = [', 'src/features/homestead.js');
const HIRE_COSTS = sliceLiteral(workersSrc, 'var HIRE_COSTS = [', 'src/features/workers.js');
const SLOT_COSTS_GOLD = sliceLiteral(multiCharSrc, 'const SLOT_COSTS_GOLD = [', 'src/multi-character.js');

// A room/property/plot `cost` object: `gold` is the currency, every other key
// is an item id consumed from the bag (legacy.js upgradeRoom:4714 —
// `if(k==='gold')G.gold-=v; else removeItem(k,v)`). That branch IS the
// currency/item distinction the shape encodes, read off the code that spends.
const costObject = (obj, where) => Object.keys(obj).sort().map((k) => (
  k === 'gold' ? line('currency', 'gold', obj[k]) : line('item', k, obj[k])
)).sort(costOrder).map((l) => {
  if (l.kind === 'item' && !ITEMS[l.id]) die(`${where} costs "${l.id}", which is not an item in src/data/items.js`);
  return l;
});

// Canonical line order, so a reorder in the source (which is not a price
// change) cannot make the guard cry wolf: currencies first in a fixed order,
// then items alphabetically.
const CURRENCY_ORDER = ['gold', 'gems', 'hearth_tokens', 'usd'];
function costOrder(a, b) {
  const rank = (l) => (l.kind === 'money' ? 0 : l.kind === 'currency' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) === 1) return CURRENCY_ORDER.indexOf(a.id) - CURRENCY_ORDER.indexOf(b.id);
  return a.id.localeCompare(b.id);
}

const tables = [];
const addTable = (meta, offers) => { tables.push({ ...meta, offers }); };

// ── ROOMS — 8 rooms × 5 rungs. cost:{gold, ...materials} ─────────────────
{
  const offers = [];
  for (const roomId of Object.keys(ROOMS).sort()) {
    const r = ROOMS[roomId];
    (r.levels || []).forEach((lv, i) => {
      offers.push({
        id: `room.${roomId}.${i + 1}`,
        name: `${r.name} — ${lv.nm || `Lv ${i + 1}`}`,
        cost: costObject(lv.cost, `ROOMS.${roomId}[${i}]`),
        grant: [line('unlock', `room:${roomId}`, i + 1)],
      });
    });
  }
  addTable({
    table: 'room', origin: 'src/legacy.js', anchor: 'const ROOMS={',
    spends_at: 'legacy.js upgradeRoom()', note: 'rung level is the grant amount',
  }, offers);
}

// ── PLOT_BUILDINGS — repeatable up to `max` ──────────────────────────────
{
  const offers = Object.keys(PLOT_BUILDINGS).sort().map((id) => ({
    id: `plot.${id}`,
    name: PLOT_BUILDINGS[id].name,
    cost: costObject(PLOT_BUILDINGS[id].cost, `PLOT_BUILDINGS.${id}`),
    grant: [line('unlock', `plot:${id}`, 1)],
    repeatable: true,
    max: PLOT_BUILDINGS[id].max ?? null,
  }));
  addTable({
    table: 'plot', origin: 'src/legacy.js', anchor: 'const PLOT_BUILDINGS={',
    spends_at: 'legacy.js buildPlot()',
  }, offers);
}

// ── SEED_SHOP — a BUNDLE price: `cost` gold buys `qty` seeds ─────────────
{
  const offers = SEED_SHOP.map((s) => {
    if (!ITEMS[s.id]) die(`SEED_SHOP sells "${s.id}", which is not an item in src/data/items.js`);
    return {
      id: `seed.${s.id}`,
      name: ITEMS[s.id].n,
      cost: [line('currency', 'gold', s.cost)],
      grant: [line('item', s.id, s.qty)],
      repeatable: true,
    };
  });
  addTable({
    table: 'seed', origin: 'src/legacy.js', anchor: 'const SEED_SHOP=[',
    spends_at: 'legacy.js buyShopItem(id, qty, cost)',
    note: 'the price is per BUNDLE of qty, not per unit',
  }, offers);
}

// ── EQUIP_SHOP — one unit per purchase ───────────────────────────────────
{
  const offers = EQUIP_SHOP.map((s) => {
    if (!ITEMS[s.id]) die(`EQUIP_SHOP sells "${s.id}", which is not an item in src/data/items.js`);
    return {
      id: `equip.${s.id}`,
      name: ITEMS[s.id].n,
      cost: [line('currency', 'gold', s.cost)],
      grant: [line('item', s.id, 1)],
      repeatable: true,
    };
  });
  addTable({
    table: 'equip', origin: 'src/legacy.js', anchor: 'const EQUIP_SHOP=[',
    spends_at: 'legacy.js buyShopItem(id, qty, cost)',
  }, offers);
}

// ── PROPERTY TIERS — homestead.js. Tier 0 (the camp) has cost:null. ──────
{
  const offers = [];
  PROPERTY_TIERS.forEach((t, i) => {
    if (!t.cost) return;                       // the camp is where you start
    offers.push({
      id: `property.${t.id}`,
      name: t.name,
      cost: costObject(t.cost, `homestead TIERS[${i}]`),
      grant: [line('unlock', `property:${t.id}`, i)],
    });
  });
  addTable({
    table: 'property', origin: 'src/features/homestead.js', anchor: 'var TIERS = [',
    spends_at: 'homestead.js upgradeTier()',
    note: 'grant amount is the tier index',
  }, offers);
}

// ── WORKERS — an escalating GOLD LADDER indexed by hires already made.
//    Not a formula: HIRE_COSTS is a table with a clamped index, so the Nth
//    hire has a knowable price and every rung extracts. ─────────────────────
{
  const offers = HIRE_COSTS.map((gold, i) => ({
    id: `worker.${i + 1}`,
    name: `Hire worker #${i + 1}`,
    cost: [line('currency', 'gold', gold)],
    grant: [line('unlock', 'worker', 1)],
    note: i === HIRE_COSTS.length - 1 ? 'and every hire after this one' : undefined,
  }));
  addTable({
    table: 'worker', origin: 'src/features/workers.js', anchor: 'var HIRE_COSTS = [',
    spends_at: 'workers.js hire()',
    note: 'rung N is the price of the Nth hire; the last rung repeats forever',
  }, offers);
}

// ── CHARACTER SLOTS — gold, indexed by slot. Slot 0 is free. ─────────────
{
  const offers = [];
  SLOT_COSTS_GOLD.forEach((gold, i) => {
    if (!gold) return;
    offers.push({
      id: `character_slot.${i}`,
      name: `Character slot ${i + 1}`,
      cost: [line('currency', 'gold', gold)],
      grant: [line('unlock', `character_slot:${i}`, 1)],
    });
  });
  addTable({
    table: 'character_slot', origin: 'src/multi-character.js', anchor: 'const SLOT_COSTS_GOLD = [',
    spends_at: 'multi-character.js unlockSlot()',
  }, offers);
}

/* The companion table stays while companions are HELD (their engine leaves with
   lane C2): the edge companion catalogue still sells these four, and the unlock
   offers derive from this file. */
// ── COMPANIONS — the price is inside a colon-delimited SOURCE STRING,
//    'shop:<gold>[:<skill><lv>]', parsed at render time by parseSource() and
//    handed to _buyCompanion(id, price) through the DOM. ────────────────────
{
  const offers = [];
  for (const id of Object.keys(COMPANIONS).sort()) {
    const src = String(COMPANIONS[id].source || '');
    if (!src.startsWith('shop:')) continue;
    const parts = src.split(':');
    const gold = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(gold)) die(`COMPANIONS.${id}.source = ${JSON.stringify(src)} has no parsable price`);
    const req = parts[2] ? /^([a-z]+?)(\d+)$/.exec(parts[2]) : null;
    if (parts[2] && !req) die(`COMPANIONS.${id}.source requirement ${JSON.stringify(parts[2])} does not parse`);
    offers.push({
      id: `companion.${id}`,
      name: COMPANIONS[id].n,
      cost: [line('currency', 'gold', gold)],
      grant: [line('unlock', `companion:${id}`, 1)],
      reqSkill: req ? req[1] : null,
      reqLv: req ? Number(req[2]) : null,
    });
  }
  addTable({
    table: 'companion', origin: 'src/data/companions.js', anchor: "source:'shop:…'",
    spends_at: 'legacy.js _buyCompanion(id, price)',
    note: 'price is embedded in a string, not a field',
  }, offers);
}

// ── 4. THE HARD CASES — declared, never invented ─────────────────────────
// A price that a regex cannot see is not a price that stops existing. These
// spend sites compute their cost at call time. They are emitted as DATA,
// with the formula written out, so a server implementer reading shops.js is
// told plainly that these are missing rather than being handed a catalogue
// that looks complete. hr_shop_buy() must REFUSE an offer id it cannot find;
// it must never fall back to a default.
const DERIVED_PRICES = [
  {
    id: 'bank.gold',
    name: 'Bank space (gold rung)',
    where: 'src/legacy.js bankGoldCost() → buyBankSpaceGold()',
    currency: 'gold',
    formula: 'round(BANK_SPACE.gold.base * BANK_SPACE.gold.growth ^ G.bank.goldBuys)',
    params: { base: BANK_SPACE.gold.base, growth: BANK_SPACE.gold.growth, slots: BANK_SPACE.gold.slots },
    server_needs: 'player_state must hold the purchase COUNT; the server recomputes the price from it. '
      + 'Unbounded — the client has no cap, so the server needs one before it authorises this.',
  },
  {
    id: 'vendor.sell',
    name: 'Vendor sell-back price',
    where: 'src/screens/shop-counter.js vendorPrice() = supabase/functions/hr-accrue/catalogue.js vendorPriceOf()',
    currency: 'gold',
    formula: "min(ITEMS[id].raw ? max(1, floor(v * VENDOR_RAW_RATE)) : v, "
      + "max(1, floor(SHOP_BUYBACK_RATE * cheapest shop unit price)))   (cap only if the shop sells it)",
    params: { VENDOR_RAW_RATE, SHOP_BUYBACK_RATE },
    server_needs: 'CLOSED — the edge prices every sale with vendorPriceOf from ITEMS and this catalogue '
      + '(src/core/shop-buyback.js derives the cheapest unit price for both sides).',
  },
  {
    id: 'vendor.buyback',
    name: 'Vendor buy-back price',
    where: 'src/legacy.js repurchase()',
    currency: 'gold',
    formula: 'buyback[i].unit * buyback[i].qty — the unit price RECORDED at sale time',
    params: {},
    server_needs: 'a server-side buyback ledger. The price is a property of a past transaction, '
      + 'not of the catalogue, so it can never be a static row — and a client-supplied unit '
      + 'price is a mint.',
  },
  {
    id: 'market.*',
    name: 'Player market prices',
    where: 'src/market.js',
    currency: 'gold',
    formula: 'seller-chosen ask, per listing',
    params: {},
    server_needs: 'market-v2 owns these. A market price is not catalogue data and must never be '
      + 'added to SHOP_OFFERS.',
  },
];

// ── 5. Validate ──────────────────────────────────────────────────────────
// EMPTY-TABLE TRIPWIRE. The whole guard is worthless if an anchor can miss
// silently: an empty extraction diffs clean against an empty committed file
// and reports "in sync" forever. A zero-row table is therefore a hard failure
// regardless of the diff, and it is the check that makes `--check` mean
// something.
for (const t of tables) {
  if (!t.offers.length) {
    die(`table "${t.table}" extracted ZERO offers from ${t.origin}. An empty table cannot drift, `
      + 'so the guard would go green while asserting nothing. Fix the anchor.');
  }
}

const offers = tables.flatMap((t) => t.offers.map((o) => ({ ...o, table: t.table })))
  .sort((a, b) => a.id.localeCompare(b.id));

const seen = new Set();
for (const o of offers) {
  if (seen.has(o.id)) die(`duplicate offer id "${o.id}" — offer ids become the RPC's p_offer_id and must be unique`);
  seen.add(o.id);
  if (!o.cost.length) die(`offer "${o.id}" has no cost line — a free offer must say so with amount 0`);
  if (!o.grant.length) die(`offer "${o.id}" grants nothing`);
  for (const [side, lines, kinds] of [['cost', o.cost, CURRENCY_KINDS], ['grant', o.grant, GRANT_KINDS]]) {
    for (const l of lines) {
      if (!kinds.has(l.kind)) die(`offer "${o.id}" ${side} line has kind "${l.kind}", which is not legal on that side`);
      if (!Number.isSafeInteger(l.amount) || l.amount < 0) {
        die(`offer "${o.id}" ${side} line ${l.kind}:${l.id} amount ${l.amount} is not a non-negative safe integer`);
      }
      if (l.kind === 'currency' && !CURRENCIES[l.id]) die(`offer "${o.id}" names unknown currency "${l.id}"`);
      if (l.kind === 'item' && !ITEMS[l.id]) die(`offer "${o.id}" names item "${l.id}", which is not in src/data/items.js`);
    }
  }
  // THE FINAL DIRECTIVE, as an executable check rather than a comment: the
  // Hearth Token bond is IAP-only. Any offer that grants hearth_tokens for
  // anything other than real money is a PvE mint path, and it would be one
  // the server had been handed a price for.
  const mintsBond = o.grant.some((l) => l.kind === 'currency' && l.id === 'hearth_tokens');
  const paidInMoney = o.cost.every((l) => l.kind === 'money');
  if (mintsBond && !paidInMoney) {
    die(`offer "${o.id}" grants Hearth Tokens for something other than real money — the bond is IAP-only`);
  }
}

// ── 6. Emit ──────────────────────────────────────────────────────────────
const canonical = JSON.stringify({ offers, derived: DERIVED_PRICES });
const DIGEST = createHash('sha256').update(canonical).digest('hex');

const byTable = tables.map((t) => `--   ${t.table.padEnd(16)} ${String(t.offers.length).padStart(3)}  ${t.origin}`);
const lineCount = offers.reduce((n, o) => n + o.cost.length, 0);

const j = (v) => JSON.stringify(v);
const emitLine = (l) => `{ kind: ${j(l.kind)}, id: ${j(l.id)}, amount: ${l.amount} }`;
const emitOffer = (o) => {
  const extra = [];
  if (o.repeatable) extra.push('    repeatable: true,');
  if (o.max != null) extra.push(`    max: ${o.max},`);
  if (o.period) extra.push(`    period: ${j(o.period)},`);
  if (o.authority) extra.push(`    authority: ${j(o.authority)},`);
  if (o.reqSkill) extra.push(`    reqSkill: ${j(o.reqSkill)}, reqLv: ${o.reqLv},`);
  if (o.note) extra.push(`    note: ${j(o.note)},`);
  return `  {
    id: ${j(o.id)}, table: ${j(o.table)},
    name: ${j(o.name)},
    cost: [${o.cost.map(emitLine).join(', ')}],
    grant: [${o.grant.map(emitLine).join(', ')}],
${extra.join('\n')}${extra.length ? '\n' : ''}  },`;
};

const file = `// ════════════════════════════════════════════════════════════════════════
// Hearthrise — THE PRICE CATALOGUE  (GENERATED — DO NOT EDIT BY HAND)
//
//   Generated by tools/gen-shops.mjs from the shop tables in their CURRENT
//   homes — the files listed below. Any hand edit here is reverted by the
//   next generation and FAILS \`node tools/gen-shops.mjs --check\`, which is a
//   preflight in tests/run-smoke.mjs.
//
//   ⚠ THE SOURCE OF TRUTH IS STILL src/legacy.js (and the modules listed below).
//   To change a price, change it THERE and re-run the generator. This file is
//   a second copy that exists because legacy.js is a classic script and cannot
//   be imported by ESM or by Deno — the server needs the prices and cannot
//   reach them. The guard is what makes a second copy defensible.
//
//   WHEN THE TABLES EVENTUALLY MOVE OUT OF legacy.js, this file becomes the
//   hand-authored source, tools/gen-shops.mjs is deleted, and the preflight
//   goes with it. The filename does not change, so nothing downstream moves.
//
//   catalogue digest: ${DIGEST}
//   ${offers.length} offers · ${lineCount} cost lines · ${DERIVED_PRICES.length} prices that are formulas, not data
//
// EXTRACTED FROM
${byTable.join('\n').replace(/^--/gm, '//')}
//
// THE LINE SHAPE — both sides of every offer
//   { kind, id, amount }
//     kind    'currency' | 'item' | 'money'   (cost side)
//             'currency' | 'item' | 'unlock' | 'capacity'  (grant side)
//             — kind names WHICH SERVER TABLE a payment debits. It is not
//               decoration: \`hearth_token\` is both an hr_items row and a
//               player_state column, so {currency:'hearth_token'} would be
//               ambiguous in the one currency that may never be minted.
//     amount  a non-negative safe integer in the smallest unit.
//             money is in CENTS ('$6.99' → 699).
//
//   The RPC this becomes: hr_shop_buy(p_offer_id, p_intent_id, p_version) →
//   debit every cost line, credit every grant line, one transaction. The
//   client sends an OFFER ID and never a price.
//
// ⚠ DERIVED_PRICES IS NOT DECORATION. These spend sites compute their price at
//   call time and are NOT in SHOP_OFFERS. A consumer that cannot find an
//   offer id must REFUSE, never default — a server that invents a price is
//   worse than a server that has none.
//
// CURRENCIES AND WHERE THEY LIVE SERVER-SIDE
//   gold           player_state.gold
//   gems           account_wallet.gems            (one per ACCOUNT)
//   hearth_tokens  account_wallet.hearth_tokens   (one per ACCOUNT; IAP-only; never PvE-minted)
//   usd            the platform store, never hr_apply
// ════════════════════════════════════════════════════════════════════════

export const SHOPS_DIGEST = ${j(DIGEST)};

/** Every offer whose price is fully known as data. */
export const SHOP_OFFERS = [
${offers.map(emitOffer).join('\n')}
];

/** Where each currency lives server-side. \`null\` = it does not, yet. */
export const SHOP_CURRENCIES = ${JSON.stringify(CURRENCIES, null, 2).replace(/\n/g, '\n')};

/** Provenance, so drift has an address. */
export const SHOP_TABLES = ${JSON.stringify(
  tables.map(({ offers: o, ...m }) => ({ ...m, count: o.length })), null, 2,
)};

/**
 * Prices that are FORMULAS, not literals — deliberately absent from
 * SHOP_OFFERS. Listed so nothing downstream mistakes this catalogue for
 * complete. Each says what the server would need in order to own it.
 */
export const DERIVED_PRICES = ${JSON.stringify(DERIVED_PRICES, null, 2)};
`;

// ── 7. Write, check, or report ───────────────────────────────────────────
const CHECK = process.argv.includes('--check');
const REPORT = process.argv.includes('--report');

if (REPORT) {
  console.log('EXTRACTED PRICE CATALOGUE\n');
  for (const t of tables) {
    console.log(`${t.table.padEnd(16)} ${String(t.offers.length).padStart(3)} offers   ${t.origin}  [${t.anchor}]`);
  }
  console.log(`\n${offers.length} offers · ${lineCount} cost lines · digest ${DIGEST}`);
  const perCurrency = {};
  for (const o of offers) for (const l of o.cost) perCurrency[l.kind + ':' + l.id] = (perCurrency[l.kind + ':' + l.id] || 0) + 1;
  console.log('\ncost lines by currency:');
  for (const k of Object.keys(perCurrency).sort()) console.log(`  ${k.padEnd(22)} ${perCurrency[k]}`);
  console.log(`\n${DERIVED_PRICES.length} prices are formulas and are NOT in SHOP_OFFERS:`);
  for (const d of DERIVED_PRICES) console.log(`  ${d.id.padEnd(20)} ${d.where}`);
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) {
    console.error(`shop drift: ${OUT} is missing. Run: node tools/gen-shops.mjs`);
    process.exit(1);
  }
  // Normalised line endings, for the reason gen-catalogues.mjs documents:
  // git's autocrlf checks the file out as CRLF on Windows while the generator
  // writes LF, and a guard that cries wolf on a whole platform is a guard
  // people learn to skip.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    const was = /catalogue digest: ([0-9a-f]{64})/.exec(existing);
    const committed = was ? was[1] : '(none)';
    // Name the DIRECTION of the drift. A guard that says "something changed"
    // when it knows which side changed is a guard people learn to skim.
    if (committed === DIGEST) {
      console.error('shop drift: src/data/shops.js was EDITED BY HAND.');
      console.error('  The extraction from the source tables is unchanged (same digest), but the');
      console.error('  committed file no longer matches it. That file is generated — change the price');
      console.error('  in its real home (src/legacy.js, or the module named in SHOP_TABLES) instead.');
    } else {
      console.error('shop drift: a price in the source tables no longer matches src/data/shops.js.');
      console.error(`  committed digest ${committed}`);
      console.error(`  extracted digest ${DIGEST}`);
    }
    console.error('  Run: node tools/gen-shops.mjs   (then read the diff — a price moved)');
    process.exit(1);
  }
  console.log(`shops in sync (${offers.length} offers, ${DERIVED_PRICES.length} derived, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${offers.length} offers across ${tables.length} tables · ${lineCount} cost lines`);
  console.log(`  ${DERIVED_PRICES.length} prices are formulas and are NOT extracted`);
  console.log(`  digest ${DIGEST}`);
}
