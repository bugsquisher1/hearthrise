// ============================================================
// src/core/hunt/reactions.js — WHAT A REACTION DOES: the queue react-queue.js fills, drained after every hook of a sub-step (world-step.js)
// (lane/talent-effects; docs/design/redesign/15 "New engine pieces" and "Stacking keys", 16, 17). The Roads, Signatures and Traits share
// these pieces: a reaction is a data row ({ id, on, do, ... }, src/data/talents.js REACT_ON / REACT_DO), never code of its own.
//
// A ROW'S FILTERS: `of` (the moment's move: Draining Sickness reads only Green Sickness's hits), `row` (an ally hit only in that row:
// Guarding Challenge's back row), `melee` (a hit taken only from beside), and a clock (`clockMs`, per target with per 'target': Lifeline's
// 10 s an ally), kept on the hero's cooldowns as '~r:<id>[:<target>]' (persisted with them, so a settle cut keeps it).
//
// WHAT IT DOES (`do`):
//   cast    the hero casts `move` now (abilities.js castNow: out of turn, never its lane; `free` costs no mana)
//   reset   `move`'s cooldown `ms` sooner, never sooner than its cycle's ready time less `capMs` (one cut a cycle can take at most capMs,
//           15 "1 s per kill, up to 4 s"), never before now; the cycle's ready time kept as '~cut:<move>' beside it
//   mana    pm of the hero's max mana, never past it
//   heal    to 'self': pm of its max health; to 'lowest': pm of the moment's damage on the living ally with the lowest share of health
//   shield  pm of the hero's max health for each monster the moment took (a taunt's count), on the hero, under the one shield rule
//   status  `status` on the moment's source ('hit_taken': the attacker) or target, lasting `ms` when named
//   echo    a second hit: pm of the moment's damage on its target, `ms` later (statuses.js echo, a fixed tick: status.js layStack)
//   carry   an overkill carried: pm of what the killing blow had past the HP it took, at most capPm of the fallen's max health, on the
//           nearest living engaged monster within `r` tiles of it (ties by id)
// Numbers that can land (heal, shield, mana, echo, carry) are x ramp(L) already (src/core/talents.js grantsOf).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { STATUSES } from '../../data/statuses.js';
import { castNow } from './abilities.js';
import { landHit } from './damage.js';
import { applyStatus, statusRow, layStack } from './status.js';
import { healIn } from './heal-cut.js';
import { offerShield } from './shields.js';
import { makeEvent } from './events.js';
import { rowOf as standsIn } from './monster-roles.js';
import { cheb } from './grid.js';
import { isAlly, isMonster } from './sides.js';

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);
const share = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 1000) / int(u.maxHp) : 1000);

/** DRAIN THE QUEUE (world-step.js, after every hook): each queued reaction in the order its moment happened. While it drains nothing new
    is queued (react-queue.js queueOn reads `inst.reacting`), so no reaction sets off another. */
export function drainReactions(inst, sc) {
  const q = inst && inst.reactQ;
  if (!q || !q.length) return;
  inst.reactQ = null;
  inst.reacting = true;
  try { for (const e of q) runOne(inst, sc, e); } finally { inst.reacting = false; }
}

/* one queued reaction: its filters, its clock, what it does */
function runOne(inst, sc, { u, row, ctx }) {
  if (!u || u.alive !== true) return;
  if (row.of && ctx.ability !== row.of) return;
  if (row.row && !(ctx.t && standsIn(ctx.t) === row.row)) return;
  if (row.melee && !ctx.melee) return;
  const key = '~r:' + row.id + (row.per === 'target' && ctx.t ? ':' + ctx.t.id : '');
  if (row.clockMs && readyAt(u.cds, key) > sc.atMs) return;
  const did = DO[row.do](inst, sc, u, row, ctx);
  if (did && row.clockMs) u.cds = Object.assign({}, u.cds || {}, { [key]: sc.atMs + row.clockMs });
}

/* heal `t` by `n` from `u` now through the heal door, capped at what it misses; a `heal` naming the reaction. Answers what landed. */
function healNow(inst, sc, u, t, n, id) {
  const got = Math.max(0, Math.min(healIn(inst, t, n), int(t.maxHp) - int(t.hp)));
  if (!got) return 0;
  t.hp = int(t.hp) + got;
  sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got, ability: id }));
  return got;
}

/** CUT `move`'s COOLDOWN on hero `u` by `ms` at `atMs`, never under its cycle's ready time less `capMs`, never before now (the header).
    Answers whether it moved. */
export function cutCooldown(u, move, ms, capMs, atMs) {
  const ready = readyAt(u.cds, move);
  if (!(ready > atMs)) return false;
  const key = '~cut:' + move;
  const orig = readyAt(u.cds, key) >= ready ? readyAt(u.cds, key) : ready;
  const next = Math.max(atMs, orig - capMs, ready - ms);
  if (next >= ready) return false;
  u.cds = Object.assign({}, u.cds, { [move]: next, [key]: orig });
  return true;
}

const DO = Object.freeze({
  cast: (inst, sc, u, row, ctx) => castNow(inst, sc, u, row.move, { target: ctx.t || null, free: row.free === true }),
  reset: (inst, sc, u, row) => cutCooldown(u, row.move, row.ms, row.capMs || row.ms, sc.atMs),
  mana: (inst, sc, u, row) => {
    const max = int(u.maxMana);
    if (!(max > 0) || int(u.mana) >= max) return false;
    u.mana = Math.min(max, int(u.mana) + Math.max(1, Math.floor((max * row.pm) / 1000)));
    return true;
  },
  heal: (inst, sc, u, row, ctx) => {
    if (row.to === 'self') return healNow(inst, sc, u, u, Math.max(1, Math.floor((int(u.maxHp) * row.pm) / 1000)), row.id) > 0;
    let t = null;
    for (const a of inst.world.units) if (a.alive === true && isAlly(u, a) && int(a.hp) < int(a.maxHp) && (!t || share(a) - share(t) < 0 || (share(a) === share(t) && a.id < t.id))) t = a;
    const n = Math.floor((int(ctx.dmg) * row.pm) / 1000);
    return !!t && n > 0 && healNow(inst, sc, u, t, n, row.id) > 0;
  },
  shield: (inst, sc, u, row, ctx) => offerShield(sc, u, u, Math.floor((int(u.maxHp) * row.pm * Math.max(1, int(ctx.n))) / 1000)),
  status: (inst, sc, u, row, ctx) => {
    const m = ctx.src || ctx.t;
    if (!m || m.alive !== true || isAlly(u, m)) return false;
    const st = statusRow(row.status);
    if (applyStatus(inst, m, st, { u: u.id, maxHit: Math.max(1, int(u.maxHit)), runeTier: 1 }, sc) === null) return false;
    if (row.ms) for (const s of m.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;
    return true;
  },
  echo: (inst, sc, u, row, ctx) => {
    const t = ctx.t, n = Math.floor((int(ctx.dmg) * row.pm) / 1000);
    return !!t && t.alive === true && n > 0 && layStack(inst, sc, t, STATUSES.echo, u, n, row.ms, true) !== null;
  },
  carry: (inst, sc, u, row, ctx) => {
    const dead = ctx.t;
    const n = Math.min(Math.floor((int(ctx.over) * row.pm) / 1000), Math.floor((int(dead && dead.maxHp) * row.capPm) / 1000));
    if (!dead || !(n > 0)) return false;
    const m = nearestEngaged(inst, dead, row.r, () => true);
    return !!m && landHit(inst, sc, u, m, n, null, { id: 'carry', dot: true, exact: true }).dmg > 0;
  },
  ready: (inst, sc, u, row) => readyNow(u, row.move, sc.atMs),
  pass: (inst, sc, u, row, ctx) => passOn(inst, sc, u, row.what, ctx),
  boon: (inst, sc, u, row, ctx) => {
    const t = ctx.t;
    if (!t || t.alive !== true || (t !== u && !isAlly(u, t))) return false;
    const st = statusRow(row.status);
    if (applyStatus(inst, t, st, { u: u.id, maxHit: 1, runeTier: 1 }, sc) === null) return false;
    if (row.ms) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;
    return true;
  },
});

/* THE NEAREST LIVING ENGAGED MONSTER to `from` within `r` tiles (Infinity: any) that `ok` takes, ties by id; null with none */
function nearestEngaged(inst, from, r, ok) {
  let m = null;
  for (const o of inst.world.units) {
    if (o === from || o.alive !== true || !isMonster(o) || !Number.isInteger(o.target) || cheb(o, from) > r || !ok(o)) continue;
    if (!m || cheb(o, from) < cheb(m, from) || (cheb(o, from) === cheb(m, from) && o.id < m.id)) m = o;
  }
  return m;
}

/** `move` READY NOW on hero `u` at `atMs` (a `ready` reaction: The Wood Book's Hoarfrost): its cooldown ends now. Answers whether it was
    cooling. */
export function readyNow(u, move, atMs) {
  if (!(readyAt(u.cds, move) > atMs)) return false;
  u.cds = Object.assign({}, u.cds, { [move]: atMs });
  return true;
}

/* WHAT THE FALLEN CARRIED MOVES ON (a `pass` reaction, on a death): `what` 'mark', a Mark still running as it fell (the moment's markPm and
   markUntil), onto the nearest engaged monster not marked, with its time left (Lurcher's Collar); or a status id, every stack of it hero `u`
   laid on the fallen, each onto the nearest engaged monster with its scale and its time left (15: "a status moving on a death", #28). */
function passOn(inst, sc, u, what, ctx) {
  const dead = ctx.t;
  if (!dead) return false;
  if (what === 'mark') {
    if (!(int(ctx.markPm) > 0 && int(ctx.markUntil) > sc.atMs)) return false;
    const m = nearestEngaged(inst, dead, Infinity, (o) => !(int(o.markUntil) > sc.atMs));
    if (!m) return false;
    m.markPm = ctx.markPm; m.markUntil = ctx.markUntil;
    sc.emit(makeEvent('mark', sc.atMs, { u: u.id, t: m.id }));
    return true;
  }
  const mine = (Array.isArray(dead.statuses) ? dead.statuses : []).filter((st) => st.s === what && st.src === u.id && st.left > 0);
  const m = mine.length ? nearestEngaged(inst, dead, Infinity, () => true) : null;
  if (!m) return false;
  const row = statusRow(what);
  for (const was of mine) {
    if (applyStatus(inst, m, row, { u: u.id, maxHit: 1, runeTier: 1 }, sc) === null) return false;
    let st = null;
    for (const s of m.statuses) if (s.s === what && s.src === u.id && s.left === row.durationMs) st = s;
    if (st) { st.left = was.left; st.scale = was.scale; for (const k of ['next', 'amt', 'pw', 'wu']) if (was[k] !== undefined) st[k] = was[k]; }
  }
  return true;
}
