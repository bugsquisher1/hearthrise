#!/usr/bin/env node
// tools/balance-program/redesign/imbue/sum.mjs — THE READINGS of run.sh's reports (systems, lane/imbue-engine, 2026-11-27; 21 section 3.8
// I3 and section 11.4).
//
//   node tools/balance-program/redesign/imbue/sum.mjs
//
// Each set of three against the same four wearing nothing, on the same seeds: the held step's paired delta and PACE STEPS (the paired
// delta of the held pace, v1-climb payX from hour 4, %, over the pace one held step buys on the report's ground, signature-depth/pace-step.mjs), each a
// mean with its standard error; I3's bar is a held move of 0.4 or more (21 3.8) and the designer's 6 +- 2 pace steps on Krell's Hold (11.4).
// Beside them what the set did: damage dealt a second by seat, the share of the damage taken that heal spells and leech covered (sustain
// spellPm: a Life Leech's heal is the hero's own, healIn.self), Level XP an hour, deaths. Prints markdown. Exit 0 printed · 2 a report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* (the pace a held step buys on the report's own ground: signature-depth/pace-step.mjs, lane/pace-step-per-ground) */
import { paceStepPct } from '../signature-depth/pace-step.mjs';
const PAIRS = [
  ['I3 Krell\'s Hold L97: Brute Edge, Fire Ward, Life Leech (im-krell-fire)', 'k-plain', 'k-fire'],
  ['Muster Barrows L60: Brute Edge, Fire Ward, Mana Leech (im-muster-fire)', 'm-plain', 'm-fire'],
];
const cellOf = (name) => {
  const f = join(HERE, name + '.json');
  if (!existsSync(f)) return null;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return { ground: r.ground, ...Object.values(r.cells)[0] };
};
const stats = (d) => {
  if (!d.length) return null;
  const m = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, d.length - 1));
  return { m, se: sd / Math.sqrt(d.length), n: d.length };
};
const zip = (a, b, f) => { const d = []; a.forEach((x, i) => { const y = b[i]; if (Number.isFinite(x) && Number.isFinite(y) && f(x, y) !== null) d.push(f(x, y)); }); return d; };
const heldOf = (p, s) => stats(zip(p.held.perSeed, s.held.perSeed, (x, y) => y - x));
const paceOf = (p, s) => {
  const k = paceStepPct(p.ground, p.seats.length);
  if (typeof k !== 'number') { console.error('imbue sum: ' + p.ground + ' has no measured pace step (signature-depth/pace-step.mjs)'); process.exit(2); }
  return p.payX.perSeed.length !== p.seedsRead || s.payX.perSeed.length !== s.seedsRead ? null
    : stats(zip(p.payX.perSeed, s.payX.perSeed, (x, y) => (x > 0 && y > 0 ? ((y / x - 1) * 100) / k : null)));
};
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
const show = (d) => (d ? sgn(d.m) + ' (' + d.se.toFixed(1) + ', ' + d.n + ')' : 'no hold');
const pct = (a, b) => (b > 0 ? sgn((a / b - 1) * 100) + '%' : 'n/a');

let missing = 0;
console.log('| Set | Plain held | Held delta (se, seeds) | Pace steps (se, seeds) | DPS by seat, plain -> set | Spell+leech share of damage taken | Level XP/h | Deaths |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [label, a, b] of PAIRS) {
  const p = cellOf(a), s = cellOf(b);
  if (!p || !s) { missing++; console.log('| ' + label + ' | owed |||||||'); continue; }
  const dps = p.seats.map((x, i) => x.style + ' ' + x.dps + ' -> ' + (s.seats[i] && s.seats[i].dps)).join(', ');
  const spell = (c) => (c.sustain ? c.sustain.spellPm / 10 : null);
  console.log('| ' + [label, p.held.mean.toFixed(1), show(heldOf(p, s)), show(paceOf(p, s)), dps,
    spell(p) + '% -> ' + spell(s) + '%', pct(s.xpPerHeroH, p.xpPerHeroH), p.deaths + ' / ' + s.deaths].join(' | ') + ' |');
}
process.exit(missing === PAIRS.length ? 2 : 0);
