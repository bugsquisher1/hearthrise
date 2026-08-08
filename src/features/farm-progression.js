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

  // ══════════════════════════════════════════════════════════
  // b220 — GROWTH MODEL (Backlog #13, docs/design/farming-watering.md)
  //
  // Watering used to be a MANDATORY GATE: startFarmCheck() only flipped a
  // plot to 'ready' when `elapsed >= crop.hours && p.watered`. There was no
  // timeout, so an unwatered plot never matured — not late, *never*. Every
  // auto-replanted plot (plantCrop writes watered:false) and every Tomato
  // regrow stalled forever, and renderFarm hid the failure by printing
  // "Tap to water" instead of a percentage.
  //
  // The model now: a crop ALWAYS grows. Watering opens a 2-hour window in
  // which it grows twice as fast. Growth is purely DERIVED from timestamps
  // — plantedAt plus a list of watering timestamps — so there is no stored
  // counter to desync, offline catch-up is free, and the same numbers can
  // later be re-derived server-side.
  //
  //   growth-hours = elapsed + min(waterBonus, elapsed)
  //
  // The min() is the load-bearing invariant: whatever lands in `waterings`
  // (corruption, a forged save, a duplicated timestamp), effective growth
  // can never exceed 2× real elapsed time.
  //
  // Balance constants are the Game Designer's (spec §10) — change them
  // there, not here.
  // ══════════════════════════════════════════════════════════
  var WATER_WINDOW_H  = 2;    // hours a single watering stays active
  var WATER_RATE      = 2.0;  // growth-hours per real hour while watered
  var WATER_WINDOW_MS = WATER_WINDOW_H * 3600000;
  var MAX_WATERINGS   = 8;    // defensive array cap (floor(hours/4) <= 5 today)

  function nowMs(){ return Date.now(); }

  function cropOf(plot){
    if(!plot || !plot.cropId) return null;
    var C = window.CROPS;
    return (C && C[plot.cropId]) || null;
  }

  // Defensive, idempotent shape repair. save-migrations.js does this once at
  // load for persisted saves; this covers cloud saves, other characters, and
  // any plot that reaches us without passing through the migration.
  function normalizePlot(plot){
    if(!plot || typeof plot !== 'object') return plot;
    if(typeof plot.plantedAt !== 'number' || !isFinite(plot.plantedAt)){
      plot.plantedAt = nowMs();
      plot.waterings = [];
      return plot;
    }
    if(!Array.isArray(plot.waterings)){
      // Legacy shape: a boolean flag. `true` retro-credits one window from
      // planting (strictly better for the player); `false` becomes "dry",
      // which un-sticks the plot instead of stalling it forever.
      plot.waterings = plot.watered ? [plot.plantedAt] : [];
    }
    if(plot.waterings.length > MAX_WATERINGS){
      plot.waterings = plot.waterings.slice(-MAX_WATERINGS);
    }
    return plot;
  }

  // THE single source of truth for farm growth. Tick, offline catch-up,
  // progress bar and ready-check all read this one function.
  function growthHours(plot, now){
    if(!plot) return 0;
    normalizePlot(plot);
    now = (typeof now === 'number' && isFinite(now)) ? now : nowMs();
    var elapsed = (now - plot.plantedAt) / 3600000;
    if(!(elapsed > 0)) return 0;               // guard: future/equal plantedAt
    var bonus = 0;
    var ws = plot.waterings;
    for(var i = 0; i < ws.length; i++){
      var ts = Number(ws[i]);
      if(!isFinite(ts) || ts > now) continue;  // guard: future timestamp
      var start = Math.max(ts, plot.plantedAt);
      var end   = Math.min(ts + WATER_WINDOW_MS, now);
      if(end > start) bonus += (end - start) / 3600000 * (WATER_RATE - 1);
    }
    return elapsed + Math.min(bonus, elapsed); // HARD INVARIANT: never > 2×
  }

  function cropHours(plot){
    var c = cropOf(plot);
    return (c && c.hours > 0) ? c.hours : 0;
  }

  function isReady(plot){
    var h = cropHours(plot);
    if(!h) return false;                       // unknown crop — never auto-ready
    return growthHours(plot) >= h;
  }

  function progressPct(plot){
    var h = cropHours(plot);
    if(!h) return 0;
    return Math.min(100, Math.floor(growthHours(plot) / h * 100));
  }

  function lastWatering(plot){
    if(!plot) return 0;
    normalizePlot(plot);
    var ws = plot.waterings, best = 0;
    for(var i = 0; i < ws.length; i++){
      var ts = Number(ws[i]);
      if(isFinite(ts) && ts > best) best = ts;
    }
    return best;
  }

  // Remaining ms of the active watered window (0 = dry).
  function waterWindowRemainingMs(plot){
    if(!plot) return 0;
    var end = lastWatering(plot) + WATER_WINDOW_MS;
    return Math.max(0, end - nowMs());
  }

  // ms until this plot can be watered again (0 = right now).
  function nextWaterableInMs(plot){
    if(!plot) return 0;
    return waterWindowRemainingMs(plot);
  }

  // A plot is waterable only when the previous window has closed. This is the
  // whole anti-abuse mechanism AND the affordance ("this plot is thirsty").
  function isWaterable(plot){
    if(!plot || !cropHours(plot)) return false;
    if(plot.state === 'ready' || isReady(plot)) return false;
    return waterWindowRemainingMs(plot) <= 0;
  }

  // Projected wall-clock ms until ready: the rest of the current window runs
  // at 2×, everything after it at 1×.
  function readyInMs(plot){
    var h = cropHours(plot);
    if(!h) return 0;
    var remain = h - growthHours(plot);
    if(remain <= 0) return 0;
    var windowMs = waterWindowRemainingMs(plot);
    var windowGrowth = windowMs / 3600000 * WATER_RATE;
    if(windowGrowth >= remain) return Math.round(remain / WATER_RATE * 3600000);
    return Math.round(windowMs + (remain - windowGrowth) * 3600000);
  }

  function readyAtMs(plot){ return nowMs() + readyInMs(plot); }

  // floor(hours / 4) — the windows must fit inside the shortened grow time,
  // which is why the mechanic self-caps at −50% with no separate cap table.
  function maxWaterings(cropId){
    var C = window.CROPS;
    var c = C && C[cropId];
    if(!c || !(c.hours > 0)) return 0;
    return Math.floor(c.hours / (WATER_WINDOW_H * WATER_RATE));
  }

  // XP for a watering: a tenth-ish of the skill's throughput, bounded to once
  // per plot per window so it can never be farmed.
  function waterXp(plot){
    var c = cropOf(plot);
    return Math.max(1, Math.ceil(((c && c.xp) || 4) / 4));
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
    // Constants — exposed for tests + UI.
    MAX_LEVEL: MAX_LEVEL,
    BOUNTY_DEED_CHANCE: BOUNTY_DEED_CHANCE,
    KILL_DEED_CHANCE: KILL_DEED_CHANCE,
    WATER_WINDOW_H: WATER_WINDOW_H,
    WATER_RATE: WATER_RATE,
  };

  console.log('[farm-progression] HearthriseFarm API loaded — plot Lv', getPlotLevel(), '/', MAX_LEVEL);
})();
