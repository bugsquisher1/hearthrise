#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ground-pack.mjs — A NEW HUNTING GROUND IS A PACK THAT ONLY ADDS (lane/b-ground-pack; Tyler 2026-11-04, the board's
// "2026-11-05 Ground Packs").
//
//   node tests/ground-pack.mjs            GP-1..GP-4, seconds
//   node tests/ground-pack.mjs --fold     + GP-5 and GP-6: every shipped ground planted as a pack, and a real PostgreSQL
//   node tests/ground-pack.mjs --mutate   every claim bites a planted defect (no tree edit outlives the run)
//
//   GP-1  src/data/grounds/index.js is the written one (tools/pack.mjs index): one import and one row a pack folder, in id order
//   GP-2  every pack lints (tools/pack.mjs lintGround) and states its file honestly: an open pack names a file that is in
//         tests/schema-apply-order.json and on disk; a staged one names none (a held ground emits no rows)
//   GP-3  a shipped pack not yet folded into the whole files (tools/pack/whole.mjs) holds exactly what `tools/pack.mjs ship`
//         renders today: no hand edit, no data drift between its file and its rows
//   GP-4  the tool's own refusals: a moved or gone base row, a table a pack may not write, a moved function body, a taken id
//   GP-5  ADDITIVE AND TRANSPARENT: each shipped ground, planted as a pack under new ids, adds rows only (no base row moves, no
//         file's schema or function bodies move), and they are that ground's own rows, renamed: the pack path writes what the
//         base path writes for the same content. The whole --check of every covered generator stays green with it planted.
//   GP-6  THE ADDITIVE FILE EQUALS THE WHOLE ONE on a real PostgreSQL (the replayed chain, tests/schema-replay.mjs): the six
//         planted packs' files applied in turn (twice: idempotent), then the whole files with all six folded: no row of a
//         pack table moves. So a world move that folds the packs later re-states them, and packs commute.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT, GROUNDS_DIR, packIds, indexText, buildVersion, fixturePack, writePack, removePack } from '../tools/pack/files.mjs';
import { packSqlOf, applyOrder, foldedPacks } from '../tools/pack/whole.mjs';
import { rowsOf, diffRows, PACK_TABLES } from '../tools/pack/sql.mjs';
import { shipText, frameOf, COVERED } from '../tools/pack/ship.mjs';

const MIG = join(ROOT, 'supabase', 'migrations');
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); return !!cond; };

/* a fresh process for each data read: a planted pack is new module text, and this process's module cache is the tree as it began */
function childJson(code) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('child failed: ' + (r.stderr || r.stdout).slice(-1500));
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function gp1() {
  const want = indexText(packIds(), buildVersion());
  ok(readFileSync(join(GROUNDS_DIR(), 'index.js'), 'utf8') === want, 'GP-1 src/data/grounds/index.js is not the written one: node tools/pack.mjs index');
}

function gp2() {
  const order = applyOrder();
  const lint = childJson(`import { loadPackData, lintGround } from './tools/pack.mjs'; const D = await loadPackData();
    const { GROUND_PACKS } = await import('./src/data/grounds/index.js');
    console.log(JSON.stringify(GROUND_PACKS.map((p) => ({ id: p.id, status: p.status, sql: p.sql, lint: lintGround(p.id, D) }))));`);
  for (const p of lint) {
    ok(!p.lint.length, 'GP-2 pack ' + p.id + ' does not lint: ' + p.lint.join('; '));
    if (p.status === 'open') ok(p.sql && order.includes(p.sql) && existsSync(join(MIG, p.sql)), 'GP-2 open pack ' + p.id + ' names ' + p.sql + ', which is not on disk and in the apply order');
    else ok(p.sql == null, 'GP-2 staged pack ' + p.id + ' names a file (' + p.sql + '): a held ground emits no rows');
  }
  return lint;
}

function gp3() {
  for (const id of packIds()) {
    const f = packSqlOf(id);
    if (!f) continue;
    const covered = COVERED.map((g) => outOf(g));
    if (covered.every((o) => foldedPacks(o).includes(id))) continue; /* folded: the whole --check guards its rows */
    const want = shipText(id).sql;
    ok(existsSync(join(MIG, f)) && readFileSync(join(MIG, f), 'utf8').replace(/\r\n/g, '\n') === want, 'GP-3 ' + f + ' is not what tools/pack.mjs ship ' + id + ' renders today');
  }
}
/* a covered generator's whole file name, read as text */
function outOf(gen) {
  const t = readFileSync(join(ROOT, 'tools', gen), 'utf8');
  const m = t.match(/OUT_NAME = '([^']+)'/) || t.match(/'(\d{4}-\d{2}-\d{2}-[a-z0-9-]+-items-catalogue\.generated\.sql)'/);
  if (!m) throw new Error('ground-pack: no whole file name in tools/' + gen);
  return m[1];
}

function gp4() {
  const base = rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values\n  ('a', 1, 2),\n  ('b', 3, 4);\n");
  const refuse = (what, after) => { let threw = false; try { diffRows(base, rowsOf(after)); } catch { threw = true; } ok(threw, 'GP-4 the diff did not refuse ' + what); };
  refuse('a moved base row', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 9), ('b', 3, 4);\n");
  refuse('a gone base row', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2);\n");
  refuse('a table a pack may not write', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4);\ninsert into public.hr_hunt_limits (key, value) values ('x', 1);\n");
  ok(diffRows(base, rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4), ('c', 5, 6);\n")).length === 1, 'GP-4 the diff did not read one added row');
  const fn = (body) => 'create or replace function public.f() returns int language sql as $$ select ' + body + ' $$;\n';
  ok(frameOf(fn('1')) !== frameOf(fn("'x'")), 'GP-4 a moved function body reads as no move');
  ok(frameOf('do $$ begin perform 1; end $$;\n') === frameOf("do $$ begin perform 'other'; end $$;\n"), 'GP-4 a self-check restating rows reads as a move');
}

/* ── GP-5 / GP-6: the planted grounds ── */
const FIX = 'fx_';
async function plantAll(grounds) {
  const planted = [];
  try {
    for (const g of grounds) { writePack(ROOT, await fixturePack(g, { prefix: FIX, status: 'open', sql: '2099-01-01-pack-' + FIX + g + '.generated.sql' })); planted.push(FIX + g); }
  } catch (e) { for (const id of planted) removePack(ROOT, id); throw e; }
  return planted;
}
function unplant(ids) { for (const id of ids) removePack(ROOT, id); }

/** The rows of the committed whole files keyed by the ground's own ids (its hunt, its monsters), per table. */
function ownRows(gid, monsters) {
  const own = new Set([gid, ...monsters].map((x) => "'" + x + "'"));
  const out = {};
  for (const g of COVERED) {
    const f = outOf(g);
    for (const s of rowsOf(readFileSync(join(MIG, f), 'utf8'))) {
      const key = PACK_TABLES[s.table];
      if (!key) continue;
      for (const r of s.rows) if (key.some((k) => own.has(r[s.cols.indexOf(k)]))) (out[s.table] = out[s.table] || new Set()).add(r.join('\u0001'));
    }
  }
  return out;
}

async function gp5(grounds, ships) {
  for (const g of grounds) {
    const s = ships[FIX + g];
    ok(!s.moved.length, 'GP-5 ' + g + ' as a pack moves the frame (schema or a function body) of ' + s.moved.join(', '));
    const placed = childJson(`import { HUNT_GROUNDS } from './src/data/hunt-grounds.js'; import { monstersOfGround } from './tools/pack.mjs';
      console.log(JSON.stringify(monstersOfGround(HUNT_GROUNDS['${g}'])));`);
    const want = ownRows(g, placed);
    const got = {};
    for (const t of s.added) got[t.table] = new Set(t.rows.map((r) => r.map((v) => v.split("'" + FIX).join("'")).join('\u0001')));
    for (const t of new Set([...Object.keys(want), ...Object.keys(got)])) {
      const a = want[t] || new Set(), b = got[t] || new Set();
      const miss = [...a].filter((x) => !b.has(x)), extra = [...b].filter((x) => !a.has(x));
      ok(!miss.length && !extra.length, 'GP-5 ' + g + ' ' + t + ': the pack path writes ' + b.size + ' rows, the base ' + a.size
        + (miss.length ? '; missing ' + miss[0].split('\u0001').join(', ') : '') + (extra.length ? '; extra ' + extra[0].split('\u0001').join(', ') : ''));
    }
  }
  /* the whole files never move for a pack that is not folded */
  for (const gen of COVERED) {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', gen), '--check'], { cwd: ROOT, encoding: 'utf8' });
    ok(r.status === 0, 'GP-5 ' + gen + ' --check is red with the packs planted: ' + (r.stderr || r.stdout).trim().split('\n').pop());
  }
}

async function dumpTables(db) {
  const out = {};
  for (const [t, key] of Object.entries(PACK_TABLES)) {
    const r = await db.query(`select * from public.${t} order by ${key.join(', ')}`);
    out[t] = JSON.stringify(r.rows);
  }
  return out;
}

async function gp6(ships, mutate = null) {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay();
  const sqls = Object.values(ships).map((s) => s.sql);
  if (mutate) sqls[0] = mutate(sqls[0]);
  for (const pass of [1, 2]) for (const s of sqls) await db.exec(s);
  const viaPacks = await dumpTables(db);
  /* the whole files, with every planted pack folded in */
  const { after } = (await import('../tools/pack/ship.mjs')).renderFolded(Object.keys(ships));
  for (const [, text] of after) await db.exec(text);
  const viaWhole = await dumpTables(db);
  const moved = Object.keys(viaWhole).filter((t) => viaWhole[t] !== viaPacks[t]);
  await db.close();
  return moved;
}

/* ── --loop: THE GUARDS LOOP OVER EVERY GROUND (phase 2's proof). A new ground, planted as a pack with ZERO edits anywhere else,
   leaves every guard that names grounds green: the guards that read ground ids loop over the data, so a new one is covered, and
   none holds a hand list a new ground falls out of. Two plants: a held ground (staged) and an open one past the content
   (Levels 50-65, the formula's numbers written by the pack tool, as a designer would). Not in CI (each guard runs whole);
   run it when a guard that names grounds is added. `--only a,b` runs those guards alone. ── */
export const LOOPED = Object.freeze([
  'tests/hunt-core/hunt-tiers.mjs', 'tests/hunt-core/forest-cave.mjs', 'tests/hunt-core/drop-tables.mjs', 'tests/hunt-core/hunt-data.mjs',
  'tests/hunt-core/xp-share.mjs', 'tests/hunt-core/first-week-bands.mjs', 'tests/hunt-core/roles.mjs', 'tests/balance-sheet.mjs',
  'tests/level-curve.mjs', 'tests/core-purity.mjs', 'tests/party-class-xp-line.mjs', 'tests/hunt-floor-warning.mjs',
  'tests/world-core.mjs', 'tests/world-assets.mjs', 'tests/world-hunt.mjs', 'tests/supplies-catalogue.mjs', 'tests/hunts-c1.mjs',
  'tests/catalogue-coherence.mjs', 'tests/jewelry-sources.mjs', 'tests/settle-drop-bounds.mjs',
  'tools/gen-hunts.mjs --check', 'tools/gen-hunt-sessions.mjs --check', 'tools/gen-catalogues.mjs --check', 'tools/gen-ground-tiers.mjs --check',
  'tools/gen-ground-stats.mjs --check', 'tools/gen-tally-tasks.mjs --check', 'tools/gen-hearth-catalogue.mjs --check',
]);
async function loop(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
  const list = LOOPED.filter((c) => !only || only.some((o) => c.includes(o)));
  const fs = await import('node:fs');
  const src = 'mosslight_glade', results = [];
  for (const status of ['staged', 'open']) {
    const fx = await fixturePack(src, { prefix: FIX, status, band: [50, 65], ...(status === 'open' ? { sql: '2099-01-01-pack-' + FIX + src + '.generated.sql' } : {}) });
    writePack(ROOT, fx);
    try {
      /* the designer's step: the formula's numbers for the new Levels, written into the pack (tools/pack.mjs propose --write) */
      const w = spawnSync(process.execPath, [join(ROOT, 'tools', 'pack.mjs'), 'propose', fx.id, '--write'], { cwd: ROOT, encoding: 'utf8' });
      if (w.status !== 0) throw new Error('propose --write: ' + (w.stderr || w.stdout).slice(-800));
      for (const cmd of list) {
        const [file, ...args] = cmd.split(' ');
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [join(ROOT, file), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 30 * 60000 });
        const last = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').filter((l) => /✗|RED|FAIL|Error|red/.test(l)).slice(0, 3).join(' | ');
        results.push({ status, cmd, code: r.status, s: Math.round((Date.now() - t0) / 1000), why: r.status === 0 ? '' : last.slice(0, 300) });
        console.log('  ' + (r.status === 0 ? 'ok ' : 'RED') + ' [' + status + '] ' + cmd + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)' + (r.status === 0 ? '' : '  ' + last.slice(0, 300)));
      }
    } finally { removePack(ROOT, fx.id); }
  }
  fs.writeFileSync(join(ROOT, 'tools', 'balance-sim', 'out', 'ground-pack-loop.json'), JSON.stringify(results, null, 1));
  const red = results.filter((r) => r.code !== 0);
  if (red.length) { console.error('ground-pack --loop: ' + red.length + ' guard run(s) red with a new ground planted'); process.exit(1); }
  console.log('ground-pack --loop: green (' + results.length + ' guard runs, a held and an open new ground, zero edits outside the pack)');
}

async function main() {
  const argv = process.argv.slice(2);
  gp1(); gp2(); gp3(); gp4();
  if (argv.includes('--mutate')) return mutate();
  if (argv.includes('--loop')) return loop(argv);
  if (argv.includes('--fold')) {
    const grounds = childJson(`import { OPEN_GROUNDS } from './src/data/hunt-grounds.js'; console.log(JSON.stringify(Object.keys(OPEN_GROUNDS).filter((g) => !g.startsWith('${FIX}'))));`);
    const planted = await plantAll(grounds);
    try {
      const ships = Object.fromEntries(planted.map((id) => [id, shipText(id)]));
      await gp5(grounds, ships);
      const moved = await gp6(ships);
      ok(!moved.length, 'GP-6 the whole files move ' + moved.join(', ') + ' over the six pack files: the additive path is not the whole one');
      const n = Object.values(ships).reduce((s, x) => s + x.sql.split('\n').length, 0);
      console.log('ground-pack --fold: ' + grounds.length + ' grounds as packs, ' + n + ' lines of additive SQL in all (' + Object.values(ships).map((x) => x.sql.split('\n').length).join(', ') + ')');
    } finally { unplant(planted); }
  }
  report();
}

function report() {
  if (fail.length) { for (const f of fail) console.error('✗ ' + f); console.error('ground-pack: ' + fail.length + ' claim(s) red'); process.exit(1); }
  console.log('ground-pack: green (' + packIds().length + ' pack(s); GP-1..GP-4' + (process.argv.includes('--fold') ? ', GP-5, GP-6' : '') + ')');
}

/* --mutate: each claim bites. Tree edits are planted packs only, always removed. */
async function mutate() {
  const results = [];
  /* a claim bites when ITS check reads red; only a mutant whose claim is a refusal at load (`refused`) may count a throw */
  const bites = async (name, fn, refused = false) => {
    const before = fail.length; let threw = null;
    try { await fn(); } catch (e) { threw = e; }
    const caught = fail.length > before || (refused && !!threw);
    if (threw && !refused) console.error('  harness: ' + name + ' threw: ' + String(threw.message || threw).split('\n')[0]);
    fail.length = before; results.push([name, caught]);
  };
  const g = 'wickstead';
  /* GP-1: a pack folder the index does not name */
  await bites('GP-1 a pack folder missing from the index', async () => {
    const p = await plantAll([g]);
    try { const idx = join(GROUNDS_DIR(), 'index.js'); const t = readFileSync(idx, 'utf8'); (await import('node:fs')).writeFileSync(idx, indexText([], buildVersion())); try { gp1(); } finally { (await import('node:fs')).writeFileSync(idx, t); } } finally { unplant(p); }
  });
  /* GP-2: an open pack naming a file that is not in the order */
  await bites('GP-2 an open pack whose file is in no apply order', async () => { const p = await plantAll([g]); try { gp2(); } finally { unplant(p); } });
  /* GP-5: a pack that moves a base row (the fixture's monster takes a base monster's id: refused at load) */
  await bites('GP-5 a pack taking a base monster id', async () => {
    const fx = await fixturePack(g, { prefix: FIX, status: 'open' });
    const [first] = Object.keys(fx.monsters);
    fx.monsters = { ...fx.monsters, granary_rat: fx.monsters[first] };
    writePack(ROOT, fx);
    try { childJson(`import('./src/data/monsters.js').then(() => console.log('1'))`); } finally { removePack(ROOT, fx.id); }
  }, true);
  /* GP-5: transparency, a renamed row that is not the base one (a monster's xp off by one in the pack) */
  await bites('GP-5 a pack row unlike its ground\'s', async () => {
    const fx = await fixturePack(g, { prefix: FIX, status: 'open' });
    const [first] = Object.keys(fx.monsters);
    fx.monsters[first] = { ...fx.monsters[first], xp: fx.monsters[first].xp + 1 };
    writePack(ROOT, fx);
    try { await gp5([g], { [fx.id]: shipText(fx.id) }); } finally { removePack(ROOT, fx.id); }
  });
  /* GP-6: a pack file missing one row, its self-check cut so only the fold comparison can see it: the whole files put the row back */
  await bites('GP-6 a pack file missing a row', async () => {
    const p = await plantAll([g]);
    try {
      const ships = Object.fromEntries(p.map((id) => [id, shipText(id)]));
      const cut = (s) => { const t = s.replace(/,\n  \('fx_wickstead', 'fx_barn_wasp', \d+\)/, '').replace(/\n-- §4 self-check[\s\S]*$/, '\n'); if (t.length >= s.length - 40) throw new Error('the GP-6 mutant planted nothing'); return t; };
      const moved = await gp6(ships, cut);
      ok(!moved.length, 'GP-6 moved ' + moved.join(', '));
    } finally { unplant(p); }
  });
  let miss = 0;
  for (const [name, caught] of results) { console.log('  ' + (caught ? 'ok  ' : 'MISS') + ' ' + name); if (!caught) miss++; }
  if (miss || fail.length) { for (const f of fail) console.error('✗ ' + f); console.error('ground-pack --mutate: ' + miss + ' mutant(s) not caught'); process.exit(1); }
  console.log('ground-pack --mutate: all ' + results.length + ' mutants caught');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
