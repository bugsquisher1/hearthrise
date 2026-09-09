// ============================================================
// src/features/set-the-night.js — THE RETURN RITUAL
//
// Feature slate §3, "Set the Night". Two halves of one ritual:
//
//   BEFORE  a "Tonight" line on Home's "Right now" card that says how far
//           the CURRENT activity carries under the CURRENT supplies.
//   AFTER   one line on the b341 welcome-back modal that says how right
//           that forecast turned out — read from the SERVER'S RECEIPT
//           (`G.lastOfflineSummary`), never from the prediction.
//
// ── AUTHORITY (CLAUDE.md §1) ────────────────────────────────────────────
// The forecast is ADVISORY DISPLAY and nothing else. It is never sent, the
// server never reads it, it credits nothing, and no gate anywhere consults
// it. It is computed by running THE ONE ENGINE — `HearthriseCore.combatSim
// .simulateSpan`, the same function the live tick and `hr-accrue` run — on a
// DEEP CLONE of `G` with a FIXED SEED and an `fx` object that has no client
// wrappers, so it cannot touch a single field of the real save. That is the
// difference between "predicted with the server's own rules" and "authored
// client-side": the numbers come from the engine, the authority does not.
//
// The slate's `hr_night_forecast` RPC (an evaluated-server-side forecast)
// is DEFERRED — it needs a lane-C round and it buys accuracy this surface
// does not need, because the morning half already grades the forecast
// against the server's receipt. If the two ever disagree the player is told
// by the morning line itself.
//
// ── WHERE THE FORECAST LIVES BETWEEN THE TWO HALVES ─────────────────────
// NOT in `G`, and NOT in the residue allowlist (`RESIDUE_FIELDS`). §6 says
// the residue is for client-only preferences the player would miss; a
// prediction is neither a preference nor something the server should ever
// project, and adding it would put a client-authored number one hop from
// the envelope. It lives in the STORAGE SEAM (`window.HearthriseStorage`,
// src/platform/storage.js) under one key, stamped with the character name
// and an expiry. If it is missing, stale, or from another character, the
// morning modal simply omits the line — a ritual that degrades to silence
// rather than to a guess.
// ============================================================
(function () {
  'use strict';

  var KEY = 'hearthrise:set-the-night';
  /* The forecast horizon. Eight hours is "a night" — the thing the ritual is
     about — and it is deliberately NOT the offline cap: the cap is a payout
     ceiling that moves with perks, and a sentence about how far your food
     carries you should not change because you bought a clan hall. */
  var HORIZON_MS = 8 * 3600000;
  /* One seed, forever. A forecast that moved every time the card repainted
     would be noise dressed as information. */
  var SEED = 20260908;
  /* A forecast older than this is not about tonight. */
  var STALE_MS = 36 * 3600000;

  function store() { return window.HearthriseStorage || null; }
  function core() { return window.HearthriseCore || null; }
  function items() { return window.ITEMS || {}; }

  function fmtSpan(ms) {
    var m = Math.max(0, Math.round((Number(ms) || 0) / 60000));
    if (m < 1) return 'less than a minute';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? (h + 'h ' + r + 'm') : (h + 'h');
  }
  function itemName(id) {
    var it = items()[id];
    return (it && it.n) || String(id || '').replace(/_/g, ' ');
  }
  function monsterName(id) {
    var M = (window.MONSTERS || {})[id];
    return (M && (M.n || M.name)) || String(id || 'your target').replace(/_/g, ' ');
  }
  function skillName(sk) {
    var S = (window.SKILLS_DEF || {})[sk];
    return (S && S.name) || String(sk || '').replace(/_/g, ' ');
  }
  /* NO PLURALISATION, and it is not laziness. Hearthrise item names are mass
     nouns as authored — "Cooked Shrimp", "Rune Bar", "Wolf Pelt" — and every
     other count surface in the game prints "107 Cooked Shrimp". An `+ "s"`
     rule read "107 cooked shrimps" on the first screenshot of this feature,
     which is the one place a returning player is being asked to trust a
     number. The name is printed exactly as `ITEMS[id].n` authored it. */
  function countOf(n, name) { return n + ' ' + name; }

  /* A SAVE-SAFE CLONE. `G` is plain data (the save allowlist is JSON), so a
     JSON round trip is both sufficient and the strongest possible guarantee
     that the simulation cannot reach a live object by reference. On the
     impossible day it fails we return null and the surface says nothing —
     never a half-cloned G handed to a mutating engine. */
  function cloneState(G) {
    try {
      var c = JSON.parse(JSON.stringify(G));
      return (c && typeof c === 'object') ? c : null;
    } catch (e) { return null; }
  }

  /* Does the accrual engine settle this activity? THE SAME predicate the
     Home banking row uses (`serverAccruedSkill`), so the two lines on one
     card cannot disagree about whether tonight pays. Fails toward "no". */
  function banks(G) {
    if (!G) return false;
    if (G.activeMonster) return true;
    if (!G.activeSkill) return false;
    try {
      var SA = window.HearthriseSkillAuthority;
      if (SA && typeof SA.serverAccruedSkill === 'function') return !!SA.serverAccruedSkill(G.activeSkill);
    } catch (e) {}
    return false;
  }

  // ── THE COMBAT FORECAST ───────────────────────────────────────────────
  /* `fx` is DELIBERATELY BARE except for auto-eat. The live `COMBAT_FX`
     carries five wrappers (dungeon keys, companions, pets, collection log,
     chronicle) that all write to the real `G` and to the server queue; a
     forecast that ran them would credit a night that has not happened. With
     no `killMonster` the engine falls back to `resolveKill(state, …)`, which
     touches only the clone.

     Auto-eat DOES have to be here, because auto-eat is the whole subject:
     it is the thing food does. It is `core.autoEat.resolveAutoEat` — the
     pure function the live path and the accrual engine both resolve through
     — applied to the clone's own inventory, so the forecast eats exactly the
     meals the real night will eat. */
  function forecastFx(clone) {
    var C = core();
    var AE = C && C.autoEat;
    return {
      autoEat: function () {
        if (!AE || typeof AE.resolveAutoEat !== 'function') return false;
        var A = window.HearthriseAuto;
        var eat = (A && typeof A.getEat === 'function') ? (A.getEat() || {}) : {};
        var owned = true;
        try {
          owned = (typeof AE.autoEatTier === 'function')
            ? AE.autoEatTier((window.G && window.G.traits) || {}) > 0
            : !!(window.G && window.G.traits && window.G.traits.auto_eat);
        } catch (e) {}
        var th = (A && typeof A.eatThreshold === 'function') ? A.eatThreshold() : eat.threshold;
        var r = AE.resolveAutoEat({
          enabled: !!eat.enabled, owned: owned,
          hp: clone.playerHp, maxHp: clone.playerMaxHp,
          threshold: th, foodId: eat.foodId || clone.foodSlot || null,
          inventory: clone.inventory || {}, items: items(),
        });
        if (!r) return false;
        clone.playerHp = r.hp;
        clone.inventory[r.foodId] = Math.max(0, (Number(clone.inventory[r.foodId]) || 0) - 1);
        if (!clone.inventory[r.foodId]) delete clone.inventory[r.foodId];
        return true;
      },
    };
  }

  /* How much auto-eatable food is in the bag, and what is it? Reported so the
     sentence can NAME the provision — "your 107 Cooked Shrimp" reads as a
     fact about this player's bag; "your food" reads as a template. */
  function bagFood(G) {
    var C = core(), out = { qty: 0, id: null };
    var AE = C && C.autoEat;
    if (!AE || typeof AE.isAutoEatable !== 'function') return out;
    var inv = G.inventory || {}, cat = items(), bestQty = 0, bestId = null, total = 0;
    for (var id in inv) {
      if (!Object.prototype.hasOwnProperty.call(inv, id)) continue;
      var q = Number(inv[id]) || 0;
      if (q <= 0 || !AE.isAutoEatable(cat[id])) continue;
      total += q;
      if (q > bestQty) { bestQty = q; bestId = id; }
    }
    out.qty = total; out.id = bestId;
    return out;
  }

  function combatForecast(G) {
    var C = core();
    if (!C || !C.combatSim || typeof C.combatSim.simulateSpan !== 'function') return null;
    var CS = window.HearthriseCombatSim;
    if (!CS || typeof CS.ctx !== 'function') return null;
    var clone = cloneState(G);
    if (!clone) return null;

    var ctx;
    try { ctx = CS.ctx(); } catch (e) { return null; }
    /* THE SPAN SAYS IT IS AWAY. Same reason `simulateAwayCombat` states it
       rather than inheriting it: `away` picks the rate multiplier AND the
       payable channel scope, and a forecast that ran as "attended" would
       promise a night that pays blessings it will not pay. */
    ctx.away = true;
    /* ── THE WINDOW IS ANCHORED TO THE UTC HOUR, NOT TO `Date.now()` ────────
       Not a rounding preference — a correctness one. `simulateSpan` slices
       its span into UTC-DAY SEGMENTS (`utcDaySegments`), so a window that
       started at the current millisecond produced a different segmentation,
       a different tick budget and therefore a different answer on every
       single repaint: MEASURED at 5,248,800ms/222 kills and 5,136,000ms/212
       kills two calls apart, on identical state. Home repaints on every tab
       change, so the player would have watched their night's forecast
       shimmer. Anchoring to the top of the hour makes the sentence stable
       for as long as anyone is likely to read it, and it stays honest: the
       hour it names is a real hour, not an average. */
    var now = Math.floor(Date.now() / 3600000) * 3600000;
    ctx.fromMs = now;
    ctx.toMs = now + HORIZON_MS;
    ctx.capped = false;
    try { if (typeof window.combatTickMs === 'function') ctx.tickMs = window.combatTickMs(); } catch (e) {}
    /* ── A PRIVATE, SEEDED GENERATOR ───────────────────────────────────────
       `C.rngMod.createRng`, NOT `C.reseed()`. They look interchangeable and
       are not: `reseed` pins the LIVE SESSION stream — the one the player's
       real fight, real drops and real crit rolls come out of — so a forecast
       that used it would leave every subsequent kill in the session running
       off a constant the client chose. This builds its own generator and
       hands it to the span, leaving `C.rng` untouched. It is also why the
       forecast may not simply borrow `ctx.rng` from `CS.ctx()`: drawing
       eighteen thousand ticks out of the session stream would advance the
       generator the next real swing is about to use.

       A hard failure here is a HARD failure: without a private rng the span
       would fall through to the live stream, so the forecast returns null
       rather than quietly stealing the session's draws. */
    try { ctx.rng = C.rngMod.createRng(SEED); } catch (e) { return null; }
    if (!ctx.rng || typeof ctx.rng.int !== 'function') return null;
    ctx.fx = forecastFx(clone);
    /* No `botdFor`: the featured-boss resolver is a per-segment bonus, and
       `simulateSpan` already defaults to none. A forecast that promised a
       boss multiplier for hours the player has not reached would be the
       optimistic half of a sentence whose whole job is honesty. */

    var out;
    try { out = C.combatSim.simulateSpan(clone, ctx); } catch (e) { return null; }
    if (!out) return null;

    var food = bagFood(G);
    var survivedMs = Math.max(0, Number(out.survivedMs) || 0);
    var died = !!out.died || (Number(out.deaths) || 0) > 0;
    return {
      kind: 'combat',
      target: G.activeMonster,
      targetName: monsterName(G.activeMonster),
      spanMs: died ? survivedMs : HORIZON_MS,
      horizonMs: HORIZON_MS,
      allNight: !died,
      kills: Math.max(0, Number(out.kills) || 0),
      foodQty: food.qty,
      foodId: food.id,
      foodName: food.id ? itemName(food.id) : null,
      banks: true,
      at: Date.now(),
    };
  }

  // ── THE BENCH / NODE FORECAST ─────────────────────────────────────────
  /* Gathering has nothing to run out of, so a payable node runs the night by
     construction. A BENCH does: `recipeInputs` is the engine's own reader of
     the three input shapes (`input`, `inputs`, `secondary`), so the count
     here and the count `simulateArtisanSpan` stops on come from one place. */
  function benchForecast(G) {
    var sk = G.activeSkill, tid = G.skillTargetId;
    if (!sk || !tid) return null;
    var payable = banks(G);
    var ms = null;
    try { if (typeof window.activityIntervalMs === 'function') ms = window.activityIntervalMs(); } catch (e) {}
    var recipes = (window.ARTISAN_RECIPES || {})[sk];
    var recipe = recipes ? recipes.filter(function (r) { return r.id === tid; })[0] : null;
    var base = {
      kind: recipe ? 'bench' : 'gather',
      skill: sk, skillName: skillName(sk), target: tid,
      targetName: recipe ? (recipe.name || tid) : nodeName(sk, tid),
      banks: payable, horizonMs: HORIZON_MS, at: Date.now(),
    };
    if (!payable) { base.spanMs = 0; base.allNight = false; return base; }
    if (!recipe || !(ms > 0)) {
      base.spanMs = HORIZON_MS; base.allNight = true; return base;
    }
    var C = core();
    var inputs = null;
    try { inputs = C.artisan.recipeInputs(recipe) || {}; } catch (e) { inputs = {}; }
    var inv = G.inventory || {};
    var actions = Infinity, limiter = null;
    for (var id in inputs) {
      if (!Object.prototype.hasOwnProperty.call(inputs, id)) continue;
      var per = Math.max(1, Number(inputs[id]) || 1);
      var have = Math.floor((Number(inv[id]) || 0) / per);
      if (have < actions) { actions = have; limiter = id; }
    }
    if (!isFinite(actions)) { base.spanMs = HORIZON_MS; base.allNight = true; return base; }
    var runMs = actions * ms;
    base.actions = actions;
    base.limiterId = limiter;
    base.limiterName = limiter ? itemName(limiter) : null;
    base.spanMs = Math.min(HORIZON_MS, runMs);
    base.allNight = runMs >= HORIZON_MS;
    return base;
  }

  function nodeName(sk, tid) {
    var pools = [window.TREES, window.ROCKS, window.FISH_SPOTS];
    for (var i = 0; i < pools.length; i++) {
      var p = pools[i];
      if (!Array.isArray(p)) continue;
      for (var j = 0; j < p.length; j++) if (p[j] && p[j].id === tid) return p[j].name || tid;
    }
    return String(tid).replace(/_/g, ' ');
  }

  /* ── THE BAG MUST HAVE COME FROM THE SERVER (b525) ─────────────────────
     LIVE, twice (QA account, b522 and b524): on a plain reload the strip read
     "Tonight: your 29 Cooked Shrimp carry you about 26m against Goblin" for
     ~10s, then flipped to "with nothing to eat you last about 5m" when the
     envelope landed. The server bag had held no food for hours. The 29 was the
     FRESH-G FACTORY LITERAL (src/legacy.js `inventory:{turnip_seed:5,
     carrot_seed:3,shrimp:10,cooked_shrimp:20}` — 30 auto-eatable units, one
     already eaten by the live tick). `loadLocal()` cannot strip it: `inventory`
     is not a SERVER_OF_RECORD field, so `forgetServerOfRecord` leaves it, and
     it is only overwritten when an envelope reconciles the bag.

     Every sentence this file speaks is priced off that bag, so the whole
     forecast waits for the stamp `reconcileInventory` sets on BOTH doors (the
     idle-boot `hr_load` hydrate in record.js and `applyEnvelopeState`). Gated
     HERE rather than in `strip()` so the pre-envelope guess is also never
     REMEMBERED — a stale forecast in storage would go on to grade the morning
     line. Before the stamp the surface says nothing at all: no placeholder, no
     number, an empty strip. Fail-closed — an accrual module that failed to load
     answers "not hydrated" and the strip stays silent. */
  function bagIsServerStated(G) {
    try {
      var AC = window.HearthriseAccrual;
      return !!(AC && typeof AC.bagHydrated === 'function' && AC.bagHydrated(G));
    } catch (e) { return false; }
  }

  /** The forecast for whatever is running right now, or null when idle. */
  function forecast(G) {
    G = G || window.G;
    if (!G || typeof G !== 'object') return null;
    if (!bagIsServerStated(G)) return null;
    if (G.activeMonster) return combatForecast(G);
    if (G.activeSkill) return benchForecast(G);
    return null;
  }

  // ── THE SENTENCE ──────────────────────────────────────────────────────
  function sentence(f) {
    if (!f) return null;
    if (f.kind === 'combat') {
      var bag = f.foodQty > 0 && f.foodName
        ? ('your ' + countOf(f.foodQty, f.foodName))
        : null;
      if (f.allNight) {
        return bag
          ? ('Tonight: ' + bag + ' carry you through the night against ' + f.targetName + '.')
          : ('Tonight: you hold out through the night against ' + f.targetName + '.');
      }
      return 'Tonight: ' + (bag ? bag + ' carry you' : 'with nothing to eat you last')
        + ' about ' + fmtSpan(f.spanMs) + ' against ' + f.targetName
        + '; then you fall and the night ends in recovery.';
    }
    if (!f.banks) return 'Tonight: ' + f.skillName + ' only earns while you are here.';
    if (f.kind === 'gather') return 'Tonight: ' + f.targetName + ' runs all night.';
    if (f.allNight) return 'Tonight: this bench runs all night.';
    if (!(f.actions > 0)) {
      return 'Tonight: this bench has no ' + (f.limiterName || 'materials') + ' left — it stops at once.';
    }
    return 'Tonight: this bench runs about ' + fmtSpan(f.spanMs) + ' — your '
      + f.limiterName + ' runs out after ' + f.actions + '.';
  }

  // ── REMEMBERING IT (client display state, storage seam) ───────────────
  function who() { try { return String((window.G && window.G.name) || ''); } catch (e) { return ''; } }

  function remember(f) {
    var S = store();
    if (!S || !f) return false;
    S.setJSON(KEY, {
      at: f.at || Date.now(), who: who(), kind: f.kind,
      spanMs: f.spanMs, allNight: !!f.allNight, banks: f.banks !== false,
      targetName: f.targetName || null, sentence: sentence(f),
    });
    return true;
  }
  /** The remembered forecast, or null when there is none we may speak for. */
  function recall(nowMs) {
    var S = store();
    if (!S) return null;
    var r = S.getJSON(KEY, null);
    if (!r || typeof r !== 'object') return null;
    var now = (typeof nowMs === 'number') ? nowMs : Date.now();
    if (!(r.at > 0) || (now - r.at) > STALE_MS) return null;
    if (r.who !== who()) return null;      // a different character's night
    return r;
  }
  function forget() { var S = store(); if (S) S.remove(KEY); }

  // ── THE MORNING LINE ──────────────────────────────────────────────────
  /* GRADED AGAINST THE RECEIPT, never against the client's own replay.
     `paidMs` is the span the SERVER credited; `deaths` / `stoppedBy` are the
     server's account of what ended it. The prediction supplies only the
     number it predicted — everything the line asserts about the night
     happened on the server. When the receipt is absent or has no span, there
     is nothing to grade and the line is null. */
  function morningLine(off, remembered) {
    var r = remembered || recall();
    if (!r || !(r.spanMs >= 0)) return null;
    var s = off || {};
    var paid = Number(s.paidMs);
    if (!isFinite(paid) || paid <= 0) return null;
    /* The receipt must be ABOUT the night we forecast. A receipt written
       before the forecast is a different absence. */
    if (s.at && r.at && s.at < r.at) return null;

    var predicted = Math.max(0, Number(r.spanMs) || 0);
    var verdict;
    if (predicted <= 0) verdict = 'the night paid anyway.';
    else {
      var ratio = paid / predicted;
      if (ratio >= 0.85 && ratio <= 1.15) verdict = 'the forecast held.';
      else if (ratio < 0.85) verdict = 'the night ran short.';
      else verdict = 'the night ran long.';
    }
    var clause = null;
    try {
      var AC = window.HearthriseAccrual;
      var o = { itemLabel: itemName, skillLabel: skillName, foeLabel: monsterName, spanLabel: fmtSpan };
      if (AC) clause = AC.receiptStopClause(s, o) || AC.receiptRecoveryClause(s, o) || null;
    } catch (e) {}
    return 'You set about ' + fmtSpan(predicted) + '; the night paid ' + fmtSpan(paid)
      + ' — ' + verdict + (clause ? (' ' + clause + '.') : '');
  }

  // ── THE HOME STRIP ────────────────────────────────────────────────────
  /* Returns the `.hd-card.hd-mini` row home-dashboard drops into "Right now",
     or '' when there is nothing running to forecast. Tokens only, no colour
     literals — the tone rides on `--gold` / `--ink-3`, which is the same
     ladder the banking row beside it uses. */
  function strip(G) {
    var f = forecast(G || window.G);
    if (!f) return '';
    var txt = sentence(f);
    if (!txt) return '';
    try { remember(f); } catch (e) {}
    var esc = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
      });
    };
    /* The same glyph shape home-dashboard's own `gly()` builds, from the same
       baked atlas — an emoji here would break the 0-emoji rule on the most
       looked-at card in the game. Colour is a TOKEN, never a literal. */
    var glyph = '';
    try {
      var IS = window.HearthriseIconSet;
      var path = IS && IS.path && IS.path('uiHourglass');
      if (path) {
        glyph = '<svg viewBox="0 0 512 512" style="width:20px;height:20px;display:inline-block;'
          + 'vertical-align:middle" aria-hidden="true"><path fill="'
          + (f.allNight ? 'var(--gold)' : 'var(--ink-2)') + '" d="' + path + '"/></svg>';
      }
    } catch (e) {}
    return '<div class="hd-card hd-mini hd-night" data-night="' + esc(f.kind) + '">'
      + '<div class="mi">' + glyph + '</div>'
      + '<div class="hd-night-txt">' + esc(txt) + '</div></div>';
  }

  // ── WIRING ────────────────────────────────────────────────────────────
  /* The strip is rendered by home-dashboard, so the forecast is remembered
     every time Home paints. A player who closes the tab from another screen
     would then leave a stale one, so `pagehide` re-measures — the same event
     the keepalive save already rides, and it is display state, so there is
     no ordering hazard with the settle. */
  function captureOnLeave() {
    try { var f = forecast(window.G); if (f) remember(f); } catch (e) {}
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', captureOnLeave);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) captureOnLeave();
    });
  }

  window.HearthriseSetTheNight = {
    HORIZON_MS: HORIZON_MS,
    forecast: forecast,
    sentence: sentence,
    strip: strip,
    remember: remember,
    recall: recall,
    forget: forget,
    morningLine: morningLine,
    fmtSpan: fmtSpan,
    _KEY: KEY,
  };
})();
