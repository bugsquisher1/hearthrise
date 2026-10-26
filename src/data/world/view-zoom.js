// ════════════════════════════════════════════════════════════════════════
// src/data/world/view-zoom.js — THE TOWN ZOOM A VIEWER PICKS (Tyler 2026-10-26: "the map is
// just a bit too zoomed in").
//
// A zoom is CSS px per base art px (a 32 px tile is 32 x zoom CSS px). The town view's
// mouse wheel and its + / − buttons step through `steps`; the pick is the viewing
// character's display preference (residue `townZoom`, src/session/residue.js), never a
// server value: it gates and spends nothing.
//   steps    the zooms offered, ascending (1.5 joins only if Tyler picks it: it draws
//            uneven 1/2-px columns at DPR 1, art/review/town-zoom-2026-10-26)
//   desktop  the zoom before any pick
// Under the mobile query (src/world/core/camera.js MOBILE_QUERY) there is no control and no
// pick: the phone keeps the screen class's x2. The hunt view, the home and the sandbox keep
// the screen class's zoom too (camera.js zoomFor).
// ════════════════════════════════════════════════════════════════════════

export const TOWN_ZOOM = Object.freeze({
  steps: Object.freeze([1, 2]),
  desktop: 1,
});
