// ════════════════════════════════════════════════════════════════════════
// src/shell/hearth-fire.js — THE GREAT HEARTH'S FIRE ON ITS TAB (the designer's ruling D-7 section 1.5; lane/c-social FB-12).
//
// Above the powders: the fire's marks as five pips and its line ("Fire: 2 / 5"), when the Hearthrise lights and at what size, the fuel
// to the next mark, and the one line that says what the fire is for (so a fire nobody has fed yet still explains itself, S-18 c). Every
// number is the server's `hearth_fire` section (live-events-view.js fireLines); nothing shows while the server sends no fire.
// ════════════════════════════════════════════════════════════════════════
import { text, cls } from '../render/paint.js';
import { fireLines } from './live-events-view.js';
import { HEARTHRISE_FIRE } from '../data/hearthrise.js';

/** The block's skeleton: five pips and four lines. */
export function fireHtml() {
  let pips = '';
  for (let i = 0; i < HEARTHRISE_FIRE.marks; i++) pips += '<span class="hv-fire-pip" aria-hidden="true"></span>';
  return '<section class="hv-fire" hidden><h4 class="hv-fire-head"><span class="hv-fire-name"></span><span class="hv-fire-pips">' + pips + '</span>'
    + '<span class="hv-fire-marks"></span></h4><p class="hv-fire-lights"></p><p class="hv-fire-next"></p><p class="hv-fire-explain"></p></section>';
}

/** Patch the block from the hero's envelope. */
export function patchFire(root, cs) {
  const box = root.querySelector('.hv-fire');
  if (!box) return;
  const f = fireLines(cs);
  box.hidden = !f;
  if (!f) return;
  text(box.querySelector('.hv-fire-name'), f.title);
  text(box.querySelector('.hv-fire-marks'), f.marks);
  text(box.querySelector('.hv-fire-lights'), f.lights);
  text(box.querySelector('.hv-fire-next'), f.next);
  text(box.querySelector('.hv-fire-explain'), f.explain);
  cls(box, 'is-full', f.full);
  box.querySelectorAll('.hv-fire-pip').forEach((p, i) => cls(p, 'is-lit', i < f.filled));
}
