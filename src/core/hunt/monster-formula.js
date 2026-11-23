// ============================================================
// src/core/hunt/monster-formula.js — A MONSTER IS A STEP AND A ROLE (lane/monster-formula; 04-math-strategy.md section 6, 02 package 3).
//
// "A monster is a step and a role. A role row holds seconds to kill, pressure, how the pressure arrives (steady blows and wind-ups a
// bar can answer), and reach. No monster has its own math." On a ground whose DANGER_GROUNDS row names `monsters: 'formula'` (the
// ground's one data switch), every monster that stands there plays the row this file DERIVES from its role (src/data/monster-roles.js),
// its encounter type (a pull's or a boss's) and the reference company the ground is anchored on (MONSTER_FORMULA.REF at the ground's
// refLevel and refStep), in place of the hand-typed health, blow, aim, evasion, defense, Level and spells. Its name, art, class, weapon
// answers, drops, coin and XP stay its row's (content). A tier ground, a ground with the switch off, and a hunt off the scale read
// exactly what they always read.
//
// THE ROW IS WRITTEN AT STEP 0 OF THE GROUND (the engine's dial, src/core/hunt/danger.js dangerDial, grows every row by the step's ratio
// over the pull, as it grows a hand row), so that AT THE GROUND'S REFERENCE STEP, a gap of 0, for the reference company of four:
//   health     = secondsToKill x killMult x the company's damage a fighting second          (one monster takes secondsToKill)
//   steady     = (1 - windupShare) x pressure x the reference hero's health, a second      (its blows, after the target's armor)
//   a wind-up  = windupSize x the reference hero's health (mean hit), every windupSize / (windupShare x pressure) seconds
//   a mend     = mend.seconds of the company's damage put back on a packmate, every mend.everyS seconds
// and one step deeper is the step's ratio on health and blow, as on every ground (a step is a step of the ground's own rows until the
// bands carry absolute steps: danger.js THE GROUNDS). A boss's ramp is its kind's (src/data/bosses.js rampOf, read by
// boss-phases.js swingRow on its own fight clock): one ramp for every boss, the formula's or the stat sheet's.
//
//   formulaOn(groundId)                  is the ground's switch on (and does the ground anchor a reference)?
//   formulaRow(row, groundId)            the derived row for one monster row on that ground (null: no role, or the switch off)
//   formulaTable(groundId, base)         the instance's one door (combat-sim.js huntPlayOf): `base` with every monster of the ground on
//                                        its derived row, or null when the switch is off. Built once a (ground, base)
//   (the reference company: src/core/reference-company.js refCompany, the one interface to the heroes; re-exported here)
//   monsterArmorPm(inst, m)              a monster's armor now, permille of a hero blow (the door an armor answer moves)
//
// PURE ESM, dual-runtime: no DOM, no clock, no Math.random. Every number is a multiplication, a division or a rounding, so a browser's
// live view and the edge's settle derive the same last bit.
// ============================================================

import { MONSTER_ROLES, MONSTER_FORMULA } from '../../data/monster-roles.js';
import { DANGER, DANGER_GROUNDS } from '../../data/danger.js';
import { refCompany } from '../reference-company.js';
import { HUNT_GROUNDS, monstersOn } from '../../data/hunt-grounds.js';
import { aimFor, evasionFor } from '../../data/to-hit.js';
import { HUNT_TUNING } from '../../data/hunt-tuning.js';
import { spellsOf, spellRow, mends, SPELL_ROLL, SPELL_BOUNDS } from '../../data/monster-spells.js';
import { COMBAT_BALANCE } from '../combat.js';
import { powStep, formulaBasePull, REF_HEROES } from './danger.js';

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const F = MONSTER_FORMULA;
/* a spell's hit rolls from SPELL_ROLL.lowPm of its top to its top (monster-spells.js spellHit): its mean, as a share of the top */
const SPELL_MEAN = (1 + SPELL_ROLL.lowPm / 1000) / 2;
/* whole sub-steps, inside the spell rows' bounds (monster-spells.js SPELL_BOUNDS) */
const [CD_MIN, CD_MAX] = SPELL_BOUNDS.cdMs, [HIT_MIN, HIT_MAX] = SPELL_BOUNDS.hitPm;
const stepMs = HUNT_TUNING.stepMs;
const subSteps = (ms) => Math.max(stepMs, Math.round(ms / stepMs) * stepMs);

/** The ground's row when its switch is on and it anchors a reference (refStep and refLevel), else null. */
export function formulaGround(groundId) {
  const g = own(DANGER_GROUNDS, groundId) ? DANGER_GROUNDS[groundId] : null;
  return g && g.monsters === 'formula' && Number.isInteger(g.refStep) && Number.isInteger(g.refLevel) ? g : null;
}
export const formulaOn = (groundId) => formulaGround(groundId) !== null;


/* THE ONE MONSTER'S SHARE OF THE STEP AT THE REFERENCE, for the reference company: the dial's ratio x the as-built mean over the pull
   (danger.js dangerDial), so the row written here x it is the monster at a gap of 0. */
function refMultiple(g) {
  const n0 = formulaBasePull(g, REF_HEROES);
  const pull = Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * powStep(1 + DANGER.pullStep, g.refStep))));
  return (powStep(1 + DANGER.powerStep, g.refStep) * n0) / pull;
}

/* a monster's biggest normal blow from its atk (combat.js monsterMaxHit's scale), and back */
const scaleOf = (row) => COMBAT_BALANCE.monsterDamageScaleByTier[row && row.tier] || COMBAT_BALANCE.monsterAttackDamageScale;
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * THE DERIVED STATS of role `roleId` at a gap of 0 on ground row `g`, for an encounter `kind` ('pull' or 'boss'): { hp, maxHit (the
 * row's biggest blow, before the role's maxHitPm), top (the blow that lands after it), spells: { id: spell row }, armorPm } at the
 * REFERENCE STEP (not yet over the dial), plus `steadyShare` (the share of the dialed steady pressure blowCap lets through). Pure.
 * @param {string} roleId
 * @param {{ refLevel: number }} g
 * @param {string} [kind]
 * @param {{ windup?: any, mend?: any }} [own]
 */
export function roleStats(roleId, g, kind = 'pull', own = {}) {
  const R = MONSTER_ROLES[roleId];
  if (!R) throw new Error('monster-formula: unknown role ' + roleId);
  const enc = F.encounters[kind] || F.encounters.pull;
  /* a ground on the Danger scale (it names its refStep) meets its monsters in the amount pipeline; a Tower room in the old chain */
  const ref = refCompany(g.refLevel, Number.isInteger(g.refStep) ? 'steps' : null);
  const take = ref.takePm / 1000, land = ref.hit;
  const swingS = COMBAT_BALANCE.tickMs / 1000;
  /* ITS ARMOR (the role's `armor`): a share of every hero blow, so its health is written net of it and secondsToKill holds at any armor;
     an answer that strips armor (Armor Break) is then a real gain in kill time, never a wash */
  const armorPm = Math.max(0, Math.min(1000, Math.round(1000 * (R.armor || 0))));
  const hp = R.secondsToKill * enc.killMult * ref.dpsFight * (1 - armorPm / 1000);
  /* the windup's share and size, after the two global death-risk dials */
  const w = R.windup && R.windupShare > 0 && R.windupSize > 0 ? Math.min(1, R.windupShare) : 0;
  /* steady: (1 - w) x pressure x the reference health a second = land x take x (maxHit + 1) / 2 / swing; the role's maxHitPm is a cap
     on a hand row's blow, so the formula writes the row's blow over it and the steady pressure is what the dial says. No top blow past
     blowCap of the target's health (after its armor). */
  const steadyDps = (1 - w) * R.pressure * ref.hp;
  const rolePm = Number.isInteger(R.maxHitPm) ? R.maxHitPm / 1000 : 1;
  const capTop = (F.blowCap * ref.hp) / take;
  const wantTop = Math.max(1, (2 * swingS * steadyDps) / (land * take) - 1);
  const top = Math.min(wantTop, capTop);
  const maxHit = top / rolePm;
  /* THE SHAPES ARE CONTENT, THE NUMBERS THE FORMULA'S: a row's own spell (`own.windup`, `own.mend`: [id, its monster-spells.js row]) keeps
     its id, name, shape and warning; a row with none casts its role's (id mf_<role>). Only the hit and the cooldown are derived. */
  const spells = {};
  const derive = (pair, fallbackId, fallbackRow, top, everyS) => {
    const [id, shape] = pair || [fallbackId, fallbackRow];
    spells[id] = Object.freeze({ ...shape, hitPm: Math.max(HIT_MIN, Math.min(HIT_MAX, Math.round((1000 * top) / maxHit))),
      cdMs: Math.max(CD_MIN, shape.windupMs + stepMs, Math.min(CD_MAX, subSteps(everyS * 1000))) });
  };
  if (w > 0) {
    const size = R.windupSize * F.windupScale.size;
    derive(own.windup, 'mf_' + roleId, R.windup, (size * ref.hp) / (SPELL_MEAN * take), (R.windupSize / (w * R.pressure)) * F.windupScale.every);
  }
  if (R.mend && R.mend.seconds > 0) derive(own.mend, 'mf_' + roleId + '_mend', R.mend.spell, (R.mend.seconds * ref.dpsFight) / SPELL_MEAN, R.mend.everyS);
  return { hp, maxHit, top, steadyShare: wantTop > 0 ? Math.min(1, (top + 1) / (wantTop + 1)) : 1, spells: Object.freeze(spells),
    armorPm };
}

/**
 * THE DERIVED ROW for monster row `row` on ground `groundId` (null when the switch is off or the row names no role): the row at step 0 of
 * the ground, so the dial's growth puts it at roleStats at the reference step. Content stays the row's.
 */
export function formulaRow(row, groundId) {
  return derivedRow(row, groundId);
}

/**
 * A MONSTER OF ROLE `roleId` AT A GAP OF 0 FOR THE REFERENCE COMPANY OF LEVEL `level`, with no ground and no dial (a run ground's room,
 * src/core/hunt/tower.js rowAt, which grows it by its own depth): { hp, atk (for art tier `tier`), aim, evasion, def, level, armorPm,
 * spells (the role's own shapes), kind }. `kind` 'pull' or 'boss'. Pure.
 */
export function formulaAt(roleId, level, tier, kind = 'pull') {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const s = roleStats(roleId, { refLevel: L }, kind);
  return { hp: s.hp, atk: s.maxHit / scaleOf({ tier }), aim: Math.max(1, Math.round(aimFor(F.REF.hit, L))),
    evasion: Math.max(1, Math.round(evasionFor(F.REF.heroHit, L, 1))), def: Math.max(0, Math.round(F.REF.defPerLevel * L)), level: L,
    armorPm: s.armorPm, spells: s.spells };
}

function derivedRow(row, groundId) {
  const g = formulaGround(groundId);
  if (!g || !row || typeof row.role !== 'string' || !own(MONSTER_ROLES, row.role)) return null;
  const kind = row.boss === true ? 'boss' : 'pull';
  /* the row's own spell shapes, its first strike and its first mend (monster-spells.js spellsOf: the table's rows it lists) */
  const mine = spellsOf(row).map((id) => [id, spellRow(id)]);
  const s = roleStats(row.role, g, kind, { windup: mine.find(([, r]) => !mends(r)) || null, mend: mine.find(([, r]) => mends(r)) || null });
  const m = refMultiple(g);
  const L = g.refLevel;
  const out = { ...row, hp: Math.max(1, Math.round(s.hp / m)), atk: r3(s.maxHit / m / scaleOf(row)), level: L,
    aim: Math.max(1, Math.round(aimFor(F.REF.hit, L))), evasion: Math.max(1, Math.round(evasionFor(F.REF.heroHit, L, 1))),
    def: Math.max(0, Math.round(F.REF.defPerLevel * L)), armorPm: s.armorPm, formula: 'role' };
  const ids = Object.keys(s.spells);
  if (ids.length) { out.spells = ids; out.spellRows = s.spells; } else delete out.spells;
  return Object.freeze(out);
}

/**
 * A MONSTER'S ARMOR NOW, permille of a hero blow it takes off (damage.js hurt): its derived row's `armorPm` (a formula ground's; 0 for a
 * hand row, whose flat `def` is all it has). THE ONE DOOR an armor answer moves: a status that strips armor (Armor Break, the statuses
 * lane) scales what this answers, never a second damage-taken key.
 */
export function monsterArmorPm(inst, m) {
  const row = inst && m && (inst.monsters || {})[m.kind];
  return row && Number.isInteger(row.armorPm) && row.armorPm > 0 ? row.armorPm : 0;
}

/* (ground, base) -> table: the unscaled catalogue's once a ground, as huntPlayOf's own GROUND_DROPS; any other base is built fresh */
const TABLES = new Map();
/** The instance's one door on a formula ground: `base` (the catalogue, or a ground's drops table over it) with every monster that stands
    on the ground on its derived row. Null when the switch is off, so every other hunt reads exactly what it always read. */
export function formulaTable(groundId, base) {
  if (!formulaOn(groundId) || !base) return null;
  const hit = TABLES.get(groundId);
  if (hit && hit.base === base) return hit.table;
  const ground = own(HUNT_GROUNDS, groundId) ? HUNT_GROUNDS[groundId] : null;
  if (!ground) return null;
  const table = Object.assign({}, base);
  for (const id of monstersOn(ground)) { const r = formulaRow(base[id], groundId); if (r) table[id] = r; }
  if (TABLES.size < 64) TABLES.set(groundId, { base, table });
  return table;
}


export { refCompany };
