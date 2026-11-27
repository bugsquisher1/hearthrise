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
//   lentModsOf(mods, borrowed, pens)   THE BORROWED MOVES' MODIFIERS: `mods` with every move of the hero's borrow list marked `lent`, the
//                            one list the bar and the blows read (hunt-spawn.js heroSetup `borrowed`: the Roads' grants and the Lab's
//                            seam alike), so a lent row plays 17 section 3's rules (lend, below) on either path
//
// A BORROWED MOVE (19 L6, 17 section 3 "Rules for a borrowed move"; src/data/talents.js BORROW_RULES), as its borrower casts it:
//   blow      its native weapon's reference blow at the hero's Level (src/core/borrow-blow.js, abilities.js blowOf)
//   heals     THE HEAL RULE: a borrowed heal shares Mend's clock, one cooldown for both and casting either starts it. Played by the one
//             mechanism a cast that stands in for another already has (`replaces`, abilities.js clockOf): the lent heal fires only while
//             Mend's cooldown is up and its cast starts it, so a borrower casts no more heals than Mend's clock allows
//   training  a borrowed spell pays Magic at Mend's rate (its magicXpMult), never its native row's (the cast event carries the row's)
//   reach     an ally heal or ward reaches as far as its native weapon's role (the healer's 7 tiles), in the target rule (cast-targets.js
//             reachOf) and the "lowest ally" its conditions read (conditions.js allyOf), never the holder's 1 tile
//   gate      its opening Level (src/core/talents.js borrowBand opensAt, the Roads' price) is its gate: its native skill's `unlock` is lifted
//   taunts    a borrowed Challenge taunts from any seat (targeting.js challengeable), its hold x its price (`holdPm`); a seat that is no
//             tank never holds the lap (holderTank), so it takes only what is on a hero that is no tank, the overflow
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
// THE ENGINE PIECES' READERS (lane/talent-effects; the Roads, Signatures and Traits share them, src/data/talents.js effect kinds):
//   row.fx                   a modded row's piece fields (MOD_FX: heal over time, a second target, per-target output, mana returns, a
//                            status's strength, a patch), read by abilities.js and heal-rules.js; absent on a row with none
//   healInPm(inst, u)        THE HEALING `u` RECEIVES now, permille over its heals: its own `heal_in` rows whose condition holds, and the
//                            `warded` rows of the hero whose shell it holds, added, held to TALENT_RULES.healInCapPm (heal-cut.js healIn)
//   outPmFor(inst, u, row, t) what cast `row` of hero `u` lands on target `t`, permille: 1000 plus every per-target field that holds
//   nearFall(inst, u, hp)    is hero `u` near fall-back at `hp` (the `near_fall` condition, the reactions' crossing)
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES, heals } from '../../data/abilities.js';
import { HUNT_TUNING } from '../../data/hunt-tuning.js';
import { RISKS, HOLDER } from '../../data/danger.js';
import { CHALLENGE, HUNT_ROLES, ROLE_KEYS } from '../../data/hunt-roles.js';
import { TALENT_RULES, MOD_FX, BORROW_RULES } from '../../data/talents.js';
import { holderTank } from './targeting.js';
import { rowOf as standsIn } from './monster-roles.js';
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

/* a discipline's own reach: the range of the role its first role key plays (hunt-roles.js ROLE_KEYS: restoration, the healer's 7 tiles) */
const NATIVE_REACH = Object.freeze(Object.values(ROLE_KEYS).reduce((o, k) => {
  if (!Object.prototype.hasOwnProperty.call(o, k.discipline) && HUNT_ROLES[k.roles[0]]) o[k.discipline] = HUNT_ROLES[k.roles[0]].range;
  return o;
}, {}));
const LENT_CLOCK = BORROW_RULES.clock;
const LENT_RATE = ABILITIES[BORROW_RULES.rate] ? ABILITIES[BORROW_RULES.rate].magicXpMult : 0;

/* THE HEADER'S A BORROWED MOVE on `o`, the copy of `row` moddedRow freezes */
function lend(o, row, mod) {
  o.lent = true;
  if (heals(row) && row.id !== LENT_CLOCK && !Array.isArray(row.replaces)) o.replaces = Object.freeze([LENT_CLOCK]);
  if (row.magicXpMult > 0) o.magicXpMult = LENT_RATE;
  const reach = row.target === 'ally' ? NATIVE_REACH[row.disciplines[0]] : undefined;
  if (Number.isInteger(reach)) o.reach = reach;
  if (row.unlock !== undefined) delete o.unlock;
  /* a taunt: from any seat (targeting.js challengeable reads `lent`), its hold at its price (holdPm; whole at no penalty) */
  if (row.target === 'taunt' && mod.penaltyPm > 0) o.holdPm = 1000 - mod.penaltyPm;
}

/* lentModsOf's answers, by the grants' modifier object (none: LENT_NONE), then the list */
const LENT = new WeakMap();
const LENT_NONE = new Map();
/**
 * THE BORROWED MOVES' MODIFIERS (the header): `mods` (grantsOf's, null with no build) with every move of `borrowed` marked `lent`, and a
 * handed price (`pens` { id: permille }) where the grants price none. `mods` itself (or null) with nothing borrowed. Frozen and the same
 * object for the same inputs (rowsFor caches on it).
 */
export function lentModsOf(mods, borrowed, pens) {
  const ids = Array.isArray(borrowed) ? borrowed.filter((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ABILITIES, id)) : NONE;
  if (!ids.length) return mods || null;
  const penOf = (id) => (pens && Number.isInteger(pens[id]) && pens[id] > 0 && pens[id] < 1000 ? pens[id] : 0);
  const key = ids.map((id) => id + ':' + penOf(id)).join(',');
  let byKey = mods ? LENT.get(mods) : LENT_NONE;
  if (!byKey) LENT.set(mods, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const out = { ...(mods || {}) };
  for (const id of ids) {
    const m = out[id] || {};
    out[id] = Object.freeze({ ...m, ...(!Number.isInteger(m.penaltyPm) && penOf(id) ? { penaltyPm: penOf(id) } : {}), lent: true });
  }
  const frozen = Object.freeze(out);
  if (byKey.size < 256) byKey.set(key, frozen);
  return frozen;
}

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
  /* A BORROWED MOVE (mod.lent: lentModsOf): 17 section 3's rules (the header) */
  if (mod.lent === true) lend(o, row, mod);
  /* THE PIECES (MOD_FX): carried on the row as `fx`, read where the cast lands (abilities.js, heal-rules.js) */
  let fx = null;
  for (const k of MOD_FX) if (mod[k] !== undefined) (fx || (fx = {}))[k] = mod[k];
  if (fx) Object.assign(o, { fx: Object.freeze(fx) });
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

/* is monster `m` held on hero `u` by its Challenge */
const heldOn = (m, u) => !!m && m.alive === true && m.holdMs > 0 && m.target === u.id;

/** Does condition `when` hold for hero `u` now. */
export function holds(inst, u, when) {
  const units = inst && inst.world && Array.isArray(inst.world.units) ? inst.world.units : NONE;
  switch (when) {
    case 'party': return units.some((x) => x !== u && isAlly(u, x) && x.alive === true);
    case 'solo': return !units.some((x) => x !== u && isAlly(u, x) && x.alive === true);
    case 'near_fall': return nearFall(inst, u, u.hp);
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

/** IS HERO `u` NEAR FALL-BACK at `hp` (the `near_fall` condition): within NEAR_FALL_PM of its stance's fall-back line, the Challenge
    holder's line x HOLDER.linePm (danger.js marginOf). On the Danger scale only: off it there is no line, so never. */
export function nearFall(inst, u, hp) {
  const st = inst && inst.world && RISKS[inst.world.risk];
  if (!st || !u || !(u.maxHp > 0)) return false;
  const line = holderTank(inst) === u ? Math.floor((st.fallPm * HOLDER.linePm) / 1000) : st.fallPm;
  return hp * 1000 < (line + NEAR_FALL_PM) * u.maxHp;
}

/* is any engaged monster winding up a spell now (monster-spells.js `cast`, its time left) */
const windingUp = (inst) => (inst && inst.world ? inst.world.units : NONE).some((m) => isMonster(m) && m.alive === true && m.cast && m.cast.left > 0);

/* THE PER-TARGET FIELDS (src/data/talents.js MOD_FX): each a permille more (or less) of what a heal or a shell lands on a target it
   holds for. One table, so a new field is a row here and in the data's list. */
const ON_TARGET = Object.freeze({
  nearFallPm: (inst, u, t) => nearFall(inst, t, t.hp),
  notNearFallPm: (inst, u, t) => !nearFall(inst, t, t.hp),
  frontPm: (inst, u, t) => standsIn(t) === 'front',
  backPm: (inst, u, t) => standsIn(t) === 'back',
  selfPm: (inst, u, t) => t === u,
  othersPm: (inst, u, t) => t !== u,
  tankPm: (inst, u, t) => !!(HUNT_ROLES[t.role] && HUNT_ROLES[t.role].tank),
  tauntingPm: (inst, u, t) => holds(inst, t, 'taunting'),
  onWindupPm: (inst) => windingUp(inst),
});
/** WHAT CAST `row` OF HERO `u` LANDS ON TARGET `t`, permille of its number: 1000 plus every per-target field of its `fx` that holds, never
    under 0. 1000 for a row with none. */
export function outPmFor(inst, u, row, t) {
  const fx = row && row.fx;
  if (!fx || !t) return 1000;
  let pm = 1000;
  for (const k of Object.keys(ON_TARGET)) if (Number.isInteger(fx[k]) && ON_TARGET[k](inst, u, t)) pm += fx[k];
  return Math.max(0, pm);
}

/** THE HEALING HERO `u` RECEIVES NOW, permille over every heal it takes (heal-cut.js healIn): its own `heal_in` rows (scope self) whose
    condition holds, and the `warded` rows of the living hero whose shell it holds, added and held to TALENT_RULES.healInCapPm. 0 with none. */
export function healInPm(inst, u) {
  if (!u || !isHero(u)) return 0;
  let pm = 0;
  for (const r of Array.isArray(u.healIn) ? u.healIn : NONE) if (r.scope !== 'warded' && (!r.when || holds(inst, u, r.when))) pm += r.pm;
  if ((u.shield | 0) > 0 && Number.isInteger(u.shieldBy) && inst && inst.world) {
    const by = inst.world.units.find((x) => x.id === u.shieldBy);
    for (const r of by && by.alive === true && Array.isArray(by.healIn) ? by.healIn : NONE) if (r.scope === 'warded') pm += r.pm;
  }
  return Math.max(-TALENT_RULES.healInCapPm, Math.min(TALENT_RULES.healInCapPm, pm));
}

/* THE GRANTS A BOUNDARY WRITES ON A UNIT (never persisted): the step rows, the move rows, the Challenge's reach, hold and full hold, the
   reactions (reactions.js), the healing received, and the unit rules (Hold Fast's no-switch, Bodyguard's share, Still Mind's regen) */
const UNIT_RULES = ['noSwitch', 'guardPm', 'guardR', 'stillMs', 'stillRegenPm'];
const TALENT_KEYS = ['ledger', 'talentWhen', 'moveMods', 'tauntHoldMs', 'tauntRadius', 'tauntFull', 'reacts', 'healIn', ...UNIT_RULES];

/** WRITE HERO `m`'s GRANTS ON UNIT `u` at Level `level` (combat-sim.js syncUnit, every boundary): the header's fields from
    src/core/talents.js grantsOf, or none of them for a hero with no build; the moves it borrows marked lent either way (lentModsOf). */
export function syncTalents(u, hero, level) {
  if (!hero || !hero.talents) {
    for (const k of TALENT_KEYS) if (k !== 'moveMods' && u[k] !== undefined) delete u[k];
    /* a borrow handed whole with no build (heroSetup `borrowed`: the Lab's seam) is still a lent row */
    const lent = lentModsOf(null, hero && hero.borrowed, hero && hero.lentPm);
    if (lent) u.moveMods = lent; else if (u.moveMods) delete u.moveMods;
    return;
  }
  const g = grantsOf(hero.talents, hero.discipline, level);
  u.ledger = g.ledger;
  if (g.when.length) u.talentWhen = g.when; else if (u.talentWhen) delete u.talentWhen;
  const mods = lentModsOf(g.mods, hero.borrowed, hero.lentPm);
  if (Object.keys(mods).length) u.moveMods = mods; else if (u.moveMods) delete u.moveMods;
  const ch = g.mods.challenge;
  if (ch && ch.holdMs) u.tauntHoldMs = Math.max(STEP, CHALLENGE.holdMs + ch.holdMs); else if (u.tauntHoldMs !== undefined) delete u.tauntHoldMs;
  if (ch && ch.tauntRadius) u.tauntRadius = Math.max(1, CHALLENGE.radius + ch.tauntRadius); else if (u.tauntRadius !== undefined) delete u.tauntRadius;
  if (ch && ch.holdAll) u.tauntFull = true; else if (u.tauntFull !== undefined) delete u.tauntFull;
  if (g.reacts.length) u.reacts = g.reacts; else if (u.reacts) delete u.reacts;
  if (g.healIn.length) u.healIn = g.healIn; else if (u.healIn) delete u.healIn;
  for (const k of UNIT_RULES) if (g.unit[k] !== undefined) u[k] = g.unit[k]; else if (u[k] !== undefined) delete u[k];
}

/** `rows` (the party's auras on hero `u`, auras.js auraRowsOn) with `u`'s own conditional Roads rows that hold now appended: `rows` itself
    when none holds (or for a monster or a dead hero). */
export function withTalentRows(inst, u, rows) {
  const when = isHero(u) && u.alive === true && Array.isArray(u.talentWhen) ? u.talentWhen : NONE;
  let out = null;
  for (const r of when) if (holds(inst, u, r.when)) (out || (out = rows.slice())).push(r);
  return out || rows;
}
