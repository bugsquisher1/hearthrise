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
      notePlayerChoice();                 // b334 — stop auto-steering this fight
      setSubActive(panel, btn.dataset.sub);
    });
    setSubActive(panel, getActive());
    return true;
  }

  // The Combat panel is rebuilt by render() periodically. Re-install
  // the bar if it disappears.
  // b230: keep the sub-tab in step with combat state. When a fight goes live the
  // arena becomes the screen (the CSS also forces it visible as a safety net);
  // when it ends, return to the Foes list so the next fight is one tap away.
  // Driven off the body.in-combat class so it catches every fight entry point
  // (monster row, bounty "fight target", resume-on-load) without wrapping any of
  // the engine's many combat functions.
  //
  // b334: this used to re-assert 'arena' on EVERY call, and it is called by a
  // 1500ms poll as well as by the body-class observer. So a player who tapped
  // "Style" during a fight was dragged back to the arena within 1.5 seconds —
  // the second half of "combat style can't be chosen while in combat", and one
  // the CSS fix alone would not have cured. Steering a player is a thing you do
  // ONCE, when the situation changes; after they have steered themselves, stop.
  // `_lastInCombat` is what makes the reset happen per FIGHT, so the next fight
  // still opens on the arena.
  let _lastInCombat = null;
  let _playerChose = false;
  function notePlayerChoice() { _playerChose = true; }

  function syncCombatSub(panel) {
    panel = panel || document.getElementById('panel-combat');
    if (!panel) return;
    const inCombat = document.body.classList.contains('in-combat');
    if (inCombat !== _lastInCombat) { _lastInCombat = inCombat; _playerChose = false; }
    if (inCombat) {
      if (!_playerChose && panel.dataset.mobileSub !== 'arena') setSubActive(panel, 'arena');
    } else if (panel.dataset.mobileSub === 'arena') {
      setSubActive(panel, 'monsters');
    }
  }
  // Exposed so the smoke suite can assert the fight→arena switch deterministically
  // without racing the MutationObserver / poll interval.
  window.__cmbSyncCombatSub = syncCombatSub;

  function watch() {
    if (!install()) return;
    const panel0 = document.getElementById('panel-combat');
    if (panel0) {
      syncCombatSub(panel0);
      // React the instant a fight starts/ends, not on the next poll tick.
      try {
        new MutationObserver(() => {
          const p = document.getElementById('panel-combat');
          if (p) syncCombatSub(p);
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      } catch (e) { /* no MutationObserver → the interval below still covers it */ }
    }
    setInterval(() => {
      const panel = document.getElementById('panel-combat');
      if (!panel) return;
      if (!panel.querySelector('#cmb-mob-tabs')) install();
      syncCombatSub(panel);
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 400));
  } else {
    setTimeout(watch, 400);
  }
})();
