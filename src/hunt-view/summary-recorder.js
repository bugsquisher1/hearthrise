// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/summary-recorder.js — WATCHES ONE CHARACTER'S HUNTS FOR THE SUMMARY (QoL 8).
//
// Attached by the CharacterSession when it is made (attach(cs)), BEFORE the
// first envelope, so no event the timeline plays is missed: the scene and the
// log also drain that timeline, and a late subscriber would see nothing.
// It keeps the newest events of the current hunt (summary-model.js
// createRecorder, de-duplicated by event id), and when the session's record
// says it ended it stores the summary card ONCE in the display-only residue
// field `huntSummaries`, with the death explanation (death-explain.js) taken
// from those events. It authors no number: it reads the server's sections.
// ════════════════════════════════════════════════════════════════════════
import { huntOf, partyOf, analyzerOf } from '../session/hunt-sections.js?v=0.2.64';
import { monsterName } from '../shell/widgets/bits.js?v=0.2.64';
import { explainDeaths } from './death-explain.js?v=0.2.64';
import { createRecorder, endedSessionOf, buildSummary, withSummary } from './summary-model.js?v=0.2.64';

const ATTACHED = new WeakMap();

/** Who a unit is, off the sections the character holds right now (the log's rule: heroes by party, monsters by pose kind). */
function namerOf(cs) {
  return {
    name(u) {
      const h = huntOf(cs), p = partyOf(cs);
      const m = p && p.members.find((x) => x.unit === u);
      if (m) return m.name;
      if (h && h.hero.unit === u && h.hero.name) return h.hero.name;
      const x = h && h.units.get(u);
      return (x && (x.name || (x.kind && monsterName(x.kind)))) || 'Someone';
    },
  };
}

/** The mana of the fallen hero and of its party, for "Druid at 4 mana". */
function vitalsOf(cs, u) {
  const p = partyOf(cs);
  if (!p) return { self: null, others: [] };
  const self = p.members.find((m) => m.unit === u);
  return {
    self: self ? { mana: self.mana, manaMax: self.manaMax } : null,
    others: p.members.filter((m) => m.unit !== u && m.mana !== null && m.manaMax !== null).map((m) => ({ name: m.name, mana: m.mana, manaMax: m.manaMax })),
  };
}

export const whoOf = (u, fall) => {
  const v = fall.vitals || { self: null, others: [] };
  return { name: fall.an || 'Someone', vitals: v.self || undefined, others: v.others };
};

/** The summaries the residue holds for this character, newest first. */
export function summariesOf(cs) {
  const r = cs && cs.record && cs.record.residue;
  return r && Array.isArray(r.huntSummaries) ? r.huntSummaries : [];
}

/** The newest deaths of the current hunt, explained (memoised on what the recorder holds). */
export function liveDeaths(a) {
  const evs = a.rec.events();
  const sig = evs.length + ':' + (evs.length ? evs[evs.length - 1].atMs : 0);
  if (a.liveSig !== sig) { a.liveSig = sig; a.live = explainDeaths(evs, { whoOf }); }
  return a.live;
}

/**
 * Start recording a character's hunts (idempotent). Safe to call from any
 * paint: the first call subscribes, later calls are a lookup.
 */
export function attach(cs) {
  let a = ATTACHED.get(cs);
  if (a) return a;
  const names = namerOf(cs);
  a = { rec: createRecorder({ names }), sid: null, done: new Set(), fresh: null, live: null, liveSig: '' };
  ATTACHED.set(cs, a);
  cs.timeline.subscribe((ev) => { a.rec.add(ev, (u) => vitalsOf(cs, u)); });
  cs.subscribe(() => {
    const s = endedSessionOf(cs);
    if (!s) return;
    if (!s.ended) { if (a.sid !== s.id) { a.rec.reset(); a.sid = s.id; a.live = null; a.liveSig = ''; } return; }
    if (a.done.has(s.id)) return;
    a.done.add(s.id);
    if (summariesOf(cs).some((x) => x.id === s.id)) return;
    const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf }) : { deaths: [] };
    const deaths = ex.deaths.map((f) => f.lines.join(' '));
    a.fresh = s.id;
    cs.setResidue('huntSummaries', withSummary(summariesOf(cs), buildSummary(s, analyzerOf(cs), deaths)));
  });
  return a;
}

/** True once per freshly ended hunt: the shell opens the window when it is. */
export function takeFresh(cs) {
  const a = attach(cs);
  const f = a.fresh;
  a.fresh = null;
  return f !== null;
}
