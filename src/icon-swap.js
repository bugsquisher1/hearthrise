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

// ⚠ RETIRED since b210 — index.html no longer loads this file (icon-set.js is the
//   single chrome-icon system; the two fought over the same nav/topbar slots with
//   different icon vocabularies). Kept as the reference mapping. It is still held
//   to the repo's cache-buster rule below, because a retired file that gets
//   un-retired with a five-year-old version pinned in it is a bug waiting.

(function(){
  'use strict';
  const BASE = 'assets/icons/';

  // ── THE CACHE-BUSTER IS DERIVED, NEVER PINNED ─────────────────────────────
  // These sprite URLs carried a hardcoded ?v=88 from the build they were added
  // in. That is not a cache-buster, it is a cache LOCK: every deploy after b88
  // served the b88 icons out of the browser cache for as long as the entry
  // survived, and no bump could ever move it (bump-version.sh's rewrite is
  // anchored to a file extension, so a bare '?v=NN' string was invisible to it).
  // Read the running build instead: window.HearthriseBuild (set by
  // src/build-info.js) first, and if this file is somehow loaded before that,
  // fall back to the ?v= on this script's OWN tag — which index.html always
  // bumps. If neither is available, ship no query at all: an un-busted URL is a
  // stale icon for one deploy, a WRONGLY-busted one is stale forever.
  const OWN_SRC = (document.currentScript && document.currentScript.src) || '';
  function vq() {
    try {
      const c = window.HearthriseBuild && window.HearthriseBuild.cache;
      if (c) return '?v=' + c;
    } catch (e) { /* no build info — fall through */ }
    const m = /[?&]v=(\d+)/.exec(OWN_SRC);
    return m ? '?v=' + m[1] : '';
  }

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
    'btn-settings': 'settings.svg',
    'btn-notif':    'notifications.svg',
  };

  function makeImg(filename) {
    const img = document.createElement('img');
    img.src = BASE + filename + vq();
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
        btn.innerHTML = '<img class="hr-svg-ic" src="' + BASE + file + vq() + '" alt="" draggable="false" /> ' + html.slice(m[0].length);
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
