// ============================================================
// src/render/retreat.js — what a RETREAT looks like (render layer)
//
// Render-layer extraction out of src/legacy.js, following the playbook in
// docs/design/render-extraction-pattern.md.
//
// WHAT THIS IS: ending the visible fight when the engine says the run is over.
// Presentation over state the SERVER already owns: it authors no number,
// declares no activity and writes no save. The rule that DECIDES a retreat is
// src/core/away.js + combat-sim's `resolveDeath`, and the state it produces is
// projected by accrue.js `reconcileFall`. The knocked-out ACTIVITY BAR is not
// here: legacy.js `refreshActivityBar` carries one check above the pointer
// dispatch that covers every knockout, retreat included.
// ============================================================
(function () {
  'use strict';

  /* THE RETREAT, ATTENDED. The run is over but the WINDOW is not, so the client
     stops SWINGING and says NOTHING to the server - `hrKnockOut()` already
     queued the settle that prices it (accrue.js reconcileFall).
     ⚠ NO `declareActivity` HERE, EVER: `stopCombat()` declares idle and the
       pre-switch collect refuses a window under the 60 s floor, so ending the
       run the obvious way would ERASE the window it happened in.
     ⚠ THE WARNING LATCH IS NOT RELEASED HERE - once per foe per tab session. */
  function retreat() {
    var G = window.G;
    G.activeMonster = null;
    if (Array.isArray(G.combatLog)) G.combatLog.push('You pulled back to camp. The fight is over for now.');
    if (typeof window.renderCombat === 'function') window.renderCombat();
    if (typeof window.renderMonsterList === 'function') window.renderMonsterList();
  }

  window.HearthriseRetreat = { retreat: retreat };

  console.log('Retreat surfaces: loaded');
})();
