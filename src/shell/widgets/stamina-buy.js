// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/stamina-buy.js — THE "+" BESIDE THE BAR'S STAMINA (Tyler 2026-10-25).
//
// "add a 'plus' button to the right of Stamina, it is an option to purchase more
// stamina": the gold "+" after the hub's stamina timer (vitals-hub.js) opens a
// small panel from the bar with what ONE hunting block gives and its price, both the
// SERVER's quote (the `time_blocks` section, item-sections.js huntBlockOf; Tyler
// 2026-11-22: 2 h blocks, each x1.5 the one before that day, 2 a day), and a Buy that
// sends ONE hr_time_buy carrying that quoted price (CharacterSession.buyTime, the Services
// window's own path; the server refuses quote_changed rather than charge another sum, and the
// refusal re-reads the hero, so the next press is at the server's price). The quote is read
// again when the panel opens and before the question is asked: a level gained or a block bought
// in another window moves it. Buy asks first, in the Shop's words (both read this one quote,
// which rises with Level and with each block today). Buy stays off until the server
// answers (bar-draft.js answerWithin bounds the wait); the stamina shown changes
// only with the re-read envelope (CLAUDE.md §6). When it cannot be bought (a full
// day banked, today's blocks bought, not enough gold) Buy is off and the panel says why in the
// server's refusal words; the "+" itself always shows.
// A hero without premium (the server's `premium` section) also reads "Premium: +2 h
// stamina cap" (the 2 is STAMINA_MAX_MS's premium cap less the free one). Nothing here
// prices or adds stamina.
// ════════════════════════════════════════════════════════════════════════
import { STAMINA_MAX_MS } from '../../data/hunt-sessions.js';
import { staminaOf, isPremium } from '../../session/hunt-sections.js';
import { huntBlockOf, goldOf } from '../../session/item-sections.js';
import { text, cls, attr, prop } from '../../render/paint.js';
import { whole, gold, hoursWords } from '../../render/format.js';
import { refusalWords } from '../intent-words.js';
import { answerWithin } from '../bar-draft.js';
import { t } from '../../render/player-text.js';

const PREMIUM_HOURS = Math.round((STAMINA_MAX_MS.premium - STAMINA_MAX_MS.free) / 3600000);
const STATE = new WeakMap();   // the bar element -> { open, pending, msg, off }
const stateOf = (el) => { let s = STATE.get(el); if (!s) { s = { open: false, pending: false, msg: '', off: null, asking: false }; STATE.set(el, s); } return s; };

/** "Buy 2 h of stamina for 1,750 gp?": the one question before a hunting block, here and in the Shop's Services tab. */
export const staminaAskWords = (q) => t('hud.stam_ask', { hours: hoursWords(q.blockMs), price: gold(q.price) });

/** The "+" after the stamina timer (inside the hub's stamina line). */
export function staminaPlusHtml() {
  return '<button type="button" class="hb-stam-buy" data-hs-act="stam-buy" data-coach-hook="stamina-buy" aria-expanded="false" aria-label="' + t('hud.stam_buy') + '" title="' + t('hud.stam_buy') + '"><i></i></button>';
}

/** The panel it opens (inside the bar, beside its tooltip). */
export function staminaBuyHtml() {
  return '<div class="hb-buy" role="dialog" aria-label="' + t('hud.stam_buy') + '">'
    + '<div class="hb-buy-head"><b>' + t('hud.stam_head') + '</b><span class="hb-buy-now"></span><button type="button" class="hh-tool" data-hs-act="stam-close" aria-label="' + t('controls.close') + '">×</button></div>'
    + '<p class="hb-buy-quote"></p><p class="hb-buy-day"></p><p class="hb-buy-why"></p>'
    + '<p class="hb-buy-premium">' + t('hud.stam_premium', { hours: PREMIUM_HOURS }) + '</p>'
    + '<div class="hb-buy-do"><button type="button" class="hh-tool is-primary hb-buy-go" data-hs-act="stam-go"></button>'
    + '<button type="button" class="hh-tool hb-buy-no" data-hs-act="stam-no" hidden>' + t('controls.cancel') + '</button></div>'
    + '<p class="hh-intent-msg hb-buy-msg" role="status" aria-live="polite"></p></div>';
}

/* Why the next block cannot be bought, in the server's refusal words, or null. */
function whyNot(q, purse) {
  if (!q) return t('hud.stam_unpriced');
  if (!q.available) return refusalWords(q.why);
  if (purse !== null && purse < q.price) return refusalWords('gold_short');
  return null;
}

/** Patch the panel under `el` (the bar widget) from the character's envelope. */
export function patchStaminaBuy(el, ctx) {
  const s = stateOf(el);
  const cs = ctx.character;
  const box = el.querySelector('.hb-buy');
  cls(box, 'is-on', s.open);
  attr(el.querySelector('.hb-stam-buy'), 'aria-expanded', String(s.open));
  if (!s.open) return;
  const st = staminaOf(cs), q = huntBlockOf(cs), purse = goldOf(cs);
  const why = whyNot(q, purse);
  text(box.querySelector('.hb-buy-now'), st ? t('hud.stam_now', { left: hoursWords(st.msLeft), cap: hoursWords(st.capMs) }) : '');
  if (why) s.asking = false;
  text(box.querySelector('.hb-buy-quote'), !(q && q.available) ? '' : s.asking ? staminaAskWords(q) : t('hud.stam_quote', { hours: hoursWords(q.blockMs), price: gold(q.price) }));
  text(box.querySelector('.hb-buy-day'), q ? t('hud.stam_day', { n: whole(q.boughtToday), max: whole(q.perDay) }) : '');
  text(box.querySelector('.hb-buy-why'), why || '');
  cls(box.querySelector('.hb-buy-premium'), 'is-on', !isPremium(cs));
  const go = box.querySelector('.hb-buy-go');
  text(go, !(q && q.available) ? t('hud.stam_go') : s.asking ? t('hud.stam_go_for', { price: gold(q.price) }) : t('hud.stam_go_plus', { hours: hoursWords(q.blockMs), price: gold(q.price) }));
  prop(box.querySelector('.hb-buy-no'), 'hidden', !s.asking);
  prop(go, 'disabled', !!why || s.pending);
  attr(go, 'title', why);
  text(box.querySelector('.hb-buy-msg'), s.msg);
  /* Over the stamina line, kept inside the bar. */
  const bar = el.querySelector('.hb-bar').getBoundingClientRect(), plus = el.querySelector('.hb-stam-buy').getBoundingClientRect();
  box.style.left = Math.round(Math.max(0, Math.min(bar.width - box.offsetWidth, plus.left - bar.left + plus.width / 2 - box.offsetWidth / 2))) + 'px';
}

function setOpen(ctx, el, open, repaint) {
  const s = stateOf(el);
  if (s.off) { s.off(); s.off = null; }
  s.open = open;
  s.asking = false;
  if (open) {
    s.msg = '';
    /* the quote is the hero's last read, and town rest lowers it by the minute: opening reads it again (one hr_load, single-flight) */
    if (ctx.character && typeof ctx.character.load === 'function') answerWithin(() => ctx.character.load()).then(() => { if (s.open) repaint(); });
    const doc = ctx.doc, box = el.querySelector('.hb-buy'), plus = el.querySelector('.hb-stam-buy');
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(ctx, el, false, repaint); } };
    const onDown = (e) => { if (!box.contains(e.target) && !plus.contains(e.target)) setOpen(ctx, el, false, repaint); };
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onDown, true);
    s.off = () => { doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('pointerdown', onDown, true); };
  }
  repaint();
}

/** The bar's stam-* actions; true when handled. */
export function actStaminaBuy(ctx, el, action, ev, repaint) {
  if (ev.type !== 'click') return action.startsWith('stam-');
  const s = stateOf(el);
  if (action === 'stam-buy') { setOpen(ctx, el, !s.open, repaint); return true; }
  if (action === 'stam-close') { setOpen(ctx, el, false, repaint); return true; }
  if (action === 'stam-no') { s.asking = false; repaint(); return true; }
  if (action !== 'stam-go') return false;
  const cs = ctx.character, q = huntBlockOf(cs);
  if (s.pending || whyNot(q, goldOf(cs))) { repaint(); return true; }
  /* The question is asked at the price the server quotes NOW: town rest moves it while the panel sits open (QA 2026-11-14) */
  if (!s.asking) {
    s.pending = true; s.msg = ''; repaint();
    answerWithin(() => cs.load()).then(() => { s.pending = false; s.asking = s.open; repaint(); });
    return true;
  }
  s.asking = false;
  s.pending = true;
  s.msg = t('hud.stam_buying');
  repaint();
  answerWithin(() => cs.buyTime('hunt', q.price)).then((r) => {
    s.pending = false;
    s.msg = r.ok ? t('hud.stam_done') : refusalWords(r.error);
    repaint();
  });
  return true;
}
