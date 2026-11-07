// ════════════════════════════════════════════════════════════════════════
// src/data/scaled-hunts.js — SCALED HUNTS: an early ground fought at the party leader's Level, bought by the hour with gold
// (Tyler 2026-11-07; lane/b-scaled-hunts, game designer). DESIGN + DATA ONLY: nothing reads this yet, the feature stays hidden
// until the server half lands (build plan: docs/planning/PRIORITY_BOARD.md, "2026-11-07 Scaled hunts").
//
// TYLER'S WORDS (binding): "an option to 'scale' early game hunts up with gold" (for the late bestiary); "party would scale to the
// leader"; "if they are already paying for the boosted hunt maybe the loot should scale with it"; "+x% exp +x% more damage from
// monsters +x% more gold from monsters"; "make it a per hour slider", "up to 24 hours", "the time only ticks down while in the
// spawn". 11-04 NO LEVEL PENALTY: nothing here reads a hero's Level against a ground's floor; the scale is the leader's paid choice.
//
// THE RULES (designer, measured on the real engine: tests/scaled-hunts.mjs and the board section):
//   WHAT    A scaled ground is the stat formula (balance-sheet.js formulaStats) read with the ground's floor moved up to the
//           leader's Level, every monster up by the same gap, each with its own role, art tier and fit. Its danger, its blows,
//           its to-hit, its defense and its HP are the formula's at that Level, so a high party can't one-shot it.
//   WHEN    Only once the leader has outgrown the ground (its Level past the band's top), and never past `topLevel`, the top of
//           the highest open ground's band: past it there is no right-Level ground to stay under.
//   PAYS    Level XP a kill: the formula's x `xpPm`. Coin a kill: the formula's x `coinPm` by the ground's fit. Item drops stay
//           the ground's own rows at their own rates (early materials don't flood the market). Bestiary: a kill is a kill.
//   NEVER THE BEST GRIND   at every tested gap a scaled hour pays less Level XP than the right-Level ground and less gold
//           (before the fee) than the best free ground at that Level, so gold never buys faster leveling.
//   COSTS   `pricePerHour` gold a banked hour, the leader's purse. One banked hour is spent per hour the party hunts that
//           ground, whatever its size, on the server clock (town, travel and other grounds spend nothing).
//   TIERS   Normal and Dangerous, read at the scaled floor. Deadly is not offered while scaled (see SCALED_HUNTS.tiers).
//
// PURE ESM. Data and pure functions only: no DOM, no clock, no randomness. It imports balance-sheet.js only; the ground facts
// it needs (floor, top, fit) are restated in SCALABLE_GROUNDS and pinned to hunts.js and hunt-grounds.js by tests/scaled-hunts.mjs.
// ════════════════════════════════════════════════════════════════════════
import { formulaStats, tierRowFor, GROUND_ROSTER, STAT_FORMULA, TIER_PULL_OVERRIDES } from './balance-sheet.js?v=0.2.105';

export const SCALED_HUNTS = Object.freeze({
  /* the slider: whole hours, 1 to 24 a purchase (Tyler 11-07 "up to 24 hours") */
  minHours: 1,
  maxHours: 24,
  /* a hero holds at most this many banked hours a ground, so a price change never leaves a big pre-bought stock. They never expire:
     a bought hour is never lost. */
  bankMaxHours: 24,
  /* the buy RPC's clamp: hours a hero may buy a server day, every ground together (a refill of two banks, and more than a day's stamina) */
  buyMaxHoursPerDay: 48,
  /* the highest Level a ground scales to: the top of the highest open ground's band (the Coppercap Warrens, 32 to 50) */
  topLevel: 50,
  /* Level XP a kill, permille of the formula's at the scaled Level. 800: the scaled Glade's four at 50 read 1.13x the Warrens' XP at
     the formula's own (its layout kills fast); at 800 every tested gap reads 0.5-0.9x the right-Level ground */
  xpPm: 800,
  /* coin a kill, permille of the formula's at the scaled Level, by the ground's fit. A party ground already pays the party line
     (x0.53 at full danger, balance-sheet STAT_FORMULA.fit.party); a solo ground's monsters have a solo HP, so at the formula's own
     coin a scaled Glade's four netted 2,100-2,400 a head over the Warrens. 600 leaves about 1,000 or more a head under the best free gold before the fee */
  coinPm: Object.freeze({ solo: 600, both: 600, party: 1000 }),
  /* the price of a banked hour: perLevel x the scaled Level, in gold. 40: a fifth to two fifths of what the lone leader's scaled
     hour makes before the fee, a tenth or less a head for a four */
  price: Object.freeze({ perLevel: 40 }),
  /* the tiers a scaled ground offers (a Normal-only ground offers Normal). Not Deadly: at Level 41 a four on the scaled Glade's Deadly died
     47 times in 16 hero-hours and on the Sewer's 44 (the Warrens' Deadly: 0), for 0.47-0.80x the Warrens' Deadly XP, a trap and not a
     risk worth taking. Dangerous held (0 deaths at 41 on four grounds) for 0.50-0.84x the Warrens' Dangerous XP. */
  tiers: Object.freeze(['normal', 'dangerous']),
});

/* EVERY GROUND THAT CAN BE SCALED: each open ground under the top one, so every early monster's bestiary can be finished at XP worth
   having. The Warrens (the top, 32 to 50) has nothing above it to stay under. `floor` and `top` are hunts.js's band, `fit` is who
   the ground is built for (hunt-tiers.js fitOf). `danger` (optional): the share of full danger a scaled ground reaches, with its why. */
export const SCALABLE_GROUNDS = Object.freeze({
  mill_cellar: Object.freeze({ floor: 1, top: 8, fit: 'both' }),
  meadowbrook_thicket: Object.freeze({ floor: 5, top: 15, fit: 'both', danger: 0.5,
    why: 'its wolves run down a lone archer. At full danger a lone bow at the leader\'s Level died once and dipped under 25% HP 12 times in 4 h (0 and 2 at half)' }),
  wickstead: Object.freeze({ floor: 8, top: 18, fit: 'solo' }),
  millrace_sewer: Object.freeze({ floor: 8, top: 25, fit: 'party' }),
  mosslight_glade: Object.freeze({ floor: 16, top: 31, fit: 'solo' }),
});

/** The Level a ground is fought at for a party led by a hero of `leaderLevel`, or null when it can't be scaled for them. */
export function scaleLevelFor(groundId, leaderLevel) {
  const g = Object.prototype.hasOwnProperty.call(SCALABLE_GROUNDS, groundId) ? SCALABLE_GROUNDS[groundId] : null;
  const L = Math.floor(Number(leaderLevel));
  if (!g || !Number.isFinite(L) || L <= g.top) return null;
  return Math.min(L, SCALED_HUNTS.topLevel);
}

/* The formula a scaled ground reads: the sheet's own, its danger ramp stretched so a capped ground reaches `danger` of full at its
   scaled floor (the ramp moves only to-hit, blows, the gentle cap and the gentle roles' HP; coin has its own line). */
function formulaOf(g, floor) {
  if (!g.danger) return STAT_FORMULA;
  const from = STAT_FORMULA.ramp.from;
  return { ...STAT_FORMULA, ramp: { from, to: from + Math.max(1, floor - from) / g.danger } };
}

/* A monster of `level`, `role` and art `tier` on ground `g` scaled to `to`: the formula at its Level + the gap on the scaled
   floor, Level XP x xpPm, coin x coinPm (the roll kept on the formula's mean, STAT_FORMULA.gp.keepMean). */
function scaledStats(level, role, tier, g, groundId, to) {
  const gap = to - g.floor;
  const f = formulaStats({ level: level + gap, role, tier, floor: to, fit: g.fit, ground: groundId }, { formula: formulaOf(g, to) });
  const mean = ((f.gp[0] + f.gp[1]) / 2) * (SCALED_HUNTS.coinPm[g.fit] / 1000);
  const lo = Math.max(1, Math.round(mean * STAT_FORMULA.gp.lo));
  return { level: level + gap, hp: f.hp, atk: f.atk, baseAcc: f.baseAcc, def: f.def,
    xp: Math.max(1, Math.round((f.xp * SCALED_HUNTS.xpPm) / 1000)), gp: [lo, Math.max(lo, Math.round(2 * mean - lo))] };
}

/**
 * A monster row as it fights on its ground scaled for a leader of `leaderLevel`: the formula at its Level + the gap, on the ground's
 * floor + the gap, its own role, art tier and fit; Level XP x xpPm and coin x coinPm. Drops and everything else stay the row's.
 * The row itself when the ground can't be scaled for that leader, or the monster is on no roster of the ground.
 */
export function scaledRow(row, monsterId, groundId, leaderLevel) {
  const to = scaleLevelFor(groundId, leaderLevel);
  const role = GROUND_ROSTER[groundId] && GROUND_ROSTER[groundId][monsterId];
  if (to === null || !role || !row || !Number.isInteger(row.level)) return row;
  return { ...row, ...scaledStats(row.level, role, row.tier, SCALABLE_GROUNDS[groundId], groundId, to) };
}

/** Every roster monster of a scaled ground as it fights: { id: row }, the table the settle plays instead of those rows ({} when unscaled). */
export function scaledMonsters(monsters, groundId, leaderLevel) {
  if (scaleLevelFor(groundId, leaderLevel) === null) return {};
  const out = {};
  for (const id of Object.keys(GROUND_ROSTER[groundId] || {})) if (monsters[id]) out[id] = scaledRow(monsters[id], id, groundId, leaderLevel);
  return out;
}

/** The tier row a scaled ground plays: the sheet's row for a ground of the scaled floor (its own pulls and named dials), so Dangerous
    means on it what it means on any ground of that Level. Null when the ground can't be scaled for that leader or doesn't offer the tier. */
export function scaledTierRow(groundId, tierId, leaderLevel) {
  const to = scaleLevelFor(groundId, leaderLevel);
  const normalOnly = TIER_PULL_OVERRIDES[groundId] && TIER_PULL_OVERRIDES[groundId].normalOnly === true;
  if (to === null || !SCALED_HUNTS.tiers.includes(tierId) || (normalOnly && tierId !== 'normal')) return null;
  const g = SCALABLE_GROUNDS[groundId];
  return tierRowFor(to, tierId, { ground: groundId, fit: g.fit, formula: formulaOf(g, to) });
}

/**
 * THE SLIDER'S WORDS (Tyler's dials "+x% exp +x% more damage from monsters +x% more gold from monsters", and HP): permilles of the
 * ground's own row, read on its reference monster (a regular of art tier 1 at the floor), one line a ground; plus the band it reads.
 * The engine plays scaledRow, not these. Null when the ground can't be scaled for that leader.
 */
export function scaleFor(groundId, leaderLevel) {
  const to = scaleLevelFor(groundId, leaderLevel);
  if (to === null) return null;
  const g = SCALABLE_GROUNDS[groundId];
  const own = formulaStats({ level: g.floor, role: 'regular', tier: 1, floor: g.floor, fit: g.fit, ground: groundId });
  const s = scaledStats(g.floor, 'regular', 1, g, groundId, to);
  const pm = (a, b) => Math.round((1000 * a) / b), coin = (r) => r.gp[0] + r.gp[1];
  return { band: [to, to + g.top - g.floor], dmgPm: pm(s.atk, own.atk), hpPm: pm(s.hp, own.hp), xpPm: pm(s.xp, own.xp), coinPm: pm(coin(s), coin(own)) };
}

/** Gold a banked hour costs a leader of `leaderLevel` on this ground (whole gold), or null when it can't be scaled for them. */
export function pricePerHour(groundId, leaderLevel) {
  const to = scaleLevelFor(groundId, leaderLevel);
  return to === null ? null : SCALED_HUNTS.price.perLevel * to;
}

/** THE BUY'S CATALOGUE CHECK: gold for `hours` banked hours, or null (not scalable for this leader, or not whole hours 1 to 24). */
export function priceFor(groundId, leaderLevel, hours) {
  const p = pricePerHour(groundId, leaderLevel);
  if (p === null || !Number.isInteger(hours) || hours < SCALED_HUNTS.minHours || hours > SCALED_HUNTS.maxHours) return null;
  return p * hours;
}
