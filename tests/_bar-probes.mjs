#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/_bar-probes.mjs — WHAT THE ACTION BAR'S PAGE RULES MEASURE, SHARED.
//
// Not a guard: tests/hunt-screen.mjs (HS-27, the desktop) and tests/phone-touch.mjs (PH-7, the phone) import it.
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════

/* THE RING'S WORDS INSIDE ITS DISC (Tyler 10-25: "the circle just needs to be smoothed out", text inside): every shown
   word's INK box (its line box's baseline from the font's ascent, then the glyphs' own ascent and descent, measured on
   a canvas in the word's computed font) ends at least 1 px inside the inner disc (r 40 of the ring's 120 units,
   vitals-hub.js). `bitmap` / `crisp`: the old pixel medallion (bar-medal.png with its clock ticks and stepped bezel,
   drawn crispEdges) is gone. Page source, evaluated with (0, eval). */
export const RING_WORDS = `(() => { const m = document.querySelector('.hb-medal'); if (!m || !m.getClientRects().length) return { err: 'no ring' };
  const b = m.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, r = b.width * 40 / 120;
  const g = document.createElement('canvas').getContext('2d'), out = []; let n = 0;
  for (const el of m.querySelectorAll('.hb-medal-in *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el); g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const t = g.measureText(node.textContent), rg = document.createRange(); rg.selectNodeContents(node);
      for (const q of rg.getClientRects()) {
        n++;
        const base = q.top + t.fontBoundingBoxAscent, top = base - t.actualBoundingBoxAscent, bottom = base + t.actualBoundingBoxDescent;
        for (const [x, y] of [[q.left, top], [q.right, top], [q.left, bottom], [q.right, bottom]]) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > r - 1) out.push(node.textContent.trim() + ' at ' + Math.round(d * 10) / 10 + ' of ' + Math.round(r * 10) / 10);
        }
      }
    }
  }
  const svg = m.querySelector('svg');
  return { n, out, bitmap: getComputedStyle(m).backgroundImage !== 'none', crisp: !svg || getComputedStyle(svg).shapeRendering === 'crispedges' || svg.getAttribute('shape-rendering') === 'crispEdges' };
})()`;

/* THE SAME CHECK AT THE WIDEST WORDS THE RING SHOWS: a two-digit XP percent (a Level spends nine tenths of its time
   there) under a three-digit Level (Level 999 is about 22,700 hunting hours, over five years at 12 h a day, on the 10-25
   curve), on the same faces. The fixture's own value is luck: v0.2.57 went red when the 10-25 curve moved it from "XP 0%"
   to "XP 11%" and the Linux fallback face ran the line 0.6 px past the disc. The words are put back as they were. Page
   source, (0, eval). */
export const RING_WORDS_WIDEST = `(() => { const v = document.querySelector('.hb-medal .hb-xp-v'), l = document.querySelector('.hb-medal .hb-lv');
  if (!v || !l) return { err: 'no ring words' };
  const was = [v.textContent, l.textContent]; v.textContent = '99%'; l.textContent = '999';
  try { return (0, eval)(${JSON.stringify(RING_WORDS)}); } finally { v.textContent = was[0]; l.textContent = was[1]; }
})()`;
