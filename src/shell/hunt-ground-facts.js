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
//   THE ODDS (Tyler 2026-10-24: "either give like a % drop chance or nothing at all") are the
//   server's own: src/data/monsters.js is the catalogue the hr-accrue engine rolls (bundled
//   into it), and each row's chance on one kill is the roller's (drops.js effectiveDropChance)
//   at the kill's yield share for a party of `size` (hunt-grounds.js yieldPermille), before any
//   hero's bonus. Never a number typed here (ART_DIRECTION §8).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, routeFor, yieldPermille } from '../data/hunt-grounds.js?v=0.2.65';
import { MONSTERS } from '../data/monsters.js?v=0.2.65';
import { ITEMS } from '../data/items.js?v=0.2.65';
import { bandOf, effectiveDropChance } from '../core/drops.js?v=0.2.65';
import { REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.65';
import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.65';
import { armourLineWord } from '../data/gear-tiers.js?v=0.2.65';

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

/* A Rare row: a revealed band (a Rare or Trophy row), not a server-only surprise. */
const isRare = (d) => !!d && d.lucky !== true && d.salvage !== true && d.ch < 1 && REVEAL_BANDS.includes(bandOf(d));
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
 * Every Rare and Trophy item here and its carrier, Rares first: [{ id, name, trophy, carrier: { id, name }, chance }],
 * `chance` per kill of the carrier by a party of `size` (default alone; a party-only boss, by the smallest party he meets).
 */
export function raresOf(hunt, size) {
  const g = groundOf(hunt), n = sizeOf(size);
  const out = [];
  for (const r of residentsOf(hunt)) {
    for (const d of ((MONSTERS[r.id] || {}).drops || []).filter(isRare)) {
      if (!out.some((x) => x.id === d.id && x.carrier.id === r.id)) {
        out.push({ id: d.id, name: nameOf(d.id), trophy: bandOf(d) === 'trophy', carrier: { id: r.id, name: r.name }, chance: rowChance(g, d, metBy(g, r.id, n)) });
      }
    }
  }
  return out.sort((a, b) => Number(a.trophy) - Number(b.trophy));
}
