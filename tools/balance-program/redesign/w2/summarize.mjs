#!/usr/bin/env node
// tools/balance-program/redesign/w2/summarize.mjs — WAVE 2 ROLES AND ROWS, MEASURED (lane/w2-roles-rows): one table from the probe's
// reports in this folder (v1-climb.mjs --styles <lineup> --only base:steady, on the tree = roles on, and --candidate roles-off), Muster
// Barrows, Level 60, MID kits, Steady, 8 seeds x 12 h, the held step read from hour 6.
//
//   node tools/balance-program/redesign/w2/summarize.mjs [> summary.txt]
//
// Per lineup: the held step with roles on and off (mean, sd over seeds; paired on the same dice: the move), deaths, the pay multiple,
// and each seat's share of the damage the four took. Exit 0 printed · 2 no reports.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8')).cells['base:steady'];
const lineups = readdirSync(HERE).filter((f) => /^on-.*\.json$/.test(f)).map((f) => f.slice(3, -5));
if (!lineups.length) { console.error('no on-*.json reports here'); process.exit(2); }
const BAND = { floor: 480, ref: 590, top: 710 };
const r1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };
console.log('WAVE 2: MONSTER ROLES AND ROWS on Muster Barrows (band ' + BAND.floor + ' / ref ' + BAND.ref + ' / top ' + BAND.top + '), Level 60, MID kits, Steady, 8 seeds x 12 h, held from hour 6');
console.log('roles: Pikeman swarm (front row, least crowded), Wight stalker (least max HP, held half a Challenge, blow 400 permille), Knight and Hask brute (front row)\n');
console.log('lineup                    held ON (sd)    held OFF (sd)   move (paired se)   deaths on/off   pay on/off    damage share ON | OFF');
const rows = [];
for (const id of lineups) {
  let off = null;
  const on = read('on-' + id + '.json');
  try { off = read('off-' + id + '.json'); } catch { /* no off report yet */ }
  const d = off ? on.held.perSeed.map((x, i) => (x !== null && off.held.perSeed[i] !== null ? x - off.held.perSeed[i] : null)).filter((x) => x !== null) : [];
  const share = (c) => c.takenShare.map((t) => t.style + ' ' + Math.round(t.mean * 100) + '%').join(' ');
  rows.push({ id, on: on.held.mean });
  console.log(id.padEnd(25) + (on.held.mean + ' (' + on.held.sd + ')').padEnd(16) + (off ? off.held.mean + ' (' + off.held.sd + ')' : '-').padEnd(16)
    + (d.length ? r1(mean(d)) + ' (' + r1(sd(d) / Math.sqrt(d.length)) + ')' : '-').padEnd(19) + (on.deaths + ' / ' + (off ? off.deaths : '-')).padEnd(16)
    + (on.payX.mean + 'x / ' + (off ? off.payX.mean + 'x' : '-')).padEnd(14) + share(on) + ' | ' + (off ? share(off) : '-'));
}
const on = rows.map((r) => r.on).sort((a, b) => a - b);
console.log('\nspread of the held step across lineups: roles ON ' + r1(on[on.length - 1] - on[0]) + ' steps');
