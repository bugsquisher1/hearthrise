// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-ground-facts.js — WHO LIVES ON A GROUND, AND WHAT IS WORTH CHASING THERE.
//
// PURE, from the data rows alone (a new ground or creature shows up here with
// nothing else to edit). The Hunts window's ground page draws both:
//   residentsOf(hunt)  every creature the ground spawns, with how common it is:
//                      its share of the ground's spawn points (src/data/hunt-grounds.js
//                      pockets' `spawns`, the pack as built). Tyler 10-18: "Hunt card
//                      and bestiary show roughly how common each is": a word, never
//                      a percentage (the mix moves with the density pick).
//   scarceSetOf(hunt, worn, size)  THE GROUND'S GEAR (the loot bands, Tyler 2026-10-23): one
//                      entry a tier, its armour lines' words in each weight (the hero's worn
//                      weight first), the slots they cover and the tier's Scarce weapons:
//                      "Iron, Studded, Adept: helmets, boots; Iron Sword", and `chance`: that a
//                      kill here drops any piece of it.
//   raresOf(hunt, size) every Rare and Trophy item and the creature that carries it, Rares
//                      first, and `chance`: per kill of that creature. A row's band decides
//                      (src/core/drops.js bandOf, REVEAL_BANDS), never a server-revealed
//                      surprise (`lucky`, `salvage`).
//   wornWeightOf(eq)   the armour weight a hero wears most (heavy, medium, light), or null.
//   bigPullOf(hunt)    the creatures only a bigger pull brings (a pocket's fill rows, hunt-grounds.js pullRows, the rows the
//                      engine spawns), with the smallest pull that does and their everyday drops; bigPullLine(hunt) says so
//                      on the ground's page (Andy's report, 2026-10-31: no Brook Bear, so no Bear Pelt, below a pull of 3).
//   dropWhereWords(item)  the creatures on open grounds that drop it, and where: the one source line for a monster material
//                      (panel 2026-11-01: the House and the recipes named a shortage and never where to end it).
//   materialsOf(hunt, size)  what this ground drops that a recipe or the House spends, with its carriers and its chance.
//   THE ODDS (Tyler 2026-10-24: "either give like a % drop chance or nothing at all") are the
//   server's own: src/data/monsters.js is the catalogue the hr-accrue engine rolls (bundled
//   into it), and each row's chance on one kill is the roller's (drops.js effectiveDropChance)
//   at the kill's yield share for a party of `size` (hunt-grounds.js yieldPermille), before any
//   hero's bonus. Never a number typed here (ART_DIRECTION §8).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, OPEN_GROUNDS, DENSITY_PICK, pullRows, routeFor, yieldPermille } from '../data/hunt-grounds.js?v=0.2.90';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.90';
import { MONSTERS } from '../data/monsters.js?v=0.2.90';
import { ITEMS } from '../data/items.js?v=0.2.90';
import { bandOf, effectiveDropChance } from '../core/drops.js?v=0.2.90';
import { REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.90';
import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.90';
import { armourLineWord } from '../data/gear-tiers.js?v=0.2.90';
import { listWords } from '../render/format.js?v=0.2.90';
import { isSpentMaterial } from './bag-model.js?v=0.2.90';

/* How common a creature is, by its share of the ground's spawn points: at least `common` is common,
   under `rare` is rare, between is uncommon (Tyler 10-18: a common majority, some uncommon, one or two rare). */
export const SHARE_BANDS = Object.freeze({ common: 0.25, rare: 0.10 });

const groundOf = (hunt) => Object.values(HUNT_GROUNDS).find((g) => g.hunt === hunt) || null;

/** How common a share is: 'common' | 'uncommon' | 'rare'. */
function shareBand(share) {
  if (share >= SHARE_BANDS.common) return 'common';
  return share < SHARE_BANDS.rare ? 'rare' : 'uncommon';
}

/**
 * The ground's creatures, most common first (then lowest Level): [{ id, name, level, boss, points,
 * share, band }]. [] for a ground the data does not know.
 */
export function residentsOf(hunt) {
  const g = groundOf(hunt);
  if (!g) return [];
  const points = new Map();
  for (const p of g.pockets) for (const s of p.spawns) points.set(s.monster, (points.get(s.monster) || 0) + 1);
  const all = Array.from(points.values()).reduce((t, n) => t + n, 0);
  return Array.from(points, ([id, n]) => {
    const m = MONSTERS[id] || {};
    return { id, name: m.name || id, level: Number.isInteger(m.level) ? m.level : null, boss: m.boss === true, points: n, share: n / all, band: shareBand(n / all) };
  }).sort((a, b) => b.points - a.points || (a.level || 0) - (b.level || 0) || (a.name < b.name ? -1 : 1));
}

/* The smallest pull on ground `g` that spawns `id` (the engine's own rows), or 0 if no pull does. */
function pullThatBrings(g, id) {
  for (let n = 1; n <= DENSITY_PICK.max; n++) {
    for (let p = 0; p < g.pockets.length; p++) if (pullRows(g, p, n).some((s) => s.monster === id)) return n;
  }
  return 0;
}
const standsAsBuilt = (g, id) => g.pockets.some((p) => p.spawns.some((s) => s.monster === id));
const everyday = (id) => ((MONSTERS[id] || {}).drops || []).filter((d) => d.band === 'common').map((d) => nameOf(d.id));

/** The creatures on a ground only a bigger pull brings: [{ id, name, pull, drops: [item names] }]. [] for none. */
export function bigPullOf(hunt) {
  const g = groundOf(hunt);
  if (!g) return [];
  const ids = new Set(g.pockets.flatMap((p) => (p.pack || []).map((s) => s.monster)));
  return [...ids].filter((id) => !standsAsBuilt(g, id)).sort().map((id) => (
    { id, name: (MONSTERS[id] || {}).name || id, pull: pullThatBrings(g, id), drops: everyday(id) }));
}

/** The ground page's line: "A party or a harder hunt also brings the Brook Bear: Raw Bear Meat, Bear Pelt.", or ''. A lone hero on Normal hunts the room as built; a party's own pull, Dangerous and Deadly bring more of its rows. */
export function bigPullLine(hunt) {
  const said = bigPullOf(hunt).map((m) => 'the ' + m.name + ': ' + m.drops.join(', '));
  return said.length ? 'A party or a harder hunt also brings ' + said.join('; ') + '.' : '';
}

const groundName = (g) => (HUNT_INDEX[g.hunt] || {}).name || g.hunt;
const groundFloor = (g) => { const b = (HUNT_INDEX[g.hunt] || {}).band; return b ? b[0] : 0; };

/**
 * WHERE A MONSTER MATERIAL COMES FROM, the one answer the tip, the House and the recipe rows give. Only creatures on grounds
 * a player can walk today, the lowest ground first: "Dropped by Briarcoat Wolf and Old Grayjaw at Meadowbrook Thicket, and at
 * Wickstead and Mosslight Glade". A creature only a bigger pull brings says that: "The Brook Bear only comes to a party or a
 * harder hunt at Mosslight Glade". '' when no open ground has it (the catalogue keeps rows for creatures no open ground spawns).
 */
export function dropWhereWords(item) {
  const standing = [], pulled = [];
  for (const g of Object.values(OPEN_GROUNDS)) {
    const here = new Set(g.pockets.flatMap((p) => (p.pack || p.spawns).concat(p.spawns).map((s) => s.monster)));
    const names = [];
    for (const id of here) {
      if (!((MONSTERS[id] || {}).drops || []).some((d) => d && d.id === item)) continue;
      if (standsAsBuilt(g, id)) names.push(MONSTERS[id].name);
      else pulled.push({ g, id, pull: pullThatBrings(g, id) });
    }
    if (names.length) standing.push({ g, names });
  }
  if (standing.length) {
    const [first, ...more] = standing.sort((a, b) => groundFloor(a.g) - groundFloor(b.g));
    return 'Dropped by ' + listWords(first.names) + ' at ' + groundName(first.g) + (more.length ? ', and at ' + listWords(more.map((x) => groundName(x.g))) : '');
  }
  if (!pulled.length) return '';
  const best = pulled.sort((a, b) => a.pull - b.pull)[0];
  return 'The ' + MONSTERS[best.id].name + ' only comes to a party or a harder hunt at ' + groundName(best.g);
}

/* A Rare row: a revealed band (a Rare or Trophy row), not a server-only surprise. */
const isRare = (d) => !!d && d.lucky !== true && d.salvage !== true && d.ch < 1 && REVEAL_BANDS.includes(bandOf(d));
let RARE_ITEMS = null;
/** Is this item a Rare somewhere (the Hunts page's own test)? From the rows, built once. */
export function isRareItem(id) {
  if (!RARE_ITEMS) { RARE_ITEMS = new Set(); for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (isRare(d)) RARE_ITEMS.add(d.id); }
  return RARE_ITEMS.has(id);
}
let EVERYDAY = null;
/** Is this item a Rare wherever it drops (Rook's Whistle), not a ground's everyday piece as well (the Iron Helm: Rare on the Thicket's den mother, Scarce in the Glade)? */
export function isRareOnly(id) {
  if (!EVERYDAY) { EVERYDAY = new Set(); for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.lucky !== true && d.salvage !== true && !isRare(d)) EVERYDAY.add(d.id); }
  return isRareItem(id) && !EVERYDAY.has(id);
}
const nameOf = (id) => (ITEMS[id] && ITEMS[id].n) || id;
const WEIGHTS = Object.freeze(['heavy', 'medium', 'light']);
const SLOT_WORDS = Object.freeze({ helmet: 'helmets', body: 'bodies', pants: 'legs', boots: 'boots' });

/** The armour weight an equipment map (slot -> item id) wears most among helmet, body, legs and boots; the heavier on a tie; null for none. */
export function wornWeightOf(eq) {
  const n = { heavy: 0, medium: 0, light: 0 };
  for (const slot of Object.keys(SLOT_WORDS)) {
    const it = eq && ITEMS[eq[slot]];
    const w = it && ARMOUR_WEIGHT[it.armourClass];
    if (w) n[w]++;
  }
  const best = WEIGHTS.reduce((a, w) => (n[w] > n[a] ? w : a), 'heavy');
  return n[best] ? best : null;
}

const sizeOf = (size) => Math.max(1, Math.floor(Number(size) || 1));

/* The party a creature is met by: `size`, or the smallest party that walks a pocket holding it (a party-only boss). */
function metBy(g, id, size) {
  const need = g.pockets.filter((p) => p.spawns.some((s) => s.monster === id)).map((p) => p.minParty || 1);
  return Math.max(size, need.length ? Math.min(...need) : 1);
}

/* One row's chance on ONE kill by a party of `size`: the roller's own, at the kill's yield share (a party-scaled
   ground's monster pays yieldPermille(size) of every chance: pull-cycle.js spawns it so), before any hero's bonus. */
const rowChance = (g, d, size) => effectiveDropChance(d, { yieldMult: g.partyScale === true ? yieldPermille(size) / 1000 : 1 });

/* That one kill drops ANY of `rows` (every row rolls on its own: drops.js rollDropTable). */
const anyOf = (g, rows, size) => 1 - rows.reduce((p, d) => p * (1 - rowChance(g, d, size)), 1);

/* THE KILLS A PARTY OF `size` MAKES HERE: each creature's share of the spawn points on the pockets it walks
   (routeFor: a pocket whose minParty it misses is skipped), the ground as built. */
function killMixOf(g, size) {
  const n = new Map();
  for (const i of routeFor(g, size)) for (const s of g.pockets[i].spawns) n.set(s.monster, (n.get(s.monster) || 0) + 1);
  const all = Array.from(n.values()).reduce((t, k) => t + k, 0);
  return new Map(Array.from(n, ([id, k]) => [id, k / all]));
}

/**
 * The ground's Scarce gear, one entry a tier (lowest first): { tier, lines: ['Iron', 'Studded', 'Adept'] (the worn
 * weight's first), slots: ['helmets', 'boots'], weapons: ['Iron Sword'], chance } where `chance` is that one kill here,
 * by a party of `size` (default alone), drops any piece of the tier. [] for a ground with none.
 */
export function scarceSetOf(hunt, worn, size) {
  const g = groundOf(hunt), n = sizeOf(size);
  const order = worn && WEIGHTS.includes(worn) ? [worn, ...WEIGHTS.filter((w) => w !== worn)] : WEIGHTS;
  const tiers = new Map();
  const at = (t) => { if (!tiers.has(t)) tiers.set(t, { tier: t, weights: new Set(), slots: new Set(), weapons: [], rows: new Map() }); return tiers.get(t); };
  for (const r of residentsOf(hunt)) {
    for (const d of (MONSTERS[r.id] || {}).drops || []) {
      const it = d && d.band === 'scarce' && ITEMS[d.id];
      if (!it) continue;
      const e = at(Number(it.tier) || 1), w = ARMOUR_WEIGHT[it.armourClass];
      if (!e.rows.has(r.id)) e.rows.set(r.id, []);
      e.rows.get(r.id).push(d);
      if (it.type === 'armor' && w && SLOT_WORDS[it.slot]) { e.weights.add(it.armourClass); e.slots.add(it.slot); }
      else if (!e.weapons.includes(nameOf(d.id))) e.weapons.push(nameOf(d.id));
    }
  }
  const mix = g ? killMixOf(g, n) : new Map();
  return [...tiers.values()].sort((a, b) => a.tier - b.tier).map((e) => ({
    tier: e.tier,
    lines: order.map((w) => [...e.weights].find((c) => ARMOUR_WEIGHT[c] === w)).filter(Boolean).map((c) => armourLineWord(c, e.tier)),
    slots: Object.keys(SLOT_WORDS).filter((sl) => e.slots.has(sl)).map((sl) => SLOT_WORDS[sl]),
    weapons: e.weapons,
    chance: Array.from(e.rows, ([id, rows]) => (mix.get(id) || 0) * anyOf(g, rows, n)).reduce((t, c) => t + c, 0),
  }));
}

/**
 * WHAT THIS GROUND'S CREATURES DROP THAT A RECIPE OR THE HOUSE SPENDS (panel 2026-11-01: Drops listed gear only, so Wolf Pelt and
 * Silk Thread had no page to be found on): [{ id, name, carriers: [names], chance }], likeliest first, `chance` that one kill here,
 * by a party of `size`, drops it (the same mix and roller as the gear's). A Rare row stays on the Rare list. [] for a ground with none.
 */
export function materialsOf(hunt, size) {
  const g = groundOf(hunt), n = sizeOf(size);
  if (!g) return [];
  const mix = killMixOf(g, n), found = new Map();
  for (const [id, share] of mix) {
    for (const d of (MONSTERS[id] || {}).drops || []) {
      if (!d || !d.id || d.band === 'scarce' || d.lucky === true || d.salvage === true || isRare(d) || !isSpentMaterial(d.id)) continue;
      if (!found.has(d.id)) found.set(d.id, { id: d.id, name: nameOf(d.id), carriers: [], chance: 0 });
      const e = found.get(d.id);
      e.carriers.push(MONSTERS[id].name);
      e.chance += share * rowChance(g, d, n);
    }
  }
  return [...found.values()].filter((e) => e.chance > 0).sort((a, b) => b.chance - a.chance || (a.name < b.name ? -1 : 1));
}

/**
 * Every Rare and Trophy item here and its carrier, Rares first: [{ id, name, trophy, carrier: { id, name }, chance }],
 * `chance` per kill of the carrier by a party of `size` (default alone; a party-only boss, by the smallest party he meets).
 */
export function raresOf(hunt, size) {
  const g = groundOf(hunt), n = sizeOf(size);
  const out = [];
  /* A creature only a bigger pull brings carries its Rares too (the Brook Bear's Claw). */
  for (const r of [...residentsOf(hunt), ...bigPullOf(hunt)]) {
    for (const d of ((MONSTERS[r.id] || {}).drops || []).filter(isRare)) {
      if (!out.some((x) => x.id === d.id && x.carrier.id === r.id)) {
        out.push({ id: d.id, name: nameOf(d.id), trophy: bandOf(d) === 'trophy', carrier: { id: r.id, name: r.name }, chance: rowChance(g, d, metBy(g, r.id, n)) });
      }
    }
  }
  return out.sort((a, b) => Number(a.trophy) - Number(b.trophy));
}
