// ════════════════════════════════════════════════════════════════════════
// src/render/device-px.js — PIXEL ART STAYS WHOLE ON A SCALED SCREEN (Tyler 2026-11-16: the game looked
// blurry and grainy at Windows' 125 % and 150 %).
//
// A Windows display scale is a devicePixelRatio of 1.25 or 1.5, so a 6 px frame is 7.5 device px and a
// 32 px icon 40: the art's pixels came out 2 and 3 device px wide side by side. This writes the screen's
// ratio as --dpr on <html>; src/styles/tokens.css turns it into --art-px (one art px of a UI frame, plate
// or mark) and --icon-step (a 32-art-px icon at x1), each a WHOLE number of device px. A screen whose scale
// changes is written again: a window dragged to a display of another scale keeps its CSS size (only the
// resolution query hears it), a browser zoom or a new display scale resizes the page. A property of the
// device: nothing gates or spends on it.
// ════════════════════════════════════════════════════════════════════════

/* The query that hears the next change, held here: a MediaQueryList only its own listener holds is collected, and its
   change never comes. */
let watching = null;

/** Write --dpr on `win`'s <html> now and again whenever the screen's scale changes, for the page's life. */
export function mountDevicePx(win) {
  const root = win.document.documentElement;
  const write = () => {
    const dpr = win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    if (root.style.getPropertyValue('--dpr') !== String(dpr)) root.style.setProperty('--dpr', String(dpr));
    if (watching) watching.removeEventListener('change', write);
    /* matches only this exact ratio, so its change is the next one (MDN's watch for a devicePixelRatio change) */
    watching = typeof win.matchMedia === 'function' ? win.matchMedia('(resolution: ' + dpr + 'dppx)') : null;
    if (watching) watching.addEventListener('change', write);
  };
  write();
  win.addEventListener('resize', write);
}
