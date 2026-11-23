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
// swarm, Wight stalker, Knight brute, Captain Hask brute) and Krell's Hold's Lookout (shooter), which already shot from 5 tiles.
// THE SECOND BATCH (lane/monster-roles-ford-wings, 2026-11-23; 20-v030 C2): every monster on the scale's other grounds, each read from its
// own row's words. Hask's Ford: Banded Pikeman swarm, Fordsunk brute, Ledger Wight CASTER (the first Caster on an open ground), Bannerman
// WARDER (the first Warder body). The Catacomb wings: Shrouded Pauper swarm, Vault Leech stalker, Bone Wall brute, Night Carter and Keeper
// Dunn casters (their own Lime Sack and Snuff the Candles are the wind-ups). Krell's Hold's and the Pyre Field's bodies are the next batch.
// Every number below is a lever row (tools/balance-program/levers/world.mjs `roles.*`), MEASURED on the real engine before it shipped
// (tools/balance-program/redesign/w2/summary.txt).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* The two rows, front first. */
export const ROWS = Object.freeze(['front', 'back']);

/* ── THE ROLE'S POWER DIALS (lane/monster-formula, 04-math-strategy.md section 6, 02 package 3) ─────────────────────────────────
   A monster on a formula ground (src/data/danger.js DANGER_GROUNDS `monsters: 'formula'`) is its role and the step: its health, its blows
   and its wind-ups are DERIVED from these rows and the reference company (MONSTER_FORMULA below) by src/core/hunt/monster-formula.js, never
   typed on the monster. Its name, art, class, weapon answers, drops, coin and XP stay its own row's (content). Every dial is read at a gap of
   0 (the ground's reference company on the ground's reference step) and the step grows them from there exactly as it grows any row.
     secondsToKill  seconds the reference company, all four on it, takes to kill one: its health = this x the company's damage a second
     pressure       the share of its target's reference health it deals a second while it fights (steady blows and wind-ups together)
     windupShare    the share of that pressure that comes as wind-ups a bar can answer (an interrupt, a step off a mark, a shell); the
                    rest is steady blows. Steady pressure sets the supply bill, wind-ups set the death risk (04 section 6)
     windupSize     how big ONE wind-up is: a share of the target's reference health (mean hit). Its frequency follows:
                    one wind-up every windupSize / (windupShare x pressure) seconds. Big and rare kills, small and often bleeds
     windup         the wind-up's shape and warning (a monster-spells.js row without its number and cooldown, which the formula writes)
     armor          the share of a hero's blow its armor takes off (after the blow's element and the row's own defense): what an armor
                    answer (Armor Break, a hammer) works on. Its health is written net of it, so secondsToKill holds at any armor
     mend           a Warder's heal on its own side: `seconds` of the reference company's damage undone a mend, every `everyS` seconds
   Starting values are the Lab's (tools/balance-program/redesign/mf, lane/monster-formula); bands in tools/balance-program/levers/world.mjs
   `mf.*`. A tier ground never reads them. */
const windup = (row) => Object.freeze({ ...row, element: row.element === undefined ? null : row.element });

export const MONSTER_ROLES = Object.freeze({
  brute: Object.freeze({ name: 'Brute', reach: 'front', range: 0, targets: 'Targets: front row', answer: 'Countered by: shields, armor',
    armor: 0.5, secondsToKill: 6, pressure: 0.03, windupShare: 0.28, windupSize: 0.13,
    windup: windup({ n: 'Heavy Blow', shape: 'cone', len: 2, range: 1, windupMs: 1600 }) }),
  shooter: Object.freeze({ name: 'Shooter', reach: 'back', range: 5, targets: 'Targets: back row (ranged)', answer: 'Countered by: Challenge, back-row armor',
    armor: 0.05, secondsToKill: 3.5, pressure: 0.012, windupShare: 0, windupSize: 0 }),
  caster: Object.freeze({ name: 'Caster', reach: 'back', range: 4, splash: Object.freeze({ r: 1, pm: 500 }),
    targets: 'Targets: back row (ranged, area)', answer: 'Countered by: focus fire, healing',
    armor: 0.05, secondsToKill: 3.5, pressure: 0.02, windupShare: 0.6, windupSize: 0.11,
    windup: windup({ n: 'Hex', shape: 'group', range: 6, windupMs: 2000 }) }),
  swarm: Object.freeze({ name: 'Swarm', reach: 'spread', range: 0, targets: 'Targets: front row (spreads out)', answer: 'Countered by: area damage, armor',
    armor: 0.1, secondsToKill: 2.5, pressure: 0.024, windupShare: 0, windupSize: 0 }),
  stalker: Object.freeze({ name: 'Stalker', reach: 'weakest', range: 0, heldPm: 500, maxHitPm: 400, targets: 'Targets: lowest max health', answer: 'Countered by: Challenge, healing',
    armor: 0.05, secondsToKill: 3.5, pressure: 0.011, windupShare: 0, windupSize: 0 }),
  /* its shield or its heal is its own spell row (monster-spells.js `mend`); the role says only whom it fights. On a formula ground its heal is
     the formula's (`mend`) */
  warder: Object.freeze({ name: 'Warder', reach: 'front', range: 0, targets: 'Targets: front row', answer: 'Countered by: focus fire',
    armor: 0.35, secondsToKill: 5, pressure: 0.014, windupShare: 0, windupSize: 0,
    mend: Object.freeze({ seconds: 1.2, everyS: 8, spell: windup({ n: 'Rally', shape: 'mend', range: 4, windupMs: 1600 }) }) }),
});

/* THE SPELL A ROLE CASTS ON A FORMULA GROUND when its monster's row names none (src/core/hunt/monster-formula.js roleStats): its wind-up is
   `mf_<role>`, its mend `mf_<role>_mend`, each the role row's shape and name (the view writes the name: src/render/source-names.js). */
export const roleSpellId = (roleId, mend) => 'mf_' + roleId + (mend ? '_mend' : '');
/** The role row's wind-up or mend a derived spell id names (its `n`, shape and warning), or null. */
export function roleSpellRow(id) {
  for (const [roleId, row] of Object.entries(MONSTER_ROLES)) {
    /** @type {any} */ const R = row;
    if (R.windup && id === roleSpellId(roleId)) return R.windup;
    if (R.mend && id === roleSpellId(roleId, true)) return R.mend.spell;
  }
  return null;
}

/* ── THE FORMULA'S GLOBAL DIALS AND ITS REFERENCE (lane/monster-formula; 04 sections 6 and 8) ──────────────────────────────────────
   encounterPerHero  monsters a pull brings for each hero at a gap of 0 (04 section 8: "an encounter grows with the party", so a lone hero
                     and a four have the same time budget); past the reference step the pull grows by DANGER.pullStep to DANGER.pullMax
   encounters        by encounter type: `pull` (a pack) and `boss` (a row with `boss: true`). killMult x its role's secondsToKill.
                     A boss's RAMP (04 section 6 rampPerMinute) is its kind's, one home for every boss: src/data/bosses.js BOSS_KINDS,
                     read by boss-phases.js swingRow on the boss's own fight clock
   windupScale       the two death-risk dials on every wind-up at once: `size` x each wind-up's hit, `every` x the time between them
   blowCap           no steady blow's top lands over this share of its target's reference health after its armor (maxHitPm's reason:
                     one blow at the back row stays under the Steady line). A role whose pressure would need a bigger blow is held at the
                     cap and deals less than its dial: monster-formula.js roleStats reports the share let through (steadyShare)
   REF               THE REFERENCE COMPANY a ground is anchored on (04 section 1): four heroes at the ground's refLevel (DANGER_GROUNDS), MID
                     kits, on Steady at the ground's refStep.
                       hit       a monster's to-hit on the reference hero of that Level (to-hit.js aimFor), its `aim`
                       heroHit   the reference hero's to-hit on it (to-hit.js evasionFor), its `evasion`
                       defPerLevel  its defense, x the Level (balance-sheet.js STAT_FORMULA's regular's)
                       takePm    the share of a landed blow's roll that reaches the reference target after its armor chain (MEASURED)
                       dps       [Level, damage a hunted second a head] of the reference company (MEASURED on the real engine), read
                                 straight between rows, held past the ends; divided by fightShare it is the company's damage a FIGHTING
                                 second (04 section 8: the reference fight share)
                       fightShare  the share of the reference company's hunted time spent fighting (04 section 8's starting 0.6) */
export const MONSTER_FORMULA = Object.freeze({
  encounterPerHero: 2,
  encounters: Object.freeze({
    pull: Object.freeze({ killMult: 1 }),
    boss: Object.freeze({ killMult: 8 }),
  }),
  windupScale: Object.freeze({ size: 1, every: 1 }),
  blowCap: 0.2,
  REF: Object.freeze({
    hit: 0.7, heroHit: 0.85, defPerLevel: 0.08, takePm: 450, fightShare: 0.6,
    dps: Object.freeze([[52, 14.1], [60, 27], [175, 26]].map((r) => Object.freeze(r))),
  }),
});
