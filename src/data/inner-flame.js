// ════════════════════════════════════════════════════════════════════════
// src/data/inner-flame.js — THE INNER FLAME AS DATA: one flame a company, Remains burn into height, height is Rare luck, height burns
// down only while heroes hunt, and what burns down is Flame Level, which is room (systems, lane/flame-temper-build, 2026-11-22;
// docs/design/redesign/21-flame-temper-imbue-loot.md section 1, the designer's levers and starting values).
//
// UNITS. A POINT is the Remains one reference hero drops in one hunted hour at its own band (`fuelRef` units). Height and points are
// held in MILLI-POINTS (whole numbers), decay in PARTS PER MILLION a hunted hero-hour, luck in permille added to 1 on the Rare and Very
// Rare chance. The four formulas (21 section 1.2), whole-number forms in src/core/inner-flame.js:
//   decay(FL) = decayPm1 - (decayPm1 - decayPm99) x (FL - 1) / 98          a hunted hero-hour
//   room(FL)  = flameCover / decay(FL)                                       the most height the fire holds
//   luck(H)   = luckMax x H / (H + luckHalf)
//   burned    = decay(FL) x H a hunted hero-hour                             Flame XP: points burned down raise Flame Level
// The SQL twins read the catalogue tools/gen-flame-temper.mjs writes from this file (hr_flame_rules, hr_flame_levels, hr_flame_fuel).
//
// STARTING VALUES, NOT RULINGS (the Lab moves each inside its band; in band is enough):
//   decayPm1 80, decayPm99 40      21 section 1.2 levers (permille a hunted hero-hour; held here as ppm, x1000)
//   coverPm 1500                   the room over the own-drops height (09 section 5.4's cover)
//   luckMaxPm 600, luckHalfMpts    the Rare multiplier's ceiling (never reached) and the height at half of it (25 points)
//   topRankPm 500, topRankMaxPm 800  the top open rank's chance at a depth, x (1 + luck), held under the max (D-4)
//   pointsTo99 6000, curvePm 1045  the long chase: each Level asks 1.045x the last, summing to 6,000 points at 99
//   burstPm 250                    a named fuel's burst, a share of the room, and how far it may stand over it
//   fuelRef 100                    ASSUMED, F1 owed (21 section 1.7: v1-climb has no Remains column yet). COMPUTED as a guess from
//                                  Muster Barrows' pack: about 0.9 Remains a kill (the Pikeman's Bones 0.5 + Bone Chips 0.4, the swarm
//                                  being most of a pull) at PAY.refKillsHead 120 kills a head an hour is about 108; 100 is the round start
//   stokeBuyMax 200, stokeCapHoursPm 100   the stoke rule's clamps: Remains bought a day, and the most one unit may cost (0.1 h of wage)
//
// THE FUEL (21 section 1.2). Remains are the Hearth's goods (src/data/hearth.js HEARTH_FUELS items) a scale ground drops. One good a
// band (13-market 2.4) is OWED: until goods carry a band, a good's band is the entry Level of the lowest scale ground whose pack drops it
// (DANGER_GROUNDS, its pack in src/data/grounds), so a far company gets almost nothing from a new player's bones and the worth follows
// the wage. A unit of band b burns `1 / fuelRef x min(1, (1 + powerStep) ^ (b - top))` points, `top` the company's highest hero Level.
//
// DARK. Nothing reads luck into a roll until the roller lands (lane/drop-formula, wave 4); the server's verbs and the settle's decay
// sit behind the hr_flags switch `inner_flame` (off at apply). tests/inner-flame.mjs holds the levers, the twins and the fuel rows.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { HEARTH_FUELS } from './hearth.js';
import { DANGER_GROUNDS } from './danger.js';
import { GROUND_PACKS } from './grounds/index.js';

export const FLAME = Object.freeze({
  decayPpm1: 80000,
  decayPpm99: 40000,
  coverPm: 1500,
  luckMaxPm: 600,
  luckHalfMpts: 25000,
  topRankPm: 500,
  topRankMaxPm: 800,
  levelMax: 99,
  pointsTo99: 6000,
  curvePm: 1045,
  burstPm: 250,
  fuelRef: 100,
  stokeBuyMax: 200,
  stokeCapHoursPm: 100,
  /* the stoke rule's targets, as a share of the room in permille: Keep full, Keep 2/3, Off (21 section 1.5) */
  stokeKeeps: Object.freeze({ full: 1000, two_thirds: 667, off: 0 }),
});

/* THE LEVEL CURVE: points (milli-points) burned down to stand at each Flame Level, 1 to levelMax. Level L to L + 1 asks a x curve^(L - 1),
   the 98 steps summing to pointsTo99. Walked by multiplication from 1 (each exactly rounded), then each threshold rounded to a whole
   milli-point once: the same table on every engine, and the SQL reads this table (hr_flame_levels), never a power. */
export const FLAME_LEVELS = (() => {
  const g = FLAME.curvePm / 1000, steps = FLAME.levelMax - 1;
  const pows = [1];
  for (let i = 1; i <= steps; i++) pows.push(pows[i - 1] * g);
  const geomSum = (pows[steps] - 1) / (g - 1);
  const a = (FLAME.pointsTo99 * 1000) / geomSum;
  const out = [0];
  for (let L = 2; L <= FLAME.levelMax; L++) out.push(Math.round(a * (pows[L - 1] - 1) / (g - 1)));
  out[steps] = FLAME.pointsTo99 * 1000;
  return Object.freeze(out);
})();

/* THE FUEL ROWS: { item, band }, one a Remains good a scale ground drops, band the lowest such ground's entry Level (the header). */
export const FLAME_FUEL = (() => {
  const remains = new Set(HEARTH_FUELS.map((f) => f.item));
  const band = new Map();
  for (const p of GROUND_PACKS) {
    const g = Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, p.id) ? DANGER_GROUNDS[p.id] : null;
    if (!g) continue;
    for (const m of Object.values(p.monsters || {})) for (const d of m.drops || []) {
      if (remains.has(d.id) && (!band.has(d.id) || band.get(d.id) > g.entryLevel)) band.set(d.id, g.entryLevel);
    }
  }
  return Object.freeze([...band.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([item, b]) => Object.freeze({ item, band: b })));
})();

/** Every problem with the levers, as text; [] when sound (tests/inner-flame.mjs, tools/gen-flame-temper.mjs refuses to write on any). */
export function validateFlame() {
  const out = [], F = FLAME, int = (v) => Number.isInteger(v);
  for (const [k, v] of Object.entries(F)) if (k !== 'stokeKeeps' && !(int(v) && v > 0)) out.push('FLAME.' + k + ' is not a whole number above 0');
  if (!(F.decayPpm99 < F.decayPpm1)) out.push('FLAME: the burn at 99 must be under the burn at 1 (the Level is the reward)');
  if (!(F.coverPm > 1000)) out.push('FLAME.coverPm must be over 1000: the room stands over the own-drops height');
  if (!(F.topRankPm <= F.topRankMaxPm && F.topRankMaxPm <= 1000)) out.push('FLAME: topRankPm <= topRankMaxPm <= 1000');
  if (!(F.curvePm > 1000)) out.push('FLAME.curvePm must be over 1000');
  const K = F.stokeKeeps;
  if (!(K.off === 0 && K.full === 1000 && K.two_thirds > 0 && K.two_thirds < 1000)) out.push('FLAME.stokeKeeps: off 0 < two_thirds < full 1000');
  if (FLAME_LEVELS.length !== F.levelMax) out.push('FLAME_LEVELS has ' + FLAME_LEVELS.length + ' rows, want ' + F.levelMax);
  for (let i = 1; i < FLAME_LEVELS.length; i++) if (!(int(FLAME_LEVELS[i]) && FLAME_LEVELS[i] > FLAME_LEVELS[i - 1])) out.push('FLAME_LEVELS rises at every Level (' + (i + 1) + ')');
  if (FLAME_FUEL.length === 0) out.push('FLAME_FUEL: no Remains good drops on a scale ground');
  for (const r of FLAME_FUEL) if (!(typeof r.item === 'string' && int(r.band) && r.band > 0)) out.push('FLAME_FUEL row ' + JSON.stringify(r) + ' is not { item, band }');
  return out;
}
