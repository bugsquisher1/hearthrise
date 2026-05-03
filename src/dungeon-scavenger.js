// ============================================================
// src/dungeon-scavenger.js
//
// Scavenger-style dungeon runs. Player starts naked. They walk
// through 5 prep rooms, picking 1-2 tasks per room (chop wood,
// mine ore, smith axe, cook food, etc.). Each task's output tier
// rolls against the player's REAL skill level — high Smithing
// gives them a higher chance at a T4/T5 axe.
//
// At the end, the boss fight uses everything they assembled.
// They get one loot roll for every 10% of the boss's HP they
// take down. Maxing the boss = 10 rolls.
//
// IMPORTANT: gear/food/buffs assembled IN the dungeon are
// throwaway. They never enter the player's persistent inventory.
// Only the loot rolls from the boss fight come home.
// ============================================================

(function(){
  'use strict';

  // ── Scavenger configurations per dungeon ──
  // Each room has 2-3 task options. Repeats allowed but eat time.
  var SCAVENGER_CONFIGS = {
    crypt_of_bones: {
      timeBudgetS: 360,           // 6 min total budget
      bossHp: 1000,
      bossDps: 18,                // boss damage per second
      bossName: 'The Bone Lord',
      bossIcon: '💀',
      rooms: [
        {
          name: 'Twisted Grove', icon: '🌲',
          desc: 'Sturdy branches and herbs grow near the crypt entrance.',
          options: [
            { id: 'chop',   label: 'Chop a sturdy branch', icon: '🪓', durationS: 14,
              skill: 'woodcutting', produces: 'handle',
              hint: 'Wood handle quality scales with Woodcutting.' },
            { id: 'forage', label: 'Forage healing herbs',  icon: '🌿', durationS: 10,
              skill: 'farming', produces: 'herb',
              hint: 'Herb potency scales with Farming.' },
          ],
        },
        {
          name: 'Iron Vein', icon: '⛏️',
          desc: 'Veins of iron criss-cross the rock face.',
          options: [
            { id: 'mine',   label: 'Mine raw iron',     icon: '⛏️', durationS: 14,
              skill: 'mining', produces: 'ore',
              hint: 'Ore tier scales with Mining.' },
            { id: 'gem',    label: 'Search for a gem',  icon: '💎', durationS: 22,
              skill: 'mining', produces: 'gem',
              hint: 'Slower but adds crit chance to your axe.' },
          ],
        },
        {
          name: 'Abandoned Forge', icon: '🔥',
          desc: 'Old anvil. Old hammer. Old fires waking up.',
          options: [
            { id: 'smith_axe',   label: 'Smith axe (uses handle + ore)', icon: '⚔️', durationS: 18,
              skill: 'smithing', produces: 'axe', requires:['handle','ore'],
              hint: 'Final axe damage = (handle × ore × smithing) tiers.' },
            { id: 'smith_armor', label: 'Smith plate (uses ore)',         icon: '🛡️', durationS: 14,
              skill: 'smithing', produces: 'armor', requires:['ore'],
              hint: 'Plate defense scales with Smithing.' },
          ],
        },
        {
          name: 'Stream', icon: '🐟',
          desc: 'A small stream snakes through the catacombs.',
          options: [
            { id: 'fish', label: 'Catch a trout', icon: '🎣', durationS: 12,
              skill: 'fishing', produces: 'fish',
              hint: 'Fish quality scales with Fishing.' },
            { id: 'cook', label: 'Cook fish (uses fish)', icon: '🍳', durationS: 8,
              skill: 'cooking', produces: 'food', requires:['fish'],
              hint: 'Cooking turns the fish into a heal-over-time meal.' },
          ],
        },
        {
          name: 'Shrine', icon: '🕯️',
          desc: 'A weathered shrine. Press an offering for a blessing.',
          options: [
            { id: 'pray',  label: 'Pray for might',   icon: '🙏', durationS: 8,
              skill: 'prayer', produces: 'blessing_dmg',
              hint: 'Prayer adds a damage buff for the boss.' },
            { id: 'ward',  label: 'Pray for shield',  icon: '🛡️', durationS: 8,
              skill: 'prayer', produces: 'blessing_def',
              hint: 'Prayer adds a damage-reduction ward.' },
          ],
        },
      ],
    },
  };

  // ── Tier roll: skill 1 → mostly T1; skill 99 → mostly T4/T5 ──
  function rollTier(skillLv){
    skillLv = Math.max(1, Math.min(99, skillLv|0));
    var bias = (skillLv - 1) / 98; // 0..1
    // Weighted draw across 5 tiers, weighted toward higher tiers as bias grows.
    var w = [
      Math.max(0.05, 1 - bias * 0.8),  // T1
      0.5 + bias * 0.4,                 // T2
      0.2 + bias * 0.7,                 // T3
      0.05 + bias * 0.6,                // T4
      Math.max(0, bias * 0.4 - 0.1),    // T5 (only really feasible past skill 25)
    ];
    var total = w.reduce(function(a,b){return a+b;}, 0);
    var r = Math.random() * total;
    for(var i = 0; i < w.length; i++){
      r -= w[i];
      if(r <= 0) return i + 1;
    }
    return 1;
  }

  // ── Compute outcome stats from accumulated run inventory ──
  // Returns {dmgPerHit, defense, healPerHit, dmgBuffPct, defBuffPct, critPct}
  function buildLoadout(runInv){
    var L = { dmgPerHit: 6, defense: 0, healPerHit: 0, dmgBuffPct: 0, defBuffPct: 0, critPct: 0, axeQuality: 'fists' };
    // Axe = handle.tier × ore.tier × smith.tier (all from same craft chain)
    if(runInv.axe){
      var axeT = runInv.axe.tier;
      var components = (runInv.axe.components || []).join(', ');
      L.dmgPerHit = 8 + axeT * 7;       // T1=15, T5=43
      L.axeQuality = 'T' + axeT + ' axe (' + components + ')';
    }
    if(runInv.armor){
      L.defense = runInv.armor.tier * 4; // T1=4, T5=20 dr
    }
    if(runInv.gem){
      L.critPct = 5 + runInv.gem.tier * 5; // T1=10%, T5=30%
    }
    if(runInv.food){
      L.healPerHit = runInv.food.tier * 3; // T1=3, T5=15 hp/hit
    }
    if(runInv.herb){
      L.healPerHit += runInv.herb.tier * 2; // stacks small
    }
    if(runInv.blessing_dmg){
      L.dmgBuffPct = runInv.blessing_dmg.tier * 0.08; // T1=8%, T5=40%
    }
    if(runInv.blessing_def){
      L.defBuffPct = runInv.blessing_def.tier * 0.07;
    }
    return L;
  }

  // ── State ──
  var run = null;

  // Master clock — ticks continuously while a run modal is open. Ensures
  // the time-left readout in the status bar updates every 100ms even
  // while the player is just looking at room options.
  function masterTick(){
    if(!run) return;
    var now = Date.now();
    var dt = now - (run.lastClockAt || now);
    run.lastClockAt = now;
    // Don't double-decrement during a task; the task interval handles it.
    if(!run.taskTimer && !run.tickTimer){
      run.timeLeftMs = Math.max(0, run.timeLeftMs - dt);
    }
    // Refresh the time readout if it's on screen
    var el = document.querySelector('#scv-modal .scv-status-time b');
    if(el){ el.textContent = Math.max(0, Math.ceil(run.timeLeftMs / 1000)) + 's'; }
    // If we hit zero outside of a task/boss, auto-engage boss
    if(run.timeLeftMs <= 0 && !run.tickTimer && !run.taskTimer && !run.boss){
      startBoss();
    }
  }
  setInterval(masterTick, 100);

  function ensureModal(){
    if(document.getElementById('scv-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'scv-overlay';
    ov.className = 'scv-overlay';
    ov.innerHTML = '<div class="scv-modal" id="scv-modal"></div>';
    document.body.appendChild(ov);
  }

  function close(){
    var ov = document.getElementById('scv-overlay');
    if(ov) ov.classList.remove('open');
    if(run){
      if(run.taskTimer) clearInterval(run.taskTimer);
      if(run.tickTimer) clearInterval(run.tickTimer);
    }
    run = null;
  }
  window.closeScavengerRun = close;

  // Top status bar with time-left + accumulated kit
  function statusBarHtml(){
    var timeLeft = Math.max(0, Math.ceil(run.timeLeftMs / 1000));
    var inv = run.inv;
    var pieces = [];
    var keyOrder = ['axe','armor','gem','food','herb','blessing_dmg','blessing_def','handle','ore','fish'];
    keyOrder.forEach(function(k){
      if(inv[k]){
        var label = ({
          axe:'Axe', armor:'Plate', gem:'Gem', food:'Meal', herb:'Herb',
          blessing_dmg:'Might', blessing_def:'Ward',
          handle:'Handle', ore:'Ore', fish:'Fish',
        })[k] || k;
        pieces.push('<span class="scv-kit-item scv-tier-' + inv[k].tier + '">' + label + ' T' + inv[k].tier + '</span>');
      }
    });
    if(!pieces.length) pieces.push('<span class="scv-kit-empty">naked &amp; unarmed</span>');
    return '<div class="scv-status">' +
      '<div class="scv-status-time"><span class="scv-time-icon">⏱️</span><b>' + timeLeft + 's</b></div>' +
      '<div class="scv-status-kit">' + pieces.join('') + '</div>' +
    '</div>';
  }

  // Free-form lobby: every task across every room is listed at once.
  // Player picks any one, spends the time, returns here. Re-pick the same
  // task as many times as time allows. "Engage boss" always available.
  function renderRoom(){
    var modal = document.getElementById('scv-modal');
    if(!modal) return;

    // Group all rooms' options into a single list, tagged with room.
    var groupsHtml = run.config.rooms.map(function(room, rIdx){
      var optsHtml = room.options.map(function(opt, oIdx){
        var lv = (typeof window.getLevel === 'function') ? window.getLevel(opt.skill) : 1;
        var disabled = false, reason = '';
        if(opt.requires){
          for(var j = 0; j < opt.requires.length; j++){
            if(!run.inv[opt.requires[j]]){ disabled = true; reason = 'Need ' + opt.requires[j].toUpperCase(); break; }
          }
        }
        if(opt.durationS * 1000 > run.timeLeftMs){ disabled = true; reason = 'Not enough time'; }
        return '<button class="scv-opt' + (disabled ? ' disabled' : '') + '" data-room="' + rIdx + '" data-opt="' + oIdx + '" ' + (disabled ? 'disabled' : '') + '>' +
          '<div class="scv-opt-head">' +
            '<span class="scv-opt-icon">' + opt.icon + '</span>' +
            '<span class="scv-opt-label">' + opt.label + '</span>' +
          '</div>' +
          '<div class="scv-opt-meta">' +
            '<span class="scv-opt-time">' + opt.durationS + 's</span>' +
            (opt.skill ? ' · <span class="scv-opt-skill">' + opt.skill + ' Lv ' + lv + '</span>' : '') +
          '</div>' +
          '<div class="scv-opt-hint">' + (disabled && reason ? '⚠ ' + reason : opt.hint) + '</div>' +
        '</button>';
      }).join('');
      return '<div class="scv-room-group">' +
          '<h4 class="scv-room-group-title"><span>' + room.icon + '</span> ' + room.name + '<small>' + room.desc + '</small></h4>' +
          '<div class="scv-opts">' + optsHtml + '</div>' +
        '</div>';
    }).join('');

    var bossHtml = '<button class="scv-boss-now" data-boss="1">⚔ Engage boss now (' + run.config.bossName + ')</button>';
    var hintHtml = '<div class="scv-lobby-hint">Repeat tasks for better tier rolls. The clock keeps ticking — leave enough time to fight ' + run.config.bossName + '.</div>';

    modal.innerHTML =
      '<button class="scv-close">✕</button>' +
      statusBarHtml() +
      '<div class="scv-lobby-head">' +
        '<h3>Prep your run — ' + run.config.bossName + '</h3>' +
        hintHtml +
      '</div>' +
      groupsHtml +
      '<div class="scv-room-actions">' + bossHtml + '</div>';

    modal.querySelector('.scv-close').addEventListener('click', close);
    modal.querySelectorAll('button.scv-opt[data-opt]').forEach(function(b){
      b.addEventListener('click', function(){
        var rIdx = parseInt(this.dataset.room, 10);
        var oIdx = parseInt(this.dataset.opt, 10);
        run.roomIdx = rIdx;  // tracked so the result/animation can show the right room
        doOption(oIdx);
      });
    });
    var bossBtn = modal.querySelector('button.scv-boss-now');
    if(bossBtn) bossBtn.addEventListener('click', startBoss);
  }

  function doOption(optIdx){
    var room = run.config.rooms[run.roomIdx];
    var opt = room.options[optIdx];
    if(!opt) return;
    var modal = document.getElementById('scv-modal');
    var startedAt = Date.now();
    var durationMs = opt.durationS * 1000;

    modal.innerHTML =
      '<button class="scv-close">✕</button>' +
      statusBarHtml() +
      '<div class="scv-room-head">' +
        '<span class="scv-room-icon">' + opt.icon + '</span>' +
        '<div>' +
          '<h3>' + opt.label + '</h3>' +
          '<div class="scv-room-desc">' + opt.hint + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="scv-task">' +
        '<div class="scv-task-bar"><i id="scv-task-fill" style="width:0%"></i></div>' +
        '<div class="scv-task-text" id="scv-task-text">Working…</div>' +
      '</div>';
    modal.querySelector('.scv-close').addEventListener('click', close);

    if(run.taskTimer) clearInterval(run.taskTimer);
    run.taskTimer = setInterval(function(){
      var elapsed = Date.now() - startedAt;
      var pct = Math.min(1, elapsed / durationMs);
      run.timeLeftMs = Math.max(0, run.timeLeftMs - 100);
      var fill = document.getElementById('scv-task-fill');
      if(fill) fill.style.width = (pct * 100).toFixed(1) + '%';
      if(pct >= 1){
        clearInterval(run.taskTimer); run.taskTimer = null;
        finishOption(opt);
      }
      if(run.timeLeftMs <= 0){
        clearInterval(run.taskTimer); run.taskTimer = null;
        startBoss();
      }
    }, 100);
  }

  function finishOption(opt){
    // Snapshot component tiers BEFORE we consume them — chain crafts
    // (axe, food) need to know the tier of each input.
    var consumedTiers = {};
    if(opt.requires){
      opt.requires.forEach(function(req){
        consumedTiers[req] = (run.inv[req] && run.inv[req].tier) || 1;
        delete run.inv[req];
      });
    }
    // Roll the new item's tier from the relevant skill
    var lv = (typeof window.getLevel === 'function') ? window.getLevel(opt.skill) : 1;
    var tier = rollTier(lv);
    if(opt.produces === 'axe'){
      var handleT = consumedTiers.handle || 1;
      var oreT = consumedTiers.ore || 1;
      var smithT = tier;
      var finalT = Math.round((handleT + oreT + smithT) / 3);
      run.inv.axe = { tier: finalT, components: ['handle T'+handleT, 'ore T'+oreT, 'smith T'+smithT] };
      tier = finalT; // for the result screen
    } else if(opt.produces === 'food'){
      var fishT = consumedTiers.fish || 1;
      var cookT = tier;
      var finalT = Math.round((fishT + cookT) / 2);
      run.inv.food = { tier: finalT, components: ['fish T'+fishT, 'cook T'+cookT] };
      tier = finalT;
    } else if(opt.produces === 'armor'){
      var armorOreT = consumedTiers.ore || 1;
      var smithArmT = tier;
      var finalT = Math.round((armorOreT + smithArmT) / 2);
      run.inv.armor = { tier: finalT, components: ['ore T'+armorOreT, 'smith T'+smithArmT] };
      tier = finalT;
    } else {
      run.inv[opt.produces] = { tier: tier };
    }
    // Show the result for ~1.4s then move on
    var modal = document.getElementById('scv-modal');
    var name = ({
      handle:'Wood handle', ore:'Iron ore', axe:'Axe', armor:'Plate', gem:'Gem',
      fish:'Fish', food:'Cooked meal', herb:'Healing herb',
      blessing_dmg:'Might blessing', blessing_def:'Ward blessing',
    })[opt.produces] || opt.produces;
    modal.innerHTML =
      '<button class="scv-close">✕</button>' +
      statusBarHtml() +
      '<div class="scv-result scv-tier-' + tier + '">' +
        '<div class="scv-result-icon">' + opt.icon + '</div>' +
        '<div class="scv-result-text">' +
          '<div>You crafted</div>' +
          '<h2>' + name + ' <span class="scv-tier-tag">T' + tier + '</span></h2>' +
        '</div>' +
      '</div>';
    modal.querySelector('.scv-close').addEventListener('click', close);
    setTimeout(function(){
      // Free-form lobby: just go back to the task list. Player can pick
      // any task again until they engage the boss or run out of time.
      if(run.timeLeftMs <= 0) startBoss();
      else renderRoom();
    }, 1400);
  }

  function startBoss(){
    if(run.taskTimer){ clearInterval(run.taskTimer); run.taskTimer = null; }
    var loadout = buildLoadout(run.inv);
    var bossMaxHp = run.config.bossHp;
    var bossHp = bossMaxHp;
    var bossDps = run.config.bossDps;
    var playerMaxHp = 100 + (typeof window.getLevel === 'function' ? window.getLevel('hitpoints') * 5 : 0);
    var playerHp = playerMaxHp;
    var lootRolls = 0;
    var lastRollPct = 1.0;
    var awarded = [];
    var startedAt = Date.now();
    var lastTickAt = Date.now();
    run.boss = {
      hp: bossHp, maxHp: bossMaxHp, lootRolls: 0, awarded: awarded,
    };

    function rollOneLoot(){
      var d = window.DUNGEONS && window.DUNGEONS[run.dungeonId];
      if(!d) return;
      // Pick one drop weighted by chance from the loot table.
      var entries = (d.loot || []).slice();
      // Weight = chance; shuffle and pick first that hits its chance.
      entries.sort(function(){ return Math.random() - 0.5; });
      for(var i = 0; i < entries.length; i++){
        var e = entries[i];
        if(Math.random() <= e.chance){
          var qty = e.qty[0] + Math.floor(Math.random() * (e.qty[1] - e.qty[0] + 1));
          awarded.push({ id: e.id, qty: qty });
          return;
        }
      }
    }

    function renderBoss(){
      var modal = document.getElementById('scv-modal');
      if(!modal) return;
      var foePct = (bossHp / bossMaxHp * 100);
      var youPct = (playerHp / playerMaxHp * 100);
      var rewardList = awarded.length ? awarded.map(function(a){
        var item = window.ITEMS && window.ITEMS[a.id];
        return '<span class="scv-roll-row">' + (item?item.icon:'📦') + ' +' + a.qty + ' ' + (item?item.n:a.id) + '</span>';
      }).join('') : '<span class="scv-roll-empty">no rolls yet</span>';
      modal.innerHTML =
        '<button class="scv-close">✕</button>' +
        '<div class="scv-boss">' +
          '<div class="scv-boss-vs">' +
            '<div class="scv-fighter scv-foe">' +
              '<div class="scv-fighter-icon">' + run.config.bossIcon + '</div>' +
              '<div class="scv-fighter-name">' + run.config.bossName + '</div>' +
              '<div class="scv-hp-bar"><i style="width:' + foePct + '%"></i></div>' +
              '<div class="scv-hp-text">' + Math.max(0, bossHp).toFixed(0) + ' / ' + bossMaxHp + '</div>' +
            '</div>' +
            '<div class="scv-vs">VS</div>' +
            '<div class="scv-fighter scv-you">' +
              '<div class="scv-fighter-icon">🧙</div>' +
              '<div class="scv-fighter-name">You</div>' +
              '<div class="scv-hp-bar"><i style="width:' + youPct + '%"></i></div>' +
              '<div class="scv-hp-text">' + Math.max(0, playerHp).toFixed(0) + ' / ' + playerMaxHp + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="scv-loadout">' +
            '<div class="scv-load-row"><span>⚔ DMG</span><b>' + loadout.dmgPerHit.toFixed(1) + '/hit' + (loadout.dmgBuffPct ? ' (+' + (loadout.dmgBuffPct*100).toFixed(0) + '%)' : '') + '</b></div>' +
            '<div class="scv-load-row"><span>🛡 DEF</span><b>' + loadout.defense.toFixed(1) + (loadout.defBuffPct ? ' (+' + (loadout.defBuffPct*100).toFixed(0) + '%)' : '') + '</b></div>' +
            '<div class="scv-load-row"><span>💥 CRIT</span><b>' + loadout.critPct.toFixed(0) + '%</b></div>' +
            '<div class="scv-load-row"><span>❤ HEAL</span><b>' + loadout.healPerHit.toFixed(1) + '/hit</b></div>' +
            '<div class="scv-load-row"><span>🪓 KIT</span><b>' + loadout.axeQuality + '</b></div>' +
          '</div>' +
          '<div class="scv-rolls"><h4>Loot rolls (' + lootRolls + ' / 10)</h4>' + rewardList + '</div>' +
        '</div>';
      modal.querySelector('.scv-close').addEventListener('click', close);
    }

    renderBoss();

    if(run.tickTimer) clearInterval(run.tickTimer);
    run.tickTimer = setInterval(function(){
      var now = Date.now();
      var dt = (now - lastTickAt) / 1000;
      lastTickAt = now;

      // Player attack: 1 hit per second of "real" tick. Apply crit + buff.
      var hit = loadout.dmgPerHit * (1 + loadout.dmgBuffPct);
      if(Math.random() < loadout.critPct / 100) hit *= 1.5;
      bossHp = Math.max(0, bossHp - hit * dt);

      // Boss attack
      var incoming = bossDps * (1 - Math.min(0.7, loadout.defense / 100 + loadout.defBuffPct));
      playerHp = Math.max(0, playerHp - incoming * dt);
      // Heal-on-hit
      playerHp = Math.min(playerMaxHp, playerHp + loadout.healPerHit * dt);

      // Loot rolls per 10% boss HP loss
      var pct = bossHp / bossMaxHp;
      while(lastRollPct - pct >= 0.10 && lootRolls < 10){
        rollOneLoot();
        lootRolls++;
        lastRollPct -= 0.10;
      }

      renderBoss();

      if(bossHp <= 0){
        clearInterval(run.tickTimer); run.tickTimer = null;
        // Final cleanup roll if exactly 100% killed
        showResult(true);
      } else if(playerHp <= 0){
        clearInterval(run.tickTimer); run.tickTimer = null;
        showResult(false);
      }
    }, 100);

    function showResult(victory){
      var modal = document.getElementById('scv-modal');
      // Apply ONLY the boss-fight loot. Run-only kit is discarded.
      awarded.forEach(function(a){
        if(typeof window.addItem === 'function') window.addItem(a.id, a.qty);
        else window.G.inventory[a.id] = (window.G.inventory[a.id]||0) + a.qty;
      });
      // Manual scavenger runs do NOT impose a cooldown — players who put in
      // the time/effort can keep running. Only the auto-run path stamps lastRun.
      var rewardHtml = awarded.length ? awarded.map(function(a){
        var item = window.ITEMS && window.ITEMS[a.id];
        return '<div class="scv-reward-row">' + (item?item.icon:'📦') + ' +' + a.qty + ' <b>' + (item?item.n:a.id) + '</b></div>';
      }).join('') : '<div class="scv-empty">No rolls earned. Try a different loadout.</div>';
      modal.innerHTML =
        '<button class="scv-close">✕</button>' +
        '<div class="scv-summary">' +
          '<h2 class="scv-summary-title ' + (victory ? 'win' : 'lose') + '">' + (victory ? '🏆 VICTORY' : '💀 DEFEATED') + '</h2>' +
          '<div class="scv-summary-sub">' + lootRolls + ' loot roll' + (lootRolls===1?'':'s') + ' earned (' + ((1 - bossHp/bossMaxHp)*100).toFixed(0) + '% boss HP)</div>' +
          '<div class="scv-summary-note">Gear and food assembled in the dungeon were left behind.</div>' +
          '<div class="scv-rewards-block"><h4>Loot brought home</h4>' + rewardHtml + '</div>' +
          '<button class="scv-finish">Claim</button>' +
        '</div>';
      modal.querySelector('.scv-close').addEventListener('click', close);
      modal.querySelector('.scv-finish').addEventListener('click', function(){
        close();
        if(typeof window.renderDungeons === 'function') window.renderDungeons();
        if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
        if(typeof window.updateTopbar === 'function') window.updateTopbar();
        if(typeof window.notify === 'function') window.notify((victory?'Cleared ':'Survived ') + run.config.bossName + ': ' + awarded.length + ' rewards', victory ? 'levelup' : 'kill');
      });
    }
  }

  // Public entry: start a scavenger run for the given dungeon id.
  // Returns true if started, false if not (no config / can't afford / underleveled).
  // NOTE: Manual scavenger runs DO NOT have a cooldown — only the auto-run
  // does. We deliberately bypass canRunDungeon's cooldown check here and roll
  // our own gate for level + cost.
  window.startScavengerRun = function(dungeonId){
    var cfg = SCAVENGER_CONFIGS[dungeonId];
    if(!cfg){ return false; }
    var d = window.DUNGEONS && window.DUNGEONS[dungeonId];
    if(!d){ return false; }
    var lv = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
    if(lv < d.reqLv){
      if(typeof window.notify === 'function') window.notify('Combat Lv ' + d.reqLv + ' required (you are ' + lv + ')', 'kill');
      return false;
    }
    if(d.cost.key){
      var keyItem = window.ITEMS && window.ITEMS[d.cost.key];
      var keyName = keyItem ? keyItem.n : d.cost.key;
      if((window.G.inventory[d.cost.key] || 0) < 1){
        if(typeof window.notify === 'function') window.notify('Need a ' + keyName, 'kill');
        return false;
      }
    }
    if(d.cost.gold && (window.G.gold || 0) < d.cost.gold){
      if(typeof window.notify === 'function') window.notify('Need ' + d.cost.gold + ' gold', 'kill');
      return false;
    }
    if(d.cost.hearth_token && (window.G.inventory.hearth_token || 0) < d.cost.hearth_token){
      if(typeof window.notify === 'function') window.notify('Need ' + d.cost.hearth_token + ' Hearth Tokens', 'kill');
      return false;
    }
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
    ensureModal();
    run = {
      dungeonId: dungeonId,
      config: cfg,
      roomIdx: 0,
      timeLeftMs: cfg.timeBudgetS * 1000,
      inv: {},
      consumed: {},
      lastClockAt: Date.now(),
    };
    document.getElementById('scv-overlay').classList.add('open');
    renderRoom();
    return true;
  };

  // Expose configs so dungeons.js render can swap the manual button
  // to a "Scavenger Run" if a config exists.
  window.SCAVENGER_CONFIGS = SCAVENGER_CONFIGS;

  console.log('[scavenger] system loaded — ' + Object.keys(SCAVENGER_CONFIGS).length + ' configs');
})();
