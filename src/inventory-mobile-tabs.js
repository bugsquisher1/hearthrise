// ============================================================
// src/inventory-mobile-tabs.js  (b111)
//
// Idle-Clans-style sub-tab bar for the Inventory panel on mobile.
//
// Inventory has three logical sections that desktop renders side-
// by-side: the bag (item grid), equipment paper-doll, and loadouts.
// Mobile was stacking them ~2000px tall.
//
// On mobile (≤540px), an inner tab strip appears across the top
// with three buttons: BAG / EQUIP / SAVED. Only one section is
// visible at a time — same data-mobile-sub pattern combat uses.
// On desktop the strip is hidden via CSS and the layout is intact.
// ============================================================

(function(){
  'use strict';

  const SUBS = [
    { id: 'bag',      label: 'Bag',     icon: '🎒' },
    { id: 'equip',    label: 'Equip',   icon: '🛡️' },
    { id: 'loadouts', label: 'Saved',   icon: '⭐' },
  ];
  const STORAGE_KEY = 'hearthrise:inventory-mobile-subtab';

  function getActive() {
    try { return localStorage.getItem(STORAGE_KEY) || 'bag'; }
    catch { return 'bag'; }
  }
  function setActive(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.id = 'inv-mob-tabs';
    bar.className = 'inv-mob-tabs';
    bar.innerHTML = SUBS.map(s =>
      '<button type="button" class="imt-btn" data-sub="' + s.id + '">'
      + '<span class="imt-ic">' + s.icon + '</span>'
      + '<span class="imt-lbl">' + s.label + '</span>'
      + '</button>'
    ).join('');
    return bar;
  }

  function setSubActive(panel, id) {
    panel.dataset.mobileSub = id;
    setActive(id);
    panel.querySelectorAll('#inv-mob-tabs .imt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sub === id);
    });
  }

  function install() {
    const panel = document.getElementById('panel-inventory');
    if (!panel) return false;
    if (panel.querySelector('#inv-mob-tabs')) return true;
    const bar = buildBar();
    panel.insertBefore(bar, panel.firstChild);
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.imt-btn');
      if (!btn) return;
      setSubActive(panel, btn.dataset.sub);
    });
    setSubActive(panel, getActive());
    return true;
  }

  function watch() {
    if (!install()) return;
    setInterval(() => {
      const panel = document.getElementById('panel-inventory');
      if (panel && !panel.querySelector('#inv-mob-tabs')) install();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 400));
  } else {
    setTimeout(watch, 400);
  }
})();
