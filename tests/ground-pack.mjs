#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ground-pack.mjs — A NEW HUNTING GROUND IS A PACK THAT ONLY ADDS (lane/b-ground-pack; Tyler 2026-11-04, the board's
// "2026-11-05 Ground Packs").
//
//   node tests/ground-pack.mjs            GP-1..GP-4, seconds
//   node tests/ground-pack.mjs --fold     + GP-5 and GP-6: every shipped ground planted as a pack, and a real PostgreSQL
//   node tests/ground-pack.mjs --staged   GP-1..GP-4 and GP-9 alone (each staged pack rehearsed in a scratch copy)
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
//   GP-7  (--fold) a new ground at a new band takes the formula's numbers from tools/pack.mjs propose --write, in its own file only
//   GP-8  (--fold) a staged pack with a keyed hall rehearses its ship clean: its file holds the hall's own hr_boss_halls row
//         (a table a pack may write, GP-4) and the room's hunt, and moves no schema or function body
//   GP-9  (--fold, --staged) a staged pack's ship, rehearsed in a scratch copy of the tree, carries an hr_item_levels row for each
//         worn piece, an hr_tally_tiers row for each piece in her slots and an hr_flame_fuel row for each Remains good it brings to
//         a scale ground (those whole files read the shipped packs only, so the pack's own file is the only carrier)
//   GP-6  THE ADDITIVE FILE EQUALS THE WHOLE ONE on a real PostgreSQL (the replayed chain, tests/schema-replay.mjs): the
//         planted packs' files and every shipped, unfolded pack's own file applied in turn (twice: idempotent), then the whole
//         files with all of them folded: no row of a pack table moves. So a world move that folds the packs later re-states
//         them, and packs commute. (GP-5 plants the BASE grounds only: an open pack has no base path to compare.)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT, GROUNDS_DIR, packIds, indexText, sourceStamp, fixturePack, writePack, removePack } from '../tools/pack/files.mjs';
import { packSqlOf, applyOrder, foldedPacks } from '../tools/pack/whole.mjs';
import { rowsOf, diffRows, PACK_TABLES } from '../tools/pack/sql.mjs';
import { shipText, rehearse, frameOf, COVERED } from '../tools/pack/ship.mjs';

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
  const want = indexText(packIds(), sourceStamp());
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

/* `unfold` { pack: whole file name } (--mutate only): read that pack as NOT folded into that whole file, so the partly folded branch has a
   subject when every shipped pack is folded whole (lane/scale-grounds-sweep: gen-factions' 1067 folds Krell's Hold too) */
function gp3(unfold = {}) {
  for (const id of packIds()) {
    const f = packSqlOf(id);
    if (!f) continue;
    const covered = COVERED.map((g) => outOf(g));
    const folded = covered.filter((o) => foldedPacks(o).includes(id) && unfold[id] !== o);
    if (folded.length === covered.length) continue; /* folded: the whole --check guards its rows */
    const have = existsSync(join(MIG, f)) ? readFileSync(join(MIG, f), 'utf8').replace(/\r\n/g, '\n') : null;
    const ship = shipText(id);
    if (!folded.length) { ok(have === ship.sql, 'GP-3 ' + f + ' is not what tools/pack.mjs ship ' + id + ' renders today'); continue; }
    /* PARTLY FOLDED (lane/d-flat-party-xp, 2026-11-16: a world move dated after the pack, 2027-04-24-flat-party-xp-tiers re-issues hr_ground_tiers
       whole with every shipped pack folded in). A folded whole file carries the pack's rows for the tables it writes, and its own --check holds
       them to the data; the pack's applied file is history there. Every OTHER table must still be the pack's file, row for row, and every
       table the file holds and the render no longer adds must be one a folded whole file writes, with the pack's keys in it. */
    if (have === null) { ok(false, 'GP-3 ' + f + ' is not on disk'); continue; }
    const tab = (stmts) => { const m = new Map(); for (const t of stmts) m.set(t.table, [...(m.get(t.table) || []), ...t.rows.map((r) => r.join(','))]); return m; };
    const mine = tab(rowsOf(have)), now = tab(ship.added.map((t) => ({ table: t.table, rows: t.rows })));
    const wholes = folded.map((o) => tab(rowsOf(readFileSync(join(MIG, o), 'utf8'))));
    /* (lane/d-drop-homes, 2026-11-18: this read every table row for row, the folded whole files' own too, so a world move that re-issues a partly
       folded pack's rows in its whole file, Krell's Hold's kill bounds, read red against the pack's applied file. As the paragraph above says, a
       table a folded whole file writes is that file's: today's rows must be in it, row for row, or in the pack's file.) */
    for (const [t, rows] of now) {
      const same = JSON.stringify([...(mine.get(t) || [])].sort()) === JSON.stringify([...rows].sort());
      const inWhole = !same && wholes.some((w) => w.has(t) && rows.every((r) => w.get(t).includes(r)));
      ok(same || inWhole, 'GP-3 ' + f + ': its ' + t + ' rows are not what tools/pack.mjs ship ' + id + ' renders today, and no folded whole file (' + folded.join(', ') + ') carries them');
    }
    /* A table a later file of the chain drops is history: the pack's applied rows for it need no carrier (lane/ci-reds-1127b: 1072-retire-tier-chain
       drops hr_ground_tiers, so Krell's Hold's applied tier rows read "in no folded whole file" and GP-3's control went red, run 45986445932). */
    const dropped = droppedAfter(f);
    for (const [t, rows] of mine) {
      if (now.has(t) || dropped.has(t)) continue;
      const keyCols = PACK_TABLES[t] ? PACK_TABLES[t].length : 1;
      const keyOf = (r) => r.split(',').slice(0, keyCols).join(',');
      const carried = wholes.some((w) => w.has(t) && rows.every((r) => w.get(t).some((x) => keyOf(x) === keyOf(r))));
      ok(carried, 'GP-3 ' + f + ': its ' + t + ' rows are in no folded whole file (' + folded.join(', ') + ')');
    }
  }
}
/* the tables a migration after `file` in the apply order drops (`drop table [if exists] public.<t>`), read as text */
const DROPPED = new Map();
function droppedAfter(file) {
  if (DROPPED.has(file)) return DROPPED.get(file);
  const order = applyOrder(), at = order.indexOf(file), out = new Set();
  DROPPED.set(file, out);
  if (at < 0) return out;
  for (const m of order.slice(at + 1)) {
    const p = join(MIG, m);
    if (!existsSync(p)) continue;
    for (const x of readFileSync(p, 'utf8').matchAll(/^\s*drop table (?:if exists )?public\.([a-z_0-9]+)/gim)) out.add(x[1]);
  }
  return out;
}
/* a covered generator's whole file name, read as text */
function outOf(gen) {
  const t = readFileSync(join(ROOT, 'tools', gen), 'utf8');
  const m = t.match(/OUT_(?:NAME|FILE) = '([^']+)'/) ||t.match(/'((?:\d{4}-\d{2}-\d{2}|\d{4,})-[a-z0-9_-]+-items-catalogue\.generated\.sql)'/);
  if (!m) throw new Error('ground-pack: no whole file name in tools/' + gen);
  return m[1];
}

function gp4() {
  const base = rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values\n  ('a', 1, 2),\n  ('b', 3, 4);\n");
  const refuse = (what, after) => { let threw = false; try { diffRows(base, rowsOf(after)); } catch { threw = true; } ok(threw, 'GP-4 the diff did not refuse ' + what); };
  refuse('a moved base row', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 9), ('b', 3, 4);\n");
  refuse('a gone base row', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2);\n");
  /* the income dial's sale is the pack's to carry (PACK_MOVABLE): a moved vendor row is one upserted row; a gone one is still refused */
  const vend = rowsOf("insert into public.hr_hunt_vendor_value (item_id, value) values ('a', 10), ('b', 20);\n");
  const sale = diffRows(vend, rowsOf("insert into public.hr_hunt_vendor_value (item_id, value) values ('a', 7), ('b', 20);\n"));
  ok(sale.length === 1 && sale[0].rows.length === 1 && sale[0].rows[0].join() === "'a',7", 'GP-4 a moved vendor row (the income dial) is not carried as the pack' + "'" + 's one upserted row');
  { let threw = false; try { diffRows(vend, rowsOf("insert into public.hr_hunt_vendor_value (item_id, value) values ('a', 10);\n")); } catch { threw = true; } ok(threw, 'GP-4 the diff did not refuse a gone vendor row'); }
  refuse('a table a pack may not write', "insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4);\ninsert into public.hr_hunt_limits (key, value) values ('x', 1);\n");
  ok(diffRows(base, rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4), ('c', 5, 6);\n")).length === 1, 'GP-4 the diff did not read one added row');
  const fn = (body) => 'create or replace function public.f() returns int language sql as $$ select ' + body + ' $$;\n';
  ok(frameOf(fn('1')) !== frameOf(fn("'x'")), 'GP-4 a moved function body reads as no move');
  ok(frameOf('do $$ begin perform 1; end $$;\n') === frameOf("do $$ begin perform 'other'; end $$;\n"), 'GP-4 a self-check restating rows reads as a move');
  /* a pack's keyed hall is its own row to write (hr_boss_halls, keyed on the hall): refused, no pack with a hall could ship */
  let hall = null;
  try { hall = diffRows(base, rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4);\ninsert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values ('c', 'c_hall', 'm', 'k', 600000);\n")); } catch { hall = null; }
  ok(!!hall && hall.length === 1 && hall[0].table === 'hr_boss_halls' && (PACK_TABLES.hr_boss_halls || []).join() === 'hall_id', 'GP-4 the diff refused a pack\'s hall row (hr_boss_halls is not a table a pack may write)');
  /* a pack's own shield is its row to write too (hr_hunt_shields, keyed on the item): refused, no pack could bring a shield (Krell's Tollgate) */
  let shield = null;
  try { shield = diffRows(base, rowsOf("insert into public.hr_hunts (hunt_id, band_min, band_max) values ('a', 1, 2), ('b', 3, 4);\ninsert into public.hr_hunt_shields (item_id) values ('s');\n")); } catch { shield = null; }
  ok(!!shield && shield.length === 1 && shield[0].table === 'hr_hunt_shields' && (PACK_TABLES.hr_hunt_shields || []).join() === 'item_id', 'GP-4 the diff refused a pack\'s shield row (hr_hunt_shields is not a table a pack may write)');
  /* the first row of a pack table (a comment stood where its insert now does) is rows, not a moved frame; any other table's is a move */
  const none = "-- (no open keyed hall in the data)\n", first = "insert into public.hr_boss_halls (hall_id, hunt_id, monster_id, key_item, limit_ms) values\n  ('c', 'c_hall', 'm', 'k', 600000);\n";
  ok(frameOf(none) === frameOf(first), 'GP-4 the first row of a pack table reads as a moved frame');
  ok(frameOf(none) !== frameOf("insert into public.hr_hunt_limits (key, value) values\n  ('x', 1);\n"), 'GP-4 a new insert into a table no pack may write reads as no move');
}

/* GP-8 A STAGED PACK WITH A HALL SHIPS: rehearsed (opened in place, rendered, put back), its file holds the hall's own row and the
   room's hunt, and moves no schema or function body. Krell's Hold is the first; the claim loops over every staged pack with a hall. */
function gp8() {
  const halls = childJson(`import { GROUND_PACKS } from './src/data/grounds/index.js'; console.log(JSON.stringify(GROUND_PACKS.filter((p) => p.hall && p.status === 'staged').map((p) => p.id)));`);
  for (const id of halls) {
    let s = null;
    try { s = rehearse(id); } catch (e) { ok(false, 'GP-8 a ship rehearsal refuses ' + id + ': ' + String(e.message || e).split('\n').slice(0, 3).join(' | ')); continue; }
    ok(!s.moved.length, 'GP-8 ' + id + ' rehearsed moves the frame (schema or a function body) of ' + s.moved.join(', '));
    const t = s.added.find((x) => x.table === 'hr_boss_halls');
    ok(!!t && t.rows.length === 1 && t.rows[0][t.cols.indexOf('hall_id')] === "'" + id + "'", 'GP-8 ' + id + ' rehearsed writes no hr_boss_halls row of its own');
    const h = s.added.find((x) => x.table === 'hr_hunt_travel');
    ok(!!h && h.rows.some((r) => r[h.cols.indexOf('hunt_id')] === "'" + id + "_hall'"), 'GP-8 ' + id + ' rehearsed leaves its hall\'s room (' + id + '_hall) out of hr_hunt_travel');
  }
  return halls;
}

/* GP-9 A STAGED PACK'S PIECES SHIP WITH THEIR LEVELS, FUEL AND TALLY BOOK (lane/flame-temper-shipped-packs, 2026-11-27): the item
   Level catalogue (gen-flame-temper) and the tally tier book (gen-tally-tasks) read the whole view, so a pack shipped after their whole
   files is in neither unless its own file carries the rows. Each staged pack is rehearsed in a SCRATCH COPY of the tree (the real tree is
   never written): every worn piece has its hr_item_levels row, every piece in her slots its hr_tally_tiers row, and every Remains good
   it brings to a scale ground that no shipped pack burns its hr_flame_fuel row. The copy's own ship tool renders it, so a mutant
   (`plant(tmp)`, --mutate) cuts the copy's tool, never the tree's. */
function scratchTree() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-ship-'));
  for (const d of ['src', 'tools', 'tests', 'supabase/migrations', 'supabase/migration-notes', 'supabase/functions']) {
    cpSync(join(ROOT, d), join(tmp, d), { recursive: true, filter: (p) => !/[\\/](vendor|balance-program|node_modules)([\\/]|$)/.test(p.slice(ROOT.length)) });
  }
  cpSync(join(ROOT, 'package.json'), join(tmp, 'package.json'));
  return tmp;
}
async function gp9(plant = null, only = null) {
  const want = childJson(`import { GROUND_PACKS } from './src/data/grounds/index.js'; import { FLAME_FUEL } from './src/data/inner-flame.js';
    import { TALLY_RULES } from './src/data/tally-tasks.js'; import { DANGER_GROUNDS } from './src/data/danger.js';
    const fuel = new Set(FLAME_FUEL.map((r) => r.item)), slots = new Set(TALLY_RULES.slotOrder);
    console.log(JSON.stringify(GROUND_PACKS.filter((p) => p.status === 'staged').map((p) => {
      const items = Object.entries(p.items || {});
      return { id: p.id, worn: items.filter(([, it]) => it && it.slot && it.slot !== 'ammo').map(([k]) => k).sort(),
        tally: items.filter(([, it]) => it && slots.has(it.slot)).map(([k]) => k).sort(),
        fuel: !Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, p.id) ? [] : [...new Set(Object.values(p.monsters || {}).flatMap((m) => (m.drops || []).map((d) => d.id)).filter((x) => fuel.has(x)))].sort() };
    }).filter((p) => p.worn.length || p.fuel.length)));`);
  ok(want.some((p) => p.worn.length) && want.some((p) => p.fuel.length), 'GP-9 CONTROL: no staged pack carries a worn piece and a Remains good to ship');
  /* the fuel 1069 already holds (a shipped pack burns it there): the pack adds no row for it */
  const served = new Set(rowsOf(readFileSync(join(MIG, outOf('gen-flame-temper.mjs')), 'utf8')).filter((s) => s.table === 'hr_flame_fuel').flatMap((s) => s.rows.map((r) => r[0])));
  for (const p of want.filter((x) => !only || only.includes(x.id))) {
    const tmp = scratchTree();
    try {
      let s = null;
      if (plant) plant(tmp);
      try { s =(await import(pathToFileURL(join(tmp, 'tools', 'pack', 'ship.mjs')).href)).rehearse(p.id, tmp); } catch (e) { ok(false, 'GP-9 a ship rehearsal refuses ' + p.id + ': ' + String(e.message || e).split('\n').slice(0, 3).join(' | ')); continue; }
      /* a moved frame is the ship's own refusal (a world move, GP-8's claim for a hall), not this one's: named, never red here */
      if (s.moved.length) console.log('  note: GP-9 ' + p.id + ' ships only with a world move (the frame of ' + s.moved.join(', ') + ' moves)');
      const has = (table) => new Set((s.added.find((t) => t.table === table) || { rows: [] }).rows.map((r) => r[0]));
      const lacks = (table, ids) => { const h = has(table), miss = ids.filter((x) => !h.has("'" + x + "'")); ok(!miss.length, 'GP-9 ' + p.id + ' ships no ' + table + ' row for ' + miss.length + ' of its ' + ids.length + ' (' + miss.slice(0, 4).join(', ') + ')'); };
      lacks('hr_item_levels', p.worn);
      lacks('hr_tally_tiers', p.tally);
      lacks('hr_flame_fuel', p.fuel.filter((x) => !served.has("'" + x + "'")));
      console.log('  GP-9 ' + p.id + ' ships ' + ['hr_item_levels', 'hr_tally_tiers', 'hr_flame_fuel'].map((t) => has(t).size + ' ' + t).join(', ')
        + ' (worn ' + p.worn.length + ', in her slots ' + p.tally.length + ', Remains ' + p.fuel.length + ')');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  return want.map((p) => p.id);
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
      /* a row keyed by a hunt is that hunt's alone (the Burning Tower's floors place the Cellar's rats: its spawn row is the Tower's file's, never
         the Cellar's); a row keyed by a monster or an item is the ground's that places it */
      const by = key.includes('hunt_id') ? ['hunt_id'] : key;
      for (const r of s.rows) if (by.some((k) => own.has(r[s.cols.indexOf(k)]))) (out[s.table] = out[s.table] || new Set()).add(r.join('\u0001'));
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

/* every shipped pack no whole file folds yet: its own file is part of the chain end, so GP-6 applies it and folds it with the planted ones */
const openPacks = () => packIds().filter((id) => packSqlOf(id) && !COVERED.every((g) => foldedPacks(outOf(g)).includes(id)));
async function gp6(planted, mutate = null) {
  const ships = { ...planted, ...Object.fromEntries(openPacks().filter((id) => !(id in planted)).map((id) => [id, shipText(id)])) };
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
  'tests/hunt-core/forest-cave.mjs', 'tests/hunt-core/drop-tables.mjs', 'tests/hunt-core/hunt-data.mjs',
  'tests/hunt-core/xp-share.mjs', 'tests/hunt-core/first-week-bands.mjs', 'tests/hunt-core/roles.mjs', 'tests/balance-sheet.mjs',
  'tests/level-curve.mjs', 'tests/core-purity.mjs', 'tests/party-class-xp-line.mjs', 'tests/hunt-floor-warning.mjs',
  'tests/world-core.mjs', 'tests/world-assets.mjs', 'tests/world-hunt.mjs', 'tests/supplies-catalogue.mjs', 'tests/hunts-c1.mjs',
  'tests/catalogue-coherence.mjs', 'tests/jewelry-sources.mjs', 'tests/settle-drop-bounds.mjs',
  'tools/gen-hunts.mjs --check', 'tools/gen-hunt-sessions.mjs --check', 'tools/gen-catalogues.mjs --check',
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

/* GP-7 THE DESIGNER'S STEP WORKS ON A PACK: a new ground at a new band (Levels moved with it) takes the formula's numbers from
   `tools/pack.mjs propose --write` in its own file, and then reads as the formula's (check's lint); nothing outside the folder moves. */
async function gp7() {
  const fx = await fixturePack('wickstead', { prefix: FIX, status: 'staged', band: [50, 65] });
  writePack(ROOT, fx);
  try {
    const before = spawnSync('git', ['status', '--porcelain', '--', 'src', 'tools', 'tests', 'supabase'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    const w = spawnSync(process.execPath, [join(ROOT, 'tools', 'pack.mjs'), 'propose', fx.id, '--write'], { cwd: ROOT, encoding: 'utf8' });
    ok(w.status === 0 && /row\(s\) moved in .*grounds/.test(w.stdout), 'GP-7 propose --write on a pack: ' + (w.stderr || w.stdout).trim().split('\n').pop());
    const drift = childJson(`import { loadPackData } from './tools/pack.mjs'; import { proposeGround } from './tools/gen-ground-stats.mjs';
      const D = await loadPackData(); const floorOf = (g) => D.HUNT_INDEX[D.G.HUNT_GROUNDS[g].hunt].band[0];
      console.log(JSON.stringify(proposeGround('${fx.id}', { MONSTERS: D.MONSTERS, formulaStats: D.BS.formulaStats, floorOf, fitOf: () => 'solo' }).filter((r) => r.drift.length).map((r) => r.id)));`);
    ok(!drift.length, 'GP-7 after propose --write the pack still drifts from the formula on ' + drift.join(', '));
    const after = spawnSync('git', ['status', '--porcelain', '--', 'src', 'tools', 'tests', 'supabase'], { cwd: ROOT, encoding: 'utf8' }).stdout;
    ok(before === after, 'GP-7 propose --write moved a file outside the pack folder');
  } finally { removePack(ROOT, fx.id); }
}

async function main() {
  const argv = process.argv.slice(2);
  gp1(); gp2(); gp3(); gp4();
  if (argv.includes('--mutate')) return mutate();
  if (argv.includes('--loop')) return loop(argv);
  if (argv.includes('--staged')) { await gp9(); return report(); }
  if (argv.includes('--fold')) {
    await gp7();
    gp8();
    await gp9();
    /* the BASE grounds (authored in the old files) are planted as packs; an open pack is a pack already, with no base path to
       compare (GP-5) and rows that may name a lower pack's monsters (Muster Barrows' wave is the Ford's Pikemen), so it is not
       re-planted: its own shipped file goes into GP-6 beside the planted ones, folded with them */
    const grounds = childJson(`import { OPEN_GROUNDS } from './src/data/hunt-grounds.js'; import { GROUND_PACKS } from './src/data/grounds/index.js';
      const packs = new Set(GROUND_PACKS.map((p) => p.id));
      console.log(JSON.stringify(Object.keys(OPEN_GROUNDS).filter((g) => !g.startsWith('${FIX}') && !packs.has(g))));`);
    const planted = await plantAll(grounds);
    try {
      const ships = Object.fromEntries(planted.map((id) => [id, shipText(id)]));
      await gp5(grounds, ships);
      const moved = await gp6(ships);
      ok(!moved.length, 'GP-6 the whole files move ' + moved.join(', ') + ' over the pack files: the additive path is not the whole one');
      const n = Object.values(ships).reduce((s, x) => s + x.sql.split('\n').length, 0);
      console.log('ground-pack --fold: ' + grounds.length + ' grounds as packs, ' + n + ' lines of additive SQL in all (' + Object.values(ships).map((x) => x.sql.split('\n').length).join(', ') + ')');
    } finally { unplant(planted); }
  }
  report();
}

function report() {
  if (fail.length) { for (const f of fail) console.error('✗ ' + f); console.error('ground-pack: ' + fail.length + ' claim(s) red'); process.exit(1); }
  console.log('ground-pack: green (' + packIds().length + ' pack(s); GP-1..GP-4' + (process.argv.includes('--fold') ? ', GP-5, GP-6, GP-7, GP-8, GP-9' : process.argv.includes('--staged') ? ', GP-9' : '') + ')');
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
    try { const idx = join(GROUNDS_DIR(), 'index.js'); const t = readFileSync(idx, 'utf8'); (await import('node:fs')).writeFileSync(idx, indexText([], sourceStamp())); try { gp1(); } finally { (await import('node:fs')).writeFileSync(idx, t); } } finally { unplant(p); }
  });
  /* GP-2: an open pack naming a file that is not in the order */
  await bites('GP-2 an open pack whose file is in no apply order', async () => { const p = await plantAll([g]); try { gp2(); } finally { unplant(p); } });
  /* GP-3: a PARTLY folded pack (Krell's Hold: every whole file folds it but the faction catalogue) whose row moves with no whole file re-issued: the
     Grave Guard's shield row turned into a body, so its kill bound reads a new drop set that neither its applied file nor a whole file carries */
  await bites('GP-3 a partly folded pack row moved with no whole file re-issued', async () => {
    const file = join(GROUNDS_DIR(), 'krells_hold', 'pack.js'), was = readFileSync(file, 'utf8');
    /* (lane/scale-grounds-sweep step 1 put Krell's Hold on rune 80: the shield row is the Runebound Shield. The plant is a Rune Platebody, worth more
       than his legs, his best piece, so the kill bound moves; a Rune Helm is worth less than the legs and moved nothing) */
    const planted = was.replace("{ id: 'runebound_shield', everyHours: ", "{ id: 'rune_platebody', everyHours: ");
    if (planted === was) throw new Error('the GP-3 mutant planted nothing');
    const { writeFileSync } = await import('node:fs');
    /* Krell's Hold is folded into every whole file now, so the mutant reads it as the paragraph above had it: folded everywhere but the faction
       catalogue. Its control (the same fold, no row moved) is green, so the bite is the moved row's */
    const UNFOLD = { krells_hold: outOf('gen-factions.mjs') };
    const before = fail.length; gp3(UNFOLD);
    if (fail.length !== before) { fail.length = before; throw new Error('GP-3 control: the unfolded Krell\'s Hold reads red with no row moved'); }
    writeFileSync(file, planted);
    try { gp3(UNFOLD); } finally { writeFileSync(file, was); }
  });
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
  /* GP-9: the ship tool as it stood before lane/flame-temper-shipped-packs (COVERED without the item Level and tally generators), cut in the
     scratch copy only: the Roost ships no item Level, tier-book or fuel row */
  await bites('GP-9 a ship tool that leaves out the item Levels, fuel and tally tier book', async () => {
    const { writeFileSync } = await import('node:fs');
    await gp9((tmp) => {
      const f = join(tmp, 'tools', 'pack', 'ship.mjs'), t = readFileSync(f, 'utf8');
      const cut = t.replace(", 'gen-flame-temper.mjs', 'gen-tally-tasks.mjs']", ']');
      if (cut === t) throw new Error('the GP-9 mutant planted nothing');
      writeFileSync(f, cut);
    }, ['wyvern_roost']);
  });
  let miss = 0;
  for (const [name, caught] of results) { console.log('  ' + (caught ? 'ok  ' : 'MISS') + ' ' + name); if (!caught) miss++; }
  if (miss || fail.length) { for (const f of fail) console.error('✗ ' + f); console.error('ground-pack --mutate: ' + miss + ' mutant(s) not caught'); process.exit(1); }
  console.log('ground-pack --mutate: all ' + results.length + ' mutants caught');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
