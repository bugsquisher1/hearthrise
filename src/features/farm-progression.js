// ============================================================
// src/features/farm-progression.js
//
// Batch C (b136) — Housing-gated farm progression.
//
// Design (see ROADMAP.md "Housing-gated farm progression"):
//   • Crops unlock by farm-plot level (1..5), NOT by farming level.
//   • Plot upgrades cost a `farm_deed` item that drops from
//     gameplay (0.1% per Tier 2+ kill, 0.5% per bounty turn-in).
//   • Deeds are tradable on the market — explicitly NOT BoP.
//   • Single integer `G.plotLevels` applies to all 8 plots
//     (kept simple — Tyler's design ask).
//
// API (window.HearthriseFarm):
//   getPlotLevel()                 → number 1..5
//   getPlotUnlockedCrops()         → ['turnip', ...]
//   canPlantCrop(cropId)           → boolean
//   getDeedsRequiredForNextLevel() → number (0 if maxed)
//   getDeedCount()                 → number — deeds in bag
//   upgradePlot()                  → boolean — spends deeds, level++, fires refresh
//   getTierMap()                   → const map (for UI)
//
// Engine + UI consumers:
//   • plantCrop() in legacy.js gates on canPlantCrop()
//   • openSeedPicker() filters / labels locked seeds
//   • House → Plot tab renders the upgrade card
//   • Smoke test verifies the contract
// ============================================================

(function(){
  'use strict';

  // Plot tier → crop unlock set + this-tier deed cost.
  // Cumulative deeds to reach tier N = sum of cost[2..N].
  // Lv 1 is the default starting state — no cost, Turnip-only.
  var TIERS = [
    null, // index 0 unused
    { unlocks: ['turnip'],                                              cost: 0 },
    { unlocks: ['turnip','carrot','wheat'],                             cost: 1 },
    { unlocks: ['turnip','carrot','wheat','potato','tomato'],           cost: 3 },
    { unlocks: ['turnip','carrot','wheat','potato','tomato','pumpkin'], cost: 5 },
    { unlocks: ['turnip','carrot','wheat','potato','tomato','pumpkin'], cost: 8 }, // Lv 5 = max (currently same as Lv 4 since pumpkin is the last crop; Lv 5 future-proofs the curve)
  ];
  var MAX_LEVEL = TIERS.length - 1; // 5

  function clampLevel(n){
    n = Math.floor(Number(n) || 1);
    if(n < 1) return 1;
    if(n > MAX_LEVEL) return MAX_LEVEL;
    return n;
  }

  function getPlotLevel(){
    if(!window.G) return 1;
    var lv = window.G.plotLevels;
    if(typeof lv !== 'number') {
      // Migration safety: if the v3→v4 migration didn't run for any
      // reason, default to 1 instead of crashing.
      window.G.plotLevels = 1;
      lv = 1;
    }
    return clampLevel(lv);
  }

  function getPlotUnlockedCrops(){
    var lv = getPlotLevel();
    return TIERS[lv].unlocks.slice();
  }

  function canPlantCrop(cropId){
    if(!cropId) return false;
    return getPlotUnlockedCrops().indexOf(cropId) !== -1;
  }

  function getDeedsRequiredForNextLevel(){
    var lv = getPlotLevel();
    if(lv >= MAX_LEVEL) return 0;
    return TIERS[lv + 1].cost;
  }

  function getDeedCount(){
    if(!window.G || !window.G.inventory) return 0;
    return window.G.inventory.farm_deed | 0;
  }

  function upgradePlot(){
    var lv = getPlotLevel();
    if(lv >= MAX_LEVEL){
      if(typeof window.notify === 'function') window.notify('Farm Plot already maxed', 'kill');
      return false;
    }
    var need = getDeedsRequiredForNextLevel();
    var have = getDeedCount();
    if(have < need){
      if(typeof window.notify === 'function') window.notify('Need ' + need + " Farmer's Deed" + (need===1?'':'s') + ' (have ' + have + ')', 'kill');
      return false;
    }
    // Spend + level up. Use removeItem if available so the inventory
    // render stays in sync, otherwise fall back to direct mutation.
    if(typeof window.removeItem === 'function'){
      window.removeItem('farm_deed', need);
    } else {
      window.G.inventory.farm_deed = Math.max(0, have - need);
    }
    window.G.plotLevels = lv + 1;
    if(typeof window.notify === 'function') window.notify('🌾 Farm Plot upgraded to Lv ' + (lv+1) + '!', 'levelup');
    if(typeof window.saveLocal === 'function') window.saveLocal();
    // Refresh any panels that show plot state.
    try { if(typeof window.renderHouse === 'function') window.renderHouse(); } catch(e){}
    try { if(typeof window.renderFarm === 'function') window.renderFarm(); } catch(e){}
    try { if(typeof window.renderInventory === 'function') window.renderInventory(); } catch(e){}
    try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
    return true;
  }

  function getTierMap(){ return TIERS; }

  // ── Deed-drop helpers ─────────────────────────────────────
  // Called from killMonster() and completeBounty() in legacy.js.
  // Centralised here so balance changes happen in one place.
  var BOUNTY_DEED_CHANCE = 0.005; // 0.5%
  var KILL_DEED_CHANCE   = 0.001; // 0.1%

  function rollBountyDeed(){
    if(Math.random() < BOUNTY_DEED_CHANCE){
      grantDeed('bounty');
      return true;
    }
    return false;
  }

  function rollKillDeed(monster){
    if(!monster) return false;
    // Tier-1 mobs are intentionally pure-progression — deeds drop
    // only at Tier 2+ to keep early game clean. Bounties cover Tier-1.
    if((monster.tier|0) < 2) return false;
    if(Math.random() < KILL_DEED_CHANCE){
      grantDeed('kill');
      return true;
    }
    return false;
  }

  function grantDeed(source){
    if(typeof window.addItem === 'function'){
      window.addItem('farm_deed', 1);
    } else if(window.G && window.G.inventory){
      window.G.inventory.farm_deed = (window.G.inventory.farm_deed | 0) + 1;
    }
    if(typeof window.notify === 'function'){
      window.notify("📜 Rare drop: Farmer's Deed!", 'levelup');
    }
    // Combat log breadcrumb if available
    try {
      if(window.G && Array.isArray(window.G.combatLog)){
        window.G.combatLog.push("<span class=\"rare\">📜 RARE: Farmer's Deed</span>");
      }
    } catch(e){}
  }

  // ── Public API ─────────────────────────────────────────────
  window.HearthriseFarm = {
    getPlotLevel: getPlotLevel,
    getPlotUnlockedCrops: getPlotUnlockedCrops,
    canPlantCrop: canPlantCrop,
    getDeedsRequiredForNextLevel: getDeedsRequiredForNextLevel,
    getDeedCount: getDeedCount,
    upgradePlot: upgradePlot,
    getTierMap: getTierMap,
    // Drop hooks — called by killMonster + completeBounty.
    rollKillDeed: rollKillDeed,
    rollBountyDeed: rollBountyDeed,
    // Constants — exposed for tests + UI.
    MAX_LEVEL: MAX_LEVEL,
    BOUNTY_DEED_CHANCE: BOUNTY_DEED_CHANCE,
    KILL_DEED_CHANCE: KILL_DEED_CHANCE,
  };

  console.log('[farm-progression] HearthriseFarm API loaded — plot Lv', getPlotLevel(), '/', MAX_LEVEL);
})();
