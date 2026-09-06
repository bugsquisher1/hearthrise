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
// ── PHASE 0 (server authority) ──────────────────────────────
// Every number in here — the tier table, the deed costs, the b220 growth
// model — moved to src/core/farm.js, which is pure ESM with no `window`
// and no wall clock. This file is now the CLIENT ADAPTER: it supplies
// `window.G`, `window.CROPS` and `Date.now()`, and owns the side effects
// (notify / removeItem / render). The public window.HearthriseFarm API is
// unchanged, because legacy.js and four renderers depend on it.
//
// Farming is the domain closest to server-ready: growth is derived from
// timestamps, so the Edge Function computes readiness as
// `now() >= plantedAt + growth_ms(...)` using this same core module. The
// only thing that changes server-side is whose clock `now` is.
//
// API (window.HearthriseFarm):
//   getPlotLevel()                 → number 1..5 (SERVER mirror wins)
//   getServerPlotLevel()           → number|null — the server's tier, or null if unknown
//   requiredPlotLevel(cropId)      → number — lowest tier that unlocks the crop
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

  /* The core is published by src/core-bridge.js, a MODULE — so it lands
     after this classic script has parsed but well before anything here is
     called (legacy.js boots on DOMContentLoaded). Resolved per call rather
     than captured, so there is no load-order hazard to get wrong. */
  function core(){ return window.HearthriseCore && window.HearthriseCore.farm; }
  function rng(){ return window.HearthriseCore && window.HearthriseCore.rng; }
  function crops(){ return window.CROPS || {}; }
  function nowMs(){ return Date.now(); }

  var MAX_LEVEL = 5;   // mirrors core.MAX_PLOT_LEVEL; asserted by the drift guard

  /* ── THE PLOT TIER IS THE SERVER'S NUMBER (P1, 2026-09-06) ────────────
     `player_state.plot_level` is written ONLY by hr_farm_upgrade_plot, and
     hr_farm_plant refuses any crop whose tier exceeds it (`plot_tier_locked`).
     So the CLIENT must never offer a crop off a tier the server has not
     recorded — that is the residue-ahead class (the property-rung deadlock in
     a second costume), and it is what made the farm look broken fleet-wide:
     "you plant something and it doesn't stay" (Paione).

     G._serverPlotLevel is the MIRROR: `_`-prefixed scratch (never snapshotted,
     never in the residue allowlist), written ONLY by the two server-truth paths
       • src/net/accrue.js reconcileFarm      ← hr_state_of state.plot_level
       • src/net/farm-sync.js reconcileFarmResult('upgrade') ← the RPC response
     Whenever it is known it WINS over G.plotLevels, so no client-authored or
     stale value can raise the gate. Unknown (no envelope yet / projection not
     applied) falls back to G.plotLevels, whose own default is the fail-safe 1. */
  function getServerPlotLevel(){
    if(!window.G) return null;
    var sv = window.G._serverPlotLevel;
    if(typeof sv !== 'number' || !isFinite(sv) || sv < 1) return null;
    var C = core();
    return C ? C.clampPlotLevel(sv) : Math.max(1, Math.min(MAX_LEVEL, Math.floor(sv) || 1));
  }

  function getPlotLevel(){
    if(!window.G) return 1;
    var sv = getServerPlotLevel();
    if(sv !== null){
      /* Converge the legacy field so nothing downstream reads two answers. */
      if(window.G.plotLevels !== sv) window.G.plotLevels = sv;
      return sv;
    }
    var lv = window.G.plotLevels;
    if(typeof lv !== 'number') {
      // Migration safety: if the v3→v4 migration didn't run for any
      // reason, default to 1 instead of crashing.
      window.G.plotLevels = 1;
      lv = 1;
    }
    var C = core();
    return C ? C.clampPlotLevel(lv) : Math.max(1, Math.min(MAX_LEVEL, Math.floor(lv) || 1));
  }

  /** The lowest Farm Plot level that unlocks `cropId` (0 = no tier does).
      One answer for the plant gate, the refusal line and the seed picker. */
  function requiredPlotLevel(cropId){ return core().requiredPlotLevel(cropId); }

  function getPlotUnlockedCrops(){ return core().unlockedCrops(getPlotLevel()); }
  function canPlantCrop(cropId){ return core().canPlantCrop(getPlotLevel(), cropId); }
  function getDeedsRequiredForNextLevel(){ return core().deedsForNextLevel(getPlotLevel()); }

  function getDeedCount(){
    if(!window.G || !window.G.inventory) return 0;
    return window.G.inventory.farm_deed | 0;
  }

  function farmSyncArmed(){
    return !!(window.HearthriseFarmSync
      && typeof window.HearthriseFarmSync.isFarmServerArmed === 'function'
      && window.HearthriseFarmSync.isFarmServerArmed());
  }

  function upgradePlot(){
    var lv = getPlotLevel();
    if(lv >= core().MAX_PLOT_LEVEL){
      if(typeof window.notify === 'function') window.notify('Farm Plot already maxed', 'kill');
      return false;
    }
    var need = getDeedsRequiredForNextLevel();
    var have = getDeedCount();
    if(have < need){
      if(typeof window.notify === 'function') window.notify('Need ' + need + " Farmer's Deed" + (need===1?'':'s') + ' (have ' + have + ')', 'kill');
      return false;
    }
    // Server-authority routing (DORMANT): the server owns the deed spend + the
    // plot_level column. Send the intent and reconcile G.plotLevels + the deed
    // debit from the RESPONSE (server's own numbers, once) — no local mutation.
    if(farmSyncArmed()){
      var FS = window.HearthriseFarmSync;
      var deps = {
        addItem: function(id,q){ if(typeof window.addItem==='function') window.addItem(id,q); },
        removeItem: function(id,q){ if(typeof window.removeItem==='function') window.removeItem(id,q); },
        addXp: function(sk,x){ if(typeof window.addXp==='function') window.addXp(sk,x); },
      };
      FS.farmUpgradePlot().then(function(res){
        if(res && res.ok){ try{ FS.reconcileFarmResult(window.G,'upgrade',res,deps); }catch(e){}
          if(typeof window.notify === 'function') window.notify('Farm Plot upgraded to Lv ' + res.plot_level + '!', 'levelup');
        } else if(res && res.error && res.error!=='transport'){
          if(typeof window.notify === 'function') window.notify('Could not upgrade plot — try again', 'kill');
        }
        try { if(typeof window.renderHouse === 'function') window.renderHouse(); } catch(e){}
        try { if(typeof window.renderFarm === 'function') window.renderFarm(); } catch(e){}
        try { if(typeof window.renderInventory === 'function') window.renderInventory(); } catch(e){}
        try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
      });
      return true;
    }
    // Spend + level up. Use removeItem if available so the inventory
    // render stays in sync, otherwise fall back to direct mutation.
    if(typeof window.removeItem === 'function'){
      window.removeItem('farm_deed', need);
    } else {
      window.G.inventory.farm_deed = Math.max(0, have - need);
    }
    window.G.plotLevels = lv + 1;
    if(typeof window.notify === 'function') window.notify('Farm Plot upgraded to Lv ' + (lv+1) + '!', 'levelup');
    if(typeof window.saveLocal === 'function') window.saveLocal();
    // Refresh any panels that show plot state.
    try { if(typeof window.renderHouse === 'function') window.renderHouse(); } catch(e){}
    try { if(typeof window.renderFarm === 'function') window.renderFarm(); } catch(e){}
    try { if(typeof window.renderInventory === 'function') window.renderInventory(); } catch(e){}
    try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
    return true;
  }

  function getTierMap(){ return core().PLOT_TIERS; }

  // ── Deed-drop helpers ─────────────────────────────────────
  // Called from killMonster() and completeBounty() in legacy.js.
  // The CHANCES and the tier gate are the core's; the roll uses the shared
  // seeded generator so an offline replay of these drops is reproducible.

  function rollBountyDeed(){
    if(rng().chance(core().BOUNTY_DEED_CHANCE)){
      grantDeed('bounty');
      return true;
    }
    return false;
  }

  function rollKillDeed(monster){
    // Tier-1 mobs are intentionally pure-progression — deeds drop
    // only at Tier 2+ to keep early game clean. Bounties cover Tier-1.
    if(!core().killDeedEligible(monster)) return false;
    if(rng().chance(core().KILL_DEED_CHANCE)){
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
      window.notify("Rare drop: Farmer's Deed!", 'levelup');
    }
    // Combat log breadcrumb if available
    try {
      if(window.G && Array.isArray(window.G.combatLog)){
        window.G.combatLog.push("<span class=\"rare\">📜 RARE: Farmer's Deed</span>");
      }
    } catch(e){}
  }

  // ══════════════════════════════════════════════════════════
  // b220 — GROWTH MODEL (Backlog #13, docs/design/farming-watering.md)
  //
  // The model itself is documented in src/core/farm.js. What remains here
  // is the clock: every accessor below resolves `now` from Date.now() and
  // the crop catalogue from window.CROPS, then defers. That is the ONLY
  // difference between the client's answer and the server's.
  //
  // Watering used to be a MANDATORY GATE with no timeout, so an unwatered
  // plot never matured — not late, *never*. A crop now ALWAYS grows;
  // watering opens a 2-hour window in which it grows twice as fast.
  // ══════════════════════════════════════════════════════════

  function growthHours(plot, now){
    return core().growthHours(plot, (typeof now === 'number' && isFinite(now)) ? now : nowMs());
  }
  function isReady(plot){ return core().isReady(plot, crops(), nowMs()); }
  function progressPct(plot){ return core().progressPct(plot, crops(), nowMs()); }
  function isWaterable(plot){ return core().isWaterable(plot, crops(), nowMs()); }
  function waterWindowRemainingMs(plot){ return core().waterWindowRemainingMs(plot, nowMs()); }
  function nextWaterableInMs(plot){ return waterWindowRemainingMs(plot); }
  function readyInMs(plot){ return core().readyInMs(plot, crops(), nowMs()); }
  function readyAtMs(plot){ return nowMs() + readyInMs(plot); }
  function lastWatering(plot){ return core().lastWatering(plot, nowMs()); }
  function maxWaterings(cropId){ return core().maxWaterings(cropId, crops()); }
  function waterXp(plot){ return core().waterXp(plot, crops()); }
  function normalizePlot(plot){ return core().normalizePlot(plot, nowMs()); }

  // ── Public API ─────────────────────────────────────────────
  window.HearthriseFarm = {
    getPlotLevel: getPlotLevel,
    getServerPlotLevel: getServerPlotLevel,
    requiredPlotLevel: requiredPlotLevel,
    getPlotUnlockedCrops: getPlotUnlockedCrops,
    canPlantCrop: canPlantCrop,
    getDeedsRequiredForNextLevel: getDeedsRequiredForNextLevel,
    getDeedCount: getDeedCount,
    upgradePlot: upgradePlot,
    getTierMap: getTierMap,
    // Drop hooks — called by killMonster + completeBounty.
    rollKillDeed: rollKillDeed,
    rollBountyDeed: rollBountyDeed,
    // b220 growth model — the single source of truth for crop growth.
    growthHours: growthHours,
    progressPct: progressPct,
    isReady: isReady,
    isWaterable: isWaterable,
    waterWindowRemainingMs: waterWindowRemainingMs,
    nextWaterableInMs: nextWaterableInMs,
    readyInMs: readyInMs,
    readyAtMs: readyAtMs,
    lastWatering: lastWatering,
    maxWaterings: maxWaterings,
    waterXp: waterXp,
    normalizePlot: normalizePlot,
    // Constants — exposed for tests + UI. Read live from the core so there
    // is exactly one authored value for each.
    get MAX_LEVEL(){ return core().MAX_PLOT_LEVEL; },
    get BOUNTY_DEED_CHANCE(){ return core().BOUNTY_DEED_CHANCE; },
    get KILL_DEED_CHANCE(){ return core().KILL_DEED_CHANCE; },
    get WATER_WINDOW_H(){ return core().WATER_WINDOW_H; },
    get WATER_RATE(){ return core().WATER_RATE; },
  };
})();
