// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/boss-loss.js — THE LOSING LINE (Tyler 2026-11-05: "a losing line naming the phase"; src/data/boss-calls.js).
//
// Retrying is the decision, at 3 tries a day and a 10-30k fee, so a lost fight says where it was lost and what this hero's
// bar did about that part, then what answers it. Every number is the server's record of the fight (hunt_session_tally.fight,
// accrual.js fightOf); nothing here counts. Null for a fight won, one with no record, or one a hero walked out of.
// PURE.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js?v=0.2.127';
import { MONSTERS } from '../data/monsters.js?v=0.2.127';
import { BOSS_CALL_WORDS, callOfHunt, isGuarded } from '../data/boss-calls.js?v=0.2.127';

const LOST = Object.freeze(['died', 'party_member_died', 'boss_time']);
/* Every ability that heals (abilities.js `heal`), and every one that hits a crowd (an area cast or a Cleave). */
const HEALS = Object.values(ABILITIES).filter((r) => !!r.heal).map((r) => r.id);
const AREAS = Object.values(ABILITIES).filter((r) => r.target === 'area' || r.target === 'cleave').map((r) => r.id);

const sum = (fired, ids) => ids.reduce((n, id) => n + (Number.isInteger(fired[id]) ? fired[id] : 0), 0);
const times = (n) => (n === 1 ? '1 time' : n + ' times');

/* Which line of his he stood past when it ended. */
export function phaseAt(monster, bossPm) {
  const ph = (MONSTERS[monster] || {}).phases;
  if (!ph) return 'first';
  return bossPm <= ph.enragePm ? 'enrage' : bossPm <= ph.addsPm ? 'adds' : 'first';
}

/* The one fact this hero's bar can be asked about, in this part of the fight: what the table says decides it (tools/balance-sim/boss-call-table.mjs, the "good bar but"
   rows). In the add wave a tank is asked about Challenge and a damage dealer about its area slots (Tyler's own example: "your area slot fired 0 times"). */
function factFor(phase, role, fired) {
  const W = BOSS_CALL_WORDS.loss.fact;
  if (phase === 'adds' && role === 'tank') return W.challenge.replace('{times}', times(sum(fired, ['challenge'])));
  if (role === 'healer') return W.heals.replace('{times}', times(sum(fired, HEALS)));
  if (phase === 'adds') return W.area.replace('{times}', times(sum(fired, AREAS)));
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
  /* A boss whose adds shield him has his own answer to the wave (the designer's line). */
  const answer = phase === 'adds' && isGuarded(MONSTERS[call.monster]) ? W.answer.guarded : W.answer[phase];
  /* two sentences, never a colon join (copy 11-06): the facts start lower-case in the table */
  const fact = factFor(phase, o.role, fired);
  return lead + '. ' + fact.charAt(0).toUpperCase() + fact.slice(1) + '. ' + answer;
}
