// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/work-jobs.js — THE JOBS LIST: THE TOWN WORK (lane/k1-job-slice, supabase/migrations/1073-k1-job-slice.sql;
//   docs/design/redesign/09-crafting.md sections 4.9, 6 and 4.17: the Work window's Jobs list is the town work).
//
// The Work window's body under the work day, shown while the server sends the `trade_jobs` section (src/session/trade-sections.js; the
// bench cut's last statement lights it). Every number is the SERVER's:
//   the line    the running job, its count and the time left to the server's own end (a display countdown: nothing spends it, and the
//               next envelope replaces it), with Collect (on once the server's end has come; the server still says not_due before its
//               own clock does) and Stop (now: the server lands what is done and returns the rest)
//   the rows    (src/session/job-quotes.js jobListOf, the one reader of a job's quote; "Loading…" until it has the list, and a row with no
//               quote yet says so with its Start off) each recipe the company may run, its inputs a set, and the server's whole-day quote (how many, the fee, the hours) or
//               why it is shut (the trade Level, the band's depth record, the day used, the materials). Start sends exactly that quote.
// Buttons are off while a press is in flight, while a job runs, and wherever the quote is a refusal; the server re-checks all of it.
// ════════════════════════════════════════════════════════════════════════
import { tradeJobsOf } from '../../session/trade-sections.js';
import { serverNowOf } from '../../session/hunt-sections.js';
import { jobListOf } from '../../session/job-quotes.js';
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
  return '<div class="hw-jobs" hidden>'
    + '<div class="hw-burying hw-jobs-now" role="status"><span class="hw-burying-q"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="tjob-collect">' + esc(t('work.job_collect')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="tjob-stop">' + esc(t('work.job_stop')) + '</button></div>'
    + '<p class="hs-note hw-jobs-last" role="status"></p><p class="hh-empty hw-jobs-loading" role="status">' + esc(t('share.state_unread')) + '</p><ul class="hw-ledger hw-work-rows hw-jobs-rows"></ul></div>';
}

/* A JOB IS A GENRE ROW (the work row's layout, windows.css .hw-work-row): what it makes is the row's icon, its name with the trade Level
   that opens it ("Lv 11") on its first line, what one attempt uses under it, then the server's quote or why it is shut; Start at the right.
   data-hs-find: a link to this job (the bag's Cook, an item's "Made with", the coach: src/shell/goto.js) brings this row into view. */
function rowHtml(g, r) {
  return '<li class="hw-line hw-work-row hw-job" data-id="' + esc(r.id) + '" data-hs-find="' + esc(r.id) + '">'
    + '<span class="hw-ico" title="' + esc(itemName(r.face)) + '">' + itemIconHtml(g, r.face) + '</span>'
    + '<span class="hw-line-name"><span class="hw-work-top"><b class="hw-job-name"></b><small class="hw-work-lv">' + esc(t('work.row_level', { level: r.rLevel })) + '</small></span>'
    + '<small class="hw-job-inputs"></small><small class="hw-job-quote hw-work-why"></small></span>'
    + '<button type="button" class="hh-tool hw-work-go" data-hs-act="work-go" data-id="' + esc(r.id) + '">' + esc(t('work.job_start')) + '</button></li>';
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
    : q ? shutWords(r) : t('share.state_unread'));
  prop(li.querySelector('[data-hs-act="work-go"]'), 'disabled', !(q && q.ok) || !!job || sc.pending);
  cls(li, 'is-off', !(q && q.ok));
  cls(li, 'is-locked', !(q && q.ok));
  /* the running job's own row reads as on (the line above has its Stop) */
  cls(li, 'is-on', !!job && job.recipe === r.id);
  cls(li.querySelector('.hw-work-lv'), 'is-short', !!q && q.error === 'rung_locked');
}

/** Patch the pane in place (the Work window's patch). */
export function patchJobsPane(root, ctx, sc) {
  const cs = ctx.character;
  const pane = root.querySelector('.hw-jobs');
  if (!pane) return;
  const s = tradeJobsOf(cs);
  attr(pane, 'hidden', s ? null : '');
  if (!s) return;
  /* the countdown runs on the server's clock (the session's offset), never this machine's: display only */
  const srv = serverNowOf(cs);
  const now = Number.isFinite(srv) ? srv : Date.now();
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
  const list = jobListOf(ctx.account, cs);
  const lastRecipe = last ? list.rows.find((r) => r.id === last.recipe) : null;
  text(pane.querySelector('.hw-jobs-last'), !last || job ? '' : t('work.job_last', { made: made.join(', '),
    name: last.face ? itemNameFor(last.face, last.plain + last.fine + last.master) : last.name,
    xp: whole(last.xp), trade: lastRecipe ? tradeName(lastRecipe.trade) : '' }));
  /* WHAT THE HERO CAN START, FIRST (the bench's old Can make order; played on a local world: a new hero's list opened on five shut
     imbuements and its Cook Shrimp sat below the fold): the jobs the server quotes open, then the shut ones, each by the Level that
     opens it, the server's order kept between equals. Display order only: every row and number is the server's. */
  const open = (r) => (r.quote && r.quote.ok ? 1 : 0);
  cls(pane.querySelector('.hw-jobs-loading'), 'is-on', list.loading);
  const order = list.rows.slice().sort((a, b) => open(b) - open(a) || a.rLevel - b.rLevel);
  rows(pane.querySelector('.hw-jobs-rows'), order, {
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
  if (action === 'work-go') {
    const r = jobListOf(ctx.account, cs).rows.find((x) => x.id === el.getAttribute('data-id'));
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
