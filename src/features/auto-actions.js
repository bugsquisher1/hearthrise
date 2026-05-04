// ============================================================
// src/features/auto-actions.js
//
// Centralised "do this automatically" config + helpers.
// Used by:
//   - Batch B (b134): auto-eat at HP threshold, train-to-level auto-stop
//   - Batch C (b135): farm auto-replant
//
// Shape (lives on G.autoActions, persisted by saveLocal()):
//   {
//     eat:          { enabled, threshold, foodId },
//     trainGoal:    { enabled, skillId, targetLevel },
//     farmReplant:  { enabled, cropId },
//   }
//
// Why a single source of truth: in past iterations we scattered
// "do this auto" toggles across a dozen UI handlers, then forgot
// which one was authoritative when fixing a bug. One object, one
// API, one place to debug.
//
// Public API (window.HearthriseAuto):
//   getEat()         → {enabled, threshold, foodId}
//   setEat(opts)     → merges opts into the current config
//   getTrainGoal()   → {enabled, skillId, targetLevel}
//   setTrainGoal(opts)
//   getFarmReplant() → {enabled, cropId}
//   setFarmReplant(opts)
//   reset()          → clear all auto-actions (for testing / settings reset)
//
// Engine hooks (called by combat/skill/farm logic, NOT by UI):
//   maybeAutoEat()      — called on every combat tick at low HP. Returns true if a food was eaten.
//   maybeStopTraining() — called on every skill XP gain. Returns true if goal reached + skill stopped.
//   maybeReplant(idx)   — called after harvestPlot. Returns true if replanted.
//
// All engine hooks are no-ops in b133 — they're stubs that return
// false. b134 + b135 fill them in. This way Batch B/C can land
// without re-wiring callers.
//
// b133 — Batch A foundations.
// ============================================================

(function(){
  'use strict';

  // ── Defaults ────────────────────────────────────────────────
  // Anything missing from a save defaults to "disabled" — never
  // accidentally start auto-eating someone's food.
  var DEFAULTS = {
    eat:         { enabled: false, threshold: 0.5, foodId: null },
    trainGoal:   { enabled: false, skillId: null, targetLevel: null },
    farmReplant: { enabled: false, cropId: null },
  };

  function ensureShape(){
    if(!window.G) return null;
    if(!window.G.autoActions) window.G.autoActions = {};
    var aa = window.G.autoActions;
    // Fill missing branches with their defaults — never overwrite
    // user-set values.
    if(!aa.eat)         aa.eat         = Object.assign({}, DEFAULTS.eat);
    if(!aa.trainGoal)   aa.trainGoal   = Object.assign({}, DEFAULTS.trainGoal);
    if(!aa.farmReplant) aa.farmReplant = Object.assign({}, DEFAULTS.farmReplant);
    return aa;
  }

  // ── Getters / setters ───────────────────────────────────────
  function getEat(){ var a = ensureShape(); return a ? a.eat : Object.assign({}, DEFAULTS.eat); }
  function setEat(opts){
    var a = ensureShape(); if(!a) return;
    if(opts && typeof opts === 'object') Object.assign(a.eat, opts);
    persist();
  }

  function getTrainGoal(){ var a = ensureShape(); return a ? a.trainGoal : Object.assign({}, DEFAULTS.trainGoal); }
  function setTrainGoal(opts){
    var a = ensureShape(); if(!a) return;
    if(opts && typeof opts === 'object') Object.assign(a.trainGoal, opts);
    persist();
  }

  function getFarmReplant(){ var a = ensureShape(); return a ? a.farmReplant : Object.assign({}, DEFAULTS.farmReplant); }
  function setFarmReplant(opts){
    var a = ensureShape(); if(!a) return;
    if(opts && typeof opts === 'object') Object.assign(a.farmReplant, opts);
    persist();
  }

  function reset(){
    var a = ensureShape(); if(!a) return;
    a.eat         = Object.assign({}, DEFAULTS.eat);
    a.trainGoal   = Object.assign({}, DEFAULTS.trainGoal);
    a.farmReplant = Object.assign({}, DEFAULTS.farmReplant);
    persist();
  }

  // Debounced saveLocal — setEat() etc are cheap; we don't want
  // every keystroke in a settings input to write to localStorage.
  var saveTimer = null;
  function persist(){
    if(saveTimer) return;
    saveTimer = setTimeout(function(){
      saveTimer = null;
      try { if(typeof window.saveLocal === 'function') window.saveLocal(); } catch(e){}
    }, 250);
  }

  // ── Engine hooks ────────────────────────────────────────────

  /* b134: maybeAutoEat()
   * Called from combat tick + offline-combat catch-up.
   * Eats one food if config is enabled AND HP fraction <= threshold.
   * Returns true if a food was consumed.
   *
   * Food selection priority:
   *   1. Configured `foodId` if it exists, has `heals`, and player owns >= 1
   *   2. Otherwise the "best food in bag" (item with highest `heals`)
   *
   * Side effects:
   *   - Heals G.playerHp (capped at G.playerMaxHp)
   *   - Decrements inventory via removeItem()
   *   - Increments G.stats.buffsConsumed
   *   - Pushes a line to G.combatLog if it exists (so the player sees it)
   */
  function maybeAutoEat(){
    if(!window.G) return false;
    var cfg = ensureShape(); if(!cfg) return false;
    var eat = cfg.eat;
    if(!eat || !eat.enabled) return false;
    var hp = window.G.playerHp, maxHp = window.G.playerMaxHp;
    if(typeof hp !== 'number' || typeof maxHp !== 'number' || maxHp <= 0) return false;
    if(hp <= 0) return false;                    // already dead — respawn handles itself
    if(hp / maxHp > (eat.threshold || 0.5)) return false;
    // Pick food.
    var foodId = eat.foodId;
    var foodItem = foodId && window.ITEMS ? window.ITEMS[foodId] : null;
    var qty = foodId ? ((window.G.inventory && window.G.inventory[foodId]) || 0) : 0;
    if(!foodItem || !foodItem.heals || qty <= 0){
      // Fall back to best food in bag.
      var inv = window.G.inventory || {};
      var bestId = null, bestHeals = 0;
      for(var id in inv){
        if(!Object.prototype.hasOwnProperty.call(inv, id)) continue;
        if((inv[id] || 0) <= 0) continue;
        var it = window.ITEMS && window.ITEMS[id];
        if(!it || !it.heals) continue;
        if(it.heals > bestHeals){ bestId = id; bestHeals = it.heals; }
      }
      if(!bestId) return false;
      foodId = bestId; foodItem = window.ITEMS[foodId];
    }
    // Consume.
    var heals = foodItem.heals;
    window.G.playerHp = Math.min(maxHp, hp + heals);
    if(typeof window.removeItem === 'function'){
      window.removeItem(foodId, 1);
    } else if(window.G.inventory){
      window.G.inventory[foodId] = (window.G.inventory[foodId] || 1) - 1;
      if(window.G.inventory[foodId] <= 0) delete window.G.inventory[foodId];
    }
    window.G.stats = window.G.stats || {};
    window.G.stats.buffsConsumed = (window.G.stats.buffsConsumed || 0) + 1;
    if(Array.isArray(window.G.combatLog)){
      window.G.combatLog.push('🍖 Auto-ate ' + (foodItem.n || foodId) + ' (+' + heals + ' HP)');
    }
    return true;
  }

  /* b134: maybeStopTraining()
   * Called from addXp() right after a level-up.
   * Stops the active skill when it reaches the configured target level.
   * Returns true if the skill was stopped this call.
   *
   * Behaviour:
   *   - Only fires when the active skill matches the configured skillId
   *     (so "train Mining to 30" doesn't stop while you're chopping wood)
   *   - Self-disables after firing (`enabled = false`) so the player
   *     doesn't get stuck if they re-start the same skill later
   */
  function maybeStopTraining(){
    if(!window.G) return false;
    var cfg = ensureShape(); if(!cfg) return false;
    var g = cfg.trainGoal;
    if(!g || !g.enabled || !g.skillId || !g.targetLevel) return false;
    if(window.G.activeSkill !== g.skillId) return false;
    var xp = (window.G.skills && window.G.skills[g.skillId]) || 0;
    var lv = (typeof window.levelFromXp === 'function') ? window.levelFromXp(xp) : 1;
    if(lv < g.targetLevel) return false;
    // Goal met. Stop + notify + self-disable.
    if(typeof window.stopSkill === 'function') window.stopSkill();
    if(typeof window.notify === 'function'){
      var skName = (window.SKILLS_DEF && window.SKILLS_DEF[g.skillId] && window.SKILLS_DEF[g.skillId].name) || g.skillId;
      window.notify('🎯 ' + skName + ' Lv ' + g.targetLevel + ' reached — auto-stopped', 'levelup');
    }
    cfg.trainGoal.enabled = false;
    persist();
    return true;
  }

  function maybeReplant(plotIdx){
    // Real implementation lands in b135.
    return false;
  }

  // ── Public API ──────────────────────────────────────────────
  window.HearthriseAuto = {
    getEat: getEat,
    setEat: setEat,
    getTrainGoal: getTrainGoal,
    setTrainGoal: setTrainGoal,
    getFarmReplant: getFarmReplant,
    setFarmReplant: setFarmReplant,
    reset: reset,
    maybeAutoEat: maybeAutoEat,
    maybeStopTraining: maybeStopTraining,
    maybeReplant: maybeReplant,
    // Exposed for tests + future migrations
    _DEFAULTS: DEFAULTS,
    _ensureShape: ensureShape,
  };

  console.log('[auto-actions] API loaded — engine hooks are stubs until b134/b135.');
})();
