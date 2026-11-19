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
import { huntOf, partyOf, analyzerOf } from '../session/hunt-sections.js?v=0.2.141';
import { roleIdOf } from '../session/party-sections.js?v=0.2.141';
import { monsterName } from '../shell/widgets/bits.js?v=0.2.141';
import { explainDeaths } from './death-explain.js?v=0.2.141';
import { createRecorder, endedSessionOf, buildSummary, withSummary, withPastSummary, withTrainingStop, atStart, levelLine, trainedIn } from './summary-model.js?v=0.2.141';
import { trainingOf } from '../session/training-sections.js?v=0.2.141';
import { huntAfterOf } from '../session/hunt-after-sections.js?v=0.2.141';
import { trainingOf as trainedBy } from '../data/training.js?v=0.2.141';
import { levelOf } from '../session/character-sections.js?v=0.2.141';
import { skillLevelsOf } from '../session/item-sections.js?v=0.2.141';
import { runRulesOf } from '../data/tower.js?v=0.2.141';
import { t } from '../render/player-text.js?v=0.2.141';

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

/* HOW A FALL IS SAID on a hunt: the default (death-explain.js "died", "The killing blow"), and on a run ground its own, since a death
   there costs nothing (session-modes.js `tower`, `catacomb`): the Burning Tower's "Ashby was spat out", the Catacombs' "Ashby was carried
   up" (Keeper Dunn carries the hero up), each with "The last blow". */
export function fallWordsOf(hunt) {
  const run = runRulesOf(hunt);
  if (!run) return undefined;
  return { fell: (name) => (run.family === 'catacomb' ? t('catacomb.fell', { name }) : t('tower.fell', { name })), blow: t('tower.fell_blow') };
}

/** The summaries the residue holds for this character, newest first. */
export function summariesOf(cs) {
  const r = cs && cs.record && cs.record.residue;
  return r && Array.isArray(r.huntSummaries) ? r.huntSummaries : [];
}

/** The newest deaths of the current hunt, explained (memoised on what the recorder holds). */
export function liveDeaths(a) {
  const evs = a.rec.events();
  const sig = evs.length + ':' + (evs.length ? evs[evs.length - 1].atMs : 0);
  if (a.liveSig !== sig) { a.liveSig = sig; a.live = explainDeaths(evs, { whoOf, words: fallWordsOf(a.hunt) }); }
  return a.live;
}

/* A TRAINING CARD stored before the server's last stop for it landed (the `training` section can come after the `hunt` one that
   ended it): its fee and levels go on once they do (summary-model.js withTrainingStop). */
function fillTraining(cs, stop) {
  const filled = withTrainingStop(summariesOf(cs)[0], stop);
  if (filled) cs.setResidue('huntSummaries', withSummary(summariesOf(cs), filled));
}

/* THE HUNT'S START, STAMPED ONCE (UI audit 2026-11-18 #1): the server's Level and skill levels while the session has paid nothing yet
   (summary-model.js atStart), so the end card can say "Level 9 → 10" from two server answers. A session first read mid-hunt is not
   stamped: its card names the Level it ended at and no start. Display state only (residue `huntStart`). */
const startOf = (cs) => { const r = cs && cs.record && cs.record.residue && cs.record.residue.huntStart; return r && typeof r.s === 'string' ? r : null; };
function stampStart(cs, s) {
  const was = startOf(cs), lv = levelOf(cs);
  if ((was && was.s === s.id) || !lv || !atStart(s) || typeof cs.setResidue !== 'function') return;
  const sk = {};
  for (const [id, r] of Object.entries(skillLevelsOf(cs) || {})) sk[id] = r.level;
  cs.setResidue('huntStart', { s: s.id, lv: lv.level, sk });
}

/**
 * Start recording a character's hunts (idempotent). Safe to call from any
 * paint: the first call subscribes, later calls are a lookup.
 */
export function attach(cs) {
  let a = ATTACHED.get(cs);
  if (a) return a;
  const names = namerOf(cs);
  /* `prevStart`: the start stamp a newer session's replaced, `pastDone`: the earlier sessions recordPast has judged (recordPast) */
  a = { rec: createRecorder({ names }), sid: null, hunt: null, done: new Set(), fresh: null, live: null, liveSig: '', prevStart: null, pastDone: new Set() };
  ATTACHED.set(cs, a);
  cs.timeline.subscribe((ev) => { a.rec.add(ev, (u) => vitalsOf(cs, u)); });
  cs.subscribe(() => {
    const s = endedSessionOf(cs);
    if (!s) return;
    if (!s.ended) {
      if (a.sid !== s.id) { a.started = a.sid !== null || a.done.size > 0; a.rec.reset(); a.sid = s.id; a.hunt = s.hunt; a.live = null; a.liveSig = ''; }
      const was = startOf(cs);
      if (was && was.s !== s.id) a.prevStart = was.s;
      stampStart(cs, s);
      return;
    }
    const tr = trainingOf(cs);
    const stop = tr ? tr.lastStop : null;
    if (a.done.has(s.id)) return fillTraining(cs, stop);
    a.done.add(s.id);
    /* Recorded on an earlier page: it has already had its moment (summaryFromEarlierPage). */
    if (summariesOf(cs).some((x) => x.id === s.id)) { a.earlier = s.id; return; }
    const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf, words: fallWordsOf(s.hunt) }) : { deaths: [] };
    const deaths = ex.deaths.map((f) => f.lines.join(' '));
    a.fresh = s.id;
    a.recorded = { id: s.id, at: Date.now() };
    const an = analyzerOf(cs);
    const line = levelLine(s.id, startOf(cs), levelOf(cs), skillLevelsOf(cs), trainedIn(s, an));
    cs.setResidue('huntSummaries', withSummary(summariesOf(cs), buildSummary(s, an, deaths, roleIdOf(cs), stop, line)));
  });
  return a;
}

/**
 * EVERY HUNT REACHES EARLIER HUNTS (post-140 audit C4: both Wickstead days and the Glade death never did, the list filled with yard rows).
 * attach() keeps a card when the `hunt` section shows its session ended, but a hunt that ended with the page closed and was followed by a
 * training session (its plan, src/data/hunt-after.js) is never the section's again. The server still names it: hunt_after.last while the
 * yard runs (the newest ended session), and this page's start stamp (residue huntStart), or the one a newer start replaced. These are the
 * sessions the list lacks; the alert centre reads each once (src/shell/alerts.js, src/session/past-hunt.js) and hands it to recordPast.
 * @returns {string[]}
 */
export function pastToRead(cs) {
  const s = endedSessionOf(cs);
  if (!s) return [];
  /* every CharacterSession is attached as it is made (observeSessions); a reader with no recorder has no replaced stamp to name */
  const a = ATTACHED.get(cs), have = new Set(summariesOf(cs).map((x) => x.id)), after = huntAfterOf(cs), st = startOf(cs);
  const ids = [after && after.last ? after.last.session : null, st ? st.s : null, a ? a.prevStart : null];
  return [...new Set(ids)].filter((id) => typeof id === 'string' && id !== s.id && !have.has(id) && !(a && a.pastDone.has(id)));
}

/**
 * An earlier session's card from the server's answer for it (`an`: past-hunt.js, the analyzer's reading with its `session` facts): an
 * ended hunt, never a training session (its own newest card is kept by attach, older ones add nothing). The server's tally only: no Level
 * line and no death lines (this page saw none of its events), Hunt again only when the server named the setup. Placed by its end time and
 * never opened by itself (the away card is the return's notice). True when stored. Display only.
 */
export function recordPast(cs, id, an) {
  const a = ATTACHED.get(cs);
  if (a) a.pastDone.add(id);
  const f = an && an.session;
  if (!f || f.id !== id || !an.ended || !f.hunt || trainedBy(f.hunt) || summariesOf(cs).some((x) => x.id === id) || typeof cs.setResidue !== 'function') return false;
  const s = { id, ended: true, hunt: f.hunt, reason: f.reason, forfeit: false, by: null, why: null, preset: f.preset, hoursLimit: f.hoursLimit,
    enteredMs: f.enteredMs, endedMs: f.endedMs, bag: [], tally: null, died: null, tier: f.tier, fight: null, call: null };
  const card = buildSummary(s, an, [], roleIdOf(cs), null, null);
  return !!card && cs.setResidue('huntSummaries', withPastSummary(summariesOf(cs), card)) === true;
}

/**
 * THE HUNT ON NOW, AS ITS CARD (UI audit 2026-11-18: Summary pressed in a hunt showed the hunt before it). The open session read the way
 * its end card will be (buildSummary over the server's analyzer, its Level line from the start stamp), with `live` and the server's start
 * time `since`; never stored, and replaced by every envelope. Its falls are the window's "Just now" lines (liveDeaths), not the card's.
 * Null with no hunt open. Display only.
 */
export function liveSummaryOf(cs) {
  const s = endedSessionOf(cs);
  if (!s || s.ended) return null;
  const an = analyzerOf(cs);
  const line = levelLine(s.id, startOf(cs), levelOf(cs), skillLevelsOf(cs), trainedIn(s, an));
  const card = buildSummary(s, an, [], roleIdOf(cs), null, line);
  return card ? Object.assign(card, { live: true, since: s.enteredMs }) : null;
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

/** True once when a NEW hunt starts on this page after another (playtest v0.2.127: the last hunt's summary stayed open over
    the next): the shell closes the summary when it is. Display state only. */
export function takeStarted(cs) {
  const a = attach(cs);
  const f = a.started === true;
  a.started = false;
  return f;
}

/** True once per freshly ended hunt: the shell opens the window when it is. */
export function takeFresh(cs) {
  const a = attach(cs);
  const f = a.fresh;
  a.fresh = null;
  return f !== null;
}
