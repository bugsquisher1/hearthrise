'use strict';
// ════════════════════════════════════════════════════════════════════════
// desktop/src/policy.cjs — THE SHELL'S RULES, WITH NO ELECTRON IN THEM.
//
// Pure, so tests/policy.mjs runs them in plain Node:
//   gameUrlOf        which page the window plays. Always the live site; only a loopback address can replace it,
//                    so no shortcut or environment value can point the app at someone else's page.
//   decideNavigation where a press may go: the game stays in the window, an https or mailto link goes to the
//                    player's own browser, anything else (file:, steam:, custom schemes) goes nowhere.
//   tokenLinkFrom    the fragment of a hearthrise:// link in a command line, for the deep-link experiment. Not the
//                    recommended flow (see the board, 2026-11-04): a link read on a phone cannot reach this PC.
//   integerScaleFor  the whole-number device scale the page should see (CLAUDE.md §10: integer scales only).
// ════════════════════════════════════════════════════════════════════════

const GAME_URL = 'https://hearthrise.net/play.html';
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/;
/* The smallest page the desktop layout is tuned for; a whole-number scale that leaves less than this is not used. */
const MIN_CSS = Object.freeze({ width: 1280, height: 720 });

function gameUrlOf(env) {
  const asked = env && env.HR_DESKTOP_URL;
  if (!asked) return GAME_URL;
  try {
    const u = new URL(asked);
    if (u.protocol === 'http:' && LOOPBACK.test(u.hostname)) return u.href;
  } catch (e) { /* not a URL: the live site below */ }
  return GAME_URL;
}

/** 'stay' | 'browser' | 'refuse' for a page asking to go to `target`. */
function decideNavigation(target, gameUrl, offlineUrl) {
  let u;
  try { u = new URL(target); } catch (e) { return 'refuse'; }
  if (u.origin === new URL(gameUrl).origin && u.protocol === new URL(gameUrl).protocol) return 'stay';
  if (offlineUrl && u.href.split('#')[0] === offlineUrl) return 'stay';
  if (u.protocol === 'https:' || u.protocol === 'mailto:') return 'browser';
  return 'refuse';
}

/** The `#access_token=...` or `#error=...` of a hearthrise:// argument, or null. */
function tokenLinkFrom(argv) {
  const link = (argv || []).find((a) => typeof a === 'string' && /^hearthrise:\/\/auth\/?#/i.test(a));
  if (!link) return null;
  const hash = link.slice(link.indexOf('#'));
  return /^#(.*&)?(access_token|error|error_code)=/.test(hash) ? hash : null;
}

/**
 * Windows display scaling is often 125 or 150%. A page at those ratios draws a 32 px icon in 40 or 48 device px: fine for
 * a photo, uneven for pixel art. The World already keeps whole device pixels (src/world/core/camera.js); the DOM can't.
 * @param {{ scaleFactor: number, size: { width: number, height: number } }} display  Electron's display (size in DIP)
 * @returns {{ scale: number, zoom: number }} the whole-number scale to show, and the page zoom that gets there
 */
function integerScaleFor(display) {
  const s = Number(display && display.scaleFactor) || 1;
  const w = (display && display.size && display.size.width || 0) * s;
  const h = (display && display.size && display.size.height || 0) * s;
  let k = Math.max(1, Math.floor(s + 1e-6));
  while (k > 1 && (w / k < MIN_CSS.width || h / k < MIN_CSS.height)) k--;
  return { scale: k, zoom: k / s };
}

module.exports = { GAME_URL, MIN_CSS, gameUrlOf, decideNavigation, tokenLinkFrom, integerScaleFor };
