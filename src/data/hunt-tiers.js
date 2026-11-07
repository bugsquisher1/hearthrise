// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tiers.js — THREE WAYS TO HUNT A GROUND, ONE TABLE FOR EVERY GROUND.
//   Tyler 2026-11-05: one choice per ground, the tier sets the pull, no dial (lane/c-difficulty-tiers).
//   Tyler 2026-11-07: a tier is "a scaling % of exp and difficulty BUT NOT GOLD because it doesn't cost gold to enter them",
//   and "Dangerous and Deadly keep the bigger pulls" (lane/b-tier-dials).
//
// Picked per hero and per ground, the party leader's in a party: Normal is the ground as it stands; Dangerous and Deadly bring
// a bigger pull of monsters that hit harder and have more health, and pay more Level XP a kill. Coin and drops a kill are
// always the monster row's: a tier costs no gold to enter, so it pays none (gold an hour may still rise with more kills).
//
// THE DIALS, one row per harder tier (TIER_TABLE), the same on every ground:
//   pull   monsters a pull, one entry per party size 1..4: the instance's frozen density (hr_hunt_density_freeze). 0 = the
//          ground as it stands (as built alone, its row's partyPull in a party). Each cell is that tier's whole answer.
//   dmgPm  a monster's atk and its Level, permille of its row. Atk is its accuracy and its blow (combat.js); its Level is what
//          armor reads (mitigation.js) and what a blow trains Defense by (hunt-rewards.js).
//   hpPm   a monster's health, permille of its row, under the party scale (hunt-grounds.js packHpFor). Its kill yield stays the
//          party scale's (pull-cycle.js yieldPm): more health never pays more coin or drops.
//   xpPm   Level XP a kill pays, permille of its row. Nothing else a kill pays moves.
//
// GROUND_OVERRIDES: where one ground's shape needs another number, the pull by default, named with its reason (`why`). Any
// dial may be overridden; tools/gen-ground-tiers.mjs prints every override that isn't a pull, so the one formula stays visible.
// NORMAL_ONLY: the grounds that offer no harder tier. Every other open ground (hunt-grounds.js OPEN_GROUNDS) offers all three.
// GROUND_TIERS is DERIVED, each ground's rows the table under its overrides: the engine, the Hunts page and the server's
// catalogue (tools/gen-ground-tiers.mjs writes hr_ground_tiers from it) all read the same rows.
//
// THE LADDER RULE (tests/hunt-core/hunt-tiers.mjs ladder): a ground's top tier never beats the next ground's Normal on XP at
// the Level that fits it, or nobody moves on.
// No rule here reads a hero's Level (Tyler 2026-11-04: "They are just simply harder"; tests/hunt-core/damage.mjs
// same-blow-at-any-level): stats against stats, the player's pick.
// GROUND_TIERS' per-ground maps stay unfrozen so tools/balance-sim's what-ifs can swap a whole row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { OPEN_GROUNDS } from './hunt-grounds.js?v=0.2.104';

export const TIER_IDS = Object.freeze(['normal', 'dangerous', 'deadly']);
export const DEFAULT_TIER = 'normal';
/* The word a player reads, on the picker and the hunt's top bar. */
export const TIER_NAME = Object.freeze({ normal: 'Normal', dangerous: 'Dangerous', deadly: 'Deadly' });
/* The dials a tier row carries (permille of the monster row). */
export const DIALS = Object.freeze(['dmgPm', 'hpPm', 'xpPm']);

const NORMAL = Object.freeze({ id: DEFAULT_TIER, pull: Object.freeze([0, 0, 0, 0]), dmgPm: 1000, hpPm: 1000, xpPm: 1000 });

/* THE ONE TABLE (Tyler 2026-11-05's sample on the Glade and the Warrens: Dangerous a pull of 4 to 6 by party size, x1.2, +10% XP;
   Deadly the full box, x1.5, +20% XP). The numbers are the game designer's. */
export const TIER_TABLE = Object.freeze({
  dangerous: Object.freeze({ pull: Object.freeze([4, 5, 5, 6]), dmgPm: 1200, hpPm: 1000, xpPm: 1100 }),
  deadly: Object.freeze({ pull: Object.freeze([8, 8, 8, 8]), dmgPm: 1500, hpPm: 1000, xpPm: 1200 }),
});

/* The Cellar, the first ground (Coordinator 2026-11-05: a choice adds nothing to the first minutes). */
export const NORMAL_ONLY = Object.freeze(['mill_cellar']);

/* PER-GROUND OVERRIDES, each named with its reason in the comment above it. A dial not named is the table's. */
export const GROUND_OVERRIDES = Object.freeze({
  /* No more monsters: the Thicket's Normal sits about 15% under Wickstead's, so its room is the stats. A pull of 3 at no extra XP already beats it for AoE. */
  meadowbrook_thicket: Object.freeze({
    dangerous: Object.freeze({ pull: Object.freeze([0, 0, 0, 0]), dmgPm: 1500, xpPm: 1050 }),
    deadly: Object.freeze({ pull: Object.freeze([0, 0, 0, 0]), dmgPm: 3000, xpPm: 1080 }),
  }),
  /* A LONE HERO'S HARDER TIER IS A RISK, NOT FREE XP (Tyler 2026-11-06, "Yes, make it risky"; lane/b-tier-risk, plans tierrisk and tierrisk2,
     2 seeds x 2 h a cell). Alone, Wickstead keeps the ground as it stands and hits twice and two and a half times as hard: the extra pull
     (3 and 5 alone) paid 1.47-1.72x Normal with every way to fight alive and richer. A party keeps its pulls, and its gains held at 2.5x. */
  wickstead: Object.freeze({
    dangerous: Object.freeze({ pull: Object.freeze([0, 4, 4, 5]), dmgPm: 2000, xpPm: 1050 }),
    deadly: Object.freeze({ pull: Object.freeze([0, 8, 8, 8]), dmgPm: 2500, xpPm: 1100 }),
  }),
  /* A lone hero keeps the ground as it stands: a pull of 4 beats the Glade for a hammer. A party keeps the full box. */
  millrace_sewer: Object.freeze({
    dangerous: Object.freeze({ pull: Object.freeze([0, 5, 5, 6]), xpPm: 1050 }),
    deadly: Object.freeze({ pull: Object.freeze([0, 8, 8, 8]), dmgPm: 1750, xpPm: 1100 }),
  }),
  /* The Glade (lane/b-tier-risk; Tyler 2026-11-06 20:20 UTC: "if you are fighting outside your weight class even in a party, you're gonna waste
     money but get more exp and possibly die a few times"). Alone, Dangerous brings 3, the pull that first brings the Brook Bear (the Keep's
     pelts stay a lone hero's). Dangerous hits 1.4x: a duo under the Glade's Levels now pays for it in food (net -1.8k to -8.1k an hour at 13-14)
     while one at its Levels still nets +2.3k to +3.7k. Deadly keeps the full box (Tyler 10-18) at 1.6x, next to the 1.5x a four found about
     right (Andy, 11-06): a four at 24-31 holds and nets +4k to +7.7k, and a party under the Glade's Levels dies there. */
  mosslight_glade: Object.freeze({
    dangerous: Object.freeze({ pull: Object.freeze([3, 5, 5, 6]), dmgPm: 1400 }),
    deadly: Object.freeze({ dmgPm: 1600 }),
  }),
  /* coppercap_warrens: the table as it stands (the 11-05 sample was played there). */
});

/** Every ground's harder rows: the table under the ground's overrides (a fresh pull array a row, so a what-if moves one ground). Pure. */
function resolve(table, overrides, grounds, normalOnly) {
  const out = {};
  for (const g of grounds) {
    if (normalOnly.includes(g)) continue;
    const over = Object.prototype.hasOwnProperty.call(overrides, g) ? overrides[g] : {};
    out[g] = {};
    for (const id of TIER_IDS) {
      if (id === DEFAULT_TIER) continue;
      const o = Object.prototype.hasOwnProperty.call(over, id) ? over[id] : {};
      const base = table[id];
      const row = { id, pull: [...(o.pull || base.pull)] };
      for (const k of DIALS) row[k] = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : base[k];
      out[g][id] = row;
    }
  }
  return out;
}
export const GROUND_TIERS = resolve(TIER_TABLE, GROUND_OVERRIDES, Object.keys(OPEN_GROUNDS), NORMAL_ONLY);

/** The tier ids a ground offers, easiest first. */
export const tiersOf = (groundId) => TIER_IDS.filter((id) => id === DEFAULT_TIER || !!(GROUND_TIERS[groundId] && GROUND_TIERS[groundId][id]));

/** The row a pick plays on a ground: Normal for anything the ground doesn't offer. */
export function tierRowOf(groundId, id) {
  const rows = Object.prototype.hasOwnProperty.call(GROUND_TIERS, groundId) ? GROUND_TIERS[groundId] : null;
  return (rows && Object.prototype.hasOwnProperty.call(rows, id) && rows[id]) || NORMAL;
}

/** The pull a tier brings for a group of `size` (0 = the ground as it stands). */
export const pullOfTier = (row, size) => row.pull[Math.min(row.pull.length, Math.max(1, Math.floor(Number(size) || 1))) - 1];

/* THE DIAL READER: one dial's permille of one stat, 1000 (the row as written) when the dial is absent or silent on it. A dial is
   any object carrying DIALS: a tier row today. A second source (a scaled hunt's own row, later) multiplies into ONE dial before
   the engine reads it, so every reader below stays one call and the engine never learns where a number came from. */
const pmOf = (dial, k) => (dial && Number.isInteger(dial[k]) ? dial[k] : 1000);

/** A monster row's Level on a dial: the armor's read and Defense's training. */
export const levelAtTier = (level, dial) => { const pm = pmOf(dial, 'dmgPm'); return pm !== 1000 ? Math.round((level * pm) / 1000) : level; };

/** A monster row as it fights on a dial: its blow, its health and its kill's Level XP. The row itself when every dial reads 1000,
    so Normal is the row digit for digit. Coin and drops are always the row's: no dial reaches them. */
export function atTier(row, dial) {
  const dmg = pmOf(dial, 'dmgPm'), hp = pmOf(dial, 'hpPm'), xp = pmOf(dial, 'xpPm');
  if (!row || (dmg === 1000 && hp === 1000 && xp === 1000)) return row;
  return { ...row, atk: ((row.atk || 1) * dmg) / 1000, hp: hp === 1000 ? row.hp : Math.max(1, Math.round(((row.hp || 1) * hp) / 1000)), xp: ((row.xp || 0) * xp) / 1000 };
}
