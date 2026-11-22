#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/engine-checks.mjs — THE ENGINE CHECKS THE PLAN ASKS OF FB-3 (13-build-plan.md item 18; 06-mmo-layer.md 2.6).
//
// MM-41 (DECIDED, Fable 2026-11-21): before either arena is planned, can heroes stand on the enemy side of the engine and run their bars there,
// how long does a 90-second fight of eight take, and does one style win every time. This reads the engine's own source for where it fixes the
// two sides (a hero's bar, its targets and every enemy test read 'hero' against 'mon'), and times the proxy fight it can play today: the
// matrix four at Levels 25, 60 and 110, MID, against a pull of four on Normal, 90 seconds, 12 seeds, one worker (the cell harness in node).
// A READING, never a gate: it plays a few seconds and prints.
//
//   node tools/balance-program/engine-checks.mjs --mm41
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!process.argv.includes('--mm41')) { console.error('engine-checks: --mm41'); process.exit(2); }
/* 1. where the engine fixes the sides: a raw read of the unit's kind field outside src/core/hunt/sides.js (93 in 22 modules on
   2026-11-21, pull-cycle.js's party helper `heroes(inst)` among them; the side seam, lane/w1-side-seam, routes each through sides.js:
   an enemy/ally test by side, or a kind test, the party helper's by kind: the pull cycle's party is hunt structure) */
const dir = join(ROOT, 'src/core/hunt'), rx = /side === 'mon'|side === 'hero'|side !== 'hero'|side !== 'mon'|livingOf\(inst, 'mon'\)|livingOf\(inst, 'hero'\)/g;
const bySide = /\bisEnemy\(|\bisAlly\(|\bsideOf\(|\b(foesOf|engagedFoesOf|targetedFoesOf|alliesByIdOf|livingOf)\(|\bengaged\(inst, /g;
const byKind = /\bisHero\(|\bisMonster\(|\b(engagedMonstersOf|livingMonstersOf|livingHeroesOf|heroUnitsOf|heroesByIdOf)\(|\bheroes\(inst\)/g;
let total = 0; const by = []; let sides = 0, kinds = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'sides.js' && x !== 'unit-index.js')) {
  const src = readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const n = (src.match(rx) || []).length; if (n) { total += n; by.push([f, n]); }
  sides += (src.match(bySide) || []).length; kinds += (src.match(byKind) || []).length;
}
by.sort((a, b) => b[1] - a[1]);
console.log('SIDE-FIXED SITES: ' + total + ' in ' + by.length + ' engine modules' + (by.length ? ': ' + by.slice(0, 8).map(([f, n]) => f + ' ' + n).join(', ') : '')
  + ' | THROUGH sides.js: ' + sides + ' by side (enemy / ally), ' + kinds + ' by kind');
/* 2. a fight of eight for 90 seconds: the matrix four at Level 60, MID, a pull of four on Normal, timed per seed */
const { loadGridData, buildCell } = await import('./progression-grid.mjs');
const { loadKits } = await import('./grid-kit.mjs');
const BM = await import('./balance-matrix.mjs');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);
const out = [];
for (const L of [25, 60, 110]) {
  const ground = D.groundAt(L, 4), b = buildCell(D, K, { L, gear: 'mid', styles: ['hammer', 'bow', 'mage', 'healer'], tier: 'normal', ground });
  const jobs = Array.from({ length: 12 }, (_, s) => ({ id: 'mm41:' + L + '#' + s, key: 'mm41:' + L, whatIf: b.whatIf, cell: { ...b.cell, id: 'mm41:' + L, hours: 90 / 3600, seeds: 1, seedBase: s, density: 4 } }));
  const r = await BM.playJobs(jobs, ROOT, 1);
  out.push(L + ': ' + (r.workerMs / jobs.length).toFixed(1) + ' ms a fight (' + Object.keys(r.results).length + ' played, ' + r.errors.length + ' errors)');
}
console.log('A 90-SECOND FIGHT OF EIGHT (proxy: the four against a pull of four, the cell harness in node on this PC, one worker): ' + out.join(' | '));
