// ============================================================
// src/quests-topbar-button.js
//
// Replaces the legacy `.global-quests-strip` (full-width banner
// under the topbar) with a single wax-stamp red button injected
// into `.top-stats` next to the Combat Level indicator.
//
// Behaviour:
//   • Reads the current quest state from the existing strip
//     (active quest count, label) and reflects it on the button.
//   • Click forwards to the same handler the strip used —
//     usually `openQuestsModal()` or a delegated click on
//     `.global-quests-strip`. Falls back to dispatching a
//     synthetic click on the strip if no global function exists.
//   • Re-syncs whenever the strip's text mutates (engine updates
//     the strip text on quest progress).
// ============================================================

(function(){
  'use strict';

  function getStrip() {
    return document.getElementById('global-quests-strip')
        || document.querySelector('.global-quests-strip');
  }

  // b371 — ASK THE GAME, DON'T READ THE OTHER UI.
  //
  // This used to derive the count by running /(\d+)\s*active/ over the quest
  // strip's text, from a time when the strip said "QUESTS · 3 active". It has
  // rendered PILLS for many builds; the word "active" is gone; the regex has
  // matched nothing ever since and the badge showed a hardcoded-looking 0 to
  // every player — including one with a reward sitting there to claim, which
  // is how the live audit found it.
  //
  // `window.questBadgeState()` is computed by the quests module itself from the
  // same isComplete/isClaimed helpers the Claim button enforces with, so the
  // badge cannot drift from the modal again. The strip scrape survives only as
  // a fallback for the window in which legacy.js has not finished booting.
  function questState(strip) {
    if (typeof window.questBadgeState === 'function') {
      try {
        const s = window.questBadgeState();
        if (s && typeof s.active === 'number') return s;
      } catch (e) { /* fall through to the scrape */ }
    }
    const text = (strip && strip.textContent) || '';
    const m = text.match(/(\d+)\s*active/i);
    return { active: m ? parseInt(m[1], 10) : 0, claimable: 0 };
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
      // Forward the click to whatever the strip used to do.
      // Most likely: a global openQuests / showQuests function, OR
      // a click handler on the strip itself.
      if (typeof window.openQuests === 'function') return window.openQuests();
      if (typeof window.showQuests === 'function') return window.showQuests();
      if (typeof window.toggleQuests === 'function') return window.toggleQuests();
      const strip = getStrip();
      if (strip) {
        // Synthesize a click — engine's delegated listener will catch it
        strip.click();
        return;
      }
      // Last resort: try the modal directly
      const modal = document.getElementById('quests-modal') || document.getElementById('quest-modal');
      if (modal) modal.classList.add('show');
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
    const st = questState(getStrip());
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
    btn.title = claim
      ? (st.claimable === 1 ? '1 quest reward ready to claim' : st.claimable + ' quest rewards ready to claim')
      : (st.active ? (st.active === 1 ? '1 quest in progress' : st.active + ' quests in progress') : 'Quests');
  }
  // The strip only repaints on quest events; progress toward a target can move
  // a quest into "claimable" without touching it. A slow poll is enough for a
  // badge and costs nothing next to the per-second dashboard re-render.
  setInterval(sync, 5000);

  // Watch the strip for text changes (engine updates it on quest progress)
  function watch() {
    const strip = getStrip();
    if (!strip) {
      // Strip not in DOM yet — retry shortly (engine boots after this script in some setups)
      setTimeout(watch, 500);
      return;
    }
    const obs = new MutationObserver(sync);
    obs.observe(strip, { childList: true, characterData: true, subtree: true });
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(watch, 200));
  } else {
    setTimeout(watch, 200);
  }
})();
