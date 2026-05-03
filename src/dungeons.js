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
      desc: 'A small crypt swarming with skeletons. Decent way to farm bones and a chance at a blueprint.',
      loot: [
        { id: 'big_bones', qty: [10, 30], chance: 1.0 },
        { id: 'grave_dust', qty: [1, 3], chance: .85 },
        { id: 'kitchen_blueprint_t2', qty: [1, 1], chance: .12 },
        { id: 'hearth_token', qty: [1, 3], chance: 1.0 },
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
      desc: 'Sack the warcamp. Expect heavy resistance and a forge blueprint if you survive.',
      loot: [
        { id: 'goblin_totem', qty: [3, 8], chance: 1.0 },
        { id: 'warlord_badge', qty: [1, 2], chance: .35 },
        { id: 'forge_blueprint_t2', qty: [1, 1], chance: .15 },
        { id: 'hearth_token', qty: [2, 5], chance: 1.0 },
      ],
      phases: [
        { type:'gather', label:'Sneak past patrols', icon:'👁️', target: 10, durationS: 30,
          desc: 'Tap each green window the moment a patrol turns away.' },
        { type:'dodge', label:'Trap corridor', icon:'⚠️', target: 5, durationS: 40,
          desc: 'Dodge swinging blades — click DODGE when the prompt flashes.' },
        { type:'fight', label:'Warlord brawl', icon:'⚔️', enemyHp: 120, durationS: 90,
          desc: 'Time attacks on the beat to break the warlord.' },
      ],
    },
    haunted_archive: {
      name: 'Haunted Archive', icon: '📚', kind: 'dungeon',
      reqLv: 45, cost: { key: 'arcane_tome' },
      duration: 120,
      cooldownH: 8,
      desc: 'A library long abandoned. Cursed tomes — and a chance at the Library blueprint.',
      loot: [
        { id: 'magic_essence', qty: [5, 12], chance: 1.0 },
        { id: 'cracked_spellstone', qty: [1, 3], chance: .60 },
        { id: 'library_blueprint_t2', qty: [1, 1], chance: .15 },
        { id: 'hearth_token', qty: [3, 8], chance: 1.0 },
      ],
      phases: [
        { type:'puzzle', label:'Decipher the codex', icon:'📖',
          question: 'Three runes glow in sequence: ☀️ 🌙 ⭐. What completes the cycle?',
          options: ['🌑 Dark', '⭐ Star', '☀️ Sun', '🌙 Moon'],
          correct: 0,
          desc: 'A clever librarian sees the pattern.' },
        { type:'gather', label:'Bind loose pages', icon:'📜', target: 12, durationS: 35,
          desc: 'Pages flutter past — collect each one before they vanish.' },
        { type:'fight', label:'Spectral guardian', icon:'👻', enemyHp: 180, durationS: 100,
          desc: 'Time attacks while the guardian phase-shifts.' },
      ],
    },

    // ---- Raids (party content, currently solo-simulated) ----
    obsidian_keep: {
      name: 'Obsidian Keep', icon: '🏰', kind: 'raid',
      reqLv: 65, cost: { key: 'obsidian_sigil' },
      duration: 240,
      cooldownH: 24,
      partySize: 4,
      desc: 'Storm the keep with your party. T3 housing blueprints drop here.',
      loot: [
        { id: 'death_steel', qty: [1, 3], chance: 1.0 },
        { id: 'kitchen_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'forge_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'trophy_blueprint_t2', qty: [1, 1], chance: .25 },
        { id: 'hearth_token', qty: [10, 20], chance: 1.0 },
      ],
      phases: [
        { type:'gather', label:'Scale the walls', icon:'🧗', target: 15, durationS: 40,
          desc: 'Click each handhold as it stabilizes.' },
        { type:'dodge', label:'Cannon barrage', icon:'💥', target: 8, durationS: 60,
          desc: 'Dodge incoming cannonfire.' },
        { type:'fight', label:'Throne room', icon:'👑', enemyHp: 320, durationS: 140,
          desc: 'The keep lord brings dark magic. Coordinate attacks.' },
      ],
    },
    voidbringer: {
      name: 'The Voidbringer', icon: '🌌', kind: 'raid',
      reqLv: 80, cost: { key: 'void_fragment' },
      duration: 360,
      cooldownH: 24,
      partySize: 4,
      desc: 'Rifts open in the sky. This boss drops the rarest crafting materials.',
      loot: [
        { id: 'void_chitin', qty: [1, 4], chance: 1.0 },
        { id: 'void_core', qty: [1, 2], chance: .35 },
        { id: 'void_essence', qty: [1, 1], chance: .25 },
        { id: 'library_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'hearth_token', qty: [15, 30], chance: 1.0 },
      ],
    },

    // ---- World Bosses ----
    ancient_wyrm: {
      name: 'Ancient Wyrm', icon: '🐲', kind: 'worldboss',
      reqLv: 95, cost: { key: 'dragonsbane_key' },
      duration: 600,
      cooldownH: 72,
      partySize: 24,
      desc: 'The greatest dragon yet seen. Brings legendary cosmetics. Resets weekly.',
      loot: [
        { id: 'dragon_scale', qty: [3, 8], chance: 1.0 },
        { id: 'dragon_bones', qty: [2, 5], chance: 1.0 },
        { id: 'dragon_gem', qty: [1, 1], chance: .30 },
        { id: 'dragon_relic', qty: [1, 1], chance: .15 },
        { id: 'trophy_blueprint_t3', qty: [1, 1], chance: .10 },
        { id: 'hearth_token', qty: [40, 80], chance: 1.0 },
      ],
    },
  };
  window.DUNGEONS = DUNGEONS;

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
    if(d.cost.gold && (window.G.gold || 0) < d.cost.gold) return { ok: false, reason: 'Need ' + d.cost.gold + ' gold' };
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

  // ---- Render the Dungeons tab ----
  function renderDungeons(){
    var panel = document.getElementById('panel-dungeons');
    if(!panel) return;
    ensureState();
    var grouped = { dungeon: [], raid: [], worldboss: [] };
    Object.entries(DUNGEONS).forEach(function(kv){ grouped[kv[1].kind].push([kv[0], kv[1]]); });
    var sectionLabel = { dungeon: 'Dungeons (Solo)', raid: 'Raids (Party of 4)', worldboss: 'World Bosses (24-player)' };
    var html = '';
    ['dungeon','raid','worldboss'].forEach(function(kind){
      if(!grouped[kind].length) return;
      html += '<div class="dgn-section"><h3>' + sectionLabel[kind] + '</h3><div class="dgn-grid">';
      grouped[kind].forEach(function(entry){
        var id = entry[0], d = entry[1];
        var check = canRun(id);
        var lootHtml = (d.loot||[]).map(function(l){
          var item = window.ITEMS && window.ITEMS[l.id];
          var icon = item && item.icon ? item.icon : '📦';
          var bopTag = item && item.bop ? '<span class="dgn-bop">BoP</span>' : '';
          return '<div class="dgn-loot" title="' + (item ? item.n : l.id) + '">' + icon + ' ' + (l.qty[0] === l.qty[1] ? l.qty[0] : l.qty[0]+'-'+l.qty[1]) + 'x ' + bopTag + '</div>';
        }).join('');
        var costStr;
        if(d.cost.key){
          var ki = window.ITEMS && window.ITEMS[d.cost.key];
          var owned = (window.G && window.G.inventory && window.G.inventory[d.cost.key]) || 0;
          costStr = '1× ' + (ki ? ki.icon + ' ' + ki.n : d.cost.key) + ' <span class="dgn-key-stock">(have ' + owned + ')</span>';
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
              '<div class="dgn-icon">' + d.icon + '</div>' +
              '<div class="dgn-title">' +
                '<div class="dgn-name">' + d.name + '</div>' +
                '<div class="dgn-meta">Lv ' + d.reqLv + (d.partySize ? ' · ' + d.partySize + ' players' : '') + ' · ' + d.cooldownH + 'h cooldown</div>' +
              '</div>' +
            '</div>' +
            '<div class="dgn-desc">' + d.desc + '</div>' +
            '<div class="dgn-loot-row">' + lootHtml + '</div>' +
            '<div class="dgn-foot">' +
              '<div class="dgn-cost">Entry: <b>' + costStr + '</b></div>' +
              (function(){
                // Manual runs ignore the auto-run cooldown — only block them
                // for level/cost reasons. Auto-run still blocks on cooldown.
                var hasManual = !!(d.phases || (window.SCAVENGER_CONFIGS && window.SCAVENGER_CONFIGS[id]));
                var lvOk = (typeof window.getCombatLevel === 'function') ? (window.getCombatLevel() >= d.reqLv) : true;
                var goldOk = !d.cost.gold || (window.G && (window.G.gold||0) >= d.cost.gold);
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

  // ---- Inject the Dungeons sidebar nav + panel ----
  function injectNav(){
    var sidebar = document.getElementById('sidebar');
    if(!sidebar || sidebar.querySelector('[data-tab=dungeons]')) return;
    var combatBtn = sidebar.querySelector('[data-tab=combat]');
    if(!combatBtn) return;
    var btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-tab', 'dungeons');
    btn.innerHTML = '<span class="ic">🏰</span><span class="lbl">Dungeons</span>';
    btn.addEventListener('click', function(){ if(typeof window.showTab === 'function') window.showTab('dungeons'); });
    combatBtn.parentNode.insertBefore(btn, combatBtn.nextSibling);
  }
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
    var orig = window.showTab;
    if(typeof orig !== 'function') { setTimeout(wireShowTab, 100); return; }
    if(window.__dungeonsTabHooked) return;
    window.__dungeonsTabHooked = true;
    window.showTab = function(name){
      var r = orig.apply(this, arguments);
      if(name === 'dungeons') setTimeout(renderDungeons, 0);
      return r;
    };
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){ injectNav(); injectPanel(); wireShowTab(); }, 50);
  });
  if(document.readyState !== 'loading'){
    setTimeout(function(){ injectNav(); injectPanel(); wireShowTab(); }, 50);
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
      // BoP items get an extra chance bump in manual runs
      if(window.ITEMS && window.ITEMS[roll.id] && window.ITEMS[roll.id].bop){
        rollChance = Math.min(1, rollChance + bonusBopChance);
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
    if(Math.random() > entry.chance) return;
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
