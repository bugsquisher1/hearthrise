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
//     last_stop: { reason, skill, at, session, xp, paid, level, from } | null,   the last ended session and what it came to
//     dummy: { needs, has_home, owned: [skill], ladder: [gold], next_price, busy },   the account's house dummy
//     rate: { xp_h, xp_h_item, boost_pm, min_level, level },          THE FIXED RATE (2027-04-23-training-gear.sql, Tyler 2026-11-14)
//     gear: [{ skill, banked_ms, on, bag: [{ item, hours, bound, qty }], stored: [...] }],   the hero's training items, a skill each
//     offers: [{ item, skill, hours, price }],                         the Arms Master's gold rows
//     shop: { on, today, max } }                                        the items' switch for this account and its day's buys
//   (a run also says boosted and boost_ms: its skill's item time).
// Every envelope replaces it, and nothing here holds a number of its own (CLAUDE.md §6). The one thing drawn between
// two answers is the running clock: the server's `since` against the server's clock as the session measures it.
// ════════════════════════════════════════════════════════════════════════
import { trainingOf as trainingHuntOf } from '../data/training.js?v=0.2.138';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.138';
import { t } from '../render/player-text.js?v=0.2.138';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * What a training hunt does, in words: { doing: "Training Melee", at: "at the Training Yard" | "on your dummy at home" }, or null
 * for any other hunt. One phrase for the hero's tab line (party-sections.js assignmentOf) and the hunt bar (src/shell/training-now.js).
 */
export function trainingPhrase(huntId) {
  const tr = typeof huntId === 'string' ? trainingHuntOf(huntId) : null;
  if (!tr) return null;
  const skill = (SKILLS_DEF[tr.skill] && SKILLS_DEF[tr.skill].name) || tr.skill;
  return { doing: t('training.bar_doing', { skill }), at: t(tr.place === 'house' ? 'training.bar_at_house' : 'training.bar_at_yard') };
}
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
  return Object.freeze({ skill: r.skill, where: PLACES.includes(r.where) ? r.where : 'yard', since: at(r.since), feeH: nat(r.fee_h) ?? 0, paid: nat(r.paid) ?? 0,
    boosted: r.boosted === true, boostMs: nat(r.boost_ms) ?? 0 });
}

function rateOf(r) {
  if (!isObj(r) || nat(r.xp_h) === null || nat(r.xp_h_item) === null) return null;
  return Object.freeze({ xpH: r.xp_h, xpHItem: r.xp_h_item, boostPm: nat(r.boost_pm), minLevel: nat(r.min_level), level: nat(r.level) });
}

/* One sealed stack: the server's item id, its hours, whether it is the Crowns store's bound copy, how many. */
function heldOf(h) {
  if (!isObj(h) || !word(h.item) || !(nat(h.hours) > 0) || !(nat(h.qty) > 0)) return null;
  return Object.freeze({ item: h.item, hours: h.hours, bound: h.bound === true, qty: h.qty });
}

function gearOf(g) {
  if (!isObj(g) || !word(g.skill)) return null;
  const list = (v) => Object.freeze((Array.isArray(v) ? v : []).slice(0, 8).map(heldOf).filter(Boolean));
  return Object.freeze({ skill: g.skill, bankedMs: nat(g.banked_ms) ?? 0, on: g.on !== false, bag: list(g.bag), stored: list(g.stored) });
}

function offerOf(o) {
  if (!isObj(o) || !word(o.item) || !word(o.skill) || !(nat(o.hours) > 0) || !(nat(o.price) > 0)) return null;
  return Object.freeze({ item: o.item, skill: o.skill, hours: o.hours, price: o.price });
}

function shopOf(s) {
  if (!isObj(s)) return null;
  return Object.freeze({ on: s.on === true, today: nat(s.today) ?? 0, max: nat(s.max) });
}

/* The last ended session: why, which skill, when, and what it came to (2027-04-23-training-gear.sql: `session` its id, `xp` the
   skill's XP its tally holds, `paid` its fee rows' gold, `level` / `from` the skill's level now and before that XP; null where unsent). */
function lastStopOf(l) {
  if (!isObj(l) || !word(l.reason) || !word(l.skill)) return null;
  const sid = typeof l.session === 'string' && l.session && l.session.length <= 64 ? l.session : null;
  return Object.freeze({ reason: l.reason, skill: l.skill, at: at(l.at), session: sid, xp: nat(l.xp), paid: nat(l.paid), level: nat(l.level), from: nat(l.from) });
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
    rate: rateOf(s.rate),
    gear: Object.freeze((Array.isArray(s.gear) ? s.gear : []).slice(0, 16).map(gearOf).filter(Boolean)),
    offers: Object.freeze((Array.isArray(s.offers) ? s.offers : []).slice(0, 32).map(offerOf).filter(Boolean)),
    shop: shopOf(s.shop),
  });
}

/** The hero's training items for one skill (bank, switch, sealed ones), or null. Pure. */
export const gearFor = (tr, skill) => (tr && tr.gear.find((g) => g.skill === skill)) || null;

/** The Arms Master's gold rows for one skill, smallest first. Pure. */
export const offersFor = (tr, skill) => (tr ? tr.offers.filter((o) => o.skill === skill) : []);

/** The server's quote for one skill, or null. Pure. */
export const quoteFor = (tr, skill) => (tr && tr.quotes.find((q) => q.skill === skill)) || null;

/** How long the run has gone (ms) at `serverNowMs`; display only, never under 0. */
export function runForMs(run, serverNowMs) {
  if (!run || !Number.isFinite(serverNowMs)) return 0;
  return Math.max(0, serverNowMs - run.since);
}
