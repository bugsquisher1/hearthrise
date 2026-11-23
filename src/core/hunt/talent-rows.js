// ============================================================
// src/core/hunt/talent-rows.js — A HERO'S ROADS IN THE FIGHT: the move rows it casts and the ledger rows that hold on a blow
// (systems, lane/roads-sample, 2026-11-23; docs/design/redesign/17-talent-tree.md v3, src/core/talents.js grantsOf).
//
// The settle writes a hero's grants on its unit at every boundary (src/core/combat-sim.js syncUnit, never persisted, like the gear
// values): `ledger` (rows that always hold), `talentWhen` (rows on a condition), `moveMods` (each move's modifier), `tauntHoldMs` and
// `tauntRadius` (the Challenge's hold and reach). This module reads them; a hero with none reads exactly as before, so every hunt with
// the switch off (no build projected) plays bit for bit as it did.
//
//   rowFor(u, id)            THE MOVE AS THIS HERO CASTS IT: the ability row with its modifier applied (cooldown, mana and every version's
//                            mana, what it lands, its status's time, its tiles, a heal past full as a shield, party-only lifted), frozen and
//                            cached on the modifier; ABILITIES[id] itself with none. src/core/hunt/abilities.js reads every bar row through it
//   withTalentRows(inst, u, rows)   the hero's conditional rows that hold now, appended to the party's aura rows on it: auras.js
//                            auraRowsOn calls it, so danger.js powerPm reads both at every blow through its one call (no new seam there)
//
// THE CONDITIONS a step row holds on (src/data/talents.js WHEN), each read from state the world persists, the boundary writes or the
// sub-step's clock (world-step.js inst.atMs), so a viewed and a closed hunt agree at every sub-step:
//   party / solo      another living hero shares the world (abilities.js aloneIn) / none does
//   near_fall         the hero's HP within NEAR_FALL_PM of its stance's fall-back line (danger.js RISKS fallPm: 15 points over it,
//                     17 section 5; the Challenge holder's line x HOLDER.linePm), on the Danger scale only (off it there is no line)
//   shielded          the hero holds a shell
//   taunting          a living monster is held on the hero by its Challenge (holdMs)
//   cast:<move>:<ms>  the hero cast <move> within <ms> (its cooldown clock less the move's own cooldown as this hero casts it)
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES } from '../../data/abilities.js';
import { HUNT_TUNING } from '../../data/hunt-tuning.js';
import { RISKS, HOLDER } from '../../data/danger.js';
import { CHALLENGE } from '../../data/hunt-roles.js';
import { holderTank } from './targeting.js';
import { statusRow } from './status.js';
import { isHero, isAlly, isMonster } from './sides.js';
import { grantsOf } from '../talents.js';

const STEP = HUNT_TUNING.stepMs;
/* near fall-back: within this many permille of HP over the stance's fall-back line (17 section 5: 15 points) */
export const NEAR_FALL_PM = 150;
const NONE = Object.freeze([]);
const CACHE = new WeakMap();

const scaled = (n, f) => Math.max(1, Math.floor((n * f) / 1000000));
const scaleBase = (b, f) => (Array.isArray(b) ? Object.freeze(b.map((x) => scaled(x, f))) : Number.isInteger(b) ? scaled(b, f) : b);
const manaOf = (m, mod) => Math.max(0, Math.round((m * (1000 + (mod.manaPm || 0))) / 1000) + (mod.mana || 0));

/** Ability row `row` with modifier `mod` (src/core/talents.js grantsOf `mods`) applied, frozen. The row itself for no modifier. */
export function moddedRow(row, mod) {
  if (!row || !mod) return row;
  let byRow = CACHE.get(mod);
  if (!byRow) CACHE.set(mod, (byRow = new Map()));
  const hit = byRow.get(row);
  if (hit) return hit;
  const o = { ...row };
  if (mod.cdMs || mod.cdPm) o.cdMs = Math.max(STEP, Math.round(((row.cdMs * (1000 + (mod.cdPm || 0))) / 1000 + (mod.cdMs || 0)) / STEP) * STEP);
  if (mod.mana || mod.manaPm) {
    o.mana = manaOf(row.mana, mod);
    if (Array.isArray(row.versions)) o.versions = Object.freeze(row.versions.map((m) => manaOf(m, mod)));
  }
  /* what it lands: (1000 + outPm) x (1000 - a borrow's penalty), in millionths, on every share and its beginner's floor */
  const f = (1000 + (mod.outPm || 0)) * (1000 - (mod.penaltyPm || 0));
  if (f !== 1000000 && f > 0) {
    for (const k of ['hitPm', 'healPm', 'shieldPm', 'healHpPm']) if (Number.isInteger(row[k])) o[k] = scaled(row[k], f);
    if (row.base !== undefined) o.base = scaleBase(row.base, f);
  }
  if (mod.statusMs && row.status) o.statusMs = Math.max(0, (row.statusMs || 0) + mod.statusMs);
  if (mod.r && row.target === 'ring') o.r = Math.max(1, (Number.isInteger(row.r) ? row.r : 1) + mod.r);
  if (mod.radius && Number.isInteger(row.radius)) o.radius = Math.max(1, row.radius + mod.radius);
  if (mod.maxHits && Number.isInteger(row.maxHits)) o.maxHits = Math.max(1, row.maxHits + mod.maxHits);
  if (mod.overShieldPm) o.overShieldPm = Math.max(0, (row.overShieldPm || 0) + mod.overShieldPm);
  if (mod.solo && row.party === true) delete o.party;
  const out = Object.freeze(o);
  byRow.set(row, out);
  return out;
}

/** THE MOVE `id` AS HERO UNIT `u` CASTS IT (the header). */
export function rowFor(u, id) {
  const row = ABILITIES[id];
  const mods = u && u.moveMods;
  return mods && row && Object.prototype.hasOwnProperty.call(mods, id) ? moddedRow(row, mods[id]) : row;
}

const TABLES = new WeakMap();
/** THE WHOLE ROW TABLE AS HERO UNIT `u` CASTS IT: ABILITIES itself for a hero with no modifier, else a table whose modified ids read their
    moddedRow and every other id the shared row (its prototype), frozen and cached on the modifiers (one object a grant). */
export function rowsFor(u) {
  const mods = u && u.moveMods;
  if (!mods) return ABILITIES;
  let t = TABLES.get(mods);
  if (!t) {
    t = Object.create(ABILITIES);
    /* defined, not assigned: the shared table is frozen, so its rows are read-only properties on the prototype */
    for (const id of Object.keys(mods)) if (Object.prototype.hasOwnProperty.call(ABILITIES, id)) {
      Object.defineProperty(t, id, { value: moddedRow(ABILITIES[id], mods[id]), enumerable: true });
    }
    TABLES.set(mods, Object.freeze(t));
  }
  return t;
}

/** A LONGER STATUS (a modded row's statusMs): the stack of status `id` source `src` just laid on `m` (its time still the row's whole
    duration) runs `ms` longer. Its `left` is persisted with the world, so a viewed and a closed hunt run it out alike. */
export function stretchStatus(m, id, src, ms) {
  const full = statusRow(id).durationMs;
  for (const st of (m && Array.isArray(m.statuses) ? m.statuses : NONE)) if (st.s === id && st.src === src && st.left === full) st.left = full + ms;
}

/* is monster `m` held on hero `u` by its Challenge */
const heldOn = (m, u) => !!m && m.alive === true && m.holdMs > 0 && m.target === u.id;

/** Does condition `when` hold for hero `u` now. */
export function holds(inst, u, when) {
  const units = inst && inst.world && Array.isArray(inst.world.units) ? inst.world.units : NONE;
  switch (when) {
    case 'party': return units.some((x) => x !== u && isAlly(u, x) && x.alive === true);
    case 'solo': return !units.some((x) => x !== u && isAlly(u, x) && x.alive === true);
    case 'near_fall': {
      const st = inst && inst.world && RISKS[inst.world.risk];
      if (!st || !(u.maxHp > 0)) return false;
      /* the hero holding the Challenge reads its stance's line x HOLDER.linePm (danger.js marginOf), and near it the same 15 points over */
      const line = holderTank(inst) === u ? Math.floor((st.fallPm * HOLDER.linePm) / 1000) : st.fallPm;
      return u.hp * 1000 < (line + NEAR_FALL_PM) * u.maxHp;
    }
    case 'shielded': return (u.shield | 0) > 0;
    case 'taunting': return units.some((m) => isMonster(m) && heldOn(m, u));
    default: break;
  }
  if (when.startsWith('cast:')) {
    const [, move, ms] = when.split(':');
    const until = u.cds && Number.isInteger(u.cds[move]) ? u.cds[move] : null;
    const row = rowFor(u, move);
    /* the sub-step's clock (world-step.js writes it on the instance); the cast was at the cooldown's end less the move's own cooldown */
    const at = inst && Number.isInteger(inst.atMs) ? inst.atMs : null;
    if (until === null || !row || at === null) return false;
    const castAt = until - row.cdMs;
    return at >= castAt && at - castAt <= Number(ms);
  }
  return false;
}

const TALENT_KEYS = ['ledger', 'talentWhen', 'moveMods', 'tauntHoldMs', 'tauntRadius'];

/** WRITE HERO `m`'s GRANTS ON UNIT `u` at Level `level` (combat-sim.js syncUnit, every boundary): the header's fields from
    src/core/talents.js grantsOf, or none of them for a hero with no build. */
export function syncTalents(u, hero, level) {
  if (!hero || !hero.talents) { for (const k of TALENT_KEYS) if (u[k] !== undefined) delete u[k]; return; }
  const g = grantsOf(hero.talents, hero.discipline, level);
  u.ledger = g.ledger;
  if (g.when.length) u.talentWhen = g.when; else if (u.talentWhen) delete u.talentWhen;
  if (Object.keys(g.mods).length) u.moveMods = g.mods; else if (u.moveMods) delete u.moveMods;
  const ch = g.mods.challenge;
  if (ch && ch.holdMs) u.tauntHoldMs = Math.max(STEP, CHALLENGE.holdMs + ch.holdMs); else if (u.tauntHoldMs !== undefined) delete u.tauntHoldMs;
  if (ch && ch.tauntRadius) u.tauntRadius = Math.max(1, CHALLENGE.radius + ch.tauntRadius); else if (u.tauntRadius !== undefined) delete u.tauntRadius;
}

/** `rows` (the party's auras on hero `u`, auras.js auraRowsOn) with `u`'s own conditional Roads rows that hold now appended: `rows` itself
    when none holds (or for a monster or a dead hero). */
export function withTalentRows(inst, u, rows) {
  const when = isHero(u) && u.alive === true && Array.isArray(u.talentWhen) ? u.talentWhen : NONE;
  let out = null;
  for (const r of when) if (holds(inst, u, r.when)) (out || (out = rows.slice())).push(r);
  return out || rows;
}
