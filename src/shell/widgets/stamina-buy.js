// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/stamina-buy.js — THE "+" BESIDE THE BAR'S STAMINA (Tyler 2026-10-25).
//
// "add a 'plus' button to the right of Stamina, it is an option to purchase more
// stamina": the gold "+" after the hub's stamina timer (vitals-hub.js) opens a
// small panel from the bar with what ONE refill gives and its price, both the
// SERVER's quote (the `stamina_refill` section, item-sections.js staminaRefillOf),
// and a Buy that sends ONE hr_stamina_refill carrying that quoted price
// (CharacterSession.buyStamina, the Services window's own path; the server refuses
// quote_changed rather than charge another sum). Buy stays off until the server
// answers (bar-draft.js answerWithin bounds the wait); the stamina shown changes
// only with the re-read envelope (CLAUDE.md §6). When it cannot be bought (full,
// today's refills used, not enough gold) Buy is off and the panel says why in the
// server's refusal words; the "+" itself always shows.
// A hero without premium (the server's `premium` section) also reads "Premium
// raises your stamina cap by 4 hours." (Tyler's words; the 4 is STAMINA_MAX_MS's
// premium cap less the free one). Nothing here prices or adds stamina.
// ════════════════════════════════════════════════════════════════════════
import { STAMINA_MAX_MS } from '../../data/hunt-sessions.js?v=0.2.73';
import { staminaOf, isPremium } from '../../session/hunt-sections.js?v=0.2.73';
import { staminaRefillOf, goldOf } from '../../session/item-sections.js?v=0.2.73';
import { text, cls, attr, prop } from '../../render/paint.js?v=0.2.73';
import { whole, gold, hoursWords } from '../../render/format.js?v=0.2.73';
import { refusalWords } from '../intent-words.js?v=0.2.73';
import { answerWithin } from '../bar-draft.js?v=0.2.73';

const PREMIUM_HOURS = Math.round((STAMINA_MAX_MS.premium - STAMINA_MAX_MS.free) / 3600000);
const STATE = new WeakMap();   // the bar element -> { open, pending, msg, off }
const stateOf = (el) => { let s = STATE.get(el); if (!s) { s = { open: false, pending: false, msg: '', off: null }; STATE.set(el, s); } return s; };

/** The "+" after the stamina timer (inside the hub's stamina line). */
export function staminaPlusHtml() {
  return '<button type="button" class="hb-stam-buy" data-hs-act="stam-buy" data-coach-hook="stamina-buy" aria-expanded="false" aria-label="Buy stamina" title="Buy stamina"><i></i></button>';
}

/** The panel it opens (inside the bar, beside its tooltip). */
export function staminaBuyHtml() {
  return '<div class="hb-buy" role="dialog" aria-label="Buy stamina">'
    + '<div class="hb-buy-head"><b>Stamina</b><span class="hb-buy-now"></span><button type="button" class="hh-tool" data-hs-act="stam-close" aria-label="Close">×</button></div>'
    + '<p class="hb-buy-quote"></p><p class="hb-buy-day"></p><p class="hb-buy-why"></p>'
    + '<p class="hb-buy-premium">Premium raises your stamina cap by ' + PREMIUM_HOURS + ' hours.</p>'
    + '<button type="button" class="hh-tool is-primary hb-buy-go" data-hs-act="stam-go"></button>'
    + '<p class="hh-intent-msg hb-buy-msg" role="status" aria-live="polite"></p></div>';
}

/* Why the next refill cannot be bought, in the server's refusal words, or null. */
function whyNot(q, purse) {
  if (!q) return 'The server has not priced a refill yet.';
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
  const st = staminaOf(cs), q = staminaRefillOf(cs), purse = goldOf(cs);
  const why = whyNot(q, purse);
  text(box.querySelector('.hb-buy-now'), st ? hoursWords(st.msLeft) + ' of ' + hoursWords(st.capMs) : '');
  text(box.querySelector('.hb-buy-quote'), q && q.available ? 'One refill: +' + hoursWords(q.restoreMs) + ' for ' + gold(q.price) + '.' : '');
  text(box.querySelector('.hb-buy-day'), q ? 'Bought today: ' + whole(q.boughtToday) + ' of ' + whole(q.perDay) + '. Each one costs more.' : '');
  text(box.querySelector('.hb-buy-why'), why || '');
  cls(box.querySelector('.hb-buy-premium'), 'is-on', !isPremium(cs));
  const go = box.querySelector('.hb-buy-go');
  text(go, q && q.available ? 'Buy +' + hoursWords(q.restoreMs) + ' · ' + gold(q.price) : 'Buy');
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
  if (open) {
    s.msg = '';
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
  if (action !== 'stam-go') return false;
  const cs = ctx.character, q = staminaRefillOf(cs);
  if (s.pending || whyNot(q, goldOf(cs))) { repaint(); return true; }
  s.pending = true;
  s.msg = 'Buying stamina…';
  repaint();
  answerWithin(() => cs.buyStamina(q.price)).then((r) => {
    s.pending = false;
    s.msg = r.ok ? 'Stamina restored.' : refusalWords(r.error);
    repaint();
  });
  return true;
}
