#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hud-layout-display-only.mjs — THE HUD LAYOUT GATES NOTHING AND SPENDS NOTHING
//
//   node tests/hud-layout-display-only.mjs             the guard
//   node tests/hud-layout-display-only.mjs --selftest  plants reads and calls; must go red
//
// `hudLayout` is a residue field (src/session/residue.js RESIDUE_FIELDS): the
// player's own copy, restorable and forgeable, which is why CLAUDE.md §6 allows
// it only for display. The World shell's widget layout is exactly that. This
// guard keeps it that way mechanically:
//   D1  the name `hudLayout` appears (outside comments) only in the residue
//       store (src/session/residue.js) and the HUD (src/shell/hud.js); the
//       in-page suite (src/features/smoke/**) may read it to test it
//   D2  src/shell/hud.js imports nothing from src/net, src/core or the engine,
//       and calls no intent, RPC, fetch or server client
// A new reader is a design decision: move the field out of the residue first.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HUD = 'src/shell/hud.js';
const STORE = 'src/session/residue.js';
const ALLOWED = new Set([HUD, STORE]);
const TEST_DIR = 'src/features/smoke/';
const NAME = /\bhudLayout\b/;
const HUD_IMPORT_OK = /^\.\.\/utils\/dom\.js(\?v=\d[\d.]*)?$/;
const HUD_FORBIDDEN = /\b(fetch|sendIntent|sendActivity|putClientState|rpc|supabase|XMLHttpRequest|WebSocket|Hearthrise(?:Accrual|Gold|Sync|Net|Intent)\w*)\b/;

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

function walk(dir, out) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

function check(base) {
  const errs = [];
  const files = walk(join(base, 'src'), []);
  const idx = join(base, 'index.html');
  try { readFileSync(idx); files.push(idx); } catch { /* a temp tree has none */ }
  for (const abs of files) {
    const rel = relative(base, abs).split(sep).join('/');
    if (ALLOWED.has(rel) || rel.startsWith(TEST_DIR)) continue;
    const code = stripComments(readFileSync(abs, 'utf8'));
    const lines = code.split('\n');
    lines.forEach((l, i) => { if (NAME.test(l)) errs.push('D1 ' + rel + ':' + (i + 1) + ' reads hudLayout — a display preference may not feed anything outside the HUD'); });
  }
  const hud = stripComments(readFileSync(join(base, HUD), 'utf8'));
  for (const m of hud.matchAll(/\bimport\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g)) {
    if (!HUD_IMPORT_OK.test(m[1])) errs.push('D2 ' + HUD + ' imports ' + m[1] + ' — the HUD may import only the DOM helpers');
  }
  for (const m of hud.matchAll(/\bimport\s*\(/g)) errs.push('D2 ' + HUD + ' has a dynamic import at offset ' + m.index);
  hud.split('\n').forEach((l, i) => { const m = l.match(HUD_FORBIDDEN); if (m) errs.push('D2 ' + HUD + ':' + (i + 1) + ' names `' + m[1] + '` — the HUD layout talks to no server'); });
  return errs;
}

const PLANTS = [
  { name: 'a gate reads the layout', file: 'src/features/plant.js', text: 'export function canBuy(G) { return !!(G.hudLayout && G.hudLayout.desktop); }\n', want: 'D1 src/features/plant.js' },
  { name: 'a bracket read in net/', file: 'src/net/plant.js', text: "export const x = (G) => G['hudLayout'];\n", want: 'D1 src/net/plant.js' },
  { name: 'the HUD imports the network', file: HUD, prepend: "import { putClientState } from '../net/client-state.js';\n", want: 'imports ../net/client-state.js' },
  { name: 'the HUD calls fetch', file: HUD, append: "\nexport function leak(v) { return fetch('/x', { body: JSON.stringify(v) }); }\n", want: 'names `fetch`' },
  { name: 'the HUD dynamic-imports the engine', file: HUD, append: "\nexport const later = () => import('../core/combat-sim.js');\n", want: 'dynamic import' },
];
const CONTROLS = [
  { name: 'a comment that mentions it', file: 'src/features/plant.js', text: '// hudLayout is a display preference\nexport const y = 1;\n' },
  { name: 'the in-page suite reads it', file: 'src/features/smoke/plant.js', text: 'export const z = (G) => G.hudLayout;\n' },
];

function plantTree(tmp, i, p) {
  const base = join(tmp, String(i));
  for (const d of ['src/shell', 'src/net']) mkdirSync(join(base, d), { recursive: true });
  cpSync(join(ROOT, 'src/shell'), join(base, 'src/shell'), { recursive: true });
  cpSync(join(ROOT, STORE), join(base, STORE));
  const at = join(base, p.file);
  mkdirSync(dirname(at), { recursive: true });
  if (p.text) writeFileSync(at, p.text);
  else { const s = readFileSync(at, 'utf8'); writeFileSync(at, (p.prepend || '') + s + (p.append || '')); }
  return base;
}

if (process.argv.includes('--selftest')) {
  const clean = check(ROOT);
  if (clean.length) { console.error('hud-layout-display-only selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'hud-display-only-'));
  try {
    let i = 0;
    for (const p of PLANTS) {
      const errs = check(plantTree(tmp, i++, p));
      if (!errs.some((e) => e.includes(p.want))) { console.error('  MISSED: ' + p.name + ' ' + JSON.stringify(errs)); process.exit(1); }
      console.log('  caught  ' + p.name);
    }
    for (const c of CONTROLS) {
      const errs = check(plantTree(tmp, i++, c));
      if (errs.length) { console.error('  FALSE POSITIVE: ' + c.name + ' ' + JSON.stringify(errs)); process.exit(1); }
      console.log('  green   ' + c.name + ' (control)');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('hud-layout-display-only selftest: ' + PLANTS.length + ' plants caught, ' + CONTROLS.length + ' controls green');
} else {
  const errs = check(ROOT);
  if (errs.length) { console.error('hud-layout-display-only: RED\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('hud-layout-display-only: hudLayout is read only by the HUD and the residue store');
}
