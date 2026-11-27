#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/lineup-v4.mjs — PROBE V4 AS A GUARD: A MIXED FOUR BEATS A FOUR OF ONE STYLE, AND NO LINEUP IS BEST EVERYWHERE (lane/r6-release-plan, 2026-11-22).
//
// docs/design/redesign/12-targets.md 2.6: T-03 ("Party class XP", tests/party-class-xp-line.mjs) enforced the 10-31 rule that a party
// beats solo only with mixed classes. The redesign drops that rule: a four earns more because it HOLDS DEEPER on the Danger scale. T-03 is
// retired with that reason and V4 takes its place, on the real engine, on every scale ground (src/data/danger.js DANGER_GROUNDS):
//   V4-1  a four of ONE style (hammer x4, bow x4, mage x4, healer x4) earns less Level XP a head an hour than the mixed four (hammer, bow,
//         mage, healer), each a Steady four from its held start (refStep - startMargin) at the ground's reference Level
//         (tests/level-curve.mjs REF_LEVEL), MID kits, 3 seeds x 2 h (tools/balance-program/redesign/held-four.mjs), on every scale
//         ground but at most one, and there by at most V4_ANSWER_MAX (restated 2026-11-23, below)
//   V4-2  no lineup of LINEUPS is the best on every scale ground. Judged since R10 opened more scale grounds (lane/r10-more-grounds);
//         with one ground it is printed as not judged, and the rule itself is proven on planted grounds in --mutate. LINEUPS holds the
//         frontless fours too (three mages and a healer, three bows and a healer: 12-targets 8.9.1).
//   V4-3  THE FRONT SEAT (12-targets 8.9.1, lane/front-seat 2026-11-27): the best fronted four with a healer (a seat in the front row by the
//         engine's own row rule, monster-roles.js rowOf, and a healer: the mixed four and its doubled-seat lineups) out-earns the best
//         frontless four (no seat in the front row: the frontless lineups and the fours of bows, mages or healers), on every judged ground
//         but at most one, and there by at most V4_ANSWER_MAX (V4-1's one-ground rule: "the frontless four is a real build for a ground
//         that asks for it"). Before the close (a pulled pack's brutes and swarm take the nearest hero of any row, and pin a ranged hero
//         they reach: monster-roles.js reachPick, roles.js rangedPos) three mages and a healer earned 1.24 to 1.75x the mixed four on
//         every measured ground.
// JUDGED ONLY ON A GROUND OF BASE TIER 1 OR MORE (the designer's ruling 29-tuning-pass.md 7.5, read for V4 as it reads for C-2;
// lane/scale-grounds-2, 2026-11-23): a ground whose base is tier 0 (DANGER_GROUNDS gearLevel under GEAR_STEPS.tierSteps: the Mill Cellar,
// Meadowbrook Thicket) is the starting kit, where a Level 3 hero has no style yet to mix, so a lineup reading there is not a lineup
// question (the Cellar's mage four read 1.04 of the mixed four, its healers 1.02). Those grounds are not measured, and printed as not
// judged; every ground of base tier 1 or more is, both claims (judgedOf, its boundary held by two cases in --mutate).
// Measured 2026-11-22 on muster_barrows, Level 60, 3 seeds x 2 h: mixed 0.88x the hours table; healer x4 0.58x, mage x4 0.43x,
// hammer x4 0.19x, bow x4 0.19x.
//
//   node tests/lineup-v4.mjs                 the guard (12 grounds x 10 cells x 3 seeds: the one_each lineup is the mixed four's own cell, read
//                                            once, so the two frontless lineups cost one cell over the 9 before; 28-43 min on a 4-core runner)
//   node tests/lineup-v4.mjs --mutate        planted readings, and two engine mutants: the one-style fours 40 Levels over the mixed one must win
//                                            (V4-1), and the frontless lineups 40 Levels over the fronted fours must win (V4-3)
//   node tests/lineup-v4.mjs --keep-world    the guard, and its measured world written for the --mutate after it (WORLD_FILE)
//   node tests/lineup-v4.mjs --mutate --reuse-world   the planted readings on that world, not a second measure of the same cells
// THE PROOF COSTS ONE MEASURE, NOT THREE (lane/ci-reds-1127): --mutate measured the shipped world again (the plain run's exact cells, 39 min)
// and then the whole world again with the one-style fours 40 Levels up (39 min more, though only the mono cells move), 78 min past client-guards-6's
// 79 once V4-1 is green. CI hands the plain run's world over in the one step (--keep-world, --reuse-world: the same checkout, seconds
// apart), and the engine mutant plays only the one-style fours, 40 Levels up, on two grounds where none wins (two wins are red whatever
// the shipped game's one answer is). Run alone, --mutate measures its own world as before.
// ci-step: client-guards-6 | Lineups (V4, T-03 retired) - a mixed four beats a four of one style at its held depth
// ci-run: node tests/lineup-v4.mjs --keep-world
// ci-run: node tools/mutant-gate.mjs node tests/lineup-v4.mjs --mutate --reuse-world
// mutant-anchors: none — every mutant is a planted reading or an engine cell played in memory, never a file
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, tmpdir } from 'node:os';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { isMain } from './_is-main.mjs';
import { DANGER_GROUNDS, GEAR_STEPS } from '../src/data/danger.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { rowOf } from '../src/core/hunt/monster-roles.js';
import { STYLES as STYLE_ROWS } from '../tools/balance-sim/styles.mjs';
import { playCells } from '../tools/balance-program/redesign/held-four.mjs';
import { refLevelOf } from './level-curve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIXED = ['hammer', 'bow', 'mage', 'healer'];
export const STYLES = ['hammer', 'bow', 'mage', 'healer'];
/* V4-2's lineups: mixed fours of different shapes (one of each, and each with one seat doubled), and the FRONTLESS FOURS (12-targets
   8.9.1): a healer behind three of one ranged style, no seat in the front row */
export const LINEUPS = {
  one_each: MIXED,
  two_hammers: ['hammer', 'hammer', 'mage', 'healer'],
  two_bows: ['hammer', 'bow', 'bow', 'healer'],
  two_mages: ['hammer', 'mage', 'mage', 'healer'],
  frontless_mages: ['mage', 'mage', 'mage', 'healer'],
  frontless_bows: ['bow', 'bow', 'bow', 'healer'],
};

/** Does a four of `styles` seat a hero in the FRONT ROW (the engine's own row rule, monster-roles.js rowOf, on each style's role)? Pure. */
export const frontedOf = (styles) => styles.some((s) => rowOf({ role: STYLE_ROWS[s].role }) === 'front');
/** ...and a healer? Pure. */
const healedOf = (styles) => styles.some((s) => STYLE_ROWS[s].role === 'healer');
/** Every four the world measured on ground `g`, as [name, styles, Level XP a head an hour]: the mixed four, the one-style fours and
    V4-2's lineups (one_each is the mixed four's own cell). Pure. */
const foursOf = (w, g) => [['the mixed four', MIXED, w.mixed[g]], ...STYLES.map((s) => ['the four of ' + s, [s, s, s, s], w.mono[g] && w.mono[g][s]]),
  ...(w.lineups ? Object.entries(LINEUPS).filter(([id]) => id !== 'one_each').map(([id, st]) => [id, st, w.lineups[g] && w.lineups[g][id]]) : [])];
const SEEDS = 3, HOURS = 2;
/* one worker a core: the parent only waits on them (held-four.mjs's default leaves a core idle, a quarter of a 4-core runner) */
const WORKERS = Math.max(1, Math.min(8, cpus().length));
/* the plain run's measured world, handed to the --mutate after it in the same CI step; older than this is never read */
export const WORLD_FILE = join(tmpdir(), 'hr-lineup-v4-world.json');
const WORLD_MAX_AGE_MS = 6 * 3600 * 1000;
/* V4-1's one ground (the designer, lane/designer-reads-1123 2026-11-23, 29-tuning-pass.md 7.3): a four of one style that wins ONE scale
   ground is that ground's answer, a theorycrafted build Tyler's rulings never squeeze (the healer four on the Bone Wing, 1.105: it holds
   the band's top with no death). It may win there by at most this much. Winning a second ground, or one by more, is a monoculture */
export const V4_ANSWER_MAX = 1.15;

/** The grounds V4 judges, of `base` ({ ground: its base item Level, DANGER_GROUNDS gearLevel }): base tier 1 or more (29 7.5). Pure. */
export const judgedOf = (base) => Object.keys(base).filter((g) => Number.isInteger(base[g]) && base[g] >= GEAR_STEPS.tierSteps);

/** Every failed claim. w = { base: {g: gearLevel}, mixed: {g: xp}, mono: {g: {style: xp}}, lineups: {g: {id: xp}} | null }, read on the
    grounds judgedOf(w.base) keeps. Pure. */
export function judge(w) {
  const out = [];
  const wins = [];
  const grounds = judgedOf(w.base);
  for (const g of grounds) {
    const mx = w.mixed[g];
    if (!Number.isFinite(mx)) { out.push(`V4-1: ${g}: the mixed four was not measured`); continue; }
    for (const s of STYLES) {
      const x = w.mono[g] && w.mono[g][s];
      if (!Number.isFinite(x)) { out.push(`V4-1: ${g}: the four of ${s} was not measured`); continue; }
      if (!(x < mx)) wins.push({ g, s, x, mx });
    }
  }
  /* one ground may have its one-style answer, inside V4_ANSWER_MAX; a second ground, or a wider win, is red (every win is named) */
  const winGrounds = new Set(wins.map((v) => v.g));
  for (const v of wins) {
    const why = winGrounds.size > 1 ? `one-style fours win ${winGrounds.size} grounds (at most one)` : `over ${V4_ANSWER_MAX}x on its one ground`;
    if (winGrounds.size > 1 || !(v.x <= v.mx * V4_ANSWER_MAX)) out.push(`V4-1: ${v.g}: four of ${v.s} earns ${Math.round(v.x)} Level XP a head an hour, the mixed four ${Math.round(v.mx)}: ${why}`);
  }
  if (grounds.length >= 2) {
    const tops = grounds.map((g) => {
      const row = (w.lineups && w.lineups[g]) || {};
      const ids = Object.keys(LINEUPS).filter((id) => Number.isFinite(row[id]));
      if (ids.length < Object.keys(LINEUPS).length) { out.push(`V4-2: ${g}: not every lineup was measured`); return null; }
      return ids.reduce((a, b) => (row[b] > row[a] ? b : a));
    });
    if (tops.every((t) => t && t === tops[0])) out.push(`V4-2: ${tops[0]} is the best lineup on every scale ground (${grounds.join(', ')}): no lineup may be best everywhere`);
  }
  /* V4-3 (12-targets 8.9.1, the front seat): the best fronted four with a healer out-earns the best frontless four. A frontless four that
     wins is that ground's answer under V4-1's one-ground rule: on one ground, by at most V4_ANSWER_MAX; a second ground, or a wider win, is red */
  const fl = [];
  for (const g of grounds) {
    const all = foursOf(w, g);
    const unmeasured = all.filter(([, , x]) => !Number.isFinite(x));
    if (unmeasured.length) { for (const [n] of unmeasured) out.push(`V4-3: ${g}: ${n} was not measured`); continue; }
    const best = (list) => list.reduce((a, b) => (b[2] > a[2] ? b : a));
    const fronted = all.filter(([, st]) => frontedOf(st) && healedOf(st)), frontless = all.filter(([, st]) => !frontedOf(st));
    if (!fronted.length || !frontless.length) { out.push(`V4-3: ${g}: no ${fronted.length ? 'frontless' : 'fronted'} four was measured`); continue; }
    const f = best(fronted), b = best(frontless);
    if (!(f[2] > b[2])) fl.push({ g, f, b });
  }
  const flGrounds = new Set(fl.map((v) => v.g));
  for (const v of fl) {
    const why = flGrounds.size > 1 ? `frontless fours win ${flGrounds.size} grounds (at most one)` : `over ${V4_ANSWER_MAX}x on its one ground`;
    if (flGrounds.size > 1 || !(v.b[2] <= v.f[2] * V4_ANSWER_MAX)) out.push(`V4-3: ${v.g}: ${v.b[0]} (frontless) earns ${Math.round(v.b[2])} Level XP a head an hour, the best fronted four with a healer (${v.f[0]}) ${Math.round(v.f[2])}: ${why}`);
  }
  return out;
}

/** The world on the engine. An engine mutant plays only some cells `levelUp` Levels over the rest, on grounds `only.grounds`: `only.kind`
    'mono' the one-style fours, returned as { mono: { g: { style: xp } } }, 'frontless' the frontless lineups, as { lineups: { g: { id: xp } } }
    (each read into a measured world). The one_each lineup is the mixed four's own cell (the same styles on the same seeds), read once. */
const FRONTLESS_IDS = Object.keys(LINEUPS).filter((id) => !frontedOf(LINEUPS[id]));
async function measure({ levelUp = 0, only = null } = {}) {
  const base = Object.fromEntries(Object.entries(DANGER_GROUNDS).map(([g, row]) => [g, row.gearLevel]));
  const grounds = only ? only.grounds : judgedOf(base);
  const cells = [];
  for (const g of grounds) {
    const L = refLevelOf(g);
    if (!Number.isInteger(L)) throw new Error(`lineup-v4: scale ground ${g} has no reference Level (tests/level-curve.mjs REF_LEVEL)`);
    /* A GROUND WHOSE HUNT ENDS AT A LEVEL (hunt-grounds.js endsAtLevel: the Mill Cellar's at 5) holds every four at its Level (held-four.mjs
       holdLevel, as tests/level-curve.mjs C7 does): a Level 3 four is outgrown inside the window, so every four would read the same XP, the
       XP to the exit over two hours (4,574 a head an hour, mixed and mage alike), and V4 would judge the exit, not the lineup */
    const hold = Number.isInteger(HUNT_GROUNDS[g] && HUNT_GROUNDS[g].endsAtLevel) ? { holdLevel: true } : {};
    const cell = (id, styles, up = 0) => cells.push({ id, ground: g, L: L + up, styles, risk: 'steady', hours: HOURS, seeds: SEEDS, ...hold });
    if (!only) cell(`${g}:mixed`, MIXED);
    if (!only || only.kind === 'mono') for (const s of STYLES) cell(`${g}:mono:${s}`, [s, s, s, s], levelUp);
    if (only ? only.kind === 'frontless' : grounds.length >= 2) for (const [id, st] of Object.entries(LINEUPS)) {
      if (id === 'one_each' || (only && !FRONTLESS_IDS.includes(id))) continue;
      cell(`${g}:line:${id}`, st, only ? levelUp : 0);
    }
  }
  const r = await playCells(ROOT, cells, { workers: WORKERS });
  if (only && only.kind === 'mono') return { mono: Object.fromEntries(grounds.map((g) => [g, Object.fromEntries(STYLES.map((s) => [s, r[`${g}:mono:${s}`].xpHeadH]))])) };
  if (only) return { lineups: Object.fromEntries(grounds.map((g) => [g, Object.fromEntries(FRONTLESS_IDS.map((id) => [id, r[`${g}:line:${id}`].xpHeadH]))])) };
  const w = { base, mixed: {}, mono: {}, lineups: grounds.length >= 2 ? {} : null };
  for (const g of grounds) {
    w.mixed[g] = r[`${g}:mixed`].xpHeadH;
    w.mono[g] = Object.fromEntries(STYLES.map((s) => [s, r[`${g}:mono:${s}`].xpHeadH]));
    if (w.lineups) w.lineups[g] = Object.fromEntries(Object.keys(LINEUPS).map((id) => [id, id === 'one_each' ? w.mixed[g] : r[`${g}:line:${id}`].xpHeadH]));
  }
  return w;
}

/** The plain run's world (--reuse-world), or null: no file, a file this old, or one that is not a world. */
function keptWorld() {
  try {
    if (Date.now() - statSync(WORLD_FILE).mtimeMs > WORLD_MAX_AGE_MS) return null;
    const w = JSON.parse(readFileSync(WORLD_FILE, 'utf8'));
    return w && w.base && w.mixed && w.mono ? w : null;
  } catch { return null; }
}

async function mutate(argv) {
  const kept = argv.includes('--reuse-world') ? keptWorld() : null;
  console.log(kept ? `lineup-v4 --mutate: the plain run's measured world (${WORLD_FILE})` : 'lineup-v4 --mutate: measuring the world');
  const w = kept || await measure();
  if (judge(w).length) { console.error('lineup-v4 --mutate: the shipped game already fails (run the guard)'); process.exit(1); }
  const G = judgedOf(w.base);
  const g = G[0];
  /* the grounds where a one-style four already wins (at most one on the shipped game) are left as measured; plants go on the others */
  const clean = G.filter((x) => STYLES.every((s) => w.mono[x][s] < w.mixed[x]));
  const [c1, c2] = clean;
  const monoAt = (gg, s, k) => ({ ...w, mono: { ...w.mono, [gg]: { ...w.mono[gg], [s]: w.mixed[gg] * k } } });
  const both = (s, k) => { const a = monoAt(c1, s, k); return { ...a, mono: { ...a.mono, [c2]: { ...a.mono[c2], [s]: w.mixed[c2] * k } } }; };
  const flat = { hammer: 1, bow: 1, mage: 1, healer: 1 };
  /* a planted ground's lineups: every V4-2 lineup at `fill`, the named ones over it */
  const lines = (fill, over = {}) => ({ ...Object.fromEntries(Object.keys(LINEUPS).map((id) => [id, fill])), ...over });
  const two = (topA, topB) => ({ base: { g1: 20, g2: 20 }, mixed: { g1: 10, g2: 10 }, mono: { g1: flat, g2: flat },
    lineups: { g1: lines(5, { [topA]: 9 }), g2: lines(5, { [topB]: 9 }) } });
  /* THE BASE-TIER BOUNDARY (29 7.5): a one-style four 5% over the mixed four on a ground of base `b`, beside the same answer on a tier 8
     ground (one judged answer). Judged at item Level 20 (tier 1) it is a second ground's win, red; at 0 (tier 0) it is not judged, green */
  const beside = (b) => ({ base: { g0: b, g8: 160 }, mixed: { g0: 10, g8: 10 }, mono: { g0: { ...flat, mage: 10.5 }, g8: { ...flat, healer: 10.5 } },
    lineups: { g0: lines(5, { two_mages: 9 }), g8: lines(5, { two_bows: 9 }) } });
  /* V4-3's plants go on the grounds where no frontless four wins (the shipped game may have one such answer, left as measured) */
  const bestFronted = (x) => Math.max(...foursOf(w, x).filter(([, st]) => frontedOf(st) && st.some((s) => STYLE_ROWS[s].role === 'healer')).map(([, , v]) => v));
  const bestFrontless = (x) => Math.max(...foursOf(w, x).filter(([, st]) => !frontedOf(st)).map(([, , v]) => v));
  const cleanF = w.lineups ? G.filter((x) => bestFrontless(x) < bestFronted(x)) : [];
  const [f1, f2] = cleanF;
  const lineAt = (gg, id, v) => ({ ...w, lineups: { ...w.lineups, [gg]: { ...w.lineups[gg], [id]: v } } });
  const lineBoth = (id, k) => { const a = lineAt(f1, id, bestFronted(f1) * k); return { ...a, lineups: { ...a.lineups, [f2]: { ...a.lineups[f2], [id]: bestFronted(f2) * k } } }; };
  /* every fronted four with a healer on f1 under the best frontless one, and a four of hammers (fronted, no healer) far over it */
  const noHealerAnswer = () => {
    const low = bestFrontless(f1) * 0.5;
    const lu = Object.fromEntries(Object.entries(w.lineups[f1]).map(([id, v]) => [id, frontedOf(LINEUPS[id]) ? low : v]));
    return { ...w, mixed: { ...w.mixed, [f1]: low }, mono: { ...w.mono, [f1]: { ...w.mono[f1], hammer: bestFrontless(f1) * 3 } }, lineups: { ...w.lineups, [f1]: lu } };
  };
  /* [name, the world, red?, the claim it judges (its own lines only; null: every claim)] */
  const cases = [
    ['V4-1 a four of healers ties the mixed four on two grounds', both('healer', 1), true, 'V4-1'],
    ['V4-1 a four of mages beats the mixed four by 20% on one ground', monoAt(c1, 'mage', 1.2), true, 'V4-1'],
    ['V4-1 a one-style answer on a second ground beside the shipped one', clean.length < G.length ? monoAt(c1, 'bow', 1.05) : both('bow', 1.05), true, 'V4-1'],
    ['control: a four of mages beats the mixed four by 10% on one ground', clean.length === G.length ? monoAt(c1, 'mage', 1.1) : w, false, 'V4-1'],
    ['V4-1 a one-style answer on a ground of base tier 1 beside another ground\'s (tier 1 is judged)', beside(GEAR_STEPS.tierSteps), true, 'V4-1'],
    ['control: a one-style answer on a ground of base tier 0 beside another ground\'s (tier 0 is not judged, 29 7.5)', beside(0), false, null],
    ['V4-1 one style never measured', { ...w, mono: { ...w.mono, [g]: { ...w.mono[g], bow: undefined } } }, true, 'V4-1'],
    ['V4-1 the mixed four never measured', { ...w, mixed: { ...w.mixed, [g]: undefined } }, true, 'V4-1'],
    ['V4-2 one lineup tops both of two grounds', two('two_mages', 'two_mages'), true, 'V4-2'],
    ['V4-2 a ground with a lineup unmeasured', { ...two('two_mages', 'two_bows'), lineups: { ...two('two_mages', 'two_bows').lineups, g2: { one_each: 5 } } }, true, 'V4-2'],
    ['control: two grounds, two different best lineups', two('two_mages', 'two_bows'), false, null],
    ['V4-2 the frontless four tops both of two grounds', two('frontless_mages', 'frontless_mages'), true, 'V4-2'],
    /* one ground cut from the measured world: V4-2 is not judged with a single ground (R10 opened more, so the cut is explicit) */
    ['control: one scale ground, V4-2 not judged', { ...w, base: { [g]: w.base[g] }, lineups: null }, false, null],
    ['V4-2 every ground measured but one lineup missing on the real world', w.lineups ? { ...w, lineups: { ...w.lineups, [g]: { ...w.lineups[g], two_bows: undefined } } } : { ...two('two_mages', 'two_bows'), lineups: { g1: two('two_mages', 'two_bows').lineups.g1, g2: {} } }, true, 'V4-2'],
    ['V4-3 the frontless mage four ties the best fronted four on two grounds', lineBoth('frontless_mages', 1), true, 'V4-3'],
    ['V4-3 the frontless bow four beats the best fronted four by 20% on one ground', lineAt(f1, 'frontless_bows', bestFronted(f1) * 1.2), true, 'V4-3'],
    ['control: a frontless four beats the best fronted four by 10% on one ground', cleanF.length === G.length ? lineAt(f1, 'frontless_mages', bestFronted(f1) * 1.1) : w, false, 'V4-3'],
    ['V4-3 a four of mages is a frontless four', { ...w, mono: { ...w.mono, [f1]: { ...w.mono[f1], mage: bestFronted(f1) * 1.2 } } }, true, 'V4-3'],
    ['control: a lineup with a hammer is a fronted four', lineAt(f1, 'two_mages', Math.max(bestFronted(f1), bestFrontless(f1)) * 1.2), false, 'V4-3'],
    ['V4-3 a four of hammers (no healer) is no answer to the frontless four', noHealerAnswer(), true, 'V4-3'],
    ['V4-3 a frontless lineup never measured', lineAt(g, 'frontless_bows', undefined), true, 'V4-3'],
  ];
  let miss = 0;
  for (const [name, m, wantRed, claim] of cases) {
    const red = judge(m).filter((x) => !claim || x.startsWith(claim)).length > 0;
    const ok = red === wantRed;
    console.log(`  ${ok ? 'ok  ' : 'MISS'} ${name}`);
    if (!ok) miss += 1;
  }
  /* THE ENGINE: every one-style four 40 Levels over the mixed four must out-earn it at least once (the measure can see a winner) */
  {
    const two = clean.length >= 2 ? [c1, c2] : G;
    const played = await measure({ levelUp: 40, only: { grounds: two, kind: 'mono' } });
    const up = { ...w, mono: { ...w.mono, ...played.mono } };
    const red = judge(up).filter((x) => x.startsWith('V4-1'));
    console.log(`  ${red.length ? 'ok  ' : 'MISS'} V4-1 on the engine: one-style fours 40 Levels over the mixed four on ${two.join(', ')}${red.length ? ` (${red.length} red)` : ''}`);
    if (!red.length) miss += 1;
  }
  /* ...and the frontless lineups 40 Levels over the fronted fours must out-earn them (the measure can see a frontless winner) */
  {
    const two = cleanF.length >= 2 ? [f1, f2] : G;
    const played = await measure({ levelUp: 40, only: { grounds: two, kind: 'frontless' } });
    const up = { ...w, lineups: { ...w.lineups, ...Object.fromEntries(two.map((x) => [x, { ...w.lineups[x], ...played.lineups[x] }])) } };
    const red = judge(up).filter((x) => x.startsWith('V4-3'));
    console.log(`  ${red.length ? 'ok  ' : 'MISS'} V4-3 on the engine: the frontless fours 40 Levels over the fronted fours on ${two.join(', ')}${red.length ? ` (${red.length} red)` : ''}`);
    if (!red.length) miss += 1;
  }
  if (miss) { console.error(`\nlineup-v4 --mutate: ${miss} case(s) wrong`); process.exit(1); }
  console.log(`\nlineup-v4 --mutate: all ${cases.length + 2} cases judged as they must be`);
}

async function main(argv) {
  if (argv.includes('--mutate')) return mutate(argv);
  const w = await measure();
  if (argv.includes('--keep-world')) writeFileSync(WORLD_FILE, JSON.stringify(w));
  const out = judge(w);
  for (const x of out) console.error('✗ ' + x);
  const G = judgedOf(w.base), skipped = Object.keys(w.base).filter((g) => !G.includes(g));
  const line = G.map((g) => `${g}: mixed ${Math.round(w.mixed[g])}, ${STYLES.map((s) => `${s} x4 ${Math.round(w.mono[g][s])}`).join(', ')}`).join('; ');
  if (out.length) { console.error(`lineup-v4: ${out.length} claim(s) red`); process.exit(1); }
  console.log(`lineup-v4: green (${line} Level XP a head an hour${G.length < 2 ? '; V4-2 not judged: one judged ground' : ''}${skipped.length ? `; not judged, base tier 0 (29 7.5): ${skipped.join(', ')}` : ''})`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(2); });
