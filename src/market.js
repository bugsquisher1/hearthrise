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

  const MARKET_KEY = 'hearthrise:market:listings';   // dev-only local mirror
  const OFFERS_KEY = 'hearthrise:market:offers';     // open buy-offers
  // Starting at 1.5% for soft beta — low enough to feel non-punitive while
  // still draining a small amount of gold from the economy. Tune up/down
  // post-beta based on listing velocity and floor-price stability.
  const HOUSE_TAX = 0.015;
  const LISTING_TTL_MS = 48 * 3600 * 1000;
  const PER_CHAR_LIMIT = 12;
  const PRICE_HISTORY_KEY = 'hearthrise:market:history';

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

  function currentSellerId(){
    // Tie listings to the active character so the seller can manage them.
    var prof = window.HearthriseProfile && window.HearthriseProfile.profile;
    if(prof) return 'slot-' + prof.activeSlot;
    return 'local-' + (window.G && window.G.account || 'guest');
  }
  function currentSellerName(){
    return (window.G && window.G.playerName) || 'Adventurer';
  }

  // ── Listing operations ────────────────────────────────────────
  function expireOld(list){
    var now = Date.now();
    var changed = false;
    for(var i = list.length - 1; i >= 0; i--){
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
    if(mine.length >= PER_CHAR_LIMIT){
      return { ok:false, reason:'Max ' + PER_CHAR_LIMIT + ' active listings reached' };
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
    // Try to auto-fill any matching open buy offers BEFORE we save —
    // this drains the new listing's qty in-place if there are takers.
    autoMatchAgainstOffers(newL);
    if(newL.qty <= 0){
      // Fully consumed by buy offers — drop the listing entirely.
      list.pop();
    }
    saveListings(list);
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
    if((window.G.gold||0) < totalCost) return { ok:false, reason:'Need ' + totalCost + ' gold' };

    // Transfer
    window.G.gold -= totalCost;
    if(typeof window.addItem === 'function') window.addItem(l.itemId, qtyWanted);
    else window.G.inventory[l.itemId] = (window.G.inventory[l.itemId]||0) + qtyWanted;

    // Update listing
    l.qty -= qtyWanted;
    if(l.qty <= 0) list.splice(idx, 1);
    saveListings(list);

    // Record sale (after-tax for seller, full price for history)
    recordSale(l.itemId, l.askEach, qtyWanted);
    // Seller's gold credited net of house tax. NOTE: in dev mode the
    // seller is the same player on the same browser, so we just no-op.
    // In production this writes to the seller's account via Supabase.
    var sellerNet = Math.floor(totalCost * (1 - HOUSE_TAX));
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
    if((window.G.gold||0) < willSpend) return { ok:false, reason:'Need ' + willSpend.toLocaleString() + ' gold for those ' + willGet + ' items' };

    // Execute. Mutate `list` in-place (find each pool entry by id).
    var bought = 0, spent = 0;
    pool.forEach(function(p){
      if(bought >= qty) return;
      var lIdx = list.findIndex(function(x){ return x.id === p.id; });
      if(lIdx < 0) return;
      var take = Math.min(list[lIdx].qty, qty - bought);
      var cost = take * list[lIdx].askEach;
      window.G.gold -= cost;
      if(typeof window.addItem === 'function') window.addItem(itemId, take);
      else window.G.inventory[itemId] = (window.G.inventory[itemId]||0) + take;
      recordSale(itemId, list[lIdx].askEach, take);
      list[lIdx].qty -= take;
      if(list[lIdx].qty <= 0) list.splice(lIdx, 1);
      bought += take;
      spent  += cost;
    });
    saveListings(list);

    var residual = qtyWanted - bought;
    var offerCreated = null;
    if(residual > 0 && placeOffer){
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
    if(qty <= 0 || maxEach <= 0) return { ok:false, reason:'Invalid amount' };
    var item = window.ITEMS && window.ITEMS[itemId];
    if(!item) return { ok:false, reason:'Unknown item' };
    if(item.bop) return { ok:false, reason:'Bind-on-Pickup items can\'t be ordered' };
    var totalEscrow = qty * maxEach;
    if((window.G.gold||0) < totalEscrow) return { ok:false, reason:'Need ' + totalEscrow.toLocaleString() + ' gold to escrow' };

    // Per-character cap on open buy offers (keep it bounded)
    var offers = loadOffers();
    var mine = offers.filter(function(o){ return o.buyerId === currentSellerId(); });
    if(mine.length >= PER_CHAR_LIMIT){
      return { ok:false, reason:'Max ' + PER_CHAR_LIMIT + ' open buy offers reached' };
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
    PER_CHAR_LIMIT: PER_CHAR_LIMIT,
    getStats7d: getStats7d,
    getTopMovers7d: getTopMovers7d,
    seedFakeListings: seedFakeListings,
    clearSeed: clearSeed,
  };

  // ── UI: Market tab + sidebar entry ────────────────────────────
  function injectNav(){
    var sidebar = document.getElementById('sidebar');
    if(!sidebar || sidebar.querySelector('[data-tab=market]')) return;
    var storeBtn = sidebar.querySelector('[data-tab=shop], [data-tab=store]');
    var btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-tab', 'market');
    btn.innerHTML = '<span class="ic">📈</span><span class="lbl">Market</span>';
    btn.addEventListener('click', function(){ if(typeof window.showTab === 'function') window.showTab('market'); });
    if(storeBtn && storeBtn.nextSibling) storeBtn.parentNode.insertBefore(btn, storeBtn.nextSibling);
    else sidebar.appendChild(btn);
  }
  function injectPanel(){
    if(document.getElementById('panel-market')) return;
    var main = document.querySelector('main.main');
    if(!main) return;
    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'panel-market';
    main.appendChild(panel);
  }

  function escapeAttr(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // Persisted UI state for search/sort. Survives reload.
  var UI_STATE_KEY = 'hearthrise:market:ui';
  function loadUiState(){
    try { return Object.assign({ q:'', sort:'price-asc' }, JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}')); }
    catch(e){ return { q:'', sort:'price-asc' }; }
  }
  function saveUiState(s){
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(s)); } catch(e){}
  }

  function render(){
    var panel = document.getElementById('panel-market');
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
      var icon = item && item.icon ? item.icon : '📦';
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
          '<div class="mk-meta">' + l.askEach.toLocaleString() + 'g each · seller: <b>' + l.sellerName + '</b> · ' + ttlH + 'h left</div>' +
          statsLine +
        '</div>' +
        '<div class="mk-action">' + actionBtn + '</div>' +
      '</div>';
    };

    // ── Top movers (7-day analytics block) ──
    var movers = getTopMovers7d(6);
    var moversBlock = '';
    if(movers.length){
      moversBlock = '<div class="mk-block"><h3>📊 Top movers (last 7 days)</h3>'
        + '<div class="mk-movers">'
        + movers.map(function(m){
            var item = window.ITEMS && window.ITEMS[m.itemId];
            var icon = (window._itemPath && window._itemPath[m.itemId])
              ? '<img src="' + window._itemPath[m.itemId] + '" alt="">'
              : '<span>' + ((item && item.icon) || '📦') + '</span>';
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
      var icon = item && item.icon ? item.icon : '📦';
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
    var offersBlock = myOffers.length
      ? ('<div class="mk-block"><h3>📥 Your buy offers (' + myOffers.length + ')</h3>'
        + myOffers.map(offerRow).join('')
        + '</div>')
      : '';

    var housing = '<div class="mk-strip"><b>Listings rules</b> · ' + (HOUSE_TAX*100) + '% house tax on sale · BoP items can\'t be listed · ' + PER_CHAR_LIMIT + ' active listings per character · 48h expiry.</div>';

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

    var mineBlock = '<div class="mk-block"><h3>Your listings (' + mine.length + ' / ' + PER_CHAR_LIMIT + ')</h3>' +
      (mine.length ? mine.map(function(l){ return listingRow(l, true); }).join('') : '<div class="mk-empty">You haven\'t listed anything yet.</div>') +
    '</div>';
    var othersHeader = ui.q
      ? 'Open listings — matching "' + escapeAttr(ui.q) + '" (' + others.length + ')'
      : 'Open listings (' + others.length + ')';
    var othersBlock = '<div class="mk-block"><h3>' + othersHeader + '</h3>' +
      (others.length ? others.map(function(l){ return listingRow(l, false); }).join('') : '<div class="mk-empty">No matching listings.</div>') +
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

    panel.innerHTML = housing + listForm + moversBlock + mineBlock + offersBlock + toolbar + othersBlock;

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
      : '<span>' + (item.icon || '📦') + '</span>';

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
      +       '<div class="bm-stat"><div class="bm-lbl">YOUR GOLD</div><div class="bm-val">' + (window.G.gold||0).toLocaleString() + 'g</div></div>'
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
      +     '<label class="bm-offer-toggle"><input type="checkbox" id="bm-offer" checked>'
      +       '<span>If short, place a buy offer for the remainder at this price</span></label>'
      +   '</div>'
      +   '<div class="bm-actions">'
      +     '<button class="btn" id="bm-cancel">Cancel</button>'
      +     '<button class="btn btn-primary" id="bm-confirm">Confirm</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(modal);

    var qtyEl     = modal.querySelector('#bm-qty');
    var summary   = modal.querySelector('#bm-summary');
    var offerEl   = modal.querySelector('#bm-offer');
    var confirmEl = modal.querySelector('#bm-confirm');

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
      var totalGold = spend + (offerEl.checked ? escrow : 0);
      var canAfford = (window.G.gold||0) >= totalGold;
      var hasResidual = residual > 0;
      var lines = [];
      if(fillNow > 0){
        lines.push('<div class="bm-line">' +
          '<span>Buy now: <b>' + fillNow.toLocaleString() + '</b> @ avg ' + Math.round(spend/Math.max(1,fillNow)).toLocaleString() + 'g</span>' +
          '<span class="num">' + spend.toLocaleString() + 'g</span>' +
          '</div>');
      }
      if(hasResidual){
        if(offerEl.checked){
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
      confirmEl.disabled = !canAfford || (fillNow === 0 && (!hasResidual || !offerEl.checked));
      confirmEl.textContent = canAfford
        ? (fillNow === qWanted ? 'Buy ' + fillNow : (offerEl.checked ? 'Buy ' + fillNow + ' + offer ' + residual : 'Buy ' + fillNow))
        : 'Not enough gold';
    }
    updateSummary();

    qtyEl.addEventListener('input', updateSummary);
    offerEl.addEventListener('change', updateSummary);
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
      var r = buyAggregated(itemId, qWanted, atPrice, offerEl.checked);
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

  function wireShowTab(){
    var orig = window.showTab;
    if(typeof orig !== 'function'){ setTimeout(wireShowTab, 100); return; }
    if(window.__marketTabHooked) return;
    window.__marketTabHooked = true;
    window.showTab = function(name){
      var r = orig.apply(this, arguments);
      if(name === 'market') setTimeout(render, 0);
      return r;
    };
  }
  function start(){ injectNav(); injectPanel(); wireShowTab(); }
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
