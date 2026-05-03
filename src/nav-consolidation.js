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
    const btn = document.createElement('button');
    btn.id = 'hr-dungeons-link';
    btn.type = 'button';
    btn.innerHTML = '<span style="font-size:14px">🗝</span> Dungeons';
    btn.title = 'Enter the Dungeons';
    btn.style.cssText = ''
      + 'position:absolute; top:14px; right:14px; z-index:5;'
      + 'padding:6px 14px;'
      + 'background:linear-gradient(180deg,#d44a3a,#8b2a1f);'
      + 'color:#fff8e2;'
      + 'border:2px solid #5a1208;'
      + 'border-radius:4px;'
      + "font-family:'Cinzel',serif;"
      + 'font-size:11px; letter-spacing:.15em; font-weight:600;'
      + 'text-transform:uppercase; cursor:pointer;'
      + 'box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 2px 4px rgba(60,40,16,.3);';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('dungeons');
    });
    combatPanel.style.position = 'relative';
    combatPanel.appendChild(btn);
  }

  function injectMarketStoreLink() {
    const marketPanel = document.getElementById('panel-market');
    if (!marketPanel || marketPanel.querySelector('#hr-store-link')) return;
    const btn = document.createElement('button');
    btn.id = 'hr-store-link';
    btn.type = 'button';
    btn.innerHTML = '<span style="font-size:14px">💎</span> Premium Store';
    btn.title = 'Premium Store (gem packs, cosmetics)';
    btn.style.cssText = ''
      + 'position:absolute; top:14px; right:14px; z-index:5;'
      + 'padding:6px 14px;'
      + 'background:linear-gradient(180deg,#7fb8d8,#4a6f8b);'
      + 'color:#fff8e2;'
      + 'border:2px solid #2a4255;'
      + 'border-radius:4px;'
      + "font-family:'Cinzel',serif;"
      + 'font-size:11px; letter-spacing:.15em; font-weight:600;'
      + 'text-transform:uppercase; cursor:pointer;'
      + 'box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 2px 4px rgba(60,40,16,.3);';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('shop');
    });
    marketPanel.style.position = 'relative';
    marketPanel.appendChild(btn);
  }

  // Also inject a "Back to Market" button on Store + a "Back to Combat"
  // button on Dungeons so users have an obvious return path.
  function injectShopBackLink() {
    const shopPanel = document.getElementById('panel-shop');
    if (!shopPanel || shopPanel.querySelector('#hr-shop-back')) return;
    const btn = document.createElement('button');
    btn.id = 'hr-shop-back';
    btn.type = 'button';
    btn.innerHTML = '← Back to Market';
    btn.style.cssText = ''
      + 'position:absolute; top:14px; right:14px; z-index:5;'
      + 'padding:6px 14px;'
      + 'background:rgba(255,247,224,.65);'
      + 'color:#3d2817;'
      + 'border:1px solid #b8893e;'
      + 'border-radius:4px;'
      + "font-family:'Cinzel',serif;"
      + 'font-size:11px; letter-spacing:.12em; font-weight:600;'
      + 'text-transform:uppercase; cursor:pointer;';
    btn.addEventListener('click', () => {
      if (typeof window.showTab === 'function') window.showTab('market');
    });
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
    btn.style.cssText = ''
      + 'position:absolute; top:14px; right:14px; z-index:5;'
      + 'padding:6px 14px;'
      + 'background:rgba(255,247,224,.65);'
      + 'color:#3d2817;'
      + 'border:1px solid #b8893e;'
      + 'border-radius:4px;'
      + "font-family:'Cinzel',serif;"
      + 'font-size:11px; letter-spacing:.12em; font-weight:600;'
      + 'text-transform:uppercase; cursor:pointer;';
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
})();
