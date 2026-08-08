// ============================================================
// src/features/backdrop.js  (revamp b158)
//
// Atmosphere. Idle games (Idle Clans, Guilds of Mountgate) don't feel
// bland because they put a scenic BACKDROP behind the UI and float
// translucent "glass" panels on top of it — depth instead of a flat
// wash. This gives Hearthrise that, built in code (layered SVG dusk
// homestead scene) so it needs no art asset. Swap the SVG for a painted
// / rendered scene later without touching anything else.
//
// The backdrop layer is always present (cheap, behind everything). The
// glass-panel treatment is scoped to Hearthlight for now, so Cozy Day
// is untouched. Per-location backdrops (a scene per place) come with the
// world-map work.
// ============================================================
(function () {
  'use strict';

  function stars(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var x = (i * 137) % 1600, y = (i * 89) % 360, r = (i % 3) ? 0.9 : 1.6;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
    }
    return s;
  }

  // A crenellated tower: body + merlons on top.
  function tower(x, y, w, h) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>';
    var mw = w / 5;
    for (var i = 0; i < 3; i++) s += '<rect x="' + (x + i * 2 * mw) + '" y="' + (y - 9) + '" width="' + mw + '" height="9"/>';
    return s;
  }
  // Castle keep silhouette centred on cx, tops around baseY.
  function castle(cx, y) {
    return '<g fill="#06090c">' +
        '<rect x="' + (cx - 120) + '" y="' + (y + 40) + '" width="240" height="82"/>' +   // curtain wall
        tower(cx - 120, y + 18, 40, 104) + tower(cx + 80, y + 18, 40, 104) +               // flanking towers
        tower(cx - 32, y - 34, 64, 156) +                                                   // central keep (taller)
        '<path d="M' + (cx - 38) + ',' + (y - 34) + ' L' + cx + ',' + (y - 84) + ' L' + (cx + 38) + ',' + (y - 34) + ' Z"/>' + // conical roof
      '</g>' +
      '<g fill="#ffb457">' +   // warm lit windows (candle/torch)
        '<rect x="' + (cx - 8) + '" y="' + (y + 6) + '" width="16" height="22" rx="2"/>' +
        '<rect x="' + (cx - 110) + '" y="' + (y + 58) + '" width="10" height="15"/>' +
        '<rect x="' + (cx + 90) + '" y="' + (y + 58) + '" width="10" height="15"/>' +
      '</g>';
  }
  function pines() {
    var s = '<g fill="#05080a">', xs = [70, 150, 235, 1390, 1490, 1555];
    xs.forEach(function (x) { s += '<path d="M' + x + ',772 l22,55 l-44,0 z M' + x + ',746 l28,52 l-56,0 z M' + x + ',722 l32,50 l-64,0 z"/>'; });
    return s + '</g>';
  }

  function scene() {
    // Moody medieval dusk: overcast slate sky bleeding to a warm ember horizon
    // (no purple), fog on the far ridge, a lit castle keep, layered dark ridges
    // + pines. Original silhouette art — inspired by the mood of KCD/Witcher
    // dusk, not their assets.
    return '<svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="hrbSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#0b0e11"/><stop offset="38%" stop-color="#151b20"/>' +
          '<stop offset="64%" stop-color="#27241d"/><stop offset="84%" stop-color="#46331f"/>' +
          '<stop offset="100%" stop-color="#6b4522"/></linearGradient>' +
        '<radialGradient id="hrbGlow" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="rgba(240,180,110,.40)"/><stop offset="55%" stop-color="rgba(200,120,60,.13)"/>' +
          '<stop offset="100%" stop-color="rgba(200,120,60,0)"/></radialGradient>' +
        '<linearGradient id="hrbFog" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="rgba(150,158,160,0)"/><stop offset="100%" stop-color="rgba(150,158,160,.10)"/></linearGradient>' +
      '</defs>' +
      '<rect width="1600" height="900" fill="url(#hrbSky)"/>' +
      '<ellipse cx="820" cy="720" rx="540" ry="250" fill="url(#hrbGlow)"/>' +   // hidden-sun ember glow
      '<g fill="#c9d2dc" opacity=".32">' + stars(28) + '</g>' +
      '<path d="M0,600 L240,562 L520,596 L820,548 L1120,600 L1400,562 L1600,600 V900 H0 Z" fill="#1a2126" opacity=".7"/>' + // far ridge
      '<rect x="0" y="556" width="1600" height="150" fill="url(#hrbFog)"/>' +   // fog band
      castle(770, 468) +
      '<path d="M0,690 Q380,642 760,686 T1600,684 V900 H0 Z" fill="#0f141a" opacity=".96"/>' +   // mid ridge
      '<path d="M0,762 Q420,718 820,760 T1600,758 V900 H0 Z" fill="#080b0e"/>' +   // near ridge
      pines() +
      '</svg>' +
      '<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 26%,transparent 38%,rgba(6,8,10,.6)),linear-gradient(180deg,rgba(6,8,10,.28),rgba(6,8,10,.55))"></div>';
  }

  function css() {
    return [
      '#hr-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}',
      // keep app content above the backdrop
      '.app{position:relative}',
      '.main{position:relative;z-index:1}',
      // Hearthlight = glass panels over the scene. Cozy Day untouched.
      'body[data-theme="hearthlight"] .app{background:transparent !important}',
      'body[data-theme="hearthlight"] .main{background:transparent !important}',
      'body[data-theme="hearthlight"] .sidebar{background:linear-gradient(180deg,rgba(26,19,12,.82),rgba(18,13,8,.86)) !important;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
      'body[data-theme="hearthlight"] .topbar{background:rgba(28,22,16,.62) !important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
      'body[data-theme="hearthlight"] #panel-profile.active{background:transparent !important}',
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-card{background:rgba(38,29,20,.66) !important;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}',
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-pill,' +
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-tile,' +
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-qic,' +
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-mile-badge,' +
      'body[data-theme="hearthlight"] #panel-profile #hd-root .hd-mini .mi{background:rgba(255,255,255,.05) !important}'
    ].join('\n');
  }

  function mount() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', mount); return; }
    if (!document.getElementById('hr-backdrop-css')) {
      var st = document.createElement('style');
      st.id = 'hr-backdrop-css';
      st.textContent = css();
      document.head.appendChild(st);
    }
    if (!document.getElementById('hr-backdrop')) {
      var bd = document.createElement('div');
      bd.id = 'hr-backdrop';
      bd.innerHTML = scene();
      document.body.insertBefore(bd, document.body.firstChild);
    }
  }

  mount();
  window.HearthriseBackdrop = { mount: mount };
})();
