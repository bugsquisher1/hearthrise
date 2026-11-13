// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/boss-call-pane.js — CALL OUT ON A GROUND'S PAGE (src/data/boss-calls.js; Tyler 2026-11-04).
//
// One section under Go as, on a ground whose boss can be called: the server's price and calls left, the press, then the
// warning with its one confirm (the 11-04 risk ruling: a warned choice, one confirm press). Every number is the server's
// quote (hr_boss_call_view, read when the page opens on it; a stale price only earns quote_changed). The press stays off
// until a quote says yes, and says why when it doesn't. hunts.js owns the window, its status line and the run of the press.
// A LIVE EVENT (Open Halls, 2027-03-22-live-events.sql §4) moves only the server's quote: a quote of 0 that names its event reads
// that event's words (live-events-view.js callEventWords): its line before today's, "for free" on the press and the confirm, its
// warning in place of the fee's. The event coming on or going off on the server's clock reads the quote again (feeKey).
// ════════════════════════════════════════════════════════════════════════
import { text, prop, cls } from '../../render/paint.js?v=0.2.125';
import { whole } from '../../render/format.js?v=0.2.125';
import { BOSS_CALL_RULES, BOSS_CALL_WORDS, callFromGround, isGuarded } from '../../data/boss-calls.js?v=0.2.125';
import { MONSTERS } from '../../data/monsters.js?v=0.2.125';
import { callOut } from '../../session/boss-intents.js?v=0.2.125';
import { readCall } from '../../session/boss-quote.js?v=0.2.125';
import { callEventWords, feeKey } from '../live-events-view.js?v=0.2.125';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { call: null, key: '', quote: null, asking: false, warned: false }; SCRATCH.set(cs, s); } return s; };
/* A quote is read again on a new ground or a new party, or once this old: the day's count may have moved on another hero. */
const QUOTE_STANDS_MS = 60000;

/** {Boss}, {boss}, {fee}, {minutes} and {guard} (his adds shield him, or nothing) in one of the table's lines. */
export function callWords(line, call, price) {
  return line.replace('{Boss}', call.Boss).replace('{boss}', call.boss).replace('{fee}', whole(price === undefined ? call.fee : price))
    .replace('{minutes}', String(BOSS_CALL_RULES.limitMs / 60000)).replace('{guard}', isGuarded(MONSTERS[call.monster]) ? BOSS_CALL_WORDS.warnGuard : '');
}
const leftWords = (q) => {
  const w = BOSS_CALL_WORDS.left;
  return q.left === 0 ? w.none : q.left === 1 ? w.one : w.other.replace('{n}', String(q.left));
};
/** The words for a refusal of this call (the designer's table), or null: the status line's general reader takes the rest. */
export function callRefusal(r, call) {
  const line = r && Object.hasOwn(BOSS_CALL_WORDS.refused, r.error) ? BOSS_CALL_WORDS.refused[r.error] : null;
  return line ? callWords(line, call) : null;
}

export function callHtml() {
  return '<section class="hw-hd-call" aria-label="Call out" hidden><h4 class="hw-hd-h">Call out</h4>'
    + '<p class="hw-call-line"></p>'
    + '<button type="button" class="hh-tool hw-call-press" data-hs-act="call-warn"></button>'
    + '<div class="hw-confirm hw-call-warn" role="group" aria-label="Are you sure?"><p class="hw-confirm-q"></p><p class="hw-confirm-note hw-call-note-alone" hidden></p><p class="hw-confirm-note hw-call-note-a"></p><p class="hw-confirm-note hw-call-note-b"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary is-on" data-hs-act="call-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="call-no"></button></div></div></section>';
}

/** Write the section for ground `v.hunt`; asks the server once when the page opens on it. */
export function patchCall(det, ctx, v) {
  const box = det.querySelector('.hw-hd-call');
  const call = callFromGround(v.hunt);
  prop(box, 'hidden', !call);
  if (!call) return;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  /* A fee event coming on or going off moves the price: the key changes with it, so the quote is read again at once. */
  const key = call.id + ':' + (v.party ? v.party.id + ':' + v.party.seats.length : '') + ':' + feeKey(cs, call);
  if (sc.key !== key) { sc.key = key; sc.quote = null; sc.at = 0; sc.warned = false; }
  sc.call = call;
  const now = Date.now();
  /* One ask a minute, answered or not: a server that says nothing is not asked again on every repaint its own answer causes. */
  if (!sc.asking && !v.now && now - sc.at > QUOTE_STANDS_MS) {
    sc.asking = true;
    sc.at = now;
    const asked = key;
    readCall(ctx.account, cs, call.id).then((q) => { if (sc.key === asked) sc.quote = q; }, () => null)
      .finally(() => { sc.asking = false; ctx.refresh('hunts'); });
  }
  const q = sc.quote;
  const open = !!q && q.available && !v.now && !v.pending;
  /* The quote's event, when it set the price (null: today's words). Its line goes first; today's reasons still follow it. */
  const ev = v.now ? null : callEventWords(cs, call, q);
  const said = v.now ? BOSS_CALL_WORDS.hunting : !q ? BOSS_CALL_WORDS.noQuote : q.available ? leftWords(q) : (callRefusal({ error: q.why }, call) || BOSS_CALL_WORDS.noQuote);
  /* No quote yet: the press names him at the data's fee, off, until the server has said; off, it always says why, beside it. */
  text(box.querySelector('.hw-call-line'), ev && ev.line ? ev.line + ' ' + said : said);
  const press = box.querySelector('.hw-call-press');
  text(press, callWords(ev ? ev.press : BOSS_CALL_WORDS.press, call, q ? q.price : undefined));
  prop(press, 'disabled', !open);
  prop(press, 'hidden', sc.warned && open);
  const warn = box.querySelector('.hw-call-warn');
  cls(warn, 'is-on', sc.warned && open);
  if (sc.warned && open) {
    text(warn.querySelector('.hw-confirm-q'), callWords(BOSS_CALL_WORDS.warnTitle, call, q.price));
    /* ALONE, A WARNING, NEVER A REFUSAL (designer's ruling 2, 2026-11-10): one more line, first, when the server says the room holds this hero only. */
    const alone = warn.querySelector('.hw-call-note-alone');
    prop(alone, 'hidden', !q.alone);
    text(alone, q.alone ? callWords(BOSS_CALL_WORDS.warnAlone, call, q.price) : '');
    text(warn.querySelector('.hw-call-note-a'), callWords(BOSS_CALL_WORDS.warn[0], call, q.price));
    text(warn.querySelector('.hw-call-note-b'), callWords(ev ? ev.warn : BOSS_CALL_WORDS.warn[1], call, q.price));
    text(warn.querySelector('[data-hs-act="call-go"]'), callWords(ev ? ev.confirm : BOSS_CALL_WORDS.confirm, call, q.price));
    text(warn.querySelector('[data-hs-act="call-no"]'), BOSS_CALL_WORDS.cancel);
  }
}

/**
 * The section's presses. `run(send, busy, done)` is hunts.js's: the status line, the setup Go as chose, the close on a hunt under way.
 * Answers true when the action was this section's.
 */
export function actCall(ctx, action, repaint, run) {
  if (action !== 'call-warn' && action !== 'call-no' && action !== 'call-go') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (action === 'call-warn') { sc.warned = true; repaint(); return true; }
  if (action === 'call-no') { sc.warned = false; repaint(); return true; }
  const { call, quote } = sc;
  if (!call || !quote || !quote.available) return true;
  sc.warned = false;
  const answered = quote.alone ? BOSS_CALL_WORDS.answered.alone : BOSS_CALL_WORDS.answered.party;
  run(() => callOut(ctx.account, cs, call.id, quote.price), callWords(BOSS_CALL_WORDS.calling, call, quote.price), () => callWords(answered, call, quote.price))
    .then((r) => { if (r && r.quote) sc.quote = r.quote; else sc.at = 0; repaint(); });
  return true;
}
