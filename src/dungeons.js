// ============================================================
// src/dungeons.js — Dungeons & Raids stub system
//
// Adds a "Dungeons" tab in the sidebar with three difficulty
// brackets: Dungeon (solo, T2-T3 enemies), Raid (4-player, T4-T5),
// World Boss (24-player, T6+).
//
// Each entry has:
//   • A required combat level
//   • An entry cost (gold or hearth_token)
//   • A loot table that includes BoP rewards (housing blueprints,
//     raid relics, currency)
//   • A cooldown (per character per day for raids/world bosses)
//
// This is a SKELETON — the actual battle logic is staged: clicking
// "Run" rolls the loot table and applies rewards directly. Tyler can
// extend this with real boss fights, party invites, etc., later.
// ============================================================

(function(){
  'use strict';

  // Phase types for manual runs:
  //   gather  → click a node N times within T seconds
  //   fight   → timed attack rhythm: click on beat for max damage
  //   dodge   → reaction prompts: click within window to dodge
  //   puzzle  → pick correct option from N choices
  //   loot    → quick-tap chests within time window

  var DUNGEONS = {
    // ---- Solo dungeons ----
    crypt_of_bones: {
      name: 'Crypt of Bones', icon: '💀', kind: 'dungeon',
      reqLv: 25, cost: { key: 'bone_key' },
      duration: 60,
      cooldownH: 4,
      boss: { name: 'The Marrow King', title: 'Lord of the Bonepit' },
      desc: 'A small crypt swarming with skeletons. The Marrow King waits at its heart — bones, a blueprint, and a deed for the taking.',
      loot: [
        { id: 'big_bones', qty: [10, 30], chance: 1.0 },
        { id: 'grave_dust', qty: [1, 3], chance: .85 },
        { id: 'kitchen_blueprint_t2', qty: [1, 1], chance: .12 },
        { id: 'farm_deed', qty: [1, 1], chance: .20 },
      ],
      phases: [
        { type:'gather', label:'Gather torches', icon:'🔦', target: 8, durationS: 25,
          desc: 'Light the dark crypt. Click a torch each time one appears.' },
        { type:'fight', label:'Skeleton swarm', icon:'💀', enemyHp: 60, durationS: 70,
          desc: 'Attack on the beat. Time your click as the marker hits the target band.' },
        { type:'puzzle', label:'Sealed sarcophagus', icon:'⚰️',
          question: 'Which sigil seals an undead?',
          options: ['☀️ Sun', '🌙 Moon', '🦴 Bone', '🌊 Wave'],
          correct: 0,
          desc: 'Pick the correct rune to claim the prize within.' },
      ],
    },
    goblin_warcamp: {
      name: 'Goblin Warcamp', icon: '⚔️', kind: 'dungeon',
      reqLv: 35, cost: { key: 'goblin_seal' },
      duration: 90,
      cooldownH: 6,
      boss: { name: 'Grimtusk', title: 'Warlord of the Broken Tusk' },
      desc: 'Sack the warcamp. Grimtusk rules the horde — cut the warlord down for his cleaver.',
      loot: [
        { id: 'goblin_totem', qty: [3, 8], chance: 1.0 },
        { id: 'warlord_badge', qty: [1, 2], chance: .35 },
        { id: 'forge_blueprint_t2', qty: [1, 1], chance: .15 },
        { id: 'warboss_standard', qty: [1, 1], chance: .18 },
        { id: 'wartusk_cleaver', qty: [1, 1], chance: .06 },
        { id: 'farm_deed', qty: [1, 1], chance: .22 },
      ],
      phases: [
        { type:'gather', label:'Sneak past patrols', icon:'👁️', target: 10, durationS: 30,
          desc: 'Tap each green window the moment a patrol turns away.' },
        { type:'dodge', label:'Trap corridor', icon:'⚠️', target: 5, durationS: 40,
          desc: 'Dodge swinging blades — click DODGE when the prompt flashes.' },
        { type:'fight', label:'Grimtusk, the Broken-Tusk Warlord', icon:'⚔️', enemyHp: 180, durationS: 90, boss: true,
          desc: 'Grimtusk himself. Time attacks on the beat to break the warlord.' },
      ],
    },
    haunted_archive: {
      name: 'Haunted Archive', icon: '📚', kind: 'dungeon',
      reqLv: 45, cost: { key: 'arcane_tome' },
      duration: 120,
      cooldownH: 8,
      boss: { name: 'The Pale Archivist', title: 'Keeper of Forbidden Pages' },
      desc: 'A library long abandoned. The Pale Archivist guards its forbidden codex.',
      loot: [
        { id: 'magic_essence', qty: [5, 12], chance: 1.0 },
        { id: 'cracked_spellstone', qty: [1, 3], chance: .60 },
        { id: 'library_blueprint_t2', qty: [1, 1], chance: .15 },
        { id: 'lexarch_seal', qty: [1, 1], chance: .16 },
        { id: 'whispering_codex', qty: [1, 1], chance: .06 },
        { id: 'farm_deed', qty: [1, 1], chance: .25 },
      ],
      phases: [
        { type:'puzzle', label:'Decipher the codex', icon:'📖',
          question: 'Three runes glow in sequence: ☀️ 🌙 ⭐. What completes the cycle?',
          options: ['🌑 Dark', '⭐ Star', '☀️ Sun', '🌙 Moon'],
          correct: 0,
          desc: 'A clever librarian sees the pattern.' },
        { type:'gather', label:'Bind loose pages', icon:'📜', target: 12, durationS: 35,
          desc: 'Pages flutter past — collect each one before they vanish.' },
        { type:'fight', label:'The Pale Archivist', icon:'👻', enemyHp: 240, durationS: 100, boss: true,
          desc: 'The Archivist unbinds. Time attacks while it phase-shifts.' },
      ],
    },

    // ---- Raids (party content, currently solo-simulated) ----
    obsidian_keep: {
      name: 'Obsidian Keep', icon: '🏰', kind: 'raid',
      reqLv: 65, cost: { key: 'obsidian_sigil' },
      duration: 240,
      cooldownH: 24,
      partySize: 4,
      boss: { name: 'The Ashen King', title: 'Lord of the Obsidian Throne' },
      desc: 'Storm the keep single-handed. The Ashen King holds the throne — and his greatsword.',
      loot: [
        { id: 'death_steel', qty: [1, 3], chance: 1.0 },
        { id: 'kitchen_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'forge_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'trophy_blueprint_t2', qty: [1, 1], chance: .25 },
        { id: 'ashcrown_greatsword', qty: [1, 1], chance: .05 },
        { id: 'farm_deed', qty: [1, 2], chance: .30 },
      ],
      phases: [
        { type:'gather', label:'Scale the walls', icon:'🧗', target: 15, durationS: 40,
          desc: 'Click each handhold as it stabilizes.' },
        { type:'dodge', label:'Cannon barrage', icon:'💥', target: 8, durationS: 60,
          desc: 'Dodge incoming cannonfire.' },
        { type:'fight', label:'The Ashen King', icon:'👑', enemyHp: 520, durationS: 140, boss: true,
          desc: 'The Ashen King brings dark magic. Time your attacks.' },
      ],
    },
    voidbringer: {
      name: 'The Voidbringer', icon: '🌌', kind: 'raid',
      reqLv: 80, cost: { key: 'void_fragment' },
      duration: 360,
      cooldownH: 24,
      partySize: 4,
      boss: { name: 'The Riftmaw', title: 'The Devouring Rift' },
      desc: "Rifts open in the sky. The Riftmaw pours through — its husk and scepter are the prize.",
      loot: [
        { id: 'void_chitin', qty: [1, 4], chance: 1.0 },
        { id: 'void_core', qty: [1, 2], chance: .35 },
        { id: 'void_essence', qty: [1, 1], chance: .25 },
        { id: 'library_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'riftmaw_husk', qty: [1, 2], chance: .30 },
        { id: 'voidwoven_sigil', qty: [1, 1], chance: .14 },
        { id: 'voidmaw_scepter', qty: [1, 1], chance: .04 },
        { id: 'farm_deed', qty: [1, 2], chance: .32 },
      ],
      /* Wave 6b (audit fix): the two marquee endgame instances were pure one-button
         loot rolls with NO encounter. Give them a real 3-phase fight like the others. */
      phases: [
        { type:'puzzle', label:'Seal the rift', icon:'🌀',
          question: 'A rift tears the sky. Which sigil closes the void?',
          options: ['🕸️ Voidwoven', '☀️ Sun', '🌊 Tide', '🔥 Ember'],
          correct: 0,
          desc: 'Choose the sigil that binds the tear before more pour through.' },
        { type:'dodge', label:'Rift tendrils', icon:'🐙', target: 10, durationS: 60,
          desc: 'Dodge the lashing tendrils — click DODGE as each strikes.' },
        { type:'fight', label:'The Riftmaw', icon:'🌌', enemyHp: 720, durationS: 150, boss: true,
          desc: 'The Devouring Rift itself. Time your attacks through the churn.' },
      ],
    },

    // ---- World Bosses ----
    ancient_wyrm: {
      name: 'Ancient Wyrm', icon: '🐲', kind: 'worldboss',
      reqLv: 95, cost: { key: 'dragonsbane_key' },
      duration: 600,
      cooldownH: 72,
      partySize: 24,
      boss: { name: 'Elderscale, the Great Wyrm', title: 'Eldest of Dragons' },
      desc: 'The greatest dragon yet seen. Elderscale falls only to a true dragonslayer — the Dragonfang Pike is the reward.',
      loot: [
        { id: 'dragon_scale', qty: [3, 8], chance: 1.0 },
        { id: 'dragon_bones', qty: [2, 5], chance: 1.0 },
        { id: 'dragon_gem', qty: [1, 1], chance: .30 },
        { id: 'dragon_relic', qty: [1, 1], chance: .15 },
        { id: 'trophy_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'elderscale_heart', qty: [1, 1], chance: .25 },
        { id: 'dragonfang_pike', qty: [1, 1], chance: .03 },
        { id: 'farm_deed', qty: [2, 3], chance: .35 },
      ],
      /* Wave 6b: the capstone gets a real dragonslayer encounter. */
      phases: [
        { type:'dodge', label:'Dragonfire', icon:'🔥', target: 12, durationS: 55,
          desc: 'Elderscale breathes. Dodge each gout of flame.' },
        { type:'gather', label:'Load the ballista', icon:'🎯', target: 14, durationS: 45,
          desc: 'Grab dragonbane bolts and load the ballista before it lands.' },
        { type:'fight', label:'Elderscale, the Great Wyrm', icon:'🐲', enemyHp: 1050, durationS: 170, boss: true,
          desc: 'The Eldest of Dragons. Only a true dragonslayer stands here.' },
      ],
    },
  };
  window.DUNGEONS = DUNGEONS;

  /* b281 — award Dungeon Scrip on a clear, scaled by the dungeon's level. `fraction`
     lets the scavenger pay partial scrip for a partial boss kill. Shared by all
     three completion paths (auto-run, manual phases, scavenger). */
  function awardDungeonScrip(id, fraction){
    var d = DUNGEONS[id]; if(!d || !window.G) return 0;
    var base = Math.max(5, Math.round((d.reqLv || 10) * 0.6));
    var amt = Math.max(1, Math.round(base * (fraction == null ? 1 : Math.max(0, fraction))));
    if(typeof window.addItem === 'function') window.addItem('dungeon_scrip', amt);
    else window.G.inventory.dungeon_scrip = (window.G.inventory.dungeon_scrip || 0) + amt;
    if(typeof window.notify === 'function') window.notify('+' + amt + ' Dungeon Scrip', 'loot');
    return amt;
  }
  window.awardDungeonScrip = awardDungeonScrip;

  /* b281 — THE QUARTERMASTER: spend Dungeon Scrip. Keys let you re-run without
     waiting on a key drop; blueprints buy homestead tiers; and the signature boss
     weapons are purchasable for a LOT of scrip — a deterministic path so a 3% drop
     isn't the only way to the weapon you're chasing. This is the cohesion loop:
     run dungeons → scrip → the exact reward you want. */
  var QM_STOCK = [
    { id:'bone_key', scrip:18 }, { id:'goblin_seal', scrip:24 }, { id:'arcane_tome', scrip:30 },
    { id:'obsidian_sigil', scrip:45 }, { id:'void_fragment', scrip:60 }, { id:'dragonsbane_key', scrip:85 },
    { id:'kitchen_blueprint_t2', scrip:55 }, { id:'forge_blueprint_t2', scrip:55 }, { id:'library_blueprint_t2', scrip:55 }, { id:'trophy_blueprint_t2', scrip:55 },
    { id:'kitchen_blueprint_t3', scrip:160 }, { id:'forge_blueprint_t3', scrip:160 }, { id:'library_blueprint_t3', scrip:160 }, { id:'trophy_blueprint_t3', scrip:160 },
    { id:'wartusk_cleaver', scrip:150 }, { id:'whispering_codex', scrip:180 }, { id:'ashcrown_greatsword', scrip:340 }, { id:'voidmaw_scepter', scrip:500 }, { id:'dragonfang_pike', scrip:800 },
  ];
  window.QM_STOCK = QM_STOCK;
  function scripHeld(){ return (window.G && window.G.inventory && window.G.inventory.dungeon_scrip) || 0; }

  function buyFromQuartermaster(id){
    var entry = QM_STOCK.find(function(e){ return e.id === id; });
    if(!entry) return false;
    if(scripHeld() < entry.scrip){ if(window.notify) window.notify('Not enough Dungeon Scrip', 'kill'); return false; }
    /* b283 (studio-review P0): add the item FIRST and only spend scrip if it lands.
       The old order (spend, then add) lost the scrip AND gave nothing when the bag
       was full. addItem returns false on a full bag; bail without charging. */
    var gained = (typeof window.addItem === 'function') ? window.addItem(id, 1) : (function(){ window.G.inventory[id]=(window.G.inventory[id]||0)+1; return true; })();
    if(gained === false){ if(window.notify) window.notify('Your bag is full — buy bank space first.', 'kill'); return false; }
    if(typeof window.removeItem === 'function') window.removeItem('dungeon_scrip', entry.scrip);
    else window.G.inventory.dungeon_scrip = scripHeld() - entry.scrip;
    /* ── b372: RECORD THE TRADE AS ONE RECORD, BOTH LEGS ───────────────────
       Reported 2026-08-18: "you will get the dungeon scrip back after a short
       amount of time... you can buy every blueprint with minimum 160 scrip."

       Neither leg above is known to the server — there is no Quartermaster
       verb. The settle envelope then reverts them by DIFFERENT rules (it NAMES
       scrip, so the merge's max refunds it; it OMITS the blueprint, so "absent
       means unknown" keeps it), and the trade is only ever half-undone. The
       ledger re-applies both legs together on top of every envelope, so the
       purchase either stands whole or reverts whole. Full reasoning and the
       server end-state (`quartermaster_buy`) in src/net/item-ledger.js.

       Registered by src/net/dungeon-purchase.js, so this classic script has no
       import to do; unwired (Node, a boot before the module loads) it is a
       no-op and the behaviour is exactly today's. */
    if(typeof window.__recordItemTrade === 'function'){
      try { window.__recordItemTrade({ dungeon_scrip: entry.scrip }, { [id]: 1 }, 'quartermaster'); }
      catch(e){ console.warn('[quartermaster] trade ledger threw:', e && e.message); }
    }
    var it = window.ITEMS && window.ITEMS[id];
    if(window.notify) window.notify('Bought ' + (it ? it.n : id) + ' for ' + entry.scrip + ' Scrip', 'levelup');
    renderQuartermaster();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    return true;
  }
  window.buyFromQuartermaster = buyFromQuartermaster;

  function renderQuartermaster(){
    var line = document.getElementById('qm-scrip-line');
    if(line) line.innerHTML = 'You have <b>' + scripHeld() + ' Dungeon Scrip</b> — earned by clearing dungeons.';
    var body = document.getElementById('quartermaster-body');
    if(!body) return;
    var groups = [
      { label:'Keys — re-run any dungeon', ids:['bone_key','goblin_seal','arcane_tome','obsidian_sigil','void_fragment','dragonsbane_key'] },
      { label:'Housing blueprints', ids:['kitchen_blueprint_t2','forge_blueprint_t2','library_blueprint_t2','trophy_blueprint_t2','kitchen_blueprint_t3','forge_blueprint_t3','library_blueprint_t3','trophy_blueprint_t3'] },
      { label:'Signature boss weapons — guaranteed, no RNG', ids:['wartusk_cleaver','whispering_codex','ashcrown_greatsword','voidmaw_scepter','dragonfang_pike'] },
    ];
    body.innerHTML = groups.map(function(g){
      var rows = g.ids.map(function(id){
        var e = QM_STOCK.find(function(x){ return x.id === id; });
        if(!e) return '';
        var it = window.ITEMS && window.ITEMS[id];
        var can = scripHeld() >= e.scrip;
        /* b283 (studio-review P1): the shop was pure text — give each row an icon. */
        var ipath = window._itemPath && window._itemPath[id];
        var iconHtml = ipath ? '<img src="' + ipath + '" alt="" style="width:26px;height:26px;object-fit:contain">' : '<span>' + (it && it.icon ? it.icon : '📦') + '</span>';
        return '<div class="qm-row"><span class="qm-icon">' + iconHtml + '</span><span class="qm-name">' + (it ? it.n : id) + '</span>' +
          '<span class="qm-cost">' + e.scrip + ' Scrip</span>' +
          '<button class="btn btn-sm ' + (can ? 'btn-primary' : '') + '" ' + (can ? '' : 'disabled') +
          ' onclick="window.buyFromQuartermaster(\'' + id + '\')">Buy</button></div>';
      }).join('');
      return '<div class="qm-group-label">' + g.label + '</div>' + rows;
    }).join('');
  }
  window.renderQuartermaster = renderQuartermaster;

  function openQuartermaster(){
    var old = document.getElementById('quartermaster-overlay'); if(old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'qm-overlay'; ov.id = 'quartermaster-overlay';
    ov.innerHTML = '<div class="qm-modal quartermaster-modal" style="max-width:540px;position:relative">' +
      '<button class="qm-close" aria-label="Close">✕</button>' +
      '<h3 style="margin:0 0 4px">Quartermaster</h3>' +
      '<div class="qm-scrip-line" id="qm-scrip-line"></div>' +
      '<div id="quartermaster-body"></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('.qm-close').addEventListener('click', function(){ ov.remove(); });
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    renderQuartermaster();
  }
  window.openQuartermaster = openQuartermaster;

  // ---- State ----
  function ensureState(){
    if(!window.G) return;
    window.G.dungeons = window.G.dungeons || { lastRun: {} };
  }

  function canRun(id){
    ensureState();
    var d = DUNGEONS[id];
    if(!d) return { ok: false, reason: 'unknown' };
    var lv = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
    if(lv < d.reqLv) return { ok: false, reason: 'Combat Lv ' + d.reqLv + ' required (you are ' + lv + ')' };
    if(d.cost.key){
      var keyItem = window.ITEMS && window.ITEMS[d.cost.key];
      var keyName = keyItem ? keyItem.n : d.cost.key;
      if((window.G.inventory[d.cost.key] || 0) < 1){
        return { ok: false, reason: 'Need a ' + keyName };
      }
    }
    if(d.cost.gold && !window.balCanAfford(d.cost.gold, 'gold')){
      return { ok: false, reason: window.balKnown('gold') ? ('Need ' + d.cost.gold + ' gold')
        : window.balShortfall(d.cost.gold, 'gold') };
    }
    if(d.cost.hearth_token && (window.G.inventory.hearth_token || 0) < d.cost.hearth_token) {
      return { ok: false, reason: 'Need ' + d.cost.hearth_token + ' Hearth Tokens' };
    }
    var last = window.G.dungeons.lastRun[id] || 0;
    var cdMs = d.cooldownH * 3600000;
    var elapsed = Date.now() - last;
    if(elapsed < cdMs) {
      var hRemain = ((cdMs - elapsed) / 3600000).toFixed(1);
      return { ok: false, reason: 'On cooldown — ' + hRemain + 'h remaining' };
    }
    return { ok: true };
  }
  window.canRunDungeon = canRun;

  function runDungeon(id){
    var check = canRun(id);
    if(!check.ok){
      if(typeof window.notify === 'function') window.notify(check.reason, 'kill');
      return false;
    }
    var d = DUNGEONS[id];
    // Pay cost
    if(d.cost.key){
      if(typeof window.removeItem === 'function') window.removeItem(d.cost.key, 1);
      else window.G.inventory[d.cost.key] = Math.max(0, (window.G.inventory[d.cost.key]||0) - 1);
    }
    if(d.cost.gold) window.G.gold -= d.cost.gold;
    if(d.cost.hearth_token){
      if(typeof window.removeItem === 'function') window.removeItem('hearth_token', d.cost.hearth_token);
      else window.G.inventory.hearth_token = Math.max(0, (window.G.inventory.hearth_token||0) - d.cost.hearth_token);
    }
    // Roll loot
    var awarded = [];
    d.loot.forEach(function(roll){
      if(Math.random() <= roll.chance){
        var qty = roll.qty[0] + Math.floor(Math.random() * (roll.qty[1] - roll.qty[0] + 1));
        if(typeof window.addItem === 'function') window.addItem(roll.id, qty);
        else window.G.inventory[roll.id] = (window.G.inventory[roll.id] || 0) + qty;
        awarded.push({ id: roll.id, qty: qty });
      }
    });
    window.G.dungeons.lastRun[id] = Date.now();
    awardDungeonScrip(id, 1);
    if(typeof window.notify === 'function'){
      window.notify('Cleared ' + d.name + '! ' + awarded.length + ' rewards', 'levelup');
      awarded.forEach(function(a){
        var item = window.ITEMS && window.ITEMS[a.id];
        var name = item ? item.n : a.id;
        if(typeof window.notify === 'function') window.notify('+' + a.qty + '× ' + name, 'loot');
      });
    }
    if(window.HearthriseEvents) window.HearthriseEvents.emit('dungeonClear', { id: id, awarded: awarded });
    if(typeof window.renderDungeons === 'function') window.renderDungeons();
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    return true;
  }
  window.runDungeon = runDungeon;

  /* b213 (phase 2): gilt medallion tile icons instead of raw emoji — reuse
     the creature/chrome paths the icon-set has already fetched. Emoji stays
     only as the pre-cache fallback. */
  var DGN_GLYPH = {
    crypt_of_bones: { kind: 'mon', key: 'weak_skeleton' },
    /* b285 (player's-eye QA): goblin_warcamp was MISSING from this map, so it was
       the one dungeon card falling through to a raw 33px "⚔️" emoji — a FINAL
       DIRECTIVE violation sitting on the Events screen. Grimtusk is a goblin
       warlord and that portrait is already shipped. */
    goblin_warcamp: { kind: 'mon', key: 'goblin_warlord' },
    haunted_archive: { kind: 'ui', key: 'uiQuests' },
    obsidian_keep: { kind: 'ui', key: 'navDungeons' },
    voidbringer: { kind: 'mon', key: 'lesser_demon' },
    ancient_wyrm: { kind: 'mon', key: 'dragon' }
  };
  function dgnGlyph(id, d){
    var IS = window.HearthriseIconSet;
    var map = DGN_GLYPH[id];
    if(IS && map){
      if(map.kind === 'mon' && IS.medallionMon){
        var m = IS.medallionMon(map.key, 34);
        if(m) return m;
      } else if(IS.path && IS.path(map.key)){
        return '<svg viewBox="0 0 512 512" style="width:30px;height:30px" aria-hidden="true">' +
          '<path fill="var(--gold-2,#cda24a)" d="' + IS.path(map.key) + '"/></svg>';
      }
    }
    return d.icon || '';
  }

  // ---- Render the Dungeons tab ----
  function renderDungeons(){
    var panel = document.getElementById('panel-dungeons');
    if(!panel) return;
    ensureState();
    var grouped = { dungeon: [], raid: [], worldboss: [] };
    Object.entries(DUNGEONS).forEach(function(kv){ grouped[kv[1].kind].push([kv[0], kv[1]]); });
    /* b213 QA: these key-gated runs are SOLO content (the run engine has no
       party code) — stop advertising phantom "4 players"/"24 players"
       multiplayer. Real multiplayer raiding is the weekly clan raid card
       above (b209). */
    var sectionLabel = { dungeon: 'Dungeons (Solo)', raid: 'Epic Dungeons (Solo)', worldboss: 'Legendary Hunts (Solo)' };
    /* b281: Scrip banner + Quartermaster entry at the top of the dungeon panel. */
    var _scrip = (window.G && window.G.inventory && window.G.inventory.dungeon_scrip) || 0;
    var html = '<div class="dgn-scrip-bar">' +
      '<span class="dgn-scrip-have">🎟️ <b>' + _scrip + '</b> Dungeon Scrip</span>' +
      '<button class="btn btn-sm dgn-qm-btn" onclick="window.openQuartermaster()">Quartermaster</button>' +
      '</div>';
    ['dungeon','raid','worldboss'].forEach(function(kind){
      if(!grouped[kind].length) return;
      html += '<div class="dgn-section"><h3>' + sectionLabel[kind] + '</h3><div class="dgn-grid">';
      grouped[kind].forEach(function(entry){
        var id = entry[0], d = entry[1];
        var check = canRun(id);
        var lootHtml = (d.loot||[]).map(function(l){
          var item = window.ITEMS && window.ITEMS[l.id];
          /* b213 (phase 2): prefer the painted item icon over the data emoji */
          var painted = window._itemPath && window._itemPath[l.id];
          var icon = painted
            ? '<img src="' + painted + '" style="width:16px;height:16px;vertical-align:-3px;border-radius:3px">'
            : (item && item.icon ? item.icon : '');
          var bopTag = item && item.bop ? '<span class="dgn-bop">BoP</span>' : '';
          return '<div class="dgn-loot" title="' + (item ? item.n : l.id) + '">' + icon + ' ' + (l.qty[0] === l.qty[1] ? l.qty[0] : l.qty[0]+'-'+l.qty[1]) + 'x ' + bopTag + '</div>';
        }).join('');
        var costStr;
        if(d.cost.key){
          var ki = window.ITEMS && window.ITEMS[d.cost.key];
          var owned = (window.G && window.G.inventory && window.G.inventory[d.cost.key]) || 0;
          /* b372 — THE HARDEST REQUIREMENT IN THE GAME TO ANSWER. A dungeon key
             cannot be gathered or crafted; it drops, or it is bought from the
             Quartermaster for scrip, and this line named it and stopped. The
             reverse index knows both routes (b355 taught it dungeon loot and
             QM_STOCK), so the key now opens its flyout and says so.
             The raw `ki.icon` emoji goes with it — itemArt() is the one path
             every other item render in the game takes, and "no emoji as art"
             is a project rule, not a preference. */
          var keyArt = (typeof window.itemArt === 'function')
            ? window.itemArt(d.cost.key, 16)
            : (ki ? ki.icon : '');
          var keyLabel = keyArt + ' <span class="hr-si">' + (ki ? ki.n : d.cost.key) + '</span>';
          costStr = '1× ' + (typeof window.hrInspectSpan === 'function'
              ? window.hrInspectSpan(d.cost.key, keyLabel, 'dgn-key-nm')
              : keyLabel) +
            ' <span class="dgn-key-stock">(have ' + owned + ')</span>';
        } else if(d.cost.gold){
          costStr = d.cost.gold + 'g';
        } else if(d.cost.hearth_token){
          costStr = d.cost.hearth_token + ' 🪙 tokens';
        } else {
          costStr = 'free';
        }
        html +=
          '<div class="dgn-card' + (check.ok ? '' : ' locked') + '">' +
            '<div class="dgn-head">' +
              '<div class="dgn-icon">' + dgnGlyph(id, d) + '</div>' +
              '<div class="dgn-title">' +
                '<div class="dgn-name">' + d.name + '</div>' +
                '<div class="dgn-meta">Lv ' + d.reqLv + ' · ' + d.cooldownH + 'h cooldown</div>' +
              '</div>' +
            '</div>' +
            '<div class="dgn-desc">' + d.desc + '</div>' +
            (function(){
              if(!d.boss) return '';
              /* b281: enrich the boss line from the data-driven registry (weakness
                 to route your loadout, plus the fight's signature mechanic). */
              var br = window.BOSS_BY_DUNGEON && window.BOSS_BY_DUNGEON[id];
              return '<div class="dgn-boss-line"><span class="dgn-boss-skull">☠</span> Final boss: <b>' + d.boss.name + '</b>' +
                (br && br.weakness ? ' <span class="dgn-boss-weak">weak to ' + br.weakness + '</span>' : '') + '</div>' +
                (br && br.mechanic ? '<div class="dgn-boss-mech">' + br.mechanic + '</div>' : '');
            })() +
            '<div class="dgn-loot-row">' + lootHtml + '</div>' +
            '<div class="dgn-foot">' +
              '<div class="dgn-cost">Entry: <b>' + costStr + '</b></div>' +
              (function(){
                // Manual runs ignore the auto-run cooldown — only block them
                // for level/cost reasons. Auto-run still blocks on cooldown.
                var hasManual = !!(d.phases || (window.SCAVENGER_CONFIGS && window.SCAVENGER_CONFIGS[id]));
                var lvOk = (typeof window.getCombatLevel === 'function') ? (window.getCombatLevel() >= d.reqLv) : true;
                var goldOk = !d.cost.gold || window.balCanAfford(d.cost.gold, 'gold');
                var tokenOk = !d.cost.hearth_token || (window.G && (window.G.inventory.hearth_token||0) >= d.cost.hearth_token);
                var keyOk = !d.cost.key || (window.G && (window.G.inventory[d.cost.key]||0) >= 1);
                var manualOk = hasManual && lvOk && goldOk && tokenOk && keyOk;
                var autoBtn = check.ok
                  ? '<button class="dgn-run dgn-run-auto" data-dgn="' + id + '" title="Quick auto-run, base rewards · uses cooldown">⚡ Auto-Run</button>'
                  : '<button class="dgn-run" disabled title="' + check.reason + '">' + check.reason + '</button>';
                var manualBtn = manualOk
                  ? '<button class="dgn-run dgn-run-manual" data-dgn-manual="' + id + '" title="Scavenger run · no cooldown · loot scales with boss HP taken down">▶ Manual Run</button>'
                  : '';
                return '<div class="dgn-run-buttons">' + manualBtn + autoBtn + '</div>';
              })() +
            '</div>' +
          '</div>';
      });
      html += '</div></div>';
    });
    panel.innerHTML = html;
    panel.querySelectorAll('button.dgn-run[data-dgn]').forEach(function(btn){
      btn.addEventListener('click', function(){ runDungeon(this.dataset.dgn); });
    });
    panel.querySelectorAll('button.dgn-run[data-dgn-manual]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = this.dataset.dgnManual;
        // Prefer the scavenger-run path if a config exists for this dungeon.
        if(window.SCAVENGER_CONFIGS && window.SCAVENGER_CONFIGS[id] && typeof window.startScavengerRun === 'function'){
          window.startScavengerRun(id);
        } else {
          startManualRun(id);
        }
      });
    });
  }
  window.renderDungeons = renderDungeons;

  // ---- The Dungeons panel ----
  // b220 (#14): injectNav() is GONE. It created a `nav-btn[data-tab=dungeons]`
  // that theme-cozy.css immediately hid with `display:none !important` — an
  // entry that existed only to be invisible, which is why dungeons (and the
  // clan raid card rendered inside their panel) could not be found at all.
  // Dungeons are now a section of the real top-level `Events` destination
  // (index.html nav + src/features/muster.js), which relocates this panel into
  // itself on boot. `showTab('dungeons')` still works — Muster's showTab tap
  // maps it to 'events' — so every existing deep link keeps functioning.
  function injectPanel(){
    if(document.getElementById('panel-dungeons')) return;
    var main = document.querySelector('main.main');
    if(!main) return;
    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'panel-dungeons';
    main.appendChild(panel);
  }

  // Hook showTab to render the panel when entering this tab
  function wireShowTab(){
    window.HearthriseShowTab.wrapShowTab('dungeons-render', function(name){
      if(name === 'dungeons' || name === 'events') setTimeout(renderDungeons, 0);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){ injectPanel(); wireShowTab(); }, 50);
  });
  if(document.readyState !== 'loading'){
    setTimeout(function(){ injectPanel(); wireShowTab(); }, 50);
  }

  // ════════════════════════════════════════════════════════════
  // Manual run modal — interactive 3-phase mini-game
  // ════════════════════════════════════════════════════════════
  var runState = null;

  function awardLoot(id, multiplier, bonusBopChance){
    var d = DUNGEONS[id];
    var awarded = [];
    d.loot.forEach(function(roll){
      var rollChance = roll.chance;
      // BoP items get an extra chance bump in manual runs.
      if(window.ITEMS && window.ITEMS[roll.id] && window.ITEMS[roll.id].bop){
        /* b283 (studio-review P1 exploit): the flat +bonus turned a 3% signature
           weapon into 23% on a perfect clear, collapsing the chase. Cap the additive
           bonus for genuinely rare drops (<=5%) so the prestige weapons stay rare;
           common BoP still gets the full bump. */
        var addBonus = roll.chance <= 0.05 ? Math.min(bonusBopChance, 0.02) : bonusBopChance;
        rollChance = Math.min(1, rollChance + addBonus);
      }
      if(Math.random() <= rollChance){
        var qBase = roll.qty[0] + Math.floor(Math.random() * (roll.qty[1] - roll.qty[0] + 1));
        var qty = Math.max(1, Math.floor(qBase * multiplier));
        if(typeof window.addItem === 'function') window.addItem(roll.id, qty);
        else window.G.inventory[roll.id] = (window.G.inventory[roll.id] || 0) + qty;
        awarded.push({ id: roll.id, qty: qty });
      }
    });
    return awarded;
  }

  function ensureRunModal(){
    if(document.getElementById('dgn-run-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'dgn-run-overlay';
    ov.className = 'dgn-run-overlay';
    ov.innerHTML = '<div class="drm-modal" id="drm-modal"></div>';
    document.body.appendChild(ov);
  }

  function closeRunModal(){
    var ov = document.getElementById('dgn-run-overlay');
    if(ov) ov.classList.remove('open');
    if(runState && runState.intervalId){ clearInterval(runState.intervalId); }
    runState = null;
  }

  function showSummary(passed){
    var ov = document.getElementById('dgn-run-overlay');
    var modal = document.getElementById('drm-modal');
    if(!modal) return;
    var d = DUNGEONS[runState.dungeonId];
    var total = runState.phaseResults.length;
    var won = runState.phaseResults.filter(function(r){return r.passed;}).length;
    // Reward multiplier based on how many phases passed.
    // All passed = 2.0x + +20% bop chance. Half = 1.0x + 0%. None = 0.4x.
    var pct = won / total;
    var mult = 0.4 + pct * 1.6;
    var bop = pct >= 1 ? 0.20 : pct >= 0.66 ? 0.10 : 0;
    var awarded = awardLoot(runState.dungeonId, mult, bop);
    awardDungeonScrip(runState.dungeonId, pct);   // b281: scrip scales with phases cleared
    // Pay cooldown
    if(window.G && window.G.dungeons) window.G.dungeons.lastRun[runState.dungeonId] = Date.now();
    var rewardHtml = awarded.map(function(a){
      var item = window.ITEMS && window.ITEMS[a.id];
      return '<div class="drm-reward-row"><span>' + (item?item.icon:'📦') + '</span> +' + a.qty + ' ' + (item?item.n:a.id) + '</div>';
    }).join('') || '<div class="drm-empty">No drops this time.</div>';

    modal.innerHTML =
      '<button class="drm-close">✕</button>' +
      '<h2 class="drm-title">' + d.icon + ' ' + d.name + '</h2>' +
      '<div class="drm-summary">' +
        '<div class="drm-score ' + (pct >= 1 ? 'perfect' : pct >= 0.5 ? 'partial' : 'fail') + '">' +
          (pct >= 1 ? 'PERFECT' : pct >= 0.5 ? 'CLEARED' : 'FAILED') +
          '<span>' + won + ' / ' + total + ' phases</span>' +
        '</div>' +
        '<div class="drm-mult">Reward multiplier: <b>' + mult.toFixed(1) + 'x</b></div>' +
      '</div>' +
      '<div class="drm-rewards">' +
        '<h4>Spoils</h4>' + rewardHtml +
      '</div>' +
      '<button class="drm-btn drm-btn-primary" id="drm-finish">Claim</button>';
    modal.querySelector('.drm-close').addEventListener('click', closeRunModal);
    modal.querySelector('#drm-finish').addEventListener('click', function(){
      closeRunModal();
      if(typeof window.renderDungeons === 'function') window.renderDungeons();
      if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
      if(typeof window.updateTopbar === 'function') window.updateTopbar();
      if(typeof window.notify === 'function') window.notify('Cleared ' + d.name + ' (manual): ' + awarded.length + ' rewards', 'levelup');
    });
  }

  function endPhase(passed){
    if(!runState) return;
    if(runState.intervalId){ clearInterval(runState.intervalId); runState.intervalId = null; }
    runState.phaseResults.push({ index: runState.phaseIdx, passed: passed });
    runState.phaseIdx++;
    if(runState.phaseIdx >= runState.phases.length){
      showSummary(passed);
    } else {
      setTimeout(renderPhase, 600);
    }
  }

  function renderPhase(){
    if(!runState) return;
    var phase = runState.phases[runState.phaseIdx];
    var modal = document.getElementById('drm-modal');
    if(!modal) return;
    var d = DUNGEONS[runState.dungeonId];

    // Header + progress dots
    var dotsHtml = runState.phases.map(function(_, i){
      var cls = i < runState.phaseIdx ? (runState.phaseResults[i].passed ? 'done' : 'failed') :
                i === runState.phaseIdx ? 'active' : '';
      return '<div class="drm-dot ' + cls + '"></div>';
    }).join('');

    var bodyHtml = '';
    if(phase.type === 'gather'){
      runState.phaseData = { progress: 0, target: phase.target, deadline: Date.now() + phase.durationS*1000 };
      bodyHtml = '<div class="drm-gather-board" id="drm-board"></div>' +
        '<div class="drm-progress"><div class="drm-prog-bar"><i id="drm-fill" style="width:0%"></i></div>' +
        '<div class="drm-prog-text"><span id="drm-count">0 / ' + phase.target + '</span><span id="drm-time"></span></div></div>';
    } else if(phase.type === 'fight'){
      runState.phaseData = { hp: phase.enemyHp, maxHp: phase.enemyHp, deadline: Date.now() + phase.durationS*1000, beat: 0, hits: 0, perfectHits: 0 };
      bodyHtml = '<div class="drm-fight">' +
        '<div class="drm-foe">' + phase.icon + '</div>' +
        '<div class="drm-foe-hp"><i id="drm-foe-fill" style="width:100%"></i></div>' +
        '<div class="drm-foe-hp-text" id="drm-foe-hp-text">' + phase.enemyHp + ' / ' + phase.enemyHp + '</div>' +
        '<div class="drm-rhythm-track"><div class="drm-rhythm-target"></div><div class="drm-rhythm-marker" id="drm-marker"></div></div>' +
        '<button class="drm-btn drm-btn-attack" id="drm-attack">⚔️ Attack</button>' +
        '<div class="drm-prog-text"><span id="drm-fight-stats">0 hits</span><span id="drm-time"></span></div>' +
      '</div>';
    } else if(phase.type === 'dodge'){
      runState.phaseData = { dodged: 0, target: phase.target, missed: 0, allowedMisses: 2, deadline: Date.now() + phase.durationS*1000, nextDodge: Date.now() + 1500, prompt: false };
      bodyHtml = '<div class="drm-dodge">' +
        '<div class="drm-dodge-prompt" id="drm-prompt">Stand by…</div>' +
        '<button class="drm-btn drm-btn-dodge" id="drm-dodge-btn" disabled>⏳ Wait</button>' +
        '<div class="drm-prog-text"><span id="drm-dodge-stats">0 / ' + phase.target + ' dodged · 0 missed</span><span id="drm-time"></span></div>' +
      '</div>';
    } else if(phase.type === 'puzzle'){
      runState.phaseData = { deadline: Date.now() + 30*1000, picked: false };
      var optsHtml = phase.options.map(function(opt, i){
        return '<button class="drm-puzzle-opt" data-idx="' + i + '">' + opt + '</button>';
      }).join('');
      bodyHtml = '<div class="drm-puzzle">' +
        '<div class="drm-puzzle-q">' + phase.question + '</div>' +
        '<div class="drm-puzzle-opts">' + optsHtml + '</div>' +
        '<div class="drm-prog-text"><span></span><span id="drm-time"></span></div>' +
      '</div>';
    }

    modal.innerHTML =
      '<button class="drm-close">✕</button>' +
      '<div class="drm-progress-dots">' + dotsHtml + '</div>' +
      '<div class="drm-phase-head">' +
        '<span class="drm-phase-icon">' + phase.icon + '</span>' +
        '<div class="drm-phase-title">' +
          '<h3>Phase ' + (runState.phaseIdx+1) + ' of ' + runState.phases.length + ' — ' + phase.label + '</h3>' +
          '<div class="drm-phase-desc">' + phase.desc + '</div>' +
        '</div>' +
      '</div>' +
      bodyHtml;

    modal.querySelector('.drm-close').addEventListener('click', closeRunModal);

    // Wire interactions per phase type
    if(phase.type === 'gather'){
      runState.phaseData.spawnTimer = setInterval(spawnGatherNode, 1000);
      spawnGatherNode();
    } else if(phase.type === 'fight'){
      var atkBtn = modal.querySelector('#drm-attack');
      atkBtn.addEventListener('click', onFightAttack);
    } else if(phase.type === 'dodge'){
      var dodgeBtn = modal.querySelector('#drm-dodge-btn');
      dodgeBtn.addEventListener('click', onDodgeClick);
    } else if(phase.type === 'puzzle'){
      modal.querySelectorAll('.drm-puzzle-opt').forEach(function(b){
        b.addEventListener('click', function(){
          if(runState.phaseData.picked) return;
          runState.phaseData.picked = true;
          var pickedIdx = parseInt(this.dataset.idx, 10);
          var passed = pickedIdx === phase.correct;
          this.classList.add(passed ? 'right' : 'wrong');
          if(!passed){
            modal.querySelectorAll('.drm-puzzle-opt')[phase.correct].classList.add('right');
          }
          setTimeout(function(){ endPhase(passed); }, 900);
        });
      });
    }

    // Common tick (timer + per-phase logic)
    runState.intervalId = setInterval(phaseTick, 100);
  }

  // --- Per-phase logic ----------------------------------------
  function spawnGatherNode(){
    if(!runState || runState.phases[runState.phaseIdx].type !== 'gather') return;
    var board = document.getElementById('drm-board');
    if(!board) return;
    var node = document.createElement('button');
    node.className = 'drm-gather-node';
    node.textContent = runState.phases[runState.phaseIdx].icon || '✨';
    node.style.left = Math.random()*82 + 4 + '%';
    node.style.top = Math.random()*70 + 6 + '%';
    var fadeMs = 1800;
    var ttl = setTimeout(function(){ if(node.parentNode) node.parentNode.removeChild(node); }, fadeMs);
    node.addEventListener('click', function(){
      runState.phaseData.progress++;
      if(this.parentNode) this.parentNode.removeChild(this);
      clearTimeout(ttl);
      var c = document.getElementById('drm-count');
      var f = document.getElementById('drm-fill');
      if(c) c.textContent = runState.phaseData.progress + ' / ' + runState.phaseData.target;
      if(f) f.style.width = Math.min(100, runState.phaseData.progress / runState.phaseData.target * 100) + '%';
      if(runState.phaseData.progress >= runState.phaseData.target){
        if(runState.phaseData.spawnTimer){ clearInterval(runState.phaseData.spawnTimer); }
        endPhase(true);
      }
    });
    board.appendChild(node);
  }

  function onFightAttack(){
    if(!runState) return;
    var marker = document.getElementById('drm-marker');
    if(!marker) return;
    var rect = marker.parentNode.getBoundingClientRect();
    var mRect = marker.getBoundingClientRect();
    // Compute how close marker is to center band (40-60%)
    var pct = (mRect.left + mRect.width/2 - rect.left) / rect.width;
    var perfect = pct >= 0.40 && pct <= 0.60;
    var hit = pct >= 0.30 && pct <= 0.70;
    var dmg = perfect ? 18 : hit ? 9 : 3;
    runState.phaseData.hp = Math.max(0, runState.phaseData.hp - dmg);
    runState.phaseData.hits++;
    if(perfect) runState.phaseData.perfectHits++;
    var fill = document.getElementById('drm-foe-fill');
    var hpText = document.getElementById('drm-foe-hp-text');
    var stats = document.getElementById('drm-fight-stats');
    if(fill) fill.style.width = (runState.phaseData.hp / runState.phaseData.maxHp * 100) + '%';
    if(hpText) hpText.textContent = runState.phaseData.hp + ' / ' + runState.phaseData.maxHp;
    if(stats) stats.textContent = runState.phaseData.hits + ' hits · ' + runState.phaseData.perfectHits + ' perfect';
    // Visual feedback
    marker.classList.remove('hit-perfect','hit-good','hit-bad');
    marker.classList.add(perfect ? 'hit-perfect' : hit ? 'hit-good' : 'hit-bad');
    if(runState.phaseData.hp <= 0){
      endPhase(true);
    }
  }

  function onDodgeClick(){
    if(!runState) return;
    if(!runState.phaseData.prompt) return;
    runState.phaseData.dodged++;
    runState.phaseData.prompt = false;
    var promptEl = document.getElementById('drm-prompt');
    var btn = document.getElementById('drm-dodge-btn');
    var stats = document.getElementById('drm-dodge-stats');
    if(promptEl) promptEl.textContent = '✓ Dodged!';
    if(btn){ btn.disabled = true; btn.textContent = '⏳ Wait'; }
    if(stats) stats.textContent = runState.phaseData.dodged + ' / ' + runState.phaseData.target + ' dodged · ' + runState.phaseData.missed + ' missed';
    if(runState.phaseData.dodged >= runState.phaseData.target){ endPhase(true); }
    else { runState.phaseData.nextDodge = Date.now() + (1500 + Math.random()*1500); }
  }

  function phaseTick(){
    if(!runState) return;
    var phase = runState.phases[runState.phaseIdx];
    var pd = runState.phaseData;
    var now = Date.now();
    var remainMs = pd.deadline - now;
    var timeEl = document.getElementById('drm-time');
    if(timeEl) timeEl.textContent = Math.max(0, Math.ceil(remainMs/1000)) + 's';

    if(remainMs <= 0){
      if(phase.type === 'gather' && pd.spawnTimer) clearInterval(pd.spawnTimer);
      var passed = false;
      if(phase.type === 'gather') passed = pd.progress >= pd.target;
      else if(phase.type === 'fight') passed = pd.hp <= 0;
      else if(phase.type === 'dodge') passed = pd.dodged >= pd.target;
      else passed = false;
      endPhase(passed);
      return;
    }

    if(phase.type === 'fight'){
      // Animate marker bouncing left↔right
      pd.beat = (pd.beat + 4) % 200;
      var marker = document.getElementById('drm-marker');
      if(marker){
        var pct = pd.beat <= 100 ? pd.beat : 200 - pd.beat;
        marker.style.left = pct + '%';
      }
    } else if(phase.type === 'dodge'){
      var promptEl = document.getElementById('drm-prompt');
      var btn = document.getElementById('drm-dodge-btn');
      if(!pd.prompt && now >= pd.nextDodge){
        pd.prompt = true;
        pd.promptStart = now;
        if(promptEl) promptEl.textContent = '⚠️ DODGE NOW!';
        if(btn){ btn.disabled = false; btn.textContent = '🛡️ DODGE'; }
      } else if(pd.prompt && now - pd.promptStart > 800){
        // Missed window
        pd.prompt = false;
        pd.missed++;
        if(promptEl) promptEl.textContent = '✗ Missed!';
        if(btn){ btn.disabled = true; btn.textContent = '⏳ Wait'; }
        if(pd.missed > pd.allowedMisses){ endPhase(false); return; }
        var stats = document.getElementById('drm-dodge-stats');
        if(stats) stats.textContent = pd.dodged + ' / ' + pd.target + ' dodged · ' + pd.missed + ' missed';
        pd.nextDodge = now + 1500 + Math.random()*1500;
      }
    }
  }

  function startManualRun(id){
    var d = DUNGEONS[id];
    if(!d || !d.phases) return;
    var check = canRun(id);
    if(!check.ok){
      if(typeof window.notify === 'function') window.notify(check.reason, 'kill');
      return;
    }
    // Pay cost
    if(d.cost.gold) window.G.gold -= d.cost.gold;
    /* b214 (exploit fix): consume the entry KEY, exactly as runDungeon() does.
       This was missing — manual phase-runs charged gold/tokens but never spent
       the key, so a single farmed key ran the dungeon forever (cooldown aside),
       which combined with guaranteed token drops to mint premium currency. */
    if(d.cost.key){
      if(typeof window.removeItem === 'function') window.removeItem(d.cost.key, 1);
      else window.G.inventory[d.cost.key] = Math.max(0, (window.G.inventory[d.cost.key]||0) - 1);
    }
    if(d.cost.hearth_token){
      if(typeof window.removeItem === 'function') window.removeItem('hearth_token', d.cost.hearth_token);
      else window.G.inventory.hearth_token = Math.max(0, (window.G.inventory.hearth_token||0) - d.cost.hearth_token);
    }
    ensureRunModal();
    runState = {
      dungeonId: id,
      phases: d.phases,
      phaseIdx: 0,
      phaseResults: [],
    };
    document.getElementById('dgn-run-overlay').classList.add('open');
    renderPhase();
  }
  window.startManualDungeonRun = startManualRun;

  console.log('[dungeons] system loaded — ' + Object.keys(DUNGEONS).length + ' instances (' + Object.values(DUNGEONS).filter(function(d){return d.phases;}).length + ' with manual phases)');
})();

// ────────────────────────────────────────────────────────────
// BoP key drops from regular combat. Certain monster families have
// a chance to drop the dungeon key matching their theme. Drop rates
// favor grinding the matching mob → spending the key on the dungeon.
// ────────────────────────────────────────────────────────────
(function setupKeyDrops(){
  var KEY_DROPS = {
    // Crypt of Bones — undead family
    weak_skeleton: { keyId: 'bone_key', chance: 0.025 },
    skeleton:      { keyId: 'bone_key', chance: 0.04  },
    zombie:        { keyId: 'bone_key', chance: 0.05  },
    // Goblin Warcamp — goblinoid family
    goblin:        { keyId: 'goblin_seal', chance: 0.02 },
    hobgoblin:     { keyId: 'goblin_seal', chance: 0.04 },
    goblin_brute:  { keyId: 'goblin_seal', chance: 0.06 },
    goblin_warlord:{ keyId: 'goblin_seal', chance: 0.10 },
    // Haunted Archive — magic users
    dark_wizard:   { keyId: 'arcane_tome', chance: 0.04 },
    warlock:       { keyId: 'arcane_tome', chance: 0.06 },
    archmage:      { keyId: 'arcane_tome', chance: 0.10 },
    // Obsidian Keep — heavy infantry / death-tier
    death_knight:    { keyId: 'obsidian_sigil', chance: 0.05 },
    warband_captain: { keyId: 'obsidian_sigil', chance: 0.07 },
    // Voidbringer — void/plague tier
    plague_swarm:   { keyId: 'void_fragment', chance: 0.05 },
    void_parasite:  { keyId: 'void_fragment', chance: 0.10 },
    // Ancient Wyrm — only the dragon itself
    dragon:         { keyId: 'dragonsbane_key', chance: 0.30 },
  };

  function trySpawnKeyDrop(monsterId){
    var entry = KEY_DROPS[monsterId];
    if(!entry) return;
    /* Through the SEEDED session stream (src/core/rng.js), not Math.random().
       This roll hangs off window.killMonster, so it is part of what a kill
       pays — and since the away unification an away kill comes through the
       same wrapper. A bare Math.random() here made the kill path only
       PARTIALLY replayable: the away-parity guard caught it immediately
       (identical seeds, identical drop tables, different key counts), which
       is exactly the kind of hidden nondeterminism that would have made a
       server-side accrual dispute impossible to adjudicate.
       Falls back to Math.random only if the core has not booted. */
    var C = window.HearthriseCore;
    var hit = (C && C.rng) ? C.rng.chance(entry.chance) : (Math.random() <= entry.chance);
    if(!hit) return;
    var keyItem = window.ITEMS && window.ITEMS[entry.keyId];
    var name = keyItem ? keyItem.n : entry.keyId;
    if(typeof window.addItem === 'function') window.addItem(entry.keyId, 1);
    else window.G.inventory[entry.keyId] = (window.G.inventory[entry.keyId]||0) + 1;
    if(typeof window.notify === 'function') window.notify('🔑 Rare drop: ' + name, 'levelup');
  }

  function hookKillMonster(){
    if(typeof window.killMonster !== 'function'){ setTimeout(hookKillMonster, 100); return; }
    if(window.__keyDropsHooked) return;
    window.__keyDropsHooked = true;
    var orig = window.killMonster;
    window.killMonster = function(m){
      var r = orig.apply(this, arguments);
      // Identify the monster id (m may be object or id)
      var mid = null;
      if(typeof m === 'string') mid = m;
      else if(m && m.id) mid = m.id;
      else if(window.G && window.G.activeMonster) mid = window.G.activeMonster;
      else if(m && window.MONSTERS){
        for(var k in window.MONSTERS){ if(window.MONSTERS[k] === m){ mid = k; break; } }
      }
      if(mid) trySpawnKeyDrop(mid);
      return r;
    };
    console.log('[dungeon-keys] hooked killMonster — ' + Object.keys(KEY_DROPS).length + ' mobs drop dungeon keys');
  }
  hookKillMonster();
})();
