// ════════════════════════════════════════════════════════════════════════
// src/data/party-class-xp.js — PARTY LEVEL XP: BETTER ONLY WITH DIFFERENT CLASSES
//
// Tyler 2026-10-31: "Party exp should only be better if there are different classes
// in the party." Balance ruling 10-25 §5 still sets the mixed targets (duo 105-115,
// trio 110-120, four 115-125 against a comparable solo); a same-class party never
// beats solo per head (tests/party-class-xp-line.mjs plays that on the real engine).
//
// Designer's rule (10-31, table 11-01; it reads with each ground's `partyPull`, hunt-grounds.js):
//   - LEVEL XP only (src/core/hunt/xp-share.js): no gold or loot effect, skill XP untouched.
//   - FOUR CLASSES: Melee (a shield or not), Ranger, Mage, Healer.
//   - Read from the LIVING heroes at EACH kill, never latched: a death or a leave
//     changes the next kill. A hero alone is the identity (1000).
//   - One row per ground. The cell is the factor applied on top of the even share.
//
// A ROW: { heroes alive: [permille at 1 class, at 2 classes, ...] }, as many cells as
// that many heroes can hold classes. The numbers are the designer's to retune, here.
//
// A GROUND WITH NO ROW PAYS 1000 (the even share): no bonus and no cut until the designer
// writes its row. It fails safe for pay, and the standing guard plays every ground
// (tests/party-class-xp-line.mjs), so a new ground where a same-class party beats solo
// turns that guard red until its row is written.
//
// A PARTY LARGER THAN A ROW'S LARGEST SIZE reads that largest size (the party cap is
// a config value), so a same-class cut can never lapse by adding a hero.
//
// PURE ESM. Data, and the one reader of it (the engine and the party window both).
// ════════════════════════════════════════════════════════════════════════

import { HUNT_ROLES } from './hunt-roles.js?v=0.2.79';

/* THE CLASSES a party can hold: class id → the word the player reads and the hunt roles it covers.
   Tank is a function of a Melee, not a class of its own (Tyler 2026-10-16). */
export const PARTY_CLASSES = Object.freeze({
  melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),
  ranger: Object.freeze({ label: 'Ranger', roles: Object.freeze(['ranger']) }),
  mage: Object.freeze({ label: 'Mage', roles: Object.freeze(['mage']) }),
  healer: Object.freeze({ label: 'Healer', roles: Object.freeze(['healer']) }),
});

const row = (two, three, four) => Object.freeze({ 2: Object.freeze(two), 3: Object.freeze(three), 4: Object.freeze(four) });

/* ground id → its row (designer's final table, 2026-11-01). */
export const PARTY_CLASS_XP = Object.freeze({
  mill_cellar: row([1000, 1070], [1000, 1120, 1180], [1000, 1250, 1270, 1400]),
  meadowbrook_thicket: row([1000, 1280], [1000, 1400, 1480], [1000, 1500, 1510, 1520]),
  wickstead: row([880, 1070], [970, 1160, 1220], [970, 1200, 1240, 1270]),
  mosslight_glade: row([960, 1180], [1000, 1300, 1400], [1000, 1200, 1290, 1320]),
  millrace_sewer: row([800, 1000], [800, 1050, 1100], [800, 1050, 1100, 1180]),
  coppercap_warrens: row([1000, 1180], [1000, 1200, 1280], [1000, 1200, 1260, 1360]),
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
  if (n < 2 || !Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1000, classes };
  const tab = PARTY_CLASS_XP[groundId];
  const sizes = Object.keys(tab).map(Number);
  const cells = tab[Math.min(n, Math.max(...sizes))];
  return { permille: cells[Math.min(Math.max(classes.length, 1), cells.length) - 1], classes };
}

/** Every problem with the tables, as strings. Empty = valid. `grounds`: the ground ids a row may name. */
export function validate(grounds) {
  const out = [];
  for (const role of Object.keys(HUNT_ROLES)) if (!Object.hasOwn(CLASS_OF_ROLE, role)) out.push('role ' + role + ' has no party class');
  for (const [c, r] of Object.entries(PARTY_CLASSES)) for (const x of r.roles) if (!HUNT_ROLES[x]) out.push('class ' + c + ' names no role ' + x);
  const classCount = Object.keys(PARTY_CLASSES).length;
  for (const [g, tab] of Object.entries(PARTY_CLASS_XP)) {
    if (grounds && !grounds.includes(g)) out.push(g + ': names no ground');
    for (const n of [2, 3, 4]) {
      const cells = tab[n];
      if (!Array.isArray(cells) || cells.length !== Math.min(n, classCount)) { out.push(g + ': ' + n + ' heroes needs ' + Math.min(n, classCount) + ' cells'); continue; }
      if (cells.some((v) => !Number.isInteger(v) || v <= 0)) out.push(g + ': ' + n + ' heroes: cells are whole permille > 0');
      /* Tyler's line in the table itself: one class is never above the solo identity, and more classes never pay less. */
      if (cells[0] > 1000) out.push(g + ': ' + n + ' heroes of one class pay above solo (' + cells[0] + ')');
      for (let i = 1; i < cells.length; i++) if (cells[i] < cells[i - 1]) out.push(g + ': ' + n + ' heroes: another class pays less');
    }
  }
  return out;
}
