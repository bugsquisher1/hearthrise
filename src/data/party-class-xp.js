// ════════════════════════════════════════════════════════════════════════
// src/data/party-class-xp.js — PARTY LEVEL XP: BETTER ONLY WITH DIFFERENT CLASSES
//
// Tyler 2026-10-31: "Party exp should only be better if there are different classes
// in the party." Balance ruling 10-25 §5 still sets the mixed targets (duo 105-115,
// trio 110-120, four 115-125 against a comparable solo); a same-class party never
// beats solo per head (tests/party-class-xp-line.mjs plays that on the real engine).
// Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be
// unchanged", then "Same monsters, re-tune" (lane/b-one-difficulty): a monster pays its
// whole kill for any party size, a hero hunting alone earns SOLO_XP_PM, and the mixed cells
// carry what a party needs to out-earn a typical hero alone (balance-sheet.js party).
//
// THE RULE (designer 10-31; ONE TABLE since Tyler 2026-11-16, "just balance the hunting grounds xp vs having a unique
// formula everywhere", lane/d-flat-party-xp):
//   - LEVEL XP only (src/core/hunt/xp-share.js): no gold or loot effect, skill XP untouched.
//   - FOUR CLASSES: Melee (a shield or not), Ranger, Mage, Healer.
//   - Read from the LIVING heroes at EACH kill, never latched: a death or a leave
//     changes the next kill. A hero alone earns SOLO_XP_PM, on every ground.
//   - ONE TABLE for every ground and every tier (PARTY_CLASS_XP): the cell is the factor on
//     the even share by how many heroes are alive and how many classes they hold. No ground
//     carries a row of its own (src/data/grounds/shape.js refuses one in a pack); what a party
//     earns on a ground is that ground's own pull, density and monster rows (balance-sheet.js).
//
// A PARTY LARGER THAN THE TABLE'S LARGEST SIZE reads that largest size (the party cap is
// a config value), so a same-class cut can never lapse by adding a hero.
//
// PURE ESM. Data, and the one reader of it (the engine and the party window both).
// ════════════════════════════════════════════════════════════════════════

import { HUNT_ROLES } from './hunt-roles.js?v=0.2.137';
import { GROUND_PACKS } from './grounds/index.js?v=0.2.137';
import { foldRows } from './grounds/shape.js?v=0.2.137';

/* THE CLASSES a party can hold: class id → the word the player reads and the hunt roles it covers.
   Tank is a function of a Melee, not a class of its own (Tyler 2026-10-16). */
export const PARTY_CLASSES = Object.freeze({
  melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),
  ranger: Object.freeze({ label: 'Ranger', roles: Object.freeze(['ranger']) }),
  mage: Object.freeze({ label: 'Mage', roles: Object.freeze(['mage']) }),
  healer: Object.freeze({ label: 'Healer', roles: Object.freeze(['healer']) }),
});

/* A HERO HUNTING ALONE (Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be unchanged. Either they are
   strong enough to do the harder content or they aren't"). Alone, a hero takes the whole pull with nobody to hold it or heal it, on the
   same tiers a party fights; this pays it a little for that. +5%, the largest round boost that keeps every solo ground's Normal on the
   pace contract (balance-sheet.js normal.xpVsContract, 0.90-1.10 at the band middle): on the v0.2.106 grade the Thicket read 1.025x and
   the Glade 1.016x, so +10% put them at 1.13x and 1.12x, past the band, and +5% at 1.08x and 1.07x. Level XP only, read at each kill
   like every cell: a party's last hero standing hunts alone and earns it. A kill's share floors (xp-share.js), so where kills are worth
   a few dozen XP an hour reads less than +5% (a Wickstead tank at its floor +3.5%, 27,216 -> 28,165). */
/* +15% (Tyler 2026-11-11: "solo hunters get +15% Level XP", on any tier; replaces the +5% above, never stacks with it; lane/d-solo-fifteen).
   The party cells below are the pack's pay in permille and the lone hero is the reference every party line is measured against, so each cell moved
   with it, x1150/1050 to the nearest 5, and was re-measured: every party-vs-alone reading Tyler ruled on 2026-11-11 holds. */
export const SOLO_XP_PM = 1150;

/* ONE TABLE FOR EVERY GROUND AND EVERY TIER (Tyler 2026-11-16: "just balance the hunting grounds xp vs having a unique formula everywhere. that is
   the better route."; lane/d-flat-party-xp). It replaces the per-ground rows (2026-11-01 to 2026-11-13, one row a ground, fitted on Normal) and the
   flat cut PARTY_XP_PM tried the same day: a party's bonus reads its SIZE and how many CLASSES it holds, never the ground or the tier, so the wiki can
   print it as one table. What a party earns on a ground against its heroes alone is the ground's own business: its pull, density and monster rows
   (balance-sheet.js, the pack's tierOverride), re-fitted with this table so that, measured on the real settle (tools/balance-sim/party-tier-xp.mjs,
   tests/party-class-xp-line.mjs's harder-tier arm):
     - on Dangerous and Deadly every mixed party earns at least what the same heroes earn alone (Tyler 2026-11-16, "every Dangerous/Deadly party mix
       stays >= the same heroes alone"), and a mixed four on Deadly at most about 2.5x the pace contract (Tyler 2026-11-16, "~2-2.5x");
     - Normal is not tuned for parties (Tyler 2026-11-16: "its not restricted, but it's not necessarily meant for them"), so a mix there may earn
       under its heroes alone, and the Party window says so;
     - one class never out-earns its heroes alone (Tyler 2026-10-31), so the one-class column is the smallest any ground's row held (the Barrow
       Muster's, where a party kills fastest against a hero alone), and every ground's one-class party earns no more than it did.
   A CELL is permille on the even share (xp-share.js: a kill's Level XP over the living heroes, times the cell). The mixed cells are the median
   Dangerous/Deadly fit of the 2026-11-16 measurement (party-tier-xp, 1,364 cells): a four of four classes needs about 1750 to stand over its heroes
   alone where a pull of five meets it, and no more than that, or the full box's Deadly four passes 2.5x the contract. The cells between are the old
   rows' median shape (a four of three classes 0.98 of four, of two 0.88; a three of two classes 0.93 of three). */
const row = (two, three, four) => Object.freeze({ 2: Object.freeze(two), 3: Object.freeze(three), 4: Object.freeze(four) });
/* THE ONE-CLASS PAIR 880 (was 990; on set v0.2.135, 2026-11-17): with Turning Cut on every melee weapon without a shield (Tyler 2026-11-16) a shield and
   hatchets pair on the Pauper Vaults at 8 each read 1.03 of its heroes alone at 990 and 1.05 at 950 (tests/party-class-xp-line.mjs, 3 seeds), over the 10-31
   line. 880 holds it under with the dice's room. */
/* THE FOUR OF THREE AND FOUR CLASSES 1670 AND 1700 (were 1765 and 1800; 2026-11-17): Deadly's HP fell to 1150 so that Deadly pays more an hour than Dangerous
   for a party and for a hero alone (both read 1.03-1.38 of Dangerous after it, party-tier-xp), and a four with Turning Cut then read up to 2.6x the pace
   contract on Deadly. A cell is the one lever that touches a party and never a hero alone. */
export const PARTY_CLASS_XP = row([880, 1500], [990, 1600, 1700], [970, 1580, 1670, 1700]);

/* WHAT THE PLAYER IS TOLD (designer 2026-11-02; blind party test 2026-11-01). The table above is a factor on an even share of a bigger pull, so "52% more" sat on a party
   that measured 19% more than its heroes alone. THIS row is the measured answer, in whole percent to the nearest 5: Level XP per hero at the default pull, against the
   same heroes alone as built, one row per ground in the table's shape (tools/balance-sim plan b1102p, real settle, 1 h x 2 seeds a cell, one mix a cell; the Thicket's one-class
   cells are the mean of its shield, bow and wand parties after party-class-xp-line moved them under 1000; its four's -10 is the mean of all five weapons at the 1000 cell, 11-04, and reads only for a one-class four of mixed roles: see ONE_ROLE_VS_ALONE). It pays nothing;
   tests/hunt-core/first-week-bands.mjs vs-alone plays the full mix against it. Retune the table, re-measure this.
   RE-MEASURED 2026-11-07 on the formula's rows with tier dials (lane/b-party-xp; tools/balance-sim/grade.mjs full, Normal, at the floor, each seat over the same way alone):
   the Sewer pair +25, Wickstead's three +15, and the fours that read off, the Cellar's at 3 and 4 classes +9% and +28% (10, 30), Wickstead's +26% and +27% (25, 25).
   RE-MEASURED 2026-11-08, SAME MONSTERS RE-TUNED (lane/b-one-difficulty; tests/party-class-xp-line.mjs --table --mixed: the floor, the default pull, 15-minute party
   cells, the same heroes alone as built): one class is the mean of its five one-class parties; 2 of 2, 3 of 3 and 4 of 4 the mean of the played mixes; 3 of 2,
   4 of 2 and 4 of 3 the size's mix times the cell ratio. A tank and a healer are the slowest heroes alone, so against the same heroes alone a mixed party reads
   more than against a typical hero alone (the cells above). first-week-bands vs-alone: the Thicket's mix at 10 reads +35.5%, the Glade's at 24 +23.1%.
   THE ONE-CLASS ANSWERS (the lane's fifth commit) are re-measured the same way at the raised one-class cells, never scaled (a small kill's share floors).
   RE-READ 2026-11-11 UNDER SOLO +15% (lane/d-solo-fifteen; party-class-xp-line --table --mixed, the floor, 3 seeds): every cell lands on its number or one 5-step
   from it (the Cellar's four 28, the Glade's four 34, the Warrens' three 29, Wickstead's three 43), so the lines stand.
   RE-WRITTEN 2026-11-17 ON THE ONE TABLE AND SET v0.2.135 (cloth's smaller damage, Turning Cut on every melee weapon without a shield, the one-class pair 950;
   tests/party-class-xp-line.mjs --mixed --write, 3 seeds, the floor): every ground's line here and in its pack is that run's. */
const said = (two, three, four) => Object.freeze({ 2: Object.freeze(two), 3: Object.freeze(three), 4: Object.freeze(four) });
const BASE_VS_ALONE = Object.freeze({
  mill_cellar: said([-60, -30], [-70, -45, -45], [-80, -60, -60, -60]),
  meadowbrook_thicket: said([-45, -10], [-55, -25, -20], [-65, -40, -35, -35]),
  wickstead: said([-45, -10], [-55, -25, -20], [-65, -45, -40, -40]),
  mosslight_glade: said([-40, 0], [-45, -10, -5], [-55, -25, -20, -20]),
  millrace_sewer: said([-35, 10], [-35, 10, 15], [-45, 0, 5, 5]),
  coppercap_warrens: said([-30, 20], [-25, 20, 25], [-30, 15, 20, 25]),
});
/* A ground pack's measured line (src/data/grounds/<id>/pack.js `partyVsAlone`: { 2, 3, 4 }, whole fives, measured on the real settle). */
export const PARTY_VS_ALONE = Object.freeze(foldRows('party line', BASE_VS_ALONE, GROUND_PACKS, (p) => (p.partyVsAlone ? { [p.id]: said(p.partyVsAlone[2], p.partyVsAlone[3], p.partyVsAlone[4]) } : {})));

/* A FOUR WHO ALL SHARE ONE ROLE READS ITS OWN LINE (designer 2026-11-04; CLAUDE.md §6). The Thicket's one-class four pays the even share, so its weapons no longer sit near one number, and a four of wands earns more than
   alone. Whole percent to the nearest 5, against the same heroes alone (1 h x 2 seeds, Levels 5 and 10: shields -12, -15; hammers -11, -9; bows -9, -8; staffs -12, -11; wands +4, +5). first-week-bands vs-alone plays it.
   Since the solo boost (2026-11-08) each is its number over 1.05: shields -20, the rest -15, and wands no longer over a hero alone (0).
   RE-MEASURED 2026-11-08, same monsters re-tuned (the vs-alone cell itself: Level 10, 1 h x 2 seeds): shields -38.7, axes -42.0, bows -36.5, wands -28.6, staves -32.2.
   At the one-class cell 1190 (the lane's fifth commit): shields -22.9, axes -27.1, bows -20.1, wands -10.1, staves -14.7.
   RE-MEASURED 2026-11-16 on the one table (one-class four 970; lane/d-flat-party-xp, tests/party-class-xp-line.mjs --table --mixed, the floor): shields -60.7,
   axes -70.5, bows -67.0, wands -69.3, staves -62.8. */
const ONE_ROLE_VS_ALONE = Object.freeze({
  meadowbrook_thicket: Object.freeze({ 4: Object.freeze({ tank: -60, melee_dps: -70, ranger: -65, mage: -70, healer: -65 }) }),
});

const CLASS_OF_ROLE = Object.freeze(Object.fromEntries(Object.entries(PARTY_CLASSES).flatMap(([c, r]) => r.roles.map((x) => [x, c]))));

/**
 * THE ONE READER. `roles`: the hunt role of each hero counted (the living ones, in the engine). Answers { permille, classes: [class ids held,
 * in PARTY_CLASSES order] }. A role with no class counts as a hero and no class (at least one class is always read). The ground and the tier
 * never read (one table, Tyler 2026-11-16).
 */
export function partyClassXp(roles) {
  const held = new Set();
  for (const r of roles) if (Object.hasOwn(CLASS_OF_ROLE, r)) held.add(CLASS_OF_ROLE[r]);
  const classes = Object.keys(PARTY_CLASSES).filter((c) => held.has(c));
  const n = roles.length;
  if (n === 1) return { permille: SOLO_XP_PM, classes };
  if (n < 2) return { permille: 1000, classes };
  const sizes = Object.keys(PARTY_CLASS_XP).map(Number);
  const cells = PARTY_CLASS_XP[Math.min(n, Math.max(...sizes))];
  const cell = cells[Math.min(Math.max(classes.length, 1), cells.length) - 1];
  return { permille: cell, classes };
}

/** The measured percent (PARTY_VS_ALONE) for these living roles on this ground; null with no row or under two heroes. */
export function partyVsAlone(groundId, roles) {
  if (roles.length < 2 || !Object.hasOwn(PARTY_VS_ALONE, groundId)) return null;
  const { classes } = partyClassXp(roles);
  const tab = PARTY_VS_ALONE[groundId];
  const n = Math.min(roles.length, Math.max(...Object.keys(tab).map(Number)));
  const oneRole = Object.hasOwn(ONE_ROLE_VS_ALONE, groundId) ? ONE_ROLE_VS_ALONE[groundId][n] : null;
  if (oneRole && roles.every((r) => r === roles[0]) && Object.hasOwn(oneRole, roles[0])) return oneRole[roles[0]];
  const cells = tab[n];
  return cells[Math.min(Math.max(classes.length, 1), cells.length) - 1];
}

/** Every problem with the tables, as strings. Empty = valid. `grounds`: the ground ids a row may name. */
export function validate(grounds) {
  const out = [];
  /* a hero alone earns more than the pack pays, and at most a fifth over it (Tyler 2026-11-11: +15%; 11-08 'a small exp boost') */
  if (!Number.isInteger(SOLO_XP_PM) || SOLO_XP_PM <= 1000 || SOLO_XP_PM > 1200) out.push('a hero alone earns ' + SOLO_XP_PM + ', not a small boost (1001-1200)');
  for (const role of Object.keys(HUNT_ROLES)) if (!Object.hasOwn(CLASS_OF_ROLE, role)) out.push('role ' + role + ' has no party class');
  for (const [c, r] of Object.entries(PARTY_CLASSES)) for (const x of r.roles) if (!HUNT_ROLES[x]) out.push('class ' + c + ' names no role ' + x);
  const classCount = Object.keys(PARTY_CLASSES).length;
  for (const [g, sizes] of Object.entries(ONE_ROLE_VS_ALONE)) for (const [n, row] of Object.entries(sizes)) for (const [role, v] of Object.entries(row)) {
    if (!Object.hasOwn(PARTY_VS_ALONE, g)) out.push(g + ': ONE_ROLE_VS_ALONE names a ground with no measured line');
    if (!HUNT_ROLES[role]) out.push(g + ' ' + n + ': ONE_ROLE_VS_ALONE names no role ' + role);
    if (!Number.isInteger(v) || v % 5 !== 0) out.push(g + ' ' + n + ' ' + role + ': ONE_ROLE_VS_ALONE needs whole fives');
  }
  /* ONE TABLE (Tyler 2026-11-16): a size's cells, one per class it can hold, whole permille; more classes always pay more (Tyler 10-31). One class is
     held under solo by the measured guard (tests/party-class-xp-line.mjs), not here. */
  if (Object.keys(PARTY_CLASS_XP).join() !== '2,3,4') out.push('the table names sizes ' + Object.keys(PARTY_CLASS_XP) + ', not 2, 3 and 4');
  for (const n of [2, 3, 4]) {
    const cells = PARTY_CLASS_XP[n];
    if (!Array.isArray(cells) || cells.length !== Math.min(n, classCount)) { out.push(n + ' heroes needs ' + Math.min(n, classCount) + ' cells'); continue; }
    if (cells.some((v) => !Number.isInteger(v) || v <= 0)) out.push(n + ' heroes: cells are whole permille > 0');
    for (let i = 1; i < cells.length; i++) if (cells[i] <= cells[i - 1]) out.push(n + ' heroes: another class pays no more');
  }
  /* the Party window's measured line, one per ground: a ground a row may name, whole fives, one per class count */
  for (const [g, words] of Object.entries(PARTY_VS_ALONE)) {
    if (grounds && !grounds.includes(g)) out.push(g + ': the Party window\'s line names no ground');
    for (const n of [2, 3, 4]) if (!Array.isArray(words[n]) || words[n].length !== Math.min(n, classCount) || words[n].some((v) => !Number.isInteger(v) || v % 5 !== 0)) out.push(g + ': ' + n + ' heroes: PARTY_VS_ALONE needs whole fives, one per class count');
  }
  if (grounds) for (const g of grounds) if (!Object.hasOwn(PARTY_VS_ALONE, g)) out.push(g + ': the Party window has no measured line for this ground');
  return out;
}
