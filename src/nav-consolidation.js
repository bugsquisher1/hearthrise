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
  function currentPane(){
    return PANES.indexOf(window._shopsPane) >= 0 ? window._shopsPane : 'local';
  }
  function paneFor(tab){
    var key = String(tab || '').toLowerCase();
    var p = Object.prototype.hasOwnProperty.call(PANE_ALIAS, key) ? PANE_ALIAS[key] : undefined;
    if (p === null) return currentPane();          // 'shops' → remembered
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
    if (PANES.indexOf(pane) < 0) pane = 'local';
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
  window.HearthShops = { paneFor: paneFor, apply: apply, panes: PANES, repaint: paintStrips };

  // One delegated listener for both copies of the strip.
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('.shops-tab');
    if (!btn) return;
    var pane = btn.getAttribute('data-shops-pane');
    if (PANES.indexOf(pane) < 0) return;
    e.preventDefault();
    if (typeof window.showTab === 'function') window.showTab(pane === 'local' ? 'shop' : pane);
  });

  function injectCombatDungeonsLink() {
    const combatPanel = document.getElementById('panel-combat');
    if (!combatPanel) return;
    /* b362 — RETIRED BY THE WAR TABLE, AND IT WAS OVERLAPPING.
       This shortcut has a fallback that absolutely-positions it in the panel's
       top-right corner when the style ribbon is not up yet — and on the new
       combat screen that corner belongs to the gear quick-swap strip, so the
       two drew on top of each other (caught in the b362 visual gate). The old
       path is not lost: Dungeons and World Events are both DESTINATION CARDS on
       the War Table now (COMBAT-UI-05), with live counters the floating button
       never had. Any copy injected before the views were built is removed here,
       because this runs on a settling interval and would otherwise leave the
       overlap behind on a slow boot. */
    if (combatPanel.querySelector('.cbt-views')) {
      const stale = combatPanel.querySelector('#hr-dungeons-link');
      if (stale && !stale.closest('.combat-style-block')) stale.remove();
      return;
    }
    if (combatPanel.querySelector('#hr-dungeons-link')) return;
    // Find a sensible insertion point — top of the combat panel
    const target = combatPanel.querySelector('.combat-style-block')
                || combatPanel.querySelector('.card-head')
                || combatPanel.firstElementChild;
    if (!target) return;
    // b217: this shipped as an absolutely-positioned filled-red button with a
    // 🗝 emoji and inline styles — floating in the panel's top-right corner,
    // aligned to nothing, in the colour reserved for danger, and the loudest
    // element on a screen whose subject is a monster list. It's a navigation
    // shortcut, so it's a secondary control that sits IN the style ribbon
    // where the rest of the combat controls live.
    const btn = document.createElement('button');
    btn.id = 'hr-dungeons-link';
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    // b220 (#14): dungeons are no longer a destination of their own — they are
    // a section of the top-level Events panel, alongside the muster and the
    // weekly clan boss. The shortcut stays (the old path must keep working) but
    // it now says where it actually goes.
    const gly = (window.HR && window.HR.icon) ? (window.HR.icon('uiEvent', 14, 'currentColor') || '') : '';
    btn.innerHTML = gly + '<span>Events</span>';
    btn.title = 'Dungeons, the weekly clan boss and today’s muster';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('events');
    });
    const ribbon = combatPanel.querySelector('.combat-style-block');
    if (ribbon) { btn.style.marginLeft = 'auto'; ribbon.appendChild(btn); }
    else { combatPanel.style.position = 'relative'; btn.style.cssText = 'position:absolute;top:12px;right:12px;z-index:5'; combatPanel.appendChild(btn); }
  }

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
    injectCombatDungeonsLink();
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
  /* b217: the Dungeons link now lives inside the combat style ribbon rather
     than floating absolutely in the panel corner, and that ribbon is built by
     the combat renderer the first time the tab is opened. A single boot pass
     300ms after DOMContentLoaded therefore ran before its host existed, and
     the click listener above only fires for real clicks — code paths that call
     showTab() directly never re-ran it. Hook showTab and keep a short retry so
     the shortcut appears regardless of how Combat is reached. */
  window.HearthriseShowTab.wrapShowTab('nav-consol-bootall', function () {
    setTimeout(bootAll, 60);
  });
  let tries = 0;
  const settle = setInterval(() => { bootAll(); if (++tries > 12) clearInterval(settle); }, 500);
})();
