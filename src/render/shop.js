// ============================================================
// src/render/shop.js — the Shop / IAP store controller (render layer)
//
// NINTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, task #129 Phase 3.5). See
// docs/design/render-extraction-pattern.md for the playbook.
//
// WHAT THIS IS: window.renderShop — the controller that paints BOTH halves of
// the Shop screen: the always-visible IAP store (#iap-panel) and the in-game
// Local Shop counter (#shop-panel, the tabbed Seeds / Equipment / Cosmetics
// wares + trait upgrades + vendor buy-back, drawn onto the SHOP_SCENE). It
// READS IAP_CATALOG / G / window.HR / window.shopTab / SEED_SHOP / EQUIP_SHOP /
// TRAITS / ITEMS / SKILLS_DEF and the gear-gate pair gearWieldReq / canWield,
// and writes NO authoritative state — every purchase/redeem/buyback action is
// an inline onclick that stays a GLOBAL handler in legacy.js (buyShopItem,
// buyCosmetic, buyTrait, redeemHearthToken, openBuyback, IAP.buy). This module
// only PAINTS and delegates.
//
// Its three exclusive private helpers move with it: _iapGlyph (store-card art),
// _iapContents (what an IAP grants, with currency glyphs), and SHOP_SCENE (the
// drawn shopfront SVG — already fully tokenised: every colour is a --sc-* /
// --scene-* var, so there was nothing to convert). None of the three is
// referenced anywhere else in the tree.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js (window.renderShop + neighbours) — moved out, not redesigned. NO
// hardcoded theme colours in this JS.
//
// COUPLING RESOLVED: the shop's active-tab state was a legacy-local `let
// shopTab` mutated by setShopTab() (which stays global in legacy.js). It is now
// window.shopTab (promoted in legacy.js in the same change) so this module and
// the handler share one identity. Globals are read via window.* at CALL time,
// so this script may load in any order after legacy.js. Only renderShop is
// re-exported onto window, under its exact existing name, so ZERO call sites
// change (legacy.js dispatch, setShopTab, error-boundary, smoke-test).
// ============================================================
(function () {
  'use strict';

  /* b217: store-card art. Falls back to a plain gilt disc rather than an emoji —
     a missing icon should look deliberate, not like a different design system
     leaked in. */
  function _iapGlyph(p){
    var g = (window.HR && window.HR.icon) ? window.HR.icon(p.glyph, 34, 'currentColor') : null;
    return g || '';
  }
  /* b221 — THE SHOP IS A SHOP.
     The in-game shop was a flat list of rows: item, name, price, Buy. It is now a
     place — a lit shopfront with a keeper behind a counter, and the offers laid
     out ON that counter. The scene is drawn, not photographed: no painted
     shopkeeper plate exists in `assets/icons-bundle/` (see the Asset Director
     brief in the art-director log), so the figure is a rim-lit silhouette in the
     same craft as the Home hearth band — a person standing in a warm room, not a
     cardboard cutout.

     Every colour is a --sc-* / --scene-* token (see src/styles/board-and-shop.css)
     so the scene follows the theme instead of baking hex into the monolith. */
  var SHOP_SCENE=`<div class="sc-scene">
  <svg class="sc-svg" viewBox="0 0 1600 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="scWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--sc-wall-0)"/><stop offset="1" stop-color="var(--sc-wall-1)"/>
      </linearGradient>
      <radialGradient id="scLamp" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="var(--scene-glow-1)"/>
        <stop offset="48%" stop-color="var(--scene-glow-2)"/>
        <stop offset="100%" stop-color="var(--scene-glow-0)"/>
      </radialGradient>
      <linearGradient id="scWin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--sc-window)"/><stop offset="1" stop-color="var(--sc-window-2)"/>
      </linearGradient>
      <linearGradient id="scTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--sc-counter-far)"/><stop offset="1" stop-color="var(--sc-counter-near)"/>
      </linearGradient>
      <linearGradient id="scVig" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="var(--sc-vig)"/><stop offset="24%" stop-color="var(--sc-vig-0)"/>
        <stop offset="72%" stop-color="var(--sc-vig-0)"/><stop offset="100%" stop-color="var(--sc-vig)"/>
      </linearGradient>
    </defs>

    <rect width="1600" height="200" fill="url(#scWall)"/>
    <!-- vertical wall boards, so the back of the room is built of something -->
    <g stroke="var(--sc-wall-seam)" stroke-width="2">
      <path d="M180 0v168M356 0v168M620 0v168M1060 0v168M1236 0v168M1412 0v168"/>
    </g>
    <!-- one light source: the lantern. Everything is lit from it or is not lit. -->
    <ellipse cx="430" cy="62" rx="560" ry="250" fill="url(#scLamp)"/>

    <!-- back wall: timber frame, and a shuttered window holding the last of dusk -->
    <g fill="var(--sc-timber)">
      <rect x="0" y="0" width="1600" height="17"/>
      <rect x="96" y="17" width="16" height="148"/>
      <rect x="826" y="17" width="14" height="148"/>
      <rect x="1004" y="17" width="14" height="148"/>
      <rect x="1520" y="17" width="16" height="148"/>
    </g>
    <rect x="874" y="40" width="96" height="76" fill="url(#scWin)"/>
    <g fill="var(--sc-timber-2)">
      <rect x="868" y="34" width="108" height="8"/><rect x="868" y="112" width="108" height="8"/>
      <rect x="918" y="40" width="7" height="76"/><rect x="868" y="74" width="108" height="5"/>
    </g>

    <!-- shelves of stock, left of the keeper and along the right wall -->
    <g fill="var(--sc-shelf)">
      <rect x="130" y="74" width="220" height="8"/>
      <rect x="130" y="132" width="220" height="8"/>
      <rect x="1040" y="68" width="446" height="8"/>
      <rect x="1040" y="128" width="446" height="8"/>
    </g>
    <g fill="var(--sc-prop)">
      <rect x="146" y="52" width="20" height="22" rx="4"/>
      <rect x="174" y="44" width="16" height="30" rx="4"/>
      <path d="M200 74c0-15 6-21 11-21s11 6 11 21z"/><rect x="208" y="38" width="5" height="12"/>
      <rect x="234" y="50" width="22" height="24" rx="4"/>
      <path d="M268 74c-4-17 3-28 13-28s17 11 13 28z"/>
      <rect x="306" y="48" width="18" height="26" rx="4"/>
      <path d="M138 132c-5-20 4-32 15-32s20 12 15 32z"/>
      <rect x="186" y="104" width="34" height="28" rx="2"/>
      <ellipse cx="256" cy="119" rx="24" ry="13"/>
      <rect x="300" y="106" width="30" height="26" rx="2"/>
      <rect x="1058" y="46" width="17" height="22" rx="3"/>
      <rect x="1083" y="38" width="14" height="30" rx="3"/>
      <path d="M1110 68c0-16 6-22 11-22s11 6 11 22z"/><rect x="1118" y="32" width="5" height="12"/>
      <rect x="1148" y="44" width="21" height="24" rx="4"/>
      <path d="M1184 68c-4-18 3-29 13-29s17 11 13 29z"/>
      <rect x="1226" y="40" width="17" height="28" rx="3"/>
      <rect x="1256" y="50" width="14" height="18" rx="3"/>
      <path d="M1286 68c0-19 8-26 14-26s14 7 14 26z"/>
      <rect x="1330" y="42" width="20" height="26" rx="3"/>
      <ellipse cx="1380" cy="57" rx="18" ry="11"/>
      <rect x="1410" y="46" width="16" height="22" rx="3"/>
      <path d="M1442 68c-4-16 3-26 12-26s16 10 12 26z"/>
      <path d="M1062 128c-5-20 4-32 15-32s20 12 15 32z"/>
      <rect x="1112" y="100" width="34" height="28" rx="2"/>
      <path d="M1166 128c0-22 9-30 16-30s16 8 16 30z"/>
      <rect x="1220" y="104" width="28" height="24" rx="2"/>
      <ellipse cx="1290" cy="115" rx="24" ry="13"/>
      <rect x="1336" y="102" width="32" height="26" rx="2"/>
      <path d="M1390 128c-5-21 4-33 16-33s21 12 16 33z"/>
      <rect x="1442" y="106" width="26" height="22" rx="2"/>
    </g>
    <!-- strung herbs hanging over the counter -->
    <g stroke="var(--sc-prop)" stroke-width="3" fill="none">
      <path d="M636 26q118 24 236 0"/>
      <path d="M676 32l-9 26M716 39l-5 28M756 41l4 28M796 38l8 26M836 30l10 24"/>
    </g>
    <!-- the lantern, hung from the top beam, burning -->
    <g>
      <path d="M394 17v15" stroke="var(--sc-iron)" stroke-width="4" fill="none"/>
      <path d="M379 36h30l-4-6h-22z" fill="var(--sc-iron)"/>
      <path d="M377 41h34l6 44h-46z" fill="var(--sc-iron)"/>
      <path d="M384 45h20l4 36h-28z" fill="var(--sc-lit)"/>
      <path d="M394 54c4 6 6 10 6 14s-2.6 7-6 7-6-3-6-7 2-8 6-14z" fill="var(--sc-flame)"/>
      <path d="M371 88h46l-4 7h-38z" fill="var(--sc-iron)"/>
    </g>

    <!-- THE KEEPER.
         Drawn as a contour, not an assembly of circles: crown, brow, cheek,
         jaw, neck, the slope of a shoulder, a taper at the waist. The rim is an
         OPEN stroke along the lantern-facing edge only — the earlier version
         used an offset copy of the whole silhouette, which reads as a sticker
         outline rather than as light falling on one side of a person. -->
    <g>
      <path class="sc-figure" d="M520 30c-14 0-24 11-24 26 0 12 5 22 12 27l-1 10c-16 5-30 12-37 22-7 11-9 28-8 50h114c1-22-1-39-8-50-7-10-20-17-36-22l-1-10c7-5 12-15 12-27 0-15-9-26-23-26z"/>
      <!-- coif over the crown, tied at the nape -->
      <path class="sc-figure2" d="M520 30c14 0 23 11 23 26 0 3 0 5-1 8-2-13-10-22-22-22-13 0-21 8-23 22-1-3-1-5-1-8 0-15 10-26 24-26z"/>
      <path class="sc-figure2" d="M497 60c-3 11-1 22 5 29l9 4 1-10c-6-4-10-12-11-21z"/>
      <!-- apron: a lighter panel down the front, its near edge catching the lamp -->
      <path class="sc-figure2" d="M497 96h46l9 69h-64z"/>
      <!-- forearm laid along the counter, elbow out, ending in a hand -->
      <path class="sc-figure" d="M554 98c15 4 27 14 35 28 6 10 16 16 31 18l13 2c6 1 9 3 9 7 0 4-5 6-12 5l-19-1c-27-2-45-11-55-26-8-12-16-21-26-26z"/>
      <!-- THE LIT EDGE. One continuous line: crown, brow, cheek, jaw, neck,
           shoulder, the fall of the skirt. -->
      <g class="sc-rimline">
        <path d="M517 30c-13 1-21 12-21 26 0 12 5 22 12 27l-1 10c-16 5-30 12-37 22-7 11-9 28-8 50"/>
        <path d="M497 96l-6 69"/>
      </g>
    </g>

    <!-- THE HEN, settled on the counter beside the wares. Tyler asked for "a
         little chick behind a counter" — she gets both readings: the keeper
         minding the shop, and an actual bird sitting on the wood. -->
    <g transform="translate(46,0)">
      <!-- tail feathers, body, then neck and head as separate contours: one
           closed blob reads as a lump, three read as a bird -->
      <path class="sc-figure" d="M686 137l-30-19 18 20-24-6 22 13-16 7 22 3z"/>
      <path class="sc-figure" d="M700 165c-11 0-18-9-18-19 0-14 16-25 36-25 20 0 34 10 34 24 0 12-10 20-22 20z"/>
      <path class="sc-figure" d="M736 132c1-13 7-22 16-25l10 11c-8 3-12 10-13 20z"/>
      <circle class="sc-figure" cx="760" cy="110" r="11"/>
      <path class="sc-figure" d="M770 108l12 4-12 5z"/>
      <path class="sc-comb" d="M752 98c2-7 6-9 7-4 2-5 6-3 5 2 4-2 6 2 3 6z"/>
      <path class="sc-comb" d="M764 120l4 9-8-3z"/>
      <circle cx="762" cy="107" r="2.4" fill="var(--sc-lit)"/>
      <g class="sc-rimline">
        <path d="M682 146c0-14 16-25 36-25"/>
        <path d="M736 132c1-13 7-22 16-25"/>
        <path d="M750 104a11 11 0 0 1 14-2"/>
      </g>
    </g>

    <!-- already on the counter: a balance, a coin stack, crates, a ledger -->
    <g class="sc-prop-lit">
      <rect x="1128" y="132" width="5" height="33"/><rect x="1086" y="130" width="90" height="4"/>
      <path d="M1086 134l-13 17h26zM1176 134l-13 17h26z"/>
      <rect x="1108" y="161" width="46" height="5"/>
      <rect x="1252" y="153" width="30" height="4"/><rect x="1255" y="147" width="24" height="4"/><rect x="1258" y="141" width="18" height="4"/>
      <rect x="1330" y="138" width="64" height="27"/>
      <rect x="1330" y="148" width="64" height="3" opacity=".5"/>
      <rect x="236" y="144" width="74" height="21"/>
      <rect x="236" y="144" width="74" height="3" opacity=".6"/>
      <rect x="880" y="150" width="56" height="15"/>
      <rect x="880" y="150" width="56" height="3" opacity=".5"/>
    </g>

    <!-- the counter: front face, lit nosing, and the top surface that runs out
         of the picture and under the wares below -->
    <rect x="0" y="165" width="1600" height="13" fill="var(--sc-counter-face)"/>
    <rect x="0" y="165" width="1600" height="3.5" fill="var(--sc-counter-lip)"/>
    <rect x="0" y="178" width="1600" height="22" fill="url(#scTop)"/>
    <!-- the room falls away at the edges; the lit part is where the shop is -->
    <rect width="1600" height="200" fill="url(#scVig)"/>
  </svg>
</div>`;
  /* What you actually receive, with the currency glyph rather than 💎 / 🪙. */
  function _iapContents(p){
    if(!window.HR || !window.HR.amount) return '';
    var parts = [];
    if(p.gems) parts.push(window.HR.amount('gems', p.gems.toLocaleString(), 13, '--gem'));
    if(p.gold) parts.push(window.HR.amount('gold', p.gold.toLocaleString(), 13, '--gold-2'));
    if(p.tokens) parts.push(window.HR.amount('token', p.tokens, 13, '--gold-2'));
    return parts.length ? '<small>'+parts.join('')+'</small>' : '';
  }
  function renderShop(){
    // Globals resolved at CALL time via window.* so load order is free. These
    // local aliases keep the moved body byte-identical to its legacy.js form.
    var G = window.G || {};
    var IAP_CATALOG = window.IAP_CATALOG || [];
    var shopTab = window.shopTab;
    var SEED_SHOP = window.SEED_SHOP;
    var EQUIP_SHOP = window.EQUIP_SHOP;
    var TRAITS = window.TRAITS;
    var ITEMS = window.ITEMS;
    var SKILLS_DEF = window.SKILLS_DEF;
    var IAP = window.IAP;
    var balCanAfford = window.balCanAfford;
    var itemArt = window.itemArt;
    var gearWieldReq = window.gearWieldReq;
    var canWield = window.canWield;
    var hasTrait = window.hasTrait;
    var _gp = window._gp, _gem = window._gem;
    /* IAP side (always visible) */
    document.getElementById('iap-panel').innerHTML=`
    <div class="iap-grid">
      ${IAP_CATALOG.map(p=>`
        <div class="iap-card ${p.style||''}">
          ${p.ribbon?`<div class="ribbon">${p.ribbon}</div>`:''}
          <div class="iap-icon">${_iapGlyph(p)}</div>
          <h3>${p.title}</h3>
          <div class="desc">${p.desc}</div>
          <div class="iap-foot">
            <div class="iap-price">${p.price}${_iapContents(p)}</div>
            <button class="btn btn-gem btn-sm" onclick="IAP.buy('${p.sku}')">Buy</button>
          </div>
        </div>`).join('')}
    </div>
    ${(G.inventory?.hearth_token||0)>0?`
    <div class="activity-card sc-token-card"><div class="ac-icon">${(window.HR&&window.HR.icon)?window.HR.icon('token',22,'--gold-2'):''}</div><div style="flex:1"><b>Hearth Tokens: ${G.inventory.hearth_token}</b><span>Sell on the player market for gold, or redeem here for 150 gems each.</span></div><button class="btn btn-sm btn-primary" onclick="redeemHearthToken()">Redeem 1 → 150 gems</button></div>`:''}
    <div class="muted tiny" style="margin-top:14px">Purchases route to the platform you're running on (Steamworks / App Store / Play Store / Stripe). Receipts are validated server-side before granting items. Detected: <b>${IAP.detectPlatform()}</b>.</div>`;

    /* in-game shop side */
    const el=document.getElementById('shop-panel');if(!el)return;
    let offers='';
    if(shopTab==='seeds'){
      offers=SEED_SHOP.map(s=>{const d=ITEMS[s.id];const can=balCanAfford(s.cost,'gold');return `<div class="shop-row"><span class="si">${itemArt(s.id)}</span><div class="info"><b>${d.n} ×${s.qty}</b><span>Have: ${G.inventory[s.id]||0}</span></div><span class="price">${_gp(s.cost)}</span><button class="btn btn-sm ${can?'btn-primary':''}" ${can?'':'disabled'} onclick="buyShopItem('${s.id}',${s.qty},${s.cost})">Buy</button></div>`;}).join('');
    } else if(shopTab==='equip'){
      /* b341 — THE SHOP SAYS WHAT YOU CAN WEAR.
         An Iron Sword rendered as "Iron Sword · +7 ATK · +6 STR · 500 · Buy" and
         nothing on the row, in its title, or in its aria-label mentioned that it
         needs Attack Lv 15. A new player starts with 500 gold, the purchase
         succeeds, and the requirement is first spoken at EQUIP time — by which
         point undoing it costs 300 gold, because the vendor buys back at 40%.
         Six items in this shop behave that way.

         The gate itself has existed since b246 (`gearWieldReq` / `canWield`, the
         same pair equipItem() enforces); the shop simply never asked. Asking is
         the whole fix — one authority, read at the point of sale.

         NOT blocked, deliberately. The Skills panel disables a locked activity
         because that action cannot work at all; buying gear early DOES work —
         you own it, and buying ahead of a level is a normal thing to do on
         purpose. Blocking would punish that and would strand any player who
         banked for a sword before training for it. So the row STATES the
         requirement and marks itself locked; the decision stays the player's.
         (`.mr-lock` is the same lock chip the monster list uses for "CL 15", so
         "you cannot use this yet" reads identically on both screens.) */
      offers=EQUIP_SHOP.map(s=>{
        const d=ITEMS[s.id];const can=balCanAfford(s.cost,'gold');
        const stats=[d.atkB?`+${d.atkB} ATK`:'',d.defB?`+${d.defB} DEF`:'',d.strB?`+${d.strB} STR`:''].filter(Boolean).join(' · ');
        const req=(typeof gearWieldReq==='function')?gearWieldReq(d):null;
        const reqName=req?(((typeof SKILLS_DEF!=='undefined'&&SKILLS_DEF[req.skill]&&SKILLS_DEF[req.skill].name)||req.skill)):'';
        const wieldable=req?((typeof canWield==='function')?canWield(s.id).ok:true):true;
        const reqText=req?`Requires ${reqName} Lv ${req.lv}`:'';
        const lockGly=(window.HR&&window.HR.icon)?(window.HR.icon('uiLock',11,'currentColor')||''):'';
        const reqChip=req?`<span class="mr-lock" style="margin-left:8px">${lockGly}${reqText}</span>`:'';
        const label=`${d.n}${reqText?' — '+reqText+(wieldable?' (met)':''):''}`;
        return `<div class="shop-row"${req?` data-req-skill="${req.skill}" data-req-lv="${req.lv}"`:''} title="${label.replace(/"/g,'&quot;')}" aria-label="${label.replace(/"/g,'&quot;')}"><span class="si">${itemArt(s.id)}</span><div class="info"><b>${d.n}</b><span>${stats||d.n}${wieldable?'':reqChip}</span></div><span class="price">${_gp(s.cost)}</span><button class="btn btn-sm ${can?'btn-primary':''}" ${can?'':'disabled'} onclick="buyShopItem('${s.id}',1,${s.cost})">Buy</button></div>`;
      }).join('');
    } else {
      /* cosmetics — gem-priced.
         b221: these four shipped `icon:'✨' / '🐲' / '🦅' / '😎'` and rendered them
         straight into `.si` — four system-font emoji, live on the store screen,
         in a game whose first art rule is that emoji are never art. The strip
         sweep in icon-set.js only covers `#panel-bounty .si`, so nothing caught
         them. They now draw from the baked atlas like everything else. */
      const cosmetics=[
        {id:'name_gold',name:'Golden Name',glyph:'uiStar',price:200,desc:'Gold-tinted player name in chat & leaderboards.'},
        /* `dragon` lives in HR_MONSTER_GLYPHS, not HR_GLYPHS — HR.icon() resolves
           only the latter, so it drew nothing at all. navProfile is the portrait
           glyph, which is what this cosmetic actually changes. */
        {id:'avatar_dragon',name:'Dragon Avatar',glyph:'navProfile',price:500,desc:'Animated dragon profile portrait.'},
        {id:'pet_phoenix',name:'Phoenix Pet',glyph:'uiFire',price:1200,desc:'Idle phoenix companion (cosmetic).'},
        {id:'emote_pack',name:'Emote Pack',glyph:'uiChat',price:300,desc:'12 chat emotes for clan chat.'},
      ];
      offers=cosmetics.map(c=>{const owned=G.ownedCosmetics.includes(c.id);const can=balCanAfford(c.price,'gems');const art=(window.HR&&window.HR.icon)?(window.HR.icon(c.glyph,30,'--gem')||''):'';return `<div class="shop-row"><span class="si is-prem">${art}</span><div class="info"><b>${c.name}</b><span>${c.desc}</span></div><span class="price gem">${_gem(c.price)}</span>${owned?'<button class="btn btn-sm" disabled>Owned</button>':`<button class="btn btn-sm ${can?'btn-gem':''}" ${can?'':'disabled'} onclick="buyCosmetic('${c.id}',${c.price})">Buy</button>`}</div>`;}).join('')+`<div class="sc-note">Need gems? <button class="btn btn-sm btn-gem" onclick="IAP.buy('gems_starter')">Get Gems</button></div>`;
    }
    /* b217: gold-purchased trait upgrades — appended below the tab list so
       they're reachable from the in-game shop. Reuses the existing shop-row
       component (no new styles). */
    const _traitRows=Object.entries(TRAITS).map(([id,t])=>{
      const owned=hasTrait(id);const can=t.currency==='marks'?((G.bountyHunter&&G.bountyHunter.marks||0)>=t.cost):balCanAfford(t.cost,'gold');
      const art=(window.HR&&window.HR.icon)?window.HR.icon(t.glyph,30,'currentColor'):'';
      return `<div class="shop-row"><span class="si">${art}</span><div class="info"><b>${t.name}</b><span>${t.desc}</span></div>${owned?'<button class="btn btn-sm" disabled>Unlocked</button>':`<span class="price">${t.currency==='marks'?t.cost+' Marks':_gp(t.cost)}</span><button class="btn btn-sm ${can?'btn-primary':''}" ${can?'':'disabled'} onclick="buyTrait('${id}')">Buy</button>`}</div>`;
    }).join('');
    /* b221: the scene and the offers are ONE object — the counter's top surface
       runs out of the picture and under the wares. Assign once; the old code
       wrote innerHTML twice, which re-parsed and re-laid-out the whole list. */
    /* b311 (Tyler): vendor Buy-Back lives HERE, in the Local Shop where you sold
       to the vendor — NOT as a button on every inventory item's detail (which is
       where it used to appear the moment you sold anything). Only shown when there
       is something to undo. */
    const _buyback = (Array.isArray(G.buyback) && G.buyback.length)
      ? `<div class="sc-sep">Vendor buy-back</div>`
        + `<div class="shop-row"><div class="info"><b>Buy back sold items</b>`
        + `<span>${G.buyback.length} recent sale${G.buyback.length>1?'s':''} you can undo</span></div>`
        + `<button class="btn btn-sm btn-primary" onclick="openBuyback()">Buy Back…</button></div>`
      : '';
    el.innerHTML=SHOP_SCENE
      +`<div class="sc-counter">${offers}`
      +`<div class="sc-sep">Under the counter</div>`+_traitRows
      + _buyback
      +`</div>`;
  }
  window.renderShop = renderShop;
})();
