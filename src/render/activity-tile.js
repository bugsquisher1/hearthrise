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

   GATHER AND ARTISAN, one router. The gather half shipped first with its own
   test; the artisan tiles (four renderers: two `renderArtisanActivities`
   bodies, the monolith's `tileForArtisan` that actually paints, and its ESM
   twin) baked the identical toggle and died the identical death — cook shrimp
   → fight → tap Cook Shrimp again → nothing. `kind` is the only difference
   between them: BOTH engines write the SAME pointer pair (`activeSkill` /
   `skillTargetId`), so the stop half is shared and only the start differs.
   A table rather than an if-chain because the fight rows are the third family
   and must register a starter here instead of baking a third copy of the
   toggle into an HTML attribute. The fourth tile family gets a row, not a
   fork. Unknown kind does nothing loudly: refusing to guess a starter is
   correct, and only this repo's own renderers can name a kind. */
(function () {
  'use strict';
  var START = {
    gather: function (skillId, targetId, ms) {
      if (typeof window.startSkill === 'function') window.startSkill(skillId, targetId, ms);
    },
    artisan: function (skillId, targetId) {
      if (typeof window.startArtisan === 'function') window.startArtisan(skillId, targetId);
    }
  };
  window.hrActivityTileClick = function (skillId, targetId, ms, kind) {
    var G = window.G;
    /* omitted `kind` is gather — the original three-argument signature, which
       every gather tile in both renderers still emits. */
    var start = START[kind || 'gather'];
    if (!start) { try { console.warn('[activity-tile] no starter registered for kind ' + kind); } catch (e) {} return; }
    if (G && G.activeSkill === skillId && G.skillTargetId === targetId) {
      if (typeof window.stopSkill === 'function') window.stopSkill();
      return;
    }
    start(skillId, targetId, ms);
  };
})();
