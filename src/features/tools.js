// ============================================================
// src/features/tools.js  (b201, SYS-3)
//
// OSRS-style gathering-tool progression, Melvor-style application:
// the BEST tool you own for a skill auto-applies — no equip juggling.
// Tool items live in data/items.js (type:'tool', toolSkill, toolTier,
// toolSpeed); they're crafted via smithing (axes/picks) and crafting
// (rods) — see data/recipes.js.
//
// startSkill() in legacy.js adds bestToolSpeed(type) to the gather
// speed bonus, so a rune axe (+25%) visibly out-chops a bronze axe
// (+5%). This makes tool upgrades a real, obvious progression lane.
// ============================================================
(function () {
  'use strict';

  // Best owned tool for a skill: checks inventory (and equipment, in case
  // a tool ever gets equipped) and returns the highest-tier match.
  function bestTool(skill) {
    var ITEMS = window.ITEMS || {};
    var G = window.G || {};
    var best = null;
    function consider(id) {
      var it = ITEMS[id];
      if (!it || it.type !== 'tool' || it.toolSkill !== skill) return;
      if (!best || (it.toolTier || 0) > (best.toolTier || 0)) best = Object.assign({ id: id }, it);
    }
    Object.keys(G.inventory || {}).forEach(function (id) { if ((G.inventory[id] || 0) > 0) consider(id); });
    Object.keys(G.equipment || {}).forEach(function (slot) { var id = G.equipment[slot]; if (id) consider(id); });
    return best;
  }

  function bestToolSpeed(skill) {
    var t = bestTool(skill);
    return t ? (t.toolSpeed || 0) : 0;
  }

  window.HearthriseTools = {
    bestTool: bestTool,
    bestToolSpeed: bestToolSpeed
  };
})();
