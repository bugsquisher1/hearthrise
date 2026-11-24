// ============================================================
// src/core/hunt/heal-rules.js — WHAT A HEAL OR A SHELL DOES WHERE IT LANDS: the one heal and shell landing every cast goes through, and
// the engine pieces on it (lane/talent-effects; docs/design/redesign/15 "New engine pieces", 16, 17). The Roads, Signatures and Traits
// reach them through a modded row's `fx` (src/core/hunt/talent-rows.js moddedRow); a row with none lands exactly as it did.
//
//   landHeal(u, t, n, sc, surge, row, piped, cast)  ONE HEAL of a cast on `t` (abilities.js effect): Tempering off the scale, the per-target
//                 output (talent-rows.js outPmFor), then either the whole heal laid over time (fx.hotAll) or the instant heal through the
//                 heal door (heal-cut.js healIn: its cut and the healing `t` receives), capped at what `t` misses, its overflow kept as a
//                 shield (row.overShieldPm); then a share again over time (fx.hotPm), a share on a second ally (fx.alsoPm), harmful
//                 stacks cleansed (fx.cleanse), a share of max mana to `t` (fx.manaToHealedPm)
//   landShell(u, t, n, sc, row, cast)  ONE SHELL of a cast with pieces: the per-target output, the one shield rule (shields.js), and a
//                 share of it as a heal (fx.healOfShieldPm)
//   layOverTime(inst, sc, u, t, total, ms)  a heal of `total` laid on `t` as a Mending stack over `ms` (status.js layStack: a fixed tick)
//   castReturns(u, row, cast)  the cast's mana returns once it has landed: a share of max mana to the caster (fx.manaOnCastPm), a share of
//                 the mana it cost back when a target it healed was near fall-back (fx.manaBackNearPm)
//   `cast` is the cast's context (abilities.js fire): { inst, fx, spent, near }, `near` set when a target healed was near fall-back.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws only what the old heal drew (Tempering's part of a point).
// ============================================================

import { STATUSES, harmful } from '../../data/statuses.js';
import { temperedAmount } from '../temper.js';
import { makeEvent } from './events.js';
import { healIn } from './heal-cut.js';
import { offerShield, overflowShield } from './shields.js';
import { layStack, statusRow } from './status.js';
import { outPmFor, nearFall } from './talent-rows.js';
import { traitsField } from './trait-rules.js';
import { dist2 } from './grid.js';
import { isAlly, isHero } from './sides.js';

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const NONE = Object.freeze([]);
const pct = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 100) / int(u.maxHp) : 100);

/* land `n` on `t` now through the heal door, capped at its missing HP; a `heal` event (its ability when named); answers what landed */
function healNow(inst, sc, u, t, n, ability, surge) {
  const got = Math.max(0, Math.min(healIn(inst, t, n), int(t.maxHp) - int(t.hp)));
  t.hp = int(t.hp) + got;
  sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got, ...(ability ? { ability } : {}), ...(surge ? { crit: true } : {}) }));
  return got;
}

/** A HEAL OF `total` LAID OVER `ms` on `t` from `u`: a Mending stack (statuses.js) whose fixed tick is total / its ticks, at least 1. */
export function layOverTime(inst, sc, u, t, total, ms) {
  const row = statusRow('mending');
  const n = Math.max(1, Math.floor(ms / row.everyMs));
  if (total > 0) layStack(inst, sc, t, row, u, Math.max(1, Math.floor(total / n)), n * row.everyMs);
}

/** ONE HEAL of cast `row` by `u` on `t` (the header). `cast` may be absent (a bare caller): no pieces, no healing received. */
export function landHeal(u, t, n, sc, surge, row, piped, cast) {
  /* TEMPERING raises a heal as it raises a blow (src/core/temper.js); on the scale it is steps in the pipeline's heal (amount.js). */
  if (!piped) n = temperedAmount(n, u.blowsPm, sc.rng);
  const inst = cast ? cast.inst : null, fx = cast ? cast.fx : null;
  if (fx) {
    n = Math.floor((n * outPmFor(inst, u, row, t)) / 1000);
    if (nearFall(inst, t, t.hp)) cast.near = true;
  }
  if (fx && fx.hotAll === true && fx.hotMs > 0) layOverTime(inst, sc, u, t, n, fx.hotMs);
  else {
    /* the heal door: a WITHERED target takes every heal cut (heal-cut.js), and the healing it receives raises the rest */
    const missing = int(t.maxHp) - int(t.hp);
    const cut = healIn(inst, t, n);
    const got = Math.max(0, Math.min(cut, missing));
    t.hp = int(t.hp) + got;
    /* (the worn Traits that held on its amount, abilities.js effect: the event names them, src/core/hunt/trait-rules.js) */
    sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got, ...(surge ? { crit: true } : {}), ...traitsField(cast && cast.tr) }));
    /* HEALING PAST FULL KEPT AS A SHIELD (a heal row's overShieldPm, High Tide): its overflow's share, under the one shield rule */
    if (row && row.overShieldPm) overflowShield(sc, u, t, cut, missing, row.overShieldPm);
    if (fx && fx.hotPm > 0 && fx.hotMs > 0) layOverTime(inst, sc, u, t, Math.floor((n * fx.hotPm) / 1000), fx.hotMs);
  }
  if (fx) afterHeal(inst, sc, u, t, n, row, fx);
}

/* the pieces after a heal lands on `t`: a second ally, a cleanse, mana to the healed */
function afterHeal(inst, sc, u, t, n, row, fx) {
  if (fx.alsoPm > 0) {
    const o = secondAlly(inst, u, t, fx.alsoPick);
    if (o) healNow(inst, sc, u, o, Math.floor((n * fx.alsoPm) / 1000), row.id);
  }
  if (fx.cleanse > 0) cleanse(sc, t, fx.cleanse);
  if (fx.manaToHealedPm > 0 && int(t.maxMana) > 0) t.mana = Math.min(int(t.maxMana), int(t.mana) + Math.max(1, Math.floor((int(t.maxMana) * fx.manaToHealedPm) / 1000)));
}

/* THE SECOND ALLY a heal on `t` also lands on (alsoPick): the living wounded ally of `u` other than `t` with the lowest health share, or the
   nearest to `u`; ties by id. Null with none. */
function secondAlly(inst, u, t, pick) {
  let best = null;
  for (const a of inst && inst.world ? inst.world.units : NONE) {
    if (a === t || a.alive !== true || !isAlly(u, a) || !(int(a.hp) < int(a.maxHp))) continue;
    const better = !best || (pick === 'nearest' ? dist2(a, u) - dist2(best, u) || a.id - best.id : pct(a) - pct(best) || a.id - best.id) < 0;
    if (better) best = a;
  }
  return best;
}

/* CLEANSE: the first `n` harmful stacks on `t` (landing order) taken off; a `status_off` for each status it no longer carries */
function cleanse(sc, t, n) {
  if (!isHero(t) || !Array.isArray(t.statuses) || !t.statuses.length) return;
  let left = n;
  const gone = [];
  t.statuses = t.statuses.filter((st) => {
    if (left > 0 && harmful(STATUSES[st.s])) { left--; gone.push(st.s); return false; }
    return true;
  });
  for (const id of new Set(gone)) if (!t.statuses.some((st) => st.s === id)) sc.emit(makeEvent('status_off', sc.atMs, { t: t.id, status: id }));
}

/** ONE SHELL of cast `row` by `u` on `t` with pieces (the header): `n` at its per-target output, offered under the one shield rule, and
    a share of it healed (fx.healOfShieldPm). */
export function landShell(u, t, n, sc, row, cast) {
  const inst = cast.inst, fx = cast.fx;
  const s = Math.floor((n * outPmFor(inst, u, row, t)) / 1000);
  if (s > 0) offerShield(sc, u, t, s);
  if (fx.healOfShieldPm > 0 && t.alive === true && int(t.hp) < int(t.maxHp)) healNow(inst, sc, u, t, Math.floor((s * fx.healOfShieldPm) / 1000), row.id);
}

/** THE CAST'S MANA RETURNS once it has landed (the header), never past the caster's max. */
export function castReturns(u, row, cast) {
  const fx = cast && cast.fx;
  if (!fx || !(int(u.maxMana) > 0)) return;
  let back = 0;
  if (fx.manaOnCastPm > 0) back += Math.max(1, Math.floor((int(u.maxMana) * fx.manaOnCastPm) / 1000));
  if (fx.manaBackNearPm > 0 && cast.near && cast.spent > 0) back += Math.floor((cast.spent * fx.manaBackNearPm) / 1000);
  if (back > 0) u.mana = Math.min(int(u.maxMana), int(u.mana) + back);
}
