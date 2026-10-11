// ============================================================
// src/nav-consolidation.js — THE MENU (window.HearthriseNav).
//
// Nine doors on the rail (coherence audit, 2026-10-09): Home ·
// Character · Skills · Combat · Homestead · Clan · Events · Market ·
// Social. Every screen is a PANE of exactly one door, and HUBS below
// is the whole menu as data — the rail markup in index.html carries
// one button per hub id, and the pane strip above the open screen
// (#hub-tabs) is drawn from the same rows. Adding a screen is a row
// here; nothing else in the chrome changes.
//
// What this module owns:
//   - hubOf(tab)    which door a screen belongs to (lights the rail)
//   - resolve(tab)  a door id that is not itself a screen → its front
//                   pane ('homestead' → 'farming')
//   - the pane strip, repainted after every showTab
//   - badges(map)   per-pane dots; a door shows a dot when any of its
//                   panes does
//   - window.HearthShops: which shop pane a shop route opens
// ============================================================

(function(){
  'use strict';

  // Early Access has no premium door: the web build cannot sell the packs.
  // Every premium route lands on the Local Shop until Steam purchases work.
  var PREMIUM_OPEN = false;

  var HUBS = [
    { id: 'profile', panes: [{ tab: 'profile', label: 'Home', glyph: 'navProfile' }] },
    { id: 'character', panes: [
      { tab: 'character', label: 'Character', glyph: 'navCharacter' },
      { tab: 'inventory', label: 'Bag', glyph: 'navInventory' },
      { tab: 'journal', label: 'Journal', glyph: 'uiBook' }] },
    { id: 'skills', panes: [{ tab: 'skills', label: 'Skills', glyph: 'navSkills' }] },
    { id: 'combat', panes: [
      { tab: 'combat', label: 'Field', glyph: 'navCombat' },
      { tab: 'bounty', label: 'Bounty Board', glyph: 'navBounty' },
      { tab: 'dungeons', label: 'Dungeons', glyph: 'navDungeons' }] },
    { id: 'homestead', panes: [
      { tab: 'farming', label: 'Farm', glyph: 'navFarm' },
      { tab: 'house', label: 'House', glyph: 'navHouse' },
      { tab: 'stable', label: 'Stable', glyph: 'navStable' }] },
    { id: 'clan', panes: [
      { tab: 'clan', label: 'Clan', glyph: 'uiCastle' },
      { tab: 'party', label: 'Party', glyph: 'uiPeople' }] },
    { id: 'events', panes: [{ tab: 'events', label: 'Events', glyph: 'uiEvent' }] },
    { id: 'shops', panes: [
      { tab: 'shop', label: 'Local Shop', glyph: 'navStore' },
      { tab: 'market', label: 'Player Market', glyph: 'navMarket' }] },
    { id: 'social', panes: [{ tab: 'social', label: 'Social', glyph: 'navSocial' }] }
  ];

  var HUB_BY_ID = {}, HUB_OF_PANE = {};
  HUBS.forEach(function (h) {
    HUB_BY_ID[h.id] = h;
    h.panes.forEach(function (p) { HUB_OF_PANE[p.tab] = h.id; });
  });

  function hubOf(tab) { return HUB_OF_PANE[tab] || (HUB_BY_ID[tab] ? tab : null); }
  function resolve(tab) {
    var h = HUB_BY_ID[tab];
    if (!h || tab === 'shops') return tab;   // 'shops' keeps the remembered shop pane
    if (HUB_OF_PANE[tab] && paneShown(tab)) return tab;
    // A door opens on its first OPEN pane (Clan opens on Party while clans are shut).
    var front = h.panes.filter(function (p) { return paneShown(p.tab); })[0];
    return front ? front.tab : (HUB_OF_PANE[tab] ? tab : h.panes[0].tab);
  }

  // ── Per-pane badges ─────────────────────────────────────────
  var paneBadge = {};
  function badges(map) {
    Object.keys(map || {}).forEach(function (t) { paneBadge[t] = !!map[t]; });
    HUBS.forEach(function (h) {
      var on = h.panes.some(function (p) { return paneBadge[p.tab] && paneShown(p.tab); });
      var btn = document.querySelector('.nav-btn[data-tab="' + h.id + '"]');
      if (!btn) return;
      var dot = btn.querySelector('.nav-badge');
      if (!dot && !on) return;
      if (!dot) { dot = document.createElement('span'); dot.className = 'nav-badge'; btn.appendChild(dot); }
      dot.classList.toggle('hide', !on);
    });
    paintStrip();
  }

  // ── The pane strip ──────────────────────────────────────────
  // The open screen is whichever panel is showing; the DOM is the one truth
  // every module can read (legacy.js keeps its own activeTab private).
  function openScreen() {
    var p = document.querySelector('main .panel.active');
    return p ? p.id.replace(/^panel-/, '') : null;
  }
  function glyphHtml(key) {
    var g = (window.HR && window.HR.icon) ? window.HR.icon(key, 17, null) : '';
    return g || '';
  }
  // ── Progressive reveal (src/features/spine-reveal.js) ───────
  // A pane shows when the server's facts reveal it; the open pane always
  // shows, so a link into a pane never strands the player on a blank strip.
  // No reveal module (the boot window before main.js) means show everything:
  // a menu that fails to load must fail OPEN.
  function paneShown(tab) {
    var R = window.HearthriseReveal;
    return !R || tab === openScreen() || R.shows('pane:' + tab);
  }
  function doorShown(h) { return h.panes.some(function (p) { return paneShown(p.tab); }); }
  /** "The Combat door opens when you win five fights." for a shut door, else null. */
  function doorOpensWhen(id) {
    var h = HUB_BY_ID[id], R = window.HearthriseReveal;
    if (!h || !R || typeof R.opensWhen !== 'function') return null;
    var btn = document.querySelector('.nav-btn[data-tab="' + id + '"] .lbl');
    var label = (btn && btn.textContent.trim()) || h.panes[0].label;
    return R.opensWhen(label, h.panes.map(function (p) { return 'pane:' + p.tab; }));
  }
  function paintDoors() {
    HUBS.forEach(function (h) {
      var on = doorShown(h);
      document.querySelectorAll('.nav-btn[data-tab="' + h.id + '"], .bn-btn[data-tab="' + h.id + '"]').forEach(function (btn) {
        var want = on ? '' : 'none';
        if (btn.style.display !== want) btn.style.display = want;
      });
    });
    // A group label over doors that are all hidden is a heading over nothing.
    document.querySelectorAll('.nav-group-label').forEach(function (label) {
      var any = false;
      for (var n = label.nextElementSibling; n && !n.classList.contains('nav-group-label'); n = n.nextElementSibling) {
        if (n.classList.contains('nav-btn') && n.hasAttribute('data-tab') && n.style.display !== 'none') { any = true; break; }
      }
      var want = any ? '' : 'none';
      if (label.style.display !== want) label.style.display = want;
    });
  }

  function paintStrip() {
    paintDoors();
    var host = document.getElementById('hub-tabs');
    if (!host) return;
    var tab = openScreen();
    var hub = HUB_BY_ID[hubOf(tab)];
    var panes = hub ? hub.panes.filter(function (p) { return paneShown(p.tab); }) : [];
    if (!hub || panes.length < 2) {
      if (!host.hidden) { host.hidden = true; host.innerHTML = ''; host.dataset.sig = ''; }
      return;
    }
    var iconsReady = !!(window.HR && window.HR.icon);
    var sig = [hub.id, tab, iconsReady].concat(panes.map(function (p) { return p.tab + (paneBadge[p.tab] ? 1 : 0); })).join('|');
    host.hidden = false;
    host.setAttribute('data-hub', hub.id);
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    host.setAttribute('role', 'tablist');
    host.innerHTML = panes.map(function (p) {
      var on = p.tab === tab;
      return '<button type="button" role="tab" class="hub-tab' + (on ? ' active' : '') + '" aria-selected="' + on + '"' +
        ' data-hub-pane="' + p.tab + '"><span class="ic" aria-hidden="true">' + glyphHtml(p.glyph) + '</span>' +
        '<span class="lbl">' + p.label + '</span>' +
        (paneBadge[p.tab] ? '<span class="hub-dot" role="img" aria-label="needs you"></span>' : '') + '</button>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#hub-tabs [data-hub-pane]');
    if (!btn) return;
    e.preventDefault();
    if (typeof window.showTab === 'function') window.showTab(btn.getAttribute('data-hub-pane'));
  });

  // ── Which shop pane a shop route opens ──────────────────────
  var PANES = PREMIUM_OPEN ? ['local', 'market', 'premium'] : ['local', 'market'];
  var PANE_ALIAS = {
    shops: null,            // null → "whatever was last chosen"
    shop: 'local', store: 'local', stores: 'local', localshop: 'local',
    'local-shop': 'local', local: 'local', seedshop: 'local', shopfront: 'local',
    market: 'market', exchange: 'market', marketplace: 'market',
    premium: 'premium', premiumshop: 'premium', 'premium-shop': 'premium',
    gems: 'premium', iap: 'premium'
  };
  // Session-scoped (the window._tdPane convention): a fresh load opens on
  // the Local Shop, the front door, never on last session's Market.
  function currentPane() {
    return PANES.indexOf(window._shopsPane) >= 0 ? window._shopsPane : 'local';
  }
  function paneFor(tab) {
    var key = String(tab || '').toLowerCase();
    var p = Object.prototype.hasOwnProperty.call(PANE_ALIAS, key) ? PANE_ALIAS[key] : undefined;
    if (p === null) return currentPane();
    return PANES.indexOf(p) >= 0 ? p : 'local';
  }
  function apply(pane) {
    if (PANES.indexOf(pane) < 0) pane = 'local';
    window._shopsPane = pane;
    var shopPanel = document.getElementById('panel-shop');
    if (shopPanel && pane !== 'market') shopPanel.setAttribute('data-shops-pane', pane);
  }
  window.HearthShops = { paneFor: paneFor, apply: apply, panes: PANES };

  window.HearthriseNav = Object.freeze({
    hubs: HUBS, hubOf: hubOf, resolve: resolve, badges: badges, paintStrip: paintStrip,
    paneShown: paneShown, doorShown: function (id) { return !!HUB_BY_ID[id] && doorShown(HUB_BY_ID[id]); },
    doorOpensWhen: doorOpensWhen,
    badgeOf: function (tab) { return !!paneBadge[tab]; },
    premiumOpen: PREMIUM_OPEN
  });

  // On a landscape phone the strip sits in the top bar's empty middle
  // (menu-journal.css); it must stop short of the stats, whose width moves
  // with the numbers in them. Published on .main so it travels with the DOM.
  function publishStatsWidth() {
    var stats = document.querySelector('.topbar .top-stats'), main = document.querySelector('main.main');
    if (!stats || !main) return;
    main.style.setProperty('--hr-top-stats-w', Math.ceil(stats.getBoundingClientRect().width) + 'px');
  }
  (function watchStats() {
    var stats = document.querySelector('.topbar .top-stats');
    if (!stats) { setTimeout(watchStats, 250); return; }
    publishStatsWidth();
    if (typeof ResizeObserver === 'function') new ResizeObserver(publishStatsWidth).observe(stats);
  })();

  // The strip follows every showTab, however it was reached, and repaints
  // once the icon atlas lands (the first paint can beat it).
  window.HearthriseShowTab.wrapShowTab('nav-hub-strip', paintStrip);
  window.addEventListener('hearthrise:reveal', paintStrip);
  var tries = 0;
  var settle = setInterval(function () {
    paintStrip();
    if ((window.HR && window.HR.icon) || ++tries > 20) clearInterval(settle);
  }, 250);
})();
