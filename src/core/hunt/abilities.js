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
//   RUNE is bought only when the slot names the store rune, `action.store`, so
//   a default bar never buys one unseen — designer 2026-10-21; a basic shot
//   never buys one, shotLine),
//   and its target rule finds a target (AB-03). A slot the purse cannot pay
//   waits and the next one is tried; it never ends the hunt by itself.
// Firing spends the mana, the rune and the shots, sets the cooldown and the
// lane (AB-07), and applies the effect (AB-08): taunt, mark, hit (with a status
// per hit, H3), area, cleave, shield, ally heal, party heal.
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
// XP: a status's scalesWith level; a peer in the browser has none, so its bleed reads
// level 1 and the next commit reconciles it) }. A hero with no
// entry fires nothing. Draws: the swing's stream `sc.rng`, heroes in id order,
// one `int` per hit roll (spec §1.1 #3).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES, ABILITY_LANES, ABILITY_RULES, ACTION_SET_SKIPS, abilitySkill, versionOf, outputPm } from '../../data/abilities.js?v=0.2.39';
import { resolveLine, storeLine, takeLine, canAfford, shopShotFor } from '../action-rules.js?v=0.2.39';
import { runeTierOf, versionLevel } from '../../data/runes.js?v=0.2.39';
import { BASIC_EFFECT_SHARE } from '../../data/supply-basics.js?v=0.2.39';
import { cheb, dist2, los } from './grid.js?v=0.2.39';
import { makeEvent } from './events.js?v=0.2.39';
import { landHit } from './damage.js?v=0.2.39';
import { challengeable, challengeFrom, holderTank } from './targeting.js?v=0.2.39';
import { applyStatus, statusRow } from './status.js?v=0.2.39';
import { levelOf } from '../xp.js?v=0.2.39';
import { ammoPerShot } from '../ammo.js?v=0.2.39';
import { ITEMS } from '../../data/items.js?v=0.2.39';
import { isRune } from '../../data/supplies.js?v=0.2.39';
import { slotsFor, pickSlot, bestAim, itemRow, ignores, DEFAULT_ATTACK_ROW, attackOrder } from './conditions.js?v=0.2.39';
import { shootsItem } from '../../data/hunt-roles.js?v=0.2.39';

export const PERSISTED = Object.freeze({
  unit: Object.freeze([['mana', 'int'], ['maxMana', 'int'], ['manaMilli', 'int'], ['regenPm', 'int'], ['lanes', 'json'], ['cds', 'json'],
    ['shield', 'int'], ['markPm', 'int'], ['markUntil', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const readyAt = (o, k) => (o && typeof o === 'object' && Number.isInteger(o[k]) ? o[k] : 0);
const living = (inst, side) => inst.world.units.filter((u) => u.side === side && u.alive);
/* A monster is in the fight once it holds a target. */
const engaged = (inst) => living(inst, 'mon').filter((m) => m.target !== null && m.target !== undefined);

/** In reach: Melee (range 1) is adjacent; ranged is within `range` tiles with line of sight. */
export function inReach(inst, hero, range, t) {
  const r = Math.max(1, int(range) || 1);
  if (r <= 1) return cheb(hero, t) <= 1;
  return dist2(hero, t) <= r * r && los(inst.grid, hero, t);
}

/* Order candidates: the hero's own target first, then nearest, then id. */
const byPreference = (hero) => (a, b) => ((b.id === hero.target) - (a.id === hero.target))
  || (dist2(a, hero) - dist2(b, hero)) || (a.id - b.id);

/* The target an ability would take now, or null (AB-03). Pure. Its trigger is the
   slot's own conditions (a slot with none fires whenever it is ready: conditions.js),
   so here a self-shield only needs a wound, an ally heal the ally its conditions
   named (else the lowest wounded one in reach) and an area its best aim. A monster
   the slot IGNORES is never its target or aim. */
function targetFor(inst, hero, h, row, sc, cx) {
  const mons = engaged(inst);
  const near = mons.filter((m) => inReach(inst, hero, h.range, m) && !ignores(cx && cx.slot, m)).sort(byPreference(hero));
  const pct = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 100) / int(u.maxHp) : 100);
  switch (row.target) {
    /* The Challenge (targeting.js challengeable): a target only while a monster in its reach is off the tank. */
    case 'taunt': return challengeable(inst, hero).length ? hero : null;
    case 'mark': {
      const t = near.slice().sort((a, b) => (int(b.hp) - int(a.hp)) || (a.id - b.id))[0];
      return t && !(t.markUntil > sc.atMs) ? t : null;
    }
    case 'enemy': case 'cleave': return near[0] || null;
    case 'area': {
      if (cx && cx.aim && cx.aim.alive) return cx.aim;
      const b = bestAim(inst, hero, h.range, 3, cx && cx.slot);
      return b && b.count >= 1 ? b.aim : null;
    }
    /* A self-heal (Mend) and a self-shield (Arcane Barrier) need missing HP; a self-shield's standing shell must
       also be under the one this cast lands (firstUsable: it needs the version's numbers), and a recast refunds
       what is left of it (shieldRefund). */
    case 'self': return pct(hero) < 100 ? hero : null;
    case 'ally': {
      /* An ally heal takes a wounded ally; an ally SHIELD (Protective Ward) a wounded one holding no shield. */
      const ok = (a) => !!a && a.alive && a.side === 'hero' && pct(a) < 100 && (row.heal || !(int(a.shield) > 0))
        && (a === hero || inReach(inst, hero, h.range, a));
      if (cx && cx.ally) return ok(cx.ally) ? cx.ally : null;
      return living(inst, 'hero').filter(ok).sort((a, b) => (pct(a) - pct(b)) || (a.id - b.id))[0] || null;
    }
    case 'party': return living(inst, 'hero').some((a) => pct(a) < 100) ? hero : null;
    default: return null;
  }
}

/* THE STORE'S SHARE (supply-basics.js BASIC_EFFECT_SHARE, r07): a store rune is the basic version. */
const BASIC_PM = Math.round(BASIC_EFFECT_SHARE * 1000);

/* The hero's level in the skill `row`'s numbers grow with (abilitySkill: Magic, or the weapon's own skill); 1 for
   a hero whose entry carries no skills (a bare fixture, a peer the browser draws: the server's commit is the truth). */
const skillLevel = (h, row) => (h && h.skills ? levelOf(h.skills, abilitySkill(row)) : 1);

/* THE RUNE A SPELL SPENDS AND THE VERSION IT CASTS (Tyler 2026-10-23, src/data/runes.js). A spell spends a
   rune of its FAMILY (the family of its row's `rune`, the family's Chalked rune): of the runes of that family
   the hero carries, the highest tier whose version its level in the row's skill has unlocked, cast at that
   tier's version (a tie in tier goes to the lower item id). Until a slot names the rune it spends (the rune
   quality picker, interface lane p40), a hero casts the best version its own bag and level allow. Else, only
   when the slot names it (`store`), the store's rune, bought per use: the BASIC version, version I at the
   store's share. A carried rune whose version is still locked is never spent (`level`). A hero whose entry
   carries no skills is not gated here. */
function runeFor(h, row, store) {
  const fam = (itemRow(h, row.rune) || {}).family;
  const lv = h.skills ? skillLevel(h, row) : Infinity;
  let best = null; let locked = false;
  for (const id of Object.keys((h.hs && h.hs.bag) || {}).sort()) {
    const it = itemRow(h, id);
    const tier = runeTierOf(it);
    if (!tier || it.family !== fam) continue;
    const l = resolveLine(h.hs, id, null);
    if (!l.id || l.why) continue;
    if (lv < versionLevel(tier)) { locked = true; continue; }
    if (!best || tier > best.version) best = { line: l, version: tier, pm: 1000 };
  }
  if (best) return best;
  const s = typeof store === 'string' ? storeLine(h.hs, row.rune, store) : { why: 'none' };
  if (!s.id || s.why) return { why: locked ? 'level' : 'no_rune', short: s.why === 'gold_short' };
  return { line: s, version: 1, pm: BASIC_PM };
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
function castShotOf(inst, hero, h) {
  const rows = slotsFor(h, 'attack');
  const order = attackOrder(rows.length ? rows : [DEFAULT_ATTACK_ROW]);
  const act = (own) => (slot) => {
    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;
    if (!id || !shootsItem(hero.role, itemRow(h, id))) return null;
    const l = own ? ownShotLine(h, id) : shotLine(h, id);
    return l.id && !l.why ? { id } : null;
  };
  const got = pickSlot(inst, hero, h, order, act(true)) || pickSlot(inst, hero, h, order, act(false));
  return got ? got.pick.id : null;
}

/* The supply lines one cast needs and the version it casts ({ lines, version, pm: the store's share
   in permille }), or the reason it cannot have them. `store` is the slot's chosen store rune
   (action.store), or none: own runes only. `ammo` is the item its shots are (castShotOf), or null: none. */
function suppliesFor(h, row, store, ammo) {
  const lines = [];
  let version = 1; let pm = 1000;
  if (row.rune) {
    const r = runeFor(h, row, store);
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

/** Why `row` cannot fire for `hero` now, or null when it can (AB-01, 02, 11, 12). Pure. */
export function gateOf(hero, h, row, atMs) {
  if (!row || !row.active) return 'inactive';
  const skip = ACTION_SET_SKIPS[h.actionSet] || ACTION_SET_SKIPS.hunt;
  if ((skip.rune && row.rune) || (skip.area && row.target === 'area')) return 'action_set';
  if (readyAt(hero.cds, row.id) > atMs) return 'cooldown';
  if (readyAt(hero.lanes, row.lane) > atMs) return 'lane';
  if (int(hero.mana) < row.mana) return 'mana';
  return null;
}

/* The shield a self-shield lands at `pm` permille of its row's (effect's `scaled`). */
const landsShield = (row, pm) => (pm === 1000 ? row.shield : Math.floor((row.shield * pm) / 1000));

/**
 * ARCANE BARRIER'S REFUND (Tyler 2026-10-23, from Andy's reports: it stays self-only, and recasting it while its
 * shield still stands refunds the unused shield as mana). The shell left standing when a self-shield is recast comes
 * back as mana at THIS cast's price per point (mana / the shield it lands), never more than this cast's mana: a full
 * shell replaced by a stronger version costs nothing but its rune, a half-spent one half its mana. 0 with nothing
 * standing. Pure.
 */
export function shieldRefund(u, row, mana, pm) {
  const standing = int(u && u.shield);
  const lands = row && row.target === 'self' && Number.isInteger(row.shield) ? landsShield(row, pm) : 0;
  if (!(standing > 0) || !(lands > 0) || !(mana > 0)) return 0;
  return Math.min(mana, Math.floor((standing * mana) / lands));
}

/* BETWEEN PULLS (Tyler 2026-10-23, COMBAT AUDIT ANSWERS: heals and shields fire between pulls when HP is missing;
   roadmap p16, audit c30): with no monster engaged, only the bar's slots that heal or shield a hero are walked, on
   their own conditions, lanes and cooldowns. Each still needs a wound (targetFor), so a hero at full health casts
   nothing and earns no Magic XP for it. */
const MEND_TARGETS = Object.freeze(['self', 'ally', 'party']);
const mends = (row) => !!row && MEND_TARGETS.includes(row.target);

/**
 * The first usable ability slot for `hero` (conditions.js pickSlot: slot order,
 * then the fallback): its lane, cooldown and mana open, its conditions passing,
 * a target, its supplies. Answers { row, target, lines, rule, mask } or null.
 * `only(row)`, when given, keeps only the slots whose ability it passes (between pulls: the mends).
 */
export function firstUsable(inst, hero, sc, only) {
  const h = hero && inst.heroes && inst.heroes[hero.id];
  if (!h || !h.hs) return null;
  /* Evaluated only while its LANE is free: a slot whose lane is shut is not even tested.
     One whose conditions pass but that waits on its cooldown, mana, stock or a target
     in reach is the lane's `rule_wait` (conditions.js noteWait). */
  const rows = slotsFor(h, 'ability').filter((r) => (!only || only(ABILITIES[r.slot.action.id]))
    && gateOf(hero, h, ABILITIES[r.slot.action.id], sc.atMs) !== 'lane');
  const got = pickSlot(inst, hero, h, rows, (slot, cx) => {
    const row = ABILITIES[slot.action.id];
    const gate = gateOf(hero, h, row, sc.atMs);
    if (gate === 'cooldown' || gate === 'mana') return { why: gate };
    if (gate) return null;
    const t = targetFor(inst, hero, h, row, sc, cx);
    if (!t) return { why: cx && (cx.ally || cx.aim) ? 'out_of_range' : 'no_target', t: cx && cx.ally ? cx.ally.id : undefined };
    /* A slot whose supplies the purse cannot pay WAITS (gold_short) and the next slot is tried. It never
       ends the hunt from here: out of gold ends a hunt only for the action actually taken (Tyler 10-14),
       and a slot that cannot pay is never taken (fire() pays what this answered affordable). */
    const s = suppliesFor(h, row, slot.action.store, row.ammo > 0 ? castShotOf(inst, hero, h) : null);
    if (s.why) return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' };
    /* THE VERSION'S PRICE AND OUTPUT (abilities.js versionOf, outputPm): its mana (never more with level), and
       its permille of the row's numbers at the hero's level in the row's skill, at the rune's share (a store
       rune: the basic version). */
    const v = versionOf(row, s.version);
    if (int(hero.mana) < v.mana) return { why: 'mana' };
    const pm = Math.floor((outputPm(row, s.version, skillLevel(h, row)) * s.pm) / 1000);
    /* A self-shield recasts only to land MORE than its standing shell (a full shell waits; a stronger version, or a
       chipped shell, recasts and refunds the rest: shieldRefund). */
    if (row.target === 'self' && row.shield && int(hero.shield) >= landsShield(row, pm)) return { why: 'no_target' };
    return { row, target: t, lines: s.lines, version: s.version, mana: v.mana, pm };
  }, sc, 'ability');
  return got ? Object.assign(got.pick, { rule: got.rule, mask: got.mask, label: got.label }) : null;
}

/* Heal `t` by up to `n`, capped at its missing HP (AB-09). */
function healOne(u, t, n, sc) {
  const got = Math.max(0, Math.min(n, int(t.maxHp) - int(t.hp)));
  t.hp = int(t.hp) + got;
  sc.emit(makeEvent('heal', sc.atMs, { u: u.id, t: t.id, amount: got }));
}
const roll = (sc, r) => sc.rng.int(r[0], r[1]);

/* Apply a fired ability's effect (AB-08). `v` = { version, pm }: the version cast (a status's rune tier,
   r03) and its output in permille of the row's numbers (a version raises numbers only: never area,
   targets, duration or cooldown). At 1000 a hit lands exactly as the row's (no `mult` is passed). */
function effect(inst, u, row, t, sc, v) {
  const el = row.element || null;
  const pm = v && Number.isInteger(v.pm) && v.pm >= 0 ? v.pm : 1000;
  const scaled = (n) => (pm === 1000 ? n : Math.floor((n * pm) / 1000));
  const hitTag = pm === 1000 ? { id: row.id } : { id: row.id, mult: pm };
  /* The row's status on `m` after a hit (applyStatus refuses a look-alike) and its source: the unit, the caster's
     level in the row's scalesWith skill (Tyler 10-16: bleed scales slowly with Melee) and the version's rune tier.
     A marking status (Green Sickness) reads neither. */
  const afflict = (m) => {
    if (!row.status) return;
    const srow = statusRow(row.status), h = inst.heroes && inst.heroes[u.id];
    applyStatus(inst, m, srow, { u: u.id, skillLv: h && h.skills && srow.scalesWith ? levelOf(h.skills, srow.scalesWith) : 0, runeTier: (v && v.version) || 1 }, sc);
  };
  switch (row.target) {
    case 'taunt': challengeFrom(inst, sc, u); break;
    case 'mark':
      /* The marked target takes bonusPct more damage from every blow until markUntil (damage.landHit). */
      t.markPm = row.bonusPct * 10; t.markUntil = sc.atMs + row.durMs;
      sc.emit(makeEvent('mark', sc.atMs, { u: u.id, t: t.id }));
      break;
    case 'enemy':
      for (let i = 0; i < (row.hits || 1); i++) {
        landHit(inst, sc, u, t, roll(sc, row.dmg), el, hitTag);
        afflict(t);
      }
      break;
    case 'area':
      for (const m of engaged(inst).filter((o) => cheb(o, t) <= 1).sort((a, b) => a.id - b.id)) {
        landHit(inst, sc, u, m, roll(sc, row.dmg), el, hitTag);
        afflict(m);
      }
      break;
    case 'cleave': {
      const hits = [t, ...engaged(inst).filter((m) => m !== t && cheb(m, u) <= 1).sort((a, b) => a.id - b.id)].slice(0, row.maxHits);
      for (const m of hits) landHit(inst, sc, u, m, roll(sc, row.dmg), el, hitTag);
      break;
    }
    case 'self':
      if (row.heal) { healOne(u, u, scaled(roll(sc, row.heal)), sc); break; }
      u.shield = scaled(row.shield);
      sc.emit(makeEvent('shield', sc.atMs, { u: u.id, t: u.id, amount: u.shield }));
      break;
    case 'ally':
      if (row.heal) { healOne(u, t, scaled(roll(sc, row.heal)), sc); break; }
      t.shield = scaled(row.shield);
      sc.emit(makeEvent('shield', sc.atMs, { u: u.id, t: t.id, amount: t.shield }));
      break;
    case 'party':
      for (const a of living(inst, 'hero').sort((x, y) => x.id - y.id)) {
        if (a === u || dist2(a, u) <= row.radius * row.radius) healOne(u, a, scaled(roll(sc, row.heal)), sc);
      }
      break;
    default: break;
  }
}

/** Fire `pick` (from firstUsable): pay, set the clocks, apply. False when a supply could not be paid.
    A pick with no `mana` / `version` / `pm` (a caller handing the row itself) casts version I at the row's numbers. */
export function fire(inst, u, pick, sc) {
  const h = inst.heroes[u.id];
  for (const l of pick.lines) if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
  const row = pick.row;
  const version = Number.isInteger(pick.version) ? pick.version : 1;
  const pm = Number.isInteger(pick.pm) ? pick.pm : 1000;
  /* THE MANA THE CAST COSTS: its version's, less a self-shield's refund of the shell it replaces (shieldRefund). The
     cast event carries the NET (Magic XP is paid on the mana spent, xp-share.js magicXpFor: a refunded point pays none). */
  const paid = Number.isInteger(pick.mana) ? pick.mana : row.mana;
  const refund = shieldRefund(u, row, paid, pm);
  const mana = paid - refund;
  u.mana = int(u.mana) - mana;
  u.cds = Object.assign({}, u.cds || {}, { [row.id]: sc.atMs + row.cdMs });
  u.lanes = Object.assign({}, u.lanes || {}, { [row.lane]: sc.atMs + ABILITY_LANES[row.lane] });
  /* The tally's supply split (§3.8): any store line makes the cast 'store'; `gold` is what it cost. A rune
     spell names the rune it spent (`supply`, the analyzer's supply count), the version it cast and its power
     (permille of the row's numbers: a store rune's basic version is under 1000). */
  const gold = pick.lines.reduce((a, l) => a + l.price, 0);
  const source = pick.lines.some((l) => l.source === 'store') ? 'store' : 'own';
  const rune = row.rune && pick.lines.length ? pick.lines[0].id : null;
  sc.emit(makeEvent('cast', sc.atMs, { u: u.id, ability: row.id, t: pick.target.id, mana, magicXpMult: row.magicXpMult, source, gold,
    ...(rune ? { supply: rune, version, power: pm } : {}),
    ...(refund > 0 ? { refund } : {}),
    ...(typeof pick.rule === 'string' ? { rule: pick.rule, rule_label: pick.label, pass: pick.mask } : {}) }));
  effect(inst, u, row, pick.target, sc, { version, pm });
  return true;
}

/** Mana regenerates ABILITY_RULES.manaRegenPctPerMin of max a minute, in milli-mana (AB-13), times
    the hero's Prayer regen rate (`regenPm`, permille: src/core/vitals.js regenPermille; 1000 unset). */
function regenMana(u, dtMs) {
  if (!(int(u.maxMana) > 0)) return;
  const pm = int(u.regenPm) > 0 ? int(u.regenPm) : 1000;
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
  return isRune(itemRow(h, id)) ? { why: 'none' } : resolveLine(h && h.hs, id, undefined);
}
/** shotLine's carried half: own stock only, never the store (a shot's first pass, conditions.js attackOrder). */
export function ownShotLine(h, id) {
  return isRune(itemRow(h, id)) ? { why: 'none' } : resolveLine(h && h.hs, id, null);
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
    if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }
    return l;
  }
  return true;
}

/* THE CAST ORDER: the lap's holding tank first (targeting.js holderTank), then every other unit by id. The
   Challenge fires through this one path (roadmap p12, audit c18: its lane, its cooldown and its slot's conditions
   apply like any ability's); the holder going first keeps an overflow monster on the holder when both tanks'
   Challenges are ready (a non-holder takes only what is on a non-tank, challengeable). */
function castOrder(inst) {
  const units = inst.world.units.slice().sort((a, b) => a.id - b.id);
  const k = holderTank(inst);
  return k ? [k, ...units.filter((u) => u !== k)] : units;
}

/** Attack hook: each hero fires its first usable ability; between pulls, its first usable heal or shield (`mends`). */
export function castAbilities(inst, sc) {
  for (const u of castOrder(inst)) {
    if (u.side !== 'hero' || !u.alive) continue;
    regenMana(u, sc.dtMs);
    const pick = firstUsable(inst, u, sc, engaged(inst).length ? null : mends);
    if (pick) fire(inst, u, pick, sc);
  }
}
