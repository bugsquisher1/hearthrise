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
//   partyNote(hunt)     the ground's party rule in words, from ITS row (the
//                        pocket carrying minParty and the boss standing in it),
//                        or '' for a ground with no party-only pocket
//   packFor(bag, rules) what the hunt carries: the bag's own hunt supplies,
//                        each up to its remembered restock target (all of it
//                        when it has none), at most the server's line cap
// Nothing here is a gate: the server checks the band, the stamina and the
// stock when the player presses Enter, and says why it refuses.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, PARTY_SCALE } from '../data/hunt-grounds.js?v=0.2.4';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.4';
import { MONSTERS } from '../data/monsters.js?v=0.2.4';
import { SUPPLIES } from '../data/supplies.js?v=0.2.4';
import { SESSION_LIMITS } from '../data/hunt-sessions.js?v=0.2.4';

const PACK_QTY_MAX = 100000;
const COUNT_WORDS = Object.freeze(['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']);

/** "The Rat King wants a party of two or more. Alone, you skip that hall." for this hunt's ground, or ''. */
export function partyNote(hunt) {
  const g = Object.values(HUNT_GROUNDS).find((r) => r.hunt === hunt);
  const p = g && g.pockets.find((q) => q.minParty);
  if (!p) return '';
  const boss = p.spawns.map((s) => MONSTERS[s.monster]).find((m) => m && m.boss === true);
  const n = COUNT_WORDS[p.minParty] || String(p.minParty);
  return boss ? 'The ' + boss.name + ' wants a party of ' + n + ' or more. Alone, you skip that hall.'
    : 'One hall here wants a party of ' + n + ' or more. Alone, you skip it.';
}

/** One line per hunt ground, lowest band first (ties by name). */
export function huntRows() {
  const out = [];
  for (const g of Object.values(HUNT_GROUNDS)) {
    const h = HUNT_INDEX[g.hunt];
    if (!h) continue;
    const sizes = g.pockets.map((p) => p.spawns.length);
    out.push({
      hunt: g.hunt, name: h.name, theme: h.theme || '', band: h.band.slice(), groupFit: g.groupFit,
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

/** Words on a hunt ABOVE the character's level, or null. The floor is a warning (Tyler 10-18):
    under band[0] the server admits and warns; SESSION_LIMITS.belowRangeRefuse or more under, it refuses.
    Display only: nothing reads it to gate a press, the server decides. */
export const ABOVE_LEVEL_WORDS = 'This hunt is above your level, expect losses.';
export function rangeWords(r, level) {
  if (!Number.isInteger(level) || level >= r.band[0]) return null;
  return r.band[0] - level >= SESSION_LIMITS.belowRangeRefuse ? 'You are too far below this hunt to enter it yet.' : ABOVE_LEVEL_WORDS;
}

/** Is this ground built for a group of `partySize` (1 = alone)? A 'both' ground always is. */
export function fitsGroup(r, partySize) {
  return r.groupFit === 'both' || r.groupFit === ((Number(partySize) || 1) >= 2 ? 'party' : 'solo');
}

/**
 * THE ONE RECOMMENDATION (the Hunts window's default pick; tests/core-loop.mjs plays it): the
 * highest-floor ground whose band holds `level` and whose groupFit suits `partySize`, else the
 * highest-floor ground in band, else the first ground. Advice only: every ground stays enterable.
 */
export function recommendedHunt(level, partySize = 1, rows = huntRows()) {
  const inBand = Number.isInteger(level) ? rows.filter((r) => r.band[0] <= level && level <= r.band[1]) : [];
  const best = (l) => l.slice().sort((a, b) => b.band[0] - a.band[0] || (a.name < b.name ? -1 : 1))[0] || null;
  return best(inBand.filter((r) => fitsGroup(r, partySize))) || best(inBand) || rows[0] || null;
}

/** A party ground seen by a lone hero: "Best with a party of 2–4"; else null. */
export function groupWords(r, partySize) {
  return r.groupFit === 'party' && (Number(partySize) || 1) < 2 ? 'Best with a party of 2–' + Math.max(2, r.heroes) : null;
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
