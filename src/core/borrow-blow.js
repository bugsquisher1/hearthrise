// ============================================================
// src/core/borrow-blow.js — THE BLOW A BORROWED CAST READS (lane/bar-metrics, Systems 2026-11-22).
//
// docs/design/redesign/18-roads-review-design.md R4 and 18-roads-review.md §9 step 1: "A borrowed move reads a fixed reference
// blow (the native weapon's at the hero's Level), never the holder's." Under the spell rule (src/data/abilities.js) a cast is a
// share of its caster's own blow, so a move borrowed onto another weapon would scale on that weapon: a hammer's Greater Mend
// healed on a hammer's blow (MEASURED +49.9 steps at 0%, 18-roads-review-measured.md). Here a borrowed move reads the blow its
// NATIVE weapon lands at the hero's Level instead, whatever the hero holds.
//
// THE REFERENCE BLOW of discipline d at Level L (a wiki formula, the same combat.js rolls every swing is priced by):
//   the weapon   the native family's rung worn at Level L (src/data/abilities.js DISCIPLINES `weapon`, the family in
//                src/data/gear-tiers.js WEAPON_FAMILIES; the highest tier whose MATERIAL_TIERS level is at or under L that
//                the family makes), alone: no other gear, no Trait, no Temper, no jewelry
//   the skill    the reference hero's main skill at Level L (src/data/to-hit.js refHeroAt, the career every monster is written
//                against), in the weapon's own damage skill
//   blow         playerCombatRolls(neutral foe).maxHit of that hero: floor(skill x 0.35 + strength x 0.6 + 2)
// Fixed by the Level alone, so it can never be farmed with the holder's gear, skill or Temper; the power step (danger.js) still
// moves it at the blow, as it moves every hero blow on the Danger scale.
//
// THE SEAM. A hero's bar may hold moves of another discipline only through `borrowed` (src/core/hunt-spawn.js heroSetup: the
// server's list, which the Roads write; empty until they do). The settle writes `borrowBlows` { abilityId: blow } on its unit at
// every boundary from its Level then (combat-sim.js syncUnit, never persisted, like the gear values), and the one cast path
// reads it (src/core/hunt/abilities.js blowOf). A native move, or a hero with nothing borrowed, reads its own blow as always.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ABILITIES, DISCIPLINES } from '../data/abilities.js';
import { WEAPON_FAMILIES, MATERIAL_TIERS } from '../data/gear-tiers.js';
import { ITEMS } from '../data/items.js';
import { refHeroAt } from '../data/to-hit.js';
import { playerCombatRolls } from './combat.js';
import { loadoutOf } from './member.js';
import { skillXpForLevel } from './xp.js';

const NEUTRAL_FOE = Object.freeze({});
const FAMILY = new Map(WEAPON_FAMILIES.map((f) => [f.key, f]));

/** The item id of discipline `d`'s native weapon worn at Level `level`, or null (a discipline with no family, or none worn that low). */
function nativeWeaponAt(d, level) {
  const fam = DISCIPLINES[d] && FAMILY.get(DISCIPLINES[d].weapon);
  if (!fam) return null;
  let id = null;
  MATERIAL_TIERS.forEach((t, i) => { if (t.level <= level && fam.ids[i] && ITEMS[fam.ids[i]]) id = fam.ids[i]; });
  return id;
}

/* (discipline, Level) -> blow: a hero's Level moves a few times a day, so a settle asks the same few pairs; bounded. */
const MEMO = new Map();

/** THE REFERENCE BLOW of discipline `d` at Level `level` (the header's formula): a whole number, at least 1. */
function referenceBlow(d, level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  const key = d + ':' + L;
  const hit = MEMO.get(key);
  if (hit !== undefined) return hit;
  const weapon = nativeWeaponAt(d, L);
  const equipment = weapon ? { weapon } : {};
  const lo = loadoutOf(equipment, ITEMS);
  /* a discipline with no weapon row reads its own skill (DISCIPLINES `skill`) */
  const skill = weapon ? lo.profile.damageSkill : (DISCIPLINES[d] && DISCIPLINES[d].skill) || 'melee';
  const skills = { [skill]: skillXpForLevel(skill, Math.max(1, Math.round(refHeroAt(L).main))) };
  const roll = playerCombatRolls(NEUTRAL_FOE, { eq: lo.eq, setBonus: lo.setBonus, profile: lo.profile, equipment, items: ITEMS, skills });
  const blow = Math.max(1, Math.floor(roll.maxHit));
  if (MEMO.size < 4096) MEMO.set(key, blow);
  return blow;
}

/**
 * THE BLOWS A HERO'S BORROWED MOVES READ at Level `level`: { abilityId: referenceBlow(its native discipline, level) } for each id of
 * `borrowed` that names an ability row with a discipline (a universal row, Mend, is every weapon's and is never borrowed), or null with
 * none. The native discipline is the row's first (Flame Strike: the tank's blade).
 */
export function borrowBlowsOf(borrowed, level) {
  if (!Array.isArray(borrowed) || !borrowed.length) return null;
  const out = {};
  for (const id of borrowed) {
    const row = typeof id === 'string' && Object.prototype.hasOwnProperty.call(ABILITIES, id) ? ABILITIES[id] : null;
    if (!row || row.universal) continue;
    out[id] = referenceBlow(row.disciplines[0], level);
  }
  return Object.keys(out).length ? out : null;
}
