// ============================================================
// src/screens/shop-counter.js — BUYING AND SELLING, IN ONE FILE
//
// The third SCREEN-CONTROLLER extraction out of src/legacy.js (task #129,
// CLAUDE.md §7), and the one that finishes a job started two extractions ago:
// the shop's PAINTER left for src/render/shop.js in Phase 3.5 and its
// purchase handlers stayed behind, so half a screen lived in each place. This
// file is the other half — the counter itself. Two neighbourhoods:
//
//   BUYING  (legacy.js 9149–9192) — window.shopTab, setShopTab, buyShopItem,
//           buyCosmetic. The handlers src/render/shop.js's rendered buttons call.
//   SELLING (legacy.js 10691–10856) — vendorPrice (the ONE vendor bid in the
//           game), vendorSellChunked, Sell 1 / Sell All / Sell Selected, the
//           sell-lock, the vendor-sale record and buy-back repurchase.
//
// They belong together: `vendorPrice` is what the NPC pays and `buyShopItem` is
// what the NPC charges, and every argument about one is an argument about both.
//
// PURE MOVE. Every line below is byte-identical to the monolith, with ONE
// exception that is a comment, not code: the 24-line doc block explaining
// vendorPrice had drifted ~260 lines above the function it documents (legacy.js
// 10427, with unrelated balance-reader code between). It is reunited with
// `vendorPrice` here. Nothing else moved, was renamed, or changed shape.
//
// (One MERGE, not a move: `buyCosmetic` was rewired onto hr_buy_gem_unlock by
// the gem-unlock lane while this extraction was in flight. Their body is the one
// below — the lane that changes behaviour wins, the lane that moves code
// re-homes it — so the local `G.gems -=` debit and the ownedCosmetics residue
// push are gone from this file as well as from the monolith.)
//
// ── WHY THE NAMES ARE PUBLISHED AT THE FOOT ─────────────────────────────────
// At legacy.js's top level `function invSellOne(){}` WAS `window.invSellOne` by
// language rule, which is how `onclick="invSellOne('bronze_bar')"` in the item
// flyout, `src/features/inv-context-menu.js` and the smoke suite all reached it.
// Inside an IIFE that is no longer true, so every name with a proven caller is
// said out loud below. `vendorPrice`, `vendorSellChunked`, `isItemLocked`,
// `toggleItemLock`, `recordVendorSale`, `repurchase` and `VENDOR_RAW_RATE`
// already published themselves in the monolith and still do, on their own lines.
//
// ── WHAT THE GOLD/GEM LEDGERS SEE ───────────────────────────────────────────
// tests/gold-site-census.mjs walks src/** and demands a row in
// src/net/gold-sites.js for every gold write it finds. The rows for these
// gestures are keyed by their goldSettle SITE STRING (`seam:vendor.sell_one`,
// `seam:shop.buy`, …), which travels with the code, so the census follows this
// file without a key change; only the ledger's human `site:` prose was updated
// to name the new path. The GEM ledger has no row for anything in this file at
// all any more, and that is correct rather than an omission: `buyCosmetic` moves
// no gems now that it sends hr_buy_gem_unlock, and a row for a site that does
// not exist is what gem-site-census L2 fails on. If a future edit reintroduces
// `G.gems -=` here, L1 reports an UNDECLARED site and the build goes red.
//
// ── LOAD POSITION ───────────────────────────────────────────────────────────
// Loads with the other screen controllers BEFORE legacy.js. Safe because every
// top-level statement here is inert — declarations and `window.x = …` — and
// necessary for nothing in particular, which is why it is grouped with farm.js
// rather than given its own rule: no other file reads any of these names at
// evaluation time, and every global this file uses (`G`, `ITEMS`, `notify`,
// `goldSettle`, `removeItem`, `renderShop`, `renderInvFancy`, `renderBuyback`)
// is resolved at CALL time.
// ============================================================

(function () {
'use strict';

/* ────────────────────────────────────────────────
   RENDER — Shop / IAP store
   ──────────────────────────────────────────────── */
window.shopTab='seeds';
/* RENDER — Shop / IAP store: extracted to src/render/shop.js (9th render-layer
   strangler-fig, task #129 Phase 3.5). window.renderShop (+ its exclusive
   private helpers _iapGlyph / _iapContents / SHOP_SCENE) now lives there. The
   shop's active-tab state moved from a legacy-local `let shopTab` to
   window.shopTab (above) so the extracted painter and setShopTab (still here,
   below) share one identity. The purchase/redeem handlers stay global here. */
function setShopTab(t){window.shopTab=t;document.querySelectorAll('[data-shop]').forEach(c=>c.classList.toggle('active',c.dataset.shop===t));renderShop();}
/* AN ANSWER LOCK: a key is held from the send until ITS answer — no timer, the
   answer is the event (the transport's own deadline bounds it: gold.js keeps one
   across the body read). Each lock joins the intent-latch teardown registry
   (HearthriseIntentLatch.register, {size,reset}) on its first hold — that module
   loads after this classic script. The epoch makes a reset hold's late answer
   inert. Used by the shop row ("Buying…", Quartermaster ruling) and Sell All. */
function answerLock(onRelease){
  const held=new Set(); let epoch=0;
  const lock={
    size(){return held.size;}, reset(){held.clear();epoch++;}, has(k){return held.has(k);},
    hold(k,p){
      held.add(k); const born=epoch;
      const L=window.HearthriseIntentLatch; if(L&&typeof L.register==='function') L.register(lock);
      const rel=()=>{ if(born===epoch&&held.delete(k)&&onRelease){ try{onRelease(k);}catch(e){} } };
      Promise.resolve(p).then(rel,rel);
    },
  };
  return lock;
}
const _shopBuyKey=(id,qty,cost)=>id+'|'+qty+'|'+cost;
const shopBuyLock=answerLock(()=>renderShop());
function shopBuyPending(id,qty,cost){return shopBuyLock.has(_shopBuyKey(id,qty,cost));}
function buyShopItem(id,qty,cost){
  const _lk=_shopBuyKey(id,qty,cost);
  if(shopBuyLock.has(_lk)) return;   // this row is still waiting on its answer
  if(!balCanAfford(cost,'gold')){notify(balShortfall(cost,'gold'),'kill');return;}
  /* The key is generated BEFORE the local payment so the prediction and the
     request carry one identity — that is what lets the envelope retire exactly
     this gesture's prediction and no other. */
  const _k=goldIntentKey();
  goldSettle(-cost,'shop.buy',_k);
  addItem(id,qty);
  /* FIRE AND RECONCILE — never await-then-render. The offer id and the count
     are DERIVED from the item/qty/cost by src/net/gold.js; a price the shop and
     the catalogue disagree about refuses locally rather than charging a number
     the player never saw. No-op with the switch off. */
  const _p=(_k&&window.HearthriseGold)?window.HearthriseGold.buyShop(id,qty,cost,_k):null;
  if(_p&&typeof _p.then==='function') shopBuyLock.hold(_lk,_p);
  notify(`Bought ${Number(qty).toLocaleString()}× ${ITEMS[id]?.n}`,'loot');updateTopbar();renderShop();
}
/* ── COSMETICS: THE THIRD GEM TWIN, NOW THE THEME'S TWIN THE OTHER WAY. This
   was one line and every part of it was a client-authored premium purchase —
   `G.gems -= price` on an ARMED record balance (retired by the next envelope)
   plus an unconditional `G.ownedCosmetics.push(id)` into RESIDUE (which
   persisted). Free cosmetics, repeatable. It now goes through the SAME server
   verb buyTheme does, so there is one purchase path for the premium currency and
   the `price` argument the shop passes is a LABEL: it never crosses the wire and
   the server reads the cost from its own catalogue. */
function buyCosmetic(id,price){
  var cost=Math.max(0,Number(price)||0);
  if(window.ownsGemUnlock('cosmetic',id)){notify('That cosmetic is already yours.','info');return;}
  if(!balCanAfford(cost,'gems')){notify(balKnown('gems')?'Not enough gems. Tap "Get Gems".':balShortfall(cost,'gems'),'kill');return;}
  return window.buyGemUnlock('cosmetic:'+id,'that cosmetic',function(){
    notify('That cosmetic is already yours.','info');
    renderShop();
  }).then(function(res){
    if(res&&res.ok===true){ notify('Cosmetic unlocked!','levelup'); saveLocal(); }
    updateTopbar();renderShop();
  });
}

/* ════════════════════════════════════════════════════════════════
   b226 — vendorPrice(): what the NPC vendor BIDS, in one place.
   (docs/design/pacing-overhaul.md §6.1.)

   Raw materials fetch VENDOR_RAW_RATE × their book value; everything else
   fetches the book value. `ITEMS[id].v` is NOT touched — it stays the number
   market listings, recipe costing, chest payouts and the collection log all
   read, so nobody's bank is revalued and nothing already earned is reached
   into. Only the vendor's bid, and only from now on.

   Gathering throughput is roughly flat (~300 items/h at every tier) while `v`
   climbs 2.77× per material tier, so a maxed miner vendoring Dawnstone
   out-earned the King renown reward — 300,000 gold, the eleventh of twelve
   ranks — every 32 minutes, WHILE ASLEEP. Beyond the arithmetic this puts
   three systems back in their proper roles: gathering is the material faucet,
   the artisan skills are the gold path, and the player market becomes the
   best price for raws, because another player will pay more than 20% for
   something they actually need.

   ONE choke-point, mirroring applyGoldFind(). Every sell path in the game —
   the bag's Sell 1 / Sell All / Sell Selected, the context menu, the quick-
   sell slider, the sell-junk sweep and the old inventory tap — reads this.
   A price that differs by which button you pressed is not a price.
   ════════════════════════════════════════════════════════════════ */
const VENDOR_RAW_RATE = 0.20;
function vendorPrice(id){
  const it = (typeof ITEMS==='object' && ITEMS) ? ITEMS[id] : null;
  if(!it) return 0;
  const v = Number(it.v) || 0;
  if(v <= 0) return 0;
  /* Floored at 1: a raw worth anything at all is still worth something, and a
     0g bid reads as "this item is broken" rather than "this is cheap". */
  return it.raw ? Math.max(1, Math.floor(v * VENDOR_RAW_RATE)) : v;
}
window.VENDOR_RAW_RATE = VENDOR_RAW_RATE;
window.vendorPrice = vendorPrice;

/* Sell helpers — wrap existing logic if available, else simple */
/* ══════════════════════════════════════════════════════════════════════
   b377 (Tyler) — CHUNKED VENDOR SELL. THE FIX FOR "SELL A BIG STACK, GET NO GOLD".
   ══════════════════════════════════════════════════════════════════════
   `vendor_sell` prices ONE item id per call and both the server and
   src/net/gold.js bound a single intent at MAX_QTY (1,000). The old sell paths
   settled the WHOLE stack as one gold prediction and then sent ONE oversized
   `sellItem(id, qty)` — which, for qty > 1,000, was refused LOCALLY with
   `qty_out_of_range`, and that refusal's rollback REVERSED THE ENTIRE PREDICTION.
   So selling 4,600 iron platebodies deleted the stack and paid nothing.

   The stack is genuinely sellable — the contract just prices ≤1,000 per call —
   so split it into ceil(qty/1000) gestures, EACH with its own intent key, its
   own `goldSettle` prediction and its own `sellItem`. Every chunk now has a real
   server story and pays for itself; a rate-limited tail chunk (429) is
   PROVABLY_UNWRITTEN and rolls back only its own leg, self-healing at the next
   envelope. Purely client-side: no server change, no redeploy.

   Returns the unit bid so callers can still total the receipt/notify. */
function vendorSellChunked(id, qty, site, sent){
  const S = window.HearthriseGold;
  const MAXQ = (S && S.MAX_QTY) || 1000;
  const price = vendorPrice(id);
  let remaining = qty;
  while(remaining > 0){
    const chunk = Math.min(remaining, MAXQ);
    const _k = goldIntentKey();
    goldSettle(price * chunk, site, _k);
    if(_k && S){ const _p = S.sellItem(id, chunk, _k); if(_p && _p.catch) _p.catch(()=>{}); if(sent && _p) sent.push({ p: _p, qty: chunk }); }
    remaining -= chunk;
  }
  return price;
}
window.vendorSellChunked = vendorSellChunked;
/* THE STACK THE SERVER LAST CONFIRMED (accrue.js gateItemCount); NULL = unstated.
   Sell All names and sells THIS (Game Designer ruling 5). Every other sell is
   display-bounded and lets the server answer: vendor_sell is collectsFirst, so
   items gathered since the last envelope ARE sellable on the server, and a gate
   on the last bag may only accept early, never refuse (DISCOVERIES 2026-10-03). */
const SELL_PENDING_TITLE = 'Not counted yet — the realm is still counting your bag';
function sellableCount(id){
  const A = window.HearthriseAccrual;
  return (A && typeof A.gateItemCount === 'function') ? A.gateItemCount(G, id) : null;
}
window.sellableCount = sellableCount;
window.SELL_PENDING_TITLE = SELL_PENDING_TITLE;
window.vendorSellReceipt = sellReceipt;   // onItemTap (legacy.js) and quick-sell (item-ux.js) show the server's answer too
/* Sell All's answer lock, keyed by item id; the open flyout repaints on release. */
const sellAllLock = answerLock((id) => { if(window._invDetailId === id){ try{ openInvDetail(id); }catch(e){} } });
window.sellAllPending = (id) => sellAllLock.has(id);
/* THE RECEIPT IS THE SERVER'S: the sum of each answered chunk's receipt
   ({qty, gold}), never the count we asked for. Nothing sent → the local line.
   A chunk the server provably did not write (refused — insufficient_item is
   all-or-nothing — rate-limited, not signed in) had its gold rolled back by
   gold.js; its items go back on the display bag here, so neither half of the
   prediction outlives the server's "no". sent = [{p, qty}]. */
function sellReceipt(id, qty, price, sent){
  const it = ITEMS[id] || { n: id };
  if(!sent || !sent.length){ notify(`Sold ${Number(qty).toLocaleString()}× ${it.n} for ${(price*qty).toLocaleString()} gold`,'loot'); return Promise.resolve(null); }
  return Promise.all(sent.map((c) => Promise.resolve(c.p).then((r) => r, () => null))).then((rs) => {
    const S = window.HearthriseGold; let sold = 0, gold = 0, back = 0;
    rs.forEach((r, i) => {
      if(r && S && typeof S.isProvablyUnwritten === 'function' && S.isProvablyUnwritten(r.outcome)) back += sent[i].qty | 0;
      if(!r || (r.outcome !== 'applied' && r.outcome !== 'replayed')) return;
      const rc = (S && typeof S.receiptOf === 'function') ? S.receiptOf(r.body) : null;
      if(rc){ sold += Number(rc.qty) || 0; gold += Number(rc.gold) || 0; }
    });
    if(back > 0){ addItem(id, back, false); try{ renderInvNew(); }catch(e){} }
    if(sold > 0) notify(`Sold ${sold.toLocaleString()}× ${it.n} for ${gold.toLocaleString()} gold` + (sold < qty ? ` · ${(qty - sold).toLocaleString()} not sold` : ''),'loot');
    else notify(`The realm did not sell your ${it.n} — your bag will settle`,'kill');
    return { sold, gold };
  });
}
function invSellOne(id){
  const it = ITEMS[id]; if(!it) return;
  if(isItemLocked(id)){ notify(`${it.n} is locked — unlock it in your bag first`,'kill'); return; }
  /* DISPLAY-BOUNDED, the server answers (see sellableCount): a log gathered
     since the last envelope is real on the server and sells. */
  if((G.inventory[id]||0) <= 0){ notify('Nothing to sell','kill'); return; }
  const price = vendorPrice(id);
  const _k = goldIntentKey();
  goldSettle(price, 'vendor.sell_one', _k);
  removeItem(id, 1);
  const sent = [];
  if(_k && window.HearthriseGold){ const _p = window.HearthriseGold.sellItem(id, 1, _k); if(_p && _p.catch) _p.catch(()=>{}); if(_p) sent.push({ p: _p, qty: 1 }); }
  recordVendorSale(id, 1, price);   // b240: undoable
  sellReceipt(id, 1, price, sent);
  updateTopbar(); renderInvNew();
}
function invSellAll(id){
  const it = ITEMS[id]; if(!it) return;
  if(isItemLocked(id)){ notify(`${it.n} is locked — unlock it in your bag first`,'kill'); return; }
  /* Game Designer ruling: Sell All sells the stack the server last confirmed. */
  const qty = sellableCount(id);
  if(qty === null){ notify(SELL_PENDING_TITLE,'info'); return; }
  if(qty <= 0){ notify('Nothing to sell','kill'); return; }
  if(sellAllLock.has(id)) return;   // this stack's Sell All is still waiting on its answer
  const sent = [];
  const price = vendorSellChunked(id, qty, 'vendor.sell_all', sent);   // b377: ≤1,000 per intent
  /* HELD UNTIL ITS OWN ANSWER: a second press would resend the same confirmed
     count the first one already spent. Released when every chunk has answered
     (its envelope applied), never by a timer. */
  if(sent.length) sellAllLock.hold(id, Promise.all(sent.map((c) => Promise.resolve(c.p).catch(() => null))));
  /* b487 — THROUGH THE BAG SEAM, not `delete G.inventory[id]`. Sell All is the
     natural gesture for a single tool, and the raw delete skipped every
     consequence removeItem() owns — including the tool retime (#33: "sold the
     pickaxe, the boost still applied"). Same result on the bag, one writer. */
  removeItem(id, qty);
  recordVendorSale(id, qty, price);   // b240: undoable
  sellReceipt(id, qty, price, sent);
  updateTopbar(); renderInvNew(); closeInvDetail();
}
/* ══════════════════════════════════════════════════════════════════════
   BULK SELL, ONE INTENT PER PRESS (`vendor_sell_many`).
   ══════════════════════════════════════════════════════════════════════
   Sell Selected and the junk sweep used to pay gold locally through a DEFERRED
   site and send nothing, so the next envelope took both halves back (CLAUDE.md
   §6); an interim closed them. They are back on the server verb built for
   them: N stacks in ONE intent — one key, one `shop` rate token, one settle —
   priced line by line from the server's catalogue and ALL-OR-NOTHING under
   hr_apply.

   THE PRESS, IN ORDER:
     1. the `vendor-bulk` intent latch holds from the send until the answer (plus
        its 600 ms floor), so a double press sends ONCE;
     2. ONE display prediction under the intent key (vendorPrice is the shop's
        own bid, so the number the player sees is the number the server will
        pay — and the envelope overwrites it either way);
     3. the stacks leave the display bag;
     4. the answer: the toast is built from the server RECEIPT and nothing else.
        A provable refusal (PROVABLY_UNWRITTEN) rolls the gold back in gold.js;
        the stacks come back from the refusal's envelope when it carried one, or
        from here when it did not. An unanswered call (timeout, 5xx) leaves the
        display as it is and the next absolute envelope settles it.

   ONE INTENT PER PRESS, so a press names at most MAX_SELL_LINES stacks of at
   most MAX_QTY each. Anything beyond stays in the bag and the toast says so; it
   is never removed locally, so there is nothing to put back.
   Regressions: BULK-SELL-1…4 (src/features/smoke/monsters-inventory-and-brand.js). */
function bulkSellLatch(){
  const L = window.HearthriseIntentLatch;
  return (L && typeof L.namedLatch === 'function') ? L.namedLatch('vendor-bulk') : null;
}
/** The press's lines: one per stack, capped to what ONE intent may carry. */
function bulkSellLines(picks){
  const S = window.HearthriseGold;
  const MAXL = (S && S.MAX_SELL_LINES) || 64, MAXQ = (S && S.MAX_QTY) || 1000;
  const lines = [], seen = new Set();
  let left = 0;
  for(const p of picks){
    const qty = Math.floor(Number(p && p.qty) || 0);
    if(!p || qty <= 0 || seen.has(p.id)) continue;
    if(lines.length >= MAXL){ left += qty; continue; }
    seen.add(p.id);
    const q = Math.min(qty, MAXQ);
    lines.push({ item: p.id, qty: q });
    left += qty - q;
  }
  return { lines, left };
}
/** The toast — the SERVER's receipt, or a line that says the server did not sell. */
function bulkSellToast(r, left){
  const H = window.HearthriseGold;
  const rc = (r && H && typeof H.receiptOf === 'function') ? H.receiptOf(r.body) : null;
  if(r && (r.outcome === 'applied' || r.outcome === 'replayed') && rc && Array.isArray(rc.lines)){
    const sold = rc.lines.reduce((s, l) => s + (Number(l && l.qty) || 0), 0);
    const gold = Number(rc.gold) || 0;
    notify(`Sold ${sold.toLocaleString()} items for ${gold.toLocaleString()} gold`
      + (left > 0 ? ` · ${left.toLocaleString()} left in your bag — sell again for the rest` : ''), 'loot');
    return { sold, gold };
  }
  if(r && (r.outcome === 'applied' || r.outcome === 'replayed')){
    notify('That sale already went through — your bag has settled', 'info');
    return { sold: 0, gold: 0 };
  }
  if(r && H && typeof H.isProvablyUnwritten === 'function' && H.isProvablyUnwritten(r.outcome)){
    notify(r.outcome === 'rate-limited'
      ? 'The shopkeeper needs a moment — nothing was sold, try again shortly'
      : 'The realm did not buy that batch — nothing was sold', 'kill');
    return null;
  }
  notify('The realm has not answered yet — your bag will settle', 'info');
  return null;
}
/**
 * SELL THESE STACKS IN ONE INTENT. `picks` = [{id, qty}] with the server-
 * confirmed counts; locked and worthless stacks are the caller's to drop.
 * Resolves {sold, gold} from the receipt, or null (refused, unanswered, or a
 * second press while the first is in flight — which is silence).
 */
function vendorSellMany(picks, site){
  const S = window.HearthriseGold, latch = bulkSellLatch();
  if(!S || typeof S.sellItems !== 'function' || !latch){
    notify('The shop is still opening — try again in a moment', 'info');
    return Promise.resolve(null);
  }
  const { lines, left } = bulkSellLines(picks || []);
  if(!lines.length){ notify('Nothing to sell', 'kill'); return Promise.resolve(null); }
  const scope = lines.map((l) => l.item + '*' + l.qty).sort().join(',');
  const p = latch.run('sweep', (idem) => {
    /* DISPLAY ONLY, under the intent key: the next envelope is absolute. */
    goldSettle(lines.reduce((s, l) => s + vendorPrice(l.item) * l.qty, 0), site, idem);
    lines.forEach((l) => removeItem(l.item, l.qty));
    try{ updateTopbar(); renderInvNew(); }catch(e){}
    return S.sellItems(lines, idem);
  }, { scope });
  return p.then((r) => {
    const IL = window.HearthriseIntentLatch;
    if(IL && IL.isInFlightAnswer(r)) return null;   // the first press answers for both
    /* THE STACKS COME BACK when the server provably wrote nothing and its answer
       carried no envelope to restore them from (a stateless refusal, a 429). An
       envelope-bearing refusal (insufficient_item) already put the bag back. */
    const hadEnvelope = !!(r && r.applied && r.applied.envelope);
    if(r && !hadEnvelope && typeof S.isProvablyUnwritten === 'function' && S.isProvablyUnwritten(r.outcome)){
      lines.forEach((l) => addItem(l.item, l.qty, false));
    }
    const out = bulkSellToast(r, left);
    if(out && out.sold > 0) lines.forEach((l) => recordVendorSale(l.item, l.qty, vendorPrice(l.item)));   // noted for the buy-back list
    try{ updateTopbar(); renderInvNew(); }catch(e){}
    return out;
  }, () => { notify('The realm has not answered yet — your bag will settle', 'info'); return null; });
}
window.vendorSellMany = vendorSellMany;

/** Sell Selected — every selected, unlocked, sellable stack, in ONE intent. */
function invSellSelected(){
  if(!window._invSelected.size){ notify('Nothing selected','kill'); return Promise.resolve(null); }
  /* Every quantity is the server's; an unstated bag sells nothing. */
  for(const id of window._invSelected){ if(ITEMS[id] && sellableCount(id) === null){ notify(SELL_PENDING_TITLE,'info'); return Promise.resolve(null); } }
  const picks = []; let skipped = 0;
  for(const id of window._invSelected){
    if(!ITEMS[id]) continue;
    if(isItemLocked(id) || vendorPrice(id) <= 0){ skipped++; continue; }   // a locked stack stays; a 0g bid would refuse the batch
    const qty = sellableCount(id) || 0;
    if(qty > 0) picks.push({ id, qty });
  }
  if(!picks.length){ notify(skipped ? 'Nothing selected can be sold — locked or worthless' : 'Nothing to sell','kill'); return Promise.resolve(null); }
  window._invSelected.clear();
  window._invSelectMode = false;
  if(skipped) notify(`${skipped} locked or worthless item(s) left in your bag`,'info');
  return vendorSellMany(picks, 'vendor.sell_selected');
}

/* ══════════════════════════════════════════════════════════════════════
   b240 (Tyler) — SELL-LOCK + VENDOR BUY-BACK.
   Two safety nets around the vendor so an accidental tap never loses a thing:
   • Lock an item and it cannot be sold until you unlock it (a padlock in the
     flyout; every sell path checks isItemLocked first).
   • Every vendor sale is noted in G.buyback (client residue, never shown). The
     buy-back itself is CLOSED: gold is server-armed and there is no server
     verb (gold-sites BUYBACK_LEDGER), so repurchase() fails closed and the
     Buy-Back window says so (2026-09-28). ═════════════════════════════════ */
function isItemLocked(id){ return !!(G.lockedItems && G.lockedItems[id]); }
function toggleItemLock(id){
  G.lockedItems = G.lockedItems || {};
  /* THE BOUND (src/net/client-state.js §THE SIZE GUARD'S CLIENT HALF): only a
     CATALOGUE id may be locked, so the key set can never outgrow ITEMS. (The
     alias pass drops unknown keys on load, but early-returns while ITEM_ALIAS is
     empty — which it is — so this is the bound that actually runs.) Unlocking is
     never refused: an id that fell out of the catalogue must stay removable. */
  if(!ITEMS[id] && !G.lockedItems[id]) return;
  if(G.lockedItems[id]){ delete G.lockedItems[id]; notify('Unlocked — this item can be sold','info'); }
  else { G.lockedItems[id] = true; notify('Locked — protected from selling','info'); }
  try{ saveLocal(); }catch(e){}
  try{ if(typeof renderInvFancy==='function') renderInvFancy(); }catch(e){}
  try{ if(typeof renderInvNew==='function') renderInvNew(); }catch(e){}
  try{ if(typeof openInvDetail==='function' && window._invDetailId===id) openInvDetail(id); }catch(e){}
}
function recordVendorSale(id, qty, unit){
  if(!qty || unit==null) return;
  G.buyback = Array.isArray(G.buyback) ? G.buyback : [];
  const ex = G.buyback.find(b => b.id===id && b.unit===unit);
  if(ex){ ex.qty += qty; ex.at = Date.now(); }
  else { G.buyback.unshift({ id, qty, unit, at: Date.now() }); }
  if(G.buyback.length > 15) G.buyback.length = 15;
}
function repurchase(idx){
  G.buyback = Array.isArray(G.buyback) ? G.buyback : [];
  const b = G.buyback[idx]; if(!b) return;
  const it = ITEMS[b.id]; if(!it){ G.buyback.splice(idx,1); return; }
  const cost = b.unit * b.qty;
  /* ── b4xx — GATED ON THE RECORD SEAM (designer ruling, slice 7). ─────────────
     Buy-back re-purchases at the EXACT price the vendor paid, off a 15-entry
     LOCAL list — a client-supplied PAST PRICE. While gold is UNARMED (today)
     clientMayWriteRecordField('gold') is true and this is the plain debit that
     shipped before. The instant gold joins SERVER_OF_RECORD and is armed it
     returns false and this fails CLOSED: a client past-price crossing into an
     armed balance is a mint, and buy-back has no server verb yet (BUYBACK_LEDGER).
     The gate is a no-op today; it becomes the guard the moment gold flips. */
  if(typeof window.clientMayWriteRecordField==='function' && !window.clientMayWriteRecordField('gold')){
    if(typeof notify==='function')notify('The realm keeps no buy-back counter yet','kill');
    return;
  }
  if(!balCanAfford(cost,'gold')){ notify(balKnown('gold')?'Not enough gold to buy it back':balShortfall(cost,'gold'),'kill'); return; }
  G.gold -= cost;
  addItem(b.id, b.qty);
  G.buyback.splice(idx, 1);
  notify(`Bought back ${Number(b.qty).toLocaleString()}× ${it.n} for ${cost.toLocaleString()} gold`,'loot');
  try{ saveLocal(); }catch(e){}
  updateTopbar();
  renderBuyback();
  try{ if(typeof renderInvFancy==='function') renderInvFancy(); }catch(e){}
}
window.isItemLocked = isItemLocked;
window.toggleItemLock = toggleItemLock;
window.recordVendorSale = recordVendorSale;
window.repurchase = repurchase;

/* ── THE BUY-SPACE DIALOG (legacy.js 9173–9215, moved verbatim 2026-09-14).
   It is a PURCHASE COUNTER — "how much does the next rung of bag space cost,
   in gold and in gems, side by side" — so it belongs with the other two
   counters rather than in the middle of the monolith, and it is the last
   piece of the shop that was still there. It renders only: the two BUYERS
   (buyBankSpaceGold / buyBankSpaceGem) stay in legacy.js with their gold and
   gem ledger rows, and the inline onclick attributes below resolve them
   against window when the player clicks, exactly as before. Its callers are
   src/screens/inventory.js (the bag toolbar's "Buy space") and
   src/render/bank-panel.js, both through window.openBankModal.
   `_renderBankModal` is published because legacy.js's two buyers call it
   bare at four sites to repaint the open dialog after a purchase — at the
   monolith's top level that bare name resolved through window, and it still
   must. ── */
/* b269: the "Buy space" dialog for the bank. Shows the live cap, the next gold
   cost (escalating) and the flat gem deal side-by-side so the better value of
   gems is legible. Reuses the .qm-overlay backdrop + .btn classes — no new CSS. */
function closeBankModal(){ var o=document.getElementById('bank-modal-overlay'); if(o)o.remove(); }
function _bankRowsHTML(){
  var used=bankUsed(), cap=bankCap();
  var gCost=bankGoldCost(), gemCost=BANK_SPACE.gem.cost;
  var canG=balCanAfford(gCost,'gold'), canGem=balCanAfford(gemCost,'gems');
  var gp=(typeof _gp==='function')?_gp:function(n){return n.toLocaleString()+' gold';};
  var gem=(typeof _gem==='function')?_gem:function(n){return n.toLocaleString()+' gems';};
  var gemPerSlot=(gemCost/BANK_SPACE.gem.slots), goldPerSlot=(gCost/BANK_SPACE.gold.slots);
  return ''
    + '<p class="bank-cap-line">Bank space: <b>'+used+' / '+cap+'</b> stacks</p>'
    + '<div class="bank-opt">'
      + '<div class="bank-opt-info"><b>+'+BANK_SPACE.gold.slots+' stacks</b><span>Gold — cost rises with every purchase.</span></div>'
      + '<div class="bank-opt-buy"><span class="price">'+gp(gCost)+'</span>'
      + '<button class="btn btn-sm '+(canG?'btn-primary':'')+'" '+(canG?'':'disabled')+' onclick="buyBankSpaceGold()">Buy</button></div>'
    + '</div>'
    + '<div class="bank-opt bank-opt-gem">'
      + '<div class="bank-opt-info"><b>+'+BANK_SPACE.gem.slots+' stacks</b><span>Gems — a flat, better deal ('+goldPerSlot.toFixed(0)+' g/slot vs '+gemPerSlot.toFixed(2)+' gem/slot).</span></div>'
      + '<div class="bank-opt-buy"><span class="price gem">'+gem(gemCost)+'</span>'
      + '<button class="btn btn-sm '+(canGem?'btn-gem':'')+'" '+(canGem?'':'disabled')+' onclick="buyBankSpaceGem()">Buy</button></div>'
    + '</div>';
}
function _renderBankModal(){
  var body=document.getElementById('bank-modal-body');
  if(body) body.innerHTML=_bankRowsHTML();
}
function openBankModal(){
  closeBankModal();
  var overlay=document.createElement('div');
  overlay.className='qm-overlay hr-scrim'; overlay.id='bank-modal-overlay';
  overlay.innerHTML=
    '<div class="qm-modal bank-modal hr-sheet" style="position:relative;max-width:460px">'
    + '<button class="qm-close" aria-label="Close" data-hr-dismiss>✕</button>'
    + '<h3 class="hr-sheet-head" style="margin:0 0 4px">Buy bank space</h3>'
    + '<div id="bank-modal-body" class="hr-sheet-body">'+_bankRowsHTML()+'</div>'
    + '</div>';
  overlay.querySelector('.qm-close').addEventListener('click', closeBankModal);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeBankModal(); });
  document.body.appendChild(overlay);
}
try{ window.openBankModal=openBankModal; window.closeBankModal=closeBankModal; }catch(_){}
window._renderBankModal = _renderBankModal;

/* ── PUBLISHED. These six were window properties only because a classic
      script's top-level `function f(){}` is one; inside an IIFE they must be
      stated. Callers:
        setShopTab       inline onclick on the shop tab strip (src/render/shop.js),
                         the tab-strip click wiring in legacy.js, features/death-sheet.js
        buyShopItem      inline onclick on every shop row
        buyCosmetic      inline onclick on the cosmetics rows, src/multi-character.js
        invSellOne       inline onclick in the item flyout, features/inv-context-menu.js
        invSellAll       inline onclick in the item flyout
        invSellSelected  the bag's multi-select sweep (legacy.js + the smoke suite)
      Everything else this file declares is now module-private. ── */
window.setShopTab      = setShopTab;
window.buyShopItem     = buyShopItem;
window.shopBuyPending  = shopBuyPending;
window.__shopBuyLock   = shopBuyLock;
window.buyCosmetic     = buyCosmetic;
window.invSellOne      = invSellOne;
window.invSellAll      = invSellAll;
window.invSellSelected = invSellSelected;

/* REPAINT WHAT GATED ON THE BALANCE WHEN THE SERVER RESOLVES IT. Every
   Buy / Build / Buy-back button here is painted from balCanAfford, which
   fail-closes while a gesture's own prediction is in flight — so the gesture's
   repaint paints them disabled and, before this, nothing lit them again when the
   answer landed. src/net/gold.js announces `hr:balance-resolved` from its two
   resolve points; this is the one listener for the counter-side surfaces (the
   market sheet binds its own). Only what is on screen repaints. */
function repaintBalanceSurfaces(){
  try{ updateTopbar(); }catch(e){}
  try{ if(activeTab==='shop') renderShop(); }catch(e){}
  try{ if(activeTab==='house') window.renderHouseSurfaces(); }catch(e){}
  try{ var bb=document.getElementById('bb-modal'); if(bb&&bb.classList.contains('show')) window.renderBuyback(); }catch(e){}
  try{ _renderBankModal(); }catch(e){}
}
window.addEventListener('hr:balance-resolved', repaintBalanceSurfaces);

console.log('Shop counter: loaded');
})();
