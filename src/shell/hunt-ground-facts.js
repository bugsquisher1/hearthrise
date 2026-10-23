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
//   scarceSetOf(hunt, worn)  THE GEAR THAT DROPS ABOUT HOURLY (the loot bands, Tyler
//                      2026-10-23): one entry a tier, its armour lines' words in each
//                      weight (the hero's worn weight first), the slots they cover and the
//                      tier's Scarce weapons: "Iron, Studded, Adept: helmets, boots; Iron Sword".
//   raresOf(hunt)      every Rare and Trophy item and the creature that carries it, Rares
//                      first. A row's band decides (src/core/drops.js bandOf, REVEAL_BANDS),
//                      never a server-revealed surprise (`lucky`, `salvage`).
//   wornWeightOf(eq)   the armour weight a hero wears most (heavy, medium, light), or null.
//   Names only: drop odds a player sees come from the server's catalogue and the Bestiary
//   (ART_DIRECTION §8), so none is shown here.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS } from '../data/hunt-grounds.js?v=0.2.37';
import { MONSTERS } from '../data/monsters.js?v=0.2.37';
import { ITEMS } from '../data/items.js?v=0.2.37';
import { bandOf } from '../core/drops.js?v=0.2.37';
import { REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.37';
import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.37';
import { armourLineWord } from '../data/gear-tiers.js?v=0.2.37';

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

/**
 * The ground's Scarce gear, one entry a tier (lowest first): { tier, lines: ['Iron', 'Studded', 'Adept'] (the worn
 * weight's first), slots: ['helmets', 'boots'], weapons: ['Iron Sword'] }. [] for a ground with none.
 */
export function scarceSetOf(hunt, worn) {
  const order = worn && WEIGHTS.includes(worn) ? [worn, ...WEIGHTS.filter((w) => w !== worn)] : WEIGHTS;
  const tiers = new Map();
  const at = (t) => { if (!tiers.has(t)) tiers.set(t, { tier: t, weights: new Set(), slots: new Set(), weapons: [] }); return tiers.get(t); };
  for (const r of residentsOf(hunt)) {
    for (const d of (MONSTERS[r.id] || {}).drops || []) {
      const it = d && d.band === 'scarce' && ITEMS[d.id];
      if (!it) continue;
      const e = at(Number(it.tier) || 1), w = ARMOUR_WEIGHT[it.armourClass];
      if (it.type === 'armor' && w && SLOT_WORDS[it.slot]) { e.weights.add(it.armourClass); e.slots.add(it.slot); }
      else if (!e.weapons.includes(nameOf(d.id))) e.weapons.push(nameOf(d.id));
    }
  }
  return [...tiers.values()].sort((a, b) => a.tier - b.tier).map((e) => ({
    tier: e.tier,
    lines: order.map((w) => [...e.weights].find((c) => ARMOUR_WEIGHT[c] === w)).filter(Boolean).map((c) => armourLineWord(c, e.tier)),
    slots: Object.keys(SLOT_WORDS).filter((sl) => e.slots.has(sl)).map((sl) => SLOT_WORDS[sl]),
    weapons: e.weapons,
  }));
}

/** Every Rare and Trophy item here and its carrier, Rares first: [{ id, name, trophy, carrier: { id, name } }]. */
export function raresOf(hunt) {
  const out = [];
  for (const r of residentsOf(hunt)) {
    for (const d of ((MONSTERS[r.id] || {}).drops || []).filter(isRare)) {
      if (!out.some((x) => x.id === d.id && x.carrier.id === r.id)) out.push({ id: d.id, name: nameOf(d.id), trophy: bandOf(d) === 'trophy', carrier: { id: r.id, name: r.name } });
    }
  }
  return out.sort((a, b) => Number(a.trophy) - Number(b.trophy));
}
