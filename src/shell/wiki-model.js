// ════════════════════════════════════════════════════════════════════════
// src/shell/wiki-model.js — THE WIKI'S PAGES, GENERATED FROM THE DATA AND THE ENGINE (work ledger item 9).
//
// Tyler: an in-game wiki with public formulas, rendered from data, never hand-written pages that drift. PURE, no
// DOM: src/shell/windows/wiki.js only writes what this answers, and this types no game number of its own.
//   skills    one page per src/data/skills.js row, plus the Level: what trains it and what it is for
//             (src/data/skill-guide.js, the Skills window's own rows), its cap, and the XP to reach a few Levels
//             (src/core/xp.js, the curves the server is generated from)
//   grounds   one page per open ground (src/data/hunt-grounds.js OPEN_GROUNDS, named by src/data/hunts.js): its
//             Level band, its monsters and its Rares and materials with the chance per kill, read through
//             src/shell/hunt-ground-facts.js, the same reads the Hunts window draws
//   formulas  the hit, damage, XP and death rules. Each states its constants (`terms`, read from the engine's
//             tables) and works one example by CALLING the engine's own function (`example.result`), so the page
//             can never say one thing while a hunt does another: tests/wiki-window.mjs recomputes every example
//             from the stated terms and goes red when they disagree.
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts and arithmetic, nothing a player can spend, no intent, no residue.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF, COMBAT_SKILLS } from '../data/skills.js?v=0.2.129';
import { SKILL_GUIDE } from '../data/skill-guide.js?v=0.2.129';
import { SKILL_CURVE } from '../data/core-model.js?v=0.2.129';
import { MONSTERS } from '../data/monsters.js?v=0.2.129';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.129';
import { OPEN_GROUNDS } from '../data/hunt-grounds.js?v=0.2.129';
import { DEATH_XP_LOSS } from '../data/hunt-sessions.js?v=0.2.129';
import { BLESSING_CUT_PERMILLE } from '../data/blessings.js?v=0.2.129';
import { MAX_LEVEL, isCapped, skillXpForLevel, charXpForLevel, levelCurveRows } from '../core/xp.js?v=0.2.129';
import { COMBAT_BALANCE, WEAKNESS_BONUS, ACC_DEF_MUL, playerCombatRolls, monsterAccuracy, monsterMaxHit } from '../core/combat.js?v=0.2.129';
import { levelDeathLoss } from '../core/action-rules.js?v=0.2.129';
import { residentsOf, raresOf, materialsOf } from './hunt-ground-facts.js?v=0.2.129';

/* The Levels each curve's table shows: the first hours, then the long climb. A capped skill stops at its cap. */
const CURVE_LEVELS = Object.freeze([10, 25, 50, 99]);
const LEVEL_LEVELS = Object.freeze([10, 25, 50, 100]);
/* The worked examples' hero: weapon skill and Defense at this Level, no gear; a death at this Level's XP. */
const EXAMPLE_LEVEL = 10;
const DEATH_EXAMPLE_LEVEL = 20;
/* How many materials a ground's page names beside its Rares (the likeliest first). */
const MATERIALS_SHOWN = 3;

const curveOf = (levels, xpAt) => levels.map((level) => ({ level, xp: xpAt(level) }));

/** The Skills section: the Level first (it is not a skill, but it is what a player climbs), then every skill row. */
export function skillPages() {
  const level = { id: 'level', kind: 'level', name: null, trains: null, feeds: null, cap: null,
    curve: curveOf(LEVEL_LEVELS, charXpForLevel) };
  const skills = Object.keys(SKILLS_DEF).map((id) => {
    const g = SKILL_GUIDE[id] || {};
    const cap = isCapped(id) ? MAX_LEVEL : null;
    return { id, kind: 'skill', name: SKILLS_DEF[id].name, glyph: g.glyph || null, trains: g.where || '', feeds: g.use || '', cap,
      curve: curveOf(CURVE_LEVELS.filter((l) => cap === null || l <= cap), (l) => skillXpForLevel(id, l)) };
  });
  return [level, ...skills];
}

/* Open grounds, lowest floor first: the order a hero meets them. */
function groundsInOrder() {
  return Object.values(OPEN_GROUNDS).map((g) => ({ g, row: HUNT_INDEX[g.hunt] || {} }))
    .sort((a, b) => ((a.row.band || [0])[0] - (b.row.band || [0])[0]) || (a.g.hunt < b.g.hunt ? -1 : 1));
}

/** The Hunting grounds section: [{ id, name, theme, band, monsters: [{ id, name, level, boss }], drops: [{ id, name, from, chance }] }]. */
export function groundPages() {
  return groundsInOrder().map(({ g, row }) => {
    const rares = raresOf(g.hunt).map((r) => ({ id: r.id, name: r.name, from: r.carrier.name, chance: r.chance }));
    const mats = materialsOf(g.hunt).slice(0, MATERIALS_SHOWN).map((m) => ({ id: m.id, name: m.name, from: null, chance: m.chance }));
    return { id: g.hunt, name: row.name || g.hunt, theme: row.theme || '', band: row.band || null,
      monsters: residentsOf(g.hunt).map((m) => ({ id: m.id, name: m.name, level: m.level, boss: m.boss })),
      drops: rares.concat(mats) };
  });
}

/** The worked examples' monster: the first creature a hero meets (lowest ground first) that has some defense and the common
    starting chance to hit, so every term of every example counts; else the first with that common chance; never a boss. */
function exampleMonster() {
  const met = groundsInOrder().flatMap(({ g }) => residentsOf(g.hunt)).filter((m) => !m.boss && MONSTERS[m.id]);
  const pick = met.find((m) => (MONSTERS[m.id].def || 0) > 0 && !Number.isFinite(MONSTERS[m.id].baseAcc))
    || met.find((m) => !Number.isFinite(MONSTERS[m.id].baseAcc)) || met[0];
  return pick ? Object.assign({ id: pick.id }, MONSTERS[pick.id]) : null;
}

const B = COMBAT_BALANCE;

/**
 * The Formulas section: [{ id, terms, example: { inputs, result } }]. `terms` are the constants the words state, read from
 * the engine's tables; `result` is the engine's own function called on `inputs`. The page writes both; the guard recomputes.
 */
export function formulaPages() {
  const mon = exampleMonster();
  const L = EXAMPLE_LEVEL;
  const skills = { melee: skillXpForLevel('melee', L), defense: skillXpForLevel('defense', L) };
  const rolls = playerCombatRolls(mon, { skills, equipment: {}, items: {} });
  const defScore = (mon.def || 0) * (ACC_DEF_MUL[mon.tier || 1] || 1);
  const scale = B.monsterDamageScaleByTier[mon.tier] || B.monsterAttackDamageScale;
  const deathXp = charXpForLevel(DEATH_EXAMPLE_LEVEL);
  const oneCut = BLESSING_CUT_PERMILLE[0];
  return [
    { id: 'hit',
      terms: { base: B.playerBaseAccuracy, per: B.playerAccuracyPerPoint, min: B.playerMinAccuracy, max: B.playerMaxAccuracy,
        weak: WEAKNESS_BONUS.accuracy, defMul: ACC_DEF_MUL },
      example: { inputs: { level: L, accuracy: 0, def: mon.def || 0, tier: mon.tier || 1, weak: rolls.weak.matched, monster: mon.name }, result: rolls.accuracy } },
    { id: 'max',
      terms: { lvl: B.strengthLevelScale, str: B.strengthBonusScale, flat: B.playerBaseMaxHit, cut: B.monsterDefenseDamageReduction, weak: WEAKNESS_BONUS.damage },
      example: { inputs: { level: L, strength: 0, defScore, weak: rolls.weak.matched, monster: mon.name }, result: rolls.maxHit } },
    { id: 'mon_hit',
      terms: { base: B.monsterBaseAccuracy, per: B.monsterAccuracyPerPoint, min: B.monsterMinAccuracy, max: B.monsterMaxAccuracy },
      example: { inputs: { atk: mon.atk || 1, defense: L, baseAcc: Number.isFinite(mon.baseAcc) ? mon.baseAcc : null, monster: mon.name },
        result: monsterAccuracy(mon, L) } },
    { id: 'mon_max',
      terms: { scale: B.monsterAttackDamageScale, byTier: B.monsterDamageScaleByTier },
      example: { inputs: { atk: mon.atk || 1, tier: mon.tier || 1, scale, monster: mon.name }, result: monsterMaxHit(mon) } },
    { id: 'level_curve',
      terms: { rows: levelCurveRows().map((r) => ({ from: r.from, first: r.first, rise: r.rise, bend: r.bend })) },
      example: { inputs: { level: LEVEL_LEVELS[1] }, result: charXpForLevel(LEVEL_LEVELS[1]) } },
    { id: 'skill_xp',
      terms: { base: SKILL_CURVE.base, growthPermille: SKILL_CURVE.growthPermille, cap: MAX_LEVEL, uncapped: COMBAT_SKILLS.map((id) => SKILLS_DEF[id].name) },
      example: { inputs: { level: L }, result: skillXpForLevel('melee', L) } },
    { id: 'death',
      terms: { share: DEATH_XP_LOSS, cuts: BLESSING_CUT_PERMILLE },
      example: { inputs: { xp: deathXp, cut: oneCut },
        result: levelDeathLoss(deathXp), blessed: levelDeathLoss(deathXp, DEATH_XP_LOSS * (1000 - oneCut) / 1000) } },
  ];
}
