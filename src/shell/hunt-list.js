// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-list.js — THE HUNTS A PLAYER CAN GO TO, AND WHAT TO CARRY.
//
// PURE. The Hunts window (src/shell/windows/hunts.js) draws one line per hunt
// ground row (src/data/hunt-grounds.js) joined to its hunt row (hunts.js): a
// new ground is a data row and shows up here with nothing else to edit.
//   huntRows()          [{ hunt, name, theme, band, heroes, packs, packMin,
//                          packMax, respawnS, boss }] in band order
//   densityWords(row, n)  "6 packs of 7 · back in 60 s": the pull size the
//                        server spawns at density `n` (the pick clamped to the
//                        ground); the room as built only at 0
//   bandWords(row, lv)  "Level 1 to 8" (+ ", you are 3" when known)
//   recommendation(levels, size)  the Hunts window's default pick for this hero
//                        or this party's levels, and a plain note when no ground
//                        built for the group holds them
//   partyNote(hunt)     the ground's party rule in words, from ITS row (the
//                        pocket carrying minParty and the boss standing in it),
//                        or '' for a ground with no party-only pocket
//   packFor(bag)        what the hunt carries: the bag's own hunt supplies,
//                        every stack, at most the server's line cap
//   bestWords(b, hunt)  this hero's personal bests on the ground, alone and
//                        in a party, from the server's `hunt_bests` section
//                        (one "No best here yet" line when it has none)
//   bestLine(b, hunt)   the list line's best Level XP an hour, or "No best yet"
//   fitWords(row, lv)   the list line's band against the Level, and its tone
// Nothing here is a gate: the server checks the band, the stamina and the
// stock when the player presses Enter, and says why it refuses.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, PARTY_SCALE } from '../data/hunt-grounds.js?v=0.2.72';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.72';
import { MONSTERS } from '../data/monsters.js?v=0.2.72';
import { SUPPLIES } from '../data/supplies.js?v=0.2.72';
import { SESSION_LIMITS } from '../data/hunt-sessions.js?v=0.2.72';
import { whole, gold } from '../render/format.js?v=0.2.72';

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
    /* a staged hunt (hunts.js `staged`: built, art pending) is never listed; the server refuses it too */
    if (!h || h.staged === true) continue;
    const sizes = g.pockets.map((p) => p.spawns.length);
    out.push({
      /* A ground with a party-only hall (a minParty pocket: the Rat King) is a PARTY ground to the advice,
         whatever its workbook column says (Tyler 2026-10-21: "The Sewer is a party hunt"): its fight is
         built for a party, so a lone hero is never pointed at it and is told it is best with one. */
      hunt: g.hunt, name: h.name, theme: h.theme || '', band: h.band.slice(),
      groupFit: g.pockets.some((p) => p.minParty) ? 'party' : g.groupFit,
      soloFrom: Number.isInteger(g.soloFrom) ? g.soloFrom : null,
      heroes: Math.min(g.start.length, PARTY_SCALE.maxHeroes),
      packs: g.pockets.length, packMin: Math.min(...sizes), packMax: Math.max(...sizes),
      respawnS: Math.round(g.respawnMs / 1000),
      boss: g.pockets.some((p) => p.spawns.some((s) => MONSTERS[s.monster] && MONSTERS[s.monster].boss === true)),
    });
  }
  return out.sort((a, b) => a.band[0] - b.band[0] || (a.name < b.name ? -1 : 1));
}

/**
 * How crowded a ground is, in words: its packs, their size, the boss, the respawn. `n` is the
 * density the server spawns this ground at (hunt-grounds.js densityFor of the pick: every pack
 * holds n; in a party the leader's pick), 0 or unknown = the room as built.
 */
export function densityWords(r, n) {
  const built = r.packMin === r.packMax ? String(r.packMin) : r.packMin + ' to ' + r.packMax;
  const picked = Number.isInteger(n) && n > 0;
  const packs = r.packs + (r.packs === 1 ? ' pack' : ' packs');
  const size = picked ? ' of ' + n : ' of ' + built;
  return packs + size + (r.boss ? ', a boss' : '') + ' · back in ' + r.respawnS + ' s';
}

/** The ground's level band in words, and where the character stands when its level is known. */
export function bandWords(r, level) {
  const band = 'Level ' + r.band[0] + ' to ' + r.band[1];
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

/* The party's levels in words: "Level 20", or "Levels 12 to 20" when they differ. */
const levelsWords = (lo, hi) => (lo === hi ? 'Level ' + lo : 'Levels ' + lo + ' to ' + hi);

/**
 * THE ONE RECOMMENDATION (the Hunts window's default pick; tests/core-loop.mjs plays it), from the
 * rows alone. `levels` is the hero's Level, or every known Level in its party; `partySize` 1 = alone.
 * Among the grounds whose groupFit suits the group, highest floor first:
 *   1. one whose band holds every level;  2. one whose band holds the lowest level;
 *   3. none holds it: the nearest one BELOW the lowest level, with a note that says so plainly
 *      (and names a ground in band that wants a party, for a lone hero);
 *   4. no ground suits the group at all: the highest-floor ground in band, else the first ground.
 * A lone hero is never pointed at a party ground while a solo one exists. Advice only: every
 * ground stays enterable, the server decides.
 * @returns {{ row: object|null, note: string|null }}
 */
export function recommendation(levels, partySize = 1, rows = huntRows()) {
  const lv = [].concat(levels).filter(Number.isInteger);
  const best = (l) => l.slice().sort((x, y) => y.band[0] - x.band[0] || (x.name < y.name ? -1 : 1))[0] || null;
  if (!lv.length) return { row: rows[0] || null, note: null };
  const lo = Math.min(...lv), hi = Math.max(...lv);
  const holds = (r, from, to) => r.band[0] <= from && to <= r.band[1];
  const fit = rows.filter((r) => fitsGroup(r, partySize));
  const sure = best(fit.filter((r) => holds(r, lo, hi))) || best(fit.filter((r) => holds(r, lo, lo)));
  if (sure) return { row: sure, note: null };
  const alone = (Number(partySize) || 1) < 2;
  const below = fit.filter((r) => r.band[1] < lo).sort((x, y) => y.band[1] - x.band[1] || y.band[0] - x.band[0])[0];
  if (below) {
    const party = alone ? best(rows.filter((r) => !fitsGroup(r, 1) && holds(r, lo, lo))) : null;
    const note = 'No ground ' + (alone ? 'for one hero' : 'for your party') + ' fits ' + levelsWords(lo, hi) + ' yet. '
      + below.name + ' (Level ' + below.band[0] + ' to ' + below.band[1] + ') is the nearest below'
      + (party ? '; ' + party.name + ' fits your level with a party.' : '.');
    return { row: below, note };
  }
  return { row: best(rows.filter((r) => holds(r, lo, lo))) || rows[0] || null, note: null };
}

/** The recommended ground's row alone (see recommendation). */
export function recommendedHunt(levels, partySize = 1, rows = huntRows()) {
  return recommendation(levels, partySize, rows).row;
}

/** A party ground seen by a lone hero: "Best with a party of 2–4"; else null. */
export function groupWords(r, partySize) {
  return r.groupFit === 'party' && (Number(partySize) || 1) < 2 ? 'Best with a party of 2–' + Math.max(2, r.heroes) : null;
}

/**
 * THIS hero's personal bests on a ground, in words, from the server's `hunt_bests` section
 * (hunt-sections.js huntBestsOf), for the picked ground's page: a line for each mode the hero has a
 * best in ("Best alone: 12,400 Level XP per hour · balance 3,100 gp per hour", "Best in a party: …"),
 * else ONE `none` line that says so and names the server's qualifying length (designer 2026-10-22:
 * eight "No hunt of 10 min yet" lines said nothing). Null when the server sent no section.
 */
export function bestWords(bests, hunt) {
  if (!bests) return null;
  const g = bests.grounds[hunt] || {};
  const line = (b) => whole(b.xpH) + ' Level XP per hour · balance ' + gold(b.balanceH) + ' per hour';
  const solo = g.solo ? 'Best alone: ' + line(g.solo) : null;
  const party = g.party ? 'Best in a party: ' + line(g.party) : null;
  return { solo, party, none: solo || party ? null : 'No best here yet. A hunt of ' + Math.round(bests.minMs / 60000) + ' min or more sets your best.' };
}

/**
 * The list line's best: this hero's higher Level XP an hour on the ground, alone or in a party
 * ("Best 12,400 Level XP/h"), or "No best yet" when it has none there (never "New" or "Not hunted yet": a hunt
 * under 10 minutes sets no best, and Pellow's twice-hunted Mill Cellar read "New", core-loop play 2026-10-30).
 * Null when the server sent no section.
 */
export function bestLine(bests, hunt) {
  if (!bests) return null;
  const g = bests.grounds[hunt] || {};
  const xp = Math.max(g.solo ? g.solo.xpH : -Infinity, g.party ? g.party.xpH : -Infinity);
  return Number.isFinite(xp) ? 'Best ' + whole(xp) + ' Level XP/h' : 'No best yet';
}

/**
 * Where the character's Level stands against a ground's band, for the list line: `words` and the
 * `tone` its token colour reads from. 'in' inside the band; 'above' under the floor (a warning, the
 * server admits it); 'far' SESSION_LIMITS.belowRangeRefuse or more under (the server refuses);
 * 'below' over the band's top (little XP). Null when the Level is not known. Display only.
 */
export function fitWords(r, level) {
  if (!Number.isInteger(level)) return null;
  /* Under the floor: rangeWords is the ONE reader of the refuse margin. */
  const warn = rangeWords(r, level);
  if (warn) return warn === ABOVE_LEVEL_WORDS ? { words: 'Above your level', tone: 'above' } : { words: 'Far above your level', tone: 'far' };
  return level > r.band[1] ? { words: 'Below your level', tone: 'below' } : { words: 'In your range', tone: 'in' };
}

/** Who may come: "One hero", "Alone or with up to 3 more", or for a party ground "A party of 2 to 4"
    (with ", or alone from Level 45" when its row measured a lone hero's break-even, hunt-grounds.js soloFrom). */
export function heroWords(r) {
  if (r.groupFit === 'party' && r.heroes > 1) {
    return 'A party of 2 to ' + r.heroes + (Number.isInteger(r.soloFrom) ? ', or alone from Level ' + r.soloFrom : '');
  }
  return r.heroes > 1 ? 'Alone or with up to ' + (r.heroes - 1) + ' more' : 'One hero';
}

/**
 * What a hunt carries from the bag: every hunt supply the bag holds, the whole
 * stack (own stock is used first, then the store per use). Largest stacks first
 * when there are more kinds than the server takes lines.
 * @param {{id: string, qty: number}[]|null} bag
 * @returns {{item: string, qty: number}[]}
 */
export function packFor(bag) {
  return (bag || []).filter((r) => SUPPLIES[r.id])
    .map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty) }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => b.qty - a.qty || (a.item < b.item ? -1 : 1))
    .slice(0, SESSION_LIMITS.bagLines);
}
