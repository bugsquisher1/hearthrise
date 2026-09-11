/* ── AN ACTIVITY TILE DECIDES START-vs-STOP AT THE CLICK, NOT AT THE PAINT ───
   Loaded before legacy.js, like its siblings in this folder, because the tile
   markup both renderers emit names this function inside an onclick attribute:
   the router has to exist before the first grid paints, not after a module
   boot. Classic script, one published global, no imports.

   THE BUG IT KILLS (live, reproduced three times on the QA account): chop
   Willow → fight a Goblin → open Skills and tap Willow again → nothing at all.
   No intent, no toast, the header still reading "Fighting Goblin". Tapping OAK
   in the same state switched instantly and paid the window; smithing → Willow
   worked. The dead tile was always the node the player CAME FROM.

   Both tile builders — legacy.js's and its ESM twin in
   features/activities-grid.js — baked the handler at PAINT time: `stopSkill()`
   while that node was the active one, `startSkill(…)` otherwise. Starting a
   fight runs the activity mutex's cross-stop, which clears the gather pointer
   and strips the `.active` class and the Active badge off the tiles IN PLACE
   without rebuilding the panel — and walking back to the Skills tab does not
   rebuild it either (measured). So that one tile kept a stop handler while
   looking perfectly idle, the stop hit stopSkill's "was anything actually
   running" guard, and the gesture died in silence: no pointer write, no
   declaration, no toast. The rendered attribute had become a third copy of
   "what is the player doing", drifting from G — which the server envelope
   reconciles and the tap is entitled to trust.

   THE SEAM IS THE CLICK. One entry point, read at the moment the player acts,
   that fails safe towards SENDING the switch: anything other than "this exact
   node is running right now" starts it. A stale paint can no longer swallow a
   gesture, whatever painted it, and the property survives any future renderer
   because the decision no longer lives in HTML.

   `window.startSkill` / `window.stopSkill` on purpose, never a lexical binding:
   the activity mutex (the recovery gate and the cross-stop of combat) is
   installed ON the window property, so calling the raw declaration would route
   a tile tap around the one place that holds that policy. Degrades to doing
   nothing if legacy.js has not published them yet — before boot there is no
   activity to toggle.

   GATHER TILES ONLY, deliberately. The artisan tiles and the fight rows bake
   the same render-time toggle and are the same class; they are their own lane
   with their own test, not a silent ride-along on this one. */
(function () {
  'use strict';
  window.hrActivityTileClick = function (skillId, targetId, ms) {
    var G = window.G;
    if (G && G.activeSkill === skillId && G.skillTargetId === targetId) {
      if (typeof window.stopSkill === 'function') window.stopSkill();
      return;
    }
    if (typeof window.startSkill === 'function') window.startSkill(skillId, targetId, ms);
  };
})();
