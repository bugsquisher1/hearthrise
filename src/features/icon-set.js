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
    bountyHunter: ['lorc/archery-target', 'lorc/on-target'],
    foraging: ['delapouite/berries-bowl'],
    gold: ['delapouite/two-coins'], gems: ['lorc/gems'],
    // UI-chrome glyphs (flat, not medallions) — cohesive topbar/nav icons
    combatLvl: ['lorc/crossed-swords'], totalLvl: ['lorc/laurel-crown', 'delapouite/star-formation', 'lorc/laurels-trophy'],
    // Nav glyphs (verified against the icon library)
    navProfile: ['delapouite/person'], navCharacter: ['lorc/visored-helm'], navCombat: ['lorc/crossed-swords'],
    navBounty: ['lorc/archery-target', 'lorc/on-target'], navSkills: ['delapouite/miner'], navInventory: ['lorc/knapsack'],
    navStore: ['delapouite/shop'], navFarm: ['lorc/wheat'], navHouse: ['delapouite/house'],
    navSocial: ['lorc/trophy'], navMore: ['delapouite/hamburger-menu'],
    navStable: ['lorc/paw-print', 'delapouite/dog-house', 'lorc/wolf-head'], navMarket: ['delapouite/scales', 'lorc/scales', 'delapouite/shop'],
    /* b210 (emoji purge): dungeons nav + topbar utility buttons — names
       fetch-verified against the game-icons library */
    navDungeons: ['delapouite/dungeon-gate'],
    uiBell: ['lorc/bell-shield'], uiSave: ['delapouite/save'], uiSettings: ['delapouite/settings-knobs', 'lorc/cog'],
    uiFlame: ['lorc/small-fire'],
    /* b213 QA: topbar Quests button carried a raw 📜 the b210-212 purge
       missed — give it a proper gilt scroll glyph. */
    uiQuests: ['lorc/scroll-unfurled', 'lorc/tied-scroll'],
    uiEdit: ['lorc/feather', 'delapouite/pencil', 'lorc/quill-ink']
  };

  // category accent per key (CSS token names)
  var ACCENT = {
    attack: '--red', strength: '--red', defense: '--red', hitpoints: '--red', ranged: '--red', bountyHunter: '--red',
    magic: '--gem', prayer: '--gem', gems: '--gem',
    woodcutting: '--green', mining: '--green', fishing: '--green', farming: '--green', foraging: '--green',
    cooking: '--gold', crafting: '--gold', smithing: '--gold', gold: '--gold'
  };

  // monster id -> game-icons name (creatures, all in the crimson ring)
  var MON = {
    slime: 'lorc/gooey-daemon', venom_spider: 'lorc/hanging-spider', plague_swarm: 'lorc/wasp-sting',
    warband_captain: 'lorc/barbute', wraith: 'lorc/spectre', shadow_creeper: 'lorc/spectre',
    death_knight: 'lorc/visored-helm', lich: 'lorc/crowned-skull',
    small_wolf: 'lorc/wolf-head', wolf: 'lorc/wolf-head', dire_wolf: 'lorc/wolf-head',
    dark_wizard: 'lorc/pointy-hat', warlock: 'lorc/hood', archmage: 'lorc/wizard-staff',
    lesser_demon: 'lorc/daemon-skull', void_parasite: 'lorc/daemon-skull', war_king: 'lorc/crowned-skull',
    dragon: 'lorc/dragon-head', rat: 'delapouite/rat', giant_bat: 'delapouite/bat',
    goblin: 'delapouite/goblin-head', hobgoblin: 'delapouite/orc-head', goblin_brute: 'delapouite/orc-head',
    goblin_warlord: 'delapouite/orc-head', weak_skeleton: 'lorc/skull-crack', skeleton: 'lorc/skeleton-inside',
    zombie: 'delapouite/shambling-zombie', bear: 'delapouite/bear-head', ancient_bear: 'delapouite/bear-head',
    panther: 'lorc/cat'
  };

  var paths = {};        // skill/currency key -> path 'd'
  var monPaths = {};     // monster id -> path 'd'
  var loaded = false;

  function loadCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); if (raw) paths = JSON.parse(raw) || {}; } catch (e) {}
    try { var rawM = localStorage.getItem(CACHE_KEY + ':mon'); if (rawM) monPaths = JSON.parse(rawM) || {}; } catch (e) {}
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(paths)); } catch (e) {}
    try { localStorage.setItem(CACHE_KEY + ':mon', JSON.stringify(monPaths)); } catch (e) {}
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
      '.skill-tile .sicon .hr-med,.sk-icon .hr-med{--sz:34px}',
      // Flat UI glyphs (topbar/nav) — clean gilt icons, no medallion frame
      '.hr-glyph{display:inline-flex;align-items:center;justify-content:center;width:var(--gsz,18px);height:var(--gsz,18px);vertical-align:middle;flex:0 0 auto}',
      '.hr-glyph svg{width:100%;height:100%;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))}'
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

  // DOM sweep — the same pattern the game uses (paintSkillIcons): find each
  // skill tile, read its skill id from the onclick, and drop our medallion into
  // its icon slot. Runs after renders + on a light interval, so it survives
  // re-renders and never fights the legacy paint pass (that one no-ops because
  // _skillIcon is empty).
  function paintSkills() {
    if (!Object.keys(paths).length) return;
    ensureStyle();
    document.querySelectorAll('.skill-tile, .skill-card').forEach(function (el) {
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/openSkillDetail\('([^']+)'\)/) || oc.match(/showSkill\('([^']+)'\)/);
      if (!m) return;
      var id = m[1];
      if (!paths[id]) return;
      var iconEl = el.querySelector('.sicon, .icon');
      if (!iconEl || iconEl.querySelector('.hr-med')) return;   // missing or already ours
      var mv = medallion(id, 34);
      if (mv) iconEl.innerHTML = mv;
    });
  }

  // Monster medallions — same sweep, crimson ring, on the combat monster rows.
  function medallionMon(id, px) {
    var d = monPaths[id]; if (!d) return null;
    ensureStyle();
    return '<span class="hr-med" style="--sz:' + (px || 40) + 'px;--ring:var(--red,#d64a3a)">' +
      '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#e9d9b8" d="' + d + '"/></svg></span>';
  }
  function monIdByName(nm) {
    if (!window.MONSTERS) return null;
    nm = (nm || '').trim().toLowerCase();
    for (var id in window.MONSTERS) { if ((window.MONSTERS[id].name || '').toLowerCase() === nm) return id; }
    return null;
  }
  function paintMonsters() {
    if (!Object.keys(monPaths).length || !window.MONSTERS) return;
    ensureStyle();
    // combat monster rows have no inline onclick, so resolve the id from the
    // name label; fall back to an onclick if a variant provides one.
    document.querySelectorAll('.monster-row, .mon-row').forEach(function (el) {
      var iconEl = el.querySelector('.mi, .mon-icon, .m-icon');
      if (!iconEl || iconEl.querySelector('.hr-med')) return;
      var id = null;
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/startCombat\('([^']+)'\)/) || oc.match(/openMonster\('([^']+)'\)/);
      if (m) id = m[1];
      if (!id) { var nmEl = el.querySelector('.mn, .mon-name, .m-name'); if (nmEl) id = monIdByName(nmEl.textContent); }
      if (!id || !monPaths[id]) return;
      var mv = medallionMon(id, 40);
      if (mv) iconEl.innerHTML = mv;
    });
  }
  // Flat gilt glyph (no medallion frame) for UI chrome.
  function glyph(key, sizePx, colorVar) {
    var d = paths[key]; if (!d) return null;
    ensureStyle();
    var col = 'var(' + (colorVar || '--gold') + ',#e0a64a)';
    return '<span class="hr-glyph" style="--gsz:' + (sizePx || 18) + 'px;color:' + col + '">' +
      '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg></span>';
  }

  // Replace the topbar stat emoji with cohesive gilt glyphs. Matches by the
  // stat's label (CL / TL / Gold / Gems) so it's robust to order.
  var TOPBAR_MAP = { 'CL': ['combatLvl', '--gold-2'], 'TL': ['totalLvl', '--gold-2'], 'Gold': ['gold', '--gold'], 'Gems': ['gems', '--gem'] };
  function paintTopbar() {
    if (!Object.keys(paths).length) return;
    document.querySelectorAll('.topbar .t-stat').forEach(function (st) {
      var lab = st.querySelector('.lab'), ic = st.querySelector('.ic');
      if (!lab || !ic) return;
      var m = TOPBAR_MAP[(lab.textContent || '').trim()];
      if (!m || !paths[m[0]]) return;
      if (ic.querySelector('.hr-glyph')) return;   // already painted
      var g = glyph(m[0], 17, m[1]);
      if (g) ic.innerHTML = g;
    });
  }

  // Nav glyphs — sidebar (.nav-btn) + mobile bottom-nav (.bn-btn), matched by
  // data-tab. Gilt glyphs replace the emoji in each button's .ic span.
  var NAV_MAP = {
    profile: 'navProfile', character: 'navCharacter', combat: 'navCombat', bounty: 'navBounty',
    skills: 'navSkills', inventory: 'navInventory', shop: 'navStore', farming: 'navFarm',
    house: 'navHouse', social: 'navSocial', more: 'navMore', stable: 'navStable', market: 'navMarket',
    dungeons: 'navDungeons'
  };
  function paintNav() {
    if (!Object.keys(paths).length) return;
    document.querySelectorAll('.nav-btn[data-tab], .bn-btn[data-tab]').forEach(function (btn) {
      var key = NAV_MAP[btn.getAttribute('data-tab')];
      if (!key || !paths[key]) return;
      var ic = btn.querySelector('.ic');
      if (!ic || ic.querySelector('.hr-glyph')) return;
      var g = glyph(key, 20, '--gold-2');
      if (g) ic.innerHTML = g;
    });
  }

  // b210 (final directive §3 — no emoji as game art):
  // 1. Topbar utility buttons (bell / save / settings) get gilt glyphs —
  //    icon-swap.js used to cover these and is now retired (it fought this
  //    module over the same slots with a different icon vocabulary).
  var UI_BTN_MAP = { 'btn-notif': 'uiBell', 'btn-save': 'uiSave', 'btn-settings': 'uiSettings' };
  function paintUiButtons() {
    if (!Object.keys(paths).length) return;
    Object.keys(UI_BTN_MAP).forEach(function (id) {
      var btn = document.getElementById(id);
      var key = UI_BTN_MAP[id];
      if (!btn || !paths[key] || btn.querySelector('.hr-glyph')) return;
      var g = glyph(key, 17, '--gold-2');
      if (!g) return;
      // PRESERVE element children (btn-notif carries the #nb-dot unread
      // counter) — strip stray text nodes, prepend the glyph.
      Array.prototype.slice.call(btn.childNodes).forEach(function (n) {
        if (n.nodeType === 3) n.remove();
      });
      btn.insertAdjacentHTML('afterbegin', g);
    });
    // Quests topbar button — glyph goes INSIDE its .hr-q-ic slot (the
    // button also carries the label + live count spans; don't disturb them).
    var qic = document.querySelector('#hr-quests-btn .hr-q-ic');
    if (qic && paths.uiQuests && !qic.querySelector('.hr-glyph')) {
      var qg = glyph('uiQuests', 15, '--gold-2');
      if (qg) qic.innerHTML = qg;
    }
    // streak flame badge
    var flame = document.querySelector('.streak-badge .flame');
    if (flame && paths.uiFlame && !flame.querySelector('.hr-glyph')) {
      var fg = glyph('uiFlame', 15, '--red');
      if (fg) flame.innerHTML = fg;
    }
  }
  // 2. Chips / sub-tabs / more-modal entries carried inline emoji — strip
  //    the pictographs so those controls read as clean text chrome.
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  function stripChromeEmoji() {
    document.querySelectorAll(
      '.chips .chip, .cmt-btn, .imt-btn, .ams-btn, #more-modal .mm-item, #more-modal button'
    ).forEach(function (el) {
      if (el.dataset.hrDeemoji) return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var n, touched = false;
      while ((n = walker.nextNode())) {
        if (EMOJI_RE.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(EMOJI_RE, '').replace(/^\s+/, '');
          touched = true;
        }
      }
      if (touched || el.textContent.trim()) el.dataset.hrDeemoji = '1';
    });
  }

  function paintAll() { paintSkills(); paintMonsters(); paintTopbar(); paintNav(); paintUiButtons(); stripChromeEmoji(); }

  async function fetchOne(names) {
    for (var j = 0; j < names.length; j++) {
      try {
        var res = await fetch(GH + names[j] + '.svg');
        if (!res.ok) continue;
        var d = extractPath(await res.text());
        if (d) return d;
      } catch (e) { /* try next */ }
    }
    return null;
  }
  async function fetchAll() {
    var k;
    for (k in SRC) { if (!paths[k]) { var ds = await fetchOne(SRC[k]); if (ds) paths[k] = ds; } }
    for (k in MON) { if (!monPaths[k]) { var dm = await fetchOne([MON[k]]); if (dm) monPaths[k] = dm; } }
    saveCache();
    loaded = true;
    paintAll();
  }

  loadCache();
  // paint from cache immediately (instant on repeat loads), refresh from network,
  // and keep painting after re-renders.
  if (Object.keys(paths).length || Object.keys(monPaths).length) setTimeout(paintAll, 300);
  if (document.readyState !== 'loading') fetchAll();
  else document.addEventListener('DOMContentLoaded', fetchAll);
  setInterval(paintAll, 1200);

  // NOTE: renamed off HearthriseIcons — that global belongs to icon-swap.js
  // (nav/topbar PNG swaps). Ours is the game-icons medallion set.
  window.HearthriseIconSet = {
    medallion: medallion,
    medallionMon: medallionMon,
    has: function (k) { return !!paths[k]; },
    path: function (k) { return paths[k] || null; },
    ready: function () { return loaded; },
    repaint: paintAll
  };
  console.log('[icon-set] loaded');
})();
