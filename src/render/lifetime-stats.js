// ============================================================
// src/render/lifetime-stats.js — Lifetime stats (render layer, the Journal's Stats tab)
//
// FIRST render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every subsequent extraction follows.
//
// WHAT THIS IS: the read-only lifetime stats, painted in the Journal's Stats tab. Every count on it is the
// REALM's: the lifetime `stat` rows the server projects on every envelope,
// folded by src/features/lifetime-tally.js (window.HearthriseLifetime), plus the
// existing server mirrors (trophies, skill xp, balances). A count
// the realm has not stated yet renders the pending dash, never 0 (CLAUDE.md §6).
// It writes NOTHING to game state.
//
// `sectionsHtml(view, readers)` is pure over its inputs so the suite can paint a
// known, a floor and an unknown view with stub readers (TALLY-B); a reader that
// answers null is UNKNOWN. html() feeds it the live readers.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// ============================================================
(function () {
  'use strict';

  /* The panel title and the currency rows carry an atlas glyph; '' rather than
     a character when the atlas has no match. */
  function _lsGly(key, px, col) {
    return (window.HR && window.HR.icon)
      ? (window.HR.icon(key, px || 13, col || 'currentColor') || '')
      : '';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pending() {
    var B = window.HearthriseBalance;
    return (B && typeof B.countMarkup === 'function') ? B.countMarkup(null) : '—';
  }

  /* A reader's answer as markup: null is UNKNOWN, a number is formatted, a
     string is markup this file's own readers built. */
  function val(v) {
    if (v === null || v === undefined) return pending();
    return typeof v === 'number' ? esc(v.toLocaleString()) : String(v);
  }

  function sectionsHtml(view, readers) {
    var LT = window.HearthriseLifetime || {};
    var r = readers || {};
    var ask = function (k) { return typeof r[k] === 'function' ? r[k]() : null; };
    var lore = LT.lore || {};
    var n = function (key) { return typeof LT.markup === 'function' ? LT.markup(key, undefined, view) : pending(); };
    var tile = function (b, sp) { return '<div class="stat-tile"><b>' + b + '</b><span>' + esc(sp) + '</span></div>'; };
    var row = function (lbl, v) { return '<div class="stats-row"><span class="lbl">' + esc(lbl) + '</span><span class="val">' + v + '</span></div>'; };
    var section = function (title, loreKey, rows) {
      return '<div class="stats-section"><h4>' + esc(title) + '</h4>'
        + (lore[loreKey] ? '<div class="muted tiny">' + esc(lore[loreKey]) + '</div>' : '')
        + '<div class="stats-list">' + rows + '</div></div>';
    };
    return '<div class="stats-grid">'
        + tile(val(ask('combatLevel')), 'Combat level')
        + tile(val(ask('totalLevel')), 'Total level')
        + tile(val(ask('totalXp')), 'Total XP')
        + tile(n('kills'), 'Monsters slain')
        + tile(n('deaths'), 'Falls')

        + tile(n('gathered'), 'Resources gathered')
        + tile(n('cooked'), 'Dishes cooked')
      + '</div>'
      + section('Fighting', 'fighting',
          row('Monsters slain', n('kills'))
        + row('Critical hits', n('crits'))
        + row('Rare drops', n('rare_drops'))
        + row('Falls', n('deaths'))
        + row('Beasts on the trophy wall', val(ask('trophies'))))
      + section('Gathering', 'gathering',
          row('Resources gathered', n('gathered'))
        + row('Logs cut', n('chopped'))
        + row('Ore mined', n('mined'))
        + row('Fish caught', n('fished'))
        + row('Doubled by a good tool', n('tool_doubles'))
        + row('Crops planted', n('ev:planted'))
        + row('Crops harvested', n('ev:harvest')))
      + section('At the bench', 'bench',
          row('Dishes cooked', n('cooked'))
        + row('Dishes burnt', n('burnt'))
        + row('Smithing jobs done', n('smithed'))
        + row('Crafts finished', n('crafted')))
      + section('Purse', 'purse',
          row('Gold', val(ask('gold')))
        + row('Gems', val(ask('gems'))));
  }

  /* The live readers: every one answers null until its server mirror has spoken. */
  function liveReaders() {
    var G = window.G || {};
    var SR = window.HearthriseSkillRecord, T = window.HearthriseTrophies;
    var known = function (id) { return !!(SR && typeof SR.isSkillXpKnown === 'function' && SR.isSkillXpKnown(G, id)); };
    var lv = function (fn) { return typeof window[fn] === 'function' ? window[fn]() : null; };
    var bal = function (field, glyph, col) {
      var f = window.balMarkup || window.balText;
      return typeof f === 'function' ? f(field) + ' ' + _lsGly(glyph, 13, col) : null;
    };

    return {
      combatLevel: function () { return lv('getCombatLevel'); },
      totalLevel: function () { return lv('getTotalLevel'); },
      totalXp: function () {
        var ids = Object.keys(window.SKILLS_DEF || {});
        if (!ids.length || !ids.every(known)) return null;
        return ids.reduce(function (a, id) { return a + (Number(SR.skillXpOf(G, id).value) || 0); }, 0);
      },

      trophies: function () {
        return (T && typeof T.claimsKnown === 'function' && T.claimsKnown()) ? T.wallRows({ cap: 100000 }).rows.length : null;
      },

      gold: function () { return bal('gold', 'gold', '--gold-2'); },
      gems: function () { return bal('gems', 'gems', '--gem'); },
    };
  }

  window.HearthriseLifetimeSheet = {
    sectionsHtml: sectionsHtml,
    html: function () { return sectionsHtml(undefined, liveReaders()); }
  };

  console.log('Lifetime stats: loaded');
})();
