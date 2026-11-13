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
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.127';
import { makeEvent } from './events.js?v=0.2.127';
import { spawnAdds } from './pull-cycle.js?v=0.2.127';

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
  if (crossed(ph.enragePm)) sc.emit(makeEvent('boss_phase', sc.atMs, { u: t.id, phase: 'enrage' }));
}
