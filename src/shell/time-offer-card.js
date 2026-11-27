// ════════════════════════════════════════════════════════════════════════
// src/shell/time-offer-card.js — THE BLOCK RULE'S ONE OFFER, AS A COACH CARD (designer, lane/designer-text-1126; 12-targets section 9.3).
//
// When the company's purse first holds 3 days of its pay, the server puts `time_blocks.offer` in the envelope (1071-work-blocks.sql
// hr_time_offer_of; src/session/time-sections.js timeOfferOf). The coach shows ONE card in the coach's own box (src/shell/launcher-
// coach.js pointerFor draws it before any tip): "Your purse is filling up", then [Up to 1 a day] [Up to 2 a day] [Not now]. A press sends
// ONE hr_time_offer_answer (src/session/time-intents.js answerTimeOffer): a choice sets every hero's standing "buy daily" rule, Not now
// sets none, and either way the server never offers it again (one answer an account, ever).
//
// EVERY STATE IS THE SERVER'S. The card shows only while the envelope carries the offer, its choices are the server's, and it goes when
// the answer's envelope (rule 11) no longer carries it, never on the press. While the answer is in flight every button is off. A refusal
// says why and the buttons come back (a refused answer re-reads the hero first, so an offer already answered elsewhere just goes).
// The card is a DECISION, not a tip: it shows with tips off too, and it has no Got it (Not now is its way out). Only the hunting offer
// has words (the one 9.3 designs): an offer of another kind shows nothing. Display only: the answer is the server's.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js';
import { timeOfferOf } from '../session/time-sections.js';
import { huntBlockOf } from '../session/item-sections.js';
import { answerTimeOffer } from '../session/time-intents.js';
import { hoursWords, gold } from '../render/format.js';
import { runIntent } from './intent-words.js';
import { t } from '../render/player-text.js';

/** The card's id on screen (data-tutorial): never a tutorial card's. */
export const OFFER_CARD = 'time_offer';

/* The press in flight and what the last answer said, per character (display scratch: the offer itself is the server's). */
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The offer the card answers, or null: the server's hunting offer while the envelope carries it. */
export function offerShown(cs) {
  const o = cs ? timeOfferOf(cs) : null;
  return o && o.kind === 'hunt' ? o : null;
}

/** The card's markup in the coach's own box (.hs-pointer), or '' when the server offers nothing. Buttons off while an answer is out. */
export function offerCardHtml(cs) {
  const o = offerShown(cs);
  if (!o) return '';
  const sc = scratchOf(cs);
  const off = sc.pending ? ' disabled' : '';
  const q = huntBlockOf(cs);
  const block = q ? t(q.available && q.price ? 'coach.offer_block_price' : 'coach.offer_block', { hours: hoursWords(q.blockMs), price: gold(q.price) }) : '';
  return '<p class="hs-pointer is-offer" role="note" data-tutorial="' + OFFER_CARD + '" data-coach="' + OFFER_CARD + (sc.pending ? ':wait' : '') + '">'
    + '<b>' + esc(t('coach.offer_title')) + '</b> <span class="hs-coach-text">' + esc(t('coach.offer'))
    + (block ? '<small class="hs-coach-sub">' + esc(block) + '</small>' : '')
    + '<small class="hs-coach-sub">' + esc(t('coach.offer_later')) + '</small>'
    + (sc.msg ? '<small class="hs-coach-sub hs-coach-say" role="status">' + esc(sc.msg) + '</small>' : '') + '</span>'
    + '<span class="hs-coach-foot hs-coach-answers" role="group" aria-label="' + esc(t('coach.offer_title')) + '">'
    + o.choices.map((n) => '<button type="button" class="hs-coach-got" data-hs-act="time-offer" data-n="' + n + '"' + off + '>'
      + esc(t('coach.offer_up_to', { n })) + '</button>').join('')
    + '<button type="button" class="hs-coach-off" data-hs-act="time-offer" data-n="0"' + off + '>' + esc(t('coach.offer_not_now')) + '</button>'
    + '</span></p>';
}

/* Every copy of the card on the page follows the scratch at once (the icon row and the hunt bar redraw it from the same string on
   their next paint; the answer's envelope repaints them anyway). */
function repaintCards(doc, cs) {
  if (!doc) return;
  for (const p of doc.querySelectorAll('.hs-pointer[data-tutorial="' + OFFER_CARD + '"]')) {
    const html = offerCardHtml(cs);
    if (html) p.outerHTML = html; else p.remove();
  }
}

/**
 * The answer `n` (a choice the server offered, or 0 for Not now): ONE hr_time_offer_answer while none is out, the card's buttons off
 * until it lands. Resolves with the answer; a press the card cannot send resolves { ok: false } and sends nothing.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export function answerOffer(ctx, n, doc = null) {
  const cs = ctx.character, o = offerShown(cs);
  if (!o || !(n === 0 || o.choices.includes(n))) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return runIntent(scratchOf(cs), () => repaintCards(doc, cs), () => answerTimeOffer(ctx.account, cs, n), t('coach.offer_saving'), () => '', cs);
}

/** A press on the card (from the coach's own act, wherever the card is drawn). True when the action was the card's. */
export function actTimeOffer(ctx, el, action, ev) {
  if (action !== 'time-offer') return false;
  if (ev.type !== 'click') return true;
  const b = ev.target && ev.target.closest ? ev.target.closest('[data-hs-act="time-offer"]') : null;
  if (b) answerOffer(ctx, Number(b.getAttribute('data-n')), (el && el.ownerDocument) || ctx.doc || null);
  return true;
}
