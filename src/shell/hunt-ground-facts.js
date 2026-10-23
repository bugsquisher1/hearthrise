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
//   rareOf(hunt)       THE GROUND'S CHASE: on the loot bands (Tyler 2026-10-23) several
//                      creatures carry Rare items, so the page names one carrier's: the
//                      boss's when it carries one, else the creature with the most Rare
//                      rows (the rarer on a tie). A Rare row is a revealed band (src/core/
//                      drops.js bandOf, REVEAL_BANDS), never a Scarce piece; an unbanded
//                      seeded fixture's reads its odds; never a server-revealed surprise
//                      (`lucky`, `salvage`). Names only: drop odds a player sees come
//                      from the server's catalogue (ART_DIRECTION §8), so none is shown.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS } from '../data/hunt-grounds.js?v=0.2.34';
import { MONSTERS } from '../data/monsters.js?v=0.2.34';
import { ITEMS } from '../data/items.js?v=0.2.34';
import { bandOf } from '../core/drops.js?v=0.2.34';
import { REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.34';

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

/**
 * The ground's chase, { carrier: { id, name }, items: [{ id, name }] }: the boss's Rare rows when it has any, else
 * the resident with the most (the rarer on a tie, residentsOf lists the commonest first); null when none has one.
 */
export function rareOf(hunt) {
  let best = null;
  for (const r of residentsOf(hunt)) {
    const rows = ((MONSTERS[r.id] || {}).drops || []).filter(isRare);
    if (!rows.length) continue;
    const rank = (r.boss ? 1000 : 0) + rows.length;
    if (!best || rank >= best.rank) best = { rank, r, rows };
  }
  return best ? { carrier: { id: best.r.id, name: best.r.name }, items: best.rows.map((d) => ({ id: d.id, name: (ITEMS[d.id] && ITEMS[d.id].n) || d.id })) } : null;
}
