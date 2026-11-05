// ============================================================
// src/core/hunt/boss-phases.js — A CALLED BOSS'S TWO LINES (Tyler 2026-11-05: "phases"; src/data/boss-calls.js)
//
// A row's `phases` { addsPm, enragePm, enrageAtkPm } draw two lines on his HP, each a question the action bar answers.
// At addsPm his adds come (pull-cycle.js spawnAdds) and go for whoever isn't holding him: Challenge, an area slot, the
// Target setting. Under enragePm his attack is raised: the eat lines and a healer's slots decide the finish.
//
// NEITHER IS STORED. A boss's HP only falls in a called room (leash.js resetPack never heals one), so the first line
// is read from the blow that crosses it and the second from his HP at each swing: no flag, no new world field, and
// the world's shape stays as it was (tests/boss-call.mjs holds the shape). A row with no `phases` reads nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.93';
import { makeEvent } from './events.js?v=0.2.93';
import { spawnAdds } from './pull-cycle.js?v=0.2.93';

const atOrUnder = (hp, maxHp, pm) => hp * 1000 <= maxHp * pm;

/** The row monster `u` swings with: his own, or, a called boss under his enrage line, the same row at his raised attack. */
export function swingRow(u) {
  const row = MONSTERS[u.kind];
  const ph = row && row.phases;
  if (!ph || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return row;
  return Object.assign({}, row, { atk: Math.floor((row.atk * ph.enrageAtkPm) / 1000) });
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
