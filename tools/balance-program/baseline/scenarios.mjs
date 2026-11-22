// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/baseline/scenarios.mjs — THE BASELINE'S SCENARIOS: which cells every pinned measurement and every candidate plays
// (Tyler 2026-11-21, the balance baseline request, Phase 1 "Measure representative characters"; lane/bl-baseline).
//
// TWO HALVES.
//   deriveSpec(root)   read ONCE from the pinned game tree: the open hunting grounds (src/data/hunts.js OPEN_HUNTS that have a ground in
//                      src/data/hunt-grounds.js), the Level where live content ends (the highest open band's top), the checkpoints inside it,
//                      and calibration C-2's real rows (tools/balance-program/calibration/c2.json). Written to the baseline's spec.json and
//                      never derived again: a candidate plays the BASELINE's spec, so a candidate that opens a ground or moves a band plays the
//                      same characters and its move shows as a move (a cell whose ground changed says so), never as a different scenario list.
//   baselineRun(spec)  the run (tools/balance-program/matrix-plan.mjs RUNS shape, planned by its planMatrix and the grid's one buildCell) and
//                      planHook (each job's hours by Level, the C-2 cells beside the run's).
//
// THE BLOCKS (every cell is a party of the engine's own weapon ways on the ground the game advises for its Level and size, D.groundAt):
//   pace      every way alone, MID, Normal, at every open checkpoint (the Level line: time to each Level, long-term scaling)
//   ways      every way alone x LOW / MID / BIS (arrival, mid and best) x Normal / Dangerous / Deadly, at the spine Levels
//   four      the standard four (the real Krell four's seats) x the three gear states x the three tiers, at the spine Levels
//   pace4     the standard four, MID, Normal, at every open checkpoint from Level 5
//   parties   the pairs and the three (standards.mjs PARTIES), MID, every tier, at the spine Levels
//   lineups   the eight fours of matrix-plan.mjs LINEUPS, MID, Normal and Deadly, at the spine Levels from 30
//   steps     the lone hammer and the four with ONE slot class (weapon, armor, jewelry) a gear state back, Normal, spine Levels from 10
//   grounds   every OPEN ground at both ends of its band, every party of standards.mjs PARTIES, every tier it has, MID
//   c3        check C3, the default company on the Millrace Sewer at Level 5 (matrix-plan.mjs C3_BLOCK), 8 hours a seed
//   c2        calibration C-2: the matrix four on each ground and tier real fours played, at the rows' middle Level and C-1's gear
//   beyond    PAST LIVE CONTENT, never live: every way alone and the four, MID, Normal and Deadly, at the guard Levels above the top of live
//             content, on the matrix's STAGED grounds (110 to 185, the staged rows opened) and PROJECTED placeholder grounds (past 185). The only
//             cells off an open ground, labelled so in every report: long-term scaling, and a change that acts past the top (a gear curve)
// The spine is standards.mjs GUARD_CHECKPOINTS inside live content (the release guard's Levels), so no Level list is typed here.
//
// SEEDS AND HOURS. Eight seeds a cell (the brief's floor is four; usage allowed the full size, and eight halves a mean's variance) (seed k plays seedBase k: the same key and seed play the same dice on any tree). Hours by Level
// (HOURS_BY_LEVEL): a cell plays one continuous hunt under the real death rule, and the hero levels inside it, so a low Level plays short
// enough to stay near its Level and a high Level long enough for deaths to read. What each sample size resolves: 01-baseline.md section 4.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as STD from '../standards.mjs';
import { WAYS, LINEUPS, lineupComp, C3_BLOCK } from '../matrix-plan.mjs';
import { compsOf, buildCell } from '../progression-grid.mjs';

export const SCENARIO_ID = 'baseline-1';
export const SPEC_SCHEMA = 'hearthrise.balance-baseline-spec/1';
export const SEEDS = 8;
/* [from Level, hours a seed]: a cell at Level L plays the hours of the last row at or under L */
export const HOURS_BY_LEVEL = Object.freeze([[1, 1], [10, 2], [30, 4], [60, 8]].map((x) => Object.freeze(x)));
/* a block that keeps its own hours: check C3 is ruled on 4 seeds x 8 hours (the death sample's) */
export const BLOCK_HOURS = Object.freeze({ c3: 8 });
export const hoursAt = (L) => [...HOURS_BY_LEVEL].reverse().find(([from]) => L >= from)[1];
export const hoursOfCell = (c) => BLOCK_HOURS[c.block] || hoursAt(c.L);
const lone = (way) => [[way], way === 'hammer' ? 'h' : way];

/** The spec, read from a game tree at `root` (its data, never this harness's). */
export async function deriveSpec(root, label) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [H, G] = await Promise.all([imp('src/data/hunts.js'), imp('src/data/hunt-grounds.js')]);
  const open = new Set((H.OPEN_HUNTS || H.HUNTS.filter((h) => h.staged !== true)).map((h) => h.id));
  const grounds = Object.entries(G.HUNT_GROUNDS);
  const openGrounds = grounds.filter(([, g]) => open.has(g.hunt)).map(([id]) => id).sort();
  const stagedGrounds = grounds.filter(([, g]) => !open.has(g.hunt)).map(([id]) => id).sort();
  const bandOf = (id) => (H.HUNT_INDEX[G.HUNT_GROUNDS[id].hunt] || {}).band || [0, 0];
  const liveTop = Math.max(...openGrounds.map((id) => bandOf(id)[1]));
  const levels = STD.CHECKPOINTS.filter((L) => L <= liveTop);
  const spine = STD.GUARD_CHECKPOINTS.filter((L) => L <= liveTop);
  const beyond = STD.GUARD_CHECKPOINTS.filter((L) => L > liveTop);
  /* calibration C-2's real rows (aggregates of real fours' recorded hunts: read-only production reads, real-players.local.mjs) */
  const c2File = join(root, 'tools/balance-program/calibration/c2.json');
  const c2 = existsSync(c2File) ? JSON.parse(readFileSync(c2File, 'utf8')).rows.filter((r) => r.real && open.has((G.HUNT_GROUNDS[r.ground] || {}).hunt))
    .map((r) => ({ ground: r.ground, tier: r.tier, levels: r.levels, L: r.L, gear: r.gear, heroHours: r.heroHours, real: r.real })) : [];
  return { schema: SPEC_SCHEMA, id: SCENARIO_ID, label: label || null, liveTop, levels, spine, beyond, openGrounds, stagedGrounds,
    openGroundBands: Object.fromEntries(openGrounds.map((id) => [id, bandOf(id)])), c2, seeds: SEEDS, hoursByLevel: HOURS_BY_LEVEL, blockHours: BLOCK_HOURS };
}

/** The run a spec plays (planMatrix's shape). */
export function baselineRun(spec) {
  const four = compsOf(4);
  return { id: 'baseline', levels: spec.levels, seeds: spec.seeds || SEEDS, hours: 2, blocks: [
    { id: 'pace', comps: WAYS.map(lone), gears: ['mid'], tiers: ['normal'], levels: spec.levels },
    { id: 'ways', comps: WAYS.map(lone), gears: STD.GEAR_STATE_IDS, tiers: 'all', levels: spec.spine },
    { id: 'four', comps: four, gears: STD.GEAR_STATE_IDS, tiers: 'all', levels: spec.spine },
    { id: 'pace4', comps: four, gears: ['mid'], tiers: ['normal'], levels: spec.levels },
    { id: 'parties', comps: [2, 3].flatMap((n) => compsOf(n)), gears: ['mid'], tiers: 'all', levels: spec.spine },
    { id: 'lineups', comps: LINEUPS.map((s) => [s, lineupComp(s)]), gears: ['mid'], tiers: ['normal', 'deadly'], levels: spec.spine.filter((L) => L >= 30) },
    { id: 'steps', comps: [lone('hammer'), ...four], steps: true, tiers: ['normal'], levels: spec.spine.filter((L) => L >= 10) },
    { id: 'grounds', grounds: true, only: spec.openGrounds },
    C3_BLOCK,
    ...((spec.beyond || []).length ? [{ id: 'beyond', comps: [...WAYS.map(lone), ...four], gears: ['mid'], tiers: ['normal', 'deadly'], levels: spec.beyond }] : []),
  ] };
}

/** The C-2 cells: the standard four on each real row's ground and tier, at its middle Level, in C-1's gear (calibrate.mjs c2's rule). */
export function c2Cells(D, K, spec) {
  const styles = compsOf(4)[0][0], comp = compsOf(4)[0][1], cells = [], jobs = [];
  for (const r of spec.c2 || []) {
    const key = 'C2|' + r.ground + '|' + r.tier + '|' + r.L;
    const b = buildCell(D, K, { L: r.L, gear: r.gear, styles, tier: r.tier, ground: r.ground });
    const meta = { key, block: 'c2', L: r.L, gear: r.gear, party: 4, comp, tier: r.tier, ground: r.ground, styles, variant: 'c2', stretch: STD.stretchOf(r.L).state };
    cells.push(meta);
    for (let s = 0; s < spec.seeds; s++) jobs.push({ id: key + '#' + s, key, whatIf: b.whatIf, cell: { ...b.cell, id: 'BASELINE:' + key, hours: hoursOfCell(meta), seeds: 1, seedBase: s } });
  }
  return { cells, jobs };
}

/**
 * balance-matrix.mjs playRun's planHook: the C-2 cells beside the run's, every job's hours from its cell, and each cell's hours on it.
 * THE GAME'S OWN BLESSINGS. The grid's cell builder lays the sitting's S-5 Blessing ladder on every cell (`blessedShare`: past Level 100 each
 * ladder Level halves what a blessed death takes), a PROPOSAL the matrix plays for the overhaul. The baseline measures the game as it stands,
 * so its jobs carry no `blessedShare` and the cell runner prices each death with the tree's own table (src/data/blessings.js, three Blessings).
 */
export function planHook(spec) {
  return (D, K, plan) => {
    const extra = c2Cells(D, K, spec);
    const cells = [...plan.cells, ...extra.cells].map((c) => ({ ...c, hours: hoursOfCell(c) }));
    const hoursByKey = new Map(cells.map((c) => [c.key, c.hours]));
    const jobs = [...plan.jobs, ...extra.jobs].map((j) => {
      const { blessedShare, ...cell } = j.cell;
      void blessedShare;
      return { ...j, cell: { ...cell, hours: hoursByKey.get(j.key) } };
    });
    return { cells, jobs };
  };
}

/* THE SCENARIO'S IDENTITY: the spec and the code that turns it into cells (this file, the plan, the cell builder's inputs are in the
   matrix's own hash). A candidate is comparable to a baseline only when the two hashes are equal. */
export function scenarioHash(spec, harnessRoot) {
  const h = createHash('sha256');
  h.update(JSON.stringify(spec));
  for (const p of ['tools/balance-program/baseline/scenarios.mjs', 'tools/balance-program/baseline/outcomes.mjs', 'tools/balance-program/matrix-plan.mjs']) {
    const f = join(harnessRoot, p);
    if (existsSync(f)) h.update(p + '\0' + readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 16);
}

/** A planned cell that stands where the spec says no live cell may: off an open ground and not in the beyond block. */
export const strayCell = (spec) => (c) => c.block !== 'beyond' && !spec.openGrounds.includes(c.ground);
