// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-plan.mjs — THE CELLS THE BALANCE MATRIX PLAYS (40-formula-brief section 5, lane/c-balance-matrix).
//
// ONE CELL BUILDER. Every cell is tools/balance-program/progression-grid.mjs buildCell (the grid's kits, skill lines, tier pulls and
// projected rows), so the matrix, the grid and the solver's ground rates are the same cells played the same way. The matrix adds the axes
// the grid lacks:
//   WAYS        every weapon way the engine plays (tools/balance-sim/styles.mjs: tank, sword, hammer, axes, bow, crossbow, mage, healer),
//               each alone; the fist line is a hidden two-row sample (src/data/fists.js FIST_LINE.live false) with no way yet: not played
//   GROUNDS     every hunt ground at both ends of its band, every party of 50-standards 1.3 and every tier it has, MID (the ground axis the
//               solver reads: tools/balance-program/atlas/rates.mjs huntGrounds / bandEnds / partyComps, the same definition)
//   HIGH        Levels 1,000, 2,000 and 5,000 on the projector's placeholder grounds and projected gear line (grid-project.mjs), PROJECTED
//   STEPS       each gear step per slot class: the upper state with ONE class (weapon, armor, jewelry) from the state below (grid-kit mixPlan)
//   ARCHETYPES  not cells: every cell's fights broken down by the monster's archetype (archetypeOf, the rule below)
//
// THE ARCHETYPE RULE (written down, read from data only):
//   role   the monster's role in src/data/balance-sheet.js GROUND_ROSTER (swarm, regular, glass, heavy, elite, boss): the stat formula's own
//          word for its shape. A monster on no roster is 'boss' when its row says boss, else 'unrostered' (a hand row: named, not guessed).
//   shape  'caster' when its row names monster spells (monsters.js `spells`), 'ranged' when its row's range is over 1, else 'melee'.
//   class  its row's `cls` (src/data/monster-classes.js: mammal ... extradimensional): the weakness family.
// ════════════════════════════════════════════════════════════════════════
import * as STD from './standards.mjs';
import { STYLES } from '../balance-sim/styles.mjs';
import { compsOf, cellKey, buildCell, MAIN } from './progression-grid.mjs';
import { huntGrounds, bandEnds, partyComps } from './atlas/rates.mjs';

export const WAYS = Object.freeze(Object.keys(STYLES));
export const HIGH_LEVELS = Object.freeze([1000, 2000, 5000]);
/* the slot classes a gear step moves one at a time (grid-kit.mjs slot names) */
export const UPGRADE_CLASSES = Object.freeze({
  weapon: Object.freeze(['weapon']),
  armor: Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']),
  jewelry: Object.freeze(['ring1', 'ring2', 'earrings', 'necklace', 'cape']),
});
/* a step cell's id: the grid's own two (E1: MID with the LOW weapon / armor) keep their names, so its judge reads them */
export const stepId = (to, cls) => (to === 'mid' && cls !== 'jewelry' ? 'step:' + cls : to + '-step:' + cls);
export const STEP_PAIRS = Object.freeze([['low', 'mid'], ['mid', 'bis']]);
const lone = (way) => [[way], way === 'hammer' ? 'h' : way];

/* THE RUNS. `blocks` name what each plays; a block's levels default to the run's. */
export const RUNS = Object.freeze({
  /* the nightly matrix: every axis at every checkpoint and the high Levels, the grid's sample */
  full: Object.freeze({ id: 'full', levels: Object.freeze([...STD.CHECKPOINTS, ...HIGH_LEVELS]), seeds: 2, hours: 2, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: STD.GEAR_STATE_IDS, tiers: 'all' },
    { id: 'parties', comps: [2, 3, 4].flatMap((n) => compsOf(n)), gears: STD.GEAR_STATE_IDS, tiers: 'all' },
    { id: 'steps', comps: [lone('hammer'), ...compsOf(4)], steps: true, tiers: ['normal'] },
    { id: 'grounds', grounds: true },
  ]) }),
  /* the representative subset (a --diff in a few minutes): every way, every gear state, lone and four, Normal and the hardest tier, every
     slot class's step, early to Level 5,000. One seed an hour: a diff plays the same dice before and after, so a change reads as a pair. */
  subset: Object.freeze({ id: 'subset', levels: Object.freeze([10, 30, 60, 110, 185, 400, ...HIGH_LEVELS]), seeds: 1, hours: 1, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: ['mid'], tiers: ['normal'] },
    { id: 'gear', comps: [lone('hammer')], gears: ['low', 'bis'], tiers: ['normal'] },
    { id: 'tier', comps: [lone('hammer')], gears: ['mid'], tiers: ['hardest'] },
    { id: 'four', comps: compsOf(4), gears: STD.GEAR_STATE_IDS, tiers: ['normal', 'hardest'] },
    { id: 'steps', comps: [lone('hammer')], steps: true, tiers: ['normal'] },
  ]) }),
  /* Balance Lab v3's LIVE cells (a slider move re-plays them in the browser, on the bundled engine): every way alone and the four on Normal
     and the hardest tier, MID, early, at the end of open content and PROJECTED, a quarter hour on one seed. tools/balance-lab/build.mjs --v3
     resolves them (cell.mjs resolveOnly) so the page plays the matrix's own seats. */
  live: Object.freeze({ id: 'live', levels: Object.freeze([30, 110, 400]), seeds: 1, hours: 0.25, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: ['mid'], tiers: ['normal'] },
    { id: 'four', comps: compsOf(4), gears: ['mid'], tiers: ['normal', 'hardest'] },
  ]) }),
});

/** A tier list resolved on a ground: 'all', ['normal', 'hardest'] ... -> the ids it offers. */
function tiersFor(D, ground, want) {
  const offered = D.TI.tiersOf(ground);
  if (want === 'all') return offered;
  return [...new Set(want.map((t) => (t === 'hardest' ? offered[offered.length - 1] : t)).filter((t) => offered.includes(t)))];
}

/**
 * A step cell: `built` (buildCell's answer for the upper state) with the slot class taken from the lower state's plans. The seats keep
 * the upper state's skills (only the gear moves: the grid's E1 step), the temper rungs and projected rows follow the mixed plans.
 */
export function stepCell(D, K, built, { L, gear, from, styles, ground, slots }) {
  const skills = built.cell.skillsBySeat;
  const lower = styles.map((style, i) => K.kitFor(L, from, style, { ground, mainSkill: skills[i][MAIN[style] || 'melee'] }));
  const plans = built.plans.map((p, i) => K.mixPlan(p, lower[i], slots));
  const temper = {};
  for (const p of plans) for (const [k, n] of Object.entries(p.temper || {})) temper[k] = Math.max(temper[k] || 0, n);
  const { temper: _t, ...rest } = built.cell;
  void _t;
  const cell = { ...rest, gearBySeat: plans.map((p) => p.gear), ...(Object.keys(temper).length ? { temper } : {}) };
  let whatIf = built.whatIf;
  if (whatIf) {
    const items = {};
    for (const p of plans) Object.assign(items, p.whatIfItems || {});
    const { items: _i, ...w } = whatIf;
    void _i;
    whatIf = { ...w, ...(Object.keys(items).length ? { items } : {}) };
  }
  void gear;
  return { cell, whatIf, plans };
}

/**
 * Every cell of a run: { cells: [meta], jobs: [{ id, key, cell, whatIf }] }. `D` the grid's data (loadGridData), `K` its kits. `only`
 * keeps those Levels; `blocks` those block ids.
 */
export function planMatrix(D, K, run, o = {}) {
  const cells = [], jobs = [], seen = new Set();
  const seeds = o.seeds || run.seeds, hours = o.hours || run.hours;
  const add = (meta, b) => {
    if (seen.has(meta.key)) return;
    seen.add(meta.key);
    /* `skills`: each seat's main skill and Defense as played (the career line, skill-lines.mjs, and the gear state's offset) */
    cells.push({ ...meta, stretch: STD.stretchOf(meta.L).state, kits: b.plans.map((p) => ({ style: p.style, kit: p.kit, temper: p.temper })),
      skills: meta.styles.map((st, i) => { const sk = (b.cell.skillsBySeat || [])[i] || {}; return [sk[MAIN[st] || 'melee'] || null, sk.defense || null]; }) });
    for (let s = 0; s < seeds; s++) jobs.push({ id: meta.key + '#' + s, key: meta.key, whatIf: b.whatIf, cell: { ...b.cell, id: 'MATRIX:' + meta.key, hours, seeds: 1, seedBase: s } });
  };
  for (const block of run.blocks) {
    if (o.blocks && !o.blocks.includes(block.id)) continue;
    if (block.grounds) { planGrounds(D, K, add, block); continue; }
    for (const L of block.levels || run.levels) {
      if (o.only && !o.only.includes(L)) continue;
      for (const [styles, comp] of block.comps) {
        const size = styles.length;
        if (size > 1 && L < (STD.PARTIES.find((p) => p.size === size).fromLevel || 1)) continue;
        const ground = D.groundAt(L, size);
        for (const tier of tiersFor(D, ground, block.tiers)) {
          if (block.steps) {
            for (const [from, to] of STEP_PAIRS) {
              const base = buildCell(D, K, { L, gear: to, styles, tier, ground });
              for (const [cls, slots] of Object.entries(UPGRADE_CLASSES)) {
                const step = stepId(to, cls), key = cellKey(L, to, size, comp, tier, step);
                add({ key, block: block.id, L, gear: to, party: size, comp, tier, ground, styles, step, stepFrom: from, stepClass: cls }, stepCell(D, K, base, { L, gear: to, from, styles, ground, slots }));
              }
            }
            continue;
          }
          for (const gear of block.gears) add({ key: cellKey(L, gear, size, comp, tier), block: block.id, L, gear, party: size, comp, tier, ground, styles }, buildCell(D, K, { L, gear, styles, tier, ground }));
        }
      }
    }
  }
  return { cells, jobs };
}

/* THE GROUND AXIS (atlas/rates.mjs measureJobs' cells, built by the grid's buildCell so its pulls, kits and skills are the grid's): every hunt
   ground at both ends of its band, every party of 50-standards 1.3, every tier, MID. Key: G|ground|L|mid|size:comp|tier. `block.quick`: sizes
   1 and 4, one composition, Normal and the hardest tier (measureJobs' quick); `block.only`: those grounds. */
function planGrounds(D, K, add, block = {}) {
  for (const g of huntGrounds(D.G.HUNT_GROUNDS, D.HUNT_INDEX)) {
    if (block.only && !block.only.includes(g)) continue;
    for (const L of bandEnds(D.HUNT_INDEX, g, D.G.HUNT_GROUNDS[g])) for (const pc of partyComps(STD.PARTIES, !!block.quick)) {
      if (L < pc.fromLevel && pc.size > 1) continue;
      pc.comps.forEach((styles, ci) => {
        for (const tier of block.quick ? tiersFor(D, g, ['normal', 'hardest']) : D.TI.tiersOf(g)) {
          const comp = styles.map((s) => s[0]).join('') + ci;
          const key = ['G', g, L, 'mid', pc.size + ':' + comp, tier].join('|');
          add({ key, block: 'grounds', L, gear: 'mid', party: pc.size, comp, compIndex: ci, tier, ground: g, styles }, buildCell(D, K, { L, gear: 'mid', styles, tier, ground: g }));
        }
      });
    }
  }
}

/* ── THE ARCHETYPE RULE (the header) ───────────────────────────────────────────────────────────────────────────────────────────── */
/** monster id -> { role, shape, cls }, from the data at hand (`BS` balance-sheet.js, `MONSTERS`). */
export function archetypeTable(BS, MONSTERS) {
  const role = {};
  for (const roster of Object.values(BS.GROUND_ROSTER)) for (const [id, r] of Object.entries(roster)) if (!role[id]) role[id] = r;
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) {
    out[id] = { role: role[id] || (m.boss ? 'boss' : 'unrostered'), shape: Array.isArray(m.spells) && m.spells.length ? 'caster' : Number(m.range) > 1 ? 'ranged' : 'melee', cls: m.cls || 'none' };
  }
  return out;
}
export const ARCHETYPE_AXES = Object.freeze(['role', 'shape', 'cls']);
