// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/work.js — THE WORK WINDOW: THE JOBS LIST, THE WORK DAY, THE HEARTH AND THE TRADES (G).
//
// The bench cut (docs/design/redesign/09-crafting.md 4.17): the Work window's Jobs list IS the town work. There is no recipe to learn,
// no bench fee, no bench queue and no gathering node; a hero's trade Levels are its company's. Two tabs, so neither ledger needs a scroll
// bar (Tyler 10-18): Jobs, and the trades under Skills. Every number the server's:
//   the hearth     a run of fuel into the Great Hearth the server's pointer holds (the bridge until the company flame lights, 4.13 row 3:
//                  started from the bag's Burn, windows/inventory/bury.js), its line and its Stop; hidden while none burns
//   the work day   today's town work left as the server counted it at its last settle (the `work_day` section)
//   the blocks     bought town work and its "buy daily" rule (./time-rule-pane.js; 1071-work-blocks.sql)
//   the Jobs list  every recipe the company may run, the server's whole-day quote, Start, Collect and Stop (./work-jobs.js)
//   the Hallmark   a crafted piece's step and reforge (./hallmark-pane.js), only while the server offers this hero one
//   the trades     the company's trade Levels, the server's `trade_jobs.trades` (./skills.js tradeLedger)
// Buttons are off while a press is in flight and wherever the server's numbers say no; the server re-checks all of it.
// ════════════════════════════════════════════════════════════════════════
import { text, cls, prop, attr } from '../../render/paint.js';
import { hoursWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { workDayOf } from '../../session/trade-sections.js';
import { runIntent } from '../intent-words.js';
import { t } from '../../render/player-text.js';
import { tradeLedger } from './skills.js';
import { workBlocksPaneHtml, patchWorkBlocksPane, actTimeRule } from './time-rule-pane.js';
import { jobsPaneHtml, patchJobsPane, actJobsPane } from './work-jobs.js';
import { hallmarkOf } from '../../session/jewelry-sections.js';
import { hallmarkPaneHtml, patchHallmarkPane, actHallmarkPane } from './hallmark-pane.js';
import { JEWEL_STEP_BENCHES } from '../../data/jewelry.js';
import { buryLine, buryingOf, stopBury } from './inventory/bury.js';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', tab: 'jobs' }; SCRATCH.set(cs, s); } return s; };

/** The skeleton: the hearth's line, the work day, the bought work, the Jobs list, the trades, the press's answer. */
export function renderWork() {
  const tab = (id, label) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + id + '">' + esc(label) + '</button>';
  return '<div class="hw-trade">'
    + '<div class="hw-tabs" role="tablist">' + tab('jobs', t('work.jobs_head')) + tab('skills', t('wiki.tab_skills')) + '</div>'
    + '<div class="hw-pane" data-pane="jobs">'
    /* THE GREAT HEARTH'S FUEL RUN (the bag starts it; its Stop is here and under the bag) */
    + '<div class="hw-burying hw-work-now" role="status"><span class="hw-burying-q"></span><button type="button" class="hh-tool" data-hs-act="work-stop">' + t('controls.stop') + '</button></div>'
    /* THE WORK DAY (1059-company-trades.sql): today's town work left; nothing gates on it here, the server stops the work */
    + '<p class="hs-note hw-work-day" role="status"></p>'
    + workBlocksPaneHtml()
    + jobsPaneHtml()
    + hallmarkPaneHtml()
    + '</div><div class="hw-pane hw-trade-ledger" data-pane="skills"><p class="hs-note hw-work-company">' + esc(t('work.company_trades')) + '</p>' + tradeLedger() + '</div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderWork.patch = function patchWork(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-trade');
  /* a link to a job (goto.js) opens Jobs; a link that names a trade, Skills */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('skills-trade') : null;
  if (want) sc.tab = want === 'jobs' ? 'jobs' : 'skills';
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  /* The hearth's line: what the server's pointer burns, with its Stop (any other town activity it holds is named the same way). */
  const line = buryLine(cs);
  const now = root.querySelector('.hw-work-now');
  cls(now, 'is-on', !!line);
  text(now.querySelector('.hw-burying-q'), line);
  prop(now.querySelector('button'), 'disabled', sc.pending || !buryingOf(cs));
  /* THE WORK DAY as the server counted it at its last settle */
  const day = workDayOf(cs);
  const dayEl = root.querySelector('.hw-work-day');
  text(dayEl, !day ? '' : day.leftMs > 0 ? t('work.day_left', { left: hoursWords(day.leftMs), cap: hoursWords(day.capMs) }) : t('work.day_done'));
  cls(dayEl, 'is-off', !day);
  patchWorkBlocksPane(root, ctx, sc);
  patchJobsPane(root, ctx, sc);
  /* a crafted piece's Hallmark or reforge, while the server offers this hero one at that bench */
  const h = hallmarkOf(cs), bench = JEWEL_STEP_BENCHES.find((s) => !!h && h.offers.concat(h.reforges).some((o) => o.skill === s));
  prop(root.querySelector('.hw-hallmark'), 'hidden', !bench);
  if (bench) patchHallmarkPane(root, ctx, sc, bench);
  tradeLedger.patch(root, ctx);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

renderWork.act = function actWork(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderWork.patch(body, ctx);
  if (action === 'tab') { sc.tab = el.getAttribute('data-tab'); repaint(); return true; }
  if (action === 'work-stop') {
    if (buryingOf(cs)) stopBury(cs, sc, (fn, busy, done) => runIntent(sc, repaint, fn, busy, done, cs));
    return true;
  }
  if (action.indexOf('wblock-') === 0 || action === 'time-rule') return actTimeRule(ctx, action, el, sc, repaint);
  if (action.indexOf('hallmark-') === 0) return actHallmarkPane(ctx, action, el, sc, repaint);
  if (action === 'work-go' || action.indexOf('tjob-') === 0) return actJobsPane(ctx, action, el, sc, repaint);
  return false;
};
