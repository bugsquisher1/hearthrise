// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/plan-share.js — SHARE PLAN: THIS HERO'S PLAN AS A CODE, AND A FRIEND'S CODE AS THIS HERO'S PLAN (lane/wn-sh SH).
//
// docs/design/redesign/20-v030-the-roads.md band 5 SH, 17-talent-tree.md section 11 ("Share codes: copy and paste a build"). One
// component: a window on the desktop, a sheet on the phone (the window manager's), reached from the Menu. It is built to be hosted
// elsewhere too (the Roads screen's Build menu, 18-roads-review-ux.md): planShareHtml / patchPlanShare / actPlanShare take any root
// (exported once a second host imports them).
//   YOUR CODE     the plan the server holds for this hero (src/session/plan-share.js heroPlanOf), as a code to copy. Display only
//   PASTE A CODE  Read code decodes it (src/core/plan-code.js: every id checked, a tampered or damaged code refused with a genre label)
//                 into THE EDITOR: one row a part it carries, what it holds beside what this hero holds now. Nothing is sent by reading.
//                 Use this plan sends each changed part as this hero's own intent, one after another (usePlan): the server checks each
//                 and every row changes only from the envelope its answer carries
// Nothing here writes another player's state, and a code carries no number the server takes on trust (CLAUDE.md section 1).
// ════════════════════════════════════════════════════════════════════════
import { decodePlanCode, CODE, CODE_ERRORS } from '../../core/plan-code.js';
import { shareCodeOf, planChanges, usePlan } from '../../session/plan-share.js';
import { huntName } from '../../session/party-sections.js';
import { text, prop, cls, rows, element } from '../../render/paint.js';
import { t } from '../../render/player-text.js';
import { runIntent } from '../intent-words.js';

const SCRATCH = new WeakMap();
/* this hero's editor: the decoded plan (null: none read), the last refusal of a paste, the press state, and the copy line */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { draft: null, error: null, pending: false, msg: '', copied: '' }; SCRATCH.set(cs, s); } return s; };

const LINE_WORDS = Object.freeze({ on: 'away.line_on', off: 'away.line_off', hunt_on: 'away.line_hunt_on', all_home: 'away.line_all_home', mixed: 'away.line_mixed' });

/** A part's value in the player's words (a ground's name, a stance, a line's value, a build's points). Pure. */
function partWords(part, v, points) {
  if (v === null || v === undefined) return '';
  if (part === 'ground') return huntName(v);
  if (part === 'risk') return t('hunts.stance_' + v);
  if (part === 'build') return t('share.build_points', { count: v.spent }) + (Number.isSafeInteger(points) && v.spent > points ? ' · ' + t('share.build_past') : '');
  return Object.prototype.hasOwnProperty.call(LINE_WORDS, v) ? t(LINE_WORDS[v]) : '';
}

/** The row's second line: what this hero holds now when the part is sent, else why it is not. Pure. */
function rowNote(row) {
  if (row.state !== 'send') return t('share.state_' + row.state);
  if (row.part === 'build') return '';
  const now = partWords(row.part, row.from);
  return now ? t('share.now', { value: now }) : t('share.now_none');
}

/** The component's skeleton (built once). */
function planShareHtml() {
  return '<div class="hps">'
    + '<h3 class="hs-sub">' + t('share.head_yours') + '</h3>'
    + '<textarea class="hps-code" rows="2" readonly spellcheck="false" aria-label="' + t('share.head_yours') + '"></textarea>'
    + '<p class="hs-note hps-none"></p>'
    + '<div class="hps-do"><button type="button" class="hh-tool" data-hs-act="ps-copy">' + t('share.copy') + '</button><p class="hs-note hps-copied" role="status"></p></div>'
    + '<h3 class="hs-sub">' + t('share.head_paste') + '</h3>'
    + '<textarea class="hps-paste" data-hs-act="ps-type" rows="2" spellcheck="false" maxlength="' + CODE.maxChars + '" aria-label="' + t('share.head_paste') + '"></textarea>'
    + '<div class="hps-do"><button type="button" class="hh-tool" data-hs-act="ps-read">' + t('share.read') + '</button><p class="hs-note hps-error" role="status"></p></div>'
    + '<ul class="hw-ledger hps-rows"></ul>'
    + '<div class="hps-foot"><button type="button" class="hw-primary" data-hs-act="ps-use">' + t('share.use') + '</button>'
    + '<p class="hs-note hps-why"></p><p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

/** Patch the component from the server's sections and this hero's editor. */
function patchPlanShare(root, ctx) {
  const box = root.querySelector('.hps');
  const cs = ctx.character;
  if (!box || !cs) return;
  const sc = scratchOf(cs);
  const code = shareCodeOf(cs) || '';
  const out = box.querySelector('.hps-code');
  prop(out, 'value', code);
  prop(out, 'hidden', !code);
  text(box.querySelector('.hps-none'), code ? '' : t('share.none'));
  prop(box.querySelector('[data-hs-act="ps-copy"]'), 'disabled', !code);
  text(box.querySelector('.hps-copied'), sc.copied);
  text(box.querySelector('.hps-error'), CODE_ERRORS.includes(sc.error) ? t('share.err_' + sc.error) : '');
  const list = planChanges(cs, sc.draft);
  rows(box.querySelector('.hps-rows'), list, {
    key: (r) => r.part,
    build: () => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span><span class="hps-to"></span></li>'),
    patch: (li, r) => {
      text(li.querySelector('b'), t('share.part_' + r.part));
      text(li.querySelector('small'), rowNote(r));
      text(li.querySelector('.hps-to'), partWords(r.part, r.to, r.from));
      cls(li, 'is-current', r.state === 'send');
    },
  });
  const sends = list.filter((r) => r.state === 'send').length;
  const use = box.querySelector('[data-hs-act="ps-use"]');
  prop(use, 'hidden', !sc.draft);
  prop(use, 'disabled', !sends || sc.pending);
  cls(use, 'is-on', !!sends && !sc.pending);
  /* why Use is off is said beside it (say-why SW-2): the plan is already this hero's */
  text(box.querySelector('.hps-why'), sc.draft && !sends && !sc.pending ? t('share.nothing') : '');
  text(box.querySelector('.hh-intent-msg'), sc.msg);
}

/** One press or keystroke on the component; true when it was the component's. */
function actPlanShare(ctx, root, action, ev, repaint) {
  const cs = ctx.character;
  if (!cs || !String(action).startsWith('ps-')) return false;
  const sc = scratchOf(cs);
  const box = root.querySelector('.hps');
  if (action === 'ps-type' && ev.type === 'input') {
    /* new words are a new paste: the last reading and its refusal go */
    if (!sc.pending) { sc.draft = null; sc.error = null; sc.msg = ''; }
    repaint();
    return true;
  }
  if (ev.type !== 'click') return false;
  if (action === 'ps-read') {
    const r = decodePlanCode(box.querySelector('.hps-paste').value);
    sc.draft = r.ok ? r.plan : null;
    sc.error = r.ok ? null : r.error;
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'ps-copy') {
    const out = box.querySelector('.hps-code');
    const nav = ctx.doc.defaultView && ctx.doc.defaultView.navigator;
    const said = (ok) => { sc.copied = ok ? t('share.copied') : t('share.copy_failed'); repaint(); };
    if (!out.value) return true;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') nav.clipboard.writeText(out.value).then(() => said(true), () => { out.select(); said(false); });
    else { out.select(); said(false); }
    return true;
  }
  if (action === 'ps-use') {
    const plan = sc.draft;
    if (!plan || !ctx.account) return true;
    runIntent(sc, repaint, () => usePlan(ctx.account, cs, plan), t('share.using'),
      (r) => (r.sent ? t('share.used', { count: r.sent }) : t('share.nothing')), cs);
    return true;
  }
  return false;
}

/** The window: the component alone. */
export function renderPlanShare() { return planShareHtml(); }
renderPlanShare.events = ['input'];
renderPlanShare.patch = function patchPlanShareWindow(body, ctx) { patchPlanShare(body, ctx); };
renderPlanShare.act = function actPlanShareWindow(ctx, body, action, ev) {
  return actPlanShare(ctx, body, action, ev, () => patchPlanShare(body, ctx));
};
