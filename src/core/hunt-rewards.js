// ============================================================
// src/core/hunt-rewards.js — WHAT ONE SWING OF A HUNT INSTANCE PAYS EACH HERO
// (HUNT_SCREEN_SPEC §1.1 engine contract, §3.5, §3.9; lane S1, 2026-10-17)
//
// The world step (src/core/hunt/world-step.js) moves every unit and lands
// every blow; it pays nothing. This reads one swing's world events, in order,
// and turns them into each member's value — through that member's OWN `fx`
// sink (the one the settle prices and the database re-proves):
//
// THE XP ROUTES (docs/design/CORE_MODEL.md §4; Tyler 2026-10-19), the ONE
// place a hunt pays XP, attended or not (AWAY-1):
//   xp     kill XP (xp-share.js already split it per hero): the character's
//          LEVEL, and nothing else (Level comes from kills only)
//   dmg    a hero's blow on a monster: Melee or Ranged XP (the weapon family's
//          skill, src/data/skills.js FAMILY_SKILL) per HP removed; a magic
//          weapon pays nothing here. The lifetime crit count for a crit blow.
//   dmg / miss  a monster's blow at an ARMOURED hero: Defense XP scaled by the
//          attacker's level (MONSTERS[*].level), a blow a shield turns aside
//          (a miss on a shield-holder) paying COMBAT_XP.blockMult times more; a
//          dodge pays the plain rate; a status tick (`dot`) pays nothing
//   cast   Magic XP for the mana an ability spent (xp-share.js magicXpFor)
//   kill   of a MONSTER: its gold and drops on the instance's `r` stream —
//          gold split evenly, common items round-robin, each rare to the
//          party's rare roll (party-split.js, the one split; a `rare_roll`
//          event through ctx.emit) — and every kill counter, for each hero in
//          the instance; then the Hearthfind roll for the hero who landed it.
//          PERSONAL LOOT (ctx.personal: the instance's frozen `personal_loot`,
//          lane/p1-personal-loot): the drops are each hero's own instead, rolled
//          by every hero that took part in the kill (./hunt/took-part.js) on its
//          own loot stream (payPersonal); the gold, the counters and the
//          Hearthfind are unchanged
//   kill   of a HERO: a death, answered to the caller (the span ends that
//          hero's hunt and prices the death)
//
// DICE: only kills draw, from `ctx.rng` (seed domain `r`, one stream per
// swing, so a window cut anywhere draws the same numbers — TICK-1), in event
// order and, per kill, in this order: gold, each drop row, the round-robin
// offset (only with two or more heroes), each rare unit's roll (only with two or
// more heroes, in drop order), the Hearthfind. The `r` stream is the server's
// alone: the browser's prediction runs it on a constant (live-engine.js).
// With personal loot a kill draws on `r` only its gold and the Hearthfind: each
// roller draws its drop rows on its OWN stream (seed domain `l:<unit>`, one a
// swing, ctx.lootRngOf), so what a hero finds never depends on who else stood
// there or in which order they rolled.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS, monsterLevelOf } from '../data/monsters.js';
import { BOSS_CALL_RULES } from '../data/boss-calls.js';
import { levelAtTier } from './hunt/dial.js';
import { rollDropTable, rollPrize } from './drops.js';
import { applyGoldFind } from './pacing.js';
import { COMBAT_XP } from '../data/core-model.js';
import { FAMILY_SKILL, DAMAGE_XP_FAMILIES } from '../data/skills.js';
import { ABILITIES, ownHitSkill } from '../data/abilities.js';
import { resolveHearthfind } from './hearthfind.js';
import { magicXpFor } from './hunt/xp-share.js';
import { splitEven, itemOwner, rareRoll } from './party-split.js';
import { rollKillFor } from './trait-roll.js';
import { noteTookPart, rollersOf } from './hunt/took-part.js';
import { makeEvent } from './hunt/events.js';
import { trainingSwing } from './hunt/training.js';
import { isHero, isMonster } from './hunt/sides.js';

const call = (fx, name, ...args) => (fx && typeof fx[name] === 'function' ? fx[name](...args) : undefined);


/* THE DEFENSE XP of one monster blow aimed at member `m` (landed or turned aside):
   only while the hero wears armour; scaled by the attacker's level; a shield's
   block (a miss on a shield-holder) pays blockMult times more. */
function defenseXp(m, attacker, missed, ctx) {
  if (!m || m.armoured !== true || !isMonster(attacker)) return 0;
  const lv = levelAtTier(monsterLevelOf((ctx.monsters || MONSTERS)[attacker.kind]), ctx.tier);
  return (lv * COMBAT_XP.defenseXpPerLevelPermille / 1000) * (missed && m.shield === true ? COMBAT_XP.blockMult : 1);
}

/* THE SKILL A HERO'S BLOW TRAINS (the `dmg` route): the striking row's own skill when it names one (abilities.js ownHitSkill: a weapon
   skill, or none for Magic, which mana pays), else the weapon family's for a family whose blows pay damage XP, else none. */
function hitSkillOf(family, abilityId) {
  const own = ownHitSkill(typeof abilityId === 'string' ? ABILITIES[abilityId] : null);
  if (own !== undefined) return own;
  return DAMAGE_XP_FAMILIES.includes(family) ? FAMILY_SKILL[family] : null;
}

/* The kill counters every hero in the instance earns for one monster kill. The session's tally and the lifetime count always (the settle
   bounds a window by its kills); the Bestiary's and the tasks' (`updateQuest`) only where the session mode counts them (`bestiary`). */
function countKill(m, kind, bestiary) {
  const st = m.state;
  st.stats = st.stats || {};
  st.stats.kills = (st.stats.kills || 0) + 1;
  m.hs.tally.kills += 1;
  if (!bestiary) return;
  call(m.fx, 'updateQuest', 'kill_any', 1, { target: kind });
  call(m.fx, 'updateQuest', 'kill_monster', 1, { target: kind });
}

/* One dropped unit into member `m`'s bag (unit `unitId`), with the rare-drop moment when its band reveals. */
function giveDrop(m, unitId, ev, ctx, atMs) {
  call(m.fx, 'addItem', ev.id, 1);
  /* THE INNER FLAME (1074-inner-flame-luck.sql): a Remains noted with its instant, in the engine's own order, when the server handed a note
     (hunt-settle.js flameDropsOf: { fuel, list, seq }, `fuel` the server's own hr_flame_fuel items). No die is drawn. */
  if (ctx.flameDrops && ctx.flameDrops.fuel.has(ev.id)) ctx.flameDrops.list.push({ at: Math.floor(atMs), seq: ctx.flameDrops.seq++, key: m.key, item: ev.id, qty: 1 });
  if (ev.rare) {
    m.state.stats = m.state.stats || {}; m.state.stats.rareDrops = (m.state.stats.rareDrops || 0) + 1;
    /* THE RARE-DROP MOMENT: a world event for the owner (the timeline: alert, float, log) and the
       member's hint (huntProposal hints.rare_drop: the session's journal row). */
    if (typeof ctx.emit === 'function') ctx.emit(makeEvent('rare_drop', atMs, { u: unitId, item: ev.id }));
    if (Array.isArray(m.hs._events)) m.hs._events.push({ type: 'rare_drop', atMs, item: ev.id });
  }
  call(m.fx, 'onDrop', ev);
}

/* A KEYED HALL'S DAILY PRIZE (src/data/boss-halls.js; Tyler 2026-11-14: "a daily kill"). The boss's rows are PERSONAL and ONCE A DAY:
   each hero there whose day's prize is still to take (member.prizeLeft: the server's own read, never a client value) rolls ONCE, in
   unit-id order, one draw a roll (drops.js rollPrize: the rows are slices of that one roll, no multiplier), and keeps what lands. The
   roll is the day's whether a piece lands or not: `hs.prizeRolled` rides the member's journal (accrual.js memberDelta `journal.meta.prize`) and the
   database stamps the day and refuses a second (hr_hunt_apply_member). A hero who took it today rolls nothing and draws nothing, and
   still shares the kill's XP and coin like everyone there. No party rare roll: nothing here is shared. */
function payPrize(present, ids, row, ctx, atMs) {
  present.forEach((m, i) => {
    if (m.prizeLeft !== true) return;
    m.prizeLeft = false;
    m.hs.prizeRolled = true;
    /* A HERO'S FIRST ROLL ON THIS BOSS, EVER, IS A SURE ONE (the server's word, member.prizeFirst; drops.js prizeSlices): a piece always lands */
    const ev = rollPrize(row.drops, ctx.rng, m.prizeFirst === true);
    m.prizeFirst = false;
    if (ev) giveDrop(m, ids[i], ev, ctx, atMs);
  });
}

/* A monster kill's gold and drops, split across `present` (members in unit-id
   order; `ids` their unit ids), and the Hearthfind for `killer`. A rare unit
   goes to the rare roll, its rotation kept on `world.rareWon`. */
function payKill(present, ids, killer, kind, ctx, world, atMs, monId) {
  /* WHAT THE SESSION MODE PAYS (session-modes.js; ctx.pay, absent in a full hunt): a mode that pays no coin or no drops kills a row that
     has none, by this one door (the settle refuses a window that says otherwise: mode_pays); one that counts no Bestiary counts the
     session's kill and nothing else (countKill), and draws no Hearthfind. */
  const pay = ctx.pay || null;
  const row0 = (ctx.monsters || MONSTERS)[kind];
  if (!row0) return;
  const row = !pay || (pay.coin && pay.drops) ? row0 : { ...row0, ...(pay.coin ? {} : { gp: null }), ...(pay.drops ? {} : { drops: [] }) };
  const rng = ctx.rng;
  /* THE ROW'S WHOLE KILL for every party size (Tyler 2026-11-08: one difficulty for every group), shared by who was there. */
  const rolled = Array.isArray(row.gp) ? rng.int(row.gp[0], row.gp[1]) : 0;
  /* ON THE DANGER SCALE (src/core/hunt/danger.js dangerDial coinPm, the swing's dial): the roll x the pull's share x the depth ratio, the
     same die drawn (wave 1: coin follows the step as Level XP does). Off it the dial carries no coinPm and the roll is the kill's. */
  const coinPm = ctx.tier && Number.isFinite(ctx.tier.coinPm) ? ctx.tier.coinPm : null;
  const gp = coinPm === null ? rolled : Math.round((rolled * coinPm) / 1000);
  /* The remainder's first seat moves with the kill: the dead monster's unit and the swing, both on the stored world, so
     any cut of the windows pays the same shares, and no die is drawn (the loot stream below stays where it was). */
  const shares = splitEven(Math.max(0, gp), present.length, (Number(monId) || 0) + (Number(world.swing) || 0));
  present.forEach((m, i) => {
    const g = applyGoldFind(shares[i], m.bonus);
    if (g > 0) { m.state.gold = (m.state.gold || 0) + g; call(m.fx, 'onLoot', g, row); }
  });
  const lead = killer || present[0];
  /* A KEYED HALL'S BOSS (ctx.prize, combat-sim.js from the room): his rows are the hall's DAILY PRIZE, each hero's own roll (payPrize),
     never the shared table. Every other kill, his adds' included, rolls as it always did, draw for draw. */
  if (ctx.prize === kind) payPrize(present, ids, row, ctx, atMs);
  else {
    payDrops(present, ids, lead, row, ctx, world, atMs);
    /* THE TRAIT ROLL (src/core/trait-roll.js; DARK: only when the server hands the window one, which no caller does while
       GEAR_STEPS.traitsLive is false). Each hero at the kill, in unit-id order, on its OWN `t:<unit>` stream: no draw above moves.
       With personal loot, each hero that took part in the kill (took-part.js), one in (how many of them): the drops' own rule. */
    if (ctx.traitDrops && (!pay || pay.drops)) {
      const by = ctx.personal ? rollersOf(ids, unitIn(world)) : ids;
      by.forEach((id) => { const m = present[ids.indexOf(id)]; rollKillFor(ctx.traitDrops, m.key, id, by.length, ctx.traitDrops.rngOf(id), atMs, monId, m.worn); });
    }
  }
  for (const m of present) countKill(m, kind, !pay || pay.bestiary);
  /* THE HEARTHFIND: LAST, after every other draw this kill makes, for the hero
     who landed it. The grant is hr_apply's, from its own catalogue. Never in a mode that counts no Bestiary. */
  if (pay && !pay.bestiary) return;
  const roll = { rng, fx: lead.fx, hearthfind: ctx.hearthfind };
  resolveHearthfind(lead.state, 'monster', kind, roll);
}

/* A world's unit by id (the rewards' lookups of a kill's few heroes). */
const unitIn = (world) => (id) => world.units.find((u) => u.id === id) || null;

/* A kill's drop table, rolled once for the party on `lead`'s odds: commons round-robin, each rare to the party's rare roll. With personal
   loot (ctx.personal), each roller's own roll instead (payPersonal). */
function payDrops(present, ids, lead, row, ctx, world, atMs) {
  if (ctx.personal) { payPersonal(present, ids, row, ctx, world, atMs); return; }
  const rng = ctx.rng;
  /* ON THE DANGER SCALE the swing's dial carries the depth's share of the table (danger.js dangerDial dropPm: loot follows depth); off it none */
  const depthPm = ctx.tier && Number.isFinite(ctx.tier.dropPm) ? ctx.tier.dropPm : undefined;
  const rolled = rollDropTable(row.drops, { depthPm, dropMult: lead.weakness(row).dropMult, dropBuff: lead.bonus('dropRate') }, rng);
  const offset = present.length > 1 && rolled.events.length ? rng.int(0, present.length - 1) : 0;
  let k = 0;
  for (const ev of rolled.events) {
    let m;
    if (ev.rare && present.length > 1) {
      const roll = rareRoll(ids, world.rareWon, rng);
      world.rareWon = roll.won;
      m = present[ids.indexOf(roll.winner)];
      if (typeof ctx.emit === 'function') {
        ctx.emit(makeEvent('rare_roll', atMs, { u: roll.winner, item: ev.id, rolls: roll.rolls, ...(roll.reroll ? { reroll: roll.reroll } : {}) }));
      }
    } else {
      m = present[itemOwner(k++, present.length, offset)];
    }
    giveDrop(m, ids[present.indexOf(m)], ev, ctx, atMs);
  }
}

/* PERSONAL LOOT (src/data/party.js PERSONAL_LOOT; 21-flame-temper-imbue-loot.md section 4; the hr_flags switch `personal_loot`, frozen on
   the instance when its hunt starts, 1076-personal-loot.sql): EVERY HERO THAT TOOK PART in the kill (took-part.js rollersOf: alive at it and
   struck at a monster or healed a hero in its pull) rolls the kill's whole table itself, in unit-id order, each row at 1 / (the heroes
   rolling) of its chance (drops.js effectiveDropChance `share`), on ITS OWN odds (its weakness and drop buff, never the killer's), on ITS
   OWN loot stream (ctx.lootRngOf(unit): seed domain l:<unit>, one a swing). What it finds goes to its own bag and only its own: there is
   no round-robin, no rare roll and no rotation (`rareWon` is never touched), and a Rare's moment names its finder. The kill's expected
   drops are the row's in any party, so a party never drops more than its heroes would apart. Not a die is drawn on `r`. */
function payPersonal(present, ids, row, ctx, world, atMs) {
  /* a table with no row (an add, a mode that pays no drops) rolls nothing, and so seeds no roller's stream */
  if (!Array.isArray(row.drops) || !row.drops.length) return;
  const by = rollersOf(ids, unitIn(world));
  const depthPm = ctx.tier && Number.isFinite(ctx.tier.dropPm) ? ctx.tier.dropPm : undefined;
  for (const id of by) {
    const m = present[ids.indexOf(id)];
    /* the roller's own odds: the depth's share of the table, its weakness and its drop buff, at 1 / (the rollers) */
    const own = { depthPm, dropMult: m.weakness(row).dropMult, dropBuff: m.bonus('dropRate'), share: by.length };
    for (const ev of rollDropTable(row.drops, own, ctx.lootRngOf(id)).events) giveDrop(m, id, ev, ctx, atMs);
  }
}

/* A CALLED FIGHT PAYS ONLY HIS DROPS, ON A WIN (Tyler 2026-11-14, superseding 11-04's nothing; src/data/boss-calls.js). His kill is the win: it rolls the
   called row's own table (his ground table and his call-only piece) for the heroes alive at it, the same split as any kill, and moves of the kill counters
   only the boss's own `ev:kill_monster:<called row>`, the one number his title reads (the Bestiary's read leaves it out, and no kill is journalled). No XP on
   any route, no coin, no Hearthfind; a death or the limit ends the fight before any kill, so it rolls nothing; an add's kill pays nothing. The only
   die drawn is the table's, on his kill. SHUT while BOSS_CALL_RULES.dropsLive is false (the live allowlist still refuses an item). One door, so a route added above can't reach it. hr_hunt_apply_member holds a window to the same (tests/boss-call.mjs). */
/* The heroes alive at kill `i` (its index in the swing's events), in unit-id order: they share its gold, loot and rare roll, as its XP
   (xp-share.js). `world` is AFTER the swing, so a hero who fell later in it (`fell`) was there (Andy's Tower wipe 2026-11-19: XP, no kill). */
const livingAt = (world, members, fell, i) => world.units.filter((u) => isHero(u) && members.has(u.id) && (u.alive === true || fell.get(u.id) > i)).map((u) => u.id).sort((a, b) => a - b);

/* Each member hero's fall in this swing: its index in `events`. */
function fallsAt(members, events) {
  const at = new Map();
  events.forEach((ev, i) => { if (ev.type === 'kill' && members.has(ev.t) && !at.has(ev.t)) at.set(ev.t, i); });
  return at;
}

function calledSwing(members, events, world, unitOf, boss, ctx) {
  const deaths = [];
  const fell = fallsAt(members, events);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    /* WHO TOOK PART (took-part.js): every act before the kill, in order */
    noteTookPart(ev, members, unitOf, world);
    if (ev.type !== 'kill') continue;
    const t = unitOf(ev.t);
    if (isMonster(t) && t.kind === boss) {
      const ids = livingAt(world, members, fell, i);
      const row = (ctx.monsters || MONSTERS)[boss];
      if (BOSS_CALL_RULES.dropsLive === true && ids.length && row) { const present = ids.map((id) => members.get(id)); payDrops(present, ids, members.get(ev.u) || present[0], row, ctx, world, ev.atMs); }
      for (const m of members.values()) call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind });
    } else if (members.has(ev.t)) {
      const k = unitOf(ev.u);
      deaths.push({ unit: ev.t, atMs: ev.atMs, monster: isMonster(k) ? k.kind : '' });
    }
  }
  return deaths;
}

/**
 * Pay one swing. `members` maps a hero unit id to its member:
 *   { state, hs, fx, family (the weapon family), armoured, shield, bonus(key),
 *     weakness(monsterRow) → { dropMult } }.
 * `world` is the instance world AFTER the swing (a corpse is still a unit).
 * `ctx` = { rng (the swing's `r` stream), monsters?, tier? (the swing's dial, src/core/hunt/dial.js: the Danger scale step's), hearthfind? (the indexed table; the catalogue's when absent),
 *   personal? + lootRngOf(unit)? (PERSONAL LOOT, payPersonal: each roller's own drops on its own stream; absent, the party's one roll),
 *   emit?(event) (the instance's world events: a party's `rare_roll`), call? (the room's boss call: it pays only his drops, on his kill),
 *   prize? (a keyed hall's boss, by id: his rows are each hero's own daily roll, payPrize),
 *   train? (a training ground's { place, skill }: it pays that skill only, src/core/hunt/training.js),
 *   pay? (the session mode's { xpPm, coin, drops, bestiary }, session-modes.js sessionPayOf; absent in a full hunt: every route pays whole) }.
 * Answers the swing's deaths: [{ unit, atMs, monster }], in event order.
 */
export function rewardSwing(members, events, world, ctx) {
  const unitOf = (id) => world.units.find((u) => u.id === id) || null;
  if (ctx.call) return calledSwing(members, events, world, unitOf, ctx.call.monster, ctx);
  /* A TRAINING GROUND (src/core/hunt/training.js): the trained skill only, at its share; nothing else by any route. */
  if (ctx.train) return trainingSwing(members, events, unitOf);
  const fell = fallsAt(members, events);
  /* A SESSION MODE'S SHARE OF EVERY SKILL ROUTE (session-modes.js xpPm; Level XP takes it at the split, xp-share.js): never multiplied at 1000. */
  const pm = ctx.pay && Number.isInteger(ctx.pay.xpPm) && ctx.pay.xpPm !== 1000 ? ctx.pay.xpPm : null;
  const share = (n) => (pm === null ? n : (n * pm) / 1000);
  const deaths = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    /* WHO TOOK PART (took-part.js): the pull's marks, every act before this event read in order, so a kill reads the acts before it */
    noteTookPart(ev, members, unitOf, world);
    switch (ev.type) {
      case 'xp': {
        const m = members.get(ev.u);
        if (m && ev.amount > 0) call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);
        break;
      }
      case 'dmg': {
        const m = members.get(ev.u);
        const t = unitOf(ev.t);
        if (m && isMonster(t) && ev.amount > 0) {
          const skill = hitSkillOf(m.family, ev.ability);
          if (skill) call(m.fx, 'addXp', skill, share(ev.amount * COMBAT_XP.hitXpPerDamage));
        }
        if (m && ev.crit === true) { m.state.stats = m.state.stats || {}; m.state.stats.crits = (m.state.stats.crits || 0) + 1; }
        /* A status tick (`dot`: poison, burn, bleed) is not a blow: it trains no Defense (Tyler 2026-10-22). */
        const hit = ev.dot === true ? null : members.get(ev.t);
        const d = hit ? defenseXp(hit, unitOf(ev.u), false, ctx) : 0;
        if (d > 0) call(hit.fx, 'addXp', 'defense', share(d));
        break;
      }
      case 'miss': {
        /* A DODGE (medium armour, ruling K7) is a blow aimed and turned aside by the hero's own
           footwork: it trains Defense like any blow taken, never at a shield block's rate. */
        const aimed = members.get(ev.t);
        const d = aimed ? defenseXp(aimed, unitOf(ev.u), ev.dodge !== true, ctx) : 0;
        if (d > 0) call(aimed.fx, 'addXp', 'defense', share(d));
        break;
      }
      case 'cast':
      /* A caster's basic (damage.js: a `shot` that spent mana, Tyler 10-15 K3): Magic XP for that mana, the same rule. */
      case 'shot': {
        const m = members.get(ev.u);
        const n = m && ev.mana > 0 && ev.magicXpMult > 0 ? magicXpFor(ev.mana, ev.magicXpMult / 1000) : 0;
        if (n > 0) call(m.fx, 'addXp', 'magic', share(n));
        break;
      }
      case 'kill': {
        const t = unitOf(ev.t);
        if (!t) break;
        if (isMonster(t)) {
          const ids = livingAt(world, members, fell, i);
          if (ids.length) payKill(ids.map((id) => members.get(id)), ids, members.get(ev.u) || null, t.kind, ctx, world, ev.atMs, ev.t);
        } else if (members.has(ev.t)) {
          const k = unitOf(ev.u);
          deaths.push({ unit: ev.t, atMs: ev.atMs, monster: isMonster(k) ? k.kind : '' });
        }
        break;
      }
      default: break;
    }
  }
  return deaths;
}
