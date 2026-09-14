// ============================================================
// src/screens/inventory.js — THE INVENTORY SCREEN CONTROLLER
//
// The first SCREEN-CONTROLLER extraction out of src/legacy.js (task #129,
// CLAUDE.md §7: "extract render helpers to src/render/* first, then screen
// controllers"). The render-helper phase has 20 files and 4.3k lines in
// src/render/*; this is where the second phase starts, and src/screens/* is
// where a whole TAB lives — its painter, its filter state, its private handlers
// and the wiring that installs them.
//
// WHAT MOVED, EXACTLY: legacy.js blocks 25 (inventory-rebuild-js) and 26
// (dragdrop-js), lines 16729–17288, VERBATIM. Both were already complete
// `(function(){ … })()` IIFEs inside the monolith, so nothing in them changed
// identity by moving: every name they declare was already IIFE-private, and
// every name they publish (`window._renderInvFancy`, `window.renderInvFancy`,
// `window.CATEGORIES`, `window._invFilter`, the `_inv*` handlers,
// `_equipToSlot`, `_wireDragDrop`) is published by the same line it always was.
// This is a PURE MOVE — not one character of either IIFE body was edited.
//
// WHY THE BAG IS THE RIGHT FIRST SCREEN. It is the largest surface in the game
// (the invc-* grid, the category strip, the search row, the standing loot-filter
// row, the Depot toolbar button, the paper-doll column, the stat cards,
// multi-select, and the whole drag-and-drop equip/unequip layer) and it has the
// smallest coupling: two closed IIFEs whose only contract with the rest of the
// monolith is `window.*` read at CALL time. Moving it proves the src/screens/
// seam on the hardest screen without one semantic question to answer.
//
// ── LOAD POSITION IS PART OF THE CONTRACT ───────────────────────────────────
// index.html loads this immediately after src/legacy.js, as a CLASSIC script,
// and neither half of that is a style choice. Two measured reasons, both of
// which fail SILENTLY if ignored:
//
//   1. IT WRAPS LEGACY FUNCTIONS AT LOAD TIME. Near the foot of the first IIFE:
//      `['updateTopbar','equip','unequip','addItem','removeItem'].forEach(…)`,
//      replacing each `window[name]` with a repaint wrapper. `window[name]` is
//      read DURING EVALUATION. Load this before legacy.js and every read is
//      `undefined`, the `typeof orig !== 'function'` guard returns, and the bag
//      silently stops repainting after an equip or a loot credit. A deferred
//      `type="module"` would not fix it either — see (2).
//   2. wrapShowTab REGISTRATION ORDER IS LOAD ORDER. The `inv-fancy` handler
//      carries a comment saying it must dispatch AFTER `inv-new` (registered in
//      legacy.js at the "Inventory: ONE renderer" block) and BEFORE
//      `inv-dragdrop`. Both IIFEs moved together, in order, into one file that
//      sits directly after legacy.js, so inv-new → inv-fancy → inv-dragdrop is
//      preserved exactly. The only order that DID change is against legacy's own
//      later registrations (`auto-open-activity`, `character-rebuild`), which
//      key on the 'activity' and 'character' tabs and never observe 'inventory'.
//
// ── WHAT DELIBERATELY DID NOT MOVE ──────────────────────────────────────────
//   • `renderInventory()` / `onItemTap()` (legacy.js ~8846) — the PRE-rebuild bag
//     layout that renderInvFancy supersedes (it bails the moment .invc-bag-col
//     exists). `const _origOnItemTap = window.onItemTap` at legacy.js ~11461
//     captures onItemTap AT LOAD TIME; moving it to a file that loads later
//     would turn that capture into `undefined` and quietly delete the item
//     flyout's fallback branch. It leaves with the block that owns that wrapper.
//   • `renderInvNew` / `invItemTap` / the buyback + item-lock block — a separate
//     neighbourhood with its own load-time captures (features/companions.js
//     reassigns window.invItemTap). One controller per commit; this is the bag.
// ============================================================

(function(){
"use strict";

/* ─── Category definitions ───
 * b217: these ten filters shipped as raw emoji — a brown cardboard box, a BLUE
 * shield, a CYAN diamond, a pink cut of meat, a green sprout. Ten system-font
 * pictographs in five saturations belonging to no palette, in a row directly
 * above the bag: the most obviously-generated element on the screen. Now gilt
 * glyphs from the one icon set, so the strip reads as chrome. */
var CATEGORIES = [
  {id:'all',     glyph:'uiChest',  name:'All',          test:function(it){return true;}},
  {id:'weapons', glyph:'uiSword',  name:'Weapons',      test:function(it){return it && it.type==='weapon';}},
  {id:'armor',   glyph:'uiBody',   name:'Armour',       test:function(it){return it && it.type==='armor';}},
  {id:'jewelry', glyph:'uiAmulet', name:'Jewellery',    test:function(it){return it && it.type==='jewelry';}},
  {id:'food',    glyph:'uiFood',   name:'Food',         test:function(it){return it && it.heals;}},
  {id:'mats',    glyph:'uiOre',    name:'Materials',    test:function(it){return it && !it.type && !it.heals && !it.seed && !it.buryXp && !it.recipe;}},
  {id:'seeds',   glyph:'uiSeed',   name:'Seeds',        test:function(it){return it && it.seed;}},
  {id:'bones',   glyph:'uiBone',   name:'Bones',        test:function(it){return it && it.buryXp;}},
  {id:'tools',   glyph:'uiPickaxe',name:'Tools',        test:function(it){return it && it.type==='tool';}},
  {id:'recipes', glyph:'uiScroll', name:'Recipes',      test:function(it){return it && it.recipe;}},
  {id:'comp',    glyph:'uiPaw',    name:'Companions',   test:function(it){return it && it.type==='companion';}},
];

window._invFilter = {category:'all', search:''};
window.CATEGORIES = CATEGORIES;   // legacy.js is imported as a module, so a top-level declaration is NOT a global; the bag's class table is published for src/features/loot-filter.js

/* ─── Format helpers ─── */
function fmtQty(n){
  if(n >= 1000000) return (n/1000000).toFixed(1).replace('.0','')+'M';
  if(n >= 1000) return (n/1000).toFixed(1).replace('.0','')+'K';
  return n.toLocaleString();
}

function itemImg(id){
  var path = window._itemPath && window._itemPath[id];
  if(path){
    var tint = (typeof window.itemTintClass === 'function') ? window.itemTintClass(id) : '';
    return '<img src="'+path+'" class="'+tint+'" alt="" loading="lazy" draggable="false" />';
  }
  var def = (typeof ITEMS!=='undefined') ? ITEMS[id] : null;
  return '<span class="invc-emoji">'+itemFallbackIcon(id, 26, def)+'</span>';
}

/* ─── Main render ─── */
function renderInvFancy(){
  var panel = document.getElementById('panel-inventory');
  if(!panel || typeof ITEMS === 'undefined' || typeof G === 'undefined') return;
  var _LF = window.HearthriseLootFilter;   // the standing kept-classes filter (src/features/loot-filter.js)

  /* Compute totals */
  var entries = Object.entries(G.inventory||{}).filter(function(kv){return kv[1] > 0;});
  var totalCount = entries.reduce(function(a,kv){return a+kv[1];},0);
  /* (`totalGold` used to be read here and was never used — the bag header
     states the BAG's value, not the purse's. A dead raw balance read is still
     a raw balance read, so it is gone rather than converted.) */

  /* Equipment bonuses summary */
  var bonus = {atk:0, str:0, def:0, rangeAtk:0, rangeStr:0, magicAtk:0, magicStr:0, crit:0};
  Object.values(equipmentMapG()).forEach(function(id){
    var it = ITEMS[id]; if(!it) return;
    bonus.atk += it.atkB||0; bonus.str += it.strB||0; bonus.def += it.defB||0;
    bonus.rangeAtk += it.rangeAtkB||0; bonus.rangeStr += it.rangeStrB||0;
    bonus.magicAtk += it.magicAtkB||0; bonus.magicStr += it.magicStrB||0;
    bonus.crit += it.critB||0;
  });

  /* Filter items */
  var f = window._invFilter;
  var cat = CATEGORIES.find(function(c){return c.id===f.category;}) || CATEGORIES[0];
  var search = (f.search||'').toLowerCase();
  var visible = entries.filter(function(kv){
    var def = ITEMS[kv[0]];
    if(!def) return false;
    if(!cat.test(def)) return false;
    if(_LF && !_LF.keeps(def)) return false;         // the standing kept-classes filter
    if(search && def.n.toLowerCase().indexOf(search) < 0) return false;
    return true;
  });

  /* Preserve scroll across this FULL-panel rebuild. Tester report (paione):
     the bag "keeps scrolling up" every combat/skill tick — because this renderer
     replaces #panel-inventory wholesale, destroying the internal scrollers
     (.invc-bag-col, .invc-right) and recreating them at scrollTop 0. Capture
     before, restore on the freshly-built nodes after. */
  var _prevBagScroll = 0, _prevRightScroll = 0;
  try {
    var _pbc = panel.querySelector('.invc-bag-col'); if(_pbc) _prevBagScroll = _pbc.scrollTop;
    var _prc = panel.querySelector('.invc-right');   if(_prc) _prevRightScroll = _prc.scrollTop;
  } catch(e){}

  /* Build the panel */
  panel.innerHTML =
    /* b217: the screen opened with THREE stacked chrome bars before a single
       item — a "Bag total value" strip, this gold + item-count strip, and the
       search row: roughly 200px of header on a 1250px screen. The gold figure
       here also just repeated the topbar twelve pixels above it, and disagreed
       with it. One bar now: what is in the bag, and the controls that act on
       it. Gold lives in the topbar, permanently; it does not need a second
       home on this screen.
       b213 QA note kept: the old "Space: N/360" ceiling was never enforced
       anywhere, so the honest item count stays until real storage ships. */
    '<div class="invc-topbar">'+
      /* b348: the free-stack count is the number the "Buy space" button is
         selling, so it is stated rather than left to be inferred. The volatile
         half (item + gold totals) lives in .invc-space-sub, which is the ONLY
         thing _renderInvSummary() may rewrite — it used to overwrite this whole
         node's textContent on every tab entry, so the slot figure survived for
         about 50ms and the player never saw their capacity at all. The three facts are NAMED elements so a short viewport can drop whole ones rather than ellipsise mid-fact (art-direction.css §mobile); the text content is unchanged. */
      '<span class="invc-space"><span class="invc-space-cap">'+entries.length+' / '+bankCap()+'<span class="invc-space-unit"> slots</span></span>'
        +' <span class="invc-space-free">('+Math.max(0, bankCap()-bankUsed()).toLocaleString()+' free)</span>'
        +'<span class="invc-space-sub"> · '+totalCount.toLocaleString()+' items</span></span>'+
      '<div class="invc-actions">'+
        (window.HearthriseDepot?window.HearthriseDepot.toolbarButtonHtml():'')+'<button class="invc-buyspace" onclick="window.openBankModal()">Buy space</button>'+
        '<button id="invc-multi" class="'+(window._invMultiSelect?'active':'')+'" onclick="window._invToggleMulti()">Multi-select</button>'+
        '<button onclick="window._invManage()">Manage</button>'+
      '</div>'+
    '</div>'+
    /* Search row */
    '<div class="invc-search-row">'+
      '<input type="text" id="invc-search" placeholder="Search for an item..." value="'+(search||'').replace(/"/g,'&quot;')+'" oninput="window._invSearchInput(this.value)" />'+
      '<button onclick="window._invSearchClear()">Reset</button>'+
    '</div>'+
    /* Main: left (categories + bag) | right (equipment + stats) */
    '<div class="invc-main">'+
      '<div class="invc-left">'+
      /* The STANDING kept-classes row. Inside `.invc-left` on purpose: the mobile
         layout turns the panel into an explicit grid and PLACES each of its four
         children by name (art-direction.css ~2292), so a fifth top-level child
         would auto-place into an implicit row and shove the bag off a landscape
         phone. It also inherits the rule that hides the bag's controls on the
         equip/loadout sub-tabs. */
      (_LF ? _LF.rowHTML() : '')+
      /* Bag grid */
      '<div class="invc-bag-col">'+
        '<div class="invc-grid">'+
          (visible.length === 0 ?
            /* b293 (Xarnathos: "when you get a recipe it is not listed in the
               inventory under recipe"). Recipe scrolls are READ ON PICKUP — addItem
               unlocks them into G.unlockedRecipes and deletes the item — so this tab
               could never hold anything and read as a bug. Show the recipes you have
               actually learned instead of a dead "no items" wall. */
            (f.category === 'recipes'
              ? (function(){
                  var known = Object.keys((G && G.unlockedRecipes) || {}).filter(function(id){ return ITEMS[id]; });
                  if(!known.length) return '<div style="grid-column:1/-1;text-align:center;color:var(--ink-3);padding:20px;font-size:calc(14.5px * var(--ui-scale, 1))">No recipes learned yet — recipe scrolls drop from monsters and are learned the moment you pick them up.</div>';
                  return '<div style="grid-column:1/-1;padding:6px 2px 10px;color:var(--ink-3);font-size:calc(14.5px * var(--ui-scale, 1))">Recipes are learned the moment you pick up the scroll, so they live here rather than in your bag — these are yours permanently.</div>'
                    + known.map(function(id){
                        var d = ITEMS[id];
                        var makes = d.recipe && ITEMS[d.recipe] ? ITEMS[d.recipe].n : null;
                        return '<div class="inv-slot" title="'+(d.n||id)+(makes?' — unlocks '+makes:'')+'">'
                          + '<span class="inv-ic">'+((window._itemPath && window._itemPath[id]) ? '<img src="'+window._itemPath[id]+'" alt="">' : (d.icon||''))+'</span>'
                          + '<span class="inv-nm">'+(makes || d.n || id)+'</span></div>';
                      }).join('');
                })()
              : '<div style="grid-column:1/-1;text-align:center;color:var(--ink-3);padding:20px;font-size:calc(14.5px * var(--ui-scale, 1))">No items in this category</div>') :
            /* b216: pad the grid with EMPTY SLOTS so the bag reads as a real
               inventory rather than a handful of tiles above a black void.
               A uniform filled grid is what makes a bag scannable — you learn
               the shape of the container, and item positions stay stable. */
            (function(html){
              /* THE BAG SHOWS THE SPACE YOU BOUGHT. The empty tiles ARE your free
                 stacks, off the same bankCap()/bankUsed() pair addItem() enforces,
                 so a purchase adds rows the instant it completes and the picture
                 cannot disagree with the rule. (Sizing it by ITEM COUNT instead is
                 what made a paid gem upgrade invisible until you outgrew it.)

                 A FILTERED VIEW NEVER CLAIMS CAPACITY — free space belongs to the
                 BAG, not to "Weapons" or to a kept-classes lane; a filtered,
                 searched or loot-filtered view only fills the container.

                 RENDER CEILING, measured: this renderer runs on the game tick and
                 an empty tile costs ~0.006 ms (2,000 tiles 15 ms, 4,000 tiles 23.6
                 ms, against a 6-18 ms base render). Gem slots are flat-priced, so
                 capacity has no upper bound and neither would the DOM; 600 covers
                 every cap normal play reaches at ~4 ms and the surplus past it is
                 one chip, with the header still quoting the real number. */
              var RENDER_CEILING = 600;
              var MIN_FILL = 88;                                    // "fill the container"
              var unfiltered = (f.category === 'all') && !search && !(_LF && _LF.kept());
              var cap = (typeof bankCap === 'function') ? bankCap() : 0;
              var used = (typeof bankUsed === 'function') ? bankUsed() : visible.length;
              var target, surplus = 0;
              if (unfiltered && cap > 0) {
                var free = Math.max(0, cap - used);
                target = visible.length + free;
                if (target > RENDER_CEILING) { surplus = target - RENDER_CEILING; target = RENDER_CEILING; }
              } else {
                target = Math.max(MIN_FILL, visible.length);
              }
              for (var i = visible.length; i < target; i++) html += '<div class="invc-tile invc-slot" aria-hidden="true"></div>';
              if (surplus > 0) {
                html += '<div class="invc-tile invc-slot invc-slot-more" title="' + surplus.toLocaleString()
                  + ' more free stacks — too many to draw">+' + fmtQty(surplus) + '</div>';
              }
              return html;
            })(
            visible.map(function(kv){
              var id = kv[0], qty = kv[1];
              var def = ITEMS[id];
              var canEquip = def && (def.type || def.slot);
              // b189: rarity border for gear (gray→green→blue→purple→gold→red)
              var rr = window.RARITY ? window.RARITY.classFor(id, def) : '';
              var tileCls = 'invc-tile' + (rr ? ' rr-frame ' + rr : '');
              /* THE LOCKED BADGE. The lock only ever showed in the flyout and the
                 right-click menu, so the screen a player scans before a bulk sell
                 never said which stacks were protected. Shipped atlas glyph. */
              var lk = (typeof isItemLocked === 'function') && isItemLocked(id);
              return '<div class="'+tileCls+(lk?' invc-locked':'')+'" '+(canEquip?'draggable="true" data-item-id="'+id+'"':'')+' onclick="invItemTap(\''+id+'\')" title="'+(def.n||'').replace(/"/g,'&quot;')+' (×'+qty+')'+(lk?' — locked against selling':'')+'">'+
                itemImg(id)+
                (lk ? '<span class="invc-lock" aria-label="Locked">'+lockGlyph()+'</span>' : '')+
                '<span class="invc-qty">'+fmtQty(qty)+'</span>'+
              '</div>';
            }).join(''))
          )+
        '</div>'+
      '</div>'+
      /* Middle: category filter strip */
      '<div class="invc-cat-strip">'+
        CATEGORIES.map(function(c){
          var count = entries.filter(function(kv){return c.test(ITEMS[kv[0]]);}).length;
          var g = (window.HR && window.HR.icon) ? (window.HR.icon(c.glyph, 19, 'currentColor') || '') : '';
          return '<button class="invc-cat-btn '+(f.category===c.id?'active':'')+'" title="'+c.name+' ('+count+')" onclick="window._invSetCat(\''+c.id+'\')">'+g+'</button>';
        }).join('')+
      '</div>'+
      '</div>'+
      /* Right region: equipment doll + stat sheet */
      '<div class="invc-right">'+
      '<div class="invc-equip-col">'+
        '<div class="invc-loadout-bar">'+
          '<select onchange="window._invLoadoutSelect(this.value)">'+
            '<option value="">Select loadout</option>'+
            ((G.loadouts||[]).map(function(l,i){return '<option value="'+i+'">'+(l.name||('Loadout '+(i+1)))+'</option>';}).join(''))+
          '</select>'+
          '<button onclick="window._invLoadoutManage()">Loadouts</button>'+
        '</div>'+
        '<div id="invc-doll-host"></div>'+
      '</div>'+
      /* Stats column (4th col) */
      '<div class="invc-stats-col">'+
        '<div class="invc-stat-card">'+
          '<h4><span class="h4-icon">'+_hrGly('uiHelm')+'</span>Hero</h4>'+
          '<div class="invc-hero-stats">'+
            '<div class="invc-hero-stat"><b>'+(typeof getCombatLevel==="function"?getCombatLevel():1)+'</b><span>Combat Lv</span></div>'+
            '<div class="invc-hero-stat"><b>'+(typeof getTotalLevel==="function"?getTotalLevel():1)+'</b><span>Total Lv</span></div>'+
            '<div class="invc-hero-stat"><b>'+(G.playerHp||0)+'/'+(G.playerMaxHp||10)+'</b><span>HP</span></div>'+
          '</div>'+
        '</div>'+
        '<div class="invc-stat-card">'+
          '<h4><span class="h4-icon">'+_hrGly('navCombat')+'</span>Weapon Styles</h4>'+
          '<div class="invc-style-stats">'+
            '<div class="invc-style-row">'+
              '<span class="invc-style-icon">'+_hrGly('uiSword')+'</span>'+
              '<div><div class="invc-style-name">Melee</div>'+
              '<div class="invc-style-stats-line"><span>STR <b>'+bonus.str+'</b></span><span>ACC <b>'+bonus.atk+'</b></span><span>DEF <b>'+bonus.def+'</b></span></div></div>'+
            '</div>'+
            '<div class="invc-style-row">'+
              '<span class="invc-style-icon">'+_hrGly('uiBow')+'</span>'+
              '<div><div class="invc-style-name">Ranged</div>'+
              '<div class="invc-style-stats-line"><span>STR <b>'+bonus.rangeStr+'</b></span><span>ACC <b>'+bonus.rangeAtk+'</b></span><span>DEF <b>'+bonus.def+'</b></span></div></div>'+
            '</div>'+
            '<div class="invc-style-row">'+
              '<span class="invc-style-icon">'+_hrGly('uiStaff')+'</span>'+
              '<div><div class="invc-style-name">Magic</div>'+
              '<div class="invc-style-stats-line"><span>STR <b>'+bonus.magicStr+'</b></span><span>ACC <b>'+bonus.magicAtk+'</b></span><span>DEF <b>'+bonus.def+'</b></span></div></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="invc-stat-card">'+
          '<h4><span class="h4-icon">'+_hrGly('uiSpark')+'</span>Bonuses</h4>'+
          '<div class="invc-misc-row"><span>Crit Chance</span><b>+'+((bonus.crit||0)*100).toFixed(1)+'%</b></div>'+
          (function(){ var xpB=0,spdB=0; Object.values(equipmentMapG()).forEach(function(id){var it=ITEMS[id];if(!it)return;xpB+=it.xpB||0;spdB+=it.spdB||0;}); return '<div class="invc-misc-row"><span>XP Bonus (gear)</span><b>+'+(xpB*100).toFixed(0)+'%</b></div><div class="invc-misc-row"><span>Speed Bonus (gear)</span><b>+'+(spdB*100).toFixed(0)+'%</b></div>'; })()+
          '<div class="invc-misc-row"><span>Damage Reduction</span><b>'+Math.floor(bonus.def*0.5)+'</b></div>'+
        '</div>'+
        (function(){ var style = (typeof window.getActiveCombatStyle==="function") ? window.getActiveCombatStyle() : null; var wt = (typeof window.getWeaponType==="function") ? window.getWeaponType() : "sword"; if(!style) return ""; /* b348: the same derived route the picker prints — one sentence, one source. */
          var _route = (typeof window.styleXpRouteText==='function') ? window.styleXpRouteText(style) : style.trains;
          return '<div class="invc-stat-card"><h4><span class="h4-icon">'+_hrGly('uiTarget')+'</span>Active Style</h4><div class="invc-active-style"><div class="as-name">'+style.name+' ('+wt+')</div><div class="as-trains">Trains <b>'+style.trains+'</b></div><div class="as-trains">XP <b>'+_route+'</b></div></div></div>'; })()+
      '</div>'+
      '</div>'+
    '</div>';

  /* Restore the scroll positions captured before the rebuild (paione fix). */
  try {
    var _nbc = panel.querySelector('.invc-bag-col'); if(_nbc) _nbc.scrollTop = _prevBagScroll;
    var _nrc = panel.querySelector('.invc-right');   if(_nrc) _nrc.scrollTop = _prevRightScroll;
  } catch(e){}

  /* Inject Tibia doll into the host */
  var host = document.getElementById('invc-doll-host');
  if(host && typeof window.buildTibiaDoll === 'function'){
    var doll = window.buildTibiaDoll();
    if(doll){ host.innerHTML = ''; host.appendChild(doll); }
    /* b392: the enchant entry point, mounted on the Inventory gear surface.
       Before this, the Inventory tab — the very surface the Combat loadout note
       tells players to use to "manage gear" — had NO way to enchant a weapon, so
       "I don't see an enchant option" was literally true here. It now sits right
       under the paper doll, beside the weapon a player is looking at. Rebuilt on
       every renderInvFancy, so it tracks the equipped weapon + bound element. */
    if(typeof enchantAffordanceHtml === 'function'){
      var _ench = document.createElement('div');
      _ench.className = 'invc-enchant-mount';
      _ench.style.cssText = 'width:100%;max-width:100%;box-sizing:border-box';
      _ench.innerHTML = enchantAffordanceHtml();
      host.appendChild(_ench);
    }
  }
}

/* ─── Filter handlers ─── */
window._invSetCat = function(id){
  window._invFilter.category = id;
  renderInvFancy();
};
window._invSearchInput = function(v){
  window._invFilter.search = v;
  /* Debounce */
  clearTimeout(window._invSearchT);
  window._invSearchT = setTimeout(renderInvFancy, 150);
};
window._invSearchClear = function(){
  window._invFilter.search = '';
  window._invFilter.category = 'all';
  renderInvFancy();
};
window._invToggleMulti = function(){
  window._invMultiSelect = !window._invMultiSelect;
  renderInvFancy();
};
window._invManage = function(){
  /* b465: "Manage UI coming soon" — a feature name from a spec and a promise
     with no date on it. Say what the player can do instead, right now. */
  if(typeof notify === 'function') notify('Right-click or long-press any item to equip, eat, bury, inspect or sell it','info');
};
window._invLoadoutSelect = function(idx){
  if(idx === '' || isNaN(idx)) return;
  if(typeof applyLoadout === 'function') applyLoadout(parseInt(idx,10));
  else if(typeof notify === 'function') notify('Loadout '+(parseInt(idx,10)+1)+' applied','info');
};
window._invLoadoutManage = function(){
  if(typeof openLoadouts === 'function') openLoadouts();
  /* b465: "Loadout manager coming soon" named a module, not a thing to do.
     This arm is only reached if openLoadouts failed to load at all. */
  else if(typeof notify === 'function') notify('Loadouts are still loading — try again in a moment','info');
};

window._renderInvFancy = renderInvFancy;
/* b348: `window.renderInvFancy` (no underscore) is called from seven places —
   item-ux.js x2, dungeons.js x3, companions.js x3, admin.js, dungeon-scavenger
   — and has NEVER existed; the published name has always carried the
   underscore. Every call site is `typeof`-guarded, so they resolved to nothing
   silently rather than throwing. It is masked today because addItem/removeItem
   are wrapped just below to repaint an active bag anyway, which is why nobody
   noticed — but a guarded call to a name that cannot exist is a trap waiting
   for the first caller that isn't covered by that wrapper. DELEGATES rather
   than binds, so it always resolves the currently-wrapped implementation (the
   drag/drop hook near the foot of this block re-wraps `_renderInvFancy`). */
window.renderInvFancy = function(){
  if(typeof window._renderInvFancy === 'function') return window._renderInvFancy.apply(this, arguments);
};

/* Re-render when relevant state changes */
['updateTopbar','equip','unequip','addItem','removeItem'].forEach(function(name){
  var orig = window[name];
  if(typeof orig !== 'function') return;
  window[name] = function(){
    var r = orig.apply(this, arguments);
    var panel = document.getElementById('panel-inventory');
    if(panel && panel.classList.contains('active')) setTimeout(renderInvFancy, 30);
    return r;
  };
});

/* Show on tab change */
window.HearthriseShowTab.wrapShowTab('inv-fancy', function(t){
  // b407 flicker fix: paint synchronously in the activating task (was 30ms defer).
  // Registration order guarantees this runs after `inv-new` and before
  // `inv-dragdrop` in the same synchronous dispatch, so the grid exists for
  // wireDragDrop below.
  if(t === 'inventory') renderInvFancy();
});

setTimeout(function(){
  var panel = document.getElementById('panel-inventory');
  if(panel && panel.classList.contains('active')) renderInvFancy();
}, 500);

console.log('Inventory rebuild v4 loaded');
})();

// ===== block 26: dragdrop-js =====
(function(){
"use strict";

/* ─── Helpers ─── */
function isSlotCompatible(def, targetSlot){
  if(!def || !targetSlot) return false;
  if(def.slot === targetSlot) return true;
  if(def.slot === 'ring' && (targetSlot === 'ring1' || targetSlot === 'ring2')) return true;
  if(def.type === 'weapon' && targetSlot === 'weapon') return true;
  return false;
}
function equipToSlot(id, targetSlot){
  if(typeof migrateEquipmentSlots === 'function') migrateEquipmentSlots();
  var def = ITEMS[id];
  if(!def) return;
  if(!isSlotCompatible(def, targetSlot)){
    if(typeof notify === 'function') notify('Not compatible with that slot','kill');
    return;
  }
  /* b246: the paper-doll drag-equip is a second equip path — gate it too. */
  var _w = (typeof canWield === 'function') ? canWield(id) : {ok:true};
  if(!_w.ok){ if(typeof notify==='function') notify(`Requires ${(SKILLS_DEF[_w.req.skill]&&SKILLS_DEF[_w.req.skill].name)||_w.req.skill} Lv ${_w.req.lv} to wield ${def.n}`,'kill'); return; }
  /* Move existing item back to inventory */
  var _b = (typeof equipStateSnapshot === 'function') ? equipStateSnapshot() : null;
  var old = G.equipment[targetSlot];
  if(old){ G.inventory[old] = (G.inventory[old]||0) + 1; }
  G.equipment[targetSlot] = id;
  if(typeof removeItem === 'function') removeItem(id, 1);
  if(typeof notify === 'function') notify('Equipped '+def.n,'info');
  if(typeof renderInventory === 'function') renderInventory();
  if(typeof renderLoadout === 'function') renderLoadout();
  if(typeof window._renderInvFancy === 'function') window._renderInvFancy();
  if(_b && typeof routeEquipGesture === 'function') routeEquipGesture(_b);
}
window._equipToSlot = equipToSlot;

/* ─── Wire bag tiles as drag sources ─── */
function makeTileDraggable(tile){
  if(tile.dataset.dragWired === '1') return;
  /* Only wire if explicitly draggable */
  if(tile.getAttribute('draggable') !== 'true') return;
  tile.dataset.dragWired = '1';
  var id = tile.dataset.itemId;
  if(!id) return;
  var def = (typeof ITEMS!=='undefined') ? ITEMS[id] : null;
  if(!def) return;
  tile.addEventListener('dragstart', function(e){
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    tile.classList.add('dragging');
    /* Highlight valid drop targets */
    document.querySelectorAll('.td-slot').forEach(function(slot){
      var slotName = slot.className.match(/td-([a-z0-9]+)/i);
      if(!slotName) return;
      var t = slotName[1];
      /* Skip the doll classname stem itself */
      if(t === 'doll' || t === 'slot') return;
      /* Find specific slot via class list */
      var slotKey = null;
      ['helmet','necklace','earrings','cape','weapon','ammo','ring1','body','ring2','gloves','belt','pants','boots','companion'].forEach(function(s){
        if(slot.classList.contains('td-'+s)) slotKey = s;
      });
      if(slotKey && isSlotCompatible(def, slotKey)){
        slot.classList.add('drop-target');
      } else if(slotKey){
        slot.classList.add('drop-invalid');
      }
    });
  });
  tile.addEventListener('dragend', function(){
    tile.classList.remove('dragging');
    document.querySelectorAll('.td-slot').forEach(function(slot){
      slot.classList.remove('drop-target','drop-invalid','drop-hover');
    });
    document.querySelectorAll('.invc-bag-col').forEach(function(c){
      c.classList.remove('drop-target');
    });
  });
}

/* ─── Wire equipment slots as drop targets ─── */
function makeSlotDroppable(slot){
  if(slot.dataset.dropWired === '1') return;
  slot.dataset.dropWired = '1';
  /* Find slot key from class list */
  var slotKey = null;
  ['helmet','necklace','earrings','cape','weapon','ammo','ring1','body','ring2','gloves','belt','pants','boots','companion'].forEach(function(s){
    if(slot.classList.contains('td-'+s)) slotKey = s;
  });
  if(!slotKey) return;

  slot.addEventListener('dragover', function(e){
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if(slot.classList.contains('drop-target')) slot.classList.add('drop-hover');
  });
  slot.addEventListener('dragleave', function(){
    slot.classList.remove('drop-hover');
  });
  slot.addEventListener('drop', function(e){
    e.preventDefault();
    var id = e.dataTransfer.getData('text/plain');
    if(!id) return;
    equipToSlot(id, slotKey);
  });

  /* Also make the slot itself a drag SOURCE if it has an item — drag to bag = unequip */
  var equippedId = equippedItemG(slotKey);
  if(equippedId){
    slot.setAttribute('draggable','true');
    slot.addEventListener('dragstart', function(e){
      e.dataTransfer.setData('text/unequip', slotKey);
      e.dataTransfer.effectAllowed = 'move';
      /* Highlight bag as valid drop */
      document.querySelectorAll('.invc-bag-col').forEach(function(c){
        c.classList.add('drop-target');
      });
    });
  }
}

/* ─── Wire bag column as drop target for unequip ─── */
function makeBagDroppable(bagCol){
  if(bagCol.dataset.dropWired === '1') return;
  bagCol.dataset.dropWired = '1';
  bagCol.addEventListener('dragover', function(e){
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  bagCol.addEventListener('drop', function(e){
    e.preventDefault();
    var slotKey = e.dataTransfer.getData('text/unequip');
    if(slotKey && typeof unequip === 'function'){
      unequip(slotKey);
      if(typeof window._renderInvFancy === 'function') window._renderInvFancy();
    }
  });
}

/* ─── Apply wiring after every inventory render ─── */
function wireDragDrop(){
  document.querySelectorAll('.invc-tile').forEach(makeTileDraggable);
  document.querySelectorAll('.td-slot').forEach(makeSlotDroppable);
  document.querySelectorAll('.invc-bag-col').forEach(makeBagDroppable);
}
window._wireDragDrop = wireDragDrop;

/* Hook into the render */
(function(){
  var orig = window._renderInvFancy;
  if(typeof orig === 'function'){
    window._renderInvFancy = function(){
      var r = orig.apply(this, arguments);
      setTimeout(wireDragDrop, 30);
      return r;
    };
  }
})();

setTimeout(wireDragDrop, 600);

/* Also re-wire on any tab switch back to inventory */
window.HearthriseShowTab.wrapShowTab('inv-dragdrop', function(t){
  // b407 flicker fix: wire synchronously (was 150ms defer). This tap is
  // registered AFTER 'inv-fancy', and taps run in registration order within one
  // dispatch, so renderInvFancy() has already rebuilt the grid by the time this
  // runs — the drag-drop targets exist. Verified: grid present at wire time.
  if(t === 'inventory') wireDragDrop();
});

})(); // ← close outer IIFE for drag-drop block
