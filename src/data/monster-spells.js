// ════════════════════════════════════════════════════════════════════════
// src/data/monster-spells.js — THE MONSTERS' AREA SPELLS (Tyler 2026-11-08: "start giving some monsters some aoe
// spells"; design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §3)
//
// One row per spell, keyed by its id. A MONSTERS row names its ONE spell (`spell: 'venom_spray'`); a monster with
// none fights exactly as it always has (src/core/hunt/monster-spells.js reads nothing, draws nothing). The rows are
// the designer's (lane 2): this file holds the shape of a row and its bounds, the engine plays whatever it lists.
//
// THE ROW: { id, n, shape, r? | len?, range, windupMs, cdMs, dmgPm, element }
//   n          the spell's name, as the combat log and the bestiary say it
//   shape      a src/core/hunt/shapes.js kind: 'ring' round the caster (r), 'blast' on its target's tile (r), 'cone'
//              toward its target (len), 'line' through its target (len), or 'group': EVERY hero of the hunt, wherever
//              it stands, no step-off (Tyler 2026-11-08: "for the full group to take some damage"; gear and imbuement
//              resistances are its answer: damage.js, a hero's resistPm)
//   range      the most tiles (Chebyshev) from the caster to its target a cast may start at, with line of sight past 1
//   windupMs   the warning: the mark stands this long before it lands, whole sub-steps; a Chill on the caster as the
//              cast starts stretches it (statuses.js slowPm). At least minWindupMs(row): a hero standing in the middle
//              of the mark can walk off it in time (the design's fair-warning rule)
//   cdMs       from one cast's start to the next one's earliest start, longer than the windup
//   dmgPm      the hit's top, permille of the caster's own largest blow at the hunt's tier (src/core/combat.js
//              monsterMaxHit of its tier row), rolled from half that to that, with no to-hit roll; the hero's armour
//              chain then takes it as any blow (dodge, absorb, resistances, ward). A tier moves it with the blow
//   element    an elements.js id, or null (physical)
// Every number here is the designer's; the BOUNDS below are not balance values, they keep a bad row from striking a
// whole ground or landing with no warning.
//
// MUTABLE LIKE THE ROSTER: the balance sim's what-ifs (tools/balance-sim/worker.mjs) tune a row in place for one job
// and put it back, as they do MONSTERS rows. Nothing at run time writes it.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.108';
import { isElement } from './elements.js?v=0.2.108';
import { SHAPE_KINDS, shapeProblem } from '../core/hunt/shapes.js?v=0.2.108';

/* The shapes a monster may cast (a 'square' is an aimed footprint, a hero's). */
export const SPELL_SHAPES = Object.freeze(['ring', 'blast', 'cone', 'line', 'group']);

/* THE FAIR WARNING (the design's rule: a free hero can always step off): the least windup is baseMs for a radius-1 mark
   (from its middle a hero walks 2 tiles off, 0.63 s at 3.2 tiles a second) and perRadiusMs more for each tile of radius
   past 1. A cone, a line and a group strike take baseMs (minWindupMs). */
export const FAIR_WARNING = Object.freeze({ baseMs: 1200, perRadiusMs: 400 });
/* THE HIT'S ROLL (spellHit): from lowPm permille of the top to the top. */
export const SPELL_ROLL = Object.freeze({ lowPm: 500 });

export const SPELL_BOUNDS = Object.freeze({
  range: Object.freeze([1, 4]),
  windupMs: Object.freeze([FAIR_WARNING.baseMs, 4000]),
  cdMs: Object.freeze([2000, 120000]),
  dmgPm: Object.freeze([100, 4000]),
});

/** THE FAIR WARNING (a wiki formula): the least windup a spell row may have, with r its radius (1 for a cone, a line or
    a group strike):  minWindup = FAIR_WARNING.baseMs + FAIR_WARNING.perRadiusMs x (r - 1). */
export function minWindupMs(row) {
  const r = row && (row.shape === 'ring' || row.shape === 'blast') && Number.isInteger(row.r) ? row.r : 1;
  return FAIR_WARNING.baseMs + FAIR_WARNING.perRadiusMs * (r - 1);
}

/** WHAT A SPELL HITS FOR (a wiki formula): with M the caster's own largest blow at the hunt's tier (src/core/combat.js
    monsterMaxHit of its tier row, an enraged boss's raised one),
      top = max(1, floor(M x dmgPm / 1000)),  low = max(1, ceil(top x SPELL_ROLL.lowPm / 1000)),
    and each hero struck rolls a whole number from low to top, with no to-hit roll; the hero's armour then takes it as
    any blow. Answers [low, top]. */
export function spellHit(maxHit, row) {
  const top = Math.max(1, Math.floor((Math.max(1, Math.floor(Number(maxHit) || 1)) * row.dmgPm) / 1000));
  return [Math.max(1, Math.ceil((top * SPELL_ROLL.lowPm) / 1000)), top];
}

export const MONSTER_SPELLS = {};

/** The spell row monster row `m` names, or null (none, or a name no row holds). */
export function spellOf(m) {
  const id = m && m.spell;
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MONSTER_SPELLS, id) ? MONSTER_SPELLS[id] : null;
}

/** The shape spec a row casts ({ shape, r } or { shape, len }). */
export const specOf = (row) => {
  const p = SHAPE_KINDS[row.shape] && SHAPE_KINDS[row.shape].param;
  return p ? { shape: row.shape, [p]: row[p] } : { shape: row.shape };
};

const ID = /^[a-z0-9_]{1,32}$/;

/** Every problem with one row, as strings. Empty = valid. */
export function validateSpell(row) {
  if (!row || typeof row !== 'object') return ['spell row is not an object'];
  const out = [];
  const at = 'spell ' + row.id + ': ';
  if (typeof row.id !== 'string' || !ID.test(row.id)) out.push('spell id ' + row.id + ' is not [a-z0-9_]');
  if (typeof row.n !== 'string' || !row.n) out.push(at + 'needs a name (n)');
  if (!SPELL_SHAPES.includes(row.shape)) out.push(at + 'shape must be one of ' + SPELL_SHAPES.join('/'));
  else {
    const bad = shapeProblem(specOf(row));
    if (bad) out.push(at + bad);
    /* The parameter its shape does not read is a typo, never ignored (`n` is the row's name: a monster casts no square). */
    for (const p of ['r', 'len']) if (p !== SHAPE_KINDS[row.shape].param && row[p] !== undefined) out.push(at + row.shape + ' reads no ' + p);
  }
  for (const [k, [lo, hi]] of Object.entries(SPELL_BOUNDS)) {
    if (!Number.isInteger(row[k]) || row[k] < lo || row[k] > hi) out.push(at + k + ' must be an integer ' + lo + '..' + hi + ', got ' + row[k]);
  }
  for (const k of ['windupMs', 'cdMs']) if (Number.isInteger(row[k]) && row[k] % HUNT_TUNING.stepMs) out.push(at + k + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  if (Number.isInteger(row.windupMs) && row.windupMs < minWindupMs(row)) out.push(at + 'windupMs ' + row.windupMs + ' is under the fair warning ' + minWindupMs(row) + ' (minWindupMs)');
  if (Number.isInteger(row.cdMs) && Number.isInteger(row.windupMs) && row.cdMs <= row.windupMs) out.push(at + 'cdMs must outlast the windup');
  if (row.element !== null && !isElement(row.element)) out.push(at + 'element must be an elements.js id or null, got ' + row.element);
  return out;
}

/** Every problem with the table against the roster `monsters` (src/data/monsters.js MONSTERS). Empty = valid. */
export function validate(monsters) {
  const out = [];
  for (const [key, row] of Object.entries(MONSTER_SPELLS)) {
    if (!row || row.id !== key) out.push('spell key ' + key + ' must equal its row id');
    out.push(...validateSpell(row));
  }
  const cast = new Set();
  for (const [id, m] of Object.entries(monsters || {})) {
    if (m.spell === undefined) continue;
    if (!spellOf(m)) out.push('monster ' + id + ' names spell ' + m.spell + ', which no row holds');
    else cast.add(m.spell);
  }
  /* A row no monster casts is content nothing plays (every row has a use). */
  for (const key of Object.keys(MONSTER_SPELLS)) if (!cast.has(key)) out.push('spell ' + key + ' is cast by no monster');
  return out;
}
