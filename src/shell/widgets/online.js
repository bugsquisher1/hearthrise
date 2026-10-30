// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/online.js — "3 ONLINE": HOW MANY PLAYERS THE SERVER COUNTS.
//
// Tracker r16. One short line, the number the server answered
// (ctx.account.social.online, src/social/players-online.js); a dash while
// there is no fresh answer. Built once; the display tick patches it in place.
// ════════════════════════════════════════════════════════════════════════
import { text, attr } from '../../render/paint.js?v=0.2.73';
import { onlineWords } from '../../social/players-online.js?v=0.2.73';

/** The skeleton (built once). */
export function renderOnline() {
  return '<p class="hs-online" role="status" aria-live="off"><span class="hs-online-dot" aria-hidden="true"></span><span class="hs-online-n"></span></p>';
}

renderOnline.patch = function patchOnline(el, ctx) {
  const s = ctx.account && ctx.account.social;
  const n = s && s.online ? s.online.count : null;
  text(el.querySelector('.hs-online-n'), onlineWords(n));
  attr(el.querySelector('.hs-online'), 'title', n === null ? 'Players online: waiting for the server' : 'Players online right now, counted by the server');
};
