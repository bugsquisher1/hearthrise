#!/usr/bin/env node
// tests/room-modal.mjs — the room modal stands on its own (2026-10-14).
//
// src/render/room-modal.js was moved verbatim out of the clan seat
// (src/features/clan-seat-ui.js section 10) so the homestead keeps its modal
// when the clan seat is deleted. This proves the moved module is SELF-CONTAINED
// and live:
//   RM-1  it evaluates in a bare scope (no clan-seat closure) and publishes
//         window.HearthriseRoomModal with open/close/refresh/isOpen
//   RM-2  every section kind the homestead descriptor uses renders to markup
//         through the module's own helpers (note, meter, rows, ladder, actions)
//   RM-3  the file names no clan system (no HearthriseClan*, no clan_ RPC)
//   RM-4  it is loaded: an ESM on the boot path side-effect-imports it
//
//   node tests/room-modal.mjs             the contract
//   node tests/room-modal.mjs --selftest  mutation proof: drop a helper, add a
//                                         clan read, drop the import — each RED
//
// Also invoked by tests/run-smoke.mjs as a preflight (roomModalGuard).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function check(src, loader) {
  const p = [];
  const ok = (c, m) => { if (!c) p.push(m); };
  const win = { HR: { icon: () => '<i></i>' } };
  const ctx = { window: win, document: { querySelector: () => null }, console };
  try { vm.runInNewContext(src, ctx, { filename: 'room-modal.js' }); }
  catch (e) { p.push('RM-1 the module did not evaluate on its own: ' + e.message); return p; }
  const RM = win.HearthriseRoomModal;
  ok(RM && ['open', 'close', 'refresh', 'isOpen'].every((k) => typeof RM[k] === 'function'),
    'RM-1 window.HearthriseRoomModal is not published with open/close/refresh/isOpen');
  if (RM && typeof RM._section === 'function') {
    const kinds = [
      { kind: 'note', html: '<b>n</b>' },
      { kind: 'meter', label: 'L', value: 2, max: 4, valueText: '2/4', tone: 'gold' },
      { kind: 'rows', title: 'R', rows: [{ name: 'a', meta: 'm', right: 'r', bar: { tone: '', value: 1, max: 2 } }] },
      { kind: 'ladder', title: 'Ladder', current: 1, cap: 3, rows: [{ level: 1, name: 'One', cost: [], owned: true },
        { level: 2, name: 'Two', next: true, costs: [{ id: 'gold', need: 10, have: 5, known: true, label: 'Gold' }],
          gates: [{ id: 'oak_plank', need: 2, have: 0, ok: false, label: 'Oak Plank' }] }] },
      { kind: 'actions', buttons: [{ label: 'Build', action: 'build', primary: true }] },
    ];
    for (const s of kinds) {
      let out = null;
      try { out = RM._section(s); } catch (e) { p.push(`RM-2 section '${s.kind}' threw: ${e.message}`); continue; }
      ok(typeof out === 'string' && out.length > 0, `RM-2 section '${s.kind}' rendered nothing`);
    }
  } else p.push('RM-2 the _section seam is missing');
  ok(!/Hearthrise(Clan|Clans|ClanSeat|Raids|Muster)\b|['"]clan_[a-z_]+['"]/.test(src),
    'RM-3 the room modal reads a clan system');
  ok(/import '\.\.\/render\/room-modal\.js\?v=\d+';/.test(loader),
    'RM-4 nothing on the boot path imports src/render/room-modal.js');
  return p;
}

export function roomModalGuard() {
  return check(read('src/render/room-modal.js'), read('src/features/character-page.js'));
}

function selftest() {
  const src = read('src/render/room-modal.js'), loader = read('src/features/character-page.js');
  const mutants = [
    ['a helper left behind in the clan seat', src.replace(/  function nfmt\(v\)[^\n]*\n/, ''), loader],
    ['a clan read added', src + '\nwindow.HearthriseClanSeat;\n', loader],
    ['the boot import dropped', src, loader.replace(/import '\.\.\/render\/room-modal\.js\?v=\d+';/, '')],
  ];
  let escaped = 0;
  for (const [name, s, l] of mutants) {
    const red = check(s, l).length > 0;
    console.log(`  ${red ? 'RED  ' : 'GREEN'}  ${name}`);
    if (!red) escaped++;
  }
  return escaped === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--selftest')) {
    if (!selftest()) { console.log('room-modal selftest: a mutant escaped'); process.exit(1); }
    console.log('room-modal selftest: every mutant was caught.');
    process.exit(0);
  }
  const p = roomModalGuard();
  if (p.length) { console.log('room-modal — FAILED:'); for (const x of p) console.log('  x ' + x); process.exit(1); }
  console.log('room-modal — self-contained, clan-free, every section renders, loaded on the boot path.');
}
