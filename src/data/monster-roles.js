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
//               spread   the front-row hero the fewest monsters are on (ties: the nearest, then the lower id): a second front hero
//                        shares a swarm, a lone front takes it all (02 package 4: only Shooters, Casters and Stalkers reach the back)
//             Only heroes standing inside the monster's pack area count (the shooter's rule, so nothing is led off its leash). With no
//             hero to match it aims as before: a shooter at the farthest hero, anything else at the hero the pull leader names.
//             While it is not held it keeps to its reach (monster-roles.js reaimOf): a hero it wanted that walks into its area later, or
//             the end of a Challenge's hold, turns it back (a swarm keeps whom it was given).
//   heldPm    WHAT A CHALLENGE BUYS: a tank's Challenge takes every role (targeting.js challengeFrom), and holds it this share of the
//             hold (absent: all of it, so a tank that keeps challenging keeps it). A stalker at 500 breaks off halfway and dives again
//             until the next Challenge, so a tank answers it in part and the back row's armor and the healer do the rest.
//   range     HOW IT HITS, from where: whole tiles it shoots from (0 = beside its target). A monster row's own `range` wins
//             (monsters.js monsterRangeOf); a role's range plays only on a row with none. Inside MONSTER_RANGE.
//   splash    and on whom: a blow that also lands on every other hero within `splash.r` tiles of its target (Chebyshev) at `splash.pm`
//             permille of the blow, each its own roll against that hero (damage.js resolveAttacks). Absent: one target.
//   maxHitPm    and how hard: its largest blow is this share of its row's at the step (absent: all of it). A role that reaches the back
//             row is sized against the back row: a Wight's full blow, written for a front in heavy armor, took a medium-armored bow
//             from over the Steady line to dead in one blow (4 deaths in 32 Steady days, every one a Wight on the bow; RD-Q3 a: Careful
//             and Steady never die). At step 580 a Wight's largest blow is 386 against a Level 60 back-row hero's 740 HP; at 500 permille
//             one death was left in 32 days, so a stalker lands 400 (MEASURED: tools/balance-program/redesign/w2/summary.txt). The rule
//             under it: a single blow at the back row must stay under the Steady line's 25%.
//   targets, answer  the tooltip labels ("Targets: front row", "Countered by: shields, armor"): short genre labels, never sentences
//             (Tyler's voice rule for text outside lore). The engine never reads them.
// tests/hunt-core/monster-roles.mjs `data` holds every row to these rules (a reach the engine plays, a range inside MONSTER_RANGE, a
// splash of r >= 1 and pm 1..1000, both labels) and every monster row's `role` to a row here.
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

/* The two rows, front first. */
export const ROWS = Object.freeze(['front', 'back']);

export const MONSTER_ROLES = Object.freeze({
  brute: Object.freeze({ name: 'Brute', reach: 'front', range: 0, targets: 'Targets: front row', answer: 'Countered by: shields, armor' }),
  shooter: Object.freeze({ name: 'Shooter', reach: 'back', range: 5, targets: 'Targets: back row (ranged)', answer: 'Countered by: Challenge, back-row armor' }),
  caster: Object.freeze({ name: 'Caster', reach: 'back', range: 4, splash: Object.freeze({ r: 1, pm: 500 }),
    targets: 'Targets: back row (ranged, area)', answer: 'Countered by: focus fire, healing' }),
  swarm: Object.freeze({ name: 'Swarm', reach: 'spread', range: 0, targets: 'Targets: front row (spreads out)', answer: 'Countered by: area damage, armor' }),
  stalker: Object.freeze({ name: 'Stalker', reach: 'weakest', range: 0, heldPm: 500, maxHitPm: 400, targets: 'Targets: lowest max health', answer: 'Countered by: Challenge, healing' }),
  /* its shield or its heal is its own spell row (monster-spells.js `mend`); the role says only whom it fights */
  warder: Object.freeze({ name: 'Warder', reach: 'front', range: 0, targets: 'Targets: front row', answer: 'Countered by: focus fire' }),
});
