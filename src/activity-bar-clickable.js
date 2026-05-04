// ============================================================
// src/activity-bar-clickable.js
//
// Makes the topbar "Idle — pick an activity" indicator clickable.
// When idle, clicking jumps the player to the Activities tab so
// new users have an obvious affordance to start playing.
// When mid-activity (training / fighting), clicking does nothing
// extra — the existing Stop button on the bar handles cancel.
// ============================================================

(function(){
  'use strict';

  function wire() {
    const bar = document.getElementById('activity-bar');
    if (!bar) return;
    if (bar.dataset.clickWired === '1') return;
    bar.dataset.clickWired = '1';

    bar.style.cursor = 'pointer';
    bar.title = 'Click to pick an activity';

    bar.addEventListener('click', (e) => {
      // Don't override clicks on the Stop button or any descendant
      // that already has its own click handler (e.g. ab-stop)
      if (e.target.closest('button, .ab-stop, [data-no-jump]')) return;
      // If we're idle, jump to Activities. Otherwise, do nothing —
      // the player's busy and the click is probably accidental.
      const isIdle = bar.classList.contains('idle');
      if (!isIdle) return;
      if (typeof window.showTab === 'function') window.showTab('skills');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 200));
  } else {
    setTimeout(wire, 200);
  }
  // Re-wire if the bar is recreated by the engine
  setInterval(wire, 2000);
})();
