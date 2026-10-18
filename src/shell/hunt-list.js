// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-list.js — THE HUNTS A PLAYER CAN GO TO, AND WHAT TO CARRY.
//
// PURE. The Hunts window (src/shell/windows/hunts.js) draws one line per hunt
// ground row (src/data/hunt-grounds.js) joined to its hunt row (hunts.js): a
// new ground is a data row and shows up here with nothing else to edit.
//   huntRows()          [{ hunt, name, theme, band, heroes, packs, packMin,
//                          packMax, respawnS, boss }] in band order
//   densityWords(row)   "2 packs of 2 · back in 30 s"
//   bandWords(row, lv)  "Combat level 0 to 10" (+ ", you are 3" when known)
//   packFor(bag, rules) what the hunt carries: the bag's own hunt supplies,
//                        each up to its remembered restock target (all of it
//                        when it has none), at most the server's line cap
// Nothing here is a gate: the server checks the band, the stamina and the
// stock when the player presses Enter, and says why it refuses.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, PARTY_SCALE } from '../data/hunt-grounds.js?v=0.2.0';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.0';
import { MONSTERS } from '../data/monsters.js?v=0.2.0';
import { SUPPLIES } from '../data/supplies.js?v=0.2.0';
import { SESSION_LIMITS } from '../data/hunt-sessions.js?v=0.2.0';

const PACK_QTY_MAX = 100000;

/** One line per hunt ground, lowest band first (ties by name). */
export function huntRows() {
  const out = [];
  for (const g of Object.values(HUNT_GROUNDS)) {
    const h = HUNT_INDEX[g.hunt];
    if (!h) continue;
    const sizes = g.pockets.map((p) => p.spawns.length);
    out.push({
      hunt: g.hunt, name: h.name, theme: h.theme || '', band: h.band.slice(),
      heroes: Math.min(g.start.length, PARTY_SCALE.maxHeroes),
      packs: g.pockets.length, packMin: Math.min(...sizes), packMax: Math.max(...sizes),
      respawnS: Math.round(g.respawnMs / 1000),
      boss: g.pockets.some((p) => p.spawns.some((s) => MONSTERS[s.monster] && MONSTERS[s.monster].boss === true)),
    });
  }
  return out.sort((a, b) => a.band[0] - b.band[0] || (a.name < b.name ? -1 : 1));
}

/** How crowded a ground is, in words: its packs, their size, the boss, the respawn. */
export function densityWords(r) {
  const size = r.packMin === r.packMax ? String(r.packMin) : r.packMin + ' to ' + r.packMax;
  return r.packs + (r.packs === 1 ? ' pack of ' : ' packs of ') + size + (r.boss ? ', a boss' : '') + ' · back in ' + r.respawnS + ' s';
}

/** The ground's level band in words, and where the character stands when its level is known. */
export function bandWords(r, level) {
  const band = 'Combat level ' + r.band[0] + ' to ' + r.band[1];
  return Number.isInteger(level) ? band + ', you are ' + level : band;
}

/** Who may come: "1 hero" or "1 to 4 heroes". */
export function heroWords(r) {
  return r.heroes > 1 ? 'Alone or with up to ' + (r.heroes - 1) + ' more' : 'One hero';
}

/**
 * What a hunt carries from the bag: every hunt supply the bag holds, up to its
 * restock target when the player has set one (the remembered decision), else
 * the whole stack. Largest stacks first when there are more kinds than the
 * server takes lines.
 * @param {{id: string, qty: number}[]|null} bag
 * @param {{restock: object}|null} rules
 * @returns {{item: string, qty: number}[]}
 */
export function packFor(bag, rules) {
  const restock = (rules && rules.restock) || {};
  return (bag || []).filter((r) => SUPPLIES[r.id])
    .map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, restock[r.id] > 0 ? Math.min(r.qty, restock[r.id]) : r.qty) }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => b.qty - a.qty || (a.item < b.item ? -1 : 1))
    .slice(0, SESSION_LIMITS.bagLines);
}
