// ============================================================
// src/admin.js — hidden dev panel for Tyler + Claude
//
// Activation:
//   • URL flag: append ?admin=1 to the URL, OR
//   • Keyboard: Ctrl+Shift+A while playing, OR
//   • localStorage key 'hearthrise:admin' set to '1' (sticky after first opt-in)
//
// Loads as a CLASSIC script after legacy.js. Never registers anything that
// affects regular play unless the user actively clicks an admin button.
// ============================================================

(function(){
  'use strict';

  // -- Activation gate --
  var url = new URL(location.href);
  var optIn = url.searchParams.get('admin') === '1' ||
              localStorage.getItem('hearthrise:admin') === '1';
  if(url.searchParams.get('admin') === '1'){
    localStorage.setItem('hearthrise:admin', '1');
  }
  if(url.searchParams.get('admin') === '0'){
    localStorage.removeItem('hearthrise:admin');
    return;
  }

  // Keyboard toggle still works even without opt-in (you have to know it)
  window.addEventListener('keydown', function(e){
    if(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a'){
      e.preventDefault();
      togglePanel();
    }
  });

  if(!optIn) return;

  // -- Inject CSS --
  var css = document.createElement('style');
  css.id = 'admin-css';
  css.textContent = `
    #admin-toggle {
      position: fixed; top: 8px; right: 8px; z-index: 100000;
      background: linear-gradient(180deg,#3a2010,#1a0d05);
      color: #f3d181; border: 1px solid #c9a040;
      padding: 6px 10px; border-radius: 6px;
      font-family: monospace; font-size: 11px; font-weight: 700;
      cursor: pointer; letter-spacing: .06em; text-transform: uppercase;
      box-shadow: 0 4px 12px rgba(0,0,0,.5);
    }
    #admin-toggle:hover { filter: brightness(1.2); }
    #admin-panel {
      position: fixed; top: 50px; right: 8px; z-index: 99999;
      width: 380px; max-height: 80vh; overflow-y: auto;
      background: linear-gradient(180deg,#0d0a14,#08060e);
      color: #d0d4de; border: 1px solid #c9a040;
      border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,.7);
      font-family: 'Inter',sans-serif; font-size: 12px;
      display: none;
    }
    #admin-panel.open { display: block; }
    #admin-panel h3 {
      font-family: monospace; font-size: 11px; font-weight: 800;
      margin: 0; padding: 10px 14px;
      background: linear-gradient(180deg,#3a2010,#1a0d05);
      color: #f3d181; border-bottom: 1px solid rgba(243,209,129,.25);
      letter-spacing: .12em; text-transform: uppercase;
    }
    #admin-panel .ap-section {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    #admin-panel .ap-section h4 {
      margin: 0 0 8px; font-size: 10px; font-weight: 800;
      color: #f3d181; letter-spacing: .14em; text-transform: uppercase;
    }
    #admin-panel button.ap-btn {
      background: rgba(243,209,129,.12); color: #f3d181;
      border: 1px solid rgba(243,209,129,.3);
      padding: 4px 8px; margin: 2px 4px 2px 0;
      border-radius: 4px; font-size: 11px; font-family: monospace;
      cursor: pointer;
    }
    #admin-panel button.ap-btn:hover { background: rgba(243,209,129,.22); }
    #admin-panel button.ap-btn.danger {
      background: rgba(227,97,97,.12); color: #ff8c8c;
      border-color: rgba(227,97,97,.4);
    }
    #admin-panel input, #admin-panel select {
      background: rgba(0,0,0,.4); color: #d0d4de;
      border: 1px solid rgba(255,255,255,.1);
      padding: 4px 6px; font-size: 11px; font-family: monospace;
      border-radius: 3px; box-sizing: border-box;
    }
    #admin-panel input { width: 70px; }
    #admin-panel input.wide { width: 140px; }
    #admin-panel label { font-size: 11px; color: #9aa3b0; margin-right: 6px; }
    #admin-panel pre {
      background: rgba(0,0,0,.4); padding: 6px; font-size: 10px;
      max-height: 120px; overflow: auto; border-radius: 3px;
      color: #5fcc7c; font-family: monospace;
    }
    #admin-panel .ap-row { margin: 4px 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  `;
  document.head.appendChild(css);

  // -- Inject toggle button --
  var toggle = document.createElement('button');
  toggle.id = 'admin-toggle';
  toggle.textContent = '⚙ Admin';
  toggle.addEventListener('click', togglePanel);
  document.body.appendChild(toggle);

  // -- Panel container --
  var panel = document.createElement('div');
  panel.id = 'admin-panel';
  document.body.appendChild(panel);

  function togglePanel(){
    if(!document.getElementById('admin-panel')) return;
    panel.classList.toggle('open');
    if(panel.classList.contains('open')) renderPanel();
  }

  // -- Helpers --
  function notify(msg){
    if(typeof window.notify === 'function') return window.notify(msg, 'info');
    console.log('[admin]', msg);
  }
  function refreshUI(){
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    if(typeof window.renderProfile === 'function') window.renderProfile();
    if(typeof window.renderInvNew === 'function') window.renderInvNew();
    if(typeof window.renderInvFancy === 'function') window.renderInvFancy();
    if(typeof window.renderActiveEffects === 'function') window.renderActiveEffects();
  }

  // -- Core admin actions --
  var Admin = window.Admin = {
    setSkillLevel: function(skill, lv){
      if(typeof G === 'undefined') return;
      if(!window.XP_TABLE) return;
      lv = Math.max(1, Math.min(99, +lv|0));
      var xp = lv === 1 ? 0 : window.XP_TABLE[lv-1];
      G.skills = G.skills || {};
      G.skills[skill] = xp;
      notify('Set '+skill+' to Lv '+lv);
      refreshUI();
    },
    addGold: function(n){
      if(typeof G === 'undefined') return;
      G.gold = (G.gold||0) + (+n||0);
      notify('+ '+n+' gold');
      refreshUI();
    },
    addGems: function(n){
      if(typeof G === 'undefined') return;
      G.gems = (G.gems||0) + (+n||0);
      notify('+ '+n+' gems');
      refreshUI();
    },
    spawn: function(id, qty){
      qty = Math.max(1, +qty|0);
      if(typeof window.addItem === 'function'){
        window.addItem(id, qty);
        notify('Spawned '+qty+'x '+id);
        refreshUI();
      } else if(typeof G !== 'undefined') {
        G.inventory[id] = (G.inventory[id]||0) + qty;
        refreshUI();
      }
    },
    spawnTierKit: function(tier){
      // Spawn ingredients commonly needed at this tier so the player can
      // craft + try every recipe for that tier.
      var bundles = {
        1: {bronze_sword:1, copper_ore:50, normal_log:50, shrimp:30, bones:20, slime_gel:10, wolf_pelt:5},
        2: {iron_sword:1, iron_ore:50, oak_log:50, trout:30, big_bones:10, goblin_ear:10, iron_helm:1},
        3: {steel_sword:1, coal:80, willow_log:50, lobster:30, venom_sac:10, brute_plate:5, dire_fang:5, iron_platebody:1, iron_warhammer:1},
        4: {steel_helm:1, gold_ore:50, maple_log:50, shark:20, plague_ichor:10, bear_claw:5, hell_ember:5, steel_platebody:1},
        5: {rune_sword:1, mithril_ore:50, yew_log:50, captain_medal:5, ruby:5, hollow_sigil:5},
        6: {ancient_rune:5, dragon_scale:5, dragon_bones:10, void_core:3, war_crown:1, dragon_gem:1},
      };
      var b = bundles[tier]; if(!b) return;
      Object.entries(b).forEach(function(kv){ Admin.spawn(kv[0], kv[1]); });
      notify('Spawned T'+tier+' kit');
    },
    applyBuff: function(type, magnitude, durationMs){
      if(typeof window.applyBuff !== 'function') return;
      window.applyBuff({type:type, magnitude:+magnitude||10, durationMs:+durationMs||300000});
      notify('Buff '+type+' applied');
      refreshUI();
    },
    godMode: function(on){
      if(typeof G === 'undefined') return;
      window.__adminGodMode = !!on;
      if(on){
        G.playerMaxHp = 9999;
        G.playerHp = 9999;
        notify('GOD MODE on');
      } else {
        G.playerMaxHp = 10;
        G.playerHp = 10;
        notify('GOD MODE off');
      }
      refreshUI();
    },
    healFull: function(){
      if(typeof G === 'undefined') return;
      G.playerHp = G.playerMaxHp || 10;
      refreshUI();
    },
    saveNow: function(){
      if(typeof window.saveLocal === 'function'){
        window.saveLocal();
        notify('Saved');
      }
    },
    resetSave: function(){
      if(!confirm('Wipe save and reload?')) return;
      localStorage.removeItem('hearthbound-save-v2');
      localStorage.removeItem('idle-game-v1');
      location.reload();
    },
    dumpState: function(){
      var snap = JSON.stringify(G, null, 2);
      navigator.clipboard.writeText(snap).then(function(){
        notify('State copied to clipboard ('+(snap.length/1024).toFixed(1)+' KB)');
      });
    },
    progressTier: function(tier){
      // Set combat skills to a level appropriate for the tier and equip
      // the right starter gear.
      var lvByTier = {1:1, 2:20, 3:35, 4:55, 5:75, 6:90};
      var lv = lvByTier[tier] || 1;
      ['attack','strength','defense','hitpoints','ranged','magic'].forEach(function(s){
        Admin.setSkillLevel(s, lv);
      });
      Admin.spawnTierKit(tier);
      Admin.healFull();
      notify('Combat boosted to Tier '+tier+' (Lv '+lv+')');
    },
    maxAllSkills: function(){
      if(typeof G === 'undefined') return;
      Object.keys(window.SKILLS_DEF || {}).forEach(function(s){
        Admin.setSkillLevel(s, 99);
      });
    },
  };

  // -- Render the panel UI --
  function renderPanel(){
    var skills = Object.keys(window.SKILLS_DEF || {});
    var buffs = Object.keys(window.BUFFS_DEF || {});
    var commonItems = ['copper_ore','iron_ore','coal','gold_ore','mithril_ore',
      'normal_log','oak_log','willow_log','maple_log','yew_log',
      'shrimp','trout','lobster','shark','bones','big_bones','dragon_bones',
      'cooked_shrimp','cooked_trout','cooked_lobster','cooked_shark'];

    panel.innerHTML = `
      <h3>⚙ Admin · Hearthrise</h3>

      <div class="ap-section">
        <h4>Skills</h4>
        <div class="ap-row">
          <select id="ap-skill">
            ${skills.map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join('')}
          </select>
          <label>Lv</label><input id="ap-skill-lv" type="number" min="1" max="99" value="50">
          <button class="ap-btn" data-act="set-skill">Set</button>
          <button class="ap-btn" data-act="max-all">Max All</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Wealth</h4>
        <div class="ap-row">
          <label>Gold</label><input id="ap-gold" type="number" value="100000">
          <button class="ap-btn" data-act="add-gold">Add</button>
          <label>Gems</label><input id="ap-gems" type="number" value="100">
          <button class="ap-btn" data-act="add-gems">Add</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Spawn Items</h4>
        <div class="ap-row">
          <select id="ap-item">
            ${commonItems.map(function(i){return '<option value="'+i+'">'+i+'</option>';}).join('')}
          </select>
          <input id="ap-item-qty" type="number" value="50">
          <button class="ap-btn" data-act="spawn-item">Spawn</button>
        </div>
        <div class="ap-row" style="margin-top:6px">
          <label>Custom ID</label>
          <input id="ap-item-custom" class="wide" type="text" placeholder="item_id">
          <button class="ap-btn" data-act="spawn-custom">Spawn 50</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Combat / Tier Jump</h4>
        <div class="ap-row">
          ${[1,2,3,4,5,6].map(function(t){return '<button class="ap-btn" data-act="tier" data-tier="'+t+'">→ Tier '+t+'</button>';}).join('')}
        </div>
        <div class="ap-row" style="margin-top:6px">
          <button class="ap-btn" data-act="god-on">God Mode On</button>
          <button class="ap-btn" data-act="god-off">Off</button>
          <button class="ap-btn" data-act="heal">Heal Full</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Buffs</h4>
        <div class="ap-row">
          <select id="ap-buff">
            ${buffs.map(function(b){return '<option value="'+b+'">'+b+'</option>';}).join('')}
          </select>
          <input id="ap-buff-mag" type="number" value="20"><label>%</label>
          <input id="ap-buff-dur" type="number" value="600">s
          <button class="ap-btn" data-act="apply-buff">Apply</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Save / State</h4>
        <div class="ap-row">
          <button class="ap-btn" data-act="save">Save Now</button>
          <button class="ap-btn" data-act="dump">Dump State</button>
          <button class="ap-btn danger" data-act="reset">Reset Save</button>
        </div>
      </div>

      <div class="ap-section">
        <h4>Audit Tools</h4>
        <div class="ap-row">
          <button class="ap-btn" data-act="audit-loot">Audit Loot Tables</button>
          <button class="ap-btn" data-act="audit-recipes">Audit Recipes</button>
        </div>
        <pre id="ap-audit-out" style="display:none"></pre>
      </div>

      <div class="ap-section">
        <h4>Player Market</h4>
        <div class="ap-row">
          <button class="ap-btn" data-act="market-seed">Seed Test Listings</button>
          <button class="ap-btn danger" data-act="market-clear">Clear Seeded</button>
        </div>
        <div class="ap-row" style="margin-top:4px;font-size:10px;color:#8a92a0">
          Drops 26 fake listings from fictional NPC sellers + 7 days of sales history so you can test buy / search / analytics.
        </div>
      </div>
    `;

    // Wire all the buttons
    panel.querySelectorAll('button[data-act]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var act = btn.dataset.act;
        if(act === 'set-skill') Admin.setSkillLevel(panel.querySelector('#ap-skill').value, panel.querySelector('#ap-skill-lv').value);
        else if(act === 'max-all') Admin.maxAllSkills();
        else if(act === 'add-gold') Admin.addGold(panel.querySelector('#ap-gold').value);
        else if(act === 'add-gems') Admin.addGems(panel.querySelector('#ap-gems').value);
        else if(act === 'spawn-item') Admin.spawn(panel.querySelector('#ap-item').value, panel.querySelector('#ap-item-qty').value);
        else if(act === 'spawn-custom') Admin.spawn(panel.querySelector('#ap-item-custom').value, 50);
        else if(act === 'tier') Admin.progressTier(+btn.dataset.tier);
        else if(act === 'god-on') Admin.godMode(true);
        else if(act === 'god-off') Admin.godMode(false);
        else if(act === 'heal') Admin.healFull();
        else if(act === 'apply-buff') Admin.applyBuff(panel.querySelector('#ap-buff').value, panel.querySelector('#ap-buff-mag').value, +panel.querySelector('#ap-buff-dur').value*1000);
        else if(act === 'save') Admin.saveNow();
        else if(act === 'dump') Admin.dumpState();
        else if(act === 'reset') Admin.resetSave();
        else if(act === 'audit-loot') runAudit('loot');
        else if(act === 'audit-recipes') runAudit('recipes');
        else if(act === 'market-seed'){
          if(window.HearthriseMarket && typeof window.HearthriseMarket.seedFakeListings === 'function'){
            var r = window.HearthriseMarket.seedFakeListings();
            if(typeof window.notify === 'function'){
              window.notify(r.ok ? ('Seeded ' + r.listings + ' listings + history') : (r.reason || 'Seed failed'), r.ok ? 'info' : 'kill');
            }
            if(typeof window.renderMarket === 'function') window.renderMarket();
          }
        }
        else if(act === 'market-clear'){
          if(window.HearthriseMarket && typeof window.HearthriseMarket.clearSeed === 'function'){
            window.HearthriseMarket.clearSeed();
            if(typeof window.notify === 'function') window.notify('Cleared seeded listings + history', 'info');
            if(typeof window.renderMarket === 'function') window.renderMarket();
          }
        }
      });
    });
  }

  // -- Audits run in-place and dump to a <pre> --
  function runAudit(kind){
    var out = panel.querySelector('#ap-audit-out');
    out.style.display = 'block';
    out.style.color = '#88e89e';
    var lines = [];
    var ITEMS = window.ITEMS || {};
    var MONSTERS = window.MONSTERS || {};
    var RECIPES = window.ARTISAN_RECIPES || {};

    if(kind === 'loot'){
      lines.push('=== Monster Loot Drops ===');
      var missing = [];
      Object.entries(MONSTERS).forEach(function(kv){
        var id = kv[0], m = kv[1];
        (m.drops||[]).forEach(function(d){
          var dropId = typeof d === 'string' ? d : d.id;
          if(!ITEMS[dropId]) missing.push(id+' → '+dropId+' (not in ITEMS)');
        });
      });
      if(missing.length){
        out.style.color = '#ff8c8c';
        lines.push('PROBLEMS:');
        missing.forEach(function(m){lines.push('  '+m);});
      } else {
        lines.push('All monster drops reference valid items ✓');
      }
    } else if(kind === 'recipes'){
      lines.push('=== Recipe ingredient/output check ===');
      var missing = [];
      Object.entries(RECIPES).forEach(function(kv){
        var skill = kv[0], list = kv[1];
        list.forEach(function(r){
          if(r.input && !ITEMS[r.input]) missing.push(skill+'/'+r.id+' input '+r.input);
          if(r.output && !ITEMS[r.output]) missing.push(skill+'/'+r.id+' output '+r.output);
          if(r.secondary){
            Object.keys(r.secondary).forEach(function(s){
              if(!ITEMS[s]) missing.push(skill+'/'+r.id+' secondary '+s);
            });
          }
        });
      });
      if(missing.length){
        out.style.color = '#ff8c8c';
        lines.push('PROBLEMS:');
        missing.forEach(function(m){lines.push('  '+m);});
      } else {
        lines.push('All recipe items reference valid ITEMS ✓');
      }

      lines.push('');
      lines.push('=== Recipe ingredient obtainability ===');
      var unobtainable = [];
      // Build a set of obtainable items: monster drops + gather products + shop
      var obtainable = new Set();
      Object.values(MONSTERS).forEach(function(m){ (m.drops||[]).forEach(function(d){ obtainable.add(typeof d==='string'?d:d.id); }); });
      (window.TREES||[]).forEach(function(t){ obtainable.add(t.prod); });
      (window.ROCKS||[]).forEach(function(r){ obtainable.add(r.prod); });
      (window.FISH_SPOTS||[]).forEach(function(f){ obtainable.add(f.prod || f.fish); });
      Object.values(window.CROPS||{}).forEach(function(c){ obtainable.add(c.prod); obtainable.add(c.seed); });
      // Recipe outputs are also obtainable (chain crafting)
      Object.values(RECIPES).forEach(function(list){ list.forEach(function(r){ if(r.output) obtainable.add(r.output); }); });
      // Shop items
      (window.SEED_SHOP||[]).forEach(function(s){ obtainable.add(s.id); });
      (window.EQUIP_SHOP||[]).forEach(function(s){ obtainable.add(s.id); });

      Object.entries(RECIPES).forEach(function(kv){
        var skill = kv[0], list = kv[1];
        list.forEach(function(r){
          if(r.input && !obtainable.has(r.input)) unobtainable.push(skill+'/'+r.id+' input '+r.input);
          if(r.secondary){
            Object.keys(r.secondary).forEach(function(s){
              if(!obtainable.has(s)) unobtainable.push(skill+'/'+r.id+' secondary '+s);
            });
          }
        });
      });
      if(unobtainable.length){
        out.style.color = '#ff8c8c';
        lines.push('UNOBTAINABLE ingredients:');
        unobtainable.forEach(function(m){lines.push('  '+m);});
      } else {
        lines.push('All recipe inputs reachable via gather/drop/shop ✓');
      }
    }

    out.textContent = lines.join('\n');
  }

  console.log('[admin] panel ready (Ctrl+Shift+A or click ⚙ Admin button)');
})();
