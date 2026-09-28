// ============================================================
// src/render/levelup-celebration.js — the Mark banner, the companion banner
// and the Mastery sheet. Called only by src/features/climb-marks.js, which
// decides WHEN from the server's level; this only paints. Text goes in through
// textContent; the one markup string is the skill medallion (skillIconHTML).
// Banners share #hr-levelup-host with the plain level banner (legacy.js); the
// sheet is the .hr-scrim/.hr-sheet primitive. Skin: src/styles/climb-marks.css.
// ============================================================
(function () {
  'use strict';

  function host() {
    var h = document.getElementById('hr-levelup-host');
    if (!h) { h = document.createElement('div'); h.id = 'hr-levelup-host'; document.body.appendChild(h); }
    return h;
  }

  function part(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function skillName(skillId) {
    var D = window.SKILLS_DEF || {};
    return (D[skillId] && D[skillId].name) || skillId;
  }

  function banner(kind, kicker, lines, medal, leaveMs) {
    var el = part('div', 'hr-levelup-pop ' + kind);
    el.setAttribute('role', 'status');
    if (medal) { var m = part('div', 'lu-medal'); m.innerHTML = medal; el.appendChild(m); }
    var body = part('div', 'lu-body');
    body.appendChild(part('div', 'lu-kicker', kicker));
    lines.forEach(function (l) { body.appendChild(part('div', l[0], l[1])); });
    el.appendChild(body);
    el.onclick = function () { el.remove(); };
    host().appendChild(el);
    setTimeout(function () { el.classList.add('leaving'); }, leaveMs);
    setTimeout(function () { el.remove(); }, leaveMs + 500);
    return el;
  }

  window.showLevelupCelebration = function (skillId, level) {
    var CM = window.HearthriseClimbMarks;
    var mark = CM && CM.markFor(level);
    if (!mark) return null;
    var medal = typeof window.skillIconHTML === 'function' ? window.skillIconHTML(skillId, 40) : '';
    return banner('is-mark', mark.name, [
      ['lu-title', skillName(skillId) + ' ' + level],
      ['lu-lore', mark.lore],
      ['lu-foot', 'Kept in your Chronicle'],
    ], medal, 6000);
  };

  window.hrPetLevelNotice = function (text) {
    return banner('is-pet', 'Companion', [['lu-title', text]], '', 3700);
  };

  window.hrOpenMastery = function (skillId) {
    var CM = window.HearthriseClimbMarks;
    var scrim = part('div', 'cm-mastery-scrim hr-scrim');
    scrim.id = 'cm-mastery';
    scrim.setAttribute('role', 'dialog');
    scrim.setAttribute('aria-modal', 'true');
    scrim.setAttribute('aria-labelledby', 'cm-mastery-h');
    var sheet = part('div', 'cm-mastery hr-sheet');
    var head = part('div', 'hr-sheet-head cm-mastery-head');
    head.appendChild(part('div', 'cm-mastery-kicker', 'Mastery'));
    var h = part('h2', 'cm-mastery-title', skillName(skillId) + ' 99');
    h.id = 'cm-mastery-h';
    head.appendChild(h);
    var body = part('div', 'hr-sheet-body cm-mastery-body');
    body.appendChild(part('p', 'cm-mastery-lore', CM ? CM.masteryLore(skillId) : ''));
    var top = CM && CM.markFor(99);
    body.appendChild(part('p', 'cm-mastery-mark', top ? top.lore : ''));
    var foot = part('div', 'hr-sheet-foot cm-mastery-foot');
    foot.appendChild(part('p', 'cm-mastery-note', 'Kept in your Chronicle for good'));
    var close = part('button', 'cm-mastery-btn', 'Close');
    close.type = 'button';
    close.setAttribute('data-hr-dismiss', '');
    close.onclick = function () { scrim.remove(); };
    foot.appendChild(close);
    sheet.appendChild(head);
    sheet.appendChild(body);
    sheet.appendChild(foot);
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
    close.focus();
    return scrim;
  };
})();
