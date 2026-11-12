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
import { huntOf, partyOf, analyzerOf } from '../session/hunt-sections.js?v=0.2.124';
import { roleIdOf } from '../session/party-sections.js?v=0.2.124';
import { monsterName } from '../shell/widgets/bits.js?v=0.2.124';
import { explainDeaths } from './death-explain.js?v=0.2.124';
import { createRecorder, endedSessionOf, buildSummary, withSummary } from './summary-model.js?v=0.2.124';

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
    /* Recorded on an earlier page: it has already had its moment (summaryFromEarlierPage). */
    if (summariesOf(cs).some((x) => x.id === s.id)) { a.earlier = s.id; return; }
    const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf }) : { deaths: [] };
    const deaths = ex.deaths.map((f) => f.lines.join(' '));
    a.fresh = s.id;
    a.recorded = { id: s.id, at: Date.now() };
    cs.setResidue('huntSummaries', withSummary(summariesOf(cs), buildSummary(s, analyzerOf(cs), deaths, roleIdOf(cs))));
  });
  return a;
}

/* How long a summary must have been up for its moment to count when the page is left. */
const SUMMARY_READ_MS = 8000;

/** The page is being left (not only hidden): a summary recorded this moment has not had its moment, so the next load opens it (played 2026-11-04: a reload 0.7 s
    after Play, on a hunt that ended away, left no summary and no bar to find it by). A closed one is the player's and stays closed. Display state only. */
export function forgetUnreadSummary(cs) {
  const a = ATTACHED.get(cs);
  const r = a && a.recorded;
  if (!r || a.closed === r.id || Date.now() - r.at >= SUMMARY_READ_MS) return false;
  a.recorded = null;
  return cs.setResidue('huntSummaries', summariesOf(cs).filter((x) => x.id !== r.id));
}

/** True when this ended hunt's summary has had its moment, so the hunt bar stays out of town: it was recorded before this page loaded and won't open
    by itself, so a reload must not stand the bar back up (the panel 2026-11-01: the Havora / Town / Home strip gone until Summary), or it was closed
    (summaryClosedBy). Kept on the CHARACTER: a switch of the viewed hero remounts the shell, and the bar came back with every switch. */
export function summaryDone(cs, sessionId) { const a = attach(cs); return a.earlier === sessionId || a.closed === sessionId; }

/** Has the player closed this ended hunt's summary? (Its alert line then has nothing left to say: src/shell/alerts.js.) */
export function summaryClosedFor(cs, sessionId) { const a = ATTACHED.get(cs); return !!a && a.closed === sessionId; }

/** The player closed the summary, or left it open and went to another hero. A closed summary stays closed: its record lands now, as a dismissed
    death does (death-popup.js), so a reload inside the residue's debounce can't lose it and open the summary again. */
export function summaryClosedBy(cs) {
  const h = huntOf(cs);
  if (!h || !h.ended) return;
  attach(cs).closed = h.sessionId;
  if (typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});
}

/** True once per freshly ended hunt: the shell opens the window when it is. */
export function takeFresh(cs) {
  const a = attach(cs);
  const f = a.fresh;
  a.fresh = null;
  return f !== null;
}
