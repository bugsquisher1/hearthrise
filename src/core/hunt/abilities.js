// ============================================================
// src/core/hunt/abilities.js — THE ACTION BAR (spec §2 abilities; parity AB-01..AB-17)
//
// Hunts are idle (Tyler 2026-10-16): there is no press path. Each sub-step,
// every living hero in a fight regenerates mana, then fires the FIRST usable
// ability SLOT in its bar order (AB-10; the condition engine,
// src/core/hunt/conditions.js: a slot whose conditions fail falls through to
// the next). An ability is usable when:
//   it is active and its action set does not skip it (AB-11),
//   its own cooldown and its lane are ready (AB-01/02),
//   the hero has the mana (AB-12), its rune and its shots (the item its attack
//   slots loose: castShotOf) resolve — own line
//   first, then the store (AB-05/06, src/core/action-rules.js resolveLine; a
//   RUNE is bought only when the slot names the store rune, `action.store`, which
//   the bar shows and the player can change — designer 2026-11-05; a basic shot
//   never buys one, shotLine),
//   an `alone` row only while no other living hero shares the world (aloneIn),
//   a `party` row only while another does (the tank's rune spells, Tyler 2026-11-19; a row party only
//   for some roles, partyOnly, binds a caster of those roles alone: Brand and Reave on the tank),
//   a row that `replaces` others only while one of their cooldowns is up (clockOf: its cast takes it),
//   and its target rule finds a target (AB-03). A slot the purse cannot pay
//   waits and the next one is tried; it never ends the hunt by itself.
// Firing spends the mana, the rune and the shots, sets the cooldown and the
// lane (AB-07), and applies the effect (AB-08): taunt, mark, hit (with a status
// per hit, H3), area (or a shape that lands only its status), shield, ally
// heal, party heal, party shield. Every number a cast lands is a share of its caster's
// own blow (THE SPELL RULE, src/data/abilities.js castAmount), Mend's of its max HP. A shell records who cast it (`shieldBy`), so a
// recast refunds only the caster's own (shieldRefund).
// A heal is capped at the missing HP (AB-09).
//
// SEAMS to the other core lanes, called through their agreed signatures only:
// damage.landHit (H2) for every hit (the one place a kill is handed off),
// status.applyStatus (H3) for a status, and
// the target's `shield`, which damage.hurt spends, and `markPm`/`markUntil`,
// which damage.landHit reads (a marked target takes more from every blow).
// Magic XP is H5's: each `cast` event carries `mana` and `magicXpMult`.
//
// INJECTED: `inst.heroes[unitId]` = { hs, slots (conditions.js heroSlots rows)
// or bar (ability ids, the shorthand), actionSet, range (tiles; 1 = Melee),
// ammo (the loaded ammo item id), items? (the server's item catalogue), skills? (skill
// XP: the unlock and rune-version gates; a peer in the browser has none and is not gated:
// the next commit reconciles it) }. A hero with no
// entry fires nothing. Draws: the swing's stream `sc.rng`, heroes in id order,
// one `int` per hit roll (spec §1.1 #3).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES, ABILITY_LANES, ABILITY_RULES, ACTION_SET_SKIPS, abilitySkill, versionOf, AREA_TARGETS, areaSpec, hitRange, landsBlow, heals, shells, castAmount, partyOnly, castsNow } from '../../data/abilities.js';
import { resolveLine, storeLine, takeLine, canAfford, shopShotFor, basicOf } from '../action-rules.js';
import { runeTierOf, versionLevel } from '../../data/runes.js';
import { BASIC_EFFECT_SHARE } from '../../data/supply-basics.js';
import { SURGE_MULT_PM } from '../../data/jewelry.js';
import { cheb, dist2, los } from './grid.js';
import { makeEvent } from './events.js';
import { landHit, PIPE_TOP } from './damage.js';
import { stepsOn, healAmount, manaOn } from './amount.js';
import { challengeable, challengeFrom, holderTank } from './targeting.js';
import { roleOf as monsterRoleOf } from './monster-roles.js';
import { MONSTER_ROLES } from '../../data/monster-roles.js';
import { applyStatus, statusRow, stretchStatus, spendCastPm } from './status.js';
import { queueOn, reactsOn } from './react-queue.js';
import { interrupt } from './monster-spells.js';
import { rowsFor } from './talent-rows.js';
import { reachOf, allyOrder, allyTargets, partyOf, onlyOne, tuneAfflict } from './cast-targets.js';
import { levelOf } from '../xp.js';
import { ammoPerShot } from '../ammo.js';
import { ITEMS } from '../../data/items.js';
import { SIGNATURES } from '../../data/signatures.js';
import { castCostOf } from './signature-costs.js';
import { castRaiseOf, guardOf } from './signature-casts.js';
import { auraPm } from './signature-auras.js';
import { isRune } from '../../data/supplies.js';
import { slotsFor, pickSlot, bestAim, itemRow, ignores, DEFAULT_ATTACK_ROW, attackOrder, runeSupplyOf, shapedAim } from './conditions.js';
import { place, covers } from './shapes.js';
import { shootsItem } from '../../data/hunt-roles.js';
import { livingOf, targetedFoesOf, heroesByIdOf } from './unit-index.js';
import { sideOf, isAlly, isHero } from './sides.js';
import { healTaken } from './heal-cut.js';
import { offerShield } from './shields.js';
import { landHeal as healOne, landShell, castReturns } from './heal-rules.js';

export const PERSISTED = Object.freeze({
  unit: Object.freeze([['mana', 'int'], ['maxMana', 'int'], ['manaMilli', 'int'], ['regenPm', 'int'], ['lanes', 'json'], ['cds', 'json'],
    ['shield', 'int'], ['shieldBy', 'int?'], ['markPm', 'int'], ['markUntil', 'int'], ['lastMove', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
/* THE BLOW A CAST OF `row` READS (the spell rule's M): the caster's own largest blow, or, for a move it BORROWS from another weapon, that
   weapon's reference blow at its Level (src/core/borrow-blow.js; `borrowBlows`, written by the settle at every boundary, never persisted). */
const blowOf = (u, row) => (u && u.borrowBlows && row && Number.isInteger(u.borrowBlows[row.id]) ? u.borrowBlows[row.id] : u && u.maxHit);
/* ON THE SCALE (src/core/hunt/amount.js) a cast's numbers are thousandths of the caster's top (damage.js PIPE_TOP), a borrowed move's at
   its weapon's reference blow over the caster's own; off it the blow itself (blowOf) */
const unitOf = (inst, u, row) => (!stepsOn(inst) ? blowOf(u, row)
  : u && u.borrowBlows && row && Number.isInteger(u.borrowBlows[row.id]) ? Math.max(1, Math.round((PIPE_TOP * u.borrowBlows[row.id]) / Math.max(1, int(u.maxHit)))) : PIPE_TOP);
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);
/* (unit-index.js: frozen lists, read once a sub-step in a swing; a caller that reorders one copies it) */
/* The living units on `u`'s side (sides.js): its allies, itself among them. In a hunt, the living heroes. */
const allies = (inst, u) => livingOf(inst, sideOf(u));
/* A foe is in the fight once it holds a target: `u`'s foes that do. In a hunt, the monsters in the fight. */
const engaged = (inst, u) => targetedFoesOf(inst, sideOf(u));

/** In reach: Melee (range 1) is adjacent; ranged is within `range` tiles with line of sight. */
export function inReach(inst, hero, range, t) {
  const r = Math.max(1, int(range) || 1);
  if (r <= 1) return cheb(hero, t) <= 1;
  return dist2(hero, t) <= r * r && los(inst.grid, hero, t);
}

/* Does unit `m` hold a live stack of status `id` (status.js stacks, persisted with the world)? */
const holds = (m, id) => Array.isArray(m.statuses) && m.statuses.some((st) => st.s === id && st.left > 0);

/* Order candidates: the hero's own target first, then nearest, then id. */
const byPreference = (hero) => (a, b) => ((b.id === hero.target) - (a.id === hero.target))
  || (dist2(a, hero) - dist2(b, hero)) || (a.id - b.id);

/* The target an ability would take now, or null (AB-03). Pure. Its trigger is the
   slot's own conditions (a slot with none fires whenever it is ready: conditions.js),
   so here a self-shield only needs a wound, an ally heal the ally its conditions
   named (else the lowest wounded one in reach) and an area its best aim. A monster
   the slot IGNORES is never its target or aim. */
function targetFor(inst, hero, h, row, sc, cx) {
  const mons = engaged(inst, hero);
  const near = mons.filter((m) => inReach(inst, hero, h.range, m) && !ignores(cx && cx.slot, m)).sort(byPreference(hero));
  const pct = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 100) / int(u.maxHp) : 100);
  switch (row.target) {
    /* The Challenge (targeting.js challengeable): a target only while a monster in its reach is off the tank (a borrowed one, from any seat). */
    case 'taunt': return challengeable(inst, hero, row).length ? hero : null;
    /* THE MARK (23-spell-audit.md section 4): the hero's own target while it is unmarked, so the party's blows land on it; else the
       healthiest in reach (a pull just begun), never one already marked */
    case 'mark': {
      const own = near.find((m) => m.id === hero.target);
      if (own && !(own.markUntil > sc.atMs)) return own;
      const t = near.slice().sort((a, b) => (int(b.hp) - int(a.hp)) || (a.id - b.id))[0];
      return t && !(t.markUntil > sc.atMs) ? t : null;
    }
    /* A STRIKE THAT PICKS ITS MARK (`prefers`, monster roles: Precision Shot takes a Shooter, Caster or Stalker in reach first, the
       bow's job of reaching the back row, 23 section 4); else, as every strike, the hero's own target, then the nearest. Off the Danger
       scale no monster plays a role (monster-roles.js roleOf), so it is the hero's own target. */
    /* ONE TARGET THAT LANDS ONLY ITS STATUS (Parry): never a monster still holding that status, so a cast never lands for nothing. */
    case 'enemy': {
      const fresh = landsBlow(row) || !row.status ? near : near.filter((m) => !holds(m, row.status));
      /* (lane/signatures-batch-5) A GUARD (signature-casts.js guardOf, Ledgehide Breeches' Parry): the slot held on another hero's wind-up
         beside the wearer (conditions.js target_winding_up names it, `cx.guard`), so the cast takes that monster */
      if (cx && cx.guard && fresh.includes(cx.guard)) return cx.guard;
      if (Array.isArray(row.prefers)) {
        const picked = fresh.find((m) => { const r = monsterRoleOf(inst, m); return !!r && row.prefers.some((id) => MONSTER_ROLES[id] === r); });
        if (picked) return picked;
      }
      return fresh[0] || null;
    }
    case 'area': {
      if (cx && cx.aim && cx.aim.alive) return cx.aim;
      const b = bestAim(inst, hero, h.range, areaSpec(row).n, cx && cx.slot);
      return b && b.count >= 1 ? b.aim : null;
    }
    /* A LINE through its best aim, a RING round the hero (conditions.js shapedAim, the count enemies_in_aoe reads). */
    case 'line': case 'ring': {
      if (cx && cx.aim && cx.aim.alive) return cx.aim;
      const b = shapedAim(inst, hero, h.range, row, cx && cx.slot);
      return b && b.count >= 1 ? b.aim : null;
    }
    /* A self-heal (Mend) and a self-shield (Arcane Barrier) need missing HP; a self-shield's standing shell must
       also be under the one this cast lands (firstUsable: it needs the version's numbers), and a recast refunds
       what is left of it (shieldRefund). */
    case 'self': return pct(hero) < 100 ? hero : null;
    case 'ally': {
      /* An ally heal takes a wounded ally; an ally SHIELD (Protective Ward) a wounded one holding no shield (or, with a refunding ward,
         Lasting Ward, one holding this caster's own shell chipped under what the cast lands: recastable). Its reach is the hero's and the
         row's own more (fx.range: Long Reach); whom it takes first, the row's pick (allyOrder: the lowest share of health, or most held). */
      const reach = reachOf(h, row);
      const ok = (a) => (!!a && a.alive && isAlly(hero, a) && pct(a) < 100 && (heals(row) || !(int(a.shield) > 0))
        && (a === hero || inReach(inst, hero, reach, a))) || recastable(inst, hero, row, a, reach);
      if (cx && cx.ally) return ok(cx.ally) ? cx.ally : null;
      return allyOrder(inst, hero, row, allies(inst, hero).filter(ok))[0] || null;
    }
    /* A party HEAL fires while any hero is hurt (it heals those in its radius). A party SHIELD (Shelter) needs a living, wounded hero
       within its radius, the caster too, holding no shell: a party already shelled waits, so no shell is cast for nothing. */
    case 'party': {
      if (!shells(row)) return allies(inst, hero).some((a) => pct(a) < 100) ? hero : null;
      const r2 = row.radius * row.radius;
      return allies(inst, hero).some((a) => pct(a) < 100 && !(int(a.shield) > 0) && (a === hero || dist2(a, hero) <= r2)) ? hero : null;
    }
    default: return null;
  }
}

/* A REFUNDING WARD'S RECAST (fx.refund, Lasting Ward): a wounded ally in reach holding this caster's own shell, chipped under what a cast
   lands, may take the ward again; fire refunds the shell's rest as mana (shieldRefund) */
function recastable(inst, hero, row, a, reach) {
  if (!(row.fx && row.fx.refund === true) || !shells(row) || !a || a.alive !== true || !isAlly(hero, a) || a.shieldBy !== hero.id) return false;
  if (!(int(a.shield) > 0) || !(int(a.hp) < int(a.maxHp)) || (a !== hero && !inReach(inst, hero, reach, a))) return false;
  return int(a.shield) < landsShield(hero, row, 1000, inst);
}

/* THE STORE'S SHARE (supply-basics.js BASIC_EFFECT_SHARE, r07): a store rune is the basic version. */
const BASIC_PM = Math.round(BASIC_EFFECT_SHARE * 1000);

/* The hero's level in the skill `row`'s unlock and rune versions read (abilitySkill: Magic, or the weapon's own skill); 1 for
   a hero whose entry carries no skills (a bare fixture, a peer the browser draws: the server's commit is the truth). */
const skillLevel = (h, row) => (h && h.skills ? levelOf(h.skills, abilitySkill(row)) : 1);
/* (A spell's numbers grow with its caster's blow, which carries the skill and the worn +skill: "it functions like it does in tibia",
   Tyler 2026-11-14. The gates, an ability's unlock and a rune's version, read the base level alone: skillLevel.) */

/* THE RUNE A SPELL SPENDS AND THE VERSION IT CASTS (Tyler 2026-10-23, src/data/runes.js; RUNE SUPPLY PER SLOT,
   Tyler 2026-11-08). A spell spends a rune of its FAMILY, and only one its slot TICKED (`action.own`,
   conditions.js runeSupplyOf): of those the hero carries, the highest tier whose version its level in the row's
   skill has unlocked, cast at that tier's version (a tie in tier goes to the lower item id). When none of them is
   left the slot does what its `onEmpty` says: `store` buys EXACTLY the store rune it names (`action.store`) per use,
   its partner's version at the store's share (the rune ladder, Tyler 2026-11-05; a row of another family is no
   store here); `leave` answers `runes_out` and the hunt ends (firstUsable). A version still locked is never spent,
   carried or bought (`level`): a ticked rune the hero holds but cannot cast yet is not "run out", so a `leave` slot
   waits on it, and a locked store rune never falls back to a cheaper one: the game never chooses a player's tier.
   A hero whose entry carries no skills is not gated here. */
function runeFor(h, row, action) {
  const sup = runeSupplyOf(action) || { family: null, own: [], store: null, onEmpty: 'store' };
  const fam = (itemRow(h, row.rune) || {}).family;
  const lv = h.skills ? skillLevel(h, row) : Infinity;
  let best = null; let locked = false;
  /* (the ticked runes are the family's own, lowest tier first: runeSupplyOf keeps no other) */
  for (const id of sup.own) {
    const tier = runeTierOf(itemRow(h, id));
    if (!tier) continue;
    const l = resolveLine(h.hs, id, null);
    if (!l.id || l.why) continue;
    if (lv < versionLevel(tier, abilitySkill(row))) { locked = true; continue; }
    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };
  }
  if (best) return best;
  if (sup.onEmpty === 'leave') return { why: locked ? 'level' : 'runes_out', short: false };
  const store = sup.store;
  const b = typeof store === 'string' ? basicOf(h.hs, store) : null;
  const named = b ? itemRow(h, b.partner) : null;
  const version = named && named.family === fam ? runeTierOf(named) : 0;
  if (version && lv < versionLevel(version, abilitySkill(row))) return { why: 'level', short: false };
  const s = version ? storeLine(h.hs, b.partner, store) : { why: 'none' };
  if (!s.id || s.why) return { why: locked ? 'level' : 'no_rune', short: s.why === 'gold_short' };
  return { line: s, version, pm: BASIC_PM };
}

/**
 * THE ITEM A SHOT ABILITY LOOSES (Andy 2026-10-23: Precision Shot and Flame Volley never fired for a
 * Ranger with no ammo worn, his arrows picked on the bar). The player picks every supply on the bar
 * (Tyler 2026-10-21), so a cast looses what the hero's basic attack would: the first ATTACK slot, in
 * bar order, whose conditions pass and that has a shot of an item the worn weapon can loose (own
 * first, then the store's partner: shotLine); the lane's default (d_attack) is the loaded ammo.
 * Null = no shot. Pure, and it reports no wait (pickSlot with no lane). The swing's own order and passes
 * (conditions.js attackOrder: carried stock first, the worn ammo ahead of the bar's other ammo, the store last).
 */
function castShotOf(inst, hero, h, atMs) {
  const rows = slotsFor(h, 'attack');
  const order = attackOrder(rows.length ? rows : [DEFAULT_ATTACK_ROW]);
  const act = (own) => (slot) => {
    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;
    if (!id || !shootsItem(hero.role, itemRow(h, id))) return null;
    const l = own ? ownShotLine(h, id) : shotLine(h, id);
    return l.id && !l.why ? { id } : null;
  };
  const got = pickSlot(inst, hero, h, order, act(true), null, undefined, atMs) || pickSlot(inst, hero, h, order, act(false), null, undefined, atMs);
  return got ? got.pick.id : null;
}

/* The supply lines one cast needs and the version it casts ({ lines, version, pm: the store's share
   in permille }), or the reason it cannot have them. `action` is the slot's (its rune supply: the ticked
   runes, the store rune, what to do when they run out). `ammo` is the item its shots are (castShotOf), or null: none. */
function suppliesFor(h, row, action, ammo) {
  const lines = [];
  let version = 1; let pm = 1000;
  if (row.rune) {
    const r = runeFor(h, row, action);
    if (r.why) return r;
    lines.push(r.line); version = r.version; pm = r.pm;
  }
  /* The free rung (ammoPerShot 0): a carried stack of it never depletes, so a cast needs no shot lines. */
  const freeShot = !!ammo && ammoPerShot(itemRow(h, ammo)) === 0 && int(h.hs.bag && h.hs.bag[ammo] && h.hs.bag[ammo].left) > 0;
  if (row.ammo > 0 && !freeShot) {
    if (!ammo) return { why: 'no_ammo' };
    /* Own shots first, the rest from the store shot behind the line (one resolver). */
    const line = h.hs.bag && h.hs.bag[ammo];
    const own = Math.min(row.ammo, Math.max(0, int(line && line.left)));
    for (let i = 0; i < own; i++) lines.push({ id: ammo, source: 'own', price: 0 });
    if (own < row.ammo) {
      /* (The store is asked only once the carried line is empty; a rune is never bought as a shot: shotLine.) */
      const shot = isRune(itemRow(h, ammo)) ? null : shopShotFor(h.hs, ammo);
      if (!shot) return { why: 'no_ammo' };
      for (let i = own; i < row.ammo; i++) lines.push({ id: shot.id, source: 'store', price: shot.price });
    }
  }
  /* The whole cast must be payable at once: no rune is spent on a cast whose shots the purse cannot buy. */
  const cost = lines.reduce((a, l) => a + l.price, 0);
  if (cost > 0 && !canAfford(h.hs, cost)) return { why: 'no_ammo', short: true };
  return { lines, version, pm };
}

/**
 * THE CLOCK A CAST OF `row` TAKES (abilities.js `replaces`, the whole-game audit's change 3: a new ability stands in for a strike,
 * never adds one): the first row it replaces whose cooldown is up at `atMs`, or null when none is (the row waits on `cooldown`).
 * Undefined for a row that replaces nothing. Its cast starts that row's cooldown as that row's own cast would (fire), so a bar
 * holding it casts no more of them than one without it. Pure.
 */
function clockOf(hero, row, atMs) {
  if (!row || !Array.isArray(row.replaces)) return undefined;
  return row.replaces.find((id) => !(readyAt(hero && hero.cds, id) > atMs)) || null;
}

/* (lane/signatures-batch-4) does hero `u`'s worn Signature pay its cast of `row` (its mana as written `mana`) with no mana at `atMs` */
const paysWithoutMana = (u, row, mana, atMs) => {
  if (typeof u.signature !== 'string') return false;
  const c = castCostOf(u, row, mana, atMs);
  return !!c && c.mana === 0;
};

/** Why `row` cannot fire for `hero` now, or null when it can (AB-01, 02, 11, 12). Pure. */
export function gateOf(hero, h, row, atMs) {
  if (!row || !row.active) return 'inactive';
  const skip = ACTION_SET_SKIPS[h.actionSet] || ACTION_SET_SKIPS.hunt;
  if ((skip.rune && row.rune) || (skip.area && AREA_TARGETS.includes(row.target))) return 'action_set';
  if (readyAt(hero.cds, row.id) > atMs || clockOf(hero, row, atMs) === null) return 'cooldown';
  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';
  /* (lane/signatures-batch-4) a cast its worn Signature pays another way waits on no mana (signature-costs.js castCostOf) */
  if (int(hero.mana) < row.mana && !paysWithoutMana(hero, row, row.mana, atMs)) return 'mana';
  return null;
}

/**
 * ALONE (Tyler 2026-11-09, src/data/abilities.js `alone`): no other living ally (sides.js: in a hunt, a hero) shares `world` with `hero`. Read at each
 * cast, as the kill XP reads the living heroes (xp-share.js): a death or a leave changes the next cast. Pure.
 */
export function aloneIn(world, hero) {
  return !!world && Array.isArray(world.units) && !world.units.some((o) => o !== hero && isAlly(hero, o) && o.alive === true);
}

/* The shell `row` lands from caster `u` at `pm` permille (abilities.js castAmount: a share of its own blow), 0 for a row that lays none. */
const landsShield = (u, row, pm, inst) => {
  const a = castAmount(row, unitOf(inst, u, row), u && u.maxHp, pm);
  if (!a || !a.shield) return 0;
  /* on the scale the shell's mean, no roll (src/core/hunt/amount.js healAmount) */
  return stepsOn(inst) ? healAmount(inst, u, a.shield, {}) : a.shield;
};

/**
 * ARCANE BARRIER'S REFUND (Tyler 2026-10-23, from Andy's reports: it stays self-only, and recasting it while its
 * shield still stands refunds the unused shield as mana). The shell left standing when a self-shield is recast comes
 * back as mana at THIS cast's price per point (mana / the shield it lands), never more than this cast's mana: a full
 * shell replaced by a stronger version costs nothing but its rune, a half-spent one half its mana. 0 with nothing
 * standing, and 0 for a shell another hero cast (`shieldBy`: a Mage recasting over a tank's Shelter or a Healer's
 * Ward would turn their rune into its own mana; the board's 2026-11-19 tank rune spells, section 6). Pure.
 */
export function shieldRefund(u, row, mana, pm, inst) {
  if (!u || u.shieldBy !== u.id) return 0;
  const standing = int(u && u.shield);
  const lands = row && row.target === 'self' && shells(row) ? landsShield(u, row, pm, inst) : 0;
  if (!(standing > 0) || !(lands > 0) || !(mana > 0)) return 0;
  return Math.min(mana, Math.floor((standing * mana) / lands));
}

/** A REFUNDING WARD'S REFUND (fx.refund, Lasting Ward; recastable): the shell this caster left on ally `t` comes back as mana at this
    cast's price per point, as shieldRefund's, never more than its mana. 0 for any other row, target or shell. Pure. */
export function wardRefund(u, row, mana, pm, inst, t) {
  if (!(row && row.fx && row.fx.refund === true) || row.target !== 'ally' || !t || t === u || t.shieldBy !== u.id) return 0;
  const standing = int(t.shield), lands = landsShield(u, row, pm, inst);
  if (!(standing > 0) || !(lands > 0) || !(mana > 0)) return 0;
  return Math.min(mana, Math.floor((mana * standing) / lands));
}

/* BETWEEN PULLS (Tyler 2026-10-23, COMBAT AUDIT ANSWERS: heals and shields fire between pulls when HP is missing;
   roadmap p16, audit c30): with no monster engaged, only the bar's slots that heal or shield a hero are walked, on
   their own conditions, lanes and cooldowns. Each still needs a wound (targetFor), so a hero at full health casts
   nothing and earns no Magic XP for it. */
const MEND_TARGETS = Object.freeze(['self', 'ally', 'party']);
const mends = (row) => !!row && MEND_TARGETS.includes(row.target);

/* ONE SLOT'S PICK for `hero` (firstUsable's test of a slot, and castNow's): `row` as the hero casts it, its gates, its target, its
   supplies, its version and mana. Answers { row, target, lines, version, mana, pm }, a wait ({ why }) or null (not tested). `react`, a
   reaction's cast (castNow): its lane is never waited on, and a FREE one ({ free: true }, Lifeline) costs no mana. */
function tryCast(inst, hero, h, row, slot, cx, sc, react) {
    const gate = gateOf(hero, h, row, sc.atMs);
    const lifted = gate === 'lane' ? !!react : gate === 'mana' ? !!(react && react.free) : false;
    if (!lifted && (gate === 'cooldown' || gate === 'mana')) return { why: gate };
    if (gate && !lifted) return null;
    /* AN ABILITY ITS HERO HAS NOT UNLOCKED (`unlock`, a level in the row's own skill): the slot is kept and waits
       (`level`, the wait a locked rune version gives), never refused. A hero whose entry carries no skills is not gated
       here (a bare fixture, a peer the browser draws: the server's commit is the truth), as runeFor. */
    if (row.unlock && h.skills && skillLevel(h, row) < row.unlock) return { why: 'level' };
    const t = targetFor(inst, hero, h, row, sc, cx);
    if (!t) return { why: cx && (cx.ally || cx.aim) ? 'out_of_range' : 'no_target', t: cx && cx.ally ? cx.ally.id : undefined };
    /* A slot whose supplies the purse cannot pay WAITS (gold_short) and the next slot is tried. It never
       ends the hunt from here: out of gold ends a hunt only for the action actually taken (Tyler 10-14),
       and a slot that cannot pay is never taken (fire() pays what this answered affordable). */
    const s = suppliesFor(h, row, slot.action, row.ammo > 0 ? castShotOf(inst, hero, h, sc.atMs) : null);
    /* OUT OF RUNES, AND THE SLOT SAYS LEAVE (Tyler 2026-11-08): its turn came with none of its ticked runes left, so the hunt
       ends `runes_out` at the hero's next boundary (action-rules.js END_ORDER; a flag of the span, as goldOut), naming the spell. */
    if (s.why === 'runes_out' && typeof h.hs.runesOut !== 'string') h.hs.runesOut = row.id;
    if (s.why) return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' };
    /* THE VERSION'S PRICE AND OUTPUT (abilities.js versionOf): its mana (never more with level), and its step, permille of the
       row's share of the caster's blow, at the rune's share (a store rune: the basic version). */
    const v = versionOf(row, s.version);
    /* (on the scale the version's mana is its share of the reference: amount.js manaOn) */
    const mana = react && react.free ? 0 : manaOn(inst, hero, v.mana);
    if (int(hero.mana) < mana && !paysWithoutMana(hero, row, mana, sc.atMs)) return { why: 'mana' };
    const pm = Math.floor((v.outPm * s.pm) / 1000);
    /* A self-shield recasts only to land MORE than its standing shell (a full shell waits; a stronger version, or a
       chipped shell, recasts and refunds the rest: shieldRefund). */
    if (row.target === 'self' && shells(row) && int(hero.shield) >= landsShield(hero, row, pm, inst)) return { why: 'no_target' };
    return { row, target: t, lines: s.lines, version: s.version, mana, pm, ...(react && react.free ? { free: true } : {}) };
}

/**
 * The first usable ability slot for `hero` (conditions.js pickSlot: slot order,
 * then the fallback): its lane, cooldown and mana open, its conditions passing,
 * a target, its supplies. Answers { row, target, lines, rule, mask } or null.
 * `only(row)`, when given, keeps only the slots whose ability it passes (between pulls: the mends).
 */
export function firstUsable(inst, hero, sc, only) {
  const h = hero && inst.heroes && inst.heroes[hero.id];
  if (!h || !h.hs) return null;
  /* THE ROWS AS THIS HERO CASTS THEM (src/core/hunt/talent-rows.js rowsFor: its Roads modifiers on cooldown, mana, output, tiles; the
     shared table itself for a hero with none). Every read below and the pick it answers (fire casts pick.row) go through this one name. */
  const ABILITIES = rowsFor(hero);
  /* Evaluated only while its LANE is free: a slot whose lane is shut is not even tested.
     One whose conditions pass but that waits on its cooldown, mana, stock or a target
     in reach is the lane's `rule_wait` (conditions.js noteWait). An ALONE row with another
     living hero in the world is not tested either (aloneIn): in a party it is as if absent. A PARTY row
     is its mirror: a hero alone in the world never tests it (the bar says "Party only"), and a row party only
     for some roles (Brand and Reave: the tank) a lone hero of those roles (partyOnly, the unit's own role). */
  const solo = aloneIn(inst.world, hero);
  /* (lane/signatures-batch-5) A GUARDING AIM (signature-casts.js guardOf, Ledgehide Breeches): the wind-up beside the wearer its move answers
     this sub-step, which the move's slot reads as "my target is winding up" (conditions.js); never written for a hero with no Signature */
  if (typeof hero.signature === 'string' || h.guard) h.guard = typeof hero.signature === 'string' ? guardOf(inst, hero, (m) => inReach(inst, hero, h.range, m)) : null;
  /* (an AURA move is never cast: it holds while slotted, src/core/hunt/auras.js) */
  const rows = slotsFor(h, 'ability').filter((r) => (!only || only(ABILITIES[r.slot.action.id]))
    && !(ABILITIES[r.slot.action.id] && ABILITIES[r.slot.action.id].target === 'aura')
    && gateOf(hero, h, ABILITIES[r.slot.action.id], sc.atMs) !== 'lane'
    && (!solo || !partyOnly(ABILITIES[r.slot.action.id], hero.role))
    && (solo || !(ABILITIES[r.slot.action.id] && ABILITIES[r.slot.action.id].alone)));
  const got = pickSlot(inst, hero, h, rows, (slot, cx) => tryCast(inst, hero, h, ABILITIES[slot.action.id], slot, cx, sc, null), sc, 'ability');
  return got ? Object.assign(got.pick, { rule: got.rule, mask: got.mask, label: got.label }) : null;
}

/**
 * A REACTION'S CAST (src/core/hunt/reactions.js: "casts when ...", Guarding Challenge, Ready Shelter, Lifeline): hero `u` casts `move`
 * (an ability id, or '*heal': its first heal on the bar that can take the target) NOW, out of turn, from the slot on its bar that holds
 * it: the slot's supplies and versions, the row's own cooldown and target rule, never its lane, and never the slot's conditions (the
 * moment is the condition). `o` = { target (the unit the moment names: an ally heal takes it, a self heal only the hero itself, a party
 * row only a target in its radius), free (no mana, no lane) }. A move not on the bar, cooling down or with no target casts nothing.
 * Answers whether it cast.
 */
export function castNow(inst, sc, u, move, o) {
  const h = u && u.alive === true && inst.heroes ? inst.heroes[u.id] : null;
  if (!h || !h.hs) return false;
  const R = rowsFor(u);
  const solo = aloneIn(inst.world, u);
  const t = o && o.target ? o.target : null;
  for (const r of slotsFor(h, 'ability')) {
    const row = R[r.slot.action.id];
    if (!row || row.target === 'aura' || !(move === '*heal' ? heals(row) : row.id === move)) continue;
    if (!castsNow(row, u.role, solo)) continue;
    if (t && row.target === 'self' && t !== u) continue;
    if (t && row.target === 'party' && !(t === u || dist2(t, u) <= row.radius * row.radius)) continue;
    const pick = tryCast(inst, u, h, row, r.slot, t && row.target === 'ally' ? { ally: t } : null, sc, { free: !!(o && o.free) });
    if (!pick || pick.why) continue;
    return fire(inst, u, pick, sc);
  }
  return false;
}

/* A heal of a cast lands through heal-rules.js landHeal (imported as healOne): capped at its missing HP (AB-09), its cut, the healing
   the target receives and the pieces of the row's `fx`. */
const roll = (sc, r) => sc.rng.int(r[0], r[1]);

/* A SPELL'S LEECH (abilities.js `leechPm`, Reave): leechPm permille of the HP one of its hits took comes back to the caster, cut on a
   Withered caster (heal-cut.js) and capped at its missing HP; a `heal` naming the spell when any landed. Not tempered: the blow it
   comes from already was. Draws nothing. A wiki formula: back = floor(hpTaken x leechPm / 1000). */
function leechBack(u, row, took, sc) {
  if (!(took > 0) || !u.alive) return;
  const got = Math.max(0, Math.min(healTaken(u, Math.floor((took * row.leechPm) / 1000)), int(u.maxHp) - int(u.hp)));
  if (!got) return;
  u.hp = int(u.hp) + got;
  sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: u.id, amount: got, ability: row.id }));
}

/* Apply a fired ability's effect (AB-08). `v` = { version, pm, back? }: the version cast (a status's rune tier,
   r03) and its output in permille of the row's share of the caster's blow (a version raises numbers only: never area,
   targets, duration or cooldown). At 1000 a hit lands exactly its share (no `mult` is passed). `back`, a row that gives
   mana back's: { hits, kills } counted here, the mana fire() returns (every other row passes none, so its hits count nothing). */
function effect(inst, u, row, t, sc, v) {
  const el = row.element || null;
  const pm = v && Number.isInteger(v.pm) && v.pm >= 0 ? v.pm : 1000;
  /* What a heal or a shell lands (abilities.js castAmount: a share of the caster's blow, Mend's of its max HP, at the cast's pm). */
  /* ON THE SCALE every number of the cast goes through the pipeline (src/core/hunt/amount.js): a hit's mean to landHit, a heal or a shell
     through healAmount (the caster's rating over its own Level, one roll), each at its share of the caster's top */
  const piped = stepsOn(inst), blow = unitOf(inst, u, row);
  /* `to`: the hero the next amount lands on (a worn Trait's per-target condition reads it, src/core/hunt/trait-rules.js); the cast's context
     carries the Traits that held on that amount (`tr`) to the heal event heal-rules.js landHeal writes next */
  let to = null;
  const amount = (o) => {
    const a = /** @type {{ hit?: number[], heal?: number, shield?: number }} */ (castAmount(row, blow, u.maxHp, pm) || {});
    /** @type {{ hp?: boolean, rng: any, to: any, traits?: string[] }} */
    const hc = { hp: !Number.isInteger(row.healPm) && Number.isInteger(row.healHpPm), rng: sc.rng, to: o || to };
    if (piped && a.heal) a.heal = healAmount(inst, u, a.heal, hc);
    /** @type {{ rng: any, to: any, traits?: string[] }} */
    const sh = { rng: sc.rng, to: hc.to };
    if (piped && a.shield) a.shield = healAmount(inst, u, a.shield, sh);
    if (hc.traits || cast.tr) cast.tr = hc.traits;
    return a;
  };
  /** @type {{ id: string, mult?: number, weakPm?: number, area?: number }} */
  const hitTag = pm === 1000 ? { id: row.id } : { id: row.id, mult: pm };
  /* A row that lands only part of a weakness's bonus (`weakPm`, the fist line's strikes) carries its share to hurt(). */
  if (Number.isInteger(row.weakPm)) hitTag.weakPm = row.weakPm;
  /* A Surge (fire, surged) shows on its numbers with the crit mark. */
  const sg = !!(v && v.surge);
  /* One hit's roll: the row's share of the hero's own largest blow, never under its beginner's floor (abilities.js hitRange); the
     version's pm rides the hit's tag. */
  const dmg = () => { const r = hitRange(blow, row); return piped ? (r[0] + r[1]) / 2 : roll(sc, r); };
  /* ONE HIT OF THIS CAST on `m`: the blow (damage.js landHit), then what the row returns from it: its leech (leechBack), and for a row
     that gives mana back, the hit and the kill it counts (`v.back`). A row with neither does exactly the blow. */
  const back = v && v.back ? v.back : null;
  /* (the cast's tally, fire's: kept only for a hero that reacts to its own cast, the HP its hits took and the monsters its status landed on) */
  const tally = v && v.tally ? v.tally : null;
  const strike = (m) => {
    const r = landHit(inst, sc, u, m, dmg(), el, hitTag, sg);
    if (row.leechPm) leechBack(u, row, r.dmg, sc);
    if (back) { if (r.dmg > 0) back.hits++; if (r.killed) back.kills++; }
    if (tally) tally.dmg += r.dmg;
  };
  /* The row's status on `m` after a hit (applyStatus refuses a look-alike) and its source: the unit, its own largest blow (a
     ticking status's tick is a share of it: statuses.js blowPm, the spell rule) and the version's rune tier. A marking status (Green
     Sickness) reads neither. */
  const afflict = (m) => {
    if (!row.status) return;
    const own = blow;
    const hit = Number.isInteger(own) && own > 0 ? own : 1;
    applyStatus(inst, m, statusRow(row.status), { u: u.id, maxHit: hit, runeTier: (v && v.version) || 1 }, sc);
    if (tally && holds(m, row.status)) tally.n.add(m.id);
    /* a Roads modifier's longer status (talent-rows.js moddedRow statusMs: Long Frost, Lingering Sickness) on the stack this cast laid */
    if (row.statusMs > 0) stretchStatus(m, row.status, u.id, row.statusMs);
    if (fx) tuneAfflict(inst, sc, u, m, row, fx, hit, (v && v.version) || 1);
  };
  /* THE ANSWERS TO A WIND-UP (src/data/abilities.js `interrupts`, `pushMs`; the hammer's Stagger, 23-spell-audit.md section 4), on a monster
     the cast reached that still stands, after its hit: its wind-up ends (monster-spells.js interrupt) and its next swing waits pushMs more
     (damage.js's clock, persisted), so an interrupted monster does not swing at once instead; never more than the bound a row may carry
     (ABILITY_RULES.pushMaxMs: a modded row's push is held to it too). Draws nothing. */
  /* (the wind-ups it ended, counted for a reaction's `interrupt` moment below, lane/signatures-batch-5: Stable Troll's Maul) */
  let ended = 0;
  const answer = (m) => {
    if (!m || m.alive !== true) return;
    const winding = !!m.cast;
    if (row.interrupts === true) interrupt(m, sc);
    if (winding && !m.cast) ended++;
    if (row.pushMs > 0) m.swingLeftMs = Math.max(0, int(m.swingLeftMs)) + Math.min(row.pushMs, ABILITY_RULES.pushMaxMs);
  };
  /* THE CAST'S CONTEXT for the pieces (heal-rules.js: its inst, the row's `fx`, the mana it cost, whether a target was near fall-back) */
  const fx = row.fx || null;
  const cast = (v && v.cast) || { inst, fx, spent: 0, near: false };
  /* (a hero that reacts to its own cast keeps the heals it lands, [hero, the heal's amount] in order: heal-rules.js landHeal writes them,
     a reaction's heal 'again' reads them, lane/signatures-batch-5: Brewer's Apron) */
  if (tally) cast.healed = tally.healed;
  switch (row.target) {
    case 'taunt': challengeFrom(inst, sc, u, row); break;
    case 'mark':
      /* The marked target takes bonusPct more damage from every blow until markUntil (damage.landHit). */
      t.markPm = row.bonusPct * 10; t.markUntil = sc.atMs + row.durMs;
      sc.emit(makeEvent('mark', sc.atMs, { u: u.id, t: t.id }));
      break;
    /* (one target that lands only its status, Parry: no blow, no kill, no weapon XP, as a status-only shape) */
    case 'enemy':
      for (let i = 0; i < (row.hits || 1); i++) {
        if (landsBlow(row)) strike(t);
        afflict(t);
      }
      answer(t);
      break;
    /* AN AREA: every engaged monster the row's shape covers (shapes.js, areaSpec: the 3x3 on its aim, a line from the hero
       through it, a ring round the hero), in id order, up to its maxHits. */
    case 'area': case 'line': case 'ring': {
      const s = place(areaSpec(row), u, t);
      const hit = engaged(inst, u).filter((o) => covers(s, o.x, o.y)).sort((a, b) => a.id - b.id).filter(onlyOne(inst, u, t, row, s));
      /* A shape that lands only its status (Frost Slam: landsBlow false) strikes no blow: no dmg event, no kill, no weapon XP. */
      const blows = landsBlow(row);
      const reached = Number.isInteger(row.maxHits) ? hit.slice(0, row.maxHits) : hit;
      /* how many it covers, on each of its blows (a worn Trait's enemies_in_aoe, src/core/hunt/trait-rules.js) */
      hitTag.area = reached.length;
      for (const m of reached) {
        if (!blows) { afflict(m); continue; }
        strike(m);
        afflict(m);
      }
      for (const m of reached) answer(m);
      /* A PATCH LEFT BEHIND (fx.ground, Cold Ground): a ground status held by the caster on the shape's middle (the hero's tile for a ring) */
      if (fx && fx.ground) applyStatus(inst, u, statusRow(fx.ground), { u: u.id, maxHit: 1, runeTier: 1, at: row.target === 'ring' ? [u.x, u.y] : [t.x, t.y] }, sc);
      break;
    }
    /* A SHIELD lands through the one shield rule (shields.js offerShield: one a hero, a bigger one replaces it); the bar's gates
       (firstUsable: a self shell recasts only to land more, an ally shield takes a hero holding none) mean every cast here is bigger. */
    case 'self':
      to = u;
      if (heals(row)) { healOne(u, u, amount().heal, sc, sg, row, piped, cast); break; }
      offerShield(sc, u, u, amount().shield);
      break;
    /* AN ALLY row lands on its target, and with more targets (fx.extra, Twin Ward) on the next the row's own rule takes; a shell with pieces
       through heal-rules.js landShell (its per-target output, a heal of it) */
    case 'ally':
      if (heals(row)) { for (const o of allyTargets(inst, u, row, t)) healOne(u, o, amount(o).heal, sc, sg, row, piped, cast); break; }
      if (fx) { for (const o of allyTargets(inst, u, row, t)) landShell(u, o, amount(o).shield, sc, row, cast); break; }
      to = t;
      offerShield(sc, u, t, amount().shield);
      break;
    /* A PARTY row: every living hero within its radius, the caster too, in id order (with fx.limit only that many, by its pick: Deep
       Shelter's two lowest). A heal lands its whole share on each (a Tempering rung's part of a point is its only draw); a shield (Shelter)
       draws nothing and lands max(standing, its shell), with a `shield` event only where the shell rose. */
    case 'party':
      for (const a of partyOf(inst, u, row)) {
        if (!(a === u || dist2(a, u) <= row.radius * row.radius)) continue;
        to = a;
        if (heals(row)) { healOne(u, a, amount().heal, sc, sg, row, piped, cast); continue; }
        if (fx) { landShell(u, a, amount().shield, sc, row, cast); continue; }
        offerShield(sc, u, a, amount().shield);
      }
      break;
    default: break;
  }
  /* THE WIND-UPS THIS CAST ENDED (a reaction's `interrupt`, react-queue.js; lane/signatures-batch-5, Stable Troll's Maul), `n` how many */
  if (ended > 0) queueOn(inst, u, 'interrupt', { t, ability: row.id, n: ended });
}

/* THE RUNE SAVE ON THIS CAST for a hero wearing a Signature with `saves` ({ family, every, of? }): { key, count, drop } (drop: this cast's
   rune line is left unpaid), or null (no such Signature, a cast of no rune of its family, or, with `of`, a cast of another move: lane/
   signatures-batch-5, #25 The Cold Candle's Frost Lance, so only that move's casts are counted). The count is the cast's place in its run
   of `every` */
function runeSaveOf(u, pick) {
  const s = Object.prototype.hasOwnProperty.call(SIGNATURES, u.signature) ? SIGNATURES[u.signature] : null;
  const rune = pick && pick.row && pick.row.rune ? ITEMS[pick.row.rune] : null;
  /* (a rune spell's first line is its rune, own or bought: suppliesFor) */
  if (!s || !s.saves || !rune || rune.family !== s.saves.family || !pick.lines.length || (s.saves.of && s.saves.of !== pick.row.id)) return null;
  const key = '~n:' + s.id, count = (readyAt(u.cds, key) + 1) % s.saves.every;
  return { key, count, drop: count === 0 };
}

/** Fire `pick` (from firstUsable): pay, set the clocks, apply. False when a supply could not be paid.
    A pick with no `mana` / `version` / `pm` (a caller handing the row itself) casts version I at the row's numbers. */
export function fire(inst, u, pick, sc) {
  const h = inst.heroes[u.id];
  /* A RUNE A WORN SIGNATURE SAVES (src/data/signatures.js `saves`, lane/signatures-batch-3; 15 #25 The Cold Candle): its rune line is
     left unpaid (nothing bought, nothing taken from the bag) on every `every`-th cast of a spell of its family, the count kept once the
     cast is paid. A hero with none pays as before */
  const save = typeof u.signature === 'string' ? runeSaveOf(u, pick) : null;
  if (save && save.drop) pick = Object.assign({}, pick, { lines: pick.lines.slice(1), saved: pick.lines[0].id });
  for (const l of pick.lines) if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
  if (save) u.cds = Object.assign({}, u.cds || {}, { [save.key]: save.count });
  const row = pick.row;
  const version = Number.isInteger(pick.version) ? pick.version : 1;
  /* A NEXT CAST RAISED (statuses.js castPm, Kindled: a Signature's boon) lands its share on this cast's output, as a version's step, and is
     spent on it; a hero that carries none casts at the pick's own output. A WORN SIGNATURE'S STANDING RAISE on its family's casts adds to it,
     never spent (signature-casts.js castRaiseOf, lane/signatures-batch-5: Thrower's Ring's Earth shells) */
  const raise = spendCastPm(u, row.id, sc) + (typeof u.signature === 'string' ? castRaiseOf(u, row) : 0);
  const pm = Math.floor(((Number.isInteger(pick.pm) ? pick.pm : 1000) * (1000 + raise)) / 1000);
  /* THE MANA THE CAST COSTS: its version's, less a self-shield's refund of the shell it replaces (shieldRefund). The
     cast event carries the NET (Magic XP is paid on the mana spent, xp-share.js magicXpFor: a refunded point pays none). */
  const written = Number.isInteger(pick.mana) ? pick.mana : manaOn(inst, u, row.mana);
  /* A CAST A WORN SIGNATURE PAYS ANOTHER WAY (signature-costs.js castCostOf, lane/signatures-batch-4: Ledger Ring, Lychgate Leggings, Pyre
     Priest's Hood): its mana, or none, or health for it, and the counts, window and clock it writes; a hero with none pays as written */
  const cost = typeof u.signature === 'string' ? castCostOf(u, row, written, sc.atMs) : null;
  const paid = cost ? cost.mana : written;
  /* MAGIC XP ON THE WRITTEN MANA (lane/signatures-batch-5; 15 "Batch 4's calls", HANDOFFS 2026-11-28 designer-sig-batch5 item 1): a
     Signature changes what a cast costs, never what it trains. A cast paid another way trains what the same cast trains with no Signature:
     its written mana less the cast's own refunds of it (a shell's, a ward's, read before the cast lands as theirs are; a Storm spell's mana
     back, read after). `plain` is what the plain cast spends; undefined when the cast paid as written (the event's `mana` is the basis) */
  const plain = paid !== written ? written - shieldRefund(u, row, written, pm, inst) - wardRefund(u, row, written, pm, inst, pick.target) : undefined;
  if (cost) {
    if (cost.hp > 0) u.hp = int(u.hp) - cost.hp;
    u.cds = Object.assign({}, u.cds || {}, cost.writes);
  }
  const refund = shieldRefund(u, row, paid, pm, inst);
  /* (a refunding ward recast on an ally holding this caster's own shell, Lasting Ward: the same refund, wardRefund) */
  const wardBack = wardRefund(u, row, paid, pm, inst, pick.target);
  const spent = paid - refund - wardBack;
  u.mana = int(u.mana) - spent;
  /* A ROW THAT STANDS IN FOR A STRIKE (`replaces`, clockOf) starts that strike's cooldown too, as its own cast would: the cast replaces
     one. The cast event names it (`took`), the clock the bar cools beside its own. */
  const took = clockOf(u, row, sc.atMs);
  u.cds = Object.assign({}, u.cds || {}, { [row.id]: sc.atMs + row.cdMs }, took ? { [took]: sc.atMs + ABILITIES[took].cdMs } : {});
  /* (a FREE cast, a reaction's: Lifeline, takes no lane: the bar's next cast waits for nothing) */
  if (!pick.free) u.lanes = Object.assign({}, u.lanes || {}, { [row.lane]: sc.atMs + ABILITY_LANES[row.lane] });
  /* STILL MIND (a unit rule stillMs, regenMana): the time of the hero's last cast, kept with its cooldowns (persisted) */
  if (u.stillMs > 0) u.cds['~cast'] = sc.atMs;
  /* THE LAST MOVE (condition-metrics.js last_move: a rotation, "after Stagger"): the row cast last on its lane and on any lane,
     persisted with the world so a settle cut between two casts reads the same. */
  u.lastMove = Object.assign({}, u.lastMove && typeof u.lastMove === 'object' ? u.lastMove : {}, { [row.lane]: row.id, any: row.id });
  /* The tally's supply split (§3.8): any store line makes the cast 'store'; `gold` is what it cost. A rune
     spell names the rune it spent (`supply`, the analyzer's supply count), the version it cast and its power
     (permille of the row's numbers: a store rune's basic version is under 1000). */
  const gold = pick.lines.reduce((a, l) => a + l.price, 0);
  const source = pick.lines.some((l) => l.source === 'store') ? 'store' : 'own';
  const rune = row.rune && pick.lines.length ? pick.lines[0].id : null;
  /** @type {{ version: any, pm: number, surge?: boolean, cast?: any, tally?: any }} */
  const v = surged(u, row, sc) ? { version, pm: Math.floor((pm * SURGE_MULT_PM) / 1000), surge: true } : { version, pm };
  /* THE PIECES' CONTEXT (heal-rules.js), for a row that carries any */
  const cast = row.fx ? { inst, fx: row.fx, spent, near: false } : null;
  if (cast) v.cast = cast;
  /* THE CAST'S OWN MOMENT (a reaction's `cast`, react-queue.js: Ossuary Helm, Floodwater Hatchets): what it landed, tallied only for a
     hero that reacts to one */
  const tally = reactsOn(u, 'cast') ? { n: new Set(), dmg: 0, healed: [] } : null;
  if (tally) v.tally = tally;
  /* A CAST THAT GIVES MANA BACK (abilities.js manaPerHit / manaPerKill, the Storm spells): its effect runs first with its events held,
     so the cast event, written once, carries the mana the cast KEPT (`back` came back: Magic XP is paid on the rest, as on a shell's
     refund), and the held events follow it in the order they happened, the order every other cast's take. Every other row: the cast,
     then its effect, as always. */
  const held = row.manaPerHit || row.manaPerKill ? [] : null;
  let back = 0, xpMana = plain;
  if (held) {
    const count = { hits: 0, kills: 0 };
    const emit = sc.emit;
    sc.emit = (ev) => { held.push(ev); };
    try { effect(inst, u, row, pick.target, sc, Object.assign({}, v, { back: count })); } finally { sc.emit = emit; }
    back = manaBack(u, row, count, spent);
    /* (the plain cast's mana back: manaBack's want on what it spent, which its own room always holds, having spent it first) */
    if (plain !== undefined) xpMana = plain - Math.min(plain, count.hits * (row.manaPerHit || 0) + count.kills * (row.manaPerKill || 0));
  }
  const mana = spent - back;
  sc.emit(makeEvent('cast', sc.atMs, { u: u.id, ability: row.id, t: pick.target.id, mana, magicXpMult: row.magicXpMult, source, gold,
    ...(rune ? { supply: rune, version, power: pm } : pick.saved ? { saved: pick.saved, version, power: pm } : {}),
    ...(refund + wardBack > 0 ? { refund: refund + wardBack } : {}),
    ...(cost && cost.hp > 0 ? { paidHp: cost.hp } : {}),
    /* (the Magic XP basis apart from the mana spent, when a worn Signature changed what the cast paid: hunt-rewards.js reads it) */
    ...(xpMana !== undefined ? { xpMana } : {}),
    ...(back > 0 ? { back } : {}),
    ...(took ? { took } : {}),
    ...(typeof pick.rule === 'string' ? { rule: pick.rule, rule_label: pick.label, pass: pick.mask } : {}) }));
  if (held) for (const ev of held) sc.emit(ev);
  else effect(inst, u, row, pick.target, sc, v);
  castReturns(u, row, cast);
  if (tally) queueOn(inst, u, 'cast', { t: pick.target, ability: row.id, n: tally.n.size, dmg: tally.dmg, healed: tally.healed });
  return true;
}

/* THE MANA A CAST GIVES BACK (abilities.js manaPerHit, manaPerKill): manaPerHit for each monster one of its hits landed on and
   manaPerKill for each it killed, never more in all than the cast cost (`spent`: a spell is never a mana engine) and never past the
   caster's max mana. Answers what came back. A wiki formula: back = min(spent, hits x manaPerHit + kills x manaPerKill, maxMana - mana). */
function manaBack(u, row, count, spent) {
  const want = Math.min(spent, count.hits * (row.manaPerHit || 0) + count.kills * (row.manaPerKill || 0));
  const got = Math.max(0, Math.min(want, int(u.maxMana) - int(u.mana)));
  u.mana = int(u.mana) + got;
  return got;
}

/* SURGE (src/data/jewelry.js): `surgePm` permille of a hero's casts that land numbers (a hit, a heal, a shield) land them
   SURGE_MULT_PM as hard, shown with the crit mark. One draw a cast, made only by a hero that wears the perk and only for a
   row with numbers (a taunt or a mark draws nothing), so every other cast draws what it drew before. */
function surged(u, row, sc) {
  return u.surgePm > 0 && (landsBlow(row) || heals(row) || shells(row)) && sc.rng.chance(u.surgePm / 1000);
}

/** Mana regenerates ABILITY_RULES.manaRegenPctPerMin of max a minute, in milli-mana (AB-13), times
    the hero's Inner Flame regen rate (`regenPm`, permille: src/core/vitals.js regenPermille; 1000 unset). */
function regenMana(u, dtMs, atMs, inst) {
  if (!(int(u.maxMana) > 0)) return;
  let pm = int(u.regenPm) > 0 ? int(u.regenPm) : 1000;
  /* STILL MIND (a unit rule: stillMs without a cast, stillRegenPm more): the last cast's time is fire's '~cast' */
  if (u.stillMs > 0 && u.stillRegenPm > 0 && atMs - readyAt(u.cds, '~cast') >= u.stillMs) pm = Math.floor((pm * (1000 + u.stillRegenPm)) / 1000);
  /* (lane/signatures-batch-4) A WORN SIGNATURE'S AURA (signature-auras.js, Sergeant's Sash): the party's within its reach regenerate more */
  const aura = auraPm(inst, u, 'regenPm');
  if (aura) pm = Math.floor((pm * (1000 + aura)) / 1000);
  u.manaMilli = int(u.manaMilli) + Math.floor((int(u.maxMana) * ABILITY_RULES.manaRegenPctPerMin * 10 * pm * dtMs) / 60000000);
  const whole = Math.floor(u.manaMilli / 1000);
  u.manaMilli -= whole * 1000;
  u.mana = Math.min(int(u.maxMana), int(u.mana) + whole);
}

/**
 * THE LINE ONE BASIC SHOT OF `id` COMES FROM (the one resolver, action-rules.js
 * resolveLine): the carried line first, then an ARROW's plain store partner. A
 * RUNE is never a shot (Tyler 2026-10-23: runes fuel spells only), neither its
 * carried line nor the store's: a store rune is bought only when a spell's slot
 * names it (conditions.js storeFits), and a staff's basic once bought the Plain
 * Fire Rune unseen, 8 g a shot. `h` is the hero's injected entry (its session and
 * catalogue).
 */
export function shotLine(h, id) {
  return isRune(itemRow(h, id)) ? { why: 'none' } : shotLocked(h, id) ? { why: 'level' } : resolveLine(h && h.hs, id, undefined);
}
/** shotLine's carried half: own stock only, never the store (a shot's first pass, conditions.js attackOrder). */
export function ownShotLine(h, id) {
  return isRune(itemRow(h, id)) ? { why: 'none' } : shotLocked(h, id) ? { why: 'level' } : resolveLine(h && h.hs, id, null);
}
/* A SHOT THE HERO CAN'T USE YET (supplies keep their skill requirement, Tyler 2026-10-24: the ammo slot's equip gate held it and a bar slot walked round it, a Ranged 42 hero
   on Mithril Arrows, Ranged 45). Neither shot nor bought, and the next row fires. The slot is kept, never refused (designer 2026-11-03): a bar set up ahead wakes at the level
   with nothing to press again, and the bar says why (action-facts.js reasonOf). A hero whose entry carries no skills is not gated here (a bare fixture, a peer the browser draws), as runeFor. */
function shotLocked(h, id) {
  const it = itemRow(h, id);
  return !!(h && h.skills && it && it.reqSkill && it.reqLv > 1) && levelOf(h.skills, it.reqSkill) < it.reqLv;
}

/**
 * The basic attack's cost (AB-12), for damage.js (H2) to ask before a basic
 * swing: a caster's basic spends `mana` (hunt-roles.js `basic`), a bow or crossbow
 * basic one shot of the loaded ammo (own first, then the store: shotLine). Answers
 * false when it may not swing, else true, or the supply line the shot spent ({ id,
 * source, price }: a `store` line is the partner's basic version, damage.js blow).
 */
export function payBasic(inst, hero, cost, sc) {
  const c = cost || {};
  if (int(c.mana) > 0) {
    if (int(hero.mana) < c.mana) return false;
    hero.mana -= c.mana;
  }
  if (c.ammo) {
    const h = inst.heroes && inst.heroes[hero.id];
    /* `ammo`: true = the loaded ammo; an id = the attack item a slot chose (one unit a shot). */
    const id = typeof c.ammo === 'string' ? c.ammo : (h && h.ammo);
    const l = h && id ? shotLine(h, id) : { why: 'none' };
    /* OUT OF GOLD FOR A BASIC SUPPLY ENDS THE HUNT (Tyler 10-14): the shot the hero takes cannot be paid. */
    if (!l.id || l.why) { if (l.why === 'gold_short') h.hs.goldOut = true; return false; }
    /* THE FREE RUNG (src/core/ammo.js ammoPerShot 0, the tier-1 rung of every
       ladder): a loaded stack of it looses its shot and never depletes. */
    if (l.source === 'own' && ammoPerShot(itemRow(h, l.id)) === 0) return l;
    /* A SAVED SHOT (src/core/hunt/signature-costs.js, lane/signatures-batch-4: Brood Bracers' credit, `free`): the line is the shot's, so it
       is priced as it would be, but no arrow is taken from the bag and none bought (nothing minted, nothing refunded) */
    if (c.free === true) return Object.assign({}, l, { saved: true });
    if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
    return l;
  }
  return true;
}

/* THE CAST ORDER: the lap's holding tank first (targeting.js holderTank), then every other unit by id. The
   Challenge fires through this one path (roadmap p12, audit c18: its lane, its cooldown and its slot's conditions
   apply like any ability's); the holder going first keeps an overflow monster on the holder when both tanks'
   Challenges are ready (a non-holder takes only what is on a non-tank, challengeable). Only a living hero casts
   (castAbilities skips every other unit, and nothing a cast does brings one back), so the order is the living heroes
   by id (unit-index.js), never a sort of the whole list a sub-step; the holder is one of them (a living tank). */
function castOrder(inst) {
  const heroes = heroesByIdOf(inst);
  const k = holderTank(inst);
  return k ? [k, ...heroes.filter((u) => u !== k)] : heroes;
}

/** Attack hook: each hero fires its first usable ability; between pulls, its first usable heal or shield (`mends`). */
export function castAbilities(inst, sc) {
  for (const u of castOrder(inst)) {
    if (!isHero(u) || !u.alive) continue;
    regenMana(u, sc.dtMs, sc.atMs, inst);
    const pick = firstUsable(inst, u, sc, engaged(inst, u).length ? null : mends);
    if (pick) fire(inst, u, pick, sc);
  }
}
