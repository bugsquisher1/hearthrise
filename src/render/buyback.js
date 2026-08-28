// src/render/buyback.js — vendor Buy Back modal (render layer)
// Nth render-layer strangler-fig extraction out of src/legacy.js (task #129).
// PURE REFACTOR — identical DOM + behaviour to legacy.js renderBuyback/openBuyback.
//
// Read-only paint: renders the G.buyback journal (items sold to a vendor) into a
// modal so the player can undo a sale. Writes no authoritative game state — the
// actual gold/inventory mutation lives in repurchase(idx), which stays global in
// legacy.js and is invoked via the inline onclick="repurchase(i)" below.
//
// Callers, all bare/global so load order is free:
//   - openBuyback: shop.js inline onclick="openBuyback()" (+ window.openBuyback)
//   - renderBuyback: repurchase() in legacy.js calls it bare after a buy-back
// Globals (G, ITEMS, _itemPath, itemFallbackIcon, balCanAfford) are resolved at
// CALL time via window.* so this module can load in any order after legacy.js.
// CSS (#bb-modal .bb-*) is already tokenised in src/styles/art-direction.css and
// left in place — shared modal chrome, nothing to convert.
(function () {
  'use strict';

  function renderBuyback(){
    var G = window.G || {};
    var ITEMS = window.ITEMS || {};
    var itemFallbackIcon = window.itemFallbackIcon || function(){ return ''; };
    var balCanAfford = window.balCanAfford || function(){ return false; };
    var body = document.getElementById('bb-modal-body');
    if(!body) return;
    var list = Array.isArray(G.buyback) ? G.buyback : [];
    if(!list.length){ body.innerHTML = '<div class="bb-empty">Nothing to buy back yet. Anything you sell to a vendor shows up here so you can undo it.</div>'; return; }
    body.innerHTML = list.map(function(b,i){
      var it = ITEMS[b.id]; if(!it) return '';
      var cost = b.unit * b.qty;
      var afford = balCanAfford(cost,'gold');
      var icon = (window._itemPath && window._itemPath[b.id]) ? '<img src="'+window._itemPath[b.id]+'" alt=""/>' : '<span class="bb-emoji">'+itemFallbackIcon(b.id, 24, it)+'</span>';
      return '<div class="bb-row">'
        + '<span class="bb-ic">'+icon+'</span>'
        + '<span class="bb-meta"><b>'+b.qty+'× '+it.n+'</b><span>sold for '+b.unit.toLocaleString()+' gp each</span></span>'
        + '<button class="btn btn-sm '+(afford?'btn-primary':'')+'" '+(afford?'':'disabled')+' onclick="repurchase('+i+')">Buy back · '+cost.toLocaleString()+' gp</button>'
        + '</div>';
    }).join('');
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
