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
// G.equipment / ITEMS and returns a DETACHED DOM node
// (a .td-wrap with two sub-panes: Equipment gear grid, Stats). The Companion
// pane left with the companion system (2026-10-14 demolition). It
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
// classic script). It does not move here; they are resolved via
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
    /* THE SHAPE IS NOT AUTHORED HERE. It lives in src/render/doll-layout.js,
       which the Fight screen's loadout rail reads too — one table, so a slot
       cannot sit in one place on Character and another on the fight screen
       (which is exactly what shipped before: a 4x4 TABLE here, array-order
       auto-flow there). `place()` also compacts unused rows and hands back the
       reading order, so the DOM order matches what the eye and the tab key
       walk. Resolved at CALL time via window.* like every other global in this
       module, so load order stays free. */
    var DL = window.HearthriseDollLayout;
    var gearSlots = EQUIP_SLOTS.filter(function(s){ return s !== 'companion'; });
    var plan = DL && typeof DL.place === 'function'
      ? DL.place(gearSlots)
      : { pos:{}, order:gearSlots, unplaced:gearSlots, cols:3, rows:0 };

    var wrap = document.createElement('div');
    wrap.className = 'td-wrap';
    var doll = document.createElement('div');
    doll.className = 'td-doll';
    /* Rows are declared from the plan rather than from a magic number in CSS:
       the sheet cannot know how many rows a slot set uses, and the last time it
       guessed (repeat(4,auto) for a layout that used four) it left two empty
       90px tracks under the boots. */
    if(plan.rows) doll.style.gridTemplateRows = 'repeat(' + plan.rows + ', auto)';
    plan.order.forEach(function(s){
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
      var pos = plan.pos[s];
      if(pos){ slot.style.gridColumn = pos[0]; slot.style.gridRow = pos[1]; }
      doll.appendChild(slot);
    });

    /* Stats pane — the summed bonuses of everything you're wearing. Its own tab
       rather than an always-on panel: it answers "how strong am I right now",
       which players check between fights, not every second. */
    var statsPane = document.createElement('div');
    statsPane.className = 'td-stats-pane';
    statsPane.innerHTML = window.renderEquipmentStatsHTML();

    /* Tabs — Equipment | Stats.
       b218 (backlog #3): the doll is rebuilt from scratch on every panel
       re-render (renderInvFancy fires on the game tick via updateTopbar/addItem;
       renderCharacter re-runs every 2s), and each rebuild hardcoded the Equipment
       pane active — so a player who opened Stats was snapped back to
       Equipment within seconds. Persist the selected pane in a single session-UI
       field (same window._* convention as _invFilter) and
       restore it on build so the choice survives auto-refresh. */
    var activePane = window._tdPane === 'stats' ? 'stats' : 'gear';
    var tabs = document.createElement('div');
    tabs.className = 'td-tabs';
    tabs.innerHTML =
      '<button class="td-tab'+(activePane==='gear'?' active':'')+'" data-td-pane="gear" title="Equipment">'+ slotGlyphSVG('body') +'<span>Equipment</span></button>'+
      '<button class="td-tab'+(activePane==='stats'?' active':'')+'" data-td-pane="stats" title="Stats">'+ slotGlyphSVG('weapon') +'<span>Stats</span></button>';
    function applyPane(pane){
      tabs.querySelectorAll('.td-tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-td-pane') === pane); });
      doll.style.display          = pane === 'gear'  ? '' : 'none';
      statsPane.style.display     = pane === 'stats' ? '' : 'none';
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
    applyPane(activePane);   // restore the persisted sub-tab on (re)build
    return wrap;
  }

  window.buildTibiaDoll = buildTibiaDoll;
})();
