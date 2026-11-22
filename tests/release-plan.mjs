#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/release-plan.mjs — THE BIG RELEASE'S ORDER CAN BE DERIVED: EVERY STAGED SIDECAR PLACES ITSELF (lane/r6-release-plan, 2026-11-22).
//
//   node tests/release-plan.mjs           the guard
//   node tests/release-plan.mjs --mutate  every rule of tools/release-plan.mjs switched off, and two defects planted in the real tree
//
// tools/release-plan.mjs derives the release's apply order and its one hr-accrue edge point from the sidecars and 12-targets 2.7's
// fates. This guard keeps that derivation possible on every push, so a release day never finds out late:
//   RP-1  the reader's planted trees judge as they must (tools/release-plan.mjs CASES: collisions, blocks, faults, fates)
//   RP-2  the real tree plans with NO refusal: every STAGED sidecar from 1009 classes at the edge (a new migration whose EDGE clause
//         the reader cannot class is red here, not on release day), no ordering or missing fault, no edge collision, no stale fate
//   RP-3  the plan is in replay order (tests/schema-drift.mjs's proven order), never reordered
// What it is NOT: a verdict that the release is ready. Held and blocked files are listed, not judged (`--strict` judges them).
// ci-step: economy-selftests | Release plan - every STAGED sidecar places itself, the edge point derives, no collision
// ci-run: node tests/release-plan.mjs
// ci-run: node tools/mutant-gate.mjs node tests/release-plan.mjs --mutate
// ci-run: node tools/mutant-gate.mjs node tools/release-plan.mjs --selftest
// mutant-anchors: none — every mutant is an in-memory rule switch or a planted note, never a file
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { planOf, realInput, CASES, RULES } from '../tools/release-plan.mjs';

/** Every failed claim for one world { input, rules }. */
export function judge({ input, rules = RULES }) {
  const out = [];
  const saved = { ...RULES };
  Object.assign(RULES, rules);
  try {
    for (const [name, make, ok] of CASES) { let p; try { p = make(); } catch (e) { out.push(`RP-1 ${name}: threw ${e.message}`); continue; } if (!ok(p)) out.push(`RP-1 ${name}`); }
    const p = planOf(input, rules);
    for (const r of p.refusals) out.push(`RP-2 ${r}`);
    const pos = new Map(input.chain.map((f, i) => [f, i]));
    for (let i = 1; i < p.plan.length; i++) if (pos.get(p.plan[i].file) < pos.get(p.plan[i - 1].file)) out.push(`RP-3 ${p.plan[i].file} is planned before ${p.plan[i - 1].file}, against replay order`);
    return { out, p };
  } finally { Object.assign(RULES, saved); }
}

function mutate() {
  const input = realInput();
  if (judge({ input }).out.length) { console.error('release-plan --mutate: the real tree already fails (run the guard)'); process.exit(1); }
  const mutants = [];
  for (const k of Object.keys(RULES)) mutants.push([`rule "${k}" off`, { input, rules: { ...RULES, [k]: false } }]);
  /* the real tree with one planted note: a STAGED file whose EDGE clause nobody can read */
  const first = Object.keys(input.notes).find((f) => /^1046-/.test(f));
  mutants.push(['a real sidecar with an EDGE clause the reader cannot class (RP-2)', { input: { ...input, notes: { ...input.notes, [first]: input.notes[first].replace(/EDGE:[^]*$/, 'EDGE: ask Ama.') } } }]);
  /* the real tree with an edge-first note on a file that replays before a planned apply-first file */
  mutants.push(['a real early file turned edge-first, before 1048\'s apply-first (RP-2 collision)', { input: { ...input, notes: { ...input.notes, [first]: input.notes[first].replace(/EDGE:[^]*$/, 'EDGE: deploy it with this file, edge first.') } } }]);
  let miss = 0;
  for (const [name, w] of mutants) {
    const red = judge(w).out;
    console.log(`  ${red.length ? 'ok  ' : 'MISS'} ${name}${red.length ? ` -> ${red[0].slice(0, 140)}` : ''}`);
    if (!red.length) miss += 1;
  }
  if (miss) { console.error(`\nrelease-plan --mutate: ${miss} of ${mutants.length} defects not caught`); process.exit(1); }
  console.log(`\nrelease-plan --mutate: all ${mutants.length} defects caught`);
}

function main(argv) {
  if (argv.includes('--mutate')) return mutate();
  const { out, p } = judge({ input: realInput() });
  for (const x of out) console.error('✗ ' + x);
  if (out.length) { console.error(`release-plan: ${out.length} claim(s) red`); process.exit(1); }
  console.log(`release-plan: green (${p.plan.length} planned, edge after ${p.edgeAfter || 'none'}; ${p.held.length} held, ${p.blocked.length} blocked: node tools/release-plan.mjs)`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
