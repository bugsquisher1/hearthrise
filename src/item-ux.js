// ============================================================
// src/item-ux.js
//
// Two related inventory UX features:
//
//   1. Hover tooltip (Idle Clans-style)
//      Hovering any inventory tile pops up a tooltip showing:
//        • Item name + icon
//        • Stat comparison vs currently equipped item in the same slot
//          (3 lines: melee / ranged / magic — STR / ACC / DEF each)
//        • Buy / Sell price (and resource value if applicable)
//        • Quantity in stack
//
//   2. Quantity slider for stackable items
//      When right-clicking (or long-pressing on touch) a stackable
//      item, show a slider modal: choose 1..max, then Sell / Drop.
//
// Loads as a CLASSIC script after legacy.js. Hooks via DOM events
// so it survives all the renderInvNew() re-renders.
// ============================================================

(function(){
  'use strict';

  // ---- Shop availability lookup --------------------------------
  // Returns true if an item is actually sold by an NPC shop.
  function isItemSoldByNpc(id){
    var equipShop = window.EQUIP_SHOP || [];
    var seedShop = window.SEED_SHOP || [];
    if(equipShop.some(function(s){ return s.id === id; })) return true;
    if(seedShop.some(function(s){ return s.id === id; })) return true;
    return false;
  }

  // ---- Tooltip element ----------------------------------------
  var tip = document.createElement('div');
  tip.id = 'item-tooltip';
  tip.style.cssText = 'display:none;position:fixed;z-index:99980;pointer-events:none;';
  document.body.appendChild(tip);

  function fmtSign(n){
    if(n === undefined || n === null) return '–';
    if(n > 0) return '+' + n;
    if(n < 0) return String(n);
    return '0';
  }
  function colorFor(delta){
    if(delta > 0) return '#7f9a4f';
    if(delta < 0) return '#ff8c8c';
    return 'var(--ink-3)';
  }

  function statLine(label, icon, str, acc, def){
    function pill(stat, val){
      var cls = val > 0 ? 'good' : val < 0 ? 'bad' : 'zero';
      return '<span class="ttl-pill ' + cls + '">' +
        '<b>' + stat + '</b><i>' + (val === 0 || val === undefined ? '–' : fmtSign(val)) + '</i>' +
        '</span>';
    }
    return '<div class="ttl-row">' +
      '<span class="ttl-row-icon">' + icon + '</span>' +
      pill('STR', str) + pill('ACC', acc) + pill('DEF', def) +
    '</div>';
  }

  // Compute net stat deltas if the player swapped to this item.
  // Returns {melee:{str,acc,def}, ranged:{...}, magic:{...}, slot}
  function compareToEquipped(itemId){
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item || !item.slot) return null;
    var slot = item.slot;
    var equippedId = window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(window.G, slot) : (window.G && window.G.equipment && window.G.equipment[slot]);
    var equipped = equippedId && window.ITEMS && window.ITEMS[equippedId];

    function statsOf(it){
      if(!it) return {str:0, acc:0, def:0, rangedStr:0, rangedAcc:0, rangedDef:0, magicStr:0, magicAcc:0, magicDef:0};
      return {
        str:        (it.strB || 0),
        acc:        (it.atkB || it.accB || 0),
        def:        (it.defB || 0),
        rangedStr:  (it.rangeStrB || it.strB || 0),
        rangedAcc:  (it.rangeAtkB || it.atkB || 0),
        rangedDef:  (it.defB || 0),
        magicStr:   (it.magicStrB || 0),
        magicAcc:   (it.magicAtkB || 0),
        magicDef:   (it.defB || 0),
      };
    }
    var newS = statsOf(item);
    var curS = statsOf(equipped);

    return {
      slot: slot,
      melee:  { str: newS.str        - curS.str,        acc: newS.acc        - curS.acc,        def: newS.def       - curS.def },
      ranged: { str: newS.rangedStr  - curS.rangedStr,  acc: newS.rangedAcc  - curS.rangedAcc,  def: newS.rangedDef - curS.rangedDef },
      magic:  { str: newS.magicStr   - curS.magicStr,   acc: newS.magicAcc   - curS.magicAcc,   def: newS.magicDef  - curS.magicDef },
      hasEquipped: !!equipped,
      equippedName: equipped ? (equipped.n || equippedId) : null,
    };
  }

  /* ── b348 · WHAT DO I NEED TO WEAR THIS? ────────────────────────────────
     Xarn: "Is it possible to add the level-requirements for gear to see when we
     can wear those items?" b341 put exactly this on the SHOP row; the hover
     tooltip — the surface a player uses to compare gear they already own — never
     said it at all. Measured before this change: hovering a Steel Platebody
     produced +22 DEF, a vs-equipped line, a vendor price and a market price, and
     not one word about needing Defence 30.

     It reads `gearWieldReq`, the same pair equipItem() enforces (legacy.js:4660)
     and the shop row asks. That matters beyond tidiness: the six classic
     hand-authored plate pieces (iron/steel helm + platebody, bronze belt) carry
     NO `reqSkill`/`reqLv` fields at all — their gate is derived from `tier`. Any
     surface reading the raw fields therefore shows nothing for precisely the
     gear a mid-game player is looking at, which is why the item modal was
     silent too. One authority, asked at every point of decision.

     Armour requirements are DEFENCE-ONLY by standing ruling (Tyler, 2026-08-15
     — see the armour block in src/data/gear-tiers.js): there is no per-style
     requirement to display, and there must never be one, because defence-only
     gating is what keeps mix-and-match armour viable. */
  function wieldLine(itemId, item){
    if(typeof window.gearWieldReq !== 'function') return '';
    var req = window.gearWieldReq(item);
    if(!req) return '';
    var SD = window.SKILLS_DEF || {};
    var skillName = (SD[req.skill] && SD[req.skill].name) || req.skill;
    var w = (typeof window.canWield === 'function') ? window.canWield(itemId) : { ok: true };
    var have = (typeof window.getLevel === 'function') ? window.getLevel(req.skill) : null;
    /* "Already worn" is its own state, not a pass: the grandfather list keeps
       gear you have legitimately equipped once re-wearable forever, so saying
       "met" when the level is not met would be a different lie. */
    var grandfathered = w.ok && have !== null && have < req.lv;
    var status = grandfathered
      ? 'already unlocked for you'
      : w.ok
        ? 'you can wear this'
        : 'you have ' + (have === null ? '—' : have);
    /* Two BLOCK lines, not a flex row: the tooltip is ~280px, and flexing the
       bold clause against a trailing one wrapped it mid-phrase
       ("Requires / Defense Lv / 30  to wear you have 15"). Verified in the
       browser at the real tooltip width. */
    return '<div class="ttl-req ' + (w.ok ? 'met' : 'unmet') + '">'
      + '<span class="ttl-req-line"><b>Requires ' + skillName + ' Lv ' + req.lv + '</b> to wear</span>'
      + '<i>' + status + '</i></div>';
  }

  function renderTooltip(itemId, qty){
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return '';
    var iconHtml = '';
    if(window._itemPath && window._itemPath[itemId]){
      iconHtml = '<img src="' + window._itemPath[itemId] + '" alt="">';
    } else {
      iconHtml = '<span>' + (item.icon || '📦') + '</span>';
    }

    var head = '<div class="ttl-head">' +
      '<div class="ttl-icon">' + iconHtml + '</div>' +
      '<div class="ttl-title">' +
        '<div class="ttl-name">' + (item.n || itemId) + '</div>' +
        (item.slot ? '<div class="ttl-sub">' + item.slot.toUpperCase() + '</div>' : '') +
      '</div>' +
      (qty > 1 ? '<div class="ttl-qty">×' + qty + '</div>' : '') +
    '</div>';

    /* b278: name the armour archetype so the combat triangle is unmistakable —
       the per-style stat lines below already show the +/− accuracy it grants. */
    var _armLabel = { plate: 'Heavy armour · melee', leather: 'Leather · ranged', cloth: 'Cloth · magic' };
    var archetypeTag = (item.type === 'armor' && item.armourClass && _armLabel[item.armourClass])
      ? '<div class="ttl-archetype">' + _armLabel[item.armourClass] + '</div>'
      : '';

    var statsBlock = archetypeTag + wieldLine(itemId, item);
    if(item.slot && (item.type === 'weapon' || item.type === 'armor' || item.type === 'jewelry')){
      var cmp = compareToEquipped(itemId);
      if(cmp){
        statsBlock += '<div class="ttl-stats">';
        statsBlock += statLine('Melee',  '⚔️', cmp.melee.str,  cmp.melee.acc,  cmp.melee.def);
        statsBlock += statLine('Ranged', '🏹', cmp.ranged.str, cmp.ranged.acc, cmp.ranged.def);
        statsBlock += statLine('Magic',  '🔮', cmp.magic.str,  cmp.magic.acc,  cmp.magic.def);
        statsBlock += '</div>';
        if(cmp.hasEquipped){
          statsBlock += '<div class="ttl-cmp">vs equipped: <b>' + cmp.equippedName + '</b></div>';
        } else {
          statsBlock += '<div class="ttl-cmp">no item equipped in this slot</div>';
        }
      }
    }

    var marketBlock = '<div class="ttl-market">';
    // b224: say what the food IS and what pressing it does, in plain words.
    // The old rows showed a heal number and a raw buff key ("gather_speed"),
    // which left a Provision and a Feast looking identical on hover.
    var food = (typeof window.foodUseInfo === 'function') ? window.foodUseInfo(itemId) : null;
    if(food){
      marketBlock += '<div class="ttl-row-2"><b>' + food.label + '</b><i>' + food.verb.toLowerCase() + ' to use</i></div>';
      if(food.heals){
        marketBlock += '<div class="ttl-row-2"><span>❤️</span><b>+' + food.heals + ' HP</b><i>' + (food.kind === 'provision' ? 'heals' : 'also heals') + '</i></div>';
      }
      if(food.buffText){
        marketBlock += '<div class="ttl-row-2"><span>🌟</span><b>' + food.buffText + '</b></div>';
      }
      marketBlock += '<div class="ttl-row-2"><i>' + (food.autoEatable ? 'Auto-eat can use this' : 'Never auto-eaten') + '</i></div>';
    } else {
      if(item.heals){
        marketBlock += '<div class="ttl-row-2"><span>❤️</span><b>+' + item.heals + ' HP</b></div>';
      }
      if(item.buff && item.buff.type){
        marketBlock += '<div class="ttl-row-2"><span>🌟</span><b>+' + item.buff.magnitude + '% ' + item.buff.type.replace(/_/g, ' ') + '</b><i>' + Math.round((item.buff.durationMs||0)/60000) + 'm</i></div>';
      }
    }
    if(item.buryXp){
      marketBlock += '<div class="ttl-row-2"><span>🙏</span><b>+' + item.buryXp + ' Prayer XP</b><i>on bury</i></div>';
    }
    // Bind-on-Pickup tag (untradeable, bound to player). Show prominently.
    if(item.bop){
      marketBlock += '<div class="ttl-row-2 ttl-bop"><span>🔒</span><b>Bind on Pickup</b><i>untradeable</i></div>';
    }

    // NPC value: only show if the item is actually sold by an NPC shop
    // (EQUIP_SHOP or SEED_SHOP). Otherwise just show vendor sell-back.
    if(item.v){
      /* b226: routed through the single vendorPrice() choke-point. This path
         used to pay v × 0.5 while every OTHER sell button in the game paid the
         full v — the same item fetched two different prices depending on which
         control you pressed. One price, one place. */
      var sellPrice = (typeof window.vendorPrice === 'function') ? window.vendorPrice(itemId) : Math.max(1, Math.floor(item.v * 0.5));
      var isNpcSold = isItemSoldByNpc(itemId);
      if(isNpcSold){
        marketBlock += '<div class="ttl-row-2"><span>🏪</span><b>NPC value</b><i>' + item.v + 'g · sells back ' + sellPrice + 'g</i></div>';
      } else if(!item.bop){
        // Item is not in any NPC shop, but is tradeable — just show vendor buyback.
        marketBlock += '<div class="ttl-row-2"><span>💰</span><b>Vendor buys</b><i>' + sellPrice + 'g each</i></div>';
      } else {
        // BoP and not in NPC shop: show neither vendor lines (untradeable).
      }
      // Player market line: only for tradeable items.
      if(!item.bop){
        var pmAvg = (typeof window.getMarketAvgPrice === 'function') ? window.getMarketAvgPrice(itemId) : null;
        marketBlock += '<div class="ttl-row-2"><span>📈</span><b>Player market avg</b><i>' + (pmAvg ? pmAvg.toLocaleString() + 'g' : '— (no recent sales)') + '</i></div>';
      }
    }
    marketBlock += '</div>';

    // b242: the flavour line (what is it), between the name and the stats.
    var descLine = '';
    if(typeof window.itemDesc === 'function'){ var dd = window.itemDesc(itemId); if(dd) descLine = '<div class="ttl-desc">' + dd + '</div>'; }
    return head + descLine + statsBlock + marketBlock;
  }

  function showTip(target, itemId){
    var qty = (window.G && window.G.inventory && window.G.inventory[itemId]) || 1;
    var html = renderTooltip(itemId, qty);
    if(!html){ tip.style.display = 'none'; return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    // Position relative to the target tile
    var r = target.getBoundingClientRect();
    var w = tip.offsetWidth || 280;
    var h = tip.offsetHeight || 200;
    var x = r.right + 8;
    var y = r.top;
    if(x + w > window.innerWidth - 8) x = r.left - w - 8;
    if(y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
    if(y < 8) y = 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip(){ tip.style.display = 'none'; }

  function getItemIdFromTile(el){
    if(!el) return null;
    if(el.dataset && el.dataset.itemId) return el.dataset.itemId;
    var oc = el.getAttribute('onclick') || '';
    var m = oc.match(/(?:invItemTap|onItemTap)\(['"]([^'"]+)['"]\)/);
    return m ? m[1] : null;
  }

  // Delegated mouseover/mouseout on all inventory-style tiles.
  // Covers: .invc-tile, .item-slot (legacy), .inv-bag-tile, etc.
  // b241 (paione): the hover tooltip is a DESKTOP-only affordance. On touch there
  // is no reliable mouseleave, so a tap-synthesised mouseover left this tooltip
  // STUCK over the inventory + the tap flyout until you scrolled. The tap flyout
  // (openInvDetail) already shows all of this on mobile, so we skip the hover tip
  // entirely when the primary pointer can't hover — and dismiss on any touch as
  // a belt-and-braces guard.
  var canHover = !(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
  document.addEventListener('mouseover', function(e){
    if(!canHover) return;
    var tile = e.target.closest && e.target.closest('.invc-tile, .item-slot, [data-item-id]');
    if(!tile) return;
    var id = getItemIdFromTile(tile);
    if(!id) return;
    showTip(tile, id);
  }, true);
  document.addEventListener('mouseout', function(e){
    var tile = e.target.closest && e.target.closest('.invc-tile, .item-slot, [data-item-id]');
    if(!tile) return;
    var rel = e.relatedTarget;
    if(rel && tile.contains(rel)) return;
    hideTip();
  }, true);
  document.addEventListener('scroll', hideTip, true);
  document.addEventListener('touchstart', hideTip, true);   // b241: a tap clears any stray tip

  // ---- Quantity slider modal ----------------------------------
  var slider = document.createElement('div');
  slider.id = 'qty-slider-overlay';
  slider.style.cssText = 'display:none;position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.7);align-items:center;justify-content:center;';
  slider.innerHTML = '<div class="qs-modal">' +
    '<button class="qs-close" aria-label="Close">✕</button>' +
    '<div class="qs-title" id="qs-title">Item</div>' +
    '<div class="qs-icon" id="qs-icon">📦</div>' +
    '<div class="qs-row">' +
      '<input type="range" id="qs-range" min="1" max="100" value="1">' +
      '<input type="number" id="qs-num" min="1" max="100" value="1">' +
    '</div>' +
    '<div class="qs-quick">' +
      '<button class="qs-q" data-frac="1">All</button>' +
      '<button class="qs-q" data-frac=".5">Half</button>' +
      '<button class="qs-q" data-frac=".25">¼</button>' +
      '<button class="qs-q" data-fixed="10">10</button>' +
      '<button class="qs-q" data-fixed="100">100</button>' +
    '</div>' +
    '<div class="qs-summary" id="qs-summary"></div>' +
    '<div class="qs-actions">' +
      '<button class="qs-btn qs-btn-secondary" id="qs-cancel">Cancel</button>' +
      '<button class="qs-btn qs-btn-action" id="qs-action" style="display:none"></button>' +
      '<button class="qs-btn qs-btn-primary" id="qs-sell">💰 Sell</button>' +
    '</div>' +
  '</div>';
  slider.addEventListener('click', function(e){ if(e.target === slider) closeSlider(); });
  document.body.appendChild(slider);

  var sliderState = { id: null, max: 1 };

  // Resolve a context-sensitive action for an item id.
  // Returns {label, icon, hint, fn} or null if the item has no special action.
  function resolveAction(itemId){
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return null;
    // Bones → Bury (prayer XP)
    if(item.buryXp){
      return {
        label: 'Bury',
        icon: '🙏',
        hint: '+' + item.buryXp + ' Prayer XP each',
        fn: function(qty){
          // b265: route through the one bury path so every surface buries + awards
          // XP identically (slider passes an explicit qty; a plain Bury = whole stack).
          if(typeof window.buryBones === 'function'){ window.buryBones(itemId, qty); return; }
          if(typeof window.removeItem === 'function') window.removeItem(itemId, qty);
          else { window.G.inventory[itemId] = Math.max(0, (window.G.inventory[itemId]||0) - qty); }
          if(typeof window.addXp === 'function') window.addXp('prayer', item.buryXp * qty);
          if(typeof window.notify === 'function') window.notify('Buried ' + qty + '× ' + item.n + ' for ' + (item.buryXp * qty) + ' Prayer XP', 'levelup');
        },
      };
    }
    // Food → Eat / Drink / Use. b224: the verb and the hint come from
    // foodUseInfo() so the quantity slider agrees with every other surface.
    var food = (typeof window.foodUseInfo === 'function') ? window.foodUseInfo(itemId) : null;
    if(food){
      return {
        label: food.verb,
        icon: '🍴',
        hint: food.kind === 'provision'
          ? ('+' + food.heals + ' HP each')
          : (food.buffText || ('+' + food.heals + ' HP each')),
        fn: function(qty){
          for(var i = 0; i < qty; i++){
            if(typeof window.eatFood !== 'function') break;
            if(!window.eatFood(itemId)) break;
          }
        },
      };
    }
    if(item.heals || item.buff){
      return {
        label: 'Eat',
        icon: '🍴',
        hint: item.buff ? '+' + item.buff.magnitude + '% ' + item.buff.type.replace(/_/g, ' ') : ('+' + item.heals + ' HP each'),
        fn: function(qty){
          for(var i = 0; i < qty; i++){
            if(typeof window.eatFood === 'function'){
              var ok = window.eatFood(itemId);
              if(!ok) break;
            } else {
              break;
            }
          }
        },
      };
    }
    // Seeds → Plant
    if(item.seed){
      return {
        label: 'Plant',
        icon: '🌱',
        hint: 'Open the Farm to plant',
        fn: function(){
          if(typeof window.showTab === 'function') window.showTab('farming');
          if(typeof window.notify === 'function') window.notify('Pick an empty plot on the Farm to plant ' + item.n, 'info');
          closeSlider();
        },
      };
    }
    // Raw fish → Cook (deep-link to cooking)
    if(itemId === 'shrimp' || itemId === 'trout' || itemId === 'lobster' || itemId === 'shark'){
      return {
        label: 'Cook',
        icon: '🍳',
        hint: 'Open Activities → Cooking',
        fn: function(){
          if(typeof window.showTab === 'function') window.showTab('skills');
          if(typeof window.openSkillDetail === 'function') window.openSkillDetail('cooking');
          if(typeof window.notify === 'function') window.notify('Opening Cooking', 'info');
          closeSlider();
        },
      };
    }
    // Raw ore → Smelt (deep-link to smithing)
    if(/_ore$/.test(itemId)){
      return {
        label: 'Smelt',
        icon: '🔥',
        hint: 'Open Activities → Smithing',
        fn: function(){
          if(typeof window.showTab === 'function') window.showTab('skills');
          if(typeof window.openSkillDetail === 'function') window.openSkillDetail('smithing');
          closeSlider();
        },
      };
    }
    // Logs → Saw (deep-link to crafting)
    if(/_log$/.test(itemId)){
      return {
        label: 'Saw',
        icon: '🪚',
        hint: 'Open Activities → Crafting',
        fn: function(){
          if(typeof window.showTab === 'function') window.showTab('skills');
          if(typeof window.openSkillDetail === 'function') window.openSkillDetail('crafting');
          closeSlider();
        },
      };
    }
    // Equippable gear → Equip
    if(item.slot && (item.type === 'weapon' || item.type === 'armor' || item.type === 'jewelry' || item.type === 'companion')){
      return {
        label: 'Equip',
        icon: '🎽',
        hint: 'Equip in ' + item.slot + ' slot',
        fn: function(){
          if(typeof window.equipItem === 'function') window.equipItem(itemId);
          closeSlider();
        },
      };
    }
    return null;
  }

  function openSlider(itemId){
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return;
    var qty = (window.G && window.G.inventory && window.G.inventory[itemId]) || 0;
    if(qty <= 0) return;
    sliderState.id = itemId;
    sliderState.max = qty;
    sliderState.action = resolveAction(itemId);
    var titleEl = document.getElementById('qs-title');
    var iconEl = document.getElementById('qs-icon');
    var rangeEl = document.getElementById('qs-range');
    var numEl = document.getElementById('qs-num');
    var actBtn = document.getElementById('qs-action');
    titleEl.textContent = item.n + ' (×' + qty + ')';
    iconEl.innerHTML = window._itemPath && window._itemPath[itemId]
      ? '<img src="' + window._itemPath[itemId] + '" alt="">'
      : (item.icon || '📦');
    rangeEl.max = qty;
    rangeEl.value = qty;
    numEl.max = qty;
    numEl.value = qty;

    // Show/hide the contextual action button
    if(sliderState.action){
      actBtn.style.display = '';
      actBtn.innerHTML = sliderState.action.icon + ' ' + sliderState.action.label;
      actBtn.title = sliderState.action.hint || '';
    } else {
      actBtn.style.display = 'none';
    }

    updateSliderSummary();
    slider.style.display = 'flex';
  }
  window.openQtySlider = openSlider;

  function closeSlider(){ slider.style.display = 'none'; sliderState.id = null; }
  function updateSliderSummary(){
    var item = sliderState.id && window.ITEMS && window.ITEMS[sliderState.id];
    if(!item) return;
    var qty = parseInt(document.getElementById('qs-num').value, 10) || 1;
    var sellEach = (typeof window.vendorPrice === 'function') ? window.vendorPrice(sliderState.id) : Math.max(1, Math.floor((item.v || 0) * 0.5));
    var totalSell = sellEach * qty;
    var lines = [];
    lines.push('<div class="qs-sum-row">💰 Sell ' + qty + ' for <b>' + totalSell.toLocaleString() + 'g</b> <i>(' + sellEach + 'g each)</i></div>');
    if(sliderState.action && sliderState.action.hint){
      lines.push('<div class="qs-sum-row">' + sliderState.action.icon + ' ' + sliderState.action.label + ' ' + qty + ' — <b>' + sliderState.action.hint + '</b></div>');
    }
    document.getElementById('qs-summary').innerHTML = lines.join('');
  }

  document.getElementById('qs-range').addEventListener('input', function(){
    document.getElementById('qs-num').value = this.value;
    updateSliderSummary();
  });
  document.getElementById('qs-num').addEventListener('input', function(){
    var v = Math.max(1, Math.min(sliderState.max, parseInt(this.value, 10) || 1));
    this.value = v;
    document.getElementById('qs-range').value = v;
    updateSliderSummary();
  });
  slider.querySelectorAll('.qs-q').forEach(function(b){
    b.addEventListener('click', function(){
      var v;
      if(this.dataset.frac){
        v = Math.max(1, Math.floor(sliderState.max * parseFloat(this.dataset.frac)));
      } else {
        v = Math.min(sliderState.max, parseInt(this.dataset.fixed, 10) || 1);
      }
      document.getElementById('qs-range').value = v;
      document.getElementById('qs-num').value = v;
      updateSliderSummary();
    });
  });
  document.getElementById('qs-cancel').addEventListener('click', closeSlider);
  slider.querySelector('.qs-close').addEventListener('click', closeSlider);
  document.getElementById('qs-sell').addEventListener('click', function(){
    var qty = parseInt(document.getElementById('qs-num').value, 10);
    var id = sliderState.id;
    if(!id || qty <= 0) return;
    var item = window.ITEMS[id];
    // b240: respect the sell-lock and record for buy-back, like every sell path.
    if(typeof window.isItemLocked === 'function' && window.isItemLocked(id)){
      if(typeof window.notify === 'function') window.notify(item.n + ' is locked — unlock it first', 'kill');
      return;
    }
    var unit = (typeof window.vendorPrice === 'function') ? window.vendorPrice(id) : Math.max(1, Math.floor((item.v || 0) * 0.5));
    var goldGain = unit * qty;
    /* THE PAYMENT GOES THROUGH THE SEAM (src/net/gold.js) like every other
       vendor path — ledger site `vendor.quick_sell` — and it happens BEFORE the
       items leave the bag. `goldSettle` THROWS when the kill switch is on and
       src/net/gold.js is absent, and a throw between "items gone" and "gold
       paid" is the only way this handler can cost a player their stack.
       b377: chunk into ≤MAX_QTY intents so a stack over 1,000 pays fully instead
       of having its whole prediction rolled back by one oversized refusal.
       `vendorSellChunked` lives in legacy.js, which loads before this classic
       script — the same assumption the goldSettle call it replaces already made. */
    window.vendorSellChunked(id, qty, 'vendor.quick_sell');
    if(typeof window.removeItem === 'function') window.removeItem(id, qty);
    else { window.G.inventory[id] = Math.max(0, (window.G.inventory[id]||0) - qty); }
    if(typeof window.recordVendorSale === 'function') window.recordVendorSale(id, qty, unit);
    if(typeof window.notify === 'function') window.notify('Sold ' + qty + '× ' + item.n + ' for ' + goldGain + 'g', 'loot');
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    closeSlider();
  });
  // Contextual action button (Bury / Eat / Plant / Cook / Smelt / Saw / Equip)
  document.getElementById('qs-action').addEventListener('click', function(){
    var qty = parseInt(document.getElementById('qs-num').value, 10);
    var act = sliderState.action;
    if(!act || qty <= 0) return;
    act.fn(qty);
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    if(typeof window.renderActiveEffects === 'function') window.renderActiveEffects();
    closeSlider();
  });

  // Right-click any inventory tile = open quantity slider (only for stacks).
  document.addEventListener('contextmenu', function(e){
    var tile = e.target.closest && e.target.closest('.invc-tile, .item-slot, [data-item-id]');
    if(!tile) return;
    var id = getItemIdFromTile(tile);
    if(!id) return;
    var qty = (window.G && window.G.inventory && window.G.inventory[id]) || 0;
    // Skip equipped/single items — only useful for stacks
    if(qty < 2) return;
    e.preventDefault();
    hideTip();
    openSlider(id);
  });

  // Long-press on touch devices (~500ms) = same as right-click
  var lpTimer = null, lpTile = null;
  document.addEventListener('touchstart', function(e){
    var tile = e.target.closest && e.target.closest('.invc-tile, .item-slot, [data-item-id]');
    if(!tile) return;
    lpTile = tile;
    lpTimer = setTimeout(function(){
      var id = getItemIdFromTile(tile);
      var qty = (window.G && window.G.inventory && window.G.inventory[id]) || 0;
      if(id && qty >= 2){ openSlider(id); lpTile = null; }
    }, 500);
  }, {passive: true});
  document.addEventListener('touchend', function(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; lpTile = null; } });
  document.addEventListener('touchmove', function(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer = null; lpTile = null; } });

  console.log('[item-ux] tooltip + qty slider loaded');
})();
