// ============================================================
// src/render/achievements.js — Achievements presentation (render layer)
//
// THIRD render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the two READ-ONLY presentation surfaces of the achievements
// system — the "Achievement unlocked!" toast (showAchToast) and the full
// Achievements modal (openAchievements). The toast paints from the achievement
// def it is handed; the modal reads window.ACHIEVEMENTS (the read-only published
// catalogue) + G.achievements (per-player unlock/progress state) and paints a
// sorted list. Neither computes or mutates authoritative game state — the
// progress logic that WRITES unlock state (checkAchievements / readPath) stays
// in legacy.js on purpose, because it is logic, not render. Blast radius here is
// one toast + one dialog; zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js showAchToast / window.openAchievements — moved out, not redesigned.
// There are NO hardcoded theme colours in this JS (the only inline style is a
// colourless "margin-top:12px;width:100%" on the modal's Close button, and the
// 🏆/emoji glyphs are pre-existing content, left untouched). All colour lives in
// the .ach-toast / .ach-overlay / .ach-modal / .ach-* selectors in
// src/styles/*.css, which are unchanged.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// BOTH functions are re-exported onto window: showAchToast because legacy.js's
// checkAchievements calls it by bare global on unlock, and openAchievements
// because two inline onclick="openAchievements()" handlers (the achievements
// button row + the profile toolbar) invoke it from template strings.
// ============================================================
(function () {
  'use strict';

  function showAchToast(a) {
    var t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = '<span class="at-icon">' + a.icon + '</span><div class="at-text"><b>Achievement unlocked!</b><small>' + a.name + '</small></div>';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  window.showAchToast = showAchToast;

  function openAchievements() {
    var G = window.G || {};
    var ACHIEVEMENTS = window.ACHIEVEMENTS || [];

    var ov = document.getElementById('ach-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'ach-overlay'; ov.className = 'ach-overlay';
      ov.innerHTML = '<div class="ach-modal" onclick="event.stopPropagation()"><h2>Achievements</h2><div id="ach-list" class="ach-list"></div><button class="btn" onclick="document.getElementById(\'ach-overlay\').classList.remove(\'show\')" style="margin-top:12px;width:100%">Close</button></div>';
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('show'); });
      document.body.appendChild(ov);
    }
    G.achievements = G.achievements || {};
    var list = document.getElementById('ach-list');
    var unlockedFirst = ACHIEVEMENTS.slice().sort(function (a, b) {
      var au = G.achievements[a.id]?.unlocked ? 1 : 0;
      var bu = G.achievements[b.id]?.unlocked ? 1 : 0;
      return bu - au;
    });
    list.innerHTML = unlockedFirst.map(function (a) {
      var entry = G.achievements[a.id] || { progress: 0, unlocked: false };
      var pct = Math.min(100, (entry.progress / a.target) * 100);
      return '<div class="ach-row ' + (entry.unlocked ? 'unlocked' : '') + '">' +
        '<div class="ach-icon">' + a.icon + '</div>' +
        '<div class="ach-info"><b>' + a.name + '</b><small>' + a.desc + '</small></div>' +
        '<div class="ach-progress">' + Math.min(entry.progress, a.target).toLocaleString() + ' / ' + a.target.toLocaleString() + '</div>' +
      '</div>';
    }).join('');
    ov.classList.add('show');
  }
  window.openAchievements = openAchievements;

  console.log('Achievements panel: loaded');
})();
