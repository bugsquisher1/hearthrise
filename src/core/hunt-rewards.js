// ============================================================
// src/core/hunt-rewards.js — WHAT ONE SWING OF A HUNT INSTANCE PAYS EACH HERO
// (HUNT_SCREEN_SPEC §1.1 engine contract, §3.5, §3.9; lane S1, 2026-10-17)
//
// The world step (src/core/hunt/world-step.js) moves every unit and lands
// every blow; it pays nothing. This reads one swing's world events, in order,
// and turns them into each member's value — through that member's OWN `fx`
// sink (the one the settle prices and the database re-proves):
//
//   xp     kill XP (xp-share.js already split it per hero) along the hero's
//          combat-style route (styles.js killXpRoute)
//   dmg    hit XP for every point of HP a hero removed from a monster, and the
//          lifetime crit count for a crit blow
//          (styles.js hitXpRoute: "XP is earned on damage dealt")
//   cast   Magic XP for the mana an ability spent (xp-share.js magicXpFor)
//   kill   of a MONSTER: its gold and drops on the instance's `r` stream —
//          gold split evenly, items round-robin (party-split.js, the one
//          split) — and every kill counter, for each hero in the instance;
//          then the Hearthfind roll for the hero who landed it
//   kill   of a HERO: a fall, answered to the caller (the span owns the
//          knockout, the death row and the price of the fall)
//
// DICE: only kills draw, from `ctx.rng` (seed domain `r`, one stream per
// swing, so a window cut anywhere draws the same numbers — TICK-1), in event
// order and, per kill, in this order: gold, each drop row, the round-robin
// offset (only with two or more heroes), the Hearthfind.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../data/monsters.js?v=0.2.0';
import { rollDropTable } from './drops.js?v=0.2.0';
import { yieldOf } from './hunt/damage.js?v=0.2.0';
import { applyGoldFind } from './pacing.js?v=0.2.0';
import { hitXpRoute, killXpRoute } from './styles.js?v=0.2.0';
import { resolveHearthfind } from './hearthfind.js?v=0.2.0';
import { magicXpFor } from './hunt/xp-share.js?v=0.2.0';
import { splitEven, itemOwner } from './party-split.js?v=0.2.0';

const call = (fx, name, ...args) => (fx && typeof fx[name] === 'function' ? fx[name](...args) : undefined);

/* The kill counters every hero in the instance earns for one monster kill. */
function countKill(m, kind) {
  const st = m.state;
  st.stats = st.stats || {};
  st.stats.kills = (st.stats.kills || 0) + 1;
  m.hs.tally.kills += 1;
  call(m.fx, 'updateDaily', 'kill_any', 1);
  call(m.fx, 'updateQuest', 'kill_any', 1, { target: kind });
  call(m.fx, 'updateQuest', 'kill_monster', 1, { target: kind });
}

/* A monster kill's gold and drops, split across `present` (members in unit-id
   order), and the Hearthfind for `killer`. */
function payKill(present, killer, kind, ctx, yieldPm) {
  const row = (ctx.monsters || MONSTERS)[kind];
  if (!row) return;
  const rng = ctx.rng;
  /* THE YIELD SHARE (hunt-grounds.js yieldPermille): coin, every drop chance and the Hearthfind
     roll pay `y` of the row's, the same draws in the same order. */
  const y = yieldPm / 1000;
  const gp = Array.isArray(row.gp) ? Math.round(rng.int(row.gp[0], row.gp[1]) * y) : 0;
  const shares = splitEven(Math.max(0, gp), present.length);
  present.forEach((m, i) => {
    const g = applyGoldFind(shares[i], m.bonus);
    if (g > 0) { m.state.gold = (m.state.gold || 0) + g; call(m.fx, 'onLoot', g, row); }
  });
  const lead = killer || present[0];
  const rolled = rollDropTable(row.drops, { dropMult: lead.weakness(row).dropMult, dropBuff: lead.bonus('dropRate'), yieldMult: y }, rng);
  const offset = present.length > 1 && rolled.events.length ? rng.int(0, present.length - 1) : 0;
  rolled.events.forEach((ev, k) => {
    const m = present[itemOwner(k, present.length, offset)];
    call(m.fx, 'addItem', ev.id, 1);
    if (ev.rare) { m.state.stats = m.state.stats || {}; m.state.stats.rareDrops = (m.state.stats.rareDrops || 0) + 1; }
    call(m.fx, 'onDrop', ev);
  });
  for (const m of present) countKill(m, kind);
  /* THE HEARTHFIND: LAST, after every other draw this kill makes, for the hero
     who landed it. The grant is hr_apply's, from its own catalogue. */
  /* A scaled kill's Hearthfind is THINNED, never boosted, and never inside the roll
     (tests/hearthfind-mint-guard.mjs: rollHearthfind takes no modifier): a kill paying
     y < 1 of its yield first passes a y chance, then makes the untouched roll, so the
     find lands at y / oneIn. A full-yield kill draws exactly as before. */
  if (y < 1 && !rng.chance(y)) return;
  const roll = { rng, fx: lead.fx, hearthfind: ctx.hearthfind };
  resolveHearthfind(lead.state, 'monster', kind, roll);
}

/**
 * Pay one swing. `members` maps a hero unit id to its member:
 *   { state, hs, fx, style, bonus(key), weakness(monsterRow) → { dropMult } }.
 * `world` is the instance world AFTER the swing (a corpse is still a unit).
 * `ctx` = { rng (the swing's `r` stream), monsters?, hearthfind? (the indexed table; the catalogue's when absent) }.
 * Answers the swing's falls: [{ unit, atMs, monster }], in event order.
 */
export function rewardSwing(members, events, world, ctx) {
  const unitOf = (id) => world.units.find((u) => u.id === id) || null;
  const present = () => world.units.filter((u) => u.side === 'hero' && members.has(u.id))
    .sort((a, b) => a.id - b.id).map((u) => members.get(u.id));
  const falls = [];
  for (const ev of events) {
    switch (ev.type) {
      case 'xp': {
        const m = members.get(ev.u);
        if (m) for (const g of killXpRoute(m.style, ev.amount, 1)) call(m.fx, 'addXp', g.skill, g.amount);
        break;
      }
      case 'dmg': {
        const m = members.get(ev.u);
        const t = unitOf(ev.t);
        if (m && t && t.side === 'mon' && ev.amount > 0) for (const g of hitXpRoute(m.style, ev.amount)) call(m.fx, 'addXp', g.skill, g.amount);
        if (m && ev.crit === true) { m.state.stats = m.state.stats || {}; m.state.stats.crits = (m.state.stats.crits || 0) + 1; }
        break;
      }
      case 'cast': {
        const m = members.get(ev.u);
        const n = m && ev.mana > 0 && ev.magicXpMult > 0 ? magicXpFor(ev.mana, ev.magicXpMult / 1000) : 0;
        if (n > 0) call(m.fx, 'addXp', 'magic', n);
        break;
      }
      case 'kill': {
        const t = unitOf(ev.t);
        if (!t) break;
        if (t.side === 'mon') {
          const heroes = present();
          if (heroes.length) payKill(heroes, members.get(ev.u) || null, t.kind, ctx, yieldOf(t));
        } else if (members.has(ev.t)) {
          const k = unitOf(ev.u);
          falls.push({ unit: ev.t, atMs: ev.atMs, monster: k && k.side === 'mon' ? k.kind : '' });
        }
        break;
      }
      default: break;
    }
  }
  return falls;
}
