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
//         with one ground it is printed as not judged, and the rule itself is proven on planted grounds in --mutate.
// Measured 2026-11-22 on muster_barrows, Level 60, 3 seeds x 2 h: mixed 0.88x the hours table; healer x4 0.58x, mage x4 0.43x,
// hammer x4 0.19x, bow x4 0.19x.
//
//   node tests/lineup-v4.mjs           the guard (about 20 s on 8 workers)
//   node tests/lineup-v4.mjs --mutate  planted readings, and one engine mutant: the one-style four 40 Levels over the mixed one must win
// ci-step: client-guards-2 | Lineups (V4, T-03 retired) - a mixed four beats a four of one style at its held depth
// ci-run: node tests/lineup-v4.mjs
// ci-run: node tools/mutant-gate.mjs node tests/lineup-v4.mjs --mutate
// mutant-anchors: none — every mutant is a planted reading or an engine cell played in memory, never a file
// ════════════════════════════════════════════════════════════════════════
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { DANGER_GROUNDS } from '../src/data/danger.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { playCells } from '../tools/balance-program/redesign/held-four.mjs';
import { refLevelOf } from './level-curve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIXED = ['hammer', 'bow', 'mage', 'healer'];
export const STYLES = ['hammer', 'bow', 'mage', 'healer'];
/* V4-2's lineups: mixed fours of different shapes (one of each, and each with one seat doubled) */
export const LINEUPS = {
  one_each: MIXED,
  two_hammers: ['hammer', 'hammer', 'mage', 'healer'],
  two_bows: ['hammer', 'bow', 'bow', 'healer'],
  two_mages: ['hammer', 'mage', 'mage', 'healer'],
};
const SEEDS = 3, HOURS = 2;
/* V4-1's one ground (the designer, lane/designer-reads-1123 2026-11-23, 29-tuning-pass.md 7.3): a four of one style that wins ONE scale
   ground is that ground's answer, a theorycrafted build Tyler's rulings never squeeze (the healer four on the Bone Wing, 1.105: it holds
   the band's top with no death). It may win there by at most this much. Winning a second ground, or one by more, is a monoculture */
export const V4_ANSWER_MAX = 1.15;

/** Every failed claim. w = { grounds: [id], mixed: {g: xp}, mono: {g: {style: xp}}, lineups: {g: {id: xp}} | null }. Pure. */
export function judge(w) {
  const out = [];
  const wins = [];
  for (const g of w.grounds) {
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
  if (w.grounds.length >= 2) {
    const tops = w.grounds.map((g) => {
      const row = (w.lineups && w.lineups[g]) || {};
      const ids = Object.keys(LINEUPS).filter((id) => Number.isFinite(row[id]));
      if (ids.length < Object.keys(LINEUPS).length) { out.push(`V4-2: ${g}: not every lineup was measured`); return null; }
      return ids.reduce((a, b) => (row[b] > row[a] ? b : a));
    });
    if (tops.every((t) => t && t === tops[0])) out.push(`V4-2: ${tops[0]} is the best lineup on every scale ground (${w.grounds.join(', ')}): no lineup may be best everywhere`);
  }
  return out;
}

async function measure({ monoLevelUp = 0 } = {}) {
  const grounds = Object.keys(DANGER_GROUNDS);
  const cells = [];
  for (const g of grounds) {
    const L = refLevelOf(g);
    if (!Number.isInteger(L)) throw new Error(`lineup-v4: scale ground ${g} has no reference Level (tests/level-curve.mjs REF_LEVEL)`);
    /* A GROUND WHOSE HUNT ENDS AT A LEVEL (hunt-grounds.js endsAtLevel: the Mill Cellar's at 5) holds every four at its Level (held-four.mjs
       holdLevel, as tests/level-curve.mjs C7 does): a Level 3 four is outgrown inside the window, so every four would read the same XP, the
       XP to the exit over two hours (4,574 a head an hour, mixed and mage alike), and V4 would judge the exit, not the lineup */
    const hold = Number.isInteger(HUNT_GROUNDS[g] && HUNT_GROUNDS[g].endsAtLevel) ? { holdLevel: true } : {};
    cells.push({ id: `${g}:mixed`, ground: g, L, styles: MIXED, risk: 'steady', hours: HOURS, seeds: SEEDS, ...hold });
    for (const s of STYLES) cells.push({ id: `${g}:mono:${s}`, ground: g, L: L + monoLevelUp, styles: [s, s, s, s], risk: 'steady', hours: HOURS, seeds: SEEDS, ...hold });
    if (grounds.length >= 2) for (const [id, st] of Object.entries(LINEUPS)) cells.push({ id: `${g}:line:${id}`, ground: g, L, styles: st, risk: 'steady', hours: HOURS, seeds: SEEDS, ...hold });
  }
  const r = await playCells(ROOT, cells);
  const w = { grounds, mixed: {}, mono: {}, lineups: grounds.length >= 2 ? {} : null };
  for (const g of grounds) {
    w.mixed[g] = r[`${g}:mixed`].xpHeadH;
    w.mono[g] = Object.fromEntries(STYLES.map((s) => [s, r[`${g}:mono:${s}`].xpHeadH]));
    if (w.lineups) w.lineups[g] = Object.fromEntries(Object.keys(LINEUPS).map((id) => [id, r[`${g}:line:${id}`].xpHeadH]));
  }
  return w;
}

async function mutate() {
  const w = await measure();
  if (judge(w).length) { console.error('lineup-v4 --mutate: the shipped game already fails (run the guard)'); process.exit(1); }
  const g = w.grounds[0];
  /* the grounds where a one-style four already wins (at most one on the shipped game) are left as measured; plants go on the others */
  const clean = w.grounds.filter((x) => STYLES.every((s) => w.mono[x][s] < w.mixed[x]));
  const [c1, c2] = clean;
  const monoAt = (gg, s, k) => ({ ...w, mono: { ...w.mono, [gg]: { ...w.mono[gg], [s]: w.mixed[gg] * k } } });
  const both = (s, k) => { const a = monoAt(c1, s, k); return { ...a, mono: { ...a.mono, [c2]: { ...a.mono[c2], [s]: w.mixed[c2] * k } } }; };
  const two =(topA, topB) => ({ grounds: ['g1', 'g2'], mixed: { g1: 10, g2: 10 }, mono: { g1: { hammer: 1, bow: 1, mage: 1, healer: 1 }, g2: { hammer: 1, bow: 1, mage: 1, healer: 1 } },
    lineups: { g1: { one_each: 5, two_hammers: 5, two_bows: 5, two_mages: 5, [topA]: 9 }, g2: { one_each: 5, two_hammers: 5, two_bows: 5, two_mages: 5, [topB]: 9 } } });
  const cases = [
    ['V4-1 a four of healers ties the mixed four on two grounds', both('healer', 1), true],
    ['V4-1 a four of mages beats the mixed four by 20% on one ground', monoAt(c1, 'mage', 1.2), true],
    ['V4-1 a one-style answer on a second ground beside the shipped one', clean.length < w.grounds.length ? monoAt(c1, 'bow', 1.05) : both('bow', 1.05), true],
    ['control: a four of mages beats the mixed four by 10% on one ground', clean.length === w.grounds.length ? monoAt(c1, 'mage', 1.1) : w, false],
    ['V4-1 one style never measured', { ...w, mono: { ...w.mono, [g]: { ...w.mono[g], bow: undefined } } }, true],
    ['V4-1 the mixed four never measured', { ...w, mixed: { ...w.mixed, [g]: undefined } }, true],
    ['V4-2 one lineup tops both of two grounds', two('two_mages', 'two_mages'), true],
    ['V4-2 a ground with a lineup unmeasured', { ...two('two_mages', 'two_bows'), lineups: { ...two('two_mages', 'two_bows').lineups, g2: { one_each: 5 } } }, true],
    ['control: two grounds, two different best lineups', two('two_mages', 'two_bows'), false],
    /* one ground cut from the measured world: V4-2 is not judged with a single ground (R10 opened more, so the cut is explicit) */
    ['control: one scale ground, V4-2 not judged', { ...w, grounds: [g], lineups: null }, false],
    ['V4-2 every ground measured but one lineup missing on the real world', w.lineups ? { ...w, lineups: { ...w.lineups, [g]: { ...w.lineups[g], two_bows: undefined } } } : { ...two('two_mages', 'two_bows'), lineups: { g1: two('two_mages', 'two_bows').lineups.g1, g2: {} } }, true],
  ];
  let miss = 0;
  for (const [name, m, wantRed] of cases) {
    const red = judge(m).length > 0;
    const ok = red === wantRed;
    console.log(`  ${ok ? 'ok  ' : 'MISS'} ${name}`);
    if (!ok) miss += 1;
  }
  /* THE ENGINE: every one-style four 40 Levels over the mixed four must out-earn it at least once (the measure can see a winner) */
  {
    const up = await measure({ monoLevelUp: 40 });
    const red = judge(up).filter((x) => x.startsWith('V4-1'));
    console.log(`  ${red.length ? 'ok  ' : 'MISS'} V4-1 on the engine: one-style fours 40 Levels over the mixed four${red.length ? ` (${red.length} red)` : ''}`);
    if (!red.length) miss += 1;
  }
  if (miss) { console.error(`\nlineup-v4 --mutate: ${miss} case(s) wrong`); process.exit(1); }
  console.log(`\nlineup-v4 --mutate: all ${cases.length + 1} cases judged as they must be`);
}

async function main(argv) {
  if (argv.includes('--mutate')) return mutate();
  const w = await measure();
  const out = judge(w);
  for (const x of out) console.error('✗ ' + x);
  const line = w.grounds.map((g) => `${g}: mixed ${Math.round(w.mixed[g])}, ${STYLES.map((s) => `${s} x4 ${Math.round(w.mono[g][s])}`).join(', ')}`).join('; ');
  if (out.length) { console.error(`lineup-v4: ${out.length} claim(s) red`); process.exit(1); }
  console.log(`lineup-v4: green (${line} Level XP a head an hour${w.grounds.length < 2 ? '; V4-2 not judged: one scale ground until R10' : ''})`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(2); });
