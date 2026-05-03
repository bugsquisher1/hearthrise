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

  function getActiveQuestCount(strip) {
    // Strip text patterns we've seen:
    //   "QUESTS · No active quests."
    //   "QUESTS · 3 active"
    //   "QUESTS · 2 active · Click to open"
    if (!strip) return 0;
    const text = strip.textContent || '';
    const m = text.match(/(\d+)\s*active/i);
    if (m) return parseInt(m[1], 10);
    if (/no active quest/i.test(text)) return 0;
    return 0;
  }

  function ensureButton() {
    if (document.getElementById('hr-quests-btn')) return document.getElementById('hr-quests-btn');
    const stats = document.querySelector('.top-stats');
    if (!stats) return null;
    const btn = document.createElement('button');
    btn.id = 'hr-quests-btn';
    btn.type = 'button';
    btn.title = 'Quests';
    btn.innerHTML = '<span class="hr-q-ic">📜</span><span class="hr-q-lbl">Quests</span><span class="hr-q-count">0</span>';
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
    const strip = getStrip();
    const count = getActiveQuestCount(strip);
    const countEl = btn.querySelector('.hr-q-count');
    if (countEl) countEl.textContent = String(count);
    btn.classList.toggle('no-active', count === 0);
    // Optional: hide the count entirely when there are 0 quests, just
    // keep the button as a discovery surface.
  }

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
