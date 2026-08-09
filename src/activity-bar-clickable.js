// ============================================================
// src/activity-bar-clickable.js
//
// Makes the topbar "current activity" indicator clickable.
//   • Idle  → jump to the Activities (Skills) tab so new players have an
//     obvious affordance to start playing.
//   • Busy (training / fighting / crafting) → jump to THAT activity's page,
//     so the bar is a shortcut back to whatever you're doing from anywhere.
//     (Tyler: "clicking the bar that shows my current activity should take
//     me to that activity.")
// The Stop button on the bar keeps its own handler — clicking it never jumps.
// ============================================================

(function(){
  'use strict';

  // Resolve where the current activity lives. Returns {id} to route through the
  // canonical activity router (window.hrOpenActivity), or {tab} for a direct
  // showTab, or null when idle. Exposed for tests.
  function activityBarTarget(){
    const G = window.G;
    if (!G) return null;
    if (G.activeMonster) return { tab: 'combat' };
    if (G.activeSkill)   return { id: G.activeSkill };            // gather skills, farming
    if (G.activeArtisanRecipe) return { id: G.activeArtisanSkill || 'cooking' };
    if (G.activeAction) {
      const k = G.activeAction.kind;
      const skillMap = { smelt:'smithing', forge:'smithing', saw:'crafting', craft:'crafting', cook:'cooking', enchant:'crafting', pray:'prayer' };
      const id = skillMap[k];
      return id ? { id } : { tab: 'skills' };
    }
    return null;
  }
  window.__activityBarTarget = activityBarTarget;

  // Route to the current activity's page (or the Activities picker when idle).
  function openCurrentActivity(){
    const t = activityBarTarget();
    if (!t) { // idle
      if (typeof window.showTab === 'function') window.showTab('skills');
      return;
    }
    if (t.id && typeof window.hrOpenActivity === 'function') { window.hrOpenActivity(t.id); return; }
    const tab = t.tab || 'skills';
    if (typeof window.showTab === 'function') window.showTab(tab);
  }
  window.openCurrentActivity = openCurrentActivity;

  function wire() {
    const bar = document.getElementById('activity-bar');
    if (!bar) return;
    if (bar.dataset.clickWired === '1') return;
    bar.dataset.clickWired = '1';

    bar.style.cursor = 'pointer';
    bar.title = 'Click to open your current activity';

    bar.addEventListener('click', (e) => {
      // Never hijack the Stop button (or anything that opts out).
      if (e.target.closest('button, .ab-stop, [data-no-jump]')) return;
      openCurrentActivity();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 200));
  } else {
    setTimeout(wire, 200);
  }
  // Re-wire if the bar is recreated by the engine.
  setInterval(wire, 2000);
})();
