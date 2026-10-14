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
    return '<g fill="#0a0806">' +
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
    var s = '<g fill="#080605">', xs = [70, 150, 235, 1390, 1490, 1555];
    xs.forEach(function (x) { s += '<path d="M' + x + ',772 l22,55 l-44,0 z M' + x + ',746 l28,52 l-56,0 z M' + x + ',722 l32,50 l-64,0 z"/>'; });
    return s + '</g>';
  }

  function scene() {
    // b217: the values here were cold slate-blue despite the comment below
    // saying otherwise (#0b0e11 sky, #1a2126 ridge, #c9d2dc stars). Where the
    // scene actually shows — the margins on landscape phones, the gutters —
    // it read as a blue photograph behind a warm-black game. Same composition,
    // re-pitched to the stone + ember palette.
    // Moody medieval dusk: overcast stone sky bleeding to a warm ember horizon
    // (no purple), fog on the far ridge, a lit castle keep, layered dark ridges
    // + pines. Original silhouette art — inspired by the mood of KCD/Witcher
    // dusk, not their assets.
    return '<svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="hrbSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#0e0c0a"/><stop offset="38%" stop-color="#191510"/>' +
          '<stop offset="64%" stop-color="#2a2118"/><stop offset="84%" stop-color="#4a3320"/>' +
          '<stop offset="100%" stop-color="#6f4622"/></linearGradient>' +
        '<radialGradient id="hrbGlow" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="rgba(240,180,110,.40)"/><stop offset="55%" stop-color="rgba(200,120,60,.13)"/>' +
          '<stop offset="100%" stop-color="rgba(200,120,60,0)"/></radialGradient>' +
        '<linearGradient id="hrbFog" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="rgba(168,150,124,0)"/><stop offset="100%" stop-color="rgba(168,150,124,.10)"/></linearGradient>' +
      '</defs>' +
      '<rect width="1600" height="900" fill="url(#hrbSky)"/>' +
      '<ellipse cx="820" cy="720" rx="540" ry="250" fill="url(#hrbGlow)"/>' +   // hidden-sun ember glow
      '<g fill="#e0d3b6" opacity=".32">' + stars(28) + '</g>' +
      '<path d="M0,600 L240,562 L520,596 L820,548 L1120,600 L1400,562 L1600,600 V900 H0 Z" fill="#221c15" opacity=".7"/>' + // far ridge
      '<rect x="0" y="556" width="1600" height="150" fill="url(#hrbFog)"/>' +   // fog band
      castle(770, 468) +
      '<path d="M0,690 Q380,642 760,686 T1600,684 V900 H0 Z" fill="#15110c" opacity=".96"/>' +   // mid ridge
      '<path d="M0,762 Q420,718 820,760 T1600,758 V900 H0 Z" fill="#0d0a07"/>' +   // near ridge
      pines() +
      '</svg>' +
      '<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 26%,transparent 38%,rgba(8,6,5,.6)),linear-gradient(180deg,rgba(8,6,5,.28),rgba(8,6,5,.55))"></div>';
  }

  // ============================================================
  // HOMESTEAD SCENE (b219) — the band behind Home.
  //
  // The global backdrop above is a castle on a ridge: the realm. It is also
  // completely occluded on every screen, because `body` and every `.panel`
  // paint an opaque surface over it — which is why Home read as "no
  // background" no matter what this module drew.
  //
  // So Home gets its own scene, composed INTO the page rather than hidden
  // behind it: a shallow dusk vista of the player's OWN holding, drawn at
  // 1600x420 and cropped to a band. It is tier-aware — a camp really is a
  // camp, and it grows into a castle as the homestead does, so the picture
  // never lies about your progress (no placeholder art).
  //
  // Every colour is a --scene-* token (theme-cozy.css). SVG elements carry
  // classes and are painted by sceneCss() below; nothing here is hardcoded.
  // ============================================================

  function starField(n, w, h) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var x = (i * 211) % w, y = (i * 67) % h, r = (i % 4) ? 0.9 : 1.5;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
    }
    return s;
  }

  /* Smoke drifting off a chimney or a fire. It leans downwind and thins as it
     climbs — stacked concentric puffs read as bubbles, not smoke. */
  function smoke(x, y) {
    return '<g class="hrs-smoke">' +
      '<ellipse cx="' + (x + 2) + '" cy="' + (y - 11) + '" rx="6" ry="4.5"/>' +
      '<ellipse cx="' + (x + 11) + '" cy="' + (y - 26) + '" rx="9" ry="5.5" opacity=".82"/>' +
      '<ellipse cx="' + (x + 24) + '" cy="' + (y - 44) + '" rx="13" ry="7" opacity=".58"/>' +
      '<ellipse cx="' + (x + 43) + '" cy="' + (y - 62) + '" rx="18" ry="8.5" opacity=".34"/>' +
      '<ellipse cx="' + (x + 68) + '" cy="' + (y - 78) + '" rx="24" ry="10" opacity=".16"/>' +
      '</g>';
  }
  // A rim of last light on an edge that faces the sun.
  function rim(d) { return '<path class="hrs-rim2" d="' + d + '"/>'; }
  // Haystacks — the cheapest possible signal that this is a working farm.
  function stacks(x, y) {
    return '<g class="hrs-build">' +
      '<path d="M' + x + ',' + y + ' q-16,-2 -18,-9 q2,-16 18,-24 q16,8 18,24 q-2,7 -18,9 z"/>' +
      '<path d="M' + (x + 40) + ',' + y + ' q-12,-2 -14,-7 q2,-12 14,-18 q12,6 14,18 q-2,5 -14,7 z"/>' +
      '</g>';
  }
  function lit(x, y, w, h) {
    return '<rect class="hrs-lit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1"/>';
  }
  function crenel(x, y, w, h, mw) {
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>', n = Math.floor(w / (mw * 2)) + 1;
    for (var i = 0; i < n; i++) {
      var mx = x + i * mw * 2;
      if (mx + mw > x + w) break;
      s += '<rect x="' + mx + '" y="' + (y - mw) + '" width="' + mw + '" height="' + mw + '"/>';
    }
    return s;
  }

  /* Ground line. The scene is authored at 1600x300 — the hearth band's own
     aspect — because the first cut was drawn at 1600x420 and then sliced into
     a 5.6:1 strip: the entire ember horizon ended up below the crop, so all
     that survived was dark sky and a black ridge. Draw for the frame you have. */
  var GY = 252;

  /* stage 0 — Wanderer's Camp. Every new player sees this one, so it has to
     be a CAMP and not two grey triangles: a big canvas tent with a guy-rope,
     a lean-to, a fire ring throwing real light, a handcart and a woodpile. */
  function stageCamp(cx) {
    return '<ellipse fill="url(#hrsFire)" cx="' + (cx + 96) + '" cy="' + (GY - 14) + '" rx="168" ry="66"/>' +
      '<g class="hrs-build">' +
        '<path d="M' + (cx - 62) + ',' + GY + ' L' + (cx - 10) + ',' + (GY - 84) + ' L' + (cx + 42) + ',' + GY + ' Z"/>' +
        '<path d="M' + (cx - 12) + ',' + (GY - 84) + ' l-4,-19 l18,7 l-14,5 z"/>' +   // pennant
        '<path d="M' + (cx + 30) + ',' + GY + ' L' + (cx + 56) + ',' + (GY - 42) + ' L' + (cx + 82) + ',' + GY + ' Z"/>' +
        // handcart: bed, shafts, wheel
        '<path d="M' + (cx + 150) + ',' + (GY - 14) + ' h44 l-6,14 h-44 z"/>' +
        '<path d="M' + (cx + 194) + ',' + (GY - 13) + ' l20,-9 l3,5 l-20,9 z"/>' +
        '<circle cx="' + (cx + 166) + '" cy="' + (GY - 2) + '" r="8"/>' +
        '<rect x="' + (cx + 218) + '" y="' + (GY - 9) + '" width="26" height="9" rx="3"/>' +
      '</g>' +
      // Firelight through the tent mouth — shaped like an open flap standing on
      // the ground, not a lit rectangle floating inside the canvas.
      '<path class="hrs-lit" d="M' + (cx - 26) + ',' + GY + ' L' + (cx - 12) + ',' + (GY - 44) + ' L' + (cx + 2) + ',' + GY + ' Z"/>' +
      '<path class="hrs-lit" d="M' + (cx + 88) + ',' + GY + ' q4,-22 12,-6 q5,-22 11,3 q8,-12 4,3 z"/>' +
      '<ellipse fill="url(#hrsFire2)" cx="' + (cx + 100) + '" cy="' + (GY - 8) + '" rx="58" ry="32"/>' +
      smoke(cx + 100, GY - 26);
  }

  // stage 1 — the cottage: pitched roof, lit windows, chimney, a paddock fence.
  function stageCottage(cx, withBarn) {
    var s = '<ellipse fill="url(#hrsFire)" cx="' + cx + '" cy="' + (GY - 26) + '" rx="200" ry="76"/>' +
      '<g class="hrs-build">' +
        '<rect x="' + (cx - 48) + '" y="' + (GY - 54) + '" width="96" height="54"/>' +
        // lean-to on the shaded side, so the cottage isn't one plain box
        '<path d="M' + (cx - 82) + ',' + GY + ' V' + (GY - 26) + ' L' + (cx - 46) + ',' + (GY - 40) + ' V' + GY + ' Z"/>' +
        '<path d="M' + (cx - 63) + ',' + (GY - 52) + ' L' + cx + ',' + (GY - 96) + ' L' + (cx + 63) + ',' + (GY - 52) + ' Z"/>' +
        '<rect x="' + (cx + 24) + '" y="' + (GY - 108) + '" width="15" height="38"/>' +
        '<rect x="' + (cx + 21) + '" y="' + (GY - 112) + '" width="21" height="6"/>' +
      '</g>' +
      rim('M' + cx + ',' + (GY - 96) + ' L' + (cx + 63) + ',' + (GY - 52)) +
      lit(cx - 37, GY - 41, 17, 15) + lit(cx + 20, GY - 41, 17, 15) +
      '<rect class="hrs-build-2" x="' + (cx - 8) + '" y="' + (GY - 28) + '" width="16" height="28"/>' +
      smoke(cx + 31, GY - 112);
    if (withBarn) {
      s += '<g class="hrs-build">' +
          '<rect x="' + (cx + 88) + '" y="' + (GY - 37) + '" width="70" height="37"/>' +
          '<path d="M' + (cx + 81) + ',' + (GY - 36) + ' L' + (cx + 123) + ',' + (GY - 64) + ' L' + (cx + 165) + ',' + (GY - 36) + ' Z"/>' +
        '</g>' + lit(cx + 115, GY - 24, 14, 13) +
        rim('M' + (cx + 123) + ',' + (GY - 64) + ' L' + (cx + 165) + ',' + (GY - 36)) +
        stacks(cx + 196, GY);
    }
    s += '<g class="hrs-fence">' +
      '<path d="M' + (cx - 236) + ',' + (GY - 5) + ' H' + (cx - 92) + ' M' + (cx - 236) + ',' + (GY - 14) + ' H' + (cx - 92) + '"/>';
    for (var i = 0; i < 6; i++) s += '<path d="M' + (cx - 232 + i * 28) + ',' + (GY + 2) + ' V' + (GY - 20) + '"/>';
    return s + '</g>';
  }

  // stage 2 — hall + watchtower behind a low curtain wall.
  function stageManor(cx, tall) {
    var th = tall ? 122 : 98;
    return '<ellipse fill="url(#hrsFire)" cx="' + cx + '" cy="' + (GY - 44) + '" rx="250" ry="96"/>' +
      '<g class="hrs-build">' +
        crenel(cx - 142, GY - 30, 284, 30, 10) +
        '<rect x="' + (cx - 68) + '" y="' + (GY - 88) + '" width="136" height="88"/>' +
        '<path d="M' + (cx - 81) + ',' + (GY - 86) + ' L' + cx + ',' + (GY - 130) + ' L' + (cx + 81) + ',' + (GY - 86) + ' Z"/>' +
        crenel(cx + 88, GY - th, 48, th, 12) +
        '<rect x="' + (cx - 37) + '" y="' + (GY - 146) + '" width="14" height="42"/>' +
      '</g>' +
      rim('M' + cx + ',' + (GY - 130) + ' L' + (cx + 81) + ',' + (GY - 86)) +
      rim('M' + (cx + 88) + ',' + (GY - th - 12) + ' H' + (cx + 136)) +
      lit(cx - 48, GY - 72, 15, 21) + lit(cx - 7, GY - 72, 15, 21) + lit(cx + 33, GY - 72, 15, 21) +
      lit(cx + 102, GY - th + 20, 13, 19) +
      smoke(cx - 30, GY - 150);
  }

  // stage 3 — Hearthrise Castle: keep, flanking towers, the banner.
  function stageCastle(cx) {
    return '<ellipse fill="url(#hrsFire)" cx="' + cx + '" cy="' + (GY - 62) + '" rx="300" ry="120"/>' +
      '<g class="hrs-build">' +
        crenel(cx - 178, GY - 40, 356, 40, 12) +
        crenel(cx - 178, GY - 100, 50, 100, 13) + crenel(cx + 128, GY - 100, 50, 100, 13) +
        '<rect x="' + (cx - 48) + '" y="' + (GY - 158) + '" width="96" height="158"/>' +
        '<path d="M' + (cx - 55) + ',' + (GY - 156) + ' L' + cx + ',' + (GY - 206) + ' L' + (cx + 55) + ',' + (GY - 156) + ' Z"/>' +
        '<rect x="' + (cx - 2) + '" y="' + (GY - 238) + '" width="4" height="36"/>' +
        '<path d="M' + (cx + 2) + ',' + (GY - 236) + ' l36,11 l-36,11 z"/>' +
      '</g>' +
      rim('M' + cx + ',' + (GY - 206) + ' L' + (cx + 55) + ',' + (GY - 156)) +
      rim('M' + (cx + 128) + ',' + (GY - 113) + ' H' + (cx + 178)) +
      lit(cx - 28, GY - 138, 17, 24) + lit(cx + 11, GY - 138, 17, 24) +
      lit(cx - 24, GY - 92, 17, 24) + lit(cx + 7, GY - 92, 17, 24) +
      lit(cx - 161, GY - 78, 15, 21) + lit(cx + 145, GY - 78, 15, 21) +
      smoke(cx + 66, GY - 168);
  }

  /* The holding sits a little right of centre — clear of the identity block on
     the left AND clear of the day's ledger pinned to the band's right edge.
     At 68% across it collided with the ledger on every viewport. */
  function stageFor(tier) {
    if (tier >= 5) return stageCastle(896);
    if (tier >= 3) return stageManor(892, tier >= 4);
    if (tier >= 1) return stageCottage(906, tier >= 2);
    return stageCamp(890);
  }

  // Windmill on the far right — the "idle homestead" signature. Present from
  // the farmstead tier, when the holding actually has fields to mill.
  function windmill(cx, on) {
    if (!on) return '';
    return '<g class="hrs-build">' +
        '<path d="M' + (cx - 15) + ',' + GY + ' L' + (cx - 10) + ',' + (GY - 70) + ' H' + (cx + 10) + ' L' + (cx + 15) + ',' + GY + ' Z"/>' +
        '<path d="M' + (cx - 14) + ',' + (GY - 68) + ' L' + cx + ',' + (GY - 86) + ' L' + (cx + 14) + ',' + (GY - 68) + ' Z"/>' +
      '</g>' +
      '<g class="hrs-sail" transform="translate(' + cx + ',' + (GY - 74) + ')">' +
        '<path d="M-2,-2 L-40,-27 L-34,-34 L2,-6 Z"/><path d="M2,-2 L40,-27 L34,-34 L-2,-6 Z"/>' +
        '<path d="M-2,2 L-40,27 L-34,34 L2,6 Z"/><path d="M2,2 L40,27 L34,34 L-2,6 Z"/>' +
      '</g>';
  }

  function pineRow(xs, base, scale) {
    var s = '<g class="hrs-tree">';
    xs.forEach(function (x) {
      var h = 46 * scale, w = 17 * scale;
      s += '<path d="M' + x + ',' + base + ' l' + w + ',' + (h * .46) + ' l' + (-w * 2) + ',0 z' +
        ' M' + x + ',' + (base - h * .28) + ' l' + (w * 1.2) + ',' + (h * .44) + ' l' + (-w * 2.4) + ',0 z' +
        ' M' + x + ',' + (base - h * .54) + ' l' + (w * 1.4) + ',' + (h * .42) + ' l' + (-w * 2.8) + ',0 z"/>';
    });
    return s + '</g>';
  }

  function homesteadScene(tier) {
    var t = tier | 0;
    return '<svg class="hrs-svg" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="hrsSky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="hrs-s0" offset="0%"/><stop class="hrs-s1" offset="26%"/>' +
          '<stop class="hrs-s2" offset="43%"/><stop class="hrs-s3" offset="53%"/>' +
          '<stop class="hrs-s4" offset="62%"/></linearGradient>' +
        '<radialGradient id="hrsGlow" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrs-g0" offset="0%"/><stop class="hrs-g1" offset="48%"/><stop class="hrs-g2" offset="100%"/></radialGradient>' +
        '<linearGradient id="hrsHaze" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="hrs-h0" offset="0%"/><stop class="hrs-h1" offset="100%"/></linearGradient>' +
        /* Firelight has to fall off. Painted as a flat ellipse it rendered as
           a hard-edged amber lozenge floating in the sky — the single most
           "generated" thing on the screen. */
        '<radialGradient id="hrsFire" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrs-f0" offset="0%"/><stop class="hrs-f1" offset="100%"/></radialGradient>' +
        '<radialGradient id="hrsFire2" cx="50%" cy="50%" r="50%">' +
          '<stop class="hrs-f2" offset="0%"/><stop class="hrs-f1" offset="100%"/></radialGradient>' +
      '</defs>' +
      '<rect width="1600" height="300" fill="url(#hrsSky)"/>' +
      // The hidden sun: a pocket of light sitting ON the horizon behind the
      // holding, not a wash over the whole band. A wide soft glow flattened
      // every silhouette into one brown haze.
      '<ellipse cx="960" cy="176" rx="470" ry="98" fill="url(#hrsGlow)"/>' +
      '<g class="hrs-star">' + starField(34, 1600, 118) + '</g>' +
      // far ridge — the skyline, cut against the light
      '<path class="hrs-ridge-far" d="M0,178 L190,150 L410,182 L660,138 L900,186 L1150,146 L1380,180 L1600,152 V300 H0 Z"/>' +
      '<path class="hrs-rim" d="M660,138 L900,186 L1150,146 L1380,180 L1600,152"/>' +
      '<rect x="0" y="150" width="1600" height="86" fill="url(#hrsHaze)"/>' +
      pineRow([84, 122, 168, 1462, 1508, 1552], 196, .72) +
      // mid ridge — the shelf the holding stands on
      '<path class="hrs-ridge-mid" d="M0,214 Q300,190 640,212 T1240,208 T1600,198 V300 H0 Z"/>' +
      windmill(1204, t >= 2) +
      stageFor(t) +
      // near ridge + the cart track climbing to the holding, catching the light
      '<path class="hrs-ridge-near" d="M0,' + (GY + 6) + ' Q340,' + (GY - 12) + ' 700,' + (GY + 5) + ' T1330,' + (GY + 3) + ' T1600,' + (GY - 4) + ' V300 H0 Z"/>' +
      '<path class="hrs-track" d="M250,300 Q560,288 740,270 T874,' + (GY - 1) + ' L836,' + (GY - 1) + ' Q690,278 520,292 T130,300 Z"/>' +
      '<g class="hrs-furrow">' +
        '<path d="M-40,292 Q300,276 620,288"/><path d="M-40,276 Q340,260 700,272"/>' +
        '<path d="M1010,280 Q1300,266 1620,278"/>' +
      '</g>' +
      pineRow([24, 60, 1548, 1590], GY + 8, 1.05) +
      '</svg>';
  }

  function sceneCss() {
    return [
      '.hrs-svg{position:absolute;inset:0;width:100%;height:100%;display:block}',
      '.hrs-s0{stop-color:var(--scene-sky-0)}.hrs-s1{stop-color:var(--scene-sky-1)}',
      '.hrs-s2{stop-color:var(--scene-sky-2)}.hrs-s3{stop-color:var(--scene-sky-3)}',
      '.hrs-s4{stop-color:var(--scene-sky-4)}',
      '.hrs-g0{stop-color:var(--scene-glow-1)}.hrs-g1{stop-color:var(--scene-glow-2)}',
      '.hrs-g2{stop-color:var(--scene-glow-0)}',
      '.hrs-h0{stop-color:var(--scene-haze-0)}.hrs-h1{stop-color:var(--scene-haze-1)}',
      '.hrs-star circle{fill:var(--scene-star);opacity:.34}',
      '.hrs-ridge-far{fill:var(--scene-ridge-far)}',
      '.hrs-ridge-mid{fill:var(--scene-ridge-mid)}',
      '.hrs-ridge-near{fill:var(--scene-ridge-near)}',
      '.hrs-tree path{fill:var(--scene-tree)}',
      '.hrs-build,.hrs-build path,.hrs-build rect,.hrs-build circle{fill:var(--scene-build)}',
      '.hrs-build-2{fill:var(--scene-build-2)}',
      '.hrs-sail path{fill:var(--scene-build-2)}',
      '.hrs-fence path{stroke:var(--scene-build);stroke-width:3;fill:none}',
      '.hrs-furrow path{stroke:var(--scene-furrow);stroke-width:2;fill:none}',
      '.hrs-rim{stroke:var(--scene-rim);stroke-width:2;fill:none}',
      '.hrs-rim2{stroke:var(--scene-rim);stroke-width:1.6;fill:none;stroke-linecap:round}',
      '.hrs-track{fill:var(--scene-track)}',
      '.hrs-lit{fill:var(--scene-lit)}',
      '.hrs-smoke ellipse{fill:var(--scene-smoke)}',
      '.hrs-f0{stop-color:var(--scene-firelight)}.hrs-f1{stop-color:var(--scene-fire-0)}',
      '.hrs-f2{stop-color:var(--scene-litglow)}',
      // The sails turn — slowly, once every 14s. One moving thing makes the
      // picture a place instead of a wallpaper; more would be a distraction.
      '.hrs-sail{transform-box:fill-box;transform-origin:50% 50%;animation:hrs-turn 14s linear infinite}',
      '@keyframes hrs-turn{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.hrs-sail{animation:none}}'
    ].join('\n');
  }

  function css() {
    return [
      sceneCss(),
      '#hr-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}',
      // keep app content above the backdrop
      '.app{position:relative}',
      '.main{position:relative;z-index:1}',
      // Hearthlight = glass panels over the scene. Cozy Day untouched.
      'body[data-theme="hearthlight"] .app{background:transparent !important}',
      'body[data-theme="hearthlight"] .main{background:transparent !important}',
      'body[data-theme="hearthlight"] .sidebar{background:linear-gradient(180deg,rgba(26,19,12,.82),rgba(18,13,8,.86)) !important;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
      'body[data-theme="hearthlight"] .topbar{background:rgba(28,22,16,.62) !important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
      /* b219: the b216 Home overrides that used to live here are gone. They
         were written when Home floated transparent cards straight over the
         global backdrop; b217 rebuilt Home as hairline-separated rows on the
         panel surface, and these rules — two IDs plus an attribute, so they
         outranked the component's own CSS — silently undid it:
           · .hd-card got an opaque plate and a 10px backdrop-filter, twelve
             blurred layers per render for a picture that is not behind them;
           · .hd-mile-badge lost its struck-metal disc to a flat 5% white,
             which is why the milestone/renown/daily badges read as grey pucks.
         Home now carries its own scene in the hearth band, so it needs no help
         from the global backdrop layer. Deleting them restores the intended
         art and drops the blur cost. */
      ''
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
  window.HearthriseBackdrop = { mount: mount, homesteadScene: homesteadScene };
})();
