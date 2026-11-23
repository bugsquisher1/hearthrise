// ============================================================
// src/core/hunt/trait-rules.js — A WORN TRAIT IN THE FIGHT: each Trait a RULE on a conditional step of the gear slice (systems,
// lane/traits-in-engine, 2026-11-23; docs/design/redesign/12-targets.md section 8, 14-trait-candidates.md, 19-power-ledger.md row 5;
// the 40 rows are src/data/traits.js, their sizes src/data/gear-steps.js).
//
// DARK (GEAR_STEPS.traitsLive false): the engine plays the Traits a hero WEARS (`wornTraits` on its hero, [{ id, rank }]: the server's
// projection of the pieces it wears, wave 4, with their Security review), and no server or client file hands one while the switch is off
// (tests/hunt-core/trait-rules.mjs dark). The Lab and the tests hand them. With none, a blow reads one empty check: every hunt plays as before.
//
// A TRAIT IS A LEDGER ROW ON A CONDITION (src/core/power-ledger.js): while its `when` holds on a blow or a heal, its rank's steps
// (GEAR_STEPS.traitSteps) join the hero's rows of the GEAR slice in its channel, so the slice's cap (conditionalStepsMax) holds every
// Trait, crit and answer on one blow together, and a whole kit a tier up still beats a kit a tier down:
//   offense  the hero's blow at a monster (amount.js blowAmount)     defense  a monster's blow at the hero
//   heal     the hero's heal or shell (amount.js healAmount)
// A TRADE (`trade`) is two rows on one `when`: offense + tradeSteps, defense - traitSteps (a cost: never clamped).
// THE KEY RULE (04 guard 3): of a hero's Traits of one key only the larger counts (the higher rank; a tie, the party-wide one, then the lower
// number), so two halves of one rule never make an always-on number. A PARTY Trait (scope 'party') gives every living hero of the wearer's
// side its row while the wearer stands, counted once a party by the ledger's party rule (an ally's whole, outside its own cap).
// THE CONDITION is the bar's own (src/core/hunt/conditions.js holds, the evaluator a slot reads), read for the hero that gains the row at
// the blow's or the heal's instant, except where the bar reads its slot's own move and aim, which a Trait reads from the blow itself:
//   target_is_boss, effect_missing 'target'   the blow's other side: the monster struck (offense) or the monster striking (defense)
//   target_weak / target_resists              the blow's own element answer on the monster (over 1000 weak, under it resists)
//   enemies_in_aoe                            the monsters the shaped cast that landed this blow covers (abilities.js `area`)
//   ally_hp_pct, effect_missing 'ally' on a heal   the heal's own target ('lowest': whoever it lands on; a role: only a hero of it)
// `move` narrows a Trait to one kind of blow: 'area' a shaped cast, 'spell' a cast that trains Magic (magicXpMult) or a caster's basic,
// 'ranged' a shot (a row that spends ammo, or a shooter's basic). A status tick is no move. `startMin` holds a running-low Trait off
// unless the hunt began with at least that much of its stock (the bag's `loaded`).
// THE EVENT a Trait changed names it: the blow's or the heal's own event carries `tr`, the ids of the Traits whose rows held on it,
// comma-joined, only when one did (src/render/source-names.js names each).
// Viewed and closed are one hunt: every condition reads state the world persists or the boundary writes (combat-sim.js syncUnit writes
// `traitRules` from the hero at every boundary, never persisted), at the sub-step's instant.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { GEAR_STEPS, TRAITS } from '../../data/gear-steps.js';
import { MONSTERS } from '../../data/monsters.js';
import { ABILITIES } from '../../data/abilities.js';
import { HUNT_ROLES } from '../../data/hunt-roles.js';
import { holds as barHolds, compare } from './conditions.js';
import { isHero, isAlly, isMonster } from './sides.js';

const NONE = Object.freeze([]);
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const RANKS = GEAR_STEPS.traitSteps.length;
/* the most Traits one Trait slot's worn pieces carry: a Very Rare's on each equip slot it fills (a ring Trait fits either ring) */
const PER_PIECE = Math.max(...Object.values(GEAR_STEPS.traitsByRarity));
const roomOf = (slot) => (own(GEAR_STEPS.traitSlots, slot) ? GEAR_STEPS.traitSlots[slot].length * PER_PIECE : 0);
const isParty = (id) => TRAITS[id].scope === 'party';
/* the key rule's order: the higher rank, then the party-wide one, then the lower number */
const better = (a, b) => (a.rank !== b.rank ? a.rank > b.rank : isParty(a.id) !== isParty(b.id) ? isParty(a.id) : TRAITS[a.id].n < TRAITS[b.id].n);

/** THE TRAITS A HERO WEARS, AS THE ENGINE PLAYS THEM, from the server's list [{ id, rank }]: an unknown id, a rank outside 1 to 3 and a
    Trait past what its slot's pieces hold are dropped, then the key rule keeps one Trait a key. Frozen [{ id, rank }] by number, or null. */
export function wornTraitsOf(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const perSlot = new Map(), byKey = new Map();
  for (const x of list) {
    const id = x && x.id, rank = x && x.rank;
    if (!own(TRAITS, id) || !Number.isInteger(rank) || rank < 1 || rank > RANKS) continue;
    const t = TRAITS[id], n = perSlot.get(t.slot) || 0;
    if (n >= roomOf(t.slot)) continue;
    perSlot.set(t.slot, n + 1);
    const was = byKey.get(t.key), w = { id, rank };
    if (!was || better(w, was)) byKey.set(t.key, w);
  }
  const out = [...byKey.values()].sort((a, b) => TRAITS[a.id].n - TRAITS[b.id].n).map((w) => Object.freeze(w));
  return out.length ? Object.freeze(out) : null;
}

/* THE RULES A WORN LIST MAKES (cached on the list: one object a hero's projection): by channel the hero's own, and its party-wide ones.
   An entry is { id, t (the row), raises, steps } */
const RULES = new WeakMap();
function rulesOf(list) {
  let r = RULES.get(list);
  if (r) return r;
  const o = { offense: [], defense: [], heal: [], party: [] };
  for (const w of wornTraitsOf(list) || NONE) {
    const t = TRAITS[w.id], steps = GEAR_STEPS.traitSteps[w.rank - 1];
    const put = (raises, n) => (t.scope === 'party' ? o.party : o[raises]).push(Object.freeze({ id: w.id, t, raises, steps: n }));
    if (t.trade === true) { put('offense', GEAR_STEPS.tradeSteps[w.rank - 1]); put('defense', -steps); } else put(t.raises, steps);
  }
  r = Object.freeze({ offense: Object.freeze(o.offense), defense: Object.freeze(o.defense), heal: Object.freeze(o.heal), party: Object.freeze(o.party) });
  RULES.set(list, r);
  return r;
}

/** WRITE HERO `hero`'s WORN TRAITS ON UNIT `u` (combat-sim.js syncUnit, every boundary, never persisted): `traitRules`, or none of it. */
export function syncTraits(u, hero) {
  const list = hero && hero.wornTraits;
  const r = Array.isArray(list) && list.length ? rulesOf(list) : null;
  if (r && (r.offense.length || r.defense.length || r.heal.length || r.party.length)) u.traitRules = r;
  else if (u.traitRules !== undefined) delete u.traitRules;
}

/* the heroes of the instance that wear a party-wide Trait: read once an instance (a hero's pieces never change inside one swing) */
function partyWearers(inst) {
  if (inst.traitParty) return inst.traitParty;
  let out = NONE;
  for (const u of inst.world.units) if (isHero(u) && u.traitRules && u.traitRules.party.length) (out === NONE ? (out = []) : out).push(u);
  inst.traitParty = out;
  return out;
}

/* the blow's or the heal's context, as a Trait reads it (the header) */
function contextOf(inst, u, channel, c) {
  return {
    inst, u, channel,
    other: channel === 'offense' ? c.target || null : channel === 'defense' ? c.source || null : null,
    el: Number.isFinite(c.el) ? c.el : null, tag: c.tag || null, to: c.to || null,
    /* the bar's own context: no slot, no aim, the sub-step's instant */
    bar: { inst, u, h: inst.heroes ? inst.heroes[u.id] || null : null, slot: null, aim: null, ally: null, atMs: inst.atMs },
  };
}

/* is the blow of kind `kind` (the header's `move`) */
function moveIs(kind, cx) {
  const tag = cx.tag;
  if (tag && tag.dot) return false;
  const id = tag && typeof tag.id === 'string' ? tag.id : 'basic';
  const row = own(ABILITIES, id) ? ABILITIES[id] : null;
  const role = HUNT_ROLES[cx.u.role] || null;
  if (kind === 'area') return !!tag && Number.isInteger(tag.area) && tag.area > 0;
  if (kind === 'spell') return row ? row.magicXpMult > 0 : id === 'basic' && !!(role && role.basic && role.basic.magicXpMult > 0);
  if (kind === 'ranged') return row ? row.ammo > 0 : id === 'basic' && !!role && role.melee !== true && !role.basic;
  return false;
}

/* did the hunt begin with at least sm.value of the stock (`startMin`: only the loaded ammo has one) */
function startedWith(cx, sm) {
  const h = cx.bar.h, bag = h && h.hs && h.hs.bag;
  if (sm.subject !== 'ammo' || !h || !h.ammo || !bag || !own(bag, h.ammo)) return false;
  return Number.isInteger(bag[h.ammo].loaded) && bag[h.ammo].loaded >= sm.value;
}

const bool = (v, w) => v !== null && compare(w.op, v === true, w.value === true);
const pctOf = (x, w) => !!x && Number(x.maxHp) > 0 && compare(w.op, Math.floor(Number(x.hp) || 0) * 100, w.value * Math.floor(Number(x.maxHp)));
const statusOn = (x, id) => !!x && Array.isArray(x.statuses) && x.statuses.some((st) => st.s === id);

/* does condition `w` hold in Trait context `cx` (the header's readings, else the bar's own) */
function whenHolds(cx, w) {
  switch (w.metric) {
    case 'enemies_in_aoe': return compare(w.op, cx.tag && Number.isInteger(cx.tag.area) ? cx.tag.area : 0, w.value);
    case 'target_weak': return bool(cx.channel === 'offense' && cx.el !== null ? cx.el > 1000 : null, w);
    case 'target_resists': return bool(cx.channel === 'offense' && cx.el !== null ? cx.el < 1000 : null, w);
    case 'target_is_boss': return bool(isMonster(cx.other) ? !!(MONSTERS[cx.other.kind] && MONSTERS[cx.other.kind].boss === true) : null, w);
    case 'effect_missing': {
      const s = w.subject || 'target';
      if (s === 'self') break;
      const who = s === 'ally' ? (cx.channel === 'heal' ? cx.to : null) : cx.other;
      if (!who) return false;
      return w.op === 'has_effect' ? statusOn(who, w.value) : !statusOn(who, w.value);
    }
    case 'ally_hp_pct': {
      if (cx.channel !== 'heal' || w.subject === 'self') break;
      const t = cx.to;
      if (!t || !isHero(t) || (w.subject && w.subject !== 'lowest' && t.role !== w.subject)) return false;
      return pctOf(t, w);
    }
    default: break;
  }
  return barHolds(cx.bar, w);
}

function ruleHolds(cx, e) {
  const t = e.t;
  if (t.move && !moveIs(t.move, cx)) return false;
  if (t.startMin && !startedWith(cx, t.startMin)) return false;
  return whenHolds(cx, t.when);
}

/**
 * THE TRAIT ROWS THAT HOLD ON HERO `u` FOR ONE BLOW OR HEAL (amount.js, its one call a channel): pushed onto `rows` (the call's own fresh
 * array of the hero's other rows) as ledger rows of the gear slice, and their ids on `c.traits` (the event's `tr`). `c` is the amount's
 * context: { source, target, el, tag } of a blow, { to } of a heal. Answers `rows`, untouched when none holds or `u` is no living hero.
 */
export function withTraits(rows, inst, u, channel, c) {
  if (!inst || !inst.world || !isHero(u) || u.alive !== true) return rows;
  const mine = u.traitRules ? u.traitRules[channel] : NONE;
  const lent = partyWearers(inst);
  if (!mine.length && !lent.length) return rows;
  let cx = null;
  const take = (e, row) => {
    rows.push(row);
    const ids = c.traits || (c.traits = []);
    if (!ids.includes(e.id)) ids.push(e.id);
  };
  for (const e of mine) {
    if (!ruleHolds(cx || (cx = contextOf(inst, u, channel, c)), e)) continue;
    take(e, { slice: 'gear', raises: channel, steps: e.steps, key: e.t.key });
  }
  for (const w of lent) {
    if (w.alive !== true || (w !== u && !isAlly(w, u))) continue;
    for (const e of w.traitRules.party) {
      if (e.raises !== channel || !ruleHolds(cx || (cx = contextOf(inst, u, channel, c)), e)) continue;
      take(e, { slice: 'gear', raises: channel, steps: e.steps, key: e.t.key, scope: 'party', worn: w === u });
    }
  }
  return rows;
}

/** The `tr` field of an event from a context's Trait ids (withTraits `c.traits`): { tr: 'a,b' }, or nothing. */
export const traitsField = (ids) => (Array.isArray(ids) && ids.length ? { tr: ids.join(',') } : {});
