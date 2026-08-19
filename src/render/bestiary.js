// ============================================================
// src/render/bestiary.js — Bestiary modal (render layer)
//
// FOURTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the READ-ONLY Bestiary modal (openBestiary) — a self-contained
// presentation surface that reads window.MONSTERS (the read-only published
// monster catalogue) + G.bestiary (per-player kill/discovery state) and paints a
// sorted list of discovered/undiscovered rows. It reuses the shared .ach-overlay
// / .ach-modal shell (same as Achievements) plus its own .bestiary-* selectors.
// It computes and mutates NOTHING authoritative — the kill tracking that WRITES
// G.bestiary (the killMonster wrapper + the milestone-notify logic) is LOGIC and
// stays in legacy.js on purpose, exactly the render/logic seam Achievements used
// (checkAchievements stayed; only the toast+modal moved). Blast radius is one
// dialog; zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js window.openBestiary — moved out, not redesigned. There are NO
// hardcoded theme colours in this JS: the only inline styles are colourless
// (font-size:calc(19px * var(--ui-scale, 1)) on the emoji fallback and
// margin-top:12px;width:100% on the Close button), and the 📖 glyph is
// pre-existing content. All colour lives in the .ach-* / .bestiary-* selectors
// in src/styles/legacy.css, which are already tokenised (var(--ink),
// var(--gold-2), var(--line-soft)) and left unchanged.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// openBestiary is re-exported onto window because two inline
// onclick="openBestiary()" handlers (the profile buttons row + the profile
// toolbar) invoke it from legacy.js template strings.
// ============================================================
(function () {
  'use strict';

  window.openBestiary = function () {
    var G = window.G || {};
    var MONSTERS = window.MONSTERS;

    var ov = document.getElementById('best-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'best-overlay'; ov.className = 'ach-overlay';
      ov.innerHTML = '<div class="ach-modal" onclick="event.stopPropagation()"><h2>Bestiary</h2><div id="best-list" class="bestiary-list"></div><button class="btn" onclick="document.getElementById(\'best-overlay\').classList.remove(\'show\')" style="margin-top:12px;width:100%">Close</button></div>';
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('show'); });
      document.body.appendChild(ov);
    }
    G.bestiary = G.bestiary || {};
    var list = document.getElementById('best-list');
    if (typeof MONSTERS === 'undefined' || !MONSTERS) { list.innerHTML = '<div class="muted">Monsters not loaded.</div>'; ov.classList.add('show'); return; }
    list.innerHTML = Object.entries(MONSTERS).map(function (kv) {
      var id = kv[0], m = kv[1];
      var entry = G.bestiary[id] || { kills: 0 };
      var disc = entry.kills > 0;
      var path = window._monsterIcon && window._monsterIcon[id];
      var img = path ? '<img src="' + path + '" />' : '<span style="font-size:calc(19px * var(--ui-scale, 1))">' + m.icon + '</span>';
      return '<div class="bestiary-row ' + (disc ? 'discovered' : 'undiscovered') + '">' +
        '<div class="br-icon">' + img + '</div>' +
        '<div class="br-info"><b>' + (disc ? m.name : '???') + '</b><small>Tier ' + m.tier + (disc ? ' · ' + m.hp + ' HP' : '') + '</small></div>' +
        '<div class="br-kills">' + (disc ? entry.kills + '×' : '—') + '</div>' +
      '</div>';
    }).join('');
    ov.classList.add('show');
  };

  console.log('Bestiary modal: loaded');
})();
