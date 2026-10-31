// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/report.js — REPORT A PROBLEM: ONE TEXT BOX, SENT STRAIGHT TO THE TEAM.
//
// Reached from the launcher row and from Settings (Help). The player writes
// what went wrong; the game's own details ride along (src/shell/report-model.js)
// and the report goes through the bug-report bridge, which names the reporter
// from the verified token, stores it, rate-limits it and relays it to the team
// (node tools/triage-bugs.mjs list). Nothing to copy or paste.
//
// It never blocks play: the send is one async ask; the window can close while
// it runs. States (data-state on .rp): edit → sending → sent | failed.
// Built once; patched in place (the button follows the text and the state).
// ════════════════════════════════════════════════════════════════════════
import { reportBody, worldSnapshot } from '../report-model.js?v=0.2.78';
import { startDiagnostics } from '../../net/diagnostics.js?v=0.2.78';
import { attr, cls, prop, text } from '../../render/paint.js?v=0.2.78';

/* What the player reads after the bridge answers, by its status (or the link's). */
const SAID = Object.freeze({
  sent: 'Sent. Thank you, the team reads every report.',
  rate_limited: 'You have sent several reports in a short time. Try again in {m}.',
  unauthenticated: 'Your sign-in has ended. Reload the page, sign in and send it again.',
  payload_too_large: 'That was too big to send. Untick the picture and try again.',
  bad_request: 'That report could not be read. Write a line about the problem and try again.',
  other: 'It did not send. Check your connection and try again; your text is still here.',
});
const SENT = new Set(['accepted', 'stored', 'duplicate']);

/** The line the window shows for an answer. Pure. */
function reportWords(r) {
  if (r.ok || SENT.has(r.status)) return SAID.sent;
  if (r.status === 'rate_limited') {
    const m = Math.max(1, Math.ceil((r.retryAfterS || 60) / 60));
    return SAID.rate_limited.replace('{m}', m === 1 ? 'a minute' : m + ' minutes');
  }
  if (r.status === 'no_token') return SAID.unauthenticated;
  return SAID[r.status] || SAID.other;
}

const newKey = () => {
  const c = globalThis.crypto;
  return c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now() + '-' + Math.floor(Math.random() * 1e9);
};

/** The skeleton (built once). */
export function renderReport() {
  return '<div class="rp" data-state="edit">'
    + '<p class="hs-note">Tell us what went wrong: what you did, what you expected, and what happened instead.</p>'
    + '<textarea class="rp-text" data-hs-act="type" rows="6" maxlength="4000" aria-label="What went wrong"'
    + ' placeholder="I clicked Leave hunt and the screen froze for a few seconds..."></textarea>'
    + '<label class="rp-shot"><input type="checkbox" class="rp-shot-on" checked> Include a picture of the game view</label>'
    + '<p class="hs-note rp-what">Your game version, this character, its hunt, recent errors and your screen size are sent with it.</p>'
    + '<div class="rp-foot"><button type="button" class="hw-primary is-on" data-hs-act="send">Send report</button>'
    + '<p class="rp-said" role="status" aria-live="polite"></p></div></div>';
}

renderReport.events = ['input'];

renderReport.patch = function patchReport(body, ctx) {
  const root = body.querySelector('.rp');
  if (!root) return;
  const state = root.getAttribute('data-state');
  const box = root.querySelector('.rp-text');
  const btn = root.querySelector('[data-hs-act="send"]');
  attr(root.querySelector('.rp-shot'), 'hidden', ctx.isPhone());   // phones send text only (b316)
  prop(btn, 'disabled', state === 'sending' || !box.value.trim() || !ctx.account);
  text(btn, state === 'sending' ? 'Sending…' : 'Send report');
  cls(btn, 'is-sending', state === 'sending');
  prop(box, 'readOnly', state === 'sending');
};

/* One send: the details are read now, the answer lands on whichever copy of the window is open. */
async function send(ctx, root) {
  const box = root.querySelector('.rp-text');
  if (root.getAttribute('data-state') === 'sending' || !ctx.account || !box.value.trim()) return;
  const idem = root.getAttribute('data-idem') || newKey();
  attr(root, 'data-idem', idem);
  attr(root, 'data-state', 'sending');
  text(root.querySelector('.rp-said'), '');
  const doc = ctx.doc;
  const win = doc.defaultView;
  const diag = startDiagnostics(win);
  const fps = await diag.fps(500);
  const shot = !ctx.isPhone() && root.querySelector('.rp-shot-on').checked ? worldSnapshot(doc) : null;
  const scr = win.screen || {};
  const body = reportBody({
    text: box.value, character: ctx.character, windows: ctx.wm.openIds(), diag, fps, shot, idem,
    view: { w: win.innerWidth, h: win.innerHeight, screenW: scr.width, screenH: scr.height, dpr: win.devicePixelRatio,
      rootFont: win.getComputedStyle(doc.documentElement).fontSize, phone: ctx.isPhone(), ua: win.navigator.userAgent },
  });
  let r;
  try { r = await ctx.account.reportProblem(body); } catch (e) { r = { ok: false, status: 'network' }; }
  const sent = r.ok || SENT.has(r.status);
  const now = doc.querySelector('[data-hs-win="report"] .rp') || root;
  attr(now, 'data-state', sent ? 'sent' : 'failed');
  if (sent) { attr(now, 'data-idem', null); prop(now.querySelector('.rp-text'), 'value', ''); }
  text(now.querySelector('.rp-said'), reportWords(r));
  renderReport.patch(now.parentNode, ctx);
}

renderReport.act = function actReport(ctx, body, action, ev) {
  const root = body.querySelector('.rp');
  if (!root) return;
  if (action === 'type' && ev.type === 'input') {
    /* New words are a new report: a fresh key, and the last answer's line goes. A retry
       with the words unchanged keeps its key, so a report whose answer was lost is not filed twice. */
    if (root.getAttribute('data-state') !== 'sending') {
      attr(root, 'data-idem', null);
      text(root.querySelector('.rp-said'), '');
      attr(root, 'data-state', 'edit');
    }
  } else if (action === 'send' && ev.type === 'click') {
    send(ctx, root);
  } else return;
  renderReport.patch(body, ctx);
};
