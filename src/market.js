// ============================================================
// src/market.js
//
// Player Market — listing-based exchange. Sellers post listings
// (item + qty + ask price). Buyers see open listings and buy
// outright. No direct player-to-player trade.
//
// Local-dev backend = in-memory + localStorage. Production target
// is a Supabase `market_listings` table (schema sketched at the
// bottom of this file).
//
// Rules:
//   • BoP (bind-on-pickup) items cannot be listed.
//   • Sellers escrow their qty when listing — you can't sell what
//     you've already given to someone else.
//   • A 1.5% house tax is taken from the sale price on completion.
//   • Listings expire in 48h if unsold.
//   • Per-character listing cap: 12 active listings.
// ============================================================

(function(){
  'use strict';

  /* One gilt chrome glyph for this module's headings/chips. Returns '' rather
     than a pictograph when the atlas has no match — a hole is a bug we can see;
     an emoji is a bug that ships. */
  function _mkGly(key, px, col){
    return (window.HR && window.HR.icon)
      ? (window.HR.icon(key, px || 15, col || 'currentColor') || '')
      : '';
  }

  const MARKET_KEY = 'hearthrise:market:listings';   // dev-only local mirror
  const OFFERS_KEY = 'hearthrise:market:offers';     // open buy-offers
  // Starting at 1.5% for soft beta — low enough to feel non-punitive while
  // still draining a small amount of gold from the economy. Tune up/down
  // post-beta based on listing velocity and floor-price stability.
  const HOUSE_TAX = 0.015;
  const LISTING_TTL_MS = 48 * 3600 * 1000;
  const PER_CHAR_LIMIT_BASE = 12;
  const PRICE_HISTORY_KEY = 'hearthrise:market:history';

  /* b228 (bonus-rebase.md §5.3): the Count's rank stops paying +1% XP and
     starts paying a MARKET LISTING SLOT. `marketSlots` has been declared in
     renown.getPerks() since renown shipped and nothing ever granted or read
     it — this is the reader, and the perk is the grant.

     A slot is ACCESS, not throughput (§2.5): it does not multiply anything,
     cannot compound, and costs the power budget nothing — which is exactly why
     it is the right payload for a rank that costs 13,500 renown and could not
     be justified by the +1% the rebase would otherwise have left there.

     A function rather than a constant because it now depends on player state.
     Reads defensively: no renown module → the base 12, never a crash and never
     a silent extra slot. Server-side listing caps (the `market_listings` RPC
     path) remain the authority when the backend is live; this is the client's
     honest local mirror of the same rule. */
  function listingLimit(){
    var extra = 0;
    try{
      if(window.HearthriseRenown && typeof window.HearthriseRenown.getPerks === 'function'){
        extra = Math.max(0, window.HearthriseRenown.getPerks(window.G).marketSlots | 0);
      }
    }catch(e){}
    return PER_CHAR_LIMIT_BASE + extra;
  }

  // ── State ─────────────────────────────────────────────────────
  // Listings: { id, sellerId, sellerName, itemId, qty, askEach, postedAt }
  // History:  { itemId, soldEach, qty, at } — keep last 50 sales per item.
  function loadListings(){
    try { return JSON.parse(localStorage.getItem(MARKET_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveListings(list){
    try { localStorage.setItem(MARKET_KEY, JSON.stringify(list)); }
    catch(e){}
  }
  function loadHistory(){
    try { return JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveHistory(h){
    try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(h)); }
    catch(e){}
  }
  // ── Buy offers (open buy orders) ───────────────────────────
  // Schema: { id, buyerId, buyerName, itemId, qty, maxEach, postedAt, escrowed }
  // Gold is escrowed up-front (buyer can't double-spend the same gold).
  // When a matching sell listing posts at <= maxEach, the offer auto-fills.
  function loadOffers(){
    try { return JSON.parse(localStorage.getItem(OFFERS_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveOffers(arr){
    try { localStorage.setItem(OFFERS_KEY, JSON.stringify(arr)); } catch(e){}
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE SERVER SEAM (b355) — market v2's client half, DARK behind the SAME
     kill switch as accrual, activity, character, record and the gold verbs.
     ══════════════════════════════════════════════════════════════════════
     Three verbs — market_list / market_cancel / market_buy — reached through
     `window.HearthriseGold`, exactly as the shop and vendor gestures are. The
     gold half of a purchase goes through `window.goldSettleCurrency`, so the
     prediction is recorded, retired and swept by the ONE ledger in
     src/net/gold.js rather than by a second one written for the market.

     ⚠ THE V1 BACKEND AND THE V2 VERBS ARE MUTUALLY EXCLUSIVE, AND THAT IS THE
       WHOLE OF THE SWAP. `src/net/supabase-market-backend.js` writes
       market_listings DIRECTLY from the browser. Under market v2 there is no
       client write grant on that table at all, so those writes cannot land —
       but if they COULD, running both would be two writers of one escrow with
       two different sets of rules, which is the defect the migration's
       supersession note is about. So every v1 push below is gated on the seam
       being OFF, in one predicate (`serverMarketActive`), never per call site.

     ⚠ THE SWITCH IS READ AT THE GESTURE, NOT CACHED. A flag that is sampled
       once at load is a flag that disagrees with itself for the rest of the
       session if it is flipped in devtools mid-play — which is exactly how it
       gets flipped during a switch-on test. */
  function marketApi(){
    var S = window.HearthriseGold;
    if(!S || typeof S.isGoldIntentEnabled !== 'function') return null;
    try { return S.isGoldIntentEnabled() ? S : null; } catch(e){ return null; }
  }
  function serverMarketActive(){ return !!marketApi(); }
  /** One key per attempt at a gesture, generated at the TAP so the prediction
   *  and the request share one identity. Null when the seam is off. */
  function marketIntentKey(){
    if(typeof window.goldIntentKey !== 'function') return null;
    try { return window.goldIntentKey(); } catch(e){ return null; }
  }
  /** A server row id is a uuid; a locally-created, not-yet-synced row is 'L…'.
   *  Only the first can be named to the server, and naming the second would
   *  earn a `bad_listing` for a listing that exists. */
  function isServerListingId(id){
    var S = window.HearthriseGold;
    return !!(S && typeof S.isListingId === 'function' && S.isListingId(String(id)));
  }
  /** Adopt the SERVER's listing id onto the local mirror row, so a later cancel
   *  or buy can name it. The id comes out of the server's own receipt — the
   *  same object hr_market_list returned inside the transaction that wrote the
   *  escrow — never out of anything this file computed. */
  function adoptServerListingId(localId, verdict){
    var r = verdict && verdict.body && verdict.body.receipt;
    var serverId = r && r.listing_id;
    if(!serverId) return;
    var list = loadListings();
    var idx = list.findIndex(function(l){ return l.id === localId; });
    if(idx < 0) return;
    list[idx].id = serverId;
    saveListings(list);
  }

  function recordSale(itemId, eachPrice, qty){
    var h = loadHistory();
    h[itemId] = h[itemId] || [];
    h[itemId].push({ eachPrice: eachPrice, qty: qty, at: Date.now() });
    if(h[itemId].length > 50) h[itemId] = h[itemId].slice(-50);
    saveHistory(h);
  }
  // Expose avg price so the item tooltip can show "Player market avg".
  window.getMarketAvgPrice = function(itemId){
    var h = loadHistory();
    var sales = h[itemId] || [];
    if(!sales.length) return null;
    var totalGold = 0, totalQty = 0;
    sales.forEach(function(s){ totalGold += s.eachPrice * s.qty; totalQty += s.qty; });
    return totalQty > 0 ? Math.round(totalGold / totalQty) : null;
  };

  // ── 7-day analytics ──────────────────────────────────────────
  // Returns { avgPrice, volume, salesCount, lastSale, lowest, highest }
  // where:
  //   avgPrice   = volume-weighted average price each over the last 7 days
  //   volume     = total qty sold in the last 7 days
  //   salesCount = number of separate sales transactions in the last 7 days
  //   lastSale   = ms-timestamp of most recent sale (any age)
  //   lowest     = lowest each-price seen in the window
  //   highest    = highest each-price seen in the window
  // Returns null if no sales recorded (ever, not just in window).
  var WINDOW_MS_7D = 7 * 24 * 3600 * 1000;
  function getStats7d(itemId){
    var h = loadHistory();
    var sales = h[itemId] || [];
    if(!sales.length) return null;
    var cutoff = Date.now() - WINDOW_MS_7D;
    var recent = sales.filter(function(s){ return s.at >= cutoff; });
    var lastSale = sales[sales.length-1].at;
    if(!recent.length){
      return { avgPrice:null, volume:0, salesCount:0, lastSale:lastSale, lowest:null, highest:null };
    }
    var totalGold = 0, volume = 0, lowest = Infinity, highest = 0;
    recent.forEach(function(s){
      totalGold += s.eachPrice * s.qty;
      volume    += s.qty;
      if(s.eachPrice < lowest)  lowest  = s.eachPrice;
      if(s.eachPrice > highest) highest = s.eachPrice;
    });
    return {
      avgPrice:  Math.round(totalGold / volume),
      volume:    volume,
      salesCount: recent.length,
      lastSale:  lastSale,
      lowest:    lowest,
      highest:   highest,
    };
  }
  // Top movers — items with the highest 7-day volume (gold value).
  function getTopMovers7d(limit){
    limit = limit || 10;
    var h = loadHistory();
    var rows = Object.keys(h).map(function(itemId){
      var s = getStats7d(itemId);
      if(!s || !s.volume) return null;
      return {
        itemId: itemId,
        avgPrice: s.avgPrice,
        volume:  s.volume,
        salesCount: s.salesCount,
        goldValue: s.avgPrice * s.volume,
      };
    }).filter(Boolean);
    rows.sort(function(a,b){ return b.goldValue - a.goldValue; });
    return rows.slice(0, limit);
  }
  window.getMarketStats7d  = getStats7d;
  window.getMarketTopMovers = getTopMovers7d;

  // ── Admin / QA seeding ───────────────────────────────────────
  // Drops fake listings from fictional sellers + plausible sales
  // history so the market panel's stats and search have real data
  // to work with during beta. Idempotent — only seeds if no fake
  // listings already exist.
  function seedFakeListings(){
    if(backendActive()){
      return { ok:false, reason:'Live market active — no NPC seeds (final directive: no fake data)' };
    }
    var existing = loadListings();
    if(existing.some(function(l){ return l.sellerId && l.sellerId.indexOf('npc-') === 0; })){
      return { ok:false, reason:'Already seeded — clear first via window.HearthriseMarket.clearSeed()' };
    }
    var items = window.ITEMS || {};
    var pool = [
      'iron_sword','steel_sword','iron_helm','steel_helm','iron_platebody',
      'wolf_pelt','bear_pelt','silk_thread','iron_ore','coal','gold_ore',
      'mithril_ore','oak_log','willow_log','maple_log','cooked_trout',
      'cooked_lobster','wheat_bread','tomato_soup','bronze_bar','iron_bar',
      'steel_bar','copper_ring','hunter_necklace','leather_boots','traveler_cape',
    ].filter(function(id){ return items[id]; });
    var npcs = ['Marisol','Greyhand','BoldWarrior42','VioletForge','TimberKing','SaltyHook'];
    var added = [];
    var now = Date.now();
    pool.forEach(function(itemId, i){
      var def = items[itemId];
      var npcIdx = i % npcs.length;
      var qty = Math.max(1, Math.floor(Math.random() * 8) + 1);
      var basePrice = Math.max(1, Math.ceil((def.v || 50) * (1.2 + Math.random() * 0.8)));   // 1.2x–2x vendor
      added.push({
        id: 'L-seed-' + now + '-' + i,
        sellerId: 'npc-' + npcIdx,
        sellerName: npcs[npcIdx],
        itemId: itemId,
        qty: qty,
        askEach: basePrice,
        postedAt: now - Math.floor(Math.random() * 12 * 3600 * 1000),  // up to 12h ago
      });
    });
    var list = loadListings();
    list = list.concat(added);
    saveListings(list);

    // Also seed sales history so 7d stats have data to show.
    var h = loadHistory();
    pool.forEach(function(itemId){
      var def = items[itemId];
      h[itemId] = h[itemId] || [];
      // 3–8 sales spread over the last 7 days
      var nSales = 3 + Math.floor(Math.random() * 6);
      for(var i = 0; i < nSales; i++){
        var basePrice = Math.max(1, Math.ceil((def.v || 50) * (1.0 + Math.random() * 1.0)));
        h[itemId].push({
          eachPrice: basePrice,
          qty: 1 + Math.floor(Math.random() * 5),
          at: now - Math.floor(Math.random() * WINDOW_MS_7D),
        });
      }
      // Sort chronologically so lastSale is sensible
      h[itemId].sort(function(a,b){ return a.at - b.at; });
      if(h[itemId].length > 50) h[itemId] = h[itemId].slice(-50);
    });
    saveHistory(h);
    return { ok:true, listings:added.length, items:pool.length };
  }
  function clearSeed(){
    var list = loadListings().filter(function(l){
      return !(l.sellerId && l.sellerId.indexOf('npc-') === 0);
    });
    saveListings(list);
    // History cleared too (since seed touches all pool items)
    saveHistory({});
    return { ok:true };
  }

  function activeSlot(){
    var prof = window.HearthriseProfile && window.HearthriseProfile.profile;
    return prof ? prof.activeSlot : 0;
  }
  function liveSession(){
    return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
  }
  function currentSellerId(){
    // b208: when signed in, ids match the Supabase rowToListing shape
    // (<userId>:slot-<n>) so my own server rows are recognized as mine.
    var s = liveSession();
    if(s && s.user) return s.user.id + ':slot-' + activeSlot();
    var prof = window.HearthriseProfile && window.HearthriseProfile.profile;
    if(prof) return 'slot-' + prof.activeSlot;
    return 'local-' + (window.G && window.G.account || 'guest');
  }
  function currentSellerName(){
    // b221: the identity seam, so a listing carries the player's CONFIRMED
    // unique name rather than whichever per-character G.playerName happens
    // to be loaded. "seller: Adventurer" was true of every player at once.
    var id = window.HearthriseIdentity;
    if(id && typeof id.getDisplayName === 'function'){
      var n = id.getDisplayName();
      if(n) return n;
    }
    return (window.G && window.G.playerName) || 'Adventurer';
  }

  // ══ Backend integration (b208, SYS-7) ═══════════════════════
  // When Supabase is configured + the player is signed in, the local
  // MARKET_KEY store becomes a MIRROR of the server's market_listings:
  //   • reads stay synchronous (all render/search/stats code unchanged)
  //   • mutations apply locally first (snappy), then sync to the server;
  //     a server refusal REVERTS the local change (optimistic-with-revert;
  //     the buy_listing RPC is the atomic race arbiter)
  //   • realtime nudges a refresh whenever anyone lists/cancels/fills
  //   • seller proceeds arrive via the market_sales ledger (collected
  //     atomically — "your Iron Sword sold while you were away")
  // Buy OFFERS remain local-model for now: offer escrow + auto-fill work
  // against the mirrored global listings, but cross-player offer matching
  // needs a server matcher (next backend pass).
  var backend = null;
  var refreshTimer = null;
  function backendActive(){ return !!(backend && liveSession()); }

  function refreshFromBackend(){
    if(!backendActive()) return Promise.resolve(false);
    return backend.fetchListings().then(function(rows){
      // Keep my un-synced local temp rows (id starts 'L'), drop npc seeds,
      // mirror everything else from the server.
      var mine = loadListings().filter(function(l){
        return l.id && String(l.id).indexOf('L') === 0 && l.sellerId === currentSellerId();
      });
      saveListings(rows.concat(mine));
      if(typeof window.renderMarket === 'function' &&
         /* b230: #market-root now ALWAYS exists (it is static markup), so it
            can no longer stand in for "the market is on screen". Only the
            panel's own active state means that. */
         document.querySelector('#panel-market.active')) {
        try { window.renderMarket(); } catch(e){}
      }
      return true;
    }).catch(function(){ return false; });
  }
  function scheduleRefresh(){
    if(refreshTimer) return;
    refreshTimer = setTimeout(function(){ refreshTimer = null; refreshFromBackend(); }, 1200);
  }

  function collectSaleProceeds(){
    /* b355 — THERE IS NO COLLECT STEP UNDER MARKET V2, AND THIS IS WHERE THAT
       BECOMES TRUE FOR THE CLIENT. hr_market_buy pays the seller INTO
       player_state.gold AT SALE TIME, online or not: there is no `collected`
       column, no second credit path, and nothing left for this function to
       collect. Running it against a v2 database would pay the seller a SECOND
       time locally for money the server already credited — the double-collect
       the v1 model was built around, arriving from the client side. Gated
       rather than deleted because the v1 backend is still the live path with
       the switch off, and this commit does not remove it. */
    if(serverMarketActive()) return;
    if(!backendActive() || typeof backend.collectSales !== 'function') return;
    backend.collectSales().then(function(sales){
      if(!sales || !sales.length) return;
      var total = 0;
      sales.forEach(function(s){
        var net = s.goldTotal - Math.ceil(s.goldTotal * HOUSE_TAX);   // ceil tax = sink rounds UP, matching the server
        total += net;
        recordSale(s.itemId, Math.round(s.goldTotal / Math.max(1, s.qty)), s.qty);
      });
      if(total > 0){
        window.G.gold = (window.G.gold || 0) + total;
        if(typeof window.notify === 'function'){
          window.notify('Market sales while you were away: +' + total.toLocaleString() + 'g (' + sales.length + ' sale' + (sales.length>1?'s':'') + ', after ' + (HOUSE_TAX*100) + '% tax)', 'loot');
        }
        if(typeof window.saveLocal === 'function') window.saveLocal();
        if(typeof window.updateTopbar === 'function') window.updateTopbar();
      }
    }).catch(function(){});
  }

  function setBackend(impl){
    backend = impl;
    refreshFromBackend();
    collectSaleProceeds();
    if(typeof impl.subscribe === 'function') impl.subscribe(scheduleRefresh);
    setInterval(collectSaleProceeds, 60000);
  }

  // Background push of a locally-created listing; revert escrow on refusal.
  function pushListingToBackend(localListing, itemName){
    if(!backendActive()) return;
    backend.createListing({
      itemId: localListing.itemId, qty: localListing.qty, askEach: localListing.askEach,
      sellerSlot: activeSlot(), sellerName: localListing.sellerName
    }).then(function(serverRow){
      if(!serverRow) throw new Error('no row');
      var list = loadListings();
      var idx = list.findIndex(function(l){ return l.id === localListing.id; });
      if(idx >= 0){ list[idx].id = serverRow.id; list[idx].sellerId = serverRow.sellerId; saveListings(list); }
    }).catch(function(){
      // Server refused — undo the local listing + return escrow.
      var list = loadListings();
      var idx = list.findIndex(function(l){ return l.id === localListing.id; });
      if(idx >= 0){ list.splice(idx, 1); saveListings(list); }
      if(typeof window.addItem === 'function') window.addItem(localListing.itemId, localListing.qty);
      if(typeof window.notify === 'function') window.notify('Listing failed to reach the market — items returned', 'kill');
    });
  }

  // Background server-side buy; revert the local fill if the server says no
  // (someone else won the race for the last units).
  function pushBuyToBackend(listingId, itemId, qty, costPaid){
    if(!backendActive()) return;
    if(String(listingId).indexOf('L') === 0) return;    // local temp row — nothing server-side
    backend.buyListing(listingId, qty).then(function(out){
      if(out && out.ok !== false) return;               // server confirmed
      revertBuy(itemId, qty, costPaid, out && out.error);
    }).catch(function(){ revertBuy(itemId, qty, costPaid, 'network'); });
  }
  /* ⚠ b355 — THE V1 COMPENSATION, AND IT MUST NOT RUN UNDER THE SEAM. With the
     switch on, a refused purchase is reversed by the PREDICTION LEDGER
     (src/net/gold.js `rollbackPrediction`), and only for the three outcomes that
     PROVE nothing was written — `refused`, `rate-limited`, `not-signed-in`. This
     function reverses on a 5xx and on a network error too, which are precisely
     the cases that do NOT prove non-write: a 502 after the transaction committed
     describes a purchase that HAPPENED, and refunding it hands the player their
     gold back for goods the server has already delivered. That is a mint, out of
     the client, in the one file that moves value between two people. So the two
     compensations are mutually exclusive, and the seam's — the narrower one —
     wins. Reached only from pushBuyToBackend, which is itself gated. */
  function revertBuy(itemId, qty, costPaid, why){
    if(serverMarketActive()) return;
    if(typeof window.removeItem === 'function') window.removeItem(itemId, qty);
    else if(window.G && window.G.inventory) window.G.inventory[itemId] = Math.max(0, (window.G.inventory[itemId]||0) - qty);
    window.G.gold = (window.G.gold || 0) + costPaid;
    if(typeof window.notify === 'function'){
      var reason = why === 'gone' || why === 'not_enough' ? 'someone bought it first' : 'server refused (' + (why||'error') + ')';
      window.notify('Purchase reverted — ' + reason + '. Gold returned.', 'kill');
    }
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    scheduleRefresh();
  }

  // ── Listing operations ────────────────────────────────────────
  function expireOld(list){
    var now = Date.now();
    var changed = false;
    for(var i = list.length - 1; i >= 0; i--){
      // b208: when the live market is active, server rows are authoritative —
      // only ever locally expire my own un-synced temp rows.
      if(backendActive() && String(list[i].id).indexOf('L') !== 0) continue;
      if(now - list[i].postedAt > LISTING_TTL_MS){
        // Refund the seller the escrowed qty.
        if(list[i].sellerId === currentSellerId() && typeof window.addItem === 'function'){
          window.addItem(list[i].itemId, list[i].qty);
          if(typeof window.notify === 'function') window.notify('Listing expired: ' + list[i].qty + 'x ' + list[i].itemId, 'info');
        }
        list.splice(i, 1);
        changed = true;
      }
    }
    return changed;
  }

  function listItem(itemId, qty, askEach){
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item){ return { ok:false, reason:'Unknown item' }; }
    if(item.bop){ return { ok:false, reason:'Bind-on-Pickup items cannot be listed' }; }
    if(qty <= 0 || askEach <= 0) return { ok:false, reason:'Invalid amount' };
    var have = (window.G && window.G.inventory[itemId]) || 0;
    if(have < qty) return { ok:false, reason:'You only have ' + have + ' to list' };

    var list = loadListings();
    expireOld(list);
    var mine = list.filter(function(l){ return l.sellerId === currentSellerId(); });
    if(mine.length >= listingLimit()){
      return { ok:false, reason:'Max ' + listingLimit() + ' active listings reached' };
    }

    // Escrow the qty out of inventory.
    if(typeof window.removeItem === 'function') window.removeItem(itemId, qty);
    else window.G.inventory[itemId] = (window.G.inventory[itemId]||0) - qty;

    var newL = {
      id: 'L' + Date.now() + '-' + Math.floor(Math.random()*1000),
      sellerId: currentSellerId(),
      sellerName: currentSellerName(),
      itemId: itemId,
      qty: qty,
      askEach: askEach,
      postedAt: Date.now(),
    };
    list.push(newL);
    /* Try to auto-fill any matching open buy offers BEFORE we save — this drains
       the new listing's qty in-place if there are takers.
       ⚠ b355 — NOT UNDER THE SEAM (Security M5/M6). Auto-match pays a LOCAL buy
       offer out of a listing the SERVER now owns as escrow: it would deliver goods
       and move gold the server never heard of, against a client-authored buy-offer
       sub-market that market-v2 does not implement. Under the seam hr_market_list
       owns the escrow and there is no buy-offer model to match against, so this is
       skipped entirely — the listing goes to the server at its full qty. */
    if(!serverMarketActive()) autoMatchAgainstOffers(newL);
    if(newL.qty <= 0){
      // Fully consumed by buy offers — drop the listing entirely.
      list.pop();
    }
    saveListings(list);
    /* b355 — THE SEAM. With it on, hr_market_list is the authority: it DELETEs
       the goods out of player_inventory, writes the escrow, derives the seller
       name from `profiles`, stamps the clock, bumps the version and returns the
       envelope. The local escrow above is a PREDICTION of that, and the
       server's absolute inventory is what settles it. With it off, the v1
       backend push is byte-for-byte what shipped. Never both — see
       serverMarketActive. */
    var _lk = newL.qty > 0 ? marketIntentKey() : null;
    var _lS = _lk && marketApi();
    if(_lS){
      var _lp = _lS.listOnMarket(itemId, newL.qty, askEach, _lk);
      if(_lp && _lp.then) _lp.then(function(v){ adoptServerListingId(newL.id, v); }, function(){});
    } else if(newL.qty > 0 && !serverMarketActive()){
      pushListingToBackend(newL, item.n || itemId);                  // b208: sync to server
    }
    if(typeof window.notify === 'function'){
      if(newL.qty > 0){
        window.notify('Listed ' + newL.qty + 'x ' + (item.n||itemId) + ' @ ' + askEach + 'g' + (qty !== newL.qty ? ' (' + (qty - newL.qty) + ' filled buy offers)' : ''), 'info');
      } else {
        window.notify('All ' + qty + 'x ' + (item.n||itemId) + ' filled by open buy offers!', 'loot');
      }
    }
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return { ok:true };
  }

  function cancelListing(listingId){
    var list = loadListings();
    var idx = list.findIndex(function(l){ return l.id === listingId; });
    if(idx < 0) return { ok:false, reason:'Listing not found' };
    var l = list[idx];
    if(l.sellerId !== currentSellerId()) return { ok:false, reason:'Not your listing' };
    // Refund escrow.
    if(typeof window.addItem === 'function') window.addItem(l.itemId, l.qty);
    list.splice(idx, 1);
    saveListings(list);
    // b355: the seam owns the cancel when it is on — hr_market_cancel's DELETE
    // is the arbiter that makes "the escrow comes back exactly once" true even
    // against a racing expiry sweep, which no client-side check can be.
    var _ck = isServerListingId(l.id) ? marketIntentKey() : null;
    var _cS = _ck && marketApi();
    if(_cS){
      var _cp = _cS.cancelMarketListing(l.id, _ck);
      if(_cp && _cp.catch) _cp.catch(function(){});
    } else if(!serverMarketActive() && backendActive() && String(l.id).indexOf('L') !== 0){
      // b208: mirror the cancel server-side (uuid ids are server rows)
      backend.cancelListing(l.id).catch(function(){});
    }
    if(typeof window.notify === 'function') window.notify('Listing cancelled — items returned', 'info');
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return { ok:true };
  }

  function buyListing(listingId, qtyWanted){
    var list = loadListings();
    expireOld(list);
    var idx = list.findIndex(function(l){ return l.id === listingId; });
    if(idx < 0) return { ok:false, reason:'Listing not found' };
    var l = list[idx];
    if(l.sellerId === currentSellerId()) return { ok:false, reason:"Can't buy your own listing" };
    qtyWanted = Math.max(1, Math.min(qtyWanted, l.qty));
    var totalCost = qtyWanted * l.askEach;
    if(!window.balCanAfford(totalCost, 'gold')){
      return { ok:false, reason: window.balKnown('gold') ? ('Need ' + totalCost + ' gold')
        : window.balShortfall(totalCost, 'gold') };
    }

    /* Transfer (optimistic — the server RPC is the race arbiter).
       b355: the gold half goes through the ONE payment choke point, so the
       spend is recorded as a PREDICTION keyed to the intent that is about to go
       out, retired by that call's envelope and swept if the call never answers.
       With the switch off `goldSettleCurrency` is `G.gold += -totalCost` and
       nothing else — byte-for-byte the expression that used to be here. */
    /* ⚠ THE KEY IS TAKEN ONLY WHEN A CALL WILL ACTUALLY GO OUT (F1). A
       prediction recorded under a key nobody sends is an orphan, and an orphan
       is re-added on top of every future envelope for the rest of the session —
       a PERMANENT additive offset, which is the double-pay this seam exists to
       make unspellable. A listing whose id is still local ('L…') has no server
       row to name, so it gets NO key, and `settleCurrency` records nothing. */
    var _bS = isServerListingId(l.id) ? marketApi() : null;
    var _bk = _bS ? marketIntentKey() : null;
    window.goldSettleCurrency({ gold: -totalCost }, 'market.buy', _bk);
    if(typeof window.addItem === 'function') window.addItem(l.itemId, qtyWanted);
    else window.G.inventory[l.itemId] = (window.G.inventory[l.itemId]||0) + qtyWanted;
    if(_bS && _bk){
      var _bp = _bS.buyMarketListing(l.id, qtyWanted, _bk);
      if(_bp && _bp.catch) _bp.catch(function(){});
    } else if(!serverMarketActive()){
      pushBuyToBackend(l.id, l.itemId, qtyWanted, totalCost);        // b208
    }

    // Update listing
    l.qty -= qtyWanted;
    if(l.qty <= 0) list.splice(idx, 1);
    saveListings(list);

    // Record sale (after-tax for seller, full price for history)
    recordSale(l.itemId, l.askEach, qtyWanted);
    // Seller's gold credited net of house tax. NOTE: in dev mode the
    // seller is the same player on the same browser, so we just no-op.
    // In production this writes to the seller's account via Supabase.
    var sellerNet = totalCost - Math.ceil(totalCost * HOUSE_TAX);   // ceil tax, matching the server sink
    // (server-side: credit sellerId gold += sellerNet)
    void sellerNet;

    var item = window.ITEMS && window.ITEMS[l.itemId];
    if(typeof window.notify === 'function') window.notify('Bought ' + qtyWanted + 'x ' + (item ? item.n : l.itemId) + ' for ' + totalCost + 'g', 'loot');
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return { ok:true };
  }

  // ── Aggregated buy ─────────────────────────────────────────
  // Buys up to `qtyWanted` of `itemId` paying no more than `maxEach`
  // gold per unit. Walks open listings at the matching price ascending
  // (cheapest first). Returns a result with how many were bought, total
  // gold spent, and a residual qty if the market couldn't fill it all.
  // If `placeOffer` is true and there's a residual, a buy offer is
  // created for the residual at maxEach.
  function buyAggregated(itemId, qtyWanted, maxEach, placeOffer){
    if(qtyWanted <= 0 || maxEach <= 0) return { ok:false, reason:'Invalid amount' };
    var list = loadListings();
    expireOld(list);
    var meId = currentSellerId();
    // Eligible listings: same item, at-or-below max price, not mine.
    var pool = list.filter(function(l){
      return l.itemId === itemId && l.askEach <= maxEach && l.sellerId !== meId;
    });
    pool.sort(function(a, b){ return a.askEach - b.askEach || a.postedAt - b.postedAt; });

    var totalAffordable = pool.reduce(function(s, l){ return s + l.qty; }, 0);
    var qty = Math.min(qtyWanted, totalAffordable);

    // Pre-compute total gold we'll need so we don't partially fill
    // and then run out. (Cheapest-first iteration.)
    var willSpend = 0, willGet = 0;
    for(var i = 0; i < pool.length && willGet < qty; i++){
      var take = Math.min(pool[i].qty, qty - willGet);
      willSpend += take * pool[i].askEach;
      willGet  += take;
    }
    if(!window.balCanAfford(willSpend, 'gold')){
      return { ok:false, reason: window.balKnown('gold')
        ? ('Need ' + willSpend.toLocaleString() + ' gold for those ' + willGet + ' items')
        : window.balShortfall(willSpend, 'gold') };
    }

    // Execute. Mutate `list` in-place (find each pool entry by id).
    var bought = 0, spent = 0;
    pool.forEach(function(p){
      if(bought >= qty) return;
      var lIdx = list.findIndex(function(x){ return x.id === p.id; });
      if(lIdx < 0) return;
      var take = Math.min(list[lIdx].qty, qty - bought);
      var cost = take * list[lIdx].askEach;
      /* b355 — ONE INTENT PER LISTING, and that is not an inefficiency to be
         optimised away later. A sweep across five sellers is five transfers to
         five different people; a single call that moved all of them would be a
         delta shape that writes five strangers' rows, which is the one thing
         hr_apply is single-character BY CONSTRUCTION to prevent. Each leg gets
         its own key, its own prediction and its own envelope.
         THE COST, stated: the `shop` bucket is 30/min, so a sweep of more than
         thirty listings rate-limits its own tail. The refused legs roll their
         predictions back (429 is `PROVABLY_UNWRITTEN`), so the money is right;
         the sweep is simply partial, which is what the residual already models. */
      var _aS = isServerListingId(list[lIdx].id) ? marketApi() : null;
      var _ak = _aS ? marketIntentKey() : null;
      window.goldSettleCurrency({ gold: -cost }, 'market.buy_aggregated', _ak);
      if(typeof window.addItem === 'function') window.addItem(itemId, take);
      else window.G.inventory[itemId] = (window.G.inventory[itemId]||0) + take;
      if(_aS && _ak){
        var _ap = _aS.buyMarketListing(list[lIdx].id, take, _ak);
        if(_ap && _ap.catch) _ap.catch(function(){});
      } else if(!serverMarketActive()){
        pushBuyToBackend(list[lIdx].id, itemId, take, cost);         // b208
      }
      recordSale(itemId, list[lIdx].askEach, take);
      list[lIdx].qty -= take;
      if(list[lIdx].qty <= 0) list.splice(lIdx, 1);
      bought += take;
      spent  += cost;
    });
    saveListings(list);

    var residual = qtyWanted - bought;
    var offerCreated = null;
    /* b355 — the residual buy-offer is part of the client-authored sub-market and
       is inert under the seam (placeBuyOffer refuses it anyway; this skips the
       attempt so the residual reads as "not available" rather than a failed offer). */
    if(residual > 0 && placeOffer && !serverMarketActive()){
      var r = placeBuyOffer(itemId, residual, maxEach);
      if(r.ok) offerCreated = r.offer;
    }

    var item = window.ITEMS && window.ITEMS[itemId];
    var nm = item ? item.n : itemId;
    if(typeof window.notify === 'function'){
      var msg = bought > 0 ? ('Bought ' + bought + 'x ' + nm + ' for ' + spent.toLocaleString() + 'g') : '';
      if(offerCreated){
        msg += (msg ? '. ' : '') + 'Buy offer placed for ' + residual + ' more @ ' + maxEach.toLocaleString() + 'g';
      } else if(residual > 0 && !placeOffer){
        msg += (msg ? '. ' : '') + residual + ' more not available at that price';
      }
      if(msg) window.notify(msg, bought > 0 ? 'loot' : 'info');
    }
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();

    return { ok:true, bought:bought, spent:spent, residual:residual, offer:offerCreated };
  }

  // ── Buy offer operations ───────────────────────────────────
  function placeBuyOffer(itemId, qty, maxEach){
    /* ⚠ b355 — INERT UNDER THE SEAM (Security M5/M6). This is the client-authored
       buy-offer sub-market: it escrows gold with a bare `G.gold -= totalEscrow`
       that NO server verb reconciles (market-v2 implements SELL listings only,
       and `market_buy_offers` has no RPC — see src/net/gold-sites.js
       B.MARKET_BUY_OFFERS). Under the switch, applyEnvelopeState writes gold
       ABSOLUTELY, so that local debit would be silently refunded at the next
       envelope — a mint the seam exists to make unspellable. Refused BEFORE any
       gold moves, so the site is provably inert under the flag; the row in the
       gold census stays `deferred`, blocked on a server buy-offer model. */
    if(serverMarketActive()) return { ok:false, reason:'Buy offers are not available yet' };
    if(qty <= 0 || maxEach <= 0) return { ok:false, reason:'Invalid amount' };
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return { ok:false, reason:'Unknown item' };
    if(item.bop) return { ok:false, reason:'Bind-on-Pickup items can\'t be ordered' };
    var totalEscrow = qty * maxEach;
    if(!window.balCanAfford(totalEscrow, 'gold')){
      return { ok:false, reason: window.balKnown('gold')
        ? ('Need ' + totalEscrow.toLocaleString() + ' gold to escrow')
        : window.balShortfall(totalEscrow, 'gold') };
    }

    // Per-character cap on open buy offers (keep it bounded)
    var offers = loadOffers();
    var mine = offers.filter(function(o){ return o.buyerId === currentSellerId(); });
    if(mine.length >= listingLimit()){
      return { ok:false, reason:'Max ' + listingLimit() + ' open buy offers reached' };
    }

    window.G.gold -= totalEscrow;
    var offer = {
      id: 'O' + Date.now() + '-' + Math.floor(Math.random()*1000),
      buyerId: currentSellerId(),
      buyerName: currentSellerName(),
      itemId: itemId,
      qty: qty,
      maxEach: maxEach,
      postedAt: Date.now(),
      escrowed: totalEscrow,
    };
    offers.push(offer);
    saveOffers(offers);
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return { ok:true, offer:offer };
  }

  function cancelBuyOffer(offerId){
    /* ⚠ b355 — INERT UNDER THE SEAM (Security M5/M6). Cancelling refunds escrow
       with a bare `G.gold += escrowed` — gold the server never saw leave, since
       placeBuyOffer is itself gated off under the flag. Refunding it would be a
       mint at the next absolute envelope. Refused before any gold moves; any local
       offers left over from before the flip stay untouched and are wiped at
       cutover with the rest of the beta. */
    if(serverMarketActive()) return { ok:false, reason:'Buy offers are not available yet' };
    var offers = loadOffers();
    var idx = offers.findIndex(function(o){ return o.id === offerId; });
    if(idx < 0) return { ok:false, reason:'Offer not found' };
    var o = offers[idx];
    if(o.buyerId !== currentSellerId()) return { ok:false, reason:'Not your offer' };
    // Refund escrow
    window.G.gold = (window.G.gold||0) + (o.escrowed || (o.qty * o.maxEach));
    offers.splice(idx, 1);
    saveOffers(offers);
    if(typeof window.notify === 'function') window.notify('Buy offer cancelled — ' + (o.escrowed||0).toLocaleString() + 'g returned', 'info');
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return { ok:true };
  }

  // When a NEW sell listing posts, see if any of MY open buy offers
  // can be filled by it. Auto-fills cheapest sale, deducts from listing,
  // credits the buyer, and the seller still gets their gold elsewhere.
  // (For now: matches against ALL buyers' offers, not just mine.)
  function autoMatchAgainstOffers(newListing){
    /* ⚠ b355 — INERT UNDER THE SEAM (Security M5/M6), defence in depth. listItem
       already skips this call under the flag; guarding here too means a future
       caller cannot reintroduce the client-authored fill (delivering goods and
       moving gold the server never authorised) by wiring auto-match somewhere new. */
    if(serverMarketActive()) return;
    var offers = loadOffers();
    if(!offers.length) return;
    var matches = offers
      .filter(function(o){
        return o.itemId === newListing.itemId
            && o.maxEach >= newListing.askEach
            && o.buyerId !== newListing.sellerId
            && o.qty > 0;
      })
      // Highest-paying offer first (best for seller, fair for queue order on ties)
      .sort(function(a, b){ return b.maxEach - a.maxEach || a.postedAt - b.postedAt; });
    if(!matches.length) return;
    var listingChanged = false;
    matches.forEach(function(o){
      if(newListing.qty <= 0) return;
      var take = Math.min(newListing.qty, o.qty);
      // Buyer pays the LISTING price (not their max), saving them gold —
      // industry-standard "best execution". Refund the difference from escrow.
      var actualCost = take * newListing.askEach;
      var escrowedFor = take * o.maxEach;
      var refund = escrowedFor - actualCost;
      // Buyer receives the items
      // NOTE: in local-dev backend buyer == current player; in production
      // this would write to that buyer's character. We honor it for self.
      if(o.buyerId === currentSellerId()){
        if(typeof window.addItem === 'function') window.addItem(newListing.itemId, take);
        else window.G.inventory[newListing.itemId] = (window.G.inventory[newListing.itemId]||0) + take;
        if(refund > 0) window.G.gold = (window.G.gold||0) + refund;
      }
      // Decrement offer + listing qty; remove offer if depleted
      o.qty      -= take;
      o.escrowed -= escrowedFor;
      newListing.qty -= take;
      // Record sale
      recordSale(newListing.itemId, newListing.askEach, take);
      listingChanged = true;
      if(typeof window.notify === 'function' && o.buyerId === currentSellerId()){
        var item = window.ITEMS && window.ITEMS[newListing.itemId];
        window.notify('Buy offer filled: ' + take + 'x ' + (item ? item.n : newListing.itemId) + ' @ ' + newListing.askEach.toLocaleString() + 'g' + (refund > 0 ? ' (saved ' + refund.toLocaleString() + 'g)' : ''), 'loot');
      }
    });
    // Persist offer changes; drop offers fully filled
    var fresh = offers.filter(function(o){ return o.qty > 0; });
    saveOffers(fresh);
    return listingChanged;
  }

  /**
   * Public market API. Imported by admin tools, the smoke test, and
   * (post Phase-2) the Supabase backend swap-in.
   *
   * @type {{
   *   list: () => MarketListing[],
   *   listItem: (itemId: string, qty: number, askEach: number) => {ok: boolean, reason?: string},
   *   cancelListing: (listingId: string) => {ok: boolean, reason?: string},
   *   buyListing: (listingId: string, qtyWanted: number) => {ok: boolean, reason?: string},
   *   buyAggregated: (itemId: string, qtyWanted: number, maxEach: number, placeOffer: boolean) =>
   *     {ok: boolean, bought?: number, spent?: number, residual?: number, offer?: object, reason?: string},
   *   placeBuyOffer: (itemId: string, qty: number, maxEach: number) => {ok: boolean, offer?: object, reason?: string},
   *   cancelBuyOffer: (offerId: string) => {ok: boolean, reason?: string},
   *   listOffers: () => BuyOffer[],
   *   expireOld: () => void,
   *   HOUSE_TAX: number,
   *   PER_CHAR_LIMIT: number,
   *   getStats7d: (itemId: string) => MarketStats|null,
   *   getTopMovers7d: (limit?: number) => Array<{itemId: string, avgPrice: number, volume: number}>,
   *   seedFakeListings: () => {ok: boolean, listings?: number, items?: number, reason?: string},
   *   clearSeed: () => {ok: boolean},
   * }}
   */
  window.HearthriseMarket = {
    list: loadListings,
    listItem: listItem,
    cancelListing: cancelListing,
    buyListing: buyListing,
    buyAggregated: buyAggregated,
    placeBuyOffer: placeBuyOffer,
    cancelBuyOffer: cancelBuyOffer,
    listOffers: loadOffers,
    expireOld: function(){ var l = loadListings(); if(expireOld(l)) saveListings(l); },
    HOUSE_TAX: HOUSE_TAX,
    PER_CHAR_LIMIT: PER_CHAR_LIMIT_BASE, listingLimit: listingLimit,
    getStats7d: getStats7d,
    getTopMovers7d: getTopMovers7d,
    seedFakeListings: seedFakeListings,
    clearSeed: clearSeed,
    /* b208 (SYS-7): live-backend seam — supabase-market-backend.js
       auto-installs itself here when credentials are present. */
    setBackend: setBackend,
    refreshFromBackend: refreshFromBackend,
    collectSaleProceeds: collectSaleProceeds,
    backendActive: backendActive,
    /* b353: PUBLISHED FOR THE FLIP. `serverMarketActive` decided every v1-vs-v2
       branch in this file from the day the seam was built, and it was the only
       one of them a test could not read — so "the market swapped" was checkable
       only by inference from a dozen behaviours. B353-1(d) and B353-2 read it
       directly. It is a PREDICATE, not a setter: the switch is still
       accrue.js's and there is no way to move the market alone. */
    serverMarketActive: serverMarketActive,
  };

  // ── UI: Market host ───────────────────────────────────────────
  /* b230: injectNav() is GONE. It created a `nav-btn[data-tab=market]` at
     runtime (with a 📈 emoji in it) and anchored itself to the static Store
     entry — which theme-cozy.css had set to `display:none !important`. The
     net effect was a sidebar where the only visible commerce entry was the
     injected one, and the in-game shop had no door at all. Both the Market
     section and its route are now static markup under the Shops destination:
     index.html owns the nav, showTab() owns the routing.

     The panel host is static too. This function survives only as a fallback
     for a DOM that somehow lacks it (a stale cached index.html mid-deploy),
     and it builds the SAME shape — a stable #market-root that render() owns,
     so nothing outside it is destroyed by a re-render. */
  function injectPanel(){
    var panel = document.getElementById('panel-market');
    if(!panel){
      var main = document.querySelector('main.main');
      if(!main) return;
      panel = document.createElement('section');
      panel.className = 'panel';
      panel.id = 'panel-market';
      main.appendChild(panel);
    }
    if(!panel.querySelector('#market-root')){
      var root = document.createElement('div');
      root.id = 'market-root';
      panel.appendChild(root);
    }
  }

  function escapeAttr(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // Persisted UI state for search/sort. Survives reload.
  var UI_STATE_KEY = 'hearthrise:market:ui';
  function loadUiState(){
    try { return Object.assign({ q:'', sort:'price-asc', ledger:'all' }, JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}')); }
    catch(e){ return { q:'', sort:'price-asc', ledger:'all' }; }
  }
  function saveUiState(s){
    /* b213 (phase 2): persist the SORT preference but never the search
       query — a stale filter from last session made the market open on
       "matching 'log' (0) — No matching listings", which reads as an
       empty market. */
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify({ sort: s.sort, ledger: s.ledger })); } catch(e){}
  }

  /* ══════════════════════════════════════════════════════════════════════
     b361 — YOUR TRADE LEDGER, ON THE MARKET SCREEN
     ══════════════════════════════════════════════════════════════════════
     Tyler: since market-v2 a listing sells server-side and the gold just
     arrives, with no player-visible record anywhere. This is the record.

     WHERE THE DATA COMES FROM: `market_sales`, read by the player for their
     OWN rows under the `own sales readable` policy that market-v2 already
     ships (`auth.uid() = seller_user_id or auth.uid() = buyer_user_id`, with
     `grant select … to authenticated`). No RPC, no definer, no migration —
     see src/net/market-history.js and the block above `fetchSalesHistory` in
     src/net/supabase-market-backend.js for the quoted policy.

     WHAT IT DELIBERATELY DOES NOT SHOW: the counterparty's name. market-v2
     carries no denormalised name on this table — S17 stripped the table's
     public read precisely because it published both auth UUIDs — so a name
     would need a new join or a new definer function. The row names the ITEM
     and the GOLD and stays silent about who, which is the honest render of
     what the server actually exposes.

     THREE STATES, AND THE MIDDLE ONE IS THE ONE THAT MATTERS: unknown (never
     read — say so), empty (read, genuinely nothing) and populated. Rendering
     "no trades yet" for a read that failed would be the client asserting
     something it cannot know. */
  function ledgerAgo(ms, now){
    var d = Math.max(0, now - ms);
    if(d < 60000) return 'just now';
    var m = Math.floor(d/60000);
    if(m < 60) return m + 'm ago';
    var h = Math.floor(m/60);
    if(h < 24) return h + 'h ago';
    return Math.floor(h/24) + 'd ago';
  }

  function historyBlockHtml(hist, filter, now){
    var head = '<div class="mk-block mk-ledger"><h3>Your trade history</h3>';
    if(!hist || hist.status !== 'ok'){
      return head + '<div class="mk-empty">Your sales and purchases will appear here once '
        + 'the market ledger has been read. Sign in and open the market again.</div></div>';
    }
    var all = hist.entries || [];
    var rows = all.filter(function(e){
      return filter === 'sold' ? e.role === 'sale'
           : filter === 'bought' ? e.role === 'purchase'
           : true;
    });
    /* The header totals speak for EVERYTHING read, not for the current filter
       — a total that changes when you flip a tab is a total nobody trusts. */
    var soldN = 0, earned = 0, boughtN = 0, spent = 0;
    all.forEach(function(e){
      if(e.role === 'sale'){ soldN++; earned += e.goldNet; }
      else { boughtN++; spent += e.goldGross; }
    });
    var totals = '<div class="mk-stats mk-ledger-totals">'
      + '<span class="mk-stat">' + soldN + ' sold <b>+' + earned.toLocaleString() + 'g</b></span>'
      + '<span class="mk-stat">' + boughtN + ' bought <b>-' + spent.toLocaleString() + 'g</b></span>'
      + '</div>';
    var tabs = '<div class="mk-ledger-tabs">'
      + [['all','All'],['sold','Sold'],['bought','Bought']].map(function(t){
          return '<button class="mk-ledger-tab' + (filter === t[0] ? ' is-on' : '')
            + '" data-ledger="' + t[0] + '">' + t[1] + '</button>';
        }).join('')
      + '</div>';
    var body;
    if(!rows.length){
      body = '<div class="mk-empty">'
        + (filter === 'sold' ? 'Nothing of yours has sold yet — list an item above and it will show up here.'
         : filter === 'bought' ? 'You haven\'t bought anything from the market yet.'
         : 'No trades yet. Anything you buy or sell will be recorded here.')
        + '</div>';
    } else {
      body = rows.map(function(e){
        var item = window.ITEMS && window.ITEMS[e.itemId];
        var iconHtml = (window._itemPath && window._itemPath[e.itemId])
          ? '<img src="' + window._itemPath[e.itemId] + '" alt="">'
          : '<span>' + window.itemFallbackIcon(e.itemId, 22, item) + '</span>';
        var sold = e.role === 'sale';
        /* GROSS per unit on both sides: it is the price the listing actually
           traded at, which is the same number for buyer and seller. The tax
           is a separate, seller-only clause below — folding it into "each"
           would quote a price no listing was ever posted at. */
        var each = e.qty > 0 ? Math.round(e.goldGross / e.qty) : 0;
        var meta = (sold ? 'Sold' : 'Bought') + ' ' + each.toLocaleString() + 'g each · '
          + ledgerAgo(e.at, now)
          + (sold && e.tax > 0 ? ' · ' + e.tax.toLocaleString() + 'g house tax' : '');
        return '<div class="mk-row mk-ledger-row">'
          + '<div class="mk-icon">' + iconHtml + '</div>'
          + '<div class="mk-info">'
          +   '<div class="mk-name">' + escapeAttr((item && item.n) || e.itemId)
          +     '<span class="mk-qty">×' + e.qty.toLocaleString() + '</span></div>'
          +   '<div class="mk-meta">' + escapeAttr(meta) + '</div>'
          + '</div>'
          /* +/− carries the direction, not colour — see the ledger block in
             audit-overrides.css for the measurement behind that. */
          + '<div class="mk-action"><span class="mk-qty">'
          +   (sold ? '+' : '−') + Math.abs(e.goldDelta).toLocaleString() + 'g</span></div>'
          + '</div>';
      }).join('');
    }
    return head + totals + tabs + body + '</div>';
  }

  function render(){
    /* b230: render into #market-root, never into #panel-market itself. The
       panel now hosts the Shops toggle strip as a sibling of this container —
       and the old `panel.innerHTML = …` at the end of this function is
       precisely what made the injected "Premium Store" button delete itself on
       every market re-render (search, sort, list, cancel — every keystroke).
       A renderer owns a container, not a panel. */
    var panel = document.getElementById('market-root') || document.getElementById('panel-market');
    if(!panel) return;
    var list = loadListings();
    expireOld(list);
    saveListings(list);
    var mine = list.filter(function(l){ return l.sellerId === currentSellerId(); });
    var others = list.filter(function(l){ return l.sellerId !== currentSellerId(); });

    var ui = loadUiState();
    // ── Search + sort ──
    var qLower = (ui.q || '').toLowerCase().trim();
    if(qLower){
      var matches = function(l){
        var item = window.ITEMS && window.ITEMS[l.itemId];
        var name = item && item.n ? item.n.toLowerCase() : l.itemId.toLowerCase();
        return name.indexOf(qLower) !== -1
            || l.itemId.toLowerCase().indexOf(qLower) !== -1
            || (l.sellerName||'').toLowerCase().indexOf(qLower) !== -1;
      };
      others = others.filter(matches);
    }
    var sorters = {
      'price-asc':  function(a,b){ return a.askEach - b.askEach; },
      'price-desc': function(a,b){ return b.askEach - a.askEach; },
      'qty-desc':   function(a,b){ return b.qty - a.qty; },
      'newest':     function(a,b){ return b.postedAt - a.postedAt; },
      'oldest':     function(a,b){ return a.postedAt - b.postedAt; },
      'name':       function(a,b){
        var an = (window.ITEMS && window.ITEMS[a.itemId] && window.ITEMS[a.itemId].n) || a.itemId;
        var bn = (window.ITEMS && window.ITEMS[b.itemId] && window.ITEMS[b.itemId].n) || b.itemId;
        return an.localeCompare(bn);
      },
    };
    if(sorters[ui.sort]) others = others.slice().sort(sorters[ui.sort]);

    var listingRow = function(l, ownsIt){
      var item = window.ITEMS && window.ITEMS[l.itemId];
      var icon = window.itemFallbackIcon(l.itemId, 22, item);
      var iconHtml = (window._itemPath && window._itemPath[l.itemId])
        ? '<img src="' + window._itemPath[l.itemId] + '" alt="">'
        : '<span>' + icon + '</span>';
      var total = l.askEach * l.qty;
      var ttlH = ((LISTING_TTL_MS - (Date.now() - l.postedAt))/3600000).toFixed(1);
      // 7-day stats line — only render if we have any history
      var stats = getStats7d(l.itemId);
      var statsLine = '';
      if(stats && stats.salesCount > 0){
        var deltaPct = stats.avgPrice ? Math.round(((l.askEach - stats.avgPrice) / stats.avgPrice) * 100) : 0;
        var deltaCls = deltaPct > 5 ? 'high' : (deltaPct < -5 ? 'low' : 'fair');
        var deltaSign = deltaPct >= 0 ? '+' : '';
        statsLine = '<div class="mk-stats">'
          + '<span class="mk-stat">7d avg <b>' + stats.avgPrice.toLocaleString() + 'g</b></span>'
          + '<span class="mk-stat">vol <b>' + stats.volume.toLocaleString() + '</b></span>'
          + '<span class="mk-stat">' + stats.salesCount + ' sale' + (stats.salesCount===1?'':'s') + '</span>'
          + '<span class="mk-delta ' + deltaCls + '">' + deltaSign + deltaPct + '% vs avg</span>'
          + '</div>';
      } else {
        statsLine = '<div class="mk-stats"><span class="mk-stat muted">No 7-day sales yet</span></div>';
      }
      var actionBtn = ownsIt
        ? '<button class="mk-cancel" data-cancel="' + l.id + '">Cancel</button>'
        : '<button class="mk-buy" data-buy="' + l.id + '" data-item="' + l.itemId + '" data-each="' + l.askEach + '">Buy…</button>';
      return '<div class="mk-row">' +
        '<div class="mk-icon">' + iconHtml + '</div>' +
        '<div class="mk-info">' +
          '<div class="mk-name">' + (item ? item.n : l.itemId) + '<span class="mk-qty">×' + l.qty + '</span></div>' +
          '<div class="mk-meta">' + l.askEach.toLocaleString() + 'g each · seller: <b>' + escapeAttr(l.sellerName) + '</b> · ' + ttlH + 'h left</div>' +
          statsLine +
        '</div>' +
        '<div class="mk-action">' + actionBtn + '</div>' +
      '</div>';
    };

    // ── Top movers (7-day analytics block) ──
    var movers = getTopMovers7d(6);
    var moversBlock = '';
    if(movers.length){
      moversBlock = '<div class="mk-block"><h3>' + _mkGly('uiTrend', 15) + ' Top movers (last 7 days)</h3>'
        + '<div class="mk-movers">'
        + movers.map(function(m){
            var item = window.ITEMS && window.ITEMS[m.itemId];
            var icon = (window._itemPath && window._itemPath[m.itemId])
              ? '<img src="' + window._itemPath[m.itemId] + '" alt="">'
              : '<span>' + window.itemFallbackIcon(m.itemId, 22, item) + '</span>';
            var name = (item && item.n) || m.itemId;
            return '<button class="mk-mover" data-search="' + (item && item.n ? item.n : m.itemId) + '" title="Search for ' + name + '">'
              + '<div class="mm-icon">' + icon + '</div>'
              + '<div class="mm-name">' + name + '</div>'
              + '<div class="mm-stats">'
                + '<span>' + m.avgPrice.toLocaleString() + 'g avg</span> · '
                + '<span>' + m.volume.toLocaleString() + ' sold</span>'
              + '</div>'
              + '</button>';
          }).join('')
        + '</div></div>';
    }

    // ── My open buy offers (gold escrowed) ──
    var allOffers = loadOffers();
    var myOffers = allOffers.filter(function(o){ return o.buyerId === currentSellerId(); });
    var offerRow = function(o){
      var item = window.ITEMS && window.ITEMS[o.itemId];
      var icon = window.itemFallbackIcon(o.itemId, 22, item);
      var iconHtml = (window._itemPath && window._itemPath[o.itemId])
        ? '<img src="' + window._itemPath[o.itemId] + '" alt="">'
        : '<span>' + icon + '</span>';
      var ageH = ((Date.now() - o.postedAt)/3600000).toFixed(1);
      return '<div class="mk-row offer-row">'
        + '<div class="mk-icon">' + iconHtml + '</div>'
        + '<div class="mk-info">'
        +   '<div class="mk-name">' + (item ? item.n : o.itemId) + '<span class="mk-qty offer">Want ×' + o.qty + '</span></div>'
        +   '<div class="mk-meta">Up to <b>' + o.maxEach.toLocaleString() + 'g</b> each · escrowed <b>' + (o.escrowed||(o.qty*o.maxEach)).toLocaleString() + 'g</b> · ' + ageH + 'h ago</div>'
        + '</div>'
        + '<div class="mk-action"><button class="mk-cancel-offer mk-cancel" data-cancel-offer="' + o.id + '">Cancel offer</button></div>'
        + '</div>';
    };
    /* b355 — the buy-offer sub-market is HIDDEN under the seam (Security M5/M6):
       it is client-authored and has no server story, so its UI is not shown when
       server market authority is on. Any pre-flip local offers stay in storage,
       untouched and unshown, and are wiped at cutover. */
    var offersBlock = (myOffers.length && !serverMarketActive())
      ? ('<div class="mk-block"><h3>' + _mkGly('uiChest', 15) + ' Your buy offers (' + myOffers.length + ')</h3>'
        + myOffers.map(offerRow).join('')
        + '</div>')
      : '';

    var housing = '<div class="mk-strip"><b>Listings rules</b> · ' + (HOUSE_TAX*100) + '% house tax on sale · BoP items can\'t be listed · ' + listingLimit() + ' active listings per character · 48h expiry.</div>';

    // ── Search + sort toolbar ──
    var toolbar = '<div class="mk-toolbar">'
      + '<input type="search" id="mk-search" placeholder="Search by item or seller…" value="' + escapeAttr(ui.q || '') + '">'
      + '<select id="mk-sort">'
      +   '<option value="price-asc"' + (ui.sort==='price-asc'?' selected':'') + '>Price: low → high</option>'
      +   '<option value="price-desc"' + (ui.sort==='price-desc'?' selected':'') + '>Price: high → low</option>'
      +   '<option value="qty-desc"' + (ui.sort==='qty-desc'?' selected':'') + '>Qty: most first</option>'
      +   '<option value="newest"' + (ui.sort==='newest'?' selected':'') + '>Newest first</option>'
      +   '<option value="oldest"' + (ui.sort==='oldest'?' selected':'') + '>Oldest first</option>'
      +   '<option value="name"' + (ui.sort==='name'?' selected':'') + '>Name A → Z</option>'
      + '</select>'
      + (ui.q ? '<button id="mk-clear-q" title="Clear search">×</button>' : '')
      + '</div>';

    var mineBlock = '<div class="mk-block"><h3>Your listings (' + mine.length + ' / ' + listingLimit() + ')</h3>' +
      (mine.length ? mine.map(function(l){ return listingRow(l, true); }).join('') : '<div class="mk-empty">You haven\'t listed anything yet.</div>') +
    '</div>';
    var othersHeader = ui.q
      ? 'Open listings — matching "' + escapeAttr(ui.q) + '" (' + others.length + ')'
      : 'Open listings (' + others.length + ')';
    var othersBlock = '<div class="mk-block"><h3>' + othersHeader + '</h3>' +
      (others.length
        ? others.map(function(l){ return listingRow(l, false); }).join('')
        : '<div class="mk-empty">' + (ui.q
            ? 'Nothing matches "' + escapeAttr(ui.q) + '" — try a different search.'
            : 'No open listings right now. List something above and be first to market.') + '</div>') +
    '</div>';
    // Build a dropdown of every listable bag item — not BoP, has qty > 0,
    // and known to ITEMS so we can show its name. Sorted by name for the
    // player's convenience (typing the partial name still works as a search).
    var inv = (window.G && window.G.inventory) || {};
    var items = (window.ITEMS) || {};
    var listable = Object.keys(inv).filter(function(id){
      if(!inv[id] || inv[id] <= 0) return false;
      var def = items[id];
      if(!def) return false;
      if(def.bop) return false;     // BoP can't be listed
      return true;
    }).map(function(id){
      var d = items[id] || {};
      return { id: id, name: d.n || id, qty: inv[id], v: d.v || 0 };
    }).sort(function(a, b){ return a.name.localeCompare(b.name); });

    var pickerOpts = '<option value="">— Pick an item from your bag —</option>'
      + listable.map(function(it){
          return '<option value="' + it.id + '" data-have="' + it.qty + '" data-vendor="' + it.v + '">'
               + it.name + ' (' + it.qty.toLocaleString() + ')'
               + '</option>';
        }).join('');

    var listForm =
      '<div class="mk-list-form">' +
        '<h3>List an item</h3>' +
        '<div class="mk-form-row">' +
          '<select id="mk-list-id">' + pickerOpts + '</select>' +
          '<input type="number" id="mk-list-qty" min="1" value="1" placeholder="qty">' +
          '<input type="number" id="mk-list-each" min="1" placeholder="asking each">' +
          '<button id="mk-list-btn">List</button>' +
        '</div>' +
        '<div class="mk-form-hint" id="mk-list-hint">Pick an item to see how many you have and the NPC vendor price.</div>' +
      '</div>';

    /* THE LEDGER. Placed directly under "Your listings", because the question
       it answers ("did my stuff sell?") is the same question that block
       raises. Refreshed lazily and coalesced — the module re-renders the panel
       itself when a stale read lands, so this never blocks a paint and never
       fires a request per keystroke. */
    var MH = window.HearthriseMarketHistory;
    var historyBlock = '';
    if(MH){
      try{
        MH.refreshHistoryIfStale();
        historyBlock = historyBlockHtml(MH.getHistory(), ui.ledger || 'all', Date.now());
      }catch(e){ historyBlock = ''; }
    }

    panel.innerHTML = housing + listForm + moversBlock + mineBlock + historyBlock
      + offersBlock + toolbar + othersBlock;

    panel.querySelectorAll('button.mk-ledger-tab[data-ledger]').forEach(function(b){
      b.addEventListener('click', function(){
        ui.ledger = b.getAttribute('data-ledger') || 'all';
        saveUiState(ui);
        render();
      });
    });

    // ── Wire search + sort ──
    var searchEl = panel.querySelector('#mk-search');
    var sortEl   = panel.querySelector('#mk-sort');
    var clearEl  = panel.querySelector('#mk-clear-q');
    if(searchEl){
      // We re-render on every keystroke (cheap with localStorage) but
      // need to restore focus + caret position because innerHTML
      // destroyed the previous input element.
      searchEl.addEventListener('input', function(){
        ui.q = searchEl.value;
        saveUiState(ui);
        // Mark that we want to refocus search after the next render.
        window._mkRefocusSearch = { value: searchEl.value, caret: searchEl.selectionStart };
        render();
      });
      // If a previous render flagged a refocus, do it now.
      if(window._mkRefocusSearch){
        var rf = window._mkRefocusSearch;
        window._mkRefocusSearch = null;
        searchEl.focus();
        try { searchEl.setSelectionRange(rf.caret, rf.caret); } catch(e){}
      }
    }
    if(sortEl){
      sortEl.addEventListener('change', function(){
        ui.sort = sortEl.value;
        saveUiState(ui);
        render();
      });
    }
    if(clearEl){
      clearEl.addEventListener('click', function(){
        ui.q = '';
        saveUiState(ui);
        render();
      });
    }
    // Click a top-mover card to filter the listings to that item
    panel.querySelectorAll('.mk-mover').forEach(function(btn){
      btn.addEventListener('click', function(){
        ui.q = btn.getAttribute('data-search') || '';
        saveUiState(ui);
        render();
        // Scroll listings into view
        var openBlock = panel.querySelectorAll('.mk-block')[panel.querySelectorAll('.mk-block').length - 1];
        if(openBlock) openBlock.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });

    // When the player picks an item, populate the qty input with the
    // amount they have and the asking-each field with a sensible default
    // (1.5× the NPC vendor value). They can still override.
    var picker = panel.querySelector('#mk-list-id');
    var qtyInput = panel.querySelector('#mk-list-qty');
    var eachInput = panel.querySelector('#mk-list-each');
    var hint = panel.querySelector('#mk-list-hint');
    picker.addEventListener('change', function(){
      var opt = picker.options[picker.selectedIndex];
      if(!opt || !opt.value){
        if(hint) hint.textContent = 'Pick an item to see how many you have and the NPC vendor price.';
        return;
      }
      var have = parseInt(opt.getAttribute('data-have'), 10) || 1;
      var vendor = parseInt(opt.getAttribute('data-vendor'), 10) || 0;
      qtyInput.max = have;
      qtyInput.value = have;
      if(!eachInput.value && vendor > 0){
        eachInput.value = Math.max(1, Math.ceil(vendor * 1.5));
      }
      if(hint) hint.innerHTML = 'You have <b>' + have.toLocaleString() + '</b>. NPC vendor pays <b>' + vendor.toLocaleString() + 'g</b> each. Suggested ask: <b>' + Math.max(1, Math.ceil(vendor * 1.5)).toLocaleString() + 'g</b>.';
    });

    panel.querySelector('#mk-list-btn').addEventListener('click', function(){
      var id = (picker.value || '').trim();
      var q = parseInt(qtyInput.value, 10);
      var p = parseInt(eachInput.value, 10);
      var r = listItem(id, q, p);
      if(r.ok){ render(); }
      else if(typeof window.notify === 'function') window.notify(r.reason, 'kill');
    });
    panel.querySelectorAll('button.mk-buy[data-buy]').forEach(function(b){
      b.addEventListener('click', function(){
        var itemId = b.getAttribute('data-item');
        var price  = parseInt(b.getAttribute('data-each'), 10);
        openBuyModal(itemId, price);
      });
    });
    panel.querySelectorAll('button.mk-cancel-offer[data-cancel-offer]').forEach(function(b){
      b.addEventListener('click', function(){
        var r = cancelBuyOffer(b.getAttribute('data-cancel-offer'));
        if(r.ok) render();
      });
    });
    panel.querySelectorAll('button.mk-cancel[data-cancel]').forEach(function(b){
      b.addEventListener('click', function(){
        var r = cancelListing(this.dataset.cancel);
        if(r.ok) render();
      });
    });
  }
  window.renderMarket = render;

  // ── Buy modal ──────────────────────────────────────────────
  // Lets the player choose qty, see a live total, and (if they want
  // more than the market has at that price) place a buy offer for
  // the residual.
  function openBuyModal(itemId, atPrice){
    closeBuyModal();
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return;
    // How many are available at this price or cheaper, from sellers other than me?
    var meId = currentSellerId();
    var pool = loadListings().filter(function(l){
      return l.itemId === itemId && l.askEach <= atPrice && l.sellerId !== meId;
    });
    var available = pool.reduce(function(s, l){ return s + l.qty; }, 0);
    var iconHtml = (window._itemPath && window._itemPath[itemId])
      ? '<img src="' + window._itemPath[itemId] + '" alt="">'
      : '<span>' + window.itemFallbackIcon(itemId, 22, item) + '</span>';

    var modal = document.createElement('div');
    modal.id = 'buy-modal';
    modal.className = 'modal show';
    modal.innerHTML = ''
      + '<div class="modal-card buy-card">'
      +   '<div class="modal-head">'
      +     '<div class="modal-title"><div class="bm-icon">' + iconHtml + '</div>'
      +       'Buy ' + escapeAttr(item.n) + '</div>'
      +     '<button class="btn btn-sm" id="bm-close">×</button>'
      +   '</div>'
      +   '<div class="bm-body">'
      +     '<div class="bm-stat-row">'
      +       '<div class="bm-stat"><div class="bm-lbl">PRICE EACH</div><div class="bm-val">' + atPrice.toLocaleString() + 'g</div></div>'
      +       '<div class="bm-stat"><div class="bm-lbl">AVAILABLE AT THIS PRICE</div><div class="bm-val">' + available.toLocaleString() + '</div></div>'
      /* The buyer's own purse, on the sheet where they commit gold. A pending
         balance renders as the dash — "0g" here would be a claim, and on this
         particular sheet a badly wrong one. */
      +       '<div class="bm-stat"><div class="bm-lbl">YOUR GOLD</div><div class="bm-val">'
      +         window.balMarkup('gold') + (window.balKnown('gold') ? 'g' : '') + '</div></div>'
      +     '</div>'
      +     '<div class="bm-qty-row">'
      +       '<label>Quantity</label>'
      +       '<input type="number" id="bm-qty" min="1" value="' + Math.max(1, available) + '">'
      +       '<div class="bm-quick">'
      +         '<button data-q="1">1</button>'
      +         '<button data-q="5">5</button>'
      +         '<button data-q="10">10</button>'
      +         '<button data-q="25">25</button>'
      +         '<button data-q="all">Max</button>'
      +       '</div>'
      +     '</div>'
      +     '<div class="bm-summary" id="bm-summary"></div>'
      /* b355 — the "place a buy offer for the remainder" toggle is part of the
         client-authored buy-offer sub-market and is HIDDEN under the seam
         (Security M5/M6). With it gone, a short buy simply fills what the market
         has and reports the residual as unavailable. */
      +     (serverMarketActive() ? ''
        : ('<label class="bm-offer-toggle"><input type="checkbox" id="bm-offer" checked>'
      +       '<span>If short, place a buy offer for the remainder at this price</span></label>'))
      +   '</div>'
      +   '<div class="bm-actions">'
      +     '<button class="btn" id="bm-cancel">Cancel</button>'
      +     '<button class="btn btn-primary" id="bm-confirm">Confirm</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(modal);

    var qtyEl     = modal.querySelector('#bm-qty');
    var summary   = modal.querySelector('#bm-summary');
    var offerEl   = modal.querySelector('#bm-offer');   // null under the seam (toggle hidden)
    var confirmEl = modal.querySelector('#bm-confirm');
    /* b355 — the offer toggle is absent under the seam, so its checked-state is
       read through one null-safe helper rather than off a possibly-missing node. */
    var offerOn = function(){ return !!(offerEl && offerEl.checked); };

    function updateSummary(){
      var qWanted = Math.max(1, parseInt(qtyEl.value, 10) || 1);
      var fillNow = Math.min(qWanted, available);
      // compute exact spend by walking pool cheapest-first
      var pSorted = pool.slice().sort(function(a,b){ return a.askEach - b.askEach; });
      var spend = 0, taken = 0;
      for(var i = 0; i < pSorted.length && taken < fillNow; i++){
        var t = Math.min(pSorted[i].qty, fillNow - taken);
        spend += t * pSorted[i].askEach;
        taken += t;
      }
      var residual = qWanted - fillNow;
      var escrow = residual * atPrice;
      var totalGold = spend + (offerOn() ? escrow : 0);
      var canAfford = window.balCanAfford(totalGold, 'gold');
      var hasResidual = residual > 0;
      var lines = [];
      if(fillNow > 0){
        lines.push('<div class="bm-line">' +
          '<span>Buy now: <b>' + fillNow.toLocaleString() + '</b> @ avg ' + Math.round(spend/Math.max(1,fillNow)).toLocaleString() + 'g</span>' +
          '<span class="num">' + spend.toLocaleString() + 'g</span>' +
          '</div>');
      }
      if(hasResidual){
        if(offerOn()){
          lines.push('<div class="bm-line offer">' +
            '<span>Buy offer (escrow): <b>' + residual.toLocaleString() + '</b> @ ' + atPrice.toLocaleString() + 'g</span>' +
            '<span class="num">' + escrow.toLocaleString() + 'g</span>' +
            '</div>');
        } else {
          lines.push('<div class="bm-line short">' +
            '<span>Short by ' + residual + ' (no offer will be placed)</span>' +
            '<span class="num">—</span>' +
            '</div>');
        }
      }
      lines.push('<div class="bm-line total"><span><b>Total</b></span>' +
        '<span class="num"><b>' + totalGold.toLocaleString() + 'g</b></span></div>');
      summary.innerHTML = lines.join('');
      confirmEl.disabled = !canAfford || (fillNow === 0 && (!hasResidual || !offerOn()));
      confirmEl.textContent = canAfford
        ? (fillNow === qWanted ? 'Buy ' + fillNow : (offerOn() ? 'Buy ' + fillNow + ' + offer ' + residual : 'Buy ' + fillNow))
        : 'Not enough gold';
    }
    updateSummary();

    qtyEl.addEventListener('input', updateSummary);
    if(offerEl) offerEl.addEventListener('change', updateSummary);   // absent under the seam
    modal.querySelectorAll('.bm-quick button').forEach(function(b){
      b.addEventListener('click', function(){
        var v = b.getAttribute('data-q');
        if(v === 'all') qtyEl.value = available || 1;
        else qtyEl.value = v;
        updateSummary();
      });
    });
    modal.querySelector('#bm-close').addEventListener('click', closeBuyModal);
    modal.querySelector('#bm-cancel').addEventListener('click', closeBuyModal);
    confirmEl.addEventListener('click', function(){
      var qWanted = Math.max(1, parseInt(qtyEl.value, 10) || 1);
      var r = buyAggregated(itemId, qWanted, atPrice, offerOn());
      if(!r.ok){
        if(typeof window.notify === 'function') window.notify(r.reason, 'kill');
        return;
      }
      closeBuyModal();
      render();
    });
  }
  function closeBuyModal(){
    var m = document.getElementById('buy-modal');
    if(m && m.parentNode) m.parentNode.removeChild(m);
  }

  /* b230: the showTab wrapper is GONE too. showTab() itself now calls
     window.renderMarket() when the Market toggle is the one being opened —
     one render path, and it works for every alias (`market`, `exchange`,
     `shops` with Market remembered) rather than only for the literal string
     this wrapper happened to compare against. */
  /* b361: repaint when the trade ledger lands. ONE subscription, taken lazily
     because market-history.js is an ESM module and this is a classic script —
     binding at definition time would silently bind nothing, the same
     "guarded call to a name that never existed" shape b334 found. */
  var _ledgerBound = false;
  function bindLedger(attempt){
    if(_ledgerBound) return;
    var MH = window.HearthriseMarketHistory;
    if(MH && typeof MH.onHistoryChange === 'function'){
      _ledgerBound = true;
      MH.onHistoryChange(function(){
        var panel = document.getElementById('panel-market');
        /* Only when the market is actually on screen: a background repaint
           would blow away a half-typed search box for no benefit. */
        if(panel && panel.classList.contains('active')){ try{ render(); }catch(e){} }
      });
      return;
    }
    if((attempt||0) >= 60) return;
    setTimeout(function(){ bindLedger((attempt||0)+1); }, 500);
  }

  function start(){ injectPanel(); bindLedger(0); }
  if(document.readyState !== 'loading') setTimeout(start, 60);
  else document.addEventListener('DOMContentLoaded', start);

  console.log('[market] loaded — listing-based exchange (no direct trades)');

  /* ─── Production schema for Supabase (paste into SUPABASE_SETUP.md) ──
  create table public.market_listings (
    id uuid primary key default gen_random_uuid(),
    seller_user_id uuid not null references auth.users(id) on delete cascade,
    seller_slot int not null,           -- character slot
    seller_name text not null,
    item_id text not null,
    qty int not null check (qty > 0),
    ask_each bigint not null check (ask_each > 0),
    posted_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '48 hours')
  );
  create index on public.market_listings (item_id, ask_each);
  create index on public.market_listings (seller_user_id);

  -- Row-level security: anyone can read, only seller can update/delete their own.
  alter table public.market_listings enable row level security;
  create policy "anyone reads" on public.market_listings for select using (true);
  create policy "seller writes own" on public.market_listings for insert with check (auth.uid() = seller_user_id);
  create policy "seller updates own" on public.market_listings for update using (auth.uid() = seller_user_id);

  -- Sales history (for player market avg price tooltip)
  create table public.market_sales (
    id bigserial primary key,
    item_id text not null,
    each_price bigint not null,
    qty int not null,
    sold_at timestamptz not null default now()
  );
  create index on public.market_sales (item_id, sold_at desc);
  ─── */
})();
