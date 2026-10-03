// ============================================================
// src/render/bar-fit.js — the activity bar's fit tiers, MEASURED
//
// What gives way, in order (the Game Designer's ruling, FIGHT-PHONE-DENSITY:
// a chip gets SHORTER, never hidden). `data-fit` on the bar lists every step
// taken, so art-direction.css keys each on `[data-fit~=step]`:
//   (none)   the foe's name - pure CSS: `.ab-info` holds only what is left
//            over, the foe ellipsises, then wraps off and leaves "Fighting";
//   short    the chips' words - "Lifetime", "this fight", "Bounty", "away:",
//            Vigour's "of Vigour"/"pays" - become their glyphs;
//   tight    the status icon and the dry chip's "Out ·" (hourglass, red rim
//            and ×0.25 still say it);
//   compact  the Lifetime figure in compact form ("12M"). The chip stays; its
//            precision is what the bar can spare least harmfully - this fight,
//            to go, bounty and the away verdict decide the next minute, a
//            seven-figure tally reads the same at "12M" (Art Director's pick
//            for the Game Designer's give-way, 2026-10-03: 922x423 in Verdana
//            with a bounty still clipped "away: you fall" by 33px at `tight`).
//
// WHY MEASURED: the tiers used to be container queries in `ch` of the bar's
// face, calibrated on Verdana. Mid-game numbers (a seven-figure Lifetime, a
// five-figure "to go") clipped "away: you fall" in Segoe at 1280x800 while
// Alegreya, ~10% narrower, went glyph-only with 500px free. A threshold is a
// guess about the content; the overflow is the content. The fit steps up only
// while #ab-meta (the bar's last-resort shrinker, which clips) overflows and
// starts from 0 every time, so it steps back down when room returns.
// ============================================================

/** The steps, in the order they are taken. */
const STEPS = ['short', 'tight', 'compact'];

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
