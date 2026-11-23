// ============================================================
// src/core/hunt/boss-phases.js — A BOSS'S TWO LINES (Tyler 2026-11-05: "phases"), in a called room (src/data/boss-calls.js) and on
// a hunting ground alike (Captain Hask, src/data/grounds/muster_barrows): one engine, one rule, whatever room he stands in.
//
// A boss row's `phases` { addsPm, enragePm, enrageAtkPm, guardPm } draw two lines on his HP, each a question the action bar answers.
// At addsPm his adds come (pull-cycle.js spawnAdds: his pocket's `adds` rows) and go for whoever isn't holding him, and while one
// stands he takes only guardPm of every blow: burning him through them is the slow way, so the wave asks for Challenge (they come
// to the tank, in one heap beside him), an area slot (the heap falls together) and the Target setting (Lowest HP takes them first).
// Under enragePm his attack is raised: the eat lines and a healer's slots decide the finish.
//
// NOTHING IS STORED. His HP only ever falls inside one try: in a called room nothing heals him (leash.js resetPack never resets
// one); on a ground the only thing that does is the reset that ends a try, and it sends his adds away with it (leash.js isAdd).
// So the first line is read from the blow that crosses it (once a try: the next try's wave replaces the last, never joins it),
// the second from his HP at each swing and the guard from his adds standing: no flag, no new world field, and the world's shape
// stays as it was (tests/boss-call.mjs holds the shape). A row with no `phases` reads nothing. tests/ground-boss.mjs holds the ground.
//
// A SPELL THAT SPEEDS UP UNDER HIS LINE (the Krell's Hold design's engine piece 7; src/data/boss-halls.js): a boss row's `phases.hasten`
// { spell, cdPm } names one of his spells (data/monster-spells.js). Under his enrage line its wait, from one start to its next earliest
// start, is cdPm/1000 of its row's (spellCdOf, read at each start), and the blow that takes him over the line cuts the wait already running
// to no more than that (crossLines): the Hall Fire flares twice as often at a quarter (cdPm 500). Stored nowhere but the caster's own
// `spellCds` (monster-spells.js PERSISTED), so the settle and the browser's live view count the same wait. A NAMED ADD (a row `boss` and
// `add` both, boss-halls.js isNamedAdd) reads his own `phases` here like any boss: his enrage line and his haste, never a wave (no addsPm)
// or a guard (no guardPm): the data refuses them (tools/gen-hunt-sessions.mjs hallRows, tests/boss-hall.mjs).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js';
import { makeEvent } from './events.js';
import { spawnAdds } from './pull-cycle.js';
import { spellRow } from '../../data/monster-spells.js';
import { isAdd } from './leash.js';
import { isMonster } from './sides.js';
import { rampOf, rampPmAt } from '../../data/bosses.js';

const atOrUnder = (hp, maxHp, pm) => hp * 1000 <= maxHp * pm;

/* THE RAMP (src/data/bosses.js; 04-math-strategy.md section 6 `rampPerMinute`): a boss row's kind names a ramp, and his blow grows by it for
   every minute he has fought. `fightMs` is HIS fight clock, stored on the unit (so every cut of the settle windows and the browser's live view
   count the same minutes): the sub-steps he stood alive with a target (rampTick, from damage.js resolveAttacks). A unit that never fights a
   hero never ramps, and a boss that stands up whole again (a respawn: a new unit) starts at nothing. */
export const PERSISTED = Object.freeze({ unit: Object.freeze([['fightMs', 'int']]), world: Object.freeze([]), pack: Object.freeze([]) });

/** One sub-step of `dtMs` on monster unit `u` reading `row`: a boss with a ramp holding a target counts it toward his fight clock. */
export function rampTick(u, row, dtMs) {
  if (!rampOf(row) || !Number.isInteger(u.target) || !(dtMs > 0)) return;
  u.fightMs = (Number.isSafeInteger(u.fightMs) ? u.fightMs : 0) + dtMs;
}

/** The row monster `u` swings with, from `row` (his own at the party's tier): that row, or, a boss under his enrage line, it at his raised
    attack and aim (a harder blow is a surer one, as a tier's: src/data/hunt-tiers.js atTier); a boss with a ramp, his attack x the ramp
    at his fight clock (the pressure, never the aim: 04 section 6's ramp grows the share he deals, not how often he lands). */
export function swingRow(u, row) {
  const ph = (MONSTERS[u.kind] || {}).phases;
  const rampPm = rampPmAt(rampOf(row), u.fightMs);
  const enraged = !!ph && atOrUnder(u.hp, u.maxHp, ph.enragePm);
  if (!enraged && rampPm === 1000) return row;
  const atkPm = enraged ? ph.enrageAtkPm : 1000;
  return Object.assign({}, row, { atk: Math.floor((Math.floor((row.atk * atkPm) / 1000) * rampPm) / 1000) },
    enraged && Number.isFinite(row.aim) ? { aim: (row.aim * ph.enrageAtkPm) / 1000 } : {});
}

/** The permille of a blow monster `t` takes: a boss's `phases.guardPm` while an add of his pocket (leash.js isAdd: one his line
    brought) stands, else all of it. Read at each blow from the world, the same on every cut of the windows. */
export function guardPmOf(inst, t) {
  const ph = isMonster(t) ? (MONSTERS[t.kind] || {}).phases : null;
  if (!ph || !Number.isInteger(ph.guardPm)) return 1000;
  return inst.world.units.some((u) => u.alive && isMonster(u) && u !== t && u.pocket === t.pocket && isAdd(inst, u)) ? ph.guardPm : 1000;
}

/** The blow that took monster `t` from `before` HP to where it stands: each line it crossed happens now, once. Not on the blow that felled him. */
export function crossLines(inst, sc, t, before) {
  const ph = (MONSTERS[t.kind] || {}).phases;
  if (!ph || t.hp <= 0) return;
  const crossed = (pm) => !atOrUnder(before, t.maxHp, pm) && atOrUnder(t.hp, t.maxHp, pm);
  if (crossed(ph.addsPm)) {
    sc.emit(makeEvent('boss_phase', sc.atMs, { u: t.id, phase: 'adds' }));
    spawnAdds(inst, t.pocket, sc);
  }
  if (crossed(ph.enragePm)) {
    sc.emit(makeEvent('boss_phase', sc.atMs, { u: t.id, phase: 'enrage' }));
    hastenNow(t, ph);
  }
}

/* The hasted spell's wait under his line: cdPm/1000 of `cdMs`, whole ms. */
const hastened = (cdMs, h) => Math.floor((cdMs * h.cdPm) / 1000);

/** The wait from this start of spell `id` to its next earliest start for monster `u` (monster-spells.js begin): the row's `cdMs`, or, his
    `phases.hasten` spell at or under his enrage line, the hastened wait. */
export function spellCdOf(u, id, cdMs) {
  const ph = (MONSTERS[u.kind] || {}).phases;
  const h = ph ? ph.hasten : null;
  if (!h || h.spell !== id || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return cdMs;
  return hastened(cdMs, h);
}

/* THE LINE CROSSED: a wait already running on his hasted spell is cut to the hastened wait at most (never raised; a second crossing, after
   a heal, cuts nothing more). Not in a fight yet (no `spellCds`) or the spell ready: nothing to cut. */
function hastenNow(t, ph) {
  const h = ph.hasten;
  const left = h && t.spellCds ? t.spellCds[h.spell] : undefined;
  const row = h ? spellRow(h.spell) : null;
  if (!(left > 0) || !row) return;
  const top = hastened(row.cdMs, h);
  if (left > top) t.spellCds = Object.assign({}, t.spellCds, { [h.spell]: top });
}
