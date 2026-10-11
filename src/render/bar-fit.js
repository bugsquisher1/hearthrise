// ============================================================
// src/render/bar-fit.js — the activity bar's fit tiers, MEASURED
//
// What gives way, in order (the Game Designer's ruling, FIGHT-PHONE-DENSITY:
// a chip gets SHORTER, never hidden). `data-fit` on the bar lists every step
// taken, so art-direction.css keys each on `[data-fit~=step]`:
//   (none)   the foe's name - pure CSS: `.ab-info` holds only what is left
//            over, the foe ellipsises, then wraps off and leaves "Fighting";
//   short    the chips' words - "Lifetime", "this fight", "Bounty", "away:",
//            Vigour's "of Vigour"/"pays", the XP chip's "STR" - become their
//            glyphs (the XP chip's is the skill's own; no glyph, it keeps "STR");
//   tight    the status icon and the dry chip's "Out ·" (hourglass, red rim
//            and ×0.25 still say it);
//   compact  the Lifetime figure in compact form ("12M"). The chip stays; its
//            precision is what the bar can spare least harmfully - this fight,
//            to go, bounty and the away verdict decide the next minute, a
//            seven-figure tally reads the same at "12M" (Art Director's pick
//            for the Game Designer's give-way, 2026-10-03: 922x423 in Verdana
//            with a bounty still clipped "away: you fall" by 33px at `tight`);
//   togo     the XP chip's to-go ("1.2M to go"). Below 10,000 compactNumber
//            prints the exact figure, which is when a level-up is near;
//   streak   this fight's count ("123K"), last: it is the screen's per-kill
//            heartbeat, and compacted it stops visibly ticking for 1,000 kills.
// Vigour, the bounty mark/required and the away verdict never compact, no chip
// is ever hidden, and every compacted chip's title carries its full figure
// (the Game Designer's rulings, 2026-10-03).
//
// WHY MEASURED: the tiers used to be container queries in `ch` of the bar's
// face, calibrated on Verdana. Mid-game numbers (a seven-figure Lifetime, a
// five-figure "to go") clipped "away: you fall" in Segoe at 1280x800 while
// Alegreya, ~10% narrower, went glyph-only with 500px free. A threshold is a
// guess about the content; the overflow is the content. The fit steps up only
// while #ab-meta (the bar's last-resort shrinker, which clips) overflows and
// starts from 0 every time, so it steps back down when room returns.
// ============================================================

import { compactNumber } from '../net/balance.js?v=565';

/** A figure in both forms for the fit steps to pick between: the full one
 *  while there is room, the compact one ("1.2M") once its chip's step is taken. */
export function figure(n) {
  const v = Number(n) || 0;
  return '<span class="ab-n-full">' + v.toLocaleString() + '</span><span class="ab-n-short">' + compactNumber(v) + '</span>';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** THE COMBAT BAR'S XP CHIP, "STR 72 · 1,228,825 to go". At `short` the three
 *  letters give way to the skill's own atlas glyph (the id setActivityIcon
 *  draws for it; no glyph, the letters stay), at `togo` the to-go compacts.
 *  The title and label always say it in full. Pure: legacy.js passes the
 *  server-projected level and to-go. */
export function xpChip({ skill, name, level, toGo, glyph }) {
  const max = level >= 99, lv = max ? 99 : level, lbl = String(skill).slice(0, 3).toUpperCase();
  const said = esc((name || skill) + ' ' + lv + (max ? '' : ' · ' + Number(toGo || 0).toLocaleString() + ' XP to go'));
  return '<span class="ab-xp" role="img" title="' + said + '" aria-label="' + said + '">'
    + (glyph ? glyph + '<span class="ab-chip-word">' + lbl + ' </span>' : lbl + ' ')
    + '<b>' + lv + '</b>' + (max ? '' : ' · ' + figure(toGo) + ' to go') + '</span>';
}

/* legacy.js is a classic script and cannot import; it reaches the builders here. */
if (typeof window !== 'undefined') window.HearthriseBarFit = { xpChip, figure };

/** The steps, in the order they are taken. */
const STEPS = ['short', 'tight', 'compact', 'togo', 'streak'];

/* The meta clips at its own edge (overflow hidden), so its scroll width is
   the truth; the last chip's edge catches a sub-pixel run the rounding hides. */
function overflows(meta) {
  if (!meta) return false;
  if (meta.scrollWidth > meta.clientWidth) return true;
  const last = meta.lastElementChild;
  return !!last && last.getBoundingClientRect().right > meta.getBoundingClientRect().right + 0.5;
}

/** Fit one bar, in whatever document it lives in (the suite's device frames
 *  have no scripts of their own). Returns how many steps it took. */
export function fitBar(bar) {
  if (!bar) return 0;
  const meta = bar.querySelector('.ab-meta');
  bar.removeAttribute('data-fit');
  let n = 0;
  while (n < STEPS.length && overflows(meta)) bar.setAttribute('data-fit', STEPS.slice(0, ++n).join(' '));
  return n;
}

/* Re-fit when the bar's width, its words, its face or its scale change. The
   meta is rewritten on every repaint with the same text most of the time, so
   the key keeps that from re-measuring. */
const watched = new WeakSet();
export function setupBarFit() {
  const bar = document.getElementById('activity-bar');
  if (!bar || watched.has(bar)) return;
  watched.add(bar);
  let frame = 0, key = '';
  const run = () => {
    frame = 0;
    const meta = bar.querySelector('.ab-meta');
    const k = [bar.clientWidth, bar.textContent, document.body.dataset.theme,
      meta ? getComputedStyle(meta).fontSize : ''].join('|');
    if (k !== key) { key = k; fitBar(bar); }
  };
  const ask = () => { if (!frame) frame = requestAnimationFrame(run); };
  new ResizeObserver(ask).observe(bar);
  new MutationObserver(ask).observe(bar, { childList: true, subtree: true, characterData: true });
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { key = ''; ask(); });
  ask();
}
