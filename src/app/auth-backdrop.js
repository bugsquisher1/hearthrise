// ════════════════════════════════════════════════════════════════════════
// src/app/auth-backdrop.js — THE HEARTH BEHIND THE ACCOUNT SCREENS (art audit 2026-11-19 §5: the sign-in stood on a black void).
//
// raiseBackdrop(root, win) puts Hearth Square behind the crest and the card: one still picture of the town's heart, drawn by
// the game's own renderer (assets/brand/hearth-square.png, tools/world-art/signin-backdrop.mjs), never the live World. It
// waits for the crest: the card and the crest paint first exactly as they did, and only then is the picture asked for. Once
// it has arrived (decoded, so it lands whole) it is set on the root as --auth-backdrop, which app.css draws under a flat
// scrim on every account screen. The root keeps it for the page's life, so the next account screen has it at once. A picture
// that cannot load leaves the screens as they were. Display only: nothing reads it.
// ════════════════════════════════════════════════════════════════════════

import { BUILD } from '../build-info.js?v=0.2.143';

const BACKDROP_SRC = 'assets/brand/hearth-square.png?v=' + BUILD.cache;

/** After this account screen's crest has arrived, fetch the Hearth picture once and show it behind every account screen. */
export function raiseBackdrop(root, win) {
  if (root.dataset.backdrop) return;   // asked for already (or here): one picture per page
  root.dataset.backdrop = 'asked';
  /* whole: a url() in a custom property resolves against the stylesheet that reads it (src/styles/), not the page */
  const src = new win.URL(BACKDROP_SRC, win.document.baseURI).href;
  const ask = () => {
    const img = new win.Image();
    img.decoding = 'async';
    img.onload = () => {
      root.style.setProperty('--auth-backdrop', 'url("' + src + '")');
      root.dataset.backdrop = 'shown';
    };
    img.onerror = () => { root.dataset.backdrop = 'failed'; };
    img.src = src;
  };
  /* after the frame that paints the crest: its load, then the next frame, then a turn */
  const after = () => win.requestAnimationFrame(() => win.setTimeout(ask, 0));
  const crest = root.querySelector('.auth-crest');
  if (!crest || crest.complete) after();
  else { crest.addEventListener('load', after, { once: true }); crest.addEventListener('error', after, { once: true }); }
}
