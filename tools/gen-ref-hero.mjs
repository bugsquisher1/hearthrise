#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-ref-hero.mjs — THE REFERENCE HERO EVERY MONSTER'S AIM AND EVASION ARE WRITTEN AGAINST (src/data/to-hit.js REF_HERO;
// balance program 21-combat.md B2, build row L15).
//
// A row is [Level, main skill, Defense, worn accuracy] of the lone hammer's career:
//   main, Defense   tools/balance-sim/skill-lines.json, line `alone`, style `hammer` (the engine's own carry from Level 1, never typed);
//                   past the line's top (Level 100) each skill goes on at the XP an hour of its last ten Levels, stretched by the pace
//                   of record (core-model.js LEVEL_PACE.targets) and sqrt(L / top), the projection of tools/balance-sim/measure.mjs curves
//                   and of the measuring tool the ruling was read on (tohit-ratio.mjs, 2026-11-20)
//   accuracy        the summed `atkB` of the hammer's worn set at that Level (tools/balance-sim/gear.mjs kitOf, the best piece its Level may
//                   wear and can get, uniques in), held at the Level 110 set past 110 (no weapon line past tier 7 is open)
//
//   node tools/gen-ref-hero.mjs            write the rows into src/data/to-hit.js (between its GENERATED markers)
//   node tools/gen-ref-hero.mjs --check    exit 1 when the committed rows are not this tree's (tests/balance-sheet.mjs runs it)
//   node tools/gen-ref-hero.mjs --print    the rows, one a line, nothing written
//
// WHEN IT MOVES: the skill lines are re-measured (skill-lines.mjs --write), the pace of record moves, or the hammer's kit gains
// accuracy. Then: this --write, then every formula row (node tools/gen-ground-stats.mjs --write; node tools/pack.mjs propose <g> --write),
// then the edge deploy. The rows reach no SQL catalogue: the engine reads a monster's two numbers, never this table.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { sourceQuery } from './lib/version-stamp.mjs';
import { loadGear } from './balance-sim/gear.mjs';
import { loadLines, skillsAt } from './balance-sim/skill-lines.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = join(ROOT, 'src', 'data', 'to-hit.js');
/* the Levels a row is read at: every 5 to 100 (the measured line), then sparser to Level 1,000 (the pace of record's last target) */
export const REF_LEVELS = Object.freeze([1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  110, 125, 140, 165, 200, 240, 300, 400, 500, 600, 750, 1000]);
/* the Level the worn set is held at past it (the weapon and armor lines stop at tier 7: hunt-grounds' last open band) */
const KIT_TOP = 110;
const START = '/* GENERATED: REF_HERO (tools/gen-ref-hero.mjs) */';
const END = '/* END GENERATED: REF_HERO */';

/** The rows, from this tree's skill lines, curves, pace and gear. */
export async function refRows(root = ROOT) {
  const u = (p) => pathToFileURL(join(root, p)).href + sourceQuery(root);
  const XP = await import(u('src/core/xp.js'));
  const { LEVEL_PACE } = await import(u('src/data/core-model.js'));
  const gear = await loadGear(root);
  const lines = loadLines(join(root, 'tools', 'balance-sim', 'skill-lines.json'));
  if (!lines) throw new Error('gen-ref-hero: no tools/balance-sim/skill-lines.json');
  const top = lines.top;
  const hoursAt = (L) => {
    const t = LEVEL_PACE.targets;
    for (let i = 1; i < t.length; i++) if (L <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (L - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
    return t[t.length - 1][1];
  };
  const lineAt = (k, L) => skillsAt(lines, 'alone', 'hammer', Math.min(L, top))[k];
  const project = (k, L) => {
    if (L <= top) return lineAt(k, L);
    const s1 = lineAt(k, top), s0 = lineAt(k, top - 10);
    const rate = (XP.skillXpForLevel(k, s1) - XP.skillXpForLevel(k, s0)) / (hoursAt(top) - hoursAt(top - 10));
    return XP.skillLevelFromXp(k, XP.skillXpForLevel(k, s1) + rate * (hoursAt(L) - hoursAt(top)) * Math.sqrt(L / top));
  };
  const accOf = (L) => {
    const kit = gear.kitOf('hammer', Math.min(L, KIT_TOP), { uniques: true });
    let a = 0;
    for (const id of Object.values(kit.equipment || kit)) { const it = gear.ITEMS[id]; if (it) a += it.atkB || 0; }
    return a;
  };
  return REF_LEVELS.map((L) => [L, project('melee', Math.max(5, L)), project('defense', Math.max(5, L)), accOf(Math.max(5, L))]);
}

/** The block the rows are written as (the house style: four rows a line). */
export function block(rows) {
  const out = [START, 'export const REF_HERO = Object.freeze(['];
  for (let i = 0; i < rows.length; i += 4) out.push('  ' + rows.slice(i, i + 4).map((r) => '[' + r.join(', ') + ']').join(', ') + ',');
  out.push('].map((r) => Object.freeze(r)));', END);
  return out.join('\n');
}

function splice(text, next) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error('gen-ref-hero: src/data/to-hit.js lost its GENERATED markers');
  return text.slice(0, a) + next + text.slice(b + END.length);
}

async function main() {
  const argv = process.argv.slice(2);
  const rows = await refRows();
  for (const r of rows) if (!r.every((n) => Number.isInteger(n) && n >= 0)) throw new Error('gen-ref-hero: a row is not whole numbers: ' + JSON.stringify(r));
  if (argv.includes('--print')) { for (const r of rows) console.log(r.join(' | ')); return; }
  const text = readFileSync(TARGET, 'utf8');
  const next = splice(text, block(rows));
  if (argv.includes('--check')) {
    if (next !== text) { console.error('gen-ref-hero --check: RED, src/data/to-hit.js REF_HERO is not this tree\'s reference hero (node tools/gen-ref-hero.mjs, then the formula rows)'); process.exit(1); }
    console.log('gen-ref-hero --check: green, REF_HERO is this tree\'s (' + rows.length + ' rows)');
    return;
  }
  writeFileSync(TARGET, next);
  console.log('gen-ref-hero: wrote ' + rows.length + ' rows into src/data/to-hit.js');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
