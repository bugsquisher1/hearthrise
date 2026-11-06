#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/jewelry-sources.mjs — JEWELRY IS CRAFTED, NOT DROPPED (the designer's spec, PRIORITY_BOARD "2026-11-04 Crafted jewelry":
//   "The cut is one guard, jewelry-sources"; Tyler 2026-11-04: "making jewelry crafted only so that people who are solely focused on
//   crafting vs combat have something unique/special to them").
//
//   JS1  NO REACHABLE MONSTER DROPS A RING, A NECKLACE OR EARRINGS: a monster met on an open ground (its pockets, packs and spawns)
//        names none in its drop rows, except the pieces PENDING still holds, each for the batch that converts it.
//   JS2  A CRAFTED PIECE AND ITS GRADES DROP NOWHERE, ON OR OFF THE ROSTER: a crafter's work can't be found on the floor.
//   JS3  PENDING ONLY SHRINKS: every row in it still drops from a monster met on an open ground (a converted piece leaves the list the
//        day its reachable drop does), and none is crafted.
//   JS4  EACH CRAFTED PIECE HAS ITS DOORS: a rolled job makes it, the Shop sells the plain piece at its premium and never a graded row,
//        and each tier's gem has exactly one monster home on an open ground (the rule: one home a player can learn).
//
//   node tests/jewelry-sources.mjs            the guard
//   node tests/jewelry-sources.mjs --mutate   each claim driven red by a defect planted on the live data
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { ITEMS, MONSTERS, ARTISAN_RECIPES, SHOP_OFFERS, SHOP_LISTED_OFFER_IDS } from '../src/data/catalogue-coherence.js';
import { OPEN_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { JEWEL_PIECES, JEWEL_SHOP_PRICE, JEWEL_TIERS, JEWELRY_ITEMS, recipeOutcomes } from '../src/data/jewelry.js';

/** The jewelry rows still dropped until the batch that crafts them, each with why (the next batch of the spec: the Twisted Torc and
    the Bronze Studs, renamed and crafted). A row leaves the day its drop does (JS3). */
export const PENDING = Object.freeze({
  wolfbone_torc: 'T2 necklace: becomes the crafted Twisted Torc in the next jewelry batch (Turncoat .003 until then)',
  fang_studs: 'T2 earrings: becomes the crafted Bronze Studs in the next jewelry batch (Turncoat .003 until then)',
});

const JEWEL_SLOTS = Object.freeze(['ring', 'necklace', 'earrings']);
const isJewel = (id) => !!ITEMS[id] && (ITEMS[id].type === 'jewelry' || JEWEL_SLOTS.includes(ITEMS[id].slot));

/** Every monster met on an open ground, the way catalogue-coherence.js reachableSources meets them. */
function metMonsters() {
  const met = new Set();
  for (const g of Object.values(OPEN_GROUNDS)) {
    for (const p of g.pockets || []) for (const s of (p.pack || []).concat(p.spawns || [])) met.add(s.monster);
    for (const s of (HUNT_INDEX[g.hunt] || {}).spawns || []) met.add(s.monster);
  }
  return met;
}

export function check() {
  const fails = [];
  const met = metMonsters();
  const crafted = new Set(Object.keys(JEWEL_PIECES).concat(Object.keys(JEWELRY_ITEMS)));
  const dropping = new Map();
  for (const [mid, m] of Object.entries(MONSTERS)) for (const d of (m && m.drops) || []) {
    if (!d || !isJewel(d.id)) continue;
    if (!dropping.has(d.id)) dropping.set(d.id, []);
    dropping.get(d.id).push(mid);
    if (met.has(mid) && !PENDING[d.id]) fails.push(`JS1 ${mid} (met on an open ground) drops ${d.id}: jewelry is crafted`);
    if (crafted.has(d.id)) fails.push(`JS2 ${mid} drops ${d.id}, a crafted piece`);
  }
  for (const id of Object.keys(PENDING)) {
    if (!(dropping.get(id) || []).some((mid) => met.has(mid))) fails.push(`JS3 ${id} is PENDING but no monster on an open ground drops it any more: take it off the list`);
    if (crafted.has(id)) fails.push(`JS3 ${id} is PENDING and crafted: take it off the list`);
  }
  for (const plain of Object.keys(JEWEL_PIECES)) {
    const made = Object.values(ARTISAN_RECIPES).flat().filter((r) => r && r.roll && recipeOutcomes(r).includes(plain));
    if (!made.length) fails.push(`JS4 ${plain}: no rolled job makes it`);
    const shop = SHOP_OFFERS.filter((o) => o && SHOP_LISTED_OFFER_IDS.has(o.id) && (o.grant || []).some((g) => g && g.id === plain));
    const price = shop.length ? (((shop[0].cost || []).find((c) => c && c.id === 'gold') || {}).amount) : null;
    if (shop.length !== 1 || price !== JEWEL_SHOP_PRICE[plain]) fails.push(`JS4 ${plain}: the Shop sells it ${shop.length} way(s) at ${price}, not once at ${JEWEL_SHOP_PRICE[plain]}`);
  }
  for (const o of SHOP_OFFERS) for (const g of (o && o.grant) || []) if (g && JEWELRY_ITEMS[g.id]) fails.push(`JS4 the Shop's ${o.id} sells ${g.id}, a rolled grade`);
  const tiers = new Set(Object.values(JEWELRY_ITEMS).map((it) => it.tier));
  for (const t of tiers) {
    const gem = JEWEL_TIERS[t] && JEWEL_TIERS[t].gem;
    const homes = (dropping.get(gem) || []).concat([...met].filter((mid) => ((MONSTERS[mid] || {}).drops || []).some((d) => d && d.id === gem)));
    const open = [...new Set(homes)].filter((mid) => met.has(mid));
    if (open.length !== 1) fails.push(`JS4 tier ${t}'s gem ${gem} has ${open.length} homes on open grounds (${open.join(', ') || 'none'}): one home a player can learn`);
  }
  return fails;
}

function mutate() {
  const cases = [
    ['a reachable monster drops a crafted Fine ring', 'JS1', () => { const d = MONSTERS.turncoat.drops; d.push({ id: 'banded_signet_keen', ch: .001, band: 'rare' }); return () => d.pop(); }],
    ['the Turncoat drops the Banded Signet again', 'JS2', () => { const d = MONSTERS.turncoat.drops; d.push({ id: 'banded_signet', ch: .003, band: 'rare' }); return () => d.pop(); }],
    ['an off-roster monster drops a Hallmarked ring', 'JS2', () => { const d = MONSTERS.kobold.drops; d.push({ id: 'banded_signet_keen_follow', ch: .0001 }); return () => d.pop(); }],
    ['a pending piece stops dropping and stays on the list', 'JS3', () => { const d = MONSTERS.turncoat.drops, i = d.findIndex((x) => x.id === 'fang_studs'); const [row] = d.splice(i, 1); return () => d.splice(i, 0, row); }],
    ['the Shop sells a Fine ring', 'JS4', () => { SHOP_OFFERS.push({ id: 'supply.banded_signet_keen', table: 'supply', cost: [{ kind: 'currency', id: 'gold', amount: 3000 }], grant: [{ kind: 'item', id: 'banded_signet_keen', amount: 1 }] }); return () => SHOP_OFFERS.pop(); }],
    ['the gem gains a second home', 'JS4', () => { const m = Object.keys(MONSTERS).find((k) => k !== 'turncoat' && metMonsters().has(k)); const d = MONSTERS[m].drops; d.push({ id: 'road_carnelian', ch: .001, band: 'rare' }); return () => d.pop(); }],
  ];
  let missed = 0;
  for (const [name, claim, plantIt] of cases) {
    const undo = plantIt();
    let fails;
    try { fails = check(); } finally { undo(); }
    if (fails.some((f) => f.startsWith(claim))) console.log('  CAUGHT  ' + name + ' -> ' + fails.find((f) => f.startsWith(claim)));
    else { console.error('  MISSED  ' + name + ' (' + claim + ')'); missed++; }
  }
  const clean = check();
  if (clean.length) { console.error('jewelry-sources --mutate: a plant leaked: ' + clean.join('; ')); process.exit(2); }
  if (missed) { console.error(`jewelry-sources --mutate: ${missed} of ${cases.length} missed`); process.exit(1); }
  console.log(`jewelry-sources --mutate: ${cases.length} mutants, 0 missed`);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) mutate();
  else {
    const fails = check();
    if (fails.length) { console.error('jewelry-sources: RED\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
    console.log(`jewelry-sources: OK — no reachable monster drops jewelry but the ${Object.keys(PENDING).length} pending pieces, no crafted piece drops anywhere, each crafted piece has its job and its Shop premium, each gem one home`);
  }
}
