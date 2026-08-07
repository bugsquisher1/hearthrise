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

  function scene() {
    return '<svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="hrbSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#160f24"/><stop offset="42%" stop-color="#352145"/>' +
          '<stop offset="70%" stop-color="#7c3a2c"/><stop offset="86%" stop-color="#c06a33"/>' +
          '<stop offset="100%" stop-color="#e7a24b"/></linearGradient>' +
        '<radialGradient id="hrbSun" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="#ffe7b3"/><stop offset="45%" stop-color="rgba(255,196,110,.55)"/>' +
          '<stop offset="100%" stop-color="rgba(255,180,90,0)"/></radialGradient>' +
      '</defs>' +
      '<rect width="1600" height="900" fill="url(#hrbSky)"/>' +
      '<circle cx="1180" cy="600" r="320" fill="url(#hrbSun)"/><circle cx="1180" cy="600" r="66" fill="#ffdfa4"/>' +
      '<g fill="#fff" opacity=".7">' + stars(40) + '</g>' +
      '<path d="M0,560 L180,430 L340,540 L520,440 L700,560 L900,470 L1100,560 L1320,470 L1600,560 V900 H0 Z" fill="#2a2038" opacity=".65"/>' +
      '<path d="M0,660 Q300,600 620,655 T1200,655 T1600,650 V900 H0 Z" fill="#241a2e" opacity=".9"/>' +
      '<path d="M0,745 Q420,695 820,742 T1600,740 V900 H0 Z" fill="#150e1c"/>' +
      '<g fill="#0d0912"><path d="M120,760 l24,60 l-48,0 z M120,735 l30,55 l-60,0 z"/>' +
        '<path d="M210,760 l24,60 l-48,0 z M210,735 l30,55 l-60,0 z"/>' +
        '<path d="M300,760 l24,60 l-48,0 z M300,735 l30,55 l-60,0 z"/>' +
        '<path d="M1360,760 l24,60 l-48,0 z M1360,735 l30,55 l-60,0 z"/>' +
        '<path d="M1460,760 l24,60 l-48,0 z M1460,735 l30,55 l-60,0 z"/></g>' +
      '<g transform="translate(700,690)"><rect x="-34" y="0" width="68" height="46" fill="#0d0912"/>' +
        '<path d="M-42,0 L0,-30 L42,0 Z" fill="#0d0912"/><rect x="-10" y="16" width="20" height="18" fill="#ffb84d"/></g>' +
      '</svg>' +
      '<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 30%,transparent 40%,rgba(10,7,14,.55)),linear-gradient(180deg,rgba(10,7,14,.25),rgba(10,7,14,.5))"></div>';
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
