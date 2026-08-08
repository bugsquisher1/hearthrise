// ============================================================
// src/features/homestead.js  (b201, SYS-1)
//
// The progression SPINE: property tiers from a tiny 2-plot camp with
// NO workbenches all the way to Hearthrise Castle. Each tier is a real
// resource sink (gold + crafted materials) and unlocks:
//   • farm-plot capacity        (2 → 12)
//   • which house ROOMS you may build — rooms ARE the workbenches:
//       kitchen→cooking, forge→smithing, workshop→crafting, shrine→prayer
//     A fresh player literally cannot cook until they build a kitchen.
//   • worker slots (see features/workers.js — idle resource production)
//   • bonus offline-cap hours (wired into processOffline like renown)
//   • castle capstone: +5% all XP (wired into getBonus)
//
// Grandfathering: existing saves must never lose an ability they had.
// ensureState() infers a fair starting tier from rooms/plots/XP and
// auto-grants lv-1 workbenches for artisan skills that already have XP.
//
// Integration points touched in legacy.js (all guarded):
//   upgradeRoom (tier gate) · buildPlot (plot cap) · startArtisan
//   (workbench gate) · processOffline (bonus hours) · getBonus (castle XP)
// ============================================================
(function () {
  'use strict';

  var TIERS = [
    { id: 'camp',      name: "Wanderer's Camp",      icon: '⛺', plots: 2,  workers: 0, offlineHours: 0,
      desc: 'A bedroll, a fire, and two rows of dirt. Everyone starts somewhere.',
      cost: null, rooms: [] },
    /* b213 QA: tier costs may only require materials a player can actually
       produce BEFORE reaching that tier. The old table demanded planks for
       tier 1 (planks need the Workshop — a tier-2 room) and bars for tiers
       2-3 (bars need the Forge — a tier-3 room): a hard progression deadlock
       for every fresh account (veterans were grandfathered past it, which is
       why it went unseen). Each tier's new room now feeds the NEXT rung. */
    { id: 'homestead', name: 'Hearthside Homestead', icon: '🏡', plots: 4,  workers: 1, offlineHours: 0,
      desc: 'Four walls and a hearth. Unlocks the Kitchen and Garden — and your first hired hand.',
      cost: { gold: 400, normal_log: 30, copper_ore: 20 },
      rooms: ['kitchen', 'garden'] },
    { id: 'farmstead', name: 'Fieldworth Farmstead', icon: '🌾', plots: 6,  workers: 2, offlineHours: 1,
      desc: 'Barns and fences. Unlocks the Workshop and Cellar, a second worker, +1h offline cap.',
      cost: { gold: 2500, oak_log: 40, copper_ore: 25, wolf_pelt: 4, cooked_shrimp: 10 },
      rooms: ['workshop', 'cellar'] },
    { id: 'manor',     name: 'Stonecross Manor',     icon: '🏛️', plots: 8,  workers: 3, offlineHours: 2,
      desc: 'Cut stone and iron gates. Unlocks the Forge and Library, a third worker, +2h offline cap.',
      cost: { gold: 10000, willow_plank: 35, iron_ore: 40, silk_thread: 8 },
      rooms: ['forge', 'library'] },
    { id: 'keep',      name: 'Ironvale Keep',        icon: '🏰', plots: 10, workers: 4, offlineHours: 3,
      desc: 'Ramparts and a watch bell. Unlocks the Shrine and Trophy Room, a fourth worker, +3h offline cap.',
      cost: { gold: 40000, maple_plank: 50, steel_bar: 35, big_bones: 20, bear_pelt: 5 },
      rooms: ['shrine', 'trophy'] },
    { id: 'castle',    name: 'Hearthrise Castle',    icon: '👑', plots: 12, workers: 6, offlineHours: 4,
      desc: 'The banner over the valley. Six workers, +4h offline cap, and the pride of the realm: +5% all XP.',
      cost: { gold: 150000, yew_plank: 70, mithril_bar: 40, rune_bar: 8, dragon_scale: 4 },
      rooms: [] }
  ];

  // room → the artisan skill it enables (rooms ARE the workbenches)
  var WORKBENCH = { cooking: 'kitchen', smithing: 'forge', crafting: 'workshop', prayer: 'shrine' };

  // min property tier at which each room may be built
  function roomMinTier(roomId) {
    for (var i = 0; i < TIERS.length; i++) {
      if ((TIERS[i].rooms || []).indexOf(roomId) >= 0) return i;
    }
    return 1; // unknown/legacy rooms default to tier 1
  }

  function G_() { return window.G || {}; }

  function ensureState() {
    var G = G_();
    if (!G || typeof G !== 'object') return;
    if (G.homestead && typeof G.homestead.tier === 'number') return;

    // ---- grandfather existing saves ----
    var tier = 0;
    var rooms = G.rooms || {};
    var hasAnyRoom = Object.keys(rooms).some(function (r) { return (rooms[r] || 0) > 0; });
    var plotCount = (G.plotBuildings || []).filter(function (b) { return b.id === 'farm_plot'; }).length;
    var skills = G.skills || {};
    var artisanXp = ['cooking', 'smithing', 'crafting', 'prayer'].some(function (s) { return (skills[s] || 0) > 0; });
    var existing = hasAnyRoom || plotCount > 0 || artisanXp || ((G.stats && G.stats.kills) || 0) > 20;

    if (existing) {
      tier = 1;
      // tier must cover every room they built + every artisan skill they trained
      Object.keys(rooms).forEach(function (r) { if ((rooms[r] || 0) > 0) tier = Math.max(tier, roomMinTier(r)); });
      Object.keys(WORKBENCH).forEach(function (skill) {
        if ((skills[skill] || 0) > 0) tier = Math.max(tier, roomMinTier(WORKBENCH[skill]));
      });
      // tier must cover their existing plots
      for (var t = 0; t < TIERS.length; t++) { if (TIERS[t].plots >= plotCount) { tier = Math.max(tier, 0) ; break; } }
      for (var t2 = TIERS.length - 1; t2 >= 0; t2--) { if (plotCount > (TIERS[t2 - 1] ? TIERS[t2 - 1].plots : 0)) { tier = Math.max(tier, t2); break; } }
      tier = Math.min(tier, TIERS.length - 1);
      // auto-grant lv-1 workbenches for artisan skills they already trained
      G.rooms = G.rooms || {};
      Object.keys(WORKBENCH).forEach(function (skill) {
        var room = WORKBENCH[skill];
        if ((skills[skill] || 0) > 0 && !(G.rooms[room] > 0)) G.rooms[room] = 1;
      });
    }
    G.homestead = { tier: tier };
  }

  function getTier() { ensureState(); return (G_().homestead || { tier: 0 }).tier; }
  function tierDef(i) { return TIERS[i == null ? getTier() : i]; }
  function nextTier() { var t = getTier(); return t < TIERS.length - 1 ? TIERS[t + 1] : null; }
  function maxPlots() { return tierDef().plots; }
  function workerSlots() { return tierDef().workers; }
  function offlineBonusHours() { return tierDef().offlineHours; }
  function isCastle() { return getTier() === TIERS.length - 1; }

  // Which rooms are allowed at the current tier
  function roomAllowed(roomId) { return roomMinTier(roomId) <= getTier(); }
  function canBuildRoom(roomId) {
    if (roomAllowed(roomId)) return { ok: true };
    var need = TIERS[roomMinTier(roomId)];
    return { ok: false, reason: 'Requires ' + (need ? need.name : 'a higher property tier') };
  }

  // Workbench gate for artisan skills. Skills without a workbench room pass.
  function hasWorkbench(skill) {
    var room = WORKBENCH[skill];
    if (!room) return { ok: true };
    ensureState();
    var built = ((G_().rooms || {})[room] || 0) > 0;
    if (built) return { ok: true };
    var roomName = (window.ROOMS && window.ROOMS[room] && window.ROOMS[room].name) || room;
    return { ok: false, room: room, reason: 'Build the ' + roomName + ' at your homestead first' };
  }

  function costAffordable(cost) {
    var G = G_();
    var missing = [];
    Object.keys(cost || {}).forEach(function (k) {
      var need = cost[k];
      var have = k === 'gold' ? (G.gold || 0) : ((G.inventory || {})[k] || 0);
      if (have < need) missing.push({ id: k, need: need, have: have });
    });
    return missing;
  }

  function upgradeProperty() {
    ensureState();
    var G = G_();
    var nxt = nextTier();
    if (!nxt) { if (window.notify) notify('Your castle stands complete.', 'info'); return false; }
    var missing = costAffordable(nxt.cost);
    if (missing.length) {
      if (window.notify) notify('Missing: ' + missing.map(function (m) {
        var n = (window.ITEMS && window.ITEMS[m.id] && window.ITEMS[m.id].n) || m.id;
        return (m.id === 'gold' ? m.need + ' gold' : n + ' ×' + m.need);
      }).join(', '), 'kill');
      return false;
    }
    Object.keys(nxt.cost).forEach(function (k) {
      if (k === 'gold') G.gold -= nxt.cost[k];
      else if (typeof window.removeItem === 'function') window.removeItem(k, nxt.cost[k]);
      else G.inventory[k] = (G.inventory[k] || 0) - nxt.cost[k];
    });
    G.homestead.tier++;
    if (window.notify) notify('🏗️ ' + nxt.name + ' built! ' + (nxt.desc || ''), 'levelup');
    if (typeof window.refreshAll === 'function') window.refreshAll();
    renderCard();
    return true;
  }

  // ---------- UI: property card injected at the top of the House panel ----------
  function fmtCostRow(cost) {
    var G = G_();
    return Object.keys(cost).map(function (k) {
      var need = cost[k];
      var have = k === 'gold' ? (G.gold || 0) : ((G.inventory || {})[k] || 0);
      var name = k === 'gold' ? 'Gold' : ((window.ITEMS && window.ITEMS[k] && window.ITEMS[k].n) || k);
      var ok = have >= need;
      return '<span style="display:inline-flex;gap:4px;align-items:center;margin:2px 8px 2px 0;font-size:12px;' +
        'color:' + (ok ? 'var(--green)' : 'var(--ink-3)') + '">' +
        (ok ? '✓' : '·') + ' ' + name + ' <b>' + Math.min(have, need) + '/' + need + '</b></span>';
    }).join('');
  }

  function renderCard() {
    var panel = document.getElementById('panel-house');
    if (!panel) return;
    ensureState();
    var host = document.getElementById('hh-property-card');
    if (!host) {
      host = document.createElement('div');
      host.id = 'hh-property-card';
      host.className = 'card';
      host.style.cssText = 'margin-bottom:10px';
      panel.insertBefore(host, panel.firstChild);
    }
    var cur = tierDef();
    var nxt = nextTier();
    var t = getTier();
    var pips = TIERS.map(function (_, i) {
      return '<span style="width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:4px;' +
        'background:' + (i <= t ? 'var(--gold)' : 'rgba(255,255,255,.12)') + '"></span>';
    }).join('');
    /* b213 (phase 2): gilt house glyph instead of emoji — the property card
       is the House panel's hero and led the screen with 🏗️/⛺. */
    var IS = window.HearthriseIconSet;
    var houseIco = (IS && IS.path && IS.path('navHouse'))
      ? '<svg viewBox="0 0 512 512" style="width:30px;height:30px;flex:0 0 auto" aria-hidden="true"><path fill="var(--gold-2,#cda24a)" d="' + IS.path('navHouse') + '"/></svg>'
      : '<span style="font-size:28px">' + cur.icon + '</span>';
    var body =
      '<div class="card-head"><div class="card-title">Property</div><div class="card-sub">Tier ' + (t + 1) + ' / ' + TIERS.length + '</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          houseIco +
          '<div><div style="font-family:var(--f-display);font-size:15px;color:var(--gold-2)">' + cur.name + '</div>' +
          '<div class="tiny muted">' + pips + '</div></div>' +
        '</div>' +
        '<div class="tiny muted" style="margin-bottom:8px">' + cur.desc + '</div>' +
        '<div class="tiny" style="margin-bottom:8px;color:var(--ink-2)">Plots <b>' + maxPlots() + '</b> · Workers <b>' + workerSlots() + '</b> · Offline cap <b>+' + offlineBonusHours() + 'h</b>' + (isCastle() ? ' · <b style="color:var(--gold-2)">+5% all XP</b>' : '') + '</div>' +
        (nxt
          ? '<div style="border-top:1px solid var(--line-soft);padding-top:8px">' +
              '<div class="tiny" style="margin-bottom:4px;color:var(--ink-2)">Next: <b style="color:var(--gold-2)">' + nxt.name + '</b> — plots ' + nxt.plots + ', workers ' + nxt.workers + ', +' + nxt.offlineHours + 'h offline</div>' +
              '<div style="margin-bottom:8px">' + fmtCostRow(nxt.cost) + '</div>' +
              '<button class="btn btn-primary btn-sm" onclick="window.HearthriseHomestead.upgradeProperty()">Upgrade Property</button>' +
            '</div>'
          : '<div class="tiny" style="color:var(--gold-2)">The realm is yours. (Clan castles come next.)</div>') +
        '<div id="hh-workers-host"></div>' +
      '</div>';
    host.innerHTML = body;
    if (window.HearthriseWorkers && typeof window.HearthriseWorkers.renderInto === 'function') {
      window.HearthriseWorkers.renderInto(document.getElementById('hh-workers-host'));
    }
  }

  // Re-render our card whenever the House panel renders
  var origRenderHouse = window.renderHouse;
  if (typeof origRenderHouse === 'function') {
    window.renderHouse = function () {
      var r = origRenderHouse.apply(this, arguments);
      try { renderCard(); } catch (e) {}
      return r;
    };
  }

  function boot() {
    try { ensureState(); } catch (e) {}
    try { renderCard(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HearthriseHomestead = {
    TIERS: TIERS,
    WORKBENCH: WORKBENCH,
    ensureState: ensureState,
    getTier: getTier,
    tierDef: tierDef,
    nextTier: nextTier,
    maxPlots: maxPlots,
    workerSlots: workerSlots,
    offlineBonusHours: offlineBonusHours,
    isCastle: isCastle,
    roomMinTier: roomMinTier,
    canBuildRoom: canBuildRoom,
    hasWorkbench: hasWorkbench,
    upgradeProperty: upgradeProperty,
    renderCard: renderCard
  };
})();
