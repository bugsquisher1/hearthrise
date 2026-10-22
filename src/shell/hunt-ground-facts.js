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
//   rareOf(hunt)       THE RARE CARRIER (Tyler 10-14: only ONE monster per ground
//                      carries the rare items) and what it carries: its drop rows at
//                      rare odds (src/core/drops.js dropBand), never an equipment row
//                      (`gear`, the standard slot) and never a server-revealed surprise
//                      (`lucky`, `salvage`). Names only: drop odds a player sees come
//                      from the server's catalogue (ART_DIRECTION §8), so none is shown.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS } from '../data/hunt-grounds.js?v=0.2.31';
import { MONSTERS } from '../data/monsters.js?v=0.2.31';
import { ITEMS } from '../data/items.js?v=0.2.31';
import { dropBand } from '../core/drops.js?v=0.2.31';

/* How common a creature is, by its share of the ground's spawn points: at least `common` is common,
   under `rare` is rare, between is uncommon (Tyler 10-18: a common majority, some uncommon, one or two rare). */
export const SHARE_BANDS = Object.freeze({ common: 0.25, rare: 0.10 });

const groundOf = (hunt) => Object.values(HUNT_GROUNDS).find((g) => g.hunt === hunt) || null;

/** How common a share is: 'common' | 'uncommon' | 'rare'. */
export function shareBand(share) {
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

/* A drop row the rare carrier holds: rare odds, not the equipment slot, not a server-only reveal. */
const isRare = (d) => !!d && d.gear !== true && d.lucky !== true && d.salvage !== true && d.ch < 1 && dropBand(d.ch) === 'rare';

/**
 * The ground's rare carrier and what it carries: { carrier: { id, name }, items: [{ id, name }] },
 * or null when no creature there holds a rare row.
 */
export function rareOf(hunt) {
  for (const r of residentsOf(hunt)) {
    const rows = ((MONSTERS[r.id] || {}).drops || []).filter(isRare);
    if (rows.length) return { carrier: { id: r.id, name: r.name }, items: rows.map((d) => ({ id: d.id, name: (ITEMS[d.id] && ITEMS[d.id].n) || d.id })) };
  }
  return null;
}
