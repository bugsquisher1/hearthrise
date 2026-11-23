#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/tuning/candidates.mjs — THE TUNING PASS'S LAB CANDIDATES (lane/tuning-pass, game designer, 2026-11-23;
// docs/design/redesign/29-tuning-pass.md, 27-formula-overhaul.md section 5). Writes Lab candidates (tools/balance-program/candidates.mjs
// schema) that tools/balance-program/redesign/v1-climb.mjs plays with --candidate <path>:
//   tuning-mf            every scale ground's monster switch on ('formula'), the rest the tree
//   tuning-line-<pm>     the holder's line (danger.js HOLDER.linePm) at <pm>; with -mf the switch on as well
//   tuning-gear-<a>-<b>  the gear weights (danger.js POWER weightGearPm a, weightGearBelowPm b); with -mf the switch on as well
//
//   node tools/balance-program/redesign/tuning/candidates.mjs [--out .scratch/tuning] [--gear a-b,a-b]
//
// Exit 0 wrote · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('out', '.scratch/tuning'));
mkdirSync(OUT, { recursive: true });
const SCHEMA = 'hearthrise.balance-candidate/1';
const DJS = 'src/data/danger.js';
const src = readFileSync(join(ROOT, DJS), 'utf8');
const must = (s) => { if (src.split(s).length !== 2) { console.error('candidates: "' + s + '" is not once in ' + DJS); process.exit(2); } return s; };
const write = (c) => { writeFileSync(join(OUT, c.id + '.json'), JSON.stringify({ schema: SCHEMA, base: 'tree', assumptions: [], ...c }, null, 1) + '\n'); console.log('wrote ' + join(OUT, c.id + '.json')); };

/* the monster switch on every scale ground (each ground's row named by its own unique tail) */
const GROUND_TAILS = ["entryLevel: 55, refLevel: 60, monsters: 'rows' })", "entryLevel: 45, refLevel: 52, monsters: 'rows' })",
  "traitPool('catacomb_bone_wing'), entryLevel: 165, refLevel: 175, monsters: 'rows' })", "traitPool('catacomb_flooded_wing'), entryLevel: 165, refLevel: 175, monsters: 'rows' })"];
const mf = GROUND_TAILS.map((t) => ({ file: DJS, from: must(t), to: t.replace("monsters: 'rows'", "monsters: 'formula'") }));
const line = (pm) => ({ file: DJS, from: must('export const HOLDER = Object.freeze({ linePm: 800 });'), to: 'export const HOLDER = Object.freeze({ linePm: ' + pm + ' });' });
const POWER_LINE = must('export const POWER = Object.freeze({ weightGearPm: 1000, weightGearBelowPm: 500, weightSkillPm: 250 });');
const gear = (a, b) => ({ file: DJS, from: POWER_LINE, to: 'export const POWER = Object.freeze({ weightGearPm: ' + a + ', weightGearBelowPm: ' + b + ', weightSkillPm: 250 });' });

write({ id: 'tuning-mf', why: 'every scale ground on the monster formula', edits: mf });

/* ROUND 2 (after the first matrix, 29-tuning-pass.md section 2): only Muster Barrows' monsters carry roles, so only its switch goes on; the
   pay floor for C-5; the gear weight under the base for C-2; Bold's fall line for C-4. r2-<wB>[-b<boldFall>][-l<line>] */
const PAY_LINE = must('export const PAY = Object.freeze({ refKillsHead: 120, payStepXp: 0.007, gapMax: 120, floor: 0.5, coinPm: 6400, payStepLoot: 0.004 });');
const BOLD_LINE = must("  bold: Object.freeze({ fallPm: 120, cleanPm: 300, afterDeath: 'steady' }),");
const r2 = ({ wB, bold, ln, floor = 0.575 }) => [mf[0], { file: DJS, from: PAY_LINE, to: PAY_LINE.replace('floor: 0.5,', 'floor: ' + floor + ',') },
  ...(wB !== 500 ? [gear(1000, wB)] : []), ...(bold ? [{ file: DJS, from: BOLD_LINE, to: BOLD_LINE.replace('fallPm: 120', 'fallPm: ' + bold) }] : []), ...(ln ? [line(ln)] : [])];
for (const wB of [500, 750, 1000]) for (const bold of [0, 80, 60]) for (const ln of [0, 600, 700]) {
  if (bold && ln) continue;
  write({ id: 'tuning-r2-' + wB + (bold ? '-b' + bold : '') + (ln ? '-l' + ln : ''), why: 'round 2: Muster on the formula, floor 0.575, weightGearBelowPm ' + wB + (bold ? ', Bold fallPm ' + bold : '') + (ln ? ', holder line ' + ln : ''), edits: r2({ wB, bold, ln }) });
}
for (const pm of [600, 700]) {
  write({ id: 'tuning-line-' + pm, why: 'the holder line at ' + pm, edits: [line(pm)] });
  write({ id: 'tuning-line-' + pm + '-mf', why: 'the holder line at ' + pm + ', every scale ground on the monster formula', edits: [line(pm), ...mf] });
}
for (const [a, b] of (arg('gear', '') ? arg('gear').split(',').map((p) => p.split('-').map(Number)) : [])) {
  write({ id: 'tuning-gear-' + a + '-' + b, why: 'gear weights ' + a + ' / ' + b, edits: [gear(a, b)] });
  write({ id: 'tuning-gear-' + a + '-' + b + '-mf', why: 'gear weights ' + a + ' / ' + b + ', monster formula on', edits: [gear(a, b), ...mf] });
}
