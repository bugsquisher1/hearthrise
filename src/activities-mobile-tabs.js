// ============================================================
// src/activities-mobile-tabs.js  (b111)
//
// Horizontal-scroll sub-tab strip for the Activities (Skills) panel
// on mobile. Idle-Clans-style: 9 skills laid out in a single row at
// the top, swipe/scroll horizontally to find the one you want, tap
// to focus it. Below the strip, only the selected skill's detail
// view is visible.
//
// On desktop the strip is hidden via CSS and the existing two-column
// layout (skill list left, selected detail right) is preserved.
// ============================================================

(function(){
  'use strict';

  // Game skill IDs (from SKILLS_DEF in legacy.js). Order matches
  // the desktop sidebar grouping.
  const SKILLS = [
    { id: 'woodcutting', label: 'Wood',    icon: '🪓' },
    { id: 'mining',      label: 'Mine',    icon: '⛏️' },
    { id: 'fishing',     label: 'Fish',    icon: '🎣' },
    { id: 'farming',     label: 'Farm',    icon: '🌾' },
    { id: 'cooking',     label: 'Cook',    icon: '🍳' },
    { id: 'crafting',    label: 'Craft',   icon: '🪡' },
    { id: 'smithing',    label: 'Smith',   icon: '⚒️' },
    { id: 'prayer',      label: 'Prayer',  icon: '🙏' },
    { id: 'magic',       label: 'Magic',   icon: '✨' },
  ];
  const STORAGE_KEY = 'hearthrise:activities-mobile-skill';

  function getActiveSkill() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SKILLS.find(s => s.id === stored)) return stored;
    } catch {}
    // Fall back to whatever skill the player is currently training, if any
    if (window.G && window.G.activeSkill) return window.G.activeSkill;
    return SKILLS[0].id;
  }
  function setActiveSkill(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function buildStrip() {
    const strip = document.createElement('div');
    strip.id = 'act-mob-strip';
    strip.className = 'act-mob-strip';
    strip.innerHTML = SKILLS.map(s =>
      '<button type="button" class="ams-btn" data-skill="' + s.id + '">'
      + '<span class="ams-ic">' + s.icon + '</span>'
      + '<span class="ams-lbl">' + s.label + '</span>'
      + '</button>'
    ).join('');
    return strip;
  }

  function setStripActive(panel, id) {
    panel.dataset.mobileSkill = id;
    setActiveSkill(id);
    panel.querySelectorAll('#act-mob-strip .ams-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.skill === id);
    });
    // Try to call into the existing skill-selection flow so the right pane
    // updates to show the chosen skill's detail view. The legacy code uses
    // window.selectSkill(id) or similar.
    try {
      if (typeof window.showSkill === 'function') window.showSkill(id);
      else if (typeof window.selectSkill === 'function') window.selectSkill(id);
      else if (typeof window.renderSkillDetail === 'function') window.renderSkillDetail(id);
    } catch (e) {
      console.warn('[activities-mobile] skill switch failed:', e);
    }
    // Scroll the active button into view in case it's off-screen
    const activeBtn = panel.querySelector('#act-mob-strip .ams-btn.active');
    if (activeBtn) {
      try { activeBtn.scrollIntoView({ inline: 'center', behavior: 'smooth' }); } catch {}
    }
  }

  function install() {
    const panel = document.getElementById('panel-skills');
    if (!panel) return false;
    if (panel.querySelector('#act-mob-strip')) return true;
    const strip = buildStrip();
    panel.insertBefore(strip, panel.firstChild);
    strip.addEventListener('click', (e) => {
      const btn = e.target.closest('.ams-btn');
      if (!btn) return;
      setStripActive(panel, btn.dataset.skill);
    });
    setStripActive(panel, getActiveSkill());
    return true;
  }

  function watch() {
    if (!install()) return;
    setInterval(() => {
      const panel = document.getElementById('panel-skills');
      if (panel && !panel.querySelector('#act-mob-strip')) install();
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 400));
  } else {
    setTimeout(watch, 400);
  }
})();
