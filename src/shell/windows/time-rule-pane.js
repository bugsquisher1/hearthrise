// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/time-rule-pane.js — BOUGHT TOWN WORK AND THE "BUY DAILY" RULE (lane B1, supabase/migrations/1071-work-blocks.sql).
//
// Two pieces, every number the SERVER's (the `time_blocks` section, src/session/time-sections.js), every control off while a press is
// in flight and until the section says the server has the thing:
//   the work block  (the Work window, under its work-day line) the next 2 h of town work today as the server prices it: Buy opens a
//                   confirmation with that price; one press sends ONE hr_time_buy('work', price), refused if the price moved
//   the rule        (the Work window for town work, the Shop's Services for hunting) "Buy daily: Off 1 2 ..." up to the kind's cap: one
//                   press sends ONE hr_time_auto_set. Off by default; the server's sweep buys the blocks, never this window
// ════════════════════════════════════════════════════════════════════════
import { workBlockOf, timeRuleOf } from '../../session/time-sections.js';
import { goldOf } from '../../session/item-sections.js';
import { setTimeRule } from '../../session/time-intents.js';
import { text, cls, prop, attr } from '../../render/paint.js';
import { whole, gold, hoursWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { runIntent } from '../intent-words.js';
import { t } from '../../render/player-text.js';

/* The most blocks any kind sells a day (src/data/time-blocks.js: work 4): the rule's buttons past a kind's own cap stay hidden. */
const MOST = 4;

/** The rule's line for `kind`: "Buy daily" and its Off / 1 / 2 ... buttons (hidden until the server sends the rule). */
export function timeRuleHtml(kind) {
  const segs = ['0'].concat(Array.from({ length: MOST }, (_, i) => String(i + 1)));
  return '<p class="hs-note hw-time-rule" data-kind="' + esc(kind) + '" hidden>' + esc(t('work.rule_label')) + ' <span class="hh-segs" role="group" aria-label="'
    + esc(t('work.rule_label')) + '">' + segs.map((n) => '<button type="button" class="hh-seg" data-hs-act="time-rule" data-kind="' + esc(kind) + '" data-n="' + n + '">'
      + esc(n === '0' ? t('work.rule_off') : n) + '</button>').join('') + '</span> <small class="hw-time-rule-note"></small></p>';
}

/** Patch a rule line in place: which count is on, which are offered (up to the kind's cap), and what it bought today. */
export function patchTimeRule(root, cs, sc, kind) {
  const line = root.querySelector('.hw-time-rule[data-kind="' + kind + '"]');
  if (!line) return;
  const r = timeRuleOf(cs, kind);
  attr(line, 'hidden', r ? null : '');
  if (!r) return;
  for (const b of line.querySelectorAll('.hh-seg')) {
    const n = Number(b.getAttribute('data-n'));
    attr(b, 'aria-pressed', String(n === r.upTo));
    attr(b, 'hidden', n > r.perDay ? '' : null);
    prop(b, 'disabled', sc.pending);
  }
  text(line.querySelector('.hw-time-rule-note'), r.upTo && r.boughtToday ? t('work.rule_bought', { n: whole(r.boughtToday) }) : '');
}

/** The work block's skeleton (inside the Work window, under the work-day line). */
export function workBlocksPaneHtml() {
  return '<div class="hw-work-blocks" hidden><p class="hs-note hw-wblock-quote"></p>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="wblock-ask"></button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="' + esc(t('work.block_confirm_label')) + '"><p class="hw-confirm-q"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="wblock-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="wblock-no">' + esc(t('controls.cancel')) + '</button></div></div>'
    + timeRuleHtml('work') + '</div>';
}

/** Patch the work block in place (the Work window's patch). */
export function patchWorkBlocksPane(root, ctx, sc) {
  const cs = ctx.character;
  const pane = root.querySelector('.hw-work-blocks');
  if (!pane) return;
  const q = workBlockOf(cs);
  attr(pane, 'hidden', q ? null : '');
  if (!q) return;
  const purse = goldOf(cs);
  const quote = pane.querySelector('.hw-wblock-quote');
  const ask = pane.querySelector('[data-hs-act="wblock-ask"]');
  if (!q.available) text(quote, q.why === 'day_ending' ? t('work.block_day_ending') : t('work.block_used', { max: whole(q.perDay) }));
  else {
    text(quote, t(purse !== null && purse < q.price ? 'work.block_quote_short' : 'work.block_quote', { hours: hoursWords(q.blockMs), price: gold(q.price),
      n: whole(q.boughtToday), max: whole(q.perDay), short: gold(Math.max(0, q.price - (purse || 0))) }));
  }
  text(ask, q.available ? t('work.block_buy', { hours: hoursWords(q.blockMs), price: gold(q.price) }) : t('work.block_buy_off'));
  const can = q.available && !sc.pending && (purse === null || purse >= q.price);
  if (sc.wblockConfirm && !can) sc.wblockConfirm = false;
  prop(ask, 'disabled', !can || !!sc.wblockConfirm);
  const cf = pane.querySelector('.hw-confirm');
  cls(cf, 'is-on', !!sc.wblockConfirm);
  const yes = pane.querySelector('[data-hs-act="wblock-yes"]');
  cls(yes, 'is-on', !!sc.wblockConfirm);
  if (sc.wblockConfirm) {
    text(cf.querySelector('.hw-confirm-q'), t('work.block_ask', { hours: hoursWords(q.blockMs), price: gold(q.price) }));
    text(yes, t('work.block_yes', { price: gold(q.price) }));
  }
  prop(yes, 'disabled', sc.pending);
  patchTimeRule(pane, cs, sc, 'work');
}

/** A press on the work block or a rule line (the window routes its clicks here first); true when handled. */
export function actTimeRule(ctx, action, el, sc, repaint) {
  const cs = ctx.character;
  if (action === 'wblock-ask') { const q = workBlockOf(cs); if (q && q.available) { sc.wblockConfirm = true; sc.msg = ''; repaint(); } return true; }
  if (action === 'wblock-no') { sc.wblockConfirm = false; repaint(); return true; }
  if (action === 'wblock-yes') {
    const q = workBlockOf(cs);
    const was = !!sc.wblockConfirm;
    sc.wblockConfirm = false;
    if (!was || !q || !q.available) { repaint(); return true; }
    runIntent(sc, repaint, () => cs.buyTime('work', q.price), t('work.block_buying'), () => t('work.block_done'), cs);
    return true;
  }
  if (action === 'time-rule') {
    const kind = el.getAttribute('data-kind');
    const n = Number(el.getAttribute('data-n'));
    const r = timeRuleOf(cs, kind);
    if (!r || !Number.isInteger(n) || n < 0 || n > r.perDay || n === r.upTo) return true;
    runIntent(sc, repaint, () => setTimeRule(ctx.account, cs, kind, n), t('work.rule_setting'), () => (n ? t('work.rule_on', { n: whole(n) }) : t('work.rule_off_done')), cs);
    return true;
  }
  return false;
}
