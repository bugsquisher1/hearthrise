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
//
// EVERY OPENED ID IS A ROW (Brannoc 10-22: the hunt summary's "Open bag" called
// ctx.show('bag') while the window is 'inventory', so the button did nothing):
// each literal id under src/ given to ctx.show / ui.open / an `open:` data field
// is a window or a HUD widget row, and each given to wm.open a window row.
// (src/data/world/** is excluded: a station's `open` names a world target.)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
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

/* Every literal id opened under src/ names a row (the header's EVERY OPENED ID IS A ROW). */
function opened(base, windows, widgets, errs) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []));
  const SHOW = /\b(?:ctx\.show|ui\.open|wm\.open)\(\s*'([^']*)'|\bopen:\s*'([^']*)'/g;
  let n = 0;
  for (const f of walk(join(base, 'src'))) {
    const rel = f.slice(base.length + 1).split(String.fromCharCode(92)).join('/');
    if (rel.startsWith('src/data/world/')) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(SHOW)) {
      const id = m[1] !== undefined ? m[1] : m[2];
      const windowOnly = m[0].startsWith('wm.open');
      n++;
      if (!windows.has(id) && (windowOnly || !widgets.has(id))) errs.push('opened id `' + id + '` (' + rel + ') is no ' + (windowOnly ? 'window' : 'window or widget') + ' row');
    }
  }
  if (n < 5) errs.push('opened ids: only ' + n + ' found under src/ (the scan is broken)');
}

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
  opened(base, new Set(SHELL_WINDOWS.map((r) => r.id)), new Set(HUD_WIDGETS.map((r) => r.id)), errs);
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
  { name: 'a button opens a window id that is no row (Open bag, 10-22)', file: 'src/shell/windows/hunt-summary.js', from: "ctx.show('inventory')", to: "ctx.show('bag')", want: 'opened id `bag`' },
  { name: 'a row that breaks the widget contract', file: FILES.widgets, from: "id: 'launchers', label: 'Menu icons', layer: 'screen', anchor: 'tr'", to: "id: 'launchers', label: 'Menu icons', layer: 'screen', anchor: 'zz'", want: 'anchor must be' },
];

if (process.argv.includes('--selftest')) {
  const clean = await check(ROOT);
  if (clean.length) { console.error('shell-renderers selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'shell-renderers-'));
  try {
    let i = 0;
    for (const m of MUTANTS) {
      const base = join(tmp, String(i++));
      for (const d of ['src/data', 'src/shell', 'src/utils', 'src/session', 'src/render', 'src/hunt-view', 'src/core', 'src/social', 'src/world', 'src/net', 'src/platform']) { mkdirSync(join(base, d), { recursive: true }); cpSync(join(ROOT, d), join(base, d), { recursive: true }); }
      cpSync(join(ROOT, 'src/build-info.js'), join(base, 'src/build-info.js'));   // src/net/observability.js reads the version
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
  console.log('shell-renderers: every shell row has a renderer, every renderer a row, every opened id a row');
}
