// ════════════════════════════════════════════════════════════════════════
// src/data/hearthrise.js — THE HEARTHRISE'S FIRE: HOW THE FUEL THE TOWN BURNS SIZES THE XP WEEKEND (the designer's ruling D-7 section
// 1.3, docs/design/overhaul/review/06-designer-rulings-w1.md; built by lane/c-social, FB-12).
//
// Every fuel item burned at the Great Hearth (src/data/hearth.js HEARTH_FUELS: Bones, the family fuels, Tower Cinders and the higher
// rungs) adds 1 to one server-wide fire, and a named fuel adds an hour of bones. When the Hearthrise lights (src/data/live-events.js,
// weekend 1 of the 28 day cycle) the server reads the fire ONCE:
//   fuelMarks = floor(marks x fuel / goal), at most `marks`
//   marks     = the smaller of `marks` and fuelMarks + the boss marks (one when the server drives the world boss off)
//   the size  = floorPm + stepPm x marks permille of Level XP: +10, 13, 16, 19, 22 or 25%
// and the fire resets: fuel burned during the weekend counts toward the next one.
//   goal = fuelPerActiveDay x weekly active accounts x the days since the last lighting (at most maxDays), so 7 accounts fill it as
//   easily as 7,000. One account adds at most fireDayCapShares x fuelPerActiveDay in a UTC day.
// Gold never moves the fire (RULED 2026-11-04). The server folds the journal's fuel rows into the fire at most once an hour, never on the
// settle path (supabase/migrations/1043-hearthrise.sql). Its copy of these numbers is the generated catalogue hr_hearth_fire_rule
// (tools/gen-live-events.mjs, --check).
//
// WHY A FILE OF ITS OWN and not src/data/hearth.js (where D-7 names the row): hearth.js is vendored into the hr-accrue edge bundle, and
// the fire is never read by the engine. A row there would move the edge's payload for a number the edge never reads.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { FLAME_FUEL } from './core-model.js';

/*   fireShare         permille of the fuel a reference account finds in a day that fills its share (JUDGMENT, D-7: feeding the fire
                       is a choice, not a chore; every active account burning a quarter, or half of them burning half, fills it)
     fireDayCapShares  one account adds at most this many shares of fuelPerActiveDay in one UTC day (JUDGMENT, D-7: one keen account
                       can carry four accounts' share on a small server, and gold buying fuel can't fill a big server's fire alone)
     marks             marks over the floor; the fire is full at this many
     floorPm, stepPm   the size: the floor (CE-8's +10%), then a step a mark (five marks a player can count, to 27-5's +25%)
     maxDays           the goal counts at most this many days since the last lighting (one cycle)
     namedFuelFire     what one named fuel adds: one hour of bones, read from data, never typed */
export const HEARTHRISE_FIRE = Object.freeze({
  fireShare: 250, fireDayCapShares: 4, marks: 5, floorPm: 1100, stepPm: 30, maxDays: 28,
  namedFuelFire: FLAME_FUEL.bonesPerHour,
});

/* THE FUEL A REFERENCE ACCOUNT FINDS IN A DAY (D-7: a mid four on Normal, 12 hunted hours, fuel items dropped, the median over open
   grounds). FB-3's matrix reader replaces it. STAND-IN until it reads: one hero's measured rate, FLAME_FUEL.bonesPerHour x 12 hunted hours
   = 1,452 a day (a lone hero in the cellar on 2026-10-19, before the engine fix and before four heroes). */
export const FIRE_REFERENCE_DAY = Object.freeze({
  fuel: FLAME_FUEL.bonesPerHour * 12,
  source: 'stand-in: FLAME_FUEL.bonesPerHour x 12 hunted hours (2026-10-19, one hero, before the fix)',
});

/* fireShare x the reference day: the fuel one weekly active account's share is for one day (363 on the stand-in). */
export const fuelPerActiveDay = Math.floor((FIRE_REFERENCE_DAY.fuel * HEARTHRISE_FIRE.fireShare) / 1000);

/* THE WORDS ON THE GREAT HEARTH (D-7 section 1.5, the designer's exact words). {marks} 0 to 5, {start} the next lighting in the
   player's clock, {pct} the size it would light at now, {need} the fuel to the next mark. */
export const FIRE_WORDS = Object.freeze({
  title: 'Hearthrise',
  marks: 'Fire: {marks} / 5',
  lights: 'Lights {start}: +{pct}% Level XP',
  next: 'Next mark: {need} more fuel',
  full: 'Full. +25% Level XP when it lights',
  explain: 'Every bit of fuel burned here grows the fire. The bigger it is when the Hearthrise lights, the more Level XP everyone earns.',
  lit: 'The Hearthrise is lit. +{pct}% Level XP until {end}.',
});
