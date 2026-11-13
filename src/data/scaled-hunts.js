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
// PURE ESM. Data and pure functions only: no DOM, no clock, no randomness. Which grounds scale, their bands and fits, and the top
// Level are READ from the ground data (hunt-grounds.js OPEN_GROUNDS, hunts.js bands; every ground pack folds into them), never typed
// here, so opening a ground needs no row in this file (the ground-pack lane, CONFLICTS.md 2026-11-07).
// ════════════════════════════════════════════════════════════════════════
import { formulaStats, tierRowFor, GROUND_ROSTER, STAT_FORMULA, TIER_PULL_OVERRIDES, GROUND_XP_FIT } from './balance-sheet.js?v=0.2.127';
import { OPEN_GROUNDS } from './hunt-grounds.js?v=0.2.127';
import { HUNT_INDEX } from './hunts.js?v=0.2.127';

/* NAMED EXCEPTIONS a scaled ground carries, each with its why. `danger`: the share of full danger it reaches at its scaled floor.
   A row here never makes a ground scalable: the ground data does. */
export const SCALE_EXCEPTIONS = Object.freeze({
  meadowbrook_thicket: Object.freeze({ danger: 0.5,
    why: 'its wolves run down a lone archer. At full danger a lone bow at the leader\'s Level died once and dipped under 25% HP 12 times in 4 h (0 and 2 at half)' }),
});

/**
 * WHICH GROUNDS SCALE, from the ground data: every open ground with a formula roster whose band ends under the top open ground's
 * band, and the top Level a ground scales to (that band's end). The top ground has nothing above it to stay under. Each ground
 * reads { floor, top } from its hunt's band and `fit` the way the tier table reads it (a pocket that needs a party, else groupFit).
 * Pure: `open` is hunt-grounds.js OPEN_GROUNDS' shape, `huntIndex` hunts.js HUNT_INDEX's. Answers { topLevel, grounds: { id: row } }.
 */
export function scaleLadderOf(open, huntIndex, roster = GROUND_ROSTER, exceptions = SCALE_EXCEPTIONS) {
  const bandOf = (g) => (g && huntIndex[g.hunt] && Array.isArray(huntIndex[g.hunt].band) ? huntIndex[g.hunt].band : null);
  const rows = Object.entries(open).filter(([, g]) => bandOf(g));
  const topLevel = Math.max(...rows.map(([, g]) => bandOf(g)[1]));
  const grounds = {};
  for (const [id, g] of rows) {
    const [floor, top] = bandOf(g);
    if (top >= topLevel || !roster[id]) continue;
    const fit = (g.pockets || []).some((p) => p.forParty) ? 'party' : g.groupFit || 'both';
    grounds[id] = Object.freeze({ floor, top, fit, ...(exceptions[id] || {}) });
  }
  return { topLevel, grounds: Object.freeze(grounds) };
}
const LADDER = scaleLadderOf(OPEN_GROUNDS, HUNT_INDEX);

/** THE TOP GROUND: the open ground whose band ends at the top Level (the highest floor if two do); the ladder every scaled hunt climbs toward. */
export function topGroundOf(open = OPEN_GROUNDS, huntIndex = HUNT_INDEX) {
  let best = null, floor = -1, top = -1;
  for (const [id, g] of Object.entries(open)) {
    const band = g && huntIndex[g.hunt] && huntIndex[g.hunt].band;
    if (!Array.isArray(band)) continue;
    if (band[1] > top || (band[1] === top && band[0] > floor)) { best = id; top = band[1]; floor = band[0]; }
  }
  return best;
}

/* A SCALED HUNT PAYS XP ON THE TOP GROUND'S FIT (designer 2026-11-11, lane/d-solo-fifteen). A ground's XP fit (balance-sheet.js GROUND_XP_FIT)
   corrects its own layout at its own Levels (the Cellar's 1.28 is the tutorial's slow room at Levels 1-8); carried to Level 50 it paid a scaled
   Cellar hero alone 241k an hour against the Warrens' own 226k, and no one xpPm held that under while the Glade scaled one Level past its band
   stayed worth buying. So every scaled kill reads the fit of the top ground (topGroundOf: today the Warrens' 0.76), its own layout aside: one
   number for every scaled Level, so the server's kill bound never falls from one Level to the next (2027-03-21-scaled-hunts.sql's self-check;
   the fit of the ground that owns each Level fell 0.90 -> 0.76 at 32 and broke it). A new top ground moves it for every scaled hunt, from the data. */
const xpFitAt = (groundId) => ({ [groundId]: GROUND_XP_FIT[topGroundOf()] || 1 });

export const SCALED_HUNTS = Object.freeze({
  /* the slider: whole hours, 1 to 24 a purchase (Tyler 11-07 "up to 24 hours") */
  minHours: 1,
  maxHours: 24,
  /* a hero holds at most this many banked hours a ground, so a price change never leaves a big pre-bought stock. They never expire:
     a bought hour is never lost. */
  bankMaxHours: 24,
  /* the buy RPC's clamp: hours a hero may buy a server day, every ground together (a refill of two banks, and more than a day's stamina) */
  buyMaxHoursPerDay: 48,
  /* the highest Level a ground scales to: the top of the highest open ground's band (today the Coppercap Warrens, 32 to 50) */
  topLevel: LADDER.topLevel,
  /* Level XP a kill, permille of the formula's at the scaled Level. 800: the scaled Glade's four at 50 read 1.13x the Warrens' XP at
     the formula's own (its layout kills fast); at 800 every tested gap reads 0.5-0.9x the right-Level ground. 700 since the re-tune
     (lane/b-one-difficulty, 2026-11-08): the mixed party cells rose, and a scaled four reads its ground's cell (the Thicket's 1860, the
     Glade's 1730, against the Warrens' 1475), so at 800 the Thicket's and the Glade's fours at 50 read 1.01x and 1.08x the Warrens */
  xpPm: 820,
  /* 820 since a scaled kill reads the top ground's XP fit (below; 2026-11-11): at 700 the Glade scaled one Level past its band paid 1.10x itself, under the 1.25x
     that makes a bought hour worth it (fee-guard), while a scaled Cellar hero alone at 50 read 0.65x the Warrens' own; 820 lands the Glade at about 1.29x itself and the
     scaled fours at 0.86-0.90x the Warrens' four, under it as ruled. */
  /* A PARTY'S SHARE ON A SCALED HUNT (designer 2026-11-11, lane/d-solo-fifteen): a party keeps this much of its ground's party cell (party-class-xp.js
     PARTY_CLASS_XP), a hero alone keeps the whole solo boost. The cells are fitted at the ground's floor so a mixed four earns 15-25% more a head
     than a hero alone there; on the same ground scaled to 41-50 a four kills far faster for its share, and since the 11-11 cells (a four's cell
     about doubled when every group met one pack) a scaled Thicket or Glade four read 0.96-0.99x the Warrens' four, the right-Level ground (tests/
     scaled-hunts fee-guard), so a bought hour was the best party grind and the Warrens' own XP could not be re-dialed. Rides the scaled row
     (scaledStats `partyPm`) through the engine's one door (damage.js rowOf -> xp-share.js), so the sim's what-if and the settle read the same.
     The number is measured below (fee-guard: a scaled four under the right-Level ground's four) and never falls under a hero alone. */
  partyPm: 700,
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

/* EVERY GROUND THAT CAN BE SCALED, from the ground data (scaleLadderOf): today the Mill Cellar, the Thicket, Wickstead, the Sewer and
   the Glade. { id: { floor, top, fit, danger?, why? } } */
export const SCALABLE_GROUNDS = LADDER.grounds;

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
  const f = formulaStats({ level: level + gap, role, tier, floor: to, fit: g.fit, ground: groundId }, { formula: formulaOf(g, to), groundXp: xpFitAt(groundId) });
  const mean = ((f.gp[0] + f.gp[1]) / 2) * (SCALED_HUNTS.coinPm[g.fit] / 1000);
  const lo = Math.max(1, Math.round(mean * STAT_FORMULA.gp.lo));
  return { level: level + gap, hp: f.hp, atk: f.atk, baseAcc: f.baseAcc, def: f.def,
    xp: Math.max(1, Math.round((f.xp * SCALED_HUNTS.xpPm) / 1000)), gp: [lo, Math.max(lo, Math.round(2 * mean - lo))], partyPm: SCALED_HUNTS.partyPm };
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
