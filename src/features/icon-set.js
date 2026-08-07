// ============================================================
// src/features/icon-set.js  (revamp b159)
//
// One cohesive icon language for the whole game. Source = game-icons.net
// (CC BY 3.0 — needs a one-line credit in the About/Credits screen),
// a huge library of consistent SVG game icons. We pull each icon's path,
// recolor it to parchment, and seat it in a gilt medallion ringed in the
// skill's category colour (green = gathering, crimson = combat, arcane =
// magic, gold = economy). Replaces the emoji/clip-art mix that read as
// "goofy."
//
// Loading: fetch each icon once from GitHub raw, cache in localStorage
// (so it's a one-time hit per player), then hot-swap SKILLS_DEF icons and
// re-render. Emoji stays as the fallback until/if an icon loads, so the
// game never shows a blank. NOTE for production hardening: bake these SVG
// paths into the repo (assets) to drop the runtime GitHub dependency.
// ============================================================
(function () {
  'use strict';

  var GH = 'https://raw.githubusercontent.com/game-icons/icons/master/';
  var CACHE_KEY = 'hearthrise:icons:v1';

  // game key -> game-icons name(s) (first that loads wins)
  var SRC = {
    attack: ['lorc/broadsword'], strength: ['lorc/fist'], defense: ['lorc/checked-shield'],
    hitpoints: ['lorc/glass-heart'], prayer: ['lorc/prayer', 'lorc/pray', 'delapouite/prayer'],
    magic: ['lorc/fairy-wand'], ranged: ['lorc/high-shot'],
    woodcutting: ['lorc/wood-axe'], mining: ['delapouite/miner'], fishing: ['delapouite/fishing-pole'],
    farming: ['lorc/wheat'], cooking: ['delapouite/cooking-pot'], crafting: ['delapouite/wool'],
    smithing: ['lorc/anvil-impact', 'delapouite/anvil'],
    bountyHunter: ['lorc/bullseye', 'delapouite/target-dummy'],
    foraging: ['delapouite/berries-bowl'],
    gold: ['delapouite/two-coins'], gems: ['lorc/gems']
  };

  // category accent per key (CSS token names)
  var ACCENT = {
    attack: '--red', strength: '--red', defense: '--red', hitpoints: '--red', ranged: '--red', bountyHunter: '--red',
    magic: '--gem', prayer: '--gem', gems: '--gem',
    woodcutting: '--green', mining: '--green', fishing: '--green', farming: '--green', foraging: '--green',
    cooking: '--gold', crafting: '--gold', smithing: '--gold', gold: '--gold'
  };

  var paths = {};        // key -> path 'd'
  var loaded = false;

  function loadCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); if (raw) paths = JSON.parse(raw) || {}; } catch (e) {}
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(paths)); } catch (e) {}
  }

  function extractPath(svgText) {
    var m = svgText.match(/fill="#fff" d="([^"]+)"/) || svgText.match(/<path d="((?!M0 0h512)[^"]+)"/);
    return m ? m[1] : null;
  }

  function ensureStyle() {
    if (document.getElementById('hr-iconset-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-iconset-css';
    s.textContent = [
      '.hr-med{display:inline-grid;place-items:center;width:var(--sz,40px);height:var(--sz,40px);border-radius:50%;',
      'background:radial-gradient(circle at 38% 30%,#2c2216,#1a130c);border:2px solid var(--ring,#cda24a);',
      'box-shadow:0 0 0 3px color-mix(in srgb,var(--ring,#cda24a) 14%,transparent),0 4px 10px -6px rgba(0,0,0,.6);vertical-align:middle;flex:0 0 auto}',
      '.hr-med svg{width:58%;height:58%;display:block}',
      // Cozy Day: lighter medallion so the parchment icon still pops
      'html:not([data-theme]) .hr-med,body[data-theme="cozy-light"] .hr-med{background:radial-gradient(circle at 38% 30%,#5a3d1e,#3f2a13)}',
      // let it sit nicely where emoji skill icons used to be
      '.skill-tile .sicon .hr-med,.sk-icon .hr-med{--sz:34px}'
    ].join('');
    document.head.appendChild(s);
  }

  function medallion(key, px) {
    var d = paths[key]; if (!d) return null;
    ensureStyle();
    var ring = 'var(' + (ACCENT[key] || '--gold') + ',#cda24a)';
    return '<span class="hr-med" style="--sz:' + (px || 40) + 'px;--ring:' + ring + '">' +
      '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#e9d9b8" d="' + d + '"/></svg></span>';
  }

  // Swap emoji skill icons for medallions once paths are ready, then repaint.
  function applyToSkills() {
    if (!window.SKILLS_DEF) return;
    var changed = false;
    for (var id in SRC) {
      if (paths[id] && window.SKILLS_DEF[id]) {
        var mv = medallion(id, 34);
        if (mv && window.SKILLS_DEF[id].icon !== mv) { window.SKILLS_DEF[id].icon = mv; changed = true; }
      }
    }
    if (changed) repaint();
  }
  function repaint() {
    try {
      var t = window.activeTab;
      if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
      if (typeof window.renderProfile === 'function') window.renderProfile();
      if (window.HearthriseHome && window.HearthriseHome.render) window.HearthriseHome.render();
      if (typeof window.showTab === 'function' && t) window.showTab(t);
    } catch (e) {}
  }

  async function fetchAll() {
    var keys = Object.keys(SRC);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (paths[key]) continue;                         // cached
      var names = SRC[key];
      for (var j = 0; j < names.length; j++) {
        try {
          var res = await fetch(GH + names[j] + '.svg');
          if (!res.ok) continue;
          var d = extractPath(await res.text());
          if (d) { paths[key] = d; break; }
        } catch (e) { /* try next */ }
      }
    }
    saveCache();
    loaded = true;
    applyToSkills();
  }

  loadCache();
  // apply cached immediately (instant on repeat loads), then refresh from network
  if (Object.keys(paths).length) { setTimeout(applyToSkills, 400); }
  if (document.readyState !== 'loading') fetchAll();
  else document.addEventListener('DOMContentLoaded', fetchAll);

  window.HearthriseIcons = {
    medallion: medallion,
    has: function (k) { return !!paths[k]; },
    path: function (k) { return paths[k] || null; },
    ready: function () { return loaded; }
  };
  console.log('[icon-set] loaded');
})();
