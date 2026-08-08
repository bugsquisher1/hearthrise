// ============================================================
// src/nav-consolidation.js
//
// The sidebar nav has too many items to fit comfortably with the
// new larger crest logo. This module hides redundant top-level
// entries and adds in-panel entry points instead:
//
//   • Dungeons → "Dungeons" button injected into Combat panel
//   • Store    → "Premium Store" toggle injected into Market panel
//
// Hiding is handled by CSS (theme-cozy.css). This module just
// inserts the alternative entry points so users can still reach
// the panels.
// ============================================================

(function(){
  'use strict';

  function injectCombatDungeonsLink() {
    const combatPanel = document.getElementById('panel-combat');
    if (!combatPanel || combatPanel.querySelector('#hr-dungeons-link')) return;
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
    const gly = (window.HR && window.HR.icon) ? (window.HR.icon('navDungeons', 14, 'currentColor') || '') : '';
    btn.innerHTML = gly + '<span>Dungeons</span>';
    btn.title = 'Enter the Dungeons';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('dungeons');
    });
    const ribbon = combatPanel.querySelector('.combat-style-block');
    if (ribbon) { btn.style.marginLeft = 'auto'; ribbon.appendChild(btn); }
    else { combatPanel.style.position = 'relative'; btn.style.cssText = 'position:absolute;top:12px;right:12px;z-index:5'; combatPanel.appendChild(btn); }
  }

  function injectMarketStoreLink() {
    const marketPanel = document.getElementById('panel-market');
    if (!marketPanel || marketPanel.querySelector('#hr-store-link')) return;
    const btn = document.createElement('button');
    btn.id = 'hr-store-link';
    btn.type = 'button';
    // b217: was a filled ice-blue button with a 💎 emoji, absolutely
    // positioned in the corner. It sells gems, so it keeps the sapphire
    // premium role — but as a normal-weight control in the flow.
    btn.className = 'btn btn-sm btn-gem';
    btn.innerHTML = ((window.HR && window.HR.icon) ? (window.HR.icon('gems', 14, 'currentColor') || '') : '') + '<span>Premium Store</span>';
    btn.title = 'Premium Store (gem packs, cosmetics)';
    btn.style.cssText = 'position:absolute; top:12px; right:12px; z-index:5;';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('shop');
    });
    marketPanel.style.position = 'relative';
    marketPanel.appendChild(btn);
  }

  // Also inject a "Back to Market" button on Store + a "Back to Combat"
  // button on Dungeons so users have an obvious return path.
  // b131: hidden on mobile — the button overlapped the "PREMIUM STORE"
  // title at narrow widths, AND on mobile the entry point is MORE menu
  // (not Market), so the label was misleading anyway.
  function injectShopBackLink() {
    const shopPanel = document.getElementById('panel-shop');
    if (!shopPanel || shopPanel.querySelector('#hr-shop-back')) return;
    const btn = document.createElement('button');
    btn.id = 'hr-shop-back';
    btn.type = 'button';
    btn.innerHTML = '← Back to Market';
    // b217: a "back" link is the quietest control on a screen. It was set in
    // Cinzel uppercase with .12em tracking on a raised fill — the treatment
    // reserved for titles — so it competed with the panel heading beside it.
    btn.className = 'btn btn-sm btn-ghost';
    btn.style.cssText = 'position:absolute; top:12px; right:12px; z-index:5;';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('market');
    });
    // b131: hide on narrow viewports
    function applyMobileVisibility(){
      btn.style.display = (window.innerWidth <= 540) ? 'none' : '';
    }
    applyMobileVisibility();
    window.addEventListener('resize', applyMobileVisibility);
    shopPanel.style.position = 'relative';
    shopPanel.appendChild(btn);
  }
  function injectDungeonsBackLink() {
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
    injectMarketStoreLink();
    injectShopBackLink();
    injectDungeonsBackLink();
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
  (function hookShowTab() {
    if (typeof window.showTab !== 'function') { setTimeout(hookShowTab, 120); return; }
    if (window.__navConsolHooked) return;
    window.__navConsolHooked = true;
    const orig = window.showTab;
    window.showTab = function () {
      const r = orig.apply(this, arguments);
      setTimeout(bootAll, 60);
      return r;
    };
  })();
  let tries = 0;
  const settle = setInterval(() => { bootAll(); if (++tries > 12) clearInterval(settle); }, 500);
})();
