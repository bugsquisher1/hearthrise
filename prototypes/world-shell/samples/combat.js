// prototypes/world-shell/samples/combat.js — SAMPLE 1 (prototype only; see combat.html).
// Draws six stills of one fight from the shipped atlases at the one density (x2):
// world art in art pixels, then the overlays at screen resolution, as the engine does.
const Z = 2;                    // the one pixel density (WORLD_SHELL §1)
const W = 112, H = 84;          // a still, in art px
const HERO_AT = [40, 66], FOE_AT = [76, 66], BAG_AT = [94, 70];   // the bag lands beside the body, never on it
const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

async function atlas(set) {
  const man = await fetch('assets/world/atlas-' + set + '.json').then((r) => r.json());
  const img = new Image();
  img.src = 'assets/world/' + man.image;
  await img.decode();
  return { man, img };
}
const [HERO, CELLAR] = await Promise.all([atlas('hero'), atlas('cellar')]);
await document.fonts.ready;

/* ── World layer (art px, drawn x2 with no smoothing) ─────────────────────── */
function sprite(g, A, id, anim, dir, i, [fx, fy], alpha = 1) {
  const sp = A.man.sprites[id], a = sp.anims[anim], frames = a.dirs[dir] || a.dirs.s;
  const [sx, sy] = frames[Math.min(i, frames.length - 1)], [w, h] = sp.frame;
  g.globalAlpha = alpha;
  g.drawImage(A.img, sx, sy, w, h, (fx - sp.anchor[0]) * Z, (fy - sp.anchor[1]) * Z, w * Z, h * Z);
  g.globalAlpha = 1;
}
function shadow(g, id, A, [fx, fy]) {
  const s = A.man.sprites[id].shadow;
  if (!s) return;
  g.globalAlpha = Number(css('--world-shadow-alpha')) || 0.38;
  g.fillStyle = css('--world-shadow');
  g.beginPath();
  g.ellipse((fx + s.dx) * Z, (fy + s.dy - 1) * Z, (s.w / 2) * Z, (s.h / 2) * Z, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}
function floor(g) {
  const t = CELLAR.man.terrain.cellar_earth, tiles = t.tiles['1111'], [cols, rows] = t.cycle;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    const [sx, sy] = tiles[(y % rows) * cols + (x % cols)];
    g.drawImage(CELLAR.img, sx, sy, 32, 32, x * 32 * Z, y * 32 * Z, 32 * Z, 32 * Z);
  }
  for (const [id, x, y] of [['pebbles', 18, 30], ['straw', 98, 76], ['grain_spill', 60, 22]]) sprite(g, CELLAR, id, 'idle', 's', 0, [x, y]);
}
/** The cellar's ambient light, multiplied over the world layer (the engine also adds point lights). */
function ambient(g) {
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = css('--world-light-cellar');
  g.fillRect(0, 0, W * Z, H * Z);
  g.globalCompositeOperation = 'source-over';
}

/* ── Overlay helpers (screen px) ──────────────────────────────────────────── */
const P = (x, y) => [Math.round(x * Z), Math.round(y * Z)];
function text(g, s, [x, y], px, fill, weight = 800, alpha = 1) {
  g.font = weight + ' ' + px + 'px ' + css('--f-ui');
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
  g.globalAlpha = alpha;
  g.lineWidth = Math.max(2, Math.round(px / 5));
  g.strokeStyle = css('--world-plate-line');
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
  g.globalAlpha = 1;
}
function bar(g, [cx, y], wArt, pct, tone, alpha = 1) {
  const w = wArt * Z, h = Math.max(3, Math.round(1.5 * Z)), x = Math.round(cx - w / 2);
  g.globalAlpha = alpha;
  g.fillStyle = css('--world-bar-back'); g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = css(tone); g.fillRect(x, y, Math.round(w * pct), h);
  g.globalAlpha = 1;
}

/* ── BEFORE: today's overlay rules (canvas-backend.js overlay()) ─────────── */
const oldFloat = (kind) => (kind === 'kill' ? 20 : 16);   // hit and crit share a size today
function before(g, s) {
  if (s.target) { g.strokeStyle = css('--world-target'); g.lineWidth = 2; g.strokeRect(...P(FOE_AT[0] - 14, FOE_AT[1] - 22), 28 * Z, 24 * Z); }
  if (s.foeBar != null) bar(g, P(FOE_AT[0], FOE_AT[1] - 25), 16, s.foeBar, '--world-bar-foe');
  bar(g, P(HERO_AT[0], HERO_AT[1] - 40), 16, 0.84, '--world-bar-hero');
  for (const f of s.floats || []) text(g, f.t, P(FOE_AT[0], FOE_AT[1] - 30 - f.rise), oldFloat(f.kind), css('--world-float-' + f.kind), 800, f.a || 1);
  text(g, 'Aldric', P(HERO_AT[0], HERO_AT[1] - 43), 12, css('--world-plate-self'), 700);
  if (s.foeName !== false) text(g, 'Giant Rat', P(FOE_AT[0], FOE_AT[1] - 28), 12, css('--world-plate-foe'), 700);
}

/* ── AFTER: the proposed system (ART_DIRECTION §11) ─────────────────────── */
// Target: a ground ring under the foe's feet, drawn BEFORE the sprite (never a box over it).
function ring(g, alpha) {
  const [x, y] = P(FOE_AT[0], FOE_AT[1]);
  g.globalAlpha = alpha;
  g.strokeStyle = css('--world-target');
  g.lineWidth = Z;
  g.beginPath(); g.ellipse(x, y - Z, 13 * Z, 5 * Z, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
}
// Floats: hit 16 px white; crit 22 px gold (1.35x); kill = the killing blow in the hit colour;
// heals green with a +; max 3 per actor, stacked upward, starting ABOVE the name plate so they never cover it.
const FLOAT_PX = { hit: 16, crit: 22, kill: 16, heal: 16, hurt: 16, miss: 14 };
function after(g, s) {
  if (s.foeBar != null) bar(g, P(FOE_AT[0], FOE_AT[1] - 25), 16, s.foeBar, '--world-bar-foe', s.barA || 1);
  bar(g, P(HERO_AT[0], HERO_AT[1] - 40), 16, 0.84, '--world-bar-hero');
  for (const f of s.floats || []) text(g, f.t, P(FOE_AT[0] + (f.dx || 0), FOE_AT[1] - 37 - f.rise), FLOAT_PX[f.kind], css(f.kind === 'crit' ? '--world-float-crit' : f.kind === 'kill' ? '--world-float-hit' : '--world-float-' + f.kind), 800, f.a || 1);
  // Names: the target's only (plus yours); a bystander foe has no plate.
  if (s.foeName !== false) text(g, 'Giant Rat', P(FOE_AT[0], FOE_AT[1] - 28), 12, css('--world-plate-foe'), 700, s.nameA || 1);
  if (s.label) text(g, s.label.t, P(BAG_AT[0], BAG_AT[1] - 32), 12, css(s.label.tone), 700);
}
// Loot: the bag pops in a 3-frame arc (art px offsets), then rests; rare loot adds a stepped light column.
function beam(g, tone) {
  const [x, y] = P(BAG_AT[0], BAG_AT[1] - 2);
  g.fillStyle = css(tone);
  [[0.42, 10], [0.26, 20], [0.12, 30]].forEach(([a, h]) => { g.globalAlpha = a; g.fillRect(x - 3 * Z, y - h * Z, 6 * Z, h * Z); });
  g.globalAlpha = 1;
}

// Every bag gets a 1-art-px ground mark so a dark sack reads on a dark floor: --ink-3 for common, the rarity colour above.
function lootMark(g, tone) {
  const [x, y] = P(BAG_AT[0], BAG_AT[1]);
  g.strokeStyle = css(tone); g.lineWidth = Z; g.globalAlpha = 0.8;
  g.beginPath(); g.ellipse(x, y - Z, 8 * Z, 3 * Z, 0, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
}

/* ── The six stills: world state, then each row's overlays ───────────────── */
const STILLS = [
  { cap: '<b>1 · Swing</b> 0 ms. Wind-up frame 2 of 7; the target is marked.', hero: ['attack', 2], foe: ['idle', 0], target: 1, foeBar: 1 },
  { cap: '<b>2 · Hit</b> 250 ms (hit frame 3). The rat plays its hit clip; the number rises 12 art px over 1 s.', hero: ['attack', 3], foe: ['hit', 1], target: 1, foeBar: 0.6, floats: [{ t: '12', kind: 'hit', rise: 2 }] },
  { cap: '<b>3 · Crit</b> 1.45 s. Bigger and gold, not a flash; no shake. The old number has risen and faded.', hero: ['attack', 3], foe: ['hit', 2], target: 1, foeBar: 0.1, floats: [{ t: '12', kind: 'hit', rise: 12, a: 0.35 }, { t: '27', kind: 'crit', rise: 2 }] },
  { cap: '<b>4 · Death</b> 2.7 s. Death clip at 10 fps; the bar and ring fade over 300 ms.', hero: ['idle', 0], foe: ['death', 3], target: 0.45, foeBar: 0, barA: 0.4, nameA: 0.5, floats: [{ t: '4', kind: 'kill', rise: 4 }] },
  { cap: '<b>5 · Loot pop</b> 3.4 s. The bag hops out beside the body (3-frame arc) and gets a ground mark; today it sits on the corpse and vanishes. Common loot: no world text.', hero: ['idle', 0], foe: ['corpse', 0], bag: -7, foeName: false },
  { cap: '<b>6 · Rare drop</b> 3.6 s. A stepped light column in the rarity colour (no bloom) and the item name for 4 s, plus the HUD toast below.', hero: ['idle', 0], foe: ['corpse', 0], bag: 0, rare: true, foeName: false, label: { t: 'Ruby', tone: '--rar-rare' } },
];

function still(s, row) {
  const c = document.createElement('canvas');
  c.width = W * Z; c.height = H * Z;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  floor(g);
  if (row === 'after' && s.target) ring(g, s.target);
  if (row === 'after' && s.rare) beam(g, '--rar-rare');
  shadow(g, 'hero', HERO, HERO_AT);
  if (s.foe[0] !== 'corpse' && s.foe[0] !== 'death') shadow(g, 'rat', CELLAR, FOE_AT);
  sprite(g, CELLAR, 'rat', s.foe[0], 'w', s.foe[1], FOE_AT);
  if (s.bag != null && row === 'before') sprite(g, CELLAR, 'loot_bag', 'idle', 's', 0, FOE_AT);   // today: on the corpse's own spot (choreo.js bags.push({ at }))
  if (s.bag != null && row === 'after') { lootMark(g, s.rare ? '--rar-rare' : '--ink-3'); sprite(g, CELLAR, 'loot_bag', 'idle', 's', 0, [BAG_AT[0], BAG_AT[1] + s.bag]); }
  sprite(g, HERO, 'hero', s.hero[0], 'e', s.hero[1], HERO_AT);
  ambient(g);
  (row === 'after' ? after : before)(g, s);
  const fig = document.createElement('figure');
  fig.appendChild(c);
  const cap = document.createElement('figcaption');
  cap.innerHTML = row === 'after' ? s.cap : s.cap.replace(/\. .*$/, '.') + (s.rare ? ' Today: the bag only in the world; the spoils veil covers the screen.' : '');
  fig.appendChild(cap);
  return fig;
}
for (const row of ['before', 'after']) {
  const host = document.querySelector('[data-row="' + row + '"]');
  for (const s of STILLS) host.appendChild(still(s, row));
}
document.body.dataset.ready = '1';
