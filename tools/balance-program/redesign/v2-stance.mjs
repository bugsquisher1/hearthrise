#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/v2-stance.mjs — V2's READING OF A V1 PROBE: is the stance a real choice (lane/v1-climb V1.1, 2026-11-22).
//
//   node tools/balance-program/redesign/v2-stance.mjs --day <raw.json> [--session <raw.json>] [--json <file>]
//
// docs/design/redesign/05-roadmap.md V2: "Bold does not beat Steady when left alone for a full day", counting the death cost, and Bold
// should beat Steady over a short watched session. The raw files are v1-climb.mjs --raw dumps (every seed's heroes: Level XP gained, hours
// hunted, hours offered, deaths). No engine run here: this is arithmetic on what the engine answered.
//
// THE UNIT, A REFERENCE HOUR. Depth pay on today's monster rows is not yet derived from the hours table (wave 1), so raw XP an hour is
// inflated against what a death takes. Every gain is therefore read in hours of the reference company's progress: 04 section 1 defines the
// reference company as the four on Steady, so Steady's Level XP a hunted hero-hour over the full DAY (same ground and Level) is one
// reference hour. A death costs the ruled 6% of Level XP in reference hours (tools/balance-program/standards.mjs DEATH_COST.hoursUnblessed,
// linear between its points), cut by three Blessings (blessedShareAt), and the same again in combat skill (time parity, 04 section 4);
// the hours a dead hero no longer hunted are already in the hours offered.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const { DEATH_COST, blessedShareAt } = await import(pathToFileURL(join(ROOT, 'tools/balance-program/standards.mjs')).href);
const read = (f) => (f ? JSON.parse(readFileSync(f, 'utf8')) : null);
const DAY = read(arg('day')), SESSION = read(arg('session'));
if (!DAY) { console.error('v2-stance: --day <raw.json> is required'); process.exit(2); }

/* the ruled death cost at Level L, in reference hours, unblessed (linear between DEATH_COST's points) */
function deathHours(L) {
  const pts = Object.entries(DEATH_COST.hoursUnblessed).map(([l, h]) => [Number(l), h]).sort((a, b) => a[0] - b[0]);
  if (L <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) { const [l0, h0] = pts[i - 1], [l1, h1] = pts[i]; return h0 + ((h1 - h0) * (L - l0)) / (l1 - l0); }
  return pts[pts.length - 1][1];
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const se = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length) : 0; };
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);

/* seeds of one cell in a raw dump: { cell id: [seed rows] } */
function cellsOf(raw) {
  const out = {};
  for (const [id, o] of Object.entries(raw)) { const cell = id.split('#')[0]; (out[cell] = out[cell] || []).push(o); }
  return out;
}
const day = cellsOf(DAY), session = SESSION ? cellsOf(SESSION) : {};

/* Steady's day: one reference hour = its Level XP a hunted hero-hour */
function refRate(variant) {
  const seeds = day[variant + ':steady'] || [];
  let xp = 0, h = 0;
  for (const o of seeds) for (const hero of o.heroes) { xp += hero.levelXp; h += hero.hours; }
  return h > 0 ? xp / h : null;
}
/* one cell's reading: per seed, the reference hours gained, less deaths, a hero-hour offered */
function reading(seeds, ref) {
  const L = seeds[0].heroes[0].level, cost = deathHours(L) * (blessedShareAt(L, 3) ?? 1);
  const net = [], netSkill = [], gross = [];
  let deaths = 0, wipes = 0, offered = 0;
  for (const o of seeds) {
    const wall = o.heroes.reduce((a, h) => a + h.wallHours, 0), got = o.heroes.reduce((a, h) => a + h.levelXp, 0) / ref;
    const d = o.heroes.reduce((a, h) => a + h.deaths, 0);
    deaths += d; offered += wall / o.heroes.length; if (o.heroes.every((h) => h.ended && h.ended.died)) wipes++;
    gross.push(got / wall); net.push((got - d * cost) / wall); netSkill.push((got - 2 * d * cost) / wall);
  }
  return { L, deathCostH: r2(cost), seeds: seeds.length, deathsPerDay: r2((deaths / offered) * 12), wipesPerDay: r2((wipes / offered) * 12), deaths, wipes,
    gross: r2(mean(gross)), net: r2(mean(net)), netSe: r2(se(net)), netWithSkill: r2(mean(netSkill)) };
}

const report = { unit: 'reference hours (Steady\'s day Level XP a hunted hero-hour) a hero-hour offered', rows: [] };
for (const variant of [...new Set(Object.keys(day).map((c) => c.split(':')[0]))]) {
  const ref = refRate(variant);
  if (!ref) continue;
  for (const [label, src] of [['day', day], ['session', session]]) {
    const st = src[variant + ':steady'], bo = src[variant + ':bold'];
    if (!st || !bo) continue;
    const s = reading(st, ref), b = reading(bo, ref);
    report.rows.push({ variant, session: label, hours: st[0].heroes[0].wallHours, steady: s, bold: b, boldOverSteady: r2(b.net / s.net), boldOverSteadyWithSkill: r2(b.netWithSkill / s.netWithSkill) });
  }
}
console.log('V2 reading (unit: ' + report.unit + '; a death costs the ruled 6% in reference hours, three Blessings, and the same again in skill)');
console.log('cell      session  h    Steady net (se)  deaths/day  wipes/day | Bold gross  net (se)     deaths/day  wipes/day | Bold/Steady  with skill');
for (const r of report.rows) {
  console.log(r.variant.padEnd(9) + ' ' + r.session.padEnd(8) + String(r.hours).padStart(3) + '  ' + (r.steady.net + ' (' + r.steady.netSe + ')').padEnd(15) + String(r.steady.deathsPerDay).padStart(10) + String(r.steady.wipesPerDay).padStart(11)
    + ' | ' + String(r.bold.gross).padStart(10) + '  ' + (r.bold.net + ' (' + r.bold.netSe + ')').padEnd(12) + String(r.bold.deathsPerDay).padStart(10) + String(r.bold.wipesPerDay).padStart(11)
    + ' | ' + String(r.boldOverSteady).padStart(11) + String(r.boldOverSteadyWithSkill).padStart(12));
}
const jf = arg('json');
if (jf) writeFileSync(jf, JSON.stringify(report, null, 1) + '\n');
