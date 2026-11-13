// ════════════════════════════════════════════════════════════════════════
// src/session/training-sections.js — COMBAT TRAINING AS THE SERVER STATES IT, FOR ONE HERO.
//
// PURE. Reads the envelope's `training` section (the designer's board section "2026-11-13 Combat training spec"; the
// server half is lane/c-combat-training). The section's shape is this lane's reading of the spec, to be matched to the
// server's when its migration lands:
//   null / absent   the server does not offer training to this hero: the Training window is hidden and the yard opens Hunts
//   { skills: ['melee', ...],                         the skills the yard trains
//     max_hours,                                       a session ends `hours` after this many
//     quotes: [{ skill, level, fee_h, xp_h, hours_to_next }],   the yard's price and pace for each skill at the hero's level
//     run: { skill, where, since, fee_h, paid } | null,           the session now (a hunt on the `training_yard` ground)
//     last_stop: { reason, skill, at } | null,
//     dummy: { needs, has_home, owned: [skill], ladder: [gold], next_price, busy } }   the account's house dummy
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). The one thing drawn between
// two answers is the running clock: the server's `since` against the server's clock as the session measures it.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= 40 ? v.trim() : null);

/** Where a hero trains, as the server names it. */
export const PLACES = Object.freeze(['yard', 'house']);

function quoteOf(q) {
  if (!isObj(q) || !word(q.skill) || nat(q.fee_h) === null) return null;
  return Object.freeze({ skill: q.skill, level: nat(q.level), feeH: q.fee_h, xpH: nat(q.xp_h), hoursToNext: nat(q.hours_to_next) });
}

function runOf(r) {
  if (!isObj(r) || !word(r.skill) || at(r.since) === null) return null;
  return Object.freeze({ skill: r.skill, where: PLACES.includes(r.where) ? r.where : 'yard', since: at(r.since), feeH: nat(r.fee_h) ?? 0, paid: nat(r.paid) ?? 0 });
}

function lastStopOf(l) {
  if (!isObj(l) || !word(l.reason) || !word(l.skill)) return null;
  return Object.freeze({ reason: l.reason, skill: l.skill, at: at(l.at) });
}

function dummyOf(d) {
  if (!isObj(d) || !Array.isArray(d.ladder)) return null;
  const ladder = d.ladder.slice(0, 16).map(nat);
  if (ladder.some((v) => v === null)) return null;
  return Object.freeze({
    needs: word(d.needs), hasHome: d.has_home === true,
    owned: Object.freeze((Array.isArray(d.owned) ? d.owned : []).filter(word).slice(0, 16)),
    ladder: Object.freeze(ladder), nextPrice: nat(d.next_price),
    /* the hero on it now, by name, or null */
    busy: name(d.busy),
  });
}

/**
 * The section, checked field by field and frozen, or null when the server did not send it. A quote that is not the
 * server's shape is dropped: the window never invents a price.
 */
export function trainingOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('training') : undefined;
  if (!isObj(s) || !Array.isArray(s.skills)) return null;
  const quotes = (Array.isArray(s.quotes) ? s.quotes : []).slice(0, 16).map(quoteOf).filter(Boolean);
  return Object.freeze({
    skills: Object.freeze(s.skills.filter(word).slice(0, 16)),
    maxHours: nat(s.max_hours),
    quotes: Object.freeze(quotes),
    run: runOf(s.run),
    lastStop: lastStopOf(s.last_stop),
    dummy: dummyOf(s.dummy),
  });
}

/** The server's quote for one skill, or null. Pure. */
export const quoteFor = (tr, skill) => (tr && tr.quotes.find((q) => q.skill === skill)) || null;

/** How long the run has gone (ms) at `serverNowMs`; display only, never under 0. */
export function runForMs(run, serverNowMs) {
  if (!run || !Number.isFinite(serverNowMs)) return 0;
  return Math.max(0, serverNowMs - run.since);
}
