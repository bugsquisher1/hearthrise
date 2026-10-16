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
function loadImg(src) { const i = new Image(); i.src = src; return i; }
IMG.map = loadImg('assets/sewer_map.png');
for (const n of ['knight', 'paladin', 'druid', 'sorcerer', ...Object.keys(CONFIG.monsters)]) {
  IMG[n] = {}; for (const d of DIRS) IMG[n][d] = loadImg(`assets/${n}/${d}.png`);
}
// optional walk cycles (assets/walk/manifest.json); static rotations otherwise
let WALK = null;
fetch('assets/walk/manifest.json?v=4').then(r => r.ok ? r.json() : null).then(m => { if (m) WALK = prepWalk(m); }).catch(() => {});
// manifest unit names -> sim kinds
const WALK_NAME = { giant_rat: 'rat', giant_bat: 'bat', venom_spider: 'spider', rat_king: 'ratking' };
function prepWalk(m) {
  const out = {};
  for (const [name, u] of Object.entries(m.units || {})) {
    const walk = {}, idle = {};
    for (const [d, list] of Object.entries(u.directions || {})) walk[d] = list.map(p => loadImg('assets/walk/' + p));
    for (const [d, p] of Object.entries(u.idle || {})) idle[d] = loadImg('assets/walk/' + p);
    for (const [d, src] of Object.entries(u.fallback || {})) if (!walk[d] && walk[src]) walk[d] = walk[src];
    out[WALK_NAME[name] || name] = { walk, idle, fps: u.fps || 8, anchor: u.foot_anchor || null, hover: !!u.hover };
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
    mana: base.mana || 0, maxMana: base.mana || 0, cd: {}, lane: { offense: 0, heal: 0, consume: 0 }, regen: null, healedAt: -9,
    food: side === 'hero' ? LOADOUTS[kind].food[1] : 0, drink: side === 'hero' ? LOADOUTS[kind].drink[1] : 0, shield: 0, vulnUntil: 0, markUntil: 0,
    speed: base.speed, path: [], goal: null, wait: 0, swing: Math.random() * CONFIG.swing, dir: 'south', target: null,
    alive: true, dead: 0, casts: 0, moving: false, animT: 0, repath: 0, peeled: false };
}
function reset() {
  S = null; resetAnalyzer();
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
  const blocker = S.occ.get(key(nx, ny));
  if (blocker && blocker !== u) {
    u.wait += dt;
    const wk = key(nx, ny); STATS.waits.set(wk, (STATS.waits.get(wk) || 0) + dt);
    // a party member standing idle in a corridor swaps with a party member behind it
    if (u.side === 'hero' && blocker.side === 'hero' && blocker.t >= 1 && u.wait > 0.4 && !(S.phase === 'fight' && blocker.kind === 'knight') &&
        (u.kind === 'knight' || !blocker.path.length || (blocker.path[0][0] === u.x && blocker.path[0][1] === u.y))) {
      swap(u, blocker); return false;
    }
    if (u.wait > 0.5 && u.goal) {
      const lf = leash(u);
      const p = astar(u.x, u.y, u.goal[0], u.goal[1], (x, y) => (S.occ.has(key(x, y)) && cheb({ x, y }, u) <= 3) || (lf && lf(x, y)));
      if (p && p.length) u.path = p;
      u.wait = 0.2;
    }
    return false;
  }
  u.wait = 0; u.path.shift();
  S.occ.delete(key(u.x, u.y)); u.fx = u.x; u.fy = u.y; u.x = nx; u.y = ny; S.occ.set(key(nx, ny), u); u.t = 0;
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
    mana: 0, bolts: 0, fire_rune: 0, frost_rune: 0, potions: 0, food: 0, consumeGold: 0, drinks: {}, eats: {}, log: [] };
}
function hurt(t, amt, src, el) {
  if (!t.alive) return;
  if (t.side === 'mon') {
    const d = MONSTERS[t.kind];
    let m = elemMult(t, el) * (1 - d.def * COMBAT.defReductionPerPoint);
    if (S.time < t.vulnUntil) m *= COMBAT.vulnMult;
    if (S.time < t.markUntil && src && src.kind === 'paladin') m *= ABILITIES.paladin[0].bonus;
    if (m === 0) { pushNum(t, 'immune', '#9aa4b0'); return; }
    amt = Math.max(1, Math.round(amt * m));
  } else if (t.shield > 0) {
    const ab = Math.min(t.shield, amt); t.shield -= ab; amt -= ab;
  }
  t.hp = Math.max(0, t.hp - amt);
  if (src && src.side === 'hero') AN.dealt[src.kind] = (AN.dealt[src.kind] || 0) + amt;
  if (t.side === 'hero') AN.taken[t.kind] = (AN.taken[t.kind] || 0) + amt;
  pushNum(t, String(amt), t.side === 'hero' ? '#ff6a5a' : el === 'fire' ? '#ffb060' : el === 'frost' ? '#a8e4ff' : el === 'nature' ? '#b6f08a' : '#ffe9b0');
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
  if (!VFXLIB.ready(name)) return;
  S.fx.push(Object.assign({ type: 'vfx', name, x, y, age: 0, life: VFXLIB.dur(name) }, opts || {}));
}
function monsterDied(m) {
  vfx('monster_death_poof', m.px, m.py);
  const d = MONSTERS[m.kind];
  const lvBefore = Math.floor(AN.xp / 1500);
  AN.kills++; AN.xp += d.xp;
  if (Math.floor(AN.xp / 1500) > lvBefore) for (const h of living('hero')) vfx('level_up', h.px, h.py, { follow: h });   /* party level-up every 1,500 XP (display only) */
  const gp = Math.round(rnd(...d.gp) * (d.boss ? 1 : COMBAT.gpMult)); AN.gold += gp;
  const got = d.drops.filter(([, ch]) => Math.random() < ch).map(([id]) => id);
  if (got.length) {
    AN.loot += got.reduce((a, id) => a + (LOOT_VALUE[id] || 0), 0);
    S.fx.push({ type: 'loot', x: m.px, y: m.py, age: 0 });
    AN.log.unshift(`${d.name}: ${got.join(', ')} +${gp}g`); AN.log.length = Math.min(AN.log.length, 8);
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
  const curGood = ok(u.x, u.y) && !nearMon && los(u, k) && u.t >= 1 && inRoom(S.pull.pocket, u.x, u.y);
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
// Basic attacks on the universal swing; abilities on two independent lanes (offense, heal) plus their own
// cooldowns (BIBLE section 9.1). Mana and supplies are debited when the action fires; Magic XP = mana x K x the
// ability's multiplier (BIBLE section 5).
function spendMana(u, n, mult) {
  if (u.mana < n) return false;
  u.mana -= n; AN.mana += n; AN.magicXp += n * COMBAT.magicXpPerMana * (mult || 0); return true;
}
function shoot(u, tgt, kind, el, onHit) {
  face(u, tgt);
  if (kind === 'slash') { S.fx.push({ type: 'slash', x: tgt.px, y: tgt.py, fromX: u.px, fromY: u.py, el, age: 0 }); onHit(); return; }
  S.fx.push({ type: 'proj', kind, x: u.px, y: u.py, tx: tgt.x, ty: tgt.y, age: 0, dur: 0.22,
    onHit: () => { if (kind === 'crossbow') vfx('crossbow_bolt_impact', tgt.px, tgt.py); onHit(); } });
}
function inRange(u, m) { return u.kind === 'knight' ? cheb(m, u) <= 1 : eu(m, u) <= HEROES[u.kind].range && los(u, m); }
function areaCentre(u, mons) {
  return mons.filter(m => inRange(u, m)).sort((a, b) => mons.filter(o => cheb(o, b) <= 1).length - mons.filter(o => cheb(o, a) <= 1).length)[0];
}
function useAbility(u, ab, mons) {
  if ((u.cd[ab.id] || 0) > S.time || u.lane[ab.lane] > S.time) return false;
  if (ab.mana && u.mana < ab.mana) return false;
  const k = hero('knight');
  let tgt = null;
  switch (ab.target) {
    case 'taunt': tgt = mons.find(m => m.target !== k); if (!tgt) return false; break;
    case 'mark': tgt = mons.filter(m => inRange(u, m)).sort((a, b) => b.hp - a.hp)[0]; if (!tgt || tgt.markUntil > S.time) return false; break;
    case 'enemy': tgt = mons.filter(m => inRange(u, m) && elemMult(m, ab.element) > 0)
      .sort((a, b) => elemMult(b, ab.element) - elemMult(a, ab.element) || a.hp - b.hp)[0]; if (!tgt) return false; break;
    case 'area': tgt = areaCentre(u, mons); if (!tgt) return false;
      if (mons.filter(o => cheb(o, tgt) <= 1 && elemMult(o, ab.element) > 0).length < 2) return false; break;
    case 'self': if (u.hp / u.maxHp >= ab.whenBelow || u.shield > 0) return false; tgt = u; break;
    case 'ally': tgt = living('hero').filter(h => h.hp / h.maxHp < ab.whenBelow && eu(h, u) <= HEROES[u.kind].range && los(u, h))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (!tgt) return false; break;
    case 'party': if (living('hero').filter(h => h.hp / h.maxHp < ab.whenBelow).length < ab.minHurt) return false; tgt = u; break;
  }
  if (ab.mana && !spendMana(u, ab.mana, ab.magicXpMult)) return false;
  if (ab.rune) AN[ab.rune]++;
  if (ab.ammo) AN.bolts += ab.ammo;
  u.cd[ab.id] = S.time + ab.cd; u.lane[ab.lane] = S.time + COMBAT.lanes[ab.lane];
  if (tgt !== u) face(u, tgt);
  vfx(CAST_SPRITE[u.kind], u.px, u.py, { follow: u, life: Math.min(0.7, VFXLIB.dur(CAST_SPRITE[u.kind])) });
  S.fx.push({ type: 'text', x: u.px, y: u.py, dy: -14, txt: ab.name, col: '#e8d8b0', age: 0 });
  const runeMult = ab.rune ? SUPPLIES[ab.rune].mult : 1;
  switch (ab.target) {
    case 'taunt': vfx('challenge_taunt', k.px, k.py, { follow: k }); for (const m of mons) if (m.target !== k && cheb(m, k) <= 6) { m.target = k; m.peeled = false; } break;
    case 'mark': tgt.markUntil = S.time + ab.dur; S.fx.push({ type: 'mark', x: tgt.px, y: tgt.py, age: 0 }); break;
    case 'enemy': shoot(u, tgt, ab.fx, ab.element, () => {
      vfx(ab.id === 'power_strike' ? 'power_strike' : ab.element === 'frost' ? 'frost_lance_shatter' : ab.element === 'fire' ? 'flame_volley_puff' : 'crossbow_bolt_impact', tgt.px, tgt.py);
      hurt(tgt, Math.round(rnd(...ab.dmg) * runeMult), u, ab.element);
    }); break;
    case 'area': {
      const c = tgt;
      S.fx.push({ type: 'proj', kind: ab.fx === 'fire' ? 'fireball' : ab.fx, x: u.px, y: u.py, tx: c.x, ty: c.y, age: 0, dur: 0.25, onHit: () => {
        if (ab.id === 'fireball') vfx('fire_rune_burst', c.px, c.py);
        for (const m of engagedMonsters()) if (cheb(m, c) <= 1) {
          if (VFXLIB.ready(BURST_SPRITE[ab.element])) vfx(BURST_SPRITE[ab.element], m.px, m.py);
          else S.fx.push({ type: 'burst', el: ab.element, x: m.px, y: m.py, seed: Math.random() * 6, age: 0 });
          if (ab.vuln) m.vulnUntil = S.time + COMBAT.vulnSec;
          hurt(m, Math.round(rnd(...ab.dmg) * runeMult), u, ab.element);
        }
      } }); break;
    }
    case 'self': u.shield = ab.shield; S.fx.push({ type: 'shield', x: u.px, y: u.py, age: 0 }); break;
    case 'ally': heal(u, tgt, rnd(...ab.heal)); break;
    case 'party': vfx('circle_of_renewal', u.px, u.py, { follow: u, life: 1.4 }); for (const h of living('hero')) if (eu(h, u) <= 8) heal(u, h, rnd(...ab.heal)); break;
  }
  return true;
}
function heal(src, h, amt) {
  h.healedAt = S.time;
  const got = Math.min(amt, h.maxHp - h.hp); h.hp += got; AN.heals = (AN.heals || 0) + 1; AN.healed[src.kind] = (AN.healed[src.kind] || 0) + got;
  S.fx.push({ type: 'heal', x: h.px, y: h.py, age: 0 }); pushNum(h, '+' + got, '#7dff8a');
}
// food and drink: one shared consumable lane (BIBLE §9.1). Drink under 30% mana; eat under 50% HP when no heal
// has landed on this hero in the last 2 s. Both are debited from the loadout and priced in the analyzer.
function consume(u, dt) {
  if (u.regen) {
    const step = Math.min(u.regen.left, u.regen.perSec * dt);
    u.hp = Math.min(u.maxHp, u.hp + step); u.regen.left -= step;
    if (u.regen.left <= 0.01) u.regen = null;
  }
  if (u.lane.consume > S.time) return;
  const L = LOADOUTS[u.kind];
  const dr = CONSUMABLES[L.drink[0]], fd = CONSUMABLES[L.food[0]];
  if (u.drink > 0 && u.maxMana && u.mana / u.maxMana < dr.below) {
    u.drink--; u.mana = Math.min(u.maxMana, u.mana + dr.mana); u.lane.consume = S.time + CONSUMABLE_LANE;
    AN.potions++; AN.consumeGold += dr.price; AN.drinks[u.kind] = (AN.drinks[u.kind] || 0) + 1;
    vfx('nature_heal_motes', u.px, u.py, { follow: u, filter: 'hue-rotate(110deg) saturate(1.4)' }); pushNum(u, '+' + dr.mana, '#7ab4ff');
    return;
  }
  if (u.food > 0 && !u.regen && u.hp / u.maxHp < fd.below && S.time - u.healedAt > 2) {
    u.food--; u.regen = { left: fd.hp, perSec: fd.hp / fd.over }; u.lane.consume = S.time + CONSUMABLE_LANE;
    AN.food++; AN.consumeGold += fd.price; AN.eats[u.kind] = (AN.eats[u.kind] || 0) + 1;
    vfx('loot_sparkle', u.px, u.py, { follow: u, filter: 'sepia(1) saturate(2) hue-rotate(-15deg) brightness(.8)' });
  }
}
function attacks(dt) {
  const k = hero('knight');
  for (const u of S.units) {
    if (!u.alive) continue;
    if (u.side === 'hero') {
      u.mana = Math.min(u.maxMana, u.mana + u.maxMana * COMBAT.manaRegenPerMin / 60 * dt);
      consume(u, dt);
      if (S.phase === 'fight' && u.t >= 1) {
        const mons = engagedMonsters();
        if (mons.length) for (const ab of ABILITIES[u.kind]) if (useAbility(u, ab, mons)) break;
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
    if (S.phase !== 'fight' || u.t < 1) continue;
    const mons = engagedMonsters(); if (!mons.length) continue;
    const b = HEROES[u.kind].basic;
    // prefer targets the element can hurt; an immune target is still attacked, it just takes 0 (Tyler 2026-10-16)
    const inR = mons.filter(m => inRange(u, m)).sort((a, c) => a.hp - c.hp);
    const tgt = inR.find(m => elemMult(m, b.element) > 0) || inR[0];
    if (!tgt) continue;
    if (b.mana && !spendMana(u, b.mana, b.magicXpMult)) continue;   // wand basic: no mana, no shot
    if (b.ammo) AN.bolts++;
    u.swing = CONFIG.swing;
    const hit = Math.random() < COMBAT.heroAccuracy;
    const immune = elemMult(tgt, b.element) === 0;
    shoot(u, tgt, b.kind, b.element, () => !hit ? pushNum(tgt, 'miss', '#c8c8c8')
      : immune ? pushNum(tgt, 'immune', '#c8c8c8') : hurt(tgt, rnd(...b.dmg), u, b.element));
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
  const life = { burst: 0.35, heal: 0.7, spark: 0.18, slash: 0.2, shield: 0.6, mark: 0.8, loot: 1.2 };
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

function spriteFor(u) {
  const w = WALK && WALK[u.kind];
  if (w) {
    const fr = w.walk[u.dir];
    // frames advance with distance walked, at the manifest fps when moving at the unit's speed
    const im = u.moving && fr && fr.length ? fr[Math.floor((u.animD || 0) * w.fps / u.speed) % fr.length] : (w.idle[u.dir] || (fr && fr[0]));
    if (im && im.complete && im.naturalWidth) return { im, anchor: w.anchor, hover: w.hover };
  }
  return { im: IMG[u.kind][u.dir], anchor: null, hover: false };
}
function render(alpha, frameDt) {
  g.setTransform(CONFIG.scale, 0, 0, CONFIG.scale, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#16181b'; g.fillRect(0, 0, view.w, view.h);
  // interpolate every unit between the last two sim states, so motion is continuous at any display rate
  for (const u of S.units) {
    const a = u.ppx === undefined ? 1 : alpha;
    u.rx = u.ppx === undefined ? u.px : u.ppx + (u.px - u.ppx) * a; u.ry = u.ppy === undefined ? u.py : u.ppy + (u.py - u.ppy) * a;
  }
  const k = hero('knight');
  // camera: frame-rate independent smoothing on the interpolated knight; snaps on big jumps
  const tx = cx(k.rx) - view.w / 2, ty = cy(k.ry) - view.h / 2;
  if (S.camSnap || Math.hypot(tx - cam.x, ty - cam.y) > T * 4) { cam.x = tx; cam.y = ty; S.camSnap = false; }
  else { const f = 1 - Math.exp(-frameDt * 9); cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; }
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
    if (!im.complete || !im.naturalWidth) continue;
    // feet on the tile centre (manifest foot_anchor); hovering units float above their tile
    const ax = anchor ? anchor[0] : im.naturalWidth / 2, ay = anchor ? anchor[1] : footOf(u.kind) - 6;
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
      g.font = '8px ui-monospace,Consolas,monospace'; g.textAlign = 'center';
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
$('tGrid').onclick = () => { opts.grid = !opts.grid; $('tGrid').classList.toggle('on', opts.grid); };
$('tPath').onclick = () => { opts.paths = !opts.paths; $('tPath').classList.toggle('on', opts.paths); };
function logRender() {
  const rows = STATS.pulls.slice(-14).map(p => `r${p.run} ${p.pocket.padEnd(12)} <b>${String(p.secs).padStart(5)}s</b>  wait ${p.waits}s${p.deaths ? '  deaths ' + p.deaths : ''}${p.wipe ? '  WIPE' : ''}`);
  $('log').innerHTML = 'Pulls (time to clear)\n' + (rows.join('\n') || '—');
}
// ---------- hunt analyzer ----------
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
function analyzerRender() {
  const hrs = Math.max(1 / 3600, (S.time - AN.t0) / 3600), ph = v => fmt(v / hrs);
  const supply = AN.mana * SUPPLIES.mana.price + AN.bolts * SUPPLIES.bolt.price + AN.fire_rune * SUPPLIES.fire_rune.price + AN.frost_rune * SUPPLIES.frost_rune.price + AN.consumeGold;
  const profit = AN.loot + AN.gold - supply;
  const row = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
  const heroes = ['knight', 'paladin', 'druid', 'sorcerer'];
  $('anBody').innerHTML =
    row('Session', `${Math.floor((S.time - AN.t0) / 60)}m ${Math.floor((S.time - AN.t0) % 60)}s`) +
    row('XP/h', ph(AN.xp)) + row('Kills/h', ph(AN.kills)) + row('Magic XP/h', ph(AN.magicXp)) +
    '<div class="h">Damage dealt / taken</div>' +
    heroes.map(h => row(h, `${fmt(AN.dealt[h] || 0)} / ${fmt(AN.taken[h] || 0)}`)).join('') +
    row('Healing', fmt(Object.values(AN.healed).reduce((a, b) => a + b, 0))) +
    '<div class="h">Supplies used</div>' +
    row('Mana', fmt(AN.mana)) + row('Bolts', fmt(AN.bolts)) + row('Fire runes', fmt(AN.fire_rune)) + row('Frost runes', fmt(AN.frost_rune)) + row('Mana potions', fmt(AN.potions)) + row('Food', fmt(AN.food)) +
    row('Supply cost', fmt(supply) + 'g') +
    '<div class="h">Loot</div>' +
    row('Loot value', fmt(AN.loot) + 'g') + row('Gold', fmt(AN.gold) + 'g') +
    row('Profit/h', `<span class="${profit >= 0 ? 'up' : 'dn'}">${ph(profit)}g</span>`);
  $('loot').textContent = 'Loot (placeholder table)\n' + (AN.log.join('\n') || '—');
}
(function dragPanel() {
  const el = $('analyzer'), hd = el.querySelector('.ttl');
  let d = null;
  hd.addEventListener('pointerdown', e => { d = [e.clientX - el.offsetLeft, e.clientY - el.offsetTop]; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', e => { if (!d) return; el.style.left = Math.max(0, e.clientX - d[0]) + 'px'; el.style.top = Math.max(0, e.clientY - d[1]) + 'px'; el.style.right = 'auto'; });
  hd.addEventListener('pointerup', () => { d = null; });
  $('anReset').onclick = () => resetAnalyzer();
})();
function hudRender() {
  const p = CONFIG.pockets[S.pocketIdx];
  $('hud').textContent = `run ${S.run}  ${S.phase} → ${p.name}  t=${S.time.toFixed(0)}s  ${speed}×`;
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
  const k = hero('knight');
  AMBIENT.update(realDt, living('hero').map(h => ({ x: cx(h.px), y: cy(h.py) })), { x: cx(k.px), y: cy(k.py) });
  render(paused ? 1 : Math.min(1, acc / CONFIG.dt), realDt);
  if (window.drawActionBar) drawActionBar();
  // DOM writes (hud, analyzer, loot log) at about 4 Hz, never per frame
  if (now - domT > 250) { domT = now; hudRender(); analyzerRender(); }
  PERF.gaps.push(realDt * 1000); PERF.cpu.push(performance.now() - t0);
  if (PERF.gaps.length > 600) { PERF.gaps.shift(); PERF.cpu.shift(); }
  requestAnimationFrame(frame);
}
// headless fast-forward for measurement: __simFast(seconds)
window.__simFast = secs => { for (let i = 0; i < secs / CONFIG.dt; i++) tick(CONFIG.dt); return STATS.pulls; };
window.__congestion = (n = 12) => [...STATS.waits].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ x: k % W, y: (k / W) | 0, wait: +v.toFixed(1) }));
window.__S = () => S;
window.__AN = () => AN;
window.__WALK = () => WALK;
window.__hurt = (u, n) => hurt(u, n);
reset();
requestAnimationFrame(frame);
