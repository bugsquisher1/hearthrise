// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/online.js — "14 ONLINE": EVERY HERO THE SERVER COUNTS, AND WHAT THEY ARE DOING.
//
// Tracker r16; Tyler 2026-11-18. One short line, the total the server answered (ctx.account.social.online,
// src/social/players-online.js): every hero playing in a browser plus every hero still active with the game closed. On
// hover or keyboard focus, the server's lines by activity ("Hunting 3", "Feeding the Hearth 1", "In town 9"), which add up
// to the total; a line at 0 is left out. A dash and no lines while there is no fresh answer. Built once; the display tick
// patches it in place.
// ════════════════════════════════════════════════════════════════════════
import { text, rows, element } from '../../render/paint.js?v=0.2.139';
import { onlineWords, onlineLines } from '../../social/players-online.js?v=0.2.139';

/** The skeleton (built once): the dot, the total, and the lines the hover shows. */
export function renderOnline() {
  return '<p class="hs-online" role="status" aria-live="off" tabindex="0"><span class="hs-online-dot" aria-hidden="true"></span>'
    + '<span class="hs-online-n"></span><span class="hs-online-by"></span></p>';
}

renderOnline.patch = function patchOnline(el, ctx) {
  const s = ctx.account && ctx.account.social;
  const o = s && s.online;
  const lines = onlineLines(o ? o.by : null);
  text(el.querySelector('.hs-online-n'), onlineWords(o ? o.count : null));
  rows(el.querySelector('.hs-online-by'), lines, {
    key: (l) => l.id,
    build: () => element(ctx.doc, '<span class="hs-online-line"></span>'),
    patch: (row, l) => text(row, l.text),
  });
};
