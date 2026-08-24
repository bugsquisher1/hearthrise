// ============================================================
// src/render/levelup-celebration.js — Level-up celebration toast (render layer)
//
// SIXTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, task #129, Phase 3.5). See
// docs/design/render-extraction-pattern.md for the playbook every extraction
// follows.
//
// WHAT THIS IS: the ephemeral "Level N!" celebration toast shown when a skill
// levels up. It reads catalogue/state (window._skillIcon for the per-skill icon,
// window.SKILLS_DEF for the fallback glyph + display name), paints a transient DOM
// node that auto-removes after 2.5s, and re-checks achievements. It writes NOTHING
// authoritative — the G.stats.levelups increment lives in the addXp wrapper in
// legacy.js, which stays put and calls this via the window global. Blast radius is
// one throwaway overlay; zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js function showLevelupCelebration — moved out, not redesigned. There are
// NO hardcoded theme colours in this JS: it builds only class names
// (.lvl-celebration / .lc-ring / .lc-icon / .lc-text / .lc-skill), whose colour
// lives in the shared selectors in src/styles/{legacy,audit-overrides}.css. Those
// selectors carry pre-existing hardcoded colours, but they are SHARED class styles
// left untouched per the pattern (§4 — do not fragment specificity, do not change
// appearance). The ⭐ fallback glyph is pre-existing content.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// Re-exported onto window because the addXp wrapper in legacy.js calls
// showLevelupCelebration by bare global.
// ============================================================
(function () {
  'use strict';

  function showLevelupCelebration(skillId, level) {
    var SKILLS_DEF = window.SKILLS_DEF || {};
    var el = document.createElement('div');
    el.className = 'lvl-celebration';
    var iconHtml;
    if (window._skillIcon && window._skillIcon[skillId]) {
      iconHtml = '<img src="' + window._skillIcon[skillId] + '" alt="" />';
    } else {
      /* was `SKILLS_DEF[skillId].icon` with a '⭐' backstop — an emoji at
         celebration size, on the screen a player screenshots. skillIconHTML
         draws the struck medallion the skills rail uses. */
      iconHtml = (typeof window.skillIconHTML === 'function')
        ? window.skillIconHTML(skillId, 44)
        : ((window.HR && window.HR.icon) ? (window.HR.icon('uiStar', 30, '--gold-2') || '') : '');
    }
    var skName = SKILLS_DEF[skillId] ? SKILLS_DEF[skillId].name : skillId;
    el.innerHTML = '<div class="lc-ring"></div><div class="lc-icon">' + iconHtml + '</div><div class="lc-text">Level ' + level + '!</div><div class="lc-skill">' + skName + '</div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.remove(); }, 2500);
    /* re-check achievements after a level-up */
    setTimeout(function () {
      if (typeof window.checkAchievements === 'function') window.checkAchievements();
    }, 100);
  }
  window.showLevelupCelebration = showLevelupCelebration;

  console.log('Level-up celebration toast: loaded');
})();
