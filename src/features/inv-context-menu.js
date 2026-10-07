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
    'background:rgba(28,22,18,.97);border:1px solid var(--accent,#7f9a4f);'+
    'border-radius:8px;padding:4px;min-width:180px;'+
    'box-shadow:0 8px 24px rgba(0,0,0,.4);'+
    'font-family:inherit;font-size:calc(14.5px * var(--ui-scale, 1));color:#ede4cf';
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
      var equipped = window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(window.G, slotName) : ((window.G && window.G.equipment) ? window.G.equipment[slotName] : null);
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

  /* ══ THE BURY GESTURE ═══════════════════════════════════════════════════
     Burying is a server-settled artisan run on the Prayer bench, not a stack
     burn: the gesture STARTS the run and authors nothing — no debit, no XP, no
     counter. It used to be `removeItem` + `addXp('prayer', …)` in three places,
     so the XP evaporated on the next reload and the bones came back.

     It lives here, in the inventory-actions module, because all THREE surfaces
     that offer it are outside legacy.js's render path — this menu, the
     item-ux.js slider and the inv-detail flyout — and a lookup that lives in
     one of the three is a lookup the other two are free to disagree with. The
     recipe is DERIVED (`HearthriseCore.artisanRecipeFor`, the same index the
     accrual engine reads), never a hand-written bones→bury_bones map, so a
     fourth bone with a fourth recipe needs no edit here. */

  /** The prayer recipe that buries `id`, or null. */
  function buryRecipeFor(id){
    var C = window.HearthriseCore;
    return (C && typeof C.artisanRecipeFor === 'function') ? C.artisanRecipeFor('prayer', id) : null;
  }

  /** `{recipe, xp, why}` — `why` is the reason the bench cannot run, or null.
      The gates are READ from the systems that own them (the workbench rung from
      HearthriseHomestead, the level from getLevel), never re-implemented: one
      wrong copy of "can I bury?" is how the three bury buttons diverged. */
  function buryGate(id){
    var r = buryRecipeFor(id);
    var def = (window.ITEMS && window.ITEMS[id]) || null;
    var out = { recipe: r, xp: r ? r.xp : (def && def.buryXp) || 0, why: null };
    if(!r){ out.why = 'No altar rite for this yet'; return out; }
    /* No room read here: Prayer carries no client room gate (the altar ruling);
       the two gates left are the two the server enforces — a rite must exist,
       and hr_apply re-checks req_lv against server XP. */
    if((window.hrGateLevel?window.hrGateLevel('prayer'):1) < r.req){
      out.why = (window.hrLevelGateText?window.hrLevelGateText('prayer',r.req,'Needs Prayer ' + r.req):'Needs Prayer ' + r.req);
    }
    return out;
  }

  /** Start the altar bench on `id`. Returns the recipe id actually started, or
      null. The bench consumes one bone per action and keeps going while the
      player is away; `startArtisan` owns the timers, the interval derivation
      and the renders, which is why this never assigns the pointer itself. */
  function buryBones(id){
    var G = window.G;
    var it = (window.ITEMS || {})[id];
    if(!it || !G) return null;
    var r = buryRecipeFor(id);
    if(!r){
      if(typeof window.notify === 'function') window.notify('There is no altar rite for ' + it.n + ' yet','kill');
      return null;
    }
    if(typeof window.startArtisan !== 'function') return null;
    window.startArtisan('prayer', r.id);
    /* THE ONLY HONEST SUCCESS SIGNAL IS THE POINTER startArtisan SET. It refuses
       by notifying and returning undefined (no level, no Shrine, knocked out, no
       input), so reading its return value would report every refusal as a
       success — and a "Burying…" toast on top of "Build the Shrine first" is
       worse than no toast at all. */
    if(!(G.activeSkill === 'prayer' && G.skillTargetId === r.id)) return null;
    if(typeof window.notify === 'function'){
      window.notify('Burying ' + it.n + ' at the altar — ' + r.xp + ' Prayer XP each', 'info');
    }
    return r.id;
  }

  window.buryRecipeFor = buryRecipeFor;
  window.buryBones = buryBones;
  window.HearthriseBury = { recipeFor: buryRecipeFor, gate: buryGate, start: buryBones };

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

    /* NO ICONS IN THIS MENU, and that is a decision rather than a deletion.
       Six of the ~ten entries carried an emoji (↩️ ℹ️ ⚔️ 🦴 🪙 📊) and the rest —
       Eat, Lock, Set as auto-eat — never had one, because there is no honest
       glyph for them. A list where half the rows are indented behind a picture
       and half are not reads worse than a list with none, and a right-click
       menu is a TEXT surface in every game this one is aiming at. Words only. */
    // ── Per-source actions ────────────────────────────────
    if(ctx.source === 'equipped'){
      opts.push({ label: 'Unequip', action: function(){
        if(typeof window.unequip === 'function') window.unequip(ctx.slot);
        else if(typeof window.unequipSlotInv === 'function') window.unequipSlotInv(ctx.slot);
      }});
      opts.push({ label: 'Inspect', action: function(){
        if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
      }});
      return opts;
    }

    // Equippable items in the bag
    if(isEquippable){
      opts.push({ label: 'Equip', action: function(){
        if(typeof window.equipItem === 'function') window.equipItem(id);
        else if(typeof window.equipGear === 'function') window.equipGear(id);
      }});
    }

    // Food — b224: the verb and the effect come from foodUseInfo() so this
    // menu, the item flyout and the combat row cannot describe one item three
    // ways. "Set as auto-eat food" is offered only where it is true: a
    // Provision, and only once the player owns the Auto-Eat trait.
    var food = (typeof window.foodUseInfo === 'function') ? window.foodUseInfo(id) : null;
    if(food){
      var effect = food.kind === 'provision'
        ? (food.healText || '')
        : [food.buffText, food.heals ? '+' + food.heals + ' HP' : ''].filter(Boolean).join(' · ');
      opts.push({ label: food.verb + (effect ? '  (' + effect + ')' : ''), action: function(){
        if(typeof window.eatFromInventory === 'function') window.eatFromInventory(id);
        else if(typeof window.eatFood === 'function') window.eatFood(id);
      }});
      var owns = (typeof window.hasTrait === 'function') ? window.hasTrait('auto_eat') : false;
      if(food.autoEatable && owns){
        opts.push({ label: 'Set as auto-eat food', action: function(){
          if(typeof window.setAutoEatFood === 'function') window.setAutoEatFood(id);
        }});
      }
    } else if(def.heals && def.heals > 0){
      // Defensive: an item that heals but that foodUseInfo() could not classify
      // (foodUseInfo is unavailable pre-boot). Still let the player eat it.
      opts.push({ label: 'Eat (+' + def.heals + ' HP)', action: function(){
        if(typeof window.eatFood === 'function') window.eatFood(id);
      }});
    }

    /* RECIPE SCROLLS — READING ONE IS A GESTURE NOW, NOT A SIDE EFFECT OF
       PICKING IT UP. Until 2026-09-14 a scroll unlocked itself on pickup and
       deleted itself locally, so it could never appear in a bag and the realm
       never learned anything (the away engine refused every gated recipe). It
       now sits in the bag until the player reads it, and reading sends
       hr_recipe_learn, which consumes the scroll and writes the flag together.
       A recipe already known is labelled as such and disabled rather than hidden
       — a scroll that is still in the bag with no visible verb reads as a bug. */
    if(def.recipe){
      var known = (typeof window.knowsRecipe === 'function') ? window.knowsRecipe(id) : false;
      var makes = (window.ITEMS && window.ITEMS[def.recipe]) ? window.ITEMS[def.recipe].n : null;
      opts.push(known
        ? { label: 'Already learned' + (makes ? ' — ' + makes : ''), disabled: true }
        : { label: 'Read' + (makes ? ' — learn ' + makes : ' — learn this recipe'), action: function(){
            if(typeof window.readRecipeScroll === 'function') window.readRecipeScroll(id);
          }});
    }

    /* Bones — START THE ALTAR BENCH. There is no client-side fallback: a silent
       twin that grants XP nothing settles is the thing that was deleted, not a
       safety net. The XP figure is read from the recipe the SERVER prices. */
    if(def.buryXp && def.buryXp > 0){
      opts.push({ label: 'Bury at the altar (' + buryGate(id).xp + ' Prayer XP each)',
        action: function(){ buryBones(id); } });
    }

    // Always: Inspect, Sell 1
    opts.push({ label: 'Inspect', action: function(){
      if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
    }});

    // BoP items can't be sold — defensive check
    if(!def.bop){
      /* b226: the vendor's bid, not the book value — one price everywhere
         (legacy.js vendorPrice, pacing-overhaul §6.1). */
      var price = (typeof window.vendorPrice === 'function') ? window.vendorPrice(id) : (def.v || 0);
      var locked = (typeof window.isItemLocked === 'function') && window.isItemLocked(id);
      // b240: lock toggle (protect from accidental selling).
      opts.push({ label: locked ? 'Unlock — allow selling' : 'Lock — protect from selling', action: function(){
        if(typeof window.toggleItemLock === 'function') window.toggleItemLock(id);
      }});
      if(!locked){
        // b240: route Sell 1 through the guarded, buy-back-recorded path so it
        // respects the lock AND becomes undoable — one sell choke-point.
        opts.push({ label: 'Sell 1 (' + price.toLocaleString() + 'g)',
          disabled: qty < 1 || price <= 0,
          action: function(){ if(typeof window.invSellOne === 'function') window.invSellOne(id); }
        });
        // Sell N… defers to item-ux's qty slider for the actual UX
        if(isStack){
          opts.push({ label: 'Sell N…  (stack: ' + qty.toLocaleString() + ')', action: function(){
            if(typeof window.openInvQtySlider === 'function') window.openInvQtySlider(id);
            else if(typeof window.openInvDetail === 'function') window.openInvDetail(id);
          }});
        }
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
        'padding:7px 10px;border-radius:6px;cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1))">' + o.label + '</button>';
    }).join('');
    // Hover highlight
    Array.prototype.forEach.call(menu.querySelectorAll('.inv-ctx-item:not(.disabled)'), function(b){
      b.onmouseenter = function(){ b.style.background = 'rgba(127,154,79,0.15)'; };
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
      if(typeof window.isItemLocked === 'function' && window.isItemLocked(id)) return;   // a locked stack is never swept
      if(def.heals && def.heals > 0) return;           // keep food
      if(def.recipe || def.unlocks) return;            // keep recipe scrolls / blueprints / keys
      if(def.type === 'weapon' || def.type === 'armor') return; // keep gear
      if(def.type === 'jewelry' || def.type === 'companion' || def.type === 'ammo') return;
      if((def.v|0) <= 0) return;
      // Per-stack value cap — let the player keep stacks worth a lot.
      var stackValue = qty * ((typeof window.vendorPrice === 'function') ? window.vendorPrice(id) : (def.v|0));
      if(stackValue > th * Math.max(1, qty)) return;   // single-item value > threshold → keep
      picks.push(id);
    });
    return picks;
  }

  /* b373 — THE QUOTE IS A VALUE, NOT A SIDE EFFECT OF THE DIALOG.
     The sweep used to compute its total, ask with window.confirm() and pay, all
     in one synchronous body. The ask is now a NON-BLOCKING modal (window.confirm
     freezes the renderer — src/utils/dialog.js), and an await in the middle of
     that body would have made the whole thing async, which is how the b354
     quote-equals-payment invariant would quietly become untestable.

     So the three jobs are three functions: quote, ask, settle. `settleJunk`
     pays the quote it is HANDED — it does not recompute a price — which makes
     "the quote is the payment" true by construction rather than by two loops
     agreeing, and it is directly assertable without a dialog in the loop. */
  /* THE QUANTITY IS THE SERVER'S (sellableCount → accrue.js gateItemCount), never
     the display bag. An unstated bag quotes `pending` and sells nothing. */
  function serverQty(id){
    return (typeof window.sellableCount === 'function') ? window.sellableCount(id) : null;
  }
  function quoteJunk(threshold){
    var ids = selectJunk(threshold);
    var totalGold = 0, totalCount = 0, qtys = {}, pending = false;
    ids = ids.filter(function(id){
      var qty = serverQty(id);
      if(qty === null){ pending = true; return false; }
      if(qty <= 0) return false;
      var v = (typeof window.vendorPrice === 'function') ? window.vendorPrice(id) : (window.ITEMS[id].v | 0);
      qtys[id] = qty;
      totalGold += qty * v;
      totalCount += qty;
      return true;
    });
    if(pending) return { ids: [], qtys: {}, totalGold: 0, totalCount: 0, pending: true };
    return { ids: ids, qtys: qtys, totalGold: totalGold, totalCount: totalCount };
  }

  function quoteText(q){
    /* b373: "Sell 1 stacks (40 items)" — seen in the verification screenshot.
       The old native confirm read the same way; a modal that is the only thing
       on screen makes it obvious. */
    var stacks = q.ids.length + (q.ids.length === 1 ? ' stack' : ' stacks');
    var items = q.totalCount.toLocaleString() + (q.totalCount === 1 ? ' item' : ' items');
    return 'Sell ' + stacks + ' (' + items + ') for ' + q.totalGold.toLocaleString() + ' gold?';
  }

  /* ONE PRESS IS ONE INTENT (`vendor_sell_many`), so the sweep a player is
     asked about is the sweep that is sent: at most MAX_SELL_LINES stacks of at
     most MAX_QTY each. Anything past that stays in the bag; the confirm says so
     and the receipt toast says so again. */
  function capQuote(q){
    var S = window.HearthriseGold;
    var maxL = (S && S.MAX_SELL_LINES) || 64, maxQ = (S && S.MAX_QTY) || 1000;
    var ids = [], qtys = {}, totalGold = 0, totalCount = 0, all = 0;
    q.ids.forEach(function(id){
      var qty = (q.qtys && q.qtys[id]) | 0;
      all += qty;
      if(ids.length >= maxL || qty <= 0) return;
      var n = Math.min(qty, maxQ);
      var v = (typeof window.vendorPrice === 'function') ? window.vendorPrice(id) : 0;
      ids.push(id); qtys[id] = n; totalGold += n * v; totalCount += n;
    });
    return { ids: ids, qtys: qtys, totalGold: totalGold, totalCount: totalCount, left: all - totalCount };
  }

  /** Ask, then settle. Resolves the gold the SERVER paid (0 if declined, refused or nothing to do). */
  function sellJunk(threshold){
    var q = quoteJunk(threshold);
    if(q.pending){
      if(typeof window.notify === 'function') window.notify(window.SELL_PENDING_TITLE, 'info');
      return Promise.resolve(0);
    }
    if(!q.ids.length){
      if(typeof window.notify === 'function') window.notify('No junk to sell — your bag is clean.', 'info');
      return Promise.resolve(0);
    }
    var c = capQuote(q);
    var D = window.HearthriseDialog;
    var body = quoteText(c) + (c.left > 0 ? ' The rest (' + c.left.toLocaleString() + ' items) stays for the next sweep.' : '');
    var ask = (D && D.confirm)
      ? D.confirm({ title:'Sell junk?', body: body, confirmLabel:'Sell' })
      : Promise.resolve(false);
    return ask.then(function(ok){
      if(!ok) return 0;
      /* RE-QUOTED AFTER THE ANSWER. The modal does not stop the game: a kill can
         drop loot and a tick can consume a stack while it is open. The server
         prices the sale itself, so a moved total is only ever a display fact —
         the player is told, and the receipt toast carries the real number. */
      var now = quoteJunk(threshold);
      if(!now.ids.length) return 0;
      var nc = capQuote(now);
      if(nc.totalGold !== c.totalGold && typeof window.notify === 'function'){
        window.notify('Your bag changed — selling for about ' + nc.totalGold.toLocaleString() + 'g', 'info');
      }
      return settleJunk(nc);
    });
  }

  /* THE QUOTE IS THE REQUEST, AND THE SERVER IS THE PRICE. settleJunk sends the
     quoted ids and their SERVER counts (never a re-read of the display bag) as
     ONE `vendor_sell_many` through `vendorSellMany` (shop-counter.js): one key,
     one prediction at the shop's own bid (vendorPrice — B354-6 pins the quote
     to it), all-or-nothing under hr_apply. It resolves the gold in the server's
     RECEIPT, never the quote: a refused sweep resolves 0 and its stacks and gold
     go back. Ledger site `vendor.sell_junk`, wired to vendor_sell_many. */
  function settleJunk(q){
    var ids = (q && q.ids) || [];
    if(!ids.length || typeof window.vendorSellMany !== 'function') return Promise.resolve(0);
    var picks = ids.map(function(id){ return { id: id, qty: (q.qtys && q.qtys[id]) | 0 }; });
    return window.vendorSellMany(picks, 'vendor.sell_junk').then(function(res){ return res ? res.gold : 0; });
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
    quoteJunk: quoteJunk,
    settleJunk: settleJunk,
    _quoteText: quoteText,
    // Test hooks
    _ctxFromTile: ctxFromTile,
    _buildOptions: buildOptions,
  };

  console.log('[inv-context-menu] HearthriseInvCtx loaded');
})();
