// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/work.js — THE WORK WINDOW: THE JOBS LIST, THE WORK DAY, THE HEARTH AND THE TRADES (G).
//
// The bench cut (docs/design/redesign/09-crafting.md 4.17): the Work window's Jobs list IS the town work. There is no recipe to learn,
// no bench fee, no bench queue and no gathering node; a hero's trade Levels are its company's. Top to bottom, every number the server's:
//   the hearth     a run of fuel into the Great Hearth the server's pointer holds (the bridge until the company flame lights, 4.13 row 3:
//                  started from the bag's Burn, windows/inventory/bury.js), its line and its Stop; hidden while none burns
//   the work day   today's town work left as the server counted it at its last settle (the `work_day` section)
//   the blocks     bought town work and its "buy daily" rule (./time-rule-pane.js; 1071-work-blocks.sql)
//   the Jobs list  every recipe the company may run, the server's whole-day quote, Start, Collect and Stop (./work-jobs.js)
//   the trades     the company's trade Levels, the server's `trade_jobs.trades` (./skills.js tradeLedger)
// Buttons are off while a press is in flight and wherever the server's numbers say no; the server re-checks all of it.
// ════════════════════════════════════════════════════════════════════════
import { text, cls, prop } from '../../render/paint.js';
import { hoursWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { workDayOf } from '../../session/trade-sections.js';
import { runIntent } from '../intent-words.js';
import { t } from '../../render/player-text.js';
import { tradeLedger } from './skills.js';
import { workBlocksPaneHtml, patchWorkBlocksPane, actTimeRule } from './time-rule-pane.js';
import { jobsPaneHtml, patchJobsPane, actJobsPane } from './work-jobs.js';
import { buryLine, buryingOf, stopBury } from './inventory/bury.js';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The skeleton: the hearth's line, the work day, the bought work, the Jobs list, the trades, the press's answer. */
export function renderWork() {
  return '<div class="hw-trade">'
    /* THE GREAT HEARTH'S FUEL RUN (the bag starts it; its Stop is here and under the bag) */
    + '<div class="hw-burying hw-work-now" role="status"><span class="hw-burying-q"></span><button type="button" class="hh-tool" data-hs-act="work-stop">' + t('controls.stop') + '</button></div>'
    /* THE WORK DAY (1059-company-trades.sql): today's town work left; nothing gates on it here, the server stops the work */
    + '<p class="hs-note hw-work-day" role="status"></p>'
    + workBlocksPaneHtml()
    + jobsPaneHtml()
    + '<div class="hw-trade-ledger"><p class="hs-note hw-work-company">' + esc(t('work.company_trades')) + '</p>' + tradeLedger() + '</div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderWork.patch = function patchWork(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-trade');
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
  tradeLedger.patch(root, ctx);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

renderWork.act = function actWork(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderWork.patch(body, ctx);
  if (action === 'work-stop') {
    if (buryingOf(cs)) stopBury(cs, sc, (fn, busy, done) => runIntent(sc, repaint, fn, busy, done, cs));
    return true;
  }
  if (action.indexOf('wblock-') === 0 || action === 'time-rule') return actTimeRule(ctx, action, el, sc, repaint);
  if (action.indexOf('tjob-') === 0) return actJobsPane(ctx, action, el, sc, repaint);
  return false;
};
