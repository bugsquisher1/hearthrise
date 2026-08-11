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

  // b327: these shipped as literal emoji (🎒/🛡️/⭐) — a 0-emoji-as-art
  // violation — and icon-set.js's `stripChromeEmoji` sweep quietly deleted them
  // at runtime, so the strip drew an EMPTY icon line above each label and was
  // 47px tall to show one word. Atlas glyphs, painted in `paintIcons()` below.
  const SUBS = [
    { id: 'bag',      label: 'Bag',   glyph: 'navInventory' },
    { id: 'equip',    label: 'Equip', glyph: 'uiBody' },
    { id: 'loadouts', label: 'Saved', glyph: 'uiStar' },
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
      '<button type="button" class="imt-btn" data-sub="' + s.id + '" data-glyph="' + s.glyph + '">'
      + '<span class="imt-ic"></span>'
      + '<span class="imt-lbl">' + s.label + '</span>'
      + '</button>'
    ).join('');
    paintIcons(bar);
    return bar;
  }

  // The atlas (glyphs.js + icon-set.js) are classic scripts loaded before this
  // one, but `install()` can also run from the 1500ms watchdog after a panel
  // rebuild — so this is idempotent and safe to call repeatedly.
  function paintIcons(root) {
    const icon = window.HR && window.HR.icon;
    if (!icon) return false;
    let painted = true;
    root.querySelectorAll('.imt-btn').forEach(btn => {
      const host = btn.querySelector('.imt-ic');
      if (!host || host.querySelector('.hr-glyph')) return;
      const svg = icon(btn.dataset.glyph, 15, 'currentColor');
      if (svg) host.innerHTML = svg; else painted = false;
    });
    return painted;
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
    // b327: `renderInvFancy()` replaces #panel-inventory wholesale — on every
    // combat/skill tick — which DESTROYS this strip. It was only ever restored
    // by the 1500ms poll below, so the screen's primary navigation blinked out
    // for up to a second and a half at a time on the device that needs it most.
    // Restore it on the mutation instead; the poll stays as a backstop and to
    // re-paint glyphs if the atlas arrived late.
    const panel = document.getElementById('panel-inventory');
    if (panel && typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        if (!panel.querySelector('#inv-mob-tabs')) install();
      }).observe(panel, { childList: true });
    }
    setInterval(() => {
      const p = document.getElementById('panel-inventory');
      if (!p) return;
      if (!p.querySelector('#inv-mob-tabs')) install();
      const bar = p.querySelector('#inv-mob-tabs');
      if (bar) paintIcons(bar);
    }, 1500);
  }

  // Published so a caller (and the smoke suite) can restore the strip
  // synchronously right after a panel rebuild instead of waiting on a timer.
  window.HearthriseInvSubTabs = { install: install, paintIcons: paintIcons, subs: SUBS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 400));
  } else {
    setTimeout(watch, 400);
  }
})();
