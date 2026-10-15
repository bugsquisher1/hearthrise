// prototypes/world-shell/samples/readability.js — see readability.html. PROTOTYPE ONLY.
const Z = 2, TILE = 32;
const [man, pal] = await Promise.all([
  fetch('assets/world/atlas-cellar.json').then((r) => r.json()),
  fetch('art/world/palette.json').then((r) => r.json()),
]);
const img = new Image();
img.src = 'assets/world/' + man.image;
await img.decode();
await document.fonts.ready;
const css = (k) => getComputedStyle(document.body).getPropertyValue(k).trim();

/* The atlas as pixels. */
const src = document.createElement('canvas');
src.width = img.width; src.height = img.height;
const sg = src.getContext('2d', { willReadFrequently: true });
sg.drawImage(img, 0, 0);

/* Palette ramps: colour -> [ramp, index]. A lift moves a colour one step up its ramp. */
const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const where = new Map();
for (const [name, ramp] of Object.entries(pal.ramps)) ramp.forEach((h, i) => where.set(h, [name, i]));
const lift = (h) => { const w = where.get(h); if (!w) return h; const ramp = pal.ramps[w[0]]; return ramp[Math.min(w[1] + 1, ramp.length - 1)]; };
const RIM = pal.ramps.stone[2];   // the lit outline: stone 3, the colour of lit cellar stone

function frameData(id) {
  const sp = man.sprites[id], [x, y] = (sp.anims.idle.dirs.e || sp.anims.idle.dirs.s)[0], [w, h] = sp.frame;
  return { sp, w, h, data: sg.getImageData(x, y, w, h) };
}
/** The edit preview: lift every non-outline pixel one ramp step; outline pixels facing up or left take the rim. */
function edited(f) {
  const out = new ImageData(new Uint8ClampedArray(f.data.data), f.w, f.h), d = out.data, s = f.data.data;
  const op = (x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && s[(y * f.w + x) * 4 + 3] >= 128;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const i = (y * f.w + x) * 4;
    if (s[i + 3] < 128) continue;
    const edge = !op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1);
    const lit = !op(x - 1, y) || !op(x, y - 1);
    const h = edge ? (lit ? RIM : hexOf(s[i], s[i + 1], s[i + 2])) : lift(hexOf(s[i], s[i + 1], s[i + 2]));
    d.set(rgbOf(h), i);
  }
  return out;
}
/* Contrast of the body edge (the ring just inside the outline) against the floor median. */
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const floorL = (() => {
  const L = [];
  for (const [x, y] of man.terrain.cellar_earth.tiles['1111']) { const d = sg.getImageData(x, y, TILE, TILE).data; for (let i = 0; i < d.length; i += 4) L.push(lum(d[i], d[i + 1], d[i + 2])); }
  return L.sort((a, b) => a - b)[L.length >> 1];
})();
function rimContrast(data, w, h) {
  const s = data.data, op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] >= 128;
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!op(x, y)) continue;
    const e1 = !op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1);
    const e2 = !op(x - 2, y) || !op(x + 2, y) || !op(x, y - 2) || !op(x, y + 2);
    if (!e1 && e2) { const i = (y * w + x) * 4; sum += lum(s[i], s[i + 1], s[i + 2]); n++; }
  }
  const L = sum / n;
  return (Math.max(L, floorL) + 0.05) / (Math.min(L, floorL) + 0.05);
}

/** A 3x2-tile patch of cellar earth with the sprite stood in the middle, under the cellar ambient. */
function patch(f, data) {
  const c = document.createElement('canvas');
  c.width = 3 * TILE * Z; c.height = 2 * TILE * Z;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const t = man.terrain.cellar_earth, [cols] = t.cycle;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) { const [sx, sy] = t.tiles['1111'][y * cols + x]; g.drawImage(img, sx, sy, TILE, TILE, x * TILE * Z, y * TILE * Z, TILE * Z, TILE * Z); }
  const tmp = document.createElement('canvas');
  tmp.width = f.w; tmp.height = f.h;
  tmp.getContext('2d').putImageData(data, 0, 0);
  const [ax, ay] = f.sp.anchor, fx = 48, fy = 52;
  g.drawImage(tmp, 0, 0, f.w, f.h, (fx - ax) * Z, (fy - ay) * Z, f.w * Z, f.h * Z);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = css('--world-light-cellar');
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
const host = document.querySelector('[data-out]');
for (const [id, label] of [['rat', 'Giant Rat'], ['slime', 'Slime'], ['loot_bag', 'Loot bag']]) {
  const f = frameData(id), e = edited(f);
  for (const [data, tag] of [[f.data, 'shipped'], [e, 'edit preview']]) {
    const fig = document.createElement('figure');
    fig.appendChild(patch(f, data));
    const cap = document.createElement('figcaption');
    cap.innerHTML = '<b>' + label + '</b> · ' + tag + '<br>body edge ' + rimContrast(data, f.w, f.h).toFixed(2) + ':1 to the floor';
    fig.appendChild(cap);
    host.appendChild(fig);
  }
}
document.body.dataset.ready = '1';
