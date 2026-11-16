// ════════════════════════════════════════════════════════════════════════
// src/session/hunt-after-sections.js — WHEN THE HUNT ENDS, AS THE SERVER HOLDS IT.
//
// The one reader of the envelope's `hunt_after` section (hr_hunt_after_section, 2027-04-25-hunt-itinerary.sql;
// Tyler 2026-11-15, the itinerary): this hero's choice for what it does when a hunt ends on its own, the job "back to
// the job" means right now, and its newest hunt's own frozen choice with what came of it. Checked field by field and
// frozen; every envelope replaces it (CLAUDE.md §6). Nothing here is spendable: the server runs the hunt's choice,
// prices a training start and counts what a bench has left.
//
//   huntAfterOf(cs) -> { choice, skill, graceS, job: { kind, id, left } | null,
//                        now: { session, choice, skill } | null (the running hunt's frozen choice),
//                        last: { session, choice, skill, done: { state, why, kind, id, left, skill, place,
//                                fee, purse, need } | null } | null (the newest ENDED hunt's) } | null (no section yet)
// PURE.
// ════════════════════════════════════════════════════════════════════════

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const WORD = /^[a-z0-9_]{1,64}$/;
const word = (v) => (typeof v === 'string' && WORD.test(v) ? v : null);
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

/* What came of a hunt's choice, as the server wrote it on the hunt. */
const AFTER_STATES = Object.freeze(['resumed', 'waited', 'pending', 'started']);

function jobOf(j) {
  if (!isObj(j) || !word(j.kind) || !word(j.id)) return null;
  return Object.freeze({ kind: j.kind, id: j.id, left: nat(j.left) });
}

function doneOf(d) {
  if (!isObj(d) || !AFTER_STATES.includes(d.state)) return null;
  return Object.freeze({ state: d.state, why: word(d.why), kind: word(d.kind), id: word(d.id), left: nat(d.left), skill: word(d.skill),
    place: word(d.place), fee: nat(d.fee), purse: nat(d.purse), need: nat(d.need) });
}

function planOf(l) {
  if (!isObj(l) || typeof l.session !== 'string' || !word(l.choice)) return null;
  return Object.freeze({ session: l.session, choice: l.choice, skill: word(l.skill), done: doneOf(l.done) });
}

/** The section, or null when the server has not sent it (a server older than the itinerary: the page shows no control). */
export function huntAfterOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('hunt_after') : undefined;
  if (!isObj(s) || !word(s.choice)) return null;
  return Object.freeze({ choice: s.choice, skill: word(s.skill), graceS: nat(s.grace_s), job: jobOf(s.job), now: planOf(s.now), last: planOf(s.last) });
}
