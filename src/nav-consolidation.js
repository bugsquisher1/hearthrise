// ============================================================
// src/nav-consolidation.js
//
// Two jobs:
//
//   1. The Combat panel's shortcut through to Events (dungeons).
//   2. THE SHOPS TOGGLE (b230) — window.HearthShops.
//
// b230 removed this module's original reason to exist. It used to
// compensate for nav entries that were hidden in CSS by injecting
// replacement buttons into panels at runtime: a "Premium Store"
// button into the Market panel and a "← Back to Market" button
// into the Store panel. Both were absolutely-positioned strays,
// and the Premium Store one DELETED ITSELF on every market
// re-render (market.js assigned panel.innerHTML, wiping any
// injected sibling) — so it flickered back only because a 500ms
// interval kept re-adding it.
//
// A navigation control that has to be re-injected twelve times a
// second is not navigation. The three shops are now one real
// destination with a real toggle, in static markup, and this
// module only drives it.
// ============================================================

(function(){
  'use strict';

  // ── THE SHOPS TOGGLE ─────────────────────────────────────────
  // Three toggles, two hosts: #panel-shop carries Local Shop and
  // Premium Shop (they share every `#panel-shop …` rule already
  // written for them), #panel-market carries Market. The strip is
  // duplicated into both hosts as static markup rather than moved
  // or injected, so no re-render can destroy it.
  var PANES = ['local', 'market', 'premium'];
  var PANE_ALIAS = {
    shops: null,            // null → "whatever was last chosen"
    shop: 'local', store: 'local', stores: 'local', localshop: 'local',
    'local-shop': 'local', local: 'local', seedshop: 'local', shopfront: 'local',
    market: 'market', exchange: 'market', marketplace: 'market',
    premium: 'premium', premiumshop: 'premium', 'premium-shop': 'premium',
    gems: 'premium', iap: 'premium'
  };
  // Session-scoped, exactly the window._tdPane convention (see the
  // Character doll): the choice survives every re-render and every
  // trip away and back, but a fresh load always opens on the Local
  // Shop. That is deliberate — Tyler's complaint was that the
  // in-game shop was impossible to find, so it is the front door,
  // and a player who browsed the Market last session must not have
  // that front door silently replaced the next time they log in.
  /* THE PREMIUM PANE IS A NATIVE-BUILD SURFACE (the front door).
     On the web build every pack showed a $ price and every Buy answered "not
     available in the web beta" (legacy.js IAP.buy) — a shop that refuses each
     sale is a dead door, met in a new player's first look at Shops. So the
     toggle and the pane exist only where IAP.detectPlatform() names a store
     (Steam / iOS / Android). Fail-safe is CLOSED: no IAP module yet reads as
     web. `data-hr-off-premium` on <html> is the one switch art-direction.css
     reads; a remembered or linked 'premium' falls back to the Local Shop. */
  var _forcePremium = null;   // test seam only (__forcePremium)
  function premiumOpen(){
    if (_forcePremium !== null) return _forcePremium;
    try {
      var I = window.IAP;
      return !!(I && typeof I.detectPlatform === 'function' && I.detectPlatform() !== 'web');
    } catch (e) { return false; }
  }
  function stampPremium(){
    try { document.documentElement.toggleAttribute('data-hr-off-premium', !premiumOpen()); } catch (e) {}
  }
  stampPremium();
  function currentPane(){
    var p = PANES.indexOf(window._shopsPane) >= 0 ? window._shopsPane : 'local';
    return (p === 'premium' && !premiumOpen()) ? 'local' : p;
  }
  function paneFor(tab){
    var key = String(tab || '').toLowerCase();
    var p = Object.prototype.hasOwnProperty.call(PANE_ALIAS, key) ? PANE_ALIAS[key] : undefined;
    if (p === null) return currentPane();          // 'shops' → remembered
    if (p === 'premium' && !premiumOpen()) return 'local';
    if (PANES.indexOf(p) >= 0) return p;
    return 'local';
  }
  var TAB_GLYPH = { local: 'navStore', market: 'navMarket', premium: 'gems' };
  function paintStrips(){
    document.querySelectorAll('.shops-tab').forEach(function(btn){
      var ic = btn.querySelector('.ic');
      if (!ic || ic.querySelector('.hr-glyph')) return;
      if (!(window.HR && window.HR.icon)) return;
      var pane = btn.getAttribute('data-shops-pane');
      // The glyph INHERITS the segment's colour (the b217 nav-glyph rule) so
      // the selected state reads on the icon too, and so the Premium
      // segment's sapphire is one colour rather than two: the stylesheet
      // paints `.shops-tab.is-premium .ic` and the glyph follows. Baking a
      // token in here instead would put --gem next to --sc-prem-ink inside
      // one 130px control.
      var g = window.HR.icon(TAB_GLYPH[pane], 17, null);
      if (g) ic.innerHTML = g;
    });
  }
  function apply(pane){
    stampPremium();
    if (PANES.indexOf(pane) < 0) pane = 'local';
    if (pane === 'premium' && !premiumOpen()) pane = 'local';
    window._shopsPane = pane;
    var shopPanel = document.getElementById('panel-shop');
    if (shopPanel) shopPanel.setAttribute('data-shops-pane', pane === 'market' ? currentLocalSide() : pane);
    document.querySelectorAll('.shops-tab').forEach(function(btn){
      var on = btn.getAttribute('data-shops-pane') === pane;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    // showTab() lit the nav button whose data-tab matched the panel it
    // opened — 'shop' or 'market'. The player clicked "Shops"; that is
    // the entry that has to look selected, on the rail AND in the More
    // sheet.
    document.querySelectorAll('.nav-btn,.bn-btn').forEach(function(b){
      if (b.dataset.tab === 'shops') b.classList.add('active');
      else if (b.dataset.tab === 'shop' || b.dataset.tab === 'market') b.classList.remove('active');
    });
    paintStrips();
  }
  // While the Market is showing, #panel-shop is off screen — leave its
  // attribute on whichever local side was last used so returning to it
  // does not flash the wrong card.
  function currentLocalSide(){
    var el = document.getElementById('panel-shop');
    var v = el && el.getAttribute('data-shops-pane');
    return v === 'premium' ? 'premium' : 'local';
  }
  window.HearthShops = { paneFor: paneFor, apply: apply, panes: PANES, repaint: paintStrips,
    premiumOpen: premiumOpen,
    /* Suite seam: `true` plays a native build, `null` hands back to the platform. */
    __forcePremium: function (on) { _forcePremium = (on === null || on === undefined) ? null : !!on; stampPremium(); } };

  // One delegated listener for both copies of the strip.
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('.shops-tab');
    if (!btn) return;
    var pane = btn.getAttribute('data-shops-pane');
    if (PANES.indexOf(pane) < 0) return;
    if (pane === 'premium' && !premiumOpen()) return;
    e.preventDefault();
    if (typeof window.showTab === 'function') window.showTab(pane === 'local' ? 'shop' : pane);
  });

  /* THE COMBAT EVENTS SHORTCUT IS RETIRED, injector and all (FIGHT-EVENTS-
     SHORTCUT-1). b362 retired it for the War Table, whose Dungeons and World
     Events destination cards replace it, but kept an injector for "the style
     ribbon is up, the views are not" - and a copy that landed in the ribbon was
     KEPT once the views were built. On a slow boot (~1 in 4 fresh loads) the
     Fight screen's stance block grew an Events row, which at 922x423 pushed the
     food row 5px out of the arena card (the FIGHT-PHONE-DENSITY "flake"). */

  /* b230: injectMarketStoreLink() and injectShopBackLink() are GONE.
     They were the two halves of a manual round-trip between two screens that
     are now two toggles on one screen: a "Premium Store" button floating in
     the Market panel's corner and a "← Back to Market" button floating in
     the Store panel's corner. The first one was also a live bug — market.js
     rendered with panel.innerHTML, which destroyed it on every search
     keystroke, sort change, listing and cancellation; it reappeared only
     because bootAll ran on a 500ms interval. The toggle strip is static
     markup in both hosts and cannot be re-rendered away. */
  function injectDungeonsBackLink() {
    // b220 (#14): with Events as a real top-level entry the dungeon list is no
    // longer a dead-end sub-panel reached only from Combat, so a "← Back to
    // Combat" escape hatch is now misleading furniture. Skip it once Events
    // exists; the branch stays for the (impossible) case where it does not.
    if (document.getElementById('panel-events')) return;
    const dPanel = document.getElementById('panel-dungeons');
    if (!dPanel || dPanel.querySelector('#hr-dungeons-back')) return;
    const btn = document.createElement('button');
    btn.id = 'hr-dungeons-back';
    btn.type = 'button';
    btn.innerHTML = '← Back to Combat';
    // Same mobile-hide treatment as the shop back button (b131).
    // b217: a "back" link is the quietest control on a screen. It was set in
    // Cinzel uppercase with .12em tracking on a raised fill — the treatment
    // reserved for titles — so it competed with the panel heading beside it.
    btn.className = 'btn btn-sm btn-ghost';
    btn.style.cssText = 'position:absolute; top:12px; right:12px; z-index:5;';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('combat');
    });
    dPanel.style.position = 'relative';
    dPanel.appendChild(btn);
  }

  function bootAll() {
    injectDungeonsBackLink();
    paintStrips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootAll, 300));
  } else {
    setTimeout(bootAll, 300);
  }
  // Re-run after tab changes in case panels are dynamically (re)built
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-tab]')) {
      setTimeout(bootAll, 100);
    }
  });
  /* b217: the click listener above only fires for real clicks, so code paths
     that call showTab() directly never re-ran the boot pass. Hook showTab and
     keep a short retry so the shop strips paint however a panel is reached. */
  window.HearthriseShowTab.wrapShowTab('nav-consol-bootall', function () {
    setTimeout(bootAll, 60);
  });
  let tries = 0;
  const settle = setInterval(() => { bootAll(); if (++tries > 12) clearInterval(settle); }, 500);
})();
