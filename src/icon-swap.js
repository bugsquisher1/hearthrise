// ============================================================
// src/icon-swap.js
//
// Replaces the emoji glyphs in the sidebar nav and topbar with
// the new Hearthrise-style SVG icons. Runs at boot + after any
// tab-change click (in case dynamically-added nav items appear).
//
// Mapping is data-driven — to add an icon, drop the SVG in
// assets/icons/ and add an entry below.
// ============================================================

(function(){
  'use strict';
  const BASE = 'assets/icons/';

  // Sidebar / bottom-nav nav buttons keyed by data-tab attribute
  const TAB_ICONS = {
    profile:    'profile.svg',
    character:  'character.svg',
    combat:     'combat.svg',
    dungeons:   'dungeons.svg',
    bounty:     'bounty.svg',
    skills:     'activities.svg',     // data-tab "skills" = Activities label
    stable:     'stable.svg',
    inventory:  'inventory.svg',
    shop:       'gems.svg',           // store / premium
    market:     'market.svg',
    farming:    'farm.svg',
    house:      'house.svg',
    social:     'social.svg',
  };

  // Topbar tile / button targets
  const TOPBAR_BY_ID = {
    'btn-save':     'save.svg',
    'btn-settings': 'settings.svg',
    'btn-notif':    'notifications.svg',
  };

  function makeImg(filename) {
    const img = document.createElement('img');
    img.src = BASE + filename + '?v=88';
    img.className = 'hr-svg-ic';
    img.alt = '';
    img.draggable = false;
    return img;
  }

  function swapInto(el, filename) {
    if (!el || el.dataset.hrIconSwapped === filename) return;
    el.innerHTML = '';
    el.appendChild(makeImg(filename));
    el.dataset.hrIconSwapped = filename;
    el.classList.add('hr-icon-host');
  }

  function swapAllNav() {
    document.querySelectorAll('.nav-btn[data-tab], .bn-btn[data-tab]').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      const file = TAB_ICONS[tab];
      if (!file) return;
      const slot = btn.querySelector('.ic');
      if (slot) swapInto(slot, file);
    });
    // "More" sheet buttons (mobile)
    document.querySelectorAll('.tap[data-tab]').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      const file = TAB_ICONS[tab];
      if (!file) return;
      // These don't have a separate .ic span — replace any leading emoji in the text node.
      const html = btn.innerHTML;
      const m = html.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
      if (m) {
        btn.innerHTML = '<img class="hr-svg-ic" src="' + BASE + file + '?v=88" alt="" draggable="false" /> ' + html.slice(m[0].length);
      }
    });
  }

  function swapTopbar() {
    // Stat tiles by title attribute
    const titleMap = {
      'Combat level':    'combat-level.svg',
      'Total level':     'total-level.svg',
      'Gold':            'gold.svg',
      'Gems — premium currency': 'gems.svg',
    };
    document.querySelectorAll('.t-stat[title]').forEach(tile => {
      const t = tile.getAttribute('title');
      const file = titleMap[t];
      if (!file) return;
      const ic = tile.querySelector('.ic');
      if (ic) swapInto(ic, file);
    });
    // Streak badge (.streak-badge .flame)
    document.querySelectorAll('.streak-badge .flame').forEach(el => swapInto(el, 'streak.svg'));
    // Topbar icon buttons by id
    Object.entries(TOPBAR_BY_ID).forEach(([id, file]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      // These buttons have emoji directly in textContent — wrap in a host span
      if (btn.dataset.hrIconSwapped === file) return;
      const aria = btn.title || '';
      btn.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'hr-icon-host';
      span.appendChild(makeImg(file));
      btn.appendChild(span);
      if (aria) btn.title = aria;
      btn.dataset.hrIconSwapped = file;
    });
  }

  function swapAll() {
    try { swapAllNav(); } catch (e) { console.warn('[icon-swap] nav:', e.message); }
    try { swapTopbar(); } catch (e) { console.warn('[icon-swap] topbar:', e.message); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(swapAll, 200));
  } else {
    setTimeout(swapAll, 200);
  }
  // Re-run after tab clicks in case engine rebuilds nav items
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-tab]')) {
      setTimeout(swapAll, 100);
    }
  });
  // Re-run whenever the topbar stats update (mutation observer)
  const top = document.querySelector('.top-stats');
  if (top && window.MutationObserver) {
    new MutationObserver(() => setTimeout(swapTopbar, 50)).observe(top, { childList: true, subtree: true });
  }

  window.HearthriseIcons = { swapAll, swapAllNav, swapTopbar, TAB_ICONS };
})();
