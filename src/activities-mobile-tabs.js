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
  /* No `icon` field: every id here is ALSO an atlas key (src/data/glyphs.js),
     so the strip draws the same gilt glyph the skills rail draws for the same
     skill. The old emoji were not merely off-palette — `stripChromeEmoji()` in
     icon-set.js lists `.ams-btn` among the surfaces it scrubs, so these nine
     buttons have been rendering an EMPTY icon slot with a label under it. */
  const SKILLS = [
    { id: 'woodcutting', label: 'Wood'   },
    { id: 'mining',      label: 'Mine'   },
    { id: 'fishing',     label: 'Fish'   },
    { id: 'farming',     label: 'Farm'   },
    { id: 'cooking',     label: 'Cook'   },
    { id: 'crafting',    label: 'Craft'  },
    { id: 'smithing',    label: 'Smith'  },
    { id: 'prayer',      label: 'Prayer' },
    { id: 'magic',       label: 'Magic'  },
  ];
  function _amsGly(id) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(id, 18, 'currentColor') || '') : '';
  }
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
      + '<span class="ams-ic">' + _amsGly(s.id) + '</span>'
      + '<span class="ams-lbl">' + s.label + '</span>'
      + '</button>'
    ).join('');
    return strip;
  }

  function markActive(panel, id) {
    panel.dataset.mobileSkill = id;
    setActiveSkill(id);
    let activeBtn = null;
    panel.querySelectorAll('#act-mob-strip .ams-btn').forEach(b => {
      const on = b.dataset.skill === id;
      b.classList.toggle('active', on);
      if (on) activeBtn = b;
    });
    // Centre the button by scrolling the STRIP only. scrollIntoView walks every
    // ancestor and nudged #panel-skills ~11px down on every tap.
    const strip = panel.querySelector('#act-mob-strip');
    if (strip && activeBtn && typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: activeBtn.offsetLeft - (strip.clientWidth - activeBtn.offsetWidth) / 2, behavior: 'smooth' });
    }
  }

  // Boot only: show the remembered skill without navigating (no scroll jump).
  function setStripActive(panel, id) {
    markActive(panel, id);
    try {
      if (typeof window.showSkill === 'function') window.showSkill(id);
      else if (typeof window.selectSkill === 'function') window.selectSkill(id);
      else if (typeof window.renderSkillDetail === 'function') window.renderSkillDetail(id);
    } catch (e) {
      console.warn('[activities-mobile] skill switch failed:', e);
    }
  }

  // The strip is sticky chrome: publish its height so #skill-detail's
  // scroll-margin-top (theme-cozy.css) lands the header below it. 0 when hidden.
  function publishHeight(panel, strip) {
    const rect = strip.getBoundingClientRect();
    const h = rect.height > 0
      ? Math.ceil(rect.height + parseFloat(getComputedStyle(strip).marginBottom || 0)) : 0;
    panel.style.setProperty('--hr-sticky-h', h + 'px');
  }

  // A tap is a skill jump like every other entry: one door, openSkillDetail,
  // so the viewed skill, the viewing banner and the header anchor all follow.
  function openFromStrip(panel, id) {
    if (typeof window.openSkillDetail === 'function') window.openSkillDetail(id);
    else setStripActive(panel, id);
  }

  // Keep the highlight honest whichever route opened the skill.
  function wrapOpenDoor() {
    if (window.__amsOpenWrapped || typeof window.openSkillDetail !== 'function') return;
    window.__amsOpenWrapped = true;
    const orig = window.openSkillDetail;
    window.openSkillDetail = function (id) {
      const ret = orig.apply(this, arguments);
      const panel = document.getElementById('panel-skills');
      if (panel && SKILLS.find(s => s.id === id)) markActive(panel, id);
      return ret;
    };
  }

  let stripObserver = null;
  function install() {
    const panel = document.getElementById('panel-skills');
    if (!panel) return false;
    if (panel.querySelector('#act-mob-strip')) return true;
    const strip = buildStrip();
    panel.insertBefore(strip, panel.firstChild);
    strip.addEventListener('click', (e) => {
      const btn = e.target.closest('.ams-btn');
      if (!btn) return;
      openFromStrip(panel, btn.dataset.skill);
    });
    setStripActive(panel, getActiveSkill());
    wrapOpenDoor();
    publishHeight(panel, strip);
    if (stripObserver) stripObserver.disconnect();
    if (typeof ResizeObserver === 'function') {
      stripObserver = new ResizeObserver(() => publishHeight(panel, strip));
      stripObserver.observe(strip);
    }
    return true;
  }

  function watch() {
    if (!install()) return;
    window.addEventListener('resize', () => {
      const panel = document.getElementById('panel-skills');
      const strip = panel && panel.querySelector('#act-mob-strip');
      if (strip) publishHeight(panel, strip);
    });
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
