'use strict';
// Sprite VFX from assets/walk/vfx/manifest.json (frames, fps, anchor, loop, additive). Falls back to the drawn
// placeholder effects in sim.js when an effect is missing or not loaded yet.
const VFXLIB = (() => {
  const FX = {};
  fetch('assets/walk/vfx/manifest.json?v=48').then(r => r.ok ? r.json() : null).then(m => {
    if (!m) return;
    for (const [name, e] of Object.entries(m.effects || {})) {
      FX[name] = { frames: e.frames.map(p => { const i = new Image(); i.src = 'assets/walk/vfx/' + p + '?v=48'; return i; }),
        fps: e.fps, anchor: e.anchor, loop: !!e.loop, additive: !!e.additive };
    }
  }).catch(() => {});
  const ready = n => { const e = FX[n]; return !!(e && e.frames.length && e.frames.every(f => f.complete && f.naturalWidth)); };
  const dur = n => (FX[n] ? FX[n].frames.length / FX[n].fps : 0.5);
  // draw effect `n` with its anchor at screen pixel (x, y); age in seconds. angle rotates (projectiles only).
  function draw(g, n, x, y, age, angle) {
    if (!ready(n)) return false;
    const e = FX[n];
    let i = Math.floor(age * e.fps);
    if (e.loop) i %= e.frames.length; else if (i >= e.frames.length) return true;
    const im = e.frames[i];
    if (e.additive) g.globalCompositeOperation = 'lighter';
    if (angle) {
      g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(angle);
      g.drawImage(im, -e.anchor[0], -e.anchor[1]); g.restore();
    } else g.drawImage(im, Math.round(x - e.anchor[0]), Math.round(y - e.anchor[1]));
    g.globalCompositeOperation = 'source-over';
    return true;
  }
  return { draw, ready, dur, all: FX };
})();
