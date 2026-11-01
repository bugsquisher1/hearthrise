// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/play-cap.js — THE PLAY CAP'S POPUP (Tyler 2026-11-01).
//
// "Lets make that popup in the middle of the screen": at the foot of a window
// the refusal read as if mining were broken. A centered modal (the `play-cap`
// row), the death popup's frame and foot, with one answer: OK.
//
// EVERY DOOR, ONE PLACE: a gathering or bench Start, Enter, a party's Start, Hunt
// again and an alert's Start again are all asks on the account's intent ledger
// (src/session/intent-ledger.js), so the popup listens there, and no door has
// to opt in. intent-words.js playCapOf names the refusal and keeps it off the
// window's own line. The words are REFUSAL_WORDS'; a party's start also says who
// held it back. The server sends no count on purpose, so none is shown.
// ════════════════════════════════════════════════════════════════════════
import { text, cls } from '../../render/paint.js?v=0.2.79';
import { REFUSAL_WORDS } from '../../data/refusal-words.js?v=0.2.79';
import { playCapOf, refusalText } from '../intent-words.js?v=0.2.79';

/* What this shell's popup says now, by its window manager. */
const SHOWN = new WeakMap();

/** The popup's words for a refused answer ({ words, seats }), or null when the play cap did not refuse it. Pure. */
function playCapWords(r) {
  const code = playCapOf(r);
  return code ? { words: REFUSAL_WORDS[code], seats: r.error === 'not_ready' ? refusalText(r) : '' } : null;
}

/** The skeleton (built once): the refusal, who it held back, OK. */
export function renderPlayCap() {
  return '<div class="hplaycap"><section class="hdeath-card">'
    + '<p class="hplaycap-words" role="alert"></p><p class="hdeath-line hplaycap-seats"></p>'
    + '<div class="hsum-actions hdeath-actions"><button type="button" class="hh-tool is-primary" data-hs-act="play-cap-ok">OK</button></div>'
    + '</section></div>';
}

/* The shell's mount: open the popup on each play-cap refusal this account's asks get. Returns the unsubscribe. */
renderPlayCap.follow = function followPlayCap(ctx, refresh) {
  const ledger = ctx.account && ctx.account.intents;
  if (!ledger || typeof ledger.subscribe !== 'function') return () => {};
  return ledger.subscribe((kind, entry) => {
    const said = kind === 'end' ? playCapWords(entry.result) : null;
    if (!said) return;
    SHOWN.set(ctx.wm, said);
    ctx.wm.open('play-cap');
    refresh('play-cap');
  });
};

renderPlayCap.patch = function patchPlayCap(body, ctx) {
  const said = SHOWN.get(ctx.wm) || { words: '', seats: '' };
  text(body.querySelector('.hplaycap-words'), said.words);
  const seats = body.querySelector('.hplaycap-seats');
  text(seats, said.seats);
  cls(seats, 'is-on', !!said.seats);
};

renderPlayCap.act = function actPlayCap(ctx, body, action, ev) {
  if (ev.type !== 'click' || action !== 'play-cap-ok') return false;
  ctx.wm.close('play-cap');
  return true;
};
