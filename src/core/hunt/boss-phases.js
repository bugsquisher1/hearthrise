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
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=0.2.117';
import { makeEvent } from './events.js?v=0.2.117';
import { spawnAdds } from './pull-cycle.js?v=0.2.117';
import { isAdd } from './leash.js?v=0.2.117';

const atOrUnder = (hp, maxHp, pm) => hp * 1000 <= maxHp * pm;

/** The row monster `u` swings with, from `row` (his own at the party's tier): that row, or, a boss under his enrage line, it at his raised attack. */
export function swingRow(u, row) {
  const ph = (MONSTERS[u.kind] || {}).phases;
  if (!ph || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return row;
  return Object.assign({}, row, { atk: Math.floor((row.atk * ph.enrageAtkPm) / 1000) });
}

/** The permille of a blow monster `t` takes: a boss's `phases.guardPm` while an add of his pocket (leash.js isAdd: one his line
    brought) stands, else all of it. Read at each blow from the world, the same on every cut of the windows. */
export function guardPmOf(inst, t) {
  const ph = t.side === 'mon' ? (MONSTERS[t.kind] || {}).phases : null;
  if (!ph || !Number.isInteger(ph.guardPm)) return 1000;
  return inst.world.units.some((u) => u.alive && u.side === 'mon' && u !== t && u.pocket === t.pocket && isAdd(inst, u)) ? ph.guardPm : 1000;
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
