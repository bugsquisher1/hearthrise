'use strict';
// Hearthrise hunt-sim: a standalone proof of concept of an automated party hunt in the
// style-1 sewer. Placeholder numbers only; nothing here is game data.

const CONFIG = {
  tile: 32, scale: 2, dt: 1 / 30,
  swing: 2.0,                 // every attack, heroes and monsters
  heroRespawnSec: 8,
  pullDist: 1.5,               // pack aggros when the knight, inside its room, is this close to the pack centre          // a dead hero reappears at the entrance
  respawnSec: 90,
  corpseSec: 4,
  regroupSec: 1.5,
  oocRegenPct: 0.06,          // per second, out of combat
  tauntCd: 6,
  peelChance: 0.18,           // chance a heal pulls a free monster onto the druid
  heroes: {
    knight:   { hp: 400, dmg: [14, 22], speed: 3.2, range: 1.5, back: 0 },
    paladin:  { hp: 220, dmg: [9, 14],  speed: 3.2, range: 7,   back: 3.5 },
    druid:    { hp: 200, dmg: [3, 6],   speed: 3.2, range: 7,   back: 5, heal: [45, 70], healBelow: 0.6 },
    sorcerer: { hp: 180, dmg: [10, 15], speed: 3.2, range: 7,   back: 6, blastEvery: 4, blast: [14, 20] },
  },
  monsters: {
    rat:     { hp: 60,  dmg: [4, 7],   speed: 3.4 },
    slime:   { hp: 90,  dmg: [3, 6],   speed: 2.4 },
    bat:     { hp: 50,  dmg: [3, 6],   speed: 4.4 },
    spider:  { hp: 80,  dmg: [5, 8],   speed: 3.6 },
    kobold:  { hp: 100, dmg: [5, 9],   speed: 3.2 },
    ratking: { hp: 520, dmg: [10, 16], speed: 2.8 },
  },
  // the route, pocket by pocket; spawn tiles come from the PixelLab map placements
  pockets: [
    { name: 'NW room',      room: [3, 2, 12, 9],   spawns: [['rat', 7, 4], ['rat', 8, 3], ['rat', 9, 4], ['rat', 8, 5]] },
    { name: 'SW room',      room: [2, 27, 13, 34], spawns: [['slime', 6, 31], ['slime', 7, 30], ['slime', 8, 31]] },
    { name: 'Channel west', room: [29, 25, 37, 34], spawns: [['bat', 30, 27], ['bat', 31, 29]] },
    { name: 'NE room',      room: [38, 2, 48, 12], spawns: [['spider', 41, 5], ['spider', 43, 5], ['spider', 40, 6], ['bat', 42, 4], ['bat', 44, 6]] },
    { name: 'SE room',      room: [40, 30, 47, 34], spawns: [['kobold', 43, 32], ['kobold', 44, 31], ['kobold', 45, 32]] },
    { name: 'Rat King',     room: [51, 17, 55, 29], spawns: [['ratking', 53, 23], ['rat', 52, 21], ['rat', 52, 25]] },
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
function loadImg(src) { const i = new Image(); i.src = src; return i; }
IMG.map = loadImg('assets/sewer_map.png');
for (const n of ['knight', 'paladin', 'druid', 'sorcerer', ...Object.keys(CONFIG.monsters)]) {
  IMG[n] = {}; for (const d of DIRS) IMG[n][d] = loadImg(`assets/${n}/${d}.png`);
}
// optional walk cycles (assets/walk/manifest.json); static rotations otherwise
let WALK = null;
fetch('assets/walk/manifest.json').then(r => r.ok ? r.json() : null).then(m => { if (m) WALK = prepWalk(m); }).catch(() => {});
function prepWalk(m) {
  const out = {};
  const units = m.units || m;
  for (const [name, u] of Object.entries(units)) {
    const dirs = u.directions || u.dirs || {};
    const frames = {};
    for (const [d, list] of Object.entries(dirs)) {
      const paths = Array.isArray(list) ? list : (list.frames || []);
      frames[d] = paths.map(p => loadImg('assets/walk/' + p));
    }
    out[name] = { frames, fps: u.fps || 8, anchor: u.foot_anchor || u.anchor || null };
  }
  return out;
}

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
    speed: base.speed, path: [], goal: null, wait: 0, swing: Math.random() * CONFIG.swing, dir: 'south', target: null,
    alive: true, dead: 0, casts: 0, moving: false, animT: 0, repath: 0, peeled: false };
}
function reset() {
  S = { time: 0, units: [], fx: [], nextId: 1, occ: new Map(), pocketIdx: 0, phase: 'travel', phaseT: 0,
    pull: null, packs: [], trail: [], taunt: 0, run: 1 };
  ['knight', 'paladin', 'druid', 'sorcerer'].forEach((k, i) => addUnit(newUnit(k, ...CONFIG.start[i], 'hero')));
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
const hero = k => S.units.find(u => u.kind === k && u.side === 'hero');
const living = side => S.units.filter(u => u.alive && u.side === side);

// ---------- movement ----------
function leash(u) { return u.side === 'mon' ? (x, y) => !inRoom(u.pocket, x, y) : null; }
function setGoal(u, gx, gy) {
  if (u.goal && u.goal[0] === gx && u.goal[1] === gy && (u.path.length || (u.x === gx && u.y === gy))) return;
  u.goal = [gx, gy];
  u.path = astar(u.x, u.y, gx, gy, leash(u)) || [];
}
function stepUnit(u, dt) {
  if (u.t < 1) {
    u.t = Math.min(1, u.t + dt * u.speed / (u.x !== u.fx && u.y !== u.fy ? 1.414 : 1));
    u.px = u.fx + (u.x - u.fx) * u.t; u.py = u.fy + (u.y - u.fy) * u.t;
    u.moving = true; u.animT += dt;
    return;
  }
  u.px = u.x; u.py = u.y;
  if (!u.path.length) { u.moving = false; return; }
  const [nx, ny] = u.path[0];
  const blocker = S.occ.get(key(nx, ny));
  if (blocker && blocker !== u) {
    u.wait += dt; u.moving = false;
    const wk = key(nx, ny); STATS.waits.set(wk, (STATS.waits.get(wk) || 0) + dt);
    // a party member standing idle in a corridor swaps with a party member behind it
    if (u.side === 'hero' && blocker.side === 'hero' && blocker.t >= 1 && u.wait > 0.4 && !(S.phase === 'fight' && blocker.kind === 'knight') &&
        (u.kind === 'knight' || !blocker.path.length || (blocker.path[0][0] === u.x && blocker.path[0][1] === u.y))) {
      swap(u, blocker); return;
    }
    if (u.wait > 0.5 && u.goal) {
      const lf = leash(u);
      const p = astar(u.x, u.y, u.goal[0], u.goal[1], (x, y) => (S.occ.has(key(x, y)) && cheb({ x, y }, u) <= 3) || (lf && lf(x, y)));
      if (p && p.length) u.path = p;
      u.wait = 0.2;
    }
    return;
  }
  u.wait = 0; u.path.shift();
  S.occ.delete(key(u.x, u.y)); u.fx = u.x; u.fy = u.y; u.x = nx; u.y = ny; S.occ.set(key(nx, ny), u); u.t = 0;
  u.dir = dirOf(nx - u.fx, ny - u.fy);
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
function hurt(t, amt, src) {
  if (!t.alive) return;
  t.hp = Math.max(0, t.hp - amt);
  t.numN = ((t.numN || 0) + 1) % 4;
  S.fx.push({ type: 'num', x: t.px, y: t.py, dx: [0, 7, -7, 0][t.numN], dy: [0, -4, -4, -9][t.numN], txt: String(amt), col: t.side === 'hero' ? '#ff6a5a' : '#ffe9b0', age: 0 });
  S.fx.push({ type: 'spark', x: t.px, y: t.py, age: 0 });
  if (t.hp <= 0) {
    t.alive = false; t.dead = 0; t.path = []; S.occ.delete(key(t.x, t.y));
    if (t.side === 'hero') heroDied(t);
  }
}
function heroDied(h) {
  h.respawnAt = S.time + CONFIG.heroRespawnSec; h.goal = null;
  STATS.deaths = (STATS.deaths || 0) + 1;
  if (S.pull) S.pull.deaths = (S.pull.deaths || 0) + 1;
  if (h.kind === 'knight') {
    // wipe: the pack leashes home and heals; everyone respawns at the entrance
    for (const u of living('hero')) { u.alive = false; u.dead = 0; u.path = []; S.occ.delete(key(u.x, u.y)); u.respawnAt = h.respawnAt; }
    for (const m of living('mon')) if (m.target) { m.target = null; m.hp = m.maxHp; setGoal(m, ...m.home); }
    if (S.pull) { S.pull.wipe = true; endPull(); }
    S.phase = 'dead';
  } else {
    for (const m of living('mon')) if (m.target === h) m.target = hero('knight');
  }
}
function respawnHeroes() {
  for (const h of S.units) if (h.side === 'hero' && !h.alive && S.time >= h.respawnAt) {
    const f = freeNear(...CONFIG.start[0], 3); if (!f) continue;
    Object.assign(h, { alive: true, hp: h.maxHp, x: f[0], y: f[1], px: f[0], py: f[1], fx: f[0], fy: f[1], t: 1, path: [], goal: null, dead: 0 });
    S.occ.set(key(f[0], f[1]), h);
    if (h.kind === 'knight') { S.trail = [[f[0], f[1]]]; S.camSnap = true; }
  }
}
function adjacentMonsters(tile) { return living('mon').filter(m => m.target && cheb(m, tile) <= 1); }

// ---------- AI ----------
function engagedMonsters() { return living('mon').filter(m => m.target); }

function aiTravel() {
  const k = hero('knight');
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
  followTrail();
}
function followTrail() {
  const order = ['paladin', 'druid', 'sorcerer'];
  order.forEach((n, i) => {
    const u = hero(n);
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
  S.pull = { pocket: i, start: S.time, waitsAtStart: totalWait(), noSpot: 0, queuedMax: 0, minBack: { paladin: 99, druid: 99, sorcerer: 99 }, samples: 0 };
  const k = hero('knight');
  for (const m of living('mon').filter(m => m.pocket === i)) m.target = k;
  k.path = []; k.goal = null;
}
function totalWait() { let s = 0; for (const v of STATS.waits.values()) s += v; return s; }

function aiFight() {
  const k = hero('knight');
  const mons = engagedMonsters();
  if (!mons.length) { endPull(); return; }
  // knight: hold, taunt peeled monsters back
  S.taunt -= CONFIG.dt;
  const peeled = mons.find(m => m.target !== k);
  if (peeled && S.taunt <= 0) {
    peeled.target = k; peeled.peeled = false; S.taunt = CONFIG.tauntCd;
    S.fx.push({ type: 'text', x: k.px, y: k.py - 1, txt: 'Taunt!', col: '#ffd070', age: 0 });
  }
  if (!adjacentMonsters(k).length) {
    // nothing on him yet: step toward the nearest
    const near = mons.slice().sort((a, b) => eu(a, k) - eu(b, k))[0];
    if (eu(near, k) > 2.5 && k.repath <= 0) { setGoal(k, near.x, near.y); k.path = k.path.slice(0, -1); k.repath = 0.8; }
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
  for (const n of ['paladin', 'druid', 'sorcerer']) rangedPos(hero(n), k, mons);
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
function rangedPos(u, k, mons) {
  if (!u.alive) return;
  const want = CONFIG.heroes[u.kind].back;
  const nearMon = mons.some(m => cheb(m, u) <= 1);
  S.pull.minBack[u.kind] = Math.min(S.pull.minBack[u.kind], eu(u, k));
  S.pull.samples++; if (inRoom(S.pull.pocket, u.x, u.y)) S.pull.inside = (S.pull.inside || 0) + 1;
  if (u.repath > 0 && !nearMon) return;
  u.repath = 1.0;
  const ok = (x, y) => eu({ x, y }, k) >= want - 1 && eu({ x, y }, k) <= want + 1.2;
  const score = (x, y) => {
    let s = Math.abs(eu({ x, y }, k) - want) * 2 + eu({ x, y }, u) * 0.35 + (inRoom(S.pull.pocket, x, y) ? 0 : 4);
    for (const m of mons) s -= Math.min(eu({ x, y }, m), 6) * 0.15;
    return s;
  };
  const curGood = ok(u.x, u.y) && !nearMon && los(u, k) && u.t >= 1;
  if (curGood && !u.path.length) return;
  let best = null, bs = 1e9;
  for (let y = k.y - 8; y <= k.y + 8; y++) for (let x = k.x - 8; x <= k.x + 8; x++) {
    if (!walk(x, y) || !ok(x, y)) continue;
    const o = S.occ.get(key(x, y)); if (o && o !== u) continue;
    if (S.units.some(v => v !== u && v.side === 'hero' && v.goal && v.goal[0] === x && v.goal[1] === y)) continue;
    if (mons.some(m => cheb(m, { x, y }) <= 1)) continue;
    if (!los({ x, y }, k)) continue;
    const s = score(x, y); if (s < bs) { bs = s; best = [x, y]; }
  }
  if (!best) { S.pull.noSpot++; return; }
  if (!u.goal || u.goal[0] !== best[0] || u.goal[1] !== best[1]) { if (curGood && bs > score(u.x, u.y) - 0.5) return; setGoal(u, ...best); }
}
function endPull() {
  const p = S.pull, name = CONFIG.pockets[p.pocket].name;
  const rec = { run: S.run, pocket: name, secs: +(S.time - p.start).toFixed(1), waits: +(totalWait() - p.waitsAtStart).toFixed(1),
    noSpot: p.noSpot, queuedMax: p.queuedMax, deaths: p.deaths || 0, wipe: !!p.wipe, rangedInside: p.samples ? Math.round(100 * (p.inside || 0) / p.samples) : 0, minBack: Object.fromEntries(Object.entries(p.minBack).map(([a, b]) => [a, +b.toFixed(1)])) };
  STATS.pulls.push(rec);
  S.pull = null;
  if (rec.wipe) { S.packs[p.pocket].aggro = false; logRender(); return; }
  S.packs[p.pocket].alive = false; S.packs[p.pocket].respawnAt = S.time + CONFIG.respawnSec;
  S.phase = 'regroup'; S.phaseT = CONFIG.regroupSec; S.regroupNext = true;
  logRender();
}
function nextPocket() {
  S.pocketIdx++;
  if (S.pocketIdx >= CONFIG.pockets.length) { S.pocketIdx = 0; S.run++; STATS.runs++; }
  S.phase = 'travel';
  const k = hero('knight'); k.goal = null;
}

// ---------- attacks ----------
function attacks(dt) {
  const k = hero('knight');
  for (const u of S.units) {
    if (!u.alive) continue;
    u.swing -= dt;
    if (u.swing > 0) continue;
    if (u.side === 'mon') {
      if (u.target && !u.target.alive) u.target = hero('knight').alive ? hero('knight') : null;
      if (u.target && cheb(u, u.target) <= 1 && u.t >= 1) {
        face(u, u.target); hurt(u.target, rnd(...CONFIG.monsters[u.kind].dmg), u); u.swing = CONFIG.swing;
      }
      continue;
    }
    if (S.phase !== 'fight') continue;
    const mons = engagedMonsters(); if (!mons.length) continue;
    const cfg = CONFIG.heroes[u.kind];
    if (u.kind === 'knight') {
      const adj = mons.filter(m => cheb(m, u) <= 1).sort((a, b) => a.hp - b.hp);
      if (adj.length && u.t >= 1) { face(u, adj[0]); hurt(adj[0], rnd(...cfg.dmg), u); u.swing = CONFIG.swing; }
      continue;
    }
    if (u.t < 1) continue;
    if (u.kind === 'druid') {
      const low = living('hero').filter(h => h.hp / h.maxHp < cfg.healBelow).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (low && eu(low, u) <= cfg.range && los(u, low)) {
        face(u, low); const amt = rnd(...cfg.heal); low.hp = Math.min(low.maxHp, low.hp + amt);
        S.fx.push({ type: 'heal', x: low.px, y: low.py, age: 0 }, { type: 'num', x: low.px, y: low.py, txt: '+' + amt, col: '#7dff8a', age: 0 });
        u.swing = CONFIG.swing;
        const free = mons.filter(m => m.target === k && cheb(m, k) > 1 && m.queued);
        if (free.length && Math.random() < CONFIG.peelChance) { free[0].target = u; free[0].peeled = true; free[0].repath = 0; }
        continue;
      }
    }
    const tgt = mons.filter(m => eu(m, u) <= cfg.range && los(u, m)).sort((a, b) => a.hp - b.hp)[0];
    if (!tgt) continue;
    face(u, tgt); u.swing = CONFIG.swing; u.casts++;
    if (u.kind === 'sorcerer' && u.casts % cfg.blastEvery === 0) {
      // tight 3x3 blast on the monster with the most neighbours
      const c = mons.filter(m => eu(m, u) <= cfg.range && los(u, m)).sort((a, b) => mons.filter(o => cheb(o, b) <= 1).length - mons.filter(o => cheb(o, a) <= 1).length)[0];
      S.fx.push({ type: 'proj', kind: 'bolt', x: u.px, y: u.py, tx: c.x, ty: c.y, age: 0, dur: 0.25, onHit: () => {
        S.fx.push({ type: 'blast', x: c.x, y: c.y, age: 0 });
        for (const m of engagedMonsters()) if (cheb(m, c) <= 1) hurt(m, rnd(...cfg.blast), u);
      } });
      continue;
    }
    S.fx.push({ type: 'proj', kind: u.kind === 'paladin' ? 'arrow' : u.kind === 'druid' ? 'nature' : 'bolt', x: u.px, y: u.py, tx: tgt.x, ty: tgt.y,
      age: 0, dur: 0.22, onHit: () => hurt(tgt, rnd(...cfg.dmg), u) });
  }
}

// ---------- tick ----------
function tick(dt) {
  S.time += dt;
  for (const u of S.units) u.repath -= dt;
  const k = hero('knight');
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
  for (const u of S.units) if (!u.alive) u.dead += dt;
  S.units = S.units.filter(u => u.alive || u.dead < CONFIG.corpseSec || u.side === 'hero');
  for (const f of S.fx) {
    f.age += dt;
    if (f.type === 'proj' && f.age >= f.dur && !f.hit) { f.hit = true; f.onHit(); }
  }
  S.fx = S.fx.filter(f => f.age < (f.type === 'proj' ? f.dur : f.type === 'blast' ? 0.35 : f.type === 'heal' ? 0.7 : f.type === 'spark' ? 0.18 : 0.9));
}

// ---------- render ----------
const cv = document.getElementById('c'), g = cv.getContext('2d');
let view = { w: 0, h: 0 }, cam = { x: 0, y: 0 };
function resize() { cv.width = innerWidth; cv.height = innerHeight; view.w = Math.floor(innerWidth / CONFIG.scale); view.h = Math.floor(innerHeight / CONFIG.scale); }
addEventListener('resize', resize); resize();
const opts = { grid: false, paths: false };
const T = CONFIG.tile;
const cx = x => (x + 1) * T + T / 2, cy = y => (y + 1) * T + T / 2; // grid cell -> map pixel centre (map origin is cell -1)

function spriteFor(u) {
  if (WALK && WALK[u.kind] && WALK[u.kind].frames[u.dir] && WALK[u.kind].frames[u.dir].length) {
    const w = WALK[u.kind], fr = w.frames[u.dir];
    const i = u.moving ? Math.floor(u.animT * w.fps) % fr.length : 0;
    if (fr[i].complete && fr[i].naturalWidth) return { im: fr[i], foot: w.anchor ? w.anchor[1] : null };
  }
  return { im: IMG[u.kind][u.dir], foot: null };
}
function render() {
  g.setTransform(CONFIG.scale, 0, 0, CONFIG.scale, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#16181b'; g.fillRect(0, 0, view.w, view.h);
  const k = hero('knight');
  const tx = cx(k.px) - view.w / 2, ty = cy(k.py) - view.h / 2;
  if (S.camSnap || Math.hypot(tx - cam.x, ty - cam.y) > T * 4) { cam.x = tx; cam.y = ty; S.camSnap = false; }
  else { cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12; }
  const ox = -Math.round(cam.x), oy = -Math.round(cam.y);
  if (IMG.map.complete) g.drawImage(IMG.map, ox, oy);
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
  const list = S.units.slice().sort((a, b) => (a.alive - b.alive) || (a.py - b.py) || (a.px - b.px));
  for (const u of list) {
    const { im, foot } = spriteFor(u);
    if (!im.complete || !im.naturalWidth) continue;
    const fy = foot != null ? foot : footOf(u.kind);
    const x = Math.round(ox + cx(u.px) - im.naturalWidth / 2), y = Math.round(oy + cy(u.py) + 10 - fy);
    if (!u.alive) { g.globalAlpha = Math.max(0, 0.55 * (1 - u.dead / CONFIG.corpseSec)); g.filter = 'grayscale(1) brightness(.6)'; }
    g.drawImage(im, x, y);
    g.globalAlpha = 1; g.filter = 'none';
    if (u.alive && u.hp < u.maxHp) {
      const bw = 20, bx = Math.round(ox + cx(u.px) - bw / 2), by = y - 3;
      g.fillStyle = '#111'; g.fillRect(bx - 1, by - 1, bw + 2, 4);
      const r = u.hp / u.maxHp; g.fillStyle = r > .6 ? '#4fc65a' : r > .3 ? '#e0b040' : '#e04a3a'; g.fillRect(bx, by, Math.max(1, Math.round(bw * r)), 2);
    }
  }
  for (const f of S.fx) {
    if (f.type === 'proj') {
      const r = f.age / f.dur, x = ox + cx(f.x + (f.tx - f.x) * r), y = oy + cy(f.y + (f.ty - f.y) * r) - 8;
      if (f.kind === 'arrow') { const a = Math.atan2(f.ty - f.y, f.tx - f.x); g.strokeStyle = '#e8dcc0'; g.beginPath(); g.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); g.lineTo(x, y); g.stroke(); }
      else { g.fillStyle = f.kind === 'nature' ? '#b6f08a' : '#8fd0ff'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
    } else if (f.type === 'spark') {
      g.fillStyle = '#fff3c0'; const x = Math.round(ox + cx(f.x)), y = Math.round(oy + cy(f.y)) - 8;
      g.fillRect(x - 3, y, 7, 1); g.fillRect(x, y - 3, 1, 7);
    } else if (f.type === 'blast') {
      g.fillStyle = `rgba(255,140,40,${0.45 * (1 - f.age / 0.35)})`; g.fillRect(ox + f.x * T, oy + f.y * T, T * 3, T * 3);
    } else if (f.type === 'heal') {
      g.fillStyle = '#7dff8a';
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + f.age * 6, x = ox + cx(f.x) + Math.cos(a) * 8, y = oy + cy(f.y) - 6 - f.age * 18 + Math.sin(a) * 3; g.fillRect(Math.round(x), Math.round(y), 2, 2); }
    } else {
      g.font = '8px ui-monospace,Consolas,monospace'; g.textAlign = 'center';
      const x = Math.round(ox + cx(f.x) + (f.dx || 0)), y = Math.round(oy + cy(f.y) - 26 + (f.dy || 0) - f.age * 14);
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
$('tGrid').onclick = () => { opts.grid = !opts.grid; $('tGrid').classList.toggle('on', opts.grid); };
$('tPath').onclick = () => { opts.paths = !opts.paths; $('tPath').classList.toggle('on', opts.paths); };
function logRender() {
  const rows = STATS.pulls.slice(-14).map(p => `r${p.run} ${p.pocket.padEnd(12)} <b>${String(p.secs).padStart(5)}s</b>  wait ${p.waits}s${p.deaths ? '  deaths ' + p.deaths : ''}${p.wipe ? '  WIPE' : ''}`);
  $('log').innerHTML = 'Pulls (time to clear)\n' + (rows.join('\n') || '—');
}
function hudRender() {
  const p = CONFIG.pockets[S.pocketIdx];
  $('hud').textContent = `run ${S.run}  ${S.phase} → ${p.name}  t=${S.time.toFixed(0)}s  ${speed}×`;
}
function frame(now) {
  const el = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!paused) { acc += el * speed; let n = 0; while (acc >= CONFIG.dt && n++ < 40) { tick(CONFIG.dt); acc -= CONFIG.dt; } }
  render(); hudRender();
  requestAnimationFrame(frame);
}
// headless fast-forward for measurement: __simFast(seconds)
window.__simFast = secs => { for (let i = 0; i < secs / CONFIG.dt; i++) tick(CONFIG.dt); logRender(); return STATS.pulls; };
window.__congestion = (n = 12) => [...STATS.waits].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ x: k % W, y: (k / W) | 0, wait: +v.toFixed(1) }));
window.__S = () => S;
window.__hurt = (u, n) => hurt(u, n);
reset();
requestAnimationFrame(frame);
