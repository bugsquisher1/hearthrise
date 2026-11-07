// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/chat-crier.js — THE TOWN CRIER, ON THE CHAT'S GLOBAL TAB.
//
// A button on the Global tab opens a small bar under the field: the line in the field goes out to everyone online, on a gold band under the Crier's mark, for the price the server
// quotes (hr_town_sinks_view on opening and after each press). Cry it sends ONE hr_crier_send with the price the player saw; a press on the last line cries that
// line again. Every number is the server's, and every refusal is the server's in the Crier's words (src/shell/sink-words.js). Display scratch only.
// ════════════════════════════════════════════════════════════════════════
import { CRIER } from '../../data/chat-channels.js?v=0.2.106';
import { readSinks } from '../../session/town-intents.js?v=0.2.106';
import { text, cls, prop } from '../../render/paint.js?v=0.2.106';
import { whole, gold } from '../../render/format.js?v=0.2.106';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.106';
import { refusalText, refusalWords } from '../intent-words.js?v=0.2.106';

const STATE = new WeakMap();
const stateOf = (body) => { let s = STATE.get(body); if (!s) { s = { open: false, quote: null, asking: false, stale: true, pending: false, msg: '' }; STATE.set(body, s); } return s; };

/** "Cry it: 1,000 gp". Pure. */
export function cryWords(price) {
  return CRIER.cry + (Number.isSafeInteger(price) ? ': ' + gold(price) : '');
}

/** The mark at the head of a paid line (src/shell/windows/chat.js). */
export function crierMarkHtml() {
  return '<span class="hc-crier-mark">' + esc(CRIER.mark) + '</span>';
}

/** The button on the input's row (built once, with the chat's skeleton). */
export function crierButtonHtml() {
  return '<button type="button" class="hh-tool hc-crier-open" data-hs-act="crier" aria-expanded="false">' + esc(CRIER.label) + '</button>';
}

/** The bar under the input (built once, with the chat's skeleton). */
export function crierBarHtml() {
  return '<div class="hc-crier"><div class="hc-crier-do"><button type="button" class="hh-tool is-primary hc-cry" data-hs-act="crier-go"></button>'
    + '<button type="button" class="hh-tool hc-again" data-hs-act="crier-again"></button></div>'
    + '<p class="hc-crier-msg" role="status" aria-live="polite"></p></div>';
}

function ask(body, ctx) {
  const s = stateOf(body);
  if (s.asking || !ctx.account || !ctx.character) return;
  s.asking = true; s.stale = false;
  readSinks(ctx.account, ctx.character).then((r) => {
    s.asking = false;
    if (r.ok && r.sinks.crier) s.quote = r.sinks.crier;
    else if (!r.ok) s.msg = refusalText(r, ctx.character);
    ctx.refresh('chat');
  });
}

/** Called from the chat's patch. `global`: the Global tab is on show. */
export function patchCrier(body, ctx, global) {
  const s = stateOf(body);
  const btn = body.querySelector('.hc-crier-open');
  prop(btn, 'hidden', !global);
  btn.setAttribute('aria-expanded', String(global && s.open));
  const bar = body.querySelector('.hc-crier');
  cls(bar, 'is-on', global && s.open);
  cls(body.querySelector('.hc-chat'), 'is-crying', global && s.open);
  if (!global || !s.open) return;
  if (s.stale) ask(body, ctx);
  const q = s.quote;
  /* the server's quote says a mute stands: both presses are off and the line says why, before any press */
  const muted = !!(q && q.mutedUntil);
  const cry = body.querySelector('.hc-cry');
  text(cry, q && q.price === null ? CRIER.done : cryWords(q ? q.price : null));
  prop(cry, 'disabled', s.pending || !q || q.price === null || muted);
  const again = body.querySelector('.hc-again');
  const last = q && q.lastLine;
  prop(again, 'hidden', !last);
  if (last) { text(again, 'Again: ' + last); again.title = last; }
  prop(again, 'disabled', s.pending || !q || q.price === null || muted);
  /* one line under the buttons: the server's answer while it stands, what the Crier does otherwise */
  text(body.querySelector('.hc-crier-msg'), s.msg || (muted ? refusalWords('muted', 'crier') : q ? CRIER.note(q) : 'Asking the Crier…'));
}

async function press(ctx, body, words, viaDraft) {
  const s = stateOf(body);
  const social = ctx.account && ctx.account.social;
  if (!social || s.pending || !s.quote || s.quote.price === null || s.quote.mutedUntil) return;
  s.pending = true; s.msg = ''; ctx.refresh('chat');
  const links = viaDraft ? social.chat.draft.links : [];
  const r = await social.chat.cry(words, links, s.quote.price);
  s.pending = false;
  s.stale = true;
  if (r.ok) s.msg = 'Paid ' + gold(r.price) + '. ' + (Number.isInteger(r.n) && Number.isInteger(r.perDay) ? whole(r.n) + ' of ' + whole(r.perDay) + ' today.' : '');
  else s.msg = refusalText(r, ctx.character);
  ctx.refresh('chat');
}

/** The chat's act hook: true when the action was the Crier's. */
export function actCrier(ctx, body, action, ev) {
  if (ev.type !== 'click') return false;
  const s = stateOf(body);
  if (action === 'crier') { s.open = !s.open; s.msg = ''; if (s.open) s.stale = true; ctx.refresh('chat'); return true; }
  if (action === 'crier-go') {
    const field = body.querySelector('.hc-field');
    if (!field.value.trim()) { s.msg = CRIER.empty; ctx.refresh('chat'); return true; }
    press(ctx, body, field.value, true);
    return true;
  }
  if (action === 'crier-again') { if (s.quote && s.quote.lastLine) press(ctx, body, s.quote.lastLine, false); return true; }
  return false;
}
