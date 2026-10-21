// ════════════════════════════════════════════════════════════════════════
// src/shell/report-model.js — WHAT A PLAYER'S PROBLEM REPORT CARRIES.
//
// The Report a problem window (src/shell/windows/report.js) sends the body built
// here through the bug-report bridge (supabase/functions/bug-report-bridge):
//   summary       the first line of what the player wrote (the bridge needs one)
//   description   all of it
//   build         BUILD.version
//   state         what the Coordinator needs to find it, read from what the
//                 client already holds: the device and screen, the open
//                 windows, the character (slot, name), its envelope (version
//                 and age on the server's clock), its hunt (id, ground, session,
//                 party id and seats, the live engine's state) and this load's
//                 frame rate, stalls and long tasks (src/net/diagnostics.js)
//   errors        the last REPORT_LIMITS.errors console errors and warnings
//   screenshot    optional: the World canvas as a JPEG (desktop only)
//   idem_key      one per report, so a retry after a lost answer is not filed twice
// No identity field: the bridge names the reporter from the verified token.
// Every bound is the bridge's own (index.ts MAX_*), so nothing is cut there.
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.23';
import { huntOf } from '../session/hunt-sections.js?v=0.2.23';
import { partyMembershipOf, huntName } from '../session/party-sections.js?v=0.2.23';

export const REPORT_LIMITS = Object.freeze({
  summary: 200, text: 4000, errors: 20, errorMsg: 500,
  stateChars: 7500,          // the bridge replaces a state over 8000 characters with {_truncated}
  shotWidth: 1280, shotBytes: 1400000, shotQuality: 0.72,   // the bridge refuses an image over 1.5 MB
});

const short = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

/* The open hunt as the report states it, or null in town. */
function huntState(cs) {
  const h = cs ? huntOf(cs) : null;
  if (!h || h.ended) return null;
  const p = partyMembershipOf(cs);
  const live = cs.live || {};
  const call = (fn) => (typeof fn === 'function' ? fn() : null);
  return {
    id: h.huntId, ground: h.huntId ? huntName(h.huntId) : null, session: h.sessionId,
    party: p ? { id: p.id, seats: p.seats.map((s) => ({ seat: s.seat, name: short(s.name, 40) })) } : null,
    live: { running: call(live.running), ended: call(live.ended), stalled: call(live.stalled), swing: call(live.swingIndex),
      stats: typeof cs.liveStats === 'function' ? cs.liveStats() : null },
  };
}

/* The character's envelope: its version and how old the server's last word is, on the server's clock. */
function envelopeState(cs) {
  if (!cs || !cs.record) return null;
  const stamp = cs.read('now');
  const at = Date.parse(String(stamp || ''));
  const told = typeof cs.serverNow === 'function' ? cs.serverNow() : null;
  const now = Number.isFinite(told) ? told : Date.now();
  return { version: cs.record.version, at: short(stamp, 40), age_s: Number.isFinite(at) ? Math.round((now - at) / 1000) : null };
}

/**
 * The bridge's body for one report. Pure: everything it reads is passed in.
 * @param {object} o
 * @param {string} o.text        what the player wrote
 * @param {object|null} o.character  the viewed CharacterSession
 * @param {{w,h,screenW,screenH,dpr,rootFont,phone,ua}} o.view
 * @param {string[]} o.windows   the open windows' ids
 * @param {{recent: Function, perf: Function}} o.diag   src/net/diagnostics.js
 * @param {number|null} o.fps
 * @param {string|null} o.shot   a data: URL, or null
 * @param {string} o.idem
 */
export function reportBody(o) {
  const text = String(o.text || '').trim().slice(0, REPORT_LIMITS.text);
  const first = text.split(/\r?\n/)[0].trim();
  const summary = first.length > REPORT_LIMITS.summary ? first.slice(0, REPORT_LIMITS.summary - 1) + '…' : first;
  const v = o.view || {};
  const cs = o.character || null;
  const perf = o.diag ? o.diag.perf() : {};
  const state = {
    device: v.phone ? 'phone' : 'desktop',
    orientation: v.w >= v.h ? 'landscape' : 'portrait',
    activeTab: (o.windows || []).filter((id) => id !== 'report').join(', ') || 'world',
    viewport: v.w + 'x' + v.h,
    metrics: { screen: v.screenW + 'x' + v.screenH, dpr: v.dpr, rootFont: v.rootFont },
    browser: short(v.ua, 160),
    character: cs ? { slot: cs.slot, name: short(cs.read('name'), 40) } : null,
    envelope: envelopeState(cs),
    hunt: huntState(cs),
    perf: { fps: o.fps, stalls: perf.stalls, longest_stall_ms: perf.longestStallMs, long_tasks: perf.longTasks, longest_task_ms: perf.longestTaskMs },
  };
  /* Over the bridge's bound, the least needed parts go first; never the whole state. */
  for (const cut of [() => { if (state.hunt) state.hunt.live.stats = null; }, () => { state.browser = null; }, () => { if (state.hunt) state.hunt.party = null; }]) {
    if (JSON.stringify(state).length <= REPORT_LIMITS.stateChars) break;
    cut();
  }
  const errors = (o.diag ? o.diag.recent() : []).slice(-REPORT_LIMITS.errors)
    .map((e) => ({ level: String(e.level).slice(0, 24), msg: String(e.msg).slice(0, REPORT_LIMITS.errorMsg) }));
  const body = { summary, description: text, build: BUILD.version, state, errors, idem_key: String(o.idem || '').slice(0, 64) };
  if (o.shot) body.screenshot = o.shot;
  return body;
}

/** The World canvas as a JPEG data: URL no wider than REPORT_LIMITS.shotWidth, or null (none, blank, too big). */
export function worldSnapshot(doc) {
  try {
    const c = doc.querySelector('canvas.world-canvas');
    if (!c || !c.width || !c.height) return null;
    const k = Math.min(1, REPORT_LIMITS.shotWidth / c.width);
    const out = doc.createElement('canvas');
    out.width = Math.round(c.width * k);
    out.height = Math.round(c.height * k);
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;   // a picture of pixel art, not a blur of it
    g.drawImage(c, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/jpeg', REPORT_LIMITS.shotQuality);
    return /^data:image\/jpeg;base64,/.test(url) && url.length * 0.75 <= REPORT_LIMITS.shotBytes ? url : null;
  } catch (e) { return null; }
}
