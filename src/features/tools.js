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
/* PHASE 0 (server authority): the maths moved to src/core/tools.js, which is
   pure ESM and imports cleanly in Deno. This file is now the CLIENT ADAPTER —
   it reads window.G / window.ITEMS and hands them to the core. The public
   window.HearthriseTools API is unchanged, because six callers depend on it.
   Server-side, the accrual Edge Function calls src/core/tools.js directly with
   the player's inventory rows. One implementation of "which axe is best". */
(function () {
  'use strict';

  function core() { return window.HearthriseCore && window.HearthriseCore.tools; }

  // Best owned tool for a skill: checks inventory (and equipment, in case
  // a tool ever gets equipped) and returns the highest-tier match.
  function bestTool(skill) {
    var C = core();
    if (!C) return null;
    var G = window.G || {};
    var eq = window.HearthriseEquipRead ? window.HearthriseEquipRead.equipmentMap(G) : G.equipment;
    return C.bestTool(skill, G.inventory, eq, window.ITEMS || {});
  }

  function bestToolSpeed(skill) {
    var C = core();
    return C ? C.toolSpeed(bestTool(skill)) : 0;
  }

  /* Wave 3 (audit fix — "tools don't feel like they do anything"): a tool now
     does THREE things, not just a tiny speed nudge. XP and a double-yield chance
     are DERIVED from the tool's tier so they scale on the same ladder the player
     already climbs, and a per-item override (`toolXpB` / `toolDouble`) wins when
     set. Tier 1 = +2% / 2%; Tier 7 (Dawnsteel) = +14% / 14% — a felt reason to
     upgrade, well under the power budget. Gathering AND artisan tools share this,
     so a Forge Hammer speeds smithing exactly as a Rune Axe speeds woodcutting. */
  function bestToolXpB(skill) {
    var C = core();
    return C ? C.toolXpB(bestTool(skill)) : 0;
  }
  function bestToolDouble(skill) {
    var C = core();
    return C ? C.toolDouble(bestTool(skill)) : 0;
  }

  window.HearthriseTools = {
    bestTool: bestTool,
    bestToolSpeed: bestToolSpeed,
    bestToolXpB: bestToolXpB,
    bestToolDouble: bestToolDouble
  };
})();
