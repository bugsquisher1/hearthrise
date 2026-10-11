// ============================================================
// src/quests-topbar-button.js
//
// The wax-stamp Quests button in `.top-stats`, left of the Combat
// Level tile. Its badge counts what you can act on (a reward waiting
// to be claimed, else the daily quests still open), read from the
// daily-quests module's own questBadgeState(); a click opens the
// Quests sheet. The progressive reveal holds it back until step 8.
// ============================================================

(function(){
  'use strict';

  function questState() {
    if (typeof window.questBadgeState === 'function') {
      try {
        const s = window.questBadgeState();
        if (s && typeof s.active === 'number') return s;
      } catch (e) { /* the daily-quests module has not booted */ }
    }
    return { active: 0, claimable: 0 };
  }

  function ensureButton() {
    if (document.getElementById('hr-quests-btn')) return document.getElementById('hr-quests-btn');
    const stats = document.querySelector('.top-stats');
    if (!stats) return null;
    const btn = document.createElement('button');
    btn.id = 'hr-quests-btn';
    btn.type = 'button';
    btn.title = 'Quests';
    // Icon slot starts empty — icon-set.js paints a gilt scroll glyph into
    // .hr-q-ic (uiQuests). No emoji in chrome (b213).
    btn.innerHTML = '<span class="hr-q-ic"></span><span class="hr-q-lbl">Quests</span><span class="hr-q-count">0</span>';
    btn.addEventListener('click', () => {
      if (typeof window.openQuestsModal === 'function') window.openQuestsModal();
    });
    // Insert IMMEDIATELY BEFORE the Combat stat tile (Tyler's preference —
    // Quests should sit to the left of the Combat Level indicator).
    const combatStat = document.getElementById('top-combat');
    const combatTile = combatStat ? combatStat.closest('.t-stat') : null;
    if (combatTile) {
      combatTile.parentNode.insertBefore(btn, combatTile);
    } else {
      stats.insertBefore(btn, stats.firstChild);
    }
    return btn;
  }

  function sync() {
    const btn = ensureButton();
    if (!btn) return;
    const st = questState();
    // A badge is a call to action, so it counts the thing you can ACT on: a
    // reward waiting to be claimed outranks a quest still in progress. When
    // nothing is claimable it falls back to the in-progress count, so the
    // button still says how much is live. `has-claim` lets the badge go gilt
    // for the state that is worth a glance.
    const claim = st.claimable > 0;
    const count = claim ? st.claimable : st.active;
    const countEl = btn.querySelector('.hr-q-count');
    if (countEl) countEl.textContent = String(count);
    btn.classList.toggle('no-active', count === 0);
    btn.classList.toggle('has-claim', claim);
    /* The progressive reveal holds the chip back until the spine's eighth step
       (src/data/reveals.js `card:quests-chip`), never while a reward waits. */
    const R = window.HearthriseReveal;
    const shown = claim || !R || R.shows('card:quests-chip');
    const want = shown ? '' : 'none';
    if (btn.style.display !== want) btn.style.display = want;
    btn.title = claim
      ? (st.claimable === 1 ? '1 quest reward ready to claim' : st.claimable + ' quest rewards ready to claim')
      : (st.active ? (st.active === 1 ? '1 quest in progress' : st.active + ' quests in progress') : 'Quests');
  }
  // Progress can move a quest into "claimable" without any event, so a slow
  // poll keeps the badge honest; it costs nothing beside the dashboard.
  setInterval(sync, 5000);
  window.addEventListener('hearthrise:reveal', sync);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(sync, 200));
  } else {
    setTimeout(sync, 200);
  }
})();
