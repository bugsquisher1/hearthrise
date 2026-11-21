// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/knobs.mjs — THE GLOBAL COEFFICIENTS THE BALANCE MATRIX AND THE LAB TURN (40-formula-brief.md sections 5-7,
// lane/c-balance-matrix, 2026-11-21). ONE FILE ON PURPOSE: the formula audit (lanes d-formulas-*, then 44-formula-architecture.md)
// replaces this list with the audited knob set; nothing else in the matrix, the diff or the lab names a coefficient.
//
// WHAT A KNOB IS. A multiplier (1 = today) on numbers the GAME ITSELF reads, at the places they are written. Each `site` picks
// lines of a file in src/ by a substring (`line`, exactly `count` lines, 1 by default) and, on each, the number after every `nums`
// prefix (a regular expression's source; it must match exactly once on the line; `{ all: true }` takes every number on the line).
// A number written whole stays whole (rounded), unless its pick says `float`. The knob never edits the tree: the matrix's --diff
// and --sweep write the scaled numbers into a SCRATCH COPY (matrix-scratch.mjs), and the lab's bundle reads them at start
// (tools/balance-lab/build.mjs). The file:line each knob lives on is found at run time (matrix-scratch.mjs locateKnob), so it
// never goes stale; `node tools/balance-program/balance-matrix.mjs --knobs` prints them.
//
// `regen`: the monster rows are WRITTEN from this number (src/data/balance-sheet.js STAT_FORMULA -> tools/gen-ground-stats.mjs
// --write -> src/data/monsters.js and the ground packs), so the scratch copy re-writes them, as a designer's change would be.
// `steps`: the five settings a sweep plays (Tyler's sketch: 0.75x to 1.25x, 1.00x today), narrower where the number is a chance
// or a permille that must stay whole or inside its rails.
//
// TODAY'S LIST (2026-11-21) is every global coefficient the hunt engine reads that the matrix can move on its own. LEFT OUT, with why:
//   SKILL_CURVE (core-model.js): the matrix holds each hero's skills on the measured career line (tools/balance-sim/skill-lines.json),
//     so the curve moves no cell; it belongs to a career run.  COMBAT_BALANCE.strengthLevelScale / strengthBonusScale /
//     playerBaseMaxHit (combat.js): the wiki reads them, the blow does not (the blow's line writes 0.35, 0.6 and 2 again: a
//     duplicate for the formula audit); playerAttack turns the line the engine runs.  The tier pulls, the rails of to-hit and
//     the crit cap: kept out until the audit names them.
//
// PURE ESM. Data only. Imports nothing (the lab bundles it).
// ════════════════════════════════════════════════════════════════════════

const WIDE = Object.freeze([0.75, 0.875, 1, 1.125, 1.25]);
const NARROW = Object.freeze([0.9, 0.95, 1, 1.05, 1.1]);
const f = (o) => Object.freeze({ count: 1, ...o, nums: Object.freeze(o.nums) });

export const KNOB_SCHEMA = 'hearthrise.balance-knobs/1';

export const KNOBS = Object.freeze([
  /* ── the heroes' side of a fight ── */
  Object.freeze({ id: 'playerAttack', label: 'Player attack', group: 'Player combat',
    what: 'The hero\'s blow: every basic hit, and every spell, heal and shield that is a share of the blow (abilities.js castAmount)',
    sites: Object.freeze([f({ file: 'src/core/combat.js', line: 'let maxHit = Math.floor((dmgLvl * ', nums: ['dmgLvl \\* ', 'strBonus \\* ', { at: '\\) \\+ ', float: true }] })]),
    steps: WIDE }),
  Object.freeze({ id: 'critMult', label: 'Critical hit size', group: 'Player combat', what: 'A critical basic blow\'s multiple (COMBAT_BALANCE.critMult)',
    sites: Object.freeze([f({ file: 'src/core/combat.js', line: 'critMult: ', nums: ['critMult: '] })]), steps: WIDE }),
  Object.freeze({ id: 'weaknessDamage', label: 'Weakness bonus', group: 'Player combat', what: 'The damage multiple a weapon a monster is weak to lands (WEAKNESS_BONUS.damage)',
    sites: Object.freeze([f({ file: 'src/core/combat.js', line: 'export const WEAKNESS_BONUS = ', nums: ['damage: '] })]), steps: NARROW }),
  Object.freeze({ id: 'heroAccuracy', label: 'Player to-hit', group: 'Player combat', what: 'The reference hero\'s chance to land on a same-Level regular, written on every monster as its evasion (STAT_FORMULA.heroHit)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  heroHit: ', nums: ['heroHit: '] })]), regen: true, steps: Object.freeze([0.85, 0.925, 1, 1.05, 1.1]) }),

  /* ── the monsters (the stat formula: every formula row, boss and placeholder follows) ── */
  Object.freeze({ id: 'monsterDamage', label: 'Monster damage', group: 'Monsters', what: 'A regular\'s largest blow as a share of a same-Level hero\'s HP, and the gentle grounds\' cap (STAT_FORMULA.blow)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  blow: Object.freeze({ lo: ', nums: ['lo: ', 'hi: ', 'gentleCap: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'monsterHp', label: 'Monster HP', group: 'Monsters', what: 'A regular\'s HP line, base and a Level (STAT_FORMULA.hp); coin a kill follows HP',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  hp: Object.freeze({ base: ', nums: ['base: ', 'perLevel: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'monsterAccuracy', label: 'Monster to-hit', group: 'Monsters', what: 'A regular\'s chance to land on the reference hero, gentle and full grounds (STAT_FORMULA.hit)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  hit: Object.freeze({ lo: ', nums: ['lo: ', 'hi: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'monsterDefense', label: 'Monster defense', group: 'Monsters', what: 'The points a regular\'s defense takes off every blow it is dealt, a Level (STAT_FORMULA.def)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  def: Object.freeze({ perLevel: ', nums: ['perLevel: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'tierDanger', label: 'Harder-tier blows', group: 'Monsters', what: 'Dangerous and Deadly blows, permille of Normal (TIER_DIALS dmgPm)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  dangerous: Object.freeze({ pull: ', nums: ['dmgPm: '] }),
      f({ file: 'src/data/balance-sheet.js', line: '  deadly: Object.freeze({ pull: ', nums: ['dmgPm: '] })]), steps: NARROW }),

  /* ── staying alive ── */
  Object.freeze({ id: 'heroHp', label: 'Hero HP', group: 'Survival', what: 'A hero\'s HP, base and a Level (VITALS). The monsters\' blows are a share of it (STAT_FORMULA.refHp), so they follow',
    sites: Object.freeze([f({ file: 'src/data/core-model.js', line: '  hpBase: ', nums: ['hpBase: '] }), f({ file: 'src/data/core-model.js', line: '  hpPerLevel: ', nums: ['hpPerLevel: '] })]),
    regen: true, steps: WIDE }),
  Object.freeze({ id: 'armorMitigation', label: 'Armor mitigation', group: 'Survival', what: 'The most dodge and absorb armor can reach, and ward a point (ARMOUR_MITIGATION); the total cap is its own knob',
    sites: Object.freeze([f({ file: 'src/data/core-model.js', line: '  dodge: Object.freeze({ maxPm: ', nums: ['maxPm: '] }),
      f({ file: 'src/data/core-model.js', line: '  absorb: Object.freeze({ maxPm: ', nums: ['maxPm: '] }),
      f({ file: 'src/data/core-model.js', line: '  ward: Object.freeze({ perPointPm: ', nums: ['perPointPm: '] })]), steps: WIDE }),
  Object.freeze({ id: 'mitigationCap', label: 'Mitigation cap', group: 'Survival', what: 'Dodge, absorb and ward together never take more than this share (ARMOUR_MITIGATION.capPm)',
    sites: Object.freeze([f({ file: 'src/data/core-model.js', line: '  capPm: ', nums: ['capPm: '] })]), steps: WIDE }),
  Object.freeze({ id: 'regen', label: 'Regeneration', group: 'Survival', what: 'HP back a second, in a fight and between fights (VITALS.inFightRegenPermillePerS, HUNT_TUNING.oocRegenPermillePerS)',
    sites: Object.freeze([f({ file: 'src/data/core-model.js', line: '  inFightRegenPermillePerS: ', nums: [{ at: 'inFightRegenPermillePerS: ', float: true }] }),
      f({ file: 'src/data/hunt-tuning.js', line: '  oocRegenPermillePerS: ', nums: ['oocRegenPermillePerS: '] })]), steps: WIDE }),

  /* ── what a hunt pays ── */
  Object.freeze({ id: 'xpPerKill', label: 'XP a kill', group: 'Rewards', what: 'Level XP a monster HP point pays, and its floor (STAT_FORMULA.xp a and min)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  xp: Object.freeze({ a: ', nums: ['a: ', 'min: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'coinPerKill', label: 'Coin a kill', group: 'Rewards', what: 'Gold a monster HP point pays (STAT_FORMULA.gp.perHp)',
    sites: Object.freeze([f({ file: 'src/data/balance-sheet.js', line: '  gp: Object.freeze({ perHp: ', nums: ['perHp: '] })]), regen: true, steps: WIDE }),
  Object.freeze({ id: 'soloXp', label: 'Solo XP bonus', group: 'Parties', what: 'A lone hero\'s Level XP, permille (SOLO_XP_PM, 1150 = +15%)',
    sites: Object.freeze([f({ file: 'src/data/party-class-xp.js', line: 'export const SOLO_XP_PM = ', nums: ['SOLO_XP_PM = '] })]), steps: NARROW }),
  Object.freeze({ id: 'partyXp', label: 'Party XP table', group: 'Parties', what: 'Every cell of the one party table, permille on the even share (PARTY_CLASS_XP)',
    sites: Object.freeze([f({ file: 'src/data/party-class-xp.js', line: 'export const PARTY_CLASS_XP = row(', nums: [{ all: true }] })]), steps: NARROW }),

  /* ── progression ── */
  Object.freeze({ id: 'levelCurve', label: 'Level XP curve', group: 'Progression', what: 'The Level XP every Level costs (LEVEL_CURVE first and every bracket\'s rise); death costs a share of it',
    sites: Object.freeze([f({ file: 'src/data/core-model.js', line: '  first: ', nums: ['first: '] }), f({ file: 'src/data/core-model.js', line: ', rise: ', nums: ['rise: '], count: 16 })]), steps: WIDE }),
  Object.freeze({ id: 'deathLoss', label: 'Death cost', group: 'Progression', what: 'The share of a hero\'s Level XP and combat-skill progress a death takes (DEATH_XP_LOSS, whole permilles)',
    sites: Object.freeze([f({ file: 'src/data/hunt-sessions.js', line: 'export const DEATH_XP_LOSS = ', nums: [{ at: 'DEATH_XP_LOSS = ', float: true }] })]),
    steps: Object.freeze([0.5, 0.75, 1, 1.25, 1.5]) }),
]);

export const KNOB_IDS = Object.freeze(KNOBS.map((k) => k.id));
export const knobById = (id) => KNOBS.find((k) => k.id === id) || null;
/* The five headings of Tyler's sketch, each the weapon ways (tools/balance-sim/styles.mjs) it holds. Fist: the hidden two-row sample
   (src/data/fists.js FIST_LINE.live false) has no way in the engine's style list yet, so the row says so. */
export const STYLE_GROUPS = Object.freeze({
  Melee: Object.freeze(['tank', 'sword', 'hammer', 'axes']), Ranged: Object.freeze(['bow', 'crossbow']), Destruction: Object.freeze(['mage']),
  Restoration: Object.freeze(['healer']), Fist: Object.freeze([]),
});
