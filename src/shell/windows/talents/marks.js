// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/marks.js — THE ROADS' NODE LANGUAGE: ONE MARK PER KIND, AND THE LABEL PLACER (lane/r-ui-roads).
//
// docs/design/redesign/18-roads-review-ux.md section 4: shape and size tell the kind, fill tells the state, in screen px that never
// scale. Rank stone an 8 px square · waystone a 12 px ring with a dot · crossroads a 20 px diamond with a dot · hybrid crossroads the
// diamond with an inner diamond · border town a 20 px gabled house · vow a 14 x 24 menhir with one carved band (a border's vow split by
// a line) · open road three dots · the Great Hearth a hearth house with its flame. The states are CSS classes (src/styles/roads.css):
// is-locked, is-open (the frontier), is-route, is-owned. Colour is never the only cue: the kinds differ in silhouette first.
// Every mark is drawn round (0, 0) and placed by its group's transform.
//
// placeLabels: labels in priority order, each tries its spots in turn and drops out when every spot is taken (18 section 3). Only
// decision stones block a label (crossroads, towns, vows, the hearth); each label carries a halo (roads.css paint-order).
// PURE but for the markup strings: no DOM.
// ════════════════════════════════════════════════════════════════════════

/* the radius a mark covers, px (for the label placer's obstacles and the tap's reach) */
export const MARK_R = Object.freeze({ rank: 5, waystone: 7, crossroads: 11, hybrid: 11, crossing: 11, border: 11, vow: 12, open: 9, start: 26 });
/* the kinds a label may not cover */
export const BLOCKS = new Set(['crossroads', 'hybrid', 'crossing', 'border', 'vow', 'start']);

const diamond = (h) => 'M0,' + -h + ' L' + h + ',0 L0,' + h + ' L' + -h + ',0 Z';

/** The SVG markup of node `n`'s mark (inside its <g>). */
export function markOf(n) {
  switch (n.kind) {
    case 'rank': return '<rect class="rdm-f" x="-4" y="-4" width="8" height="8"/>';
    case 'waystone': return '<circle class="rdm-f" r="6"/><circle class="rdm-dot" r="2"/>';
    case 'crossroads': return '<path class="rdm-f" d="' + diamond(10) + '"/><circle class="rdm-dot" r="2"/>';
    case 'hybrid': return '<path class="rdm-f" d="' + diamond(10) + '"/><path class="rdm-in" d="' + diamond(5) + '"/>';
    case 'crossing': return '<path class="rdm-f" d="' + diamond(10) + '"/><rect class="rdm-in" x="-3" y="-3" width="6" height="6"/>';
    case 'border': return '<path class="rdm-f" d="M-10,-2 L0,-11 L10,-2 L8,-2 L8,8 L-8,8 L-8,-2 Z"/><rect class="rdm-dot" x="-2" y="2" width="4" height="6"/>';
    case 'vow': return '<path class="rdm-f" d="M-7,12 L-5.5,-7 L-2,-12 L3,-10.5 L6,-6 L7,12 Z"/><line class="rdm-cut" x1="-4.5" y1="1" x2="5" y2="-1"/>'
      + (n.countries ? '<line class="rdm-in" x1="0.5" y1="-8" x2="0.5" y2="9"/>' : '');
    case 'open': return '<circle class="rdm-od" cx="-6" r="2.2"/><circle class="rdm-od" r="2.2"/><circle class="rdm-od" cx="6" r="2.2"/><rect class="rdm-hit" x="-9" y="-5" width="18" height="10"/>';
    case 'start': return '<path class="rdm-yard" d="M-24,6 L-24,-6 L0,-26 L24,-6 L24,6 Z"/><rect class="rdm-wall" x="-18" y="-6" width="36" height="22"/>'
      + '<path class="rdm-flame" d="M0,12 C-7,10 -7,2 -2,-3 C-2,1 1,2 2,-1 C6,3 7,10 0,12 Z"/>';
    default: return '<circle class="rdm-f" r="5"/>';
  }
}

/** The four corner brackets of the selection (forged steel, never a dashed ring), round a mark of radius `r`. */
export function bracketsOf(r) {
  const k = 6, R = r + 5;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => '<path d="M' + sx * R + ',' + sy * (R - k) + ' L' + sx * R + ',' + sy * R + ' L' + sx * (R - k) + ',' + sy * R + '"/>').join('');
}

/**
 * PLACE THE LABELS. `labels`: [{ id, x, y, w, h, tries: [[dx, dy, anchor]...], pri, block? }] in screen px (x, y the anchor point,
 * `w` its measured width, `h` its line height); `obstacles`: [[x0, y0, x1, y1]...]. A label with block false is drawn wherever its
 * first spot is and covers nothing (a watermark). Returns { id: [x, y, anchor] | null }.
 */
export function placeLabels(labels, obstacles) {
  const placed = obstacles.slice();
  const hit = (b) => placed.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]));
  const out = {};
  for (const L of labels.slice().sort((a, b) => a.pri - b.pri)) {
    out[L.id] = null;
    for (const [dx, dy, anchor] of L.tries) {
      const x = L.x + dx, y = L.y + dy;
      const x0 = anchor === 'middle' ? x - L.w / 2 : anchor === 'end' ? x - L.w : x;
      const b = [x0 - 2, y - L.h * 0.8, x0 + L.w + 2, y + L.h * 0.25];
      if (L.block !== false && hit(b)) continue;
      out[L.id] = [x, y, anchor];
      if (L.block !== false) placed.push(b);
      break;
    }
  }
  return out;
}

/* the spots a label beside a stone of radius r tries: right, left, under, over */
export const beside = (r) => [[r + 6, 5, 'start'], [-(r + 6), 5, 'end'], [0, r + 16, 'middle'], [0, -(r + 6), 'middle']];
