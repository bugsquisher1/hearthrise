// ============================================================
// src/render/achievements.js — Achievements presentation (render layer)
//
// THIRD render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the two presentation surfaces of the Deeds of the Realm — the
// "Achievement unlocked!" toast (showAchToast) and the deeds list the Journal's
// Deeds tab paints (HearthriseDeedsList.html) — plus the one resolver for their
// art (achievementGlyphHTML), so the list and the toast can never disagree.
//
// NOTHING HERE OWNS A NUMBER (CLAUDE.md §6). The catalogue and every grade come
// from window.HearthriseDeeds (src/features/deeds.js), which reads the realm's
// counts; an unknown deed paints the pending dash, never 0 and never Earned.
// This file neither reads nor writes any per-player record in G.
//
// The sheet groups the deeds under DEED_GROUPS headings in catalogue order; each
// row carries its line of lore. No inline style and no colour here: the
// .ach-* selectors in src/styles/*.css own the look.
//
// Globals are read via window.* at call time, so this classic script may load in
// any order after legacy.js.
// ============================================================
(function () {
  'use strict';

  /* ONE resolver for achievement art: an atlas key (src/data/glyphs.js), never a
     raw emoji, drawn in the gold ink. */
  window.achievementGlyphHTML = function (a, px) {
    var key = (a && a.glyph) || 'uiTrophy';
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 22, '--gold-2') || '') : '';
  };

  /* ONE honest toast: a second crossing REPLACES the first rather than landing on
     top of it (the deeds watcher's batch form already says "and N more"). */
  function showAchToast(a) {
    document.querySelectorAll('.ach-toast').forEach(function (old) { old.remove(); });
    var t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = '<span class="at-icon">' + window.achievementGlyphHTML(a, 20) + '</span><div class="at-text"><b>Achievement unlocked!</b><small>' + a.name + '</small></div>';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  window.showAchToast = showAchToast;

  /* The deeds, grouped under DEED_GROUPS headings in catalogue order. */
  function listHtml() {
    var D = window.HearthriseDeeds;
    if (!D) return '';
    var readers = D.readers();
    return '<div class="ach-list">' + D.groups.map(function (g) {
      var rows = D.rows.filter(function (a) { return a.group === g[0]; });
      return '<h4 class="muted">' + g[1] + '</h4>' + rows.map(function (a) {
        var p = D.progressOf(a, readers);
        return '<div class="ach-row' + (p.done ? ' unlocked' : '') + '">' +
          '<div class="ach-icon">' + window.achievementGlyphHTML(a, 22) + '</div>' +
          '<div class="ach-info"><b>' + a.name + '</b><small>' + p.desc + '</small><small class="muted">' + a.lore + '</small></div>' +
          '<div class="ach-progress">' + p.html + '</div>' +
        '</div>';
      }).join('');
    }).join('') + '</div>';
  }
  window.HearthriseDeedsList = { html: listHtml };

  console.log('Achievements panel: loaded');
})();
