// src/render/buyback.js — vendor Buy Back modal (render layer)
// Nth render-layer strangler-fig extraction out of src/legacy.js (task #129).
// PURE REFACTOR — identical DOM + behaviour to legacy.js renderBuyback/openBuyback.
//
// Read-only paint of the closed vendor buy-back counter (see renderBuyback). It
// offers no control: repurchase(idx) in src/screens/shop-counter.js has no
// server verb and fails closed under armed gold.
//
// Callers, all bare/global so load order is free:
//   - openBuyback: window.openBuyback (no shipped door while the counter is closed)
//   - renderBuyback: repurchase() and repaintBalanceSurfaces() in shop-counter.js
// CSS (#bb-modal .bb-*) is already tokenised in src/styles/art-direction.css and
// left in place — shared modal chrome, nothing to convert.
(function () {
  'use strict';

  /* FAIL CLOSED (2026-09-28): there is no server buy-back verb (gold-sites
     BUYBACK_LEDGER), so under armed gold every repurchase() tap was refused
     after a priced, enabled button offered it. G.buyback is client-only residue
     — a past price the server never recorded — so it is not painted as a
     record either. The counter reopens when a server verb owns the list. */
  function renderBuyback(){
    var body = document.getElementById('bb-modal-body');
    if(!body) return;
    body.innerHTML = '<div class="bb-empty">The realm keeps no buy-back counter yet. Vendor sales are final.</div>';
  }

  function openBuyback(){
    var m = document.getElementById('bb-modal');
    if(!m){
      m = document.createElement('div');
      m.id = 'bb-modal'; m.className = 'modal';
      m.innerHTML = '<div class="modal-card"><div class="modal-head"><div class="modal-title">Buy Back</div>'
        + '<button class="btn btn-sm" onclick="document.getElementById(\'bb-modal\').classList.remove(\'show\')">Close</button></div>'
        + '<div id="bb-modal-body" class="bb-body"></div></div>';
      document.body.appendChild(m);
    }
    renderBuyback();
    m.classList.add('show');
  }

  window.renderBuyback = renderBuyback;
  window.openBuyback = openBuyback;
})();
