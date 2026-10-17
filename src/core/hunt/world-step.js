// ============================================================
// src/core/hunt/world-step.js — ONE SWING OF THE HUNT (spec §1.1 engine contract)
//
// `stepSwing(world, swingCtx)` is what src/core/combat-sim.js
// simulateHuntSpan runs at every swing boundary (it replaced the single-foe
// `simulateTick`; there is still exactly one loop — AWAY-1, AWAY-12).
//
// A swing is swingMs / HUNT_TUNING.stepMs sub-steps. Each sub-step runs the
// modules in ONE fixed order (WS-02):
//   trail → respawn → phase AI (pull cycle, targets, roles, follow) →
//   movement → leash resets → attacks → status ticks → consumables → corpses
// Every hook takes (inst, sc): `inst` = { world, ground, grid, occ }, `sc` =
// { atMs, dtMs, swing, rng, emit(event), track(step) }. Draws come from
// `sc.rng` (the swing's `s` stream) in that order, units in id order.
//
// THE SINGLE-FOE SWING. Until damage.js (H2), abilities.js / consumables.js
// (H4) and xp-share.js (H5) take a party's swing over, the session's hero
// fights `state.activeMonster` exactly as before: `swingFoe` below, with its
// kill and death hand-offs. It runs once per swing, after the sub-steps, and
// draws in the order its comment states. A call with no world (the attended
// client tick, the unit tests) runs only that swing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_TUNING } from '../../data/hunt-tuning.js?v=589';
import { KNOCKOUT_MS } from '../../data/hunt-sessions.js?v=589';
import { BASIC_EFFECT_SHARE } from '../../data/supply-basics.js?v=589';
import { COMBAT_BALANCE, rollAttack, rollCrit, applyCrit } from '../combat.js?v=589';
import { rollDropTable } from '../drops.js?v=589';
import { resolveHearthfind } from '../hearthfind.js?v=589';
import { hitXpRoute, killXpRoute } from '../styles.js?v=589';
import { applyGoldFind } from '../pacing.js?v=589';
import { resumeHpFor } from '../recovery.js?v=589';
import { runActionBar, spendFromBag, shopShotFor, buyFromShop, floorOf, coverValue } from '../action-rules.js?v=589';
import { pickSpawn } from '../hunt-spawn.js?v=589';
/* THE CONSUMPTION SEAM (design item E1): the arithmetic lives in ../ammo.js. */
import { spendForSwings, applyAmmoMult, readAmmo } from '../ammo.js?v=589';
import { recordTrail, followTrail, moveAll, occupancy } from './movement.js?v=589';
import { holderOutside, resetPack } from './leash.js?v=589';
import { chooseTargets } from './targeting.js?v=589';
import { positionHeroes } from './roles.js?v=589';
import { respawnPacks, runPhase, clearCorpses } from './pull-cycle.js?v=589';
import { resolveAttacks } from './damage.js?v=589';
import { castAbilities } from './abilities.js?v=589';
import { tickStatuses } from './status.js?v=589';
import { consume } from './consumables.js?v=589';

export function fxOf(ctx) { return (ctx && ctx.fx) || {}; }
export function call(fx, name, ...args) {
  const f = fx[name];
  return typeof f === 'function' ? f(...args) : undefined;
}

/* Outcomes, named so a caller never compares against a bare string. */
export const OUTCOME = {
  HIT: 'hit', KILL: 'kill', DEATH: 'death', STOP: 'stop',
};

/** How many sub-steps one swing of `swingMs` is; refuses a swing that is not a whole number of them. */
export function substepsOf(swingMs) {
  const s = HUNT_TUNING.stepMs;
  if (!Number.isInteger(swingMs) || swingMs <= 0 || swingMs % s !== 0) {
    throw new Error('world-step: a ' + swingMs + ' ms swing is not a whole number of ' + s + ' ms sub-steps');
  }
  return swingMs / s;
}

/* The sub-step order (WS-02). One list, so the order is stated once. */
const SUBSTEP = Object.freeze([
  (inst) => recordTrail(inst),
  respawnPacks,
  runPhase, chooseTargets, positionHeroes, (inst) => followTrail(inst),
  moveAll,
  (inst, sc) => { for (let p = 0; p < inst.world.packs.length; p++) if (holderOutside(inst, p)) resetPack(inst, p, sc); },
  resolveAttacks, castAbilities,
  tickStatuses,
  consume,
  clearCorpses,
]);

/* Run the world's sub-steps for one swing starting at `atMs`. */
function stepWorld(world, swingCtx, track, events) {
  if (!swingCtx.ground || !swingCtx.grid) throw new Error('world-step: a world needs its ground row and grid');
  const n = substepsOf(swingCtx.swingMs);
  const inst = { world, ground: swingCtx.ground, grid: swingCtx.grid, occ: null };
  const atMs = Number(swingCtx.atMs);
  if (!Number.isInteger(atMs)) throw new Error('world-step: atMs must be an integer');
  const sc = { atMs, dtMs: HUNT_TUNING.stepMs, swing: world.swing, rng: swingCtx.rng,
    emit: (ev) => { events.push(ev); }, track: (st) => { track.push(st); } };
  for (let i = 0; i < n; i++) {
    sc.atMs = atMs + i * HUNT_TUNING.stepMs;
    occupancy(inst);
    for (const hook of SUBSTEP) hook(inst, sc);
  }
  world.swing += 1;
}

/**
 * ONE SWING. `swingCtx.state` is the session hero's player-state (mutated in
 * place); `world` is the decoded instance world, or null for a fight with no
 * ground yet. `swingCtx.fight === false` (the hero is knocked out, or waiting
 * on a pull) steps the world only. Answers the single-foe outcome (`outcome`
 * null when it did not fight) plus the swing's `track` and world `events`.
 */
export function stepSwing(world, swingCtx) {
  const track = []; const events = [];
  if (world) stepWorld(world, swingCtx, track, events);
  if (swingCtx.fight !== false && !(swingCtx.state && typeof swingCtx.state === 'object')) {
    throw new Error('stepSwing: swingCtx.state (the hero who swings) is required');
  }
  const r = swingCtx.fight === false ? { outcome: null } : swingFoe(swingCtx.state, swingCtx);
  r.track = track;
  r.events = events;
  return r;
}

/**
 * Resolve a KILL: gold, drops, kill XP, and every counter a kill feeds.
 * Presentation is not here: it arrives through `fx.onKill` / `fx.onDrop`.
 */
export function resolveKill(state, m, ctx) {
  const fx = fxOf(ctx);
  const rng = ctx.rng;
  const id = state.activeMonster;
  const bonus = typeof ctx.bonus === 'function' ? ctx.bonus : () => 0;

  const gp = applyGoldFind(rng.int(m.gp[0], m.gp[1]), bonus);
  state.gold = (state.gold || 0) + gp;
  call(fx, 'onLoot', gp, m, ctx);
  state.stats = state.stats || {};
  state.stats.kills = (state.stats.kills || 0) + 1;
  state.combatKillsThisFoe = (state.combatKillsThisFoe || 0) + 1;

  const dropMult = (typeof ctx.weakness === 'function' ? ctx.weakness(m, id) : { dropMult: 1 }).dropMult;
  /* rollDropTable applies `min(0.95, ch x dropMult x (1+dropBuff))`: the cap is
     AFTER every multiplier, and a guaranteed drop (ch >= 1) is untouched. */
  const rolled = rollDropTable(m.drops, {
    dropMult,
    dropBuff: bonus('dropRate'),
  }, rng);

  for (const ev of rolled.events) {
    call(fx, 'addItem', ev.id, 1);
    if (ev.rare) state.stats.rareDrops = (state.stats.rareDrops || 0) + 1;
    call(fx, 'onDrop', ev, m, ctx);
  }

  /* BASE rewards: they run unconditionally — there is no `if (!away)` below. */
  call(fx, 'recordKill', id, rolled.dropped);
  call(fx, 'rollKillDeed', m);
  for (const g of killXpRoute(ctx.style, m.xp, 1)) call(fx, 'addXp', g.skill, g.amount);
  call(fx, 'updateDaily', 'kill_any', 1);
  call(fx, 'updateQuest', 'kill_any', 1, { target: id });
  call(fx, 'updateQuest', 'kill_monster', 1, { target: id });
  call(fx, 'handleBountyKill', id, m);

  /* THE HEARTHFIND: LAST, after every other draw this kill makes, and scaled by
     nothing. The grant is hr_apply's, from its own catalogue. */
  const found = resolveHearthfind(state, 'monster', id, ctx);

  const info = { gp, monster: m, monsterId: id, drops: rolled.dropped, events: rolled.events };
  if (found) info.hearthfind = found;
  call(fx, 'onKill', info, ctx);

  /* RESPAWN. A hunt rolls the next foe from its weighted spawns on this seeded
     rng, after every other draw this kill made; a one-spawn hunt draws nothing.
     An id the roster does not know keeps the current foe. */
  const nextId = (ctx.hunt && ctx.hunt.spawns) ? pickSpawn(ctx.hunt.spawns, rng) : id;
  const next = (nextId !== id && ctx.monsters && ctx.monsters[nextId]) || null;
  if (next) {
    state.activeMonster = nextId;
    state.combatKillsThisFoe = 0;
  }
  state.monsterHp = (next || m).hp;
  state.monsterMaxHp = (next || m).hp;
  return info;
}

/**
 * Resolve a DEATH: a flat KNOCKOUT_MS knockout, up again at `resumeHpFor(maxHp)`
 * (40%), never a free heal. Only REPORTS the knockout; simulateHuntSpan owns the
 * timeline that turns it into an absolute recovery line.
 */
export function resolveDeath(state, ctx) {
  const fx = fxOf(ctx);
  state.stats = state.stats || {};
  const soFar = Math.floor(Number(state.stats.deaths) || 0);
  const base = (v) => { const n = Math.floor(Number(v)); return isFinite(n) && n >= 0 ? n : 0; };
  const todayBefore = base(state.deathsTodayBefore) + soFar;
  const lifeBefore  = base(state.deathsLifetimeBefore) + soFar;
  state.stats.deaths = soFar + 1;
  state.playerHp = resumeHpFor(state.playerMaxHp);
  state.monsterHp = 0;
  const info = {
    died: true,
    recoverMs: KNOCKOUT_MS,
    deathsToday: todayBefore + 1,
    deathsLifetime: lifeBefore + 1,
    nextRecoverMs: KNOCKOUT_MS,
    resumeHp: state.playerHp,
  };
  call(fx, 'onDeath', ctx, info);
  return info;
}

/* A HUNT'S QUIVER IS ITS BAG, then the shop shot (Tyler 2026-10-14): the bag
   line of the equipped ammo first, then whatever the purse can buy, shot by
   shot, only on the player's own choice — and a shop shot fires at
   BASIC_EFFECT_SHARE of its crafted partner's bonus. A style that needs ammo
   and can neither draw nor buy one marks the session goldOut. */
function spendFromQuiver(state, hunt, ctx) {
  const ammoId = (state.equipment && state.equipment.ammo) || null;
  const line = ammoId && hunt.bag ? hunt.bag[ammoId] : null;
  if (!state.ammoCarry || typeof state.ammoCarry !== 'object') state.ammoCarry = {};
  const bagLeft = line ? Math.max(0, Math.floor(Number(line.left) || 0)) : 0;
  const shot = ammoId ? shopShotFor(hunt, ammoId) : null;
  const price = shot ? shot.price : 0;
  /* What the purse can buy with the floor kept, counting the loot it could sell. */
  const buyable = price > 0
    ? Math.floor(Math.max(0, Math.floor(Number(hunt.purse) || 0) + coverValue(hunt) - floorOf(hunt)) / price) : 0;
  const view = { equipment: state.equipment, ammoCarry: state.ammoCarry,
    inventory: ammoId ? { [ammoId]: bagLeft + buyable } : {} };
  const atMs = Number(ctx.atMs) || 0;
  const opts = { items: ctx.items, weaponType: ctx.weaponType, fx: { removeItem: (id, n) => {
    const fromBag = spendFromBag(hunt, id, Math.min(n, bagLeft), atMs);
    if (n - fromBag > 0 && shot) buyFromShop(hunt, shot.id, n - fromBag);
  } } };
  if (price > 0 && bagLeft + buyable <= 0) {
    const info = readAmmo(view, opts);
    if (info.needed && info.spends && info.perShot > 0) hunt.goldOut = true;
  }
  const out = spendForSwings(view, 1, opts);
  /* A swing loosed with the carried line empty and the store behind it is a SHOP SHOT. */
  out.shop = !!shot && bagLeft <= 0 && buyable > 0;
  return out;
}

/*
 * The single-foe swing. Draw order is fixed and load-bearing (the parity tests
 * replay it): 1. player swing (rollAttack, up to 2) 2. crit (1, only on a hit)
 * 3. [kill] gold (1) then the drop table (1 per row) 4. monster swing (up to 2).
 * The ammo spend draws nothing (src/core/ammo.js §2.1) — a contract.
 */
function swingFoe(state, ctx) {
  const fx = fxOf(ctx);
  const monsters = ctx.monsters || {};
  const id = state.activeMonster;
  if (!id) return { outcome: OUTCOME.STOP, reason: 'no-target' };
  const m = monsters[id];
  if (!m) { state.activeMonster = null; return { outcome: OUTCOME.STOP, reason: 'unknown-monster' }; }

  /* THE ARROW IS SPENT ON THE SWING, hit or miss (E1 R3), charged BEFORE the
     roll: `startMult` is the supply state the swing is loosed at. No-ammo
     loadouts are untouched (`applyAmmoMult` at 1 returns its input). */
  const hunt = state.huntSession || null;
  const supply = hunt ? spendFromQuiver(state, hunt, ctx) : spendForSwings(state, 1, ctx);

  const roll = ctx.playerRolls(m, supply && supply.shop ? { ammoShare: BASIC_EFFECT_SHARE } : undefined);
  let pDmg = rollAttack(ctx.rng, roll.accuracy, applyAmmoMult(roll.maxHit, supply.startMult));

  /* Crit is gear (`critB` + the set bonus), so it applies on every path. */
  let didCrit = false;
  if (pDmg > 0 && rollCrit(ctx.rng, roll.critChance)) {
    pDmg = applyCrit(pDmg, COMBAT_BALANCE.critMult);
    didCrit = true;
    state.stats = state.stats || {};
    state.stats.crits = (state.stats.crits || 0) + 1;
  }
  state._lastPlayerCrit = didCrit;
  /* XP IS EARNED ON DAMAGE DEALT: only the HP the swing removed pays hit XP. */
  const hpBefore = Math.max(0, state.monsterHp);
  const xpDmg = Math.min(pDmg, hpBefore);
  state.monsterHp = Math.max(0, state.monsterHp - pDmg);
  call(fx, 'onSwing', m, pDmg, didCrit, ctx);

  if (xpDmg > 0) {
    for (const g of hitXpRoute(ctx.style, xpDmg)) call(fx, 'addXp', g.skill, g.amount);
  }

  if (state.monsterHp <= 0) {
    /* Through `fx.killMonster` when the caller supplies one (the client's name
       carries its feature wrappers); resolveKill keeps this file usable bare. */
    const info = typeof fx.killMonster === 'function' ? fx.killMonster(m) : resolveKill(state, m, ctx);
    return { outcome: OUTCOME.KILL, crit: didCrit, pDmg, kill: info || null, supply };
  }

  const mr = ctx.monsterRolls(m);
  const mDmg = rollAttack(ctx.rng, mr.accuracy, mr.maxHit);
  state.playerHp = Math.max(0, state.playerHp - mDmg);
  call(fx, 'onMonsterSwing', m, mDmg, ctx);

  /* THE ACTION BAR is the only eater: a fight outside a hunt session eats nothing. */
  const ate = hunt ? runActionBar(state, ctx) : false;

  if (state.playerHp <= 0) {
    /* `recoverMs` rides the outcome so the span reads the knockout from one place. */
    const d = resolveDeath(state, ctx);
    return { outcome: OUTCOME.DEATH, crit: didCrit, pDmg, mDmg, ate, supply, recoverMs: d.recoverMs };
  }
  /* `supply` rides on EVERY outcome: an arrow spent on a killing blow is still an arrow. */
  return { outcome: OUTCOME.HIT, crit: didCrit, pDmg, mDmg, ate, supply };
}
