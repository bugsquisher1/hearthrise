// ============================================================
// src/combat-mobile-tabs.js  (b110)
//
// Idle-Clans-style sub-tab bar for the Combat panel on mobile.
//
// The Combat panel has 4-5 sections that desktop renders side-by-
// side but mobile was stacking ~1500px tall: Style picker, Monster
// picker, Arena, Loadout, Dungeons button. Tester report after
// b108: "combat screen is not visible, way too much scrolling."
//
// This module injects a sub-tab bar across the top of the panel
// with three buttons: STYLE / MONSTERS / ARENA. Only one section
// is visible at a time on mobile (≤540px). On desktop the bar is
// hidden and the original side-by-side layout is preserved.
//
// Only "Loadout" gets folded under Monsters as a small "Gear"
// shortcut — it's rarely used mid-fight.
// ============================================================

(function(){
  'use strict';

  const SUBS = [
    { id: 'style',    label: 'Style',    icon: '⚔️' },
    { id: 'monsters', label: 'Foes',     icon: '👹' },
    { id: 'arena',    label: 'Arena',    icon: '🛡️' },
  ];
  const STORAGE_KEY = 'hearthrise:combat-mobile-subtab';

  function getActive() {
    try { return localStorage.getItem(STORAGE_KEY) || 'monsters'; }
    catch { return 'monsters'; }
  }
  function setActive(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function buildBar() {
    const bar = document.createElement('div');
    bar.id = 'cmb-mob-tabs';
    bar.className = 'cmb-mob-tabs';
    bar.innerHTML = SUBS.map(s =>
      '<button type="button" class="cmt-btn" data-sub="' + s.id + '">'
      + '<span class="cmt-ic">' + s.icon + '</span>'
      + '<span class="cmt-lbl">' + s.label + '</span>'
      + '</button>'
    ).join('');
    return bar;
  }

  function setSubActive(panel, id) {
    panel.dataset.mobileSub = id;
    setActive(id);
    panel.querySelectorAll('#cmb-mob-tabs .cmt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sub === id);
    });
  }

  function install() {
    const panel = document.getElementById('panel-combat');
    if (!panel) return false;
    if (panel.querySelector('#cmb-mob-tabs')) return true;
    const bar = buildBar();
    panel.insertBefore(bar, panel.firstChild);
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.cmt-btn');
      if (!btn) return;
      setSubActive(panel, btn.dataset.sub);
    });
    setSubActive(panel, getActive());
    return true;
  }

  // The Combat panel is rebuilt by render() periodically. Re-install
  // the bar if it disappears.
  function watch() {
    if (!install()) return;
    setInterval(() => {
      const panel = document.getElementById('panel-combat');
      if (panel && !panel.querySelector('#cmb-mob-tabs')) install();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 400));
  } else {
    setTimeout(watch, 400);
  }
})();
