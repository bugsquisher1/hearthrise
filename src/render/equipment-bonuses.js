// ============================================================
// src/render/equipment-bonuses.js — Equipment bonuses presentation (render layer)
//
// FIFTH render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the two READ-ONLY presentation surfaces of the equipment-bonus
// summary — renderEquipmentStatsHTML (builds the "summed bonuses of everything
// you're wearing" markup: bonus grid + armour-set line + worn list) and
// openEquipmentBonuses (the standalone modal that wraps that markup). Both read
// window.getEquipmentTotals() (the derived totals accessor), window.EQUIP_SLOT_META
// (slot labels), window.getArmorSetBonus() (the set-bonus computation) and
// window.MATERIAL_TIER_NAME (tier names) and paint. Neither computes or mutates
// authoritative state — getEquipmentTotals / getArmorSetBonus are the LOGIC and
// stay in legacy.js; only the RENDER moved. Blast radius is one dialog + the
// character-doll stats pane; zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js window.renderEquipmentStatsHTML / window.openEquipmentBonuses — moved
// out, not redesigned. There are NO hardcoded theme colours in this JS: the only
// inline styles are colourless (event.stopPropagation on the card), and the 🛡️
// glyph is pre-existing content. All colour lives in the .eqb-* selectors in
// src/styles/{audit-overrides,theme-cozy}.css, which are already fully tokenised
// (var(--gold-2), var(--ink), var(--ink-3), ...) and are left unchanged.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// BOTH functions are re-exported onto window: renderEquipmentStatsHTML because
// legacy.js's buildTibiaDoll stats pane calls window.renderEquipmentStatsHTML()
// (two call sites), and openEquipmentBonuses so the standalone modal entry point
// stays reachable by bare global.
// ============================================================
(function () {
  'use strict';

  window.renderEquipmentStatsHTML = function () {
    var t = window.getEquipmentTotals();
    var pct = { critB: 1, xpB: 1, spdB: 1 };
    var rows = t.fields.filter(function (f) { return t.totals[f[0]]; }).map(function (f) {
      var v = t.totals[f[0]];
      var shown = pct[f[0]] ? (Math.round(v * 1000) / 10) + '%' : '+' + v;
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

  window.openEquipmentBonuses = function () {
    var body = window.renderEquipmentStatsHTML();
    var ov = document.getElementById('eqb-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'eqb-overlay'; ov.className = 'modal';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('show'); });
    }
    ov.innerHTML =
      '<div class="modal-card eqb-card" onclick="event.stopPropagation()">' +
        '<div class="eqb-head"><h3>Equipment bonuses</h3>' +
          '<button class="eqb-close" onclick="document.getElementById(\'eqb-overlay\').classList.remove(\'show\')" aria-label="Close">×</button></div>' +
        body +
      '</div>';
    ov.classList.add('show');
  };

  console.log('Equipment bonuses panel: loaded');
})();
