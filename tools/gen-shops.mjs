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
// WHAT IT READS  (seven files — every table is asserted present and non-empty)
//   src/legacy.js            ROOMS · PLOT_BUILDINGS · HOUSE_THEMES ·
//                            SEED_SHOP · EQUIP_SHOP · BOUNTY_SHOP · TRAITS ·
//                            BANK_SPACE · IAP_CATALOG · the inline cosmetics
//                            array inside renderShop()
//   src/features/homestead.js  property TIERS
//   src/features/workers.js    HIRE_COSTS
//   src/multi-character.js     SLOT_COSTS_GEMS
//   src/data/companions.js     'shop:<gold>[:<skill><lv>]' source strings
//   src/core/farm.js           PLOT_TIERS deed costs
//   src/dungeons.js            DUNGEONS entry fees
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

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'src', 'data', 'shops.js');

const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const read = (rel) => readFile(join(ROOT, rel), 'utf8');

const die = (msg) => { console.error(`gen-shops: ${msg}`); process.exit(1); };

// ── 1. Slice a literal out of a classic script ───────────────────────────
// `anchor` must end on the literal's opening bracket, e.g. 'const ROOMS={'.
// Comments and string/template bodies are skipped so a `}` inside a comment
// or a `'{'` inside a description cannot close the object early. Regex
// literals are NOT tracked — none of the ten anchored literals contains one,
// and if that ever changes the slice stops parsing and this throws, which is
// the correct outcome rather than a silently truncated table.
function sliceLiteral(src, anchor, where) {
  const hits = [];
  let at = -1;
  while ((at = src.indexOf(anchor, at + 1)) !== -1) hits.push(at);
  if (hits.length !== 1) {
    die(`anchor ${JSON.stringify(anchor)} matched ${hits.length} times in ${where} `
      + '— expected exactly 1. The table was renamed, moved, or duplicated; '
      + 'fix the anchor rather than letting the extraction guess.');
  }
  const open = hits[0] + anchor.length - 1;
  const openCh = src[open];
  if (openCh !== '{' && openCh !== '[') die(`anchor ${JSON.stringify(anchor)} must end on { or [`);
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      for (; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) die(`unbalanced literal for ${JSON.stringify(anchor)} in ${where}`);
  const text = src.slice(open, i + 1);
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return (${text});`)();
  } catch (e) {
    return die(`literal at ${JSON.stringify(anchor)} in ${where} does not evaluate: ${e.message}`);
  }
}

// A bare numeric constant (`const VENDOR_RAW_RATE = 0.20;`). Same uniqueness
// rule as sliceLiteral: exactly one declaration, or the build fails.
function sliceNumber(src, decl, where) {
  const re = new RegExp(`${decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, 'g');
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) die(`${decl} matched ${hits.length} declarations in ${where} — expected exactly 1`);
  return Number(hits[0][1]);
}

// ── 2. THE COST SHAPE ────────────────────────────────────────────────────
// One line shape, used on BOTH sides of every offer:
//
//     { kind, id, amount }
//
//   kind    the domain the id lives in — and, for a payment, WHICH SERVER
//           TABLE the spend debits. This is not decoration: `hearth_token` is
//           BOTH a row in hr_items and a column on player_state
//           (player_state.hearth_tokens), measured, so a bare
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
//   gold/gems/hearth_tokens  → player_state columns (verified in
//                              2026-08-11-player-state.sql)
//   marks                    → Bounty Marks. G.bountyHunter.marks, and it has
//                              NO server home at all today. Extracted anyway
//                              and flagged, because a price in a currency the
//                              server cannot debit is a finding, not an
//                              omission.
const CURRENCIES = {
  gold: { server: 'player_state.gold' },
  gems: { server: 'player_state.gems' },
  hearth_tokens: { server: 'player_state.hearth_tokens' },
  marks: { server: null },
  usd: { server: null },
};

const line = (kind, id, amount) => ({ kind, id, amount });
const money = (str) => {
  const m = /^\$(\d+)\.(\d{2})(\/mo)?$/.exec(String(str));
  if (!m) die(`IAP price ${JSON.stringify(str)} is not $N.NN — the parser must not guess at money`);
  return { cents: Number(m[1]) * 100 + Number(m[2]), period: m[3] ? 'month' : null };
};

// ── 3. Extract ───────────────────────────────────────────────────────────
const { ITEMS } = await imp('src/data/items.js');
const { COMPANIONS } = await imp('src/data/companions.js');
const { PLOT_TIERS } = await imp('src/core/farm.js');

const legacy = await read('src/legacy.js');
const homesteadSrc = await read('src/features/homestead.js');
const workersSrc = await read('src/features/workers.js');
const multiCharSrc = await read('src/multi-character.js');

const L = (anchor) => sliceLiteral(legacy, anchor, 'src/legacy.js');

const ROOMS = L('const ROOMS={');
const PLOT_BUILDINGS = L('const PLOT_BUILDINGS={');
const HOUSE_THEMES = L('const HOUSE_THEMES=[');
const SEED_SHOP = L('const SEED_SHOP=[');
const EQUIP_SHOP = L('const EQUIP_SHOP=[');
const IAP_CATALOG = L('const IAP_CATALOG=[');
const TRAITS = L('const TRAITS={');
const BOUNTY_SHOP = L('const BOUNTY_SHOP = [');
const BANK_SPACE = L('var BANK_SPACE = {');
// The cosmetics table is an array literal INSIDE renderShop(), not a
// top-level const — the only priced table in the game that is not even a
// declaration. It is extracted the same way; the anchor uniqueness check is
// what makes that safe.
const COSMETICS = L('const cosmetics=[');
const VENDOR_RAW_RATE = sliceNumber(legacy, 'const VENDOR_RAW_RATE', 'src/legacy.js');

const dungeonsSrc = await read('src/dungeons.js');
const DUNGEONS = sliceLiteral(dungeonsSrc, 'var DUNGEONS = {', 'src/dungeons.js');

const PROPERTY_TIERS = sliceLiteral(homesteadSrc, 'var TIERS = [', 'src/features/homestead.js');
const HIRE_COSTS = sliceLiteral(workersSrc, 'var HIRE_COSTS = [', 'src/features/workers.js');
const SLOT_COSTS_GEMS = sliceLiteral(multiCharSrc, 'const SLOT_COSTS_GEMS = [', 'src/multi-character.js');

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
const CURRENCY_ORDER = ['gold', 'gems', 'hearth_tokens', 'marks', 'usd'];
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

// ── HOUSE_THEMES — `price` + an optional `currency:'gem'` flag ───────────
// buyTheme() branches on currency==='gem' and otherwise spends GOLD, so a
// themeless entry is a gold price, not an unpriced one. `default` is 0 gold.
{
  const offers = HOUSE_THEMES.map((t) => ({
    id: `theme.${t.id}`,
    name: t.name,
    cost: [line('currency', t.currency === 'gem' ? 'gems' : 'gold', t.price | 0)],
    grant: [line('unlock', `theme:${t.id}`, 1)],
  }));
  addTable({
    table: 'theme', origin: 'src/legacy.js', anchor: 'const HOUSE_THEMES=[',
    spends_at: 'legacy.js buyTheme()',
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

// ── BOUNTY_SHOP — priced in Bounty Marks ─────────────────────────────────
{
  const offers = BOUNTY_SHOP.map((b) => ({
    id: `bounty.${b.id}`,
    name: b.name,
    cost: [line('currency', 'marks', b.cost)],
    grant: [line('unlock', `bounty:${b.id}`, 1)],
    repeatable: !!b.repeatable,
  }));
  addTable({
    table: 'bounty', origin: 'src/legacy.js', anchor: 'const BOUNTY_SHOP = [',
    spends_at: 'legacy.js spendMarks()',
  }, offers);
}

// ── TRAITS — `cost` + `currency` ─────────────────────────────────────────
{
  const offers = Object.keys(TRAITS).sort().map((id) => ({
    id: `trait.${id}`,
    name: TRAITS[id].name,
    cost: [line('currency', TRAITS[id].currency === 'marks' ? 'marks' : 'gold', TRAITS[id].cost)],
    grant: [line('unlock', `trait:${id}`, 1)],
  }));
  addTable({
    table: 'trait', origin: 'src/legacy.js', anchor: 'const TRAITS={',
    spends_at: 'legacy.js buyTrait()',
  }, offers);
}

// ── COSMETICS — gem-priced, and the only table with no declaration ───────
{
  const offers = COSMETICS.map((c) => ({
    id: `cosmetic.${c.id}`,
    name: c.name,
    cost: [line('currency', 'gems', c.price)],
    grant: [line('unlock', `cosmetic:${c.id}`, 1)],
  }));
  addTable({
    table: 'cosmetic', origin: 'src/legacy.js', anchor: 'const cosmetics=[',
    spends_at: 'legacy.js buyCosmetic(id, price)',
    note: 'array literal inside renderShop(), not a top-level declaration',
  }, offers);
}

// ── BANK_SPACE — the gem rung only. The GOLD rung is a formula; see
//    DERIVED_PRICES below. ─────────────────────────────────────────────────
{
  const offers = [{
    id: 'bank.gems',
    name: `Bank space +${BANK_SPACE.gem.slots}`,
    cost: [line('currency', 'gems', BANK_SPACE.gem.cost)],
    grant: [line('capacity', 'bank_slots', BANK_SPACE.gem.slots)],
    repeatable: true,
  }];
  addTable({
    table: 'bank', origin: 'src/legacy.js', anchor: 'var BANK_SPACE = {',
    spends_at: 'legacy.js buyBankSpaceGem()',
    note: 'the GOLD rung is escalating and lives in DERIVED_PRICES',
  }, offers);
}

// ── IAP_CATALOG — real money. The PLATFORM authorises these, never us. ────
{
  const offers = IAP_CATALOG.map((p) => {
    const { cents, period } = money(p.price);
    const grant = [];
    if (p.tokens) grant.push(line('currency', 'hearth_tokens', p.tokens));
    if (p.gems) grant.push(line('currency', 'gems', p.gems));
    if (p.gold) grant.push(line('currency', 'gold', p.gold));
    for (const u of (p.unlocks || [])) grant.push(line('unlock', `theme:${u}`, 1));
    if (p.ent) grant.push(line('unlock', `entitlement:${p.ent}`, 1));
    if (!grant.length) die(`IAP ${p.sku} grants nothing the shape can express`);
    return {
      id: `iap.${p.sku}`,
      name: p.title,
      cost: [line('money', 'usd', cents)],
      grant: grant.sort(costOrder),
      period,
      authority: 'platform',
    };
  });
  addTable({
    table: 'iap', origin: 'src/legacy.js', anchor: 'const IAP_CATALOG=[',
    spends_at: 'IAP.buy() → platform billing',
    note: 'money in CENTS; the store, not hr_apply, authorises the charge',
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

// ── CHARACTER SLOTS — gems, indexed by slot. Slot 0 is free. ─────────────
{
  const offers = [];
  SLOT_COSTS_GEMS.forEach((gems, i) => {
    if (!gems) return;
    offers.push({
      id: `character_slot.${i}`,
      name: `Character slot ${i + 1}`,
      cost: [line('currency', 'gems', gems)],
      grant: [line('unlock', `character_slot:${i}`, 1)],
    });
  });
  addTable({
    table: 'character_slot', origin: 'src/multi-character.js', anchor: 'const SLOT_COSTS_GEMS = [',
    spends_at: 'multi-character.js unlockSlot()',
    note: 'Hearth Hall Premium grants slots 1-3 free — an entitlement waiver, not a price',
  }, offers);
}

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

// ── FARM PLOT TIERS — priced in farm_deed ITEMS, not currency. ────────────
{
  const offers = [];
  PLOT_TIERS.forEach((t, i) => {
    if (!t || !t.cost) return;
    offers.push({
      id: `farm_plot.${i}`,
      name: `Farm plot tier ${i}`,
      cost: [line('item', 'farm_deed', t.cost)],
      grant: [line('unlock', 'farm_plot_tier', i)],
    });
  });
  if (!ITEMS.farm_deed) die('PLOT_TIERS costs farm_deed, which is not in src/data/items.js');
  addTable({
    table: 'farm_plot', origin: 'src/core/farm.js', anchor: 'export const PLOT_TIERS',
    spends_at: 'farm-progression.js upgradePlot()',
    note: 'the only offer table priced purely in items',
  }, offers);
}

// ── DUNGEON ENTRY — an entry fee, paid in a key ITEM. ────────────────────
// `cost` here has THREE branches in the spending code (dungeons.js:336-343 and
// dungeon-scavenger.js:574-582): `key` (one item), `gold`, and `hearth_token`.
// Only `key` is used by any dungeon today, but the other two are live code
// paths, so they are mapped rather than assumed absent — and the mapping is
// read off the spend, not guessed: `hearth_token` is debited from
// G.inventory, i.e. as an ITEM, not from the player_state.hearth_tokens
// column. That is the exact ambiguity `kind` exists to remove, appearing in
// the one currency the Final Directive protects.
{
  const offers = Object.keys(DUNGEONS).sort().map((id) => {
    const d = DUNGEONS[id];
    const cost = [];
    if (d.cost?.gold) cost.push(line('currency', 'gold', d.cost.gold));
    if (d.cost?.hearth_token) cost.push(line('item', 'hearth_token', d.cost.hearth_token));
    if (d.cost?.key) {
      if (!ITEMS[d.cost.key]) die(`DUNGEONS.${id} costs key "${d.cost.key}", which is not an item`);
      cost.push(line('item', d.cost.key, 1));
    }
    if (!cost.length) cost.push(line('currency', 'gold', 0));
    return {
      id: `dungeon.${id}`,
      name: d.name,
      cost: cost.sort(costOrder),
      grant: [line('unlock', `dungeon_run:${id}`, 1)],
      repeatable: true,
      // The entry GATE, carried because a server that authorises the spend
      // must re-check it. `combat` is the derived combat level, not a skill
      // in SKILLS_DEF — named explicitly rather than left implicit.
      reqSkill: 'combat', reqLv: d.reqLv | 0,
    };
  });
  addTable({
    table: 'dungeon', origin: 'src/dungeons.js', anchor: 'var DUNGEONS = {',
    spends_at: 'dungeons.js runDungeon() · dungeon-scavenger.js',
    note: 'entry fee; the gold and hearth_token branches are live code with no data using them yet',
  }, offers);
}

// ── 4. THE HARD CASES — declared, never invented ─────────────────────────
// A price that a regex cannot see is not a price that stops existing. These
// six spend sites compute their cost at call time. They are emitted as DATA,
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
    id: 'bounty.reroll',
    name: 'Bounty board reroll',
    where: 'src/legacy.js rerollBountyBoard()',
    currency: 'marks',
    formula: '5 + 5 * G.bountyHunter.rerollsToday   (free while freeRerolls remain)',
    params: { base: 5, step: 5 },
    server_needs: 'a per-UTC-day reroll counter, plus the free-reroll grant from bounty.free_reroll_2. '
      + 'Marks have no server column at all today.',
  },
  {
    id: 'vendor.sell',
    name: 'Vendor sell-back price',
    where: 'src/legacy.js vendorPrice()',
    currency: 'gold',
    formula: "ITEMS[id].raw ? max(1, floor(v * VENDOR_RAW_RATE)) : v",
    params: { VENDOR_RAW_RATE },
    server_needs: 'DERIVABLE TODAY — hr_items.value already carries v. Needs `raw` added to the '
      + 'catalogue and the rate as a constant. This is the cheapest of the six to close.',
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
    id: 'clan_building.*',
    name: 'Clan seat building costs',
    where: 'src/features/clan-seat-ui.js BUILDINGS + materialScale()',
    currency: 'gold',
    formula: 'ceil(BUILDINGS[id].gold * materialScale(targetLevel))',
    params: {},
    server_needs: 'paid from clans.treasury, not player gold, so it belongs to the clan-authority '
      + 'track (clan_deposit / clan_work_supply), not to hr_shop_buy. Listed here so it is not '
      + 'mistaken for extracted.',
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
//   homes — seven files, listed below. Any hand edit here is reverted by the
//   next generation and FAILS \`node tools/gen-shops.mjs --check\`, which is a
//   preflight in tests/run-smoke.mjs.
//
//   ⚠ THE SOURCE OF TRUTH IS STILL src/legacy.js (and the six modules).
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
// ⚠ DERIVED_PRICES IS NOT DECORATION. Six spend sites compute their price at
//   call time and are NOT in SHOP_OFFERS. A consumer that cannot find an
//   offer id must REFUSE, never default — a server that invents a price is
//   worse than a server that has none.
//
// CURRENCIES AND WHERE THEY LIVE SERVER-SIDE
//   gold           player_state.gold
//   gems           player_state.gems
//   hearth_tokens  player_state.hearth_tokens   (IAP-only; never PvE-minted)
//   marks          NOWHERE — Bounty Marks have no server column today
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
