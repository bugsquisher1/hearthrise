// ============================================================
// src/features/homestead.js  (b201, SYS-1)
//
// The progression SPINE: property tiers from a tiny 2-plot camp with
// NO workbenches all the way to Hearthrise Castle. Each tier is a real
// resource sink (gold + crafted materials) and unlocks:
//   • farm-plot capacity        (2 → 12)
//   • which house ROOMS you may build — rooms ARE the workbenches:
//       kitchen→cooking, forge→smithing, workshop→crafting, shrine→prayer
//     …with ONE exception since b225: cooking. The tier-1 camp has a fire,
//     so it cooks — badly. The Kitchen sells reliability, not permission.
//     See UNGATED below and src/features/cooking-fire.js.
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
      /* b226 (Tyler): the Forge moves DOWN to tier 2 — smithing opens with the
         farmstead. Moving a bench EARLIER can never create a b213-style cost
         deadlock (it only relaxes what later tiers may demand). */
      desc: 'Barns and fences. Unlocks the Workshop, Cellar and Forge, a second worker, +1h offline cap.',
      cost: { gold: 2500, oak_log: 40, copper_ore: 25, wolf_pelt: 4, cooked_shrimp: 10 },
      rooms: ['workshop', 'cellar', 'forge'] },
    { id: 'manor',     name: 'Stonecross Manor',     icon: '🏛️', plots: 8,  workers: 3, offlineHours: 2,
      desc: 'Cut stone and iron gates. Unlocks the Library, a third worker, +2h offline cap.',
      cost: { gold: 10000, willow_plank: 35, iron_ore: 40, silk_thread: 8 },
      rooms: ['library'] },
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

  /* b225 — THE CAMPFIRE RULING (Tyler, 2026-08-08, binding; DECISIONS.md and
     homestead-deepening.md §2 PRODUCT-OWNER AMENDMENT).

     "We can't restrict cooking when users don't have a kitchen. They can cook
      with the fire in the first tier camp, it just has a chance to burn."

     Cooking is the ONE exception to "rooms are workbenches": the tier-1 camp
     is a bedroll and A FIRE, and a fire cooks. So the Kitchen keeps its
     mapping above — it is still cooking's room, still the source of cookSpeed,
     and now the source of `noBurn` — but it no longer grants PERMISSION.
     What it sells instead is reliability (src/features/cooking-fire.js).

     Expressed as an explicit exemption set rather than by deleting the mapping
     because three other readers need cooking→kitchen intact: the grandfather
     pass below (a veteran with cooking XP still gets their Kitchen back), the
     cookSpeed bonus lookup, and the House room copy. Smithing on a campfire
     would be silly; cooking on one is the entire point of a campfire. */
  var UNGATED = { cooking: true };

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

  // Workbench gate for artisan skills. Skills without a workbench room pass,
  // and so does anything in UNGATED (b225: cooking — see the ruling above).
  function hasWorkbench(skill) {
    if (UNGATED[skill]) return { ok: true, ungated: true };
    var room = WORKBENCH[skill];
    if (!room) return { ok: true };
    ensureState();
    var built = ((G_().rooms || {})[room] || 0) > 0;
    if (built) return { ok: true };
    var roomName = (window.ROOMS && window.ROOMS[room] && window.ROOMS[room].name) || room;
    return { ok: false, room: room, reason: 'Build the ' + roomName + ' at your homestead first' };
  }

  /* ONE HOLDING READ for this whole file — `k === 'gold' ? (G.gold || 0) : …`
     used to appear three times, and three copies is three chances to teach only
     two of them that a balance can be UNKNOWN.

     UNKNOWN is reported as `known:false` with `have:-1`, which can never
     satisfy a positive requirement — FAIL-CLOSED, so a Build button cannot
     light up against a balance nobody has read. Every renderer below checks
     `known` before printing the figure, because `(0).toLocaleString()` in a
     have/need line is a claim about the player's purse, not a placeholder. */
  function heldOf(k) {
    var G = G_();
    if (k === 'gold' || k === 'gems') {
      var known = (typeof window.balKnown === 'function') ? window.balKnown(k) : typeof G[k] === 'number';
      var n = (typeof window.balOr === 'function') ? window.balOr(k, -1) : (typeof G[k] === 'number' ? G[k] : -1);
      return { have: known ? n : -1, known: known };
    }
    return { have: ((G.inventory || {})[k] || 0), known: true };
  }

  function costAffordable(cost) {
    var missing = [];
    Object.keys(cost || {}).forEach(function (k) {
      var need = cost[k];
      var h = heldOf(k);
      if (!h.known || h.have < need) missing.push({ id: k, need: need, have: h.have, known: h.known });
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
        if (!m.known) return m.id + ' balance not loaded yet';
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
    return Object.keys(cost).map(function (k) {
      var need = cost[k];
      var h = heldOf(k);
      var have = h.have;
      var name = k === 'gold' ? 'Gold' : ((window.ITEMS && window.ITEMS[k] && window.ITEMS[k].n) || k);
      var ok = h.known && have >= need;
      /* b217: this rendered as "✓ Gold 400/400 · Normal Log 0/30" — a raw
         text checkmark, a middle dot standing in for "not met", and three
         requirements run together in one sentence. A requirement list is a
         CHECKLIST: one row per line, the material's own art, and a met/unmet
         state you can read at a glance without parsing the numbers. */
      var art = (typeof window.itemArt === 'function' && k !== 'gold')
        ? window.itemArt(k, 20)
        : ((window.HR && window.HR.icon) ? (window.HR.icon('gold', 16, 'currentColor') || '') : '');
      return '<span class="hh-req' + (ok ? ' is-met' : '') + '">' +
        '<span class="hh-req-art">' + art + '</span>' +
        '<span class="hh-req-name">' + name + '</span>' +
        '<b>' + (h.known ? Math.min(have, need)
          : '<span class="bal-pending" role="status" title="Waiting for the server">—</span>')
        + ' / ' + need + '</b></span>';
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
      : '<span style="font-size:calc(29px * var(--ui-scale, 1))">' + cur.icon + '</span>';
    var body =
      '<div class="card-head"><div class="card-title">Property</div><div class="card-sub">Tier ' + (t + 1) + ' / ' + TIERS.length + '</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          houseIco +
          '<div><div style="font-family:var(--f-display);font-size:calc(16px * var(--ui-scale, 1));color:var(--gold-2)">' + cur.name + '</div>' +
          '<div class="tiny muted">' + pips + '</div></div>' +
        '</div>' +
        '<div class="tiny muted" style="margin-bottom:8px">' + cur.desc + '</div>' +
        /* b217: was one run-on line — "Plots 2 · Workers 0 · Offline cap +0h".
           These are the property's three stats; showing them as a labelled
           strip lets a player compare current vs next without re-reading a
           sentence. */
        '<div class="hh-stats">' +
          '<div class="hh-stat"><b>' + maxPlots() + '</b><span>Plots</span></div>' +
          '<div class="hh-stat"><b>' + workerSlots() + '</b><span>Workers</span></div>' +
          '<div class="hh-stat"><b>+' + offlineBonusHours() + 'h</b><span>Offline cap</span></div>' +
          (isCastle() ? '<div class="hh-stat"><b>+5%</b><span>All XP</span></div>' : '') +
        '</div>' +
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

  // ════════════════════════════════════════════════════════════════════
  // b227 · THE ROOMS ARE PLACES — the homestead's half of the twin pillars
  // ════════════════════════════════════════════════════════════════════
  //
  // Tyler, live: "No good indication that I own the forge on my house screen.
  // I feel like we need to revamp it to be similar to the clan castle."
  //
  // He was right, and the reason is structural rather than cosmetic. A
  // `shop-row` is a SHOP: it exists to sell you the next thing, so it renders
  // identically whether you own the room or not, and the only evidence of
  // ownership was a "· Lv 1" fragment glued inside the title. Meanwhile the
  // clan castle — built one wave earlier against the same design brief — reads
  // as a place with doors you walk into. Two screens specced as twin pillars
  // had drifted into a shop and a castle.
  //
  // So the Rooms tab becomes the homestead's Clan Seat, and it consumes the
  // castle's room-modal seam (window.HearthriseRoomModal) EXACTLY as published:
  // descriptor in, modal out, and the renderer never learns that a homestead
  // exists. `theme` is the only pillar-specific field and it is a CSS hook.
  //
  // Three states, and the whole point is that they are distinguishable at
  // arm's length without reading a word:
  //   owned      — lit, gilt frame, the level is the loudest thing on the card
  //   available  — dashed outline (the castle's own "not built" idiom)
  //   locked     — dim, a lock, and WHICH property tier opens it
  //
  // Nothing here re-derives a number. Costs, effects and rung names all come
  // from window.ROOMS; the tier gate comes from window.roomRungGate, which is
  // the same function upgradeRoom enforces with. A panel that computed its own
  // answer to "can I build this?" is how a screen ends up disagreeing with the
  // button on it.

  var ROOM_META = {
    kitchen:  { theme: 'hearth',   flavour: 'The first room anyone builds, and the only one that is also a meal. Warm light, a pot, and a bench that gets heavier every rung.',
                go: { label: 'Go to Cooking',  tab: 'skills', skill: 'cooking' } },
    garden:   { theme: 'garden',   flavour: 'Rows, a watering can, and the smell of turned earth. The only room whose bonus you watch land, one harvest at a time.',
                go: { label: 'Go to the Farm', tab: 'farming' } },
    workshop: { theme: 'workshop', flavour: 'Sawdust, a vice, and every plank in the game. The room the rest of the homestead is built out of — its planks pay for three other rooms.',
                go: { label: 'Go to Crafting', tab: 'skills', skill: 'crafting' } },
    cellar:   { theme: 'cellar',   flavour: 'Cold stone, low light, shelves of stoppered bottles and one cask you are saving. The room where things keep.',
                go: { label: 'Feasts & Draughts', tab: 'skills', skill: 'cooking', lane: 'feasts' } },
    forge:    { theme: 'forge',    flavour: 'Heat, a bellows, and the ringing that means someone is home.',
                go: { label: 'Go to Smithing', tab: 'skills', skill: 'smithing' } },
    library:  { theme: 'library',  flavour: 'The one room with no bench: shelves, a desk, a candle. Where the homestead stops being a workshop and starts being a house.',
                go: { label: 'Go to Skills',   tab: 'skills' } },
    shrine:   { theme: 'shrine',   flavour: 'A small altar, an offering, and the quietest ten minutes on the homestead.',
                go: { label: 'Go to Prayer',   tab: 'skills', skill: 'prayer' } },
    trophy:   { theme: 'trophy',   flavour: 'Mounted heads, a rack of banners, and the only room that is purely about what you have already done.',
                go: { label: 'Go to Combat',   tab: 'combat' } }
  };

  /* One label table for every bonus key a rung can carry, so a new rung that
     buys a new key shows up in the modal by being DATA rather than by someone
     remembering to add a row. `flat` keys print as +N, the rest as +N%. */
  var KEY_LABEL = {
    cookSpeed: 'Cook speed', smithSpeed: 'Smith speed', craftSpeed: 'Craft speed',
    prayerSpeed: 'Prayer speed', allXP: 'All XP', combatXP: 'Combat XP',
    farmYield: 'Farm yield', buffDuration: 'Food buffs last', noBurn: 'Burn protection',
    yield_cooking: 'Extra portion', yield_smithing: 'Extra bar', craftSave: 'Free crafts',
    restedXp: 'Rested XP potency'
  };
  var KEY_FLAT = { farmYield: true };

  function ROOMS_() { return window.ROOMS || {}; }
  function roomDef(id) { return ROOMS_()[id] || null; }
  function roomLevel(id) { return Math.max(0, (G_().rooms || {})[id] || 0); }
  function roomCap(id) { var r = roomDef(id); return r ? r.levels.length : 0; }

  /* The gate, always asked of the one authority. If legacy.js has not defined
     it (it is declared in the House region of the monolith) we fall back to the
     room's own tier rather than inventing a second rule. */
  function rungGate(id, want) {
    if (typeof window.roomRungGate === 'function') return window.roomRungGate(id, want);
    return canBuildRoom(id);
  }

  // 'locked' | 'unbuilt' | 'built' | 'max' — the four states §5 names.
  function roomState(id) {
    var lv = roomLevel(id);
    if (lv >= roomCap(id) && roomCap(id) > 0) return 'max';
    if (lv > 0) return 'built';
    return canBuildRoom(id).ok ? 'unbuilt' : 'locked';
  }

  function fmtKey(k, v) {
    if (KEY_FLAT[k]) return '+' + v;
    return '+' + Math.round(v * 100) + '%';
  }
  // Every {key,value} a rung grants, headline first then its secondary map.
  function rungEffects(rung) {
    if (!rung) return [];
    var out = [];
    if (rung.bk) out.push({ key: rung.bk, value: rung.bv || 0 });
    if (rung.bx) Object.keys(rung.bx).forEach(function (k) { out.push({ key: k, value: rung.bx[k] }); });
    return out;
  }

  function costTriples(cost) {
    return Object.keys(cost || {}).map(function (k) {
      var h = heldOf(k);
      return {
        id: k,
        need: cost[k],
        have: h.have,
        known: h.known,
        label: k === 'gold' ? 'Gold' : ((window.ITEMS && window.ITEMS[k] && window.ITEMS[k].n) || k)
      };
    });
  }

  /* ── THE DESCRIPTOR (spec §5 rule 6) ──────────────────────────────────
     A pure function of live state: no DOM is touched, nothing is rendered,
     and the whole thing is directly assertable in the smoke suite. The modal
     is built FROM this; the grid card reads the same fields. If the two ever
     disagree it is because one of them stopped calling this. */
  function roomDescriptor(id) {
    var r = roomDef(id);
    if (!r) return null;
    var meta = ROOM_META[id] || {};
    var lv = roomLevel(id), cap = roomCap(id), state = roomState(id);
    var minTier = roomMinTier(id);
    var tdef = TIERS[minTier];
    var cur = lv > 0 ? r.levels[lv - 1] : null;
    var nextRung = lv < cap ? r.levels[lv] : null;
    var gate = nextRung ? rungGate(id, lv + 1) : { ok: true };
    var missing = nextRung ? costAffordable(nextRung.cost) : [];

    // what it does RIGHT NOW — never a promise
    var now = rungEffects(cur).map(function (e) {
      return { label: KEY_LABEL[e.key] || e.key, value: fmtKey(e.key, e.value) };
    });
    var gatedSkill = null;
    Object.keys(WORKBENCH).forEach(function (s) { if (WORKBENCH[s] === id && !UNGATED[s]) gatedSkill = s; });
    if (gatedSkill) now.push({ label: 'Gates', value: gatedSkill.charAt(0).toUpperCase() + gatedSkill.slice(1) });

    var ladder = r.levels.map(function (rung, i) {
      var level = i + 1;
      var g = rungGate(id, level);
      return {
        level: level,
        name: rung.nm || ('Level ' + level),
        effects: rung.bonus || '',
        // A rung may declare a payload that is specced but deliberately NOT
        // shipped yet (Library L4/L5's Rested XP, pending the b228 rework).
        // Stated on the rung rather than silently omitted OR falsely promised.
        reserved: rung.resv || null,
        cost: costTriples(rung.cost),
        owned: level <= lv,
        next: level === lv + 1,
        locked: level > lv && !g.ok,
        gateReason: g.ok ? null : g.reason
      };
    });

    return {
      id: id,
      pillar: 'homestead',
      title: r.name,
      kicker: (tdef ? tdef.name : '') + ' · Tier ' + (minTier + 1) + ' room',
      flavour: meta.flavour || r.desc || '',
      theme: meta.theme || 'hearth',
      state: state,
      level: lv,
      cap: cap,
      lockReason: state === 'locked' ? canBuildRoom(id).reason : null,
      currentName: cur ? (cur.nm || ('Level ' + lv)) : null,
      currentBonus: cur ? cur.bonus : null,
      now: now,
      ladder: ladder,
      next: nextRung
        ? { level: lv + 1, name: nextRung.nm || ('Level ' + (lv + 1)), bonus: nextRung.bonus,
            gated: !gate.ok, gateReason: gate.ok ? null : gate.reason,
            affordable: gate.ok && !missing.length,
            missing: missing }
        : null,
      go: meta.go || null
    };
  }

  // ── the room scenes ─────────────────────────────────────────────────
  /* Deliberately built from the SAME svg classes the castle interiors use
     (`hrcs-wall-2`, `hrcs-floor`, `hrcs-furn`, `hrcs-lit`, `hrcs-rim2`), which
     are global and token-driven in clan-seat.css. Reusing them is not laziness:
     it is the only way the two pillars stay visually identical as the theme
     tokens move, and it means zero new colours enter the game. Inside a room
     the WALL is the lighter surface catching the fire and the furniture is the
     silhouette — the inversion the castle agent had to discover by looking. */
  var RW = 620, RH = 190, RF = 152;

  /* Coursed masonry on the back wall. Offsetting alternate rows is the whole
     trick — a plain grid reads as graph paper, staggered joints read as stone. */
  function courses(rows, h0) {
    var s = '', h = (h0 || RF) / rows, i = 0, y;
    for (y = h; y < (h0 || RF) - 1; y += h, i++) {
      s += '<path d="M0,' + y.toFixed(1) + ' H' + RW + '"/>';
      for (var x = (i % 2 ? 0 : 46); x < RW; x += 92) {
        s += '<path d="M' + x + ',' + y.toFixed(1) + ' v' + h.toFixed(1) + '"/>';
      }
    }
    return '<g class="hrcs-mortar">' + s + '</g>';
  }
  function planks(rows) {
    var s = '', h = RF / rows, y;
    for (y = h; y < RF - 1; y += h) s += '<path d="M0,' + y.toFixed(1) + ' H' + RW + '"/>';
    return '<g class="hrcs-mortar">' + s + '</g>';
  }
  /* A light SOURCE, placed where the room's fire actually is. The first cut
     used one huge centred radial for every room, which washed the middle of
     every scene into an orange smear and told you nothing about the place.
     A hearth lights the left of a forge; a candle lights one desk. */
  function glow(cx, cy, r, hot) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + r + '" ry="' + Math.round(r * 0.72) +
      '" fill="url(#' + (hot ? 'hrcsRoomHot' : 'hrcsRoomFire') + ')"/>';
  }
  function beams() {   // roof timbers — the ceiling every interior shares
    return '<g class="hrcs-furn"><rect x="0" y="0" width="620" height="11"/>' +
      '<rect x="72" y="0" width="13" height="26"/><rect x="236" y="0" width="13" height="26"/>' +
      '<rect x="384" y="0" width="13" height="26"/><rect x="540" y="0" width="13" height="26"/></g>';
  }

  var SCENES = {
    /* KITCHEN — a hooded hearth with a pot on a crane, and a dresser of jars. */
    kitchen: {
      wall: 'stone',
      lights: [[228, 122, 132, 1]],
      art:
        beams() +
        '<g class="hrcs-furn"><path d="M150,152 v-96 h156 v96 z"/><path d="M138,56 h180 l-20,-30 h-140 z"/>' +
        '<rect x="146" y="50" width="164" height="9"/></g>' +
        '<g class="hrcs-wall-2"><path d="M170,152 v-70 h116 v70 z"/></g>' +
        '{L0}' +
        '<g class="hrcs-lit"><path d="M186,152 h84 l-12,-30 a30,30 0 0 0 -60,0 z"/></g>' +
        '<g class="hrcs-furn"><path d="M198,42 h4 v46 h-4 z"/><path d="M198,42 h44 v4 h-44 z"/>' +
        '<path d="M222,60 h40 v26 a20,20 0 0 1 -40,0 z"/><path d="M216,56 h52 v6 h-52 z"/>' +
        '<path d="M240,46 v14"/></g>' +
        // dresser + jars, right
        '<g class="hrcs-furn"><path d="M384,152 v-72 h192 v72 z"/></g>' +
        '<g class="hrcs-wall-2"><path d="M394,146 v-58 h172 v58 z"/></g>' +
        '<g class="hrcs-furn"><path d="M394,112 h172 v5 h-172 z"/>' +
        '<circle cx="422" cy="100" r="10"/><circle cx="452" cy="100" r="10"/><circle cx="482" cy="100" r="10"/>' +
        '<rect x="512" y="90" width="18" height="22"/><rect x="538" y="94" width="16" height="18"/>' +
        '<rect x="406" y="124" width="60" height="18"/><rect x="478" y="124" width="80" height="18"/></g>'
    },
    /* GARDEN — the one room that is outdoors: beds, cloches, a low sun. */
    garden: {
      wall: 'none',
      lights: [[310, 40, 300, 0]],
      art:
        '<rect class="hrcs-wall-2" x="0" y="0" width="620" height="96"/>' +
        '{L0}' +
        // hedge line
        '<g class="hrcs-furn"><path d="M0,96 h620 v8 h-620 z"/>' +
        '<circle cx="40" cy="94" r="20"/><circle cx="92" cy="90" r="24"/><circle cx="148" cy="94" r="20"/>' +
        '<circle cx="472" cy="94" r="20"/><circle cx="528" cy="90" r="24"/><circle cx="580" cy="94" r="20"/></g>' +
        // three raised beds
        '<g class="hrcs-furn"><path d="M40,152 h164 v-22 h-164 z"/><path d="M228,152 h164 v-22 h-164 z"/>' +
        '<path d="M416,152 h164 v-22 h-164 z"/></g>' +
        '<g class="hrcs-lit">' + [[74,24],[110,32],[146,24],[176,18],[262,30],[298,22],[334,30],[364,18],[450,24],[486,32],[522,24],[552,18]].map(function(p){return '<rect x="'+(p[0]-2)+'" y="'+(130-p[1])+'" width="5" height="'+p[1]+'"/>';}).join('') + '</g>' +
        // watering can, foreground right
        '<g class="hrcs-furn"><path d="M582,152 v-30 h26 v30 z"/><path d="M576,126 l-16,-12 v8 l10,8 z"/></g>'
    },
    /* WORKSHOP — a plank wall, a long bench, a vice, a saw, stacked timber. */
    workshop: {
      wall: 'timber',
      lights: [[300, 96, 118, 0]],
      art:
        beams() +
        // window throwing the light
        '<g class="hrcs-furn"><path d="M266,88 v-56 h68 v56 z"/></g>' +
        '<g class="hrcs-lit"><path d="M272,82 v-44 h56 v44 z"/></g>' +
        '{L0}' +
        // saw + squares on the wall
        '<g class="hrcs-furn"><path d="M108,34 l92,-20 l5,15 l-92,20 z"/><path d="M108,49 l92,-20 l0,7 l-92,20 z"/>' +
        '<path d="M424,26 h8 v58 h-8 z"/><path d="M424,76 h52 v8 h-52 z"/></g>' +
        // the bench
        '<g class="hrcs-furn"><path d="M96,110 h428 v14 h-428 z"/>' +
        '<rect x="112" y="124" width="16" height="28"/><rect x="492" y="124" width="16" height="28"/>' +
        '<path d="M120,138 h380 v7 h-380 z"/></g>' +
        // vice on the near edge + shavings
        '<g class="hrcs-furn"><path d="M150,110 v-16 h34 v16 z"/><path d="M156,94 h22 v-8 h-22 z"/>' +
        '<path d="M356,110 v-9 h96 v9 z"/><path d="M368,101 v-7 h72 v7 z"/></g>' +
        // stacked planks under the bench
        '<g class="hrcs-furn"><rect x="212" y="128" width="120" height="7"/><rect x="218" y="138" width="120" height="7"/></g>'
    },
    /* CELLAR — cold stone, a rack of casks, one lantern. */
    cellar: {
      wall: 'stone',
      lights: [[310, 62, 96, 0]],
      art:
        // vaulted arches
        '<g class="hrcs-furn"><path d="M40,152 v-56 a90,80 0 0 1 180,0 v56 h-14 v-56 a76,68 0 0 0 -152,0 v56 z"/>' +
        '<path d="M400,152 v-56 a90,80 0 0 1 180,0 v56 h-14 v-56 a76,68 0 0 0 -152,0 v56 z"/></g>' +
        // hanging lantern
        '<g class="hrcs-furn"><path d="M308,0 h4 v40 h-4 z"/><path d="M294,40 h32 v26 h-32 z"/></g>' +
        '{L0}' +
        '<g class="hrcs-lit"><rect x="299" y="45" width="22" height="17"/></g>' +
        // the cask rack
        '<g class="hrcs-furn"><path d="M64,152 h492 v-10 h-492 z"/>' +
        '<ellipse cx="140" cy="116" rx="34" ry="26"/><ellipse cx="228" cy="116" rx="34" ry="26"/>' +
        '<ellipse cx="392" cy="116" rx="34" ry="26"/><ellipse cx="480" cy="116" rx="34" ry="26"/>' +
        '<ellipse cx="310" cy="128" rx="28" ry="22"/></g>' +
        '<g class="hrcs-wall-2"><ellipse cx="140" cy="116" rx="12" ry="10"/><ellipse cx="228" cy="116" rx="12" ry="10"/>' +
        '<ellipse cx="392" cy="116" rx="12" ry="10"/><ellipse cx="480" cy="116" rx="12" ry="10"/>' +
        '<ellipse cx="310" cy="128" rx="10" ry="8"/></g>' +
        // bottles on a shelf
        '<g class="hrcs-furn"><path d="M96,74 h108 v6 h-108 z"/>' +
        '<rect x="106" y="52" width="11" height="22"/><rect x="126" y="56" width="11" height="18"/>' +
        '<rect x="146" y="50" width="11" height="24"/><rect x="166" y="56" width="11" height="18"/></g>'
    },
    /* FORGE — the fire is the subject: a hooded forge, bellows, anvil, quench. */
    forge: {
      wall: 'stone',
      lights: [[176, 106, 146, 1]],
      art:
        beams() +
        // the forge body + hood
        '<g class="hrcs-furn"><path d="M86,152 v-84 h180 v84 z"/><path d="M74,68 h204 l-26,-40 h-152 z"/>' +
        '<rect x="164" y="0" width="26" height="30"/></g>' +
        '<g class="hrcs-wall-2"><path d="M112,152 v-62 h128 v62 z"/></g>' +
        '{L0}' +
        '<g class="hrcs-lit"><path d="M124,152 h104 v-34 a52,34 0 0 0 -104,0 z"/></g>' +
        // bellows behind
        '<g class="hrcs-furn"><path d="M286,120 l-58,-24 v58 z"/><path d="M228,110 h-40 v10 h40 z"/></g>' +
        // the anvil, centre-right, on its stump
        '<g class="hrcs-furn"><path d="M356,110 h96 l-10,14 h-18 v10 h34 l-16,12 h-96 l-16,-12 h34 v-10 h-18 z"/>' +
        '<path d="M372,146 h64 v6 h-64 z"/><path d="M452,110 l30,10 l-30,4 z"/></g>' +
        // quench tub + tongs
        '<g class="hrcs-furn"><path d="M508,152 v-38 h74 v38 z"/><path d="M500,114 h90 v8 h-90 z"/>' +
        '<path d="M498,96 l46,-30 l5,8 l-46,30 z"/></g>' +
        '<g class="hrcs-lit"><rect x="516" y="118" width="58" height="7"/></g>'
    },
    /* LIBRARY — shelves, a reading desk, one candle. The quiet room. */
    library: {
      wall: 'timber',
      lights: [[310, 104, 92, 0]],
      art:
        beams() +
        // two tall bookcases
        '<g class="hrcs-furn"><path d="M28,152 v-130 h182 v130 z"/><path d="M410,152 v-130 h182 v130 z"/></g>' +
        '<g class="hrcs-wall-2"><path d="M40,146 v-118 h158 v118 z"/><path d="M422,146 v-118 h158 v118 z"/></g>' +
        '<g class="hrcs-furn"><path d="M40,64 h158 v7 h-158 z"/><path d="M40,104 h158 v7 h-158 z"/>' +
        '<path d="M422,64 h158 v7 h-158 z"/><path d="M422,104 h158 v7 h-158 z"/></g>' +
        // books
        '<g class="hrcs-lit"><rect x="52" y="38" width="12" height="26"/><rect x="68" y="42" width="10" height="22"/>' +
        '<rect x="82" y="36" width="13" height="28"/><rect x="99" y="44" width="10" height="20"/>' +
        '<rect x="118" y="40" width="12" height="24"/><rect x="136" y="46" width="9" height="18"/>' +
        '<rect x="52" y="80" width="11" height="24"/><rect x="67" y="84" width="12" height="20"/>' +
        '<rect x="83" y="78" width="10" height="26"/><rect x="99" y="86" width="13" height="18"/>' +
        '<rect x="434" y="38" width="12" height="26"/><rect x="450" y="44" width="10" height="20"/>' +
        '<rect x="464" y="36" width="13" height="28"/><rect x="481" y="42" width="10" height="22"/>' +
        '<rect x="434" y="82" width="12" height="22"/><rect x="450" y="78" width="11" height="26"/></g>' +
        '{L0}' +
        // the desk, an open book, a candle
        '<g class="hrcs-furn"><path d="M240,124 h140 v10 h-140 z"/>' +
        '<rect x="250" y="134" width="12" height="18"/><rect x="358" y="134" width="12" height="18"/></g>' +
        '<g class="hrcs-lit"><path d="M270,124 l38,-8 v8 z"/><path d="M312,116 l38,8 h-38 z"/></g>' +
        '<g class="hrcs-furn"><rect x="358" y="98" width="7" height="26"/></g>' +
        '<g class="hrcs-lit"><ellipse cx="361" cy="94" rx="6" ry="9"/></g>'
    },
    /* SHRINE — an altar under a window, two standing candles, an offering bowl. */
    shrine: {
      wall: 'stone',
      lights: [[310, 74, 116, 0]],
      art:
        // arched window above the altar
        '<g class="hrcs-furn"><path d="M262,96 v-56 a48,48 0 0 1 96,0 v56 z"/></g>' +
        '<g class="hrcs-lit"><path d="M272,90 v-50 a38,38 0 0 1 76,0 v50 z"/></g>' +
        '{L0}' +
        '<g class="hrcs-furn"><path d="M306,40 h8 v50 h-8 z"/><path d="M282,60 h56 v8 h-56 z"/></g>' +
        // the altar
        '<g class="hrcs-furn"><path d="M232,152 v-42 h156 v42 z"/><path d="M220,110 h180 v11 h-180 z"/>' +
        '<path d="M248,152 h124 v-6 h-124 z"/></g>' +
        // offering bowl on top
        '<g class="hrcs-furn"><path d="M288,110 h44 v-8 a22,10 0 0 0 -44,0 z"/></g>' +
        '<g class="hrcs-lit"><ellipse cx="310" cy="101" rx="18" ry="6"/></g>' +
        // two standing candles
        '<g class="hrcs-furn"><path d="M154,152 h34 v-8 h-12 v-52 h-10 v52 h-12 z"/>' +
        '<path d="M432,152 h34 v-8 h-12 v-52 h-10 v52 h-12 z"/></g>' +
        '<g class="hrcs-lit"><ellipse cx="171" cy="86" rx="7" ry="10"/><ellipse cx="449" cy="86" rx="7" ry="10"/></g>'
    },
    /* TROPHY ROOM — mounted heads, banners, a weapon rack. What you killed. */
    trophy: {
      wall: 'stone',
      lights: [[310, 118, 150, 0]],
      art:
        beams() +
        // banners
        '<g class="hrcs-furn"><rect x="86" y="14" width="46" height="6"/><path d="M92,20 h34 v66 l-17,-13 l-17,13 z"/>' +
        '<rect x="488" y="14" width="46" height="6"/><path d="M494,20 h34 v66 l-17,-13 l-17,13 z"/></g>' +
        // three mounted heads on shields
        '<g class="hrcs-furn"><path d="M186,34 h68 v42 a34,34 0 0 1 -68,0 z"/>' +
        '<path d="M366,34 h68 v42 a34,34 0 0 1 -68,0 z"/>' +
        '<path d="M276,20 h68 v46 a34,34 0 0 1 -68,0 z"/></g>' +
        '<g class="hrcs-wall-2"><path d="M204,60 l16,-18 l16,18 l-6,20 h-20 z"/>' +
        '<path d="M384,60 l16,-18 l16,18 l-6,20 h-20 z"/>' +
        '<path d="M294,48 l16,-18 l16,18 l-6,22 h-20 z"/></g>' +
        '<g class="hrcs-lit"><circle cx="213" cy="62" r="4"/><circle cx="227" cy="62" r="4"/>' +
        '<circle cx="393" cy="62" r="4"/><circle cx="407" cy="62" r="4"/>' +
        '<circle cx="303" cy="50" r="4"/><circle cx="317" cy="50" r="4"/></g>' +
        '{L0}' +
        // weapon rack along the floor
        '<g class="hrcs-furn"><path d="M60,152 h500 v-10 h-500 z"/>' +
        '<path d="M120,142 v-40 h7 v40 z"/><path d="M112,102 l11,-18 l11,18 z"/>' +
        '<path d="M180,142 v-46 h7 v46 z"/><path d="M172,96 h23 v-9 h-23 z"/>' +
        '<path d="M446,142 v-42 h7 v42 z"/><path d="M438,100 l11,-16 l11,16 z"/>' +
        '<path d="M506,142 v-38 h7 v38 z"/><path d="M498,104 h23 v-10 h-23 z"/></g>'
    }
  };

  function roomScene(id, lit) {
    var s = SCENES[id] || SCENES.kitchen;
    var art = s.art;
    (s.lights || []).forEach(function (L, i) {
      art = art.replace('{L' + i + '}', lit ? glow(L[0], L[1], L[2], L[3]) : '');
    });
    art = art.replace(/\{L\d\}/g, '');
    var wall = s.wall === 'none' ? ''
      : '<rect class="hrcs-wall-2" x="0" y="0" width="' + RW + '" height="' + RF + '"/>' +
        (s.wall === 'timber' ? planks(7) : courses(5));
    return '<svg class="hr-room-svg" viewBox="0 0 ' + RW + ' ' + RH + '" preserveAspectRatio="xMidYMax slice" ' +
      'aria-hidden="true" focusable="false"><defs>' +
      '<radialGradient id="hrcsRoomFire" cx="50%" cy="50%" r="50%">' +
      '<stop class="hrcs-f0" offset="0%"/><stop class="hrcs-f1" offset="100%"/></radialGradient>' +
      '<radialGradient id="hrcsRoomHot" cx="50%" cy="50%" r="50%">' +
      '<stop class="hrcs-f2" offset="0%"/><stop class="hrcs-f1" offset="100%"/></radialGradient></defs>' +
      wall + art +
      '<rect class="hrcs-floor" x="0" y="' + RF + '" width="' + RW + '" height="' + (RH - RF) + '"/>' +
      '<path class="hrcs-rim2" d="M0,' + RF + ' H' + RW + '"/></svg>';
  }

  // ── the modal ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Descriptor → the seam's section list. This is the ONLY place that knows
     the RoomModal's vocabulary, and it never asks the renderer for anything
     pillar-specific — `theme` is a class suffix and the rest is the published
     `note | rows | ladder | actions` grammar, unchanged. */
  function modalDescriptor(id) {
    var d = roomDescriptor(id);
    if (!d) return null;
    var sections = [];

    sections.push({ kind: 'note', html: esc(d.flavour) });

    if (d.state === 'locked') {
      sections.push({ kind: 'note', html: '<b>Not yet yours.</b> ' + esc(d.lockReason) +
        ' — the property ladder on this screen is what opens it.' });
    } else if (d.level === 0) {
      sections.push({ kind: 'note', html: 'You have not built this room yet. The first rung is below.' });
    } else {
      sections.push({
        kind: 'rows',
        title: 'Yours &mdash; ' + esc(d.currentName) + ', level ' + d.level + ' of ' + d.cap,
        rows: d.now.map(function (n) {
          return { name: esc(n.label), right: '<span class="hr-cs-val"><b>' + esc(n.value) + '</b></span>' };
        }),
        empty: 'This rung grants no passive bonus.'
      });
    }

    /* The FULL ladder, owned rungs included (spec §5 rule 3). A ladder that
       shows only the next rung is a shop row, which is the thing this screen
       stopped being. `effect` is injected as raw HTML by the seam, which is
       how the owned marker gets in without the renderer needing to know what
       "owned" means. `why` is escaped, so gate reasons go there. */
    sections.push({
      kind: 'ladder',
      title: 'The ladder',
      rows: d.ladder.map(function (row) {
        var nm = '<span class="hh-rung-nm">' + esc(row.name) + '</span>';
        var mark = row.owned ? '<span class="hh-rung-owned">Built</span>' : '';
        return {
          level: row.level,
          effect: nm + mark + '<span class="hh-rung-eff">' + esc(row.effects) + '</span>' +
            (row.reserved ? '<span class="hh-rung-resv">' + esc(row.reserved) + '</span>' : ''),
          // An owned rung shows no price — you already paid it.
          costs: row.owned ? null : row.cost.map(function (c) {
            return { have: c.have, known: c.known, need: c.need, label: c.label };
          }),
          why: row.gateReason || null,
          locked: row.locked,
          next: row.next && !row.locked
        };
      }),
      note: d.state === 'max'
        ? 'Every rung of this room is built.'
        : 'Rungs 4 and 5 need a bigger property — the tier ladder at the top of this screen is what opens them.'
    });

    var buttons = [];
    if (d.next) {
      var label = (d.level === 0 ? 'Build ' : 'Upgrade to ') + d.next.name;
      if (d.next.gated) {
        buttons.push({ label: label, action: 'noop', disabled: true, why: d.next.gateReason });
      } else if (!d.next.affordable) {
        var short = d.next.missing.map(function (m) {
          var n = (window.ITEMS && window.ITEMS[m.id] && window.ITEMS[m.id].n) || m.id;
          if (m.known === false) return m.id + ' balance not loaded yet';
          return m.id === 'gold' ? ((m.need - m.have) + ' gold') : (n + ' ×' + (m.need - m.have));
        }).join(', ');
        // b213's lesson as a rule: name what is short, never "not enough".
        buttons.push({ label: label, action: 'noop', disabled: true, why: 'Missing ' + short });
      } else {
        buttons.push({ label: label, action: 'build', data: { room: id }, primary: true });
      }
    }
    if (d.go) buttons.push({ label: d.go.label, action: 'go', data: { room: id } });
    if (buttons.length) sections.push({ kind: 'actions', buttons: buttons });

    return {
      id: id,
      title: d.title,
      subtitle: esc(d.kicker) + (d.level > 0 ? ' &middot; <b>Level ' + d.level + ' of ' + d.cap + '</b>' : ''),
      theme: d.theme,
      scene: roomScene(id, d.level > 0),
      sections: sections,
      onAction: function (name, node) {
        if (name === 'build') {
          if (typeof window.upgradeRoom === 'function') window.upgradeRoom(id);
          // upgradeRoom repaints the grid and refreshes this modal itself.
        } else if (name === 'go') {
          goToRoomSkill(id);
        }
      }
    };
  }

  /* Arrival uses ONLY the navigation the game already has — the same idiom
     quest-nav.js established: write the artisan lane BEFORE the detail opens
     so the right lane paints on the first pass instead of flashing the
     default one. */
  function goToRoomSkill(id) {
    var go = (ROOM_META[id] || {}).go;
    if (!go) return false;
    try {
      if (window.HearthriseRoomModal) window.HearthriseRoomModal.close();
      if (go.lane && go.skill && window._artisanCat) window._artisanCat[go.skill] = go.lane;
      if (typeof window.showTab === 'function') window.showTab(go.tab);
      if (go.skill && typeof window.openSkillDetail === 'function') window.openSkillDetail(go.skill);
    } catch (e) { return false; }
    return true;
  }

  function openRoom(id) {
    if (!window.HearthriseRoomModal || !roomDef(id)) return null;
    // A BUILD FUNCTION, not a built descriptor — so the modal re-derives from
    // live state after every action instead of going stale the way the House
    // rows did (which is the whole bug this wave is here to close).
    return window.HearthriseRoomModal.open(function () { return modalDescriptor(id); });
  }

  // ── the grid ────────────────────────────────────────────────────────
  function roomThumb(id, lit) {
    var path = (window._roomIcon || {})[id];
    if (path) return '<img src="' + path + '" alt="" loading="lazy" class="hh-room-img"/>';
    return roomScene(id, lit);
  }

  function renderRoomGrid(host) {
    if (!host) return;
    ensureState();
    var ids = Object.keys(ROOMS_());
    host.innerHTML = '<div class="hh-rooms">' + ids.map(function (id) {
      var d = roomDescriptor(id);
      if (!d) return '';
      var owned = d.level > 0;
      var cls = owned ? (d.state === 'max' ? 'is-owned is-max' : 'is-owned')
                      : (d.state === 'locked' ? 'is-locked' : 'is-open');
      /* THE OWNERSHIP LINE. This is the acceptance test in one string: open
         the House screen and know, without reading, that the Forge is yours
         and at what level. So the badge is a level or the word that replaces
         one, and it is the highest-contrast thing on the card. */
      var badge = owned
        ? '<span class="hh-room-badge">Lv ' + d.level + '<i>/' + d.cap + '</i></span>'
        : (d.state === 'locked' ? '<span class="hh-room-badge is-lock" aria-hidden="true">&#128274;</span>' : '');
      var line = owned
        ? '<span class="hh-room-rung">' + esc(d.currentName) + '</span>' +
          '<span class="hh-room-eff">' + esc(d.currentBonus || '') + '</span>'
        : (d.state === 'locked'
            ? '<span class="hh-room-rung is-lock">' + esc(d.lockReason || 'Locked') + '</span>'
            : '<span class="hh-room-rung is-open">Not built</span>' +
              '<span class="hh-room-eff">' + esc((d.ladder[0] && d.ladder[0].effects) || '') + '</span>');
      /* THE COST, IN WORDS (Tyler: "it should be bigger and either have
         visible text or hover text"). The card carries the next rung's price
         as named text — "11,000 Gold · 30 Willow Plank" — never an icon and a
         bare number, with each part coloured met/short and carrying its own
         hover naming the item and what you hold. The modal one tap away has
         the full have/need ledger. Nothing in this screen is purchasable
         without the price being readable. */
      var costLine = '';
      if (d.next && !d.next.gated) {
        var rung = d.ladder[d.next.level - 1];
        costLine = '<span class="hh-room-cost">' + rung.cost.map(function (c) {
          return '<span class="hh-cost ' + (c.known === false ? '' : (c.have >= c.need ? 'is-met' : 'is-short')) + '" title="' +
            esc(c.need.toLocaleString() + ' ' + c.label + ' — you have '
              + (c.known === false ? 'no figure yet (waiting for the server)' : c.have.toLocaleString())) + '">' +
            '<b>' + esc(c.need.toLocaleString()) + '</b> ' + esc(c.label) + '</span>';
        }).join('<i aria-hidden="true">&middot;</i>') + '</span>';
      }
      /* The footer answers "what's next", and only when that is a DIFFERENT
         fact from the line above it. A locked room already states its lock in
         the line, and printing the same sentence twice on one card (which the
         first cut did) reads as a rendering bug rather than as emphasis. */
      var foot;
      if (d.state === 'locked') foot = '';
      else if (!d.next) foot = 'Fully built';
      else if (d.next.gated) foot = 'Next: ' + esc(d.next.name) + ' &mdash; needs ' +
        esc(String(d.next.gateReason || '').replace(/^Requires /, ''));
      else foot = 'Next: ' + esc(d.next.name) + (d.next.affordable ? ' &mdash; ready' : '');
      return '<button type="button" class="hh-room ' + cls + '" data-room="' + esc(id) + '" ' +
        'aria-label="' + esc(d.title + ' — ' + (owned ? 'level ' + d.level : d.state === 'locked' ? 'locked' : 'not built')) + '">' +
        '<span class="hh-room-art">' + roomThumb(id, owned) + '</span>' +
        '<span class="hh-room-txt">' +
          '<span class="hh-room-top"><span class="hh-room-nm">' + esc(d.title) + '</span>' + badge + '</span>' +
          line +
          (foot ? '<span class="hh-room-foot' + (d.next && d.next.affordable && !d.next.gated ? ' is-ready' : '') + '">' + foot + '</span>' : '') +
          costLine +
        '</span></button>';
    }).join('') + '</div>';

    host.querySelectorAll('.hh-room').forEach(function (b) {
      b.addEventListener('click', function () { openRoom(b.getAttribute('data-room')); });
    });
  }

  /* ── THE CELLAR, finally doing something (spec §3.4) ──────────────────
     `registerBuffScaler` is the b222 seam, built explicitly so a SECOND
     consumer registers instead of editing call sites — the castle Tavern was
     the first. Named registration is what makes this idempotent: a boot retry
     re-registering cannot compound a player's buff durations, which a bare
     call-site multiply would. Duration only, never magnitude (H7) — the Cellar
     lengthens a buff, the Tavern's Hearth strengthens it, and keeping those in
     separate lanes is what stops the two pillars multiplying into a second
     character. */
  function cellarScale() {
    var b = (typeof window.getBonus === 'function') ? (window.getBonus('buffDuration') || 0) : 0;
    return { duration: 1 + Math.max(0, b) };
  }
  function registerCellar() {
    if (typeof window.registerBuffScaler !== 'function') return false;
    try { window.registerBuffScaler('homestead.cellar', cellarScale); return true; } catch (e) { return false; }
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
    try { registerCellar(); } catch (e) {}
    try { renderCard(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  /* registerBuffScaler is defined far down legacy.js, well below this file's
     script tag, so the boot above can lose the race on a cold parse. One
     immediate attempt plus this one covers both orders; registration is by
     NAME, so running twice replaces rather than compounds. */
  registerCellar();

  window.HearthriseHomestead = {
    TIERS: TIERS,
    WORKBENCH: WORKBENCH,
    UNGATED: UNGATED,
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
    renderCard: renderCard,
    // b227 — the rooms surface. `roomDescriptor` is the pure one: no DOM in
    // the process, so the suite asserts the ladder rather than the HTML.
    ROOM_META: ROOM_META,
    roomState: roomState,
    roomLevel: roomLevel,
    roomCap: roomCap,
    roomDescriptor: roomDescriptor,
    modalDescriptor: modalDescriptor,
    roomScene: roomScene,
    renderRoomGrid: renderRoomGrid,
    openRoom: openRoom,
    goToRoomSkill: goToRoomSkill,
    cellarScale: cellarScale
  };
})();
