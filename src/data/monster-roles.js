// ════════════════════════════════════════════════════════════════════════
// src/data/monster-roles.js — MONSTER ROLES AND THE PARTY'S TWO ROWS (wave 2, lane/w2-roles-rows).
//
// docs/design/redesign/02-architecture.md packages 3 and 4, 04-math-strategy.md section 6: "Six monster roles. Brute hits the front.
// Shooter picks the back row. Caster hits an area. Swarm comes in numbers. Stalker dives the weakest hero. Warder shields or heals its
// side. A ground is a mix of roles, and the mix is the question the ground asks", and "Up to four heroes in a hunt, in two rows. Front
// and back are set in the plan. Brutes go for the front. Shooters, Casters and Stalkers reach the back."
//
// A ROLE IS A ROW, never a number for one monster: a monster row names its role (`role: 'brute'`, in its ground's pack) and the engine
// reads the row here (src/core/hunt/monster-roles.js). A role's row says three things:
//   reach     WHO IT AIMS AT, read where every monster picks a target (when its pack is pulled, when its target falls, when its pack is in
//             the fight and it holds none: shooters.js aimOf, the one door):
//               front    the nearest hero in the front row
//               back     the farthest hero in the back row (a shooter's old rule, kept to the back row)
//               weakest  the hero with the least max HP (ties: the least HP now, then the lower id)
//               spread   the hero the fewest monsters are on (ties: the front row first, then the nearest, then the lower id)
//             Only heroes standing inside the monster's pack area count (the shooter's rule, so nothing is led off its leash). With no
//             hero to match it aims as before: a shooter at the farthest hero, anything else at the hero the pull leader names.
//             A tank's Challenge still takes every role (targeting.js challengeFrom): that is the front's answer to a reach.
//   range     HOW IT HITS, from where: whole tiles it shoots from (0 = beside its target). A monster row's own `range` wins
//             (monsters.js monsterRangeOf); a role's range plays only on a row with none. Inside MONSTER_RANGE.
//   splash    and on whom: a blow that also lands on every other hero within `splash.r` tiles of its target (Chebyshev) at `splash.pm`
//             permille of the blow, each its own roll against that hero (damage.js resolveAttacks). Absent: one target.
//   answer    what beats it, in words (the bestiary's and the hunt report's line when they read it); the engine never reads it.
//
// THE TWO ROWS: a hero stands in the front row or the back row. The plan sets it (the hero's `row` setting, 'front' or 'back',
// hunt-spawn.js heroSetup); with none set, a hero that fights beside its target (hunt-roles.js `melee`) is in the front and every other in
// the back. A row moves nobody: it is who a monster's reach takes, nothing else.
//
// ONLY ON THE DANGER SCALE (src/core/hunt/danger.js dangerOn). A tier hunt plays exactly as before: no reach, no role range, no splash,
// so every tier pin holds (tests/hunt-core/engine-parity.mjs). Roles are part of the scale's redesign, not a patch on the tiers.
//
// THE SAMPLE (CLAUDE.md section 10: about five before a batch; 12-targets.md section 5 row 2): Muster Barrows' four bodies (Pikeman
// swarm, Wight stalker, Knight brute, Captain Hask brute) and Krell's Hold's Lookout (shooter), which already shot from 5 tiles. Caster and
// Warder have rows and no body yet: the next batch gives them one each (the Pyre Field's and Krell's Hold's casters and the Pyre Priest).
// Every number below is a lever row (tools/balance-program/levers/world.mjs `roles.*`), MEASURED on the real engine before it shipped
// (tools/balance-program/redesign/w2/summary.txt).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* The reaches a role may name, the one list (the engine's switch and the audit below read it). */
export const REACHES = Object.freeze(['front', 'back', 'weakest', 'spread']);

/* The two rows, front first. */
export const ROWS = Object.freeze(['front', 'back']);

export const MONSTER_ROLES = Object.freeze({
  brute: Object.freeze({ name: 'Brute', reach: 'front', range: 0, answer: 'Armor and a shield in the front row' }),
  shooter: Object.freeze({ name: 'Shooter', reach: 'back', range: 5, answer: 'A Challenge turns it, and armor in the back row' }),
  caster: Object.freeze({ name: 'Caster', reach: 'back', range: 4, splash: Object.freeze({ r: 1, pm: 500 }),
    answer: 'Kill it first, and a healer for the back row' }),
  swarm: Object.freeze({ name: 'Swarm', reach: 'spread', range: 0, answer: 'Blows that hit a crowd, and armor on every hero' }),
  stalker: Object.freeze({ name: 'Stalker', reach: 'weakest', range: 0, answer: 'A Challenge turns it, and a healer' }),
  /* its shield or its heal is its own spell row (monster-spells.js `mend`); the role says only whom it fights */
  warder: Object.freeze({ name: 'Warder', reach: 'front', range: 0, answer: 'Kill it first' }),
});

/** Every problem with the role table and with the `role` a monster row names, as strings (empty = valid). `range` is held to
    `rangeBounds` ({ min, max }: monsters.js MONSTER_RANGE), passed in so this file imports nothing. */
export function monsterRoleProblems(monsters, rangeBounds) {
  const out = [];
  for (const [id, r] of Object.entries(MONSTER_ROLES)) {
    if (!REACHES.includes(r.reach)) out.push('role ' + id + ' reach must be one of ' + REACHES.join(', ') + ', got ' + r.reach);
    if (!(Number.isInteger(r.range) && (r.range === 0 || (r.range >= rangeBounds.min && r.range <= rangeBounds.max)))) {
      out.push('role ' + id + ' range must be 0 or a whole number ' + rangeBounds.min + '..' + rangeBounds.max + ', got ' + r.range);
    }
    if (r.splash !== undefined && !(Number.isInteger(r.splash.r) && r.splash.r >= 1 && Number.isInteger(r.splash.pm) && r.splash.pm > 0 && r.splash.pm <= 1000)) {
      out.push('role ' + id + ' splash must be { r >= 1, pm 1..1000 }');
    }
    if (typeof r.answer !== 'string' || !r.answer) out.push('role ' + id + ' says nothing of what answers it');
  }
  for (const [id, m] of Object.entries(monsters || {})) {
    if (m && m.role !== undefined && !Object.prototype.hasOwnProperty.call(MONSTER_ROLES, m.role)) out.push('monster ' + id + ' names no role row: ' + m.role);
  }
  return out;
}
