// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/boss-loss.js — THE LOSING LINE (Tyler 2026-11-05: "a losing line naming the phase"; src/data/boss-calls.js).
//
// Retrying is the decision, at 3 tries a day and a 10-30k fee, so a lost fight says where it was lost and what this hero's
// bar did about that part, then what answers it. Every number is the server's record of the fight (hunt_session_tally.fight,
// accrual.js fightOf); nothing here counts. Null for a fight won, one with no record, or one a hero walked out of.
// PURE.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js?v=0.2.93';
import { MONSTERS } from '../data/monsters.js?v=0.2.93';
import { BOSS_CALL_WORDS, callOfHunt } from '../data/boss-calls.js?v=0.2.93';

const LOST = Object.freeze(['died', 'party_member_died', 'boss_time']);
/* What a kind of slot counts: its abilities' ids by what they do (abilities.js target, heal). */
const idsWhere = (test) => Object.values(ABILITIES).filter(test).map((r) => r.id);
const AREA = idsWhere((r) => r.target === 'area' || r.target === 'cleave');
const HEALS = idsWhere((r) => !!r.heal);

const sum = (fired, ids) => ids.reduce((n, id) => n + (Number.isInteger(fired[id]) ? fired[id] : 0), 0);
const times = (n) => (n === 1 ? '1 time' : n + ' times');

/* Which line of his he stood past when it ended. */
export function phaseAt(monster, bossPm) {
  const ph = (MONSTERS[monster] || {}).phases;
  if (!ph) return 'first';
  return bossPm <= ph.enragePm ? 'enrage' : bossPm <= ph.addsPm ? 'adds' : 'first';
}

/* The one fact this hero's bar can be asked about, in this part of the fight. */
function factFor(phase, role, fired) {
  const W = BOSS_CALL_WORDS.loss.fact;
  if (phase === 'adds' && role === 'tank') return W.challenge.replace('{times}', times(sum(fired, ['challenge'])));
  if (phase === 'adds') return W.area.replace('{times}', times(sum(fired, AREA)));
  if (role === 'healer') return W.heals.replace('{times}', times(sum(fired, HEALS)));
  return W.ate.replace('{times}', times(sum(fired, ['eat'])));
}

/**
 * @param {{hunt: string|null, reason: string|null, fight: {boss_pm?: number, fired?: Object}|null, role: string|null}} o
 * @returns {string|null}
 */
export function lossLine(o) {
  const call = o && o.hunt ? callOfHunt(o.hunt) : null;
  const f = o && o.fight;
  if (!call || !f || !Number.isInteger(f.boss_pm) || !LOST.includes(o.reason)) return null;
  const fired = f.fired && typeof f.fired === 'object' ? f.fired : {};
  const phase = phaseAt(call.monster, f.boss_pm);
  const W = BOSS_CALL_WORDS.loss;
  const lead = (o.reason === 'boss_time' ? W.time : W.fell)[phase].replace('{pct}', String(Math.max(1, Math.ceil(f.boss_pm / 10))));
  return lead + ': ' + factFor(phase, o.role, fired) + '. ' + W.answer[phase];
}
