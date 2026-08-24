// ============================================================
// src/render/active-effects.js — Active Effects panel (render layer)
//
// SECOND render-layer strangler-fig extraction out of src/legacy.js
// (structural track, 2026-08-18). See docs/design/render-extraction-pattern.md
// for the playbook every extraction follows.
//
// WHAT THIS IS: the read-only "Active Effects" card on the Profile panel — a
// self-contained presentation surface (legacy.js block 8, "script-8"). It READS
// G.buffs / getBonus() / the clan blessing and paints #aef-body with live food
// buffs (mm:ss countdown), house bonuses, and (when clans ship) clan blessings.
// It writes NOTHING to game state, so its blast radius is a single card. That is
// why it was chosen: real innerHTML + a self-installing card injector + a live
// setInterval timer + a renderProfile re-wrap to exercise the pattern at panel
// scale, with essentially zero risk to the economy or save path.
//
// PURE REFACTOR. Byte-for-byte the same DOM and behaviour that used to live at
// legacy.js block 8 (injectActiveEffectsCard / _formatBuffKindLabel /
// renderActiveEffects / the 1s timer / the renderProfile hook / initial paint) —
// moved out, not redesigned. There are NO hardcoded theme colours in this JS: the
// emoji glyphs are pre-existing (left untouched, standing debt) and all colour
// lives in the .eff-* / .card selectors in src/styles/*.css, which are unchanged.
//
// Globals are read via window.* (the established src/features/* convention),
// resolved at call time so this script may load in any order after legacy.js.
// _formatBuffKindLabel is exclusive to this surface and stays module-private;
// only renderActiveEffects is re-exported onto window, because external callers
// (admin.js, item-ux.js, and legacy.js's buff/gold paths) invoke
// window.renderActiveEffects() to repaint after a buff or bonus changes.
// ============================================================
(function () {
  "use strict";

  /* 2026-08-23 — the "standing debt" the header above admits to is paid.
     Two icon slots in this file printed emoji: the LEGACY food-buff fallback
     (`def.icon` straight out of BUFFS_DEF) and a twelve-entry `houseIcons`
     table. Both draw gilt atlas glyphs now.
     `_aeGly` delegates to legacy's `buffGlyph`, which reads BUFFS_DEF[].glyph —
     ONE table for food buffs, so this fallback and the live buff-queue renderer
     cannot show different art for the same buff. */
  function _hrIcon(key, px) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, 'currentColor') || '') : '';
  }
  function _aeGly(type, px) {
    if (typeof window.buffGlyphHTML === 'function') return window.buffGlyphHTML(type, px || 16);
    return _hrIcon('uiPotion', px);
  }

  /* Self-installing card — inject the Active Effects card into the Profile grid.
     Idempotent (guards on #active-effects-card), so re-running is harmless. */
  (function injectActiveEffectsCard() {
    if (document.getElementById('active-effects-card')) return;
    var profile = document.getElementById('panel-profile');
    if (!profile) return;
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'active-effects-card';
    card.style.gridArea = 'auto';
    card.innerHTML = '\n' +
      '    <div class="card-head">\n' +
      '      <div class="card-title">Active Effects</div>\n' +
      '      <span class="card-sub" id="aef-sub">Live</span>\n' +
      '    </div>\n' +
      '    <div class="card-body eff-panel" id="aef-body"></div>';
    /* Append at the end of the profile grid so it flows alongside the existing cards */
    profile.appendChild(card);

    /* Sprinkle a sensible grid placement: ensure existing 5-card layout still works
       by adding aef as a 6th cell — let CSS auto-flow handle it on smaller widths. */
  })();

  /* Exclusive helper — was legacy.js _formatBuffKindLabel, used only by this surface. */
  function _formatBuffKindLabel(kind) {
    var map = {
      'allXP': 'all XP', 'combatXP': 'combat XP', 'hearthXP': 'hearth XP',
      'cookSpeed': 'cook speed', 'smithSpeed': 'smith speed', 'gatherSpeed': 'gather speed',
      'kitDrop': 'kit drop', 'craftSave': 'craft save', 'farmYield': 'farm yield',
      'farmYieldPct': 'bumper crops', 'noBurn': 'no-burn', 'storage': 'storage',
    };
    return map[kind] || kind.replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  function renderActiveEffects() {
    var G = window.G || {};
    var getBonus = window.getBonus;
    var pruneBuffs = window.pruneBuffs;
    var BUFFS_DEF = window.BUFFS_DEF;

    var el = document.getElementById('aef-body');
    if (!el) return;
    var out = [];

    /* 1. Food buffs — always emit the heading + a host div that the
       buff-queue feature (Phase A.2) populates. If that feature isn't
       loaded, we fall back to rendering legacy {id,expiresAt} buffs here. */
    out.push('<div class="eff-section-h">Food Buffs</div>');
    var hasNewBuffSystem = typeof window.__renderBuffsSection === 'function';
    if (hasNewBuffSystem) {
      out.push('<div id="food-buffs-host" data-managed-by="buff-queue"></div>');
    } else {
      var foods = (Array.isArray(G.buffs) ? G.buffs : []).slice();
      if (typeof pruneBuffs === 'function') pruneBuffs();
      if (foods.length) {
        foods.forEach(function (b) {
          var def = (typeof BUFFS_DEF !== 'undefined' && BUFFS_DEF) ? BUFFS_DEF[b.id] : null;
          if (!def) return;
          var remain = Math.max(0, Math.ceil((b.expiresAt - Date.now()) / 1000));
          var mm = Math.floor(remain / 60), ss = remain % 60;
          out.push('<div class="eff-row">' +
            '<div class="eicon">' + _aeGly(b.id) + '</div>' +
            '<div><b>' + def.name + '</b><div class="eff-effect">+' + Math.round(def.value * 100) + '% ' + _formatBuffKindLabel(def.kind) + '</div></div>' +
            '<div class="eff-time">' + mm + ':' + ss.toString().padStart(2, '0') + '</div>' +
            '</div>');
        });
      } else {
        out.push('<div class="eff-empty">No food buffs active. Cook buff foods to add bonuses.</div>');
      }
    }

    /* 2. House buffs (if getBonus exists) */
    out.push('<div class="eff-section-h">House Buffs</div>');
    if (typeof getBonus === 'function') {
      var keys = ['cookSpeed', 'smithSpeed', 'allXP', 'combatXP', 'hearthXP', 'kitDrop', 'craftSave', 'gatherSpeed', 'farmYield', 'farmYieldPct', 'noBurn', 'storage'];
      // ATLAS KEYS, not emoji. The old table was twelve system pictographs with
      // a comment apologising for how two emoji fonts drew them ("low-contrast
      // multicolor blocks in Segoe UI Emoji" — an argument against emoji, not
      // for a better emoji). A house bonus and the food buff that pays the same
      // bonusKey now draw the SAME gilt glyph, which is the whole point of
      // having one icon language.
      var houseGlyph = { cookSpeed: 'cooking', smithSpeed: 'smithing', allXP: 'uiXp', combatXP: 'uiTarget', hearthXP: 'uiFlame', kitDrop: 'uiGift', craftSave: 'crafting', gatherSpeed: 'uiLeaf', farmYield: 'uiWheat', farmYieldPct: 'farming', noBurn: 'uiFire', storage: 'uiChest' };
      var any = false;
      keys.forEach(function (k) {
        var v = getBonus(k);
        if (!v) return;
        any = true;
        var isFlat = (k === 'farmYield' || k === 'storage');
        /* b228: a flat bonus may now be fractional (the Bunny's +1 scales to
           +2.45, and the fraction is paid as a probability — see rollFlatBonus).
           Print one decimal when there is one, so the panel never rounds a real
           reward away the way harvestPlot used to. */
        var display = isFlat ? '+' + ((v % 1) ? (Math.round(v * 10) / 10) : v) : '+' + Math.round(v * 100) + '%';
        out.push('<div class="eff-row house">' +
          '<div class="eicon">' + _hrIcon(houseGlyph[k] || 'uiStar') + '</div>' +
          '<div><b>' + _formatBuffKindLabel(k).replace(/^./, function (c) { return c.toUpperCase(); }) + '</b><div class="eff-effect">' + display + '</div></div>' +
          '<div class="eff-time">House</div>' +
          '</div>');
      });
      if (!any) {
        out.push('<div class="eff-empty">No house buffs yet. Build rooms to unlock account-wide bonuses.</div>');
      }
    } else {
      out.push('<div class="eff-empty">No house buffs yet.</div>');
    }

    /* 3. Clan placeholder — only show this section once clans actually ship.
       Until then, the row was just exposing work-in-progress to players. */
    if (window.__clansEnabled) {
      out.push('<div class="eff-section-h">Clan Buffs</div>');
      var cb = window.getClanBlessing && window.getClanBlessing();
      if (cb) {
        out.push('<div class="eff-row">' +
          '<div class="eicon">' + _hrIcon('uiShield') + '</div>' +
          '<div><b>' + cb.name + '</b><div class="eff-effect">' + cb.effect + '</div></div>' +
          '<div class="eff-time">' + (cb.expiresLabel || 'Active') + '</div>' +
          '</div>');
      } else {
        out.push('<div class="eff-empty">Join a clan to receive blessings.</div>');
      }
    }

    el.innerHTML = out.join('');
  }
  window.renderActiveEffects = renderActiveEffects;

  /* Re-render on a tick so buff timers count down live.
     IMPORTANT: don't wipe innerHTML every second — that causes the entire
     Active Effects panel to flicker. Instead, find the existing timer
     elements and just update their text. Full re-render only fires when
     buffs are added/removed/expired (handled by applyBuff/pruneBuffs). */
  setInterval(function () {
    var pp = document.getElementById('panel-profile');
    if (!pp || !pp.classList.contains('active')) return;
    // Update food-buff timers (managed by buff-queue feature)
    if (typeof window.refreshBuffTimers === 'function') {
      window.refreshBuffTimers();
    }
    // Legacy fallback: update .eff-time spans if any pre-buff-queue rows exist
    var rows = document.querySelectorAll('#aef-body .eff-row:not(.house) .eff-time');
    rows.forEach(function (t) {
      // Only touch rows that have a mm:ss countdown — leave "House"/"—" alone
      if (/^\d+:\d{2}$/.test(t.textContent)) {
        // find the parent row; we don't have an idx mapping here so just
        // decrement by 1s. If something resets this we'll re-render full panel.
        var m = t.textContent.match(/^(\d+):(\d{2})$/);
        if (m) {
          var total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) - 1;
          if (total < 0) total = 0;
          var mm = Math.floor(total / 60);
          var ss = total % 60;
          t.textContent = mm + ':' + String(ss).padStart(2, '0');
        }
      }
    });
  }, 1000);

  /* Hook profile renders so it appears the first time too */
  var _prevRenderProfileEFF = window.renderProfile;
  if (typeof _prevRenderProfileEFF === 'function') {
    window.renderProfile = function () {
      _prevRenderProfileEFF.apply(this, arguments);
      setTimeout(renderActiveEffects, 0);
    };
  }

  /* Initial paint when this script loads */
  setTimeout(renderActiveEffects, 200);
  console.log('Active Effects panel: restored');
})();
