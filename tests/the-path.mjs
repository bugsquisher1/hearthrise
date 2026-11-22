#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/the-path.mjs — THE PATH NAMES A NEXT THING AT EVERY LEVEL TO 30, AND NEVER TYPES A LEVEL (designer ruling D-1,
// docs/design/overhaul/review/05-designer-rulings.md section 1.1; src/data/the-path.js; FB-5, 2026-11-21).
//
//   P-1  every row is well formed: a stable id, a known opener kind, a scope, words in plain English (no semicolon, no em dash)
//   P-2  every `opens` id is a window of src/data/shell-windows.js or a PATH_FEATURES id
//   P-3  rule 1: no row types a Level. A level opener names its export, and when that file is here the export resolves to a Level
//   P-4  a flag whose file is here names an export that is there (a typo is no "off")
//   P-5  rule 2: an event row carries expectLevel, a whole Level; only a row waiting on a later lane's flag, or the weapon-tags stub, may
//        leave it null
//   P-6  rule 3, the coverage: with every row counted whose Level reads today (way rows never count), each Level L from 1 to 30 has a
//        next thing at L+1 to L+3. Rule 4: a hole on PATH_HOLES_FOR_HARDER_TIERS prints and passes until FB-7 lands; so does a hole on
//        HOLES_FOR_TALENTS below until FB-11's src/data/talents.js lands (the designer's own table counts its points). Any other hole fails
//
//   node tests/the-path.mjs            the guard
//   node tests/the-path.mjs --mutate   each planted defect must turn its own line red
//
// mutant-anchors: none — every mutant plants rows or a list in memory, never a file
// ════════════════════════════════════════════════════════════════════════
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { THE_PATH, levelsOf, resolveRef } from '../src/data/the-path.js';
import { SHELL_WINDOWS } from '../src/data/shell-windows.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
/* Features a row may open that are no window: each is said on a card or a line, not opened by a press. */
export const PATH_FEATURES = Object.freeze(['action_bar', 'end_card', 'blessings', 'loot_plan', 'hero_strip', 'party_plan', 'rest_plan',
  'safe_to_close', 'return_card', 'talents', 'talent_point', 'world_boss', 'on_call', 'town_crier', 'weapon_tags', 'iron_gear', 'steel_gear',
  'hearth_chest', 'weighhouse', 'calendar', 'clan_roster', 'harder_tier', 'way_move']);

/* The FB-5 guard's one named list (D-1 rule 4): the Levels the harder-tier rows are expected to fill once FB-7's tier-risk file
   lands. A hole here prints and passes; FB-7 deletes the list in the commit that adds its file, with a mutant proving the guard bites. */
export const PATH_HOLES_FOR_HARDER_TIERS = Object.freeze([16, 25, 26]);

/** Every file a row reads (its opener's and its flag's), for a reader that loads them. Pure. */
function pathFiles(rows) {
  const out = new Set();
  for (const r of rows) {
    if (r.opener.from) out.add(r.opener.from.file);
    if (r.flag) out.add(r.flag.file);
  }
  return [...out].sort();
}

/* FB-11's Talent points carry Levels 20 and 25 (D-1 section 1.1: "Talents carry four Levels"); until its file lands these are its
   holes. FB-11 deletes this list in the commit that adds src/data/talents.js, with a mutant proving the guard bites. */
export const HOLES_FOR_TALENTS = Object.freeze([17, 18, 22, 23, 24]);
const TALENTS_FILE = 'src/data/talents.js';
const STUBS = new Set(['weapon_tags']);   // D-1 section 1.5: the tags are filled last from check C1
const SCOPES = new Set(['account', 'hero', 'way']);
const ID = /^[a-z0-9_]{1,48}$/;

async function loadMods(rows) {
  const mods = {};
  for (const f of pathFiles(rows)) if (existsSync(join(ROOT, f))) mods[f] = await import(pathToFileURL(join(ROOT, f)).href);
  return mods;
}

/** Every problem with `rows`, as strings. `o`: { harder, talents, present(file) } for the mutants. */
export function checkPath(rows, mods, o = {}) {
  const out = [];
  const harder = o.harder || PATH_HOLES_FOR_HARDER_TIERS;
  const talents = o.talents || HOLES_FOR_TALENTS;
  const present = o.present || ((f) => !!mods[f]);
  const windows = new Set(SHELL_WINDOWS.map((w) => w.id));
  const seen = new Set();
  for (const r of rows) {
    if (!ID.test(r.id) || seen.has(r.id)) out.push('P-1 ' + r.id + ': an id is [a-z0-9_] and one a row');
    seen.add(r.id);
    if (!SCOPES.has(r.scope)) out.push('P-1 ' + r.id + ': scope ' + r.scope);
    if (typeof r.line !== 'string' || !r.line.trim() || /[;—]/.test(r.line)) out.push('P-1 ' + r.id + ': its line is empty or not plain English');
    if (!['level', 'event', 'accounts'].includes(r.opener && r.opener.kind)) out.push('P-1 ' + r.id + ': opener ' + JSON.stringify(r.opener));
    for (const w of r.opens) if (!windows.has(w) && !PATH_FEATURES.includes(w)) out.push('P-2 ' + r.id + ': opens "' + w + '", no window or feature');
    const o2 = r.opener || {};
    if (o2.kind === 'level' || o2.kind === 'accounts') {
      if (!o2.from || typeof o2.from.file !== 'string' || typeof o2.from.export !== 'string') out.push('P-3 ' + r.id + ': a Level is typed, not read');
      else if (present(o2.from.file) && (o2.kind === 'level' ? !levelsOf(r, mods).length : resolveRef(o2.from, mods) === undefined)) {
        out.push('P-3 ' + r.id + ': ' + o2.from.file + ' is here and ' + o2.from.export + ' reads no Level');
      }
    }
    if (r.flag && present(r.flag.file) && resolveRef(Object.assign({}, r.flag, { path: (r.flag.path || []).slice(0, -1) }), mods) === undefined) {
      out.push('P-4 ' + r.id + ': its flag ' + r.flag.file + ' ' + r.flag.export + ' is not there');
    }
    if (o2.kind === 'event' && !Number.isInteger(o2.expectLevel)) {
      const waits = r.flag && !present(r.flag.file);
      if (!(o2.expectLevel === null && (waits || STUBS.has(r.id)))) out.push('P-5 ' + r.id + ': an event row carries expectLevel');
    }
  }
  /* THE COVERAGE: every row whose Level reads today counts, flag on or off ("with every first-build flag on"); way rows never do */
  const levels = new Set(rows.filter((r) => r.scope !== 'way').flatMap((r) => levelsOf(r, mods)));
  const holes = [];
  for (let L = 1; L <= 30; L++) if (![L + 1, L + 2, L + 3].some((x) => levels.has(x))) holes.push(L);
  for (const L of holes) {
    if (harder.includes(L)) continue;
    if (talents.includes(L) && !present(TALENTS_FILE)) continue;
    out.push('P-6 Level ' + L + ' names no next thing within 3 Levels');
  }
  return { out, holes };
}

const MUTANTS = [
  ['P-3 a typed Level', (rows) => rows.map((r) => (r.id === 'wickstead' ? Object.assign({}, r, { opener: { kind: 'level', from: null } }) : r)), 'P-3 wickstead'],
  ['P-3 an export typo', (rows) => rows.map((r) => (r.id === 'tower' ? Object.assign({}, r, { opener: { kind: 'level', from: Object.assign({}, r.opener.from, { export: 'TOWER_RULE' }) } }) : r)), 'P-3 tower'],
  ['P-2 a window that is not there', (rows) => rows.map((r) => (r.id === 'start' ? Object.assign({}, r, { opens: r.opens.concat('tamsin') }) : r)), 'P-2 start'],
  ['P-5 an event with no Level', (rows) => rows.map((r) => (r.id === 'first_leave' ? Object.assign({}, r, { opener: Object.assign({}, r.opener, { expectLevel: null }) }) : r)), 'P-5 first_leave'],
  ['P-1 a semicolon in the words', (rows) => rows.map((r) => (r.id === 'thicket' ? Object.assign({}, r, { line: 'Level 5; Meadowbrook Thicket' }) : r)), 'P-1 thicket'],
  ['P-6 a hole at Level 13 (no iron gear row)', (rows) => rows.filter((r) => r.id !== 'iron_gear'), 'P-6 Level 1'],
  ['P-6 the harder-tier list gone', (rows) => rows, 'P-6 Level 16', { harder: [] }],
  ['P-6 FB-11 landed and still a hole at 17', (rows) => rows, 'P-6 Level 17', { present: (f) => f === TALENTS_FILE || existsSync(join(ROOT, f)) }],
  /* Frost Slam (12) and Hoarfrost (14) are WAY rows: a guard that counted them would hide this hole */
  ['P-6 a hole a way row would hide (no Iron gear, no Mosslight)', (rows) => rows.filter((r) => r.id !== 'iron_gear' && r.id !== 'mosslight'), 'P-6 Level 12'],
];

async function main() {
  const mods = await loadMods(THE_PATH);
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const [name, plant, expect, o] of MUTANTS) {
      const rows = plant(THE_PATH);
      const { out } = checkPath(rows, await loadMods(rows), o || {});
      const caught = out.some((l) => l.startsWith(expect));
      console.log((caught ? '  CAUGHT ' : '  MISSED ') + name + (caught ? '' : ' (' + out.join(' | ') + ')'));
      if (!caught) bad++;
    }
    console.log(bad ? 'the-path --mutate: ' + bad + ' MISSED' : 'the-path --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(bad ? 1 : 0);
  }
  const { out, holes } = checkPath(THE_PATH, mods);
  for (const L of holes.filter((x) => PATH_HOLES_FOR_HARDER_TIERS.includes(x))) console.log('  hole at Level ' + L + ': waits on FB-7\'s harder-tier rows (D-1 rule 4)');
  for (const L of holes.filter((x) => HOLES_FOR_TALENTS.includes(x))) if (!mods[TALENTS_FILE]) console.log('  hole at Level ' + L + ': waits on FB-11\'s Talent points (' + TALENTS_FILE + ')');
  for (const l of out) console.log('  ✗ ' + l);
  console.log(out.length ? 'the-path: RED, ' + out.length + ' finding(s)' : 'the-path: ' + THE_PATH.length + ' rows, every Level 1 to 30 names a next thing within 3 Levels but the named holes');
  process.exit(out.length ? 1 : 0);
}
if (isMain(import.meta.url)) await main();
