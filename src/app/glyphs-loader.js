// ════════════════════════════════════════════════════════════════════════
// src/app/glyphs-loader.js — THE ICON ATLAS, FETCHED ONCE AN ACCOUNT IS KNOWN.
//
// src/data/glyphs.js (window.HR_GLYPHS, 104 KB of baked game-icons paths) is
// read only by the game screen (the character strip, the shell's launchers,
// windows and HUD). The sign-in, characters and hero-creation screens draw no
// glyph, so the page no longer parses it before the sign-in form (opt-review
// 2026-10-28: 5 % of a first visit's bytes, a parser-blocking script). The
// boot asks for it at sign-in and the game screen waits for it before it
// mounts, so no window ever renders with an empty atlas.
//
// A failed fetch resolves too: every reader already treats a missing key as
// '' (src/shell/widgets/bits.js glyphSvg), so the game plays without icons
// rather than not at all; the next load tries again.
// ════════════════════════════════════════════════════════════════════════

const ATLAS = new URL('../data/glyphs.js?v=0.2.56', import.meta.url).href;
const PENDING = new WeakMap();

/** The atlas on `win` (window.HR_GLYPHS): one <script> per page, a promise that settles when it has run or failed. */
export function loadGlyphs(win) {
  if (win.HR_GLYPHS) return Promise.resolve(true);
  let p = PENDING.get(win);
  if (p) return p;
  p = new Promise((done) => {
    const doc = win.document;
    const s = doc.createElement('script');
    s.src = ATLAS;
    s.async = true;
    s.onload = () => done(true);
    s.onerror = () => { PENDING.delete(win); done(false); };
    doc.head.appendChild(s);
  });
  PENDING.set(win, p);
  return p;
}
