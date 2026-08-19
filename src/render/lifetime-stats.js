// ============================================================
// src/render/lifetime-stats.js — Lifetime Stats modal (render layer)
//
// FIRST render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every subsequent extraction follows.
//
// WHAT THIS IS: the read-only "Lifetime Stats" modal — a self-contained
// presentation surface. It READS G.stats / G.bountyHunter and the derived
// level getters and paints a modal; it writes NOTHING to game state, so its
// blast radius is a single dialog. That is exactly why it was chosen as the
// first extraction: real innerHTML + getElementById + event wiring (close,
// ESC, a self-installing trigger button, and a showTab re-wrap) to prove the
// pattern, with essentially zero risk to the economy or save path.
//
// PURE REFACTOR. This is byte-for-byte the same DOM and behaviour that used
// to live at legacy.js openLifetimeStats/_fmtTime/addStatsTrigger — moved
// out, not redesigned. The CSS (.stats-modal/.stats-card/... in
// src/styles/legacy.css) is already fully tokenised (var(--gold-2),
// var(--ink), var(--line-soft), neutral rgba overlays), so there were no
// hardcoded theme colours to convert here; the emoji glyphs and the two
// data-theme=lane1/dark hex overrides in legacy.css are PRE-EXISTING and
// left untouched to keep the surface pixel-identical (they are logged as
// standing debt, not silently changed in a pure refactor).
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// ============================================================
(function () {
  'use strict';

  /* Exclusive helper — was legacy.js _fmtTime, used only by this surface. */
  function _fmtTime(ms) {
    if (!ms || ms < 0) return '—';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + mi + 'm';
    return mi + 'm';
  }

  function openLifetimeStats() {
    var G = window.G || {};
    var balText = window.balText || function () { return '0'; };
    var getCombatLevel = window.getCombatLevel;
    var getTotalLevel = window.getTotalLevel;
    var getBountyHunterLevel = window.getBountyHunterLevel;

    var m = document.getElementById('lifetime-stats') || (function () {
      var el = document.createElement('div');
      el.id = 'lifetime-stats';
      el.className = 'stats-modal';
      el.addEventListener('click', function (e) { if (e.target === el) el.classList.remove('show'); });
      document.body.appendChild(el);
      return el;
    })();
    var s = G.stats || {};
    var bh = G.bountyHunter || {};
    var playTime = Date.now() - (s.firstSeen || Date.now());
    var cl = (typeof getCombatLevel === 'function') ? getCombatLevel() : 0;
    var tl = (typeof getTotalLevel === 'function') ? getTotalLevel() : 0;
    /* Total XP across skills */
    var totalXp = 0;
    if (G.skills) Object.values(G.skills).forEach(function (v) { if (typeof v === 'number') totalXp += v; });

    var tile = function (b, sp) { return '<div class="stat-tile"><b>' + b + '</b><span>' + sp + '</span></div>'; };
    var row = function (lbl, val) { return '<div class="stats-row"><span class="lbl">' + lbl + '</span><span class="val">' + val + '</span></div>'; };

    /* Family breakdown */
    var families = Object.entries(s.killsByFamily || {}).sort(function (a, b) { return b[1] - a[1]; });
    var tiers = Object.entries(s.killsByTier || {}).filter(function (e) { return e[1] > 0; }).sort(function (a, b) { return +a[0] - +b[0]; });

    m.innerHTML = '<div class="stats-card">' +
      '<div class="stats-close" onclick="document.getElementById(\'lifetime-stats\').classList.remove(\'show\')">✕</div>' +
      '<div class="stats-head">' +
        '<div class="stats-title">📊 Lifetime Stats</div>' +
        '<div class="muted tiny">Save first seen ' + new Date(s.firstSeen || Date.now()).toLocaleDateString() + '</div>' +
      '</div>' +

      '<div class="stats-grid">' +
        tile(cl, 'Combat Level') +
        tile(tl, 'Total Level') +
        tile(totalXp.toLocaleString(), 'Total XP') +
        tile(_fmtTime(playTime), 'Time Played') +
        tile((s.kills || 0).toLocaleString(), 'Monsters Killed') +
        tile((s.gathered || 0).toLocaleString(), 'Gathered') +
        tile((s.harvested || 0).toLocaleString(), 'Harvested') +
        tile((s.cooked || 0).toLocaleString(), 'Cooked') +
      '</div>' +

      '<div class="stats-section">' +
        '<h4>Combat</h4>' +
        '<div class="stats-list">' +
          row('Total kills', (s.kills || 0).toLocaleString()) +
          row('Deaths', (s.deaths || 0).toLocaleString()) +
          row('Best kill streak', (s.bestKillStreak || 0).toLocaleString()) +
          row('Current streak', (s.killStreak || 0).toLocaleString()) +
          row('Rare drops looted', (s.rareDrops || 0).toLocaleString()) +
        '</div>' +
      '</div>' +

      (families.length ? '<div class="stats-section">' +
        '<h4>Kills by Family</h4>' +
        '<div class="stats-list">' +
          families.map(function (e) { return row(e[0], e[1].toLocaleString()); }).join('') +
        '</div>' +
      '</div>' : '') +

      (tiers.length ? '<div class="stats-section">' +
        '<h4>Kills by Tier</h4>' +
        '<div class="stats-list">' +
          tiers.map(function (e) { return row('Tier ' + e[0], e[1].toLocaleString()); }).join('') +
        '</div>' +
      '</div>' : '') +

      '<div class="stats-section">' +
        '<h4>Economy</h4>' +
        '<div class="stats-list">' +
          row('Total gold earned', (s.totalGoldEarned || 0).toLocaleString() + '🪙') +
          row('Total gold spent', (s.totalGoldSpent || 0).toLocaleString() + '🪙') +
          row('Current gold', balText('gold') + '🪙') +
          row('Current gems', balText('gems') + '💎') +
        '</div>' +
      '</div>' +

      '<div class="stats-section">' +
        '<h4>Bounty Hunter</h4>' +
        '<div class="stats-list">' +
          row('Bounties completed', (bh.completed || 0).toLocaleString()) +
          row('Marks earned', (bh.marks || 0).toLocaleString()) +
          row('BH Level', (typeof getBountyHunterLevel === 'function' ? getBountyHunterLevel() : 1)) +
          row('Free rerolls left today', bh.freeRerolls || 0) +
        '</div>' +
      '</div>' +

      '<div class="stats-section">' +
        '<h4>Production</h4>' +
        '<div class="stats-list">' +
          row('Refined (smelt + saw)', (s.refined || 0).toLocaleString()) +
          row('Forged (tools + gear)', (s.forged || 0).toLocaleString()) +
          row('Buried bones', (s.buriedBones || 0).toLocaleString()) +
          row('Buffs consumed', (s.buffsConsumed || 0).toLocaleString()) +
        '</div>' +
      '</div>' +
    '</div>';
    m.classList.add('show');
  }
  window.openLifetimeStats = openLifetimeStats;

  /* Add a stats button to the Profile panel.
     Originally we appended this absolutely-positioned at top:12px right:12px,
     but that floats over the Active Effects card and obscures its title/sub
     text on certain viewports — flagged by the UI overlap detector. Now we
     inject it into the existing .feat-buttons row alongside Achievements +
     Bestiary so it shares horizontal space without ever covering content. */
  (function addStatsTrigger() {
    // Track retry attempts so we don't loop forever if .feat-buttons
    // never gets created (e.g. that retention feature module didn't load).
    var retries = 0;
    function place() {
      var profile = document.getElementById('panel-profile');
      if (!profile) return;
      if (profile.querySelector('.stats-btn-trigger')) return;
      var featRow = profile.querySelector('.feat-buttons');
      // The Profile panel uses grid-template-areas, so we MUST inject
      // into .feat-buttons (which sits in the panel's normal flow) and
      // never as a top-level grid child. If the row hasn't been built yet
      // (retention features setTimeout out at 600ms), retry until it is
      // — capped at ~30 attempts (3s) before giving up silently.
      if (!featRow) {
        if (retries++ < 30) setTimeout(place, 100);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'stats-btn-trigger';
      btn.textContent = '📊 Lifetime Stats';
      btn.addEventListener('click', openLifetimeStats);
      featRow.appendChild(btn);
    }
    place();
    /* Place again on showTab(profile) in case panel rebuilt */
    window.HearthriseShowTab.wrapShowTab('lifetime-stats-place', function (tab) {
      if (tab === 'profile') setTimeout(place, 50);
    });
  })();

  /* ESC closes */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var el = document.getElementById('lifetime-stats');
      if (el) el.classList.remove('show');
    }
  });

  console.log('Lifetime stats: loaded');
})();
