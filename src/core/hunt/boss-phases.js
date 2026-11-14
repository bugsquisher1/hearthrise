// ============================================================
// src/core/hunt/boss-phases.js — A CALLED BOSS'S TWO LINES (Tyler 2026-11-05: "phases"; src/data/boss-calls.js)
//
// A row's `phases` { addsPm, enragePm, enrageAtkPm, guardPm } draw two lines on his HP, each a question the action bar answers.
// At addsPm his adds come (pull-cycle.js spawnAdds) and go for whoever isn't holding him, and while one stands he takes only
// guardPm of every blow: burning him through them is the slow way, so the wave asks for Challenge (they come to the tank, in
// one heap beside him), an area slot (the heap falls together) and the Target setting (Lowest HP takes them first).
// Under enragePm his attack is raised: the eat lines and a healer's slots decide the finish.
//
// NOTHING IS STORED. A boss's HP only falls in a called room (leash.js resetPack never heals one), so the first line
// is read from the blow that crosses it, the second from his HP at each swing and the guard from his adds standing: no flag,
// no new world field, and the world's shape stays as it was (tests/boss-call.mjs holds the shape). A row with no `phases` reads nothing.
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

import { MONSTERS } from '../../data/monsters.js?v=0.2.129';
import { makeEvent } from './events.js?v=0.2.129';
import { spawnAdds } from './pull-cycle.js?v=0.2.129';
import { spellRow } from '../../data/monster-spells.js?v=0.2.129';

const atOrUnder = (hp, maxHp, pm) => hp * 1000 <= maxHp * pm;

/** The row monster `u` swings with, from `row` (his own at the party's tier): that row, or, a called boss under his enrage line, it at his raised attack. */
export function swingRow(u, row) {
  const ph = (MONSTERS[u.kind] || {}).phases;
  if (!ph || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return row;
  return Object.assign({}, row, { atk: Math.floor((row.atk * ph.enrageAtkPm) / 1000) });
}

/** The permille of a blow monster `t` takes: a called boss's `phases.guardPm` while an add (a row marked `add`) of his pocket
    stands, else all of it. Read at each blow from the world, the same on every cut of the windows. */
export function guardPmOf(inst, t) {
  const ph = t.side === 'mon' ? (MONSTERS[t.kind] || {}).phases : null;
  if (!ph || !Number.isInteger(ph.guardPm)) return 1000;
  return inst.world.units.some((u) => u.alive && u.side === 'mon' && u.pocket === t.pocket && (MONSTERS[u.kind] || {}).add === true) ? ph.guardPm : 1000;
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
