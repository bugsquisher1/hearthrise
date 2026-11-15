// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/boss-loss.js — THE LOSING LINE (Tyler 2026-11-05: "a losing line naming the phase"; src/data/boss-calls.js).
//
// Retrying is the decision (each try costs a fight's stamina and fee, and a death costs a death), so a lost fight says where it was lost and what this hero's
// bar did about that part, then what answers it. Every number is the server's record of the fight (hunt_session_tally.fight,
// accrual.js fightOf); nothing here counts. Null for a fight won, one with no record, or one a hero walked out of.
// THE SERIES' LINE (seriesLine; Tyler 2026-11-14, a slider of fights): how many fights the server counted, how many were won and what it charged.
// PURE.
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js?v=0.2.132';
import { MONSTERS } from '../data/monsters.js?v=0.2.132';
import { BOSS_CALL_WORDS, isGuarded } from '../data/boss-calls.js?v=0.2.132';
import { roomOfHunt } from '../data/boss-halls.js?v=0.2.132';

const LOST = Object.freeze(['died', 'party_member_died', 'boss_time']);
/* Every ability that heals (abilities.js `heal`), and every one that hits a crowd (an area cast or a Cleave). */
const HEALS = Object.values(ABILITIES).filter((r) => !!r.heal).map((r) => r.id);
const AREAS = Object.values(ABILITIES).filter((r) => r.target === 'area' || r.target === 'cleave').map((r) => r.id);

const sum = (fired, ids) => ids.reduce((n, id) => n + (Number.isInteger(fired[id]) ? fired[id] : 0), 0);
const times = (n) => (n === 1 ? '1 time' : n + ' times');

/* Milliseconds as minutes, the way a label says them: 2, 2.5, 10. */
const minutes = (ms) => { const m = ms / 60000; return Number.isInteger(m) ? String(m) : (Math.round(m * 10) / 10).toFixed(1); };

/**
 * A CALL OUT SERIES' LINE for the summary: the server's own count of fights and wins and what it charged (hr_hunt_view `call`, read by
 * hunt-sections.js callOf). Nothing here counts or multiplies. Null on any other hunt.
 * @param {{fights:number, fight:number, won:number, paidGold:number|null, paidStaminaMs:number|null}|null} c
 * @returns {string|null}
 */
export function seriesLine(c) {
  if (!c || !Number.isInteger(c.fight) || !Number.isInteger(c.won)) return null;
  const S = BOSS_CALL_WORDS.series;
  const done = (c.fight === 1 ? S.done.one : S.done.other).replace('{won}', String(c.won)).replace('{fought}', String(c.fight));
  if (!Number.isFinite(c.paidStaminaMs) || !Number.isFinite(c.paidGold)) return done + '.';
  const paid = (c.paidGold === 0 ? S.paidFree : S.paid).replace('{stamina}', minutes(c.paidStaminaMs)).replace('{gold}', Number(c.paidGold).toLocaleString('en-US'));
  return done + '. ' + paid + '.';
}

/* Which line of his he stood past when it ended. */
export function phaseAt(monster, bossPm) {
  const ph = (MONSTERS[monster] || {}).phases;
  if (!ph) return 'first';
  return bossPm <= ph.enragePm ? 'enrage' : bossPm <= ph.addsPm ? 'adds' : 'first';
}

/* The one fact this hero's bar can be asked about, in this part of the fight: what the table says decides it (tools/balance-sim/boss-call-table.mjs, the "good bar but"
   rows). In the add wave a tank is asked about Challenge and a damage dealer about its area slots (Tyler's own example: "your area slot fired 0 times"). */
function factFor(phase, role, fired, guarded) {
  const W = BOSS_CALL_WORDS.loss.fact;
  /* a boss whose adds shield him asks the tank about Challenge in every part of the fight (the wrong press there), once it fired */
  if (role === 'tank' && (phase === 'adds' || (guarded && sum(fired, ['challenge']) > 0))) return W.challenge.replace('{times}', times(sum(fired, ['challenge'])));
  if (role === 'healer') return W.heals.replace('{times}', times(sum(fired, HEALS)));
  if (phase === 'adds') return W.area.replace('{times}', times(sum(fired, AREAS)));
  return W.ate.replace('{times}', times(sum(fired, ['eat'])));
}

/**
 * @param {{hunt: string|null, reason: string|null, fight: {boss_pm?: number, fired?: Object}|null, role: string|null}} o
 * @returns {string|null}
 */
export function lossLine(o) {
  /* a called room's or a keyed hall's fight (boss-halls.js roomOfHunt): the same record, the same line */
  const call = o && o.hunt ? roomOfHunt(o.hunt) : null;
  const f = o && o.fight;
  if (!call || !f || !Number.isInteger(f.boss_pm) || !LOST.includes(o.reason)) return null;
  const fired = f.fired && typeof f.fired === 'object' ? f.fired : {};
  const phase = phaseAt(call.monster, f.boss_pm);
  const W = BOSS_CALL_WORDS.loss;
  const lead = (o.reason === 'boss_time' ? W.time : W.fell)[phase].replace('{pct}', String(Math.max(1, Math.ceil(f.boss_pm / 10))));
  /* A boss whose adds shield him has his own answer to the wave (the designer's line) and to his enrage. */
  const guarded = isGuarded(MONSTERS[call.monster]);
  const answer = guarded && phase === 'adds' ? W.answer.guarded : guarded && phase === 'enrage' ? W.answer.enrageGuarded : W.answer[phase];
  /* two sentences, never a colon join (copy 11-06): the facts start lower-case in the table */
  const fact = factFor(phase, o.role, fired, guarded);
  return lead + '. ' + fact.charAt(0).toUpperCase() + fact.slice(1) + '. ' + answer;
}
