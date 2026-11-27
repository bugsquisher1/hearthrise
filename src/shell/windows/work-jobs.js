// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/work-jobs.js — THE KIT TRADES' JOBS IN THE WORK WINDOW (lane/k1-job-slice, supabase/migrations/1073-k1-job-slice.sql;
//   docs/design/redesign/09-crafting.md sections 4.9 and 6).
//
// One pane under the work day, shown only while the server sends the `trade_jobs` section (src/session/trade-sections.js; dark until the
// switch is lit). Every number is the SERVER's:
//   the line    the running job, its count and the time left to the server's own end (a display countdown: nothing spends it, and the
//               next envelope replaces it), with Collect (on once the server's end has come; the server still says not_due before its
//               own clock does) and Stop (now: the server lands what is done and returns the rest)
//   the rows    each recipe the company may run, its inputs a set, and the server's whole-day quote (how many, the fee, the hours) or
//               why it is shut (the trade Level, the band's depth record, the day used, the materials). Start sends exactly that quote.
// Buttons are off while a press is in flight, while a job runs, and wherever the quote is a refusal; the server re-checks all of it.
// ════════════════════════════════════════════════════════════════════════
import { tradeJobsOf } from '../../session/trade-sections.js';
import { startTradeJob, endTradeJob } from '../../session/trade-intents.js';
import { TRADES } from '../../data/trades.js';
import { text, cls, prop, attr, rows, element } from '../../render/paint.js';
import { whole, gold, hoursWords, listWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { itemName, itemNameFor, itemIconHtml } from '../widgets/bits.js';
import { runIntent } from '../intent-words.js';
import { t } from '../../render/player-text.js';

const tradeName = (id) => (TRADES[id] && TRADES[id].name) || id;

/** The pane's skeleton (inside the Work window, under the bought work). */
export function jobsPaneHtml() {
  return '<div class="hw-jobs" hidden><p class="hs-note hw-work-company">' + esc(t('work.jobs_head')) + '</p>'
    + '<div class="hw-burying hw-jobs-now" role="status"><span class="hw-burying-q"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="tjob-collect">' + esc(t('work.job_collect')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="tjob-stop">' + esc(t('work.job_stop')) + '</button></div>'
    + '<p class="hs-note hw-jobs-last" role="status"></p><ul class="hw-ledger hw-jobs-rows"></ul></div>';
}

function rowHtml(g, r) {
  return '<li class="hw-skill hw-job" data-key="' + esc(r.id) + '">' + itemIconHtml(g, r.face)
    + '<span class="hw-job-text"><b class="hw-job-name"></b><small class="hw-job-inputs"></small><small class="hw-job-quote"></small></span>'
    + '<button type="button" class="hh-tool" data-hs-act="tjob-start" data-id="' + esc(r.id) + '">' + esc(t('work.job_start')) + '</button></li>';
}

/** Why a row is shut, in the server's own words and numbers. */
function shutWords(r) {
  const q = r.quote;
  if (!q || q.ok) return '';
  if (q.error === 'rung_locked') return t('work.job_needs', { trade: tradeName(r.trade), level: whole(q.need ?? r.rLevel) });
  if (q.error === 'band_locked') return t('work.job_band');
  if (q.error === 'short_inputs') return t('work.job_short');
  if (q.error === 'work_cap') return t('work.job_day_used');
  return t('work.job_shut');
}

function patchRow(li, r, sc, job, now) {
  text(li.querySelector('.hw-job-name'), r.name);
  const ins = Object.entries(r.inputs).map(([id, n]) => whole(n) + ' ' + itemNameFor(id, n));
  text(li.querySelector('.hw-job-inputs'), ins.length ? t('work.job_inputs', { list: listWords(ins) }) : '');
  const q = r.quote;
  const hours = q && q.ok && q.endsAt !== null ? hoursWords(Math.max(0, q.endsAt - now)) : '';
  text(li.querySelector('.hw-job-quote'), q && q.ok
    ? t(q.fee > 0 ? 'work.job_quote' : 'work.job_quote_free', { count: whole(q.count), fee: gold(q.fee), hours })
    : shutWords(r));
  prop(li.querySelector('[data-hs-act="tjob-start"]'), 'disabled', !(q && q.ok) || !!job || sc.pending);
  cls(li, 'is-off', !(q && q.ok));
}

/** Patch the pane in place (the Work window's patch). */
export function patchJobsPane(root, ctx, sc) {
  const cs = ctx.character;
  const pane = root.querySelector('.hw-jobs');
  if (!pane) return;
  const s = tradeJobsOf(cs);
  attr(pane, 'hidden', s ? null : '');
  if (!s) return;
  const now = Date.now();
  const job = s.job;
  const line = pane.querySelector('.hw-jobs-now');
  cls(line, 'is-on', !!job);
  const done = !!job && (job.due || now >= job.endsAt);
  text(line.querySelector('.hw-burying-q'), !job ? '' : done ? t('work.job_due', { name: job.name })
    : t('work.job_now', { name: job.name, count: whole(job.count), left: hoursWords(Math.max(0, job.endsAt - now)) }));
  prop(line.querySelector('[data-hs-act="tjob-collect"]'), 'disabled', !done || sc.pending);
  prop(line.querySelector('[data-hs-act="tjob-stop"]'), 'disabled', !job || done || sc.pending);
  const last = s.last;
  const made = last ? [whole(last.plain + last.fine + last.master)] : [];
  if (last && last.fine) made.push(t('work.job_last_fine', { n: whole(last.fine) }));
  if (last && last.master) made.push(t('work.job_last_master', { n: whole(last.master) }));
  const lastRecipe = last ? s.recipes.find((r) => r.id === last.recipe) : null;
  text(pane.querySelector('.hw-jobs-last'), !last || job ? '' : t('work.job_last', { made: made.join(', '),
    name: last.face ? itemNameFor(last.face, last.plain + last.fine + last.master) : last.name,
    xp: whole(last.xp), trade: lastRecipe ? tradeName(lastRecipe.trade) : '' }));
  rows(pane.querySelector('.hw-jobs-rows'), s.recipes, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, rowHtml(ctx.glyphs, r)),
    patch: (li, r) => patchRow(li, r, sc, job, now),
  });
}

/** A press in the pane (the window routes its `tjob-*` clicks here); true when handled. */
export function actJobsPane(ctx, action, el, sc, repaint) {
  const cs = ctx.character;
  const s = tradeJobsOf(cs);
  if (!s) return true;
  if (action === 'tjob-start') {
    const r = s.recipes.find((x) => x.id === el.getAttribute('data-id'));
    if (!r || !r.quote || !r.quote.ok || s.job) return true;
    runIntent(sc, repaint, () => startTradeJob(ctx.account, cs, r.id, r.quote.count, r.quote.fee), t('work.job_starting'), () => t('work.job_started'), cs);
    return true;
  }
  if (action === 'tjob-collect') {
    if (!s.job) return true;
    runIntent(sc, repaint, () => endTradeJob(ctx.account, cs, false), t('work.job_collecting'), () => t('work.job_collected'), cs);
    return true;
  }
  if (action === 'tjob-stop') {
    if (!s.job) return true;
    runIntent(sc, repaint, () => endTradeJob(ctx.account, cs, true), t('work.job_stopping'), () => t('work.job_stopped'), cs);
    return true;
  }
  return false;
}
