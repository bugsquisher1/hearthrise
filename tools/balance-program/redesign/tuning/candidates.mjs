#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/tuning/candidates.mjs — THE TUNING PASS'S LAB CANDIDATES (lane/tuning-pass, game designer, 2026-11-23;
// docs/design/redesign/29-tuning-pass.md, 27-formula-overhaul.md section 5). Writes Lab candidates (tools/balance-program/candidates.mjs
// schema) that tools/balance-program/redesign/v1-climb.mjs plays with --candidate <path>:
//   tuning-line-<pm>     the holder's line (danger.js HOLDER.linePm) at <pm>
//   tuning-rows          every scale ground's monster switch off ('rows'), the rest the tree
//   tuning-gear-<a>-<b>  the gear weights (danger.js POWER weightGearPm a, weightGearBelowPm b)
// Every edit is read off the tree as it stands (the row's own line), so a candidate written today plays today's tree with one thing moved.
// ROUND 2's candidates (Muster on the formula, the pay floor, the gear weight under the base, Bold's fall line) were written against the
// tree before the tuning pass set those dials; they live in git (9c6c31ac2) and their runs in r2/.
//
//   node tools/balance-program/redesign/tuning/candidates.mjs [--out .scratch/tuning] [--lines 600,700] [--gear a-b,a-b]
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
const die = (m) => { console.error('candidates: ' + m); process.exit(2); };
/* the one line of danger.js that matches `re` (a candidate edits a whole line, so it is exact and unique) */
const lineOf = (re, what) => { const hits = src.split('\n').filter((l) => re.test(l)); if (hits.length !== 1) die(what + ' is ' + hits.length + ' lines in ' + DJS + ', not one'); return hits[0]; };
const write = (c) => { writeFileSync(join(OUT, c.id + '.json'), JSON.stringify({ schema: SCHEMA, base: 'tree', assumptions: [], ...c }, null, 1) + '\n'); console.log('wrote ' + join(OUT, c.id + '.json')); };

const HOLDER_LINE = lineOf(/^export const HOLDER = Object\.freeze\(\{ linePm: \d+ \}\);$/, 'the HOLDER line');
const line = (pm) => ({ file: DJS, from: HOLDER_LINE, to: HOLDER_LINE.replace(/linePm: \d+/, 'linePm: ' + pm) });
for (const pm of arg('lines', '600,700').split(',').map(Number)) write({ id: 'tuning-line-' + pm, why: 'the holder line at ' + pm, edits: [line(pm)] });

/* every scale ground's switch off: each DANGER_GROUNDS row carrying monsters: 'formula' */
const ROWS = src.split('\n').filter((l) => /^ {2}[a-z_]+: ground\(\{ refStep: .*monsters: 'formula' \}\),$/.test(l));
if (!ROWS.length) die('no DANGER_GROUNDS row on the formula');
write({ id: 'tuning-rows', why: 'every scale ground on its rows (the monster switch off)', edits: ROWS.map((l) => ({ file: DJS, from: l, to: l.replace("monsters: 'formula'", "monsters: 'rows'") })) });

const POWER_LINE = lineOf(/^export const POWER = Object\.freeze\(\{ weightGearPm: \d+, weightGearBelowPm: \d+, weightSkillPm: \d+ \}\);$/, 'the POWER line');
for (const [a, b] of (arg('gear', '') ? arg('gear').split(',').map((p) => p.split('-').map(Number)) : [])) {
  write({ id: 'tuning-gear-' + a + '-' + b, why: 'gear weights ' + a + ' / ' + b, edits: [{ file: DJS, from: POWER_LINE, to: POWER_LINE.replace(/weightGearPm: \d+, weightGearBelowPm: \d+/, 'weightGearPm: ' + a + ', weightGearBelowPm: ' + b) }] });
}
