// ════════════════════════════════════════════════════════════════════════
// src/world/choreo.js — WHERE EVERYONE STANDS IN A HUNT. DISPLAY ONLY.
//
// The fight is decided elsewhere (the engine, settled by the server); this
// only stages it. Fed two things — the fight as the client holds it, every
// frame (sync), and every swing the one observer reports (beat) — it answers
// where the hero, the engaged foe, the bystanders, the fallen and the loot bags
// are at time t (frame). Nothing here can change a number a player acts on.
//
// THE RULES IT KEEPS (world-slice-plan §2 "Choreography" + "Fences"):
//   · the hero walks the map's patrol loop, one tile per kill;
//   · a new foe engages from at most MAX_APPROACH tiles, and the approach fits
//     inside the swing interval minus a WINDUP_MS windup — so at every swing
//     the foe stands next to the hero. At tickMs <= FAST_TICK_MS it simply
//     appears next to him (and the hero does not walk);
//   · the nearest bystander of the foe's kind is the one that engages;
//   · bystanders: at most AMBIENT_MAX, drawn from the hunt's spawn weights by a
//     seeded draw, untargetable, no numbers;
//   · a foe the server swaps BREAKS OFF — it walks away and fades. Never a
//     death, never a corpse: only a kill the engine reported leaves one;
//   · a kill leaves a generic loot bag — no item, no rarity (that is the
//     settled receipt's to say) — on a tile beside the body, never on it;
//   · knocked out, the hero lies down and no floats are drawn.
// PURE: no DOM, no window, no G, no randomness but its own seeded draw.
// ════════════════════════════════════════════════════════════════════════
import { walkable } from './core/path.js?v=0.2.34';
import { diagonalOf } from './core/facing.js?v=0.2.34';

export const WINDUP_MS = 400;
export const FAST_TICK_MS = 1200;
export const STEP_MS = 320;
export const MAX_APPROACH = 2;
export const AMBIENT_MAX = 8;
const ACT_MS = 600, FLOAT_MS = 1000, CORPSE_MS = 2600, DEATH_MS = 700, BAG_MS = 4500, BAGS_MAX = 6;
const LEAVE_MS = 900, RESPAWN_MS = 3000, WANDER_MS = 4200;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** FNV-1a of a string → uint32. */
export function hash32(s) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return x;
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickWeighted(spawns, r) {
  const total = spawns.reduce((n, s) => n + (s.w || 0), 0);
  let k = r * total;
  for (const s of spawns) { k -= s.w || 0; if (k < 0) return s.monster; }
  return spawns.length ? spawns[spawns.length - 1].monster : null;
}

/**
 * A monster's facing: east or west only. The hero's art reads from all four sides, but a low
 * critter's head-on frame (the rat's 's') reads as a black spider at 48 px, so a monster keeps
 * the side it had (`keep`) on a vertical step, the way side-view monsters do.
 */
const sideOf = (dx, keep) => (dx > 0 ? 'e' : dx < 0 ? 'w' : keep);

/** Facing for a step (dx, dy). */
export function dirOf(dx, dy) {
  if (!dx && !dy) return 's';
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'e' : 'w') : (dy >= 0 ? 's' : 'n');
}
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function posAt(mv, t) {
  if (t >= mv.t1 || mv.t1 <= mv.t0) return mv.to.slice();
  if (t <= mv.t0) return mv.from.slice();
  const k = (t - mv.t0) / (mv.t1 - mv.t0);
  return [mv.from[0] + (mv.to[0] - mv.from[0]) * k, mv.from[1] + (mv.to[1] - mv.from[1]) * k];
}
const still = (at, t) => ({ from: at.slice(), to: at.slice(), t0: t, t1: t });

/**
 * @param {object} map  compileMap() output (mask, path, spawns, start)
 * @param {{seed: number, spawns: {monster: string, w: number}[]}} o
 */
export function createChoreo(map, o) {
  const open = (c) => walkable(map.mask, map.w, map.h, c[0], c[1]);
  const path = map.path.filter(open);
  const onPath = new Set(path.map((c) => c.join()));
  const start = map.start || path[0] || [0, 0];
  let idx = 0;
  path.forEach((c, i) => { if (cheb(c, start) < cheb(path[idx], start)) idx = i; });
  const hero = { mv: still(path[idx] || start, 0), act: null };
  let foe = null, down = false, downSince = 0;
  const leaving = [], corpses = [], bags = [], floats = [];

  const rnd = seeded(o.seed || 1);
  const homes = new Set((map.spawns || []).map((c) => c.join()));
  const ambient = (map.spawns || []).slice(0, AMBIENT_MAX).map((home, slot) => {
    const id = pickWeighted(o.spawns || [], rnd());
    const near = DIRS4.map(([dx, dy]) => [home[0] + dx, home[1] + dy])
      .filter((c) => open(c) && !onPath.has(c.join()) && !homes.has(c.join()));
    return { slot, id, home: home.slice(), near, off: Math.floor(rnd() * WANDER_MS), back: 0, engaged: false };
  }).filter((a) => a.id);

  const rest = (a) => (hash32('f' + a.slot) & 1 ? 'e' : 'w');
  /** A bystander's spot at t: home, or a short wander out to a neighbour and back. */
  function ambientAt(a, t) {
    const p = Math.floor((t + a.off) / WANDER_MS), k = (t + a.off) - p * WANDER_MS;
    const n = a.near.length ? a.near[hash32(a.slot + ':' + p) % a.near.length] : null;
    const heroAt = hero.mv.to;
    if (!n || hash32('w' + a.slot + ':' + p) % 3 || cheb(heroAt, a.home) <= 2) return { at: a.home.slice(), moving: false, dir: rest(a) };
    const out = { from: a.home, to: n, t0: 0, t1: 600 }, back = { from: n, to: a.home, t0: 2000, t1: 2600 };
    if (k < 600) return { at: posAt(out, k), moving: true, dir: sideOf(n[0] - a.home[0], rest(a)) };
    if (k < 2000) return { at: n.slice(), moving: false, dir: sideOf(n[0] - a.home[0], rest(a)) };
    if (k < 2600) return { at: posAt(back, k), moving: true, dir: sideOf(a.home[0] - n[0], rest(a)) };
    return { at: a.home.slice(), moving: false, dir: rest(a) };
  }
  const visible = (a, t) => !a.engaged && t >= a.back;

  function engage(id, t, tickMs, instant) {
    const H = hero.mv.to;
    const cands = DIRS4.map(([dx, dy]) => [H[0] + dx, H[1] + dy]).filter(open);
    let pick = null, slot = null;
    /* The nearest bystander of this kind within reach engages from where it stands. */
    for (const c of cands) {
      for (const a of ambient) {
        if (a.id !== id || !visible(a, t)) continue;
        const d = cheb(ambientAt(a, t).at, c);
        if (d <= MAX_APPROACH && (!pick || d < pick.d)) pick = { c, d, a };
      }
    }
    let A, S;
    if (pick) { A = pick.c; S = ambientAt(pick.a, t).at; slot = pick.a; slot.engaged = true; }
    else {
      A = cands.find((c) => !homes.has(c.join())) || cands[0] || H;
      const d = [A[0] - H[0], A[1] - H[1]];
      S = A;
      for (let k = MAX_APPROACH; k >= 1; k--) {
        const s = [A[0] + d[0] * k, A[1] + d[1] * k];
        let clear = true;
        for (let j = 1; j <= k; j++) if (!open([A[0] + d[0] * j, A[1] + d[1] * j])) clear = false;
        if (clear) { S = s; break; }
      }
    }
    const reach = Math.max(0, tickMs - WINDUP_MS);
    const D = instant || tickMs <= FAST_TICK_MS ? 0 : Math.min(cheb(S, A) * STEP_MS, reach);
    foe = { id, mv: instant || !D ? still(A, t) : { from: S, to: A, t0: t, t1: t + D }, act: null, slot };
  }

  function release(slot, t) { if (slot) { slot.engaged = false; slot.back = t + RESPAWN_MS; } }

  function breakOff(t) {
    if (!foe) return;
    const at = posAt(foe.mv, t), H = hero.mv.to;
    const d = [Math.sign(Math.round(at[0]) - H[0]), Math.sign(Math.round(at[1]) - H[1])];
    let to = at;
    for (let k = 2; k >= 1; k--) { const c = [Math.round(at[0]) + d[0] * k, Math.round(at[1]) + d[1] * k]; if (open(c)) { to = c; break; } }
    leaving.push({ id: foe.id, mv: { from: at, to, t0: t, t1: t + LEAVE_MS }, dir: sideOf(d[0], 'e') });
    release(foe.slot, t);
    foe = null;
  }

  /**
   * Where a kill's bag lands: BESIDE the body, never on it (ART_DIRECTION §11: a bag on the corpse
   * vanishes into it). An open neighbour of the corpse that is not the hero's tile (now or next
   * step), another body or another bag, preferring the side away from the hero; on the body only if nothing is free.
   */
  function bagSpot(at) {
    const c = at.map(Math.round), H = hero.mv.to, next = path.length > 1 ? path[(idx + 1) % path.length] : H;
    const away = Math.sign(c[0] - H[0]) || 1;
    const taken = (p) => same(p, H) || same(p, next) || corpses.some((k) => same(k.at.map(Math.round), p)) || bags.some((g) => same(g.at, p));
    const order = [[away, 0], [0, 1], [0, -1], [-away, 0]];
    for (const [dx, dy] of order) { const p = [c[0] + dx, c[1] + dy]; if (open(p) && !taken(p)) return p; }
    return c;
  }

  function kill(b, t) {
    const at = posAt(foe.mv, t);
    const spot = bagSpot(at);
    corpses.push({ id: foe.id, at, t0: t, dir: sideOf(hero.mv.to[0] - at[0], 'w') });
    bags.push({ at: spot, t0: t });
    while (bags.length > BAGS_MAX) bags.shift();
    release(foe.slot, t);
    foe = null;
    /* One step along the loop per kill, inside the same window the next foe approaches in. */
    if (b.tickMs > FAST_TICK_MS && path.length > 1) {
      const next = path[(idx + 1) % path.length];
      if (!corpses.some((c) => same(c.at.map(Math.round), next))) {
        idx = (idx + 1) % path.length;
        hero.mv = { from: hero.mv.to.slice(), to: next.slice(), t0: t, t1: t + Math.min(STEP_MS, Math.max(0, b.tickMs - WINDUP_MS)) };
      }
    }
    if (b.next) engage(b.next, t, b.tickMs, false);
  }

  return {
    /** The fight as the client holds it now: { foe, tickMs, down }. */
    sync(f, t) {
      if (f.down && !down) downSince = t;
      down = !!f.down;
      if (!f.foe) { breakOff(t); return; }
      if (!foe) engage(f.foe, t, f.tickMs || 0, true);
      else if (foe.id !== f.foe) { breakOff(t); engage(f.foe, t, f.tickMs || 0, false); }
    },
    /** One swing, from src/render/combat-observer.js. */
    beat(b, t) {
      if (!foe || foe.id !== b.foe) { breakOff(t); engage(b.foe, t, b.tickMs, true); }
      hero.act = { name: 'attack', t0: t };
      const quiet = down || b.downAfter;
      const fAt = posAt(foe.mv, t), hAt = posAt(hero.mv, t);
      if (!quiet) {
        if (b.killed) floats.push({ at: fAt, text: String(b.foeDmg), kind: 'kill', t0: t });
        else if (b.foeDmg > 0) floats.push({ at: fAt, text: String(b.foeDmg), kind: b.crit ? 'crit' : 'hit', t0: t });
        else if (b.miss) floats.push({ at: fAt, text: 'miss', kind: 'miss', t0: t });
        if (b.heroDmg > 0) floats.push({ at: hAt, text: '-' + b.heroDmg, kind: 'hurt', t0: t });
      }
      if (b.killed) { kill(b, t); return; }
      if (b.foeDmg > 0) foe.act = { name: 'hit', t0: t };
      if (b.heroDmg > 0) foe.act = { name: 'attack', t0: t };
    },
    /** Everyone's place and pose at t. */
    frame(t) {
      const prune = (list, ms) => { while (list.length && t - list[0].t0 > ms) list.shift(); };
      prune(floats, FLOAT_MS); prune(corpses, CORPSE_MS); prune(bags, BAG_MS);
      while (leaving.length && t > leaving[0].mv.t1) leaving.shift();
      const hAt = posAt(hero.mv, t), fAt = foe ? posAt(foe.mv, t) : null;
      const pose = (u, moving) => (moving ? { anim: 'walk', age: t } : u.act && t - u.act.t0 < ACT_MS ? { anim: u.act.name, age: t - u.act.t0 } : { anim: 'idle', age: t });
      const head = fAt ? [fAt[0] - hAt[0], fAt[1] - hAt[1]] : [hero.mv.to[0] - hero.mv.from[0], hero.mv.to[1] - hero.mv.from[1]];
      /* the hero (only: monsters face east or west) also carries the diagonal, drawn when its art has it */
      const heroOut = Object.assign({ x: hAt[0], y: hAt[1], dir: dirOf(head[0], head[1]), diag: diagonalOf(head[0], head[1]) },
        down ? { anim: 'down', age: t - downSince } : pose(hero, t < hero.mv.t1));
      return {
        down,
        hero: heroOut,
        foe: foe && Object.assign({ id: foe.id, x: fAt[0], y: fAt[1], dir: sideOf(hAt[0] - fAt[0], 'w') }, pose(foe, t < foe.mv.t1)),
        ambient: ambient.filter((a) => visible(a, t)).map((a) => {
          const w = ambientAt(a, t);
          return { id: a.id, x: w.at[0], y: w.at[1], dir: w.dir, anim: w.moving ? 'walk' : 'idle', age: t };
        }),
        leaving: leaving.map((l) => { const at = posAt(l.mv, t); return { id: l.id, x: at[0], y: at[1], dir: l.dir, anim: 'walk', age: t, alpha: Math.max(0, 1 - (t - l.mv.t0) / LEAVE_MS) }; }),
        corpses: corpses.map((c) => ({ id: c.id, x: c.at[0], y: c.at[1], dir: c.dir, anim: t - c.t0 < DEATH_MS ? 'death' : 'corpse', age: t - c.t0,
          alpha: Math.min(1, (CORPSE_MS - (t - c.t0)) / 600) })),
        bags: bags.map((g) => ({ x: g.at[0], y: g.at[1], alpha: Math.min(1, (BAG_MS - (t - g.t0)) / 600) })),
        floats: down ? [] : floats.map((f) => ({ x: f.at[0], y: f.at[1], text: f.text, kind: f.kind, age: t - f.t0, life: FLOAT_MS })),
      };
    },
  };
}
