// ============================================================
// src/render/equipment-bonuses.js — Equipment bonuses presentation (render layer)
//
// FIFTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the READ-ONLY presentation surface of the equipment-bonus
// summary — renderEquipmentStatsHTML (builds the "summed bonuses of everything
// you're wearing" markup: bonus grid + armour-set line + worn list). It reads
// window.getEquipmentTotals() (the derived totals accessor), window.EQUIP_SLOT_META
// (slot labels), window.getArmorSetBonus() (the set-bonus computation) and
// window.MATERIAL_TIER_NAME (tier names) and paints. It neither computes nor mutates
// authoritative state — getEquipmentTotals / getArmorSetBonus are the LOGIC and
// stay in legacy.js; only the RENDER moved. Blast radius is the character-doll
// stats pane; zero risk to the economy or save path.
//
// b402: the standalone openEquipmentBonuses modal was retired here as confirmed
// dead code — the pop-out button that once opened it was removed long ago, leaving
// the function orphaned (zero live callers by bare call, inline onclick, or dynamic
// dispatch across src/**, index.html, tests/**). renderEquipmentStatsHTML remains
// the single live surface, consumed by buildTibiaDoll's Stats pane. Its modal-only
// CSS (.eqb-card/.eqb-head/.eqb-close in theme-cozy.css) was removed with it; the
// shared .eqb-grid/.eqb-row/.eqb-set classes stay (the Stats pane renders them).
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js window.renderEquipmentStatsHTML. There are NO hardcoded theme colours
// in this JS; the 🛡️ glyph is pre-existing content. All colour lives in the
// .eqb-* selectors in src/styles/{audit-overrides,theme-cozy}.css.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// renderEquipmentStatsHTML is re-exported onto window because legacy.js's
// buildTibiaDoll stats pane calls window.renderEquipmentStatsHTML() (two call sites).
// ============================================================
(function () {
  'use strict';

  window.renderEquipmentStatsHTML = function () {
    var t = window.getEquipmentTotals();
    var pct = { critB: 1, xpB: 1, spdB: 1 };
    var rows = t.fields.filter(function (f) { return t.totals[f[0]]; }).map(function (f) {
      var v = t.totals[f[0]];
      var shown = pct[f[0]] ? (Math.round(v * 1000) / 10) + '%' : (v >= 0 ? '+' : '') + v;
      return '<div class="eqb-row"><span>' + f[1] + '</span><b>' + shown + '</b></div>';
    }).join('') || '<div class="eqb-empty">Nothing equipped yet — gear up to see your bonuses here.</div>';
    var EQUIP_SLOT_META = window.EQUIP_SLOT_META || {};
    var wornList = t.worn.length
      ? t.worn.map(function (w) {
          var lbl = (EQUIP_SLOT_META[w.slot] && EQUIP_SLOT_META[w.slot].label) || w.slot;
          return '<div class="eqb-worn"><span>' + lbl + '</span><b>' + w.name + '</b></div>';
        }).join('')
      : '';
    /* Wave 5c: surface the armour SET bonus so completing a set is a legible goal. */
    var _set = (typeof window.getArmorSetBonus === 'function') ? window.getArmorSetBonus() : null;
    var setHtml = _set
      ? '<div class="eqb-set">🛡️ Set bonus · <b>' + _set.pieces + '-piece ' + ((window.MATERIAL_TIER_NAME && window.MATERIAL_TIER_NAME[_set.tier]) || ('Tier ' + _set.tier)) + '</b> — +' + Math.round(_set.critB * 100) + '% crit</div>'
      : '';
    return '<div class="eqb-grid">' + rows + '</div>' + setHtml +
      (wornList ? '<div class="eqb-sub">Equipped</div><div class="eqb-wornlist">' + wornList + '</div>' : '');
  };

  console.log('Equipment bonuses panel: loaded');
})();
