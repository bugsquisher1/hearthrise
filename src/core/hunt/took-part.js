// ============================================================
// src/core/hunt/took-part.js — WHO TOOK PART IN A KILL (personal loot, 20-v030-the-roads.md section 4 lane P1; 21-flame-temper-imbue-loot.md
// section 4; 02-architecture.md package 4: "each hero rolls their own drops from the kills they took part in")
//
// THE RULE, in one place (backend, lane/p1-personal-loot, 2026-11-27). A hero TAKES PART in a pull when, since that pull began, it
//   struck at a monster      a `dmg` it dealt to a monster (a blow, a cast, a tick it set: any amount) or a `miss` it aimed at one
//                            (a blow the dice turned aside is still a blow struck), or
//   healed or shielded a hero a `heal` or a `shield` it gave a hero, of more than nothing; a meal or a drink (a `heal` naming an `item`)
//                            is the hero tending itself, not a part in the fight, and never counts.
// A hero takes part in a KILL when it is alive at the kill (hunt-rewards.js livingAt, the XP share's rule) and took part in the pull the
// kill fell in. Only those heroes roll the kill's drops (hunt-rewards.js personal loot), at 1 / (how many of them) of each row. When no
// living hero took part (every hero that struck fell and the monster died of what it left behind), the living heroes at the kill roll it:
// a kill always rolls its table, so a party never drops less than its heroes would apart, and never more.
//
// A PULL BEGINS at its `pull` event (pull-cycle.js startPull: the one door a fight begins by; a re-pull after a fall back is a new pull),
// and every hero's mark goes back to false there. A world that does not cycle (phase '') has no pulls: a mark holds from the hero's first
// act. A hero who joins mid-pull holds no mark until it acts.
//
// PERSISTED on each hero unit as `took` (world-state.js composes it), so a pull cut across settle windows reads the same marks however the
// windows were cut (world-step#split-parity), viewed or closed. No die is drawn here and nothing here pays: the mark is read off the
// swing's own events, in their order, by the rewards walk (hunt-rewards.js rewardSwing and calledSwing), so a kill at event i reads every
// act before it and none after. Coin, XP and the kill counters stay the living heroes' (unchanged).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { isHero, isMonster } from './sides.js';

/* took: this hero struck at a monster, or healed or shielded a hero, since the pull in force began (blank false; a monster's never set). */
export const PERSISTED = Object.freeze({ unit: Object.freeze([['took', 'bool']]), world: Object.freeze([]), pack: Object.freeze([]) });

/**
 * ONE EVENT OF THE SWING, IN ORDER: a `pull` clears every hero's mark; an act by a member hero marks it. `members` the swing's member heroes
 * by unit id (the rewards' map: only a member is ever marked), `unitOf(id)` the world's unit. Answers nothing; writes `took` on hero units.
 */
export function noteTookPart(ev, members, unitOf, world) {
  switch (ev.type) {
    case 'pull':
      for (const u of world.units) if (isHero(u) && u.took === true) u.took = false;
      return;
    case 'dmg':
    case 'miss':
      if (members.has(ev.u) && isMonster(unitOf(ev.t))) mark(unitOf(ev.u));
      return;
    case 'heal':
      if (members.has(ev.u) && ev.amount > 0 && ev.item === undefined && isHero(unitOf(ev.t))) mark(unitOf(ev.u));
      return;
    case 'shield':
      if (members.has(ev.u) && ev.amount > 0 && isHero(unitOf(ev.t))) mark(unitOf(ev.u));
      return;
    default:
  }
}

function mark(u) { if (isHero(u)) u.took = true; }

/** THE ROLLERS OF A KILL: of `ids` (the living heroes at it, in unit-id order) the ones that took part in its pull, or `ids` when none did. */
export function rollersOf(ids, unitOf) {
  const out = ids.filter((id) => { const u = unitOf(id); return !!u && u.took === true; });
  return out.length ? out : ids;
}
