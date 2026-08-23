// ============================================================
// src/render/equipment-doll.js — the equipment paper-doll (render layer)
//
// SEVENTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18/19). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: window.buildTibiaDoll — the "Tibia-style" equipment paper-doll
// reused WHOLESALE by every equipment surface (the Character screen's Equipment
// card AND the Combat War Table doll). It READS EQUIP_SLOTS / EQUIP_SLOT_META /
// G.equipment / G.companions / COMPANIONS / ITEMS and returns a DETACHED DOM node
// (a .td-wrap with three sub-panes: Equipment gear grid, Stats, Companion). It
// writes NO authoritative state — the only state it touches is the session-UI
// scratch field window._tdPane (the persisted sub-tab, same convention as
// _invFilter). Because it returns a detached node rather than mutating a host's
// innerHTML, and is NOT on the showTab dispatch chain (callers ask for it by name
// explicitly), its blast radius is exactly the two dolls that paint it.
//
// This is the "controller on-ramp": bigger than the leaf render helpers, but the
// SAFEST controller to move first — pure paint, detached return, no host mutation,
// no economy/save writes, and the densest existing smoke coverage.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js (window.buildTibiaDoll) — moved out, not redesigned. There are NO
// hardcoded theme colours in this JS: every colour lives in the .td-* selectors
// in src/styles/*.css, which are unchanged (standing debt, not this job).
//
// THE HANDLERS STAY GLOBAL IN legacy.js. The doll wires state-mutating clicks —
// unequip(slot) (a legacy.js top-level function declaration → window.unequip in a
// classic script) and window.unequipCompanion() — plus window.showTab for the
// "Open the Stable" button. None of those move here; they are resolved via
// window.* at CALL time, so this module only PAINTS and delegates. Globals are
// read via window.* (resolved at call time), so this script may load in any order
// after legacy.js. Only buildTibiaDoll is re-exported onto window, under its exact
// existing name, so ZERO call sites change.
// ============================================================
(function () {
  "use strict";

  function buildTibiaDoll() {
    // Globals resolved at CALL time via window.* so load order is free. These
    // local aliases keep the moved body byte-identical to its legacy.js form.
    var G = window.G || {};
    var EQUIP_SLOTS = window.EQUIP_SLOTS;
    var EQUIP_SLOT_META = window.EQUIP_SLOT_META;
    var ITEMS = window.ITEMS;
    var unequip = window.unequip;
    var slotGlyphSVG = window.slotGlyphSVG || function () { return ''; };

    if(typeof EQUIP_SLOTS === 'undefined' || typeof EQUIP_SLOT_META === 'undefined') return null;
    /* b216: the doll is now two panes — Equipment and Companion — so the pet
       gets its own space instead of squatting in a gear slot, and every gear
       slot fits on screen without scrolling. Ammo sits top-right, next to the
       weapon side of the body, which is where players look for it. */
    var LAYOUT = {            // [column, row] in a 4-wide doll
      cape:[1,1],   helmet:[2,1], necklace:[3,1], ammo:[4,1],
      weapon:[1,2], body:[2,2],   shield:[3,2],   earrings:[4,2],
      gloves:[1,3], pants:[2,3],  belt:[3,3],     ring1:[4,3],
                    boots:[2,4],                  ring2:[4,4],
    };
    var wrap = document.createElement('div');
    wrap.className = 'td-wrap';
    var doll = document.createElement('div');
    doll.className = 'td-doll';
    var companionPane = document.createElement('div');
    companionPane.className = 'td-pet-pane';
    EQUIP_SLOTS.forEach(function(s){
      // b229: the companion slot used to resolve through `ITEMS[G.equipment.
      // companion]` like every other slot, but equipCompanion() only ever
      // mirrors the legacy 'fox_companion' item id into G.equipment.companion
      // for the fox — every other companion (wolf_pup, hawk, ...) writes its
      // raw COMPANIONS id there instead, which ITEMS doesn't have. That silently
      // rendered 21 of the 22 companions as an EMPTY slot here even while
      // equipped (the info panel below already read the right source). Resolve
      // this slot from G.companions.equipped/window.COMPANIONS directly instead
      // of piggybacking on the generic ITEMS path.
      if(s === 'companion'){
        var eqId = (G.companions && G.companions.equipped) || null;
        var cdef = eqId && window.COMPANIONS ? window.COMPANIONS[eqId] : null;
        var cslot = document.createElement('div');
        cslot.className = 'td-slot td-companion' + (cdef?'':' empty') + ' td-companion-slot';
        var cLabel = EQUIP_SLOT_META[s]?.label || s;
        cslot.title = cdef ? (cLabel + ': ' + cdef.n + ' (click to unequip)') : cLabel;
        cslot.onclick = function(){
          if(cdef && typeof window.unequipCompanion === 'function') window.unequipCompanion();
        };
        cslot.innerHTML = cdef
          ? window.companionIconHtml(eqId, 44)
          : (slotGlyphSVG(s) + '<span class="td-slot-lbl">'+(cLabel||s)+'</span>');
        companionPane.appendChild(cslot);
        return;
      }
      /* b459 (journey-audit P1-3): the doll is a DISPLAY surface, so it follows
         the b456 display ladder — record KNOWN → server truth; record UNKNOWN
         (no/failed session, boot window) → the local optimistic value, exactly
         what the fight screen's doll shows. The old read returned null while
         UNKNOWN, so Inventory showed all 14 slots empty while the player was
         visibly swinging a Bronze Sword on the fight screen. Authority reads
         (the equip intent, stat rollups' gates) are unchanged. */
      var _er = window.HearthriseEquipRead;
      var id = (_er && typeof _er.isEquipmentKnown === 'function' && _er.isEquipmentKnown(G))
        ? _er.equippedItem(G, s)
        : (G.equipment ? G.equipment[s] : null);
      var def = id && (typeof ITEMS!=='undefined') ? ITEMS[id] : null;
      var path = id && window._itemPath && window._itemPath[id];
      var slot = document.createElement('div');
      slot.className = 'td-slot td-' + s + (def?'':' empty');
      // b105: include slot name in tooltip when equipped, so hovering a
      // filled slot still reveals which body location it covers (the
      // `<small>` label gets visually crowded by the item icon).
      var slotLabel = EQUIP_SLOT_META[s]?.label || s;
      slot.title = def ? (slotLabel + ': ' + def.n + ' (click to unequip)') : slotLabel;
      slot.onclick = function(){
        if(def && typeof unequip === 'function') unequip(s);
      };
      // b139 (QA §2.3.1 / §2.6.1): drop the 3-char truncated `<small>` slot
      // labels (Hel / Nec / Cap / Bod / Bel / Com) which read as random
      // strings rather than slot names. The slot icon + `title` tooltip
      // already convey which slot it is. Cleaner visual; no info loss.
      if(def && path){
        slot.innerHTML = '<img src="'+path+'" alt="" draggable="false" />';
        slot.setAttribute('draggable','true');
      } else if(def){
        slot.innerHTML = (def.icon||'·');
        slot.setAttribute('draggable','true');
      } else {
        // b192: bigger gilt line-glyph + a slot NAME label so it's obvious what
        // goes where (faint tiny glyphs alone were unreadable).
        slot.innerHTML = slotGlyphSVG(s) + '<span class="td-slot-lbl">'+(slotLabel||s)+'</span>';
      }
      // 'companion' is handled by the early-return branch above.
      var pos = LAYOUT[s];
      if(pos){ slot.style.gridColumn = pos[0]; slot.style.gridRow = pos[1]; }
      doll.appendChild(slot);
    });

    /* Stats pane — the summed bonuses of everything you're wearing. Its own tab
       rather than an always-on panel: it answers "how strong am I right now",
       which players check between fights, not every second. */
    var statsPane = document.createElement('div');
    statsPane.className = 'td-stats-pane';
    statsPane.innerHTML = window.renderEquipmentStatsHTML();

    /* b218 (backlog #4): the Companion tab used to hold ONLY the companion equip
       slot — a lone icon — so the companion's own level/XP/stats were invisible
       here; the always-on stat sheet beside the doll shows the PLAYER's stats,
       which is what players saw when they opened this tab. Wire the equipped
       companion's own progression into the pane. All data is authored in
       src/data/companions.js and read through the companions ESM module's
       window bindings (companionLevelFromXp / companionXpToReach /
       getCompanionBonus) — no invented fields, same source the Stable renders. */
    (function(){
      var info = document.createElement('div');
      info.className = 'td-companion-info';
      var eq = (G.companions && G.companions.equipped) || null;
      var def = eq && window.COMPANIONS ? window.COMPANIONS[eq] : null;
      if(def && typeof window.companionLevelFromXp === 'function'){
        var xp = (G.companions.xp && G.companions.xp[eq]) || 0;
        var lv = window.companionLevelFromXp(xp);
        var nextXp = window.companionXpToReach(lv + 1);
        var thisXp = window.companionXpToReach(lv);
        var pct = nextXp > thisXp ? Math.min(100, ((xp - thisXp) / (nextXp - thisXp)) * 100) : 100;
        var cb = typeof window.getCompanionBonus === 'function' ? window.getCompanionBonus() : {};
        /* b228: the corrected key names (allXP / goldFind / prayerSpeed), and
           farmYield leaves the percent list — it is a count of crops. */
        var LBL = {strB:'STR',atkB:'ATK',defB:'DEF',crit:'Crit',allXP:'All XP',gatherSpeed:'Gather',farmYield:'Farm',cookSpeed:'Cook',smithSpeed:'Smith',craftSpeed:'Craft',prayerSpeed:'Prayer',rareDrop:'Rare drop',goldFind:'Gold find',hpRegen:'HP/s'};
        var PCT = {crit:1,allXP:1,gatherSpeed:1,cookSpeed:1,smithSpeed:1,craftSpeed:1,prayerSpeed:1,rareDrop:1,goldFind:1};
        var bonuses = Object.keys(cb).filter(function(k){return cb[k];}).map(function(k){
          var v = PCT[k] ? '+' + (cb[k] * 100).toFixed(0) + '%' : '+' + (Math.round(cb[k] * 10) / 10);
          return '<span class="td-comp-bonus"><b>' + v + '</b> ' + (LBL[k] || k) + '</span>';
        }).join('');
        info.innerHTML =
          '<div class="td-comp-head"><span class="td-comp-icon">' + window.companionIconHtml(eq, 28) + '</span>' +
            '<div class="td-comp-idcol"><div class="td-comp-name">' + def.n + ' <span class="td-comp-lv">Lv ' + lv + '</span></div>' +
            '<div class="td-comp-role">' + (def.role || '') + ' companion</div></div></div>' +
          '<div class="td-comp-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<div class="td-comp-xp">' + xp.toLocaleString() + ' / ' + nextXp.toLocaleString() + ' XP</div>' +
          (bonuses ? '<div class="td-comp-bonuses">' + bonuses + '</div>' : '') +
          (def.proc ? '<div class="td-comp-proc">' + def.proc.label + ' (' + (def.proc.chance * 100).toFixed(0) + '% on ' + def.proc.trigger + ')</div>' : '');
      } else {
        info.innerHTML = '<div class="td-comp-empty">No companion equipped.<br>'
          + '<button class="td-comp-stable" onclick="window.showTab&&window.showTab(\'stable\')">Open the Stable →</button></div>';
      }
      companionPane.appendChild(info);
    })();

    /* Tabs — Equipment | Stats | Companion.
       b218 (backlog #3): the doll is rebuilt from scratch on every panel
       re-render (renderInvFancy fires on the game tick via updateTopbar/addItem;
       renderCharacter re-runs every 2s), and each rebuild hardcoded the Equipment
       pane active — so a player who opened Stats or Companion was snapped back to
       Equipment within seconds. Persist the selected pane in a single session-UI
       field (same window._* convention as _invFilter / _invMultiSelect) and
       restore it on build so the choice survives auto-refresh. */
    var activePane = (window._tdPane === 'stats' || window._tdPane === 'pet') ? window._tdPane : 'gear';
    var tabs = document.createElement('div');
    tabs.className = 'td-tabs';
    tabs.innerHTML =
      '<button class="td-tab'+(activePane==='gear'?' active':'')+'" data-td-pane="gear" title="Equipment">'+ slotGlyphSVG('body') +'<span>Equipment</span></button>'+
      '<button class="td-tab'+(activePane==='stats'?' active':'')+'" data-td-pane="stats" title="Stats">'+ slotGlyphSVG('weapon') +'<span>Stats</span></button>'+
      '<button class="td-tab'+(activePane==='pet'?' active':'')+'" data-td-pane="pet" title="Companion">'+ slotGlyphSVG('companion') +'<span>Companion</span></button>';
    function applyPane(pane){
      tabs.querySelectorAll('.td-tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-td-pane') === pane); });
      doll.style.display          = pane === 'gear'  ? '' : 'none';
      statsPane.style.display     = pane === 'stats' ? '' : 'none';
      companionPane.style.display = pane === 'pet'   ? '' : 'none';
      // Recompute on open so it always reflects what's currently worn.
      if(pane === 'stats') statsPane.innerHTML = window.renderEquipmentStatsHTML();
    }
    tabs.addEventListener('click', function(e){
      var btn = e.target.closest('[data-td-pane]'); if(!btn) return;
      var pane = btn.getAttribute('data-td-pane');
      window._tdPane = pane;   // persist so the next auto-refresh restores it
      applyPane(pane);
    });

    wrap.appendChild(tabs);
    wrap.appendChild(doll);
    wrap.appendChild(statsPane);
    wrap.appendChild(companionPane);
    applyPane(activePane);   // restore the persisted sub-tab on (re)build
    return wrap;
  }

  window.buildTibiaDoll = buildTibiaDoll;
})();
