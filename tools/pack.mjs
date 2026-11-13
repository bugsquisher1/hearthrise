#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/pack.mjs — A NEW HUNTING GROUND AS A PACK (lane/b-ground-pack; Tyler 2026-11-04: "a system or module or something that
// allows us to quickly roll out new hunting grounds"; the design is the board's "2026-11-05 Ground Packs").
//
// One tool for a ground's whole life. Each step reads the data and the engine that already exist; none keeps a second copy:
//   node tools/pack.mjs propose <ground> [--write]   the formula's numbers for every monster on the ground's roster, beside its
//                                                    rows (tools/gen-ground-stats.mjs proposeGround over src/data/balance-sheet.js);
//                                                    --write puts them into the rows, in monsters.js or the pack's own file
//   node tools/pack.mjs check <ground> [--mode quick|full] [--workers N]
//                                                    lint (the ground row, its roster, the formula) and then the grader on the real
//                                                    engine (tools/balance-sim/grade.mjs --grounds <ground>, a STAGED one included):
//                                                    exit 1 on a binding FAIL, as the grader's
//   node tools/pack.mjs new <id> --like <ground> [--band lo,hi]
//                                                    a STAGED pack in src/data/grounds/<id>, copied from a shipped ground under new
//                                                    ids (Levels moved with the band), so it plays in the sim at once
//   node tools/pack.mjs index                        re-write src/data/grounds/index.js from the folders
//   node tools/pack.mjs ship <id>                    the pack's server rows as ONE additive file (tools/pack/ship.mjs), its
//                                                    apply-order line, and the pack opened on it. Refuses a pack that moves any
//                                                    other row, schema or function body (a world move)
// propose and check work on every ground, a pack's or one authored in the old files.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** The data a pack step reads, from one tree (`root`, the repo by default). */
export async function loadPackData(root = ROOT) {
  const v = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(v('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(v('src/data/hunts.js'));
  const { MONSTERS } = await import(v('src/data/monsters.js'));
  const BS = await import(v('src/data/balance-sheet.js'));
  return { G, HUNT_INDEX, MONSTERS, BS };
}

/** Every monster a ground places (its packs and spawns, a boss included), sorted. */
export function monstersOfGround(ground) {
  const ids = new Set();
  for (const p of ground.pockets || []) for (const s of [...(p.pack || []), ...(p.spawns || [])]) ids.add(s.monster);
  return [...ids].sort();
}

/**
 * The lint every check starts with: answers a list of refusals (empty = clean). D = loadPackData's answer.
 *   the ground exists and its row validates (hunt-grounds.js validateGround), its hunt exists,
 *   every monster it places has a role on GROUND_ROSTER and a Level (the formula reads both), and no roster row names a monster the
 *   ground never places (a stale roster would be graded on nothing).
 */
export function lintGround(gid, D) {
  const out = [];
  const g = own(D.G.HUNT_GROUNDS, gid) ? D.G.HUNT_GROUNDS[gid] : null;
  if (!g) return ['no ground ' + gid + ' (src/data/hunt-grounds.js or a pack)'];
  if (!own(D.HUNT_INDEX, g.hunt)) out.push(gid + ': its hunt ' + g.hunt + ' is not in src/data/hunts.js');
  const roster = own(D.BS.GROUND_ROSTER, gid) ? D.BS.GROUND_ROSTER[gid] : null;
  if (!roster) out.push(gid + ': no GROUND_ROSTER row (src/data/balance-sheet.js or the pack\'s roster): the formula has no roles for it');
  const placed = monstersOfGround(g);
  for (const id of placed) {
    if (!own(D.MONSTERS, id)) { out.push(gid + ': places ' + id + ', which is not a monster'); continue; }
    if (roster && !own(roster, id)) out.push(gid + ': ' + id + ' has no role on the roster');
    if (!Number.isInteger(D.MONSTERS[id].level)) out.push(gid + ': ' + id + ' has no Level');
  }
  for (const id of Object.keys(roster || {})) if (!placed.includes(id)) out.push(gid + ': the roster names ' + id + ', which the ground never places');
  return out;
}

async function propose(gid, argv) {
  const S = await import(u('tools/gen-ground-stats.mjs'));
  const D = await loadPackData();
  const floorOf = (g) => D.HUNT_INDEX[D.G.HUNT_GROUNDS[g].hunt].band[0];
  const fitOf = (g) => S.groundFit(D.G.HUNT_GROUNDS[g]);
  const lint = lintGround(gid, D);
  if (lint.length) { console.error('pack propose: ' + lint.join('\n  ')); process.exit(1); }
  const rows = S.proposeGround(gid, { MONSTERS: D.MONSTERS, formulaStats: D.BS.formulaStats, floorOf, fitOf });
  const fmt = (r) => r.hp + ' hp, atk ' + r.atk + ' @' + r.baseAcc + ', def ' + r.def + ', xp ' + r.xp + ', gp ' + r.gp.join('-');
  console.log(gid + ' (floor ' + floorOf(gid) + ', fit ' + fitOf(gid) + ')');
  for (const r of rows) {
    console.log('  ' + r.id.padEnd(18) + ' L' + String(r.level).padEnd(3) + r.role.padEnd(8) + (r.drift.length ? ' rows    ' : ' rows =  ') + fmt(r.today));
    if (r.drift.length) console.log('  ' + ''.padEnd(31) + ' formula ' + fmt(r.formula) + '   (moves ' + r.drift.join(', ') + ')');
  }
  for (const t of ['dangerous', 'deadly']) console.log('  ' + t + ' row: ' + JSON.stringify(D.BS.tierRowFor(floorOf(gid), t, { ground: gid, fit: fitOf(gid) })));
  if (!argv.includes('--write')) { console.log(rows.some((r) => r.drift.length) ? '\npack propose: --write puts the formula into the rows' : '\npack propose: every row is the formula\'s'); return; }
  /* a pack's monsters live in its own file; the rest in monsters.js */
  const packFile = join(ROOT, 'src', 'data', 'grounds', gid, 'pack.js');
  const file = existsSync(packFile) ? packFile : join(ROOT, 'src', 'data', 'monsters.js');
  console.log('\npack propose --write: ' + S.writeRows(rows.filter((r) => r.drift.length), file) + ' row(s) moved in ' + file);
}

async function check(gid, argv) {
  const D = await loadPackData();
  const lint = lintGround(gid, D);
  const S = await import(u('tools/gen-ground-stats.mjs'));
  const floorOf = (g) => D.HUNT_INDEX[D.G.HUNT_GROUNDS[g].hunt].band[0];
  const fitOf = (g) => S.groundFit(D.G.HUNT_GROUNDS[g]);
  if (!lint.length) {
    for (const r of S.proposeGround(gid, { MONSTERS: D.MONSTERS, formulaStats: D.BS.formulaStats, floorOf, fitOf })) {
      if (r.drift.length) lint.push(gid + ': ' + r.id + ' is not the formula\'s (' + r.drift.join(', ') + '): node tools/pack.mjs propose ' + gid + ' --write, or a named exception');
    }
  }
  if (lint.length) { console.error('pack check ' + gid + ': RED before the grader\n  ' + lint.join('\n  ')); process.exit(1); }
  console.log('pack check ' + gid + ': lint and formula clean; the grader plays it next');
  const mode = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : 'quick';
  const workers = argv.includes('--workers') ? argv[argv.indexOf('--workers') + 1] : '4';
  const out = join(ROOT, 'tools', 'balance-sim', 'out', 'pack-' + gid + '-' + mode);
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'balance-sim', 'grade.mjs'), '--mode', mode, '--grounds', gid, '--workers', workers, '--out', out], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

/* --selftest: every shipped ground lints clean, and each refusal bites a mutant of a real one. */
async function selftest() {
  const D = await loadPackData();
  const bad = [];
  for (const g of Object.keys(D.G.HUNT_GROUNDS)) { const l = lintGround(g, D); if (l.length) bad.push('shipped ' + g + ' does not lint: ' + l.join('; ')); }
  const gid = 'wickstead', g = D.G.HUNT_GROUNDS[gid], first = monstersOfGround(g)[0];
  const withRoster = (r) => ({ ...D, BS: { ...D.BS, GROUND_ROSTER: { ...D.BS.GROUND_ROSTER, [gid]: r } } });
  const { [first]: _drop, ...short } = D.BS.GROUND_ROSTER[gid];
  const cases = [
    ['an unknown ground', () => lintGround('no_such_ground', D)],
    ['a ground with no roster', () => lintGround(gid, withRoster(undefined))],
    ['a placed monster with no role', () => lintGround(gid, withRoster(short))],
    ['a roster row the ground never places', () => lintGround(gid, withRoster({ ...D.BS.GROUND_ROSTER[gid], rat: 'swarm' }))],
    ['a placed monster that does not exist', () => lintGround(gid, { ...D, MONSTERS: Object.fromEntries(Object.entries(D.MONSTERS).filter(([k]) => k !== first)) })],
    ['a placed monster with no Level', () => lintGround(gid, { ...D, MONSTERS: { ...D.MONSTERS, [first]: { ...D.MONSTERS[first], level: undefined } } })],
  ];
  for (const [what, fn] of cases) { const n = fn().length; console.log('  ' + (n ? 'ok ' : 'RED') + ' refuses: ' + what); if (!n) bad.push(what + ' passed the lint'); }
  /* THE FIT check reads: every open ground's rows are the formula's under its own fit (S.groundFit), so `check` reaches the grader;
     and the Sewer read as a lone ground drifts, so a fit reader that misses its party pocket (the retired `minParty` key did) bites. */
  const S = await import(u('tools/gen-ground-stats.mjs'));
  const floorOf = (x) => D.HUNT_INDEX[D.G.HUNT_GROUNDS[x].hunt].band[0];
  const driftOf = (x, fitOf) => S.proposeGround(x, { MONSTERS: D.MONSTERS, formulaStats: D.BS.formulaStats, floorOf, fitOf }).filter((r) => r.drift.length).map((r) => r.id);
  for (const x of Object.keys(D.G.OPEN_GROUNDS)) { const d = driftOf(x, (y) => S.groundFit(D.G.HUNT_GROUNDS[y])); if (d.length) bad.push('open ' + x + ' is off its formula: ' + d.join(', ')); }
  const loneSewer = driftOf('millrace_sewer', () => 'both').length;
  console.log('  ' + (loneSewer ? 'ok ' : 'RED') + ' the Sewer read without its party pocket is off-formula (the fit is read)');
  if (!loneSewer) bad.push('the Sewer reads on-formula as a lone ground: the fit is not read');
  if (S.groundFit(D.G.HUNT_GROUNDS.millrace_sewer) !== 'party') bad.push('groundFit does not read the Sewer\'s forParty pocket as a party ground');
  if (bad.length) { console.error('pack --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('pack --selftest: green (' + Object.keys(D.G.HUNT_GROUNDS).length + ' grounds lint clean, ' + cases.length + ' refusals bite)');
}

/* ── new / index / ship (phase 4) ── */
const argOf = (argv, k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** `new <id> --like <ground> [--band lo,hi]`: a STAGED pack that plays at once, copied from a shipped ground under new ids. */
async function newPack(id, argv) {
  const F = await import(u('tools/pack/files.mjs'));
  const like = argOf(argv, 'like');
  if (!like) { console.error('pack new: --like <ground> (the shipped ground to start from; every row is then yours to rewrite)'); process.exit(2); }
  if (F.packIds().includes(id)) { console.error('pack new: ' + id + ' exists'); process.exit(2); }
  const band = argOf(argv, 'band') ? argOf(argv, 'band').split(',').map(Number) : null;
  const p = await F.fixturePack(like, { prefix: id + '_', status: 'staged', band });
  /* the pack's own ids: the ground is <id>, its map <id>, its monsters <id>_<monster> until renamed */
  const fx = p.id, mapWas = p.map.id;
  /* the source ground's measured rows are its own: a new ground earns its tier row, XP fit and party rows on its own check */
  for (const k of ['tierOverride', 'xpFit', 'partyClassXp', 'partyVsAlone']) delete p[k];
  p.id = id; p.map = { ...p.map, id }; p.ground = { ...p.ground, map: id }; p.hunt = { ...p.hunt, name: id };
  if (Array.isArray(p.map.hunts)) p.map.hunts = p.map.hunts.map((h) => (h === fx ? id : h));
  console.log('pack new: ' + F.writePack(ROOT, p) + ' (from ' + like + ', map ' + mapWas + '); staged: plays in the sim, never listed or served');
  console.log('  next: rename, draw map.js, set Levels and roles, then node tools/pack.mjs propose ' + id + ' --write');
}

/** `ship <id>`: the pack's additive file, its apply-order line, and the pack opened on it. */
async function ship(id, argv) {
  const F = await import(u('tools/pack/files.mjs'));
  const W = await import(u('tools/pack/whole.mjs'));
  const S = await import(u('tools/pack/ship.mjs'));
  const { readFileSync, writeFileSync } = await import('node:fs');
  if (!F.packIds().includes(id)) { console.error('pack ship: no pack ' + id); process.exit(2); }
  /* once a whole file folds the pack, its rows are the whole files' (a re-ship after it would move that file's --check): a world move changes it */
  const outs = readFileSync(join(ROOT, 'tools', 'gen-hunts.mjs'), 'utf8').match(/OUT_NAME = '([^']+)'/);
  if (outs && W.foldedPacks(outs[1]).includes(id)) { console.error('pack ship: ' + id + ' is folded into the whole files (' + outs[1] + '): change it with a world move, not a re-ship'); process.exit(1); }
  const order = W.applyOrder();
  const was = W.packSqlOf(id);
  const dir = join(ROOT, 'supabase', 'migrations');
  /* a new forward file: dated with the chain's newest date, a -N suffix past the first (an applied file is history) */
  const date = order.map((f) => f.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
  const n = order.filter((f) => new RegExp('^\\d{4}-\\d{2}-\\d{2}-pack-' + id + '(-\\d+)?\\.generated\\.sql$').test(f)).length;
  const file = date + '-pack-' + id + (n ? '-' + (n + 1) : '') + '.generated.sql';
  /* OPEN FIRST, THEN RENDER: a staged ground is never served, so its rows exist only once it is open (gen-hunts and gen-hunt-sessions
     read the open grounds). Put back as it was if the render refuses. */
  const packFile = join(F.GROUNDS_DIR(), id, 'pack.js');
  const before = readFileSync(packFile, 'utf8');
  writeFileSync(packFile, before.replace(/^(\s*)status: "staged",$/m, '$1status: "open",').replace(/^(\s*)sql: (null|"[^"]*"),$/m, '$1sql: "' + (was || file) + '",'));
  let out;
  try {
    out = S.shipText(id);
    if (out.moved.length) throw new Error(id + ' moves the schema or a function body of ' + out.moved.join(', ') + ': a world move, not a pack');
  } catch (e) { writeFileSync(packFile, before); console.error('pack ship: ' + (e.message || e)); process.exit(1); }
  if (was && existsSync(join(dir, was)) && readFileSync(join(dir, was), 'utf8') === out.sql) { console.log('pack ship: ' + was + ' is current'); return; }
  writeFileSync(join(dir, file), out.sql);
  writeFileSync(packFile, readFileSync(packFile, 'utf8').replace(/^(\s*)sql: (null|"[^"]*"),$/m, '$1sql: "' + file + '",'));
  const manifest = join(ROOT, 'tests', 'schema-apply-order.json');
  const j = JSON.parse(readFileSync(manifest, 'utf8'));
  j.order.push(file);
  j._order_notes[file] = 'STAGED, NOT APPLIED (ground pack ' + id + ', tools/pack.mjs ship): the pack\'s own rows, ' + out.added.reduce((s, t) => s + t.rows.length, 0)
    + ' in ' + out.added.length + ' tables, upserted on their keys; additive and commuting (tests/ground-pack.mjs). Order: this file, then the hr-accrue deploy, then the client.';
  writeFileSync(manifest, JSON.stringify(j, null, 2) + '\n');
  console.log('pack ship: wrote ' + file + ' (' + out.sql.split('\n').length + ' lines), opened ' + id + ', added its apply-order line');
  console.log('  then: node tests/ground-pack.mjs, node tests/schema-drift.mjs, node tests/restore-census.mjs (re-pin its counts in this lane)');
}

const USAGE = 'usage: node tools/pack.mjs propose <ground> [--write] | check <ground> [--mode quick|full] [--workers N]\n'
  + '       | new <id> --like <ground> [--band lo,hi] | index | ship <id> | --selftest';
async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const [cmd, gid, ...rest] = process.argv.slice(2);
  if (cmd === 'index') { const F = await import(u('tools/pack/files.mjs')); console.log('pack index: ' + (F.writeIndex() ? 'written' : 'current')); return; }
  if (!gid && cmd !== '--help') { console.error(USAGE); process.exit(2); }
  if (cmd === 'propose') return propose(gid, rest);
  if (cmd === 'check') return check(gid, rest);
  if (cmd === 'new') return newPack(gid, rest);
  if (cmd === 'ship') return ship(gid, rest);
  console.error(USAGE); process.exit(2);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
