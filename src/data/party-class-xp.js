// ════════════════════════════════════════════════════════════════════════
// src/data/party-class-xp.js — PARTY LEVEL XP: BETTER ONLY WITH DIFFERENT CLASSES
//
// Tyler 2026-10-31: "Party exp should only be better if there are different classes
// in the party." Balance ruling 10-25 §5 still sets the mixed targets (duo 105-115,
// trio 110-120, four 115-125 against a comparable solo); a same-class party never
// beats solo per head (tests/party-class-xp-line.mjs plays that on the real engine).
// Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be
// unchanged" (lane/b-one-difficulty): a hero hunting alone earns SOLO_XP_PM, and every
// mixed cell carries that boost too, so a party's class bonus is still measured against
// a hero alone. A one-class cell does not, so a one-class party falls further under solo.
//
// Designer's rule (10-31, table 11-01; it reads with each ground's `partyPull`, hunt-grounds.js):
//   - LEVEL XP only (src/core/hunt/xp-share.js): no gold or loot effect, skill XP untouched.
//   - FOUR CLASSES: Melee (a shield or not), Ranger, Mage, Healer.
//   - Read from the LIVING heroes at EACH kill, never latched: a death or a leave
//     changes the next kill. A hero alone earns SOLO_XP_PM, on every ground.
//   - One row per ground. The cell is the factor applied on top of the even share.
//
// A ROW: { heroes alive: [permille at 1 class, at 2 classes, ...] }, as many cells as
// that many heroes can hold classes. The numbers are the designer's to retune, here.
//
// A GROUND WITH NO ROW PAYS A PARTY 1000 (the even share): no bonus and no cut until the designer
// writes its row. It fails safe for pay, and the standing guard plays every ground
// (tests/party-class-xp-line.mjs), so a new ground where a same-class party beats solo
// turns that guard red until its row is written.
//
// A PARTY LARGER THAN A ROW'S LARGEST SIZE reads that largest size (the party cap is
// a config value), so a same-class cut can never lapse by adding a hero.
//
// PURE ESM. Data, and the one reader of it (the engine and the party window both).
// ════════════════════════════════════════════════════════════════════════

import { HUNT_ROLES } from './hunt-roles.js?v=0.2.108';

/* THE CLASSES a party can hold: class id → the word the player reads and the hunt roles it covers.
   Tank is a function of a Melee, not a class of its own (Tyler 2026-10-16). */
export const PARTY_CLASSES = Object.freeze({
  melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),
  ranger: Object.freeze({ label: 'Ranger', roles: Object.freeze(['ranger']) }),
  mage: Object.freeze({ label: 'Mage', roles: Object.freeze(['mage']) }),
  healer: Object.freeze({ label: 'Healer', roles: Object.freeze(['healer']) }),
});

const row = (two, three, four) => Object.freeze({ 2: Object.freeze(two), 3: Object.freeze(three), 4: Object.freeze(four) });

/* A HERO HUNTING ALONE (Tyler 2026-11-08: "a solo person gets a small exp boost BUT the difficulty should be unchanged. Either they are
   strong enough to do the harder content or they aren't"). Alone, a hero takes the whole pull with nobody to hold it or heal it, on the
   same tiers a party fights; this pays it a little for that. +5%, the largest round boost that keeps every solo ground's Normal on the
   pace contract (balance-sheet.js normal.xpVsContract, 0.90-1.10 at the band middle): on the v0.2.106 grade the Thicket read 1.025x and
   the Glade 1.016x, so +10% put them at 1.13x and 1.12x, past the band, and +5% at 1.08x and 1.07x. Level XP only, read at each kill
   like every cell: a party's last hero standing hunts alone and earns it. A kill's share floors (xp-share.js), so where kills are worth
   a few dozen XP an hour reads less than +5% (a Wickstead tank at its floor +3.5%, 27,216 -> 28,165). */
export const SOLO_XP_PM = 1050;

/* ground id → its row (designer's final table, 2026-11-01). THE SOLO BOOST IN EVERY MIXED CELL (lane/b-one-difficulty, 2026-11-08): each cell
   of two or more classes is its 11-07 number x SOLO_XP_PM / 1000, to the nearest 5, so a mixed party keeps its measured lead over the same
   heroes alone (PARTY_VS_ALONE's mixed answers stand) and 10-25 §5 still reads against a hero alone as it is paid. The one-class cells
   did not move: a one-class party stands 5% further under a hero alone (Tyler 10-31), and the Thicket's four of wands no longer beats one. */
export const PARTY_CLASS_XP = Object.freeze({
  /* NO SEAT SLIDES UNDER TODAY ON THE FORMULA'S ROWS (lane/b-party-xp, 2026-11-07; tools/balance-sim/grade-compare.mjs, the release gate). The formula left lone heroes
     where they were and took 8-10% off a tank + healer pair: its tank against the median hero alone read 1.02 -> 0.93 on the Cellar and 0.95 -> 0.87 at the Sewer floor,
     and a three of tank, healer and bow 1.03 -> 0.99 on Wickstead. A ground's XP dial moves alone and party alike, so the cell is the lever: the Cellar's two-class pair
     1070 -> 1210 (its tank 1.04-1.05, its hammer and bow 1.12, today 1.11), the Sewer's 1000 -> 1100 (its tank 0.96 at the floor and 1.09-1.12 above it, today 0.95-1.07),
     Wickstead's three-class three 1220 -> 1270 (1.03-1.09, today 1.03-1.07). Measured on the real settle, full grade, Normal (tools/balance-sim/grade.mjs). */
  mill_cellar: row([1000, 1270], [990, 1175, 1240], [1000, 1315, 1335, 1470]),
  /* A one-weapon four pays the even share: Tyler 11-02 (same-weapon friends lose about 6-15%) beats 10-31 (one class never beats solo) where they conflict (CLAUDE.md §0; Coordinator 2026-11-04). The share floors per
     kill, so the cell moves in steps: 995 left shields at -17 to -19%, 1000 lands them at -12 to -15%, and a four of wands 4-5% over solo, the accepted cost and party-class-xp-line's one named exception. A pull of 7: mixed coin 1.04-1.05, over solo.
     RE-MEASURED ON THE FORMULA'S ROWS (lane/b-ground-formula-2, 1 h x 2 seeds at 10): the four row moved a head about 10% toward the party (a mix +33% against
     the window's 20%, wands +15%, shields -8%), so the row is scaled: 940 lands wands about +4% and shields about -17% (920 read +2% and -19%), the mix +20% (10-25 §5: 15-25%).
     party-class-xp-line on the same rows: the Thicket's mage duo read 1.05 and trio 1.09 (cells 930, 880), the Cellar's healer trio 1.007 (990), the Warrens'
     four of staves at 8 each 1.014 (960). */
  meadowbrook_thicket: row([930, 1355], [880, 1240, 1375], [940, 1155, 1210, 1240]),
  wickstead: row([880, 1125], [970, 1220, 1335], [970, 1260, 1300, 1335]),
  mosslight_glade: row([960, 1240], [1000, 1365, 1470], [1000, 1260, 1355, 1385]),
  millrace_sewer: row([800, 1155], [800, 1105, 1155], [800, 1105, 1155, 1240]),
  /* One class under the even share (Tyler 2026-10-31, "only better if there are different classes"; lane/c-caster-party-line). With Green Sickness on the Healer's default bar a pair at 8 each read 1.033 against
     one alone and a four 1.005: the debuff stays up far longer in a one-class party, as Greater Mend's load splits (a head's casts an hour, alone 84 and 256, in a pair 144 and 168). Mana gates can't hold it (at 95% the
     pair reads 0.987 and the four still 1.009, and each gate rerolls the first grounds' net chain); the cell can, and it moves no gold, no mixed party and no other ground. */
  coppercap_warrens: row([960, 1240], [970, 1260, 1345], [960, 1260, 1325, 1430]),
});

/* WHAT THE PLAYER IS TOLD (designer 2026-11-02; blind party test 2026-11-01). The table above is a factor on an even share of a bigger pull, so "52% more" sat on a party
   that measured 19% more than its heroes alone. THIS row is the measured answer, in whole percent to the nearest 5: Level XP per hero at the default pull, against the
   same heroes alone as built, one row per ground in the table's shape (tools/balance-sim plan b1102p, real settle, 1 h x 2 seeds a cell, one mix a cell; the Thicket's one-class
   cells are the mean of its shield, bow and wand parties after party-class-xp-line moved them under 1000; its four's -10 is the mean of all five weapons at the 1000 cell, 11-04, and reads only for a one-class four of mixed roles: see ONE_ROLE_VS_ALONE). It pays nothing;
   tests/hunt-core/first-week-bands.mjs vs-alone plays the full mix against it. Retune the table, re-measure this.
   RE-MEASURED 2026-11-07 on the formula's rows with tier dials (lane/b-party-xp; tools/balance-sim/grade.mjs full, Normal, at the floor, each seat over the same way alone):
   the Sewer pair +25, Wickstead's three +15, and the fours that read off, the Cellar's at 3 and 4 classes +9% and +28% (10, 30), Wickstead's +26% and +27% (25, 25).
   THE SOLO BOOST (lane/b-one-difficulty, 2026-11-08): a hero alone earns x1.05 and every mixed cell rose by the same x1.05, so the mixed answers stand; each
   one-class answer is its 11-07 number over 1.05, to the nearest 5 (-10 reads -15, -5 reads -10), played by first-week-bands vs-alone. */
const said = (two, three, four) => Object.freeze({ 2: Object.freeze(two), 3: Object.freeze(three), 4: Object.freeze(four) });
export const PARTY_VS_ALONE = Object.freeze({
  mill_cellar: said([-10, 10], [-10, 5, 15], [-25, 5, 10, 30]),
  meadowbrook_thicket: said([-15, 10], [-15, 5, 20], [-15, 0, 5, 20]),
  wickstead: said([-15, 5], [-15, 5, 15], [-20, 5, 25, 25]),
  mosslight_glade: said([-15, 5], [-20, 5, 15], [-15, 5, 10, 20]),
  millrace_sewer: said([-15, 25], [-20, 10, 20], [-25, 10, 10, 20]),
  coppercap_warrens: said([-15, 10], [-20, 5, 15], [-20, 5, 10, 20]),
});

/* A FOUR WHO ALL SHARE ONE ROLE READS ITS OWN LINE (designer 2026-11-04; CLAUDE.md §6). The Thicket's one-class four pays the even share, so its weapons no longer sit near one number, and a four of wands earns more than
   alone. Whole percent to the nearest 5, against the same heroes alone (1 h x 2 seeds, Levels 5 and 10: shields -12, -15; hammers -11, -9; bows -9, -8; staffs -12, -11; wands +4, +5). first-week-bands vs-alone plays it.
   Since the solo boost (2026-11-08) each is its number over 1.05: shields -20, the rest -15, and wands no longer over a hero alone (0). */
const ONE_ROLE_VS_ALONE = Object.freeze({
  meadowbrook_thicket: Object.freeze({ 4: Object.freeze({ tank: -20, melee_dps: -15, ranger: -15, mage: 0, healer: -15 }) }),
});

const CLASS_OF_ROLE = Object.freeze(Object.fromEntries(Object.entries(PARTY_CLASSES).flatMap(([c, r]) => r.roles.map((x) => [x, c]))));

/**
 * THE ONE READER. `roles`: the hunt role of each hero counted (the living ones, in the engine); `groundId`: the
 * ground (its `id`, HUNT_GROUNDS). Answers { permille, classes: [class ids held, in PARTY_CLASSES order] }.
 * A role with no class counts as a hero and no class (at least one class is always read).
 */
export function partyClassXp(groundId, roles) {
  const held = new Set();
  for (const r of roles) if (Object.hasOwn(CLASS_OF_ROLE, r)) held.add(CLASS_OF_ROLE[r]);
  const classes = Object.keys(PARTY_CLASSES).filter((c) => held.has(c));
  const n = roles.length;
  if (n === 1) return { permille: SOLO_XP_PM, classes };
  if (n < 2 || !Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1000, classes };
  const tab = PARTY_CLASS_XP[groundId];
  const sizes = Object.keys(tab).map(Number);
  const cells = tab[Math.min(n, Math.max(...sizes))];
  return { permille: cells[Math.min(Math.max(classes.length, 1), cells.length) - 1], classes };
}

/** The measured percent (PARTY_VS_ALONE) for these living roles on this ground; null with no row or under two heroes. */
export function partyVsAlone(groundId, roles) {
  if (roles.length < 2 || !Object.hasOwn(PARTY_VS_ALONE, groundId)) return null;
  const { classes } = partyClassXp(groundId, roles);
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
  /* "a small exp boost" (Tyler 2026-11-08): more than the even share, never more than a tenth over it */
  if (!Number.isInteger(SOLO_XP_PM) || SOLO_XP_PM <= 1000 || SOLO_XP_PM > 1100) out.push('a hero alone earns ' + SOLO_XP_PM + ', not a small boost (1001-1100)');
  for (const role of Object.keys(HUNT_ROLES)) if (!Object.hasOwn(CLASS_OF_ROLE, role)) out.push('role ' + role + ' has no party class');
  for (const [c, r] of Object.entries(PARTY_CLASSES)) for (const x of r.roles) if (!HUNT_ROLES[x]) out.push('class ' + c + ' names no role ' + x);
  const classCount = Object.keys(PARTY_CLASSES).length;
  for (const [g, sizes] of Object.entries(ONE_ROLE_VS_ALONE)) for (const [n, row] of Object.entries(sizes)) for (const [role, v] of Object.entries(row)) {
    if (!Object.hasOwn(PARTY_VS_ALONE, g)) out.push(g + ': ONE_ROLE_VS_ALONE names a ground with no measured line');
    if (!HUNT_ROLES[role]) out.push(g + ' ' + n + ': ONE_ROLE_VS_ALONE names no role ' + role);
    if (!Number.isInteger(v) || v % 5 !== 0) out.push(g + ' ' + n + ' ' + role + ': ONE_ROLE_VS_ALONE needs whole fives');
  }
  for (const [g, tab] of Object.entries(PARTY_CLASS_XP)) {
    if (grounds && !grounds.includes(g)) out.push(g + ': names no ground');
    for (const n of [2, 3, 4]) {
      const cells = tab[n];
      if (!Array.isArray(cells) || cells.length !== Math.min(n, classCount)) { out.push(g + ': ' + n + ' heroes needs ' + Math.min(n, classCount) + ' cells'); continue; }
      if (cells.some((v) => !Number.isInteger(v) || v <= 0)) out.push(g + ': ' + n + ' heroes: cells are whole permille > 0');
      /* Tyler's line in the table itself: one class is never above the even share (a hero alone earns SOLO_XP_PM, more still), and more classes never pay less. */
      if (cells[0] > 1000) out.push(g + ': ' + n + ' heroes of one class pay above solo (' + cells[0] + ')');
      for (let i = 1; i < cells.length; i++) if (cells[i] < cells[i - 1]) out.push(g + ': ' + n + ' heroes: another class pays less');
    }
    const words = PARTY_VS_ALONE[g];
    if (!words) out.push(g + ': the Party window has no measured line for this ground');
    else for (const n of [2, 3, 4]) if (!Array.isArray(words[n]) || words[n].length !== Math.min(n, classCount) || words[n].some((v) => !Number.isInteger(v) || v % 5 !== 0)) out.push(g + ': ' + n + ' heroes: PARTY_VS_ALONE needs whole fives, one per class count');
  }
  return out;
}
