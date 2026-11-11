// ════════════════════════════════════════════════════════════════════════
// src/session/training-sections.js — THE TRAINING YARD AS THE SERVER STATES IT, FOR ONE HERO.
//
// PURE. Reads the envelope's `training` section (hr_training_view, supabase/migrations/2027-04-06-training-yard.sql):
//   null / absent   the server's switch `training` is off for this account (or the section is not there yet):
//                   the Training window and its icon are hidden, and the yard opens Hunts as before
//   { open, level, min_level, xp_h, gold_h, per_level, skills, places, stop_after {min,max}, keep_max,
//     settings {skill, place, stop_after_h, keep_gold} | null,          what the hero last asked for, remembered
//     run {skill, place, since, settled_to, stop_at, keep_gold, level, ms, xp, gold} | null,   the run as last settled
//     last_stop {reason, at, skill, ms, xp, gold} | null }              why the last run ended
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). The one thing drawn between two
// answers is the clock: the time left to a "Stop after" is the server's stop_at against the server's clock as the session
// measures it, display only (the section's own note: "the client may draw the time since settled_to as display only").
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
/* A server instant (timestamptz as ISO text) in ms, or null. */
const at = (v) => { const ms = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null; };

/** Why a run ends, as the server names it (player_training.stop_reason). */
export const STOP_REASONS = Object.freeze(['stop_after', 'keep_gold', 'stopped', 'hunt', 'switched', 'feature_off', 'catalogue']);

function settingsOf(s) {
  if (!isObj(s) || !word(s.skill)) return null;
  return Object.freeze({ skill: s.skill, place: word(s.place) || 'yard', hours: nat(s.stop_after_h), keep: nat(s.keep_gold) ?? 0 });
}

function runOf(r) {
  if (!isObj(r) || !word(r.skill)) return null;
  const since = at(r.since), settledTo = at(r.settled_to);
  if (since === null || settledTo === null) return null;
  return Object.freeze({ skill: r.skill, place: word(r.place) || 'yard', since, settledTo, stopAt: at(r.stop_at),
    keep: nat(r.keep_gold) ?? 0, level: nat(r.level), ms: nat(r.ms) ?? 0, xp: nat(r.xp) ?? 0, gold: nat(r.gold) ?? 0 });
}

function lastStopOf(l) {
  if (!isObj(l) || !STOP_REASONS.includes(l.reason) || !word(l.skill)) return null;
  return Object.freeze({ reason: l.reason, at: at(l.at), skill: l.skill, ms: nat(l.ms) ?? 0, xp: nat(l.xp) ?? 0, gold: nat(l.gold) ?? 0 });
}

/**
 * The section, checked field by field and frozen, or null when the server did not send it (the switch is off): then nothing of
 * the yard is shown. A section whose rates are not the server's shape is null too: the window never invents a rate.
 * @returns {null | {open: boolean, level: number, minLevel: number, xpH: number, goldH: number, skills: string[],
 *   hours: {min: number|null, max: number|null}, keepMax: number|null, settings: object|null, run: object|null, lastStop: object|null}}
 */
export function trainingOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('training') : undefined;
  if (!isObj(s)) return null;
  const level = nat(s.level), minLevel = nat(s.min_level), xpH = nat(s.xp_h), goldH = nat(s.gold_h);
  if (!level || minLevel === null || xpH === null || goldH === null) return null;
  const sa = isObj(s.stop_after) ? s.stop_after : {};
  return Object.freeze({
    open: s.open === true, level, minLevel, xpH, goldH,
    skills: Object.freeze((Array.isArray(s.skills) ? s.skills : []).filter(word).slice(0, 16)),
    hours: Object.freeze({ min: nat(sa.min), max: nat(sa.max) }),
    keepMax: nat(s.keep_max),
    settings: settingsOf(s.settings),
    run: runOf(s.run),
    lastStop: lastStopOf(s.last_stop),
  });
}

/** Is the hero on the yard now, by the server's pointer (state.active_kind)? True even while the switch is off: a stop is always allowed. */
export function trainingNow(cs) {
  const st = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return isObj(st) && st.active_kind === 'training';
}

/**
 * The run's time left (ms) at `serverNowMs`, or null when it runs until stopped (or nothing runs). Display only: the server
 * stops it at its own stop_at whatever this says. Never under 0.
 */
export function runLeftMs(run, serverNowMs) {
  if (!run || run.stopAt === null || !Number.isFinite(serverNowMs)) return null;
  return Math.max(0, run.stopAt - serverNowMs);
}
