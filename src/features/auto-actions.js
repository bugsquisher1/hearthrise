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
    if(!aa.eat){
      aa.eat = Object.assign({}, DEFAULTS.eat);
      // b163: migrate pre-setEat saves. Old auto-eat lived on G.foodSlot +
      // G.autoEatPct (driven by the removed combatTick watchdog). If a save
      // still has that but no unified config, carry it over so those players
      // don't silently lose auto-eat when the watchdog is deleted.
      if(window.G.foodSlot){
        aa.eat.enabled = true;
        aa.eat.foodId  = window.G.foodSlot;
        if(typeof window.G.autoEatPct === 'number') aa.eat.threshold = window.G.autoEatPct;
      }
    }
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

  // ── Food classification ─────────────────────────────────────
  /* b220: auto-eat = HEAL ONLY. The authority is foodClassOf() in
   * src/data/items.js (published on window by main.js); this is a
   * behaviour-identical local fallback for the boot window before the ESM
   * modules land, and for any context that loads this classic script alone.
   * Keep the two in step — the rule is one line and duplicating it here is
   * cheaper than an auto-eat that silently stops working mid-boot. */
  function foodClassOf(it){
    if(typeof window.foodClassOf === 'function') return window.foodClassOf(it);
    if(!it || typeof it !== 'object') return null;
    if(it.foodClass === 'healing' || it.foodClass === 'buff') return it.foodClass;
    return it.heals ? 'healing' : null;
  }
  function isAutoEatable(it){ return foodClassOf(it) === 'healing'; }

  // ── Engine hooks ────────────────────────────────────────────

  /* b134: maybeAutoEat()
   * Called from combat tick + offline-combat catch-up.
   * Eats one food if config is enabled AND HP fraction <= threshold.
   * Returns true if a food was consumed.
   *
   * Food selection priority (b220 — Provisions only):
   *   1. Configured `foodId` if it is a PROVISION (foodClass 'healing') and
   *      the player owns >= 1
   *   2. Otherwise the biggest-healing PROVISION in the bag
   *
   * A Feast or Draught (foodClass 'buff') is never eligible, even when it is
   * the only food you own. Those are timed power items you spend deliberately;
   * auto-eat burning a Void Banquet to soak one wolf hit is the failure this
   * rule exists to prevent, and "you would have died otherwise" does not make
   * it a good trade — the player can still eat it by hand.
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
    // b217: auto-eat is a purchased trait — unbypassable gate. Until bought in
    // the Store, combat healing is manual (the player clicks food). ensureShape()
    // above grandfathers pre-b217 saves that already had auto-eat on.
    if(!(window.G.traits && window.G.traits.auto_eat)) return false;
    var hp = window.G.playerHp, maxHp = window.G.playerMaxHp;
    if(typeof hp !== 'number' || typeof maxHp !== 'number' || maxHp <= 0) return false;
    if(hp <= 0) return false;                    // already dead — respawn handles itself
    if(hp / maxHp > (eat.threshold || 0.5)) return false;
    // Pick food.
    var foodId = eat.foodId;
    var foodItem = foodId && window.ITEMS ? window.ITEMS[foodId] : null;
    var qty = foodId ? ((window.G.inventory && window.G.inventory[foodId]) || 0) : 0;
    if(!isAutoEatable(foodItem) || qty <= 0){
      /* b220: fall back to the biggest-healing PROVISION in the bag.
       *
       * This replaces a "prefer food with no buff, else eat anything that
       * heals" heuristic. That rule was reading the wrong signal: EVERY cooked
       * food carries a buff, so "no buff" meant raw ingredients — auto-eat
       * would pick Raw Shrimp (3 HP) over Cooked Shark (42 HP) and then, once
       * the raws ran out, reach for a Void Banquet. foodClass says what a food
       * is FOR, so the pool is now exactly the Provisions line and the pick
       * inside it is simply the best heal. */
      var inv = window.G.inventory || {};
      var bestId = null, bestHeals = 0;
      for(var id in inv){
        if(!Object.prototype.hasOwnProperty.call(inv, id)) continue;
        if((inv[id] || 0) <= 0) continue;
        var it = window.ITEMS && window.ITEMS[id];
        if(!isAutoEatable(it)) continue;
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
    // b136: real implementation. Called from harvestPlot() AFTER the
    // plot has been emptied. We re-plant the configured cropId if:
    //   1. auto-replant is enabled
    //   2. the cropId is set
    //   3. the player has at least 1 seed of that crop
    //   4. farming level + plot level allow it
    // Anything else is a no-op so we don't surprise the player.
    if(typeof plotIdx !== 'number') return false;
    if(!window.G || !window.G.farmPlots) return false;
    var cfg = ensureShape(); if(!cfg) return false;
    var fr = cfg.farmReplant;
    if(!fr || !fr.enabled || !fr.cropId) return false;
    // The plot must currently be empty — if a regrow already filled it,
    // skip silently so we don't try to plant on top.
    if(window.G.farmPlots[plotIdx]) return false;
    var crops = window.CROPS;
    if(!crops || !crops[fr.cropId]) return false;
    var crop = crops[fr.cropId];
    var seedId = crop.seed;
    var have = (window.G.inventory && window.G.inventory[seedId]) | 0;
    if(have <= 0){
      if(typeof window.notify === 'function') window.notify('🌱 Auto-replant: out of ' + (crop.name||fr.cropId) + ' seeds', 'kill');
      return false;
    }
    if(typeof window.getLevel === 'function' && window.getLevel('farming') < crop.req) return false;
    // Plot level gate. Defer to HearthriseFarm when present.
    if(window.HearthriseFarm && typeof window.HearthriseFarm.canPlantCrop === 'function'
       && !window.HearthriseFarm.canPlantCrop(fr.cropId)){
      return false;
    }
    if(typeof window.plantCrop !== 'function') return false;
    window.plantCrop(plotIdx, fr.cropId);
    return !!window.G.farmPlots[plotIdx]; // true if plantCrop succeeded
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
    // b220: the auto-eat eligibility rule, exposed so UI surfaces that offer
    // a food choice filter to the same pool the engine will actually eat from.
    foodClassOf: foodClassOf,
    isAutoEatable: isAutoEatable,
    // Exposed for tests + future migrations
    _DEFAULTS: DEFAULTS,
    _ensureShape: ensureShape,
  };

  console.log('[auto-actions] API loaded — engine hooks are stubs until b134/b135.');
})();
