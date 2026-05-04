// ============================================================
// src/features/inv-context-menu.js
//
// Batch E (b140) — #23 Right-click context menu for inventory tiles.
//
// Background: src/item-ux.js already wires right-click on stackable
// tiles (qty >= 2) to a quantity slider, and tap-to-open-detail. But
// right-click on singletons (equipped weapons, single armor pieces)
// did nothing. Players expect a context menu with Use/Equip/Sell/etc.
//
// What this adds:
//   • Right-click any inventory tile or paper-doll slot → context menu
//   • Long-press on touch → same context menu (replaces old long-press
//     to slider; players can still get to the slider via "Sell N…")
//   • Menu options are item-type-aware:
//       - Equippable      → Equip / Unequip / Inspect / Sell 1 / Sell N…
//       - Food (heals)    → Eat / Set auto-eat / Inspect / Sell 1 / Sell N…
//       - Bones (buryXp)  → Bury / Inspect / Sell 1 / Sell N…
//       - Stackable other → Inspect / Sell 1 / Sell N…
//       - Single junk     → Inspect / Sell 1
//   • Closes on outside-click, Escape, or selection.
//
// NOT in scope:
//   • Drop action (we don't surface destroy-an-item on purpose; players
//     can sell for full vendor price instead — same effect, no
//     accidental loss).
//   • Use as crafting input — that's the artisan flow, separate.
//
// Loads as a CLASSIC <script> after item-ux.js so we can reuse its
// helpers (getItemIdFromTile / openSlider). Falls back gracefully if
// item-ux didn't load.
// ============================================================

(function(){
  'use strict';

  // ── Menu element (single instance, reused) ────────────────
  var menu = document.createElement('div');
  menu.id = 'inv-ctx-menu';
  menu.className = 'inv-ctx-menu';
  menu.style.cssText =
    'display:none;position:fixed;z-index:99985;'+
    'background:rgba(28,22,18,.97);border:1px solid var(--accent,#5fcc7c);'+
    'border-radius:8px;padding:4px;min-width:180px;'+
    'box-shadow:0 8px 24px rgba(0,0,0,.4);'+
    'font-family:inherit;font-size:13px;color:#ede4cf';
  document.body.appendChild(menu);

  function hideMenu(){
    menu.style.display = 'none';
    menu.innerHTML = '';
  }

  function showMenu(x, y){
    // Position below+right of cursor by default. Flip if it would go
    // off the right or bottom edge.
    menu.style.display = 'block';
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var px = x, py = y;
    if(px + w + 8 > vw) px = vw - w - 8;
    if(py + h + 8 > vh) py = vh - h - 8;
    menu.style.left = Math.max(4, px) + 'px';
    menu.style.top  = Math.max(4, py) + 'px';
  }

  // ── Get item context from a clicked element ──────────────
  // Equipped paper-doll slots store the slot in data-slot; bag tiles
  // expose the item id in data-item-id or via the inline onclick attr.
  function ctxFromTile(tile){
    if(!tile) return null;
    // Paper-doll equipped slot
    var slotName = tile.getAttribute('data-slot');
    if(slotName){
      var equipped = (window.G && window.G.equipment) ? window.G.equipment[slotName] : null;
      if(equipped) return { itemId: equipped, slot: slotName, source: 'equipped' };
      return { itemId: null, slot: slotName, source: 'empty-slot' };
    }
    // Bag tile — try the same paths item-ux.js uses
    var id = tile.getAttribute('data-item-id');
    if(!id){
      var oc = tile.getAttribute('onclick') || '';
      var m = oc.match(/(?:invItemTap|onItemTap)\(['"]([^'"]+)['"]\)/);
      if(m) id = m[1];
    }
    if(!id) return null;
    return { itemId: id, slot: null, source: 'bag' };
  }

  // ── Build menu options for a given context ───────────────
  function buildOptions(ctx){
    var opts = [];
    var ITEMS = window.ITEMS || {};
    var G = window.G;
    if(!G) return opts;

    // Empty paper-doll slot
    if(ctx.source === 'empty-slot'){
      opts.push({ label: 'Empty slot — drag an item here to equip', disabled: true });
      return opts;
    }

    var id = ctx.itemId;
    var def = ITEMS[id];
    if(!def){
      opts.push({ label: 'Unknown item', disabled: true });
      return opts;
    }
    var qty = ctx.source === 'equipped' ? 1 : ((G.inventory && G.inventory[id]) | 0);
    var isStack = qty >= 2;
    var isEquippable = !!(def.type === 'weapon' || def.type === 'armor' || def.type === 'jewelry' || def.type === 'companion' || def.type === 'ammo' || def.slot);

    // ── Per-source actions ────────────────────────────────
    if(ctx.source === 'equipped'){
      opts.push({ label: '↩️  Unequip', action: function(){
        if(typeof window.unequip === 'function') window.unequip(ctx.slot);
        else if(typeof window.unequipSlotInv === 'function') window.unequipSlotInv(ctx.slot);
      }});
      opts.push({ label: 'ℹ️  Inspect', action: function(){
        if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
      }});
      return opts;
    }

    // Equippable items in the bag
    if(isEquippable){
      opts.push({ label: '⚔️  Equip', action: function(){
        if(typeof window.equipItem === 'function') window.equipItem(id);
        else if(typeof window.equipGear === 'function') window.equipGear(id);
      }});
    }

    // Food — Eat heals immediately, Set auto-eat sets it as the slotted food
    if(def.heals && def.heals > 0){
      opts.push({ label: '🍖  Eat (+' + def.heals + ' HP)', action: function(){
        if(typeof window.eatNow === 'function') window.eatNow(id);
        else if(typeof window.eatFood === 'function') window.eatFood(id);
        else {
          // Defensive fallback — heal directly + decrement
          G.playerHp = Math.min(G.playerMaxHp || 10, (G.playerHp || 0) + def.heals);
          if(typeof window.removeItem === 'function') window.removeItem(id, 1);
          if(typeof window.notify === 'function') window.notify('Ate ' + def.n, 'info');
        }
      }});
      opts.push({ label: '🥄  Set as auto-eat food', action: function(){
        if(window.HearthriseAuto && window.HearthriseAuto.setEat){
          window.HearthriseAuto.setEat({ enabled: true, foodId: id });
          if(typeof window.notify === 'function') window.notify('Auto-eat: ' + def.n, 'info');
        }
      }});
    }

    // Bones — bury for prayer XP
    if(def.buryXp && def.buryXp > 0){
      opts.push({ label: '🦴  Bury (+' + def.buryXp + ' Prayer XP)', action: function(){
        if(typeof window.buryBones === 'function') window.buryBones(id);
        else {
          G.skills = G.skills || {}; G.skills.prayer = (G.skills.prayer || 0) + def.buryXp;
          if(typeof window.removeItem === 'function') window.removeItem(id, 1);
          if(typeof window.notify === 'function') window.notify('Buried (+' + def.buryXp + ' Prayer XP)', 'info');
        }
      }});
    }

    // Always: Inspect, Sell 1
    opts.push({ label: 'ℹ️  Inspect', action: function(){
      if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
    }});

    // BoP items can't be sold — defensive check
    if(!def.bop){
      var price = def.v || 0;
      opts.push({ label: '🪙  Sell 1 (' + price.toLocaleString() + 'g)',
        disabled: qty < 1 || price <= 0,
        action: function(){
          if(qty < 1 || price <= 0) return;
          G.gold = (G.gold | 0) + price;
          if(typeof window.removeItem === 'function') window.removeItem(id, 1);
          if(typeof window.notify === 'function') window.notify('Sold ' + def.n + ' for ' + price + 'g', 'loot');
          if(typeof window.renderInvNew === 'function') setTimeout(window.renderInvNew, 0);
          else if(typeof window.renderInventory === 'function') setTimeout(window.renderInventory, 0);
          if(typeof window.updateTopbar === 'function') window.updateTopbar();
        }
      });
      // Sell N… defers to item-ux's qty slider for the actual UX
      if(isStack){
        opts.push({ label: '📊  Sell N…  (stack: ' + qty.toLocaleString() + ')', action: function(){
          // Find the slider opener — item-ux.js stashes it on the slider
          // overlay's "Sell" handler. The cleanest way is to dispatch a
          // synthetic contextmenu on the original tile, which item-ux
          // catches; but since we just suppressed our own handler, just
          // call the global if exposed.
          if(typeof window.openInvQtySlider === 'function') window.openInvQtySlider(id);
          // Otherwise open the full detail flyout — it has bulk sell.
          else if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
        }});
      }
    }

    return opts;
  }

  function renderMenu(opts){
    menu.innerHTML = opts.map(function(o, i){
      var dis = o.disabled ? ' style="opacity:.45;cursor:not-allowed"' : '';
      var cls = o.disabled ? 'inv-ctx-item disabled' : 'inv-ctx-item';
      return '<button class="' + cls + '" data-idx="' + i + '"' + dis +
        ' style="display:block;width:100%;text-align:left;background:transparent;border:0;color:inherit;'+
        'padding:7px 10px;border-radius:6px;cursor:pointer;font-size:13px">' + o.label + '</button>';
    }).join('');
    // Hover highlight
    Array.prototype.forEach.call(menu.querySelectorAll('.inv-ctx-item:not(.disabled)'), function(b){
      b.onmouseenter = function(){ b.style.background = 'rgba(95,204,124,0.15)'; };
      b.onmouseleave = function(){ b.style.background = 'transparent'; };
      b.onclick = function(e){
        e.stopPropagation();
        var idx = +b.getAttribute('data-idx');
        var opt = opts[idx];
        hideMenu();
        if(opt && !opt.disabled && typeof opt.action === 'function'){
          try { opt.action(); } catch(err){ console.error('[inv-ctx] action threw:', err); }
        }
      };
    });
  }

  // ── Wiring: contextmenu + long-press ──────────────────────
  // Both delegate to the same handler. We listen in CAPTURE phase so
  // we run BEFORE item-ux.js's contextmenu listener (which would open
  // the qty slider for stacks). Calling stopImmediatePropagation here
  // suppresses item-ux's handler and gives us full control.
  function onContextMenu(e){
    var tile = e.target.closest && e.target.closest('.invc-tile, .inv-item, .inv-slot, .item-slot, [data-item-id], .td-slot');
    if(!tile) return;
    var ctx = ctxFromTile(tile);
    if(!ctx) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var opts = buildOptions(ctx);
    if(!opts.length) return;
    renderMenu(opts);
    showMenu(e.clientX, e.clientY);
  }
  document.addEventListener('contextmenu', onContextMenu, true);

  var lpTimer = null;
  document.addEventListener('touchstart', function(e){
    var tile = e.target.closest && e.target.closest('.invc-tile, .inv-item, .inv-slot, .item-slot, [data-item-id], .td-slot');
    if(!tile) return;
    var t = e.touches && e.touches[0];
    if(!t) return;
    var x = t.clientX, y = t.clientY;
    if(lpTimer) clearTimeout(lpTimer);
    lpTimer = setTimeout(function(){
      lpTimer = null;
      var ctx = ctxFromTile(tile);
      if(!ctx) return;
      var opts = buildOptions(ctx);
      if(!opts.length) return;
      renderMenu(opts);
      showMenu(x, y);
    }, 500);
  }, { passive: true, capture: true });
  function clearLP(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; } }
  document.addEventListener('touchend',   clearLP, true);
  document.addEventListener('touchmove',  clearLP, true);
  document.addEventListener('touchcancel',clearLP, true);

  // Outside-click + Esc to close
  document.addEventListener('click', function(e){
    if(menu.style.display === 'none') return;
    if(e.target === menu || menu.contains(e.target)) return;
    hideMenu();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && menu.style.display !== 'none') hideMenu();
  });

  // ── Sell-junk helper exposed for the toolbar ──────────────
  // Selects every stackable trophy / mat / fish / log / ore / etc that
  // (a) has v > 0, (b) isn't a recipe scroll / blueprint / key / BoP,
  // (c) isn't a healing food (player wants to keep food), (d) value
  // per stack is below the threshold. Caller can confirm-then-sell.
  function selectJunk(threshold){
    var th = (typeof threshold === 'number') ? threshold : 50; // per-stack value cap
    if(!window.G || !window.G.inventory || !window.ITEMS) return [];
    var picks = [];
    Object.keys(window.G.inventory).forEach(function(id){
      var qty = window.G.inventory[id] | 0;
      if(qty <= 0) return;
      var def = window.ITEMS[id];
      if(!def) return;
      if(def.bop) return;                              // never sell BoP
      if(def.heals && def.heals > 0) return;           // keep food
      if(def.recipe || def.unlocks) return;            // keep recipe scrolls / blueprints / keys
      if(def.type === 'weapon' || def.type === 'armor') return; // keep gear
      if(def.type === 'jewelry' || def.type === 'companion' || def.type === 'ammo') return;
      if((def.v|0) <= 0) return;
      // Per-stack value cap — let the player keep stacks worth a lot.
      var stackValue = qty * (def.v|0);
      if(stackValue > th * Math.max(1, qty)) return;   // single-item value > threshold → keep
      picks.push(id);
    });
    return picks;
  }

  function sellJunk(threshold){
    var ids = selectJunk(threshold);
    if(!ids.length){
      if(typeof window.notify === 'function') window.notify('No junk to sell — your bag is clean.', 'info');
      return 0;
    }
    var totalGold = 0, totalCount = 0;
    ids.forEach(function(id){
      var qty = window.G.inventory[id] | 0;
      var v = window.ITEMS[id].v | 0;
      totalGold += qty * v;
      totalCount += qty;
    });
    var msg = 'Sell ' + ids.length + ' stacks (' + totalCount.toLocaleString() + ' items) for ' + totalGold.toLocaleString() + ' gold?';
    if(!window.confirm(msg)) return 0;
    ids.forEach(function(id){
      var qty = window.G.inventory[id] | 0;
      var v = window.ITEMS[id].v | 0;
      window.G.gold = (window.G.gold | 0) + qty * v;
      if(typeof window.removeItem === 'function') window.removeItem(id, qty);
      else delete window.G.inventory[id];
    });
    if(typeof window.notify === 'function') window.notify('Sold ' + totalCount.toLocaleString() + ' junk for ' + totalGold.toLocaleString() + 'g', 'loot');
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    if(typeof window.renderInvNew === 'function') setTimeout(window.renderInvNew, 0);
    else if(typeof window.renderInventory === 'function') setTimeout(window.renderInventory, 0);
    return totalGold;
  }

  // ── Public API ────────────────────────────────────────────
  window.HearthriseInvCtx = {
    open: function(itemId, x, y){
      var ctx = { itemId: itemId, slot: null, source: 'bag' };
      var opts = buildOptions(ctx);
      if(!opts.length) return;
      renderMenu(opts);
      showMenu(x|0, y|0);
    },
    close: hideMenu,
    selectJunk: selectJunk,
    sellJunk: sellJunk,
    // Test hooks
    _ctxFromTile: ctxFromTile,
    _buildOptions: buildOptions,
  };

  console.log('[inv-context-menu] HearthriseInvCtx loaded');
})();
