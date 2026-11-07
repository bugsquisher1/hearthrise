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
//   node tools/gen-ground-stats.mjs --check [--grounds a,b]     exit 1 if a row on those grounds is not the formula's
//                                                               (a named exception in EXCEPTIONS stands, with its reason)
//   node tools/gen-ground-stats.mjs --selftest                  every refusal bites
//
// PURE where it counts: proposeGround() reads only the data it is handed, so the grader and the lab can call it.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PROPOSAL = join(ROOT, 'tools', 'balance-sim', 'out', 'formula-proposal.json');
/* the stats the formula owns on a row (speed, class, weaknesses, drops and Level stay the designer's) */
export const FORMULA_FIELDS = Object.freeze(['hp', 'atk', 'baseAcc', 'def', 'xp', 'gp']);

/* THE ROSTER: each monster's role on its ground (designer input; the reason is the row's own comment in monsters.js).
   A monster on two grounds keeps one role. */
export const ROSTER = Object.freeze({
  wickstead: Object.freeze({
    granary_rat: 'swarm',     // "the swarm: fat on the farm's grain, many and quick"
    barn_wasp: 'glass',       // a flier: quick, fragile
    barn_spider: 'heavy',     // "the tank: slow and webbed in"
    orchard_boar: 'heavy',    // "the orchard's tank"
    turncoat: 'glass',        // "glass that hits hard"; the rare carrier
  }),
  mosslight_glade: Object.freeze({
    carrion_crow: 'regular',  // the common majority
    glade_poacher: 'glass',   // "glass that hits like a cart"
    walking_vine: 'heavy',    // "the tank: slow and woody"
    goblin_sluicer: 'elite',  // the tier-3 body carrier
    brook_bear: 'elite',      // "the Meadowbrook's bruiser"
    rook_poacher: 'elite',    // "the poachers' chief", the rare carrier
  }),
});
/* NAMED EXCEPTIONS: a field a row keeps by hand, with the reason. Empty: no row has earned one yet. */
export const EXCEPTIONS = Object.freeze({});

/**
 * Today's row beside the formula's for every monster `ROSTER[gid]` names. D = { MONSTERS, formulaStats }, opts the lab's dials.
 * Answers [{ id, role, level, tier, today: {field: v}, formula: {field: v}, hitVsSameLevel, blowShare, drift: [field] }].
 */
export function proposeGround(gid, D, opts = {}) {
  const roster = (opts.roster || ROSTER)[gid];
  if (!roster) throw new Error('gen-ground-stats: no roster for ' + gid);
  return Object.entries(roster).map(([id, role]) => {
    const m = D.MONSTERS[id];
    if (!m) throw new Error('gen-ground-stats: ' + gid + ' names ' + id + ', which is not a monster');
    if (!Number.isInteger(m.level)) throw new Error('gen-ground-stats: ' + id + ' has no Level');
    const f = D.formulaStats({ level: m.level, role, tier: m.tier }, opts);
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
  const { formulaStats } = await import(u('src/data/balance-sheet.js'));
  return { MONSTERS, formulaStats };
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
  if (bad.length) { console.error('gen-ground-stats --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('gen-ground-stats --selftest: green (drift caught, unknown role / monster / ground refused)');
}

async function main() {
  const D = await load();
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) { selftest(D); return; }
  const gi = argv.indexOf('--grounds');
  const grounds = gi >= 0 ? argv[gi + 1].split(',') : Object.keys(ROSTER);
  const out = {};
  let drift = 0;
  for (const g of grounds) {
    const rows = proposeGround(g, D);
    out[g] = Object.fromEntries(rows.map((r) => [r.id, r]));
    console.log('\n' + g);
    for (const r of rows) {
      drift += r.drift.length ? 1 : 0;
      console.log('  ' + r.id.padEnd(16) + ' L' + String(r.level).padEnd(3) + r.role.padEnd(8) + ' today   ' + fmt(r.today));
      console.log('  ' + ''.padEnd(29) + ' formula ' + fmt(r.formula) + '   (to-hit at a same-Level hero ' + Math.round(r.hitVsSameLevel * 100) + '%, blow ' + Math.round(r.blowShare * 100) + '% of its HP)');
    }
  }
  if (argv.includes('--propose')) {
    mkdirSync(dirname(PROPOSAL), { recursive: true });
    writeFileSync(PROPOSAL, JSON.stringify({ schema: 'hearthrise.formula-proposal/1', grounds: out }, null, 1) + '\n');
    console.log('\nwrote ' + PROPOSAL);
  }
  if (argv.includes('--check')) {
    if (drift) { console.error('\ngen-ground-stats --check: RED, ' + drift + ' row(s) are not the formula\'s'); process.exit(1); }
    console.log('\ngen-ground-stats --check: green, every row is the formula\'s');
  }
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
