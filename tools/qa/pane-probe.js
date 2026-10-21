// tools/qa/pane-probe.js — paste as the `text` of the browser pane's javascript tool on a hunt
// (https://hearthrise.net/play.html). Measures for SECONDS (edit the first line), returns one object:
//   fps / p95 frame ms / long frames  — is the page itself slow?
//   stillSpans                        — stretches the hunt picture did not change (>= 300 ms): freezes
//   pictureChangedPct                 — share of samples (every 3rd frame) where the picture moved
//   accrueCallsPerMin                 — hunt-engine calls; dozens per minute = the live view is starving
// Read-only: it samples the world canvas and the page's resource timings, nothing else.
(async (SECONDS = 30) => {
  const cv = document.querySelector('canvas.world-canvas');
  if (!cv) return { error: 'no world canvas: open a hunt first' };
  const off = document.createElement('canvas'); off.width = 120; off.height = 72;
  const ox = off.getContext('2d', { willReadFrequently: true });
  const hash = () => { ox.drawImage(cv, 0, 0, 120, 72); const d = ox.getImageData(0, 0, 120, 72).data; let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0; return h; };
  performance.clearResourceTimings(); performance.setResourceTimingBufferSize(5000);
  const t0 = performance.now(); const frames = []; const still = []; let last = t0, lastH = null, since = null, changes = 0, n = 0;
  await new Promise((done) => {
    const f = (now) => {
      frames.push(now - last); last = now; n++;
      if (n % 3 === 0) { const h = hash(); if (h === lastH) { if (since === null) since = now; } else { changes++; if (since !== null && now - since >= 300) still.push([Math.round(since - t0), Math.round(now - since)]); since = null; } lastH = h; }
      if (now - t0 < SECONDS * 1000) requestAnimationFrame(f); else { if (since !== null) still.push([Math.round(since - t0), Math.round(now - since), 'open']); done(); }
    };
    requestAnimationFrame(f);
  });
  const fr = frames.slice(1).sort((a, b) => a - b);
  const calls = performance.getEntriesByType('resource').filter((e) => e.name.includes('hr-accrue')).length;
  const imgs = performance.getEntriesByType('resource').filter((e) => /\.png/.test(e.name)).length;
  return { seconds: SECONDS, fps: Math.round(fr.length / SECONDS), p95FrameMs: Math.round(fr[Math.floor(fr.length * 0.95)]),
    longFrames: fr.filter((x) => x > 50).length, stillSpans: still, pictureChangedPct: Math.round(changes / Math.max(1, Math.floor(n / 3)) * 100),
    accrueCallsPerMin: Math.round(calls / SECONDS * 60), imageRequests: imgs, origin: location.origin };
})()
