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
//   cast    the hero casts `move` now (abilities.js castNow: out of turn, never its lane; `free` costs no mana; `again` waits on no
//           cooldown and spends no supply: Charred Sabre's Flame Strike cast again on a kill), at the nearest monster for a strike
//   reset   `move`'s cooldown `ms` sooner, never sooner than its cycle's ready time less `capMs` (one cut a cycle can take at most capMs,
//           15 "1 s per kill, up to 4 s"), never before now; the cycle's ready time kept as '~cut:<move>' beside it
//   mana    pm of the hero's max mana, never past it
//   heal    to 'self': pm of its max health; to 'lowest': pm of the moment's damage on the living ally with the lowest share of health
//   shield  pm of the hero's max health for each monster the moment took (a taunt's count, a cast's monsters its status landed on: none,
//           no shield), at most capPm of it, on the hero, under the one shield rule
//   status  `status` on the moment's monsters: every monster within `r` tiles of the hero when the row names `r`, else each the moment
//           took (a taunt's), else its source ('hit_taken': the attacker) or target; lasting `ms` when named; with `pm` a ticking status
//           lands a fixed tick, pm of the moment's damage over its time (Floodwater Hatchets' Poison); a ground status is a patch the hero
//           holds on the moment's target's tile. A ticking stack reads the hero's blow as a cast does (on the scale its top, PIPE_TOP)
//   echo    a second hit: pm of the moment's damage on its target, `ms` later (statuses.js echo, a fixed tick: status.js layStack)
//   carry   an overkill carried: pm of what the killing blow had past the HP it took, at most capPm of the fallen's max health, on the
//           nearest living engaged monster within `r` tiles of it (ties by id)
//   burst   an explosion on a kill: pm of the fallen's max health on every living engaged monster within `r` tiles of it, in id order
//           (Hall Fire Wand); an exact amount, so it sets off nothing and never explodes again
//   reflect pm of the moment's damage (an `absorb`: what the hero's shell took) back on the monster that dealt it, exact (Drover's Hat)
//   ready   `move` ready now; pass  what the fallen carried moves on; boon  `status` on the moment's hero, `ms` long, at `pw` permille of
//           its strength when named (a branch's status strength, status-effects.js)
// Numbers that can land (heal, shield, mana, echo, carry) are x ramp(L) already (src/core/talents.js grantsOf).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { STATUSES } from '../../data/statuses.js';
import { castNow } from './abilities.js';
import { landHit, PIPE_TOP } from './damage.js';
import { stepsOn } from './amount.js';
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

/* THE BLOW A REACTION'S TICKING STATUS READS (statuses.js blowPm): the hero's own largest blow, on the scale its top, as a cast's status
   reads it (abilities.js effect: the spell rule), so a Bleed from a reaction ticks as a Bleed from Rend */
const blowOf = (inst, u) => (stepsOn(inst) ? PIPE_TOP : Math.max(1, int(u.maxHit)));

/* THE MONSTERS A `status` LANDS ON (the header): every living engaged foe within `r` tiles of the hero (in id order) when the row names a
   reach, else each the moment took (a taunt's `ms`), else the moment's source or target; never an ally, never a fallen one */
function foesFor(inst, u, row, ctx) {
  const list = Number.isInteger(row.r) ? inst.world.units.filter((o) => isMonster(o) && Number.isInteger(o.target) && cheb(o, u) <= row.r)
    : Array.isArray(ctx.ms) ? ctx.ms : [ctx.src || ctx.t];
  return list.filter((m) => !!m && m.alive === true && !isAlly(u, m));
}

/* ONE STATUS ON `m` FROM HERO `u` (a `status` reaction): with `pm`, a fixed tick of that share of the moment's damage over the row's time
   (status.js layStack); else the row's own landing at the hero's blow, its time `ms` when named. Answers whether it landed. */
function statusOn(inst, sc, u, row, ctx, st, m) {
  if (row.pm) {
    const ms = row.ms || st.durationMs, n = Math.max(1, Math.floor(ms / st.everyMs));
    const amt = Math.floor((int(ctx.dmg) * row.pm) / 1000 / n);
    return amt > 0 && layStack(inst, sc, m, st, u, amt, ms, false) !== null;
  }
  if (applyStatus(inst, m, st, { u: u.id, maxHit: blowOf(inst, u), runeTier: 1 }, sc) === null) return false;
  if (row.ms) for (const s of m.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.left = row.ms;
  return true;
}

const DO = Object.freeze({
  cast: (inst, sc, u, row, ctx) => castNow(inst, sc, u, row.move, { target: ctx.t || null, free: row.free === true, again: row.again === true }),
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
  shield: (inst, sc, u, row, ctx) => {
    /* (a moment that counts: a taunt's monsters, a cast's monsters its status landed on; every other moment one) */
    const k = ctx.n === undefined ? 1 : int(ctx.n);
    if (!(k > 0)) return false;
    const n = Math.floor((int(u.maxHp) * row.pm * k) / 1000);
    return offerShield(sc, u, u, row.capPm ? Math.min(n, Math.floor((int(u.maxHp) * row.capPm) / 1000)) : n);
  },
  status: (inst, sc, u, row, ctx) => {
    const st = statusRow(row.status);
    /* A GROUND STATUS (burning ground): a patch the hero holds on the moment's target's tile */
    if (st.ground) {
      const t = ctx.t;
      return !!t && applyStatus(inst, u, st, { u: u.id, maxHit: blowOf(inst, u), runeTier: 1, at: [t.x, t.y] }, sc) !== null;
    }
    let did = false;
    for (const m of foesFor(inst, u, row, ctx)) if (statusOn(inst, sc, u, row, ctx, st, m)) did = true;
    return did;
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
  burst: (inst, sc, u, row, ctx) => {
    const dead = ctx.t, n = Math.floor((int(dead && dead.maxHp) * row.pm) / 1000);
    if (!dead || !(n > 0)) return false;
    let did = false;
    for (const m of inst.world.units.filter((o) => o !== dead && o.alive === true && isMonster(o) && Number.isInteger(o.target) && cheb(o, dead) <= row.r).sort((a, b) => a.id - b.id)) {
      if (m.alive === true && landHit(inst, sc, u, m, n, null, { id: 'burst', dot: true, exact: true }).dmg > 0) did = true;
    }
    return did;
  },
  reflect: (inst, sc, u, row, ctx) => {
    const m = ctx.src, n = Math.floor((int(ctx.dmg) * row.pm) / 1000);
    return !!m && m.alive === true && isMonster(m) && n > 0 && landHit(inst, sc, u, m, n, null, { id: 'reflect', dot: true, exact: true }).dmg > 0;
  },
  ready: (inst, sc, u, row) => readyNow(u, row.move, sc.atMs),
  pass: (inst, sc, u, row, ctx) => passOn(inst, sc, u, row.what, ctx),
  boon: (inst, sc, u, row, ctx) => {
    const t = ctx.t;
    if (!t || t.alive !== true || (t !== u && !isAlly(u, t))) return false;
    const st = statusRow(row.status);
    if (applyStatus(inst, t, st, { u: u.id, maxHit: 1, runeTier: 1 }, sc) === null) return false;
    /* (its strength, a branch's share of what the row does: status-effects.js reads `pw`; Bargeman's Pole's Guarded at twice its row) */
    if (row.pw) for (const s of t.statuses) if (s.s === st.id && s.src === u.id && s.left === st.durationMs) s.pw = row.pw;
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
