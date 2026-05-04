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
  // b133 stubs. b134 fills these in.
  function maybeAutoEat(){
    // Real implementation lands in b134.
    return false;
  }
  function maybeStopTraining(){
    // Real implementation lands in b134.
    return false;
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
