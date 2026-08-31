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
    // `pctSynced` — b329: a branch built from these defaults was never subject
    // to the dead-slider bug, so it must not re-adopt the legacy mirror.
    eat:         { enabled: false, threshold: 0.5, foodId: null, pctSynced: true },
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
      //
      // ⚠ b495 — A FRESH CHARACTER NOW TAKES THIS BRANCH TOO, and that is the
      //   intended outcome rather than a mis-migration. The starting kit points
      //   G.foodSlot at Cooked Shrimp (src/data/start-kit.js, the food-bridge
      //   ruling) so the away preview can price the food a new player is
      //   actually carrying; the side effect is that `eat.enabled` starts true.
      //   It is SAFE and it is WANTED:
      //     · safe    — `owned` in maybeAutoEat() is an unbypassable trait gate
      //                 (autoEatTier(G.traits) > 0), so nothing is eaten until
      //                 Auto-Eat is owned. DEFAULTS.eat.enabled stays false, so
      //                 a save with NO foodSlot is still opt-in and the "never
      //                 accidentally start auto-eating someone's food" rule
      //                 holds for every character that has cleared their slot.
      //     · wanted  — buying Auto-Eat used to do nothing until the player
      //                 ALSO found the settings toggle and nominated a food.
      //                 The trait now works the moment it is bought, which is
      //                 what its own store copy promises.
      //   If the b163 half is ever retired, do NOT delete the branch: re-home
      //   this default into the fresh-`G` literal first.
      if(window.G.foodSlot){
        aa.eat.enabled = true;
        aa.eat.foodId  = window.G.foodSlot;
        if(typeof window.G.autoEatPct === 'number') aa.eat.threshold = window.G.autoEatPct;
      }
    } else if(!aa.eat.pctSynced){
      /* b329 (Xarn): the ONE-TIME reconciliation for saves written while the
       * Settings slider was a dead end. Up to b328 that slider wrote only
       * `G.autoEatPct`, which nothing read — so a divergence between the two
       * numbers can mean exactly one thing: the player moved the slider and
       * the engine never heard about it. The mirror is the only surviving
       * record of what they actually chose, so it wins — ONCE.
       *
       * The `pctSynced` marker is what keeps this a MIGRATION rather than a
       * rule. Without it, "the mirror wins on divergence" quietly reinstates
       * `G.autoEatPct` as a permanent second writer that overrides the engine
       * on every read — which is the exact shape of the bug being fixed, and
       * it masked a missing write-through when I reverted one to check the
       * test had teeth. It rides inside `autoActions` (no `_` prefix), so it
       * persists to the cloud and the adoption cannot repeat after a restore. */
      if(typeof window.G.autoEatPct === 'number' && isFinite(window.G.autoEatPct)){
        aa.eat.threshold = Math.max(0, Math.min(1, window.G.autoEatPct));
      }
      aa.eat.pctSynced = true;
    }
    if(!aa.trainGoal)   aa.trainGoal   = Object.assign({}, DEFAULTS.trainGoal);
    if(!aa.farmReplant) aa.farmReplant = Object.assign({}, DEFAULTS.farmReplant);
    return aa;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     THE SETTINGS SYNC — `hr_set_auto_eat`, DEBOUNCED.   (b499)

     ── THE DEFECT ────────────────────────────────────────────────────────────
     `hr_set_auto_eat` (supabase/migrations/2026-08-15-auto-eat.sql, restated by
     2026-08-29-auto-eat-tiers.sql) is the ONLY writer of
     player_state.auto_eat_enabled / auto_eat_food / auto_eat_pct — and it had
     ZERO client call sites. So `auto_eat_food` was NULL for every character and
     the accrual engine's `chooseFood(null, …)` fell back to `bestHealingFood`,
     the BIGGEST healer in the bag, while THIS file honoured the player's own
     nomination. The unit COUNTS still converged (the pending-consume hold drains
     on the server's own movement — see src/net/accrue.js), so nothing was lost
     or duplicated, but the two sides drained DIFFERENT STACKS and the server's
     pick was the more valuable one. The threshold and the ON/OFF toggle were
     unsynced for the same reason, so a player who switched auto-eat OFF was
     still eaten for overnight.

     ── WHY IT HANGS OFF setEat() ─────────────────────────────────────────────
     setEat is this file's declared ONE WRITER of the eat config, and every
     player-facing control routes through it: the Settings toggle and threshold
     slider (src/settings-page.js), the combat food picker and the inventory food
     tap (legacy.js setAutoEatFood / setCombatAutoEat), the loadout apply, and
     buyTrait's switch-on. One hook, every gesture — and nothing on the LOAD path
     calls setEat, so a boot never syncs.

     ── ONLY WHAT THE PLAYER EXPRESSED ────────────────────────────────────────
     Every argument of the RPC is THREE-VALUED: null means "leave this column
     alone". So the pending set records WHICH KEYS the player touched, and the
     flush reads the current value for exactly those. A player who has never
     picked a food never sends one, and `auto_eat_food` stays NULL server-side —
     the NULL-fallback policy is the Designer's and must not be invented here by
     helpfully pushing up a default. An EXPLICIT clear (the picker's Off option)
     is a real gesture and goes out as `p_clear_food:true`, which is the only way
     to say "back to best in the bag" when NULL already means unchanged.

     ── WHY THE DEBOUNCE IS NOT OPTIONAL ──────────────────────────────────────
     The verb bumps player_state.version and writes ONE player_ledger row PER
     CALL, and is rate-gated at 30/hour with a rejected call still consuming
     budget. The threshold control is a SLIDER: one drag fires `change` once, but
     a keyboard arrow-storm or a re-render fires many, and each unsynced call
     would be a wasted version bump against an in-flight accrual. So the flush
     waits for a quiet window AND dedupes against what the server has already
     PROJECTED (accrue.js serverAutoEatSettings, read off every envelope's
     `state.auto_eat_*`): a change that lands back on the server's own value
     sends nothing at all.

     ── THE THRESHOLD SENT IS THE EFFECTIVE ONE ───────────────────────────────
     `eatThreshold()`, not the raw stored preference. The client clamps on READ
     and the server clamps on WRITE, so sending the raw value would leave a
     tier-I owner's stored 25 permanently disagreeing with their local 50 and the
     dedupe would re-send forever. Both sides land on the same effective number,
     which is the property the away/live parity guard needs.

     ── REFUSALS ──────────────────────────────────────────────────────────────
     `collect_first` (an unpaid window — these three columns PRICE an absence) is
     RETRIED, not dropped: the transport already settles-then-retries three times
     over ~19 s, and if the window is STILL open the keys are re-queued for
     another quiet period. Everything else is logged and left DIRTY — the keys
     are not marked sent, so the player's next change re-sends them. Nothing here
     is surfaced to the player: this is a preference sync, it destroys nothing,
     and a toast per background refusal would be noise. */
  /* ⚠ THE ON/OFF TOGGLE IS **DORMANT** AND THAT IS A DESIGN DECISION, NOT AN
     OVERSIGHT.  (.claude/coordination/CONFLICTS.md, 2026-08-30, SYSTEMS →
     LANE A / SECURITY, the section headed "THE REAL DEFECT b497 INTRODUCES".)

     Syncing the FOOD and the THRESHOLD only ever makes the server honour a
     choice the UI already claims it honours — the reported defect, and an
     unambiguous win. Syncing `enabled:false` is DIFFERENT: `auto_eat_enabled`
     is the flag the accrual engine's `fx.autoEat()` is gated on, and with it
     off a measured 12-hour night pays 0 kills and dies at the first fight
     (tests/accrual-engine.mjs `attendedSettleAutoEatGuard`, and the 63–99%
     figures in src/core/auto-eat.js's header). So pushing the toggle up turns a
     client-side preference into a total loss of overnight progress, and the
     open question — "may a player switch off a mechanic their payout depends
     on, and what should the game say when they do?" — is the DESIGNER'S, and is
     recorded as theirs. Systems owns the wiring; Systems does not get to answer
     it by shipping.

     So the mechanism is built, tested in BOTH positions, and arming it is this
     one line. ⚠ NOTE FOR WHOEVER FLIPS IT: dragging the threshold slider to 0%
     already reproduces the same outcome through the `pct` key, so the ruling
     needs to cover the dial as well as the switch — arming this without that is
     half a decision. */
  var SYNC_ENABLED_TOGGLE = false;
  var SYNC_QUIET_MS = 1500;
  var SYNC_RETRY_MS = 20000;      // after a still-unpaid window
  var _syncPending = null;        // {enabled?:true, food?:true, pct?:true}
  var _syncTimer = null;
  var _syncInFlight = false;
  /* ⚠ PARKED FOR THE SUITE, the same way runSmokeTest parks the 90 s settle loop
     and the autosave. Thirty-odd tests drive setEat() (and applyLoadout, whose
     fixture kit carries `foodSlot: null`), so an unparked sync would push a
     TEST's food choice — including an explicit CLEAR — to the live server on
     Tyler's own account, mid-run, and the player would come back to auto-eat
     pointing at nothing. The AUTOEAT-SYNC tests unpark inside their own bodies,
     exactly as SETTLE-5/6 drive the settle loop themselves, so parking hides
     nothing. Default OFF: production never touches this. */
  var _syncParked = false;

  /* What the SERVER already believes, as last projected. A field is `undefined`
     when no envelope has carried it — treated as "unknown, so send", never as a
     stored NULL. */
  function serverBelief(){
    try {
      var A = window.HearthriseAccrual;
      if(A && typeof A.serverAutoEatSettings === 'function') return A.serverAutoEatSettings() || {};
    } catch(e){}
    return {};
  }
  function effectivePct(){
    var A = core();
    var t = eatThreshold();
    if(A && typeof A.pctFromThreshold === 'function') return A.pctFromThreshold(t);
    return Math.max(0, Math.min(100, Math.round(t * 100)));
  }

  /* Record which keys the player just expressed, and (re)arm the quiet window.
     Called ONLY from setEat — a value this file computes for itself is not a
     gesture and must not be pushed to the server. */
  function queueServerSync(opts){
    if(_syncParked) return;
    if(!opts || typeof opts !== 'object') return;
    var want = _syncPending || {};
    if(Object.prototype.hasOwnProperty.call(opts, 'enabled')) want.enabled = true;
    if(Object.prototype.hasOwnProperty.call(opts, 'foodId'))  want.food    = true;
    if(typeof opts.threshold === 'number' && isFinite(opts.threshold)) want.pct = true;
    if(!want.enabled && !want.food && !want.pct) return;
    _syncPending = want;
    if(_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(flushServerSync, SYNC_QUIET_MS);
  }

  function flushServerSync(){
    _syncTimer = null;
    if(_syncParked) { _syncPending = null; return; }
    var pending = _syncPending;
    if(!pending) return;
    if(_syncInFlight){                       // one call at a time; re-arm behind it
      _syncTimer = setTimeout(flushServerSync, SYNC_QUIET_MS);
      return;
    }
    var GC = window.HearthriseGoalClaim;
    if(!GC || typeof GC.setAutoEat !== 'function') return;               // stay dirty
    if(typeof GC.isSignedIn === 'function' && !GC.isSignedIn()) return;  // stay dirty

    var a = ensureShape();
    if(!a || !a.eat) return;
    var have = serverBelief();
    var patch = {}, sending = {};

    if(pending.enabled && SYNC_ENABLED_TOGGLE){
      var en = !!a.eat.enabled;
      if(have.enabled !== en){ patch.enabled = en; sending.enabled = true; }
    }
    if(pending.pct){
      var pc = effectivePct();
      if(have.pct !== pc){ patch.pct = pc; sending.pct = true; }
    }
    if(pending.food){
      var fid = (typeof a.eat.foodId === 'string' && a.eat.foodId) ? a.eat.foodId : null;
      if(have.food !== fid){
        if(fid) patch.food = fid; else patch.clearFood = true;
        sending.food = true;
      }
    }

    /* Everything the player touched already matches the server. Clear the
       pending set and send NOTHING — this is the branch that keeps a settings
       panel that is merely opened, and a suite that restores what it changed,
       off the 30/hour budget entirely. */
    if(!sending.enabled && !sending.pct && !sending.food){ _syncPending = null; return; }

    _syncPending = null;
    _syncInFlight = true;
    Promise.resolve().then(function(){ return GC.setAutoEat(patch); }).then(function(res){
      _syncInFlight = false;
      if(res && res.ok) return;
      var why = (res && res.error) || 'network';
      /* THE WINDOW IS STILL UNPAID (or the bucket is full). The transport already
         settled + retried three times; give the settle loop a full cycle and try
         again rather than dropping the player's choice on the floor. */
      if(why === 'collect_first' || why === 'rate_limited'){
        var again = _syncPending || {};
        if(sending.enabled) again.enabled = true;
        if(sending.pct)     again.pct     = true;
        if(sending.food)    again.food    = true;
        _syncPending = again;
        if(_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(flushServerSync, SYNC_RETRY_MS);
        return;
      }
      try { console.warn('[auto-eat] settings sync refused:', why); } catch(e){}
    }).catch(function(e){
      _syncInFlight = false;
      try { console.warn('[auto-eat] settings sync threw:', e && e.message); } catch(_){}
    });
  }

  // ── Getters / setters ───────────────────────────────────────
  function getEat(){ var a = ensureShape(); return a ? a.eat : Object.assign({}, DEFAULTS.eat); }
  function setEat(opts){
    var a = ensureShape(); if(!a) return;
    if(opts && typeof opts === 'object') Object.assign(a.eat, opts);
    /* b329: clamp here and mirror to `G.autoEatPct` in the SAME breath.
     *
     * The mirror is still read by the bare-script fallback in legacy.js
     * `fx.autoEat` (the path taken before HearthriseAuto loads), and it is the
     * signal ensureShape() uses to detect a pre-b329 save whose slider never
     * reached the engine. Writing it here is what makes that detection a
     * ONE-TIME adoption instead of a permanent second writer.
     *
     * Deliberately NOT via eatThreshold(): that re-enters ensureShape(), whose
     * adoption branch would read the still-stale mirror and claw back the value
     * we are in the middle of setting. (It did exactly that — caught by the
     * b133 round-trip guard.) */
    if(opts && typeof opts.threshold === 'number' && isFinite(opts.threshold)){
      a.eat.threshold = Math.max(0, Math.min(1, opts.threshold));
      if(window.G) window.G.autoEatPct = a.eat.threshold;
    }
    persist();
    /* b499 — AND TELL THE SERVER. Debounced + deduped; see the block above.
       LAST, after the local write, so the flush reads the settled value. */
    queueServerSync(opts);
  }

  /* b326: the ONE reader of the effective auto-eat trigger point.
   *
   * Two bugs lived in the old inline `eat.threshold || 0.5`:
   *   1. it is a falsy-coalesce on a NUMBER, so a deliberate 0% ("never
   *      auto-eat") silently became 50%;
   *   2. every surface that wanted to *display* the threshold re-implemented
   *      the same expression, so a divergence between engine and UI could not
   *      be caught in one place.
   * Returns a clamped fraction in [0,1]; anything non-finite falls back to the
   * default. Exported so the combat panel prints exactly what the engine uses. */
  function eatThreshold(){
    var a = ensureShape();
    var t = a && a.eat ? a.eat.threshold : null;
    if(typeof t !== 'number' || !isFinite(t)) t = DEFAULTS.eat.threshold;
    t = Math.max(0, Math.min(1, t));
    /* b45x — THE TIER CEILING, applied HERE because this is the file's declared
     * "ONE reader of the effective auto-eat trigger point": the engine, the
     * combat panel and the settings copy all come through it, so they cannot
     * disagree about what Auto-Eat I actually does.
     *
     * Clamped on READ rather than on write so a preference set while the player
     * owned tier II is not destroyed, and so a save restored on a device that
     * has not seen the trait tables yet still lands on the entitlement.
     *
     * The SERVER applies the same ceiling on WRITE (hr_set_auto_eat,
     * 2026-08-29-auto-eat-tiers.sql) — different moment, same effective number,
     * which is what the away/live parity guard needs. If the core is not up we
     * return the unclamped value, matching every other core-less path in this
     * file rather than inventing a second copy of the tier rule. */
    var A = core();
    if(A && typeof A.effectiveThreshold === 'function' && typeof A.autoEatTier === 'function'){
      return A.effectiveThreshold(t, A.autoEatTier((window.G && window.G.traits) || {}));
    }
    return t;
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

  /* ── THE DECISION MOVED TO src/core/auto-eat.js ──────────────────────
   * Not because it was impure — it never was — but because the SERVER has
   * to make the same one when it prices an unattended night, and Deno
   * cannot import a classic <script>. Until it moved, `fx.autoEat` had no
   * server implementation at all; a missing fx handler is a no-op by
   * construction in combat-sim.js, so the server simply never healed and
   * every away night ended at the first death. Measured on the same seed
   * and state: the server paid 63%-99% less than the client.
   *
   * Same treatment as the burn maths (src/features/cooking-fire.js is a
   * shim over src/core/artisan.js): the RULE lives in core, this file keeps
   * the APPLY step, because the client mutates G and the server accumulates
   * a delta for hr_apply.
   *
   * Load order: this is a classic script and runs BEFORE core-bridge.js (a
   * deferred module), so nothing may read the core at IIFE time — the
   * reference below is inside a function, which runs later. The local
   * fallback is kept for the boot window, exactly as foodClassOf() above. */
  function core(){
    var C = window.HearthriseCore;
    return (C && C.autoEat) || null;
  }

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
    var A = core();
    /* No core, no eat. This is NOT a silent regression dressed as a guard:
     * core-bridge.js is a deferred module that publishes HearthriseCore before
     * DOMContentLoaded, and legacy.js — which owns every caller of this
     * function (COMBAT_FX.autoEat, and processOffline via simulateSpan) — does
     * not boot until DOMContentLoaded. The engine path already hard-depends on
     * the core the same way (legacy.js doSkillAction calls
     * C.progression.resolveGatherAction with no null check at all), and
     * src/core-ready.js parks the boot timers until the core is online.
     * Returning false here matches what this function already did before its
     * data was loaded, rather than inventing a second copy of the rule to
     * cover a window that cannot occur. */
    if(!A) return false;
    var decision = A.resolveAutoEat({
      enabled: !!(eat && eat.enabled),
      // b217: auto-eat is a purchased trait — unbypassable gate. Until bought
      // in the Store, combat healing is manual (the player clicks food).
      // ensureShape() above grandfathers pre-b217 saves that already had it on.
      // b45x: ANY tier owns the feature — the tier only sets the CEILING, which
      // eatThreshold() below applies. Asking about one trait id would silently
      // stop auto-eating for a character holding only the upgrade.
      owned: (typeof A.autoEatTier === 'function')
        ? A.autoEatTier(window.G.traits || {}) > 0
        : !!(window.G.traits && window.G.traits.auto_eat),
      hp: window.G.playerHp,
      maxHp: window.G.playerMaxHp,
      threshold: eatThreshold(),
      foodId: eat ? eat.foodId : null,
      inventory: window.G.inventory,
      items: window.ITEMS,
    });
    if(!decision) return false;

    /* THE APPLY STEP — the half that stays client-side, because the server's
     * half accumulates a delta for hr_apply instead of mutating a save. */
    window.G.playerHp = decision.hp;
    if(typeof window.removeItem === 'function'){
      window.removeItem(decision.foodId, 1);
    } else if(window.G.inventory){
      window.G.inventory[decision.foodId] = (window.G.inventory[decision.foodId] || 1) - 1;
      if(window.G.inventory[decision.foodId] <= 0) delete window.G.inventory[decision.foodId];
    }
    window.G.stats = window.G.stats || {};
    window.G.stats.buffsConsumed = (window.G.stats.buffsConsumed || 0) + 1;
    if(Array.isArray(window.G.combatLog)){
      var _it = window.ITEMS && window.ITEMS[decision.foodId];
      window.G.combatLog.push('Auto-ate ' + ((_it && _it.n) || decision.foodId)
        + ' (+' + decision.heals + ' HP)');
    }

    /* ── THE CONSUMPTION HAS TO BECOME REAL (LIVE P0, b467→b479) ────────────
     * "Food eaten while in combat gets restocked."
     *
     * The four lines above are the WHOLE of what this function used to do about
     * the food: heal, remove from the local bag, log. Nothing told the SERVER —
     * and the server was not eating it either (its engine only eats when
     * `player_state.auto_eat_enabled` is set, and that column has never had a
     * caller from this client). So NOBODY debited an auto-eaten Provision, while
     * `reconcileInventory` takes the LARGER of the two figures — the very next
     * envelope handed it straight back, and so did a reload. That is the
     * deterministic half of the report (`window.eatFood` has sent the `eat`
     * intent since the Paione P0; this path never did).
     *
     * `window.noteItemConsumed` is the ONE seam that both halves of the fix live
     * behind: it records the unit as unsettled (so the reconcile stops
     * restocking it in the meantime) and, ONLY while the server says it is not
     * eating, routes the `eat` intent — QUEUED and paced, because auto-eat can
     * fire once per swing and the verb shares the server's 30/min bucket. It is
     * a no-op during an away replay — the server ate that food itself and states
     * the debit in `away.items`, so an intent for it would debit twice.
     *
     * Guarded, because legacy.js is a classic script this module cannot import:
     * with the seam absent this is byte-for-byte the pre-b487 behaviour. */
    if(typeof window.noteItemConsumed === 'function'){
      try{ window.noteItemConsumed(decision.foodId, 1, {auto: true}); }
      catch(e){ /* the local heal + debit stand; the next envelope reconciles */ }
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
    /* b431 — route through the server-of-record accessor (DORMANT no-op today).
       When armed + UNKNOWN, skillXpOr returns 0 → levelFromXp → 1 (< targetLevel),
       so the auto-stop stays its hand rather than firing on an un-arrived skill. */
    var SR = window.HearthriseSkillRecord;
    var xp = (SR && typeof SR.skillXpForDisplayOr === 'function')
      ? SR.skillXpForDisplayOr(window.G, g.skillId, 0)
      : ((SR && typeof SR.skillXpOr === 'function')
        ? SR.skillXpOr(window.G, g.skillId, 0)
        : ((window.G.skills && window.G.skills[g.skillId]) || 0));
    var lv = (typeof window.levelFromXp === 'function') ? window.levelFromXp(xp) : 1;
    if(lv < g.targetLevel) return false;
    // Goal met. Stop + notify + self-disable.
    if(typeof window.stopSkill === 'function') window.stopSkill();
    if(typeof window.notify === 'function'){
      var skName = (window.SKILLS_DEF && window.SKILLS_DEF[g.skillId] && window.SKILLS_DEF[g.skillId].name) || g.skillId;
      window.notify('' + skName + ' Lv ' + g.targetLevel + ' reached — auto-stopped', 'levelup');
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
      if(typeof window.notify === 'function') window.notify('Auto-replant: out of ' + (crop.name||fr.cropId) + ' seeds', 'kill');
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
    eatThreshold: eatThreshold,
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
    /* b499 — the settings sync, published for the regression suite. `_flushEat`
       runs the pending flush NOW instead of waiting out the quiet window (a test
       that slept 1.5 s per assertion would not get written); `_syncState` reports
       what is queued; `_resetEatSync` drops any pending work so one test cannot
       leak a queued call into the next. */
    _flushEatSync: flushServerSync,
    _syncState: function(){ return { pending: _syncPending && Object.assign({}, _syncPending), inFlight: _syncInFlight, armed: !!_syncTimer, parked: _syncParked }; },
    _resetEatSync: function(){ if(_syncTimer) clearTimeout(_syncTimer); _syncTimer = null; _syncPending = null; _syncInFlight = false; },
    /* Park/unpark, for runSmokeTest (and for the AUTOEAT-SYNC tests, which
       unpark themselves). Returns the PREVIOUS state so a caller can restore it
       rather than assuming what it was. */
    _parkEatSync: function(on){ var was = _syncParked; _syncParked = !!on; if(_syncParked){ if(_syncTimer) clearTimeout(_syncTimer); _syncTimer = null; _syncPending = null; } return was; },
    /* The on/off toggle's arm. Read it to assert the SHIPPED position; set it to
       drive the armed one. Returns the previous value. */
    _syncEnabledToggle: function(v){ var was = SYNC_ENABLED_TOGGLE; if(arguments.length) SYNC_ENABLED_TOGGLE = !!v; return was; },
    _SYNC_QUIET_MS: SYNC_QUIET_MS,
  };

  console.log('[auto-actions] API loaded — engine hooks are stubs until b134/b135.');
})();
