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

  /* The core is published by src/core-bridge.js, a MODULE — so it lands
     after this classic script has parsed but well before anything here is
     called (legacy.js boots on DOMContentLoaded). Resolved per call rather
     than captured, so there is no load-order hazard to get wrong. */
  function core(){ return window.HearthriseCore && window.HearthriseCore.farm; }
  function rng(){ return window.HearthriseCore && window.HearthriseCore.rng; }
  function crops(){ return window.CROPS || {}; }
  function nowMs(){ return Date.now(); }

  var MAX_LEVEL = 5;   // mirrors core.MAX_PLOT_LEVEL; asserted by the drift guard

  function getPlotLevel(){
    if(!window.G) return 1;
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

  function getPlotUnlockedCrops(){ return core().unlockedCrops(getPlotLevel()); }
  function canPlantCrop(cropId){ return core().canPlantCrop(getPlotLevel(), cropId); }
  function getDeedsRequiredForNextLevel(){ return core().deedsForNextLevel(getPlotLevel()); }

  /* ── b510 — THE PLOT TIER IS A PRICE, NOT A LOTTERY ─────────────────────────
     Measured 2026-09-06: farm plants across the whole player base fell to ZERO
     for nine straight days because the ONLY way off plot tier 1 was a 0.1%-drop
     Farmer's Deed, and turnip is the only tier-1 crop. The tier is now bought
     with GOLD behind a FARMING LEVEL (deeds are the fallback payment), priced
     server-side in hr_plot_tier and MIRRORED here for the card and the
     pre-flight. src/core/farm.js PLOT_TIER_PRICES is the one authored copy on
     this side and tests/plot-tier-parity.mjs proves it equals the server's. */
  function getFarmingLevel(){
    try { if(typeof window.getLevel === 'function') return window.getLevel('farming') | 0 || 1; } catch(e){}
    return 1;
  }
  function getGold(){
    var n = window.G ? Number(window.G.gold) : 0;
    return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
  }
  /** {level, gold, deeds, farming} for the next tier, or null at max. */
  function getUpgradePrice(){ return core().plotUpgradePrice(getPlotLevel()); }
  /** The whole answer the card renders and upgradePlot() acts on. */
  function getUpgradeCheck(){
    return core().plotUpgradeCheck({
      plotLevel: getPlotLevel(),
      farmingLevel: getFarmingLevel(),
      gold: getGold(),
      deeds: getDeedCount(),
    });
  }
  function fmtN(n){ try { return Number(n).toLocaleString('en-US'); } catch(e){ return String(n); } }
  /** THE HONEST REFUSAL — names the real price AND what the player has, because
      "you can't do that" is the copy that generates a bug report. */
  function refusalText(v){
    var p = v && v.price;
    if(!p) return 'Farm Plot already maxed';
    if(v.error === 'farm_level_too_low'){
      return 'Farm Plot Lv ' + p.level + ' needs Farming ' + p.farming + ' (you are ' + v.have + ')';
    }
    return 'Farm Plot Lv ' + p.level + ' costs ' + fmtN(p.gold) + ' gold or ' + p.deeds
      + " Farmer's Deed" + (p.deeds === 1 ? '' : 's') + ' — you have ' + fmtN(v.gold) + ' gold and '
      + v.deeds + ' deed' + (v.deeds === 1 ? '' : 's');
  }

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
    var v = getUpgradeCheck();
    if(!v.ok){
      if(typeof window.notify === 'function'){
        window.notify(v.error === 'max_plot_level' ? 'Farm Plot already maxed' : refusalText(v), 'kill');
      }
      return false;
    }
    var price = v.price;
    // Server-authority routing: the server owns the price, the debit and the
    // plot_level column. Send the intent and reconcile G from the RESPONSE
    // (the server's own numbers, once) — no local mutation. The check above is
    // a PRE-FLIGHT for the copy, never the decision.
    if(farmSyncArmed()){
      var FS = window.HearthriseFarmSync;
      var deps = {
        addItem: function(id,q){ if(typeof window.addItem==='function') window.addItem(id,q); },
        removeItem: function(id,q){ if(typeof window.removeItem==='function') window.removeItem(id,q); },
        addXp: function(sk,x){ if(typeof window.addXp==='function') window.addXp(sk,x); },
        setGold: function(n){ if(window.G) window.G.gold = n; },
      };
      FS.farmUpgradePlot().then(function(res){
        if(res && res.ok){ try{ FS.reconcileFarmResult(window.G,'upgrade',res,deps); }catch(e){}
          if(typeof window.notify === 'function'){
            window.notify('Farm Plot upgraded to Lv ' + res.plot_level
              + (res.paid_with === 'deeds'
                  ? ' — paid with ' + res.deeds_spent + " Farmer's Deed" + (res.deeds_spent===1?'':'s')
                  : ' — ' + fmtN(res.gold_spent || 0) + ' gold'), 'levelup');
          }
        } else if(res && res.error && res.error!=='transport'){
          if(typeof window.notify === 'function'){
            /* The server is the price. Speak ITS refusal, not the client's guess. */
            var msg = 'Could not upgrade plot — try again';
            if(res.error === 'farm_level_too_low') msg = 'Farm Plot Lv ' + res.plot_level + ' needs Farming ' + res.need + ' (you are ' + res.have + ')';
            else if(res.error === 'cannot_afford') msg = 'Farm Plot Lv ' + res.plot_level + ' costs ' + fmtN(res.need_gold) + ' gold or ' + res.need_deeds + " Farmer's Deed" + (res.need_deeds===1?'':'s') + ' — you have ' + fmtN(res.have_gold) + ' gold and ' + res.have_deeds;
            else if(res.error === 'max_plot_level') msg = 'Farm Plot already maxed';
            window.notify(msg, 'kill');
          }
        }
        try { if(typeof window.renderHouse === 'function') window.renderHouse(); } catch(e){}
        try { if(typeof window.renderFarm === 'function') window.renderFarm(); } catch(e){}
        try { if(typeof window.renderInventory === 'function') window.renderInventory(); } catch(e){}
        try { if(typeof window.updateTopbar === 'function') window.updateTopbar(); } catch(e){}
      });
      return true;
    }
    /* CLIENT-AUTHORED FALLBACK (farm arm off — tests and the pre-arm client).
       Gold is a RECORD field: if the client may not write it and the server is
       not taking the gesture either, fail CLOSED rather than mint a tier the
       realm never recorded. */
    if(v.pay === 'gold' && typeof window.clientMayWriteRecordField === 'function'
       && !window.clientMayWriteRecordField('gold')){
      if(typeof window.notify === 'function') window.notify('That upgrade is unavailable right now','kill');
      return false;
    }
    if(v.pay === 'deeds'){
      if(typeof window.removeItem === 'function') window.removeItem('farm_deed', price.deeds);
      else window.G.inventory.farm_deed = Math.max(0, getDeedCount() - price.deeds);
    } else {
      window.G.gold = getGold() - price.gold;
    }
    window.G.plotLevels = price.level;
    if(typeof window.notify === 'function'){
      window.notify('Farm Plot upgraded to Lv ' + price.level
        + (v.pay === 'deeds' ? ' — paid with ' + price.deeds + " Farmer's Deed" + (price.deeds===1?'':'s')
                             : ' — ' + fmtN(price.gold) + ' gold'), 'levelup');
    }
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
    getPlotUnlockedCrops: getPlotUnlockedCrops,
    canPlantCrop: canPlantCrop,
    getDeedsRequiredForNextLevel: getDeedsRequiredForNextLevel,
    getDeedCount: getDeedCount,
    getUpgradePrice: getUpgradePrice,
    getUpgradeCheck: getUpgradeCheck,
    getFarmingLevel: getFarmingLevel,
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
