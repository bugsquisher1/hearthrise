// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tiers.js — THREE WAYS TO HUNT A GROUND, ONE TABLE FOR EVERY GROUND.
//   Tyler 2026-11-05: one choice per ground, the tier sets the pull, no dial (lane/c-difficulty-tiers).
//   Tyler 2026-11-07: a tier is "a scaling % of exp and difficulty BUT NOT GOLD because it doesn't cost gold to enter them",
//   and "Dangerous and Deadly keep the bigger pulls" (lane/b-tier-dials).
//
// Picked per hero and per ground, the party leader's in a party: Normal is the ground as it stands; Dangerous and Deadly bring
// a bigger pull of monsters that hit harder and have more HP, and pay more Level XP a kill. Coin and drops a kill are always
// the monster row's: a tier costs no gold to enter, so it pays none (gold an hour may still rise with more kills).
//
// THE ONE SOURCE is src/data/balance-sheet.js (lane/b-ground-formula, the game designer's): TIER_DIALS, the table every ground
// shares, TIER_PULL_OVERRIDES, the named per-ground pulls (one number a tier, every group) and the Normal-only grounds, and tierRowFor, which answers a ground's
// engine row from its floor (hunts.js band). This file only resolves each open ground's rows ONCE, at load, and reads them.
// ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be unchanged.
// Either they are strong enough to do the harder content or they aren't"): a tier is the same pull, damage and HP for one hero or
// four. A hero alone earns a little more Level XP instead (party-class-xp.js SOLO_XP_PM).
// A ROW { id, pull, dmgPm, hpPm, xpPm }:
//   pull   monsters a pull: the instance's frozen density (hr_hunt_density_freeze). One entry per party size 1..4 because the
//          server's catalogue reads it by size, and every entry is the tier's ONE number (balance-sheet.js TIER_DIALS; the rows
//          case holds it). 0 = no more than Normal brings: the room as built, for every group (Tyler 2026-11-11).
//   dmgPm  a monster's atk and its Level, permille of its row. Atk is its accuracy and its blow (combat.js); its Level is what
//          armor reads (mitigation.js) and what a blow trains Defense by (hunt-rewards.js).
//   hpPm   a monster's HP, permille of its row, the same for every party size. A kill still pays the
//          row's whole kill: more HP never pays more coin or drops.
//   xpPm   Level XP a kill pays, permille of its row. Nothing else a kill pays moves.
// GROUND_TIERS is DERIVED: the engine, the Hunts page and the server's catalogue (tools/gen-ground-tiers.mjs writes
// hr_ground_tiers from it) all read the same rows. Never type a tier number here.
//
// THE LADDER RULE (tests/hunt-core/hunt-tiers.mjs ladder): a ground's top tier never beats the next ground's Normal on XP at
// the Level that fits it, or nobody moves on.
// No rule here reads a hero's Level (Tyler 2026-11-04: "They are just simply harder"; tests/hunt-core/damage.mjs
// same-blow-at-any-level): a ground's floor shapes its row when the row is made, never a fight.
// GROUND_TIERS' per-ground maps stay unfrozen so tools/balance-sim's what-ifs can swap a whole row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.121';
import { HUNT_INDEX } from './hunts.js?v=0.2.121';
import { TIER_PULL_OVERRIDES, tierRowFor } from './balance-sheet.js?v=0.2.121';

export const TIER_IDS = Object.freeze(['normal', 'dangerous', 'deadly']);
export const DEFAULT_TIER = 'normal';
/* The word a player reads, on the picker and the hunt's top bar. */
export const TIER_NAME = Object.freeze({ normal: 'Normal', dangerous: 'Dangerous', deadly: 'Deadly' });
/* WHAT A TIER IS, IN PLAIN WORDS (Tyler 2026-11-08 on the old numbers note: "Simplify this holy shit it's way too 'exact' it seems AI").
   The hunt page says the line for the picked tier, never a percent, an HP or a blow: those numbers live in the wiki's tier text.
   `more`: the tier brings more monsters at once than Normal does for this group; `same`: it brings the same monsters (the Thicket,
   Wickstead and the Sewer, under the floor-16 pull rule). The line beside Enter is the first sentence, after the tier's name. */
export const TIER_LINES = Object.freeze({
  normal: 'Safe at your level.',
  dangerous: Object.freeze({ more: 'More monsters at once, and they hit harder. More XP for each kill. You can die here.',
    same: 'The monsters hit harder. More XP for each kill. You can die here.' }),
  deadly: Object.freeze({ more: 'Big groups that hit hard. The most XP for each kill. Bring plenty of food. You can die here.',
    same: 'The monsters hit much harder. The most XP for each kill. Bring plenty of food. You can die here.' }),
});
/* The one death line a harder tier's note ends on (hunt-sessions.js DEATH_XP_LOSS is the number; the wiki says it). It read "costs a little XP" while a
   death cost 2% and never took a Level; since Tyler 2026-11-09 it costs 6% of the total Level XP and can take a Level, so the line says so, still with no number. */
export const TIER_DEATH_LINE = 'Dying ends the hunt and costs Level XP. You can lose a Level.';
/* The dials a tier row carries (permille of the monster row). */
export const DIALS = Object.freeze(['dmgPm', 'hpPm', 'xpPm']);

/* Normal is the ground as it stands, by definition: every dial the row's. */
const NORMAL = Object.freeze({ id: DEFAULT_TIER, pull: Object.freeze([0, 0, 0, 0]), dmgPm: 1000, hpPm: 1000, xpPm: 1000 });

/** A ground offers only Normal when the sheet names it so (the Cellar, the first ground). */
const normalOnly = (groundId) => !!(Object.prototype.hasOwnProperty.call(TIER_PULL_OVERRIDES, groundId) && TIER_PULL_OVERRIDES[groundId].normalOnly === true);

/* Who a ground is built for, as the sheet's tools read it (tools/gen-ground-stats.mjs fitOf): a party ground's tiers lift nothing. */
const fitOf = (ground) => (ground.pockets.some((p) => p.forParty) ? 'party' : ground.groupFit || 'both');

/* Every ground's harder rows from the sheet (a STAGED one too, so a ground pack is graded on its tiers before it opens; the server is
   served only open grounds, tools/gen-ground-tiers.mjs), at its floor and fit, its per-ground dials included (tierRowFor reads the
   sheet's named exceptions: the Thicket's tiers pay 1050 and 1080 XP on no HP dial). A fresh pull array a row, so a what-if moves one ground. */
function resolve() {
  const out = {};
  for (const g of Object.keys(HUNT_GROUNDS)) {
    if (normalOnly(g)) continue;
    const floor = HUNT_INDEX[HUNT_GROUNDS[g].hunt].band[0];
    out[g] = {};
    for (const id of TIER_IDS) if (id !== DEFAULT_TIER) {
      const r = tierRowFor(floor, id, { ground: g, fit: fitOf(HUNT_GROUNDS[g]) });
      out[g][id] = { id, pull: [...r.pull], dmgPm: r.dmgPm, hpPm: r.hpPm, xpPm: r.xpPm };
    }
  }
  return out;
}
export const GROUND_TIERS = resolve();

/** The tier ids a ground offers, easiest first. */
export const tiersOf = (groundId) => TIER_IDS.filter((id) => id === DEFAULT_TIER || !!(GROUND_TIERS[groundId] && GROUND_TIERS[groundId][id]));

/** The row a pick plays on a ground: Normal for anything the ground doesn't offer. */
export function tierRowOf(groundId, id) {
  const rows = Object.prototype.hasOwnProperty.call(GROUND_TIERS, groundId) ? GROUND_TIERS[groundId] : null;
  return (rows && Object.prototype.hasOwnProperty.call(rows, id) && rows[id]) || NORMAL;
}

/** The pull a tier brings for a group of `size` (0 = the ground as it stands): the same number for every size since 2026-11-08. */
export const pullOfTier = (row, size) => row.pull[Math.min(row.pull.length, Math.max(1, Math.floor(Number(size) || 1))) - 1];

/* THE DIAL READER: one dial's permille of one stat, 1000 (the row as written) when the dial is absent or silent on it. A dial is
   any object carrying DIALS: a tier row today. A second source (a scaled hunt's own row, later) multiplies into ONE dial before
   the engine reads it, so every reader below stays one call and the engine never learns where a number came from. */
const pmOf = (dial, k) => (dial && Number.isInteger(dial[k]) ? dial[k] : 1000);

/** A monster row's Level on a dial: the armor's read and Defense's training. */
export const levelAtTier = (level, dial) => { const pm = pmOf(dial, 'dmgPm'); return pm !== 1000 ? Math.round((level * pm) / 1000) : level; };

/** A monster row as it fights on a dial: its blow, its HP and its kill's Level XP. The row itself when every dial reads 1000,
    so Normal is the row digit for digit. Coin and drops are always the row's: no dial reaches them. */
export function atTier(row, dial) {
  const dmg = pmOf(dial, 'dmgPm'), hp = pmOf(dial, 'hpPm'), xp = pmOf(dial, 'xpPm');
  if (!row || (dmg === 1000 && hp === 1000 && xp === 1000)) return row;
  return { ...row, atk: ((row.atk || 1) * dmg) / 1000, hp: hp === 1000 ? row.hp : Math.max(1, Math.round(((row.hp || 1) * hp) / 1000)), xp: ((row.xp || 0) * xp) / 1000 };
}
