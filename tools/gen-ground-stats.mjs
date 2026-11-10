#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-ground-stats.mjs — A GROUND'S MONSTER NUMBERS FROM ONE FORMULA (lane/b-ground-formula; Tyler 2026-11-07,
// "is there a formula you can start following?").
//
// A designer writes, per monster: its Level (where in the ground it lives), its role (src/data/balance-sheet.js
// MONSTER_ROLES), its art tier and class (both already on the row). src/data/balance-sheet.js formulaStats turns those
// into hp, atk, baseAcc, def, xp and gp. This tool reads the roster below, prints today's rows beside the formula's,
// and writes a proposal the balance simulator plays (tools/balance-sim plans 'formula*', a what-if: nothing in
// src/data moves until a designer accepts the numbers).
//
//   node tools/gen-ground-stats.mjs [--grounds a,b]             print today's rows beside the formula's
//   node tools/gen-ground-stats.mjs --propose [--grounds a,b]   also write tools/balance-sim/out/formula-proposal.json
//   node tools/gen-ground-stats.mjs --write [--grounds a,b]     write the formula's numbers into those rows of src/data/monsters.js
//   node tools/gen-ground-stats.mjs --check [--grounds a,b]     exit 1 if a row on those grounds is not the formula's
//                                                               (a named exception in EXCEPTIONS stands, with its reason)
//   node tools/gen-ground-stats.mjs --selftest                  every refusal bites
//
// PURE where it counts: proposeGround() reads only the data it is handed, so the grader and the lab can call it.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { GROUND_ROSTER, FORMULA_EXCEPTIONS } from '../src/data/balance-sheet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROPOSAL = join(ROOT, 'tools', 'balance-sim', 'out', 'formula-proposal.json');
/* the stats the formula owns on a row (speed, class, weaknesses, drops and Level stay the designer's) */
export const FORMULA_FIELDS = Object.freeze(['hp', 'atk', 'baseAcc', 'def', 'xp', 'gp']);

/* THE ROSTER (each monster's role on its ground) and the named exceptions live with the formula, in
   src/data/balance-sheet.js GROUND_ROSTER and FORMULA_EXCEPTIONS, so the grader and the lab read the same ones. */
export const ROSTER = GROUND_ROSTER;
export const EXCEPTIONS = FORMULA_EXCEPTIONS;

/**
 * Today's row beside the formula's for every monster `ROSTER[gid]` names. D = { MONSTERS, formulaStats, floorOf(gid) }, opts the lab's dials.
 * Answers [{ id, role, level, tier, today: {field: v}, formula: {field: v}, hitVsSameLevel, blowShare, drift: [field] }].
 */
export function proposeGround(gid, D, opts = {}) {
  const roster = (opts.roster || ROSTER)[gid];
  if (!roster) throw new Error('gen-ground-stats: no roster for ' + gid);
  return Object.entries(roster).map(([id, role]) => {
    const m = D.MONSTERS[id];
    if (!m) throw new Error('gen-ground-stats: ' + gid + ' names ' + id + ', which is not a monster');
    if (!Number.isInteger(m.level)) throw new Error('gen-ground-stats: ' + id + ' has no Level');
    const f = D.formulaStats({ level: m.level, role, tier: m.tier, floor: D.floorOf(gid), fit: D.fitOf ? D.fitOf(gid) : 'solo', ground: gid }, opts);
    const formula = Object.fromEntries(FORMULA_FIELDS.map((k) => [k, f[k]]));
    for (const [k, why] of Object.entries((EXCEPTIONS[id] || {}))) { if (!why) throw new Error('gen-ground-stats: ' + id + '.' + k + ' exception has no reason'); formula[k] = m[k]; }
    const today = Object.fromEntries(FORMULA_FIELDS.map((k) => [k, k === 'baseAcc' ? (Number.isFinite(m.baseAcc) ? m.baseAcc : 0.5) : m[k]]));
    const drift = FORMULA_FIELDS.filter((k) => JSON.stringify(today[k]) !== JSON.stringify(formula[k]));
    return { id, role, level: m.level, tier: m.tier, today, formula, hitVsSameLevel: f.hitVsSameLevel, blowShare: f.blowShare, drift };
  });
}

async function load() {
  const u = (p) => pathToFileURL(join(ROOT, p)).href;
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const { formulaStats, tierRowFor } = await import(u('src/data/balance-sheet.js'));
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  /* a ground's floor: its hunt's band floor (src/data/hunts.js) */
  const floorOf = (gid) => { const g = HUNT_GROUNDS[gid]; if (!g || !HUNT_INDEX[g.hunt]) throw new Error('gen-ground-stats: no ground ' + gid); return HUNT_INDEX[g.hunt].band[0]; };
  /* who a ground is built for: a pocket that needs a party makes it a party ground (tools/balance-sim plans.mjs reads it the same way) */
  const fitOf = (gid) => { const g = HUNT_GROUNDS[gid]; return g.pockets.some((p) => p.forParty) ? 'party' : g.groupFit || 'both'; };
  return { MONSTERS, formulaStats, tierRowFor, floorOf, fitOf };
}
const fmt = (r) => r.hp + ' hp, atk ' + r.atk + ' @' + r.baseAcc + ', def ' + r.def + ', xp ' + r.xp + ', gp ' + r.gp.join('-');

function selftest(D) {
  const bad = [];
  const rows = proposeGround('wickstead', D);
  if (rows.length !== Object.keys(ROSTER.wickstead).length) bad.push('a roster row went missing');
  /* a row that equals the formula has no drift; one atk point off is drift */
  const id = rows[0].id, f = rows[0].formula;
  const same = { ...D, MONSTERS: { ...D.MONSTERS, [id]: { ...D.MONSTERS[id], ...f } } };
  if (proposeGround('wickstead', same)[0].drift.length) bad.push('a formula row reads as drift');
  const off = { ...D, MONSTERS: { ...D.MONSTERS, [id]: { ...D.MONSTERS[id], ...f, atk: f.atk + 1 } } };
  if (!proposeGround('wickstead', off)[0].drift.includes('atk')) bad.push('one atk point off is not caught');
  const refuse = (what, fn) => { try { fn(); bad.push(what + ' was not refused'); } catch { /* refused */ } };
  refuse('an unknown role', () => proposeGround('x', D, { roster: { x: { [id]: 'wizard' } } }));
  refuse('an unknown monster', () => proposeGround('x', D, { roster: { x: { no_such_monster: 'swarm' } } }));
  refuse('an unknown ground', () => proposeGround('no_such_ground', D));
  /* --write finds a row at monsters.js's indent and at a ground pack's (one level deeper), and moves only its stat line */
  const tmp = join(ROOT, 'tools', 'balance-sim', 'out', 'gen-ground-stats-selftest.js');
  mkdirSync(dirname(tmp), { recursive: true });
  const src = readFileSync(join(ROOT, 'src', 'data', 'monsters.js'), 'utf8');
  for (const [where, text] of [['monsters.js', src], ['a pack file', src.split('\n').map((l) => (l.startsWith('  ') ? '  ' + l : l)).join('\n')]]) {
    writeFileSync(tmp, text);
    const moved = writeRows([{ id, formula: { ...f, atk: f.atk + 1 } }], tmp);
    const diff = readFileSync(tmp, 'utf8').split('\n').filter((l, i) => l !== text.split('\n')[i]);
    if (moved !== 1 || diff.length !== 1 || !diff[0].includes('atk: ' + (f.atk + 1))) bad.push('--write on ' + where + ' moved ' + moved + ' row(s), ' + diff.length + ' line(s)');
  }
  if (bad.length) { console.error('gen-ground-stats --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('gen-ground-stats --selftest: green (drift caught, unknown role / monster / ground refused)');
}

async function main() {
  const D = await load();
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) { selftest(D); return; }
  const gi = argv.indexOf('--grounds');
  const grounds = gi >= 0 ? argv[gi + 1].split(',') : Object.keys(ROSTER);
  const out = {}, tierRows = {};
  let drift = 0;
  for (const g of grounds) {
    const rows = proposeGround(g, D);
    out[g] = Object.fromEntries(rows.map((r) => [r.id, r]));
    const tiers = Object.fromEntries(['dangerous', 'deadly'].map((t) => [t, D.tierRowFor(D.floorOf(g), t, { ground: g, fit: D.fitOf(g) })]));
    tierRows[g] = tiers;
    console.log('\n' + g + ' (floor ' + D.floorOf(g) + '; engine tier rows: Dangerous ' + JSON.stringify(tiers.dangerous) + ', Deadly ' + JSON.stringify(tiers.deadly) + ')');
    for (const r of rows) {
      drift += r.drift.length ? 1 : 0;
      console.log('  ' + r.id.padEnd(16) + ' L' + String(r.level).padEnd(3) + r.role.padEnd(8) + ' today   ' + fmt(r.today));
      console.log('  ' + ''.padEnd(29) + ' formula ' + fmt(r.formula) + '   (to-hit at a same-Level hero ' + Math.round(r.hitVsSameLevel * 100) + '%, blow ' + Math.round(r.blowShare * 100) + '% of its HP)');
    }
  }
  if (argv.includes('--propose')) {
    mkdirSync(dirname(PROPOSAL), { recursive: true });
    writeFileSync(PROPOSAL, JSON.stringify({ schema: 'hearthrise.formula-proposal/2', grounds: out, tiers: tierRows }, null, 1) + '\n');
    console.log('\nwrote ' + PROPOSAL);
  }
  if (argv.includes('--write')) {
    const n = writeRows(Object.values(out).flatMap((g) => Object.values(g)));
    console.log('\nwrote ' + n + ' row(s) into src/data/monsters.js');
    return;
  }
  if (argv.includes('--check')) {
    if (drift) { console.error('\ngen-ground-stats --check: RED, ' + drift + ' row(s) are not the formula\'s'); process.exit(1); }
    console.log('\ngen-ground-stats --check: green, every row is the formula\'s');
  }
}

/* THE ROW'S STAT LINE in monsters.js: `hp: N, atk: N, [baseAcc: N, ]def: N, xp: N, gp: [a, b]` (one line, the house style), with
   `formula: true` after it once the formula owns it (monster-classes.js auditRoster then holds the row to the formula, not to TIER_BANDS). */
const STAT_LINE = /hp: \d+, atk: \d+, (?:baseAcc: [\d.]+, )?def: \d+, xp: \d+, gp: \[\d+, \d+\](?:, formula: true)?/;
/** Write each proposed row's formula numbers into src/data/monsters.js (or a ground pack's file, src/data/grounds/<id>/pack.js,
    where the row sits one level deeper: the row is found at any indent), in place. Answers how many rows moved. */
export function writeRows(rows, file = join(ROOT, 'src', 'data', 'monsters.js')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let moved = 0;
  for (const r of rows) {
    const at = lines.findIndex((l) => new RegExp('^ +' + r.id + ': \\{').test(l));
    if (at < 0) throw new Error('gen-ground-stats --write: no row ' + r.id + ' in ' + file);
    const indent = lines[at].match(/^ +/)[0];
    const end = lines.findIndex((l, i) => i > at && new RegExp('^' + indent + '[a-z0-9_]+: \\{').test(l));
    const i = lines.findIndex((l, j) => j >= at && (end < 0 || j < end) && STAT_LINE.test(l));
    if (i < 0) throw new Error('gen-ground-stats --write: ' + r.id + ' has no stat line in the house style');
    const f = r.formula;
    const next = lines[i].replace(STAT_LINE, 'hp: ' + f.hp + ', atk: ' + f.atk + ', baseAcc: ' + f.baseAcc + ', def: ' + f.def + ', xp: ' + f.xp + ', gp: [' + f.gp[0] + ', ' + f.gp[1] + '], formula: true');
    if (next !== lines[i]) { lines[i] = next; moved++; }
  }
  writeFileSync(file, lines.join('\n'));
  return moved;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
