'use strict';
// Hearthrise hunt-sim: a standalone proof of concept of an automated party hunt in the
// style-1 sewer. Combat numbers live in combat-data.js with a source per number.

const CONFIG = {
  tile: 32, scale: 2, dt: 1 / 30,
  swing: COMBAT.swing,        // combat-data.js: the universal 2.0 s basic attack
  heroRespawnSec: 8,          // ASSUMED: a dead hero reappears at the entrance
  pullDist: 1.5,              // pack aggros when the knight, inside its room, is this close to the pack centre
  respawnSec: 90,             // ASSUMED pack respawn
  corpseSec: 10,              // a corpse lingers, fading over its last 2 s
  regroupSec: 1.5,
  oocRegenPct: 0.06,          // ASSUMED out-of-combat HP regen per second (Prayer regen is OPEN, BIBLE section 7.2)
  peelChance: 0.18,           // ASSUMED: chance scale for a druid attack pulling a queued monster onto her
  heroes: HEROES,
  monsters: MONSTERS,
  // the route, pocket by pocket; spawn tiles come from the PixelLab map placements
  pockets: [
    { name: 'NW room',      room: [3, 2, 12, 10],  spawns: [['rat', 7, 4], ['rat', 8, 3], ['rat', 9, 4], ['rat', 8, 5]] },
    { name: 'SW room',      room: [2, 27, 13, 34], spawns: [['slime', 6, 31], ['slime', 7, 30], ['slime', 8, 31]] },
    { name: 'Channel west', room: [26, 24, 37, 34], spawns: [['bat', 30, 27], ['bat', 31, 29]] },
    { name: 'NE room',      room: [38, 2, 48, 12], spawns: [['spider', 41, 5], ['spider', 43, 5], ['bat', 42, 4], ['bat', 44, 6]] },
    { name: 'SE room',      room: [40, 30, 50, 37], spawns: [['kobold', 43, 35], ['kobold', 44, 34], ['kobold', 45, 35]] },
    { name: 'Rat King',     room: [51, 17, 57, 29], spawns: [['ratking', 55, 23], ['rat', 54, 21], ['rat', 54, 25]] },
  ],
  start: [[0, 21], [0, 20], [0, 22], [1, 21]],
};

const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
const W = GRID[0].length, H = GRID.length;
const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && 'wab'.includes(GRID[y][x]);
const opaque = (x, y) => !(x >= 0 && y >= 0 && x < W && y < H) || 'to'.includes(GRID[y][x]);
const key = (x, y) => y * W + x;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const eu = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inRoom = (i, x, y) => { const r = CONFIG.pockets[i].room; return x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]; };

// ---------- images ----------
const IMG = {};
// Every asset URL carries this build's ?v= (read from our own <script> tag), so a new build always fetches fresh
// art: same-named sprites were being served stale from the browser cache (Tyler saw the old Viking, 10-16).
const ASSET_V = ((document.querySelector('script[src*="sim.js"]') || {}).src || '').match(/[?&]v=(\d+)/)?.[1] || String(Date.now());
const vurl = src => src + (src.includes('?') ? '&' : '?') + 'v=' + ASSET_V;
function loadImg(src) { const i = new Image(); i.src = vurl(src); return i; }
IMG.map = loadImg('assets/sewer_map.png');
IMG.cup = loadImg('assets/icons/drink_cup.png');
for (const n of ['knight', 'paladin', 'druid', 'sorcerer', ...Object.keys(CONFIG.monsters)]) {
  IMG[n] = {}; for (const d of DIRS) IMG[n][d] = loadImg(`assets/${n}/${d}.png`);
}
// berserker: its own art if assets/berserker/ exists, the knight's otherwise (per direction, on load error)
IMG.berserker = {};
for (const d of DIRS) { const i = loadImg(`assets/berserker/${d}.png`); i.onerror = () => { IMG.berserker[d] = IMG.knight[d]; }; IMG.berserker[d] = i; }
// optional walk cycles (assets/walk/manifest.json); static rotations otherwise
let WALK = null;
fetch(vurl('assets/walk/manifest.json')).then(r => r.ok ? r.json() : null).then(m => { if (m) WALK = prepWalk(m); }).catch(() => {});
// manifest unit names -> sim kinds
const WALK_NAME = { giant_rat: 'rat', giant_bat: 'bat', venom_spider: 'spider', rat_king: 'ratking' };
function prepWalk(m) {
  const out = {};
  for (const [name, u] of Object.entries(m.units || {})) {
    const walk = {}, idle = {};
    for (const [d, list] of Object.entries(u.directions || {})) walk[d] = list.map(p => loadImg('assets/walk/' + p));
    for (const [d, p] of Object.entries(u.idle || {})) idle[d] = loadImg('assets/walk/' + p);
    for (const [d, src] of Object.entries(u.fallback || {})) if (!walk[d] && walk[src]) walk[d] = walk[src];
    const w = out[WALK_NAME[name] || name] = { walk, idle, fps: u.fps || 8, anchor: u.foot_anchor || null, hover: !!u.hover, mask: null };
    if (u.regions) {    // recolourable regions (hat/robe/trim ...): one mask frame per sprite frame, mask colour = region
      w.mask = { legend: u.regions.legend || {}, walk: {}, idle: {} };
      for (const [d, list] of Object.entries(u.regions.walk || {})) w.mask.walk[d] = list.map(p => loadImg('assets/walk/' + p));
      for (const [d, p] of Object.entries(u.regions.idle || {})) w.mask.idle[d] = loadImg('assets/walk/' + p);
    }
  }
  return out;
}

// ---------- outfits and recolour ----------
// An OUTFIT is a sprite set (assets/walk/<outfit>/), independent of the ROLE (the ability/stat set). An outfit with region
// masks (the witch: hat / robe / trim) can be recoloured per region: at load, into an offscreen canvas, never smoothed.
// Recolour keeps each pixel's value (brightness) and swaps hue + saturation to the picked colour.
const OUTFITS = { knight: 'Knight', berserker: 'Berserker', brute: 'Quarry Brute', paladin: 'Paladin', druid: 'Druid', sorcerer: 'Sorcerer', witch: 'Witch', dawnward: 'Dawnward Paladin' };
const DEFAULT_OUTFIT = { knight: 'knight', berserker: 'berserker', paladin: 'paladin', sorcerer: 'sorcerer', druid: 'druid' };
const outfitRegions = o => (WALK && WALK[o] && WALK[o].mask) ? Object.keys(WALK[o].mask.legend) : [];
const RECOLOR = new Map();
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
function rgbToHs(r, g_, b) {
  r /= 255; g_ /= 255; b /= 255; const mx = Math.max(r, g_, b), mn = Math.min(r, g_, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g_ - b) / d + 6) % 6 : mx === g_ ? (b - r) / d + 2 : (r - g_) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, i = Math.floor(h / 60) % 6;
  const [r, g_, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  return [Math.round((r + m) * 255), Math.round((g_ + m) * 255), Math.round((b + m) * 255)];
}
function recolor(im, mk, legend, col) {
  if (!mk || !mk.complete || !mk.naturalWidth || !im.naturalWidth) return im;
  const ck = im.src + '|' + Object.keys(legend).map(k => col[k] || '').join();
  let c = RECOLOR.get(ck); if (c) return c;
  const w = im.naturalWidth, h = im.naturalHeight;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(im, 0, 0);
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const mx = m.getContext('2d', { willReadFrequently: true }); mx.drawImage(mk, 0, 0);
  const id = x.getImageData(0, 0, w, h), px = id.data, md = mx.getImageData(0, 0, w, h).data;
  const tgt = {}; for (const [k, rgb] of Object.entries(legend)) if (col[k]) tgt[k] = { rgb, hs: rgbToHs(...hexRgb(col[k])) };
  for (let i = 0; i < px.length; i += 4) {
    if (md[i + 3] < 128 || px[i + 3] === 0) continue;
    let best = null, bd = 1e9;                      // nearest legend colour = this pixel's region
    for (const k in tgt) { const L = tgt[k].rgb, d = (md[i] - L[0]) ** 2 + (md[i + 1] - L[1]) ** 2 + (md[i + 2] - L[2]) ** 2; if (d < bd) { bd = d; best = tgt[k]; } }
    if (!best || bd > 120 * 120) continue;
    const v = Math.max(px[i], px[i + 1], px[i + 2]) / 255;
    const rgb = hsvToRgb(best.hs[0], best.hs[1], v * (0.4 + 0.6 * best.hs[2]));
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
  }
  x.putImageData(id, 0, 0);
  if (RECOLOR.size > 800) RECOLOR.clear();
  RECOLOR.set(ck, c); return c;
}
// the sprite a unit shows this frame (walk cycle / idle, recoloured when it has colours and its outfit has masks)
function spriteFor(u) {
  const w = WALK && WALK[u.outfit || u.kind];
  if (w) {
    const fr = w.walk[u.dir];
    let im = null, mk = null;
    if (u.moving && fr && fr.length) {   // frames advance with distance walked, at the manifest fps when moving at the unit's speed
      const i = Math.floor((u.animD || 0) * w.fps / u.speed) % fr.length; im = fr[i]; mk = w.mask && w.mask.walk[u.dir] && w.mask.walk[u.dir][i];
    } else if (w.idle[u.dir]) { im = w.idle[u.dir]; mk = w.mask && w.mask.idle[u.dir]; }
    else if (fr) { im = fr[0]; mk = w.mask && w.mask.walk[u.dir] && w.mask.walk[u.dir][0]; }
    if (im && im.complete && im.naturalWidth) {
      if (u.colors && w.mask) im = recolor(im, mk, w.mask.legend, u.colors);
      return { im, anchor: w.anchor, hover: w.hover };
    }
  }
  return { im: IMG[u.kind][u.dir], anchor: null, hover: false };
}
// the idle-south frame (recoloured) for the party portraits
window.__portraitImg = u => {
  const w = WALK && WALK[u.outfit || u.kind]; if (!w || !w.idle.south || !w.idle.south.complete || !w.idle.south.naturalWidth) return null;
  return u.colors && w.mask ? recolor(w.idle.south, w.mask.idle.south, w.mask.legend, u.colors) : w.idle.south;
};

// foot anchor: lowest opaque row of the south sprite (fallback 6 px above the canvas bottom)
const FOOT = {};
function footOf(name) {
  if (FOOT[name] !== undefined) return FOOT[name];
  const im = IMG[name].south;
  if (!im.complete || !im.naturalWidth) return im.naturalHeight ? im.naturalHeight - 6 : 42;
  try {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let low = 0;
    for (let y = c.height - 1; y >= 0 && !low; y--) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { low = y; break; }
    FOOT[name] = low || c.height - 6;
  } catch (e) { FOOT[name] = im.naturalHeight - 6; }
  return FOOT[name];
}

// ---------- pathfinding ----------
function astar(sx, sy, tx, ty, blocked, maxN = 4000) {
  if (sx === tx && sy === ty) return [];
  const open = [[0, sx, sy]], g = new Map([[key(sx, sy), 0]]), from = new Map();
  const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  let n = 0;
  while (open.length && n++ < maxN) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, x, y] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (x === tx && y === ty) {
      const p = []; let k = key(x, y);
      while (from.has(k)) { p.push([k % W, (k / W) | 0]); k = from.get(k); }
      return p.reverse();
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && (!walk(x + dx, y) || !walk(x, y + dy))) continue; // no corner cutting
      if (blocked && !(nx === tx && ny === ty) && blocked(nx, ny)) continue;
      const ng = g.get(key(x, y)) + (dx && dy ? 1.414 : 1);
      const k = key(nx, ny);
      if (!g.has(k) || ng < g.get(k)) { g.set(k, ng); from.set(k, key(x, y)); open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  return null;
}
function los(a, b) {
  let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (!(x0 === a.x && y0 === a.y) && !(x0 === x1 && y0 === y1) && opaque(x0, y0)) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// ---------- state ----------
let S;
const STATS = { pulls: [], waits: new Map(), noSpot: {}, queued: {}, minBack: {}, runs: 0 };
window.__STATS = STATS;

function newUnit(kind, x, y, side, pocket) {
  const base = side === 'hero' ? CONFIG.heroes[kind] : CONFIG.monsters[kind];
  return { id: S.nextId++, kind, side, pocket, x, y, px: x, py: y, fx: x, fy: y, t: 1, hp: base.hp, maxHp: base.hp,
    mana: base.mana || 0, maxMana: base.mana || 0, cd: {}, lane: { offense: 0, heal: 0, consume: 0 }, regen: null, healedAt: -9,
    food: side === 'hero' ? LOADOUTS[kind].food[1] : 0, drink: side === 'hero' ? LOADOUTS[kind].drink[1] : 0,
    runes: side === 'hero' ? Object.assign({}, LOADOUTS[kind].runes) : {}, meleeSkill: side === 'hero' ? HERO_MELEE_SKILL : 0, flash: {}, xp: 0, level: HERO_START_LEVEL,
    set: side === 'hero' ? Object.assign({}, HERO_SETTINGS[kind]) : null, shield: 0, vulnUntil: 0, markUntil: 0,
    speed: base.speed, path: [], goal: null, wait: 0, swing: Math.random() * CONFIG.swing, dir: 'south', target: null,
    alive: true, dead: 0, casts: 0, moving: false, animT: 0, repath: 0, peeled: false, outfit: kind, colors: null, slot: 0 };
}
function reset() {
  S = null; resetAnalyzer();
  S = { time: 0, units: [], fx: [], nextId: 1, occ: new Map(), pocketIdx: 0, phase: 'travel', phaseT: 0,
    pull: null, packs: [], trail: [], taunt: 0, run: 1 };
  // heroes are tracked by unit id, so a role may appear any number of times (4 tanks). Front-most leads: sorted by role, slot order within a role.
  PARTY.map((p, slot) => [p, slot]).filter(([p]) => p.role)
    .sort((a, b) => FRONT_ORDER.indexOf(a[0].role) - FRONT_ORDER.indexOf(b[0].role) || a[1] - b[1])
    .forEach(([p, slot], i) => { const u = newUnit(p.role, ...CONFIG.start[i], 'hero'); u.outfit = p.outfit || DEFAULT_OUTFIT[p.role]; u.colors = p.colors || null; u.slot = slot; addUnit(u); });
  // no Melee to hold the pack: ranged heroes kite by default (chase off) at their distance (Tyler 2026-10-16)
  if (!PARTY.some(p => p.role === 'knight')) for (const u of S.units) if (u.side === 'hero' && HEROES[u.kind].range > 1.5) u.set.chase = false;
  S.lead = S.units.find(u => u.side === 'hero');
  if (!S.units.some(u => u.side === 'hero' && u.id === VIEW.sel)) VIEW.sel = S.lead.id;
  CONFIG.pockets.forEach((p, i) => spawnPack(i));
  STATS.pulls.length = 0; STATS.waits.clear(); STATS.runs = 0;
  for (const o of [STATS.noSpot, STATS.queued, STATS.minBack]) for (const k in o) delete o[k];
  logRender();
}
function addUnit(u) { S.units.push(u); S.occ.set(key(u.x, u.y), u); }
function spawnPack(i) {
  S.packs[i] = { alive: true, aggro: false, respawnAt: 0 };
  for (const [k, x, y] of CONFIG.pockets[i].spawns) {
    let sx = x, sy = y;
    if (S.occ.has(key(sx, sy))) { const f = freeNear(x, y, 3); if (!f) continue; [sx, sy] = f; }
    const u = newUnit(k, sx, sy, 'mon', i); u.home = [sx, sy]; addUnit(u);
  }
}
function freeNear(x, y, r) {
  for (let d = 0; d <= r; d++) for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++)
    if (Math.max(Math.abs(dx), Math.abs(dy)) === d && walk(x + dx, y + dy) && !S.occ.has(key(x + dx, y + dy))) return [x + dx, y + dy];
  return null;
}
const heroById = id => S.units.find(u => u.id === id && u.side === 'hero');
// party composition (selector). The first hero in the list is the front-most: it pulls and holds aggro.
const COMPS = {
  full: ['knight', 'paladin', 'druid', 'sorcerer'], k: ['knight'], p: ['paladin'], s: ['sorcerer'], d: ['druid'],
  kd: ['knight', 'druid'], ks: ['knight', 'sorcerer'], pd: ['paladin', 'druid'],
  kbds: ['knight', 'berserker', 'druid', 'sorcerer'], kb: ['knight', 'berserker'], ps: ['paladin', 'sorcerer'],
  tanks: ['knight', 'knight', 'knight', 'knight'],
};
const FRONT_ORDER = ['knight', 'berserker', 'paladin', 'sorcerer', 'druid'];
// PARTY = the 4 slots of the builder: { role, outfit, colors } (role '' = empty slot). Role = abilities + stats; outfit = sprite.
const slotSpec = r => typeof r === 'string' ? { role: r, outfit: DEFAULT_OUTFIT[r] || r, colors: null } : { role: r.role || '', outfit: r.outfit || DEFAULT_OUTFIT[r.role] || r.role, colors: r.colors || null };
const toParty = c => { const a = (Array.isArray(c) ? c : COMPS[c]).map(slotSpec); while (a.length < 4) a.push({ role: '', outfit: '', colors: null }); return a.slice(0, 4); };
let PARTY = toParty('full');
const lead = () => S.lead;
// VIEW (dev tool): whose camera, action bar and analyzer we see. mode 'hero' follows VIEW.sel; 'party' follows the centre.
const VIEW = { sel: null, mode: 'hero' };
window.VIEW = VIEW;
function selectHero(id) { if (typeof id === 'string') { const h = S.units.find(u => u.side === 'hero' && u.kind === id); id = h && h.id; } if (!heroById(id)) return; VIEW.sel = id; VIEW.mode = 'hero'; S.camPan = true; }
function partyCam() { VIEW.mode = 'party'; S.camPan = true; }
window.selectHero = selectHero; window.partyCam = partyCam;
const selHero = () => heroById(VIEW.sel) || lead();
const followers = () => S.units.filter(u => u.side === 'hero' && u !== S.lead);
const living = side => S.units.filter(u => u.alive && u.side === side);

// ---------- movement ----------
// THE leash: the one place that decides where a unit may stand. Monsters never leave their own pack's room; during a
// fight a kiting hero never leaves the pack's room either (no free damage from outside the leash). Every path is planned
// with it (pathBlocked) and every single step is checked against it (tryNextStep), so no repath, queue or fallback can skip it.
function leashRoom(u) {
  if (u.side === 'mon') return u.pocket;
  if (S.phase === 'fight' && S.pull && kites(u)) return S.pull.pocket;
  return -1;
}
// a unit inside may never step out; one already outside (late to the fight) is free to walk in however the corridor winds
function canStep(u, fx, fy, x, y) {
  const i = leashRoom(u); if (i < 0) return true;
  return inRoom(i, x, y) || !inRoom(i, fx, fy);
}
const pathBlocked = u => { const i = leashRoom(u); return i < 0 || !inRoom(i, u.x, u.y) ? null : (x, y) => !inRoom(i, x, y); };   // outside: plan freely; canStep stops anything inside from leaving
function setGoal(u, gx, gy) {
  if (u.goal && u.goal[0] === gx && u.goal[1] === gy && (u.path.length || (u.x === gx && u.y === gy))) return;
  u.goal = [gx, gy];
  u.path = astar(u.x, u.y, gx, gy, pathBlocked(u)) || [];
}
// Continuous movement: a unit spends its whole per-tick travel budget, rolling straight from one tile into the
// next without a stop at the tile centre. Walk frames advance with distance moved (u.animD, in tiles).
function stepUnit(u, dt) {
  let budget = dt * u.speed;           // tiles this tick
  let moved = 0;
  for (let guard = 0; guard < 4 && budget > 1e-6; guard++) {
    if (u.t < 1) {
      const len = u.x !== u.fx && u.y !== u.fy ? 1.414 : 1;
      const need = (1 - u.t) * len, use = Math.min(need, budget);
      u.t += use / len; budget -= use; moved += use;
      if (u.t > 0.9999) u.t = 1;
      continue;
    }
    if (!tryNextStep(u, dt)) break;
  }
  u.px = u.fx + (u.x - u.fx) * u.t; u.py = u.fy + (u.y - u.fy) * u.t;
  u.moving = moved > 0;
  u.animD = (u.animD || 0) + moved;
}
function tryNextStep(u, dt) {
  if (!u.path.length) return false;
  const [nx, ny] = u.path[0];
  if (!canStep(u, u.x, u.y, nx, ny)) { u.path = []; u.goal = null; return false; }   // leash choke point
  const blocker = S.occ.get(key(nx, ny));
  // Collision (Tyler 2026-10-16): heroes never block each other (party members walk through one another);
  // monsters still block heroes and monsters, and heroes still block monsters.
  if (blocker && blocker !== u && !(u.side === 'hero' && blocker.side === 'hero')) {
    u.wait += dt;
    const wk = key(nx, ny); STATS.waits.set(wk, (STATS.waits.get(wk) || 0) + dt);
    // a party member standing idle in a corridor swaps with a party member behind it
    if (u.side === 'hero' && blocker.side === 'hero' && blocker.t >= 1 && u.wait > 0.4 && !(S.phase === 'fight' && blocker === lead()) &&
        (u === lead() || !blocker.path.length || (blocker.path[0][0] === u.x && blocker.path[0][1] === u.y))) {
      swap(u, blocker); return false;
    }
    if (u.wait > 0.5 && u.goal) {
      const lf = pathBlocked(u);
      const p = astar(u.x, u.y, u.goal[0], u.goal[1], (x, y) => (S.occ.has(key(x, y)) && cheb({ x, y }, u) <= 3) || (lf && lf(x, y)));
      if (p && p.length) u.path = p;
      u.wait = 0.2;
    }
    return false;
  }
  u.wait = 0; u.path.shift();
  const ok = key(u.x, u.y);
  if (S.occ.get(ok) === u) {             // leaving: hand the tile to another hero still standing on it, else free it
    const stay = S.units.find(v => v !== u && v.alive && v.side === 'hero' && v.x === u.x && v.y === u.y);
    if (stay) S.occ.set(ok, stay); else S.occ.delete(ok);
  }
  u.fx = u.x; u.fy = u.y; u.x = nx; u.y = ny; if (!S.occ.has(key(nx, ny))) S.occ.set(key(nx, ny), u); u.t = 0;
  u.dir = dirOf(nx - u.fx, ny - u.fy);
  return true;
}
function swap(a, b) {
  S.occ.set(key(a.x, a.y), b); S.occ.set(key(b.x, b.y), a);
  [a.fx, a.fy, b.fx, b.fy] = [a.x, a.y, b.x, b.y];
  [a.x, a.y, b.x, b.y] = [b.x, b.y, a.x, a.y];
  a.t = 0; b.t = 0; a.path.shift(); a.wait = 0;
  a.dir = dirOf(a.x - a.fx, a.y - a.fy); b.dir = dirOf(b.x - b.fx, b.y - b.fy);
  STATS.swaps = (STATS.swaps || 0) + 1;
}
function dirOf(dx, dy) {
  if (!dx && !dy) return 'south';
  const a = Math.atan2(dy, dx); // screen: +y south
  const i = Math.round(a / (Math.PI / 4));
  return ({ 0: 'east', 1: 'south-east', 2: 'south', 3: 'south-west', 4: 'west', '-4': 'west', '-3': 'north-west', '-2': 'north', '-1': 'north-east' })[i];
}
function face(u, t) { if (t) u.dir = dirOf(t.x - u.x, t.y - u.y); }

// ---------- combat helpers ----------
function elemMult(m, el) {
  if (!el) return 1;
  const d = MONSTERS[m.kind];
  if (d.immune.includes(el)) return COMBAT.immuneMult;
  if (d.resist.includes(el)) return COMBAT.resistMult;
  return d.weak === el ? COMBAT.weakMult : 1;
}
// the hunt analyzer's tallies: one session since start/reset
let AN;
function resetAnalyzer() {
  AN = { t0: S ? S.time : 0, xp: 0, kills: 0, gold: 0, loot: 0, magicXp: 0, dealt: {}, taken: {}, healed: {},
    mana: 0, bolts: 0, fire_rune: 0, frost_rune: 0, potions: 0, food: 0, consumeGold: 0, drinks: {}, eats: {}, log: [], hero: {}, outAb: {}, outEl: {}, inMon: {}, inEl: {}, lootItems: {}, supplies: {} };
}
function hs(u) {
  return AN.hero[u.id] || (AN.hero[u.id] = { dealt: 0, taken: 0, healed: 0, outAb: {}, outEl: {}, inMon: {}, inEl: {}, supplies: {}, xp: 0 });
}
const bump = (o, k, n) => { o[k] = (o[k] || 0) + n; };
function useSupply(u, id, n) { bump(AN.supplies, id, n); bump(hs(u).supplies, id, n); }
function hurt(t, amt, src, el, abil) {
  if (!t.alive) return;
  if (t.side === 'mon') {
    const d = MONSTERS[t.kind];
    let m = elemMult(t, el) * (1 - d.def * COMBAT.defReductionPerPoint);
    if (S.time < t.vulnUntil) m *= COMBAT.vulnMult;
    if (S.time < t.markUntil && src && src.kind === 'paladin') m *= ABILITIES.paladin[0].bonus;
    if (m === 0) { pushNum(t, 'immune', '#9aa4b0'); return; }
    amt = Math.max(1, Math.round(amt * m));
  } else {
    if (t.set) amt = Math.round(amt * STANCES[t.set.stance].taken);
    if (t.shield > 0) { const ab = Math.min(t.shield, amt); t.shield -= ab; amt -= ab; }
  }
  if (src && src.set && t.side === 'mon') amt = Math.max(1, Math.round(amt * STANCES[src.set.stance].dmg));
  t.hp = Math.max(0, t.hp - amt);
  if (src && src.side === 'hero') {
    const key = abil || 'basic', e = (!el || el === 'bleed') ? 'physical' : el, H = hs(src);   // bleed is physical damage
    bump(AN.outAb, key, amt); bump(AN.outEl, e, amt); bump(H.outAb, key, amt); bump(H.outEl, e, amt);
  }
  if (t.side === 'hero') {
    const who = src ? MONSTERS[src.kind] ? MONSTERS[src.kind].name : src.kind : '?', H = hs(t);
    bump(AN.inMon, who, amt); bump(AN.inEl, 'physical', amt); bump(H.inMon, who, amt); bump(H.inEl, 'physical', amt); H.taken += amt;
  }
  if (src && src.side === 'hero') { AN.dealt[src.id] = (AN.dealt[src.id] || 0) + amt; hs(src).dealt += amt; }
  if (t.side === 'hero') AN.taken[t.id] = (AN.taken[t.id] || 0) + amt;
  pushNum(t, String(amt), t.side === 'hero' ? '#ff6a5a' : el === 'bleed' ? '#c0302a' : el === 'fire' ? '#ffb060' : el === 'frost' ? '#a8e4ff' : el === 'nature' ? '#b6f08a' : '#ffe9b0');
  S.fx.push({ type: 'spark', x: t.px, y: t.py, age: 0 });
  if (t.hp <= 0) {
    t.alive = false; t.dead = 0; t.path = []; S.occ.delete(key(t.x, t.y));
    if (t.side === 'hero') heroDied(t); else monsterDied(t);
  }
}
function pushNum(t, txt, col) {
  t.numN = ((t.numN || 0) + 1) % 4;
  S.fx.push({ type: 'num', x: t.px, y: t.py, dx: [0, 7, -7, 0][t.numN], dy: [0, -4, -4, -9][t.numN], txt, col, age: 0 });
}
// sprite VFX (vfx.js). `vfx` pushes a sprite effect; drawn effects map to a sprite when one is loaded.
const FX_SPRITE = { slash: 'melee_slash', heal: 'nature_heal_motes', loot: 'loot_sparkle', mark: 'hunters_mark', shield: 'arcane_barrier' };
const BURST_SPRITE = { fire: 'flame_volley_puff', nature: 'natures_wrath', frost: 'frost_lance_shatter' };
const CAST_SPRITE = { sorcerer: 'cast_sorcerer_runes', druid: 'cast_druid_motes', paladin: 'cast_paladin_aim_glint', knight: 'cast_knight_shield_bash' };
function vfx(name, x, y, opts) {
  if (!VFXLIB.ready(name)) return false;
  S.fx.push(Object.assign({ type: 'vfx', name, x, y, age: 0, life: VFXLIB.dur(name) }, opts || {}));
  return true;
}
function monsterDied(m) {
  vfx('monster_death_poof', m.px, m.py);
  const d = MONSTERS[m.kind];
  AN.kills++; AN.xp += d.xp;
  const party = living('hero');
  // floating "+N XP" (Tyler 2026-10-16): kills within 1 s of the first are grouped into one number, shown at the
  // centre of where they died. The number is each hero's share (XP is split evenly across the party).
  const share = d.xp / Math.max(1, party.length);
  if (!S.xpGroup) S.xpGroup = { t0: S.time, xp: 0, x: 0, y: 0, n: 0 };
  S.xpGroup.xp += share; S.xpGroup.x += m.px; S.xpGroup.y += m.py; S.xpGroup.n++;
  for (const h of party) {                 // even XP share; ASSUMED level curve (HERO_XP_PER_LEVEL)
    h.xp += d.xp / party.length; hs(h).xp += d.xp / party.length;
    const lv = HERO_START_LEVEL + Math.floor(h.xp / HERO_XP_PER_LEVEL);
    if (lv > h.level) { h.level = lv; vfx('level_up', h.px, h.py, { follow: h }); }
  }
  const gp = Math.round(rnd(...d.gp) * (d.boss ? 1 : COMBAT.gpMult)); AN.gold += gp;
  const got = d.drops.filter(([, ch]) => Math.random() < ch).map(([id]) => id);
  if (got.length) {
    AN.loot += got.reduce((a, id) => a + (LOOT_VALUE[id] || 0), 0);
    for (const id of got) bump(AN.lootItems, id, 1);
    S.fx.push({ type: 'loot', x: m.px, y: m.py, age: 0 });
    AN.log.unshift(`${d.name}: ${got.join(', ')} +${gp}g`); AN.log.length = Math.min(AN.log.length, 8);
  }
}
// ---------- bleed (generic status) ----------
function applyBleed(t, src, kind, runeTier) {
  const B = BLEEDS[kind]; if (!t.alive || !B) return;
  t.bleeds = t.bleeds || [];
  for (const b of t.bleeds) b.left = B.dur;                     // reapplying refreshes every stack
  // the tick is fixed when the stack lands: base x (1 + source Melee skill x k) x rune-tier multiplier
  const skill = (src && src.meleeSkill) || 0, scale = (1 + skill * BLEED_SKILL_PER_POINT) * (RUNE_TIER_MULT[runeTier || 1] || 1);
  if (t.bleeds.filter(b => b.kind === kind).length < B.max) t.bleeds.push({ kind, src, left: B.dur, next: B.every, scale });
  STATS.bleedApplied = (STATS.bleedApplied || 0) + 1;
  STATS.bleedMaxStacks = Math.max(STATS.bleedMaxStacks || 0, t.bleeds.length);
}
function tickBleeds(dt) {
  for (const u of S.units) {
    if (!u.alive || !u.bleeds || !u.bleeds.length) continue;
    for (const b of u.bleeds) {
      b.left -= dt; b.next -= dt;
      if (b.next <= 0 && b.left > -1e-6) { b.next += BLEEDS[b.kind].every; STATS.bleedTicks = (STATS.bleedTicks || 0) + 1; hurt(u, Math.round(rnd(...BLEEDS[b.kind].tick) * (b.scale || 1)), b.src, 'bleed', b.kind + '_bleed'); if (!u.alive) break; }
    }
    u.bleeds = (u.bleeds || []).filter(b => b.left > 0);
    // blood trickle: drops spawn faster with more stacks
    u.dripT = (u.dripT || 0) - dt;
    if (u.alive && u.bleeds.length && u.dripT <= 0) { u.dripT = 0.7 / u.bleeds.length; S.fx.push({ type: 'drop', x: u.px, y: u.py, ox: (Math.random() * 6 - 3) | 0, age: 0 }); }
  }
}
function heroDied(h) {
  h.respawnAt = S.time + CONFIG.heroRespawnSec; h.goal = null;
  STATS.deaths = (STATS.deaths || 0) + 1;
  if (S.pull) S.pull.deaths = (S.pull.deaths || 0) + 1;
  if (h === lead()) {
    // wipe: the pack leashes home and heals; everyone respawns at the entrance
    for (const u of living('hero')) { u.alive = false; u.dead = 0; u.path = []; S.occ.delete(key(u.x, u.y)); u.respawnAt = h.respawnAt; }
    for (const m of living('mon')) if (m.target) { m.target = null; m.hp = m.maxHp; setGoal(m, ...m.home); }
    if (S.pull) { S.pull.wipe = true; endPull(); }
    S.phase = 'dead';
  } else {
    for (const m of living('mon')) if (m.target === h) m.target = lead();
  }
}
function respawnHeroes() {
  for (const h of S.units) if (h.side === 'hero' && !h.alive && S.time >= h.respawnAt) {
    const f = freeNear(...CONFIG.start[0], 3); if (!f) continue;
    Object.assign(h, { alive: true, hp: h.maxHp, x: f[0], y: f[1], px: f[0], py: f[1], fx: f[0], fy: f[1], t: 1, path: [], goal: null, dead: 0 });
    S.occ.set(key(f[0], f[1]), h);
    if (h === lead()) { S.trail = [[f[0], f[1]]]; S.camSnap = true; }
  }
}
function adjacentMonsters(tile) { return living('mon').filter(m => m.target && cheb(m, tile) <= 1); }

// ---------- AI ----------
function engagedMonsters() { return living('mon').filter(m => m.target); }

function aiTravel() {
  const k = lead();
  const p = CONFIG.pockets[S.pocketIdx];
  const pack = S.packs[S.pocketIdx];
  const mons = living('mon').filter(m => m.pocket === S.pocketIdx);
  if (!pack.alive || !mons.length) { nextPocket(); return; }
  // walk the knight toward the pack centre
  const c = mons.reduce((a, m) => [a[0] + m.x / mons.length, a[1] + m.y / mons.length], [0, 0]);
  const goal = freeNear(Math.round(c[0]), Math.round(c[1]), 2) || [mons[0].x, mons[0].y];
  if (!k.goal || k.repath <= 0) { setGoal(k, goal[0], goal[1]); k.repath = 1.5; }
  // aggro check
  // the knight walks into the room up to the pack, so the ranged are inside the door too
  if (inRoom(S.pocketIdx, k.x, k.y) && Math.hypot(k.x - c[0], k.y - c[1]) <= CONFIG.pullDist) { startPull(); return; }
  // a kiting leader (chase off, distance > 1) pulls from its distance instead of walking into the pack (Tyler 2026-10-16)
  if (kites(k) && inRoom(S.pocketIdx, k.x, k.y) && Math.min(...mons.map(m => cheb(m, k))) <= k.set.dist + 1) { k.path = []; k.goal = null; startPull(); return; }
  followTrail();
}
function followTrail() {
  followers().forEach((u, i) => {
    if (!u.alive) return;
    const idx = S.trail.length - 1 - (i + 1) * 2;
    if (idx < 0) return;
    const [tx, ty] = S.trail[idx];
    if (u.x === tx && u.y === ty) return;
    if (u.repath > 0 && u.path.length) return;
    setGoal(u, tx, ty); u.repath = 0.6;
  });
}
function startPull() {
  const i = S.pocketIdx;
  S.phase = 'fight'; S.packs[i].aggro = true;
  S.pull = { pocket: i, start: S.time, waitsAtStart: totalWait(), noSpot: 0, queuedMax: 0, minBack: {}, samples: 0 };
  const k = lead();
  for (const m of living('mon').filter(m => m.pocket === i)) m.target = k;
  k.path = []; k.goal = null;
}
function totalWait() { let s = 0; for (const v of STATS.waits.values()) s += v; return s; }

// Aggro leash: a monster whose target stands outside the pack's room drops aggro, returns home and heals to full.
// If that is the whole pack (the aggro holder left the area) the pull is reset, never counted as a clear.
function resetMonster(m) { m.target = null; m.hp = m.maxHp; m.queued = false; m.peeled = false; m.bleeds = []; setGoal(m, ...m.home); }
function aiFight() {
  const k = lead();
  for (const m of engagedMonsters()) if (!inRoom(m.pocket, m.target.x, m.target.y)) { resetMonster(m); STATS.leashResets = (STATS.leashResets || 0) + 1; }
  const mons = engagedMonsters();
  if (!mons.length) { if (living('mon').some(m => m.pocket === S.pull.pocket)) S.pull.reset = true; endPull(); return; }
  if (kites(k)) {
    keepDistance(k, k.set.dist, mons);   // chase off + distance > 1: the leader kites at its distance setting
  } else if (!k.set.chase) {
    k.path = [];                         // chase off at distance 1: hold position, don't run
  } else if (!adjacentMonsters(k).length) {
    // nothing on him yet: step toward the nearest
    const near = mons.slice().sort((a, b) => eu(a, k) - eu(b, k))[0];
    if (k.set.chase && eu(near, k) > k.set.dist + 1.5 && k.repath <= 0) { setGoal(k, near.x, near.y); k.path = k.path.slice(0, -1); k.repath = 0.8; }
  } else { k.path = []; }
  // monsters: surround slots next to their target, extras queue behind
  let queued = 0;
  const slotsTaken = new Set();
  for (const m of mons.sort((a, b) => eu(a, a.target) - eu(b, b.target))) {
    const t = m.target;
    if (cheb(m, t) <= 1 && m.t >= 1) { slotsTaken.add(key(m.x, m.y)); m.path = []; continue; }
    if (m.repath > 0 && m.path.length) continue;
    m.repath = 0.5;
    let best = null, bd = 1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = t.x + dx, y = t.y + dy; if (!dx && !dy) continue;
      if (!walk(x, y) || slotsTaken.has(key(x, y))) continue;
      const o = S.occ.get(key(x, y)); if (o && o !== m) continue;
      if (dx && dy && (!walk(t.x + dx, t.y) || !walk(t.x, t.y + dy))) continue;
      const d = eu({ x, y }, m); if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) { slotsTaken.add(key(...best)); setGoal(m, ...best); m.queued = false; }
    else {
      queued++; m.queued = true;
      // queue: closest free tile within 2 of the target
      const q = ringFree(t, 2, m); if (q) setGoal(m, ...q);
    }
  }
  S.pull.queuedMax = Math.max(S.pull.queuedMax, queued);
  // ranged heroes
  for (const u of followers()) (MELEE.has(u.kind) ? meleeDpsPos : rangedPos)(u, k, mons);
}
function ringFree(t, r, m) {
  let best = null, bd = 1e9;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const x = t.x + dx, y = t.y + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !walk(x, y)) continue;
    const o = S.occ.get(key(x, y)); if (o && o !== m) continue;
    const d = eu({ x, y }, m); if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
// Melee DPS: stand in a free slot next to the TANK's target and hit it; it never pulls or holds aggro
function meleeDpsPos(u, k, mons) {
  if (!u.alive) return;
  const tgt = (k.lastTarget && k.lastTarget.alive && mons.includes(k.lastTarget)) ? k.lastTarget : mons.slice().sort((a, b) => eu(a, k) - eu(b, k))[0];
  if (!tgt) return;
  u.duty = tgt;
  if (cheb(u, tgt) <= 1 && u.t >= 1) { u.path = []; return; }
  if (u.repath > 0 && u.path.length) return;
  u.repath = 0.5;
  let best = null, bd = 1e9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = tgt.x + dx, y = tgt.y + dy; if ((!dx && !dy) || !walk(x, y)) continue;
    const o = S.occ.get(key(x, y)); if (o && o !== u) continue;
    const d = eu({ x, y }, u); if (d < bd) { bd = d; best = [x, y]; }
  }
  if (best) setGoal(u, ...best); else { const q = ringFree(tgt, 2, u); if (q) setGoal(u, ...q); }
}
const SPOT_MARGIN = 2.5;   // a new spot must beat the claimed one by this many score points to be worth the walk
function rangedPos(u, k, mons) {
  if (!u.alive) return;
  const want = u.set.dist;
  const nearMon = mons.some(m => cheb(m, u) <= 1);
  { const mb = u.kind + '#' + u.id; S.pull.minBack[mb] = Math.min(S.pull.minBack[mb] ?? 99, eu(u, k)); }
  S.pull.samples++; if (inRoom(S.pull.pocket, u.x, u.y)) S.pull.inside = (S.pull.inside || 0) + 1;
  // Distance is measured from this hero's TARGET monster (Tyler 2026-10-16), picked by its Target setting.
  // While the leader is on the move and this hero has nothing in range, following the leader wins.
  const tgt = pickOrder(u, mons)[0];
  if (k !== u && k.path.length && !mons.some(m => inRange(u, m))) {
    if (u.repath <= 0 && eu(u, k) > 2) { const f = freeNear(k.x, k.y, 2); if (f) setGoal(u, ...f); u.repath = 0.6; }
    return;
  }
  if (kites(u)) { keepDistance(u, want, mons); return; }       // chase off + distance > 1: kite, keep `want` tiles from every monster
  if (!u.set.chase) return;                                     // chase off at distance 1: hold position
  const ok = (x, y) => eu({ x, y }, tgt) >= want - 1 && eu({ x, y }, tgt) <= want + 1.2;
  const score = (x, y) => {
    let s = Math.abs(eu({ x, y }, tgt) - want) * 2 + eu({ x, y }, u) * 0.35 + (inRoom(S.pull.pocket, x, y) ? 0 : 4);
    for (const m of mons) s -= Math.min(eu({ x, y }, m), 6) * 0.15;
    return s;
  };
  const claimed = (x, y) => S.units.some(v => v !== u && v.side === 'hero' && ((v.goal && v.goal[0] === x && v.goal[1] === y) || (v.spot && v.spot[0] === x && v.spot[1] === y)));
  // Spot reservation: the claimed spot is kept while it stays valid. En route we never re-pick; a new spot must beat the
  // claimed one by SPOT_MARGIN score points (hysteresis), or the mage bounces between near-equal tiles.
  const valid = s => s && walk(s[0], s[1]) && ok(s[0], s[1]) && !claimed(s[0], s[1]) && !(S.occ.get(key(s[0], s[1])) && S.occ.get(key(s[0], s[1])) !== u)
    && !mons.some(m => cheb(m, { x: s[0], y: s[1] }) <= 1) && los({ x: s[0], y: s[1] }, tgt) && inRoom(S.pull.pocket, s[0], s[1]);
  const held = valid(u.spot);
  if (held) {
    const atSpot = u.x === u.spot[0] && u.y === u.spot[1] && u.t >= 1;
    if (!atSpot) { if (!(u.goal && u.goal[0] === u.spot[0] && u.goal[1] === u.spot[1] && u.path.length)) setGoal(u, ...u.spot); return; }
  } else if (u.spot) u.spot = null;
  if (u.repath > 0 && !nearMon) return;
  u.repath = 1.0;
  const curGood = ok(u.x, u.y) && !nearMon && los(u, tgt) && u.t >= 1 && inRoom(S.pull.pocket, u.x, u.y);
  if (curGood && !u.path.length && (held || !u.spot)) { if (!held) u.spot = [u.x, u.y]; return; }
  let best = null, bs = 1e9;
  for (let y = tgt.y - 8; y <= tgt.y + 8; y++) for (let x = tgt.x - 8; x <= tgt.x + 8; x++) {
    if (!walk(x, y) || !ok(x, y)) continue;
    const o = S.occ.get(key(x, y)); if (o && o !== u) continue;
    if (claimed(x, y)) continue;
    if (mons.some(m => cheb(m, { x, y }) <= 1)) continue;
    if (!los({ x, y }, tgt)) continue;
    const s = score(x, y); if (s < bs) { bs = s; best = [x, y]; }
  }
  if (!best) { S.pull.noSpot++; return; }
  if (held && bs > score(u.spot[0], u.spot[1]) - SPOT_MARGIN) return;
  if (!held && curGood && bs > score(u.x, u.y) - SPOT_MARGIN) { u.spot = [u.x, u.y]; return; }
  u.spot = best; STATS.spotChanges = (STATS.spotChanges || 0) + 1; setGoal(u, ...best);
}
// Keep-distance (chase off): when any monster is closer than `want` tiles, step back to the reachable tile that
// best restores the gap, keeping a line of fire to some monster and staying in the room. Holds once safe.
// Kiting applies to ANY hero with chase off and a distance setting above 1 (Tyler 2026-10-16).
const kites = u => !u.set.chase && u.set.dist > 1;
function keepDistance(u, want, mons) {
  const gap = (x, y) => Math.min(...mons.map(m => cheb(m, { x, y })));
  // outside the pack's area (arrived late, or knocked out): walk in first. Shooting from out here is free damage.
  if (!inRoom(S.pull.pocket, u.x, u.y)) {
    if (u.path.length) return;
    let b = null, bsc = 1e9;
    for (let y = u.y - 12; y <= u.y + 12; y++) for (let x = u.x - 12; x <= u.x + 12; x++) {
      if (!walk(x, y) || !inRoom(S.pull.pocket, x, y)) continue;
      const o = S.occ.get(key(x, y)); if (o && o !== u) continue;
      const g = gap(x, y); if (g < Math.min(want, 2)) continue;
      const sc = eu({ x, y }, u) + (g >= want ? 0 : (want - g) * 2) + (mons.some(m => los({ x, y }, m)) ? 0 : 3);
      if (sc < bsc) { bsc = sc; b = [x, y]; }
    }
    if (b) { u.spot = b; setGoal(u, ...b); }
    return;
  }
  // nothing in attack range (e.g. leashed monsters that can't come out to us): close in until something is,
  // stopping `want` tiles short, or a kiter and a leashed pack just stare at each other
  if (gap(u.x, u.y) >= want && !mons.some(m => inRange(u, m))) {
    if (u.path.length) return;                                  // en route: committed, no re-pick
    const n = mons.slice().sort((a, b) => eu(a, u) - eu(b, u))[0];
    const p = astar(u.x, u.y, n.x, n.y, pathBlocked(u)) || [];
    // stop at the FIRST tile on the way that is `want` away and already has a shot, so closing in never overshoots
    // into the retreat band (that overshoot was the close-in / back-off bounce)
    let stop = -1;
    for (let i = 0; i < p.length; i++) {
      const t = { x: p[i][0], y: p[i][1], kind: u.kind };
      if (gap(t.x, t.y) >= want && mons.some(m => eu(m, t) <= HEROES[u.kind].range && los(t, m))) { stop = i; break; }
    }
    const cut = stop >= 0 ? p.slice(0, stop + 1) : p.slice(0, Math.max(1, p.length - want));
    if (cut.length) { u.goal = cut[cut.length - 1]; u.path = cut; u.spot = u.goal; STATS.spotChanges = (STATS.spotChanges || 0) + 1; }
    return;
  }
  if (gap(u.x, u.y) >= want && !u.path.length) return;         // far enough: hold and shoot
  // en route to a step that still restores the gap: keep going (re-picking every tick meant never arriving)
  if (u.goal && u.path.length && gap(u.goal[0], u.goal[1]) >= want) return;
  // hysteresis: a spot picked a moment ago is kept while it is not dangerous (nothing adjacent / within 1)
  if (S.time - (u.spotT || -9) < 1.2 && gap(u.x, u.y) >= Math.min(want, 2) + 1) return;
  // the NEAREST reachable tile that restores the gap, with a line of fire, inside the room: one short step back.
  // It must lie AWAY from the pack (farther from the pack's centre than we are now), or the "nearest safe tile"
  // can be on the far side of the monsters and the route walks straight through them.
  const cx = mons.reduce((a, m) => a + m.x, 0) / mons.length, cy = mons.reduce((a, m) => a + m.y, 0) / mons.length;
  const away = (x, y) => Math.hypot(x - cx, y - cy) - Math.hypot(u.x - cx, u.y - cy);
  let best = null, bs = 1e9;
  for (let y = u.y - 5; y <= u.y + 5; y++) for (let x = u.x - 5; x <= u.x + 5; x++) {
    if (!walk(x, y) || !inRoom(S.pull.pocket, x, y)) continue;      // HARD limit: kite tiles are inside the pack's area
    const o = S.occ.get(key(x, y)); if (o && o !== u) continue;
    if (S.units.some(v => v !== u && v.side === 'hero' && v.goal && v.goal[0] === x && v.goal[1] === y)) continue;
    if (away(x, y) <= 0.5) continue;                           // retreat only, never through or past the pack
    const g = gap(x, y); if (g < Math.min(want, 2)) continue;  // never step next to a monster
    const s = eu({ x, y }, u) + (g >= want + 1 ? 0 : (want + 1 - g) * 3)   /* aim one tile PAST the setting so the step buys time */ + (mons.some(m => los({ x, y }, m)) ? 0 : 4) + (inRoom(S.pull.pocket, x, y) ? 0 : 3);
    if (s < bs) { bs = s; best = [x, y]; }
  }
  if (best && (best[0] !== u.x || best[1] !== u.y)) { u.spot = best; u.spotT = S.time; STATS.spotChanges = (STATS.spotChanges || 0) + 1; setGoal(u, ...best); }
}
function endPull() {
  const p = S.pull, name = CONFIG.pockets[p.pocket].name;
  const rec = { run: S.run, pocket: name, secs: +(S.time - p.start).toFixed(1), waits: +(totalWait() - p.waitsAtStart).toFixed(1),
    noSpot: p.noSpot, queuedMax: p.queuedMax, deaths: p.deaths || 0, wipe: !!p.wipe, rangedInside: p.samples ? Math.round(100 * (p.inside || 0) / p.samples) : 0, minBack: Object.fromEntries(Object.entries(p.minBack).map(([a, b]) => [a, +b.toFixed(1)])) };
  STATS.pulls.push(rec);
  S.pull = null;
  if (rec.wipe) { S.packs[p.pocket].aggro = false; logRender(); return; }
  if (p.reset) {                          // the aggro holder left the pack's area: nothing cleared, the party regroups and pulls again
    rec.reset = true; S.packs[p.pocket].aggro = false;
    S.phase = 'regroup'; S.phaseT = CONFIG.regroupSec; S.regroupNext = false; logRender(); return;
  }
  S.packs[p.pocket].alive = false; S.packs[p.pocket].respawnAt = S.time + CONFIG.respawnSec;
  S.phase = 'regroup'; S.phaseT = CONFIG.regroupSec; S.regroupNext = true;
  logRender();
}
function nextPocket() {
  S.pocketIdx++;
  if (S.pocketIdx >= CONFIG.pockets.length) { S.pocketIdx = 0; S.run++; STATS.runs++; }
  S.phase = 'travel';
  const k = lead(); k.goal = null;
}

// ---------- attacks ----------
// Basic attacks on the universal swing; abilities on two independent lanes (offense, heal) plus their own
// cooldowns (BIBLE section 9.1). Mana and supplies are debited when the action fires; Magic XP = mana x K x the
// ability's multiplier (BIBLE section 5).
function spendMana(u, n, mult) {
  if (u.mana < n) return false;
  u.mana -= n; AN.mana += n; useSupply(u, 'mana', n); AN.magicXp += n * COMBAT.magicXpPerMana * (mult || 0); return true;
}
function shoot(u, tgt, kind, el, onHit) {
  face(u, tgt);
  if (kind === 'slash') { S.fx.push({ type: 'slash', x: tgt.px, y: tgt.py, fromX: u.px, fromY: u.py, el, age: 0 }); onHit(); return; }
  S.fx.push({ type: 'proj', kind, x: u.px, y: u.py, tx: tgt.x, ty: tgt.y, age: 0, dur: 0.22,
    onHit: () => { if (kind === 'crossbow') vfx('crossbow_bolt_impact', tgt.px, tgt.py); onHit(); } });
}
// TARGET setting (bottom HUD, per hero): follow the leader's target, nearest, lowest HP, highest % life, strongest
function orderCmp(u) {
  switch (u.set ? u.set.target : 'lowest') {
    case 'nearest': return (a, b) => eu(a, u) - eu(b, u);
    case 'highest': return (a, b) => b.hp / b.maxHp - a.hp / a.maxHp;
    case 'strongest': return (a, b) => b.maxHp - a.maxHp;
    case 'lowest': return (a, b) => a.hp - b.hp;
    default: { const lt = lead() && lead().lastTarget; return (a, b) => (b === lt) - (a === lt) || eu(a, u) - eu(b, u); }   // follow
  }
}
function pickOrder(u, list) { return list.slice().sort(orderCmp(u)); }
const MELEE = new Set(['knight', 'berserker']);
function inRange(u, m) { return MELEE.has(u.kind) ? cheb(m, u) <= 1 : eu(m, u) <= HEROES[u.kind].range && los(u, m); }
function areaCentre(u, mons) {
  return mons.filter(m => inRange(u, m)).sort((a, b) => mons.filter(o => cheb(o, b) <= 1).length - mons.filter(o => cheb(o, a) <= 1).length)[0];
}
function abilityOn(u, ab) { return !ACTION_SETS[u.set.actSet].skip(ab); }
function useAbility(u, ab, mons) {
  if ((u.cd[ab.id] || 0) > S.time || u.lane[ab.lane] > S.time) return false;
  if (ab.mana && u.mana < ab.mana) return false;
  const k = lead();
  let tgt = null;
  switch (ab.target) {
    case 'taunt': tgt = mons.find(m => m.target !== k); if (!tgt) return false; break;
    case 'mark': tgt = mons.filter(m => inRange(u, m)).sort((a, b) => b.hp - a.hp)[0]; if (!tgt || tgt.markUntil > S.time) return false; break;
    case 'enemy': tgt = mons.filter(m => inRange(u, m) && elemMult(m, ab.element) > 0)
      .sort((a, b) => elemMult(b, ab.element) - elemMult(a, ab.element) || orderCmp(u)(a, b))[0]; if (!tgt) return false; break;
    case 'area': tgt = areaCentre(u, mons); if (!tgt) return false;
      if (mons.filter(o => cheb(o, tgt) <= 1 && elemMult(o, ab.element) > 0).length < 2) return false; break;
    case 'cleave': tgt = pickOrder(u, mons.filter(m => inRange(u, m)))[0]; if (!tgt) return false; break;
    case 'self': if (u.hp / u.maxHp >= ab.whenBelow || u.shield > 0) return false; tgt = u; break;
    case 'ally': tgt = living('hero').filter(h => h.hp / h.maxHp < ab.whenBelow && eu(h, u) <= HEROES[u.kind].range && los(u, h))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (!tgt) return false; break;
    case 'party': if (living('hero').filter(h => h.hp / h.maxHp < ab.whenBelow).length < ab.minHurt) return false; tgt = u; break;
  }
  if (ab.mana && !spendMana(u, ab.mana, ab.magicXpMult)) return false;
  if (ab.rune) { AN[ab.rune]++; useSupply(u, ab.rune, 1); if (u.runes[ab.rune] > 0) u.runes[ab.rune]--; }   // carried first, then store runes
  if (ab.ammo) { AN.bolts += ab.ammo; useSupply(u, 'bolt', ab.ammo); }
  u.flash[ab.id] = S.time;
  u.cd[ab.id] = S.time + ab.cd; u.lane[ab.lane] = S.time + COMBAT.lanes[ab.lane];
  if (tgt !== u) face(u, tgt);
  vfx(CAST_SPRITE[u.kind], u.px, u.py, { follow: u, life: Math.min(0.7, VFXLIB.dur(CAST_SPRITE[u.kind])) });
  S.fx.push({ type: 'text', x: u.px, y: u.py, dy: -14, txt: ab.name, col: '#e8d8b0', age: 0 });
  const runeMult = ab.rune ? SUPPLIES[ab.rune].mult : 1;
  switch (ab.target) {
    case 'taunt': vfx('challenge_taunt', k.px, k.py, { follow: k }); for (const m of mons) if (m.target !== k) { m.target = k; m.peeled = false; } STATS.challenges = (STATS.challenges || 0) + 1; break;
    case 'mark': tgt.markUntil = S.time + ab.dur; S.fx.push({ type: 'mark', x: tgt.px, y: tgt.py, age: 0 }); break;
    case 'enemy': if (ab.bleed) {       // Rend: quick hits, each applies a bleed stack; an X of two slashes on the target
      if (!vfx('x_slash', tgt.px, tgt.py)) S.fx.push({ type: 'xslash', x: tgt.px, y: tgt.py, age: 0 });
      face(u, tgt);
      for (let i = 0; i < (ab.hits || 1); i++) { hurt(tgt, rnd(...ab.dmg), u, null, ab.id); applyBleed(tgt, u, ab.bleed, ab.rune && SUPPLIES[ab.rune] ? SUPPLIES[ab.rune].tier || 1 : 1); }
      break;
    } shoot(u, tgt, ab.fx, ab.element, () => {
      vfx(ab.id === 'power_strike' ? 'power_strike' : ab.element === 'frost' ? 'frost_lance_shatter' : ab.element === 'fire' ? 'flame_volley_puff' : 'crossbow_bolt_impact', tgt.px, tgt.py);
      hurt(tgt, Math.round(rnd(...ab.dmg) * runeMult), u, ab.element, ab.id);
    }); break;
    case 'area': {
      const c = tgt;
      S.fx.push({ type: 'proj', kind: ab.fx === 'fire' ? 'fireball' : ab.fx, x: u.px, y: u.py, tx: c.x, ty: c.y, age: 0, dur: 0.25, onHit: () => {
        if (ab.id === 'fireball') vfx('fire_rune_burst', c.px, c.py);
        for (const m of engagedMonsters()) if (cheb(m, c) <= 1) {
          if (VFXLIB.ready(BURST_SPRITE[ab.element])) vfx(BURST_SPRITE[ab.element], m.px, m.py);
          else S.fx.push({ type: 'burst', el: ab.element, x: m.px, y: m.py, seed: Math.random() * 6, age: 0 });
          if (ab.vuln) m.vulnUntil = S.time + COMBAT.vulnSec;
          hurt(m, Math.round(rnd(...ab.dmg) * runeMult), u, ab.element, ab.id);
        }
      } }); break;
    }
    case 'cleave': {      // the target plus up to maxHits-1 other monsters next to the cleaver
      const hitList = [tgt, ...mons.filter(m => m !== tgt && cheb(m, u) <= 1)].slice(0, ab.maxHits);
      STATS.cleaveHits = (STATS.cleaveHits || 0) + hitList.length; STATS.cleaves = (STATS.cleaves || 0) + 1;
      for (const m of hitList) shoot(u, m, 'slash', null, () => hurt(m, rnd(...ab.dmg), u, null, ab.id));
      break;
    }
    case 'self': u.shield = ab.shield; S.fx.push({ type: 'shield', x: u.px, y: u.py, age: 0 }); break;
    case 'ally': heal(u, tgt, rnd(...ab.heal)); break;
    case 'party': vfx('circle_of_renewal', u.px, u.py, { follow: u, life: 1.4 }); for (const h of living('hero')) if (eu(h, u) <= 8) heal(u, h, rnd(...ab.heal)); break;
  }
  return true;
}
function heal(src, h, amt) {
  h.healedAt = S.time;
  const got = Math.min(amt, h.maxHp - h.hp); h.hp += got; AN.heals = (AN.heals || 0) + 1; AN.healed[src.id] = (AN.healed[src.id] || 0) + got;
  S.fx.push({ type: 'heal', x: h.px, y: h.py, age: 0 }); pushNum(h, '+' + got, '#7dff8a');
}
// food and drink: one shared consumable lane (BIBLE §9.1). No potions (Tyler 2026-10-16): food restores HP,
// drink restores mana, and each pays HALF instantly and HALF as a timed over-time effect (CONSUME_HOT_S).
// Drink under its mana threshold; eat under its HP threshold when no heal landed in the last 2 s.
const CONSUME_INSTANT = 0.5, CONSUME_HOT_S = 6;   // ASSUMED: 50/50 split (Tyler), over-time half spread across 6 s
function tickOverTime(u, key, stat, max, dt) {
  const o = u[key]; if (!o) return;
  const step = Math.min(o.left, o.perSec * dt);
  u[stat] = Math.min(u[max], u[stat] + step); o.left -= step;
  if (o.left <= 0.01) u[key] = null;
}
function consume(u, dt) {
  tickOverTime(u, 'regen', 'hp', 'maxHp', dt);
  tickOverTime(u, 'manaRegen', 'mana', 'maxMana', dt);
  if (u.lane.consume > S.time) return;
  const L = LOADOUTS[u.kind];
  const dr = CONSUMABLES[L.drink[0]], fd = CONSUMABLES[L.food[0]];
  const drinkBelow = u.set.drinkBelow != null ? u.set.drinkBelow : dr.below;
  // Supplies (Tyler 2026-10-16): what the hero BROUGHT is already owned, so using it costs nothing here. When the
  // stack runs out the hero keeps going on STORE-BOUGHT supplies, charged at store price. Never stop for lack of stock.
  if (!u.manaRegen && u.maxMana && u.mana / u.maxMana < drinkBelow) {
    const own = u.drink > 0; if (own) u.drink--;
    u.lane.consume = S.time + CONSUMABLE_LANE; u.flash.drink = S.time;
    const now = Math.round(dr.mana * CONSUME_INSTANT), later = dr.mana - now;
    u.mana = Math.min(u.maxMana, u.mana + now); u.manaRegen = { left: later, perSec: later / CONSUME_HOT_S };
    S.fx.push({ type: 'num', big: true, x: u.px, y: u.py, dx: 0, dy: -8, txt: '+' + now + ' MP', col: '#7ab4ff', age: 0 });   // the instant half, readable
    S.fx.push({ type: 'cup', x: u.px, y: u.py, follow: u, age: 0 });                                                         // a cup pops over the head
    vfx('nature_heal_motes', u.px, u.py, { follow: u, filter: 'hue-rotate(110deg) saturate(1.4)' });
    AN.potions++; if (!own) AN.consumeGold += dr.price; AN.drinks[u.id] = (AN.drinks[u.id] || 0) + 1; useSupply(u, L.drink[0] + (own ? '_own' : ''), 1);
    return;
  }
  const foodBelow = u.set.foodBelow != null ? u.set.foodBelow : fd.below;
  if (!u.regen && u.hp / u.maxHp < foodBelow && S.time - u.healedAt > 2) {
    const own = u.food > 0;
    const now = Math.round(fd.hp * CONSUME_INSTANT), later = fd.hp - now;
    const got = Math.min(now, u.maxHp - u.hp); u.hp += got; pushNum(u, '+' + got, '#ff8a8a');
    if (own) u.food--; u.regen = { left: later, perSec: later / CONSUME_HOT_S }; u.lane.consume = S.time + CONSUMABLE_LANE; u.flash.food = S.time;
    AN.food++; if (!own) AN.consumeGold += fd.price; AN.eats[u.id] = (AN.eats[u.id] || 0) + 1; useSupply(u, L.food[0] + (own ? '_own' : ''), 1);
    vfx('loot_sparkle', u.px, u.py, { follow: u, filter: 'sepia(1) saturate(2) hue-rotate(-15deg) brightness(.8)' });
  }
}
function attacks(dt) {
  const k = lead();
  for (const u of S.units) {
    if (!u.alive) continue;
    if (u.side === 'hero') {
      u.mana = Math.min(u.maxMana, u.mana + u.maxMana * COMBAT.manaRegenPerMin / 60 * dt);
      consume(u, dt);
      if (S.phase === 'fight' && (u.t >= 1 || HEROES[u.kind].range > 1.5)) {   // ranged heroes cast on the move (kiting)
        const mons = engagedMonsters();
        if (mons.length) for (const ab of ABILITIES[u.kind]) if (abilityOn(u, ab) && useAbility(u, ab, mons)) break;
      }
    }
    u.swing -= dt;
    if (u.swing > 0) continue;
    if (u.side === 'mon') {
      if (u.target && !u.target.alive) u.target = k.alive ? k : null;
      if (u.target && cheb(u, u.target) <= 1 && u.t >= 1) {
        face(u, u.target); u.swing = CONFIG.swing;
        if (Math.random() < COMBAT.monsterAccuracy) hurt(u.target, rnd(1, MONSTERS[u.kind].atk), u);   // ASSUMED: a hit is 1..atk (monsters.js atk)
        else pushNum(u.target, 'miss', '#c8c8c8');
      }
      continue;
    }
    if (S.phase !== 'fight' || (u.t < 1 && HEROES[u.kind].range <= 1.5)) continue;   // ranged heroes shoot while moving: kiting
    const mons = engagedMonsters(); if (!mons.length) continue;
    const b = HEROES[u.kind].basic;
    // prefer targets the element can hurt; an immune target is still attacked, it just takes 0 (Tyler 2026-10-16)
    const inR = pickOrder(u, mons.filter(m => inRange(u, m)));
    const tgt = inR.find(m => elemMult(m, b.element) > 0) || inR[0];
    if (!tgt) continue;
    if (b.mana && !spendMana(u, b.mana, b.magicXpMult)) continue;   // wand basic: no mana, no shot
    if (b.ammo) { AN.bolts++; useSupply(u, 'bolt', 1); }
    u.flash.basic = S.time; u.lastTarget = tgt;
    u.swing = CONFIG.swing;
    const hit = Math.random() < COMBAT.heroAccuracy;
    const immune = elemMult(tgt, b.element) === 0;
    if (b.hits > 1) for (let i = 1; i < b.hits; i++) shoot(u, tgt, b.kind, b.element, () => Math.random() < COMBAT.heroAccuracy && elemMult(tgt, b.element) > 0 && hurt(tgt, rnd(...b.dmg), u, b.element, 'basic'));
    shoot(u, tgt, b.kind, b.element, () => !hit ? pushNum(tgt, 'miss', '#c8c8c8')
      : immune ? pushNum(tgt, 'immune', '#c8c8c8') : hurt(tgt, rnd(...b.dmg), u, b.element, 'basic'));
    // the druid's attacks can draw a queued monster onto her (aggro test); Challenge pulls it back
    if (u.kind === 'druid' && Math.random() < CONFIG.peelChance) {
      const free = mons.filter(m => m.target === k && cheb(m, k) > 1 && m.queued);
      if (free.length) { free[0].target = u; free[0].peeled = true; free[0].repath = 0; }
    }
  }
}

// ---------- tick ----------
function tick(dt) {
  for (const u of S.units) { u.ppx = u.px; u.ppy = u.py; }
  S.time += dt;
  if (S.xpGroup && S.time - S.xpGroup.t0 >= 1) {
    const gq = S.xpGroup; S.xpGroup = null;
    S.fx.push({ type: 'num', big: true, x: gq.x / gq.n, y: gq.y / gq.n, dx: 0, dy: -6, txt: '+' + Math.round(gq.xp) + ' XP', col: '#ffd860', age: 0 });
  }
  for (const u of S.units) u.repath -= dt;
  const k = lead();
  const last = S.trail[S.trail.length - 1];
  if (!last || last[0] !== k.x || last[1] !== k.y) { S.trail.push([k.x, k.y]); if (S.trail.length > 40) S.trail.shift(); }
  respawnHeroes();
  // respawns
  S.packs.forEach((p, i) => { if (!p.alive && S.time >= p.respawnAt && !(S.phase === 'fight' && S.pull && S.pull.pocket === i)) {
    S.units = S.units.filter(u => u.side === 'hero' || u.pocket !== i || u.alive);
    spawnPack(i);
  } });
  if (S.phase === 'travel') aiTravel();
  else if (S.phase === 'fight') aiFight();
  else if (S.phase === 'dead') {
    if (k.alive) { S.phase = 'regroup'; S.phaseT = CONFIG.regroupSec; S.regroupNext = false; }
  } else if (S.phase === 'regroup') {
    S.phaseT -= dt; followTrail();
    // the party waits until everyone is alive and close to the knight
    const together = S.units.every(h => h.side !== 'hero' || (h.alive && eu(h, k) <= 7));
    if (S.phaseT <= 0 && together) { if (S.regroupNext) nextPocket(); else S.phase = 'travel'; }
  }
  if (S.phase !== 'fight') for (const h of living('hero')) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * CONFIG.oocRegenPct * dt);
  // idle monsters drift home (corpses stay put)
  for (const u of S.units) if (u.alive) stepUnit(u, dt);
  attacks(dt);
  tickBleeds(dt);
  for (const u of S.units) if (!u.alive) u.dead += dt;
  S.units = S.units.filter(u => u.alive || u.dead < CONFIG.corpseSec || u.side === 'hero');
  for (const f of S.fx) {
    f.age += dt;
    if (f.type === 'proj' && f.age >= f.dur && !f.hit) { f.hit = true; f.onHit(); }
  }
  for (const f of S.fx) if (f.type === 'drop' && f.age >= 0.55 && !f.landed) { f.landed = true; S.fx.push({ type: 'spot', x: f.x, y: f.y, ox: f.ox, age: 0 }); }
  const life = { cup: 1.0, drop: 0.56, spot: 2.5, xslash: 0.3, burst: 0.35, heal: 0.7, spark: 0.18, slash: 0.2, shield: 0.6, mark: 0.8, loot: 1.2 };
  S.fx = S.fx.filter(f => f.age < (f.type === 'proj' ? f.dur : f.type === 'vfx' ? f.life
    : FX_SPRITE[f.type] && VFXLIB.ready(FX_SPRITE[f.type]) ? Math.max(life[f.type] || 0.9, VFXLIB.dur(FX_SPRITE[f.type])) : life[f.type] || 0.9));
}

// ---------- render ----------
const cv = document.getElementById('c'), g = cv.getContext('2d');
let view = { w: 0, h: 0 }, cam = { x: 0, y: 0 };
function resize() { cv.width = innerWidth; cv.height = innerHeight; view.w = Math.floor(innerWidth / CONFIG.scale); view.h = Math.floor(innerHeight / CONFIG.scale); }
addEventListener('resize', resize); resize();
const opts = { grid: false, paths: false };
const T = CONFIG.tile;
const cx = x => (x + 1) * T + T / 2, cy = y => (y + 1) * T + T / 2; // grid cell -> map pixel centre (map origin is cell -1)

function render(alpha, frameDt) {
  g.setTransform(CONFIG.scale, 0, 0, CONFIG.scale, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#16181b'; g.fillRect(0, 0, view.w, view.h);
  // interpolate every unit between the last two sim states, so motion is continuous at any display rate
  for (const u of S.units) {
    const a = u.ppx === undefined ? 1 : alpha;
    u.rx = u.ppx === undefined ? u.px : u.ppx + (u.px - u.ppx) * a; u.ry = u.ppy === undefined ? u.py : u.ppy + (u.py - u.ppy) * a;
  }
  // camera: smooth follow of the viewed hero (or the party centre); a quick pan when the view switches
  let fx, fy;
  if (VIEW.mode === 'party') { const hs = S.units.filter(u => u.side === 'hero' && u.alive); const n = hs.length || 1;
    fx = hs.reduce((a, u) => a + u.rx, 0) / n; fy = hs.reduce((a, u) => a + u.ry, 0) / n; if (!hs.length) { fx = lead().rx; fy = lead().ry; } }
  else { const v = selHero(); fx = v.rx; fy = v.ry; }
  const tx = cx(fx) - view.w / 2, ty = cy(fy) - view.h / 2, far = Math.hypot(tx - cam.x, ty - cam.y);
  if (S.camSnap || (!S.camPan && far > T * 4)) { cam.x = tx; cam.y = ty; S.camSnap = false; }
  else { const f = 1 - Math.exp(-frameDt * (S.camPan ? 6 : 9)); cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; if (far < 2) S.camPan = false; }
  const ox = -Math.round(cam.x), oy = -Math.round(cam.y);
  if (IMG.map.complete) g.drawImage(IMG.map, ox, oy);
  const heroPts = living('hero').map(h => ({ x: cx(h.rx), y: cy(h.ry) }));
  AMBIENT.drawUnder(g, ox, oy, view.w, view.h);
  AMBIENT.drawShade(g, ox, oy, view.w, view.h, heroPts);
  if (opts.grid) {
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let x = 0; x <= W + 1; x++) { g.beginPath(); g.moveTo(ox + x * T + .5, oy); g.lineTo(ox + x * T + .5, oy + (H + 1) * T); g.stroke(); }
    for (let y = 0; y <= H + 1; y++) { g.beginPath(); g.moveTo(ox, oy + y * T + .5); g.lineTo(ox + (W + 1) * T, oy + y * T + .5); g.stroke(); }
    for (const u of S.units) if (u.alive) { g.fillStyle = u.side === 'hero' ? 'rgba(80,160,255,.28)' : 'rgba(255,80,80,.28)'; g.fillRect(ox + (u.x + 1) * T, oy + (u.y + 1) * T, T, T); }
    let mx = 0; for (const v of STATS.waits.values()) mx = Math.max(mx, v);
    for (const [kk, v] of STATS.waits) { g.fillStyle = `rgba(255,200,0,${Math.min(.5, v / Math.max(mx, 1) * .5 + .08)})`; g.fillRect(ox + (kk % W + 1) * T + 10, oy + (((kk / W) | 0) + 1) * T + 10, 12, 12); }
  }
  if (opts.paths) {
    for (const u of S.units) if (u.alive && u.path.length) {
      g.strokeStyle = u.side === 'hero' ? 'rgba(120,200,255,.7)' : 'rgba(255,120,120,.6)'; g.beginPath(); g.moveTo(ox + cx(u.px), oy + cy(u.py));
      for (const [x, y] of u.path) g.lineTo(ox + cx(x), oy + cy(y)); g.stroke();
    }
    CONFIG.pockets.forEach((p, i) => { if (!S.packs[i].alive) return; const r = p.room;
      g.strokeStyle = 'rgba(255,90,60,.45)'; g.strokeRect(ox + (r[0] + 1) * T + .5, oy + (r[1] + 1) * T + .5, (r[2] - r[0] + 1) * T, (r[3] - r[1] + 1) * T); });
  }
  // corpses first, then living in y order (feet)
  const list = S.units.slice().sort((a, b) => (a.alive - b.alive) || (a.ry - b.ry) || (a.rx - b.rx));
  for (const u of list) {
    const { im, anchor, hover } = spriteFor(u);
    if (!(im instanceof HTMLCanvasElement) && (!im.complete || !im.naturalWidth)) continue;
    // feet on the tile centre (manifest foot_anchor); hovering units float above their tile
    const ax = anchor ? anchor[0] : (im.naturalWidth || im.width) / 2, ay = anchor ? anchor[1] : footOf(u.kind) - 6;
    const lift = hover && u.alive ? 6 + Math.round(Math.sin(S.time * 4 + u.id) * 2) : 0;
    const x = Math.round(ox + cx(u.rx) - ax), y = Math.round(oy + cy(u.ry) - ay - lift);
    if (!u.alive) {
      // death: a 0.4 s fade from colour to a grey corpse, which lingers and fades out over its last 2 s
      const fadeIn = Math.min(1, u.dead / 0.4), out = Math.min(1, (CONFIG.corpseSec - u.dead) / 2);
      g.globalAlpha = Math.max(0, (1 - 0.45 * fadeIn) * out);
      g.filter = `grayscale(${fadeIn}) brightness(${1 - 0.4 * fadeIn})`;
    }
    g.drawImage(im, x, y);
    g.globalAlpha = 1; g.filter = 'none';
    if (u.alive && u.shield > 0 && VFXLIB.draw(g, 'arcane_barrier', ox + cx(u.rx), oy + cy(u.ry) - 10, S.time)) { /* sprite drawn */ }
    else if (u.alive && u.shield > 0) {
      g.strokeStyle = 'rgba(150,170,255,.55)'; g.beginPath(); g.ellipse(Math.round(ox + cx(u.rx)) + .5, Math.round(oy + cy(u.ry)) - 8.5, 13, 16, 0, 0, 7); g.stroke();
    }
    if (u.alive && (u.hp < u.maxHp || (u.side === 'hero' && u.mana < u.maxMana))) {
      const bw = 20, bx = Math.round(ox + cx(u.rx) - bw / 2), by = y - 3;
      g.fillStyle = '#111'; g.fillRect(bx - 1, by - 1, bw + 2, u.side === 'hero' ? 6 : 4);
      const r = u.hp / u.maxHp; g.fillStyle = r > .6 ? '#4fc65a' : r > .3 ? '#e0b040' : '#e04a3a'; g.fillRect(bx, by, Math.max(1, Math.round(bw * r)), 2);
      if (u.side === 'hero' && u.maxMana) { g.fillStyle = '#4a8cff'; g.fillRect(bx, by + 3, Math.round(bw * u.mana / u.maxMana), 1); }
    }
    if (u.alive && u.bleeds && u.bleeds.length) {      // bleed stacks: a blood-drop badge with the stack count, right of the HP bar
      const n = u.bleeds.length, bx = Math.round(ox + cx(u.rx) + 12), by = y - 8;
      g.fillStyle = '#000'; g.fillRect(bx - 1, by - 1, 15, 12);
      g.fillStyle = '#9a1414'; g.fillRect(bx, by, 13, 10);
      g.fillStyle = '#e04a3a'; g.fillRect(bx, by, 13, 1);
      g.fillStyle = '#ffd0c8'; g.fillRect(bx + 2, by + 3, 1, 1); g.fillRect(bx + 2, by + 4, 1, 3); g.fillRect(bx + 3, by + 6, 1, 1);   // a drop
      g.font = 'bold 9px ui-monospace,Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(String(n), bx + 9, by + 5);
    }
    if (u.alive && u.markUntil > S.time) {   // Hunter's Mark: a small pixel crosshair over the target's head
      const mx = Math.round(ox + cx(u.rx)), my = y - 10, r = (S.time * 2 | 0) % 2 ? 4 : 3;   // gentle 2-step pulse
      g.fillStyle = '#ff5050';
      g.fillRect(mx - r, my - r, 2 * r + 1, 1); g.fillRect(mx - r, my + r, 2 * r + 1, 1);          // ring (square-ish, pixel-clean)
      g.fillRect(mx - r, my - r, 1, 2 * r + 1); g.fillRect(mx + r, my - r, 1, 2 * r + 1);
      g.fillRect(mx, my - r - 2, 1, 3); g.fillRect(mx, my + r, 1, 3);                            // ticks
      g.fillRect(mx - r - 2, my, 3, 1); g.fillRect(mx + r, my, 3, 1);
      g.fillStyle = '#ffd0d0'; g.fillRect(mx, my, 1, 1);                                          // centre dot
    }
  }
  AMBIENT.drawGlow(g, ox, oy, view.w, view.h);
  const fxLead = (paused ? 0 : alpha) * CONFIG.dt;   // projectiles also interpolate between sim ticks
  const P = (v) => Math.round(v);
  for (const f of S.fx) {
    const fxX = P(ox + cx(f.x)), fxY = P(oy + cy(f.y));
    if (f.type === 'cup') {                 // a drink cup pops over the head, rises and fades; 32 -> 16 is an exact 2:1 so it stays crisp
      if (IMG.cup.complete && IMG.cup.naturalWidth) {
        const sz = 16, cxp = Math.round(ox + cx(f.follow.rx)), cyp = Math.round(oy + cy(f.follow.ry)) - 46 - Math.round(Math.min(1, f.age / 0.5) * 8);
        g.globalAlpha = Math.max(0, Math.min(1, (1.0 - f.age) / 0.3)); g.drawImage(IMG.cup, cxp - sz / 2, cyp, sz, sz); g.globalAlpha = 1;
      }
      continue;
    }
    if (f.type === 'vfx') {
      const fx0 = f.follow ? ox + cx(f.follow.rx) : fxX, fy0 = f.follow ? oy + cy(f.follow.ry) : fxY;
      if (f.filter) g.filter = f.filter;
      VFXLIB.draw(g, f.name, fx0, fy0 - 8, f.age); g.filter = 'none'; continue;
    }
    if (FX_SPRITE[f.type] && VFXLIB.draw(g, FX_SPRITE[f.type], fxX, fxY - (f.type === 'mark' ? 22 : 8), f.age)) continue;
    if (f.type === 'proj' && f.kind === 'crossbow') {
      const r = Math.min(1, (f.age + fxLead) / f.dur), x = ox + cx(f.x + (f.tx - f.x) * r), y = oy + cy(f.y + (f.ty - f.y) * r) - 10;
      if (VFXLIB.draw(g, 'crossbow_bolt_projectile', x, y, f.age, Math.atan2(f.ty - f.y, f.tx - f.x))) continue;
    }
    if (f.type === 'proj') {
      const r = Math.min(1, (f.age + fxLead) / f.dur), x = ox + cx(f.x + (f.tx - f.x) * r), y = oy + cy(f.y + (f.ty - f.y) * r) - 10;
      const a = Math.atan2(f.ty - f.y, f.tx - f.x), c = Math.cos(a), s = Math.sin(a);
      if (f.kind === 'crossbow') {          // crossbow bolt: short dark shaft, pale head
        g.strokeStyle = '#6b4a2a'; g.beginPath(); g.moveTo(P(x - c * 6) + .5, P(y - s * 6) + .5); g.lineTo(P(x) + .5, P(y) + .5); g.stroke();
        g.fillStyle = '#e8e4d8'; g.fillRect(P(x), P(y), 2, 2);
      } else if (f.kind === 'fireball') {   // fire: a hot core with an ember trail
        g.fillStyle = '#ff7a20'; g.fillRect(P(x) - 2, P(y) - 2, 5, 5); g.fillStyle = '#ffe080'; g.fillRect(P(x) - 1, P(y) - 1, 3, 3);
        g.fillStyle = 'rgba(255,120,30,.6)'; g.fillRect(P(x - c * 5), P(y - s * 5), 2, 2);
      } else if (f.kind === 'frost') {      // frost lance: a pale streak
        g.strokeStyle = '#bfefff'; g.beginPath(); g.moveTo(P(x - c * 9) + .5, P(y - s * 9) + .5); g.lineTo(P(x) + .5, P(y) + .5); g.stroke();
        g.fillStyle = '#ffffff'; g.fillRect(P(x), P(y), 2, 2);
      } else if (f.kind === 'nature') {     // nature bolt: a green mote with a leaf-green tail
        g.fillStyle = '#5cc04a'; g.fillRect(P(x - c * 4), P(y - s * 4), 2, 2); g.fillStyle = '#c4f59a'; g.fillRect(P(x) - 1, P(y) - 1, 3, 3);
      } else {                              // arcane wand shot
        g.fillStyle = '#b48cff'; g.fillRect(P(x) - 1, P(y) - 1, 3, 3); g.fillStyle = '#f0e6ff'; g.fillRect(P(x), P(y), 1, 1);
      }
    } else if (f.type === 'slash') {        // melee slash: a short bright arc across the target
      const r = f.age / 0.2, a0 = Math.atan2(f.y - f.fromY, f.x - f.fromX) - 1.1 + r * 1.6;
      g.strokeStyle = f.el === 'fire' ? '#ffa040' : '#f4f0e0'; g.lineWidth = 2;
      g.beginPath(); g.arc(fxX, fxY - 10, 9, a0, a0 + 1.2); g.stroke(); g.lineWidth = 1;
    } else if (f.type === 'drop') {          // a 1x2 px drop running down from the torso to the floor
      const r = Math.min(1, f.age / 0.55), px = fxX + f.ox, py = fxY - 14 + Math.round(r * 18);
      g.fillStyle = '#7a0f0f'; g.fillRect(px, py, 1, 2);
    } else if (f.type === 'spot') {          // the drip spot it leaves, fading
      g.fillStyle = `rgba(110,14,14,${(0.6 * (1 - f.age / 2.5)).toFixed(2)})`; g.fillRect(fxX + f.ox - 1, fxY + 4, 3, 1); g.fillRect(fxX + f.ox, fxY + 5, 1, 1);
    } else if (f.type === 'xslash') {        // Rend fallback: two crossing diagonal slashes
      const a = Math.max(0, 1 - f.age / 0.3), L = 9;
      g.strokeStyle = `rgba(255,236,220,${a.toFixed(2)})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(fxX - L, fxY - 8 - L); g.lineTo(fxX + L, fxY - 8 + L); g.moveTo(fxX + L, fxY - 8 - L); g.lineTo(fxX - L, fxY - 8 + L); g.stroke();
      g.strokeStyle = `rgba(200,40,30,${(a * 0.8).toFixed(2)})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fxX - L + 1, fxY - 8 - L); g.lineTo(fxX + L + 1, fxY - 8 + L); g.moveTo(fxX + L + 1, fxY - 8 - L); g.lineTo(fxX - L + 1, fxY - 8 + L); g.stroke();
      g.lineWidth = 1;
    } else if (f.type === 'spark') {
      g.fillStyle = '#fff3c0'; g.fillRect(fxX - 3, fxY - 8, 7, 1); g.fillRect(fxX, fxY - 11, 1, 7);
    } else if (f.type === 'burst') {        // area hit: a few small puffs on each hit tile, gone in 0.35 s
      const r = f.age / 0.35, rise = Math.round(r * 6);
      const [core, edge] = f.el === 'fire' ? ['#ffe080', '#ff7a20'] : f.el === 'nature' ? ['#d8ffb0', '#5cc04a'] : ['#ffffff', '#a8e4ff'];
      g.globalAlpha = Math.max(0, 1 - r);
      for (let i = 0; i < 4; i++) {
        const a = f.seed + i * 1.6, px = P(fxX + Math.cos(a) * 6), py = P(fxY - 8 + Math.sin(a) * 4) - rise - i;
        const sz = i % 2 ? 2 : 3;
        g.fillStyle = edge; g.fillRect(px - 1, py - 1, sz + 1, sz + 1); g.fillStyle = core; g.fillRect(px, py, sz - 1, sz - 1);
      }
      g.globalAlpha = 1;
    } else if (f.type === 'heal') {         // nature heal: green motes rising
      g.fillStyle = '#7dff8a';
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + f.age * 6; g.fillRect(P(fxX + Math.cos(a) * 8), P(fxY - 6 - f.age * 20 + Math.sin(a) * 3), 2, 2); }
    } else if (f.type === 'shield') {
      g.strokeStyle = `rgba(170,190,255,${1 - f.age / 0.6})`; g.beginPath(); g.arc(fxX + .5, fxY - 8.5, 10 + f.age * 10, 0, 7); g.stroke();
    } else if (f.type === 'mark') {
      g.strokeStyle = `rgba(255,80,80,${1 - f.age / 0.8})`; g.strokeRect(fxX - 9.5, fxY - 19.5, 19, 19);
    } else if (f.type === 'loot') {         // loot: a small gold twinkle on the corpse
      const tw = Math.sin(f.age * 18) > 0;
      g.fillStyle = '#ffd860'; g.fillRect(fxX + 4, fxY - 4, 1, 1);
      if (tw) { g.fillRect(fxX + 2, fxY - 4, 5, 1); g.fillRect(fxX + 4, fxY - 6, 1, 5); }
    } else {
      g.font = f.big ? 'bold 11px ui-monospace,Consolas,monospace' : '8px ui-monospace,Consolas,monospace'; g.textAlign = 'center';
      const x = P(fxX + (f.dx || 0)), y = P(fxY - 26 + (f.dy || 0) - f.age * 14);
      g.fillStyle = '#000'; g.fillText(f.txt, x + 1, y + 1); g.fillStyle = f.col; g.fillText(f.txt, x, y);
    }
  }
}

// ---------- UI ----------
let paused = false, speed = 1, acc = 0, lastT = performance.now();
const $ = id => document.getElementById(id);
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; $('pause').classList.toggle('on', paused); };
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
  speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(o => o.classList.toggle('on', o === b));
});
$('restart').onclick = () => reset();
// Party builder (dev tool): 4 slots x role x outfit (+ a colour per recolourable region). Heroes are tracked by unit id,
// so duplicate roles work (4 tanks). Front-most leads: tank Melee, then dps Melee, then Ranger, Mage, Healer (slot order within a role).
const ROLE_NAME = { knight: 'Melee (tank)', berserker: 'Melee (dps)', paladin: 'Ranger', sorcerer: 'Mage', druid: 'Healer' };
const REGION_DEFAULT = { hat: '#8a5bd0', robe: '#4a8a5a', trim: '#d0a040' };
const slotUnit = i => S.units.find(h => h.side === 'hero' && h.slot === i);
function builderBuild() {
  const box = $('builder'); box.textContent = '';
  const mkEl = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const opt = (v, t, sel) => mkEl('option', { value: v, textContent: t, selected: sel });
  PARTY.forEach((p, i) => {
    const row = mkEl('div', { className: 'brow' });
    const role = mkEl('select', { title: 'Role: abilities and stats' }, opt('', '— empty —', !p.role), ...Object.entries(ROLE_NAME).map(([k, v]) => opt(k, v, p.role === k)));
    const outfit = mkEl('select', { title: 'Outfit: the sprite, independent of the role' }, ...Object.entries(OUTFITS).filter(([k]) => !WALK || WALK[k]).map(([k, v]) => opt(k, v, p.outfit === k)));
    outfit.disabled = !p.role;
    role.onchange = () => { const old = DEFAULT_OUTFIT[p.role]; p.role = role.value; if (!p.outfit || p.outfit === old || !old) p.outfit = DEFAULT_OUTFIT[p.role] || ''; if (!PARTY.some(q => q.role)) { p.role = 'knight'; p.outfit = 'knight'; } reset(); builderBuild(); };
    outfit.onchange = () => { p.outfit = outfit.value; p.colors = null; const u = slotUnit(i); if (u) { u.outfit = p.outfit; u.colors = null; } builderBuild(); };
    row.append(mkEl('b', { textContent: String(i + 1) }), role, outfit);
    for (const r of p.role ? outfitRegions(p.outfit) : []) {
      const c = mkEl('input', { type: 'color', value: (p.colors && p.colors[r]) || REGION_DEFAULT[r] || '#808080', title: 'Recolour: ' + r });
      c.oninput = () => {
        const cur = {}; row.querySelectorAll('input[type=color]').forEach(x => { cur[x.dataset.r] = x.value; });
        p.colors = cur; const u = slotUnit(i); if (u) u.colors = cur;
      };
      c.dataset.r = r; row.append(mkEl('label', { className: 'creg', textContent: r }, c));
    }
    if (p.colors) row.append(mkEl('button', { textContent: '↺', title: 'Back to the outfit\'s own colours', onclick: () => { p.colors = null; const u = slotUnit(i); if (u) u.colors = null; builderBuild(); } }));
    box.append(row);
  });
}
$('partyBtn').onclick = () => { $('builder').style.top = ($('bar').getBoundingClientRect().bottom + 4) + 'px'; if ($('builder').classList.contains('hidden')) builderBuild(); $('builder').classList.toggle('hidden'); };
// test hook: a name from COMPS, role strings, or { role, outfit, colors } specs
window.__setComp = c => { PARTY = toParty(c); reset(); builderBuild(); };
$('tGrid').onclick = () => { opts.grid = !opts.grid; $('tGrid').classList.toggle('on', opts.grid); };
$('tPath').onclick = () => { opts.paths = !opts.paths; $('tPath').classList.toggle('on', opts.paths); };
function logRender() {            // pulls log: rows appended once per pull (keyed by index), never rebuilt on a timer
  const box = $('logBody'); if (!box) return;
  if (!box._n || box._n > STATS.pulls.length) { box.textContent = ''; box._n = 0; const h = document.createElement('div'); h.textContent = 'time to clear'; box.append(h); }
  for (; box._n < STATS.pulls.length; box._n++) {
    const p = STATS.pulls[box._n], row = document.createElement('div'), t = document.createElement('b');
    row.append(`r${p.run} ${p.pocket.padEnd(12)} `); t.textContent = String(p.secs).padStart(5) + 's'; row.append(t,
      `  wait ${p.waits}s${p.deaths ? '  deaths ' + p.deaths : ''}${p.wipe ? '  WIPE' : ''}`);
    box.append(row);
    while (box.children.length > 15) box.children[1].remove();
  }
}
// ---------- hunt analyzer ----------
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
// the hunt analyzer, party panel and bottom HUD live in ui.js
function hudRender() {
  const p = CONFIG.pockets[S.pocketIdx];
  const hv = `run ${S.run}  ${S.phase} → ${p.name}  t=${S.time.toFixed(0)}s  ${speed}×`, he = $("hud");
  if (he._t !== hv) { he._t = hv; if (he.firstChild) he.firstChild.nodeValue = hv; else he.textContent = hv; }
}
const PERF = { gaps: [], cpu: [] };
window.__perf = () => {
  const st = a => { const v = a.slice().sort((x, y) => x - y); const m = v.reduce((x, y) => x + y, 0) / (v.length || 1);
    return { n: v.length, mean: +m.toFixed(2), p50: +(v[v.length >> 1] || 0).toFixed(2), p95: +(v[(v.length * 0.95) | 0] || 0).toFixed(2), max: +(v[v.length - 1] || 0).toFixed(2) }; };
  return { frameGapMs: st(PERF.gaps), cpuMs: st(PERF.cpu) };
};
let domT = 0;
function frame(now) {
  const t0 = performance.now();
  const realDt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!paused) { acc += realDt * speed; let n = 0; while (acc >= CONFIG.dt && n++ < 40) { tick(CONFIG.dt); acc -= CONFIG.dt; } }
  const k = lead();
  AMBIENT.update(realDt, living('hero').map(h => ({ x: cx(h.px), y: cy(h.py) })), { x: cx(k.px), y: cy(k.py) });
  render(paused ? 1 : Math.min(1, acc / CONFIG.dt), realDt);
  if (window.UI) UI.frame(now);
  // DOM writes (hud, analyzer, loot log) at about 4 Hz, never per frame
  if (now - domT > 250) { domT = now; hudRender(); if (window.UI) UI.slow(); }
  PERF.gaps.push(realDt * 1000); PERF.cpu.push(performance.now() - t0);
  if (PERF.gaps.length > 600) { PERF.gaps.shift(); PERF.cpu.shift(); }
  requestAnimationFrame(frame);
}
// headless fast-forward for measurement: __simFast(seconds)
window.__simFast = secs => { for (let i = 0; i < secs / CONFIG.dt; i++) tick(CONFIG.dt); return STATS.pulls; };
window.__congestion = (n = 12) => [...STATS.waits].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ x: k % W, y: (k / W) | 0, wait: +v.toFixed(1) }));
window.__S = () => S;
window.__AN = () => AN;
window.__resetAnalyzer = () => resetAnalyzer();
window.__WALK = () => WALK;
window.__hurt = (u, n) => hurt(u, n);
reset();
requestAnimationFrame(frame);
