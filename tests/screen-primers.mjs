#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/screen-primers.mjs — THE FIRST-FIVE-MINUTES COPY MAY NOT LIE
//
//   node tests/screen-primers.mjs             the guard
//   node tests/screen-primers.mjs --selftest  one clean arm + one planted defect per rule
//
// Pack 1 (First Steps) put one "what is this screen for?" primer on eight
// panels (src/data/screen-primers.js) and rewrote three tour sentences that
// told a new player something the game does not do. Copy has no runtime
// failure mode: a false sentence renders exactly as well as a true one. So
// each rule below ties a sentence to the source fact that makes it true.
//
//   G1  every key is a real panel id (index.html + `.id = 'panel-…'` in src/**)
//   G2  title 4-32 chars; body 80-260 chars, ending in '.'
//   G3  no digits, emoji, <, > or & (a number in copy is a number that drifts)
//   G4  bodies are unique
//   G5  the table and every row are frozen
//   G6  the edge bundle never carries it; no src/core or src/data file imports it
//   G7  the Shop row says the web beta cannot buy while legacy.js refuses every
//       purchase; the Events row names no muster/rally/clan boss while
//       CLAN_LAUNCHED = false
//   G8  src/ftue.js carries none of the retired sentences, and the combat step
//       keeps the live Recovery Rule clauses
//
// Pairs with FIRST-LIGHT-4 (src/features/smoke/monsters-inventory-and-brand.js),
// which checks the same combat step in-page against the live constants.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'src/data/screen-primers.js';
const RETIRED = /15 Marks|until you own Auto-Eat|stops you dying|no save button/;
const LIVE_RULE = ['knocked out', 'carry on with the same fight', 'first fall of each day costs you no time at all', 'retreat to camp'];
const posix = (p) => p.split(sep).join('/');

function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) jsFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function panelIds(root) {
  const ids = new Set();
  for (const m of readFileSync(join(root, 'index.html'), 'utf8').matchAll(/id="(panel-[a-z-]+)"/g)) ids.add(m[1]);
  for (const f of jsFiles(join(root, 'src'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\.id\s*=\s*['"](panel-[a-z-]+)['"]/g)) ids.add(m[1]);
  }
  return ids;
}

/** The combat step's body, read from source (the step table is not importable in node). */
function combatBody(ftue) {
  const at = ftue.indexOf("id: 'combat'");
  if (at < 0) return null;
  const m = /\bbody:\s*'((?:[^'\\]|\\.)*)'/.exec(ftue.slice(at));
  return m ? m[1].replace(/\\'/g, "'") : null;
}

async function check(root, origins) {
  const fails = [];
  const fail = (g, msg) => fails.push(`${g}: ${msg}`);
  const mod = await import(pathToFileURL(join(root, DATA)).href + '?t=' + Date.now() + Math.random());
  const P = mod.SCREEN_PRIMERS;
  if (!P || typeof P !== 'object') return ['G0: SCREEN_PRIMERS is not exported'];
  const keys = Object.keys(P);
  if (keys.length === 0) fail('G0', 'the table is empty — every rule below would pass vacuously');

  const ids = panelIds(root);
  for (const k of keys) if (!ids.has(k)) fail('G1', `${k} is not a panel id anywhere in index.html or src/**`);

  const bodies = new Set();
  for (const k of keys) {
    const { title, body } = P[k] || {};
    const t = String(title || ''), b = String(body || '');
    if (t.length < 4 || t.length > 32) fail('G2', `${k} title is ${t.length} chars (4-32)`);
    if (b.length < 80 || b.length > 260 || !b.endsWith('.')) fail('G2', `${k} body is ${b.length} chars or does not end in '.' (80-260)`);
    if (/[0-9<>&]|\p{Extended_Pictographic}/u.test(t + b)) fail('G3', `${k} carries a digit, emoji or markup character`);
    if (bodies.has(b)) fail('G4', `${k} repeats another row's body`);
    bodies.add(b);
    if (!Object.isFrozen(P[k])) fail('G5', `${k} row is not frozen`);
  }
  if (!Object.isFrozen(P)) fail('G5', 'SCREEN_PRIMERS is not frozen');

  if (origins.some((o) => /screen-primers/.test(o))) fail('G6', 'the hr-accrue bundle carries a screen-primers origin');
  for (const f of [...jsFiles(join(root, 'src', 'core')), ...jsFiles(join(root, 'src', 'data'))]) {
    if (posix(relative(root, f)) === DATA) continue;
    if (/from\s*['"][^'"]*screen-primers\.js/.test(readFileSync(f, 'utf8'))) fail('G6', `${posix(relative(root, f))} imports the primer table`);
  }

  const legacy = readFileSync(join(root, 'src', 'legacy.js'), 'utf8');
  const clans = readFileSync(join(root, 'src', 'features', 'clans.js'), 'utf8');
  if (legacy.includes('not available in the web beta') && !/the web beta cannot buy/.test((P['panel-shop'] || {}).body || '')) {
    fail('G7', 'the web beta refuses every purchase (legacy.js) and the Shop primer does not say so');
  }
  if (/CLAN_LAUNCHED\s*=\s*false/.test(clans) && /muster|rally|clan boss/i.test((P['panel-events'] || {}).body || '')) {
    fail('G7', 'CLAN_LAUNCHED is false and the Events primer names a clan feature');
  }

  const ftue = readFileSync(join(root, 'src', 'ftue.js'), 'utf8');
  const hit = RETIRED.exec(ftue);
  if (hit) fail('G8', `src/ftue.js still carries a retired sentence: "${hit[0]}"`);
  const combat = combatBody(ftue);
  if (combat == null) fail('G8', 'no combat step body found in src/ftue.js');
  else for (const c of LIVE_RULE) if (!combat.includes(c)) fail('G8', `the combat step dropped "${c}"`);
  return fails;
}

async function edgeOrigins() {
  const { pack } = await import(pathToFileURL(join(ROOT, 'tools', 'pack-edge.mjs')).href);
  const r = await pack('hr-accrue');
  if (!r.files.length) throw new Error('pack(hr-accrue) returned no files — G6 would pass vacuously');
  return r.files.map((f) => f.origin);
}

async function run() {
  const fails = await check(ROOT, await edgeOrigins());
  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); console.error(`screen-primers: ${fails.length} failure(s)`); return 1; }
  console.log('✓ screen-primers: G1-G8 hold (8 rules over the primer table and the tour copy)');
  return 0;
}

async function selftest() {
  const origins = await edgeOrigins();
  const tmp = mkdtempSync(join(tmpdir(), 'hr-primers-'));
  const out = [];
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
    cpSync(join(ROOT, 'index.html'), join(tmp, 'index.html'));
    const clean = await check(tmp, origins);
    if (clean.length) out.push('SELFTEST: the clean copy is not green — ' + clean[0]);
    const edit = (rel, fn) => { const p = join(tmp, rel); const o = readFileSync(p, 'utf8'); writeFileSync(p, fn(o)); return () => writeFileSync(p, o); };
    const farm = "'panel-farming': row('The Farm',";
    const cases = [
      ['G1', 'a key that is no panel', () => edit(DATA, (s) => s.replace("'panel-farming'", "'panel-farmin'")), null],
      ['G2', 'a body with no full stop', () => edit(DATA, (s) => s.replace('save you the clicking.', 'save you the clicking')), null],
      ['G3', 'a digit in a body', () => edit(DATA, (s) => s.replace('Plant a seed', 'Plant 3 seeds')), null],
      ['G4', 'a duplicated body', () => edit(DATA, (s) => s.replace(farm, "'panel-farming': row('The Farm', 'Companions travel with you one at a time. The one you equip lends you its bonus and earns experience of its own, and every locked card says where the others are found.'), _x: row('The Farm',")), null],
      ['G5', 'an unfrozen row', () => edit(DATA, (s) => s.replace('Object.freeze({ title, body })', '({ title, body })')), null],
      ['G6', 'a src/data import of the table', () => edit('src/data/items.js', (s) => "import { SCREEN_PRIMERS } from './screen-primers.js';\n" + s), null],
      ['G6', 'a screen-primers origin in the edge bundle', () => () => {}, [...origins, DATA]],
      ['G7', 'an Events row naming the muster', () => edit(DATA, (s) => s.replace('The dungeons live here.', 'The muster and the dungeons live here.')), null],
      ['G7', 'a Shop row promising real-money buys', () => edit(DATA, (s) => s.replace('the web beta cannot buy them.', 'buy them for real money.')), null],
      ['G8', 'the retired Auto-Eat price', () => edit('src/ftue.js', (s) => s + '\n// 15 Marks\n'), null],
      ['G8', 'the combat step dropping the live rule', () => edit('src/ftue.js', (s) => s.replace('carry on with the same fight', 'start over')), null],
    ];
    for (const [g, label, plant, o] of cases) {
      const undo = plant();
      let got;
      try { got = await check(tmp, o || origins); } catch (e) { got = [`THREW ${e.message}`]; }
      undo();
      if (!got.some((f) => f.startsWith(g + ':'))) out.push(`SELFTEST: ${g} missed ${label} (got: ${got.join(' | ') || 'green'})`);
    }
    const again = await check(tmp, origins);
    if (again.length) out.push('SELFTEST: the copy did not return to green after the plants — ' + again[0]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  if (out.length) { for (const f of out) console.error('  ✗ ' + f); return 1; }
  console.log('✓ screen-primers --selftest: clean arm green; 11 planted defects each caught by their rule (G1-G8)');
  return 0;
}

process.exit(process.argv.includes('--selftest') ? await selftest() : await run());
