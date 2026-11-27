#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/sum.mjs — THE READINGS from run.sh's and batch2.sh's reports (systems, lane/signatures-sample,
// lane/signatures-batch-2, 2026-11-26).
//
//   node tools/balance-program/redesign/signature-depth/sum.mjs            the sample (run.sh)
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 2  batch 2 (batch2.sh): the size bar and the spread bar a row
//
// For each Signature: its four with none against the same four wearing it, on the same seeds. The held step's paired delta (mean and its
// standard error over the seeds), and Level XP, coin and kills a hero-hour as a share of the plain four's. Batch 2 reads each row on its
// best cell and its second ground, and the verdicts 15 "Decision: how a Signature stays inside the gear slice" rules: the size bar (held
// delta 10 +- 3 on the best cell, se at most 3) and the spread bar (the second ground, standing for the scale grounds that do not suit it,
// at most half the best). A report not yet played prints as owed. Prints markdown tables.
// Exit 0 printed · 2 a sample report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BATCH = process.argv.includes('--batch') ? process.argv[process.argv.indexOf('--batch') + 1] : '1';
const PAIRS = [
  ['Cairn Belt (tank)', 'Muster Barrows', 'muster-tank', 'muster-cairn-belt'],
  ['Barrow Knight\'s Blade (sword)', 'Muster Barrows', 'muster-sword', 'muster-blade'],
  ['Lurcher\'s Collar (bow)', 'Pyre Field', 'pyre-mixed', 'pyre-collar'],
  ['The Wood Book (mage)', 'Muster Barrows', 'muster-mixed', 'muster-wood-book'],
  ['Brewer\'s Apron (healer)', 'Muster Barrows', 'muster-mixed', 'muster-apron'],
];
/* batch 2: [name, [best ground, plain, worn], [second ground, plain, worn]] */
const ROWS2 = [
  /* (the tank's one ground in equilibrium with room is Muster: its four sits at the top of the Ford, Pyre and the Bone Wing and never falls
     back on Krell's, so a tank row's second reading is its home's pinned one or Krell's unsettled one, batch2.sh) */
  ['#1 Bannerman\'s Pavise (tank)', ['Muster Barrows', 'b2-muster-tank', 'b2-muster-pavise'], ['Hask\'s Ford (pinned)', 'b2-ford-tank', 'b2-ford-pavise']],
  ['#2 Ossuary Helm (tank, + Frost Slam)', ['Muster Barrows', 'b2-muster-tank-slam', 'b2-muster-helm'], ['Krell\'s Hold (unsettled)', 'b2-krell-tank-slam', 'b2-krell-helm']],
  ['#3 Grave Guard\'s Mail (tank, + Shelter)', ['Muster Barrows', 'b2-muster-tank-shelter', 'b2-muster-mail'], ['(none: pinned or unsettled)', 'b2-none', 'b2-none']],
  ['#4 Charred Sabre (sword)', ['Pyre Field', 'b2-pyre-sword', 'b2-pyre-sabre'], ['Muster Barrows', 'b2-muster-sword', 'b2-muster-sabre']],
  ['#5 Pikeman\'s Gauntlets (sword)', ['Muster Barrows', 'b2-muster-sword', 'b2-muster-gauntlets'], ['Pyre Field', 'b2-pyre-sword', 'b2-pyre-gauntlets']],
  ['#7 Floodwater Hatchets (axes)', ['Flooded Wing', 'b2-flood-axes', 'b2-flood-hatchets'], ['Muster Barrows', 'b2-muster-axes', 'b2-muster-hatchets']],
  ['#9 Lurcher\'s Collar (bow)', ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-collar'], ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-collar']],
  ['#10 Coal Runner\'s Bow (bow)', ['Ox Road', 'b2-ox-mixed', 'b2-ox-coalbow'], ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-coalbow']],
  ['#11 Provost\'s Longbow (bow)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-longbow'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-longbow']],
  ['#12 Wyvern Barb Crossbow (crossbow)', ['Wyvern Roost', 'b2-roost-crossbow', 'b2-roost-barb'], ['Pyre Field', 'b2-pyre-crossbow', 'b2-pyre-barb']],
  ['#13 Hall Fire Wand (mage)', ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-wand'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-wand']],
  ['#15 Catacomb Shroud (mage)', ['Bone Wing', 'b2-bone-mixed', 'b2-bone-shroud'], ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-shroud']],
  /* (the mage takes 0.1% of the damage on Muster and 12% on Pyre Field: its barrier breaks only where it is hit) */
  ['#16 Lamplighter\'s Robe (mage)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-robe'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-robe']],
  /* (a low-health rule's best cell is Bold: Steady falls back at 25%, so a hero is seldom under 30% or 20%; its Steady reading is the second) */
  ['#17 Bargeman\'s Pole (healer)', ['The Slake, Bold', 'b2-slake-mixed-bold', 'b2-slake-pole-bold'], ['The Slake, Steady', 'b2-slake-mixed', 'b2-slake-pole']],
  ['#21 Drover\'s Hat (healer)', ['Ox Road', 'b2-ox-mixed', 'b2-ox-hat'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-hat']],
  ['#23 Ferry Pennies (tank)', ['Muster Barrows, Bold', 'b2-muster-tank-bold', 'b2-muster-pennies-bold'], ['Muster Barrows, Steady', 'b2-muster-tank', 'b2-muster-pennies']],
];
/* (the home ground pinned: the tank four at Hask's Ford's top; printed under the table as the reading of why the tank reads elsewhere) */
const PINNED = [['#1 Bannerman\'s Pavise on Hask\'s Ford, its home', 'b2-ford-tank', 'b2-ford-pavise', 655]];
const cellOf = (name, need) => {
  const f = join(HERE, name + '.json');
  if (!existsSync(f)) { if (need) { console.error('sum: no report ' + f); process.exit(2); } return null; }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return Object.values(r.cells)[0];
};
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
/* the paired held delta of `s` over `p`: mean and standard error over the seeds both read (a seed whose four never held reads nothing) */
function paired(p, s) {
  const d = [];
  p.held.perSeed.forEach((x, i) => { const y = s.held.perSeed[i]; if (Number.isFinite(x) && Number.isFinite(y)) d.push(y - x); });
  if (!d.length) return null;
  const m = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, d.length - 1));
  return { m, se: sd / Math.sqrt(d.length), n: d.length };
}

if (BATCH !== '2') {
  console.log('| Signature | Ground | Plain held | With it | Held delta (se) | Level XP/h | Coin/h | Kills/h | Deaths |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [name, ground, a, b] of PAIRS) {
    const p = cellOf(a, true), s = cellOf(b, true), d = paired(p, s);
    console.log('| ' + [name, ground, p.held.mean.toFixed(1), s.held.mean.toFixed(1), sgn(d.m) + ' (' + d.se.toFixed(1) + ')',
      pct(s.xpPerHeroH, p.xpPerHeroH), pct(s.gold.coinPerHeroH.mean, p.gold.coinPerHeroH.mean), pct(s.killsPerH, p.killsPerH), p.deaths + ' / ' + s.deaths].join(' | ') + ' |');
  }
  process.exit(0);
}

/* batch 2: one line a row, both cells, the two bars */
console.log('| Signature | Best cell | Plain held | Held delta (se, seeds) | Level XP/h | Second ground | Held delta (se) | Size bar (10 +- 3, se <= 3) | Spread bar (second <= half the best) |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [name, best, other] of ROWS2) {
  const read = ([g, a, b]) => { const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, d: paired(p, s) } : { g, owed: true }; };
  const B = read(best), O = read(other);
  const show = (x) => (x.owed ? 'owed' : x.d ? sgn(x.d.m) + ' (' + x.d.se.toFixed(1) + (x === B ? ', ' + x.d.n : '') + ')' : 'no hold');
  const size = B.owed || !B.d ? 'owed' : B.d.se > 3 ? 'se ' + B.d.se.toFixed(1) + ' over 3: more seeds' : B.d.m > 13 ? 'OVER (cut its number)' : B.d.m < 7 ? 'UNDER (raise or reshape)' : 'in band';
  const spread = B.owed || O.owed || !B.d || !O.d ? 'owed' : O.d.m <= B.d.m / 2 ? 'holds' : 'FAILS (big everywhere: reshape)';
  console.log('| ' + [name, B.g, B.owed ? 'owed' : B.p.held.mean.toFixed(1), show(B), B.owed ? '' : pct(B.s.xpPerHeroH, B.p.xpPerHeroH), O.g, show(O), size, spread].join(' | ') + ' |');
}
for (const [name, a, b, top] of PINNED) {
  const p = cellOf(a), s = cellOf(b), d = p && s ? paired(p, s) : null;
  if (d) console.log('\npinned: ' + name + ': the plain four holds ' + p.held.mean.toFixed(1) + ' of the ground\'s top ' + top + ', the Signature ' + sgn(d.m) + ' (' + d.se.toFixed(1) + ')');
}
