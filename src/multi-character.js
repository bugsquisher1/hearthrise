// ============================================================
// src/multi-character.js
//
// Multi-character system. Each profile (Steam/Apple/Google account)
// owns N character slots. The currently-selected character is the
// "active" one — the live game state (G) IS that character's data.
// Switching characters serializes the active slot back to storage,
// then loads the chosen slot.
//
// Storage layout (localStorage):
//   hearthrise:profile = {
//     activeSlot:    0,                              // 0..4
//     unlockedSlots: 1,                              // 1..MAX_SLOTS
//     slots: [
//       {id:0, name:'...', combatLv:..., totalLv:..., createdAt:..., lastSeen:...},
//       ...
//     ],
//     entitlements:  {hearthHall:true, ...},         // ACCOUNT-level, not per-character
//     ownedThemes:   ['default'],                    // shared across chars
//     ownedCosmetics:['skin1', ...],                 // shared
//   }
//   hearthrise:char:0 = full G snapshot for slot 0
//   hearthrise:char:1 = full G snapshot for slot 1
//   ...
//
// HARD CAP: 5 slots. Pricing: slot 1 free, slots 2-5 escalating gems.
// Hearth Hall Premium unlocks 3 of the 4 paid slots automatically.
//
// Migrating an existing single-save player: on first run with this
// module loaded, copy 'hearthbound-save-v2' → 'hearthrise:char:0'
// and create a profile with 1 unlocked slot pointing at that data.
// ============================================================

(function(){
  'use strict';

  const MAX_SLOTS = 5;
  const SLOT_COSTS_GEMS = [0, 200, 500, 900, 1500];   // index = slotIndex (0..4)
  const PROFILE_KEY = 'hearthrise:profile';
  const SAVE_KEY = 'hearthbound-save-v2';

  function charKey(slot){ return 'hearthrise:char:' + slot; }

  // A character name can arrive over the network on a cloud restore, and both
  // the drawer and Home interpolate it into innerHTML — escape at the boundary.
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ── Profile load / save / migrate ─────────────────────────────
  function loadProfile(){
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if(raw) return JSON.parse(raw);
    } catch(e){ console.warn('[multi-char] profile parse failed', e); }
    return null;
  }
  function saveProfile(p){
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }
    catch(e){ console.warn('[multi-char] profile save failed', e); }
  }
  function migrateLegacySave(){
    // First time loading the multi-char system: copy the existing single
    // save (if any) into slot 0 and create a profile.
    var legacy = localStorage.getItem(SAVE_KEY);
    var profile = {
      activeSlot: 0,
      unlockedSlots: 1,
      slots: [],
      entitlements: {},
      ownedThemes: ['default'],
      ownedCosmetics: [],
      version: 1,
    };
    if(legacy){
      // Stash legacy save into slot 0.
      localStorage.setItem(charKey(0), legacy);
      // Crack open the save to populate slot meta.
      try {
        var d = JSON.parse(legacy);
        profile.slots.push({
          id: 0,
          name: d.playerName || 'Adventurer',
          combatLv: 1, // recalc on next load
          totalLv: 1,
          createdAt: d.createdAt || Date.now(),
          lastSeen: d.lastSeen || Date.now(),
        });
        // Pull account-level fields out of the legacy save into the profile.
        if(d.entitlements) profile.entitlements = d.entitlements;
        if(d.ownedThemes) profile.ownedThemes = d.ownedThemes;
        if(d.ownedCosmetics) profile.ownedCosmetics = d.ownedCosmetics;
      } catch(e){
        profile.slots.push({ id:0, name:'Adventurer', combatLv:1, totalLv:1, createdAt:Date.now(), lastSeen:Date.now() });
      }
    } else {
      // Empty profile, slot 0 will be created as a fresh character.
      profile.slots.push({ id:0, name:'Adventurer', combatLv:1, totalLv:1, createdAt:Date.now(), lastSeen:Date.now() });
    }
    saveProfile(profile);
    return profile;
  }

  // ── Switching characters ──────────────────────────────────────
  // Saves current G into the active slot, then loads the requested slot.
  // Returns the new profile object on success.
  function switchSlot(slotId){
    var profile = window.HearthriseProfile && window.HearthriseProfile.profile;
    if(!profile) return null;
    if(slotId < 0 || slotId >= profile.unlockedSlots){
      if(typeof window.notify === 'function') window.notify('Slot not unlocked', 'kill');
      return null;
    }
    // Snapshot current character.
    if(typeof window.G !== 'undefined' && typeof window.saveLocal === 'function'){
      window.saveLocal();
      // saveLocal writes to SAVE_KEY; copy that into the active slot.
      var snap = localStorage.getItem(SAVE_KEY);
      if(snap) localStorage.setItem(charKey(profile.activeSlot), snap);
    }
    profile.activeSlot = slotId;
    saveProfile(profile);
    // Now load the new slot's data into SAVE_KEY so the engine picks
    // it up on reload.
    var nextSnap = localStorage.getItem(charKey(slotId));
    if(nextSnap){
      localStorage.setItem(SAVE_KEY, nextSnap);
    } else {
      // First time activating this slot — clear so engine creates fresh.
      localStorage.removeItem(SAVE_KEY);
    }
    return profile;
  }

  // ── Slot purchases ────────────────────────────────────────────
  function unlockSlot(slotId){
    var profile = window.HearthriseProfile.profile;
    if(slotId !== profile.unlockedSlots) return { ok:false, reason:'Must unlock slots in order' };
    if(slotId >= MAX_SLOTS) return { ok:false, reason:'Max slots reached (' + MAX_SLOTS + ')' };
    var cost = SLOT_COSTS_GEMS[slotId] || 0;
    // Hearth Hall Premium grants 3 of the 4 paid slots free (slots 1, 2, 3).
    var hasPremium = profile.entitlements && profile.entitlements.hearthHall;
    var freeFromPremium = hasPremium && slotId >= 1 && slotId <= 3;
    if(!freeFromPremium){
      if((window.G && (window.G.gems||0) < cost)){
        return { ok:false, reason:'Need ' + cost + ' gems' };
      }
      window.G.gems -= cost;
    }
    profile.unlockedSlots++;
    profile.slots.push({
      id: slotId,
      name: 'Adventurer ' + (slotId + 1),
      combatLv: 1, totalLv: 1,
      createdAt: Date.now(), lastSeen: Date.now(),
    });
    saveProfile(profile);
    if(typeof window.notify === 'function') window.notify('Unlocked slot ' + (slotId+1) + (freeFromPremium ? ' (Premium)' : ' for ' + cost + ' gems'), 'levelup');
    return { ok: true };
  }

  // ── Snapshot the active slot's meta (combat lv, total lv, etc.) ──
  function refreshActiveMeta(){
    var profile = window.HearthriseProfile.profile;
    if(!profile || !window.G) return;
    var slot = profile.slots[profile.activeSlot];
    if(!slot) return;
    slot.name = window.G.playerName || slot.name;
    slot.combatLv = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 1;
    slot.totalLv  = (typeof window.getTotalLevel === 'function') ? window.getTotalLevel() : 1;
    slot.lastSeen = Date.now();
    saveProfile(profile);
  }

  // ── Public API + side-effects ─────────────────────────────────
  window.HearthriseProfile = {
    profile: null,
    MAX_SLOTS: MAX_SLOTS,
    SLOT_COSTS_GEMS: SLOT_COSTS_GEMS,
    init: function(){
      var p = loadProfile();
      if(!p) p = migrateLegacySave();
      this.profile = p;
      // Keep the slot meta fresh on every save tick.
      var origSave = window.saveLocal;
      if(typeof origSave === 'function' && !window.__profileSaveHooked){
        window.saveLocal = function(){
          var r = origSave.apply(this, arguments);
          try { refreshActiveMeta(); } catch(e){}
          return r;
        };
        window.__profileSaveHooked = true;
      }
      return p;
    },
    /* b339 — WHICH CHARACTER IS LIVE, published as an ANSWER rather than as a
       record other modules parse. src/net/{accrue,character}.js need it to
       address the right server-side character (they were hard-coded to slot 0,
       which meant a player on slot 2 ensured and accrued against slot 0). They
       must NOT read `profile.activeSlot` or the PROFILE_KEY themselves: a
       second reader of this record is a second thing to drift, and this module
       is the one that writes it.
       Falls back to the stored profile when `init()` has not run yet (the net
       modules can be wired before this script's init on a slow boot), and to 0
       when there is no profile at all — which is the pre-b339 behaviour and the
       only correct answer for an account that has never had a second slot. */
    activeSlot: function(){
      var p = this.profile || loadProfile();
      var s = p && p.activeSlot;
      return (typeof s === 'number' && s >= 0 && s < MAX_SLOTS) ? (s | 0) : 0;
    },
    switchSlot: switchSlot,
    unlockSlot: unlockSlot,
    listSlots: function(){
      var p = this.profile || loadProfile();
      return p ? p.slots : [];
    },
    canUnlockNext: function(){
      var p = this.profile;
      if(!p) return null;
      if(p.unlockedSlots >= MAX_SLOTS) return null;
      var nextId = p.unlockedSlots;
      var hasPremium = p.entitlements && p.entitlements.hearthHall;
      var free = hasPremium && nextId >= 1 && nextId <= 3;
      return {
        slotId: nextId,
        cost: free ? 0 : SLOT_COSTS_GEMS[nextId],
        free: !!free,
      };
    },
    // b229 — ONE model of "what slots exist and what each row can do", read by
    // BOTH the topbar drawer and the Home "Your heroes" block so the two
    // surfaces cannot drift. Existing character rows first, then the locked /
    // buyable rows up to MAX_SLOTS. Rendering + wiring stay per-surface (Home
    // speaks hd-*, the drawer speaks cs-*); the DATA and the actions are shared.
    slotRows: function(){
      var p = this.profile || loadProfile();
      if(!p) return [];
      var rows = [];
      (p.slots || []).forEach(function(s){
        rows.push({
          kind: 'char', id: s.id, name: s.name || 'Adventurer',
          combatLv: s.combatLv || 1, totalLv: s.totalLv || 1,
          active: s.id === p.activeSlot, lastSeen: s.lastSeen,
        });
      });
      for(var i = (p.slots || []).length; i < MAX_SLOTS; i++){
        var hasPremium = p.entitlements && p.entitlements.hearthHall;
        var free = hasPremium && i >= 1 && i <= 3;
        rows.push({
          kind: 'locked', slotId: i, free: !!free,
          cost: free ? 0 : SLOT_COSTS_GEMS[i], canBuy: (i === p.unlockedSlots),
        });
      }
      return rows;
    },
    // The shared switch action: confirm, snapshot-and-swap, reload. The reload
    // is intentional — the engine boots from hearthbound-save-v2 and has no live
    // save-swap seam (§1.4). Returns false if it was a no-op (already active or
    // the player declined) so callers can skip a redundant re-render.
    selectSlot: function(id){
      var p = this.profile; if(!p) return false;
      if(id === p.activeSlot) return false;
      var slot = null, list = p.slots || [];
      for(var i = 0; i < list.length; i++){ if(list[i].id === id){ slot = list[i]; break; } }
      var nm = slot ? slot.name : ('Slot ' + (id + 1));
      if(!confirm('Switch to ' + nm + '? Your current character will be saved.')) return false;
      switchSlot(id);
      if(typeof location !== 'undefined' && location.reload) location.reload();
      return true;
    },
    timeSince: timeSince,
    esc: esc,
  };

  // Initialize on DOMContentLoaded so legacy.js has loaded first.
  //
  // b224 ACCOUNT WALL: init() is not read-only. With no `hearthrise:profile`
  // present it runs migrateLegacySave(), which WRITES a profile and copies the
  // save into slot 0 — character-slot creation, on a device whose visitor has
  // not proved they own an account. Slots belong to an account now, so the
  // whole module (init, the migration, and the slot-select UI that can buy a
  // slot with gems) waits for the gate. Nothing here is deleted: signed in,
  // it behaves exactly as before.
  function start(){ window.HearthriseProfile.init(); injectUI(); }
  function arm(){
    if(document.readyState !== 'loading'){ setTimeout(start, 50); }
    else document.addEventListener('DOMContentLoaded', start);
  }
  if(window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  // ── UI: character-select drawer ──────────────────────────────
  // Triggered by clicking the player avatar in the topbar.
  function injectUI(){
    if(document.getElementById('char-select-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'char-select-overlay';
    ov.className = 'char-select-overlay';
    ov.innerHTML = '<div class="cs-modal" id="cs-modal"></div>';
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    document.body.appendChild(ov);

    function close(){ ov.classList.remove('open'); }
    window.closeCharacterSelect = close;
    window.openCharacterSelect = function(){
      var p = window.HearthriseProfile.profile;
      if(!p) return;
      render();
      ov.classList.add('open');
    };

    function render(){
      var modal = ov.querySelector('#cs-modal');
      // b229: rows come from the SHARED model so the drawer and Home never
      // disagree about which slots exist or what each one costs.
      var rows = window.HearthriseProfile.slotRows();
      var html = rows.map(function(r){
        if(r.kind === 'char'){
          return '<button class="cs-slot ' + (r.active?'active':'') + '" data-slot="' + r.id + '">' +
            '<div class="cs-slot-portrait">🧙</div>' +
            '<div class="cs-slot-meta">' +
              '<div class="cs-slot-name">' + esc(r.name) + (r.active?' <span class="cs-active-pill">active</span>':'') + '</div>' +
              '<div class="cs-slot-stats">Cmb Lv <b>' + (r.combatLv||1) + '</b> · Tot Lv <b>' + (r.totalLv||1) + '</b></div>' +
              '<div class="cs-slot-since">' + (r.active ? 'now' : timeSince(r.lastSeen)) + '</div>' +
            '</div>' +
          '</button>';
        }
        return '<div class="cs-slot locked">' +
          '<div class="cs-slot-portrait">🔒</div>' +
          '<div class="cs-slot-meta">' +
            '<div class="cs-slot-name">Slot ' + (r.slotId+1) + (r.free ? ' <span class="cs-pill premium">Premium</span>' : '') + '</div>' +
            '<div class="cs-slot-stats">' + (r.free ? 'Included with Hearth Hall' : (r.cost + ' 💎')) + '</div>' +
          '</div>' +
          (r.canBuy
            ? '<button class="cs-buy" data-buy="' + r.slotId + '">' + (r.free ? 'Unlock' : 'Buy') + '</button>'
            : '<div class="cs-locked-tag">unlock the previous slot first</div>') +
        '</div>';
      }).join('');

      modal.innerHTML =
        '<button class="cs-close">✕</button>' +
        '<h2>Characters</h2>' +
        '<p class="cs-sub">Each character has its own skills, inventory, gold, and bound items. Up to ' + MAX_SLOTS + ' per profile.</p>' +
        '<div class="cs-slots">' + html + '</div>';

      modal.querySelector('.cs-close').addEventListener('click', close);
      modal.querySelectorAll('.cs-slot[data-slot]').forEach(function(b){
        b.addEventListener('click', function(){
          var sid = parseInt(this.dataset.slot, 10);
          // Shared switch action (confirm + swap + reload). Returns false when
          // the tapped slot is already active — just close the drawer then.
          if(!window.HearthriseProfile.selectSlot(sid)) close();
        });
      });
      modal.querySelectorAll('.cs-buy[data-buy]').forEach(function(b){
        b.addEventListener('click', function(){
          var sid = parseInt(this.dataset.buy, 10);
          var r = window.HearthriseProfile.unlockSlot(sid);
          if(r.ok) render();
          else if(typeof window.notify === 'function') window.notify(r.reason, 'kill');
        });
      });
    }

    // Hook the topbar avatar click → open character select.
    function wireAvatar(){
      var av = document.querySelector('.topbar .avatar, .topbar [class*="avatar"], #topbar-player');
      if(!av){ setTimeout(wireAvatar, 200); return; }
      if(av.__characterSelectWired) return;
      av.__characterSelectWired = true;
      av.style.cursor = 'pointer';
      av.title = 'Switch character';
      av.addEventListener('click', function(){
        if(typeof window.openCharacterSelect === 'function') window.openCharacterSelect();
      });
    }
    wireAvatar();
  }

  function timeSince(ts){
    if(!ts) return 'never';
    var s = (Date.now() - ts) / 1000;
    if(s < 60) return Math.floor(s) + 's ago';
    if(s < 3600) return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  console.log('[multi-character] loaded — max ' + MAX_SLOTS + ' slots');
})();
