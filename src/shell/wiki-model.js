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
//   formulas  the hit, damage and death rules: each states its constants (`terms`, read from the engine's
//             tables) and works one example by CALLING the engine's own function (`example.result`), so the page
//             can never say one thing while a hunt does another: tests/wiki-window.mjs recomputes every example
//             from the stated terms and goes red when they disagree. The two XP pages are TABLES (`rows`), read
//             like any MMO wiki's experience table (Tyler 2026-11-17 on the old bracket formula: "This is very
//             confusing"): a Level, the XP across it and the total that reaches it, each the engine's own curve
//             (src/core/xp.js); the guard works every row from the curve's data rows by hand.
// DISPLAY ONLY (CLAUDE.md §6): catalogue facts and arithmetic, nothing a player can spend, no intent, no residue.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF, COMBAT_SKILLS } from '../data/skills.js';
import { SKILL_GUIDE } from '../data/skill-guide.js';
import { MONSTERS } from '../data/monsters.js';
import { HUNT_INDEX } from '../data/hunts.js';
import { OPEN_GROUNDS } from '../data/hunt-grounds.js';
import { shownBand } from './hunt-list.js';
import { DEATH_XP_LOSS, DEATH_HOURS } from '../data/hunt-sessions.js';
import { BLESSING } from '../data/blessings.js';
import { MAX_LEVEL, isCapped, skillXpForLevel, charXpForLevel } from '../core/xp.js';
import { COMBAT_BALANCE, WEAKNESS_BONUS, playerCombatRolls, monsterAccuracy, monsterMaxHit } from '../core/combat.js';
import { TO_HIT } from '../data/to-hit.js';
import { levelDeathLoss } from '../core/action-rules.js';
import { residentsOf, raresOf, materialsOf } from './hunt-ground-facts.js';

/* The Levels each curve's table shows: the first hours, then the long climb. A capped skill stops at its cap. */
const CURVE_LEVELS = Object.freeze([10, 25, 50, 99]);
const LEVEL_LEVELS = Object.freeze([10, 25, 50, 100]);
/* The worked examples' hero: weapon skill and Defense at this Level, no gear; a death at this Level's XP. */
const EXAMPLE_LEVEL = 10;
const DEATH_EXAMPLE_LEVEL = 20;
/* How many materials a ground's page names beside its Rares (the likeliest first). */
const MATERIALS_SHOWN = 3;
/* The XP tables' rows: every Level of the first hours, then the long climb. A row past a curve's top is left out (xpRow). */
const FIRST_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);
const LEVEL_TABLE = Object.freeze([...FIRST_LEVELS, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 125, 150, 200, 250, 300]);
const SKILL_TABLE = Object.freeze([...FIRST_LEVELS, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

const curveOf = (levels, xpAt) => levels.map((level) => ({ level, xp: xpAt(level) }));
/* One row of an XP table: the XP across `level` and the total that reaches it, or null past the curve's top (no next Level,
   or a total past 2^53), so a table stops where its curve does and never shows a number the engine cannot reach. */
function xpRow(level, xpAt) {
  const total = xpAt(level), next = xpAt(level + 1) - total;
  return Number.isSafeInteger(total) && Number.isSafeInteger(next) && next > 0 ? { level, next, total } : null;
}
const xpRows = (levels, xpAt) => levels.map((l) => xpRow(l, xpAt)).filter(Boolean);

/**
 * The Level XP table: [{ level, next, total, me? }]. `heroLevel` is the viewed hero's Level as the SERVER says it (null when
 * there is none): its row is marked `me`, and put in its place among the others when it is not one of them.
 */
export function levelXpRows(heroLevel = null) {
  const me = Number.isSafeInteger(heroLevel) && heroLevel >= 1 ? heroLevel : null;
  const levels = me === null || LEVEL_TABLE.includes(me) ? LEVEL_TABLE : [...LEVEL_TABLE, me].sort((a, b) => a - b);
  return xpRows(levels, charXpForLevel).map((r) => (r.level === me ? Object.assign(r, { me: true }) : r));
}

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
    return { id: g.hunt, name: row.name || g.hunt, theme: row.theme || '', band: shownBand(g.hunt),
      monsters: residentsOf(g.hunt).map((m) => ({ id: m.id, name: m.name, level: m.level, boss: m.boss })),
      drops: rares.concat(mats) };
  });
}

/** The worked examples' monster: the first creature a hero meets (lowest ground first) that has some defense, so every term of every
    example counts; else the first it meets; never a boss. */
function exampleMonster() {
  const met = groundsInOrder().flatMap(({ g }) => residentsOf(g.hunt)).filter((m) => !m.boss && MONSTERS[m.id]);
  const pick = met.find((m) => (MONSTERS[m.id].def || 0) > 0) || met[0];
  return pick ? Object.assign({ id: pick.id }, MONSTERS[pick.id]) : null;
}

const B = COMBAT_BALANCE;

/**
 * The Formulas section: [{ id, terms, example: { inputs, result } }]. `terms` are the constants the words state, read from
 * the engine's tables; `result` is the engine's own function called on `inputs`. The page writes both; the guard recomputes.
 * The two XP pages are { id, rows } instead (levelXpRows, with `heroLevel` marked; the combat skill curve with the cap a
 * gathering or crafting skill stops at, or null when no skill has one).
 */
export function formulaPages(heroLevel = null) {
  const mon = exampleMonster();
  const L = EXAMPLE_LEVEL;
  const skills = { melee: skillXpForLevel('melee', L), defense: skillXpForLevel('defense', L) };
  const rolls = playerCombatRolls(mon, { skills, equipment: {}, items: {} });
  const scale = B.monsterDamageScaleByTier[mon.tier] || B.monsterAttackDamageScale;
  const deathXp = charXpForLevel(DEATH_EXAMPLE_LEVEL);
  /* the ONE Blessing (lane/level-costs, 2026-11-22) */
  const oneCut = BLESSING.cutPm;
  return [
    { id: 'hit',
      terms: { base: TO_HIT.base, min: TO_HIT.min, max: TO_HIT.max, weak: WEAKNESS_BONUS.accuracy },
      example: { inputs: { level: L, accuracy: 0, evasion: mon.evasion || 0, weak: rolls.weak.matched, monster: mon.name }, result: rolls.accuracy } },
    { id: 'max',
      terms: { lvl: B.strengthLevelScale, str: B.strengthBonusScale, flat: B.playerBaseMaxHit, cut: B.monsterDefenseDamageReduction, weak: WEAKNESS_BONUS.damage },
      example: { inputs: { level: L, strength: 0, defScore: mon.def || 0, weak: rolls.weak.matched, monster: mon.name }, result: rolls.maxHit } },
    { id: 'mon_hit',
      terms: { base: TO_HIT.base, min: TO_HIT.min, max: TO_HIT.max },
      example: { inputs: { aim: mon.aim || 0, defense: L, monster: mon.name }, result: monsterAccuracy(mon, L) } },
    { id: 'mon_max',
      terms: { scale: B.monsterAttackDamageScale, byTier: B.monsterDamageScaleByTier },
      example: { inputs: { atk: mon.atk || 1, tier: mon.tier || 1, scale, monster: mon.name }, result: monsterMaxHit(mon) } },
    { id: 'level_curve', rows: levelXpRows(heroLevel) },
    /* the fighting skills share one curve, the Level clock (src/core/xp.js), read through the first of them (Inner Flame keeps its own) */
    { id: 'skill_xp', rows: COMBAT_SKILLS.length ? xpRows(SKILL_TABLE, (l) => skillXpForLevel(COMBAT_SKILLS[0], l)) : [],
      cap: Object.keys(SKILLS_DEF).some(isCapped) ? MAX_LEVEL : null },
    { id: 'death',
      terms: { share: DEATH_XP_LOSS, hours: DEATH_HOURS, cuts: [BLESSING.cutPm] },
      example: { inputs: { level: DEATH_EXAMPLE_LEVEL, xp: deathXp, cut: oneCut },
        result: levelDeathLoss(deathXp), blessed: levelDeathLoss(deathXp, DEATH_XP_LOSS * (1000 - oneCut) / 1000) } },
  ];
}
