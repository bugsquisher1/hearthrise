// ============================================================
// src/render/modal-sheet.js — the ONE Escape for sheet-shaped modals (b556)
//
// Pairs with the `.hr-scrim` / `.hr-sheet` layout primitive at the end of
// src/styles/art-direction.css. The layout keeps every sheet on screen; this
// decides what Escape does while one is up: it presses the TOP sheet's own
// `[data-hr-dismiss]` control, so a sheet closes exactly the way its owner
// closes it (the owner's click handler, its own teardown, its own latch).
//
// WHY NOT closeAllModals: showTab calls that on every navigation, and so does
// the suite's harness. A dismiss wired there would drop the away receipt on any
// tab change, and WELCOME_GATE never re-opens a dismissed card.
//
// RULES:
//   · "open" is what the player sees: connected, rendered (display, visibility,
//     pointer-events), with a box. Owners open sheets their own way (`.show`,
//     node insertion, inline display) and this reads the result, not the method.
//   · The top sheet is the highest computed z-index; on a tie the later node.
//   · Escape is CONSUMED by any open sheet, dismiss control or not, so one
//     keypress never falls through to close a layer underneath.
//   · Never put `data-hr-dismiss` on a committing control (a claim, a KO action,
//     a confirm's Yes) — Escape would then commit.
//
// Classic IIFE, loaded before legacy.js, whose global Escape listener calls it.
// Reads the DOM only; writes no game state.
// ============================================================
(function () {
  'use strict';

  function isOpen(el) {
    if (!el.isConnected) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none'
      && el.getClientRects().length > 0;
  }

  function topOpen() {
    var top = null, topZ = -Infinity;
    document.querySelectorAll('.hr-scrim').forEach(function (el) {
      if (!isOpen(el)) return;
      var z = parseInt(getComputedStyle(el).zIndex, 10);
      if (isNaN(z)) z = 0;
      if (z >= topZ) { top = el; topZ = z; }   // >= : the later node wins a tie
    });
    return top;
  }

  function closeTop() {
    var top = topOpen();
    if (!top) return false;
    var dismiss = top.querySelector('[data-hr-dismiss]');
    if (dismiss) dismiss.click();
    return true;
  }

  window.HearthriseSheet = { topOpen: topOpen, closeTop: closeTop };
})();
