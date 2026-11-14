#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/pack.mjs — A NEW HUNTING GROUND AS A PACK (lane/b-ground-pack; Tyler 2026-11-04: "a system or module or something that
// allows us to quickly roll out new hunting grounds"; the design is the board's "2026-11-05 Ground Packs").
//
// One tool for a ground's whole life. Each step reads the data and the engine that already exist; none keeps a second copy:
//   node tools/pack.mjs propose <ground> [--write]   the formula's numbers for every monster on the ground's roster, beside its
//                                                    rows (tools/gen-ground-stats.mjs proposeGround over src/data/balance-sheet.js);
//                                                    --write puts them into the rows, in monsters.js or the pack's own file
//   node tools/pack.mjs check <ground> [--mode quick|full] [--workers N] [--with <staged ground>,...]
//                                                    lint (the ground row, its roster, the formula) and then the grader on the real
//                                                    engine (tools/balance-sim/grade.mjs --grounds <ground>, a STAGED one included,
//                                                    played as it ships: its own drops on the gear ladder, as every open ground's are):
//                                                    exit 1 on a binding FAIL, as the grader's
//   node tools/pack.mjs new <id> --like <ground> [--band lo,hi]
//                                                    a STAGED pack in src/data/grounds/<id>, copied from a shipped ground under new
//                                                    ids (Levels moved with the band), so it plays in the sim at once
//   node tools/pack.mjs index                        re-write src/data/grounds/index.js from the folders
//   node tools/pack.mjs ship <id>                    the pack's server rows as ONE additive file (tools/pack/ship.mjs), its
//                                                    apply-order line, and the pack opened on it. Refuses a pack that moves any
//                                                    other row, schema or function body (a world move)
//   node tools/pack.mjs art <ground> [--write]       the ground's ART LIST from its rows (tools/pack/art.mjs): floor, props, bodies
//                                                    and clips, icons, spell effects, each HAVE or OWED, an owed one with the
//                                                    PixelLab tool and mode that makes it and its import command; --write puts
//                                                    the skeleton in art/briefs/ground-<id>.txt for the art director to fill.
//                                                    Calls nothing and spends nothing
// propose, check and art work on every ground, a pack's or one authored in the old files.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
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

/** Every monster a ground places (its packs and spawns, a boss and his wave included), sorted. */
export function monstersOfGround(ground) {
  const ids = new Set();
  for (const p of ground.pockets || []) for (const s of [...(p.pack || []), ...(p.spawns || []), ...(p.adds || [])]) ids.add(s.monster);
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

/**
 * THE PACK FIELDS' DATA HALF (lane/b-pack-fields, engine piece 10; shape.js definePack checks their shape): answers refusals for pack `p`.
 *   fuel    its flame is a hearth.js FLAMES key, and its id is not already a NAMED_FUELS row
 *   spells  every row passes monster-spells.js validateSpell (the one spell model), and every row is cast by one of the pack's own monsters
 * `S` = { validateSpell }, `H` = { FLAMES, NAMED_FUELS }.
 */
export function lintFields(p, S, H) {
  const out = [];
  if (p.fuel) {
    if (!own(H.FLAMES, p.fuel.flame)) out.push(p.id + ': fuel.flame ' + p.fuel.flame + ' is not a hearth.js FLAMES key');
    if (own(H.NAMED_FUELS, p.fuel.item)) out.push(p.id + ': fuel ' + p.fuel.item + ' is already a NAMED_FUELS row');
  }
  /* its own monsters: the ground's, and its keyed hall's room rows (shape.js `hall`: Krell casts the Hall Fire in his hall) */
  const cast = new Set([...Object.values(p.monsters || {}), ...Object.values((p.hall && p.hall.monsters) || {})].flatMap((m) => (Array.isArray(m.spells) ? m.spells : [])));
  for (const [id, row] of Object.entries(p.spells || {})) {
    out.push(...S.validateSpell(row, id).map((w) => p.id + ': ' + w));
    if (!cast.has(id)) out.push(p.id + ': spell ' + id + ' is cast by none of its own monsters');
  }
  return out;
}
const fieldLibs = async () => [await import(u('src/data/monster-spells.js')), await import(u('src/data/hearth.js'))];

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
  const P = (await import(u('src/data/grounds/index.js'))).GROUND_PACKS.find((x) => x.id === gid);
  if (P) { const [S, H] = await fieldLibs(); lint.push(...lintFields(P, S, H)); }
  if (lint.length) { console.error('pack check ' + gid + ': RED before the grader\n  ' + lint.join('\n  ')); process.exit(1); }
  console.log('pack check ' + gid + ': lint and formula clean; the grader plays it next');
  const mode = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : 'quick';
  const workers = argv.includes('--workers') ? argv[argv.indexOf('--workers') + 1] : '4';
  /* --with a,b: staged grounds that ship with this one (their drops on the gear ladder too), graded in a folder of their own */
  const withIds = argOf(argv, 'with') ? argOf(argv, 'with').split(',').filter(Boolean) : [];
  const out = join(ROOT, 'tools', 'balance-sim', 'out', 'pack-' + gid + '-' + mode + (withIds.length ? '-with-' + withIds.join('+') : ''));
  setAsideStale(out);
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'balance-sim', 'grade.mjs'), '--mode', mode, '--grounds', gid, '--workers', workers, '--out', out,
    ...(withIds.length ? ['--open-also', withIds.join(',')] : [])], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

/* A STOPPED RUN RESUMES, A STALE ONE DOES NOT (lane/b-slake-and-ford 2026-11-10). The grader resumes by cell id, and an id names the
   cell, not the data: after a row or the engine moved, a re-run kept the old cells and graded them as new. The folder keeps a hash of
   everything a cell reads (src, the edge's engine, the simulator, the play fixture); when it differs, the old cells are set aside. */
const CELL_INPUTS = ['src', 'supabase/functions/hr-accrue', 'tools/balance-sim', 'tests/hunt-core/fixtures'];
export function inputsHash(root = ROOT) {
  const h = createHash('sha256');
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) {
      if (rel.replace(/\\/g, '/') === 'tools/balance-sim/out') return;
      for (const e of readdirSync(abs).sort()) walk(join(rel, e));
    } else if (/\.(m?js|json)$/.test(rel)) h.update(rel.replace(/\\/g, '/') + '\0').update(readFileSync(abs)).update('\0');
  };
  for (const d of CELL_INPUTS) walk(d);
  return h.digest('hex');
}
function setAsideStale(out) {
  const now = inputsHash(), stamp = join(out, 'inputs.sha256'), cells = join(out, 'cells.jsonl');
  const was = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
  if (existsSync(cells) && was !== now) {
    const aside = join(out, 'cells.stale-' + (was || 'unstamped').slice(0, 8) + '.jsonl');
    renameSync(cells, aside);
    console.log('pack check: the data or the engine moved since the cells here were played; set aside as ' + aside);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(stamp, now + '\n');
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
  /* THE PACK FIELDS (engine piece 10): every pack's fields lint clean; each shape refusal (definePack) and data refusal (lintFields) bites */
  const { GROUND_PACKS } = await import(u('src/data/grounds/index.js'));
  const { definePack } = await import(u('src/data/grounds/shape.js'));
  const [SP, H] = await fieldLibs();
  for (const p of GROUND_PACKS) { const l = lintFields(p, SP, H); if (l.length) bad.push('pack ' + p.id + ' fields do not lint: ' + l.join('; ')); }
  const slake = GROUND_PACKS.find((p) => p.id === 'the_slake');
  const item = Object.keys(slake.items)[0];
  const fuel = { item, xp: 3000, req: 30, flame: 'fire', secs: 60, chunk: 'fuel_' + item };
  const bilge = slake.spells.cold_bilge;
  const shapeRefuses = (patch) => () => { try { definePack({ ...slake, ...patch }); return []; } catch (e) { return [String(e.message)]; } };
  const fieldRefuses = (patch) => () => lintFields({ ...slake, ...patch }, SP, H);
  if (shapeRefuses({ fuel })().length || fieldRefuses({ fuel })().length) bad.push('a well-formed fuel is refused: ' + shapeRefuses({ fuel })().concat(fieldRefuses({ fuel })()).join('; '));
  cases.push(
    ['a fuel whose item is not one of the pack items', shapeRefuses({ fuel: { ...fuel, item: 'bones', chunk: 'fuel_bones' } })],
    ['a fuel with a field it does not read', shapeRefuses({ fuel: { ...fuel, colour: 'red' } })],
    ['a fuel with no XP', shapeRefuses({ fuel: { ...fuel, xp: 0 } })],
    ['a fuel whose chunk is not its sprite', shapeRefuses({ fuel: { ...fuel, chunk: 'fuel_bone' } })],
    ['a fuel whose flame is no FLAMES key', fieldRefuses({ fuel: { ...fuel, flame: 'no_such_flame' } })],
    ['a fuel that is already a named fuel', fieldRefuses({ fuel: { ...fuel, item: 'queens_comb', chunk: 'fuel_queens_comb' } })],
    ['an empty spells table', shapeRefuses({ spells: {} })],
    ['a spell row with a field it does not read', shapeRefuses({ spells: { cold_bilge: { ...bilge, dmg: 5 } } })],
    ['a spell row out of its bounds', fieldRefuses({ spells: { cold_bilge: { ...bilge, hitPm: 99999 } } })],
    ['a spell row under the fair warning', fieldRefuses({ spells: { cold_bilge: { ...bilge, windupMs: 400 } } })],
    ['a spell none of its monsters casts', fieldRefuses({ spells: { ...slake.spells, river_mist: { ...bilge, n: 'River Mist' } } })],
  );
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
  /* NO PROFIT MOLDS (Tyler 2026-11-13): `check` grades a ground by the sheet the grader loads, so that sheet carries no gold rule, and a sheet
     that adds one (the retired +25% floor) is refused by the grader rather than graded */
  const GR = await import(u('tools/balance-sim/grade.mjs'));
  const sheet = await GR.loadSheet(ROOT), gold = sheet.rules.filter(GR.isProfitRule).map((r) => r.id);
  console.log('  ' + (gold.length ? 'RED' : 'ok ') + ' the sheet pack check grades by carries no profit rule' + (gold.length ? ' (' + gold.join(', ') + ')' : ''));
  if (gold.length) bad.push('the pack check\'s sheet grades gold: ' + gold.join(', '));
  let refused = false;
  try { GR.gradeCells([], { ...sheet, rules: [...sheet.rules, { id: 'normal-profit', metric: 'margin', min: 0.25, binding: true }] }, () => 1); } catch (e) { refused = /NO PROFIT MOLDS/.test(e.message); }
  console.log('  ' + (refused ? 'ok ' : 'RED') + ' a +25% profit rule on that sheet is refused, not graded');
  if (!refused) bad.push('the grader graded a +25% profit rule');
  /* THE ART LIST (tools/pack/art.mjs): what ships reads as drawn, and each planted gap is listed with its tool */
  const A = await (await import(u('tools/pack/art.mjs'))).artSelftest();
  bad.push(...A.bad);
  if (bad.length) { console.error('pack --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('pack --selftest: green (' + Object.keys(D.G.HUNT_GROUNDS).length + ' grounds lint clean, ' + cases.length + ' refusals bite, ' + A.cases + ' art gaps listed)');
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

/** `art <ground> [--write]`: the ground's art list as a brief skeleton. Exit 0 whatever it owes: it is a list, not a gate. */
async function art(gid, argv) {
  const A = await import(u('tools/pack/art.mjs'));
  const D = await A.loadArtData();
  const input = A.inputOf(gid, D);
  if (!input) { console.error('pack art: no ground ' + gid + ' (src/data/hunt-grounds.js or a pack)'); process.exit(2); }
  const text = A.briefText(A.artList(input), D.palette);
  if (!argv.includes('--write')) { process.stdout.write(text); return; }
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const file = join(ROOT, 'art', 'briefs', 'ground-' + gid + '.txt');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log('pack art: wrote ' + file);
}

const USAGE = 'usage: node tools/pack.mjs propose <ground> [--write] | check <ground> [--mode quick|full] [--workers N]\n'
  + '       | new <id> --like <ground> [--band lo,hi] | index | ship <id> | art <ground> [--write] | --selftest';
async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const [cmd, gid, ...rest] = process.argv.slice(2);
  if (cmd === 'index') { const F = await import(u('tools/pack/files.mjs')); console.log('pack index: ' + (F.writeIndex() ? 'written' : 'current')); return; }
  if (!gid && cmd !== '--help') { console.error(USAGE); process.exit(2); }
  if (cmd === 'propose') return propose(gid, rest);
  if (cmd === 'check') return check(gid, rest);
  if (cmd === 'new') return newPack(gid, rest);
  if (cmd === 'ship') return ship(gid, rest);
  if (cmd === 'art') return art(gid, rest);
  console.error(USAGE); process.exit(2);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
