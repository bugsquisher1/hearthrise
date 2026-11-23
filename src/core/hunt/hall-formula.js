// ============================================================
// src/core/hunt/hall-formula.js — A HALL'S BOSSES ON THE FORMULA (lane/hall-formula, 2026-11-23; docs/design/redesign/02-architecture.md
// package 7 "halls ... built as bar checks", 04-math-strategy.md section 6 "a boss with a ramp tests damage and sustain together").
//
// A keyed hall (src/data/boss-halls.js) whose row names `formula: true` (the hall's ONE data switch, its pack's `hall.formula`) fights its
// bosses on the stat formula instead of their hand-typed lines: every row of the room that is a boss of a kind (src/data/bosses.js
// bossKindOf: the hall's boss is kind `hall`, a named add kind `add`) stands at its kind's stat role (bossRole over the kind's base role)
// read by the one stat formula (src/data/balance-sheet.js formulaStats) at the row's own Level, the hall's band floor and the room's
// groupFit. Health, blow, to-hit, evasion and defense are the formula's; the name, art, class, elements, spells, phases (adds, guard,
// enrage, hasten), speed, drops, coin and XP stay the row's (content), so the server catalogues read exactly what they read with the
// switch off. The ramp is the kind's (boss-phases.js swingRow, rampOf), on or off. A plain add (no kind) keeps its row.
//
// EVERY NUMBER IS A LEVER ROW: the kind's hpPpm, blowPpm, hitPm, floorCapPm, rampPm and rampCapPm (BOSS_KINDS.hall, BOSS_KINDS.add).
// A hall with the switch off, and every other hunt, reads exactly what it always read.
//
//   hallFormulaOn(groundId)        is ground `groundId` a hall room whose hall's switch is on?
//   hallRow(row, groundId)         the derived row for one monster row of that room (null: not a boss of a kind, or no hall room)
//   hallTable(groundId, base)      the instance's one door (combat-sim.js huntPlayOf): `base` with the room's bosses on their derived rows,
//                                  or null when the switch is off. Built once a (ground, base)
//
// PURE ESM, dual-runtime: no DOM, no clock, no Math.random.
// ============================================================

import { BOSS_HALLS } from '../../data/boss-halls.js';
import { HALL_GROUNDS } from '../../data/hunt-grounds.js';
import { HUNT_INDEX } from '../../data/hunts.js';
import { MONSTER_ROLES, formulaStats } from '../../data/balance-sheet.js';
import { BOSS_KINDS, bossRole, bossKindOf } from '../../data/bosses.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/* the hall room `groundId` is, with its hall row and band: { ground, hall, floor } or null */
function roomOf(groundId) {
  const ground = own(HALL_GROUNDS, groundId) ? HALL_GROUNDS[groundId] : null;
  const hall = ground && own(BOSS_HALLS, ground.hall) ? BOSS_HALLS[ground.hall] : null;
  const band = ground && HUNT_INDEX[ground.hunt] ? HUNT_INDEX[ground.hunt].band : null;
  return hall && Array.isArray(band) ? { ground, hall, floor: band[0] } : null;
}

/** Is ground `groundId` a hall room whose hall's switch (`formula: true`) is on? */
export function hallFormulaOn(groundId) {
  const r = roomOf(groundId);
  return !!r && r.hall.formula === true;
}

/* the stat roles a hall's bosses stand on: the sheet's, and each boss kind over its base role */
const ROLES = Object.freeze({ ...MONSTER_ROLES,
  ...Object.fromEntries(Object.keys(BOSS_KINDS).map((k) => ['kind:' + k, bossRole(MONSTER_ROLES[BOSS_KINDS[k].role], k)])) });

/**
 * THE DERIVED ROW for monster row `row` standing in hall room `groundId`: its kind's stat role at its own Level, the hall's band floor and the
 * room's groupFit, with the row's content kept (header). Null when the row is no boss of a kind or the ground is no hall room. Reads no switch:
 * hallTable does (a harness reads what the switch would play). Pure.
 */
export function hallRow(row, groundId) {
  const r = roomOf(groundId);
  const kind = bossKindOf(row);
  if (!r || !kind) return null;
  const s = formulaStats({ level: row.level, role: 'kind:' + kind, tier: row.tier, floor: r.floor, fit: r.ground.groupFit || 'party', ground: r.ground.hunt },
    { roles: ROLES });
  return Object.freeze({ ...row, hp: s.hp, atk: s.atk, aim: s.aim, evasion: s.evasion, def: s.def, formula: 'hall' });
}

/* (ground, base) -> table: the unscaled catalogue's once a ground; any other base is built fresh */
const TABLES = new Map();
/** The instance's one door on a hall room with its switch on: `base` with every boss of a kind in the room on its derived row. Null when the
    switch is off, so every other hunt reads exactly what it always read. */
export function hallTable(groundId, base) {
  if (!base || !hallFormulaOn(groundId)) return null;
  const hit = TABLES.get(groundId);
  if (hit && hit.base === base) return hit.table;
  const g = HALL_GROUNDS[groundId];
  const table = Object.assign({}, base);
  for (const p of g.pockets) for (const s of [...p.spawns, ...(p.adds || [])]) { const d = hallRow(base[s.monster], groundId); if (d) table[s.monster] = d; }
  if (TABLES.size < 64) TABLES.set(groundId, { base, table });
  return table;
}
