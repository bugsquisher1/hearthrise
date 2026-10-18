#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/shell-renderers.mjs — EVERY SHELL ROW HAS A RENDERER, EVERY RENDERER A ROW
//
//   node tests/shell-renderers.mjs             the guard
//   node tests/shell-renderers.mjs --selftest  plants each defect into a temp copy
//
// A window or a HUD widget is a DATA ROW (src/data/shell-windows.js,
// src/data/hud-widgets.js) plus a renderer under the same id
// (src/shell/renderers.js). A row with no renderer is a launcher that opens an
// empty frame, which the spec forbids (WORLD_SHELL.md §1: never a "coming
// soon"); a renderer with no row is dead code nothing can open. Both rows must
// also pass their manager's own contract validation, and every renderer must
// return markup for a minimal shell context.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  windows: 'src/data/shell-windows.js',
  widgets: 'src/data/hud-widgets.js',
  renderers: 'src/shell/renderers.js',
  wm: 'src/shell/window-manager.js',
  hud: 'src/shell/hud.js',
};

async function check(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const { SHELL_WINDOWS } = await import(u(FILES.windows));
  const { HUD_WIDGETS } = await import(u(FILES.widgets));
  const { WINDOW_RENDERERS, WIDGET_RENDERERS } = await import(u(FILES.renderers));
  const WM = await import(u(FILES.wm));
  const HUD = await import(u(FILES.hud));
  const errs = [];
  const pair = (kind, rows, renderers) => {
    const ids = new Set(rows.map((r) => r.id));
    for (const id of ids) if (typeof renderers[id] !== 'function') errs.push(kind + ' row `' + id + '` has no renderer in ' + FILES.renderers);
    for (const id of Object.keys(renderers)) if (!ids.has(id)) errs.push(kind + ' renderer `' + id + '` has no row');
  };
  pair('window', SHELL_WINDOWS, WINDOW_RENDERERS);
  pair('widget', HUD_WIDGETS, WIDGET_RENDERERS);
  try { WM.validateWindowRows(SHELL_WINDOWS); } catch (e) { errs.push(e.message); }
  try { HUD.validateWidgetRows(HUD_WIDGETS); } catch (e) { errs.push(e.message); }
  if (errs.length) return errs;
  /* Every renderer draws for a minimal real context (no DOM: they return HTML). */
  const wm = WM.createWindowManager({ windows: SHELL_WINDOWS, isPhone: () => false, world: () => ({ width: 1440, height: 860 }), reducedMotion: () => true });
  const hud = HUD.createHud({ widgets: HUD_WIDGETS, sizeClass: () => 'desktop', store: { read: () => null, write() {} } });
  const ctx = { wm, hud, glyphs: {}, G: {}, refresh() {} };
  for (const [kind, map] of [['window', WINDOW_RENDERERS], ['widget', WIDGET_RENDERERS]]) {
    for (const [id, fn] of Object.entries(map)) {
      let html;
      try { html = fn(ctx); } catch (e) { errs.push(kind + ' renderer `' + id + '` threw: ' + e.message); continue; }
      if (typeof html !== 'string' || !html.trim()) errs.push(kind + ' renderer `' + id + '` returned no markup');
    }
  }
  return errs;
}

const MUTANTS = [
  { name: 'a window row with no renderer', file: FILES.windows, from: 'Object.freeze([\n', to: "Object.freeze([\n  Object.freeze({ id: 'ghost', label: 'Ghost', key: 'g', glyph: 'uiSettings', width: 300, object: 'plain' }),\n", want: 'window row `ghost`' },
  { name: 'a widget row with no renderer', file: FILES.widgets, from: 'Object.freeze([\n', to: "Object.freeze([\n  Object.freeze({ id: 'ghost', label: 'Ghost', layer: 'world', anchor: 'tl', dx: 0, dy: 0, min: [1, 1], opacity: 1, visible: true, removable: true, when: 'always', phone: {} }),\n", want: 'widget row `ghost`' },
  { name: 'a window renderer with no row', file: FILES.renderers, from: 'export const WINDOW_RENDERERS = Object.freeze({\n', to: 'export const WINDOW_RENDERERS = Object.freeze({\n  ghost: () => \'<p>x</p>\',\n', want: 'window renderer `ghost`' },
  { name: 'a widget renderer with no row', file: FILES.renderers, from: 'export const WIDGET_RENDERERS = Object.freeze({\n', to: 'export const WIDGET_RENDERERS = Object.freeze({\n  ghost: () => \'<p>x</p>\',\n', want: 'widget renderer `ghost`' },
  { name: 'a renderer that draws nothing', file: FILES.renderers, from: '  launchers: renderLaunchers,', to: "  launchers: () => '',", want: 'returned no markup' },
  { name: 'a row that breaks the widget contract', file: FILES.widgets, from: "anchor: 'tr'", to: "anchor: 'zz'", want: 'anchor must be' },
];

if (process.argv.includes('--selftest')) {
  const clean = await check(ROOT);
  if (clean.length) { console.error('shell-renderers selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'shell-renderers-'));
  try {
    let i = 0;
    for (const m of MUTANTS) {
      const base = join(tmp, String(i++));
      for (const d of ['src/data', 'src/shell', 'src/utils', 'src/session', 'src/render', 'src/hunt-view', 'src/core', 'src/world']) { mkdirSync(join(base, d), { recursive: true }); cpSync(join(ROOT, d), join(base, d), { recursive: true }); }
      const p = join(base, m.file), src = readFileSync(p, 'utf8');
      if (!src.includes(m.from)) { console.error('selftest anchor missing for: ' + m.name); process.exit(2); }
      writeFileSync(p, src.replace(m.from, m.to));
      const errs = await check(base);
      if (!errs.some((e) => e.includes(m.want))) { console.error('  MISSED: ' + m.name + ' (got ' + JSON.stringify(errs) + ')'); process.exit(1); }
      console.log('  caught  ' + m.name);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('shell-renderers selftest: ' + MUTANTS.length + '/' + MUTANTS.length + ' planted defects caught');
} else {
  const errs = await check(ROOT);
  if (errs.length) { console.error('shell-renderers: RED\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('shell-renderers: every shell row has a renderer and every renderer a row');
}
