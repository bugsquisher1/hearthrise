// ============================================================
// src/screens/farm.js — THE FARM SCREEN CONTROLLER
//
// The second SCREEN-CONTROLLER extraction out of src/legacy.js (task #129,
// CLAUDE.md §7). The whole farming tab in one file: the growth accessors, the
// ready/water tickers, the server-authority routing (hr_farm_plant / _water /
// _harvest), the three gestures, the painter, Plant all, auto-replant and the
// seed picker. Two contiguous neighbourhoods of the monolith — legacy.js
// 6871–7248 ("─── farming ───" through harvestPlot) and 8915–9099 ("RENDER —
// Farming" through openSeedPicker) — moved in source order into one IIFE.
//
// ── WHAT CHANGED, EXHAUSTIVELY ──────────────────────────────────────────────
// Eight call sites, all of the same one kind, and nothing else. At a classic
// script's TOP LEVEL a bare `renderFarm()` resolves through the GLOBAL OBJECT,
// so it invoked whatever `window.renderFarm` currently was — which is never the
// raw declaration: legacy.js wraps it in its paintAll list and
// src/error-boundary.js wraps it again. Inside an IIFE the identical text binds
// to the module-local declaration instead and would silently bypass both
// wrappers. So the two moved names that OTHER files re-assign at runtime are
// called through `window.` here:
//     renderFarm   — legacy.js paintAll list, error-boundary TARGETS, and the
//                    smoke suite stubs it directly (6 internal call sites)
//     harvestPlot  — src/features/companions.js reassigns window.harvestPlot
//                    (1 internal call site, in waterPlot's ready-plot branch)
// Every other moved name is re-assigned nowhere in the repo, so its local
// binding IS the published function object and its call sites are untouched.
// Inline `onclick="harvestPlot(i)"` / `"waterPlot(i)"` / `"plantCrop(…)"` inside
// the template strings are HTML attributes: they resolve against window when the
// player clicks, exactly as before.
//
// ── LOAD POSITION: BEFORE legacy.js, AND THAT IS LOAD-BEARING ───────────────
// legacy.js runs `['updateTopbar','renderProfile','renderCombat','renderFarm',
// 'renderInvNew','showTab'].forEach(n => { var orig = window[n]; … })` at its own
// top level to install the paintAll wrapper, reading `window[n]` DURING
// EVALUATION. If this file loaded after legacy.js, `window.renderFarm` would be
// undefined at that moment, the `typeof orig !== 'function'` guard would return,
// and the nav badges would stop refreshing after a harvest — silently. The
// inventory controller has the opposite constraint (it wraps legacy functions,
// so it must load after); each src/screens/* file states its own rule and
// index.html honours it. Precedent for loading before legacy.js:
// src/render/{icons,fight-warning,retreat,activity-tile}.js already do.
//
// Loading early is SAFE here because every top-level statement in this file is
// inert: function declarations, four module-private `let`/`const`s and a few
// `window.x = …` publications. Nothing reads game state, the DOM or another
// module at evaluation time; every global (`G`, `CROPS`, `ITEMS`, `activeTab`,
// `notify`, `addItem`, `itemArt`, …) is resolved at CALL time, by which point
// legacy.js has fully executed.
//
// ── WHAT THE MODULE PUBLISHES, AND WHY EACH ONE ─────────────────────────────
// At legacy.js's top level every `function f(){}` WAS a window property. Inside
// an IIFE it is not, so each name with a proven caller outside this file is
// re-published at the foot. The rest are now genuinely private — which is the
// point of the extraction. The census behind the list is in the commit message.
//
// ── WHAT DID NOT MOVE ───────────────────────────────────────────────────────
//   • `upgradePlot` / `buildPlot` — the PROPERTY (plot tier) ladder, which lives
//     with the House screen and src/features/farm-progression.js.
//   • The Homestead farm TILES (legacy.js ~7785) — a different screen that reads
//     plotIsReady / plotPct / plotWindowMs; those three stay published for it.
// ============================================================

(function () {
'use strict';

/* ─── farming ─── */
/* b220 (backlog #13 — docs/design/farming-watering.md): watering is an
   OPTIONAL accelerator, not a gate. All growth maths lives in ONE place,
   HearthriseFarm.growthHours() (src/features/farm-progression.js), which the
   tick, the offline catch-up and every renderer read. These thin accessors
   exist so legacy.js never re-derives growth itself — the old code did, in
   four places, with `&& p.watered` baked into two of them, which is exactly
   how unwatered crops came to stall forever. */
function farmApi(){ return window.HearthriseFarm; }
function plotIsReady(p){ const A=farmApi(); return !!(A&&A.isReady&&A.isReady(p)); }
function plotPct(p){ const A=farmApi(); return (A&&A.progressPct)?A.progressPct(p):0; }
function plotIsWaterable(p){ const A=farmApi(); return !!(A&&A.isWaterable&&A.isWaterable(p)); }
function plotWindowMs(p){ const A=farmApi(); return (A&&A.waterWindowRemainingMs)?A.waterWindowRemainingMs(p):0; }
function plotReadyInMs(p){ const A=farmApi(); return (A&&A.readyInMs)?A.readyInMs(p):0; }
/* Ticking countdown for the watered window. h:mm:ss above an hour, m:ss below —
   the clock convention, so "1:59:04" and "12:30" both read unambiguously. */
function fmtClock(ms){
  const s=Math.max(0,Math.round(ms/1000));
  const h=Math.floor(s/3600), m=Math.floor(s%3600/60), sec=s%60;
  if(h>0)return h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  return m+':'+String(sec).padStart(2,'0');
}
/* "4h 38m" / "12m" for the projected ready time. Deliberately local: the
   fmtTime() further down the file lives inside another block's scope. */
function fmtSpan(ms){
  const mins=Math.max(1,Math.round(ms/60000));
  if(mins<60)return mins+'m';
  return Math.floor(mins/60)+'h '+(mins%60)+'m';
}
let farmInterval=null;
/* The set of ready-plot identities we have already toasted. Keyed by
   index+cropId+plantedAt so a single ready plot toasts ONCE even as the reconcile
   rebuilds it every envelope (Paione "turnip ready every 5s"), while a REPLANT
   (new plantedAt) still re-notifies. Pruned each tick to what is currently ready,
   so it stays bounded and a harvested-then-replanted plot re-toasts. */
let farmReadyNotified=new Set();
/* Extracted from the interval so the smoke suite can drive it deterministically
   (the every-5s toast bug cannot be reproduced by waiting on a real interval). */
function farmCheckTick(){
  let changed=false;
  const liveReady=new Set();
  /* blob-retire capstone: under arm G.farmPlots is rebuilt from the server
     envelope (accrue.reconcileFarm) and is undefined until the first envelope
     lands — an unguarded forEach would throw and kill the tick. Fail-closed to
     an empty set: no crops render until the projection arrives, never a crash. */
  (G.farmPlots||[]).forEach((p,i)=>{
    if(!p)return;
    const crop=CROPS[p.cropId];if(!crop)return;
    /* reconcileFarm now promotes a ready plot to state:'ready' on rebuild, so a
       ready plot may already carry the state — treat either as ready and let the
       notified-set (not the state flag) decide whether to toast, so the first
       legitimate toast still fires and the every-5s re-fire is gone. */
    const ready = p.state==='ready' || plotIsReady(p);
    if(!ready)return;
    const key=i+':'+p.cropId+':'+p.plantedAt;
    liveReady.add(key);
    if(p.state!=='ready'){G.farmPlots[i]={...p,state:'ready'};changed=true;}
    if(!farmReadyNotified.has(key)){
      farmReadyNotified.add(key);
      try{ if(typeof window!=='undefined') window.__farmReadyToasts=(window.__farmReadyToasts|0)+1; }catch(e){}
      notify(`${crop.name} ready!`,'loot');
    }
    /* b222: the derived `watered` mirror is GONE. b220 dual-wrote it purely
       so a rollback to b219 would read a sane value; b220 shipped, b221
       shipped, and a write-only field that no reader consumes is the exact
       shape of state that drifts and then gets trusted by accident. The one
       surviving reader is the legacy-save migration
       (HearthriseFarm.normalizePlot / save-migrations v6→v7), which converts
       `watered` INTO `waterings[]` and must stay — old saves still carry it.
       Nothing writes it any more; `waterings[]` is the only source. */
  });
  /* Drop notified keys whose plot is no longer ready/present (harvested/cleared)
     so the set stays bounded and a replant at the same index re-toasts. */
  farmReadyNotified.forEach(k=>{ if(!liveReady.has(k)) farmReadyNotified.delete(k); });
  if(changed&&activeTab==='farming')window.renderFarm();
  if(changed&&activeTab==='profile')renderProfile();
}
function startFarmCheck(){
  farmInterval=setInterval(farmCheckTick,5000);
  startFarmTicker();
}
if(typeof window!=='undefined'){
  window.__farmCheckTickForTest=farmCheckTick;
  window.__resetFarmReadyNotifiedForTest=function(){ farmReadyNotified=new Set(); try{ window.__farmReadyToasts=0; }catch(e){} };
}
/* b220: the watered window is a 2-hour countdown the player is meant to plan
   around, so it has to move. A full renderFarm() every second would rebuild
   the whole panel; this touches text nodes and one bar width instead, and only
   while the farm tab is actually on screen. It re-renders properly only when a
   plot crosses a state boundary (a window closing changes the buttons). */
let farmTicker=null, farmWaterableSeen=-1;
function startFarmTicker(){
  if(farmTicker)return;
  farmTicker=setInterval(()=>{
    if(activeTab!=='farming')return;
    const panel=document.getElementById('farm-panel');if(!panel)return;
    if(countWaterablePlots()!==farmWaterableSeen){window.renderFarm();return;}
    const A=farmApi();if(!A)return;
    panel.querySelectorAll('.farm-tile[data-plot]').forEach(el=>{
      const i=+el.getAttribute('data-plot');
      const p=(G.farmPlots||[])[i];
      if(!p||p.state==='ready')return;
      const lab=el.querySelector('.ft-lab'), sub=el.querySelector('.ft-sub'), bar=el.querySelector('.ft-bar i');
      if(bar)bar.style.width=plotPct(p)+'%';
      if(lab)lab.textContent=farmPlotLabel(p);
      if(sub)sub.textContent=farmPlotSub(p);
      el.classList.toggle('watered',plotWindowMs(p)>0);
    });
    const nx=panel.querySelector('#farm-next-water');
    if(nx)nx.textContent=farmNextWaterText();
  },1000);
}
/* b220: "Water all (4)" needs a count, and the farm header needs a
   come-back-in line. Both read the same predicate the tiles do. */
function countWaterablePlots(){
  let n=0;
  (G.farmPlots||[]).forEach(p=>{ if(p&&plotIsWaterable(p))n++; });
  return n;
}
function farmNextWaterText(){
  const growing=(G.farmPlots||[]).filter(p=>p&&p.state!=='ready'&&!plotIsReady(p));
  if(!growing.length)return 'No crops growing';
  const n=countWaterablePlots();
  if(n>0)return n+(n===1?' plot is thirsty':' plots are thirsty');
  let soonest=Infinity;
  growing.forEach(p=>{ const ms=plotWindowMs(p); if(ms>0&&ms<soonest)soonest=ms; });
  if(!isFinite(soonest))return 'No crops growing';
  return 'Next watering in '+fmtClock(soonest);
}
function farmPlotLabel(p){
  if(!p)return '';
  if(p.state==='ready'||plotIsReady(p))return 'Ready';
  const w=plotWindowMs(p);
  return plotPct(p)+'%'+(w>0?' · watered '+fmtClock(w):' · dry');
}
function farmPlotSub(p){
  if(!p||p.state==='ready'||plotIsReady(p))return '';
  const ms=plotReadyInMs(p);
  if(ms<=0)return 'Ready';
  return 'Ready in '+fmtSpan(ms)+farmPerennialSub(p);
}
/* b420: a perennial (tomato/emberfruit) is finite — surface how many regrows
   remain so the plant visibly DEPLETES instead of reading as an infinite bug. */
function farmPerennialSub(p){
  const crop=p&&CROPS[p.cropId];
  if(!crop||!crop.regrows||!crop.regrowLimit)return '';
  const left=Math.max(0,crop.regrowLimit-(p.regrowCount||0));
  return left>0?` · ${left} regrow${left===1?'':'s'} left`:' · final harvest';
}
/* b213 QA: the property tier's plot count is REAL now. The farm used to
   render 8 plantable plots no matter what, which made the homestead ladder's
   headline benefit (2 plots at camp → 12 at the castle) a fake perk. Plots
   beyond the cap render locked; already-growing crops in over-cap plots
   (pre-b213 saves) can still be watered + harvested — they just can't be
   replanted until the property grows into them. */
function farmPlotCap(){
  return (window.HearthriseHomestead && typeof window.HearthriseHomestead.maxPlots==='function')
    ? window.HearthriseHomestead.maxPlots() : 8;
}
/* ── SERVER-AUTHORITY FARM ROUTING (b435 RPCs) — THE ONLY PATH SINCE b454 ────
   Every farm gesture sends an INTENT to its hr_farm_* RPC and reconciles
   G.farmPlots / G.plotLevels from the RESPONSE (src/net/farm-sync.js). Crop
   PRODUCE, XP, the seed debit and the deed spend are SERVER-owned:
   reconcileFarmResult applies the server's own numbers ONCE and the client never
   rolls a yield, never calls addXp('farming', ...) and never debits a seed.

   b514 (cleanup slice 4) DELETED the client-authoring fall-through that used to
   sit under `if(farmSyncArmed())` in plantCrop / waterPlot / waterAllPlots /
   harvestPlot. It had been unreachable since the 2026-08-22 cutover armed
   FARM_SERVER_ARM_ENABLED, and an unreachable twin of the farm's whole ruleset is
   exactly the forgeable surface the cutover closed — plus a standing invitation
   to "fix" the farm in the copy nobody runs.

   THE MISSING-MODULE POSITION IS FAIL-CLOSED, NOT FALL-THROUGH. If
   src/net/farm-sync.js is absent the gesture is REFUSED with a sentence; the
   client does not author the outcome instead. `farmSyncApi()` is that one check,
   stated once. */
function farmSyncApi(){
  const FS=window.HearthriseFarmSync;
  if(FS&&typeof FS.farmPlant==='function') return FS;
  notify('The farm is offline for a moment — try again','kill');
  return null;
}
/* The reconcile deps: the server already credited its own row, so these keep the
   CLIENT CACHE in step with it (applied once from the response, never a second
   locally-computed amount). */
const FARM_SYNC_DEPS={
  addItem:function(id,q){ if(typeof addItem==='function') addItem(id,q); },
  removeItem:function(id,q){ if(typeof removeItem==='function') removeItem(id,q); },
  addXp:function(sk,x){ if(typeof addXp==='function') addXp(sk,x); },
};
/* WHAT THE *SERVER* SAYS WE HOLD — the only count a GATE may read (`G.inventory` is a display bag no envelope can lower). Rule + evidence: accrue.js gateItemCount. */
function heldByServer(id){ const A=window.HearthriseAccrual; return (A&&typeof A.gateItemCount==='function')?A.gateItemCount(G,id):((G.inventory&&Number(G.inventory[id]))||0); } window.heldByServer=heldByServer;
function farmSyncReconcile(kind,res){
  try{ window.HearthriseFarmSync.reconcileFarmResult(G,kind,res,FARM_SYNC_DEPS); }catch(e){}
}
/* Optimistic prediction is PLOT-STATE ONLY (responsiveness); inventory/XP arrive
   with the server's number, so a refused gesture leaves no phantom crop, and a
   refusal reverts the optimistic plot. Every hr_farm_plant refusal is SAID by its
   reason with the action that clears it — the sentence is farm-sync.js's
   (farmPlantRefusalText, pure + tested) and this supplies only the display names
   the net layer must not invent. Before 2026-09-06 every code collapsed into
   "Could not plant — try again" and 'transport' said NOTHING, which is how a
   fleet-wide tier deadlock read as "you plant something and it doesn't stay". */
function farmPlantRefusal(res,cropId){
  const crop=CROPS[cropId];
  const seedId=crop&&crop.seed;
  const FS=window.HearthriseFarmSync;
  const ctx={
    cropName:(crop&&crop.name)||cropId,
    seedName:(typeof ITEMS!=='undefined'&&seedId&&ITEMS[seedId]&&ITEMS[seedId].n)||((crop&&crop.name)||cropId)+' Seed',
    haveLevel:(typeof getLevel==='function')?getLevel('farming'):null,
  };
  if(FS&&typeof FS.farmPlantRefusalText==='function') return FS.farmPlantRefusalText(res||{},ctx);
  return 'Could not plant — please report this';
}
function farmSyncPlant(plotIdx,cropId){
  const FS=farmSyncApi(); if(!FS) return;
  const prev=G.farmPlots[plotIdx];
  G.farmPlots[plotIdx]={cropId,plantedAt:Date.now(),waterings:[],state:'growing'};
  window.renderFarm();
  FS.farmPlant(plotIdx,cropId).then(function(res){
    if(res&&res.ok){ farmSyncReconcile('plant',res); }
    else {
      G.farmPlots[plotIdx]=prev||null;
      /* A plot_tier_locked refusal CARRIES the server's own plot_level. Learn
         from it: the client gate is wrong by definition if it let this call
         through, and this is the one place the true tier is available without
         waiting for the next envelope. */
      if(res&&res.error==='plot_tier_locked'){
        const have=Number(res.have_plot_level);
        if(Number.isFinite(have)&&have>=1){ G._serverPlotLevel=Math.floor(have); G.plotLevels=Math.floor(have); }
      }
      notify(farmPlantRefusal(res,cropId),'kill');
    }
    window.renderFarm();updateTopbar();
  });
}
function farmSyncWater(plotIdx){
  const FS=farmSyncApi(); if(!FS) return;
  FS.farmWater(plotIdx).then(function(res){
    if(res&&res.ok){ farmSyncReconcile('water',res); }
    window.renderFarm();
  });
}
function farmSyncHarvest(plotIdx){
  const FS=farmSyncApi(); if(!FS) return;
  FS.farmHarvest(plotIdx).then(function(res){
    if(res&&res.ok){
      farmSyncReconcile('harvest',res);
      if(res.produce&&res.qty>0){ const crop=CROPS[res.crop]; notify(`+${res.qty} ${crop?crop.name:res.crop}`,'loot'); }
      /* AWAY-1 parity: one hook, one plant intent — and the hook is handed THIS
         G (the object reconcileFarmResult just wrote) so the replant can never
         be decided from a different state than the harvest landed in. */
      if(!G.farmPlots[plotIdx] && window.HearthriseAuto && typeof window.HearthriseAuto.maybeReplant==='function'){
        window.HearthriseAuto.maybeReplant(plotIdx, G);
      }
    }
    window.renderFarm();updateTopbar();
  });
}
function plantCrop(plotIdx,cropId){
  const crop=CROPS[cropId];if(!crop)return;
  if(plotIdx>=farmPlotCap() && !G.farmPlots[plotIdx]){
    notify('Plot locked — upgrade your property to farm more land','kill');return;
  }
  const seedId=crop.seed;
  /* b465: "No seeds!" named no seed and no way forward. Name it (from the crop row,
     never a literal), say where to buy it, count it the way hr_farm_plant will. */
  if(heldByServer(seedId)<1){
    var _sn=(typeof ITEMS!=='undefined'&&ITEMS[seedId]&&ITEMS[seedId].n)||crop.name+' Seed';
    notify('You have no '+_sn+' — the Local Shop sells them','kill');return;
  }
  if(getLevel('farming')<crop.req){notify(`Farming Lv ${crop.req} required`,'kill');return;}
  // b136: Plot-level gate. canPlantCrop returns true if cropId is in
  // the unlocked set for the player's current Farm Plot tier. The
  // engine is in src/features/farm-progression.js. Defensive fallback:
  // if HearthriseFarm hasn't loaded yet (script-order race), allow
  // turnip-only — the b133 migration sets G.plotLevels=1 so this is
  // safe. Anything else falls through to the plot-level error.
  if(window.HearthriseFarm && typeof window.HearthriseFarm.canPlantCrop === 'function'){
    if(!window.HearthriseFarm.canPlantCrop(cropId)){
      /* b136 said "Lv ${lv+1}+" — the player's NEXT level, which is only ever
         right for a crop exactly one tier away and lied about every other one.
         Say the crop's OWN requirement (requiredPlotLevel) and the tier the
         SERVER has recorded, so the sentence matches what hr_farm_plant would
         have answered. */
      const lv = window.HearthriseFarm.getPlotLevel();
      const need = (typeof window.HearthriseFarm.requiredPlotLevel==='function')
        ? window.HearthriseFarm.requiredPlotLevel(cropId) : 0;
      notify(need
        ? `${crop.name} needs Farm Plot Lv ${need} — upgrade in House → Plot (you have Lv ${lv})`
        : `${crop.name} can't be planted yet — no plot tier unlocks it`,'kill');
      return;
    }
  } else if(cropId !== 'turnip'){
    notify('Crop locked — upgrade Farm Plot in House → Plot','kill');
    return;
  }
  /* Server-authority routing: the server owns the seed debit, the plant XP and
     the plot timestamps. Every check above is a PRE-FLIGHT for the copy — the
     decision, and every number, is hr_farm_plant's. */
  farmSyncPlant(plotIdx,cropId);
}
/* b220: watering opens a 2h double-speed window. It is rejected while a window
   is already open — that single rule is both the anti-abuse mechanism and the
   affordance ("this plot is thirsty again"). One tap, no confirm, no modal.
   b514: the rule is ENFORCED BY hr_farm_water. `plotIsWaterable` survives as the
   client-side eligibility READ — it decides which tiles "Water all" bothers the
   server about, and it supplies the refusal sentence. The local `applyWatering`
   WRITER (waterings.push + addXp) is deleted: it authored a watering window the
   server never recorded, which is b462 in miniature. */
function waterPlot(i){
  const p=(G.farmPlots||[])[i];if(!p)return;
  /* A tile the player taps while it is already ready should harvest, not
     scold — the 5s tick may not have flipped `state` yet. */
  if(p.state==='ready'||plotIsReady(p)){
    if(p.state!=='ready')G.farmPlots[i]={...p,state:'ready'};
    window.harvestPlot(i);return;
  }
  /* The server owns the watering window and the water XP. The client still says
     the "already watered" sentence itself: it is the side that knows what the
     player is looking at, and hr_farm_water would answer the same. */
  if(!plotIsWaterable(p)){
    notify(`Still watered — thirsty again in ${fmtClock(plotWindowMs(p))}`,'kill');
    return;
  }
  farmSyncWater(i);
}
/* b220: header action — one tap tucks the whole farm in before bed. */
window.waterAllPlots=function waterAllPlots(){
  if(!G.farmPlots)return 0;
  let n=0;
  /* b462 — "Water all" went around the server. waterPlot() routes a single tile
     through hr_farm_water under the farm arm, but this header action still
     called applyWatering() locally for every plot, so the next envelope (server
     truth: never watered) dried them all again — Tyler, beta morning: "i water
     plants, they go back to being dry". Same eligibility test, server verb. */
  for(let i=0;i<G.farmPlots.length;i++){
    const p=G.farmPlots[i];
    if(p&&plotIsWaterable(p)){ farmSyncWater(i); n++; }
  }
  notify(n?`Watering ${n} plot${n===1?'':'s'}…`:'Nothing to water right now',n?'loot':'kill');
  return n;
};
/* b228 (bonus-rebase.md §5.3) — STOP FLOORING A FLAT BONUS.
   `farmYield` is a count of extra crops, and harvestPlot used to spend it as
   Math.floor(). Every fractional grant therefore paid EXACTLY ZERO: the
   Scarecrow (+0.1), the Bunny (+0.10), the Squirrel (+0.15), Carrot Stew
   (+0.15) and Roasted Pumpkin (+0.05) — five purchased perks that have paid
   nothing since the day they shipped, and nothing on any screen said so.

   The whole part is paid always; the fraction is paid as its own probability,
   so the EXPECTED yield is exactly the bonus. That is what makes small flat
   numbers work at all, which is the same smallness problem the rebase is
   solving everywhere else, wearing a different costume.
   `_rand01` is injectable so the suite can assert both sides of the coin
   without flaking on a random draw. */
function rollFlatBonus(v,_rand01){
  const n=Number(v)||0;
  if(n<=0) return 0;
  const whole=Math.floor(n), frac=n-whole;
  const r=(typeof _rand01==='function')?_rand01():Math.random();
  return whole+((frac>0 && r<frac)?1:0);
}
window.rollFlatBonus=rollFlatBonus;
function harvestPlot(i){
  const p=G.farmPlots[i];if(!p||p.state!=='ready')return;
  /* Server-authority routing: the server owns the seeded yield roll, the
     farmYield perk, the finite-perennial wither and the harvest goal counters.
     The client sends the intent and renders the returned plot state + the
     server-credited produce/XP ONCE — no local roll, no double credit.
     b514: the local roll (rand(crop.yield) + rollFlatBonus + addXp + the regrow
     ladder) is DELETED. farmSyncHarvest reconciles from the response and fires
     the auto-replant hook when the SERVER clears the plot. */
  farmSyncHarvest(i);
}
/* ────────────────────────────────────────────────
   RENDER — Farming
   ──────────────────────────────────────────────── */
function renderFarm(){
  const el=document.getElementById('farm-panel');if(!el)return;
  /* b213: show every unlocked plot, plus any over-cap plots that still hold
     a growing crop (pre-b213 saves) so nothing a player planted disappears. */
  const plotCount=Math.max(farmPlotCap(),(G.farmPlots||[]).length);
  // b136: plot-level header + plant-all + auto-replant toggle.
  // The HearthriseFarm API drives all gating; we show a status strip
  // so the player understands what's unlocked and where to upgrade.
  const plotLv = (window.HearthriseFarm && window.HearthriseFarm.getPlotLevel) ? window.HearthriseFarm.getPlotLevel() : 1;
  const plotMax = (window.HearthriseFarm && window.HearthriseFarm.MAX_LEVEL) || 5;
  const deeds = (window.HearthriseFarm && window.HearthriseFarm.getDeedCount) ? window.HearthriseFarm.getDeedCount() : 0;
  const replant = (window.HearthriseAuto && window.HearthriseAuto.getFarmReplant) ? window.HearthriseAuto.getFarmReplant() : {enabled:false,cropId:null};
  const replantLabel = replant.enabled ? (replant.cropId ? CROPS[replant.cropId]?.name || replant.cropId : 'last crop') : 'off';
  /* b220: "Water all" sits beside "Plant all", labelled with the count, and the
     status line carries the come-back-in timer — the only thing on this screen
     that tells a farmer when watering is worth a login. */
  const waterable = countWaterablePlots();
  farmWaterableSeen = waterable;
  /* The SAME answer plantAllEmpty acts on, so the button cannot offer a sweep
     the sweep will refuse (the silent "Plant all", live 2026-09-13). */
  const plantable = window.HearthriseCore.farm.emptyPlotIndices(G.farmPlots, farmPlotCap()).length;
  const header = `
    <div class="farm-status row between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <div class="tiny muted">
        Farm Plot <b>Lv ${plotLv}/${plotMax}</b>
        · ${deeds} Deed${deeds===1?'':'s'}
        · Auto-replant: <b>${replantLabel}</b>
        <br><span id="farm-next-water">${farmNextWaterText()}</span> · crops grow even while you're away
      </div>
      <div class="row gap-sm">
        <button class="btn btn-sm" onclick="window.plantAllEmpty()" ${plantable?'':'disabled'} title="${plantable?'Plant configured/best seed in every empty plot':'Every plot is already planted'}">${plantable?`Plant all (${plantable})`:'Plant all'}</button>
        <button class="btn btn-sm" onclick="window.waterAllPlots()" ${waterable?'':'disabled'} title="${waterable?'Watering doubles growth speed for 2 hours':farmNextWaterText()}">${waterable?`Water all (${waterable})`:'Water all'}</button>
        <button class="btn btn-sm" onclick="window.toggleAutoReplant()" title="Auto-replant after harvest">${replant.enabled?'Auto-replant: on':'Auto-replant: off'}</button>
        <button class="btn btn-sm" onclick="showTab('house');if(typeof setHouseTab==='function')setHouseTab('plot')" title="Buy the next plot tier with gold (or a Farmer's Deed) in House → Plot">Upgrade Plot</button>
      </div>
    </div>`;
  el.innerHTML = header + `<div class="farm-mini" style="grid-template-columns:repeat(4,1fr)">
    ${Array.from({length:plotCount}).map((_,i)=>{
      /* blob-retire capstone: guard an undefined farm (armed, pre-first-envelope)
         so the farm panel renders empty plots instead of throwing. */
      const p=(G.farmPlots||[])[i];
      /* b217: an empty plot rendered as a dashed-border rectangle holding a
         "＋" and the word "Empty". At the farm's grid size that is a 430x420
         void per plot — a third of the screen given to two dashed boxes, which
         is the single most prototype-looking element in the build. A plot is
         TILLED GROUND: it gets soil (see .farm-tile.empty in art-direction),
         a furrow pattern, and a plant affordance that reads as an action. */
      if(!p && i>=farmPlotCap())return `<div class="farm-tile empty locked" onclick="showTab('house')" title="Upgrade your property to unlock this plot"><span class="ft-lock">${lockGlyph()}</span><small>Locked</small></div>`;
      if(!p)return `<div class="farm-tile empty" onclick="openSeedPicker(${i})"><span class="ft-plant">Plant</span><small>Empty plot</small></div>`;
      const crop=CROPS[p.cropId];
      /* b220: a growing plot must ALWAYS look like it is growing. The old
         label printed "Tap to water" and NO bar for a dry plot, which is why
         a permanently stalled auto-replanted crop was invisible to the player.
         Every growing plot now shows its percentage, a moving bar, and the
         projected ready time — dry or watered. */
      const ready=p.state==='ready'||plotIsReady(p);
      const pct=ready?100:plotPct(p);
      const wet=!ready&&plotWindowMs(p)>0;
      const action=ready?`harvestPlot(${i})`:`waterPlot(${i})`;
      const title=ready?'Harvest':(wet?'Watered — growing at double speed':'Water this plot: double growth for 2 hours');
      return `<div class="farm-tile ${ready?'ready':''} ${wet?'watered':''}" data-plot="${i}" onclick="${action}" title="${title}"><span class="ft-crop">${itemArt(crop.prod, 44)}</span><small class="ft-lab">${farmPlotLabel(p)}</small>${ready?'':`<span class="ft-bar"><i style="width:${pct}%"></i></span><small class="ft-sub">${farmPlotSub(p)}</small>`}</div>`;
    }).join('')}
  </div>`;

  const cg=document.getElementById('crops-guide');
  // b136: crops guide now shows BOTH skill-level and plot-level gates.
  // A crop is "Unlocked" only if both pass. Locked-by-plot crops get
  // a deep-link to House → Plot tab.
  const canPlot = (id)=>{
    if(window.HearthriseFarm && typeof window.HearthriseFarm.canPlantCrop === 'function')
      return window.HearthriseFarm.canPlantCrop(id);
    return id === 'turnip';
  };
  cg.innerHTML=Object.entries(CROPS).map(([id,c])=>{
    const lv=getLevel('farming');const lvOk=lv>=c.req;const plotOk=canPlot(id);
    let badge;
    /* b217: an "Unlocked" tag on every available crop is noise — available is
       the default state and does not need a label. Only the GATE is news. */
    if(lvOk && plotOk) badge = '';
    else if(!lvOk) badge = `<span class="mr-lock">${lockGlyph()}Level ${c.req}</span>`;
    else badge = `<span class="mr-lock" style="cursor:pointer" onclick="showTab('house');if(typeof setHouseTab==='function')setHouseTab('plot')" title="Upgrade Farm Plot in House → Plot">${lockGlyph()}Bigger plot</span>`;
    const peren = c.regrows ? ` · <b>perennial</b> (regrows ×${c.regrowLimit||'∞'})` : '';
    return `<div class="shop-row"><span class="si">${itemArt(c.prod)}</span><div class="info"><b>${c.name}</b><span>Lv ${c.req} · ${c.hours}h grow · ${c.yield[0]}-${c.yield[1]} yield${peren}</span></div>${badge}</div>`;
  }).join('');
}

/* Plant all empty plots. The RULE (which crop next, from a REMAINING seed budget
   rather than the bag — the seed debit is the server's and arrives with the
   response) and the LIST (empty plots inside the property cap) are both
   src/core/farm.js, and the header's button label reads the same two answers, so
   it can no longer offer a sweep that places nothing and says nothing (live
   2026-09-13, twice, with seeds in the bag). Every exit says what happened. */
window.plantAllEmpty = function plantAllEmpty(){
  const CF = window.HearthriseCore.farm, cap = farmPlotCap();
  const empties = CF.emptyPlotIndices(G.farmPlots, cap);
  if(!empties.length){
    notify(cap > 0 ? 'Every plot already has something growing'
      : 'Your homestead has no farmland yet — upgrade your property in House → Property','kill');
    return 0;
  }
  const replant = (window.HearthriseAuto && window.HearthriseAuto.getFarmReplant) ? window.HearthriseAuto.getFarmReplant() : null;
  const seeds = {};
  /* The budget is the SERVER's count: a sweep against display-bag seeds spends every plot on a refusal. */
  Object.values(CROPS).forEach(c=>{ seeds[c.seed] = heldByServer(c.seed); });
  const st = { crops:CROPS, seeds, farmingLevel:getLevel('farming'),
    plotLevel:(window.HearthriseFarm&&window.HearthriseFarm.getPlotLevel)?window.HearthriseFarm.getPlotLevel():1,
    prefer:(replant&&replant.enabled)?replant.cropId:null };
  let planted = 0, outOfSeeds = false;
  for(const i of empties){
    const pick = CF.pickSeedToPlant(st);
    if(!pick){ outOfSeeds = true; break; }
    plantCrop(i, pick);
    /* A refused gesture said its own reason — stop rather than fire the same
       refusal at every remaining plot. */
    if(!G.farmPlots || !G.farmPlots[i]) break;
    planted++; seeds[CROPS[pick].seed] -= 1;
  }
  if(planted > 0){
    notify(`Planted ${planted} plot${planted===1?'':'s'}`
      + ((outOfSeeds && planted < empties.length) ? ' — out of seeds for the rest' : ''), 'loot');
  } else if(outOfSeeds){
    notify('No plantable seeds for your plots — the Local Shop sells them','kill');
  }
  return planted;
};
window.toggleAutoReplant = function toggleAutoReplant(){
  if(!window.HearthriseAuto || !window.HearthriseAuto.getFarmReplant) return;
  const cur = window.HearthriseAuto.getFarmReplant();
  if(cur.enabled){
    window.HearthriseAuto.setFarmReplant({enabled:false});
    notify('Auto-replant: off', 'info');
  } else {
    // Default cropId to whichever crop is currently most-planted, falling
    // back to turnip. Picking sensibly here saves a click.
    let pick = null;
    const counts = {};
    (G.farmPlots||[]).forEach(p=>{ if(p && p.cropId) counts[p.cropId] = (counts[p.cropId]||0) + 1; });
    let best = -1;
    Object.entries(counts).forEach(([id,n])=>{ if(n > best){ best = n; pick = id; } });
    if(!pick) pick = 'turnip';
    window.HearthriseAuto.setFarmReplant({enabled:true, cropId:pick});
    notify(`Auto-replant: on (${CROPS[pick]?.name||pick})`, 'levelup');
  }
  if(activeTab==='farming') window.renderFarm();
};
let pendingPlot=null;
function openSeedPicker(i){
  pendingPlot=i;
  /* b136: seeds split into plantable (seeds + farming level + plot tier) and
     locked-by-tier (shown with a House deep-link); anything short of seeds or farming
     level stays hidden. The count is the SERVER's — the picker used to offer the
     start kit on a character whose rows were long spent. */
  const haveSeed = (c)=> heldByServer(c.seed) > 0 && getLevel('farming') >= c.req;
  const canPlant = (id)=> {
    if(window.HearthriseFarm && typeof window.HearthriseFarm.canPlantCrop === 'function'){
      return window.HearthriseFarm.canPlantCrop(id);
    }
    return id === 'turnip';
  };
  const allOwned = Object.entries(CROPS).filter(([,c])=>haveSeed(c));
  const plantable = allOwned.filter(([id])=>canPlant(id));
  const lockedByPlot = allOwned.filter(([id])=>!canPlant(id));
  if(!plantable.length && !lockedByPlot.length){notify('No usable seeds. Visit the shop.','kill');return;}
  const m=document.getElementById('settings-modal');
  const plantBtn = ([id,c])=>`<button class="shop-row" style="width:100%;cursor:pointer" onclick="plantCrop(${i},'${id}');document.getElementById('settings-modal').classList.remove('show')"><span class="si">${itemArt(c.prod)}</span><div class="info"><b>${c.name}</b><span>${c.hours}h · ${c.yield[0]}-${c.yield[1]} yield${c.regrows?` · perennial (regrows ×${c.regrowLimit||'∞'})`:''}</span></div><span class="price">x${heldByServer(c.seed)}</span></button>`;
  /* A locked row NAMES the tier it needs (and the one you have) — "upgrade the
     Farm Plot" alone never told the player how far away the crop was. */
  const needLv = (id)=> (window.HearthriseFarm && typeof window.HearthriseFarm.requiredPlotLevel==='function')
    ? window.HearthriseFarm.requiredPlotLevel(id) : 0;
  const havePlotLv = (window.HearthriseFarm && window.HearthriseFarm.getPlotLevel) ? window.HearthriseFarm.getPlotLevel() : 1;
  const lockedBtn = ([id,c])=>`<button class="shop-row" style="width:100%;cursor:pointer;opacity:.6" onclick="document.getElementById('settings-modal').classList.remove('show');showTab('house');if(typeof setHouseTab==='function')setHouseTab('plot')" title="Locked — upgrade Farm Plot to unlock"><span class="si">${itemArt(c.prod)}</span><div class="info"><b>${c.name}</b><span>${needLv(id)?`Needs Farm Plot Lv ${needLv(id)} (you have Lv ${havePlotLv}) — House → Plot`:'No plot tier unlocks this crop'}</span></div><span class="muted tiny">x${heldByServer(c.seed)}</span></button>`;
  /* The picker borrows the settings modal, whose heading is the static word
     "Settings" — so the dialog asking which seed to plant was titled SETTINGS
     (live 2026-09-13). Every opener of the shared shell states its own title. */
  m.querySelector('.modal-title').textContent='Pick a seed';
  let html = `<h3 style="margin-bottom:10px">Pick a seed</h3>`;
  if(plantable.length) html += plantable.map(plantBtn).join('');
  if(lockedByPlot.length) html += `<div class="tiny muted" style="margin:10px 0 6px">${lockGlyph()} Locked by Farm Plot tier</div>` + lockedByPlot.map(lockedBtn).join('');
  document.getElementById('settings-body').innerHTML = html;
  m.classList.add('show');
}

/* ── PUBLISHED (these were window properties by virtue of being classic-script
      top-level function declarations; inside an IIFE they must be said out
      loud). One line per proven external caller:
        renderFarm        legacy.js showTab + paintAll, error-boundary.js,
                          features/farm-progression.js, the smoke suite
        openSeedPicker    inline onclick in the plot grid + farm-progression.js
        plantCrop         features/auto-actions.js (auto-replant), the smoke
                          suite, and inline onclick in the seed picker
        waterPlot         inline onclick in the plot grid + the smoke suite
        harvestPlot       inline onclick, features/companions.js (which wraps
                          it), features/world-events.js, the smoke suite
        farmPlotCap       legacy.js daily-goal factory, src/core/goals.js,
                          src/net/gold-sites.js, the smoke suite
        startFarmCheck    legacy.js boot
        plotIsReady       legacy.js Homestead farm tiles (~7785)
        plotPct           legacy.js Homestead farm tiles (~7785)
        plotWindowMs      legacy.js Homestead farm tiles (~7785)
      heldByServer, rollFlatBonus, waterAllPlots, plantAllEmpty and
      toggleAutoReplant publish themselves above, on the same lines they always
      did. Everything else in this file is now module-private. ── */
window.renderFarm     = renderFarm;
window.openSeedPicker = openSeedPicker;
window.plantCrop      = plantCrop;
window.waterPlot      = waterPlot;
window.harvestPlot    = harvestPlot;
window.farmPlotCap    = farmPlotCap;
window.startFarmCheck = startFarmCheck;
window.plotIsReady    = plotIsReady;
window.plotPct        = plotPct;
window.plotWindowMs   = plotWindowMs;

console.log('Farm screen: loaded');
})();
