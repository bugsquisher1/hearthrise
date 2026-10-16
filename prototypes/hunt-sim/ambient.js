'use strict';
// Ambient life for the sewer: torch light and flicker, water shimmer and flow, drips, wall-hugging roaches and
// dust motes. All in code, no art. World pixels: cell (x, y) centre = ((x + 1) * 32 + 16, (y + 1) * 32 + 16).
// Kept subtle: shadows tint the floor only (units are drawn after the shade), so combat stays readable.
const AMBIENT = (() => {
  const T = 32, W = GRID[0].length, H = GRID.length;
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? GRID[y][x] : 't');
  const floor = (x, y) => 'wab'.includes(at(x, y));
  const wall = (x, y) => 'to'.includes(at(x, y));
  const wx = x => (x + 1) * T + T / 2, wy = y => (y + 1) * T + T / 2;
  let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  // light sources: the map's wall torches and braziers (PixelLab placements), lit a little below the bracket
  const LIGHTS = [[5, 1, 't'], [11, 1, 't'], [2, 20, 't'], [4, 27, 't'], [26, 1, 't'], [40, 2, 't'], [45, 2, 't'], [41, 30, 't'], [52, 17, 't'],
    [54, 19, 'b'], [7, 14, 'b']].map(([x, y, k], i) => ({ x: wx(x), y: wy(y) + (k === 't' ? 22 : 4), r: k === 't' ? 92 : 104, seed: i * 1.7, torch: k === 't', fy: wy(y) }));
  const WATER = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 'd') WATER.push([x, y]);
  const RIM = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (floor(x, y) && (wall(x - 1, y) || wall(x + 1, y) || wall(x, y - 1) || wall(x, y + 1))) RIM.push([x, y]);
  const rimSet = new Set(RIM.map(([x, y]) => y * W + x));

  let time = 0;
  const drips = [], roaches = [], motes = [];
  for (const L of LIGHTS) for (let i = 0; i < 5; i++) motes.push({ L, ph: rand(), sx: rand() * 2 - 1, sp: 0.06 + rand() * 0.05 });

  function flicker(L) { return 1 + 0.07 * Math.sin(time * 9.3 + L.seed) + 0.04 * Math.sin(time * 23.1 + L.seed * 3) + 0.03 * Math.sin(time * 41 + L.seed * 7); }

  function update(dt, heroes, cam) {
    time += dt;
    // drips: one every ~0.5–1.3 s onto water near the camera
    if (rand() < dt / 0.9) {
      const near = WATER.filter(([x, y]) => Math.abs(wx(x) - cam.x) < 260 && Math.abs(wy(y) - cam.y) < 180);
      if (near.length) { const [x, y] = near[(rand() * near.length) | 0]; drips.push({ x: wx(x) + (rand() * 24 - 12) | 0, y: wy(y) + (rand() * 24 - 12) | 0, age: 0 }); }
    }
    for (let i = drips.length - 1; i >= 0; i--) if ((drips[i].age += dt) > 1.3) drips.splice(i, 1);
    // roaches: keep about 5 alive on wall rims near the camera
    while (roaches.length < 5) {
      const near = RIM.filter(([x, y]) => Math.abs(wx(x) - cam.x) < 300 && Math.abs(wy(y) - cam.y) < 200);
      if (!near.length) break;
      const [x, y] = near[(rand() * near.length) | 0];
      roaches.push({ x: wx(x) + (rand() * 20 - 10), y: wy(y) + (rand() * 20 - 10), tx: null, ty: null, wait: rand() * 2, leg: 0 });
    }
    for (let i = roaches.length - 1; i >= 0; i--) {
      const r = roaches[i];
      if (Math.abs(r.x - cam.x) > 420 || Math.abs(r.y - cam.y) > 300) { roaches.splice(i, 1); continue; }
      const scared = heroes.some(h => Math.hypot(h.x - r.x, h.y - r.y) < 52);
      if (r.wait > 0 && !scared) { r.wait -= dt; continue; }
      if (r.tx === null || Math.hypot(r.tx - r.x, r.ty - r.y) < 2) {
        // next stop: a neighbouring rim cell, so they hug the walls
        const cx = Math.floor(r.x / T) - 1, cy = Math.floor(r.y / T) - 1, opts = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && rimSet.has((cy + dy) * W + cx + dx)) opts.push([cx + dx, cy + dy]);
        if (!opts.length) { roaches.splice(i, 1); continue; }
        const [nx, ny] = opts[(rand() * opts.length) | 0];
        r.tx = wx(nx) + rand() * 16 - 8; r.ty = wy(ny) + rand() * 16 - 8;
        if (!scared && rand() < 0.35) r.wait = 0.4 + rand() * 1.6;
      }
      const sp = (scared ? 70 : 34) * dt, d = Math.hypot(r.tx - r.x, r.ty - r.y) || 1;
      r.x += (r.tx - r.x) / d * Math.min(sp, d); r.y += (r.ty - r.y) / d * Math.min(sp, d); r.leg += sp;
    }
  }

  // water: slow streaks drifting with the flow, a soft shimmer, and drip ripples
  function drawUnder(g, ox, oy, vw, vh) {
    for (const [x, y] of WATER) {
      const px = ox + (x + 1) * T, py = oy + (y + 1) * T;
      if (px < -T || py < -T || px > vw || py > vh) continue;
      const h = (x * 73 + y * 151) % 97;
      for (let i = 0; i < 2; i++) {
        const off = ((time * 7 + h * 3 + i * 16) % 32) | 0;           // flow: drifts south a few px per second
        const a = 0.07 + 0.06 * Math.sin(time * 1.7 + h + i * 2);
        g.fillStyle = `rgba(170,215,205,${a.toFixed(3)})`;
        g.fillRect(px + ((h + i * 13) % 22) + 2, py + off, 5 + (h % 4), 1);
      }
    }
    for (const d of drips) {
      const px = ox + d.x, py = oy + d.y;
      if (VFXLIB.draw(g, 'water_drop_splash', px, py, d.age)) continue;
      if (d.age < 0.25) { g.fillStyle = 'rgba(190,225,220,.8)'; g.fillRect(px, py - 12 + (d.age / 0.25) * 12 | 0, 1, 2); continue; }
      const r = (d.age - 0.25) / 1.05;
      g.strokeStyle = `rgba(190,225,220,${(0.5 * (1 - r)).toFixed(3)})`;
      g.beginPath(); g.ellipse(px + 0.5, py + 0.5, 2 + r * 9, 1 + r * 4, 0, 0, 7); g.stroke();
    }
    for (const r of roaches) {
      const px = Math.round(ox + r.x), py = Math.round(oy + r.y), legs = (r.leg | 0) % 4 < 2;
      g.fillStyle = '#2a1d16'; g.fillRect(px - 1, py, 3, 2);
      g.fillStyle = '#4a3324'; g.fillRect(px, py, 1, 1);
      g.fillStyle = '#1b130e'; g.fillRect(px - 2, py + (legs ? 0 : 1), 1, 1); g.fillRect(px + 2, py + (legs ? 1 : 0), 1, 1);
    }
  }

  // the shade: cool slate everywhere, cut away round each torch and softly round the party (readability)
  let shade = null, sg = null;
  function drawShade(g, ox, oy, vw, vh, heroes) {
    if (!shade || shade.width !== vw || shade.height !== vh) { shade = document.createElement('canvas'); shade.width = vw; shade.height = vh; sg = shade.getContext('2d'); }
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, vw, vh);
    sg.fillStyle = 'rgba(16,22,38,0.42)'; sg.fillRect(0, 0, vw, vh);
    sg.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, s) => {
      const gr = sg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${s})`); gr.addColorStop(0.55, `rgba(0,0,0,${s * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr; sg.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const L of LIGHTS) { const x = ox + L.x, y = oy + L.y; if (x > -150 && y > -150 && x < vw + 150 && y < vh + 150) hole(x, y, L.r * flicker(L), 0.95); }
    for (const h of heroes) hole(ox + h.x, oy + h.y - 6, 60, 0.45);
    g.drawImage(shade, 0, 0);
  }
  // warm amber pools on top (additive, low), plus dust motes drifting up through the light
  function drawGlow(g, ox, oy, vw, vh) {
    g.globalCompositeOperation = 'lighter';
    for (const L of LIGHTS) {
      const x = ox + L.x, y = oy + L.y, f = flicker(L), r = L.r * 0.8 * f;
      if (x < -150 || y < -150 || x > vw + 150 || y > vh + 150) continue;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,170,80,${(0.16 * f).toFixed(3)})`); gr.addColorStop(0.5, 'rgba(230,130,50,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    // sprite flame on each wall torch (vfx.js); the map's own bracket stays underneath
    for (const L of LIGHTS) if (L.torch) VFXLIB.draw(g, 'torch_flame_loop', ox + L.x, oy + L.fy - 2, time + L.seed);
    for (const m of motes) {
      const life = (time * m.sp + m.ph) % 1, x = ox + m.L.x + m.sx * 30 + Math.sin(time * 0.8 + m.ph * 9) * 6, y = oy + m.L.y + 20 - life * 70;
      if (x < 0 || y < 0 || x > vw || y > vh) continue;
      g.fillStyle = `rgba(255,214,150,${(0.55 * Math.sin(life * Math.PI)).toFixed(3)})`; g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  return { update, drawUnder, drawShade, drawGlow };
})();
